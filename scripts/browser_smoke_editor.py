"""Validate persisted draft behavior in a disposable browser profile."""

import re

from playwright.sync_api import expect


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
