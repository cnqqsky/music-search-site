// 测试各音乐平台 API 可用性
import https from 'node:https';
import http from 'node:http';

const platforms = [
  // 网易云音乐
  {
    name: 'netease-search',
    url: 'https://music.163.com/api/search/pc',
    method: 'POST',
    data: { s: '晴天', limit: 5, offset: 0 },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  },
  // 酷狗搜索
  {
    name: 'kugou-search',
    url: 'https://songsearch.kugou.com/song_search_v2',
    method: 'GET',
    params: { keyword: '晴天', page: 1, pagesize: 5, platform: 'WebFilter', filter: 2 },
    headers: {}
  },
  // 酷我搜索
  {
    name: 'kuwo-search',
    url: 'https://search.kuwo.cn/r.s',
    method: 'GET',
    params: { keyword: '晴天', pn: 1, rn: 5, client: 'kt', all: 'music' },
    headers: {}
  },
  // QQ音乐搜索 (JSONP)
  {
    name: 'qq-search',
    url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp',
    method: 'GET',
    params: { ct: '24', qp: '1', n: '5', w: '晴天', g_tk: '5381', format: 'jsonp' },
    headers: { 'Referer': 'https://y.qq.com/' }
  },
  // 咪咕搜索
  {
    name: 'migu-search',
    url: 'https://m.music.migu.cn/migu/search.jsp',
    method: 'GET',
    params: { keyword: '晴天', type: 2 },
    headers: {}
  },
];

async function testPlatform(test) {
  return new Promise((resolve) => {
    const mod = test.url.startsWith('https') ? https : http;
    let url = test.url;

    if (test.params) {
      const query = new URLSearchParams(test.params).toString();
      url += (url.includes('?') ? '&' : '?') + query;
    }

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...test.headers
      }
    };

    const req = test.method === 'POST'
      ? mod.request(url, options, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ name: test.name, status: res.statusCode, data }));
        })
      : mod.get(url, options, res => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ name: test.name, status: res.statusCode, data }));
        });

    req.on('error', e => resolve({ name: test.name, error: e.message }));

    if (test.method === 'POST' && test.data) {
      const postData = typeof test.data === 'string' ? test.data : new URLSearchParams(test.data).toString();
      req.write(postData);
    }
    req.end();
  });
}

(async () => {
  console.log('=== 音乐平台 API 测试结果 ===\n');
  for (const test of platforms) {
    const result = await testPlatform(test);
    console.log(`[${result.name}] ${result.status || 'ERROR'}`);
    if (result.data) {
      // 检查响应类型
      const firstChar = result.data.trim().charAt(0);
      if (firstChar === '{' || firstChar === '[') {
        console.log('  Format: JSON');
        try {
          const json = JSON.parse(result.data.replace(/^callback\(|\)$/g, ''));
          console.log('  Keys:', Object.keys(json).join(', '));
          if (json.data) {
            const list = json.data.list || json.data.song || json.data.data || [];
            console.log(`  Results: ${list.length} items`);
            if (list.length > 0) {
              console.log('  First:', JSON.stringify(list[0]).slice(0, 150));
            }
          }
        } catch (e) {
          console.log('  Preview:', result.data.slice(0, 150));
        }
      } else if (result.data.includes('<!DOCTYPE') || result.data.includes('<html')) {
        console.log('  Format: HTML (可能需要解析)');
        console.log('  Preview:', result.data.slice(0, 100));
      } else {
        console.log('  Preview:', result.data.slice(0, 150));
      }
    } else if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log('');
  }
})();
