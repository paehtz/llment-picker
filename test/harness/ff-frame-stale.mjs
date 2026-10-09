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
  const boxes = () => ev("JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.display==='block'&&n.textContent).map(n=>n.textContent.slice(0,70)))");
  // Lauf 1: Frame gleicher Herkunft, Picker meldet ihn als erreichbar; dann Esc
  await ev("window.postMessage({__llmentTestStart:1},'*'); 1"); await sleep(2000);
  const ip = JSON.parse(await ev("JSON.stringify((r=>({x:r.left+20,y:r.top+8}))(document.querySelector('.intro').getBoundingClientRect()))"));
  await move(ip.x - 3, ip.y); await sleep(100); await click(ip.x, ip.y); await sleep(1500);
  await sleep(1500);
  out.run1Left = String(await ev("JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].map(n=>n.tagName+':'+n.style.display+':'+(n.textContent||'').slice(0,30)))"));
  out.run1Copied = String(await ev("(document.documentElement.getAttribute('data-llment-test-last')||'').split(String.fromCharCode(10))[0]"));
  // Frame auf fremde Herkunft umleiten (gleiches Fensterobjekt), Lauf 2 ohne Freigabe dafür
  await ev("document.querySelector('#hs').contentWindow.location.href='http://localhost:8766/frame-inner.html'; 1"); await sleep(1500);
  await ev("window.postMessage({__llmentTestStart:1},'*'); 1"); await sleep(2000);
  const w = JSON.parse(await ev("JSON.stringify(document.querySelector('#wrap').getBoundingClientRect())"));
  await move(w.left + 100, w.top - 15); await sleep(100);
  for (let y = w.top - 5; y <= w.top + 60; y += 4) { await move(w.left + 100, y); await sleep(20); }
  await sleep(300);
  out.run2Label = String(await boxes());
  console.log(JSON.stringify(out));
  await send("session.end", {});
} catch (e) { console.log(JSON.stringify({ error: String(e), out })); }
finally { try { ws && ws.close(); } catch {} ff.kill(); }
