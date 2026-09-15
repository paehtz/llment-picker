# Baut die Store-Pakete für Firefox (AMO) und Chrome (Web Store) nach dist/.
# Aufruf: .\build.ps1   (braucht Node für web-ext, sonst keine Abhängigkeiten)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$v = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$cv = (Get-Content chrome/manifest.json -Raw | ConvertFrom-Json).version
if ($v -ne $cv) { throw "Versionen weichen ab: manifest.json=$v, chrome/manifest.json=$cv" }

# Firefox: web-ext prüft und packt (nur die Laufzeitdateien)
npx --yes web-ext lint --source-dir . --ignore-files "dist/**" "chrome/**" "store/**" "build.ps1" "README.md" ".gitignore" "icons/icon.svg"
npx --yes web-ext build --source-dir . --artifacts-dir dist/firefox --overwrite-dest --ignore-files "dist/**" "chrome/**" "store/**" "build.ps1" "README.md" ".gitignore" "icons/icon.svg"

# Chrome: gleiche Laufzeitdateien, eigenes Manifest
$out = "dist/chrome/llment-picker"
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
New-Item -ItemType Directory -Force "$out/icons" | Out-Null
Copy-Item background.js, picker.js $out
Copy-Item icons/*.png "$out/icons"
Copy-Item chrome/manifest.json $out
$zip = "dist/chrome/llment-picker-chrome-$v.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path "$out/*" -DestinationPath $zip
Write-Host "Fertig: dist/firefox/llment_picker-$v.zip und $zip"
