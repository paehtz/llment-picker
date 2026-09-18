// Einstellungen: werden bei jeder Änderung sofort gespeichert (storage.sync).
const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { subfolder: "LLMent Picker", saveAs: false, cssInHtml: true, hideHints: false, shotTarget: "both", htmlSlim: true };
const $ = (id) => document.getElementById(id);
const t = (k) => api.i18n.getMessage(k) || k;
document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
document.documentElement.lang = api.i18n.getUILanguage();

async function load() {
  const cfg = Object.assign({}, DEFAULTS, await api.storage.sync.get(DEFAULTS));
  $("subfolder").value = cfg.subfolder;
  $("saveAs").checked = !!cfg.saveAs;
  $("cssInHtml").checked = cfg.cssInHtml !== false;
  $("hideHints").checked = !!cfg.hideHints;
  $("htmlSlim").checked = cfg.htmlSlim !== false;
  const r = document.querySelector(`input[name=shotTarget][value="${cfg.shotTarget}"]`) || document.querySelector('input[name=shotTarget][value="both"]');
  r.checked = true;
}
const shotTargetValue = () => (document.querySelector("input[name=shotTarget]:checked") || {}).value || "both";

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await api.storage.sync.set({ subfolder: $("subfolder").value.trim(), saveAs: $("saveAs").checked, cssInHtml: $("cssInHtml").checked, hideHints: $("hideHints").checked, shotTarget: shotTargetValue(), htmlSlim: $("htmlSlim").checked });
    $("status").textContent = t("optSaved");
    setTimeout(() => ($("status").textContent = ""), 1500);
  }, 300);
}

$("subfolder").addEventListener("input", save);
$("saveAs").addEventListener("change", save);
$("cssInHtml").addEventListener("change", save);
$("hideHints").addEventListener("change", save);
$("htmlSlim").addEventListener("change", save);
document.querySelectorAll("input[name=shotTarget]").forEach((r) => r.addEventListener("change", save));
load();
