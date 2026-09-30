#!/usr/bin/env python3
"""
Generate an original, royalty-free music bed for the Syft Learning promo video.

Everything here is synthesised from scratch, so there are no licensing questions
and no third-party rights attached to the output. Swap in a licensed track by
passing --music to make-promo-video.py; nothing downstream depends on this file.

Design: warm, optimistic, unhurried. 84 BPM, Fmaj7 - C - G - Am. Sine/triangle
pad stack, bell arpeggio, soft kick + shaker, rounded by a light soft-clip and
a short stereo delay. Deliberately sparse - it sits under voiceover/captions
and must not compete with them.
"""
import argparse
import math
import struct
import wave

import numpy as np

SR = 44100
BPM = 84.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT


def midi(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def adsr(n, a, d, s, r, sus=0.7):
    """Sample-accurate ADSR over n samples. a/d/r in seconds, s is sustain level."""
    na, nd, nr = int(a * SR), int(d * SR), int(r * SR)
    na = max(na, 1)
    ns = max(n - na - nd - nr, 0)
    parts = [
        np.linspace(0, 1, na, endpoint=False),
        np.linspace(1, s, max(nd, 1), endpoint=False)[: max(n - na - nd - nr, 0) or max(nd, 1)],
        np.full(ns, s),
        np.linspace(s, 0, max(nr, 1), endpoint=False),
    ]
    env = np.concatenate([p for p in parts if p.size])[:n]
    if env.size < n:
        env = np.pad(env, (0, n - env.size))
    return env


def osc(freq, n, kind="sine", detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    f = freq * (2.0 ** (detune / 1200.0))
    p = 2 * np.pi * f * t + phase
    if kind == "sine":
        return np.sin(p)
    if kind == "tri":
        return 2 / np.pi * np.arcsin(np.sin(p))
    if kind == "saw":  # band-limited-ish via additive rolloff
        out = np.zeros(n)
        for k in range(1, 12):
            out += np.sin(p * k) / (k**1.7)
        return out * 0.7
    raise ValueError(kind)


def lowpass(x, cutoff):
    """One-pole lowpass, cheap and stable."""
    a = math.exp(-2 * math.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(0, len(x), 4096):  # blockwise approximation via lfilter
        chunk = x[i : i + 4096]
        # vectorised IIR using lfilter-style recursion
        out = np.empty_like(chunk)
        prev = acc
        for j, v in enumerate(chunk):
            prev = (1 - a) * v + a * prev
            out[j] = prev
        y[i : i + 4096] = out
        acc = prev
    return y


def lowpass_fast(x, cutoff):
    """Same as lowpass() but vectorised via FFT brickwall-ish smoothing."""
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / SR)
    spec *= 1.0 / (1.0 + (freqs / cutoff) ** 4)  # 4th-order rolloff
    return np.fft.irfft(spec, n=len(x))


def add(buf, sig, at):
    i = int(at * SR)
    if i >= len(buf):
        return
    seg = sig[: len(buf) - i]
    buf[i : i + len(seg)] += seg


def build(duration_s, seed=7):
    rng = np.random.default_rng(seed)
    n = int(duration_s * SR)
    pad = np.zeros(n)
    arp = np.zeros(n)
    bass = np.zeros(n)
    drums = np.zeros(n)

    # Fmaj7 - C - G - Am, two bars each.
    chords = [
        ([53, 57, 60, 64], 41),  # Fmaj7 / F
        ([48, 52, 55, 59], 36),  # C  (C3 root, 48+... use 48)
        ([55, 59, 62, 67], 43),  # G
        ([57, 60, 64, 69], 45),  # Am
    ]
    bars = int(math.ceil(duration_s / BAR))
    for b in range(bars):
        t0 = b * BAR
        notes, root = chords[b % 4]
        if t0 > duration_s:
            break
        # --- pad: detuned triangle stack, long attack, whole bar
        dur = BAR * 0.98
        L = int(dur * SR)
        for k, m in enumerate(notes):
            f = midi(m)
            voice = (
                osc(f, L, "tri", detune=-6)
                + osc(f, L, "tri", detune=+6)
                + 0.5 * osc(f * 2, L, "sine")
            ) / 2.5
            voice *= adsr(L, 0.35, 0.25, 0.72, 0.5) * 0.11
            voice = lowpass_fast(voice, 2200)
            add(pad, voice, t0 + k * 0.012)
        # --- bass root on 1 and the "and of 3"
        for beat in (0.0, 2.5):
            L = int(1.1 * SR)
            v = osc(midi(root), L, "sine") * adsr(L, 0.01, 0.25, 0.5, 0.4) * 0.26
            add(bass, v, t0 + beat * BEAT)
        # --- bell arpeggio in 8ths, gentle
        seq = [notes[0], notes[2], notes[1], notes[3], notes[2], notes[1], notes[3], notes[0]]
        for i, m in enumerate(seq):
            at = t0 + i * 0.5 * BEAT
            if at > duration_s:
                break
            L = int(0.9 * SR)
            f = midi(m + 12)
            v = (osc(f, L, "sine") + 0.25 * osc(f * 3.01, L, "sine")) * adsr(
                L, 0.004, 0.5, 0.16, 0.35
            )
            v *= 0.085 * (0.75 + 0.25 * ((i % 4) == 0))
            add(arp, v, at)
        # --- soft kick + shaker
        for beat in (0.0, 2.0):
            L = int(0.32 * SR)
            f = np.linspace(120, 45, L)
            kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * adsr(L, 0.002, 0.1, 0.0, 0.2)
            add(drums, kick, t0 + beat * BEAT) if False else None
            k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-np.linspace(0, 9, L)) * 0.5
            add(drums, k, t0 + beat * BEAT)
        for i in range(8):
            at = t0 + i * 0.5 * BEAT
            if at > duration_s:
                break
            L = int(0.09 * SR)
            noise = rng.normal(0, 1, L)
            sh = lowpass_fast(noise, 6500) * np.exp(-np.linspace(0, 7, L)) * 0.06
            if i % 2 == 0:
                sh *= 1.5
            add(drums, sh, at)

    mix = pad + arp + bass + drums

    # short stereo delay for width
    dly = int(0.19 * SR)
    wet = np.zeros_like(mix)
    wet[dly:] = mix[:-dly] * 0.22
    left = mix + wet
    right = np.roll(mix, int(0.07 * SR)) + np.roll(wet, int(0.05 * SR))

    # gentle glue + soft clip
    def finish(ch):
        ch = lowpass_fast(ch, 9000)
        ch = np.tanh(ch * 1.25) * 0.8
        fade = int(2.0 * SR)
        ch[:fade] *= np.linspace(0, 1, fade)
        ch[-fade:] *= np.linspace(1, 0, fade)
        return ch

    peak = max(np.abs(left).max(), np.abs(right).max(), 1e-9)
    gain = 0.89 / peak
    return (left * gain, right * gain)


def write_wav(path, left, right):
    data = np.stack([left, right], axis=1)
    pcm = np.clip(data, -1, 1)
    pcm = (pcm * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default="/tmp/opencode/music.wav")
    ap.add_argument("-d", "--duration", type=float, default=48.0)
    ap.add_argument("-s", "--seed", type=int, default=7)
    a = ap.parse_args()
    L, R = build(a.duration, a.seed)
    write_wav(a.out, L, R)
    print(f"wrote {a.out}  {a.duration:.1f}s  stereo {SR}Hz")
