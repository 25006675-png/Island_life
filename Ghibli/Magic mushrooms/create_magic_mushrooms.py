"""Ghibli magic mushrooms.

Run: blender --background --python create_magic_mushrooms.py

The Errands grove, replacing the sage topiary. The mushroom cluster's
amanitas are grown to tree size for a magical world: tall stems that lean
outward at the foot, broad parasol caps you could walk under, and pale cap
spots and radial gills that glow like lanterns.

Derived from Mushroom cluster/create_mushrooms.py (same palette, and the same
cap, spot, stem and skirt construction). That asset is still used for the
Foraging groves, so it is left untouched; this script stands alone like the
rest of the series. There is no painted reference for this one.
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
random.seed(13)
gs.reset()

caps_g = gs.collection('01 - Caps and glowing gills')
spots_g = gs.collection('02 - Glowing cap spots')
stems_g = gs.collection('03 - Stems and skirts')
studio_g = gs.collection('04 - Camera and cream studio')

# Stem palette is the mushroom cluster's, sampled off its reference. The caps
# carry the Errands teal (data.js CATEGORIES.errands, #3fb8a8) so the grove,
# its ghosts and the path all agree: minty on the lit crown, deep at the rim.
CAP_STOPS = [(216, 246, 236), (150, 226, 208), (92, 196, 178),
             (58, 166, 150), (38, 126, 118), (26, 88, 86)]
# Gills run lantern-pale at the stem to warm amber at the rim.
GILL_STOPS = [(255, 238, 196), (252, 214, 150), (232, 170, 100), (178, 116, 72)]
STEM_STOPS = [(252, 245, 230), (242, 224, 196), (222, 196, 164),
              (196, 166, 136), (166, 134, 108)]


def glow_material(name, strength):
    """Vertex-colour material that also emits its own vertex colour."""
    m = gs.vcol_material(name)
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = next(n for n in nt.nodes if n.type == 'ATTRIBUTE')
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = strength
    return m


CAP_MAT = gs.vcol_material('Cap')
GILL_MAT = glow_material('Glowing gills', 1.3)
# Gentle: at 2.2 the spots blew out to white and read as holes in the cap.
SPOT_MAT = glow_material('Glowing cap spot', .7)
STEM_MAT = gs.vcol_material('Stem')

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.15)).normalized()

# SEG is high enough to resolve GILLS radial ridges (4 verts per gill).
TOP_RINGS, BOT_RINGS, SEG, GILLS = 26, 14, 144, 36
T_STEM = .20
UNDER_DEEP = .78          # how far the underside vaults up; more shows gills


def cap_colour(co, nrm, cx, cy, rim_z, R, H):
    """Painted cap: warm on the key side and toward the crown, deep at the rim."""
    rise = max(0., min(1., (co.z - rim_z) / H))
    lit = nrm.dot(KEY3)
    # 2D noise, not polar-periodic: periodic terms read as pumpkin ribbing.
    blotch = .055 * gs.lump(co.x * 2.4, co.y * 2.4, cx * 3 + cy)
    return gs.grad(CAP_STOPS, .66 - .34 * lit - .30 * rise + blotch)


def gill_colour(co, cx, cy, R):
    """Radial ridges - here the polar ribbing is exactly what is wanted."""
    r = math.hypot(co.x - cx, co.y - cy)
    a = math.atan2(co.y - cy, co.x - cx)
    ridge = abs(math.sin(a * GILLS / 2)) ** 2.5
    return gs.grad(GILL_STOPS, .06 + .62 * min(1., r / R) + .24 * (1 - ridge))


def cap(name, cx, cy, rim_z, R, H):
    """Revolved parasol: domed top, concave gilled underside, overhanging rim."""
    verts, faces = [], []

    def radius_at(t, a):
        return R * t * (1 + .022 * math.sin(3 * a + cx) + .013 * math.cos(5 * a - cy))

    for i in range(TOP_RINGS + 1):                        # crown -> rim
        t = i / TOP_RINGS
        for k in range(SEG):
            a = k * math.tau / SEG
            r = radius_at(t, a)
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a),
                          rim_z + H * (1 - t ** 3.6)))
    for i in range(1, BOT_RINGS + 1):                     # rim -> stem, underside
        u = i / BOT_RINGS
        t = 1 - (1 - T_STEM) * u
        bulge = 1 + .035 * math.sin(math.pi * min(1., u * 3.2))
        for k in range(SEG):
            a = k * math.tau / SEG
            r = radius_at(t, a) * bulge
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a),
                          rim_z - .07 * H * math.sin(math.pi * min(1., u * 2.6))
                          + UNDER_DEEP * H * (1 - t ** 1.7)))

    rings = TOP_RINGS + BOT_RINGS
    for j in range(rings):
        for k in range(SEG):
            a = j * SEG + k
            b = j * SEG + (k + 1) % SEG
            faces.append((a, b, b + SEG, a + SEG))
    faces.append(tuple(rings * SEG + k for k in range(SEG)))

    obj = gs.mesh(name, verts, faces, [CAP_MAT, GILL_MAT], caps_g, smooth=True)
    # everything below the rim ring is gill, and glows
    for p in obj.data.polygons:
        p.material_index = 1 if p.index >= TOP_RINGS * SEG else 0
    top_verts = (TOP_RINGS + 1) * SEG
    me = obj.data
    me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
    ca = me.color_attributes['Col']
    for i, v in enumerate(me.vertices):
        if i < top_verts:
            c = cap_colour(v.co, v.normal, cx, cy, rim_z, R, H)
        else:
            c = gill_colour(v.co, cx, cy, R)
        ca.data[i].color = (c[0], c[1], c[2], 1.0)
    return obj


def cap_spots(name, cx, cy, rim_z, R, H, count):
    """Glowing flecks sitting just off the cap. Rims are painted to the local
    cap colour so each glows from the centre and dissolves at its edge."""
    placed = []
    for n in range(count):
        for _ in range(40):
            t = math.sqrt(random.uniform(.02, .74))
            a = random.uniform(0, math.tau)
            if random.random() < .45:            # a mild lean to the camera side
                a = math.radians(-75) + random.uniform(-2.4, 2.4)
            px, py = R * t * math.cos(a), R * t * math.sin(a)
            if all((px - qx) ** 2 + (py - qy) ** 2 > (.20 * R) ** 2 for qx, qy in placed):
                break
        placed.append((px, py))
        r = R * t
        z = rim_z + H * (1 - t ** 3.6)
        slope = math.atan(3.6 * H / R * max(t, .04) ** 2.6)
        nrm = Vector((math.sin(slope) * math.cos(a), math.sin(slope) * math.sin(a),
                      math.cos(slope)))
        rad = random.uniform(.065, .175) * (R / 1.26)
        squash = random.uniform(.5, .95)
        ring = 24
        verts = [(0, 0, 0)]
        for k in range(ring):
            u = k * math.tau / ring
            verts.append((rad * math.cos(u), rad * squash * math.sin(u), 0))
        faces = [(0, 1 + k, 1 + (k + 1) % ring) for k in range(ring)]
        o = gs.mesh('%s %02d' % (name, n), verts, faces, SPOT_MAT, spots_g, smooth=True)
        # Lifted clear of the cap's wobble, which clipped flecks at .02.
        o.location = (cx + r * math.cos(a) + nrm.x * .04,
                      cy + r * math.sin(a) + nrm.y * .04,
                      z + nrm.z * .04)
        o.rotation_euler = nrm.to_track_quat('Z', 'Y').to_euler()
        o.rotation_euler.rotate_axis('Z', random.uniform(0, math.tau))

        local = cap_colour(Vector((cx + r * math.cos(a), cy + r * math.sin(a), z)),
                           nrm, cx, cy, rim_z, R, H)
        pale = gs.srgb(255, 242, 200)
        me = o.data
        me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        ca = me.color_attributes['Col']
        for i in range(len(me.vertices)):
            f = 0. if i == 0 else .80
            c = [pale[j] * (1 - f) + local[j] * f for j in range(3)]
            ca.data[i].color = (c[0], c[1], c[2], 1.0)


def paint_pale(obj, top_z):
    def fn(co, nrm):
        lit = nrm.x * KX + nrm.y * KY
        h = max(0., min(1., co.z / max(top_z, 1e-6)))
        return gs.grad(STEM_STOPS, .40 - .34 * lit + .16 * (1 - h))
    gs.paint(obj, fn)


def stem(name, cx, cy, top_z, r_top, r_base, lx, ly):
    """Tall stem: swollen foot easing to a slim waist, slight flare under the
    cap. The foot is pushed out by (lx, ly) so the stem leans in toward its
    cap, which stays exactly on (cx, cy)."""
    path, radii = [], []
    for u in (0, .06, .14, .24, .36, .48, .60, .72, .84, .93, 1.0):
        z = top_z * u
        r = (r_base + (r_top - r_base) * min(1., (u / .42) ** .7) if u < .42
             else r_top * (1.06 - .16 * (u - .42)))
        foot = (1 - u) ** 2
        path.append((cx + lx * foot + .06 * math.sin(u * 5 + cx),
                     cy + ly * foot + .04 * math.sin(u * 4 + cy), z))
        radii.append(r)
    obj = gs.tube(name, path, radii, STEM_MAT, stems_g, sides=28, gnarl=.022,
                  crease=0, smooth=True, twist=.015)
    paint_pale(obj, top_z)


def skirt(name, cx, cy, z, r_stem, r_out, drop):
    """The frilled collar every amanita in the series wears."""
    seg, rings = 68, 8
    verts, faces = [], []
    for i in range(rings + 1):
        u = i / rings
        for k in range(seg):
            a = k * math.tau / seg
            scallop = 1 + .085 * math.sin(a * 11) * u ** 1.5
            r = (r_stem + (r_out - r_stem) * u ** .65) * scallop
            verts.append((cx + r * math.cos(a), cy + r * math.sin(a),
                          z - drop * u ** 1.5))
    for j in range(rings):
        for k in range(seg):
            a = j * seg + k
            b = j * seg + (k + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    obj = gs.mesh(name, verts, faces, STEM_MAT, stems_g, smooth=True)
    paint_pale(obj, z * 1.6)


def stem_x(cx, cy, top_z, lx, ly, u):
    """Where the stem centreline sits at fraction u of its height."""
    foot = (1 - u) ** 2
    return (cx + lx * foot + .06 * math.sin(u * 5 + cx),
            cy + ly * foot + .04 * math.sin(u * 4 + cy))


# Tree proportions: stems far taller than the caps are wide.
# Three, not five: five separate stems read as several things. These three
# lean their feet in to one shared root mound (below), so they read as a
# single organism.
# cx, cy, rim_z, R, H, stem_top, r_top, r_base, skirt_u, skirt_r, spots, lean
SHROOMS = [
    (0.00, .15, 5.00, 1.65, .85, 5.18, .30, .50, .70, .56, 40, (-.02, -.12)),
    (-1.15, -.35, 3.45, 1.10, .58, 3.60, .22, .36, .70, .40, 24, (.85, .30)),
    (1.05, -.45, 2.55, .85, .46, 2.68, .18, .30, .66, .32, 16, (-.75, .40)),
]
for i, (cx, cy, rim_z, R, H, sz, rt, rb, ku, kr, ns, (lx, ly)) in enumerate(SHROOMS):
    stem('Stem %d' % (i + 1), cx, cy, sz, rt, rb, lx, ly)
    kx, ky = stem_x(cx, cy, sz, lx, ly, ku)
    skirt('Skirt %d' % (i + 1), kx, ky, sz * ku, rt * 1.06, kr, kr * .5)
    cap('Cap %d' % (i + 1), cx, cy, rim_z, R, H)
    cap_spots('Spot %d' % (i + 1), cx, cy, rim_z, R, H, ns)

# The shared root mound all three stems grow out of.
bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.0,
                                     location=(0, -.05, 0))
mound = bpy.context.object
mound.name = 'Shared root mound'
for col in list(mound.users_collection):
    col.objects.unlink(mound)
stems_g.objects.link(mound)
mound.scale = (1.15, .95, .42)
mound.data.materials.append(STEM_MAT)
for p in mound.data.polygons:
    p.use_smooth = True
paint_pale(mound, 1.0)

# Camera sits low and looks slightly up, so the glowing gills show. With an
# ortho camera that means the lower frame starts below the floor and sees its
# underside, so the floor is hidden from the camera and a camera-only cream
# wall stands behind the cluster instead.
gs.studio(studio_g, cam_pos=(1.3, -20, .5), target_z=2.95, ortho_scale=7.2,
          key=1120, fill=340, world=1.42)
floor = bpy.data.objects['Cream seamless backdrop']
floor.visible_camera = False
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 30, 0),
                                 rotation=(math.pi / 2, 0, 0))
wall = bpy.context.object
wall.name = 'Cream backdrop wall'
for col in list(wall.users_collection):
    col.objects.unlink(wall)
studio_g.objects.link(wall)
wall.data.materials.append(floor.data.materials[0])
wall.visible_diffuse = wall.visible_glossy = False
wall.visible_shadow = wall.visible_transmission = False
wall.visible_volume_scatter = False
gs.render(ROOT / 'ghibli_magic_mushrooms.blend', ROOT / 'ghibli_magic_mushrooms.png',
          note='Tree-sized glowing amanitas for the Errands grove, shared studio rig.')
print('magic mushrooms built', flush=True)
