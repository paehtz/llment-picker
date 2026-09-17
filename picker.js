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
  // Aktivzustand ans Hintergrundskript melden (Badge am Toolbar-Icon)
  const reportState = (active) => {
    try { api.runtime.sendMessage({ type: "llment-state", active }); } catch {}
  };
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

  function payloadFor(el, text, shotInfo, htmlPath) {
    const lines = [location.href, buildSelector(el)];
    if (text) lines.push(JSON.stringify(text));
    if (shotInfo) lines.push(shotInfo);
    if (htmlPath) lines.push("HTML: " + htmlPath);
    return lines.join("\n");
  }

  // ───────────────────────── Gerendertes HTML als Datei ───────────────────
  // Für Inhalte, die es nur im Browser gibt (eingeloggte Portale, per JS
  // gerenderte Tabellen): outerHTML des Elements ohne Skripte, mit Kopfzeile,
  // gespeichert über das Hintergrundskript (downloads) in den Download-Ordner.
  function htmlFor(el, selector) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, noscript").forEach((n) => n.remove());
    const head = `<!-- LLMent Picker · ${new Date().toISOString()}
URL: ${location.href}
Selektor: ${selector}
Titel: ${document.title.replace(/--/g, "- -")}
-->
`;
    return head + clone.outerHTML + "\n";
  }

  function slugFor(el) {
    const cls = bestClass(el);
    const raw = el.id && usableId(el) ? el.id : cls ? cls : el.tagName.toLowerCase();
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "element";
  }

  async function saveHtml(el, selector) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    const host = location.hostname.replace(/^www\./, "");
    const filename = `${stamp}_${host}_${slugFor(el)}.html`;
    const res = await api.runtime.sendMessage({ type: "llment-save-html", filename, content: htmlFor(el, selector) });
    if (!res || !res.path) throw new Error((res && res.error) || "nicht gespeichert");
    return res.path;
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
    // Eigene Overlays (Blitz, Toast) für die Aufnahme ausblenden
    const own = Array.from(document.querySelectorAll("[data-llment-picker]"));
    own.forEach((n) => (n.style.visibility = "hidden"));
    await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
    let res;
    try {
      res = await api.runtime.sendMessage({ type: "llment-capture" });
    } finally {
      own.forEach((n) => (n.style.visibility = ""));
    }
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

  async function copyElement(el, text, opts) {
    const withShot = !!(opts && opts.shot), withHtml = !!(opts && opts.html);
    let shot = null, htmlPath = null, htmlErr = null;
    if (withShot) {
      try {
        shot = await captureElement(el);
      } catch (e) {
        console.warn("LLMent Picker: Screenshot fehlgeschlagen –", e && e.message);
      }
    }
    const selector = buildSelector(el);
    if (withHtml) {
      try {
        htmlPath = await saveHtml(el, selector);
      } catch (e) {
        htmlErr = (e && e.message) || String(e);
        console.warn("LLMent Picker: HTML nicht gespeichert –", htmlErr);
      }
    }
    const payload = payloadFor(el, text, shot && shot.info, htmlPath);
    let ok = false;
    if (shot && (await copyWithImage(payload, shot.blob))) ok = true;
    else ok = await copy(payload);
    const parts = [];
    if (!ok) parts.push("Kopieren fehlgeschlagen");
    else parts.push(shot ? "Kopiert (mit Screenshot)" : withShot ? "Nur Text kopiert (Screenshot nicht möglich)" : "Kopiert");
    if (withHtml) parts.push(htmlPath ? "HTML gespeichert" : "HTML nicht gespeichert" + (htmlErr ? ": " + htmlErr : ""));
    const good = ok && !(withShot && !shot) && !(withHtml && !htmlPath);
    toast(parts.join(" · "), good);
    window.__elementPickerLast = payload; // für Tests / Debugging
    window.__elementPickerLastShot = shot ? { bytes: shot.blob && shot.blob.size, info: shot.info } : null;
    window.__elementPickerLastHtml = htmlPath || htmlErr;
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
    const { id, onSelection, shot, html } = window[CTX];
    delete window[CTX];
    if (window[KEY]) window[KEY].cancel(true);
    // Rechtsklick lag auf markiertem Text → Element der Markierung + Text
    const marked = onSelection ? selectionTarget() : null;
    if (marked) {
      copyElement(marked.el, marked.text, { shot, html });
      return;
    }
    const el = contextTarget(id);
    if (el) {
      copyElement(el, undefined, { shot, html });
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

  // Modifier-Anzeige rechts oben außerhalb des Rahmens. Nicht klickbar –
  // die Chips zeigen nur, was Alt (Screenshot) und Strg (HTML-Datei)
  // beim Klick zusätzlich auslösen, und leuchten, solange die Taste gehalten wird.
  // Symbole als DOM-Knoten (kein innerHTML – AMO-Review)
  const NS = "http://www.w3.org/2000/svg";
  function svgIcon(paths) {
    const svg = document.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.3", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
    for (const [tag, attrs] of paths) {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.appendChild(n);
    }
    return svg;
  }
  const ICON_CAM = () => svgIcon([["path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }], ["circle", { cx: "12", cy: "13", r: "4" }]]);
  const ICON_CODE = () => svgIcon([["polyline", { points: "16 18 22 12 16 6" }], ["polyline", { points: "8 6 2 12 8 18" }]]);
  const HINT_LIMIT = 3; // Tastenhinweise verschwinden, sobald jede Funktion so oft benutzt wurde
  const hud = document.createElement("div");
  hud.setAttribute("data-llment-picker", "");
  hud.style.cssText = `position:fixed;z-index:${Z};display:none;pointer-events:none;gap:4px;
    font:11px/1 ui-monospace,Menlo,Consolas,monospace;white-space:nowrap;`;
  const chip = () => {
    const c = document.createElement("span");
    c.style.cssText = `display:inline-flex;align-items:center;height:20px;padding:0 6px;border-radius:3px;
      background:rgba(70,80,95,.85);color:#fff;transition:background .1s;`;
    return c;
  };
  function fillChip(c, icon, hint) {
    c.replaceChildren(icon);
    if (hint) {
      const t = document.createElement("span");
      t.style.marginLeft = "5px";
      t.textContent = hint;
      c.appendChild(t);
    }
  }
  let hints = { shot: 0, html: 0 };
  const codeChip = chip(), camChip = chip();
  hud.append(codeChip, camChip);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const CTRL_LABEL = isMac ? "\u2318" : "Strg";
  function applyHints() {
    fillChip(codeChip, ICON_CODE(), hints.html < HINT_LIMIT ? CTRL_LABEL + " HTML" : "");
    fillChip(camChip, ICON_CAM(), hints.shot < HINT_LIMIT ? "Alt Screenshot" : "");
  }
  applyHints();
  try {
    api.storage.sync.get({ hintsShot: 0, hintsHtml: 0 }).then((v) => {
      hints = { shot: v.hintsShot || 0, html: v.hintsHtml || 0 };
      applyHints();
      if (current) placeHud(current.getBoundingClientRect());
    });
  } catch {}
  let mods = { alt: false, ctrl: false };
  function setMods(alt, ctrl) {
    if (mods.alt === alt && mods.ctrl === ctrl) return;
    mods = { alt, ctrl };
    camChip.style.background = alt ? "#0a84ff" : "rgba(70,80,95,.85)";
    codeChip.style.background = ctrl ? "#0a84ff" : "rgba(70,80,95,.85)";
  }
  function placeHud(r) {
    hud.style.display = "inline-flex";
    const w = hud.getBoundingClientRect().width || 60;
    const above = r.top > 24;
    hud.style.left = Math.max(0, Math.min(innerWidth - w - 2, r.right - w)) + "px";
    hud.style.top = (above ? r.top - 22 : r.bottom + 2) + "px";
  }
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
  document.documentElement.append(box, label, hud, style);

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
    placeHud(r);
  }

  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || el.closest("[data-llment-picker]")) return null;
    return el;
  }

  let lastXY = null;
  function onMove(e) {
    setMods(e.altKey, e.ctrlKey || e.metaKey);
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

  // Kurzes Aufleuchten des Rahmens: „Element erfasst"
  function flash(el) {
    const r = el.getBoundingClientRect();
    const f = document.createElement("div");
    f.setAttribute("data-llment-picker", "");
    f.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};box-sizing:border-box;border-radius:2px;
      left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;
      border:2px solid #0a84ff;background:rgba(10,132,255,.45);box-shadow:0 0 0 4px rgba(10,132,255,.35);`;
    document.documentElement.appendChild(f);
    const anim = f.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.02)" }], { duration: 350, easing: "ease-out" });
    anim.onfinish = () => f.remove();
    setTimeout(() => f.remove(), 500);
  }

  async function onClick(e) {
    swallow(e);
    const withShot = e.altKey, withHtml = e.ctrlKey || e.metaKey;
    const el = targetAt(e.clientX, e.clientY) || current;
    if (!el) return;
    cleanup();
    flash(el);
    const ok = await copyElement(el, undefined, { shot: withShot, html: withHtml });
    // Tastenhinweise nach ein paar erfolgreichen Nutzungen ausblenden
    if (ok && (withShot || withHtml)) {
      try {
        const upd = {};
        if (withShot) upd.hintsShot = Math.min(HINT_LIMIT, hints.shot + 1);
        if (withHtml) upd.hintsHtml = Math.min(HINT_LIMIT, hints.html + 1);
        api.storage.sync.set(upd);
      } catch {}
    }
  }

  function onKey(e) {
    if (e.key === "Escape") {
      swallow(e);
      cleanup();
      toast("Abgebrochen", false);
      return;
    }
    if (e.key === "Alt") e.preventDefault(); // Firefox: Menüleiste nicht aufrufen
    if (e.key === "Alt" || e.key === "Control" || e.key === "Meta") setMods(e.altKey, e.ctrlKey || e.metaKey);
  }
  function onKeyUp(e) {
    if (e.key === "Alt") e.preventDefault(); // Firefox: Menüleiste nicht aufrufen
    setMods(e.altKey, e.ctrlKey || e.metaKey);
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
    window.removeEventListener("keyup", onKeyUp, opts);
    box.remove();
    label.remove();
    hud.remove();
    reportState(false);
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
  window.addEventListener("keyup", onKeyUp, opts);
  reportState(true);
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
