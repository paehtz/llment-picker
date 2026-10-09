// Firefox headless über WebDriver BiDi: temporäre Erweiterung laden, Video-Klicktest.
// Aufruf: node ff-video.mjs <ext-dir> <url>
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [ext, url] = process.argv.slice(2);
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
  await ev("window.postMessage({__llmentTestStart:1},'*'); 1"); await sleep(2500);
  const t2 = await send("browsingContext.getTree", {});
  const kids = (t2.result.contexts[0].children || []);
  out.frames = kids.map((k) => k.url);
  const fc = kids.find((k) => k.url.includes("localhost:8766"));
  out.topStarted = await ev("!!document.querySelector('[data-llment-picker]')");
  out.frameStarted = fc ? await evIn(fc.context, "!!document.querySelector('[data-llment-picker]')") : "kein Frame";
  const p = JSON.parse(await ev("JSON.stringify((r=>({x:r.left+60,y:r.top+70}))(document.querySelector('#hs').getBoundingClientRect()))"));
  // Zeiger im Kontext des Frames (Koordinaten des Frame-Viewports)
  const q = fc ? JSON.parse(await evIn(fc.context, "JSON.stringify((r=>({x:r.left+40,y:r.top+r.height/2}))(document.querySelector('#ru').getBoundingClientRect()))")) : p;
  const fmove = (x, y) => send("input.performActions", { context: fc.context, actions: [{ type: "pointer", id: "m", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(x), y: Math.round(y) }] }] });
  await fmove(q.x - 3, q.y); await sleep(150); await fmove(q.x, q.y); await sleep(300);
  out.frameLabel = String(fc ? await evIn(fc.context, "JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].map(n=>n.tagName+':'+n.style.display+':'+n.textContent.slice(0,40)))") : null);
  out.topLabel = String(await ev("JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.display==='block').map(n=>n.textContent.slice(0,40)))"));
  out.frameHover = String(fc ? await evIn(fc.context, "(document.querySelector(':hover:not(html):not(body)')||{}).tagName||'none'") : null);
  await send("input.performActions", { context: fc.context, actions: [{ type: "pointer", id: "m", parameters: { pointerType: "mouse" }, actions: [{ type: "pointerMove", x: Math.round(q.x), y: Math.round(q.y) }, { type: "pointerDown", button: 0 }, { type: "pointerUp", button: 0 }] }] }); await sleep(1500);
  out.frameCopied = String(fc ? await evIn(fc.context, "document.documentElement.getAttribute('data-llment-test-last')") : null);
  out.topCopied = String(await ev("document.documentElement.getAttribute('data-llment-test-last')"));
  out.inputFocused = String(fc ? await evIn(fc.context, "document.activeElement && document.activeElement.tagName") : null);
  console.log(JSON.stringify(out));
  await send("session.end", {});
} catch (e) { console.log(JSON.stringify({ error: String(e), out })); }
finally { try { ws && ws.close(); } catch {} ff.kill(); }
