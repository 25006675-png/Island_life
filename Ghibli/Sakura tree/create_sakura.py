"""Ghibli sakura tree.

Run: blender --background --python create_sakura.py

A spreading cherry: a dark twisted bole forking twice into open branch work,
carrying loose puffs of five-petal blossom, with a scatter of petals falling
around it. Unlike the oak, the reference leaves plenty of branch visible
between the clusters, so the branching is modelled properly rather than hidden.

Reference bbox is 353x390 of 420. Palette sampled off reference.png: blossom
runs pale pink to deep rose (252,203,219 / 240,149,182 / 222,126,163 /
197,104,139), bark a dark cool brown (107,81,77).
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
random.seed(31)
gs.reset()

wood_g = gs.collection('01 - Bole and branches')
bloom_g = gs.collection('02 - Blossom clusters')
fall_g = gs.collection('03 - Falling petals')
studio_g = gs.collection('04 - Camera and cream studio')

PINK = gs.ramp('Blossom', [(255, 228, 238), (252, 203, 219), (246, 176, 202),
                           (240, 149, 182), (224, 128, 165), (203, 108, 143),
                           (178, 92, 124)], 14)
BARK = gs.ramp('Bark', [(158, 124, 114), (140, 108, 100), (120, 92, 86),
                        (102, 78, 74), (84, 63, 62), (66, 49, 50)], 8)
CORE = gs.mat('Cluster core', gs.srgb(206, 122, 152))

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.05)).normalized()


# ------------------------------------------------------------------ branching
def bole_center(z):
    return Vector((.20 * math.sin(z * .85) - .05 * z, .07 * math.sin(z * 1.2), z))


BZ = [0, .14, .34, .62, .95, 1.30, 1.65, 2.00, 2.30]
BR = [.86, .74, .64, .565, .515, .482, .458, .440, .425]
gs.tube('Bole', [bole_center(z) for z in BZ], BR, BARK, wood_g, sides=20,
        gnarl=.085, crease=.55, smooth=True, twist=.05)

for i in range(7):
    a = i * math.tau / 7 + .25 + random.uniform(-.12, .12)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.60, .92)
    gs.tube('Root %d' % (i + 1),
            [bole_center(.95),
             bole_center(.48) + out * reach * .36,
             bole_center(.16) + out * reach * .74,
             bole_center(0) + out * reach + Vector((0, 0, .035))],
            [.22, .28, .21, .03], BARK, wood_g, sides=9, gnarl=.07,
            crease=.5, smooth=True)

tips = []


def branch(start, direction, length, radius, depth, tag):
    """Recursive limb. Each level sheds radius and splits into two or three."""
    rise = Vector((0, 0, 1))
    end = start + direction * length
    mid1 = start + direction * (length * .34) + rise * (length * .10)
    mid2 = start + direction * (length * .68) + rise * (length * .06)
    gs.tube('Branch %s' % tag,
            [start, mid1, mid2, end],
            [radius, radius * .80, radius * .60, radius * .46],
            BARK, wood_g, sides=max(6, 11 - depth * 2), gnarl=.075,
            crease=.5, smooth=True)
    if depth >= 3:
        tips.append((end, radius))
        return
    for k in range(2 if depth >= 2 else 3):
        # Splay each child away from its parent and tip it back toward vertical.
        yaw = random.uniform(-1.05, 1.05)
        spread = random.uniform(.45, .85)
        side = direction.cross(rise)
        if side.length < 1e-4:
            side = Vector((1, 0, 0))
        side.normalize()
        up = side.cross(direction).normalized()
        d = (direction + side * (math.sin(yaw) * spread)
             + up * (math.cos(yaw) * spread * .55) + rise * .30).normalized()
        branch(end, d, length * random.uniform(.62, .78), radius * .62,
               depth + 1, '%s.%d' % (tag, k))


FORK = bole_center(2.30)
for i, a in enumerate([.35, 2.45, 4.35]):
    d = Vector((math.cos(a) * .62, math.sin(a) * .62, 1.0)).normalized()
    branch(FORK, d, 1.55, .34, 1, str(i + 1))


# ------------------------------------------------------------------ blossom
def rosette(name, R, lobes=5, steps=72, material=None):
    """A five-petal cherry blossom as one flat mesh, notched between petals."""
    verts = [(0, 0, 0)]
    faces = []
    for i in range(steps):
        th = i * math.tau / steps
        # |cos| lobes give rounded petals with a clean notch at each join.
        f = .46 + .54 * abs(math.cos(lobes * th / 2)) ** .55
        r = R * f
        verts.append((r * math.cos(th), r * math.sin(th),
                      -.14 * R * f * f + .06 * R))
    for i in range(steps):
        faces.append((0, 1 + i, 1 + (i + 1) % steps))
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    if material:
        d.materials.append(material)
    for p in d.polygons:
        p.use_smooth = True
    return d


BLOSSOMS = [rosette('Blossom %d' % i, random.uniform(.42, .56),
                    material=PINK[4]) for i in range(8)]


def petal_outline(width=.30, steps=18):
    def half(y):
        if y < .42:
            return width * (y / .42) ** .5
        u = (y - .42) / .58
        return width * max(0., 1 - u ** 3.0) ** .5
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts.append((0., .90))                       # cherry petals are tip-notched
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


PETALS = [gs.blade('Petal %d' % i, petal_outline(random.uniform(.26, .34)),
                   cup=.10, droop=.12, rings=3, material=PINK[3])
          for i in range(5)]

count = 0


def cluster(cx, cy, cz, R, n, seed):
    global count
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=14, radius=R * .78,
                                         location=(cx, cy, cz))
    core = bpy.context.object
    core.name = 'Cluster core %d' % seed
    for col in list(core.users_collection):
        col.objects.unlink(core)
    bloom_g.objects.link(core)
    core.data.materials.append(CORE)
    core.scale = (1, 1, .86)
    for p in core.data.polygons:
        p.use_smooth = True

    golden = math.pi * (3 - math.sqrt(5))
    for k in range(n):
        u = 1 - 1.7 * (k + .5) / n
        u = max(-.68, u)
        rho = math.sqrt(max(0., 1 - u * u))
        a = k * golden + seed
        nrm = Vector((rho * math.cos(a), rho * math.sin(a), u))
        pos = Vector((cx, cy, cz)) + nrm * (R * (.90 + .12 * gs.lump(
            cx + nrm.x * 2.2, cy + nrm.y * 2.2, seed)))
        o = bpy.data.objects.new('Blossom %04d' % count,
                                 BLOSSOMS[(count * 3 + seed) % len(BLOSSOMS)])
        bloom_g.objects.link(o)
        o.location = pos
        # Rosettes face outward along the cluster normal, spun at random.
        fwd = nrm
        right = fwd.cross(Vector((0, 0, 1)))
        if right.length < 1e-5:
            right = fwd.cross(Vector((1, 0, 0)))
        right.normalize()
        up2 = right.cross(fwd).normalized()
        fwd = (fwd + right * random.uniform(-.34, .34)
               + up2 * random.uniform(-.34, .34)).normalized()
        right = fwd.cross(Vector((0, 0, 1)))
        if right.length < 1e-5:
            right = fwd.cross(Vector((1, 0, 0)))
        right.normalize()
        up2 = right.cross(fwd).normalized()
        m = Matrix((right, up2, fwd)).transposed().to_4x4()
        o.rotation_euler = m.to_euler()
        o.rotation_euler.rotate_axis('Z', random.uniform(0, math.tau))
        L = R * random.uniform(.26, .42)
        o.scale = (L, L, L)
        lit = nrm.dot(KEY3)
        e = .34 + .38 * lit + .20 * (u * .5 + .5) + random.uniform(-.12, .12)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = gs.pick(PINK, e)
        count += 1


# Loose puffs, deliberately gappy so branch work shows between them.
CLUSTERS = [
    (-.20, .34, 6.02, 1.06, 330),
    (-1.80, .10, 5.02, 1.00, 300),
    (1.74, -.28, 4.78, .98, 292),
    (-2.60, -.80, 3.92, .84, 210),
    (2.44, -.62, 3.82, .82, 202),
    (.36, 1.42, 5.18, .90, 240),
    (-1.02, -1.16, 4.48, .82, 200),
    (1.14, -1.20, 5.12, .80, 195),
    (-1.24, 1.02, 6.42, .84, 210),
    (1.30, .76, 6.22, .80, 198),
    (-2.74, .60, 5.02, .74, 165),
    (2.68, .38, 4.94, .72, 160),
    (.05, -1.70, 3.62, .68, 140),
    (-.80, .55, 6.85, .66, 135),
    (.95, 1.72, 4.30, .70, 148),
    (-1.95, -1.35, 4.62, .70, 148),
    (2.05, 1.05, 5.72, .68, 140),
]
for i, (x, y, z, r, n) in enumerate(CLUSTERS):
    cluster(x, y, z, r, n, i)

# Petals drifting around the tree, as in the reference.
for i in range(16):
    a = random.uniform(0, math.tau)
    rr = random.uniform(2.6, 4.0)
    o = bpy.data.objects.new('Falling petal %02d' % i, random.choice(PETALS))
    fall_g.objects.link(o)
    o.location = (rr * math.cos(a) * .95, random.uniform(-2.2, -.6),
                  random.uniform(1.4, 6.3))
    o.rotation_euler = (random.uniform(0, math.tau), random.uniform(0, math.tau),
                        random.uniform(0, math.tau))
    s = random.uniform(.30, .46)
    o.scale = (s, s, s)
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = gs.pick(PINK, random.uniform(.45, .95))

# Reference bbox 353x390 of 420.
gs.studio(studio_g, cam_pos=(1.3, -22, 5.0), target_z=3.75, ortho_scale=8.30,
          key=1120, fill=350, world=1.45)
gs.render(ROOT / 'ghibli_sakura.blend', ROOT / 'ghibli_sakura.png',
          note='Reference-matched sakura, shared studio rig.')
print('sakura built: %d blossoms' % count, flush=True)
