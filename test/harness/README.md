# Test harness (headless)

Scripts that drive a headless browser with a test copy of the extension. They used to live in `%TEMP%` and were lost to Windows temp cleanup between 25.09. and 09.10.2026; they belong here.

**Test copies** (host permission `<all_urls>`, because `activeTab` cannot be granted without a real toolbar click):

- `python setup-testext.py [tag]` builds `%TEMP%\ep-chrome-test` (working tree) and `%TEMP%\ep-old-test` (git tag, default `v1.7.2`) for Chrome.
- `python setup-ff-test.py [tag]` builds `%TEMP%\ff-new-test` and `%TEMP%\ff-old-test` for Firefox, each with a test-only `testhook.js` content script: the page starts the picker with `postMessage({__llmentTestStart:1})`, and the copied block is mirrored into the attribute `data-llment-test-last` (the page cannot read the content script's isolated world).

**Pages** are served from `test/` with `python -m http.server 8765 --bind 127.0.0.1` (a second server on 8766 for `frame-test.html`, which needs a cross-origin frame).

**Chrome (CDP):** `node cdp-<name>.mjs <ext-dir> <url> <out-dir>`, e.g. `cdp-ctxmenu.mjs` (context menu with and without screenshot + HTML; run before every release), `cdp-video.mjs` (click on `<video controls>` must copy, not play), `cdp-frame*.mjs` (cross-origin frames: focus, keyboard path, with granted permission).

**Firefox (WebDriver BiDi):** `ff-frame.mjs` (cross-origin frame with permission: the picker runs inside the frame and copies a field; pointer actions must be sent in the frame's own browsing context, the top context does not route them into the frame in headless mode), `ff-frame-noperm.mjs` (same page without permission, test copy `%TEMP%f-noperm-test` with host permission for 127.0.0.1 only: the pointer crosses the frame edge, the frame is highlighted with the hint, a click copies the frame and never reaches the form), and `node ff-video.mjs <ext-dir> <url>` starts Firefox headless with `--remote-debugging-port`, installs the extension via `webExtension.install` and checks the video click. Firefox-only behaviour (its native video controls react to a click even when the page cancels it) can only be measured here.

Lost and not yet rebuilt: the CSS-context tests (`cdp-ctxsvg`, `cdp-ctxbtn`, `cdp-hoverbtn`, `cdp-ctx3`), the tiling and lasso tests (`cdp-stitch`), recording (`cdp-rec`), tap-to-arm (`cdp-tap`), range (`cdp-range`). Rebuild them here when the area is touched next.
