import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const NE_H = { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70' };
const ID = 25906124;

const probes = [
  ['网易 lyric 接口', async () => {
    const r = await fetch('https://music.163.com/api/song/lyric?os=pc&id=' + ID + '&lv=-1&kv=-1&tv=-1', { headers: NE_H });
    const j = await r.json();
    return `HTTP ${r.status} lrcLen=${j.lrc && j.lrc.lyric ? j.lrc.lyric.length : 0} head=${j.lrc && j.lrc.lyric ? JSON.stringify(j.lrc.lyric.slice(0, 60)) : 'none'}`;
  }],

  ['网易 search 结果含 picUrl (cloudsearch/pc)', async () => {
    const r = await fetch('https://music.163.com/api/cloudsearch/pc?s=' + encodeURIComponent('晴天') + '&type=1&offset=0&limit=3', { headers: NE_H });
    const j = await r.json();
    const s = j.result.songs[0];
    return `id=${s.id} name=${s.name} ar=${s.ar.map(a => a.name).join('/')} picUrl=${s.al.picUrl}`;
  }],

  ['网易 URL 各音质档 (v1)', async () => {
    const levels = ['standard', 'higher', 'exhigh', 'lossless'];
    const out = [];
    for (const lv of levels) {
      const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B' + ID + '%5D&level=' + lv + '&encodeType=mp3&csrf_token=', { headers: NE_H });
      const j = await r.json();
      const d = j.data && j.data[0] || {};
      out.push(`${lv}: code=${d.code} br=${d.br} size=${d.size} ok=${!!d.url}`);
    }
    return out.join('\n');
  }],

  ['网易 URL v1 不带 Cookie', async () => {
    const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B' + ID + '%5D&level=standard&encodeType=mp3&csrf_token=', { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } });
    const j = await r.json();
    const d = j.data && j.data[0] || {};
    return `code=${d.code} ok=${!!d.url}`;
  }],

  ['网易直链 HTTPS 升级 + HEAD 校验', async () => {
    const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B' + ID + '%5D&level=standard&encodeType=mp3&csrf_token=', { headers: NE_H });
    const j = await r.json();
    const raw = j.data[0].url;
    const https = String(raw).replace(/^http:/, 'https:');
    const h = await fetch(https, { method: 'GET', headers: { Range: 'bytes=0-1023', 'User-Agent': UA } });
    return `origin=${raw.slice(0, 60)}\nhttps=${https.slice(0, 60)}\nHEAD GETRange -> ${h.status} ct=${h.headers.get('content-type')} len=${h.headers.get('content-range') || h.headers.get('content-length')}`;
  }],

  ['网易 detail 批量id (song/detail)', async () => {
    const r = await fetch('https://music.163.com/api/song/detail?ids=%5B' + ID + '%2C447926067%5D', { headers: NE_H });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 250)}`;
  }],

  ['网易 url 批量 (多个 id 一次请求)', async () => {
    const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B25906124%2C447926067%5D&level=standard&encodeType=mp3&csrf_token=', { headers: NE_H });
    const j = await r.json();
    return j.data.map(d => `${d.id}: code=${d.code} br=${d.br}`).join(' | ');
  }],

  ['咪咕 search_all 修正 pageNo', async () => {
    const u = 'https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent('晴天') + '&pageNo=1&pageSize=3&isCopyright=0&sortFlag=1&searchSwitch=%7B%22song%22%3A1%7D';
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
    const t = await r.text();
    return `HTTP ${r.status} | ${t.slice(0, 350)}`;
  }],

  ['酷狗 getdata 变体 (https://wwwapi.kugou.com/play/getdata)', async () => {
    const s = await fetch('https://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent('晴天') + '&page=1&pagesize=1&platform=WebFilter', { headers: { 'User-Agent': UA, 'Referer': 'https://www.kugou.com/' } });
    const sj = await s.json();
    const h = sj.data.lists[0].FileHash;
    const r = await fetch('https://wwwapi.kugou.com/play/getdata?hash=' + h, { headers: { 'User-Agent': UA, 'Referer': 'https://www.kugou.com/', 'Accept': 'application/json' } });
    const t = await r.text();
    return `hash=${h} HTTP ${r.status} | ${t.slice(0, 300)}`;
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
  fs.writeFileSync(new URL('./probe3-out.txt', import.meta.url), lines.join('\n'), 'utf8');
})();
