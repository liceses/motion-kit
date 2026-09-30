#!/usr/bin/env node
/* modules/motion/tools/tokens-from-css.mjs
 * ---------------------------------------------------------------------------
 * 单向生成器：CSS（唯一真相） → JS / look.json（派生件）
 *
 *   读  styles/brutal.css          ← 野兽派令牌（唯一真相）
 *       styles/skins/memphis-brut.css  ← 第 5 套皮肤：孟菲斯 × 新野兽派（"轻一点"）
 *   写  modules/motion/style/tokens.js            → window.MTK（comp 用）
 *       modules/motion/look/memphis-brut.look.json → onetake 的 8 令牌 + 3 字面
 *
 * 为什么是单向：本仓库被"同一份东西写两处"坑过（approve.mjs 与 render.mjs 各算一遍摘要，
 * 画面章被假拦）。颜色只许在 CSS 里定义，JS 与 look.json 都是算出来的。
 *
 * 用法：
 *   node modules/motion/tools/tokens-from-css.mjs            # 生成
 *   node modules/motion/tools/tokens-from-css.mjs --check    # 只比对，不写（开发用；不是门禁）
 *
 * 生成器自带的断言（不是门禁）：声明为"承载文字"的配对若低于 AA 底线 4.5:1，直接抛错 ——
 * 因为那说明令牌表被改坏了，而不是"跑一下检查"。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');   // 仓库根
const CSS_IN = [
  path.join(ROOT, 'styles', 'brutal.css'),
  path.join(ROOT, 'styles', 'skins', 'memphis-brut.css'),
];
const OUT_TOKENS = path.join(ROOT, 'modules', 'motion', 'style', 'tokens.js');
const OUT_LOOK = path.join(ROOT, 'modules', 'motion', 'look', 'memphis-brut.look.json');

/* ── 1 · 解析 :root 块（后者覆盖前者）─────────────────────────────────── */
function parseRootVars(css) {
  const out = {};
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocks = noComments.matchAll(/:root\s*\{([\s\S]*?)\}/g);
  for (const [, body] of blocks) {
    for (const decl of body.split(';')) {
      const m = decl.match(/^\s*(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+?)\s*$/);
      if (m) out[m[1]] = m[2].trim();
    }
  }
  return out;
}

const vars = {};
const inputHashes = {};
for (const f of CSS_IN) {
  const css = fs.readFileSync(f, 'utf8');
  Object.assign(vars, parseRootVars(css));
  inputHashes[path.relative(ROOT, f).replace(/\\/g, '/')] =
    crypto.createHash('sha256').update(css).digest('hex').slice(0, 16);
}

/* ── 2 · 解析 var() 引用（最多 6 层）───────────────────────────────────── */
function resolve(value, depth = 0) {
  if (depth > 6 || typeof value !== 'string') return value;
  return value.replace(/var\((--[A-Za-z0-9_-]+)\)/g, (_, name) => {
    if (!(name in vars)) throw new Error(`令牌 ${name} 未定义（CSS 里少了一个定义）`);
    return resolve(vars[name], depth + 1);
  }).trim();
}
const V = (name) => {
  if (!(name in vars)) throw new Error(`缺少令牌 ${name} —— 检查 styles/skins/memphis-brut.css`);
  return resolve(vars[name]);
};

/* ── 3 · 对比度（WCAG 相对亮度；颜色必须实算，不许目测 —— 动效研究 R-12）── */
function srgbToLin(c) { const s = c / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }
function luminance(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
}
const ratio = (fg, bg) => {
  const a = luminance(fg), b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
};

/* ── 4 · 取令牌 ───────────────────────────────────────────────────────── */
const color = {
  ground: V('--m-ground'),
  deep: V('--m-ground-deep'),
  card: V('--m-paper'),
  line: V('--m-ink'),
  mute: V('--m-mute'),
  ink: V('--m-ink'),
  accent: V('--m-mag-deep'),
  accent2: V('--m-cyan'),
};
/* look 之外的孟菲斯彩（只进 tokens.js；look.json 只有 8 个位置） */
const extraColor = {
  mag: V('--m-mag'),
  magDeep: V('--m-mag-deep'),
  acid: V('--m-acid'),
  cyan: V('--m-cyan'),
  orange: V('--m-orange'),
  inkSoft: V('--m-ink-soft'),
  onInkDim: V('--m-on-ink-dim'),
  onMag: V('--m-on-mag'),
  onMagDim: V('--m-on-mag-dim'),
};
const type = {
  hero: V('--m-f-hero'), h1: V('--m-f-h1'), h2: V('--m-f-h2'), h3: V('--m-f-h3'),
  body: V('--m-f-body'), num: V('--m-f-num'), label: V('--m-f-label'),
};
const geo = {
  bw: V('--m-bw'), bwLg: V('--m-bw-lg'), bwSm: V('--m-bw-sm'),
  shadow: V('--m-shadow'), shadowSm: V('--m-shadow-sm'),
  shadowMag: V('--m-shadow-mag'), shadowCyan: V('--m-shadow-cyan'),
  shadowOrange: V('--m-shadow-orange'), shadowAcid: V('--m-shadow-acid'),
  radius: V('--m-radius'), decoZ: V('--m-deco-z'), edge: V('--m-edge'), capY: V('--m-cap-y'),
};
const motion = {
  easeOut: V('--m-ease-out'), easeInOut: V('--m-ease-inout'), easeSnap: V('--m-ease-snap'),
  durMicro: V('--m-dur-micro'), durBase: V('--m-dur-base'), durReveal: V('--m-dur-reveal'),
  staggerChar: V('--m-stagger-char'), staggerBlock: V('--m-stagger-block'),
};

/* ── 5 · 对比度表：声明为"承载文字"的配对必须实算并达标 ────────────────── */
const PAIRS = [
  ['body',   color.ink,   color.ground, 4.5, '正文：墨 on 米白'],
  ['body',   color.ink,   color.card,   4.5, '正文：墨 on 白卡'],
  ['body',   color.ink,   extraColor.acid,   4.5, '正文：墨 on 酸绿面'],
  ['body',   color.ink,   extraColor.cyan,   4.5, '正文：墨 on 青面'],
  ['body',   color.ink,   extraColor.orange, 4.5, '正文：墨 on 橙面'],
  ['body',   extraColor.onMag, color.accent, 4.5, '正文：白字 on 深品红'],
  ['label',  color.mute,  color.ground, 4.5, '标签：弱化 on 米白'],
  ['label',  extraColor.inkSoft, color.ground, 4.5, '标签：墨软 on 米白'],
  ['label',  extraColor.onInkDim, color.ink, 4.5, '标签：弱化 on 墨'],
  ['large',  extraColor.onMagDim, color.accent, 3.0, '大字：品红浅 on 深品红（≥28px）'],
  ['decor',  V('--m-mag'), color.ground, 0, '装饰色 on 米白（**只做装饰**，不承载文字）'],
  ['decor',  extraColor.acid, color.ground, 0, '装饰色 on 米白（只做装饰）'],
  ['decor',  extraColor.cyan, color.ground, 0, '装饰色 on 米白（只做装饰）'],
  ['decor',  extraColor.orange, color.ground, 0, '装饰色 on 米白（只做装饰）'],
];
const contrast = {};
const lines = [];
for (const [role, fg, bg, floor, note] of PAIRS) {
  const r = ratio(fg, bg);
  contrast[`${fg}_on_${bg}`] = r;
  lines.push([role, `${fg} on ${bg}`, r.toFixed(2), floor ? floor.toFixed(1) : '—', floor && r < floor ? 'FAIL' : 'ok', note]);
}
const failures = lines.filter((l) => l[4] === 'FAIL');
if (failures.length) {
  console.error('✗ 令牌表被改坏了：以下"承载文字"的配对低于门槛');
  for (const f of failures) console.error(`   ${f[1]}  ${f[2]}:1 < ${f[3]}:1  (${f[5]})`);
  process.exit(1);
}

/* ── 6 · tokens.js ────────────────────────────────────────────────────── */
const tokensJs = `/* modules/motion/style/tokens.js —— **派生件，不要手改**
 * 由 modules/motion/tools/tokens-from-css.mjs 生成：
 *   styles/brutal.css + styles/skins/memphis-brut.css  →  这里
 * 改颜色/描边/曲线：改那两份 CSS，然后重跑生成器（npm run motion:tokens）。
 * 输入指纹：${JSON.stringify(inputHashes)}
 *
 * classic script（file:// 下不能用 module）：<script src="tokens.js"></script> → window.MTK
 */
(function (root) {
  'use strict';
  root.MTK = {
    /* 颜色：look 的 8 个位置（onetake look 契约） */
    color: ${JSON.stringify(color, null, 2).replace(/\n/g, '\n    ')},
    /* 孟菲斯彩：超出 look 的 8 个位置，只在 comp 里用（装饰色永不承载文字） */
    extra: ${JSON.stringify(extraColor, null, 2).replace(/\n/g, '\n    ')},
    type: ${JSON.stringify(type, null, 2).replace(/\n/g, '\n    ')},
    geo: ${JSON.stringify(geo, null, 2).replace(/\n/g, '\n    ')},
    motion: ${JSON.stringify(motion, null, 2).replace(/\n/g, '\n    ')},
    /* 实算对比度（WCAG 相对亮度）；floor 是这条配对要求的下限 */
    contrast: ${JSON.stringify(contrast, null, 2).replace(/\n/g, '\n    ')},
    inputsSha256: ${JSON.stringify(inputHashes, null, 2).replace(/\n/g, '\n    ')},
  };
})(typeof window !== 'undefined' ? window : globalThis);
`;

/* ── 7 · look.json（onetake 的 schema：8 令牌 + 3 字面）────────────────── */
const look = {
  from: 'modules/motion/style + styles/skins/memphis-brut.css（本片自建，非既有预设）',
  mood: '米白纸面、纯黑轻描边（3px）、彩色硬阴影（6px）、孟菲斯几何只在边缘 —— 印刷品而不是界面',
  color,
  type: {
    display: { face: 'Archivo', weight: 800, tracking: -0.02 },
    text: { face: 'Instrument Sans', weight: 500, tracking: -0.005 },
    mono: { face: 'Geist Mono', weight: 500, tracking: 0.02 },
  },
};

/* ── 8 · 落盘（--check 只比对）────────────────────────────────────────── */
const check = process.argv.includes('--check');
const outputs = [
  [OUT_TOKENS, tokensJs],
  [OUT_LOOK, JSON.stringify(look, null, 2) + '\n'],
];
let drift = 0;
for (const [file, content] of outputs) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (check) {
    if (old !== content) { console.log(`≠ ${rel}`); drift++; } else { console.log(`= ${rel}`); }
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`${old === null ? '＋' : old === content ? '=' : '↑'} ${rel}`);
}

/* ── 9 · 打印对比度表（STYLE.md 复述同一张表）────────────────────────── */
const w = (s, n) => String(s).padEnd(n);
console.log('\n对比度（实算 · WCAG 相对亮度）');
console.log(w('角色', 8) + w('配对', 46) + w('实测', 8) + w('下限', 6) + '结论');
for (const [role, pair, r, floor, ok] of lines) {
  console.log(w(role, 8) + w(pair, 46) + w(r + ':1', 8) + w(floor, 6) + ok);
}
if (check && drift) { console.log(`\n✗ ${drift} 个派生件与 CSS 不同步（跑一次不带 --check 的生成即可）`); process.exit(1); }
console.log(`\nok · 令牌源 = ${CSS_IN.map((f) => path.relative(ROOT, f).replace(/\\/g, '/')).join(' + ')}`);
