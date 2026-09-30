#!/usr/bin/env python3
"""modules/motion/tools/dump-events.py — 把片子里的卡点表 dump 成 JSON，交给 score.mjs 配乐

用法（onetake 的 venv）：
  & $py modules/motion/tools/dump-events.py work/<期号>/film/comp.html --out work/<期号>/film/audio/events.json

输出：[{t, name, kind, gain, pan}, …]（由 window.__events() 给；节拍表是唯一真相）
"""
import argparse, asyncio, json, pathlib, sys
from playwright.async_api import async_playwright


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("comp")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    comp = pathlib.Path(a.comp).resolve()
    out = pathlib.Path(a.out) if a.out else comp.parent / "audio" / "events.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width": 1920, "height": 1080})
        await pg.goto("file://" + str(comp))
        await pg.evaluate("window.__ready")
        meta = await pg.evaluate("window.__meta")
        ev = await pg.evaluate("window.__events()")
        acts = await pg.evaluate("(window.MTK && window.MTK.timeline && window.MTK.timeline.acts || []).map(a => ({id: a.id, t0: a.t0, t1: a.t1}))")
        stills = await pg.evaluate("(window.MTK && window.MTK.timeline && window.MTK.timeline.stills || null)")
        # 配乐计划由**片体自己声明**（window.MTK_MUSIC_PLAN）：音乐从哪进、哪几段让位、哪段真静止。
        # 以前这张表写死在 score.mjs 里 → 换一支片就得改混音器（第二支片就是这么发现的）。
        music = await pg.evaluate("window.MTK_MUSIC_PLAN || null")
        await b.close()
    data = {"dur": (meta or {}).get("dur"), "fps": (meta or {}).get("fps"), "source": comp.name,
            "acts": acts, "events": ev, "stills": stills, "music": music}
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    kinds = {}
    for e in ev:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"{out}  dur={data['dur']}s  events={len(ev)}  " + " ".join(f"{k}:{v}" for k, v in sorted(kinds.items())))
    if music:
        segs = music.get("sections") or []
        print(f"        music: start={music.get('start')}s · 段 " + " ".join(f"{s['id']}({s['t0']}→{s['t1']},g={s.get('g')})" for s in segs))
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
