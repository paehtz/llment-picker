# Store-Listing – Texte zum Einfügen

Gilt für addons.mozilla.org (AMO) und den Chrome Web Store. Felder, die nur einen Store betreffen, sind markiert. Screenshots: `screenshot-1-hover.png`, `screenshot-2-zwischenablage.png` (1280 × 800, aufgenommen auf https://www.paehtz.de – eigene Seite, zeigt den Autor im Header; `demo.html` ist die neutrale Testseite). Icon fürs Listing: `../icons/128.png`.

## Name

LLMent Picker

## Kurzbeschreibung (AMO „Summary", max. 250 Zeichen · Chrome „Beschreibung" im Manifest, max. 132)

Klick auf ein Seitenelement kopiert URL und eindeutigen CSS-Selektor, markierter Text kommt mit – für KI-Chats und Coding-Agenten.

## Beschreibung (Deutsch)

Wer mit einem KI-Assistenten an einer Webseite arbeitet, kennt das Problem: „Ich meine das zweite Kästchen unter der Überschrift" ist für Menschen klar, für ein Werkzeug nicht. LLMent Picker macht aus einem Klick eine eindeutige Referenz.

Ein Klick auf das Toolbar-Icon (oder das Tastenkürzel), ein Klick auf das Element – und in der Zwischenablage liegt eine eindeutige Referenz:

1. die vollständige Seiten-URL
2. ein CSS-Selektor, der genau dieses Element trifft, z. B. `#bereiche .values > .value:nth-of-type(2) > p`
3. und wenn Sie vorher Text markiert haben: der markierte Text in Anführungszeichen – dann geht es direkt um diese Stelle, und der Picker kopiert sofort das Element, das die Markierung enthält

Das Ganze eingefügt in Claude, ChatGPT, Copilot, Cursor oder ein Ticket – und das Gegenüber weiß, welches Element gemeint ist.

Der Selektor ist für Menschen lesbar und für Werkzeuge eindeutig: Er nutzt IDs und sprechende Klassen als Anker, greift auf Positionsangaben nur zurück, wo es nötig ist, und wird vor dem Kopieren gegen die Seite geprüft (genau ein Treffer). Zustands- und Animationsklassen werden ignoriert, damit der Selektor auch morgen noch stimmt.

Bedienung:
• Text markieren, dann Icon oder Tastenkürzel → Element der Markierung + Text sofort kopiert
• Nichts markiert: Icon oder Tastenkürzel → Picker starten, Element unter der Maus wird umrahmt, Klick kopiert
• Rechtsklick auf der Seite → „Dieses Element kopieren" → ohne Picker-Modus direkt kopieren (auf markiertem Text: mit Text); Rechtsklick auf das Icon → Picker mit Voreinstellung starten
• Alt+Klick oder „… mit Screenshot kopieren" → zusätzlich ein Bildausschnitt des Elements samt Viewport-Angaben, für Layout-Fragen („das überlappt hier")
• Strg+Klick oder „… gerendertes HTML als Datei speichern" → das HTML des Elements, so wie es gerade im Browser steht, als Datei im Download-Ordner, mit dem CSS-Kontext wie im Inspektor (greifende Regeln samt Datei und Media-Query, effektive Layout-Werte); der Pfad kommt mit in die Zwischenablage. Für Inhalte, die es nur eingeloggt oder nur nach dem Rendern gibt (Stundenpläne, Tabellen, Portale).
• Escape → abbrechen

Der Screenshot entsteht nur auf Ihren Klick, zeigt nur den sichtbaren Tab und bleibt in Ihrer Zwischenablage.

Datenschutz: Die Erweiterung tut nichts, bis Sie sie aufrufen. Sie läuft nur auf der Seite, auf der Sie sie starten (activeTab), sendet nichts, speichert nichts, erhebt nichts. Quellcode auf GitHub.

## Description (English)

Working on a web page with an AI assistant, you hit this constantly: "I mean the second box under the heading" is clear to a person and useless to a tool. LLMent Picker turns one click into an unambiguous reference.

Click the toolbar icon (or press the shortcut), click the element – and your clipboard holds an unambiguous reference:

1. the full page URL
2. a CSS selector that matches exactly this element, e.g. `#bereiche .values > .value:nth-of-type(2) > p`
3. and if you selected text first: the selected text in quotes – meaning "this passage", and the picker copies the element containing the selection right away

Paste that into Claude, ChatGPT, Copilot, Cursor or a ticket, and the other side knows which element you mean.

Selectors are readable for humans and unambiguous for tools: IDs and meaningful class names serve as anchors, positional indices are used only where needed, and every selector is verified against the page before copying (exactly one match). State and animation classes are ignored so the selector still works tomorrow.

Usage:
• Select text, then icon or shortcut → element containing the selection + text copied immediately
• Nothing selected: icon or shortcut → start the picker; the element under the cursor gets an outline; click copies
• Right-click on the page → "Copy this element" → copies directly, no picker mode (on selected text: with the text); right-click the icon → start the picker with a preset
• Alt+click or "… copy with screenshot" → adds a cropped image of the element plus viewport info, for layout questions ("this overlaps")
• Ctrl+click or "… save rendered HTML as file" → the element's HTML as currently rendered, saved to your downloads folder, with the CSS context you would see in the inspector (matching rules with file and media query, effective layout values); the path goes into the clipboard too. For content that only exists logged in or after rendering (timetables, tables, portals).
• Escape → cancel

Screenshots are taken only on your click, cover only the visible tab and stay in your clipboard.

Privacy: the extension does nothing until you invoke it. It runs only on the page where you start it (activeTab), sends nothing, stores nothing, collects nothing. Source on GitHub.

## Kategorie / Tags

- AMO: Kategorie „Web Development" (zweite: „Productivity"); Tags: css, selector, developer, ai, clipboard
- Chrome Web Store: Kategorie „Developer Tools"; Sprache Deutsch, zusätzlich Englisch

## Berechtigungen – Begründungen (Chrome Web Store fragt jede einzeln ab)

| Berechtigung | Begründung |
|---|---|
| `activeTab` | Der Picker läuft nur in dem Tab, in dem der Nutzer ihn per Icon, Kürzel oder Kontextmenü aufruft; dieselbe Berechtigung deckt den optionalen Screenshot des sichtbaren Tabs (`captureVisibleTab`) nach ausdrücklichem Klick. Keine Host-Berechtigung nötig, kein Zugriff auf andere Seiten. |
| `scripting` | Das Picker-Skript wird erst nach dem Aufruf in den aktiven Tab injiziert (kein dauerhaftes Content-Script). |
| `contextMenus` / `menus` | Ein Eintrag im Kontextmenü, um das rechtsgeklickte Element direkt zu kopieren. |
| `clipboardWrite` | Die drei Zeilen werden in die Zwischenablage geschrieben. Beim Kontextmenü-Weg gibt es keine Klick-Geste auf der Seite; ohne diese Berechtigung würde das Schreiben dort scheitern. |
| `downloads` | Auf ausdrücklichen Klick (Code-Icon, Alt+Klick, Menüeintrag) wird das gerenderte HTML des gewählten Elements als Datei in den Download-Ordner des Browsers gelegt. Kein anderer Download, kein Öffnen von Dateien. |
| `storage` | Speichert zwei Einstellungen (Unterordner-Name, „Speichern unter"-Dialog ja/nein). Keine Nutzerdaten. |

**Single purpose (Chrome):** Kopiert für ein angeklicktes Seitenelement URL, eindeutigen CSS-Selektor und optional den markierten Text in die Zwischenablage.

**Remote code (Chrome):** Nein – kein Nachladen, kein eval externer Inhalte.

**Datennutzung (Chrome „Privacy practices"):** Es werden keinerlei Nutzerdaten erhoben, verarbeitet oder übertragen. Die HTML-Datei entsteht nur auf Klick des Nutzers und bleibt auf seinem Gerät. Alle Kästchen leer lassen; die drei Zusicherungen (keine zweckfremde Nutzung, kein Verkauf, keine Kreditwürdigkeit) bestätigen.

**AMO:** `data_collection_permissions: none` ist im Manifest deklariert; Firefox zeigt „Keine Datenerhebung" automatisch an. Privacy-Policy-Feld kann leer bleiben oder auf den Datenschutz-Absatz im GitHub-README verweisen.

## Datenschutzerklärung (falls ein Feld eine verlangt)

LLMent Picker erhebt, speichert und überträgt keine personenbezogenen Daten. Die Erweiterung hat keine Netzwerkzugriffe, keinen Speicher und keine Analyse-Funktionen. Der einzige Vorgang ist das Schreiben der vom Nutzer ausgewählten Elementreferenz in die lokale Zwischenablage; sie verlässt das Gerät nicht. Verantwortlich: Henning Pähtz, Lutherstadt Eisleben, henning@paehtz.de.

## Entwicklerprofil (für die Namensverknüpfung)

- Anzeigename: **Henning Pähtz**
- Homepage: https://www.paehtz.de
- Support-/Quellcode-Link: https://github.com/paehtz/llment-picker
- Autor im Manifest: Henning Pähtz (Firefox zeigt ihn auf der Add-on-Seite)
