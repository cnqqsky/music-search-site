const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function search(kw) {
  const u = 'https://c.musicapp.migu.cn/v1.0/content/search_all.do?text=' + encodeURIComponent(kw) +
    '&pageNo=1&pageSize=5&isCopyright=1&sortFlag=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%7D';
  const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/', channel: '0140210' } });
  return await r.json();
}

async function main() {
  const sj = await search('晴天 周杰伦');
  const list = sj.songResultData && sj.songResultData.result || [];
  log(`搜索返回 ${list.length} 条`);
  const it = list[0];
  const albumId = (it.albums && it.albums[0] && it.albums[0].id) || '';
  log(`target: ${it.name} / ${it.singers.map(s => s.name).join('/')}\n  copyrightId=${it.copyrightId} contentId=${it.contentId} songId=${it.id} albumId=${albumId}`);

  const base = 'https://c.musicapp.migu.cn/MIGUM3.0/strategy/listen-url/v2.3';
  const q = `copyrightId=${it.copyrightId}&contentId=${it.contentId}&resourceType=2&albumId=${albumId}&netType=01&toneFlag=PQ`;

  log('\n===== A. c.musicapp + channel:0140210 =====');
  for (const ch of ['0140210', '0146832', '10003581']) {
    try {
      const r = await fetch(base + '?' + q, { headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/', channel: ch } });
      const t = await r.text();
      const m = t.match(/"(?:url|playUrl)"\s*:\s*"([^"]+)"/);
      log(`  channel=${ch} -> ${r.status} ${m ? 'URL=' + m[1].slice(0, 130) : t.slice(0, 180)}`);
    } catch (e) { log(`  channel=${ch} -> ERR ${e.message}`); }
  }

  log('\n===== B. c.musicapp host 但 scenario v2.4 =====');
  const b2 = base.replace('v2.3', 'v2.4') + '?' + q;
  const r2 = await fetch(b2, { headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/', channel: '0140210' } });
  const t2 = await r2.text();
  log('  ' + t2.slice(0, 400));

  log('\n===== C. music.migu.cn getPlayInfo 带 Origin =====');
  const c1 = await fetch(`https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?copyrightId=${it.copyrightId}&type=2`, {
    headers: { 'User-Agent': UA, Origin: 'http://music.migu.cn', Referer: 'http://music.migu.cn/v3/music/player/play', Accept: 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest' },
  });
  const tc = await c1.text();
  log(`  HTTP ${c1.status} ct=${c1.headers.get('content-type')} | ${tc.slice(0, 300)}`);

  log('\n===== D. 不同 toneFlag =====');
  for (const tf of ['PQ', 'HQ', 'SQ', 'LQ', 'ZQ']) {
    const u = base + '?' + q.replace('toneFlag=PQ', `toneFlag=${tf}`);
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/', channel: '0140210' } });
    const t = await r.text();
    const m = t.match(/"(?:url|playUrl)"\s*:\s*"([^"]+)"/);
    log(`  ${tf} -> ${m ? 'URL=' + m[1].slice(0, 120) : t.slice(0, 130)}`);
  }
}

await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe9-out.txt', import.meta.url), out.join('\n'), 'utf8');
