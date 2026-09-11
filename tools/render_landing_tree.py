"""Render one tree of the series as a transparent sprite for the sign-in page,
seen from the same slight tilt as the ground (tools/render_ground.py). The
studio floor and walls are hidden; the studio lights stay. The blend file is
never saved.

Run: blender -b "Ghibli/Sakura tree/ghibli_sakura.blend" --python tools/render_landing_tree.py -- sakura
     blender -b "Ghibli/Blue willow/ghibli_willow.blend" --python tools/render_landing_tree.py -- willow
Writes public/assets/tree-<name>.webp and prints BASE_LINE: where the tree
meets the ground, as a fraction of the image height from the top (the page
plants it on the grass there).
"""
import math
import pathlib
import sys

import bpy
from mathutils import Vector

name = sys.argv[sys.argv.index('--') + 1]
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / f'tree-{name}.webp'
LONG = 1100                          # pixels along the longer side
ELEV = math.radians(3.5)

sc = bpy.context.scene
for o in sc.objects:
    studio = any('studio' in c.name.lower() or 'camera' in c.name.lower() for c in o.users_collection)
    if (o.type in {'MESH', 'CURVE'} and studio) or o.name.endswith(' halo'):
        o.hide_render = True

dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in sc.objects:
    if o.type not in {'MESH', 'CURVE'} or o.hide_render:
        continue
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    pts += [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
mid = (lo + hi) / 2

cam_data = bpy.data.cameras.new('Sprite camera')
cam_data.type = 'ORTHO'
cam_data.clip_end = 400
cam = bpy.data.objects.new('Sprite camera', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = mid + Vector((0, -100 * math.cos(ELEV), 100 * math.sin(ELEV)))
cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
loc = [inv @ p for p in pts]
x0, x1 = min(p.x for p in loc), max(p.x for p in loc)
y0, y1 = min(p.y for p in loc), max(p.y for p in loc)
pad = .03 * max(x1 - x0, y1 - y0)
x0, x1, y0, y1 = x0 - pad, x1 + pad, y0 - pad, y1 + pad
q = cam.matrix_world.to_quaternion()
cam.location += q @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
w, h = x1 - x0, y1 - y0
cam_data.ortho_scale = max(w, h)
if h >= w:
    sc.render.resolution_y, sc.render.resolution_x = LONG, round(LONG * w / h)
else:
    sc.render.resolution_x, sc.render.resolution_y = LONG, round(LONG * h / w)
base = (inv @ Vector((mid.x, mid.y, lo.z))).y   # before the recentring move, same frame
print('BASE_LINE', round((y1 - base) / (y1 - y0), 4), 'SIZE', sc.render.resolution_x, sc.render.resolution_y, flush=True)

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
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.quality = 86
sc.render.filepath = str(OUT)
bpy.ops.render.render(write_still=True)
print('TREE_COMPLETE', OUT, flush=True)
