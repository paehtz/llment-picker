import sys, os
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); W, H = im.size
total = 60*100  # CSS-Höhe ohne Rest
k = H / max(total, H)  # Skalierung (Bild ist ggf. etwas höher wegen Rand unten)
blue = lambda c: c[2] > 200 and c[0] < 60
half, full, none = [], 0, []
for i in range(60):
    top = i*100; a = int((top+4)*k); b = int((top+36)*k)
    if b >= H: break
    ta, tb = blue(im.getpixel((W//2, a))), blue(im.getpixel((W//2, b)))
    if ta and tb: full += 1
    elif ta or tb: half.append(i)
    else: none.append(i)
print(f'Bild {W}x{H}: ganz {full}, halbiert {len(half)} {half}, fehlend {len(none)} {none}')
