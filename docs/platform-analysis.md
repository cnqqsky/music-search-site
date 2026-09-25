# 音乐搜索平台分析报告

## 参考站点架构分析

### lmb520.cn 和 shagua.name
两个站点使用相同的开源项目（github.com/maicong/music），架构为：
- **纯前端代理**：前端 JS 发送 POST 请求到站点本身
- **后端转发**：服务端转发到各音乐平台 API，返回统一 JSON 格式

### 支持的音源平台

| 平台 | Type Key | 状态 | SongID 格式 | 备注 |
|------|----------|------|-------------|------|
| 网易云音乐 | `netease` | ✅ 可用 | 数字 (如 2652820720) | 需 Cookie |
| QQ音乐 | `qq` | ✅ 可用 | MID (如 0039MnYb0qxYhV) | 可生成播放链接 |
| 酷狗音乐 | `kugou` | ✅ 可用 | Hash (如 B3A52A...) | 已集成 |
| 酷我音乐 | `kuwo` | ✅ 可用 | 数字 ID | 可补充 |
| 一听音乐 | `1ting` | ⚠️ 有限 | 数字 ID | 结果少 |
| 百度音乐 | `baidu` | ❌ 不支持 | - | 已下线 |
| 咪咕音乐 | `migu` | ❌ 不支持 | - | 未实现 |
| 荔枝FM | `lizhi` | ❌ 不支持 | - | 未实现 |
| 蜻蜓FM | `qingting` | ❌ 不支持 | - | 未实现 |
| 喜马拉雅 | `ximalaya` | ❌ 不支持 | - | 未实现 |
| 5sing原创 | `5singyc` | ❌ 不支持 | - | 未实现 |
| 5sing翻唱 | `5singfc` | ❌ 不支持 | - | 未实现 |

### API 格式

**请求：**
```http
POST / HTTP/1.1
Host: www.shagua.name
Content-Type: application/x-www-form-urlencoded
X-Requested-With: XMLHttpRequest

input=晴天&filter=name&type=netease&page=1
```

**响应：**
```json
{
  "code": 200,
  "data": [
    {
      "type": "netease",
      "link": "http://music.163.com/#/song?id=2652820720",
      "songid": "2652820720",
      "title": "晴天(深情版)",
      "author": "Lucky小爱",
      "pic": "https://p2.music.126.net/xxx.jpg",
      "lrc": "[00:00.00] 暂无歌词"
    }
  ],
  "error": null
}
```

## 可行性分析

### 方案一：直接调用 shagua.name API（推荐）

**优点：**
- 已验证可用，接口稳定
- 统一 JSON 格式，易于解析
- 支持多平台搜索
- 无需自己维护各平台 API

**缺点：**
- 依赖第三方服务（可能挂掉）
- 需要处理 CORS（浏览器直接调用可能受限）
- 通过 CF 边缘可能被封

**实现方式：**
```javascript
// 前端直接调用（需要 CORS 配置）
async function searchMusic(keyword, platform = 'netease') {
  const form = new URLSearchParams({
    input: keyword,
    filter: 'name',
    type: platform,
    page: 1
  });
  
  const resp = await fetch('https://www.shagua.name/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: form
  });
  
  return await resp.json();
}
```

### 方案二：自建代理

**优点：**
- 不依赖第三方
- 可添加缓存、限流
- 可添加更多平台

**缺点：**
- 需要维护服务端
- 需要处理各平台反爬
- 增加复杂性

### 方案三：直接调用各平台 API

**优点：**
- 最直接，无中间层
- 可定制化

**缺点：**
- 各平台 API 不统一
- 很多需要 Cookie/签名
- 维护成本高

## 推荐方案

**短期：集成 shagua.name API**
- 前端直接调用（如果 CORS 允许）
- 或添加 CF Worker 代理

**长期：考虑自建代理**
- 使用 playwright/puppeteer 模拟浏览器
- 或直接逆向各平台 API

## 待验证

1. shagua.name 是否有 CORS 头
2. 直接从浏览器调用是否可行
3. 是否需要添加代理层
