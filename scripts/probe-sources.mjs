// 探测各候选音乐源可用性（Node 22 自带 fetch）
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const KW = '周杰伦';

const probes = [
  {
    name: 'miss.qingchengkg.cn (当前上游)',
    run: async () => {
      for (const base of ['https://miss.qingchengkg.cn/', 'http://miss.qingchengkg.cn/']) {
        try {
          const r = await fetch(base, {
            method: 'POST',
            headers: {
              'User-Agent': UA,
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': base,
            },
            body: new URLSearchParams({ input: KW, filter: 'name', type: 'netease', page: '1' }),
          });
          const t = (await r.text()).slice(0, 300);
          return `${base} -> HTTP ${r.status} | ${t}`;
        } catch (e) { return `${base} -> ERR ${e.message}`; }
      }
      return 'all failed';
    },
  },
  {
    name: '网易老接口 /api/search/get/web',
    run: async () => {
      const u = 'https://music.163.com/api/search/get/web?s=' + encodeURIComponent(KW) + '&type=1&offset=0&limit=5';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '网易 v1 search (music.163.com/api/cloudsearch/pc)',
    run: async () => {
      const u = 'https://music.163.com/api/cloudsearch/pc?s=' + encodeURIComponent(KW) + '&type=1&offset=0&limit=5';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '网易 search 专辑 auth (interface)',
    run: async () => {
      const u = 'https://interface.music.163.com/api/search/get?s=' + encodeURIComponent(KW) + '&type=1&offset=0&limit=5&total=true';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Cookie': 'os=pc; appver=8.9.70', 'Referer': 'https://music.163.com/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '网易 song url (/api/song/enhance/player/url)',
    run: async () => {
      const u = 'https://music.163.com/api/song/enhance/player/url?id=25906124&ids=%5B25906124%5D&br=320000';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.163.com/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: 'QQ c.y.qq.com client_search_cp',
    run: async () => {
      const u = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent(KW) + '&format=json&p=1&n=5';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://y.qq.com/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '酷我 www.kuwo.cn searchMusicBykeyWord',
    run: async () => {
      const u = 'https://www.kuwo.cn/api/www/search/searchMusicBykeyWord?key=' + encodeURIComponent(KW) + '&pn=1&rn=5&httpsStatus=1';
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://www.kuwo.cn/', 'Cookie': 'kw_token=ABCDEF' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '咪咕 music.migu.cn search',
    run: async () => {
      const u = 'https://m.music.migu.cn/migu/remoting/scr_search_tag?rows=5&type=2&keyword=' + encodeURIComponent(KW);
      const r = await fetch(u, { headers: { 'User-Agent': UA, 'Referer': 'https://music.migu.cn/' } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '三方 vvhan music search',
    run: async () => {
      const u = 'https://api.vvhan.com/api/music/search?key=' + encodeURIComponent(KW);
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
  {
    name: '三方 uomg music info',
    run: async () => {
      const u = 'https://api.uomg.com/api/music/info?mid=' + encodeURIComponent(KW) + '&media=netease';
      const r = await fetch(u, { headers: { 'User-Agent': UA } });
      return `HTTP ${r.status} | ${(await r.text()).slice(0, 300)}`;
    },
  },
];

(async () => {
  const out = [];
  for (const p of probes) {
    let line;
    try { line = await Promise.race([p.run(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout 15s')), 15000))]); }
    catch (e) { line = 'ERR ' + e.message; }
    out.push('===== ' + p.name + ' =====\n' + line + '\n');
    console.log(out[out.length - 1]);
  }
  require('fs').writeFileSync(__dirname + '/probe-out.txt', out.join('\n'), 'utf8');
})();
