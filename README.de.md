# LLMent Picker

**Sag Deinem KI-Agenten genau, welches Element Du meinst.** Ein Klick auf ein Seitenelement kopiert URL und einen eindeutigen, lesbaren CSS-Selektor – und auf Wunsch den markierten Text, einen Screenshot des Elements oder sein gerendertes HTML samt zugehörigem CSS. Einfügen in Claude, ChatGPT, Copilot, Cursor oder jeden anderen Coding-Agenten.

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-LLMent%20Picker-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/llment-picker/oikfninjgnggbbhbdeefdlmeidminbnm)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox%20Add--ons-im%20Review-FF7139?logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/firefox/addon/llment-picker/)

English version: [README.md](README.md)

```
https://www.paehtz.de/#leistungen
#leistungen .service-list > .service:nth-of-type(2) > .service__body
"Unternehmenswebseiten: von der Sitemap über die Nutzerführung und Content-Architektur bis"
Viewport 1440×900, DPR 1.25, Screenshot 454×239 px (+24 px Rand)
Screenshot: D:\Downloads\LLMent Picker\2026-09-17_0853_paehtz.de_service-body.png
HTML: D:\Downloads\LLMent Picker\2026-09-17_0853_paehtz.de_service-body.html
```

1. vollständige Seiten-URL (inkl. Hash)
2. kürzester CSS-Selektor, der das Element eindeutig trifft
3. **nur wenn vorher Text markiert war:** der markierte Text in Anführungszeichen (max. 240 Zeichen)
4. **nur im Screenshot-Modus:** Viewport, Pixelverhältnis und Bildgröße sowie der Pfad des PNG im Download-Ordner (nächste Zeile). Die Datei ist die tokensparende Form: der Agent liest sie nur, wenn er sie braucht, sie hängt nicht in jeder weiteren Nachricht der Konversation, andere Chats können sie ebenfalls lesen, und der Agent kann aus dem Original in voller Auflösung ausschneiden. Einstellung: Datei (Standard), Zwischenablage (Bild und Text in einem Strg+V, für Web-Chats ohne Zugriff auf lokale Dateien) oder beides
5. **nur im HTML-Modus:** der Pfad der gespeicherten Datei – das gerenderte HTML des Elements mit CSS-Kontext, Claude Code liest sie direkt von der Platte

## Was es abhebt

- **Es sieht nichts, bis Du klickst.** Nur `activeTab` – keine Host-Berechtigung, kein Content-Script auf jeder Seite. Chrome zeigt keine Warnung „kann alle Ihre Daten auf allen Websites lesen".
- **Screenshot und Text in einem Einfügen.** Der Agent bekommt, was er selbst nicht rendern kann: wie das Element in Deinem Browser bei Deiner Fensterbreite wirklich aussieht.
- **Gerendertes HTML mit CSS-Kontext.** Für Inhalte, die es nur im Browser gibt (eingeloggte Portale, per JavaScript gerenderte Tabellen), und für „warum sieht das so aus": die greifenden Stylesheet-Regeln mit Datei und Media-Query plus die effektiven Layout-Werte – was der Inspektor zeigt, als Datei.
- **Lesbare Selektoren, geprüft.** IDs und sprechende Klassen als Anker, Positionen nur wo nötig, Zustands- und Animationsklassen ignoriert, Eindeutigkeit vor dem Kopieren gemessen.
- **Firefox und Chrome**, ~30 KB, vier Klartextdateien, kein Build-Schritt.

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
| **Alt+Klick** | wie Klick, zusätzlich Screenshot des Elements (+24 px Rand) als Bild in der Zwischenablage und Viewport-Angaben als vierte Zeile – für Layout-Rückmeldungen („überlappt", „verschoben"). Elemente, die größer sind als das Fenster, werden **vollständig** erfasst: die Seite wird kachelweise gescrollt und die Aufnahmen zusammengesetzt (lange Tabellen, breite Tabellen in Scroll-Containern) |
| **R** (schaltet den Aufnahme-Chip scharf, wie gehaltenes Alt oder Strg), dann Klick oder Lasso loslassen – oder Icon-Menü „Interaktion aufnehmen", oder Rechtsklick → „Interaktion hier aufnehmen" | **Interaktions-Aufnahme**, 5 s: hovern, klicken, Tasten drücken – der Picker protokolliert, was die Seite dabei tut (greifende `:hover`-/`:focus`-/`:active`-Regeln, deklarierte Übergänge und Animationen mit Hinweisen wie `transition: all` oder animierte Layout-Eigenschaft, Zustandsdiff der berechneten Stile 450 ms nach dem Eintritt des Zeigers, DOM-Änderungen, laufende Animationen aus `getAnimations()` mit Dauer und Easing, Bildrate mit langen Frames und `long-animation-frame`-Einträgen) und nimmt alle 0,55 s ein Bild auf; die Bilder werden ein Kontaktbogen mit Zeitstempeln und dem Zeiger als blauem Punkt. Für „der Hover ruckelt", „das Pop-up sitzt falsch": ein Video kann ein Sprachmodell nicht lesen, Bilder plus Daten schon. Esc beendet vorzeitig |
| **Linke Taste halten und ziehen** | **Lasso**: der aufgezogene Bereich wird statt eines Elements als Screenshot erfasst – wenn der Rahmen nicht trifft, was gemeint ist. Der Selektor zeigt auf den Container mit der größten Überdeckung, Zeile 3 sagt das samt Prozentwert; Strg legt das HTML dieses Containers dazu |
| **Strg+Klick** (Mac: ⌘) | wie Klick, zusätzlich das gerenderte HTML des Elements als Datei im Download-Ordner und der Pfad als Zeile 5. Die Datei trägt im Kopf den **CSS-Kontext wie im Inspektor**: die layoutrelevanten effektiven Werte und alle Stylesheet-Regeln, die auf Element und Elternelement greifen, mit Datei und Media-Query-Zustand – für „warum sieht das so aus" und für Inhalte, die es nur im Browser gibt (eingeloggte Portale, per JS gerenderte Tabellen) |
| **Strg+Alt+Klick** | Screenshot und HTML zusammen |

Solange der Picker läuft, trägt das Toolbar-Icon einen blauen Punkt (Tooltip „aktiv – Esc beendet"); beim Klick blitzt der Rahmen kurz auf, dann kommt der Toast.

**Elemente in iframes** lassen sich ebenfalls wählen; die Zwischenablage bekommt dann eine Zeile `Im Frame: <url> ← <iframe id="…">`, der Selektor gilt im Frame-Dokument. Der Screenshot funktioniert bei Frames gleicher Herkunft.

Über dem Rahmen zeigen vier Symbole (`</>`, Kamera, gestrichelter Kasten, Aufnahmepunkt), was der Klick zusätzlich auslöst; sie leuchten blau, solange die Taste gehalten oder das Lasso gezogen wird, und tragen den Hinweis („Strg HTML", „Alt Screenshot", „Ziehen Bereich", „R Aufnahme"), wenn das Element breit genug für die ganze Reihe ist, sonst nur die Symbole – dauerhaft, abschaltbar in den Einstellungen. Sie sind bewusst nicht klickbar – die Maus müsste sonst über andere Elemente dorthin, und der Rahmen spränge um.
| **Escape** oder erneut Icon/Kürzel | Abbruch ohne Kopieren |
| **Rechtsklick auf der Seite → LLMent Picker → „Dieses Element kopieren"** | kopiert das rechtsgeklickte Element direkt, ohne Picker-Modus; liegt der Rechtsklick auf markiertem Text, kommt der Text als dritte Zeile mit |
| … → „Mit Screenshot kopieren" / „Als HTML-Datei speichern" | dasselbe mit Bild bzw. HTML-Datei |
| **Rechtsklick auf das Toolbar-Icon → „Element wählen – mit Screenshot" / „– als HTML-Datei"** | startet den Picker mit Voreinstellung: das Symbol über dem Rahmen leuchtet schon, der Klick auf der Seite löst es ohne Taste aus |

**Einstellungen** (Add-on-/Erweiterungsverwaltung → LLMent Picker → Einstellungen): Unterordner im Download-Ordner (Standard `LLMent Picker`), „Speichern unter"-Dialog, Ziel des Screenshots (PNG-Datei – Standard –, Zwischenablage, beides), CSS-Kontext an/aus, **HTML-Dateien verschlanken** an/aus (Standard an: versteckte Formularfelder, Event-Handler, lange data-Attribute, srcset-Listen, SVG-Pfade, `<style>`-Blöcke, Kommentare, lange `data:`-URIs und wiederholte `<select>`-Optionslisten werden entfernt; die Kopfzeile nennt, was fehlt – eine DNS-Tabelle schrumpfte von 113 auf 52 KB bei gleichem Inhalt), **Zwischenablage und Dateien immer auf Englisch** (Standard aus: die Browsersprache entscheidet; die Oberfläche bleibt in jedem Fall in der Browsersprache), Tastenhinweise an/aus. Erweiterungen dürfen nur in den Download-Ordner des Browsers schreiben; ein freier Zielpfad ist nicht möglich.

Die dritte Zeile gibt es also nur, wenn Du sie durch eine Markierung ausdrücklich verlangst. Ein angeklickter Block ohne Markierung liefert nur URL und Selektor – sonst läse ein Chat „dieser Satz ist gemeint", obwohl der Block gemeint war.

Umgekehrt gilt: Markierung + Icon/Kürzel kopiert **nur** Text und Selektor, ohne Screenshot oder HTML – wer eine Textstelle markiert, will fast immer den Inhalt ändern, und der Text steht schon in Zeile 3. Für den seltenen Fall „dieser Satz bricht hässlich um" geht **Rechtsklick auf die Markierung → „mit Screenshot kopieren"**: Selektor, Text und Bild zusammen.

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
- Berechtigungen: `activeTab` + `scripting` (Injektion nur nach Aufruf), `menus`/`contextMenus` (Kontextmenü-Einträge), `clipboardWrite` (Schreiben ohne Klick-Geste, nötig für den Kontextmenü-Weg), `downloads` (HTML- und Screenshot-Dateien ablegen), `storage` (Einstellungen) – keine Host-Berechtigung, kein dauerhaftes Content-Script.
- Kontextmenü-Ziel: Firefox liefert `targetElementId` → `menus.getTargetElement`. Chrome kennt das nicht; dort bleibt der `:hover`-Zustand der Seite stehen, solange das native Menü offen ist, und das tiefste `:hover`-Element ist das rechtsgeklickte. Lässt sich kein Ziel bestimmen, startet stattdessen der Picker-Modus.
- Screenshot: `tabs.captureVisibleTab` im Hintergrundskript (durch `activeTab` gedeckt, keine weitere Berechtigung), Zuschnitt auf Element + Rand im Content-Script, Ablage als `ClipboardItem` mit `image/png` **und** `text/plain`. Elemente außerhalb des Fensters werden vorher in den Blick gescrollt. Elemente, die größer sind als der sichtbare Ausschnitt, werden gekachelt: der Bereich wird durch seine Scroll-Container und das Fenster gescrollt (innen nach außen, wie `scrollIntoView`), jede Kachel auf den Schnitt aus Fenster und Container-Ausschnitten zugeschnitten und auf eine Leinwand gezeichnet; währenddessen sind fremde `position: fixed`-Elemente ausgeblendet und `sticky`-Elemente an ihren natürlichen Platz gesetzt (`position: relative`), danach werden Stile und Scrollstände wiederhergestellt. Chrome erlaubt zwei Aufnahmen pro Sekunde, 20 Kacheln dauern also rund zehn Sekunden; der Zeiger zeigt „beschäftigt". Obergrenzen: 30 Kacheln, längste Kante 8000 px (darüber wird verkleinert, die vierte Zeile sagt es). Das Schreiben in die Zwischenablage wird bis zu viermal versucht, vorher wird das Dokument fokussiert, und Alt-Tastenereignisse werden bis zum Ende abgefangen – das Loslassen von Alt nach Alt+Klick setzte sonst den Fokus aufs Browsermenü (Chrome) bzw. die Menüleiste (Firefox), und das Schreiben wurde mit „Document is not focused" verweigert. Ob ein Ziel beide Teile mit einem Einfügen übernimmt, entscheidet das Ziel – Claude Code tut es (geprüft 17.09.2026 aus Firefox mit `test/clipboard-test.html`).
- HTML-Datei: `downloads.download` mit `data:`-URL aus dem Hintergrundskript, Dateiname `JJJJ-MM-TT_HHMM_<host>_<id-oder-klasse>.html`, absoluter Pfad aus `downloads.search`. CSS-Kontext: `getComputedStyle` (Auswahl von ~45 Layout-Eigenschaften) und ein Durchlauf über `document.styleSheets` mit `el.matches(rule.selectorText)`, Media-Queries per `matchMedia` als aktiv/inaktiv markiert; Stylesheets fremder Herkunft sind nicht lesbar und werden als solche genannt. Abschaltbar in den Einstellungen.
- iframes: Injektion zuerst im Hauptframe; startet dort der Picker-Modus, dann in alle Frames des Tabs. Ein Frame, der fertig ist, meldet das dem Hintergrundskript, das die Picker der übrigen Frames beendet.
- Sprachen: Englisch (Standard) und Deutsch über `_locales`; die Oberflächensprache des Browsers entscheidet.
- Keine Netzwerkzugriffe, keine Datenerhebung (`data_collection_permissions: none`); gespeichert werden nur die Einstellungen.
- Reines JavaScript, kein Build-Schritt, keine Abhängigkeiten.

```
manifest.json         Firefox-Manifest (Repo-Wurzel ist direkt als temporäres Add-on ladbar)
chrome/manifest.json  Chrome-Manifest (Service-Worker, contextMenus, Alt+Shift+P)
background.js         Kontextmenü-Eintrag; injiziert picker.js bei Icon / Kürzel / Menü
picker.js             Overlay, Selektor-Erzeugung, Zwischenablage, Screenshot, HTML-Export, Toast
options.html/.js      Einstellungen (Unterordner, Speichern-unter-Dialog)
icons/                PNG 16/32/48/128 (aus icon.svg gerastert)
build.ps1             baut dist/firefox/*.zip (via web-ext) und dist/chrome/*.zip
_locales/             en, de
store/                Listing-Texte, Berechtigungsbegründungen, Screenshots, Demo-Seite
test/                 clipboard-test.html: prüft, ob ein Ziel Bild + Text aus einem Strg+V übernimmt, iframe-test.html, stitch-test.html (lange/breite Tabellen, Lasso), record-test.html (Hover-Karte, Tooltip, Panel, langer Frame)
```

## Installation

**Chrome:** [Chrome Web Store](https://chromewebstore.google.com/detail/llment-picker/oikfninjgnggbbhbdeefdlmeidminbnm)

**Firefox:** [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/llment-picker/) (Listing im Review); bis dahin die signierte `.xpi` aus den [Releases](https://github.com/paehtz/llment-picker/releases).

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
