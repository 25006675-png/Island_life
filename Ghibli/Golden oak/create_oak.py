"""Ghibli golden oak.

Run: blender --background --python create_oak.py

A broad autumn oak: a heavy flared bole splitting into five limbs, carrying a
canopy built from a dozen overlapping rounded clusters rather than one smooth
mass - which is what gives the reference its puffy, cauliflower silhouette.

Reference bbox is 341x348 of 420 (near square). Palette sampled off
reference.png: leaves run bright yellow to deep amber (253,196,75 /
237,159,57 / 209,128,52 / 175,101,50), bark a pale grey-brown.
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
random.seed(19)
gs.reset()

wood_g = gs.collection('01 - Bole and limbs')
canopy_g = gs.collection('02 - Canopy clusters')
studio_g = gs.collection('03 - Camera and cream studio')

LEAF = gs.ramp('Leaf', [(252, 203, 88), (247, 184, 68), (238, 162, 58),
                        (224, 140, 53), (203, 119, 50), (176, 99, 49),
                        (145, 81, 46)], 14)
BARK = gs.ramp('Bark', [(178, 146, 118), (158, 126, 102), (136, 106, 88),
                        (114, 88, 74), (94, 71, 62), (74, 56, 50)], 8)
CORE = gs.mat('Cluster core', gs.srgb(152, 92, 50))

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.05)).normalized()


# ------------------------------------------------------------------ bole
def bole_center(z):
    return Vector((.10 * math.sin(z * .9) - .04 * z, .05 * math.sin(z * 1.3), z))


BZ = [0, .15, .38, .70, 1.05, 1.45, 1.85, 2.25]
BR = [1.02, .86, .75, .68, .62, .58, .555, .54]
gs.tube('Bole', [bole_center(z) for z in BZ], BR, BARK, wood_g, sides=22,
        gnarl=.075, crease=.55, smooth=True, twist=.04)

# Splayed root buttresses at the foot
for i in range(8):
    a = i * math.tau / 8 + .2 + random.uniform(-.1, .1)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.75, 1.15)
    gs.tube('Root %d' % (i + 1),
            [bole_center(1.05),
             bole_center(.55) + out * reach * .35,
             bole_center(.18) + out * reach * .72,
             bole_center(0) + out * reach + Vector((0, 0, .04))],
            [.26, .34, .26, .035], BARK, wood_g, sides=10, gnarl=.07,
            crease=.5, smooth=True)

# Five heavy limbs fanning up out of the bole, clearly visible below the canopy
LIMBS = [(-.30, 1.60, 4.45), (1.05, 1.40, 4.05), (2.35, 1.60, 4.25),
         (3.55, 1.20, 3.85), (4.55, 1.50, 4.35)]
limb_tops = []
for i, (a, spread, top) in enumerate(LIMBS):
    d = Vector((math.cos(a), math.sin(a), 0))
    start = bole_center(2.10)
    path = [start,
            bole_center(2.55) + d * spread * .22,
            bole_center(3.10) + d * spread * .52,
            bole_center(3.60) + d * spread * .78,
            Vector((start.x + d.x * spread, start.y + d.y * spread, top))]
    gs.tube('Limb %d' % (i + 1), path, [.40, .33, .26, .20, .15],
            BARK, wood_g, sides=12, gnarl=.07, crease=.5, smooth=True)
    limb_tops.append(path[-1])
    # A secondary fork off each limb, so the crown has something to sit on
    d2 = Vector((math.cos(a + .8), math.sin(a + .8), 0))
    gs.tube('Limb %d fork' % (i + 1),
            [path[2], path[2] + d2 * .5 + Vector((0, 0, .55)),
             path[2] + d2 * .85 + Vector((0, 0, 1.15))],
            [.20, .14, .09], BARK, wood_g, sides=9, gnarl=.06, crease=.4, smooth=True)


# ------------------------------------------------------------------ leaves
def lobed_outline(width=.34, lobes=3.0, depth=.26, steps=44):
    """Oak-ish blade: an ovate base with rounded lobes down each side."""
    def half(y):
        base = width * math.sin(math.pi * min(1., y ** .72)) ** .58
        return base * (1 + depth * math.sin(y * lobes * math.tau + 1.3))
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


LEAVES = [gs.blade('Oak leaf %d' % i,
                   lobed_outline(random.uniform(.31, .40),
                                 lobes=random.choice([2.0, 2.5, 3.0]),
                                 depth=random.uniform(.14, .24)),
                   cup=random.uniform(.07, .15), droop=random.uniform(.10, .24),
                   lean=random.uniform(-.12, .12), rings=5, material=LEAF[4])
          for i in range(12)]

count = 0


def cluster(cx, cy, cz, R, n, seed):
    """One rounded puff of foliage: a hidden core sphere dressed in leaves."""
    global count
    bpy.ops.mesh.primitive_uv_sphere_add(segments=26, ring_count=16, radius=R * .80,
                                         location=(cx, cy, cz))
    core = bpy.context.object
    core.name = 'Cluster core %d' % seed
    for col in list(core.users_collection):
        col.objects.unlink(core)
    canopy_g.objects.link(core)
    core.data.materials.append(CORE)
    core.scale = (1, 1, .88)
    for p in core.data.polygons:
        p.use_smooth = True

    golden = math.pi * (3 - math.sqrt(5))
    for k in range(n):
        # Fibonacci over the sphere, but biased to the upper half - the
        # undersides are hidden by the clusters below.
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
        # Blades lie tangent to the cluster, pointing downhill across it, so
        # they blanket the surface rather than bristling off it.
        down = Vector((0, 0, -1))
        tang = (down - nrm * down.dot(nrm))
        if tang.length < 1e-4:
            tang = Vector((1, 0, 0))
        tang.normalize()
        swirl = random.uniform(-.75, .75)
        side = nrm.cross(tang)
        fwd = (tang + side * swirl + nrm * random.uniform(.12, .48)).normalized()
        right = fwd.cross(nrm)
        if right.length < 1e-5:
            right = fwd.cross(Vector((0, 0, 1)))
        right.normalize()
        up2 = right.cross(fwd).normalized()
        o.rotation_euler = Matrix((right, fwd, up2)).transposed().to_4x4().to_euler()
        L = R * random.uniform(.36, .56)
        o.scale = (L, L, L)
        lit = nrm.dot(KEY3)
        e = .30 + .40 * lit + .22 * (u * .5 + .5) + random.uniform(-.11, .11)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = gs.pick(LEAF, e)
        count += 1


# Twelve puffs massed into a broad dome. x, y, z, radius, leaf count
CLUSTERS = [
    (-.08, .22, 5.45, 1.58, 420),
    (-1.60, .08, 4.80, 1.36, 330),
    (1.48, -.18, 4.88, 1.40, 345),
    (-.92, -1.08, 4.52, 1.24, 270),
    (1.00, -1.00, 4.56, 1.26, 275),
    (.22, 1.26, 4.98, 1.28, 280),
    (-2.36, -.48, 4.06, 1.05, 205),
    (2.28, -.60, 4.10, 1.07, 210),
    (-.82, .82, 6.14, 1.12, 225),
    (.86, .60, 6.06, 1.06, 210),
    (-1.86, .90, 5.10, .96, 175),
    (1.90, .74, 5.18, .98, 180),
]
for i, (x, y, z, r, n) in enumerate(CLUSTERS):
    cluster(x, y, z, r, n, i)

# Reference bbox is 341x348 of 420 - nearly square, seen close to eye level.
gs.studio(studio_g, cam_pos=(1.2, -22, 4.9), target_z=3.80, ortho_scale=8.85,
          key=1150, fill=340, world=1.40)
gs.render(ROOT / 'ghibli_oak.blend', ROOT / 'ghibli_oak.png',
          note='Reference-matched golden oak, shared studio rig.')
print('oak built: %d leaves' % count, flush=True)
