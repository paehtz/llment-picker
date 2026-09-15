// Element-Picker – Hintergrundskript.
//
// Tut nichts, bis das Toolbar-Icon geklickt oder das Tastenkürzel (Alt+Shift+P,
// im Manifest als `_execute_action`) gedrückt wird. Dann wird picker.js in den
// aktiven Tab injiziert. Ist der Picker dort schon aktiv, erkennt picker.js das
// selbst (Marker am `window`) und bricht ab – ein zweiter Klick aufs Icon wirkt
// also als Abbruch. Es gibt keinen Zustand im Hintergrund.

browser.action.onClicked.addListener(async (tab) => {
  if (!tab || tab.id == null) return;
  try {
    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["picker.js"],
    });
  } catch (err) {
    // Typisch: privilegierte Seiten (about:*, addons.mozilla.org, PDF-Viewer),
    // auf denen Firefox kein Content-Script zulässt.
    console.warn("Element-Picker: Injektion nicht möglich –", err && err.message);
  }
});
