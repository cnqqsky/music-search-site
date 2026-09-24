// 二轮：限流阈值、稳定性、直链时效性、能否被跨域调用
const HOST = 'https://music.lmb520.cn';

async function post(form) {
  const body = new URLSearchParams(form);
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
      },
      body: body.toString(), signal: ctrl.signal, redirect: 'follow',
    });
    const txt = await r.text();
    return { status: r.status, txt, ms: Date.now() - t0 };
  } finally { clearTimeout(to); }
}
function parse(txt) {
  try { const j = JSON.parse(txt); return { code: j.code, arr: j.data || [] }; }
  catch (e) { return { code: -1, arr: [] }; }
}

(async () => {
  console.log('===== 1. 连续 20 次请求（无限流？）=====');
  let okc = 0, times = [];
  for (let i = 0; i < 20; i++) {
    const r = await post({ input: ['晴天', '孤勇者', '大海', '起风了'][i % 4], filter: 'name', type: 'kugou', page: 1 });
    const p = parse(r.txt);
    if (r.status === 200 && p.code === 200 && p.arr.length) okc++;
    times.push(r.ms);
    if (i % 5 === 4) console.log(`  第${i + 1}次: HTTP${r.status} code=${p.code} ${r.ms}ms`);
  }
  console.log(`  成功 ${okc}/20  平均耗时 ${Math.round(times.reduce((a, b) => a + b, 0) / times.length)}ms  最大 ${Math.max(...times)}ms`);

  console.log('\n===== 2. 并发 10 请求 =====');
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    post({ input: '测试' + i, filter: 'name', type: 'netease', page: 1 })));
  const goodR = rs.filter(r => r.status === 200).length;
  console.log(`  并发10：成功 ${goodR}/10，总耗时 ${Date.now() - t0}ms，各耗时 [${rs.map(r => r.ms).join(',')}]`);

  console.log('\n===== 3. 直链时效性 + 防盗链（隔 20s 再次取同一条）=====');
  const p1 = parse((await post({ input: '晴天 周杰伦', filter: 'name', type: 'kugou', page: 1 })).txt);
  const item = (p1.arr || []).find(x => x.url);
  if (item) {
    console.log('  初次: ' + item.title + ' - ' + item.author);
    console.log('  URL: ' + item.url.slice(0, 100));
    const probe = async (u) => {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 15000);
      try {
        const r = await fetch(u, { headers: { Range: 'bytes=0-2048', 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal, redirect: 'follow' });
        if (r.ok) await r.arrayBuffer().catch(() => null);
        return `${r.status} ${r.headers.get('content-type')}`;
      } catch (e) { return 'ERR ' + e.message; } finally { clearTimeout(to); }
    };
    console.log('  T+0   -> ' + await probe(item.url));
    await new Promise(r => setTimeout(r, 20000));
    console.log('  T+20s -> ' + await probe(item.url));
  }

  console.log('\n===== 4. 无 Referer / 无 XRW 是否被拒 =====');
  for (const [label, headers] of [
    ['裸请求(仅UA)', { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }],
    ['curl风格UA', { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'curl/8.0' }],
  ]) {
    const body = new URLSearchParams({ input: '晴天', filter: 'name', type: 'kugou', page: 1 });
    const r = await fetch(HOST + '/', { method: 'POST', headers, body: body.toString(), redirect: 'follow' });
    const p = parse(await r.text());
    console.log(`  ${label}: HTTP${r.status} code=${p.code} 条数=${p.arr.length}`);
  }

  console.log('\n===== 5. 返回字段结构 =====');
  const p2 = parse((await post({ input: '晴天', filter: 'name', type: 'kugou', page: 1 })).txt);
  if (p2.arr[0]) console.log('  ' + JSON.stringify(p2.arr[0], null, 2).split('\n').join('\n  '));
})();
