# Store listing – texts to paste

Applies to addons.mozilla.org (AMO) and the Chrome Web Store. Both stores take several languages: English is the default locale, German the second. Screenshots: `screenshot-1-hover.png`, `screenshot-2-zwischenablage.png` (1280 × 800, taken on https://www.paehtz.de – the author's own site, shows him in the header; `demo.html` is the neutral test page). Promo tiles: `promo-small-440x280.png`, `promo-large-1400x560.png`. Listing icon: `../icons/128.png`.

## Name

LLMent Picker

## Summary (AMO max. 250 characters · Chrome takes the manifest description, max. 132)

**EN:** Click a page element to copy its URL and a unique CSS selector – plus selected text, a screenshot or the rendered HTML – for AI chats and coding agents.

**DE:** Klick auf ein Seitenelement kopiert URL und eindeutigen CSS-Selektor – dazu markierter Text, Screenshot oder gerendertes HTML – für KI-Chats und Coding-Agenten.

## Description (English)

LLMent Picker sees nothing until you click, sends nothing anywhere and runs only on the page you point it at. One click copies exactly what an AI agent needs to know which element you mean – and, unlike an annotation workspace, it stays out of your way: no panel, no comments, no all-sites permission.

Working on a web page with an AI assistant, you hit this constantly: "I mean the second box under the heading" is clear to a person and useless to a tool. LLMent Picker turns one click into an unambiguous reference in your clipboard:

1. the full page URL
2. a CSS selector that matches exactly this element, e.g. `#bereiche .values > .value:nth-of-type(2) > p`
3. if you selected text first: that text in quotes – "this passage is meant"
4. with Alt+click: a screenshot of the element and its surroundings, as an image in the same clipboard entry, plus viewport and pixel ratio – for "this overlaps", "this is misaligned". One Ctrl+V in Claude pastes image and text together; by default the PNG is also saved to your downloads folder and its path added (setting: clipboard, file or both). Elements larger than the window (long tables, wide tables in scroll containers) are captured whole, stitched from several tiles. Or hold the left button and drag a region: the lasso captures exactly that area, the selector names the container that covers it best.
5. with Ctrl+click: the element's HTML as currently rendered, saved as a file in your downloads folder, with the CSS context you would see in the inspector (matching rules with file and media query, effective layout values). The path goes into the clipboard – Claude Code reads it straight from disk. For content that only exists logged in or after rendering: timetables, tables, portals.

Selectors are readable for humans and unambiguous for tools: IDs and meaningful class names serve as anchors, positional indices are used only where needed, state and animation classes are ignored, and every selector is verified against the page before copying (exactly one match).

Usage
• Select text, then icon or shortcut → element containing the selection + text copied immediately
• Nothing selected: icon or shortcut → picker starts; the element under the cursor gets an outline; click copies
• Alt+click → with screenshot · Ctrl+click → as HTML file · both → both · drag → lasso region as screenshot
• Right-click on the page → "Copy this element" / "Copy with screenshot" / "Save as HTML file", without picker mode
• Right-click the icon → start the picker with a preset
• Works inside iframes; the clipboard says which frame

Privacy: only the activeTab permission – the extension does nothing until you invoke it and has no access to other pages. Screenshots are taken only on your click and stay in your clipboard; HTML files are written only on your click into your own downloads folder. No network access, no data collection. Source on GitHub, MIT licence.

## Beschreibung (Deutsch)

LLMent Picker sieht nichts, bis Sie klicken, sendet nichts und läuft nur auf der Seite, auf der Sie es aufrufen. Ein Klick kopiert genau das, was ein KI-Agent braucht, um zu wissen, welches Element Sie meinen – und bleibt dabei aus dem Weg: kein Panel, keine Kommentare, keine Berechtigung für alle Websites.

Wer mit einem KI-Assistenten an einer Webseite arbeitet, kennt das Problem: „Ich meine das zweite Kästchen unter der Überschrift" ist für Menschen klar, für ein Werkzeug nicht. LLMent Picker macht aus einem Klick eine eindeutige Referenz in der Zwischenablage:

1. die vollständige Seiten-URL
2. ein CSS-Selektor, der genau dieses Element trifft, z. B. `#bereiche .values > .value:nth-of-type(2) > p`
3. wenn Sie vorher Text markiert haben: dieser Text in Anführungszeichen – „um diese Stelle geht es"
4. mit Alt+Klick: ein Screenshot des Elements samt Umgebung als Bild im selben Zwischenablage-Eintrag, dazu Viewport und Pixelverhältnis – für „das überlappt", „das ist verschoben". Ein Strg+V in Claude fügt Bild und Text zusammen ein; standardmäßig wird das PNG zusätzlich im Download-Ordner gespeichert und sein Pfad angefügt (Einstellung: Zwischenablage, Datei oder beides). Elemente, die größer sind als das Fenster (lange Tabellen, breite Tabellen in Scroll-Containern), werden vollständig erfasst, aus mehreren Kacheln zusammengesetzt. Oder linke Taste halten und einen Bereich aufziehen: das Lasso erfasst genau diesen Ausschnitt, der Selektor nennt den Container, der ihn am besten abdeckt.
5. mit Strg+Klick: das HTML des Elements, so wie es gerade im Browser steht, als Datei im Download-Ordner, mit dem CSS-Kontext wie im Inspektor (greifende Regeln samt Datei und Media-Query, effektive Layout-Werte). Der Pfad kommt in die Zwischenablage – Claude Code liest die Datei direkt. Für Inhalte, die es nur eingeloggt oder nur nach dem Rendern gibt: Stundenpläne, Tabellen, Portale.

Der Selektor ist für Menschen lesbar und für Werkzeuge eindeutig: IDs und sprechende Klassen als Anker, Positionsangaben nur wo nötig, Zustands- und Animationsklassen ignoriert, und jeder Selektor wird vor dem Kopieren gegen die Seite geprüft (genau ein Treffer).

Bedienung
• Text markieren, dann Icon oder Tastenkürzel → Element der Markierung + Text sofort kopiert
• Nichts markiert: Icon oder Tastenkürzel → Picker startet, Element unter der Maus wird umrahmt, Klick kopiert
• Alt+Klick → mit Screenshot · Strg+Klick → als HTML-Datei · beides → beides · Ziehen → Lasso-Bereich als Screenshot
• Rechtsklick auf der Seite → „Dieses Element kopieren" / „Mit Screenshot kopieren" / „Als HTML-Datei speichern", ohne Picker-Modus
• Rechtsklick auf das Icon → Picker mit Voreinstellung starten
• Funktioniert auch in iframes; die Zwischenablage nennt den Frame

Datenschutz: nur die Berechtigung activeTab – die Erweiterung tut nichts, bis Sie sie aufrufen, und hat keinen Zugriff auf andere Seiten. Screenshots entstehen nur auf Ihren Klick und bleiben in Ihrer Zwischenablage; HTML-Dateien werden nur auf Ihren Klick in Ihren eigenen Download-Ordner geschrieben. Keine Netzwerkzugriffe, keine Datenerhebung. Quellcode auf GitHub, MIT-Lizenz.

## Category / tags

- AMO: category "Web Development" (second: "Productivity"); tags: css, selector, developer, ai, clipboard, screenshot
- Chrome Web Store: category "Developer Tools"; languages English (default) and German

## Permissions – justifications (Chrome asks for each one)

| Permission | Justification (EN) |
|---|---|
| `activeTab` | The picker runs only in the tab where the user invokes it via icon, shortcut or context menu; the same permission covers the optional screenshot of the visible tab after an explicit click. No host permissions needed, no access to other pages. |
| `scripting` | The picker script is injected into the active tab only after the user invokes it (no persistent content script). |
| `contextMenus` / `menus` | Context menu entries to copy the right-clicked element directly, and entries on the toolbar icon to start the picker with a preset. |
| `clipboardWrite` | The lines (and, in screenshot mode, the image) are written to the clipboard. On the context-menu path there is no click gesture on the page; without this permission writing would fail there. |
| `downloads` | On an explicit click (Ctrl+click, Alt+click, lasso or menu entry) the rendered HTML or the screenshot of the chosen element is saved as a file into the browser's downloads folder. No other download, no opening of files. |
| `storage` | Stores five settings (subfolder, "Save as" dialog, screenshot target, CSS context, key hints). No user data. |

**Single purpose (Chrome):** Copies, for a page element chosen by the user, the page URL, a unique CSS selector and optionally the selected text, a screenshot or the rendered HTML, so the element can be referenced precisely in an AI chat or coding agent.

**Remote code (Chrome):** No – nothing is loaded at runtime, no eval of external content.

**Data usage (Chrome "Privacy practices"):** No user data is collected, processed or transmitted. Leave all boxes empty; confirm the three certifications (no unrelated use, no sale, no creditworthiness). Screenshots and HTML files are created only on the user's click and stay on the user's device.

**AMO:** `data_collection_permissions: none` is declared in the manifest; Firefox shows "No data collection" automatically. The privacy-policy field can stay empty or point to the privacy paragraph in the GitHub README.

## Privacy statement (if a field requires one)

LLMent Picker does not collect, store or transmit personal data. The extension has no network access, no analytics and no server component. The only operations are writing the element reference chosen by the user to the local clipboard and, on explicit request, saving an HTML file to the user's own downloads folder; nothing leaves the device. Responsible: Henning Pähtz, Lutherstadt Eisleben, Germany, henning@paehtz.de.

## Developer profile (for the name link)

- Display name: **Henning Pähtz**
- Homepage: https://www.paehtz.de
- Support / source: https://github.com/paehtz/llment-picker
- Author in the manifest: Henning Pähtz (Firefox shows it on the add-on page)
