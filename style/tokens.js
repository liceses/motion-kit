/* modules/motion/style/tokens.js —— **派生件，不要手改**
 * 由 modules/motion/tools/tokens-from-css.mjs 生成：
 *   styles/brutal.css + styles/skins/memphis-brut.css  →  这里
 * 改颜色/描边/曲线：改那两份 CSS，然后重跑生成器（npm run motion:tokens）。
 * 输入指纹：{"styles/brutal.css":"d784277823823f75","styles/skins/memphis-brut.css":"173578d1d29b46c8"}
 *
 * classic script（file:// 下不能用 module）：<script src="tokens.js"></script> → window.MTK
 */
(function (root) {
  'use strict';
  root.MTK = {
    /* 颜色：look 的 8 个位置（onetake look 契约） */
    color: {
      "ground": "#f7f4ec",
      "deep": "#eae5da",
      "card": "#ffffff",
      "line": "#0a0a0a",
      "mute": "#6b665c",
      "ink": "#0a0a0a",
      "accent": "#c20056",
      "accent2": "#00d9ff"
    },
    /* 孟菲斯彩：超出 look 的 8 个位置，只在 comp 里用（装饰色永不承载文字） */
    extra: {
      "mag": "#ff006e",
      "magDeep": "#c20056",
      "acid": "#ccff00",
      "cyan": "#00d9ff",
      "orange": "#ff9500",
      "inkSoft": "#3d3d3d",
      "onInkDim": "#b0b0b0",
      "onMag": "#ffffff",
      "onMagDim": "#ffd6e6"
    },
    type: {
      "hero": "168px",
      "h1": "68px",
      "h2": "44px",
      "h3": "31px",
      "body": "26px",
      "num": "56px",
      "label": "20px"
    },
    geo: {
      "bw": "3px",
      "bwLg": "4px",
      "bwSm": "2px",
      "shadow": "6px 6px 0 0 #0a0a0a",
      "shadowSm": "4px 4px 0 0 #0a0a0a",
      "shadowMag": "6px 6px 0 0 #ff006e",
      "shadowCyan": "6px 6px 0 0 #00d9ff",
      "shadowOrange": "6px 6px 0 0 #ff9500",
      "shadowAcid": "6px 6px 0 0 #ccff00",
      "radius": "0px",
      "decoZ": "0",
      "edge": "120px",
      "capY": "848px"
    },
    motion: {
      "easeOut": "cubic-bezier(.23, 1, .32, 1)",
      "easeInOut": "cubic-bezier(.77, 0, .175, 1)",
      "easeSnap": "cubic-bezier(.16, 1, .3, 1)",
      "durMicro": "140ms",
      "durBase": "300ms",
      "durReveal": "700ms",
      "staggerChar": "30ms",
      "staggerBlock": "70ms"
    },
    /* 实算对比度（WCAG 相对亮度）；floor 是这条配对要求的下限 */
    contrast: {
      "#0a0a0a_on_#f7f4ec": 18.01,
      "#0a0a0a_on_#ffffff": 19.8,
      "#0a0a0a_on_#ccff00": 16.85,
      "#0a0a0a_on_#00d9ff": 11.66,
      "#0a0a0a_on_#ff9500": 9,
      "#ffffff_on_#c20056": 6.13,
      "#6b665c_on_#f7f4ec": 5.19,
      "#3d3d3d_on_#f7f4ec": 9.88,
      "#b0b0b0_on_#0a0a0a": 9.13,
      "#ffd6e6_on_#c20056": 4.67,
      "#ff006e_on_#f7f4ec": 3.49,
      "#ccff00_on_#f7f4ec": 1.07,
      "#00d9ff_on_#f7f4ec": 1.54,
      "#ff9500_on_#f7f4ec": 2
    },
    inputsSha256: {
      "styles/brutal.css": "d784277823823f75",
      "styles/skins/memphis-brut.css": "173578d1d29b46c8"
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
