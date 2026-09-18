// Cloudflare Pages Function: /api/search
// 代理到 miss.qingchengkg.cn 的音乐搜索 API，规避浏览器 CORS / 混合内容限制。
// 前端以同源 POST 调用本函数，本函数转发到上游 HTTPS 接口并返回 JSON。

const UPSTREAM = 'https://miss.qingchengkg.cn/';

export async function onRequestPost(context) {
  const { request } = context;
  let body;
  try {
    const form = await request.formData();
    const input = (form.get('input') || '').toString().trim();
    const filter = (form.get('filter') || 'name').toString();
    const type = (form.get('type') || 'netease').toString();
    const page = (form.get('page') || '1').toString();
    if (!input) {
      return json({ code: 400, error: 'input 不能为空' }, 400);
    }
    body = new URLSearchParams({ input, filter, type, page });
  } catch (e) {
    return json({ code: 400, error: '请求体解析失败' }, 400);
  }

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': UPSTREAM,
      },
      body,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return json({ code: 500, error: '上游请求失败：' + e.message }, 502);
  }
}

// 允许跨域预检（若前端部署在其它域名）
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
