"""Vidéo commerciale animée — rendu image par image (Pillow) synchronisé sur music.wav (120 BPM).
Usage : python3 anim.py <out.mp4> [--preview t1,t2,...]
"""
import math, subprocess, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = '/mnt/user-data/uploads/ScreenRecording_10-14-2026_23-18-56_1_1.mov'
STOCK = '/home/claude/pharmacies-garde-maroc/marketing/stock/6456.mp4'
W, H, FPS, DUR = 1080, 1350, 30, 27.5
NF = int(DUR * FPS)
G = (11, 93, 59); G2 = (6, 52, 33); LG = (93, 187, 99); WH = (255, 255, 255); SOFT = (200, 232, 212)
FD = '/usr/share/fonts/opentype/inter/'
def F(sz, w='ExtraBold'): return ImageFont.truetype(FD + f'Inter-{w}.otf', sz)

# ---------- easing ----------
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def prog(t, t0, d): return clamp((t - t0) / d)
def eo3(x): return 1 - (1 - x) ** 3
def ei3(x): return x ** 3
def eob(x, s=1.70158): x -= 1; return x * x * ((s + 1) * x + s) + 1
def eio(x): return 3 * x * x - 2 * x * x * x

# ---------- helpers ----------
def mark(size, fg=WH, cross=G):
    S = 4; im = Image.new('RGBA', (120 * S, 120 * S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    c = (60 * S, 53 * S); r = 48 * S; tip = (60 * S, 114 * S); th = math.acos(r / (tip[1] - c[1])); base = math.pi / 2
    pts = [(c[0] + r * math.cos(base - th - (2 * math.pi - 2 * th) * i / 120), c[1] + r * math.sin(base - th - (2 * math.pi - 2 * th) * i / 120)) for i in range(121)] + [tip]
    d.polygon(pts, fill=fg); d.rectangle([52 * S, 29 * S, 68 * S, 77 * S], fill=cross); d.rectangle([36 * S, 45 * S, 84 * S, 61 * S], fill=cross)
    return im.resize((size, size), Image.LANCZOS)

def text_img(txt, font, fill, pad=8, stroke=0, shadow=True):
    d = ImageDraw.Draw(Image.new('L', (1, 1)))
    bb = d.textbbox((0, 0), txt, font=font)
    w, h = bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad
    im = Image.new('RGBA', (w + 30, h + 30), (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).text((pad - bb[0] + 15, pad - bb[1] + 21), txt, font=font, fill=(0, 0, 0, 120))
        im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(9)))
    ImageDraw.Draw(im).text((pad - bb[0] + 15, pad - bb[1] + 15), txt, font=font, fill=fill)
    return im

def paste_c(canvas, im, cx, cy, scale=1.0, alpha=1.0, rot=0.0):
    """Colle im centré en (cx,cy) avec échelle/alpha/rotation."""
    if alpha <= 0.003 or scale <= 0.01: return
    if abs(scale - 1) > 0.002:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    if rot: im = im.rotate(rot, Image.BICUBIC, expand=True)
    if alpha < 0.999:
        a = im.getchannel('A').point(lambda v: int(v * alpha)); im = im.copy(); im.putalpha(a)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2))) if 0 <= int(cx - im.width / 2) and 0 <= int(cy - im.height / 2) and int(cx - im.width / 2) + im.width <= W and int(cy - im.height / 2) + im.height <= H else canvas.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)

def ring(canvas, cx, cy, r, width, alpha, color=(160, 230, 175)):
    if alpha <= 0: return
    l = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(l).ellipse([cx - r, cy - r, cx + r, cy + r], outline=color + (int(255 * alpha),), width=int(width))
    canvas.alpha_composite(l)

# ---------- fonds ----------
def make_bg():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=tuple(int(G[i] * (1 - t) + G2[i] * t) for i in range(3)))
    glow = Image.new('L', (W, H), 0); ImageDraw.Draw(glow).ellipse([W / 2 - 460, H / 2 - 520, W / 2 + 460, H / 2 + 420], fill=90); glow = glow.filter(ImageFilter.GaussianBlur(160))
    im = Image.composite(Image.new('RGB', (W, H), (40, 150, 95)), im, glow)
    return im.convert('RGBA')
BG = make_bg()
CROSS = Image.new('RGBA', (W, H + 240), (0, 0, 0, 0)); dc = ImageDraw.Draw(CROSS)
for yy in range(40, H + 240, 120):
    for xx in range(40 + (60 if (yy // 120) % 2 else 0), W, 120):
        dc.rectangle([xx - 1, yy - 7, xx + 1, yy + 7], fill=(255, 255, 255, 16)); dc.rectangle([xx - 7, yy - 1, xx + 7, yy + 1], fill=(255, 255, 255, 16))
GLOW = Image.new('L', (W, H), 0); ImageDraw.Draw(GLOW).ellipse([W / 2 - 380, H / 2 - 420, W / 2 + 380, H / 2 + 380], fill=255); GLOW = GLOW.filter(ImageFilter.GaussianBlur(150))
GLOWC = Image.new('RGBA', (W, H), (90, 210, 130, 0))
VIG = Image.new('L', (W, H), 0); ImageDraw.Draw(VIG).ellipse([-260, -200, W + 260, H + 200], fill=255); VIG = VIG.filter(ImageFilter.GaussianBlur(170))
VIGL = Image.new('RGBA', (W, H), (0, 0, 0, 255)); VIGL.putalpha(VIG.point(lambda v: int((255 - v) * 0.75)))

def beat_pulse(t):
    """1 au temps fort, décroît en 0,35 s (groove 6 → 22 s)."""
    if t < 6 or t >= 22: return 0.0
    ph = (t - 6) % 0.5
    return math.exp(-ph * 9)

def green_bg(t, drift=True):
    c = BG.copy()
    off = int((t * 18) % 120) if drift else 0
    c.alpha_composite(CROSS.crop((0, off, W, off + H)))
    p = 0.10 + 0.16 * beat_pulse(t)
    g = GLOWC.copy(); g.putalpha(GLOW.point(lambda v: int(v * p))); c.alpha_composite(g)
    return c

# ---------- médias ----------
def read_frames(src, ss, dur, n, w, h, crop=None):
    k = dur / (n / FPS)
    vf = f"setpts=(PTS-STARTPTS)/{k:.5f},fps={FPS},scale={w}:{h}:flags=lanczos" if not crop else \
         f"setpts=(PTS-STARTPTS)/{k:.5f},fps={FPS},scale=-2:{h}:flags=lanczos,crop={w}:{h}"
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(ss), '-t', str(dur + 0.2), '-i', src, '-an', '-vf', vf,
           '-frames:v', str(n), '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    arr = np.frombuffer(raw, np.uint8).reshape(-1, h, w, 3)
    fr = [Image.fromarray(a) for a in arr]
    while len(fr) < n: fr.append(fr[-1])
    return fr

SW, SH, R = 512, 1030, 48
print('lecture des clips…', flush=True)
# (début vidéo, fin vidéo, [(src_debut, src_duree, n_images)])
SEG = [
    (6.0, 9.0, [(0.5, 4.5, 90)]),
    (9.0, 11.5, [(18.5, 3.5, 75)]),
    (11.5, 14.5, [(31.3, 2.0, 45), (48.5, 2.0, 45)]),
    (14.5, 17.0, [(53.8, 2.4, 75)]),
    (17.0, 19.5, [(80.0, 5.0, 75)]),
    (19.5, 21.5, [(111.5, 4.5, 75)]),
]
CLIPF = []  # liste globale d'images d'écran indexée par image vidéo depuis 6.0 s
for (a, b, parts) in SEG:
    for (ss, du, n) in parts:
        CLIPF.extend(read_frames(SRC, ss, du, n, SW, SH))
STOCKF = read_frames(STOCK, 0.3, 4.4, 132, W, H, crop=True)
print('clips ok', len(CLIPF), len(STOCKF), flush=True)

# ---------- téléphone ----------
PAD = 70
PH = Image.new('RGBA', (SW + 2 * PAD, SH + 2 * PAD), (0, 0, 0, 0))
sh = Image.new('RGBA', PH.size, (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([PAD - 16, PAD + 14, PAD + SW + 16, PAD + SH + 40], radius=R + 16, fill=(0, 0, 0, 150))
PH.alpha_composite(sh.filter(ImageFilter.GaussianBlur(30)))
dp = ImageDraw.Draw(PH)
dp.rounded_rectangle([PAD - 14, PAD - 14, PAD + SW + 14, PAD + SH + 14], radius=R + 14, fill=(12, 22, 17))
dp.rounded_rectangle([PAD - 14, PAD - 14, PAD + SW + 14, PAD + SH + 14], radius=R + 14, outline=(70, 105, 84), width=2)
SMASK = Image.new('L', (SW, SH), 0); ImageDraw.Draw(SMASK).rounded_rectangle([0, 0, SW - 1, SH - 1], radius=R, fill=255)
# reflet balayant
SHEEN = Image.new('L', (SW, SH), 0)

def phone_img(screen, sheen_x=None):
    p = PH.copy()
    scr = screen.convert('RGBA')
    if sheen_x is not None:
        l = Image.new('L', (SW, SH), 0); ImageDraw.Draw(l).polygon([(sheen_x, 0), (sheen_x + 90, 0), (sheen_x - 210, SH), (sheen_x - 300, SH)], fill=70)
        l = l.filter(ImageFilter.GaussianBlur(18))
        white = Image.new('RGBA', (SW, SH), (255, 255, 255, 0)); white.putalpha(l); scr.alpha_composite(white)
    p.paste(scr, (PAD, PAD), SMASK)
    return p

# ---------- éléments texte ----------
T_MIN = text_img('Minuit.', F(124), WH)
T_FIE = text_img('Fièvre.', F(124), LG)
Q_WORDS = ['Quelle', 'pharmacie', 'est', 'ouverte', '?']
Q_IMG = [text_img(w_, F(74, 'Bold'), WH) for w_ in Q_WORDS]
CLOCK = text_img('00:07', F(40, 'SemiBold'), (220, 240, 228))

LOGO_B = mark(190)
NAME_W = ['Pharmacies', 'de', 'Garde', 'Maroc']
NAME_I = [text_img(w_, F(70), WH) for w_ in NAME_W]
SUB_I = text_img('Trouvez la garde la plus proche.', F(40, 'SemiBold'), SOFT)

CAPS = ['Les gardes du jour, ville par ville', 'Classées de la plus proche à la plus loin', 'Un vrai itinéraire vers chaque pharmacie',
        'Appeler ou y aller en un geste', 'Et les gardes des jours suivants', 'Rabat · Salé · Témara']
def pill(i, c):
    f = F(44); d = ImageDraw.Draw(Image.new('L', (1, 1))); tw = d.textlength(c, font=f)
    bw = int(tw + 70 + 56); im = Image.new('RGBA', (bw + 40, 132), (0, 0, 0, 0))
    sh_ = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh_).rounded_rectangle([20, 26, 20 + bw, 26 + 90], radius=45, fill=(0, 0, 0, 90))
    im.alpha_composite(sh_.filter(ImageFilter.GaussianBlur(10)))
    d = ImageDraw.Draw(im); x, y = 20, 18
    d.rounded_rectangle([x, y, x + bw, y + 90], radius=45, fill=(255, 255, 255, 245))
    d.ellipse([x + 17, y + 17, x + 73, y + 73], fill=G); n = str(i + 1); fn = F(30); d.text((x + 45 - d.textlength(n, font=fn) / 2, y + 25), n, font=fn, fill=WH)
    d.text((x + 90, y + 19), c, font=f, fill=G)
    return im
PILLS = [pill(i, c) for i, c in enumerate(CAPS)]
BRAND_SMALL = Image.new('RGBA', (520, 50), (0, 0, 0, 0))
_m = mark(34); BRAND_SMALL.paste(_m, (0, 8), _m); ImageDraw.Draw(BRAND_SMALL).text((46, 12), 'Pharmacies de Garde Maroc', font=F(24, 'Bold'), fill=SOFT)

BEN = ['Gratuit.', 'Sans compte.', 'Installable.']
def ben_img(txt):
    f = F(88); d = ImageDraw.Draw(Image.new('L', (1, 1))); tw = d.textlength(txt, font=f)
    w_ = int(tw + 150); im = Image.new('RGBA', (w_ + 40, 170), (0, 0, 0, 0))
    sh_ = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(sh_).rounded_rectangle([20, 34, 20 + w_, 34 + 124], radius=62, fill=(0, 0, 0, 100))
    im.alpha_composite(sh_.filter(ImageFilter.GaussianBlur(12)))
    d = ImageDraw.Draw(im); d.rounded_rectangle([20, 20, 20 + w_, 144], radius=62, fill=WH)
    # coche
    cx, cy = 20 + 66, 82; d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=G)
    d.line([(cx - 16, cy + 1), (cx - 4, cy + 13), (cx + 18, cy - 12)], fill=WH, width=9, joint='curve')
    d.text((20 + 122, 26), txt, font=f, fill=G)
    return im
BEN_I = [ben_img(b) for b in BEN]

O_LOGO = mark(200)
O_NAME = text_img('Pharmacies de Garde Maroc', F(66), WH)
O_TAG1 = text_img('La pharmacie de garde la plus proche,', F(40, 'SemiBold'), SOFT)
O_TAG2 = text_img('en quelques secondes.', F(40, 'SemiBold'), SOFT)
def chip(txt):
    f = F(36, 'Bold'); d = ImageDraw.Draw(Image.new('L', (1, 1))); w_ = int(d.textlength(txt, font=f) + 80)
    im = Image.new('RGBA', (w_, 78), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w_ - 1, 77], radius=39, fill=WH); d.text((40, 18), txt, font=f, fill=G); return im
O_CHIPS = [chip(c) for c in ['Gratuit', 'Sans compte', 'Installable']]
O_CITIES = text_img('Rabat · Salé · Témara', F(46, 'Bold'), LG)
O_NOTE = text_img('Informations issues de sources publiques, vérifiées et datées.', F(26, 'Medium'), (170, 210, 188), shadow=False)

# ---------- scènes ----------
def scene_intro(t):
    i = min(int(t * FPS), len(STOCKF) - 1)
    z = 1.0 + 0.10 * (t / 4.0)
    fr = STOCKF[i]
    if z > 1.001:
        cw, ch = int(W / z), int(H / z); fr = fr.crop(((W - cw) // 2, (H - ch) // 2, (W - cw) // 2 + cw, (H - ch) // 2 + ch)).resize((W, H), Image.BICUBIC)
    # étalonnage : sombre + teinte verte nuit
    a = np.asarray(fr).astype(np.float32) / 255.0
    lum = a.mean(axis=2, keepdims=True)
    a = 0.55 * a + 0.45 * lum
    a = a * np.array([0.62, 0.80, 0.70]) * 0.78 + np.array([0.01, 0.05, 0.035])
    c = Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8)).convert('RGBA')
    c.alpha_composite(VIGL)
    # horloge
    pc = prog(t, 0.15, 0.4); paste_c(c, CLOCK, W / 2, 300, 1.0, eo3(pc) * (1 - prog(t, 3.5, 0.3)))
    # Minuit. / Fièvre. (pop sur les battements)
    up = eo3(prog(t, 2.0, 0.5)) * 70
    for img, t0, y in ((T_MIN, 0.5, 520), (T_FIE, 1.0, 650)):
        p = prog(t, t0, 0.35)
        if p > 0:
            s = 1.6 - 0.6 * eob(p, 2.2); paste_c(c, img, W / 2, y - up, s, clamp(p * 2.5) * (1 - prog(t, 3.55, 0.3)))
    # question mot à mot
    f = F(74, 'Bold'); d = ImageDraw.Draw(Image.new('L', (1, 1)))
    lines = [Q_WORDS[:2], Q_WORDS[2:]]
    k = 0
    for li, words in enumerate(lines):
        ws = [d.textlength(w_, font=f) for w_ in words]; sp = 22; tot = sum(ws) + sp * (len(ws) - 1); x = (W - tot) / 2
        for w_, wl in zip(words, ws):
            p = prog(t, 2.1 + 0.16 * k, 0.4)
            if p > 0:
                img = Q_IMG[Q_WORDS.index(w_)] if w_ != '?' else Q_IMG[4]
                col_img = img
                paste_c(c, col_img, x + wl / 2, 780 + li * 96 + (1 - eo3(p)) * 60, 1.0, eo3(p) * (1 - prog(t, 3.6, 0.25)))
            x += wl + sp; k += 1
    # flash avant l'impact
    fl = prog(t, 3.75, 0.25)
    if fl > 0:
        c.alpha_composite(Image.new('RGBA', (W, H), (215, 245, 225, int(255 * ei3(fl)))))
    return c

def scene_brand(t):
    c = green_bg(t)
    lt = t - 4.0
    # flash qui retombe
    fl = 1 - prog(lt, 0, 0.35)
    # logo pop + anneaux
    p = prog(lt, 0.0, 0.55)
    out = eio(prog(lt, 1.4, 0.3))
    yshift = -out * 220
    for k in range(2):
        rp = prog(lt, 0.05 + 0.15 * k, 0.9)
        if 0 < rp < 1: ring(c, W / 2, 520 + yshift, 90 + 380 * eo3(rp), 6 - 3 * rp, (1 - rp) * 0.8)
    paste_c(c, LOGO_B, W / 2, 520 + yshift, eob(p, 2.6) if p < 1 else 1.0, clamp(p * 3) * (1 - out))
    # nom mot à mot
    f = F(70); d = ImageDraw.Draw(Image.new('L', (1, 1)))
    ws = [d.textlength(w_, font=f) for w_ in NAME_W]; sp = 20; tot = sum(ws) + sp * 3; x = (W - tot) / 2
    for k, (img, wl) in enumerate(zip(NAME_I, ws)):
        pp = prog(lt, 0.3 + 0.09 * k, 0.45)
        paste_c(c, img, x + wl / 2, 720 + (1 - eo3(pp)) * 50 + yshift, 1.0, eo3(pp) * (1 - out)); x += wl + sp
    ps = prog(lt, 0.75, 0.5); paste_c(c, SUB_I, W / 2, 810 + (1 - eo3(ps)) * 30 + yshift, 1.0, eo3(ps) * (1 - out))
    if fl > 0: c.alpha_composite(Image.new('RGBA', (W, H), (215, 245, 225, int(255 * fl ** 2))))
    return c

CUTS = [6.0, 9.0, 11.5, 14.5, 17.0, 19.5, 21.5]
def seg_index(t):
    for i in range(6):
        if CUTS[i] <= t < CUTS[i + 1]: return i
    return 5

def scene_demo(t):
    c = green_bg(t)
    if t < 6.0 and t >= 5.6:
        c = scene_brand(t)  # transition : la marque monte, le téléphone arrive
    fi = int(round((t - 6.0) * FPS))
    fi = clamp(fi, 0, len(CLIPF) - 1); fi = int(fi)
    scr = CLIPF[fi]
    # fondu court aux changements internes (13.0) et aux coupes
    for cut in CUTS[1:6] + [13.0]:
        if 0 <= t - cut < 0.12:
            prev = CLIPF[max(0, int(round((cut - 6.0) * FPS)) - 1)]
            a = (t - cut) / 0.12; scr = Image.blend(prev, scr, a)
    # mouvement du téléphone
    enter = eob(prog(t, 5.7, 0.55), 1.2)
    exit_ = ei3(prog(t, 21.3, 0.4))
    y = 230 + 515 + (1 - enter) * 1150 + exit_ * 1250
    pulse = 0.0
    for cut in CUTS[:6] + [13.0]:
        if 0 <= t - cut < 0.4: pulse = max(pulse, math.exp(-(t - cut) * 9))
    s = 1.0 + 0.035 * pulse
    fl = math.sin(t * 2.1) * 5
    sx = None
    for cut in CUTS[:6]:
        if 0 <= t - cut < 0.7: sx = -320 + (t - cut) / 0.7 * (SW + 700)
    rot = (1 - enter) * -6 + exit_ * 5
    pim = phone_img(scr, sx)
    paste_c(c, pim, W / 2, y + fl, s * (0.92 + 0.08 * enter), 1.0, rot)
    # légende
    i = seg_index(t); t0 = CUTS[i]; t1 = CUTS[i + 1]
    pin = eob(prog(t, t0 + 0.02, 0.42), 1.4)
    pout = ei3(prog(t, t1 - 0.22, 0.22)) if i < 5 else ei3(prog(t, 21.25, 0.3))
    pw = PILLS[i]
    cx = -pw.width / 2 + (W / 2 + pw.width / 2) * pin + pout * (W / 2 + pw.width)
    paste_c(c, pw, cx, 140, 1.0, clamp(pin * 2) * (1 - pout))
    # progression (6 points)
    if 6.0 <= t < 21.5:
        a_ = clamp(prog(t, 6.0, 0.4)) * (1 - prog(t, 21.2, 0.3))
        l = Image.new('RGBA', (W, 40), (0, 0, 0, 0)); d = ImageDraw.Draw(l)
        x = W / 2 - (5 * 26 + 44) / 2
        for k in range(6):
            wd = 44 if k == i else 14
            col = (255, 255, 255, int(235 * a_)) if k <= i else (255, 255, 255, int(80 * a_))
            d.rounded_rectangle([x, 12, x + wd, 26], radius=7, fill=col); x += wd + 12
        c.alpha_composite(l, (0, 214))
    # signature
    ba = clamp(prog(t, 6.2, 0.5)) * (1 - prog(t, 21.2, 0.3))
    if ba > 0: paste_c(c, BRAND_SMALL, W / 2 + 13, 1306, 1.0, ba)
    return c

def scene_benefits(t):
    c = green_bg(t)
    if t < 21.75: c = scene_demo(t)
    for k, img in enumerate(BEN_I):
        t0 = 21.55 + 0.5 * k
        p = prog(t, t0, 0.38)
        out = ei3(prog(t, 23.15, 0.3))
        if p > 0:
            s = eob(p, 2.4) if p < 1 else 1.0
            paste_c(c, img, W / 2 + out * (W if k % 2 == 0 else -W), 520 + k * 190, max(0.01, s), clamp(p * 3) * (1 - out), rot=(1 - eo3(p)) * (-8 if k % 2 else 8))
    return c

def scene_outro(t):
    c = green_bg(t, drift=True)
    lt = t - 23.5
    fl = 1 - prog(lt, 0, 0.4)
    p = prog(lt, 0.0, 0.6)
    for k in range(3):
        rp = prog(lt, 0.0 + 0.14 * k, 1.1)
        if 0 < rp < 1: ring(c, W / 2, 330, 100 + 460 * eo3(rp), 7 - 4 * rp, (1 - rp) * 0.7)
    breathe = 1 + 0.02 * math.sin(lt * 3) * prog(lt, 0.8, 0.5)
    paste_c(c, O_LOGO, W / 2, 330, (eob(p, 2.6) if p < 1 else 1.0) * breathe, clamp(p * 3))
    pn = prog(lt, 0.3, 0.5); paste_c(c, O_NAME, W / 2, 530 + (1 - eo3(pn)) * 40, 1.0, eo3(pn))
    p1 = prog(lt, 0.55, 0.5); paste_c(c, O_TAG1, W / 2, 618 + (1 - eo3(p1)) * 30, 1.0, eo3(p1))
    p2 = prog(lt, 0.65, 0.5); paste_c(c, O_TAG2, W / 2, 668 + (1 - eo3(p2)) * 30, 1.0, eo3(p2))
    gap = 24; tot = sum(ch.width for ch in O_CHIPS) + 2 * gap; x = (W - tot) / 2
    for k, ch in enumerate(O_CHIPS):
        pc = prog(lt, 0.95 + 0.12 * k, 0.4)
        paste_c(c, ch, x + ch.width / 2, 800, eob(pc, 2.0) if pc < 1 else 1.0, clamp(pc * 3)); x += ch.width + gap
    pc = prog(lt, 1.4, 0.5); paste_c(c, O_CITIES, W / 2, 925 + (1 - eo3(pc)) * 30, 1.0, eo3(pc))
    pn2 = prog(lt, 1.7, 0.6); paste_c(c, O_NOTE, W / 2, 1230, 1.0, eo3(pn2))
    if fl > 0: c.alpha_composite(Image.new('RGBA', (W, H), (215, 245, 225, int(200 * fl ** 2))))
    return c

def frame(t):
    if t < 4.0: return scene_intro(t)
    if t < 5.6: return scene_brand(t)
    if t < 21.55: return scene_demo(t)
    if t < 23.5: return scene_benefits(t)
    return scene_outro(t)

if __name__ == '__main__':
    out = sys.argv[1]
    if len(sys.argv) > 2 and sys.argv[2] == '--preview':
        ts = [float(x) for x in sys.argv[3].split(',')]
        ims = [frame(t).convert('RGB').resize((270, 338)) for t in ts]
        cols = 8; rows = (len(ims) + cols - 1) // cols
        sheet = Image.new('RGB', (270 * cols, 338 * rows), (0, 0, 0))
        for k, im in enumerate(ims): sheet.paste(im, ((k % cols) * 270, (k // cols) * 338))
        sheet.save(out); print('preview', out); sys.exit()
    music = os.path.join(HERE, 'music.wav')
    ff = subprocess.Popen(['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-i', music, '-map', '0:v', '-map', '1:a',
                           '-af', 'loudnorm=I=-14:TP=-1.5:LRA=7', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
                           '-profile:v', 'high', '-level', '4.1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
                           '-shortest', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    for n in range(NF):
        ff.stdin.write(frame(n / FPS).convert('RGB').tobytes())
        if n % 60 == 0: print('frame', n, '/', NF, flush=True)
    ff.stdin.close(); ff.wait()
    print('done', out)
