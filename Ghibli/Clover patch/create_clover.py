"""Ghibli clover ground patch.

Run: blender --background --python create_clover.py

A low elliptical bed of grass and trefoil clover, with white clover heads, blue
five-petal flowers and a couple of pebbles at the front edge. Reference bbox is
394x185 of 420 - very wide and shallow - which together with the patch depth
puts the camera at about 33 degrees elevation.

Palette sampled off reference.png: the greens run distinctly teal, not leaf
green (dominants 97,164,146 / 115,191,174 / 76,145,136).
"""
import math
import random
import sys
import pathlib

import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / '_common'))
import ghibli_studio as gs

ROOT = pathlib.Path(__file__).resolve().parent
random.seed(23)
gs.reset()

bed_g = gs.collection('01 - Bed')
grass_g = gs.collection('02 - Grass')
clover_g = gs.collection('03 - Clover trefoils')
white_g = gs.collection('04 - White clover heads')
blue_g = gs.collection('05 - Blue flowers')
stone_g = gs.collection('06 - Pebbles')
studio_g = gs.collection('07 - Camera and cream studio')

GRASS = gs.ramp('Grass', [(180, 216, 174), (152, 200, 164), (126, 188, 156),
                          (106, 172, 148), (88, 152, 142), (70, 130, 126)], 10)
LEAF = gs.ramp('Clover leaf', [(166, 210, 182), (136, 197, 173), (112, 181, 163),
                               (94, 161, 149), (76, 139, 135)], 9)
WHITE = gs.ramp('White floret', [(253, 251, 246), (243, 241, 231),
                                 (226, 224, 210), (203, 201, 186)], 6)
BLUE = gs.ramp('Blue petal', [(212, 222, 244), (178, 194, 236), (146, 166, 226),
                              (120, 142, 212)], 6)
YELLOW = gs.mat('Flower centre', gs.srgb(250, 220, 116))
STEM = gs.ramp('Stem', [(140, 188, 140), (112, 164, 122), (88, 140, 108)], 4)
STONE = gs.ramp('Pebble', [(162, 152, 172), (130, 122, 148), (100, 94, 116)], 5)
BED = gs.ramp('Bed', [(88, 148, 136), (70, 126, 120), (56, 108, 106)], 4)

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)

A, B, MOUND = 2.26, 1.42, .26          # patch half-width, half-depth, rise
# Reference sizes, converted at 394 px = 4.60 units across the patch:
# clover leaflet ~0.35, big foreground leaflet ~0.62, grass blade ~0.53,
# white clover head ~0.37 across, blue flower ~0.28 across.


def height(x, y):
    """Low dome over the elliptical footprint, with a gently uneven surface."""
    u = min(1., math.hypot(x / A, y / B))
    return MOUND * (1 - u ** 2) + .045 * gs.lump(x * 1.6, y * 1.9, 3.1)


def scatter(n, edge=1.0, tries=30, spacing=0.):
    """Points inside the ellipse, thinning toward the rim."""
    out = []
    for _ in range(n):
        for _ in range(tries):
            a = random.uniform(0, math.tau)
            u = math.sqrt(random.uniform(0, 1)) * edge
            x, y = A * u * math.cos(a), B * u * math.sin(a)
            if not spacing or all((x - px) ** 2 + (y - py) ** 2 > spacing ** 2
                                  for px, py in out):
                break
        out.append((x, y))
    return out


# ------------------------------------------------------------------ bed
def bed():
    """A shallow mound under the planting, so gaps read as shadowed turf."""
    seg, rings = 84, 14
    verts, faces = [], []
    for j in range(rings + 1):
        t = j / rings
        for k in range(seg):
            a = k * math.tau / seg
            wob = 1 + .05 * math.sin(3 * a) + .03 * math.cos(7 * a + 1)
            x, y = .84 * A * t * math.cos(a) * wob, .84 * B * t * math.sin(a) * wob
            verts.append((x, y, height(x, y) - .02))
    for j in range(rings):
        for k in range(seg):
            p = j * seg + k
            q = j * seg + (k + 1) % seg
            faces.append((p, q, q + seg, p + seg))
    obj = gs.mesh('Bed', verts, faces, BED, bed_g, smooth=True)
    for p in obj.data.polygons:
        p.material_index = min(len(BED) - 1, 1 + int(random.random() * 2))
    return obj


bed()


# ------------------------------------------------------------------ outlines
def grass_outline(width=.10, steps=18):
    """Narrow lanceolate blade, widest low down, drawn to a point."""
    def half(y):
        return width * (1 - y) ** .78 * (1 + .5 * y)
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


def obcordate_outline(width=.40, steps=30):
    """Heart-shaped clover leaflet: narrow at the stalk, notched at the tip."""
    def half(y):
        if y < .55:
            return width * (y / .55) ** .52
        u = (y - .55) / .45
        return width * max(0., 1 - u ** 2.4) ** .34   # broad but rounded lobes
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts.append((0., .79))                       # notch, ~1/5 of the leaflet
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


def petal_outline(width=.30, steps=18):
    """Rounded blue-flower petal."""
    def half(y):
        if y < .45:
            return width * (y / .45) ** .5
        u = (y - .45) / .55
        return width * max(0., 1 - u ** 2.6) ** .5
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


GRASS_BLADES = [gs.blade('Grass blade %d' % i, grass_outline(random.uniform(.042, .072)),
                         cup=random.uniform(.04, .10), droop=random.uniform(.10, .34),
                         lean=random.uniform(-.18, .18), rings=4, material=GRASS[3])
                for i in range(10)]
CLOVER_LEAFLETS = [gs.blade('Clover leaflet %d' % i, obcordate_outline(random.uniform(.36, .46)),
                            cup=random.uniform(.10, .19), droop=random.uniform(.05, .14),
                            rings=5, material=LEAF[2])
                   for i in range(8)]
BLUE_PETALS = [gs.blade('Blue petal %d' % i, petal_outline(random.uniform(.27, .34)),
                        cup=random.uniform(.06, .13), droop=random.uniform(.05, .13),
                        rings=4, material=BLUE[1])
               for i in range(5)]
FLORETS = [gs.blade('Floret %d' % i, petal_outline(random.uniform(.16, .22)),
                    cup=.14, droop=.10, rings=3, material=WHITE[1])
           for i in range(5)]

count = {'grass': 0, 'leaf': 0, 'floret': 0, 'petal': 0}


def put(data, group, loc, scale, pitch, yaw, mat, roll=0.):
    o = bpy.data.objects.new('%s %04d' % (data.name.split(' ')[0], len(group.objects)), data)
    group.objects.link(o)
    o.location = loc
    o.rotation_euler = (pitch, roll, yaw)
    o.scale = (scale, scale, scale)
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = mat
    return o


def lit_at(yaw, extra=0.):
    """Blades turned toward the key read lighter, as in the painted reference."""
    return .5 + .5 * math.cos(yaw - gs.KEY_AZIMUTH) + extra


# ------------------------------------------------------------------ grass
for (x, y) in scatter(215, edge=.94):
    z = height(x, y)
    for _ in range(random.randint(3, 6)):
        yaw = random.uniform(0, math.tau)
        # Blades lean outward near the rim, giving the patch its spiky fringe.
        out = math.atan2(y / B, x / A)
        u = min(1., math.hypot(x / A, y / B))
        yaw = out + random.uniform(-1.5, 1.5) if u > .62 else yaw
        pitch = 1.30 - .52 * u + random.uniform(-.20, .20)
        e = .24 + .40 * lit_at(yaw) + .22 * (1 - u) + random.uniform(-.13, .13)
        put(random.choice(GRASS_BLADES), grass_g,
            (x + random.uniform(-.09, .09), y + random.uniform(-.07, .07), z),
            random.uniform(.34, .62), pitch, yaw, gs.pick(GRASS, e))
        count['grass'] += 1

# ------------------------------------------------------------------ clover
for (x, y) in scatter(34, edge=.86, spacing=.24):
    z = height(x, y) + random.uniform(.02, .12)
    base_yaw = random.uniform(0, math.tau)
    s = random.uniform(.30, .60)
    for k in range(3):                          # trefoil
        yaw = base_yaw + k * math.tau / 3 + random.uniform(-.14, .14)
        pitch = random.uniform(.20, .52)
        e = .26 + .42 * lit_at(yaw) + random.uniform(-.12, .12)
        put(random.choice(CLOVER_LEAFLETS), clover_g,
            (x + .05 * s * math.cos(yaw), y + .05 * s * math.sin(yaw), z),
            s, pitch, yaw, gs.pick(LEAF, e))
        count['leaf'] += 1

# ------------------------------------------------------------------ white heads
WHITE_HEADS = [(-1.02, .28, .62), (.16, .46, .70), (.94, .10, .58), (-.34, -.30, .50)]
for i, (x, y, h) in enumerate(WHITE_HEADS):
    z = height(x, y)
    gs.tube('White stem %d' % i, [(x, y, z - .05), (x + .02, y, z + h * .55),
                                  (x + .04, y, z + h)],
            [.028, .024, .020], STEM, white_g, sides=8, gnarl=.02, crease=0, smooth=True)
    # Head: florets packed on a small ovoid, tighter and paler toward the top.
    top = Vector((x + .04, y, z + h))
    for n in range(40):
        u = (n + .5) / 40
        a = n * math.pi * (3 - math.sqrt(5))
        rr = .080 * math.sin(math.pi * min(1., u ** .75)) + .016
        pz = .058 * (u - .5) * 2
        e = .40 + .34 * lit_at(a) + .30 * u
        put(random.choice(FLORETS), white_g,
            (top.x + rr * math.cos(a), top.y + rr * math.sin(a) * .8, top.z + pz),
            random.uniform(.11, .17), random.uniform(.75, 1.35), a, gs.pick(WHITE, e))
        count['floret'] += 1

# ------------------------------------------------------------------ blue flowers
BLUES = [(-1.72, -.10, .16, .95), (-1.28, -.46, .10, .78), (-.62, .30, .26, 1.05),
         (-.10, -.62, .12, 1.10), (.42, .34, .24, .85), (.72, -.48, .10, 1.0),
         (1.24, .30, .22, 1.05), (1.66, -.06, .14, .80), (-1.90, .22, .08, .62),
         (.06, .12, .30, .70), (1.02, -.16, .16, .66)]
for i, (x, y, h, s) in enumerate(BLUES):
    z = height(x, y)
    gs.tube('Blue stem %d' % i, [(x, y, z - .04), (x, y, z + h)],
            [.020, .016], STEM, blue_g, sides=7, gnarl=.02, crease=0, smooth=True)
    face = random.uniform(-.5, .5)              # flowers tilt toward the camera
    for k in range(5):
        a = k * math.tau / 5 + random.uniform(-.10, .10)
        e = .42 + .30 * lit_at(a) + random.uniform(-.08, .08)
        put(random.choice(BLUE_PETALS), blue_g, (x, y, z + h),
            s * .26, .20 + random.uniform(-.12, .12), a, gs.pick(BLUE, e), roll=face * .3)
        count['petal'] += 1
    ring, rad = 10, .028 * s
    verts = [(0, 0, 0)] + [(rad * math.cos(k * math.tau / ring),
                            rad * math.sin(k * math.tau / ring), 0) for k in range(ring)]
    faces = [(0, 1 + k, 1 + (k + 1) % ring) for k in range(ring)]
    c = gs.mesh('Blue centre %d' % i, verts, faces, YELLOW, blue_g, smooth=True)
    c.location = (x, y, z + h + .006)

# ------------------------------------------------------------------ pebbles
for i, (x, y, r) in enumerate([(-1.12, -.72, .13), (1.06, -.74, .10), (.34, -.86, .075)]):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=r,
                                         location=(x, y, height(x, y) - r * .45))
    o = bpy.context.object
    o.name = 'Pebble %d' % (i + 1)
    o.scale = (1.35, 1.0, .72)
    for col in list(o.users_collection):
        col.objects.unlink(o)
    stone_g.objects.link(o)
    o.data.materials.append(STONE[1 + i % 3])
    for p in o.data.polygons:
        p.use_smooth = True

# Elevation ~33deg: the reference's 394x185 bbox against this patch depth.
gs.studio(studio_g, cam_pos=(.7, -17.0, 12.7), target_z=.32, ortho_scale=5.30,
          key=880, fill=340, world=1.62)
gs.render(ROOT / 'ghibli_clover.blend', ROOT / 'ghibli_clover.png',
          note='Reference-matched clover ground patch, shared studio rig.')
print('clover built: %s' % count, flush=True)
