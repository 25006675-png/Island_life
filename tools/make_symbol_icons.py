"""Draw the small bloom and sky symbols used beside feelings and weather.

Blooms take their colour from data.js MOODS, drawn like the ones that open in the
bed round your flower (mood.js): five round petals, a yellow centre, a short stem.
The sky symbols run clear -> light cloud -> cloudy -> drizzle -> rain, in the
app's own warm palette. Both are drawn big and saved small, so the edges stay
soft. Writes public/assets/icons/bloom-<mood>.webp and sky-<state>.webp.

Run: python tools/make_symbol_icons.py
"""
import pathlib

from PIL import Image, ImageDraw, ImageFilter

OUT = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'assets' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)
S = 256
MOODS = {'calm': '#9fdcc8', 'happy': '#ffd580', 'tired': '#bba9e0', 'stressed': '#f39a7c', 'low': '#92aede'}
STEM, LEAF, CENTRE = '#6f9e43', '#8fbf5a', '#ffd23c'   # as mood.js draws them
LIT, SHADE = '#fdf1e4', '#d9c3b4'     # cloud in the light, cloud underneath
HEAVY_LIT, HEAVY_SHADE = '#e8d8cf', '#b49c94'   # the same cloud, rained through
RAIN, SUN = '#7f9dc4', '#ffc978'


def rgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def save(im, name):
    im.resize((96, 96), Image.LANCZOS).save(OUT / f'{name}.webp', quality=92)
    print(name)


def bloom(colour):
    """A five-petal bloom in a feeling's colour, with a soft glow, on a short stem with one leaf."""
    import math
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((34, 18, 222, 206), fill=rgb(colour) + (120,))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(22)))
    d, c = ImageDraw.Draw(im), rgb(colour)
    d.line((128, 140, 128, 236), fill=rgb(STEM) + (255,), width=12)                    # the stem
    d.ellipse((128, 178, 190, 206), fill=rgb(LEAF) + (255,))                            # a leaf
    cx, cy, r, out = 128, 108, 40, 46
    for k in range(5):                                                                  # five round petals
        a = -math.pi / 2 + k * 2 * math.pi / 5
        px, py = cx + math.cos(a) * out, cy + math.sin(a) * out
        d.ellipse((px - r, py - r, px + r, py + r), fill=c + (255,))
    d.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=rgb(CENTRE) + (255,))         # the centre
    d.ellipse((cx - 13, cy - 15, cx + 3, cy - 1), fill=(255, 255, 255, 110))            # its shine
    return im


def cloud(d, lit, shade, alpha=255, y=0, scale=1.):
    """A lobed cloud: lit along the top, shaded underneath."""
    lobes = ((92, 152, 46), (132, 130, 58), (176, 150, 44))
    for cx, cy, r in lobes:                                             # the shaded underside first
        cx, cy, r = 128 + (cx - 128) * scale, y + 128 + (cy - 128) * scale + 14, r * scale
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgb(shade) + (alpha,))
    d.rounded_rectangle((128 - 78 * scale, y + 152, 128 + 78 * scale, y + 194), radius=24, fill=rgb(shade) + (alpha,))
    for cx, cy, r in lobes:                                             # then the lit lobes on top
        cx, cy, r = 128 + (cx - 128) * scale, y + 128 + (cy - 128) * scale, r * scale
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgb(lit) + (alpha,))
    d.rounded_rectangle((128 - 76 * scale, y + 140, 128 + 76 * scale, y + 178), radius=22, fill=rgb(lit) + (alpha,))


def sky(kind):
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if kind in ('clear', 'light-cloud'):
        glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        cx, cy, r = (128, 128, 68) if kind == 'clear' else (168, 92, 50)
        ImageDraw.Draw(glow).ellipse((cx - r - 26, cy - r - 26, cx + r + 26, cy + r + 26), fill=rgb(SUN) + (120,))
        im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(20)))
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=rgb(SUN) + (255,))
    if kind == 'light-cloud':
        cloud(d, LIT, SHADE, 255, y=18, scale=.74)
    elif kind == 'cloudy':
        cloud(d, LIT, SHADE, 255, y=-4)
    elif kind in ('drizzle', 'rain'):
        cloud(d, HEAVY_LIT, HEAVY_SHADE, 255, y=-24)
        drops = 2 if kind == 'drizzle' else 4
        for i in range(drops):
            x = 128 + (i - (drops - 1) / 2) * 44
            d.line((x + 8, 186, x - 8, 232), fill=rgb(RAIN) + (255,), width=10)
    return im


for name, colour in MOODS.items():
    save(bloom(colour), f'bloom-{name}')
for name in ('clear', 'light-cloud', 'cloudy', 'drizzle', 'rain'):
    save(sky(name), f'sky-{name}')

def altitude():
    """A small island with an up-and-down arrow beside it: how high you float."""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(72, 150), (184, 150), (128, 226)], fill=(185, 167, 155, 255))      # the keel
    d.ellipse((62, 116, 194, 166), fill=(169, 192, 138, 255))                      # the grassy top
    d.ellipse((96, 92, 128, 124), fill=(233, 191, 204, 255))                       # a blossom on it
    x = 212
    d.line((x, 74, x, 202), fill=(150, 136, 168, 255), width=9)                    # the arrow
    d.polygon([(x, 56), (x - 18, 84), (x + 18, 84)], fill=(150, 136, 168, 255))
    d.polygon([(x, 220), (x - 18, 192), (x + 18, 192)], fill=(150, 136, 168, 255))
    return im


def trees():
    """A little stand of trees: what has grown this week."""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for cx, cy, r, crown, trunk in ((88, 150, 44, (169, 192, 138), (154, 122, 98)),
                                    (170, 136, 52, (146, 178, 126), (154, 122, 98)),
                                    (130, 168, 38, (233, 191, 204), (154, 122, 98))):
        d.rounded_rectangle((cx - 7, cy, cx + 7, cy + 58), radius=6, fill=trunk + (255,))
        d.ellipse((cx - r, cy - r, cx + r, cy + r * .7), fill=crown + (255,))
    return im


save(altitude(), 'altitude')
save(trees(), 'trees')
