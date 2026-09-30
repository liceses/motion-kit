# THIRD-PARTY · 逐件来源清单（**发布前逐条对**）

> 本包自己写的部分与借用部分**分得很清**。借用件全部保留了许可与署名。

## 1 · 引擎（借自 onetake · PolyForm Noncommercial 1.0.0）

| 文件 | 来源 | 改动 |
|---|---|---|
| `lib/motion.js` | onetake skill `lib/motion.js` | **无**（原样） |
| `lib/ui_kit.js` | onetake skill `lib/ui_kit.js` | **无**（原样） |

> Required Notice: Copyright (c) 2026 Patrick. onetake is free for noncommercial use only.
> **渲染/验收工具链**（`render.py` / `verify_promo.py` / `look.py` / `frame_diff.py` / `probe.py`）
> 属于同一套 onetake skill，**本包未收录**，请从作者处获取（同样是非商用许可）。

## 2 · 本仓库自有（PolyForm Noncommercial 1.0.0，与引擎同标以便整包一致）

`lib/shell.js` · `lib/components.js` · `lib/pattern.js` · `lib/fx.js` · `lib/rng.js` ·
`lib/timeline.js` · `lib/score.mjs` · `tools/*` · `styles/brutal.css` ·
`styles/skins/memphis-brut.css` · `style/tokens.js`（由 `tools/tokens-from-css.mjs` 生成） ·
`demo/gallery.html` · `README.md` · `STYLE.md` · `COMPONENTS.md` · `CONTRACT.md` · `HANDOFF.md`

## 3 · 音效（27 个采样 · **全部 CC0 1.0**）

- 取料方式：`assets/fetch-sfx.mjs` → Openverse API（Freesound 索引）按 13 类角色检索 → `assets/sfx/*.mp3`
- 每件的 **title / author / 来源 URL / license / SHA256** 记在 `assets/sfx.json`（**逐条可查**）
- 量测特征（峰位/起音/衰减/频谱重心/低频占比）由 `assets/analyze-sfx.py` 生成，便于挑素材
- CC0 1.0：**免署名、可商用、可再分发**（本包仍保留清单，便于你自己核对）

## 4 · 音乐床（1 支 · **CC0 1.0**）

| 文件 | 作品 | 作者 | 来源 | 许可 |
|---|---|---|---|---|
| `assets/music/electro-funk-1.mp3` | "Retro" | B_Sean | Freesound 421888（经 Openverse） | **cc0 1.0** |

> 另一支候选曲（CC-BY 等）**未收录**；`assets/music.json` 里保留了当时的候选记录与许可，供你自行取用前核对。

## 5 · 字体（**本包不含字体文件**）

| 项 | 情况 |
|---|---|
| Archivo / Instrument Sans / Geist / Geist Mono | onetake `looks/fonts/`，**SIL OFL 1.1** —— 可商用，保留许可即可；本包不内联，需自行子集化 |
| 中文 | **未收录**（原片用的是 Windows 等线子集）。请改用 **思源黑体 / Source Han Sans（OFL）** 等可再分发字体 |

## 6 · 抽取信息

- 抽取自 `make-videos-kit` 工作树（2026-09-30）
- 抽取范围：`modules/motion` + `styles/{brutal.css,skins/memphis-brut.css}`，**不含** 原始工程目录（成片 / 素材 / press kit）
- 渲染逻辑**一行未改**；为包内布局只做了两处**机械适配**（都只动路径推导）：
  1. `demo/gallery.html` 的引用路径改写为包内相对路径（已校验 7/7 落地）；
  2. `tools/build-single.mjs` 的素材目录推导改为"相对包根 + 只收存在的目录"
     （本包不含图版，原逻辑会指向一个不存在的目录）。
- 独立可用性已实测：单独打开 `demo/gallery.html` → **0 pageerror、0 console error**，样式与组件正常
