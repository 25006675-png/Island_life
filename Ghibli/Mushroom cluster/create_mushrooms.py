"""Ghibli mushroom cluster.

Run: blender --background --python create_mushrooms.py

Four mushrooms sized off the reference: the big cap's radius is 0.37x the
cluster height, and the cluster is slightly taller than wide (reference bbox
258x292). Every palette value is sampled off reference.png.

Shading is painted into vertex colours rather than picked per face - these are
large smooth revolved surfaces, and per-face material picking stair-steps
visibly across them.
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
random.seed(7)
gs.reset()

caps_g = gs.collection('01 - Caps')
spots_g = gs.collection('02 - Cap spots')
stems_g = gs.collection('03 - Stems and skirts')
studio_g = gs.collection('04 - Camera and cream studio')

# Sampled off reference.png.
CAP_STOPS = [(253, 214, 140), (243, 180, 95), (224, 146, 66),
             (196, 116, 54), (162, 92, 50), (128, 72, 45)]
GILL_STOPS = [(238, 220, 192), (214, 186, 152), (182, 148, 116), (148, 114, 88)]
STEM_STOPS = [(252, 245, 230), (242, 224, 196), (222, 196, 164),
              (196, 166, 136), (166, 134, 108)]

CAP_MAT = gs.vcol_material('Cap')
STEM_MAT = gs.vcol_material('Stem')
SPOT_MAT = gs.vcol_material('Cap spot')

KX, KY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)
KEY3 = Vector((KX, KY, 1.15)).normalized()

TOP_RINGS, BOT_RINGS, SEG = 22, 12, 84
T_STEM = .22
UNDER_DEEP = .78          # how far the underside vaults up; more shows gills


def cap_colour(co, nrm, cx, cy, rim_z, R, H):
    """Painted cap: warm on the key side and toward the crown, deep at the rim,
    with soft radial strokes like the reference's brushwork."""
    rise = max(0., min(1., (co.z - rim_z) / H))
    lit = nrm.dot(KEY3)
    # Soft irregular mottling. Anything periodic in the polar angle reads as
    # pumpkin ribbing, so this is driven by 2D noise over the cap instead.
    blotch = .055 * gs.lump(co.x * 2.4, co.y * 2.4, cx * 3 + cy)
    return gs.grad(CAP_STOPS, .66 - .34 * lit - .30 * rise + blotch)


def gill_colour(co, cx, cy, R):
    r = math.hypot(co.x - cx, co.y - cy)
    return gs.grad(GILL_STOPS, .10 + .80 * (1 - min(1., r / R)))


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
        # The first step bulges slightly proud of the widest point, giving the
        # rim a rolled lip instead of a knife edge.
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

    obj = gs.mesh(name, verts, faces, CAP_MAT, caps_g, smooth=True)
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
    """Pale flecks sitting just off the cap. Their rims are painted to the local
    cap colour so the edge dissolves instead of reading as a pasted-on disc."""
    placed = []
    for n in range(count):
        # Rejection-sample so flecks stay separated instead of merging into
        # blobs, and stay off the silhouette edge.
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
        o.location = (cx + r * math.cos(a) + nrm.x * .014,
                      cy + r * math.sin(a) + nrm.y * .014,
                      z + nrm.z * .014)
        o.rotation_euler = nrm.to_track_quat('Z', 'Y').to_euler()
        o.rotation_euler.rotate_axis('Z', random.uniform(0, math.tau))

        local = cap_colour(Vector((cx + r * math.cos(a), cy + r * math.sin(a), z)),
                           nrm, cx, cy, rim_z, R, H)
        pale = gs.srgb(251, 238, 205)
        me = o.data
        me.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
        ca = me.color_attributes['Col']
        for i in range(len(me.vertices)):
            f = 0. if i == 0 else .88          # centre pale, rim -> cap colour
            c = [pale[j] * (1 - f) + local[j] * f for j in range(3)]
            ca.data[i].color = (c[0], c[1], c[2], 1.0)


def paint_pale(obj, top_z):
    def fn(co, nrm):
        lit = nrm.x * KX + nrm.y * KY
        h = max(0., min(1., co.z / max(top_z, 1e-6)))
        return gs.grad(STEM_STOPS, .40 - .34 * lit + .16 * (1 - h))
    gs.paint(obj, fn)


def stem(name, cx, cy, top_z, r_top, r_base):
    path, radii = [], []
    for u in (0, .10, .24, .45, .68, .85, 1.0):
        z = top_z * u
        # Swollen foot easing into a slim waist, then a slight flare at the cap.
        r = r_base + (r_top - r_base) * min(1., (u / .42) ** .7) if u < .42 else r_top * (1.06 - .16 * (u - .42))
        path.append((cx + .09 * math.sin(u * 2.2) - .03 * u, cy + .05 * math.sin(u * 3), z))
        radii.append(r)
    obj = gs.tube(name, path, radii, STEM_MAT, stems_g, sides=26, gnarl=.022,
                  crease=0, smooth=True, twist=.015)
    paint_pale(obj, top_z)


def skirt(name, cx, cy, z, r_stem, r_out, drop):
    """The frilled collar every mushroom in the reference wears."""
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


# cx, cy, rim_z, R, H, stem_top, r_top, r_base, skirt_z, skirt_r, spots
SHROOMS = [
    (.12,  .52, 2.46, 1.30, .70, 2.62, .27, .38, 1.58, .46, 34),
    (-.76, -.38, 1.62, .84, .45, 1.76, .19, .28, 1.02, .32, 20),
    (.82, -.22, 1.40, .74, .40, 1.52, .17, .25, .88, .29, 17),
    (-.06, -.88, .86, .45, .26, .97, .12, .18, .54, .18, 10),
]
for i, (cx, cy, rim_z, R, H, sz, rt, rb, kz, kr, ns) in enumerate(SHROOMS):
    stem('Stem %d' % (i + 1), cx, cy, sz, rt, rb)
    skirt('Skirt %d' % (i + 1), cx, cy, kz, rt * 1.06, kr, kr * .5)
    cap('Cap %d' % (i + 1), cx, cy, rim_z, R, H)
    cap_spots('Spot %d' % (i + 1), cx, cy, rim_z, R, H, ns)

gs.studio(studio_g, cam_pos=(1.3, -18, 4.05), target_z=1.50, ortho_scale=5.20)
gs.render(ROOT / 'ghibli_mushrooms.blend', ROOT / 'ghibli_mushrooms.png',
          note='Reference-matched mushroom cluster, shared studio rig.')
print('mushrooms built', flush=True)
