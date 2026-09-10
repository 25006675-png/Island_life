"""Build an editable, fully geometric tree from the supplied Ghibli reference.

Run with Blender --background --python create_ghibli_tree.py.
No downloaded assets or textures are required.
"""
import math
import random
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
random.seed(42)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for collection in list(bpy.data.collections):
    if collection.name != 'Collection' and collection.users == 0:
        bpy.data.collections.remove(collection)


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


wood = collection('01 • Sculpted trunk and roots')
crowns = [collection(f'0{i+2} • {name} canopy') for i, name in enumerate(('Lower', 'Middle', 'Top'))]
studio = collection('05 • Camera and cream studio')


def mat(name, rgb, roughness=0.85):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Specular IOR Level'].default_value = .15
    return m


leaves = [mat(f'Lilac petal {i+1:02}', rgb) for i, rgb in enumerate([
    (.38,.16,.65), (.45,.21,.72), (.51,.25,.77), (.56,.28,.80),
    (.61,.32,.84), (.66,.37,.87), (.70,.41,.89), (.57,.31,.78),
    (.48,.26,.73), (.62,.36,.83), (.73,.45,.90), (.53,.29,.78)])]
for material in leaves:
    shader=material.node_tree.nodes.get('Principled BSDF')
    color=shader.inputs['Base Color'].default_value
    shader.inputs['Base Color'].default_value=(color[0]*.56,color[1]*.42,color[2]*.76,1)
barks = [mat(f'Bark facet {i+1:02}', rgb) for i, rgb in enumerate([
    (.19,.125,.125), (.23,.16,.145), (.28,.20,.17), (.32,.235,.19),
    (.245,.17,.165), (.20,.14,.17), (.35,.26,.21)])]


def mesh(name, vertices, faces, mats, group):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    for material in mats:
        data.materials.append(material)
    return obj


def tube(name, path, radii, sides=11):
    verts, faces = [], []
    for j, (point, radius) in enumerate(zip(path, radii)):
        point = Vector(point)
        tangent = Vector(path[min(j+1,len(path)-1)]) - Vector(path[max(0,j-1)])
        tangent.normalize()
        across = tangent.cross(Vector((0,1,0))).normalized()
        side = tangent.cross(across).normalized()
        for k in range(sides):
            a = 2*math.pi*k/sides + j*.105
            r = radius * (1 + .095*math.sin(k*3.1+j*.4))
            verts.append(point+r*(math.cos(a)*across+math.sin(a)*side))
    for j in range(len(path)-1):
        for k in range(sides):
            a=j*sides+k; b=j*sides+(k+1)%sides
            c=b+sides; d=a+sides
            if (j+k)%4 == 0:
                faces.extend([(a,b,c),(a,c,d)])
            else:
                faces.append((a,b,c,d))
    faces += [tuple(reversed(range(sides))), tuple((len(path)-1)*sides+k for k in range(sides))]
    obj=mesh(name, verts, faces, barks, wood)
    for p in obj.data.polygons:
        center=p.center
        angle=math.atan2(center.y,center.x)
        p.material_index=int((angle+math.pi)*len(barks)/math.tau)%len(barks)
    return obj


def trunk_center(z):
    return Vector((.24*math.sin(z*1.75)-.10*math.cos(z*.65), .10*math.sin(z*2.2), z))


zs=[0,.18,.42,.75,1.1,1.45,1.8,2.15,2.5,2.85,3.2,3.6,4,4.4,4.8,5.2,5.6,6,6.4,6.8]
rs=[.33,.31,.245,.22,.205,.20,.215,.235,.235,.20,.185,.165,.15,.135,.12,.105,.095,.08,.065,.025]
dense_z=[]; dense_r=[]
for j in range(len(zs)-1):
    for f in (0,.5):
        dense_z.append(zs[j]*(1-f)+zs[j+1]*f)
        dense_r.append(rs[j]*(1-f)+rs[j+1]*f)
dense_z.append(zs[-1]); dense_r.append(rs[-1])
tube('Continuous twisting trunk', [trunk_center(z) for z in dense_z], dense_r, 15)
for i in range(6):
    a=i*math.tau/6+.15
    outward=Vector((math.cos(a),math.sin(a),0))
    start=trunk_center(.75+random.uniform(-.15,.15))
    end=trunk_center(0)+outward*random.uniform(.43,.63)
    path=[start, trunk_center(.38)+outward*.16, trunk_center(.12)+outward*.32, end+Vector((0,0,.03))]
    tube(f'Flared root {i+1}',path,[.12,.18,.14,.018],7)

# Sweeping forks remain visible in the spaces below the leaf crowns.
for level, spread in [(2.12,1.24),(4.22,.82),(5.63,.53)]:
    for i,a in enumerate([-.7,1.3,3.15,4.4]):
        direction=Vector((math.cos(a), math.sin(a),0))
        start=trunk_center(level)
        path=[start, trunk_center(level+.24)+direction*spread*.28,
              trunk_center(level+.53)+direction*spread*.58,
              trunk_center(level+.82)+direction*spread*.74,
              trunk_center(level+.90)+direction*spread*.83]
        tube(f'Fork {level:.1f} / {i+1}',path,[.115*spread,.095*spread,.07*spread,.04*spread,.012],8)


def petal_mesh(variant):
    # Unequal soft lobes blend into a bent central blade. Several silhouettes
    # and curl profiles avoid repeating the same symmetrical cutout.
    rng=random.Random(610+variant)
    curves=[
        ((0,0),(.12,.08),(.39,.18),(.46,.38)),
        ((.46,.38),(.62,.66),(.43,.90),(.245,.79)),
        ((.245,.79),(.22,1.30),(-.38,1.18),(-.23,.73)),
        ((-.23,.73),(-.45,.85),(-.59,.56),(-.40,.32)),
        ((-.40,.32),(-.30,.16),(-.08,.06),(0,0)),
    ]
    outline=[]
    for controls in curves:
        for i in range(14):
            t=i/14
            p=sum((Vector(v)*w for v,w in zip(controls,
                  ((1-t)**3,3*(1-t)**2*t,3*(1-t)*t*t,t**3))),Vector((0,0)))
            outline.append(p)
    left=rng.uniform(.80,1.15); right=rng.uniform(.80,1.15)
    lean=rng.uniform(-.15,.15); twist=rng.uniform(-.16,.16)
    droop=rng.uniform(.14,.28); cup=rng.uniform(.10,.19)
    tip_length=rng.uniform(.94,1.12)
    mirror=-1 if variant%2 else 1
    def curved(x,y):
        y=y*tip_length+.075*x*math.sin(math.pi*min(1,y))
        x=x*(left if x<0 else right)+lean*y*y
        return (mirror*x,y,cup*math.sin(math.pi*min(1,y))-droop*y*y-.16*x*x+twist*x*y)
    center=Vector((0,.47)); verts=[curved(*center)]; faces=[]
    count=len(outline); rings=7
    for ring in range(1,rings+1):
        for edge in outline:
            xy=center+(edge-center)*ring/rings
            verts.append(curved(*xy))
    for k in range(count):
        faces.append((0,1+k,1+(k+1)%count))
    for ring in range(rings-1):
        for k in range(count):
            a=1+ring*count+k; b=1+ring*count+(k+1)%count
            faces.append((a,a+count,b+count,b))
    data=bpy.data.meshes.new(f'Organic lobed leaf • variant {variant+1}')
    if mirror<0:
        faces=[tuple(reversed(face)) for face in faces]
    data.from_pydata(verts,[],faces); data.update()
    data.materials.append(leaves[0])
    for p in data.polygons:
        p.use_smooth=True
    return data


petals=[petal_mesh(i) for i in range(9)]
leaf_count=0


def crown(index, base, radius, height, rows):
    global leaf_count
    group=crowns[index]
    center=trunk_center(base)
    # Enclosed dark-purple inner volume prevents bright gaps through the foliage.
    vertices=[]; faces=[]; segments=64
    for j in range(17):
        t=j/16
        rr=radius*t
        z=base+height*(1-t**(.72 if index==2 else 1.5))
        for k in range(segments):
            a=k*math.tau/segments
            asym=1+.04*math.sin(3*a+index)+.025*math.cos(5*a)
            vertices.append((center.x+rr*math.cos(a)*asym,center.y+rr*math.sin(a)*.84*asym,z-.10))
    for j in range(16):
        for k in range(segments):
            a=j*segments+k; b=j*segments+(k+1)%segments
            faces.append((a,a+segments,b+segments,b))
    faces.append(tuple(reversed([16*segments+k for k in range(segments)])))
    core=mesh('Concealed crown volume',vertices,faces,[leaves[3]],group)
    for p in core.data.polygons: p.use_smooth=True
    exponent=.72 if index==2 else 1.5
    leaf_length=(.51,.43,.355)[index]

    def place_leaf(t,a,fan,lift,length_factor,shade,skirt=False):
        global leaf_count
        # Low-frequency offsets make little tufts, without carving regular rows.
        irregular=1+.08*math.sin(5*a+index)+.04*math.cos(8*a)
        rr=radius*t*irregular
        # Broad scalloped shelves carry several leaves each. Raised tops and
        # falling fronts produce a readable hierarchy above the leaf detail.
        phase=t*math.tau*3.2+.65*math.sin(a*5+index)
        tuft=.065*math.sin(phase)+.085*math.sin(a*5+index)*t
        z=base+height*(1-t**exponent)+tuft+lift
        direction=a+fan
        slope=math.atan(exponent*height/radius*max(t,.02)**(exponent-1))
        obj=bpy.data.objects.new(f'Cluster leaf {leaf_count:04}',petals[(leaf_count*7+index)%len(petals)])
        group.objects.link(obj)
        obj.location=(center.x+rr*math.cos(a),center.y+rr*math.sin(a)*.84,z)
        pitch=slope*.80 + .16*(1-math.cos(phase))+random.uniform(-.08,.08)
        if skirt:
            pitch=random.uniform(.80,1.24)
        obj.rotation_euler=(-pitch,random.uniform(-.24,.24),direction-math.pi/2)
        length=leaf_length*length_factor
        if index==2 and t<.30:
            length*=.55+t*1.5
        obj.scale=(length*random.uniform(.78,.88),length,length)
        obj.material_slots[0].link='OBJECT'
        obj.material_slots[0].material=leaves[shade]
        leaf_count+=1

    # Each placement is now a whole three-lobed leaf, not three oval cards.
    # Variable depth lets successive sweeps read as soft foliage terraces.
    anchor_count=(180,126,86)[index]
    golden=math.pi*(3-math.sqrt(5))
    for k in range(anchor_count):
        t=math.sqrt((k+.5)/anchor_count)*.965
        a=k*golden+random.uniform(-.07,.07)
        scale=random.uniform(.90,1.12)
        drift=random.uniform(-.32,.32)
        shelf=math.sin(t*math.tau*3.2+.65*math.sin(a*5+index))
        shade=random.choice([4,5,6,9,10]) if shelf>.15 else random.choice([1,2,3,7,8,11])
        place_leaf(t,a,drift,.045+random.uniform(-.012,.012),scale,shade)

    # Irregular hanging leaf bundles give the rim thickness and a soft scallop.
    rim_count=(38,28,20)[index]
    for k in range(rim_count):
        a=k*math.tau/rim_count+random.uniform(-.04,.04)
        t=random.uniform(.91,1.00)
        for n in range(1):
            place_leaf(t+random.uniform(-.025,.015),a+random.uniform(-.045,.045),
                       (n-.5)*.3+random.uniform(-.12,.12),
                       -.08*n+random.uniform(-.025,.015),random.uniform(.90,1.16),
                       random.choice([0,1,2,3,4,7,8]),skirt=True)


crown(0,3.18,1.63,.85,9)
crown(1,4.92,1.12,.65,7)
crown(2,6.26,.74,.96,9)

cream=mat('Cream background',(.76,.69,.58))
cream_shader=cream.node_tree.nodes.get('Principled BSDF')
cream_shader.inputs['Emission Color'].default_value=(.76,.69,.58,1)
cream_shader.inputs['Emission Strength'].default_value=.55
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.018))
floor=bpy.context.object; floor.name='Cream seamless floor'
floor.data.materials.append(cream)
for c in list(floor.users_collection): c.objects.unlink(floor)
studio.objects.link(floor)


def area(name,position,power,size,color):
    data=bpy.data.lights.new(name,'AREA')
    obj=bpy.data.objects.new(name,data); studio.objects.link(obj)
    obj.location=position
    obj.rotation_euler=(Vector((0,0,3.6))-obj.location).to_track_quat('-Z','Y').to_euler()
    data.energy=power; data.shape='DISK'; data.size=size; data.color=color


area('Soft warm upper left',(-4,-6,10),950,5,(1,.89,.82))
area('Lavender fill',(4,-1,6),140,5,(.78,.80,1))
area('Soft canopy rim',(-1,4,9),400,4,(1,.88,1))
data=bpy.data.cameras.new('Portrait camera')
camera=bpy.data.objects.new('Portrait camera',data); studio.objects.link(camera)
camera.location=(8,-18,9)
camera.rotation_euler=(Vector((0,0,3.58))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=8.15
scene=bpy.context.scene; scene.camera=camera
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.76,.70,.65,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.resolution_x=1254; scene.render.resolution_y=1254
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'ghibli_purple_tree.png')
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.25
scene.render.film_transparent=False
scene['reference']='c0ec40e8-1b70-46ed-9d95-3ceae3f08f49.png'
scene['leaf_count']=leaf_count
scene['notes']='Reference-inspired full 3D reconstruction. All leaves are editable linked meshes.'
for screen in bpy.data.screens:
    for space_area in screen.areas:
        if space_area.type=='VIEW_3D':
            space_area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'ghibli_purple_tree.blend'))
print(f'Built {leaf_count} individual leaves',flush=True)
bpy.ops.render.render(write_still=True)
