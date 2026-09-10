"""Ghibli powder-blue willow.

Run: blender --background --python create_willow.py

The 'Rest' category tree: a braided, S-curved trunk forking into limbs, each
limb ending in a fountain of thin drooping branchlets hung with narrow leaves.

The canopy is deliberately NOT a shell. An earlier build wrapped each lobe's
core sphere in a closed ring of straight curtains and read as heavy blue
cylinders. Here every strand is a branchlet shot up and out from inside its
lobe: it arcs over and falls, bleeding off horizontal speed until it hangs
straight down. Strands start at different depths and reach different radii, so
each lobe is a soft see-through volume with a wispy, ragged hem.

Positions are laid out in the reference's pixel space at 150 px per unit (ortho
scale 8.36). Reference bbox is 353x394 of 420. Palette sampled off
reference.png: foliage runs mint-white to deep teal (201,220,210 /
163,197,199 / 131,174,186 / 103,149,166 / 76,119,138), bark a warm grey-brown
(184,163,144 / 119,108,102).
"""
import math
import random
import sys
import pathlib

import bpy
from mathutils import Vector, Matrix

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / '_common'))
import ghibli_studio as gs

ROOT = pathlib.Path(__file__).resolve().parent
random.seed(23)
gs.reset()

wood_g = gs.collection('01 - Braided trunk and limbs')
leaf_g = gs.collection('02 - Hanging leaves')
fall_g = gs.collection('03 - Falling leaves')
studio_g = gs.collection('04 - Camera and cream studio')

LEAF = gs.ramp('Willow leaf', [(208, 227, 216), (184, 214, 211), (160, 199, 204),
                               (138, 182, 195), (118, 165, 182), (100, 148, 168),
                               (84, 131, 152), (72, 116, 138)], 14)
BARK = gs.ramp('Bark', [(200, 182, 163), (182, 163, 145), (163, 145, 129),
                        (143, 127, 115), (123, 110, 102), (102, 92, 88)], 8)

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.05)).normalized()
UP = Vector((0, 0, 1))
DOWN = Vector((0, 0, -1))


def orient(o, fwd, nrm):
    """Blade y -> fwd, blade face -> nrm (made perpendicular to fwd)."""
    right = fwd.cross(nrm)
    if right.length < 1e-5:
        right = fwd.cross(UP)
    right.normalize()
    up2 = right.cross(fwd).normalized()
    o.rotation_euler = Matrix((right, fwd, up2)).transposed().to_4x4().to_euler()
    return right


# ------------------------------------------------------------------ trunk
def axis(z):
    """Gentle S-curve centreline."""
    return Vector((.10 - .20 * math.sin(z * 1.5 - .6), .04 * math.sin(z * 1.2), z))


def braid(z, phase):
    a = phase + z * 1.5
    sep = .12 + .03 * z
    return axis(z) + Vector((math.cos(a) * sep, math.sin(a) * sep * .8, 0))


TOP = 4.1
ZS = [TOP * i / 22 for i in range(23)]
for name, phase in (('A', 0.), ('B', math.pi)):
    gs.tube('Trunk %s' % name, [braid(z, phase) for z in ZS],
            [.42 - .17 * (z / TOP) ** .8 for z in ZS], BARK, wood_g, sides=18,
            gnarl=.06, crease=.9, smooth=True, twist=.22)

for i in range(6):
    a = i * math.tau / 6 + .4 + random.uniform(-.15, .15)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.60, .90)
    gs.tube('Root %d' % (i + 1),
            [axis(.8), axis(.4) + out * reach * .38,
             axis(.12) + out * reach * .76,
             axis(0) + out * reach + Vector((0, 0, .03))],
            [.18, .22, .16, .025], BARK, wood_g, sides=9, gnarl=.07,
            crease=.6, smooth=True)

A, B = 0., math.pi
if braid(TOP, A).x < braid(TOP, B).x:
    A, B = B, A                                  # A is the right-hand strand

# Lobes: centre x, y, z, radius, hem height.
SY = .85
LOBES = [
    (-.05, .25, 6.30, 1.30, 3.7),    # crown
    (1.15, .45, 5.55, 1.05, 1.9),    # upper right
    (-1.05, .45, 5.55, .95, 2.8),    # upper left, behind the crown
    (-2.05, -.05, 4.40, 1.20, 1.3),  # big left
    (2.60, -.15, 3.50, .85, .85),    # low right
]
# Which trunk point each limb springs from.
LIMB_FROM = [(A, TOP), (A, TOP), (B, TOP), (B, TOP - .1), (A, 3.3)]

for i, ((x, y, z, R, _), (ph, sz)) in enumerate(zip(LOBES, LIMB_FROM)):
    S = braid(sz, ph)
    T = Vector((x, y, z))
    M = S.lerp(T, .45) + Vector((0, 0, .55))
    pts = [S * (1 - t) ** 2 + M * 2 * (1 - t) * t + T * t * t
           for t in (k / 8 for k in range(9))]
    gs.tube('Limb %d' % (i + 1), pts, [.22 - .17 * k / 8 for k in range(9)],
            BARK, wood_g, sides=11, gnarl=.06, crease=.6, smooth=True, twist=.1)


# ------------------------------------------------------------------ leaves
def lance_outline(width=.16, steps=10):
    """Willow blade: narrow, pointed at both ends, widest below the middle."""
    def half(y):
        return width * math.sin(math.pi * y) ** .75 * (1 - .25 * y)
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps - 1, 0, -1)]
    return pts


LEAVES = [gs.blade('Willow leaf %d' % i, lance_outline(random.uniform(.14, .18)),
                   cup=random.uniform(.06, .12), droop=random.uniform(.08, .18),
                   lean=random.uniform(-.10, .10), rings=3, material=LEAF[6])
          for i in range(10)]

SP = .17
count = 0
twigs = 0


def droop(S, h, lam, a0, hem):
    """A fountain strand. Its heading starts a0 above horizontal and relaxes
    exponentially (length scale lam) to straight down, so it rises, arcs over
    and falls; horizontal reach is about 1.8 * lam."""
    pts, p, s, ds = [S.copy()], S.copy(), 0., .06
    side = h.cross(UP)
    while p.z > hem and len(pts) < 700:
        s += ds
        a = -math.pi / 2 + (a0 + math.pi / 2) * math.exp(-s / lam)
        wob = .25 * math.sin(s * 1.7 + h.x * 5 + h.y * 3)
        p = p + (h * math.cos(a) + UP * math.sin(a) + side * wob * .08) * ds
        pts.append(p.copy())
    return pts


def lobe(cx, cy, cz, R, hem, seed):
    global count, twigs
    C = Vector((cx, cy, cz))
    top = cz + R
    golden = math.pi * (3 - math.sqrt(5))
    N = int(30 * R)
    for s in range(N):
        phi = s * golden + seed
        h = Vector((math.cos(phi), math.sin(phi) * SY, 0)).normalized()
        # start somewhere inside the lobe, not on a shell
        rr = R * .45 * math.sqrt(random.random())
        S = C + h * rr + Vector((0, 0, R * random.uniform(-.05, .35)))
        lam = R * random.uniform(.22, .58)
        strand_hem = hem + random.uniform(-.9, .45) + .3 * gs.lump(
            math.cos(phi) * 2, math.sin(phi) * 2, seed)
        path = droop(S, h, lam, random.uniform(.75, 1.2), strand_hem)
        if len(path) < 4:
            continue
        # No branchlet tube: leaves hang below the path, so the arch would
        # always poke out above the lobe as a crown of brown twigs.
        twigs += 1
        total = sum((b - a).length for a, b in zip(path, path[1:]))
        acc, side, walked = .10, 1, 0.
        for p0, p1 in zip(path, path[1:]):
            seg = (p1 - p0).length
            while acc <= seg:
                pos = p0.lerp(p1, acc / seg)
                t = (p1 - p0).normalized()
                # willow leaves always hang, even where the branchlet rises
                fwd = t if t.z < -.35 else (t * .35 + DOWN).normalized()
                o = bpy.data.objects.new('Leaf %05d' % count,
                                         LEAVES[(count * 7 + seed) % len(LEAVES)])
                leaf_g.objects.link(o)
                a = side * random.uniform(.22, .42)          # chevron pairs
                right = orient(o, fwd, h)
                orient(o, (fwd * math.cos(a) + right * math.sin(a)).normalized(), h)
                o.location = pos + right * (.04 * side)
                # strands thin to a wisp over their last ~0.9 units
                left = total - (walked + acc)
                L = random.uniform(.30, .40) * min(1., .45 + .55 * left / .9)
                o.scale = (L, L, L)
                hfrac = max(0., min(1., (pos.z - strand_hem) / (top - strand_hem)))
                e = .36 + .26 * h.dot(KEY3) + .20 * hfrac + random.uniform(-.13, .13)
                o.material_slots[0].link = 'OBJECT'
                o.material_slots[0].material = gs.pick(LEAF, e)
                count += 1
                side = -side
                acc += SP
            acc -= seg
            walked += seg


for i, (x, y, z, r, hem) in enumerate(LOBES):
    lobe(x, y, z, r, hem, i)

# A few leaves drifting free, as in the reference (pixel positions -> units).
for i, (px, py) in enumerate([(270, 265), (1100, 440), (545, 860), (237, 925),
                              (820, 1000), (1135, 700)]):
    o = bpy.data.objects.new('Falling leaf %d' % i, random.choice(LEAVES))
    fall_g.objects.link(o)
    o.location = ((px - 627) / 150, -1.8, (1165 - py) / 150)
    o.rotation_euler = (random.uniform(0, math.tau), random.uniform(0, math.tau),
                        random.uniform(0, math.tau))
    s = random.uniform(.32, .40)
    o.scale = (s, s, s)
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = gs.pick(LEAF, random.uniform(.4, .8))

gs.studio(studio_g, cam_pos=(1.0, -22, 4.6), target_z=3.59, ortho_scale=8.36,
          key=1120, fill=340, world=1.42)
gs.render(ROOT / 'ghibli_willow.blend', ROOT / 'ghibli_willow.png',
          note='Reference-matched powder-blue willow, shared studio rig.')
print('willow built: %d leaves on %d strands' % (count, twigs), flush=True)
