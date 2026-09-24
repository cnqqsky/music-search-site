// 终轮：等待恢复窗口后再测，判定失败是「我压测导致」还是「源本身已挂」
const HOST = 'https://music.lmb520.cn';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(type, input = '晴天', extra = {}) {
  const body = new URLSearchParams({ input, filter: 'name', type, page: 1 });
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 30000);
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
    return { n: arr.length, code, arr };
  } finally { clearTimeout(to); }
}

(async () => {
  const types = ['netease', 'qq', 'kugou', 'kuwo', 'baidu', 'lizhi', 'migu', 'ximalaya', '5singyc', 'kg'];

  console.log('===== 静置 3 分钟后复测（判断能否自愈）=====');
  await sleep(180000);
  for (const t of types) {
    const r = await post(t);
    console.log(`  [${t.padEnd(9)}] code=${r.code} 条数=${r.n}`);
  }

  console.log('\n===== 换关键词再确认（排除关键词因素）=====');
  for (const t of ['qq', 'kugou', 'migu']) {
    for (const kw of ['孤勇者', '周杰伦', '花海']) {
      const r = await post(t, kw);
      console.log(`  [${t}/${kw}] code=${r.code} 条数=${r.n}`);
    }
  }

  console.log('\n===== 检查是否有备用镜像域名 =====');
  for (const h of ['https://music.lmb520.cn', 'https://www.lmb520.cn', 'https://music.lmb.blue']) {
    try {
      const r = await fetch(h + '/', { redirect: 'follow' });
      const t = await r.text();
      console.log(`  ${h} -> HTTP ${r.status} LEN ${t.length} 音乐搜索器=${/音乐搜索神器/.test(t)}`);
    } catch (e) { console.log(`  ${h} -> ERR ${e.message}`); }
  }
})();
