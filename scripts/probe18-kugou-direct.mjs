// 复现 maicong/music 的酷狗链路：搜索拿 hash -> getSongInfo.php 取直链
const UA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1';

async function search(kw) {
  const u = 'http://songsearch.kugou.com/song_search_v2?keyword=' + encodeURIComponent(kw) + '&page=1&pagesize=10&platform=WebFilter&filter=2';
  const r = await fetch(u, { headers: { 'User-Agent': UA_IOS, Referer: 'http://www.kugou.com/' }, redirect: 'follow' });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    const list = (j.data && j.data.lists) || [];
    return list.slice(0, 5).map(x => ({
      name: (x.SongName || '').replace(/<[^>]+>/g, ''),
      singer: (x.SingerName || '').replace(/<[^>]+>/g, ''),
      hash: x.FileHash || '',
      sqhash: x.SQFileHash || '',
      hqhash: x.HQFileHash || '',
    }));
  } catch (e) { return { err: txt.slice(0, 120) }; }
}

async function getUrl(hash) {
  const u = 'http://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=' + hash;
  const r = await fetch(u, {
    headers: { 'User-Agent': UA_IOS, Referer: 'http://m.kugou.com/play/info/' + hash },
    redirect: 'follow',
  });
  const txt = await r.text();
  try {
    const j = JSON.parse(txt);
    return { code: r.status, url: j.url || '', errcode: j.errcode, title: j.songName, singer: j.singerName, raw: txt.slice(0, 200) };
  } catch (e) { return { code: r.status, url: '', raw: txt.slice(0, 200) }; }
}

async function probe(u) {
  try {
    const r = await fetch(u, { headers: { Range: 'bytes=0-1024', 'User-Agent': UA_IOS }, redirect: 'follow' });
    if (r.ok) await r.arrayBuffer().catch(() => null);
    return r.status + ' ' + r.headers.get('content-type');
  } catch (e) { return 'ERR ' + e.message; }
}

(async () => {
  for (const kw of ['晴天 周杰伦', '孤勇者', '光年之外']) {
    console.log('\n===== ' + kw + ' =====');
    const list = await search(kw);
    if (!Array.isArray(list)) { console.log('  搜索失败:', JSON.stringify(list)); continue; }
    console.log('  搜索 ' + list.length + ' 条');
    for (const it of list.slice(0, 2)) {
      const hash = it.sqhash && !/^0+$/.test(it.sqhash) ? it.sqhash : it.hash;
      const g = await getUrl(hash);
      console.log('  ' + it.name + ' - ' + it.singer);
      console.log('    hash=' + hash.slice(0, 16) + '... errcode=' + g.errcode + ' url=' + (g.url ? g.url.slice(0, 95) : '(空)'));
      if (g.url) console.log('    取流: ' + await probe(g.url));
      if (!g.url && g.raw) console.log('    raw: ' + g.raw.replace(/\s+/g, ' ').slice(0, 160));
    }
  }
})();
