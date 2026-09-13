"""Finish the rendered icons: a rise-and-fall arrow beside the island, a glow on
the bridge, and a soft shadow under both so they hold up on a white page.

Run after tools/render_world_icons.py.
"""
import pathlib

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ICONS = pathlib.Path('public/assets/icons')
ARROW = (126, 110, 150, 255)


def ground(im, w=.7, h=.16, dy=.08, blur=.045):
    box = im.getbbox()
    cx, cy = (box[0] + box[2]) / 2, box[3] - im.height * dy
    shadow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((cx - im.width * w / 2, cy - im.height * h / 2,
                                    cx + im.width * w / 2, cy + im.height * h / 2), fill=(60, 48, 70, 78))
    return Image.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(im.width * blur)), im)


# ---- the island: more colour, and an arrow that says this one moves ----------
im = Image.open(ICONS / 'island.webp').convert('RGBA')
rgb = ImageEnhance.Color(im.convert('RGB')).enhance(1.45)
rgb = ImageEnhance.Contrast(rgb).enhance(1.12)
im = Image.merge('RGBA', (*rgb.split(), im.split()[3]))
box = im.getbbox()
island = im.crop(box)
S = 256
canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
island.thumbnail((int(S * .74), int(S * .74)), Image.LANCZOS)
canvas.paste(island, (6, (S - island.height) // 2), island)
d = ImageDraw.Draw(canvas)
x, top, bottom = S - 30, 34, S - 34
d.line((x, top + 16, x, bottom - 16), fill=ARROW, width=11)
d.polygon([(x, top), (x - 19, top + 28), (x + 19, top + 28)], fill=ARROW)
d.polygon([(x, bottom), (x - 19, bottom - 28), (x + 19, bottom - 28)], fill=ARROW)
ground(canvas, w=.5, h=.12, dy=.16).save(ICONS / 'island.webp', quality=92)
print('island: coloured, arrowed, grounded')

# ---- the bridge: a warm glow around the gold --------------------------------
im = Image.open(ICONS / 'bridge.webp').convert('RGBA')
glow = Image.new('RGBA', im.size, (0, 0, 0, 0))
glow.paste(Image.new('RGBA', im.size, (255, 196, 92, 190)), (0, 0), im.split()[3])
glow = glow.filter(ImageFilter.GaussianBlur(im.width * .035))
im = Image.alpha_composite(glow, im)
im = Image.merge('RGBA', (*ImageEnhance.Color(im.convert('RGB')).enhance(1.3).split(), im.split()[3]))
ground(im, w=.6, h=.12, dy=.05).save(ICONS / 'bridge.webp', quality=92)
print('bridge: glowing, grounded')
