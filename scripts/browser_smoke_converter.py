"""Verify selectable output and document-lifetime conversion safeguards."""

import re

from playwright.sync_api import expect

from browser_smoke_media import inspect_download, inspect_mp3


def check_mp3(browser, url, with_audio, silent):
    context = browser.new_context(accept_downloads=True)
    try:
        page = context.new_page()
        page.goto(url + "?page=converter")
        page.locator('input[type="file"]').set_input_files(with_audio)
        mp3 = page.get_by_role("radio", name="MP3 Audio only")
        page.get_by_role("radio", name="MP4 Video").press("ArrowRight")
        expect(mp3).to_be_checked()
        convert = page.get_by_role("button", name="Convert to MP3")
        convert.click()
        link = page.get_by_role("link", name="Download MP3")
        expect(link).to_be_visible(timeout=30_000)
        with page.expect_download() as ready:
            link.click()
        output = inspect_mp3(ready.value)
        page.get_by_role("button", name="Convert another file").click()
        page.locator('input[type="file"]').set_input_files(silent)
        expect(mp3).to_be_checked()
        convert.click()
        expect(page.get_by_role("alert")).to_contain_text("This video has no audio track")
        expect(link).to_have_count(0)
        return {"mp3_output": output}
    finally:
        context.close()


def assert_reload_warning(page):
    with page.expect_event("dialog", timeout=3_000) as pending:
        page.evaluate("() => { setTimeout(() => location.reload(), 0); }")
    dialog = pending.value
    assert dialog.type == "beforeunload", dialog.type
    dialog.dismiss()


def check_converter_lifetime(browser, url, fixture):
    context = browser.new_context(accept_downloads=True)
    try:
        page = context.new_page()
        page.goto(url + "?page=converter")
        page.locator('input[type="file"]').set_input_files(fixture)
        page.get_by_role("button", name="Convert to MP4").click()
        cancel = page.get_by_role("button", name="Cancel", exact=True)
        expect(cancel).to_be_visible()
        confirm = []
        def keep_converting(dialog):
            confirm.append(dialog.type)
            dialog.dismiss()
        page.once("dialog", keep_converting)
        cancel.click()
        assert confirm == ["confirm"]
        page.get_by_role("button", name="ScreenClip Pro", exact=True).click()
        expect(page.get_by_role("button", name="Start Recording", exact=True)).to_be_visible()
        assert_reload_warning(page)
        # Return on the same document. The original task still owns the result.
        page.locator("nav").get_by_role("button", name=re.compile(r"^WebM Converter")).click()
        link = page.get_by_role("link", name=re.compile(r"^Download (MP4|WEBM)$", re.I))
        expect(link).to_be_visible(timeout=60_000)
        assert_reload_warning(page)
        reset = page.get_by_role("button", name="Convert another file")
        discard = []
        def keep_result(dialog):
            discard.append(dialog.type)
            dialog.dismiss()
        page.once("dialog", keep_result)
        reset.click()
        assert discard == ["confirm"]
        expect(link).to_be_visible()
        with page.expect_download() as ready:
            link.click()
        result = inspect_download(ready.value, audio=True)
        expect(page.get_by_text("Download the result before closing", exact=False)).to_be_hidden()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator('input[type="file"]')).to_be_attached()
        return {"conversion_across_surfaces": result, "discard_and_reload_guards": "passed"}
    finally:
        context.close()
