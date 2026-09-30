#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""modules/motion/tools/analyze_score.py — **音轨拆解**：别人怎么配的，用数字说话

做片子之前要拆参考片（onetake §1），配乐同理。这个工具把一个视频/音频拆成：
  响度 / 真峰 / 静音占比 · **发声密度**（每秒多少次起音）· 起音间隔分布 · 低频-中频-高频的能量走势 ·
  段落结构（能量包络的峰谷）· **声画对齐**（每个画面硬切附近有没有声音、差几毫秒）

用法（onetake 的 venv）：
  & $py modules/motion/tools/analyze_score.py <video-or-wav> [--json out.json] [--label 名字]

依赖 ffmpeg/ffprobe（本机 D:\\applications\\ffmpeg\\bin）+ numpy。
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile

import numpy as np

SR = 48000
FFMPEG = os.environ.get("FFMPEG", r"D:\applications\ffmpeg\bin\ffmpeg.exe")
FFPROBE = os.environ.get("FFPROBE", r"D:\applications\ffmpeg\bin\ffprobe.exe")


def decode(path):
    """→ 单声道 48k float（**不用管道**：沙箱里管道 stdio 会被挡）"""
    tmp = os.path.join(tempfile.gettempdir(), f"ascore_{os.getpid()}.raw")
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", tmp],
                   check=True, stdin=subprocess.DEVNULL)
    a = np.fromfile(tmp, dtype="<f4")
    os.remove(tmp)
    return a


def ebur128(path):
    r = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-filter_complex",
                        "[0:a]ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True, errors="ignore")
    out = {"lufs": None, "true_peak": None, "lra": None}
    m = re.findall(r"I:\s*(-?[\d.]+)\s*LUFS", r.stderr)
    if m:
        out["lufs"] = float(m[-1])
    m = re.findall(r"Peak:\s*(-?[\d.]+)\s*dBFS", r.stderr)
    if m:
        out["true_peak"] = float(m[-1])
    m = re.findall(r"LRA:\s*(-?[\d.]+)\s*LU", r.stderr)
    if m:
        out["lra"] = float(m[-1])
    return out


def onsets(x, fps=100):
    """谱通量起音检测（自己算，不装 librosa）：返回起音时刻（秒）"""
    hop = SR // fps
    win = 1024
    n = (len(x) - win) // hop
    if n <= 2:
        return np.array([])
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0])).copy()
    frames *= np.hanning(win)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    flux = np.maximum(0, np.diff(spec, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    # 自适应阈值：局部均值 + 偏移
    k = fps // 2
    if len(flux) > 2 * k:
        local = np.convolve(flux, np.ones(2 * k) / (2 * k), mode="same")
        thr = local * 1.6 + flux.max() * 0.02
        idx = [i for i in range(1, len(flux) - 1)
               if flux[i] > thr[i] and flux[i] >= flux[i - 1] and flux[i] > flux[i + 1]]
    else:
        idx = []
    # 50ms 内只留最强的一个
    picked, last = [], -99
    for i in idx:
        t = i / fps
        if t - last < 0.05:
            if flux[i] > flux[int(last * fps)] if last > 0 else True:
                picked[-1] = t
            last = t
        else:
            picked.append(t)
            last = t
    return np.array(picked)


def band_energy(x, fps=2):
    """每秒窗口的低/中/高频能量占比（看"声音的重量放在哪一段"）"""
    w = SR // fps
    n = len(x) // w
    out = []
    for i in range(n):
        seg = x[i * w:(i + 1) * w]
        spec = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2
        f = np.fft.rfftfreq(len(seg), 1 / SR)
        tot = spec.sum() + 1e-12
        out.append([
            round(float(spec[f < 150].sum() / tot), 3),
            round(float(spec[(f >= 150) & (f < 2000)].sum() / tot), 3),
            round(float(spec[f >= 2000].sum() / tot), 3),
            round(float(20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9)), 1),
        ])
    return out


def visual_cuts(path, thr=0.32):
    """画面硬切时刻：ffmpeg 的 scene 分数"""
    r = subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-i", path, "-vf",
                        f"select='gt(scene,{thr})',metadata=print:file=-", "-an", "-f", "null", "-"],
                       capture_output=True, text=True, errors="ignore")
    return [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stdout + r.stderr)]


def tempo_of(x, fps=100):
    """速度与拍相位：起音包络自相关找周期，再扫相位对齐（自己算，不装 librosa）"""
    hop = SR // fps
    win = 1024
    n = (len(x) - win) // hop
    if n < 4 * fps:
        return None
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0])).copy()
    frames *= np.hanning(win)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    env = np.maximum(0, np.diff(spec, axis=0)).sum(axis=1)
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    lo, hi = int(fps * 60 / 180), int(fps * 60 / 60)          # 60–180 BPM
    if hi >= len(ac):
        return None
    lag = lo + int(np.argmax(ac[lo:hi]))
    bpm = 60.0 * fps / lag
    # 相位：让拍点落在起音最强的位置
    best, best_ph = -1, 0
    for ph in range(lag):
        s = env[ph::lag].sum()
        if s > best:
            best, best_ph = s, ph
    strength = float(best / (np.abs(env).sum() + 1e-9))
    return {"bpm": round(bpm, 1), "beat_period_s": round(lag / fps, 4),
            "first_beat_s": round(best_ph / fps, 3), "beat_strength": round(strength, 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--json", default=None)
    ap.add_argument("--label", default=None)
    ap.add_argument("--no-video", action="store_true", help="只分析声音，不找画面硬切")
    ap.add_argument("--rel", action="store_true", help="紧凑一行（横向比候选时用）")
    a = ap.parse_args()
    label = a.label or os.path.basename(a.path)

    x = decode(a.path)
    dur = len(x) / SR
    loud = ebur128(a.path)
    on = onsets(x)
    bands = band_energy(x)
    # 静音占比（1/12s 窗 < −40 dBFS）
    w = SR // 12
    n = len(x) // w
    rms = np.array([np.sqrt(np.mean(x[i * w:(i + 1) * w] ** 2) + 1e-12) for i in range(n)])
    quiet = float(np.mean(20 * np.log10(rms + 1e-9) < -40))
    iv = np.diff(on) if len(on) > 1 else np.array([])

    res = {
        "label": label, "dur_s": round(dur, 2),
        "lufs": loud["lufs"], "true_peak_dbtp": loud["true_peak"], "lra": loud["lra"],
        "onsets": len(on), "onset_per_s": round(len(on) / dur, 2),
        "onset_interval_median_s": round(float(np.median(iv)), 3) if iv.size else None,
        "onset_interval_p10_p90": [round(float(np.percentile(iv, 10)), 2), round(float(np.percentile(iv, 90)), 2)] if iv.size else None,
        "quiet_ratio_lt-40": round(quiet, 3),
        "band_low_mid_high_mean": [round(float(np.mean([b[i] for b in bands])), 3) for i in range(3)],
        "rms_db_p10_p50_p90": [round(float(np.percentile([b[3] for b in bands], p)), 1) for p in (10, 50, 90)],
        "tempo": tempo_of(x),
    }
    if not a.no_video:
        cuts = visual_cuts(a.path)
        res["visual_cuts"] = len(cuts)
        if cuts and len(on):
            near = []
            for c in cuts:
                d = on - c
                j = int(np.argmin(np.abs(d)))
                near.append(round(float(d[j]) * 1000))                  # ms：>0 表示声音在切之后
            res["audio_onset_vs_cut_ms"] = near
            res["cut_has_sound_within_80ms"] = round(float(np.mean([abs(v) <= 80 for v in near])), 2)
            res["cut_offset_median_ms"] = int(np.median(near))
    bands_txt = " ".join(f"{b[3]:>5.0f}" for b in bands[:min(len(bands), 60)])
    print(f"\n=== {label}  ({res['dur_s']}s) ===")
    print(f"响度 {res['lufs']} LUFS · 真峰 {res['true_peak_dbtp']} dBTP · LRA {res['lra']} LU · 静音窗占比 {res['quiet_ratio_lt-40']}")
    print(f"**发声密度 {res['onset_per_s']}/s**（共 {res['onsets']} 次）· 间隔中位 {res['onset_interval_median_s']}s "
          f"（p10–p90 {res['onset_interval_p10_p90']}）")
    print(f"频段占比 低/中/高 = {res['band_low_mid_high_mean']} · 每秒 RMS(dB) {res['rms_db_p10_p50_p90']}")
    if not a.no_video:
        print(f"画面硬切 {res.get('visual_cuts')} 次 · **切点附近 80ms 内有声音的比例 {res.get('cut_has_sound_within_80ms')}**"
              f" · 声音相对切点的偏移中位 {res.get('cut_offset_median_ms')}ms")
    if res["tempo"]:
        t = res["tempo"]
        print(f"速度 {t['bpm']} BPM（拍 {t['beat_period_s']}s，首拍 {t['first_beat_s']}s，拍强度 {t['beat_strength']}）")
    if a.rel:                                        # 每条候选一行，方便横向比
        print(f"{label[:34]:36} {res['dur_s']:>6.1f}s 密度{res['onset_per_s']:>5.2f} "
              f"低频{res['band_low_mid_high_mean'][0]:.2f} 中{res['band_low_mid_high_mean'][1]:.2f} 高{res['band_low_mid_high_mean'][2]:.2f} "
              f"LRA{res['lra'] if res['lra'] is not None else -1:>4} 静{res['quiet_ratio_lt-40']:.3f} "
              f"BPM{(res['tempo'] or {}).get('bpm', 0):>6}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
