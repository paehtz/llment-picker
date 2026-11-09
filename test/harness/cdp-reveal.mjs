// Ganze Seite über den Kontextmenü-Weg (page:true) im Chrome headless.
// Aufruf: node cdp-page.mjs <ext-dir> <url> <out-dir>
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [ext, url, outDir] = process.argv.slice(2);
const profile = mkdtempSync(join(tmpdir(), "ep-chrome-"));
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", "--enable-unsafe-extension-debugging", "--remote-debugging-port=9333", `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--window-size=1100,700", url,
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  for (let i = 0; i < 40; i++) { try { return await (await fetch("http://127.0.0.1:9333/json/list")).json(); } catch { await sleep(250); } }
  throw new Error("Chrome antwortet nicht");
}
function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
  const ready = new Promise((r) => (ws.onopen = r));
  return { ready, send: (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }), close: () => ws.close() };
}
try {
  await sleep(1500); await targets();
  const ver = await (await fetch("http://127.0.0.1:9333/json/version")).json();
  const B = cdp(ver.webSocketDebuggerUrl); await B.ready;
  await B.send("Extensions.loadUnpacked", { path: ext });
  let sw = null;
  for (let k = 0; !sw && k < 30; k++) { await sleep(300); sw = (await targets()).find((t) => t.type === "service_worker" && t.url.endsWith("/background.js")); }
  const page = (await targets()).find((t) => t.type === "page" && t.url.startsWith("http"));
  const S = cdp(sw.webSocketDebuggerUrl); await S.ready; const P = cdp(page.webSocketDebuggerUrl); await P.ready;
  const ev = async (c, expr) => { const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? "EXC " + JSON.stringify(r.result.exceptionDetails.exception?.description) : r.result?.result?.value; };
  const tabId = String(await ev(S, "chrome.tabs.query({}).then(t=>t.map(x=>x.id).join(','))")).split(",").map(Number).sort((a, b) => b - a)[0];
  const T = `{tabId:${tabId},frameIds:[0]}`;
  const inIso = (fn) => ev(S, `chrome.scripting.executeScript({target:${T},func:${fn}}).then(r=>r[0].result).catch(e=>'ERR '+e.message)`);
  await ev(S, "chrome.storage.sync.set({shotTarget:'file'}).then(()=>1)");
  await ev(P, "scrollTo(0, 0); 1"); // mitten in der Seite starten: Aufnahme muss trotzdem oben beginnen
  await ev(S, `chrome.scripting.executeScript({target:${T},func:(c)=>{window.__elementPickerContextTarget=c},args:[{id:-1,page:true,shot:true,html:true}]}).then(()=>chrome.scripting.executeScript({target:${T},files:['picker.js']})).then(r=>r[0].result)`);
  let v = null;
  for (let i = 0; i < 120 && !v; i++) { await sleep(500); v = await inIso("()=>window.__elementPickerLast||null"); }
  const shot = await inIso("async()=>{const b=window.__elementPickerLastShotBlob;if(!b)return null;return await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(b)})}");
  if (shot) writeFileSync(join(outDir, "page.png"), Buffer.from(shot.split(",")[1], "base64"));
  const after = await ev(P, "JSON.stringify({scrollY, headerPos:getComputedStyle(document.querySelector('header')).position, headerStyle:document.querySelector('header').getAttribute('style')})");
  console.log(JSON.stringify({ last: v, png: shot ? "page.png" : null, after }));
  S.close(); P.close();
} finally { chrome.kill(); }
