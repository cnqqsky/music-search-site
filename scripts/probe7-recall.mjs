const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const H = { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=8.9.70' };
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function main() {
  // 1. 扩大召回：limit=100 看周杰伦在第几
  log('===== cloudsearch limit=100 的位置 =====');
  const r = await fetch('https://music.163.com/api/cloudsearch/pc?s=%E6%99%B4%E5%A4%A9&type=1&offset=0&limit=100&total=true', { headers: H });
  const j = await r.json();
  const list = j.result.songs || [];
  log(`  返回 ${list.length} 条，total=${j.result.songCount}`);
  const i = list.findIndex(x => (x.ar || []).some(a => a.name === '周杰伦'));
  log(`  周杰伦首次出现位置: ${i === -1 ? '前100条内不存在' : '#' + i + ' ' + list[i].name}`);

  // 2. 用 search type=100(歌手) 找周杰伦 id，再取热门歌曲
  log('\n===== 歌手搜索 + 热门歌曲路线 =====');
  const rs = await fetch('https://music.163.com/api/cloudsearch/pc?s=%E5%91%A8%E6%9D%B0%E4%BC%A6&type=100&offset=0&limit=5&total=true', { headers: H });
  const js = await rs.json();
  const artists = (js.result && js.result.artists) || [];
  arLoop: {
    if (!artists.length) { log('  无歌手结果'); break arLoop; }
    const head = artists[0];
    log(`  歌手: ${head.name} id=${head.id}`);
    const rt = await fetch(`https://music.163.com/api/artist/top/song?id=${head.id}`, { headers: H });
    const jt = await rt.json();
    const songs = jt.songs || [];
    log(`  热门歌曲 ${songs.length} 首`);
    const hit = songs.find(x => x.name.replace(/[（(].*?[)）]/g, '').trim() === '晴天');
    log(`  热门歌里包含《晴天》: ${hit ? hit.name + ' id=' + hit.id : '否'}`);
    songs.slice(0, 8).forEach(x => log(`    - ${x.name}`));
  }

  // 3. 直接 album 搜索确认
  log('\n===== album=叶惠美 曲目（type=10） =====');
  const ra = await fetch('https://music.163.com/api/cloudsearch/pc?s=' + encodeURIComponent('晴天') + '&type=10&offset=0&limit=5', { headers: H });
  const ja = await ra.json();
  ((ja.result && ja.result.albums) || []).forEach(a => log(`  专辑: ${a.name} id=${a.id} by ${a.artist.name}`));

  // 4. 测试 /api/search/get?s (另一接口) 排序
  log('\n===== /api/search/get 排序对比 =====');
  const rg = await fetch('https://music.163.com/api/search/get?s=%E6%99%B4%E5%A4%A9&type=1&offset=0&limit=20&total=true', { headers: H });
  const jg = await rg.json().catch(() => ({}));
  const glist = (jg.result && jg.result.songs) || [];
  log(`  返回 ${glist.length} 条`);
  glist.slice(0, 8).forEach((x, i) => log(`   [${i}] ${x.name} — ${x.artists.map(a => a.name).join('/')}`));
}

await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe7-out.txt', import.meta.url), out.join('\n'), 'utf8');
