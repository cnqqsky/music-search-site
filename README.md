# 音乐搜索器

多平台音乐聚合搜索、在线试听与逐字同步歌词。纯静态前端 + Cloudflare Pages Functions 同源代理（绕过上游 API 的 CORS 与混合内容限制）。

- 线上地址：<https://ms-dj4.pages.dev>
- 源码仓库：<https://github.com/cnqqsky/music-search-site>

## 功能

- **三种检索方式**：歌曲名（可带作者）、音乐 ID、详情页地址
- **13 个平台**：网易云、QQ、酷狗、酷我、千千、一听、咪咕、荔枝、蜻蜓、喜马拉雅、5sing 原创/翻唱、全民K歌
- **在线试听**：底部播放条，进度拖拽、音量、循环、播放列表
- **歌曲收藏**：结果卡片或播放器上点 ♡ 收藏，收藏夹固定展示在首页，点击即播，支持单首移除与一键清空（保存在 localStorage）
- **经典歌曲排行榜**：华语经典 20 首，点击自动以「歌名 + 歌手」检索并播放第一条结果
- **逐字同步歌词**：LRC 解析 + rAF 卡拉OK 扫色，支持 `[offset:]` 与手动微调，8 套配色可选
- **URL 带参直达**：`?name=关键词&type=netease`，搜索态可分享、可收藏

## 结构

```
public/                    部署目录：只有这里的内容会上传到 Pages
  index.html               页面 + SEO 元信息 + JSON-LD
  style.css / styles.css   样式（网易云风格毛玻璃播放条）
  app.js                   搜索/播放/歌词全部逻辑
  _headers                 Cloudflare 缓存策略
functions/                 Pages Functions（服务端路由，不随静态资源公开）
  api/search.js            搜索：网易云为主，酷狗补位
  api/url.js               单曲补链（播放失败时重试）
  api/lyric.js             歌词按需拉取
  api/dl.js                音频直链
  robots.txt.js            动态 robots.txt
  sitemap.xml.js           动态 sitemap.xml
scripts/                   调试/探测脚本（不部署）
dev.py                     本地预览服务
wrangler.toml              Pages 部署配置
```

## 部署

```bash
wrangler pages deploy public --project-name=ms --branch=main
```

两个易踩的坑：

1. **必须显式传 `--branch=main`**。不带该参数时 wrangler 会按本地 git 分支推断，
   容易部署到 `master` 预览分支上，而生产域名仍指向旧部署——表现为"改了线上没变"。
2. **部署目录必须是 `public`**。`.assetsignore` 对直传部署无效，
   只有目录隔离才能真正避免 `scripts/`、`README.md` 等开发文件被公网访问。

## 音源现状

- **网易云**：主音源，链路完整（搜索 / 取链 / 歌词 / 封面）。
  取链必须带 `Cookie: os=pc; appver=8.9.70`，否则返回 `code=-110`。
  服务节点在海外时，约三成曲目能直接取到 CDN 地址。
- **网易外链兜底（关键）**：`music.163.com/song/media/outer/url?id=<id>.mp3`
  无需 Cookie，会 302 到 `m*.music.126.net` CDN。
  **网易 CDN 本身不设地域限制**，被限制的只是"签发地址的 API"。
  因此服务端取不到地址时，把外链交给访客浏览器解析即可——中国境内访客可直接播放。
  实测可播率由 30% 提升到 **83%**（境外访客不受益，仍为 30%）。
- **酷狗**：第二音源，`sharefs.kugou.com` 的直链在海外可正常取流，与网易互补。
  缺点：按 IP 频控极严，超限后长期封禁（`errcode=1002`）。
  因此仅在网易可播结果不足时触发，命中即缓存 30 分钟，检测到封禁则熔断 10 分钟。
- **咪咕 / QQ / 酷我**：均已收紧，无法作为备选（详见 `scripts/` 下的探测记录）。

## 本地预览

```bash
python dev.py
# 打开 http://127.0.0.1:8000
```

## 说明

`index.html` 中的 `__SITE_ORIGIN__` 占位符由 `app.js` 的 `normalizeSeoMeta()` 在运行时替换为当前域名，无需手工修改。
