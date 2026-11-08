// AI 서논술형 채점 — 화면과 데이터
'use strict';

/* ================= 설정 ================= */
const App = (() => {
  const KEY = 'aigrader-settings';
  const DEF = { apiKey: '', model: 'gemini-flash-latest', byteMin: 250, byteMax: 300 };
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
function seteukInfo(task, s) {
  const L = [];
  const sc = scoreOf(task, s);
  L.push(`받은 점수: ${sc == null ? '미정' : sc}/${task.maxScore}`);
  const met = [], unmet = [];
  task.criteria.forEach((c, i) => {
    const ok = s.touched ? !!s.checks[i] : !!(s.ai && (s.ai.criteria.find(x => x.index === i + 1) || {}).met);
    (ok ? met : unmet).push(c.text);
  });
  L.push(`성취 수준: ${levelOf(task, s)}${s.special != null ? '(특수 상황)' : ''} (채점 기준 ${task.criteria.length}개 중 ${met.length}개 충족)`);
  L.push('충족한 채점 기준: ' + (met.join(' / ') || '없음'));
  L.push('충족하지 못한 채점 기준(세특에 쓰지 않음, 참고만): ' + (unmet.join(' / ') || '없음'));
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
function lint(t) {
  const w = [];
  const fw = t.match(/나의|나만의|내가|대회/g); if (fw) w.push('쓰면 안 되는 말: ' + [...new Set(fw)].join(', '));
  if (/수행평가/.test(t)) w.push("'수행평가' 대신 '~활동에서는', '~에서는'으로");
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
function matchQ(...texts) { const q = F.q.trim().toLowerCase(); if (!q) return true; return texts.some(t => String(t || '').toLowerCase().includes(q)); }

function renderSide() {
  const ctx = curCtx(), open = sideOpen();
  const nStu = sum(S.courses.flatMap(c => c.tasks.flatMap(t => t.classes.map(k => k.size))));
  const tree = S.courses.map(c => {
    const tasks = c.tasks.map(t => {
      const cls = t.classes.map(k => `<a class="subj l2 ${ctx.cls === k ? 'on' : ''}" href="#/k/${k.id}"><span class="nm">${esc(k.name)}</span><b>${doneCount(k)}/${k.size}</b></a>`).join('');
      const tOn = ctx.task === t && !ctx.cls;
      return `<a class="subj l1 ${tOn ? 'on' : ''}" href="#/t/${t.id}" title="채점 기준">${ic('task')}<span class="nm">${esc(t.name)}</span><b>${t.classes.length ? t.classes.length + '반' : ''}</b></a>${cls}<button class="subj l2 addk2" data-act="addclass" data-id="${t.id}">+ 반 추가</button>`;
    }).join('');
    const cOn = ctx.kind === 'c' && ctx.course === c;
    return `<a class="subj ${cOn ? 'on' : ''}" href="#/c/${c.id}">${ic('book')}<span class="nm">${esc(c.name)}</span><b>${c.tasks.length}</b></a>${tasks}`;
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
      <div class="foot">판 ${esc(window.APP_VERSION || '')} · <a href="privacy.html" target="_blank">개인정보 처리방침</a></div></div>
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
}
function scope(parts) {
  $('#scope').innerHTML = parts.length
    ? parts.map((p, i) => i === parts.length - 1 ? `${esc(p[0])}` : `<a href="${p[1] || '#/'}">${esc(p[0])}</a> <span>›</span> `).join('')
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
    const meta = [c.year && c.year + '학년도', c.grade && c.grade + '학년', c.semester && c.semester + '학기'].filter(Boolean).join(' ');
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
  return `<div class="tk">
    <div class="tk-h"><div><div class="tk-t">${esc(t.name)}</div><div class="tk-m">${t.maxScore}점 · 기준 ${t.criteria.length}개</div></div>
      <a class="ibtn" href="#/t/${t.id}" title="채점 기준 보기·고치기">${ic('task')}</a></div>
    ${ks || '<div class="tk-empty">답안을 올릴 반을 추가하세요</div>'}
    <button class="addk" data-act="addclass" data-id="${t.id}">+ 반 추가</button></div>`;
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
    const r = await AI.extractPlan(send, n => { got = n; phase = ''; }, (s, alt, why) => { got = 0; phase = alt ? (why === 'broken' ? ` · 답이 깨져 ${alt} 로 다시 받는 중` : why === 'slow' ? ` · 답이 늦어 더 빠른 ${alt} 로 바꿈` : ` · 서버가 바빠 ${alt} 로 바꿔 시도`) : ` · 서버가 바빠 ${s}초 뒤 다시 시도`; });
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
  const meta = [c.year && c.year + '학년도', c.grade && c.grade + '학년', c.semester && c.semester + '학기'].filter(Boolean).join(' ');
  return `
  <div class="phead"><div class="pt"><h1>${esc(c.name)}</h1><div class="sub">${esc(meta)}</div></div>
    <details class="menu"><summary class="btn">${ic('more')}</summary><div class="mlist">
      <button data-act="renamecourse" data-id="${c.id}">${ic('pen')}이름 바꾸기</button>
      ${c.planText ? `<button data-act="showplan" data-id="${c.id}">${ic('task')}계획서 글 보기</button>` : ''}
      <button data-act="addtask" data-id="${c.id}">${ic('plus')}수행평가 직접 추가</button>
      <button class="danger" data-act="delcourse" data-id="${c.id}">${ic('trash')}과목 지우기</button></div></details></div>
  <div class="tks">${c.tasks.map(t => taskCard(t)).join('') || '<div class="empty">수행평가가 없어요.</div>'}</div>
  ${names.length ? `<div class="sec-h" style="margin-top:22px">${ICON.grad}반별 세특 모아보기</div>
    <div class="row">${names.map(n => `<a class="btn sm" href="#/s/${c.id}/${encodeURIComponent(n)}">${esc(n)}</a>`).join('')}</div>` : ''}`;
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
    <div class="row"><button class="btn danger sm" data-act="deltask" data-id="${t.id}">수행평가 지우기</button><a class="btn primary" href="#/c/${course.id}">완료</a></div></div>
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
      <button class="btn sm soft" data-act="guide" data-id="${t.id}">${ICON.wand}AI 로 판단 기준 ${hasGuide(t) ? '다시 ' : ''}만들기</button>
      <span class="small muted">${hasGuide(t) ? '' : '비어 있으면 첫 AI 채점 때 자동으로 만들어요'}</span></div>
    <label class="f" style="margin-top:16px">AI 채점 기준</label>
    <div class="row">${strictSeg(t)}<span class="small muted">${STRICT_NOTE[t.strict || '보통']}</span></div>
    ${t.mode !== 'points' ? `<label class="f" style="margin-top:16px">점수 환산(충족 항목 수 → 점수)</label><div class="scale">${scale}<button class="btn sm" data-act="addscale">+</button></div>` : ''}
    <label class="f" style="margin-top:14px">특수 상황 점수(백지·미참여·결석 등)</label><div class="scale">${specials}<button class="btn sm" data-act="addspec">+</button></div>
  </div>
  <div class="card">
    <div class="sec-h">${ICON.pen}정답 메모 <span class="faint small">(선택)</span></div>
    <div class="sub">정답 요지를 적어 두면 AI 채점이 더 정확해져요.</div>
    <label class="f">선생님 메모</label><textarea class="in" rows="3" data-f="question" placeholder="예) 1번 정답: 펩신의 최적 pH 는 2, 소장은 약 8이라 활성을 잃는다.">${esc(t.question || '')}</textarea>
    <label class="f">모범 답안 요지</label><textarea class="in" rows="4" data-f="answerKey">${esc(t.answerKey || '')}</textarea>
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
      <button class="btn" data-act="morefiles" data-id="${cls.id}">${ICON.up}파일 더 올리기</button>
      <button class="btn soft" data-act="masks" data-id="${cls.id}">${ICON.img}이름 칸 가리기 ${cls.masks.length ? `(${cls.masks.length}곳)` : '(아직 없음)'}</button>
      <button class="btn sm danger" data-act="delclass" data-id="${cls.id}" style="margin-left:auto">반 지우기</button>
    </div>
    <label class="f" style="margin-top:14px">미응시 번호 <span class="faint">— 누르면 그 번호를 건너뛰어요</span></label>
    <div class="row" style="gap:6px">${nos.map(n => `<button class="chip ${absent.includes(n) ? 'gray on' : 'gray'}" data-act="togabsent" data-no="${n}">${n}</button>`).join('')}</div>
    ${missing.length ? `<p class="note" style="margin-top:12px">답안 없는 번호: ${missing.join(', ')} (미제출로 처리)</p>` : ''}
    ${over.length ? `<p class="note" style="margin-top:12px">답안이 학생 수보다 많아요(${over.map(s => s.no + '번').join(', ')}). 쪽 수나 빼야 할 쪽을 확인하세요.</p>` : ''}
    ${!cls.masks.length ? `<p class="note blue" style="margin-top:12px">AI 로 보내기 전에 <b>이름 칸 가리기</b>를 해 주세요.</p>` : ''}
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
    $('#msave').onclick = () => { cls.masks = masks; save(); closeModal(); rerender(); toast('가림 영역을 저장했습니다.'); };
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
  const max = App.settings().byteMax;
  const rows = nos.map(no => {
    const s = cls.students[no]; const st = statusOf(cls, no); const sub = subOf(cls, no);
    const sc = scoreOf(task, s), aisc = aiScoreOf(task, s);
    const b = s && s.seteuk ? App.bytes(s.seteuk) : 0;
    return `<a class="item stu" href="#/g/${cls.id}/${no}">
      <span class="no">${no}</span><span>${pillOf(st)}</span>
      <span class="sc">${sc == null ? '<span class="faint">-</span>' : sc}${aisc != null && aisc !== sc ? `<small class="faint"> AI ${aisc}</small>` : ''}</span>
      <span class="pv">${s && s.seteuk ? esc(s.seteuk) : `<span class="faint">${sub ? '' : '답안 없음'}</span>`}</span>
      <span class="r">${b ? `<span class="bt ${b > max ? 'bad' : ''}">${b}B</span><button class="ibtn" data-act="copyset" data-kid="${cls.id}" data-no="${no}" title="세특 복사">${ic('copy')}</button>` : ''}</span></a>`;
  }).join('');
  const nextTodo = firstTodo(cls);
  const pct = v => (v / cls.size * 100).toFixed(2) + '%';
  const TABL = { '': '전체', 'AI 채점': '확인 필요' };
  return `
  <div class="phead">
    <div class="pt"><h1>${esc(cls.name)}</h1><div class="sub">${esc(task.name)} · ${task.maxScore}점${avg ? ` · 평균 ${avg}점` : ''}</div></div>
    ${nextTodo ? `<a class="btn primary lg" href="#/g/${cls.id}/${nextTodo}">${ic('play')}${statusOf(cls, nextTodo) === 'AI 채점' ? '확인' : '채점'} 이어 하기 · ${nextTodo}번</a>`
      : `<a class="btn lg" href="#/g/${cls.id}/1">${ic('check')}채점 끝 · 다시 보기</a>`}
  </div>
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
      <a href="#/k/${cls.id}/pages">${ICON.img}답안 나누기 · 이름 가리기</a>
      <a href="#/t/${task.id}">${ic('task')}채점 기준</a>
      <button data-act="regrade" data-id="${cls.id}">${ic('bot')}AI 채점 다시…</button>
      <button data-act="reseteuk" data-id="${cls.id}">${ICON.wand}세특 다시 쓰기…</button>
      <button data-act="copyall" data-id="${cls.id}">${ic('copy')}세특 모두 복사</button>
      <button data-act="xlsx" data-id="${cls.id}">${ic('down')}엑셀로 내보내기</button></div></details>
  </div>
  <div class="tabs">${STATUS.map(([v, l]) => `<button class="tab ${F.status === v ? 'on' : ''}" data-act="fstatus" data-v="${esc(v)}">${TABL[v] || l}<b>${n[v]}</b></button>`).join('')}
    <span class="sp"></span>
    <select class="mini" data-act-change="fsort" title="순서"><option value="no" ${F.sort === 'no' ? 'selected' : ''}>번호순</option><option value="score" ${F.sort === 'score' ? 'selected' : ''}>점수순</option><option value="ai" ${F.sort === 'ai' ? 'selected' : ''}>AI 점수순</option></select></div>
  ${F.q ? `<div class="stat">'${esc(F.q)}' 찾는 중 · ${nos.length}명 <button class="btn sm ghost" data-act="fclear">풀기</button></div>` : ''}
  <div class="list">${rows || '<div class="empty">해당 학생이 없어요.</div>'}</div>`;
}

function firstTodo(cls) {
  for (let i = 1; i <= cls.size; i++) { const st = statusOf(cls, i); if (st === '채점 전' || st === 'AI 채점') return i; }
  return null;
}

/* ================= 채점 화면 ================= */
const G = { page: 0, zoom: 1, rot: 0, tab: 'img', showMask: false, why: false, aiOpen: false, openQ: null, addMark: null, navIds: null, navKid: '' };
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
  const rng = [App.settings().byteMin, App.settings().byteMax];

  // 왼쪽: 제출물
  let left;
  if (!sub) left = `<div class="vpage"><div class="tr">${st === '미응시' ? '미응시로 표시된 학생입니다.' : '이 번호에 배정된 답안이 없습니다. <a href="#/k/' + cls.id + '/pages">답안 나누기</a>에서 확인하세요.'}</div></div>`;
  else if (G.tab === 'txt') left = qstripHTML(s) + `<div class="vpage"><div class="tr">${s.ai && s.ai.transcript ? esc(s.ai.transcript) : '<span class="muted">AI 채점을 하면 답안을 글로 옮겨 보여 줘요.</span>'}</div></div>`;
  else {
    G.page = Math.min(G.page, sub.pages.length - 1);
    left = qstripHTML(s) + `<div class="vbar">
        <button data-act="pg" data-d="-1">‹</button>${sub.pages.map((_, j) => `<button class="${j === G.page ? 'on' : ''}" data-act="pgset" data-i="${j}">${j + 1}</button>`).join('')}<button data-act="pg" data-d="1">›</button>
        <span style="opacity:.4">|</span><button data-act="rot" title="돌리기">⟳</button>
        <button data-act="zoom" data-d="0" title="화면에 맞춤">${Math.round(G.zoom * 100)}%</button><button data-act="zoom" data-d="0.15" title="크게">＋</button><button data-act="zoom" data-d="-0.15" title="작게">－</button>
        <span style="opacity:.4">|</span><button data-act="qadd" class="${G.addMark != null ? 'on' : ''}" title="문항 표시 더하기 — 누른 뒤 답안지에서 자리를 누르세요">${ic('plus')}표시</button>
        <button data-act="maskview" class="${G.showMask ? 'on' : ''}" title="AI 로 보내는 모습(이름 가림)">${ic('eye')}</button>
      </div>
      <div class="vpage" id="vpage"><div style="position:relative;display:inline-block" id="vwrap"><img id="vimg" alt="" style="width:${G.zoom * 100}%;transform:rotate(${G.rot}deg)"></div></div>`;
  }

  // 오른쪽: 채점
  const n = task.criteria.length;
  const crit = task.criteria.map((c, i) => {
    const a = s.ai && s.ai.criteria.find(x => x.index === i + 1);
    const checked = s.touched ? !!s.checks[i] : false;
    return `<label class="citem">
      ${task.mode === 'points' ? `<span class="cno">${i + 1}</span>` : `<input type="checkbox" data-act="chk" data-i="${i}" ${checked ? 'checked' : ''}>`}
      <span class="ct">${task.mode === 'points' ? '' : `<span class="cno">${i + 1}</span>`}${esc(c.text)}</span>
      <span class="row" style="gap:6px">${a ? `<span class="mark ${a.met ? 'y' : 'n'}" title="AI 판단">${a.met ? 'AI ✓' : 'AI ✗'}</span>` : ''}
        ${task.mode === 'points' ? `<input class="ptinput" type="number" step="0.5" min="0" max="${c.points}" value="${s.touched ? (s.pts[i] || 0) : ''}" data-act="pt" data-i="${i}"><span class="faint small">/${c.points}</span>` : ''}</span>
      ${G.why && a && (a.reason || a.evidence) ? `<span class="why">${a.evidence ? `<q>${esc(a.evidence)}</q> ` : ''}${esc(a.reason || '')}</span>` : ''}
    </label>`;
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
    const memo = $('#tmemo'); if (memo) memo.addEventListener('input', () => { s.memo = memo.value; save(); });
    const se = $('#tset'); if (se) se.addEventListener('input', () => { s.seteuk = se.value; save(); updBytes(se.value); });
    const ad = $('#aidet'); if (ad) ad.addEventListener('toggle', () => { G.aiOpen = ad.open; });
    $$('[data-act="pt"]').forEach(el => el.addEventListener('change', () => {
      if (!s.touched) { s.pts = Array(n).fill(0); s.checks = Array(n).fill(false); }
      s.pts[Number(el.dataset.i)] = Math.min(Number(el.max), Math.max(0, Number(el.value) || 0));
      s.touched = true; s.override = null; s.special = null; save(); rerender();
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
        <button class="vtab ${G.tab === 'txt' ? 'on' : ''}" data-act="vtab" data-t="txt">AI 가 읽은 글</button></div>
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
        <div class="sec-h">채점 기준<span class="sp"></span>${s.ai ? `<button class="lnk" data-act="why">${G.why ? '근거 숨기기' : 'AI 근거 보기'}</button>` : ''}</div>
        ${crit || `<p class="muted">채점 기준이 없어요. <a href="#/t/${task.id}">넣기</a></p>`}
        <div class="row" style="margin-top:12px;gap:6px">${chips}${specs}</div>
        <div class="row" style="margin-top:10px;justify-content:flex-end;gap:6px">
          ${s.ai ? `<button class="btn sm" data-act="applyai">AI 점수 적용</button>` : ''}<button class="btn sm ghost" data-act="resetscore">초기화</button></div>
      </div>
      <div class="gsec">
        ${s.ai ? `<div class="sec-h" style="margin-bottom:6px">${ic('bot')}AI 판단<span class="faint small" style="font-weight:400">${s.ai.strict ? esc(s.ai.strict) + ' · ' : ''}${new Date(s.ai.at).toLocaleDateString()}</span><span class="sp"></span>
            <button class="btn sm" data-act="aigrade" title="${s.done ? '채점 완료한 학생은 점수 그대로, AI 판단만 새로' : '새 AI 판단으로 체크를 바꿔요'}">${ICON.bot}다시 채점</button></div>
          <details class="aid" id="aidet" ${G.aiOpen ? 'open' : ''}><summary><span class="small muted">피드백 · 관찰 보기</span></summary>
            ${s.ai.blank ? '<p class="note">백지 또는 답이 거의 없음</p>' : ''}${s.ai.unreadable ? '<p class="note">글씨가 흐리거나 잘림 — 원본 확인</p>' : ''}
            <div class="fb">${esc(s.ai.feedback || '')}</div>
            <div class="small muted" style="margin:8px 0 4px">관찰 요약</div><div class="fb">${esc(s.ai.observation || '')}</div></details>`
          : `<button class="btn primary wide" data-act="aigrade" ${sub ? '' : 'disabled'}>${ICON.wand}AI 채점</button>`}
      </div>
      <div class="gsec">
        <div class="sec-h">학생 피드백<span class="sp"></span>${s.ai && s.ai.feedback && s.feedback !== s.ai.feedback ? '<button class="lnk" data-act="copyfb">AI 피드백 쓰기</button>' : ''}</div>
        <textarea class="in" id="tfb" rows="2" placeholder="학생에게 돌려줄 말 (선택)">${esc(s.feedback)}</textarea>
      </div>
      <div class="gsec">
        <div class="sec-h">세특<span class="sp"></span><span class="bytes" id="bytes">${s.seteuk ? `<b class="${bcls}">${b}B</b>` : ''} / ${rng[0]}~${rng[1]}B</span>
          ${s.seteuk ? `<button class="ibtn" data-act="copyset" data-kid="${cls.id}" data-no="${no}" title="복사">${ic('copy')}</button>` : ''}</div>
        <textarea class="in memo" id="tmemo" rows="1" placeholder="관찰 메모 (선택) — 세특에 반영">${esc(s.memo)}</textarea>
        <textarea class="in" id="tset" rows="5" placeholder="'세특 만들기'를 누르면 채점 결과로 초안을 씁니다">${esc(s.seteuk)}</textarea>
        <ul class="warns" id="warns">${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
        <button class="btn soft" data-act="mkseteuk" style="margin-top:8px">${ICON.wand}${s.seteuk ? '다시 만들기' : '세특 만들기'}</button>
      </div>
    </div>
  </div>`;
}
function updBytes(t) {
  const rng = [App.settings().byteMin, App.settings().byteMax];
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
function hasGuide(task) { return task.criteria.some(c => (c.guide || '').trim()) || !!(task.answerKey || '').trim(); }
async function makeGuideFor(task, cls) {
  const k = cls && cls.subs.length ? cls : task.classes.find(x => x.subs.length);
  const imgs = k ? await aiImages(k, k.subs[0]) : [];
  const r = await AI.makeGuide(task, imgs);
  let n = 0;
  (r.criteria || []).forEach(c => { const x = task.criteria[Number(c.index) - 1]; if (x && c.guide) { x.guide = c.guide; n++; } });
  if (r.answerKey) task.answerKey = r.answerKey;
  task.guideAt = Date.now(); save();
  return n;
}
async function ensureGuide(task, cls) {
  if (hasGuide(task) || !task.criteria.length) return false;
  try { await makeGuideFor(task, cls); return true; }
  catch (e) { toast('판단 기준을 만들지 못해 계획서 기준만으로 채점합니다: ' + e.message, 5000); return false; }
}
async function runAIGrade(task, cls, no, signal) {
  const sub = subOf(cls, no); if (!sub) throw new Error('답안이 없습니다.');
  const imgs = await aiImages(cls, sub);
  const r = await AI.grade(task, imgs, signal);
  const s = stu(cls, no);
  r.criteria = (r.criteria || []).map(c => ({ index: Number(c.index), met: !!c.met, points: Number(c.points) || 0, evidence: c.evidence || '', reason: c.reason || '' }));
  s.ai = Object.assign(r, { at: Date.now(), model: AI.isMock() ? '모의' : App.settings().model, strict: task.strict || '보통' });
  if (!s.qmarksEdited || !(s.qmarks || []).length) s.qmarks = qmarksFrom(r);
  if (!s.touched && s.special == null && s.override == null) applyAI(task, s);
  if (!s.feedback && r.feedback) s.feedback = r.feedback;
  save();
}
async function runSeteuk(task, cls, no, signal) {
  const s = stu(cls, no);
  const set = App.settings(); let rng = [set.byteMin, set.byteMax];
  const info = seteukInfo(task, s);
  if (levelOf(task, s) === '하') rng = [Math.min(120, rng[0]), rng[1], 'low'];
  const styles = Style.pick(task);
  let best = null, prev = null;
  for (let k = 0; k < 3; k++) {
    const r = await AI.seteuk(task, info, rng, prev, signal, styles);
    const text = String(r.text || '').replace(/\s+/g, ' ').trim();
    const b = App.bytes(text);
    const dist = b > rng[1] ? b - rng[1] : b < rng[0] ? rng[0] - b : 0;
    if (!best || dist < best.dist) best = { text, b, dist };
    if (!dist) break;
    prev = { text, bytes: b };
  }
  s.seteuk = best.text; s.seteukAI = best.text; save();
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
    const head = j.done ? (j.stopped ? '멈춤' : '끝') + ` — 성공 ${j.ok}, 실패 ${j.fail}`
      : j.phase || `${n}/${j.total}명 · 성공 ${j.ok}${j.fail ? ', 실패 ' + j.fail : ''}`;
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
      <label class="f">모델</label>
      <div class="row" style="flex-wrap:nowrap"><select class="in" id="smodel">${modelOptions(cachedModels(), s.model)}</select><button class="btn sm" id="stest" title="키가 맞는지 보고 쓸 수 있는 모델을 새로 불러옵니다">확인</button></div>
      <p class="small muted" id="stestmsg" style="margin:6px 0 0"></p>
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
    App.saveSettings({ apiKey: $('#skey').value.trim(), model: $('#smodel').value || 'gemini-flash-latest', byteMin: Number($('#smin').value) || 250, byteMax: Number($('#smax').value) || 300 });
    closeModal(); rerender(); toast('저장했습니다.');
  };
}

/* ================= 도움말 ================= */
const HELP = [
  ['start', '시작하기', `<ol class="hsteps">
    <li><b>설정</b>에 Gemini API 키 넣기 <a href="${KEY_URL}" target="_blank" rel="noopener">무료 발급 ↗</a></li>
    <li>첫 화면에 <b>평가계획서</b>(hwp·pdf) 올리기 → 채점 기준이 정리됨</li>
    <li>수행평가 카드의 <b>+ 반 추가</b> → 답안 스캔 PDF 올리기</li>
    <li><b>이름 가리기</b> → <b>AI 채점</b> → 학생마다 확인하고 <b>채점 완료</b></li>
    <li><b>세특 만들기</b> → 복사하거나 엑셀로 내보내기</li></ol>`],
  ['key', 'API 키 발급', `<ol class="hsteps">
    <li><a href="${KEY_URL}" target="_blank" rel="noopener"><b>Google AI Studio ↗</b></a> 에 구글 계정으로 들어가기</li>
    <li><b>Create API key</b> 누르기</li>
    <li><code>AIza…</code> 로 시작하는 키를 복사해 <b>설정</b>에 붙여 넣기</li></ol>
    <p class="small muted">무료 키는 분당 사용량 한도가 있어요. 한도에 걸리면 앱이 다른 모델로 바꿔 이어 갑니다.</p>`],
  ['grade', '채점', `<ul>
    <li><b>AI 채점</b>: 기준마다 ✓/✗ 를 미리 채워 둡니다. 확인하고 <b>채점 완료</b>를 누르세요.</li>
    <li><b>관대하게 · 보통 · 엄격하게</b>: 답이 기준에 얼마나 맞아야 ✓ 인지 정합니다.</li>
    <li>한꺼번에 하는 일은 오른쪽 아래에서 돌아가니, 그동안 다른 일을 해도 됩니다.</li>
    <li><b>이름 가리기</b>: 학번·이름 칸을 넉넉하게 덮으면 AI 로 보낼 때만 검게 칠합니다.</li></ul>`],
  ['seteuk', '세특', `<ul>
    <li>수행평가 하나에 약 250~300바이트, '○○ 수행평가에서는 …함.' 두 문장 틀로 씁니다.</li>
    <li><b>관찰 메모</b>에 수업 중 모습을 적으면 더 개별화됩니다.</li>
    <li>금지어·특수문자·학생 입장 표현은 빨간 글씨로 알려 줍니다.</li></ul>`],
  ['save', '저장', `<ul>
    <li>기록은 이 브라우저에 저장됩니다. <b>구글 로그인</b>하면 내 드라이브에도 저장되어 다른 컴퓨터에서 이어 할 수 있어요.</li>
    <li>AI 를 쓸 때만, 이름을 가린 답안 그림이 Google Gemini 로 갑니다.</li></ul>`],
  ['keys', '단축키', `<div class="kgrid">
    <span><span class="kbd">←</span><span class="kbd">→</span></span><span>이전·다음 학생</span>
    <span><span class="kbd">1</span>~<span class="kbd">9</span></span><span>기준 체크</span>
    <span><span class="kbd">Ctrl</span>+<span class="kbd">Enter</span></span><span>채점 완료 후 다음</span>
    <span><span class="kbd">Esc</span></span><span>목록으로</span>
    <span><span class="kbd">/</span></span><span>찾기</span>
    <span><span class="kbd">?</span></span><span>도움말</span></div>`],
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
  const head = ['번호', '상태', ...task.criteria.map((c, i) => `기준${i + 1}`), 'AI 점수', '점수', '문항 표시', '피드백', '세특', '세특 바이트'];
  const rows = [head];
  for (let no = 1; no <= cls.size; no++) {
    const s = cls.students[no] || {}; const st = statusOf(cls, no);
    const marks = task.criteria.map((c, i) => !s.touched ? '' : task.mode === 'points' ? (s.pts[i] || 0) : (s.checks[i] ? 'O' : 'X'));
    const qm = (s.qmarks || []).map(q => `${q.no} ${QM[q.mark]}${q.reason ? ' ' + q.reason : ''}`).join(' / ');
    rows.push([no, st, ...marks, aiScoreOf(task, s) ?? '', scoreOf(task, s) ?? '', qm, s.feedback || '', s.seteuk || '', s.seteuk ? App.bytes(s.seteuk) : '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = head.map((h, i) => ({ wch: h === '세특' || h === '피드백' ? 60 : h === '문항 표시' ? 40 : i === 1 ? 10 : 8 }));
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
    if (!confirm(`'${task.name}' 수행평가와 그 채점 기록을 지울까요?`)) return;
    task.classes.forEach(k => delImgs(k.id + ':'));
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
      await makeGuideFor(task, k);
      closeModal(); rerender(); toast('판단 기준을 채웠습니다. 읽어 보고 고쳐 주세요.', 3500);
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
    await delImgs(cls.id + ':');
    task.classes = task.classes.filter(k => k !== cls); save(true); location.hash = '#/t/' + task.id;
  },
  async batchgrade(el, e, only) {
    const { course, task, cls } = findClass(el.dataset.id); task._subject = course.name;
    if (!App.settings().apiKey) { settingsModal(); return; }
    if (!cls.masks.length && !confirm('이름 칸 가리기를 하지 않았습니다. 그래도 답안을 그대로 AI 로 보낼까요?')) return;
    const items = only || []; if (!only) for (let no = 1; no <= cls.size; no++) { const st = statusOf(cls, no); if (st === '채점 전') items.push(no); }
    if (!items.length) { toast('AI 채점할 학생이 없습니다(모두 채점했거나 답안이 없음).'); return; }
    if (jobFor('grade:' + cls.id)) { toast('이 반은 이미 AI 채점 중입니다.'); return; }
    const lv = task.strict || '보통';
    runBatch(`${cls.name} AI 채점(${lv}) — ${items.length}명`, items,
      async (no, sig) => { await runAIGrade(task, cls, no, sig); return 'AI ' + aiScoreOf(task, cls.students[no]) + '점'; },
      { key: 'grade:' + cls.id, kind: 'grade', clsId: cls.id, where: '#/k/' + cls.id,
        pre: hasGuide(task) ? null : async j => { if (await ensureGuide(task, cls)) j.log.push('판단 기준을 먼저 만들었습니다(채점 기준 화면에서 고칠 수 있음).'); },
        preMsg: '판단 기준·모범 답안을 먼저 만드는 중…' });
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
  // AI 채점 다시: 확인 전 학생만 / 답안이 있는 모두(채점 완료한 학생은 점수 그대로, AI 판단만 새로)
  regrade(el) {
    const { task, cls } = findClass(el.dataset.id);
    const pick = all => { const a = []; for (let no = 1; no <= cls.size; no++) { const st = statusOf(cls, no); if (all ? (st !== '미제출' && st !== '미응시') : (st === 'AI 채점' || st === '채점 전')) a.push(no); } return a; };
    const a = pick(false), b = pick(true);
    if (!b.length) { toast('채점할 답안이 없어요.'); return; }
    modal(`<h2>AI 채점 다시</h2>
      <label class="opt"><input type="radio" name="rg" value="0" ${a.length ? 'checked' : 'disabled'}><span><b>확인 전 학생만</b> · ${a.length}명<br><small>체크를 새 AI 판단으로 바꿔요</small></span></label>
      <label class="opt"><input type="radio" name="rg" value="1" ${a.length ? '' : 'checked'}><span><b>모든 학생</b> · ${b.length}명<br><small>'채점 완료'한 학생은 점수 그대로, AI 판단만 새로</small></span></label>
      <div class="row" style="margin-top:12px"><span class="small muted">채점 기준</span>${strictSeg(task)}</div>
      <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="rggo">${ic('bot')}다시 채점</button></div>`);
    $('#rggo').onclick = () => {
      const all = $('input[name=rg]:checked').value === '1';
      const items = all ? b : a;
      // 확인 전 학생은 선생님이 건드린 체크를 풀어 새 AI 판단이 들어가게 한다
      items.forEach(no => { const s = stu(cls, no); if (!s.done) Object.assign(s, { touched: false, override: null, special: null, checks: [], pts: [] }); });
      save(); closeModal(true);
      ACT.batchgrade({ dataset: { id: cls.id } }, null, items);
    };
  },
  // 세특 다시 쓰기: 채점된 학생 모두(직접 고친 세특은 건너뛸 수 있음)
  reseteuk(el) {
    const { cls } = findClass(el.dataset.id);
    const all = [], edited = [];
    for (let no = 1; no <= cls.size; no++) {
      const s = cls.students[no]; const st = statusOf(cls, no);
      if (!s || !(st === '채점 완료' || st === 'AI 채점')) continue;
      all.push(no); if (s.seteuk && s.seteukAI && s.seteuk !== s.seteukAI) edited.push(no);
    }
    if (!all.length) { toast('먼저 채점해 주세요.'); return; }
    modal(`<h2>세특 다시 쓰기</h2>
      <p>채점된 학생 <b>${all.length}명</b>의 세특을 새로 씁니다.</p>
      ${edited.length ? `<label class="opt"><input type="checkbox" id="rskip" checked><span><b>직접 고친 세특은 그대로</b> · ${edited.length}명 (${edited.join(', ')}번)</span></label>` : ''}
      <div class="foot"><button class="btn" data-act="close">취소</button><button class="btn primary" id="rsgo">${ICON.wand}다시 쓰기</button></div>`);
    $('#rsgo').onclick = () => {
      const skip = $('#rskip') && $('#rskip').checked;
      const items = all.filter(no => !(skip && edited.includes(no)));
      closeModal(true);
      if (!items.length) { toast('다시 쓸 학생이 없어요.'); return; }
      ACT.batchseteuk({ dataset: { id: cls.id } }, null, items);
    };
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
  pg(el) { const sub = subOf(gctx.cls, gctx.no); G.page = Math.max(0, Math.min(sub.pages.length - 1, G.page + Number(el.dataset.d))); rerender(); },
  pgset(el) { G.page = Number(el.dataset.i); rerender(); },
  rot() { G.rot = (G.rot + 90) % 360; rerender(); },
  zoom(el) { const d = Number(el.dataset.d); G.zoom = d ? Math.max(0.4, Math.min(3, G.zoom + d)) : 1; rerender(); },
  maskview() { G.showMask = !G.showMask; rerender(); },
  why() { G.why = !G.why; rerender(); },
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
    el.disabled = true;
    if (!hasGuide(task)) { el.innerHTML = '판단 기준을 먼저 만드는 중…'; if (await ensureGuide(task, cls)) toast('판단 기준을 먼저 만들었습니다(채점 기준 화면에서 고칠 수 있음).', 3500); }
    el.innerHTML = 'AI 가 답안을 읽는 중… (10~40초)';
    const s0 = stu(cls, no);
    if (s0.ai && !s0.done) Object.assign(s0, { touched: false, override: null, special: null, checks: [], pts: [] });
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
document.addEventListener('change', e => {
  const a = e.target.closest('[data-act-change]');
  if (a && ACT[a.dataset.actChange]) ACT[a.dataset.actChange](a, e);
});
document.addEventListener('keydown', e => {
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
  if (typeof Sync !== 'undefined') { Sync.onChange(renderGsync); renderGsync(); Sync.boot(); }
})();
