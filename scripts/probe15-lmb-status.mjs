// 判定：目标站是自身防护拦截，还是上游平台限流
const HOST = 'https://music.lmb520.cn';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(form, extra = {}) {
  const body = new URLSearchParams(form);
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
    return { status: r.status, ct: r.headers.get('content-type'), txt: await r.text() };
  } finally { clearTimeout(to); }
}

(async () => {
  console.log('===== 1. 当前各平台即时状态 =====');
  const types = ['netease', 'qq', 'kugou', 'kuwo', 'baidu', 'lizhi'];
  for (const t of types) {
    const r = await post({ input: '晴天', filter: 'name', type: t, page: 1 });
    const isJson = /json/.test(r.ct || '');
    let cnt = '?';
    try { cnt = (JSON.parse(r.txt).data || []).length; } catch (e) { }
    const raw = r.txt.slice(0, 100).replace(/\s+/g, ' ');
    console.log(`[${t.padEnd(8)}] ${r.status} ${isJson ? 'JSON 条数=' + cnt : '非JSON: ' + raw}`);
  }

  console.log('\n===== 2. 裸请求原始返回体 =====');
  const bare = await post({ input: '晴天', filter: 'name', type: 'kugou', page: 1 }, {
    'X-Requested-With': '',
  });
  console.log('  CT:', bare.ct, 'LEN:', bare.txt.length);
  console.log('  内容:', bare.txt.slice(0, 300).replace(/\s+/g, ' '));

  console.log('\n===== 3. GET 首页是否正常（站点存活）=====');
  const g = await fetch(HOST + '/', { redirect: 'follow' });
  const gt = await g.text();
  console.log(`  HTTP ${g.status} LEN ${gt.length} 含标题: ${/音乐搜索神器/.test(gt)}`);

  console.log('\n===== 4. 等待 60s 后重试 kugou（判断是否可逆限流）=====');
  await sleep(60000);
  for (let i = 1; i <= 3; i++) {
    const r = await post({ input: '晴天 周杰伦', filter: 'name', type: 'kugou', page: 1 });
    let cnt = '?'; try { cnt = (JSON.parse(r.txt).data || []).length; } catch (e) { }
    console.log(`  恢复第${i}次: ${r.status} 条数=${cnt}`);
    if (i < 3) await sleep(10000);
  }
})();
