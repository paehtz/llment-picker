// Element-Picker – Hintergrundskript.
//
// Tut nichts, bis der Picker aufgerufen wird. Drei Wege:
//   1. Toolbar-Icon
//   2. Tastenkürzel (Standard Strg+Alt+P, im Manifest als `_execute_action`;
//      änderbar unter about:addons → Zahnrad → Tastenkombinationen)
//   3. Kontextmenü „Element-Picker: dieses Element kopieren" – kopiert das
//      rechtsgeklickte Element direkt, ohne Picker-Modus
//
// Es gibt keinen Zustand im Hintergrund. Toggle (zweiter Aufruf = Abbruch)
// erkennt picker.js selbst am Marker im `window` des Tabs.

const MENU_ID = "element-picker-copy";

async function inject(tabId, frameId, prelude) {
  const target = { tabId, frameIds: [frameId || 0] };
  try {
    if (prelude) await browser.scripting.executeScript({ target, ...prelude });
    await browser.scripting.executeScript({ target, files: ["picker.js"] });
  } catch (err) {
    // Typisch: privilegierte Seiten (about:*, addons.mozilla.org, PDF-Viewer),
    // auf denen Firefox kein Content-Script zulässt.
    console.warn("Element-Picker: Injektion nicht möglich –", err && err.message);
  }
}

// Icon-Klick und Tastenkürzel → Picker-Modus
browser.action.onClicked.addListener((tab) => {
  if (tab && tab.id != null) inject(tab.id, 0);
});

// Kontextmenü → rechtsgeklicktes Element direkt kopieren.
// targetElementId ist eine Firefox-Erweiterung von menus.OnClickData; das
// Content-Script löst sie mit browser.menus.getTargetElement() auf.
browser.menus.removeAll().then(() =>
  browser.menus.create({
    id: MENU_ID,
    title: "Element-Picker: dieses Element kopieren",
    contexts: ["all"],
  })
);

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab || tab.id == null) return;
  inject(tab.id, info.frameId, {
    func: (id) => {
      window.__elementPickerContextTarget = id;
    },
    args: [info.targetElementId],
  });
});
