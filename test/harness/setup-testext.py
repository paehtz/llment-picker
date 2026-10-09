"""Testkopien der Erweiterung aufbauen: neu (Arbeitsstand) und alt (git-Tag), je mit <all_urls>."""
import io, json, os, shutil, subprocess, sys, tarfile, tempfile
from send2trash import send2trash

REPO = r'C:\Users\henni\Code\llment-picker'
TMP = os.environ['TEMP']


def fresh(path):
    if os.path.exists(path):
        send2trash(path)
    os.makedirs(path)


def patch_manifest(dst, src_manifest):
    m = json.load(io.open(src_manifest, encoding='utf-8'))
    m['host_permissions'] = ['<all_urls>']
    io.open(os.path.join(dst, 'manifest.json'), 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=2))


# neu
new = os.path.join(TMP, 'ep-chrome-test')
fresh(new)
for f in ('picker.js', 'background.js', 'options.html', 'options.js'):
    shutil.copy(os.path.join(REPO, f), new)
for d in ('_locales', 'icons'):
    shutil.copytree(os.path.join(REPO, d), os.path.join(new, d))
patch_manifest(new, os.path.join(REPO, 'chrome', 'manifest.json'))

# alt
tag = sys.argv[1] if len(sys.argv) > 1 else 'v1.7.2'
old = os.path.join(TMP, 'ep-old-test')
fresh(old)
tar = subprocess.run(['git', '-C', REPO, 'archive', tag], capture_output=True, check=True).stdout
with tempfile.TemporaryFile() as fh:
    fh.write(tar); fh.seek(0)
    tarfile.open(fileobj=fh).extractall(old, filter='data')
patch_manifest(old, os.path.join(old, 'chrome', 'manifest.json'))
print('ok', new, old)
