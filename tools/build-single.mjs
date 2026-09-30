#!/usr/bin/env node
/* modules/motion/tools/build-single.mjs — 把一支片子打成**一个自包含 index.html**（双击即播）
 *
 *   node modules/motion/tools/build-single.mjs --comp work/<期号>/film/comp.html \
 *        --audio work/<期号>/film/audio/score.wav --out work/<期号>/dist/index.html
 *   --no-audio   先看画面（更小）
 *
 * 做什么：
 *   1. 把 comp.html 里每个 `<script src="X">` 换成内联（**保持顺序**；X 可以是 ../lib/… 这种包内相对路径）
 *   2. 把 JS/CSS/HTML 里出现的素材路径（含 `<包根>/assets/x.png`）换成 base64 data URI
 *   3. 音轨 wav → mp3 192k（ffmpeg）内联，注入 `window.MTK_AUDIO_SRC`
 *      （shell.js 只在 play() 时动它；__seek 里绝不启音频 —— 无头没有用户手势）
 *   4. 写 OUT，打印体积明细，并**自检零外部请求**
 *
 * 约束：不许外部请求 / 不许 ES module / file:// 直接跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);

const COMP = path.resolve(arg('--comp', 'film/comp.html'));
const OUT = path.resolve(arg('--out', path.join(path.dirname(path.dirname(COMP)), 'dist', 'index.html')));
const AUDIO_IN = flag('--no-audio') ? null : path.resolve(arg('--audio', path.join(path.dirname(COMP), 'audio', 'score.wav')));
const FFMPEG = arg('--ffmpeg', 'D:\\applications\\ffmpeg\\bin\\ffmpeg.exe');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const b64 = (p, mime) => `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const mb = (n) => (n / 1048576).toFixed(2) + ' MB';

if (!fs.existsSync(COMP)) { console.error('找不到 comp:', COMP); process.exit(1); }
let html = fs.readFileSync(COMP, 'utf8');
const report = [];

/* ── 1 · 内联 <script src>（顺序不变）────────────────────────────────────── */
let inlined = 0;
html = html.replace(/<script\s+src=["']([^"']+)["']\s*><\/script>/g, (m, src) => {
  const p = path.resolve(path.dirname(COMP), src);
  if (!fs.existsSync(p)) { console.error(`  ! 缺文件，保留外链：${src}`); return m; }
  const code = fs.readFileSync(p, 'utf8');
  inlined++;
  report.push([`  js  ${src}`, code.length]);
  return `<script data-inlined="${src}">\n${code.replace(/<\/script>/gi, '<\\/script>')}\n</script>`;
});

/* ── 2 · 素材 → data URI（含跨目录的 assets/… 路径）──────────────────────── */
const assetRe = /(["'(])((?:\.\.\/|\.\/)*[A-Za-z0-9_\-.]*(?:\/assets\/)[A-Za-z0-9_\-./]+\.(?:png|jpg|jpeg|webp|gif|svg))\1/g;
const seen = new Map();
html = html.replace(assetRe, (m, q1, rel) => {
  const p = path.resolve(path.dirname(COMP), rel);
  if (!fs.existsSync(p)) { console.error(`  ! 素材缺失：${rel}`); return m; }
  if (!seen.has(p)) { seen.set(p, b64(p, MIME[path.extname(p).toLowerCase()] || 'application/octet-stream')); report.push([`  img ${rel}`, fs.statSync(p).size]); }
  return q1 + seen.get(p) + q1;
});

/* ── 2b · 拼路径的素材（**0929 的教训**）───────────────────────────────────
   comp 里常写成 `PLATES + 'plate-ground.png'`，字面量替换抓不到。
   做法：把素材目录全表塞进一张 **basename → data URI** 的表，并把 Image.src 的 setter
   改成"先查表"。这样模块一行都不用改，双击单文件也能拿到全部图版。
   顺带压缩：**没有 alpha 通道的 PNG 转 JPEG q92**（扁平插画几乎无感，体积掉到 1/4）。 */
const ASSET_DIRS = [];
for (let i = 0; i < argv.length; i++) if (argv[i] === '--assets' && argv[i + 1]) ASSET_DIRS.push(path.resolve(argv[i + 1]));
if (!ASSET_DIRS.length) {
  /* 包内布局：素材在 <包根>/assets（原仓库里在 modules/motion/assets）；
     comp 约定放在 <包根>/<片子>/comp.html，所以包根 = COMP 的上一级。
     只收**存在**的目录 —— 本包不含图版（Qwen 许可），不存在就跳过，不要报错。 */
  const pkgRoot = path.resolve(path.dirname(COMP), '..');
  for (const rel of ['assets', 'assets/plates', 'assets/sfx', 'assets/music']) {
    const d = path.join(pkgRoot, rel);
    if (fs.existsSync(d)) ASSET_DIRS.push(d);
  }
  if (!ASSET_DIRS.length) console.warn('⚠ 没找到任何素材目录；用 --assets <dir> 指定，或忽略（片子可无素材）');
}
const pngHasAlpha = (p) => {
  try { const b = fs.readFileSync(p); return b.readUInt32BE(0) === 0x89504e47 && (b[25] === 6 || b[25] === 4); }
  catch (e) { return true; }
};
const assetMap = {};
let nAssets = 0, nJpeg = 0, rawBytes = 0;
const tmpJpeg = path.join(path.dirname(OUT), '_asset.jpg');
for (const dir of ASSET_DIRS) {
  if (!fs.existsSync(dir)) continue;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile()) continue;
    const p = path.join(dir, e.name);
    const ext = path.extname(p).toLowerCase();
    if (!MIME[ext] || ext === '.wav') continue;
    rawBytes += fs.statSync(p).size;
    let uri, used = e.name;
    if (ext === '.png' && !pngHasAlpha(p) && FFMPEG && fs.existsSync(FFMPEG)) {
      try {
        fs.mkdirSync(path.dirname(tmpJpeg), { recursive: true });
        execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', p, '-q:v', '3', tmpJpeg], { stdio: 'ignore' });
        uri = b64(tmpJpeg, 'image/jpeg'); used = e.name.replace(/\.png$/, '.jpg'); nJpeg++;
        report.push([`  img ${e.name} → jpg q92`, fs.statSync(tmpJpeg).size]);
      } catch (err) { uri = b64(p, MIME[ext]); }
    } else {
      uri = b64(p, MIME[ext]);
      report.push([`  img ${e.name}`, fs.statSync(p).size]);
    }
    assetMap[e.name] = uri;                    // 按原名
    if (used !== e.name) assetMap[used] = uri; // 也按转过的名字
    nAssets++;
  }
}
if (fs.existsSync(tmpJpeg)) fs.unlinkSync(tmpJpeg);
const assetShim = nAssets ? ('<script>(function(){var M=' + JSON.stringify(assetMap) + ';window.MTK_ASSETS=M;' +
  "try{var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');" +
  "Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,get:d.get," +
  "set:function(v){d.set.call(this,(typeof v==='string'&&(M[v]||M[v.split('/').pop()]))||v);}});}catch(e){}})();<\/script>\n") : '';

/* ── 3 · 音轨 → mp3 data URI ─────────────────────────────────────────────── */
let audioTag = '';
let audioNote = '(无音轨)';
if (AUDIO_IN && fs.existsSync(AUDIO_IN)) {
  const tmp = path.join(path.dirname(OUT), '_score.mp3');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  try {
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', AUDIO_IN, '-c:a', 'libmp3lame', '-b:a', '192k', tmp], { stdio: 'inherit' });
    report.push([`  aud ${path.basename(AUDIO_IN)} → mp3 192k`, fs.statSync(tmp).size]);
    audioTag = `<script>window.MTK_AUDIO_SRC = ${JSON.stringify(b64(tmp, 'audio/mpeg'))};<\/script>\n`;
    audioNote = `${mb(fs.statSync(tmp).size)} mp3（内联）`;
    fs.unlinkSync(tmp);
  } catch (e) { audioNote = `(ffmpeg 失败：${e.message} —— 成片仍可看，静音)`; }
} else if (AUDIO_IN) { audioNote = `(跳过：找不到 ${AUDIO_IN})`; }

/* 素材表 + 音轨标记排在所有脚本之前（shell 在 boot 时要读到） */
const inject = assetShim + audioTag;
if (inject) {
  const first = html.search(/<script\b/);
  html = first > 0 ? html.slice(0, first) + inject + html.slice(first) : html.replace('<body>', '<body>\n' + inject);
}

/* ── 4 · 落盘 + 自检 ────────────────────────────────────────────────────── */
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html);
const total = Buffer.byteLength(html);
const external = (html.match(/https?:\/\/[^"')\s]+/g) || []).filter((u) => !u.startsWith('http://www.w3.org'));
console.log(`\n内联 ${inlined} 个脚本 · 字面量素材 ${seen.size} 张 · 音轨 ${audioNote}`);
for (const [what, n] of report) console.log(what.padEnd(56), kb(n).padStart(12));
console.log('─'.repeat(70));
console.log(`自包含单文件 → ${OUT}`);
console.log(`体积 ${mb(total)} · 双击即播 · 无 CDN / 无构建`);
if (external.length) { console.error(`✗ 仍存在外部请求（${external.length} 条）：` + external.slice(0, 3).join(', ')); process.exit(1); }
console.log('零外部请求 ✓（http(s) 引用 0 条）');
