// 完整测试 shagua.name 的搜索 API
import https from 'node:https';
import querystring from 'node:querystring';

const platforms = [
  'netease', 'qq', 'kugou', 'kuwo', '1ting', 'migu', 'lizhi', 'qingting', 'ximalaya', '5singyc', '5singfc'
];

async function testPlatform(platform) {
  return new Promise((resolve) => {
    const postData = querystring.stringify({
      input: '晴天',
      filter: 'name',
      type: platform,
      page: 1
    });

    const options = {
      hostname: 'www.shagua.name',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      }
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          platform,
          status: res.statusCode,
          contentType: res.headers['content-type'],
          data
        });
      });
    });

    req.on('error', e => resolve({ platform, error: e.message }));
    req.write(postData);
    req.end();
  });
}

(async () => {
  console.log('=== shagua.name 平台搜索结果 ===\n');

  const results = await Promise.all(platforms.map(testPlatform));

  for (const r of results) {
    console.log(`--- ${r.platform} ---`);
    if (r.error) {
      console.log(`  ERROR: ${r.error}`);
      continue;
    }
    console.log(`  Status: ${r.status}, Content-Type: ${r.contentType}`);
    if (r.status === 200 && r.data) {
      try {
        const json = JSON.parse(r.data);
        if (json.code === 200 && json.data) {
          console.log(`  ✓ 成功: ${json.data.length} 首歌曲`);
          if (json.data.length > 0) {
            const first = json.data[0];
            console.log(`    首条: ${first.title} - ${first.author}`);
            console.log(`    SongID: ${first.songid}, Link: ${first.link?.slice(0, 60)}...`);
          }
        } else {
          console.log(`  ✗ 无结果: ${json.error || '未知错误'}`);
        }
      } catch (e) {
        console.log(`  ⚠ 解析失败: ${e.message}`);
        console.log(`  原始: ${r.data.slice(0, 100)}`);
      }
    } else {
      console.log(`  Body: ${r.data.slice(0, 100)}`);
    }
    console.log('');
  }
})();
