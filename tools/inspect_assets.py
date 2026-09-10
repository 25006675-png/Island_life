import bpy, os, json
from mathutils import Vector
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = ['island1.blend', 'island2.blend', 'Ghibli/Purple tree/ghibli_purple_tree_v7.blend', 'Ghibli/Golden oak/ghibli_oak.blend', 'Ghibli/Sakura tree/ghibli_sakura.blend', 'Character/leaf_gardener.blend']
report = {}
for file in files:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(root,file))
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    report[file] = {'collections': [c.name for c in bpy.data.collections], 'objects': [{'name':o.name,'verts':len(o.data.vertices),'materials':[m.name for m in o.data.materials if m], 'collections':[c.name for c in o.users_collection], 'min':[min((o.matrix_world @ Vector(b))[i] for b in o.bound_box) for i in range(3)], 'max':[max((o.matrix_world @ Vector(b))[i] for b in o.bound_box) for i in range(3)]} for o in meshes]}
with open(os.path.join(root,'tools/asset-inspection.json'),'w') as f: json.dump(report,f,indent=2)
print('Inspection saved')
