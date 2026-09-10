"""Ghibli coral palm.

Run: blender --background --python create_palm.py

An S-curved trunk clad in overlapping shield plates, carrying eight arching
feathered fronds. Reference bbox is 259x391 of 420, with the trunk taking the
lower ~65% of the height and the crown spanning the full width.

Palette sampled off reference.png: fronds run coral to deep rose
(252,150,127 / 232,105,109 / 202,81,91), trunk a warm greyish mauve-brown.
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
random.seed(5)
gs.reset()

trunk_g = gs.collection('01 - Trunk')
plate_g = gs.collection('02 - Trunk plates')
frond_g = gs.collection('03 - Fronds')
studio_g = gs.collection('04 - Camera and cream studio')

CORAL = gs.ramp('Frond', [(246, 192, 166), (250, 158, 132), (243, 126, 116),
                          (230, 103, 108), (206, 82, 93), (176, 66, 80)], 12)
BARK = gs.ramp('Trunk', [(196, 158, 136), (176, 138, 120), (152, 116, 106),
                         (128, 95, 94), (106, 76, 81), (86, 62, 69)], 8)
RACHIS = gs.ramp('Rachis', [(238, 176, 146), (214, 140, 124), (184, 108, 104)], 4)

H = 4.95                       # trunk height; crown sits on top
KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, .95)).normalized()


def trunk_center(t):
    """Gentle S: the foot kicks right, the shaft bows left, the crown recovers."""
    return Vector((.86 * math.sin(math.pi * t * .80) - .34 * t - .14,
                   .16 * math.sin(t * 1.9),
                   H * t))


def trunk_radius(t):
    # Flared foot, slim shaft, slight swell under the crown.
    return .36 * (1 - t) ** 2.1 + .135 + .030 * math.sin(t * 3.2)


# ------------------------------------------------------------------ trunk
STEPS = 46
path = [trunk_center(i / STEPS) for i in range(STEPS + 1)]
radii = [trunk_radius(i / STEPS) for i in range(STEPS + 1)]
gs.tube('Trunk', path, radii, BARK, trunk_g, sides=20, gnarl=.045, crease=.5,
        smooth=True, twist=.03)

# Flared root buttresses at the foot
for i in range(6):
    a = i * math.tau / 6 + .3
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.34, .50)
    gs.tube('Root %d' % (i + 1),
            [trunk_center(.10),
             trunk_center(.05) + out * reach * .45,
             trunk_center(0) + out * reach + Vector((0, 0, .03))],
            [.13, .15, .02], BARK, trunk_g, sides=8, gnarl=.05, crease=.4, smooth=True)


def shield(name, axis_pt, outward, up, r, half_angle, h, bulge, mat):
    """One overlapping trunk plate, wrapped around the trunk.

    Built by sweeping an angle about the trunk axis rather than as a flat slab:
    a flat plate wide enough to read has to poke out at its edges on a cylinder.
    """
    cols, rows = 9, 5
    verts, faces = [], []
    for j in range(rows + 1):
        v = j / rows
        # Square across the top, tapering to a round point at the base.
        span = half_angle * (1 - v ** 2.3) ** .45
        for i in range(cols + 1):
            u = -1 + 2 * i / cols
            d = outward.copy()
            d.rotate(Matrix.Rotation(u * span, 3, up))
            lift = bulge * (1 - (u * u) ** 1.4) * (.35 + .65 * v)
            p = axis_pt + d * (r + lift) + up * (h * (.5 - v))
            verts.append(p)
    for j in range(rows):
        for i in range(cols):
            a = j * (cols + 1) + i
            faces.append((a, a + 1, a + cols + 2, a + cols + 1))
    return gs.mesh(name, verts, faces, mat, plate_g, smooth=True)


LEVELS = 19
for li in range(LEVELS):
    t = .05 + .92 * li / (LEVELS - 1)
    c = trunk_center(t)
    tan = (trunk_center(min(1., t + .02)) - trunk_center(max(0., t - .02))).normalized()
    r = trunk_radius(t)
    for k in range(6):
        # Half-step each level so the plates interlock, as on a real palm.
        a = k * math.tau / 6 + (li % 2) * math.pi / 6 + t * .8
        outward = Vector((math.cos(a), math.sin(a), 0))
        outward = (outward - tan * outward.dot(tan)).normalized()
        up = tan
        e = .46 + .28 * outward.dot(Vector((KX, KY, 0))) + random.uniform(-.05, .05)
        # Each plate spans a little over its 1/6 share of the circumference, so
        # neighbours overlap without anything standing proud of the silhouette.
        shield('Plate %d-%d' % (li, k), c, outward, up,
               r * .97, math.tau / 6 * .62, .30, r * .10, gs.pick(BARK, e))


# ------------------------------------------------------------------ fronds
def leaflet_outline(width=.085, steps=16):
    """Long narrow pinna drawn to a sharp point."""
    def half(y):
        return width * (1 - y ** 1.5) ** .62 * (.35 + .9 * min(1., y * 5))
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


LEAFLETS = [gs.blade('Pinna %d' % i, leaflet_outline(random.uniform(.115, .165)),
                     cup=random.uniform(.05, .12), droop=random.uniform(.06, .18),
                     lean=random.uniform(-.10, .10), rings=4, material=CORAL[3])
            for i in range(10)]


def aim(obj, fwd, up):
    fwd = fwd.normalized()
    right = fwd.cross(up)
    if right.length < 1e-5:
        right = fwd.cross(Vector((0, 0, 1)))
    right.normalize()
    up2 = right.cross(fwd).normalized()
    obj.rotation_euler = Matrix((right, fwd, up2)).transposed().to_4x4().to_euler()


CROWN = trunk_center(1.0)
count = 0

# az deg, elevation deg, length, tip rise relative to the crown
FRONDS = [(148, 62, 2.30, 1.42), (96, 72, 2.30, 1.72), (42, 60, 2.28, 1.36),
          (192, 34, 2.34, -.05), (348, 32, 2.34, -.10), (230, 16, 2.20, -.62),
          (310, 14, 2.20, -.66), (266, 32, 1.95, -.22)]

for fi, (az_d, el_d, L, tip_rise) in enumerate(FRONDS):
    az, el = math.radians(az_d), math.radians(el_d)
    d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    droop = math.sin(el) - tip_rise / L        # ballistic arc through the given tip

    def at(s):
        return CROWN + d * (L * s) - Vector((0, 0, 1)) * (droop * L * s * s)

    # Rachis
    rpath = [at(i / 14) for i in range(15)]
    gs.tube('Rachis %d' % fi, rpath, [.055 * (1 - .92 * (i / 14)) + .012 for i in range(15)],
            RACHIS, frond_g, sides=7, gnarl=.03, crease=0, smooth=True)

    n = 20
    for i in range(n):
        s = .05 + .94 * i / (n - 1)
        p = at(s)
        tan = (at(min(1., s + .02)) - at(max(0., s - .02))).normalized()
        # Leaflets peak in length around the middle third, as in the reference.
        prof = math.sin(math.pi * min(1., s ** .85)) ** .75
        side = tan.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = tan.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(tan).normalized()
        for sgn in (-1, 1):
            rake = math.radians(52) + random.uniform(-.10, .10)
            fwd = (tan * math.cos(rake) + side * (sgn * math.sin(rake))).normalized()
            # Fan the pinnae a little above and below the rachis plane.
            fan = random.uniform(-.30, .16)
            fwd = (fwd + up * fan).normalized()
            o = bpy.data.objects.new('Pinna %04d' % count,
                                     LEAFLETS[(count * 3 + fi) % len(LEAFLETS)])
            frond_g.objects.link(o)
            o.location = p + side * (sgn * .012)
            aim(o, fwd, up)
            ln = (1.02 * prof + .12) * random.uniform(.88, 1.12)
            o.scale = (ln, ln, ln)
            lit = up.dot(KEY3) * .5 + .5
            e = .18 + .48 * lit + .26 * (1 - s) + random.uniform(-.10, .10)
            o.material_slots[0].link = 'OBJECT'
            o.material_slots[0].material = gs.pick(CORAL, e)
            count += 1

# Reference bbox 259x391 of 420: tall and narrow, viewed near eye level.
gs.studio(studio_g, cam_pos=(1.0, -20, 5.6), target_z=3.62, ortho_scale=7.70,
          key=1050, fill=340, world=1.45)
gs.render(ROOT / 'ghibli_palm.blend', ROOT / 'ghibli_palm.png',
          note='Reference-matched coral palm, shared studio rig.')
print('palm built: %d pinnae' % count, flush=True)
