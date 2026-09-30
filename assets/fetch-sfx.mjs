#!/usr/bin/env node
/* modules/motion/assets/fetch-sfx.mjs — 从 Openverse（Freesound 索引）取 **CC0 音效**，落盘并记录许可
 *
 * 为什么要它：用户明确要求「去找音效库，别自己写」。合成出来的打击/低音不专业，
 * 而 Openverse 返回里**自带 `license` 字段与直链**，是唯一能"闭着眼也知道许可"的路子（本仓库 0929 那期验证过）。
 *
 * 用法：
 *   node modules/motion/assets/fetch-sfx.mjs --list            # 只看会取什么
 *   node modules/motion/assets/fetch-sfx.mjs                   # 取（已有就跳过）
 *   node modules/motion/assets/fetch-sfx.mjs --role kick --force
 *
 * 产物：modules/motion/assets/sfx/<role>-<n>.mp3 + sfx.json（含 title/author/url/license/SHA256/时长）
 * 纪律：**只要 CC0**（可商用、免署名）；每条记来源，改不动就删掉重取。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = import.meta.dirname;
const DIR = path.join(HERE, 'sfx');
const META = path.join(HERE, 'sfx.json');
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(n);

/* 每个"角色"要有几个候选：短片里同一个角色重复出现，多个候选轮换才不呆 */
const ROLES = [
  { role: 'kick', q: 'deep kick drum thud', n: 2, min: 0.25, max: 1.6 },
  { role: 'impact', q: 'impact hit wood', n: 3, min: 0.2, max: 2.2 },
  { role: 'metal', q: 'metal impact hit', n: 3, min: 0.25, max: 2.6 },
  { role: 'crush', q: 'glass shatter crash debris', n: 2, min: 0.5, max: 3.5 },
  { role: 'sub', q: 'sub bass drop', n: 2, min: 0.7, max: 3.0 },
  { role: 'click', q: 'ui click button', n: 3, min: 0.04, max: 0.6 },
  { role: 'tick', q: 'short tick clock', n: 2, min: 0.03, max: 0.45 },
  { role: 'whoosh', q: 'whoosh transition', n: 3, min: 0.4, max: 2.6 },
  { role: 'riser', q: 'riser build up', n: 2, min: 1.2, max: 6.0 },
  { role: 'hat', q: 'hihat closed', n: 2, min: 0.03, max: 0.4 },
  { role: 'clap', q: 'clap one shot', n: 2, min: 0.1, max: 1.0 },
  { role: 'shaker', q: 'shaker percussion', n: 2, min: 0.05, max: 0.6 },
  { role: 'room', q: 'room tone quiet ambience', n: 1, min: 4.0, max: 40.0 },
];
const only = argOf('--role', null);
const force = flag('--force');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const pad = (s, n) => String(s).padEnd(n);
const validName = (s) => String(s || '').replace(/[^\w\u4e00-\u9fff@.\- ]+/g, '').trim().slice(0, 60);

async function search(q) {
  const u = `https://api.openverse.org/v1/audio/?q=${encodeURIComponent(q)}&license=cc0&page_size=20`;
  const r = await fetch(u, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'make-videos-kit/1.0 (local film pipeline)' } });
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  return (await r.json()).results || [];
}

const meta = fs.existsSync(META) ? JSON.parse(fs.readFileSync(META, 'utf8')) : { about: 'CC0 音效库（Openverse / Freesound 索引）。只有 CC0：可商用、免署名。', roles: {} };
meta.roles = meta.roles || {};
fs.mkdirSync(DIR, { recursive: true });

if (flag('--list')) {
  for (const r of ROLES) {
    const have = (meta.roles[r.role] || []).length;
    console.log(`${pad(r.role, 9)}${pad('×' + r.n, 4)}${pad(r.min + '–' + r.max + 's', 12)}${have ? '已有 ' + have : '未取'}   q="${r.q}"`);
  }
  process.exit(0);
}

for (const spec of ROLES) {
  if (only && spec.role !== only) continue;
  const existing = meta.roles[spec.role] || [];
  if (existing.length >= spec.n && !force) { console.log(`${pad(spec.role, 9)}已有 ${existing.length} 个，跳过`); continue; }
  let results;
  try { results = await search(spec.q); } catch (e) { console.error(`${pad(spec.role, 9)}✗ 检索失败：${e.message}`); continue; }
  const pool = results.filter((r) => {
    const d = (r.duration || 0) / 1000;
    return d >= spec.min && d <= spec.max && r.url && /\.(mp3|wav|ogg)$/i.test(r.url);
  }).sort((a, b) => (a.duration || 0) - (b.duration || 0));
  const picked = [];
  for (const r of pool) {
    if (picked.length >= (force ? spec.n : spec.n - existing.length)) break;
    const ext = (r.url.match(/\.(mp3|wav|ogg)$/i) || [, 'mp3'])[1].toLowerCase();
    const idx = existing.length + picked.length + 1;
    const file = `${spec.role}-${String(idx).padStart(2, '0')}.${ext}`;
    try {
      const res = await fetch(r.url, { signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'make-videos-kit/1.0' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1500) throw new Error('文件太小 ' + buf.length);
      fs.writeFileSync(path.join(DIR, file), buf);
      picked.push({
        file, role: spec.role, title: validName(r.title), author: validName(r.creator), duration_s: +((r.duration || 0) / 1000).toFixed(2),
        license: r.license + (r.license_version ? ' ' + r.license_version : ''), source_url: r.foreign_landing_url || r.url,
        download_url: r.url, bytes: buf.length, sha256: sha(buf).slice(0, 16), query: spec.q,
      });
      console.log(`${pad(spec.role, 9)}↓ ${pad(file, 16)}${pad(((r.duration || 0) / 1000).toFixed(2) + 's', 8)}${(buf.length / 1024).toFixed(0)}KB  ${validName(r.title)}`);
    } catch (e) { console.error(`${pad(spec.role, 9)}✗ 下载失败：${e.message}`); }
  }
  meta.roles[spec.role] = existing.concat(picked);
  fs.writeFileSync(META, JSON.stringify(meta, null, 2) + '\n');
}
const total = Object.values(meta.roles).reduce((a, b) => a + b.length, 0);
console.log(`\nok · 库中共 ${total} 个 CC0 素材 → ${path.relative(process.cwd(), DIR)}（元数据 ${path.relative(process.cwd(), META)}）`);
