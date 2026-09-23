import fs from 'node:fs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function getMiguSong() {
  const s = await fetch('https://pd.musicapp.migu.cn/MIGUM2.0/v1.0/content/search_all.do?text=' + encodeURIComponent('晴天') + '&pageNo=1&pageSize=5&isCopyright=0&sortFlag=1&searchSwitch=%7B%22song%22%3A1%7D', { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
  const sj = await s.json();
  return sj.songResultData.result;
}

const probes = [
  ['咪咕 search 字段全貌', async () => {
    const list = await getMiguSong();
    const it = list[0];
    return JSON.stringify(it, null, 1).slice(0, 1200);
  }],

  ['咪咕 MIGUM3.0 queryListenUrl/v2.0', async () => {
    const list = await getMiguSong();
    const it = list[0];
    const u = `https://app.pd.nf.migu.cn/MIGUM3.0/resource/queryListenUrl/v2.0?isf=0&isTryListen=0&resourceType=2&netType=01&toneFlag=PQ&scene=default&cid=${it.contentId}&sid=${it.id}&channel=0`;
    const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/126 Mobile', 'ua': 'Android_migu', 'aversionid': '8f1a3326', 'Referer': 'https://music.migu.cn/', 'channel': '0146832' } });
    return `cid=${it.contentId} sid=${it.id} HTTP=${r.status} | ${(await r.text()).slice(0, 400)}`;
  }],

  ['咪咕 listen-url/v2.6 toneFlag=PQ 带 header', async () => {
    const list = await getMiguSong();
    const it = list[0];
    for (const ver of ['/MIGUM3.0/strategy/listen-url/v2.6?', '/MIGUM2.0/strategy/listen-url/v2.4?']) {
      const u = 'https://app.pd.nf.migu.cn' + ver + `netType=01&resourceType=2&songId=${it.id}&toneFlag=PQ&scene=default&iscorrupt=0&channel=0&lowerQualityContentId=${it.contentId}`;
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36', 'ua': 'Android_migu', 'aversionid': '8f1a3326', 'Referer': 'https://music.migu.cn/', 'channel': '0146832' } });
      const t = await r.text();
      const m = t.match(/"(?:playUrl|url|href)"\s*:\s*"([^"]+)"/);
      if (m) return `VER=${ver.slice(0, 22)} OK url=${m[1].slice(0, 120)}\nfull=${t.slice(0, 300)}`;
      console.log(`  try ${ver} -> ${t.slice(0, 150)}`);
    }
    return 'all failed';
  }],

  ['咪咕 listen-url 无英文 ver suffix (v2.4 via m.music)', async () => {
    const list = await getMiguSong();
    const it = list[0];
    const u = `https://app.pd.nf.migu.cn/MIGUM2.0/v1.0/content/queryListenUrlBySid.do?sid=${it.id}&toneFlag=PQ&netType=01&resourceType=2`;
    const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
    return `HTTP=${r.status} | ${(await r.text()).slice(0, 300)}`;
  }],

  ['网易 歌剧apId 106314 [exclusive]', async () => {
    const H = { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70' };
    const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B25906124%5D&level=exhigh&encodeType=mp3&csrf_token=', { headers: H });
    const j = await r.json();
    const d = j.data[0];
    return `code=${d.code} br=${d.br} type=${d.type} ok=${!!d.url}`;
  }],

  ['网易 多个不同 id（含翻唱曲线）确认可用率', async () => {
    const H = { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70' };
    const ids = [25906124, 447926067, 33894312, 1900207939, 2652820720, 1418357889, 1867173960, 1829667071, 555225159, 1338701746];
    const r = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=' + encodeURIComponent(JSON.stringify(ids)) + '&level=exhigh&encodeType=mp3&csrf_token=', { headers: H });
    const j = await r.json();
    const ok = j.data.filter(d => d.url).length;
    return `总数=${j.data.length} 成功=${ok} 详情=` + j.data.map(d => `${d.id}:${d.code}`).join(',');
  }],

  ['网易 搜索 → 取链 端到端（10 首随机词）', async () => {
    const H = { 'User-Agent': UA, 'Referer': 'https://music.163.com/', 'Cookie': 'os=pc; appver=8.9.70' };
    const words = ['孤勇者', '赤伶', '起风了', '海阔天空', '青花瓷', '夜曲', '演员', '模特', '稻香', '一路向北'];
    const lines = [];
    let okCount = 0, total = 0;
    for (const w of words) {
      const s = await fetch('https://music.163.com/api/cloudsearch/pc?s=' + encodeURIComponent(w) + '&type=1&offset=0&limit=1', { headers: H });
      const sj = await s.json();
      const song = sj.result && sj.result.songs && sj.result.songs[0];
      if (!song) { lines.push(`${w}: 搜索无结果`); continue; }
      const u = await fetch('https://music.163.com/api/song/enhance/player/url/v1?ids=%5B' + song.id + '%5D&level=exhigh&encodeType=mp3&csrf_token=', { headers: H });
      const uj = await u.json();
      const d = uj.data && uj.data[0];
      total++;
      if (d && d.url) { okCount++; lines.push(`${w}: OK ${song.name}/${song.ar.map(a => a.name).join()} br=${d.br}`); }
      else lines.push(`${w}: FAIL code=${d && d.code}`);
    }
    lines.push(`\n>>> 端到端成功率 ${okCount}/${total}`);
    return lines.join('\n');
  }],
];

(async () => {
  const lines = [];
  for (const [name, fn] of probes) {
    let out;
    try { out = await Promise.race([fn(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 20000))]); }
    catch (e) { out = 'ERR ' + e.message; }
    const line = '===== ' + name + ' =====\n' + out + '\n';
    lines.push(line);
    console.log(line);
  }
  fs.writeFileSync(new URL('./probe5-out.txt', import.meta.url), lines.join('\n'), 'utf8');
})();
