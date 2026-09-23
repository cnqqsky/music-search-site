// Cloudflare Pages Function: /api/lyric?id=<歌曲ID>
// 按需拉取歌词，搜索列表不再等待歌词，列表返回更快；
// 歌词的三语种字段（原词/翻译/罗马音）合并为带时间轴的原文 + 译文行。

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const NE_HOSTS = ['https://music.163.com', 'https://interface.music.163.com'];

function neHeaders() {
  return {
    'User-Agent': UA,
    Referer: 'https://music.163.com/',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    Cookie: 'os=pc; appver=8.9.70',
  };
}

async function fetchJson(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 8000);
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

function toResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      // 歌词基本不变，允许短时私有缓存以降低回源频率
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

async function respond(idRaw) {
  const id = parseInt(String(idRaw || '').replace(/[^\d]/g, ''), 10);
  if (!id) return toResponse({ code: 400, error: 'id 无效' }, 400);

  for (const host of NE_HOSTS) {
    const j = await fetchJson(`${host}/api/song/lyric?os=pc&id=${id}&lv=-1&kv=-1&tv=-1`, 8000);
    if (!j) continue;
    const lrc = (j.lrc && j.lrc.lyric) || '';
    const tlyric = (j.tlyric && j.tlyric.lyric) || '';
    if (lrc) {
      return toResponse({ code: 200, data: { lrc, tlyric, id } });
    }
  }
  return toResponse({ code: 404, error: '该曲目暂无歌词' }, 200);
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
