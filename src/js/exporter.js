// หน้าต่างส่งออก: สร้างงานส่งออกจากโปรเจกต์ วาดข้อความ/สติ๊กเกอร์เป็น PNG แล้วส่งให้ ffmpeg
(function () {
  const el = U.el;
  const EX = {};
  const even = (x) => { x = Math.max(2, Math.round(x)); return x % 2 ? x + 1 : x; };

  EX.open = () => {
    const p = S.project;
    if (!p.main.length) { U.toast('ยังไม่มีคลิปในแทร็กวิดีโอหลัก', 'err'); return; }
    const o = { res: 1080, fps: p.fps || 30, format: 'mp4', quality: 18, srt: false, name: p.name || 'วิดีโอ' };
    const name = el('input.text-in', { type: 'text', value: o.name, 'aria-label': 'ชื่อไฟล์' });
    name.oninput = () => { o.name = name.value; };
    const size = el('span.muted');
    const updSize = () => {
      const k = o.res / Math.min(p.width, p.height);
      size.textContent = `${even(p.width * k)} × ${even(p.height * k)} · ${U.fmtShort(S.mainTotal())}`;
    };
    updSize();
    const hasSubs = p.overlays.some((x) => x.type === 'text' && x.isSub);
    const body = el('div.ai-form', null,
      el('div.field', null, el('label', null, 'ชื่อไฟล์'), name),
      U.select('ความละเอียด', o.res, [{ value: 480, label: '480p' }, { value: 720, label: '720p HD' }, { value: 1080, label: '1080p Full HD' }, { value: 1440, label: '2K 1440p' }, { value: 2160, label: '4K 2160p' }],
        (v) => { o.res = Number(v); updSize(); }),
      size,
      U.select('อัตราเฟรม', o.fps, [24, 25, 30, 50, 60].map((f) => ({ value: f, label: f + ' fps' })), (v) => { o.fps = Number(v); }),
      U.select('รูปแบบไฟล์', o.format, [
        { value: 'mp4', label: 'MP4 (H.264) — ใช้ได้ทุกที่' }, { value: 'hevc', label: 'MP4 (H.265/HEVC) — ไฟล์เล็กกว่า' },
        { value: 'webm', label: 'WebM (VP9)' }, { value: 'gif', label: 'GIF ภาพเคลื่อนไหว (ไม่มีเสียง)' }], (v) => { o.format = v; }),
      U.select('คุณภาพ', o.quality, [{ value: 15, label: 'สูงสุด (ไฟล์ใหญ่)' }, { value: 18, label: 'สูง (แนะนำ)' }, { value: 22, label: 'มาตรฐาน' }, { value: 27, label: 'ไฟล์เล็ก' }],
        (v) => { o.quality = Number(v); }),
      hasSubs ? U.toggle('บันทึกไฟล์ซับ .srt คู่กันด้วย', false, (v) => { o.srt = v; }) : null,
      el('p.muted-p', null, 'ตัวเข้ารหัส: ' + ({ x264: 'CPU', nvenc: 'การ์ดจอ NVIDIA', qsv: 'Intel Quick Sync', amf: 'AMD' }[App.settings.encoder || 'x264'] || 'CPU') + ' (เปลี่ยนได้ในตั้งค่า)'));
    let m;
    m = U.modal('ส่งออกวิดีโอ', body, {
      actions: [el('button.btn', { onclick: () => m.close() }, 'ยกเลิก'), el('button.btn.primary', { onclick: () => { m.close(); EX.run(o); } }, U.icon('export', 16), 'ส่งออก')],
    });
  };

  const toPng = async (c) => {
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  };

  // ภาพเต็มเฟรม (ข้อความ/รูปที่ไม่เคลื่อนไหว) — ใช้ canvas เดียวกับพรีวิว ฟอนต์จึงตรงกันทุกพิกเซล
  async function rasterize(o, W, H, k) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.scale(k, k);
    if (o.type === 'text') {
      await document.fonts.load(R.fontString(o, 1), o.text);
      R.drawText(g, o, 1);
    } else {
      let img = await U.loadImage(U.fileUrl(o.path));
      if (CP.needs(o)) img = CP.process(o, img, Math.max(2, o.w * (o.scale || 1) * k), Math.max(2, o.h * (o.scale || 1) * k));
      g.filter = R.filterFor(R.colorParams(o));
      g.translate(o.cx, o.cy);
      if (o.rotate) g.rotate(o.rotate * Math.PI / 180);
      g.scale((o.scale || 1) * (o.flipH ? -1 : 1), (o.scale || 1) * (o.flipV ? -1 : 1));
      g.globalAlpha = o.opacity == null ? 1 : o.opacity;
      g.drawImage(img, -o.w / 2, -o.h / 2, o.w, o.h);
    }
    return toPng(c);
  }

  // ภาพเฉพาะตัวรายการ (ยังไม่หมุน) สำหรับรายการที่มีภาพเคลื่อนไหว — ffmpeg จะหมุน/ย่อขยาย/เลื่อนให้ตามเวลา
  async function rasterizeItem(o, k) {
    const sc = o.scale || 1;
    let bw, bh, margin = 0;
    if (o.type === 'text') {
      await document.fonts.load(R.fontString(o, 1), o.text);
      const b = R.itemBox(o);
      bw = b.w; bh = b.h;
      if (o.shadow && o.shadow.enabled) margin = (o.shadow.blur * 2 + Math.max(Math.abs(o.shadow.x || 0), Math.abs(o.shadow.y || 0))) * sc;
      margin += 6;
    } else { bw = o.w * sc; bh = o.h * sc; }
    const w = even((bw + margin * 2) * k), h = even((bh + margin * 2) * k);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.scale(w / (bw + margin * 2), h / (bh + margin * 2));
    if (o.type === 'text') R.drawText(g, Object.assign({}, o, { cx: bw / 2 + margin, cy: bh / 2 + margin, rotate: 0, opacity: 1 }), 1);
    else {
      let img = await U.loadImage(U.fileUrl(o.path));
      if (CP.needs(o)) img = CP.process(o, img, Math.max(2, bw * k), Math.max(2, bh * k));
      g.filter = R.filterFor(R.colorParams(o));
      g.translate(bw / 2, bh / 2);
      g.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
      g.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    }
    return { data: await toPng(c), w, h, ux: bw * k, uy: bh * k };
  }

  // ข้อความขยับทีละตัวอักษร: วาดทุกเฟรมด้วยฟังก์ชันเดียวกับพรีวิว (ตรงกับที่เห็นทุกพิกเซล)
  async function rasterizeSeq(o, W, H, k, fps) {
    await document.fonts.load(R.fontString(o, 1), o.text);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const n = Math.max(1, Math.ceil(o.dur * fps));
    const frames = [];
    for (let f = 0; f < n; f++) {
      const local = f / fps;
      let a = 1;
      if (o.fadeIn && local < o.fadeIn) a = local / o.fadeIn;
      if (o.fadeOut && o.dur - local < o.fadeOut) a = Math.min(a, (o.dur - local) / o.fadeOut);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, W, H);
      g.scale(k, k);
      PV.drawOverlay(g, o, o.start + local, Math.max(0, Math.min(1, a)));
      frames.push(await toPng(c));
      if (EX.prep && f % 10 === 0) EX.prep('กำลังเตรียมข้อความเคลื่อนไหว', f / n);
    }
    return { kind: 'seq', frames, fps, start: o.start, dur: o.dur };
  }

  // ข้อมูลประมวลผลภาพที่ใช้ร่วมกันของคลิปหลัก/วิดีโอซ้อน
  async function procInfo(it, fw, fh, srcH, seg) {
    const L = CP.lutFor(it);
    const ch = KPresets.chromaParams(it.chroma);
    let segFile = null, segData = null;
    if (seg && window.SEG && SEG.active(it) && seg.media && seg.media.path) {
      EX.segN = (EX.segN || 0) + 1;
      const label = `กำลังลบพื้นหลังอัตโนมัติ (${it.name || seg.media.name || 'คลิป'})`;
      if (EX.prep) EX.prep(label, 0);
      if (seg.media.type === 'image') {
        segData = await SEG.maskPng(it, await U.loadImage(U.fileUrl(seg.media.path)));
      } else if (seg.media.type === 'video') {
        segFile = await SEG.maskVideo(it, seg.media, seg.in || 0, seg.dur, (p) => EX.prep && EX.prep(label, p));
      }
    }
    return {
      segFile, segData,
      lutData: L ? CP.cubeText(L) : null,
      chroma: ch ? { hex: ch.hex, sim: ch.sim, blend: ch.blend, spill: ch.spill, spillType: ch.spillType } : null,
      maskData: CP.maskActive(it) ? await CP.maskPng(it.mask, even(fw), even(fh)) : null,
      smooth: CP.smoothParams(it), srcH,
      denoise: it.denoise || 0,
    };
  }

  EX.buildJob = async (o, out) => {
    const p = S.project;
    const k = o.res / Math.min(p.width, p.height);
    const W = even(p.width * k), H = even(p.height * k);
    // กันธง hasAudio ค้างเป็นเท็จ (เช่น ไฟล์ที่เพิ่มเข้ามาโดยยังไม่มีข้อมูลเสียง): ตรวจไฟล์วิดีโอที่ถูกมองว่าไม่มีเสียงอีกครั้งตอนส่งออก
    const audioMap = {};
    {
      const need = new Set();
      for (const e of S.layout()) { const m = p.media[e.clip.mediaId] || {}; if (m.type === 'video' && !m.hasAudio && m.path) need.add(m.path); }
      for (const ov of p.overlays) {
        if (ov.type !== 'video') continue;
        const m = p.media[ov.mediaId] || {};
        if (!(ov.hasAudio || m.hasAudio) && (m.path || ov.path)) need.add(m.path || ov.path);
      }
      if (need.size) {
        try { for (const i of await window.api.probe([...need])) if (i && i.hasAudio) audioMap[i.path] = true; } catch (_) {}
      }
    }
    for (const it of [...p.main, ...p.overlays]) if (it.lut) await CP.loadLut(it.lut);
    SEG.abort = false;
    if ([...p.main, ...p.overlays].some((it) => SEG.active(it))) await SEG.init();
    const clips = [];
    const tsMain = S.trackState('main');
    for (const e of S.layout()) {
      const c = e.clip, m = p.media[c.mediaId] || {};
      const sw = m.width || W, sh = m.height || H;
      const base = c.fit === 'fill' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
      const s = base * (c.scale || 1);
      const bg = c.bgFill && c.bgFill.type && c.bgFill.type !== 'none' ? { type: c.bgFill.type, color: c.bgFill.color, sigma: R.bgBlurFrac(c.bgFill) * H } : null;
      clips.push(Object.assign({
        path: m.path, type: m.type, alpha: !!m.alpha, hasAudio: !!m.hasAudio || !!audioMap[m.path], srcW: m.width, srcH: m.height,
        in: c.in, srcDur: c.srcDur, speed: c.speed || 1, reverse: !!c.reverse, volume: c.volume, mute: !!c.mute || !!c.disabled || !!tsMain.muted,
        fit: c.fit, flipH: c.flipH, flipV: c.flipV, rotate: c.rotate, scale: c.scale, x: (c.x || 0) * k, y: (c.y || 0) * k,
        opacity: c.opacity, adjust: c.adjust, filter: c.filter, filterIntensity: c.filterIntensity,
        fadeIn: c.fadeIn, fadeOut: c.fadeOut, aFadeIn: c.aFadeIn, aFadeOut: c.aFadeOut, normalize: !!c.normalize, aDenoise: !!c.aDenoise,
        transition: c.transition, stabilize: !!c.stabilize, bgFill: bg, hideVideo: tsMain.hidden || !!c.disabled,
        anim: KPresets.hasAnim(c.anim) ? KPresets.animFF(c.anim, e.dur, W, H) : null,
      }, await procInfo(c, sw * s, sh * s, m.height || H, { media: m, in: c.in, dur: c.srcDur })));
    }
    const overlays = [];
    for (const ov of PV.sortedOverlays()) {
      if (ov.hidden) continue;
      const animated = KPresets.hasAnim(ov.anim);
      const motion = MT.ffExpr(ov, k);
      if (ov.type === 'text' && R.textFxActive(ov)) {
        overlays.push(await rasterizeSeq(ov, W, H, k, o.fps));
      } else if (ov.type === 'text' || ov.type === 'sticker') {
        if (!animated && !motion) {
          overlays.push({ kind: 'png', data: await rasterize(ov, W, H, k), start: ov.start, dur: ov.dur, fadeIn: ov.fadeIn, fadeOut: ov.fadeOut });
        } else {
          const r = await rasterizeItem(ov, k);
          overlays.push({
            kind: 'item', data: r.data, w: r.w, h: r.h, cx: ov.cx * k, cy: ov.cy * k, rotate: ov.rotate, opacity: ov.opacity,
            anim: animated ? KPresets.animFF(ov.anim, ov.dur, r.ux, r.uy) : null, motion, start: ov.start, dur: ov.dur, fadeIn: ov.fadeIn, fadeOut: ov.fadeOut,
          });
        }
      } else {
        const m = p.media[ov.mediaId] || {};
        const sc = ov.scale || 1;
        const w = ov.w * sc * k, h = ov.h * sc * k;
        overlays.push(Object.assign({
          kind: ov.type === 'gif' ? 'gif' : 'video', path: ov.path, alpha: !!(ov.alpha || m.alpha), hasAudio: !!(ov.hasAudio || m.hasAudio || audioMap[m.path || ov.path]),
          in: ov.in || 0, start: ov.start, dur: ov.dur, cx: ov.cx * k, cy: ov.cy * k,
          w, h, rotate: ov.rotate, opacity: ov.opacity, flipH: ov.flipH, flipV: ov.flipV,
          adjust: ov.adjust, filter: ov.filter, filterIntensity: ov.filterIntensity, motion,
          volume: ov.volume, mute: ov.mute, fadeIn: ov.fadeIn, fadeOut: ov.fadeOut,
          anim: animated ? KPresets.animFF(ov.anim, ov.dur, w, h) : null,
        }, await procInfo(ov, w, h, m.height || ov.natH || h, { media: Object.assign({ path: ov.path, type: 'video', width: ov.natW, height: ov.natH }, m.path ? m : {}), in: ov.in || 0, dur: ov.dur })));
      }
    }
    await glTransitions(clips, W, H, o.fps);
    const audio = p.audio.filter((a) => !a.mute && !S.trackState(a.kind || 'music').muted && p.media[a.mediaId]).map((a) => ({
      path: p.media[a.mediaId].path, start: a.start, in: a.in || 0, dur: a.dur, speed: a.speed || 1,
      volume: a.volume, fadeIn: a.fadeIn, fadeOut: a.fadeOut, normalize: !!a.normalize, aDenoise: !!a.aDenoise,
    }));
    const encoder = o.format === 'hevc' ? 'hevc' : (App.settings.encoder || 'x264');
    return { out, width: W, height: H, fps: o.fps, crf: o.quality, encoder, clips, fx: S.trackState('fx').hidden ? [] : p.fx.filter((f) => !f.disabled), overlays, audio };
  };

  // เปลี่ยนฉากชุด WebGL (transfx.js): เรนเดอร์ท้ายคลิป A / หัวคลิป B เป็นภาพ แล้ววาดช่วงเปลี่ยนด้วยสูตรเดียวกับพรีวิว
  async function glTransitions(clips, W, H, fps) {
    const list = [];
    for (let i = 0; i < clips.length - 1; i++) {
      const tr = clips[i].transition;
      if (tr && tr.type && window.TGL && TGL.has(tr.type)) list.push(i);
    }
    if (!list.length) return;
    let done = 0;
    for (const i of list) {
      const A = clips[i], B = clips[i + 1], tr = A.transition;
      const dA = A.srcDur / (A.speed || 1), dB = B.srcDur / (B.speed || 1);
      const td = Math.min(tr.dur || 0.5, dA * 0.9, dB * 0.9);
      const n = Math.max(2, Math.round(td * fps));
      if (td <= 0.04 || n / fps >= Math.min(dA, dB)) continue;
      const lbl = `กำลังเตรียมเปลี่ยนฉาก (${(KPresets.TRANSITIONS.find((t) => t.id === tr.type) || {}).name || tr.type}) ${done + 1}/${list.length}`;
      if (EX.prep) EX.prep(lbl, 0);
      const base = { width: W, height: H, fps, crf: 12, overlays: [], audio: [], fx: [] };
      const fa = await window.api.exportFrames(Object.assign({}, base, { clips: [Object.assign({}, A, { transition: null })], frameRange: { start: Math.max(0, dA - n / fps), n } }));
      const fb = await window.api.exportFrames(Object.assign({}, base, { clips: [Object.assign({}, B, { transition: null })], frameRange: { start: 0, n } }));
      if (!fa.length || !fb.length) continue;
      const frames = [];
      for (let k = 0; k < n; k++) {
        const ia = await U.loadImage(U.fileUrl(fa[Math.min(k, fa.length - 1)]));
        const ib = await U.loadImage(U.fileUrl(fb[Math.min(k, fb.length - 1)]));
        const out = TGL.render(tr.type, ia, ib, W, H, k / n);
        if (!out) { frames.length = 0; break; }
        frames.push(await toPng(out));
        if (EX.prep) EX.prep(lbl, (k + 1) / n);
      }
      if (frames.length === n) A.transition = { type: tr.type, dur: n / fps, seqDur: n / fps, frames };
      done++;
    }
  }

  EX.srtText = () => {
    const subs = S.project.overlays.filter((x) => x.type === 'text').sort((a, b) => a.start - b.start);
    const ts = (t) => {
      const ms = Math.round(t * 1000);
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
    };
    const only = subs.some((x) => x.isSub) ? subs.filter((x) => x.isSub) : subs;
    return only.map((x, i) => `${i + 1}\n${ts(x.start)} --> ${ts(x.start + x.dur)}\n${x.text}\n`).join('\n');
  };

  // ---------------------------------------------------------------- ส่งออกเฉพาะช่วง (ใช้กับ "ส่งออกคลิปที่เลือก" / "สร้างคลิปแบบรวม")
  // สร้างโปรเจกต์ย่อยที่มีเฉพาะช่วงเวลา a..b (เวลาเริ่มใหม่ที่ 0) — insideOnly = เอาเฉพาะรายการที่อยู่ในช่วงทั้งชิ้น
  const clone = (x) => JSON.parse(JSON.stringify(x));
  EX.subProject = (a, b, opts = {}) => {
    const P = S.project;
    const q = clone(P);
    const EPS = 0.001;
    q.main = [];
    const lay = S.layout();
    lay.forEach((e, i) => {
      const s0 = Math.max(a, e.start), s1 = Math.min(b, e.end);
      if (s1 - s0 < 0.02) return;
      const c = clone(e.clip), sp = c.speed || 1;
      const off = (s0 - e.start) * sp, len = (s1 - s0) * sp;
      c.in = c.reverse ? e.clip.in + e.clip.srcDur - off - len : e.clip.in + off;
      c.srcDur = len;
      if (s0 > e.start + EPS) c.fadeIn = 0;
      if (s1 < e.end - EPS) { c.fadeOut = 0; c.transition = null; }
      const next = lay[i + 1];
      if (!next || next.end > b + EPS || next.start < a - EPS) c.transition = null;
      q.main.push(c);
    });
    const cut = (arr, timed) => arr.filter((o) => {
      const end = o.start + o.dur;
      if (end <= a + EPS || o.start >= b - EPS) return false;
      if (opts.insideOnly && (o.start < a - EPS || end > b + EPS)) return false;
      return true;
    }).map((o0) => {
      const o = clone(o0);
      const s0 = Math.max(a, o.start), s1 = Math.min(b, o.start + o.dur);
      if (timed) o.in = (o.in || 0) + (s0 - o.start) * (o.speed || 1);
      if (s0 > o.start + EPS) o.fadeIn = 0;
      if (s1 < o.start + o.dur - EPS) o.fadeOut = 0;
      if (o.motion && Array.isArray(o.motion.pts)) {
        o.motion.pts = o.motion.pts.map((pt) => [pt[0] - a, pt[1], pt[2]]);
        if (o.motion.range) o.motion.range = o.motion.range.map((t) => t - a);
      }
      o.start = s0 - a; o.dur = s1 - s0;
      return o;
    });
    q.overlays = cut(P.overlays, true).map((o) => { if (o.type !== 'video') delete o.in; return o; });
    q.audio = cut(P.audio, true);
    q.fx = cut(P.fx, false);
    return q;
  };
  // ทำงานกับโปรเจกต์ย่อยชั่วคราว แล้วคืนโปรเจกต์เดิม
  EX.withProject = async (q, fn) => {
    const saved = S.project, savedSel = S.selection;
    S.project = q; S.selection = null;
    try { return await fn(); } finally { S.project = saved; S.selection = savedSel; PV.needs = true; }
  };

  // extra: { range:[a,b], insideOnly, out (ไม่ถามที่บันทึก/ไม่แสดงหน้าต่างเสร็จ), title }
  EX.run = async (o, extra = {}) => {
    const ext = o.format === 'hevc' ? 'mp4' : o.format;
    const out = extra.out || await window.api.saveExportDialog(o.name || 'วิดีโอ', ext);
    if (!out) return null;
    if (PV && S.playing) PV.pause();
    const bar = el('div.progress-fill');
    const pct = el('strong', null, '0%');
    const msg = el('p.muted-p', null, 'กำลังเตรียมข้อความและสติ๊กเกอร์...');
    const t0 = Date.now();
    let cancelled = false;
    const m = U.modal(extra.title || 'กำลังส่งออก', el('div', null, msg, el('div.progress', null, bar), pct), {
      noClose: true, actions: [el('button.btn', { onclick: () => { cancelled = true; SEG.abort = true; window.api.exportCancel(); } }, 'ยกเลิก')],
    });
    const off = window.api.onExportProgress((p) => {
      bar.style.width = (p * 100).toFixed(1) + '%';
      pct.textContent = Math.round(p * 100) + '%';
      const el2 = (Date.now() - t0) / 1000;
      if (p > 0.03) msg.textContent = `กำลังเข้ารหัสวิดีโอ · เหลือประมาณ ${U.fmtShort(el2 / p - el2)}`;
    });
    EX.prep = (t, p) => { msg.textContent = t + (p ? ` ${Math.round(p * 100)}%` : ''); bar.style.width = (p * 100).toFixed(1) + '%'; pct.textContent = Math.round(p * 100) + '%'; };
    try {
      const job = extra.range
        ? await EX.withProject(EX.subProject(extra.range[0], extra.range[1], { insideOnly: !!extra.insideOnly }), () => EX.buildJob(o, out))
        : await EX.buildJob(o, out);
      EX.prep = null;
      if (!job.clips.length) throw new Error('ช่วงที่เลือกไม่มีคลิปในแทร็กวิดีโอหลัก');
      msg.textContent = 'กำลังเข้ารหัสวิดีโอ...';
      await window.api.exportRun(job);
      window.api.exportFramesClean().catch(() => {});
      if (o.srt) await window.api.writeText(out.replace(/\.[^.]+$/, '.srt'), EX.srtText());
      off(); m.close();
      if (extra.out) return out;
      const sec = Math.round((Date.now() - t0) / 1000);
      let d;
      d = U.modal('ส่งออกเสร็จแล้ว', el('p.muted-p', null, `บันทึกไว้ที่ ${out} (ใช้เวลา ${U.fmtShort(sec)})`), {
        actions: [
          el('button.btn', { onclick: () => { window.api.showItem(out); d.close(); } }, U.icon('folder', 16), 'เปิดโฟลเดอร์'),
          el('button.btn.primary', { onclick: () => { window.api.openPath(out); d.close(); } }, U.icon('play', 16), 'เล่นวิดีโอ'),
        ],
      });
    } catch (e) {
      EX.prep = null;
      window.api.exportFramesClean().catch(() => {});
      off(); m.close();
      if (!cancelled) U.modal('ส่งออกไม่สำเร็จ', el('pre.err-box', null, String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')));
      else U.toast('ยกเลิกการส่งออกแล้ว');
      return null;
    }
    return out;
  };

  window.EX = EX;
})();
