/* modules/motion/lib/timeline.js — 节拍表（MTK.timeline）
 * 片子内容**唯一的事实源**：谁在什么时候出现、角标写什么、哪一段是静止、音效打在哪。
 * 结构（acts / beats / stills）跨期复用；数字每期重填。
 *
 * 本期：0929-memphis-motion · 54s · 12 段 · 主线 = C2「一条 3px 线切开又装回」
 * 角标规则：每段**首帧**上一次，退场随该段主元素（不做独立淡出）；带档案号（母题 M-03 变体）。
 */
(function (root) {
  'use strict';
  const MTK = root.MTK = root.MTK || {};

  MTK.timeline = {
    dur: 54.0,
    fps: 30,
    w: 1920,
    h: 1080,
    title: '动效组件库 · 孟菲斯 × 新野兽派',
    concept: 'C2 —— 全片只有那条 3px 线在动，而它同时就是每个组件的描边',

    /* 12 段。badge = 该段首帧的角标（en 用 mono、zh 用中文、no 是档案号） */
    acts: [
      { id: 'hook', t0: 0.00, t1: 2.60, badge: { en: 'MOTION KIT', zh: '动效组件库', no: '#mk-0001/12' } },
      { id: 'card', t0: 2.60, t1: 9.20, badge: { en: 'card', zh: '卡', no: '#mk-0002/12' } },
      { id: 'stat', t0: 9.20, t1: 12.40, badge: { en: 'stat', zh: '大数字', no: '#mk-0003/12' } },
      { id: 'table', t0: 12.40, t1: 18.60, badge: { en: 'compare-table', zh: '对照表', no: '#mk-0004/12' } },
      { id: 'quote', t0: 18.60, t1: 23.00, badge: { en: 'quote · evidence', zh: '引述 · 证据框', no: '#mk-0005/12' } },
      { id: 'touch', t0: 23.00, t1: 26.20, badge: { en: 'stamp', zh: '印章', no: '#mk-0006/12' } },
      { id: 'camera', t0: 26.20, t1: 33.40, badge: { en: 'camera', zh: '相机', no: '#mk-0007/12' } },
      { id: 'fluid', t0: 33.40, t1: 36.90, badge: { en: 'fluid', zh: '流体', no: '#mk-0008/12' } },
      { id: 'rhythm', t0: 36.90, t1: 43.90, badge: { en: 'rhythm', zh: '节奏', no: '#mk-0009/12' } },
      { id: 'hold', t0: 43.90, t1: 46.40, badge: null },                       /* 真静止：不上角标 */
      { id: 'index', t0: 46.40, t1: 50.20, badge: { en: 'components', zh: '组件总表', no: '#mk-0011/12' } },
      { id: 'end', t0: 50.20, t1: 54.00, badge: { en: 'lockup · seal', zh: '字标 · 印章', no: '#mk-0012/12' } },
    ],

    /* 真静止窗口：画面完全不动（render.py 跳过快门、音轨在这里留洞） */
    stills: [[43.90, 46.40]],

    /* 音轨卡点。kind 给合成器：kick | metal | tick | riser | crush
     * 纪律：事件数 < 节拍数；一套材料、一个房间。 */
    beats: [
      { t: 0.00, name: 'line-in', kind: 'riser' },
      { t: 0.62, name: 'dot-land', kind: 'kick' },
      { t: 2.60, name: 'card-in', kind: 'kick' },
      { t: 3.10, name: 'word-1', kind: 'tick' },
      { t: 3.42, name: 'word-2', kind: 'tick' },
      { t: 4.10, name: 'word-3', kind: 'tick' },
      { t: 5.35, name: 'type-start', kind: 'tick' },
      { t: 8.40, name: 'card-settle', kind: 'metal' },
      { t: 9.20, name: 'stat-in', kind: 'kick' },
      { t: 10.30, name: 'count-done', kind: 'tick' },
      { t: 12.40, name: 'table-in', kind: 'kick' },
      { t: 12.95, name: 'row-1', kind: 'metal' },
      { t: 13.17, name: 'row-2', kind: 'metal' },
      { t: 13.39, name: 'row-3', kind: 'metal' },
      { t: 13.61, name: 'row-4', kind: 'metal' },
      { t: 16.60, name: 'table-read', kind: 'tick' },
      { t: 18.60, name: 'morph-in', kind: 'kick' },
      { t: 20.40, name: 'quote-in', kind: 'tick' },
      { t: 23.00, name: 'hit-1', kind: 'crush' },
      { t: 23.28, name: 'hit-2', kind: 'metal' },
      { t: 23.56, name: 'hit-3', kind: 'metal' },
      { t: 23.84, name: 'hit-4', kind: 'crush' },
      { t: 25.30, name: 'touch-tail', kind: 'tick' },
      { t: 26.20, name: 'camera-in', kind: 'kick' },
      { t: 30.90, name: 'camera-hover', kind: 'tick' },
      { t: 33.40, name: 'fluid-in', kind: 'kick' },
      { t: 35.20, name: 'fluid-wave', kind: 'tick' },
      { t: 36.90, name: 'rhythm-in', kind: 'kick' },
      { t: 38.10, name: 'uniform-plays', kind: 'tick' },
      { t: 39.40, name: 'settle-plays', kind: 'metal' },
      { t: 41.20, name: 'merge', kind: 'crush' },
      { t: 43.90, name: 'hold', kind: 'riser' },
      { t: 46.40, name: 'index-in', kind: 'kick' },
      { t: 47.60, name: 'index-rows', kind: 'metal' },
      { t: 50.20, name: 'lockup', kind: 'metal' },
      { t: 52.10, name: 'seal', kind: 'crush' },
      { t: 53.40, name: 'tick-out', kind: 'tick' },
    ],

    /* 第 9 段「改造前后」的内部时刻（全片唯一的论点段） */
    rhythmCues: { playUniform: 38.10, playSettle: 38.10, uniformFail: 39.90, mergeStart: 40.60, mergeDone: 41.60, restStart: 42.50 },

    /* 相机关键帧 {t, x, y, zoom, rot}（x/y 是**画幅中心对准的世界点**） */
    cameraKeys: [
      { t: 0.00, x: 960, y: 540, zoom: 1.00 },
      { t: 2.60, x: 960, y: 540, zoom: 1.00 },
      { t: 9.20, x: 900, y: 520, zoom: 1.05 },
      { t: 12.40, x: 960, y: 540, zoom: 1.00 },
      { t: 18.60, x: 880, y: 500, zoom: 1.10 },
      { t: 23.00, x: 960, y: 560, zoom: 1.16 },
      { t: 26.20, x: 960, y: 540, zoom: 1.00 },
      { t: 30.90, x: 960, y: 470, zoom: 1.25 },
      { t: 33.40, x: 960, y: 540, zoom: 1.02 },
      { t: 36.90, x: 960, y: 540, zoom: 1.00 },
      { t: 43.90, x: 960, y: 540, zoom: 1.06 },
      { t: 50.20, x: 960, y: 540, zoom: 1.00 },
      { t: 54.00, x: 960, y: 540, zoom: 1.00 },
    ],

    /* 抖动：只在"打中"的那几帧（amp 单位 px，作用在整幅上，幅度小） */
    shakes: [
      { t: 0.62, amp: 14, decay: 11 },
      { t: 12.40, amp: 10, decay: 12 },
      { t: 23.00, amp: 16, decay: 10 },
      { t: 23.84, amp: 12, decay: 11 },
      { t: 41.20, amp: 9, decay: 12 },
      { t: 46.40, amp: 11, decay: 12 },
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
