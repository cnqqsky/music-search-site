// 用 CDP 打开参考站点，拦截所有网络请求
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const CHROME = 'C:/Users/haila/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const PORT = 9340;

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--no-proxy-server',
  '--no-first-run', '--disable-extensions',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=' + process.env.TMP + '/cdp-apis-' + Date.now(),
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
      type: m.params.request.url.includes('api') || m.params.request.url.includes('search')
            || m.params.request.url.includes('fetch')
            ? 'API' : 'OTHER',
      url: m.params.request.url,
      method: m.params.request.method,
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

const sites = [
  'https://music.lmb520.cn/',
  'https://www.shagua.name/',
];

console.log('=== 拦截网络请求 ===\n');

for (const site of sites) {
  console.log(`\n--- ${site} ---`);
  requests.length = 0; // 清空

  await send('Page.navigate', { url: site });
  await sleep(3000); // 等页面加载

  // 过滤出API请求
  const apiReqs = requests.filter(r =>
    r.url.includes('api') || r.url.includes('search') ||
    r.url.includes('fetch') || r.url.includes('.php') ||
    r.url.includes('.json') || r.url.includes('music')
  );

  if (apiReqs.length === 0) {
    console.log('  (无明确API请求)');
  } else {
    for (const r of apiReqs) {
      console.log(`  [${r.type}] ${r.method} ${r.url}`);
    }
  }
}

console.log('\n=== 完整请求列表 ===');
const allUrls = [...new Set(requests.map(r => r.url))];
allUrls.forEach(u => console.log(u));

ws.close();
chrome.kill();
process.exit(0);
