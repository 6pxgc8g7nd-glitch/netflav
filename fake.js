/* 掩護用的假 Netflix 首頁互動：點封面進假的詳細頁、假的搜尋、假的播放器、新與熱門、下載內容、我的片單、分類篩選。
   所有片名、簡介、演員都是編出來的，完全不碰你的收藏資料；也沒有任何一條路能從這裡進入真正的收藏
   （只能回到「誰在看？」）。需要先載入 app.js（用到 fakeArt、nameHash、esc）。 */
(() => {
  const home = document.getElementById('fakeHome');
  if (!home || typeof fakeArt !== 'function') return;
  const q = (s, r = home) => r.querySelector(s), qa = (s, r = home) => [...r.querySelectorAll(s)];
  const H = s => nameHash(String(s));
  const GENRES = ['劇情', '懸疑', '愛情', '動作', '科幻', '喜劇', '驚悚', '奇幻', '紀錄', '家庭'];
  const CAST = ['林柏安', '周若彤', '陳以諾', '許靜宜', '吳承恩', '蔡語彤', '黃子謙', '徐嘉欣', '張庭瑋', '李沐晴'];
  const EXTRA = ['星砂', '暮光港', '無聲年代', '潮聲', '午夜電台', '紙飛機', '第七號房', '雪線', '低語', '舊城漫遊', '折返點', '晴天預報'];
  const EPS = ['序章', '錯位', '回聲', '裂縫', '長夜', '終點'];
  const HERO = '迷霧之城', CW_TITLES = ['夜行列車', '星河', '海岸線', '迷霧'];
  const svg = (p, s = 22, sw = 2, fill = 'none') => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const I = {
    back: '<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>',
    play: '<polygon points="6 3 20 12 6 21 6 3"></polygon>',
    pause: '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>',
    check: '<polyline points="20 6 9 17 4 12"></polyline>',
    dl: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
    up: '<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>',
    share: '<circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>',
    cast: '<path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6"></path><path d="M2 12a9 9 0 0 1 8 8"></path><path d="M2 16a5 5 0 0 1 4 4"></path><line x1="2" y1="20" x2="2.01" y2="20"></line>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
    info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
    search: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>',
    dl2: '<circle cx="12" cy="12" r="10"></circle><polyline points="8 12 12 16 16 12"></polyline><line x1="12" y1="8" x2="12" y2="16"></line>',
    rew: '<polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>',
    fwd: '<polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>'
  };

  /* ---------- 狀態（只存在這一次開啟內）---------- */
  let S = { list: [], dl: [], liked: {}, remind: {}, pos: {} };
  try { const v = JSON.parse(sessionStorage.getItem('NF_FH')); if (v && typeof v === 'object') S = { ...S, ...v }; } catch (e) {}
  const save = () => { try { sessionStorage.setItem('NF_FH', JSON.stringify(S)); } catch (e) {} };

  /* ---------- 片單資料：由片名算出固定的假資訊 ---------- */
  const artIdx = {};   // 片名 → 首頁封面編號（讓詳細頁和首頁封面是同一張圖）
  function info(t) {
    const h = H(t); let g = [GENRES[h % 10], GENRES[(h >>> 5) % 10]]; if (g[0] === g[1]) g[1] = GENRES[(h % 10 + 3) % 10];
    const series = h % 3 !== 0, seasons = 1 + (h >>> 9) % 3, mins = 88 + (h >>> 7) % 60;
    return {
      h, genres: g, series, seasons, mins, year: 2018 + h % 8, match: 82 + (h >>> 3) % 17,
      rating: ['全年齡', '12+', '16+'][(h >>> 11) % 3],
      len: series ? `${seasons} 季` : `${Math.floor(mins / 60)}小時 ${mins % 60}分`,
      cast: [0, 1, 2].map(k => CAST[(h >>> (k * 3)) % 10]).filter((x, i, a) => a.indexOf(x) === i).join('、'),
      desc: `${['一通深夜的電話', '一封寄錯的信', '一場突如其來的停電', '一張泛黃的舊照片'][(h >>> 13) % 4]}，讓原本平靜的日子起了變化。《${t}》在${g[0]}與${g[1]}之間展開，直到最後一刻才揭曉真相。`
    };
  }
  const idxOf = t => { if (artIdx[t] === undefined) artIdx[t] = (H(t) % 90000) + 100; return artIdx[t]; };
  const artOf = (t, off = 0) => { const n = idxOf(t) + off; return fakeArt(n === 0 ? 0 : (n * 7) % 10, n); };
  const tileHtml = (t, w = 106, h = 156) => `<div class="fh-tile" data-title="${esc(t)}" style="width:${w}px;height:${h}px;background:#1c1c1c">${artOf(t)}<span>${esc(t)}</span></div>`;

  /* ---------- 把首頁既有的內容包起來，並替每個封面標上片名 ---------- */
  const nav = q('.fh-nav');
  const pageHome = document.createElement('div'); pageHome.id = 'fhPageHome'; pageHome.dataset.fhp = 'home';
  [...home.children].forEach(c => { if (c !== nav) pageHome.appendChild(c); });
  home.insertBefore(pageHome, nav);
  const pageHot = document.createElement('div'); pageHot.id = 'fhPageHot'; pageHot.dataset.fhp = 'hot'; home.insertBefore(pageHot, nav);
  const pageDl = document.createElement('div'); pageDl.id = 'fhPageDl'; pageDl.dataset.fhp = 'dl'; home.insertBefore(pageDl, nav);
  home.dataset.fhTab = 'home';
  qa('.fh-tile[data-art]', pageHome).forEach(t => {
    const cw = t.closest('.fh-cw');
    const title = cw ? CW_TITLES[qa('.fh-cw', pageHome).indexOf(cw)] : ((t.querySelector('span:not(.fh-pl)') || {}).textContent || '').trim();
    if (!title) return;
    t.dataset.title = title; artIdx[title] = +t.dataset.art;
    if (cw) cw.dataset.title = title;
  });
  artIdx[HERO] = 0;
  const catalog = [...new Set([HERO, ...qa('.fh-tile[data-title]', pageHome).map(t => t.dataset.title), ...EXTRA])];
  qa('.fh-tile[data-title]', pageHome).forEach(t => { const d = info(t.dataset.title); t.dataset.kind = d.series ? 'series' : 'movie'; t.dataset.genres = d.genres.join(','); });

  /* ---------- 提示（首頁等級，高於選擇畫面以外的一切）---------- */
  const toastEl = document.createElement('div'); toastEl.id = 'fhToast'; document.body.appendChild(toastEl);
  let toastT = null;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1800); }

  /* ---------- 全螢幕畫面（詳細頁、搜尋、播放器、類別）用堆疊管理 ---------- */
  const layer = document.createElement('div'); layer.id = 'fhLayer'; layer.className = 'fh-layer'; document.body.appendChild(layer);
  let stack = [], player = null;
  const topView = () => stack[stack.length - 1];
  function push(type, arg) { stack.push({ type, arg }); render(); }
  function pop() { stack.pop(); render(); }
  function reset() { stack = []; render(); }
  function stopPlayer() { if (player) { clearInterval(player.timer); clearTimeout(player.hideT); S.pos[player.title] = player.pos; save(); player = null; } }

  const fmt = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(ss).padStart(2, '0'); };

  function detailHtml(t, tab) {
    const d = info(t), inList = S.list.includes(t), dl = S.dl.includes(t), liked = S.liked[t];
    const eps = d.series ? `<span class="${tab === 'eps' ? 'on' : ''}" data-tab="eps">集數</span>` : '';
    const more = `<span class="${tab === 'more' || !d.series ? 'on' : ''}" data-tab="more">更多類似內容</span>`;
    let body;
    if (d.series && tab !== 'more') {
      body = EPS.map((e, i) => `<div class="fhd-ep" data-act="play" data-title="${esc(t)}"><div class="fhd-epart">${artOf(t, i + 1)}<b>${svg(I.play, 16, 2, 'currentColor')}</b></div><div class="fhd-eptx"><p><b>${i + 1}. ${e}</b><i>${44 + (d.h >>> i) % 12} 分</i></p><small>${esc(t)}第 ${i + 1} 集：故事繼續推進，新的線索逐漸浮現。</small></div></div>`).join('');
    } else {
      const others = catalog.filter(x => x !== t).sort((a, b) => ((H(a + t) % 997) - (H(b + t) % 997))).slice(0, 9);
      body = `<div class="fhd-grid">${others.map(x => tileHtml(x, 104, 150).replace('class="fh-tile"', 'class="fh-tile" data-open="' + esc(x) + '"')).join('')}</div>`;
    }
    return `<div class="fhd-hero">${artOf(t)}<div class="fhd-fade"></div>
        <button class="fhd-ib fhd-l" data-act="back" aria-label="返回">${svg(I.back)}</button><button class="fhd-ib fhd-r" data-act="cast" aria-label="投放">${svg(I.cast)}</button>
        <button class="fhd-bigplay" data-act="play" data-title="${esc(t)}" aria-label="播放">${svg(I.play, 26, 2, 'currentColor')}</button></div>
      <div class="fhd-body">
        <h2 class="fhd-title">${esc(t)}</h2>
        <p class="fhd-meta"><b>${d.match}% 配對</b><span>${d.year}</span><i>${d.rating}</i><span>${d.len}</span><i>HD</i></p>
        <button class="fhd-btn fhd-white" data-act="play" data-title="${esc(t)}">${svg(I.play, 18, 2, 'currentColor')} 播放</button>
        <button class="fhd-btn fhd-gray" data-act="dl" data-title="${esc(t)}">${svg(dl ? I.check : I.dl, 18)} ${dl ? '已下載' : '下載'}</button>
        <p class="fhd-desc">${esc(d.desc)}</p>
        <p class="fhd-line">主演：${esc(d.cast)}</p><p class="fhd-line">類型：${d.genres.join('、')}</p>
        <div class="fhd-actions">
          <button data-act="list" data-title="${esc(t)}">${svg(inList ? I.check : I.plus, 24)}<span>我的片單</span></button>
          <button data-act="rate" data-title="${esc(t)}">${svg(I.up, 24, 2, liked ? 'currentColor' : 'none')}<span>評分</span></button>
          <button data-act="share">${svg(I.share, 24)}<span>分享</span></button></div>
        <div class="fhd-tabs">${eps}${more}</div>
        <div class="fhd-tabbody">${body}</div>
      </div>`;
  }
  function searchBody(qs) {
    qs = qs.trim();
    const items = qs ? catalog.filter(t => t.includes(qs) || info(t).genres.some(g => g.includes(qs))) : catalog.slice(0, 12);
    if (qs && !items.length) return `<p class="fhs-empty">找不到「${esc(qs)}」的相關內容</p>`;
    return `<p class="fhs-h">${qs ? '搜尋結果' : '熱門搜尋'}</p>` + items.map(t => `<div class="fhs-row" data-open="${esc(t)}"><div class="fhs-thumb">${artOf(t)}</div><b>${esc(t)}</b><span>${svg(I.play, 22, 1.8)}</span></div>`).join('');
  }
  function playerHtml(t) {
    const d = info(t), total = (d.series ? 48 : d.mins) * 60;
    return `<div class="fhv-screen" data-act="ui">${artOf(t)}<div class="fhv-shade"></div>
      <div class="fhv-ui"><div class="fhv-top"><button data-act="back" aria-label="返回">${svg(I.back, 26)}</button><span>${esc(t)}</span></div>
        <div class="fhv-mid"><button data-act="seek" data-d="-10" aria-label="倒退 10 秒">${svg(I.rew, 34)}</button><button id="fhvPP" class="fhv-pp" data-act="pp" aria-label="暫停">${svg(I.pause, 40, 2, 'currentColor')}</button><button data-act="seek" data-d="10" aria-label="快轉 10 秒">${svg(I.fwd, 34)}</button></div>
        <div class="fhv-bot"><div class="fhv-bar"><i id="fhvFill"></i></div><div class="fhv-time"><span id="fhvT">0:00</span><span>${fmt(total)}</span></div></div></div></div>`;
  }
  function genresHtml() {
    return `<div class="fhs-bar"><button data-act="back" aria-label="返回">${svg(I.back, 24)}</button><b>選擇類型</b></div>` + GENRES.map(g => `<div class="fhg-row" data-genre="${g}">${g}</div>`).join('');
  }

  function render() {
    const v = topView();
    stopPlayerIfLeaving(v);
    if (!v) { layer.classList.remove('open'); layer.innerHTML = ''; return; }
    layer.classList.add('open'); layer.scrollTop = 0; layer.dataset.view = v.type;
    if (v.type === 'detail') { v.tab = v.tab || (info(v.arg).series ? 'eps' : 'more'); layer.innerHTML = detailHtml(v.arg, v.tab); }
    else if (v.type === 'search') { layer.innerHTML = `<div class="fhs-bar"><button data-act="back" aria-label="返回">${svg(I.back, 24)}</button><input id="fhsInput" type="search" placeholder="搜尋影集、電影或類型" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></div><div id="fhsBody">${searchBody('')}</div>`; setTimeout(() => { const i = q('#fhsInput', layer); if (i) i.focus(); }, 60); }
    else if (v.type === 'genres') layer.innerHTML = genresHtml();
    else if (v.type === 'player') {
      layer.innerHTML = playerHtml(v.arg);
      const d = info(v.arg), total = (d.series ? 48 : d.mins) * 60;
      player = { title: v.arg, total, pos: S.pos[v.arg] || 0, playing: true, timer: null, hideT: null };
      const tick = () => { if (!player) return; if (player.playing) player.pos = Math.min(player.total, player.pos + 1); drawPlayer(); };
      player.timer = setInterval(tick, 1000); drawPlayer(); armHide();
    }
  }
  function stopPlayerIfLeaving(v) { if (player && (!v || v.type !== 'player' || v.arg !== player.title)) stopPlayer(); }
  function drawPlayer() {
    if (!player) return;
    const f = q('#fhvFill', layer), t = q('#fhvT', layer); if (!f || !t) return;
    f.style.width = (player.pos / player.total * 100).toFixed(2) + '%'; t.textContent = fmt(player.pos);
    const pp = q('#fhvPP', layer); if (pp) pp.innerHTML = svg(player.playing ? I.pause : I.play, 40, 2, 'currentColor');
  }
  function armHide() { if (!player) return; const ui = q('.fhv-ui', layer); if (ui) ui.classList.remove('hide'); clearTimeout(player.hideT); player.hideT = setTimeout(() => { const u = q('.fhv-ui', layer); if (u && player && player.playing) u.classList.add('hide'); }, 3000); }

  /* ---------- 我的片單 / 下載 ---------- */
  function renderMyList() {
    let h = q('#fhMyListH', pageHome), row = q('#fhMyList', pageHome);
    if (!S.list.length) { if (h) h.remove(); if (row) row.remove(); return; }
    if (!row) {
      h = document.createElement('p'); h.id = 'fhMyListH'; h.className = 'fh-h'; h.textContent = '我的片單';
      row = document.createElement('div'); row.id = 'fhMyList'; row.className = 'fh-scroll';
      const dots = q('.fh-dots', pageHome); dots.after(h); h.after(row);
    }
    row.innerHTML = S.list.map(t => tileHtml(t)).join('');
  }
  function syncHeroList() { const g = q('.fh-ghost', pageHome); if (!g) return; const on = S.list.includes(HERO); g.innerHTML = svg(on ? I.check : I.plus, 18) + '<span>' + (on ? '已加入' : '我的片單') + '</span>'; }
  function toggleList(t) {
    const i = S.list.indexOf(t); if (i >= 0) S.list.splice(i, 1); else S.list.unshift(t);
    save(); renderMyList(); syncHeroList(); toast(i >= 0 ? '已從我的片單移除' : '已加入我的片單');
  }
  function toggleDl(t) { const i = S.dl.indexOf(t); if (i >= 0) S.dl.splice(i, 1); else S.dl.unshift(t); save(); toast(i >= 0 ? '已刪除下載內容' : '開始下載'); }

  /* ---------- 新與熱門 / 下載內容 兩個頁籤 ---------- */
  const HOT = EXTRA.slice(0, 6), DATES = ['10 月 24 日', '10 月 26 日', '10 月 29 日', '11 月 2 日', '11 月 5 日', '11 月 9 日'];
  function renderHot() {
    pageHot.innerHTML = `<div class="fhp-head"><b>新與熱門</b><span class="fh-icons">${svg(I.cast)}${svg(I.search)}</span></div>
      <div class="fh-chips"><span class="fh-chip-on">即將上線</span><span>大家都在看</span><span>Top 10</span></div>` +
      HOT.map((t, i) => { const d = info(t); return `<div class="fhp-item"><p class="fhp-date">${DATES[i]}</p><div class="fhp-art" data-open="${esc(t)}">${artOf(t)}<em>即將上線</em></div>
        <div class="fhp-row"><b>${esc(t)}</b><span><button data-act="remind" data-title="${esc(t)}">${svg(I.bell, 20)}<small>${S.remind[t] ? '已設提醒' : '提醒我'}</small></button><button data-open="${esc(t)}">${svg(I.info, 20)}<small>資訊</small></button></span></div>
        <p class="fhp-desc">${esc(d.desc)}</p><p class="fhp-g">${d.genres.join(' · ')}</p></div>`; }).join('');
  }
  function renderDl() {
    pageDl.innerHTML = `<div class="fhp-head"><b>下載內容</b><span class="fh-icons">${svg(I.cast)}</span></div>` + (S.dl.length
      ? S.dl.map(t => `<div class="fhs-row" data-open="${esc(t)}"><div class="fhs-thumb">${artOf(t)}</div><div class="fhdl-tx"><b>${esc(t)}</b><small>已下載・${300 + info(t).h % 700} MB</small></div><span>${svg(I.check, 22)}</span></div>`).join('')
      : `<div class="fhdl-empty"><div class="fhdl-ic">${svg(I.dl2, 56, 1.4)}</div><p class="fhdl-t">還沒有下載內容</p><p class="fhdl-s">下載後的影片會顯示在這裡，沒有網路也能看。</p><button data-act="find">尋找可下載的內容</button></div>`);
  }
  function setTab(tab) {
    home.dataset.fhTab = tab; home.scrollTop = 0;
    qa('.fh-nav > span', home).forEach((s, i) => s.classList.toggle('on', ['home', 'hot', 'dl'][i] === tab));
    if (tab === 'hot') renderHot(); if (tab === 'dl') renderDl();
  }

  /* ---------- 分類篩選（影集 / 電影 / 類型）---------- */
  let fKind = '', fGenre = '';
  function applyFilter() {
    const chips = qa('.fh-chips span', pageHome);
    chips[0].classList.toggle('fh-chip-on', fKind === 'series'); chips[1].classList.toggle('fh-chip-on', fKind === 'movie');
    chips[2].classList.toggle('fh-chip-on', !!fGenre); chips[2].textContent = fGenre ? `${fGenre} ✕` : '類別 ▾';
    qa('.fh-scroll', pageHome).forEach(row => {
      if (row.id === 'fhMyList' || row.querySelector('.fh-cw') || row.querySelector('.fh-top10')) return;
      let shown = 0;
      qa('.fh-tile[data-title]', row).forEach(t => { const ok = (!fKind || t.dataset.kind === fKind) && (!fGenre || t.dataset.genres.split(',').includes(fGenre)); t.style.display = ok ? '' : 'none'; if (ok) shown++; });
      row.style.display = shown ? '' : 'none'; const hd = row.previousElementSibling; if (hd && hd.classList.contains('fh-h')) hd.style.display = shown ? '' : 'none';
    });
  }

  /* ---------- 事件 ---------- */
  home.addEventListener('click', e => {
    if (e.target.closest('#fhMe')) return;                                 // 「我的 Netflix」由 app.js 處理：回到「誰在看？」
    const navSpan = e.target.closest('.fh-nav > span');
    if (navSpan) { const i = qa('.fh-nav > span', home).indexOf(navSpan); if (i < 3) setTab(['home', 'hot', 'dl'][i]); return; }
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'find') { setTab('home'); return; }
    if (act && act.dataset.act === 'remind') { const t = act.dataset.title; S.remind[t] = !S.remind[t]; save(); renderHot(); toast(S.remind[t] ? '已設定提醒' : '已取消提醒'); return; }
    const open = e.target.closest('[data-open]'); if (open) { push('detail', open.dataset.open); return; }
    if (e.target.closest('#fakePlay')) { push('player', HERO); return; }
    if (e.target.closest('.fh-ghost')) { toggleList(HERO); return; }
    const ico = e.target.closest('.fh-icons > svg'); if (ico) { const i = [...ico.parentElement.children].indexOf(ico); const isHome = !!ico.closest('.fh-head'); if (i === 0 || !isHome && ico.closest('.fhp-head') && i === 0) toast('找不到可用的裝置'); else push('search'); return; }
    const chip = e.target.closest('.fh-chips span');
    if (chip && chip.closest('#fhPageHome')) {
      const i = qa('.fh-chips span', pageHome).indexOf(chip);
      if (i === 0) fKind = fKind === 'series' ? '' : 'series'; else if (i === 1) fKind = fKind === 'movie' ? '' : 'movie';
      else if (fGenre) fGenre = ''; else { push('genres'); return; }
      applyFilter(); return;
    }
    const tile = e.target.closest('.fh-cw[data-title], .fh-tile[data-title]'); if (tile) push('detail', tile.dataset.title);
  });
  layer.addEventListener('click', e => {
    const open = e.target.closest('[data-open]'); if (open) { push('detail', open.dataset.open); return; }
    const gen = e.target.closest('[data-genre]'); if (gen) { fGenre = gen.dataset.genre; pop(); applyFilter(); return; }
    const tab = e.target.closest('[data-tab]'); if (tab) { const v = topView(); v.tab = tab.dataset.tab; const sc = layer.scrollTop; layer.innerHTML = detailHtml(v.arg, v.tab); layer.scrollTop = sc; return; }
    const act = e.target.closest('[data-act]'); if (!act) return;
    const t = act.dataset.title, v = topView();
    switch (act.dataset.act) {
      case 'back': pop(); break;
      case 'play': push('player', t || (v && v.arg)); break;
      case 'cast': toast('找不到可用的裝置'); break;
      case 'share': toast('目前無法分享'); break;
      case 'dl': toggleDl(t); layer.innerHTML = detailHtml(v.arg, v.tab); break;
      case 'list': toggleList(t); layer.innerHTML = detailHtml(v.arg, v.tab); break;
      case 'rate': S.liked[t] = !S.liked[t]; save(); layer.innerHTML = detailHtml(v.arg, v.tab); toast(S.liked[t] ? '已為這部作品評分' : '已取消評分'); break;
      case 'pp': if (player) { player.playing = !player.playing; drawPlayer(); armHide(); } break;
      case 'seek': if (player) { player.pos = Math.min(player.total, Math.max(0, player.pos + (+act.dataset.d))); drawPlayer(); armHide(); } break;
      case 'ui': { const ui = q('.fhv-ui', layer); if (ui) { if (ui.classList.contains('hide')) armHide(); else ui.classList.add('hide'); } break; }
    }
  });
  layer.addEventListener('input', e => { if (e.target.id === 'fhsInput') { const b = q('#fhsBody', layer); if (b) b.innerHTML = searchBody(e.target.value); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) pop(); });

  /* 離開假首頁（回到「誰在看？」或進入收藏）時，把所有假畫面關掉 */
  new MutationObserver(() => { if (!document.documentElement.classList.contains('fake-home')) { reset(); setTab('home'); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  renderMyList(); syncHeroList(); applyFilter();
  // 給測試和除錯用
  window.fakeNetflix = { open: (t, a) => push(t, a), back: pop, reset, setTab, state: () => S, catalog, stackDepth: () => stack.length, info };
})();
