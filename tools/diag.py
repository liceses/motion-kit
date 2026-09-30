#!/usr/bin/env python3
"""modules/motion/tools/diag.py — 动效短片的单页体检（引擎无关，读 __meta.dur）

用法（用 onetake 的 venv）：
  & $py modules/motion/tools/diag.py work/<期号>/film/comp.html [--png out/diag.png]

检查：
  1. pageerror / console error（**渲染前必看**）
  2. window.__ready 能不能 resolve（图片解码 + 字体）
  3. window.__diag() 装了哪几幕、DEAD 里挂了谁（这就是"谁的问题"）
  4. window.__meta（dur / fps / 尺寸 / inFrame）
  5. __seek 全时段跑一遍，有没有抛
  6. __motion 的最大位移（render.py 靠它定快门采样数）
  7. 确定性：同一个 t 连跑两次，最大色阶差与差异面积（0929 的口径：两个数一起判）
"""
import argparse, asyncio, io, json, pathlib, sys
from playwright.async_api import async_playwright


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("comp", nargs="?", default="film/comp.html")
    ap.add_argument("--samples", type=int, default=26, help="__seek 探针点数（按时长均分）")
    ap.add_argument("--det", default=None, help="确定性检查的时刻，逗号分隔；默认取 3 个")
    ap.add_argument("--png", default=None)
    a = ap.parse_args()
    comp = pathlib.Path(a.comp).resolve()
    errs, cons = [], []
    rc = 0
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await (await br.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)).new_page()
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: (cons.append(m.text) if m.type == "error" else None))
        await pg.goto("file://" + str(comp))
        ready = "ok"
        try:
            kind = await pg.evaluate("typeof window.__ready")
            if kind != "object" and kind != "function":
                raise RuntimeError("window.__ready 未定义（页面脚本在建契约之前就挂了）")
            await asyncio.wait_for(pg.evaluate("window.__ready"), timeout=15)
        except Exception as e:
            ready = "FAILED: " + str(e)[:160]
        # **先打错误**：页面脚本一挂，后面全是连锁失败，先把因报出来
        print("__ready:", ready)
        if errs:
            print("PAGE ERRORS:")
            for e in errs[:6]:
                print("  ", e[:400])
        if cons:
            print("CONSOLE ERRORS:")
            for c in cons[:6]:
                print("  ", c[:400])
        if ready != "ok" or errs:
            await br.close()
            return 1
        meta = await pg.evaluate("window.__meta || null")
        diag = await pg.evaluate("window.__diag ? window.__diag() : null")
        dur = float((meta or {}).get("dur") or 54.0)
        print("comp   :", comp)
        print("__meta :", json.dumps(meta, ensure_ascii=False)[:400])
        if diag:
            print("mounted:", ", ".join(diag.get("mods") or []) or "(none)")
            dead = diag.get("dead") or {}
            print("dead   :", "; ".join(f"{k}={v}" for k, v in dead.items()) if dead else "(none)")
            if dead:
                rc = 1
        # 全时段 seek
        times = [round(dur * i / (a.samples - 1), 3) for i in range(a.samples)]
        bad = []
        for t in times:
            try:
                await pg.evaluate(f"window.__seek({t})")
            except Exception as e:
                bad.append((t, str(e)[:160]))
        if bad:
            print("__seek FAILED at:")
            for t, e in bad:
                print(f"  t={t}: {e}")
            rc = 1
        else:
            print(f"__seek : ok at all {len(times)} probe times (dur {dur})")
        # **扫完全片再读一次 DEAD**：只在 t≈0 读会漏掉"只在某一幕触发"的异常
        diag2 = await pg.evaluate("window.__diag ? window.__diag() : null")
        if diag2:
            dead2 = diag2.get("dead") or {}
            print("dead(扫完全片后):", "; ".join(f"{k}={v}" for k, v in dead2.items()) if dead2 else "(none)")
            if dead2:
                rc = 1
        # __motion
        try:
            mo = await pg.evaluate("""(dur) => { const out = [];
              for (let t = 0; t < dur; t += 0.5) out.push([t, Math.round(window.__motion(t, Math.min(t + 1/60, dur - 1e-6)))]); return out; }""", dur)
            top = sorted(mo, key=lambda r: -r[1])[:8]
            print("__motion: max", max(r[1] for r in mo), "px  top:", ", ".join(f"t={t:.1f}:{v}" for t, v in top))
        except Exception as e:
            print("__motion: THREW", str(e)[:200]); rc = 1
        # 确定性：同 t 两次
        det = [float(x) for x in a.det.split(",")] if a.det else [dur * 0.1, dur * 0.5, dur * 0.8]
        from PIL import Image, ImageChops
        import numpy as np
        for t in det:
            shots = []
            for _ in range(2):
                await pg.evaluate(f"window.__seek({t})")
                shots.append(Image.open(io.BytesIO(await pg.screenshot())).convert("RGB"))
            diff = np.asarray(ImageChops.difference(shots[0], shots[1]))
            mx = int(diff.max()); area = float((diff.max(axis=2) > 0).mean())
            print(f"det    : t={t:<6g} max色阶差 {mx:>3}  差异面积 {area * 100:.4f}%  {'ok' if mx <= 3 and area <= 0.0005 else 'CHECK'}")
        if a.png:
            pin = a.t if a.t is not None else 0.0
            await pg.evaluate(f"window.__seek({pin})")     # 修：原来写成 `a.png and 0.0`，恒为 0
            await pg.screenshot(path=a.png)
            print("png    :", pathlib.Path(a.png).resolve(), f"@ t={pin}")
        await br.close()
    if errs:
        print("PAGE ERRORS:"); [print("  ", e[:300]) for e in errs[:10]]; rc = 1
    else:
        print("errors : none")
    if cons:
        print("CONSOLE ERRORS:"); [print("  ", c[:300]) for c in cons[:10]]; rc = 1
    return rc


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
