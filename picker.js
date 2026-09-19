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
  // Zwischenablage- und Dateitexte (Schlüssel line*, file*, media*) optional immer
  // Englisch: das Hintergrundskript liefert die englische Tabelle, sobald die
  // Einstellung gesetzt ist; bis dahin (und für die Oberfläche) entscheidet die
  // Browsersprache.
  let EN = null;
  const enReady = (async () => {
    try {
      const v = await api.storage.sync.get({ clipEnglish: false });
      if (!v.clipEnglish) return;
      const res = await api.runtime.sendMessage({ type: "llment-i18n-en" });
      if (res && res.messages) EN = res.messages;
    } catch {}
  })();
  const fromEN = (key, subs) => {
    const m = EN[key];
    if (!m) return null;
    let out = m.message;
    for (const [name, ph] of Object.entries(m.placeholders || {})) {
      const idx = parseInt(String(ph.content).replace("$", ""), 10) - 1;
      out = out.replace(new RegExp("[$]" + name + "[$]", "gi"), subs[idx] != null ? String(subs[idx]) : "");
    }
    return out;
  };
  const t = (key, ...subs) => {
    try {
      if (EN && /^(line|file|media|rec)/.test(key)) { const v = fromEN(key, subs); if (v != null) return v; }
      return api.i18n.getMessage(key, subs.map(String)) || key;
    } catch { return key; }
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

  // Erste Zeile: Maschinenlabel mit den Bestandteilen, immer Englisch – ein
  // Agent erkennt daran das Schema, ohne aus den Zeilen zu raten.
  const tagLine = (parts) => `[LLMent: ${parts.join(", ")}]`;
  // Schlussmarke: schließt den Block; der Cursor steht nach dem Einfügen in der
  // Zeile darunter, frei für den eigenen Hinweis
  const END = "\n---\n";
  const shotPart = (file, clip) => "shot:" + [file && "file", clip && "clip"].filter(Boolean).join("+");
  function payloadFor(el, text, shotInfo, htmlPath, note, shotPath, shotClip, selectorText, kind) {
    const fl = frameLine();
    const parts = [kind || (note ? "region" : "element")];
    if (text) parts.push("text");
    if (shotInfo) parts.push(shotPart(shotPath, shotClip));
    if (htmlPath) parts.push("html:file");
    if (fl) parts.push("frame");
    const lines = [tagLine(parts), location.href, selectorText || buildSelector(el)];
    if (note) lines.push(note);
    if (text) lines.push(JSON.stringify(text));
    if (shotInfo) lines.push(shotInfo);
    if (shotPath) lines.push(t("lineShotFile") + shotPath);
    if (htmlPath) lines.push(t("lineHtml") + htmlPath);
    if (fl) lines.push(fl);
    return lines.join("\n") + END;
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

  // Schlank-Modus: entfernt, was fürs Lesen und Nachbauen nicht zählt und
  // Token kostet. Kurze data-Attribute (data-aos="fade-up") bleiben, Bildquellen
  // in data-Attributen (Lazy-Loading) auch. Liefert die Zählung für die Kopfzeile.
  function slimHtml(root) {
    const n = { blocks: 0, hidden: 0, handlers: 0, data: 0, srcset: 0, svg: 0, comments: 0, uris: 0, selects: 0 };
    // Vorhandene Kommentare zuerst – die eigenen Platzhalter unten bleiben
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    const comments = [];
    for (let c = walker.nextNode(); c; c = walker.nextNode()) comments.push(c);
    comments.forEach((c) => { c.remove(); n.comments++; });
    root.querySelectorAll("style, template").forEach((x) => { x.remove(); n.blocks++; });
    root.querySelectorAll('input[type="hidden"]').forEach((x) => { x.remove(); n.hidden++; });
    root.querySelectorAll("svg").forEach((x) => { if (x.childElementCount) { n.svg++; x.replaceChildren(document.createComment(" " + x.childElementCount + " ")); } });
    // Gleiche Auswahllisten (z. B. je Tabellenzeile ein Select mit denselben Optionen):
    // ab der zweiten nur die gewählte Option, der Rest steht in der ersten
    const seen = new Map();
    root.querySelectorAll("select").forEach((sel) => {
      const key = Array.from(sel.options, (o) => o.value + "=" + o.text).join("|");
      if (!seen.has(key)) { seen.set(key, true); return; }
      const keep = Array.from(sel.selectedOptions);
      if (!keep.length || keep.length === sel.options.length) return;
      sel.replaceChildren(...keep, document.createComment(" +" + (sel.options.length - keep.length) + " "));
      n.selects++;
    });
    const all = [root, ...root.querySelectorAll("*")];
    for (const x of all) {
      for (const a of Array.from(x.attributes)) {
        const name = a.name, v = a.value;
        if (name.startsWith("on")) { x.removeAttribute(name); n.handlers++; }
        else if (name === "srcset" || name === "sizes" || name === "data-srcset") { x.removeAttribute(name); n.srcset++; }
        else if (name.startsWith("data-") && !/src|href|url|img|image|bg|background/.test(name) && (v.length > 60 || /^[\[{]/.test(v))) { x.removeAttribute(name); n.data++; }
        else if (name === "style" && !v.trim()) x.removeAttribute(name);
        else if (v.length > 200 && v.includes("data:")) { x.setAttribute(name, v.replace(/data:[^"'\s)]{120,}/g, (m) => m.slice(0, 40) + "…")); n.uris++; }
      }
    }
    return n;
  }

  function htmlFor(el, selector, withCss, slim) {
    const list = Array.isArray(el) ? el : [el];
    el = list[0];
    const clones = list.map((e) => e.cloneNode(true));
    clones.forEach((c) => c.querySelectorAll("script, noscript").forEach((n) => n.remove()));
    let slimmed = null;
    if (slim) { slimmed = {}; for (const c of clones) for (const [k, v] of Object.entries(slimHtml(c))) slimmed[k] = (slimmed[k] || 0) + v; }
    let head = `<!-- LLMent Picker · ${new Date().toISOString()}
${t("fileUrl")}: ${location.href}
${t("fileSelector")}: ${selector}
${t("fileTitle")}: ${document.title.replace(/-->/g, "--&gt;")}
${t("fileViewport")}: ${innerWidth}×${innerHeight}, DPR ${Math.round(devicePixelRatio * 100) / 100}
`;
    if (IN_FRAME) head += `${t("fileFrame")}: ${location.href}\n`;
    if (slimmed) {
      const parts = [["blocks", "fileSlimBlocks"], ["hidden", "fileSlimHidden"], ["handlers", "fileSlimHandlers"], ["data", "fileSlimData"], ["srcset", "fileSlimSrcset"], ["svg", "fileSlimSvg"], ["comments", "fileSlimComments"], ["uris", "fileSlimUris"], ["selects", "fileSlimSelects"]]
        .filter(([k]) => slimmed[k]).map(([k, key]) => t(key, slimmed[k]));
      head += `${t("fileSlim")}: ${parts.length ? parts.join(", ") : t("fileNone")}\n`;
    }
    if (withCss) {
      let ctx = t("fileCssUnavailable");
      try { ctx = cssContext(el); } catch (e) { ctx += ": " + (e && e.message); }
      head += "\n" + ctx + "\n";
    }
    const raw = clones.map((c) => c.outerHTML).join("\n");
    const html = slim ? raw.replace(/\n[ \t]*\n+/g, "\n") : raw;
    return head + "-->\n" + html + "\n";
  }

  function slugFor(el) {
    const cls = bestClass(el);
    const raw = el.id && usableId(el) ? el.id : cls ? cls : el.tagName.toLowerCase();
    return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "element";
  }

  // Dateiname ohne Endung: Datum_Zeit_Host_Kennung – HTML und Screenshot
  // desselben Klicks tragen denselben Stamm
  function fileBase(el) {
    if (Array.isArray(el)) el = el[0];
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
    const host = location.hostname.replace(/^www\./, "") || (location.protocol === "file:" ? "file" : "local");
    return `${stamp}_${host}_${slugFor(el)}`;
  }
  // Speichern über das Hintergrundskript (downloads); Text als content, Binärdaten als dataUrl
  async function saveFile(msg) {
    const res = await api.runtime.sendMessage(Object.assign({ type: "llment-save" }, msg));
    if (!res || !res.path) throw new Error((res && res.error) || "nicht gespeichert");
    return res.path;
  }
  async function saveHtml(el, selector, base) {
    let withCss = true, slim = true;
    try {
      const v = await api.storage.sync.get({ cssInHtml: true, htmlSlim: true });
      withCss = v.cssInHtml !== false;
      slim = v.htmlSlim !== false;
    } catch {}
    return saveFile({ filename: base + ".html", content: htmlFor(el, selector, withCss, slim), mime: "text/html;charset=utf-8" });
  }
  async function saveShot(blob, base) {
    const dataUrl = await new Promise((ok, err) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = err; fr.readAsDataURL(blob); });
    return saveFile({ filename: base + ".png", dataUrl });
  }
  // Wohin der Screenshot geht: Zwischenablage, Datei oder beides (Einstellung)
  async function shotTarget() {
    try { return (await api.storage.sync.get({ shotTarget: "file" })).shotTarget || "file"; } catch { return "file"; }
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
    let info = t("lineShot", innerWidth, innerHeight, dpr, cv.width, cv.height);
    if (pad) info += t("lineShotPad", pad);
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
    await enReady;
    const withShot = !!opts.shot, withHtml = !!opts.html;
    let shot = null, htmlPath = null, htmlErr = null, shotErr = null, shotPath = null, shotFileErr = null;
    const target = withShot ? await shotTarget() : "file";
    const toClip = target !== "file", toFile = target !== "clipboard";
    if (withShot) {
      try {
        shot = await (opts.region ? captureRegion(opts.region.measure, el, 0) : opts.list ? captureRegion(() => inflate(unionRect(opts.list), SHOT_PAD), el, SHOT_PAD) : captureElement(el));
      } catch (e) {
        shotErr = (e && e.message) || String(e);
        console.warn("LLMent Picker: Screenshot fehlgeschlagen –", shotErr);
      }
    }
    const selector = opts.list ? opts.list.map((x) => buildSelector(x)).join(", ") : buildSelector(el);
    const base = withShot || withHtml ? fileBase(el) : null;
    if (shot && toFile) {
      try {
        shotPath = await saveShot(shot.blob, base);
      } catch (e) {
        shotFileErr = ((e && e.message) || String(e)).replace(/data:[^\s]+/g, "data:…").slice(0, 120);
        console.warn("LLMent Picker: Screenshot nicht gespeichert –", shotFileErr);
      }
    }
    if (withHtml) {
      try {
        htmlPath = await saveHtml(opts.list || el, selector, base);
      } catch (e) {
        htmlErr = ((e && e.message) || String(e)).replace(/data:[^\s]+/g, "data:…").slice(0, 120);
        console.warn("LLMent Picker: HTML nicht gespeichert –", htmlErr);
      }
    }
    const note = opts.region ? opts.region.line : opts.list ? t("lineRange", opts.list.length, buildSelector(opts.list[0]), buildSelector(opts.list[opts.list.length - 1])) : null;
    let payload = payloadFor(el, text, shot && shot.info, htmlPath, note, shotPath, !!(shot && toClip), selector, opts.list ? "range" : null);
    let ok = false, imageOk = false;
    if (shot && toClip && (await copyWithImage(payload, shot.blob))) ok = imageOk = true;
    else {
      // Bild nicht in der Zwischenablage → das Label darf es nicht behaupten
      payload = payloadFor(el, text, shot && shot.info, htmlPath, note, shotPath, false, selector, opts.list ? "range" : null);
      ok = await copy(payload);
    }
    const parts = [];
    if (!ok) parts.push(t("toastCopyFailed"));
    else if (imageOk) parts.push(t("toastCopiedShot"));
    else if (shot && toClip) parts.push(t("toastShotNotWritten", lastClipError.slice(0, 60)));
    else if (withShot && !shot) parts.push(t("toastTextOnly") + (shotErr ? ": " + shotErr.slice(0, 60) : ""));
    else parts.push(t("toastCopied"));
    if (shot && toFile) parts.push(shotPath ? t("toastShotSaved") : t("toastShotSaveFailed") + (shotFileErr ? ": " + shotFileErr : ""));
    if (withHtml) parts.push(htmlPath ? t("toastHtmlSaved") : t("toastHtmlFailed") + (htmlErr ? ": " + htmlErr : ""));
    const good = ok && !(withShot && !shot) && !(shot && toClip && !imageOk) && !(shot && toFile && !shotPath) && !(withHtml && !htmlPath);
    toast(parts.join(" · "), good, good ? 1400 : 4000);
    window.__elementPickerLast = payload; // für Tests / Debugging
    window.__elementPickerLastShot = shot ? { bytes: shot.blob && shot.blob.size, info: shot.info, written: imageOk, path: shotPath } : null;
    window.__elementPickerLastShotBlob = shot ? shot.blob : null;
    window.__elementPickerLastHtml = htmlPath || htmlErr;
    window.__elementPickerLastError = shotErr || (shot && !imageOk ? lastClipError : null);
    return ok;
  }

  // ───────────────────────── Lasso: Bereich → Container ───────────────────
  // Kandidaten: Elemente an fünf Punkten des Bereichs (Mitte, Viertelpunkte)
  // samt Vorfahren. Liegen mehrere Elemente großteils im Bereich, ist das Ziel
  // ihr kleinster gemeinsamer Container und sie werden genannt; sonst das
  // Element mit der größten Überdeckung (Schnitt/Vereinigung).
  function bestContainer(r) {
    const cands = new Set();
    for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      for (const e of document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy)) for (let p = e; p; p = p.parentElement) cands.add(p);
    }
    const area = r.width * r.height;
    const stats = [];
    for (const el of cands) {
      if (el.closest("[data-llment-picker]")) continue;
      const b = el.getBoundingClientRect();
      const ix = Math.max(0, Math.min(r.left + r.width, b.right) - Math.max(r.left, b.left));
      const iy = Math.max(0, Math.min(r.top + r.height, b.bottom) - Math.max(r.top, b.top));
      const inter = ix * iy, own = b.width * b.height, union = area + own - inter;
      stats.push({ el, iou: union > 0 ? inter / union : 0, inside: own > 0 ? inter / own : 0, own });
    }
    // Elemente, die großteils im Bereich liegen (ohne Vorfahren solcher Elemente)
    let inside = stats.filter((s) => s.inside >= 0.6 && s.own >= area * 0.05);
    inside = inside.filter((s) => !inside.some((o) => o !== s && s.el.contains(o.el)));
    if (inside.length >= 2) {
      let anc = inside[0].el.parentElement;
      while (anc && !inside.every((s) => anc.contains(s.el))) anc = anc.parentElement;
      const st = stats.find((s) => s.el === anc);
      return { el: anc || document.body, pct: Math.round((st ? st.iou : 0) * 100), parts: inside.map((s) => s.el) };
    }
    let best = null;
    for (const s of stats) if (!best || s.iou > best.iou) best = s;
    return { el: best ? best.el : document.body, pct: Math.max(0, Math.round((best ? best.iou : 0) * 100)), parts: [] };
  }
  // r: Bereich in Fensterkoordinaten; anchor: Element, an dem der Bereich hängt
  // (folgt beim Scrollen mit, auch in Scroll-Containern)
  function copyLasso(r, anchor, opts) {
    const a = anchor.getBoundingClientRect();
    const dx = r.left - a.left, dy = r.top - a.top;
    const measure = () => { const b = anchor.getBoundingClientRect(); return { left: b.left + dx, top: b.top + dy, width: r.width, height: r.height }; };
    const { el, pct, parts } = bestContainer(r);
    const W = Math.round(r.width), H = Math.round(r.height);
    const line = parts.length
      ? t("lineLassoParts", W, H, pct, parts.slice(0, 6).map((p) => buildSelector(p)).join(", ") + (parts.length > 6 ? ", …" : ""))
      : t("lineLasso", W, H, pct);
    return copyElement(el, undefined, { shot: true, html: !!opts.html, region: { measure, line } });
  }

  // ───────────────────────── Interaktions-Aufnahme ─────────────────────────
  // Element wählen, dann fünf Sekunden hovern und klicken: der Picker schreibt
  // mit, was die Seite dabei tut (Hover-Regeln, deklarierte Übergänge, Zustands-
  // diff, DOM-Änderungen, laufende Animationen, Bildrate) und nimmt alle 550 ms
  // ein Bild auf – als Kontaktbogen im selben Zwischenablage-Eintrag. Für „das
  // ruckelt", „das Pop-up sitzt falsch": ein Video könnte ein Sprachmodell nicht
  // lesen, Bilder und Daten schon.
  const REC_MS = 5000, REC_FRAME_MS = 550, REC_MAX_EL = 150, REC_PAD = 48, REC_SETTLE = 450;
  const STATE_PROPS = ["display", "visibility", "opacity", "transform", "color", "background-color", "border-color", "box-shadow",
    "width", "height", "top", "left", "right", "bottom", "margin", "padding", "max-height", "font-size", "font-weight",
    "text-decoration-line", "outline-width", "filter", "z-index", "cursor"];
  const PSEUDO = /:(hover|focus-within|focus-visible|focus|active)\b/g;
  const LAYOUT_RE = /\b(width|height|top|left|right|bottom|margin|padding|max-height|max-width|min-height|min-width|font-size|line-height|border-width|inset|flex|gap)\b/;
  const secs = (ms) => (ms / 1000).toFixed(2) + " s";
  const selOf = (el) => { try { return buildSelector(el); } catch { return el && el.tagName ? el.tagName.toLowerCase() : String(el); } };
  const isOwn = (n) => !!(n && n.nodeType === 1 && n.closest("[data-llment-picker], [data-llment-rec]"));
  const shortVal = (v) => (v.length > 60 ? v.slice(0, 57) + "…" : v);
  const descOf = (n) => n.tagName.toLowerCase() + (n.id ? "#" + n.id : "") + Array.from(n.classList).slice(0, 2).map((c) => "." + c).join("");

  // Regeln mit :hover/:focus/:active, die das Element, Nachkommen oder Vorfahren treffen
  function pseudoRules(root, limit) {
    const found = [];
    const walk = (rules, sheet, ctx) => {
      for (const r of rules) {
        if (found.length >= limit) return;
        if (r instanceof CSSStyleRule) {
          const st = r.selectorText || "";
          PSEUDO.lastIndex = 0;
          if (!PSEUDO.test(st)) continue;
          for (const part of st.split(",")) {
            PSEUDO.lastIndex = 0;
            if (!PSEUDO.test(part)) continue;
            const base = part.replace(PSEUDO, "").trim();
            if (!base || /^[>+~]/.test(base)) continue;
            let where = null;
            try {
              if (root.matches(base)) where = "";
              else if (root.querySelector(base)) where = t("recInside");
              else if (root.closest(base)) where = t("recAncestor");
            } catch {}
            if (where == null) continue;
            const css = r.cssText.length > 500 ? r.cssText.slice(0, 500) + " …" : r.cssText;
            found.push(`/* ${sheet}${ctx ? " · " + ctx : ""}${where ? " · " + where : ""} */ ${css}`);
            break;
          }
        } else if (r instanceof CSSMediaRule) {
          const cond = r.conditionText || r.media.mediaText;
          walk(r.cssRules, sheet, (ctx ? ctx + " · " : "") + `@media ${cond} [${matchMedia(cond).matches ? t("mediaActive") : t("mediaInactive")}]`);
        } else if (r.cssRules) {
          try { walk(r.cssRules, sheet, ctx); } catch {}
        }
      }
    };
    for (const sh of Array.from(document.styleSheets)) {
      let rules;
      try { rules = sh.cssRules; } catch { continue; }
      const node = sh.ownerNode;
      walk(rules, sh.href ? sh.href.replace(location.origin, "") : node && node.id ? `<style id="${node.id}">` : "<style>", "");
    }
    return found;
  }

  // Deklarierte Übergänge/Animationen im Teilbaum, gruppiert, mit Hinweisen
  function declaredMotion(root) {
    const els = [root, ...root.querySelectorAll("*")].filter((e) => !isOwn(e)).slice(0, REC_MAX_EL);
    const groups = new Map();
    for (const e of els) {
      const cs = getComputedStyle(e);
      const items = [];
      // Kurzform ausgeschrieben – Chrome lässt „all" in cs.transition weg
      if (/[1-9]/.test(cs.transitionDuration)) items.push(`transition: ${cs.transitionProperty} ${cs.transitionDuration} ${cs.transitionTimingFunction}${/[1-9]/.test(cs.transitionDelay) ? " delay " + cs.transitionDelay : ""}`);
      if (cs.animationName && cs.animationName !== "none") items.push("animation: " + cs.animation);
      for (const it of items) {
        const g = groups.get(it) || { els: [], n: 0 };
        g.n++;
        if (g.els.length < 3) g.els.push(selOf(e));
        groups.set(it, g);
      }
    }
    const lines = [];
    for (const [decl, g] of groups) {
      const notes = [];
      if (/^transition/.test(decl)) {
        if (/\ball\b/.test(decl)) notes.push(t("recNoteAll"));
        else if (LAYOUT_RE.test(decl)) notes.push(t("recNoteLayout"));
        if (/box-shadow|filter/.test(decl)) notes.push(t("recNotePaint"));
      }
      lines.push(`${g.els.join(", ")}${g.n > g.els.length ? ` (+${g.n - g.els.length})` : ""}: ${decl}${notes.length ? "  ← " + notes.join("; ") : ""}`);
    }
    return lines;
  }

  function snapshot(root) {
    const m = new Map();
    for (const e of [root, ...root.querySelectorAll("*")].slice(0, REC_MAX_EL)) {
      if (isOwn(e)) continue;
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      const o = { rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}` };
      for (const p of STATE_PROPS) o[p] = cs.getPropertyValue(p);
      m.set(e, o);
    }
    return m;
  }
  // Verschiebung eines Elements, die nur der Verschiebung seines Elternteils folgt, ist kein eigener Befund
  const shift = (a, b) => { const [pa, sa] = a.split(" "), [pb, sb] = b.split(" "); const [ax, ay] = pa.split(",").map(Number), [bx, by] = pb.split(",").map(Number); return { d: `${bx - ax},${by - ay}`, same: sa === sb }; };
  function diffSnap(a, b, limit) {
    const lines = [];
    for (const [e, o] of b) {
      const p = a.get(e);
      if (!p) { lines.push(`${selOf(e)}: ${t("recNew")}`); if (lines.length >= limit) break; continue; }
      const ch = [];
      for (const k of Object.keys(o)) {
        if (o[k] === p[k]) continue;
        if (k === "rect" && e.parentElement && a.has(e.parentElement) && b.has(e.parentElement)) {
          const mine = shift(p.rect, o.rect), theirs = shift(a.get(e.parentElement).rect, b.get(e.parentElement).rect);
          if (mine.same && mine.d === theirs.d) continue;
        }
        ch.push(`${k} ${shortVal(p[k])} → ${shortVal(o[k])}`);
      }
      if (ch.length) lines.push(`${selOf(e)}: ${ch.join("; ")}`);
      if (lines.length >= limit) break;
    }
    return lines;
  }

  // Kontaktbogen: Bilder in einem Raster, Zeitstempel unter jedem, Zeiger als Punkt
  async function contactSheet(frames, region, k) {
    const imgs = await Promise.all(frames.map((f) => loadImage(f.dataUrl)));
    const fw = region.width * k, fh = region.height * k;
    const cols = fw >= fh ? 2 : Math.min(5, frames.length);
    const scale = Math.min(1, 1200 / fw, 900 / fh);
    const cw = Math.round(fw * scale), ch = Math.round(fh * scale), strip = 18, gap = 6;
    const rows = Math.ceil(frames.length / cols);
    const cv = document.createElement("canvas");
    cv.width = cols * cw + (cols + 1) * gap;
    cv.height = rows * (ch + strip) + (rows + 1) * gap;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, cv.width, cv.height);
    frames.forEach((f, i) => {
      const x = gap + (i % cols) * (cw + gap), y = gap + Math.floor(i / cols) * (ch + strip + gap);
      ctx.drawImage(imgs[i], region.left * k, region.top * k, fw, fh, x, y, cw, ch);
      if (f.pointer) {
        const px = x + (f.pointer.x - region.left) * k * scale, py = y + (f.pointer.y - region.top) * k * scale;
        if (px >= x && px <= x + cw && py >= y && py <= y + ch) {
          ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(10,132,255,.55)"; ctx.fill();
          ctx.lineWidth = 2; ctx.strokeStyle = "#fff"; ctx.stroke();
        }
      }
      ctx.fillStyle = "#fff";
      ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
      ctx.fillText(`${i + 1}  t = ${secs(f.t)}`, x + 4, y + ch + 13);
    });
    return cv;
  }

  // fixedRegion: Bildausschnitt aus dem Lasso statt aus dem Element
  async function recordInteraction(root, fixedRegion, opts) {
    guardAlt(true);
    reportState(true);
    const target = await shotTarget();
    const toClip = target !== "file", toFile = target !== "clipboard";
    const perf0 = performance.now();
    const rel = () => performance.now() - perf0;
    const events = [], mutations = new Map(), anims = [], animGroups = new Map(), seenAnim = new WeakSet(), longFrames = [], loaf = [];
    const frames = [], addedNodes = [], hovers = [], pointers = [];
    let pointer = null, inside = true, baseline = null, lastDiffAt = -1e9, baselineNote = t("recBaseStart"), residual = null, lastHover = null, running = true, frameCount = 0, lastScroll = -1e9;
    const startSnap = snapshot(root);
    const rootRect = root.getBoundingClientRect();
    // Statuschip oben rechts (bei den Aufnahmen ausgeblendet wie alle eigenen Overlays)
    const chip = document.createElement("div");
    // Kein data-llment-picker: der Chip bleibt während der Aufnahmen stehen (sonst
    // flackert er im Takt der Bilder); er liegt oben rechts, außerhalb des Bereichs.
    chip.setAttribute("data-llment-rec", "");
    chip.style.cssText = `position:fixed;top:16px;right:16px;z-index:${Z};pointer-events:none;max-width:46vw;font:13px/1.3 system-ui,sans-serif;color:#fff;background:#d0342c;padding:8px 12px;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.25);`;
    document.documentElement.appendChild(chip);
    const tick = setInterval(() => (chip.textContent = "\u25cf " + (baseline ? t("recStatus", secs(rel())) : t("recStatusLeave", secs(rel())))), 100);
    const pushEvent = (text) => { if (events.length < 40) events.push(`${secs(rel())}  ${text}`); };
    const onMoveRec = (e) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (pointers.length < 400) pointers.push(pointer);
      const now = root.contains(e.target) && !isOwn(e.target);
      if (now && !inside) {
        const at = rel();
        lastDiffAt = at;
        // Schnappschuss nur, wenn der Zeiger nach dem Setzintervall noch drinnen ist
        if (hovers.length < 3) setTimeout(() => { if (running && inside) hovers.push({ t: at, lines: diffSnap(baseline || startSnap, snapshot(root), 25) }); }, REC_SETTLE);
      } else if (!now && inside) {
        setTimeout(() => {
          if (!running || inside) return; // Zeiger schon wieder drinnen → kein Ruhezustand
          if (!baseline) { baseline = snapshot(root); baselineNote = t("recBaseLeft", secs(rel())); }
          else residual = diffSnap(baseline, snapshot(root), 15);
        }, REC_SETTLE);
      }
      inside = now;
    };
    const onOverRec = (e) => {
      if (isOwn(e.target) || e.target === lastHover) return;
      const prev = lastHover;
      lastHover = e.target;
      pushEvent(`${t("recPointer")} ${selOf(e.target)}`);
      // Wechsel innerhalb des Ziels (z. B. auf einen Button): eigener Diff
      // – erst wenn der Ruhezustand steht, und nicht dichter als ein Setzintervall nach dem letzten Diff
      if (prev && baseline && root.contains(prev) && root.contains(e.target) && e.target !== root && hovers.length < 4 && rel() - lastDiffAt > REC_SETTLE) {
        const at = rel(), sel = selOf(e.target);
        lastDiffAt = at;
        setTimeout(() => { if (running && inside && lastHover === e.target) hovers.push({ t: at, sel, lines: diffSnap(baseline, snapshot(root), 25) }); }, REC_SETTLE);
      }
    };
    const onClickRec = (e) => { if (!isOwn(e.target)) pushEvent(`${t("recClick")} ${selOf(e.target)}`); };
    const onKeyRec = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); running = false; return; }
      pushEvent(`${t("recKey")} ${e.key}`);
    };
    const onScrollRec = () => { if (rel() - lastScroll > 500) { lastScroll = rel(); pushEvent(t("recScroll")); } };
    const cap = { capture: true, passive: true };
    window.addEventListener("mousemove", onMoveRec, cap);
    window.addEventListener("mouseover", onOverRec, cap);
    window.addEventListener("click", onClickRec, cap);
    window.addEventListener("keydown", onKeyRec, { capture: true });
    window.addEventListener("scroll", onScrollRec, cap);
    window.addEventListener("wheel", onScrollRec, cap);
    const mo = new MutationObserver((recs) => {
      for (const m of recs) {
        if (isOwn(m.target)) continue;
        if (m.type === "childList") {
          for (const n of m.addedNodes) {
            if (n.nodeType !== 1 || isOwn(n)) continue;
            addedNodes.push(n);
            const key = `add:${descOf(n)}>${selOf(m.target)}`;
            const e = mutations.get(key) || { t: rel(), text: `${t("recAdded")} ${descOf(n)} → ${selOf(m.target)}`, n: 0 };
            e.n++; if (mutations.size < 80 || mutations.has(key)) mutations.set(key, e);
          }
          for (const n of m.removedNodes) {
            if (n.nodeType !== 1 || isOwn(n)) continue;
            const key = `rm:${descOf(n)}<${selOf(m.target)}`;
            const e = mutations.get(key) || { t: rel(), text: `${t("recRemoved")} ${descOf(n)} ← ${selOf(m.target)}`, n: 0 };
            e.n++; if (mutations.size < 80 || mutations.has(key)) mutations.set(key, e);
          }
        } else {
          const key = `attr:${selOf(m.target)}:${m.attributeName}`;
          const e = mutations.get(key) || { t: rel(), text: "", n: 0, old: m.oldValue };
          e.n++;
          e.text = `${t("recAttr")} ${m.attributeName} ${selOf(m.target)}: ${JSON.stringify(shortVal(String(e.old ?? "")))} → ${JSON.stringify(shortVal(String(m.target.getAttribute(m.attributeName) ?? "")))}`;
          if (mutations.size < 80 || mutations.has(key)) mutations.set(key, e);
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "style", "hidden", "open", "aria-expanded", "aria-hidden", "data-state"] });
    const animPoll = setInterval(() => {
      let list = [];
      try { list = document.getAnimations(); } catch {}
      for (const a of list) {
        if (seenAnim.has(a)) continue;
        seenAnim.add(a);
        const el = a.effect && a.effect.target;
        if (!el || isOwn(el) || anims.length >= 40) continue;
        let kind = "web-animation";
        if (typeof CSSTransition !== "undefined" && a instanceof CSSTransition) kind = "transition " + a.transitionProperty;
        else if (typeof CSSAnimation !== "undefined" && a instanceof CSSAnimation) kind = "animation " + a.animationName;
        let tm = {};
        try { tm = a.effect.getTiming(); } catch {}
        const key = `${selOf(el)}: ${kind} ${Math.round(tm.duration || 0)} ms ${tm.easing || ""}${tm.delay ? ` delay ${Math.round(tm.delay)} ms` : ""}`;
        const g = animGroups.get(key) || { times: [] };
        if (g.times.length < 12) g.times.push(rel());
        g.n = (g.n || 0) + 1;
        animGroups.set(key, g);
        anims.length = animGroups.size;
      }
    }, 100);
    let po = null;
    try {
      if (PerformanceObserver.supportedEntryTypes.includes("long-animation-frame")) {
        po = new PerformanceObserver((l) => l.getEntries().forEach((e) => {
          if (loaf.length < 10) loaf.push(`${secs(e.startTime - perf0)} ${Math.round(e.duration)} ms${e.scripts && e.scripts[0] ? " " + (e.scripts[0].sourceURL || e.scripts[0].invoker || "").replace(location.origin, "") : ""}`);
        }));
        po.observe({ type: "long-animation-frame", buffered: false });
      }
    } catch {}
    let prev = performance.now();
    const raf = () => {
      if (!running) return;
      const now = performance.now(), dt = now - prev;
      prev = now; frameCount++;
      if (dt > 33 && longFrames.length < 200) longFrames.push({ t: now - perf0, dt });
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    const own = () => Array.from(document.querySelectorAll("[data-llment-picker]"));
    // Bildfolge: alle REC_FRAME_MS ein Bild (Chrome erlaubt zwei je Sekunde)
    const frameLoop = (async () => {
      while (running && rel() < REC_MS) {
        const at0 = rel();
        const nodes = own();
        nodes.forEach((n) => (n.style.visibility = "hidden"));
        try {
          await settle();
          const at = rel(), p = pointer; // Zeitpunkt und Zeiger unmittelbar vor der Aufnahme
          const dataUrl = await captureTab();
          frames.push({ t: at, dataUrl, pointer: p });
        } catch (e) {
          console.warn("LLMent Picker: Bild nicht aufgenommen –", e && e.message);
        } finally {
          nodes.forEach((n) => (n.style.visibility = ""));
        }
        const wait = REC_FRAME_MS - (rel() - at0);
        if (wait > 0) await sleep(wait);
      }
    })();
    while (running && rel() < REC_MS) await sleep(50);
    running = false;
    await frameLoop;
    const duration = rel();
    clearInterval(tick); clearInterval(animPoll);
    mo.disconnect();
    if (po) po.disconnect();
    window.removeEventListener("mousemove", onMoveRec, cap);
    window.removeEventListener("mouseover", onOverRec, cap);
    window.removeEventListener("click", onClickRec, cap);
    window.removeEventListener("keydown", onKeyRec, { capture: true });
    window.removeEventListener("scroll", onScrollRec, cap);
    window.removeEventListener("wheel", onScrollRec, cap);
    chip.remove();
    await sleep(REC_SETTLE + 50); // ausstehende Diffs einsammeln

    // Protokoll
    const L = [location.href, selOf(root), t("recLine", secs(duration), frames.length)];
    const section = (title, lines, empty) => { L.push("", `== ${title} ==`); L.push(...(lines.length ? lines : [empty || t("fileNone")])); };
    section(t("recEvents"), events);
    section(t("recRules"), pseudoRules(root, 40));
    section(t("recDeclared"), declaredMotion(root));
    const hoverLines = [];
    hovers.sort((a, b) => a.t - b.t);
    for (const h of hovers) { hoverLines.push((h.sel ? t("recHoverOn", secs(h.t), h.sel) : t("recHoverAt", secs(h.t))) + (h.lines.length ? "" : " " + t("recNoChange"))); hoverLines.push(...h.lines.map((l) => "  " + l)); }
    section(t("recHover") + " · " + baselineNote, hoverLines, t("recHoverNone"));
    if (residual && residual.length) section(t("recAfterLeave"), residual);
    const endDiff = diffSnap(startSnap, snapshot(root), 15);
    if (endDiff.length) section(t("recEnd"), endDiff);
    const mut = Array.from(mutations.values()).sort((a, b) => a.t - b.t).slice(0, 60).map((e) => `${secs(e.t)}  ${e.text}${e.n > 1 ? ` (${e.n}×)` : ""}`);
    section(t("recDom"), mut);
    const animLines = Array.from(animGroups, ([key, g]) => `${key}  (${g.n}×: ${g.times.map((x) => (x / 1000).toFixed(2)).join(", ")}${g.n > g.times.length ? ", …" : ""} s)`);
    section(t("recAnims"), animLines);
    const longest = longFrames.reduce((m, f) => (f.dt > m.dt ? f : m), { dt: 0, t: 0 });
    const fpsLines = [t("recFpsLine", frameCount, secs(duration), longFrames.length, Math.round(longest.dt), secs(longest.t))];
    if (loaf.length) fpsLines.push(t("recLoaf", loaf.length, loaf.join("; ")));
    section(t("recFps"), fpsLines);
    const fl = frameLine();
    if (fl) L.push("", fl);

    // Kontaktbogen: Element + Rand, erweitert um neu erschienene Elemente und Zeigerwege
    let region = fixedRegion ? Object.assign({}, fixedRegion) : inflate(rootRect, REC_PAD);
    const union = (r) => { const rr = r.right != null ? r.right : r.left + r.width, rb = r.bottom != null ? r.bottom : r.top + r.height; const x1 = Math.max(region.left + region.width, rr), y1 = Math.max(region.top + region.height, rb); region = { left: Math.min(region.left, r.left), top: Math.min(region.top, r.top), width: 0, height: 0 }; region.width = x1 - region.left; region.height = y1 - region.top; };
    if (!fixedRegion) union(inflate(root.getBoundingClientRect(), REC_PAD)); // Endzustand (aufgeklappt?) mit ins Bild
    for (const n of addedNodes.slice(0, 50)) { if (n.isConnected) { const r = n.getBoundingClientRect(); if (r.width > 0 && r.height > 0 && r.width < innerWidth) union(r); } }
    // Zeigerwege nur in der Nähe des Elements – Ausflüge quer über die Seite blähen den Bogen sonst auf
    const near = inflate(rootRect, REC_PAD * 2);
    for (const p of pointers) if (p.x >= near.left && p.x <= near.left + near.width && p.y >= near.top && p.y <= near.top + near.height) union({ left: p.x - 10, top: p.y - 10, right: p.x + 10, bottom: p.y + 10 });
    const cl = { left: Math.max(0, region.left), top: Math.max(0, region.top) };
    region = { left: cl.left, top: cl.top, width: Math.min(innerWidth, region.left + region.width) - cl.left, height: Math.min(innerHeight, region.top + region.height) - cl.top };
    let sheet = null, sheetPath = null, sheetErr = null, imageOk = false;
    if (frames.length && region.width > 1 && region.height > 1) {
      try {
        const first = await loadImage(frames[0].dataUrl);
        const cv = await contactSheet(frames, region, first.naturalWidth / innerWidth);
        sheet = await new Promise((f) => cv.toBlob(f, "image/png"));
        L.splice(3, 0, t(toClip ? "recSheet" : "recSheetFile", cv.width, cv.height));
      } catch (e) {
        sheetErr = (e && e.message) || String(e);
        console.warn("LLMent Picker: Kontaktbogen fehlgeschlagen –", sheetErr);
      }
    }
    if (sheet && toFile) {
      try { sheetPath = await saveShot(sheet, fileBase(root) + "-rec"); L.splice(4, 0, t("lineShotFile") + sheetPath); } catch (e) { sheetErr = (e && e.message) || String(e); }
    }
    // Strg: HTML-Datei des Ziel-Containers dazu
    let htmlPath = null, htmlErr = null;
    if (opts && opts.html) {
      try { htmlPath = await saveHtml(root, selOf(root), fileBase(root)); L.splice(sheetPath ? 5 : sheet ? 4 : 3, 0, t("lineHtml") + htmlPath); }
      catch (e) { htmlErr = ((e && e.message) || String(e)).slice(0, 120); }
    }
    const recTag = (clip) => tagLine(["recording", ...(sheet ? ["sheet:" + [sheetPath && "file", clip && "clip"].filter(Boolean).join("+")] : []), ...(htmlPath ? ["html:file"] : []), ...(fl ? ["frame"] : [])]);
    let payload = [recTag(!!(sheet && toClip)), ...L].join("\n") + END;
    let ok = false;
    if (sheet && toClip && (await copyWithImage(payload, sheet))) ok = imageOk = true;
    else { payload = [recTag(false), ...L].join("\n") + END; ok = await copy(payload); }
    guardAlt(false);
    const parts = [ok ? t("toastRecorded") : t("toastCopyFailed")];
    if (sheet && toClip && !imageOk) parts.push(t("toastShotNotWritten", lastClipError.slice(0, 60)));
    if (toFile) parts.push(sheetPath ? t("toastShotSaved") : t("toastShotSaveFailed") + (sheetErr ? ": " + sheetErr.slice(0, 60) : ""));
    if (opts && opts.html) parts.push(htmlPath ? t("toastHtmlSaved") : t("toastHtmlFailed") + (htmlErr ? ": " + htmlErr : ""));
    const good = ok && !(sheet && toClip && !imageOk) && !(toFile && !sheetPath) && !(opts && opts.html && !htmlPath);
    toast(parts.join(" · "), good, good ? 1800 : 4000);
    window.__elementPickerLast = payload;
    window.__elementPickerLastShot = sheet ? { bytes: sheet.size, info: "sheet", written: imageOk, path: sheetPath } : null;
    window.__elementPickerLastShotBlob = sheet;
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
    const { id, onSelection, shot, html, record } = window[CTX];
    delete window[CTX];
    if (window[KEY]) window[KEY].cancel(true);
    if (record) {
      const rEl = contextTarget(id);
      if (rEl) {
        flashRect(rEl.getBoundingClientRect());
        recordInteraction(rEl).then(() => reportState(false));
        return "picked";
      }
    }
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
  const preset = Object.assign({ shot: false, html: false, record: false }, window.__elementPickerPreset || {});
  delete window.__elementPickerPreset;

  // Ist Text markiert, ist das Ziel schon klar: Element + Markierung kopieren,
  // kein Picker-Modus. (Für den Picker-Modus vorher die Markierung aufheben.)
  if (!contextFallback && !preset.record) {
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
  const ICON_REC = () => svgIcon([["circle", { cx: "12", cy: "12", r: "9" }], ["circle", { cx: "12", cy: "12", r: "3.5", fill: "currentColor" }]]);
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
  const LIT = "#0a84ff", DIM = "rgba(70,80,95,.85)";
  let showHints = true; // Tastenhinweise dauerhaft, abschaltbar in den Einstellungen
  const codeChip = chip(), camChip = chip(), lassoChip = chip(), recChip = chip();
  hud.append(codeChip, camChip, recChip, lassoChip); // Screenshot und Aufnahme nebeneinander (sie toggeln gegeneinander), Lasso außen
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const CTRL_LABEL = isMac ? t("hintHtmlMac") : t("hintHtml");
  // Texte nur, wenn das Element breit genug für die ganze Reihe ist; sonst
  // nur die Symbole (die vier sind eindeutig genug). Umschalten kostet ein
  // Neubefüllen, deshalb nur bei Wechsel.
  // Scharf geschaltet (Chip leuchtet dauerhaft): R bzw. Alt/Strg kurz antippen –
  // gehalten beim Klick wirken die Tasten weiterhin. Nochmal antippen schaltet ab.
  let armRecord = !!preset.record, armShot = false, armHtml = false;
  let hintMode = null, fullWidth = null;
  function setHintMode(withText) {
    if (hintMode === withText) return;
    hintMode = withText;
    fillChip(codeChip, ICON_CODE(), withText ? CTRL_LABEL : "");
    fillChip(camChip, ICON_CAM(), withText ? t("hintShot") : "");
    fillChip(lassoChip, ICON_LASSO(), withText ? t("hintLasso") : "");
    fillChip(recChip, ICON_REC(), withText ? t("hintRecord") : "");
    recChip.style.background = armRecord ? LIT : DIM;
  }
  function applyHints() {
    hintMode = null;
    fullWidth = null;
    setHintMode(showHints);
  }
  applyHints();
  try {
    api.storage.sync.get({ hideHints: false }).then((v) => {
      showHints = !v.hideHints;
      applyHints();
      if (current) placeHud(current.getBoundingClientRect());
    });
  } catch {}
  let mods = { alt: false, ctrl: false, lasso: false, rec: false };
  function setMods(alt, ctrl, force) {
    const lasso = !!(drag && drag.active), rec = armRecord;
    alt = (alt || preset.shot || armShot || lasso) && !rec; // Lasso kopiert immer mit Screenshot; die Aufnahme ersetzt ihn
    ctrl = ctrl || preset.html || armHtml;
    if (!force && mods.alt === alt && mods.ctrl === ctrl && mods.lasso === lasso && mods.rec === rec) return;
    mods = { alt, ctrl, lasso, rec };
    camChip.style.background = alt ? LIT : DIM;
    codeChip.style.background = ctrl ? LIT : DIM;
    lassoChip.style.background = lasso ? LIT : DIM;
    recChip.style.background = rec ? LIT : DIM;
  }
  function placeHud(r) {
    hud.style.display = "inline-flex";
    if (showHints) {
      if (fullWidth == null) { setHintMode(true); fullWidth = hud.getBoundingClientRect().width; }
      setHintMode(r.width >= fullWidth + 8);
    } else setHintMode(false);
    const w = Math.max(hud.getBoundingClientRect().width, hud.scrollWidth) || 60;
    // Passen Label und Chips nicht nebeneinander über das Element, wandern die
    // Chips unter das Element (das Label bleibt oben)
    const labelW = label.style.display !== "none" ? label.getBoundingClientRect().width : 0;
    const collide = labelW && labelW + w + 8 > r.width;
    const above = r.top > 24 && !collide;
    hud.style.left = Math.max(0, Math.min(innerWidth - w - 4, r.right - w)) + "px";
    hud.style.top = (above ? r.top - 22 : Math.min(innerHeight - 22, r.bottom + 2)) + "px";
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
    tap = null;
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
    const withHtml = e.ctrlKey || e.metaKey || preset.html || armHtml;
    cleanup();
    // Das auf das Loslassen folgende click-Ereignis gehört nicht der Seite
    const once = (ev) => { swallow(ev); window.removeEventListener("click", once, opts); };
    window.addEventListener("click", once, opts);
    setTimeout(() => window.removeEventListener("click", once, opts), 400);
    flashRect(r);
    if (armRecord) { recordInteraction(bestContainer(r).el, r, { html: withHtml }).then(() => reportState(false)); return; }
    copyLasso(r, d.anchor, { html: withHtml });
  }
  // Bereich benachbarter Geschwister: Shift halten friert das umrahmte Element als
  // Anker ein; Shift+Klick auf ein anderes Geschwister oder Shift+↑/↓ setzt den
  // Fokus, gewählt ist alles dazwischen (Anker/Fokus wie in Editoren). Klick ohne
  // Shift löst aus, Esc bricht ab. Screenshot ist wie beim Lasso immer dabei.
  let range = null; // { anchor, focus }
  const unionRect = (els) => {
    let l = Infinity, tp = Infinity, r = -Infinity, b = -Infinity;
    for (const e of els) { const x = e.getBoundingClientRect(); l = Math.min(l, x.left); tp = Math.min(tp, x.top); r = Math.max(r, x.right); b = Math.max(b, x.bottom); }
    return { left: l, top: tp, width: r - l, height: b - tp, right: r, bottom: b };
  };
  const visibleSibling = (el, dir) => {
    for (let n = dir > 0 ? el.nextElementSibling : el.previousElementSibling; n; n = dir > 0 ? n.nextElementSibling : n.previousElementSibling) {
      if (isOwn(n) || /^(SCRIPT|STYLE|TEMPLATE|LINK|META)$/.test(n.tagName)) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return n;
    }
    return null;
  };
  function rangeList() {
    if (!range) return [];
    const kids = Array.from(range.anchor.parentElement.children);
    const a = kids.indexOf(range.anchor), f = kids.indexOf(range.focus);
    return kids.slice(Math.min(a, f), Math.max(a, f) + 1).filter((n) => !isOwn(n) && !/^(SCRIPT|STYLE|TEMPLATE|LINK|META)$/.test(n.tagName));
  }
  function highlightRange() {
    const list = rangeList();
    if (!list.length) return;
    const r = unionRect(list);
    box.style.display = "block";
    box.style.left = r.left + "px"; box.style.top = r.top + "px";
    box.style.width = r.width + "px"; box.style.height = r.height + "px";
    label.textContent = list.length + "\u00d7 " + range.anchor.tagName.toLowerCase() + "  " + t("hintRange");
    label.style.display = "block";
    const above = r.top > 24;
    label.style.left = Math.max(0, r.left) + "px";
    label.style.top = (above ? r.top - 22 : r.bottom + 2) + "px";
    setMods(false, false, true);
    placeHud(r);
  }
  // Geschwister des Ankers, das den Punkt enthält (Shift+Klick irgendwo in einer Section)
  const siblingAt = (x, y) => {
    let el = targetAt(x, y);
    while (el && el.parentElement !== range.anchor.parentElement) el = el.parentElement;
    return el;
  };
  function onMove(e) {
    if (range) return; // Bereich eingefroren, bis Klick oder Esc
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
    if (range) { highlightRange(); return; }
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
    const withShot = e.altKey || preset.shot || armShot, withHtml = e.ctrlKey || e.metaKey || preset.html || armHtml;
    if (e.shiftKey && (range || current)) {
      // Shift+Klick: Fokus auf das Geschwister unter dem Zeiger setzen
      if (!range) range = { anchor: current, focus: current };
      const sib = siblingAt(e.clientX, e.clientY);
      if (sib) { range.focus = sib; range.pending = false; highlightRange(); }
      return;
    }
    if (range) {
      const list = rangeList();
      const r = unionRect(list);
      range = null;
      cleanup();
      flashRect(r);
      if (armRecord) { await recordInteraction(list[0].parentElement, inflate(r, REC_PAD), { html: withHtml }); reportState(false); return; }
      await copyElement(list[0], undefined, { shot: true, html: withHtml, list });
      return;
    }
    const el = targetAt(e.clientX, e.clientY) || current;
    if (!el || el.tagName === "IFRAME" || el.tagName === "FRAME") return;
    cleanup();
    flash(el);
    if (armRecord) { await recordInteraction(el, null, { html: withHtml }); reportState(false); return; }
    await copyElement(el, undefined, { shot: withShot, html: withHtml });
  }

  // Antippen (< 400 ms, ohne Klick oder andere Taste dazwischen) schaltet um;
  // längeres Halten ist immer „an" und ändert den scharfen Zustand nicht.
  const TAP_MS = 400;
  let tap = null, tapAt = 0;
  function onKey(e) {
    if (e.key === "Alt" || e.key === "Control" || e.key === "Meta") { if (!e.repeat) { tap = e.key; tapAt = performance.now(); } }
    else tap = null;
    if (e.key === "Escape") {
      swallow(e);
      cleanup();
      toast(t("toastCancelled"), false);
      return;
    }
    if (e.key === "Alt") e.preventDefault(); // Firefox: Menüleiste nicht aufrufen
    if (e.key === "Alt" || e.key === "Control" || e.key === "Meta") setMods(e.altKey, e.ctrlKey || e.metaKey);
    // Shift: Anker einfrieren; Shift+↑/↓: Fokus auf das vorherige/nächste Geschwister
    if (e.key === "Shift" && !e.repeat && !range && current) { range = { anchor: current, focus: current, pending: true }; highlightRange(); }
    if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && (range || current)) {
      swallow(e);
      if (!range) range = { anchor: current, focus: current };
      const next = visibleSibling(range.focus, e.key === "ArrowDown" ? 1 : -1);
      if (next) { range.focus = next; range.pending = false; highlightRange(); }
      return;
    }
    // R: Interaktion am Element unter dem Zeiger aufnehmen
    // R schaltet die Aufnahme scharf (Chip leuchtet); der Klick bzw. das Loslassen des Lassos startet sie
    if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.altKey && !e.metaKey && !e.repeat) {
      swallow(e);
      armRecord = !armRecord;
      if (armRecord) armShot = false; // Aufnahme und Einzelscreenshot schließen sich aus
      setMods(e.altKey, e.ctrlKey || e.metaKey, true);
    }
  }
  function onKeyUp(e) {
    if (e.key === "Alt") e.preventDefault(); // Firefox: Menüleiste nicht aufrufen
    // Shift losgelassen, ohne dass ein Bereich entstand → Hover wieder frei
    if (e.key === "Shift" && range && range.pending && range.focus === range.anchor) { range = null; onScroll(); }
    // Antippen schaltet um; Loslassen nach längerem Halten ist immer „aus"
    if (e.key === "Alt" || e.key === "Control" || e.key === "Meta") {
      const short = tap === e.key && performance.now() - tapAt < TAP_MS;
      if (e.key === "Alt") { armShot = short ? !armShot : false; if (armShot) armRecord = false; }
      else armHtml = short ? !armHtml : false;
    }
    tap = null;
    setMods(e.altKey, e.ctrlKey || e.metaKey, true);
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
    range = null;
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
