// Cloudflare Pages Function：/sitemap.xml（按请求来源动态生成）
export function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    { loc: origin + '/', priority: '1.0', changefreq: 'daily' },
    { loc: origin + '/#about', priority: '0.6', changefreq: 'monthly' },
    { loc: origin + '/#faq', priority: '0.6', changefreq: 'monthly' },
  ];

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      '  <url>\n' +
      '    <loc>' + u.loc + '</loc>\n' +
      '    <lastmod>' + today + '</lastmod>\n' +
      '    <changefreq>' + u.changefreq + '</changefreq>\n' +
      '    <priority>' + u.priority + '</priority>\n' +
      '  </url>'
    ).join('\n') + '\n' +
    '</urlset>\n';

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
