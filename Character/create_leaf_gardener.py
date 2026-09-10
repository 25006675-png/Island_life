"""Editable, fully modeled leaf gardener. Run with Blender --background --python.

Front is -Y, up is +Z. All dimensions are in scene units. No external textures.
"""
import bpy
import math
import random
import json
import sys
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent
ROOT.mkdir(parents=True, exist_ok=True)
PREVIEW = '--preview' in sys.argv
random.seed(21)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def collection(name):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    return c

FACE = collection('01 • Face and hands')
HAIR = collection('02 • Sculpted golden bob')
HAT = collection('03 • Leaf cap and crown sprout')
SHIRT = collection('04 • Cream shirt and collar')
SUIT = collection('05 • Overalls, tailoring and buttons')
BOOTS = collection('06 • Golden garden boots')
STUDIO = collection('Studio • cameras and lighting')
current = FACE

def assign(obj, name, mat):
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    current.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    if obj.type == 'MESH':
        for p in obj.data.polygons: p.use_smooth = True
    return obj

def material(name, color, rough=.5, subsurface=0, noise=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    n=m.node_tree.nodes; p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough
    p.inputs['Subsurface Weight'].default_value=subsurface
    p.inputs['Subsurface Radius'].default_value=(1,.45,.22)
    if noise:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=160
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.12
        bump.inputs['Distance'].default_value=noise
        m.node_tree.links.new(tex.outputs['Fac'],bump.inputs['Height'])
        m.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])
    return m

skin=material('Warm peach • soft porcelain skin',(.79,.52,.30),.5,.065)
face_mat=material('Peach face with feathered rosy cheeks',(.79,.52,.30),.49,.07)
ink=material('Eyes • polished deep charcoal',(.018,.023,.019),.25)
gold=material('Hair • marigold yellow',(.92,.53,.022),.38,.025)
gold_light=material('Hair • softly lit golden locks',(.98,.61,.031),.4,.025)
hair_line=material('Hair • fine honey grooves',(.66,.34,.014),.53)
leaf_green=material('Hat • fresh leaf green',(.255,.47,.060),.54,.02,.002)
leaf_light=material('Hat • sunlit leaf green',(.325,.555,.078),.53,.02,.002)
leaf_dark=material('Hat • shaded leaves',(.18,.35,.038),.57,.02,.002)
vein_mat=material('Leaves • subtle raised veins',(.33,.52,.085),.6)
cream=material('Shirt • ivory cotton',(.91,.855,.70),.78,0,.0025)
cream_seam=material('Shirt • ivory seam thread',(.78,.735,.58),.82)
green=material('Overalls • garden green cotton',(.095,.245,.068),.76,0,.003)
green_edge=material('Overalls • folded edges',(.13,.295,.086),.72,0,.002)
thread=material('Overalls • muted sage stitching',(.32,.47,.20),.85)
pocket_green=material('Pocket • fresh green',(.22,.42,.12),.74,0,.003)
button_mat=material('Buttons • golden ochre',(.85,.53,.08),.42)
button_dark=material('Button holes • deep ochre',(.32,.21,.038),.62)
boot_mat=material('Boots • butter yellow rubber',(.96,.72,.022),.35)
sole_mat=material('Boot soles • warm golden rubber',(.83,.57,.02),.49)

def mesh(name, verts, faces, mat):
    me=bpy.data.meshes.new(name); me.from_pydata(verts,[],faces); me.update()
    ob=bpy.data.objects.new(name,me); current.objects.link(ob)
    if mat: me.materials.append(mat)
    for p in me.polygons: p.use_smooth=True
    return ob

def sub(ob, level=2):
    m=ob.modifiers.new('Silhouette refinement','SUBSURF'); m.levels=level; m.render_levels=level
    return ob

def uv(name, loc, scale, mat, seg=64, rings=40):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg,ring_count=rings,location=loc)
    ob=assign(bpy.context.object,name,mat); ob.scale=scale
    return ob

def curve(name, points, radius, mat, cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=16
    cu.bevel_depth=radius; cu.bevel_resolution=4
    sp=cu.splines.new('BEZIER'); sp.bezier_points.add(len(points)-1)
    for b,co in zip(sp.bezier_points,points):
        b.co=co; b.handle_left_type='AUTO'; b.handle_right_type='AUTO'
    sp.use_cyclic_u=cyclic
    ob=bpy.data.objects.new(name,cu); current.objects.link(ob); cu.materials.append(mat)
    return ob

def signed(v,p): return math.copysign(abs(v)**p,v)

def rounded(name, center, radii, exponent, mat, nu=128,nv=80,uniform_z=False):
    vs=[]; fs=[]
    for j in range(1,nv):
        a=-math.pi/2+math.pi*j/nv
        if uniform_z: a=math.asin(signed(-1+2*j/nv,1/exponent))
        for i in range(nu):
            b=math.tau*i/nu
            vs.append((center[0]+radii[0]*signed(math.cos(a),exponent)*signed(math.sin(b),exponent),
                       center[1]-radii[1]*signed(math.cos(a),exponent)*signed(math.cos(b),exponent),
                       center[2]+radii[2]*signed(math.sin(a),exponent)))
    for j in range(nv-2):
        for i in range(nu):
            k=j*nu+i; q=j*nu+(i+1)%nu; fs.append((k,q,q+nu,k+nu))
    lo=len(vs); vs.append((center[0],center[1],center[2]-radii[2]))
    hi=len(vs); vs.append((center[0],center[1],center[2]+radii[2]))
    for i in range(nu):
        fs.append((lo,(i+1)%nu,i))
        k=(nv-2)*nu; fs.append((hi,k+i,k+(i+1)%nu))
    ob=mesh(name,vs,fs,mat)
    return ob

def sweep(name, points, widths, depths, mat, sides=32):
    """Smooth elliptical cross sections with local depth along Y."""
    vs=[]; fs=[]
    for i,p in enumerate(points):
        p=Vector(p)
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize(); axis=Vector((0,-1,0))
        right=tangent.cross(axis).normalized(); depth=right.cross(tangent).normalized()
        for j in range(sides):
            a=math.tau*j/sides
            vs.append(p+right*widths[i]*math.cos(a)+depth*depths[i]*math.sin(a))
    for i in range(len(points)-1):
        for j in range(sides):
            a=i*sides+j; b=i*sides+(j+1)%sides; fs.append((a,b,b+sides,a+sides))
    fs.append(tuple(reversed(range(sides))))
    fs.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    ob=mesh(name,vs,fs,mat)
    for p in ob.data.polygons: p.flip()
    return sub(ob,2)

def fuse(name, objects, mat, voxel=.026):
    bpy.ops.object.select_all(action='DESELECT')
    for ob in objects: ob.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.convert(target='MESH'); bpy.ops.object.join()
    ob=bpy.context.object; ob.name=name
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    rem=ob.modifiers.new('Continuous sculpted surface','REMESH'); rem.mode='VOXEL'; rem.voxel_size=voxel
    bpy.ops.object.modifier_apply(modifier=rem.name)
    sm=ob.modifiers.new('Soft sculpt polish','SMOOTH'); sm.factor=1.1; sm.iterations=7
    bpy.ops.object.modifier_apply(modifier=sm.name)
    ob.data.materials.clear(); ob.data.materials.append(mat)
    for p in ob.data.polygons: p.use_smooth=True
    return sub(ob,1)

def panel(name, outline, mat, depth=.028, bevel=.035):
    n=len(outline)
    vs=list(outline)+[(x,y+depth,z) for x,y,z in outline]
    fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]
    fs.extend((i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n))
    ob=mesh(name,vs,fs,mat)
    b=ob.modifiers.new('Soft sewn perimeter','BEVEL'); b.width=bevel; b.segments=5
    ob.modifiers.new('Balanced surface normals','WEIGHTED_NORMAL')
    return ob

# An ovoid cranium, curved jaw and independently shaped facial masses.
# The outline uses circular sections, not the rounded-box primitive used for clothing.
def gaussian(x,z,cx,cz,wx,wz):
    return math.exp(-(((x-cx)/wx)**2+((z-cz)/wz)**2)*1.5)

def head_profile(z):
    # The short lower oval gives a round jaw arc; the taller upper oval fills the skull.
    u=max(-1,min(1,(z-2.71)/(.68 if z<2.71 else 1.05)))
    radius=math.sqrt(max(0,1-u*u))
    jaw=1-.025*math.exp(-((z-2.22)/.17)**2)
    cheeks=.030*math.exp(-((z-2.54)/.20)**2)
    temple=.018*math.exp(-((z-2.91)/.17)**2)
    width=.955*radius*(jaw+cheeks-temple)
    front=.70*radius*(1-.055*math.exp(-((z-2.24)/.18)**2))
    back=.735*radius
    return width,front,back

def facial_forms(x,z):
    depth=0
    for s in (-1,1):
        depth+=.052*gaussian(x,z,s*.335,2.77,.192,.177)  # recessed orbital bowl
        depth+=.010*gaussian(x,z,s*.77,2.91,.17,.23)   # temple transition
        depth-=.067*gaussian(x,z,s*.52,2.535,.29,.235) # integrated cheek pad
        depth-=.016*gaussian(x,z,s*.335,2.985,.27,.125) # soft upper orbital form
    depth-=.015*gaussian(x,z,0,2.74,.17,.23)            # subtle bridge between eyes
    depth-=.023*gaussian(x,z,0,2.29,.34,.16)            # small rounded chin pad
    return depth

def face_y(x,z):
    width,front,back=head_profile(z)
    cosine=math.sqrt(max(0,1-(x/max(width,.0001))**2))
    return .035-front*cosine**.78+facial_forms(x,z)*cosine**2

verts=[]; faces=[]; around=320; rows=240
for j in range(1,rows):
    latitude=-math.pi/2+math.pi*j/rows
    z=2.895+.865*math.sin(latitude)
    width,front,back=head_profile(z)
    for i in range(around):
        a=math.tau*i/around; cosine=math.cos(a); x=width*math.sin(a)
        y=face_y(x,z) if cosine>=0 else .035-back*cosine
        verts.append((x,y,z))
for j in range(rows-2):
    for i in range(around):
        k=j*around+i; q=j*around+(i+1)%around
        faces.append((k,q,q+around,k+around))
lo=len(verts); verts.append((0,.035,2.03))
hi=len(verts); verts.append((0,.035,3.76))
for i in range(around):
    faces.append((lo,(i+1)%around,i))
    k=(rows-2)*around; faces.append((hi,k+i,k+(i+1)%around))
head=mesh('Face • sculpted cheeks, orbital bowls and tapered jaw',verts,faces,face_mat)
head['form_design']='Ovoid cranium; curved tapered jaw; soft chin; cheek pads; orbital recesses; temple and brow transitions.'
col=head.data.color_attributes.new(name='Peach and blush',type='FLOAT_COLOR',domain='POINT')
for i,v in enumerate(head.data.vertices):
    x,y,z=v.co
    blush=sum(math.exp(-(((x-s*.63)/.175)**2+((z-2.56)/.18)**2)*1.6) for s in (-1,1))
    blush*=max(0,min(1,(-y-.15)/.42))*.78
    base=(.85,.59,.37); rose=(.92,.21,.13)
    col.data[i].color=(*(base[k]*(1-blush)+rose[k]*blush for k in range(3)),1)
n=face_mat.node_tree.nodes.new('ShaderNodeVertexColor'); n.layer_name=col.name
face_mat.node_tree.links.new(n.outputs['Color'],face_mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])

for side in (-1,1):
    x=side*.335; z=2.77
    eye=uv(('Left' if side<0 else 'Right')+' • glossy oval eye',(x,face_y(x,z)-.010,z),(.111,.066,.123),ink,80,56)
    eye.rotation_euler[2]=side*.065
    freckles=material(('Left' if side<0 else 'Right')+' cheek • faint freckles',(.67,.30,.16),.75,.03)
    for k,(dx,dz,r) in enumerate([(-.04,.024,.015),(.025,.043,.012),(.055,-.018,.013),(-.003,-.049,.009)]):
        x=side*.63+dx; z=2.57+dz
        uv('Cheek freckle %s %s'%(side,k),(x,face_y(x,z)-.003,z),(r,.004,r*1.15),freckles,24,16)
uv('Neck',(0,0,2.015),(.22,.23,.22),skin)

# Hair shell follows the rounded face and has a deliberately high central hairline.
current=HAIR
vs=[]; fs=[]; na=192; nr=72
for j in range(nr+1):
    t=j/nr
    for i in range(na):
        a=math.tau*i/na
        angle=abs((a+math.pi)%math.tau-math.pi)
        transition=max(0,min(1,(angle-.48)/.64))
        transition=transition*transition*(3-2*transition)
        hairline=(3.405-.065*math.sin(a))*(1-transition)+2.35*transition
        end=math.acos(signed((hairline-2.86)/.97,1/.70))
        b=.006+(end-.006)*t
        x=1.105*(math.sin(b)**.70)*signed(math.sin(a),.70)
        y=-.805*(math.sin(b)**.70)*signed(math.cos(a),.70)+.055
        z=2.86+.97*signed(math.cos(b),.70)
        vs.append((x,y,z))
for j in range(nr):
    for i in range(na):
        k=j*na+i; q=j*na+(i+1)%na; fs.append((k,k+na,q+na,q))
hair=mesh('Bob • continuous rounded crown and back',vs,fs,gold)
sol=hair.modifiers.new('Hair shell thickness','SOLIDIFY'); sol.thickness=.075
bev=hair.modifiers.new('Soft hairline','BEVEL'); bev.width=.045; bev.segments=4
sub(hair,1)
hair_parts=[hair]
for side in (-1,1):
    hair_parts.append(sweep('Bob • integrated outer volume '+str(side),
          [(side*.91,-.12,3.45),(side*1.025,-.19,3.15),(side*1.045,-.23,2.85),(side*1.02,-.22,2.58),(side*.96,-.20,2.46)],
          [.045,.12,.11,.09,.015],[.04,.10,.09,.07,.015],gold))
hair=fuse('Bob • unified crown and seamless side framing',hair_parts,gold,.009)
for i in range(9):
    a=1.28+i*(math.tau-2.56)/8
    pts=[]
    for j in range(8):
        b=.76+1.20*j/7
        pts.append((1.112*(math.sin(b)**.70)*signed(math.sin(a),.70),-.813*(math.sin(b)**.70)*signed(math.cos(a),.70)+.055,2.86+.976*signed(math.cos(b),.70)))
    curve('Bob • subtle back separation %02d'%i,pts,.007,hair_line)

# Broad sculpted leaves: grid surfaces, real thickness, a raised midrib and branching veins.
current=HAT
def leaf(name,start,end,width,mat,arch=.16,cross=.12,veins=True,normal=(0,0,1),thickness=.028):
    start=Vector(start); end=Vector(end); delta=end-start
    normal=Vector(normal).normalized(); across=normal.cross(delta).normalized()
    def point(t,s,lift=0):
        w=width*(max(0,math.sin(math.pi*t))**.78)*(1-.14*t)
        p=start+delta*t+across*(w*s)
        p+=normal*(arch*math.sin(math.pi*t)+cross*(1-s*s)*math.sin(math.pi*t)+lift)
        return p
    nt=56; ns=24; vs=[]; fs=[]
    for j in range(nt+1):
        t=.001+.998*j/nt
        for i in range(ns+1): vs.append(point(t,-1+2*i/ns))
    for j in range(nt):
        for i in range(ns):
            k=j*(ns+1)+i; fs.append((k,k+ns+1,k+ns+2,k+1))
    ob=mesh(name,vs,fs,mat)
    sol=ob.modifiers.new('Leaf fleshy thickness','SOLIDIFY'); sol.thickness=thickness; sol.offset=-.65
    sub(ob,2)
    if veins:
        curve(name+' • midrib',[point(t,0,.012) for t in (.04,.16,.3,.46,.62,.78,.91)],.010 if width>.4 else .006,vein_mat)
        for j,t in enumerate((.22,.37,.52,.66)):
            for s in (-1,1):
                curve(name+' • vein %d %d'%(j,s),[point(t,0,.01),point(t+.07,s*.35,.01),point(t+.14,s*.71,.008),point(min(.95,t+.20),s*.90,.005)],.0055 if width>.4 else .0035,vein_mat)
    return ob,point

# Rear leaves create a coherent cap from every angle; two front leaves define its silhouette.
leaf('Cap • rear left leaf',(.02,.0,3.91),(-1.30,.53,3.12),.73,leaf_dark,.18,.15)
leaf('Cap • rear right leaf',(.02,.02,3.93),(1.27,.55,3.09),.75,leaf_green,.20,.13)
leaf('Cap • rear central leaf',(0,.04,3.96),(.02,1.02,3.20),.83,leaf_green,.16,.15)
leaf('Cap • left sweeping heart leaf',(.015,-.13,3.975),(-1.52,-.40,3.24),.78,leaf_light,.17,.16)
leaf('Cap • right sweeping heart leaf',(.035,-.14,3.99),(1.49,-.38,3.02),.77,leaf_green,.18,.16)
curve('Crown • curved living stem',[(0,0,3.93),(.015,.01,4.10),(-.045,.025,4.25)],.038,leaf_dark)
leaf('Crown sprout • upright left leaf',(-.01,.01,4.08),(-.43,.035,4.66),.22,leaf_light,.06,.045,normal=(0,-1,.18),thickness=.033)
leaf('Crown sprout • right leaf',(.0,.025,4.10),(.62,.02,4.47),.24,leaf_green,.065,.045,normal=(0,-1,.22),thickness=.033)

# Cream shirt, petal collar and cuff construction.
current=SHIRT
uv('Shirt • soft rounded torso',(0,.005,1.56),(.66,.37,.50),cream)
for side in (-1,1):
    if side<0:
        points=[(-.51,0,1.84),(-.73,-.01,1.78),(-.93,-.025,1.69)]
    else:
        points=[(.52,0,1.83),(.77,-.015,1.68),(.99,-.035,1.47)]
    sweep('Shirt • puff sleeve '+str(side),points,[.22,.235,.20],[.25,.245,.195],cream)
    p=Vector(points[-1]); tangent=(p-Vector(points[-2])).normalized(); across=tangent.cross(Vector((0,1,0))).normalized()
    cuff=[]
    for i in range(20):
        a=math.tau*i/20; cuff.append(p+across*(.195*math.cos(a))+Vector((0,1,0))*(.19*math.sin(a)))
    curve('Shirt • rolled cuff '+str(side),cuff,.025,cream,True)
    curve('Shirt • cuff seam '+str(side),[Vector(q)-tangent*.05 for q in cuff],.005,cream_seam,True)
    leaf('Collar • ivory petal '+str(side),(side*.006,-.253,1.99),(side*.245,-.272,1.91),.078,cream,0,.018,False,normal=(0,-1,0),thickness=.07)

current=FACE
right=fuse('Right hand • rounded mitten and thumb',[
    uv('palm', (1.045,-.035,1.35),(.17,.18,.235),skin),
    uv('thumb',( .936,-.169,1.39),(.095,.09,.135),skin)],skin,.013)
left=fuse('Left hand • relaxed raised mitten',[
    uv('palm',(-1.082,-.04,1.71),(.205,.17,.18),skin),
    uv('thumb',(-1.08,-.16,1.80),(.105,.09,.12),skin)],skin,.013)

# Continuous shorts with a small crotch break, plus bib, straps and a dimensional pocket.
current=SUIT
body=rounded('Overalls • rounded body',(0,.015,1.12),(.70,.445,.46),.78,green)
legs=[]
for s in (-1,1):
    legs.append(rounded('Shorts leg '+str(s),(s*.385,.01,.83),(.365,.41,.245),.40,green))
vs=[]; fs=[]; around=128; levels=32
for j in range(levels+1):
    t=j/levels
    for i in range(around):
        a=math.tau*i/around
        top=1.815-.455*math.sin(a)**8
        vs.append(((.69-.11*t)*signed(math.sin(a),.78),.012-(.448-.070*t)*signed(math.cos(a),.78),.98+(top-.98)*t))
for j in range(levels):
    for i in range(around):
        k=j*around+i; q=j*around+(i+1)%around; fs.append((k,q,q+around,k+around))
fs.append(tuple(reversed(range(around))))
cap=len(vs); vs.append((0,.012,1.42))
for i in range(around): fs.append((levels*around+i,levels*around+(i+1)%around,cap))
bib=mesh('Overalls • continuous tailored torso',vs,fs,green)
garment=fuse('Overalls • continuous bib and sculpted shorts',[body,bib]+legs,green,.015)
bpy.context.view_layer.update()
garment_tree=BVHTree.FromObject(garment,bpy.context.evaluated_depsgraph_get())
def garment_point(origin,direction):
    p,n,index,distance=garment_tree.ray_cast(Vector(origin),Vector(direction))
    if p is None: raise RuntimeError('Garment seam projection missed the surface')
    return garment.matrix_world @ (p+n*.004)
curve('Overalls • softly rolled bib neckline',[(-.42,-.277,1.780),(-.25,-.350,1.812),(0,-.370,1.816),(.25,-.350,1.812),(.42,-.277,1.780)],.010,green_edge)
for s in (-1,1):
    # Ribbon mesh over shoulders, with thickness and parallel stitch lines.
    path=[(s*.435,-.455,1.66),(s*.435,-.427,1.87),(s*.435,-.31,2.003),(s*.435,-.11,2.04),(s*.435,.13,1.997),(s*.435,.335,1.82),(s*.435,.401,1.56)]
    vs=[]
    for x,y,z in path: vs.extend(((x-.105,y,z),(x+.105,y,z)))
    strap=mesh('Overalls • shoulder strap '+str(s),vs,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(path)-1)],green_edge)
    sol=strap.modifiers.new('Woven strap thickness','SOLIDIFY'); sol.thickness=.035
    sub(strap,3)
    bpy.context.view_layer.update()
    strap_tree=BVHTree.FromObject(strap,bpy.context.evaluated_depsgraph_get())
    for offset in (-.077,.077):
        stitch=[]
        for segment in range(len(path)-1):
            for step in range(8):
                probe=Vector(path[segment]).lerp(Vector(path[segment+1]),step/8)
                probe.x+=offset
                p,n,index,distance=strap_tree.find_nearest(probe)
                stitch.append(p+n*.003)
        curve('Strap • fine edge stitch '+str(s)+str(offset),stitch,.0035,thread)
    # Raised green button seat, inset ochre button, two tiny holes, connecting thread.
    uv('Button • green sewn seat '+str(s),(s*.44,-.491,1.663),(.112,.032,.116),green_edge)
    uv('Button • golden domed disc '+str(s),(s*.44,-.52,1.665),(.073,.032,.078),button_mat)
    for dx in (-.021,.021):
        uv('Button • recessed hole '+str(s)+str(dx),(s*.44+dx,-.550,1.665),(.010,.006,.012),button_dark,24,16)
    curve('Button • securing thread '+str(s),[(s*.44-.02,-.556,1.665),(s*.44,-.562,1.67),(s*.44+.02,-.556,1.665)],.0045,thread)
    # Leg openings and tailor's side seams.
    pts=[(s*.385+.328*signed(math.sin(a),.40),.01-.369*signed(math.cos(a),.40),.625) for a in [math.tau*i/64 for i in range(64)]]
    curve('Shorts • folded leg hem '+str(s),pts,.009,green_edge,True)
    curve('Shorts • side seam '+str(s),[garment_point((s*3,.055,.75+.48*i/12),(-s,0,0)) for i in range(13)],.004,thread)

outline=[(-.345,-.515,1.368),(.345,-.515,1.368),(.343,-.534,1.20),(.292,-.553,1.085),(.18,-.561,1.018),(0,-.564,.995),(-.18,-.561,1.018),(-.292,-.553,1.085),(-.343,-.534,1.20)]
panel('Pocket • deep rounded patch pocket',outline,pocket_green,.16,.035)
curve('Pocket • rolled upper welt',[(-.327,-.543,1.365),(0,-.555,1.352),(.327,-.543,1.365)],.015,green_edge)
curve('Pocket • fine U shaped stitching',[(-.319,-.561,1.312),(-.308,-.571,1.18),(-.247,-.583,1.081),(0,-.594,1.03),(.247,-.583,1.081),(.308,-.571,1.18),(.319,-.561,1.312)],.0045,thread)
curve('Pocket sprout • stem',[(0,-.571,1.34),(-.009,-.575,1.44),(-.028,-.574,1.5)],.018,leaf_dark)
leaf('Pocket sprout • left leaf',(-.015,-.587,1.37),(-.172,-.598,1.574),.088,leaf_light,.018,.028,False,normal=(0,-1,0),thickness=.035)
leaf('Pocket sprout • right leaf',(0,-.589,1.374),(.207,-.586,1.556),.10,leaf_green,.018,.028,False,normal=(0,-1,0),thickness=.035)
leaf('Pocket sprout • tiny leaf',(-.03,-.580,1.38),(-.246,-.572,1.459),.063,leaf_green,.01,.02,False,normal=(0,-1,0),thickness=.025)
curve('Overalls • back center seam',[garment_point((0,3,.92+.64*i/20),(0,-1,0)) for i in range(21)],.004,thread)

# Round boots with raised cuffs, sole layers, heel tabs and underside tread.
current=BOOTS
for s in (-1,1):
    x=s*.43
    foot=rounded('Boot foot',(x,-.12,.245),(.355,.445,.205),.76,boot_mat)
    shaft=rounded('Boot shaft',(x,.025,.451),(.275,.282,.255),.66,boot_mat)
    fuse('Boot • continuous rounded upper '+str(s),[foot,shaft],boot_mat,.018)
    rounded('Boot • thick cushioned sole '+str(s),(x,-.123,.102),(.358,.444,.061),.59,sole_mat)
    pts=[(x+.345*signed(math.sin(a),.82),-.12-.43*signed(math.cos(a),.82),.145) for a in [math.tau*i/48 for i in range(48)]]
    curve('Boot • molded sole piping '+str(s),pts,.012,boot_mat,True)
    pts=[(x+.263*signed(math.sin(a),.75),.025-.270*signed(math.cos(a),.75),.606) for a in [math.tau*i/48 for i in range(48)]]
    curve('Boot • rounded cuff lip '+str(s),pts,.024,boot_mat,True)
    curve('Boot • heel pull tab '+str(s),[(x,.272,.51),(x,.303,.642),(x,.234,.669),(x,.231,.572)],.035,boot_mat)
    for i in range(5):
        rounded('Boot • underside tread %s %s'%(s,i),(x,-.40+i*.14,.051),(.25,.033,.016),.6,sole_mat,32,20)

# A named root makes the entire character easy to move or append into another scene.
root=bpy.data.objects.new('LEAF GARDENER • character root',None); FACE.objects.link(root)
root.empty_display_type='CIRCLE'; root.empty_display_size=.4
for c in (FACE,HAIR,HAT,SHIRT,SUIT,BOOTS):
    for ob in c.objects:
        if ob != root: ob.parent=root
root['reference']='../Screenshot 2026-09-09 215218.png'
root['design']='Reference matched leaf gardener; watering can intentionally omitted.'
root['geometry']='Editable leaf surfaces and veins, unified bob, softly recessed eyes, garment details and boot construction.'

current=STUDIO
floor_mat=material('Studio • soft warm gray',(.48,.49,.475),.88)
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,.035))
assign(bpy.context.object,'Studio • seamless ground',floor_mat)

def aim(ob,target): ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA'); ob=bpy.data.objects.new(name,d); STUDIO.objects.link(ob)
    ob.location=loc; d.energy=power; d.shape='DISK'; d.size=size; d.color=color; aim(ob,(0,0,2.3))
area('Key • large softbox',(-3.5,-4.5,7),650,4.5,(1,.94,.84))
area('Fill • broad gentle bounce',(4,-3,4.5),235,4.0,(.84,.92,1))
area('Rim • upper rear',(1.0,3.4,6.5),360,3.5,(1,1,.87))

def camera(name,loc,target,scale):
    d=bpy.data.cameras.new(name); ob=bpy.data.objects.new(name,d); STUDIO.objects.link(ob)
    ob.location=loc; aim(ob,target); d.type='ORTHO'; d.ortho_scale=scale; d.lens=55
    return ob
hero=camera('Camera • reference portrait',(4.1,-22,8.4),(0,0,2.36),5.42)
front=camera('Camera • straight front',(0,-22,5.8),(0,0,2.36),5.4)
back=camera('Camera • rear three quarter',(-8,17,7.6),(0,0,2.36),5.6)
side=camera('Camera • side profile',(16,-.1,5.0),(0,0,2.36),5.45)
face_camera=camera('Camera • face study',(7,-14,5.4),(0,-.05,2.85),2.85)
scene.camera=hero
scene.world=bpy.data.worlds.new('Studio world')
scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.68,.73,.79,1)
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.32
scene.render.engine='CYCLES'; scene.cycles.samples=32 if PREVIEW else 192
scene.cycles.use_denoising=True
scene.cycles.adaptive_threshold=.035 if PREVIEW else .012
try:
    prefs=bpy.context.preferences.addons['cycles'].preferences
    prefs.compute_device_type='OPTIX'; prefs.get_devices()
    gpu=False
    for d in prefs.devices:
        d.use=d.type != 'CPU'; gpu=gpu or d.use
        print('RENDER_DEVICE',d.name,d.type,d.use,flush=True)
    if gpu: scene.cycles.device='GPU'
except Exception as e: print('CPU rendering:',e,flush=True)
scene.render.resolution_x=840 if PREVIEW else 1800
scene.render.resolution_y=1000 if PREVIEW else 2160
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=.15
scene.render.filepath=str(ROOT/('leaf_gardener_preview.png' if PREVIEW else 'leaf_gardener.png'))
scene['Design notes']='Full geometry character inspired by the supplied single view. Back details are inferred. No watering tool. Unrigged presentation sculpt.'
reference=ROOT.parent/'Screenshot 2026-09-09 215218.png'
if reference.exists():
    ref=bpy.data.images.load(str(reference)); ref.name='REFERENCE • original leaf gardener'; ref.use_fake_user=True; ref.pack()
for screen in bpy.data.screens:
    for a in screen.areas:
        if a.type=='VIEW_3D':
            a.spaces.active.region_3d.view_perspective='CAMERA'
            a.spaces.active.clip_end=300
            a.spaces.active.shading.type='MATERIAL'
            a.spaces.active.shading.use_scene_lights=True
            a.spaces.active.shading.use_scene_world=True
            a.spaces.active.overlay.show_overlays=False
bpy.ops.object.select_all(action='DESELECT')
root.select_set(True); bpy.context.view_layer.objects.active=root
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'leaf_gardener.blend'))
stats={'objects':sum(len(c.objects) for c in (FACE,HAIR,HAT,SHIRT,SUIT,BOOTS)),
       'base_mesh_vertices':sum(len(o.data.vertices) for o in bpy.data.objects if o.type=='MESH' and o.name!='Studio • seamless ground'),
       'materials':len(bpy.data.materials),'render':str(scene.render.filepath)}
(ROOT/'build_info.json').write_text(json.dumps(stats,indent=2))
print('BUILD_COMPLETE',json.dumps(stats),flush=True)
bpy.ops.render.render(write_still=True)
print('RENDER_COMPLETE',flush=True)
