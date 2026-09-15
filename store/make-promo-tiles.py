from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
base = r"C:\Users\henni\Code\llment-picker\store"
ICON = Image.open(r"C:\Users\henni\Code\llment-picker\icons\128.png").convert("RGBA")
F = "C:/Windows/Fonts/"
def font(name, px): return ImageFont.truetype(F + name, px)

def gradient(w, h, c1, c2):
    im = Image.new("RGB", (w, h)); px = im.load()
    for y in range(h):
        for x in range(w):
            t = (x / w * 0.6 + y / h * 0.4)
            px[x, y] = tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))
    return im

def mockup(s):
    """Seiten-Miniatur mit Highlight + Zwischenablage-Box. s = Skalierung (1.0 ≈ 520x360)."""
    W, H = int(520 * s), int(360 * s)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    r = int(14 * s)
    # Schatten
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).rounded_rectangle([int(10*s), int(16*s), W - int(10*s), H - int(6*s)], r, fill=(0, 20, 60, 110))
    sh = sh.filter(ImageFilter.GaussianBlur(int(14 * s))); im.alpha_composite(sh)
    # Fenster
    d.rounded_rectangle([int(10*s), int(10*s), W - int(10*s), H - int(16*s)], r, fill=(255, 255, 255))
    # Titelleiste mit Ampel
    d.rounded_rectangle([int(10*s), int(10*s), W - int(10*s), int(44*s)], r, fill=(243, 245, 248))
    d.rectangle([int(10*s), int(30*s), W - int(10*s), int(44*s)], fill=(243, 245, 248))
    for i, c in enumerate([(255, 95, 87), (255, 189, 46), (40, 200, 64)]):
        cx = int((28 + i * 16) * s); d.ellipse([cx - int(5*s), int(22*s), cx + int(5*s), int(32*s)], fill=c)
    d.rounded_rectangle([int(90*s), int(18*s), W - int(30*s), int(36*s)], int(9*s), fill=(255, 255, 255), outline=(225, 229, 235))
    d.text((int(100*s), int(20*s)), "paehtz.de/#leistungen", font=font("consola.ttf", int(11*s)), fill=(120, 130, 145))
    # Seiteninhalt: Überschrift + Absätze
    x0, y = int(34*s), int(64*s)
    d.rounded_rectangle([x0, y, x0 + int(190*s), y + int(18*s)], int(4*s), fill=(30, 36, 48)); y += int(34*s)
    for wdt in (300, 270, 0):
        if wdt: d.rounded_rectangle([x0, y, x0 + int(wdt*s), y + int(9*s)], int(4*s), fill=(210, 215, 222)); y += int(17*s)
    y += int(6*s)
    # Karte mit hervorgehobenem Absatz
    cx0, cy0, cx1, cy1 = x0, y, W - int(34*s), y + int(120*s)
    d.rounded_rectangle([cx0, cy0, cx1, cy1], int(8*s), fill=(250, 251, 252), outline=(228, 232, 238))
    d.rectangle([cx0, cy0 + int(8*s), cx0 + int(4*s), cy1 - int(8*s)], fill=(217, 38, 44))
    d.rounded_rectangle([cx0 + int(22*s), cy0 + int(16*s), cx0 + int(120*s), cy0 + int(28*s)], int(4*s), fill=(30, 36, 48))
    hx0, hy0, hx1, hy1 = cx0 + int(22*s), cy0 + int(42*s), cx1 - int(22*s), cy0 + int(84*s)
    d.rectangle([hx0, hy0, hx1, hy1], fill=(222, 236, 255), outline=(10, 132, 255), width=max(2, int(2*s)))
    for i, wdt in enumerate((0.92, 0.78, 0.55)):
        yy = hy0 + int((10 + i * 12) * s)
        d.rounded_rectangle([hx0 + int(10*s), yy, hx0 + int(10*s) + int((hx1 - hx0 - int(20*s)) * wdt), yy + int(7*s)], int(3*s), fill=(190, 200, 215))
    lab = font("consola.ttf", int(11*s)); lt = "p.service__body"; lw = d.textlength(lt, font=lab)
    d.rounded_rectangle([hx0, hy0 - int(20*s), hx0 + lw + int(12*s), hy0 - int(2*s)], int(3*s), fill=(10, 132, 255))
    d.text((hx0 + int(6*s), hy0 - int(19*s)), lt, font=lab, fill=(255, 255, 255))
    # Zwischenablage-Box unten rechts, überlappend
    bx0, by0 = int(110*s), H - int(96*s); bx1, by1 = W - int(14*s), H - int(6*s)
    sh2 = Image.new("RGBA", (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh2).rounded_rectangle([bx0, by0 + int(6*s), bx1, by1 + int(6*s)], int(10*s), fill=(0, 20, 60, 120))
    im.alpha_composite(sh2.filter(ImageFilter.GaussianBlur(int(10*s)))); d = ImageDraw.Draw(im)
    d.rounded_rectangle([bx0, by0, bx1, by1], int(10*s), fill=(20, 24, 31))
    mono = font("consola.ttf", int(12*s)); small = font("segoeuib.ttf", int(9*s))
    d.text((bx0 + int(16*s), by0 + int(10*s)), "IN DER ZWISCHENABLAGE", font=small, fill=(120, 190, 255))
    lines = ["https://www.paehtz.de/#leistungen", "#leistungen .service-list > .service:nth-of-type(2) > …", '"Unternehmenswebseiten: von der Sitemap …"']
    cols = [(160, 200, 255), (255, 255, 255), (180, 230, 190)]
    for i, (t, c) in enumerate(zip(lines, cols)):
        d.text((bx0 + int(16*s), by0 + int((28 + i * 18) * s)), t, font=mono, fill=c)
    # Toast
    tw = int(64*s); d.rounded_rectangle([W - int(24*s) - tw, int(56*s), W - int(24*s), int(78*s)], int(6*s), fill=(26, 127, 55))
    d.text((W - int(24*s) - tw + int(12*s), int(59*s)), "Kopiert", font=font("segoeui.ttf", int(12*s)), fill=(255, 255, 255))
    return im

def large():
    W, H = 1400, 560; S = 2
    im = gradient(W*S, H*S, (7, 34, 82), (10, 132, 255)); d = ImageDraw.Draw(im)
    ic = ICON.resize((72*S, 72*S), Image.LANCZOS); im.paste(ic, (90*S, 150*S), ic)
    d.text((176*S, 152*S), "LLMent Picker", font=font("segoeuib.ttf", 58*S), fill=(255, 255, 255))
    d.text((92*S, 250*S), "Sag dem KI-Agenten,", font=font("segoeui.ttf", 40*S), fill=(255, 255, 255))
    d.text((92*S, 300*S), "welches Element Du meinst.", font=font("segoeui.ttf", 40*S), fill=(255, 255, 255))
    d.text((94*S, 372*S), "Ein Klick kopiert URL, CSS-Selektor", font=font("segoeui.ttf", 20*S), fill=(200, 222, 255))
    d.text((94*S, 402*S), "und markierten Text – für jeden KI-Chat.", font=font("segoeui.ttf", 20*S), fill=(200, 222, 255))
    m = mockup(1.25 * S); im.paste(m, (W*S - m.width - 50*S, (H*S - m.height) // 2 + 4*S), m)
    im = im.resize((W, H), Image.LANCZOS); im.save(os.path.join(base, "promo-large-1400x560.png"), optimize=True); print("large ok")

def small():
    W, H = 440, 280; S = 3
    im = gradient(W*S, H*S, (7, 34, 82), (10, 132, 255)); d = ImageDraw.Draw(im)
    ic = ICON.resize((40*S, 40*S), Image.LANCZOS); im.paste(ic, (24*S, 24*S), ic)
    d.text((74*S, 26*S), "LLMent Picker", font=font("segoeuib.ttf", 30*S), fill=(255, 255, 255))
    d.text((26*S, 74*S), "Sag dem KI-Agenten, welches Element Du meinst.", font=font("segoeui.ttf", 15*S), fill=(200, 222, 255))
    m = mockup(0.78 * S); im.paste(m, ((W*S - m.width) // 2 + 6*S, 100*S), m)
    im = im.resize((W, H), Image.LANCZOS); im.save(os.path.join(base, "promo-small-440x280.png"), optimize=True); print("small ok")
large(); small()
