"""Eight sprite frames of the leaf gardener for the 2D buddy (src/buddy.js).

Run: blender -b Character/leaf_gardener.blend --python Character/render_sprites.py

Frame i is the model turned 45 degrees * i as seen from the front: 0 front,
2 right profile (facing the viewer's right), 4 back, 6 left profile. Each is a
197 x 300 transparent PNG with the figure filling the height, written to
public/assets/gardener_<i>.png. The scene's own key, fill and rim lights are
used; the studio floor is hidden. The blend file is never saved.
"""
import math
import pathlib

import bpy
import numpy as np
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parent
OUT = ROOT.parent / 'public' / 'assets'
W, H, FILL = 197, 300, 295 / 300       # frame size; the figure spans FILL of the height

scene = bpy.context.scene
root = bpy.data.objects['LEAF GARDENER • character root']
bpy.data.objects['Studio • seamless ground'].hide_render = True

cam_data = bpy.data.cameras.new('Sprite camera')
cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('Sprite camera', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam
# Same viewpoint as 'Camera • straight front': 22 out, a little above, looking
# at the chest, so the crown leaves show their tops as in the review renders.
cam.location = (0, -22, 5.8)
cam.rotation_euler = (Vector((0, 0, 2.36)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_data.ortho_scale = 4.9

scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGBA'
scene.cycles.samples = 96


def render(path):
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def alpha_rows(path):
    """First and last row (from the top) holding any opaque pixel."""
    img = bpy.data.images.load(str(path))
    w, h = img.size
    px = np.array(img.pixels[:]).reshape(h, w, 4)
    bpy.data.images.remove(img)
    rows = np.where(px[:, :, 3].max(axis=1) > .02)[0]      # row 0 is the bottom
    return h - 1 - rows.max(), h - 1 - rows.min()


# Fit once on the front view: scale so the figure spans FILL of the height,
# then centre it vertically. Every frame then shares the same framing.
probe = OUT / 'gardener_probe.png'
render(probe)
top, bottom = alpha_rows(probe)
span = (bottom - top + 1) / H
cam_data.ortho_scale *= span / FILL
render(probe)
top, bottom = alpha_rows(probe)
shift = ((top + (H - 1 - bottom)) / 2 - top) / H * cam_data.ortho_scale   # world units, up is positive
cam.location.z += shift
probe.unlink()

for i in range(8):
    root.rotation_euler.z = math.radians(45 * i)
    render(OUT / f'gardener_{i}.png')
    print('SPRITE', i, flush=True)
print('SPRITES_COMPLETE', flush=True)
