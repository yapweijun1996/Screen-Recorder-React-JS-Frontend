"""Opt-in browser check for local Whisper transcription and offline restart."""

import argparse
import functools
import http.server
import json
import math
import pathlib
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import wave

from playwright.sync_api import TimeoutError, expect, sync_playwright

from browser_smoke import PROJECT_PATH, StaticPreview

ENGLISH = "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/jfk.wav"
MANDARIN = ("https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
            "/resolve/main/test_wavs/zh.wav")
ENGLISH_REFERENCE = "and so my fellow americans ask not what your country can do for you ask what you can do for your country"
MANDARIN_REFERENCE = "\u5f00\u653e\u65f6\u95f4\u65e9\u4e0a\u4e5d\u70b9\u81f3\u4e0b\u5348\u4e94\u70b9"

SEED_RECORDING = """async ({file, duration}) => {
    const response = await fetch('../' + file);
    if (!response.ok) throw new Error('Could not load the public fixture');
    const blob = await response.blob();
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('ScreenClipProDB', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('recordings', {keyPath: 'id'});
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    try {
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('recordings', 'readwrite');
            transaction.objectStore('recordings').put({
                id: 'current_recording', recordingId: file, blob,
                mimeType: 'video/webm', duration, createdAt: Date.now(),
            });
            transaction.oncomplete = resolve;
            transaction.onabort = () => reject(transaction.error);
        });
    } finally { db.close(); }
}"""


def make_fixture(directory, public, long):
    """Alternate two public utterances with two seconds of silence per cycle."""
    english, mandarin, cycle = (directory / name for name in ("en.wav", "zh.wav", "cycle.wav"))
    for url, path in ((ENGLISH, english), (MANDARIN, mandarin)):
        with urllib.request.urlopen(url, timeout=25) as response, path.open("wb") as output:
            shutil.copyfileobj(response, output)
    ffmpeg = ["ffmpeg", "-hide_banner", "-loglevel", "error"]
    prepare = ("[0:a]aresample=16000,aformat=channel_layouts=mono[e];"
               "[1:a]aresample=16000,aformat=channel_layouts=mono[z];[e][z][2:a]concat=n=3:v=0:a=1[a]")
    subprocess.run([*ffmpeg, "-i", str(english), "-i", str(mandarin),
                    "-f", "lavfi", "-t", "2", "-i", "anullsrc=r=16000:cl=mono",
                    "-filter_complex", prepare, "-map", "[a]", str(cycle)], check=True)
    with wave.open(str(cycle), "rb") as source:
        cycle_seconds = source.getnframes() / source.getframerate()
    repeats = math.ceil(310 / cycle_seconds) if long else 1
    seconds = cycle_seconds * repeats
    video = ["-f", "lavfi", "-i", "color=c=navy:s=160x90:r=2"]
    fixtures = [("transcript-fixture.webm", 1)]
    if repeats > 1:
        fixtures.append(("transcript-long.webm", repeats))
    for file, count in fixtures:
        subprocess.run([*ffmpeg, "-stream_loop", str(count - 1), "-i", str(cycle), *video,
                        "-map", "1:v", "-map", "0:a", "-t", str(count * cycle_seconds),
                        "-c:v", "libvpx", "-c:a", "libopus", str(public / file)], check=True)
    subprocess.run([*ffmpeg, *video, "-t", "2", "-c:v", "libvpx",
                    str(public / "no-track.webm")], check=True)
    subprocess.run([*ffmpeg, *video, "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono",
                    "-t", "2", "-c:v", "libvpx", "-c:a", "libopus",
                    str(public / "silent.webm")], check=True)
    return seconds, repeats


def edit_rate(reference, recognized):
    previous = list(range(len(recognized) + 1))
    for i, expected in enumerate(reference, 1):
        current = [i]
        for j, actual in enumerate(recognized, 1):
            current.append(min(current[-1] + 1, previous[j] + 1, previous[j - 1] + (expected != actual)))
        previous = current
    return round(previous[-1] / len(reference), 3)


def read_srt(file, duration):
    text = file.read_text(encoding="utf-8-sig")
    times = re.findall(r"(\d{2,}):(\d{2}):(\d{2}),(\d{3})", text)
    seconds = [int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000 for h, m, s, ms in times]
    assert seconds and len(seconds) % 2 == 0, text[:200]
    assert all(0 <= start < end <= duration + 0.25 for start, end in zip(seconds[::2], seconds[1::2]))
    assert seconds[::2] == sorted(seconds[::2]), seconds[:20]
    content = "\n".join(line for line in text.splitlines() if "-->" not in line and not line.strip().isdigit())
    return content, len(seconds) // 2, seconds[-2]


def start_transcription(page):
    page.get_by_test_id("transcript-trigger").click()
    page.get_by_test_id("transcript-start").click()


def verify_empty_audio(page):
    for file, message in (("no-track.webm", "No usable audio was found"),
                          ("silent.webm", "No speech was detected")):
        page.evaluate(SEED_RECORDING, {"file": file, "duration": 2})
        page.reload()
        start_transcription(page)
        expect(page.get_by_text(message, exact=False)).to_be_visible(timeout=15_000)
    assert not page.evaluate("caches.keys().then(keys => keys.some(key => key.startsWith('screenclip-stt-model-')))")


def verify_small_screen_dialog(page):
    previous = page.viewport_size
    page.set_viewport_size({"width": 390, "height": 844})
    trigger = page.get_by_test_id("transcript-trigger")
    trigger.click()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible()
    bounds = dialog.bounding_box()
    assert bounds and 0 <= bounds["x"] <= bounds["x"] + bounds["width"] <= 391, bounds
    page.keyboard.press("Escape")
    expect(trigger).to_be_focused()
    assert previous
    page.set_viewport_size(previous)


def monitor_browser_memory(stop, result):
    try:
        import psutil
    except ImportError:
        return
    current = psutil.Process()
    peak = 0
    while not stop.wait(0.25):
        for child in current.children(recursive=True):
            try:
                if re.search(r"chrom|firefox", child.name(), re.I):
                    peak = max(peak, child.memory_info().rss)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        if peak:
            result["peak_browser_process_rss_mib"] = round(peak / (1024 * 1024), 1)


def verify_result(page, duration, repeats, edit, timeout_seconds):
    download = page.locator('[data-testid="transcript-download-srt"]:enabled')
    error = page.get_by_text(re.compile(r"The speech model could not|could not be decoded|No usable audio|Transcription failed|No speech was detected")).first
    try:
        download.or_(error).first.wait_for(state="visible", timeout=int(max(timeout_seconds, duration * 2) * 1000))
    except TimeoutError as exc:
        raise AssertionError(page.get_by_role("dialog").inner_text()) from exc
    assert not error.is_visible(), error.text_content()
    expect(download).to_be_enabled()
    expect(download).to_be_visible()
    if edit:
        field = page.get_by_test_id("transcript-cue-text").first
        expect(field).to_be_visible()
        field.fill("Edited public sample")
        with page.expect_download() as result:
            page.get_by_role("button", name="TXT", exact=True).click()
        assert "Edited public sample" in result.value.path().read_text(encoding="utf-8-sig")
    with page.expect_download() as result:
        download.click()
    text, total, last_start = read_srt(result.value.path(), duration)
    if edit:
        assert "Edited public sample" in text
        page.get_by_role("button", name=re.compile(r"^Jump to ")).last.click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.wait_for_function("(target) => Math.abs(document.querySelector('video[preload=metadata][aria-disabled]').currentTime - target) < 0.2", arg=last_start)
    english = re.findall(r"[a-z]+", text.lower())
    simplified = text.translate(str.maketrans("\u958b\u6642\u9593\u9ede", "\u5f00\u65f6\u95f4\u70b9"))
    mandarin = re.findall(r"[\u4e00-\u9fff]", simplified)
    result = {"cues": total, "contains_english": bool(english), "contains_mandarin": bool(mandarin)}
    if not edit:
        result.update(english_wer=edit_rate(ENGLISH_REFERENCE.split() * repeats, english),
                      mandarin_cer=edit_rate(list(MANDARIN_REFERENCE) * repeats, mandarin))
    return result


def run(browser, profile, url, duration, repeats, server, timeout_seconds):
    context = browser.launch_persistent_context(str(profile), accept_downloads=True)
    try:
        remote_requests = []
        context.on("request", lambda request: remote_requests.append((request.method, request.post_data))
                   if request.url.startswith("https://") else None)
        page = context.pages[0]
        page.on("pageerror", lambda error: print(f"Browser error: {error}", flush=True))
        page.on("console", lambda msg: print(f"Browser console: {msg.text}", flush=True)
                if msg.type == "error" else None)
        page.goto(url)
        verify_empty_audio(page)
        short_duration = duration / repeats
        page.evaluate(SEED_RECORDING, {"file": "transcript-fixture.webm", "duration": short_duration})
        page.reload()
        page.wait_for_function("!!navigator.serviceWorker.controller")
        verify_small_screen_dialog(page)
        start_transcription(page)
        cancel = page.get_by_role("button", name="Cancel", exact=True)
        start = time.perf_counter()
        cancel.click()
        expect(page.get_by_test_id("transcript-start")).to_be_enabled()
        print(json.dumps({"stage": "cancel", "seconds": round(time.perf_counter() - start, 2)}), flush=True)
        start = time.perf_counter()
        page.get_by_test_id("transcript-start").click()
        page.get_by_role("button", name="Close", exact=True).click()
        page.get_by_role("button", name="WebM Converter", exact=True).click()
        page.get_by_role("button", name="ScreenClip Pro", exact=True).click()
        page.get_by_test_id("transcript-trigger").click()
        first = verify_result(page, short_duration, 1, edit=True, timeout_seconds=timeout_seconds)
        assert all(method == "GET" and data is None for method, data in remote_requests)
        print(json.dumps({"stage": "online", "seconds": round(time.perf_counter() - start, 2), **first}), flush=True)
        if repeats > 1:
            page.evaluate(SEED_RECORDING, {"file": "transcript-long.webm", "duration": duration})
    finally:
        context.close()

    server.offline.set()
    context = browser.launch_persistent_context(str(profile), accept_downloads=True, offline=True)
    stop, memory = threading.Event(), {}
    sampler = threading.Thread(target=monitor_browser_memory, args=(stop, memory), daemon=True)
    sampler.start()
    try:
        page = context.pages[0]
        page.goto(url)
        start = time.perf_counter()
        start_transcription(page)
        second = verify_result(page, duration, repeats, edit=False, timeout_seconds=timeout_seconds)
        assert second["contains_mandarin"] and second["contains_english"], second
        print(json.dumps({"stage": "offline_restart", "seconds": round(time.perf_counter() - start, 2), **second, **memory}), flush=True)
        page.get_by_role("button", name="Clear downloaded model").click()
        page.get_by_role("button", name="Clear", exact=True).click()
        page.wait_for_function("caches.keys().then(keys => !keys.some(key => key.startsWith('screenclip-stt-model-')))")
        assert page.evaluate("caches.keys().then(keys => keys.some(key => key.startsWith('workbox-precache')))")
        page.reload()
        expect(page.get_by_test_id("transcript-trigger")).to_be_visible()
    finally:
        stop.set()
        sampler.join()
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", type=pathlib.Path, default=pathlib.Path("dist"))
    parser.add_argument("--browser", choices=("chromium", "firefox"), default="chromium")
    parser.add_argument("--long", action="store_true", help="Use a 310-second bilingual fixture.")
    parser.add_argument("--timeout-seconds", type=int, default=240, help="Minimum timeout per transcription.")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as work, sync_playwright() as playwright:
        directory = pathlib.Path(work)
        public = directory / "public"
        shutil.copytree(args.build, public / PROJECT_PATH)
        seconds, repeats = make_fixture(directory, public, args.long)
        handler = functools.partial(StaticPreview, directory=str(public))
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            server.offline = threading.Event()
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                url = f"http://127.0.0.1:{server.server_address[1]}/{PROJECT_PATH}/"
                run(getattr(playwright, args.browser), directory / "profile", url, seconds, repeats, server, args.timeout_seconds)
            finally:
                server.shutdown()
                thread.join()


if __name__ == "__main__":
    main()
