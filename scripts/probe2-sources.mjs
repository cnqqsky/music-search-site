// 第二轮：验证各平台「获取播放直链」能力
import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const RT = { musical: UA, };

async function probe(name, fn) {
  let line;
  try {
    line = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 15000))]);
  } catch (e) { line = 'ERR ' + e.message; }
  console.log('===== ' + name + ' =====\n' + line + '\n');
}

const probes = [];

// ---- 网易 URL：多种取法对比 ----
probes.push(['网易 player/url 带 Cookie', async () => {
  const u = 'https://music.163.com/api/song/enhance/player/url?csrf_token=&ids=%5B25906124%5D&br=320000';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70; NMTID=00TestToken' } });
  const j = await r.json();
  const d = j.data && j.data[0];
  return `HTTP ${r.status} code=${d && d.code} url=${d && String(d.url).slice(0, 90)}`;
}]);

probes.push(['网易 player/url/v1 level=standard', async () => {
  const u = 'https://music.163.com/api/song/enhance/player/url/v1?ids=%5B25906124%5D&level=standard&encodeType=mp3&csrf_token=';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70' } });
  return `HTTP ${r.status} | ${(await r.text()).slice(0, 400)}`;
}]);

probes.push(['网易 weapi 免).match-all-case song/url (u6 windows)', async () => {
  const u = 'https://music.163.com/api/song/enhance/player/url?id=25906124&ids=%5B25906124%5D&br=128000';
  const r = await fetch(u, { headers: { 'User-Agent': RT.musical, 'Referer': 'https://music.163.com/' } });
  const j = await r.json();
  const d = j.data && j.data[0];
  return `HTTP ${r.status} code=${d && d.code} br=${d && d.br} url=${d && String(d.url).slice(0, 90)}`;
}]);

// ---- 酷狗 ----
probes.push(['酷狗 song_search_v2', async () => {
  const u = 'https://songsearch.kugou.com/song_search_v2?callback=&keyword=' + encodeURIComponent('周杰伦') + '&page=1&pagesize=5&platform=WebFilter';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://www.kugou.com/' } });
  const j = await r.json();
  const l = j.data && j.data.lists && j.data.lists[0];
  return `HTTP ${r.status} total=${j.data && j.data.total} first=${l && l.FileName} hash=${l && l.FileHash}`;
}]);

probes.push(['酷狗 play/getdata 取直链', async () => {
  const s = await fetch('https://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent('晴天') + '&page=1&pagesize=1&platform=WebFilter', { headers: { 'User-Agent': UA, 'Referer': 'https://www.kugou.com/' } });
  const sj = await s.json();
  const list = (sj.data && sj.data.lists) || [];
  if (!list.length) return 'no result';
  const h = list[0].FileHash;
  const u = 'https://wwwapi.kugou.com/yy/index.php?r=play/getdata&callback=&hash=' + h + '&album_id=0&mid=' + Date.now() + '&platid=4&_=' + Date.now();
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://www.kugou.com/' } });
  const t = await r.text();
  try {
    const j = JSON.parse(t);
    return `HTTP ${r.status} audio_name=${j.data && j.data.audio_name} play_url=${j.data && String(j.data.play_url).slice(0, 110)}`;
  } catch (e) { return `HTTP ${r.status} | ${t.slice(0, 250)}`; }
}]);

// ---- 酷我旧接口 ----
probes.push(['酷我 search.kuwo.cn r.s', async () => {
  const u = 'http://search.kuwo.cn/r.s?all=' + encodeURIComponent('周杰伦') + '&ft=music&client=kt&cluster=0&itemset=web_2013&rn=5&rformat=json&encoding=utf8&ver=mbox&plat=pc';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://www.kuwo.cn/' } });
  const t = await r.text();
  const m = t.match(/try\s*\{([\s\S]*)\}\s*catch/);
  const body = m ? m[1] : t;
  return `HTTP ${r.status} | ${body.slice(0, 300)}`;
}]);

// ---- 咪咕 ----
probes.push(['咪咕 pd.musicapp search_all', async () => {
  const u = 'https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent('周杰伦') + '&pageNo=0&pageSize=5&isCopyright=0&sortFlag=1&searchSwitch=%7B%22song%22%3A1%7D';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
  const t = await r.text();
  return `HTTP ${r.status} | ${t.slice(0, 400)}`;
}]);

probes.push(['咪咕 listen-url v2.4 (需先取 id)', async () => {
  const s = await fetch('https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent('晴天') + '&pageNo=0&pageSize=1&searchSwitch=%7B%22song%22%3A1%7D', { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
  const sj = await s.json();
  const item = sj.songResultData && sj.songResultData.result && sj.songResultData.result[0];
  if (!item) return `no song; keys=${Object.keys(sj)} raw=${JSON.stringify(sj).slice(0, 200)}`;
  const id = item.id || item.copyrightId;
  const u = 'https://app.pd.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.4?resourceType=2&songId=' + id + '&toneFlag=1&netType=01&scene=default';
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/', 'aversionid': '8f1a3326', 'ua': 'Android_migu' } });
  const t = await r.text();
  return `songId=${id} HTTP ${r.status} | ${t.slice(0, 400)}`;
}]);

// ---- QQ vkey ----
probes.push(['QQ musicu.fcg CgiGetVkey', async () => {
  const s = await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent('晴天') + '&format=json&p=1&n=1', { headers: { 'User-Agent': UA, 'Referer': 'https://y.qq.com/' } });
  const sj = await s.json();
  const item = sj.data && sj.data.song && sj.data.song.list && sj.data.song.list[0];
  if (!item) return 'no result';
  const mid = item.songmid;
  const data = JSON.stringify({ req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' } }, comm: { uin: '0', format: 'json', ct: 24, cv: 0 } });
  const u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(data);
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://y.qq.com/' } });
  const j = await r.json();
  const purl = j.req_0 && j.req_0.data && j.req_0.data.midurlinfo && j.req_0.data.midurlinfo[0] && j.req_0.data.midurlinfo[0].purl;
  return `mid=${mid} HTTP ${r.status} purl=${purl ? 'https://ws.stream.qqmusic.qq.com/' + purl : 'EMPTY'}`;
}]);

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
  fs.writeFileSync(new URL('./probe2-out.txt', import.meta.url), lines.join('\n'), 'utf8');
})();
