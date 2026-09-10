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
    # Resolve each material's authored base colour.
    #   - flat colour  -> recorded, written straight to vertex colours later
    #   - node graph   -> routed to an Emission shader and baked by Cycles
    # The old code read only `default_value` for non-Principled materials, so
    # every shader whose colour was LINKED to a ramp (all the painterly foliage,
    # and the whole character) baked out as flat 0.8 grey / white.
    flat_colors, needs_bake = {}, False
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            flat_colors[mat.name] = tuple(mat.diffuse_color); continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        output = next((n for n in nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if not output: continue
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        src = None
        if bsdf: src = bsdf.inputs['Base Color']
        else:
            alt = next((n for n in nodes if n.type in {'BSDF_DIFFUSE','EMISSION'}), None)
            if alt: src = alt.inputs['Color']
        if src is None:
            flat_colors[mat.name] = tuple(mat.diffuse_color); continue
        emit = nodes.new('ShaderNodeEmission')
        if src.is_linked:
            links.new(src.links[0].from_socket, emit.inputs['Color'])
            needs_bake = True
            # fallback so a failed/blank bake can never leave the mesh black
            flat_colors[mat.name] = tuple(src.default_value)
        else:
            emit.inputs['Color'].default_value = src.default_value
            flat_colors[mat.name] = tuple(src.default_value)
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
        me = o.data
        # NB: authored colour attributes are stripped AFTER baking, not before.
        # The character's face material READS its 'Peach and blush' layer, so
        # deleting it early made the face bake to black.
        attr = me.color_attributes.get('BrowserColor') or me.color_attributes.new(
            name='BrowserColor', type='FLOAT_COLOR', domain='CORNER')
        me.color_attributes.active_color = attr
        try:
            i = me.color_attributes.find('BrowserColor')
            me.color_attributes.active_color_index = i
            me.color_attributes.render_color_index = i
        except Exception:
            pass
    # Flat colours are written directly -- deterministic, and immune to the
    # bake silently producing white (which is what happened to the character).
    for o in objects:
        me = o.data
        attr = me.color_attributes['BrowserColor']
        slots = [ms.material.name if ms.material else None for ms in o.material_slots]
        for poly in me.polygons:
            name = slots[poly.material_index] if poly.material_index < len(slots) else None
            col = flat_colors.get(name)
            if col is None: continue
            for li in poly.loop_indices:
                attr.data[li].color = (col[0], col[1], col[2], 1.0)
        painted = sum(1 for n in slots if n in flat_colors)
        print('  %s: %d/%d slots flat-painted' % (o.name[:28], painted, len(slots)), flush=True)
    if needs_bake:
        bpy.ops.object.select_all(action='SELECT')
        bpy.context.view_layer.objects.active = objects[0]
        bpy.ops.object.bake(type='EMIT')
    # Now that baking is done, leave exactly one colour attribute so it lands
    # in COLOR_0 -- a second one exports as COLOR_1, which glTF readers ignore.
    for o in objects:
        for ca in list(o.data.color_attributes):
            if ca.name != 'BrowserColor':
                o.data.color_attributes.remove(ca)
        i = o.data.color_attributes.find('BrowserColor')
        try:
            o.data.color_attributes.active_color_index = i
            o.data.color_attributes.render_color_index = i
        except Exception:
            pass
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

