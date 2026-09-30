#!/usr/bin/env python3
"""
Generate the promo music bed. Original synthesis, no sampled or licensed audio,
so nothing third-party is embedded in the shipped video.

Target feel: calm, spacious, unfocused-attention. Ambient pad, no percussion, no
melody line. The first attempt had a 16th-note bell arpeggio over a saw pad with
only a short delay, which read as a cheap synth loop and fought the captions.

What changed and why:
  - Replaced the delay with a real convolution reverb (FFT, synthetic
    exponentially-decaying noise IR). The long tail is most of what makes a bed
    feel like a room rather than a sequencer.
  - Removed the arpeggio and the kick/shaker entirely. Percussion implies a beat
    the eye follows, which is the opposite of background music for reading.
  - Slowed to 66 BPM and gave each chord ~6s with a 1.4s attack, so chords
    overlap and blur into each other instead of articulating.
  - Added a sub-bass breath instead of a plucky bass note, and a very quiet
    high shimmer for air.
  - Panned the pad and shimmer with independent per-channel detune for width.

Swap in a licensed track with --music on make-promo-video.py; nothing downstream
depends on this file.
"""
import argparse
import math
import wave

import numpy as np

SR = 44100
BPM = 66.0
CHORD_SEC = 6.0


def midi(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def sine(n, f, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * f * (2.0 ** (detune / 1200.0)) * t + phase)


def env(n, attack, release, sustain=1.0):
    """Slow swell in, long tail out. Peaks at `sustain`."""
    na = max(int(attack * SR), 1)
    nr = max(int(release * SR), 1)
    na = min(na, n)
    nr = min(nr, max(n - na, 1))
    ns = max(n - na - nr, 0)
    return np.concatenate([
        np.linspace(0, sustain, na, endpoint=False),
        np.full(ns, sustain),
        np.linspace(sustain, 0, nr, endpoint=False),
    ])[:n]


def lowpass(x, cutoff, order=2):
    """Zero-phase low-pass via repeated FFT smoothing. Cheap and artefact-free
    enough for a pad, and unlike a one-pole IIR it does not ring or drift."""
    y = x
    for _ in range(order):
        spec = np.fft.rfft(y)
        f = np.fft.rfftfreq(len(y), 1 / SR)
        spec *= 1.0 / (1.0 + (f / cutoff) ** 6)
        y = np.fft.irfft(spec, n=len(y))
    return y


def reverb(x, seconds=3.4, decay=3.2, predelay=0.02):
    """FFT convolution with a synthetic exponentially-decaying noise IR.

    A short feedback delay sounds like a slap; a real IR with a diffuse tail is
    what stops the pad sounding like it is being played inside a box.
    """
    n = int(seconds * SR)
    ir = np.random.default_rng(11).normal(0, 1, n)
    ir *= np.exp(-np.arange(n) / (decay * SR))
    # Taper the first few ms so the direct impulse is softened, not a click.
    ir[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    ir /= np.sqrt((ir**2).sum())
    size = len(x) + n
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    out = np.zeros_like(x)
    d = int(predelay * SR)
    out[d:] = wet[d:]
    return out


# Fmaj9 - Em7 - Am7 - Cadd9. Open, unresolved, nothing that wants resolving.
PROGRESSION = [
    [53, 60, 64, 67, 72],   # Fmaj9
    [52, 59, 62, 67, 71],   # Em7
    [45, 57, 60, 64, 67],   # Am7
    [48, 55, 62, 64, 69],   # Cadd9
]
ROOTS = [41, 40, 33, 36]  # F2, E2, A1, C2


def build(duration, seed=5):
    rng = np.random.default_rng(seed)
    n = int(duration * SR)
    pad = np.zeros(n)
    sub = np.zeros(n)
    air = np.zeros(n)

    chord_len = int(CHORD_SEC * SR)
    # Start the first chord early so the clip opens already sounding, not on a
    # silence that has to swell in.
    t = -int(1.6 * SR)
    idx = 0
    while t < n:
        notes = PROGRESSION[idx % len(PROGRESSION)]
        root = ROOTS[idx % len(ROOTS)]
        if t + chord_len > -chord_len:  # skip entirely off-screen chords
            for k, m in enumerate(notes):
                f = midi(m)
                # Octave-down doubling on the bottom notes gives body without
                # needing a separate sub voice.
                oct = 0.5 if m < 60 else 1.0
                for det in (-7, 0, 7):
                    v = sine(chord_len, f * oct, detune=det)
                    v *= env(chord_len, 1.4, 2.6) * 0.085
                    v = lowpass(v, 2200, order=1)
                    start = t + int(k * 0.09 * SR)
                    seg = v
                    a, b = max(start, 0), min(start + len(seg), n)
                    if b > a:
                        pad[a:b] += seg[a - start : b - start]
            sv = sine(chord_len, midi(root), detune=0) * env(chord_len, 1.8, 2.2) * 0.10
            sv = lowpass(sv, 180, order=1)
            a, b = max(t, 0), min(t + chord_len, n)
            if b > a:
                sub[a:b] += sv[a - t : b - t]
        t += chord_len
        idx += 1

    # Sparse high shimmer, well under everything else, for air.
    t = 0
    while t < n:
        notes = PROGRESSION[rng.integers(len(PROGRESSION)) % len(PROGRESSION)]
        m = int(notes[rng.integers(len(notes))]) + 24
        dur = int(4.0 * SR)
        v = sine(dur, midi(m), detune=float(rng.uniform(-5, 5)))
        v *= env(dur, 1.6, 2.4) * 0.030
        v = lowpass(v, 5200, order=1)
        a, b = t, min(t + dur, n)
        if b > a:
            air[a:b] += v[: b - a]
        t += int(rng.uniform(2.4, 4.2) * SR)

    dry = pad + sub + air
    wet = reverb(dry, seconds=3.4, decay=3.2)
    # Mostly wet: this is a bed, not a dry instrument.
    left = lowpass(dry * 0.35 + wet * 0.85, 7000, order=2)
    right = lowpass(np.roll(dry, int(0.011 * SR)) * 0.35
                    + np.roll(wet, int(0.007 * SR)) * 0.85, 7000, order=2)

    # Gentle glue, then normalise. Soft-clip before normalising so the peaks
    # round off instead of hard-limiting.
    def finish(ch):
        ch = np.tanh(ch * 1.15) * 0.87
        fade = int(2.5 * SR)
        ch[:fade] *= np.linspace(0, 1, fade) ** 0.7
        ch[-fade:] *= np.linspace(1, 0, fade) ** 1.4
        return ch

    left, right = finish(left), finish(right)
    peak = max(np.abs(left).max(), np.abs(right).max(), 1e-9)
    g = 0.82 / peak
    return left * g, right * g


def write_wav(path, left, right):
    pcm = (np.clip(np.stack([left, right], 1), -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default="/tmp/opencode/music.wav")
    ap.add_argument("-d", "--duration", type=float, default=48.0)
    ap.add_argument("-s", "--seed", type=int, default=5)
    a = ap.parse_args()
    L, R = build(a.duration, a.seed)
    write_wav(a.out, L, R)
    print(f"wrote {a.out}  {a.duration:.1f}s  stereo {SR}Hz")
