const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=8.9.70' };
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function main() {
  // 1. 网易是否存在周杰伦原版《晴天》
  log('===== 网易：是否存在周杰伦原版 =====');
  for (const id of [186016, 186001, 386538]) {
    const r = await fetch(`https://music.163.com/api/song/detail?ids=%5B${id}%5D`, { headers: H });
    const j = await r.json();
    const s = j.songs && j.songs[0];
    log(`  id=${id} -> ${s ? s.name + ' / ' + s.artists.map(a => a.name).join('/') + ' / album=' + s.album.name + ' fee=' + s.fee : '不存在'}`);
  }

  // 2. 网易 artist top / search suggestion：用 idol 搜索看看
  log('\n===== 网易 /api/search/get/web 搜 "晴天" 前10 =====');
  const r2 = await fetch('https://music.163.com/api/search/get/web?s=%E6%99%B4%E5%A4%A9&type=1&offset=0&limit=10', { headers: H });
  const j2 = await r2.json();
  ((j2.result && j2.result.songs) || []).forEach((x, i) => log(`  [${i}] ${x.name} — ${x.artists.map(a => a.name).join('/')}`));

  // 3. QQ vkey 变体
  log('\n===== QQ vkey 取链变体 =====');
  const sv = await fetch('https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=%E6%99%B4%E5%A4%A9&format=json&p=1&n=3', { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } });
  const sj = await sv.json();
  const item = sj.data.song.list[0];
  const mid = item.songmid;
  log(`  target=${item.songname} / ${item.singer.map(s => s.name).join('/')} mid=${mid}`);

  const variants = {
    'A 全默认 uin=0 loginflag=1 platform=20': { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
    'B loginflag=0': { guid: '3651437205', songmid: [mid], songtype: [0], uin: '0', loginflag: 0, platform: '20' },
    'C filename+platform在传统host': { guid: '3651437205', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' },
  };
  for (const [name, param] of Object.entries(variants)) {
    const data = JSON.stringify({ req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param }, comm: { uin: '0', format: 'json', ct: 24, cv: 0, platform: 'yqq' } });
    for (const host of ['https://u.y.qq.com/cgi-bin/musicu.fcg', 'https://c.y.qq.com/qzone/fcg-bin/fcg_music_express_mobile3.fcg']) {
      try {
        const u = host.includes('musicu') ? `${host}?data=${encodeURIComponent(data)}` : `${host}?g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&cid=205361747&uin=0&songmid=${mid}&filename=C400${mid}.m4a&guid=${param.guid}`;
        const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: 'https://y.qq.com/' } });
        const t = await r.text();
        const m = t.match(/"purl"\s*:\s*"([^"]{0,80})"/);
        log(`  ${name} @ ${new URL(host).host} -> ${r.status} purl=${m ? (m[1] || '(空)') : 'N/A'} ${t.slice(0, 120)}`);
      } catch (e) { log(`  ${name} @ ${host} -> ERR ${e.message}`); }
    }
  }
}

await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe6-out.txt', import.meta.url), out.join('\n'), 'utf8');
