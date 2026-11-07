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
  const isMock = () => (cfg().apiKey || '').trim().toLowerCase() === 'mock';

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
    // 생각하기(thinking)를 줄여 빠르게: 정리·옮겨 쓰기처럼 단순한 일에만(opts.think = 'low')
    const tc = opts.think === 'low' && !opts._noThink ? thinkCfg(model) : null;
    if (tc) body.generationConfig.thinkingConfig = tc;
    const stream = typeof opts.onText === 'function';
    let wait = 2000;
    for (let attempt = 0; ; attempt++) {
      const r = await fetch(`${BASE}/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        let txt = '', why = '';
        const take = j => {
          const cand = j.candidates && j.candidates[0];
          if (cand && cand.content) txt += (cand.content.parts || []).filter(p => !p.thought).map(p => p.text || '').join('');
          why = (cand && cand.finishReason) || (j.promptFeedback && j.promptFeedback.blockReason) || why;
        };
        if (stream) {
          // 받는 대로 글자 수를 알려 준다(server-sent events: "data: {...}")
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let k;
            while ((k = buf.indexOf('\n')) >= 0) {
              const line = buf.slice(0, k).trim(); buf = buf.slice(k + 1);
              if (line.startsWith('data:')) { try { take(JSON.parse(line.slice(5))); opts.onText(txt.length); } catch (e) {} }
            }
          }
          if (buf.trim().startsWith('data:')) { try { take(JSON.parse(buf.trim().slice(5))); } catch (e) {} }
        } else take(await r.json());
        if (!txt) throw new Error('AI 가 답을 주지 않았습니다(' + (why || '빈 응답') + ').');
        try { return JSON.parse(txt); }
        catch (e) { throw new Error(why === 'MAX_TOKENS' ? 'AI 답이 너무 길어 잘렸습니다. 계획서에서 수행평가 부분만 붙여 넣어 다시 해 보세요.' : 'AI 응답을 읽지 못했습니다. 다시 시도해 주세요.'); }
      }
      let msg = '';
      try { msg = (await r.json()).error.message; } catch (e) { msg = r.statusText; }
      // 이 모델이 생각하기 설정을 모르면 설정 없이 다시
      if (r.status === 400 && tc && /think/i.test(msg)) return call(Object.assign({}, opts, { _noThink: true }), retried);
      if (r.status === 429 || r.status === 503 || r.status === 500) {
        // 바쁨(503·500)은 같은 모델로 한 번만 다시, 한도(429)는 곧바로 — 그다음은 다른 모델로 넘어간다(한도·혼잡은 모델마다 따로)
        const next = r.status === 429 || attempt >= 1 ? fallback(model, tried) : null;
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
  function fallback(model, tried) {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem('aigrader-models') || '[]'); } catch (e) {}
    if (!ids.length) ids = ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'];
    const cur = describe(model);
    const plain = /^gemini-(\d+(\.\d+)?-(pro|flash|flash-lite)(-\d{3})?|(pro|flash|flash-lite)-latest)$/;
    const ok = d => !tried.includes(d.id) && plain.test(d.id) && (d.latest || (d.ver >= 2.5 && !d.preview)) &&
      (d.tier === 'flash' || d.tier === 'flash-lite' || (d.tier === 'pro' && cur.tier === 'pro'));
    const list = sortModels(ids).filter(ok);
    const rank = d => (d.tier === cur.tier ? 0 : d.tier === 'flash' ? 1 : 2);
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
  function thinkCfg(id) {
    const d = describe(id);
    if (d.latest || d.ver >= 3) return { thinkingLevel: 'low' };
    if (d.ver >= 2.5) return { thinkingBudget: d.tier === 'pro' ? 128 : 0 }; // 2.5 Pro 는 끌 수 없어 최소값
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
      criteria: A(O({ text: S('채점 기준 항목 문장(원문 그대로)'), points: N('points 방식이면 그 항목 배점, count 방식이면 0') })),
      scale: A(O({ count: I('충족 항목 수'), score: N('점수') }), 'count 방식의 환산표. 0개(기본점수)까지 포함'),
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
- 성취수준 설명이나 평가 방침 같은 긴 글은 옮기지 않는다(앱이 따로 읽는다). 짧게 답한다.
- 계획서에 없는 내용은 지어내지 않는다.`;

  // text = 앱이 수행평가 부분만 잘라 낸 글. 글을 뽑을 수 없는 스캔 PDF 만 파일째 보낸다.
  async function extractPlan({ text, pdf, mime }, onText, onWait) {
    if (isMock()) { for (let i = 1; i <= 5; i++) { await sleep(150); onText && onText(i * 300); } return mockPlan(); }
    const parts = [];
    if (pdf && (!text || text.trim().length < 300)) parts.push({ inline_data: { mime_type: mime || 'application/pdf', data: pdf } });
    else if (text) parts.push({ text: '평가계획서(수행평가 부분):\n' + text.slice(0, 60000) });
    parts.push({ text: '위 평가계획서에서 수행평가 영역별 채점 기준을 JSON 으로 뽑아 주세요.' });
    return call({ system: PLAN_SYS, parts, schema: PLAN_SCHEMA, temperature: 0.1, think: 'low', onText, onWait });
  }

  // ---------- 2. 채점 지침 다듬기(문항지를 보고) ----------
  const GUIDE_SCHEMA = O({
    answerKey: S('문항별 모범 답안 요지(문항 번호마다 한두 줄)'),
    criteria: A(O({ index: I('채점 기준 번호(1부터)'), guide: S('판단 기준: 충족으로 볼 핵심 요소, 부분 인정 여부, 흔한 오답') })),
  });
  async function makeGuide(task, images) {
    if (isMock()) return { answerKey: '1. (모의) 펩신은 최적 pH 2, 소장은 pH 8 이라 활성이 떨어진다.\n2. (모의) A 보조 인자, B 주효소…', criteria: task.criteria.map((c, i) => ({ index: i + 1, guide: '(모의 지침) ' + c.text.slice(0, 30) + '… 핵심 개념과 이유가 함께 있으면 충족' })) };
    const parts = [{ text: taskBrief(task, true) }];
    if (task.question) parts.push({ text: '선생님이 적은 문항·정답 메모:\n' + task.question });
    images.forEach((b64, i) => { parts.push({ text: `문항지(학생 답안지) ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: '문항지의 각 문항이 어떤 채점 기준 항목과 이어지는지 보고, 항목마다 채점 지침(guide)과 문항별 모범 답안 요지(answerKey)를 써 주세요. 학생이 쓴 손글씨 답은 정답 판단에 쓰지 말고 문항 글만 보세요.' });
    return call({ system: '너는 고등학교 과학 수행평가 채점 지침을 만드는 교사 조수다. 교과서 수준의 정확한 과학 내용으로 쓰고, 채점 기준 원문의 뜻을 넓히거나 좁히지 않는다.', parts, schema: GUIDE_SCHEMA, temperature: 0.2 });
  }

  // ---------- 3. 학생 답안 채점 ----------
  const GRADE_SCHEMA = O({
    transcript: S('학생 답안을 문항 번호별로 옮겨 적은 것(손글씨 그대로, 읽을 수 없는 글자는 □)'),
    blank: B('답안이 백지이거나 의미 있는 답이 거의 없으면 true'),
    unreadable: B('글씨가 흐리거나 잘려서 판단이 어려우면 true'),
    criteria: A(O({
      index: I('채점 기준 번호(1부터)'),
      met: B('충족 여부'),
      points: N('points 방식일 때 준 점수, count 방식이면 0'),
      evidence: S('판단 근거가 된 학생 답 인용(짧게)'),
      reason: S('충족/미충족 이유 한두 문장'),
    })),
    feedback: S('학생에게 돌려줄 피드백 2~3문장(잘한 점 1 + 보완할 점 1~2, 존댓말)'),
    observation: S('세특 작성을 위한 관찰 요약: 학생이 실제로 보여 준 이해·사고 수준과 특징 2~3문장(답안에 있는 사실만)'),
  });
  const GRADE_SYS = `너는 한국 고등학교 수행평가 채점을 돕는 조수다. 최종 점수는 교사가 정한다.
규칙:
- 이미지 속 학생 손글씨 답안을 먼저 정확히 읽어 transcript 에 문항별로 옮긴다. 검은 상자로 가린 곳은 개인정보이니 읽으려 하지 않는다.
- 채점 기준 항목마다 학생 답이 그 기준을 충족하는지 판단한다. 채점 지침(guide)이 있으면 따른다.
- 답이 과학적으로 틀렸거나 핵심 이유가 빠졌으면 충족이 아니다. 표현이 서툴러도 핵심 개념과 이유가 맞으면 충족이다.
- 근거(evidence)는 학생 답에서 그대로 인용한다. 답안에 없는 내용을 지어내지 않는다.
- 판단이 애매하면 reason 에 '애매함'이라고 밝힌다.`;

  async function grade(task, images, signal) {
    if (isMock()) { await sleep(600, signal); return mockGrade(task); }
    const parts = [{ text: taskBrief(task, true) }];
    if (task.answerKey) parts.push({ text: '문항별 모범 답안 요지:\n' + task.answerKey });
    if (task.question) parts.push({ text: '선생님 메모:\n' + task.question });
    images.forEach((b64, i) => { parts.push({ text: `학생 답안 ${i + 1}쪽:` }); parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64 } }); });
    parts.push({ text: `채점 기준 ${task.criteria.length}개 항목을 모두 판단해 JSON 으로 답해 주세요.` });
    return call({ system: GRADE_SYS, parts, schema: GRADE_SCHEMA, temperature: 0.1, signal });
  }

  // ---------- 4. 세특(수행평가 한 개 몫) ----------
  const SETEUK_SCHEMA = O({
    text: S('생기부 세특 문구(교사 관찰 시점, ~함/~임/~보임 으로 끝나는 1~3문장)'),
    level: S('쓴 서술어 수준(기억/이해/적용/분석/평가/창조 중)'),
  });
  const SETEUK_SYS = `너는 한국 고등학교 교사가 학교생활기록부 '교과 세부능력 및 특기사항(세특)'을 쓰도록 돕는 조수다. 수행평가 한 개에 대한 문구를 쓴다.
반드시 지킬 것:
1. 자료(학생 답안, 채점 결과, 교사 메모)에 있는 사실만 쓴다. 활동·수치·역량을 지어내지 않는다. 학생 답 가운데 과학적으로 틀린 내용은 넣지 않는다.
2. 교사가 관찰한 시점으로 쓴다. 문장은 '~함', '~임', '~보임', '~설명함', '~분석함'처럼 끝낸다. '~을 느낌, ~라고 생각함, ~을 깨달음, ~을 알게 됨, ~을 배움, ~을 이해함, ~을 인식함, ~다짐함'으로 끝내지 않는다.
3. 서술어 수준은 실제 성취에 맞춘다(기억<이해<적용<분석<평가<창조). 기준을 많이 충족하고 이유를 논리적으로 쓴 학생은 분석·평가·설계 같은 서술어와 구체적 내용을, 충족이 적은 학생은 설명·구분 같은 낮은 서술어로 사실만 짧게 쓴다. 근거 없이 '적극적으로', '호기심을 가지고', '열정적으로' 같은 꾸밈말을 붙이지 않는다.
4. 첫머리에 수행평가 활동이 드러나게 쓴다(예: '효소 실험 탐구 활동에서'). 누구에게나 붙일 수 있는 정형 문장 대신 그 학생 답의 구체적 내용(개념·근거·사례)을 담는다.
5. 학생 이름·번호·학교 이름을 쓰지 않는다. '나의, 나만의, 내가, 대회'는 쓰지 않는다.
6. 특수문자는 마침표, 쉼표, 하이픈만 쓴다. 괄호와 따옴표를 쓰지 않는다.
7. 상호명·기관명은 일반 명사로 바꾼다(유튜브→동영상 공유 플랫폼, 구글·네이버→포털사이트, 챗GPT→생성형 인공지능). 영문 약어는 교과서에서 영문이 표준인 것(DNA, ATP, pH 등)만 쓴다. 숫자는 아라비아 숫자, 단위는 한글(센티미터, 킬로그램).
8. 분량: 나이스 기준 바이트(한글 등은 3바이트, 영문·숫자·공백·마침표는 1바이트)로 지정 범위 안에 맞춘다.`;

  async function seteuk(task, info, range, prev, signal) {
    if (isMock()) { await sleep(500, signal); return mockSeteuk(task, info, range); }
    const parts = [{ text: taskBrief(task, false) }];
    parts.push({ text: '이 학생의 자료:\n' + info });
    parts.push({ text: `분량: ${range[0]}~${range[1]}바이트(한글 약 ${Math.round(range[0] / 3)}~${Math.round(range[1] / 3)}자).` });
    if (prev) parts.push({ text: `직전 초안은 ${prev.bytes}바이트라서 범위를 벗어났습니다. ${prev.bytes > range[1] ? '내용을 압축해' : '그 학생 답의 구체적 내용을 더해'} ${range[0]}~${range[1]}바이트로 다시 써 주세요.\n직전 초안: ${prev.text}` });
    return call({ system: SETEUK_SYS, parts, schema: SETEUK_SCHEMA, temperature: 0.6, signal, think: 'low' });
  }

  function taskBrief(task, withGuide) {
    const L = [];
    L.push(`과목: ${task._subject || ''}`);
    L.push(`수행평가: ${task.name} (만점 ${task.maxScore}점, ${task.method || ''})`);
    if (task.assignment) L.push(`수행 과제: ${task.assignment}`);
    if (task.standards && task.standards.length) L.push('성취기준:\n' + task.standards.map(s => typeof s === 'string' ? s : `${s.code} ${s.text}`).join('\n'));
    if (task.levels && task.levels.length) L.push('성취수준:\n' + task.levels.map(l => `${l.grade}: ${l.text}`).join('\n'));
    L.push(`채점 방식: ${task.mode === 'points' ? '항목별 배점 합산' : '충족한 항목 수로 점수 결정'}`);
    L.push('채점 기준 항목:\n' + task.criteria.map((c, i) => `${i + 1}. ${c.text}${task.mode === 'points' ? ` (${c.points}점)` : ''}${withGuide && c.guide ? `\n   - 판단 기준: ${c.guide}` : ''}`).join('\n'));
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
      }],
    };
  }
  function mockGrade(task) {
    const crit = task.criteria.map((c, i) => {
      const met = Math.random() > 0.35;
      return { index: i + 1, met, points: task.mode === 'points' ? (met ? c.points : 0) : 0, evidence: met ? '(모의) 학생 답 인용' : '', reason: met ? '(모의) 핵심 개념과 이유가 맞음' : '(모의) 이유가 빠짐' };
    });
    return { transcript: '1. (모의 인식 결과) 펩신의 최적 pH 가 다르기 때문이다…\n2. A: 보조 인자, B: 주효소 …', blank: false, unreadable: false, criteria: crit, feedback: '(모의) pH 와 효소 활성의 관계를 정확히 설명했습니다. 보조 인자의 역할을 조금 더 구체적으로 써 보세요.', observation: '(모의) 펩신과 트립신의 최적 pH 차이로 소장에서의 작용을 설명함.' };
  }
  function mockSeteuk(task, info, range) {
    let t = `${task.name} 활동에서 펩신과 트립신의 최적 pH 차이를 근거로 소장에서 펩신이 작용하지 못하는 까닭을 설명하고, 온도와 pH를 변인으로 효소 활성 실험을 설계함.`;
    while (App.bytes(t) < range[0]) t += ' 결과를 기질 특이성과 연결해 분석함.';
    return { text: t, level: '분석' };
  }

  return { call, listModels, describe, recommend, extractPlan, makeGuide, grade, seteuk, isMock };
})();
