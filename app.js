/* Netflav 主程式（需搭配 index.html、styles.css；離線快取見 sw.js） */
const STORAGE_KEY = 'NF_MOBILE_VAULT_FINAL';
const NO_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect fill="#111" width="100%" height="100%"/><text x="50%" y="50%" fill="#333" text-anchor="middle" font-size="28">NO IMAGE</text></svg>');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = id => document.getElementById(id);

function loadCollections() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(d) ? d : [];
  } catch (e) { return []; }
}
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(collections)); scheduleBackup(); return true; }
  catch (e) { showToast("儲存失敗：空間不足或被禁用"); return false; }
}

let collections = loadCollections();
const PAGE_SIZES = [6, 12, 24, 48];
let currentId = null, currentPage = 1, drawerFav = false;
let pageSize = (n => PAGE_SIZES.includes(n) ? n : 12)(parseInt(localStorage.getItem('NF_PAGE_SIZE')));
function updatePageSize(n) {
  pageSize = n; currentPage = 1;
  try { localStorage.setItem('NF_PAGE_SIZE', n); } catch (e) {}
  PAGE_SIZES.forEach(s => { const b = $(`sizeBtn${s}`); if (b) b.classList.toggle('active', s === n); });
  renderGallery();
}
let actorCurrentPage = 1, actorPageSize = 18;
let tagCurrentPage = 1, tagPageSize = 20;
let currentLayout = parseInt(localStorage.getItem('NF_LAYOUT_SETTING')) || 2;
let lastRandomId = null, activeTab = 0;
let favOnly = false, selectedTags = [], actorFilter = '';
const HEART = '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>';
const heartSvg = (filled, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${HEART}</svg>`;
const hasTag = (i, t) => (i.tags || []).some(x => String(x).toLowerCase() === t.toLowerCase());
const matchTags = i => selectedTags.every(t => hasTag(i, t));

/* 外觀：深色 / 淺色 */
function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
function applyAccent() { // 深色 = Netflix 紅，淺色 = YouTube 紅
  document.documentElement.style.setProperty('--nf-red', currentTheme() === 'light' ? '#FF0000' : '#E50914');
}
function updateAppearanceUI() {
  applyAccent();
  const t = currentTheme();
  const gr = $('glassRange'); if (gr) gr.value = glassLevel();
  $('themeBtnDark').classList.toggle('active', t === 'dark');
  $('themeBtnLight').classList.toggle('active', t === 'light');
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#ffffff' : '#141414');
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : 'dark');
  try { localStorage.setItem('NF_THEME', t === 'light' ? 'light' : 'dark'); } catch (e) {}
  updateAppearanceUI();
}

function updateContainerHeight() {
  setTimeout(() => {
    const p = document.querySelector('.page-content.active-page');
    const w = $('appContent');
    if (p && w) w.style.height = p.scrollHeight + 'px';
  }, 50);
}

function checkDuplicate(el) {
  if (!el) return false;
  const val = el.value.trim();
  if (!val) { el.style.color = ''; return false; }
  const others = collections.filter(i => String(i.id) !== String(currentId));
  let dup = false;
  if (el.id === 'codeInput') { const u = val.toUpperCase(); dup = others.some(i => i.code && i.code.toUpperCase() === u); }
  else if (el.id === 'urlInput') dup = others.some(i => i.url === val);
  else if (el.id === 'imgInput') dup = others.some(i => i.img === val);
  el.style.color = dup ? 'var(--nf-red)' : '';
  return dup;
}

function handleSearchInput() {
  $('clearSearchBtn').style.display = $('searchInput').value.length > 0 ? 'block' : 'none';
  currentPage = 1;
  debouncedRender();
}
function clearSearch() {
  $('searchInput').value = "";
  $('clearSearchBtn').style.display = 'none';
  currentPage = 1;
  renderGallery();
}

/* 效能：內容沒變就不重畫（避免閃爍、重新解碼封面、按到一半的按鈕被換掉） */
function setHtml(el, html) { if (el._h === html) return; el._h = html; el.innerHTML = html; }

/* 搜尋用的文字整理好快取起來（項目或別名沒變就不重算），不用每打一個字都重新轉小寫比對 */
const hayCache = new WeakMap();
function searchHay(i, am, avSig) {
  const c = hayCache.get(i);
  if (c && c.s === avSig) return c.t;
  const t = [i.name, i.actor, i.code, ...(i.tags || []), aliasText(i, am)].map(x => String(x || '').toLowerCase()).join('\u0001');
  hayCache.set(i, { s: avSig, t });
  return t;
}

/* 卡片：用 id 對照，只新增 / 刪除 / 更新有變的，沒變的卡片（含已載入的封面）原封不動 */
const cardSig = i => [i.img || '', i.code || '', i.name || ''].join('\u0001');
function cardHtml(item) {
  return `<div class="poster-card" data-card="${esc(item.id)}">
      <img src="${esc(item.img) || NO_IMG}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=NO_IMG">
      <div class="card-overlay">
        <p class="code text-[8px] font-black text-red-600 mb-0.5 tracking-wider uppercase">${esc(item.code) || 'SERIES'}</p>
        <p class="title text-[13px] font-bold truncate">${esc(item.name)}</p>
      </div>
    </div>`;
}
function reconcileCards(container, items) {
  if (container.firstElementChild && !container.firstElementChild.hasAttribute('data-card')) container.textContent = ''; // 剛從「找不到內容」畫面回來
  const old = new Map();
  [...container.children].forEach(el => old.set(el.dataset.card, el));
  const tpl = document.createElement('template');
  items.forEach((item, idx) => {
    const id = String(item.id), sig = cardSig(item);
    let el = old.get(id);
    if (el && el.dataset.sig === sig) old.delete(id);
    else {
      tpl.innerHTML = cardHtml(item);
      const fresh = tpl.content.firstElementChild;
      fresh.dataset.sig = sig;
      if (el) { old.delete(id); el.replaceWith(fresh); }
      el = fresh;
    }
    const cur = container.children[idx];
    if (cur !== el) container.insertBefore(el, cur || null);
  });
  old.forEach(el => el.remove());
}

function renderGallery() {
  const gallery = $('gallery');
  const q = $('searchInput').value.trim().toLowerCase();
  const am = aliasMap();
  const avSig = canonAv(actorAvatars);
  const filtered = collections.filter(i =>
    (!favOnly || i.fav) && matchTags(i) && (!actorFilter || canonActors(i, am).includes(actorFilter)) &&
    (!q || searchHay(i, am, avSig).includes(q)));
  renderFilterRow();
  $('itemCount').innerText = `${filtered.length} ITEMS`;

  if (filtered.length === 0) {
    gallery.className = "flex flex-col items-center justify-center py-12 text-center";
    gallery.innerHTML = `<div class="empty-state-icon mb-6"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></div><p class="text-zinc-500 font-bold text-lg mb-4">找不到相關內容</p>`;
    setHtml($('paginationContainer'), "");
    updateContainerHeight();
    return;
  }

  gallery.className = `grid gap-3 layout-cols-${currentLayout}`;
  const total = Math.ceil(filtered.length / pageSize);
  if (currentPage > total) currentPage = total;
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  reconcileCards(gallery, paginated);
  renderPagination(total, currentPage, 'changePage', 'paginationContainer');
  updateContainerHeight();
}

function renderFilterRow() {
  const row = $('filterRow'); if (!row) return;
  const favN = collections.filter(i => i.fav).length;
  const none = !favOnly && !selectedTags.length && !actorFilter;
  setHtml(row,
    `<button class="chip${none ? ' active' : ''}" data-chip="all">全部</button>` +
    `<button class="chip${favOnly ? ' active' : ''}" data-chip="fav" aria-label="只看最愛">${heartSvg(favOnly || favN > 0, 14)}<span>${favN}</span></button>` +
    (actorFilter ? `<button class="chip active" data-chip-actor><span>${esc(actorFilter)}</span><span aria-label="移除">✕</span></button>` : '') +
    selectedTags.map(t => `<button class="chip active" data-chip-tag="${esc(t)}"><span>${esc(t)}</span><span aria-label="移除">✕</span></button>`).join(''));
}
function resetFilters() { favOnly = false; selectedTags = []; actorFilter = ''; updateTagBar(); markStale(); }
function toggleTag(tag) {
  const i = selectedTags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
  if (i >= 0) selectedTags.splice(i, 1); else selectedTags.push(tag);
  markStale(); updateTagBar();
}
function updateTagBar() {
  const bar = $('tagBar'); if (!bar) return;
  const show = activeTab === 1 && selectedTags.length > 0;
  bar.classList.toggle('show', show);
  if (show) $('tagBarText').textContent = `已選 ${selectedTags.length} 個標籤・${collections.filter(matchTags).length} 部符合`;
}
function clearTags() { selectedTags = []; markStale(); updateTagBar(); }
function applyTags() { $('searchInput').value = ''; $('clearSearchBtn').style.display = 'none'; currentPage = 1; switchTab(0); renderGallery(); }

function renderPagination(total, cur, fn, containerId) {
  const container = $(containerId);
  if (total <= 1) { setHtml(container, ""); return; }
  const ico = (...polys) => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${polys.map(p => `<polyline points="${p}"></polyline>`).join('')}</svg>`;
  const btn = (off, page, label, icon) => `<button class="page-nav-btn" ${off ? 'disabled' : `onclick="${fn}(${page})"`} aria-label="${label}">${icon}</button>`;
  const atStart = cur <= 1, atEnd = cur >= total;
  setHtml(container, `<div class="page-nav-row">
    ${btn(atStart, 1, '第一頁', ico('18 17 12 12 18 7', '11 17 5 12 11 7'))}
    ${btn(atStart, cur - 1, '上一頁', ico('15 18 9 12 15 6'))}
    <button class="page-nav-info" onclick="openPagePicker(${total},${cur},'${fn}')" aria-label="跳到指定頁"><b>${cur}</b> / ${total}</button>
    ${btn(atEnd, cur + 1, '下一頁', ico('9 18 15 12 9 6'))}
    ${btn(atEnd, total, '最後一頁', ico('6 17 12 12 6 7', '13 17 19 12 13 7'))}
  </div>`);
}

/* 點頁碼 → 跳頁選單 */
function openPagePicker(total, cur, fn) {
  $('pageGrid').innerHTML = Array.from({ length: total }, (_, i) => i + 1)
    .map(p => `<button class="page-chip${p === cur ? ' active' : ''}" onclick="pickPage('${fn}',${p})">${p}</button>`).join('');
  const m = $('pageModal'); m.classList.remove('hidden'); m.classList.add('flex');
  const a = $('pageGrid').querySelector('.active'); if (a) a.scrollIntoView({ block: 'center' });
}
function closePagePicker() { const m = $('pageModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function pickPage(fn, p) { closePagePicker(); window[fn](p); }

function updateLayout(cols) {
  currentLayout = cols;
  try { localStorage.setItem('NF_LAYOUT_SETTING', cols); } catch (e) {}
  for (let i = 1; i <= 4; i++) { const b = $(`layoutBtn${i}`); if (b) b.classList.toggle('active', i === cols); }
  renderGallery();
}

function renderTagCloud() {
  const map = {};
  collections.forEach(i => (i.tags || []).forEach(t => map[t] = (map[t] || 0) + 1));
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = Math.ceil(sorted.length / tagPageSize);
  if (tagCurrentPage > total) tagCurrentPage = Math.max(total, 1);
  const paginated = sorted.slice((tagCurrentPage - 1) * tagPageSize, tagCurrentPage * tagPageSize);
  setHtml($('tagCloud'), paginated.map(([tag, count]) => `
    <div data-tag="${esc(tag)}" class="tag-pill${selectedTags.some(t => t.toLowerCase() === tag.toLowerCase()) ? ' selected' : ''}"><span class="truncate pr-2">${esc(tag)}</span>
    <span class="tag-count">${count}</span></div>`).join(''));
  renderPagination(total, tagCurrentPage, 'changeTagPage', 'tagPaginationContainer');
  updateContainerHeight();
}

function actorsOf(i) {
  const list = typeof i.actor === 'string'
    ? i.actor.split(/[\s,，、\/／]+/).map(n => n.trim()).filter(Boolean)
    : String(i.name || '').split(/[\s,\[\]【】，、\/]+/).filter(n => n.trim() && n.length > 1); // 舊資料
  return [...new Set(list)];
}
/* 虛擬頭像：依名字挑固定的髮型剪影（單色、不是真人照片，同一個名字永遠長一樣） */
function nameHash(name) { let h = 2166136261; for (const c of String(name)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
const AVATAR_KEY = 'NF_ACTOR_AVATARS';
let actorAvatars = {};
try { actorAvatars = sanitizeAvatars(JSON.parse(localStorage.getItem(AVATAR_KEY))) || {}; } catch (e) { actorAvatars = {}; }
/* 只留下合法欄位：{ 名字: { img?: http(s)/data:image 網址, style?: 0–3 } }；格式不對回傳 null */
function sanitizeAvatars(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k]; if (!v || typeof v !== 'object') return;
    const e = {};
    if (typeof v.img === 'string' && /^(https?:\/\/|data:image\/)/i.test(v.img.trim())) e.img = v.img.trim();
    if (Number.isInteger(v.style) && v.style >= 0 && v.style < 4) e.style = v.style;
    if (Array.isArray(v.aliases)) {
      const al = [...new Set(v.aliases.map(a => String(a).trim()).filter(a => a && a.length <= 40 && a !== k))].slice(0, 30);
      if (al.length) e.aliases = al;
    }
    if (Object.keys(e).length) out[k] = e;
  });
  return out;
}
const canonAv = o => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k].img || '', Number.isInteger(o[k].style) ? o[k].style : -1, (o[k].aliases || []).join('\u0001')]));
function saveAvatars() { try { localStorage.setItem(AVATAR_KEY, JSON.stringify(actorAvatars)); scheduleBackup(); return true; } catch (e) { showToast('儲存失敗：空間不足或被禁用'); return false; } }
const defaultStyle = name => (nameHash(name) >>> 4) % 4;
function avatarSvgFor(style) {
  const hair = '#4a4a50';
  const back = [
    `<path d="M24 36c0-17 7-25 16-25s16 8 16 25v22c-4-7-9-9-16-9s-12 2-16 9z" fill="${hair}"/>`,                                  // 長髮
    `<path d="M25 33c0-14 6-21 15-21s15 7 15 21c0 6-1 11-3 14H28c-2-3-3-8-3-14z" fill="${hair}"/>`,                               // 鮑伯頭
    `<circle cx="40" cy="11" r="8" fill="${hair}"/><path d="M26 34c0-13 6-20 14-20s14 7 14 20z" fill="${hair}"/>`,                // 丸子頭
    `<path d="M26 34c0-14 6-21 14-21s14 7 14 21v6c0 6 4 10 8 12-8 4-14 0-16-6H34c-2 6-8 10-16 6 4-2 8-6 8-12z" fill="${hair}"/>`   // 雙馬尾
  ][style];
  return `<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">${back}<path d="M12 82c0-16 12-24 28-24s28 8 28 24z" fill="#8e8e93"/><rect x="35" y="44" width="10" height="16" rx="4" fill="#c7c7cc"/><ellipse cx="40" cy="34" rx="12.5" ry="14" fill="#d1d1d6"/><path d="M26 33c1-10 8-15 14-15s13 5 14 15c-5-5-9-7-14-7s-9 2-14 7z" fill="${hair}"/></svg>`;
}
/* 頭像內容：自訂圖片蓋在剪影上，圖片載入失敗就自動露出剪影 */
function avatarInner(name, img, style) {
  const st = Number.isInteger(style) && style >= 0 && style < 4 ? style : defaultStyle(name);
  return avatarSvgFor(st) + (img ? `<img src="${esc(img)}" referrerpolicy="no-referrer" loading="lazy" onerror="this.style.display='none'">` : '');
}
const avatarOf = name => { const a = actorAvatars[name] || {}; return avatarInner(name, a.img, a.style); };

/* 長按頭像 → 編輯 */
let avName = '', avStyle = null, avDupAsked = '';
function openAvatarEditor(name) {
  const a = actorAvatars[name] || {};
  avName = name; avStyle = Number.isInteger(a.style) ? a.style : null; avDupAsked = '';
  $('avatarTitle').textContent = '編輯女優・' + name;
  $('avatarAliases').value = (a.aliases || []).join(' ');
  $('avatarUrl').value = a.img || '';
  renderAvatarEditor();
  const m = $('avatarModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeAvatarEditor() { const m = $('avatarModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function renderAvatarEditor() {
  const url = $('avatarUrl').value.trim();
  $('avatarPreview').innerHTML = avatarInner(avName, /^(https?:\/\/|data:image\/)/i.test(url) ? url : '', avStyle);
  const cur = avStyle === null ? defaultStyle(avName) : avStyle;
  $('avatarStyles').innerHTML = [0, 1, 2, 3].map(i => `<button class="style-opt${i === cur ? ' active' : ''}" onclick="pickAvatarStyle(${i})" aria-label="造型 ${i + 1}">${avatarSvgFor(i)}</button>`).join('');
}
function updateAvatarPreview() { renderAvatarEditor(); }
function pickAvatarStyle(i) { avStyle = i; renderAvatarEditor(); }
function saveAvatar() {
  const url = $('avatarUrl').value.trim();
  if (url && !/^(https?:\/\/|data:image\/)/i.test(url)) { showToast('圖片網址要以 http 或 https 開頭'); return; }
  const entry = {};
  const aliases = [...new Set($('avatarAliases').value.split(/[\s,，、\/／]+/).map(a => a.trim()).filter(a => a && a !== avName))].slice(0, 30);
  const am = aliasMap();
  const inList = new Set(aliases);
  for (const a of aliases) {
    const owner = am.get(normName(a));
    if (owner && owner !== avName && !inList.has(owner)) { showToast(`「${a}」已經是「${owner}」的別名`); return; }
    const sub = actorAvatars[a] && actorAvatars[a].aliases || [];
    if (sub.some(x => !inList.has(x))) { showToast(`「${a}」本身已有別名，請先到它那邊清除，或一併填進別名`); return; }
  }
  if (url && avDupAsked !== url) {
    const key = normImg(url), am2 = aliasMap();
    const hit = Object.keys(actorAvatars).find(k => k !== avName && !am2.has(normName(k)) && !aliases.includes(k) && actorAvatars[k].img && normImg(actorAvatars[k].img) === key);
    if (hit) {
      avDupAsked = url;
      openConfirm(`這張圖片已經被「${hit}」使用，可能是同一位女優。\n要把「${hit}」併進「${avName}」當別名嗎？\n（取消的話，再按一次儲存就會照原樣存成兩位）`, () => {
        const sub = (actorAvatars[hit] && actorAvatars[hit].aliases) || [];
        $('avatarAliases').value = [...new Set([...$('avatarAliases').value.split(/[\s,，、\/／]+/).filter(Boolean), hit, ...sub])].join(' ');
        saveAvatar();
      });
      return;
    }
  }
  if (aliases.length) entry.aliases = aliases;
  if (url) entry.img = url;
  if (avStyle !== null && avStyle !== defaultStyle(avName)) entry.style = avStyle;
  const prevAll = JSON.stringify(actorAvatars);
  // 被併進來的名字不再需要自己的設定：頭像沒填就沿用對方的，然後清掉
  aliases.forEach(a => { const e = actorAvatars[a]; if (e) { if (!entry.img && e.img) entry.img = e.img; delete actorAvatars[a]; } });
  if (Object.keys(entry).length) actorAvatars[avName] = entry; else delete actorAvatars[avName];
  if (!saveAvatars()) { actorAvatars = JSON.parse(prevAll); return; }
  closeAvatarEditor(); markStale(); renderGallery(); showToast('已儲存');
}
function resetAvatar() {
  const prev = actorAvatars[avName]; delete actorAvatars[avName];
  if (!saveAvatars()) { if (prev) actorAvatars[avName] = prev; return; }
  closeAvatarEditor(); markStale(); renderGallery(); showToast('已清除設定');
}
/* 別名合併：{ 標準名字: { aliases: [別名…] } } → 別名對照表；同一個別名被多人佔用時，依名字排序先到先得 */
const normName = n => String(n).normalize('NFKC').trim().toLowerCase();
function aliasMap() {
  const m = new Map();
  Object.keys(actorAvatars).sort().forEach(k => (actorAvatars[k].aliases || []).forEach(a => {
    const n = normName(a); if (n && n !== normName(k) && !m.has(n)) m.set(n, k);
  }));
  return m;
}
const canonActors = (i, am) => [...new Set(actorsOf(i).map(n => am.get(normName(n)) || n))];
const aliasText = (i, am) => canonActors(i, am).map(c => [c, ...((actorAvatars[c] && actorAvatars[c].aliases) || [])].join(' ')).join(' ').toLowerCase();
/* 重複頭像偵測：兩位以上的女優用了同一張圖片，多半是同一個人（例如日文名與中文名） */
const normImg = u => {
  const t = String(u || '').trim();
  if (!t || /^data:/i.test(t)) return t;
  try { const x = new URL(t); return x.protocol.toLowerCase() + '//' + x.host.toLowerCase() + x.pathname + x.search; } catch (e) { return t; }
};
function presentActors() { const am = aliasMap(), set = new Set(); collections.forEach(i => canonActors(i, am).forEach(n => set.add(n))); return set; }
function findDupAvatars() {
  const am = aliasMap(), present = presentActors(), by = new Map();
  Object.keys(actorAvatars).sort().forEach(k => {
    const e = actorAvatars[k];
    if (!e.img || am.has(normName(k)) || !present.has(k)) return; // 已被合併成別名的、資料裡已經沒有的不算
    const key = normImg(e.img);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(k);
  });
  return [...by.values()].filter(g => g.length > 1);
}
function renderDupBanner() {
  const el = $('dupBanner'); if (!el) return;
  const n = findDupAvatars().length;
  setHtml(el, n ? `<button class="dup-banner" onclick="openDupModal()"><span>⚠ 有 ${n} 組女優使用同一張頭像，可能是同一個人</span><b>查看</b></button>` : '');
}
function openDupModal() {
  const groups = findDupAvatars();
  if (!groups.length) { closeDupModal(); return; }
  $('dupList').innerHTML = groups.map((g, gi) => `<div class="dup-group">
      <div class="dup-names">${g.map(esc).join('　＝　')}</div>
      <div class="dup-actions">${g.map((n, ni) => `<button class="dup-keep" data-g="${gi}" data-n="${ni}">以「${esc(n)}」為主</button>`).join('')}</div>
    </div>`).join('');
  $('dupList')._groups = groups;
  const m = $('dupModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeDupModal() { const m = $('dupModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
/* 把 others 全部併進 keep：名字與它們的別名都變成 keep 的別名，keep 沒有頭像就沿用對方的 */
function mergeActors(keep, others) {
  const k = Object.assign({}, actorAvatars[keep] || {});
  const aliases = new Set(k.aliases || []);
  others.forEach(o => {
    aliases.add(o);
    const e = actorAvatars[o];
    if (e) { (e.aliases || []).forEach(a => aliases.add(a)); if (!k.img && e.img) k.img = e.img; delete actorAvatars[o]; }
  });
  aliases.delete(keep);
  if (aliases.size) k.aliases = [...aliases].slice(0, 30);
  actorAvatars[keep] = k;
}
function mergeDupGroup(gi, ni) {
  const g = ($('dupList')._groups || [])[gi]; if (!g) return;
  const keep = g[ni], others = g.filter((_, i) => i !== ni);
  const backup = JSON.stringify(actorAvatars);
  mergeActors(keep, others);
  if (!saveAvatars()) { actorAvatars = JSON.parse(backup); return; }
  markStale(); renderGallery(); renderDupBanner();
  showToast(`已合併到「${keep}」`);
  openDupModal(); // 還有其他組就留在清單，沒有就自動關閉
}

function renderActorList() {
  const map = {};
  const am = aliasMap();
  collections.forEach(i => canonActors(i, am).forEach(n => map[n] = (map[n] || 0) + 1));
  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
  const total = Math.ceil(sorted.length / actorPageSize);
  if (actorCurrentPage > total) actorCurrentPage = Math.max(total, 1);
  const paginated = sorted.slice((actorCurrentPage - 1) * actorPageSize, actorCurrentPage * actorPageSize);
  setHtml($('actorList'), paginated.map(([name, count]) => `<div data-q="${esc(name)}" data-actor="${esc(name)}" class="active:opacity-70 flex flex-col items-center"><div class="actor-badge overflow-hidden">${avatarOf(name)}</div><span class="text-xs font-bold block truncate px-2 mt-2 w-full text-center">${esc(name)}</span><span class="block text-[11px] text-zinc-400 mt-0.5">${count} 作品</span></div>`).join(''));
  renderDupBanner();
  renderPagination(total, actorCurrentPage, 'changeActorPage', 'actorPaginationContainer');
  updateContainerHeight();
}

/* 標籤頁、女優頁只有切過去才需要畫；資料有變時先標記，切過去再更新 */
const staleTabs = { 1: true, 2: true };
function renderTab(i) {
  if (i === 1) renderTagCloud(); else if (i === 2) renderActorList(); else return;
  staleTabs[i] = false;
}
function markStale() { staleTabs[1] = staleTabs[2] = true; if (staleTabs[activeTab] !== undefined) renderTab(activeTab); }
function refreshAll() { renderGallery(); markStale(); }

function changePage(p) { currentPage = p; window.scrollTo({ top: 0, behavior: 'smooth' }); renderGallery(); }
function changeTagPage(p) { tagCurrentPage = p; window.scrollTo({ top: 0, behavior: 'smooth' }); renderTagCloud(); }
function changeActorPage(p) { actorCurrentPage = p; window.scrollTo({ top: 0, behavior: 'smooth' }); renderActorList(); }

/* 事件委派：點擊封面跳轉，長按封面編輯 */
let lpTimer = null, lpFired = false, lpX = 0, lpY = 0;
const LONG_PRESS_MS = 500, MOVE_TOL = 10;
function cancelLongPress() { clearTimeout(lpTimer); lpTimer = null; }

document.addEventListener('pointerdown', e => {
  const card = e.target.closest('[data-card]'), actor = card ? null : e.target.closest('[data-actor]');
  if (!card && !actor) return;
  lpFired = false; lpX = e.clientX; lpY = e.clientY;
  cancelLongPress();
  lpTimer = setTimeout(() => {
    lpTimer = null; lpFired = true;
    if (navigator.vibrate) navigator.vibrate(15);
    if (card) openDrawer(card.dataset.card); else openAvatarEditor(actor.dataset.actor);
  }, LONG_PRESS_MS);
});
document.addEventListener('pointermove', e => {
  if (lpTimer && (Math.abs(e.clientX - lpX) > MOVE_TOL || Math.abs(e.clientY - lpY) > MOVE_TOL)) cancelLongPress();
});
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => {
  cancelLongPress();
  if (lpFired) setTimeout(() => { lpFired = false; }, 400); // 吃掉長按放開後的 click
}));
document.addEventListener('contextmenu', e => { if (e.target.closest('[data-card],[data-actor]')) e.preventDefault(); });

document.addEventListener('click', e => {
  if (e.target.closest('[data-chip-actor]')) { actorFilter = ''; currentPage = 1; renderGallery(); return; }
  const chipTag = e.target.closest('[data-chip-tag]');
  if (chipTag) { toggleTag(chipTag.dataset.chipTag); currentPage = 1; renderGallery(); return; }
  const chip = e.target.closest('[data-chip]');
  if (chip) {
    if (chip.dataset.chip === 'all') resetFilters(); else favOnly = !favOnly;
    currentPage = 1; renderGallery(); return;
  }
  const tagEl = e.target.closest('[data-tag]');
  if (tagEl) { toggleTag(tagEl.dataset.tag); return; }
  const card = e.target.closest('[data-card]');
  if (card) {
    if (lpFired) return;
    const it = collections.find(i => String(i.id) === card.dataset.card);
    if (!it) return;
    if (it.url) openExternalUrl(it.url, e); else openDrawer(it.id); // 沒有連結就直接開編輯
    return;
  }
  const q = e.target.closest('[data-q]');
  if (q) { if (lpFired) return; setActorFilter(q.dataset.q); }
});

function openRandomRecommendation() {
  if (collections.length === 0) { showToast("目前尚無收藏內容可推薦"); return; }
  let pool = collections.filter(i => String(i.id) !== String(lastRandomId));
  if (pool.length === 0) pool = collections;
  const item = pool[Math.floor(Math.random() * pool.length)];
  lastRandomId = item.id;
  $('randomCardPreview').innerHTML = `
    <img src="${esc(item.img) || NO_IMG}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=NO_IMG" style="width:100%;height:100%;object-fit:cover;">
    <div class="card-overlay"><p class="code text-[8px] font-black text-red-600 mb-0.5 tracking-wider uppercase">${esc(item.code) || 'SERIES'}</p></div>`;
  $('randomCardTitle').innerText = item.name;
  const btn = $('randomPlayBtn');
  if (item.url) { btn.style.display = 'block'; btn.onclick = () => { openExternalUrl(item.url); closeRandomModal(); }; }
  else btn.style.display = 'none';
  const m = $('randomModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeRandomModal() { const m = $('randomModal'); m.classList.add('hidden'); m.classList.remove('flex'); }

function renderFavToggle() {
  const b = $('favToggle'); if (!b) return;
  b.innerHTML = heartSvg(drawerFav, 18) + `<span>${drawerFav ? '已加入最愛' : '加入最愛'}</span>`;
  b.style.color = drawerFav ? 'var(--nf-red)' : '';
}
function toggleDrawerFav() { drawerFav = !drawerFav; renderFavToggle(); }
function openDrawer(id = null) {
  currentId = id;
  $('drawer').classList.add('open');
  const f = { name: $('nameInput'), actor: $('actorInput'), code: $('codeInput'), url: $('urlInput'), tags: $('tagsInput'), img: $('imgInput') };
  const item = id ? collections.find(i => String(i.id) === String(id)) : null;
  if (item) {
    f.name.value = item.name || ""; f.actor.value = item.actor || ""; f.code.value = item.code || ""; f.url.value = item.url || "";
    f.tags.value = (item.tags || []).join(' '); f.img.value = item.img || "";
    $('drawerDeleteBtn').classList.remove('hidden');
    drawerFav = !!item.fav;
  } else {
    currentId = null;
    Object.values(f).forEach(x => { x.value = ""; x.style.color = ""; });
    $('drawerDeleteBtn').classList.add('hidden');
    drawerFav = false;
  }
  renderFavToggle();
  $('pasteBtn').classList.toggle('hidden', !!item);
  ['codeInput', 'urlInput', 'imgInput'].forEach(fid => checkDuplicate($(fid)));
}

function saveItem() {
  const name = $('nameInput').value.trim();
  if (!name) { showToast("請輸入名稱"); return; }
  if (['codeInput', 'urlInput', 'imgInput'].some(id => checkDuplicate($(id)))) { showToast("請修正重複的資料"); return; }
  const data = {
    id: currentId || Date.now().toString(), name,
    actor: $('actorInput').value.trim(),
    code: $('codeInput').value.trim().toUpperCase(),
    url: $('urlInput').value.trim(),
    tags: $('tagsInput').value.trim().split(/\s+/).filter(Boolean),
    img: $('imgInput').value.trim(),
    fav: drawerFav
  };
  const backup = collections.slice();
  const idx = currentId ? collections.findIndex(i => String(i.id) === String(currentId)) : -1;
  if (idx >= 0) collections[idx] = data; else collections.unshift(data);
  if (!persist()) { collections = backup; return; }
  refreshAll(); closeDrawer(); showToast("已儲存");
}

function switchTab(index) {
  activeTab = index;
  $('fabBtn').style.display = index === 0 ? 'flex' : 'none';
  $('pageContainer').style.transform = `translateX(-${index * (100 / 3)}%)`;
  document.querySelectorAll('.nav-item').forEach((el, i) => { if (i < 3) el.classList.toggle('active', i === index); });
  document.querySelectorAll('.page-content').forEach((p, i) => p.classList.toggle('active-page', i === index));
  window.scrollTo(0, 0);
  if (index === 1 || index === 2) { if (staleTabs[index]) renderTab(index); }
  updateTagBar();
  updateContainerHeight();
}

function setActorFilter(name) {
  favOnly = false; selectedTags = []; actorFilter = name;
  $('searchInput').value = ''; $('clearSearchBtn').style.display = 'none';
  currentPage = 1;
  switchTab(0);
  renderGallery();
}

function openExternalUrl(url, e) {
  if (e) e.stopPropagation();
  const u = String(url || '').trim();
  if (!u) return;
  const full = /^https?:\/\//i.test(u) ? u : (/^[a-z][a-z0-9+.-]*:/i.test(u) ? '' : 'https://' + u);
  if (!full) { showToast("不支援的連結格式"); return; }
  window.open(full, '_blank', 'noopener,noreferrer');
}

function debouncedRender() { clearTimeout(window.timer); window.timer = setTimeout(renderGallery, 300); }
function showToast(msg) { const t = $('toast'); t.innerText = msg; t.style.opacity = "1"; clearTimeout(window.toastTimer); window.toastTimer = setTimeout(() => { t.style.opacity = "0"; }, 2000); }

/* 復原：刪除後 7 秒內可以還原 */
let undoFn = null, undoTimer = null;
function showUndo(msg, fn) {
  clearTimeout(undoTimer);
  undoFn = fn;
  $('undoMsg').textContent = msg;
  $('undoBar').classList.add('show');
  undoTimer = setTimeout(hideUndo, 7000);
}
function hideUndo() { clearTimeout(undoTimer); undoFn = null; $('undoBar').classList.remove('show'); }
function doUndo() { const f = undoFn; hideUndo(); if (f) f(); }

function openConfirm(title, fn) {
  $('confirmTitle').innerText = title;
  $('confirmOkBtn').onclick = () => { closeConfirm(); fn(); };
  const m = $('confirmModal'); m.classList.remove('hidden'); m.classList.add('flex');
}
function closeConfirm() { const m = $('confirmModal'); m.classList.add('hidden'); m.classList.remove('flex'); }
function requestDelete() { openConfirm("確定要刪除嗎？", executeDelete); }
function executeDelete() {
  const idx = collections.findIndex(i => String(i.id) === String(currentId));
  if (idx < 0) { closeDrawer(); return; }
  const item = collections[idx];
  const backup = collections.slice();
  collections = collections.filter(i => String(i.id) !== String(item.id));
  if (!persist()) { collections = backup; return; }
  closeDrawer(); refreshAll();
  showUndo(`已刪除「${item.name}」`, () => {
    if (collections.some(i => String(i.id) === String(item.id))) return;
    const prev = collections.slice();
    collections.splice(Math.min(idx, collections.length), 0, item);
    if (!persist()) { collections = prev; return; }
    refreshAll(); showToast("已復原");
  });
}
function closeDrawer() { $('drawer').classList.remove('open'); setTimeout(() => checkCloud(), 800); }
function toggleAdvanced(open) {
  const box = $('advancedBox');
  const show = open === undefined ? box.classList.contains('hidden') : open;
  box.classList.toggle('hidden', !show);
  $('advArrow').style.transform = show ? 'rotate(180deg)' : '';
}
function toggleFilterDrawer(open) {
  $('filterDrawer').classList.toggle('open', open);
  if (open) updateCloudUI();
  else { $('cloudBox').classList.add('hidden'); toggleAdvanced(false); } // 關閉設定時一律收起
}

async function exportData() {
  const EXPORT_NAME = 'netflav.json';
  const text = JSON.stringify({ version: 2, items: collections, avatars: actorAvatars }, null, 2);
  try {
    const file = new File([text], EXPORT_NAME, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return; // 使用者取消分享
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = EXPORT_NAME; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const parsed = JSON.parse(ev.target.result);
      // 新格式 { items, avatars }；舊格式是單純的陣列
      const raw = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.items) ? parsed.items : null);
      if (!raw) throw new Error('bad format');
      const importedAv = Array.isArray(parsed) ? null : sanitizeAvatars(parsed.avatars);
      const seen = new Set();
      const data = raw.filter(i => i && typeof i === 'object' && i.name).map((i, n) => {
        let id = String(i.id ?? (Date.now() + '_' + n));
        while (seen.has(id)) id += '_';
        seen.add(id);
        return {
          id, name: String(i.name), code: String(i.code || ''), url: String(i.url || ''), img: String(i.img || ''),
          tags: Array.isArray(i.tags) ? i.tags.map(String) : [],
          actor: typeof i.actor === 'string' ? i.actor : undefined,
          fav: i.fav === true
        };
      });
      if (data.length === 0) throw new Error('empty');
      openConfirm(`匯入 ${data.length} 筆，將覆蓋現有 ${collections.length} 筆資料。確定嗎？`, () => {
        const backup = collections, backupAv = actorAvatars;
        collections = data;
        if (importedAv) actorAvatars = importedAv;
        try { if (importedAv) localStorage.setItem(AVATAR_KEY, JSON.stringify(actorAvatars)); } catch (err) { collections = backup; actorAvatars = backupAv; showToast('儲存失敗：空間不足或被禁用'); return; }
        if (!persist()) { collections = backup; actorAvatars = backupAv; return; }
        hideUndo();
        currentPage = 1; actorCurrentPage = 1; tagCurrentPage = 1;
        refreshAll(); toggleFilterDrawer(false); showToast("匯入成功");
      });
    } catch (err) { showToast("格式錯誤"); }
    e.target.value = '';
  };
  reader.readAsText(file);
}

/* 從連結 / 剪貼簿帶入資料（供 iPhone 捷徑使用）
   格式：#add?name=標題&url=網址&img=封面網址 */
function parseAddParams(str) {
  const i = str.indexOf('add?');
  const p = new URLSearchParams(i >= 0 ? str.slice(i + 4) : str.replace(/^[#?]/, ''));
  return { name: p.get('name') || '', actor: p.get('actor') || '', code: p.get('code') || '', tags: p.get('tags') || '', url: p.get('url') || '', img: p.get('img') || '' };
}
function setFields(d) {
  let name = String(d.name || '').trim(), code = String(d.code || '').trim().toUpperCase();
  const m = code ? null : name.match(/^([A-Za-z]{2,6})-?(\d{2,5})\b[\s:：\-]*/);
  if (m) { code = (m[1] + '-' + m[2]).toUpperCase(); name = name.slice(m[0].length).trim() || name; }
  $('nameInput').value = name;
  if (d.actor) $('actorInput').value = d.actor;
  if (d.tags) $('tagsInput').value = d.tags;
  if (code) $('codeInput').value = code;
  $('urlInput').value = d.url || '';
  $('imgInput').value = d.img || '';
  const dup = ['codeInput', 'urlInput', 'imgInput'].map(id => checkDuplicate($(id))).some(Boolean);
  if (dup) showToast("這部可能已經加過了");
}
async function pasteFromClipboard() {
  try {
    const t = (await navigator.clipboard.readText()).trim();
    if (!t) { showToast("剪貼簿是空的"); return; }
    if (/^https?:\/\//i.test(t) && !t.includes('add?')) setFields({ url: t });
    else setFields(parseAddParams(t));
  } catch (e) { showToast("無法讀取剪貼簿"); }
}
function handleHash() {
  if (!location.hash.startsWith('#add?')) return;
  const d = parseAddParams(location.hash);
  history.replaceState(null, '', location.pathname + location.search);
  openDrawer(); setFields(d);
}
window.addEventListener('hashchange', handleHash);

/* 雲端自動備份：GitHub Gist（私人） */
const GIST_FILE = 'netflav.json', AVATAR_FILE = 'avatars.json', GIST_DESC = 'Netflav backup';
const K_TOKEN = 'NF_GIST_TOKEN', K_ID = 'NF_GIST_ID', K_LAST = 'NF_GIST_LAST';
const K_TS = 'NF_GIST_TS';        // 本機最後一次看到的雲端 updated_at
const K_DIRTY = 'NF_GIST_DIRTY';  // 本機有尚未同步到雲端的變更
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} };
let backupBusy = false, backupPending = false, backupTimer = null;

async function gh(path, opts = {}) {
  const headers = { 'Authorization': 'Bearer ' + lsGet(K_TOKEN), 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (opts.body) headers['Content-Type'] = 'application/json';
  const r = await fetch('https://api.github.com' + path, Object.assign({}, opts, { headers }));
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
function ghErrMsg(e) {
  if (e && e.status === 401) return '權杖無效或已過期';
  if (e && (e.status === 403 || e.status === 404)) return '權杖權限不足，請確認有勾選 gist';
  return '連線失敗，請檢查網路';
}
async function findCloudGist() {
  for (let page = 1; page <= 5; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`);
    const g = list.find(x => x.description === GIST_DESC && x.files && x.files[GIST_FILE]);
    if (g) return g;
    if (list.length < 100) break;
  }
  return null;
}
async function readCloud(id) {
  const g = await gh('/gists/' + id);
  const f = g.files && g.files[GIST_FILE];
  if (!f) throw new Error('no file');
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  const arr = JSON.parse(text);
  if (!Array.isArray(arr)) throw new Error('bad format');
  const items = arr.filter(i => i && typeof i === 'object' && i.name).map((i, n) => ({
    id: String(i.id ?? (Date.now() + '_' + n)), name: String(i.name), code: String(i.code || ''),
    url: String(i.url || ''), img: String(i.img || ''),
    tags: Array.isArray(i.tags) ? i.tags.map(String) : [],
    actor: typeof i.actor === 'string' ? i.actor : undefined,
    fav: i.fav === true
  }));
  // 頭像放在同一個 Gist 的另一個檔案；舊備份沒有這個檔案時是 null（還原時不動本機頭像）
  let avatars = null;
  const af = g.files && g.files[AVATAR_FILE];
  if (af) {
    try { avatars = sanitizeAvatars(JSON.parse(af.truncated ? await (await fetch(af.raw_url)).text() : af.content)); } catch (e) { avatars = null; }
  }
  return { items, avatars, ts: g.updated_at || '' };
}
function writeCloud(id) {
  const files = { [GIST_FILE]: { content: JSON.stringify(collections, null, 2) }, [AVATAR_FILE]: { content: JSON.stringify(actorAvatars, null, 2) } };
  return id
    ? gh('/gists/' + id, { method: 'PATCH', body: JSON.stringify({ description: GIST_DESC, files }) })
    : gh('/gists', { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files }) });
}
function scheduleBackup() {
  if (!lsGet(K_TOKEN) || !lsGet(K_ID)) return;
  lsSet(K_DIRTY, '1');
  clearTimeout(backupTimer);
  backupTimer = setTimeout(() => { backupTimer = null; runBackup(); }, 3000);
}
/* 備份前先看雲端有沒有另一台裝置的新內容，有的話不直接覆蓋，改問使用者
   overwrite = true：使用者已確認要用本機覆蓋雲端；manual = 使用者手動按「立即備份」 */
async function runBackup(forceId, overwrite, manual) {
  if (!lsGet(K_TOKEN)) return false;
  if (backupBusy) { backupPending = true; return false; }
  backupBusy = true;
  let ok = false;
  try {
    const id = forceId || lsGet(K_ID);
    if (id && !forceId && !overwrite && lsGet(K_TS)) {
      let cloud = null;
      try { cloud = await readCloud(id); } catch (e) { if (e && e.status) throw e; }
      if (cloud && cloud.ts && cloud.ts !== lsGet(K_TS) && !sameContent(cloud)) {
        backupPending = false;
        backupConflict(cloud, id, manual);
        return false;
      }
    }
    const g = await writeCloud(id);
    lsSet(K_ID, g.id); lsSet(K_LAST, new Date().toISOString());
    lsSet(K_TS, g.updated_at || '');
    if (!backupPending) lsSet(K_DIRTY, '');
    ok = true;
  } catch (e) {
    let msg = ghErrMsg(e);
    if (e && e.status === 404 && lsGet(K_ID)) { lsSet(K_ID, ''); msg = '找不到雲端備份，請重新連結'; }
    showToast('雲端備份失敗：' + msg);
  } finally {
    backupBusy = false;
    if (backupPending) { backupPending = false; scheduleBackup(); }
    updateCloudUI();
  }
  return ok;
}
function backupConflict(cloud, id, manual) {
  const n = cloud.items.length, m = collections.length;
  if (manual) {
    openConfirm(`雲端有另一台裝置的較新備份（${n} 筆），本機 ${m} 筆。\n要用本機覆蓋雲端嗎？\n（會蓋掉雲端那份）`, async () => { if (await runBackup(undefined, true)) showToast(`已備份 ${collections.length} 筆`); });
    return;
  }
  if (declinedTs === cloud.ts) return; // 已選擇保留本機：不再自動打擾，要覆蓋雲端請按「立即備份」
  declinedTs = cloud.ts;
  closeConfirmIfOpen();
  openConfirm(`雲端有另一台裝置的較新備份（${n} 筆），本機 ${m} 筆（含剛才的變更）。\n為避免互相覆蓋，這次沒有備份。\n要用雲端覆蓋本機嗎？\n（取消會保留本機；到「立即備份」可改用本機覆蓋雲端）`, () => applyCloud(cloud, id));
}
function closeConfirmIfOpen() { if (!$('confirmModal').classList.contains('hidden')) closeConfirm(); }
function updateCloudUI() {
  const el = $('cloudStatus'); if (!el) return;
  const last = lsGet(K_LAST);
  if (!lsGet(K_TOKEN)) el.textContent = '尚未設定。貼上權杖後，每次儲存都會自動備份。';
  else if (!lsGet(K_ID)) el.textContent = '已有權杖，但尚未連結雲端備份。';
  else el.textContent = '已開啟自動備份' + (last ? '・上次同步 ' + new Date(last).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') + (lsGet(K_DIRTY) ? '・有尚未同步的變更' : '');
}
function applyCloud(cloud, id) {
  const prev = collections, prevAv = actorAvatars;
  collections = cloud.items;
  if (cloud.avatars) actorAvatars = cloud.avatars;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    if (cloud.avatars) localStorage.setItem(AVATAR_KEY, JSON.stringify(actorAvatars));
  } catch (e) { collections = prev; actorAvatars = prevAv; showToast('儲存失敗：空間不足或被禁用'); return; }
  lsSet(K_ID, id); lsSet(K_LAST, new Date().toISOString());
  lsSet(K_TS, cloud.ts || ''); lsSet(K_DIRTY, '');
  hideUndo(); $('drawer').classList.remove('open');
  currentPage = 1; actorCurrentPage = 1; tagCurrentPage = 1;
  refreshAll(); updateCloudUI(); showToast(`已從雲端還原 ${cloud.items.length} 筆`);
}
async function saveToken() {
  const t = $('tokenInput').value.trim();
  if (!t) { showToast('請先貼上權杖'); return; }
  const old = lsGet(K_TOKEN);
  lsSet(K_TOKEN, t);
  try {
    showToast('連線中…');
    const g = await findCloudGist();
    $('tokenInput').value = '';
    if (lsGet(K_ID)) showToast('權杖已更新');
    else if (g) {
      const cloud = await readCloud(g.id);
      openConfirm(`雲端已有 ${cloud.items.length} 筆備份，本機有 ${collections.length} 筆。\n要用雲端覆蓋本機嗎？`, () => applyCloud(cloud, g.id));
    } else if (collections.length) {
      if (await runBackup()) showToast('已建立雲端備份，之後會自動備份');
    } else showToast('權杖已儲存，雲端還沒有備份');
  } catch (e) { lsSet(K_TOKEN, old); showToast('無法連線：' + ghErrMsg(e)); }
  updateCloudUI();
}
async function restoreFromCloud() {
  if (!lsGet(K_TOKEN)) { showToast('請先儲存權杖'); return; }
  try {
    showToast('讀取中…');
    let id = lsGet(K_ID);
    if (!id) { const g = await findCloudGist(); if (!g) { showToast('雲端還沒有備份'); return; } id = g.id; }
    const cloud = await readCloud(id);
    openConfirm(`用雲端的 ${cloud.items.length} 筆覆蓋本機的 ${collections.length} 筆？`, () => applyCloud(cloud, id));
  } catch (e) { showToast('還原失敗：' + ghErrMsg(e)); }
}
async function backupToCloudNow() {
  if (!lsGet(K_TOKEN)) { showToast('請先儲存權杖'); return; }
  try {
    if (!lsGet(K_ID)) {
      const g = await findCloudGist();
      if (g) {
        const cloud = await readCloud(g.id);
        openConfirm(`雲端已有 ${cloud.items.length} 筆備份。\n要用本機的 ${collections.length} 筆覆蓋雲端嗎？`, async () => { if (await runBackup(g.id)) showToast('已備份'); });
        return;
      }
    }
    clearTimeout(backupTimer); backupTimer = null;
    if (await runBackup(undefined, false, true)) showToast(`已備份 ${collections.length} 筆`);
  } catch (e) { showToast('備份失敗：' + ghErrMsg(e)); }
}
function removeToken() {
  openConfirm('移除權杖並停止自動備份？\n（雲端的備份不會被刪除）', () => {
    lsSet(K_TOKEN, ''); lsSet(K_ID, ''); lsSet(K_LAST, ''); lsSet(K_TS, ''); lsSet(K_DIRTY, '');
    clearTimeout(backupTimer); backupTimer = null; updateCloudUI(); showToast('已移除');
  });
}

/* 開啟 app / 回到前景時，比對雲端是否有另一台裝置的較新備份 */
let lastCloudCheck = 0, cloudChecking = false, declinedTs = '';
const sameContent = c => canon(c.items) === canon(collections) && (c.avatars === null || canonAv(c.avatars) === canonAv(actorAvatars));
const canon = arr => JSON.stringify(arr.map(i => [i.id, i.name, i.actor || '', i.code || '', i.url || '', i.img || '', (i.tags || []).join('\u0001'), i.fav ? 1 : 0]));
async function checkCloud(force) {
  const id = lsGet(K_ID);
  if (!lsGet(K_TOKEN) || !id || cloudChecking || backupBusy || backupTimer || navigator.onLine === false) return;
  if ($('drawer').classList.contains('open')) return; // 正在編輯：等關閉後再檢查
  if (!force && Date.now() - lastCloudCheck < 60000) return;
  if (!$('confirmModal').classList.contains('hidden')) return;
  lastCloudCheck = Date.now(); cloudChecking = true;
  try {
    const cloud = await readCloud(id);
    const dirty = !!lsGet(K_DIRTY);
    if (cloud.ts && cloud.ts === lsGet(K_TS)) { if (dirty) runBackup(); return; }
    if (sameContent(cloud)) { lsSet(K_TS, cloud.ts); lsSet(K_DIRTY, ''); updateCloudUI(); return; }
    if (declinedTs === cloud.ts) return;
    if (!$('confirmModal').classList.contains('hidden')) return;
    const n = cloud.items.length, m = collections.length;
    const msg = dirty
      ? `雲端有另一台裝置的備份（${n} 筆），但本機也有尚未同步的變更（${m} 筆）。\n要用雲端覆蓋本機嗎？\n（取消會保留本機，下次儲存時覆蓋雲端）`
      : `雲端有較新的備份（${n} 筆），本機 ${m} 筆。\n要用雲端更新本機嗎？\n（取消會保留本機，下次儲存時覆蓋雲端）`;
    openConfirm(msg, () => applyCloud(cloud, id));
    declinedTs = cloud.ts;
  } catch (e) { /* 靜默：背景檢查失敗不打擾使用者 */ }
  finally { cloudChecking = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkCloud(); });
window.addEventListener('online', () => checkCloud(true));

/* 長按「帳戶設定」標題 1 秒，顯示 / 隱藏雲端備份區塊 */
(function () {
  const t = $('settingsTitle'); let timer = null;
  const cancel = () => { clearTimeout(timer); timer = null; };
  t.addEventListener('pointerdown', () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      const box = $('cloudBox');
      box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) { toggleAdvanced(true); updateCloudUI(); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }, 1000);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => t.addEventListener(ev, cancel));
  t.addEventListener('contextmenu', e => e.preventDefault());
})();

function refreshAndHome() {
  if (quickHideOn && tripleTap('logo')) { setQuickHidden(true); return; } // 快速連點標誌三下 → 隱藏
  clearSearch(); switchTab(0); window.scrollTo({ top: 0, behavior: 'smooth' });
}
['codeInput', 'urlInput', 'imgInput'].forEach(id => { const el = $(id); el.addEventListener('input', () => checkDuplicate(el)); });

/* 離線與封面快取（需要同資料夾的 sw.js，並以 http(s) 開啟） */
if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'precache-done') showToast(`封面已存好 ${e.data.ok} / ${e.data.total} 張`);
  });
}
async function clearCoverCache() {
  const KEY = 'netflav-img-v1';
  let n = 0;
  try { if ('caches' in window && await caches.has(KEY)) n = (await (await caches.open(KEY)).keys()).length; } catch (e) {}
  if (!n) { showToast('目前沒有已存的封面'); return; }
  openConfirm(`清除已存的 ${n} 張封面？\n（收藏資料不會刪除，封面之後會重新載入）`, async () => {
    try { await caches.delete(KEY); showToast('已清除封面快取'); } catch (e) { showToast('清除失敗'); }
  });
}
function precacheCovers() {
  const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  if (!sw) { showToast('離線功能尚未啟用，請重新開啟 app 再試'); return; }
  const urls = [...new Set(collections.map(i => i.img).filter(u => /^https?:\/\//i.test(u || '')))];
  if (!urls.length) { showToast('沒有封面可以下載'); return; }
  showToast(`開始下載 ${urls.length} 張封面…`);
  sw.postMessage({ type: 'precache', urls });
}
/* 禁止雙指縮放（iOS）；雙擊放大由 CSS touch-action: manipulation 處理 */
['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault()));
window.addEventListener('resize', updateContainerHeight);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(updateContainerHeight);

/* 快速隱藏：三指點一下，或連點標誌三下 → 全黑畫面；在全黑畫面連點三下或再三指點一下 → 回來。
   隱藏狀態存在 sessionStorage，頁面被系統重新載入也維持隱藏 */
let quickHideOn = (() => { try { return localStorage.getItem('NF_QH') !== 'off'; } catch (e) { return true; } })();
const isQuickHidden = () => document.documentElement.classList.contains('quick-hidden');
function setQuickHidden(v) {
  document.documentElement.classList.toggle('quick-hidden', !!v);
  try { v ? sessionStorage.setItem('NF_HIDDEN', '1') : sessionStorage.removeItem('NF_HIDDEN'); } catch (e) {}
}
const tapTimes = {};
function tripleTap(key) { // 700 毫秒內連續三次
  const now = Date.now(), t = (tapTimes[key] || []).filter(x => now - x < 700);
  t.push(now); tapTimes[key] = t;
  if (t.length >= 3) { tapTimes[key] = []; return true; }
  return false;
}
function setQuickHideEnabled(on) {
  quickHideOn = !!on;
  try { localStorage.setItem('NF_QH', quickHideOn ? 'on' : 'off'); } catch (e) {}
  updateQuickHideUI();
}
function updateQuickHideUI() {
  $('qhBtnOn').classList.toggle('active', quickHideOn);
  $('qhBtnOff').classList.toggle('active', !quickHideOn);
}
function quickHideNow() { toggleFilterDrawer(false); setTimeout(() => setQuickHidden(true), 250); }
document.addEventListener('touchstart', e => {
  if (e.touches && e.touches.length === 3 && (quickHideOn || isQuickHidden())) setQuickHidden(!isQuickHidden());
}, { passive: true });
$('hideScreen').addEventListener('pointerdown', e => { if (e.isPrimary && tripleTap('screen')) setQuickHidden(false); }); // 多指同時按只算一次，避免和三指手勢互相抵消

window.onload = () => {
  updateQuickHideUI();
  updateAppearanceUI();
  updateLayout(currentLayout);
  updatePageSize(pageSize);
  handleHash();
  updateCloudUI();
  setTimeout(() => checkCloud(true), 2500);
};
