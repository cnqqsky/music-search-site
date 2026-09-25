// 端到端验证「去酷狗」跳转链路：
// 1. 用真实 Chromium（CDP）打开 probe-tmp 站点
// 2. 搜索「偏偏喜欢你 陈百强」（已知无版权曲，应触发酷狗补位）
// 3. 等外链探测 + 酷狗 JSONP 补位跑完
// 4. 输出卡片状态（按钮文字、disabled）
// 5. 点击「去酷狗」按钮，验证 window.open 被调用且 URL 含酷狗播放页

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME
  || 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SITE = process.env.SITE || 'https://probe-tmp.ms-dj4.pages.dev';
const KW = process.env.KW || '偏偏喜欢你 陈百强';
const PORT = 9335;

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-proxy-server',
  '--no-first-run',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + (process.env.TMP || 'C:/Users/haila/AppData/Local/Temp') + '/cdp-link-' + Date.now(),
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
  } catch (e) { /* 等浏览器起来 */ }
}
if (!wsUrl) { console.log('!! 无法连接 CDP'); chrome.kill(); process.exit(1); }

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
await send('Log.enable');

const consoleErrors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    consoleErrors.push(m.params.entry.text);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails.text || ''));
  }
});

await send('Page.navigate', { url: SITE });

const EXPR = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 等页面完全加载（app.js 是 defer，必须等 load 完成）
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  // 等音源状态条渲染（app.js 初始化后才会出现 #platforms）
  for (let i = 0; i < 60; i++) {
    const p = document.getElementById('platforms');
    if (p && p.children.length > 0) break;
    await sleep(200);
  }
  await sleep(800);   // 让 app.js 初始化收尾

  // 拦截 window.open，捕获酷狗跳转 URL
  window.__opened = [];
  window.open = (u) => { window.__opened.push(u); return null; };

  const kw = document.getElementById('keyword');
  kw.value = ${JSON.stringify(KW)};
  document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

  // 等搜索结果落地
  let cards = [];
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    cards = [...document.querySelectorAll('.result-card')];
    if (cards.length) break;
  }

  // 等外链探测 + 酷狗 JSONP 补位（最多 30 秒）
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    const live = [...document.querySelectorAll('.result-card')].filter(c => {
      const btn = c.querySelector('.rc-btn.play');
      return btn && (btn.textContent === '去酷狗' || btn.textContent === '补位中' || btn.textContent === '付费' || btn.textContent === '无源');
    });
    if (live.length >= cards.length * 0.5) break;
  }

  const rows = [...document.querySelectorAll('.result-card')].map(c => {
    const btn = c.querySelector('.rc-btn.play');
    return {
      title: (c.querySelector('.rc-title') || {}).textContent.trim().slice(0, 50),
      status: (c.querySelector('.rc-status') || {}).textContent.trim(),
      btn: btn ? btn.textContent.trim() : null,
      disabled: btn ? btn.disabled : null,
      cls: btn ? btn.className : null,
    };
  });

  // 点击所有「去酷狗」按钮
  let clickedCount = 0;
  for (const c of document.querySelectorAll('.result-card')) {
    const b = c.querySelector('.rc-btn.play');
    if (b && b.textContent.trim() === '去酷狗' && !b.disabled) {
      b.click();
      clickedCount++;
    }
  }
  await sleep(500);

  let kg = null;
  try { kg = JSON.parse(localStorage.getItem('ms_kg_fill_v1') || '{}'); } catch (e) {}
  const kgKeys = kg ? Object.keys(kg).slice(0, 5) : [];

  return JSON.stringify({
    hint: (document.getElementById('hint') || {}).textContent.trim().slice(0, 120),
    notice: (document.getElementById('resultsMsg') || {}).textContent.trim().slice(0, 260),
    totalCards: rows.length,
    rows,
    clickedCount,
    openedUrls: window.__opened,
    kgFillCount: kgKeys.length,
    kgFillSample: kgKeys.map(k => kg[k]),
  }, null, 2);
})()`;

let out;
try {
  // 不传 contextId，直接用默认 context（与 verify-probe.mjs 保持一致）
  const r = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
  out = r.result && r.result.value;
} catch (e) {
  out = '评估失败: ' + e.message;
}

console.log('===== 验证结果 =====');
console.log(out);
if (consoleErrors.length) {
  console.log('\n===== 控制台错误 =====');
  console.log(consoleErrors.slice(0, 12).join('\n'));
} else {
  console.log('\n控制台无错误');
}

ws.close();
chrome.kill();
process.exit(0);
