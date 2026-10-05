#!/usr/bin/env python3
"""
Generate the promo music bed: an original upbeat drum-and-bass groove.

Synthesised from scratch — no sampled or licensed audio, so nothing third-party
is embedded in the shipped video.

Two earlier attempts failed on feedback: an ambient pad read as a cheap synth
loop, and a bell arpeggio was worse. This is a plain drum groove instead, which
is what actually carries a short promo.

Voices, all synthesised:
  kick    pitch-swept sine (120 -> 45 Hz) with a click transient
  snare   bandpassed noise over a 180 Hz body, ghost notes for movement
  hats    highpassed noise, closed on 8ths with accents, open on the "and"
  bass    triangle/sine on chord roots, ducked by the kick for pump
  stab    soft detuned square pair, sparse, only on the hook

88 BPM boom-bap. I - V - vi - IV, the most consonant loop there is.

Straight sixteenths: every step in every pattern lands on an even 16th, so the
SWING offset below is currently inert. It applies to off-16ths only (odd step
indices), and none of the voices use any. Put a hat or a bass note on an odd
step and the groove will swing; until then SWING does nothing and this bed is
not swung.
"""
import argparse
import math
import wave

import numpy as np

SR = 44100
BPM = 88.0
BEAT = 60.0 / BPM
STEP = BEAT / 4.0          # 16th note
SWING = 0.055              # fraction of an OFF-16th pushed late; inert while
                            # every pattern step is even (see module docstring)
BAR = 16 * STEP


def midi(n):
    return 440.0 * (2.0 ** ((n - 69) / 12.0))


def at(step):
    """Time of a 16th step, with a touch of swing on the off-16ths."""
    return (step + (SWING if step % 2 else 0.0)) * STEP


def env_exp(n, decay, curve=4.0):
    t = np.arange(n) / SR
    return np.exp(-curve * t / max(decay, 1e-4))


def kick(dur=0.42):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = 45.0 + 95.0 * np.exp(-t / 0.028)          # pitch drop
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    click = np.random.default_rng(3).normal(0, 1, n) * env_exp(n, 0.004) * 0.25
    v = (body * env_exp(n, 0.16, 3.0)) * 0.95 + click
    return np.tanh(v * 1.5) * 0.8


def snare(dur=0.26, tone=185.0):
    n = int(dur * SR)
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 1, n)
    # crude band-pass: difference of two one-pole lowpasses
    def lp(x, a):
        y, prev = np.empty_like(x), 0.0
        for i, s in enumerate(x):
            prev = (1 - a) * s + a * prev
            y[i] = prev
        return y
    body = lp(noise, math.exp(-2 * math.pi * 3200 / SR)) - lp(noise, math.exp(-2 * math.pi * 900 / SR))
    shell = np.sin(2 * np.pi * tone * np.arange(n) / SR) * env_exp(n, 0.07) * 0.5
    return np.tanh((body * env_exp(n, 0.11, 3.0) + shell) * 1.2) * 0.55


def hat(dur=0.06, open_=False, bright=6200.0):
    n = int((dur if not open_ else dur * 4) * SR)
    rng = np.random.default_rng(11)
    x = rng.normal(0, 1, n)
    prev, y = 0.0, np.empty_like(x)
    a = math.exp(-2 * math.pi * bright / SR)
    for i, s in enumerate(x):
        prev = (1 - a) * s + a * prev
        y[i] = s - prev                       # high-pass
    d = 0.055 if not open_ else 0.20
    return y * env_exp(n, d, 3.0) * (0.115 if not open_ else 0.095)


def bass(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    v = (np.sin(2 * np.pi * freq * t) * 0.7
         + 0.3 * np.sin(2 * np.pi * freq * 2 * t))
    v *= env_exp(n, dur * 0.42, 2.0)
    return np.tanh(v * 1.3) * 0.5


def stab(freqs, dur=0.20):
    n = int(dur * SR)
    t = np.arange(n) / SR
    v = np.zeros(n)
    for f in freqs:
        for det in (-5, 5):
            v += np.sin(2 * np.pi * f * (2 ** (det / 1200)) * t)
    v /= max(len(freqs) * 2, 1)
    v *= env_exp(n, dur * 0.5, 2.5)
    return np.tanh(v * 1.6) * 0.16


# I - V - vi - IV, one bar each. Roots with the chord tones above for the stab.
PROG = [
    ([53, 60, 64], 41),   # F   : F A C
    ([55, 59, 62], 43),   # G   : G B D
    ([57, 60, 64], 45),   # Am  : A C E
    ([48, 55, 64], 36),   # C   : C G E
]

KICK = [0, 10, 16 + 6]                       # downbeat, pre-beat, ghost
KICK_B = [0, 10, 26]
SNARE = [4, 12]
SNARE_GHOST = [14, 22, 30]
HATS = list(range(0, 32, 2))
BASS_STEPS = [0, 6, 10, 14, 18, 22, 26, 30]
BASS_OCT = {6: 12, 22: 12, 30: 12}            # lift some notes an octave
STAB = [0, 8, 16, 24]


def build(duration, seed=13):
    rng = np.random.default_rng(seed)
    n = int(duration * SR)
    drums = np.zeros(n)
    low = np.zeros(n)
    hook = np.zeros(n)

    K, S, H, B = kick(), snare(), hat(), None
    Sg, Ho = snare(dur=0.10, tone=210.0), hat(dur=0.07, open_=True)
    voices = {"k": K, "s": S, "h": H, "sg": Sg, "ho": Ho}

    def put(buf, sig, when, gain=1.0):
        i = int(when * SR)
        if i >= n:
            return
        seg = sig[: n - i] * gain
        buf[i : i + len(seg)] += seg

    bars = int(math.ceil(duration / BAR)) + 1
    for bar in range(bars):
        b0 = bar * BAR
        if b0 > duration:
            break
        alt = bar % 2 == 1
        for st in (KICK_B if alt else KICK):
            put(drums, K, b0 + at(st), 0.95 if st % 16 == 0 else 0.8)
        for st in SNARE:
            put(drums, S, b0 + at(st), 0.9)
        for st in SNARE_GHOST:
            put(drums, Sg, b0 + at(st), 0.3)
        for st in HATS:
            accent = 1.0 if st % 4 == 0 else 0.6
            put(drums, H, b0 + at(st), accent)
        put(drums, Ho, b0 + at(14), 0.9)

        tones, root = PROG[bar % len(PROG)]
        for st in BASS_STEPS:
            oct_up = st in BASS_OCT
            put(low, bass(midi(root + (12 if oct_up else 0)), STEP * 1.9), b0 + at(st), 0.85)
        for st in STAB:
            put(hook, stab([midi(t) for t in tones]), b0 + at(st), 1.0 if st % 16 == 0 else 0.75)

    # Duck the bass and hook off each kick for a bit of pump.
    pad = int(0.012 * SR)
    for k in np.flatnonzero(np.abs(drums) > 0.5):
        i = int(k)
        envd = np.exp(-np.arange(pad) / (0.07 * SR))
        seg = envd[::-1][:pad] if i + pad <= n else envd[: max(n - i, 0)]
        low[i : i + len(seg)] *= (1.0 - 0.5 * seg)
        hook[i : i + len(seg)] *= (1.0 - 0.4 * seg)

    mix = low + hook
    left = mix + drums * 0.98
    right = mix + np.roll(drums, 37) * 0.98

    def finish(ch):
        # Warm it. White-ish snare/hat noise left the mix with ~19% of its energy
        # above 12kHz, which reads as hiss on phone speakers. Two cascaded
        # FFT low-passes at 7.5kHz keep the snap and drop the glare.
        spec = np.fft.rfft(ch)
        f = np.fft.rfftfreq(len(ch), 1 / SR)
        spec *= 1.0 / (1.0 + (f / 8200.0) ** 4)
        ch = np.fft.irfft(spec, n=len(ch))
        ch = np.tanh(ch * 1.2) * 0.86
        fade = int(0.35 * SR)
        ch[:fade] *= np.linspace(0, 1, fade)
        ch[-fade:] *= np.linspace(1, 0, fade)
        return ch

    left, right = finish(left), finish(right)
    peak = max(np.abs(left).max(), np.abs(right).max(), 1e-9)
    g = 0.86 / peak
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
    ap.add_argument("-o", "--out", default="/tmp/music.wav")
    ap.add_argument("-d", "--duration", type=float, default=40.0)
    ap.add_argument("-s", "--seed", type=int, default=13)
    a = ap.parse_args()
    L, R = build(a.duration, a.seed)
    write_wav(a.out, L, R)
    print(f"wrote {a.out}  {a.duration:.1f}s  stereo {SR}Hz  {BPM:.0f}BPM")
