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
  const lab = () => ev("JSON.stringify([...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.display==='block'&&n.textContent&&n.tagName!=='STYLE'&&!/Strg/.test(n.textContent)).map(n=>n.textContent.slice(0,60)+' @'+Math.round(n.getBoundingClientRect().top)))");
  await ev("window.postMessage({__llmentTestStart:1},'*'); 1"); await sleep(1500);
  const f = JSON.parse(await ev("JSON.stringify(document.querySelector('#hs').getBoundingClientRect())"));
  // wie ein Mensch: aus dem Kopfbereich durch den Container-Rand in den Frame
  for (let y = 30; y <= f.top + 200; y += 12) { await move(f.left + 200, y); await sleep(15); }
  await sleep(300);
  out.overFrame = String(await lab());
  // Bereich, wo der versteckte Frame läge (y 300..450): darf nicht blockiert sein
  await move(f.left + 200, 380); await sleep(250);
  out.overGhostArea = String(await lab());
  out.shields = String(await ev("[...document.querySelectorAll('[data-llment-picker]')].filter(n=>n.style.pointerEvents==='auto'&&n.style.display!=='none').length"));
  // nach Scrollen weiter erkannt?
  await ev("scrollTo(0,1200); 1"); await sleep(300);
  await move(f.left + 210, 300); await sleep(60); await move(f.left + 220, 320); await sleep(300);
  out.afterScroll = String(await lab());
  await click(f.left + 220, 320); await sleep(1500);
  out.copied = String(await ev("(document.documentElement.getAttribute('data-llment-test-last')||'').split(String.fromCharCode(10)).slice(0,3).join(' | ')"));
  out.frameFocus = String(await (async () => { const fc = ((await send("browsingContext.getTree", {})).result.contexts[0].children || [])[0]; if (!fc) return null; const r = await send("script.evaluate", { expression: "document.activeElement && document.activeElement.tagName", target: { context: fc.context }, awaitPromise: true }); return r.result && r.result.result && r.result.result.value; })());
  console.log(JSON.stringify(out));
  await send("session.end", {});
} catch (e) { console.log(JSON.stringify({ error: String(e), out })); }
finally { try { ws && ws.close(); } catch {} ff.kill(); }
