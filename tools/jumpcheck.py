#!/usr/bin/env python3
"""modules/motion/tools/jumpcheck.py — 查「走完重放的跳变」（相邻帧差异的尖峰）

起因：用户两次抓到同一类毛病 —— ① 骨架提前到位后空等 1.7s；② 流体幕的波浪"走完重放"跳一下。
根因都是**位移取模**或**时序错位**，而这两种毛病在单张 still 上完全看不出来，只有按帧看才现形。

做法：按 1/30s 逐帧 seek → 截图 → 灰度 → 算相邻帧的平均绝对差；
     报**中位 / p90 / 峰值**以及峰值时刻。有"跳变"时峰值会比中位高一个量级。
     （平滑滚动的相邻帧差异应该是均匀的小值；尖峰 = 有一处瞬间位移。）

用法（onetake 的 venv）：
  & $py modules/motion/tools/jumpcheck.py <comp> --t0 33.6 --t1 36.8 [--fps 30] [--top 3] [--only <模块>]
"""
import argparse
import asyncio
import io
import pathlib
import sys

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("comp")
    ap.add_argument("--t0", type=float, required=True)
    ap.add_argument("--t1", type=float, required=True)
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--top", type=int, default=3)
    ap.add_argument("--only", default=None, help="只装一个模块（?only=）")
    ap.add_argument("--scale", type=int, default=4, help="截图降采样倍数（默认 4 → 480×270，够用且快）")
    ap.add_argument("--ignore-head", type=float, default=0.0,
                    help="跳过开头这么多秒：**幕开场本来就有尖峰**（元素入场/涟漪起势），不算缺陷")
    ap.add_argument("--ignore-tail", type=float, default=0.0, help="跳过结尾这么多秒（同上）")
    a = ap.parse_args()

    comp = pathlib.Path(a.comp).resolve()
    url = "file://" + str(comp) + (f"?only={a.only}" if a.only else "")
    n = int(round((a.t1 - a.t0) * a.fps))
    times = [a.t0 + i / a.fps for i in range(n + 1)]
    t_lo, t_hi = a.t0 + a.ignore_head, a.t1 - a.ignore_tail

    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(url)
        await pg.evaluate("window.__ready")
        prev, ys = None, []
        for t in times:
            await pg.evaluate(f"window.__seek({t})")
            im = Image.open(io.BytesIO(await pg.screenshot())).convert("L")
            if a.scale > 1:
                im = im.resize((im.width // a.scale, im.height // a.scale))
            x = np.asarray(im, dtype=np.float32)
            if prev is not None and t_lo <= t <= t_hi:
                ys.append((t, float(np.abs(x - prev).mean())))
            prev = x
        await b.close()

    if not ys:
        print("采样太短"); return 1
    vals = np.array([v for _, v in ys])
    med = float(np.median(vals))
    p90 = float(np.percentile(vals, 90))
    order = np.argsort(vals)[::-1][: a.top]
    print(f"t={a.t0}–{a.t1}s  {len(ys)} 对相邻帧（1/{a.fps}s）· 降采样 1/{a.scale}")
    print(f"相邻帧差异：中位 {med:.3f} · p90 {p90:.3f} · 峰值 {vals.max():.3f}  → 峰值/中位 = {vals.max() / max(med, 1e-6):.1f}×")
    print("峰值时刻：" + " · ".join(f"t={ys[i][0]:.3f}s Δ={ys[i][1]:.3f}" for i in order))
    flag = "⚠ 有尖峰（疑似跳变）" if vals.max() > max(med * 6, med + 1.5) else "✓ 无明显尖峰（差异是均匀的滚动量）"
    print(flag)
    if errs:
        print("page errors:", errs[:3])
    return 0 if "✓" in flag else 2


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
