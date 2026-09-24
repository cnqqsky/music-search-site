// 探测酷我音乐音源：检索 + 取链，验证本地链路可行性
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const kwSearch = async (kw, n = 8) => {
  const hosts = [
    `https://search.kuwo.cn/r.s?all=${encodeURIComponent(kw)}&ft=music&itemset=web_2013&client=kt&pn=0&rn=${n}&rformat=json&encoding=utf8`,
    `http://search.kuwo.cn/r.s?all=${encodeURIComponent(kw)}&ft=music&itemset=web_2013&client=kt&pn=0&rn=${n}&rformat=json&encoding=utf8`,
  ];
  for (const u of hosts) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://kuwo.cn/' } });
      const t = await r.text();
      if (!t || (t[0] !== '{' && t[0] !== '[')) continue;
      const j = JSON.parse(t);
      const list = j.abslist || j.list || (j.data && j.data.list) || [];
      if (Array.isArray(list) && list.length) return list;
    } catch (e) { /* 换下一个 host */ }
  }
  return [];
};

// 官方 web 取链：需要 kuwo.cn 首页下发的 token，先尝试无 token 的旧接口
const kwUrl = async (rid) => {
  const tests = [
    ['antiserver', `https://antiserver.kuwo.cn/anti.s?type=convert_url&rid=${rid}&format=mp3&response=url`],
    ['antiserver-http', `http://antiserver.kuwo.cn/anti.s?type=convert_url&rid=${rid}&format=mp3&response=url`],
    ['api-v1', `https://kuwo.cn/api/v1/www/music/playUrl?mid=${rid}&type=convert_url2&httpsStatus=1&format=mp3`],
    ['url-api', `https://kuwo.cn/url?rid=${rid}&type=convert_url2&format=mp3`],
  ];
  for (const [name, u] of tests) {
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': UA, Referer: 'https://kuwo.cn/', 'Accept': '*/*' },
      });
      const t = (await r.text()).trim();
      if (/^https?:\/\//.test(t)) return { name, url: t };
      if (t[0] === '{') {
        const j = JSON.parse(t);
        if (j.url) return { name, url: j.url };
        if (j.data && j.data.url) return { name, url: j.data.url };
        return { name, url: '', raw: JSON.stringify(j).slice(0, 100) };
      }
      return { name, url: '', raw: t.slice(0, 80) };
    } catch (e) {
      return { name, url: '', raw: 'ERR ' + e.message };
    }
  }
  return { name: '-', url: '', raw: 'no-test' };
};

for (const kw of ['稻香', '大海', '起风了']) {
  const list = await kwSearch(kw);
  console.log(`\n[${kw}] 检索 ${list.length} 条`);
  if (!list.length) continue;
  let ok = 0;
  for (const x of list.slice(0, 4)) {
    const rid = x.MUSICRID ? String(x.MUSICRID).replace('MUSIC_', '') : x.rid || x.dcTargetid || '';
    if (!rid) continue;
    const r = await kwUrl(rid);
    const name = (x.NAME || x.name || '').slice(0, 16);
    if (r.url) {
      ok++;
      let st = '';
      try {
        const p = await fetch(r.url, { headers: { Range: 'bytes=0-2048', 'User-Agent': UA } });
        if (p.ok) await p.arrayBuffer().catch(() => null);
        st = ` 取流=${p.status} ${p.headers.get('content-type')}`;
      } catch (e) { st = ' 取流ERR'; }
      console.log(`   ${name.padEnd(18)} [${r.name}] ${r.url.slice(0, 55)}${st}`);
    } else {
      console.log(`   ${name.padEnd(18)} [${r.name}] 空 ${r.raw || ''}`);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`   → 取到直链 ${ok}/4`);
  await new Promise((r) => setTimeout(r, 1200));
}
