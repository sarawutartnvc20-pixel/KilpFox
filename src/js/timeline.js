// ไทม์ไลน์แบบเลเยอร์ (เหมือน CapCut): แทร็กหลัก + เลเยอร์ซ้อนที่สลับหน้า/หลังได้ ลากข้ามเลเยอร์ ตัดหัวท้าย ดูดติด
(function () {
  const TL = { pps: 60, drag: null, dropMarker: null, peaks: new Map(), strips: new Map() };
  let body, inner, playhead, rowsBox, ruler, lastRows = [];
  const HEAD = 178;
  let rafPending = false;

  const AUDIO_KINDS = [
    { kind: 'music', label: 'เพลง' },
    { kind: 'sfx', label: 'เสียงเอฟเฟกต์ / มีม' },
    { kind: 'voice', label: 'เสียงพากย์' },
  ];

  TL.init = (container) => {
    body = container;
    inner = U.el('div.tl-inner');
    ruler = U.el('div.tl-ruler');
    rowsBox = U.el('div.tl-rows');
    playhead = U.el('div.tl-playhead', null, U.el('div.tl-ph-knob'));
    inner.append(ruler, rowsBox, playhead);
    body.appendChild(inner);

    body.addEventListener('pointerdown', onDown);
    body.addEventListener('pointermove', onMove);
    body.addEventListener('pointerup', onUp);
    body.addEventListener('pointercancel', onUp);
    body.addEventListener('contextmenu', onContext);
    body.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = body.getBoundingClientRect();
        const t = (e.clientX - r.left + body.scrollLeft - HEAD) / TL.pps;
        TL.setZoom(TL.pps * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
        body.scrollLeft = t * TL.pps - (e.clientX - r.left - HEAD);
      }
    }, { passive: false });
    body.addEventListener('scroll', () => { TL.userScrollAt = performance.now(); }, { passive: true });
    body.addEventListener('dragover', onDragOver);
    body.addEventListener('dragleave', () => { TL.dropMarker = null; drawDropMarker(); });
    body.addEventListener('drop', onDrop);

    S.on('change', (o) => { if (!(o && o.live && TL.drag && TL.drag.noRender)) TL.requestRender(); });
    S.on('select', () => TL.requestRender());
    S.on('time', () => TL.updatePlayhead(true));
    TL.render();
  };

  // รวมการวาดหลายครั้งในเฟรมเดียว (ลากแล้วไม่หน่วง)
  TL.requestRender = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (TL.drag && TL.drag.moved && TL.drag.noRender) return; // กำลังลากอยู่ → วาดใหม่ตอนปล่อยเมาส์
      TL.render();
    });
  };

  TL.setZoom = (pps) => {
    TL.pps = U.clamp(pps, 4, 600);
    S.emit('zoom', TL.pps);
    TL.render();
  };
  // ซูมให้ช่วง a..b เต็มความกว้างไทม์ไลน์
  TL.zoomTo = (a, b) => {
    const w = body.clientWidth - HEAD - 80;
    TL.setZoom(w / Math.max(0.2, b - a));
    body.scrollLeft = Math.max(0, a * TL.pps - 40);
  };
  TL.fit = () => {
    const total = Math.max(5, S.total());
    TL.setZoom((body.clientWidth - HEAD - 60) / total);
    body.scrollLeft = 0;
  };

  // ---------------------------------------------------------------- จัดแถว
  function pack(items) {
    const rows = [];
    const sorted = items.slice().sort((a, b) => a.start - b.start);
    for (const it of sorted) {
      let placed = false;
      for (const r of rows) {
        if (r.end <= it.start + 0.001) { r.items.push(it); r.end = it.start + it.dur; placed = true; break; }
      }
      if (!placed) rows.push({ items: [it], end: it.start + it.dur });
    }
    return rows.map((r) => r.items);
  }

  const typeLabel = (o) => (o.type === 'text' ? 'ข้อความ' : o.type === 'gif' ? 'GIF' : o.type === 'video' ? 'วิดีโอ' : 'รูป/สติ๊กเกอร์');

  function buildRows() {
    const p = S.project;
    const rows = [];
    const tall = (cat) => !!S.trackState(cat).tall;
    rows.push({ id: 'newlayer', type: 'newlayer', h: 22 });
    // ทุกอย่างนอกแกนหลักอยู่บน "เลเยอร์" (ใส่ปนกันได้: ข้อความ สติ๊กเกอร์ วิดีโอ เอฟเฟกต์ เสียง)
    const tracks = S.tracks();
    for (let i = tracks.length - 1; i >= 0; i--) {
      const tr = tracks[i];
      const items = [].concat(p.overlays.filter((o) => o.track === tr).map((it) => ({ kind: 'overlay', it })),
        p.fx.filter((o) => o.track === tr).map((it) => ({ kind: 'fx', it })),
        p.audio.filter((o) => o.track === tr).map((it) => ({ kind: 'audio', it })));
      const kinds = Array.from(new Set(items.map((x) => (x.kind === 'fx' ? 'เอฟเฟกต์' : x.kind === 'audio' ? 'เสียง' : typeLabel(x.it)))));
      const onlyFx = items.length && items.every((x) => x.kind === 'fx');
      const hasAudio = items.some((x) => x.kind === 'audio');
      const h = tall('layers') ? (hasAudio ? 72 : onlyFx ? 46 : 68) : (hasAudio ? 44 : onlyFx ? 30 : 40);
      rows.push({ id: 'L' + tr, type: 'overlay', cat: 'layers', track: tr, label: 'เลเยอร์ ' + (i + 2), sub: kinds.join(' · '), items, h });
    }
    // แกนหลัก = เลเยอร์ 1 (คลิปต่อกันอัตโนมัติ ใส่เปลี่ยนฉากได้)
    rows.push({ id: 'main', type: 'main', cat: 'main', first: true, label: 'เลเยอร์ 1', h: tall('main') ? 124 : 70 });
    return rows;
  }

  // ---------------------------------------------------------------- วาด
  TL.render = () => {
    if (!body) return;
    const total = S.total();
    const width = Math.max(body.clientWidth, HEAD + (total + 30) * TL.pps);
    inner.style.width = width + 'px';
    renderRuler(width);
    U.clear(rowsBox);
    lastRows = buildRows();
    const sel = S.selection;
    const selItem = sel && sel.kind === 'overlay' ? S.findItem('overlay', sel.id) : null;
    for (const r of lastRows) {
      const lane = U.el('div.tl-lane', { dataset: { row: r.id, type: r.type, sub: r.sub || '', cat: r.cat || '', track: r.track != null ? r.track : '' } });
      const ts = r.cat ? S.trackState(r.cat) : {};
      const row = U.el('div.tl-row' + (r.type === 'main' ? '.main' : '') + (r.type === 'overlay' ? '.layer' : '') + (r.type === 'newlayer' ? '.newlayer' : '')
        + (ts.locked ? '.t-locked' : '') + (ts.hidden ? '.t-hidden' : '') + (ts.muted ? '.t-muted' : '')
        + (selItem && r.track === selItem.track ? '.cur' : ''), { style: { height: r.h + 'px' }, dataset: { row: r.id } },
      headEl(r), lane);
      if (r.type === 'main') renderMain(lane, sel);
      else if (r.type === 'newlayer') lane.appendChild(U.el('div.tl-newlayer-hint', null, '+ ลากมาวางตรงนี้เพื่อสร้างเลเยอร์ใหม่ด้านบนสุด'));
      else for (const x of r.items) lane.appendChild(itemEl(r, x.it, sel, x.kind));
      rowsBox.appendChild(row);
    }
    TL.updatePlayhead(false);
    drawDropMarker();
  };

  // หัวแถว: เลเยอร์มีปุ่ม ซ่อน / ล็อก / เลื่อนขึ้นลง
  const hbtn = (icon, label, on, fn, dis) => {
    const b = U.el('button.lh-btn' + (on ? '.on' : ''), { 'aria-label': label, title: label, disabled: !!dis, 'aria-pressed': on ? 'true' : 'false' }, U.icon(icon, 13));
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  // ปุ่มประจำแทร็ก: ล็อก / ซ่อน / ปิดเสียง / ขยาย
  function trackBtns(cat, opts) {
    const st = S.trackState(cat);
    return U.el('div.lh-btns', null,
      hbtn('lock', st.locked ? 'ปลดล็อกแทร็ก' : 'ล็อกแทร็ก', st.locked, () => S.toggleTrack(cat, 'locked')),
      opts.hide ? hbtn(st.hidden ? 'eyeoff' : 'eye', st.hidden ? 'แสดงแทร็ก' : 'ซ่อนแทร็ก', st.hidden, () => S.toggleTrack(cat, 'hidden')) : null,
      opts.mute ? hbtn(st.muted ? 'mute' : 'volume', st.muted ? 'เปิดเสียงแทร็ก' : 'ปิดเสียงแทร็ก', st.muted, () => S.toggleTrack(cat, 'muted')) : null,
      hbtn(st.tall ? 'shrink' : 'expand', st.tall ? 'ย่อความสูงแทร็ก' : 'ขยายความสูงแทร็ก', st.tall, () => S.toggleTrack(cat, 'tall')));
  }
  function headEl(r) {
    if (r.type === 'newlayer') {
      const st = S.trackState('layers');
      return U.el('div.tl-head.small.layer-head', null, U.el('span.lh-mini', null, 'เลเยอร์ทั้งหมด'),
        U.el('div.lh-btns', null, hbtn(st.tall ? 'shrink' : 'expand', st.tall ? 'ย่อความสูงเลเยอร์' : 'ขยายความสูงเลเยอร์', st.tall, () => S.toggleTrack('layers', 'tall'))));
    }
    if (r.type === 'main') return U.el('div.tl-head.layer-head', null, U.el('div.lh-text', null, U.el('small.lh-name', null, r.label)), trackBtns('main', { hide: true, mute: true }));
    if (r.type !== 'overlay') return U.el('div.tl-head', null, r.label);
    // ซ่อน = ภาพ/ข้อความซ่อน + เอฟเฟกต์ปิด · ปิดเสียง = เสียงและวิดีโอซ้อนในเลเยอร์นี้
    const vis = r.items.filter((x) => x.kind !== 'audio');
    const isHidden = (x) => (x.kind === 'fx' ? !!x.it.disabled : !!x.it.hidden);
    const hidden = vis.length && vis.every(isHidden);
    const locked = r.items.length && r.items.every((x) => x.it.locked);
    const tracks = S.tracks();
    const idx = tracks.indexOf(r.track);
    const btn = hbtn;
    // เลเยอร์ที่มีภาพ/วิดีโอซ้อน: สลับกับเลเยอร์ภาพที่อยู่ติดกัน (ข้ามเลเยอร์เสียง/เอฟเฟกต์ล้วนที่ไม่มีผลต่อการทับกัน)
    const visHere = r.items.some((x) => x.kind === 'overlay');
    const hasVisual = (t) => S.project.overlays.some((o) => o.track === t);
    const nearest = (dir) => {
      for (let j = idx + dir; j >= 0 && j < tracks.length; j += dir) if (!visHere || hasVisual(tracks[j])) return tracks[j];
      return null;
    };
    const upT = nearest(1), downT = nearest(-1);
    const snd = r.items.filter((x) => x.kind === 'audio' || (x.kind === 'overlay' && x.it.type === 'video'));
    const muted = snd.length && snd.every((x) => x.it.mute);
    return U.el('div.tl-head.layer-head', null,
      U.el('div.lh-text', null, U.el('small.lh-name', null, r.label), U.el('small', null, r.sub || '')),
      U.el('div.lh-btns', null,
        vis.length ? btn(hidden ? 'eyeoff' : 'eye', hidden ? 'แสดงเลเยอร์' : 'ซ่อนเลเยอร์', hidden, () => S.commit(() => vis.forEach((x) => { if (x.kind === 'fx') x.it.disabled = !hidden; else x.it.hidden = !hidden; }))) : null,
        btn('lock', locked ? 'ปลดล็อก' : 'ล็อกเลเยอร์', locked, () => S.commit(() => r.items.forEach((x) => { x.it.locked = !locked; }))),
        snd.length ? btn(muted ? 'mute' : 'volume', muted ? 'เปิดเสียงเลเยอร์' : 'ปิดเสียงเลเยอร์', muted, () => S.commit(() => snd.forEach((x) => { x.it.mute = !muted; }))) : null,
        btn('up', 'ย้ายเลเยอร์ขึ้น (ไว้ข้างหน้า)', false, () => S.swapTracks(r.track, upT), upT == null),
        btn('down', 'ย้ายเลเยอร์ลง (ไว้ข้างหลัง)', false, () => S.swapTracks(r.track, downT), downT == null)));
  }

  function renderRuler(width) {
    U.clear(ruler);
    const steps = [1 / 30, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find((s) => s * TL.pps >= 80) || 600;
    const n = Math.ceil((width - HEAD) / (step * TL.pps));
    ruler.appendChild(U.el('div.tl-ruler-head'));
    const lane = U.el('div.tl-ruler-lane');
    for (let i = 0; i <= n; i++) {
      const t = i * step;
      const lbl = step < 1 ? (t % 1 === 0 ? U.fmtShort(t) : (t % 1).toFixed(step < 0.1 ? 2 : 1).slice(1) + 's') : U.fmtShort(t);
      lane.appendChild(U.el('div.tl-tick', { style: { left: t * TL.pps + 'px' } }, lbl));
      for (let j = 1; j < 4; j++) lane.appendChild(U.el('div.tl-tick.minor', { style: { left: (t + j * step / 4) * TL.pps + 'px' } }));
    }
    ruler.appendChild(lane);
  }

  function clipTags(c) {
    const tags = [];
    if (c.speed && c.speed !== 1) tags.push(c.speed + 'x');
    if (c.reverse) tags.push('ย้อน');
    if (c.filter && c.filter !== 'none') tags.push((KPresets.FILTERS.find((f) => f.id === c.filter) || {}).name);
    if (c.mute) tags.push('ปิดเสียง');
    if (c.chroma && c.chroma.enabled) tags.push('คีย์สี');
    if (c.mask && c.mask.type && c.mask.type !== 'none') tags.push('มาสก์');
    if (KPresets.hasAnim(c.anim)) tags.push('เคลื่อนไหว');
    if (c.retouch && (c.retouch.smooth || c.retouch.whiten || (c.retouch.tone && c.retouch.tone !== 'none'))) tags.push('รีทัช');
    if (c.aiTags) tags.push(...c.aiTags);
    return tags.filter(Boolean);
  }

  function renderMain(lane, sel) {
    const p = S.project;
    const lay = S.layout();
    lay.forEach((e, i) => {
      const c = e.clip;
      const m = p.media[c.mediaId] || {};
      const isSel = S.isSelected('clip', c.id);
      const el = U.el('div.tl-item.clip' + (isSel ? '.sel' : '') + (m.missing ? '.missing' : '') + (c.disabled ? '.off' : ''), {
        dataset: { kind: 'clip', id: c.id },
        style: { left: e.start * TL.pps + 'px', width: Math.max(4, e.dur * TL.pps) + 'px' },
        title: m.name || '',
      });
      const strip = TL.strips.get(m.path);
      if (strip) el.style.backgroundImage = `url("${U.fileUrl(strip)}")`;
      else if (m.type === 'image' && m.path) { el.style.backgroundImage = `url("${U.fileUrl(m.path)}")`; el.style.backgroundSize = 'auto 100%'; }
      else if (m.type === 'video' && m.path && !TL.strips.has(m.path)) loadStrip(m);
      const tags = clipTags(c);
      el.append(...[
        U.el('div.tl-label', null, U.el('span', null, m.name || 'คลิป'), U.el('span.tl-dur', null, U.fmtShort(e.dur))),
        tags.length ? U.el('div.tl-tags', null, tags.map((t) => U.el('span.tag' + (/AI|ลบพื้น|เบลอ|ชัด|รีทัช|ติดตาม|เสียง|ซับ|สโลว์|คีย์|แนวตั้ง|มาสก์|เคลื่อนไหว/.test(t) ? '.pro' : ''), null, t))) : null,
        U.el('div.h-l', { dataset: { handle: 'l' } }), U.el('div.h-r', { dataset: { handle: 'r' } })].filter(Boolean));
      beatDots(el, 'clip', c, e.start);
      lane.appendChild(el);
      if (i < lay.length - 1) {
        const td = S.transDur(i);
        const has = c.transition && c.transition.type;
        const tsel = sel && sel.kind === 'transition' && sel.id === c.id;
        const x = (e.end - td / 2) * TL.pps;
        lane.appendChild(U.el('button.tl-trans' + (has ? '.on' : '') + (tsel ? '.sel' : ''), {
          dataset: { kind: 'transition', id: c.id }, style: { left: x + 'px' },
          'aria-label': has ? 'แก้ไขการเปลี่ยนฉาก' : 'เพิ่มการเปลี่ยนฉาก', title: has ? (KPresets.TRANSITIONS.find((t) => t.id === c.transition.type) || {}).name : 'เพิ่มการเปลี่ยนฉาก',
        }, has ? '⇄' : '+'));
      }
    });
    if (!lay.length) lane.appendChild(U.el('div.tl-empty', null, 'ลากคลิปมาวางที่นี่ หรือกด + ที่คลังสื่อ'));
  }

  function itemEl(row, it, sel, kind) {
    kind = kind || (row.type === 'overlay' ? 'overlay' : row.type);
    const isSel = S.isSelected(kind, it.id);
    let label = '', cls = '';
    if (kind === 'overlay') {
      cls = '.ov-' + it.type + (it.hidden ? '.hid' : '') + (it.locked ? '.lock' : '');
      label = it.type === 'text' ? 'T  ' + String(it.text).split('\n')[0] : it.type === 'gif' ? 'GIF' : it.type === 'video' ? 'วิดีโอซ้อน' : 'รูป';
      if (it.type !== 'text' && it.name) label += ' · ' + it.name;
    } else if (kind === 'fx') {
      label = (KPresets.EFFECTS.find((e) => e.id === it.effect) || {}).name || it.effect;
      if (it.disabled) cls = '.off';
      cls += it.locked ? '.lock' : '';
    } else if (kind === 'audio') {
      const m = S.project.media[it.mediaId] || {};
      label = m.name || 'เสียง';
      cls = '.au-' + (it.kind || 'music') + (it.mute ? '.off' : '') + (it.locked ? '.lock' : '');
    }
    const el = U.el('div.tl-item.' + kind + cls + (isSel ? '.sel' : ''), {
      dataset: { kind, id: it.id },
      style: { left: it.start * TL.pps + 'px', width: Math.max(4, it.dur * TL.pps) + 'px' },
      title: label,
    });
    if (kind === 'audio') {
      const m = S.project.media[it.mediaId];
      const peaks = m && TL.peaks.get(m.path);
      if (peaks) el.appendChild(waveCanvas(peaks, it, m, Math.max(4, it.dur * TL.pps), row.h - 6));
      else if (m && !TL.peaks.has(m.path)) loadPeaks(m);
    }
    if (kind === 'overlay' && it.type === 'video') {
      const m = S.project.media[it.mediaId] || { path: it.path, duration: it.dur, type: 'video' };
      const strip = TL.strips.get(m.path);
      if (strip) el.style.backgroundImage = `url("${U.fileUrl(strip)}")`;
      else if (m.path && !TL.strips.has(m.path)) loadStrip(m);
    } else if (kind === 'overlay' && it.type !== 'text' && it.path) {
      el.appendChild(U.el('img.tl-thumb', { src: U.fileUrl(it.path), alt: '' }));
    }
    const badges = [];
    if (kind === 'overlay' && KPresets.hasAnim(it.anim)) badges.push('เคลื่อนไหว');
    if (kind === 'overlay' && it.chroma && it.chroma.enabled) badges.push('คีย์สี');
    el.append(U.el('div.tl-label', null, U.el('span', null, label), badges.length ? U.el('span.tag.pro', null, badges.join(' · ')) : null),
      U.el('div.h-l', { dataset: { handle: 'l' } }), U.el('div.h-r', { dataset: { handle: 'r' } }));
    if (kind === 'audio') beatDots(el, 'audio', it, it.start);
    return el;
  }

  // จุดเครื่องหมายจังหวะ (beat) บนคลิป
  function beatDots(node, kind, it, start) {
    if (!it.beats || !window.CM) return;
    const box = U.el('div.tl-beats');
    for (const t of CM.beatTimes(kind, it)) box.appendChild(U.el('i', { style: { left: (t - start) * TL.pps + 'px' } }));
    node.appendChild(box);
  }

  function waveCanvas(peaks, it, m, w, h) {
    const c = U.el('canvas.tl-wave');
    const W = Math.min(4000, Math.round(w));
    c.width = W; c.height = Math.max(4, h);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,0.55)';
    const dur = m.duration || 1;
    const speed = it.speed || 1;
    for (let x = 0; x < W; x += 2) {
      const t = (it.in || 0) + (x / W) * it.dur * speed;
      const idx = Math.floor((t / dur) * peaks.length);
      const v = peaks[idx] || 0;
      const bh = Math.max(1, v * h * 0.9 * Math.min(1.5, it.volume == null ? 1 : it.volume));
      g.fillRect(x, (h - bh) / 2, 1.5, bh);
    }
    return c;
  }

  function loadPeaks(m) {
    TL.peaks.set(m.path, null);
    window.api.waveform(m.path).then((p) => { TL.peaks.set(m.path, p); TL.requestRender(); }).catch(() => {});
  }
  function loadStrip(m) {
    TL.strips.set(m.path, null);
    window.api.filmstrip(m.path, Math.min(30, Math.max(4, Math.round((m.duration || 4) / 2)))).then((f) => {
      if (f) { TL.strips.set(m.path, f); TL.requestRender(); }
    }).catch(() => {});
  }

  // หัวเล่น + เลื่อนตามแบบนุ่มนวลขณะเล่น (หัวเล่นค้างที่ราว 65% ของจอ แล้วไทม์ไลน์ไหลตาม)
  TL.updatePlayhead = (follow) => {
    if (!body) return;
    const x = HEAD + S.time * TL.pps;
    playhead.style.transform = `translateX(${x}px)`;
    if (follow && S.playing && !TL.drag && !(TL.userScrollAt && performance.now() - TL.userScrollAt < 1200 && !TL.autoScrolling)) {
      const viewW = body.clientWidth - HEAD;
      const pos = body.scrollLeft + HEAD + viewW * 0.65;
      let target = null;
      if (x > pos) target = x - HEAD - viewW * 0.65;
      else if (x < body.scrollLeft + HEAD) target = Math.max(0, x - HEAD - 40);
      if (target != null) {
        TL.autoScrolling = true;
        body.scrollLeft = target;
        requestAnimationFrame(() => { TL.autoScrolling = false; });
      }
    }
  };

  // ---------------------------------------------------------------- ลาก
  function timeAt(e) {
    const r = body.getBoundingClientRect();
    return Math.max(0, (e.clientX - r.left + body.scrollLeft - HEAD) / TL.pps);
  }

  function snapPoints(exceptId) {
    const pts = [0, S.time];
    for (const e of S.layout()) { pts.push(e.start, e.end); }
    for (const arr of [S.project.overlays, S.project.audio, S.project.fx]) {
      for (const o of arr) if (o.id !== exceptId) pts.push(o.start, o.start + o.dur);
    }
    // ดูดเข้าเครื่องหมายจังหวะเพลง
    if (window.CM) {
      for (const a of S.project.audio) if (a.beats && a.id !== exceptId) pts.push(...CM.beatTimes('audio', a));
      for (const c of S.project.main) if (c.beats && c.id !== exceptId) pts.push(...CM.beatTimes('clip', c));
    }
    return pts;
  }
  function snap(t, exceptId, alsoEnd) {
    if (!S.magnet) return t;
    const tol = 8 / TL.pps;
    let best = null;
    for (const p of snapPoints(exceptId)) {
      if (Math.abs(p - t) < tol && (best == null || Math.abs(p - t) < Math.abs(best - t))) best = p;
      if (alsoEnd != null && Math.abs(p - (t + alsoEnd)) < tol && (best == null || Math.abs(p - alsoEnd - t) < Math.abs(best - t))) best = p - alsoEnd;
    }
    return best == null ? t : best;
  }

  // หาแถวปลายทางใต้เมาส์ (ใช้ตำแหน่ง Y เพื่อไม่ชนกับชิ้นที่กำลังลาก)
  function rowAt(clientY) {
    const rows = rowsBox.querySelectorAll('.tl-row');
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (clientY >= r.top && clientY < r.bottom) {
        const lane = row.querySelector('.tl-lane');
        return { row, lane, rect: r, type: lane.dataset.type, track: lane.dataset.track === '' ? null : Number(lane.dataset.track) };
      }
    }
    return null;
  }

  // ปลายทางของการลากรายการซ้อน: {track} = เลเยอร์เดิม, {insert} = สร้างเลเยอร์ใหม่ที่ตำแหน่งนั้น
  function layerTarget(e, it) {
    const hit = rowAt(e.clientY);
    const tracks = S.tracks();
    const top = tracks.length ? tracks[tracks.length - 1] : -1;
    if (!hit) {
      const first = rowsBox.firstChild && rowsBox.firstChild.getBoundingClientRect();
      if (first && e.clientY < first.top) return { insert: top + 1 };
      return { track: it.track };
    }
    if (hit.type === 'newlayer') return { insert: top + 1 };
    if (hit.type === 'overlay') return slotTarget(hit, e, it.start, it.start + it.dur, it.id, it.track);
    if (hit.type === 'main') return { insert: 0, line: hit.rect.top };
    return { track: it.track };
  }

  // ปลายทางแบบ CapCut: ลากไปวางบนเลเยอร์ที่ว่างช่วงเวลานั้น → ลงเลเยอร์นั้น
  // เลเยอร์ที่มีของทับเวลาอยู่ → สร้างเลเยอร์ใหม่ "เหนือ" (ครึ่งบนของแถว) หรือ "ใต้" (ครึ่งล่าง) แถวนั้นตามตำแหน่งเมาส์
  // ขอบบน/ล่างของแถว → สร้างเลเยอร์ใหม่คั่นตรงนั้นเสมอ
  function slotTarget(hit, e, start, end, exceptId, curTrack) {
    const edge = 8;
    const y = e.clientY - hit.rect.top, h = hit.rect.height;
    if (y < edge) return { insert: hit.track + 1, line: hit.rect.top };
    if (h - y < edge) return { insert: hit.track, line: hit.rect.bottom };
    if (hit.track === curTrack || S.trackFree(hit.track, start, end, exceptId)) return { track: hit.track, lane: hit.lane };
    return y < h / 2 ? { insert: hit.track + 1, line: hit.rect.top } : { insert: hit.track, line: hit.rect.bottom };
  }

  // ตั้งรายการหลัก (สำหรับแผงปรับแต่ง) โดยไม่ล้างกลุ่มที่เลือก
  function _keepGroupSel(kind, id) {
    if (!(S.selection && S.selection.kind === kind && S.selection.id === id)) S.selectMany(S.selectedList(), { kind, id });
    TL.groupClick = { kind, id };
  }
  // Shift+คลิก: เลือกทุกชิ้นในแถวเดียวกันตั้งแต่ชิ้นล่าสุดถึงชิ้นนี้ (ถ้าคนละแถว = เพิ่มชิ้นนี้)
  function rangeSelect(node, sel) {
    const lane = node.closest('.tl-lane');
    const a = rowsBox.querySelector(`.tl-item[data-id="${TL.anchor.id}"]`);
    if (!a || a.closest('.tl-lane') !== lane) { S.selectMany(S.selectedList().concat([sel]), sel); return; }
    const x1 = Math.min(a.offsetLeft, node.offsetLeft), x2 = Math.max(a.offsetLeft, node.offsetLeft);
    const add = Array.from(lane.querySelectorAll('.tl-item')).filter((n) => n.offsetLeft >= x1 && n.offsetLeft <= x2).map((n) => ({ kind: n.dataset.kind, id: n.dataset.id }));
    S.selectMany(S.selectedList().concat(add), sel);
  }
  // กรอบเลือก (พิกัดใน inner เพื่อให้เลื่อนไทม์ไลน์ระหว่างลากได้)
  function marqueeUpdate(d, e) {
    const ir = inner.getBoundingClientRect();
    const x = e.clientX - ir.left, y = e.clientY - ir.top;
    const L = Math.max(HEAD, Math.min(x, d.ix)), T = Math.min(y, d.iy), R = Math.max(x, d.ix), B = Math.max(y, d.iy);
    let box = inner.querySelector('.tl-marquee');
    if (!box) { box = U.el('div.tl-marquee'); inner.appendChild(box); }
    Object.assign(box.style, { left: L + 'px', top: T + 'px', width: Math.max(0, R - L) + 'px', height: (B - T) + 'px' });
    const hits = [];
    for (const n of rowsBox.querySelectorAll('.tl-item')) {
      const r = n.getBoundingClientRect();
      const nl = r.left - ir.left, nt = r.top - ir.top;
      const hit = nl < R && nl + r.width > L && nt < B && nt + r.height > T;
      if (hit) hits.push({ kind: n.dataset.kind, id: n.dataset.id });
      const base = d.base.some((b) => b.id === n.dataset.id);
      n.classList.toggle('sel', hit || base);
    }
    d.hits = hits;
    if (window.U && TL.onMarquee) TL.onMarquee(hits.length + d.base.length);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const r = body.getBoundingClientRect();
    const xIn = e.clientX - r.left;
    const target = e.target;
    if (target.closest('.tl-ruler') || (target.closest('.tl-playhead'))) {
      TL.drag = { mode: 'seek' };
      if (S.playing) PV.pause();
      S.setTime(timeAt(e));
      body.setPointerCapture(e.pointerId);
      return;
    }
    if (xIn < HEAD) return;
    const tr = target.closest('.tl-trans');
    if (tr) {
      const c = S.findItem('clip', tr.dataset.id);
      if (c && !(c.transition && c.transition.type)) S.commit(() => { c.transition = { type: 'fade', dur: 0.5 }; });
      S.select({ kind: 'transition', id: tr.dataset.id });
      S.emit('open-panel', 'trans');
      return;
    }
    const itemNode = target.closest('.tl-item');
    const ctrl = e.ctrlKey || e.metaKey;
    if (!itemNode) {
      // ช่องว่าง: คลิก = ไปที่เวลานั้น · กดค้างแล้วลาก = ลากกรอบเลือกหลายอัน (Ctrl ค้าง = เพิ่มจากที่เลือกไว้)
      const ir = inner.getBoundingClientRect();
      TL.drag = { mode: 'empty', x0: e.clientX, y0: e.clientY, ix: e.clientX - ir.left, iy: e.clientY - ir.top, t: timeAt(e), add: ctrl || e.shiftKey,
        base: ctrl || e.shiftKey ? S.selectedList() : [] };
      body.setPointerCapture(e.pointerId);
      return;
    }
    const kind = itemNode.dataset.kind, id = itemNode.dataset.id;
    const it = S.findItem(kind, id);
    if (!it) return;
    // Ctrl+คลิก = เพิ่ม/เอาออกทีละอัน · Shift+คลิก = เลือกต่อเนื่องในเลเยอร์เดียวกัน
    if (ctrl) { S.toggleSelect({ kind, id }); TL.anchor = { kind, id }; return; }
    if (e.shiftKey && TL.anchor && S.findItem(TL.anchor.kind, TL.anchor.id)) { rangeSelect(itemNode, { kind, id }); return; }
    TL.anchor = { kind, id };
    const handle = target.dataset.handle;
    const inGroup = S.isMulti() && S.isSelected(kind, id);
    if (inGroup && !handle && kind !== 'clip') {
      // ลากทั้งกลุ่มที่เลือกไว้
      const items = S.selectedItems().filter((x) => x.kind !== 'clip' && !S.isLocked(x.kind, x.it));
      if (!items.some((x) => x.id === id)) return;
      _keepGroupSel(kind, id);
      TL.drag = { mode: 'gmove', kind, id, t0: timeAt(e), x0: e.clientX, y0: e.clientY, moved: false, noRender: true,
        items: items.map((x) => ({ kind: x.kind, id: x.id, start: x.it.start, dur: x.it.dur, track: x.it.track, node: rowsBox.querySelector(`.tl-item[data-id="${x.id}"]`) })) };
      body.setPointerCapture(e.pointerId);
      return;
    }
    if (inGroup && !handle) _keepGroupSel(kind, id);
    else S.select({ kind, id });
    if (S.isLocked(kind, it)) return;
    const node = rowsBox.querySelector(`.tl-item[data-id="${id}"]`) || itemNode;
    TL.drag = {
      mode: handle ? 'trim-' + handle : 'move', kind, id, t0: timeAt(e), x0: e.clientX, y0: e.clientY, moved: false,
      orig: JSON.parse(JSON.stringify(it)), node,
      noRender: !handle, // ลากย้าย: ขยับชิ้นเองโดยไม่วาดไทม์ไลน์ใหม่ทั้งหมด (ลื่นกว่า)
    };
    body.setPointerCapture(e.pointerId);
  }

  function showInsertLine(y) {
    let ln = inner.querySelector('.tl-insert-line');
    if (y == null) { if (ln) ln.remove(); return; }
    if (!ln) { ln = U.el('div.tl-insert-line'); inner.appendChild(ln); }
    const ir = inner.getBoundingClientRect();
    ln.style.top = (y - ir.top - 1) + 'px';
  }

  // ลากไปชิดขอบซ้าย/ขวาของไทม์ไลน์ → เลื่อนไทม์ไลน์ตามให้เอง (ทั้งหัวเล่นและการลากชิ้นงาน)
  let edgeRaf = 0;
  function edgeLoop() {
    edgeRaf = 0;
    const d = TL.drag, ev = TL.lastEvt;
    if (!d || !ev || d.mode === 'box') return;
    const r = body.getBoundingClientRect();
    const x = ev.clientX - r.left, zone = 60;
    let v = 0;
    if (x < HEAD + zone) v = -Math.min(1, (HEAD + zone - x) / zone);
    else if (x > r.width - zone) v = Math.min(1, (x - (r.width - zone)) / zone);
    if (!v) return;
    const before = body.scrollLeft;
    body.scrollLeft = Math.max(0, before + v * (6 + 34 * Math.abs(v)));
    if (body.scrollLeft !== before) onMove(ev, true);
    edgeRaf = requestAnimationFrame(edgeLoop);
  }
  // ลากทั้งกลุ่ม: ขยับเวลาเท่ากันทุกชิ้น + ย้ายเลเยอร์ตามจำนวนแถวที่ลากขึ้น/ลง
  function groupMove(d, e) {
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true;
    const g = d.items.find((x) => x.id === d.id);
    const dt = timeAt(e) - d.t0;
    let delta = snap(g.start + dt, g.id, g.dur) - g.start;
    delta = Math.max(delta, -Math.min(...d.items.map((x) => x.start)));
    d.delta = delta;
    S.live(() => { for (const x of d.items) { const it = S.findItem(x.kind, x.id); if (it) it.start = x.start + delta; } });
    const T = S.tracks();
    const hit = rowAt(e.clientY);
    const gi = T.indexOf(g.track);
    let hi = gi;
    if (hit && hit.type === 'overlay') hi = T.indexOf(hit.track);
    else if (hit && hit.type === 'newlayer') hi = T.length;
    else if (hit && hit.type === 'main') hi = -1;
    d.shift = hi - gi;
    rowsBox.querySelectorAll('.tl-row.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
    if (hit && d.shift) hit.row.classList.add('drop-hl');
    const dy = e.clientY - d.y0;
    for (const x of d.items) {
      if (!x.node || !x.node.isConnected) x.node = rowsBox.querySelector(`.tl-item[data-id="${x.id}"]`);
      if (!x.node) continue;
      x.node.classList.add('dragging');
      x.node.style.left = (x.start + delta) * TL.pps + 'px';
      x.node.style.transform = d.shift ? `translateY(${dy}px)` : '';
    }
  }
  function groupDrop(d) {
    if (!d.moved) return false;
    S.live((p) => {
      const T = S.tracks(p);
      const idx = d.items.map((x) => T.indexOf(x.track) + (d.shift || 0));
      const minI = Math.min(...idx);
      // ลากลงต่ำกว่าเลเยอร์ล่างสุด → สร้างเลเยอร์ใหม่ด้านล่างให้พอ
      const below = minI < 0 ? -minI : 0;
      for (let i = 0; i < below; i++) S.insertTrack(0, p);
      const top = T.length ? T[T.length - 1] + below : -1;
      d.items.forEach((x, k) => {
        const it = S.findItem(x.kind, x.id);
        if (!it) return;
        const ni = idx[k] + below;
        it.track = ni < T.length ? (ni < 0 ? 0 : T[ni] + below) : top + (ni - T.length + 1);
      });
      // ชนของอื่นที่ไม่ได้อยู่ในกลุ่ม → ยกทั้งกลุ่มขึ้นไปเลเยอร์ใหม่ด้านบนสุด (คงลำดับเดิม)
      const ids = new Set(d.items.map((x) => x.id));
      const clash = d.items.some((x) => { const it = S.findItem(x.kind, x.id); return it && S.trackItems(it.track, p).some((o) => !ids.has(o.id) && o.start < it.start + it.dur - 0.001 && it.start < o.start + o.dur - 0.001); });
      if (clash) {
        const others = S.layerItems(p).filter((o) => !ids.has(o.id) && o.track != null);
        const topOther = others.length ? Math.max(...others.map((o) => o.track)) : -1;
        const gTracks = Array.from(new Set(d.items.map((x) => S.findItem(x.kind, x.id).track))).sort((a, b) => a - b);
        d.items.forEach((x) => { const it = S.findItem(x.kind, x.id); it.track = topOther + 1 + gTracks.indexOf(it.track); });
      }
    });
    return true;
  }

  function onMove(e, fromEdge) {
    const d = TL.drag;
    if (!d) return;
    if (!fromEdge) {
      TL.lastEvt = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, target: e.target };
      if (!edgeRaf) edgeRaf = requestAnimationFrame(edgeLoop);
    }
    if (d.mode === 'seek') { S.setTime(timeAt(e)); TL.updatePlayhead(false); return; }
    if (d.mode === 'empty') {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 5) return;
      d.mode = 'marq';
    }
    if (d.mode === 'marq') { marqueeUpdate(d, TL.lastEvt || e); return; }
    if (d.mode === 'gmove') { groupMove(d, e); return; }
    const t = timeAt(e);
    const dt = t - d.t0;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return;
    d.moved = true;
    // ไทม์ไลน์อาจถูกวาดใหม่หลังคลิกเลือก → หยิบชิ้นตัวใหม่มาลากต่อ
    if (d.mode === 'move' && (!d.node || !d.node.isConnected)) d.node = rowsBox.querySelector(`.tl-item[data-id="${d.id}"]`) || d.node;
    if (d.mode === 'move' && d.node) d.node.classList.add('dragging');
    const it = S.findItem(d.kind, d.id);
    if (!it) return;
    const o = d.orig;
    const media = it.mediaId ? S.project.media[it.mediaId] : null;
    if (d.kind === 'clip') {
      const sp = it.speed || 1;
      if (d.mode === 'move') {
        // ชิ้นที่ลากตามเมาส์ + เส้นบอกตำแหน่งที่จะวาง
        d.node.style.transform = `translate(${e.clientX - d.x0}px, ${e.clientY - d.y0}px)`;
        const hit = rowAt(e.clientY);
        if (hit && (hit.type === 'overlay' || hit.type === 'newlayer')) {
          const ce = S.layout().find((x) => x.clip === it);
          d.toLayer = hit.type === 'overlay' && ce ? slotTarget(hit, e, ce.start, ce.end, null, null) : { insert: (S.tracks().slice(-1)[0] ?? -1) + 1, line: rowsBox.firstChild.getBoundingClientRect().bottom };
          TL.dropMarker = null; drawDropMarker();
          rowsBox.querySelectorAll('.tl-row.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
          if (d.toLayer.insert != null) showInsertLine(d.toLayer.line);
          else { showInsertLine(null); hit.row.classList.add('drop-hl'); }
          return;
        }
        showInsertLine(null);
        d.toLayer = null;
        rowsBox.querySelectorAll('.tl-row.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
        const lay = S.layout();
        let idx = lay.length;
        for (let i = 0; i < lay.length; i++) if (t < (lay[i].start + lay[i].end) / 2) { idx = i; break; }
        TL.dropMarker = { row: 'main', time: idx < lay.length ? lay[idx].start : (lay.length ? lay[lay.length - 1].end : 0), index: idx };
        drawDropMarker();
        return;
      }
      S.live(() => {
        const maxSrc = media && media.type !== 'image' && media.duration ? media.duration : Infinity;
        if (d.mode === 'trim-l') {
          let delta = dt * sp;
          delta = U.clamp(delta, -o.in, o.srcDur - 0.1);
          if (media && media.type === 'image') { it.srcDur = Math.max(0.1, o.srcDur - delta); }
          else { it.in = o.in + delta; it.srcDur = o.srcDur - delta; }
        } else if (d.mode === 'trim-r') {
          it.srcDur = U.clamp(o.srcDur + dt * sp, 0.1, maxSrc - o.in);
        }
      });
      return;
    }
    if (d.mode === 'move') {
      const ns = Math.max(0, snap(o.start + dt, it.id, o.dur));
      S.live(() => { it.start = ns; });
      // ย้ายตัวชิ้นในหน้าจอเอง
      d.node.style.left = ns * TL.pps + 'px';
      if (d.kind === 'overlay' || d.kind === 'fx' || d.kind === 'audio') {
        const tg = layerTarget(e, it);
        d.target = tg;
        if (tg.lane && d.node.parentNode !== tg.lane) tg.lane.appendChild(d.node);
        if (tg.insert != null) {
          d.node.style.transform = `translateY(${e.clientY - d.node.parentNode.getBoundingClientRect().top - 18}px)`;
          showInsertLine(tg.line != null ? tg.line : rowsBox.firstChild.getBoundingClientRect().bottom);
        } else { d.node.style.transform = ''; showInsertLine(null); }
      }
      return;
    }
    S.live(() => {
      const maxDur = media && media.type !== 'image' && media.duration ? (media.duration - (it.in || 0)) / (it.speed || 1) : Infinity;
      if (d.mode === 'trim-l') {
        let ns = snap(o.start + dt, it.id);
        ns = U.clamp(ns, 0, o.start + o.dur - 0.1);
        if (o.in != null) ns = Math.max(ns, o.start - o.in / (it.speed || 1));
        it.start = ns;
        it.dur = o.start + o.dur - ns;
        if (o.in != null) it.in = Math.max(0, o.in + (ns - o.start) * (it.speed || 1));
      } else if (d.mode === 'trim-r') {
        const end = snap(o.start + o.dur + dt, it.id);
        it.dur = U.clamp(end - o.start, 0.1, o.in != null ? (media && media.duration ? (media.duration - o.in) / (it.speed || 1) : Infinity) : Infinity);
        if (it.type === 'video' && media && media.duration) it.dur = Math.min(it.dur, maxDur);
      }
    });
  }

  function onUp() {
    const d = TL.drag;
    TL.drag = null;
    showInsertLine(null);
    rowsBox.querySelectorAll('.tl-row.drop-hl').forEach((x) => x.classList.remove('drop-hl'));
    if (!d) return;
    const mq = inner.querySelector('.tl-marquee');
    if (mq) mq.remove();
    if (d.mode === 'empty') {
      // คลิกที่ว่างเฉยๆ = ยกเลิกการเลือก + ไปที่เวลานั้น
      if (!d.add) S.select(null);
      if (S.playing) PV.pause();
      S.setTime(d.t);
      return;
    }
    if (d.mode === 'marq') {
      S.selectMany(d.base.concat(d.hits || []), (d.hits || [])[0] || S.selection);
      TL.render();
      return;
    }
    if (d.mode === 'gmove') {
      TL.groupClick = null;
      if (!d.moved) { S.select({ kind: d.kind, id: d.id }); return; }
      groupDrop(d);
      S.endLive();
      TL.render();
      return;
    }
    // คลิกชิ้นในกลุ่มโดยไม่ลาก = เลือกชิ้นนั้นชิ้นเดียว
    if (TL.groupClick && !d.moved && d.id === TL.groupClick.id && d.mode === 'move') { TL.groupClick = null; S.select({ kind: d.kind, id: d.id }); return; }
    TL.groupClick = null;
    if (d.kind === 'clip' && d.mode === 'move' && d.moved) {
      const c = S.findItem('clip', d.id);
      if (d.toLayer && c) {
        TL.dropMarker = null;
        App.clipToOverlay(c, d.toLayer);
        return;
      }
      if (TL.dropMarker) {
        const idx = TL.dropMarker.index;
        TL.dropMarker = null;
        S.commit((p) => {
          const from = p.main.findIndex((x) => x.id === d.id);
          if (from < 0) return;
          const [cc] = p.main.splice(from, 1);
          p.main.splice(idx > from ? idx - 1 : idx, 0, cc);
        });
        return;
      }
      TL.render();
      return;
    }
    if ((d.kind === 'overlay' || d.kind === 'fx' || d.kind === 'audio') && d.mode === 'move' && d.moved) {
      const it = S.findItem(d.kind, d.id);
      const tg = d.target || { track: it.track };
      S.live((p) => {
        if (tg.insert != null) { S.insertTrack(tg.insert, p); it.track = tg.insert; }
        else if (tg.track != null && tg.track !== it.track) {
          if (S.trackFree(tg.track, it.start, it.start + it.dur, it.id, p)) it.track = tg.track;
          else { const pos = tg.track + 1; S.insertTrack(pos, p); it.track = pos; }
        } else if (!S.trackFree(it.track, it.start, it.start + it.dur, it.id, p)) {
          // ทับของอื่นในเลเยอร์เดิม → ยกขึ้นเป็นเลเยอร์ใหม่
          const pos = it.track + 1; S.insertTrack(pos, p); it.track = pos;
        }
      });
    }
    TL.dropMarker = null;
    S.endLive();
    TL.render();
  }

  function drawDropMarker() {
    const old = inner.querySelector('.tl-drop');
    if (old) old.remove();
    const m = TL.dropMarker;
    if (!m) return;
    const lane = inner.querySelector(`.tl-lane[data-row="${m.row}"]`);
    if (!lane) return;
    lane.appendChild(U.el('div.tl-drop', { style: { left: m.time * TL.pps + 'px' } }));
  }

  // ---------------------------------------------------------------- คลิกขวา
  function onContext(e) {
    const node = e.target.closest('.tl-item');
    if (!node) return;
    e.preventDefault();
    const kind = node.dataset.kind, id = node.dataset.id;
    const it = S.findItem(kind, id);
    if (!it) return;
    if (S.isMulti() && S.isSelected(kind, id)) { App.contextMenu(e, CM.groupMenu()); return; }
    S.select({ kind, id });
    App.contextMenu(e, CM.menuFor(kind, it));
  }

  // ---------------------------------------------------------------- ลากวางจากคลัง
  TL.payload = null;
  function onDragOver(e) {
    const hasFiles = e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    if (!TL.payload && !hasFiles) return;
    e.preventDefault();
    const lane = e.target.closest && e.target.closest('.tl-lane');
    const t = timeAt(e);
    if (lane) { TL.dropMarker = { row: lane.dataset.row, time: snap(t), type: lane.dataset.type, sub: lane.dataset.sub }; drawDropMarker(); }
  }
  function onDrop(e) {
    e.preventDefault();
    const lane = e.target.closest && e.target.closest('.tl-lane');
    const t = snap(timeAt(e));
    const target = lane ? { type: lane.dataset.type, sub: lane.dataset.sub, time: t } : { type: null, time: t };
    if (lane && lane.dataset.type === 'main') {
      const lay = S.layout();
      let idx = lay.length;
      for (let i = 0; i < lay.length; i++) if (t < (lay[i].start + lay[i].end) / 2) { idx = i; break; }
      target.index = idx;
      const clipNode = e.target.closest('.tl-item.clip');
      if (clipNode) target.clipId = clipNode.dataset.id;
    }
    if (lane && lane.dataset.type === 'overlay') target.track = Number(lane.dataset.track);
    if (lane && lane.dataset.type === 'newlayer') { target.type = 'overlay'; target.newLayer = true; }
    const trNode = e.target.closest && e.target.closest('.tl-trans');
    if (trNode) target.transitionOf = trNode.dataset.id;
    TL.dropMarker = null;
    drawDropMarker();
    if (TL.payload) { const p = TL.payload; TL.payload = null; S.emit('drop', { payload: p, target }); return; }
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      const files = Array.from(e.dataTransfer.files).map((f) => window.api.pathForFile(f)).filter(Boolean);
      S.emit('drop-files', { files, target });
    }
  }

  TL.startDrag = (e, payload) => {
    TL.payload = payload;
    e.dataTransfer.setData('text/plain', 'klip');
    e.dataTransfer.effectAllowed = 'copy';
  };
  document.addEventListener('dragend', () => { TL.payload = null; });

  window.TL = TL;
})();
