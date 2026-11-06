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
  // onPage({blob, thumb, w, h}) 를 쪽마다 부른다
  async function filePages(file, onPage, onProgress) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const vp0 = page.getViewport({ scale: 1 });
        const scale = Math.min(3, 1500 / vp0.width);
        const vp = page.getViewport({ scale });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        // intent 'print' = 화면 갱신(requestAnimationFrame)을 기다리지 않음 → 다른 탭으로 옮겨도 멈추지 않는다
        await page.render({ canvasContext: ctx, viewport: vp, intent: 'print' }).promise;
        await onPage({ blob: await canvasBlob(c), thumb: await canvasBlob(thumbCanvas(c), 'image/jpeg', 0.7), w: c.width, h: c.height });
        page.cleanup();
        onProgress && onProgress(i, pdf.numPages);
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
  async function maskedBase64(blob, rects, maxSide = 1600) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadImage(url);
      const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      ctx.fillStyle = '#000';
      for (const r of rects || []) ctx.fillRect(r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height);
      const b = await canvasBlob(c, 'image/jpeg', 0.85);
      return await toBase64(await b.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }

  return { planFile, planFocus, planDetails, filePages, maskedBase64, hwpToText, hwpxToText, toBase64 };
})();
