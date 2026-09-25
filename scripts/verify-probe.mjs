// 端到端验证：用真实 Chromium（CDP）打开站点，触发一次搜索，
// 等浏览器侧外链探测跑完后，导出每张卡片的按钮状态。
// 用于确认「无版权」按钮确实变灰禁用、「可播」确实标出、控制台无报错。

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = process.env.CHROME
  || 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const SITE = process.env.SITE || 'https://fc9e9daa.ms-dj4.pages.dev';
const KW = process.env.KW || '偏偏喜欢你 陈百强';
const PORT = 9333;

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--no-proxy-server',
  '--no-first-run',
  '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + (process.env.PROFILE_DIR
    || 'C:/Users/haila/AppData/Local/Temp/cdp-verify-' + Date.now()),
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
const events = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method) {
    events.push(m);
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
  // app.js 是 defer，必须等 load 完成、且其初始化（音源状态条渲染）结束后再操作
  if (document.readyState !== 'complete') {
    await new Promise(r => window.addEventListener('load', r, { once: true }));
  }
  for (let i = 0; i < 50; i++) {
    const p = document.getElementById('platforms');
    if (p && p.children.length > 0) break;
    await sleep(200);
  }
  await sleep(600);

  const kw = document.getElementById('keyword');
  kw.value = ${JSON.stringify(KW)};
  document.getElementById('searchForm').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));

  // 等搜索结果真正落地（骨架屏会被结果替换）
  let cards = [];
  for (let i = 0; i < 60; i++) {
    await sleep(400);
    cards = [...document.querySelectorAll('.result-item > .result-card')];
    if (cards.length) break;
  }
  await sleep(11000);   // 再给外链探测留足时间

  const rows = [...document.querySelectorAll('.result-item > .result-card')].map(c => {
    const btn = c.querySelector('.rc-btn.play');
    return {
      title: (c.querySelector('.rc-title') || {}).textContent.trim(),
      status: (c.querySelector('.rc-status') || {}).textContent.trim(),
      btn: btn ? btn.textContent.trim() : null,
      disabled: btn ? btn.disabled : null,
      cls: btn ? btn.className : null,
    };
  });
  return JSON.stringify({
    hint: (document.getElementById('hint') || {}).textContent.trim(),
    notice: (document.getElementById('resultsMsg') || {}).textContent.trim().slice(0, 240),
    count: rows.length,
    rows,
    probeCache: Object.keys(JSON.parse(localStorage.getItem('ms_outer_probe_v1') || '{}')).length,
  }, null, 2);
})()`;

let out;
try {
  const r = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true, returnByValue: true });
  out = r.result && r.result.value;
} catch (e) {
  out = '评估失败: ' + e.message;
}

console.log('===== 卡片状态 =====');
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
