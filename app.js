// AI 서논술형 채점 — 화면과 데이터
'use strict';

/* ================= 설정 ================= */
const App = (() => {
  const KEY = 'aigrader-settings';
  const DEF = { apiKey: '', model: 'gemini-flash-lite-latest', byteMin: 250, byteMax: 300, mode: 'auto' };
  function settings() {
    try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); }
  }
  function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} if (typeof Sync !== 'undefined') Sync.dirtySettings(); }
  const bytes = t => { let b = 0; for (const ch of String(t || '')) b += ch.codePointAt(0) > 127 ? 3 : 1; return b; };
  return { settings, saveSettings, bytes };
})();

/* ================= 작은 도구 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
// 시작 화면 잠금(비밀번호는 해시로만 둔다 — 공개된 앱이라 완전한 보안은 아님) · 조회수
const GATE_H = '3acb6aa3dfb49029d1c7d1a4b709ddfc704bda9bc790937823260fa2b094765d', GATE_K = 'aigrader-gate', CREDIT = 'made by. 가운고 김태하';
async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const gateOK = () => { try { return localStorage.getItem(GATE_K) === GATE_H || sessionStorage.getItem(GATE_K) === GATE_H; } catch (e) { return false; } };
// 조회수: 같은 브라우저는 30분에 한 번만 센다(abacus 공개 카운터, 개인정보는 보내지 않음)
const VIS_NS = 'hapsum14-aigrader', VIS_K = 'aigrader-visit';
async function visits() {
  const d = new Date(), day = `d${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  let last = 0; try { last = Number(localStorage.getItem(VIS_K)) || 0; } catch (e) {}
  const hit = Date.now() - last > 30 * 60 * 1000 && !/^(localhost|127\.)/.test(location.hostname); // 내 컴퓨터에서 시험할 때는 세지 않음
  const get = async k => { try { const r = await fetch(`https://abacus.jasoncameron.dev/${hit ? 'hit' : 'get'}/${VIS_NS}/${k}`); const j = await r.json(); return Number(j.value) || 0; } catch (e) { return null; } };
  const [total, today] = await Promise.all([get('total'), get(day)]);
  if (hit && total != null) try { localStorage.setItem(VIS_K, String(Date.now())); } catch (e) {}
  return { total, today };
}
function visHTML(v) { return v && v.total != null ? `<span title="전체 방문">${ic('users')}전체 <b>${v.total.toLocaleString()}</b></span><span title="오늘 방문">${ic('sun')}오늘 <b>${(v.today || 0).toLocaleString()}</b></span>` : ''; }
let VISITS = null;
function showGate() {
  return new Promise(res => {
    const g = document.createElement('div'); g.id = 'gate';
    g.innerHTML = `<form class="gbox" autocomplete="off">
      <div class="glogo"><i>${ic('logo')}</i></div>
      <h1>AI 서논술형 채점</h1>
      <p class="gsub">선생님 전용 도구입니다. 공유받은 비밀번호를 입력하세요.</p>
      <input class="in" type="password" id="gpw" placeholder="비밀번호" inputmode="numeric" autofocus>
      <label class="gchk"><input type="checkbox" id="gmem" checked> 이 기기에서 기억하기 <span class="faint">(공용 컴퓨터는 끄세요)</span></label>
      <p class="gerr" id="gerr"></p>
      <button class="btn primary wide" type="submit">열기</button>
      <div class="gfoot"><b>${CREDIT}</b><span>무단 배포 시 공유가 중지될 수 있습니다.</span><div class="gvis" id="gvis"></div></div></form>`;
    document.body.appendChild(g);
    const f = g.querySelector('form'), pw = g.querySelector('#gpw');
    setTimeout(() => pw.focus(), 50);
    (VISITS || visits()).then(v => { VISITS = Promise.resolve(v); const el = g.querySelector('#gvis'); if (el) el.innerHTML = visHTML(v); });
    f.onsubmit = async e => {
      e.preventDefault();
      if (await sha('aigrader:' + pw.value.trim()) !== GATE_H) { g.querySelector('#gerr').textContent = '비밀번호가 맞지 않아요.'; pw.select(); g.querySelector('.gbox').classList.remove('shake'); void g.offsetWidth; g.querySelector('.gbox').classList.add('shake'); return; }
      try { (g.querySelector('#gmem').checked ? localStorage : sessionStorage).setItem(GATE_K, GATE_H); } catch (x) {}
      g.classList.add('out'); setTimeout(() => g.remove(), 250); res();
    };
  });
}
// 본문 맨 아래 바닥글: 만든이 · 방문 수 · 개인정보 처리방침
function renderCredit() {
  let el = document.getElementById('appfoot');
  if (!el) { el = document.createElement('footer'); el.id = 'appfoot'; const v = document.getElementById('view'); v.parentNode.insertBefore(el, v.nextSibling); }
  const paint = v => {
    el.innerHTML = `<div class="af-who"><span class="af-mark">${ic('logo')}</span><span><b>${CREDIT}</b><small>무단 배포 시 공유가 중지될 수 있습니다.</small></span></div>
      <div class="af-side">${v && v.total != null ? `<span class="af-vis" title="같은 브라우저는 30분에 한 번 세요"><span>${ic('users')}전체 <b>${v.total.toLocaleString()}</b></span><span>${ic('sun')}오늘 <b>${(v.today || 0).toLocaleString()}</b></span></span>` : ''}
        <a href="privacy.html" target="_blank">개인정보 처리방침</a></div>`;
  };
  // 위쪽 띠에도 짧게(넓은 화면에서는 이쪽만 보이고 바닥글은 숨김)
  const top = document.getElementById('tcredit');
  const paintTop = v => { if (top) top.innerHTML = `<a href="privacy.html" target="_blank" title="무단 배포 시 공유가 중지될 수 있습니다 · 개인정보 처리방침">made by. <b>가운고 김태하</b></a>${v && v.total != null ? `<span class="tv" title="전체 방문">${ic('users')}${v.total.toLocaleString()}</span><span class="tv" title="오늘 방문">${ic('sun')}${(v.today || 0).toLocaleString()}</span>` : ''}`; };
  if (!el.innerHTML) { paint(null); paintTop(null); }
  (VISITS || (VISITS = visits())).then(v => { paint(v); paintTop(v); });
}
const GCK = 'aigrader-gc';
function gcLater(clsId) { try { const a = JSON.parse(localStorage.getItem(GCK) || '[]'); if (!a.includes(clsId)) a.push(clsId); localStorage.setItem(GCK, JSON.stringify(a)); } catch (e) {} }
async function gcImgs() {
  try {
    const live = new Set(), liveCls = new Set();
    S.courses.forEach(c => c.tasks.forEach(t => t.classes.forEach(k => { liveCls.add(k.id); k.pages.forEach(p => live.add(p.id)); })));
    if (!liveCls.size && !S.courses.length) return; // 자료를 못 읽었을 때는 아무것도 지우지 않음
    let gone = []; try { gone = JSON.parse(localStorage.getItem(GCK) || '[]'); } catch (e) {}
    const keys = await DB.keys('img'); let n = 0;
    for (const key of keys) {
      const base = String(key).replace(/:t$/, ''), cid = base.split(':')[0];
      const deadCls = gone.includes(cid) && !liveCls.has(cid);
      const orphan = liveCls.has(cid) && !live.has(base); // 살아 있는 반의, 더는 안 쓰는 쪽(돌리기·지우기 뒤)
      if (deadCls || orphan) { await DB.del('img', key); n++; }
    }
    gone.filter(cid => !liveCls.has(cid)).forEach(cid => { if (typeof Sync !== 'undefined') Sync.delPrefix(cid + ':'); });
    localStorage.setItem(GCK, JSON.stringify(gone.filter(cid => liveCls.has(cid))));
    return n;
  } catch (e) { return 0; }
}
function undoToast(msg) {
  let t = document.getElementById('utoast');
  if (!t) { t = document.createElement('div'); t.id = 'utoast'; document.body.appendChild(t); }
  t.innerHTML = `<span>${esc(msg)}</span><button data-act="undo">되돌리기</button><button class="x" aria-label="닫기">✕</button>`;
  t.querySelector('.x').onclick = () => t.classList.remove('on');
  t.classList.add('on'); clearTimeout(undoToast._t); undoToast._t = setTimeout(() => t.classList.remove('on'), 7000);
}
function toast(msg, ms = 2400) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}
const ICON = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2M15 10V8M11 6h2M17 6h2M4 20L14 10"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  grad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/></svg>',
};

/* ================= 저장소(IndexedDB) ================= */
const DB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('ai-grader', 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('img'); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  async req(store, mode, fn) {
    const d = await this.open();
    return new Promise((res, rej) => {
      const tx = d.transaction(store, mode); const q = fn(tx.objectStore(store));
      tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  get(store, key) { return this.req(store, 'readonly', s => s.get(key)); },
  put(store, key, val) { return this.req(store, 'readwrite', s => s.put(val, key)); },
  del(store, key) { return this.req(store, 'readwrite', s => s.delete(key)); },
  delPrefix(store, p) { return this.req(store, 'readwrite', s => s.delete(IDBKeyRange.bound(p, p + '￿'))); },
  keys(store) { return this.req(store, 'readonly', s => s.getAllKeys()); },
};

let S = { courses: [] };
// 되돌리기: 지우기·옮기기·나누기·합치기 같은 일 전에 자료를 찍어 둔다(그림은 따로 두므로 바로 지우지 않음)
const UNDO = { stack: [], redo: [] };
const snapJSON = () => JSON.stringify(S, (k, v) => (k[0] === '_' ? undefined : v));
function snap(label) { UNDO.stack.push({ label, s: snapJSON() }); if (UNDO.stack.length > 30) UNDO.stack.shift(); UNDO.redo = []; renderUndo(); }
function undoMove(from, to, verb) {
  if (typeof BUSY !== 'undefined' && BUSY > 0) { toast('AI 작업이 도는 중이라 지금은 되돌릴 수 없어요. 끝난 뒤 해 주세요.', 3500); return; }
  const x = from.pop(); if (!x) { toast(verb === '되돌렸' ? '되돌릴 것이 없어요.' : '다시 할 것이 없어요.'); return; }
  to.push({ label: x.label, s: snapJSON() });
  S = JSON.parse(x.s); if (G.psel) G.psel.clear(); save(true); rerender(); renderUndo();
  toast(`${verb}어요: ${x.label}`, 2500);
}
function renderUndo() {
  const u = document.getElementById('undob'), r = document.getElementById('redob'); if (!u) return;
  const a = UNDO.stack[UNDO.stack.length - 1], b = UNDO.redo[UNDO.redo.length - 1];
  u.disabled = !a; u.title = a ? `되돌리기: ${a.label} (Ctrl+Z)` : '되돌릴 것이 없어요';
  r.disabled = !b; r.title = b ? `다시 하기: ${b.label} (Ctrl+Y)` : '다시 할 것이 없어요';
}
let saveTimer = null;
function save(now) {
  clearTimeout(saveTimer);
  const el = document.getElementById('saved'); if (el) el.textContent = '저장 중…';
  const run = () => DB.put('kv', 'state', JSON.parse(JSON.stringify(S, (k, v) => (k[0] === '_' ? undefined : v))))
    .then(() => { if (typeof Sync !== 'undefined') Sync.dirty(); const e2 = document.getElementById('saved'); if (e2) { const d = new Date(); e2.textContent = `저장됨 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; } })
    .catch(e => toast('저장 실패: ' + e.message, 5000));
  if (now) return run();
  saveTimer = setTimeout(() => { saveTimer = null; run(); }, 300);
}
const urlCache = new Map();
// 그림: 이 컴퓨터에 없으면(다른 컴퓨터에서 올린 반) 구글 드라이브에서 받아 온다
async function getImg(key) {
  let b = await DB.get('img', key);
  if (!b && typeof Sync !== 'undefined' && Sync.signedIn()) { try { b = await Sync.fetchImg(key); } catch (e) {} }
  return b;
}
function delImgs(prefix) { if (typeof Sync !== 'undefined') Sync.delPrefix(prefix); return DB.delPrefix('img', prefix); }
async function imgURL(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const b = await getImg(key);
  if (!b) return '';
  const u = URL.createObjectURL(b); urlCache.set(key, u); return u;
}

/* ================= 데이터 도우미 ================= */
function findCourse(cid) { return S.courses.find(c => c.id === cid); }
function findTask(tid) { for (const c of S.courses) for (const t of c.tasks) if (t.id === tid) return { course: c, task: t }; return {}; }
function findClass(kid) { for (const c of S.courses) for (const t of c.tasks) for (const k of t.classes) if (k.id === kid) return { course: c, task: t, cls: k }; return {}; }
function newTask(o = {}) {
  return Object.assign({ id: uid(), name: '새 수행평가', maxScore: 20, method: '논술형', period: '', assignment: '', standards: [], levels: [], elements: [], mode: 'count', criteria: [], scale: [], specials: [], question: '', answerKey: '', classes: [] }, o, { id: uid(), classes: [] });
}
function stu(cls, no) {
  return cls.students[no] || (cls.students[no] = { status: '', checks: [], pts: [], touched: false, override: null, special: null, ai: null, feedback: '', memo: '', seteuk: '', done: false });
}
function subOf(cls, no) { return cls.subs.find(s => s.no === no); }
function statusOf(cls, no) {
  const s = cls.students[no] || {};
  if (s.status === '미응시') return '미응시';
  if (s.status === '미제출' || !subOf(cls, no)) return '미제출';
  if (s.done) return '채점 완료';
  if (s.ai) return 'AI 채점';
  return '채점 전';
}
function pillOf(st) {
  const k = { '채점 완료': 'ok', 'AI 채점': 'ai', '채점 전': '', '미제출': 'gray', '미응시': 'gray' }[st];
  return `<span class="pill ${k}">${esc(st === 'AI 채점' ? '확인 필요' : st)}</span>`;
}
function scaleScore(task, n) {
  const sc = [...(task.scale || [])].sort((a, b) => b.count - a.count);
  const hit = sc.find(x => x.count <= n);
  return hit ? hit.score : null;
}
// 평가 요소가 여럿이면 요소마다 '충족 개수 → 점수' 표를 따로 적용해 더한다
function countScore(task, mets) {
  const parts = [...new Set(task.criteria.map(c => c.part || 1))];
  if (parts.length < 2 || !(task.scale || []).some(x => (x.part || 1) !== 1)) return scaleScore(task, mets.filter(Boolean).length);
  let total = 0;
  for (const p of parts) {
    const n = task.criteria.reduce((k, c, i) => k + ((c.part || 1) === p && mets[i] ? 1 : 0), 0);
    const hit = (task.scale || []).filter(x => (x.part || 1) === p).sort((a, b) => b.count - a.count).find(x => x.count <= n);
    if (!hit) return null; total += hit.score;
  }
  return total;
}
function scoreOf(task, s) {
  if (!s) return null;
  if (s.special != null) return s.special;
  if (s.override != null) return s.override;
  if (!s.touched) return null;
  if (task.mode === 'points') return sum(s.pts);
  return countScore(task, task.criteria.map((c, i) => !!s.checks[i]));
}
function aiScoreOf(task, s) {
  if (!s || !s.ai || !s.ai.criteria) return null;
  if (s.ai.blank) { const sp = (task.specials || []).find(x => /백지/.test(x.label)); if (sp) return sp.score; }
  if (task.mode === 'points') return sum(s.ai.criteria.map(c => c.points));
  return countScore(task, task.criteria.map((c, i) => { const x = s.ai.criteria.find(y => y.index === i + 1); return !!(x && x.met); }));
}
function applyAI(task, s) {
  const n = task.criteria.length;
  s.checks = Array.from({ length: n }, (_, i) => { const c = s.ai.criteria.find(x => x.index === i + 1); return !!(c && c.met); });
  s.pts = Array.from({ length: n }, (_, i) => { const c = s.ai.criteria.find(x => x.index === i + 1); return c ? Number(c.points) || 0 : 0; });
  s.touched = true; s.override = null; s.special = null;
  if (s.ai.blank) { const sp = (task.specials || []).find(x => /백지/.test(x.label)); if (sp) s.special = sp.score; }
}
function scoreChoices(task) {
  let set = new Set((task.scale || []).map(x => x.score));
  const parts = [...new Set((task.scale || []).map(x => x.part || 1))];
  if (parts.length > 1) { // 요소별 점수의 합으로 나올 수 있는 값
    set = parts.reduce((acc, p) => { const vs = (task.scale || []).filter(x => (x.part || 1) === p).map(x => x.score); const nx = new Set(); acc.forEach(a => vs.forEach(v => nx.add(a + v))); return nx; }, new Set([0]));
  }
  if (task.mode === 'points') { for (let v = task.maxScore; v >= 0; v--) set.add(v); }
  return [...set].filter(v => v != null).sort((a, b) => b - a);
}
function rebuildSubs(cls) {
  const old = new Map(cls.subs.map(s => [s.pages[0], s]));
  const groups = []; let cur = null;
  cls.pages.forEach((p, i) => {
    if (p.skip) return;
    if (!cur || cls.starts.includes(i)) { cur = { pages: [] }; groups.push(cur); }
    cur.pages.push(i);
  });
  const used = new Set();
  groups.forEach(g => { const o = old.get(g.pages[0]); if (o && o.fixed) { g.no = o.no; g.fixed = true; used.add(o.no); } });
  const absent = no => cls.students[no] && cls.students[no].status === '미응시';
  let n = 1;
  groups.forEach(g => { if (g.fixed) return; while (used.has(n) || absent(n)) n++; g.no = n; used.add(n); n++; });
  cls.subs = groups.map(g => ({ id: uid(), no: g.no, fixed: !!g.fixed, pages: g.pages }));
}
// 쪽 지우기: 남은 쪽의 '새 학생' 표시와 고정 번호는 그 쪽을 따라간다(그림은 다음에 열 때 정리)
function removePages(cls, drop) {
  const startObjs = new Set(cls.starts.map(i => cls.pages[i]));
  const fixedBy = new Map(cls.subs.filter(x => x.fixed).map(x => [cls.pages[x.pages[0]], x.no]));
  const keep = cls.pages.filter(p => !drop(p));
  cls.pages = keep;
  cls.starts = keep.map((p, i) => startObjs.has(p) ? i : -1).filter(i => i >= 0);
  cls.subs = [...fixedBy].filter(([p]) => keep.includes(p)).map(([p, no]) => ({ id: uid(), no, fixed: true, pages: [keep.indexOf(p)] }));
  rebuildSubs(cls);
}
function movePages(cls, idxs, target, afterIt) {
  const pick = new Set(idxs);
  if (!pick.size || pick.has(target)) return false;
  // 쪽의 오른쪽(뒤)에 놓으면 그 학생에 붙이고, 학생 첫 쪽의 왼쪽(앞)에 놓으면 새 학생으로 넣는다
  const firstLive = cls.pages.findIndex(p => !p.skip);
  const newStudent = !afterIt && (target === firstLive || cls.starts.includes(target));
  const startObjs = new Set(cls.starts.map(i => cls.pages[i]));
  const fixedBy = new Map(cls.subs.filter(x => x.fixed).map(x => [cls.pages[x.pages[0]], x.no]));
  const moving = cls.pages.filter((_, i) => pick.has(i));
  const rest = cls.pages.filter((_, i) => !pick.has(i));
  let at = rest.indexOf(cls.pages[target]) + (afterIt ? 1 : 0);
  const order = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  if (order.every((p, i) => p === cls.pages[i]) && startObjs.has(moving[0]) === newStudent) return false;
  if (newStudent) startObjs.add(moving[0]); else startObjs.delete(moving[0]);
  cls.pages = order;
  cls.starts = order.map((p, i) => startObjs.has(p) ? i : -1).filter(i => i >= 0);
  // 고정 번호는 첫 쪽을 따라간다(rebuildSubs 가 첫 쪽 자리로 찾음)
  cls.subs = [...fixedBy].map(([p, no]) => ({ id: uid(), no, fixed: true, pages: [order.indexOf(p)] }));
  rebuildSubs(cls);
  return { newStudent, idx: moving.map(p => order.indexOf(p)) };
}
// 쪽 돌리기: 그림을 실제로 돌려 새 그림으로 저장한다(가리기·AI·채점 화면이 모두 같은 방향을 보게)
async function rotBlob(blob, deg) {
  const bm = await createImageBitmap(blob);
  const c = document.createElement('canvas'), q = deg % 180 !== 0;
  c.width = q ? bm.height : bm.width; c.height = q ? bm.width : bm.height;
  const g = c.getContext('2d'); g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(bm, -bm.width / 2, -bm.height / 2);
  return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
}
async function rotatePages(cls, idxs, deg) {
  deg = ((deg % 360) + 360) % 360;
  for (const i of idxs) {
    const p = cls.pages[i]; if (!p) continue;
    p.oc = true; if (!deg) continue;
    const [b, t] = [await getImg(p.id), await getImg(p.id + ':t')];
    if (!b) continue;
    const id = cls.id + ':' + uid();
    await DB.put('img', id, await rotBlob(b, deg)); await DB.put('img', id + ':t', await rotBlob(t || b, deg));
    if (typeof Sync !== 'undefined') Sync.queueImg(id);
    const old = p.id; if (G.psel && G.psel.has(old)) { G.psel.delete(old); G.psel.add(id); }
    p.id = id; if (deg % 180) [p.w, p.h] = [p.h, p.w];
    urlCache.delete(old); urlCache.delete(old + ':t'); // 옛 그림은 되돌리기를 위해 두었다가 다음에 열 때 정리(gcImgs)
  }
  save();
}
// 방향 자동 맞추기: 학생마다 같은 자리(1쪽·2쪽…)는 대개 같은 방향이라 자리마다 2~3쪽만 AI 에게 묻고 그 자리 전체에 적용
async function autoOrient(cls, onMsg) {
  const todo = []; cls.subs.forEach(x => x.pages.forEach((pi, k) => { if (!cls.pages[pi].oc && !cls.pages[pi].skip) todo.push({ pi, k }); }));
  if (!todo.length) return 0;
  const byPos = {}; todo.forEach(t => (byPos[t.k] = byPos[t.k] || []).push(t.pi));
  const ask = async pi => { const b = await getImg(cls.pages[pi].id); if (!b) return null; return (await AI.orient(await Parse.maskedBase64(b, [], 320))).rotate; };
  let turned = 0, n = 0; const total = Object.keys(byPos).length;
  for (const [k, list] of Object.entries(byPos)) {
    onMsg && onMsg(`${Number(k) + 1}번째 쪽 방향 확인 중 (${++n}/${total})`);
    const sample = [list[0], list[Math.floor(list.length / 2)], list[list.length - 1]].filter((v, i, a) => a.indexOf(v) === i).slice(0, list.length > 2 ? 3 : 2);
    const ans = []; for (const pi of sample) ans.push(await ask(pi));
    const cnt = {}; ans.filter(v => v != null).forEach(v => cnt[v] = (cnt[v] || 0) + 1);
    const [best, m] = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [0, 0];
    if (m >= Math.max(2, Math.ceil(sample.length / 2)) || sample.length === 1) {
      const deg = Number(best); await rotatePages(cls, list, deg); if (deg) turned += list.length;
    } else { // 서로 다르면 그 자리 쪽은 하나씩 확인
      for (const pi of list) { const d = await ask(pi); await rotatePages(cls, [pi], d || 0); if (d) turned++; }
    }
  }
  return turned;
}
// 끄는 동안 쪽 위에 보일 말
function dropHint(cls, i, right) {
  const firstLive = cls.pages.findIndex(p => !p.skip);
  const x = cls.subs.find(s => s.pages.includes(i));
  if (!right && (i === firstLive || cls.starts.includes(i))) return '여기 앞에 새 학생으로';
  return x ? `${x.no}번 학생에 붙이기` : '여기에 넣기';
}
function splitEvery(cls, k) {
  cls.perStudent = k;
  cls.starts = []; let c = 0;
  cls.pages.forEach((p, i) => { if (p.skip) return; if (c % k === 0) cls.starts.push(i); c++; });
  cls.subs.forEach(s => s.fixed = false);
  rebuildSubs(cls);
}
async function aiImages(cls, sub) {
  const out = [];
  for (let j = 0; j < sub.pages.length; j++) {
    const p = cls.pages[sub.pages[j]];
    const blob = await getImg(p.id);
    if (!blob) throw new Error('쪽 그림이 없습니다. 반 화면에서 PDF 를 다시 연결해 주세요.');
    const rects = (cls.masks || []).filter(m => m.page === -1 || m.page === j);
    out.push(await Parse.maskedBase64(blob, rects));
  }
  return out;
}
// 성취 수준: 충족한 채점 기준 비율로 상(80% 이상) · 중(50% 이상) · 하
function levelOf(task, s) {
  if (s.special != null) return '하';
  const n = task.criteria.length; if (!n) return '중';
  let met = 0;
  task.criteria.forEach((c, i) => { if (s.touched ? !!s.checks[i] : !!(s.ai && (s.ai.criteria.find(x => x.index === i + 1) || {}).met)) met++; });
  const r = met / n; return r >= 0.8 ? '상' : r >= 0.5 ? '중' : '하';
}
// 기준(문항)마다 최종 판단: 선생님이 고쳤으면 선생님 것, 아니면 AI 것
function finalMet(task, s, i) {
  const a = s.ai && s.ai.criteria.find(x => x.index === i + 1);
  if (!s.touched) return !!(a && a.met);
  return task.mode === 'points' ? (Number(s.pts[i]) || 0) > 0 : !!s.checks[i];
}
function seteukInfo(task, s, cls, no) {
  const L = [];
  const sc = scoreOf(task, s);
  L.push(`받은 점수: ${sc == null ? '미정' : sc}/${task.maxScore}`);
  const key = cls ? keyFor(task, cls, no) : null;
  const ans = (s.ai && s.ai.answers) || [];
  const pickA = q => { const want = String(q || '').split(/\s*,\s*/).map(x => x.trim()).filter(Boolean); return want.length ? ans.filter(a => want.some(w => AI.sameQ(a.no, w))) : []; };
  let changed = 0, met = 0;
  const rows = task.criteria.map((c, i) => {
    const a = s.ai && s.ai.criteria.find(x => x.index === i + 1);
    const ok = finalMet(task, s, i); if (ok) met++;
    const ch = s.touched && a && !!a.met !== ok; if (ch) changed++;
    const q = key && key.crit && key.crit[i] ? key.crit[i].qnos : '';
    const sa = pickA(q).map(x => `${x.no}. ${x.text}`).join(' / ');
    const qq = key && key.map === 'order' ? (key.answers || []).filter(x => String(x.no).split(/[-(.\s]/)[0] === q).map(x => x.q).filter(Boolean).join(' / ') : '';
    const why = s.creason && s.creason[i] ? ` — 교사 근거: ${s.creason[i]}` : '';
    return `${i + 1}. ${q ? `[문항 ${q}] ` : ''}${qq ? `${qq} (기준표: ${c.text})` : c.text} → ${ok ? '맞음' : '틀림(세특에 쓰지 않음)'}${ch ? ' (교사가 AI 판단을 바꿈 — 교사 판단을 따른다)' : ''}${why}${sa ? `\n   학생 답: ${sa}` : ''}`;
  });
  L.push(`성취 수준: ${levelOf(task, s)}${s.special != null ? '(특수 상황)' : ''} (채점 기준 ${task.criteria.length}개 중 ${met}개 맞음)`);
  L.push('문항별 최종 판단(교사 판단이 최종). 맞은 문항의 학생 답만 세특의 근거로 쓰고, 틀린 문항의 내용은 잘한 점으로 쓰지 않는다:\n' + rows.join('\n'));
  if (s.ai) {
    if (s.ai.transcript) L.push('학생 답안 전체(참고. 위에서 틀림인 문항의 내용은 쓰지 않는다):\n' + s.ai.transcript);
    if (s.ai.strengths && !changed) L.push('답안에서 드러난 강점·역량(AI 판단. 세특에서 학생 답 내용에 붙여 드러낸다): ' + s.ai.strengths);
    const ev = s.ai.criteria.filter(c => c.evidence && finalMet(task, s, c.index - 1)).map(c => `${c.index}번 기준 근거: ${c.evidence}`);
    if (ev.length) L.push(ev.join('\n'));
  }
  const aiFb = s.ai && s.feedback === s.ai.feedback;
  if (s.feedback && !(changed && aiFb)) L.push((aiFb ? 'AI 피드백(참고): ' : '교사 피드백: ') + s.feedback);
  if (changed) L.push('교사가 AI 판단을 바꾼 기준이 있다. 교사가 충족으로 바꾼 기준은 그 기준을 충족한 것으로 보고 긍정적으로 쓰며, AI 가 찾은 부족한 점은 쓰지 않는다.');
  // 채점 때 쓴 세특 초안: 맥락·흐름은 살리고 다듬는다(선생님이 판단을 바꿨으면 그 판단대로 고친다)
  if (s.ai && s.ai.observation) L.push(changed
    ? '채점 때 쓴 세특 초안(AI 판단 기준). 이 글의 맥락·흐름·구체적 내용은 살리되, 교사가 틀림으로 바꾼 문항의 내용은 빼고 교사가 맞음으로 바꾼 문항의 내용은 학생 답에서 더해 고쳐 쓴다:\n' + s.ai.observation
    : '채점 때 쓴 세특 초안. 이 글의 맥락·흐름·구체적 내용과 역량 서술(드러냄·돋보임 등)을 그대로 살려, 분량과 세특 규칙에 맞게만 다듬는다(새 내용을 지어내지 않음):\n' + s.ai.observation);
  if (s.memo) L.unshift(`★ 교사 관찰 메모(가장 중요 — 반드시 세특에 반영): ${s.memo}\n메모에 적힌 역량·관찰·강조점은 성취 수준과 관계없이 세특에 꼭 넣는다. 역량 말(예: 이해력, 사고력)은 그 역량을 보여 주는 학생 답 내용에 붙여 '~을 설명하며 이해력을 보임', '~을 근거로 판단하는 사고력을 드러냄'처럼 쓴다.`);
  return L.join('\n');
}
// 문체 본보기: 선생님이 예전에 쓴 세특 엑셀에서 활동 부분('○○ 수행평가에서는 …' 1~2문장)만 뽑아 이 브라우저에 둔다
const Style = {
  KEY: 'aigrader-style',
  get() { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
  set(a) { try { localStorage.setItem(this.KEY, JSON.stringify(a)); if (typeof Sync !== 'undefined') Sync.dirtySettings(); return true; } catch (e) { return false; } },
  // 세특 한 칸 → 활동 부분 조각들(첫 문장 총평·끝 정리 문장은 뺀다)
  segments(text) {
    const ss = String(text).replace(/\s+/g, ' ').trim().split(/(?<=[.])\s+/).filter(Boolean);
    const out = [];
    for (let i = 1; i < ss.length - 1; i++) {
      if (!/에서는/.test(ss[i].slice(0, 45))) continue;
      let seg = ss[i];
      const nx = ss[i + 1];
      if (i + 1 < ss.length - 1 && !/에서는/.test(nx.slice(0, 45)) && !/^(이처럼|이를 통해|이러한)/.test(nx) && App.bytes(seg + ' ' + nx) <= 480) seg += ' ' + nx;
      const b = App.bytes(seg);
      if (b >= 120 && b <= 520) out.push(seg);
    }
    return out;
  },
  async fromFiles(files) {
    const segs = [];
    let cells = 0;
    for (const f of files) {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      for (const name of wb.SheetNames) {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false });
        for (const r of rows) for (const c of r || []) {
          if (typeof c !== 'string' || c.length < 150 || !/(함|임|보임|돋보임|뛰어남)\./.test(c)) continue;
          cells++; segs.push(...this.segments(c));
        }
      }
    }
    const seen = new Set(), uniq = [];
    for (const s of segs) { const k = s.slice(0, 30); if (!seen.has(k)) { seen.add(k); uniq.push(s); } }
    return { cells, segs: uniq.slice(0, 400) };
  },
  // 이 수행평가와 낱말이 많이 겹치는 본보기 n개(겹침이 같으면 고르게 섞음)
  pick(task, n = 4) {
    const all = this.get().filter(t => !/수행평가|미흡|부족|못하|어려움|실수|오류/.test(t)); if (!all.length) return [];
    const words = new Set((task.name + ' ' + (task.assignment || '') + ' ' + task.criteria.map(c => c.text).join(' '))
      .match(/[가-힣]{2,}/g) || []);
    const stop = new Set(['하였는가', '있는가', '서술하였는가', '제시하였는가', '이해하고', '대한', '통해', '관점에서', '수행평가']);
    const sc = all.map(t => ({ t, v: [...words].filter(w => !stop.has(w) && t.includes(w)).length + Math.random() * 0.5 }));
    sc.sort((a, b) => b.v - a.v);
    return sc.slice(0, n).map(x => x.t);
  },
};
const BRANDS = ['구글', '네이버', '다음카페', '유튜브', '유튜버', '카카오톡', '카톡', '인스타그램', '페이스북', '패들렛', '띵커벨', '미리캔버스', '캔바', '챗GPT', 'ChatGPT', 'GPT', '제미나이', 'Gemini', '노션', '위키백과', '나무위키', 'TED'];
function lint(t, task) {
  const w = [];
  const fw = t.match(/나의|나만의|내가|대회/g); if (fw) w.push('쓰면 안 되는 말: ' + [...new Set(fw)].join(', '));
  if (/수행평가/.test(t)) w.push("'수행평가' 대신 '~활동에서는', '~에서는'으로");
  task = task || (gctx && gctx.task);
  if (task && /논술|서술|지필/.test(task.method || '')) { const ex = t.match(/실험을\s?(설계|수행|진행|실시)함|측정함|측정하여|관찰함|관찰하여|실험으로 확인/g); if (ex) w.push('답안지에 쓴 활동인데 실제 실험처럼 읽힘: ' + [...new Set(ex)].join(', ') + " → '설계안을 서술함', '방법을 제시함'처럼"); }
  const neg = t.match(/미흡|부족|못하|못함|어려움|어려워|실수|오류가|아쉬|소홀|부진|틀린|틀렸/g); if (neg) w.push('부정적인 말: ' + [...new Set(neg)].join(', ') + ' → 해낸 것만');
  const bad = t.match(/[^\p{L}\p{N}\s.,\-]/gu); if (bad) w.push('마침표·쉼표·하이픈 밖의 특수문자: ' + [...new Set(bad)].join(' '));
  const inner = t.match(/(느낌|느꼈음|생각함|깨달음|알게 됨|알게 되었음|배움|다짐함|인식함|이해함)(?=\s*[.,]|\s*$)/g);
  if (inner) w.push('학생 입장 종결어: ' + [...new Set(inner)].join(', ') + ' → 관찰한 행동(설명함·분석함 등)으로');
  const br = BRANDS.filter(b => t.includes(b)); if (br.length) w.push('상호명·서비스명: ' + br.join(', ') + ' → 일반 명사로');
  const unit = t.match(/\d\s?(cm|mm|km|kg|mg|ml|mL|L)\b/g); if (unit) w.push('영문 단위 기호: ' + unit.join(', ') + ' → 한글 단위명으로');
  if (/(학생\s?\d+|\d+번\s?학생)/.test(t)) w.push('번호가 문구에 들어 있음');
  return w;
}

/* ================= 화면 틀: 왼쪽 메뉴 · 위쪽 띠 ================= */
const view = $('#view');
let after = null;
// 거르기 상태: 검색어(Q)와 학생 상태(F.status). 반이 바뀌면 상태 거르기는 풀린다
const F = { q: '', status: '', kid: '', sort: 'no' };
const STATUS = [
  ['', '전체', 'list'], ['채점 전', '채점 전', 'todo'], ['AI 채점', '확인 필요', 'bot'],
  ['채점 완료', '채점 완료', 'check'], ['미제출', '미제출', 'minus'], ['미응시', '미응시', 'x'],
];
const IC = {
  logo: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M8 7h7"/>',
  task: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20a5.5 5.5 0 0 0-4-5.3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/>',
  todo: '<circle cx="12" cy="12" r="9"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  minus: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 7.9z"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
};
const ic = (k, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24">${IC[k] || ''}</svg>`;

function sideOpen() { try { return JSON.parse(localStorage.getItem('aigrader-side') || '{"course":true,"status":true,"tools":false}'); } catch (e) { return { course: true, status: true, tools: false }; } }
function setSideOpen(k, v) { const o = sideOpen(); o[k] = v; try { localStorage.setItem('aigrader-side', JSON.stringify(o)); } catch (e) {} }
function routeParts() { return location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent); }
// 지금 화면이 가리키는 과목·수행평가·반
function curCtx() {
  const p = routeParts();
  if (p[0] === 'k' || p[0] === 'g') return Object.assign({ kind: p[0] }, findClass(p[1]));
  if (p[0] === 't') return Object.assign({ kind: 't' }, findTask(p[1]));
  if (p[0] === 'c' || p[0] === 's') return { kind: p[0], course: findCourse(p[1]) };
  return { kind: 'home' };
}
function classCounts(cls) {
  const n = { '': cls.size, '채점 전': 0, 'AI 채점': 0, '채점 완료': 0, '미제출': 0, '미응시': 0 };
  for (let i = 1; i <= cls.size; i++) n[statusOf(cls, i)]++;
  return n;
}
function doneCount(cls) { const n = classCounts(cls); return n['채점 완료'] + n['미제출'] + n['미응시']; }
function courseMeta(c) {
  const y = String(c.year || '').replace(/학년도/g, '').trim(), g = String(c.grade || '').replace(/학년/g, '').trim(), m = String(c.semester || '').replace(/학기/g, '').trim();
  return [y && y + '학년도', g && g + '학년', m && m + '학기'].filter(Boolean).join(' ');
}
// 왼쪽 메뉴 펼침 상태(과목·수행평가마다). 지금 보는 과목·수행평가는 늘 펼친다
function treeOpen() { try { return JSON.parse(localStorage.getItem('aigrader-tree') || '{}'); } catch (e) { return {}; } }
function matchQ(...texts) { const q = F.q.trim().toLowerCase(); if (!q) return true; return texts.some(t => String(t || '').toLowerCase().includes(q)); }

// 왼쪽 메뉴 펼치기/접기(누를 때마다 바뀜)
function toggleTree(id) {
  const o = treeOpen(), ctx = curCtx();
  const cur = (ctx.course && ctx.course.id === id) || (ctx.task && ctx.task.id === id);
  const now = typeof o[id] === 'boolean' ? o[id] : !!cur;
  o[id] = !now; try { localStorage.setItem('aigrader-tree', JSON.stringify(o)); } catch (e) {}
  renderSide();
}
// 지금 보고 있는 과목·수행평가 이름을 다시 누르면 접고 편다
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('#side a[data-tree]');
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (location.hash === a.getAttribute('href')) { e.preventDefault(); toggleTree(a.dataset.tree); }
});
function renderSide() {
  const ctx = curCtx(), open = sideOpen();
  const nStu = sum(S.courses.flatMap(c => c.tasks.flatMap(t => t.classes.map(k => k.size))));
  const to = treeOpen();
  const curKey = [ctx.course && ctx.course.id, ctx.task && ctx.task.id].join('|');
  if (curKey !== renderSide.last) { // 새로 들어간 과목·수행평가는 펼쳐 보여 준다
    renderSide.last = curKey;
    [ctx.course, ctx.task].forEach(x => { if (x) to[x.id] = true; });
    try { localStorage.setItem('aigrader-tree', JSON.stringify(to)); } catch (e) {}
  }
  const isOpen = (id, cur) => typeof to[id] === 'boolean' ? to[id] : cur;
  const chev = (id, open, has) => has ? `<button class="tg ${open ? 'open' : ''}" data-act="tree" data-id="${id}" title="${open ? '접기' : '펴기'}">${ic('chev')}</button>` : '<span class="tg"></span>';
  const tree = S.courses.map(c => {
    const cCur = ctx.course === c;
    const cOpen = isOpen(c.id, cCur);
    const tasks = cOpen ? c.tasks.map(t => {
      const tCur = ctx.task === t;
      const tOpen = isOpen(t.id, tCur);
      const cls = tOpen ? t.classes.map(k => `<a class="subj l2 ${ctx.cls === k ? 'on' : ''}" href="#/k/${k.id}"><span class="nm">${esc(k.name)}</span><b>${doneCount(k)}/${k.size}</b></a>`).join('') : '';
      const tOn = tCur && !ctx.cls;
      return `<div class="trow l1">${chev(t.id, tOpen, t.classes.length > 0)}<a class="subj ${tOn ? 'on' : ''}" href="#/t/${t.id}" data-tree="${t.id}" title="채점 기준 · 지금 보는 곳을 한 번 더 누르면 접기/펴기"><span class="nm">${esc(t.name)}</span><b>${t.classes.length ? t.classes.length + '반' : ''}</b></a></div>${cls}`;
    }).join('') : '';
    const cOn = ctx.kind === 'c' && cCur;
    return `<div class="trow">${chev(c.id, cOpen, c.tasks.length)}<a class="subj ${cOn ? 'on' : ''}" href="#/c/${c.id}" data-tree="${c.id}">${ic('book')}<span class="nm">${esc(c.name)}</span><b>${c.tasks.length}</b></a></div>${tasks}`;
  }).join('');
  const cls = ctx.cls;
  const cnt = cls ? classCounts(cls) : null;
  const status = cls
    ? STATUS.map(([v, label, k]) => `<button class="subj ${F.status === v ? 'on' : ''}" data-act="fstatus" data-v="${esc(v)}">${ic(k)}<span class="nm">${label}</span><b>${cnt[v]}</b></button>`).join('')
    : `<div class="sidecap">반을 고르면 보여요</div>`;
  const curCls = cls ? `${cls.name}` : '';
  const stLabel = F.status && cls ? (STATUS.find(s => s[0] === F.status) || [])[0] : '';
  $('#side').innerHTML = `
    <a class="logo" href="#/"><i>${ic('logo')}</i><div><b>AI 서논술형 채점</b><span>과목 ${S.courses.length} · 학생 ${nStu}명</span></div></a>
    <button class="newplan" data-act="pickplan">${ic('plus')}평가계획서 올리기</button>
    <label class="sbox">${ic('search')}<input id="q" type="search" placeholder="찾기 (과목·반·번호·세특)" value="${esc(F.q)}" autocomplete="off"><kbd>/</kbd></label>
    <div class="sg ${open.course ? 'open' : ''}" data-k="course">
      <button class="sgh" data-act="sg" data-k="course"><span class="bx">${ic('book')}</span><span class="nm">과목·반</span><em>${esc(ctx.course ? ctx.course.name : '')}</em>${ic('chev', 'ic chev')}</button>
      <div class="sgb">${tree || '<div class="sidecap">아직 과목이 없어요</div>'}</div></div>
    <div class="sfoot">
      <button class="subj" data-act="settings">${ic('gear')}<span class="nm">설정</span></button>
      <button class="subj" data-act="help">${ic('help')}<span class="nm">도움말</span></button>
      <div class="foot">판 ${esc(window.APP_VERSION || '')}</div></div>
    <nav id="mnav">
      <a href="#/" class="mhome">${ic('logo')}처음</a>
      <button data-act="sheet" data-k="course">${ic('book')}과목·반</button>
      <button data-act="msearch">${ic('search')}찾기</button>
      <button data-act="settings">${ic('gear')}설정</button>
    </nav>`;
  const q = $('#q');
  let tq = null;
  q.addEventListener('input', () => { clearTimeout(tq); tq = setTimeout(() => { F.q = q.value; route({ keepSide: true }); }, 200); });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; F.q = ''; route({ keepSide: true }); q.blur(); } });
  renderCredit();
}
function scope(parts) {
  $('#scope').innerHTML = parts.length
    ? parts.map((p, i) => `<span class="cr${i < parts.length - 2 ? ' far' : ''}">${i === parts.length - 1 ? `<b>${esc(p[0])}</b>` : `<a href="${p[1] || '#/'}">${esc(p[0])}</a><span class="sep">›</span>`}</span>`).join('')
    : `처음 화면`;
}
const crumb = scope; // 예전 이름

function route(opt = {}) {
  const p = routeParts();
  document.body.classList.toggle('grading', p[0] === 'g');
  // 반이 바뀌면 상태 거르기를 푼다
  const kid = (p[0] === 'k' || p[0] === 'g') ? p[1] : '';
  if (kid && kid !== F.kid) { F.status = ''; F.kid = kid; }
  after = null;
  let html;
  try {
    if (p[0] === 'c') html = vCourse(p[1]);
    else if (p[0] === 't') html = vTask(p[1]);
    else if (p[0] === 'k' && p[2] === 'pages') html = vPages(p[1]);
    else if (p[0] === 'k') html = vClass(p[1]);
    else if (p[0] === 'g') html = vGrade(p[1], Number(p[2]));
    else if (p[0] === 's') html = vSeteuk(p[1], p[2]);
    else html = vHome();
  } catch (e) { console.error(e); html = `<div class="card empty">화면을 그리지 못했습니다: ${esc(e.message)}<br><a href="#/">처음으로</a></div>`; }
  view.innerHTML = html;
  if (opt.keepSide) {
    // 검색 칸에 쓰는 중이면 메뉴를 다시 그리지 않고 숫자만 맞춘다
    const q = $('#q'); const had = document.activeElement === q; const pos = q && q.selectionStart;
    renderSide(); const q2 = $('#q'); if (had && q2) { q2.focus(); try { q2.setSelectionRange(pos, pos); } catch (e) {} }
  } else renderSide();
  $('#keydot').classList.toggle('on', !!App.settings().apiKey);
  closeSheet();
  if (after) after();
  fillPeek();
}
function rerender() { const y = window.scrollY; const side = $('.gside'); const sy = side && side.scrollTop; route({ keepSide: true }); window.scrollTo(0, y); const s2 = $('.gside'); if (s2 && sy != null) s2.scrollTop = sy; }
window.addEventListener('hashchange', () => { route(); if (!location.hash.startsWith('#/g/')) window.scrollTo(0, 0); });

function closeSheet() { $$('.sg.sheet').forEach(s => s.classList.remove('sheet')); $$('#mnav button').forEach(b => b.classList.remove('open')); $('#mback').classList.remove('on'); }

/* ================= 모달 ================= */
function modal(html, wide) {
  $('#mbox').className = 'box' + (wide ? ' wide' : '');
  $('#mbox').innerHTML = html;
  $('#modal').classList.remove('hide');
}
function closeModal(force) {
  if ($('#modal').dataset.lock && force !== true) return; // 진행 중인 창은 Esc 로 닫지 않는다
  $('#modal').classList.add('hide'); $('#mbox').innerHTML = '';
}
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && !$('#modal').dataset.lock) closeModal(); });

/* ================= 처음 화면 ================= */
function lastOpen() { try { return JSON.parse(localStorage.getItem('aigrader-last') || 'null'); } catch (e) { return null; } }
function allClasses() { return S.courses.flatMap(c => c.tasks.flatMap(t => t.classes.map(k => ({ course: c, task: t, cls: k })))); }
function vHome() {
  scope([]);
  const key = App.settings().apiKey;
  after = () => { $$('.dropzone').forEach(z => dropzone(z, $('#planfile'), fs => startPlan({ file: fs[0] }))); };
  const keyBar = key ? '' : `<div class="hint">${ic('key')}<span>AI 채점을 쓰려면 <b>Gemini API 키</b>가 필요해요.</span><button class="btn sm primary" data-act="settings">키 넣기</button><a class="btn sm ghost" href="${KEY_URL}" target="_blank" rel="noopener">무료 발급 ↗</a></div>`;
  const file = `<input type="file" id="planfile" accept=".hwp,.hwpx,.pdf,.txt" class="hide">`;
  if (!S.courses.length) return `${keyBar}
    <div class="hero dropzone">
      <div class="hero-ic">${ic('up')}</div>
      <h1>평가계획서를 올려 시작하세요</h1>
      <p>hwp · pdf 파일을 여기에 끌어 놓거나 눌러서 고르세요</p>
      <div class="row center"><button class="btn primary lg" data-act="pickplan">파일 고르기</button><button class="btn ghost" data-act="pasteplan">글로 붙여넣기</button></div>
    </div>
    <div class="steps">${[['up', '계획서', '채점 기준 정리'], ['users', '반 추가', '답안 PDF 올리기'], ['bot', 'AI 채점', '선생님이 확인'], ['pen', '세특', '초안 자동 작성']]
      .map((s, i) => `<div class="step"><span class="n">${i + 1}</span>${ic(s[0])}<b>${s[1]}</b><span>${s[2]}</span></div>`).join('')}</div>${file}`;
  const last = lastOpen(); const lc = last && findClass(last.kid);
  const resume = lc && lc.cls && last.no <= lc.cls.size
    ? `<a class="resume" href="#/g/${lc.cls.id}/${last.no}">${ic('play')}<div><b>이어서 채점</b><span>${esc(lc.cls.name)} ${last.no}번 · ${esc(lc.task.name)}</span></div>${ic('chev')}</a>` : '';
  const groups = S.courses.map(c => {
    const tasks = c.tasks.filter(t => matchQ(c.name, t.name, ...t.classes.map(k => k.name)));
    if (!tasks.length && !matchQ(c.name)) return '';
    const meta = courseMeta(c);
    return `<section class="cgroup"><div class="cg-h"><a href="#/c/${c.id}">${esc(c.name)}</a><span>${esc(meta)}</span></div>
      <div class="tks">${tasks.map(t => taskCard(t)).join('')}</div></section>`;
  }).join('');
  return `${keyBar}
    <div class="phead"><div class="pt"><h1>내 수행평가</h1></div>${resume}</div>
    ${groups || '<div class="empty">찾는 과목이 없어요.</div>'}
    <div class="addplan dropzone">${ic('up')}<b>평가계획서 올리기</b><span>끌어 놓거나 눌러서 고르기</span></div>
    <div class="row center small" style="margin-top:8px"><button class="btn sm ghost" data-act="pasteplan">글로 붙여넣기</button><button class="btn sm ghost" data-act="newcourse">빈 과목 만들기</button></div>${file}`;
}
// 수행평가 카드: 반마다 진행 막대(완료 초록 · 확인 필요 주황)
function taskCard(t) {
  const ks = t.classes.map(k => {
    const n = classCounts(k), d = n['채점 완료'] + n['미제출'] + n['미응시'];
    return `<a class="kl" href="#/k/${k.id}"><span class="kn">${esc(k.name)}</span>
      <span class="mbar"><i class="d" style="width:${d / k.size * 100}%"></i><i class="a" style="width:${n['AI 채점'] / k.size * 100}%"></i></span>
      <span class="kc">${d}/${k.size}</span>${n['AI 채점'] ? `<span class="pill ai" title="AI 가 채점, 선생님 확인 필요">확인 ${n['AI 채점']}</span>` : ''}</a>`;
  }).join('');
  return `<div class="tk" data-tk="${t.id}">
    <div class="tk-h"><div><div class="tk-t" title="두 번 누르면 이름 바꾸기" data-ren="${t.id}">${esc(t.name)}</div><div class="tk-m">${t.maxScore}점 · 기준 ${t.criteria.length}개${t.splitFrom ? ` · ${esc(t.splitFrom)}에서 나눔` : ''}</div></div>
      <div class="tk-tools">
        <button class="ibtn" data-act="renametask" data-id="${t.id}" title="이름 바꾸기">${ic('pen')}</button>
        <a class="ibtn" href="#/t/${t.id}" title="채점 기준 보기·고치기">${ic('task')}</a>
        <button class="ibtn" data-act="copytask" data-id="${t.id}" data-stay="1" title="복사해서 하나 더">${ic('copy')}</button>
        <button class="ibtn del" data-act="deltask" data-id="${t.id}" data-stay="1" title="수행평가 지우기">${ic('trash')}</button>
      ${!t.classes.length ? `<details class="menu"><summary class="ibtn" title="나누기·합치기">${ic('more')}</summary><div class="mlist">
        ${partsOf(t) ? `<button data-act="splittask" data-id="${t.id}" data-stay="1">${ic('more')}평가 요소별로 나누기</button>` : ''}
        <button data-act="mergetask" data-id="${t.id}">${ic('copy')}다른 수행평가와 합치기</button></div></details>` : ''}</div></div>
    ${ks ? `${ks}<button class="addk" data-act="addclass" data-id="${t.id}">+ 반 추가</button>` : `<button class="addk first" data-act="addclass" data-id="${t.id}">${ic('plus')}반 추가 — 답안 PDF 올리기</button>`}</div>`;
}

async function startPlan(src) {
  modal(`<h2>평가계획서 분석</h2><p id="pmsg">파일을 읽는 중…</p><div class="prog"><i style="width:15%"></i></div>
    <p class="small muted" id="psub" style="margin:8px 0 0"></p>`);
  $('#modal').dataset.lock = '1';
  const t0 = Date.now(); let got = 0, phase = '', timer = null;
  const tick = () => {
    const sec = Math.round((Date.now() - t0) / 1000);
    const el = $('#psub'); if (!el) return;
    el.textContent = `${sec}초 지남${got ? ` · 받은 글 ${got.toLocaleString()}자` : sec >= 4 && !phase ? ' · AI 가 읽고 생각하는 중(답이 오기 시작하면 글자 수가 보임)' : ''}${phase}`;
    // 받은 양에 맞춰 막대를 채운다(끝을 모르니 천천히 90% 까지)
    const bar = $('.prog i'); if (bar) bar.style.width = Math.min(90, 35 + (got ? 20 + got / 60 : sec * 1.2)) + '%';
  };
  try {
    const data = src.file ? await Parse.planFile(src.file) : { text: src.text };
    const full = data.text || '';
    const focus = Parse.planFocus(full);
    const send = Object.assign({}, data, { text: focus === full ? full : full.slice(0, 300) + '\n…\n' + focus });
    $('#pmsg').innerHTML = focus === full
      ? `글 ${full.length.toLocaleString()}자를 읽었습니다. AI 가 수행평가 채점 기준을 정리하는 중…`
      : `글 ${full.length.toLocaleString()}자 가운데 수행평가 부분 <b>${focus.length.toLocaleString()}자</b>만 골라 AI 가 채점 기준을 정리하는 중…`;
    timer = setInterval(tick, 500); tick();
    const r = await AI.extractPlan(send, n => { got = n; phase = ''; }, (s, alt, why) => { got = 0; phase = alt ? (why === 'broken' ? ` · 답이 깨져 ${alt} 로 다시 받는 중` : why === 'slow' ? ` · 답이 늦어 더 빠른 ${alt} 로 바꿈` : why === 'day' ? ` · 오늘 무료 한도를 다 써 ${alt} 로 바꿈` : ` · 바빠서 ${alt} 로 바꿔 시도`) : why === 'quota' ? ` · 무료 한도(분당) — ${s}초 기다리는 중` : ` · 서버가 바빠 ${s}초 뒤 다시 시도`; });
    clearInterval(timer);
    const c = {
      id: uid(), name: r.subject || (src.file ? src.file.name : '새 과목'), grade: r.grade || '', semester: r.semester || '', year: r.school_year || '',
      planName: src.file ? src.file.name : '붙여넣은 글', planText: full, createdAt: Date.now(),
      tasks: (r.tasks || []).map(t => {
        const d = Parse.planDetails(full, t.name, t.standards);
        const criteria = (t.criteria || []).map(c => Object.assign({}, c, { text: String(c.text || '').replace(/^\s*\d+\s*[.)]\s*/, '') }));
        return newTask(Object.assign({}, t, { criteria, standards: d.standards, levels: d.levels }));
      }),
    };
    if (!c.tasks.length) throw new Error('수행평가 영역을 찾지 못했습니다. 계획서 내용을 확인해 주세요.');
    S.courses.unshift(c); save(true);
    delete $('#modal').dataset.lock; closeModal();
    toast(`${Math.round((Date.now() - t0) / 1000)}초 만에 수행평가 ${c.tasks.length}개를 찾았습니다. 채점 기준을 확인해 주세요.`, 3500);
    location.hash = '#/c/' + c.id;
    const multi = c.tasks.filter(t => partsOf(t));
    if (multi.length) setTimeout(() => splitAsk(c, multi, () => rerender()), 400);
  } catch (e) {
    clearInterval(timer);
    delete $('#modal').dataset.lock;
    modal(`<h2>분석하지 못했습니다</h2><p>${esc(e.message)}</p><div class="foot">${/키/.test(e.message) ? '<button class="btn primary" data-act="settings">설정 열기</button>' : ''}<button class="btn" data-act="close">닫기</button></div>`);
  }
}

// 평가 요소가 둘 이상인 수행평가(시험지가 따로인 경우): 요소마다 수행평가 하나로 나눈다
function partsOf(t) {
  const ps = t.parts || [];
  if (ps.length < 2) return null;
  const used = new Set(t.criteria.map(c => c.part || 1));
  if (used.size < 2) return null;
  return ps.map((p, i) => {
    const no = i + 1, crit = t.criteria.filter(c => (c.part || 1) === no), scale = (t.scale || []).filter(x => (x.part || 1) === no);
    const max = t.mode === 'points' ? sum(crit.map(c => c.points)) : Math.max(0, ...scale.map(x => x.score));
    return { no, name: p.name || `평가 요소 ${no}`, kind: p.kind || '', crit, scale, max };
  }).filter(p => p.crit.length);
}
// 요소 이름표: 형태(활동형·논술형)가 겹치면 차시나 순서를 붙인다
function partLabel(ps, p) {
  const dup = ps.filter(x => x.kind && x.kind === p.kind).length > 1;
  const cha = (p.name.match(/(\d+)\s*차시/) || [])[1];
  const short = p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name;
  return p.kind ? (dup ? `${p.kind} ${cha ? cha + '차시' : p.no}` : p.kind) : short;
}
// '활동형 1차시', '활동형 2차시', '활동형 3차시' → '활동형 1~3차시'
function joinLabels(ls) {
  if (ls.length < 2) return ls.join('');
  const m = ls.map(l => l.match(/^(.*?)\s*(\d+)\s*차시$/));
  if (m.every(x => x && x[1] === m[0][1])) {
    const ns = m.map(x => Number(x[2])).sort((a, b) => a - b);
    if (ns.every((n, k) => !k || n === ns[k - 1] + 1)) return `${m[0][1]} ${ns[0]}~${ns[ns.length - 1]}차시`;
  }
  // 형태가 섞여도 차시가 이어지면 '활동형·논술형 1~3차시'
  if (m.every(Boolean)) {
    const ns = m.map(x => Number(x[2])).sort((a, b) => a - b);
    if (ns.every((n, k) => !k || n === ns[k - 1] + 1)) return `${[...new Set(m.map(x => x[1]))].join('·')} ${ns[0]}~${ns[ns.length - 1]}차시`;
  }
  return ls.join('·');
}
// 요소 묶음 하나로 수행평가 하나 만들기(묶음에 요소가 여럿이면 요소별 척도를 그대로 둔다)
function taskFromParts(t, ps, group) {
  const sel = ps.filter(p => group.includes(p.no));
  const one = sel.length === 1;
  const base = t.splitFrom || t.name.replace(/\([^()]*\)\s*$/, '').trim() || t.name;
  return newTask(Object.assign({}, JSON.parse(JSON.stringify(t)), {
    name: `${base}(${joinLabels(sel.map(p => partLabel(ps, p)))})`,
    maxScore: sum(sel.map(p => p.max)) || t.maxScore,
    criteria: sel.flatMap((p, k) => p.crit.map(c => Object.assign({}, c, { part: one ? 1 : k + 1 }))),
    scale: sel.flatMap((p, k) => p.scale.map(x => Object.assign({}, x, { part: one ? 1 : k + 1 }))),
    parts: one ? [] : sel.map(p => ({ name: p.name, kind: p.kind })), splitFrom: base, keys: {},
  }));
}
function splitTask(course, t, groups) {
  const ps = partsOf(t); if (!ps || t.classes.length) return 0;
  groups = (groups || ps.map(p => [p.no])).filter(g => g.length);
  if (groups.length < 2) return 0;
  const made = groups.map(g => taskFromParts(t, ps, g));
  const i = course.tasks.indexOf(t); course.tasks.splice(i, 1, ...made);
  return made.length;
}
function canMerge(t) { return !t.classes.length; }
function mergeTasks(course, list, name) {
  const parts = [], criteria = [], scale = [];
  list.forEach(t => {
    const ps = partsOf(t) || [{ name: t.name, kind: ((t.name.match(/\(([^()]*)\)\s*$/) || [])[1] || ''), crit: t.criteria, scale: t.scale || [], max: t.maxScore }];
    ps.forEach(p => {
      const no = parts.length + 1; parts.push({ name: p.name, kind: p.kind });
      p.crit.forEach(c => criteria.push(Object.assign({}, c, { part: no })));
      p.scale.forEach(x => scale.push(Object.assign({}, x, { part: no })));
    });
  });
  const base = list[0];
  const m = newTask(Object.assign({}, JSON.parse(JSON.stringify(base)), {
    name, maxScore: sum(list.map(t => Number(t.maxScore) || 0)), criteria, scale, parts, keys: {},
    specials: base.specials || [], splitFrom: list.every(t => t.splitFrom && t.splitFrom === base.splitFrom) ? base.splitFrom : '',
    assignment: [...new Set(list.map(t => t.assignment).filter(Boolean))].join('\n'),
  }));
  const at = Math.min(...list.map(t => course.tasks.indexOf(t)));
  course.tasks = course.tasks.filter(t => !list.includes(t)); course.tasks.splice(at, 0, m);
  return m;
}
function mergeName(list) {
  const inner = list.map(t => (t.name.match(/\(([^()]*)\)\s*$/) || [])[1]);
  const bases = list.map(t => t.name.replace(/\([^()]*\)\s*$/, '').trim());
  if (inner.every(Boolean) && bases.every(b => b === bases[0])) return `${bases[0]}(${joinLabels(inner)})`;
  return list.map(t => t.name).join(' + ');
}
function mergeAsk(course, firstId) {
  const ts = course.tasks;
  modal(`<h2>수행평가 합치기</h2>
    <p class="small muted" style="margin:0 0 10px"><b>한 시험지(답안지)</b>에 함께 있는 수행평가를 하나로 합쳐 같이 채점해요. 채점 기준과 '○개 충족 → 점수' 표는 요소별로 그대로 두고 점수를 더해요.</p>
    <div class="mg">${ts.map(t => `<label class="opt ${canMerge(t) ? '' : 'dis'}"><input type="checkbox" data-mg="${t.id}" ${t.id === firstId ? 'checked' : ''} ${canMerge(t) ? '' : 'disabled'}>
      <span><b>${esc(t.name)}</b><small class="faint"> · ${t.maxScore}점 · 기준 ${t.criteria.length}개${canMerge(t) ? '' : ' · 반이 있어 합칠 수 없어요'}</small></span></label>`).join('')}</div>
    <label class="f" style="margin-top:10px">합친 이름</label><input class="in" id="mgname">
    <p class="small faint" id="mginfo" style="margin:6px 0 0"></p>
    <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="mggo" disabled>${ic('check')}합치기</button></div>`);
  let touched = false;
  const sel = () => $$('#mbox [data-mg]:checked').map(cb => ts.find(t => t.id === cb.dataset.mg));
  const upd = () => {
    const l = sel(), modes = new Set(l.map(t => t.mode));
    if (!touched) $('#mgname').value = l.length > 1 ? mergeName(l) : '';
    $('#mginfo').textContent = l.length < 2 ? '두 개 이상 고르세요.' : modes.size > 1 ? '채점 방식(개수 세기/배점 더하기)이 다른 것은 합칠 수 없어요.' : `${l.length}개 → 만점 ${sum(l.map(t => Number(t.maxScore) || 0))}점 · 기준 ${sum(l.map(t => t.criteria.length))}개`;
    $('#mggo').disabled = l.length < 2 || modes.size > 1;
  };
  $('#mgname').oninput = () => { touched = true; };
  $('#mbox').onchange = e => { if (e.target.matches('[data-mg]')) upd(); };
  upd();
  $('#mggo').onclick = () => {
    const l = sel(); snap(`수행평가 ${l.length}개 합치기`); const m = mergeTasks(course, l, $('#mgname').value.trim() || mergeName(l)); save(true);
    closeModal(true); rerender(); toast(`'${m.name}'(으)로 합쳤어요. 다시 나누려면 ⋯ → 평가 요소별로 나누기.`, 4000);
  };
}
function splitAsk(course, list, done) {
  modal(`<h2>평가 요소가 나뉜 수행평가가 있어요</h2>
    <p class="small muted" style="margin:0 0 10px">시험지(답안지)마다 수행평가 하나로 나누면 정답표·채점이 정확해요. 요소마다 <b>어느 시험지에 있는지</b> 고르세요. <b>같은 번호</b>를 고른 요소는 하나로 함께 채점해요.</p>
    ${list.map(t => { const ps = partsOf(t); const opts = no => ps.map((_, k) => `<option value="${k + 1}" ${k + 1 === no ? 'selected' : ''}>시험지 ${k + 1}</option>`).join('');
      return `<div class="opt sp" data-sp="${t.id}"><label class="sph"><input type="checkbox" data-split="${t.id}" checked><b>${esc(t.name)}</b> · ${t.maxScore}점</label>
      ${ps.map(p => `<div class="spr"><select class="in sm" data-spg="${p.no}">${opts(p.no)}</select><span>${esc(partLabel(ps, p))}<small class="faint"> · ${esc(p.name.length > 26 ? p.name.slice(0, 26) + '…' : p.name)} · 기준 ${p.crit.length}개 · ${p.max}점</small></span></div>`).join('')}
      <div class="spv small muted"></div></div>`; }).join('')}
    <div class="foot"><button class="btn" id="spno">하나로 두기</button><button class="btn primary" id="spgo">${ic('check')}고른 것 나누기</button></div>`);
  $('#modal').dataset.lock = '1';
  const end = () => { delete $('#modal').dataset.lock; closeModal(true); save(true); done && done(); };
  $('#spno').onclick = end;
  const groupsOf = box => { const m = {}; box.querySelectorAll('[data-spg]').forEach(sel => { (m[sel.value] = m[sel.value] || []).push(Number(sel.dataset.spg)); }); return Object.keys(m).sort((a, b) => a - b).map(k => m[k]); };
  const preview = () => $$('#mbox [data-sp]').forEach(box => {
    const t = course.tasks.find(x => x.id === box.dataset.sp), ps = partsOf(t), gs = groupsOf(box);
    box.querySelector('.spv').innerHTML = gs.length < 2 ? '→ 모두 같은 시험지라 하나로 둬요' : '→ ' + gs.map(g => `<b>${esc(joinLabels(ps.filter(p => g.includes(p.no)).map(p => partLabel(ps, p))))}</b>(${sum(ps.filter(p => g.includes(p.no)).map(p => p.max))}점)`).join(' + ');
  });
  $('#mbox').onchange = e => { if (e.target.matches('[data-spg]')) preview(); };
  preview();
  $('#spgo').onclick = () => {
    if ($$('#mbox [data-split]:checked').length) snap('평가 요소별로 나누기');
    let n = 0; $$('#mbox [data-split]:checked').forEach(cb => { const t = course.tasks.find(x => x.id === cb.dataset.split); if (t) n += splitTask(course, t, groupsOf(cb.closest('[data-sp]'))); });
    if (n) toast(`평가 요소별로 ${n}개 수행평가를 만들었어요.`, 3000);
    end();
  };
}
function copyTask(course, t) {
  const c = newTask(Object.assign({}, JSON.parse(JSON.stringify(t)), { name: t.name + ' 복사본', keys: {} }));
  course.tasks.splice(course.tasks.indexOf(t) + 1, 0, c); save(true);
  return c;
}

/* ================= 과목 화면 ================= */
function vCourse(cid) {
  const c = findCourse(cid); if (!c) return '<div class="card empty">과목을 찾을 수 없습니다. <a href="#/">처음으로</a></div>';
  crumb([[c.name]]);
  const names = [...new Set(c.tasks.flatMap(t => t.classes.map(k => k.name)))];
  const meta = courseMeta(c);
  return `
  <div class="phead"><div class="pt"><h1>${esc(c.name)}</h1><div class="sub">${esc(meta)}
      <span class="cbyte" title="이 과목 세특의 바이트 범위(나이스 기준). 비우면 설정값을 써요">· 세특 길이 <input class="in" type="number" data-cbyte="min" data-id="${c.id}" value="${c.byteMin || ''}" placeholder="${App.settings().byteMin}">~<input class="in" type="number" data-cbyte="max" data-id="${c.id}" value="${c.byteMax || ''}" placeholder="${App.settings().byteMax}">B</span></div></div>
    <details class="menu"><summary class="btn" title="더 보기">${ic('more')}</summary><div class="mlist">
      ${c.tasks.filter(canMerge).length > 1 || c.tasks.some(t => partsOf(t) && !t.classes.length) ? '<div class="mcap">수행평가</div>' : ''}
      ${c.tasks.filter(canMerge).length > 1 ? `<button data-act="mergeask" data-id="${c.id}">${ic('copy')}수행평가 합치기…</button>` : ''}
      ${c.tasks.some(t => partsOf(t) && !t.classes.length) ? `<button data-act="splitask" data-id="${c.id}">${ic('more')}평가 요소별로 나누기…</button>` : ''}
      <div class="mcap">과목</div>
      <button data-act="renamecourse" data-id="${c.id}">${ic('pen')}과목 이름 바꾸기</button>
      ${c.planText ? `<button data-act="showplan" data-id="${c.id}">${ic('task')}평가계획서 글 보기</button>` : ''}
      <button class="danger" data-act="delcourse" data-id="${c.id}">${ic('trash')}과목 지우기</button></div></details></div>
  <div class="tks">${c.tasks.map(t => taskCard(t)).join('')}<button class="tk tk-add" data-act="addtask" data-id="${c.id}">${ic('plus')}<b>수행평가 추가</b><span>빈 채점 기준으로 새로 만들기</span></button></div>
  ${names.length ? `<div class="sec-h" style="margin-top:22px">${ICON.grad}반별 세특 모아보기</div>
    <div class="row">${names.map(n => `<a class="btn sm" href="#/s/${c.id}/${encodeURIComponent(n)}">${esc(n)}</a>`).join('')}</div>` : ''}`;
}

/* ================= 채점 기준(수행평가) 화면 ================= */
function vTask(tid) {
  const { course, task: t } = findTask(tid); if (!t) return '<div class="card empty">수행평가를 찾을 수 없습니다.</div>';
  crumb([[course.name, '#/c/' + course.id], [t.name + ' 채점 기준']]);
  const crit = t.criteria.map((c, i) => `
    <div class="crit">
      <div class="no">${i + 1}${partsOf(t) ? `<small class="pno" title="${esc((t.parts[(c.part || 1) - 1] || {}).name || '')}">요소${c.part || 1}</small>` : ''}</div>
      <div><textarea class="in" rows="2" data-f="crit.text" data-i="${i}">${esc(c.text)}</textarea>
      </div>
      <div>${t.mode === 'points' ? `<input class="in" type="number" step="0.5" value="${c.points || 0}" data-f="crit.points" data-i="${i}" title="배점">` : ''}</div>
      <button class="btn sm ghost danger" data-act="delcrit" data-i="${i}" title="지우기">✕</button>
    </div>`).join('');
  const scale = (t.scale || []).map((s, i) => `<span class="it">${partsOf(t) ? `<small class="pno">요소${s.part || 1}</small>` : ''}<input class="in" type="number" value="${s.count}" data-f="scale.count" data-i="${i}">개 →<input class="in" type="number" step="0.5" value="${s.score}" data-f="scale.score" data-i="${i}">점<button class="btn sm ghost" data-act="delscale" data-i="${i}">✕</button></span>`).join('');
  const specials = (t.specials || []).map((s, i) => `<span class="it"><input class="in" style="width:200px" value="${esc(s.label)}" data-f="spec.label" data-i="${i}"><input class="in" type="number" step="0.5" value="${s.score}" data-f="spec.score" data-i="${i}">점<button class="btn sm ghost" data-act="delspec" data-i="${i}">✕</button></span>`).join('');
  after = () => bindTaskInputs(t);
  return `
  <div class="row between" style="margin-bottom:14px"><div class="title">${esc(t.name)} · 채점 기준</div>
    <div class="row">${partsOf(t) && !t.classes.length ? `<button class="btn sm" data-act="splittask" data-id="${t.id}">${ic('more')}평가 요소별로 나누기</button>` : ''}
      <button class="btn sm" data-act="copytask" data-id="${t.id}" title="이 채점 기준을 복사해 수행평가를 하나 더 만들어요">${ic('copy')}복사해서 하나 더</button>
      <button class="btn danger sm" data-act="deltask" data-id="${t.id}">수행평가 지우기</button><a class="btn primary" href="#/c/${course.id}">완료</a></div></div>
  <div class="card">
    <div class="sec-h">${ICON.doc}기본 정보</div>
    <div class="tinfo">
      <div><label class="f">이름</label><input class="in" data-f="name" value="${esc(t.name)}"></div>
      <div><label class="f">만점</label><input class="in" type="number" data-f="maxScore" value="${t.maxScore}"></div>
      <div><label class="f">평가 방법</label><input class="in" data-f="method" value="${esc(t.method || '')}" placeholder="예: 논술"></div>
      <div><label class="f">시기</label><input class="in" data-f="period" value="${esc(t.period || '')}" placeholder="예: 10월 3주"></div>
    </div>
    <label class="f">수행 과제</label><textarea class="in" rows="2" data-f="assignment">${esc(t.assignment || '')}</textarea>
    ${t.standards.length ? `<label class="f">성취기준</label><div class="small">${t.standards.map(s => `<div><b>${esc(s.code)}</b> ${esc(s.text)}</div>`).join('')}</div>` : ''}
    ${t.levels.length ? `<details style="margin-top:10px"><summary class="small muted" style="cursor:pointer">성취수준 A~E 보기</summary><div class="small" style="margin-top:6px">${t.levels.map(l => `<div style="margin-bottom:4px"><b>${esc(l.grade)}</b> ${esc(l.text)}</div>`).join('')}</div></details>` : ''}
  </div>
  <div class="card">
    <div class="sec-h">${ICON.check}채점 기준 항목<span class="sp"></span>
      <select class="in" style="width:auto" data-f="mode"><option value="count" ${t.mode !== 'points' ? 'selected' : ''}>충족한 항목 수로 점수</option><option value="points" ${t.mode === 'points' ? 'selected' : ''}>항목별 배점 합산</option></select></div>
    ${crit || '<p class="muted">항목이 없습니다.</p>'}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="addcrit">+ 항목 추가</button>
      </div>
    <label class="f" style="margin-top:16px">정답표 <span class="faint">— 시험지 형마다 문항별 정답과 기준 ↔ 문항. 첫 AI 채점 때 만들어져요</span></label>
    <div class="row">${Object.entries(t.keys || {}).map(([f, k]) => { const c = t.classes.find(x => keyOf(t, x) === k); return c ? `<button class="btn sm" data-act="keyview" data-id="${c.id}">${f ? esc(f) + '형' : '정답표'} · ${t.classes.filter(x => keyOf(t, x) === k).map(x => esc(x.name)).join(', ')}${k.checked ? '' : ' <span class="pill ai">확인 필요</span>'}</button>` : ''; }).join('') || '<span class="small muted">아직 없어요.</span>'}</div>
    <label class="f" style="margin-top:16px">AI 채점 기준</label>
    <div class="row">${strictSeg(t)}<span class="small muted">${STRICT_NOTE[t.strict || '보통']}</span></div>
    ${t.mode !== 'points' ? `<label class="f" style="margin-top:16px">점수 환산(충족 항목 수 → 점수)</label><div class="scale">${scale}<button class="btn sm" data-act="addscale">+</button></div>` : ''}
    <label class="f" style="margin-top:14px">특수 상황 점수(백지·미참여·결석 등)</label><div class="scale">${specials}<button class="btn sm" data-act="addspec">+</button></div>
  </div>
  <div class="card">
    <div class="sec-h">${ICON.pen}채점 방향·정답 메모 <span class="faint small">(선택)</span></div>
    <div class="sub">AI 는 이 메모를 가장 먼저 따라요. 선생님이 무엇을 보고 점수를 주는지 적어 두면 AI 판단이 선생님과 가까워져요.</div>
    <label class="f">선생님 메모</label><textarea class="in" rows="3" data-f="question" placeholder="예) 물어본 것에 성실히 답하고 칸을 채웠으면 충족(내용의 깊이는 보지 않음). / 1번 정답: 펩신의 최적 pH 는 2.">${esc(t.question || '')}</textarea>

  </div>`;
}
function bindTaskInputs(t) {
  $$('[data-f]', view).forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.f, i = Number(el.dataset.i), v = el.value;
      const num = x => (x === '' ? 0 : Number(x));
      if (f === 'crit.text') t.criteria[i].text = v;
      else if (f === 'crit.guide') t.criteria[i].guide = v;
      else if (f === 'crit.qnos') { t.criteria[i].qnos = v.replace(/번/g, '').trim(); t.criteria[i].qnosByTeacher = true; t.mapAt = t.mapAt || Date.now(); }
      else if (f === 'crit.points') t.criteria[i].points = num(v);
      else if (f === 'scale.count') t.scale[i].count = num(v);
      else if (f === 'scale.score') t.scale[i].score = num(v);
      else if (f === 'spec.label') t.specials[i].label = v;
      else if (f === 'spec.score') t.specials[i].score = num(v);
      else if (f === 'maxScore') t.maxScore = num(v);
      else if (f === 'mode') { t.mode = v; save(); rerender(); return; }
      else t[f] = v;
      save();
    });
  });
}

/* ================= 반 추가 / 쪽 나누기 ================= */
function addClassModal(tid) {
  const { task } = findTask(tid);
  const prev = task.classes[task.classes.length - 1];
  modal(`<h2>반 추가 — ${esc(task.name)}</h2>
    <div class="grid2" style="grid-template-columns:2fr 1fr 1fr">
      <div><label class="f">반 이름</label><input class="in" id="cname" placeholder="예) 2학년 4반" value=""></div>
      <div><label class="f">학생 수</label><input class="in" id="csize" type="number" value="${prev ? prev.size : 30}"></div>
      <div><label class="f">학생당 쪽 수</label><input class="in" id="cper" type="number" value="${prev ? prev.perStudent : 2}"></div>
    </div>
    <label class="f">시험지 형 <span class="faint">(예: A, C — 비우면 AI 가 답안지 머리글에서 찾아요)</span></label><input class="in" id="cform" style="width:120px" placeholder="자동">
    <label class="f">답안 스캔 PDF</label>
    <div class="drop" id="cdrop">파일을 끌어 놓거나 눌러서 고르세요<div id="cfiles" class="small" style="margin-top:6px"></div></div>
    <input type="file" id="cfile" multiple accept=".pdf,image/*" class="hide">
    <p class="small muted">번호 순서대로 스캔한 PDF 를 학생당 쪽 수로 나눠요. 다음 화면에서 고칠 수 있어요.</p>
    <div id="cprog" class="hide"><p id="cmsg" class="small"></p><div class="prog"><i></i></div></div>
    <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="cgo">올리기</button></div>`);
  let files = [];
  const pick = fs => { files = [...fs]; $('#cfiles').textContent = files.map(f => f.name).join(', '); };
  dropzone($('#cdrop'), $('#cfile'), pick);
  $('#cgo').onclick = async () => {
    const name = $('#cname').value.trim() || `반 ${task.classes.length + 1}`;
    const size = Math.max(1, Number($('#csize').value) || 30), per = Math.max(1, Number($('#cper').value) || 1);
    if (!files.length) { toast('답안 파일을 골라 주세요.'); return; }
    const cf = normForm($('#cform').value);
    const cls = { id: uid(), name, size, perStudent: per, pages: [], starts: [], subs: [], masks: [], students: {}, createdAt: Date.now(), form: cf, formChecked: false };
    $('#cgo').disabled = true; $('#cprog').classList.remove('hide'); $('#modal').dataset.lock = '1';
    try {
      await addPages(cls, files, (msg, f) => { $('#cmsg').textContent = msg; $('#cprog .prog i').style.width = (f * 100) + '%'; });
      splitEvery(cls, per);
      task.classes.push(cls); save(true);
      delete $('#modal').dataset.lock; closeModal();
      location.hash = `#/k/${cls.id}/pages`;
      if (needOrient(cls)) setTimeout(() => orientJob(cls), 300);
    } catch (e) {
      delete $('#modal').dataset.lock; $('#cgo').disabled = false; toast('읽지 못했습니다: ' + e.message, 4000);
    }
  };
}
async function addPages(cls, files, onMsg, reuseIds) {
  BUSY++;
  try { return await addPagesInner(cls, files, onMsg, reuseIds); } finally { BUSY--; }
}
async function addPagesInner(cls, files, onMsg, reuseIds) {
  let k = 0;
  for (const f of files) {
    await Parse.filePages(f, async pg => {
      const id = reuseIds ? reuseIds[k] : cls.id + ':' + uid();
      if (!id) { k++; return; }
      await DB.put('img', id, pg.blob); await DB.put('img', id + ':t', pg.thumb);
      if (typeof Sync !== 'undefined') Sync.queueImg(id);
      urlCache.delete(id); urlCache.delete(id + ':t');
      if (!reuseIds) cls.pages.push({ id, w: pg.w, h: pg.h, skip: false });
      k++;
    }, (i, n) => onMsg(`${f.name} — ${i}/${n}쪽 그리는 중`, i / n));
  }
  return k;
}
function dropzone(zone, input, cb) {
  zone.onclick = e => { if (e.target.closest('button,a,input')) return; input.click(); };
  input.onchange = () => input.files.length && cb(input.files);
  zone.ondragover = e => { e.preventDefault(); zone.classList.add('over'); };
  zone.ondragleave = () => zone.classList.remove('over');
  zone.ondrop = e => { e.preventDefault(); zone.classList.remove('over'); if (e.dataTransfer.files.length) cb(e.dataTransfer.files); };
}

function vPages(kid) {
  const { course, task, cls } = findClass(kid); if (!cls) return '<div class="card empty">반을 찾을 수 없습니다.</div>';
  crumb([[course.name, '#/c/' + course.id], [task.name], [cls.name, '#/k/' + cls.id], ['답안 나누기']]);
  const startNo = {}; cls.subs.forEach(s => startNo[s.pages[0]] = s);
  const nos = Array.from({ length: cls.size }, (_, i) => i + 1);
  const absent = nos.filter(n => (cls.students[n] || {}).status === '미응시');
  const missing = nos.filter(n => !subOf(cls, n) && !absent.includes(n));
  const over = cls.subs.filter(s => s.no > cls.size);
  const firstLive = cls.pages.findIndex(p => !p.skip);
  const sel = G.psel = (G.psel && G.psel.kid === cls.id) ? G.psel : Object.assign(new Set(), { kid: cls.id });
  [...sel].forEach(id => { if (!cls.pages.some(p => p.id === id)) sel.delete(id); });
  // 쪽마다 몇 번 학생의 몇째 쪽인지
  const whose = {}; cls.subs.forEach(x => x.pages.forEach((pi, k) => { whose[pi] = { no: x.no, k: k + 1, n: x.pages.length }; }));
  const thumbs = cls.pages.map((p, i) => {
    const s = startNo[i], w = whose[i], on = sel.has(p.id);
    const startBtn = p.skip || i === firstLive ? '' : `<button data-act="togstart" data-i="${i}" title="이 쪽부터 다음 학생">${s ? '이어붙이기' : '새 학생'}</button>`;
    return `<div class="th ${s ? 'start' : ''} ${p.skip ? 'skip' : ''} ${on ? 'sel' : ''}" draggable="true" data-pi="${i}" data-pid="${p.id}">
      <img data-thumb="${p.id}:t" alt="" data-act="bigpage" data-i="${i}" draggable="false">
      <button class="pchk" data-pchk="${i}" title="고르기 (Ctrl·Shift 를 누르고 쪽을 눌러도 돼요)">${on ? ic('check') : ''}</button>
      ${s ? `<span class="badge">${s.no}번</span>` : w ? `<span class="badge sub">${w.no}번 ${w.k}/${w.n}</span>` : ''}
      <div class="tools"><button class="rot" data-act="prot" data-i="${i}" title="이 쪽을 시계 방향으로 90° 돌리기">↻</button>${startBtn}<button data-act="togskip" data-i="${i}">${p.skip ? '되살리기' : '빼기'}</button></div>
      <div class="cap"><span>${i + 1}쪽</span>${s ? `<span>번호 <input class="ptinput" style="width:46px" type="number" value="${s.no}" data-act="setno" data-i="${i}"></span>` : ''}</div>
    </div>`;
  }).join('');
  const selIdx = cls.pages.map((p, i) => sel.has(p.id) ? i : -1).filter(i => i >= 0);
  const selBar = `<div class="psel ${selIdx.length ? '' : 'hide'}" id="psel"><b>${selIdx.length}쪽 고름</b><span class="faint">${selIdx.map(i => i + 1).join(', ')}쪽</span>
      <span class="sp"></span><label>쪽 번호 <input class="in num" id="pmto" type="number" min="1" max="${cls.pages.length}" placeholder="몇"></label>
      <button class="btn sm" data-act="pmove" data-w="before">그 쪽 앞으로</button><button class="btn sm" data-act="pmove" data-w="after">그 쪽 뒤로</button>
      <button class="btn sm" data-act="protsel" data-d="270" title="왼쪽으로 90°">↺</button><button class="btn sm" data-act="protsel" data-d="90" title="오른쪽으로 90°">↻ 돌리기</button><button class="btn sm" data-act="protsel" data-d="180">180°</button>
      <button class="btn sm" data-act="pskip" title="채점에서만 빼기(그림은 남음)">빼기</button><button class="btn sm danger" data-act="pdel" title="고른 쪽 그림을 지워요(Ctrl+Z 되돌리기)">${ic('trash')}지우기</button><button class="btn sm ghost" data-act="pclear">고르기 풀기</button></div>`;
  after = () => {
    loadThumbs();
    $$('[data-act="setno"]').forEach(el => el.addEventListener('change', () => {
      snap(`번호 ${el.value} 정하기`); const s = startNo[Number(el.dataset.i)]; s.no = Number(el.value); s.fixed = true; rebuildSubs(cls); save(); rerender();
    }));
    pageDrag(cls);
  };
  const imgMissing = cls.pages.length && !cls._imgChecked;
  if (imgMissing) { cls._imgChecked = true; getImg(cls.pages[0].id + ':t').then(b => { if (!b) { cls._noimg = true; rerender(); } }); }
  return `
  <div class="row between" style="margin-bottom:14px"><div><div class="title">${esc(cls.name)} · 답안 나누기</div>
    <div class="sub">${esc(task.name)} · 전체 ${cls.pages.length}쪽 → 답안 ${cls.subs.length}개 / 학생 ${cls.size}명</div></div>
    <a class="btn primary" href="#/k/${cls.id}">채점하러 가기 →</a></div>
  ${cls._noimg ? `<div class="card note">이 브라우저에 답안 그림이 없어요. 같은 PDF 를 다시 연결하세요. <button class="btn sm" data-act="relink" data-id="${cls.id}">PDF 다시 연결</button></div>` : ''}
  <div class="card">
    <div class="row" style="gap:16px;align-items:end">
      <div><label class="f">학생 수</label><input class="in num" type="number" id="psize" value="${cls.size}"></div>
      <div><label class="f">학생당 쪽 수</label><input class="in num" type="number" id="pper" value="${cls.perStudent}"></div>
      <button class="btn" data-act="resplit" data-id="${cls.id}">이대로 다시 나누기</button>
      <button class="btn soft" data-act="masks" data-id="${cls.id}">${ICON.img}이름 칸 가리기 ${cls.masks.length ? `(${cls.masks.length}곳)` : '(아직 없음)'}</button>
      <span class="sp"></span>
      <details class="menu"><summary class="btn" title="파일·지우기">${ic('more')}</summary><div class="mlist">
        <div class="mcap">파일</div>
        <button data-act="morefiles" data-id="${cls.id}">${ICON.up}파일 더 올리기</button>
        <button data-act="replacefiles" data-id="${cls.id}">${ICON.up}파일 바꾸기(지금 그림 빼고 새로)</button>
        <div class="mcap">지우기</div>
        <button data-act="pdelall" data-id="${cls.id}">${ic('trash')}그림 모두 지우기(채점 기록은 남음)</button>
        <button class="danger" data-act="delclass" data-id="${cls.id}">${ic('trash')}반 지우기</button></div></details>
    </div>
    <div class="row orow"><span class="small muted">쪽 방향</span>
      <button class="btn sm" data-act="autoorient" data-id="${cls.id}" title="AI 가 자리마다 2~3쪽을 보고 방향을 맞춰요(작게 줄여 보내 이름은 읽히지 않아요)">${ic('bot')}자동으로 맞추기</button>
      <span class="small faint">전체</span><button class="btn sm" data-act="protall" data-d="270">↺ 왼쪽</button><button class="btn sm" data-act="protall" data-d="90">↻ 오른쪽</button><button class="btn sm" data-act="protall" data-d="180">180°</button>
      <span class="small faint">한 쪽만은 쪽의 ↻, 여러 쪽은 골라서 돌려요</span>
    </div>
    <label class="f" style="margin-top:14px">미응시 번호 <span class="faint">— 누르면 그 번호를 건너뛰어요</span></label>
    <div class="row" style="gap:6px">${nos.map(n => `<button class="chip ${absent.includes(n) ? 'gray on' : 'gray'}" data-act="togabsent" data-no="${n}">${n}</button>`).join('')}</div>
    ${missing.length ? `<p class="note" style="margin-top:12px">답안 없는 번호: ${missing.join(', ')} (미제출로 처리)</p>` : ''}
    ${over.length ? `<p class="note" style="margin-top:12px">답안이 학생 수보다 많아요(${over.map(s => s.no + '번').join(', ')}). 쪽 수나 빼야 할 쪽을 확인하세요.</p>` : ''}
    ${!cls.masks.length ? `<p class="note blue" style="margin-top:12px">AI 로 보내기 전에 <b>이름 칸 가리기</b>를 해 주세요.</p>` : ''}
  </div>
  <p class="small muted" style="margin:0 0 8px">쪽을 <b>끌어서</b> 옮겨요. 여러 쪽은 왼쪽 위 네모(또는 <b>Ctrl·Shift + 누르기</b>)로 고른 뒤 함께 끌어요. 쪽의 <b>오른쪽</b>에 놓으면 그 학생에 붙고, 학생 첫 쪽의 <b>왼쪽</b>에 놓으면 새 학생으로 들어가요.</p>
  ${selBar}
  <div class="thumbs" id="thumbs">${thumbs}</div>`;
}
// 쪽 고르기(Ctrl·Shift·네모) · 끌어 옮기기
function pageDrag(cls) {
  const box = $('#thumbs'); if (!box) return;
  const sel = G.psel;
  const idxOf = el => Number(el.dataset.pi);
  const toggle = (i, range) => {
    const id = cls.pages[i].id;
    if (range && G.plast != null) { const [a, b] = [Math.min(G.plast, i), Math.max(G.plast, i)]; for (let k = a; k <= b; k++) sel.add(cls.pages[k].id); }
    else if (sel.has(id)) sel.delete(id); else sel.add(id);
    G.plast = i; rerender();
  };
  box.addEventListener('click', e => {
    const chk = e.target.closest('[data-pchk]');
    if (chk) { e.preventDefault(); e.stopPropagation(); toggle(Number(chk.dataset.pchk), e.shiftKey); return; }
    const th = e.target.closest('.th');
    if (th && (e.ctrlKey || e.metaKey || e.shiftKey) && !e.target.closest('button,input')) { e.preventDefault(); e.stopPropagation(); toggle(idxOf(th), e.shiftKey); }
  }, true);
  let drag = null, mark = null;
  const clearMark = () => { if (mark) { mark.classList.remove('dropL', 'dropR'); delete mark.dataset.drop; } mark = null; };
  box.addEventListener('dragstart', e => {
    const th = e.target.closest('.th'); if (!th || e.target.closest('input')) return;
    const i = idxOf(th);
    if (!sel.has(cls.pages[i].id)) { sel.clear(); sel.add(cls.pages[i].id); }
    drag = cls.pages.map((p, k) => sel.has(p.id) ? k : -1).filter(k => k >= 0);
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'pages'); } catch (x) {}
    drag.forEach(k => { const el = box.querySelector(`[data-pi="${k}"]`); if (el) el.classList.add('dragging'); });
    if (drag.length > 1) { const g = document.createElement('div'); g.className = 'dragghost'; g.textContent = `${drag.length}쪽 옮기기`; document.body.appendChild(g); e.dataTransfer.setDragImage(g, 20, 14); setTimeout(() => g.remove(), 0); }
  });
  box.addEventListener('dragover', e => {
    if (!drag) return; const th = e.target.closest('.th'); if (!th) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const r = th.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2;
    if (mark !== th) clearMark(); mark = th;
    th.classList.toggle('dropR', right); th.classList.toggle('dropL', !right); th.dataset.drop = dropHint(cls, idxOf(th), right);
    // 끄는 동안 화면 끝에 가면 저절로 넘김
    const sc = document.scrollingElement, m = 70; const main = th.closest('.main, main, #main') || sc;
    if (e.clientY < m) (main.scrollBy ? main : sc).scrollBy(0, -18); else if (e.clientY > innerHeight - m) (main.scrollBy ? main : sc).scrollBy(0, 18);
  });
  box.addEventListener('dragleave', e => { if (mark && !mark.contains(e.relatedTarget)) clearMark(); });
  box.addEventListener('drop', e => {
    if (!drag) return; e.preventDefault();
    const th = e.target.closest('.th'); const right = th && th.classList.contains('dropR'); clearMark();
    const list = drag; drag = null;
    if (!th) return rerender();
    const hint = dropHint(cls, idxOf(th), right);
    snap(`${list.length}쪽 옮기기`);
    const moved = movePages(cls, list, idxOf(th), right);
    if (!moved) UNDO.stack.pop(), renderUndo();
    if (moved) { G.plast = null; sel.clear(); save(); rerender(); toast(`${list.length}쪽 옮김 · ${hint.replace('붙이기', '붙였어요').replace('새 학생으로', '새 학생으로 넣었어요')}${Object.values(cls.students).some(x => x.ai) ? ' · 이미 채점한 학생은 다시 채점해 주세요' : ''}`, 3500); }
    else rerender();
  });
  box.addEventListener('dragend', () => { clearMark(); if (drag) { drag = null; rerender(); } });
}
function loadThumbs() {
  $$('img[data-thumb]').forEach(async im => { const u = await imgURL(im.dataset.thumb); if (u) im.src = u; });
}

function maskModal(kid) {
  const { cls } = findClass(kid);
  let si = 0, masks = JSON.parse(JSON.stringify(cls.masks || [])), scope = 0;
  const draw = async () => {
    const sub = cls.subs[si]; if (!sub) { toast('나뉜 답안이 없습니다.'); return; }
    const pi = Math.min(scope === -1 ? 0 : scope, sub.pages.length - 1);
    const p = cls.pages[sub.pages[pi]];
    modal(`<h2>이름 칸 가리기</h2>
      <p class="small muted">학번·이름 칸을 끌어서 <b>넉넉하게</b> 덮으세요. 모든 학생에게 같은 자리가 적용되고, AI 로 보낼 때만 검게 칠해요. ‹ › 로 다른 번호도 확인하세요.</p>
      <div class="row" style="margin-bottom:10px">
        <span class="small">보기:</span><button class="btn sm" id="mprev">‹</button><b>${sub.no}번</b><button class="btn sm" id="mnext">›</button>
        <span class="small" style="margin-left:12px">적용할 쪽:</span>
        <select class="in" id="mscope" style="width:auto">${sub.pages.map((_, j) => `<option value="${j}" ${scope === j ? 'selected' : ''}>각 학생 ${j + 1}쪽</option>`).join('')}<option value="-1" ${scope === -1 ? 'selected' : ''}>모든 쪽</option></select>
        <button class="btn sm danger" id="mclear">이 쪽 상자 모두 지우기</button>
      </div>
      <div style="text-align:center"><div class="maskwrap" id="mw"><img id="mimg" alt=""></div></div>
      <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="msave">저장</button></div>`, true);
    $('#mimg').src = await imgURL(p.id);
    const mw = $('#mw');
    const paint = () => {
      $$('.mk', mw).forEach(e => e.remove());
      masks.filter(m => m.page === scope || m.page === -1 || (scope === -1)).forEach(m => {
        const d = document.createElement('div'); d.className = 'mk';
        Object.assign(d.style, { left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%' });
        mw.appendChild(d);
      });
    };
    paint();
    let st = null, tmp = null;
    const rel = e => { const r = mw.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
    mw.onpointerdown = e => { e.preventDefault(); mw.setPointerCapture(e.pointerId); st = rel(e); tmp = document.createElement('div'); tmp.className = 'mk drawing'; mw.appendChild(tmp); };
    mw.onpointermove = e => { if (!st) return; const q = rel(e); Object.assign(tmp.style, { left: Math.min(st.x, q.x) * 100 + '%', top: Math.min(st.y, q.y) * 100 + '%', width: Math.abs(q.x - st.x) * 100 + '%', height: Math.abs(q.y - st.y) * 100 + '%' }); };
    mw.onpointerup = e => {
      if (!st) return; const q = rel(e);
      const m = { x: Math.min(st.x, q.x), y: Math.min(st.y, q.y), w: Math.abs(q.x - st.x), h: Math.abs(q.y - st.y), page: scope };
      st = null; tmp.remove();
      if (m.w > 0.01 && m.h > 0.005) masks.push(m);
      paint();
    };
    $('#mprev').onclick = () => { si = Math.max(0, si - 1); draw(); };
    $('#mnext').onclick = () => { si = Math.min(cls.subs.length - 1, si + 1); draw(); };
    $('#mscope').onchange = e => { scope = Number(e.target.value); draw(); };
    $('#mclear').onclick = () => { masks = masks.filter(m => m.page !== scope); paint(); };
    $('#msave').onclick = () => {
      cls.masks = masks; save(); closeModal(); rerender(); toast('가림 영역을 저장했습니다.');
      const { task } = findClass(cls.id);
      if (masks.length && task && needPrep(task, cls) && (App.settings().apiKey || '').trim() && !jobFor('key:' + cls.id)) {
        toast('가린 답안지로 정답표를 미리 만들어 둘게요(오른쪽 아래).', 3500); keyJob(task, cls);
      }
    };
  };
  draw();
}

/* ================= 반(학생 목록) 화면 ================= */
// 반 화면에서 보이는 학생 번호(상태 거르기 + 찾기 + 정렬). 채점 화면의 ← → 도 이 순서를 따른다
function listNos(task, cls) {
  let nos = Array.from({ length: cls.size }, (_, i) => i + 1);
  if (F.status) nos = nos.filter(n => statusOf(cls, n) === F.status);
  if (F.q.trim()) {
    const q = F.q.trim();
    nos = nos.filter(n => {
      const s = cls.students[n] || {};
      return String(n) === q.replace(/번$/, '') || matchQ(s.seteuk, s.feedback, s.memo, s.ai && s.ai.transcript, statusOf(cls, n));
    });
  }
  if (F.sort === 'score') nos.sort((a, b) => (scoreOf(task, cls.students[b]) ?? -1) - (scoreOf(task, cls.students[a]) ?? -1) || a - b);
  if (F.sort === 'ai') nos.sort((a, b) => (aiScoreOf(task, cls.students[b]) ?? -1) - (aiScoreOf(task, cls.students[a]) ?? -1) || a - b);
  return nos;
}
function vClass(kid) {
  const { course, task, cls } = findClass(kid); if (!cls) return '<div class="card empty">반을 찾을 수 없습니다.</div>';
  scope([[course.name, '#/c/' + course.id], [task.name, '#/t/' + task.id], [cls.name]]);
  if (typeof Sync !== 'undefined') Sync.prefetch(cls);
  const n = classCounts(cls);
  const done = n['채점 완료'] + n['미제출'] + n['미응시'];
  const scores = []; let nSet = 0, canSet = 0;
  for (let i = 1; i <= cls.size; i++) {
    const s = cls.students[i]; const st = statusOf(cls, i);
    if (s && s.seteuk) nSet++; else if (st === '채점 완료' || st === 'AI 채점') canSet++;
    const sc = scoreOf(task, s); if (sc != null && st === '채점 완료') scores.push(sc);
  }
  const avg = scores.length ? (sum(scores) / scores.length).toFixed(1) : '';
  const nos = listNos(task, cls);
  G.navIds = nos.slice(); G.navKid = kid;
  const max = rangeFor(task)[1];
  const rows = nos.map(no => {
    const s = cls.students[no]; const st = statusOf(cls, no); const sub = subOf(cls, no);
    const sc = scoreOf(task, s), aisc = aiScoreOf(task, s);
    const b = s && s.seteuk ? App.bytes(s.seteuk) : 0;
    const sf = s && s.form != null && s.form !== formOf(cls) ? s.form : null;
    return `<a class="item stu" href="#/g/${cls.id}/${no}" data-no="${no}">
      <span class="no">${no}</span><span>${pillOf(st)}${sf != null ? ` <span class="pill ai" title="반과 다른 시험지 형">${esc(sf || '형 없음')}${sf ? '형' : ''}</span>` : ''}${s && s.formWarn ? ` <span class="pill bad" title="${esc(s.formWarn)}">시험지?</span>` : ''}${s && s.seteuk && s.seteukStale ? ' <span class="pill ai" title="채점 판단을 바꾼 뒤라 세특을 다시 써야 해요">세특 다시</span>' : ''}</span>
      <span class="sc">${sc == null ? '<span class="faint">-</span>' : sc}${aisc != null && aisc !== sc ? `<small class="faint"> AI ${aisc}</small>` : ''}</span>
      <span class="pv">${s && s.seteuk ? esc(s.seteuk) : `<span class="faint">${sub ? '' : '답안 없음'}</span>`}</span>
      <span class="r">${b ? `<span class="bt ${b > max ? 'bad' : ''}">${b}B</span><button class="ibtn" data-act="copyset" data-kid="${cls.id}" data-no="${no}" title="세특 복사">${ic('copy')}</button>` : ''}</span></a>`;
  }).join('');
  const nextTodo = firstTodo(cls);
  const pct = v => (v / cls.size * 100).toFixed(2) + '%';
  const TABL = { '': '전체', 'AI 채점': '확인 필요' };
  return `<div class="kcols"><div class="kleft">
  <div class="phead">
    <div class="pt"><h1>${esc(cls.name)}</h1><div class="sub">${esc(task.name)} · ${task.maxScore}점${avg ? ` · 평균 ${avg}점` : ''}
      · <a class="lnk" href="#/t/${task.id}" title="채점 기준 보기·고치기">채점 기준</a>
      · <button class="lnk" data-act="keyview" data-id="${cls.id}" title="문항별 정답과 채점 기준 ↔ 문항">${keyOf(task, cls) ? `${formOf(cls) ? esc(formOf(cls)) + '형 ' : ''}정답표${keyOf(task, cls).checked ? '' : ' <span class="pill ai">확인 필요</span>'}` : '정답표 만들기'}</button>${Object.entries(task.keys || {}).filter(([f, k]) => k.sample && k.sample.k === cls.id && f !== formOf(cls)).map(([f, k]) => ` · <button class="lnk" data-act="keyview" data-id="${cls.id}" data-f="${esc(f)}">${f ? esc(f) + '형' : '다른 시험지'} 정답표${k.checked ? '' : ' <span class="pill ai">확인 필요</span>'}</button>`).join('')}</div></div>
    ${nextTodo ? `<a class="btn primary lg" href="#/g/${cls.id}/${nextTodo}">${ic('play')}${statusOf(cls, nextTodo) === 'AI 채점' ? '확인' : '채점'} 이어 하기 · ${nextTodo}번</a>`
      : `<a class="btn lg" href="#/g/${cls.id}/1">${ic('check')}채점 끝 · 다시 보기</a>`}
  </div>
  ${Object.keys(cls.qflags || {}).length ? `<div class="card note qflag"><b>정답이 학생마다 다를 수 있는 문항</b> — ${Object.entries(cls.qflags).map(([q, m]) => `${esc(q)}번: ${esc(m)}`).join(' · ')}
    <div class="row" style="gap:6px;margin-top:8px">${Object.keys(cls.qflags).map(q => `<button class="btn sm primary" data-act="qtostudent" data-id="${cls.id}" data-q="${esc(q)}">${esc(q)}번을 '학생 조건에 따라'로 바꾸고 다시 판단</button>`).join('')}
      <button class="btn sm" data-act="keyview" data-id="${cls.id}">정답표 보기</button><button class="btn sm ghost" data-act="qflagoff" data-id="${cls.id}">괜찮아요</button></div></div>` : ''}
  <div class="kswitch">${task.classes.map(k => `<a class="kchip ${k === cls ? 'on' : ''}" href="#/k/${k.id}">${esc(k.name)}<small>${doneCount(k)}/${k.size}</small></a>`).join('')}
    <button class="kchip add" data-act="addclass" data-id="${task.id}">${ic('plus')}반 추가</button></div>
  <div class="prog3"><div class="bar3"><i class="ok" style="width:${pct(done)}"></i><i class="ai" style="width:${pct(n['AI 채점'])}"></i></div>
    <span><b>${done}</b>/${cls.size}명 처리${n['AI 채점'] ? ` · 확인 필요 <b>${n['AI 채점']}</b>` : ''} · 세특 <b>${nSet}</b></span></div>
  <div class="tools">
    ${n['채점 전'] ? `<button class="btn" data-act="batchgrade" data-id="${cls.id}" title="채점 전 학생을 AI 가 먼저 채점">${ic('bot')}AI 채점<b class="cnt">${n['채점 전']}</b></button>`
      : `<button class="btn" data-act="regrade" data-id="${cls.id}" title="이미 채점한 학생을 AI 로 다시 채점">${ic('bot')}AI 채점 다시</button>`}
    ${strictSeg(task)}
    ${canSet ? `<button class="btn" data-act="batchseteuk" data-id="${cls.id}" title="채점된 학생의 세특 초안 만들기">${ICON.wand}세특 만들기<b class="cnt">${canSet}</b></button>`
      : `<button class="btn" data-act="reseteuk" data-id="${cls.id}" title="이미 쓴 세특을 다시 쓰기">${ICON.wand}세특 다시 쓰기</button>`}
    <span class="sp"></span>
    ${!cls.masks.length ? `<a class="warnchip" href="#/k/${cls.id}/pages" title="AI 로 보내기 전에 학번·이름 칸을 가리세요">${ic('eye')}이름 가리기 필요</a>` : ''}
    <details class="menu"><summary class="btn" title="더 보기">${ic('more')}</summary><div class="mlist">
      <div class="mcap">답안</div>
      <a href="#/k/${cls.id}/pages">${ICON.img}답안 나누기 · 이름 가리기</a>
      ${n['채점 전'] ? `<button data-act="regrade" data-id="${cls.id}">${ic('bot')}이미 채점한 학생 다시 채점…</button>` : ''}
      ${canSet ? `<button data-act="reseteuk" data-id="${cls.id}">${ICON.wand}이미 쓴 세특 다시 쓰기…</button>` : ''}
      <div class="mcap">내보내기</div>
      <button data-act="copyall" data-id="${cls.id}">${ic('copy')}세특 모두 복사</button>
      <button data-act="xlsx" data-id="${cls.id}">${ic('down')}엑셀로 내보내기</button>
      <div class="mcap">반</div>
      <button data-act="renameclass" data-id="${cls.id}">${ic('pen')}반 이름 바꾸기</button>
      <button class="danger" data-act="delclass" data-id="${cls.id}">${ic('trash')}반 지우기</button></div></details>
  </div>
  <div class="tabs">${STATUS.map(([v, l]) => `<button class="tab ${F.status === v ? 'on' : ''}" data-act="fstatus" data-v="${esc(v)}">${TABL[v] || l}<b>${n[v]}</b></button>`).join('')}
    <span class="sp"></span>
    <select class="mini" data-act-change="fsort" title="순서"><option value="no" ${F.sort === 'no' ? 'selected' : ''}>번호순</option><option value="score" ${F.sort === 'score' ? 'selected' : ''}>점수순</option><option value="ai" ${F.sort === 'ai' ? 'selected' : ''}>AI 점수순</option></select></div>
  ${F.q ? `<div class="stat">'${esc(F.q)}' 찾는 중 · ${nos.length}명 <button class="btn sm ghost" data-act="fclear">풀기</button></div>` : ''}
  <div class="list">${rows || '<div class="empty">해당 학생이 없어요.</div>'}</div></div>
  <aside class="kpeek" id="kpeek" data-kid="${cls.id}" data-first="${nextTodo || nos[0] || ''}"></aside></div>`;
}
// 오른쪽 학생 미리보기: 점수 · 문항별 판단 · 세특 전체(목록에서 마우스를 올린 학생)
function peekHTML(task, cls, no) {
  const s = cls.students[no] || {}, st = statusOf(cls, no), sc = scoreOf(task, s), ai = aiScoreOf(task, s);
  const key = s.ai ? keyFor(task, cls, no) : null;
  const crit = task.criteria.map((c, i) => {
    const a = s.ai && s.ai.criteria.find(x => x.index === i + 1); if (!a && !s.touched) return '';
    const ok = finalMet(task, s, i), ch = a && s.touched && ok !== !!a.met;
    const q = key && key.crit && key.crit[i] ? key.crit[i].qnos : '';
    return `<li class="${ok ? 'y' : 'n'}"><span class="m">${ok ? '✓' : '✗'}</span><span class="t">${esc(c.text)}${q ? ` <small>문항 ${esc(q)}</small>` : ''}${ch ? ' <small class="tch">선생님</small>' : ''}</span></li>`;
  }).join('');
  const b = s.seteuk ? App.bytes(s.seteuk) : 0, set = App.settings();
  const none = !s.seteuk && s.ai ? noSeteukBasis(task, s) : '';
  return `<div class="pk-h"><b>${no}번</b>${pillOf(st)}${s.form != null && s.form !== formOf(cls) ? `<span class="pill ai">${esc(s.form || '형 없음')}형</span>` : ''}<span class="sp"></span>
      <span class="pk-sc">${sc == null ? '-' : sc}<small>/${task.maxScore}</small>${ai != null && ai !== sc ? `<small class="faint"> AI ${ai}</small>` : ''}</span></div>
    ${crit ? `<div class="pk-sec">채점 기준</div><ul class="pk-crit">${crit}</ul>` : `<p class="small muted">${subOf(cls, no) ? '아직 채점하지 않았어요.' : '답안이 없어요.'}</p>`}
    <div class="pk-sec">세특 ${s.seteuk ? `<span class="bt ${b > rangeFor(task)[1] ? 'bad' : ''}">${b}B</span>` : ''}${s.seteukStale ? ' <span class="pill ai">판단이 바뀜 · 다시 쓰기</span>' : ''}<span class="sp"></span>${s.seteuk ? `<button class="ibtn" data-act="copyset" data-kid="${cls.id}" data-no="${no}" title="세특 복사">${ic('copy')}</button>` : ''}</div>
    <div class="pk-set">${s.seteuk ? esc(s.seteuk) : `<span class="faint">${esc(none || '아직 세특이 없어요.')}</span>`}</div>
    ${s.feedback ? `<div class="pk-sec">학생 피드백</div><div class="pk-fb">${esc(s.feedback)}</div>` : ''}
    <a class="btn primary wide" href="#/g/${cls.id}/${no}" style="margin-top:14px">${ic('play')}${no}번 채점 화면 열기</a>`;
}
function fillPeek(no) {
  const el = document.getElementById('kpeek'); if (!el || getComputedStyle(el).display === 'none') return;
  const { task, cls } = findClass(el.dataset.kid); if (!cls) return;
  no = Number(no || el.dataset.no || el.dataset.first); if (!no) { el.innerHTML = ''; return; }
  if (el.dataset.no === String(no) && el.innerHTML) return;
  el.dataset.no = no; el.innerHTML = peekHTML(task, cls, no);
  $$('.list .item.stu').forEach(r => r.classList.toggle('peek', Number(r.dataset.no) === no));
}
document.addEventListener('mouseover', e => { const r = e.target.closest && e.target.closest('.kcols .item.stu'); if (r) fillPeek(r.dataset.no); });
document.addEventListener('focusin', e => { const r = e.target.closest && e.target.closest('.kcols .item.stu'); if (r) fillPeek(r.dataset.no); });
window.addEventListener('resize', () => fillPeek());

function firstTodo(cls) {
  for (let i = 1; i <= cls.size; i++) { const st = statusOf(cls, i); if (st === '채점 전' || st === 'AI 채점') return i; }
  return null;
}

/* ================= 채점 화면 ================= */
const G = { page: 0, zoom: 1, rot: 0, tab: 'img', showMask: false, why: (() => { try { return localStorage.getItem('aigrader-why') !== '0'; } catch (e) { return true; } })(), aiOpen: false, openQ: null, addMark: null, navIds: null, navKid: '' };
// 이전/다음 학생: 반 화면에서 보던 목록(상태 거르기·정렬) 순서. 지금 학생이 목록에서 빠졌어도 그 자리에서 이어 간다
function navStep(task, cls, no, d) {
  const ids = G.navKid === cls.id && G.navIds ? G.navIds : listNos(task, cls);
  const i = ids.indexOf(no);
  if (i >= 0) return ids[i + d] || null;
  if (d > 0) return ids.find(x => x > no) || null;
  return [...ids].reverse().find(x => x < no) || null;
}
let gctx = null;
/* ---- 문항 표시(○ △ ✕): AI 가 문항 번호 자리와 짧은 이유를 주고, 선생님이 고치고·옮기고·더한다 ---- */
const QM = { O: '○', '△': '△', X: '✕' };
function normMark(m) { m = String(m || '').trim().toUpperCase(); if (/^(O|○|0|맞)/.test(m)) return 'O'; if (/^(△|▲|부분)/.test(m)) return '△'; return 'X'; }
function qmarksFrom(r) {
  const n01 = v => (v === '' || v == null || isNaN(v)) ? null : Math.min(1, Math.max(0, Number(v) / 1000));
  return (r.questions || []).map(q => ({ no: String(q.no || '').replace(/[.번\s]/g, ''), mark: normMark(q.mark), reason: String(q.reason || ''),
    page: Math.max(0, (Number(q.page) || 1) - 1), x: n01(q.x), y: n01(q.y) }));
}
function qmarkSvg(m) {
  if (m === 'O') return '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/></svg>';
  if (m === '△') return '<svg viewBox="0 0 40 40"><path d="M20 4.5L36.5 34H3.5z"/></svg>';
  return '<svg viewBox="0 0 40 40"><path d="M7 7L33 33M33 7L7 33"/></svg>';
}
function qstripHTML(s) {
  const qs = s.qmarks || []; if (!qs.length) return '';
  return `<div class="qstrip">${qs.map((q, i) => `<button class="qchip q${q.mark === '△' ? 'T' : q.mark}" data-act="qopen" data-i="${i}" title="${q.x == null ? '눌러서 답안지에 자리 정하기' : '눌러서 보기·고치기'}"><b>${esc(q.no)}</b><span class="qm">${QM[q.mark]}</span><span class="qr">${esc(q.reason) || '<i>이유 없음</i>'}</span></button>`).join('')}</div>`;
}
function bindQMarks(s) {
  const wrap = $('#vwrap'); if (!wrap) return;
  $$('.qmk,.qpop', wrap).forEach(e => e.remove());
  wrap.classList.toggle('placing', G.addMark != null);
  // 자리 정하기·더하기: 답안지를 누른 곳에 표시를 둔다
  wrap.onclick = e => {
    if (G.addMark == null || e.target.closest('.qmk,.qpop')) return;
    const r = wrap.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    s.qmarks = s.qmarks || [];
    let i = G.addMark;
    if (i === -1) { const nos = s.qmarks.map(q => parseInt(q.no) || 0); s.qmarks.push({ no: String((Math.max(0, ...nos) || 0) + 1), mark: 'X', reason: '', page: G.page, x, y }); i = s.qmarks.length - 1; }
    else Object.assign(s.qmarks[i], { page: G.page, x, y });
    s.qmarksEdited = true; G.addMark = null; G.openQ = i; save(); rerender();
  };
  if (G.rot) return; // 돌려 볼 때는 자리가 맞지 않아 표시를 숨김(위쪽 문항 줄로 보기)
  (s.qmarks || []).forEach((q, i) => {
    if (q.page !== G.page || q.x == null || q.y == null) return;
    const d = document.createElement('button'); d.className = 'qmk q' + (q.mark === '△' ? 'T' : q.mark);
    Object.assign(d.style, { left: q.x * 100 + '%', top: q.y * 100 + '%' });
    d.innerHTML = qmarkSvg(q.mark); d.title = `${q.no}번 ${q.reason}`;
    // 짧게 누르면 열기, 끌면 옮기기
    d.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId);
      const r = wrap.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; let moved = false;
      d.onpointermove = ev => {
        if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; moved = true;
        Object.assign(d.style, { left: Math.min(100, Math.max(0, (ev.clientX - r.left) / r.width * 100)) + '%', top: Math.min(100, Math.max(0, (ev.clientY - r.top) / r.height * 100)) + '%' });
      };
      d.onpointerup = ev => {
        d.onpointermove = d.onpointerup = null;
        if (moved) { q.x = parseFloat(d.style.left) / 100; q.y = parseFloat(d.style.top) / 100; s.qmarksEdited = true; save(); }
        else { G.openQ = G.openQ === i ? null : i; bindQMarks(s); }
      };
    };
    d.onclick = e => e.stopPropagation();
    wrap.appendChild(d);
  });
  if (G.openQ != null && s.qmarks && s.qmarks[G.openQ] && s.qmarks[G.openQ].page === G.page && s.qmarks[G.openQ].x != null) openQPop(s, G.openQ);
}
function openQPop(s, i) {
  const wrap = $('#vwrap'); const q = s.qmarks[i];
  const p = document.createElement('div'); p.className = 'qpop';
  Object.assign(p.style, { left: Math.min(q.x * 100, 70) + '%', top: q.y * 100 + '%' });
  p.innerHTML = `<div class="row" style="gap:6px;flex-wrap:nowrap"><input class="in qno" value="${esc(q.no)}" title="문항 번호"><span class="small">번</span>
      <span class="seg sm">${['O', '△', 'X'].map(m => `<button data-m="${m}" class="${q.mark === m ? 'on' : ''}">${QM[m]}</button>`).join('')}</span><span class="sp"></span>
      <button class="ibtn" data-q="del" title="표시 지우기">${ic('trash')}</button><button class="ibtn" data-q="close" title="닫기">✕</button></div>
    <textarea class="in" rows="2" placeholder="이유 (예: 답안 미기재)">${esc(q.reason)}</textarea>`;
  const touch = () => { s.qmarksEdited = true; save(); };
  p.onclick = e => e.stopPropagation();
  p.onpointerdown = e => e.stopPropagation();
  $('.qno', p).oninput = e => { q.no = e.target.value.trim(); touch(); };
  $('textarea', p).oninput = e => { q.reason = e.target.value; touch(); };
  $$('[data-m]', p).forEach(b => b.onclick = () => { q.mark = b.dataset.m; touch(); G.openQ = i; rerender(); });
  $('[data-q="del"]', p).onclick = () => { s.qmarks.splice(i, 1); touch(); G.openQ = null; rerender(); };
  $('[data-q="close"]', p).onclick = () => { G.openQ = null; rerender(); };
  wrap.appendChild(p);
  setTimeout(() => { p.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const t = $('textarea', p); if (t && !q.reason) t.focus(); }, 30);
}
function vGrade(kid, no) {
  const { course, task, cls } = findClass(kid); if (!cls) return '<div class="card empty">반을 찾을 수 없습니다.</div>';
  task._subject = course.name;
  const stF = F.status ? ` · ${F.status}만` : '';
  scope([[course.name, '#/c/' + course.id], [task.name, '#/t/' + task.id], [cls.name + stF, '#/k/' + cls.id], [no + '번']]);
  if (!gctx || gctx.kid !== kid || gctx.no !== no) { G.page = 0; G.rot = 0; G.openQ = null; G.addMark = null; }
  try { localStorage.setItem('aigrader-last', JSON.stringify({ kid, no })); } catch (e) {}
  const prevNo = navStep(task, cls, no, -1), nextNo = navStep(task, cls, no, 1);
  gctx = { kid, no, task, cls };
  const s = stu(cls, no); const sub = subOf(cls, no); const st = statusOf(cls, no);
  const done = Array.from({ length: cls.size }, (_, i) => i + 1).filter(i => { const x = statusOf(cls, i); return x === '채점 완료' || x === '미응시' || x === '미제출'; }).length;
  const opts = Array.from({ length: cls.size }, (_, i) => i + 1).map(i => `<option value="${i}" ${i === no ? 'selected' : ''}>${i}번 (${statusOf(cls, i)})</option>`).join('');
  const sc = scoreOf(task, s), aisc = aiScoreOf(task, s);
  const rng = rangeFor(task);

  // 왼쪽: 제출물
  let left;
  if (!sub) left = `<div class="vpage"><div class="tr">${st === '미응시' ? '미응시로 표시된 학생입니다.' : '이 번호에 배정된 답안이 없습니다. <a href="#/k/' + cls.id + '/pages">답안 나누기</a>에서 확인하세요.'}</div></div>`;
  else if (G.tab === 'key') {
    const k = keyFor(task, cls, no);
    const TYL = { student: '학생 조건에 따라', open: '열린 답' };
    const stuAns = q => ((s.ai && s.ai.answers) || []).filter(a => AI.sameQ(a.no, q)).map(a => a.text).join(' / ');
    left = `<div class="vpage"><div class="tr gkey">
      ${k ? `<div class="gk-h"><b>${stuForm(cls, no) ? esc(stuForm(cls, no)) + '형 ' : ''}정답표</b>${k.checked ? '' : ' <span class="pill ai">확인 전</span>'}<span class="sp"></span>
        <button class="btn sm" data-act="keyview" data-id="${cls.id}" ${stuForm(cls, no) !== formOf(cls) ? `data-f="${esc(stuForm(cls, no))}"` : ''}>${ic('pen')}고치기</button></div>
        ${task.question ? `<div class="gk-memo"><b>채점 방향 메모</b> ${esc(task.question)}</div>` : ''}
        ${(k.answers || []).map(a => `<div class="gk-r ${G.keyQ && AI.sameQ(a.no, G.keyQ) ? 'on' : ''}" data-gq="${esc(a.no)}">
          <div class="gk-no">${esc(a.no)}</div>
          <div class="gk-b">${a.q ? `<div class="gk-q">${esc(a.q)}</div>` : ''}
            <div class="gk-a"><span class="lb">정답</span>${esc(a.answer || '')}</div>
            ${a.type && a.type !== 'fixed' ? `<div class="gk-a rule"><span class="lb">${esc(TYL[a.type] || '')}</span>${esc(a.rule || '')}</div>` : ''}
            ${stuAns(a.no) ? `<div class="gk-a stu"><span class="lb">학생 답</span>${esc(stuAns(a.no))}</div>` : ''}</div></div>`).join('')}`
        : `<span class="muted">아직 정답표가 없어요. AI 채점을 하면 만들어져요.</span>`}</div></div>`;
  }
  else if (G.tab === 'txt') left = qstripHTML(s) + (s.ai && s.ai.answers ? `<div class="vpage"><div class="tr ansbox">
      <div class="small muted" style="margin-bottom:8px">AI 가 읽은 학생 답이에요. 잘못 읽은 곳을 고치고 <b>다시 판단</b>을 누르세요(그림은 다시 보내지 않아요).</div>
      ${s.ai.answers.map((a, i) => `<div class="ar"><b>${esc(a.no)}</b><textarea class="in ansin" data-ai="${i}" rows="2">${esc(a.text)}</textarea></div>`).join('')}
      <button class="btn primary" data-act="rejudge" style="margin-top:8px">${ic('bot')}고친 답으로 다시 판단</button></div></div>`
      : `<div class="vpage"><div class="tr">${s.ai && s.ai.transcript ? esc(s.ai.transcript) : '<span class="muted">AI 채점을 하면 답안을 글로 옮겨 보여 줘요.</span>'}</div></div>`);
  else {
    G.page = Math.min(G.page, sub.pages.length - 1);
    left = qstripHTML(s) + `<div class="vbar">
        <button data-act="pg" data-d="-1">‹</button>${sub.pages.map((_, j) => `<button class="${j === G.page ? 'on' : ''}" data-act="pgset" data-i="${j}">${j + 1}</button>`).join('')}<button data-act="pg" data-d="1">›</button>
        <span style="opacity:.4">|</span><button data-act="rot" title="돌리기">⟳</button>
        <button data-act="zoom" data-d="0" title="화면에 맞춤">${Math.round(G.zoom * 100)}%</button><button data-act="zoom" data-d="0.15" title="크게">＋</button><button data-act="zoom" data-d="-0.15" title="작게">－</button>
        <span style="opacity:.4">|</span><button data-act="qadd" class="${G.addMark != null ? 'on' : ''}" title="문항 표시 더하기 — 누른 뒤 답안지에서 자리를 누르세요">${ic('plus')}표시</button>
        <button data-act="maskview" class="${G.showMask ? 'on' : ''}" title="AI 로 보내는 모습(이름 가림)">${ic('eye')}</button>
      </div>
      <div class="vpage" id="vpage"><div style="position:relative;display:inline-block" id="vwrap"><img id="vimg" alt="" draggable="false" style="width:${G.zoom * 100}%;transform:rotate(${G.rot}deg)"></div></div>`;
  }

  // 오른쪽: 채점
  const n = task.criteria.length;
  const gkey = keyFor(task, cls, no);
  const kq = i => (gkey && gkey.crit[i] && gkey.crit[i].qnos) || '';
  const crit = task.criteria.map((c, i) => {
    const a = s.ai && s.ai.criteria.find(x => x.index === i + 1);
    const checked = s.touched ? !!s.checks[i] : false;
    const mine = s.creason && s.creason[i] != null;
    const why = G.why && (a || mine) ? `<div class="why">
        ${a && a.evidence ? `<q>${esc(a.evidence)}</q>` : ''}
        ${a && s.touched && finalMet(task, s, i) !== !!a.met && !mine ? `<div class="small" style="color:var(--accent);margin:2px 0 4px">선생님 판단(${finalMet(task, s, i) ? '충족' : '미충족'})이 최종이에요. 아래 AI 근거는 점수·세특에 쓰지 않아요.</div>` : ''}
        <textarea class="in whyin ${a && s.touched && finalMet(task, s, i) !== !!a.met && !mine ? 'dim' : ''}" data-wi="${i}" rows="2" placeholder="채점 근거">${esc(mine ? s.creason[i] : (a && a.reason) || '')}</textarea>
        ${mine && a && a.reason && s.creason[i] !== a.reason ? `<div class="aiorig"><span>AI: ${esc(a.reason)}</span><button class="lnk" data-act="whyreset" data-i="${i}">AI 것으로</button></div>` : ''}</div>` : '';
    return `<div class="citem"><label class="crow">
      ${task.mode === 'points' ? `<span class="cno">${i + 1}</span>` : `<input type="checkbox" data-act="chk" data-i="${i}" ${checked ? 'checked' : ''}>`}
      <span class="ct">${task.mode === 'points' ? '' : `<span class="cno">${i + 1}</span>`}${esc(c.text)}${kq(i) ? ` <span class="qtag" data-act="gotoq" data-q="${esc(kq(i))}" title="누르면 정답표에서 이 문항 보기 — "${esc(((gkey && gkey.answers) || []).filter(x => String(x.no).split(/[-(.\s]/)[0] === kq(i)).map(x => x.q).filter(Boolean).join(' / ') || '이 기준은 이 문항의 정답으로 판단해요')}">문항 ${esc(kq(i))}</span>` : ''}</span>
      <span class="row" style="gap:6px">${a && a.unsure ? `<span class="mark u" title="${esc(a.unsure)} — 직접 확인해 주세요">애매</span>` : ''}${a ? `<span class="mark ${a.met ? 'y' : 'n'}" title="AI 판단">${a.met ? 'AI ✓' : 'AI ✗'}</span>` : ''}${a && s.touched && finalMet(task, s, i) !== !!a.met ? `<span class="mark t" title="선생님 판단이 최종이에요(세특도 이 판단으로)">선생님 ${finalMet(task, s, i) ? '✓' : '✗'}</span>` : ''}
        ${task.mode === 'points' ? `<input class="ptinput" type="number" step="0.5" min="0" max="${c.points}" value="${s.touched ? (s.pts[i] || 0) : ''}" data-act="pt" data-i="${i}"><span class="faint small">/${c.points}</span>` : ''}</span>
    </label>${why}</div>`;
  }).join('');
  const chips = scoreChoices(task).map(v => `<button class="chip ${sc === v && s.special == null ? 'on' : ''}" data-act="setscore" data-v="${v}">${v}</button>`).join('');
  const specs = (task.specials || []).map(x => `<button class="chip gray ${s.special === x.score ? 'on' : ''}" data-act="special" data-v="${x.score}" title="${esc(x.label)}">${esc(x.label.length > 8 ? x.label.slice(0, 8) + '…' : x.label)} ${x.score}</button>`).join('');
  const b = App.bytes(s.seteuk);
  const bcls = !s.seteuk ? '' : b > rng[1] ? 'over' : b < rng[0] ? 'under' : 'ok';
  const warns = s.seteuk ? lint(s.seteuk) : [];

  after = async () => {
    if (sub && G.tab === 'img') {
      const p = cls.pages[sub.pages[G.page]];
      $('#vimg').src = await imgURL(p.id);
      bindQMarks(s);
      if (G.showMask) {
        const wrap = $('#vwrap');
        (cls.masks || []).filter(m => m.page === -1 || m.page === G.page).forEach(m => {
          const d = document.createElement('div');
          Object.assign(d.style, { position: 'absolute', background: '#000', left: m.x * 100 + '%', top: m.y * 100 + '%', width: m.w * 100 + '%', height: m.h * 100 + '%', transform: `rotate(${G.rot}deg)` });
          wrap.appendChild(d);
        });
      }
    }
    const fb = $('#tfb'); if (fb) fb.addEventListener('input', () => { s.feedback = fb.value; save(); });
    $$('.ansin').forEach(t => t.addEventListener('input', () => { const x = s.ai.answers[Number(t.dataset.ai)]; if (x) { x.text = t.value; s.ai.transcript = s.ai.answers.map(a => `${a.no}. ${a.text}`).join('\n'); save(); } }));
    $$('.whyin').forEach(t => t.addEventListener('input', () => { s.creason = s.creason || {}; s.creason[t.dataset.wi] = t.value; save(); }));
    const memo = $('#tmemo'); if (memo) {
      memo.addEventListener('input', () => { s.memo = memo.value; if (s.seteuk) s.seteukStale = true; save(); });
      memo.addEventListener('change', () => { if (s.seteuk && s.seteukStale && !$('.note.stale')) rerender(); });
    }
    const se = $('#tset'); if (se) se.addEventListener('input', () => { s.seteuk = se.value; save(); updBytes(se.value); });
    const ad = $('#aidet'); if (ad) ad.addEventListener('toggle', () => { G.aiOpen = ad.open; });
    $$('[data-act="pt"]').forEach(el => el.addEventListener('change', () => {
      if (!s.touched) { s.pts = Array(n).fill(0); s.checks = Array(n).fill(false); }
      s.pts[Number(el.dataset.i)] = Math.min(Number(el.max), Math.max(0, Number(el.value) || 0));
      s.touched = true; s.override = null; s.special = null; if (s.seteuk) s.seteukStale = true; save(); rerender();
    }));
    $('#stusel').addEventListener('change', e => location.hash = `#/g/${kid}/${e.target.value}`);
  };
  return `
  <div class="ghead">
    <a class="btn sm ghost" href="#/k/${cls.id}" title="목록 (Esc)">${ICON.back}목록</a>
    <select class="in" id="stusel">${opts}</select>
    <span class="small muted nowrap">${done}/${cls.size}명 처리</span>
    <span class="sp"></span>
    <button class="btn sm ghost" data-act="stu" data-d="-1" ${prevNo ? '' : 'disabled'} title="이전 학생 (←)">‹${prevNo ? ` ${prevNo}번` : ''}</button>
    <button class="btn sm ghost" data-act="stu" data-d="1" ${nextNo ? '' : 'disabled'} title="다음 학생 (→)">${nextNo ? `${nextNo}번 ` : ''}›</button>
    <button class="btn primary" data-act="finish" title="채점 완료 후 다음 (Ctrl+Enter)">${ICON.check}채점 완료</button>
  </div>
  <div class="gbody">
    <div class="viewer">
      <div class="vtabs"><button class="vtab ${G.tab === 'img' ? 'on' : ''}" data-act="vtab" data-t="img">원본</button>
        <button class="vtab ${G.tab === 'txt' ? 'on' : ''}" data-act="vtab" data-t="txt">AI 가 읽은 글</button>
        <button class="vtab ${G.tab === 'key' ? 'on' : ''}" data-act="vtab" data-t="key" title="이 학생 시험지 형의 정답표 (K)">정답표</button></div>
      ${left}
    </div>
    <div class="gside">
      <div class="gsec total">
        <div class="big"><b>${sc == null ? '-' : sc}</b><span>/ ${task.maxScore}점</span></div>
        ${aisc != null ? `<span class="pill ai">AI ${aisc}</span>` : ''}${s.done ? '<span class="pill ok">완료</span>' : ''}
        <span class="sp"></span>
        <span class="seg sm">${['', '미제출', '미응시'].map(v => `<button class="${(s.status || '') === v ? 'on' : ''}" data-act="status" data-v="${v}">${v || '제출'}</button>`).join('')}</span>
      </div>
      <div class="gsec">
        <div class="sec-h">채점 기준<span class="sp"></span>${s.ai ? `<button class="lnk" data-act="why">${G.why ? '근거 접기' : '근거 보기·고치기'}</button>` : ''}</div>
        ${crit || `<p class="muted">채점 기준이 없어요. <a href="#/t/${task.id}">넣기</a></p>`}
        <div class="row" style="margin-top:12px;gap:6px">${chips}${specs}</div>
        <div class="row" style="margin-top:10px;justify-content:flex-end;gap:6px">
          ${s.ai ? `<button class="btn sm" data-act="applyai">AI 점수 적용</button>` : ''}<button class="btn sm ghost" data-act="resetscore">초기화</button></div>
      </div>
      <div class="gsec">
        <div class="sform"><span class="small muted">시험지 형</span>
          <input class="in" list="formlist" data-sform="1" value="${esc(stuForm(cls, no))}" placeholder="없음" title="이 학생 시험지의 형. 바꾸면 그 형의 정답표로 다시 채점해요">
          <datalist id="formlist">${Object.keys(task.keys || {}).filter(Boolean).map(f => `<option value="${esc(f)}">`).join('')}</datalist>
          ${stuForm(cls, no) !== formOf(cls) ? `<span class="pill ai">반과 다른 형</span>` : ''}${s.formBy === 'teacher' ? '<span class="small faint">선생님이 고름</span>' : s.form != null && s.ai ? '<span class="small faint">AI 가 읽음</span>' : ''}
          ${s.formWarn ? `<div class="note" style="margin-top:6px">${esc(s.formWarn)}</div>` : ''}</div>
        ${s.ai ? `<div class="sec-h" style="margin-bottom:6px">${ic('bot')}AI 판단<span class="faint small" style="font-weight:400">${s.ai.strict ? esc(s.ai.strict) + ' · ' : ''}${new Date(s.ai.at).toLocaleDateString()}</span><span class="sp"></span>
            <button class="btn sm" data-act="aigrade" title="${s.done ? '채점 완료한 학생은 점수 그대로, AI 판단만 새로' : '새 AI 판단으로 체크를 바꿔요'}">${ICON.bot}다시 채점</button></div>
          <details class="aid" id="aidet" ${G.aiOpen ? 'open' : ''}><summary><span class="small muted">학생 피드백 보기</span></summary>
            ${s.ai.blank ? '<p class="note">백지 또는 답이 거의 없음</p>' : ''}${s.ai.unreadable ? '<p class="note">글씨가 흐리거나 잘림 — 원본 확인</p>' : ''}
            <div class="fb">${esc(s.ai.feedback || '')}</div>
</details>`
          : `<button class="btn primary wide" data-act="aigrade" ${sub ? '' : 'disabled'}>${ICON.wand}AI 채점</button>`}
      </div>
      <div class="gsec">
        <div class="sec-h">학생 피드백<span class="sp"></span>${s.ai && s.ai.feedback && s.feedback !== s.ai.feedback ? '<button class="lnk" data-act="copyfb">AI 피드백 쓰기</button>' : ''}</div>
        <textarea class="in" id="tfb" rows="2" placeholder="학생에게 돌려줄 말 (선택)">${esc(s.feedback)}</textarea>
      </div>
      <div class="gsec">
        <div class="sec-h">세특<span class="sp"></span><span class="bytes" id="bytes">${s.seteuk ? `<b class="${bcls}">${b}B</b>` : ''} / ${rng[0]}~${rng[1]}B</span>
          ${s.seteuk ? `<button class="ibtn" data-act="copyset" data-kid="${cls.id}" data-no="${no}" title="복사">${ic('copy')}</button>` : ''}</div>
        <textarea class="in memo" id="tmemo" rows="1" placeholder="관찰 메모 — 강조할 역량·관찰을 적으면 세특에 반드시 넣어요 (예: 이해력, 사고력)">${esc(s.memo)}</textarea>
        ${s.seteuk && s.seteukStale ? `<div class="note stale">판단이나 관찰 메모가 바뀌었어요. <button class="btn sm primary" data-act="mkseteuk">${ICON.wand}${s.memo ? '메모를 반영해' : '바뀐 판단으로'} 다시 쓰기</button></div>` : ''}
        <textarea class="in" id="tset" rows="5" placeholder="'세특 만들기'를 누르면 채점 결과로 초안을 씁니다">${esc(s.seteuk)}</textarea>
        ${s.seteuk && s.seteuk === s.seteukAI && s.seteukFrom && s.seteukFrom !== 'none' ? '<div class="small faint" style="margin-top:4px">채점하면서 함께 쓴 세특이에요. 고치면 다시 채점해도 선생님 글을 그대로 둬요.</div>' : ''}
        ${!s.seteuk && noSeteukBasis(task, s) ? `<div class="small" style="margin-top:4px;color:var(--ai)">${esc(noSeteukBasis(task, s))} 필요하면 관찰 메모를 적고 '세특 만들기'를 누르세요.</div>` : ''}
        <ul class="warns" id="warns">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        <button class="btn soft" data-act="mkseteuk" style="margin-top:8px">${ICON.wand}${s.seteuk ? '다시 만들기' : '세특 만들기'}</button>
      </div>
    </div>
  </div>`;
}
function updBytes(t) {
  const rng = rangeFor(gctx && gctx.task);
  const b = App.bytes(t);
  const cls = !t ? '' : b > rng[1] ? 'over' : b < rng[0] ? 'under' : 'ok';
  const el = $('#bytes'); if (el) el.innerHTML = `${t ? `<b class="${cls}">${b}B</b>` : ''} / ${rng[0]}~${rng[1]}B`;
  const w = $('#warns'); if (w) w.innerHTML = (t ? lint(t) : []).map(x => `<li>${esc(x)}</li>`).join('');
}

// 판단 기준·모범 답안: 채점 기준 항목마다 "무엇이 있으면 충족인지"와 문항별 정답 요지.
// 비어 있으면 첫 AI 채점 전에 저절로 만든다(이름 칸을 가린 뒤라 첫 답안지를 가린 채로 문항지로 쓴다)
const STRICT_NOTE = {
  '관대': '핵심 개념이 방향만 맞으면 용어가 서툴거나 이유가 짧아도 충족. 애매하면 충족.',
  '보통': '핵심 개념과 이유가 맞으면 충족, 핵심 이유가 빠지거나 틀리면 미충족.',
  '엄격': '요구한 요소가 모두 정확한 용어로 논리적으로 있어야 충족. 애매하면 미충족.',
};
function strictSeg(task) {
  const v = task.strict || '보통';
  return `<span class="seg" title="AI 채점 기준: ${esc(STRICT_NOTE[v])}">${['관대', '보통', '엄격'].map(x =>
    `<button class="${x === v ? 'on' : ''}" data-act="strict" data-id="${task.id}" data-v="${x}" title="${esc(STRICT_NOTE[x])}">${x}</button>`).join('')}</span>`;
}
// 학생 번호 고르기 창(다시 채점·다시 쓰기)
function pickModal(o) {
  const sel = o.sel;
  modal(`<h2>${esc(o.title)}</h2><p class="small muted" style="margin:0 0 10px">${esc(o.note)}</p>
    <div class="row" style="gap:6px;margin-bottom:8px">${o.quick.map((q, i) => `<button class="btn sm" data-q="${i}">${esc(q[0])}</button>`).join('')}<button class="btn sm" data-q="all">모두</button><button class="btn sm ghost" data-q="none">모두 해제</button></div>
    <div class="pick">${o.nos.map(no => { const t = o.tag(no); return `<button class="pk" data-no="${no}"><b>${no}</b>${t ? `<small>${esc(t)}</small>` : ''}</button>`; }).join('')}</div>
    ${o.extra || ''}
    <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="pkgo"></button></div>`);
  const paint = () => { $$('#mbox .pk').forEach(b => b.classList.toggle('on', sel.has(Number(b.dataset.no)))); const g = $('#pkgo'); g.innerHTML = `${o.go} · ${sel.size}명`; g.disabled = !sel.size; };
  $$('#mbox .pk').forEach(b => b.onclick = () => { const n = Number(b.dataset.no); sel.has(n) ? sel.delete(n) : sel.add(n); paint(); });
  $$('#mbox [data-q]').forEach(b => b.onclick = () => {
    const q = b.dataset.q; sel.clear();
    if (q === 'all') o.nos.forEach(n => sel.add(n)); else if (q !== 'none') o.nos.filter(o.quick[Number(q)][1]).forEach(n => sel.add(n));
    paint();
  });
  $('#pkgo').onclick = () => { const items = o.nos.filter(n => sel.has(n)); closeModal(true); if (items.length) o.run(items); };
  paint();
}
// ===== 정답표(시험지 형마다 하나): 문항별 정답 · 채점 기준 ↔ 문항 대응 · 판단 지침 =====
// 같은 수행평가라도 반마다 시험지 형(A형·C형…)이 다를 수 있다. 형이 같은 반끼리만 정답표를 함께 쓴다.
function hasGuide(task) { return !!Object.keys(task.keys || {}).length; }
const normForm = f => String(f || '').replace(/\s|형|\(|\)/g, '').toUpperCase();
function formOf(cls) { return normForm(cls && cls.form); }
function keyOf(task, cls) { return ensureMap(task, cls && cls.formChecked ? (task.keys || {})[formOf(cls)] || null : null); }
// 정답표의 큰 문항 번호(3-1, 3-2 → 3)를 나온 순서대로
function topNos(key) { const seen = []; ((key && key.answers) || []).forEach(a => { const t = String(a.no || '').split(/[-(.\s]/)[0]; if (t && !seen.includes(t)) seen.push(t); }); return seen; }
// 채점 기준 수와 시험지 문항 수가 같으면 순서대로 1번 기준 ↔ 1번 문항 …(내용으로 짐작하지 않음)
function orderMap(task, key) {
  const tops = topNos(key);
  if (!task.criteria.length || tops.length !== task.criteria.length) return false;
  const old = key.crit || [];
  const list = q => String(q || '').split(/[,\s]+/).map(x => x.split(/[-(.]/)[0]).filter(Boolean);
  const guideFor = q => { const ex = old.find(c => { const l = list(c.qnos); return l.length === 1 && l[0] === q; }) || old.find(c => list(c.qnos).includes(q)); return ex ? ex.guide || '' : ''; };
  key.crit = task.criteria.map((c, i) => ({ qnos: tops[i], guide: guideFor(tops[i]) }));
  key.map = 'order'; key.gmap = true; return true;
}
function ensureMap(task, k) { if (k && !k.map) { if (!orderMap(task, k)) k.map = 'ai'; save(); } return k; }
// 학생마다 시험지 형(AI 가 답을 읽을 때 함께 읽거나 선생님이 고름). 없으면 반의 형
function stuForm(cls, no) { const s = cls.students[no]; return s && s.form != null ? s.form : formOf(cls); }
function keyFor(task, cls, no) { const f = stuForm(cls, no); return ensureMap(task, (task.keys || {})[f]) || keyOf(task, cls); }
function keyFromAI(task, r, from, sample) {
  const k = {
    answers: (r.answers || []).map(a => ({ no: String(a.no || '').replace(/번/g, '').trim(), q: a.question || '', answer: a.answer || '', guide: a.guide || '' })),
    crit: task.criteria.map((c, i) => { const x = (r.criteria || []).find(y => Number(y.index) === i + 1) || {}; return { qnos: String(x.questions || '').replace(/번/g, '').trim(), guide: x.guide || '' }; }),
    checked: false, at: Date.now(), from, sample,
  };
  if (!orderMap(task, k)) k.map = 'ai';
  return k;
}
// 다른 형 학생을 처음 만나면 그 학생 답안지로 그 형 정답표를 한 번만 만든다(같은 형이 여럿이어도 한 번)
const KEYMAKING = {};
async function keyForForm(task, cls, no, f) {
  task.keys = task.keys || {};
  if (task.keys[f]) return task.keys[f];
  const k = task.id + '|' + f;
  if (!KEYMAKING[k]) KEYMAKING[k] = (async () => {
    const imgs = await aiImages(cls, subOf(cls, no));
    const r = await AI.makeKey(task, imgs);
    task.keys[f] = keyFromAI(task, r, `${cls.name} ${no}번`, { k: cls.id, no });
    save();
    toast(`${cls.name} ${no}번은 ${f ? f + '형' : '다른 시험지'}이라 그 정답표를 새로 만들었어요. 반 화면에서 확인해 주세요.`, 6000);
  })().finally(() => { delete KEYMAKING[k]; });
  await KEYMAKING[k];
  return task.keys[f];
}
// 형 표시가 없어도 문항 번호가 정답표와 많이 다르면 다른 시험지일 수 있다
function qMismatch(key, answers) {
  const top = n => String(n || '').split(/[-(.\s]/)[0];
  const ks = new Set((key.answers || []).map(a => top(a.no)).filter(Boolean)), rs = [...new Set(answers.map(a => top(a.no)).filter(Boolean))];
  if (ks.size < 2 || rs.length < 2) return false;
  return rs.filter(n => ks.has(n)).length / rs.length < 0.5;
}
function sampleSub(task, cls) { const k = cls && cls.subs.length ? cls : task.classes.find(x => x.subs.length); return k ? { k, sub: k.subs[0] } : null; }
async function makeKeyFor(task, cls, onPhase) {
  task.keys = task.keys || {};
  // 같은 형의 정답표가 이미 있으면 그대로 쓴다(반마다 새로 만들지 않음)
  if (cls.form && task.keys[formOf(cls)]) { cls.formChecked = true; save(); return task.keys[formOf(cls)]; }
  if (!cls.form && Object.keys(task.keys).length && cls.subs.length) {
    onPhase && onPhase('시험지 형 확인 중…(몇 초)');
    const p = cls.pages[cls.subs[0].pages[0]]; const b = p && await getImg(p.id);
    if (b) {
      const rects = (cls.masks || []).filter(m => m.page === -1 || m.page === 0);
      const f = normForm((await AI.detectForm(await Parse.maskedBase64(b, rects, 900))).form);
      if (task.keys[f]) { cls.form = f; cls.formChecked = true; save(); return task.keys[f]; }
      if (f) cls.form = f;
    }
    onPhase && onPhase('새 형이라 정답표를 만드는 중… (30초 안팎)');
  }
  const sm = sampleSub(task, cls);
  const imgs = sm ? await aiImages(sm.k, sm.sub) : [];
  const r = await AI.makeKey(task, imgs);
  if (!cls.form) cls.form = normForm(r.form);
  cls.formChecked = true;
  const f = formOf(cls);
  task.keys = task.keys || {};
  if (!task.keys[f]) {
    task.keys[f] = keyFromAI(task, r, cls.name, sm ? { k: sm.k.id, no: sm.sub.no } : null);
    onPhase && onPhase('학생 몇 명의 답을 비교해 문항 유형을 확인 중… (10초 안팎)');
    await classifyKey(task, task.keys[f], sm ? sm.k : cls).catch(e => { task.keys[f].typeErr = e.message; });
  }
  save(); return task.keys[f];
}
// 반에서 골고루 학생 4명(처음·1/3·2/3·끝)을 읽어 문항마다 정답 구조(고정/학생 조건에 따라/열린 답)를 정한다
// 정답이 하나인 문항인데 반 학생 여럿(3명 이상, 틀린 학생의 40% 이상)이 같은 '오답'을 쓰면 정답이 학생마다 다를 수 있다
function qSuspect(task, cls) {
  const flags = {}; let n = 0;
  const norm = t => String(t || '').replace(/\[조건:[^\]]*\]/g, '').normalize('NFKC').replace(/[\s.,·:;()]/g, '').toLowerCase();
  task.criteria.forEach((c, i) => {
    const wrong = {}; let w = 0, key = null;
    for (const [no, s] of Object.entries(cls.students)) {
      if (!s.ai || !s.ai.answers) continue;
      key = keyFor(task, cls, Number(no)); if (!key || key.map !== 'order') continue;
      const q = (key.crit[i] || {}).qnos; const ka = (key.answers || []).filter(a => String(a.no).split(/[-(.\s]/)[0] === q);
      if (!ka.length || ka.some(a => a.type && a.type !== 'fixed')) continue;
      if (finalMet(task, s, i)) continue;
      const t = s.ai.answers.filter(a => String(a.no).split(/[-(.\s]/)[0] === q).map(a => norm(a.text)).join('|');
      if (!t || /답없음/.test(t)) continue;
      w++; wrong[t] = (wrong[t] || 0) + 1;
    }
    const top = Math.max(0, ...Object.values(wrong));
    if (top >= 3 && top >= w * 0.4) { flags[(key && key.crit[i] || {}).qnos] = `${top}명이 같은 답을 썼는데 모두 틀림으로 판단됐어요`; n++; }
  });
  cls.qflags = flags; return n;
}
async function classifyKey(task, key, cls) {
  const subs = cls.subs.filter(x => !(cls.students[x.no] || {}).status);
  if (subs.length < 2) return;
  const idx = [...new Set([0, Math.floor(subs.length / 3), Math.floor(subs.length * 2 / 3), subs.length - 1])];
  const nos = (key.answers || []).map(a => ({ no: a.no, q: a.q || "" }));
  const samples = (await Promise.all(idx.map(async i => {
    const x = subs[i], s = cls.students[x.no];
    if (s && s.ai && s.ai.answers && s.ai.answers.length) return s.ai.answers; // 이미 읽은 학생은 다시 읽지 않음
    try { return ((await AI.read(await aiImages(cls, x), nos)).answers || []).map(a => ({ no: String(a.no || '').replace(/번/g, '').trim(), text: String(a.text || '') })); } catch (e) { return null; }
  }))).filter(Boolean);
  if (samples.length < 2) return;
  const r = await AI.classify(task, key, samples);
  (r.questions || []).forEach(q => {
    const a = (key.answers || []).find(x => x.no === String(q.no || '').replace(/번/g, '').trim()); if (!a) return;
    a.type = ['student', 'open'].includes(q.type) ? q.type : 'fixed'; a.rule = a.type === 'fixed' ? '' : (q.rule || ''); a.why = q.why || '';
  });
  key.typed = samples.length;
}
function needPrep(task, cls) { return !!task.criteria.length && !keyOf(task, cls); }
// AI 채점 전: 이 반의 시험지 형과 정답표가 없으면 만들고, 선생님이 아직 확인하지 않았으면 확인 창
function rotDone(cls, n) {
  rerender();
  if (n) toast(`${n}쪽을 돌렸어요.${cls.masks.length ? ' 이름 칸 가리기 위치를 다시 확인해 주세요.' : ''}`, 3000);
  else if (cls.masks.length) toast('이름 칸 가리기 위치를 다시 확인해 주세요.', 3000);
}
async function prepGrade(task, cls, then) {
  if (!keyOf(task, cls)) {
    if (jobFor('key:' + cls.id)) { toast('정답표를 만드는 중이에요. 다 되면 확인 창이 떠요.', 3000); return; }
    toast('오른쪽 아래에서 정답표를 만들어요. 그동안 다른 일을 해도 돼요.', 3500);
    keyJob(task, cls, then); return;
  }
  if (needOrient(cls)) { toast('오른쪽 아래에서 쪽 방향을 맞춘 뒤 채점을 시작해요.', 3000); if (await orientJob(cls)) prepGrade(task, cls, then); return; }
  const key = keyOf(task, cls);
  if (key && !key.checked) { keyModal(task, cls, then); return; }
  then();
}
// 정답표 확인·고치기: 왼쪽 시험지, 오른쪽 문항별 정답과 기준 ↔ 문항
function keyModal(task, cls, then, form) {
  const byForm = form != null;
  const key = byForm ? (task.keys || {})[form] : keyOf(task, cls);
  if (!key) { toast('아직 정답표가 없어요.'); return; }
  const smk = key.sample && findClass(key.sample.k).cls;
  const sm = smk && subOf(smk, key.sample.no) ? { k: smk, sub: subOf(smk, key.sample.no) } : sampleSub(task, cls);
  const pages = sm ? sm.sub.pages.map(pi => sm.k.pages[pi]) : [];
  const TY = { fixed: '정답 하나', student: '학생 조건에 따라', open: '열린 답' };
  const nonFixed = a => a.type && a.type !== 'fixed';
  const rowsFor = t => Math.min(8, Math.max(2, Math.ceil(String(t || '').length / 46) + (String(t || '').match(/\n/g) || []).length));
  const ansRow = (a, i) => `<div class="kr ${nonFixed(a) ? 'nf' : ''}">
    <div class="krh"><input class="in kno" data-kno="${i}" value="${esc(a.no)}" title="문항 이름(시험지 칸 이름)" placeholder="문항">
      <select class="in kty ${nonFixed(a) ? 'on' : ''}" title="이 문항의 정답 구조">${Object.entries(TY).map(([v, l]) => `<option value="${v}" ${(a.type || 'fixed') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <span class="sp"></span><button class="ibtn" data-kdel="${i}" title="이 문항 지우기">${ic('trash')}</button></div>
    ${a.q ? `<div class="kq">${esc(a.q)}</div>` : ''}
    <textarea class="in kans" rows="${rowsFor(a.answer)}" data-kans="${i}" placeholder="${nonFixed(a) ? '예시 답(한 학생 것)' : '정답'}">${esc(a.answer)}</textarea>
    <div class="krw ${nonFixed(a) ? '' : 'hide'}"><span class="krl">${a.type === 'open' ? '꼭 들어갈 요소' : '판단 규칙'}</span><input class="in krule" value="${esc(a.rule || '')}" placeholder="${a.type === 'open' ? '예) 근거 1가지 이상, 자기 의견' : '예) 학생이 적은 조건·관찰에서 결론을 올바르게 끌어냈는지'}"></div>
    ${a.why ? `<div class="kwhy">${esc(a.why)}</div>` : ''}</div>`;
  const others = task.classes.filter(k => k !== cls && k.formChecked && formOf(k) === formOf(cls)).map(k => k.name);
  const kf = byForm ? form : formOf(cls);
  modal(`<h2>정답표 확인 <span class="pill">${kf ? esc(kf) + '형' : '형 표시 없음'}</span></h2>
    <div class="mapwrap">
      <div class="mapsheet">${pages.length ? `<div class="row" style="gap:4px;margin-bottom:6px">${pages.map((_, j) => `<button class="chip ${j ? '' : 'on'}" data-pg="${j}">${j + 1}쪽</button>`).join('')}<span class="small muted" style="margin-left:6px">${esc(sm.k.name)} ${sm.sub.no}번 답안지</span>
        <span class="sp"></span><span class="kzoom"><button class="ibtn" id="kzo" title="작게">−</button><button class="btn sm ghost" id="kzf" title="폭에 맞추기">100%</button><button class="ibtn" id="kzi" title="크게">+</button></span></div>
        <div class="mapimg"><img id="mapimg" alt=""></div>` : '<p class="muted small">답안지가 없어요.</p>'}</div>
      <div class="mapright">
        <div class="row ${byForm ? 'hide' : ''}" style="gap:6px"><span class="small muted">시험지 형</span><input class="in" id="kform" value="${esc(formOf(cls))}" style="width:64px" placeholder="예: C"><span class="small faint">${others.length ? `같은 형: ${esc(others.join(', '))}` : '형이 같은 반은 이 정답표를 함께 써요'}</span></div>
        <div class="sec-h" style="margin:12px 0 6px">문항별 정답 <span class="faint small" style="font-weight:400">AI 가 시험지를 풀어 만든 것 — 틀린 곳을 고쳐 주세요</span><span class="sp"></span><button class="lnk" id="ktype" type="button" title="학생 4명의 답을 비교해 문항마다 정답 구조를 다시 정해요">${ic('bot')}유형 자동으로 정하기</button></div>
        <p class="small ${key.answers.some(a => a.type && a.type !== 'fixed') ? 'muted' : 'faint'}" style="margin:0 0 6px">${key.typed ? `학생 ${key.typed}명의 답을 비교해 문항 유형을 정했어요${key.answers.some(a => a.type && a.type !== 'fixed') ? ' — <b>학생 조건에 따라·열린 답</b> 문항은 정답 대신 규칙으로 판단해요. 맞는지 확인해 주세요.' : '. 모두 정답이 하나인 문항이에요.'}` : '문항마다 정답 구조를 고를 수 있어요(학생마다 조건이 달라 정답이 다르면 \'학생 조건에 따라\').'}</p>
        <div class="ktb" id="ktb">${key.answers.map(ansRow).join('')}</div><button class="btn sm ghost" id="kadd">+ 문항</button>
        <div class="sec-h" style="margin:14px 0 6px">채점 기준 ↔ 문항 <span class="sp"></span><button class="lnk" id="kord" type="button">문항 순서대로 1:1</button></div>
        <p class="small ${key.map === 'order' ? 'faint' : 'muted'}" style="margin:0 0 6px">${key.map === 'order' ? `기준 ${task.criteria.length}개 = 문항 ${topNos(key).length}개라 순서대로 맞췄어요. 판단은 각 문항의 정답으로 하고, 기준 문장은 참고예요.` : key.map === 'teacher' ? '선생님이 정한 대응이에요.' : `기준 ${task.criteria.length}개, 문항 ${topNos(key).length}개라 AI 가 내용으로 짐작했어요. 맞는지 확인해 주세요.`}</p>
        <div class="maptb">${task.criteria.map((c, i) => `<div class="mr"><span class="mi">${i + 1}</span><span class="mt">${esc(c.text)}</span>
          <label class="mq"><span class="small faint">문항</span><input class="in" data-mi="${i}" value="${esc((key.crit[i] || {}).qnos || '')}" placeholder="예: 3" title="${esc((key.crit[i] || {}).qnos || '')}"></label></div>`).join('')}</div>
      </div>
    </div>
    <div class="foot"><button class="btn" data-act="close">닫기</button>${then ? '<button class="btn" id="kskip">확인 없이 채점</button>' : ''}<button class="btn primary" id="kok">${ic('check')}${then ? '확인하고 채점' : '확인함'}</button></div>`, true);
  $('#mbox').classList.add('kbox');
  // 정답 칸은 글이 길어지면 저절로 늘어난다
  const grow = t => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 260) + 'px'; };
  $$('#mbox .kans').forEach(grow);
  $('#mbox').addEventListener('input', e => { if (e.target.matches('.kans')) grow(e.target); });
  const show = async j => { $$('#mbox [data-pg]').forEach(b => b.classList.toggle('on', Number(b.dataset.pg) === j)); const im = $('#mapimg'); if (im) im.src = await imgURL(pages[j].id); };
  if (pages.length) { $$('#mbox [data-pg]').forEach(b => b.onclick = () => show(Number(b.dataset.pg))); show(0); }
  // 시험지 크게 보기: + / − / 폭 맞춤, Ctrl+휠, 두 번 누르면 그 자리를 크게, 끌어서 옮기기
  const box = $('#mbox .mapimg'), im = $('#mapimg');
  if (box && im) {
    let z = 1;
    const setZ = (nz, cx, cy) => {
      nz = Math.max(1, Math.min(4, Math.round(nz * 100) / 100));
      const r = box.getBoundingClientRect(); const px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
      const fx = (box.scrollLeft + px) / (box.scrollWidth || 1), fy = (box.scrollTop + py) / (box.scrollHeight || 1);
      z = nz; im.style.width = (z * 100) + '%'; box.classList.toggle('zoomed', z > 1); $('#kzf').textContent = Math.round(z * 100) + '%';
      box.scrollLeft = fx * box.scrollWidth - px; box.scrollTop = fy * box.scrollHeight - py;
    };
    $('#kzi').onclick = () => setZ(z + 0.5); $('#kzo').onclick = () => setZ(z - 0.5); $('#kzf').onclick = () => setZ(1);
    box.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZ(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
    im.addEventListener('dblclick', e => setZ(z > 1 ? 1 : 2.2, e.clientX, e.clientY));
    let drag = null;
    box.addEventListener('mousedown', e => { if (z <= 1 || e.button) return; drag = { x: e.clientX, y: e.clientY, l: box.scrollLeft, t: box.scrollTop }; box.classList.add('drag'); e.preventDefault(); });
    window.addEventListener('mousemove', e => { if (!drag) return; box.scrollLeft = drag.l - (e.clientX - drag.x); box.scrollTop = drag.t - (e.clientY - drag.y); });
    window.addEventListener('mouseup', () => { drag = null; box.classList.remove('drag'); });
  }
  const collect = () => {
    const rows = $$('#ktb .kr').map(r => ({ no: $('.kno', r).value.replace(/번/g, '').trim(), answer: $('.kans', r).value.trim(), type: $('.kty', r) ? $('.kty', r).value : 'fixed', rule: $('.krule', r) ? $('.krule', r).value.trim() : '' })).filter(a => a.no || a.answer);
    key.answers = rows.map(a => Object.assign({ q: '' }, (key.answers.find(x => x.no === a.no) || {}), a));
    $$('#mbox [data-mi]').forEach(inp => { const i = Number(inp.dataset.mi); key.crit[i] = key.crit[i] || { qnos: '', guide: '' }; const v = inp.value.replace(/번/g, '').trim(); if (v !== key.crit[i].qnos) key.map = 'teacher'; key.crit[i].qnos = v; });
    const nf = normForm($('#kform').value);
    if (!byForm && nf !== formOf(cls)) {
      const of = formOf(cls); task.keys = task.keys || {};
      if (!task.keys[nf]) task.keys[nf] = key;
      cls.form = nf;
      if (!task.classes.some(k => k.formChecked && formOf(k) === of)) delete task.keys[of];
    }
    save();
  };
  $('#kord').onclick = () => {
    collect(); const tops = topNos(key);
    if (tops.length !== task.criteria.length) { toast(`문항 ${tops.length}개, 기준 ${task.criteria.length}개라 순서대로 맞출 수 없어요. 번호를 직접 적어 주세요.`, 4000); return; }
    $$('#mbox [data-mi]').forEach(inp => { inp.value = tops[Number(inp.dataset.mi)]; }); collect(); key.map = 'order'; save(); toast('순서대로 맞췄어요.');
  };
  $('#kadd').onclick = () => { $('#ktb').insertAdjacentHTML('beforeend', ansRow({ no: '', answer: '' }, $$('#ktb .kr').length)); };
  $('#ktype').onclick = async () => {
    const b = $('#ktype'); collect(); b.disabled = true; b.textContent = '학생 답 비교 중…';
    try { await classifyKey(task, key, sm ? sm.k : cls); save(); toast(`학생 ${key.typed || 0}명의 답을 비교해 유형을 정했어요.`); keyModal(task, cls, then, form); }
    catch (e) { toast('유형을 정하지 못했어요: ' + e.message, 4500); b.disabled = false; b.textContent = '유형 자동으로 정하기'; }
  };
  $('#ktb').onchange = e => { const t = e.target.closest('.kty'); if (!t) return; const r = t.closest('.kr'); const ru = $('.krule', r); ru.closest('.krw').classList.toggle('hide', t.value === 'fixed'); $('.krl', r).textContent = t.value === 'open' ? '꼭 들어갈 요소' : '판단 규칙'; t.classList.toggle('on', t.value !== 'fixed'); r.classList.toggle('nf', t.value !== 'fixed'); ru.placeholder = t.value === 'open' ? '꼭 들어갈 요소' : '판단 규칙: 학생이 적은 조건·관찰에서 결론을 어떻게 끌어내면 맞는지'; if (t.value !== 'fixed') ru.focus(); };
  $('#ktb').onclick = e => { const d = e.target.closest('[data-kdel]'); if (d) d.closest('.kr').remove(); };
  $('#kok').onclick = () => { collect(); (byForm ? key : (keyOf(task, cls) || key)).checked = true; save(); closeModal(true); if (then) then(); else { rerender(); toast('정답표를 확인했어요. 다음 AI 채점부터 적용돼요.'); } };
  if (then) $('#kskip').onclick = () => { collect(); closeModal(true); then(); };
}
// 근거 확인: 인용이 학생 답에 실제로 있는지(띄어쓰기·문장부호 무시, 두 글자 묶음 70% 이상)
function normTxt(t) { return String(t || '').normalize('NFKC').replace(/[\s.,·:;'"“”‘’()\[\]{}!?~…⋯\-]/g, '').toLowerCase(); }
function found(q, all) {
  const a = normTxt(all), b = normTxt(q); if (!b) return true; if (a.includes(b)) return true;
  const bg = x => { const o = new Set(); for (let i = 0; i < x.length - 1; i++) o.add(x.slice(i, i + 2)); return o; };
  const A = bg(a), B = bg(b); let hit = 0; B.forEach(x => { if (A.has(x)) hit++; });
  return B.size ? hit / B.size >= 0.7 : true;
}
// AI 채점 = 읽기(그림) → 판단(글, 두 번). 판단이 서로 다르거나 인용이 답안에 없으면 '애매'
async function runAIGrade(task, cls, no, signal) {
  const sub = subOf(cls, no); if (!sub) throw new Error('답안이 없습니다.');
  const s = stu(cls, no);
  // 그림 답을 '(그림 생략)'으로만 옮긴 학생은 다시 읽는다(그림을 말로 옮기도록 바뀜)
  const pic = s.ai && (s.ai.answers || []).some(x => /^\(그림(\s*생략)?\)\s*$/.test(String(x.text || '').trim()));
  if (cls._reuse && cls._reuse.has(no) && s.ai && s.ai.answers && s.ai.answers.length && !pic) {
    cls._reuse.delete(no);
    await judgeInto(task, cls, no, s.ai.answers, signal, { blank: s.ai.blank, unreadable: s.ai.unreadable }); await autoSeteuk(task, cls, no, signal); return;
  }
  const hint = keyFor(task, cls, no) || { answers: [] };
  const imgs = await aiImages(cls, sub);
  const qs = hint.answers.map(a => ({ no: a.no, q: a.q || '' }));
  const rd = await AI.read(imgs, qs, signal);
  let answers = (rd.answers || []).map(a => ({ no: String(a.no || '').replace(/번/g, '').trim(), text: String(a.text || '') }));
  // 정답표 문항 가운데 답이 하나도 안 붙은 것이 있으면 그 문항만 다시 찾는다(긴 활동지에서 칸을 건너뛰는 일 막기)
  const has = q => answers.some(a => AI.sameQ(a.no, q) && a.text.trim() && !/^\(답 없음\)$/.test(a.text.trim()));
  const miss = qs.filter(x => !has(x.no)).map(x => x.no);
  if (miss.length && !rd.blank && answers.length) {
    try {
      const r2 = await AI.read(imgs, qs, signal, { only: miss });
      (r2.answers || []).forEach(a => { const no = String(a.no || '').trim(), t = String(a.text || ''); if (miss.includes(no) && t.trim() && !/^\(답 없음\)$/.test(t.trim())) answers.push({ no, text: t }); });
    } catch (e) { if (e.name === 'AbortError') throw e; }
  }
  if (s.formBy !== 'teacher') {
    const rf = normForm(rd.form), base = keyOf(task, cls);
    s.form = rf && !(formOf(cls) === '' && base && !(task.keys || {})[rf] && !qMismatch(base, answers)) ? rf : formOf(cls);
  }
  const f = stuForm(cls, no);
  if (!(task.keys || {})[f]) await keyForForm(task, cls, no, f);
  const key = keyFor(task, cls, no);
  s.formWarn = key && f === formOf(cls) && qMismatch(key, answers) ? '문항 번호가 정답표와 많이 달라요 — 다른 시험지인지 확인해 주세요' : '';
  await judgeInto(task, cls, no, answers, signal, { blank: !!rd.blank, unreadable: !!rd.unreadable });
  await autoSeteuk(task, cls, no, signal);
}
// 세특 칸이 비었거나 AI 가 쓴 그대로면(선생님이 고치지 않았으면) 채점과 함께 세특도 쓴다
async function autoSeteuk(task, cls, no, signal) {
  const s = stu(cls, no);
  if (s.special != null || !s.ai) return;
  const mine = s.seteuk && s.seteuk !== s.seteukAI; // 선생님이 고친 세특은 건드리지 않음
  if (mine) return;
  const why = noSeteukBasis(task, s);
  if (why) { if (s.seteuk === s.seteukAI) { s.seteuk = ''; s.seteukAI = ''; } s.seteukFrom = 'none'; s.seteukStale = false; save(); return; }
  if (s.seteuk && s.seteukFrom === 'draft' && !s.seteukStale) return; // 초안이 이미 들어감
  try { await runSeteuk(task, cls, no, signal); } catch (e) { if (e.name === 'AbortError') throw e; }
}
async function judgeInto(task, cls, no, answers, signal, extra = {}) {
  const key = keyFor(task, cls, no) || { answers: [], crit: [] };
  const P = AI.plan();
  task._range = rangeFor(task);
  const [j1, j2] = await Promise.all([AI.judge(task, key, answers, signal, P.judge), P.judge2 ? AI.judge(task, key, answers, signal, Object.assign({ noDraft: true }, P.judge2)).catch(() => null) : null]);
  const all = answers.map(a => a.text).join(' ');
  const crit = (j1.criteria || []).map(c => {
    const idx = Number(c.index); const o = j2 && (j2.criteria || []).find(x => Number(x.index) === idx);
    const ev = c.evidence || '';
    const why = [];
    if (o && !!o.met !== !!c.met) why.push('두 번 판단이 달라요');
    if (ev && !found(ev, all)) why.push('인용한 근거가 답안에서 확인되지 않아요');
    return { index: idx, met: !!c.met, points: Number(c.points) || 0, evidence: ev, reason: c.reason || '', unsure: why.join(' · ') };
  });
  const s = stu(cls, no);
  const before = task.criteria.map((c, i) => finalMet(task, s, i)).join(); // 이전 최종 판단(손대지 않았으면 이전 AI 판단)
  s.ai = { transcript: answers.map(a => `${a.no}. ${a.text}`).join('\n'), answers, criteria: crit, feedback: j1.feedback || '', observation: j1.observation || '', obsQuotes: j1.obsQuotes || [], strengths: j1.strengths || '',
    blank: !!extra.blank, unreadable: !!extra.unreadable, at: Date.now(), model: AI.isMock() ? '모의' : P.judge.model, strict: task.strict || '보통', form: stuForm(cls, no) };
  if (!s.touched && s.special == null && s.override == null) applyAI(task, s);
  if (s.seteuk && before !== task.criteria.map((c, i) => finalMet(task, s, i)).join()) s.seteukStale = true;
  if ((!s.seteuk || (s.seteuk === s.seteukAI && s.seteukFrom === 'draft')) && !noSeteukBasis(task, s)) {
    let rng = rangeFor(task); if (levelOf(task, s) === '하') rng = [Math.min(Math.round(rng[1] * 0.4), rng[0]), rng[1]];
    const ok = draftOK(task, s, rng);
    if (ok) { s.seteuk = ok.text; s.seteukAI = ok.text; s.seteukFrom = 'draft'; s.seteukStale = false; }
  }
  if (!s.feedback && j1.feedback) s.feedback = j1.feedback;
  save();
}

// 학생이 답안에 실제로 쓴 글(답 없음·빈칸·그림 생략 빼고)의 길이
function writtenLen(s) {
  if (!s || !s.ai) return 0;
  return (s.ai.answers || []).map(a => String(a.text || '').replace(/\[조건:[^\]]*\]/g, '').replace(/\((답\s*없음|그림(\s*생략)?)\)|□/g, '').replace(/\s/g, '')).join('').length;
}
// 세특을 쓸 근거가 없는 학생(백지·거의 빈칸, 맞은 기준 없음)
function noSeteukBasis(task, s) {
  if (!s || !s.ai) return '';
  if (s.ai.blank || writtenLen(s) < 15) return '답안이 비어 있어 세특을 쓰지 않았어요.';
  if (!task.criteria.some((c, i) => finalMet(task, s, i))) return '맞은 기준이 없어 세특을 쓰지 않았어요.';
  return '';
}
// 선생님이 AI 판단을 바꾼 기준이 있는지
// 세특 길이: 과목에 정해 두었으면 그것, 아니면 설정값
function rangeFor(task) {
  const d = App.settings(); const c = task && task.id ? (findTask(task.id) || {}).course : null;
  return [Number(c && c.byteMin) || d.byteMin, Number(c && c.byteMax) || d.byteMax];
}
function teacherChanged(task, s) { return !!(s.ai && s.touched && task.criteria.some((c, i) => { const a = s.ai.criteria.find(x => x.index === i + 1); return a && !!a.met !== finalMet(task, s, i); })); }
// 채점 때 함께 쓴 세특 초안을 그대로 쓸 수 있는지(판단이 그대로이고, 분량·금지어·근거가 맞을 때)
function draftOK(task, s, rng) {
  const d = s.ai && String(s.ai.observation || '').replace(/\s+/g, ' ').trim();
  if (!d || teacherChanged(task, s) || s.special != null || s.override != null || s.memo) return null;
  if (s.feedback && s.feedback !== s.ai.feedback) return null; // 선생님이 고친 피드백이 있으면 새로 쓴다
  const b = App.bytes(d); if (b < rng[0] * 0.9 || b > rng[1] + 15) return null;
  if (lint(d, task).length) return null;
  if (!/에서는/.test(d.slice(0, 40))) return null;
  const all = s.ai.transcript || '';
  if ((s.ai.obsQuotes || []).some(q => q && !found(q, all))) return null;
  return { text: d, b };
}
async function runSeteuk(task, cls, no, signal) {
  const s = stu(cls, no);
  const why = noSeteukBasis(task, s);
  if (why && !s.memo) { s.seteuk = ''; s.seteukAI = ''; s.seteukFrom = 'none'; s.seteukStale = false; save(); return { text: '', b: 0, dist: 0, none: why }; }
  let rng = rangeFor(task);
  if (levelOf(task, s) === '하') rng = [Math.min(Math.round(rng[1] * 0.4), rng[0]), rng[1], 'low'];
  const ok = draftOK(task, s, rng);
  if (ok) { s.seteuk = ok.text; s.seteukAI = ok.text; s.seteukStale = false; s.seteukFrom = 'draft'; save(); return { text: ok.text, b: ok.b, dist: 0, draft: true }; }
  const info = seteukInfo(task, s, cls, no);
  const styles = Style.pick(task, 3);
  let best = null, prev = null, unsupported = [];
  const all = (s.ai && s.ai.transcript) || '';
  for (let k = 0; k < 3; k++) { if (k === 2 && !(best && best.b > rng[1])) break; // 세 번째는 너무 길 때만
    const r = await AI.seteuk(task, info, rng, prev, signal, styles, unsupported.length ? { unsupported } : {});
    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    const b = App.bytes(text);
    const dist = b > rng[1] ? b - rng[1] : b < rng[0] ? rng[0] - b : 0;
    // 문장마다 댄 근거 구절이 학생 답안에 실제로 있는지
    const quotes = (r.quotes || []).filter(Boolean);
    const src = (all + ' ' + (s.memo || '')).trim(); // 학생 답 + 교사 메모가 근거
    const bad = src ? quotes.filter(q => !/교사|메모/.test(q) && !found(q, src)) : (text ? [text] : []);
    if (text && !quotes.length && all) bad.push('(근거 구절 없음)');
    const score = dist + bad.length * 1000;
    if (!best || score < best.score) best = { text, b, dist, bad, score };
    if (bad.length) { unsupported = bad.map(q => '- ' + q); prev = { text, bytes: b }; continue; }
    if (dist <= Math.round(rng[1] * 0.1) && b <= rng[1] + 15) { best = { text, b, dist }; break; } // 거의 맞으면 다시 쓰지 않음(토큰 아끼기)
    if (!dist) break;
    prev = { text, bytes: b };
  }
  s.seteuk = best.text; s.seteukAI = best.text; s.seteukStale = false; s.seteukFrom = 'write'; save();
  return best;
}

/* ================= 한꺼번에 ================= */
// 한꺼번에 하는 일은 화면 오른쪽 아래 작은 판에서 뒤로 돌린다 — 그동안 다른 반·학생을 보고 채점해도 된다
const JOBS = [];
function jobFor(key) { return JOBS.find(j => j.key === key && !j.done); }
// 도는 중인 작업을 적어 두었다가, 창을 닫아 멈췄으면 다음에 열 때 '이어서 하기'를 보여 준다
const PEND = 'aigrader-jobs';
function pendGet() { try { return JSON.parse(localStorage.getItem(PEND) || '[]'); } catch (e) { return []; } }
function pendSet(a) { try { localStorage.setItem(PEND, JSON.stringify(a)); } catch (e) {} }
function pendAdd(j) { if (!j.kind) return; pendSet(pendGet().filter(x => x.key !== j.key).concat({ key: j.key, kind: j.kind, clsId: j.clsId, title: j.title, at: Date.now() })); }
function pendDel(key) { pendSet(pendGet().filter(x => x.key !== key)); }
function leftFor(p) {
  const { task, cls } = findClass(p.clsId); if (!cls) return 0;
  let n = 0;
  for (let no = 1; no <= cls.size; no++) {
    const st = statusOf(cls, no), s = cls.students[no];
    if (p.kind === 'grade' ? st === '채점 전' : (s && !s.seteuk && (st === '채점 완료' || st === 'AI 채점'))) n++;
  }
  return n;
}
function resumeJobs() {
  const list = pendGet().filter(p => findClass(p.clsId).cls && leftFor(p) > 0);
  pendSet(list);
  list.forEach(p => {
    if (JOBS.some(j => j.key === p.key)) return;
    JOBS.push({ id: uid(), key: p.key, title: p.title.replace(/ — \d+명$/, ''), resume: p, left: leftFor(p), done: true, ok: 0, fail: 0, log: [], total: 0 });
  });
  renderJobs();
}
function renderJobs() {
  let box = $('#jobs');
  if (!box) { box = document.createElement('div'); box.id = 'jobs'; document.body.appendChild(box); }
  box.innerHTML = JOBS.map(j => {
    if (j.resume) return `<div class="job resume">
      <div class="jh"><b>${esc(j.title)}</b><span class="sp"></span><button class="ibtn" data-act="jobclose" data-j="${j.id}" title="닫기">✕</button></div>
      <div class="jm">지난번에 창을 닫아 멈췄습니다 · 남은 ${j.left}명</div>
      <div class="row" style="gap:6px"><button class="btn sm primary" data-act="jobresume" data-j="${j.id}">이어서 하기</button>
        <a class="btn sm" href="#/k/${j.resume.clsId}">반 화면</a></div></div>`;
    const n = j.ok + j.fail, pct = j.total ? Math.round(n / j.total * 100) : 0;
    const head = j.done && j.doneMsg ? j.doneMsg : j.done ? (j.stopped ? '멈춤' : '끝') + ` — 성공 ${j.ok}, 실패 ${j.fail}`
      : j.phase || `${n}/${j.total}명 · 성공 ${j.ok}${j.fail ? ', 실패 ' + j.fail : ''}`;
    if (j.one) return `<div class="job${j.done ? ' done' : ''}">
      <div class="jh"><span class="spin${j.done ? ' hide' : ''}"></span><b>${esc(j.title)}</b><span class="sp"></span>${j.done ? `<button class="ibtn" data-act="jobclose" data-j="${j.id}" title="닫기">✕</button>` : ''}</div>
      <div class="jm">${esc(head)}${j.where && location.hash !== j.where ? ` · <a href="${j.where}">반 화면</a>` : ''}</div>
      ${j.done ? (j.onBtn ? `<div class="row" style="gap:6px;margin-top:6px"><button class="btn sm primary" data-act="jobbtn" data-j="${j.id}">${esc(j.btnLabel || '열기')}</button></div>` : '') : '<div class="prog indet"><i></i></div>'}</div>`;
    return `<div class="job${j.done ? ' done' : ''}">
      <div class="jh"><span class="spin${j.done ? ' hide' : ''}"></span><b>${esc(j.title)}</b><span class="sp"></span>
        <button class="ibtn" data-act="jobtoggle" data-j="${j.id}" title="기록 보기">${j.open ? '▾' : '▸'}</button>
        ${j.done ? `<button class="ibtn" data-act="jobclose" data-j="${j.id}" title="닫기">✕</button>`
          : `<button class="btn sm" data-act="jobstop" data-j="${j.id}">멈추기</button>`}</div>
      <div class="jm">${esc(head)}${j.where && location.hash !== j.where ? ` · <a href="${j.where}">반 화면</a>` : ''}</div>
      <div class="prog"><i style="width:${j.done ? 100 : pct}%"></i></div>
      ${j.open ? `<div class="jl">${j.log.slice(-40).map(esc).join('<br>') || '…'}</div>` : ''}</div>`;
  }).join('');
  const jl = box.querySelector('.jl'); if (jl) jl.scrollTop = jl.scrollHeight;
}
window.addEventListener('hashchange', () => setTimeout(renderJobs, 0));
// 보고 있는 화면이 그 반 목록이면 조용히 새로 그린다(입력 중이거나 창이 떠 있으면 건드리지 않음)
function softRefresh(clsId, no) {
  const a = document.activeElement;
  if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
  if (!$('#modal').classList.contains('hide')) return;
  const h = location.hash;
  if (h === '#/k/' + clsId || h === '' || h === '#/' || h.startsWith('#/t/') || h.startsWith('#/c/')) rerender();
  // 채점 화면: 지금 보고 있는 그 학생의 AI 결과가 막 들어왔을 때만
  else if (no != null && h === '#/g/' + clsId + '/' + no) rerender();
}
// 한 번에 끝나는 일(쪽 방향, 정답표 만들기)을 뒤에서. 화면은 막지 않는다
function bgJob(o) {
  const cur = jobFor(o.key); if (cur) return cur.promise;
  const j = { id: uid(), key: o.key, title: o.title, total: 0, ok: 0, fail: 0, log: [], done: false, open: false, where: o.where || '', phase: o.phase || '준비 중…', ctl: new AbortController(), one: true };
  JOBS.push(j); BUSY++; renderJobs();
  j.promise = (async () => {
    try { await o.run(j); }
    catch (e) { j.fail = 1; j.doneMsg = '못 했어요: ' + e.message; toast(`${o.title}: ${e.message}`, 5000); }
    finally {
      BUSY--; j.done = true; j.phase = ''; renderJobs();
      if (!j.fail && !j.onBtn) setTimeout(() => { const k = JOBS.indexOf(j); if (k >= 0) { JOBS.splice(k, 1); renderJobs(); } }, 15000);
    }
    return !j.fail;
  })();
  return j.promise;
}
const needOrient = cls => !cls.oriented && !(cls.masks || []).length && cls.pages.some(p => !p.oc && !p.skip) && !!(App.settings().apiKey || '').trim();
function orientJob(cls) {
  return bgJob({ key: 'orient:' + cls.id, title: `${cls.name} · 쪽 방향`, where: `#/k/${cls.id}/pages`, phase: '쪽 방향 확인 중…', run: async j => {
    const n = await autoOrient(cls, m => { j.phase = m; renderJobs(); });
    cls.oriented = true; save();
    j.doneMsg = n ? `${n}쪽을 바로 세웠어요` : '모두 바른 방향이에요';
    softRefresh(cls.id); if (location.hash === `#/k/${cls.id}/pages` && $('#modal').classList.contains('hide')) rerender();
    if (n) toast(`${cls.name}: ${n}쪽의 방향을 바로 세웠어요. 틀린 쪽은 ↻ 로 돌리세요.${cls.masks.length ? ' 이름 칸 가리기 위치도 확인해 주세요.' : ''}`, 4500);
  } });
}
// 시험지 형·정답표: 뒤에서 만들고, 다 되면 그 반을 보고 있으면 확인 창, 아니면 작업 칸의 '확인하기'
function keyJob(task, cls, then) {
  return bgJob({ key: 'key:' + cls.id, title: `${cls.name} · 정답표`, where: `#/k/${cls.id}`, phase: '시험지 형과 정답표 만드는 중… (30초 안팎)', run: async j => {
    const oj = jobFor('orient:' + cls.id);
    if (oj) { j.phase = '쪽 방향을 맞추는 중이라 기다려요…'; renderJobs(); await oj.promise; }
    else if (needOrient(cls)) { j.phase = '쪽 방향 확인 중…'; renderJobs(); await autoOrient(cls, m => { j.phase = m; renderJobs(); }).catch(() => 0); cls.oriented = true; }
    j.phase = '시험지 형과 정답표 만드는 중… (30초 안팎)'; renderJobs();
    const had = new Set(Object.keys(task.keys || {}));
    const t0 = Date.now(); const key = await makeKeyFor(task, cls, m => { j.phase = m; renderJobs(); });
    if (had.has(formOf(cls)) && key && key.checked) { // 이미 확인한 정답표를 다시 씀 → 바로 이어서
      j.doneMsg = `${formOf(cls) ? formOf(cls) + '형' : '같은 시험지'} 정답표를 그대로 써요`; toast(`${cls.name}: ${j.doneMsg}`, 3000);
      if (then) then(); return;
    }
    j.doneMsg = `${Math.round((Date.now() - t0) / 1000)}초 만에 만들었어요 — 확인해 주세요`;
    if (then !== false) {
      j.onBtn = () => { const k = JOBS.indexOf(j); if (k >= 0) JOBS.splice(k, 1); renderJobs(); keyModal(task, cls, then || (() => rerender())); };
      j.btnLabel = '정답표 확인';
      const here = location.hash.startsWith('#/k/' + cls.id) || location.hash.startsWith('#/g/' + cls.id + '/');
      if (here && $('#modal').classList.contains('hide')) j.onBtn();
      else toast(`${cls.name} 정답표를 만들었어요. 오른쪽 아래 '정답표 확인'을 눌러 주세요.`, 5000);
    }
  } });
}
async function runBatch(title, items, fn, opt = {}) {
  const j = { id: uid(), key: opt.key || title, title, total: items.length, ok: 0, fail: 0, log: [], done: false, stopped: false,
    open: false, ctl: new AbortController(), where: opt.where || '', phase: '' };
  j.kind = opt.kind; j.clsId = opt.clsId;
  JOBS.push(j); BUSY++; pendAdd(j); renderJobs();
  toast('오른쪽 아래에서 진행합니다. 그동안 다른 화면에서 일해도 됩니다.', 3000);
  try {
    if (opt.pre) { j.phase = opt.preMsg || '준비 중…'; renderJobs(); await opt.pre(j); j.phase = ''; renderJobs(); }
    let i = 0;
    const worker = async () => {
      while (i < items.length && !j.ctl.signal.aborted) {
        const it = items[i++];
        try { const m = await fn(it, j.ctl.signal); j.ok++; j.log.push(`${it}번 완료${m ? ' — ' + m : ''}`); }
        catch (e) { if (e.name === 'AbortError') break; j.fail++; j.log.push(`${it}번 실패: ${e.message}`); if (/키|한도|모델/.test(e.message)) j.ctl.abort(); }
        renderJobs(); if (opt.clsId) softRefresh(opt.clsId, it);
      }
    };
    await Promise.all([worker(), worker()]);
  } catch (e) { j.log.push('멈춤: ' + e.message); j.ctl.abort(); }
  BUSY--;
  j.done = true; j.stopped = j.ctl.signal.aborted; j.phase = ''; save(true); pendDel(j.key); renderJobs();
  if (opt.clsId) softRefresh(opt.clsId);
  toast(`${title}: ${j.stopped ? '멈춤' : '끝'} — 성공 ${j.ok}, 실패 ${j.fail}`, 4000);
  // 실패 없이 끝난 판은 1분 뒤 저절로 치운다
  if (!j.fail) setTimeout(() => { const k = JOBS.indexOf(j); if (k >= 0 && !j.open) { JOBS.splice(k, 1); renderJobs(); } }, 60000);
}

/* ================= 세특 모아보기 ================= */
function vSeteuk(cid, cname) {
  const c = findCourse(cid); if (!c) return '<div class="card empty">과목을 찾을 수 없습니다.</div>';
  crumb([[c.name, '#/c/' + c.id], [cname + ' 세특 모아보기']]);
  const pairs = c.tasks.map(t => ({ t, k: t.classes.find(k => k.name === cname) })).filter(x => x.k);
  const size = Math.max(...pairs.map(x => x.k.size));
  const rows = Array.from({ length: size }, (_, i) => i + 1).map(no => {
    const parts = pairs.map(x => (x.k.students[no] || {}).seteuk || '');
    const all = parts.filter(Boolean).join(' ');
    const b = App.bytes(all);
    return `<tr><td><b>${no}</b></td>${parts.map(p => `<td class="small">${esc(p) || '<span class="faint">-</span>'}</td>`).join('')}<td class="r"><span class="pill ${b > 1500 ? 'bad' : b ? 'ok' : ''}">${b}B</span></td></tr>`;
  }).join('');
  return `<div class="row between" style="margin-bottom:14px"><div><div class="title">${esc(cname)} · 세특 모아보기</div>
    <div class="sub">수행평가별 초안을 이어 붙인 길이를 함께 봅니다(과목 세특 한도 1,500B).</div></div>
    <button class="btn" data-act="xlsxall" data-id="${c.id}" data-n="${esc(cname)}">${ICON.down}엑셀로 내보내기</button></div>
    <div class="card scroll-x" style="padding:6px 10px"><table class="tb"><thead><tr><th>번호</th>${pairs.map(x => `<th>${esc(x.t.name)}</th>`).join('')}<th class="r">합계</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ================= 설정 ================= */
const KEY_URL = 'https://aistudio.google.com/apikey';
function cachedModels() { try { return JSON.parse(localStorage.getItem('aigrader-models') || '[]'); } catch (e) { return []; } }
function modelOptions(ids, cur) {
  const list = ids.length ? ids.map(AI.describe) : [AI.describe(cur)];
  if (!list.some(m => m.id === cur)) list.unshift(AI.describe(cur));
  const groups = {};
  list.forEach(m => { const g = m.latest ? '항상 최신(추천)' : m.ver ? `Gemini ${m.ver}` : '기타'; (groups[g] = groups[g] || []).push(m); });
  return Object.entries(groups).map(([g, ms]) => `<optgroup label="${esc(g)}">${ms.map(m => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.label)}  —  ${esc(m.id)}</option>`).join('')}</optgroup>`).join('');
}
function settingsModal() {
  const s = App.settings();
  modal(`<h2>설정</h2>
    <div class="sset">
      <h3>${ic('key')}AI</h3>
      <label class="f">Gemini API 키 <a href="${KEY_URL}" target="_blank" rel="noopener">무료 발급 ↗</a></label>
      <div class="row" style="flex-wrap:nowrap"><input class="in" id="skey" type="password" value="${esc(s.apiKey)}" placeholder="AIza…" autocomplete="off"><button class="btn sm" id="sshow">보기</button></div>
      <label class="f">채점 방식</label>
      <div class="row"><span class="seg" id="smode">${[['auto', '자동(무료 추천)'], ['accurate', '정확하게'], ['fast', '빠르게']].map(([m, l]) => `<button data-m="${m}" class="${(s.mode || 'auto') === m ? 'on' : ''}">${l}</button>`).join('')}</span></div>
      <p class="small muted" id="smodenote" style="margin:6px 0 0"></p>
      <label class="f">오늘 사용량 <button class="lnk" data-act="quotahelp">무료 한도 안내</button></label>
      <div id="susage">${usageHTML()}</div>
      <details style="margin-top:8px"><summary class="small muted" style="cursor:pointer">모델 직접 고르기 <span class="faint">— '빠르게'와 계획서 분석에 씀</span></summary>
        <div class="row" style="flex-wrap:nowrap;margin-top:6px"><select class="in" id="smodel">${modelOptions(cachedModels(), s.model)}</select><button class="btn sm" id="stest" title="키가 맞는지 보고 쓸 수 있는 모델을 새로 불러옵니다">확인</button></div>
        <p class="small muted" id="stestmsg" style="margin:6px 0 0"></p></details>
    </div>
    <div class="sset">
      <h3>${ICON.grad}세특</h3>
      <div class="row" style="gap:8px;align-items:center"><span class="small">길이</span><input class="in num" id="smin" type="number" value="${s.byteMin}"><span class="small">~</span><input class="in num" id="smax" type="number" value="${s.byteMax}"><span class="small muted">바이트(나이스 기준)</span></div>
      <label class="f">문체 본보기 <span class="faint">— 예전에 쓴 세특 엑셀로 문장 구조를 맞춤</span></label>
      <div class="row"><button class="btn sm" id="ssty">${ICON.up}엑셀 불러오기</button><span class="small muted" id="sstymsg"></span><button class="btn sm ghost" id="sstyclr">지우기</button></div>
      <input type="file" id="sstyfile" multiple accept=".xlsx,.xls,.csv" class="hide">
      <details id="sstyview" style="margin-top:6px"><summary class="small muted" style="cursor:pointer">본보기 보기</summary><div class="small" id="sstylist" style="max-height:160px;overflow:auto;margin-top:6px"></div></details>
    </div>
    <div class="sset">
      <h3>${ic('cloud')}저장</h3>
      ${typeof Sync !== 'undefined' && Sync.enabled() ? `<div class="row">${Sync.signedIn()
        ? `<span class="small">${ic('check')} <b>${esc(Sync.status().user)}</b> 드라이브에 저장 중</span><span class="sp"></span><button class="btn sm" data-act="gsyncnow">지금 맞추기</button><button class="btn sm ghost" data-act="glogout">로그아웃</button>`
        : `<button class="btn sm primary" data-act="glogin">${GICON}구글 로그인</button><span class="small muted">다른 컴퓨터에서도 이어서 하기</span>`}</div>` : ''}
      <div class="row" style="margin-top:10px"><button class="btn sm" data-act="backup">${ICON.down}백업 파일 저장</button><button class="btn sm" data-act="restore">${ICON.up}백업 불러오기</button></div>
      <p class="small faint" style="margin:10px 0 0">무료 키로 보낸 답안은 Google 이 서비스 개선에 쓸 수 있어요. 이름 칸 가리기를 꼭 하세요.</p>
    </div>
    <div class="foot"><button class="btn" data-act="close">닫기</button><button class="btn primary" id="ssave">저장</button></div>`);
  const MN = { auto: '무료 키에 맞춘 절충: 답 읽기·세특은 Flash-Lite(빠름), 기준 판단은 Flash(정확) · 채점 1명 약 8~10초, 세특 약 3~5초 · 무료 한도를 넘으면 저절로 다른 모델로', accurate: '모두 Flash, 판단은 깊게 생각하고 한 번 더 확인 · 1명 약 20~40초 · 무료 한도를 빨리 씀', fast: '아래에서 고른 모델 하나로 빠르게 · 1명 약 5초 · 애매한 판단이 늘 수 있어요' };
  const modeNote = () => { $('#smodenote').textContent = MN[$('#smode button.on').dataset.m]; };
  $$('#smode button').forEach(b => b.onclick = () => { $$('#smode button').forEach(x => x.classList.toggle('on', x === b)); modeNote(); });
  modeNote();
  const note = () => { const d = AI.describe($('#smodel').value); $('#stestmsg').innerHTML = d.note ? `${esc(d.label)}: ${esc(d.note)}` : ''; };
  note(); $('#smodel').onchange = note;
  $('#sshow').onclick = () => { const k = $('#skey'); k.type = k.type === 'password' ? 'text' : 'password'; };
  const test = async quiet => {
    const key = $('#skey').value.trim();
    if (!key) { if (!quiet) $('#stestmsg').textContent = '키를 먼저 넣어 주세요.'; return; }
    const tmp = App.settings(); tmp.apiKey = key; App.saveSettings(tmp);
    $('#stestmsg').textContent = '키 확인과 모델 목록을 불러오는 중…';
    try {
      const list = await AI.listModels();
      try { localStorage.setItem('aigrader-models', JSON.stringify(list.map(m => m.id))); } catch (e) {}
      const cur = $('#smodel').value;
      const keep = list.some(m => m.id === cur);
      const pick = keep ? cur : AI.recommend(list);
      $('#smodel').innerHTML = modelOptions(list.map(m => m.id), pick);
      const newest = list.find(m => !m.latest);
      $('#stestmsg').innerHTML = `<b style="color:var(--ok)">키가 맞습니다.</b> 쓸 수 있는 모델 ${list.length}개 · 가장 새 모델: ${esc(newest ? newest.label : '-')}` +
        (keep ? '' : `<br>추천 모델 <b>${esc(AI.describe(pick).label)}</b> 로 골랐습니다.`);
    } catch (e) { $('#stestmsg').innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
  };
  $('#stest').onclick = () => test(false);
  const styList = () => { const a = Style.get(); $('#sstymsg').textContent = a.length ? `본보기 ${a.length}개 저장됨` : '아직 없음';
    $('#sstylist').innerHTML = a.slice(0, 60).map(t => `<p style="margin:0 0 6px">${esc(t)}</p>`).join('') + (a.length > 60 ? `<p class="faint">… 외 ${a.length - 60}개</p>` : ''); };
  styList();
  $('#ssty').onclick = () => $('#sstyfile').click();
  $('#sstyfile').onchange = async e => {
    const fs = [...e.target.files]; if (!fs.length) return;
    $('#sstymsg').textContent = '읽는 중…';
    try {
      const r = await Style.fromFiles(fs);
      if (!r.segs.length) { $('#sstymsg').textContent = `세특 칸 ${r.cells}개에서 '…에서는'으로 시작하는 활동 문장을 찾지 못했습니다.`; return; }
      const merged = [...new Set(r.segs.concat(Style.get()))].slice(0, 400);
      if (!Style.set(merged)) { $('#sstymsg').textContent = '브라우저 저장 공간이 부족합니다.'; return; }
      styList(); $('#sstymsg').textContent = `세특 ${r.cells}칸에서 활동 문장 ${r.segs.length}개를 뽑았습니다 · 모두 ${merged.length}개`;
    } catch (err) { $('#sstymsg').textContent = '읽지 못했습니다: ' + err.message; }
    e.target.value = '';
  };
  $('#sstyclr').onclick = () => { if (Style.get().length && confirm('저장된 문체 본보기를 모두 지울까요?')) { localStorage.removeItem(Style.KEY); styList(); } };
  $('#skey').addEventListener('change', () => test(true));
  $('#ssave').onclick = () => {
    App.saveSettings({ apiKey: $('#skey').value.trim(), model: $('#smodel').value || 'gemini-flash-latest', byteMin: Number($('#smin').value) || 250, byteMax: Number($('#smax').value) || 300, mode: $('#smode button.on').dataset.m });
    closeModal(); rerender(); toast('저장했습니다.');
  };
}

// 오늘 쓴 양(모델별 요청 수·토큰)과 무료 한도 도달 여부
function usageHTML() {
  const u = AI.usageToday(); const rows = Object.entries(u.m);
  if (!rows.length) return '<p class="small muted" style="margin:0">오늘은 아직 쓰지 않았어요.</p>';
  return `<div class="usage">${rows.map(([k, x]) => `<div class="ur"><b>${esc(k)}</b><span>${x.n}회</span><span class="faint">${Math.round((x.tin + x.tout) / 1000)}천 토큰</span>${x.limit === 'day' ? '<span class="pill bad">오늘 한도 다 씀</span>' : x.limit === 'minute' ? '<span class="pill ai">분당 한도 — 잠깐 기다리는 중</span>' : '<span class="pill ok">여유</span>'}</div>`).join('')}</div>
    <p class="small faint" style="margin:6px 0 0">하루 한도는 <b>${resetText()}</b>에 다시 채워져요. 넘으면 다른 모델로 저절로 바꿔 이어 가요.</p>`;
}
// 다음 초기화 시각: '오늘 오후 5:00 (3시간 20분 뒤)'
function resetText() {
  const at = AI.resetAt(), left = Math.max(0, at - Date.now());
  const same = at.toDateString() === new Date().toDateString();
  const hm = at.toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
  const h = Math.floor(left / 3600000), m = Math.round(left % 3600000 / 60000);
  return `${same ? '오늘' : '내일'} ${hm}(${h ? h + '시간 ' : ''}${m}분 뒤)`;
}
// 무료 한도를 쉽게 풀어 쓴 안내
function quotaHelp(back) {
  const u = AI.usageToday(); const rows = Object.entries(u.m);
  const day = rows.filter(([, x]) => x.limit === 'day').map(([k]) => k);
  modal(`<h2>무료 한도 안내</h2>
    ${day.length ? `<div class="qh-now bad"><b>${esc(day.join('·'))}</b> 오늘 한도를 다 썼어요. <b>${resetText()}</b>에 다시 채워져요. 그 전까지는 다른 모델로 이어 가요.</div>`
      : `<div class="qh-now">지금은 여유가 있어요. 다음 초기화: <b>${resetText()}</b></div>`}
    <div class="qh">
      <div class="qhr"><b>한도는 두 가지</b><span><b>분당</b>: 1분에 보낼 수 있는 요청 수 — 넘으면 1분 안에 저절로 풀려요(앱이 기다렸다 이어 감).<br><b>하루</b>: 하루에 보낼 수 있는 요청 수 — 넘으면 다음 초기화 때까지 그 모델은 쉬어요.</span></div>
      <div class="qhr"><b>언제 다시 채워지나</b><span>하루 한도는 미국 태평양 시각 자정에 초기화돼요. 한국 시각으로 <b>오후 5시</b>(3~11월 초 서머타임 때는 <b>오후 4시</b>)예요.</span></div>
      <div class="qhr"><b>얼마나 쓰나</b><span>학생 1명 채점 = 요청 약 2번(답 읽기 1 + 판단 1), 세특 1명 = 1번. 계획서 읽기 = 1~2번.<br>무료 한도는 모델마다 하루 수백~천 번 안팎이라 보통 한 반(30명 안팎)은 넉넉해요.</span></div>
      <div class="qhr"><b>넘으면 어떻게</b><span>앱이 Flash ↔ Flash-Lite 로 저절로 바꿔 이어 가요. 둘 다 다 쓰면 초기화 뒤 남은 학생만 이어서 하면 돼요(한 결과는 저장돼 있어요).</span></div>
      <div class="qhr"><b>한도를 늘리려면</b><span>Google AI Studio 에서 결제(유료)를 등록하면 크게 늘어나요. 무료로 쓸 때는 필요 없어요.</span></div>
    </div>
    <p class="small faint" style="margin:10px 0 0">정확한 숫자는 Google 이 모델·계정마다 정하고 바꿀 수 있어요. <a href="https://aistudio.google.com/docs/rate-limits" target="_blank" rel="noopener">Google 원문 ↗</a></p>
    <div class="foot">${back ? '<button class="btn" data-act="settings">← 설정으로</button>' : ''}<button class="btn primary" data-act="close">알겠어요</button></div>`);
}
function renderQuota() {
  const b = $('#quota'); if (!b || typeof AI === 'undefined') return;
  const u = AI.usageToday(); const rows = Object.entries(u.m);
  const day = rows.filter(([, x]) => x.limit === 'day').map(([k]) => k), min = rows.filter(([, x]) => x.limit === 'minute' && Date.now() - x.limitAt < 70000).map(([k]) => k);
  const n = rows.reduce((t, [, x]) => t + x.n, 0);
  b.classList.toggle('hide', !n); b.classList.toggle('warn', !!(day.length || min.length));
  b.innerHTML = `${ic('bot')}<span class="lb">${day.length ? `${day.join('·')} 한도 다 씀` : min.length ? '분당 한도 대기' : `오늘 ${n}회`}</span>`;
  b.title = rows.map(([k, x]) => `${k}: ${x.n}회${x.limit === 'day' ? ' (오늘 한도 다 씀)' : ''}`).join('\n') + `\n초기화: ${resetText()}\n누르면 무료 한도 안내`;
  if (day.length) b.querySelector('.lb').textContent = `${day.join('·')} 한도 다 씀 · ${resetText().replace(/\(.*\)/, '')} 초기화`;
}

/* ================= 도움말 ================= */
const HELP = [
  ['start', '시작하기', `<ol class="hsteps">
    <li><b>⚙ 설정</b>에 API 키 넣기 <a href="${KEY_URL}" target="_blank" rel="noopener">무료 발급 ↗</a></li>
    <li><b>평가계획서</b> 올리기</li>
    <li><b>반 추가</b> → 답안 PDF</li>
    <li><b>이름 가리기</b> → <b>AI 채점</b></li>
    <li>확인 → <b>채점 완료</b> → 세특 복사</li></ol>`],
  ['grade', '채점·세특', `<ul>
    <li><b>채점 방향 메모</b> — AI 가 가장 먼저 따라요</li>
    <li><b>체크 바꾸기</b> — 점수·세특이 선생님 판단대로</li>
    <li><b>관찰 메모</b> — 적은 역량은 세특에 꼭 들어가요</li>
    <li><b>정답표</b> — 채점 화면 왼쪽 탭에서 보기</li></ul>`],
  ['pages', '답안 나누기', `<ul>
    <li>쪽을 <b>끌어서</b> 옮기기</li>
    <li>쪽 <b>오른쪽</b>에 놓기 = 그 학생에 붙이기</li>
    <li>첫 쪽 <b>왼쪽</b>에 놓기 = 새 학생</li>
    <li><b>↻</b> 돌리기 · <b>⋯</b> 파일 바꾸기·지우기</li></ul>`],
  ['keys', '단축키', `<div class="kgrid">
    <span><span class="kbd">←</span><span class="kbd">→</span></span><span>이전·다음 학생</span>
    <span><span class="kbd">1</span>~<span class="kbd">9</span></span><span>기준 체크</span>
    <span><span class="kbd">Ctrl</span><span class="kbd">Enter</span></span><span>완료 후 다음</span>
    <span><span class="kbd">Ctrl</span><span class="kbd">Z</span></span><span>되돌리기</span>
    <span><span class="kbd">/</span></span><span>찾기</span></div>`],
];

function helpModal(sec) {
  modal(`<h2 style="margin-bottom:12px">도움말</h2>
    <div class="help2">${HELP.map(h => `<section id="h-${h[0]}" class="${h[0] === sec ? 'on' : ''}"><h3>${esc(h[1])}</h3>${h[2]}</section>`).join('')}</div>
    <p class="small faint" style="margin:12px 0 0">기록은 이 브라우저에 저장돼요. 구글 로그인하면 다른 컴퓨터에서도 이어 해요.</p>
    <div class="foot"><button class="btn primary" data-act="close">알겠어요</button></div>`);
  $('#mbox').classList.add('helpbox');
}

/* ================= 엑셀 ================= */
function fname(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }
function xlsxClass(kid) {
  const { course, task, cls } = findClass(kid);
  const head = ['번호', '상태', ...task.criteria.map((c, i) => `기준${i + 1}`), 'AI 점수', '점수', '문항 표시', '채점 근거', '피드백', '세특', '세특 바이트'];
  const rows = [head];
  for (let no = 1; no <= cls.size; no++) {
    const s = cls.students[no] || {}; const st = statusOf(cls, no);
    const marks = task.criteria.map((c, i) => !s.touched ? '' : task.mode === 'points' ? (s.pts[i] || 0) : (s.checks[i] ? 'O' : 'X'));
    const qm = (s.qmarks || []).map(q => `${q.no} ${QM[q.mark]}${q.reason ? ' ' + q.reason : ''}`).join(' / ');
    const why = task.criteria.map((c, i) => { const a = s.ai && s.ai.criteria.find(x => x.index === i + 1); const r = s.creason && s.creason[i] != null ? s.creason[i] : a && a.reason; return r ? `${i + 1}. ${r}` : ''; }).filter(Boolean).join('\n');
    rows.push([no, st, ...marks, aiScoreOf(task, s) ?? '', scoreOf(task, s) ?? '', qm, why, s.feedback || '', s.seteuk || '', s.seteuk ? App.bytes(s.seteuk) : '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = head.map((h, i) => ({ wch: h === '세특' || h === '피드백' ? 60 : h === '문항 표시' || h === '채점 근거' ? 50 : i === 1 ? 10 : 8 }));
  const crit = [['번호', '채점 기준', '판단 기준', '배점']].concat(task.criteria.map((c, i) => [i + 1, c.text, c.guide || '', task.mode === 'points' ? c.points : '']));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '채점 결과');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(crit), '채점 기준');
  XLSX.writeFile(wb, fname(`${course.name}_${task.name}_${cls.name}.xlsx`));
}
function xlsxAll(cid, cname) {
  const c = findCourse(cid);
  const pairs = c.tasks.map(t => ({ t, k: t.classes.find(k => k.name === cname) })).filter(x => x.k);
  const size = Math.max(...pairs.map(x => x.k.size));
  const rows = [['번호', ...pairs.flatMap(x => [x.t.name + ' 점수', x.t.name + ' 세특']), '세특 합침', '바이트']];
  for (let no = 1; no <= size; no++) {
    const cells = []; const parts = [];
    pairs.forEach(x => { const s = x.k.students[no] || {}; cells.push(scoreOf(x.t, s) ?? '', s.seteuk || ''); if (s.seteuk) parts.push(s.seteuk); });
    const all = parts.join(' ');
    rows.push([no, ...cells, all, App.bytes(all)]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '세특 모아보기');
  XLSX.writeFile(wb, fname(`${c.name}_${cname}_세특.xlsx`));
}

/* ================= 동작 ================= */
const ACT = {
  navback() { history.back(); },
  navfwd() { history.forward(); },
  undo() { undoMove(UNDO.stack, UNDO.redo, '되돌렸'); },
  redo() { undoMove(UNDO.redo, UNDO.stack, '다시 했'); },
  close: closeModal,
  sg(el) { const g = el.closest('.sg'); if (g.classList.contains('sheet')) { closeSheet(); return; } const o = !g.classList.contains('open'); g.classList.toggle('open', o); setSideOpen(el.dataset.k, o); },
  sheet(el) {
    const g = $(`.sg[data-k="${el.dataset.k}"]`); const was = g.classList.contains('sheet');
    closeSheet(); if (was) return;
    g.classList.add('sheet'); el.classList.add('open'); $('#mback').classList.add('on');
  },
  sheetclose() { closeSheet(); document.body.classList.remove('msearch'); },
  msearch() { closeSheet(); const on = document.body.classList.toggle('msearch'); if (on) { $('#mback').classList.add('on'); const q = $('#q'); q && q.focus(); } },
  sidetoggle() {
    const b = document.body;
    if (b.classList.contains('grading')) b.classList.toggle('side-show'); else b.classList.toggle('side-off');
    try { localStorage.setItem('aigrader-sideoff', b.classList.contains('side-off') ? '1' : ''); } catch (e) {}
  },
  fstatus(el) {
    const v = el.tagName === 'SELECT' ? el.value : el.dataset.v;
    F.status = el.tagName === 'SELECT' ? v : (F.status === v ? '' : v);
    const ctx = curCtx();
    if (ctx.cls && location.hash.startsWith('#/g/')) { G.navIds = listNos(ctx.task, ctx.cls); G.navKid = ctx.cls.id; }
    rerender();
  },
  fsort(el) { F.sort = el.value; rerender(); },
  fclear() { F.status = ''; F.q = ''; route(); },
  pickplan() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.hwp,.hwpx,.pdf,.txt';
    inp.onchange = () => inp.files[0] && startPlan({ file: inp.files[0] });
    inp.click();
  },
  async copyset(el, e) {
    e && e.preventDefault();
    const { cls } = findClass(el.dataset.kid); const s = cls.students[Number(el.dataset.no)];
    if (await copyText(s.seteuk)) toast(`${el.dataset.no}번 세특을 복사했습니다(${App.bytes(s.seteuk)}바이트).`);
  },
  async copyall(el) {
    const { cls } = findClass(el.dataset.id);
    const lines = []; for (let i = 1; i <= cls.size; i++) { const s = cls.students[i]; if (s && s.seteuk) lines.push(i + '\t' + s.seteuk); }
    if (!lines.length) { toast('복사할 세특이 없습니다.'); return; }
    if (await copyText(lines.join('\n'))) toast(`세특 ${lines.length}명분을 복사했습니다(번호[탭]세특 — 엑셀에 바로 붙여 넣기).`, 3500);
  },
  settings: settingsModal,
  help(el) { helpModal(el && el.dataset && el.dataset.sec); },
  theme() {
    const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('aigrader-theme', r.dataset.theme); } catch (e) {}
    themeLabel();
  },
  pasteplan() {
    modal(`<h2>계획서 글 붙여넣기</h2><p class="small muted">한글 파일에서 수행평가 부분(채점 기준 표)을 복사해 붙여 넣으세요.</p>
      <textarea class="in" id="ptxt" rows="14"></textarea><div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="pgo">AI 로 분석</button></div>`);
    $('#pgo').onclick = () => { const t = $('#ptxt').value.trim(); if (t) startPlan({ text: t }); };
  },
  newcourse() {
    const name = prompt('과목 이름', ''); if (!name) return;
    const c = { id: uid(), name, grade: '', semester: '', year: '', planName: '', planText: '', createdAt: Date.now(), tasks: [newTask()] };
    S.courses.unshift(c); save(); location.hash = '#/t/' + c.tasks[0].id;
  },
  renamecourse(el) { const c = findCourse(el.dataset.id); const n = prompt('과목 이름', c.name); if (n) { c.name = n; save(); rerender(); } },
  showplan(el) { const c = findCourse(el.dataset.id); modal(`<h2>계획서 글</h2><pre style="white-space:pre-wrap;font:13px/1.6 inherit;max-height:65vh;overflow:auto">${esc(c.planText)}</pre><div class="foot"><button class="btn" data-act="close">닫기</button></div>`, true); },
  async delcourse(el) {
    const c = findCourse(el.dataset.id);
    if (!confirm(`'${c.name}' 과목과 그 안의 채점 기록·답안 그림을 모두 지울까요? 되돌릴 수 없습니다.`)) return;
    for (const t of c.tasks) for (const k of t.classes) await delImgs(k.id + ':');
    S.courses = S.courses.filter(x => x !== c); save(true); location.hash = '#/';
  },
  addtask(el) { const c = findCourse(el.dataset.id); const t = newTask(); c.tasks.push(t); save(); location.hash = '#/t/' + t.id; },
  deltask(el) {
    const { course, task } = findTask(el.dataset.id);
    if (!confirm(`'${task.name}' 수행평가와 그 채점 기록을 지울까요? (바로 되돌릴 수 있어요)`)) return;
    snap(`'${task.name}' 지우기`); task.classes.forEach(k => gcLater(k.id));
    course.tasks = course.tasks.filter(t => t !== task); save();
    if (el.dataset.stay && !location.hash.startsWith('#/t/')) rerender(); else location.hash = '#/c/' + course.id;
    undoToast(`'${task.name}'을 지웠어요.`);
  },
  addcrit() { const t = curTask(); t.criteria.push({ text: '', guide: '', points: 0 }); save(); rerender(); },
  delcrit(el) { const t = curTask(); snap(`채점 기준 ${Number(el.dataset.i) + 1} 지우기`); t.criteria.splice(Number(el.dataset.i), 1); save(); rerender(); },
  addscale() { const t = curTask(); t.scale.push({ count: 0, score: 0 }); save(); rerender(); },
  delscale(el) { const t = curTask(); t.scale.splice(Number(el.dataset.i), 1); save(); rerender(); },
  addspec() { const t = curTask(); t.specials.push({ label: '백지 제출', score: 0 }); save(); rerender(); },
  delspec(el) { const t = curTask(); t.specials.splice(Number(el.dataset.i), 1); save(); rerender(); },
  async guide_old(el) {
    const { course, task } = findTask(el.dataset.id); task._subject = course.name;
    if (!task.criteria.length) { toast('채점 기준 항목을 먼저 넣어 주세요.'); return; }
    const k = task.classes.find(x => x.subs.length);
    modal(`<h2>판단 기준 만들기</h2><p>${k ? `${esc(k.name)} 첫 답안지(이름 가림)를 문항지로 읽고 ` : ''}채점 기준마다 판단 기준과 모범 답안 요지를 만드는 중…</p><div class="prog"><i style="width:60%"></i></div>`);
    try {
      await makeKeyFor(task, k);
      closeModal(); rerender(); toast('판단 기준을 채웠습니다. 읽어 보고 고쳐 주세요.', 3500);
    } catch (e) { closeModal(); toast(e.message, 4500); }
  },
  addclass(el) { addClassModal(el.dataset.id); },
  resplit(el) {
    const { cls } = findClass(el.dataset.id);
    cls.size = Math.max(1, Number($('#psize').value) || cls.size);
    snap('답안 다시 나누기'); splitEvery(cls, Math.max(1, Number($('#pper').value) || 1)); save(); rerender();
  },
  togstart(el) {
    const { cls } = gPages(); const i = Number(el.dataset.i);
    const firstLive = cls.pages.findIndex(p => !p.skip);
    if (i === firstLive) return;
    snap(`${i + 1}쪽 ${cls.starts.includes(i) ? '이어붙이기' : '새 학생'}`);
    if (cls.starts.includes(i)) cls.starts = cls.starts.filter(x => x !== i); else cls.starts.push(i);
    rebuildSubs(cls); save(); rerender();
  },
  pmove(el) {
    const { cls } = gPages(); const to = Number($('#pmto').value) - 1;
    if (!(to >= 0 && to < cls.pages.length)) { toast('옮길 쪽 번호를 적어 주세요.'); $('#pmto').focus(); return; }
    const idx = cls.pages.map((p, i) => G.psel.has(p.id) ? i : -1).filter(i => i >= 0);
    if (idx.includes(to)) { toast('고른 쪽이 아닌 쪽 번호를 적어 주세요.'); return; }
    const hint = dropHint(cls, to, el.dataset.w === 'after');
    snap(`${idx.length}쪽 옮기기`);
    if (movePages(cls, idx, to, el.dataset.w === 'after')) { G.psel.clear(); save(); rerender(); toast(`${idx.length}쪽 옮김 · ${hint.replace('붙이기', '붙였어요').replace('새 학생으로', '새 학생으로 넣었어요')}`); }
  },
  async prot(el) { const { cls } = gPages(); snap(`${Number(el.dataset.i) + 1}쪽 돌리기`); BUSY++; try { await rotatePages(cls, [Number(el.dataset.i)], 90); } finally { BUSY--; } rotDone(cls); },
  async protsel(el) { const { cls } = gPages(); snap(`${G.psel.size}쪽 돌리기`); const idx = cls.pages.map((p, i) => G.psel.has(p.id) ? i : -1).filter(i => i >= 0); BUSY++; try { await rotatePages(cls, idx, Number(el.dataset.d)); } finally { BUSY--; } rotDone(cls, idx.length); },
  async protall(el) { const { cls } = gPages(); snap('모든 쪽 돌리기'); toast('모든 쪽을 돌리는 중…', 1500); BUSY++; try { await rotatePages(cls, cls.pages.map((_, i) => i), Number(el.dataset.d)); } finally { BUSY--; } rotDone(cls, cls.pages.length); },
  async autoorient(el) {
    const { cls } = findClass(el.dataset.id);
    if (!(App.settings().apiKey || '').trim()) { toast('설정에 API 키를 넣으면 방향을 자동으로 맞춰요.'); return; }
    cls.pages.forEach(p => { p.oc = false; }); cls.oriented = false;
    toast('오른쪽 아래에서 방향을 맞춰요. 그동안 다른 일을 해도 돼요.', 3000); orientJob(cls);
  },
  pskip() { const { cls } = gPages(); snap(`${G.psel.size}쪽 빼기`); cls.pages.forEach(p => { if (G.psel.has(p.id)) p.skip = true; }); G.psel.clear(); rebuildSubs(cls); save(); rerender(); },
  pclear() { G.psel.clear(); rerender(); },
  pdel() {
    const { cls } = gPages(); const n = G.psel.size; if (!n) return;
    snap(`${n}쪽 지우기`); removePages(cls, p => G.psel.has(p.id)); G.psel.clear(); save(true); rerender();
    undoToast(`${n}쪽을 지웠어요.`);
  },
  pdelall(el) {
    const { cls } = findClass(el.dataset.id); if (!cls.pages.length) return;
    if (!confirm(`'${cls.name}'의 답안 그림 ${cls.pages.length}쪽을 모두 지울까요? 채점 기록은 남아요. (바로 되돌릴 수 있어요)`)) return;
    snap(`그림 ${cls.pages.length}쪽 모두 지우기`); removePages(cls, () => true); save(true); rerender();
    undoToast('답안 그림을 모두 지웠어요. 새 파일을 올리세요.');
  },
  replacefiles(el) { filePick(true, el.dataset.id, true); },
  togskip(el) { const { cls } = gPages(); snap(`${Number(el.dataset.i) + 1}쪽 ${cls.pages[Number(el.dataset.i)].skip ? '되살리기' : '빼기'}`); const p = cls.pages[Number(el.dataset.i)]; p.skip = !p.skip; rebuildSubs(cls); save(); rerender(); },
  togabsent(el) {
    const { cls } = gPages(); const no = Number(el.dataset.no); const s = stu(cls, no);
    s.status = s.status === '미응시' ? '' : '미응시';
    cls.subs.forEach(x => { if (!x.fixed) return; if (x.no === no && s.status === '미응시') x.fixed = false; });
    rebuildSubs(cls); save(); rerender();
  },
  async bigpage(el) {
    const { cls } = gPages(); const p = cls.pages[Number(el.dataset.i)];
    modal(`<div style="text-align:center"><img id="bigimg" style="max-width:100%;max-height:80vh"></div><div class="foot"><button class="btn" data-act="close">닫기</button></div>`, true);
    $('#bigimg').src = await imgURL(p.id);
  },
  masks(el) { maskModal(el.dataset.id); },
  morefiles(el) { filePick(true, el.dataset.id); },
  relink(el) { filePick(false, el.dataset.id); },
  renameclass(el) { const { cls } = findClass(el.dataset.id); const n = prompt('반 이름', cls.name); if (n && n.trim()) { snap(`'${cls.name}' 반 이름 바꾸기`); cls.name = n.trim(); save(); rerender(); } },
  async delclass(el) {
    const { task, cls } = findClass(el.dataset.id);
    if (!confirm(`'${cls.name}' 반의 답안 그림과 채점 기록을 모두 지울까요? (바로 되돌릴 수 있어요)`)) return;
    snap(`'${cls.name}' 반 지우기`); gcLater(cls.id);
    task.classes = task.classes.filter(k => k !== cls); save(true); location.hash = '#/t/' + task.id;
    undoToast(`'${cls.name}' 반을 지웠어요.`);
  },
  async batchgrade(el, e, only) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (!App.settings().apiKey) { settingsModal(); return; }
    if (!cls.masks.length && e !== 'again' && !confirm('이름 칸 가리기를 하지 않았습니다. 그래도 답안을 그대로 AI 로 보낼까요?')) return;
    const items = only || []; if (!only) for (let no = 1; no <= cls.size; no++) { const st = statusOf(cls, no); if (st === '채점 전') items.push(no); }
    if (!items.length) { toast('AI 채점할 학생이 없습니다(모두 채점했거나 답안이 없음).'); return; }
    if (jobFor('grade:' + cls.id)) { toast('이 반은 이미 AI 채점 중입니다.'); return; }
    if (needPrep(task, cls) || (keyOf(task, cls) && !keyOf(task, cls).checked && e !== 'again')) { prepGrade(task, cls, () => ACT.batchgrade(el, 'again', items)); return; }
    const lv = task.strict || '보통';
    const done = runBatch(`${cls.name} AI 채점(${lv}) — ${items.length}명`, items,
      async (no, sig) => { await runAIGrade(task, cls, no, sig); const st = cls.students[no]; return 'AI ' + aiScoreOf(task, st) + '점' + (st.seteuk ? ' · 세특 ' + App.bytes(st.seteuk) + 'B' : ''); },
      { key: 'grade:' + cls.id, kind: 'grade', clsId: cls.id, where: '#/k/' + cls.id,
 });
    Promise.resolve(done).then(() => { const n = qSuspect(task, cls); if (n) { save(); softRefresh(cls.id); toast(`${n}개 문항은 학생마다 정답이 다를 수 있어요. 반 화면에서 확인해 주세요.`, 6000); } });
  },
  batchseteuk(el, e, only) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (!App.settings().apiKey) { settingsModal(); return; }
    const items = only || []; if (!only) for (let no = 1; no <= cls.size; no++) { const s = cls.students[no]; const st = statusOf(cls, no); if (s && !s.seteuk && (st === '채점 완료' || st === 'AI 채점')) items.push(no); }
    if (!items.length) { toast('세특을 만들 학생이 없습니다(채점된 학생 중 세특이 빈 학생만 만듭니다).'); return; }
    if (jobFor('seteuk:' + cls.id)) { toast('이 반은 이미 세특을 만드는 중입니다.'); return; }
    runBatch(`${cls.name} 세특 — ${items.length}명`, items, async (no, sig) => { const r = await runSeteuk(task, cls, no, sig); return r.b + 'B'; },
      { key: 'seteuk:' + cls.id, kind: 'seteuk', clsId: cls.id, where: '#/k/' + cls.id });
  },
  xlsx(el) { xlsxClass(el.dataset.id); },
  mapview(el) { const { task } = findTask(el.dataset.id); const k = task.classes.find(x => keyOf(task, x)) || task.classes[0]; if (k) ACT.keyview({ dataset: { id: k.id } }); else toast('반을 먼저 추가해 주세요.'); },
  keyview(el) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (el.dataset.f != null) { keyModal(task, cls, null, el.dataset.f); return; }
    if (keyOf(task, cls)) { keyModal(task, cls); return; }
    if (!App.settings().apiKey) { settingsModal(); return; }
    prepGrade(task, cls, () => rerender());
  },
  async rejudge(el) {
    const { task, cls, no } = gctx; const s = stu(cls, no); if (!s.ai || !s.ai.answers) return;
    $$('.ansin').forEach(t => { const a = s.ai.answers[Number(t.dataset.ai)]; if (a) a.text = t.value; });
    el.disabled = true; el.textContent = '다시 판단하는 중…';
    if (!s.done) Object.assign(s, { touched: false, override: null, special: null, checks: [], pts: [], creason: null });
    try { await judgeInto(task, cls, no, s.ai.answers, undefined, { blank: s.ai.blank, unreadable: s.ai.unreadable }); await autoSeteuk(task, cls, no); if (gctx && gctx.no === no) rerender(); toast('고친 답으로 다시 판단했어요.'); }
    catch (e) { toast(e.message, 5000); el.disabled = false; el.textContent = '고친 답으로 다시 판단'; }
  },
  // AI 채점 다시: 학생을 골라서(채점 완료한 학생은 점수 그대로, AI 판단만 새로)
  regrade(el) {
    const { task, cls } = findClass(el.dataset.id);
    const nos = []; for (let no = 1; no <= cls.size; no++) { const st = statusOf(cls, no); if (st !== '미제출' && st !== '미응시') nos.push(no); }
    if (!nos.length) { toast('채점할 답안이 없어요.'); return; }
    const sel = new Set(nos.filter(no => statusOf(cls, no) !== '채점 완료'));
    const tag = no => ({ '채점 완료': '완료', 'AI 채점': '확인', '채점 전': '전' }[statusOf(cls, no)] || '');
    pickModal({
      title: 'AI 채점 다시', note: "고른 학생만 다시 채점해요. '채점 완료'한 학생은 점수 그대로, AI 판단만 새로.",
      nos, sel, tag, quick: [['확인 필요', no => statusOf(cls, no) !== '채점 완료'], ['채점 완료', no => statusOf(cls, no) === '채점 완료']],
      extra: `<div class="row" style="margin-top:12px"><span class="small muted">채점 기준</span>${strictSeg(task)}<span class="sp"></span><button class="lnk" data-act="keyview" data-id="${cls.id}">정답표 보기</button></div>
        <label class="f" style="margin-top:12px">채점 방향 메모 <span class="faint small">— AI 가 가장 먼저 따라요</span></label>
        <textarea class="in" id="rgdir" rows="2" placeholder="예) 물어본 것에 성실히 답하고 칸을 채웠으면 충족(내용의 깊이는 보지 않음)">${esc(task.question || '')}</textarea>
        <label class="opt" style="margin-top:10px"><input type="checkbox" id="rgread"><span>답안도 다시 읽기 <small class="faint">— 끄면 이미 읽은 답으로 판단만 다시 해요(빠르고 한도 절반). 쪽을 돌렸거나 잘못 읽었을 때 켜세요.</small></span></label>`,
      go: `${ic('bot')}다시 채점`,
      run: items => {
        cls._reuse = reread ? null : new Set(items);
        items.forEach(no => { const s = stu(cls, no); if (!s.done) Object.assign(s, { touched: false, override: null, special: null, checks: [], pts: [], creason: null }); });
        save(); ACT.batchgrade({ dataset: { id: cls.id } }, null, items);
      },
    });
    let reread = false; const rg = $('#rgread'); if (rg) rg.onchange = () => { reread = rg.checked; };
    const rd = $('#rgdir'); if (rd) rd.oninput = () => { task.question = rd.value; save(); };
  },
  // 세특 다시 쓰기: 학생을 골라서(직접 고친 세특은 처음에 빼 둠)
  reseteuk(el) {
    const { cls } = findClass(el.dataset.id);
    const nos = [], edited = new Set();
    for (let no = 1; no <= cls.size; no++) {
      const s = cls.students[no]; const st = statusOf(cls, no);
      if (!s || !(st === '채점 완료' || st === 'AI 채점')) continue;
      nos.push(no); if (s.seteuk && s.seteukAI && s.seteuk !== s.seteukAI) edited.add(no);
    }
    if (!nos.length) { toast('먼저 채점해 주세요.'); return; }
    pickModal({
      title: '세특 다시 쓰기', note: edited.size ? `고른 학생만 새로 써요. 직접 고친 세특(${edited.size}명, '고침')은 빼 두었어요.` : '고른 학생만 새로 써요.',
      nos, sel: new Set(nos.filter(no => !edited.has(no))), tag: no => edited.has(no) ? '고침' : (cls.students[no].seteuk ? '' : '없음'),
      quick: [['세특 없는 학생', no => !cls.students[no].seteuk], ['직접 고친 것 빼고', no => !edited.has(no)]],
      go: `${ICON.wand}다시 쓰기`,
      run: items => ACT.batchseteuk({ dataset: { id: cls.id } }, null, items),
    });
  },
  glogin() { closeModal(true); Sync.login().then(() => rerender()); },
  async glogout() {
    if (!confirm('구글 드라이브 저장을 끌까요? 이 컴퓨터의 기록은 그대로 남고, 드라이브의 기록도 지워지지 않습니다.')) return;
    await Sync.logout(); closeModal(true); rerender(); toast('로그아웃했습니다. 이제 이 컴퓨터에만 저장합니다.');
  },
  async gsyncnow() { closeModal(true); if (Sync.status().state === 'need') { await Sync.login(); return; } toast('드라이브와 맞추는 중…'); if (!(await Sync.pull())) await Sync.push(); },
  gsync() {
    const st = Sync.status();
    if (!st.user || st.state === 'need' || st.state === 'off') { Sync.login().then(() => rerender()); return; }
    settingsModal();
  },
  jobstop(el) { const j = JOBS.find(x => x.id === el.dataset.j); if (j) { j.ctl.abort(); j.phase = '멈추는 중…(지금 보낸 학생까지)'; renderJobs(); } },
  jobclose(el) { const k = JOBS.findIndex(x => x.id === el.dataset.j); if (k >= 0) { if (JOBS[k].resume) pendDel(JOBS[k].key); JOBS.splice(k, 1); } renderJobs(); },
  jobresume(el) {
    const k = JOBS.findIndex(x => x.id === el.dataset.j); if (k < 0) return;
    const p = JOBS[k].resume; JOBS.splice(k, 1); pendDel(p.key); renderJobs();
    ACT[p.kind === 'grade' ? 'batchgrade' : 'batchseteuk']({ dataset: { id: p.clsId } });
  },
  qtostudent(el) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name; const q = el.dataset.q;
    const key = keyOf(task, cls); if (!key) return;
    (key.answers || []).filter(a => String(a.no).split(/[-(.\s]/)[0] === q).forEach(a => { a.type = 'student'; a.rule = a.rule || '학생이 적은 조건·관찰 결과에서 결론을 올바르게 끌어냈는지(자기 자료와 결론이 서로 맞으면 맞음)'; });
    delete cls.qflags[q]; save();
    const i = key.crit.findIndex(c => c.qnos === q);
    const items = Object.keys(cls.students).map(Number).filter(no => { const s = cls.students[no]; return s.ai && s.ai.answers && !s.done && i >= 0 && !finalMet(task, s, i); });
    if (!items.length) { rerender(); toast('다시 판단할 학생이 없어요.'); return; }
    cls._reuse = new Set(items);
    items.forEach(no => Object.assign(stu(cls, no), { touched: false, override: null, special: null, checks: [], pts: [], creason: null }));
    toast(`${q}번을 학생 조건에 따라 판단하도록 바꿨어요. 틀림이었던 ${items.length}명을 다시 판단해요(이미 읽은 답 사용).`, 4000);
    ACT.batchgrade({ dataset: { id: cls.id } }, 'again', items);
  },
  qflagoff(el) { const { cls } = findClass(el.dataset.id); cls.qflags = {}; save(); rerender(); },
  jobbtn(el) { const j = JOBS.find(x => x.id === el.dataset.j); if (j && j.onBtn) j.onBtn(); },
  jobtoggle(el) { const j = JOBS.find(x => x.id === el.dataset.j); if (j) { j.open = !j.open; renderJobs(); } },
  strict(el) {
    const { task } = findTask(el.dataset.id); if (!task) return;
    task.strict = el.dataset.v; save(); rerender();
    $$('#mbox .seg button').forEach(b => b.classList.toggle('on', b.dataset.v === el.dataset.v));
    toast(`${el.dataset.v} 기준 — 다음 AI 채점부터 적용`, 2500);
  },
  xlsxall(el) { xlsxAll(el.dataset.id, el.dataset.n); },
  // ---- 채점 화면
  vtab(el) { G.tab = el.dataset.t; rerender(); },
  gotoq(el, e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    G.tab = 'key'; G.keyQ = String(el.dataset.q).split(/\s*,\s*/)[0]; rerender();
    setTimeout(() => { const r = document.querySelector('.gkey .gk-r.on'); if (r) r.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
  },
  pg(el) { const sub = subOf(gctx.cls, gctx.no); G.page = Math.max(0, Math.min(sub.pages.length - 1, G.page + Number(el.dataset.d))); rerender(); },
  pgset(el) { G.page = Number(el.dataset.i); rerender(); },
  rot() { G.rot = (G.rot + 90) % 360; rerender(); },
  zoom(el) { const d = Number(el.dataset.d); G.zoom = d ? Math.max(0.4, Math.min(3, G.zoom + d)) : 1; rerender(); },
  maskview() { G.showMask = !G.showMask; rerender(); },
  splittask(el) {
    const { course, task } = findTask(el.dataset.id);
    splitAsk(course, [task], () => { if (!el.dataset.stay) location.hash = '#/c/' + course.id; rerender(); });
  },
  splitask(el) { const c = findCourse(el.dataset.id); splitAsk(c, c.tasks.filter(t => partsOf(t) && !t.classes.length), () => rerender()); },
  copytask(el) {
    const { course, task } = findTask(el.dataset.id); snap(`'${task.name}' 복사`);
    const c = copyTask(course, task);
    if (el.dataset.stay) { rerender(); toast(`'${c.name}'을 만들었어요. 카드 제목을 두 번 눌러 이름을 바꿀 수 있어요.`, 3500); return; }
    toast('복사본을 만들었어요. 이름과 채점 기준을 고쳐 쓰세요.', 3000);
    location.hash = '#/t/' + c.id;
  },
  tree(el) {
    toggleTree(el.dataset.id);
  },
  renametask(el) { startRename(el.dataset.id); },
  mergetask(el) { const { course } = findTask(el.dataset.id); mergeAsk(course, el.dataset.id); },
  mergeask(el) { mergeAsk(findCourse(el.dataset.id), ''); },
  quotahelp(el) { quotaHelp(!!el.closest('#mbox')); },
  why() { G.why = !G.why; try { localStorage.setItem('aigrader-why', G.why ? '1' : '0'); } catch (e) {} rerender(); },
  whyreset(el) { const s = stu(gctx.cls, gctx.no); if (s.creason) delete s.creason[el.dataset.i]; save(); rerender(); },
  qopen(el) {
    const s = stu(gctx.cls, gctx.no); const i = Number(el.dataset.i); const q = s.qmarks[i];
    G.tab = 'img';
    if (q.x == null) { G.addMark = i; G.openQ = null; G.page = q.page; toast(`${q.no}번 표시를 둘 자리를 답안지에서 누르세요.`, 3000); }
    else { G.addMark = null; G.page = q.page; G.openQ = i; G.rot = 0; }
    rerender();
  },
  qadd() { G.addMark = G.addMark === -1 ? null : -1; G.openQ = null; if (G.addMark != null) { G.tab = 'img'; G.rot = 0; toast('답안지에서 표시를 둘 자리를 누르세요.', 2500); } rerender(); },
  stu(el) { const n = navStep(gctx.task, gctx.cls, gctx.no, Number(el.dataset.d)); if (n) location.hash = `#/g/${gctx.kid}/${n}`; },
  status(el) {
    const s = stu(gctx.cls, gctx.no); s.status = el.dataset.v;
    if (s.status === '미응시' && subOf(gctx.cls, gctx.no)) toast('이 번호에 답안이 배정돼 있습니다. 답안 나누기에서 번호를 확인하세요.', 4000);
    save(); rerender();
  },
  chk(el) {
    const { task, cls, no } = gctx; const s = stu(cls, no); const n = task.criteria.length;
    if (!s.touched) { s.checks = Array(n).fill(false); s.pts = Array(n).fill(0); }
    s.checks[Number(el.dataset.i)] = el.checked; s.touched = true; s.override = null; s.special = null; if (s.seteuk) s.seteukStale = true; save(); rerender();
  },
  setscore(el) { const s = stu(gctx.cls, gctx.no); s.override = Number(el.dataset.v); s.special = null; save(); rerender(); },
  special(el) { const s = stu(gctx.cls, gctx.no); const v = Number(el.dataset.v); s.special = s.special === v ? null : v; save(); rerender(); },
  resetscore() { const s = stu(gctx.cls, gctx.no); Object.assign(s, { checks: [], pts: [], touched: false, override: null, special: null, done: false }); save(); rerender(); },
  applyai() { const s = stu(gctx.cls, gctx.no); applyAI(gctx.task, s); save(); rerender(); toast('AI 판단을 적용했습니다.'); },
  copyfb() { const s = stu(gctx.cls, gctx.no); s.feedback = s.ai.feedback; save(); rerender(); },
  async aigrade(el, e) {
    const { task, cls, no } = gctx;
    if (!App.settings().apiKey) { settingsModal(); return; }
    if (!cls.masks.length && e !== 'again' && !confirm('이름 칸 가리기를 하지 않았습니다. 답안을 그대로 AI 로 보낼까요?')) return;
    if (needPrep(task, cls) || (keyOf(task, cls) && !keyOf(task, cls).checked && e !== 'again')) { prepGrade(task, cls, () => { const b = $('[data-act="aigrade"]'); if (b) ACT.aigrade(b, 'again'); }); return; }
    el.disabled = true;
    el.innerHTML = 'AI 가 답안을 읽고 판단하는 중…';
    const s0 = stu(cls, no);
    if (s0.ai && !s0.done) Object.assign(s0, { touched: false, override: null, special: null, checks: [], pts: [], creason: null });
    try { await runAIGrade(task, cls, no); if (gctx && gctx.no === no) rerender(); toast(`${no}번 AI 채점: ${aiScoreOf(task, cls.students[no])}점`); }
    catch (e) { toast(e.message, 5000); el.disabled = false; el.textContent = 'AI 채점 실행'; }
  },
  async mkseteuk(el) {
    const { task, cls, no } = gctx;
    if (!App.settings().apiKey) { settingsModal(); return; }
    const s = stu(cls, no);
    if (!s.touched && !s.ai && s.special == null && s.override == null) { toast('먼저 채점하거나 AI 채점을 실행해 주세요.'); return; }
    el.disabled = true; el.textContent = '세특 쓰는 중…';
    try { const r = await runSeteuk(task, cls, no); if (gctx && gctx.no === no) rerender(); if (r.none) { toast(r.none + ' 관찰 메모를 적으면 그 내용으로 쓸 수 있어요.', 4500); return; } toast(`세특 ${r.b}바이트${r.dist ? ' — 목표 범위를 벗어나 직접 다듬어 주세요' : ''}`, 3500); }
    catch (e) { toast(e.message, 5000); el.disabled = false; el.textContent = '세특 만들기'; }
  },
  finish() {
    const { task, cls, no } = gctx; const s = stu(cls, no);
    if (scoreOf(task, s) == null && !s.status) { toast('점수를 정하거나 미제출·미응시를 고르세요.'); return; }
    s.done = true; save();
    if (s.seteuk && s.seteukStale && App.settings().apiKey) { // 선생님 판단대로 세특을 뒤에서 다시
      const n0 = no; runSeteuk(task, cls, n0).then(r => { toast(`${n0}번 세특을 선생님 판단대로 다시 썼어요(${r.b}B).`, 3000); softRefresh(cls.id, n0); }).catch(e => toast(`${n0}번 세특 다시 쓰기 실패: ${e.message}`, 4000));
    }
    // 보던 목록 순서에서 다음으로 채점할 학생(채점 전·AI 채점)으로
    const todo = x => { const st = statusOf(cls, x); return st === '채점 전' || st === 'AI 채점'; };
    let next = null, x = no;
    while ((x = navStep(task, cls, x, 1))) { if (todo(x)) { next = x; break; } }
    if (!next) next = firstTodo(cls);
    if (next) location.hash = `#/g/${cls.id}/${next}`; else { rerender(); toast('이 반 채점을 모두 마쳤습니다.'); }
  },
  // ---- 백업
  backup() {
    const blob = new Blob([JSON.stringify({ app: 'ai-grader', v: 1, savedAt: new Date().toISOString(), state: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ai-grader-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    toast('채점 기록을 저장했습니다(답안 그림은 빠짐).');
  },
  restore() {
    closeModal(true);
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
    inp.onchange = async () => {
      try {
        const j = JSON.parse(await inp.files[0].text());
        if (j.app !== 'ai-grader') throw new Error('이 앱의 백업 파일이 아닙니다.');
        if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
        S = j.state; save(true); route(); toast('불러왔습니다. 답안 그림은 반 화면에서 PDF 를 다시 연결하세요.', 4000);
      } catch (e) { toast(e.message, 4000); }
    };
    inp.click();
  },
};
function curTask() { const id = location.hash.split('/')[2]; return findTask(id).task; }
function gPages() { return findClass(location.hash.split('/')[2]); }
function filePick(more, kid, replace) {
  const { cls } = findClass(kid);
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,image/*';
  inp.onchange = async () => {
    if (!inp.files.length) return;
    if (replace) { snap('파일 바꾸기'); removePages(cls, () => true); cls.oriented = false; }
    modal(`<h2>${replace ? '파일 바꾸기' : more ? '파일 더 올리기' : 'PDF 다시 연결'}</h2><p id="fmsg" class="small"></p><div class="prog"><i id="fbar"></i></div>`);
    $('#modal').dataset.lock = '1';
    try {
      const n = await addPages(cls, [...inp.files], (m, f) => { $('#fmsg').textContent = m; $('#fbar').style.width = f * 100 + '%'; }, more ? null : cls.pages.map(p => p.id));
      if (more) { if (!cls.starts.length) splitEvery(cls, cls.perStudent || 1); else rebuildSubs(cls); }
      else { cls._noimg = false; if (n !== cls.pages.length) toast(`쪽 수가 다릅니다(원래 ${cls.pages.length}쪽, 올린 파일 ${n}쪽). 같은 파일인지 확인하세요.`, 5000); }
      save(true);
    } catch (e) { toast(e.message, 4000); }
    delete $('#modal').dataset.lock; closeModal(); rerender();
    if (replace) { undoToast('새 파일로 바꿨어요.'); if (needOrient(cls)) orientJob(cls); }
  };
  inp.click();
}

document.addEventListener('click', e => {
  // 열린 '더 보기' 메뉴: 안의 항목을 누르거나 바깥을 누르면 닫는다
  $$('details.menu[open]').forEach(d => { if (!d.contains(e.target) || e.target.closest('.mlist a,.mlist button')) d.open = false; });
  const go = e.target.closest('[data-go]');
  const a = e.target.closest('[data-act]');
  if (a && a.tagName !== 'INPUT' || a && a.type === 'checkbox' || a && a.type === 'radio') {
    const fn = ACT[a.dataset.act];
    if (fn) { if (a.tagName === 'BUTTON') a.blur(); fn(a, e); return; }
  }
  if (go && !e.target.closest('a,button,input,select,textarea')) location.hash = go.dataset.go;
});
function startRename(tid) {
  const { task } = findTask(tid); if (!task) return;
  const el = document.querySelector(`[data-ren="${tid}"]`);
  if (!el) { const n = prompt('수행평가 이름', task.name); if (n && n.trim()) { task.name = n.trim(); save(); rerender(); } return; }
  const inp = document.createElement('input'); inp.className = 'in tk-in'; inp.value = task.name;
  el.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const end = ok => { if (done) return; done = true; if (ok && inp.value.trim() && inp.value.trim() !== task.name) { snap(`'${task.name}' 이름 바꾸기`); task.name = inp.value.trim(); save(); toast('이름을 바꿨어요. (Ctrl+Z 되돌리기)'); } rerender(); };
  inp.onkeydown = e => { if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
  inp.onblur = () => end(true);
}
// 채점 화면의 답안 그림: 크게 보면 손 모양으로 잡아 끌어 옮긴다(표시 넣기 중에는 끄지 않음)
let VPAN = null;
const vpScroll = vp => vp.scrollWidth > vp.clientWidth + 1 || vp.scrollHeight > vp.clientHeight + 1;
document.addEventListener('mouseover', e => { const vp = e.target.closest && e.target.closest('#vpage'); if (vp) vp.classList.toggle('pannable', vpScroll(vp) && !G.addMark); });
document.addEventListener('mousedown', e => {
  const vp = e.target.closest && e.target.closest('#vpage');
  if (!vp || e.button || G.addMark || e.target.closest('button,input,textarea,select,a,[data-act],.tr') || !vpScroll(vp)) return;
  VPAN = { vp, x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop }; vp.classList.add('drag'); e.preventDefault();
});
document.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('#vpage, .kbox .mapimg')) e.preventDefault(); });
document.addEventListener('mousemove', e => { if (!VPAN) return; VPAN.vp.scrollLeft = VPAN.l - (e.clientX - VPAN.x); VPAN.vp.scrollTop = VPAN.t - (e.clientY - VPAN.y); });
document.addEventListener('mouseup', () => { if (VPAN) { VPAN.vp.classList.remove('drag'); VPAN = null; } });
document.addEventListener('dblclick', e => { const t = e.target.closest('[data-ren]'); if (t) startRename(t.dataset.ren); });
document.addEventListener('change', e => {
  if (e.target.matches && e.target.matches('[data-cbyte]')) {
    const c = findCourse(e.target.dataset.id); if (!c) return;
    const v = Math.max(0, Number(e.target.value) || 0);
    if (e.target.dataset.cbyte === 'min') c.byteMin = v || null; else c.byteMax = v || null;
    save(); const r = rangeFor(c.tasks[0] || null);
    toast(c.byteMin || c.byteMax ? `${c.name} 세특은 ${c.byteMin || App.settings().byteMin}~${c.byteMax || App.settings().byteMax}바이트로 써요.` : `${c.name}은 설정값 길이를 써요.`, 3000);
    return;
  }
  if (e.target.matches && e.target.matches('[data-sform]') && typeof gctx !== 'undefined' && gctx) {
    const { task, cls, no } = gctx; const s = stu(cls, no); const f = normForm(e.target.value);
    if (f === stuForm(cls, no) && s.formBy === 'teacher') return;
    s.form = f; s.formBy = 'teacher'; s.formWarn = ''; save();
    if (!s.ai) { rerender(); toast(`${f ? f + '형' : '형 없음'}으로 정했어요.`); return; }
    toast(`${f ? f + '형' : '형 없음'}으로 바꿨어요. ${(task.keys || {})[f] ? '그 형의 정답표로' : '그 형의 정답표를 만든 뒤'} 다시 채점해요.`, 3500);
    const b = $('[data-act="aigrade"]'); if (b) ACT.aigrade(b, 'again'); else rerender();
    return;
  }
  const a = e.target.closest('[data-act-change]');
  if (a && ACT[a.dataset.actChange]) ACT[a.dataset.actChange](a, e);
});
document.addEventListener('keydown', e => {
  // Ctrl+Z 되돌리기, Ctrl+Y·Ctrl+Shift+Z 다시 하기(글을 쓰는 칸에서는 그 칸의 되돌리기)
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zy]$/i.test(e.key) && !(e.target.closest && e.target.closest('input,textarea,select,[contenteditable]'))) {
    e.preventDefault(); if (e.key.toLowerCase() === 'y' || e.shiftKey) ACT.redo(); else ACT.undo(); return;
  }
  const typingAny = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (e.key === '?' && !typingAny && $('#modal').classList.contains('hide')) { helpModal(); return; }
  if (e.key === '/' && !typingAny && $('#modal').classList.contains('hide')) { e.preventDefault(); const q = $('#q'); if (q) { if (getComputedStyle($('.sbox')).display === 'none') document.body.classList.add('msearch'); q.focus(); q.select(); } return; }
  if (e.key === 'Escape' && $('.sg.sheet')) { closeSheet(); return; }
  if (!location.hash.startsWith('#/g/') || !gctx) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('#modal').classList.contains('hide')) { if (e.key === 'Escape') closeModal(); return; }
  const typing = typingAny && document.activeElement.type !== 'checkbox' && document.activeElement.type !== 'radio';
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); ACT.finish(); return; }
  if (typing) return;
  if (e.key === 'ArrowLeft') ACT.stu({ dataset: { d: -1 } });
  else if (e.key === 'ArrowRight') ACT.stu({ dataset: { d: 1 } });
  else if (e.key === 'Escape') location.hash = '#/k/' + gctx.kid;
  else if (/^[1-9]$/.test(e.key)) {
    const box = $(`[data-act="chk"][data-i="${Number(e.key) - 1}"]`);
    if (box) { box.checked = !box.checked; ACT.chk(box); }
  }
});

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) {} ta.remove();
    if (!ok) toast('복사하지 못했습니다. 글을 직접 선택해 복사해 주세요.'); return ok;
  }
}
function themeLabel() {
  const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  const l = $('#themelb'); if (l) l.textContent = dark ? '밝게' : '어둡게';
}
// 오래 걸리는 일(PDF 그리기·한꺼번에 채점) 중에 창을 닫으려 하면 한 번 묻는다
let BUSY = 0;
window.addEventListener('beforeunload', e => { if (BUSY > 0) { e.preventDefault(); e.returnValue = ''; } });
// 창을 닫거나 다른 창으로 넘어갈 때: 고치던 칸을 반영하고 곧바로 저장(0.3초 기다리지 않음)
function flushNow() {
  const a = document.activeElement;
  if (a && a.matches && a.matches('[data-f]')) a.dispatchEvent(new Event('change', { bubbles: true }));
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; save(true); }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
window.addEventListener('pagehide', flushNow);
// 마지막으로 본 화면을 기억했다가 다시 열면 그 화면에서 시작
window.addEventListener('hashchange', () => { try { localStorage.setItem('aigrader-route', location.hash); } catch (e) {} });
function routeAlive(h) {
  const m = (h || '').match(/^#\/(c|t|k|g|s)\/([^/]+)(?:\/(.+))?$/);
  if (!m) return false;
  if (m[1] === 'c' || m[1] === 's') return !!findCourse(m[2]);
  if (m[1] === 't') return !!findTask(m[2]).task;
  const { cls } = findClass(m[2]);
  if (!cls) return false;
  return m[1] === 'k' || Number(m[3]) <= cls.size;
}

// 처음 화면 어디에든 계획서 파일을 끌어 놓으면 분석
let dragN = 0;
document.addEventListener('dragenter', e => { if (curCtx().kind === 'home' && [...(e.dataTransfer.types || [])].includes('Files')) { dragN++; document.body.classList.add('dragging'); } });
document.addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; document.body.classList.remove('dragging'); } });
document.addEventListener('dragover', e => { if (curCtx().kind === 'home') e.preventDefault(); });
document.addEventListener('drop', e => {
  dragN = 0; document.body.classList.remove('dragging');
  if (curCtx().kind !== 'home' || e.target.closest('.drop')) return;
  e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) startPlan({ file: f });
});

const GICON = '<svg class="ic" viewBox="0 0 24 24"><path d="M7.7 3h8.6l5.2 9-4.3 7.5H6.8L2.5 12z"/><path d="M7.7 3l8.6 16.5M16.3 3L7.7 19.5M2.5 12h19"/></svg>';
function renderGsync() {
  const b = $('#gsync'); if (!b || typeof Sync === 'undefined' || !Sync.enabled()) return;
  const st = Sync.status();
  // 로그인·로그아웃이 바뀌면 화면(첫 화면 안내, 메뉴 아래 문구)도 다시 그린다
  if (renderGsync.user !== undefined && renderGsync.user !== (st.user || '')) setTimeout(() => route({ keepSide: true }), 0);
  renderGsync.user = st.user || '';
  b.classList.remove('hide', 'ok', 'need', 'busy', 'err');
  if (!st.user) { b.innerHTML = `${GICON}<span class="lb">로그인</span>`; b.title = '구글 로그인 — 내 드라이브에 저장하고 다른 컴퓨터에서 이어서 하기'; return; }
  const cls = { ok: 'ok', need: 'need', busy: 'busy', error: 'err' }[st.state] || '';
  if (cls) b.classList.add(cls);
  const lb = st.state === 'need' ? '다시 연결' : st.state === 'error' ? '오류' : '';
  b.classList.toggle('q', !lb);
  b.innerHTML = `${GICON}${lb ? `<span class="lb">${lb}</span>` : ''}`;
  b.title = `${st.user}\n${st.note || ''}`;
}
/* ================= 시작 ================= */
(async () => {
  try { const th = localStorage.getItem('aigrader-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  try { if (localStorage.getItem('aigrader-sideoff')) document.body.classList.add('side-off'); } catch (e) {}
  themeLabel();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeLabel);
  if (!gateOK()) await showGate(); else VISITS = visits(); // 시작 화면 잠금
  try { const st = await DB.get('kv', 'state'); if (st && st.courses) S = st; }
  catch (e) { toast('저장소를 열 수 없습니다(사생활 보호 창?). 이 창을 닫으면 기록이 사라집니다.', 6000); }
  // 브라우저가 공간이 부족할 때 기록을 지우지 않도록 요청(지원하는 브라우저만)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    let last = ''; try { last = localStorage.getItem('aigrader-route') || ''; } catch (e) {}
    if (last && last !== '#/' && routeAlive(last)) { history.replaceState(null, '', last); toast('지난번에 보던 화면에서 이어 갑니다.', 2500); }
  }
  route();
  resumeJobs();
  setTimeout(gcImgs, 8000);
  if (typeof Sync !== 'undefined') { Sync.onChange(renderGsync); renderGsync(); Sync.boot(); }
  AI.onUsage((u, ev) => {
    renderQuota(); const el = $('#susage'); if (el) el.innerHTML = usageHTML();
    if (ev && ev.kind === 'day') toast(`${ev.model} 오늘 무료 한도를 다 써서 ${ev.next || '다른 모델'}(으)로 이어 가요.`, 5000);
  });
  renderQuota(); setInterval(renderQuota, 15000);
})();
