// LLMent Picker – Content-Script.
//
// Wird bei jedem Aufruf frisch injiziert. Zwei Wege hinein:
//
//   a) Icon / Tastenkürzel → Picker-Modus: Hover zeichnet einen Rahmen
//      (Overlay, das Ziel selbst wird nicht angefasst), Klick kopiert.
//      Läuft der Picker bereits (Marker an `window`), wird er abgebrochen.
//      Linksklick gedrückt halten und ziehen → Lasso: der aufgezogene Bereich
//      wird als Screenshot kopiert, der Selektor zeigt auf den Container mit
//      der größten räumlichen Überdeckung.
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
  // Übersetzung (_locales); Schlüssel als Rückfall, damit nie Leeres erscheint
  const t = (key, ...subs) => {
    try { return api.i18n.getMessage(key, subs.map(String)) || key; } catch { return key; }
  };
  const IN_FRAME = window !== window.top;
  // Beschreibung des umgebenden Frames für Zeile „Im Frame: …"
  function frameLine() {
    if (!IN_FRAME) return null;
    let desc = location.href;
    try {
      const fe = window.frameElement;
      if (fe) desc += " \u2190 <" + fe.tagName.toLowerCase() + (fe.id ? ' id="' + fe.id + '"' : "") + (fe.name ? ' name="' + fe.name + '"' : "") + ">";
    } catch {}
    return t("lineFrame") + desc + t("lineFrameNote");
  }
  // Versatz dieses Frames im Tab (nur bei gleicher Herkunft ermittelbar)
  function frameOffset() {
    let x = 0, y = 0, w = window;
    try {
      while (w !== w.top) {
        const fe = w.frameElement;
        if (!fe) return null;
        const r = fe.getBoundingClientRect(), cs = w.parent.getComputedStyle(fe);
        x += r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
        y += r.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
        w = w.parent;
      }
      return { x, y, topWidth: w.innerWidth };
    } catch { return null; }
  }
  // Zweiter Durchlauf (alle Frames): ein bereits aktiver Picker wird nicht umgeschaltet
  const PASS2 = !!window.__llmentPass2;
  delete window.__llmentPass2;
  // Abbruch-Broadcast aus dem Hintergrund (ein anderer Frame hat kopiert/abgebrochen)
  if (!window.__llmentListening) {
    window.__llmentListening = true;
    try {
      api.runtime.onMessage.addListener((m) => {
        if (m && m.type === "llment-cancel" && window[KEY]) window[KEY].cancel(true, true);
      });
    } catch {}
  }
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

  function payloadFor(el, text, shotInfo, htmlPath, note) {
    const lines = [location.href, buildSelector(el)];
    if (note) lines.push(note);
    if (text) lines.push(JSON.stringify(text));
    if (shotInfo) lines.push(shotInfo);
    if (htmlPath) lines.push(t("lineHtml") + htmlPath);
    const fl = frameLine();
    if (fl) lines.push(fl);
    return lines.join("\n");
  }

  // ───────────────────────── Gerendertes HTML als Datei ───────────────────
  // Für Inhalte, die es nur im Browser gibt (eingeloggte Portale, per JS
  // gerenderte Tabellen): outerHTML des Elements ohne Skripte, mit Kopfzeile,
  // gespeichert über das Hintergrundskript (downloads) in den Download-Ordner.
  // ── CSS-Kontext: was der Inspektor zeigt ─────────────────────────────────
  // Effektive Werte (layoutrelevante Auswahl der Computed Styles) und die
  // angewandten Regeln aus den Stylesheets der Seite – für Element und
  // Elternelement, weil Layoutfehler meist im Container sitzen.
  const LAYOUT_PROPS = [
    "display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear",
    "width", "height", "min-width", "max-width", "min-height", "max-height", "box-sizing",
    "margin", "padding", "border", "border-radius", "overflow",
    "flex", "flex-direction", "flex-wrap", "align-items", "align-self", "justify-content", "align-content", "gap", "order",
    "grid-template-columns", "grid-template-rows", "grid-column", "grid-row",
    "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "white-space", "text-overflow",
    "color", "background-color", "opacity", "visibility", "transform", "transition",
  ];
  const CONTAINER_PROPS = ["display", "position", "width", "max-width", "padding", "gap", "flex-direction", "flex-wrap",
    "align-items", "justify-content", "grid-template-columns", "grid-template-rows", "overflow", "box-sizing"];

  function effectiveStyles(el, props) {
    const cs = getComputedStyle(el);
    return props.map((p) => `${p}: ${cs.getPropertyValue(p)}`);
  }

  function matchedRules(el, limit) {
    const found = [], blocked = [];
    const walk = (rules, sheet, ctx) => {
      for (const r of rules) {
        if (r instanceof CSSStyleRule) {
          try {
            if (el.matches(r.selectorText)) found.push({ sheet, ctx, css: r.cssText });
          } catch {}
        } else if (r instanceof CSSMediaRule) {
          const cond = r.conditionText || r.media.mediaText;
          const on = matchMedia(cond).matches ? t("mediaActive") : t("mediaInactive");
          walk(r.cssRules, sheet, (ctx ? ctx + " · " : "") + `@media ${cond} [${on}]`);
        } else if (r.cssRules) {
          try { walk(r.cssRules, sheet, ctx); } catch {}
        }
      }
    };
    for (const sh of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sh.cssRules; } catch { blocked.push(sh.href || "<style>"); continue; }
      const node = sh.ownerNode;
      const name = sh.href ? sh.href.replace(location.origin, "") : node && node.id ? `<style id="${node.id}">` : "<style>";
      walk(rules, name, "");
    }
    const inline = el.getAttribute("style");
    if (inline) found.unshift({ sheet: t("fileInlineStyle"), ctx: "", css: inline });
    return { rules: found.slice(0, limit), total: found.length, blocked };
  }

  function describe(el) {
    const cls = bestClass(el);
    return `<${el.tagName.toLowerCase()}${el.id ? " id=\"" + el.id + "\"" : ""}${cls ? " class=\"" + cls + "\"" : ""}>`;
  }

  function cssContext(el) {
    const safe = (t) => t.replace(/-->/g, "--&gt;");
    const fmt = (m) => m.rules.map((r) => `/* ${r.sheet}${r.ctx ? " · " + r.ctx : ""} */ ${safe(r.css.length > 1500 ? r.css.slice(0, 1500) + " …" : r.css)}`).join("\n") || t("fileNone");
    const me = matchedRules(el, 60);
    const lines = [t("fileEffective"), ...effectiveStyles(el, LAYOUT_PROPS), "",
      `${t("fileRules")} ${me.total > me.rules.length ? `[${me.rules.length}/${me.total}]` : `[${me.total}]`}`, fmt(me)];
    const parent = el.parentElement;
    if (parent && parent !== document.documentElement) {
      const pm = matchedRules(parent, 30);
      lines.push("", t("fileParent", describe(parent)), t("fileParentEffective") + effectiveStyles(parent, CONTAINER_PROPS).join("; "), `${t("fileParentRules")} [${pm.total}]:`, fmt(pm));
    }
    if (me.blocked.length) lines.push("", t("fileBlocked", me.blocked.length, me.blocked.join(", ")));
    return lines.join("\n");
  }

  function htmlFor(el, selector, withCss) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, noscript").forEach((n) => n.remove());
    let head = `<!-- LLMent Picker · ${new Date().toISOString()}
${t("fileUrl")}: ${location.href}
${t("fileSelector")}: ${selector}
${t("fileTitle")}: ${document.title.replace(/-->/g, "--&gt;")}
${t("fileViewport")}: ${innerWidth}×${innerHeight}, DPR ${Math.round(devicePixelRatio * 100) / 100}
`;
    if (IN_FRAME) head += `${t("fileFrame")}: ${location.href}\n`;
    if (withCss) {
      let ctx = t("fileCssUnavailable");
      try { ctx = cssContext(el); } catch (e) { ctx += ": " + (e && e.message); }
      head += "\n" + ctx + "\n";
    }
    return head + "-->\n" + clone.outerHTML + "\n";
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
    let withCss = true;
    try { withCss = (await api.storage.sync.get({ cssInHtml: true })).cssInHtml !== false; } catch {}
    const res = await api.runtime.sendMessage({ type: "llment-save-html", filename, content: htmlFor(el, selector, withCss) });
    if (!res || !res.path) throw new Error((res && res.error) || "nicht gespeichert");
    return res.path;
  }

  // ───────────────────────── Screenshot ───────────────────────────────────
  // Das Hintergrundskript liefert den sichtbaren Tab als PNG (captureVisibleTab,
  // von activeTab gedeckt). Passt der Bereich ins Fenster, ist es eine Aufnahme,
  // zugeschnitten auf Bereich + Rand. Sonst wird kachelweise gescrollt und
  // zusammengesetzt: fixierte Fremdelemente (Kopfzeilen) ausgeblendet, sticky-
  // Elemente an ihren natürlichen Platz gesetzt, am Ende Scrollstand und Stile
  // wiederhergestellt. Chrome erlaubt zwei Aufnahmen pro Sekunde.
  const SHOT_PAD = 24;
  const MAX_TILES = 30; // Kacheln insgesamt – Obergrenze gegen Endlosseiten (Chrome: 2 Aufnahmen/s)
  const MAX_SHOT_PX = 8000; // längste Kante des Ergebnisses (Claude nimmt bis 8000 px)
  const sleep = (ms) => new Promise((f) => setTimeout(f, ms));
  const settle = () => new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
  const inflate = (r, pad) => ({ left: r.left - pad, top: r.top - pad, width: r.width + 2 * pad, height: r.height + 2 * pad });

  async function captureTab() {
    for (let i = 0; ; i++) {
      const res = await api.runtime.sendMessage({ type: "llment-capture" });
      if (res && res.dataUrl) return res.dataUrl;
      const err = (res && res.error) || "keine Aufnahme";
      // Chrome: MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND – kurz warten, erneut
      if (i < 5 && /MAX_CAPTURE|per second|quota/i.test(err)) { await sleep(600); continue; }
      throw new Error(err);
    }
  }
  const loadImage = (src) => new Promise((ok, err) => { const img = new Image(); img.onload = () => ok(img); img.onerror = err; img.src = src; });

  // Scroll-Container um das Element (innen nach außen), zuletzt das Fenster
  function scrollers(el) {
    const out = [];
    for (let p = el && el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/auto|scroll/.test(cs.overflowY + cs.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) out.push(p);
    }
    out.push(window);
    return out;
  }
  // Client-Rechteck eines Scroll-Containers bzw. des Fensters (Fensterkoordinaten)
  function clientBox(s) {
    if (s === window) return { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const b = s.getBoundingClientRect();
    return { left: b.left + s.clientLeft, top: b.top + s.clientTop, width: s.clientWidth, height: s.clientHeight };
  }
  // Sichtbarer Ausschnitt: Fenster geschnitten mit allen Scroll-Containern
  function clipRect(sc) {
    let c = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    for (const s of sc) {
      const b = clientBox(s);
      c = { left: Math.max(c.left, b.left), top: Math.max(c.top, b.top), right: Math.min(c.right, b.left + b.width), bottom: Math.min(c.bottom, b.top + b.height) };
    }
    return c;
  }
  const inside = (c, r) => r.left >= c.left && r.top >= c.top && r.left + r.width <= c.right && r.top + r.height <= c.bottom;
  // Bereichspunkt (px, py) in jedem Container an die Ecke (bzw. Mitte) holen,
  // innen nach außen – wie scrollIntoView, aber mit bekanntem Ziel
  function scrollPointTo(measure, sc, px, py, center) {
    for (const s of sc) {
      const r = measure(), b = clientBox(s);
      const tx = center ? b.left + b.width / 2 : b.left, ty = center ? b.top + b.height / 2 : b.top;
      const dx = r.left + px - tx, dy = r.top + py - ty;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      s.scrollBy({ left: dx, top: dy, behavior: "instant" });
    }
  }
  // Fixierte Fremdelemente ausblenden, sticky-Elemente festsetzen (position:
  // relative ohne Versatz = ihr natürlicher Platz). Vorherige Stile werden zurückgegeben.
  function freezeStickies(target) {
    const restore = [];
    const all = document.querySelectorAll("body *");
    for (const el of all) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "sticky") continue;
      if (el.closest("[data-llment-picker]")) continue;
      if (el === target || el.contains(target)) continue; // Vorfahr des Ziels: bleibt
      restore.push([el, el.getAttribute("style")]);
      if (pos === "fixed") {
        if (!target.contains(el)) el.style.setProperty("visibility", "hidden", "important");
      } else {
        el.style.setProperty("position", "relative", "important");
        for (const side of ["top", "right", "bottom", "left"]) el.style.setProperty(side, "auto", "important");
      }
    }
    // Chrome schreibt nach removeAttribute ein leeres style="" zurück, wenn die
    // Deklaration seit dem letzten Rendern geändert wurde – Attribut lesen
    // (erzwingt den Abgleich) und noch einmal entfernen.
    const clear = (el) => { el.removeAttribute("style"); if (el.getAttribute("style") !== null) el.removeAttribute("style"); };
    return () => restore.forEach(([el, st]) => (st == null ? clear(el) : el.setAttribute("style", st)));
  }

  // measure(): aktuelle Fensterkoordinaten des Bereichs (inkl. Rand); target: das
  // Element, an dem Scroll-Container und fixierte Elemente bestimmt werden.
  async function captureRegion(measure, target, pad) {
    const off = IN_FRAME ? frameOffset() : { x: 0, y: 0, topWidth: innerWidth };
    if (!off) throw new Error("frame offset unavailable (cross-origin)");
    let r = measure();
    const W = Math.max(1, Math.round(r.width)), H = Math.max(1, Math.round(r.height));
    const sc = scrollers(target);
    const view = sc.map(clientBox).reduce((a, b) => ({ width: Math.min(a.width, b.width), height: Math.min(a.height, b.height) }));
    const multi = W > view.width || H > view.height;
    const saved = sc.map((s) => (s === window ? [scrollX, scrollY] : [s.scrollLeft, s.scrollTop]));
    const own = Array.from(document.querySelectorAll("[data-llment-picker]"));
    own.forEach((n) => (n.style.visibility = "hidden"));
    // Während der Kachelaufnahme springt die Seite – der Zeiger zeigt „beschäftigt"
    const busy = document.createElement("style");
    busy.textContent = "*, *::before, *::after { cursor: progress !important; }";
    if (multi) document.documentElement.appendChild(busy);
    let unfreeze = null, cv = null, ctx = null, k = 1, tiles = 0, clipped = false, scale = 1;
    // Nur der Rand fehlt (liegt außerhalb eines Scroll-Containers): kein Mangel
    const short = (end, full) => end < full - (pad || 0);
    try {
      if (!multi) {
        if (!inside(clipRect(sc), r)) {
          scrollPointTo(measure, sc, W / 2, H / 2, true);
          await settle(); await sleep(250);
          r = measure();
        }
        clipped = !inside(clipRect(sc), r);
      }
      // Kachelschleife in Bereichskoordinaten: Punkt (px, py) liegt bei (r.left+px, r.top+py)
      let y = 0;
      while (y < H) {
        let x = 0, rowBottom = null;
        while (x < W) {
          if (multi) {
            scrollPointTo(measure, sc, x, y, false);
            await settle(); await sleep(tiles === 0 ? 250 : 120);
            if (!unfreeze) { unfreeze = freezeStickies(target); await settle(); }
            r = measure();
          }
          const c = clipRect(sc);
          const sx0 = Math.max(x, c.left - r.left), sy0 = Math.max(y, c.top - r.top);
          const sx1 = Math.min(W, c.right - r.left), sy1 = Math.min(H, c.bottom - r.top);
          if (sx1 - sx0 < 1 || sy1 - sy0 < 1) { clipped = clipped || (sx1 - sx0 < 1 && short(x, W)) || (sy1 - sy0 < 1 && short(y, H)); break; }
          const img = await loadImage(await captureTab());
          tiles++;
          if (!cv) {
            k = img.naturalWidth / off.topWidth; // tatsächlicher Pixelfaktor der Aufnahme
            scale = Math.min(1, MAX_SHOT_PX / (Math.max(W, H) * k));
            cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(W * k * scale));
            cv.height = Math.max(1, Math.round(H * k * scale));
            ctx = cv.getContext("2d");
            ctx.fillStyle = "#fff"; // nicht erfassbarer Rand (außerhalb eines Containers) bleibt weiß statt transparent
            ctx.fillRect(0, 0, cv.width, cv.height);
          }
          // Auf ganze Gerätepixel runden – halbe Pixel würden an den Nahtstellen verwischen
          const X0 = Math.round((r.left + sx0 + off.x) * k), Y0 = Math.round((r.top + sy0 + off.y) * k);
          const X1 = Math.round((r.left + sx1 + off.x) * k), Y1 = Math.round((r.top + sy1 + off.y) * k);
          const D0x = Math.round(sx0 * k * scale), D0y = Math.round(sy0 * k * scale);
          const D1x = Math.round(sx1 * k * scale), D1y = Math.round(sy1 * k * scale);
          ctx.drawImage(img, X0, Y0, X1 - X0, Y1 - Y0, D0x, D0y, D1x - D0x, D1y - D0y);
          if (rowBottom == null) rowBottom = sy1;
          if (sx1 >= W) break;
          if (!multi || sx1 <= x || tiles >= MAX_TILES) { clipped = clipped || short(sx1, W); break; }
          x = sx1;
        }
        if (rowBottom == null || rowBottom >= H) break;
        if (!multi || rowBottom <= y || tiles >= MAX_TILES) { clipped = clipped || short(rowBottom, H); break; }
        y = rowBottom;
      }
    } finally {
      busy.remove();
      if (unfreeze) unfreeze();
      if (multi) sc.forEach((s, i) => (s === window ? scrollTo(saved[i][0], saved[i][1]) : (s.scrollLeft = saved[i][0], s.scrollTop = saved[i][1])));
      own.forEach((n) => (n.style.visibility = ""));
    }
    if (!cv) throw new Error("keine Aufnahme");
    const blob = await new Promise((f) => cv.toBlob(f, "image/png"));
    const dpr = String(Math.round(devicePixelRatio * 100) / 100);
    let info = t("lineShot", innerWidth, innerHeight, dpr, cv.width, cv.height, SHOT_PAD);
    if (tiles > 1) info += t("lineShotTiles", tiles);
    if (scale < 1) info += t("lineShotScaled", Math.round(scale * 100));
    if (clipped) info += t("lineShotClipped");
    return { blob, info };
  }

  const captureElement = (el) => captureRegion(() => inflate(el.getBoundingClientRect(), SHOT_PAD), el, SHOT_PAD);

  // ───────────────────────── Zwischenablage ────────────────────────────────
  // Chrome setzt beim Loslassen von Alt (auch nach Alt+Klick) den Fokus auf das
  // Browsermenü, Firefox zeigt die Menüleiste – das Dokument verliert den Fokus,
  // und clipboard.write wird verweigert („Document is not focused"). Solange
  // kopiert wird, werden Alt-Tastenereignisse deshalb abgefangen.
  const altGuard = (e) => { if (e.key === "Alt") e.preventDefault(); };
  function guardAlt(on) {
    for (const ev of ["keydown", "keyup"]) window[on ? "addEventListener" : "removeEventListener"](ev, altGuard, true);
  }
  let lastClipError = "";
  // write(): erzeugt den Schreibvorgang; bis zu vier Versuche, davor Fokus holen
  async function writeClipboard(write) {
    for (let i = 0; i < 4; i++) {
      try {
        if (!document.hasFocus()) window.focus();
        await write();
        return true;
      } catch (e) {
        lastClipError = (e && e.message) || String(e);
        await sleep(150);
      }
    }
    console.warn("LLMent Picker: Zwischenablage –", lastClipError);
    return false;
  }
  const copyWithImage = (text, blob) => writeClipboard(() =>
    navigator.clipboard.write([new ClipboardItem({ "image/png": blob, "text/plain": new Blob([text], { type: "text/plain" }) })]));

  // ───────────────────────── Zwischenablage & Toast ───────────────────────
  const Z = "2147483647";

  async function copy(text) {
    if (await writeClipboard(() => navigator.clipboard.writeText(text))) return true;
    {
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

  function toast(msg, good, ms) {
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
    }, ms || 1400);
  }

  // opts: shot, html; region {measure, line} für einen von Hand gezogenen Bereich
  async function copyElement(el, text, opts) {
    guardAlt(true);
    try {
      return await copyElementInner(el, text, opts || {});
    } finally {
      guardAlt(false);
    }
  }
  async function copyElementInner(el, text, opts) {
    const withShot = !!opts.shot, withHtml = !!opts.html;
    let shot = null, htmlPath = null, htmlErr = null, shotErr = null;
    if (withShot) {
      try {
        shot = await (opts.region ? captureRegion(opts.region.measure, el, 0) : captureElement(el));
      } catch (e) {
        shotErr = (e && e.message) || String(e);
        console.warn("LLMent Picker: Screenshot fehlgeschlagen –", shotErr);
      }
    }
    const selector = buildSelector(el);
    if (withHtml) {
      try {
        htmlPath = await saveHtml(el, selector);
      } catch (e) {
        htmlErr = ((e && e.message) || String(e)).replace(/data:[^\s]+/g, "data:…").slice(0, 120);
        console.warn("LLMent Picker: HTML nicht gespeichert –", htmlErr);
      }
    }
    const payload = payloadFor(el, text, shot && shot.info, htmlPath, opts.region && opts.region.line);
    let ok = false, imageOk = false;
    if (shot && (await copyWithImage(payload, shot.blob))) ok = imageOk = true;
    else ok = await copy(payload);
    const parts = [];
    if (!ok) parts.push(t("toastCopyFailed"));
    else if (imageOk) parts.push(t("toastCopiedShot"));
    else if (shot) parts.push(t("toastShotNotWritten", lastClipError.slice(0, 60)));
    else if (withShot) parts.push(t("toastTextOnly") + (shotErr ? ": " + shotErr.slice(0, 60) : ""));
    else parts.push(t("toastCopied"));
    if (withHtml) parts.push(htmlPath ? t("toastHtmlSaved") : t("toastHtmlFailed") + (htmlErr ? ": " + htmlErr : ""));
    const good = ok && !(withShot && !imageOk) && !(withHtml && !htmlPath);
    toast(parts.join(" · "), good, good ? 1400 : 4000);
    window.__elementPickerLast = payload; // für Tests / Debugging
    window.__elementPickerLastShot = shot ? { bytes: shot.blob && shot.blob.size, info: shot.info, written: imageOk } : null;
    window.__elementPickerLastShotBlob = shot ? shot.blob : null;
    window.__elementPickerLastHtml = htmlPath || htmlErr;
    window.__elementPickerLastError = shotErr || (shot && !imageOk ? lastClipError : null);
    return ok;
  }

  // ───────────────────────── Lasso: Bereich → Container ───────────────────
  // Container mit der größten räumlichen Überdeckung (Schnitt/Vereinigung) unter
  // den Elementen am Mittelpunkt des Bereichs und ihren Vorfahren.
  function bestContainer(r) {
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const cands = new Set();
    for (const e of document.elementsFromPoint(cx, cy)) for (let p = e; p; p = p.parentElement) cands.add(p);
    const area = r.width * r.height;
    let best = null, bestScore = -1;
    for (const el of cands) {
      if (el.closest("[data-llment-picker]")) continue;
      const b = el.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.left + r.width, b.right) - Math.max(r.left, b.left));
      const iy = Math.max(0, Math.min(r.top + r.height, b.bottom) - Math.max(r.top, b.top));
      const inter = ix * iy, union = area + b.width * b.height - inter;
      const score = union > 0 ? inter / union : 0;
      if (score > bestScore) { bestScore = score; best = el; }
    }
    return { el: best || document.body, pct: Math.max(0, Math.round(bestScore * 100)) };
  }
  // r: Bereich in Fensterkoordinaten; anchor: Element, an dem der Bereich hängt
  // (folgt beim Scrollen mit, auch in Scroll-Containern)
  function copyLasso(r, anchor, opts) {
    const a = anchor.getBoundingClientRect();
    const dx = r.left - a.left, dy = r.top - a.top;
    const measure = () => { const b = anchor.getBoundingClientRect(); return { left: b.left + dx, top: b.top + dy, width: r.width, height: r.height }; };
    const { el, pct } = bestContainer(r);
    const line = t("lineLasso", Math.round(r.width), Math.round(r.height), pct);
    return copyElement(el, undefined, { shot: true, html: !!opts.html, region: { measure, line } });
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
      copyElement(marked.el, marked.text, { shot, html }).then(() => reportState(false));
      return "picked";
    }
    const el = contextTarget(id);
    if (el) {
      copyElement(el, undefined, { shot, html }).then(() => reportState(false));
      return "picked";
    }
    // Kein Ziel bestimmbar → in den Picker-Modus fallen statt aufzugeben.
    contextFallback = true;
  }

  // ───────────────────────── Weg a: Picker-Modus (Toggle) ─────────────────
  if (window[KEY]) {
    if (PASS2) return "skip"; // zweiter Durchlauf: laufenden Picker nicht umschalten
    window[KEY].cancel();
    return "cancelled";
  }

  // Voreinstellung aus dem Icon-Menü („Element wählen – mit Screenshot" usw.)
  const preset = Object.assign({ shot: false, html: false }, window.__elementPickerPreset || {});
  delete window.__elementPickerPreset;

  // Ist Text markiert, ist das Ziel schon klar: Element + Markierung kopieren,
  // kein Picker-Modus. (Für den Picker-Modus vorher die Markierung aufheben.)
  if (!contextFallback) {
    const marked = selectionTarget();
    if (marked) {
      copyElement(marked.el, marked.text, preset).then(() => reportState(false));
      return "picked";
    }
  }

  // Modifier-Anzeige rechts oben außerhalb des Rahmens. Nicht klickbar –
  // die Chips zeigen nur, was Alt (Screenshot) und Strg (HTML-Datei)
  // beim Klick zusätzlich auslösen, und leuchten, solange die Taste gehalten wird.
  // Symbole als DOM-Knoten (kein innerHTML – AMO-Review)
  const NS = "http://www.w3.org/2000/svg";
  function svgIcon(paths) {
    const svg = document.createElementNS(NS, "svg");
    svg.style.cssText = "display:block;flex:none";
    for (const [k, v] of Object.entries({ width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.3", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
    for (const [tag, attrs] of paths) {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
      svg.appendChild(n);
    }
    return svg;
  }
  const ICON_CAM = () => { const i = svgIcon([["path", { d: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" }], ["circle", { cx: "12", cy: "13", r: "4" }]]); i.style.marginTop = "-1px"; return i; };
  const ICON_CODE = () => svgIcon([["polyline", { points: "16 18 22 12 16 6" }], ["polyline", { points: "8 6 2 12 8 18" }]]);
  const ICON_LASSO = () => svgIcon([["rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", "stroke-dasharray": "4 3" }]]);
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
      t.style.lineHeight = "1";
      t.style.position = "relative";
      t.style.top = "0px";
      t.textContent = hint;
      c.appendChild(t);
    }
  }
  let showHints = true; // Tastenhinweise dauerhaft, abschaltbar in den Einstellungen
  const codeChip = chip(), camChip = chip(), lassoChip = chip();
  hud.append(codeChip, camChip, lassoChip);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const CTRL_LABEL = isMac ? t("hintHtmlMac") : t("hintHtml");
  function applyHints() {
    fillChip(codeChip, ICON_CODE(), showHints ? CTRL_LABEL : "");
    fillChip(camChip, ICON_CAM(), showHints ? t("hintShot") : "");
    fillChip(lassoChip, ICON_LASSO(), showHints ? t("hintLasso") : "");
  }
  applyHints();
  try {
    api.storage.sync.get({ hideHints: false }).then((v) => {
      showHints = !v.hideHints;
      applyHints();
      if (current) placeHud(current.getBoundingClientRect());
    });
  } catch {}
  let mods = { alt: false, ctrl: false, lasso: false };
  const LIT = "#0a84ff", DIM = "rgba(70,80,95,.85)";
  function setMods(alt, ctrl) {
    const lasso = !!(drag && drag.active);
    alt = alt || preset.shot || lasso; // Lasso kopiert immer mit Screenshot
    ctrl = ctrl || preset.html;
    if (mods.alt === alt && mods.ctrl === ctrl && mods.lasso === lasso) return;
    mods = { alt, ctrl, lasso };
    camChip.style.background = alt ? LIT : DIM;
    codeChip.style.background = ctrl ? LIT : DIM;
    lassoChip.style.background = lasso ? LIT : DIM;
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
  const lassoBox = document.createElement("div");
  lassoBox.setAttribute("data-llment-picker", "");
  lassoBox.style.cssText = `position:fixed;pointer-events:none;z-index:${Z};box-sizing:border-box;
    border:2px dashed #0a84ff;background:rgba(10,132,255,.10);border-radius:2px;display:none;`;
  const style = document.createElement("style");
  style.setAttribute("data-llment-picker", "");
  style.textContent = `*, *::before, *::after { cursor: crosshair !important; }`;
  document.documentElement.append(box, label, hud, lassoBox, style);

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
  // Zeiger auf einem eingebetteten Frame: eigenen Rahmen ausblenden, dort
  // übernimmt der Picker des Frames (er bekommt die Mausbewegungen).
  function hideHighlight() {
    current = null;
    box.style.display = "none";
    label.style.display = "none";
    hud.style.display = "none";
  }
  // Lasso: Linksklick halten und mindestens LASSO_MIN px ziehen. Der Startpunkt
  // hängt am Element darunter, damit Scrollen während des Ziehens mitgeht.
  const LASSO_MIN = 6;
  let drag = null; // { anchor, ax, ay, active }
  function lassoRect(d, e) {
    const a = d.anchor.getBoundingClientRect();
    const x0 = a.left + d.ax, y0 = a.top + d.ay;
    return { left: Math.min(x0, e.clientX), top: Math.min(y0, e.clientY), width: Math.abs(e.clientX - x0), height: Math.abs(e.clientY - y0) };
  }
  function showLasso(r) {
    lassoBox.style.display = "block";
    lassoBox.style.left = r.left + "px";
    lassoBox.style.top = r.top + "px";
    lassoBox.style.width = r.width + "px";
    lassoBox.style.height = r.height + "px";
    label.textContent = Math.round(r.width) + "×" + Math.round(r.height) + " px";
    label.style.display = "block";
    label.style.left = Math.max(0, r.left) + "px";
    label.style.top = (r.top > 24 ? r.top - 22 : r.top + r.height + 2) + "px";
    placeHud(r);
  }
  function onDown(e) {
    swallow(e);
    if (e.button !== 0) return;
    const anchor = targetAt(e.clientX, e.clientY) || document.documentElement;
    const a = anchor.getBoundingClientRect();
    drag = { anchor, ax: e.clientX - a.left, ay: e.clientY - a.top, active: false };
  }
  function onUp(e) {
    swallow(e);
    const d = drag;
    drag = null;
    if (!d || !d.active) return;
    lassoBox.style.display = "none";
    const r = lassoRect(d, e);
    if (r.width < LASSO_MIN || r.height < LASSO_MIN) { onScroll(); return; }
    const withHtml = e.ctrlKey || e.metaKey || preset.html;
    cleanup();
    // Das auf das Loslassen folgende click-Ereignis gehört nicht der Seite
    const once = (ev) => { swallow(ev); window.removeEventListener("click", once, opts); };
    window.addEventListener("click", once, opts);
    setTimeout(() => window.removeEventListener("click", once, opts), 400);
    flashRect(r);
    copyLasso(r, d.anchor, { html: withHtml });
  }
  function onMove(e) {
    if (drag) {
      if (!drag.active) {
        const a = drag.anchor.getBoundingClientRect();
        if (Math.hypot(e.clientX - (a.left + drag.ax), e.clientY - (a.top + drag.ay)) >= LASSO_MIN) {
          drag.active = true;
          hideHighlight();
        }
      }
      if (drag.active) {
        setMods(e.altKey, e.ctrlKey || e.metaKey);
        showLasso(lassoRect(drag, e));
        return;
      }
    }
    setMods(e.altKey, e.ctrlKey || e.metaKey);
    lastXY = [e.clientX, e.clientY];
    const el = targetAt(e.clientX, e.clientY);
    if (el && (el.tagName === "IFRAME" || el.tagName === "FRAME")) { hideHighlight(); return; }
    if (el) highlight(el);
  }
  function onScroll() {
    if (drag && drag.active) return;
    if (!lastXY) return;
    current = null;
    const el = targetAt(lastXY[0], lastXY[1]);
    if (el) highlight(el);
  }

  function swallow(e) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  // pointerdown nur abschirmen, nicht verhindern: preventDefault darauf
  // unterdrückt die folgenden mousedown/mousemove/mouseup (Pointer-Events-Spec),
  // und das Lasso bekäme keine Bewegung mehr.
  function shield(e) {
    e.stopImmediatePropagation();
  }

  // Kurzes Aufleuchten des Rahmens: „Element erfasst"
  const flash = (el) => flashRect(el.getBoundingClientRect());
  function flashRect(r) {
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
    const withShot = e.altKey || preset.shot, withHtml = e.ctrlKey || e.metaKey || preset.html;
    const el = targetAt(e.clientX, e.clientY) || current;
    if (!el || el.tagName === "IFRAME" || el.tagName === "FRAME") return;
    cleanup();
    flash(el);
    await copyElement(el, undefined, { shot: withShot, html: withHtml });
  }

  function onKey(e) {
    if (e.key === "Escape") {
      swallow(e);
      cleanup();
      toast(t("toastCancelled"), false);
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
  function cleanup(noReport) {
    window.removeEventListener("mousemove", onMove, opts);
    window.removeEventListener("scroll", onScroll, opts);
    window.removeEventListener("click", onClick, opts);
    window.removeEventListener("mousedown", onDown, opts);
    window.removeEventListener("mouseup", onUp, opts);
    window.removeEventListener("pointerdown", shield, opts);
    window.removeEventListener("dragstart", swallow, opts);
    window.removeEventListener("selectstart", swallow, opts);
    drag = null;
    lassoBox.remove();
    window.removeEventListener("keydown", onKey, opts);
    window.removeEventListener("keyup", onKeyUp, opts);
    box.remove();
    label.remove();
    hud.remove();
    if (!noReport) reportState(false);
    style.remove();
    delete window[KEY];
  }

  window.addEventListener("mousemove", onMove, opts);
  window.addEventListener("scroll", onScroll, opts);
  window.addEventListener("click", onClick, opts);
  window.addEventListener("mousedown", onDown, opts);
  window.addEventListener("mouseup", onUp, opts);
  window.addEventListener("pointerdown", shield, opts);
  window.addEventListener("dragstart", swallow, opts);
  window.addEventListener("selectstart", swallow, opts);
  window.addEventListener("keydown", onKey, opts);
  window.addEventListener("keyup", onKeyUp, opts);
  reportState(true);
  setMods(false, false); // zeigt eine Voreinstellung sofort an
  if (contextFallback) toast(t("toastPickElement"), false);

  window[KEY] = {
    // silent: kein Toast; noReport: kein Abbruch-Broadcast (kam selbst aus einem)
    cancel(silent, noReport) {
      cleanup(noReport);
      if (!silent) toast(t("toastCancelled"), false);
    },
    // für Tests: Selektor eines beliebigen Elements berechnen
    buildSelector,
    selectionTarget,
  };
  return "picker";
})();
