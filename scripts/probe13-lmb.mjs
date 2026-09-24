// 实测 music.lmb520.cn 后端接口的可用性与取流能力
const HOST = 'https://music.lmb520.cn';

const TYPES = ['netease', 'qq', 'kugou', 'kuwo', 'baidu', '1ting', 'migu', 'lizhi', 'qingting', 'ximalaya', '5singyc', '5singfc', 'kg'];
const QUERIES = ['晴天 周杰伦', '孤勇者', '起风了'];

async function post(form) {
  const body = new URLSearchParams(form);
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(HOST + '/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': HOST + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
      },
      body: body.toString(),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const ct = r.headers.get('content-type') || '';
    const txt = await r.text();
    return { status: r.status, ct, txt };
  } finally { clearTimeout(to); }
}

// 探测某个 URL 是否能真实取流
async function probe(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: { Range: 'bytes=0-2048', 'User-Agent': 'Mozilla/5.0' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    const ct = r.headers.get('content-type') || '';
    if (r.ok) await r.arrayBuffer().catch(() => null);
    return { code: r.status, ct, cr: r.headers.get('content-range') || '' };
  } catch (e) {
    return { code: 0, ct: 'ERR ' + e.message, cr: '' };
  } finally { clearTimeout(to); }
}

(async () => {
  console.log('===== 接口连通性与返回格式 =====');
  for (const t of TYPES) {
    const res = await post({ input: QUERIES[0], filter: 'name', type: t, page: 1 });
    let info = '';
    try {
      const j = JSON.parse(res.txt);
      if (typeof j === 'object' && j !== null) {
        const arr = j.data || j.result || j.list || [];
        const first = Array.isArray(arr) ? arr[0] : null;
        info = `code=${j.code ?? j.status ?? '?'} 条数=${Array.isArray(arr) ? arr.length : 0}` +
          (first ? ` 首条url=${String(first.url || '(空)').slice(0, 70)}` : '');
      } else info = '非对象 JSON';
    } catch (e) {
      info = '非JSON，前80字: ' + res.txt.slice(0, 80).replace(/\s+/g, ' ');
    }
    console.log(`[${t.padEnd(9)}] HTTP ${res.status} ${res.ct.split(';')[0]} | ${info}`);
  }

  console.log('\n===== 各平台返回直链的真实性 =====');
  for (const t of TYPES) {
    const res = await post({ input: QUERIES[1], filter: 'name', type: t, page: 1 });
    let arr = [];
    try {
      const j = JSON.parse(res.txt);
      arr = j.data || j.result || j.list || [];
    } catch (e) { }
    if (!arr.length) { console.log(`[${t.padEnd(9)}] 无结果`); continue; }
    const withUrl = arr.filter(x => x && x.url);
    let ok = 0, fail = 0;
    const samples = [];
    for (const it of withUrl.slice(0, 3)) {
      const p = await probe(it.url);
      const good = (p.code === 206 || p.code === 200) && /audio|mpeg|octet-stream|mp4|m4a/i.test(p.ct);
      good ? ok++ : fail++;
      if (samples.length < 1) samples.push(`${it.title || '?'} -> ${p.code} ${p.ct}`);
    }
    console.log(`[${t.padEnd(9)}] 结果${arr.length} 有链${withUrl.length} 可取流${ok} 失败${fail}  ${samples[0] || ''}`);
  }
})();
