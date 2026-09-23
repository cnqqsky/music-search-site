// 线上验收：直接打生产站点的三个接口
const SITE = 'https://ms-dj4.pages.dev';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function check() {
  log(`站点: ${SITE}`);

  // 1. GET 搜索（便于快速判定）
  const g = await fetch(`${SITE}/api/search?input=${encodeURIComponent('晴天 周杰伦')}&filter=name&page=1`);
  log(`\n[GET /api/search] HTTP ${g.status} ct=${g.headers.get('content-type')}`);
  const gj = await g.json();
  if (gj.code === 200) {
    const ok = gj.data.filter((x) => x.url).length;
    log(`  返回 ${gj.data.length} 条，可取直链 ${ok} 条`);
    gj.data.slice(0, 4).forEach((x, i) => log(`   [${i}] ${x.title} - ${x.author} br=${x.br} https=${x.url ? x.url.startsWith('https://') : '-'}`));
  } else {
    log('  ' + JSON.stringify(gj).slice(0, 300));
  }

  // 2. POST（前端真实调用方式）
  const p = await fetch(`${SITE}/api/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ input: '起风了', filter: 'name', type: 'netease', page: '1' }),
  });
  const pj = await p.json();
  log(`\n[POST /api/search] HTTP ${p.status} code=${pj.code} 返回 ${pj.data ? pj.data.length : 0} 条，可取直链 ${pj.data ? pj.data.filter(x => x.url).length : 0} 条`);

  if (pj.data && pj.data.length) {
    const id = pj.data[0].songid;
    // 3. 歌词
    const l = await fetch(`${SITE}/api/lyric?id=${id}`);
    const lj = await l.json();
    log(`[GET /api/lyric]  HTTP ${l.status} code=${lj.code} 歌词长度=${lj.data && lj.data.lrc ? lj.data.lrc.length : 0}`);

    // 4. 补链
    const u = await fetch(`${SITE}/api/url?id=${id}`);
    const uj = await u.json();
    log(`[GET /api/url]    HTTP ${u.status} code=${uj.code} br=${uj.data && uj.data.br}`);

    // 5. 音频是否真的可取流
    const target = (uj.data && uj.data.url) || pj.data[0].url;
    if (target) {
      const r = await fetch(target, { headers: { Range: 'bytes=0-1023' } });
      log(`[音频取流]        HTTP ${r.status} ct=${r.headers.get('content-type')} -> ${r.status === 206 || r.status === 200 ? '可播放' : '不可用'}`);
    }
  }

  // 6. 首页可访问性
  const home = await fetch(SITE + '/');
  const html = await home.text();
  log(`\n[首页] HTTP ${home.status} 长度=${html.length} 含音源标识=${html.includes('当前音源')}`);
}

await check().catch(e => log('ERR ' + e.message));
const fs = await import('node:fs');
fs.writeFileSync(new URL('./verify-online-out.txt', import.meta.url), out.join('\n'), 'utf8');
