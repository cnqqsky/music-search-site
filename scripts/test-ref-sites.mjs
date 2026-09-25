// 测试参考站点的搜索API
import https from 'node:https';
import http from 'node:http';

const tests = [
  // lmb520.cn
  { name: 'lmb-api-search', url: 'https://music.lmb520.cn/api/search?keyword=晴天', type: 'https' },
  { name: 'lmb-api-root', url: 'https://music.lmb520.cn/api/', type: 'https' },
  { name: 'lmb-search-page', url: 'https://music.lmb520.cn/search?q=晴天', type: 'https' },
  // shagua.name
  { name: 'shagua-api-search', url: 'https://www.shagua.name/api/search?keyword=晴天', type: 'https' },
  { name: 'shagua-api-root', url: 'https://www.shagua.name/api/', type: 'https' },
  { name: 'shagua-search-page', url: 'https://www.shagua.name/search?q=晴天', type: 'https' },
];

for (const t of tests) {
  const mod = t.type === 'https' ? https : http;
  mod.get(t.url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, text/html' } }, res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(`${t.name}: ${res.statusCode}`);
      if (res.statusCode === 200 && data.length > 20) {
        const ct = res.headers['content-type'] || '';
        console.log(`  Content-Type: ${ct}`);
        console.log(`  Body (${data.length} chars): ${data.slice(0, 300)}`);
      }
      console.log('');
    });
  }).on('error', e => {
    console.log(`${t.name}: ERROR - ${e.message}\n`);
  });
}
