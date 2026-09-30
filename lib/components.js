/* modules/motion/lib/components.js — 组件库（MTK.comp）
 * ---------------------------------------------------------------------------
 * 屏幕上的东西只有三样：**组件、动作、纹样**。这里就是"组件"那一半。
 * 每个组件都长成同一个形状：
 *
 *     const c = MTK.comp.card(parent, {...});      // 建 DOM（一次性）
 *     ... 在某一幕的 draw(t, st) 里：
 *     c.draw(t, st, { in: 3.10, out: 8.90, ... }); // 每帧只写 transform / opacity / text
 *
 * 纪律（抄自己的动效研究 + onetake）：
 *   · 只动 transform / clip-path / opacity（R-19）；不动布局属性
 *   · 曲线一律从 OM 取（具名，字面量不散落，R-14）
 *   · 入场从 scale(.94)+opacity 0 起，**不许从 scale(0)**（Emil）
 *   · 每个组件都可以 opts.reg(id, box) 登记一个屏幕盒，供 __track / framing 用
 *   · 禁用 Math.random：要随机用 MTK.rng(seed)
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};
  const OM = root.OM, { clamp, lerp } = OM;
  const C = MTK.comp = {};

  const mk = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  const box = (node, x, y, s = 1, op = 1, rot = 0) => {
    node.style.opacity = op;
    node.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${s.toFixed(4)})` + (rot ? ` rotate(${rot.toFixed(4)}rad)` : '');
  };
  C.mk = mk; C.box = box;

  /* ── 入场/退场：全片共用一套（Emil：进场 ease-out、退场更快、不从 scale(0) 起）── */
  C.inout = function (t, w) {
    const k = w.in == null ? 1 : OM.ease.expoOut(clamp((t - w.in) / (w.inDur || 0.34), 0, 1));
    const ko = w.out == null ? 0 : OM.ease.expoOut(clamp((t - w.out) / (w.outDur || 0.18), 0, 1));
    return { op: clamp(k - ko, 0, 1), s: lerp(0.94, 1, k) * lerp(1, 1.04, ko), dy: (1 - k) * (w.rise == null ? 26 : w.rise) - ko * (w.exitDy == null ? 40 : w.exitDy), k, ko };
  };

  /* ── 1 · 角标（badge）：每段首帧一个，带档案号（母题 M-03 变体）────────────
   * 退场**随该段主元素**（由调用方在同一帧里顺带把它推走），不做独立淡出。 */
  C.badge = function (parent, o) {
    const node = mk('div', 'm-badge' + (o.tone ? ' ' + o.tone : ''), parent);
    node.innerHTML = `<span class="m-badge-no">${o.no || ''}</span><span>${o.en}</span><span class="m-badge-zh">${o.zh || ''}</span>`;
    node.style.left = (o.x == null ? 120 : o.x) + 'px';
    node.style.top = (o.y == null ? 62 : o.y) + 'px';
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, { in: w.in, out: w.out, rise: 18, exitDy: -22, inDur: 0.22, outDur: 0.16 });
        box(node, w.dx || 0, io.dy, io.s, io.op);
      },
    };
  };

  /* ── 2 · 卡（card）：底板 + 词逐行升起 + 打字机 ───────────────────────── */
  C.card = function (parent, o) {
    const node = mk('div', 'm-card' + (o.tone ? ' ' + o.tone : '') + (o.shadow ? ' ' + o.shadow : ''), parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    node.style.width = o.w + 'px'; node.style.height = o.h + 'px';
    const head = mk('div', 'm-kicker' + (o.headTone ? ' ' + o.headTone : ''), node, o.head || '');
    const lines = (o.lines || []).map((txt, i) => {
      const wrap = mk('div', 'm-line', node);
      wrap.style.overflow = 'hidden';
      const inner = mk('div', 'm-b', wrap, txt);
      return { wrap, inner, txt, i };
    });
    const type = o.typeText ? mk('div', 'm-s', node, '') : null;
    return {
      node, lines,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        /* 词逐行升起（maskRise）+ 逐块错开 70ms（R-15） */
        lines.forEach((L) => {
          const r = OM.maskRise(t, w.lineT0 || w.in + 0.18, L.i, { stagger: w.stagger == null ? 0.07 : w.stagger, dist: 30 });
          L.inner.style.transform = `translateY(${r.y.toFixed(2)}px)`;
          L.wrap.style.opacity = r.visible ? 1 : 0;
        });
        if (type && w.typeT0 != null) {
          const ty = OM.typeOn(t, w.typeT0, o.typeText, { cps: o.cps || 34 });
          type.textContent = ty.str;
        }
        if (w.hit != null) { const im = OM.impact(t, w.hit, { sqx: 0.05, sqy: 0.07 }); node.style.transform += ` scale(${im.sx.toFixed(4)},${im.sy.toFixed(4)})`; }
      },
    };
  };

  /* ── 3 · 大数字（stat）：逐位滚动（odometer）──────────────────────────── */
  C.stat = function (parent, o) {
    const node = mk('div', 'm-stat', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    const digitEls = [];
    const digits = String(o.to);
    const SIZE = o.size || 168;
    node.style.fontSize = SIZE + 'px';                 /* 字形也要跟着 strip 高度，否则数字只有 56px */
    node.style.lineHeight = SIZE + 'px';
    for (let i = 0; i < digits.length; i++) {
      if (digits[i] === ',') { mk('span', 'm-stat-sep', node, ','); continue; }
      const w = mk('span', 'm-stat-d', node);
      w.style.display = 'inline-block'; w.style.overflow = 'hidden';
      w.style.height = SIZE + 'px'; w.style.verticalAlign = 'bottom';
      const strip = mk('span', '', w);
      strip.style.display = 'inline-block';
      /* 11 格：0–9 再补一个 0，这样"9 往 0 滚"的那一下不会露出空白 */
      strip.innerHTML = Array.from({ length: 11 }, (_, d) => `<span style="display:block;height:${SIZE}px;line-height:${SIZE}px">${d % 10}</span>`).join('');
      digitEls.push({ w, strip });
    }
    if (o.suffix) { const s = mk('span', 'm-stat-suf', node, o.suffix); s.style.fontSize = '30px'; }
    const from = o.from == null ? 0 : o.from;
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        const k = OM.ease.expoOut(clamp((t - w.countT0) / (w.countDur || 1.1), 0, 1));
        const raw = lerp(from, o.to, k);
        const n = digitEls.length;
        for (let i = 0; i < n; i++) {
          /* 从右往左第 (n-1-i) 位：整数部分 = 该位数字，小数部分 = 正在滚动的那一点。
             ⚠ 滚动量必须在终点前收敛到 0：否则 k=1 时 tens 位停在 3.9 → 观众读到的是 49 而不是 39
             （实测踩过：计数器最后一位"停在半路"会直接把数字读错）。 */
          const place = Math.pow(10, n - 1 - i);
          const v = Math.max(0, raw / place);
          const d = Math.floor(v) % 10;
          const frac = (v - Math.floor(v)) * Math.max(0, 1 - k * 1.15);
          digitEls[i].strip.style.transform = `translateY(${(-(d + frac) * SIZE).toFixed(2)}px)`;
        }
      },
    };
  };

  /* ── 4 · 对照表（table）：行依次归位（gather），酸绿标该行第一 ─────────── */
  C.table = function (parent, o) {
    const node = mk('div', 'm-tablewrap', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px'; node.style.width = o.w + 'px';
    const rows = (o.rows || []).map((cells, i) => {
      const r = mk('div', 'm-trow' + (i === o.first ? ' first' : ''), node);
      r.style.display = 'flex'; r.style.alignItems = 'center'; r.style.gap = '18px';
      r.style.height = (o.rowH || 96) + 'px';
      r.style.borderBottom = 'var(--m-bw-sm) solid var(--m-ink)';
      cells.forEach((c, j) => {
        const cell = mk('div', j === 0 ? 'm-tlabel' : 'm-tval', r, c);
        cell.style.flex = j === 0 ? '0 0 ' + (o.labelW || 380) + 'px' : '1';
        cell.style.fontSize = (j === 0 ? 26 : 34) + 'px';
        cell.style.fontWeight = j === 0 ? '700' : '900';
        cell.style.color = j === 0 ? 'var(--m-mute)' : 'var(--m-ink)';
      });
      return r;
    });
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        rows.forEach((r, i) => {
          const g = OM.gather(t, w.rowT0, w.rowT0 + 0.34, i, rows.length, { x: 0, y: 26 }, { x: 0, y: 0 }, { stagger: w.rowStagger == null ? 0.22 : w.rowStagger, arc: 8 });
          r.style.transform = `translate(${g.x.toFixed(2)}px,${g.y.toFixed(2)}px)`;
          const hit = OM.impact(t, w.rowT0 + i * (w.rowStagger == null ? 0.22 : w.rowStagger), { sqx: 0.02, sqy: 0.04 });
          r.style.transform += ` scale(${hit.sx.toFixed(4)},${hit.sy.toFixed(4)})`;
          r.style.opacity = t >= w.rowT0 + i * (w.rowStagger == null ? 0.22 : w.rowStagger) - 0.05 ? 1 : 0;
        });
      },
    };
  };

  /* ── 5 · 引述卡 / 证据框（quote · evidence）：由卡 morphRect 变形而来 ────── */
  C.quote = function (parent, o) {
    const node = mk('div', 'm-card sh-mag', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    node.style.width = o.w + 'px'; node.style.height = o.h + 'px';
    const mark = mk('div', 'm-qmark', node, '“'); mark.style.fontSize = '96px'; mark.style.lineHeight = '0.7'; mark.style.color = 'var(--m-mag-deep)';
    const body = mk('div', 'm-b', node, o.text); body.style.fontSize = '34px';
    const src = mk('div', 'm-s', node, o.source || '');
    return { node, draw(t, st, w) { const io = C.inout(t, w); box(node, 0, io.dy, io.s, io.op); } };
  };
  C.evidence = function (parent, o) {
    const node = mk('div', 'm-frame', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    node.style.width = o.w + 'px'; node.style.height = o.h + 'px';
    const cap = mk('div', 'm-s', node, o.caption || '');
    cap.style.position = 'absolute'; cap.style.left = '14px'; cap.style.bottom = '10px';
    return { node, draw(t, st, w) { const io = C.inout(t, w); box(node, 0, io.dy, io.s, io.op); } };
  };

  /* ── 6 · 印章（stamp）：砸落 + 按压回弹 ──────────────────────────────── */
  C.stamp = function (parent, o) {
    const node = mk('div', 'm-stamp', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    const inner = mk('span', 'm-stamp-in', node, o.text || '');
    inner.style.fontSize = (o.size || 22) + 'px';
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, { in: w.in, out: w.out, rise: 120, exitDy: -30, inDur: 0.42 });
        const im = OM.impact(t, w.hit == null ? w.in + 0.34 : w.hit, { sqx: 0.16, sqy: 0.2, decay: 6, omega: 18 });
        box(node, 0, io.dy, io.s * lerp(1.08, 1, io.k), io.op);
        node.style.transform += ` scale(${im.sx.toFixed(4)},${im.sy.toFixed(4)}) rotate(${(-0.06 * io.k).toFixed(4)}rad)`;
      },
    };
  };

  /* ── 7 · 缎带 / 跑马灯（ribbon）──────────────────────────────────────── */
  C.ribbon = function (parent, o) {
    const node = mk('div', 'm-ribbon', parent);
    node.style.top = o.y + 'px'; node.style.height = (o.h || 54) + 'px';
    const line = mk('div', 'm-rline', node, (o.text || '') + '   ');
    line.style.top = '3px';
    const w0 = (o.text || '').length * 13;
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        node.style.opacity = io.op;
        const speed = o.speed == null ? 90 : o.speed;
        const span = w0 + 1920;
        const x = -(((t * speed) % span) + (o.phase || 0));
        line.style.transform = `translateX(${x.toFixed(1)}px)`;
      },
    };
  };

  /* ── 8 · 组件总表（index）：10 行，每行就是那个组件的样品 ─────────────── */
  C.index = function (parent, o) {
    const node = mk('div', 'm-index', parent);
    node.style.left = (o.x == null ? 300 : o.x) + 'px';
    node.style.top = (o.y == null ? 300 : o.y) + 'px';
    node.style.width = (o.w == null ? 1320 : o.w) + 'px';
    const head = mk('div', 'm-ihead', node, o.head || '');
    head.style.display = 'flex'; head.style.alignItems = 'baseline'; head.style.gap = '16px';
    head.style.borderBottom = 'var(--m-bw) solid var(--m-ink)'; head.style.paddingBottom = '10px';
    const rows = (o.items || []).map((it, i) => {
      const r = mk('div', 'm-irow' + (i % 2 ? ' odd' : ''), node);
      r.style.display = 'flex'; r.style.alignItems = 'center'; r.style.gap = '16px';
      r.style.height = (o.rowH || 56) + 'px';
      r.style.borderBottom = 'var(--m-bw-sm) solid var(--m-ink)';
      const no = mk('span', 'm-s', r, String(i + 1).padStart(2, '0'));
      no.style.flex = '0 0 46px'; no.style.color = 'var(--m-mute)';
      const zh = mk('span', '', r, it.zh);
      zh.style.flex = '0 0 240px'; zh.style.fontSize = '28px'; zh.style.fontWeight = '900';
      const en = mk('span', '', r, it.en);
      en.style.flex = '0 0 300px'; en.style.fontFamily = "'Geist Mono', Consolas, monospace";
      en.style.fontSize = '21px'; en.style.color = 'var(--m-mag-deep)';
      const note = mk('span', 'm-s', r, it.note || '');
      note.style.flex = '1'; note.style.fontSize = '20px';
      return r;
    });
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        const total = w.rowsT1 == null ? w.in + 0.6 : w.rowsT1;
        rows.forEach((r, i) => {
          const k = OM.ease.expoOut(clamp((t - (w.rowsT0 + i * 0.045)) / 0.32, 0, 1));
          r.style.opacity = k;
          r.style.transform = `translateY(${((1 - k) * 18).toFixed(2)}px)`;
          /* 最后一行落定时，字标从它里面长出来（第 12 段的 carry） */
        });
      },
    };
  };

  /* ── 9 · 那条 3px 线（spine）：C2 的主线 ──────────────────────────────
   * 6 个槽位，每个槽位就是一条线段 {x1,y1,x2,y2,op}。
   * 每一幕给一组"目标几何"；进入新幕时，上一幕的几何在边界前 0.45s 内插值到新的 ——
   * 于是**线永远不会消失，它只是在变形**：切开纸面 → 卡的四条边 → 数字基线 → 表格横线 →
   * 证据框 → 印章方框 → 相机格线 → 纹波横线 → 中缝 → 拱门腿 → 表头线 → 字标基线。 */
  C.spine = function (parent, n) {
    const nodes = [];
    for (let i = 0; i < (n || 6); i++) {
      const node = mk('div', 'm-rule', parent);
      node.style.width = '1px'; node.style.height = '3px'; node.style.transformOrigin = '0 50%';
      nodes.push(node);
    }
    return {
      nodes,
      /* prev/next = 各 6 条线段的几何 {x1,y1,x2,y2,op}；k = 上一幕 → 这一幕的插值进度
         ease 默认 cubicInOut：线是"拉伸/折叠"，两头都该缓 —— 用 expoOut（snap）会让整幅线在 0.1s 内拉满，
         实测 optical flow 峰值冲到 1246 px/frame、软曲线占比掉到 30%（参考片是 81%）。 */
      draw(t, st, prev, next, k, colorTone, ease) {
        const curve = ease || OM.ease.cubicInOut;
        for (let i = 0; i < nodes.length; i++) {
          const A = prev[i] || { x1: 960, y1: 540, x2: 960, y2: 540, op: 0 };
          const B = next[i] || { x1: 960, y1: 540, x2: 960, y2: 540, op: 0 };
          const e = curve(clamp(k, 0, 1));
          const x1 = lerp(A.x1, B.x1, e), y1 = lerp(A.y1, B.y1, e), x2 = lerp(A.x2, B.x2, e), y2 = lerp(A.y2, B.y2, e);
          const op = lerp(A.op == null ? 1 : A.op, B.op == null ? 1 : B.op, e);
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
          const node = nodes[i];
          node.style.opacity = op;
          node.style.transform = `translate(${x1.toFixed(2)}px,${y1.toFixed(2)}px) rotate(${Math.atan2(dy, dx).toFixed(5)}rad) scaleX(${len.toFixed(2)})`;
          const want = colorTone === 'mag' ? 'var(--m-mag-deep)' : 'var(--m-ink)';
          if (node._tone !== want) { node.style.background = want; node._tone = want; }
        }
      },
    };
  };
  /* ══════════════════════════════════════════════════════════════════════════
     资讯片组件（第二轮扩展 · **落地价值 = 这正是内容工厂每期都要用的那批**）
     规则全部来自本仓库已付出的代价，不是随手定的：
       · 字号下限   hero168 / h1 68 / h2 44 / h3 31 / body 26（下限 24）/ label 20（下限 19）
                    —— 来自 `news-flash-video/references/20-visual.md §10.1`（v1 曾有 62 处 <24px）
       · 字幕条     y 897–988（`bottom:92`），**场景内容必须收在 y ≤ 848**
                    —— 来自 0921-jevrepo 的血泪（字幕被口径条吃掉）
       · 字幕字号   按 `capFont()`：汉字×1 + 其它×0.62 em，`em×字号 + 76 ≤ 1700`，最小 29px
       · 字幕行为   **不滑入滑出**（滑入=弹一下）；整句上，句末硬收；字幕挂到下一句起点前 0.12s
                    —— 来自 `assemble.mjs` 的 CAP_HOLD_UNTIL_NEXT 与用户的"不要弹一下"
       · 对比度     只许用 20-visual.md §10.2 那张表；品红两级（承载文字用 #c20056+白字）
       · 证据图     官方整表截图**不进片**（缩到 943×548 只剩 0.58 倍、正文≈12px）→ 自己重排
       · 密度       单帧可读文字 ≤300 字
     ══════════════════════════════════════════════════════════════════════════ */

  /* ── 1 · HUD 顶栏：栏目 / 期号 / 日期，1px 竖线切格 ─────────────────── */
  C.hud = function (parent, o) {
    const node = mk('div', 'm-hud', parent);
    node.style.left = '0px'; node.style.top = '0px'; node.style.right = '0px';
    const cells = (o.cells || []).map((c) => { const s = mk('span', '', node, c); return s; });
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, { in: w.in, inDur: 0.3, rise: -12 });
        node.style.opacity = io.op;
        /* HUD 不许压内容：高度 60px，内容从 y=96 起（见规则注释） */
      },
    };
  };

  /* ── 2 · 章节卡：kicker 块 + 大标题（≤8 汉字）+ 那条线 ──────────────── */
  C.chapter = function (parent, o) {
    const node = mk('div', 'm-chapter', parent);
    node.style.left = (o.x == null ? 120 : o.x) + 'px'; node.style.top = (o.y == null ? 170 : o.y) + 'px';
    const kick = mk('div', 'm-kicker' + (o.tone ? ' ' + o.tone : ''), node, o.kicker || '');
    const h1 = mk('h1', 'm-chapter-h1', node, o.title || '');
    const sub = o.sub ? mk('div', 'm-s', node, o.sub) : null;
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        C.box(node, 0, io.dy, io.s, io.op);
        const k = OM.ease.expoOut(clamp((t - (w.in + 0.12)) / 0.4, 0, 1));
        h1.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;   // 从左到右揭示
      },
    };
  };

  /* ── 3 · 字幕条（最值钱的一个）：整句黑条 + 逐字高亮 + 句间挂住 ─────────
     规则：① 字号 ≥29px（按 capFont 算，一行 ≤40 字）
           ② 条体 y 897–988；场景内容必须 ≤ y848
           ③ **不滑入滑出**：整句硬上，句末硬收
           ④ 挂到下一句起点前 0.12s（`CAP_HOLD_UNTIL_NEXT`）
           ⑤ 末句不超片尾 */
  C.caption = function (parent, o) {
    const node = mk('div', 'm-cap', parent);
    const inner = mk('div', 'm-cap-in', node);
    const body = mk('div', 'm-cap-text', inner, '');
    const chars = [];                                  // 逐字 span（卡拉OK 用）
    const setText = (s) => {
      body.textContent = '';
      chars.length = 0;
      for (const ch of s) { const sp = mk('span', '', body, ch === ' ' ? '\u00a0' : ch); chars.push(sp); }
    };
    const fs = o.fontSize || 34;
    body.style.fontSize = fs + 'px';
    inner.style.maxWidth = '1720px';
    return {
      node, setText,
      /* w = { lines: [{ t0, t1, text, talk0?, talk1? }], karaoke?: true }
         t0/t1 = **显示**窗口（可挂到下一句起点前）；talk0/talk1 = **这一句的音频**窗口。
         两者必须分开：字幕可以挂住让人读完，但逐字高亮只能跟着口播走。 */
      draw(t, st, w) {
        const cur = (w.lines || []).find((L) => t >= L.t0 && t <= L.t1);
        if (!cur) { if (node._cur != null) { node._cur = null; node.style.opacity = 0; } return; }
        if (node._cur !== cur.text) { setText(cur.text); node._cur = cur.text; }
        const op = clamp((t - cur.t0) / 0.16, 0, 1);      // 整句硬上（不滑入 —— 滑入会"弹一下"）
        C.box(node, 0, 0, 1, op);
        if (w.karaoke) {
          const a = cur.talk0 == null ? cur.t0 : cur.talk0, b = cur.talk1 == null ? cur.t1 : cur.talk1;
          const p = clamp((t - a) / Math.max(0.2, b - a), 0, 1);
          const n = Math.round(p * chars.length);
          for (let i = 0; i < chars.length; i++) chars[i].style.color = i < n ? '#ffffff' : '#7a7a7a';
        } else { for (const c of chars) c.style.color = '#ffffff'; }
      },
    };
  };

  /* ── 4 · 数字盘：大数字 + 标签 + 出处（等宽 + tabular-nums）─────────── */
  C.plate = function (parent, o) {
    const node = mk('div', 'm-plate' + (o.tone ? ' ' + o.tone : ''), parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    node.style.width = (o.w || 520) + 'px'; node.style.height = (o.h || 240) + 'px';
    const lab = mk('div', 'm-plate-lab', node, o.label || '');
    const val = mk('div', 'm-plate-val', node, '');
    const src = o.source ? mk('div', 'm-plate-src', node, o.source) : null;
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        const k = OM.ease.expoOut(clamp((t - (w.in + 0.15)) / (w.countDur || 0.5), 0, 1));
        val.textContent = (o.prefix || '') + Math.round((o.from || 0) + (o.to - (o.from || 0)) * k) + (o.suffix || '');
        if (w.hit != null) { const im = OM.impact(t, w.hit, { sqx: 0.04, sqy: 0.06 }); node.style.transform += ` scale(${im.sx.toFixed(4)},${im.sy.toFixed(4)})`; }
      },
    };
  };

  /* ── 5 · 条形对照（bars）：两条（或 n 条）横条 + 数值，用于 A/B 对比 ──── */
  C.bars = function (parent, o) {
    const node = mk('div', 'm-bars', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px'; node.style.width = (o.w || 1200) + 'px';
    const rows = (o.items || []).map((it) => {
      const row = mk('div', 'm-bar-row', node);
      const lab = mk('div', 'm-bar-lab', row, it.label);
      const track = mk('div', 'm-bar-track', row);
      const fill = mk('div', 'm-bar-fill', track);
      fill.style.background = it.tone === 'mag' ? 'var(--m-mag-deep)' : it.tone === 'cyan' ? 'var(--m-cyan)' : 'var(--m-acid)';
      const num = mk('div', 'm-bar-num', row, '');
      return { it, row, fill, num };
    });
    return {
      node,
      draw(t, st, w) {
        const io = C.inout(t, w);
        box(node, 0, io.dy, io.s, io.op);
        const max = Math.max(...rows.map((r) => r.it.value), 1);
        rows.forEach((r, i) => {
          const t0 = (w.rowT0 || w.in + 0.3) + i * (w.stagger == null ? 0.22 : w.stagger);
          const k = OM.ease.expoOut(clamp((t - t0) / (w.fillDur == null ? 0.5 : w.fillDur), 0, 1));
          r.fill.style.transform = `scaleX(${(k * (r.it.value / max)).toFixed(4)})`;
          r.num.textContent = Math.round(r.it.value * k) + (r.it.unit || '');
          r.row.style.opacity = t >= t0 - 0.05 ? 1 : 0;
        });
      },
    };
  };

  /* ── 6 · 底部进度条：按**真实音频总时长**推进（不看画面时长）────────────
     规则：高 6–8px、贴底（y ≥ 1040），绝不压字幕条（字幕 y 897–988） */
  C.progress = function (parent, o) {
    const node = mk('div', 'm-progress', parent);
    const fill = mk('div', 'm-progress-fill', node);
    return {
      node,
      /* ⚠ t0/t1 从 **draw 的 w** 取（构造参数 o 只放外观）：写成只读 o.t0 会取到 undefined，
         于是 (t-0)/1 被钳成 1 → 进度条永远满格（实测靠 DOM 探针才抓到，眼睛只看出"有点长"） */
      draw(t, st, w) {
        const oo = w || {};
        const a = oo.t0 != null ? oo.t0 : (o.t0 == null ? 0 : o.t0);
        const b = oo.t1 != null ? oo.t1 : (o.t1 == null ? 1 : o.t1);
        const p = clamp((t - a) / Math.max(0.5, b - a), 0, 1);
        fill.style.transform = `scaleX(${p.toFixed(4)})`;
        node.style.opacity = oo.op === false ? 0 : 1;
      },
    };
  };

  /* ── 7 · 跑马灯（竖向或横向，**双份文字 + 按一份取模** = 无缝）────────── */
  C.marquee = function (parent, o) {
    const node = mk('div', o.vertical ? 'm-marq-v' : 'm-marq-h', parent);
    const one = (o.lines || []).join('\n');
    node.textContent = o.vertical ? (one + '\n' + one) : (o.text + '   ' + o.text + '   ');
    const ONE_H = (o.lines || []).length * (o.lineHeight || 30);
    return {
      node,
      draw(t, st, w) {
        node.style.opacity = C.inout(t, w).op * (o.opacity == null ? 0.5 : o.opacity);
        const sp = o.speed == null ? 46 : o.speed;
        node.style.transform = o.vertical
          ? `translateY(${(-((t - w.in) * sp) % ONE_H).toFixed(1)}px)`
          : `translateX(${(-((t - w.in) * sp) % (o.span || 1200)).toFixed(1)}px)`;
      },
    };
  };

  /* ── 8 · 证据框（扩展）：AR-fit + 底部来源条 + 最小尺寸 ─────────────────
     规则（20-visual.md §10.6）：主证据 ≥900×560、次证据 ≥560×350；
     cover 偏差 ≤10%、contain letterbox ≤30%；官方整表不进片（自己重排）。 */
  C.evidenceFit = function (parent, o) {
    const node = mk('div', 'm-frame', parent);
    node.style.left = o.x + 'px'; node.style.top = o.y + 'px';
    node.style.width = o.w + 'px'; node.style.height = o.h + 'px';
    const img = document.createElement('img');
    img.src = o.src || '';
    img.style.cssText = `position:absolute;inset:0;width:100%;height:100%;object-fit:${o.fit || 'contain'};object-position:top center;background:#f0f0f0`;
    node.appendChild(img);
    const bar = mk('div', 'm-frame-src', node, o.caption || '');
    const lab = o.label ? mk('div', 'm-frame-lab', node, o.label) : null;
    return {
      node, img,
      draw(t, st, w) {
        const io = C.inout(t, { in: w.in, out: w.out, rise: 28 });
        C.box(node, 0, io.dy, io.s, io.op);
        if (w.zoom) { const m = OM.zoomThrough(t, w.in, w.in + (w.zoomDur || 2.2), { x: o.x, y: o.y, w: o.w, h: o.h }, { fit: 'cover' }); node.style.transform += ` scale(${(1 + (m.s - 1) * 0.08).toFixed(4)})`; }
      },
    };
  };

  /* ── 9 · 片尾字标（info 版）：字标 + 印章 + 一行口径 ─────────────────── */
  C.endcard = function (parent, o) {
    const node = mk('div', 'm-endcard', parent);
    const mark = mk('div', 'm-endcard-mark', node, o.mark || '');
    const line = mk('div', 'm-endcard-line', node, o.line || '');
    return {
      node,
      draw(t, st, w) {
        const k = OM.ease.expoOut(clamp((t - w.in) / 0.5, 0, 1));
        node.style.opacity = k;
        mark.style.clipPath = `inset(0 ${((1 - k) * 100).toFixed(2)}% 0 0)`;
        line.style.opacity = clamp((t - w.in - 0.5) / 0.4, 0, 1);
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
