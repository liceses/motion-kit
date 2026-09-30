# COMPONENTS · 组件目录（一组件一行，可 grep）

> **这是什么**：屏幕上能出现的**全部组件**，以及每个组件由哪个动作驱动、出现在哪一幕、验收时看什么。
> 加新组件必须在这里登记（并写进 `demo/gallery.html`），否则下一期没人知道它存在。
>
> 三个记号：**样式**在 `styles/skins/memphis-brut.css`（`.m-*`）· **行为**在 `lib/components.js`（`MTK.comp.*`）·
> **形**在 `lib/pattern.js`（`MTK.pat.*`）。

## 1 · 风格组件（10 个 —— 片子结尾那张总表就是它们）

| # | 组件 | 类名 / 工厂 | 驱动动作 | 出现在 | 验收要点 |
|---|---|---|---|---|---|
| 1 | 标签块 kicker | `.m-kicker` | `popIn` | 第 2/7 段 | 黑底白字或彩底黑字；20px；描边 2px |
| 2 | 来源条 source | `.m-s` + 位置 | 随主元素 | 第 5/11 段 | 弱化色 `#6b665c`（米白底 5.19:1） |
| 3 | 卡 card | `.m-card` / `comp.card()` | `popIn` `maskRise` `typeOn` `impact` | 第 2/7 段 | **必须 `position:absolute`**；彩色硬阴影 6px |
| 4 | 大数字 stat | `.m-stat` / `comp.stat()` | `tick`（逐位滚动） | 第 3 段 | 等宽数字；**滚动量在终点收敛到 0**（否则 39 读成 49） |
| 5 | 印章 stamp | `.m-stamp` / `comp.stamp()` | `impact` `press` | 第 6/12 段 | 圆形元素的文字要包实底 span（对比度检查取 bbox 四角） |
| 6 | 对照表 compare-table | `.m-tablewrap` / `comp.table()` | `gather` + `impact` | 第 4 段 | 行高 ≥96px；酸绿标该行第一；行线与 spine 对齐 |
| 7 | 引述卡 quote | `comp.quote()` | `morphRect` 之后的落定 | 第 5 段 | 引号 + 出处两行都要有 |
| 8 | 证据框 evidence | `.m-frame` / `comp.evidence()` | `morphRect` | 第 5 段 | 底部来源条；框宽 1240 内不收字 |
| 9 | 缎带 ribbon | `.m-ribbon` / `comp.ribbon()` | 匀速（**唯一允许 linear 的地方**） | 第 11 段竖向、可复用横幅 | 文字 ≥20px；速度固定（渲染确定性） |
| 10 | 字标 lockup | `.bigtitle` + `comp.stamp()` | `settle` + `seal` | 第 12 段 | 从末行基线长出来（接力） |

## 2 · 母题（跨幕复用，绑定同一令牌 —— 动效研究 R-30/R-31）

| 母题 | 实现 | 承载的真实含义 |
|---|---|---|
| **那条 3px 线（spine）** | `comp.spine()` + `SP[act]` 几何表 | 它同时是每个组件的描边；12 幕里它不停变形（切开纸面 → 卡的四边 → 数字基线 → 表格横线 → 证据框 → 印章方框 → 相机格线 → 波纹轨 → 中缝 → 拱门腿 → 表头线 → 字标基线） |
| **角标 + 档案号** | `.m-badge` / `comp.badge()` | 每段首帧出现，编号 `#mk-0003/12` 是真实序号（母题 M-03 变体）；**彩色底上不许再用同色写字**（酸绿底上的酸绿号会隐形） |
| 圆点 | `.dotmark` + `.m-deco.dot` | 第 1 幕落下砸出第一道阴影；第 9 幕由它**按**左右两栏（可见的因） |
| 纹样场 | `assets/plates/pattern-field.png` + `fx.drawField()` | 第 8 幕缓速滚动（快门鬼影风险点，先跑 `shutter_probe.py`） |
| 贴纸 | `assets/plates/sticker-sheet.png` + `slice-boxes.py` 的包围盒 | 手绘感的拱/波浪/锯齿（代码画不出"不齐"）；**干净的圆/圆环/棋盘用代码画**（模型画的圆不圆） |

## 3 · 动作（onetake `lib/motion.js`，39 个；本片登场 14 个）

| 类别 | 动作 | 本片用在哪 |
|---|---|---|
| enter | `popIn` `wordRise` `maskRise` `typeOn` `letterDrop` `tick` `flyThrough` | 卡入场、词逐行、打字机、数字滚动 |
| carry | `morphRect` `iris` `zoomThrough` `gather` `ribbon` `seal` `staccato` `hop` | 卡 → 证据框、表行归位、末行 → 字标 |
| contact | `impact` `impactSplit` `press` `squash` `sim.{magnet,follow,jelly,verlet}` | 印章砸落、按压回弹、弹簧跟随 |
| camera | `camera` `view` `whip` `shake` `drift` `lattice` `projectBox` `screenTravel` `dof` | 第 7 幕的推拉 + 全局抖动 |
| fluid | `swiftSpring` `lightField` `ripple` `silk` `carouselLoop` | 第 8 幕的波纹与丝绸 |
| curves | `ease.*` `spring` `ring` `settle` `spline` `rng` | 全部；**曲线只在定义处出现**（R-14） |

## 4 · 资讯片组件（第二轮扩展 · 9 个 · **落地价值 = 内容工厂每期真需要的那批**）

> 首秀在第二支片 `一支真口播资讯片样段`（32.4s · **真口播 7 句 + 真证据图 2 张**）。
> 这批组件的硬规则**全部来自本仓库已付出的代价**，不是随手定的 —— 字号下限、字幕安全区、
> AR-fit、密度上限都能追到 `我们资讯片产线的视觉规范` 与我们几期片子的实测。

| # | 组件 | 工厂 | 硬规则（写在样式与代码注释里） | 首秀在哪 |
|---|---|---|---|---|
| 11 | HUD 顶栏 | `comp.hud()` | 高 **60px**；内容从 **y=96** 起；栏目/期号/日期用 1px 竖线切格 | 全片持续 |
| 12 | 章节卡 | `comp.chapter()` | 标题 **≤8 汉字**、68px、从左到右揭示；kicker 20px | 幕 1/4/6/7 |
| 13 | **字幕条** | `comp.caption()` | 字号 **≥29px**（一行 ≤40 字）· 条体 **y 897–988** · **内容必须收在 y ≤848** · **不滑入滑出**（滑入会"弹一下"）· 显示窗口挂到**下一句起点前 0.12s**，但**逐字高亮只跟口播窗口**（挂住 ≠ 高亮也挂住） | 全片（7 句） |
| 14 | 数字盘 | `comp.plate()` | 大数字 56–168px、等宽 + `tabular-nums`、标注 + 出处两行 | 幕 2/3 |
| 15 | 条形对照 | `comp.bars()` | 条高 40px、数值 30px、错开 0.22s、填充从 `scaleX(0)` 起（**不是 scale(0)**） | 幕 2 |
| 16 | 进度条 | `comp.progress()` | 按**真实音频总时长**推进（不看画面时长）；贴底，**绝不压字幕** | 全片持续 |
| 17 | 跑马灯 | `comp.marquee()` | **双份文字 + 按一份高度取模** = 无缝（单份取模会在列表中间跳一下） | `demo/gallery.html` |
| 18 | 证据框（AR-fit） | `comp.evidenceFit()` | 主证据 **≥900×560**；`contain` letterbox ≤30%；底部**必带来源条**；官方整表**不进片**（自己重排） | 幕 3/5 |
| 19 | 片尾字标 | `comp.endcard()` | 字标 112px + 一行口径；从左到右揭示 | 幕 9 |

**"持续层"（chrome）的做法**：HUD / 字幕条 / 进度条**全片各一个实例**，建在自己的 world 里
（`ensureChrome()`，与"那条线"同样的纪律），由每幕的 `draw` 调 `drawChrome(t, st)` 统一驱动 ——
**不要在每一幕里各建一份**，否则跨幕会看到 DOM 重建（也是 continuity 腿掉分的原因）。

**第二支片还顺手修掉的复用障碍**：配乐段落表与过场卡点原本写死在 `score.mjs` 里（第一支片专用）。
现在由**片体自己声明** `window.MTK_MUSIC_PLAN = { start, sections, quiet, cues }`，
`dump-events.py` 带进 `events.json`，`score.mjs` 读它 —— 换片不用改混音器。
口播由 `score.mjs --vo <json>` 处理：逐句摆位 + 口播窗内音乐让路 −14 dB，
验收口径是**人声/音乐信噪比 ≥ +6 dB**（实测第二支片 16.4 dB），不是"能听见"。

## 5 · 加一个组件要做的四件事

1. 样式进 `styles/skins/memphis-brut.css`（`.m-<名字>`，**只写颜色/描边/字体**，布局交给组件脚本）；
2. 行为进 `lib/components.js`（`MK.comp.<名字> = (parent, opts) => ({node, draw(t, st, w)})`，**每帧只写 transform/opacity/text**）；
3. 在本文件登记（组件 / 驱动动作 / 出现在哪 / 验收要点）；
4. 若它需要出画保护，在 comp 的 `inFrame` 里登记 id，并给节点一个真实 `id`。

**加完必须验三样**（第一轮扩展时漏了这三步，差点把带 bug 的组件当成品交付）：

```powershell
npm run motion:tokens                                                          # CSS → 令牌/look（派生件）
& $py "$sk\scripts\look.py" check modules/motion/look/memphis-brut.look.json   # 对比度（吃 look JSON，不是 CSS）
& $py modules/motion/tools/diag.py <comp> --samples 30                         # dead 必须 none（**扫完全片后也要 none**）
& $py modules/motion/tools/sheet.py <comp> --times <每幕一个时刻> --cols 3      # 抽帧看布局与安全区
```
