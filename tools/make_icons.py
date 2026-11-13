# 產生 PWA 圖示：木頭招牌色底＋紅白遮雨棚＋半拉起的鐵捲門
import os
from PIL import Image, ImageDraw

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def draw(size, pad):
    s = 4 * size
    im = Image.new('RGB', (s, s), '#3B2B20')
    d = ImageDraw.Draw(im)
    x0, x1 = pad * s, (1 - pad) * s
    w = x1 - x0
    top = pad * s + w * .08
    # 遮雨棚
    n = 5
    sw = w / n
    ah = w * .2
    for i in range(n):
        c = '#B8432B' if i % 2 == 0 else '#F7EEDB'
        d.rectangle([x0 + i * sw, top, x0 + (i + 1) * sw, top + ah], fill=c)
        d.pieslice([x0 + i * sw, top + ah - sw / 2, x0 + (i + 1) * sw, top + ah + sw / 2], 0, 180, fill=c)
    # 店門
    dy0 = top + ah + sw / 2 + w * .04
    dy1 = (1 - pad) * s - w * .02
    d.rectangle([x0 + w * .08, dy0, x1 - w * .08, dy1], fill='#F6E6C6')
    # 鐵捲門拉起一半
    sy1 = dy0 + (dy1 - dy0) * .5
    y = dy0
    k = 0
    step = (dy1 - dy0) / 14
    while y < sy1:
        d.rectangle([x0 + w * .08, y, x1 - w * .08, min(y + step, sy1)], fill='#A7B0B5' if k % 2 else '#8C969C')
        y += step
        k += 1
    # 打勾
    cx, cy = (x0 + x1) / 2, (sy1 + dy1) / 2
    r = (dy1 - sy1) * .32
    d.line([(cx - r, cy), (cx - r * .25, cy + r * .7), (cx + r * 1.05, cy - r * .75)], fill='#2C6A4A', width=int(s * .035), joint='curve')
    return im.resize((size, size), Image.LANCZOS)


draw(192, .1).save(os.path.join(out, 'icon-192.png'))
draw(512, .1).save(os.path.join(out, 'icon-512.png'))
draw(512, .2).save(os.path.join(out, 'icon-maskable-512.png'))
