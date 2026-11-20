"""Validate persisted draft behavior in a disposable browser profile."""

import re

from playwright.sync_api import expect

from browser_smoke_media import audio_packet_duration, inspect_mp3


def check_recorded_mp3(browser, url, synthetic_capture):
    context = browser.new_context(accept_downloads=True, service_workers="block")
    context.add_init_script(synthetic_capture + """
    (() => {
        const capture = navigator.mediaDevices.getDisplayMedia;
        navigator.mediaDevices.getDisplayMedia = async () => {
            const audio = new AudioContext();
            const output = audio.createMediaStreamDestination();
            const oscillator = audio.createOscillator();
            oscillator.connect(output);
            oscillator.start();
            const stream = await capture();
            stream.addTrack(output.stream.getAudioTracks()[0]);
            window.smokeAudioContext = audio;
            return stream;
        };
    })();
    """)
    try:
        page = context.new_page()
        page.goto(url)
        page.get_by_role("button", name="Start Recording", exact=True).click()
        stop = page.get_by_role("button", name="Stop", exact=True)
        page.get_by_text("00:03", exact=True).wait_for(timeout=10_000)
        stop.click()
        expect(page.get_by_role("button", name="Record New")).to_be_visible()
        page.evaluate("smokeAudioContext.close()")
        with page.expect_download() as original:
            page.get_by_role("link", name="Download Original (WebM)").click()
        recorded_audio_duration = audio_packet_duration(original.value.path())
        assert recorded_audio_duration > 1.5, recorded_audio_duration

        clip = page.locator("button[data-timeline-clip]").first
        clip.focus()
        original_title = clip.get_attribute("title")
        for _ in range(45):
            page.keyboard.press("Alt+ArrowRight")
        trimmed_title = clip.get_attribute("title")
        assert trimmed_title != original_title, (original_title, trimmed_title)

        export = page.get_by_role("button", name="Export MP3 (Whole Recording, 128 kbps)", exact=True)
        link = page.get_by_role("link", name="Download MP3", exact=True)
        # Hold the first lazy load to exercise cancellation before encoding starts.
        held = []

        def hold_chunk(route):
            held.append(route)

        page.route("**/assets/mp3ExportService-*.js", hold_chunk)
        with page.expect_request("**/assets/mp3ExportService-*.js"):
            export.click()
        expect(page.get_by_role("dialog")).to_contain_text("Exporting to MP3")
        page.keyboard.press("Escape")
        expect(export).to_be_focused()
        expect(link).to_have_count(0)
        held[0].continue_()

        export.click()
        expect(link).to_be_visible(timeout=30_000)
        mime_type = link.evaluate("async link => (await fetch(link.href)).headers.get('Content-Type')")
        assert mime_type == "audio/mpeg", mime_type
        with page.expect_download() as ready:
            link.click()
        result = inspect_mp3(ready.value, expected_duration=recorded_audio_duration)
        expect(clip).to_have_attribute("title", trimmed_title)
        page.get_by_role("button", name="Export another version").click()
        expect(page.get_by_role("button", name=re.compile(r"^Export Trimmed"))).to_be_enabled()
        return {"recorded_mp3": result, "recorded_audio_duration": recorded_audio_duration,
                "recorded_mp3_cancel_and_retry": "passed"}
    finally:
        context.close()


def check_draft_recovery(page, update_button=None):
    clip = page.locator("button[data-timeline-clip]").first
    expect(clip).to_be_visible()
    clip.focus()
    original = clip.get_attribute("title")
    for _ in range(5):
        page.keyboard.press("Alt+ArrowRight")
    trimmed = clip.get_attribute("title")
    assert trimmed != original, (original, trimmed)
    if update_button:
        expect(update_button).to_be_enabled()
        with page.expect_navigation(wait_until="domcontentloaded"):
            update_button.click()
    else:
        page.reload()
    expect(page.get_by_role("button", name="Record New")).to_be_visible()
    expect(clip).to_have_attribute("title", trimmed)


def check_invalid_draft(page):
    invalid = "{invalid-draft"
    key = page.evaluate("""invalid => {
        const keys = Object.keys(localStorage).filter(key => key.startsWith('screenclip.editor-draft.v1:'));
        if (keys.length !== 1) throw new Error('Expected exactly one saved recording draft');
        localStorage.setItem(keys[0], invalid);
        return keys[0];
    }""", invalid)
    page.reload()
    warning = page.get_by_role("alert").filter(has_text="The saved edit draft could not be read")
    expect(warning).to_be_visible()
    open_advanced = page.get_by_role("button", name=re.compile(r"Advanced"))
    if open_advanced.is_visible():
        open_advanced.click()
    trimmed = page.get_by_role("button", name=re.compile(r"^Export Trimmed"))
    expect(trimmed).to_be_disabled()
    expect(page.get_by_role("button", name="Export Full Video (No Trim)")).to_be_enabled()
    expect(page.get_by_role("button", name=re.compile(r"^Export MP3 \(Whole Recording"))).to_be_enabled()
    expect(page.get_by_role("link", name="Download Original (WebM)")).to_be_visible()
    assert page.evaluate("key => localStorage.getItem(key)", key) == invalid
    warning.get_by_role("button", name="Reset Trim").click()
    expect(warning).to_be_hidden()
    expect(trimmed).to_be_enabled()


def check_preview_seek(page):
    duration = page.evaluate("""() => {
        const key = Object.keys(localStorage).find(key => key.startsWith('screenclip.editor-draft.v1:'));
        const draft = JSON.parse(localStorage.getItem(key));
        const duration = draft.duration;
        draft.segments = [{ start: 0, end: duration * 0.22 }, { start: duration * 0.55, end: duration * 0.9 }];
        draft.selectedIndex = 0;
        localStorage.setItem(key, JSON.stringify(draft));
        return duration;
    }""")
    page.reload()
    page.get_by_role("button", name="Preview Selection").click()
    video = page.locator("video").last
    video.evaluate("video => { video.playbackRate = 0.25; }")
    clips = page.locator("button[data-timeline-clip]")
    expect(clips).to_have_count(2)
    ruler = page.get_by_role("region", name="Timeline").locator(":scope > div > div").first
    box = ruler.bounding_box()
    assert box
    ruler.click(position={"x": box["width"] * (0.42 / 0.57), "y": 6})
    expect(clips.nth(1)).to_have_attribute("aria-pressed", "true")
    page.wait_for_function("duration => Array.from(document.querySelectorAll('video')).at(-1).currentTime >= duration * 0.74", arg=duration)
    position = video.evaluate("video => ({ time: video.currentTime, playing: !video.paused })")
    assert duration * 0.74 <= position["time"] < duration * 0.88 and position["playing"], position
