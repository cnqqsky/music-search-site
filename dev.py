#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地开发服务器：托管静态站点并代理音乐搜索 API。
用法： python dev.py   然后浏览器打开 http://127.0.0.1:8000

- GET  /            静态文件（index.html / style.css / app.js ...）
- POST /api/search  转发到 https://miss.qingchengkg.cn/
- GET  /api/dl      代理第三方音频下载，强制附件形式返回
- GET  /robots.txt  SEO 抓取规则（动态生成，与 Pages Functions 一致）
- GET  /sitemap.xml 站点地图（动态生成）
"""
import os
import sys
import ssl
import json
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
UPSTREAM = "https://miss.qingchengkg.cn/"
PORT = int(os.environ.get("PORT", "8000"))

CT = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".mp3": "audio/mpeg",
}


def proxy_search(body_bytes):
    req = urllib.request.Request(
        UPSTREAM, data=body_bytes, method="POST",
        headers={
            "User-Agent": "Mozilla/5.0",
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            "Referer": UPSTREAM,
        },
    )
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
        return r.status, r.read()


def proxy_dl(target_url):
    referer = urllib.parse.urlparse(target_url).scheme + "://" + urllib.parse.urlparse(target_url).netloc
    req = urllib.request.Request(target_url, headers={
        "User-Agent": "Mozilla/5.0",
        "Referer": referer,
    })
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return urllib.request.urlopen(req, timeout=60, context=ctx)


class Handler(BaseHTTPRequestHandler):
    server_version = "MusicSearchDev/1.0"

    def log_message(self, fmt, *args):
        sys.stderr.write("[dev] " + (fmt % args) + "\n")

    def _send(self, code, data, ctype, extra=None):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra:
            for k, v in extra.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, b"", "text/plain", {
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        # SEO 路由（与 Cloudflare Pages Functions 行为一致，按访问来源动态生成）
        if parsed.path == "/robots.txt":
            origin = "http://" + (self.headers.get("Host") or "127.0.0.1:%d" % PORT)
            self._send(200, "User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: %s/sitemap.xml\n" % origin,
                       "text/plain; charset=utf-8")
            return
        if parsed.path == "/sitemap.xml":
            origin = "http://" + (self.headers.get("Host") or "127.0.0.1:%d" % PORT)
            today = time.strftime("%Y-%m-%d")
            urls = [("/", "1.0", "daily"), ("/#about", "0.6", "monthly"), ("/#faq", "0.6", "monthly")]
            body = ['<?xml version="1.0" encoding="UTF-8"?>',
                    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
            for loc, pri, freq in urls:
                body += ["  <url>", "    <loc>%s%s</loc>" % (origin, loc),
                         "    <lastmod>%s</lastmod>" % today,
                         "    <changefreq>%s</changefreq>" % freq,
                         "    <priority>%s</priority>" % pri, "  </url>"]
            body += ["</urlset>", ""]
            self._send(200, "\n".join(body), "application/xml; charset=utf-8")
            return
        if parsed.path == "/api/dl":
            q = urllib.parse.parse_qs(parsed.query)
            target = (q.get("u") or [""])[0]
            name = (q.get("name") or ["audio"])[0]
            if not target or not target.startswith("http"):
                self._send(400, "missing/invalid u", "text/plain")
                return
            try:
                up = proxy_dl(target)
                fname = urllib.parse.quote((name or "audio").replace("/", "_") + ".mp3")
                self.send_response(200)
                self.send_header("Content-Type", up.headers.get("Content-Type", "audio/mpeg"))
                self.send_header("Content-Disposition",
                                 'attachment; filename="audio.mp3"; filename*=UTF-8\'\'' + fname)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                while True:
                    chunk = up.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                up.close()
            except Exception as e:
                self._send(502, "fetch failed: " + str(e), "text/plain")
            return
        # 静态文件
        self.serve_static(parsed.path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            length = int(self.headers.get("Content-Length", 0) or 0)
            body = self.rfile.read(length) if length else b""
            try:
                status, data = proxy_search(body)
                self._send(200, data, "application/json; charset=utf-8")
            except Exception as e:
                self._send(502, json.dumps({"code": 500, "error": "上游请求失败：" + str(e)},
                                            ensure_ascii=False), "application/json; charset=utf-8")
            return
        self._send(404, "not found", "text/plain")

    def serve_static(self, path):
        if path in ("/", ""):
            path = "/index.html"
        # 防目录穿越
        rel = urllib.parse.unquote(path).lstrip("/")
        full = os.path.normpath(os.path.join(ROOT, rel))
        if not full.startswith(ROOT) or not os.path.isfile(full):
            self._send(404, "404 Not Found", "text/plain")
            return
        ext = os.path.splitext(full)[1].lower()
        ctype = CT.get(ext, "application/octet-stream")
        try:
            with open(full, "rb") as f:
                data = f.read()
            self._send(200, data, ctype)
        except Exception as e:
            self._send(500, "read error: " + str(e), "text/plain")


def main():
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"音乐搜索器 · 本地服务已启动: http://127.0.0.1:{PORT}")
    print(f"静态目录: {ROOT}")
    print("按 Ctrl+C 停止")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
        httpd.shutdown()


if __name__ == "__main__":
    main()
