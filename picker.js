// Element-Picker – Content-Script.
//
// Wird bei jedem Aufruf frisch injiziert. Zwei Wege hinein:
//
//   a) Icon / Tastenkürzel → Picker-Modus: Hover zeichnet einen Rahmen
//      (Overlay, das Ziel selbst wird nicht angefasst), Klick kopiert.
//      Läuft der Picker bereits (Marker an `window`), wird er abgebrochen.
//   b) Kontextmenü „Element-Picker: dieses Element kopieren" → das Hintergrund-
//      skript hinterlegt vorher `window.__elementPickerContextTarget`
//      (targetElementId aus dem Menü-Klick); das Element wird sofort kopiert,
//      ohne Picker-Modus.
//
// Kopiert werden drei Zeilen:
//   1. vollständige Seiten-URL (inkl. Hash)
//   2. kürzester eindeutiger CSS-Selektor
//   3. sichtbarer Textanfang in Anführungszeichen (max. 60 Zeichen)

(() => {
  const KEY = "__elementPickerInstance";
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

  function textSnippet(el) {
    let t = "";
    if (el.tagName === "IMG") t = el.getAttribute("alt") || "";
    else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA")
      t = el.value || el.getAttribute("placeholder") || "";
    else t = el.innerText || el.textContent || "";
    t = t.replace(/\s+/g, " ").trim();
    if (!t) return "";
    return t.length > 60 ? t.slice(0, 60).trimEnd() + "…" : t;
  }

  function payloadFor(el) {
    const lines = [location.href, buildSelector(el)];
    const snippet = textSnippet(el);
    if (snippet) lines.push(JSON.stringify(snippet));
    return lines.join("\n");
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
    t.setAttribute("data-element-picker", "");
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

  async function copyElement(el) {
    const text = payloadFor(el);
    const ok = await copy(text);
    toast(ok ? "Kopiert" : "Kopieren fehlgeschlagen", ok);
    window.__elementPickerLast = text; // für Tests / Debugging
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
    return el && !el.hasAttribute("data-element-picker") ? el : null;
  }

  let contextFallback = false;
  if (window[CTX] != null) {
    const id = window[CTX];
    delete window[CTX];
    if (window[KEY]) window[KEY].cancel(true);
    const el = contextTarget(id);
    if (el) {
      copyElement(el);
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

  const box = document.createElement("div");
  box.setAttribute("data-element-picker", "");
  box.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};box-sizing:border-box;
    border:2px solid #0a84ff;background:rgba(10,132,255,.14);border-radius:2px;
    display:none;transition:none;`;
  const label = document.createElement("div");
  label.setAttribute("data-element-picker", "");
  label.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};display:none;
    font:12px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#fff;background:#0a84ff;
    padding:2px 6px;border-radius:3px;white-space:nowrap;max-width:60vw;overflow:hidden;
    text-overflow:ellipsis;`;
  const style = document.createElement("style");
  style.setAttribute("data-element-picker", "");
  style.textContent = `*, *::before, *::after { cursor: crosshair !important; }`;
  document.documentElement.append(box, label, style);

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
  }

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.hasAttribute("data-element-picker")) return null;
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
    const el = targetAt(e.clientX, e.clientY) || current;
    if (!el) return;
    cleanup();
    await copyElement(el);
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
    textSnippet,
  };
})();
