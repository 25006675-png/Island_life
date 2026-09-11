"""Ghibli sage topiary cluster.

Run: blender --background --python create_topiary.py

The 'Errands' category tree: three stout trunks rising from one root flare,
each clipped into its own rounded puff of broad scalloped leaves - a big crown,
a mid-height right puff and a small low left puff - with ground sprigs and a
few pale mushrooms at the foot.

Canopies are built like the oak's: overlapping cluster spheres dressed in
leaves laid tangent to them.

Positions are laid out in the reference's pixel space at 150 px per unit (ortho
scale 8.36). Reference bbox is 325x355 of 420. Palette sampled off
reference.png: leaves run butter-yellow to deep olive (220,209,131 /
191,179,95 / 161,148,81 / 133,125,70 / 102,106,62 / 82,79,52), bark a warm
brown (119,89,63).
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
random.seed(41)
gs.reset()

wood_g = gs.collection('01 - Trunks and roots')
canopy_g = gs.collection('02 - Canopy puffs')
ground_g = gs.collection('03 - Ground sprigs and mushrooms')
studio_g = gs.collection('04 - Camera and cream studio')

LEAF = gs.ramp('Sage leaf', [(210, 208, 130), (186, 184, 100), (160, 160, 84),
                             (136, 140, 74), (114, 122, 66), (96, 106, 60),
                             (80, 90, 54), (64, 72, 46)], 14)
BARK = gs.ramp('Bark', [(184, 140, 98), (166, 124, 85), (146, 108, 74),
                        (126, 93, 64), (106, 78, 56), (86, 64, 48)], 8)
CORE = gs.mat('Puff core', gs.srgb(92, 92, 56))
SPRIG = gs.ramp('Sprig', [(156, 164, 84), (126, 136, 66), (96, 106, 52)], 5)
STEM = gs.ramp('Mushroom stem', [(244, 236, 220), (224, 212, 192), (200, 186, 164)], 4)
CAP = gs.vcol_material('Mushroom cap')
CAP_STOPS = [(240, 229, 210), (222, 205, 178), (196, 172, 142), (160, 136, 110)]

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.05)).normalized()
UP = Vector((0, 0, 1))


def px(x, y):
    """Reference pixel (1254 frame) -> units: 150 px per unit, ground at y=1095."""
    return ((x - 627) / 150, (1095 - y) / 150)


def orient(o, fwd, nrm):
    right = fwd.cross(nrm)
    if right.length < 1e-5:
        right = fwd.cross(UP)
    right.normalize()
    up2 = right.cross(fwd).normalized()
    o.rotation_euler = Matrix((right, fwd, up2)).transposed().to_4x4().to_euler()


# ------------------------------------------------------------------ trunks
def trunk(name, pixels, y, radii):
    pts = [Vector((px(*p)[0], y, px(*p)[1])) for p in pixels]
    gs.tube(name, pts, radii, BARK, wood_g, sides=18, gnarl=.07, crease=.6,
            smooth=True, twist=.06)
    return pts


centre = trunk('Trunk centre', [(600, 1100), (592, 900), (572, 720), (556, 560), (545, 420)],
               .10, [.60, .50, .45, .40, .34])
right = trunk('Trunk right', [(672, 1095), (730, 930), (790, 800), (860, 700), (930, 620)],
              -.10, [.46, .40, .34, .28, .20])
left = trunk('Trunk left', [(560, 1090), (500, 960), (450, 860), (410, 790), (380, 720)],
             -.15, [.42, .36, .30, .25, .18])
# forks carrying the right and big puffs
gs.tube('Trunk right fork', [right[2], right[2] + Vector((.05, 0, .7)),
                              Vector((px(820, 560)[0], .1, px(820, 560)[1]))],
        [.20, .16, .12], BARK, wood_g, sides=10, gnarl=.06, crease=.5, smooth=True)
gs.tube('Trunk centre fork', [centre[2], centre[2] + Vector((.35, 0, .8)),
                               Vector((px(700, 380)[0], .2, px(700, 380)[1]))],
        [.22, .17, .12], BARK, wood_g, sides=10, gnarl=.06, crease=.5, smooth=True)

BASE = Vector((0., 0., 0.))
for i in range(7):
    a = i * math.tau / 7 + .2 + random.uniform(-.12, .12)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.95, 1.25)
    gs.tube('Root %d' % (i + 1),
            [BASE + Vector((0, 0, .9)), BASE + out * reach * .38 + Vector((0, 0, .45)),
             BASE + out * reach * .74 + Vector((0, 0, .14)),
             BASE + out * reach + Vector((0, 0, .03))],
            [.30, .32, .22, .03], BARK, wood_g, sides=10, gnarl=.07,
            crease=.5, smooth=True)


# ------------------------------------------------------------------ canopy
def crenate_outline(width=.42, scallops=4.0, depth=.09, steps=40):
    """Broad rounded leaf with a softly scalloped edge, widest past the middle."""
    def half(y):
        base = width * math.sin(math.pi * min(1., y ** 1.3)) ** .5
        return base * (1 + depth * math.sin(y * scallops * math.tau))
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps - 1, 0, -1)]
    return pts


LEAVES = [gs.blade('Sage leaf %d' % i,
                   crenate_outline(random.uniform(.38, .46),
                                   scallops=random.choice([3.0, 3.5, 4.0]),
                                   depth=random.uniform(.06, .12)),
                   cup=random.uniform(.08, .15), droop=random.uniform(.10, .22),
                   lean=random.uniform(-.12, .12), rings=5, material=LEAF[5])
          for i in range(12)]

count = 0


def cluster(cx, cy, cz, R, n, seed):
    """One rounded puff: a hidden core sphere dressed in tangent leaves."""
    global count
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=16, radius=R * .80,
                                         location=(cx, cy, cz))
    core = bpy.context.object
    core.name = 'Puff core %d' % seed
    for col in list(core.users_collection):
        col.objects.unlink(core)
    canopy_g.objects.link(core)
    core.data.materials.append(CORE)
    core.scale = (1, 1, .88)
    for p in core.data.polygons:
        p.use_smooth = True

    golden = math.pi * (3 - math.sqrt(5))
    for k in range(n):
        u = 1 - 1.75 * (k + .5) / n
        u = max(-.72, u)
        rho = math.sqrt(max(0., 1 - u * u))
        a = k * golden + seed
        nrm = Vector((rho * math.cos(a), rho * math.sin(a), u))
        pos = Vector((cx, cy, cz)) + nrm * (R * (.92 + .10 * gs.lump(
            cx + nrm.x * 2, cy + nrm.y * 2, seed)))
        o = bpy.data.objects.new('Leaf %04d' % count, LEAVES[(count * 5 + seed) % len(LEAVES)])
        canopy_g.objects.link(o)
        o.location = pos
        down = Vector((0, 0, -1))
        tang = down - nrm * down.dot(nrm)
        if tang.length < 1e-4:
            tang = Vector((1, 0, 0))
        tang.normalize()
        side = nrm.cross(tang)
        fwd = (tang + side * random.uniform(-.75, .75)
               + nrm * random.uniform(.12, .48)).normalized()
        orient(o, fwd, nrm)
        L = R * random.uniform(.40, .58)
        o.scale = (L, L, L)
        e = .22 + .40 * nrm.dot(KEY3) + .22 * (u * .5 + .5) + random.uniform(-.11, .11)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = gs.pick(LEAF, e)
        count += 1


# Puff groups: group centre, then (dx, dy, dz, radius) per puff.
PUFFS = [
    ((-.67, .05, 5.18), [(0, 0, .45, 1.15), (-1.1, .1, -.05, 1.0), (1.05, 0, .05, 1.0),
                         (-.5, -.6, -.5, .9), (.55, -.55, -.45, .9), (0, .6, .1, 1.0),
                         (-.55, -.35, .85, .8), (.5, -.3, .8, .8)]),
    ((1.75, -.10, 3.55), [(0, 0, .35, 1.05), (.75, 0, -.25, .85), (-.65, .1, -.2, .8),
                          (0, -.55, -.5, .85), (.3, .5, .3, .8), (-.25, -.4, .7, .7)]),
    ((-1.75, -.20, 2.62), [(0, 0, .25, .85), (-.55, 0, -.2, .7), (.5, -.1, -.15, .7),
                           (0, -.45, -.35, .7), (-.2, .3, .45, .6)]),
]
seed = 0
for (gx, gy, gz), puffs in PUFFS:
    for dx, dy, dz, r in puffs:
        cluster(gx + dx, gy + dy, gz + dz, r, int(165 * r * r), seed)
        seed += 1


# ------------------------------------------------------------------ ground
SPRIGS = [gs.blade('Sprig %d' % i, gs.ovate_outline(width=.30, shoulder=.35, tip_blunt=1.6),
                   cup=.10, droop=.15, lean=random.uniform(-.15, .15), rings=4,
                   material=SPRIG[2]) for i in range(4)]
for i in range(11):
    a = random.uniform(-2.9, -.25) if i < 8 else random.uniform(.3, 2.8)
    out = Vector((math.cos(a), math.sin(a), 0))
    o = bpy.data.objects.new('Sprig %02d' % i, SPRIGS[i % len(SPRIGS)])
    ground_g.objects.link(o)
    o.location = out * random.uniform(.75, 1.05)
    fwd = (out * random.uniform(.45, .75) + UP).normalized()
    orient(o, fwd, UP - fwd * fwd.z)
    s = random.uniform(.42, .62)
    o.scale = (s, s, s)
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = random.choice(SPRIG)


def mushroom(i, x, y, h, r):
    gs.tube('Mushroom %d stem' % i, [(x, y, 0), (x, y, h * .5), (x, y, h)],
            [r * .42, r * .36, r * .33], STEM, ground_g, sides=10, gnarl=.02,
            crease=.1, smooth=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r,
                                         location=(x, y, h))
    cap = bpy.context.object
    cap.name = 'Mushroom %d cap' % i
    for col in list(cap.users_collection):
        col.objects.unlink(cap)
    ground_g.objects.link(cap)
    cap.scale = (1, 1, .62)
    cap.data.materials.append(CAP)
    for p in cap.data.polygons:
        p.use_smooth = True
    gs.paint(cap, lambda co, n: gs.grad(CAP_STOPS, .5 - .5 * n.z))


for i, (x, y, h, r) in enumerate([(-.55, -.95, .34, .19), (-.25, -1.05, .20, .12),
                                  (1.10, -.62, .36, .17), (1.32, -.42, .22, .11)]):
    mushroom(i, x, y, h, r)

gs.studio(studio_g, cam_pos=(1.0, -22, 4.2), target_z=3.12, ortho_scale=8.36,
          key=1120, fill=340, world=1.42)
gs.render(ROOT / 'ghibli_topiary.blend', ROOT / 'ghibli_topiary.png',
          note='Reference-matched sage topiary cluster, shared studio rig.')
print('topiary built: %d leaves' % count, flush=True)
