// Google 드라이브 동기화 — 각자 자기 구글 계정으로 로그인하면, 자기 드라이브의 'AI 서논술형 채점' 폴더에
// 채점 기록(state.json), 설정·API 키(settings.json), 답안 그림(쪽마다 jpg)을 둔다. 다른 컴퓨터에서 같은 계정으로 로그인하면 이어서 한다.
// 권한은 drive.file(이 앱이 만든 파일만) 하나. 이 컴퓨터(IndexedDB)가 먼저 저장되고 드라이브는 뒤따라 올라간다.
'use strict';

const Sync = (() => {
  // Google Cloud 콘솔에서 만든 '웹 애플리케이션' OAuth 클라이언트 ID (비밀 아님)
  const CLIENT_ID = '988372733772-brfgo98hnnvv54e0gh59784k1rpdpfk4.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3';
  const UP = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'AI 서논술형 채점';
  const MK = 'aigrader-sync', TK = 'aigrader-gtoken', QK = 'aigrader-upq';

  let token = null;
  let state = 'off';           // off | need | ok | busy | error
  let note = '';
  let remoteImgs = null;       // 그림 key → 드라이브 파일 id
  let pushTimer = null, pushing = false, pulling = false, quiet = false;
  const listeners = [];

  const enabled = () => !!CLIENT_ID;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
               del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
  const meta = () => ls.get(MK, {});
  const setMeta = m => ls.set(MK, Object.assign(meta(), m));
  const signedIn = () => !!meta().user;
  function setState(s, n) { state = s; if (n != null) note = n; listeners.forEach(f => { try { f(); } catch (e) {} }); }

  /* ---------- 로그인: 같은 탭에서 구글 로그인 화면으로 갔다가 돌아온다(팝업을 쓰지 않음) ---------- */
  const AK = 'aigrader-gauth';
  const back = () => location.origin + location.pathname;   // 등록한 리디렉션 주소와 같아야 함
  function auth(first, silent) {
    const st = Math.random().toString(36).slice(2);
    try { sessionStorage.setItem(AK, JSON.stringify({ st, hash: location.hash, mode: silent ? 'silent' : 'login' })); } catch (e) {}
    const hint = meta().user;
    const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    u.search = new URLSearchParams(Object.assign({
      client_id: CLIENT_ID, redirect_uri: back(), response_type: 'token', scope: SCOPE,
      include_granted_scopes: 'true', state: st,
      prompt: silent ? 'none' : first ? 'select_account' : '',
    }, hint ? { login_hint: hint } : {})).toString();
    if (!u.searchParams.get('prompt')) u.searchParams.delete('prompt');
    flushNow && flushNow();
    setTimeout(() => { location.href = u.toString(); }, 150);
    return new Promise(() => {});
  }
  // 구글에서 돌아왔을 때: 주소의 #access_token=… 을 읽고 원래 화면 주소로 되돌린다(app.js 가 화면을 그리기 전에 실행됨)
  let returned = null;
  (function takeReturn() {
    const h = location.hash;
    if (!/(^#|&)(access_token|error)=/.test(h)) return;
    const p = new URLSearchParams(h.slice(1));
    let saved = {}; try { saved = JSON.parse(sessionStorage.getItem(AK) || '{}'); sessionStorage.removeItem(AK); } catch (e) {}
    history.replaceState(null, '', location.pathname + location.search + (saved.hash || ''));
    if (!saved.st || p.get('state') !== saved.st) { returned = { error: '로그인 응답이 맞지 않습니다. 다시 시도해 주세요.', mode: saved.mode }; return; }
    if (p.get('error')) { returned = { error: p.get('error'), mode: saved.mode }; return; }
    token = { v: p.get('access_token'), exp: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 - 60000 };
    try { localStorage.setItem(TK, JSON.stringify(token)); } catch (e) {}
    returned = { ok: true, mode: saved.mode };
  })();
  function haveToken() {
    if (!token) token = ls.get(TK, null);
    return token && token.exp > Date.now();
  }

  /* ---------- 드라이브 요청 ---------- */
  async function req(url, opt = {}, raw) {
    if (!haveToken()) { setState('need', '드라이브 연결이 끊겼습니다'); throw Object.assign(new Error('드라이브에 다시 연결해 주세요.'), { need: true }); }
    const r = await fetch(url, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token.v }, opt.headers || {}) }));
    if (r.status === 401) { token = null; ls.del(TK); setState('need', '드라이브 연결이 끊겼습니다'); throw Object.assign(new Error('드라이브에 다시 연결해 주세요.'), { need: true }); }
    if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) {} throw new Error(`드라이브 오류(${r.status}) ${m}`); }
    if (raw) return r;
    return r.status === 204 ? null : r.json();
  }
  const q = s => encodeURIComponent(s);
  async function find(query, fields = 'id,name,appProperties,modifiedTime') {
    const out = []; let page = '';
    do {
      const j = await req(`${API}/files?q=${q(query + ' and trashed=false')}&spaces=drive&pageSize=1000&fields=nextPageToken,files(${fields})${page ? '&pageToken=' + page : ''}`);
      out.push(...j.files); page = j.nextPageToken || '';
    } while (page);
    return out;
  }
  function multipart(metaObj, blob) {
    const b = 'ag' + Math.random().toString(36).slice(2);
    const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metaObj),
      `\r\n--${b}\r\nContent-Type: ${blob.type || 'application/octet-stream'}\r\n\r\n`, blob, `\r\n--${b}--`]);
    return { body, type: 'multipart/related; boundary=' + b };
  }
  async function upload(id, metaObj, blob) {
    const m = multipart(metaObj, blob);
    return req(`${UP}/files${id ? '/' + id : ''}?uploadType=multipart&fields=id,appProperties,modifiedTime`,
      { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': m.type }, body: m.body });
  }
  async function rootId() {
    const m = meta();
    if (m.root) return m.root;
    let f = (await find(`appProperties has { key='ag' and value='root' }`))[0];
    if (!f) f = await req(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder', appProperties: { ag: 'root' } }) });
    setMeta({ root: f.id });
    return f.id;
  }
  async function fileOf(kind) {
    const root = await rootId();
    return (await find(`'${root}' in parents and appProperties has { key='ag' and value='${kind}' }`))[0] || null;
  }

  /* ---------- 채점 기록(state.json) ---------- */
  const strip = s => JSON.parse(JSON.stringify(s, (k, v) => (k[0] === '_' ? undefined : v)));
  const count = s => { let k = 0, g = 0; (s.courses || []).forEach(c => c.tasks.forEach(t => t.classes.forEach(x => { k++; g += Object.values(x.students || {}).filter(st => st.ai || st.touched || st.status).length; }))); return { c: (s.courses || []).length, k, g }; };
  const when = t => t ? new Date(Number(t)).toLocaleString() : '-';

  function dirty() {
    if (quiet || !signedIn()) return;
    setMeta({ dirty: true });
    clearTimeout(pushTimer); pushTimer = setTimeout(push, 2500);
  }
  async function push(force) {
    if (!signedIn() || pushing) return;
    if (!haveToken()) { setState('need', '올릴 기록이 있습니다 — 다시 연결해 주세요'); return; }
    pushing = true; setState('busy', '드라이브에 저장하는 중…');
    try {
      const m = meta();
      const f = await fileOf('state');
      const rUpd = f && f.appProperties && f.appProperties.upd;
      if (!force && f && rUpd && rUpd !== m.synced) { pushing = false; await conflict(f); return; }
      const upd = String(Date.now());
      const blob = new Blob([JSON.stringify({ app: 'ai-grader', state: strip(S) })], { type: 'application/json' });
      const metaObj = { appProperties: { ag: 'state', upd } };
      if (!f) Object.assign(metaObj, { name: 'state.json', parents: [await rootId()] });
      await upload(f && f.id, metaObj, blob);
      setMeta({ synced: upd, dirty: false });
      setState('ok', '드라이브에 저장됨 ' + new Date().toTimeString().slice(0, 5));
    } catch (e) { if (!e.need) setState('error', e.message); }
    pushing = false;
  }
  async function pull(opts = {}) {
    if (!signedIn() || pulling || pushing || !haveToken()) return false;
    pulling = true;
    try {
      const f = await fileOf('state');
      const m = meta();
      if (!f) { pulling = false; if (count(S).c) { setMeta({ dirty: true }); await push(true); } else setState('ok', '드라이브 연결됨'); return false; }
      const rUpd = f.appProperties && f.appProperties.upd;
      if (rUpd === m.synced) { setState('ok', '드라이브와 같음'); pulling = false; if (m.dirty) push(); return false; }
      // 처음 이 컴퓨터를 잇는데 이 컴퓨터에도 기록이 있거나, 양쪽이 다 바뀌었으면 묻는다
      if (m.dirty || (!m.synced && count(S).c)) { pulling = false; await conflict(f); return true; }
      await takeRemote(f, opts.silent);
    } catch (e) { if (!e.need) setState('error', e.message); }
    pulling = false;
    return true;
  }
  async function takeRemote(f, silent) {
    const r = await req(`${API}/files/${f.id}?alt=media`, {}, true);
    const j = await r.json();
    if (!j || !j.state || !j.state.courses) throw new Error('드라이브의 기록 파일을 읽지 못했습니다.');
    try { await DB.put('kv', 'state-before-sync', strip(S)); } catch (e) {}
    quiet = true; S = j.state; await save(true); quiet = false;
    setMeta({ synced: f.appProperties.upd, dirty: false });
    setState('ok', '드라이브에서 불러옴 ' + new Date().toTimeString().slice(0, 5));
    if (typeof route === 'function') route({ keepSide: true });
    if (!silent) toast('드라이브의 최신 기록을 불러왔습니다.', 3000);
  }
  function conflict(f) {
    return new Promise(done => {
      const rUpd = f.appProperties && f.appProperties.upd;
      const go = async which => {
        delete $('#modal').dataset.lock; closeModal(true);
        try {
          if (which === 'remote') { await takeRemote(f); }
          else { setMeta({ dirty: true }); await push(true); toast('이 컴퓨터의 기록으로 드라이브를 바꿨습니다.', 3000); }
        } catch (e) { setState('error', e.message); toast(e.message, 5000); }
        done();
      };
      req(`${API}/files/${f.id}?alt=media`, {}, true).then(r => r.json()).then(j => {
        const a = count(S), b = count(j.state || {});
        modal(`<h2>어느 기록을 쓸까요?</h2>
          <p>이 컴퓨터와 구글 드라이브의 채점 기록이 서로 다릅니다.</p>
          <div class="grid2" style="gap:10px;margin:12px 0">
            <div class="note"><b>구글 드라이브</b><br>과목 ${b.c}개 · 반 ${b.k}개 · 처리한 학생 ${b.g}명<br><span class="small muted">마지막 저장 ${when(rUpd)}</span></div>
            <div class="note"><b>이 컴퓨터</b><br>과목 ${a.c}개 · 반 ${a.k}개 · 처리한 학생 ${a.g}명<br><span class="small muted">마지막 맞춘 때 ${when(meta().synced)}</span></div>
          </div>
          <p class="small muted">고르지 않은 쪽 기록은 덮어씁니다. 드라이브 것을 고르면 이 컴퓨터 기록은 한 벌 따로 남겨 둡니다.</p>
          <div class="foot"><button class="btn" id="cfl">이 컴퓨터 것 쓰기</button><button class="btn primary" id="cfr">드라이브 것 쓰기</button></div>`);
        $('#modal').dataset.lock = '1';
        $('#cfr').onclick = () => go('remote');
        $('#cfl').onclick = () => go('local');
      }).catch(e => { setState('error', e.message); done(); });
    });
  }

  /* ---------- 설정·API 키·문체 본보기(settings.json) ---------- */
  let setTimer = null;
  function dirtySettings() {
    if (quiet || !signedIn()) return;
    setMeta({ setDirty: true });
    clearTimeout(setTimer); setTimer = setTimeout(pushSettings, 1500);
  }
  async function pushSettings() {
    if (!signedIn() || !haveToken()) return;
    try {
      const f = await fileOf('settings');
      const blob = new Blob([JSON.stringify({ settings: App.settings(), style: Style.get() })], { type: 'application/json' });
      const metaObj = { appProperties: { ag: 'settings', upd: String(Date.now()) } };
      if (!f) Object.assign(metaObj, { name: 'settings.json', parents: [await rootId()] });
      await upload(f && f.id, metaObj, blob);
      setMeta({ setDirty: false });
    } catch (e) { if (!e.need) setState('error', e.message); }
  }
  async function pullSettings() {
    const f = await fileOf('settings');
    if (!f) { await pushSettings(); return; }
    if (meta().setDirty) { await pushSettings(); return; }
    const j = await (await req(`${API}/files/${f.id}?alt=media`, {}, true)).json();
    quiet = true;
    if (j.settings) {
      const cur = App.settings();
      // 이 컴퓨터에 키가 없거나 드라이브 쪽이 있으면 드라이브 것을 쓴다
      App.saveSettings(Object.assign({}, cur, j.settings, { apiKey: j.settings.apiKey || cur.apiKey }));
    }
    if (Array.isArray(j.style) && j.style.length) Style.set(j.style);
    quiet = false;
  }

  /* ---------- 답안 그림 ---------- */
  const isFull = k => !/:t$/.test(k);
  async function imgIndex() {
    if (remoteImgs) return remoteImgs;
    const root = await rootId();
    const files = await find(`'${root}' in parents and appProperties has { key='ag' and value='img' }`, 'id,appProperties');
    remoteImgs = new Map(files.map(f => [f.appProperties.k, f.id]));
    return remoteImgs;
  }
  const upq = () => ls.get(QK, []);
  function queueImg(key) {
    if (!signedIn() || !isFull(key)) return;
    const a = upq(); if (!a.includes(key)) { a.push(key); ls.set(QK, a); }
    kickUploads();
  }
  let upRunning = false;
  async function kickUploads() {
    if (upRunning || !signedIn() || !haveToken() || !upq().length) return;
    upRunning = true;
    try {
      const idx = await imgIndex();
      const root = await rootId();
      const total = upq().length; let done = 0;
      const worker = async () => {
        for (;;) {
          const a = upq(); if (!a.length) return;
          const key = a.shift(); ls.set(QK, a);
          if (idx.has(key)) { done++; continue; }
          const blob = await DB.get('img', key);
          if (blob) {
            const f = await upload(null, { name: key.replace(/[:]/g, '_') + '.jpg', parents: [root], appProperties: { ag: 'img', k: key } }, blob);
            idx.set(key, f.id);
          }
          done++;
          if (total > 3) setState('busy', `답안 그림 올리는 중 ${done}/${total}`);
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setState('ok', '드라이브에 저장됨 ' + new Date().toTimeString().slice(0, 5));
    } catch (e) {
      if (!e.need) setState('error', e.message);
    }
    upRunning = false;
  }
  // 이 컴퓨터에 없는 그림은 드라이브에서 받아 온다(작은 그림은 큰 그림에서 만든다)
  const fetching = new Map();
  async function fetchImg(key) {
    if (!signedIn() || !haveToken()) return null;
    const full = key.replace(/:t$/, '');
    if (!fetching.has(full)) fetching.set(full, (async () => {
      const idx = await imgIndex();
      const id = idx.get(full); if (!id) return null;
      const blob = await (await req(`${API}/files/${id}?alt=media`, {}, true)).blob();
      const jpg = new Blob([blob], { type: 'image/jpeg' });
      await DB.put('img', full, jpg);
      try { await DB.put('img', full + ':t', await thumbOf(jpg)); } catch (e) {}
      return jpg;
    })().finally(() => setTimeout(() => fetching.delete(full), 0)));
    const b = await fetching.get(full);
    if (!b) return null;
    return isFull(key) ? b : (await DB.get('img', key)) || b;
  }
  async function thumbOf(blob) {
    const bmp = await createImageBitmap(blob);
    const w = 240, h = Math.round(bmp.height * w / bmp.width);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    return new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
  }
  // 반 화면을 열면 그 반 그림 가운데 이 컴퓨터에 없는 것을 뒤에서 미리 받는다
  async function prefetch(cls) {
    if (!signedIn() || !haveToken() || !cls || cls._pref) return;
    cls._pref = true;
    const miss = [];
    for (const p of cls.pages) if (!(await DB.get('img', p.id))) miss.push(p.id);
    let i = 0;
    const w = async () => { while (i < miss.length) { const k = miss[i++]; try { await fetchImg(k); } catch (e) { return; } } };
    await Promise.all([w(), w(), w()]);
  }
  async function delPrefix(prefix) {
    if (!signedIn() || !haveToken()) return;
    try {
      const idx = await imgIndex();
      for (const [k, id] of [...idx]) if (k.startsWith(prefix)) { await req(`${API}/files/${id}`, { method: 'DELETE' }).catch(() => {}); idx.delete(k); }
      ls.set(QK, upq().filter(k => !k.startsWith(prefix)));
    } catch (e) {}
  }
  // 이 컴퓨터에 있는데 드라이브에 없는 그림을 모두 올릴 줄에 세운다(처음 로그인할 때)
  async function queueMissing() {
    const idx = await imgIndex();
    const keys = await DB.keys('img');
    const live = new Set(); (S.courses || []).forEach(c => c.tasks.forEach(t => t.classes.forEach(k => k.pages.forEach(p => live.add(p.id)))));
    const a = upq();
    keys.filter(k => isFull(k) && live.has(k) && !idx.has(k) && !a.includes(k)).forEach(k => a.push(k));
    ls.set(QK, a);
  }

  /* ---------- 시작·로그인·로그아웃 ---------- */
  async function afterAuth() {
    const who = await req(`${API}/about?fields=user(emailAddress,displayName)`);
    const prev = meta().user;
    if (prev && prev !== who.user.emailAddress) { ls.set(MK, {}); ls.del(QK); remoteImgs = null; }
    setMeta({ user: who.user.emailAddress, name: who.user.displayName || '' });
    setState('busy', '드라이브와 맞추는 중…');
    await pullSettings();
    await pull();
    await queueMissing();
    kickUploads();
    if (state === 'busy') setState('ok', '드라이브 연결됨');
  }
  async function login() {
    if (!enabled()) { toast('아직 구글 로그인이 설정되지 않았습니다.'); return; }
    setState('busy', '구글 로그인 화면으로 이동…');
    return auth(!signedIn());
  }
  async function logout() {
    const t = token || ls.get(TK, null);
    try { if (t) fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(t.v), { method: 'POST', mode: 'no-cors' }); } catch (e) {}
    token = null; ls.del(TK); ls.set(MK, {}); ls.del(QK); remoteImgs = null;
    setState('off', '');
  }
  async function boot() {
    if (!enabled()) { setState('off'); return; }
    if (returned && returned.error) {
      const r = returned; returned = null;
      // 조용히 다시 잇기에 실패했으면(로그인이 풀림 등) 단추로 잇게 둔다
      if (r.mode === 'silent') { setState(signedIn() ? 'need' : 'off', '드라이브에 다시 연결해 주세요'); return; }
      setState(signedIn() ? 'need' : 'off', '');
      toast(r.error === 'access_denied' ? '구글 로그인을 취소했습니다.' : '구글 로그인 실패: ' + r.error, 4500);
      return;
    }
    const justIn = returned && returned.ok && returned.mode === 'login'; returned = null;
    if (!signedIn() && !justIn) { setState('off'); return; }
    if (!haveToken()) {
      // 한 시간이 지나 열쇠가 끝났으면: 이 탭에서 처음 한 번만 조용히 다시 받아 온다(화면이 잠깐 깜박임)
      let tried = false; try { tried = sessionStorage.getItem('aigrader-silent') === '1'; sessionStorage.setItem('aigrader-silent', '1'); } catch (e) {}
      if (!tried) { setState('busy', '드라이브에 다시 연결하는 중…'); auth(false, true); return; }
      setState('need', '다른 컴퓨터의 기록을 받으려면 드라이브에 다시 연결하세요'); return;
    }
    try {
      await afterAuth();
      if (justIn) toast(`${meta().user} 드라이브에 저장합니다.`, 3500);
    } catch (e) { if (!e.need) setState('error', e.message); }
  }
  // 다른 창에서 돌아오면 드라이브가 더 새것인지 확인
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && signedIn() && haveToken() && !meta().dirty) pull({ silent: false });
    if (document.visibilityState === 'hidden' && meta().dirty && haveToken()) { clearTimeout(pushTimer); push(); }
  });

  return {
    enabled, signedIn, login, logout, boot, push, pull, dirty, dirtySettings, queueImg, fetchImg, prefetch, delPrefix,
    status: () => ({ state, note, user: meta().user, name: meta().name, dirty: !!meta().dirty, queue: upq().length }),
    onChange: f => listeners.push(f),
  };
})();
