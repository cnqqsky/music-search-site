// 探测 www.shagua.name（maicong/music v1.6.2 PHP 版）
// 低频执行：每平台间隔 1.5s，避免把对方源压垮（lmb520 已有前车之鉴）
const HOST = 'https://www.shagua.name';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function query(kw, type) {
  const body = new URLSearchParams({ input: kw, filter: 'name', type, page: '1' });
  try {
    const r = await fetch(HOST + '/', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        // 缺这个头会返回整张 HTML 首页而非 JSON
        'X-Requested-With': 'XMLHttpRequest',
        Referer: HOST + '/',
        Accept: 'application/json, text/javascript, */*; q=0.01',
      },
      body,
    });
    const t = await r.text();
    if (!t || t[0] !== '{') {
      return { ok: false, why: '非JSON响应(' + (t[0] || '空') + ')', n: 0 };
    }
    const j = JSON.parse(t);
    const arr = Array.isArray(j.data) ? j.data : [];
    return { ok: true, code: j.code, arr };
  } catch (e) {
    return { ok: false, why: 'ERR ' + e.message, n: 0 };
  }
}

const hostOf = (u) => {
  try {
    return new URL(u).host;
  } catch (e) {
    return '(无法解析)';
  }
};

const PLATFORMS = ['netease', 'qq', '1ting', 'kugou', 'kuwo'];
const KW = '稻香';

console.log('=== 平台可用性（关键词：' + KW + '）===');
const results = {};
for (const p of PLATFORMS) {
  const r = await query(KW, p);
  results[p] = r;
  if (!r.ok) {
    console.log(p.padEnd(9), '✗', r.why);
  } else {
    const withUrl = r.arr.filter((x) => x && x.url);
    console.log(
      p.padEnd(9),
      'code=' + String(r.code).padEnd(4),
      '结果' + String(r.arr.length).padStart(3),
      '有直链' + String(withUrl.length).padStart(3),
      withUrl.length ? '→ ' + hostOf(withUrl[0].url) : ''
    );
  }
  await sleep(1500);
}

console.log('');
console.log('=== 各平台直链域名汇总 ===');
const domains = new Map();
for (const [p, r] of Object.entries(results)) {
  if (!r.ok) continue;
  for (const x of r.arr.filter((y) => y && y.url)) {
    const h = hostOf(x.url);
    if (!domains.has(h)) domains.set(h, { plat: p, url: x.url, title: x.title });
  }
}
for (const [h, v] of domains) {
  console.log(h.padEnd(30), '[' + v.plat + ']', (v.title || '').slice(0, 20));
}

console.log('');
console.log('=== 取流验证（本机，中国 IP）===');
for (const [h, v] of domains) {
  try {
    const r = await fetch(v.url, { headers: { Range: 'bytes=0-2048', 'User-Agent': UA } });
    if (r.ok) await r.arrayBuffer().catch(() => null);
    console.log(h.padEnd(30), r.status, r.headers.get('content-type') || '-');
  } catch (e) {
    console.log(h.padEnd(30), 'ERR', e.message.slice(0, 40));
  }
  await sleep(800);
}
