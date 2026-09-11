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

import bmesh
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

# Stops follow the reference's k-means pinks, nudged bluer because the warm
# key light pushes them toward salmon. The old ramp ran on to a deep crimson
# (178,92,124) darker than anything in the reference, which read as dirt in
# the cluster shadows.
PINK_STOPS = [(252, 216, 232), (250, 200, 222), (246, 176, 204), (238, 152, 188),
              (228, 138, 178), (220, 128, 170), (204, 112, 152)]
PINK = gs.ramp('Blossom', PINK_STOPS, 14)
BARK = gs.ramp('Bark', [(130, 112, 100), (113, 95, 86), (98, 81, 75),
                        (85, 69, 65), (73, 59, 56), (64, 51, 49)], 8)
# Lobed, low cores support connected blossom clouds along spreading boughs.
CORE = gs.vcol_material('Cluster core')

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.05)).normalized()


# ------------------------------------------------------------------ branching
def bole_center(z):
    return Vector((.28 * math.sin(z * 2.0) - .07 * z, .07 * math.sin(z * 1.2), z))


# The bole runs on up into the fork and tapers away inside it, so the limbs
# grow out of its sides; ending it flat at the fork left a visible collar.
BZ = [0, .14, .34, .62, .95, 1.30, 1.65, 2.00, 2.30, 2.55, 2.80]
BR = [.62, .52, .44, .385, .35, .325, .305, .28, .25, .20, .10]
gs.tube('Bole', [bole_center(z) for z in BZ], BR, BARK, wood_g, sides=24,
        gnarl=.085, crease=.35, smooth=True, twist=.05)

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

def limb(name, path, radius):
    o = gs.tube(name, path,
                [radius * (1 - j / (len(path) - 1)) ** 1.15 + .012
                 for j in range(len(path))],
                BARK, wood_g, sides=12, gnarl=.05, crease=.3, smooth=True)
    # Open caps avoid dark collars where the branches merge.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if len(f.verts) > 4],
                     context='FACES_ONLY')
    bm.to_mesh(o.data)
    bm.free()
    return o


# Broad boughs sweep sideways, leaving windows into the dark branch network.
BOUGHS = [
    [bole_center(1.85), (-.75, .15, 2.7), (-1.7, .3, 3.0), (-2.8, .4, 3.25), (-4.2, .5, 3.55)],
    [bole_center(2.0), (.55, .1, 2.7), (1.65, .25, 3.0), (2.7, .5, 3.35), (4.1, .5, 3.6)],
    [bole_center(2.15), (-.65, .65, 3.2), (-1.35, .9, 4.0), (-2.25, 1.0, 4.55), (-3.45, .8, 4.7)],
    [bole_center(2.25), (.45, .65, 3.35), (1.3, 1.0, 4.0), (2.2, .9, 4.65), (3.35, .8, 4.8)],
    [bole_center(2.45), (-.5, .3, 3.5), (-.75, .5, 4.4), (-1.1, .4, 5.1), (-1.65, .3, 5.8)],
    [bole_center(2.5), (.0, .35, 3.6), (.55, .5, 4.6), (.85, .4, 5.25), (1.5, .2, 5.9)],
]
BOUGHS = [[Vector(p) for p in path] for path in BOUGHS]
for i, path in enumerate(BOUGHS):
    limb('Bough %02d' % i, path, .25 if i < 2 else .20)


# ------------------------------------------------------------------ blossom
def rosette(name, R, lobes=5, steps=48, material=None):
    """A five-petal cherry blossom as one flat mesh, notched between petals."""
    verts = [(0, 0, 0)]
    faces = []
    for i in range(steps):
        th = i * math.tau / steps
        # |cos| lobes give rounded petals with a clean notch at each join.
        f = .46 + .54 * abs(math.cos(lobes * th / 2)) ** .55
        r = R * f
        # Deeply cupped: edge-on at a cluster's outline a flat rosette is a
        # straight line, and stacked lines squared the clusters off. A cup
        # shows as a curved bump instead, so the outline scallops round.
        verts.append((r * math.cos(th), r * math.sin(th),
                      -.36 * R * f * f + .12 * R))
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


# Fewer, larger blossoms: thousands of small ones read as speckle.
BLOSSOMS = [rosette('Blossom %d' % i, random.uniform(.52, .66),
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


def lobe(direction, seed):
    x, y, z = direction
    return (1 + .14 * math.sin(3.8 * x + 1.3 * y + seed)
            + .10 * math.cos(4.6 * y - 2.8 * z + seed * .7)
            + .065 * math.sin(8.5 * x + 4.1 * y + 2.6 * z + seed))


def cluster(cx, cy, cz, R, n, seed):
    global count
    # Each puff has its own proportions and lean, instead of identical spheres.
    # Keep this RNG separate so changing the shape doesn't reshuffle the tree.
    shape_rng = random.Random(3100 + seed)
    axes = Vector((shape_rng.uniform(1.25, 1.60), shape_rng.uniform(.90, 1.25),
                   shape_rng.uniform(.40, .62)))
    turn = (Matrix.Rotation(shape_rng.uniform(-.16, .16), 3, 'Y')
            @ Matrix.Rotation(shape_rng.uniform(-.13, .13), 3, 'X')
            @ Matrix.Rotation(shape_rng.uniform(-.5, .5), 3, 'Z'))
    shape = turn @ Matrix.Diagonal(axes)
    # The core and blossoms share a lobed surface, so the irregular silhouette
    # stays filled. Broad overlapping forms read as flowering branches.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=28, radius=R * .82,
                                         location=(cx, cy, cz))
    core = bpy.context.object
    core.name = 'Cluster core %d' % seed
    for col in list(core.users_collection):
        col.objects.unlink(core)
    bloom_g.objects.link(core)
    core.data.materials.append(CORE)
    core.scale = axes
    core.rotation_euler = turn.to_euler()
    for vertex in core.data.vertices:
        vertex.co *= lobe(vertex.co.normalized(), seed)
    core.data.update()
    for p in core.data.polygons:
        p.use_smooth = True
    gs.paint(core, lambda co, n: gs.grad(PINK_STOPS, .60 - .26 * n.dot(KEY3) - .12 * n.z))

    def surface(direction):
        return shape @ direction * (R * .82 * lobe(direction, seed))

    golden = math.pi * (3 - math.sqrt(5))
    for k in range(n):
        u = 1 - 2 * (k + .5) / n
        rho = math.sqrt(max(0., 1 - u * u))
        a = k * golden + seed
        radial = Vector((rho * math.cos(a), rho * math.sin(a), u))
        # Small positional jitter hides the planting spiral while preserving
        # coverage. Orient to the actual lobed surface, including its slopes.
        radial = (radial + Vector([shape_rng.uniform(-.045, .045) for _ in range(3)])).normalized()
        tangent = radial.cross(Vector((0, 0, 1)))
        if tangent.length < 1e-5:
            tangent = radial.cross(Vector((1, 0, 0)))
        tangent.normalize()
        bitangent = radial.cross(tangent).normalized()
        p = surface(radial)
        du = surface((radial + tangent * .001).normalized()) - p
        dv = surface((radial + bitangent * .001).normalized()) - p
        nrm = du.cross(dv).normalized()
        tuft = max(-1., min(1., gs.lump(radial.x * 1.4, radial.y * 1.4, seed) * .6))
        pos = Vector((cx, cy, cz)) + p + nrm * R * (.105 + .015 * tuft)
        o = bpy.data.objects.new('Blossom %04d' % count,
                                 BLOSSOMS[(count * 3 + seed) % len(BLOSSOMS)])
        bloom_g.objects.link(o)
        o.location = pos
        o['cluster_seed'] = seed
        # Rosettes face outward along the cluster normal, spun at random.
        fwd = nrm
        right = fwd.cross(Vector((0, 0, 1)))
        if right.length < 1e-5:
            right = fwd.cross(Vector((1, 0, 0)))
        right.normalize()
        up2 = fwd.cross(right).normalized()
        # Modest tilt: at +-.34 some rosettes faced the key head-on and blew
        # out to near-white stickers whatever shade they were given.
        fwd = (fwd + right * random.uniform(-.17, .17)
               + up2 * random.uniform(-.17, .17)).normalized()
        right = fwd.cross(Vector((0, 0, 1)))
        if right.length < 1e-5:
            right = fwd.cross(Vector((1, 0, 0)))
        right.normalize()
        # Columns must form a right-handed rotation. A mirrored frame loses
        # the outward normal when converted to Euler angles, flattening the puffs.
        up2 = fwd.cross(right).normalized()
        m = Matrix((right, up2, fwd)).transposed().to_4x4()
        o.rotation_euler = m.to_euler()
        o.rotation_euler.rotate_axis('Z', random.uniform(0, math.tau))
        # Outward-facing, cupped petals preserve the round silhouette.
        L = R * random.uniform(.23, .36) * (1.0 + .16 * tuft)
        o.scale = (L, L * shape_rng.uniform(.86, 1.12), L)
        lit = nrm.dot(KEY3)
        # Small jitter only: at +-.12 neighbouring blossoms jumped several
        # shades apart and the canopy looked speckled.
        # Narrow range: the ramp's ends are for accents, not whole blossoms.
        e = .40 + .24 * lit + .18 * (u * .5 + .5) + random.uniform(-.05, .05)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = gs.pick(PINK, e)
        count += 1


# Staggered, overlapping sprays form an umbrella crown. The foreground leaves
# openings between tiers so the spreading branch structure is still visible.
CLUSTERS = [
    (-2.0, .85, 5.35, .85, 290), (-.65, 1.05, 5.65, .95, 330),
    (.80, .90, 5.65, .92, 320), (2.12, .85, 5.30, .80, 280),
    (-3.12, .70, 4.65, .88, 300), (-1.62, .80, 4.62, 1.0, 340),
    (.05, .90, 4.72, .85, 290), (1.65, .75, 4.65, .96, 330),
    (3.15, .65, 4.62, .85, 290),
    (-3.72, .42, 3.62, .78, 270), (-2.38, .48, 3.50, .94, 320),
    (-.92, .72, 3.57, .72, 250), (1.02, .75, 3.52, .78, 270),
    (2.52, .48, 3.58, .95, 330), (3.72, .35, 3.73, .72, 250),
    (-2.95, -.85, 4.04, .82, 280), (-1.65, -.95, 4.05, .88, 300),
    (.96, -.85, 4.12, .82, 280), (2.62, -.80, 4.08, .86, 300),
    (-1.42, -.55, 5.40, .80, 280), (.08, -.60, 5.65, .90, 310),
    (1.48, -.60, 5.38, .78, 270),
    (-4.18, -.15, 3.97, .43, 150), (4.05, .05, 4.13, .48, 170),
    (-2.90, -.15, 5.03, .47, 170), (2.95, -.05, 5.08, .42, 150),
    (-.55, -.45, 3.13, .43, 150), (1.88, -.35, 3.10, .46, 160),
]


def twig_spray(seed, center, radius):
    # Grow each blossom spray from the nearest spreading bough. Sampling the
    # bough segments keeps the joins on the wood, even when a spray moves.
    candidates = [a.lerp(b, j / 12) for path in BOUGHS
                  for a, b in zip(path, path[1:]) for j in range(1, 13)]
    anchor = min(candidates, key=lambda p: (p - center).length)
    end = center + Vector((0, 0, -.08))
    bend = anchor.lerp(end, .55) + Vector((0, 0, -.16))
    limb('Spray branch %02d' % seed, [anchor, bend, end], .065)
    rng = random.Random(6800 + seed)
    for j in range(4):
        start = bend.lerp(end, .25 + j * .16)
        # Tips stay inside the flattened blossom core: a wider or higher spread
        # (the old +-1.25 x, +.06-.35 up) poked twig ends out through the pink,
        # and they read as dark specks round the canopy edge.
        tip = center + Vector((rng.uniform(-.65, .65) * radius,
                               rng.uniform(-.40, .40) * radius,
                               rng.uniform(-.20, 0) * radius))
        limb('Twig %02d.%d' % (seed, j), [start, start.lerp(tip, .55), tip], .025)


for i, (x, y, z, r, n) in enumerate(CLUSTERS):
    twig_spray(i, Vector((x, y, z)), r)
    cluster(x, y, z, r, int(n * .75), i)

# Petals drifting around the tree, as in the reference.
for i in range(16):
    a = random.uniform(0, math.tau)
    rr = random.uniform(3.1, 5.0)
    o = bpy.data.objects.new('Falling petal %02d' % i, random.choice(PETALS))
    fall_g.objects.link(o)
    o.location = (rr * math.cos(a) * .95, random.uniform(-2.2, -.6),
                  random.uniform(1.4, 6.3))
    o.rotation_euler = (random.uniform(0, math.tau), random.uniform(0, math.tau),
                        random.uniform(0, math.tau))
    s = random.uniform(.20, .34)
    o.scale = (s, s, s)
    o.material_slots[0].link = 'OBJECT'
    o.material_slots[0].material = gs.pick(PINK, random.uniform(.40, .78))

# Match the previous sakura's footprint (~6.9 x 4.75) and height (~7.5).
# Bake the proportions into mesh data so browser export retains them. Changing
# only object matrices would lose the shear on tilted blossom instances.
bpy.context.view_layer.update()
asset_fit = Matrix.Diagonal((.704, 1.087, 1.187, 1.0))
for obj in list(wood_g.objects) + list(bloom_g.objects) + list(fall_g.objects):
    if obj.type != 'MESH':
        continue
    previous = obj.matrix_world.copy()
    fitted = previous.copy()
    fitted.translation = asset_fit @ previous.translation
    if obj.data.users > 1:
        obj.data = obj.data.copy()
    obj.data.transform(fitted.inverted() @ asset_fit @ previous)
    obj.data.update()
    obj.matrix_world = fitted

gs.studio(studio_g, cam_pos=(1.3, -22, 5.0), target_z=3.75, ortho_scale=8.40,
          key=1120, fill=350, world=1.45)
gs.render(ROOT / 'ghibli_sakura.blend', ROOT / 'ghibli_sakura.png',
          note='Reference-matched sakura, shared studio rig.')
print('sakura built: %d blossoms' % count, flush=True)
