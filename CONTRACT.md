# CONTRACT · 动效短片（onetake）的硬契约

> 这份是**接口与纪律**，不是实例。改 `comp.html` 前读它；写新模块前也读它。
> 实例数字在 每期的 `PIPELINE.md`；风格在 `STYLE.md`。

---

## 1 · 页面必须提供的六个入口

| 入口 | 形状 | 谁读它 |
|---|---|---|
| `window.__meta` | `{dur, fps, w, h, inFrame:{id:[t0,t1]\|[t0,t1,'whole']}, title, concept}` | `render.py`（时长）、`verify_promo.py`（framing） |
| `window.__seek(t)` | `→ Promise`，**该帧所有样式写好、且图片已解码**才 resolve | `render.py` / `stills.py` / `sheet.py` / `frame_diff.py` |
| `window.__ready` | `→ Promise`，字体 + 全部 `<img>.decode()` 完成后 + 先画一帧 | 所有工具在 `goto` 之后第一件事 |
| `window.__track(t)` | `→ {id:{x,y,w,h,op}}`，**屏幕坐标**（相机/抖动已含在内） | `probe.py`（continuity）、`verify_promo.py`（framing） |
| `window.__motion(t0,t1)` | `→ number`，这一帧屏幕上**最大位移**（px） | `render.py`（自适应快门采样数） |
| `window.__events()` | `→ [{t,name,kind,gain,pan}]` | `score.mjs`（配乐卡点） |

这些由 `lib/shell.js` 统一装好。**顺序铁律**：先装 `__seek`/`__ready`，再 `mount` 各幕 ——
一个模块挂掉不能让整页渲不出来。

## 2 · 模块接口

```js
MTK.shell.boot({
  timeline,                      // MTK.timeline（acts / beats / stills / cameraKeys / shakes）
  inFrame,                       // {id: [t0, t1]} —— 这些 id 在这段时间里不许出画
  build(act, ctx) {              // 每幕一次；返回该幕的模块数组
    return [{ name: 'card', mount({ layer, world, act, ctx, w, h }) {
      return { draw(t, st) { /* 每帧：只写 transform / opacity / text */ } };
    }}];
  },
});
```

`st`（每帧）里有什么：

```js
st = {
  t, act, actT, actP,            // 绝对秒 / 幕 id / 幕内秒 / 幕内进度
  w: 1920, h: 1080,
  energy,                        // 由节拍表算出的整体能量 0..1（换幕回落的节奏感）
  cue,                           // 最近一个卡点 {t, name, kind}
  cam,                           // {x, y, zoom, rot}
  view(depth),                   // 相机矩阵（CSS matrix / ctx.setTransform）
  setWorld(node, depth),         // 把一层按深度摆好（相机 + 抖动一起作用）
  hit(kind, gain, pan),          // 补一个卡点（会并入 __events）
  shake(amp, decay),             // 这一帧加一次抖动
  flash(color, alpha, mode),     // 这一帧加一次闪光（近白底用 multiply + 冷色）
}
```

`ctx`：`reg(id, boxFn)` 登记追踪盒（**屏幕坐标**）、`$`、`el`。

## 3 · 目录与图层

- 每一幕一层：`#stage > .act#act-<id> > .world`；**不活跃的幕整层 `display:none`**（比 `clearRect` 可靠）。
- `.world { will-change: transform }`：钉住栅格尺度 —— 否则乱序 `seek` 时同一 `t` 有 1–2 级像素差。
- **组件类都在皮肤里**（`styles/skins/memphis-brut.css` 的 `.m-*`）：`position:absolute` 是硬要求 ——
  `.m-card` 写成 `relative` 会被文档流叠成一列（实测踩过），`.m-stat`/`.m-tablewrap`/`.m-index` 漏了会跑到左上角。

## 4 · 确定性（会骗人的两个口径）

| 口径 | 怎么看 |
|---|---|
| ❌ "非零像素数" | 会把 1–2 个色阶的无害噪声报成致命缺陷 |
| ✅ **最大色阶差 + 差异面积** | 判据：最大色阶差 ≤3 **且** 差异面积 ≤0.05% |

复现：`& $py modules/motion/tools/diag.py <comp> --det 5,20,40`（它自己跑两遍比）。

## 5 · 血泪坑（每条都是现场抓到的）

| 坑 | 现象 | 修法 |
|---|---|---|
| **无 query 时自动播** | 同一 `t` 两次截图拿到两个不同的帧（差异面积 20–36%），渲染全废 | 播放只认 `?play`；双击看的人点一下海报即播 |
| **脚本加载顺序** | `create_goal` 之前就抛 → `window.__seek` 根本没装上，所有工具连锁失败 | 契约先装、模块后装；`diag.py` 现在**先打页面错误**再往下跑 |
| **`.m-card` 用 relative** | 相机幕四张卡垂直叠成一列 | 用 `left/top` 定位的组件一律 `position:absolute` |
| **`.m-stat` / `.m-tablewrap` / `.m-index` 没有定位** | 元素全跑到左上角 | 皮肤里补 `position:absolute` |
| **计数器最后一位"停在半路"** | 目标是 39，画面读到的是 49 | 滚动量必须在终点前收敛到 0（`frac *= max(0, 1 - k*1.15)`） |
| **`__ready` 没等图片解码** | 同 `t` 两次不一致；单文件版与目录版对不上 | 遍历 `<img>` 逐个 `decode()` |
| **播放遮罩没在 `__seek` 里藏** | 每一帧都叠着"点击播放"，整片被冲淡 | `seek()` 默认藏；只有双击直开时保留 |
| **低饱和底色上用 `screen` 闪光** | 白底上等于没有 | 改 `multiply` + 冷色 |
| **`getImageData` 读回** | 污染确定性（之后的截图 hash 会抖） | 别把 readback 混进渲染路径 |
| **快门积出"鬼影"** | 快速位移 + 中途换图/换字，被积成多层副本 | 先跑 `shutter_probe.py`；元素自己的峰值位移 ≤25px/(1/60s) |
| **母带顺序反了** | 先限制到天花板再算增益 → 峰值增益正好 1，响度归一被丢掉，整轨只有 −24 LUFS | 顺序：**先按响度归一 → 最后限制** |
| **静止段写成绝对静音** | −91 dB，听起来像掉线 | 压到耳语（−40 dBFS 以下即可满足 `quiet_ratio`） |
| **`look.py` 喂整个 JS** | Geist 是可变字体，fontTools 在 `★` 上抛 `KeyError` | 只喂 comp（与抽出的 CJK 字形摘要），别喂整份 JS |
| **接力的骨架提前跑到上一幕** | 实测（一眼能看出）：第 4 幕的六条表格横线在 t=12.2 就铺好了，而屏上还是第 3 幕的数字；线到位后还**空等 1.7s** 才等来第一行 | ① 变形窗口放在**新幕开场**（`act.t0-0.10` 起、0.45s 落定），线要"当着观众的面"变形；② **骨架与首个内容之间的空档 ≤0.5s**（本片修前 1.7s）；③ **真静止幕的线要 `k=1` 硬切入** —— shell 会在静止窗口冻住 `t`，半途的线会被冻 2.5 秒 |
| **`__ready` 等完 decode 就截图** | 刚构建完的大文件（单文件 8MB）首次打开会拍到"半张图"：同一比较第一次报 max 38 色阶、再跑两次都是 0 | `__ready` 在 decode 之后再等**两帧**（`rAF` 套 `rAF`），让合成器真的把它上屏 |
| **"位移取模"滚动 = 每一圈跳一次** | 用户看出流体幕「走完重放的跳变」：波浪用 `((v*(1+0.07i)) % 120)` 滚动 → 5 行在 36.16/36.31/36.50/36.70/36.93s 依次绕回。实测窄窗峰值 **1.299 @ t=36.167s**，正好是算出来的那一帧 | **正弦用相位滑动**（`phase -= TAU*v/lambda`，周期函数永远无缝）；**必须回绕的元素把回绕点放到画外**（点：`-250 … w+250`）。修后同窗口峰值 **0.629**、帧间比 1.2×（均匀） |
| **单模块隔离时共享对象不存在** | `?only=fluid` 时"那条线"由第 1 幕创建、并不存在 → `null.draw` 抛异常被 try/catch 吞掉 → **整幕画布空白**，用 `--only` 量出来的数字全是假的（我白量了一轮） | 共享对象改成**按需创建**：`ensureLine(ctx)` 谁先用谁建；`ctx.reg` 也在里面登记 |
| **共享库里用了别处作用域的常量** | `fx.js` 里写了 `TAU`（它定义在 `pattern.js`）→ 流体幕整幕 draw 抛异常、画布空白；**改完那一轮我还拿着假数字在对比** | 本文件用到的常量**在本文件声明**；改共享库后必须**重新量**，不能只看"那一幕没报错" |
| **体检只读一次 DEAD** | 旧 `diag.py` 只在 `t≈0` 读 `__diag()`——而 `draw:hold = s is not defined` 只在 43.9–46.4 触发，一直是"dead: none" | 扫完全片时段之后**再读一次 DEAD**（本期靠它当场抓到 hold 幕的异常） |

## 6 · 三条不许（比"该怎么做"更重要）

1. **不许把资讯片那套搬进来**：没有 `script.json` / `frames.json` / 三处盖章 / `npm run assemble`。
2. **不许为了好看动渲染路径的确定性**（随机、时钟、CSS 过渡、动画时钟）。
3. **不许在 `lib/motion.js` 上打补丁**：要新动作就写进 `lib/components.js` / `lib/fx.js`，并在 `COMPONENTS.md` 登记。
