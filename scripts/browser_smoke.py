"""Exercise the production build on local Chromium, Firefox, and WebKit."""

import argparse
import base64
import functools
import http.server
import json
import pathlib
import re
import shutil
import tempfile
import threading

from playwright.sync_api import Error, expect, sync_playwright

from browser_smoke_editor import check_draft_recovery, check_invalid_draft, check_preview_seek
from browser_smoke_media import inspect_download, make_fixture

PROJECT_PATH = "Screen-Recorder-React-JS-Frontend"

SYNTHETIC_CAPTURE = """
(() => {
    const media = navigator.mediaDevices;
    window.originalCaptureSupport = {
        display: typeof media?.getDisplayMedia === 'function',
        cameraAndMic: typeof media?.getUserMedia === 'function',
        canvasStream: typeof HTMLCanvasElement.prototype.captureStream === 'function',
        webm: typeof MediaRecorder === 'function' && MediaRecorder.isTypeSupported('video/webm'),
        videoEncoder: typeof VideoEncoder === 'function',
        audioEncoder: typeof AudioEncoder === 'function',
    };
    if (!media) return;
    media.getDisplayMedia = async () => {
        if (window.rejectCapture) throw new DOMException('Synthetic denial', 'NotAllowedError');
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d');
        let frame = 0;
        const draw = () => {
            context.fillStyle = 'hsl(' + (frame * 5 % 360) + ', 80%, 50%)';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.fillStyle = 'white';
            context.fillRect(frame++ % 250, 55, 42, 42);
        };
        draw();
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        window.smokeCaptureTrack = track;
        const timer = setInterval(() => {
            if (track.readyState === 'ended') clearInterval(timer);
            else draw();
        }, 33);
        return stream;
    };
})();
"""


class StaticPreview(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.server.offline.is_set():
            self.close_connection = True
            return
        super().do_GET()

    def log_message(self, _message, *_args):
        return


def capture_and_recover(browser, url, worker_file=None):
    context = browser.new_context(accept_downloads=True)
    context.add_init_script(SYNTHETIC_CAPTURE)
    try:
        page = context.new_page()
        page.goto(url)
        start = page.get_by_role("button", name="Start Recording", exact=True)
        expect(start).to_be_visible()
        capability = page.evaluate("originalCaptureSupport")
        if not capability["webm"] or not capability["canvasStream"] or not page.evaluate("!!navigator.mediaDevices"):
            return {"capabilities": capability, "capture": "Synthetic WebM capture prerequisites unavailable"}

        if worker_file:
            page.wait_for_function("!!navigator.serviceWorker.controller")
        page.evaluate("window.rejectCapture = true")
        start.click()
        expect(page.get_by_text("Permission denied. Please allow screen sharing to record.")).to_be_visible()
        expect(start).to_be_enabled()
        page.evaluate("window.rejectCapture = false")
        start.click()
        stop = page.get_by_role("button", name="Stop", exact=True)
        expect(stop).to_be_visible()
        update_button = page.get_by_role("button", name="Update and reload")
        if worker_file:
            original_worker = worker_file.read_bytes()
            try:
                worker_file.write_bytes(original_worker + b"\n// Browser smoke update.\n")
                page.evaluate("() => navigator.serviceWorker.getRegistration().then(registration => registration.update())")
                expect(update_button).to_be_disabled()
            finally:
                worker_file.write_bytes(original_worker)
        for key in ("Pause", "Resume"):
            page.get_by_role("button", name=key, exact=True).click()
        page.wait_for_function("window.smokeCaptureTrack?.readyState === 'live'")
        # The fixture must produce video before MediaRecorder can emit a file.
        page.get_by_text("00:01", exact=False).first.wait_for(timeout=8_000)
        stop.click()
        expect(page.get_by_role("button", name="Record New")).to_be_visible()
        assert page.evaluate("smokeCaptureTrack.readyState") == "ended"

        with page.expect_download() as event:
            page.get_by_role("link", name="Download Original (WebM)").click()
        captured = inspect_download(event.value)
        check_draft_recovery(page, update_button if worker_file else None)
        check_invalid_draft(page)
        check_preview_seek(page)
        expect(page.get_by_role("link", name="Download Original (WebM)")).to_be_visible()
        return {"capabilities": capability, "capture": captured, "draft_recovery_and_manual_seek": "passed",
                "update_during_capture": "blocked as expected" if worker_file else "not run"}
    finally:
        context.close()


def convert_fixture(page, fixture, audio, drop=False):
    if drop:
        encoded = base64.b64encode(fixture.read_bytes()).decode("ascii")
        page.get_by_role("button", name="Drop a video file here, or click to browse").evaluate(
            """(target, data) => {
                const bytes = Uint8Array.from(atob(data.encoded), value => value.charCodeAt(0));
                const transfer = new DataTransfer();
                transfer.items.add(new File([bytes], data.name));
                target.dispatchEvent(new DragEvent('drop', {bubbles: true, dataTransfer: transfer}));
            }""", {"encoded": encoded, "name": fixture.name},
        )
    else:
        page.locator('input[type="file"]').set_input_files(fixture)
    page.get_by_role("button", name="Convert to MP4").click()
    download = page.locator("a[download]")
    retry = page.get_by_role("button", name="Convert to MP4")
    expect(download.or_(retry).first).to_be_visible(timeout=30_000)
    if not download.is_visible():
        assert not page.get_by_text("Conversion complete!").is_visible()
        error = page.locator("main").get_by_text(
            re.compile(r"^(Conversion failed|The audio could not be decoded|Audio encoding failed|This file could not be read|This browser has no compatible encoder)"),
        )
        expect(error).to_be_visible()
        return {"result": "rejected", "message": error.inner_text()}
    label = download.inner_text().strip().upper()
    with page.expect_download() as event:
        download.click()
    info = inspect_download(event.value, audio=audio, stage=fixture.name)
    assert label == "DOWNLOAD " + info["container"].upper(), (label, info)
    return info


def check_manifest(page, url):
    result = page.evaluate("""async () => {
        const link = document.querySelector('link[rel="manifest"]');
        const manifest = await fetch(link.href).then(response => response.json());
        const loadIcon = url => new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
            image.onerror = reject;
            image.src = url;
        });
        const icons = await Promise.all(manifest.icons.map(async icon => ({
            purpose: icon.purpose,
            dimensions: await loadIcon(new URL(icon.src, link.href)),
        })));
        const touch = document.querySelector('link[rel="apple-touch-icon"]');
        return {
            display: manifest.display,
            id: new URL(manifest.id, new URL(manifest.start_url, link.href)).href,
            scope: new URL(manifest.scope, link.href).href,
            start: new URL(manifest.start_url, link.href).href,
            icons, touch: await loadIcon(touch.href),
        };
    }""")
    assert result["display"] == "standalone"
    assert result["id"] == result["start"] == result["scope"] == url, result
    assert {"purpose": "any", "dimensions": [192, 192]} in result["icons"]
    assert {"purpose": "any", "dimensions": [512, 512]} in result["icons"]
    assert {"purpose": "maskable", "dimensions": [512, 512]} in result["icons"]
    assert result["touch"] == [180, 180]


def converter_and_offline(browser, url, fixtures, offline):
    context = browser.new_context(accept_downloads=True, service_workers="allow")
    try:
        page = context.new_page()
        page.goto(url + "?page=converter")
        expect(page.locator('input[type="file"]')).to_be_attached()
        codec = page.get_by_text("H.264 Ready", exact=True).or_(
            page.get_by_text("VP8 Ready", exact=True)
        ).or_(page.get_by_text("Engine Error", exact=True))
        expect(codec).to_be_visible(timeout=15_000)
        status = codec.inner_text()
        outcomes = {}
        for name, fixture in fixtures.items():
            page.reload()
            has_audio = name in {"with_audio", "aac"}
            outcomes[name] = convert_fixture(page, fixture, audio=has_audio, drop=name == "with_audio")
            must_download = (name == "silent" and status != "Engine Error") or (has_audio and status == "H.264 Ready")
            if must_download:
                assert "container" in outcomes[name], outcomes[name]
            if name == "damaged":
                assert outcomes[name]["result"] == "rejected", outcomes[name]
        page.wait_for_function("!!navigator.serviceWorker.controller")
        check_manifest(page, url)
        offline.set()
        try:
            page.reload()
            expect(page.locator('input[type="file"]')).to_be_attached()
            fresh = browser.new_context()
            try:
                try:
                    fresh.new_page().goto(url, timeout=3_000)
                except Error:
                    pass
                else:
                    raise AssertionError("First visit loaded after the origin was disconnected")
            finally:
                fresh.close()
        finally:
            offline.clear()
        return {"engine": status, "conversion": outcomes, "manifest": "passed", "offline_reload": "passed"}
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser", nargs="+", choices=("chromium", "firefox", "webkit"),
                        default=("chromium", "firefox", "webkit"))
    parser.add_argument("--build", type=pathlib.Path, default=pathlib.Path("dist"))
    args = parser.parse_args()
    if not (args.build / "sw.js").is_file():
        parser.error("Run npm run build before testing the production preview.")

    with tempfile.TemporaryDirectory() as path, sync_playwright() as playwright:
        directory = pathlib.Path(path)
        public = directory / "public"
        shutil.copytree(args.build, public / PROJECT_PATH)
        fixtures = {
            "silent": make_fixture(directory, "silent.webm", False),
            "with_audio": make_fixture(directory, "with-audio.webm", True),
            "aac": make_fixture(directory, "with-aac.mp4", True),
        }
        damaged = directory / "damaged.webm"
        damaged.write_bytes(b"Invalid WebM fixture")
        fixtures["damaged"] = damaged
        handler = functools.partial(StaticPreview, directory=str(public))
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            server.offline = threading.Event()
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                port = server.server_address[1]
                url = f"http://127.0.0.1:{port}/{PROJECT_PATH}/"
                failed = False
                for engine in args.browser:
                    try:
                        with getattr(playwright, engine).launch() as browser:
                            outcome = {"browser": engine, "version": browser.version}
                            for stage, run in (
                                ("capture_and_recovery", lambda: capture_and_recover(
                                    browser, url, public / PROJECT_PATH / "sw.js" if engine == "chromium" else None,
                                )),
                                ("converter_and_offline", lambda: converter_and_offline(browser, url, fixtures, server.offline)),
                            ):
                                try:
                                    outcome.update(run())
                                except Exception as error:
                                    outcome[stage + "_error"] = str(error)
                                    failed = True
                            print(json.dumps(outcome, ensure_ascii=True), flush=True)
                    except Exception as error:
                        print(json.dumps({"browser": engine, "error": str(error)}), flush=True)
                        failed = True
                return int(failed)
            finally:
                server.shutdown()
                worker.join()


if __name__ == "__main__":
    raise SystemExit(main())
