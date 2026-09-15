# Element-Picker (Firefox-Add-on)

Ein Klick auf ein Seitenelement kopiert drei Zeilen in die Zwischenablage – zum
Einfügen in einen Chat mit einem Coding-Agenten („dieses Element meine ich"):

```
https://www.wolf-automobile.com/team/#bereiche
#bereiche .values > .value:nth-of-type(2) > p
"Rechnungserstellung, Proformas und die Belege für Ihre Buchh…"
```

1. vollständige Seiten-URL (inkl. Hash)
2. kürzester CSS-Selektor, der das Element eindeutig trifft
3. sichtbarer Textanfang (max. 60 Zeichen)

## Bedienung

| Aktion | Wirkung |
|---|---|
| Toolbar-Icon oder **Alt+Shift+P** | Picker starten – Cursor wird zum Fadenkreuz, Element unter der Maus bekommt einen Rahmen |
| Klick | kopiert die drei Zeilen, Picker beendet sich, Toast „Kopiert" |
| **Escape** oder erneut Icon/Kürzel | Abbruch ohne Kopieren |

Das Kürzel lässt sich ändern unter `about:addons` → Zahnrad → „Tastenkombinationen für Erweiterungen verwalten".

## Selektor-Logik

Reihenfolge der Bevorzugung:

1. **ID** am Element selbst → `#id`, fertig.
2. Sonst: nächster Vorfahr mit ID als **Anker** (`#bereiche …`), darunter Kette aus **sprechenden Klassen** (`.values > .value`) oder Tag-Namen.
3. `:nth-of-type(n)` nur, wenn Geschwister sonst mehrdeutig wären – und dann immer mit dem Elternsegment davor, damit lesbar bleibt, „das zweite wovon".
4. Die Kette wird vom Ziel her Segment für Segment verlängert, bis `document.querySelectorAll(sel).length === 1`.

Zustands-/Animationsklassen (`active`, `rv`, `is-*`, `js-*`, `aos-*`, …) und generiert aussehende Namen (Hashes, lange Ziffern) werden übersprungen.

## Technik

- WebExtension, Manifest V3, Firefox ≥ 140
- Berechtigungen: nur `activeTab` + `scripting` – keine Host-Berechtigung, kein dauerhaftes Content-Script. `picker.js` wird erst beim Aufruf in den aktiven Tab injiziert.
- Keine Netzwerkzugriffe, kein Speicher, keine Datenerhebung (`data_collection_permissions: none`).
- Reines JavaScript, kein Build-Schritt, keine Abhängigkeiten.

```
manifest.json   Metadaten, Berechtigungen, Tastenkürzel
background.js   injiziert picker.js beim Icon-Klick / Kürzel
picker.js       Overlay, Selektor-Erzeugung, Zwischenablage, Toast
icon.svg        Toolbar-Icon
```

## Installation

### Zum Testen (temporär – nach Firefox-Neustart wieder weg)

1. `about:debugging` → „Dieser Firefox" → „Temporäres Add-on laden…"
2. `manifest.json` aus diesem Ordner auswählen.

### Dauerhaft: bei Mozilla signieren lassen (empfohlen)

Firefox installiert nur signierte Add-ons dauerhaft. Die Signierung ist kostenlos, braucht keine Veröffentlichung („self-distributed") und dauert meist wenige Minuten:

1. Konto anlegen unter https://addons.mozilla.org (AMO), dann https://addons.mozilla.org/developers/ → „Submit a New Add-on" → **„On your own"** (nicht „On this site").
2. Ordner als ZIP hochladen (nur die vier Dateien, ohne `.git`, README optional):
   ```bash
   npx web-ext build --source-dir . --artifacts-dir dist --overwrite-dest
   ```
   erzeugt `dist/element_picker-1.0.0.zip`.
3. Nach der automatischen Prüfung die signierte `.xpi` herunterladen und per Doppelklick bzw. Drag & Drop auf ein Firefox-Fenster installieren.

Alternativ per Kommandozeile (API-Key unter https://addons.mozilla.org/developers/addon/api/key/):

```bash
npx web-ext sign --channel unlisted --api-key <JWT issuer> --api-secret <JWT secret>
```

Bei jeder neuen Version `version` im Manifest erhöhen – AMO nimmt dieselbe Versionsnummer nicht zweimal.

### Alternative ohne Signierung

Firefox Developer Edition oder Nightly mit `xpinstall.signatures.required = false` in `about:config`. Nachteil: zweiter Browser bzw. Nightly-Kanal.

## Entwicklung

```bash
npx web-ext lint      # Manifest/Code gegen Firefox-Regeln prüfen
npx web-ext run       # Firefox mit dem Add-on starten, lädt bei Änderungen neu
```
