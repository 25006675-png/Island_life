"""Six editable sculpted leaf options, isolated from the tree scene."""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name,color):
    mat=bpy.data.materials.new(name)
    mat.diffuse_color=(*color,1)
    mat.use_nodes=True
    shader=mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value=(*color,1)
    shader.inputs['Roughness'].default_value=.8
    shader.inputs['Specular IOR Level'].default_value=.18
    return mat


purple=material('Soft violet leaf',(.40,.205,.64))
vein_mat=material('Muted violet midrib',(.32,.15,.48))
ink=material('Warm charcoal labels',(.12,.09,.15))
paper=material('Cream studio',(.82,.76,.66))
paper.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.82,.76,.66,1)
paper.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.35

OPTIONS=[
    dict(letter='A',title='Soft rounded',width=1,tip=1.16,notch=.77,left=1,
         lean=.035,fold=.085,curl=.08,twist=.018),
    dict(letter='B',title='Long middle lobe',width=.83,tip=1.32,notch=.77,left=.95,
         lean=.03,fold=.09,curl=.095,twist=.025),
    dict(letter='C',title='Shallow lobes',width=.95,tip=1.12,notch=.85,left=.98,
         lean=-.025,fold=.065,curl=.09,twist=.035),
    dict(letter='D',title='Asymmetric / organic',width=.98,tip=1.22,notch=.78,left=.82,
         lean=.13,fold=.085,curl=.11,twist=-.065),
    dict(letter='E',title='Stronger center fold',width=.94,tip=1.20,notch=.78,left=.93,
         lean=-.03,fold=.15,curl=.10,twist=.025),
    dict(letter='F',title='Soft curled edges',width=1.02,tip=1.19,notch=.79,left=.9,
         lean=.08,fold=.085,curl=.22,twist=.08),
]


def outline(config):
    notch=config['notch']; tip=config['tip']
    curves=[
        ((0,0),(.12,.08),(.40,.18),(.49,.38)),
        ((.49,.38),(.66,.66),(.44,.95),(.245,notch)),
        ((.245,notch),(.255,tip+.08),(-.29,tip+.08),(-.235,notch-.035)),
        ((-.235,notch-.035),(-.45,.91),(-.65,.62),(-.46,.35)),
        ((-.46,.35),(-.35,.16),(-.10,.055),(0,0)),
    ]
    out=[]
    for controls in curves:
        for i in range(24):
            t=i/24
            out.append(sum((Vector(p)*w for p,w in zip(controls,
                ((1-t)**3,3*(1-t)**2*t,3*(1-t)*t*t,t**3))),Vector((0,0))))
    return out


def surface(x,t,c):
    # Raised central fold plus a narrow recessed midrib. These are geometry,
    # so the two sides shade differently as the leaf or camera rotates.
    s=math.sin(math.pi*min(1,max(0,t/1.15)))
    ridge=c['fold']*math.exp(-(x/.13)**2)*s
    groove=.014*math.exp(-(x/.017)**2)*s
    dome=.085*s
    z=dome+ridge-groove-c['curl']*t*t-.19*x*x+c['twist']*x*t
    x=(x*(c['left'] if x<0 else 1)+c['lean']*t*t)*c['width']
    # Root at the top; three rounded lobes hang downward.
    return Vector((x,.55-t,z))


def make_leaf(config,loc,scale=1):
    boundary=outline(config)
    center=Vector((0,.48)); count=len(boundary); rings=24
    vertices=[surface(*center,config)]
    for ring in range(1,rings+1):
        for edge in boundary:
            point=center+(edge-center)*ring/rings
            vertices.append(surface(*point,config))
    faces=[]
    for k in range(count):
        faces.append((0,1+(k+1)%count,1+k))
    for ring in range(rings-1):
        for k in range(count):
            a=1+ring*count+k; b=1+ring*count+(k+1)%count
            faces.append((b,b+count,a+count,a))
    data=bpy.data.meshes.new(config['letter']+' shaped leaf surface')
    data.from_pydata(vertices,[],faces); data.update(); data.materials.append(purple)
    obj=bpy.data.objects.new(config['letter']+' - '+config['title'],data)
    bpy.context.collection.objects.link(obj); obj.location=loc; obj.scale=(scale,)*3
    for polygon in data.polygons: polygon.use_smooth=True
    thickness=obj.modifiers.new('Thin natural edge','SOLIDIFY'); thickness.thickness=.008

    # A tapered line sits inside the physical center groove, fading near the tip.
    curve=bpy.data.curves.new(config['letter']+' midrib','CURVE')
    curve.dimensions='3D'; curve.resolution_u=2
    curve.bevel_depth=.004; curve.bevel_resolution=3
    spline=curve.splines.new('POLY'); spline.points.add(47)
    for i,point in enumerate(spline.points):
        t=.05+.93*i/47
        v=surface(0,t,config)+Vector((0,0,.003))
        point.co=(*v,1); point.radius=.25+.7*max(0,math.sin(math.pi*i/47))**.6
    midrib=bpy.data.objects.new(config['letter']+' central vein',curve)
    bpy.context.collection.objects.link(midrib); curve.materials.append(vein_mat)
    midrib.parent=obj
    return obj


def text(body,x,y,size):
    font=bpy.data.curves.new(body,'FONT'); font.body=body
    font.align_x='CENTER'; font.size=size; font.space_character=1.05
    font.materials.append(ink)
    obj=bpy.data.objects.new(body,font); bpy.context.collection.objects.link(obj)
    obj.location=(x,y,.018)


for i,config in enumerate(OPTIONS):
    x=(i%3-1)*3.05; y=1.75 if i<3 else -1.65
    obj=make_leaf(config,(x,y,.52),1.9)
    text(config['letter']+'  /  '+config['title'],x,y-1.53,.175)

text('PURPLE LEAF  /  SHAPE STUDIES',0,3.53,.25)
text('Six sculpted forms  -  center vein, curved blade, rounded lobes',0,3.19,.14)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.01))
bpy.context.object.name='Cream background'; bpy.context.object.data.materials.append(paper)


def area(name,location,energy,size):
    data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.location=location; obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()


area('Broad upper left',(-4,4,8),650,5)
area('Soft fill',(4,-1,6),120,5)
scene=bpy.context.scene
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.80,.75,.70,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
camera_data=bpy.data.cameras.new('Comparison camera')
camera=bpy.data.objects.new('Comparison camera',camera_data); bpy.context.collection.objects.link(camera)
camera.location=(0,-3,18)
camera.rotation_euler=(Vector((0,.12,0))-camera.location).to_track_quat('-Z','Y').to_euler()
camera_data.type='ORTHO'; camera_data.ortho_scale=9.7
scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=48; scene.cycles.use_denoising=True
scene.render.resolution_x=1800; scene.render.resolution_y=1500; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'leaf_options.png')
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
for screen in bpy.data.screens:
    for area_obj in screen.areas:
        if area_obj.type=='VIEW_3D':
            area_obj.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'leaf_options.blend'))
bpy.ops.render.render(write_still=True)
