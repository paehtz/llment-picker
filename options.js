// Einstellungen: werden bei jeder Änderung sofort gespeichert (storage.sync).
const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { subfolder: "LLMent Picker", saveAs: false, cssInHtml: true };
const $ = (id) => document.getElementById(id);

async function load() {
  const cfg = Object.assign({}, DEFAULTS, await api.storage.sync.get(DEFAULTS));
  $("subfolder").value = cfg.subfolder;
  $("saveAs").checked = !!cfg.saveAs;
  $("cssInHtml").checked = cfg.cssInHtml !== false;
}

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await api.storage.sync.set({ subfolder: $("subfolder").value.trim(), saveAs: $("saveAs").checked, cssInHtml: $("cssInHtml").checked });
    $("status").textContent = "Gespeichert.";
    setTimeout(() => ($("status").textContent = ""), 1500);
  }, 300);
}

$("subfolder").addEventListener("input", save);
$("saveAs").addEventListener("change", save);
$("cssInHtml").addEventListener("change", save);
load();
