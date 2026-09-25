// 用 CDP 打开参考站点，模拟搜索行为，拦截API请求
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const PORT = 9341;
const SITE = 'https://music.lmb520.cn/';
const KW = '晴天';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TMP + '/cdp-search-' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(300);
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await r.json();
    const page = list.find(t => t.type === 'page');
    if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
  } catch (e) {}
}
if (!wsUrl) { console.log('!! 无法连接 CDP'); chrome.kill(); process.exit(1); }

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let msgId = 0;
const pending = new Map();
const requests = [];

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method === 'Network.requestWillBeSent') {
    requests.push({
      url: m.params.request.url,
      method: m.params.request.method,
      postData: m.params.request.postData,
      timestamp: m.params.timestamp,
    });
  }
};

const send = (method, params) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params: params || {} }));
});

await send('Network.enable');
await send('Page.enable');
await send('Page.navigate', { url: SITE });

// 等待页面加载
for (let i = 0; i < 30; i++) {
  await sleep(500);
  try {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState' });
    if (r.result && r.result.value === 'complete') break;
  } catch (e) {}
}

console.log('页面已加载，开始搜索...');

// 执行搜索
const EXPR = `
  (async () => {
    const results = [];
    try {
      // 找搜索框
      const input = document.querySelector('input[name="keyword"], input[type="text"], #keyword, input.search');
      if (!input) return '未找到搜索框';
      input.value = ${JSON.stringify(KW)};
      // 触发搜索
      const btn = document.querySelector('button[type="submit"], .search-btn, input[type="submit"]');
      if (btn) btn.click();
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      return '搜索已触发';
    } catch (e) {
      return '错误: ' + e.message;
    }
  })()
`;

const searchResult = await send('Runtime.evaluate', { expression: EXPR, awaitPromise: true });
console.log('搜索执行结果:', searchResult.result?.value);

// 等待网络请求
await sleep(3000);

console.log('\n=== 拦截到的网络请求 ===');
const apiReqs = requests.filter(r =>
  !r.url.includes('.css') &&
  !r.url.includes('.js') &&
  !r.url.includes('.png') &&
  !r.url.includes('.ico') &&
  !r.url.includes('favicon') &&
  !r.url.includes('cdn.')
);

for (const r of apiReqs) {
  console.log(`\n[${r.method}] ${r.url}`);
  if (r.postData) console.log(`  POST data: ${r.postData.slice(0, 200)}`);
}

if (apiReqs.length === 0) {
  console.log('(无API请求拦截到)');
}

// 也打印所有请求看是否有遗漏
console.log('\n=== 所有请求总数:', requests.length, '===');
requests.forEach(r => console.log(r.url));

ws.close();
chrome.kill();
process.exit(0);
