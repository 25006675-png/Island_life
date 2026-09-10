"""Three overlapping elliptical lobes, with front and tilted comparisons."""
import math
from pathlib import Path
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parent
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name,color):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1)
    bs.inputs['Roughness'].default_value=.8
    bs.inputs['Specular IOR Level'].default_value=.15
    return m


central=material('Central lobe lavender',(.43,.23,.69))
side=material('Side lobe violet',(.385,.19,.625))
vein=material('Soft vein',(.32,.15,.50))
ink=material('Label ink',(.10,.07,.13))
cream=material('Cream studio',(.82,.76,.66))
cream.node_tree.nodes['Principled BSDF'].inputs['Emission Color'].default_value=(.82,.76,.66,1)
cream.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=.35


def text(body,x,y,size):
    data=bpy.data.curves.new(body,'FONT'); data.body=body; data.size=size; data.align_x='CENTER'
    data.materials.append(ink)
    obj=bpy.data.objects.new(body,data); bpy.context.collection.objects.link(obj); obj.location=(x,y,.02)


def lobe(name,parent,length,width,angle,lift,material,roll=0):
    def surface(u,t):
        # Elliptical silhouette, narrowing at the shared root, with a convex
        # blade and central ridge. The outer half ends in a broad rounded tip.
        envelope=max(.0005,math.sin(math.pi*t)**.51)*(.72+.28*t)
        x=u*width*envelope
        z=.115*math.sin(math.pi*t)*(1-u*u)-.13*t*t
        z+=.035*math.exp(-(u/.13)**2)*math.sin(math.pi*t)
        return (x,-t*length,z)
    rows=36; cols=20; vertices=[]; faces=[]
    for j in range(rows+1):
        for k in range(cols+1): vertices.append(surface(2*k/cols-1,j/rows))
    for j in range(rows):
        for k in range(cols):
            a=j*(cols+1)+k; faces.append((a,a+cols+1,a+cols+2,a+1))
    data=bpy.data.meshes.new(name); data.from_pydata(vertices,[],faces); data.update()
    data.materials.append(material)
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj)
    obj.parent=parent; obj.location=(0,0,lift); obj.rotation_euler=(0,roll,angle)
    for p in data.polygons: p.use_smooth=True
    solid=obj.modifiers.new('Fine rounded edge','SOLIDIFY'); solid.thickness=.009
    curve=bpy.data.curves.new(name+' vein','CURVE'); curve.dimensions='3D'
    curve.bevel_depth=.0025; curve.bevel_resolution=2
    spline=curve.splines.new('POLY'); spline.points.add(35)
    for i,p in enumerate(spline.points):
        t=.07+.84*i/35; x,y,z=surface(0,t)
        p.co=(x,y,z+.002,1); p.radius=.2+.65*max(0,math.sin(math.pi*i/35))
    mid=bpy.data.objects.new(name+' midrib',curve); bpy.context.collection.objects.link(mid)
    curve.materials.append(vein); mid.parent=obj


OPTIONS=[('G','Compact ellipses',25,1.00,.035),
         ('H','Open overlapping fan',38,1.00,.065),
         ('I','Asymmetric layered fan',33,.85,.075)]


def leaf(letter,fan,asym,lift,location,tilted=False):
    group=bpy.data.objects.new(letter+(' tilted' if tilted else ' front'),None)
    bpy.context.collection.objects.link(group); group.location=location
    group.scale=(1.6,)*3
    if tilted: group.rotation_euler=(math.radians(32),math.radians(-22),math.radians(-10))
    lobe(letter+' left ellipse',group,.96*asym,.28,math.radians(-fan),0,side,-.10)
    lobe(letter+' right ellipse',group,.96,.28,math.radians(fan),.01,side,.10)
    lobe(letter+' overlapping middle ellipse',group,1.23,.31,math.radians(4 if asym<1 else 0),lift,central)


for i,(letter,title,fan,asym,lift) in enumerate(OPTIONS):
    x=(i-1)*3.25
    leaf(letter,fan,asym,lift,(x,2.35,.42))
    text(letter+' / '+title,x,-.04,.18)
    leaf(letter,fan,asym,lift,(x,-.83,.73),tilted=True)
    text('Tilted view',x,-2.83,.14)

text('THREE ELLIPSES / OVERLAPPING LOBES',0,3.2,.24)
text('Each lobe has its own curved surface; the middle lobe sits above the sides.',0,2.88,.125)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.06))
bpy.context.object.data.materials.append(cream)
for name,location,power,size in [('Soft key',(-4,4,8),650,4),('Fill',(4,-1,6),100,5)]:
    data=bpy.data.lights.new(name,'AREA'); data.energy=power; data.size=size
    obj=bpy.data.objects.new(name,data); bpy.context.collection.objects.link(obj); obj.location=location
    obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
scene=bpy.context.scene; scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.45
data=bpy.data.cameras.new('Study camera'); camera=bpy.data.objects.new('Study camera',data)
bpy.context.collection.objects.link(camera); camera.location=(0,-2,18)
camera.rotation_euler=(Vector((0,.1,0))-camera.location).to_track_quat('-Z','Y').to_euler()
data.type='ORTHO'; data.ortho_scale=10.1; scene.camera=camera
scene.render.engine='CYCLES'; scene.cycles.samples=40; scene.cycles.use_denoising=True
scene.render.resolution_x=1800; scene.render.resolution_y=1250; scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(ROOT/'elliptical_leaf_options.png')
scene.view_settings.view_transform='AgX'; scene.view_settings.look='AgX - Medium High Contrast'
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D': area.spaces.active.region_3d.view_perspective='CAMERA'
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'elliptical_leaf_options.blend'))
bpy.ops.render.render(write_still=True)
