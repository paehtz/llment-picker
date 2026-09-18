// LLMent Picker – Hintergrundskript (Firefox: Event-Page, Chrome: Service-Worker).
//
// Tut nichts, bis der Picker aufgerufen wird. Drei Wege:
//   1. Toolbar-Icon
//   2. Tastenkürzel (`_execute_action`; Firefox Strg+Alt+P, Chrome Alt+Shift+P –
//      Chrome erlaubt keine Strg+Alt-Kombinationen; änderbar in den
//      Add-on-/Erweiterungs-Einstellungen des Browsers)
//   3. Kontextmenü „LLMent Picker: dieses Element kopieren" – kopiert das
//      rechtsgeklickte Element direkt, ohne Picker-Modus
//
// Es gibt keinen Zustand im Hintergrund. Toggle (zweiter Aufruf = Abbruch)
// erkennt picker.js selbst am Marker im `window` des Tabs.

const api = globalThis.browser ?? globalThis.chrome;
const menus = api.menus ?? api.contextMenus;
const MENU_ID = "llment-picker-copy";
const MENU_SHOT_ID = "llment-picker-copy-shot";
const MENU_HTML_ID = "llment-picker-copy-html";
const DEFAULTS = { subfolder: "LLMent Picker", saveAs: false };

const T = (k, ...subs) => api.i18n.getMessage(k, subs.map(String)) || k;

// Injektion: erst der Hauptframe; startet dort der Picker-Modus, folgen alle
// weiteren Frames (iframes), damit auch Elemente darin wählbar sind. Ein
// laufender Picker im Hauptframe wird im zweiten Durchlauf nicht umgeschaltet.
async function inject(tabId, frameId, prelude, allFrames) {
  const target = { tabId, frameIds: [frameId || 0] };
  try {
    if (prelude) await api.scripting.executeScript({ target, ...prelude });
    const res = await api.scripting.executeScript({ target, files: ["picker.js"] });
    if (allFrames && res && res[0] && res[0].result === "picker") {
      const all = { tabId, allFrames: true };
      if (prelude) await api.scripting.executeScript({ target: all, ...prelude });
      await api.scripting.executeScript({ target: all, func: () => { window.__llmentPass2 = true; } });
      await api.scripting.executeScript({ target: all, files: ["picker.js"] });
    }
  } catch (err) {
    // Typisch: privilegierte Seiten (about:*, chrome://, Add-on-Stores,
    // PDF-Viewer), auf denen der Browser kein Content-Script zulässt.
    console.warn("LLMent Picker: Injektion nicht möglich –", err && err.message);
  }
}

// Icon-Klick und Tastenkürzel → Picker-Modus
api.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) inject(tab.id, 0, null, true);
});

// Kontextmenü → rechtsgeklicktes Element direkt kopieren.
// Firefox liefert info.targetElementId (Auflösung im Content-Script über
// menus.getTargetElement); Chrome kennt das nicht – dort ermittelt picker.js
// das Element über den :hover-Zustand, der während des offenen Menüs stehen bleibt.
// Seitenmenü: wirkt auf das rechtsgeklickte Element. Mehrere Einträge bündeln
// Chrome und Firefox unter dem Add-on-Namen, daher kein Präfix im Titel.
const PAGE_CTX = ["page", "frame", "selection", "link", "image", "video", "audio", "editable"];
// Icon-Menü: startet den Picker mit Voreinstellung (Symbol leuchtet, Klick löst aus).
const PICK_ID = "llment-pick", PICK_SHOT_ID = "llment-pick-shot", PICK_HTML_ID = "llment-pick-html";
const PRESETS = { [PICK_ID]: { shot: false, html: false }, [PICK_SHOT_ID]: { shot: true, html: false }, [PICK_HTML_ID]: { shot: false, html: true } };

menus.removeAll().then(() => {
  menus.create({ id: MENU_ID, title: T("menuCopy"), contexts: PAGE_CTX });
  menus.create({ id: MENU_SHOT_ID, title: T("menuCopyShot"), contexts: PAGE_CTX });
  menus.create({ id: MENU_HTML_ID, title: T("menuCopyHtml"), contexts: PAGE_CTX });
  const actionCtx = (ctx) => {
    menus.create({ id: PICK_ID, title: T("menuPick"), contexts: [ctx] });
    menus.create({ id: PICK_SHOT_ID, title: T("menuPickShot"), contexts: [ctx] });
    menus.create({ id: PICK_HTML_ID, title: T("menuPickHtml"), contexts: [ctx] });
  };
  try { actionCtx("action"); } catch { try { actionCtx("browser_action"); } catch {} }
});

menus.onClicked.addListener((info, tab) => {
  if (!tab || tab.id == null) return;
  if (PRESETS[info.menuItemId]) {
    inject(tab.id, 0, {
      func: (preset) => {
        window.__elementPickerPreset = preset;
      },
      args: [PRESETS[info.menuItemId]],
    }, true);
    return;
  }
  if (![MENU_ID, MENU_SHOT_ID, MENU_HTML_ID].includes(info.menuItemId)) return;
  inject(tab.id, info.frameId, {
    // onSelection: Rechtsklick lag auf markiertem Text -> dritte Zeile mit dem Text
    func: (ctx) => {
      window.__elementPickerContextTarget = ctx;
    },
    args: [{ id: info.targetElementId ?? -1, onSelection: !!info.selectionText, shot: info.menuItemId === MENU_SHOT_ID, html: info.menuItemId === MENU_HTML_ID }],
  });
});

// Screenshot-Anfrage des Content-Scripts: sichtbaren Tab als PNG liefern.
// captureVisibleTab ist durch activeTab gedeckt (Icon-, Kürzel- oder Menü-Aufruf).
// Aktivzustand am Toolbar-Icon: blauer Punkt + Tooltip, solange der Picker läuft
async function setActiveBadge(tabId, active) {
  try {
    await api.action.setBadgeText({ tabId, text: active ? "\u25cf" : "" });
    if (active) {
      await api.action.setBadgeBackgroundColor({ tabId, color: "#0a84ff" });
      if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ tabId, color: "#0a84ff" });
    }
    await api.action.setTitle({ tabId, title: active ? T("actionTitleActive") : T("actionTitle") });
  } catch (err) {
    console.warn("LLMent Picker: Badge nicht gesetzt \u2013", err && err.message);
  }
}

// Seitenwechsel beendet den Picker implizit → Badge zurücksetzen
api.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === "loading") setActiveBadge(tabId, false);
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "llment-state") {
    if (sender.tab && sender.tab.id != null) {
      setActiveBadge(sender.tab.id, !!msg.active);
      // Ein Frame ist fertig → Picker in allen anderen Frames des Tabs beenden
      if (!msg.active) api.tabs.sendMessage(sender.tab.id, { type: "llment-cancel" }).catch(() => {});
    }
    return;
  }
  if (msg.type === "llment-capture") {
    const windowId = sender.tab && sender.tab.windowId;
    api.tabs.captureVisibleTab(windowId, { format: "png" }).then(
      (dataUrl) => sendResponse({ dataUrl }),
      (err) => sendResponse({ error: String((err && err.message) || err) })
    );
    return true; // asynchrone Antwort
  }
  if (msg.type === "llment-i18n-en") {
    // Englische Sprachtabelle für die Einstellung „Zwischenablage immer Englisch"
    fetch(api.runtime.getURL("_locales/en/messages.json")).then((r) => r.json()).then(
      (messages) => sendResponse({ messages }),
      (err) => sendResponse({ error: String((err && err.message) || err) })
    );
    return true;
  }
  if (msg.type === "llment-save") {
    saveFile(msg).then(
      (path) => sendResponse({ path }),
      (err) => sendResponse({ error: String((err && err.message) || err) })
    );
    return true;
  }
});

// HTML-Datei in den Download-Ordner des Browsers legen (Unterordner und
// „Speichern unter" aus den Einstellungen). Erweiterungen dürfen nur dorthin
// schreiben; der absolute Pfad kommt aus downloads.search zurück.
// { filename, content, mime } für Text (HTML) oder { filename, dataUrl } für Binärdaten (PNG)
async function saveFile({ filename, content, mime, dataUrl }) {
  const cfg = Object.assign({}, DEFAULTS, await api.storage.sync.get(DEFAULTS));
  const safe = filename.replace(/[\\/:*?"<>|]/g, "-");
  const sub = (cfg.subfolder || "").trim().replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+/, "");
  // Firefox lehnt data:-URLs für downloads.download ab → Blob-URL (Event-Page hat
  // URL.createObjectURL); Chromes Service-Worker hat das nicht → data:-URL.
  const canBlob = typeof URL.createObjectURL === "function";
  let url;
  if (canBlob) {
    const blob = dataUrl ? await (await fetch(dataUrl)).blob() : new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    url = URL.createObjectURL(blob);
  } else {
    url = dataUrl || "data:" + (mime || "text/plain;charset=utf-8") + "," + encodeURIComponent(content);
  }
  let id;
  try {
    id = await api.downloads.download({
      url,
      filename: sub ? sub + "/" + safe : safe,
      saveAs: !!cfg.saveAs,
      conflictAction: "uniquify",
    });
  } finally {
    if (canBlob) setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // auf Abschluss warten, dann absoluten Pfad holen
  for (let i = 0; i < 100; i++) {
    const [item] = await api.downloads.search({ id });
    if (item && item.state === "complete") return item.filename;
    if (item && item.state === "interrupted") throw new Error(item.error || "abgebrochen");
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("Zeitüberschreitung beim Speichern");
}
