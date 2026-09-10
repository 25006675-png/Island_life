"""Ghibli purple tree, v7 - spire, and tone pulled back off v6's overshoot.

Run: blender --background --python create_ghibli_tree_v7.py

v6 -> v7:
  * foliage ramp re-derived from the reference quartiles divided by the rig's
    measured ~1.15 gain; v6 rendered a median of (187,140,214) against the
    reference's (121,113,205) and clipped the highlights.
  * exposure bias mostly removed, for the same reason.
  * the top tier gets a narrow cone core that rises clear of its leaf dome,
    matching the bare spire in the reference. Core radius and height are now
    scaled independently of the leaf dome.
  * rim droop tamed and upper limbs pulled in so no twigs poke through.

v5 -> v6:
  * tier heights/radii and stacking taken off measurements of the reference,
    so the three crowns read as separate parasols instead of one cone.
  * top spire is a bare smooth cone for its first third, as in the reference;
    leaves only start below t=0.15.
  * bark ramp lifted ~40% (v5 trunk median was 80,61,62 vs reference 124,102,93).
  * foliage ramp re-anchored on the reference quartiles and the exposure
    distribution biased brighter so a quarter of the leaves reach the pinks.
  * deep shade warmed off navy toward the reference's (81,65,87).

v4 -> v5:
  * Standard view transform. AgX was desaturating the foliage to grey
    (median rgb 192,182,207 against the reference's 121,113,205).
  * every palette entry is an sRGB value sampled off the reference and
    converted to linear, so what is authored is what renders.
  * near-uniform world lighting: form comes from the per-leaf shade ramp and
    from contact occlusion, the way the painted reference reads.
  * warm-brown bark again (reference trunk median is 124,102,93, not purple).
  * lumps driven by 2D noise instead of a radial term, killing v4's
    concentric pinecone rings; wider leaf size spread so blades read singly.
  * fuller cone apex, softer rim pitch, tighter framing.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
random.seed(11)

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.users == 0:
        bpy.data.collections.remove(c)

KEY_AZIMUTH = math.radians(215)   # key light sits back-left of the tree


def srgb(*rgb255):
    """sRGB byte triple sampled off the reference -> Blender linear."""
    out = []
    for v in rgb255:
        u = v / 255.0
        out.append(u / 12.92 if u <= .04045 else ((u + .055) / 1.055) ** 2.4)
    return tuple(out)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


wood = collection('01 - Trunk, roots and limbs')
crowns = [collection('0%d - %s canopy' % (i + 2, n))
          for i, n in enumerate(('Lower', 'Middle', 'Top'))]
studio = collection('05 - Camera and cream studio')


def mat(name, rgb, roughness=.94):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1)
    m.use_nodes = True
    s = m.node_tree.nodes['Principled BSDF']
    s.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    s.inputs['Roughness'].default_value = roughness
    s.inputs['Specular IOR Level'].default_value = .06
    return m


# Foliage ramp sampled off the reference, brightest sunlit top -> deepest shade.
LEAF_SRGB = [
    (196, 165, 200), (185, 153, 198), (174, 141, 196), (164, 129, 193),
    (144, 119, 188), (124, 109, 183), (105,  98, 178), (100,  93, 162),
    ( 95,  88, 146), ( 91,  83, 130), ( 80,  70, 103), ( 70,  57,  76),
]
leaves = [mat('Lilac %02d' % i, srgb(*c)) for i, c in enumerate(LEAF_SRGB)]
DEEP = len(leaves) - 1

# Bark ramp, lit face -> shadow face. Warm brown drifting purple in shadow.
BARK_SRGB = [
    (196, 165, 147), (176, 145, 131), (154, 126, 116),
    (132, 107, 102), (112,  90,  92), ( 94,  76,  82),
]
barks = [mat('Bark %02d' % i, srgb(*c)) for i, c in enumerate(BARK_SRGB)]

CREAM = srgb(235, 226, 214)


def mesh(name, verts, faces, mats, group):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    group.objects.link(o)
    for m in mats:
        d.materials.append(m)
    return o


def tube(name, path, radii, sides=12):
    """Swept tube with a light gnarl; faces shaded by how they face the key."""
    verts, faces = [], []
    for j, (pt, rad) in enumerate(zip(path, radii)):
        pt = Vector(pt)
        tan = Vector(path[min(j + 1, len(path) - 1)]) - Vector(path[max(0, j - 1)])
        tan.normalize()
        across = tan.cross(Vector((0, 1, 0)))
        if across.length < 1e-4:
            across = tan.cross(Vector((1, 0, 0)))
        across.normalize()
        side = tan.cross(across).normalized()
        for k in range(sides):
            a = 2 * math.pi * k / sides + j * .05
            r = rad * (1 + .085 * math.sin(k * 2.0 + j * .3) + .045 * math.sin(k * 5.0 + j * .8))
            verts.append(pt + r * (math.cos(a) * across + math.sin(a) * side))
    for j in range(len(path) - 1):
        for k in range(sides):
            a = j * sides + k
            b = j * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(path) - 1) * sides + k for k in range(sides)))
    obj = mesh(name, verts, faces, barks, wood)
    kx, ky = math.cos(KEY_AZIMUTH + math.pi), math.sin(KEY_AZIMUTH + math.pi)
    for p in obj.data.polygons:
        lit = p.normal.x * kx + p.normal.y * ky            # -1 shadow .. 1 lit
        # Vertical creases: a slow angular ripple darkens scattered strips.
        crease = .55 * math.sin(math.atan2(p.normal.y, p.normal.x) * 5.0 + p.center.z * .7)
        idx = (1 - lit) * .5 * 5.6 + crease
        p.material_index = min(5, max(0, int(round(idx))))
    return obj


def trunk_center(z):
    """Near-straight trunk with a gentle lean, like the reference."""
    return Vector((.135 * math.sin(z * .58) - .05, .055 * math.sin(z * .85), z))


# ---------------------------------------------------------------- trunk
TZ = [0, .15, .40, .80, 1.30, 1.90, 2.40, 2.90, 3.50, 4.20, 4.90, 5.60, 6.30, 6.90]
TR = [.62, .53, .44, .385, .350, .330, .315, .300, .265, .228, .190, .152, .112, .040]
dz, dr = [], []
for j in range(len(TZ) - 1):
    for f in (0, .34, .67):
        dz.append(TZ[j] * (1 - f) + TZ[j + 1] * f)
        dr.append(TR[j] * (1 - f) + TR[j + 1] * f)
dz.append(TZ[-1])
dr.append(TR[-1])
tube('Trunk', [trunk_center(z) for z in dz], dr, 16)

# Short fat buttresses that hug the ground rather than tentacles.
for i in range(6):
    a = i * math.tau / 6 + .28 + random.uniform(-.12, .12)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.50, .74)
    path = [trunk_center(1.05),
            trunk_center(.55) + out * reach * .34,
            trunk_center(.18) + out * reach * .72,
            trunk_center(0) + out * reach + Vector((0, 0, .035))]
    tube('Root buttress %d' % (i + 1), path, [.175, .215, .150, .022], 9)

# Two dominant limbs fork below the lower crown; the rest feed the tiers above.
LIMBS = [(2.44, 1.36, [-.50, 2.65], .132),
         (2.82, 1.06, [1.10, 3.90], .092),
         (4.74, .62, [.15, 3.10], .078),
         (6.10, .30, [1.60, 4.55], .050)]
for level, spread, angles, thick in LIMBS:
    for i, a in enumerate(angles):
        d = Vector((math.cos(a), math.sin(a), 0))
        path = [trunk_center(level),
                trunk_center(level + .28) + d * spread * .26,
                trunk_center(level + .58) + d * spread * .55,
                trunk_center(level + .84) + d * spread * .78,
                trunk_center(level + .95) + d * spread * .90]
        tube('Limb %.1f/%d' % (level, i + 1), path,
             [thick, thick * .80, thick * .58, thick * .34, .010], 9)


# ---------------------------------------------------------------- leaf
def petal_mesh(variant):
    """Blunt ovate blade with a shallow tip notch, cupped and drooping."""
    rng = random.Random(900 + variant)
    width = rng.uniform(.40, .54)
    shoulder = rng.uniform(.36, .50)      # height of the widest point
    tip_blunt = rng.uniform(2.6, 4.4)     # higher = blunter tip
    notch = rng.uniform(.02, .09)

    def half_width(y):
        if y <= shoulder:
            u = (shoulder - y) / shoulder
            return width * max(0., 1 - u ** 2.1) ** .58
        u = (y - shoulder) / (1 - shoulder)
        return width * max(0., 1 - u ** tip_blunt) ** .52

    steps = 30
    outline = []
    for i in range(steps + 1):                       # right edge, stem -> tip
        y = i / steps
        outline.append(Vector((half_width(y), y)))
    outline.append(Vector((0., 1 - notch)))          # tip notch
    for i in range(steps, -1, -1):                   # left edge, tip -> stem
        y = i / steps
        outline.append(Vector((-half_width(y), y)))

    lean = rng.uniform(-.13, .13)
    twist = rng.uniform(-.14, .14)
    droop = rng.uniform(.14, .28)
    cup = rng.uniform(.08, .16)
    mirror = -1 if variant % 2 else 1

    def curved(x, y):
        x = x + lean * y * y
        z = cup * math.sin(math.pi * min(1., y)) - droop * y * y - .18 * x * x + twist * x * y
        return (mirror * x, y, z)

    centre = Vector((0., .46))
    verts = [curved(centre.x, centre.y)]
    faces = []
    n, rings = len(outline), 6
    for ring in range(1, rings + 1):
        for e in outline:
            p = centre + (e - centre) * ring / rings
            verts.append(curved(p.x, p.y))
    for k in range(n):
        faces.append((0, 1 + k, 1 + (k + 1) % n))
    for ring in range(rings - 1):
        for k in range(n):
            a = 1 + ring * n + k
            b = 1 + ring * n + (k + 1) % n
            faces.append((a, a + n, b + n, b))
    if mirror < 0:
        faces = [tuple(reversed(f)) for f in faces]
    d = bpy.data.meshes.new('Leaf blade %02d' % (variant + 1))
    d.from_pydata(verts, [], faces)
    d.update()
    d.materials.append(leaves[5])
    for p in d.polygons:
        p.use_smooth = True
    return d


petals = [petal_mesh(i) for i in range(12)]
leaf_count = 0


def lump(x, y, seed):
    """Smooth irregular 2D bumpiness. Radial terms made v4 look like a pinecone."""
    return (math.sin(2.1 * x + 1.3 + seed) * math.cos(1.7 * y - .6) +
            .62 * math.sin(3.3 * y + 2.2 - seed) * math.cos(2.9 * x + 1.1) +
            .38 * math.sin(5.1 * x - 1.9) * math.cos(4.7 * y + seed))


# ---------------------------------------------------------------- crowns
def crown(index, base, radius, height, exponent, anchors, rim_n,
          core_drop=.13, core_shade=None, bare_tip=0.,
          core_r=.90, core_h=1.0, core_exp=None):
    """One foliage tier: a hidden dome shell dressed in individually placed leaves."""
    global leaf_count
    group = crowns[index]
    c = trunk_center(base)
    squash = .90                                     # slight ellipse in Y
    seed = index * 2.7

    # Hidden inner volume: deep shade so any peep-through reads as dense foliage.
    verts, faces, seg = [], [], 56
    for j in range(15):
        t = j / 14
        rr = radius * core_r * t
        z = base + height * core_h * (1 - t ** (core_exp or exponent))
        for k in range(seg):
            a = k * math.tau / seg
            asym = 1 + .035 * math.sin(3 * a + index) + .02 * math.cos(5 * a)
            verts.append((c.x + rr * math.cos(a) * asym,
                          c.y + rr * math.sin(a) * squash * asym, z - core_drop))
    for j in range(14):
        for k in range(seg):
            a = j * seg + k
            b = j * seg + (k + 1) % seg
            faces.append((a, a + seg, b + seg, b))
    faces.append(tuple(reversed([14 * seg + k for k in range(seg)])))
    core = mesh('Crown core', verts, faces,
                [leaves[DEEP if core_shade is None else core_shade]], group)
    for p in core.data.polygons:
        p.use_smooth = True

    leaf_len = (.455, .395, .335)[index]

    def place(t, a, fan, lift, scale, pitch, exposure):
        global leaf_count
        rr = radius * t
        px = rr * math.cos(a)
        py = rr * math.sin(a) * squash
        z = base + height * (1 - min(t, 1.) ** exponent) + .085 * lump(px, py, seed) + lift
        shade = min(DEEP, max(0, int((1 - max(0., min(1., exposure))) * (DEEP + .99))))
        o = bpy.data.objects.new('Leaf %04d' % leaf_count,
                                 petals[(leaf_count * 7 + index) % len(petals)])
        group.objects.link(o)
        o.location = (c.x + px, c.y + py, z)
        o.rotation_euler = (-pitch, random.uniform(-.42, .42), a + fan - math.pi / 2)
        L = leaf_len * scale
        o.scale = (L * random.uniform(.84, 1.0), L, L)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = leaves[shade]
        leaf_count += 1

    golden = math.pi * (3 - math.sqrt(5))

    def slope(t):
        # Surface slope of the dome, so leaves lie along the cap.
        return math.atan(exponent * height / radius * max(t, .04) ** (exponent - 1))

    for k in range(anchors):
        t = bare_tip + (1 - bare_tip) * math.sqrt((k + .5) / anchors) * .955
        a = k * golden + random.uniform(-.07, .07)
        lit = (1 - t) ** .70
        side = .5 + .5 * math.cos(a - KEY_AZIMUTH)
        # Bumps read as tufts: a leaf sitting on a crest catches more light.
        crest = .5 + .22 * lump(radius * t * math.cos(a), radius * t * math.sin(a), seed)
        exposure = .02 + .42 * lit + .26 * side + .22 * crest + random.uniform(-.11, .11)
        place(t, a, random.uniform(-.34, .34), .035 + random.uniform(-.025, .025),
              random.uniform(.76, 1.30), slope(t) * .84 + random.uniform(-.14, .14),
              exposure)

    # Rim: two staggered rows tucked under, giving the scalloped edge its weight.
    rim_rows = [(.90, 1.00, -.05, .34, .62, 0),
                (.86, .98, -.16, .52, .82, 1)]
    for tmin, tmax, drop, pitch_lo, pitch_hi, row in rim_rows:
        for k in range(rim_n):
            a = k * math.tau / rim_n + row * math.pi / rim_n + random.uniform(-.06, .06)
            side = .5 + .5 * math.cos(a - KEY_AZIMUTH)
            exposure = (.30 + .28 * side + random.uniform(-.09, .09)) * (1 - .20 * row)
            place(random.uniform(tmin, tmax), a, random.uniform(-.26, .26),
                  drop + random.uniform(-.035, .035), random.uniform(.85, 1.25),
                  random.uniform(pitch_lo, pitch_hi), exposure)

    # Cone apex needs its own dressing; the area-uniform scatter leaves it bald.
    if index == 2:
        for k in range(34):
            t = bare_tip + (k + .5) / 34 * .22
            a = k * golden
            side = .5 + .5 * math.cos(a - KEY_AZIMUTH)
            place(t, a, random.uniform(-.45, .45), .01 + random.uniform(0, .07),
                  random.uniform(.42, .78), random.uniform(.25, .80),
                  .66 + .26 * side + random.uniform(-.09, .09))


# Heights, radii and stacking are read off the reference: rim bottoms at
# z 2.44 / 4.44 / 5.98, tops at 4.31 / 5.72 / 7.39, radius ratio 1 : .73 : .51.
crown(0, base=2.86, radius=1.62, height=1.30, exponent=1.95, anchors=290, rim_n=48)
crown(1, base=4.78, radius=1.18, height=.86, exponent=1.95, anchors=185, rim_n=36)
# Top tier: a flat-topped leaf dome with a bare cone rising clear above it,
# the way the reference's spire pokes out of its foliage.
crown(2, base=6.15, radius=.84, height=.82, exponent=2.10, anchors=120, rim_n=26,
      core_drop=.0, core_shade=4, core_r=.40, core_h=1.72, core_exp=1.45)


# ---------------------------------------------------------------- studio
cream = bpy.data.materials.new('Cream backdrop')
cream.use_nodes = True
nt = cream.node_tree
nt.nodes.clear()
em = nt.nodes.new('ShaderNodeEmission')
em.inputs['Color'].default_value = (CREAM[0], CREAM[1], CREAM[2], 1)
em.inputs['Strength'].default_value = 1.0
out = nt.nodes.new('ShaderNodeOutputMaterial')
nt.links.new(em.outputs['Emission'], out.inputs['Surface'])

bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -.02))
floor = bpy.context.object
floor.name = 'Cream seamless backdrop'
floor.data.materials.append(cream)
for col in list(floor.users_collection):
    col.objects.unlink(floor)
studio.objects.link(floor)


def area(name, pos, power, size, color):
    d = bpy.data.lights.new(name, 'AREA')
    o = bpy.data.objects.new(name, d)
    studio.objects.link(o)
    o.location = pos
    o.rotation_euler = (Vector((0, 0, 4.0)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    d.energy = power
    d.shape = 'DISK'
    d.size = size
    d.color = color
    return o


# Form comes from the shade ramp, so the rig only adds a gentle directional
# hint on top of the near-uniform world.
kx, ky = math.cos(KEY_AZIMUTH), math.sin(KEY_AZIMUTH)
area('Key', (kx * 10, ky * 10, 12), 1120, 11, (1, .96, .92))
area('Front fill', (2, -14, 6), 320, 13, (.97, .95, 1))

cam_data = bpy.data.cameras.new('Portrait camera')
camera = bpy.data.objects.new('Portrait camera', cam_data)
studio.objects.link(camera)
camera.location = (2.3, -22, 5.0)
camera.rotation_euler = (Vector((0, 0, 3.80)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 8.05

scene = bpy.context.scene
scene.camera = camera
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (CREAM[0], CREAM[1], CREAM[2], 1)
bg.inputs['Strength'].default_value = 1.42
scene.render.engine = 'CYCLES'
scene.cycles.samples = 96
scene.cycles.use_denoising = True
scene.render.resolution_x = 1254
scene.render.resolution_y = 1254
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'ghibli_purple_tree_v7.png')
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.render.film_transparent = False
scene['reference'] = 'c0ec40e8-1b70-46ed-9d95-3ceae3f08f49.png'
scene['leaf_count'] = leaf_count

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces.active.region_3d.view_perspective = 'CAMERA'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ghibli_purple_tree_v7.blend'))
print('Built %d leaves' % leaf_count, flush=True)
bpy.ops.render.render(write_still=True)
