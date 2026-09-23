// 探测可作为「CF 边缘 → 网易音频」代理层的第三方服务
// 双打：① 能否返回音频地址 ② 该地址能否真实取流
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const out = [];
const log = (s) => { out.push(s); console.log(s); };

const CANDIDATES = [
  ['i-meto meting search', `https://api.i-meto.com/meting/api?server=netease&type=song&id=25906124`],
  ['injahow meting', `https://api.injahow.cn/meting/?type=one&id=25906124`],
  ['qyong meting', `https://meting.qyong.net.cn/api/?server=netease&type=url&id=25906124`],
  ['163api qijieya', `https://163api.qijieya.cn/song/url?id=25906124&level=exhigh`],
  ['netease vercel 实例 A', `https://netease-cloud-music-api-ten-rose.vercel.app/song/url?id=25906124&level=exhigh`],
  ['netease vercel 实例 B', `https://netease-api.vercel.app/song/url?id=25906124`],
  ['music-api vercel', `https://music-api.vercel.app/song/url?id=25906124`],
  ['wyy api bluejoe', `https://wyy-api.bluejoe.top/song/url?id=25906124`],
  ['suming api', `https://api.suming.vip/netease/song/url?id=25906124`],
  ['uuapi', `https://api.uu666.vip/netease/url?id=25906124`],
];

async function ping(u, label) {
  const t0 = Date.now();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(u, { headers: { 'User-Agent': UA, Referer: new URL(u).origin + '/' } });
    clearTimeout(timer);
    const t = await r.text();
    const m = t.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
    log(`  ${label}\n    HTTP ${r.status} ${Date.now() - t0}ms body=${t.slice(0, 130)}`);
    if (m) {
      // 二级校验：该 URL 是否真能取流
      const hostOK = await checkStream(unescapeUrl(m[1]));
      log(`    → 音频地址: ${m[1].slice(0, 80)}\n    → 取流校验: ${hostOK}`);
      return { ok: true, url: unescapeUrl(m[1]) };
    }
    if (r.status === 200 && /^\s*\{|^\s*\[/.test(t)) {
      // meting 返回的是它自己的代理地址
      const pm = t.match(/"(?:url)"\s*:\s*"(https?:\/\/[^"]*)"/);
      log(`    二级地址提示: ${pm ? pm[1].slice(0, 90) : '无'}`);
    }
  } catch (e) {
    log(`  ${label}\n    ERR ${e.message}`);
  }
  return { ok: false };
}

function unescapeUrl(s) {
  return s.replace(/\\u002F/g, '/').replace(/\\\//g, '/');
}

async function checkStream(url) {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch(url, { headers: { Range: 'bytes=0-1023', 'User-Agent': UA } });
    clearTimeout(timer);
    return `HTTP ${r.status} ct=${r.headers.get('content-type')} ${r.status === 206 || r.status === 200 ? '✅ 可取流' : '❌'}`;
  } catch (e) { return 'ERR ' + e.message; }
}

(async () => {
  log('===== 第三方代理候选 =====');
  for (const [label, u] of CANDIDATES) await ping(u, label);

  // Meting 特有的「type=url」返回的是它自己的重定向地址，单独验证
  log('\n===== Meting type=url 代理地址 =====');
  const base = 'https://api.i-meto.com/meting/api?server=netease&type=song&id=25906124';
  const r = await fetch(base, { headers: { 'User-Agent': UA } });
  const j = await r.json().catch(() => null);
  if (j && j[0] && j[0].url) {
    const proxy = 'https://api.i-meto.com' + j[0].url.replace(/^https?:\/\/[^/]+/, '');
    log(`  原始: ${j[0].url}`);
    log(`  → 取流: ${await checkStream(j[0].url)}`);
    // 也直接拼 type=url 形式
    const direct = `https://api.i-meto.com/meting/api?server=netease&type=url&id=25906124&auth=${new URL(j[0].url).searchParams.get('auth') || ''}`;
    log(`  type=url: ${await checkStream(direct)}`);
  } else {
    log('  未取到 meting 结果');
  }
})();

process.on('exit', () => {
  const fs = require('node:fs');
  fs.writeFileSync(new URL('./probe11-out.txt', import.meta.url), out.join('\n'), 'utf8');
});
