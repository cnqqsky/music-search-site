const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function main() {
  const sr = await fetch('https://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent('晴天 周杰伦') + '&page=1&pagesize=5&platform=WebFilter',
    { headers: { 'User-Agent': UA, Referer: 'https://www.kugou.com/' } });
  const sj = await sr.json();
  const l = sj.data.lists;
  log(`搜索 ${l.length} 条 total=${sj.data.total}`);
  l.forEach((x, i) => log(`  [${i}] ${x.SongName} / ${x.SingerName} hash=${x.FileHash} album_id=${x.AlbumID} sqhash=${x.SQFileHash || '-'}`));

  const it = l[0];
  log('\n===== 取链候选 =====');
  const c = [
    ['A wwwapi yy/index.php r=play/getdata (带 album_id)', `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&callback=&hash=${it.FileHash}&album_id=${it.AlbumID}&mid=${Date.now()}&platid=4&_=${Date.now()}`, { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }],
    ['B www.kugou.com yy', `https://www.kugou.com/yy/index.php?r=play/getdata&callback=&hash=${it.FileHash}&album_id=${it.AlbumID}&mid=${Date.now()}&platid=4&_=${Date.now()}`, { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }],
    ['C trackercdn cmd=23', `https://trackercdn.kugou.com/i/v2/?appid=1005&key=${it.FileHash}&cmd=23&pid=1&behavior=play`, { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }],
    ['D trackercdnbj', `http://trackercdnbj.kugou.com/i/?key=${it.FileHash}&cmd=4&pid=1&forceDown=0&vip=1`, { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }],
    ['E mobiles v6 info', `https://mobiles.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent('晴天')}&page=1&pagesize=1&showtype=1`, { 'User-Agent': UA }],
    ['F gateway openapi', `https://gateway.kugou.com/openapi/v2/getData?appid=1005&clientver=10056&clienttime=${Date.now()}&mid=0&key=0&data=${encodeURIComponent(JSON.stringify({ hash: it.FileHash, album_id: String(it.AlbumID), behavior: 'play', cmd: 23, pid: 1 }))}`, { 'User-Agent': UA, Referer: 'https://www.kugou.com/' }],
  ];
  for (const [label, u, h] of c) {
    try {
      const r = await fetch(u, { headers: h });
      const t = await r.text();
      const dm = t.match(/"(?:play_url|play back url|url)"\s*:\s*"([^"]+)"/) || t.match(/"play_url"\s*:\s*"([^"]+)"/);
      log(`  ${label}\n    HTTP ${r.status} ${dm ? '>>> ' + dm[1].slice(0, 120) : ''}\n    body=${t.slice(0, 220)}`);
    } catch (e) { log(`  ${label}\n    ERR ${e.message}`); }
  }
}
await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe10-out.txt', import.meta.url), out.join('\n'), 'utf8');
