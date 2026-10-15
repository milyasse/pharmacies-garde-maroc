"""Musique originale (libre de droits) pour la vidéo — 120 BPM, 27,5 s.
Timeline : 0-4 intro tendue (Am/F, riser) · 4 impact · 4-6 G · 6-22 groove C G Am F
· 22-23.5 montée (roulement) · 23.5 résolution C + cloche · fade-out.
"""
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
import wave, sys

SR = 44100
DUR = 27.5
N = int(SR * DUR)
BEAT = 0.5
rng = np.random.default_rng(7)

L = np.zeros(N); R = np.zeros(N)
padbus = np.zeros((2, N)); bassbus = np.zeros(N)

def t_(d): return np.arange(int(SR * d)) / SR
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, a, b, o=2): return sosfilt(butter(o, [a, b], 'band', fs=SR, output='sos'), x)

def add(buf, x, at, gain=1.0):
    i = int(at * SR)
    if i >= buf.shape[-1]: return
    x = x[..., : buf.shape[-1] - i]
    n = x.shape[-1]
    buf[..., i:i + n] += gain * x

def adsr(n, a, d, s, r):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    env = np.full(n, s, float)
    env[:a] = np.linspace(0, 1, a, endpoint=False) if a else env[:a]
    env[a:a + d] = np.linspace(1, s, len(env[a:a + d]))
    if r: env[-r:] *= np.linspace(1, 0, len(env[-r:]))
    return env

def saw(f, tt, ph=0.0):
    x = (tt * f + ph) % 1.0
    return 2 * x - 1

# ---------- chords ----------
CH = {
    'C': [48, 60, 64, 67, 72], 'G': [43, 59, 62, 67, 71], 'Am': [45, 60, 64, 69, 72],
    'F': [41, 60, 65, 69, 72],
}
ROOT = {'C': 36, 'G': 31, 'Am': 33, 'F': 29}
# (start, dur, chord)
prog = [(0, 2, 'Am'), (2, 2, 'F'), (4, 2, 'G')]
seq = ['C', 'G', 'Am', 'F']
for k in range(8):
    prog.append((6 + 2 * k, 2, seq[k % 4]))
prog.append((22, 1.5, 'G'))
prog.append((23.5, 4.0, 'C'))

def pad(chord, at, dur, cutoff, gain):
    tt = t_(dur + 0.6)
    outL = np.zeros(len(tt)); outR = np.zeros(len(tt))
    for m in CH[chord][1:]:
        f = hz(m)
        for j, det in enumerate([-0.12, -0.05, 0, 0.05, 0.12]):
            ph = rng.random()
            s = saw(f * 2 ** (det / 12), tt, ph)
            if j % 2: outL += s
            else: outR += s
            if j == 2: outL += s; outR += s
    env = adsr(len(tt), 0.25 if at < 6 else 0.05, 0.3, 0.8, 0.6)
    outL = lp(outL * env, cutoff); outR = lp(outR * env, cutoff)
    add(padbus, np.vstack([outL, outR]) / 18.0, at, gain)

for (st, du, ch) in prog:
    if st < 4: pad(ch, st, du, 900 + 400 * st, 0.55)
    elif st < 6: pad(ch, st, du, 2600, 0.6)
    elif st >= 23.5: pad(ch, st, du, 3200, 0.75)
    else: pad(ch, st, du, 3800, 0.42)

# ---------- bass ----------
def bassnote(m, at, dur, gain=0.55):
    tt = t_(dur)
    f = hz(m)
    x = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 2 * f * tt) + 0.2 * saw(f, tt)
    x = lp(np.tanh(1.6 * x), 900) * adsr(len(tt), 0.005, 0.08, 0.7, 0.05)
    add(bassbus, x, at, gain)

for (st, du, ch) in prog:
    if 6 <= st < 22:
        for e in range(int(du / 0.25)):
            if e % 2 == 1 or e == 0:
                bassnote(ROOT[ch] + (12 if e % 4 == 3 else 0), st + e * 0.25, 0.22)
    elif st == 4:
        bassnote(ROOT[ch], st, 2.0, 0.45)
    elif st >= 23.5:
        bassnote(ROOT[ch], st, 3.5, 0.6)

# ---------- pluck hook ----------
def pluck(m, at, gain=0.22, pan=0.0):
    tt = t_(0.5)
    f = hz(m)
    x = (np.sin(2 * np.pi * f * tt) * 0.7 + 0.3 * saw(f, tt) + 0.25 * np.sin(2 * np.pi * 2 * f * tt))
    x = lp(x * np.exp(-tt * 11), 5200)
    add(L, x * (1 - pan), at, gain); add(R, x * (1 + pan), at, gain)
    # écho ping-pong
    add(L, x * 0.35, at + 0.375, gain); add(R, x * 0.25, at + 0.75, gain)

pattern = [0, 1, 2, 1, 3, 2, 1, 2]
for (st, du, ch) in prog:
    tones = CH[ch][1:] + [CH[ch][1] + 12]
    if 4 <= st < 22:
        for e in range(int(du / 0.25)):
            if st < 6 and e % 2: continue
            m = tones[pattern[e % 8] % len(tones)] + 12
            pluck(m, st + e * 0.25, 0.2 if st >= 6 else 0.14, pan=0.3 if e % 2 else -0.3)
# intro : notes isolées "tic" (suspense)
for k, m in enumerate([76, 72, 76, 77, 76, 72, 74, 71]):
    pluck(m, 0.0 + k * 0.5, 0.10, pan=-0.4 if k % 2 else 0.4)

# ---------- batterie ----------
def kick(at, g=1.0):
    tt = t_(0.42)
    f = 46 + 110 * np.exp(-tt * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-tt * 7.5)
    x[:200] += rng.normal(0, 0.4, 200) * np.linspace(1, 0, 200)
    add(L, x, at, 0.9 * g); add(R, x, at, 0.9 * g)

def clap(at, g=1.0):
    tt = t_(0.3)
    n = rng.normal(0, 1, len(tt))
    env = np.zeros(len(tt))
    for o in (0, 0.011, 0.022):
        i = int(o * SR); env[i:] += np.exp(-np.arange(len(tt) - i) / SR * 60)
    env += 0.3 * np.exp(-tt * 14)
    x = bp(n * env, 900, 2600)
    add(L, x, at, 0.32 * g); add(R, x, at + 0.004, 0.32 * g)

def hat(at, g=1.0, open_=False):
    tt = t_(0.25 if open_ else 0.06)
    x = hp(rng.normal(0, 1, len(tt)), 7000) * np.exp(-tt * (12 if open_ else 70))
    add(L, x, at, 0.12 * g * 0.8); add(R, x, at, 0.12 * g * 1.2)

kicks = []
for b in range(int(6 / BEAT), int(22 / BEAT)):
    t0 = b * BEAT
    kick(t0); kicks.append(t0)
    if b % 2 == 1: clap(t0)
    hat(t0 + 0.25, open_=(b % 4 == 3))
    hat(t0, 0.5)
# roulement 22 → 23.5
for k in range(12):
    clap(22 + k * 0.125, 0.35 + 0.65 * k / 11)
kick(23.5, 1.2); kicks.append(23.5)
# battements de cœur dans l'intro
for t0 in (0.0, 0.25, 1.0, 1.25, 2.0, 2.25, 3.0, 3.25):
    kick(t0, 0.35 if (t0 * 4) % 2 == 0 else 0.22)

# ---------- effets ----------
def riser(at, dur, g=0.25):
    tt = t_(dur)
    n = rng.normal(0, 1, len(tt))
    out = np.zeros(len(tt))
    seg = 1024
    for i in range(0, len(tt), seg):
        fc = 400 + 7000 * (i / len(tt)) ** 2
        out[i:i + seg] = bp(n[max(0, i - 4096):i + seg], fc * 0.7, min(fc * 1.3, 20000))[-len(out[i:i + seg]):]
    out *= np.linspace(0, 1, len(tt)) ** 2
    add(L, out, at, g); add(R, out, at, g)

def impact(at, g=0.9):
    tt = t_(2.2)
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-tt * 6)) * tt) * np.exp(-tt * 2.2)
    crash = hp(rng.normal(0, 1, len(tt)), 4000) * np.exp(-tt * 2.6) * 0.35
    add(L, boom + crash, at, g); add(R, boom + crash * 0.9, at, g)

def whoosh(at, g=0.18):
    tt = t_(0.35)
    n = rng.normal(0, 1, len(tt))
    x = bp(n, 1500, 6000) * np.sin(np.pi * tt / 0.35) ** 2
    add(L, x, at - 0.17, g); add(R, x, at - 0.15, g)

def bell(at, m, g=0.25):
    tt = t_(3.0)
    f = hz(m)
    x = sum(a * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * d)
            for a, r, d in [(1, 1, 1.4), (0.5, 2.0, 2.2), (0.3, 3.01, 3.0), (0.2, 4.2, 4.5)])
    add(L, x, at, g); add(R, x, at + 0.01, g)

def pop(at, m, g=0.22):
    tt = t_(0.18)
    f = hz(m) * (1 + 0.6 * np.exp(-tt * 40))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 22)
    add(L, x, at, g); add(R, x, at, g)

riser(1.6, 2.4)
impact(4.0)
bell(4.0, 84, 0.18)
for c in (6, 9, 11.5, 13, 14.5, 17, 19.5, 21.5):
    whoosh(c)
for k, at in enumerate((21.6, 22.1, 22.6)):
    pop(at, 79 + 3 * k)
riser(22.2, 1.3, 0.18)
impact(23.5, 0.75)
bell(23.5, 84, 0.3); bell(23.62, 88, 0.2); bell(23.74, 91, 0.16)

# ---------- sidechain + mix ----------
duck = np.ones(N)
for k0 in kicks:
    i = int(k0 * SR); n = int(0.3 * SR)
    seg = 1 - 0.65 * np.exp(-np.arange(n) / SR * 14)
    duck[i:i + n] = np.minimum(duck[i:i + n], seg[: len(duck[i:i + n])])
padbus *= duck
bassbus *= duck

# réverbe (IR synthétique)
irt = t_(1.8)
ir = rng.normal(0, 1, (2, len(irt))) * np.exp(-irt * 3.2)
ir[:, : int(0.02 * SR)] = 0
ir /= np.abs(ir).sum(axis=1, keepdims=True) / 18
wetsrc = padbus * 0.6 + np.vstack([L, R]) * 0.25
wet = np.vstack([fftconvolve(wetsrc[0], ir[0])[:N], fftconvolve(wetsrc[1], ir[1])[:N]])

mix = np.vstack([L, R]) + padbus + bassbus + wet * 0.35
mix[0] = hp(mix[0], 28); mix[1] = hp(mix[1], 28)
# fades
fi = int(0.05 * SR); mix[:, :fi] *= np.linspace(0, 1, fi)
fo_start = int(25.3 * SR); mix[:, fo_start:] *= np.linspace(1, 0, N - fo_start) ** 1.5
mix = np.tanh(mix * 1.3)
mix /= np.abs(mix).max() / 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix.T * 32767).astype('<i2').tobytes())
print('ok', out, DUR)
