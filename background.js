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

async function inject(tabId, frameId, prelude) {
  const target = { tabId, frameIds: [frameId || 0] };
  try {
    if (prelude) await api.scripting.executeScript({ target, ...prelude });
    await api.scripting.executeScript({ target, files: ["picker.js"] });
  } catch (err) {
    // Typisch: privilegierte Seiten (about:*, chrome://, Add-on-Stores,
    // PDF-Viewer), auf denen der Browser kein Content-Script zulässt.
    console.warn("LLMent Picker: Injektion nicht möglich –", err && err.message);
  }
}

// Icon-Klick und Tastenkürzel → Picker-Modus
api.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) inject(tab.id, 0);
});

// Kontextmenü → rechtsgeklicktes Element direkt kopieren.
// Firefox liefert info.targetElementId (Auflösung im Content-Script über
// menus.getTargetElement); Chrome kennt das nicht – dort ermittelt picker.js
// das Element über den :hover-Zustand, der während des offenen Menüs stehen bleibt.
menus.removeAll().then(() => {
  menus.create({ id: MENU_ID, title: "LLMent Picker: dieses Element kopieren", contexts: ["all"] });
  menus.create({ id: MENU_SHOT_ID, title: "LLMent Picker: mit Screenshot kopieren", contexts: ["all"] });
});

menus.onClicked.addListener((info, tab) => {
  if ((info.menuItemId !== MENU_ID && info.menuItemId !== MENU_SHOT_ID) || !tab || tab.id == null) return;
  inject(tab.id, info.frameId, {
    // onSelection: Rechtsklick lag auf markiertem Text -> dritte Zeile mit dem Text
    func: (ctx) => {
      window.__elementPickerContextTarget = ctx;
    },
    args: [{ id: info.targetElementId ?? -1, onSelection: !!info.selectionText, shot: info.menuItemId === MENU_SHOT_ID }],
  });
});

// Screenshot-Anfrage des Content-Scripts: sichtbaren Tab als PNG liefern.
// captureVisibleTab ist durch activeTab gedeckt (Icon-, Kürzel- oder Menü-Aufruf).
api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "llment-capture") return;
  const windowId = sender.tab && sender.tab.windowId;
  api.tabs.captureVisibleTab(windowId, { format: "png" }).then(
    (dataUrl) => sendResponse({ dataUrl }),
    (err) => sendResponse({ error: String((err && err.message) || err) })
  );
  return true; // asynchrone Antwort
});
