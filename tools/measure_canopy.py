"""Measure how big each activity species looks, for CANOPY_MATCH in src/forest.js.

A tree is judged by the area of its coloured parts, not its height. This renders
flat Workbench masks of each species' Blender source: coloured materials white,
everything else black (so the trunk still hides canopy behind it), from an ortho
camera 32 degrees above the horizon (the member islands' walk camera), averaged
over 8 headings because trees are planted at random yaw. Areas are multiplied by
SPECIES_SCALE^2, i.e. a medium-tier tree in-game. The .blend files are never saved.

Run: blender -b --python tools/measure_canopy.py
The last column is the factor that brings each species to the median.
"""
import bpy, math, os, sys, tempfile
import numpy as np
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp()
SOURCES = {
    'purple': 'models/trees/Purple tree/ghibli_purple_tree.blend',
    'oak': 'models/trees/Golden oak/ghibli_oak.blend',
    'sakura': 'models/trees/Sakura tree/ghibli_sakura.blend',
    'palm': 'models/trees/Coral palm/ghibli_palm.blend',
    'pale': 'models/trees/Pale tree/ghibli_pale_tree.blend',
    'willow': 'models/trees/Blue willow/ghibli_willow.blend',
    'magic_mushrooms': 'models/trees/Magic mushrooms/ghibli_magic_mushrooms.blend',
}
SCALE = {'sakura': 1.05, 'purple': 1.2, 'oak': .85, 'palm': 1.0, 'willow': .95,
         'pale': .9, 'magic_mushrooms': 1.25}          # src/main.js SPECIES_SCALE
COLOURED = {'purple': ('Lilac petal',), 'oak': ('Leaf', 'Cluster core'),
            'sakura': ('Blossom', 'Cluster core'), 'palm': ('Frond', 'Rachis'),
            'pale': ('Pale bark', 'Mote light'), 'willow': ('Willow leaf',),
            'magic_mushrooms': ('Cap', 'Glowing gills', 'Glowing cap spot')}
ELEV, YAWS, ORTHO, RES = math.radians(32), 8, 14.0, 700

results = {}
for key, src in SOURCES.items():
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, src))
    sc = bpy.context.scene
    # the same objects tools/export_assets.py drops
    for o in list(sc.objects):
        studio = any('studio' in c.name.lower() or 'camera' in c.name.lower() for c in o.users_collection)
        if o.type not in {'MESH', 'CURVE'} or studio or o.name.endswith(' halo'):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in bpy.data.materials:
        m.diffuse_color = (1, 1, 1, 1) if m.name.startswith(COLOURED[key]) else (0, 0, 0, 1)
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for o in sc.objects:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    target = (lo + hi) / 2
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'MATERIAL'
    sc.display.render_aa = 'OFF'
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    cd = bpy.data.cameras.new('measure'); cam = bpy.data.objects.new('measure', cd)
    sc.collection.objects.link(cam); sc.camera = cam
    cd.type = 'ORTHO'; cd.ortho_scale = ORTHO; cd.clip_end = 500
    fr_col, fr_all = [], []
    for i in range(YAWS):
        yaw = i * math.tau / YAWS
        d = Vector((math.cos(yaw) * math.cos(ELEV), math.sin(yaw) * math.cos(ELEV), math.sin(ELEV)))
        cam.location = target + d * 60
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        path = os.path.join(TMP, 'mask.png')
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.empty(RES * RES * 4, dtype=np.float32); img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        solid = px[:, 3] > .5
        fr_all.append(solid.mean()); fr_col.append((solid & (px[:, 0] > .5)).mean())
        bpy.data.images.remove(img)
    k = ORTHO * ORTHO * SCALE[key] ** 2
    results[key] = (np.mean(fr_col) * k, np.mean(fr_all) * k, min(fr_col) * k, max(fr_col) * k)

med = float(np.median([r[0] for r in results.values()]))
print('RESULT species          coloured  (min-max over yaw)  silhouette  vs median  scale-to-median')
for key, (col, sil, a, b) in sorted(results.items(), key=lambda x: -x[1][0]):
    print('RESULT %-16s %8.2f  (%5.2f-%5.2f)       %8.2f     %5.2fx      x%.2f' %
          (key, col, a, b, sil, col / med, math.sqrt(med / col)))
