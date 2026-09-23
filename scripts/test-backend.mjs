// 在本地模拟 Cloudflare Workers 运行时，直接加载 functions/api/*.js 做端到端测试
const search = await import('../functions/api/search.js');
const urlApi = await import('../functions/api/url.js');
const lyricApi = await import('../functions/api/lyric.js');

function makeReq(p) {
  return { request: new Request('https://example.com/api/search' + p) };
}

async function get(mod, path) {
  const res = await mod.onRequestGet({ request: new Request('https://example.com' + path) });
  return { status: res.status, body: await res.json() };
}

const cases = [
  ['关键字：晴天 周杰伦', '/api/search?input=' + encodeURIComponent('晴天 周杰伦') + '&filter=name&page=1'],
  ['关键字：孤勇者', '/api/search?input=' + encodeURIComponent('孤勇者') + '&filter=name&page=1'],
  ['关键字：赤伶', '/api/search?input=' + encodeURIComponent('赤伶') + '&filter=name&page=1'],
  ['英文：Hello Adele', '/api/search?input=' + encodeURIComponent('Hello Adele') + '&filter=name&page=1'],
  ['按 ID：25906124', '/api/search?input=25906124&filter=id&page=1'],
  ['按地址解析', '/api/search?input=' + encodeURIComponent('https://music.163.com/#/song?id=25906124') + '&filter=url&page=1'],
  ['空输入（应 400）', '/api/search?input=&filter=name&page=1'],
  ['第 2 页', '/api/search?input=' + encodeURIComponent('周杰伦') + '&filter=name&page=2'],
];

const out = [];
for (const [name, path] of cases) {
  const t0 = Date.now();
  const { status, body } = await get(search, path);
  const cost = Date.now() - t0;
  let line = `===== ${name} =====\nHTTP ${status} 耗时 ${cost}ms`;
  if (body.code === 200) {
    const d = body.data || [];
    const ok = d.filter((x) => x.url).length;
    line += `\n返回 ${d.length} 条，可取直链 ${ok} 条  diag=${JSON.stringify(body.diag)}`;
    d.slice(0, 4).forEach((x, i) => {
      line += `\n  [${i}] ${x.title} - ${x.author} | id=${x.songid} br=${x.br} url=${x.url ? x.url.slice(0, 60) + '…' : '(空)'} pic=${x.pic ? 'OK' : '(空)'}`;
    });
  } else {
    line += `\n${JSON.stringify(body)}`;
  }
  line += '\n';
  out.push(line);
  console.log(line);
}

// 单曲补链 / 歌词
const u1 = await get(urlApi, '/api/url?id=25906124');
out.push('===== /api/url?id=25906124 =====\n' + JSON.stringify(u1.body).slice(0, 300) + '\n');
console.log(out[out.length - 1]);

const l1 = await get(lyricApi, '/api/lyric?id=25906124');
const lrc = (l1.body.data && l1.body.data.lrc) || '';
out.push(`===== /api/lyric?id=25906124 =====\nHTTP ${l1.status} 长度=${lrc.length}\n${lrc.slice(0, 200)}\n`);
console.log(out[out.length - 1]);

const { writeFileSync } = await import('node:fs');
writeFileSync(new URL('./test-backend-out.txt', import.meta.url), out.join('\n'), 'utf8');
