// Cloudflare Pages Function：/robots.txt（按请求来源动态生成，域名无需硬编码）
export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const body =
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /api/\n' +
    '\n' +
    'Sitemap: ' + origin + '/sitemap.xml\n';

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
