// Einstellungen: werden bei jeder Änderung sofort gespeichert (storage.sync).
const api = globalThis.browser ?? globalThis.chrome;
const DEFAULTS = { subfolder: "LLMent Picker", saveAs: false, cssInHtml: true, hideHints: false, shotTarget: "file", htmlSlim: true, clipEnglish: false, envBrowser: true, envOs: false, envViewport: true, envFlags: true, envBox: true };
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
  $("clipEnglish").checked = !!cfg.clipEnglish;
  for (const k of ["envBrowser", "envOs", "envViewport", "envFlags", "envBox"]) $(k).checked = cfg[k] !== false && !(k === "envOs" && cfg[k] == null);
  const r = document.querySelector(`input[name=shotTarget][value="${cfg.shotTarget}"]`) || document.querySelector('input[name=shotTarget][value="file"]');
  r.checked = true;
}
const shotTargetValue = () => (document.querySelector("input[name=shotTarget]:checked") || {}).value || "file";

let timer;
function save() {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await api.storage.sync.set({ subfolder: $("subfolder").value.trim(), saveAs: $("saveAs").checked, cssInHtml: $("cssInHtml").checked, hideHints: $("hideHints").checked, shotTarget: shotTargetValue(), htmlSlim: $("htmlSlim").checked, clipEnglish: $("clipEnglish").checked, envBrowser: $("envBrowser").checked, envOs: $("envOs").checked, envViewport: $("envViewport").checked, envFlags: $("envFlags").checked, envBox: $("envBox").checked });
    $("status").textContent = t("optSaved");
    setTimeout(() => ($("status").textContent = ""), 1500);
  }, 300);
}

$("subfolder").addEventListener("input", save);
$("saveAs").addEventListener("change", save);
$("cssInHtml").addEventListener("change", save);
$("hideHints").addEventListener("change", save);
$("htmlSlim").addEventListener("change", save);
$("clipEnglish").addEventListener("change", save);
for (const k of ["envBrowser", "envOs", "envViewport", "envFlags", "envBox"]) $(k).addEventListener("change", save);
document.querySelectorAll("input[name=shotTarget]").forEach((r) => r.addEventListener("change", save));

// Zusatzberechtigung fuer eingebettete Frames fremder Herkunft (HubSpot-Formulare,
// Zahlungsfelder, Cookie-Banner): activeTab deckt nur die Herkunft der Seite selbst ab.
// Nicht gespeicherter Schalter, sondern der echte Stand der Berechtigung.
const FRAMES = { origins: ["<all_urls>"] };
async function loadFrames() {
  try { $("frames").checked = await api.permissions.contains(FRAMES); } catch { $("frames").disabled = true; }
}
$("frames").addEventListener("change", async (e) => {
  try {
    const ok = e.target.checked ? await api.permissions.request(FRAMES) : !(await api.permissions.remove(FRAMES));
    e.target.checked = ok;
    $("status").textContent = t(ok ? "optFramesOn" : "optFramesOff");
    setTimeout(() => ($("status").textContent = ""), 2500);
  } catch (err) {
    e.target.checked = await api.permissions.contains(FRAMES).catch(() => false);
    $("status").textContent = (err && err.message) || String(err);
  }
});
load();
loadFrames();
