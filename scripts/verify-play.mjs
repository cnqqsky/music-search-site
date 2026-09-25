// 播放验证：在真实浏览器里点「可播」曲目的试听按钮，确认音频真的在走；
// 同时确认「无版权」按钮处于禁用态、点不动。

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME
  || 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SITE = process.env.SITE || 'https://ms-dj4.pages.dev';
const KW = process.env.KW || '偏偏喜欢你 陈百强';
const PORT = 9334;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server', '--no-first-run',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=C:/Users/haila/AppData/Local/Temp/cdp-play-' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
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

  let cards = [];
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    cards = [...document.querySelectorAll('.result-item > .result-card')];
    if (cards.length) break;
  }
  await sleep(11000);   // 等外链探测完成

  const audio = document.getElementById('audio');
  const pick = (label) => cards.find(c => (c.querySelector('.rc-status') || {}).textContent.trim() === label);
  const report = {};

  // 1) 点「可播」的曲目，看是否真的开始播放
  const okCard = pick('可播');
  if (okCard) {
    const name = okCard.querySelector('.rc-title').textContent.trim();
    okCard.querySelector('.rc-btn.play').click();
    await sleep(5000);
    report.playable = {
      name,
      paused: audio.paused,
      currentTime: Number(audio.currentTime.toFixed(2)),
      duration: Number((audio.duration || 0).toFixed(1)),
      errCode: audio.error ? audio.error.code : null,
      src: String(audio.src).slice(0, 70),
    };
    // 停掉，避免影响下一项
    try { audio.pause(); } catch (e) {}
  } else {
    report.playable = '未找到标记为「可播」的曲目';
  }

  // 2) 点「无版权」的曲目，确认按钮禁用、不会发起播放
  const deadCard = cards.find(c => (c.querySelector('.rc-status') || {}).textContent.trim() === '无版权');
  if (deadCard) {
    const btn = deadCard.querySelector('.rc-btn.play');
    report.dead = {
      name: deadCard.querySelector('.rc-title').textContent.trim(),
      disabled: btn.disabled,
      text: btn.textContent.trim(),
      cls: btn.className,
    };
    try { audio.pause(); } catch (e) {}
    const before = audio.src;
    btn.click();
    await sleep(1200);
    report.dead.audioUnchanged = String(audio.src) === String(before);
    report.dead.hint = (document.getElementById('hint') || {}).textContent.trim();
  } else {
    report.dead = '未找到标记为「无版权」的曲目';
  }

  // 3) 直链曲目（主色、无状态标）也应能播
  const directCard = cards.find(c => {
    const s = (c.querySelector('.rc-status') || {}).textContent.trim();
    const b = c.querySelector('.rc-btn.play');
    return s === '' && b && !b.disabled && !b.className.includes('retry');
  });
  if (directCard) {
    const name = directCard.querySelector('.rc-title').textContent.trim();
    directCard.querySelector('.rc-btn.play').click();
    await sleep(4500);
    report.direct = {
      name,
      paused: audio.paused,
      currentTime: Number(audio.currentTime.toFixed(2)),
      duration: Number((audio.duration || 0).toFixed(1)),
      errCode: audio.error ? audio.error.code : null,
    };
  } else {
    report.direct = '未找到直链曲目';
  }

  return JSON.stringify(report, null, 2);
})()`;

try {
  const r = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
  console.log(r.result && r.result.value);
} catch (e) {
  console.log('评估失败: ' + e.message);
}

ws.close();
chrome.kill();
process.exit(0);
