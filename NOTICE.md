# NOTICE · 来源与许可（**不许含糊**）

> 这一页回答一个问题：**这套东西能不能商用、包里每一件从哪来。**
> 结论先写：**不能商用** —— 引擎是非商用许可；本包已把两处非商用素材**排除在外**（图版与中文字体）。

---

## 1 · 引擎与代码

| 项 | 来源 | 许可 |
|---|---|---|
| `lib/motion.js`、`lib/ui_kit.js` | onetake skill（`lib/`，**原样复制，未改一行**） | **PolyForm Noncommercial 1.0.0**（非商用免费；商用需另行授权） |
| `lib/shell.js`、`components.js`、`pattern.js`、`fx.js`、`rng.js`、`timeline.js`、`score.mjs`、`tools/*`、文档、皮肤 | 本仓库（make-videos-kit） | 同标 PolyForm Noncommercial 1.0.0，便于整包一致 |
| 渲染/验收脚本（`render.py` / `verify_promo.py` / `look.py` / `frame_diff.py` / `probe.py`） | onetake skill `scripts/` | 同 onetake —— **本包未收录**，请从作者处获取 |

## 2 · 图版（**本包不含，这是刻意的**）

原片用了 5 张孟菲斯图版（`ground / sticker-sheet / pattern-field / terrazzo / hero-arches`），
由**本地 Qwen-Image-2.1** 生成，**Qwen Research License 仅限非商用**。
本包**不收图版**，避免在引擎的非商用之上再叠一层；想要图版有两条路：

1. 用 **Qwen-Image-2512（Apache-2.0 口径）** 重出——原 prompt 与 seed 记录在源仓库 `assets/prompts.memphis.json`；
2. **纯代码绘制**：`lib/pattern.js` 已能画正圆 / 圆环 / 同心拱 / 棋盘 / 圆点阵 / 锯齿 / 波浪，够撑起一支片。

## 3 · 音效与音乐（**全部 CC0 1.0**）

| 项 | 来源 | 许可 |
|---|---|---|
| 音效 27 个 | `assets/fetch-sfx.mjs` 从 **Openverse**（Freesound 索引）按角色检索 | **全部 CC0 1.0**，逐件 title/author/URL/SHA256 见 `assets/sfx.json` |
| 音乐床 1 支 | `assets/music/electro-funk-1.mp3` = **"Retro" by B_Sean**（Freesound 421888） | **CC0 1.0** |
| 混音与母带 | `lib/score.mjs`（采样混音器，**零振荡器**） | 本仓库自有 |

CC0 = 免署名、可商用、可再分发 —— 但本包仍保留清单，方便你自行核对。

## 4 · 字体（**本包不含字体文件**）

| 项 | 情况 |
|---|---|
| Archivo / Instrument Sans / Geist / Geist Mono | onetake `looks/fonts/`，**SIL OFL 1.1**（可商用，保留许可即可）—— 需自行按字符集子集化 |
| 中文 | 原片用的是 **Windows 等线（Dengb.ttf）子集**，**不宜再分发** → 请改用 **思源黑体 / Source Han Sans（OFL）** 等可分发字体 |

> 字体子集化的做法：onetake 的 `look.py apply <look.json> <comp.html> --cjk <字体文件>`，
> 生成 `look.js` 内联进片子（本包不含该脚本，见 §1）。

## 5 · 一句话给发布用

> 本包引擎 onetake 为 **PolyForm Noncommercial**，组件库与工具同标非商用；
> 音效与音乐**全部 CC0 1.0**（免署名）；**图版与中文字体已刻意排除**。
> **个人非商用可以直接用与再分发（保留本页与许可原文）；商用需先换引擎并分别取得授权。**
