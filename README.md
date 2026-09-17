# LLMent Picker (Firefox & Chrome)

Ein Klick auf ein Seitenelement kopiert drei Zeilen in die Zwischenablage – zum
Einfügen in einen Chat mit einem Coding-Agenten („dieses Element meine ich"):

```
https://www.paehtz.de/#leistungen
#leistungen .service-list > .service:nth-of-type(2) > .service__body
"Unternehmenswebseiten: von der Sitemap über die Nutzerführung und Content-Architektur bis"
```

1. vollständige Seiten-URL (inkl. Hash)
2. kürzester CSS-Selektor, der das Element eindeutig trifft
3. **nur wenn vorher Text markiert war:** der markierte Text in Anführungszeichen (max. 240 Zeichen)
4. **nur im Screenshot-Modus:** `Viewport 1440×900, DPR 1.25, Screenshot 454×239 px (+24 px Rand)` – dazu liegt ein PNG-Ausschnitt des Elements mit in der Zwischenablage; ein Strg+V in Claude fügt Bild und Text zusammen ein

## Warum es das gibt

LLMent Picker ist aus der täglichen Arbeit von [Henning Pähtz](https://www.paehtz.de) entstanden: Webseiten für kleine und mittlere Unternehmen, seit 2025 zunehmend zusammen mit agentischer KI (Claude Code und vergleichbare Werkzeuge). Der Agent baut und ändert die Seite, der Mensch prüft im Browser und gibt Änderungswünsche zurück.

Genau an dieser Rückgabe hakte es. „Der zweite Kasten unter der Überschrift, der Absatz darin" ist für einen Menschen eindeutig, für einen Agenten nicht – er sieht die Seite nicht, er sieht Quelltext. Die Behelfe waren ein Screenshot (der Agent muss raten, welches DOM-Element gemeint ist) oder „Copy XPath" aus den DevTools: drei Klicks, ein Pfad, der bei jeder Layoutänderung bricht, und die URL musste separat mit. Bei dreißig Rückmeldungen am Tag summiert sich das, und jede Unschärfe kostet eine Korrekturrunde.

Das Werkzeug macht daraus einen Klick, der genau das liefert, was der Agent braucht: die Seite, einen eindeutigen und lesbaren Selektor, und – wenn es um eine konkrete Textstelle geht – den markierten Text. Der Name verbindet „Element" und „LLM": Es sagt einem Sprachmodell, welches Element gemeint ist.

Der erste Stand entstand am 15. September 2026 in einer Sitzung mit Claude Code, getestet am DOM echter Kundenseiten; die Entscheidungen zum Selektor-Algorithmus (IDs als Anker, Zustandsklassen ignorieren, Positionen nur wo nötig, Eindeutigkeit vor dem Kopieren prüfen) kommen aus den Fehlern, die dabei auftraten. Die dritte Zeile war anfangs immer dabei und wurde nach dem ersten Praxistag auf „nur bei Markierung" umgestellt: Ein Block ohne Textzeile ist ein Block, ein Block mit Textzeile liest sich wie „dieser Satz ist gemeint".

## Bedienung

| Aktion | Wirkung |
|---|---|
| Text auf der Seite markieren, dann Toolbar-Icon oder Kürzel | kopiert sofort das Element, das die Markierung enthält, plus den markierten Text als dritte Zeile – kein Picker-Modus |
| Toolbar-Icon oder **Strg+Alt+P** (Firefox) / **Alt+Shift+P** (Chrome), nichts markiert | Picker starten – Cursor wird zum Fadenkreuz, Element unter der Maus bekommt einen Rahmen |
| Klick | kopiert die drei Zeilen, Picker beendet sich, Toast „Kopiert" |
| **Kamera-Icon im Rahmen** oder **Shift+Klick** | wie Klick, zusätzlich Screenshot des Elements (+24 px Rand) als Bild in der Zwischenablage und Viewport-Angaben als vierte Zeile – für Layout-Rückmeldungen („überlappt", „verschoben") |
| **Escape** oder erneut Icon/Kürzel | Abbruch ohne Kopieren |
| **Rechtsklick → „LLMent Picker: dieses Element kopieren"** | kopiert das rechtsgeklickte Element direkt, ohne Picker-Modus; liegt der Rechtsklick auf markiertem Text, kommt der Text als dritte Zeile mit |
| **Rechtsklick → „LLMent Picker: mit Screenshot kopieren"** | dasselbe mit Bild |

Die dritte Zeile gibt es also nur, wenn Du sie durch eine Markierung ausdrücklich verlangst. Ein angeklickter Block ohne Markierung liefert nur URL und Selektor – sonst läse ein Chat „dieser Satz ist gemeint", obwohl der Block gemeint war.

Kürzel ändern: Firefox `about:addons` → Zahnrad → „Tastenkombinationen für Erweiterungen verwalten"; Chrome `chrome://extensions/shortcuts`. (Alt+Shift+P öffnet in Firefox die Profilverwaltung; Chrome erlaubt keine Strg+Alt-Kombinationen – daher zwei Standards.)

## Selektor-Logik

Reihenfolge der Bevorzugung:

1. **ID** am Element selbst → `#id`, fertig.
2. Sonst: nächster Vorfahr mit ID als **Anker** (`#leistungen …`), darunter Kette aus **sprechenden Klassen** (`.service-list > .service`) oder Tag-Namen.
3. `:nth-of-type(n)` nur, wenn Geschwister sonst mehrdeutig wären – und dann immer mit dem Elternsegment davor, damit lesbar bleibt, „das zweite wovon".
4. Die Kette wird vom Ziel her Segment für Segment verlängert, bis `document.querySelectorAll(sel).length === 1`.

Zustands-/Animationsklassen (`active`, `rv`, `is-*`, `js-*`, `aos-*`, …) und generiert aussehende Namen (Hashes, lange Ziffern) werden übersprungen.

## Technik

- WebExtension, Manifest V3. Firefox ≥ 142 (Event-Page) und Chrome (Service-Worker) aus denselben Skripten; nur das Manifest unterscheidet sich (`manifest.json` Firefox, `chrome/manifest.json` Chrome).
- Berechtigungen: `activeTab` + `scripting` (Injektion nur nach Aufruf), `menus`/`contextMenus` (Kontextmenü-Eintrag), `clipboardWrite` (Schreiben ohne Klick-Geste, nötig für den Kontextmenü-Weg) – keine Host-Berechtigung, kein dauerhaftes Content-Script.
- Kontextmenü-Ziel: Firefox liefert `targetElementId` → `menus.getTargetElement`. Chrome kennt das nicht; dort bleibt der `:hover`-Zustand der Seite stehen, solange das native Menü offen ist, und das tiefste `:hover`-Element ist das rechtsgeklickte. Lässt sich kein Ziel bestimmen, startet stattdessen der Picker-Modus.
- Screenshot: `tabs.captureVisibleTab` im Hintergrundskript (durch `activeTab` gedeckt, keine weitere Berechtigung), Zuschnitt auf Element + Rand im Content-Script, Ablage als `ClipboardItem` mit `image/png` **und** `text/plain`. Elemente außerhalb des Fensters werden vorher in den Blick gescrollt; ist ein Element höher als das Fenster, sagt die vierte Zeile „nur sichtbarer Teil". Ob ein Ziel beide Teile mit einem Einfügen übernimmt, entscheidet das Ziel – Claude Code tut es (geprüft 17.09.2026 aus Firefox mit `test/clipboard-test.html`).
- Keine Netzwerkzugriffe, kein Speicher, keine Datenerhebung (`data_collection_permissions: none`).
- Reines JavaScript, kein Build-Schritt, keine Abhängigkeiten.

```
manifest.json         Firefox-Manifest (Repo-Wurzel ist direkt als temporäres Add-on ladbar)
chrome/manifest.json  Chrome-Manifest (Service-Worker, contextMenus, Alt+Shift+P)
background.js         Kontextmenü-Eintrag; injiziert picker.js bei Icon / Kürzel / Menü
picker.js             Overlay, Selektor-Erzeugung, Zwischenablage, Toast
icons/                PNG 16/32/48/128 (aus icon.svg gerastert)
build.ps1             baut dist/firefox/*.zip (via web-ext) und dist/chrome/*.zip
store/                Listing-Texte, Berechtigungsbegründungen, Screenshots, Demo-Seite
test/                 clipboard-test.html: prüft, ob ein Ziel Bild + Text aus einem Strg+V übernimmt
```

## Installation

### Zum Testen

**Firefox (temporär – nach Neustart wieder weg):** `about:debugging` → „Dieser Firefox" → „Temporäres Add-on laden…" → `manifest.json` aus diesem Ordner. Nach Code-Änderungen dort „Neu laden" klicken – es gibt keine automatische Aktualisierung.

**Chrome (bleibt, solange der Ordner existiert):** erst `.\build.ps1`, dann `chrome://extensions` → „Entwicklermodus" an → „Entpackte Erweiterung laden" → Ordner `dist/chrome/llment-picker`. Nach Änderungen: neu bauen und auf der Karte „Aktualisieren" klicken.

### Dauerhaft: bei Mozilla signieren lassen (empfohlen)

Firefox installiert nur signierte Add-ons dauerhaft. Die Signierung ist kostenlos, braucht keine Veröffentlichung („self-distributed") und dauert meist wenige Minuten:

1. Konto anlegen unter https://addons.mozilla.org (AMO), dann https://addons.mozilla.org/developers/ → „Submit a New Add-on" → **„On your own"** (nicht „On this site").
2. `.\build.ps1` ausführen und `dist/firefox/llment_picker-<version>.zip` hochladen.
3. Nach der automatischen Prüfung die signierte `.xpi` herunterladen und per Doppelklick bzw. Drag & Drop auf ein Firefox-Fenster installieren.

Alternativ per Kommandozeile (API-Key unter https://addons.mozilla.org/developers/addon/api/key/):

```bash
npx web-ext sign --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>
```

Bei jeder neuen Version `version` im Manifest erhöhen – AMO nimmt dieselbe Versionsnummer nicht zweimal.

### Alternative ohne Signierung

Firefox Developer Edition oder Nightly mit `xpinstall.signatures.required = false` in `about:config`. Nachteil: zweiter Browser bzw. Nightly-Kanal.

### Chrome Web Store

Einmalig 5 USD Entwickler-Registrierung unter https://chrome.google.com/webstore/devconsole. Dann „Neues Element" → `dist/chrome/llment-picker-chrome-<version>.zip` hochladen, Listing-Texte, Screenshots und Berechtigungsbegründungen aus `store/listing.md` eintragen. Review dauert typisch 1–3 Tage. Chrome installiert nur Erweiterungen aus dem Store dauerhaft (entpackte Erweiterungen bleiben, solange der Ordner existiert, mit Hinweisbanner).

## Entwicklung

```powershell
.\build.ps1          # lint + beide Store-Pakete nach dist/
npx web-ext run       # Firefox mit dem Add-on starten, lädt bei Änderungen neu
```

`store/demo.html` ist eine neutrale Testseite ohne echte Daten (auch Quelle der Listing-Screenshots).

## Lizenz

MIT – siehe `LICENSE`.
