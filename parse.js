// 파일 읽기: 평가계획서(hwp·hwpx·pdf·txt)와 학생 제출물(pdf·이미지)
'use strict';

const Parse = (() => {
  // ---------- 한글(.hwp, 5.0) 본문 글자 뽑기 ----------
  function u8(x) { return x instanceof Uint8Array ? x : new Uint8Array(x); }

  function hwpRecordsText(data) {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const lines = [];
    let i = 0;
    while (i + 4 <= data.length) {
      const h = dv.getUint32(i, true); i += 4;
      const tag = h & 0x3ff;
      let size = (h >>> 20) & 0xfff;
      if (size === 0xfff) { size = dv.getUint32(i, true); i += 4; }
      if (tag === 67) { // HWPTAG_PARA_TEXT
        let s = '';
        const end = Math.min(i + size, data.length);
        for (let j = i; j + 1 < end; ) {
          const c = dv.getUint16(j, true);
          if (c < 32) {
            if (c === 10) { s += '\n'; j += 2; }
            else if (c === 13) { j += 2; }
            else if (c === 0 || (c >= 24 && c <= 31)) { if (c === 30 || c === 31) s += ' '; j += 2; }
            else { if (c === 9) s += '\t'; j += 16; } // 확장·인라인 제어 문자 = 8글자 크기
          } else { s += String.fromCharCode(c); j += 2; }
        }
        s = s.replace(/[ \t]+$/g, '');
        if (s.trim()) lines.push(s);
      }
      i += size;
    }
    return lines.join('\n');
  }

  async function hwpToText(buf) {
    if (!window.XLSX || !XLSX.CFB) throw new Error('한글 파일 읽기 도구를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
    const cfb = XLSX.CFB.read(u8(buf), { type: 'array' });
    const byPath = {};
    cfb.FullPaths.forEach((p, k) => { byPath[p.replace(/^Root Entry\//i, '/').replace(/^\/+/, '/').toLowerCase()] = cfb.FileIndex[k]; });
    const hdr = byPath['/fileheader'];
    if (!hdr) throw new Error('한글(.hwp) 파일이 아닙니다.');
    const hc = u8(hdr.content);
    const flags = hc[36] | (hc[37] << 8) | (hc[38] << 16) | (hc[39] << 24);
    if (flags & 2) throw new Error('암호가 걸린 한글 파일입니다. 암호를 풀고 다시 올려 주세요.');
    if (flags & 4) throw new Error('배포용 한글 파일은 읽을 수 없습니다. 한글에서 PDF 로 저장해 올려 주세요.');
    const compressed = !!(flags & 1);
    const out = [];
    for (let n = 0; n < 200; n++) {
      const ent = byPath['/bodytext/section' + n];
      if (!ent) break;
      let d = u8(ent.content);
      if (compressed) d = pako.inflateRaw(d);
      out.push(hwpRecordsText(d));
    }
    if (!out.length) throw new Error('본문을 찾지 못했습니다.');
    return out.join('\n');
  }

  // ---------- 한글(.hwpx) ----------
  async function hwpxToText(buf) {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter(n => /^Contents\/section\d+\.xml$/i.test(n))
      .sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));
    if (!names.length) throw new Error('hwpx 본문을 찾지 못했습니다.');
    const out = [];
    for (const n of names) {
      const xml = await zip.file(n).async('string');
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      const ps = doc.getElementsByTagName('*');
      for (const el of ps) {
        if (el.localName !== 'p') continue;
        // 표 안의 문단은 그 문단만, 바깥 문단은 직접 가진 글자만
        let s = '';
        for (const t of el.getElementsByTagName('*')) {
          if (t.localName === 't' && t.closest && nearestP(t) === el) s += t.textContent;
        }
        if (s.trim()) out.push(s.trim());
      }
    }
    return out.join('\n');
  }
  function nearestP(node) {
    let n = node.parentNode;
    while (n && n.localName !== 'p') n = n.parentNode;
    return n;
  }

  // ---------- PDF 글자(참고용) ----------
  async function pdfText(buf) {
    const pdf = await pdfjsLib.getDocument({ data: u8(buf).slice() }).promise;
    const out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      let line = '', lastY = null;
      const lines = [];
      for (const it of tc.items) {
        const y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line); line = ''; }
        line += it.str; lastY = y;
      }
      lines.push(line);
      out.push(lines.join('\n'));
    }
    return out.join('\n');
  }

  // 평가계획서 글에서 수행평가 채점에 필요한 부분만 남긴다(월별 수업 계획·성취기준별 성취수준·평가 방침은 뺌)
  // 흔한 양식: … 4. 평가의 종류와 반영비율(표) → 5. 성취도 → 6. 정의적 능력 평가 → 7. 수행평가(목적·방침) → 라. 영역별 세부평가 기준
  function planFocus(text) {
    if (!text || text.length < 6000) return text;
    const lastOf = (ks, from = 0) => { let best = -1; for (const k of ks) { const i = text.lastIndexOf(k); if (i >= from && i > best) best = i; } return best; };
    const firstOf = (ks, from = 0) => { let best = -1; for (const k of ks) { const i = text.indexOf(k, from); if (i >= 0 && (best < 0 || i < best)) best = i; } return best; };
    let start = lastOf(['평가의 종류와 반영', '평가의 종류 및 반영', '평가 종류와 반영', '평가 영역 및 반영']);
    const detail = firstOf(['세부평가 기준', '세부 평가 기준', '세부평가기준', '영역별 평가 기준', '수행평가 세부'], Math.max(0, start));
    if (start < 0) {
      if (detail < 0) return text;
      start = detail;
    }
    // 반영비율 표 ~ 정의적 능력 평가 앞까지 + 세부평가 기준부터 끝까지
    const mid = firstOf(['정의적 능력', '정의적 영역'], start);
    let out = text.slice(start, mid > start && detail > mid ? mid : (detail > start ? detail : text.length));
    if (detail > start) out += '\n…\n' + text.slice(Math.max(0, text.lastIndexOf('\n', detail - 1) - 40), text.length);
    return out.length > 1500 ? out : text;
  }

  // AI 가 돌려준 영역 이름·성취기준 코드로, 계획서 글에서 성취기준 문장과 성취수준(A~E)을 직접 찾아 채운다
  function planDetails(text, name, codes) {
    const norm = s => String(s || '').replace(/\s+/g, '');
    const out = { standards: [], levels: [] };
    (codes || []).forEach(c => {
      const code = (String(c).match(/\[[^\]]+\]/) || [String(c)])[0];
      const m = text.match(new RegExp(code.replace(/[[\]()]/g, '\\$&') + '\\s*([^\\n\\[]{8,})'));
      out.standards.push({ code, text: m ? m[1].replace(/\s+/g, ' ').trim() : '' });
    });
    // 영역 제목(예: "1) 효소실험탐구 [20점]") 뒤 구간에서 A~E 줄을 읽는다
    const lines = text.split('\n');
    let i = lines.findIndex(l => /^\s*\d+\)/.test(l) && norm(l).includes(norm(name)));
    if (i < 0) return out;
    let end = lines.findIndex((l, k) => k > i && /^\s*\d+\)\s*\S/.test(l) && /\[\s*\d+\s*점\s*\]/.test(l));
    if (end < 0) end = lines.length;
    const sec = lines.slice(i, end);
    const s0 = sec.findIndex(l => /성취수준/.test(l));
    if (s0 < 0) return out;
    let cur = null;
    for (const l of sec.slice(s0 + 1)) {
      const t = l.trim();
      if (/^(평가\s*방법|평가\s*요소|수행\s*수준|척도|배점)/.test(t)) break;
      if (/^[A-E]$/.test(t)) { cur = { grade: t, text: '' }; out.levels.push(cur); continue; }
      if (cur && t) cur.text += (cur.text ? ' ' : '') + t;
    }
    out.levels = out.levels.filter(l => l.text);
    return out;
  }

  // 평가계획서 → { text, pdfBase64? }
  async function planFile(file) {
    const name = file.name.toLowerCase();
    const buf = await file.arrayBuffer();
    if (name.endsWith('.hwp')) return { text: await hwpToText(buf) };
    if (name.endsWith('.hwpx')) return { text: await hwpxToText(buf) };
    if (name.endsWith('.pdf')) {
      let text = '';
      try { text = await pdfText(buf); } catch (e) { /* 스캔본이면 비어 있음 */ }
      return { text, pdf: await toBase64(buf), mime: 'application/pdf' };
    }
    if (/\.(txt|md|csv)$/.test(name)) return { text: new TextDecoder('utf-8').decode(buf) };
    throw new Error('hwp, hwpx, pdf, txt 파일만 읽을 수 있습니다.');
  }

  // ---------- 학생 제출물 → 쪽 그림 ----------
  function canvasBlob(c, type = 'image/jpeg', q = 0.82) {
    return new Promise(res => c.toBlob(res, type, q));
  }
  function thumbCanvas(src, w = 240) {
    const s = w / src.width;
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.round(src.height * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  // ---------- 스캔 PDF 빠른 길 ----------
  // 스캐너로 만든 PDF 는 쪽마다 JPEG 그림 하나뿐이다. pdf.js 는 그 JPEG 를 자바스크립트로 풀어서 느리므로(쪽당 2~3초),
  // PDF 안의 JPEG 바이트를 그대로 꺼내 브라우저가 직접 풀게 한다(쪽당 0.1~0.3초). 조금이라도 다른 모양이면 null → pdf.js 로 그린다.
  function pdfIndex(bytes) {
    const txt = new TextDecoder('latin1').decode(bytes);
    const idx = new Map();
    const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
    while ((m = re.exec(txt))) idx.set(Number(m[1]), m.index + m[0].length); // 뒤에 나온 것이 최신(증분 저장)
    const inner = new Map(); // 압축된 객체 묶음(ObjStm) 안의 객체: 번호 → 글
    const P = { txt, bytes, idx, inner };
    for (const [num] of idx) {
      const o = getObj(P, num, true);
      if (!o || !/\/Type\s*\/ObjStm/.test(o.dict)) continue;
      try {
        const data = streamData(P, o); if (!data) continue;
        const s = new TextDecoder('latin1').decode(data);
        const n = Number(val(o.dict, 'N')), first = Number(val(o.dict, 'First'));
        const head = s.slice(0, first).trim().split(/\s+/).map(Number);
        for (let k = 0; k < n; k++) {
          const on = head[2 * k], off = head[2 * k + 1], next = k + 1 < n ? head[2 * k + 3] : s.length - first;
          if (!idx.has(on) || inner.has(on)) inner.set(on, s.slice(first + off, first + next));
        }
      } catch (e) { /* 넘어감 */ }
    }
    return P;
  }
  // 객체 하나: { dict(글), start(스트림 시작 바이트), length }
  function getObj(P, num, raw) {
    if (!raw && P.inner.has(num)) return { dict: P.inner.get(num) };
    const at = P.idx.get(num); if (at == null) return null;
    const end = P.txt.indexOf('endobj', at);
    const body = P.txt.slice(at, end < 0 ? at + 200000 : end);
    const si = body.search(/\bstream\r?\n/);
    if (si < 0) return { dict: body };
    const sm = body.slice(si).match(/^stream\r?\n/);
    return { dict: body.slice(0, si), start: at + si + sm[0].length, endHint: end };
  }
  // 사전 글에서 /Key 의 값(참조 'n g R', << >>, [ ], 이름, 숫자)
  function val(dict, key) {
    const re = new RegExp('/' + key + '(?![A-Za-z0-9])\\s*');
    const m = re.exec(dict); if (!m) return null;
    let i = m.index + m[0].length; const s = dict;
    if (s.startsWith('<<', i)) { let d = 0, j = i; for (; j < s.length; j++) { if (s.startsWith('<<', j)) { d++; j++; } else if (s.startsWith('>>', j)) { d--; j++; if (!d) break; } } return s.slice(i, j + 1); }
    if (s[i] === '[') { let d = 0, j = i; for (; j < s.length; j++) { if (s[j] === '[') d++; else if (s[j] === ']' && !--d) break; } return s.slice(i, j + 1); }
    const r = /^(\d+)\s+(\d+)\s+R/.exec(s.slice(i)); if (r) return r[0];
    const t = /^(\/[^\s/<>\[\]()]+|[-+\d.]+|true|false|null)/.exec(s.slice(i)); return t ? t[1] : null;
  }
  const refNum = v => { const m = /^(\d+)\s+\d+\s+R$/.exec(String(v || '').trim()); return m ? Number(m[1]) : null; };
  function resolveDict(P, v) { const n = refNum(v); if (n == null) return v; const o = getObj(P, n); return o ? o.dict : null; }
  function streamData(P, o) {
    if (o.start == null) return null;
    let len = Number(val(o.dict, 'Length'));
    if (!Number.isFinite(len) || refNum(val(o.dict, 'Length')) != null) {
      const ln = refNum(val(o.dict, 'Length'));
      if (ln != null) { const lo = getObj(P, ln); len = lo ? Number(lo.dict.trim().split(/\s+/)[0]) : NaN; }
    }
    if (!Number.isFinite(len) || len <= 0 || o.start + len > P.bytes.length) {
      const e = P.txt.indexOf('endstream', o.start); if (e < 0) return null; len = e - o.start;
    }
    let data = P.bytes.subarray(o.start, o.start + len);
    const f = val(o.dict, 'Filter') || '';
    if (/FlateDecode/.test(f) && !/DCTDecode/.test(f)) data = pako.inflate(data);
    return data;
  }
  function mul(a, b) { // 3x3 의 앞 6개(a b c d e f): a 다음 b
    return [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
  }
  // 쪽 번호(ref.num) → { jpeg(Uint8Array), ctm } 또는 null
  function fastPage(P, num) {
    let pg = getObj(P, num); if (!pg) return null;
    let res = val(pg.dict, 'Resources'), parent = val(pg.dict, 'Parent'), guard = 0;
    while (!res && parent && guard++ < 20) { const pd = resolveDict(P, parent); if (!pd) break; res = val(pd, 'Resources'); parent = val(pd, 'Parent'); }
    res = resolveDict(P, res); if (!res) return null;
    const xo = resolveDict(P, val(res, 'XObject')); if (!xo) return null;
    // 내용 스트림 → q/Q/cm/Do 만 따라간다. 글자·선을 그리면 빠른 길을 쓰지 않는다
    let cv = val(pg.dict, 'Contents'); if (!cv) return null;
    const refs = cv.trim().startsWith('[') ? [...cv.matchAll(/(\d+)\s+\d+\s+R/g)].map(m => Number(m[1])) : [refNum(cv)];
    let content = '';
    for (const r of refs) { const o = getObj(P, r); const d = o && streamData(P, o); if (!d) return null; content += new TextDecoder('latin1').decode(d) + '\n'; }
    const toks = content.match(/\/[^\s/<>\[\]()]+|[-+]?\d*\.?\d+|[A-Za-z'"*]+|\S/g) || [];
    let ctm = [1, 0, 0, 1, 0, 0]; const stack = []; const nums = []; let found = null;
    for (const t of toks) {
      if (/^[-+]?\d*\.?\d+$/.test(t)) { nums.push(Number(t)); continue; }
      if (t[0] === '/') { nums.push(t); continue; }
      if (t === 'q') stack.push(ctm.slice());
      else if (t === 'Q') ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (t === 'cm') { const a = nums.slice(-6); if (a.length < 6) return null; ctm = mul(a, ctm); }
      else if (t === 'Do') { if (found) return null; found = { name: nums[nums.length - 1], ctm: ctm.slice() }; }
      else if (/^(Tj|TJ|'|"|S|s|f|F|f\*|B|B\*|b|b\*|sh|BI|EI|ID)$/.test(t)) return null; // 그림 말고 다른 것도 그림
      nums.length = 0;
    }
    if (!found || typeof found.name !== 'string') return null;
    const io = getObj(P, refNum(val(xo, found.name.slice(1)))); if (!io) return null;
    const d = io.dict;
    if (!/\/Subtype\s*\/Image/.test(d) || !/DCTDecode/.test(val(d, 'Filter') || '') || /FlateDecode/.test(val(d, 'Filter') || '')) return null;
    if (/\/(SMask|Mask|Decode|ImageMask)\b/.test(d)) return null;
    const cs = val(d, 'ColorSpace') || '';
    if (/CMYK|Indexed|Separation|DeviceN|Lab/.test(cs + (resolveDict(P, cs) || ''))) return null;
    const jpeg = streamData(P, io); if (!jpeg || jpeg[0] !== 0xFF || jpeg[1] !== 0xD8) return null;
    return { jpeg, ctm: found.ctm };
  }
  async function decodeJpeg(bytes) {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    try { return await createImageBitmap(blob, { imageOrientation: 'none' }); } catch (e) { return await createImageBitmap(blob); }
  }

  // onPage({blob, thumb, w, h}) 를 쪽마다 부른다
  async function filePages(file, onPage, onProgress) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let P = null; try { P = pdfIndex(bytes); } catch (e) { P = null; }
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      let fast = 0;
      const one = async i => {
        const page = await pdf.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 1500 / vp0.width);
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        let done = false;
        const fp = P && page.ref ? (() => { try { return fastPage(P, page.ref.num); } catch (e) { return null; } })() : null;
        if (fp) {
          try {
            const bmp = await decodeJpeg(fp.jpeg);
            ctx.save();
            ctx.setTransform(...vp.transform); ctx.transform(...fp.ctm); ctx.transform(1, 0, 0, -1, 0, 1);
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bmp, 0, 0, 1, 1);
            ctx.restore(); bmp.close && bmp.close();
            done = true; fast++;
          } catch (e) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
        }
        // intent 'print' = 화면 갱신(requestAnimationFrame)을 기다리지 않음 → 다른 탭으로 옮겨도 멈추지 않는다
        if (!done) await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
        page.cleanup();
        return { blob: await canvasBlob(c), thumb: await canvasBlob(thumbCanvas(c), 'image/jpeg', 0.7), w: c.width, h: c.height };
      };
      // 세 쪽씩 겹쳐 처리하되, 저장은 쪽 순서대로
      const N = pdf.numPages, pending = new Map(); let next = 1;
      for (let i = 1; i <= N; i++) {
        pending.set(i, one(i));
        if (pending.size >= 3 || i === N) {
          while (pending.has(next) && (pending.size >= 3 || i === N)) {
            const pg = await pending.get(next); pending.delete(next);
            await onPage(pg); onProgress && onProgress(next, N, fast); next++;
          }
        }
      }
      pdf.destroy();
      return;
    }
    if (/\.(png|jpe?g|webp|gif|bmp)$/.test(name)) {
      const img = await loadImage(URL.createObjectURL(file));
      const scale = Math.min(1, 1600 / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      await onPage({ blob: await canvasBlob(c), thumb: await canvasBlob(thumbCanvas(c), 'image/jpeg', 0.7), w: c.width, h: c.height });
      onProgress && onProgress(1, 1);
      return;
    }
    throw new Error(file.name + ': pdf 나 그림 파일만 올릴 수 있습니다.');
  }

  function loadImage(src) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  }
  function toBase64(buf) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.readAsDataURL(new Blob([buf]));
    });
  }

  // 가림 영역을 칠한 그림(AI 로 보낼 것) → base64 jpeg
  async function maskedBase64(blob, rects, maxSide = 1400, label) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.fillStyle = '#000';
      for (const r of rects || []) {
        const x = r.x * c.width, y = r.y * c.height, w = r.w * c.width, h = r.h * c.height;
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h);
        if (label && w > 24 && h > 10) { // 가린 칸에 이름 대신 번호(No.01)
          const fs = Math.max(10, Math.min(h * 0.6, w / (label.length * 0.62)));
          ctx.fillStyle = '#fff'; ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, x + w / 2, y + h / 2);
        }
      }
      const b = await canvasBlob(c, 'image/jpeg', 0.85);
      return await toBase64(await b.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }

  return { planFile, planFocus, planDetails, filePages, maskedBase64, hwpToText, hwpxToText, toBase64 };
})();
