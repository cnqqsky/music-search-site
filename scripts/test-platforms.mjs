// 测试各音乐平台的搜索接口可用性
import https from 'node:https';
import http from 'node:http';

const tests = [
  // 酷我搜索
  { name: 'kuwo-search', url: 'https://search.kuwo.cn/r.s?keyword=%E6%99%B4%E5%A4%A9&rn=5&pcpage=1&isjump=false', type: 'https' },
  // 咪咕搜索
  { name: 'migu-search', url: 'https://m.music.migu.cn/migu/search.jsp?keyword=%E6%99%B4%E5%A4%A9&type=2', type: 'https' },
  // 一听音乐
  { name: '1ting-search', url: 'http://search.1ting.com/player/getData?keyword=%E6%99%B4%E5%A4%A9&t=1', type: 'http' },
  // QQ音乐搜索
  { name: 'qq-search', url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qp=1&n=5&w=%E6%99%B4%E5%A4%A9&g_tk=5381&format=jsonp', type: 'https' },
  // 喜马拉雅搜索
  { name: 'ximalaya-search', url: 'https://search.ximalaya.com/stock-web-search?keyword=%E6%99%B4%E5%A4%A9&page=1&rows=5', type: 'https', headers: { 'Referer': 'https://www.ximalaya.com/' } },
  // 蜻蜓FM
  { name: 'qingting-search', url: 'https://www.qingting.fm/knows/index.html?keyword=%E6%99%B4%E5%A4%A9', type: 'https' },
];

for (const t of tests) {
  const mod = t.type === 'https' ? https : http;
  const options = {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(t.headers || {}) }
  };

  mod.get(t.url, options, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`${t.name}: ${res.statusCode}`);
      if (res.statusCode === 200 && data.length > 50) {
        const firstChar = data.trim().charAt(0);
        if (firstChar === '{' || firstChar === '[') {
          console.log('  Format: JSON');
        } else if (data.includes('(function') || data.includes('callback')) {
          console.log('  Format: JSONP');
        }
        console.log('  Preview:', data.slice(0, 150));
      }
      console.log('');
    });
  }).on('error', e => {
    console.log(`${t.name}: ERROR - ${e.message}\n`);
  });
}
