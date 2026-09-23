const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function search(kw) {
  const u = 'https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent(kw) + '&pageNo=1&pageSize=5&isCopyright=0&sortFlag=1&searchSwitch=%7B%22song%22%3A1%7D';
  const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://music.migu.cn/' } });
  return await r.json();
}

async function tryurl(label, url, headers) {
  try {
    const r = await fetch(url, { headers });
    const t = await r.text();
    const m = t.match(/"(?:playUrl|url|playUrls?|listenUrl)"\s*:\s*"([^"]+)"/);
    log(`  ${label}\n    HTTP ${r.status} ${m ? 'MATCH -> ' + m[1].slice(0, 110) : 'body=' + t.slice(0, 200)}`);
    return m ? m[1] : null;
  } catch (e) { log(`  ${label}\n    ERR ${e.message}`); return null; }
}

async function main() {
  const sj = await search('晴天 周杰伦');
  const list = sj.songResultData.result;
  log('=====咪咕搜索 top5=====');
  list.forEach((x, i) => log(`  [${i}] ${x.name} / ${x.singers.map(s => s.name).join('/')} cid=${x.contentId} id=${x.id} cp=${x.copyrightId}`));

  const it = list[0];
  const HBasic = { 'User-Agent': UA, Referer: 'https://music.migu.cn/' };
  const HWeb = { 'User-Agent': UA, Referer: 'https://music.migu.cn/v3/music/player/play?q_songid=' + it.id, 'Accept': 'application/json' };

  log('\n=====取链方法候选=====');
  const tries = [
    ['A web getPlayInfo copyrightId', `https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?copyrightId=${it.copyrightId}&type=2`, HWeb],
    ['B web getPlayInfo contentId', `https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?copyrightId=${it.contentId}&type=2`, HWeb],
    ['C web getPlayInfo songId', `https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?copyrightId=${it.id}&type=2`, HWeb],
    ['D pd nf listen-url v2.4 PQ+scheme', `https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?netType=01&resourceType=2&songId=${it.id}&toneFlag=PQ&scene=default&userId=0&uiVersion=A_music_3.6.4`, { 'User-Agent': UA, Referer: 'https://music.migu.cn/', 'ua': 'Android_migu', 'aversionid': '8f1a3326', 'channel': '0146832', 'appVersion': '3.6.4' }],
    ['E v2.4 with copyrightId', `https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?netType=01&resourceType=2&songId=${it.id}&copyrightId=${it.copyrightId}&toneFlag=PQ&scene=default`, { 'User-Agent': UA, Referer: 'https://music.migu.cn/', 'ua': 'Android_migu', 'aversionid': '8f1a3326' }],
    ['F m.music.migu.cn v3 playInfo', `https://m.music.migu.cn/migu_music/v3/api/music/audioPlayer/getPlayInfo?copyrightId=${it.copyrightId}&type=2`, HBasic],
    ['G app.pd listen-url v2.2', `https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2?netType=01&resourceType=2&songId=${it.id}&toneFlag=PQ&scene=default`, { 'User-Agent': UA, Referer: 'https://music.migu.cn/', 'ua': 'Android_migu', 'aversionid': '8f1a3326' }],
    ['H app.pd listen-url v2.0', `https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.0?netType=01&resourceType=2&songId=${it.id}&toneFlag=PQ`, { 'User-Agent': UA, Referer: 'https://music.migu.cn/', 'ua': 'Android_migu', 'aversionid': '8f1a3326' }],
  ];

  for (const [label, url, headers] of tries) await tryurl(label, url, headers);
}

await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe8-out.txt', import.meta.url), out.join('\n'), 'utf8');
