// music.iqwq.cn 低频率基线探测（避免压垮对方源）
const HOST = 'https://music.iqwq.cn';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(type, input, extra = {}) {
  const body = new URLSearchParams({ input, filter: 'name', type, page: 1 });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
  const t0 = Date.now();
  try {
    const r = await fetch(HOST + '/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        ...extra,
      },
      body: body.toString(), signal: ctrl.signal, redirect: 'follow',
    });
    const txt = await r.text();
    let arr = [], code = -1;
    try { const j = JSON.parse(txt); arr = j.data || []; code = j.code; } catch (e) { }
    return { code, arr, ms: Date.now() - t0, status: r.status, ct: r.headers.get('content-type') };
  } finally { clearTimeout(to); }
}

async function probeUrl(u) {
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-2048', 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal, redirect: 'follow' });
    if (r.ok) await r.arrayBuffer().catch(() => null);
    return { code: r.status, ct: r.headers.get('content-type') };
  } catch (e) { return { code: 0, ct: 'ERR ' + e.message }; } finally { clearTimeout(to); }
}

const TYPES = ['netease', 'qq', 'kugou', 'kuwo', 'baidu', '1ting', 'migu', 'lizhi', 'qingting', 'ximalaya', '5singyc', '5singfc', 'kg'];

(async () => {
  console.log('===== 1. 必需请求头判定 =====');
  for (const [label, extra] of [
    ['带 XRW', {}],
    ['不带 XRW', { 'X-Requested-With': '' }],
  ]) {
    const r = await post('netease', '晴天', extra);
    console.log(`  ${label}: HTTP${r.status} ${r.ct} code=${r.code} 条数=${r.arr.length}`);
    await sleep(1500);
  }

  console.log('\n===== 2. 全平台基线（每平台间隔 2s）=====');
  const baseline = {};
  for (const t of TYPES) {
    const r = await post(t, '晴天 周杰伦');
    baseline[t] = r;
    const withUrl = r.arr.filter(x => x && x.url);
    const host = withUrl[0] ? (() => { try { return new URL(withUrl[0].url).host; } catch (e) { return '-'; } })() : '-';
    console.log(`  [${t.padEnd(9)}] code=${String(r.code).padEnd(4)} 条数=${String(r.arr.length).padEnd(3)} 有链=${String(withUrl.length).padEnd(3)} ${r.ms}ms  ${host}`);
    await sleep(2000);
  }

  console.log('\n===== 3. 本地直链可取流验证（每平台取样 1 条）=====');
  for (const t of TYPES) {
    const r = baseline[t];
    const item = (r.arr || []).find(x => x && x.url);
    if (!item) { console.log(`  [${t.padEnd(9)}] 无可播样本`); continue; }
    const p = await probeUrl(item.url);
    console.log(`  [${t.padEnd(9)}] ${String(p.code).padEnd(4)} ${p.ct}  ${(item.title || '').slice(0, 20)}`);
    await sleep(1500);
  }

  console.log('\n===== 4. 重复 5 次同请求（判断波动）=====');
  for (let i = 0; i < 5; i++) {
    const r = await post('netease', '晴天 周杰伦');
    console.log(`  第${i + 1}次: code=${r.code} 条数=${r.arr.length} ${r.ms}ms`);
    await sleep(2000);
  }
})();
