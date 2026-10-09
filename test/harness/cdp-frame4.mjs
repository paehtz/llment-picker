// Kacheltest + Lasso am headless Chrome über CDP (Node >= 22).
// Aufruf: node cdp-stitch.mjs <ext-dir> <url> <out-dir>
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ext = process.argv[2];
const url = process.argv[3];
const outDir = process.argv[4];
const profile = mkdtempSync(join(tmpdir(), "ep-chrome-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--enable-unsafe-extension-debugging", "--remote-debugging-port=9333", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1100,700", url,
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 40; i++) {
    try { return await (await fetch("http://127.0.0.1:9333/json/list")).json(); } catch { await sleep(250); }
  }
  throw new Error("Chrome antwortet nicht");
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  const events = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === "Runtime.exceptionThrown" || d.method === "Runtime.consoleAPICalled" || d.method === "Log.entryAdded") events.push(d.method === "Runtime.consoleAPICalled" ? d.params.args.map((a) => a.value ?? a.description).join(" ") : JSON.stringify(d.params).slice(0, 400)); };
  const ready = new Promise((r) => (ws.onopen = r));
  return { events, ready, send: (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}
try {
  await sleep(1500); await targets();
  const ver = await (await fetch("http://127.0.0.1:9333/json/version")).json();
  const B = cdp(ver.webSocketDebuggerUrl); await B.ready;
  await B.send("Extensions.loadUnpacked", { path: ext }); await sleep(1500);
  const list = await targets();
  const sw = list.find((t) => t.type === "service_worker" && t.url.endsWith("/background.js"));
  const page = list.find((t) => t.type === "page" && t.url.startsWith("http"));
  const S = cdp(sw.webSocketDebuggerUrl); await S.ready; const P = cdp(page.webSocketDebuggerUrl); await P.ready;
  const ev = async (c, expr) => { const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + JSON.stringify(r.result.exceptionDetails.exception?.description) : r.result?.result?.value; };
  const tabId = String(await ev(S, "chrome.tabs.query({}).then(t=>t.map(x=>x.id).join(','))")).split(",").map(Number).sort((a, b) => b - a)[0];
  const T = `{tabId:${tabId},frameIds:[0]}`;
  const run = (preset) => ev(S, `chrome.scripting.executeScript({target:${T},func:(p)=>{window.__elementPickerPreset=p},args:[${JSON.stringify(preset || {})}]}).then(()=>chrome.scripting.executeScript({target:${T},files:['picker.js']})).then(r=>r[0].result).catch(e=>'ERR '+e.message)`);
  // Marker liegen in der isolierten Welt des Content-Scripts → über executeScript lesen
  const inIso = (fn) => ev(S, `chrome.scripting.executeScript({target:${T},func:${fn}}).then(r=>r[0].result).catch(e=>'ERR '+e.message)`);
  const waitDone = async () => { for (let i = 0; i < 80; i++) { const v = await inIso("()=>window.__elementPickerLast ? 1 : 0"); if (v) break; await sleep(250); } };
  const result = async (name) => {
    const v = await inIso("async()=>{const s=window.__elementPickerLastShot;const b=window.__elementPickerLastShotBlob;let d=null;if(b){d=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)});}const out={last:window.__elementPickerLast,shot:s,err:window.__elementPickerLastError,scroll:[scrollX,scrollY],data:d};window.__elementPickerLast=null;window.__elementPickerLastShot=null;window.__elementPickerLastShotBlob=null;return out}");
    if (v && v.data) { writeFileSync(join(outDir, name + ".png"), Buffer.from(v.data.split(",")[1], "base64")); delete v.data; v.png = name + ".png"; }
    return v;
  };
  const out = { log: [] };
  await P.send("Runtime.enable"); await P.send("Log.enable");
  const wsP = P;
  // Konsole/Exceptions mitschreiben
  const rawWs = null;
  const origOnMessage = null;
  const mouse = (type, x, y, extra = {}) => P.send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });

  await ev(S, "chrome.storage.sync.set({shotTarget:'file'}).then(()=>1)");
  const key = (type, k, code, mods = 0) => P.send("Input.dispatchKeyEvent", { type, key: k, code, modifiers: mods });
  // 1) Fokus in das fremde Formularfeld setzen (Klick ins iframe), dann Picker starten
  const fr = await ev(P, "(r=>({x:r.left+40,y:r.top+40}))(document.querySelector('#hs').getBoundingClientRect())");
  await mouse("mousePressed", fr.x, fr.y, { clickCount: 1 }); await mouse("mouseReleased", fr.x, fr.y, { clickCount: 1 }); await sleep(200);
  out.focusBefore = await ev(P, "document.activeElement && document.activeElement.tagName");
  await run(); await sleep(400);
  out.focusAfter = await ev(P, "document.activeElement && document.activeElement.tagName");
  // 2) Alt antippen: Kamera-Chip muss leuchten (Tasten erreichen den Hauptframe wieder)
  await key("keyDown", "Alt", "AltLeft", 1); await sleep(80); await key("keyUp", "Alt", "AltLeft", 0); await sleep(150);
  out.chips = await ev(P, "(h=>h?[...h.children].map(c=>c.style.background):null)([...document.querySelectorAll('[data-llment-picker]')].find(n=>n.children.length===4))");
  // 3) MIT Host-Berechtigung: Element IM fremden Frame wählen (Zeiger direkt aufs Eingabefeld)
  const allFrames = (fn) => ev(S, `chrome.scripting.executeScript({target:{tabId:${tabId},allFrames:true},func:${fn}}).then(r=>JSON.stringify(r.map(x=>x.result).filter(Boolean))).catch(e=>'ERR '+e.message)`);
  out.frames = await ev(S, `chrome.webNavigation ? 'wn' : 'nown'`);
  // wie background.inject(): zweiter Durchlauf in alle Frames
  await ev(S, `chrome.scripting.executeScript({target:{tabId:${tabId},allFrames:true},func:()=>{window.__llmentPass2=true}}).then(()=>chrome.scripting.executeScript({target:{tabId:${tabId},allFrames:true},files:['picker.js']})).then(r=>r.length).catch(e=>'ERR '+e.message)`);
  await sleep(500);
  const inner = await ev(P, "(r=>({x:r.left+60,y:r.top+70}))(document.querySelector('#hs').getBoundingClientRect())");
  await mouse("mouseMoved", inner.x, inner.y); await sleep(300);
  out.innerHover = await allFrames("()=>{const n=[...document.querySelectorAll('[data-llment-picker]')].map(x=>x.textContent).filter(x=>/input|label|form/i.test(x))[0];return n||null}");
  await mouse("mousePressed", inner.x, inner.y, { clickCount: 1 }); await mouse("mouseReleased", inner.x, inner.y, { clickCount: 1 }); await sleep(1200);
  out.innerPick = await allFrames("()=>window.__elementPickerLast||null");
  out.log = P.events; out.swlog = S.events;
  console.log(JSON.stringify(out, null, 1));
  S.close(); P.close();
} finally { chrome.kill(); }
