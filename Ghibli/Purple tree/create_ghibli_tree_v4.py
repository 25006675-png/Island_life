"""Ghibli purple tree, v4 - reference-matched pass.

Run: blender --background --python create_ghibli_tree_v4.py

Changes over v3:
  * heavier, purple-brown trunk with stubby root buttresses and visible limbs
  * dome crowns (taller profile, denser leaves, rim tucked under -> no skirt)
  * conical top tier instead of a rounded blob
  * leaf shade chosen from dome position + key-light azimuth, not at random
  * flat emissive cream backdrop so nothing casts a ground shadow
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


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


wood = collection('01 - Trunk, roots and limbs')
crowns = [collection('0%d - %s canopy' % (i + 2, n))
          for i, n in enumerate(('Lower', 'Middle', 'Top'))]
studio = collection('05 - Camera and cream studio')


def mat(name, rgb, roughness=.92):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1)
    m.use_nodes = True
    s = m.node_tree.nodes['Principled BSDF']
    s.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1)
    s.inputs['Roughness'].default_value = roughness
    s.inputs['Specular IOR Level'].default_value = .12
    return m


# Foliage ramp, index 0 = brightest sunlit top, index 9 = deepest rim shade.
# Kept deliberately narrow: the reference never goes near black.
LEAF_RAMP = [
    (.84, .62, .96), (.72, .50, .92), (.62, .41, .88), (.53, .34, .84),
    (.45, .28, .80), (.38, .23, .75), (.32, .19, .70), (.27, .16, .65),
    (.22, .13, .60), (.18, .11, .55),
]
leaves = [mat('Lilac %02d' % i, rgb) for i, rgb in enumerate(LEAF_RAMP)]

# Bark ramp, index 0 = lit face, index 5 = shadow face. Purple-brown, not orange.
BARK_RAMP = [
    (.30, .215, .235), (.255, .180, .200), (.215, .150, .172),
    (.180, .124, .146), (.148, .100, .122), (.120, .080, .102),
]
barks = [mat('Bark %02d' % i, rgb) for i, rgb in enumerate(BARK_RAMP)]


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
    """Swept tube with a light gnarl; faces are shaded by facing the key light."""
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
            a = 2 * math.pi * k / sides + j * .06
            r = rad * (1 + .075 * math.sin(k * 2.0 + j * .35) + .035 * math.sin(k * 5.0))
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
        lit = p.normal.x * kx + p.normal.y * ky          # -1 shadow .. 1 lit
        p.material_index = min(5, max(0, int((1 - lit) * .5 * 6.4)))
    return obj


def trunk_center(z):
    """Near-straight trunk with a gentle lean, like the reference."""
    return Vector((.135 * math.sin(z * .58) - .05, .055 * math.sin(z * .85), z))


# ---------------------------------------------------------------- trunk
TZ = [0, .15, .40, .80, 1.30, 1.90, 2.50, 3.00, 3.60, 4.20, 4.90, 5.60, 6.30, 7.00]
TR = [.60, .52, .44, .385, .350, .330, .312, .296, .262, .228, .192, .156, .118, .045]
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

# Two dominant limbs under the lower crown, plus feeders for the upper tiers.
LIMBS = [(2.92, 1.30, [-.55, 2.60], .125),
         (3.15, 1.05, [1.05, 3.95], .092),
         (4.95, .78, [.15, 3.10], .080),
         (6.30, .50, [1.60, 4.55], .058)]
for level, spread, angles, thick in LIMBS:
    for i, a in enumerate(angles):
        d = Vector((math.cos(a), math.sin(a), 0))
        path = [trunk_center(level),
                trunk_center(level + .30) + d * spread * .26,
                trunk_center(level + .62) + d * spread * .55,
                trunk_center(level + .92) + d * spread * .78,
                trunk_center(level + 1.05) + d * spread * .90]
        tube('Limb %.1f/%d' % (level, i + 1), path,
             [thick, thick * .80, thick * .58, thick * .34, .010], 9)


# ---------------------------------------------------------------- leaf
def petal_mesh(variant):
    """Blunt ovate blade with a shallow tip notch, cupped and drooping."""
    rng = random.Random(900 + variant)
    width = rng.uniform(.42, .52)
    shoulder = rng.uniform(.38, .48)      # height of the widest point
    tip_blunt = rng.uniform(2.9, 4.2)     # higher = rounder tip
    notch = rng.uniform(.03, .085)

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
    droop = rng.uniform(.16, .30)
    cup = rng.uniform(.09, .17)
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
    d.materials.append(leaves[4])
    for p in d.polygons:
        p.use_smooth = True
    return d


petals = [petal_mesh(i) for i in range(10)]
leaf_count = 0


# ---------------------------------------------------------------- crowns
def crown(index, base, radius, height, exponent, anchors, rim_n):
    """One foliage tier: a hidden dome shell dressed in individually placed leaves."""
    global leaf_count
    group = crowns[index]
    c = trunk_center(base)
    squash = .90                                     # slight ellipse in Y

    # Hidden inner volume: mid-shade so any peep-through reads as deep foliage.
    verts, faces, seg = [], [], 56
    for j in range(15):
        t = j / 14
        rr = radius * t * .90
        z = base + height * (1 - t ** exponent)
        for k in range(seg):
            a = k * math.tau / seg
            asym = 1 + .035 * math.sin(3 * a + index) + .02 * math.cos(5 * a)
            verts.append((c.x + rr * math.cos(a) * asym,
                          c.y + rr * math.sin(a) * squash * asym, z - .12))
    for j in range(14):
        for k in range(seg):
            a = j * seg + k
            b = j * seg + (k + 1) % seg
            faces.append((a, a + seg, b + seg, b))
    faces.append(tuple(reversed([14 * seg + k for k in range(seg)])))
    core = mesh('Crown core', verts, faces, [leaves[7]], group)
    for p in core.data.polygons:
        p.use_smooth = True

    leaf_len = (.40, .345, .295)[index]

    def place(t, a, fan, lift, scale, pitch, exposure):
        global leaf_count
        lumpy = 1 + .07 * math.sin(5 * a + index) + .035 * math.cos(8 * a)
        rr = radius * t * lumpy
        tuft = .075 * math.sin(t * math.tau * 2.6 + .7 * math.sin(a * 4 + index))
        z = base + height * (1 - min(t, 1.) ** exponent) + tuft + lift
        shade = min(9, max(0, int((1 - max(0., min(1., exposure))) * 9.99)))
        o = bpy.data.objects.new('Leaf %04d' % leaf_count,
                                 petals[(leaf_count * 7 + index) % len(petals)])
        group.objects.link(o)
        o.location = (c.x + rr * math.cos(a), c.y + rr * math.sin(a) * squash, z)
        o.rotation_euler = (-pitch, random.uniform(-.22, .22), a + fan - math.pi / 2)
        L = leaf_len * scale
        o.scale = (L * random.uniform(.86, .98), L, L)
        o.material_slots[0].link = 'OBJECT'
        o.material_slots[0].material = leaves[shade]
        leaf_count += 1

    golden = math.pi * (3 - math.sqrt(5))

    def slope(t):
        # Surface slope of the dome, so leaves lie along the cap.
        return math.atan(exponent * height / radius * max(t, .04) ** (exponent - 1))

    for k in range(anchors):
        t = math.sqrt((k + .5) / anchors) * .955
        a = k * golden + random.uniform(-.06, .06)
        lit = (1 - t) ** .75
        side = .5 + .5 * math.cos(a - KEY_AZIMUTH)
        exposure = .60 * lit + .32 * side + random.uniform(-.09, .09)
        place(t, a, random.uniform(-.30, .30), .035 + random.uniform(-.02, .02),
              random.uniform(.90, 1.12), slope(t) * .86 + random.uniform(-.10, .10),
              exposure)

    # Rim: two staggered rows tucked under, giving the scalloped edge its weight.
    rim_rows = [(.90, 1.00, -.05, .55, .85, 0),
                (.86, .97, -.20, .80, 1.15, 1)]
    for tmin, tmax, drop, pitch_lo, pitch_hi, row in rim_rows:
        for k in range(rim_n):
            a = k * math.tau / rim_n + row * math.pi / rim_n + random.uniform(-.05, .05)
            side = .5 + .5 * math.cos(a - KEY_AZIMUTH)
            exposure = (.26 + .30 * side + random.uniform(-.07, .07)) * (1 - .30 * row)
            place(random.uniform(tmin, tmax), a, random.uniform(-.22, .22),
                  drop + random.uniform(-.03, .03), random.uniform(.92, 1.14),
                  random.uniform(pitch_lo, pitch_hi), exposure)

    # Apex tuft keeps the cone tip from going bald.
    if index == 2:
        for k in range(16):
            a = k * golden
            place(random.uniform(.02, .12), a, random.uniform(-.4, .4),
                  .04 + random.uniform(0, .07), random.uniform(.55, .80),
                  random.uniform(.15, .55), random.uniform(.72, 1.0))


crown(0, base=3.28, radius=1.62, height=1.14, exponent=1.95, anchors=340, rim_n=46)
crown(1, base=5.02, radius=1.10, height=.86, exponent=1.95, anchors=215, rim_n=34)
crown(2, base=6.30, radius=.72, height=1.06, exponent=1.20, anchors=150, rim_n=24)


# ---------------------------------------------------------------- studio
CREAM = (.855, .810, .730)
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
    o.rotation_euler = (Vector((0, 0, 4.3)) - o.location).to_track_quat('-Z', 'Y').to_euler()
    d.energy = power
    d.shape = 'DISK'
    d.size = size
    d.color = color
    return o


kx, ky = math.cos(KEY_AZIMUTH), math.sin(KEY_AZIMUTH)
area('Key', (kx * 9, ky * 9, 11), 2600, 9, (1, .95, .90))
area('Front fill', (2, -14, 6), 900, 12, (.96, .94, 1))
area('Cool bounce', (-7, 3, 2.5), 320, 10, (.80, .82, 1))
area('Sky top', (0, 0, 16), 700, 14, (.92, .93, 1))

cam_data = bpy.data.cameras.new('Portrait camera')
camera = bpy.data.objects.new('Portrait camera', cam_data)
studio.objects.link(camera)
camera.location = (3.4, -22, 5.9)
camera.rotation_euler = (Vector((0, 0, 4.25)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 8.9

scene = bpy.context.scene
scene.camera = camera
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (CREAM[0], CREAM[1], CREAM[2], 1)
bg.inputs['Strength'].default_value = .85
scene.render.engine = 'CYCLES'
scene.cycles.samples = 64
scene.cycles.use_denoising = True
scene.render.resolution_x = 1254
scene.render.resolution_y = 1254
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(ROOT / 'ghibli_purple_tree_v4.png')
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Base Contrast'
scene.view_settings.exposure = .55
scene.render.film_transparent = False
scene['reference'] = 'c0ec40e8-1b70-46ed-9d95-3ceae3f08f49.png'
scene['leaf_count'] = leaf_count

for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type == 'VIEW_3D':
            a.spaces.active.region_3d.view_perspective = 'CAMERA'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'ghibli_purple_tree_v4.blend'))
print('Built %d leaves' % leaf_count, flush=True)
bpy.ops.render.render(write_still=True)
