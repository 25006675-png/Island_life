"""Ghibli pale sculptural tree.

Run: blender --background --python create_pale_tree.py

The 'Other' category tree: bare and leafless, two trunks braided round each
other, opening into antler-like branch work that curls upward at every tip,
with a few glowing motes drifting through the crown.

Positions are laid out in the reference's pixel space at 150 px per unit, so an
ortho scale of 1254 / 150 = 8.36 frames it at the reference's size.
Reference bbox is 344x384 of 420. Palette sampled off reference.png: bark runs
warm white to cool lavender-grey (251,246,238 / 217,207,201 / 195,186,186 /
174,166,170 / 156,148,153 / 138,131,136 / 115,108,114).
"""
import math
import random
import sys
import pathlib

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / '_common'))
import ghibli_studio as gs

ROOT = pathlib.Path(__file__).resolve().parent
random.seed(11)
gs.reset()

trunk_g = gs.collection('01 - Braided trunk and roots')
branch_g = gs.collection('02 - Branch work')
mote_g = gs.collection('03 - Floating motes')
studio_g = gs.collection('04 - Camera and cream studio')

BARK_STOPS = [(250, 246, 240), (226, 218, 214), (204, 197, 199), (182, 175, 182),
              (160, 153, 162), (140, 133, 143), (114, 108, 117)]
BARK = gs.ramp('Pale bark', BARK_STOPS, 12)
UP = Vector((0, 0, 1))


# ------------------------------------------------------------------ braided trunk
def axis(z):
    """Shared centreline the two trunks wind about; leans left as it rises."""
    return Vector((.62 - .13 * z + .10 * math.sin(z * 1.1), .05 * math.sin(z * 1.4), z))


def strand(z, phase):
    a = phase + z * 1.25
    sep = .20 + .05 * z            # fused at the foot, parting as they climb
    return axis(z) + Vector((math.cos(a) * sep, math.sin(a) * sep * .8, 0))


TOP = 3.9
# Dense rings: per-face shade picking stair-steps on coarse ones.
ZS = [TOP * i / 64 for i in range(65)]
for name, phase in (('A', 0.), ('B', math.pi)):
    gs.tube('Trunk %s' % name, [strand(z, phase) for z in ZS],
            [.56 - .25 * (z / TOP) ** .8 for z in ZS], BARK, trunk_g, sides=32,
            gnarl=.05, crease=1.6, smooth=True, twist=.06)

def chaikin(pts, radii, passes=2):
    """Round off a coarse control path; four-point roots read as cut facets."""
    for _ in range(passes):
        P, Rr = [pts[0]], [radii[0]]
        for a, b, ra, rb in zip(pts, pts[1:], radii, radii[1:]):
            P += [a.lerp(b, .25), a.lerp(b, .75)]
            Rr += [ra * .75 + rb * .25, ra * .25 + rb * .75]
        P.append(pts[-1])
        Rr.append(radii[-1])
        pts, radii = P, Rr
    return pts, radii


for i in range(7):
    a = i * math.tau / 7 + .3 + random.uniform(-.12, .12)
    out = Vector((math.cos(a), math.sin(a), 0))
    reach = random.uniform(.75, 1.05)
    path, radii = chaikin([axis(1.0), axis(.5) + out * reach * .38,
                           axis(.16) + out * reach * .76,
                           axis(0) + out * reach + Vector((0, 0, .03))],
                          [.24, .30, .22, .03])
    gs.tube('Root %d' % (i + 1), path, radii, BARK, trunk_g, sides=16,
            gnarl=.07, crease=1.2, smooth=True)


# ------------------------------------------------------------------ branch work
def curl(start, d, length, bend, n=9):
    """Path that eases toward vertical as it goes, so antler tips curl up."""
    pts, p = [start.copy()], start.copy()
    for _ in range(1, n):
        d = (d + UP * bend).normalized()
        p = p + d * (length / (n - 1))
        pts.append(p.copy())
    return pts, d


MAXD = 5
tubes = 0


def branch(start, d, length, r, depth, tag):
    """Recursive limb; forks open mostly in the limb's own vertical plane,
    which is what makes the crown read as antlers rather than a broom."""
    global tubes
    pts, end_d = curl(start, d, length, .025 + .012 * depth)
    last = depth == MAXD
    tip = r * (.12 if last else .62)
    radii = [r + (tip - r) * i / (len(pts) - 1) for i in range(len(pts))]
    o = gs.tube('Branch %s' % tag, pts, radii, BARK, branch_g,
                sides=max(5, 13 - 2 * depth), gnarl=.05, crease=1.0, smooth=True,
                twist=.06)
    # Drop the end caps: smooth shading averages each cap into its last ring,
    # which drew a pale band at every joint. Open ends sit inside the parent.
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if len(f.verts) > 4],
                     context='FACES_ONLY')
    bm.to_mesh(o.data)
    bm.free()
    tubes += 1
    if last:
        return
    side = end_d.cross(UP)
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    perp = side.cross(end_d).normalized()
    kids = 3 if depth <= 1 and random.random() < .35 else 2
    for k in range(kids):
        yaw = (0 if k % 2 == 0 else math.pi) + random.uniform(-.7, .7)
        ang = random.uniform(.42, .70)
        off = (side * math.sin(yaw) * .55 + perp * math.cos(yaw)).normalized()
        nd = (end_d * math.cos(ang) + off * math.sin(ang)).normalized()
        branch(pts[-1], nd, length * random.uniform(.66, .78), tip * .98,
               depth + 1, '%s.%d' % (tag, k))


A, B = 0., math.pi
if strand(TOP, A).x < strand(TOP, B).x:
    A, B = B, A                                  # A is the right-hand trunk
# strand, height, direction, length, radius
LIMBS = [
    (A, TOP, (-.08, 0, 1), 1.25, .30),           # leader
    (B, TOP, (-1, .05, .62), 1.40, .30),         # big left
    (B, 3.0, (-1, -.15, .22), 1.40, .21),        # low left
    (A, 3.45, (1, 0, .62), 1.35, .25),           # upper right
    (A, 2.75, (1, .15, .22), 1.35, .20),         # low right
    # back and front limbs angle off sideways - pointed straight at the
    # camera they read as a knot at the crown's centre
    (A, 3.25, (.7, 1, .70), 1.05, .20),          # back
    (B, 3.35, (-.7, -1, .80), .95, .18),         # front
]
for i, (ph, z, d, L, r) in enumerate(LIMBS):
    branch(strand(z, ph), Vector(d).normalized(), L, r, 0, str(i + 1))

# Per-face shade picking stair-steps into a mosaic on the braided trunk (see
# the series README), so all wood is repainted with smooth vertex colour: key
# light shading plus streaks that spiral with the braid.
WOOD = gs.vcol_material('Pale bark painted')
LX, LY = math.cos(gs.KEY_AZIMUTH), math.sin(gs.KEY_AZIMUTH)


def bark_colour(co, n):
    lit = n.x * LX + n.y * LY + .35 * n.z
    ang = math.atan2(n.y, n.x)
    streak = (.20 * math.sin(3 * ang + co.z * 3.1)
              + .11 * math.sin(7 * ang - co.z * 5.3 + 1.7))
    return gs.grad(BARK_STOPS, .64 - .30 * lit + streak)


for o in list(trunk_g.objects) + list(branch_g.objects):
    o.data.materials.clear()
    o.data.materials.append(WOOD)
    for p in o.data.polygons:
        p.material_index = 0
    gs.paint(o, bark_colour)


# ------------------------------------------------------------------ motes
def emission_mat(name, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (1, .97, .90, 1)
    em.inputs['Strength'].default_value = strength
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    return m


MOTE = emission_mat('Mote light', 6.0)
# Halo: emission fading to transparent toward the silhouette, faking bloom.
HALO = emission_mat('Mote halo', 1.5)
nt = HALO.node_tree
em = next(n for n in nt.nodes if n.type == 'EMISSION')
out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
lw = nt.nodes.new('ShaderNodeLayerWeight')
lw.inputs['Blend'].default_value = .5
inv = nt.nodes.new('ShaderNodeMath')
inv.operation = 'SUBTRACT'
inv.inputs[0].default_value = 1
nt.links.new(lw.outputs['Facing'], inv.inputs[1])
pw = nt.nodes.new('ShaderNodeMath')
pw.operation = 'POWER'
pw.inputs[1].default_value = 3
nt.links.new(inv.outputs[0], pw.inputs[0])
mul = nt.nodes.new('ShaderNodeMath')
mul.operation = 'MULTIPLY'
mul.inputs[1].default_value = .8
nt.links.new(pw.outputs[0], mul.inputs[0])
tr = nt.nodes.new('ShaderNodeBsdfTransparent')
mix = nt.nodes.new('ShaderNodeMixShader')
nt.links.new(mul.outputs[0], mix.inputs[0])
nt.links.new(tr.outputs[0], mix.inputs[1])
nt.links.new(em.outputs[0], mix.inputs[2])
nt.links.new(mix.outputs[0], out.inputs['Surface'])

motes = 0
while motes < 14:
    x, z = random.uniform(-2.9, 2.9), random.uniform(2.6, 6.6)
    if (x / 3.1) ** 2 + ((z - 4.7) / 2.1) ** 2 > 1:
        continue
    pos = (x, random.uniform(-3.4, -2.6), z)
    r = random.uniform(.026, .045)
    for name, rad, m, seg in (('Mote %02d' % motes, r, MOTE, 8),
                              ('Mote %02d halo' % motes, r * 3.2, HALO, 14)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg * 2, ring_count=seg,
                                             radius=rad, location=pos)
        o = bpy.context.object
        o.name = name
        for col in list(o.users_collection):
            col.objects.unlink(o)
        mote_g.objects.link(o)
        o.data.materials.append(m)
        o.visible_shadow = False
        for p in o.data.polygons:
            p.use_smooth = True
    motes += 1

gs.studio(studio_g, cam_pos=(1.0, -22, 4.7), target_z=3.74, ortho_scale=8.36,
          key=1120, fill=340, world=1.42)
gs.render(ROOT / 'ghibli_pale_tree.blend', ROOT / 'ghibli_pale_tree.png',
          note='Reference-matched pale sculptural tree, shared studio rig.')
print('pale tree built: %d branch tubes, %d motes' % (tubes, motes), flush=True)
