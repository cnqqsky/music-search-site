'use strict';

// 音源：网易云 + 酷狗 双链路自建。
// 原先依赖的第三方聚合接口 miss.qingchengkg.cn 已下线；
// 实测后可长期跑通「搜索→直链」的公开链路只剩这两条，且二者曲目互补。
const PLAT_NAME = { netease: '网易云', kugou: '酷狗' };
const NOPIC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56'%3E%3Crect width='56' height='56' fill='%23e6e8ef'/%3E%3C/svg%3E";

// 状态
const state = {
  filter: 'name',   // name | id | url
  type: 'netease',  // 平台
  page: 1,
  items: [],
  loading: false,
  currentId: null,
  currentItem: null,
  lrc: [],
  lrcOpen: false,
  lrcFileOffset: 0,   // LRC 文件内 [offset:] 声明的偏移（秒）
  lrcOffset: 0,       // 用户手动微调（秒），持久化
  layout: 'inline', // inline = 内嵌歌词播放器 | bar = 底部条+悬浮歌词面板
  visitorCN: false, // 由服务端按访客 IP 下发，决定外链提示文案
};

// DOM
const $ = (id) => document.getElementById(id);
const tabsEl = $('tabs');
const platformsEl = $('platforms');
const formEl = $('searchForm');
const keywordEl = $('keyword');
const searchBtn = $('searchBtn');
const hintEl = $('hint');
const resultsEl = $('results');
const resultsMsg = $('resultsMsg');
const loadMoreWrap = $('loadMoreWrap');
const loadMoreBtn = $('loadMore');

const playerBar = $('playerBar');
const audio = $('audio');
const pbCover = $('pbCover');
const pbTitle = $('pbTitle');
const pbAuthor = $('pbAuthor');
const pbPlay = $('pbPlay');
const pbPrev = $('pbPrev');
const pbNext = $('pbNext');
const pbSpeedBtn = $('pbSpeedBtn');
const pbLinkBtn = $('pbLinkBtn');
const pbProgress = $('pbProgress');
const pbFill = $('pbFill');
const pbTime = $('pbTime');
const pbVolBtn = $('pbVolBtn');
const pbVolPop = $('pbVolPop');
const pbVolSlider = $('pbVolSlider');
const pbLoopBtn = $('pbLoopBtn');
const pbListBtn = $('pbListBtn');
const pbLrcBtn = $('pbLrcBtn');
const pbOffsetBtn = $('pbOffsetBtn');
const pbOffsetPop = $('pbOffsetPop');
const pbOffsetVal = $('pbOffsetVal');
const pbColorBtn = $('pbColorBtn');
const pbColorPop = $('pbColorPop');
const pbColorInput = $('pbColorInput');
const lrcPanel = $('lrcPanel');
const lrcTitle = $('lrcTitle');
const lrcClose = $('lrcClose');
const lrcBody = $('lrcBody');
const pbInlineLrc = $('pbInlineLrc');
const pbLayoutBtn = $('pbLayoutBtn');
const listPanel = $('listPanel');
const listClose = $('listClose');
const listBody = $('listBody');

const pbFavBtn = $('pbFavBtn');
const favSection = $('favSection');
const favList = $('favList');
const favEmpty = $('favEmpty');
const favCount = $('favCount');
const favClear = $('favClear');

const detailPanel = $('detailPanel');
const detailBack = $('detailBack');
const dName = $('dName');
const dAuthor = $('dAuthor');
const dSongid = $('dSongid');
const dLink = $('dLink');
const dLinkOpen = $('dLinkOpen');
const dSrc = $('dSrc');
const dLrc = $('dLrc');

const SITE_TITLE = document.title;

// 占位符
const PLACEHOLDERS = {
  name: '例如：不要说话 陈奕迅',
  id:   '例如：25906124',
  url:  '例如：https://music.163.com/#/song?id=25906124',
};

// ---------- 切换平台（同时更新 chips 选中态） ----------// ---------- 收藏（localStorage，首页展示） ----------
const FAV_KEY = 'ms_favorites';
const FAV_MAX = 100;          // 收藏上限，避免 localStorage 爆掉
let favorites = [];

// 收藏唯一键：平台 + 曲目 ID（退化为链接 / 地址）
function favKey(it) {
  return String(it.type || '') + '|' + String(it.songid || it.link || it.url || it.title || '');
}

function loadFavorites() {
  try {
    const arr = JSON.parse(localStorage.getItem(FAV_KEY));
    favorites = Array.isArray(arr) ? arr.filter(x => x && (x.url || x.songid)) : [];
  } catch (e) {
    favorites = [];
  }
}

function saveFavorites() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(favorites));
    return true;
  } catch (e) {
    // 超出配额：提示并回滚最后一次修改
    favorites = favorites.slice(0, Math.max(0, favorites.length - 1));
    try { localStorage.setItem(FAV_KEY, JSON.stringify(favorites)); } catch (_) {}
    showHint('本地存储空间不足，已保留部分收藏', 'error');
    return false;
  }
}

function isFavorite(it) {
  const k = favKey(it);
  return favorites.some(f => favKey(f) === k);
}

// 存入收藏时裁掉过大的歌词，避免占用过多本地存储
function favPayload(it) {
  return {
    type: it.type || '',
    songid: it.songid || '',
    title: it.title || '',
    author: it.author || '',
    link: it.link || '',
    url: it.url || '',
    pic: it.pic || '',
    lrc: (it.lrc && it.lrc.length > 6000) ? it.lrc.slice(0, 6000) : (it.lrc || ''),
  };
}

function toggleFavorite(it) {
  if (!it) return false;
  const k = favKey(it);
  const idx = favorites.findIndex(f => favKey(f) === k);
  if (idx >= 0) {
    favorites.splice(idx, 1);
    saveFavorites();
    renderFavorites();
    syncFavButtons();
    return false;
  }
  if (favorites.length >= FAV_MAX) {
    showHint('收藏已达上限 ' + FAV_MAX + ' 首，请先移除一些', 'error');
    return false;
  }
  favorites.unshift(favPayload(it));
  saveFavorites();
  renderFavorites();
  syncFavButtons();
  return true;
}

function renderFavorites() {
  const has = favorites.length > 0;
  favEmpty.classList.toggle('hidden', has);
  favClear.classList.toggle('hidden', !has);
  favCount.textContent = has ? favorites.length + ' 首' : '';
  if (!has) { favList.innerHTML = ''; return; }

  favList.innerHTML = favorites.map((f, i) => `
    <li class="fav-item" data-idx="${i}">
      <button class="fav-play" type="button" data-idx="${i}" aria-label="播放 ${esc(f.title || '未知')} - ${esc(f.author || '未知')}">
        <img class="fav-cover" src="${esc(f.pic || NOPIC)}" alt="" loading="lazy" onerror="this.src='${NOPIC}'">
        <span class="fav-info">
          <span class="fav-title">${esc(f.title || '未知曲目')}</span>
          <span class="fav-author">${esc(f.author || '未知歌手')}</span>
        </span>
        <span class="fav-plat">${esc(PLAT_NAME[f.type] || f.type || '')}</span>
      </button>
      <button class="fav-del" type="button" data-idx="${i}" aria-label="取消收藏 ${esc(f.title || '')}">✕</button>
    </li>`).join('');
}

// 同步「结果卡片 + 播放器」上的收藏按钮状态
function syncFavButtons() {
  resultsEl.querySelectorAll('.result-card').forEach(card => {
    const it = state.items.find(x => String(x._uid) === String(card.dataset.uid));
    if (!it) return;
    const btn = card.querySelector('.rc-btn.fav');
    if (!btn) return;
    const on = isFavorite(it);
    btn.classList.toggle('active', on);
    btn.textContent = on ? '♥' : '♡';
    btn.setAttribute('aria-pressed', String(on));
  });
  const cur = state.currentItem;
  const on = !!cur && isFavorite(cur);
  pbFavBtn.classList.toggle('fav-on', on);
  pbFavBtn.textContent = on ? '♥' : '♡';
  pbFavBtn.setAttribute('aria-pressed', String(on));
}

// 播放收藏：确保进入播放列表（搜索结果为空时也能播）
function playFavorite(i) {
  const f = favorites[i];
  if (!f) return;
  if (!f.url) { showHint('该收藏缺少播放地址，请重新搜索收藏', 'error'); return; }
  let it = state.items.find(x => favKey(x) === favKey(f));
  if (!it) {
    it = Object.assign({}, f, { _uid: favKey(f) });
    state.items.push(it);
  }
  const card = resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(String(it._uid))}"]`);
  playItem(it, card);
  renderPlaylist();
}

// ---------- 音源状态条（网易云 + 酷狗 双音源并行，无需手工切换） ----------
function renderPlatforms() {
  platformsEl.innerHTML = '';
  const note = document.createElement('div');
  note.className = 'src-note';
  note.innerHTML =
    '<span class="src-badge">网易云</span>' +
    '<span class="src-badge">酷狗</span>' +
    '<span class="src-tip">两个音源同时检索，结果合并去重，可播放的版本排在前面</span>';
  platformsEl.appendChild(note);
  platformsEl.removeAttribute('role');
  platformsEl.removeAttribute('aria-label');
}

// ---------- Tab 切换 ----------
function setFilter(f) {
  state.filter = f;
  const btns = [...tabsEl.children];
  btns.forEach(t => {
    const on = t.dataset.filter === f;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  // 音源为单一来源，任何检索方式下都常驻显示
  keywordEl.placeholder = PLACEHOLDERS[f];
  keywordEl.pattern = f === 'name' ? '.+' : (f === 'id' ? '[\\w\\/|]+' : 'https?:\\/\\/\\S+');
  clearHint();
}

tabsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  setFilter(btn.dataset.filter);
});

// ---------- 搜索 ----------
formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  doSearch(false);
});

function setLoading(on) {
  state.loading = on;
  searchBtn.disabled = on;
  searchBtn.textContent = on ? '搜索中…' : '搜索';
}

function showHint(msg, kind) {
  hintEl.textContent = msg || '';
  hintEl.className = 'hint' + (kind ? ' ' + kind : '');
}
function clearHint() { showHint(''); }

// 顶部说明：告知有多少曲目需走外链兜底，避免用户误以为是站点故障
// 外链由访客浏览器解析（服务端 302 到 CDN），中国境内可正常播放。
function renderRestrictedNotice(list) {
  const total = list.length;
  const direct = list.filter(x => x.url).length;   // 服务端已取到 CDN 直链
  const viaOuter = list.filter(x => !x.url && x.outer).length;
  const blocked = total - direct - viaOuter;
  if (!viaOuter && !blocked) { setMsg(''); return; }

  const outerWord = state.visitorCN ? '将通过网易外链播放' : '需在中国境内网络下才能播放';
  if (direct === 0 && viaOuter === 0) {
    setMsg(
      '<div class="notice">本次 <strong>全部 ' + total + ' 首</strong>均未取到播放地址，' +
      '两个音源在当前服务节点都受版权限制。可换用网易云音乐、酷狗音乐官方客户端收听，或换个关键词重试。</div>'
    );
  } else if (blocked === 0) {
    setMsg(
      '<div class="notice">其中 <strong>' + viaOuter + ' 首</strong>服务端未取到直链，' + outerWord + '。</div>'
    );
  } else {
    setMsg(
      '<div class="notice">其中 <strong>' + viaOuter + ' 首</strong>' + outerWord +
      '；另有 <strong>' + blocked + ' 首</strong>暂无可用地址，已排在结果末尾。</div>'
    );
  }
}

function setMsg(html) { resultsMsg.innerHTML = html || ''; }

function showSkeleton(n) {
  resultsEl.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const li = document.createElement('li');
    li.className = 'result-card skeleton';
    li.setAttribute('aria-hidden', 'true');
    li.innerHTML = `
      <div class="sk sk-cover"></div>
      <div class="rc-main">
        <div class="sk sk-line w1"></div>
        <div class="sk sk-line w2"></div>
      </div>
      <div class="sk sk-btn"></div>`;
    resultsEl.appendChild(li);
  }
}

async function doSearch(append) {
  if (state.loading) return;
  const input = keywordEl.value.trim();
  if (!input) { showHint('请输入搜索内容', 'error'); return; }

  if (!append) {
    state.page = 1;
    state.items = [];
    resultsEl.innerHTML = '';
    setMsg('');
    loadMoreWrap.classList.add('hidden');
    showSkeleton(5);           // 骨架屏：避免结果返回前布局跳动
  }
  clearHint();
  setLoading(true);

  const filter = state.filter;
  const type = 'netease';   // 单一音源，保留字段以兼容后端协议

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ input, filter, type, page: String(state.page) }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const j = await resp.json();

    // 服务端按访客 IP 判定是否在中国境内，用于外链提示文案
    if (typeof j.visitorCN === 'boolean') state.visitorCN = j.visitorCN;

    if (j.code === 200 && Array.isArray(j.data) && j.data.length) {
      j.data.forEach(it => {
        it._uid = it.songid || it.link || (Math.random().toString(36).slice(2));
        state.items.push(it);
      });
      renderRestrictedNotice(j.data);
      resultsEl.innerHTML = '';
      renderItems(j.data, append);
      loadMoreWrap.classList.toggle('hidden', j.data.length < 10);
      updateSearchMeta(input, type);
    } else if (!append) {
      resultsEl.innerHTML = '';
      setMsg(
        '<div class="empty">没有找到相关音乐。<br>' +
        '试试只输入歌名（如 <code>晴天</code>），或把「歌名 + 歌手」一起输入；<br>' +
        '若已知道曲目编号，可切换到「音乐 ID」精确查找。</div>'
      );
      loadMoreWrap.classList.add('hidden');
    } else {
      loadMoreWrap.classList.add('hidden');
    }
  } catch (err) {
    if (!append) {
      resultsEl.innerHTML = '';
      setMsg('<div class="empty">请求失败：' + esc(err.message || err) + '</div>');
    }
    showHint('请求失败：' + (err.message || err), 'error');
  } finally {
    setLoading(false);
  }
}

// 搜索后同步标题 / 描述 / 结构化数据（利于分享与收录）
function updateSearchMeta(keyword, type) {
  const plat = '网易云 · 酷狗';
  const title = keyword + ' - ' + plat + '音乐搜索结果 · 音乐搜索器';
  const desc = '「' + keyword + '」在' + plat + '的搜索结果，共 ' + state.items.length +
    ' 条，支持在线试听、逐字同步歌词与曲目信息复制。';
  document.title = title;
  let d = document.querySelector('meta[name="description"]');
  if (!d) {
    d = document.createElement('meta');
    d.setAttribute('name', 'description');
    document.head.appendChild(d);
  }
  d.setAttribute('content', desc);
  let ogT = document.querySelector('meta[property="og:title"]');
  if (ogT) ogT.setAttribute('content', title);
  let ogD = document.querySelector('meta[property="og:description"]');
  if (ogD) ogD.setAttribute('content', desc);
  renderResultsJsonLd(keyword);
}

// 结果列表结构化数据（ItemList + MusicRecording）
function renderResultsJsonLd(keyword) {
  const old = document.getElementById('ld-results');
  if (old) old.remove();
  if (!state.items.length) return;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '「' + keyword + '」音乐搜索结果',
    numberOfItems: state.items.length,
    itemListElement: state.items.slice(0, 20).map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'MusicRecording',
        name: it.title || '',
        byArtist: { '@type': 'MusicGroup', name: it.author || '' },
        url: it.link || undefined,
        image: it.pic || undefined,
      },
    })),
  };
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'ld-results';
  s.textContent = JSON.stringify(data);
  document.head.appendChild(s);
}

function renderItems(list, append) {
  if (!append) resultsEl.innerHTML = '';
  list.forEach(it => {
    const li = document.createElement('li');
    li.className = 'result-item';
    li.appendChild(buildCard(it));
    resultsEl.appendChild(li);
  });
  renderPlaylist();
}

function renderPlaylist() {
  if (!state.items.length) {
    listBody.innerHTML = '<div class="list-empty">暂无歌曲</div>';
    return;
  }
  listBody.innerHTML = state.items.map((it, i) => {
    const active = it._uid === state.currentId ? ' active' : '';
    return `
      <div class="list-item${active}" data-uid="${esc(it._uid)}" data-idx="${i}">
        <img class="list-item-cover" src="${esc(it.pic || NOPIC)}" alt="" onerror="this.src='${NOPIC}'">
        <div class="list-item-info">
          <div class="list-item-title">${esc(it.title || '暂无')}</div>
          <div class="list-item-author">${esc(it.author || '')}</div>
        </div>
        <div class="list-item-plat">${esc(PLAT_NAME[it.type] || it.type || '')}</div>
      </div>`;
  }).join('');
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildCard(it) {
  const card = document.createElement('article');
  card.className = 'result-card';
  card.dataset.uid = it._uid;

  const cover = it.pic || NOPIC;
  const title = esc(it.title || '暂无');
  const author = esc(it.author || '暂无');
  const plat = PLAT_NAME[it.type] || it.type || '';
  // 播放源优先级：服务端直链 > 网易外链（由访客浏览器解析）
  const hasUrl = !!it.url;
  const hasOuter = !!it.outer;
  const canTry = hasUrl || hasOuter;
  // 只有「既无直链也无外链」才算真正不可播
  const restricted = !!it.restricted && !hasOuter;
  const viaOuter = !hasUrl && hasOuter;
  const brLabel = it.br ? Math.round(it.br / 1000) + 'k' : '';
  const altText = esc((it.title || '音乐') + (it.author ? ' - ' + it.author : '') + ' 封面');

  const faved = isFavorite(it);
  card.innerHTML = `
    <img class="rc-cover${restricted ? ' dim' : ''}" src="${esc(cover)}" alt="${altText}" loading="lazy" decoding="async" width="56" height="56" onerror="this.src='${NOPIC}'">
    <div class="rc-main">
      <h3 class="rc-title">${title}<span class="rc-badge">${esc(plat)}</span>${brLabel ? '<span class="rc-br">' + esc(brLabel) + '</span>' : ''}${restricted ? '<span class="rc-restricted">地区限制</span>' : ''}${viaOuter && !state.visitorCN ? '<span class="rc-restricted">需境内网络</span>' : ''}</h3>
      <div class="rc-author">${author}</div>
    </div>
    <div class="rc-actions">
      <button class="rc-btn fav${faved ? ' active' : ''}" type="button" aria-pressed="${faved}"
              aria-label="${faved ? '取消收藏' : '收藏'} ${title} - ${author}">${faved ? '♥' : '♡'}</button>
      <button class="rc-btn play${hasUrl ? '' : ' retry'}" type="button"
              aria-label="${canTry ? '试听' : '暂无可用播放地址'} ${title} - ${author}">${canTry ? '试听' : '无法播放'}</button>
    </div>`;

  const playBtn = card.querySelector('.rc-btn.play');
  if (canTry) {
    playBtn.addEventListener('click', () => playItem(it, card));
    if (viaOuter) {
      playBtn.title = state.visitorCN
        ? '将通过网易外链播放（由你的网络解析地址）'
        : '服务端无法获取地址，将尝试网易外链；该外链通常仅在中国境内可用';
    }
  } else {
    playBtn.disabled = true;
    playBtn.title = '暂无可用播放地址';
  }

  card.querySelector('.rc-btn.fav').addEventListener('click', () => {
    const added = toggleFavorite(it);
    showHint(added ? '已加入收藏：' + (it.title || '') : '已取消收藏：' + (it.title || ''));
  });
  return card;
}

// ---------- 播放 ----------
// 播放源优先级：服务端直链 > 网易外链
// 外链会 302 到 CDN，由访客网络解析；中国境内有效，境外通常被拦截。
function pickSource(it) {
  return it.url || it.outer || '';
}

// 列表里未取到直链的曲目，点播放时再单曲补链重试一次
async function ensureUrl(it) {
  if (it.url) return true;
  if (it.outer) return true;              // 有外链即可直接尝试，无需请求服务端
  const id = it.songid;
  if (!id) return false;
  try {
    const r = await fetch('/api/url?id=' + encodeURIComponent(id));
    const j = await r.json();
    if (j.code === 200 && j.data && j.data.url) {
      it.url = j.data.url;
      it.br = j.data.br || 0;
      return true;
    }
  } catch (e) { /* 沿用失败态 */ }
  return false;
}

async function playItem(it, card) {
  // 高亮
  resultsEl.querySelectorAll('.result-card').forEach(c => c.classList.remove('playing'));
  if (card) card.classList.add('playing');

  playItemCore(it);

  const ok = await ensureUrl(it);
  if (!ok) {
    showHint('《' + (it.title || '该曲目') + '》暂无可用播放地址，可能是版权限制，换一首试试', 'error');
    pbPlay.textContent = '▶';
    return;
  }
  startPlayback(it, card);
}

// 先切歌信息，避免等待补链时界面无反馈
function playItemCore(it) {
  state.currentId = it._uid;
  state.currentItem = it;
  pbCover.src = it.pic || NOPIC;
  pbTitle.textContent = it.title || '暂无';
  pbAuthor.textContent = it.author || '';
  playerBar.classList.remove('hidden');
  pbPlay.textContent = '⏸';
  pbFill.style.width = '0%';
  renderPlaylist();
  setDetail(it);
  loadLyrics(it);
  syncFavButtons();
}

function startPlayback(it, card) {
  if (card) {
    const btn = card.querySelector('.rc-btn.play');
    if (btn) { btn.textContent = '播放中'; btn.disabled = false; }
  }
  it._triedOuter = false;
  audio.src = pickSource(it);
  audio.play().catch(() => {});
}

function fmtTime(s) {
  if (!isFinite(s)) s = 0;
  s = Math.floor(s);
  const p = n => String(n).padStart(2, '0');
  return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s % 3600 / 60)) + ':' + p(s % 60);
}

// ---------- 歌词 ----------
// 标准 LRC 解析：支持行首多时间戳、[offset:±ms] 全局偏移
function parseLRC(text) {
  const out = [];
  let fileOffset = 0;
  const offRe = /^\[offset:\s*([+-]?\d+)\s*\]$/i;
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const om = line.match(offRe);
    if (om) { fileOffset += parseInt(om[1], 10) / 1000; return; }

    const times = [];
    let end = 0;
    const tsRe = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
    let m;
    while ((m = tsRe.exec(line)) !== null) {
      times.push(
        parseInt(m[1], 10) * 60 +
        parseInt(m[2], 10) +
        parseInt(m[3].padEnd(3, '0'), 10) / 1000
      );
      end = m.index + m[0].length;
    }
    if (!times.length) return;
    const txt = line.slice(end).trim();
    if (!txt) return;
    times.forEach(t => out.push({ time: t, text: txt }));
  });
  return { lines: out.sort((a, b) => a.time - b.time), offset: fileOffset };
}

// 歌词时间轴：音频时间 + 文件偏移 + 用户微调
function lrcNow() {
  return audio.currentTime + (state.lrcFileOffset || 0) + (state.lrcOffset || 0);
}

// 二分查找当前句，精确到帧，不做模糊提前
function currentLrcIndex(t) {
  const arr = state.lrc;
  let lo = 0, hi = arr.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].time <= t) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return idx;
}

async function loadLyrics(it) {
  state.lrc = [];
  state.lrcFileOffset = 0;
  lrcBody.innerHTML = '<div class="lrc-empty">暂无歌词</div>';
  pbInlineLrc.innerHTML = '<div class="lrc-empty">暂无歌词</div>';
  lrcBody.dataset.lrcIdx = '';
  pbInlineLrc.dataset.lrcIdx = '';
  lrcTitle.textContent = (it.title || '歌词') + (it.author ? ' - ' + it.author : '');
  pbLrcBtn.classList.remove('active');
  lrcPanel.classList.add('hidden');
  if (!it.songid) return;
  // 酷狗歌词为加密 krc，且 songid 是 32 位 hash，不能走网易歌词接口
  if (it.type && it.type !== 'netease') return;

  // 歌词按需拉取：搜索列表不再等待歌词，列表返回更快
  let text = '';
  try {
    const r = await fetch('/api/lyric?id=' + encodeURIComponent(it.songid));
    const j = await r.json();
    text = (j.code === 200 && j.data && j.data.lrc) || '';
  } catch (e) { return; }

  setDetailLrc(text);
  if (!text) return;

  try {
    const parsed = parseLRC(text);
    if (!parsed.lines.length) return;
    state.lrc = parsed.lines;
    state.lrcFileOffset = parsed.offset;
    renderLyrics();
    // 按当前布局呈现：内嵌播放器 或 右侧悬浮面板（容器可见后滚动定位才准确）
    if (state.layout === 'inline') showInlineLrc(true);
    else toggleLrcPanel(true);
    syncLyrics();
  } catch (e) { /* 忽略 */ }
}

// 歌词到达后回填「当前曲目信息」面板（此前占位为暂无歌词）
function setDetailLrc(lrc) {
  const text = normLrc(lrc);
  dLrc.value = text.split('\n')[0];
  dLrc.dataset.full = text;
}

function renderLyrics() {
  if (!state.lrc.length) return;
  const html = state.lrc.map((line, i) => `<div class="ktv-line" data-i="${i}">${esc(line.text) || '· · ·'}</div>`).join('');
  lrcBody.innerHTML = html;
  pbInlineLrc.innerHTML = html;   // 内嵌播放器共用同一份歌词
}

// KTV 逐字着色：按「当前句 → 下一句」的时间跨度推进 --p（0% ~ 100%）
let ktvRunning = false;
function startKaraoke() {
  if (ktvRunning || audio.paused || !state.lrc.length) return;
  ktvRunning = true;
  requestAnimationFrame(karaokeTick);
}

function karaokeTick() {
  if (audio.paused || !state.lrc.length) { ktvRunning = false; return; }
  const t = lrcNow();
  const idx = currentLrcIndex(t);
  if (idx >= 0) {
    const start = state.lrc[idx].time;
    const next = idx + 1 < state.lrc.length ? state.lrc[idx + 1].time : start + 6;
    const end = Math.min(next, audio.duration || next);
    // 扫色时长取「本句→下一句」，长间奏封顶 6s，避免爬行或瞬闪
    const span = Math.min(Math.max(end - start, 0.4), 6);
    const p = Math.max(0, Math.min(1, (t - start) / span)) * 100;
    [lrcBody, pbInlineLrc].forEach(box => {
      if (!box.clientHeight) return;   // 容器不可见时跳过
      const el = box.querySelector(`.ktv-line[data-i="${idx}"]`);
      if (el) el.style.setProperty('--p', p.toFixed(1) + '%');
    });
  }
  requestAnimationFrame(karaokeTick);
}

function syncLyrics() {
  if (!state.lrc.length || !audio.duration) return;
  const idx = currentLrcIndex(lrcNow());
  [lrcBody, pbInlineLrc].forEach(box => {
    if (!box.clientHeight) return;   // 容器不可见时跳过滚动
    const lines = box.querySelectorAll('.ktv-line');
    lines.forEach((el, i) => {
      el.classList.toggle('active', i === idx);
      el.classList.toggle('done', i < idx);
      if (i !== idx) el.style.setProperty('--p', i < idx ? '100%' : '0%');
    });
    // 仅在当前句变化时滚动，避免每帧抖动
    if (idx >= 0 && box.dataset.lrcIdx != String(idx)) {
      box.dataset.lrcIdx = String(idx);
      const line = lines[idx];
      const top = line.offsetTop - box.clientHeight / 2 + line.clientHeight / 2;
      box.scrollTo({ top, behavior: 'smooth' });
    }
  });
  startKaraoke();
}

// ---------- 详情面板（对齐目标站结果页字段） ----------
function normLrc(lrc) {
  if (!lrc) return '[00:00.00] 暂无歌词';
  if (!/\[00:(\d{2})\./.test(lrc)) return '[00:00.00] 无效歌词';
  return lrc;
}

function setDetail(data) {
  const title = data.title || '暂无';
  const author = data.author || '暂无';

  dName.value = title;
  dAuthor.value = author;
  dSongid.value = data.songid || '';
  dLink.value = data.link || '';
  dLinkOpen.href = data.link || '#';
  dSrc.value = data.url || '';

  setDetailLrc(data.lrc || '');

  detailPanel.classList.remove('hidden');
}

async function copyText(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // 降级：选中并提示手动复制
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_) {}
    ta.remove();
  }
  const old = btn.textContent;
  btn.textContent = '已复制';
  setTimeout(() => { btn.textContent = old; }, 1200);
}

detailPanel.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-copy]');
  if (!btn) return;
  const el = $(btn.dataset.copy);
  if (!el) return;
  const text = el.dataset.full || el.value;
  if (text) copyText(text, btn);
});

detailBack.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
  keywordEl.focus();
});

// ---------- 音量 ----------
function setVolumeIcon(vol) {
  pbVolBtn.textContent = vol === 0 ? '🔇' : vol < 0.4 ? '🔈' : vol < 0.75 ? '🔉' : '🔊';
}

function applyVolume(v, persist) {
  v = Math.max(0, Math.min(1, v));
  audio.volume = v;
  pbVolSlider.value = v;
  setVolumeIcon(v);
  if (persist) localStorage.setItem('ms_volume', String(v));
}

(function initVolume() {
  const saved = parseFloat(localStorage.getItem('ms_volume'));
  applyVolume(isNaN(saved) ? 1 : saved, false);
})();

pbVolBtn.addEventListener('click', () => {
  pbVolPop.classList.toggle('hidden');
});

pbVolSlider.addEventListener('input', () => {
  applyVolume(parseFloat(pbVolSlider.value), true);
});

function toggleLrcPanel(show) {
  const shouldShow = show == null ? lrcPanel.classList.contains('hidden') : show;
  lrcPanel.classList.toggle('hidden', !shouldShow);
  pbLrcBtn.classList.toggle('active', shouldShow);
}

// 内嵌歌词区（inline 布局）显示/收起
function showInlineLrc(show) {
  pbInlineLrc.classList.toggle('hidden', !show);
  syncBodyPadding();
  if (show) syncLyrics();
}

// 内嵌歌词展开时播放器变高，预留底部留白；收起则还原
function syncBodyPadding() {
  const tall = state.layout === 'inline' && !pbInlineLrc.classList.contains('hidden');
  document.body.classList.toggle('inline-player', tall);
}

pbLrcBtn.addEventListener('click', () => toggleLrcPanel());

lrcClose.addEventListener('click', () => toggleLrcPanel(false));

// ---------- 歌词微调（LRC 与音频对不上时手动校准） ----------
function applyLrcOffset(v) {
  state.lrcOffset = Math.max(-5, Math.min(5, Math.round(v * 10) / 10));
  localStorage.setItem('ms_lrc_offset', String(state.lrcOffset));
  pbOffsetVal.textContent = (state.lrcOffset > 0 ? '+' : '') + state.lrcOffset.toFixed(1) + 's';
  syncLyrics();
}

(function initLrcOffset() {
  const saved = parseFloat(localStorage.getItem('ms_lrc_offset'));
  applyLrcOffset(isNaN(saved) ? 0 : saved);
})();

pbOffsetBtn.addEventListener('click', () => {
  pbOffsetPop.classList.toggle('hidden');
});

pbOffsetPop.addEventListener('click', (e) => {
  const btn = e.target.closest('.pb-offset-btn');
  if (!btn) return;
  const d = parseFloat(btn.dataset.delta);
  applyLrcOffset(d === 0 ? 0 : state.lrcOffset + d);
});

// ---------- 歌词配色（🎨 按钮选择，扫色速度始终跟随音频进度） ----------
function hexToRgba(hex, a) {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  const n = parseInt(full, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
}

function applyLrcColor(color) {
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) return;
  document.documentElement.style.setProperty('--lrc-on', color);
  document.documentElement.style.setProperty('--lrc-off', hexToRgba(color, 0.24));
  localStorage.setItem('ms_lrc_color', color);
  pbColorInput.value = color;
  // 高亮当前选中项
  pbColorPop.querySelectorAll('.pb-color-item').forEach(el => {
    el.classList.toggle('active', el.dataset.color.toLowerCase() === color.toLowerCase());
  });
}

(function initLrcColor() {
  applyLrcColor(localStorage.getItem('ms_lrc_color') || '#ec4141');
})();

pbColorBtn.addEventListener('click', () => {
  pbColorPop.classList.toggle('hidden');
});

pbColorPop.addEventListener('click', (e) => {
  const item = e.target.closest('.pb-color-item');
  if (!item || e.target === pbColorInput) return;   // 自定义色由 input 事件处理
  const c = item.dataset.color;
  if (c !== 'custom') applyLrcColor(c);
});

pbColorInput.addEventListener('input', () => {
  applyLrcColor(pbColorInput.value);
});

// ---------- 布局切换：内嵌歌词播放器 / 底部条模式 ----------
function applyLayoutIcon() {
  const isInline = state.layout === 'inline';
  pbLayoutBtn.textContent = isInline ? '▤' : '▢';
  pbLayoutBtn.title = isInline ? '当前：内嵌歌词播放器（点击切为底部条）' : '当前：底部条模式（点击切为内嵌歌词）';
  playerBar.classList.toggle('is-inline', isInline);
  syncBodyPadding();
}

function setLayout(mode) {
  state.layout = mode;
  localStorage.setItem('ms_layout', mode);
  applyLayoutIcon();
  if (mode === 'inline') {
    toggleLrcPanel(false);
    showInlineLrc(state.lrc.length > 0);
  } else {
    showInlineLrc(false);
    if (state.lrc.length) toggleLrcPanel(true);
  }
}

pbLayoutBtn.addEventListener('click', () => {
  setLayout(state.layout === 'inline' ? 'bar' : 'inline');
});

// ESC 收起悬浮歌词 / 播放列表 / 音量
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  toggleLrcPanel(false);
  toggleListPanel(false);
  pbVolPop.classList.add('hidden');
  pbOffsetPop.classList.add('hidden');
  pbColorPop.classList.add('hidden');
});

// ---------- 播放器事件 ----------
audio.addEventListener('play', () => {
  pbPlay.textContent = '⏸';
  startKaraoke();
  const it = state.currentItem;
  if (it) document.title = '正在播放: ' + (it.title || '') + ' - ' + (it.author || '');
});
audio.addEventListener('pause', () => { pbPlay.textContent = '▶'; });
audio.addEventListener('timeupdate', () => {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  pbFill.style.width = pct + '%';
  pbProgress.setAttribute('aria-valuenow', String(Math.round(pct)));
  pbTime.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration || 0);
  syncLyrics();
});
audio.addEventListener('loadedmetadata', () => {
  pbTime.textContent = fmtTime(audio.currentTime) + ' / ' + fmtTime(audio.duration || 0);
});
audio.addEventListener('ended', () => {
  pbPlay.textContent = '▶';
  document.title = SITE_TITLE;
  // 单曲循环由 audio.loop 自动重播，不触发到这里；顺序/列表循环自动播下一首
  if (loopMode === 'one') return;
  const list = state.items.filter(x => x.url);
  if (!list.length) return;
  const idx = list.findIndex(x => x._uid === state.currentId);
  if (idx === -1) return;
  const next = list[idx + 1];
  if (next) {
    const card = resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(String(next._uid))}"]`);
    playItem(next, card);
  } else if (loopMode === 'list') {
    // 列表循环：到底后回绕到第一首
    const first = list[0];
    const card = resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(String(first._uid))}"]`);
    playItem(first, card);
  }
  // 顺序播放：列表播完自然停止
});

pbPlay.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});

// 进度条：点击定位 + 按住拖拽（白色圆点跟随）
function seekFromPointer(e) {
  if (!audio.duration) return;
  const rect = pbProgress.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
}
pbProgress.addEventListener('pointerdown', (e) => {
  pbProgress.setPointerCapture(e.pointerId);
  seekFromPointer(e);
});
pbProgress.addEventListener('pointermove', (e) => {
  if (e.buttons & 1) seekFromPointer(e);
});

// 进度条键盘操作（role=slider）：← → 快退/快进 5s，Home 回到开头
pbProgress.addEventListener('keydown', (e) => {
  if (!audio.duration) return;
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  e.preventDefault();
  if (e.key === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
  else if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
  else if (e.key === 'Home') audio.currentTime = 0;
  else audio.currentTime = audio.duration;
});

// ---------- 播放模式（参考喜马拉雅三态：顺序播放 → 列表循环 → 单曲循环） ----------
const LOOP_MODES = [
  { v: 'order', icon: '🔁', label: '顺序播放' },
  { v: 'list',  icon: '🔁', label: '列表循环' },
  { v: 'one',   icon: '🔂', label: '单曲循环' },
];
let loopMode = localStorage.getItem('ms_loop') || 'order';
if (!LOOP_MODES.some(m => m.v === loopMode)) loopMode = 'order';
function applyLoopMode() {
  const m = LOOP_MODES.find(x => x.v === loopMode);
  audio.loop = loopMode === 'one';
  pbLoopBtn.textContent = m.icon;
  pbLoopBtn.classList.toggle('active', loopMode !== 'order');
  pbLoopBtn.setAttribute('aria-label', '播放模式：' + m.label);
  pbLoopBtn.title = m.label;
  try { localStorage.setItem('ms_loop', loopMode); } catch (e) {}
}
pbLoopBtn.addEventListener('click', () => {
  const i = LOOP_MODES.findIndex(x => x.v === loopMode);
  loopMode = LOOP_MODES[(i + 1) % LOOP_MODES.length].v;
  applyLoopMode();
  showHint('播放模式：' + LOOP_MODES.find(x => x.v === loopMode).label);
});
applyLoopMode();

// 播放列表
function toggleListPanel(show) {
  const shouldShow = show == null ? listPanel.classList.contains('hidden') : show;
  listPanel.classList.toggle('hidden', !shouldShow);
  pbListBtn.classList.toggle('active', shouldShow);
  if (shouldShow) renderPlaylist();
}

pbListBtn.addEventListener('click', () => toggleListPanel());
listClose.addEventListener('click', () => toggleListPanel(false));

listBody.addEventListener('click', (e) => {
  const item = e.target.closest('.list-item');
  if (!item) return;
  const idx = parseInt(item.dataset.idx, 10);
  const it = state.items[idx];
  if (!it) return;
  playItem(it, resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(it._uid)}"]`));
});

// 点击面板外部收起列表/歌词/音量
document.addEventListener('click', (e) => {
  if (!pbVolBtn.contains(e.target) && !pbVolPop.contains(e.target)) pbVolPop.classList.add('hidden');
  if (!pbOffsetBtn.contains(e.target) && !pbOffsetPop.contains(e.target)) pbOffsetPop.classList.add('hidden');
  if (!pbColorBtn.contains(e.target) && !pbColorPop.contains(e.target)) pbColorPop.classList.add('hidden');
  if (!pbListBtn.contains(e.target) && !listPanel.contains(e.target)) toggleListPanel(false);
  if (!pbLrcBtn.contains(e.target) && !lrcPanel.contains(e.target)) {
    toggleLrcPanel(false);
  }
});

// ---------- 加载更多 ----------
loadMoreBtn.addEventListener('click', () => {
  state.page += 1;
  doSearch(true);
});

// ---------- 收藏交互 ----------
favList.addEventListener('click', (e) => {
  const del = e.target.closest('.fav-del');
  if (del) {
    const idx = parseInt(del.dataset.idx, 10);
    if (!isNaN(idx) && favorites[idx]) {
      const name = favorites[idx].title || '';
      favorites.splice(idx, 1);
      saveFavorites();
      renderFavorites();
      syncFavButtons();
      showHint('已取消收藏：' + name);
    }
    return;
  }
  const play = e.target.closest('.fav-play');
  if (play) playFavorite(parseInt(play.dataset.idx, 10));
});

favClear.addEventListener('click', () => {
  if (!favorites.length) return;
  if (!confirm('确定清空全部 ' + favorites.length + ' 首收藏吗？此操作不可撤销。')) return;
  favorites = [];
  saveFavorites();
  renderFavorites();
  syncFavButtons();
  showHint('已清空收藏');
});

// ---------- 上一首 / 下一首（在当前播放列表内循环） ----------
function playByOffset(delta) {
  const list = state.items.filter(x => x.url);
  if (!list.length) return;
  let idx = list.findIndex(x => x._uid === state.currentId);
  idx = idx === -1 ? 0 : (idx + delta + list.length) % list.length;
  const it = list[idx];
  const card = resultsEl.querySelector(`.result-card[data-uid="${CSS.escape(String(it._uid))}"]`);
  playItem(it, card);
}

pbPrev.addEventListener('click', () => playByOffset(-1));
pbNext.addEventListener('click', () => playByOffset(1));

// ---------- 倍速播放（点击循环切换） ----------
const SPEEDS = [1, 1.5, 2, 0.5];
function applySpeed(rate) {
  audio.playbackRate = rate;
  pbSpeedBtn.textContent = 'x ' + rate.toFixed(1);
}
pbSpeedBtn.addEventListener('click', () => {
  const cur = SPEEDS.indexOf(audio.playbackRate);
  applySpeed(SPEEDS[(cur + 1) % SPEEDS.length]);
});
applySpeed(1);

// ---------- 分享本站链接（默认分享本站地址，含当前搜索参数） ----------
pbLinkBtn.addEventListener('click', async () => {
  const shareUrl = location.origin + location.pathname + location.search;
  const nav = window.navigator;
  // 支持原生分享（移动端）时优先调起系统分享面板
  if (nav.share) {
    try {
      await nav.share({ title: document.title, url: shareUrl });
      return;
    } catch (e) { /* 用户取消分享面板则回退复制 */ }
  }
  try {
    await nav.clipboard.writeText(shareUrl);
    showHint('本站链接已复制，快去分享吧');
  } catch (e) {
    // 剪贴板不可用时回退：弹出输入框供手动复制
    window.prompt('复制本站链接：', shareUrl);
  }
});

pbFavBtn.addEventListener('click', () => {
  const it = state.currentItem;
  if (!it) { showHint('当前没有播放的曲目', 'error'); return; }
  const added = toggleFavorite(it);
  showHint(added ? '已加入收藏：' + (it.title || '') : '已取消收藏：' + (it.title || ''));
});

// 播放失败时做一次降级：直链失效 → 改用网易外链重新解析
audio.addEventListener('error', () => {
  if (!audio.src) return;
  const it = state.currentItem;
  if (it && it.outer && !it._triedOuter && audio.src !== it.outer) {
    it._triedOuter = true;
    it.url = '';                 // 直链已失效，清掉以便下次直接走外链
    audio.src = it.outer;
    audio.play().catch(() => {});
    return;
  }
  showHint(
    state.visitorCN
      ? '播放失败：音频地址可能已失效，请重新搜索后再试'
      : '播放失败：当前网络无法解析该音频地址，换一首或稍后再试',
    'error'
  );
});

// ---------- 启动 ----------
// 刷新/带参打开一律回到干净的首页，不自动搜索
if (location.search) {
  history.replaceState(null, document.title, location.pathname);
}

// 结构化数据里的占位域名替换为真实来源，canonical 补全为绝对地址
(function normalizeSeoMeta() {
  const origin = location.origin || '';
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    s.textContent = s.textContent.split('https://__SITE_ORIGIN__').join(origin);
  });
  ['canonical'].forEach(rel => {
    const link = document.querySelector('link[rel="' + rel + '"]');
    if (link && origin) link.setAttribute('href', origin + location.pathname);
  });
  const ogUrl = document.querySelector('meta[property="og:url"]');
  if (ogUrl && origin) ogUrl.setAttribute('content', origin + location.pathname);
})();

renderPlatforms();
keywordEl.placeholder = PLACEHOLDERS.name;

// 收藏夹（首页默认展示）
loadFavorites();
renderFavorites();
syncFavButtons();

// 恢复布局偏好（默认内嵌歌词播放器）
state.layout = localStorage.getItem('ms_layout') === 'bar' ? 'bar' : 'inline';
applyLayoutIcon();
