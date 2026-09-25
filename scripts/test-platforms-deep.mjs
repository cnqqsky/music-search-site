// 深度测试各平台搜索+播放链接接口
import https from 'node:https';

// 1. 完整测试 QQ 音乐搜索结果
console.log('=== QQ 音乐搜索 ===');
const qqSearchUrl = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qp=1&n=5&w=%E6%99%B4%E5%A4%A9&g_tk=5381&format=jsonp';
https.get(qqSearchUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://y.qq.com/' } }, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    // 解析JSONP
    const jsonMatch = data.match(/callback\((.+)\)/s);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[1]);
        const songs = result.data?.song?.list || [];
        console.log(`Found ${songs.length} songs`);
        for (const s of songs.slice(0, 3)) {
          console.log(`- ${s.songname} - ${s.singername} [${s.albumname}]`);
          console.log(`  MID: ${s.songmid}, SongId: ${s.songid}`);
          console.log(`  Play URL: https://y.qq.com/n/yqq/song/${s.songmid}.html`);
        }
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }
  });
}).on('error', e => console.log('ERROR:', e.message));

// 2. 测试咪咕搜索（跟踪重定向）
console.log('\n=== 咪咕搜索 ===');
https.get('https://m.music.migu.cn/migu/search.jsp?keyword=%E6%99%B4%E5%A4%A9&type=2', {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Follow': 'redirect' }
}, res => {
  console.log('Status:', res.statusCode);
  console.log('Location:', res.headers.location);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('Body:', data.slice(0, 300));
    }
  });
});

// 3. 测试蜻蜓FM搜索
console.log('\n=== 蜻蜓FM搜索 ===');
https.get('https://www.qingting.fm/knows/index.html?keyword=%E6%99%B4%E5%A4%A9', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  console.log('Status:', res.statusCode);
  console.log('Location:', res.headers.location);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Body length:', data.length);
  });
});

// 4. 测试酷我搜索完整结果
console.log('\n=== 酷我搜索 ===');
https.get('https://search.kuwo.cn/r.s?keyword=%E6%99%B4%E5%A4%A9&rn=10&pcpage=1', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Content-Type:', res.headers['content-type']);
    console.log('Body preview:', data.slice(0, 500));
  });
});
