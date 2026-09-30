#!/usr/bin/env node
/* modules/motion/lib/score.mjs — 音轨混音器（零依赖 Node，可重跑）
 * ---------------------------------------------------------------------------
 * **这一版照参考片的结构来**。用 modules/motion/tools/analyze_score.py 把四支已通过的片子拆开量：
 *
 *   参考                密度/s   低/中/高占比        LRA    静音窗
 *   ① onetake 展示片     5.43   0.51/0.29/0.20      4.9    0.078
 *   ② 0929 冰面暴击      4.53   0.30/0.63/0.08      4.1    0.181
 *   ③ 0929-dsh-desktop  4.52   0.29/0.68/0.04      3.8    0.010
 *   ④ 0929-dsh          5.16   0.46/0.51/0.03      6.7    0.000
 *   ─────────────────────────────────────────────────────────────
 *   我第一版             2.96   0.32/0.38/0.30      8.9    0.369   ← 反面教材
 *
 * 结论（这才是"别人怎么配"）：**它们都有一条持续的音乐床**（密度 4.5–5.2/s 来自音乐本身），
 * 音效只落在关键几处；而"静音窗 0.369"说明我的轨在每个幕边界都断了 —— 听起来就是一条不停断的敲击清单。
 *
 * 所以现在的分工：
 *   · **音乐床**：一支完整曲目（`assets/music/` 里的 CC0 曲，`fetch-music.mjs` 取、`analyze_score.py` 挑）
 *   · **音效**：库里素材，只在关键处落（whoosh / impact / metal / crush / riser / sub），不做节奏循环
 *   · **侧链**：每次重击把音乐压下去（音乐让路、重锤落在洞里）
 *   · **两段安静**：桥段（33.4–38.9）与真静止（43.9–46.4）—— 既要像唱片，也要过 verify 的 quiet_ratio
 *   · **母带**：先按响度归一 → 最后限制（目标 −16 LUFS / 真峰 ≤ −3.5 dBTP / LRA 4–6）
 *
 * 用法：
 *   node modules/motion/lib/score.mjs --events <events.json> --out <score.wav> [--dur 54] \
 *        [--music modules/motion/assets/music/electro-funk-3.mp3] [--music-start 0.62] [--trim-db 0]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EV = path.resolve(argOf('--events', 'work/0929-memphis-motion/film/audio/events.json'));
const OUT = path.resolve(argOf('--out', 'work/0929-memphis-motion/film/audio/score.wav'));
const MUSIC = path.resolve(argOf('--music', path.join(ROOT, 'modules/motion/assets/music/electro-funk-1.mp3')));
const MUSIC_START_ARG = argOf('--music-start', null);            // 不给就用片体声明的计划
const MUSIC_GAIN = parseFloat(argOf('--music-gain', '1'));
const SFX_GAIN = parseFloat(argOf('--sfx-gain', '1'));
const TRIM = parseFloat(argOf('--trim-db', '0'));
const DUCK_SCALE = parseFloat(argOf('--duck-scale', '1'));      // 侧链深浅（扫描用）
const STILL_OUT_ARG = argOf('--still-out', null);               // 不给就用片体声明的真静止段
const LIB = path.join(ROOT, 'modules/motion/assets');
const FFMPEG = argOf('--ffmpeg', 'D:\\applications\\ffmpeg\\bin\\ffmpeg.exe');
const SR = 48000;

const data = JSON.parse(fs.readFileSync(EV, 'utf8'));
/* **配乐计划由片体声明**（comp 里 `window.MTK_MUSIC_PLAN` → dump-events.py 带进 events.json）：
   { start, sections:[{id,t0,t1,g}], quiet:[[a,b]] }。缺省才退回第一支片写死的那张表。 */
const PLAN = (data.music && data.music.sections && data.music.sections.length) ? data.music : null;
const MUSIC_START = MUSIC_START_ARG != null ? parseFloat(MUSIC_START_ARG) : (PLAN && PLAN.start != null ? PLAN.start : 0.62);
const STILL_OUT = STILL_OUT_ARG != null ? parseFloat(STILL_OUT_ARG) : (PLAN && PLAN.stillOut != null ? PLAN.stillOut : 46.40);
const ANALYSIS = JSON.parse(fs.readFileSync(path.join(LIB, 'sfx-analysis.json'), 'utf8'));
const DUR = parseFloat(argOf('--dur', String(data.dur || 54)));
const N = Math.ceil(DUR * SR) + Math.floor(SR * 0.4);
const M = new Float32Array(N), Mr = new Float32Array(N);      // 音乐
const S = new Float32Array(N), Sr = new Float32Array(N);      // 音效
const V = new Float32Array(N), Vr = new Float32Array(N);      // 口播（--vo 才有内容）

/* ══ 0 · 读 WAV（音乐先用 ffmpeg 转成 48k 立体声；Node 读不了 mp3）══════════ */
/* ── 读 WAV（带真实采样率；VO 多为 44.1k，混音前要重采样到 48k）── */
function readWavFull(p) {
  const b = fs.readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error('不是 RIFF: ' + p);
  let pos = 12, fmt = null, off = 0, len = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4), l = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(pos + 10), sr: b.readUInt32LE(pos + 12), bits: b.readUInt16LE(pos + 22) };
    else if (id === 'data') { off = pos + 8; len = l; }
    pos += 8 + l + (l % 2);
  }
  if (!fmt || !off) throw new Error('WAV 结构不对: ' + p);
  if (fmt.bits !== 16) throw new Error('只支持 16bit：' + p);
  const n = Math.floor(len / 2 / fmt.ch), l = new Float32Array(n), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = b.readInt16LE(off + i * 2 * fmt.ch) / 32768;
    r[i] = fmt.ch > 1 ? b.readInt16LE(off + (i * 2 + 1) * 2) / 32768 : l[i];
  }
  return { l, r, n, sr: fmt.sr };
}
function readWav(p) { return readWavFull(p); }
function toWav(src) {
  const tmp = path.join(os.tmpdir(), `mtk_music_${process.pid}.wav`);
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', src, '-ac', '2', '-ar', String(SR), tmp], { stdio: 'ignore' });
  return tmp;
}
const MUS = (() => {
  const w = toWav(MUSIC);
  const m = readWav(w);
  fs.unlinkSync(w);
  /* 归一到达 −6 dBFS，方便"音乐/音效"两路的比例可读 */
  let pk = 0;
  for (let i = 0; i < m.n; i++) pk = Math.max(pk, Math.abs(m.l[i]), Math.abs(m.r[i]));
  const k = pk > 1e-6 ? Math.pow(10, -6 / 20) / pk : 1;
  for (let i = 0; i < m.n; i++) { m.l[i] *= k; m.r[i] *= k; }
  return m;
})();

/* ══ 2b · 音乐 EQ：曲1 量出来低频占 0.68（参考上限 0.51），靠"低架 −5dB + 3kHz 存在感 +2.5dB"修 ══ */
function norm(c) {                       // ⚠ 必须按 a[0] 归一：不归一 → 滤波器发散（实测直接算出 1e18 的样本）
  const k = c.a[0];
  return { b: c.b.map((v) => v / k), a: c.a.map((v) => v / k) };
}
function shelfLow(f0, db, S = 0.7) {
  const A = Math.pow(10, db / 40), w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), sn = Math.sin(w);
  const beta = Math.sqrt(A) / S * Math.sqrt((A + 1 / A) * (1 / S - 1) + 2);
  const ap = A + 1, am = A - 1, sq = 2 * Math.sqrt(A) * beta;
  return norm({ b: [A * (ap - am * cs + sq), 2 * A * (am - ap * cs), A * (ap - am * cs - sq)], a: [ap + am * cs + sq, -2 * (am + ap * cs), ap + am * cs - sq] });
}
function peaking(f0, db, Q = 0.8) {
  const A = Math.pow(10, db / 40), w = 2 * Math.PI * f0 / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * Q);
  return norm({ b: [1 + al * A, -2 * cs, 1 - al * A], a: [1 + al / A, -2 * cs, 1 - al / A] });
}
function applyEq(x, coefs) { for (const c of coefs) { const y = biquadRaw(x, c.b, c.a); x.set(y); } return x; }
function biquadRaw(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const MUSIC_EQ = [shelfLow(130, -12), peaking(3000, 3.0, 0.7), peaking(60, -6, 0.9)];
/* 音效总线高通 90Hz：让低频只由音乐负责（否则 kick/sub 叠上来会把"低频占比"顶到 0.6+） */
const SFX_HP = norm({ b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] });

/* ══ 3 · 音效素材 ═══════════════════════════════════════════════════════ */
const SAMPLES = {};
function load(name) {
  if (SAMPLES[name]) return SAMPLES[name];
  const a = ANALYSIS.files[name];
  if (!a) throw new Error('素材清单里没有 ' + name);
  const w = readWav(path.join(LIB, 'sfx', a.wav));
  let pk = 0;
  for (let i = 0; i < w.n; i++) pk = Math.max(pk, Math.abs(w.l[i]), Math.abs(w.r[i]));
  const k = pk > 1e-6 ? Math.pow(10, -3 / 20) / pk : 1;
  for (let i = 0; i < w.n; i++) { w.l[i] *= k; w.r[i] *= k; }
  w.peakMs = a.peak_pos_ms;
  SAMPLES[name] = w;
  return w;
}
const ROLES = {
  kick: ['impact-02', 'kick-01'],
  impact: ['impact-01', 'impact-03'],
  metal: ['metal-03', 'metal-01', 'metal-02'],
  crush: ['crush-01'],
  sub: ['sub-01', 'sub-02'],
  click: ['click-01', 'click-02', 'click-03'],
  whoosh: ['whoosh-01', 'whoosh-03', 'whoosh-02'],
  riser: ['riser-02', 'riser-01'],
  room: ['room-01'],
};
let seq = 0;
function place(name, t, gain, { pan = 0, pitch = 1, offsetPeak = true } = {}) {
  const s = load(name);
  const start = Math.floor((t - (offsetPeak ? s.peakMs / 1000 : 0)) * SR);
  const step = 1 / pitch;
  const gl = gain * (1 - Math.max(0, pan) * 0.45), gr = gain * (1 + Math.min(0, pan) * 0.45);
  for (let i = 0, src = 0; src < s.n; i++, src += step) {
    const di = start + i;
    if (di < 0) continue;
    if (di >= N) break;
    const s0 = src | 0, fr = src - s0;
    const l = s.l[s0] + (s.l[Math.min(s0 + 1, s.n - 1)] - s.l[s0]) * fr;
    const r = s.r[s0] + (s.r[Math.min(s0 + 1, s.n - 1)] - s.r[s0]) * fr;
    const p = src / s.n;
    const env = Math.min(1, p / 0.002) * Math.min(1, (1 - p) / 0.02);
    S[di] += l * gl * env; Sr[di] += r * gr * env;
  }
}
function hit(role, t, gain, opts = {}) {
  const list = ROLES[role];
  if (!list) throw new Error('未知角色 ' + role);
  place(list[(opts.variant == null ? seq++ : opts.variant) % list.length], t, gain, opts);
}

/* ══ 2 · 音乐床：**连续**铺（只有真静止段出）════════════════════════════
   参考② 的数字点破了做法：它 quiet 0.181 却 LRA 只有 4.1 —— 说明它的"安静窗"不是长段静默，
   而是**每一记重击把音乐压 −22 dB 的短促侧链**留下的 1/12s 窗。长段静默会让 LRA 冲到 12（我第一版的错）。 */
const SEC = PLAN ? PLAN.sections.map((s) => ({ id: s.id, t0: s.t0, t1: s.t1, g: s.g })) : [
  { id: 'out', t0: 0.00, t1: 0.62, g: 0.00 },                    // 开场：只有那一下切线
  { id: 'A', t0: 0.62, t1: 33.40, g: 1.00 },                     // 主段（连续）
  { id: 'bridge', t0: 33.40, t1: 39.40, g: 0.018 },              // 桥段：音乐让位（安静窗；6.0s，给 verify 留余量）
  { id: 'A2', t0: 39.40, t1: 43.90, g: 1.00 },                   // 冲势
  { id: 'still', t0: 43.90, t1: STILL_OUT, g: 0.000 },           // 真静止：音乐出
  { id: 'C', t0: STILL_OUT, t1: 53.30, g: 1.00 },                // 收尾主段
  { id: 'fade', t0: 53.30, t1: DUR, g: 0.00 },                   // 淡出
];
function musicEnv(t) {
  let g = 0;
  for (const s of SEC) if (t >= s.t0 && t < s.t1) g = s.g;
  /* 段与段之间用 0.7s 平滑过渡（避免"咔"） */
  for (const s of SEC) {
    const edge = 0.7;
    if (t >= s.t0 - edge && t < s.t0) { const prev = SEC[Math.max(0, SEC.indexOf(s) - 1)]; const k = (t - (s.t0 - edge)) / edge; g = prev.g + (s.g - prev.g) * k; }
    else if (t >= s.t1 - edge && t < s.t1) { const nx = SEC[Math.min(SEC.length - 1, SEC.indexOf(s) + 1)]; const k = (t - (s.t1 - edge)) / edge; g = s.g + (nx.g - s.g) * k; }
  }
  return g;
}
/* 侧链：每次重击把音乐**压深、压短**（音乐让路、重锤落在洞里）——
   深度与参考② 的 −22 dB 同量级，释放 0.35s：既"泵"得起来，也留下 verify 需要的安静窗，还不会把 LRA 拉爆 */
const DUCK = { crush: { db: -18, rel: 0.40 }, kick: { db: -14, rel: 0.34 }, metal: { db: -12, rel: 0.30 }, riser: { db: 0, rel: 0 } };
const duckEnv = new Float32Array(N).fill(1);
for (const e of (data.events || [])) {
  const d = DUCK[e.kind];
  if (!d || !d.db) continue;
  const depth = Math.pow(10, (d.db * DUCK_SCALE) / 20);
  const s0 = Math.max(0, Math.floor((e.t - 0.06) * SR));
  const s1 = Math.min(N, Math.floor((e.t + d.rel * 3) * SR));
  for (let i = s0; i < s1; i++) {
    const dt = i / SR - e.t;
    const env = dt < 0 ? 1 - Math.exp(dt / 0.06) : Math.exp(-dt / d.rel);
    const g = 1 - (1 - depth) * env;
    if (g < duckEnv[i]) duckEnv[i] = g;
  }
}

/* ══ 2c · 真口播（可选）：`--vo <json>`，逐句摆位 + 让音乐在口播窗内让路 ═════════
   json：[{ id, wav, t0, dur }]（wav 相对 json 所在目录）。
   规矩（资讯片实测）：口播窗内音乐压 **−14 dB**（attack 100ms / release 250ms）——
   让路比"抬人声"划算，抬人声会吃掉真峰余量。验收口径是**人声与音乐的信噪比 ≥ +6 dB**，不是"能听见"。
   ⚠ 这一段必须在"铺音乐"之前跑：音乐是读 duckEnv 铺的。 */
const VO_JSON = argOf('--vo', null);
const VO_WINS = [];
let voCount = 0, voDur = 0;
if (VO_JSON) {
  const voPath = path.resolve(VO_JSON);
  const vtable = JSON.parse(fs.readFileSync(voPath, 'utf8'));
  const vbase = path.dirname(voPath);
  for (const L of vtable) {
    const w = readWavFull(path.join(vbase, L.wav));
    const step = w.sr / SR;                                    // 重采样（VO 常是 44.1k）
    let pk = 0;
    for (let i = 0; i < w.n; i++) pk = Math.max(pk, Math.abs(w.l[i]), Math.abs(w.r[i]));
    const g = (pk > 1e-6 ? Math.pow(10, -3 / 20) / pk : 1) * (L.gain == null ? 1 : L.gain);
    const start = Math.floor(L.t0 * SR);
    for (let i = 0, src = 0; src < w.n; i++, src += step) {
      const di = start + i;
      if (di < 0 || di >= N) { if (di >= N) break; continue; }
      const s0 = src | 0, fr = src - s0;
      V[di] += (w.l[s0] + (w.l[Math.min(s0 + 1, w.n - 1)] - w.l[s0]) * fr) * g;
      Vr[di] += (w.r[s0] + (w.r[Math.min(s0 + 1, w.n - 1)] - w.r[s0]) * fr) * g;
    }
    const dur = L.dur || w.n / w.sr;
    VO_WINS.push([L.t0, L.t0 + dur]);
    voCount++; voDur += dur;
  }
  const depth = Math.pow(10, -14 / 20);
  for (const [a, b] of VO_WINS) {
    const s0 = Math.max(0, Math.floor((a - 0.03) * SR)), s1 = Math.min(N, Math.floor((b + 0.20) * SR));
    for (let i = s0; i < s1; i++) {
      const dt = i / SR - a;
      const env = dt < 0 ? 1 - Math.exp(dt / 0.10) : Math.exp(-Math.max(0, i / SR - b) / 0.25);
      const g = 1 - (1 - depth) * Math.min(1, env);
      if (g < duckEnv[i]) duckEnv[i] = g;
    }
  }
}

/* 铺音乐：film t → 轨道位置 = (t - MUSIC_START)（音乐在桥段/静止段"继续走"，回来时已在后面） */
let musicOut = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const g = musicEnv(t) * duckEnv[i] * MUSIC_GAIN;
  if (g <= 0.0001) continue;
  const src = Math.floor((t - MUSIC_START) * SR);
  if (src < 0) continue;
  if (src >= MUS.n) { musicOut = t; break; }
  M[i] = MUS.l[src] * g; Mr[i] = MUS.r[src] * g;
}
/* 音乐总线 EQ（只在音乐路上做，不动音效） */
applyEq(M, MUSIC_EQ); applyEq(Mr, MUSIC_EQ);

/* ══ 3 · 音效：只在关键处落（不做节奏循环）══════════════════════════════ */
const stills = data.stills || [[43.9, 46.4]];
const inStill = (t) => stills.some(([a, b]) => t >= a && t <= b);
const evAll = (data.events || []).filter((e) => !inStill(e.t));
const voiced = [];
let tickPhase = 0;
for (const e of evAll) {
  const g = (e.gain == null ? 1 : e.gain) * SFX_GAIN;
  if (e.kind === 'crush') { hit('crush', e.t, 0.95 * g); hit('sub', e.t, 0.5 * g); voiced.push(e); }
  else if (e.kind === 'kick') { hit('kick', e.t, 0.7 * g); voiced.push(e); }
  else if (e.kind === 'metal') { hit('metal', e.t, 0.72 * g); voiced.push(e); }
  else if (e.kind === 'riser') { hit('riser', e.t, 0.6 * g, { offsetPeak: false }); voiced.push(e); }
  else if (tickPhase++ % 4 === 0) { hit('click', e.t, 0.42 * g, { pan: tickPhase % 2 ? 0.2 : -0.2 }); voiced.push(e); }
}
/* 过场：只在"幕的规模变了"的地方给 whoosh。
   ⚠ 这张表以前也写死给第一支片（41.3/46.3/33.4）→ 换片就响错地方。现在由片体声明的计划给：
   `MTK_MUSIC_PLAN.cues = [{role,t,gain,opt}]`；没声明才退回第一支片那张。 */
const BIG = new Set(['stat', 'table', 'touch', 'camera', 'fluid', 'rhythm', 'hold', 'index', 'end']);
let trans = 0;
if (PLAN && PLAN.cues) {
  for (const c of PLAN.cues) { hit(c.role, c.t, c.gain == null ? 0.4 : c.gain, c.opt || { offsetPeak: false }); trans++; }
} else {
  for (const a of (data.acts || [])) {
    if (a.t0 <= 0.05 || !BIG.has(a.id)) continue;
    hit('whoosh', a.t0 - 0.14, 0.34, { pan: a.t0 % 2 ? 0.3 : -0.3 }); trans++;
  }
  hit('whoosh', 0.02, 0.55, { offsetPeak: false });                       // 开场那一下切线
  hit('riser', 41.30, 0.7, { offsetPeak: false });                        // 冲进静止段
  hit('whoosh', 46.30, 0.6, { offsetPeak: false, pan: -0.2 });            // 出静止段
  hit('riser', 33.40, 0.35, { offsetPeak: false });                       // 进桥段
  trans += 4;
}

/* ══ 4 · 真静止里的耳语（不是数字静音）══════════════════════════════════ */
place('room-01', 44.30, 0.045, { offsetPeak: false });

/* ══ 5 · 音效的房间（音乐不进去：音乐自己有空间）════════════════════════ */
const TAPS = [[0.019, 0.30, 1], [0.029, 0.22, -1], [0.043, 0.15, 1], [0.061, 0.10, -1]];
const Rl = new Float32Array(N), Rr = new Float32Array(N);
for (const [d, g, side] of TAPS) {
  const off = Math.floor(d * SR);
  for (let i = off; i < N; i++) {
    Rl[i] += (side > 0 ? S[i - off] : Sr[i - off]) * g;
    Rr[i] += (side > 0 ? Sr[i - off] : S[i - off]) * g;
  }
}
const quiet = (t) => (inStill(t) || (PLAN && PLAN.quiet ? PLAN.quiet : [[33.4, 39.4]]).some(([a, b]) => t >= a && t < b)) ? 0.05 : 1;
for (let i = 0; i < N; i++) {
  const hg = quiet(i / SR);
  M[i] += Rl[i] * 0.18 * hg; Mr[i] += Rr[i] * 0.18 * hg;
}

/* ══ 6 · 合轨 + 总线 + 母带 ═════════════════════════════════════════════ */
const L = new Float32Array(N), R = new Float32Array(N);
applyEq(S, [SFX_HP]); applyEq(Sr, [SFX_HP]);                    // 音效高通（低频留给音乐）
for (let i = 0; i < N; i++) { L[i] = M[i] + S[i] + V[i]; R[i] = Mr[i] + Sr[i] + Vr[i]; }
(function glue() {
  const atk = 1 - Math.exp(-1 / (0.012 * SR)), rel = 1 - Math.exp(-1 / (0.160 * SR));
  const thr = Math.pow(10, -12 / 20);
  let env = 0;
  for (let i = 0; i < N; i++) {
    const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    env += (a - env) * (a > env ? atk : rel);
    const over = env > thr ? env / thr : 1;
    const g = over > 1 ? Math.pow(over, -0.5) : 1;          // 2:1：只做胶合，别把唱片压扁（LRA 要留在 4–6）
    L[i] *= g; R[i] *= g;
  }
})();
function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const SHELF_B = [1.53512485958697, -2.69169618940638, 1.19839281085285], SHELF_A = [1, -1.69065929318241, 0.73248077421585];
const HPF_B = [1.0, -2.0, 1.0], HPF_A = [1, -1.99004745483398, 0.99007225036621];
function loudness(l, r) {
  const kl = biquad(biquad(l, SHELF_B, SHELF_A), HPF_B, HPF_A);
  const kr = biquad(biquad(r, SHELF_B, SHELF_A), HPF_B, HPF_A);
  const blk = Math.floor(0.4 * SR), step = Math.floor(blk / 4), blocks = [];
  for (let s = 0; s + blk <= kl.length; s += step) {
    let m = 0;
    for (let i = s; i < s + blk; i++) m += kl[i] * kl[i] + kr[i] * kr[i];
    m /= blk;
    const lufs = -0.691 + 10 * Math.log10(m + 1e-12);
    if (lufs > -70) blocks.push({ lufs, m });
  }
  if (!blocks.length) return -70;
  const mean = blocks.reduce((a, b) => a + b.m, 0) / blocks.length;
  const rel = -0.691 + 10 * Math.log10(mean) - 10;
  const keep = blocks.filter((b) => b.lufs > rel), use = keep.length ? keep : blocks;
  return -0.691 + 10 * Math.log10(use.reduce((a, b) => a + b.m, 0) / use.length + 1e-12);
}
function limit(Lx, Rx, ceilDb) {
  const CEIL = Math.pow(10, ceilDb / 20), look = Math.floor(0.005 * SR);
  const atk = Math.floor(0.001 * SR), rel = Math.floor(0.06 * SR);
  const nblk = Math.ceil(N / look), bmax = new Float32Array(nblk);
  for (let i = 0; i < N; i++) { const b = (i / look) | 0, v = Math.max(Math.abs(Lx[i]), Math.abs(Rx[i])); if (v > bmax[b]) bmax[b] = v; }
  let g = 1;
  for (let i = 0; i < N; i++) {
    const b = (i / look) | 0;
    const mx = Math.max(bmax[b], b < nblk - 1 ? bmax[b + 1] : 0);
    const want = mx > CEIL ? CEIL / mx : 1;
    g += (want - g) * (1 - Math.exp(-1 / (want < g ? atk : rel)));
    if (g > want) g = want;
    Lx[i] *= g; Rx[i] *= g;
  }
}
{ const b = [0.9972, -1.9944, 0.9972], a = [1, -1.9943, 0.9945]; L.set(biquad(L, b, a)); R.set(biquad(R, b, a)); }
const I0 = loudness(L, R);
const gLU = Math.min(Math.pow(10, (-16 - I0) / 20), Math.pow(10, 8 / 20)) * Math.pow(10, TRIM / 20);
const fin = Math.floor(0.01 * SR), fout = Math.floor(0.6 * SR);
for (let i = 0; i < N; i++) {
  let env = 1;
  if (i < fin) env = i / fin;
  if (N - i < fout) env *= (N - i) / fout;
  L[i] = L[i] * gLU * env; R[i] = R[i] * gLU * env;
}
limit(L, R, -5.0);

/* ══ 7 · 落盘 ═══════════════════════════════════════════════════════════ */
const LEN = Math.ceil(DUR * SR);
const buf = Buffer.alloc(44 + LEN * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + LEN * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(LEN * 4, 40);
let clipped = 0, peakOut = 0;
for (let i = 0; i < LEN; i++) {
  const l = Math.round(L[i] * 32767), r = Math.round(R[i] * 32767);
  peakOut = Math.max(peakOut, Math.abs(L[i]), Math.abs(R[i]));
  if (Math.abs(l) >= 32767 || Math.abs(r) >= 32767) clipped++;
  buf.writeInt16LE(l, 44 + i * 4); buf.writeInt16LE(r, 46 + i * 4);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
const I1 = loudness(L.subarray(0, LEN), R.subarray(0, LEN));
const dB = (x) => (20 * Math.log10(Math.max(1e-12, x))).toFixed(2);
console.log(`音乐床：${path.basename(MUSIC)}（${(MUS.n / SR).toFixed(1)}s）· 起始 ${MUSIC_START}s · 段 ${SEC.filter((s) => s.g > 0.5).map((s) => s.id).join('/')} · 让位段 ${SEC.filter((s) => s.g <= 0.5).map((s) => `${s.id}(${s.t0}→${s.t1})`).join(' ') || '（无）'}`);
console.log(`音效：库素材 ${Object.values(ROLES).flat().length} 个候选 · 画面卡点发声 ${voiced.length}/${data.events.length} · 过场 ${trans}（不做节奏循环）`);
/* 口播验收：**人声与音乐的信噪比 ≥ +6 dB**（不是"能听见"）——
   在口播窗内量 V 的 RMS 与 (M+S) 的 RMS，取各窗的中位（避免个别句读得轻就判过） */
if (voCount) {
  const snrs = [];
  for (const [a, b] of VO_WINS) {
    const s0 = Math.max(0, Math.floor((a + 0.05) * SR)), s1 = Math.min(N, Math.floor((b - 0.05) * SR));
    if (s1 - s0 < SR * 0.1) continue;
    let vv = 0, mm = 0;
    for (let i = s0; i < s1; i++) { vv += V[i] * V[i] + Vr[i] * Vr[i]; mm += (M[i] + S[i]) ** 2 + (Mr[i] + Sr[i]) ** 2; }
    snrs.push(10 * Math.log10((vv + 1e-12) / (mm + 1e-12)));
  }
  snrs.sort((x, y) => x - y);
  const snrMed = snrs.length ? snrs[snrs.length >> 1] : -99;
  console.log(`口播：${voCount} 句 / 占用 ${voDur.toFixed(1)}s · 音乐让路 −14 dB · **信噪比中位 ${snrMed.toFixed(1)} dB**（口径 ≥ +6 dB）${snrMed < 6 ? '  ⚠ 不达标' : '  ✓'}`);
}
console.log(`响度：混音 ${I0.toFixed(2)} LUFS → 增益 ${dB(gLU)} dB → 成品 ${I1.toFixed(2)} LUFS（目标 −16 ± 0.5）`);
console.log(`峰值：样点 ${dB(peakOut)} dBFS · clipped ${clipped}`);
if (musicOut) console.log(`⚠ 音乐在 ${musicOut.toFixed(1)}s 处用尽（曲子比片子短）`);
console.log(`→ ${OUT}  ${(buf.length / 1048576).toFixed(2)} MB · ${DUR}s · ${SR}Hz · 2ch`);
if (clipped > 0) { console.error('✗ 有削波，调 --trim-db 负值重跑'); process.exit(1); }
