# Store-Listing – Texte zum Einfügen

Gilt für addons.mozilla.org (AMO) und den Chrome Web Store. Felder, die nur einen Store betreffen, sind markiert. Screenshots: `screenshot-1-hover.png`, `screenshot-2-zwischenablage.png` (1280 × 800, aufgenommen auf https://www.paehtz.de – eigene Seite, zeigt den Autor im Header; `demo.html` ist die neutrale Testseite). Icon fürs Listing: `../icons/128.png`.

## Name

Element-Picker

## Kurzbeschreibung (AMO „Summary", max. 250 Zeichen · Chrome „Beschreibung" im Manifest, max. 132)

Klick auf ein Seitenelement kopiert URL, eindeutigen CSS-Selektor und Textanfang – für KI-Chats und Coding-Agenten.

## Beschreibung (Deutsch)

Wer mit einem KI-Assistenten an einer Webseite arbeitet, kennt das Problem: „Ich meine das zweite Kästchen unter der Überschrift" ist für Menschen klar, für ein Werkzeug nicht. Element-Picker macht aus einem Klick eine eindeutige Referenz.

Ein Klick auf das Toolbar-Icon (oder das Tastenkürzel), ein Klick auf das Element – und in der Zwischenablage liegen drei Zeilen:

1. die vollständige Seiten-URL
2. ein CSS-Selektor, der genau dieses Element trifft, z. B. `#bereiche .values > .value:nth-of-type(2) > p`
3. der sichtbare Textanfang in Anführungszeichen, damit der Leser das Element auch ohne die Seite erkennt

Das Ganze eingefügt in Claude, ChatGPT, Copilot, Cursor oder ein Ticket – und das Gegenüber weiß, welches Element gemeint ist.

Der Selektor ist für Menschen lesbar und für Werkzeuge eindeutig: Er nutzt IDs und sprechende Klassen als Anker, greift auf Positionsangaben nur zurück, wo es nötig ist, und wird vor dem Kopieren gegen die Seite geprüft (genau ein Treffer). Zustands- und Animationsklassen werden ignoriert, damit der Selektor auch morgen noch stimmt.

Bedienung:
• Toolbar-Icon oder Tastenkürzel → Picker starten, Element unter der Maus wird umrahmt
• Klick → kopieren, fertig
• Rechtsklick → „Element-Picker: dieses Element kopieren" → ohne Picker-Modus direkt kopieren
• Escape → abbrechen

Datenschutz: Die Erweiterung tut nichts, bis Sie sie aufrufen. Sie läuft nur auf der Seite, auf der Sie sie starten (activeTab), sendet nichts, speichert nichts, erhebt nichts. Quellcode auf GitHub.

## Description (English)

Working on a web page with an AI assistant, you hit this constantly: "I mean the second box under the heading" is clear to a person and useless to a tool. Element-Picker turns one click into an unambiguous reference.

Click the toolbar icon (or press the shortcut), click the element – and your clipboard holds three lines:

1. the full page URL
2. a CSS selector that matches exactly this element, e.g. `#bereiche .values > .value:nth-of-type(2) > p`
3. the element's visible text (first 60 characters) in quotes, so a reader recognises it without opening the page

Paste that into Claude, ChatGPT, Copilot, Cursor or a ticket, and the other side knows which element you mean.

Selectors are readable for humans and unambiguous for tools: IDs and meaningful class names serve as anchors, positional indices are used only where needed, and every selector is verified against the page before copying (exactly one match). State and animation classes are ignored so the selector still works tomorrow.

Usage:
• Toolbar icon or shortcut → start the picker; the element under the cursor gets an outline
• Click → copied, done
• Right-click → "Element-Picker: copy this element" → copies directly, no picker mode
• Escape → cancel

Privacy: the extension does nothing until you invoke it. It runs only on the page where you start it (activeTab), sends nothing, stores nothing, collects nothing. Source on GitHub.

## Kategorie / Tags

- AMO: Kategorie „Web Development" (zweite: „Productivity"); Tags: css, selector, developer, ai, clipboard
- Chrome Web Store: Kategorie „Developer Tools"; Sprache Deutsch, zusätzlich Englisch

## Berechtigungen – Begründungen (Chrome Web Store fragt jede einzeln ab)

| Berechtigung | Begründung |
|---|---|
| `activeTab` | Der Picker läuft nur in dem Tab, in dem der Nutzer ihn per Icon, Kürzel oder Kontextmenü aufruft. Keine Host-Berechtigung nötig, kein Zugriff auf andere Seiten. |
| `scripting` | Das Picker-Skript wird erst nach dem Aufruf in den aktiven Tab injiziert (kein dauerhaftes Content-Script). |
| `contextMenus` / `menus` | Ein Eintrag im Kontextmenü, um das rechtsgeklickte Element direkt zu kopieren. |
| `clipboardWrite` | Die drei Zeilen werden in die Zwischenablage geschrieben. Beim Kontextmenü-Weg gibt es keine Klick-Geste auf der Seite; ohne diese Berechtigung würde das Schreiben dort scheitern. |

**Single purpose (Chrome):** Kopiert für ein angeklicktes Seitenelement URL, eindeutigen CSS-Selektor und Textanfang in die Zwischenablage.

**Remote code (Chrome):** Nein – kein Nachladen, kein eval externer Inhalte.

**Datennutzung (Chrome „Privacy practices"):** Es werden keinerlei Nutzerdaten erhoben, verarbeitet oder übertragen. Alle Kästchen leer lassen; die drei Zusicherungen (keine zweckfremde Nutzung, kein Verkauf, keine Kreditwürdigkeit) bestätigen.

**AMO:** `data_collection_permissions: none` ist im Manifest deklariert; Firefox zeigt „Keine Datenerhebung" automatisch an. Privacy-Policy-Feld kann leer bleiben oder auf den Datenschutz-Absatz im GitHub-README verweisen.

## Datenschutzerklärung (falls ein Feld eine verlangt)

Element-Picker erhebt, speichert und überträgt keine personenbezogenen Daten. Die Erweiterung hat keine Netzwerkzugriffe, keinen Speicher und keine Analyse-Funktionen. Der einzige Vorgang ist das Schreiben der vom Nutzer ausgewählten Elementreferenz in die lokale Zwischenablage; sie verlässt das Gerät nicht. Verantwortlich: Henning Pähtz, Lutherstadt Eisleben, henning@paehtz.de.

## Entwicklerprofil (für die Namensverknüpfung)

- Anzeigename: **Henning Pähtz**
- Homepage: https://www.paehtz.de
- Support-/Quellcode-Link: https://github.com/paehtz/element-picker
- Autor im Manifest: Henning Pähtz (Firefox zeigt ihn auf der Add-on-Seite)
