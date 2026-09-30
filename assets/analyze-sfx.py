#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""modules/motion/assets/analyze-sfx.py — 音效库"体检 + 转码"：别靠标题挑素材，靠数字挑。

做两件事：
  1. 把 sfx/*.mp3 全部转成 `sfx/wav/*.wav`（48kHz / 立体声 / 16bit）—— Node 的混音器读不了 mp3，
     但读 WAV 只是解析 RIFF 头，零依赖。
  2. 量每个素材的客观特征，写成 `sfx-analysis.json` 并打一张表：
       duration / peak / rms / 起音时间 / 衰减到 −20dB 的时间 / 频谱重心 / 低频占比(<150Hz) / 高频占比(>2kHz)
     有了这些就能判断"它到底是不是一个 kick/click/whoosh"，而不是看名字猜。

用法（onetake 的 venv，自带 numpy）：
  & $py modules/motion/assets/analyze-sfx.py
"""
import json
import os
import subprocess
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
SFX = os.path.join(HERE, "sfx")
OUTW = os.path.join(SFX, "wav")
SR = 48000
FFMPEG = os.environ.get("FFMPEG", r"D:\applications\ffmpeg\bin\ffmpeg.exe")


def decode(path):
    """ffmpeg → 临时原始文件 → numpy（**不用管道**：沙箱里管道 stdio 会被挡）"""
    raw = os.path.join(SFX, "_tmp.raw")
    cmd = [FFMPEG, "-v", "error", "-y", "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", raw]
    subprocess.run(cmd, check=True)
    a = np.fromfile(raw, dtype="<f4")
    os.remove(raw)
    if a.size % 2:
        a = a[:-1]
    return a.reshape(-1, 2)


def write_wav(path, sig):
    x = np.clip(sig, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def features(sig):
    mono = sig.mean(axis=1)
    n = mono.size
    dur = n / SR
    peak = float(np.max(np.abs(sig))) or 1e-9
    rms = float(np.sqrt(np.mean(mono ** 2))) or 1e-9
    env = np.abs(mono)
    # 起音：从 1% 峰值到峰值
    pk = int(np.argmax(env))
    thr = 0.01 * env[pk] if env[pk] > 0 else 0
    start = int(np.argmax(env > thr)) if np.any(env > thr) else 0
    attack_ms = round((pk - start) / SR * 1000, 1)
    # 衰减到 −20dB
    tail = np.argmax(env[pk:] < env[pk] * 0.1)
    decay_ms = round((tail / SR * 1000) if tail else dur * 1000, 1)
    # 频谱（整段平均）
    win = np.hanning(min(n, 16384))
    seg = mono[: win.size] * win
    spec = np.abs(np.fft.rfft(seg)) ** 2
    freqs = np.fft.rfftfreq(seg.size, 1 / SR)
    tot = spec.sum() or 1e-9
    centroid = float((spec * freqs).sum() / tot)
    low = float(spec[freqs < 150].sum() / tot)
    high = float(spec[freqs > 2000].sum() / tot)
    return {
        "dur_s": round(dur, 3),
        "peak_db": round(20 * np.log10(peak), 1),
        "rms_db": round(20 * np.log10(rms), 1),
        "peak_pos_ms": round(pk / SR * 1000, 1),          # ★ 混音时用它把**瞬态**对准卡点
        "attack_ms": attack_ms, "decay_to_-20db_ms": decay_ms,
        "centroid_hz": round(centroid), "low_lt150": round(low, 3), "high_gt2k": round(high, 3),
    }


def guess_role(f, name):
    """用数字给一个"它像什么"的猜测，供人（我）核对，而不是替人决定"""
    if f["low_lt150"] > 0.6 and f["dur_s"] < 1.2:
        return "kick/sub 类（低频占比高）"
    if f["dur_s"] < 0.25 and f["centroid_hz"] > 3000:
        return "click/tick 类（极短 + 高频）"
    if f["centroid_hz"] > 4000 and f["dur_s"] < 0.6:
        return "hat/shaker 类（短 + 很亮）"
    if f["dur_s"] > 1.5 and f["low_lt150"] < 0.4:
        return "whoosh/riser/room 类（长）"
    if f["centroid_hz"] > 1200 and f["dur_s"] < 1.5:
        return "impact/metal 类（中高频 + 短）"
    return "存疑（多听/多看波形再定）"


def main():
    os.makedirs(OUTW, exist_ok=True)
    rows = {}
    for name in sorted(os.listdir(SFX)):
        if not name.lower().endswith((".mp3", ".wav", ".ogg")) or name.startswith("_"):
            continue
        src = os.path.join(SFX, name)
        sig = decode(src)
        stem = os.path.splitext(name)[0]
        write_wav(os.path.join(OUTW, stem + ".wav"), sig)
        f = features(sig)
        f["guess"] = guess_role(f, stem)
        f["wav"] = "wav/" + stem + ".wav"
        rows[stem] = f
        print(f"{stem:12} {f['dur_s']:>6.2f}s peak{f['peak_db']:>6.1f} 起音{f['attack_ms']:>6.1f}ms 衰减{f['decay_to_-20db_ms']:>7.1f}ms "
              f"重心{f['centroid_hz']:>6}Hz 低{f['low_lt150']:>5.2f} 高{f['high_gt2k']:>5.2f}  {f['guess']}")
    with open(os.path.join(HERE, "sfx-analysis.json"), "w", encoding="utf-8") as fh:
        json.dump({"sr": SR, "note": "由 analyze-sfx.py 量出；挑素材看这些数，不看文件名。", "files": rows}, fh, ensure_ascii=False, indent=2)
    print(f"\n→ {os.path.join(HERE, 'sfx-analysis.json')} · {len(rows)} 个素材 · wav 落在 sfx/wav/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
