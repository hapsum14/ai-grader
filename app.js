// AI 서논술형 채점 — 화면과 데이터
'use strict';

/* ================= 설정 ================= */
const App = (() => {
  const KEY = 'aigrader-settings';
  const DEF = { apiKey: '', model: 'gemini-flash-latest', byteMin: 250, byteMax: 300 };
  function settings() {
    try { return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return Object.assign({}, DEF); }
  }
  function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }
  const bytes = t => { let b = 0; for (const ch of String(t || '')) b += ch.codePointAt(0) > 127 ? 3 : 1; return b; };
  return { settings, saveSettings, bytes };
})();

/* ================= 작은 도구 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
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
};

let S = { courses: [] };
let saveTimer = null;
function save(now) {
  clearTimeout(saveTimer);
  const run = () => DB.put('kv', 'state', JSON.parse(JSON.stringify(S, (k, v) => (k[0] === '_' ? undefined : v)))).catch(e => toast('저장 실패: ' + e.message));
  if (now) return run();
  saveTimer = setTimeout(run, 300);
}
const urlCache = new Map();
async function imgURL(key) {
  if (urlCache.has(key)) return urlCache.get(key);
  const b = await DB.get('img', key);
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
  const k = { '채점 완료': 'ok', 'AI 채점': 'ai', '채점 전': '', '미제출': 'warn', '미응시': 'bad' }[st];
  return `<span class="pill ${k}">${esc(st)}</span>`;
}
function scaleScore(task, n) {
  const sc = [...(task.scale || [])].sort((a, b) => b.count - a.count);
  const hit = sc.find(x => x.count <= n);
  return hit ? hit.score : null;
}
function scoreOf(task, s) {
  if (!s) return null;
  if (s.special != null) return s.special;
  if (s.override != null) return s.override;
  if (!s.touched) return null;
  if (task.mode === 'points') return sum(s.pts);
  return scaleScore(task, s.checks.filter(Boolean).length);
}
function aiScoreOf(task, s) {
  if (!s || !s.ai || !s.ai.criteria) return null;
  if (s.ai.blank) { const sp = (task.specials || []).find(x => /백지/.test(x.label)); if (sp) return sp.score; }
  if (task.mode === 'points') return sum(s.ai.criteria.map(c => c.points));
  return scaleScore(task, s.ai.criteria.filter(c => c.met).length);
}
function applyAI(task, s) {
  const n = task.criteria.length;
  s.checks = Array.from({ length: n }, (_, i) => { const c = s.ai.criteria.find(x => x.index === i + 1); return !!(c && c.met); });
  s.pts = Array.from({ length: n }, (_, i) => { const c = s.ai.criteria.find(x => x.index === i + 1); return c ? Number(c.points) || 0 : 0; });
  s.touched = true; s.override = null; s.special = null;
  if (s.ai.blank) { const sp = (task.specials || []).find(x => /백지/.test(x.label)); if (sp) s.special = sp.score; }
}
function scoreChoices(task) {
  const set = new Set((task.scale || []).map(x => x.score));
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
    const blob = await DB.get('img', p.id);
    if (!blob) throw new Error('쪽 그림이 없습니다. 반 화면에서 PDF 를 다시 연결해 주세요.');
    const rects = (cls.masks || []).filter(m => m.page === -1 || m.page === j);
    out.push(await Parse.maskedBase64(blob, rects));
  }
  return out;
}
function seteukInfo(task, s) {
  const L = [];
  const sc = scoreOf(task, s);
  L.push(`받은 점수: ${sc == null ? '미정' : sc}/${task.maxScore}`);
  const met = [], unmet = [];
  task.criteria.forEach((c, i) => {
    const ok = s.touched ? !!s.checks[i] : !!(s.ai && (s.ai.criteria.find(x => x.index === i + 1) || {}).met);
    (ok ? met : unmet).push(c.text);
  });
  L.push('충족한 채점 기준: ' + (met.join(' / ') || '없음'));
  L.push('충족하지 못한 채점 기준: ' + (unmet.join(' / ') || '없음'));
  if (s.ai) {
    if (s.ai.transcript) L.push('학생 답안(인식 결과):\n' + s.ai.transcript);
    if (s.ai.observation) L.push('관찰 요약: ' + s.ai.observation);
    const ev = s.ai.criteria.filter(c => c.met && c.evidence).map(c => `${c.index}번 기준 근거: ${c.evidence}`);
    if (ev.length) L.push(ev.join('\n'));
  }
  if (s.feedback) L.push('교사 피드백: ' + s.feedback);
  if (s.memo) L.push('교사 관찰 메모(중요): ' + s.memo);
  return L.join('\n');
}
const BRANDS = ['구글', '네이버', '다음카페', '유튜브', '유튜버', '카카오톡', '카톡', '인스타그램', '페이스북', '패들렛', '띵커벨', '미리캔버스', '캔바', '챗GPT', 'ChatGPT', 'GPT', '제미나이', 'Gemini', '노션', '위키백과', '나무위키', 'TED'];
function lint(t) {
  const w = [];
  const fw = t.match(/나의|나만의|내가|대회/g); if (fw) w.push('쓰면 안 되는 말: ' + [...new Set(fw)].join(', '));
  const bad = t.match(/[^\p{L}\p{N}\s.,\-]/gu); if (bad) w.push('마침표·쉼표·하이픈 밖의 특수문자: ' + [...new Set(bad)].join(' '));
  const inner = t.match(/(느낌|느꼈음|생각함|깨달음|알게 됨|알게 되었음|배움|다짐함|인식함|이해함)(?=\s*[.,]|\s*$)/g);
  if (inner) w.push('학생 입장 종결어: ' + [...new Set(inner)].join(', ') + ' → 관찰한 행동(설명함·분석함 등)으로');
  const br = BRANDS.filter(b => t.includes(b)); if (br.length) w.push('상호명·서비스명: ' + br.join(', ') + ' → 일반 명사로');
  const unit = t.match(/\d\s?(cm|mm|km|kg|mg|ml|mL|L)\b/g); if (unit) w.push('영문 단위 기호: ' + unit.join(', ') + ' → 한글 단위명으로');
  if (/(학생\s?\d+|\d+번\s?학생)/.test(t)) w.push('번호가 문구에 들어 있음');
  return w;
}

/* ================= 화면 틀 ================= */
const view = $('#view');
let after = null;
function crumb(parts) {
  $('#crumb').innerHTML = parts.map(p => p[1] ? `<a href="${p[1]}">${esc(p[0])}</a>` : esc(p[0])).join(' &rsaquo; ');
}
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const p = h.split('/').map(decodeURIComponent);
  document.body.classList.toggle('grading', p[0] === 'g');
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
  const k = App.settings();
  $('#keydot').classList.toggle('on', !!k.apiKey);
  if (after) after();
}
function rerender() { const y = window.scrollY; const side = $('.gside'); const sy = side && side.scrollTop; route(); window.scrollTo(0, y); const s2 = $('.gside'); if (s2 && sy != null) s2.scrollTop = sy; }
window.addEventListener('hashchange', route);

/* ================= 모달 ================= */
function modal(html, wide) {
  $('#mbox').className = 'box' + (wide ? ' wide' : '');
  $('#mbox').innerHTML = html;
  $('#modal').classList.remove('hide');
}
function closeModal() { $('#modal').classList.add('hide'); $('#mbox').innerHTML = ''; }
$('#modal').addEventListener('mousedown', e => { if (e.target.id === 'modal' && !$('#modal').dataset.lock) closeModal(); });

/* ================= 처음 화면 ================= */
function vHome() {
  crumb([]);
  const key = App.settings().apiKey;
  const cards = S.courses.map(c => {
    const nCls = sum(c.tasks.map(t => t.classes.length));
    let done = 0, all = 0;
    c.tasks.forEach(t => t.classes.forEach(k => { for (let i = 1; i <= k.size; i++) { all++; const st = statusOf(k, i); if (st === '채점 완료' || st === '미응시' || st === '미제출') done++; } }));
    return `<div class="card tcard" data-go="#/c/${c.id}">
      <div class="row between"><h3>${esc(c.name)}</h3><span class="pill">${esc([c.year, c.grade && c.grade + '학년', c.semester && c.semester + '학기'].filter(Boolean).join(' '))}</span></div>
      <div class="sub">수행평가 ${c.tasks.length}개 · 반 ${nCls}개${all ? ` · 처리 ${done}/${all}명` : ''}</div>
      <div class="small faint" style="margin-top:6px">${esc(c.planName || '직접 만듦')}</div></div>`;
  }).join('');
  after = () => dropzone($('#plandrop'), $('#planfile'), fs => startPlan({ file: fs[0] }));
  return `
  ${key ? '' : `<div class="card note blue"><b>처음 쓰시나요?</b> <a href="${KEY_URL}" target="_blank" rel="noopener">Google AI Studio 에서 무료 API 키를 발급</a>받아 오른쪽 위 <b>설정</b>에 넣으면 AI 분석·채점·세특 작성이 됩니다. 키 없이도 수동 채점은 할 수 있습니다.
    <div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="settings">설정 열기</button><button class="btn sm" data-act="help" data-sec="key">키 발급 방법</button><button class="btn sm" data-act="help" data-sec="start">사용 순서</button></div></div>`}
  <div class="card">
    <div class="sec-h">${ICON.doc}평가계획서로 시작하기</div>
    <div class="drop" id="plandrop">
      <b>평가계획서 파일을 끌어 놓거나 눌러서 고르세요</b><br>
      <span class="small">hwp · hwpx · pdf · txt — 수행평가 영역별 채점 기준을 AI 가 뽑아 채점 계획을 만듭니다</span>
    </div>
    <input type="file" id="planfile" accept=".hwp,.hwpx,.pdf,.txt" class="hide">
    <div class="row" style="margin-top:12px">
      <button class="btn" data-act="pasteplan">${ICON.pen}계획서 글 붙여넣기</button>
      <button class="btn" data-act="newcourse">빈 과목 직접 만들기</button>
    </div>
  </div>
  <div class="row between" style="margin:22px 2px 10px"><h2 style="font-size:18px">내 과목</h2>
    <div class="row"><button class="btn sm" data-act="backup">${ICON.down}백업 저장</button><button class="btn sm" data-act="restore">${ICON.up}백업 불러오기</button></div></div>
  ${cards ? `<div class="grid2">${cards}</div>` : '<div class="card empty">아직 과목이 없습니다. 평가계획서를 올려 시작하세요.</div>'}
  <p class="small faint" style="margin-top:24px">모든 자료는 이 브라우저(이 컴퓨터)에만 저장됩니다. AI 를 쓸 때만 가림 처리한 답안 그림과 채점 기준이 Google Gemini 로 전송됩니다.</p>`;
}

async function startPlan(src) {
  modal(`<h2>평가계획서 분석</h2><p id="pmsg">파일을 읽는 중…</p><div class="prog"><i style="width:15%"></i></div>
    <p class="small muted" id="psub" style="margin:8px 0 0"></p>`);
  $('#modal').dataset.lock = '1';
  const t0 = Date.now(); let got = 0, phase = '', timer = null;
  const tick = () => {
    const sec = Math.round((Date.now() - t0) / 1000);
    const el = $('#psub'); if (!el) return;
    el.textContent = `${sec}초 지남${got ? ` · 받은 글 ${got.toLocaleString()}자` : ''}${phase}`;
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
    const r = await AI.extractPlan(send, n => { got = n; phase = ''; }, s => { phase = ` · 서버가 바빠 ${s}초 뒤 다시 시도`; });
    clearInterval(timer);
    const c = {
      id: uid(), name: r.subject || (src.file ? src.file.name : '새 과목'), grade: r.grade || '', semester: r.semester || '', year: r.school_year || '',
      planName: src.file ? src.file.name : '붙여넣은 글', planText: full, createdAt: Date.now(),
      tasks: (r.tasks || []).map(t => {
        const d = Parse.planDetails(full, t.name, t.standards);
        return newTask(Object.assign({}, t, { standards: d.standards, levels: d.levels }));
      }),
    };
    if (!c.tasks.length) throw new Error('수행평가 영역을 찾지 못했습니다. 계획서 내용을 확인해 주세요.');
    S.courses.unshift(c); save(true);
    delete $('#modal').dataset.lock; closeModal();
    toast(`${Math.round((Date.now() - t0) / 1000)}초 만에 수행평가 ${c.tasks.length}개를 찾았습니다. 채점 기준을 확인해 주세요.`, 3500);
    location.hash = '#/c/' + c.id;
  } catch (e) {
    clearInterval(timer);
    delete $('#modal').dataset.lock;
    modal(`<h2>분석하지 못했습니다</h2><p>${esc(e.message)}</p><div class="foot">${/키/.test(e.message) ? '<button class="btn primary" data-act="settings">설정 열기</button>' : ''}<button class="btn" data-act="close">닫기</button></div>`);
  }
}

/* ================= 과목 화면 ================= */
function vCourse(cid) {
  const c = findCourse(cid); if (!c) return '<div class="card empty">과목을 찾을 수 없습니다. <a href="#/">처음으로</a></div>';
  crumb([[c.name]]);
  const names = [...new Set(c.tasks.flatMap(t => t.classes.map(k => k.name)))];
  const tasks = c.tasks.map(t => {
    const cls = t.classes.map(k => {
      let done = 0; for (let i = 1; i <= k.size; i++) { const st = statusOf(k, i); if (st !== '채점 전' && st !== 'AI 채점') done++; }
      return `<a class="btn sm soft" href="#/k/${k.id}">${esc(k.name)} <span class="faint">${done}/${k.size}</span></a>`;
    }).join('');
    return `<div class="card">
      <div class="row between"><div><h3 style="font-size:18px">${esc(t.name)}</h3>
        <div class="sub">${t.maxScore}점 · ${esc(t.method || '')}${t.period ? ' · ' + esc(t.period) : ''} · 채점 기준 ${t.criteria.length}개(${t.mode === 'points' ? '항목별 배점' : '충족 항목 수'})</div></div>
        <div class="row"><a class="btn sm" href="#/t/${t.id}">${ICON.list}채점 기준 보기·고치기</a><button class="btn sm primary" data-act="addclass" data-id="${t.id}">+ 반 추가(답안 올리기)</button></div></div>
      ${t.criteria.length ? `<ol class="small muted" style="margin:10px 0 0;padding-left:20px">${t.criteria.map(x => `<li>${esc(x.text)}</li>`).join('')}</ol>` : '<p class="note" style="margin-top:10px">채점 기준이 비어 있습니다. "채점 기준 보기·고치기"에서 넣어 주세요.</p>'}
      ${cls ? `<div class="row" style="margin-top:12px">${cls}</div>` : ''}
    </div>`;
  }).join('');
  return `
  <div class="row between" style="margin-bottom:14px"><div><div class="title">${esc(c.name)}</div>
    <div class="sub">${esc([c.year && c.year + '학년도', c.grade && c.grade + '학년', c.semester && c.semester + '학기'].filter(Boolean).join(' '))} · ${esc(c.planName || '')}</div></div>
    <div class="row"><button class="btn sm" data-act="renamecourse" data-id="${c.id}">${ICON.pen}이름 고치기</button>
    ${c.planText ? `<button class="btn sm" data-act="showplan" data-id="${c.id}">${ICON.doc}계획서 글 보기</button>` : ''}
    <button class="btn sm danger" data-act="delcourse" data-id="${c.id}">과목 지우기</button></div></div>
  ${tasks}
  <div class="row" style="margin-bottom:18px"><button class="btn" data-act="addtask" data-id="${c.id}">+ 수행평가 직접 추가</button></div>
  ${names.length ? `<div class="card"><div class="sec-h">${ICON.grad}반별 세특 모아보기</div><div class="sub" style="margin-bottom:10px">같은 반의 수행평가별 세특 초안을 학생 번호마다 한 줄로 모아 봅니다.</div>
    <div class="row">${names.map(n => `<a class="btn sm soft" href="#/s/${c.id}/${encodeURIComponent(n)}">${esc(n)}</a>`).join('')}</div></div>` : ''}`;
}

/* ================= 채점 기준(수행평가) 화면 ================= */
function vTask(tid) {
  const { course, task: t } = findTask(tid); if (!t) return '<div class="card empty">수행평가를 찾을 수 없습니다.</div>';
  crumb([[course.name, '#/c/' + course.id], [t.name + ' 채점 기준']]);
  const crit = t.criteria.map((c, i) => `
    <div class="crit">
      <div class="no">${i + 1}</div>
      <div><textarea class="in" rows="2" data-f="crit.text" data-i="${i}">${esc(c.text)}</textarea>
        <textarea class="in small" rows="2" style="margin-top:6px" placeholder="판단 기준(무엇이 있으면 충족인지)" data-f="crit.guide" data-i="${i}">${esc(c.guide || '')}</textarea></div>
      <div>${t.mode === 'points' ? `<input class="in" type="number" step="0.5" value="${c.points || 0}" data-f="crit.points" data-i="${i}" title="배점">` : ''}</div>
      <button class="btn sm ghost danger" data-act="delcrit" data-i="${i}" title="지우기">✕</button>
    </div>`).join('');
  const scale = (t.scale || []).map((s, i) => `<span class="it"><input class="in" type="number" value="${s.count}" data-f="scale.count" data-i="${i}">개 →<input class="in" type="number" step="0.5" value="${s.score}" data-f="scale.score" data-i="${i}">점<button class="btn sm ghost" data-act="delscale" data-i="${i}">✕</button></span>`).join('');
  const specials = (t.specials || []).map((s, i) => `<span class="it"><input class="in" style="width:200px" value="${esc(s.label)}" data-f="spec.label" data-i="${i}"><input class="in" type="number" step="0.5" value="${s.score}" data-f="spec.score" data-i="${i}">점<button class="btn sm ghost" data-act="delspec" data-i="${i}">✕</button></span>`).join('');
  after = () => bindTaskInputs(t);
  return `
  <div class="row between" style="margin-bottom:14px"><div class="title">${esc(t.name)} · 채점 기준</div>
    <div class="row"><button class="btn danger sm" data-act="deltask" data-id="${t.id}">수행평가 지우기</button><a class="btn primary" href="#/c/${course.id}">저장하고 돌아가기</a></div></div>
  <div class="card">
    <div class="sec-h">${ICON.doc}기본 정보</div>
    <div class="grid2">
      <div><label class="f">이름</label><input class="in" data-f="name" value="${esc(t.name)}"></div>
      <div class="row" style="gap:12px;align-items:end">
        <div><label class="f">만점</label><input class="in num" type="number" data-f="maxScore" value="${t.maxScore}"></div>
        <div><label class="f">평가 방법</label><input class="in" style="width:120px" data-f="method" value="${esc(t.method || '')}"></div>
        <div><label class="f">시기</label><input class="in" style="width:110px" data-f="period" value="${esc(t.period || '')}"></div></div>
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
      <button class="btn sm soft" data-act="guide" data-id="${t.id}">${ICON.wand}AI 로 판단 기준·모범 답안 만들기</button></div>
    ${t.mode !== 'points' ? `<label class="f" style="margin-top:16px">점수 환산(충족 항목 수 → 점수)</label><div class="scale">${scale}<button class="btn sm" data-act="addscale">+</button></div>` : ''}
    <label class="f" style="margin-top:14px">특수 상황 점수(백지·미참여·결석 등)</label><div class="scale">${specials}<button class="btn sm" data-act="addspec">+</button></div>
  </div>
  <div class="card">
    <div class="sec-h">${ICON.pen}문항·정답 메모 (선택)</div>
    <div class="sub">문항 내용이나 정답 요지를 적어 두면 AI 채점이 더 정확해집니다. "AI 로 판단 기준 만들기"는 이 반의 첫 답안지 그림(이름 가림)을 문항지로 읽습니다.</div>
    <label class="f">선생님 메모</label><textarea class="in" rows="3" data-f="question" placeholder="예) 1번 정답: 펩신의 최적 pH 는 2, 소장은 약 8이라 활성을 잃는다.">${esc(t.question || '')}</textarea>
    <label class="f">모범 답안 요지(AI 가 채우고 고칠 수 있음)</label><textarea class="in" rows="4" data-f="answerKey">${esc(t.answerKey || '')}</textarea>
  </div>`;
}
function bindTaskInputs(t) {
  $$('[data-f]', view).forEach(el => {
    el.addEventListener('change', () => {
      const f = el.dataset.f, i = Number(el.dataset.i), v = el.value;
      const num = x => (x === '' ? 0 : Number(x));
      if (f === 'crit.text') t.criteria[i].text = v;
      else if (f === 'crit.guide') t.criteria[i].guide = v;
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
    <label class="f">답안 스캔 파일(PDF·그림, 여러 개 가능 — 번호 순서대로)</label>
    <div class="drop" id="cdrop">파일을 끌어 놓거나 눌러서 고르세요<div id="cfiles" class="small" style="margin-top:6px"></div></div>
    <input type="file" id="cfile" multiple accept=".pdf,image/*" class="hide">
    <p class="small muted">한 PDF 에 반 학생 답안이 번호 순서대로 들어 있으면, 학생당 쪽 수로 나눠 번호를 붙입니다. 다음 화면에서 미응시 번호와 나뉜 자리를 고칠 수 있습니다.</p>
    <div id="cprog" class="hide"><p id="cmsg" class="small"></p><div class="prog"><i></i></div></div>
    <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="cgo">올리기</button></div>`);
  let files = [];
  const pick = fs => { files = [...fs]; $('#cfiles').textContent = files.map(f => f.name).join(', '); };
  dropzone($('#cdrop'), $('#cfile'), pick);
  $('#cgo').onclick = async () => {
    const name = $('#cname').value.trim() || `반 ${task.classes.length + 1}`;
    const size = Math.max(1, Number($('#csize').value) || 30), per = Math.max(1, Number($('#cper').value) || 1);
    if (!files.length) { toast('답안 파일을 골라 주세요.'); return; }
    const cls = { id: uid(), name, size, perStudent: per, pages: [], starts: [], subs: [], masks: [], students: {}, createdAt: Date.now() };
    $('#cgo').disabled = true; $('#cprog').classList.remove('hide'); $('#modal').dataset.lock = '1';
    try {
      await addPages(cls, files, (msg, f) => { $('#cmsg').textContent = msg; $('#cprog .prog i').style.width = (f * 100) + '%'; });
      splitEvery(cls, per);
      task.classes.push(cls); save(true);
      delete $('#modal').dataset.lock; closeModal();
      location.hash = `#/k/${cls.id}/pages`;
    } catch (e) {
      delete $('#modal').dataset.lock; $('#cgo').disabled = false; toast('읽지 못했습니다: ' + e.message, 4000);
    }
  };
}
async function addPages(cls, files, onMsg, reuseIds) {
  let k = 0;
  for (const f of files) {
    await Parse.filePages(f, async pg => {
      const id = reuseIds ? reuseIds[k] : cls.id + ':' + uid();
      if (!id) { k++; return; }
      await DB.put('img', id, pg.blob); await DB.put('img', id + ':t', pg.thumb);
      urlCache.delete(id); urlCache.delete(id + ':t');
      if (!reuseIds) cls.pages.push({ id, w: pg.w, h: pg.h, skip: false });
      k++;
    }, (i, n) => onMsg(`${f.name} — ${i}/${n}쪽 그리는 중`, i / n));
  }
  return k;
}
function dropzone(zone, input, cb) {
  zone.onclick = () => input.click();
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
  const thumbs = cls.pages.map((p, i) => {
    const s = startNo[i];
    if (i === firstLive) return `<div class="th start">
      <img data-thumb="${p.id}:t" alt="" data-act="bigpage" data-i="${i}">${s ? `<span class="badge">${s.no}번</span>` : ''}
      <div class="tools"><button data-act="togskip" data-i="${i}">빼기</button></div>
      <div class="cap"><span>${i + 1}쪽</span>${s ? `<span>번호 <input class="ptinput" style="width:46px" type="number" value="${s.no}" data-act="setno" data-i="${i}"></span>` : ''}</div></div>`;
    return `<div class="th ${s ? 'start' : ''} ${p.skip ? 'skip' : ''}">
      <img data-thumb="${p.id}:t" alt="" data-act="bigpage" data-i="${i}">
      ${s ? `<span class="badge">${s.no}번</span>` : ''}
      <div class="tools">${p.skip ? '' : `<button data-act="togstart" data-i="${i}" title="이 쪽부터 다음 학생">${s ? '이어붙이기' : '새 학생'}</button>`}<button data-act="togskip" data-i="${i}">${p.skip ? '되살리기' : '빼기'}</button></div>
      <div class="cap"><span>${i + 1}쪽</span>${s ? `<span>번호 <input class="ptinput" style="width:46px" type="number" value="${s.no}" data-act="setno" data-i="${i}"></span>` : ''}</div>
    </div>`;
  }).join('');
  after = () => {
    loadThumbs();
    $$('[data-act="setno"]').forEach(el => el.addEventListener('change', () => {
      const s = startNo[Number(el.dataset.i)]; s.no = Number(el.value); s.fixed = true; rebuildSubs(cls); save(); rerender();
    }));
  };
  const imgMissing = cls.pages.length && !cls._imgChecked;
  if (imgMissing) { cls._imgChecked = true; DB.get('img', cls.pages[0].id + ':t').then(b => { if (!b) { cls._noimg = true; rerender(); } }); }
  return `
  <div class="row between" style="margin-bottom:14px"><div><div class="title">${esc(cls.name)} · 답안 나누기</div>
    <div class="sub">${esc(task.name)} · 전체 ${cls.pages.length}쪽 → 답안 ${cls.subs.length}개 / 학생 ${cls.size}명</div></div>
    <a class="btn primary" href="#/k/${cls.id}">채점하러 가기 →</a></div>
  ${cls._noimg ? `<div class="card note">이 브라우저에 쪽 그림이 없습니다(백업을 불러왔거나 저장소가 지워짐). 같은 PDF 를 다시 연결하세요. <button class="btn sm" data-act="relink" data-id="${cls.id}">PDF 다시 연결</button></div>` : ''}
  <div class="card">
    <div class="row" style="gap:16px;align-items:end">
      <div><label class="f">학생 수</label><input class="in num" type="number" id="psize" value="${cls.size}"></div>
      <div><label class="f">학생당 쪽 수</label><input class="in num" type="number" id="pper" value="${cls.perStudent}"></div>
      <button class="btn" data-act="resplit" data-id="${cls.id}">이대로 다시 나누기</button>
      <button class="btn" data-act="morefiles" data-id="${cls.id}">${ICON.up}파일 더 올리기</button>
      <button class="btn soft" data-act="masks" data-id="${cls.id}">${ICON.img}이름 칸 가리기 ${cls.masks.length ? `(${cls.masks.length}곳)` : '(아직 없음)'}</button>
      <button class="btn sm danger" data-act="delclass" data-id="${cls.id}" style="margin-left:auto">반 지우기</button>
    </div>
    <label class="f" style="margin-top:14px">미응시 번호 표시 — 답안이 없는 번호를 누르면 그 번호를 건너뛰고 다시 번호를 붙입니다</label>
    <div class="row" style="gap:6px">${nos.map(n => `<button class="chip ${absent.includes(n) ? 'gray on' : 'gray'}" data-act="togabsent" data-no="${n}">${n}</button>`).join('')}</div>
    ${missing.length ? `<p class="note" style="margin-top:12px">답안이 배정되지 않은 번호: ${missing.join(', ')} — 미제출로 처리됩니다. 미응시라면 위에서 표시하세요.</p>` : ''}
    ${over.length ? `<p class="note" style="margin-top:12px">학생 수보다 답안이 많습니다(${over.map(s => s.no + '번').join(', ')}). 학생당 쪽 수나 빼야 할 쪽(표지·빈 쪽)을 확인하세요.</p>` : ''}
    ${!cls.masks.length ? `<p class="note blue" style="margin-top:12px">AI 로 보내기 전에 <b>이름 칸 가리기</b>를 해 두세요. 첫 쪽의 학번·이름 칸을 한 번 그리면 모든 학생에게 똑같이 적용됩니다.</p>` : ''}
  </div>
  <div class="thumbs">${thumbs}</div>`;
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
      <p class="small muted">그림 위에서 끌어서 학번·이름 칸을 상자로 덮으세요. 같은 자리가 모든 학생에게 적용되고, AI 로 보낼 때만 검게 칠합니다(화면에는 원본이 보임).<br><b>스캔마다 위치가 조금씩 어긋나니 칸보다 넉넉하게 그리고, ‹ › 로 다른 번호도 넘겨 보며 이름이 덮이는지 확인하세요.</b></p>
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
    $('#msave').onclick = () => { cls.masks = masks; save(); closeModal(); rerender(); toast('가림 영역을 저장했습니다.'); };
  };
  draw();
}

/* ================= 반(학생 목록) 화면 ================= */
function vClass(kid) {
  const { course, task, cls } = findClass(kid); if (!cls) return '<div class="card empty">반을 찾을 수 없습니다.</div>';
  crumb([[course.name, '#/c/' + course.id], [task.name], [cls.name]]);
  let done = 0, ai = 0; const scores = [];
  const rows = Array.from({ length: cls.size }, (_, i) => i + 1).map(no => {
    const s = cls.students[no]; const st = statusOf(cls, no); const sub = subOf(cls, no);
    if (st === '채점 완료') done++; if (s && s.ai) ai++;
    const sc = scoreOf(task, s); if (sc != null && st === '채점 완료') scores.push(sc);
    const aisc = aiScoreOf(task, s);
    const b = s && s.seteuk ? App.bytes(s.seteuk) : 0;
    return `<tr class="click" data-go="#/g/${cls.id}/${no}">
      <td><b>${no}</b></td><td>${pillOf(st)}</td><td class="faint">${sub ? sub.pages.length + '쪽' : '-'}</td>
      <td class="r">${aisc == null ? '<span class="faint">-</span>' : aisc}</td>
      <td class="r"><b>${sc == null ? '<span class="faint">-</span>' : sc}</b></td>
      <td class="r">${b ? `<span class="${b > App.settings().byteMax ? 'pill bad' : 'pill ok'}">${b}B</span>` : '<span class="faint">-</span>'}</td>
      <td class="small muted" style="max-width:360px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s && s.seteuk || '')}</td></tr>`;
  }).join('');
  const avg = scores.length ? (sum(scores) / scores.length).toFixed(1) : '-';
  return `
  <div class="row between" style="margin-bottom:14px"><div><div class="title">${esc(cls.name)}</div>
    <div class="sub">${esc(task.name)} · ${task.maxScore}점 만점 · 채점 완료 ${done}/${cls.size}명 · AI 채점 ${ai}명 · 평균 ${avg}점</div></div>
    <div class="row"><a class="btn" href="#/k/${cls.id}/pages">${ICON.img}답안 나누기·이름 가리기</a>
      <button class="btn" data-act="xlsx" data-id="${cls.id}">${ICON.down}엑셀로 내보내기</button></div></div>
  <div class="card">
    <div class="row">
      <button class="btn primary" data-act="batchgrade" data-id="${cls.id}">${ICON.bot}AI 채점 한꺼번에</button>
      <button class="btn soft" data-act="batchseteuk" data-id="${cls.id}">${ICON.wand}세특 한꺼번에 만들기</button>
      <a class="btn" href="#/g/${cls.id}/${firstTodo(cls) || 1}">${ICON.pen}채점 화면 열기</a>
      <span class="small muted">AI 채점은 채점하지 않은 학생만 합니다. 세특은 점수가 정해졌고 세특이 빈 학생만 만듭니다.</span>
    </div>
    ${!cls.masks.length ? `<p class="note" style="margin-top:12px">이름 칸 가리기가 아직 없습니다. AI 로 보내기 전에 <a href="#/k/${cls.id}/pages">답안 나누기·이름 가리기</a>에서 설정하세요.</p>` : ''}
  </div>
  <div class="card scroll-x" style="padding:6px 10px"><table class="tb"><thead><tr><th>번호</th><th>상태</th><th>쪽</th><th class="r">AI 점수</th><th class="r">점수</th><th class="r">세특</th><th>세특 초안</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function firstTodo(cls) {
  for (let i = 1; i <= cls.size; i++) { const st = statusOf(cls, i); if (st === '채점 전' || st === 'AI 채점') return i; }
  return null;
}

/* ================= 채점 화면 ================= */
const G = { page: 0, zoom: 1, rot: 0, tab: 'img', showMask: false, aiTab: 'ana' };
let gctx = null;
function vGrade(kid, no) {
  const { course, task, cls } = findClass(kid); if (!cls) return '<div class="card empty">반을 찾을 수 없습니다.</div>';
  task._subject = course.name;
  crumb([[course.name, '#/c/' + course.id], [task.name], [cls.name, '#/k/' + cls.id], [no + '번']]);
  if (!gctx || gctx.kid !== kid || gctx.no !== no) { G.page = 0; G.rot = 0; }
  gctx = { kid, no, task, cls };
  const s = stu(cls, no); const sub = subOf(cls, no); const st = statusOf(cls, no);
  const done = Array.from({ length: cls.size }, (_, i) => i + 1).filter(i => { const x = statusOf(cls, i); return x === '채점 완료' || x === '미응시' || x === '미제출'; }).length;
  const opts = Array.from({ length: cls.size }, (_, i) => i + 1).map(i => `<option value="${i}" ${i === no ? 'selected' : ''}>${i}번 (${statusOf(cls, i)})</option>`).join('');
  const sc = scoreOf(task, s), aisc = aiScoreOf(task, s);
  const rng = [App.settings().byteMin, App.settings().byteMax];

  // 왼쪽: 제출물
  let left;
  if (!sub) left = `<div class="vpage"><div class="tr">${st === '미응시' ? '미응시로 표시된 학생입니다.' : '이 번호에 배정된 답안이 없습니다. <a href="#/k/' + cls.id + '/pages">답안 나누기</a>에서 확인하세요.'}</div></div>`;
  else if (G.tab === 'txt') left = `<div class="vpage"><div class="tr">${s.ai && s.ai.transcript ? esc(s.ai.transcript) : '<span class="muted">AI 채점을 하면 학생 답안을 글로 옮겨 보여 줍니다.</span>'}</div></div>`;
  else {
    G.page = Math.min(G.page, sub.pages.length - 1);
    left = `<div class="vbar">
        <button data-act="pg" data-d="-1">‹</button>${sub.pages.map((_, j) => `<button class="${j === G.page ? 'on' : ''}" data-act="pgset" data-i="${j}">${j + 1}</button>`).join('')}<button data-act="pg" data-d="1">›</button>
        <span style="opacity:.4">|</span><button data-act="rot" title="돌리기">⟳</button>
        <button data-act="zoom" data-d="0" title="맞춤">${Math.round(G.zoom * 100)}%</button><button data-act="zoom" data-d="0.15" title="크게">＋</button><button data-act="zoom" data-d="-0.15" title="작게">－</button>
        <span style="opacity:.4">|</span><button data-act="maskview" class="${G.showMask ? 'on' : ''}" title="AI 로 보내는 모습">가림 보기</button>
      </div>
      <div class="vpage" id="vpage"><div style="position:relative;display:inline-block" id="vwrap"><img id="vimg" alt="" style="width:${G.zoom * 100}%;transform:rotate(${G.rot}deg)"></div></div>`;
  }

  // 오른쪽: 채점
  const n = task.criteria.length;
  const crit = task.criteria.map((c, i) => {
    const a = s.ai && s.ai.criteria.find(x => x.index === i + 1);
    const checked = s.touched ? !!s.checks[i] : false;
    return `<div class="citem">
      ${task.mode === 'points' ? `<span class="faint" style="padding-top:2px">${i + 1}</span>` : `<input type="checkbox" data-act="chk" data-i="${i}" ${checked ? 'checked' : ''}>`}
      <div>${i + 1}. ${esc(c.text)}</div>
      <div class="row" style="gap:6px">${a ? `<span class="mark ${a.met ? 'y' : 'n'}" title="AI 판단">AI ${a.met ? '충족' : '미충족'}</span>` : ''}
        ${task.mode === 'points' ? `<input class="ptinput" type="number" step="0.5" min="0" max="${c.points}" value="${s.touched ? (s.pts[i] || 0) : ''}" data-act="pt" data-i="${i}"><span class="faint small">/${c.points}</span>` : ''}</div>
      ${a && (a.reason || a.evidence) ? `<div class="why">${a.evidence ? `<q>${esc(a.evidence)}</q><br>` : ''}${esc(a.reason || '')}</div>` : ''}
    </div>`;
  }).join('');
  const chips = scoreChoices(task).map(v => `<button class="chip ${sc === v && s.special == null ? 'on' : ''}" data-act="setscore" data-v="${v}">${v}</button>`).join('');
  const specs = (task.specials || []).map(x => `<button class="chip gray ${s.special === x.score ? 'on' : ''}" data-act="special" data-v="${x.score}" title="${esc(x.label)}">${esc(x.label.length > 10 ? x.label.slice(0, 10) + '…' : x.label)} ${x.score}</button>`).join('');
  const b = App.bytes(s.seteuk);
  const bcls = !s.seteuk ? '' : b > rng[1] ? 'over' : b < rng[0] ? 'under' : 'ok';
  const warns = s.seteuk ? lint(s.seteuk) : [];

  after = async () => {
    if (sub && G.tab === 'img') {
      const p = cls.pages[sub.pages[G.page]];
      $('#vimg').src = await imgURL(p.id);
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
    const memo = $('#tmemo'); if (memo) memo.addEventListener('input', () => { s.memo = memo.value; save(); });
    const se = $('#tset'); if (se) se.addEventListener('input', () => { s.seteuk = se.value; save(); updBytes(se.value); });
    $$('[data-act="pt"]').forEach(el => el.addEventListener('change', () => {
      if (!s.touched) { s.pts = Array(n).fill(0); s.checks = Array(n).fill(false); }
      s.pts[Number(el.dataset.i)] = Math.min(Number(el.max), Math.max(0, Number(el.value) || 0));
      s.touched = true; s.override = null; s.special = null; save(); rerender();
    }));
    $('#stusel').addEventListener('change', e => location.hash = `#/g/${kid}/${e.target.value}`);
  };
  return `
  <div class="ghead">
    <a class="btn sm" href="#/k/${cls.id}">${ICON.back}목록으로</a>
    <select class="in" id="stusel">${opts}</select>
    <span class="small muted">${ICON.check.replace('<svg', '<svg width="15" height="15" style="vertical-align:-3px"')} ${cls.size}명 중 ${done}명 처리</span>
    <span class="sp"></span>
    <button class="btn sm ghost" data-act="stu" data-d="-1" ${no <= 1 ? 'disabled' : ''}>‹ 이전 학생</button>
    <button class="btn sm ghost" data-act="stu" data-d="1" ${no >= cls.size ? 'disabled' : ''}>다음 학생 ›</button>
    <button class="btn primary" data-act="finish">${ICON.check}채점 완료</button>
  </div>
  <div class="gbody">
    <div class="viewer">
      <div class="vtabs"><button class="vtab ${G.tab === 'img' ? 'on' : ''}" data-act="vtab" data-t="img">${ICON.img.replace('<svg', '<svg width="15" height="15"')} 원본 제출물</button>
        <button class="vtab ${G.tab === 'txt' ? 'on' : ''}" data-act="vtab" data-t="txt">${ICON.list.replace('<svg', '<svg width="15" height="15"')} 인식 결과</button></div>
      ${left}
    </div>
    <div class="gside">
      <div class="gsec total">
        <b>총점 ${sc == null ? '-' : sc} / ${task.maxScore} 점</b>${aisc != null ? `<span class="pill ai">AI ${aisc}점</span>` : ''}${s.done ? '<span class="pill ok">채점 완료</span>' : ''}
        <div class="radios">${['', '미제출', '미응시'].map(v => `<label><input type="radio" name="stt" data-act="status" data-v="${v}" ${(s.status || '') === v ? 'checked' : ''}>${v || '채점 진행'}</label>`).join('')}</div>
      </div>
      <div class="gsec">
        <div class="sec-h">${ICON.check}채점 결과<span class="sp"></span><span class="small muted">${task.mode === 'points' ? '항목별 점수 입력' : '충족한 항목 체크(숫자키 1~' + Math.min(9, n) + ')'}</span></div>
        ${crit || '<p class="muted">채점 기준이 없습니다. <a href="#/t/' + task.id + '">채점 기준</a>을 먼저 넣으세요.</p>'}
        <div class="row" style="margin-top:12px;gap:6px">${chips}</div>
        ${specs ? `<div class="row" style="margin-top:8px;gap:6px">${specs}</div>` : ''}
        <div class="row" style="margin-top:12px;justify-content:flex-end">
          <button class="btn sm" data-act="resetscore">점수 초기화</button>
          <button class="btn sm" data-act="applyai" ${s.ai ? '' : 'disabled'}>${ICON.check}AI 점수 그대로 적용</button></div>
      </div>
      <div class="gsec">
        <div class="sec-h">${ICON.bot}AI 채점 근거 및 피드백</div>
        ${s.ai ? `
          ${s.ai.blank ? '<p class="note">AI 판단: 백지 또는 의미 있는 답이 거의 없음</p>' : ''}${s.ai.unreadable ? '<p class="note">AI 판단: 글씨가 흐리거나 잘려 판단이 어려움 — 원본을 직접 확인하세요</p>' : ''}
          <div class="small muted" style="margin-bottom:4px">학생용 피드백</div><div class="fb">${esc(s.ai.feedback || '')}</div>
          <div class="small muted" style="margin:10px 0 4px">관찰 요약(세특 재료)</div><div class="fb">${esc(s.ai.observation || '')}</div>
          <div class="row" style="margin-top:10px;justify-content:space-between"><span class="small faint">${esc(s.ai.model || '')} · ${new Date(s.ai.at).toLocaleString()}</span><button class="btn sm" data-act="aigrade">${ICON.bot}다시 채점</button></div>`
        : `<div class="aibox">AI 채점을 실행하면 학생 답안을 분석한<br>채점 근거와 피드백을 볼 수 있습니다.<br><br>
            <button class="btn primary" data-act="aigrade" ${sub ? '' : 'disabled'}>${ICON.wand}AI 채점 실행</button></div>`}
        <p class="small faint" style="margin:10px 0 0">AI 채점 결과는 틀릴 수 있습니다. 최종 점수는 선생님이 확인해 정합니다.</p>
      </div>
      <div class="gsec">
        <div class="sec-h">${ICON.doc}선생님 직접 피드백<span class="sp"></span>${s.ai && s.ai.feedback ? '<button class="btn sm" data-act="copyfb">AI 피드백 가져오기</button>' : ''}</div>
        <textarea class="in" id="tfb" rows="3" placeholder="학생에게 돌려줄 피드백(선택)">${esc(s.feedback)}</textarea>
      </div>
      <div class="gsec">
        <div class="sec-h">${ICON.grad}세특 초안 (이 수행평가 몫)</div>
        <label class="f" style="margin-top:0">선생님 관찰 메모(선택 — 수업 중 모습, 발표·태도 등. 세특에 반영됨)</label>
        <textarea class="in" id="tmemo" rows="2" style="min-height:52px" placeholder="예) 모둠 실험에서 변인 통제 방법을 먼저 제안함">${esc(s.memo)}</textarea>
        <div class="row" style="margin:10px 0 6px"><button class="btn soft" data-act="mkseteuk">${ICON.wand}${s.seteuk ? '다시 만들기' : '세특 만들기'}</button>
          <span class="bytes" id="bytes">${s.seteuk ? `공백 포함 ${[...s.seteuk].length}자 / <b class="${bcls}">${b} Byte</b>` : ''} (목표 ${rng[0]}~${rng[1]}B)</span></div>
        <textarea class="in" id="tset" rows="5" placeholder="세특 만들기를 누르면 채점 결과·답안·메모로 초안을 씁니다. 직접 고쳐도 됩니다.">${esc(s.seteuk)}</textarea>
        <ul class="warns" id="warns">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
      </div>
      <div class="gsec small faint">단축키: <span class="kbd">←</span><span class="kbd">→</span> 학생 이동 · <span class="kbd">1</span>~<span class="kbd">9</span> 기준 체크 · <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> 채점 완료 후 다음</div>
    </div>
  </div>`;
}
function updBytes(t) {
  const rng = [App.settings().byteMin, App.settings().byteMax];
  const b = App.bytes(t);
  const cls = !t ? '' : b > rng[1] ? 'over' : b < rng[0] ? 'under' : 'ok';
  const el = $('#bytes'); if (el) el.innerHTML = t ? `공백 포함 ${[...t].length}자 / <b class="${cls}">${b} Byte</b> (목표 ${rng[0]}~${rng[1]}B)` : `(목표 ${rng[0]}~${rng[1]}B)`;
  const w = $('#warns'); if (w) w.innerHTML = (t ? lint(t) : []).map(x => `<li>${esc(x)}</li>`).join('');
}

async function runAIGrade(task, cls, no, signal) {
  const sub = subOf(cls, no); if (!sub) throw new Error('답안이 없습니다.');
  const imgs = await aiImages(cls, sub);
  const r = await AI.grade(task, imgs, signal);
  const s = stu(cls, no);
  r.criteria = (r.criteria || []).map(c => ({ index: Number(c.index), met: !!c.met, points: Number(c.points) || 0, evidence: c.evidence || '', reason: c.reason || '' }));
  s.ai = Object.assign(r, { at: Date.now(), model: AI.isMock() ? '모의' : App.settings().model });
  if (!s.touched && s.special == null && s.override == null) applyAI(task, s);
  if (!s.feedback && r.feedback) s.feedback = r.feedback;
  save();
}
async function runSeteuk(task, cls, no, signal) {
  const s = stu(cls, no);
  const set = App.settings(); const rng = [set.byteMin, set.byteMax];
  const info = seteukInfo(task, s);
  let best = null, prev = null;
  for (let k = 0; k < 3; k++) {
    const r = await AI.seteuk(task, info, rng, prev, signal);
    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    const b = App.bytes(text);
    const dist = b > rng[1] ? b - rng[1] : b < rng[0] ? rng[0] - b : 0;
    if (!best || dist < best.dist) best = { text, b, dist };
    if (!dist) break;
    prev = { text, bytes: b };
  }
  s.seteuk = best.text; save();
  return best;
}

/* ================= 한꺼번에 ================= */
async function runBatch(title, items, fn) {
  const ctl = new AbortController();
  let ok = 0, fail = 0, i = 0;
  const log = [];
  modal(`<h2>${esc(title)}</h2><p id="bmsg">준비 중…</p><div class="prog"><i id="bbar"></i></div>
    <div id="blog" class="small muted" style="max-height:200px;overflow:auto;margin-top:10px"></div>
    <div class="foot"><button class="btn" id="bstop">멈추기</button></div>`);
  $('#modal').dataset.lock = '1';
  $('#bstop').onclick = () => ctl.abort();
  const upd = () => {
    $('#bmsg').textContent = `${ok + fail}/${items.length} 처리 (성공 ${ok}, 실패 ${fail})`;
    $('#bbar').style.width = (items.length ? (ok + fail) / items.length * 100 : 100) + '%';
    $('#blog').innerHTML = log.slice(-30).map(esc).join('<br>');
  };
  upd();
  const worker = async () => {
    while (i < items.length && !ctl.signal.aborted) {
      const it = items[i++];
      try { const m = await fn(it, ctl.signal); ok++; log.push(`${it}번 완료${m ? ' — ' + m : ''}`); }
      catch (e) { if (e.name === 'AbortError') break; fail++; log.push(`${it}번 실패: ${e.message}`); if (/키|한도|모델/.test(e.message)) ctl.abort(); }
      upd();
    }
  };
  await Promise.all([worker(), worker()]);
  delete $('#modal').dataset.lock;
  $('#bmsg').textContent = `${ctl.signal.aborted ? '멈춤 — ' : '끝 — '}성공 ${ok}, 실패 ${fail}`;
  $('#bstop').textContent = '닫기'; $('#bstop').onclick = () => { closeModal(); rerender(); };
  save(true);
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
    <label class="f">Gemini API 키</label>
    <div class="row" style="flex-wrap:nowrap"><input class="in" id="skey" type="password" value="${esc(s.apiKey)}" placeholder="AIza…" autocomplete="off"><button class="btn sm" id="sshow">보기</button></div>
    <div class="row" style="margin-top:8px"><a class="btn sm soft" href="${KEY_URL}" target="_blank" rel="noopener">API 키 발급받기 ↗</a>
      <button class="btn sm ghost" data-act="help" data-sec="key">발급 방법 보기</button></div>
    <p class="small muted" style="margin:6px 0 0">Google AI Studio 에서 무료로 만들 수 있습니다. 키는 이 브라우저에만 저장됩니다. 화면만 시험하려면 <b>mock</b> 이라고 넣으세요.</p>
    <label class="f">모델</label>
    <div class="row" style="flex-wrap:nowrap"><select class="in" id="smodel">${modelOptions(cachedModels(), s.model)}</select><button class="btn sm" id="stest">키 확인·최신 목록</button></div>
    <p class="small muted" id="stestmsg" style="margin:6px 0 0"></p>
    <div class="row" style="gap:12px;margin-top:6px">
      <div><label class="f">세특 최소 바이트</label><input class="in num" id="smin" type="number" value="${s.byteMin}"></div>
      <div><label class="f">세특 최대 바이트</label><input class="in num" id="smax" type="number" value="${s.byteMax}"></div>
    </div>
    <div class="note" style="margin-top:14px"><b>개인정보 안내</b><br>무료 키(결제 미등록)로 보낸 내용은 Google 이 서비스 개선에 쓸 수 있습니다. 반드시 <b>이름 칸 가리기</b>를 하고 보내세요. 학교 지침상 외부 AI 사용 허가가 필요한지도 확인하세요.</div>
    <div class="foot"><button class="btn" data-act="close">닫기</button><button class="btn primary" id="ssave">저장</button></div>`);
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
  $('#skey').addEventListener('change', () => test(true));
  $('#ssave').onclick = () => {
    App.saveSettings({ apiKey: $('#skey').value.trim(), model: $('#smodel').value || 'gemini-flash-latest', byteMin: Number($('#smin').value) || 250, byteMax: Number($('#smax').value) || 300 });
    closeModal(); rerender(); toast('저장했습니다.');
  };
}

/* ================= 도움말 ================= */
const HELP = [
  ['start', '처음 시작하기', `<ol>
    <li>오른쪽 위 <b>설정</b>에 Gemini API 키를 넣습니다(아래 'API 키 발급' 참고).</li>
    <li>처음 화면에 <b>평가계획서</b>(hwp·hwpx·pdf·txt)를 끌어 놓습니다. AI 가 수행평가 영역마다 채점 기준·점수 환산표·백지/결석 점수를 정리합니다.</li>
    <li>과목 화면의 <b>채점 기준 보기·고치기</b>에서 내용을 확인하고 필요하면 고칩니다.</li>
    <li><b>+ 반 추가</b>로 반 이름·학생 수·학생당 쪽 수와 답안 스캔 PDF 를 올립니다.</li>
    <li><b>이름 칸 가리기</b>를 한 뒤 <b>AI 채점 한꺼번에</b> → 학생마다 확인 → <b>세특 한꺼번에 만들기</b> → <b>엑셀로 내보내기</b>.</li></ol>`],
  ['key', 'API 키 발급 (무료)', `<ol>
    <li><a href="${KEY_URL}" target="_blank" rel="noopener"><b>Google AI Studio 키 발급 페이지 ↗</b></a>를 엽니다(구글 계정으로 로그인).</li>
    <li>처음이면 약관에 동의하고 <b>Create API key</b>(API 키 만들기)를 누릅니다. 프로젝트를 고르라고 하면 기본 프로젝트를 고르거나 새로 만듭니다.</li>
    <li>만들어진 키(<code>AIza…</code>로 시작)를 <b>복사</b>합니다.</li>
    <li>이 앱의 <b>설정</b> → API 키 칸에 붙여 넣고 <b>키 확인·최신 목록</b> → <b>저장</b>.</li></ol>
    <p class="small muted">무료 키는 분당·하루 사용량 한도가 있습니다. 한 반을 한꺼번에 채점하다 '사용량 한도'가 뜨면 잠시 뒤 이어서 하세요. AI Studio 에서 결제를 등록하면 한도가 크게 늘고 보낸 내용이 학습에 쓰이지 않습니다. 키는 비밀번호처럼 다른 사람과 나누지 마세요.</p>`],
  ['model', '모델 고르기', `<ul>
    <li><b>항상 최신 Flash</b>(추천): Google 이 새 Flash 모델을 내면 저절로 그 모델을 씁니다. 속도·정확도·무료 한도의 균형이 좋습니다.</li>
    <li><b>Pro</b>: 손글씨가 흐리거나 서술이 길 때 더 정확합니다. 느리고 무료 한도가 적습니다.</li>
    <li><b>Flash-Lite</b>: 가장 빠르지만 손글씨 인식은 약합니다.</li>
    <li>설정의 <b>키 확인·최신 목록</b>을 누르면 그 키로 쓸 수 있는 모델을 새 버전부터 보여 줍니다. 고른 모델이 없어지면 앱이 추천 모델로 바꿔 다시 시도합니다.</li></ul>`],
  ['class', '답안 나누기·이름 가리기', `<ul>
    <li>한 PDF 에 반 학생 답안이 번호 순서로 들어 있으면 <b>학생당 쪽 수</b>로 나눠 번호를 붙입니다.</li>
    <li>결시한 번호는 <b>미응시 번호</b>를 눌러 표시하면 그 번호를 건너뛰고 다시 번호를 붙입니다.</li>
    <li>쪽 위의 <b>새 학생 / 이어붙이기</b>로 나뉜 자리를, <b>빼기</b>로 표지·빈 쪽을, 번호 칸으로 번호를 직접 고칩니다.</li>
    <li><b>이름 칸 가리기</b>: 첫 쪽의 학번·이름 칸을 끌어서 상자로 덮습니다. 스캔마다 위치가 조금 다르니 <b>넉넉하게</b> 그리고 ‹ › 로 다른 번호도 확인하세요. 화면에는 원본이 보이고 AI 로 보낼 때만 검게 칠합니다(채점 화면의 '가림 보기'로 확인).</li></ul>`],
  ['grade', '채점하기', `<ul>
    <li>왼쪽 원본(또는 <b>인식 결과</b> = AI 가 옮겨 적은 답), 오른쪽에 채점 기준 체크와 점수.</li>
    <li><b>AI 채점 실행</b>: 기준마다 충족/미충족과 근거(학생 답 인용)를 보여 주고, 아직 손대지 않은 학생이면 체크를 미리 채워 둡니다. 최종 점수는 선생님이 확인해 <b>채점 완료</b>를 누릅니다.</li>
    <li>점수 단추(20·18…)로 바로 정하거나, 백지·결석 단추로 특수 점수를 줄 수 있습니다. <b>미제출/미응시</b>는 위쪽 동그라미로 고릅니다.</li>
    <li>단축키: <span class="kbd">←</span><span class="kbd">→</span> 학생 이동 · <span class="kbd">1</span>~<span class="kbd">9</span> 기준 체크 · <span class="kbd">Ctrl</span>+<span class="kbd">Enter</span> 채점 완료 후 다음 · <span class="kbd">?</span> 도움말.</li></ul>`],
  ['seteuk', '세특 초안', `<ul>
    <li>수행평가 한 개 몫으로 약 250~300바이트(설정에서 바꿈)를 씁니다. 바이트는 나이스 기준(한글 3, 영문·숫자·공백 1)으로 앱이 직접 셉니다.</li>
    <li>채점 결과·인식한 답안·AI 관찰 요약·<b>선생님 관찰 메모</b>를 재료로 씁니다. 메모에 수업 중 모습을 적으면 더 개별화됩니다.</li>
    <li>교사 관찰 시점(~함/~보임), 금지어(나의·내가·대회), 특수문자, 상호명, 학생 입장 종결어(~느낌·~깨달음)를 검사해 빨간 글씨로 알려 줍니다.</li>
    <li>과목 화면의 <b>반별 세특 모아보기</b>에서 수행평가별 문장을 이어 붙인 길이(1,500B 한도)를 볼 수 있습니다.</li></ul>`],
  ['save', '저장·옮기기·개인정보', `<ul>
    <li>모든 기록과 답안 그림은 <b>이 브라우저</b>에만 저장됩니다. 브라우저 기록 삭제·시크릿 창에서는 사라질 수 있습니다.</li>
    <li>다른 컴퓨터로 옮길 때: 처음 화면 <b>백업 저장</b> → 새 컴퓨터에서 <b>백업 불러오기</b> → 반 화면에서 같은 PDF 를 <b>다시 연결</b>(답안 그림은 백업에 들어가지 않음).</li>
    <li>AI 를 쓸 때만 가림 처리한 답안 그림과 채점 기준이 Google 로 전송됩니다.</li></ul>`],
  ['faq', '자주 나오는 문제', `<ul>
    <li><b>API 키가 맞지 않습니다</b>: 키 앞뒤 빈칸 없이 다시 복사해 넣으세요.</li>
    <li><b>사용량 한도</b>: 무료 한도를 다 썼습니다. 1분쯤 뒤 다시 하거나 Flash 모델로 바꾸세요.</li>
    <li><b>모델을 찾을 수 없음</b>: 설정에서 <b>키 확인·최신 목록</b>을 눌러 모델을 다시 고르세요.</li>
    <li><b>한글 파일을 못 읽음</b>: 배포용·암호 문서는 한글에서 PDF 로 저장해 올리세요.</li>
    <li><b>PDF 를 그림으로 바꾸는 게 느림</b>: 쪽이 많으면 1~2분 걸립니다. 다른 탭에 가 있어도 계속됩니다.</li></ul>`],
];
function helpModal(sec) {
  modal(`<h2>도움말</h2>
    <div class="row" style="gap:6px;margin-bottom:12px">${HELP.map(h => `<button class="chip ${h[0] === sec ? 'on' : ''}" data-hsec="${h[0]}">${esc(h[1])}</button>`).join('')}</div>
    <div class="help">${HELP.map(h => `<section id="h-${h[0]}"><h3>${esc(h[1])}</h3>${h[2]}</section>`).join('')}</div>
    <div class="foot"><button class="btn" data-act="close">닫기</button></div>`, true);
  $$('[data-hsec]').forEach(b => b.onclick = () => { $$('[data-hsec]').forEach(x => x.classList.toggle('on', x === b)); $('#h-' + b.dataset.hsec).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  if (sec) setTimeout(() => { const el = $('#h-' + sec); if (el) el.scrollIntoView({ block: 'start' }); }, 30);
}

/* ================= 엑셀 ================= */
function fname(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }
function xlsxClass(kid) {
  const { course, task, cls } = findClass(kid);
  const head = ['번호', '상태', ...task.criteria.map((c, i) => `기준${i + 1}`), 'AI 점수', '점수', '피드백', '세특', '세특 바이트'];
  const rows = [head];
  for (let no = 1; no <= cls.size; no++) {
    const s = cls.students[no] || {}; const st = statusOf(cls, no);
    const marks = task.criteria.map((c, i) => !s.touched ? '' : task.mode === 'points' ? (s.pts[i] || 0) : (s.checks[i] ? 'O' : 'X'));
    rows.push([no, st, ...marks, aiScoreOf(task, s) ?? '', scoreOf(task, s) ?? '', s.feedback || '', s.seteuk || '', s.seteuk ? App.bytes(s.seteuk) : '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = head.map((h, i) => ({ wch: h === '세특' || h === '피드백' ? 60 : i === 1 ? 10 : 8 }));
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
  close: closeModal,
  settings: settingsModal,
  help(el) { helpModal(el && el.dataset && el.dataset.sec); },
  theme() {
    const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('aigrader-theme', r.dataset.theme); } catch (e) {}
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
    for (const t of c.tasks) for (const k of t.classes) await DB.delPrefix('img', k.id + ':');
    S.courses = S.courses.filter(x => x !== c); save(true); location.hash = '#/';
  },
  addtask(el) { const c = findCourse(el.dataset.id); const t = newTask(); c.tasks.push(t); save(); location.hash = '#/t/' + t.id; },
  deltask(el) {
    const { course, task } = findTask(el.dataset.id);
    if (!confirm(`'${task.name}' 수행평가와 그 채점 기록을 지울까요?`)) return;
    task.classes.forEach(k => DB.delPrefix('img', k.id + ':'));
    course.tasks = course.tasks.filter(t => t !== task); save(); location.hash = '#/c/' + course.id;
  },
  addcrit() { const t = curTask(); t.criteria.push({ text: '', guide: '', points: 0 }); save(); rerender(); },
  delcrit(el) { const t = curTask(); t.criteria.splice(Number(el.dataset.i), 1); save(); rerender(); },
  addscale() { const t = curTask(); t.scale.push({ count: 0, score: 0 }); save(); rerender(); },
  delscale(el) { const t = curTask(); t.scale.splice(Number(el.dataset.i), 1); save(); rerender(); },
  addspec() { const t = curTask(); t.specials.push({ label: '백지 제출', score: 0 }); save(); rerender(); },
  delspec(el) { const t = curTask(); t.specials.splice(Number(el.dataset.i), 1); save(); rerender(); },
  async guide(el) {
    const { course, task } = findTask(el.dataset.id); task._subject = course.name;
    if (!task.criteria.length) { toast('채점 기준 항목을 먼저 넣어 주세요.'); return; }
    const k = task.classes.find(x => x.subs.length);
    modal(`<h2>판단 기준 만들기</h2><p>${k ? `${esc(k.name)} 첫 답안지(이름 가림)를 문항지로 읽고 ` : ''}채점 기준마다 판단 기준과 모범 답안 요지를 만드는 중…</p><div class="prog"><i style="width:60%"></i></div>`);
    try {
      const imgs = k ? await aiImages(k, k.subs[0]) : [];
      const r = await AI.makeGuide(task, imgs);
      (r.criteria || []).forEach(c => { const x = task.criteria[Number(c.index) - 1]; if (x && c.guide) x.guide = c.guide; });
      if (r.answerKey) task.answerKey = r.answerKey;
      save(); closeModal(); rerender(); toast('판단 기준을 채웠습니다. 읽어 보고 고쳐 주세요.', 3500);
    } catch (e) { closeModal(); toast(e.message, 4500); }
  },
  addclass(el) { addClassModal(el.dataset.id); },
  resplit(el) {
    const { cls } = findClass(el.dataset.id);
    cls.size = Math.max(1, Number($('#psize').value) || cls.size);
    splitEvery(cls, Math.max(1, Number($('#pper').value) || 1)); save(); rerender();
  },
  togstart(el) {
    const { cls } = gPages(); const i = Number(el.dataset.i);
    const firstLive = cls.pages.findIndex(p => !p.skip);
    if (i === firstLive) return;
    if (cls.starts.includes(i)) cls.starts = cls.starts.filter(x => x !== i); else cls.starts.push(i);
    rebuildSubs(cls); save(); rerender();
  },
  togskip(el) { const { cls } = gPages(); const p = cls.pages[Number(el.dataset.i)]; p.skip = !p.skip; rebuildSubs(cls); save(); rerender(); },
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
  async delclass(el) {
    const { task, cls } = findClass(el.dataset.id);
    if (!confirm(`'${cls.name}' 반의 답안 그림과 채점 기록을 모두 지울까요?`)) return;
    await DB.delPrefix('img', cls.id + ':');
    task.classes = task.classes.filter(k => k !== cls); save(true); location.hash = '#/t/' + task.id;
  },
  batchgrade(el) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (!App.settings().apiKey) { settingsModal(); return; }
    if (!cls.masks.length && !confirm('이름 칸 가리기를 하지 않았습니다. 그래도 답안을 그대로 AI 로 보낼까요?')) return;
    const items = []; for (let no = 1; no <= cls.size; no++) { const s = cls.students[no]; const st = statusOf(cls, no); if (st === '채점 전') items.push(no); }
    if (!items.length) { toast('AI 채점할 학생이 없습니다(모두 채점했거나 답안이 없음).'); return; }
    runBatch(`AI 채점 — ${items.length}명`, items, async (no, sig) => { await runAIGrade(task, cls, no, sig); return 'AI ' + aiScoreOf(task, cls.students[no]) + '점'; });
  },
  batchseteuk(el) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (!App.settings().apiKey) { settingsModal(); return; }
    const items = []; for (let no = 1; no <= cls.size; no++) { const s = cls.students[no]; const st = statusOf(cls, no); if (s && !s.seteuk && (st === '채점 완료' || st === 'AI 채점')) items.push(no); }
    if (!items.length) { toast('세특을 만들 학생이 없습니다(채점된 학생 중 세특이 빈 학생만 만듭니다).'); return; }
    runBatch(`세특 만들기 — ${items.length}명`, items, async (no, sig) => { const r = await runSeteuk(task, cls, no, sig); return r.b + 'B'; });
  },
  xlsx(el) { xlsxClass(el.dataset.id); },
  xlsxall(el) { xlsxAll(el.dataset.id, el.dataset.n); },
  // ---- 채점 화면
  vtab(el) { G.tab = el.dataset.t; rerender(); },
  pg(el) { const sub = subOf(gctx.cls, gctx.no); G.page = Math.max(0, Math.min(sub.pages.length - 1, G.page + Number(el.dataset.d))); rerender(); },
  pgset(el) { G.page = Number(el.dataset.i); rerender(); },
  rot() { G.rot = (G.rot + 90) % 360; rerender(); },
  zoom(el) { const d = Number(el.dataset.d); G.zoom = d ? Math.max(0.4, Math.min(3, G.zoom + d)) : 1; rerender(); },
  maskview() { G.showMask = !G.showMask; rerender(); },
  stu(el) { const n = gctx.no + Number(el.dataset.d); if (n >= 1 && n <= gctx.cls.size) location.hash = `#/g/${gctx.kid}/${n}`; },
  status(el) {
    const s = stu(gctx.cls, gctx.no); s.status = el.dataset.v;
    if (s.status === '미응시' && subOf(gctx.cls, gctx.no)) toast('이 번호에 답안이 배정돼 있습니다. 답안 나누기에서 번호를 확인하세요.', 4000);
    save(); rerender();
  },
  chk(el) {
    const { task, cls, no } = gctx; const s = stu(cls, no); const n = task.criteria.length;
    if (!s.touched) { s.checks = Array(n).fill(false); s.pts = Array(n).fill(0); }
    s.checks[Number(el.dataset.i)] = el.checked; s.touched = true; s.override = null; s.special = null; save(); rerender();
  },
  setscore(el) { const s = stu(gctx.cls, gctx.no); s.override = Number(el.dataset.v); s.special = null; save(); rerender(); },
  special(el) { const s = stu(gctx.cls, gctx.no); const v = Number(el.dataset.v); s.special = s.special === v ? null : v; save(); rerender(); },
  resetscore() { const s = stu(gctx.cls, gctx.no); Object.assign(s, { checks: [], pts: [], touched: false, override: null, special: null, done: false }); save(); rerender(); },
  applyai() { const s = stu(gctx.cls, gctx.no); applyAI(gctx.task, s); save(); rerender(); toast('AI 판단을 적용했습니다.'); },
  copyfb() { const s = stu(gctx.cls, gctx.no); s.feedback = s.ai.feedback; save(); rerender(); },
  async aigrade(el) {
    const { task, cls, no } = gctx;
    if (!App.settings().apiKey) { settingsModal(); return; }
    if (!cls.masks.length && !confirm('이름 칸 가리기를 하지 않았습니다. 답안을 그대로 AI 로 보낼까요?')) return;
    el.disabled = true; el.innerHTML = 'AI 가 답안을 읽는 중… (10~40초)';
    try { await runAIGrade(task, cls, no); if (gctx && gctx.no === no) rerender(); toast(`${no}번 AI 채점: ${aiScoreOf(task, cls.students[no])}점`); }
    catch (e) { toast(e.message, 5000); el.disabled = false; el.textContent = 'AI 채점 실행'; }
  },
  async mkseteuk(el) {
    const { task, cls, no } = gctx;
    if (!App.settings().apiKey) { settingsModal(); return; }
    const s = stu(cls, no);
    if (!s.touched && !s.ai && s.special == null && s.override == null) { toast('먼저 채점하거나 AI 채점을 실행해 주세요.'); return; }
    el.disabled = true; el.textContent = '세특 쓰는 중…';
    try { const r = await runSeteuk(task, cls, no); if (gctx && gctx.no === no) rerender(); toast(`세특 ${r.b}바이트${r.dist ? ' — 목표 범위를 벗어나 직접 다듬어 주세요' : ''}`, 3500); }
    catch (e) { toast(e.message, 5000); el.disabled = false; el.textContent = '세특 만들기'; }
  },
  finish() {
    const { task, cls, no } = gctx; const s = stu(cls, no);
    if (scoreOf(task, s) == null && !s.status) { toast('점수를 정하거나 미제출·미응시를 고르세요.'); return; }
    s.done = true; save();
    const next = (() => { for (let i = no + 1; i <= cls.size; i++) { const st = statusOf(cls, i); if (st === '채점 전' || st === 'AI 채점') return i; } return null; })();
    if (next) location.hash = `#/g/${cls.id}/${next}`; else { rerender(); toast('마지막 학생까지 채점했습니다.'); }
  },
  // ---- 백업
  backup() {
    const blob = new Blob([JSON.stringify({ app: 'ai-grader', v: 1, savedAt: new Date().toISOString(), state: S }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ai-grader-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    toast('채점 기록을 저장했습니다(답안 그림은 빠짐).');
  },
  restore() {
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
function filePick(more, kid) {
  const { cls } = findClass(kid);
  const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.pdf,image/*';
  inp.onchange = async () => {
    modal(`<h2>${more ? '파일 더 올리기' : 'PDF 다시 연결'}</h2><p id="fmsg" class="small"></p><div class="prog"><i id="fbar"></i></div>`);
    $('#modal').dataset.lock = '1';
    try {
      const n = await addPages(cls, [...inp.files], (m, f) => { $('#fmsg').textContent = m; $('#fbar').style.width = f * 100 + '%'; }, more ? null : cls.pages.map(p => p.id));
      if (more) rebuildSubs(cls);
      else { cls._noimg = false; if (n !== cls.pages.length) toast(`쪽 수가 다릅니다(원래 ${cls.pages.length}쪽, 올린 파일 ${n}쪽). 같은 파일인지 확인하세요.`, 5000); }
      save(true);
    } catch (e) { toast(e.message, 4000); }
    delete $('#modal').dataset.lock; closeModal(); rerender();
  };
  inp.click();
}

document.addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  const a = e.target.closest('[data-act]');
  if (a && a.tagName !== 'INPUT' || a && a.type === 'checkbox' || a && a.type === 'radio') {
    const fn = ACT[a.dataset.act];
    if (fn) { if (a.tagName === 'BUTTON') a.blur(); fn(a, e); return; }
  }
  if (go && !e.target.closest('a,button,input,select,textarea')) location.hash = go.dataset.go;
});
document.addEventListener('keydown', e => {
  if (e.key === '?' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && $('#modal').classList.contains('hide')) { helpModal(); return; }
  if (!location.hash.startsWith('#/g/') || !gctx) { if (e.key === 'Escape') closeModal(); return; }
  if (!$('#modal').classList.contains('hide')) { if (e.key === 'Escape') closeModal(); return; }
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox' && document.activeElement.type !== 'radio';
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); ACT.finish(); return; }
  if (typing) return;
  if (e.key === 'ArrowLeft') ACT.stu({ dataset: { d: -1 } });
  else if (e.key === 'ArrowRight') ACT.stu({ dataset: { d: 1 } });
  else if (/^[1-9]$/.test(e.key)) {
    const box = $(`[data-act="chk"][data-i="${Number(e.key) - 1}"]`);
    if (box) { box.checked = !box.checked; ACT.chk(box); }
  }
});

/* ================= 시작 ================= */
(async () => {
  try { const th = localStorage.getItem('aigrader-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  try { const st = await DB.get('kv', 'state'); if (st && st.courses) S = st; }
  catch (e) { toast('저장소를 열 수 없습니다(사생활 보호 창?). 이 창을 닫으면 기록이 사라집니다.', 6000); }
  route();
})();
