// 冒烟：按前端真实调用方式验证完整链路
import fs from 'node:fs';
const search = await import('../functions/api/search.js');
const urlApi = await import('../functions/api/url.js');
const lyricApi = await import('../functions/api/lyric.js');
const out = [];
const log = (s) => { out.push(s); console.log(s); };

// 模拟前端 POST application/x-www-form-urlencoded
async function post(mod, path, fields) {
  const body = new URLSearchParams(fields).toString();
  const res = await mod.onRequestPost({
    request: new Request('https://example.com' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
  });
  return { status: res.status, body: await res.json() };
}
async function get(mod, path) {
  const res = await mod.onRequestGet({ request: new Request('https://example.com' + path) });
  return { status: res.status, body: await res.json() };
}

log('=== 1. 前端表单式 POST 搜索 ===');
const s = await post(search, '/api/search', { input: '起风了', filter: 'name', type: 'netease', page: '1' });
log(`HTTP ${s.status} code=${s.body.code} 返回 ${s.body.data.length} 条`);
const items = s.body.data;
const withUrl = items.filter(x => x.url);
log(`可取直链 ${withUrl.length}/${items.length}`);

log('\n=== 2. 协议与字段校验（混合内容 / 封面 / 详情链接） ===');
const bad = items.filter(x => x.url && !x.url.startsWith('https://'));
log(`直链非 https 的条数: ${bad.length}（应为 0）`);
const noPic = items.filter(x => !x.pic);
log(`缺封面: ${noPic.length} 条`);
const it = withUrl[0] || items[0];
log(`样本: ${it.title} / ${it.author}\n  br=${it.br} size=${it.size}\n  link=${it.link}\n  pic=${it.pic.slice(0, 70)}\n  url=${it.url.slice(0, 70)}`);

log('\n=== 3. 歌词接口 ===');
const l = await get(lyricApi, '/api/lyric?id=' + it.songid);
const lrc = l.body.data && l.body.data.lrc;
log(`HTTP ${l.status} code=${l.body.code} 长度=${lrc ? lrc.length : 0}`);
log(`首行: ${String(lrc).split('\n')[0]}`);
log(`LRC 时间轴有效: ${/\[\d{2}:\d{2}\.\d{2,3}\]/.test(lrc || '')}`);

log('\n=== 4. 单曲补链接口 ===');
const u = await get(urlApi, '/api/url?id=' + it.songid);
log(`HTTP ${u.status} code=${u.body.code} br=${u.body.data && u.body.data.br} https=${u.body.data && u.body.data.url.startsWith('https://')}`);

log('\n=== 5. 直链真实可播校验 (Range 请求) ===');
const target = (u.body.data && u.body.data.url) || it.url;
const r = await fetch(target, { headers: { Range: 'bytes=0-2047', 'User-Agent': 'Mozilla/5.0' } });
const ct = r.headers.get('content-type');
log(`HEAD/Range -> ${r.status} content-type=${ct} content-range=${r.headers.get('content-range') || '-'}`);
log(`判定: ${r.status === 206 || r.status === 200 ? '✅ 音频可取流' : '❌ 不可取流'}`);

log('\n=== 6. 异常输入 ===');
for (const [label, q] of [['空输入', { input: '' }], ['非法 ID', { input: 'abc', filter: 'id' }], ['非法 URL', { input: 'https://example.com', filter: 'url' }]]) {
  const e = await post(search, '/api/search', q);
  log(`  ${label}: HTTP ${e.status} ${JSON.stringify(e.body)}`);
}

fs.writeFileSync(new URL('./test-smoke-out.txt', import.meta.url), out.join('\n'), 'utf8');
