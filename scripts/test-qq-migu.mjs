// 测试 QQ 音乐播放链接有效性 + 探索新接口
import https from 'node:https';

// 1. 测试 QQ 音乐播放链接是否真实可播放
console.log('=== QQ 音乐播放链接测试 ===');
const qqPlayUrl = 'https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcgi?songmid=0039MnYb0qxYhV&format=jsonp';
https.get(qqPlayUrl, {
  headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://y.qq.com/' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    // 解析JSONP
    const jsonMatch = data.match(/callback\((.+)\)/s);
    if (jsonMatch) {
      try {
        const r = JSON.parse(jsonMatch[1]);
        console.log('Result keys:', Object.keys(r));
        const p = r.data?.playUrl;
        console.log('Play URL:', p ? p.slice(0, 100) : 'NOT FOUND');
      } catch (e) {
        console.log('Parse error:', e.message);
        console.log('Response:', data.slice(0, 200));
      }
    }
  });
}).on('error', e => console.log('ERROR:', e.message));

// 2. 测试咪咕新域名搜索
console.log('\n=== 咪咕新域名测试 ===');
https.get('https://m.music.migu.cn/v5/search?keyword=%E6%99%B4%E5%A4%A9&type=2', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode === 200) {
      console.log('Body:', data.slice(0, 500));
    }
  });
});

// 3. 测试蜻蜓FM新域名
console.log('\n=== 蜻蜓FM新域名测试 ===');
https.get('https://www.qtfm.cn/knows/index.html?keyword=%E6%99%B4%E5%A4%A9', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
}, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body length:', data.length);
  });
});

// 4. 测试QQ音乐搜索API是否有CORS（浏览器直接调用）
console.log('\n=== QQ音乐搜索CORS检测 ===');
console.log('URL: https://c.y.qq.com/soso/fcgi-bin/client_search_cp');
console.log('This requires JSONP callback, NOT direct fetch');
console.log('Pattern: callback=? must be appended to URL');
