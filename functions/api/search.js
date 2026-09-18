// Cloudflare Pages Function: /api/search
// 代理到 miss.qingchengkg.cn 的音乐搜索 API，规避浏览器 CORS / 混合内容限制。
// 前端以同源 POST 调用本函数，本函数转发到上游 HTTPS 接口并返回 JSON。

const UPSTREAM_HOST = 'miss.qingchengkg.cn';
// 上游 HTTPS 证书无效（不受信任），Cloudflare 回源会返回 526/525。
// 因此先试 HTTPS，失败或返回非 JSON 时自动回退 HTTP。
const ATTEMPTS = [`https://${UPSTREAM_HOST}/`, `http://${UPSTREAM_HOST}/`];

// 带回退的上游请求：任一scheme返回合法 JSON 文本即成功
async function fetchUpstream(formBody) {
  let lastErr = new Error('unreachable');
  for (const base of ATTEMPTS) {
    try {
      const r = await fetch(base, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': base,
        },
        body: formBody,
      });
      const text = await r.text();
      // Cloudflare 错误页是 HTML，据此判定回源失败并切换 scheme
      if (text && text.trim().startsWith('{')) return text;
      lastErr = new Error(`上游返回非 JSON（HTTP ${r.status}）`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

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
    const text = await fetchUpstream(body);
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
