// 本地端到端：在 Node 里加载 CF Pages Functions 模块做验证（模拟 Workers 运行时）
import { onRequestGet as searchGet } from '../functions/api/search.js';
import { onRequestGet as urlGet } from '../functions/api/url.js';

if (!globalThis.Response) {
  globalThis.Response = class {
    constructor(body, init) { this.body = body; this.status = init?.status || 200; this.init = init; }
    async json() { return JSON.parse(this.body); }
  };
}

const call = async (fn, qs) => {
  const ctx = { request: new Request('https://x.dev/api/x?' + qs), env: {}, params: {}, waitUntil() {} };
  const r = await fn(ctx);
  return await r.json();
};

const KWS = ['晴天 周杰伦', '孤勇者', '演员', '起风了', '稻香', '光年之外', '大海', '海阔天空'];

(async () => {
  console.log('===== 双音源搜索端到端 =====');
  let sumNe = 0, sumKg = 0, rows = [];
  for (const kw of KWS) {
    const j = await call(searchGet, 'input=' + encodeURIComponent(kw) + '&filter=name');
    if (j.code !== 200) { console.log(`  [${kw}] 请求失败 code=${j.code} ${j.error || ''}`); continue; }
    const d = j.data || [];
    const ne = d.filter(x => x.type === 'netease');
    const kg = d.filter(x => x.type === 'kugou');
    const okNe = ne.filter(x => x.url).length;
    const okKg = kg.filter(x => x.url).length;
    sumNe += okNe; sumKg += okKg;
    rows.push({ kw, ne: ne.length, okNe, kg: kg.length, okKg });
    console.log(`  [${kw.padEnd(11)}] 共${String(d.length).padStart(2)} | 网易 ${ne.length}条可播${okNe} | 酷狗 ${kg.length}条可播${okKg}`);
  }
  console.log(`\n  合计可播：网易 ${sumNe}，酷狗 ${sumKg}`);

  console.log('\n===== 酷狗直链真实可取流 =====');
  const j = await call(searchGet, 'input=' + encodeURIComponent('稻香') + '&filter=name');
  const kgItem = (j.data || []).find(x => x.type === 'kugou' && x.url);
  if (kgItem) {
    console.log('  ' + kgItem.title + ' - ' + kgItem.author + '  br=' + kgItem.br + ' pic=' + (kgItem.pic ? '有' : '无'));
    const r = await fetch(kgItem.url, { headers: { Range: 'bytes=0-2048', 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) await r.arrayBuffer().catch(() => null);
    console.log('  取流: ' + r.status + ' ' + r.headers.get('content-type'));
  } else {
    console.log('  本轮酷狗无结果');
  }

  console.log('\n===== 单曲补链 /api/url（酷狗 hash）=====');
  if (kgItem) {
    const u = await call(urlGet, 'id=' + kgItem.songid);
    if (u.code === 200) {
      console.log('  返回 url: ' + String(u.data.url).slice(0, 80));
      const r = await fetch(u.data.url, { headers: { Range: 'bytes=0-1024' } });
      if (r.ok) await r.arrayBuffer().catch(() => null);
      console.log('  取流: ' + r.status + ' ' + r.headers.get('content-type'));
    } else console.log('  失败: ' + u.error);
  }

  console.log('\n===== 异常输入 =====');
  for (const qs of ['input=&filter=name', 'input=abc&filter=id', 'input=https://music.163.com/#/song?id=186016&filter=url']) {
    const j = await call(searchGet, qs);
    console.log('  ' + qs.slice(0, 46) + ' -> code=' + j.code + ' 条数=' + ((j.data || []).length));
  }
})();
