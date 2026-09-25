// Cloudflare Pages Function: /api/proxy-search
// 代理 shagua.name 的多平台音乐搜索 API
// 支持平台: netease, qq, kugou, kuwo, 1ting

const PROXY_URL = 'https://www.shagua.name/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SUPPORTED_TYPES = ['netease', 'qq', 'kugou', 'kuwo', '1ting'];

function normalizeItem(item) {
  return {
    type: item.type || 'netease',
    title: item.title || '未知',
    author: item.author || '未知',
    pic: item.pic || '',
    link: item.link || '',
    songid: item.songid || '',
    lrc: item.lrc || '',
    url: item.link || '', // 使用原始链接作为播放 URL
  };
}

export async function onRequest(context) {
  const { request } = context;

  // CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ code: 405, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const formData = await request.formData();
    const input = formData.get('input') || '';
    const filter = formData.get('filter') || 'name';
    const type = formData.get('type') || 'netease';
    const page = parseInt(formData.get('page') || '1', 10);

    if (!input) {
      return new Response(JSON.stringify({ code: 400, error: '缺少搜索关键词' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (!SUPPORTED_TYPES.includes(type)) {
      return new Response(JSON.stringify({
        code: 400,
        error: `不支持的平台: ${type}，支持: ${SUPPORTED_TYPES.join(', ')}`,
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // 代理请求
    const proxyForm = new FormData();
    proxyForm.append('input', input);
    proxyForm.append('filter', filter);
    proxyForm.append('type', type);
    proxyForm.append('page', String(page));

    const proxyResp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Referer': PROXY_URL,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: proxyForm,
    });

    if (!proxyResp.ok) {
      throw new Error(`Proxy request failed: ${proxyResp.status}`);
    }

    const proxyText = await proxyResp.text();
    let proxyJson;
    try {
      proxyJson = JSON.parse(proxyText);
    } catch (e) {
      return new Response(JSON.stringify({ code: 502, error: '代理响应解析失败' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    if (proxyJson.code === 200 && proxyJson.data) {
      proxyJson.data = proxyJson.data.map(normalizeItem);
    }

    return new Response(JSON.stringify(proxyJson), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      code: 500,
      error: error.message || '搜索失败',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
