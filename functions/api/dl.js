// Cloudflare Pages Function: /api/dl?u=<音频地址>&name=<文件名>
// 代理下载：以同源方式拉取第三方音频并强制以附件形式返回，
// 解决跨域 <a download> 失效、以及混合内容的问题。

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const target = url.searchParams.get('u');
  let name = url.searchParams.get('name') || 'audio';

  if (!target) {
    return new Response('missing param: u', { status: 400 });
  }
  // 仅允许 http/https
  if (!/^https?:\/\//i.test(target)) {
    return new Response('invalid param: u', { status: 400 });
  }
  // 清理文件名，避免路径穿越
  name = name.replace(/[\\/:*?"<>|\r\n\t]/g, '_').slice(0, 80) || 'audio';
  const filename = encodeURIComponent(name + '.mp3');

    try {
        const referer = new URL(target).origin;
    // 部分音频源证书无效（Cloudflare 回源 526），失败时降级为 http 再试一次
    const candidates = target.toLowerCase().startsWith('https://')
      ? [target, target.replace(/^https:\/\//i, 'http://')]
      : [target];
    let upstream = null;
    let lastErr = null;
    for (const u of candidates) {
      try {
        const r = await fetch(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'Referer': referer,
          },
        });
        if (r.ok) { upstream = r; break; }
        lastErr = new Error('upstream error: ' + r.status);
      } catch (e) {
        lastErr = e;
      }
    }
    if (!upstream) {
      return new Response((lastErr && lastErr.message) || 'fetch failed', { status: 502 });
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'audio/mpeg',
        'Content-Disposition': "attachment; filename=\"audio.mp3\"; filename*=UTF-8''" + filename,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new Response('fetch failed: ' + e.message, { status: 502 });
  }
}
