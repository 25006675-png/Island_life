"""Render the world's own pieces as small icons: an island, and a light bridge.

The island comes from the exported GLB, so the icon is the same model the app
shows. The bridge is built here, because in the app it is generated in code
rather than modelled. Both render on a transparent background.

Run: blender -b --python tools/render_world_icons.py -- island
     blender -b --python tools/render_world_icons.py -- bridge
"""
import math
import pathlib
import sys

import bpy
from mathutils import Vector

what = sys.argv[sys.argv.index('--') + 1]
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'assets' / 'icons' / f'{what}.webp'
SIZE, ELEV = 256, math.radians(17)   # low enough to see the grassy top and the rocky keel


def clear():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(block):
            block.remove(item)


def build_bridge():
    """A short arc of planks with two glowing rails, like the bridges in the world."""
    deck = bpy.data.materials.new('Deck')
    deck.use_nodes = True
    bsdf = deck.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (.96, .72, .26, 1)
    bsdf.inputs['Roughness'].default_value = .28
    bsdf.inputs['Emission Color'].default_value = (1, .82, .42, 1)
    bsdf.inputs['Emission Strength'].default_value = .75

    rail = bpy.data.materials.new('Rail')
    rail.use_nodes = True
    rb = rail.node_tree.nodes['Principled BSDF']
    rb.inputs['Base Color'].default_value = (1, .86, .45, 1)
    rb.inputs['Metallic'].default_value = .8
    rb.inputs['Roughness'].default_value = .22
    rb.inputs['Emission Color'].default_value = (1, .84, .40, 1)
    rb.inputs['Emission Strength'].default_value = 3.2

    span, rise, planks = 3.2, 1.0, 15
    for i in range(planks - 1):
        t = (i + .5) / (planks - 1)
        bpy.ops.mesh.primitive_cube_add(size=1, location=((t - .5) * span, 0, math.sin(math.pi * t) * rise - .055))
        base = bpy.context.object
        base.scale = (span / (planks - 1) * .62, .78, .06)
        base.data.materials.append(deck)
    for i in range(planks):
        t = i / (planks - 1)
        x = (t - .5) * span
        y = math.sin(math.pi * t) * rise
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, y))
        p = bpy.context.object
        p.scale = (span / planks * .48, .70, .075)
        p.rotation_euler = (0, -math.atan2(math.cos(math.pi * t) * rise * math.pi / span, 1) * .55, 0)
        p.data.materials.append(deck)
    for side in (-.62, .62):
        pts = []
        for i in range(planks):
            t = i / (planks - 1)
            pts.append(((t - .5) * span, side, math.sin(math.pi * t) * rise + .30))
        curve = bpy.data.curves.new('rail', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = .075
        spline = curve.splines.new('NURBS')
        spline.points.add(len(pts) - 1)
        for i, (x, y, z) in enumerate(pts):
            spline.points[i].co = (x, y, z, 1)
        spline.use_endpoint_u = True
        obj = bpy.data.objects.new('rail', curve)
        obj.data.materials.append(rail)
        bpy.context.collection.objects.link(obj)


clear()
if what == 'island':
    bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public' / 'assets' / 'meadow_a.glb'))
else:
    build_bridge()

# light it warmly, the way the world is lit
sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN'))
sun.data.energy, sun.data.angle = 6.5, .35
sun.rotation_euler = (math.radians(52), 0, math.radians(35))
bpy.context.collection.objects.link(sun)
world = bpy.context.scene.world or bpy.data.worlds.new('World')
bpy.context.scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.95, .93, .98, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = .85

dg = bpy.context.evaluated_depsgraph_get()
pts = []
for o in bpy.context.scene.objects:
    if o.type not in {'MESH', 'CURVE'}:
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
cam_data.clip_end = 4000
cam = bpy.data.objects.new('Icon camera', cam_data)
bpy.context.scene.collection.objects.link(cam)
bpy.context.scene.camera = cam
cam.location = mid + Vector((-55 * math.cos(ELEV), -95 * math.cos(ELEV), 110 * math.sin(ELEV)))
cam.rotation_euler = (mid - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.view_layer.update()
inv = cam.matrix_world.inverted()
loc = [inv @ p for p in pts]
x0, x1 = min(p.x for p in loc), max(p.x for p in loc)
y0, y1 = min(p.y for p in loc), max(p.y for p in loc)
q = cam.matrix_world.to_quaternion()
cam.location += q @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
cam_data.ortho_scale = max(x1 - x0, y1 - y0) * 1.06

sc = bpy.context.scene
sc.render.resolution_x = sc.render.resolution_y = SIZE
sc.render.engine = 'CYCLES'
sc.cycles.samples = 64
sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.color_mode = 'RGBA'
sc.render.image_settings.quality = 92
sc.render.filepath = str(OUT)
bpy.ops.render.render(write_still=True)
print('ICON_COMPLETE', OUT, flush=True)
