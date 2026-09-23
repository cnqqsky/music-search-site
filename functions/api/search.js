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

  if (!input) return { code: 400, error: 'input 不能为空' };

  let songs = [];

  if (filter === 'id') {
    const id = parseInt(input.replace(/[^\d]/g, ''), 10);
    if (!id) return { code: 400, error: '音乐 ID 无效' };
    songs = await neDetail([id]);
  } else if (filter === 'url') {
    const id = idFromLink(input);
    if (!id) return { code: 400, error: '未能从地址中解析出音乐 ID' };
    songs = await neDetail([id]);
  } else {
    songs = await neSearch(input, offset, limit);
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

  if (!songs.length) {
    return { code: 200, data: [], source: 'netease', diag: 'no-result' };
  }

  const ids = songs.map((s) => s.id).filter(Boolean);
  const media = await neUrls(ids);
  const data = songs.map((s) => buildItem(s, media.get(s.id) || null));

  const got = data.filter((d) => d.url).length;

  // 可播优先：无法在当前节点播放的曲目整体后置，避免占用结果顶部位置
  if (got > 0 && got < data.length) {
    data.sort((a, b) => (a.restricted === b.restricted ? 0 : a.restricted ? 1 : -1));
  }

  return {
    code: 200,
    data,
    source: 'netease',
    diag: { total: data.length, playable: got },
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
