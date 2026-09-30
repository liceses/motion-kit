/* modules/motion/lib/rng.js — 可复现伪随机（MTK.rng）
 * 渲染路径**禁止** Math.random()：同一个 t 两次必须得到同一帧（快门积分靠它）。
 * 这里只在"初始化时算一次、之后不变"的地方用（例如装饰的初始相位）。
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};
  MTK.rng = function rng(seed = 1) {
    let s = (seed >>> 0) || 1;
    const f = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    f.int = (a, b) => Math.floor(a + f() * (b - a + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.range = (a, b) => a + f() * (b - a);
    return f;
  };
})(typeof window !== 'undefined' ? window : globalThis);
