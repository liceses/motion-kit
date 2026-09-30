/* modules/motion/lib/fx.js — 孟菲斯的"手感"（MTK.fx）
 * 这里只放**跨期复用**的那几下：硬阴影生长 / 斜刀擦除 / 落定 / 按压 /
 * 波浪场（canvas）/ 弹簧跟随点。曲线一律从 OM 取，参数由 STYLE.md 的令牌决定。
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};
  const OM = root.OM, P = MTK.pat;
  const { clamp, lerp } = OM;
  const TAU = Math.PI * 2;                 // ⚠ 本文件自己要有：pattern.js 里的 TAU 不在这个作用域（踩过：漏了它 → 流体幕整幕画布抛异常）
  const F = MTK.fx = {};

  /* 硬阴影随落定"长出来"（0 → dist），颜色是孟菲斯彩而不是纯黑（"轻一点"） */
  F.hardShadow = function (node, k, tone, dist) {
    const d = (dist == null ? 6 : dist) * OM.ease.expoOut(clamp(k, 0, 1));
    node.style.boxShadow = `${d.toFixed(2)}px ${d.toFixed(2)}px 0 0 ${tone || 'var(--m-mag)'}`;
  };

  /* 斜刀擦除：clip-path inset（只动 clip-path，R-19） */
  F.wipeIn = function (node, k, dir) {
    const e = clamp(k, 0, 1);
    const inset = dir === 'left' ? `0 0 0 ${(100 - e * 100).toFixed(2)}%`
      : dir === 'up' ? `0 0 ${(100 - e * 100).toFixed(2)}% 0`
        : `0 ${(100 - e * 100).toFixed(2)}% 0 0`;
    node.style.clipPath = `inset(${inset})`;
  };

  /* 落定：一次极轻的过冲（Emil：不过冲 = 没落定；过冲过头 = 顽皮） */
  F.settle = function (t, t0, { dur = 0.36, over = 0.035 } = {}) {
    const k = clamp((t - t0) / dur, 0, 1);
    const e = OM.ease.expoOut(k);
    const bump = Math.sin(k * Math.PI) * over;
    return { k, s: 1 + bump, dy: (1 - e) * 22 };
  };

  /* 按压：chip 被按下又弹回（Emil 的按钮纪律；有"手"的时候才用） */
  F.pressChip = function (node, t, t0, { depth = 0.06 } = {}) {
    const p = OM.press(t, t0, { depth, decay: 11, omega: 30, flash: 0.35 });
    node.style.transform = `translateY(${(p.sq * 6).toFixed(2)}px) scale(${(1 - p.sq * depth * 4).toFixed(4)})`;
    return p;
  };

  /* 波浪场：确定性波浪线（第 8 段"流体"）。
     ⚠ **不要用"位移取模"来滚动**：`% 120` 每绕回一次就跳一下（用户实测看出"走完重放的跳变"）。
     正弦本身是周期的 → 用**相位**滑动，永远无缝；散点的取模范围要**整段放在画外**，
     这样回绕发生在看不见的地方（而不是屏幕中间）。 */
  F.drawField = function (ctx, t, o) {
    const { w, h } = o;
    ctx.clearRect(0, 0, w, h);
    const cols = o.ink || '#0a0a0a';
    const v = (o.drift == null ? 26 : o.drift) * t;         // 已累积的位移（px）
    const rows = o.rows || 6;
    const lambda = o.lambda || 260;
    for (let i = 0; i < rows; i++) {
      const y = o.y0 + i * ((o.y1 - o.y0) / (rows - 1));
      const phase = i * 0.7 - (TAU * v * (1 + i * 0.07)) / lambda;
      P.wave(ctx, -60, y, w + 200, o.amp || 14, lambda, cols, o.lw || 2, phase);
    }
    if (o.dots) {
      const span = w + 500, off = -250;                      // 回绕点 -250 / w+250：都在画外
      for (const d of o.dots) {
        const x = off + (((d.x - off) + v * d.sp) % span);
        P.dot(ctx, x, d.y, d.r, d.c);
      }
    }
  };

  /* 弹簧跟随点（纯 f(t)，不用预积分 sim）：目标由 hand(t) 给 */
  F.followDot = function (t, t0, hand, { zeta = 0.7, omega = 12 } = {}) {
    const dest = hand(t);
    const k = OM.spring(clamp(t - t0, 0, 4), zeta, omega);
    return { x: lerp(hand(t0).x, dest.x, k), y: lerp(hand(t0).y, dest.y, k), k };
  };

  /* 条纹分隔条：真字符，零素材（母题 M-02） */
  F.slashStrip = function (node, t, t0, { speed = 0.35 } = {}) {
    const k = clamp((t - t0) / 0.5, 0, 1);
    node.style.clipPath = `inset(0 ${(100 - k * 100).toFixed(2)}% 0 0)`;
    node.style.transform = `translateX(${(-(t * speed * 40) % 40).toFixed(1)}px)`;
  };
})(typeof window !== 'undefined' ? window : globalThis);
