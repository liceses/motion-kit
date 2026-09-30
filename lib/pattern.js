/* modules/motion/lib/pattern.js — 孟菲斯的"形"（MTK.pat）：全部**代码画**，不用位图
 * ---------------------------------------------------------------------------
 * 为什么代码画：自己的动效研究 R-20「装饰优先零素材」；而且模型画的圆不圆、棋盘会折角
 * （本期实测：贴纸表里两个圆是歪的、棋盘是变形的）。所以：
 *   · **干净的几何**（正圆、圆环、同心拱、棋盘、圆点阵、锯齿、波浪）→ 这里的代码
 *   · **手绘的手感**（手抖的拱、不齐的波浪）→ 模型图版（assets/plates/*）
 * 两者分工，是 STYLE.md §2「骨架用代码、手感用模型」的落地。
 *
 * 全部是纯函数：给定同样的参数画同样的一批像素（渲染路径确定性）。
 * ---------------------------------------------------------------------------
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};
  const P = MTK.pat = {};
  const TAU = Math.PI * 2;

  const rgb = (hex) => {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  P.hexA = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; };

  /* ── 圆 / 圆环（真圆，不是 blob）────────────────────────────────────── */
  P.dot = (ctx, x, y, r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
  P.ring = (ctx, x, y, r, w, color) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r - w / 2, 0, TAU); ctx.stroke(); };

  /* ── 同心拱（孟菲斯的标志形）：rings = [色…] 由外到内 ──────────────────── */
  P.arch = function (ctx, x, y, w, h, rings, lw) {
    const cx = x + w / 2, r0 = w / 2, step = (r0 - lw) / rings.length;
    for (let i = 0; i < rings.length; i++) {
      const r = r0 - i * step;
      ctx.strokeStyle = rings[i]; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.arc(cx, y + h, r - lw / 2, Math.PI, TAU); ctx.stroke();
      /* 两条腿（拱脚落到基线上） */
      ctx.beginPath();
      ctx.moveTo(cx - (r - lw / 2), y + h); ctx.lineTo(cx - (r - lw / 2), y + h - 0.0001);
      ctx.moveTo(cx + (r - lw / 2), y + h); ctx.lineTo(cx + (r - lw / 2), y + h - 0.0001);
      ctx.stroke();
    }
  };
  P.archLegs = function (ctx, x, y, w, h, rings, lw, legTo) {
    const cx = x + w / 2, r0 = w / 2, step = (r0 - lw) / rings.length;
    for (let i = 0; i < rings.length; i++) {
      const r = r0 - i * step - lw / 2;
      ctx.strokeStyle = rings[i]; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(cx - r, y + h); ctx.lineTo(cx - r, legTo); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + r, y + h); ctx.lineTo(cx + r, legTo); ctx.stroke();
    }
  };

  /* ── 棋盘：硬边方格（不用渐变；这才是"平涂"）──────────────────────────── */
  P.checker = function (ctx, x, y, cols, rows, size, a, b, rot = 0) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      ctx.fillStyle = ((i + j) % 2) ? a : b;
      ctx.fillRect(i * size, j * size, size, size);
    }
    ctx.restore();
  };

  /* ── 圆点阵（可带确定性抖动；抖动值在初始化时用 MTK.rng 定一次）───────── */
  P.dotGrid = function (ctx, x, y, cols, rows, gap, r, color, jitter) {
    ctx.fillStyle = color;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const jx = jitter ? jitter[(i * rows + j) % jitter.length] : 0;
      const jy = jitter ? jitter[(i * rows + j + 7) % jitter.length] : 0;
      ctx.beginPath(); ctx.arc(x + i * gap + jx, y + j * gap + jy, r, 0, TAU); ctx.fill();
    }
  };

  /* ── 锯齿 ────────────────────────────────────────────────────────────── */
  P.zigzag = function (ctx, x, y, w, h, teeth, color, lw) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'miter'; ctx.beginPath();
    const step = w / teeth;
    for (let i = 0; i <= teeth; i++) {
      const px = x + i * step, py = y + (i % 2 ? 0 : h);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  /* ── 波浪线（正弦；相位固定 → 确定性）───────────────────────────────── */
  P.wave = function (ctx, x, y, w, amp, lambda, color, lw, phase = 0) {
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
    const n = Math.max(2, Math.round(w / 6));
    for (let i = 0; i <= n; i++) {
      const px = x + (i / n) * w, py = y + Math.sin((i / n) * TAU * (w / lambda) + phase) * amp;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  /* ── 三角 / 梯形（硬边）──────────────────────────────────────────────── */
  P.tri = function (ctx, x, y, w, h, color, rot = 0) {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot);
    ctx.fillStyle = color; ctx.beginPath();
    ctx.moveTo(0, -h / 2); ctx.lineTo(w / 2, h / 2); ctx.lineTo(-w / 2, h / 2); ctx.closePath(); ctx.fill(); ctx.restore();
  };
  P.beam = function (ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

  /* ── 一个"条纹场"（把 pattern-field 图版压成低不透明度底纹时用）──────── */
  P.tileMirror = function (ctx, img, x, y, w, h, scale, alpha, dx) {
    ctx.save(); ctx.globalAlpha = alpha;
    const iw = img.naturalWidth * scale, ih = img.naturalHeight * scale;
    const start = Math.floor((x - dx) / iw) - 1, end = Math.ceil((x - dx + w) / iw) + 1;
    for (let i = start; i <= end; i++) {
      const px = x + i * iw - dx;
      if (i % 2 === 0) { ctx.setTransform(1, 0, 0, 1, px, y); ctx.drawImage(img, 0, 0, iw, ih); }
      else { ctx.setTransform(-1, 0, 0, 1, px + iw, y); ctx.drawImage(img, 0, 0, iw, ih); }
    }
    ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  /* ── 贴纸表取用（CSS sprite 的 canvas 版）────────────────────────────── */
  P.sprite = function (ctx, img, box, x, y, scale = 1, rot = 0, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (rot) ctx.rotate(rot);
    ctx.drawImage(img, box.x, box.y, box.w, box.h, -box.w * scale / 2, -box.h * scale / 2, box.w * scale, box.h * scale);
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
