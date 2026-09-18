# 音乐搜索器

多平台音乐聚合搜索、在线试听与逐字同步歌词。纯静态前端 + Cloudflare Pages Functions 同源代理（绕过上游 API 的 CORS 与混合内容限制）。

- 线上地址：<https://ms-dj4.pages.dev>
- 源码仓库：<https://github.com/cnqqsky/music-search-site>

## 功能

- **三种检索方式**：歌曲名（可带作者）、音乐 ID、详情页地址
- **13 个平台**：网易云、QQ、酷狗、酷我、千千、一听、咪咕、荔枝、蜻蜓、喜马拉雅、5sing 原创/翻唱、全民K歌
- **在线试听**：底部播放条，进度拖拽、音量、循环、播放列表
- **逐字同步歌词**：LRC 解析 + rAF 卡拉OK 扫色，支持 `[offset:]` 与手动微调，8 套配色可选
- **URL 带参直达**：`?name=关键词&type=netease`，搜索态可分享、可收藏

## 结构

```
index.html                 页面 + SEO 元信息 + JSON-LD
style.css                  样式（网易云风格毛玻璃播放条）
app.js                     搜索/播放/歌词全部逻辑
dev.py                     本地预览服务（含 robots/sitemap/manifest 路由）
functions/api/search.js    生产代理：搜索（转发上游 HTTPS）
functions/api/dl.js        生产代理：音频直链
functions/robots.txt.js    动态 robots.txt
functions/sitemap.xml.js   动态 sitemap.xml
_headers                   Cloudflare 缓存策略
wrangler.toml              Pages 部署配置
```

## 本地预览

```bash
python dev.py
# 打开 http://127.0.0.1:8000
```

`dev.py` 在本地同样提供 `/api/search`、`/api/dl` 同源代理，因此本地功能与线上一致。

## 部署

```bash
wrangler pages deploy . --project-name=ms
```

Pages 会自动识别 `functions/` 目录为服务端路由。

## 说明

`index.html` 中的 `__SITE_ORIGIN__` 占位符由 `app.js` 的 `normalizeSeoMeta()` 在运行时替换为当前域名，无需手工修改。
