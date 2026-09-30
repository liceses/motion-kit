#!/usr/bin/env python3
"""modules/motion/tools/sheet.py — 干净的接触印相表（**不带参数台**，可单模块）

为什么不用 skill 的 stills.py：它固定以 `comp.html?hud=1` 打开，每张 still 都叠着底部参数台，
看到的不是观众看的画面。**人眼验收一律用这一份。**

用法（用 onetake 的 venv）：
  & $py modules/motion/tools/sheet.py work/<期号>/film/comp.html --times 1.2,5.0,10.0 --out out/sheet.png
  ... --only <模块名>      只装一个模块（看它自己那一幕）
  ... --full               1:1 不缩放（最多 4 块，看细节）
  ... --query "hud=1"      额外 query
"""
import argparse, asyncio, io, pathlib, sys
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("comp", nargs="?", default="film/comp.html")
    ap.add_argument("--times", required=True)
    ap.add_argument("--out", default="out/sheet.png")
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--tile", default="640x360")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--only", default=None, help="只装一个模块（comp 里 spec 的 name）")
    ap.add_argument("--query", default=None)
    a = ap.parse_args()

    comp = pathlib.Path(a.comp).resolve()
    ts = [float(x) for x in a.times.split(",")]
    tw, th = (1920, 1080) if a.full else (int(a.tile.split("x")[0]), int(a.tile.split("x")[1]))
    if a.full and len(ts) > 4:
        print("--full 最多 4 块（否则表巨大）；已截断到前 4 个时刻"); ts = ts[:4]
    cols = 1 if a.full else a.cols

    q = []
    if a.only: q.append("only=" + a.only)
    if a.query: q.append(a.query)
    url = "file://" + str(comp) + ("?" + "&".join(q) if q else "")

    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
        errs, cons = [], []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("console", lambda m: (cons.append(m.text) if m.type == "error" else None))
        await pg.goto(url); await pg.evaluate("window.__ready")
        diag = await pg.evaluate("window.__diag ? window.__diag() : null")
        tiles = []
        for t in ts:
            await pg.evaluate(f"window.__seek({t})")
            im = Image.open(io.BytesIO(await pg.screenshot())).convert("RGB")
            if not a.full:
                im = im.resize((tw, th))
                d = ImageDraw.Draw(im)
                cue = ""
                try:
                    c = await pg.evaluate(f"window.__cue ? window.__cue({t}) : null")
                    cue = (c or {}).get("name", "")
                except Exception:
                    pass
                d.rectangle([0, 0, 260, 20], fill=(255, 255, 255))
                d.text((6, 6), f"t={t}  {cue}", fill=(200, 0, 0))
            tiles.append(im)
        await b.close()

    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (tw * cols, th * rows), (0, 0, 0))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
    out = pathlib.Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"wrote {out.resolve()}  ({sheet.width}x{sheet.height}, {len(tiles)} tiles)")
    if diag:
        print("mounted:", ", ".join(diag.get("mods") or []) or "(none)")
        dead = diag.get("dead") or {}
        if dead: print("DEAD   :", "; ".join(f"{k}={v}" for k, v in dead.items()))
    print("page errors:", errs[:3] or "none", "| console errors:", cons[:3] or "none")
    return 0 if not errs else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
