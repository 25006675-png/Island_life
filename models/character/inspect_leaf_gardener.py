"""Check the saved geometry and render front/rear review views."""
import bpy
import bmesh
import json
import math
from pathlib import Path

ROOT=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'leaf_gardener.blend'))
scene=bpy.context.scene
deps=bpy.context.evaluated_depsgraph_get()
report={'mesh_objects':0,'evaluated_vertices':0,'evaluated_triangles':0,
        'nonfinite_vertices':0,'inverted_closed_meshes':[], 'cameras':[],
        'packed_reference':False}
for ob in bpy.data.objects:
    if ob.type=='CAMERA': report['cameras'].append(ob.name)
    if ob.type not in {'MESH','CURVE'} or ob.name.startswith('Studio'): continue
    ev=ob.evaluated_get(deps); me=ev.to_mesh()
    if me is None: continue
    me.calc_loop_triangles()
    report['mesh_objects']+=1
    report['evaluated_vertices']+=len(me.vertices)
    report['evaluated_triangles']+=len(me.loop_triangles)
    report['nonfinite_vertices']+=sum(not all(math.isfinite(x) for x in v.co) for v in me.vertices)
    bm=bmesh.new(); bm.from_mesh(me)
    if bm.edges and all(e.is_manifold for e in bm.edges) and bm.calc_volume(signed=True)<-.000001:
        report['inverted_closed_meshes'].append(ob.name)
    bm.free(); ev.to_mesh_clear()
report['packed_reference']=any(i.packed_file is not None for i in bpy.data.images if i.name.startswith('REFERENCE'))
(ROOT/'geometry_review.json').write_text(json.dumps(report,indent=2))
print('GEOMETRY_REVIEW',json.dumps(report),flush=True)
assert report['nonfinite_vertices']==0
assert not report['inverted_closed_meshes'],report['inverted_closed_meshes']
assert report['packed_reference']
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX'; prefs.get_devices()
    for device in prefs.devices: device.use=device.type=='OPTIX'
    if any(device.use for device in prefs.devices): scene.cycles.device='GPU'
except Exception:
    scene.cycles.device='CPU'
scene.cycles.samples=64; scene.cycles.adaptive_threshold=.025
scene.render.resolution_x=1100; scene.render.resolution_y=1320
for name,output in [('Camera • straight front','leaf_gardener_front.png'),('Camera • rear three quarter','leaf_gardener_back.png'),('Camera • side profile','leaf_gardener_side.png'),('Camera • face study','leaf_gardener_face.png')]:
    scene.camera=bpy.data.objects[name]; scene.render.filepath=str(ROOT/output)
    bpy.ops.render.render(write_still=True)
print('REVIEW_COMPLETE',flush=True)
