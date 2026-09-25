// 生成修复效果截图：搜索后等外链探测跑完，把结果页截下来。
// 复用 skill 的 CDP 思路：Node 内置 WebSocket 直连 CDP，无需 playwright。

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME
  || 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SITE = process.env.SITE || 'https://ms-dj4.pages.dev';
const KW = process.env.KW || '偏偏喜欢你 陈百强';
const OUT = process.env.OUT || 'C:/Users/haila/AppData/Local/Temp/music-fix-preview.png';
const PORT = 9336;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  '--force-device-scale-factor=1.5',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/haila/AppData/Local/Temp/cdp-shot-' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) {
  await sleep(300);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    const page = list.find((t) => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
  } catch (e) {}
}
if (!wsUrl) { console.log('!! CDP 连接失败'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const send = (method, params) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params: params || {} }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1120, height: 1000, deviceScaleFactor: 1.5, mobile: false,
});
await send('Page.navigate', { url: SITE });

const EXPR = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  for (let i = 0; i < 50; i++) {
    const p = document.getElementById('platforms');
    if (p && p.children.length) break;
    await sleep(200);
  }
  document.getElementById('keyword').value = ${JSON.stringify(KW)};
  document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    if (document.querySelectorAll('.result-item > .result-card').length) break;
  }
  await sleep(12000);   // 等外链探测完成，截图里带「可播 / 无版权」标记
  // 滚到顶部，隐藏提示条以下的滚动位置
  window.scrollTo(0, 0);
  await sleep(400);
  return 'ready';
})()`;

await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
console.log('saved: ' + OUT);

ws.close();
chrome.kill();
process.exit(0);
