// Firefox headless über WebDriver BiDi: temporäre Erweiterung laden, Video-Klicktest.
// Aufruf: node ff-video.mjs <ext-dir> <url>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [ext, url, MODE] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "ff-prof-"));
const ff = spawn("C:/Program Files/Mozilla Firefox/firefox.exe", ["--headless", "--remote-debugging-port=9411", "--profile", profile, "--no-remote", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pend = new Map();
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const out = {};
try {
  for (let k = 0; k < 60; k++) { try { ws = new WebSocket("ws://127.0.0.1:9411/session"); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); break; } catch { ws = null; await sleep(500); } }
  if (!ws) throw new Error("Firefox antwortet nicht");
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  await send("session.new", { capabilities: { alwaysMatch: { "moz:firefoxOptions": {}, webSocketUrl: true, unhandledPromptBehavior: "ignore" } } });
  out.install = await send("webExtension.install", { extensionData: { type: "path", path: ext } });
  const tree = await send("browsingContext.getTree", {});
  const ctx = tree.result.contexts[0].context;
  await send("browsingContext.setViewport", { context: ctx, viewport: { width: 1100, height: 700 } });
  await send("browsingContext.navigate", { context: ctx, url, wait: "complete" });
  await sleep(1500);
  const ev = async (expr) => { const r = await send("script.evaluate", { expression: expr, target: { context: ctx }, awaitPromise: true, resultOwnership: "none" }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r).slice(0, 300); };
  const click = async (x, y) => send("input.performActions", { context: ctx, actions: [{ type: "pointer", id: "m", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }] }] });
  const move = async (x, y) => send("input.performActions", { context: ctx, actions: [{ type: "pointer", id: "m", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }] }] });
  const evIn = async (c, expr) => { const r = await send("script.evaluate", { expression: expr, target: { context: c }, awaitPromise: true, resultOwnership: "none" }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r).slice(0, 300); };
  const boxes = (c) => (c ? evIn(c, "JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.display==='block'&&n.textContent).map(n=>n.textContent.slice(0,70)))") : ev("JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.display==='block'&&n.textContent).map(n=>n.textContent.slice(0,70)))"));
  await ev("window.postMessage({__llmentTestStart:1},'*'); 1"); await sleep(2500);
  const fc = ((await send("browsingContext.getTree", {})).result.contexts[0].children || [])[0];
  const w = JSON.parse(await ev("JSON.stringify(document.querySelector('#wrap').getBoundingClientRect())"));
  // von oben auf den Container-Rand (3px Innenabstand) – oben sieht man den Container
  await move(w.left + 100, w.top - 15); await sleep(100); await move(w.left + 100, w.top + 1); await sleep(300);
  out.topBefore = String(await boxes());
  if (MODE === "perm" && fc) {
    const q = JSON.parse(await evIn(fc.context, "JSON.stringify((r=>({x:r.left+40,y:r.top+r.height/2}))(document.querySelector('#ru').getBoundingClientRect()))"));
    await send("input.performActions", { context: fc.context, actions: [{ type: "pointer", id: "m2", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(q.x), y: Math.round(q.y) }] }] }); await sleep(500);
    out.topAfter = String(await boxes());
    out.frameAfter = String(await boxes(fc.context));
  } else {
    // ohne Freigabe: in den Frame hinein (Schild fängt ab), dann O
    for (let y = w.top + 1; y <= w.top + 60; y += 6) { await move(w.left + 100, y); await sleep(20); }
    await sleep(200);
    out.topOverFrame = String(await boxes());
    await send("input.performActions", { context: ctx, actions: [{ type: "key", id: "k", actions: [{ type: "keyDown", value: "o" }, { type: "keyUp", value: "o" }] }] }); await sleep(1500);
    const tree = (await send("browsingContext.getTree", {})).result.contexts;
    out.tabs = tree.map((c) => c.url);
    out.pickerGone = String(await ev("!document.querySelector('[data-llment-picker]')"));
  }
  console.log(JSON.stringify(out));
  await send("session.end", {});
} catch (e) { console.log(JSON.stringify({ error: String(e), out })); }
finally { try { ws && ws.close(); } catch {} ff.kill(); }
