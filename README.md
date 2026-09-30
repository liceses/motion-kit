# motion kit · 动效短片组件库

> **这是什么**：做**短动效片**（展示片 / 规范片 / 产品动效）的一套组件与工具，跑在 **onetake** 引擎之上。
> 一支片子就是一个自包含的 `comp.html`：**屏幕上的一切都是时间 `t` 的纯函数**，
> 既能逐帧渲成 MP4，也能双击在浏览器里播。
>
> ⚠️ **许可先看**：本包是 **非商用源码共享**（PolyForm Noncommercial 1.0.0），**不是 OSI 开源**。
> 原因与范围见 [`LICENSE`](LICENSE)，逐件来源见 [`THIRD-PARTY.md`](THIRD-PARTY.md) 与 [`NOTICE.md`](NOTICE.md)。

---

## 1 · 里面有什么

```
lib/
  motion.js  ui_kit.js     引擎：动作库（39 个：入退场 / 接力 / 接触 / 相机 / 流体 / 曲线）※ 借自 onetake
  shell.js                 外壳：时钟 / 图层 / 幕调度 / 相机 / 抖动 / 六个入口
                           __seek(t) __ready __meta __track(t) __motion(t0,t1) __events()
  components.js            组件库（19 个）：角标 卡 大数字 对照表 引述 证据框 印章 缎带 总表
                           + 资讯片组件：HUD 章节卡 字幕条 数字盘 条形对照 进度条 跑马灯 片尾
                           + **那条 3px 线（spine）** —— 全片唯一实例，边变形边当每个组件的描边
  pattern.js fx.js rng.js  形（圆/拱/棋盘/锯齿/波浪）· 手感（硬阴影/落定/按压/波浪场）· 固定种子随机
  timeline.js              节拍表（acts / beats / stills / cameraKeys / shakes）
  score.mjs                采样混音器：音乐床 + 音效 + **真口播（--vo）**，零振荡器
tools/
  diag.py                  体检：__ready / 六入口 / **DEAD（扫完全片后再读一次）** / 确定性
  sheet.py                 抽帧拼接触表（不带参数台，直接人看）
  jumpcheck.py             查「走完重放的跳变」：按 1/30s 比相邻帧，报峰值与峰值时刻
  analyze_score.py         拆参考音轨：发声密度 / 频段占比 / LRA / 静音窗 / 声画对齐 / 速度
  dump-events.py           卡点表 + 片体声明的配乐计划 → events.json
  tokens-from-css.mjs      CSS → tokens.js（单向生成，派生件）
  build-single.mjs         打包成自包含单文件（内联字体/素材/音轨，零外部请求）
assets/                    27 个 **CC0** 音效 + 1 支 **CC0** 音乐 + 取料与量测脚本
style/tokens.js            由 CSS 生成的令牌（**派生件**，可用 tools 重生成）
styles/                    野兽派令牌 + 皮肤（`.m-*`）
demo/gallery.html          组件示例页（打开即看）
README STYLE COMPONENTS CONTRACT HANDOFF    六份文档
```

## 2 · 需要什么

| 用途 | 需要 |
|---|---|
| 浏览器预览 / 逐帧调试 | 一个 Chromium（`comp.html` 里的 `__seek(t)` 就是全部 API） |
| 渲成 MP4 | ffmpeg + **onetake 的 `render.py`**（不在本包内，见 `NOTICE.md §1`） |
| 验收（八条腿） | **onetake 的 `verify_promo.py`**（同上） |
| 中文排版 | 自备可分发中文字体（建议 **思源黑体 / Source Han Sans，OFL**）；原片用的 Windows 等线子集**未收录** |
| 图版装饰 | 自行生成或改用 `lib/pattern.js` 纯代码绘制（原 Qwen 图版因许可是**刻意排除**的） |

> 本包**零外部请求**：素材全是本地文件，不加载 CDN、不联网。

## 3 · 三十秒上手

```text
1) 打开 demo/gallery.html      —— 看 19 个组件长什么样（含 HUD / 字幕条 / 数字盘 / 条形对照）
2) 抄一份 comp.html 改         —— 每一幕 mount() 建 DOM，draw(t) 只写 transform/opacity/text
3) 出片                        —— dump-events.py → score.mjs → onetake 的 render.py → verify_promo.py
```

**四条最值钱的纪律**（都是踩出来的，细节在 `CONTRACT.md`）：

1. **只动 `transform` / `opacity` / `clip-path`**，不碰布局属性（否则逐帧渲染会抖）；
2. **同一个东西全片一个实例**（那条线、HUD、字幕条）：不在每一幕里各建一份；
3. **共享对象按需创建**（`ensureLine(ctx)` 那种），否则单模块隔离时整幕会**静默空白**；
4. **接力：线在新幕开场当着观众的面变形**（提前 0.1s 起、0.6s 落定），骨架与首个内容的空档 **≤0.5s**。

## 4 · 加一个组件要做的三件事

1. 样式进 `styles/skins/memphis-brut.css`（`.m-<名字>`，**只写颜色/描边/字体**，布局交给脚本）；
2. 行为进 `lib/components.js`（`MTK.comp.<名字> = (parent, opts) => ({ node, draw(t, st, w) })`）；
3. 在 `COMPONENTS.md` 登记（组件 / 驱动动作 / 出现在哪 / 验收要点），并**跑三样验证**：
   `look.py check`（对比度）→ `diag.py`（DEAD 必须为空）→ `sheet.py`（抽帧人看）。

## 5 · 本包**不含**什么（都是刻意的）

| 不含 | 原因 |
|---|---|
| Qwen-Image-2.1 生成的 5 张图版 | Qwen Research License **仅限非商用** → 不叠第三层限制 |
| 中文字体子集（`look.js`） | 原片用 Windows 等线，**不宜再分发** |
| onetake 的渲染/验收脚本 | 它们是引擎作者的工具；本包**只收录运行时**，请从作者处获取 |
| 成片、官方截图、press kit | 与本包授权无关的第三方材料 |

## 6 · 出处与致谢

- 抽取自 `make-videos-kit`（2026-09-30），范围为 `modules/motion` + 两处样式，**未改一行自有代码**
  （示例页的引用路径已改写为包内相对路径，并校验 7/7 落地）
- 引擎、动作库与验收思路来自 **onetake**（Copyright (c) 2026 Patrick，PolyForm Noncommercial 1.0.0）——
  它把「一支片子 = 一个纯函数」这件事做对了，这套组件库是站在它上面的一层
- 音效与音乐来自 **Openverse / Freesound** 的 CC0 作品，清单在 `assets/*.json`
