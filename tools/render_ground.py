"""Render the meadow island's front edge as a wide transparent strip for the
sign-in page's ground: a band of grass seen from a little above, one near rim
with clustered shrubs, blossom and rocks, the rock face below it, and the
rocky underside tapering away with sky beneath -- the edge of a floating
island.

Only for this picture (the blend file is never saved):
  * the camera looks down a few degrees, so the grass top shows as a band;
  * the torii, grass tufts and hanging vines are hidden; rim shrubs and
    blossom are kept only along the near rim (the far rim would read as a
    second edge) and thinned there to clusters with gaps between them;
  * the island's underside is squashed so its whole taper fits the strip, and
    the small floating rocks are lifted (not squashed) to hang just below it.

Run: blender -b models/island/island2a.blend --python tools/render_ground.py
Writes public/assets/ground.webp (RGBA) and prints, as fractions of the image
height from the top: RIM_LINE (the near rim, where the gardener stands) and
TIP_LINE (the lowest point of the island's underside at the middle).
"""
import math
import pathlib

import bmesh
import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'ground.webp'
W = 2400
SQUASH = .32                        # underside depth kept
ELEV = math.radians(3.5)            # how far the camera looks down

sc = bpy.context.scene
HIDE = ('Torii', 'FloatGrass', 'Tufts', 'VineLeaves', 'VineStems')
for o in sc.objects:
    studio = any('studio' in c.name.lower() or 'camera' in c.name.lower() for c in o.users_collection)
    if o.name.startswith(HIDE) or o.type == 'CAMERA' or studio:
        o.hide_render = True

isl = bpy.data.objects['Island']
world = lambda ob: [ob.matrix_world @ v.co for v in ob.data.vertices]
ymin = min(p.y for p in world(isl))
ztop = max(p.z for p in world(isl))
FRONT = ymin + 6                    # shrubs nearer than this belong to the near rim


def components(ob):
    """Connected pieces of a mesh, as lists of BMFaces (bm stays open)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    seen, pieces = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        piece, stack = [], [f]
        seen.add(f.index)
        while stack:
            g = stack.pop()
            piece.append(g)
            for v in g.verts:
                for h in v.link_faces:
                    if h.index not in seen:
                        seen.add(h.index)
                        stack.append(h)
        pieces.append(piece)
    return bm, pieces


def centre(ob, piece):
    c = Vector()
    for f in piece:
        c += f.calc_center_median()
    return ob.matrix_world @ (c / len(piece))


def keep(c, near, at):
    """In clusters along x with gaps between them (more kept as `at` falls);
    `near` also keeps it to the near rim."""
    return (not near or c.y < FRONT) and math.sin(c.x * .9) + .5 * math.sin(c.x * 2.3 + 1) > at


def thin(name, near=True, at=0.):
    ob = bpy.data.objects.get(name)
    if not ob:
        return
    bm, pieces = components(ob)
    drop = [f for p in pieces if not keep(centre(ob, p), near, at) for f in p]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    bm.to_mesh(ob.data)
    bm.free()


def lift(name):
    """Move each floating rock up so it hangs under the squashed island."""
    ob = bpy.data.objects.get(name)
    if not ob:
        return
    bm, pieces = components(ob)
    for p in pieces:
        c = centre(ob, p)
        if c.z < 0:
            dz = c.z * (SQUASH - 1)
            for v in {v for f in p for v in f.verts}:
                v.co.z += dz
    bm.to_mesh(ob.data)
    bm.free()


thin('RimShrubs')
thin('RimBlossom')
thin('Flowers')
# The green faceted "moss" boulders across the top are ScatterRocks. Their
# rock material paints moss on every upward face, so give them a plain warm
# grey-brown stone (the floating rocks' colour) to read as rock, not
# greenery, and keep most of them all over the top for texture.
thin('ScatterRocks', near=False, at=-.5)
rock = bpy.data.materials.new('Ground stone')
rock.use_nodes = True
bsdf = next(n for n in rock.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (.40, .33, .25, 1)
bsdf.inputs['Roughness'].default_value = .9
sr = bpy.data.objects['ScatterRocks']
sr.data.materials.clear()
sr.data.materials.append(rock)
print('ROCK MATERIAL', rock.name, flush=True)
for v in isl.data.vertices:
    if v.co.z < 0:
        v.co.z *= SQUASH
isl.data.update()
lift('FloatRock')

# camera: looking down ELEV at the island; the frame is fitted afterwards from
# where every visible piece lands in the camera's view
cam_data = bpy.data.cameras.new('Ground camera')
cam_data.type = 'ORTHO'
width = (max(p.x for p in world(isl)) - min(p.x for p in world(isl))) * .92
cam_data.ortho_scale = width
cam_data.clip_end = 400
cam = bpy.data.objects.new('Ground camera', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = (0, -100 * math.cos(ELEV), 100 * math.sin(ELEV))
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
shown = [o for o in sc.objects if o.type == 'MESH' and not o.hide_render]
ys = [(inv @ p).y for o in shown for p in world(o) if abs((inv @ p).x) < width / 2]
top, bottom = max(ys) + .35, min(ys) - .3
cam.location += cam.matrix_world.to_quaternion() @ Vector((0, (top + bottom) / 2, 0))
H = round(W * (top - bottom) / width)

isl_pts = world(isl)
rim = min((p for p in isl_pts if p.z > ztop - .25 and abs(p.x) < 3), key=lambda p: p.y)
tip = min((p for p in isl_pts if abs(p.x) < 3), key=lambda p: p.z)
frac = lambda p: round((top - (inv @ p).y) / (top - bottom), 4)

sc.render.engine = 'CYCLES'
sc.cycles.samples = 64
sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != 'CPU'
    sc.cycles.device = 'GPU'
except Exception as e:
    print('CPU rendering:', e, flush=True)
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.quality = 86
sc.render.filepath = str(OUT)
bpy.ops.render.render(write_still=True)
print('GROUND_COMPLETE', OUT, W, H, flush=True)
print('RIM_LINE', frac(rim), 'TIP_LINE', frac(tip), flush=True)
