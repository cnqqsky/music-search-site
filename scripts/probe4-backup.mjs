import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const probes = [
  ['咪咕 listen-url v2.4 (真实 songId)', async () => {
    const s = await fetch('https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent('晴天') + '&pageNo=1&pageSize=3&isCopyright=0&sortFlag=1&searchSwitch=%7B%22song%22%3A1%7D', { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
    const sj = await s.json();
    const list = sj.songResultData.result;
    const out = [];
    for (const it of list.slice(0, 3)) {
      const id = it.id;
      const u = 'https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?resourceType=2&songId=' + id + '&toneFlag=1&netType=01&scene=default';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/', 'aversionid': '8f1a3326', 'ua': 'Android_migu', 'channel': '0146832' } });
      const t = await r.text();
      const m = t.match(/"url"\s*:\s*"([^"]+)"/);
      out.push(`songId=${id} name=${it.name} HTTP=${r.status} url=${m ? m[1].slice(0, 100) : t.slice(0, 120)}`);
    }
    return out.join('\n');
  }],

  ['咪咕 listen-url v2.4 纯 approachStandard / HQ', async () => {
    const u = 'https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?resourceType=2&songId=3790007&toneFlag=PQ&netType=01&scene=default&lowerQualityContentId=600902000006889366';
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/', 'aversionid': '8f1a3326', 'ua': 'Android_migu' } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 300)}`;
  }],

  ['三方 Meting api.i-meto.com', async () => {
    const r = await fetch('https://api.i-meto.com/meting/api?server=netease&type=song&id=25906124', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 250)}`;
  }],

  ['三方 netease-cloud-music-api 公共实例 (NeteaseCloudMusicApi vercel)', async () => {
    const r = await fetch('https://netease-cloud-music-api-virid.vercel.app/song/url/v1?id=25906124&level=standard', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 250)}`;
  }],

  ['三方 music-api jsososo (RRJ homepage)', async () => {
    const r = await fetch('https://music-api-theta.vercel.app/search?keywords=' + encodeURIComponent('晴天') + '&limit=2', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 300)}`;
  }],

  ['三方 小歪 API (api.iowen.cn / api.isoyu)', async () => {
    const r = await fetch('https://api.lolimi.cn/API/qqdg/?msg=' + encodeURIComponent('晴天'), { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 300)}`;
  }],

  ['酷狗 mobile cdn - kmr / kugou app v2', async () => {
    const r = await fetch('https://mobiles.kugou.com/api/v3/search/song?format=json&keyword=' + encodeURIComponent('晴天') + '&page=1&pagesize=3&showtype=1', { headers: { 'User-Agent': UA } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 300)}`;
  }],
];

(async () => {
  const lines = [];
  for (const [name, fn] of probes) {
    let out;
    try { out = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 15000))]); }
    catch (e) { out = 'ERR ' + e.message; }
    const line = '===== ' + name + ' =====\n' + out + '\n';
    lines.push(line);
    console.log(line);
  }
  fs.writeFileSync(new URL('./probe4-out.txt', import.meta.url), lines.join('\n'), 'utf8');
})();
