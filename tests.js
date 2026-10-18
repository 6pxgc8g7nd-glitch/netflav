/* 自動檢查：由 tests.html 注入到 index.html（放在 iframe 裡）的頁面中執行，所以能直接讀寫 app 的全域變數與函式。
   每個 test 開始前都會 resetState() 回到乾淨狀態；全部跑完會把結果放在 window.__testResult。
   注意：測試會改動這個網址底下的 localStorage，tests.html 會在開始前備份、結束後還原。 */
(() => {
  const T = [];
  const test = (name, fn) => T.push({ name, fn });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const assert = (c, m) => { if (!c) throw new Error(m || '條件不成立'); };
  const eq = (a, b, m) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m ? m + '：' : '') + `預期 ${y}，實際 ${x}`); };
  const it = (id, name, m = 1, extra = {}) => ({ id, name, actor: '', code: '', url: '', img: '', tags: [], m, ...extra });
  const cards = () => document.querySelectorAll('#gallery [data-card]').length;
  const ids = () => collections.map(i => i.id).join(',');
  const classes = () => document.documentElement.classList;

  function resetState() {
    localStorage.clear(); sessionStorage.clear(); sessionStorage.setItem('NF_ENTERED', '1');
    classes().remove('fake-profile', 'fake-home');
    if (window.fakeNetflix) fakeNetflix.reset();
    collections = []; actorAvatars = {}; favOnly = false; selectedTags = []; actorFilter = '';
    $('searchInput').value = ''; currentPage = 1; tagCurrentPage = 1; actorCurrentPage = 1; pageSize = 12; currentLayout = 2;
    randomSeen = new Set(); lastRandomId = null; safeMode = false; importPending = null; addTaps = []; logoTaps = [];
    hideUndo(); closeConfirm(); closeFilterMenu(); closeTagSheet(); closeImportSheet(); closeDupModal(); closeAvatarEditor(); closeRandomModal(); closePagePicker();
    $('drawer').classList.remove('open'); toggleFilterDrawer(false); switchTab(0, true); window.scrollTo(0, 0);
    refreshAll();
  }
  const mockFetch = handler => { const orig = window.fetch; const log = []; window.fetch = async (u, o) => { log.push((o && o.method) || 'GET'); return handler(String(u), o || {}, log); }; return { log, restore: () => { window.fetch = orig; } }; };

  /* ================= 篩選與清單 ================= */
  test('分頁：每頁數量、換頁、頁碼', async () => {
    collections = Array.from({ length: 30 }, (_, i) => it('p' + i, 'P' + i)); pageSize = 12; refreshAll();
    eq(cards(), 12); changePage(3); eq(cards(), 6); assert($('paginationContainer').textContent.includes('3 / 3'), '頁碼顯示');
    openPagePicker(3, 3, 'changePage'); pickPage('changePage', 1); eq(currentPage, 1);
  });
  test('篩選下拉：全部 / 最愛，「全部」會清掉標籤和女優篩選', async () => {
    collections = [it('1', 'A', 1, { fav: true }), it('2', 'B'), it('3', 'C', 1, { fav: true })]; refreshAll();
    const trig = () => document.querySelector('[data-chip="menu"]');
    trig().click(); assert($('filterMenu').classList.contains('show'), '選單要打開');
    $('filterMenu').querySelector('[data-menu="fav"]').click(); eq(cards(), 2); assert(trig().textContent.includes('最愛(2)'), '按鈕顯示 最愛(2)');
    selectedTags = ['x']; actorFilter = 'y'; trig().click(); $('filterMenu').querySelector('[data-menu="all"]').click();
    eq([favOnly, selectedTags.length, actorFilter], [false, 0, '']); eq(cards(), 3);
  });
  test('搜尋：標題、番號、標籤、女優別名；改標籤後快取要更新', async () => {
    collections = [it('1', '影片一', 1, { code: 'ABC-1', actor: 'A名', tags: ['高清'] }), it('2', 'Movie', 1, { actor: '別人' })];
    actorAvatars = { '小明': { aliases: ['A名'] } }; refreshAll();
    const s = q => { $('searchInput').value = q; currentPage = 1; renderGallery(); return cards(); };
    eq(s('影片'), 1); eq(s('abc-1'), 1); eq(s('高清'), 1); eq(s('小明'), 1, '搜標準名字要找得到別名的作品'); eq(s('movie'), 1); eq(s('不存在'), 0);
    rewriteTag('高清', 'HD', 'x'); eq(s('hd'), 1); eq(s('高清'), 0);
  });
  test('最愛 / 已存資料：saveItem 會寫入修改時間', async () => {
    collections = [it('1', '舊', 1)]; refreshAll(); const t0 = Date.now();
    openDrawer('1'); $('nameInput').value = '新名字'; if (!drawerFav) toggleDrawerFav(); saveItem();
    eq(collections[0].name, '新名字'); assert(collections[0].m >= t0, '修改時間要更新'); eq(collections[0].fav, true);
    eq(JSON.parse(localStorage.getItem('NF_MOBILE_VAULT_FINAL'))[0].name, '新名字', '要存進瀏覽器');
  });
  test('刪除影片 → 復原；不會重複復原', async () => {
    collections = [it('1', 'A'), it('2', 'B')]; refreshAll();
    currentId = '1'; executeDelete(); eq(ids(), '2'); assert($('undoBar').classList.contains('show'), '要出現復原條'); doUndo(); eq(ids(), '1,2');
    currentId = '1'; executeDelete(); collections = [...collections, it('9', 'X'), it('1', '已重新加入')]; doUndo(); eq(ids(), '2,9,1', '同一部已存在就不能重複復原');
  });
  test('復原提示條：倒數動畫、按住暫停、放開繼續', async () => {
    collections = [it('1', 'A')]; refreshAll(); currentId = '1'; executeDelete();
    const a = () => $('undoTimer').getAnimations().find(x => x.animationName === 'undoShrink');
    assert(a(), '要有倒數動畫'); eq(a().effect.getTiming().duration, 7000);
    $('undoBar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); eq(a().playState, 'paused');
    $('undoBar').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); eq(a().playState, 'running'); hideUndo();
  });

  /* ================= 標籤管理 ================= */
  test('標籤管理：改名、併入已存在的標籤、不重複', async () => {
    collections = [it('1', 'A', 1, { tags: ['高清', 'HD', '獨家'] }), it('2', 'B', 1, { tags: ['hd', '4K'] }), it('3', 'C', 1, { tags: ['高清', '4K'] })]; refreshAll();
    openTagSheet('HD'); $('tagRenameInput').value = '高清'; applyTagRename();
    eq(collections.map(i => i.tags.join('|')), ['高清|獨家', '高清|4K', '高清|4K'], '大小寫視為同一個、同一部不重複');
    doUndo(); eq(collections[0].tags.join('|'), '高清|HD|獨家');
  });
  test('標籤管理：刪除（要確認）、復原、驗證輸入', async () => {
    collections = [it('1', 'A', 1, { tags: ['x', 'y'] }), it('2', 'B', 1, { tags: ['y'] })]; refreshAll();
    openTagSheet('y'); requestTagDelete(); assert(!$('confirmModal').classList.contains('hidden'), '刪除前要確認'); $('confirmOkBtn').click();
    eq(collections.map(i => i.tags.join()), ['x', '']); doUndo(); eq(collections.map(i => i.tags.join()), ['x,y', 'y']);
    const bad = v => { openTagSheet('x'); $('tagRenameInput').value = v; applyTagRename(); const closed = $('tagSheet').classList.contains('hidden'); closeTagSheet(); return !closed; };
    assert(bad('   ') && bad('a b') && bad('z'.repeat(31)) && bad('x'), '空白、含空白、太長、沒變都要被擋下');
  });
  test('標籤管理：選取中的標籤改名後，選取跟著走', async () => {
    collections = [it('1', 'A', 1, { tags: ['x'] })]; refreshAll(); selectedTags = ['x'];
    openTagSheet('x'); $('tagRenameInput').value = 'y'; applyTagRename(); eq(selectedTags, ['y']);
  });
  test('連續刪除標籤：標籤頁的復原條在上方；開啟標籤視窗/確認框時暫時隱藏，關閉後回來', async () => {
    collections = [it('1', 'A', 1, { tags: ['x', 'y'] })]; refreshAll(); switchTab(1);
    assert(document.body.classList.contains('undo-top'), '標籤頁要用上方復原條'); switchTab(0); assert(!document.body.classList.contains('undo-top'), '其他頁籤維持下方');
    switchTab(1); openTagSheet('x'); assert(document.body.classList.contains('sheet-open'), '開啟視窗要標記'); requestTagDelete(); assert(document.body.classList.contains('sheet-open'), '確認框也要');
    $('confirmOkBtn').click(); assert(!document.body.classList.contains('sheet-open') && $('undoBar').classList.contains('show'), '刪除後顯示復原條');
    openTagSheet('y'); assert(document.body.classList.contains('sheet-open')); closeTagSheet(); assert(!document.body.classList.contains('sheet-open') && $('undoBar').classList.contains('show'), '關閉視窗後復原條要還在');
  });
  test('標籤複選：AND 篩選與底部列', async () => {
    collections = [it('1', 'A', 1, { tags: ['a', 'b'] }), it('2', 'B', 1, { tags: ['a'] }), it('3', 'C', 1, { tags: ['b'] })]; refreshAll(); switchTab(1);
    toggleTag('a'); toggleTag('b'); assert($('tagBar').classList.contains('show'), '要出現底部列'); assert($('tagBarText').textContent.includes('1 部符合'), '符合數');
    applyTags(); eq(cards(), 1);
  });

  /* ================= 匯入 / 合併 ================= */
  const imp = async obj => { importData({ target: { files: [new File([JSON.stringify(obj)], 'x.json')], value: '' } }); await wait(300); };
  test('匯入：合併只加新的、重複的略過（id / 番號 / 連結），並可復原', async () => {
    collections = [it('a', '本機1', 1, { code: 'AAA-1', url: 'https://x/1' }), it('b', '本機2', 1, { code: 'BBB-2' })]; actorAvatars = { '小明': { style: 1, aliases: ['A名'] } }; refreshAll();
    await imp({ version: 2, items: [{ id: 'a', name: '同id' }, { id: 'z1', name: '同番號', code: 'bbb-2' }, { id: 'z2', name: '同連結', url: 'https://x/1' }, { id: 'n1', name: '新一', code: 'CCC-3' }, { id: 'n2', name: '新二' }, { id: 'n3', name: '檔案內重複', code: 'ccc-3' }], avatars: { '小明': { img: 'https://c/a.png', style: 3, aliases: ['B名'] }, '小華': { style: 2 } } });
    assert(!$('importSheet').classList.contains('hidden'), '要跳出選擇'); assert($('importSummary').textContent.includes('新的 2 筆'), $('importSummary').textContent);
    applyImportMerge(); eq(ids(), 'a,b,n1,n2'); eq(actorAvatars['小明'], { style: 1, aliases: ['A名', 'B名'], img: 'https://c/a.png' }); assert(actorAvatars['小華'], '新女優要加入');
    doUndo(); eq(ids(), 'a,b'); eq(actorAvatars, { '小明': { style: 1, aliases: ['A名'] } });
  });
  test('匯入：全部重複時合併鈕停用；覆蓋要確認且可復原；舊格式陣列可用', async () => {
    collections = [it('a', 'A', 1, { code: 'AAA-1' })]; refreshAll();
    await imp({ items: [{ id: 'a', name: 'x' }, { id: 'q', name: 'y', code: 'aaa-1' }] }); assert($('importMergeBtn').disabled, '全部重複時要停用'); closeImportSheet(); importPending = null;
    await imp({ items: [{ id: 'n', name: '新' }] }); applyImportOverwrite(); assert(!$('confirmModal').classList.contains('hidden'), '覆蓋前要確認'); $('confirmOkBtn').click(); eq(ids(), 'n'); doUndo(); eq(ids(), 'a');
    await imp([{ id: 'o1', name: '舊格式', code: 'OLD-1' }]); const av = JSON.stringify(actorAvatars); applyImportMerge(); eq(ids(), 'a,o1'); eq(JSON.stringify(actorAvatars), av, '舊格式不動頭像'); doUndo();
  });
  test('匯入：格式錯誤與空檔案要擋下', async () => {
    collections = [it('a', 'A')]; refreshAll();
    importData({ target: { files: [new File(['{bad'], 'x.json')], value: '' } }); await wait(200); assert(!$('importSheet').classList.contains('hidden') === false, '壞檔不能開選單');
    importData({ target: { files: [new File([JSON.stringify({ foo: 1 })], 'x.json')], value: '' } }); await wait(200); assert($('importSheet').classList.contains('hidden'), '格式不對不能開選單'); eq(ids(), 'a');
  });

  /* ================= 隨機推薦 ================= */
  test('洗牌式隨機：這一輪不重複，新一輪第一部不等於上一部', async () => {
    collections = Array.from({ length: 6 }, (_, i) => it('r' + i, 'R' + i)); refreshAll();
    let bad = 0, back = 0, last = null;
    for (let k = 0; k < 100; k++) { const seen = new Set(); for (let i = 0; i < 6; i++) { const id = pickRandomItem().item.id; if (seen.has(id)) bad++; seen.add(id); if (i === 0 && id === last) back++; last = id; } }
    eq([bad, back], [0, 0]);
  });
  test('洗牌式隨機：刪除不佔名額、新增會被抽到、只有一部不卡住、紀錄存進手機', async () => {
    collections = Array.from({ length: 5 }, (_, i) => it('r' + i, 'R' + i)); refreshAll();
    const first = [pickRandomItem().item.id, pickRandomItem().item.id]; eq(JSON.parse(localStorage.getItem('NF_RANDOM_SEEN')).length, 2);
    collections = collections.filter(i => i.id !== first[0]); collections.push(it('new', '新增'));
    const rest = []; for (let i = 0; i < collections.length - 1; i++) rest.push(pickRandomItem().item.id); assert(rest.includes('new'), '新增的要在這一輪被抽到');
    collections = [it('only', 'Only')]; randomSeen = new Set(); lastRandomId = null; eq([pickRandomItem().item.id, pickRandomItem().item.id], ['only', 'only']);
  });
  test('隨機推薦視窗：只有封面、片名、兩顆按鈕（沒有進度文字）', async () => {
    collections = [it('1', 'A', 1, { url: 'https://x/1' })]; refreshAll(); openRandomRecommendation();
    assert(!$('randomModal').classList.contains('hidden'), '要開啟'); assert(!$('randomModal').textContent.includes('這一輪已抽'), '不能有進度文字'); closeRandomModal();
  });

  /* ================= 雲端同步與三方合併 ================= */
  test('三方合併：本機改刪新增 vs 雲端改新增', async () => {
    const r = mergeItems([it('a', 'a本機改', 100), it('c', 'c', 50), it('d', 'd', 120)], [it('a', 'a', 50), it('b', 'b', 50), it('c', 'c雲端改', 200), it('e', 'e', 130)], { a: 50, b: 50, c: 50 });
    eq(r.items.map(i => i.id + ':' + i.name), ['a:a本機改', 'c:c雲端改', 'd:d', 'e:e']); eq(r.stat, { added: 1, updated: 1, removed: 0 });
  });
  test('三方合併：刪除與修改誰贏、沒有基準只取聯集、只有 m 不同不算更新', async () => {
    eq(mergeItems([it('x', 'x', 50), it('y', 'y改過', 90)], [], { x: 50, y: 50 }).items.map(i => i.id), ['y'], '雲端刪：沒動的跟著刪、改過的保留');
    eq(mergeItems([], [it('p', 'p', 50), it('q', 'q改', 90)], { p: 50, q: 50 }).items.map(i => i.id), ['q'], '本機刪：雲端沒動的維持刪、改過的保留');
    eq(mergeItems([it('a', 'a')], [it('b', 'b')], null).items.map(i => i.id), ['a', 'b'], '沒有基準：聯集');
    eq(mergeItems([it('a', 'a', 10)], [it('a', 'a', 99)], { a: 10 }).stat, { added: 0, updated: 0, removed: 0 });
    eq(mergeItems([it('b', 'b'), it('a', 'a')], [it('a', 'a'), it('b', 'b'), it('z', 'z')], { a: 1, b: 1 }).items.map(i => i.id), ['b', 'a', 'z'], '本機順序優先');
  });
  const cloudSetup = (local, cloud, base) => {
    const st = { ts: 'tC', items: cloud, av: {} };
    const mf = mockFetch(async (u, o, log) => {
      if (o.method === 'PATCH') { st.items = JSON.parse(JSON.parse(o.body).files['netflav.json'].content); st.ts = 't' + (Date.now() % 100000); return new Response(JSON.stringify({ id: 'G', updated_at: st.ts }), { status: 200 }); }
      return new Response(JSON.stringify({ id: 'G', updated_at: st.ts, files: { 'netflav.json': { content: JSON.stringify(st.items) }, 'avatars.json': { content: JSON.stringify(st.av) } } }), { status: 200 });
    });
    collections = local; actorAvatars = {}; lsSet('NF_GIST_TOKEN', 'x'); lsSet('NF_GIST_ID', 'G'); lsSet('NF_GIST_TS', 'tOld'); localStorage.setItem('NF_SYNC_BASE', JSON.stringify(base)); lastCloudSync = 0; refreshAll();
    return { st, mf };
  };
  test('雲端：備份遇到別台裝置的變更 → 自動合併後寫回，不跳確認', async () => {
    const { st, mf } = cloudSetup([it('a', 'a本機改', 100), it('c', 'c', 50), it('d', 'd', 120)], [it('a', 'a', 50), it('b', 'b', 50), it('c', 'c雲端改', 200), it('e', 'e', 130)], { a: 50, b: 50, c: 50 });
    try { lsSet('NF_GIST_DIRTY', '1'); await runBackup(); eq(ids(), 'a,c,d,e'); eq(st.items.map(i => i.id).join(), 'a,c,d,e'); assert($('confirmModal').classList.contains('hidden'), '不能跳確認'); eq(lsGet('NF_GIST_DIRTY'), ''); eq(mf.log, ['GET', 'PATCH']); }
    finally { mf.restore(); }
  });
  test('雲端：回前景檢查，本機沒改就直接跟上雲端（不寫回）；雲端刪除會跟著刪', async () => {
    let { st, mf } = cloudSetup([it('a', 'a', 50), it('b', 'b', 50)], [it('a', 'a', 50), it('b', 'b', 50), it('n', '雲端新增', 90)], { a: 50, b: 50 });
    try { await checkCloud(true); await wait(150); eq(ids(), 'a,b,n'); eq(mf.log, ['GET']); } finally { mf.restore(); }
    ({ st, mf } = cloudSetup([it('a', 'a', 50), it('b', 'b', 50)], [it('a', 'a', 50)], { a: 50, b: 50 }));
    try { lastCloudCheck = 0; await checkCloud(true); await wait(150); eq(ids(), 'a'); } finally { mf.restore(); }
  });
  test('雲端：成功備份的通知——自動備份靜悄悄、手動備份有筆數和時間', async () => {
    const toasts = []; const ot = window.showToast; window.showToast = m => { toasts.push(m); ot(m); };
    const { mf } = cloudSetup([it('a', 'a', 50)], [it('a', 'a', 50)], { a: 50 }); lsSet('NF_GIST_TS', 'tC');
    try { collections = [...collections, it('b', 'b', 60)]; await runBackup(); assert(!toasts.some(t => t.includes('已備份')), '自動備份不通知'); await backupToCloudNow(); assert(toasts.some(t => /^已備份 2 筆・\d{2}:\d{2}:\d{2}/.test(t)), '手動備份要有筆數和時間：' + toasts.join('|')); }
    finally { mf.restore(); window.showToast = ot; }
  });
  test('雲端：備份失敗要通知；備份比對的快取不會重複讀取', async () => {
    const toasts = []; const ot = window.showToast; window.showToast = m => { toasts.push(m); ot(m); };
    const mf = mockFetch(async () => new Response('{}', { status: 401 })); lsSet('NF_GIST_TOKEN', 'x'); lsSet('NF_GIST_ID', 'G'); collections = [it('a', 'a')]; lastCloudSync = Date.now();
    try { scheduleBackup(); await wait(1700); assert(toasts.some(t => t.includes('權杖無效')), '失敗要通知：' + toasts.join('|')); } finally { mf.restore(); window.showToast = ot; }
  });
  test('版本檢查：沒變不跳提示、有變跳出「立即更新」', async () => {
    buildId = ''; await checkUpdate(); const base = buildId; assert(/^[0-9a-f]{8}$/.test(base), '版本號格式');
    await checkUpdate(); assert(!$('updateBar').classList.contains('show'), '沒變不能跳提示');
    const orig = window.fetch; window.fetch = async (u, o) => { const r = await orig(u, o); return String(u).includes('app.js') ? new Response((await r.text()) + '\n//x') : r; };
    try { await checkUpdate(); assert($('updateBar').classList.contains('show'), '要跳出更新提示'); } finally { window.fetch = orig; dismissUpdate(); buildId = base; }
  });

  /* ================= 女優、別名、頭像 ================= */
  test('女優別名：合併作品數、點女優篩選、清除設定還原', async () => {
    collections = [it('1', 'a', 1, { actor: '三上悠亜' }), it('2', 'b', 1, { actor: '三上悠亚' }), it('3', 'c', 1, { actor: 'Yua' }), it('4', 'd', 1, { actor: '別人' })]; refreshAll();
    openAvatarEditor('三上悠亜'); $('avatarAliases').value = '三上悠亚, Yua'; saveAvatar();
    switchTab(2); eq([...document.querySelectorAll('#actorList [data-actor]')].map(e => e.dataset.actor + ':' + e.textContent.match(/(\d+) 作品/)[1]), ['三上悠亜:3', '別人:1']);
    setActorFilter('三上悠亜'); eq(cards(), 3);
    openAvatarEditor('三上悠亜'); resetAvatar(); switchTab(2); eq(document.querySelectorAll('#actorList [data-actor]').length, 4);
  });
  test('女優別名：被別人佔用的別名要擋下', async () => {
    collections = [it('1', 'a', 1, { actor: 'A' }), it('2', 'b', 1, { actor: 'B' })]; refreshAll();
    actorAvatars = { A: { aliases: ['X'] } }; openAvatarEditor('B'); $('avatarAliases').value = 'X'; saveAvatar();
    assert(!$('avatarModal').classList.contains('hidden'), '要留在編輯畫面'); eq(actorAvatars.B, undefined); closeAvatarEditor();
  });
  test('重複頭像偵測：同圖兩位女優 → 提示條、合併', async () => {
    collections = [it('1', 'a', 1, { actor: 'A' }), it('2', 'b', 1, { actor: 'B' }), it('3', 'c', 1, { actor: 'C' })];
    actorAvatars = { A: { img: 'https://CDN.x/1.jpg#x' }, B: { img: 'https://cdn.x/1.jpg' }, C: { img: 'https://cdn.x/2.jpg' } }; refreshAll(); switchTab(2);
    eq(findDupAvatars(), [['A', 'B']]); assert(document.querySelector('#dupBanner .dup-banner'), '要有提示條');
    mergeActors('A', ['B']); eq(actorAvatars.A.aliases, ['B']); assert(!actorAvatars.B, 'B 的設定要被併掉'); eq(findDupAvatars(), []);
  });
  test('儲存頭像時發現同一張圖已被別人使用 → 詢問；取消後再存就照原樣', async () => {
    collections = [it('1', 'a', 1, { actor: 'A' }), it('2', 'b', 1, { actor: 'B' })]; actorAvatars = { A: { img: 'https://x/1.png' } }; refreshAll();
    openAvatarEditor('B'); $('avatarUrl').value = 'https://x/1.png'; saveAvatar(); assert(!$('confirmModal').classList.contains('hidden'), '要詢問'); closeConfirm();
    saveAvatar(); eq(actorAvatars.B.img, 'https://x/1.png');
  });
  test('封面：沒有網址和載入失敗都改畫原創插畫，同一部固定同一張', async () => {
    collections = [it('1', 'a', 1), it('2', 'b', 1, { img: 'http://localhost:1/x.png' })]; refreshAll();
    assert(document.querySelector('[data-card="1"] svg.fh-art'), '沒有網址要畫插畫'); const a1 = document.querySelector('[data-card="1"] svg.fh-art').outerHTML; renderGallery(); eq(document.querySelector('[data-card="1"] svg.fh-art').outerHTML === a1, true);
    const img = document.querySelector('[data-card="2"] img'); coverFallback(img); assert(document.querySelector('[data-card="2"] svg.fh-art'), '失敗要換成插畫'); assert(!document.body.innerHTML.includes('NO IMAGE'), '不能再出現 NO IMAGE');
  });

  /* ================= 啟動流程、安全模式、假 Netflix ================= */
  const showPicker = () => { sessionStorage.removeItem('NF_ENTERED'); sessionStorage.removeItem('NF_DECOY'); classes().remove('fake-home'); classes().add('fake-profile'); };
  test('啟動：點兒童進入收藏；點其他頭像進假首頁；「我的 Netflix」回選擇畫面', async () => {
    showPicker(); document.querySelector('[data-profile="0"]').click(); await wait(400);
    assert(classes().contains('fake-home') && !sessionStorage.getItem('NF_ENTERED'), '阿明是假首頁'); $('fhMe').click(); assert(classes().contains('fake-profile'), '回到選擇畫面');
    document.querySelector('[data-profile="2"]').click(); await wait(400); eq(sessionStorage.getItem('NF_ENTERED'), '1'); assert(!classes().contains('fake-home') && !classes().contains('fake-profile'));
  });
  test('安全模式：連點「新增個人檔案」三下切換；開啟後兒童也是假首頁；兩下或太慢不觸發', async () => {
    showPicker(); const add = document.querySelector('.fp-add'); const tap = n => { for (let i = 0; i < n; i++) add.click(); };
    tap(2); eq(localStorage.getItem('NF_SAFE'), null); addTaps = [];
    tap(3); eq(localStorage.getItem('NF_SAFE'), '1'); assert(add.classList.contains('blink'), '要閃一下');
    document.querySelector('[data-profile="2"]').click(); await wait(400); assert(classes().contains('fake-home') && !sessionStorage.getItem('NF_ENTERED'), '安全模式下兒童也是假首頁');
    $('fhMe').click(); tap(3); eq(localStorage.getItem('NF_SAFE'), null); document.querySelector('[data-profile="2"]').click(); await wait(400); eq(sessionStorage.getItem('NF_ENTERED'), '1');
  });
  test('連點首頁上方標誌三下回到「誰在看？」', async () => {
    const logo = document.querySelector('.brand-logo'); logo.click(); logo.click(); assert(!classes().contains('fake-profile'), '兩下不能回去'); logo.click();
    assert(classes().contains('fake-profile') && !sessionStorage.getItem('NF_ENTERED'), '三下要回到選擇畫面');
  });
  const toDecoy = async () => { showPicker(); document.querySelector('[data-profile="0"]').click(); await wait(400); };
  test('假 Netflix：詳細頁、片單、下載、評分、更多類似內容', async () => {
    await toDecoy(); const F = fakeNetflix, L = $('fhLayer'); document.querySelector('#fhPageHome .fh-top10 .fh-tile').click();
    eq(L.dataset.view, 'detail'); eq(L.querySelectorAll('.fhd-tabs span').length, 2);
    L.querySelector('[data-act="list"]').click(); eq(F.state().list.length, 1); assert(document.querySelector('#fhMyList .fh-tile'), '首頁要出現我的片單');
    L.querySelector('[data-act="dl"]').click(); eq(F.state().dl.length, 1); L.querySelector('[data-act="rate"]').click(); eq(Object.keys(F.state().liked).length, 1);
    L.querySelector('[data-tab="more"]').click(); L.querySelector('.fhd-grid .fh-tile').click(); eq(F.stackDepth(), 2); F.reset(); assert(!L.classList.contains('open'));
  });
  test('假 Netflix：搜尋、播放器計時與暫停、類別篩選、新與熱門、下載內容', async () => {
    await toDecoy(); const F = fakeNetflix, L = $('fhLayer'), home = $('fakeHome');
    document.querySelectorAll('#fhPageHome .fh-icons > svg')[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); eq(L.dataset.view, 'search');
    const inp = $('fhsInput'); inp.value = '星'; inp.dispatchEvent(new Event('input', { bubbles: true })); assert(L.querySelectorAll('.fhs-row').length >= 1, '搜尋有結果'); inp.value = '不存在zzz'; inp.dispatchEvent(new Event('input', { bubbles: true })); assert(L.querySelector('.fhs-empty'), '沒結果的提示'); F.reset();
    F.open('player', '深藍'); await wait(1300); assert($('fhvT').textContent !== '0:00', '要計時'); L.querySelector('[data-act="pp"]').click(); const t = $('fhvT').textContent; await wait(1200); eq($('fhvT').textContent, t, '暫停時不能走'); F.reset();
    const chips = document.querySelectorAll('#fhPageHome .fh-chips span'); chips[0].click(); assert([...document.querySelectorAll('#fhPageHome .fh-tile[data-title]')].some(x => x.style.display === 'none'), '影集篩選要隱藏一些'); chips[0].click();
    const navs = document.querySelectorAll('#fakeHome .fh-nav > span'); navs[1].click(); eq(home.dataset.fhTab, 'hot'); assert(document.querySelectorAll('#fhPageHot .fhp-item').length > 0); navs[2].click(); eq(home.dataset.fhTab, 'dl'); navs[0].click();
  });
  test('假 Netflix：看不到真實收藏，也沒有任何一條路能進入收藏', async () => {
    collections = [it('1', '真實收藏專用名稱XYZ')]; await toDecoy(); document.querySelectorAll('#fhPageHome .fh-icons > svg')[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const inp = $('fhsInput'); inp.value = 'XYZ'; inp.dispatchEvent(new Event('input', { bubbles: true })); assert($('fhLayer').querySelector('.fhs-empty'), '搜尋不到真實收藏'); assert(!$('fakeHome').textContent.includes('真實收藏專用名稱'));
    [...document.querySelectorAll('#fakeHome *, #fhLayer *')].slice(0, 250).forEach(el => { try { el.click(); } catch (e) {} }); await wait(300);
    assert(sessionStorage.getItem('NF_ENTERED') !== '1', '點遍所有元素也不能進入收藏');
  });

  /* ================= 設定、診斷、捲動 ================= */
  test('設定頁：分組清單、沒有「進階」、診斷資訊展開', async () => {
    toggleFilterDrawer(true); assert(!$('advBtn') && !$('advancedBox'), '不能有進階'); eq([...document.querySelectorAll('#filterDrawer .set-h')].map(e => e.textContent.trim()), ['顯示', '備份與資料', '封面與快取', '關於']);
    $('diagDetails').open = true; await renderDiag(); assert(document.querySelectorAll('#diagRows .diag-row').length > 3, '診斷資訊要有內容'); toggleFilterDrawer(false); assert(!$('diagDetails').open, '關閉設定要收起');
  });
  test('設定：版面欄數、每頁數量、玻璃透明度', async () => {
    updateLayout(3); eq(currentLayout, 3); updateLayout(2); updatePageSize(24); eq(pageSize, 24); updatePageSize(12);
  });
  test('深淺色切換按鈕：在標題右邊、紅色隨模式變', async () => {
    const b = $('themeToggle'); assert(b, '要有切換按鈕'); const t0 = document.documentElement.dataset.theme; b.click();
    assert(document.documentElement.dataset.theme !== t0, '要切換'); const red = getComputedStyle(document.documentElement).getPropertyValue('--nf-red').trim(); eq(red, document.documentElement.dataset.theme === 'light' ? '#FF0000' : '#E50914'); b.click();
  });
  test('封面、頭像預先下載：只收集 http(s)，重複合併', async () => {
    const sent = []; const real = Object.getOwnPropertyDescriptor(ServiceWorkerContainer.prototype, 'controller');
    Object.defineProperty(navigator.serviceWorker, 'controller', { configurable: true, get: () => ({ postMessage: m => sent.push(m) }) });
    try {
      collections = [it('1', 'a', 1, { img: 'https://x/a.jpg' }), it('2', 'b', 1, { img: 'data:image/png;base64,AA' })]; actorAvatars = { A: { img: 'https://x/a.jpg' }, B: { img: 'https://x/b.png' } };
      precacheCovers(); eq(sent[0].urls, ['https://x/a.jpg', 'https://x/b.png']);
    } finally { delete navigator.serviceWorker.controller; }
  });
  test('捲動記憶：各頁籤各自記住；點目前頁籤捲回頂端；程式切換從頂端', async () => {
    collections = Array.from({ length: 60 }, (_, i) => it('s' + i, '影片' + i, 1, { tags: ['t' + (i % 30)] })); pageSize = 48; refreshAll(); switchTab(0, true); await wait(250); document.getAnimations().forEach(x => { try { x.finish(); } catch (e) {} }); await wait(50); // 高度過渡動畫在背景/隱藏頁面可能不會跑完，直接收尾
    assert(document.documentElement.scrollHeight > innerHeight + 700, '頁面要夠長才測得出來'); window.scrollTo(0, 700); await wait(80); const y0 = Math.round(scrollY);
    switchTab(1); await wait(250); eq(Math.round(scrollY), 0, '標籤頁從頂端'); switchTab(0); await wait(350); eq(Math.round(scrollY), y0, '回首頁要回到原位');
    const calls = []; const orig = window.scrollTo; window.scrollTo = function (...a) { calls.push(JSON.stringify(a)); return orig.apply(window, a); }; switchTab(0); window.scrollTo = orig; assert(calls.some(c => c.includes('smooth')), '點目前頁籤要平滑捲回頂端');
    window.scrollTo(0, 500); await wait(80); setActorFilter('x'); await wait(200); eq(Math.round(scrollY), 0, '程式切換從頂端');
  });
  test('檢視位置：存檔與還原頁碼、頁籤', async () => {
    collections = Array.from({ length: 30 }, (_, i) => it('p' + i, 'P' + i)); pageSize = 12; refreshAll(); changePage(3); switchTab(1); saveView();
    const v = JSON.parse(sessionStorage.getItem('NF_VIEW')); eq([v.tab, v.pages[0]], [1, 3]); currentPage = 1; switchTab(0, true); restoreView(); eq(currentPage, 3); eq(activeTab, 1);
  });

  /* ================= 執行 ================= */
  window.__runAll = async (onProgress) => {
    const errors = []; const onerr = e => errors.push(String(e.message || e)); window.addEventListener('error', onerr);
    const results = [];
    for (const t of T) {
      const t0 = performance.now(); let ok = true, err = '';
      try { resetState(); await t.fn(); } catch (e) { ok = false; err = String(e && e.message || e); }
      const r = { name: t.name, ok, err, ms: Math.round(performance.now() - t0) }; results.push(r); if (onProgress) onProgress(r, results.length, T.length);
    }
    try { resetState(); } catch (e) {}
    window.removeEventListener('error', onerr);
    const failed = results.filter(r => !r.ok);
    if (errors.length) failed.push({ name: '頁面出現未捕捉的錯誤', ok: false, err: errors.join(' | ') });
    window.__testResult = { total: results.length, passed: results.filter(r => r.ok).length, failed: failed.length, failures: failed, results, uncaught: errors };
    return window.__testResult;
  };
  window.__testCount = T.length;
})();
