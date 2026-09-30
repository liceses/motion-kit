#!/usr/bin/env node
/* modules/motion/assets/fetch-music.mjs — 取**音乐床**（不是音效）：别人怎么配，我们就怎么配
 *
 * 参考拆解（modules/motion/tools/analyze_score.py）得到的硬事实：
 *   已通过的片子发声密度 4.5–5.2/s、静音窗占比 0.00–0.18、中频占比 0.29–0.68 ——
 *   **它们都有一条持续的音乐床**，音效只落在关键几处。我第一版只有稀疏敲击（2.96/s、静音 0.37），
 *   听感就是"一条不停断的敲击清单"。
 *
 * 所以这一支脚本只干一件事：从 Openverse 取**完整曲目**（CC0 优先，其次 CC-BY，都要署名信息）。
 * 量化挑曲（不靠耳朵猜）：时长要够、频谱平衡要落在参考区间、能量走势要稳。
 *
 * 用法：
 *   node modules/motion/assets/fetch-music.mjs --list
 *   node modules/motion/assets/fetch-music.mjs [--force]
 *
 * 产物：modules/motion/assets/music/<slug>.mp3 + music.json（title/author/url/license/时长/SHA256）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = import.meta.dirname;
const DIR = path.join(HERE, 'music');
const META = path.join(HERE, 'music.json');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);

/* 曲风：孟菲斯 × 新野兽派 = 1980s 印刷品 + 现代电子 —— 找"有律动、别太满、器乐"的完整曲目。
   ⚠ 实测（第一版取到 0 支）：这些词的 result_count 很小，且完整曲目多在 Jamendo：
     直链常是 `…?trackid=…&format=mp32`（不是以 .mp3 结尾），扩展名也可能是 .oga —— 正则必须放宽。 */
const QUERIES = [
  { slug: 'funk', q: 'funk instrumental', min: 40, max: 600 },
  { slug: 'groove', q: 'groove instrumental', min: 40, max: 600 },
  { slug: 'electro-funk', q: 'electro funk', min: 40, max: 600 },
  { slug: 'boogie', q: 'boogie disco', min: 40, max: 600 },
  { slug: 'synth-funk', q: 'synth funk instrumental', min: 40, max: 600 },
  { slug: 'breakbeat', q: 'breakbeat', min: 40, max: 600 },
  { slug: 'nu-disco', q: 'nu disco instrumental', min: 40, max: 600 },
  { slug: 'jamendo-funk', q: 'funk', min: 40, max: 600, source: 'jamendo' },
];
const PER_QUERY = 3;
const LICENSES = 'cc0,by';                     // CC0 最好；CC-BY 可以，但发布文案要署名
const OK_EXT = /\.(mp3|ogg|oga|wav|flac)$/i;
const OK_QUERY = /[?&]format=(mp3|mp32|ogg|wav)\b/i;
const force = flag('--force');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pad = (s, n) => String(s).padEnd(n);
const clean = (s) => String(s || '').replace(/[^\w\u4e00-\u9fff@.\- ]+/g, '').trim().slice(0, 70);

async function search(q, source) {
  const u = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=${LICENSES}&page_size=20`
    + (source ? `&source=${encodeURIComponent(source)}` : '');
  const r = await fetch(u, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'make-videos-kit/1.0' } });
  if (!r.ok) throw new Error('Openverse ' + r.status);
  return (await r.json()).results || [];
}

const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : { about: '音乐床候选（Openverse：CC0 优先 / CC-BY 需署名）。量化挑选，不靠名字。', tracks: [] };
fs.mkdirSync(DIR, { recursive: true });

if (flag('--list')) {
  if (!meta.tracks.length) console.log('（还没有候选，先跑一次不带 --list 的）');
  for (const t of meta.tracks) console.log(`${pad(t.slug, 14)}${pad(t.duration_s + 's', 9)}[${t.license}]  ${t.title} · ${t.author}`);
  process.exit(0);
}

for (const spec of QUERIES) {
  if (!force && meta.tracks.some((t) => t.slug.startsWith(spec.slug))) { console.log(`${pad(spec.slug, 14)}已有，跳过`); continue; }
  let res;
  try { res = await search(spec.q, spec.source); } catch (e) { console.error(`${pad(spec.slug, 14)}✗ ${e.message}`); continue; }
  const pool = res.filter((r) => {
    const d = (r.duration || 0) / 1000;
    const url = r.url || '';
    return d >= spec.min && d <= spec.max && url && (OK_EXT.test(url) || OK_QUERY.test(url));
  }).sort((a, b) => (b.duration || 0) - (a.duration || 0));
  let got = 0;
  for (const r of pool) {
    if (got >= PER_QUERY) break;
    const slug = `${spec.slug}-${got + 1}`;
    if (!force && meta.tracks.some((t) => t.slug === slug)) { got++; continue; }
    const ext = OK_EXT.test(r.url) ? (r.url.match(OK_EXT) || [, 'mp3'])[1].toLowerCase() : 'mp3';
    const file = `${slug}.${ext}`;
    try {
      const resp = await fetch(r.url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'make-videos-kit/1.0' } });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length < 200000) throw new Error('文件太小 ' + buf.length);      // 完整曲目不该只有几十 KB
      fs.writeFileSync(path.join(DIR, file), buf);
      meta.tracks = meta.tracks.filter((t) => t.slug !== slug).concat([{
        slug, file, title: clean(r.title), author: clean(r.creator),
        duration_s: +((r.duration || 0) / 1000).toFixed(1),
        license: r.license + (r.license_version ? ' ' + r.license_version : ''),
        license_url: r.license_url || null,
        source_url: r.foreign_landing_url || r.url, download_url: r.url,
        bytes: buf.length, sha256: sha(buf).slice(0, 16), query: spec.q,
      }]);
      fs.writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
      console.log(`${pad(spec.slug, 14)}↓ ${pad(file, 22)}${pad(((r.duration || 0) / 1000).toFixed(0) + 's', 7)}${(buf.length / 1048576).toFixed(1)}MB  [${r.license}] ${clean(r.title)}`);
      got++;
    } catch (e) { console.error(`${pad(spec.slug, 14)}✗ ${e.message}`); }
  }
}
console.log(`\nok · ${meta.tracks.length} 支候选 → ${path.relative(process.cwd(), DIR)}`);
console.log('下一步：逐支量化（& $py modules/motion/tools/analyze_score.py <file> --no-video）再挑');
