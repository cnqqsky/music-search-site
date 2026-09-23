// 验证网易官方外链地址：若返回 302 → CDN 直链，则可在无国内 IP 的情况下取到音频
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

async function test(label, url, options) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { redirect: 'manual', ...options, headers: { 'User-Agent': UA, Referer: 'https://music.163.com/', ...(options && options.headers) } });
    clearTimeout(timer);
    const loc = r.headers.get('location');
    log(`  ${label}\n    HTTP ${r.status} ${loc ? 'Location=' + loc.slice(0, 95) : ' ct=' + r.headers.get('content-type')}`);
    if (loc) {
      const s = await fetch(loc, { headers: { Range: 'bytes=0-511', 'User-Agent': UA } });
      log(`    → 直链取流: HTTP ${s.status} ct=${s.headers.get('content-type')} ${s.status === 206 || s.status === 200 ? '✅' : '❌'}`);
    }
  } catch (e) { log(`  ${label}\n    ERR ${e.message}`); }
}

async function main() {
  const id = 25906124;
  log('===== 官方外链 song/media/outer/url =====');
  await test('https + id.mp3', `https://music.163.com/song/media/outer/url?id=${id}.mp3`);
  await test('http + id.mp3', `http://music.163.com/song/media/outer/url?id=${id}.mp3`);
  await test('不带 .mp3', `https://music.163.com/song/media/outer/url?id=${id}`);
  await test('带 cookie', `https://music.163.com/song/media/outer/url?id=${id}.mp3`, { headers: { Cookie: 'os=pc; appver=8.9.70' } });

  log('\n===== 另一个古老入口 /api/song/enhance/download/url =====');
  await test('download url', `https://music.163.com/api/song/enhance/download/url?id=${id}&br=320000`, { headers: { Cookie: 'os=pc; appver=8.9.70' } });

  log('\n===== 对照：本地常规取链（应成功） =====');
  const c = await fetch(`https://music.163.com/api/song/enhance/player/url/v1?ids=%5B${id}%5D&level=exhigh&encodeType=mp3`, {
    headers: { 'User-Agent': UA, Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=8.9.70' },
  });
  const cj = await c.json();
  log(`  v1/exhigh -> code=${cj.data[0].code} url=${cj.data[0].url ? 'YES' : 'NULL'}`);
}

await main();
const fs = await import('node:fs');
fs.writeFileSync(new URL('./probe12-out.txt', import.meta.url), out.join('\n'), 'utf8');
