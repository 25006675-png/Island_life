"""Export browser copies only. Source .blend files are never saved or modified.
Run: blender -b -t 6 --python tools/export_assets.py
Procedural base colors are baked to vertex colors, then geometry is consolidated.
"""
import bpy, os, json, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'assets')
os.makedirs(OUT, exist_ok=True)
SOURCES = {
    'community': 'island1.blend', 'meadow': 'island2.blend',
    'purple': 'Ghibli/Purple tree/ghibli_purple_tree_v7.blend',
    'oak': 'Ghibli/Golden oak/ghibli_oak.blend',
    'sakura': 'Ghibli/Sakura tree/ghibli_sakura.blend',
    'palm': 'Ghibli/Coral palm/ghibli_palm.blend',
    'mushrooms': 'Ghibli/Mushroom cluster/ghibli_mushrooms.blend',
    'clover': 'Ghibli/Clover patch/ghibli_clover.blend',
    'gardener': 'Character/leaf_gardener.blend',
}
only = sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
for key, source in SOURCES.items():
    if only and key not in only: continue
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, source))
    scene = bpy.context.scene
    # Studio planes/lights are presentation fixtures, not part of the assets.
    for o in list(scene.objects):
        studio = any('studio' in c.name.lower() or 'camera' in c.name.lower() for c in o.users_collection)
        if o.type not in {'MESH','CURVE'} or studio or o.name in {'SkyLanterns','BridgeWood','BridgeRope','BridgeMetal','LanternGlass_','Banners'}:
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = next(iter(scene.objects))
    # Reduce render-only subdivision before evaluating; retain all modeled details.
    for o in scene.objects:
        for m in o.modifiers:
            if m.type == 'SUBSURF': m.levels = min(m.levels, 1); m.render_levels = m.levels
    bpy.ops.object.convert(target='MESH')
    objects = list(scene.objects)
    # Convert each material's authored base-color graph to emission for baking.
    for mat in bpy.data.materials:
        if not mat.use_nodes: continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        output = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not output: continue
        emit = nodes.new('ShaderNodeEmission')
        if bsdf:
            color = bsdf.inputs['Base Color']
            if color.is_linked: links.new(color.links[0].from_socket, emit.inputs['Color'])
            else: emit.inputs['Color'].default_value = color.default_value
        else:
            diffuse = next((n for n in nodes if n.type in {'BSDF_DIFFUSE','EMISSION'} and n != emit), None)
            if diffuse: emit.inputs['Color'].default_value = diffuse.inputs['Color'].default_value
            else: emit.inputs['Color'].default_value = mat.diffuse_color
        links.new(emit.outputs[0], output.inputs['Surface'])
    # Combine prop/character objects before baking for a small number of draw calls.
    if key not in {'community','meadow'}:
        bpy.ops.object.select_all(action='SELECT')
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.join()
        objects = [bpy.context.object]
        objects[0].name = key
        count = len(objects[0].data.vertices)
        target = 100000 if key == 'gardener' else 95000
        if count > target:
            mod = objects[0].modifiers.new('Browser copy detail budget','DECIMATE')
            mod.ratio = target / count
            bpy.ops.object.modifier_apply(modifier=mod.name)
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 1
    scene.render.bake.target = 'VERTEX_COLORS'
    for o in objects:
        attr = o.data.color_attributes.get('BrowserColor') or o.data.color_attributes.new(name='BrowserColor', type='FLOAT_COLOR', domain='CORNER')
        o.data.color_attributes.active_color = attr
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.bake(type='EMIT')
    browser_mat = bpy.data.materials.new('Painted asset colors')
    browser_mat.use_nodes = True
    bsdf = browser_mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .86
    vc = browser_mat.node_tree.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'BrowserColor'
    browser_mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    for o in objects:
        o.data.materials.clear()
        o.data.materials.append(browser_mat)
        for p in o.data.polygons: p.material_index = 0
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,key+'.glb'), export_format='GLB', use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_yup=True)
    print('EXPORTED',key,flush=True)

