"""Firefox-Testkopien (neu = Arbeitsstand, alt = git-Tag) mit Test-Einstieg:
Inhaltsskript testhook.js startet den Picker auf postMessage der Seite und
spiegelt das Kopierergebnis in ein DOM-Attribut (die Seite sieht die isolierte Welt nicht)."""
import io, json, os, shutil, subprocess, sys, tarfile, tempfile
from send2trash import send2trash

REPO = r'C:\Users\henni\Code\llment-picker'
TMP = os.environ['TEMP']
HOOK = '''window.addEventListener("message", (e) => {
  if (e.data && e.data.__llmentTestStart && window === window.top) (globalThis.browser || chrome).runtime.sendMessage({ type: "llment-test-start" });
});
setInterval(() => { if (window.__elementPickerLast) { document.documentElement.setAttribute("data-llment-test-last", window.__elementPickerLast); window.__elementPickerLast = null; } }, 200);
'''
BG = '''
// TEST-EINSTIEG (nur Testkopie)
api.runtime.onMessage.addListener((m, sender) => { if (m && m.type === "llment-test-start" && sender.tab) inject(sender.tab.id, 0, null, true); });
'''


def build(dst, src_root):
    if os.path.exists(dst):
        send2trash(dst)
    shutil.copytree(src_root, dst, ignore=shutil.ignore_patterns('dist', 'store', 'test', 'node_modules', '.git', 'chrome'))
    m = json.load(io.open(os.path.join(dst, 'manifest.json'), encoding='utf-8'))
    m['host_permissions'] = ['<all_urls>']
    m['content_scripts'] = [{'matches': ['http://127.0.0.1/*', 'http://localhost/*'], 'js': ['testhook.js'], 'run_at': 'document_idle', 'all_frames': True}]
    io.open(os.path.join(dst, 'manifest.json'), 'w', encoding='utf-8').write(json.dumps(m, ensure_ascii=False, indent=2))
    io.open(os.path.join(dst, 'testhook.js'), 'w', encoding='utf-8').write(HOOK)
    io.open(os.path.join(dst, 'background.js'), 'a', encoding='utf-8').write(BG)


build(os.path.join(TMP, 'ff-new-test'), REPO)
tag = sys.argv[1] if len(sys.argv) > 1 else 'v1.7.2'
src = tempfile.mkdtemp(prefix='ff-src-')
tar = subprocess.run(['git', '-C', REPO, 'archive', tag], capture_output=True, check=True).stdout
with tempfile.TemporaryFile() as fh:
    fh.write(tar); fh.seek(0)
    tarfile.open(fileobj=fh).extractall(src, filter='data')
build(os.path.join(TMP, 'ff-old-test'), src)
print('ok')
