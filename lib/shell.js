/* modules/motion/lib/shell.js — MTK.shell（外壳）
 * ---------------------------------------------------------------------------
 * 一个 comp.html 只做三件事：给外壳「有哪些幕、每幕怎么画」，其余全在这里。
 *
 * 契约（onetake，必须逐条满足）：
 *   window.__meta              {dur, fps, w, h, inFrame:{id:[t0,t1]|'whole'}}
 *   window.__seek(t) → Promise **图片解码完才 resolve**（同一 t 两次必须同帧）
 *   window.__ready   → Promise 字体 + 所有 <img> decode 完 + 先画一帧
 *   window.__track(t) → {id:{x,y,w,h,op}}   **屏幕坐标**（verify_promo 的 framing 腿读它）
 *   window.__motion(t0,t1) → number         屏幕上最大的位移（render.py 据此定快门采样数）
 *   window.__events() → [{t,kind,gain,pan}] 音轨卡点（score.mjs 读它）
 *
 * 三条硬纪律（每条都花过一条命，出处见 modules/motion/CONTRACT.md）：
 *   ① **先把 __seek / __ready 装上，再装模块** —— 一个模块 mount 抛异常，整页就再也渲不了
 *   ② 每个模块 mount 单独 try/catch，挂掉的进 DEAD（`?dbg=1` 左上角红字可看）
 *   ③ 渲染路径禁 Math.random / Date.now：一切是 t 的函数；随机只在初始化时用 MTK.rng(seed)
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};
  const OM = root.OM || {};
  const { clamp, lerp } = OM;

  const S = MTK.shell = {};
  const DEAD = [];              // {name, error}
  const MODS = [];              // {act, draw, hide}
  const TRACK = new Map();      // id -> boxFn(t, st) -> {x,y,w,h,op}|null（屏幕坐标）
  const EVENTS = [];            // 卡点（由 timeline.beats 生成 + 模块补点）

  let T = null, OPT = null, READY = null, lastT = -1;
  let cam = { x: 960, y: 540, zoom: 1, rot: 0 };
  const FX = { shake: { x: 0, y: 0, rot: 0 }, flash: null, hits: [] };

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
  const q = new URLSearchParams(location.search);

  /* ── 1 · 场景骨架：stage / 每幕一层 / world / flash / poster / hud ───────── */
  function scaffold() {
    const stage = $('stage');
    for (const a of T.acts) {
      const layer = el('div', 'act', stage);
      layer.id = 'act-' + a.id;
      layer.dataset.act = a.id;
      layer.style.display = 'none';
      const world = el('div', 'world', layer);
      a._layer = layer; a._world = world;
    }
    FX.flashEl = el('div', 'flashfx', stage); FX.flashEl.id = 'flashfx';
    const hud = el('div', '', stage); hud.id = 'hud';
    const dbg = el('div', '', stage); dbg.id = 'dbg';
    const poster = $('poster');
    if (poster) {
      /* 只有"双击直接打开"（无任何 query）才显示播放页；截图/渲染一进来就藏掉 */
      const direct = [...q.keys()].length === 0;
      poster.style.display = direct ? 'flex' : 'none';
      poster.addEventListener('click', () => { poster.style.display = 'none'; play(); });
    }
  }

  /* ── 2 · 每帧的公共量 ───────────────────────────────────────────────────── */
  function actAt(t) {
    const A = T.acts;
    for (let i = 0; i < A.length; i++) if (t >= A[i].t0 && t < A[i].t1) return A[i];
    return t < A[0].t0 ? A[0] : A[A.length - 1];
  }
  function energyAt(t) {
    let e = 0;
    for (const b of T.beats) {
      const dt = t - b.t;
      if (dt >= 0 && dt < 1.1) e = Math.max(e, Math.exp(-dt * 4.2) * (b.kind === 'crush' ? 1 : b.kind === 'metal' ? 0.85 : b.kind === 'kick' ? 0.8 : 0.5));
    }
    return clamp(e, 0, 1);
  }
  function cueAt(t) {
    let best = null;
    for (const b of T.beats) if (b.t <= t && (!best || b.t > best.t)) best = b;
    return best;
  }
  function shakeAt(t) {
    let x = 0, y = 0, rot = 0;
    for (const s of (T.shakes || [])) {
      const r = OM.shake(t, s.t, { amp: s.amp, decay: s.decay, freq: 19, seed: 7 });
      x += r.x; y += r.y; rot += r.rot;
    }
    return { x, y, rot };
  }

  /* ── 3 · 每帧：seek(t) 是纯函数 ─────────────────────────────────────────── */
  function seek(t) {
    t = clamp(t, 0, T.dur);
    if (T.stills) for (const [a, b] of T.stills) if (t > a && t < b) t = Math.min(t, b - 1e-4); // 静止窗口内不改状态
    lastT = t;
    const act = actAt(t);
    const poster = $('poster'); if (poster && poster.style.display !== 'none' && poster.style.display !== '') poster.style.display = 'none';

    cam = OM.camera(t, T.cameraKeys, { W: T.w, H: T.h });
    const sk = shakeAt(t);
    const st = {
      t, act: act.id, actT: t - act.t0, actP: clamp((t - act.t0) / (act.t1 - act.t0), 0, 1),
      w: T.w, h: T.h, energy: energyAt(t), cam, shake: sk, cue: cueAt(t),
      /* 相机矩阵：depth 0 焦平面；>0 更远（动得更少）；<0 更近（动得更多） */
      view: (depth = 0) => OM.view(cam, { W: T.w, H: T.h, depth }),
      /* 把某一层按深度摆好（相机 + 抖动一起作用） */
      setWorld: (node, depth = 0) => {
        const M = OM.view(cam, { W: T.w, H: T.h, depth });
        node.style.transformOrigin = '0 0';
        node.style.transform = `matrix(${M[0].toFixed(6)},${M[1].toFixed(6)},${M[2].toFixed(6)},${M[3].toFixed(6)},${(M[4] + sk.x).toFixed(2)},${(M[5] + sk.y).toFixed(2)})`;
      },
      hit: (kind, gain = 1, pan = 0) => { EVENTS.push({ t: +t.toFixed(3), kind, gain, pan }); },
      shake: (amp, decay = 10) => { const r = OM.shake(t, t - 1 / 60, { amp, decay, freq: 19, seed: 7 }); FX.shake.x += r.x; FX.shake.y += r.y; },
      flash: (color, alpha, mode = 'multiply') => { FX.flash = { color, alpha, mode }; },
      $, el, rng: root.MTK.rng,
    };

    /* 只画当前幕；其余整层 display:none（比 clearRect 可靠 —— 0929 的教训） */
    const pending = [];
    for (const a of T.acts) {
      const on = a.id === act.id;
      const want = on ? '' : 'none';
      if (a._layer.style.display !== want) a._layer.style.display = want;
      if (!on) continue;
      for (const m of MODS) {
        if (m.act !== a.id) continue;
        try { const p = m.draw(t, st); if (p && p.then) pending.push(p); }
        catch (e) { if (!m._err) { m._err = true; DEAD.push({ name: 'draw:' + a.id, error: String(e && e.message || e) }); } }
      }
    }

    /* 闪光（近白底一律 multiply + 冷色：screen + 白在白底上等于没有） */
    FX.flashEl.style.background = FX.flash ? FX.flash.color : 'transparent';
    FX.flashEl.style.opacity = FX.flash ? FX.flash.alpha : 0;
    FX.flashEl.style.mixBlendMode = FX.flash ? FX.flash.mode : 'normal';
    FX.flash = null; FX.shake = { x: 0, y: 0, rot: 0 };

    const hud = $('hud');
    if (hud && hud.style.display !== 'none') hud.textContent = `t=${t.toFixed(3)}  ${act.id}  ${(t - act.t0).toFixed(2)}/${(act.t1 - act.t0).toFixed(2)}  e=${st.energy.toFixed(2)}`;
    if (audio && !playing) { try { audio.currentTime = t; } catch (e) {} }   // 拖动/定格时对齐音轨（不播放）
    if (q.has('dbg')) $('dbg').textContent = (DEAD.length ? 'DEAD: ' + DEAD.map((d) => d.name).join(', ') : 'modules ok') + `  ·  ${MODS.length} mounted`;
    return Promise.all(pending);
  }

  /* ── 4 · 追踪（屏幕坐标）与 __motion ───────────────────────────────────── */
  function trackSnapshot(t) {
    const out = {};
    for (const [id, fn] of TRACK) {
      try { const b = fn(t); if (b) out[id] = { x: b.x, y: b.y, w: b.w, h: b.h, op: b.op == null ? 1 : b.op }; }
      catch (e) { /* 单点失败不影响其它 */ }
    }
    return out;
  }

  /* ── 5 · 播放 / 拖动 / 键盘（只有"人看"这条路用 rAF；渲染不走它）───────── */
  let playing = false, t0p = 0, audio = null;
  /* 音轨（可选）：build-single.mjs 会注入 window.MTK_AUDIO_SRC（mp3 的 data URI）。
     规矩照 0929 的教训：**绝不在 __seek 里启音频**（无头环境没有用户手势，play() 会被拒），
     只在 play()/pause() 里动它；seek() 只写 currentTime（暂停态写时间是允许的）。 */
  function ensureAudio() {
    if (audio || !root.MTK_AUDIO_SRC) return audio;
    audio = document.createElement('audio');
    audio.src = root.MTK_AUDIO_SRC;
    audio.preload = 'auto';
    document.body.appendChild(audio);
    return audio;
  }
  function play() {
    if (playing) return; playing = true; t0p = performance.now() - lastT * 1000;
    const a = ensureAudio(); if (a) { try { a.currentTime = lastT; a.play().catch(() => {}); } catch (e) {} }
    const loop = () => {
      if (!playing) return;
      const t = (performance.now() - t0p) / 1000;
      if (t > T.dur) { playing = false; if (audio) audio.pause(); return; }
      Promise.resolve(seek(t)).then(() => requestAnimationFrame(loop));
    };
    requestAnimationFrame(loop);
  }
  function pause() { playing = false; if (audio) audio.pause(); }

  /* ── 6 · 装配 ───────────────────────────────────────────────────────────── */
  S.boot = function (opt) {
    OPT = opt; T = opt.timeline || MTK.timeline;
    window.__meta = { dur: T.dur, fps: T.fps, w: T.w, h: T.h, inFrame: opt.inFrame || {}, title: T.title, concept: T.concept };

    /* ① 契约先装：任何模块挂掉都不影响"能不能渲" */
    window.__seek = async (t) => { await seek(t); return true; };
    window.__track = (t) => { seek(t); return trackSnapshot(t); };
    window.__motion = (t0, t1) => {
      seek(t0); const a = trackSnapshot(t0);
      seek(t1); const b = trackSnapshot(t1);
      let far = Math.max(0, OM.screenTravel(OM.camera(t0, T.cameraKeys, { W: T.w, H: T.h }), OM.camera(t1, T.cameraKeys, { W: T.w, H: T.h }), cam, { W: T.w, H: T.h }));
      for (const id of Object.keys(a)) {
        const p = a[id], r = b[id]; if (!p || !r) continue;
        far = Math.max(far, Math.hypot(r.x - p.x, r.y - p.y), Math.hypot(r.x + r.w - p.x - p.w, r.y + r.h - p.y - p.h));
      }
      return far;
    };
    /* 卡点表：**节拍表是唯一真相**（T.beats），模块用 st.hit() 补的点按 (t,name) 去重后并入。
       注意：不在这里"逐帧 push" —— __seek 可能被调用上千次，那样 EVENTS 会炸。 */
    window.__events = () => {
      const seen = new Set();
      const out = [];
      for (const b of T.beats) { const k = b.name; if (seen.has(k)) continue; seen.add(k); out.push({ t: b.t, name: b.name, kind: b.kind, gain: b.gain == null ? 1 : b.gain, pan: b.pan || 0 }); }
      for (const e of EVENTS) { if (e.t < 0) continue; const k = e.name || (e.kind + '@' + e.t); if (seen.has(k)) continue; seen.add(k); out.push(e); }
      return out.sort((p, r) => p.t - r.t);
    };
    /* 体检钩子：tools/diag.py 与 tools/sheet.py 读这两个（模块名 + 谁挂了 + 卡点名） */
    window.__diag = () => ({ mods: MODS.map((m) => m.act + ':' + (m.name || 'draw')), dead: Object.fromEntries(DEAD.map((d) => [d.name, d.error])), mounted: MODS.length });
    window.__cue = (t) => { const c = cueAt(t); return c ? { name: c.name, kind: c.kind, t: c.t } : null; };
    READY = (async () => { if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} } })();

    scaffold();

    /* ② 装配模块：每个单独 try/catch */
    const only = q.get('only');
    const ctxBase = {
      reg: (id, fn) => TRACK.set(id, fn),
      hit: (kind, gain, pan) => EVENTS.push({ t: -1, kind, gain, pan, at: 'setup' }),
      $, el,
    };
    for (const a of T.acts) {
      for (const spec of (opt.build ? opt.build(a, ctxBase) : [])) {
        if (only && spec.name !== only) continue;
        try {
          const api = spec.mount({ layer: a._layer, world: a._world, act: a, ctx: ctxBase, w: T.w, h: T.h });
          if (api && api.draw) MODS.push({ act: a.id, draw: api.draw, name: spec.name, hide: api.hide });
        } catch (e) { DEAD.push({ name: spec.name || a.id, error: String(e && e.message || e) }); }
      }
    }

    /* ③ ready = 字体 + 所有图片 decode 完 + 先画一帧 */
    window.__ready = READY.then(async () => {
      const imgs = [...document.querySelectorAll('img')];
      await Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
      /* 再等两帧：图片 decode 完 ≠ 合成器已经把它上屏；不等的话"刚写完的大文件首次打开"会拍到半张图
         （实测：单文件刚构建完第一次比对 max 38 色阶，再跑两次都是 0） */
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await seek(0);
      return { dur: T.dur, modules: MODS.length, dead: DEAD.length };
    });

    /* ④ 查询参数：?t= 定格 · ?play 播 · ?hud 参数台 · ?dbg 模块体检 */
    if (q.has('hud')) $('hud').style.display = 'block';
    if (q.has('dbg')) $('dbg').style.display = 'block';
    if (q.has('t')) window.__ready.then(() => seek(parseFloat(q.get('t'))));
    if (q.has('play')) window.__ready.then(() => play());
    /* ⚠ 没有 query 时**绝不自动播**：render.py / stills.py 都是以 `file://…/comp.html`（无 query）打开，
       一自动播就等于"按墙钟渲染" —— 同一 t 两次截图会拿到两个不同的帧，确定性直接破功（实测差异面积 20–36%）。
       双击直接看的人会看到播放页（海报），点一下就播。 */
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(); }
      if (e.code === 'ArrowRight') seek(lastT + 1);
      if (e.code === 'ArrowLeft') seek(lastT - 1);
    });
    return S;
  };

  S.seek = seek;
  S.events = () => EVENTS;
  S.dead = () => DEAD;
  S.mods = () => MODS;
})(typeof window !== 'undefined' ? window : globalThis);
