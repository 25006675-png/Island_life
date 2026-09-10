"""Shared studio rig for the Ghibli asset series.

Every reference in this set is the same product shot: one object, centred, flat
warm-cream ground, soft near-uniform light, orthographic camera. This module
holds that rig plus the geometry helpers the asset scripts share, so each asset
script only describes its own shape.

Usage from an asset script one directory down:

    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / '_common'))
    import ghibli_studio as gs

Colour convention: every palette value in this series is authored as an sRGB
byte triple sampled off the reference image, and converted with srgb(). The
scene uses the Standard view transform, so authored values render back close to
what was sampled. AgX desaturates these palettes badly - see Purple tree/README.
"""
import math
import random

import bpy
from mathutils import Vector

# Background sampled across the five references (#eee5da), and the key light
# azimuth the whole series is lit from.
CREAM_SRGB = (238, 229, 218)
KEY_AZIMUTH = math.radians(215)


def srgb(*rgb255):
    """sRGB byte triple sampled off a reference -> Blender linear."""
    out = []
    for v in rgb255:
        u = v / 255.0
        out.append(u / 12.92 if u <= .04045 else ((u + .055) / 1.055) ** 2.4)
    return tuple(out)


def reset():
    """Empty the startup scene."""
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        if c.users == 0:
            bpy.data.collections.remove(c)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def mat(name, rgb_linear, roughness=.94, specular=.06):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (rgb_linear[0], rgb_linear[1], rgb_linear[2], 1)
    m.use_nodes = True
    s = m.node_tree.nodes['Principled BSDF']
    s.inputs['Base Color'].default_value = (rgb_linear[0], rgb_linear[1], rgb_linear[2], 1)
    s.inputs['Roughness'].default_value = roughness
    s.inputs['Specular IOR Level'].default_value = specular
    return m


def ramp(name, stops_srgb, count, roughness=.94):
    """A light->dark material ramp interpolated through sRGB stops.

    Assets pick an entry by a computed 'exposure', which is what gives these
    renders their painted look: form is carried by the chosen shade, not only
    by the lighting.
    """
    mats = []
    segs = len(stops_srgb) - 1
    for i in range(count):
        u = i / (count - 1) * segs
        j = min(segs - 1, int(u))
        f = u - j
        c = [stops_srgb[j][k] * (1 - f) + stops_srgb[j + 1][k] * f for k in range(3)]
        mats.append(mat('%s %02d' % (name, i), srgb(*c), roughness))
    return mats


def pick(mats, exposure):
    """Exposure in 0..1 (1 = brightest) -> index into a ramp built by ramp()."""
    e = max(0., min(1., exposure))
    return mats[min(len(mats) - 1, int((1 - e) * (len(mats) - .01)))]


def grad(stops_srgb, u):
    """Sample a list of sRGB stops at u in 0..1 -> linear rgb.

    The continuous counterpart of ramp(). Use this with paint() for large smooth
    surfaces: picking discrete materials per face stair-steps badly on them,
    while per-leaf flat colours from ramp() are fine.
    """
    segs = len(stops_srgb) - 1
    x = max(0., min(1., u)) * segs
    j = min(segs - 1, int(x))
    f = x - j
    return srgb(*[stops_srgb[j][k] * (1 - f) + stops_srgb[j + 1][k] * f
                  for k in range(3)])


def vcol_material(name, roughness=.94, specular=.06):
    """Material whose base colour reads the mesh's 'Col' vertex colours."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = nt.nodes.new('ShaderNodeAttribute')
    attr.attribute_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Specular IOR Level'].default_value = specular
    return m


def paint(obj, fn):
    """Write per-vertex colours. fn(co, normal) -> linear rgb triple."""
    me = obj.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    ca = me.color_attributes['Col']
    for i, v in enumerate(me.vertices):
        c = fn(v.co, v.normal)
        ca.data[i].color = (c[0], c[1], c[2], 1.0)
    return obj


def mesh(name, verts, faces, mats, group, smooth=False):
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    group.objects.link(o)
    for m in (mats if isinstance(mats, (list, tuple)) else [mats]):
        d.materials.append(m)
    if smooth:
        for p in d.polygons:
            p.use_smooth = True
    return o


def tube(name, path, radii, mats, group, sides=12, gnarl=.085, crease=.55,
         smooth=False, twist=.05):
    """Swept tube along a path, shaded by how each face turns to the key light.

    Used for every trunk, limb and stem in the series.
    """
    verts, faces = [], []
    for j, (pt, rad) in enumerate(zip(path, radii)):
        pt = Vector(pt)
        tan = Vector(path[min(j + 1, len(path) - 1)]) - Vector(path[max(0, j - 1)])
        if tan.length < 1e-9:
            tan = Vector((0, 0, 1))
        tan.normalize()
        across = tan.cross(Vector((0, 1, 0)))
        if across.length < 1e-4:
            across = tan.cross(Vector((1, 0, 0)))
        across.normalize()
        side = tan.cross(across).normalized()
        for k in range(sides):
            a = 2 * math.pi * k / sides + j * twist
            r = rad * (1 + gnarl * math.sin(k * 2.0 + j * .3)
                       + gnarl * .5 * math.sin(k * 5.0 + j * .8))
            verts.append(pt + r * (math.cos(a) * across + math.sin(a) * side))
    for j in range(len(path) - 1):
        for k in range(sides):
            a = j * sides + k
            b = j * sides + (k + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(reversed(range(sides))))
    faces.append(tuple((len(path) - 1) * sides + k for k in range(sides)))
    obj = mesh(name, verts, faces, mats, group, smooth)
    kx, ky = math.cos(KEY_AZIMUTH + math.pi), math.sin(KEY_AZIMUTH + math.pi)
    n = len(obj.data.materials)
    for p in obj.data.polygons:
        lit = p.normal.x * kx + p.normal.y * ky            # -1 shadow .. 1 lit
        # Slow angular ripple darkens scattered strips, reading as bark creases.
        rip = crease * math.sin(math.atan2(p.normal.y, p.normal.x) * 5.0 + p.center.z * .7)
        p.material_index = min(n - 1, max(0, int(round((1 - lit) * .5 * (n - .4) + rip))))
    return obj


def lump(x, y, seed=0.):
    """Smooth irregular 2D bumpiness, for tufting foliage without banding.
    Radial terms produce visible concentric rings - see Purple tree/README.
    """
    return (math.sin(2.1 * x + 1.3 + seed) * math.cos(1.7 * y - .6) +
            .62 * math.sin(3.3 * y + 2.2 - seed) * math.cos(2.9 * x + 1.1) +
            .38 * math.sin(5.1 * x - 1.9) * math.cos(4.7 * y + seed))


def blade(name, outline, cup=.12, droop=.20, lean=0., twist=0., rings=6,
          material=None):
    """Fan-triangulated flat-ish blade from a 2D outline, curved in Z.

    Leaves, petals, grass and frond leaflets are all built from this.
    'outline' is a list of (x, y) with y running 0 (stem) -> 1 (tip).
    """
    def curved(x, y):
        xx = x + lean * y * y
        z = (cup * math.sin(math.pi * min(1., y)) - droop * y * y
             - .18 * xx * xx + twist * xx * y)
        return (xx, y, z)

    centre = Vector((0., .46))
    verts = [curved(centre.x, centre.y)]
    faces = []
    n = len(outline)
    for ring in range(1, rings + 1):
        for e in outline:
            p = centre + (Vector(e) - centre) * ring / rings
            verts.append(curved(p.x, p.y))
    for k in range(n):
        faces.append((0, 1 + k, 1 + (k + 1) % n))
    for ring in range(rings - 1):
        for k in range(n):
            a = 1 + ring * n + k
            b = 1 + ring * n + (k + 1) % n
            faces.append((a, a + n, b + n, b))
    d = bpy.data.meshes.new(name)
    d.from_pydata(verts, [], faces)
    d.update()
    if material is not None:
        d.materials.append(material)
    for p in d.polygons:
        p.use_smooth = True
    return d


def ovate_outline(width=.46, shoulder=.44, tip_blunt=3.4, notch=.05, steps=30):
    """Blunt ovate leaf outline: widest above the middle, rounded tip."""
    def half(y):
        if y <= shoulder:
            u = (shoulder - y) / shoulder
            return width * max(0., 1 - u ** 2.1) ** .58
        u = (y - shoulder) / (1 - shoulder)
        return width * max(0., 1 - u ** tip_blunt) ** .52
    pts = [(half(i / steps), i / steps) for i in range(steps + 1)]
    pts.append((0., 1 - notch))
    pts += [(-half(i / steps), i / steps) for i in range(steps, -1, -1)]
    return pts


def studio(group, cam_pos, target_z, ortho_scale, key=1120, fill=320,
           world=1.42, cream=None):
    """Cream backdrop, two soft lights, orthographic camera.

    The backdrop is pure emission so it renders as a flat, exact colour and
    catches no contact shadow, matching the references.
    """
    cream = cream or CREAM_SRGB
    lin = srgb(*cream)
    m = bpy.data.materials.new('Cream backdrop')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (lin[0], lin[1], lin[2], 1)
    em.inputs['Strength'].default_value = 1.0
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs['Emission'], out.inputs['Surface'])

    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -.02))
    floor = bpy.context.object
    floor.name = 'Cream seamless backdrop'
    floor.data.materials.append(m)
    for col in list(floor.users_collection):
        col.objects.unlink(floor)
    group.objects.link(floor)

    def area(name, pos, power, size, color):
        d = bpy.data.lights.new(name, 'AREA')
        o = bpy.data.objects.new(name, d)
        group.objects.link(o)
        o.location = pos
        o.rotation_euler = (Vector((0, 0, target_z)) - o.location).to_track_quat('-Z', 'Y').to_euler()
        d.energy = power
        d.shape = 'DISK'
        d.size = size
        d.color = color

    kx, ky = math.cos(KEY_AZIMUTH), math.sin(KEY_AZIMUTH)
    area('Key', (kx * 10, ky * 10, 12), key, 11, (1, .96, .92))
    area('Front fill', (2, -14, 6), fill, 13, (.97, .95, 1))

    cd = bpy.data.cameras.new('Portrait camera')
    cam = bpy.data.objects.new('Portrait camera', cd)
    group.objects.link(cam)
    cam.location = cam_pos
    cam.rotation_euler = (Vector((0, 0, target_z)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cd.type = 'ORTHO'
    cd.ortho_scale = ortho_scale

    sc = bpy.context.scene
    sc.camera = cam
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (lin[0], lin[1], lin[2], 1)
    bg.inputs['Strength'].default_value = world
    return cam


def render(blend_path, png_path, samples=96, res=1254, note=''):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = res
    sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = str(png_path)
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.view_settings.exposure = 0
    sc.render.film_transparent = False
    if note:
        sc['notes'] = note
    for screen in bpy.data.screens:
        for a in screen.areas:
            if a.type == 'VIEW_3D':
                a.spaces.active.region_3d.view_perspective = 'CAMERA'
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
