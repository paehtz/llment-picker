# LLMent Picker

**Tell your AI agent exactly which element you mean.** One click on any page element copies its URL and a unique, readable CSS selector – and, when you want it, the selected text, a screenshot of the element or its rendered HTML with the CSS that applies to it. Paste into Claude, ChatGPT, Copilot, Cursor or any coding agent.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-LLMent%20Picker-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/llment-picker/oikfninjgnggbbhbdeefdlmeidminbnm)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add--ons-in%20review-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/firefox/addon/llment-picker/)

Deutsche Fassung: [README.de.md](README.de.md)

```
https://www.paehtz.de/#leistungen
#leistungen .service-list > .service:nth-of-type(2) > .service__body
"Unternehmenswebseiten: von der Sitemap über die Nutzerführung und Content-Architektur bis"
Viewport 1440×900, DPR 1.25, screenshot 454×239 px (+24 px margin)
Screenshot: D:\Downloads\LLMent Picker\2026-09-17_0853_paehtz.de_service-body.png
HTML: D:\Downloads\LLMent Picker\2026-09-17_0853_paehtz.de_service-body.html
```

1. the full page URL (including hash)
2. the shortest CSS selector that matches exactly this element
3. **only if text was selected first:** the selected text in quotes (max. 240 characters)
4. **only in screenshot mode:** viewport, device pixel ratio and image size – a PNG crop of the element is in the clipboard alongside the text; one Ctrl+V in Claude pastes both. By default the PNG is also saved to the downloads folder and its path is the next line – a file cannot get lost between clipboard and chat, and Claude Code reads it from disk (setting: clipboard, file or both)
5. **only in HTML mode:** the path of the saved file – the element's rendered HTML with its CSS context, ready for Claude Code to read from disk

## What sets it apart

- **It sees nothing until you click.** Only `activeTab` – no host permissions, no content script running on every page. Chrome shows no "read and change all your data" warning.
- **Screenshot and text in a single paste.** The agent gets what it cannot render itself: how the element actually looks in your browser, at your viewport.
- **Rendered HTML with CSS context.** For content that exists only in the browser (logged-in portals, JavaScript-rendered tables) and for "why does it look like this": the applied stylesheet rules with file and media query, plus the effective layout values – what the inspector shows, as a file.
- **Readable selectors, verified.** IDs and meaningful classes as anchors, positions only where needed, state and animation classes ignored, uniqueness checked before copying.
- **Firefox and Chrome**, ~30 KB, four plain files, no build step.

## Why it exists

LLMent Picker grew out of the daily work of [Henning Pähtz](https://www.paehtz.de): websites for small and medium-sized businesses, since 2025 increasingly built together with agentic AI (Claude Code and similar tools). The agent builds and changes the page; the human reviews it in the browser and hands back change requests.

That hand-back is where it kept breaking. "The second box under the heading, the paragraph inside" is unambiguous for a person and useless for an agent – it does not see the page, it sees source. The workarounds were a screenshot (the agent has to guess which DOM element is meant) or "Copy XPath" from DevTools: three clicks, a path that breaks with every layout change, and the URL had to be copied separately. At thirty pieces of feedback a day that adds up, and every ambiguity costs a correction round.

The tool turns that into one click that delivers exactly what the agent needs: the page, a unique and readable selector and – when the request is about a specific passage – the selected text. The name joins "element" and "LLM": it tells a language model which element you mean.

The first version was built on 15 September 2026 in a session with Claude Code and tested against the DOM of real client sites; the selector rules (IDs as anchors, ignore state classes, positions only where necessary, verify uniqueness before copying) come from the mistakes found along the way. The text line was originally always included and was changed to "only when selected" after the first day of use: a block without a text line is a block; a block with one reads like "this sentence is meant".

## Usage

| Action | Result |
|---|---|
| Select text on the page, then toolbar icon or shortcut | copies the element containing the selection plus the selected text as line 3 – no picker mode |
| Toolbar icon or **Ctrl+Alt+P** (Firefox) / **Alt+Shift+P** (Chrome), nothing selected | starts the picker – crosshair cursor, the element under the mouse gets an outline |
| Click | copies URL and selector, the picker ends, toast "Copied" |
| **Alt+click** | plus a screenshot of the element (+24 px margin) as an image in the clipboard and the viewport details as line 4 – for layout feedback ("overlaps", "misaligned"). Elements larger than the window are captured **whole**: the page is scrolled tile by tile and the captures stitched (long tables, wide tables in scroll containers) |
| **Hold the left button and drag** | **lasso**: the drawn region is captured as a screenshot instead of an element – for when the outline does not catch what you mean. The selector points to the container with the largest overlap, line 3 says so with the overlap percentage; Ctrl adds the HTML of that container |
| **Ctrl+click** (Mac: ⌘) | plus the element's rendered HTML as a file in your downloads folder, path as line 5; the file head carries the **CSS context as in the inspector** |
| **Ctrl+Alt+click** | screenshot and HTML together |
| **Escape** or icon/shortcut again | cancel without copying |
| Right-click on the page → LLMent Picker → "Copy this element" / "Copy with screenshot" / "Save as HTML file" | acts on the right-clicked element directly, no picker mode; on selected text the text comes along |
| Right-click the toolbar icon → "Pick an element – with screenshot" / "– as HTML file" | starts the picker with a preset: the symbol above the outline is already lit, a plain click triggers it |

Above the outline three symbols (`</>`, camera, dashed box) show what the click will add; they light up while the key is held or the lasso is being drawn and carry the hints ("Ctrl HTML", "Alt Screenshot", "Drag region") – permanently, switchable off in the settings. They are deliberately not clickable: the mouse would have to cross other elements to reach them and the outline would jump.

The text line appears only when you ask for it by selecting text. A block clicked without a selection gives URL and selector only – otherwise a chat would read "this sentence is meant" although the block was meant. Conversely, selection + icon copies text and selector only; for the rare "this sentence wraps badly" use right-click on the selection → "Copy with screenshot".

**Elements inside iframes** can be picked too; the clipboard then carries an extra line `Inside frame: <url> ← <iframe id="…">` and the selector refers to the frame document. The screenshot works for same-origin frames.

**Settings** (extension management → LLMent Picker → Options): subfolder inside the downloads folder (default `LLMent Picker`), "Save as" dialog, screenshot target (clipboard and PNG file – the default –, clipboard only, file only), CSS context on/off, **slim HTML files** on/off (default on: hidden form fields, event handlers, long data attributes, srcset lists, SVG paths, `<style>` blocks, comments, long `data:` URIs and repeated `<select>` option lists are removed; the file header lists what was dropped – a DNS table of 113 KB became 52 KB with the same content), **clipboard and files always in English** (default off: the browser language decides; the extension UI keeps the browser language either way), key hints on/off. Extensions may only write to the browser's download folder; a free target path is not possible.

Change the shortcut: Firefox `about:addons` → gear → "Manage Extension Shortcuts"; Chrome `chrome://extensions/shortcuts`. (Alt+Shift+P opens the profile manager in Firefox; Chrome does not allow Ctrl+Alt combinations – hence two defaults.)

## Selector logic

1. **ID** on the element itself → `#id`, done.
2. Otherwise: the nearest ancestor with an ID as **anchor** (`#leistungen …`), below it a chain of **meaningful classes** (`.service-list > .service`) or tag names.
3. `:nth-of-type(n)` only where siblings would be ambiguous – and then always with the parent segment in front, so "the second of what" stays readable.
4. The chain is extended segment by segment from the target upwards until `document.querySelectorAll(sel).length === 1`.

State and animation classes (`active`, `in`, `is-*`, `js-*`, `aos-*`, …) and generated-looking names (hashes, long digit runs) are skipped.

## Technical

- WebExtension, Manifest V3. Firefox ≥ 142 (event page) and Chrome (service worker) from the same scripts; only the manifest differs (`manifest.json` Firefox, `chrome/manifest.json` Chrome).
- Permissions: `activeTab` + `scripting` (injection only on request), `menus`/`contextMenus` (context menu entries), `clipboardWrite` (writing without a click gesture, needed for the context-menu path), `downloads` (HTML and screenshot files), `storage` (settings) – no host permissions, no persistent content script.
- Context-menu target: Firefox provides `targetElementId` → `menus.getTargetElement`. Chrome does not; there the page's `:hover` state stays put while the native menu is open, and the deepest `:hover` element is the right-clicked one. If no target can be determined, the picker mode starts instead.
- Screenshot: `tabs.captureVisibleTab` in the background script (covered by `activeTab`), cropped to element + margin in the content script, written as a `ClipboardItem` with `image/png` **and** `text/plain`. Elements outside the window are scrolled into view first. Elements larger than the visible area are captured in tiles: the region is scrolled through its scroll containers and the window (innermost first, like `scrollIntoView`), each tile is cropped to the intersection of window and container clips and drawn onto one canvas; meanwhile foreign `position: fixed` elements are hidden and `sticky` elements pinned to their natural place (`position: relative`), afterwards styles and scroll positions are restored. Chrome allows two captures per second, so a 20-tile capture takes about ten seconds; the cursor shows "busy". Upper limits: 30 tiles, longest edge 8000 px (scaled down beyond that, line 4 says so). Clipboard writes are retried up to four times with the document focused first, and Alt key events are swallowed until the write is done – releasing Alt after Alt+click would otherwise move focus to the browser menu (Chrome) or menu bar (Firefox) and the write would be refused with "Document is not focused". Whether a target takes both parts from one paste is up to the target – Claude Code does (checked 17 September 2026 from Firefox with `test/clipboard-test.html`).
- HTML file: `downloads.download` from the background script (blob URL in Firefox, `data:` URL in Chrome's service worker), filename `YYYY-MM-DD_HHMM_<host>_<id-or-class>.html`, absolute path from `downloads.search`. CSS context: `getComputedStyle` (a selection of ~45 layout properties) and a pass over `document.styleSheets` with `el.matches(rule.selectorText)`, media queries marked active/inactive via `matchMedia`; cross-origin stylesheets cannot be read and are listed as such.
- iframes: the script is injected into the main frame first; if the picker mode starts there, into all frames of the tab. A frame that finishes tells the background script, which ends the pickers in the other frames.
- Languages: English (default) and German via `_locales`; the browser's UI language decides.
- No network access, no data collection (`data_collection_permissions: none`); only the settings are stored.

```
manifest.json         Firefox manifest (the repo root loads directly as a temporary add-on)
chrome/manifest.json  Chrome manifest (service worker, contextMenus, Alt+Shift+P)
background.js         context menus, badge, screenshot capture, file download; injects picker.js
picker.js             overlay, selector generation, clipboard, screenshot, HTML export, toast
options.html/.js      settings
_locales/             en, de
icons/                PNG 16/32/48/128 (rasterised from icon.svg)
build.ps1             builds dist/firefox/*.zip (via web-ext) and dist/chrome/*.zip
store/                listing texts, permission justifications, screenshots, demo page
test/                 clipboard-test.html (does a target take image + text from one paste?), iframe-test.html, stitch-test.html (long/wide tables, lasso)
```

## Installation

**Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/llment-picker/oikfninjgnggbbhbdeefdlmeidminbnm)

**Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/llment-picker/) (listing in review); until then the signed `.xpi` from the [releases](https://github.com/paehtz/llment-picker/releases).

### For testing

**Firefox (temporary – gone after a restart):** `about:debugging` → "This Firefox" → "Load Temporary Add-on…" → `manifest.json` from this folder. After code changes click "Reload" there – there is no automatic refresh.

**Chrome (stays as long as the folder exists):** run `.\build.ps1`, then `chrome://extensions` → enable "Developer mode" → "Load unpacked" → folder `dist/chrome/llment-picker`. After changes: rebuild and click "Update" on the card.

### Signing for Firefox yourself

Firefox installs only signed add-ons permanently. Signing is free, needs no publication ("self-distributed") and takes minutes: https://addons.mozilla.org/developers/ → "Submit a New Add-on" → **"On your own"** → upload `dist/firefox/llment_picker-<version>.zip` → download the signed `.xpi` → drag it onto a Firefox window. Increase `version` in both manifests for every new build – AMO does not accept the same number twice.

## Development

```powershell
.\build.ps1          # lint + both store packages into dist/
npx web-ext run       # start Firefox with the add-on, reloads on changes
```

`store/demo.html` is a neutral test page without real data.

## License

MIT – see `LICENSE`.
