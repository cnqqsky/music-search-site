// Cloudflare Pages Function: /api/search
// 自建网易云音源（原第三方聚合接口 miss.qingchengkg.cn 已下线）。
// 链路：云端/cloudsearch/pc 检索 → 批量 song/url 取直链 → 组装前端所需字段。
// 所有环节均带多域名 / 多接口级降级，单条失败不影响整体返回。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// 回源候选域名：主域失败自动切备用域（部分网络下 interface 子域可达性更好）
const NE_HOSTS = ['https://music.163.com', 'https://interface.music.163.com'];

const PAGE_SIZE = 20;

// ---------- 基础工具 ----------

function randNmtid() {
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return Math.random().toString(16).slice(2);
  }
}

function neHeaders() {
  return {
    'User-Agent': UA,
    Referer: 'https://music.163.com/',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    // os=pc + appver 是免登录取到播放链接的关键，缺失会返回 code=-110
    Cookie: `os=pc; appver=8.9.70; NMTID=${randNmtid()}`,
  };
}

async function fetchJson(url, headers, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 9000);
  try {
    const r = await fetch(url, { headers, signal: ctl.signal });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || t[0] !== '{') return null;
    const j = JSON.parse(t);
    return j || null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// http 统一升级为 https，避免 HTTPS 页面下浏览器拦截混合内容
function toHttps(u) {
  return u ? String(u).replace(/^http:\/\//i, 'https://') : '';
}

function param(url, size) {
  const s = size || 200;
  return url ? `${url}?param=${s}y${s}` : '';
}

// ---------- 检索 ----------

// 依次尝试主/备域名下的多个搜索 endpoint
async function neSearch(keyword, offset, limit) {
  const paths = [
    `/api/cloudsearch/pc?s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&limit=${limit}&total=true`,
    `/api/search/get/web?s=${encodeURIComponent(keyword)}&type=1&offset=${offset}&limit=${limit}`,
  ];
  for (const host of NE_HOSTS) {
    for (const p of paths) {
      const j = await fetchJson(host + p, neHeaders(), 9000);
      const songs = j && j.result && j.result.songs;
      if (Array.isArray(songs) && songs.length) return songs;
    }
  }
  return [];
}

// 按 ID 精确查询（音乐 ID / 详情页地址两种入口复用）
async function neDetail(ids) {
  for (const host of NE_HOSTS) {
    const j = await fetchJson(
      `${host}/api/song/detail?ids=${encodeURIComponent(JSON.stringify(ids))}`,
      neHeaders(),
      9000
    );
    const songs = j && j.songs;
    if (Array.isArray(songs) && songs.length) return songs;
  }
  return [];
}

// ---------- 取播放直链 ----------

const URL_CANDIDATES = [
  (host, ids) => `${host}/api/song/enhance/player/url/v1?ids=${ids}&level=exhigh&encodeType=mp3&csrf_token=`,
  (host, ids) => `${host}/api/song/enhance/player/url/v1?ids=${ids}&level=standard&encodeType=mp3&csrf_token=`,
  (host, ids) => `${host}/api/song/enhance/player/url?ids=${ids}&br=320000&csrf_token=`,
];

// 批量取链：任一候选返回了有效 url 的 id 即"落袋"，剩余 id 继续下一候选
async function neUrls(ids) {
  const result = new Map();
  let pending = ids.slice();
  const enc = encodeURIComponent(JSON.stringify(ids));
  for (const build of URL_CANDIDATES) {
    if (!pending.length) break;
    for (const host of NE_HOSTS) {
      if (!pending.length) break;
      const j = await fetchJson(build(host, enc), neHeaders(), 10000);
      const arr = j && Array.isArray(j.data) ? j.data : null;
      if (!arr) continue;
      for (const d of arr) {
        if (d && d.url && String(d.id)) {
          result.set(Number(d.id), {
            url: toHttps(d.url),
            br: d.br || 0,
            size: d.size || 0,
            level: d.level || '',
          });
        }
      }
      pending = pending.filter((id) => !result.has(id));
    }
  }
  return result;
}

// ---------- 酷狗音源（第二音源，与网易互补）----------
// 说明：酷狗 getSongInfo.php 可在 Cloudflare 海外节点直接调用，
// sharefs.kugou.com 返回的直链无 referer 校验，浏览器可直接播放。

const KG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1';
const KG_SEARCH_HOSTS = ['https://songsearch.kugou.com', 'http://songsearch.kugou.com'];
const KG_API_HOSTS = ['https://m.kugou.com', 'http://m.kugou.com'];
// 单次请求上限：CF 免费版 subrequest 限额 50 次，这里留出充足余量
const KG_TAKE = 6;
// 网易可播数低于此值时才补查酷狗：多数搜索无需消耗酷狗配额
const KG_FALLBACK_MIN = 5;

function kgHeaders(referer) {
  return {
    'User-Agent': KG_UA,
    Referer: referer || 'http://m.kugou.com/',
    Accept: 'application/json, text/plain, */*',
  };
}

// 酷狗检索：返回含 FileHash / SQFileHash 的曲目列表
async function kgSearch(keyword, n) {
  const size = n || KG_TAKE;
  for (const host of KG_SEARCH_HOSTS) {
    const u =
      `${host}/song_search_v2?keyword=${encodeURIComponent(keyword)}` +
      `&page=1&pagesize=${size}&platform=WebFilter&filter=2`;
    const j = await fetchJson(u, kgHeaders('http://www.kugou.com/'), 8000);
    const lists = j && j.data && Array.isArray(j.data.lists) ? j.data.lists : [];
    if (lists.length) return lists;
  }
  return [];
}

// 单曲取播放地址（酷狗无批量接口，只能逐 hash 查询）
async function kgUrlRaw(hash) {
  const qs = `cmd=playInfo&hash=${encodeURIComponent(hash)}`;
  for (const host of KG_API_HOSTS) {
    const j = await fetchJson(
      `${host}/app/i/getSongInfo.php?${qs}`,
      kgHeaders(`http://m.kugou.com/play/info/${hash}`),
      8000
    );
    if (j && j.url) return { info: j, errcode: 0 };
    if (j) return { info: null, errcode: j.errcode || -1 };
  }
  return { info: null, errcode: -2 };
}

// 酷狗对本机 IP 的频控极严，超限后长时间封锁 IP（errcode=1002，与 UA 无关）。
// 因此同一 hash 的结果必须缓存复用：同一首歌重复搜索时不再回源。
async function kgUrl(hash) {
  const key = `https://kg-cache.invalid/playInfo/${hash}`;
  try {
    const cache = caches.default;
    const hit = await cache.match(key);
    if (hit) return await hit.json();
    const res = await kgUrlRaw(hash);
    if (res.info) {
      await cache.put(
        key,
        new Response(JSON.stringify(res), { headers: { 'Cache-Control': 'max-age=1800' } })
      );
    }
    return res;
  } catch (e) {
    // Cache API 不可用时退化为直接请求
    return kgUrlRaw(hash);
  }
}

// 优先取 SQ 音质的 hash；曲库无 SQ 版本时 SQFileHash 恒为全 0 字符串（而非空），
// 直接当作有效 hash 会导致取链失败，必须回退到普通 FileHash。
function kgPickHash(x) {
  const sq = String(x.SQFileHash || '');
  if (sq && !/^0+$/.test(sq)) return sq;
  return String(x.FileHash || '');
}

function kgClean(s) {
  return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function kgBuild(list, info) {
  const hash = kgPickHash(list);
  const name = kgClean(list.SongName) || '未知曲目';
  const singer = kgClean(list.SingerName) || '未知歌手';
  const img = toHttps(
    (info && (info.imgUrl || info.album_img)) || list.Image || ''
  ).replace('/{size}/', '/400/');
  return {
    title: name,
    author: singer,
    songid: hash,
    link: `https://www.kugou.com/song/#hash=${hash}`,
    url: info ? toHttps(info.url) : '',
    pic: img,
    lrc: '',           // 酷狗歌词为 krc 加密串，暂不支持
    type: 'kugou',
    br: info && info.bitrate ? Number(info.bitrate) * 1000 : 0,
    size: (info && info.fileSize) || 0,
    album: (info && info.album_name) || kgClean(list.AlbumName) || '',
    duration: info && info.timeLength ? Number(info.timeLength) * 1000 : 0,
    restricted: !(info && info.url),
  };
}

// 熔断：酷狗按 IP 频控，超限后长时间封禁（errcode=1002，与 UA 无关）。
// CF 会并发运行多个 isolate，仅用模块级变量无法阻止新 isolate 继续发请求，
// 因此把封禁截止时间写入 Cache API，实现跨 isolate 共享。
const KG_BLOCK_KEY = 'https://kg-cache.invalid/block-until';
const KG_BLOCK_MS = 10 * 60 * 1000;
let kgBlockUntilLocal = 0;

async function kgBlocked() {
  const now = Date.now();
  if (now < kgBlockUntilLocal) return true;
  try {
    const hit = await caches.default.match(KG_BLOCK_KEY);
    if (hit) {
      const until = Number(await hit.text()) || 0;
      if (until > now) {
        kgBlockUntilLocal = until;
        return true;
      }
    }
  } catch (e) { /* Cache API 不可用时退化为本地判定 */ }
  return false;
}

async function kgMarkBlocked() {
  const until = Date.now() + KG_BLOCK_MS;
  kgBlockUntilLocal = until;
  try {
    await caches.default.put(
      KG_BLOCK_KEY,
      new Response(String(until), { headers: { 'Cache-Control': `max-age=${KG_BLOCK_MS / 1000}` } })
    );
  } catch (e) { /* 忽略 */ }
}

// 检索 + 取链：返回可播曲目与诊断信息（分阶段计数，便于定位是检索失败还是取链被限流）
async function kgResult(keyword) {
  if (await kgBlocked()) {
    return { items: [], searchCount: 0, urlOk: 0, errcode: 1002, err: '限流熔断中，稍后自动恢复' };
  }
  const lists = await kgSearch(keyword, KG_TAKE);
  if (!lists.length) return { items: [], searchCount: 0, urlOk: 0, errcode: null, err: '搜索无结果' };
  const items = [];
  let lastErr = null;
  let banned = 0;
  for (const x of lists.slice(0, KG_TAKE)) {
    const hash = kgPickHash(x);
    if (!hash) continue;
    const r = await kgUrl(hash);
    if (r.info) items.push(kgBuild(x, r.info));
    else if (lastErr === null && r.errcode) lastErr = r.errcode;
    // 前两条就全部被拒即可判定封禁，无需打满配额
    if (r.errcode === 1002 && ++banned >= 2) break;
  }
  if (lastErr === 1002 && !items.length) await kgMarkBlocked();
  return {
    items,
    searchCount: lists.length,
    urlOk: items.length,
    errcode: lastErr,
    err: lastErr ? 'errcode=' + lastErr : '无可用播放地址',
  };
}

// ---------- 结果组装 ----------

function artists(song) {
  const ar = Array.isArray(song.ar) ? song.ar : song.artists || [];
  return ar.map((a) => (a && a.name) || '').filter(Boolean).join(' / ');
}

function buildItem(song, media) {
  const id = song.id;
  const al = song.al || song.album || {};
  const pic = al.picUrl || (song.album && song.album.picUrl) || '';
  return {
    title: song.name || '未知曲目',
    author: artists(song) || '未知歌手',
    songid: String(id),
    link: `https://music.163.com/#/song?id=${id}`,
    url: media ? media.url : '',
    pic: param(toHttps(pic), 200) || '',
    lrc: '',            // 歌词由 /api/lyric 按需拉取，避免拖慢列表
    type: 'netease',
    br: media ? media.br : 0,
    size: media ? media.size : 0,
    album: al.name || '',
    duration: song.dt || 0,
    // 未取到直链 = 该曲目在当前服务节点不可播（多为版权地域限制），前端据此给出明确提示
    restricted: !media,
  };
}

// 原唱优先评分：压制网易默认排序里排在前面的翻唱版
function relevance(song, raw) {
  const kw = String(raw).trim().toLowerCase();
  const name = String(song.name || '').trim().toLowerCase();
  const artist = artists(song).toLowerCase();
  // "晴天 周杰伦" → 词部分用于曲名匹配，剩余尝试按歌手匹配
  const parts = kw.split(/[\s,，、]+/).filter(Boolean);
  let score = 0;
  const clean = (s) => s.replace(/[（(].*?[)）]/g, '').trim();
  const nameClean = clean(name);

  if (nameClean === kw || name === kw) score += 100;
  else if (parts.length > 1 && nameClean === parts[0]) score += 80;
  else if (nameClean.startsWith(kw)) score += 55;
  else if (nameClean.includes(kw)) score += 35;

  for (const p of parts) {
    if (p && artist.includes(p) && p !== parts[0]) score += 40;
  }
  // 别名（外文原名等）命中也算强匹配
  const alias = Array.isArray(song.alia) ? song.alia : song.alias || [];
  if (alias.some((a) => clean(String(a)).toLowerCase() === clean(kw))) score += 45;

  return score;
}

function normalize(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

// 从网易详情页地址中提取歌曲 id
function idFromLink(raw) {
  const m = String(raw).match(/[?&#]id=(\d+)/) || String(raw).match(/\/(\d+)\/?(\?|#|$)/);
  return m ? Number(m[1]) : NaN;
}

// ---------- 主流程 ----------

async function handle(params) {
  const input = normalize(params.get('input'));
  const filter = (params.get('filter') || 'name').toString();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const limit = PAGE_SIZE;
  const offset = (page - 1) * limit;
  // src=netease / kugou 可单独指定音源，便于排查单个音源的可用性；默认两源并行
  const src = (params.get('src') || 'all').toString();

  if (!input) return { code: 400, error: 'input 不能为空' };

  // ID / 链接反查走网易精确查询，不需要第二音源
  const isDirect = filter === 'id' || filter === 'url';

  let songs = [];
  if (isDirect) {
    if (filter === 'id') {
      const id = parseInt(input.replace(/[^\d]/g, ''), 10);
      if (!id) return { code: 400, error: '音乐 ID 无效' };
      songs = await neDetail([id]);
    } else {
      const id = idFromLink(input);
      if (!id) return { code: 400, error: '未能从地址中解析出音乐 ID' };
      songs = await neDetail([id]);
    }
  } else {
    // src=kugou 时跳过网易检索，只走酷狗链路
    songs = src === 'kugou' ? [] : await neSearch(input, offset, limit);
    if (songs.length > 1) {
      // 稳定排序：相关度高的排前，其余保持网易原始权重
      songs = songs
        .map((s, i) => ({ s, i, sc: relevance(s, input) }))
        .sort((a, b) => (b.sc !== a.sc ? b.sc - a.sc : a.i - b.i))
        .map((x) => x.s);
      // 同名同歌手的重复版本去重，保留首个（即最相关的一条）
      const seen = new Set();
      songs = songs.filter((s) => {
        const k = `${normalize(s.name).toLowerCase()}|${artists(s).toLowerCase()}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }
  }

  // 网易取链先行。酷狗频控很严，只有在网易可播结果不足时才补查，
  // 这样绝大多数搜索不会消耗酷狗的请求配额，避免站点被拉黑。
  const media = songs.length ? await neUrls(songs.map((s) => s.id).filter(Boolean)) : new Map();
  const data = songs.map((s) => buildItem(s, media.get(s.id) || null));
  const nePlayable = data.filter((d) => d.url).length;

  let kgRes = { items: [], searchCount: 0, urlOk: 0, errcode: null, err: '未触发（网易结果充足）' };
  const needKg = !isDirect && src !== 'netease' && (src === 'kugou' || nePlayable < KG_FALLBACK_MIN);
  if (needKg) {
    kgRes = (await kgResult(input).catch(() => null)) || {
      items: [], searchCount: 0, urlOk: 0, errcode: -1, err: '酷狗请求异常',
    };
  }

  // 合并酷狗曲目：仅当网易已有同名且可播的版本时才去重，
  // 否则网易不可播而酷狗可播的情况下，酷狗永远无法补位（这是此处的常见 bug）
  const normKey = (t) => String(t || '').replace(/[（(].*?[)）]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const neGoodKeys = new Set(
    data.filter((d) => d.type === 'netease' && d.url).map((d) => normKey(d.title))
  );
  for (const k of kgRes.items) {
    if (neGoodKeys.size && neGoodKeys.has(normKey(k.title))) continue;
    data.push(k);
  }

  const got = data.filter((d) => d.url).length;

  // 可播优先：无法在当前节点播放的曲目整体后置，避免占用结果顶部位置
  if (got > 0 && got < data.length) {
    data.sort((a, b) => (a.restricted === b.restricted ? 0 : a.restricted ? 1 : -1));
  }

  return {
    code: 200,
    data,
    source: 'netease+kugou',
    diag: {
      total: data.length,
      playable: got,
      netease: data.filter((d) => d.type === 'netease').length,
      neteasePlayable: nePlayable,
      kugou: data.filter((d) => d.type === 'kugou').length,
      kugouSearch: kgRes.searchCount,
      kugouUrlOk: kgRes.urlOk,
      kugouErr: kgRes.err || '',
    },
  };
}

function toResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  });
}

export async function onRequestPost(context) {
  const { request } = context;
  let params;
  const ctype = request.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    params = new URLSearchParams(Object.entries(j));
  } else {
    const form = await request.formData().catch(() => null);
    if (form) {
      params = new URLSearchParams();
      for (const [k, v] of form.entries()) params.append(k, String(v));
    } else {
      params = new URLSearchParams(await request.text());
    }
  }
  try {
    const body = await handle(params);
    return toResponse(body, body.code === 400 ? 400 : 200);
  } catch (e) {
    return toResponse({ code: 502, error: '音源请求失败：' + e.message }, 502);
  }
}

// GET 便于浏览器直接调试：/api/search?input=晴天&filter=name&page=1
export async function onRequestGet(context) {
  const params = new URL(context.request.url).searchParams;
  try {
    const body = await handle(params);
    return toResponse(body, body.code === 400 ? 400 : 200);
  } catch (e) {
    return toResponse({ code: 502, error: '音源请求失败：' + e.message }, 502);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
