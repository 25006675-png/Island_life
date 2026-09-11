"""Re-render the four review views of the leaf gardener from the cameras saved
in the blend: front, rear three quarter, side profile and face study.

Run: blender -b Character/leaf_gardener.blend --python Character/render_reviews.py

The portrait itself is rendered by create_leaf_gardener.py. The blend file is
never saved.
"""
import pathlib

import bpy

ROOT = pathlib.Path(__file__).resolve().parent
VIEWS = {'Camera • straight front': 'leaf_gardener_front.png',
         'Camera • rear three quarter': 'leaf_gardener_back.png',
         'Camera • side profile': 'leaf_gardener_side.png',
         'Camera • face study': 'leaf_gardener_face.png'}
scene = bpy.context.scene
for camera, filename in VIEWS.items():
    scene.camera = bpy.data.objects[camera]
    scene.render.filepath = str(ROOT / filename)
    bpy.ops.render.render(write_still=True)
    print('REVIEW', filename, flush=True)
print('REVIEWS_COMPLETE', flush=True)
