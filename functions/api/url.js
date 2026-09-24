// Cloudflare Pages Function: /api/url?id=<歌曲ID>
// 用途：列表返回时未取到直链的曲目，在点播放的瞬间重新取一次。
// 相比于整页重搜，单曲补链的开销更小，也避免"某几首暂时取不到"影响整体体验。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const NE_HOSTS = ['https://music.163.com', 'https://interface.music.163.com'];

const URL_CANDIDATES = [
  (host, ids) => `${host}/api/song/enhance/player/url/v1?ids=${ids}&level=exhigh&encodeType=mp3&csrf_token=`,
  (host, ids) => `${host}/api/song/enhance/player/url/v1?ids=${ids}&level=standard&encodeType=mp3&csrf_token=`,
  (host, ids) => `${host}/api/song/enhance/player/url?ids=${ids}&br=320000&csrf_token=`,
  (host, ids) => `${host}/api/song/enhance/player/url?ids=${ids}&br=128000&csrf_token=`,
];

function neHeaders() {
  let nmtid;
  try {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    nmtid = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    nmtid = Math.random().toString(16).slice(2);
  }
  return {
    'User-Agent': UA,
    Referer: 'https://music.163.com/',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Cookie: `os=pc; appver=8.9.70; NMTID=${nmtid}`,
  };
}

async function fetchJson(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 9000);
  try {
    const r = await fetch(url, { headers: neHeaders(), signal: ctl.signal });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || t[0] !== '{') return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const KG_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B143 Safari/601.1';
const KG_API_HOSTS = ['https://m.kugou.com', 'http://m.kugou.com'];

function toHttps(u) {
  return u ? String(u).replace(/^http:\/\//i, 'https://') : '';
}

// 酷狗歌曲 ID 是 32 位 hash（非数字），据此分流
function isKugouHash(idRaw) {
  return /^[0-9a-fA-F]{32}$/.test(String(idRaw || '').trim());
}

async function fetchKg(url, referer, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 9000);
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': KG_UA, Referer: referer, Accept: 'application/json, text/plain, */*' },
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const t = await r.text();
    if (!t || t[0] !== '{') return null;
    return JSON.parse(t);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 酷狗补链：hash 换播放地址
async function resolveKugou(hash) {
  const qs = `cmd=playInfo&hash=${encodeURIComponent(hash)}`;
  for (const host of KG_API_HOSTS) {
    const j = await fetchKg(`${host}/app/i/getSongInfo.php?${qs}`, `http://m.kugou.com/play/info/${hash}`, 9000);
    if (j && j.url) {
      return {
        url: toHttps(j.url),
        br: j.bitrate ? Number(j.bitrate) * 1000 : 0,
        size: j.fileSize || 0,
        level: '',
      };
    }
  }
  return null;
}

async function resolve(id) {
  const enc = encodeURIComponent(JSON.stringify([id]));
  for (const build of URL_CANDIDATES) {
    for (const host of NE_HOSTS) {
      const j = await fetchJson(build(host, enc), 10000);
      const arr = j && Array.isArray(j.data) ? j.data : null;
      if (!arr) continue;
      const d = arr.find((x) => Number(x && x.id) === Number(id));
      if (d && d.url) {
        return { url: toHttps(d.url), br: d.br || 0, size: d.size || 0, level: d.level || '' };
      }
    }
  }
  return null;
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

async function respond(idRaw) {
  // 酷狗：32 位 hash 直接走酷狗链路
  if (isKugouHash(idRaw)) {
    const kg = await resolveKugou(String(idRaw).trim());
    if (!kg) {
      return toResponse({ code: 404, error: '该曲目暂无可用播放地址，可能是版权限制，请换一首试试' }, 200);
    }
    return toResponse({ code: 200, data: kg });
  }

  const id = parseInt(String(idRaw || '').replace(/[^\d]/g, ''), 10);
  if (!id) return toResponse({ code: 400, error: 'id 无效' }, 400);
  const media = await resolve(id);
  if (!media) {
    return toResponse({ code: 404, error: '该曲目暂无可用播放地址，可能是版权限制，请换一首试试' }, 200);
  }
  return toResponse({ code: 200, data: media });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  return respond(url.searchParams.get('id'));
}

export async function onRequestPost(context) {
  const { request } = context;
  let idRaw = '';
  const ctype = request.headers.get('content-type') || '';
  if (ctype.includes('application/json')) {
    const j = await request.json().catch(() => ({}));
    idRaw = j.id;
  } else {
    const form = await request.formData().catch(() => null);
    idRaw = form ? form.get('id') : new URLSearchParams(await request.text()).get('id');
  }
  return respond(idRaw);
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
