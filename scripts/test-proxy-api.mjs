// 测试 shagua.name 和 lmb520.cn 的搜索 API（POST 方式）
import https from 'node:https';
import http from 'node:http';
import querystring from 'node:querystring';

const testCases = [
  // shagua.name 测试不同平台
  { name: 'shagua-netease', url: 'https://www.shagua.name/', data: { input: '晴天', filter: 'name', type: 'netease', page: 1 } },
  { name: 'shagua-qq', url: 'https://www.shagua.name/', data: { input: '晴天', filter: 'name', type: 'qq', page: 1 } },
  { name: 'shagua-kugou', url: 'https://www.shagua.name/', data: { input: '晴天', filter: 'name', type: 'kugou', page: 1 } },
  { name: 'shagua-kuwo', url: 'https://www.shagua.name/', data: { input: '晴天', filter: 'name', type: 'kuwo', page: 1 } },
  // lmb520.cn 测试
  { name: 'lmb-netease', url: 'https://music.lmb520.cn/', data: { input: '晴天', filter: 'name', type: 'netease', page: 1 } },
  { name: 'lmb-qq', url: 'https://music.lmb520.cn/', data: { input: '晴天', filter: 'name', type: 'qq', page: 1 } },
  { name: 'lmb-kugou', url: 'https://music.lmb520.cn/', data: { input: '晴天', filter: 'name', type: 'kugou', page: 1 } },
];

async function testSearch(test) {
  return new Promise((resolve) => {
    const urlObj = new URL(test.url);
    const isHttps = urlObj.protocol === 'https:';
    const mod = isHttps ? https : http;

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': test.url,
      }
    };

    const postData = querystring.stringify(test.data);

    const req = mod.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ name: test.name, status: res.statusCode, data, contentType: res.headers['content-type'] });
      });
    });

    req.on('error', e => resolve({ name: test.name, error: e.message }));
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('=== 音乐搜索 API 测试结果 ===\n');

  for (const t of testCases) {
    const result = await testSearch(t);
    console.log(`\n--- ${t.name} ---`);

    if (result.error) {
      console.log(`ERROR: ${result.error}`);
      continue;
    }

    console.log(`Status: ${result.status}`);
    console.log(`Content-Type: ${result.contentType}`);

    if (result.status === 200 && result.data.length > 50) {
      // 检查是否是 JSON
      const trimmed = result.data.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        console.log('Format: JSON');
        try {
          const json = JSON.parse(trimmed);
          console.log('Keys:', Object.keys(json).join(', '));
          if (json.code === 200 && json.data) {
            const list = json.data.list || [];
            console.log(`Results: ${list.length} items`);
            if (list.length > 0) {
              console.log('First item:', JSON.stringify(list[0]).slice(0, 200));
            }
          } else if (json.code && json.code !== 200) {
            console.log('Error code:', json.code, json.message || '');
          }
        } catch (e) {
          console.log('Parse error:', e.message);
          console.log('Preview:', trimmed.slice(0, 200));
        }
      } else if (trimmed.includes('<!DOCTYPE') || trimmed.includes('<html')) {
        console.log('Format: HTML (no JSON response)');
        console.log('Preview:', trimmed.slice(0, 150));
      } else {
        console.log('Preview:', trimmed.slice(0, 200));
      }
    } else if (result.status === 301 || result.status === 302) {
      console.log('Redirect to:', result.headers?.location || 'unknown');
    } else {
      console.log('Body:', result.data.slice(0, 200));
    }
  }
})();
