// Gemini 호출과 지시문. 키가 'mock' 이면 화면 시험용 가짜 응답을 돌려준다.
'use strict';

const AI = (() => {
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const S = t => ({ type: 'STRING', description: t });
  const N = t => ({ type: 'NUMBER', description: t });
  const I = t => ({ type: 'INTEGER', description: t });
  const B = t => ({ type: 'BOOLEAN', description: t });
  const A = (items, t) => ({ type: 'ARRAY', items, description: t });
  const O = (properties, required) => ({ type: 'OBJECT', properties, required: required || Object.keys(properties) });

  const cfg = () => App.settings();
  const usage = { last: null };
  const isMock = () => (cfg().apiKey || '').trim().toLowerCase() === 'mock';

  // ---- 무료 버전: 모델마다 분당·하루 요청 한도가 있다. 앱이 간격을 맞추고, 오늘 쓴 양을 세어 보여 준다 ----
  const RPM = { 'flash-lite': 14, flash: 9, pro: 4 };          // 무료 한도보다 조금 낮게
  const sent = {};
  const UK = 'aigrader-usage', useL = [];
  // 하루 한도는 미국 태평양 시각(로스앤젤레스) 자정에 다시 채워진다. 오늘 쓴 양도 그 날짜로 센다
  const PT = { timeZone: 'America/Los_Angeles', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' };
  function ptParts(d) { const o = {}; new Intl.DateTimeFormat('en-US', PT).formatToParts(d || new Date()).forEach(p => { o[p.type] = Number(p.value); }); return o; }
  const today = () => { const p = ptParts(); return `${p.year}-${p.month}-${p.day}`; };
  // 다음 초기화 시각(내 기기 시각의 Date)
  function resetAt() { const now = new Date(), p = ptParts(now); const left = ((24 - p.hour) * 3600 - p.minute * 60 - p.second) * 1000; return new Date(Math.round((now.getTime() + left) / 60000) * 60000); }
  function usageToday() { let u = null; try { u = JSON.parse(localStorage.getItem(UK) || 'null'); } catch (e) {} if (!u || u.day !== today()) u = { day: today(), m: {} }; return u; }
  function useSave(u, ev) { try { localStorage.setItem(UK, JSON.stringify(u)); } catch (e) {} useL.forEach(f => { try { f(u, ev); } catch (e) {} }); }
  const tierName = m => { const d = describe(m); return d.tier === 'flash-lite' ? 'Flash-Lite' : d.tier === 'pro' ? 'Pro' : d.tier === 'flash' ? 'Flash' : m; };
  function useRow(u, model) { const k = tierName(model); return (u.m[k] = u.m[k] || { n: 0, tin: 0, tout: 0 }); }
  function useAdd(model, um) { const u = usageToday(); const x = useRow(u, model); x.n++; if (um) { x.tin += Number(um.promptTokenCount) || 0; x.tout += (Number(um.candidatesTokenCount) || 0) + (Number(um.thoughtsTokenCount) || 0); } if (x.limit === 'minute') delete x.limit; useSave(u); }
  function useLimit(model, kind, next) { const u = usageToday(); const x = useRow(u, model); x.limit = kind; x.limitAt = Date.now(); useSave(u, { model: tierName(model), kind, next: next && tierName(next) }); }
  const dayLimited = m => (usageToday().m[tierName(m)] || {}).limit === 'day';
  async function throttle(model, signal) {
    const cap = RPM[describe(model).tier] || 9;
    const a = sent[model] = (sent[model] || []).filter(t => Date.now() - t < 60000);
    if (a.length >= cap) { await sleep(60000 - (Date.now() - a[0]) + 300, signal); return throttle(model, signal); }
    a.push(Date.now());
  }

  async function call(opts, retried) {
    const { system, parts, schema, temperature = 0.2, signal } = opts;
    const { apiKey } = cfg();
    const model = opts._model || cfg().model;
    const tried = opts._tried || [model];
    if (!apiKey) throw new Error('설정에서 Gemini API 키를 먼저 넣어 주세요.');
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
    };
    // Gemini 3 이상(·항상 최신)은 기본 temperature 1.0 을 권장 — 낮추면 답이 되풀이될 수 있어 2.x 에만 넣는다
    if (modelVersion(model) < 3) body.generationConfig.temperature = temperature;
    // 생각하기(thinking)를 줄여 빠르게: 정리·옮겨 쓰기처럼 단순한 일에만(opts.think = 'min' | 'low')
    const tc = opts.think && !opts._noThink ? thinkCfg(model, opts.think) : null;
    if (tc) body.generationConfig.thinkingConfig = tc;
    const stream = typeof opts.onText === 'function';
    // 오늘 무료 한도를 다 쓴 모델이면 처음부터 다른 모델로
    if (dayLimited(model)) { const nx = fallback(model, tried); if (nx) return call(Object.assign({}, opts, { _model: nx, _tried: tried.concat(nx), _noThink: false }), retried); }
    let wait = 2000;
    for (let attempt = 0; ; attempt++) {
      await throttle(model, signal);
      // opts.firstMs 안에 답의 첫 글자가 오지 않으면(생각하기가 길거나 줄이 밀림) 끊고 더 빠른 모델로
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      if (signal) { if (signal.aborted) ac.abort(); else signal.addEventListener('abort', onAbort); }
      let slow = false, timer = null;
      if (opts.firstMs) timer = setTimeout(() => { slow = true; ac.abort(); }, opts.firstMs);
      const done = () => { clearTimeout(timer); timer = null; };
      const slowNext = () => {
        const next = fallback(model, tried, true);
        if (!next) return null;
        opts.onWait && opts.onWait(0, describe(next).label, 'slow');
        return call(Object.assign({}, opts, { _model: next, _tried: tried.concat(next), _noThink: false, think: opts.think === 'low' ? 'min' : opts.think }), retried);
      };
      let r;
      try {
        r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, {
          method: 'POST', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
          body: JSON.stringify(body),
        });
      } catch (e) {
        done(); signal && signal.removeEventListener('abort', onAbort);
        if (slow) { const n = slowNext(); if (n) return n; throw new Error('AI 가 너무 오래 답하지 않습니다. 잠시 뒤 다시 해 보세요.'); }
        throw e;
      }
      if (!stream || !r.ok) { done(); signal && signal.removeEventListener('abort', onAbort); }
      if (r.ok) {
        let txt = '', why = '';
        const take = j => {
          const cand = j.candidates && j.candidates[0];
          if (cand && cand.content) txt += (cand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
          why = (cand && cand.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || why;
          if (j.usageMetadata) usage.last = Object.assign({ model }, j.usageMetadata); // 토큰 쓰임(확인용)
        };
        if (stream) {
          // 받는 대로 글자 수를 알려 준다(server-sent events: "data: {...}")
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            let chunk;
            try { chunk = await rd.read(); }
            catch (e) {
              done(); signal && signal.removeEventListener('abort', onAbort);
              if (slow) { const n = slowNext(); if (n) return n; throw new Error('AI 가 너무 오래 답하지 않습니다. 잠시 뒤 다시 해 보세요.'); }
              throw e;
            }
            const { value } = chunk;
            if (chunk.done) break;
            buf += dec.decode(value, { stream: true });
            let k;
            while ((k = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
              if (line.startsWith('data:')) { try { take(JSON.parse(line.slice(5))); if (txt) done(); opts.onText(txt.length); } catch (e) {} }
            }
          }
          if (buf.trim().startsWith('data:')) { try { take(JSON.parse(buf.trim().slice(5))); } catch (e) {} }
          done(); signal && signal.removeEventListener('abort', onAbort);
        } else take(await r.json());
        // 빈 답·깨진 답은 가끔 한 번씩 나온다 — 한 번은 저절로 다시(두 번째는 다른 모델로)
        const again = () => {
          if (opts._parseRetry >= 2 || why === 'MAX_TOKENS' || why === 'SAFETY') return null;
          const n = opts._parseRetry ? fallback(model, tried) : model;
          if (!n) return null;
          opts.onWait && opts.onWait(0, describe(n).label, 'broken');
          return call(Object.assign({}, opts, { _model: n, _tried: n === model ? tried : tried.concat(n), _parseRetry: (opts._parseRetry || 0) + 1 }), retried);
        };
        useAdd(model, usage.last && usage.last.model === model ? usage.last : null);
        if (!txt) { const n = again(); if (n) return n; throw new Error('AI 가 답을 주지 않았습니다(' + (why || '빈 응답') + ').'); }
        try { return JSON.parse(txt.trim().replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')); }
        catch (e) { const n = again(); if (n) return n; throw new Error(why === 'MAX_TOKENS' ? 'AI 답이 너무 길어 잘렸습니다. 계획서에서 수행평가 부분만 붙여 넣어 다시 해 보세요.' : 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.'); }
      }
      let msg = '', errj = null;
      try { errj = (await r.json()).error; msg = errj.message; } catch (e) { msg = r.statusText; }
      // 이 모델이 생각하기 설정을 모르면 설정 없이 다시
      if (r.status === 400 && tc && /think/i.test(msg)) {
        // 'minimal' 을 모르는 모델이면 'low' 로, 그것도 모르면 설정 없이
        if (opts.think === 'min' && tc.thinkingLevel === 'minimal') return call(Object.assign({}, opts, { think: 'low' }), retried);
        return call(Object.assign({}, opts, { _noThink: true }), retried);
      }
      if (r.status === 429) {
        // 무료 한도: 분당 한도면 알려 준 시간만큼 기다렸다 같은 모델로(최대 2번), 하루 한도면 다른 모델로
        const det = JSON.stringify((errj && errj.details) || []) + ' ' + msg;
        const perDay = /PerDay|per day|daily/i.test(det);
        const rd = Number((det.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/) || [])[1]);
        if (!perDay && attempt < 2) {
          const w = Math.min(60, rd || 15) * 1000;
          useLimit(model, 'minute');
          opts.onWait && opts.onWait(Math.round(w / 1000), null, 'quota');
          await sleep(w, signal); continue;
        }
        const next = fallback(model, tried);
        useLimit(model, perDay ? 'day' : 'minute', next);
        if (next) {
          opts.onWait && opts.onWait(0, describe(next).label, perDay ? 'day' : 'quota');
          return call(Object.assign({}, opts, { _model: next, _tried: tried.concat(next), _noThink: false }), retried);
        }
        throw new Error(perDay ? `${tierName(model)} 오늘 무료 한도를 다 썼어요. 내일 다시 쓰거나 결제를 등록하면 늘어나요.` : '무료 사용 한도(분당)에 걸렸어요. 1분 뒤 다시 해 주세요.');
      }
      if (r.status === 503 || r.status === 500) {
        // 바쁨(503·500)은 같은 모델로 한 번만 다시, 그다음은 다른 모델로 넘어간다
        const next = attempt >= 1 ? fallback(model, tried) : null;
        if (next) {
          opts.onWait && opts.onWait(0, describe(next).label);
          return call(Object.assign({}, opts, { _model: next, _tried: tried.concat(next), _noThink: false }), retried);
        }
        if (attempt < 3) {
          opts.onWait && opts.onWait(Math.round(wait / 1000));
          await sleep(wait, signal); wait *= 2; continue;
        }
      }
      if (r.status === 400 && /API key/i.test(msg)) throw new Error('API 키가 올바르지 않습니다. 설정에서 다시 확인해 주세요.');
      if (r.status === 403) throw new Error('이 키로는 Gemini 를 쓸 수 없습니다(403): ' + msg);
      if (r.status === 404) {
        // 고른 모델이 없어졌으면 그 키로 쓸 수 있는 추천 모델로 바꿔 한 번 더
        if (!retried) {
          try {
            const list = await listModels();
            const pick = recommend(list);
            if (pick && pick !== model) {
              const s = cfg(); s.model = pick; App.saveSettings(s);
              try { localStorage.setItem('aigrader-models', JSON.stringify(list.map(m => m.id))); } catch (e) {}
              return call(opts, true);
            }
          } catch (e) { /* 아래 안내로 */ }
        }
        throw new Error('모델 이름을 찾을 수 없습니다(' + model + '). 설정에서 "키 확인·최신 목록"을 눌러 모델을 다시 고르세요.');
      }
      if (r.status === 429) throw new Error('사용량 한도에 걸렸습니다. 잠시 뒤 다시 시도하거나 다른 모델을 고르세요.');
      if (r.status === 503 || r.status === 500) throw new Error('Gemini 서버가 지금 몹시 바쁩니다(여러 모델로 시도함). 1~2분 뒤 다시 눌러 주세요.');
      throw new Error('AI 호출 실패(' + r.status + '): ' + msg);
    }
  }
  // 바쁠 때 넘어갈 모델: 같은 급의 다른 판 → 더 가벼운 급. Pro 는 느려서 처음부터 Pro 를 고른 경우에만.
  function fallback(model, tried, fast) {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('aigrader-models') || '[]'); } catch (e) {}
    ids = ['gemini-flash-latest', 'gemini-flash-lite-latest'].concat(ids.filter(i => describe(i).ver >= 3));
    const cur = describe(model);
    const plain = /^gemini-(\d+(\.\d+)?-(pro|flash|flash-lite)(-\d{3})?|(pro|flash|flash-lite)-latest)$/;
    const ok = d => !tried.includes(d.id) && plain.test(d.id) && (d.latest || (d.ver >= 3 && !d.preview)) && !dayLimited(d.id) &&
      (d.tier === 'flash' || d.tier === 'flash-lite' || (d.tier === 'pro' && cur.tier === 'pro'));
    const list = sortModels(ids).filter(ok);
    // fast: 답이 늦을 때 — 생각하기가 짧은 Flash-Lite 를 먼저
    const rank = fast ? (d => (d.tier === 'flash-lite' ? 0 : d.tier === 'flash' ? 1 : 2))
      : (d => (d.tier === cur.tier ? 0 : d.tier === 'flash' ? 1 : 2));
    list.sort((a, b) => rank(a) - rank(b));
    return tried.length > 3 ? null : (list[0] || {}).id || null;
  }
  function sleep(ms, signal) {
    return new Promise((res, rej) => {
      const t = setTimeout(res, ms);
      signal && signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('중지', 'AbortError')); });
    });
  }

  // 모델 이름 → { id, ver, tier, preview, latest, label, note }
  function describe(id) {
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-(pro|flash-lite|flash)(.*)$/);
    const alias = id.match(/^gemini-(pro|flash-lite|flash)-latest$/);
    const tierName = { pro: 'Pro', flash: 'Flash', 'flash-lite': 'Flash-Lite' };
    const tierNote = { pro: '가장 정확 · 느리고 무료 한도 적음', flash: '정확도와 속도 균형 · 추천', 'flash-lite': '가장 빠름 · 손글씨 인식은 약함' };
    if (alias) return { id, ver: 99, tier: alias[1], preview: false, latest: true, label: `항상 최신 ${tierName[alias[1]]}`, note: tierNote[alias[1]] + ' · 새 모델이 나오면 저절로 바뀜' };
    if (!m) return { id, ver: 0, tier: '', preview: /preview|exp/.test(id), latest: false, label: id, note: '' };
    const rest = m[3] || '';
    const preview = /preview|exp/.test(rest);
    return { id, ver: Number(m[1]), tier: m[2], preview, latest: false, label: `Gemini ${m[1]} ${tierName[m[2]]}${preview ? ' (미리보기' + ((rest.match(/(\d{2})-(\d{4})/) || []).length ? ' ' + rest.match(/(\d{2})-(\d{4})/)[2] + '.' + rest.match(/(\d{2})-(\d{4})/)[1] : '') + ')' : ''}`, note: tierNote[m[2]] };
  }
  const TIER = { flash: 0, pro: 1, 'flash-lite': 2, '': 3 };
  function sortModels(ids) {
    return ids.map(describe).sort((a, b) =>
      (b.latest - a.latest) || (b.ver - a.ver) || (TIER[a.tier] - TIER[b.tier]) || (a.preview - b.preview) || a.id.localeCompare(b.id));
  }
  // 채점에 알맞은 모델 하나: 항상 최신 Flash → 가장 새 Flash → 가장 새 Pro
  function recommend(list) {
    return (list.find(m => m.latest && m.tier === 'flash') || list.find(m => !m.latest && m.tier === 'flash') || list.find(m => m.tier === 'pro') || list[0] || {}).id;
  }
  function thinkCfg(id, level) {
    const d = describe(id);
    if (d.latest || d.ver >= 3) return { thinkingLevel: level === 'min' && d.tier !== 'pro' ? 'minimal' : level === 'medium' && d.tier !== 'pro' ? 'medium' : 'low' };
    if (d.ver >= 2.5) return { thinkingBudget: level === 'medium' ? 1024 : d.tier === 'pro' ? 128 : 0 }; // 2.5 Pro 는 끌 수 없어 최소값
    return null;
  }
  function modelVersion(id) { const d = describe(id); return d.latest ? 99 : d.ver; }

  async function listModels() {
    const { apiKey } = cfg();
    if (isMock()) return sortModels(['gemini-flash-latest', 'gemini-pro-latest', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite']);
    const ids = []; let token = '';
    do {
      const r = await fetch(`${BASE}/models?pageSize=200${token ? '&pageToken=' + token : ''}`, { headers: { 'x-goog-api-key': (apiKey || '').trim() } });
      if (!r.ok) {
        let msg = ''; try { msg = (await r.json()).error.message; } catch (e) {}
        throw new Error(r.status === 400 || r.status === 403 ? 'API 키가 맞지 않습니다. 키를 다시 복사해 넣어 주세요.' : '키 확인 실패(' + r.status + ') ' + msg);
      }
      const j = await r.json();
      (j.models || []).forEach(m => {
        const id = m.name.replace(/^models\//, '');
        if ((m.supportedGenerationMethods || []).includes('generateContent') && /^gemini-/.test(id) && !/(embedding|tts|image|audio|live|vision|robotics|computer-use|native|thinking|learnlm|aqa)/.test(id)) ids.push(id);
      });
      token = j.nextPageToken || '';
    } while (token);
    return sortModels([...new Set(ids)]);
  }

  // ---------- 1. 평가계획서 → 수행평가 채점 기준 ----------
  const PLAN_SCHEMA = O({
    subject: S('과목명'), grade: S('학년'), semester: S('학기'), school_year: S('학년도'),
    tasks: A(O({
      name: S('수행평가 영역 이름(예: 효소실험탐구)'),
      maxScore: N('영역 만점'),
      method: S('평가 방법(논술형, 실험실습 등)'),
      period: S('평가 시기'),
      assignment: S('수행 과제 설명'),
      standards: A(S('이 영역의 성취기준 코드만(예: [12세포02-03])')),
      mode: { type: 'STRING', enum: ['count', 'points'], description: 'count = 충족한 항목 수로 점수를 정함, points = 항목마다 배점을 더함' },
      parts: A(O({ name: S('평가 요소 이름(표의 평가 요소 칸)'), kind: S('논술형·활동형처럼 요소에 적힌 형태. 없으면 빈칸') }),
        '채점 기준표가 평가 요소(행 묶음)마다 기준 항목과 척도·배점을 따로 가지면 그 요소들을 순서대로. 요소가 하나면 빈 배열'),
      criteria: A(O({ text: S('채점 기준 항목 문장(원문 그대로)'), points: N('points 방식이면 그 항목 배점, count 방식이면 0'), part: I('이 항목이 속한 평가 요소 번호(1부터). 요소가 하나면 1') })),
      scale: A(O({ count: I('충족 항목 수'), score: N('점수'), part: I('이 척도 줄이 속한 평가 요소 번호(1부터). 요소가 하나면 1') }), 'count 방식의 환산표. 0개(하나도 충족하지 못한 경우)까지 포함'),
      specials: A(O({ label: S('특수 상황(백지 제출, 미참여, 장기 미인정 결석 등)'), score: N('점수') })),
    }, ['name', 'maxScore', 'mode', 'criteria', 'scale', 'specials'])),
  }, ['subject', 'tasks']);

  const PLAN_SYS = `너는 한국 고등학교 교사의 평가 업무를 돕는 조수다. 교과 평가계획서에서 '수행평가' 영역의 채점 기준을 뽑아 정해진 JSON 으로 옮긴다.
규칙:
- 정기시험(지필평가)은 빼고 수행평가 영역만 tasks 에 넣는다. 영역마다 하나의 task.
- 채점 기준 항목(예: "1. 효소의 종류를 기능에 따라 구분하고…")은 번호를 떼고 원문 문장을 그대로 criteria 에 옮긴다.
- "6개 항목 충족한 경우 20점, 5개 18점 …, 하나도 충족하지 못한 경우(기본점수) 8점" 같은 표는 mode='count' 이고 scale 에 count 0 까지 모두 적는다.
- 항목마다 배점이 따로 있으면 mode='points', criteria.points 에 배점을 적고 scale 은 빈 배열.
- "백지 제출자, 자발적 미참여자 7점", "장기 미인정 결석자 6점" 같은 특수 상황은 specials 에 적는다.
- 한 영역의 채점 기준표가 평가 요소(예: '외래종 생물 탐구'와 '외래종이 생물다양성에 미치는 영향 논술', 또는 논술형·활동형)마다 기준 항목과 '○개 항목 충족 → 점수' 척도를 따로 가지면, parts 에 요소를 순서대로 적고 criteria 와 scale 마다 part 번호를 단다. 이때 maxScore 는 영역 전체 만점이다.
- 성취수준 설명이나 평가 방침 같은 긴 글은 옮기지 않는다(앱이 따로 읽는다). 짧게 답한다.
- 계획서에 없는 내용은 지어내지 않는다.`;

  // text = 앱이 수행평가 부분만 잘라 낸 글. 글을 뽑을 수 없는 스캔 PDF 만 파일째 보낸다.
  async function extractPlan({ text, pdf, mime }, onText, onWait) {
    if (isMock()) { for (let i = 1; i <= 5; i++) { await sleep(150); onText && onText(i * 300); } return mockPlan(); }
    const parts = [];
    if (pdf && (!text || text.trim().length < 300)) parts.push({ inline_data: { mime_type: mime || 'application/pdf', data: pdf } });
    else if (text) parts.push({ text: '평가계획서(수행평가 부분):\n' + text.slice(0, 60000) });
    parts.push({ text: '위 평가계획서에서 수행평가 영역별 채점 기준을 JSON 으로 뽑아 주세요.' });
    return call({ system: PLAN_SYS, parts, schema: PLAN_SCHEMA, temperature: 0.1, think: 'min', firstMs: 25000, onText, onWait });
  }

  // ---------- 2. 채점 지침 다듬기(문항지를 보고) ----------
  const GUIDE_SCHEMA = O({
    answerKey: S('문항별 모범 답안 요지(문항 번호마다 한두 줄)'),
    criteria: A(O({ index: I('채점 기준 번호(1부터)'), questions: S('이 기준을 판단할 시험지 문항 번호(예: 3 또는 1, 2-1). 기준 번호와 문항 번호는 다를 수 있으니 문항 글을 읽고 정한다'), guide: S('판단 기준: 충족으로 볼 핵심 요소, 부분 인정 여부, 흔한 오답') })),
  });
  async function makeGuide(task, images) {
    if (isMock()) return { answerKey: '1. (모의) 펩신은 최적 pH 2, 소장은 pH 8 이라 활성이 떨어진다.\n2. (모의) A 보조 인자, B 주효소…', criteria: task.criteria.map((c, i) => ({ index: i + 1, questions: String([3, 1, 1, 2, 4, 4][i] || i + 1), guide: '(모의 지침) ' + c.text.slice(0, 30) + '… 핵심 개념과 이유가 함께 있으면 충족' })) };
    const parts = [{ text: taskBrief(task, true) }];
    if (task.question) parts.push({ text: '선생님이 적은 문항·정답 메모:\n' + task.question });
    images.forEach((b64, i) => { parts.push({ text: `문항지(학생 답안지) ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: '문항지의 각 문항을 읽고, 채점 기준 항목마다 그 기준을 판단할 문항 번호(questions)를 정해 주세요. 채점 기준 번호와 문항 번호는 같지 않을 수 있습니다(예: 기준 1 효소의 종류 → 문항 3). 항목마다 채점 지침(guide)과 문항별 모범 답안 요지(answerKey)도 써 주세요. 학생이 쓴 손글씨 답은 정답 판단에 쓰지 말고 문항 글만 보세요.' });
    return call({ system: '너는 고등학교 과학 수행평가 채점 지침을 만드는 교사 조수다. 교과서 수준의 정확한 과학 내용으로 쓰고, 채점 기준 원문의 뜻을 넓히거나 좁히지 않는다.', parts, schema: GUIDE_SCHEMA, temperature: 0.2 });
  }

  // ---------- 3. 학생 답안 채점 ----------
  const GRADE_SCHEMA = O({
    transcript: S('문항 번호별로 학생 답의 핵심만 1~2줄씩 옮겨 적은 것(읽을 수 없는 글자는 □)'),
    blank: B('답안이 백지이거나 의미 있는 답이 거의 없으면 true'),
    unreadable: B('글씨가 흐리거나 잘려서 판단이 어려우면 true'),
    criteria: A(O({
      index: I('채점 기준 번호(1부터)'),
      met: B('충족 여부'),
      points: N('points 방식일 때 준 점수, count 방식이면 0'),
      evidence: S('판단 근거가 된 학생 답 인용(30자 이내)'),
      reason: S('맨 앞에 본 문항 번호를 [3번]처럼 쓰고, 충족/미충족 이유 한 문장(50자 이내)'),
    })),
    feedback: S('학생에게 돌려줄 피드백 2문장(잘한 점 1 + 보완할 점 1, 존댓말)'),
    observation: S('세특 작성을 위한 관찰 요약: 학생이 실제로 보여 준 이해와 특징 2문장(답안에 있는 사실만)'),
  });
  const GRADE_SYS = `너는 한국 고등학교 수행평가 채점을 돕는 조수다. 최종 점수는 교사가 정한다.
규칙:
- 이미지 속 학생 손글씨 답안을 먼저 정확히 읽어 transcript 에 문항별로 옮긴다. 검은 상자로 가린 곳은 개인정보이니 읽으려 하지 않는다.
- 채점 기준 항목마다 학생 답이 그 기준을 충족하는지 판단한다. 채점 지침(guide)이 있으면 따른다.
- 답이 과학적으로 틀렸거나 핵심 이유가 빠졌으면 충족이 아니다. 표현이 서툴러도 핵심 개념과 이유가 맞으면 충족이다.
- 근거(evidence)는 학생 답에서 그대로 인용한다. 답안에 없는 내용을 지어내지 않는다.
- 판단이 애매하면 reason 에 '애매함'이라고 밝힌다.
- 채점 기준 번호와 시험지 문항 번호는 같지 않을 수 있다. 기준마다 '판단할 문항'이 적혀 있으면 그 문항의 답으로 판단하고, 없으면 기준 내용과 가장 맞는 문항을 찾아 판단한다. reason 맨 앞에 본 문항 번호를 [3번]처럼 쓴다.
- 출력은 짧게: transcript 는 문항당 1~2줄, reason 은 한 문장.`;

  // 채점 엄격도: 기준에 '어느 정도 들어오면' 충족으로 볼지. 과학적으로 틀린 답은 어느 쪽이든 미충족.
  const STRICT = {
    '관대': `채점 엄격도: 관대하게.
- 기준이 요구하는 핵심 개념이 방향이 맞게 들어 있으면, 용어가 조금 부정확하거나 이유가 짧고 일부만 있어도 충족으로 본다.
- 여러 요소를 요구하는 기준은 절반 이상이 맞으면 충족으로 본다.
- 애매하면 학생에게 유리하게 충족으로 본다. 다만 과학적으로 틀린 내용이 핵심이면 미충족.`,
    '보통': `채점 엄격도: 보통.
- 표현이 서툴러도 핵심 개념과 이유가 맞으면 충족, 핵심 이유가 빠졌거나 틀리면 미충족.
- 여러 요소를 요구하는 기준은 핵심 요소가 대부분 맞아야 충족.`,
    '엄격': `채점 엄격도: 엄격하게.
- 기준 문장이 요구하는 요소(개념·이유·근거·예 등)가 모두, 정확한 과학 용어로, 논리적으로 이어져 있어야 충족이다.
- 일부만 있거나, 이유가 모호하거나, 용어가 부정확하면 미충족.
- 애매하면 미충족으로 본다.`,
  };
  async function grade(task, images, signal, o = {}) {
    const lv = STRICT[task.strict] ? task.strict : '보통';
    if (isMock()) { await sleep(600, signal); return mockGrade(task, lv); }
    const parts = [{ text: taskBrief(task, true) }];
    if (task.answerKey) parts.push({ text: '문항별 모범 답안 요지:\n' + task.answerKey });
    if (task.question) parts.push({ text: '선생님 메모:\n' + task.question });
    images.forEach((b64, i) => { parts.push({ text: `학생 답안 ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: STRICT[lv] + `\n\n채점 기준 ${task.criteria.length}개 항목을 모두 위 엄격도로 판단해 JSON 으로 답해 주세요.` });
    return call({ system: GRADE_SYS + '\n- 충족을 가르는 선은 사용자가 준 "채점 엄격도"를 따른다.', parts, schema: GRADE_SCHEMA, temperature: 0.1, signal, think: 'think' in o ? o.think : 'low', _model: o.model });
  }

  // ================= 정확도 위주 채점: 정답표(형별) → 읽기 → 판단(두 번) =================
  // 채점 방식(설정): 정확하게 = 읽기·세특 Flash, 정답표·판단 Flash 깊게, 확인용 판단 Flash-Lite / 빠르게 = 고른 모델, 생각 낮게
  const MODELS = { flash: 'gemini-flash-latest', lite: 'gemini-flash-lite-latest' };
  function plan() {
    const s = cfg(), mode = s.mode || 'auto';
    if (mode === 'accurate') return {
      key: { model: MODELS.flash, think: null }, read: { model: MODELS.flash, think: 'low' },
      judge: { model: MODELS.flash, think: null }, judge2: { model: MODELS.lite, think: 'low' }, seteuk: { model: MODELS.flash, think: 'low' },
    };
    if (mode === 'fast') { const m = s.model; return { key: { model: m, think: 'low' }, read: { model: m, think: 'low' }, judge: { model: m, think: 'low' }, judge2: null, seteuk: { model: m, think: 'low' } }; }
    // 자동(무료 버전 기본): 정답표는 형마다 한 번 Flash 로 꼼꼼히, 답 읽기·세특은 빠른 Flash-Lite, 기준 판단만 Flash(글만 보내 빠름)
    return { key: { model: MODELS.flash, think: 'medium' }, read: { model: MODELS.lite, think: 'low' }, judge: { model: MODELS.flash, think: 'low' }, judge2: null, seteuk: { model: MODELS.lite, think: 'low' } };
  }

  // 1) 정답표: 시험지(첫 답안지)를 읽고 형, 문항별 정답, 기준↔문항 대응, 판단 지침
  const KEY_SCHEMA = O({
    form: S('시험지 머리글에 적힌 형(예: A형, C형). 적혀 있지 않으면 빈칸'),
    answers: A(O({
      no: S('문항 번호(시험지 그대로, 예: 1, 2, 3-1, 3-2)'),
      question: S('그 문항이 묻는 것 한 줄'),
      answer: S('정답 또는 모범 답안 요지(정확한 과학 내용, 그래프·표를 근거로)'),
    }), '시험지의 모든 문항(소문항 포함), 번호 순서대로'),
    criteria: A(O({
      index: I('채점 기준 번호(1부터)'),
      questions: S('이 기준을 판단할 문항 번호(예: 3 또는 3-1, 3-2). 기준 번호와 문항 번호는 다를 수 있다'),
      guide: S('판단 기준: 충족으로 볼 핵심 요소, 부분 인정 여부'),
    })),
  });
  async function makeKey(task, images) {
    if (isMock()) return {
      form: 'C형',
      answers: ['1', '2', '3-1', '3-2', '4-1', '4-2', '4-3', '5-1', '5-2', '5-3', '6'].map(no => ({ no, question: `(모의) ${no}번 문항`, answer: `(모의) ${no}번 정답` })),
      criteria: task.criteria.map((c, i) => ({ index: i + 1, questions: ['3', '5', '1', '4', '6', '6'][i] || String(i + 1), guide: '(모의) 핵심 개념과 이유가 함께 있으면 충족' })),
    };
    const parts = [{ text: taskBrief(task, false) }];
    if (task.question) parts.push({ text: '선생님이 적은 정답 메모(이것을 가장 먼저 따른다):\n' + task.question });
    images.forEach((b64, i) => { parts.push({ text: `시험지(학생 답안지) ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: '이 시험지의 형과 모든 문항의 정답표를 만들고, 채점 기준마다 판단할 문항을 정해 주세요. 학생이 쓴 손글씨는 정답이 아닐 수 있으니 무시하고, 문항 글·그래프·표만 보고 정답을 직접 풀어 정하세요.' });
    const P = plan().key;
    return call({ system: `너는 고등학교 과학 수행평가의 정답표를 만드는 교사 조수다.
- 문항을 직접 풀어 정답을 정한다. 그래프는 축과 곡선의 최댓값·교차점을 꼼꼼히 읽는다(예: 저해제가 있어도 최대 속도가 같으면 경쟁적 저해, 최대 속도가 낮아지면 비경쟁적 저해).
- 표·그림 속 기호(A, B, (가) 등)는 이 시험지에 실제로 있는 것만 쓴다. 다른 시험지의 기호를 지어내지 않는다.
- 채점 기준 번호와 문항 번호는 같지 않을 수 있다. 기준 문장의 내용과 문항이 묻는 것을 맞춰 대응을 정한다.`, parts, schema: KEY_SCHEMA, temperature: 0.1, think: P.think, _model: P.model });
  }

  // 0) 쪽 방향: 작게 줄인 그림(이름은 읽히지 않는 크기)으로 글자가 바로 서려면 몇 도 돌려야 하는지
  const ORIENT_SCHEMA = O({ rotate: I('글자가 똑바로 읽히려면 그림을 시계 방향으로 돌려야 하는 각도: 0, 90, 180, 270 중 하나') });
  async function orient(b64, signal) {
    if (isMock()) { await sleep(150, signal); return { rotate: 0 }; }
    const r = await call({ system: '너는 스캔한 시험지의 방향을 판단한다. 인쇄된 제목·표 머리·글자의 방향만 본다.', parts: [{ inline_data: { mime_type: 'image/jpeg', data: b64 } }, { text: '이 시험지 한 쪽의 글자가 똑바로(제목이 위쪽, 왼쪽에서 오른쪽으로) 읽히려면 그림을 시계 방향으로 몇 도 돌려야 하나요? 이미 똑바르면 0.' }],
      schema: ORIENT_SCHEMA, temperature: 0, signal, think: 'low', _model: MODELS.lite });
    const d = Number(r.rotate); return { rotate: [0, 90, 180, 270].includes(d) ? d : 0 };
  }

  // 2) 읽기: 학생 답을 문항별로 그대로 옮긴다(판단하지 않음)
  const READ_SCHEMA = O({
    answers: A(O({
      no: S('문항 번호(시험지 그대로)'),
      text: S('학생이 쓴 답을 그대로. 고쳐 쓰거나 요약하지 않는다. 지운 글자는 빼고, 읽을 수 없는 글자는 □, 답이 없으면 (답 없음)'),
    })),
    blank: B('답안 거의 전부가 비어 있으면 true'),
    unreadable: B('글씨가 흐리거나 잘려 읽기 어려운 곳이 많으면 true'),
  });
  async function read(images, nos, signal) {
    if (isMock()) { await sleep(300, signal); return { answers: (nos.length ? nos : ['1', '2', '3']).map(no => ({ no, text: `(모의) ${no}번 학생 답` })), blank: false, unreadable: false }; }
    const parts = [];
    images.forEach((b64, i) => { parts.push({ text: `학생 답안 ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: (nos.length ? `시험지 문항 번호: ${nos.join(', ')}\n` : '') + '문항마다 학생이 쓴 답을 그대로 옮겨 적어 주세요. 채점하지 마세요. 인쇄된 문제 글은 옮기지 않습니다.' });
    const P = plan().read;
    return call({ system: '너는 손글씨 답안을 정확히 옮겨 적는 조수다. 검은 상자로 가린 곳은 개인정보이니 읽지 않는다. 학생이 지우고 다시 쓴 곳은 최종 답만 쓴다. 애매한 글자는 추측하지 말고 □ 로 둔다.', parts, schema: READ_SCHEMA, temperature: 0, signal, think: P.think, _model: P.model });
  }

  // 3) 판단: 글만 보고 기준마다(대응 문항의 학생 답 + 정답)
  const JUDGE_SCHEMA = O({
    criteria: A(O({
      index: I('채점 기준 번호(1부터)'),
      met: B('충족 여부'),
      points: N('points 방식일 때 준 점수, count 방식이면 0'),
      evidence: S('판단 근거가 된 학생 답 구절을 그대로 인용(30자 이내, 답이 없으면 빈칸)'),
      reason: S('맨 앞에 본 문항을 [3번]처럼 쓰고, 충족/미충족 이유 한 문장(50자 이내)'),
    })),
    feedback: S('학생에게 돌려줄 피드백 2문장(잘한 점 1 + 보완할 점 1, 존댓말)'),
    observation: S('세특 작성을 위한 관찰 요약: 학생 답에 실제로 있는 내용과 특징 2문장'),
  });
  const pick = (answers, q) => {
    const want = String(q || '').split(/[,\s]+/).map(x => x.replace(/번/g, '').trim()).filter(Boolean);
    if (!want.length) return answers;
    return answers.filter(a => want.some(w => a.no === w || a.no.startsWith(w + '-') || a.no.startsWith(w + '(') || a.no.startsWith(w + '.')));
  };
  async function judge(task, key, answers, signal, o = {}) {
    const lv = STRICT[task.strict] ? task.strict : '보통';
    if (isMock()) { await sleep(300, signal); const g = mockGrade(task, lv); return { criteria: g.criteria, feedback: g.feedback, observation: g.observation }; }
    const keyAns = (key && key.answers) || [];
    const blocks = task.criteria.map((c, i) => {
      const k = (key && key.crit && key.crit[i]) || {};
      const qs = k.qnos || '';
      const st = pick(answers, qs), ka = pick(keyAns, qs);
      return `[기준 ${i + 1}] ${c.text}${task.mode === 'points' ? ` (${c.points}점)` : ''}
- 판단할 문항: ${qs || '(정해지지 않음: 기준 내용과 맞는 문항을 학생 답 전체에서 찾을 것)'}
- 그 문항의 정답: ${ka.map(a => `${a.no}. ${a.answer}`).join(' / ') || '(정답표 없음)'}
- 학생 답: ${st.map(a => `${a.no}. ${a.text}`).join(' / ') || '(답 없음)'}${k.guide ? `\n- 판단 지침: ${k.guide}` : ''}`;
    }).join('\n\n');
    const parts = [{ text: taskBrief(task, false) }];
    if (task.question) parts.push({ text: '선생님 정답 메모(가장 먼저 따른다):\n' + task.question });
    parts.push({ text: '채점 기준별 자료:\n\n' + blocks });
    parts.push({ text: '학생 답 전체(참고):\n' + answers.map(a => `${a.no}. ${a.text}`).join('\n') });
    parts.push({ text: STRICT[lv] + `\n\n기준 ${task.criteria.length}개를 위 엄격도로 판단해 주세요. 기준마다 붙은 '학생 답'과 '정답'을 비교해 판단하고, 다른 문항의 답으로 판단하지 않습니다. evidence 는 학생 답에서 그대로 인용합니다.` });
    return call({ system: `너는 한국 고등학교 수행평가 채점을 돕는 조수다. 최종 점수는 교사가 정한다.
- 정답표의 정답을 기준으로 판단한다. 학생 답에 없는 내용을 지어내거나, 맞게 쓴 답을 틀렸다고 하지 않는다.
- 표현이 서툴러도 핵심이 정답과 같으면 맞음으로 본다. 판단이 애매하면 reason 에 '애매함'이라고 밝힌다.
- 충족을 가르는 선은 사용자가 준 채점 엄격도를 따른다.`, parts, schema: JUDGE_SCHEMA, temperature: 0.1, signal, think: o.think === undefined ? 'low' : o.think, _model: o.model });
  }

  // ---------- 4. 세특(수행평가 한 개 몫) ----------
  const SETEUK_SCHEMA = O({
    text: S('생기부 세특 문구(교사 관찰 시점, ~함/~임/~보임 으로 끝나는 1~3문장)'),
    level: S('쓴 서술어 수준(기억/이해/적용/분석/평가/창조 중)'),
    quotes: A(S('세특 문장마다 근거가 된 학생 답 구절(학생 답안에서 그대로 옮김)'), '세특의 문장 순서대로, 문장마다 하나'),
  });
  const SETEUK_SYS = `너는 한국 고등학교 교사가 학교생활기록부 '교과 세부능력 및 특기사항(세특)'을 쓰도록 돕는 조수다. 활동 한 개에 대한 문구를 쓴다. 이 문구는 과목 전체 세특의 가운데(활동 부분)에 들어간다.
근거: 교사용 '생기부 작성 머신 v9.29' 규칙과 2026 학교생활기록부 기재요령.

반드시 지킬 것:
1. 자료에 있는 것만 쓴다(학생 답안, 채점 결과, 교사 메모). 활동·수치·역량·사례를 지어내지 않는다. 과학적으로 틀린 내용은 넣지 않는다.
2. 부정적인 내용은 쓰지 않는다. '미흡, 부족, 못함, 어려움, 실수, 오류, 아쉬움, 소홀, 다만, 그러나 ~하지 않음' 같은 말과, 충족하지 못한 기준·틀린 답·빈칸은 언급하지 않는다. 학생이 실제로 해낸 것만 쓴다. 교사 메모에 개선한 사실이 있을 때만 '피드백을 반영해 ~을 보완함'처럼 개선한 행동을 쓰고, 무엇이 부족했는지는 쓰지 않는다.
3. 교사가 관찰한 시점으로, 명사형으로 끝낸다(~함, ~임, ~보임). '~을 느낌, ~라고 생각함, ~을 깨달음, ~을 알게 됨, ~을 배움, ~을 이해함, ~을 인식함, ~다짐함'으로 끝내지 않는다. 이해는 '~을 설명함'처럼 드러난 행동으로 쓴다.
4. 근거 없는 꾸밈말(적극적으로, 호기심을 가지고, 열정적으로, 진지한 태도로)을 붙이지 않는다. 같은 반 누구에게나 붙일 수 있는 정형 문장(예: 주어진 자료를 바탕으로 ~을 분석함)으로 채우지 말고, 그 학생 답의 고유한 내용(사례, 근거, 개념)을 앞세운다.
5. '수행평가'라는 말을 쓰지 않는다. 첫 문장은 활동을 자연스럽게 가리키는 짧은 말로 시작한다: '[활동 이름] 활동에서는', '[활동 이름]에서는', '[주제] 탐구에서는', '[주제] 실험에서는', '[주제] 논술에서는', '[주제] 보고서 작성에서는'. 활동 이름은 붙여 쓴 계획서 이름을 그대로 쓰지 말고 자연스럽게 띄어 쓴다(효소실험탐구 → 효소 실험 탐구). 학생마다 같은 말로만 시작하지 않도록 이 가운데에서 알맞게 고른다.
6. 첫머리에 총평('~한 학생임', '~능력이 뛰어남')을 두지 않고, 끝에 '이처럼 ~' 같은 정리 문장도 두지 않는다. 보통 2문장, 둘째 문장은 '또한'(다른 내용) 또는 '특히'(더 깊은 내용, 상 수준만)로 이을 수 있다. 한 문장에서 '~하고, ~하여, ~하며'를 세 번 넘게 잇지 않고, 같은 종결 서술어를 두 문장 연속 쓰지 않는다.
7. 서술어는 성취 수준(자료의 '성취 수준' 줄)에 맞춘다. 자료에 드러난 수준보다 높이지 않는다.
   · 상: 분석·평가·창조 단계 서술어(분석함, 비교함, 규명함, 논증함, 설계함, 제안함)와 학생이 쓴 구체적 개념·변인·원리·수치. '정확히, 논리적으로, 체계적으로, 명확히' 같은 말은 근거가 있을 때만.
   · 중: 이해·적용 단계 서술어(해석함, 구분함, 예를 들어 설명함, 비교함, 적용함, 연결함). 맞게 쓴 내용 위주. 분석함, 규명함, 논증함, 설계함, 제안함은 쓰지 않는다.
   · 하: 가장 낮은 기억 단계 서술어만 쓴다(설명함, 기술함, 정리함, 확인함, 제시함, 나열함, 기록함). 구분함, 비교함, 분석함, 적용함, 규명함, 설계함 같은 높은 서술어는 쓰지 않는다. 학생 답안에 실제로 있는 내용만 쓰고, 충족한 기준 이름을 보고 내용을 지어내지 않는다. 자료가 적으면 짧아도 된다. '정확히, 논리적으로, 명확히, 체계적으로, 특히, 깊이' 같은 꾸밈말을 붙이지 않는다. 학생이 실제로 쓴 내용 가운데 맞는 것을 담백한 사실 문장으로 쓴다. 분량이 모자라면 그 내용을 더 구체적으로 풀어 쓰되 지어내지 않는다. 답이 거의 없으면 활동에 참여한 사실만 짧게 쓴다.
8. 학생 이름·번호·학교 이름을 쓰지 않는다. '나의, 나만의, 내가, 대회'는 어떤 형태로도 쓰지 않는다.
9. 특수문자는 마침표, 쉼표, 하이픈만 쓴다. 괄호, 따옴표, 가운뎃점, 물결표, 콜론을 쓰지 않는다.
10. 있는 그대로 쓴다(활동 형식). 평가 방법이 논술형·서술형·지필이면 학생은 답안지에 글로 답한 것이다. 그러므로 '실험을 설계함, 실험을 수행함, 측정함, 관찰함, 실험으로 확인함, 결과를 얻음'처럼 실제로 실험·측정·관찰을 한 것처럼 읽히는 서술을 쓰지 않는다. 대신 답안에 쓴 행위로 쓴다: '~을 고려한 실험 설계안을 서술함', '~을 변인으로 하는 실험 방법을 제시함', '~을 근거로 설명함', '자료의 그래프를 해석하여 서술함'. 실제 실험·측정·관찰은 교사 메모에 그 사실이 있을 때만 쓴다. 활동 이름에 '실험'이 들어 있어도 실제 실험을 했다는 뜻으로 쓰지 않는다.
11. 학생 답에 없는 사례·용어를 채점 기준이나 모범 답안을 보고 끌어오지 않는다. 사례(예: 세제, 빵 발효)는 학생이 답안에 쓴 것만 쓴다.
12. 상호명·기관명은 일반 명사로 바꾼다(유튜브→동영상 공유 플랫폼, 구글·네이버→포털사이트, 챗GPT→생성형 인공지능). 한글 명칭이 있는 학술 영문 이름·약어는 한글로 쓴다(PETase→페트 분해 효소, BMI→체질량지수). 영문은 교과서에서 영문이 표준인 것(DNA, RNA, ATP, pH)만 쓴다. 숫자는 아라비아 숫자, 단위는 한글(센티미터, 킬로그램).
13. 분량: 나이스 기준 바이트(한글 등은 3바이트, 영문·숫자·공백·마침표는 1바이트)로 지정 범위 안에 맞춘다.

예시(다른 주제로 지어낸 것. 구조와 서술어 수준만 참고하고 내용은 쓰지 말 것):
· 상(논술형): 중화 반응 탐구 활동에서는 수산화 나트륨 수용액의 부피를 조작 변인으로 두고 온도 변화로 중화점을 찾는 실험 설계안을 서술함. 특히 중화점에서 온도가 가장 높은 까닭을 생성된 물 분자 수와 연계해 논리적으로 설명함.
· 중(논술형): 중화 반응 탐구에서는 지시약의 색 변화 자료를 해석하여 중화점을 찾는 방법을 서술함. 또한 수소 이온과 수산화 이온이 만나 물이 생성되는 과정을 이온 모형에 적용해 설명함.
· 하(논술형): 중화 반응 탐구에서는 산성 용액과 염기성 용액에서 지시약의 색이 다르다는 내용을 기술함. 중화 반응이 일어나면 물이 생성된다는 사실을 정리함.

'문체 본보기'가 주어지면 문장 길이·이음말 쓰임을 본뜨되 위 규칙이 먼저다. 본보기의 내용·용어·수치는 이 학생 자료에 없으면 가져오지 않는다.`;

  async function seteuk(task, info, range, prev, signal, styles, o = {}) {
    if (isMock()) { await sleep(500, signal); return mockSeteuk(task, info, range); }
    const parts = [{ text: taskBrief(task, false) }];
    if (styles && styles.length) parts.push({ text: '문체 본보기(선생님이 예전에 쓴 세특의 활동 부분. 문장 구조·길이·이음말·서술어만 본뜨고 내용은 가져오지 말 것):\n' + styles.map((t, i) => `${i + 1}) ${t}`).join('\n') });
    parts.push({ text: `평가 방법: ${task.method || '알 수 없음'} — ${/논술|서술|지필|쓰기/.test(task.method || '') ? '학생은 답안지에 글로 답했다. 실제로 실험·측정·관찰한 것처럼 쓰지 말고 답안에 쓴 행위(서술함, 제시함, 설명함)로 쓴다.' : '자료에 있는 활동만 있는 그대로 쓴다.'}` });
    parts.push({ text: `활동 이름: ${task.name} (첫 문장은 이 이름을 자연스럽게 띄어 쓴 꼴로 '~활동에서는' 또는 '~에서는'으로 시작. '수행평가'라는 말은 쓰지 않음)` });
    parts.push({ text: '이 학생의 자료:\n' + info });
    parts.push({ text: `분량: ${range[0]}~${range[1]}바이트(한글 약 ${Math.round(range[0] / 3)}~${Math.round(range[1] / 3)}자).${range[2] ? ' 성취 수준 하: 자료에 있는 만큼만, 짧아도 됨.' : ''}` });
    if (prev) parts.push({ text: `직전 초안은 ${prev.bytes}바이트라서 범위를 벗어났습니다. ${prev.bytes > range[1] ? '내용을 압축해' : '그 학생 답의 구체적 내용을 더해'} ${range[0]}~${range[1]}바이트로 다시 써 주세요.\n직전 초안: ${prev.text}` });
    if (o.unsupported && o.unsupported.length) parts.push({ text: '직전 초안의 다음 내용은 학생 답안에서 근거를 찾을 수 없습니다. 이 내용을 빼거나 답안에 있는 내용으로 바꿔 다시 써 주세요:\n' + o.unsupported.join('\n') });
    parts.push({ text: 'quotes 에는 문장마다 그 근거가 된 학생 답 구절을 학생 답안에서 그대로 옮겨 적는다. 근거 구절을 댈 수 없는 내용은 쓰지 않는다. 근거 없는 꾸밈말(논리적으로, 체계적으로, 과학적 메커니즘과 연계하여 등)도 쓰지 않는다.' });
    const P = plan().seteuk;
    return call({ system: SETEUK_SYS, parts, schema: SETEUK_SCHEMA, temperature: 0.4, signal, think: 'think' in o ? o.think : P.think, _model: o.model || P.model });
  }

  function taskBrief(task, withGuide) {
    const L = [];
    L.push(`과목: ${task._subject || ''}`);
    L.push(`수행평가: ${task.name} (만점 ${task.maxScore}점, ${task.method || ''})`);
    if (task.assignment) L.push(`수행 과제: ${task.assignment}`);
    if (!withGuide && task.standards && task.standards.length) L.push('성취기준:\n' + task.standards.map(s => typeof s === 'string' ? s : `${s.code} ${s.text}`).join('\n'));

    L.push(`채점 방식: ${task.mode === 'points' ? '항목별 배점 합산' : '충족한 항목 수로 점수 결정'}`);
    L.push('채점 기준 항목(기준 번호와 문항 번호는 다를 수 있음):\n' + task.criteria.map((c, i) => `${i + 1}. ${c.text}${task.mode === 'points' ? ` (${c.points}점)` : ''}${withGuide && c.qnos ? `\n   - 판단할 문항: ${c.qnos}번` : ''}${withGuide && c.guide ? `\n   - 판단 기준: ${c.guide}` : ''}`).join('\n'));
    return L.join('\n');
  }

  // ---------- 가짜 응답(키 = mock) ----------
  function mockPlan() {
    return {
      subject: '세포와 물질대사', grade: '2', semester: '2', school_year: '2026',
      tasks: [{
        name: '효소실험탐구', maxScore: 20, method: '논술형', period: '10월 3주',
        assignment: '효소의 활성에 온도와 pH가 미치는 영향 및 효소가 실생활에 사용되는 예를 탐구한다.',
        standards: ['[12세포02-03]', '[12세포02-04]', '[12세포02-05]'], mode: 'count',
        criteria: ['효소의 종류를 기능에 따라 구분하고 그 이유를 논리적으로 서술하였는가', '주어진 자료를 보고 효소 활성에 영향을 미치는 요인을 분석할 수 있는가', '효소의 활성에 미치는 영향(온도, pH)을 고려하여 실험을 설계하였는가', '효소의 작용 기작을 이해하고 효소기질 복합체 형성 과정을 서술하였는가', '효소가 생활과 산업에 이용되는 사례를 제시하였는가', '생활과 산업에 이용되는 효소의 원리를 기능과 특성의 관점에서 서술하였는가'].map(t => ({ text: t, points: 0 })),
        scale: [6, 5, 4, 3, 2, 1, 0].map((c, i) => ({ count: c, score: [20, 18, 16, 14, 12, 10, 8][i] })),
        specials: [{ label: '백지 제출자, 자발적 미참여자', score: 7 }, { label: '장기 미인정 결석자', score: 6 }],
      }, {
        name: '외래종탐구', maxScore: 25, method: '논술, 프로젝트', period: '11월', assignment: '(모의) 외래종을 조사하고 생물다양성에 미치는 영향을 논술한다.', standards: [], mode: 'count',
        parts: [{ name: '외래종 생물 탐구', kind: '활동형' }, { name: '외래종이 생물다양성에 미치는 영향 논술', kind: '논술형' }],
        criteria: [['외형적 특징을 구체적으로 그렸는가', 1], ['최초 유입 시기, 유입 목적 및 경로를 작성하였는가', 1], ['우리나라에서의 분포 및 특징을 작성하였는가', 1], ['생태계에 미치는 영향이 작성되었는가', 1], ['퇴치 방안 등 관리 방법이 제시되었는가', 1], ['제시된 조건에 맞춰 글을 작성하였는가', 2], ['자신의 의견을 근거와 함께 구체적으로 제시하였는가', 2], ['반론을 예상하고 반박 근거를 서술하였는가', 2]].map(([text, part]) => ({ text, points: 0, part })),
        scale: [[5, 15, 1], [4, 13, 1], [3, 11, 1], [2, 9, 1], [1, 7, 1], [0, 5, 1], [3, 10, 2], [2, 8, 2], [1, 6, 2], [0, 4, 2]].map(([count, score, part]) => ({ count, score, part })),
        specials: [{ label: '백지 제출', score: 9 }],
      }],
    };
  }
  function mockGrade(task, lv) {
    const cut = { '관대': 0.15, '보통': 0.35, '엄격': 0.6 }[lv] || 0.35;
    const crit = task.criteria.map((c, i) => {
      const met = Math.random() > cut;
      return { index: i + 1, met, points: task.mode === 'points' ? (met ? c.points : 0) : 0, evidence: met ? '(모의) 학생 답 인용' : '', reason: `[${c.qnos || i + 1}번] ` + (met ? '(모의) 핵심 개념과 이유가 맞음' : '(모의) 이유가 빠짐') };
    });
    return { transcript: '1. (모의 인식 결과) 펩신의 최적 pH 가 다르기 때문이다…\n2. A: 보조 인자, B: 주효소 …', blank: false, unreadable: false, criteria: crit, feedback: '(모의) pH 와 효소 활성의 관계를 정확히 설명했습니다. 보조 인자의 역할을 조금 더 구체적으로 써 보세요.', observation: '(모의) 펩신과 트립신의 최적 pH 차이로 소장에서의 작용을 설명함.' };
  }
  function mockSeteuk(task, info, range) {
    let t = `${task.name.replace(/(실험|탐구)/g, ' $1 ').replace(/\s+/g, ' ').trim()} 활동에서는 펩신과 트립신의 최적 pH 차이를 근거로 소장에서 펩신이 작용하는 조건을 설명하고, 온도와 pH를 변인으로 효소 활성 실험을 설계함.`;
    while (App.bytes(t) < range[0]) t += ' 결과를 기질 특이성과 연결해 분석함.';
    return { text: t, level: '분석', quotes: ['(모의) 1번 학생 답'] };
  }

  return { call, listModels, describe, recommend, extractPlan, makeGuide, grade, seteuk, isMock, usage, plan, makeKey, read, judge, pick, MODELS, usageToday, resetAt, orient, onUsage: f => useL.push(f) };
})();
