"""Exercise manual update discovery and update safety across production builds."""

import argparse
import functools
import http.server
import pathlib
import re
import shutil
import tempfile
import threading

from playwright.sync_api import expect, sync_playwright

from browser_smoke import PROJECT_PATH, StaticPreview
from browser_smoke_media import inspect_download, make_fixture


def assert_footer_at_bottom(page):
    footer = page.locator("footer:visible")
    expect(footer).to_have_count(1)
    dimensions = footer.evaluate("""element => ({
        bottom: element.getBoundingClientRect().bottom,
        viewport: innerHeight,
        position: getComputedStyle(element).position,
    })""")
    assert abs(dimensions["bottom"] - dimensions["viewport"]) <= 1, dimensions
    assert dimensions["position"] != "fixed", dimensions


def check_versions(browser, url, site, next_build, fixtures, current, target):
    context = browser.new_context(accept_downloads=True, viewport={"width": 1440, "height": 1100})
    try:
        page = context.new_page()
        for route in ("", "?page=converter"):
            page.goto(url + route)
            expect(page.locator("footer:visible")).to_contain_text(current[:8])
            assert_footer_at_bottom(page)
        page.wait_for_function("!!navigator.serviceWorker.controller")
        check = page.get_by_role("button", name="Check for updates")
        check.click()
        expect(page.get_by_text(re.compile(r"up to date", re.I))).to_be_visible()

        page.get_by_role('main').locator('input[type="file"]').set_input_files(fixtures)
        page.get_by_role("button", name="Convert to MP4").click()
        download = page.get_by_role("link", name="Download MP4")
        expect(download).to_be_visible(timeout=30_000)
        shutil.copytree(next_build, site, dirs_exist_ok=True)
        check.click()
        update = page.get_by_role("button", name=re.compile(r"Update and reload"))
        expect(update).to_contain_text(target[:8], timeout=15_000)
        expect(update).to_be_disabled()
        expect(page.locator("footer:visible")).to_contain_text(current[:8])
        with page.expect_download() as result:
            download.click()
        inspect_download(result.value, audio=True)
        expect(update).to_be_enabled()
        with page.expect_navigation(wait_until="domcontentloaded"):
            update.click()
        expect(page.locator("footer:visible")).to_contain_text(target[:8])
        expect(update).to_have_count(0)
        assert_footer_at_bottom(page)
    finally:
        context.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("current_dist", type=pathlib.Path)
    parser.add_argument("next_dist", type=pathlib.Path)
    parser.add_argument("current_version")
    parser.add_argument("next_version")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as path, sync_playwright() as playwright:
        directory = pathlib.Path(path)
        public = directory / "public"
        site = public / PROJECT_PATH
        shutil.copytree(args.current_dist, site)
        fixture = make_fixture(directory, "update-fixture.webm", True)
        handler = functools.partial(StaticPreview, directory=str(public))
        with http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
            server.offline = threading.Event()
            worker = threading.Thread(target=server.serve_forever, daemon=True)
            worker.start()
            try:
                url = f"http://127.0.0.1:{server.server_address[1]}/{PROJECT_PATH}/"
                with playwright.chromium.launch() as browser:
                    check_versions(browser, url, site, args.next_dist, fixture, args.current_version, args.next_version)
                    print(f"Chromium {browser.version}: versioned update, download protection and footer positioning passed.")
            finally:
                server.shutdown()
                worker.join()


if __name__ == "__main__":
    main()
