'use strict';

// 平台列表（value 必须与后端 API 一致）
const PLATFORMS = [
  { v: 'netease',  n: '网易' },
  { v: 'qq',       n: 'QQ' },
  { v: 'kugou',    n: '酷狗' },
  { v: 'kuwo',     n: '酷我' },
  { v: 'baidu',    n: '千千' },
  { v: '1ting',    n: '一听' },
  { v: 'migu',     n: '咪咕' },
  { v: 'lizhi',    n: '荔枝' },
  { v: 'qingting', n: '蜻蜓' },
  { v: 'ximalaya', n: '喜马拉雅' },
  { v: '5singyc',  n: '5sing原创' },
  { v: '5singfc',  n: '5sing翻唱' },
  { v: 'kg',       n: '全民K歌' },
];
const PLAT_NAME = Object.fromEntries(PLATFORMS.map(p => [p.v, p.n]));
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

// ---------- 初始化平台 chips ----------
function renderPlatforms() {
  platformsEl.innerHTML = '';
  PLATFORMS.forEach(p => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (p.v === state.type ? ' active' : '');
    b.textContent = p.n;
    b.dataset.v = p.v;
    b.setAttribute('aria-pressed', String(p.v === state.type));
    b.addEventListener('click', () => {
      state.type = p.v;
      [...platformsEl.children].forEach(c => {
        const on = c.dataset.v === p.v;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
    });
    platformsEl.appendChild(b);
  });
  platformsEl.setAttribute('aria-label', '音乐平台');
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
  // url 模式隐藏平台选择
  platformsEl.classList.toggle('hidden', f === 'url');
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
  const type = filter === 'url' ? '_' : state.type;

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ input, filter, type, page: String(state.page) }),
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const j = await resp.json();

    if (j.code === 200 && Array.isArray(j.data) && j.data.length) {
      j.data.forEach(it => {
        it._uid = it.songid || it.link || (Math.random().toString(36).slice(2));
        state.items.push(it);
      });
      setMsg('');
      resultsEl.innerHTML = '';
      renderItems(j.data, append);
      loadMoreWrap.classList.toggle('hidden', j.data.length < 10);
      updateSearchMeta(input, type);
    } else if (!append) {
      resultsEl.innerHTML = '';
      setMsg('<div class="empty">未找到相关音乐，换个关键词或平台试试～</div>');
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
  const plat = PLAT_NAME[type] || '全网';
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
  const hasUrl = !!it.url;
  const altText = esc((it.title || '音乐') + (it.author ? ' - ' + it.author : '') + ' 封面');

  card.innerHTML = `
    <img class="rc-cover" src="${esc(cover)}" alt="${altText}" loading="lazy" decoding="async" width="56" height="56" onerror="this.src='${NOPIC}'">
    <div class="rc-main">
      <h3 class="rc-title">${title}<span class="rc-badge">${esc(plat)}</span></h3>
      <div class="rc-author">${author}</div>
    </div>
    <div class="rc-actions">
      <button class="rc-btn play" type="button" aria-label="试听 ${title} - ${author}">${hasUrl ? '试听' : '不可用'}</button>
    </div>`;

  const playBtn = card.querySelector('.rc-btn.play');
  if (hasUrl) {
    playBtn.addEventListener('click', () => playItem(it, card));
  } else {
    playBtn.disabled = true;
  }
  return card;
}

// ---------- 播放 ----------
function playItem(it, card) {
  // 高亮
  resultsEl.querySelectorAll('.result-card').forEach(c => c.classList.remove('playing'));
  if (card) card.classList.add('playing');

  audio.src = it.url;
  audio.play().catch(() => {});
  state.currentId = it._uid;
  state.currentItem = it;

  pbCover.src = it.pic || NOPIC;
  pbTitle.textContent = it.title || '暂无';
  pbAuthor.textContent = it.author || '';
  playerBar.classList.remove('hidden');
  pbPlay.textContent = '⏸';
  pbFill.style.width = '0%';
  pbTime.textContent = '00:00 / ' + fmtTime(audio.duration || 0);
  renderPlaylist();
  setDetail(it);
  loadLyrics(it);
}

function fmtTime(s) {
  if (!isFinite(s)) s = 0;
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
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
  if (!it.lrc) return;
  try {
    let text = it.lrc;
    // 上游可能直接内嵌 LRC 文本，也可能给 URL
    if (!/^\s*\[\d{2}:\d{2}/.test(text) && /^https?:\/\//.test(text)) {
      const res = await fetch(text);
      if (!res.ok) return;
      text = await res.text();
    }
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

  const lrc = normLrc(data.lrc);
  dLrc.value = lrc.split('\n')[0];          // 输入框只显示首行预览
  dLrc.dataset.full = lrc;                  // 完整歌词存 data-full，供复制

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
});

pbPlay.addEventListener('click', () => {
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
});

pbProgress.addEventListener('click', (e) => {
  if (!audio.duration) return;
  const rect = pbProgress.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
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

// 循环播放
pbLoopBtn.addEventListener('click', () => {
  audio.loop = !audio.loop;
  pbLoopBtn.classList.toggle('active', audio.loop);
  pbLoopBtn.textContent = audio.loop ? '🔂' : '🔁';
});

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

// 恢复布局偏好（默认内嵌歌词播放器）
state.layout = localStorage.getItem('ms_layout') === 'bar' ? 'bar' : 'inline';
applyLayoutIcon();
