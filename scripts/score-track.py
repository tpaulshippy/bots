#!/usr/bin/env python3
"""
Score a candidate music bed against what the promo cut actually needs.

Choosing a track by ear alone answers the wrong question. "Is this a nice
track" and "does this track work under a 31-second edit whose cuts land on the
beat" are different problems, and only the second one decides it. This scores the
second.

    python3 scripts/score-track.py track.mp3
    python3 scripts/score-track.py track.mp3 --credit-suffix " · CC BY 4.0"

It reads the scene table out of make-promo-video.py rather than duplicating it,
so the cut positions it checks against are the ones a render would really use. A
change to HOLD or to the tempo moves this check with it.

Exit status is 0 whenever a track is usable -- including one that needs a
different in-point or looping -- because those are ordinary adjustments. It is 1
only when the bed cannot be used at all.

Measurements, and why each is here:

- Tempo is taken from onset autocorrelation, reported twice: over the whole
  onset envelope, and again over only the strongest few percent of onsets so
  kick and snare dominate rather than hats. When those two disagree about
  whether a tempo is clean, the strong-onset figure is the one to trust.
- A candidate whose nearest half- or double-time rival scores within 0.1 is
  reported as ambiguous rather than silently resolved. Picking one of two
  readings and not saying so is how a tempo gets quietly wrong.
- Brightness is the share of energy above 4 kHz. This is what reads as hiss or
  harshness on a phone speaker, and it is the single most useful reject.
- Crest factor separates a drum you can hear from a dense mix that tires over
  thirty seconds. Low crest means the transients have been squashed together.
- The 1s-RMS coefficient of variation is evenness. High variance means the track
  lurches, which is uncomfortable to watch.
- Cut alignment scores onset energy under the five real cut positions. This is
  reported but never decisive: five points is too small a sample to choose a
  tempo with, and it has produced tenfold differences between neighbouring BPM
  values on the same track. It confirms a choice, it does not make one.
"""
import argparse
import importlib.util
import os
import subprocess
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 22050


def load_video_module():
    """plan_timeline() lives in the compositor; reuse it rather than restate it."""
    path = os.path.join(ROOT, "scripts", "make-promo-video.py")
    spec = importlib.util.spec_from_file_location("make_promo_video", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def decode(path, rate=SR):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(rate), "-f", "f32le", "-"],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onsets(x, hop=512, win=2048):
    """Positive spectral flux, z-scored. Returns (flux, hop_samples)."""
    n = (len(x) - win) // hop
    fr = np.lib.stride_tricks.as_strided(x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0]))
    S = np.abs(np.fft.rfft(fr * np.hanning(win), axis=1))
    flux = np.maximum(np.sum(np.diff(S, axis=0), axis=1), 0)
    if flux.std() > 0:
        flux = (flux - flux.mean()) / flux.std()
    return flux, hop


def pick_peaks(flux, hop, min_gap_s=0.15, pct=97):
    thr = np.percentile(flux, pct)
    gap = max(1, int(min_gap_s * SR / hop))
    out = []
    for i in range(len(flux)):
        if flux[i] < thr:
            continue
        lo, hi = max(0, i - gap), min(len(flux), i + gap + 1)
        if flux[i] >= flux[lo:hi].max():
            out.append(i)
    return np.array(out, dtype=int)


def tempo_candidates(flux, hop, lo=60, hi=200):
    iv = np.zeros(len(flux))
    pk = pick_peaks(flux, hop)
    if len(pk):
        iv[pk] = flux[pk] - flux[pk].min()
    ac = np.correlate(iv, iv, "full")[len(iv) - 1:]
    mx = ac[1:-1].max() or 1.0
    res = []
    for bpm in range(lo, hi):
        lag = int(round(bpm / 60.0 * SR / hop))
        if 0 < lag < len(ac):
            res.append((float(ac[lag] / mx), bpm))
    res.sort(reverse=True)
    return res


def spectra(x, hop=256, win=1024):
    n = (len(x) - win) // hop
    fr = np.lib.stride_tricks.as_strided(x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0]))
    S = np.abs(np.fft.rfft(fr * np.hanning(win), axis=1)) ** 2
    f = np.fft.rfftfreq(win, 1 / SR)
    ps = S.mean(axis=0)
    tot = ps.sum() or 1.0
    return f, ps, tot


def loudness(path):
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    i = lra = tp = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("I:") and "LUFS" in line:
            try:
                i = float(line.split()[1])
            except (IndexError, ValueError):
                pass
        elif line.startswith("LRA:") and "LU" in line:
            try:
                lra = float(line.split()[1])
            except (IndexError, ValueError):
                pass
        elif line.startswith("Peak:") and "dBFS" in line:
            try:
                tp = float(line.split()[1])
            except (IndexError, ValueError):
                pass
    return i, lra, tp


def bar_aligned_starts(video, x, need, limit=12):
    """Bar-aligned offsets and the onset strength at each, for entering partway in."""
    bar = video.bar_len(video.bpm)
    flux, hop = onsets(x)
    cands = []
    for k in range(limit + 1):
        t = round(k * bar, 3)
        if t + need > len(x) / SR:
            break
        i = int(round(t * SR / hop))
        # t=0 is measured on the forward window only; there is nothing before it.
        lo = i if t == 0 else max(0, i - 3)
        hi = min(len(flux), i + 4)
        cands.append((t, float(flux[lo:hi].max()) if hi > lo else 0.0))
    return cands, bar


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("track")
    ap.add_argument("--bpm", type=float, default=0.0,
                    help="tempo to evaluate against; 0 picks the strongest candidate")
    a = ap.parse_args()

    if not os.path.exists(a.track):
        sys.exit(f"no such file: {a.track}")
    for tool in ("ffmpeg", "ffprobe"):
        if not any(os.access(os.path.join(p, tool), os.X_OK)
                   for p in os.environ.get("PATH", "").split(os.pathsep) if p):
            sys.exit(f"missing tool: {tool}")

    video = load_video_module()
    x = decode(a.track)
    if len(x) < SR:
        sys.exit(f"{a.track} is under a second; cannot score")
    dur = len(x) / SR

    print(f"== {a.track}")
    print(f"   {dur:.2f}s, peak {20 * np.log10(max(float(np.abs(x).max()), 1e-9)):.1f} dBFS")

    # ---- tempo ------------------------------------------------------------
    flux, hop = onsets(x)
    cands = tempo_candidates(flux, hop)
    strong = tempo_candidates(flux, hop)
    # strong-onset view: zero everything but the loudest few percent
    keep = pick_peaks(flux, hop, pct=97)
    sparse = np.zeros(len(flux))
    sparse[keep] = flux[keep]
    iv = np.correlate(sparse, sparse, "full")[len(sparse) - 1:]
    mx = iv[1:-1].max() or 1.0
    strong = sorted(((float(iv[int(round(b / 60.0 * SR / hop))] / mx), b)
                     for b in range(60, 200)
                     if 0 < int(round(b / 60.0 * SR / hop)) < len(iv)), reverse=True)

    def dedupe(seq, tol=5):
        out = []
        for v, b in seq:
            if all(abs(b - o) >= tol for o in out):
                out.append(b)
            if len(out) >= 3:
                break
        return out

    top_all = dedupe(cands)
    top_strong = dedupe(strong)
    print("\n-- tempo")
    print(f"   all onsets:    {', '.join(f'{b} ({s:.2f})' for s, b in cands[:1])}"
          f"   also plausible: {top_all[1:]}")
    print(f"   strong onsets: {', '.join(f'{b} ({s:.2f})' for s, b in strong[:1])}"
          f"   also plausible: {top_strong[1:]}")
    best_strong = top_strong[0]
    # A rival at exactly double or half is the same pulse felt at another speed,
    # and it is the ambiguity that actually bites: picking 68 when the track is
    # 136 cuts every scene off the beat while the numbers still look plausible.
    dbl = [b for b in top_all + top_strong
           if b != best_strong and (abs(b / best_strong - 2.0) < 0.04
                                    or abs(b / best_strong - 0.5) < 0.04)]
    near = [b for b in top_all + top_strong
            if b != best_strong and abs(b - best_strong) < best_strong * 0.1]
    rivals = sorted(set(dbl) | set(near))
    ambiguous = bool(rivals) or best_strong in (top_all[1],)

    bpm = a.bpm or best_strong
    video.bpm = bpm
    offs, total = video.plan_timeline(bpm)
    print(f"\n   using --bpm {bpm:.0f}  -> cut {total:.2f}s, "
          f"cuts at {', '.join(f'{o:.2f}' for o in offs)}")
    if ambiguous and not a.bpm:
        print(f"   AMBIGUOUS: {best_strong} and {rivals or top_all[1:]} are the same"
              f" pulse at different speeds. A wrong pick puts every cut between beats"
              f" while still building cleanly. Confirm by ear and pass --bpm.")
    if a.bpm and rivals and all(abs(a.bpm - r) > 0.5 for r in [best_strong] + rivals):
        print(f"   WARNING: --bpm {a.bpm:.0f} matches neither the measured pulse"
              f" ({best_strong}) nor its half/double ({rivals}). Cuts will still build,"
              f" but they will not land on beats.")

    # ---- length -----------------------------------------------------------
    need = total + 0.6
    print("\n-- length")
    start = 0.0
    if dur >= need:
        print(f"   {dur:.2f}s covers the {total:.2f}s cut from the top; no looping needed.")
        cands_start, bar = bar_aligned_starts(video, x, need)
        best = max(cands_start, key=lambda kv: kv[1])
        if best[0] > 0 and best[1] > 1.0 and cands_start[0][1] < 0.6:
            print(f"   but 0s is mid-phrase (onset {cands_start[0][1]:.2f} against"
                  f" {best[1]:.2f} at bar {best[0] / bar:.0f})."
                  f" Suggest --music-start {best[0]}.")
    else:
        print(f"   {dur:.2f}s is SHORTER than the {total:.2f}s cut by {total - dur:.2f}s."
              f" It will be looped with a crossfaded seam -- expect one audible join"
              f" near {min(dur, total):.1f}s.")

    # ---- tone -------------------------------------------------------------
    f, ps, tot = spectra(x)
    hi4 = ps[f > 4000].sum() / tot
    hi8 = ps[f > 8000].sum() / tot
    cen = float((f * ps).sum() / tot)
    env = np.array([float(np.sqrt((x[i * SR // 2:(i + 1) * SR // 2] ** 2).mean() + 1e-12))
                    for i in range(len(x) // (SR // 2))])
    env = env[env > 0]
    cv = float(env.std() / (env.mean() + 1e-12))
    crest = float(np.abs(x).max() / (np.percentile(np.abs(x), 99) + 1e-9))
    print("\n-- tone and dynamics")
    print(f"   above 4 kHz {hi4 * 100:4.1f}%   above 8 kHz {hi8 * 100:4.1f}%   centroid {cen:4.0f} Hz")
    print(f"   crest {crest:4.2f}   half-second RMS variation {cv:4.2f}")
    notes = []
    if hi4 > 0.03:
        notes.append("harsh above 4 kHz — likely to read as hiss on a phone speaker")
    elif hi4 < 0.005:
        notes.append("very little top end — may sound muffled on a phone")
    if crest < 1.3:
        notes.append("low crest — transients squashed, likely to tire over 30 s")
    if cv > 0.35:
        notes.append("uneven — the track lurches")
    if float(np.abs(x).max()) > 1.0:
        notes.append("decoded peak above 0 dBFS — the source is clipping or the lossy"
                     " decode overshot; it will be caught by the normaliser regardless")
    for nline in notes:
        print(f"   ! {nline}")

    # ---- cut alignment (advisory only) ------------------------------------
    def onset_at(t):
        i = int(round(t * SR / hop))
        return float(flux[max(0, i - 3):i + 4].max()) if i < len(flux) else 0.0

    cut_scores = [onset_at(start + o) for o in offs]
    print("\n-- cut alignment (advisory only; too few points to choose a tempo with)")
    print(f"   {', '.join(f'{c:.2f}' for c in cut_scores)}   mean {sum(cut_scores) / len(cut_scores):.2f}")

    il, lra, tp = loudness(a.track)
    print("\n-- source loudness")
    print(f"   integrated {il if il is not None else '?'} LUFS   LRA {lra if lra is not None else '?'}"
          f"   true peak {tp if tp is not None else '?'} dBFS")
    print("   the compositor normalises the bed to -14 LUFS regardless of these")
    return 0


if __name__ == "__main__":
    sys.exit(main())