"""Render one tree species as a small square icon for the category labels in
the app (planner rows, balance legend, task board, path cards). Same studio
handling as tools/render_landing_tree.py, a little more tilt so the canopy
reads at icon size. The blend file is never saved.

Run: blender -b "models/trees/Purple tree/ghibli_purple_tree.blend" --python tools/render_species_icon.py -- study
Writes public/assets/icons/<category>.webp.
"""
import math
import pathlib
import sys

import bpy
from mathutils import Vector

cat = sys.argv[sys.argv.index('--') + 1]
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'icons' / f'{cat}.webp'
OUT.parent.mkdir(parents=True, exist_ok=True)
SIZE = 128                            # square, shown at 20-28 px (crisp at 3x+)
ELEV = math.radians(14)

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

cam_data = bpy.data.cameras.new('Icon camera')
cam_data.type = 'ORTHO'
cam_data.clip_end = 400
cam = bpy.data.objects.new('Icon camera', cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
cam.location = mid + Vector((0, -100 * math.cos(ELEV), 100 * math.sin(ELEV)))
cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
loc = [inv @ p for p in pts]
x0, x1 = min(p.x for p in loc), max(p.x for p in loc)
y0, y1 = min(p.y for p in loc), max(p.y for p in loc)
q = cam.matrix_world.to_quaternion()
cam.location += q @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
cam_data.ortho_scale = max(x1 - x0, y1 - y0) * 1.04
sc.render.resolution_x = sc.render.resolution_y = SIZE

sc.render.engine = 'CYCLES'
sc.cycles.samples = 48
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
sc.render.image_settings.quality = 90
sc.render.filepath = str(OUT)
bpy.ops.render.render(write_still=True)
print('ICON_COMPLETE', OUT, flush=True)
