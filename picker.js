// LLMent Picker – Content-Script.
//
// Wird bei jedem Aufruf frisch injiziert. Zwei Wege hinein:
//
//   a) Icon / Tastenkürzel → Picker-Modus: Hover zeichnet einen Rahmen
//      (Overlay, das Ziel selbst wird nicht angefasst), Klick kopiert.
//      Läuft der Picker bereits (Marker an `window`), wird er abgebrochen.
//   b) Kontextmenü „LLMent Picker: dieses Element kopieren" → das Hintergrund-
//      skript hinterlegt vorher `window.__elementPickerContextTarget`
//      (targetElementId aus dem Menü-Klick); das Element wird sofort kopiert,
//      ohne Picker-Modus.
//
// Kopiert werden drei Zeilen:
//   1. vollständige Seiten-URL (inkl. Hash)
//   2. kürzester eindeutiger CSS-Selektor
//   3. nur wenn vorher Text auf der Seite markiert war: der markierte Text in
//      Anführungszeichen (max. 240 Zeichen) – dann wird das Element, das die
//      Markierung enthält, sofort kopiert, ohne Picker-Modus

(() => {
  const KEY = "__elementPickerInstance";
  const api = globalThis.browser ?? globalThis.chrome;
  const CTX = "__elementPickerContextTarget";

  // ───────────────────────── Selektor-Erzeugung ───────────────────────────

  // Klassen, die Zustand/Animation beschreiben statt Struktur – als Anker
  // unbrauchbar, weil sie kommen und gehen.
  const STATE_CLASS = /^(active|inactive|open|closed|visible|invisible|hidden|show|hide|shown|selected|current|focus|focused|hover|disabled|enabled|loaded|loading|lazyloaded|animated|animate|in|out|on|off|in-view|inview|entered|revealed|reveal|rv|wow|fade|fade-in|collapse|collapsing|collapsed|expanded|ready|init|initialized|mounted|hydrated|aos-.*|et_.*|js-.*|is-.*|has-.*|w-.*|sc-.*|css-.*|jsx-.*|svelte-.*|ng-.*|v-.*|_.*|.*--.*(active|open|visible|hidden).*)$/i;
  // Generiert aussehende Namen: Hash-Anteile, lange Ziffernfolgen.
  const GENERATED = /[0-9a-f]{6,}|\d{4,}|^[a-z]{1,2}\d+$|^:/i;

  const cssEscape = (s) =>
    window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/([^\w-])/g, "\\$1");

  function classList(el) {
    const raw = el.getAttribute && el.getAttribute("class");
    return raw ? raw.trim().split(/\s+/).filter(Boolean) : [];
  }

  function usableId(el) {
    const id = el.id;
    if (!id || /\s/.test(id) || GENERATED.test(id)) return null;
    return document.querySelectorAll("#" + cssEscape(id)).length === 1 ? id : null;
  }

  function bestClass(el) {
    return classList(el).find((c) => !STATE_CLASS.test(c) && !GENERATED.test(c)) || null;
  }

  // Segment für ein Element relativ zu seinem Elternelement: Klasse oder Tag,
  // plus :nth-of-type nur, wenn Geschwister sonst mehrdeutig wären.
  function segmentFor(el) {
    const tag = el.tagName.toLowerCase();
    const cls = bestClass(el);
    let seg = cls ? "." + cssEscape(cls) : tag;
    const parent = el.parentElement;
    if (!parent) return { seg, positional: false };

    const sameTag = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    const matches = Array.from(parent.querySelectorAll(":scope > " + seg));
    if (matches.length > 1) {
      // :nth-of-type zählt pro Tag, die Klasse aber tag-übergreifend – tragen
      // Geschwister verschiedener Tags dieselbe Klasse, muss der Tag mit rein
      // (sonst trifft `.in:nth-of-type(1)` das erste h1 UND das erste p).
      if (cls && !matches.every((m) => m.tagName === el.tagName)) seg = tag + seg;
      seg += `:nth-of-type(${sameTag.indexOf(el) + 1})`;
      return { seg, positional: true };
    }
    return { seg, positional: false };
  }

  const isUnique = (sel) => {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };

  function buildSelector(target) {
    // 1. Eigene ID? Fertig.
    const ownId = usableId(target);
    if (ownId) return "#" + cssEscape(ownId);

    // 2. Kette nach oben bis zum nächsten ID-Anker (oder html).
    const chain = []; // vom Ziel aufwärts
    let anchor = null;
    let el = target;
    while (el && el !== document.documentElement) {
      const id = usableId(el);
      if (id && el !== target) {
        anchor = "#" + cssEscape(id);
        break;
      }
      chain.push({ el, ...segmentFor(el) });
      el = el.parentElement;
    }

    // 3. Kürzeste eindeutige Fassung: Segmente vom Ziel her mit `>` verketten,
    //    Anker (falls vorhanden) mit Nachfahren-Kombinator davor. Ein
    //    positionelles Segment (:nth-of-type) wird immer durch sein
    //    Elternsegment qualifiziert, damit lesbar ist, „das zweite wovon".
    for (let n = 1; n <= chain.length; n++) {
      if (chain[n - 1].positional && n < chain.length) continue;
      const tail = chain
        .slice(0, n)
        .map((c) => c.seg)
        .reverse()
        .join(" > ");
      // `anker > kette` ist nur korrekt, wenn die Kette bis zum direkten
      // Kind des Ankers reicht – sonst trifft sie ein fremdes Element.
      const candidates = anchor
        ? n === chain.length
          ? [anchor + " " + tail, anchor + " > " + tail]
          : [anchor + " " + tail]
        : [tail];
      for (const cand of candidates) if (isUnique(cand)) return cand;
    }

    // 4. Rückfall: voller Pfad mit Positionen ab Anker/html.
    const full = chain
      .map((c) => {
        const idx = Array.from(c.el.parentElement.children)
          .filter((s) => s.tagName === c.el.tagName)
          .indexOf(c.el) + 1;
        return `${c.el.tagName.toLowerCase()}:nth-of-type(${idx})`;
      })
      .reverse()
      .join(" > ");
    return (anchor || "html") + " > " + full;
  }

  // Markierter Text auf der Seite + das Element, das die Markierung umschließt.
  // Nur eine echte Markierung liefert die dritte Zeile – ein angeklickter
  // Block ohne Markierung bekommt keine, sonst läse ein Chat „dieser Text ist
  // gemeint", obwohl der Block gemeint war.
  const MAX_TEXT = 240;
  function selectionTarget() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (!text) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el === document.documentElement || el.hasAttribute("data-llment-picker")) return null;
    return { el, text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT).trimEnd() + "…" : text };
  }

  function payloadFor(el, text, shotInfo) {
    const lines = [location.href, buildSelector(el)];
    if (text) lines.push(JSON.stringify(text));
    if (shotInfo) lines.push(shotInfo);
    return lines.join("\n");
  }

  // ───────────────────────── Screenshot des Elements ──────────────────────
  // Das Hintergrundskript liefert den sichtbaren Tab als PNG (captureVisibleTab,
  // von activeTab gedeckt); hier wird auf Element + Rand zugeschnitten.
  const SHOT_PAD = 24;
  const outOfView = (r) => r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth;

  async function captureElement(el) {
    let r = el.getBoundingClientRect();
    if (outOfView(r)) {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      await new Promise((f) => setTimeout(f, 350));
      r = el.getBoundingClientRect();
    }
    const clipped = outOfView(r);
    const x0 = Math.max(0, r.left - SHOT_PAD), y0 = Math.max(0, r.top - SHOT_PAD);
    const x1 = Math.min(innerWidth, r.right + SHOT_PAD), y1 = Math.min(innerHeight, r.bottom + SHOT_PAD);
    await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    const res = await api.runtime.sendMessage({ type: "llment-capture" });
    if (!res || !res.dataUrl) throw new Error((res && res.error) || "keine Aufnahme");
    const img = new Image();
    await new Promise((ok, err) => { img.onload = ok; img.onerror = err; img.src = res.dataUrl; });
    const k = img.naturalWidth / innerWidth; // tatsächlicher Pixelfaktor der Aufnahme
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round((x1 - x0) * k));
    cv.height = Math.max(1, Math.round((y1 - y0) * k));
    cv.getContext("2d").drawImage(img, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, 0, 0, cv.width, cv.height);
    const blob = await new Promise((f) => cv.toBlob(f, "image/png"));
    const dpr = String(Math.round(devicePixelRatio * 100) / 100);
    const info = `Viewport ${innerWidth}×${innerHeight}, DPR ${dpr}, Screenshot ${cv.width}×${cv.height} px (+${SHOT_PAD} px Rand)` +
      (clipped ? ", Element größer als das Fenster: nur sichtbarer Teil" : "");
    return { blob, info };
  }

  async function copyWithImage(text, blob) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob, "text/plain": new Blob([text], { type: "text/plain" }) }),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  // ───────────────────────── Zwischenablage & Toast ───────────────────────
  const Z = "2147483647";

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Rückfall: execCommand – funktioniert innerhalb einer Nutzergeste.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function toast(msg, good) {
    const t = document.createElement("div");
    t.setAttribute("data-llment-picker", "");
    t.textContent = msg;
    t.style.cssText = `position:fixed;top:16px;right:16px;z-index:${Z};pointer-events:none;
      font:14px/1 system-ui,sans-serif;color:#fff;background:${good ? "#1a7f37" : "#57606a"};
      padding:10px 14px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.25);
      opacity:0;transition:opacity .15s;`;
    document.documentElement.appendChild(t);
    requestAnimationFrame(() => (t.style.opacity = "1"));
    setTimeout(() => {
      t.style.opacity = "0";
      setTimeout(() => t.remove(), 200);
    }, 1400);
  }

  async function copyElement(el, text, withShot) {
    let shot = null;
    if (withShot) {
      try {
        shot = await captureElement(el);
      } catch (e) {
        console.warn("LLMent Picker: Screenshot fehlgeschlagen –", e && e.message);
      }
    }
    const payload = payloadFor(el, text, shot && shot.info);
    let ok = false, msg;
    if (shot && (await copyWithImage(payload, shot.blob))) {
      ok = true; msg = "Kopiert (mit Screenshot)";
    } else {
      ok = await copy(payload);
      msg = !ok ? "Kopieren fehlgeschlagen" : withShot ? "Nur Text kopiert (Screenshot nicht möglich)" : "Kopiert";
    }
    toast(msg, ok && !(withShot && !shot));
    window.__elementPickerLast = payload; // für Tests / Debugging
    window.__elementPickerLastShot = shot ? { bytes: shot.blob && shot.blob.size, info: shot.info } : null;
    return ok;
  }

  // ───────────────────────── Weg b: Kontextmenü ───────────────────────────
  // Firefox: targetElementId → menus.getTargetElement. Chrome kennt das nicht;
  // dort bleibt der :hover-Zustand der Seite stehen, solange das native Menü
  // offen ist – das tiefste :hover-Element ist das rechtsgeklickte.
  function contextTarget(id) {
    try {
      const el = globalThis.browser?.menus?.getTargetElement?.(id);
      if (el) return el;
    } catch {}
    const hovered = document.querySelectorAll(":hover");
    const el = hovered[hovered.length - 1];
    return el && !el.closest("[data-llment-picker]") ? el : null;
  }

  let contextFallback = false;
  if (window[CTX] != null) {
    const { id, onSelection, shot } = window[CTX];
    delete window[CTX];
    if (window[KEY]) window[KEY].cancel(true);
    // Rechtsklick lag auf markiertem Text → Element der Markierung + Text
    const marked = onSelection ? selectionTarget() : null;
    if (marked) {
      copyElement(marked.el, marked.text, shot);
      return;
    }
    const el = contextTarget(id);
    if (el) {
      copyElement(el, undefined, shot);
      return;
    }
    // Kein Ziel bestimmbar → in den Picker-Modus fallen statt aufzugeben.
    contextFallback = true;
  }

  // ───────────────────────── Weg a: Picker-Modus (Toggle) ─────────────────
  if (window[KEY]) {
    window[KEY].cancel();
    return;
  }

  // Ist Text markiert, ist das Ziel schon klar: Element + Markierung kopieren,
  // kein Picker-Modus. (Für den Picker-Modus vorher die Markierung aufheben.)
  if (!contextFallback) {
    const marked = selectionTarget();
    if (marked) {
      copyElement(marked.el, marked.text);
      return;
    }
  }

  // Kamera-Knopf in der rechten oberen Ecke des Rahmens: Klick = mit Screenshot
  const cam = document.createElement("div");
  cam.setAttribute("data-llment-picker", "");
  cam.title = "Mit Screenshot kopieren (auch: Shift+Klick)";
  cam.innerHTML = '<svg style="pointer-events:none" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  cam.style.cssText = `position:fixed;z-index:${Z};display:none;width:24px;height:24px;box-sizing:border-box;
    padding:5px;border-radius:4px;background:#0a84ff;pointer-events:auto;cursor:pointer !important;
    box-shadow:0 1px 4px rgba(0,0,0,.3);`;
  const box = document.createElement("div");
  box.setAttribute("data-llment-picker", "");
  box.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};box-sizing:border-box;
    border:2px solid #0a84ff;background:rgba(10,132,255,.14);border-radius:2px;
    display:none;transition:none;`;
  const label = document.createElement("div");
  label.setAttribute("data-llment-picker", "");
  label.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};display:none;
    font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#fff;background:#0a84ff;
    padding:2px 6px;border-radius:3px;white-space:nowrap;max-width:60vw;overflow:hidden;
    text-overflow:ellipsis;`;
  const style = document.createElement("style");
  style.setAttribute("data-llment-picker", "");
  style.textContent = `*, *::before, *::after { cursor: crosshair !important; }`;
  document.documentElement.append(box, label, cam, style);

  let current = null;

  function highlight(el) {
    if (!el || el === current) return;
    current = el;
    const r = el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = r.left + "px";
    box.style.top = r.top + "px";
    box.style.width = r.width + "px";
    box.style.height = r.height + "px";
    const cls = bestClass(el);
    label.textContent = el.tagName.toLowerCase() + (el.id ? "#" + el.id : cls ? "." + cls : "");
    label.style.display = "block";
    const above = r.top > 24;
    label.style.left = Math.max(0, r.left) + "px";
    label.style.top = (above ? r.top - 22 : r.bottom + 2) + "px";
    // Kamera innen rechts oben; bei sehr kleinen Elementen außen rechts daneben
    const inside = r.width >= 60 && r.height >= 36;
    cam.style.display = "block";
    cam.style.left = Math.min(innerWidth - 26, inside ? r.right - 28 : r.right + 4) + "px";
    cam.style.top = Math.max(0, inside ? r.top + 4 : r.top) + "px";
  }

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.closest("[data-llment-picker]")) return null;
    return el;
  }

  let lastXY = null;
  function onMove(e) {
    lastXY = [e.clientX, e.clientY];
    const el = targetAt(e.clientX, e.clientY);
    if (el) highlight(el);
  }
  function onScroll() {
    if (!lastXY) return;
    current = null;
    const el = targetAt(lastXY[0], lastXY[1]);
    if (el) highlight(el);
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  async function onClick(e) {
    swallow(e);
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const withShot = e.shiftKey || (hit && cam.contains(hit));
    const el = targetAt(e.clientX, e.clientY) || current;
    if (!el) return;
    cleanup();
    await copyElement(el, undefined, withShot);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      swallow(e);
      cleanup();
      toast("Abgebrochen", false);
    }
  }

  const opts = { capture: true };
  function cleanup() {
    window.removeEventListener("mousemove", onMove, opts);
    window.removeEventListener("scroll", onScroll, opts);
    window.removeEventListener("click", onClick, opts);
    window.removeEventListener("mousedown", swallow, opts);
    window.removeEventListener("mouseup", swallow, opts);
    window.removeEventListener("pointerdown", swallow, opts);
    window.removeEventListener("keydown", onKey, opts);
    box.remove();
    label.remove();
    cam.remove();
    style.remove();
    delete window[KEY];
  }

  window.addEventListener("mousemove", onMove, opts);
  window.addEventListener("scroll", onScroll, opts);
  window.addEventListener("click", onClick, opts);
  window.addEventListener("mousedown", swallow, opts);
  window.addEventListener("mouseup", swallow, opts);
  window.addEventListener("pointerdown", swallow, opts);
  window.addEventListener("keydown", onKey, opts);
  if (contextFallback) toast("Element anklicken", false);

  window[KEY] = {
    cancel(silent) {
      cleanup();
      if (!silent) toast("Abgebrochen", false);
    },
    // für Tests: Selektor eines beliebigen Elements berechnen
    buildSelector,
    selectionTarget,
  };
})();
