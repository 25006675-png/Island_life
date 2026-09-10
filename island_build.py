# -*- coding: utf-8 -*-
"""
Procedural recreation of the "floating island" reference image.
Run:  blender.exe -b -P island_build.py -- [--stage N] [--samples N] [--res N] [--out path]
"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, noise as mnoise

# ----------------------------------------------------------------------------
# args
# ----------------------------------------------------------------------------
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def argval(flag, default, cast=str):
    if flag in argv:
        return cast(argv[argv.index(flag) + 1])
    return default

STAGE   = argval("--stage", 99, int)
SAMPLES = argval("--samples", 64, int)
RESX    = argval("--res", 960, int)
OUT     = argval("--out", os.path.join(os.path.dirname(bpy.data.filepath) or ".", "render.png"))
ENGINE  = argval("--engine", "EEVEE", str)
SAVEBLEND = argval("--save", "", str)
LOOK      = argval("--look", "Standard", str)
EXPOSURE  = argval("--exposure", -0.60, float)
BGSTR     = argval("--bgstr", 1.22, float)
AMB       = argval("--amb", 1.05, float)
SUNE      = argval("--sun", 9.0, float)

random.seed(7)
SEED = 7

# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def wipe():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def new_mesh_obj(name, verts, faces, col=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    return ob

def shade_smooth(ob, angle=math.radians(35)):
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.use_auto_smooth = True if hasattr(ob.data, "use_auto_smooth") else False
    m = ob.modifiers.new("smoothbyangle", 'SMOOTH_BY_ANGLE') if 'SMOOTH_BY_ANGLE' in \
        {i.identifier for i in bpy.types.Modifier.bl_rna.properties['type'].enum_items} else None
    if m: m.angle = angle

def fbm(v, octaves=4, lac=2.0, gain=0.5):
    """simple fractal value noise on a Vector"""
    total, amp, freq = 0.0, 1.0, 1.0
    for _ in range(octaves):
        total += mnoise.noise(Vector(v) * freq) * amp
        amp *= gain
        freq *= lac
    return total

def hash01(*args):
    h = 0
    for a in args:
        h = (h * 1000003) ^ hash((round(a, 5),))
        h &= 0xFFFFFFFF
    return ((h ^ (h >> 15)) % 100003) / 100003.0

def mat(name, base=(0.5,0.5,0.5,1), rough=0.8, spec=0.4, metal=0.0,
        emit=None, emit_str=0.0, transmission=0.0, alpha=1.0, subsurf=0.0, sss_col=None):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    def setv(k, v):
        if k in b.inputs: b.inputs[k].default_value = v
    setv("Base Color", base)
    setv("Roughness", rough)
    setv("Metallic", metal)
    setv("Alpha", alpha)
    if "Specular IOR Level" in b.inputs: b.inputs["Specular IOR Level"].default_value = spec
    elif "Specular" in b.inputs: b.inputs["Specular"].default_value = spec
    if transmission:
        setv("Transmission Weight", transmission)
    if subsurf:
        setv("Subsurface Weight", subsurf)
        if sss_col: setv("Subsurface Radius", Vector(sss_col))
    if emit:
        setv("Emission Color", emit)
        setv("Emission Strength", emit_str)
    if alpha < 1.0:
        m.blend_method = 'BLEND' if hasattr(m, "blend_method") else m.blend_method
    return m

def assign(ob, *materials):
    """materials.clear() wipes polygon.material_index -- save & restore it"""
    idx = [p.material_index for p in ob.data.polygons] if ob.type == 'MESH' else []
    ob.data.materials.clear()
    for m in materials:
        ob.data.materials.append(m)
    for p, i in zip(ob.data.polygons, idx):
        p.material_index = min(i, len(materials) - 1)

def link(ob, colname):
    col = bpy.data.collections.get(colname)
    if not col:
        col = bpy.data.collections.new(colname)
        bpy.context.scene.collection.children.link(col)
    for c in ob.users_collection:
        c.objects.unlink(ob)
    col.objects.link(ob)
    return ob

# ============================================================================
#  ISLAND LANDMASS
#  polar grid top surface  ->  clean silhouette + trivial boundary loop
#  cliff  ->  ring extrusion with per-facet quantised offsets (blocky rock)
# ============================================================================
R0        = 11.0          # island half-size
SQUIRCLE  = 4.6           # 2=circle, big=square.  rounded-square plateau
NANG      = 168           # verts around the rim
NRAD      = 46            # rings from centre to rim
GRASS_Z   = 0.35
POND_C    = (-2.6, -1.1)
POND_A, POND_B = 8.7, 6.6
POND_ROT  = math.radians(-26)
POND_FLOOR= -0.62
WATER_Z   = 0.10
POND_ON   = True         # island 2 has no pond
KEEL      = 0.86         # how hard the underside tapers to a keel
RIM_WOBBLE= 0.055        # organic wander of the plateau outline
CLIFF_DEEP= 1.00         # multiplier on total cliff depth

RIM_ROT = math.pi / 4.0          # corner toward the viewer

def rim_radius(t):
    """rounded-square outline with organic wobble"""
    tt = t + RIM_ROT
    c, s = abs(math.cos(tt)), abs(math.sin(tt))
    sq = R0 / ((c ** SQUIRCLE + s ** SQUIRCLE) ** (1.0 / SQUIRCLE))
    w  = fbm((math.cos(t) * 1.7, math.sin(t) * 1.7, 3.3), 3)
    return sq * (1.0 + RIM_WOBBLE * w)

def pond_sd(x, y):
    """signed distance-ish field of the pond, <0 inside"""
    if not POND_ON:
        return 9.0
    dx, dy = x - POND_C[0], y - POND_C[1]
    ca, sa = math.cos(POND_ROT), math.sin(POND_ROT)
    u, v = (dx * ca + dy * sa) / POND_A, (-dx * sa + dy * ca) / POND_B
    d = math.hypot(u, v) - 1.0
    d += 0.085 * fbm((u * 2.2, v * 2.2, 11.0), 3)
    # bite out of the right side so the shore wraps around the tree plaza
    return d

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)

def top_height(x, y):
    roll = 0.14 * fbm((x * 0.12, y * 0.12, 0.0), 3)
    z = GRASS_Z + roll
    d = pond_sd(x, y)
    if d < 0.16:
        k = smoothstep(0.16, -0.30, d)             # 0 at shore -> 1 in water
        floor_z = POND_FLOOR + 0.10 * fbm((x * 0.5, y * 0.5, 5.0), 2)
        z = z * (1 - k) + floor_z * k
    return z

def build_island():
    verts, faces, mat_idx = [], [], []
    ang = [2 * math.pi * j / NANG for j in range(NANG)]
    rad = [rim_radius(t) for t in ang]

    # ---- top surface (polar grid, ring 0 = centre point) -------------------
    verts.append((POND_C[0], POND_C[1], top_height(*POND_C)))
    ring_start = [0]
    for i in range(1, NRAD + 1):
        # bias sampling outward so the rim (visible detail) is denser
        f = (i / NRAD) ** 0.85
        ring_start.append(len(verts))
        for j in range(NANG):
            x = POND_C[0] * (1 - f) + math.cos(ang[j]) * rad[j] * f
            y = POND_C[1] * (1 - f) + math.sin(ang[j]) * rad[j] * f
            verts.append((x, y, top_height(x, y)))
    # fan around centre
    for j in range(NANG):
        faces.append((0, ring_start[1] + j, ring_start[1] + (j + 1) % NANG))
        mat_idx.append(0)
    for i in range(1, NRAD):
        a, b = ring_start[i], ring_start[i + 1]
        for j in range(NANG):
            k = (j + 1) % NANG
            faces.append((a + j, b + j, b + k, a + k))
            mat_idx.append(0)

    # ---- cliff: ring extrusion downward ------------------------------------
    #  blocky rock = per-(facet,ring) CONSTANT radial offset -> flat quads.
    #  three superimposed block sizes give big slabs / medium ledges / chips.
    NR = 22
    prev = [ring_start[NRAD] + j for j in range(NANG)]
    rim_xy = [tuple(verts[i]) for i in prev]
    depths, z = [], 0.0
    for k in range(NR):
        step = (0.15 + 0.30 * (k / NR) ** 1.15 + 0.10 * hash01(k, 91)) * CLIFF_DEEP
        z -= step
        depths.append(z)
    total = -depths[-1]

    def facet(j, k, size, salt):
        """constant value across a size x 1 block of the cliff grid"""
        return hash01((j + int(7 * hash01(k, salt, 2))) // size, k // 2, salt)

    for k in range(NR):
        d = -depths[k] / total                       # 0 at rim -> 1 at base
        # progressive taper, and each compass direction narrows at its own
        # rate, so the mass reads as an irregular keel rather than a cylinder
        pass
        ring = []
        for j in range(NANG):
            t = ang[j]
            rate = 0.70 + 0.50 * fbm((math.cos(t) * 0.8, math.sin(t) * 0.8, 5.0), 2)
            taper = 1.0 - KEEL * rate * (d ** 1.55)
            taper = max(taper, 0.12)
            # big slabs, medium ledges, small chips
            off  = (facet(j, k, 16, 1) - 0.5) * 2.55
            off += (facet(j, k,  7, 2) - 0.5) * 1.45
            off += (facet(j, k,  3, 3) - 0.5) * 0.70
            # low-frequency bulges so the plan silhouette is not a squircle
            off += 0.9 * fbm((math.cos(t) * 1.1, math.sin(t) * 1.1, d * 1.6 + 40), 3)
            # the grass lip overhangs the first two rings
            lip = 0.16 * smoothstep(0.07, 0.0, d)
            amt = 0.30 + 0.70 * smoothstep(0.0, 0.30, d)
            r = rad[j] * taper + off * amt + lip
            r = max(r, rad[j] * 0.18)
            zj = rim_xy[j][2] + depths[k] + 0.95 * (facet(j, k, 7, 4) - 0.5)
            ring.append(len(verts))
            verts.append((math.cos(t) * r, math.sin(t) * r, zj))
        for j in range(NANG):
            kk = (j + 1) % NANG
            faces.append((prev[j], ring[j], ring[kk], prev[kk]))
            mat_idx.append(1)
        prev = ring

    # ---- bottom cap: lumpy underside ---------------------------------------
    zbot = depths[-1] - 0.45
    capc = len(verts)
    verts.append((0, 0, zbot - 0.9))
    for i in range(3, 0, -1):
        pass
    inner_rings = []
    for step_i, f in enumerate((0.70, 0.40)):
        rg = []
        for j in range(NANG):
            vx, vy, vz = verts[prev[j]]
            x, y = vx * f, vy * f
            zz = zbot - 0.30 * step_i + 0.62 * fbm((x * 0.30, y * 0.30, 22.0), 4)
            rg.append(len(verts))
            verts.append((x, y, zz))
        for j in range(NANG):
            kk = (j + 1) % NANG
            faces.append((prev[j], rg[j], rg[kk], prev[kk]))
            mat_idx.append(1)
        prev = rg
    for j in range(NANG):
        kk = (j + 1) % NANG
        faces.append((prev[j], capc, prev[kk]))
        mat_idx.append(1)

    ob = new_mesh_obj("Island", verts, faces)
    for p, mi in zip(ob.data.polygons, mat_idx):
        p.material_index = mi
        p.use_smooth = (mi == 0)
    ob.data.update()
    return ob, [(math.cos(t) * r, math.sin(t) * r) for t, r in zip(ang, rad)], rim_xy

# ============================================================================
#  SHADERS  (procedural, engine-agnostic: noise + coordinates only)
# ============================================================================
def nt(m):
    m.use_nodes = True
    return m.node_tree, m.node_tree.nodes, m.node_tree.links

def n_new(nodes, typ, loc=(0, 0), **kw):
    n = nodes.new(typ)
    n.location = loc
    for k, v in kw.items():
        if hasattr(n, k):
            setattr(n, k, v)
        elif k in n.inputs:
            n.inputs[k].default_value = v
    return n

def noise_node(nodes, links, coord, scale=5.0, detail=6.0, rough=0.5, loc=(0, 0)):
    n = n_new(nodes, "ShaderNodeTexNoise", loc)
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = detail
    n.inputs["Roughness"].default_value = rough
    links.new(coord, n.inputs["Vector"])
    return n

def ramp(nodes, links, fac, stops, loc=(0, 0)):
    n = n_new(nodes, "ShaderNodeValToRGB", loc)
    cr = n.color_ramp
    while len(cr.elements) > 1:
        cr.elements.remove(cr.elements[-1])
    cr.elements[0].position, cr.elements[0].color = stops[0]
    for pos, col in stops[1:]:
        e = cr.elements.new(pos)
        e.color = col
    links.new(fac, n.inputs["Fac"])
    return n

def mat_grass():
    m = bpy.data.materials.new("Grass"); t, N, L = nt(m)
    b = N["Principled BSDF"]; out = N["Material Output"]
    co = n_new(N, "ShaderNodeTexCoord", (-1400, 0))
    nz = noise_node(N, L, co.outputs["Object"], 2.2, 8.0, 0.55, (-1150, 120))
    nz2 = noise_node(N, L, co.outputs["Object"], 22.0, 4.0, 0.6, (-1150, -200))
    mixf = n_new(N, "ShaderNodeMix", (-900, 60), data_type='FLOAT')
    mixf.inputs[0].default_value = 0.35
    L.new(nz.outputs["Fac"], mixf.inputs[2]); L.new(nz2.outputs["Fac"], mixf.inputs[3])
    rp = ramp(N, L, mixf.outputs[0], [
        (0.28, (0.300, 0.450, 0.115, 1)),   # shaded grass
        (0.46, (0.430, 0.580, 0.165, 1)),
        (0.64, (0.570, 0.690, 0.230, 1)),   # sunlit green
        (0.85, (0.700, 0.780, 0.330, 1)),
    ], (-620, 60))
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    if "Specular IOR Level" in b.inputs: b.inputs["Specular IOR Level"].default_value = 0.25
    b.inputs["Subsurface Weight"].default_value = 0.18
    b.inputs["Subsurface Radius"].default_value = (0.5, 0.9, 0.25)
    # micro bump
    bump = n_new(N, "ShaderNodeBump", (-320, -260)); bump.inputs["Strength"].default_value = 0.25
    L.new(nz2.outputs["Fac"], bump.inputs["Height"]); L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def mat_rock():
    m = bpy.data.materials.new("Rock"); t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1600, 0))
    sep = n_new(N, "ShaderNodeSeparateXYZ", (-1400, -320))
    L.new(co.outputs["Object"], sep.inputs[0])
    big = noise_node(N, L, co.outputs["Object"], 1.1, 6.0, 0.6, (-1350, 260))
    med = noise_node(N, L, co.outputs["Object"], 6.5, 8.0, 0.62, (-1350, 20))
    fine = n_new(N, "ShaderNodeTexVoronoi", (-1350, -140))
    fine.inputs["Scale"].default_value = 14.0
    L.new(co.outputs["Object"], fine.inputs["Vector"])
    mx = n_new(N, "ShaderNodeMix", (-1050, 140), data_type='FLOAT'); mx.inputs[0].default_value = 0.45
    L.new(big.outputs["Fac"], mx.inputs[2]); L.new(med.outputs["Fac"], mx.inputs[3])
    rp = ramp(N, L, mx.outputs[0], [
        (0.28, (0.185, 0.172, 0.180, 1)),    # shadowed stone
        (0.45, (0.330, 0.310, 0.315, 1)),
        (0.60, (0.510, 0.485, 0.478, 1)),
        (0.78, (0.690, 0.660, 0.630, 1)),    # pale warm highlight
        (0.92, (0.820, 0.790, 0.745, 1)),
    ], (-760, 160))
    # moss creeping down from the rim: driven by WORLD Z, not bbox-normalised
    geo = n_new(N, "ShaderNodeNewGeometry", (-1600, -560))
    zpos = n_new(N, "ShaderNodeSeparateXYZ", (-1380, -560))
    L.new(geo.outputs["Position"], zpos.inputs[0])
    mossf = n_new(N, "ShaderNodeMath", (-1140, -520), operation='MULTIPLY_ADD')
    L.new(zpos.outputs["Z"], mossf.inputs[0])
    mossf.inputs[1].default_value = 0.34     # fade out ~3 m below the rim
    mossf.inputs[2].default_value = 0.86
    mossn = n_new(N, "ShaderNodeMath", (-900, -540), operation='ADD')
    L.new(mossf.outputs[0], mossn.inputs[0])
    muln = n_new(N, "ShaderNodeMath", (-1140, -720), operation='MULTIPLY_ADD')
    L.new(med.outputs["Fac"], muln.inputs[0])
    muln.inputs[1].default_value = 0.75; muln.inputs[2].default_value = -0.34
    L.new(muln.outputs[0], mossn.inputs[1])
    mossc = ramp(N, L, mossn.outputs[0], [
        (0.48, (0, 0, 0, 1)), (0.80, (1, 1, 1, 1))], (-700, -560))
    mossmix = n_new(N, "ShaderNodeMix", (-420, 60), data_type='RGBA')
    L.new(mossc.outputs["Color"], mossmix.inputs[0])
    L.new(rp.outputs["Color"], mossmix.inputs[6])
    mossmix.inputs[7].default_value = (0.180, 0.300, 0.075, 1)
    L.new(mossmix.outputs[2], b.inputs["Base Color"])
    rr = ramp(N, L, fine.outputs["Distance"], [(0.0, (0.62,)*3 + (1,)), (1.0, (0.95,)*3 + (1,))], (-760, -300))
    L.new(rr.outputs["Color"], b.inputs["Roughness"])
    if "Specular IOR Level" in b.inputs: b.inputs["Specular IOR Level"].default_value = 0.3
    bump = n_new(N, "ShaderNodeBump", (-240, -300)); bump.inputs["Strength"].default_value = 0.45
    L.new(fine.outputs["Distance"], bump.inputs["Height"]); L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m

def mat_water():
    """stylised pond: strongly mirrored so it carries the sunset streak,
    with a dark teal body underneath and two scales of ripple"""
    m = bpy.data.materials.new("Water")
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    co = n_new(N, "ShaderNodeTexCoord", (-1200, -300))
    n1 = noise_node(N, L, co.outputs["Object"], 1.3, 6.0, 0.5, (-950, -180))
    n2 = noise_node(N, L, co.outputs["Object"], 16.0, 8.0, 0.62, (-950, -430))
    add = n_new(N, "ShaderNodeMath", (-700, -300), operation='MULTIPLY_ADD')
    L.new(n1.outputs["Fac"], add.inputs[0])
    add.inputs[1].default_value = 0.9
    L.new(n2.outputs["Fac"], add.inputs[2])
    bump = n_new(N, "ShaderNodeBump", (-470, -300))
    bump.inputs["Strength"].default_value = 0.14
    bump.inputs["Distance"].default_value = 0.05
    L.new(add.outputs[0], bump.inputs["Height"])

    gl = n_new(N, "ShaderNodeBsdfGlossy", (-220, 140))
    gl.inputs["Roughness"].default_value = 0.062
    gl.inputs["Color"].default_value = (0.97, 0.96, 0.94, 1)
    di = n_new(N, "ShaderNodeBsdfDiffuse", (-220, -60))
    di.inputs["Color"].default_value = (0.150, 0.215, 0.235, 1)
    L.new(bump.outputs["Normal"], gl.inputs["Normal"])
    L.new(bump.outputs["Normal"], di.inputs["Normal"])
    mx = n_new(N, "ShaderNodeMixShader", (60, 20))
    mx.inputs[0].default_value = 0.52          # mirrored, but the body reads
    L.new(di.outputs[0], mx.inputs[1])
    L.new(gl.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_wood(name="Wood", base=(0.400, 0.268, 0.150, 1), light=(0.640, 0.470, 0.290, 1)):
    m = bpy.data.materials.new(name); t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1100, 0))
    mp = n_new(N, "ShaderNodeMapping", (-900, 0))
    mp.inputs["Scale"].default_value = (1.0, 12.0, 1.0)   # stretched grain
    L.new(co.outputs["Object"], mp.inputs["Vector"])
    nz = noise_node(N, L, mp.outputs["Vector"], 8.0, 8.0, 0.55, (-700, 0))
    rp = ramp(N, L, nz.outputs["Fac"], [(0.35, base), (0.70, light)], (-450, 0))
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.72
    return m

# ============================================================================
#  WATER SURFACE  (boundary solved from the pond field so it tucks into the bank)
# ============================================================================
def build_water():
    ca, sa = math.cos(POND_ROT), math.sin(POND_ROT)
    def pt(t, s):
        u, v = math.cos(t) * POND_A * s, math.sin(t) * POND_B * s
        return (POND_C[0] + u * ca - v * sa, POND_C[1] + u * sa + v * ca)
    NA, NRR = 128, 14
    edge = []
    for j in range(NA):
        t = 2 * math.pi * j / NA
        lo, hi = 0.3, 1.7
        for _ in range(24):                      # bisect the shoreline
            mid = (lo + hi) / 2
            if pond_sd(*pt(t, mid)) < 0: lo = mid
            else: hi = mid
        edge.append((t, lo * 1.035))             # nudge under the bank
    verts, faces = [(POND_C[0], POND_C[1], WATER_Z)], []
    rings = []
    for i in range(1, NRR + 1):
        f = i / NRR
        rings.append(len(verts))
        for t, s in edge:
            x, y = pt(t, s * f)
            verts.append((x, y, WATER_Z))
    for j in range(NA):
        faces.append((0, rings[0] + j, rings[0] + (j + 1) % NA))
    for i in range(NRR - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(NA):
            k = (j + 1) % NA
            faces.append((a + j, b + j, b + k, a + k))
    ob = new_mesh_obj("Water", verts, faces)
    for p in ob.data.polygons: p.use_smooth = True
    return ob, edge, pt

# ============================================================================
#  CAMERA / LIGHT / WORLD / RENDER
# ============================================================================
def setup_camera(scene):
    cam_d = 72.0
    elev = math.radians(13.0)
    az = math.radians(-88.0)                     # near-corner faces the viewer
    tgt = Vector((0.4, 0.2, 0.2))
    pos = tgt + Vector((math.cos(az) * math.cos(elev),
                        math.sin(az) * math.cos(elev),
                        math.sin(elev))) * cam_d
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = 85.0
    cam_data.clip_end = 500
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = pos
    d = (tgt - pos).normalized()
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam

def setup_lights():
    # low warm key from behind-right : rim-lights the canopy, streaks the water
    sd = bpy.data.lights.new("Sun", 'SUN')
    sd.energy = SUNE
    sd.color = (1.0, 0.760, 0.500)
    sd.angle = math.radians(2.6)
    sun = bpy.data.objects.new("Sun", sd)
    bpy.context.scene.collection.objects.link(sun)
    d = Vector((0.09, -0.95, -0.30)).normalized()       # travelling toward camera
    sun.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sun.location = (-6, 34, 16)

    # cool soft fill from camera-left so shadow side doesn't go muddy
    fd = bpy.data.lights.new("Fill", 'AREA')
    fd.energy = 130; fd.size = 36; fd.color = (0.78, 0.86, 1.0)
    fill = bpy.data.objects.new("Fill", fd)
    bpy.context.scene.collection.objects.link(fill)
    fill.location = (-34, -20, 16)
    fill.rotation_euler = (Vector((0.6, 0.42, -0.28)).normalized()
                           .to_track_quat('-Z', 'Y').to_euler())

    # warm bounce under the island so the rock underside isn't black
    bd = bpy.data.lights.new("Under", 'AREA')
    bd.energy = 1500; bd.size = 46; bd.color = (1.0, 0.80, 0.58)
    und = bpy.data.objects.new("Under", bd)
    bpy.context.scene.collection.objects.link(und)
    und.location = (0, -6, -26); und.rotation_euler = (0, 0, 0)
    return sun

def setup_world(scene):
    w = bpy.data.worlds.new("W"); scene.world = w
    w.use_nodes = True
    N, L = w.node_tree.nodes, w.node_tree.links
    bg = N["Background"]
    bg.inputs["Color"].default_value = (0.905, 0.893, 0.872, 1)   # warm paper white
    bg.inputs["Strength"].default_value = 1.15
    return w

def setup_render(scene, engine, samples, resx):
    scene.render.resolution_x = resx
    scene.render.resolution_y = int(resx * 945 / 1671)
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    if engine.upper().startswith("CY"):
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        scene.cycles.max_bounces = 12
        scene.cycles.transmission_bounces = 12
        scene.cycles.caustics_reflective = True
        scene.cycles.sample_clamp_indirect = 10.0
        scene.cycles.sample_clamp_direct = 2.6
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
                try:
                    prefs.compute_device_type = t
                    prefs.get_devices()
                    if any(d.type == t for d in prefs.devices):
                        for d in prefs.devices:
                            d.use = (d.type == t or d.type == 'CPU')
                        scene.cycles.device = 'GPU'
                        print("GPU backend:", t)
                        break
                except Exception:
                    continue
        except Exception as e:
            print("no gpu:", e)
    else:
        eng = 'BLENDER_EEVEE_NEXT'
        avail = {i.identifier for i in
                 bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items}
        scene.render.engine = eng if eng in avail else 'BLENDER_EEVEE'
        ee = scene.eevee
        for k, v in (("taa_render_samples", max(32, samples)), ("use_raytracing", True),
                     ("use_shadow_jitter_viewport", True)):
            if hasattr(ee, k):
                try: setattr(ee, k, v)
                except Exception: pass
    vs = scene.view_settings
    if LOOK.lower() in ("standard", "none"):
        vs.view_transform = 'Standard'
        vs.look = 'None'
    else:
        vs.view_transform = 'AgX'
        try: vs.look = LOOK
        except Exception: vs.look = 'AgX - Base Contrast'
    vs.exposure = EXPOSURE
    scene.render.image_settings.file_format = 'PNG'

def setup_compositor(scene, bloom=0.07, thresh=1.4, size=7):
    """Blender 5.x uses scene.compositing_node_group; 4.x used scene.node_tree."""
    if hasattr(scene, "compositing_node_group"):
        # Blender 5.x: scene compositor is a node group fed by an explicit
        # Render Layers node (Group Input is NOT the render result).
        ng = bpy.data.node_groups.new("Comp", 'CompositorNodeTree')
        ng.interface.new_socket("Image", in_out='OUTPUT', socket_type='NodeSocketColor')
        rl = ng.nodes.new("CompositorNodeRLayers"); rl.location = (-400, 0); rl.scene = scene
        go = ng.nodes.new("NodeGroupOutput"); go.location = (400, 0)
        src, dst, tree = rl.outputs["Image"], go.inputs[0], ng
        scene.compositing_node_group = ng
    else:
        scene.use_nodes = True
        tree = scene.node_tree
        for n in list(tree.nodes): tree.nodes.remove(n)
        rl = tree.nodes.new("CompositorNodeRLayers"); rl.location = (-400, 0)
        co = tree.nodes.new("CompositorNodeComposite"); co.location = (400, 0)
        src, dst = rl.outputs["Image"], co.inputs[0]
    g = tree.nodes.new("CompositorNodeGlare"); g.location = (0, 0)
    def setsock(name, val):
        if name in g.inputs:
            try: g.inputs[name].default_value = val
            except Exception as e: print("glare sock", name, e)
    if hasattr(g, "glare_type"):          # <= 4.x
        g.glare_type = 'BLOOM'; g.quality = 'HIGH'
        for k, v in (("mix", bloom * 2 - 1), ("threshold", thresh), ("size", size)):
            if hasattr(g, k):
                try: setattr(g, k, v)
                except Exception: pass
    else:                                  # 5.x socket-driven glare
        setsock("Type", 'Bloom'); setsock("Quality", 'High')
        setsock("Threshold", thresh); setsock("Strength", bloom)
        setsock("Size", size); setsock("Smoothness", 0.6)
        setsock("Saturation", 1.0)
    tree.links.new(src, g.inputs[0])
    tree.links.new(g.outputs[0], dst)
    scene.render.use_compositing = True
    return tree

# ============================================================================
#  GREAT TREE
#  skeleton -> parallel-transport swept tubes with a lobed, twisting
#  cross-section (banyan-style fluted trunk) -> displaced canopy blobs
# ============================================================================
def _frames(pts):
    """rotation-minimising frames along a polyline"""
    tans = []
    for i in range(len(pts)):
        a = pts[min(i + 1, len(pts) - 1)]
        b = pts[max(i - 1, 0)]
        t = (Vector(a) - Vector(b))
        tans.append(t.normalized() if t.length > 1e-6 else Vector((0, 0, 1)))
    ref = Vector((1, 0, 0))
    if abs(tans[0].dot(ref)) > 0.9:
        ref = Vector((0, 1, 0))
    n = (ref - tans[0] * ref.dot(tans[0])).normalized()
    out = []
    for i, t in enumerate(tans):
        if i:
            q = tans[i - 1].rotation_difference(t)
            n = (q @ n).normalized()
            n = (n - t * n.dot(t)).normalized()
        out.append((t, n, t.cross(n).normalized()))
    return out


def sweep(verts, faces, midx, mat_id, pts, radii, sides=12,
          lobes=0, lobe_amp=0.0, twist=0.0, gnarl=0.0, cap=True, seedo=0.0):
    """sweep a (optionally fluted + noisy) ring along a polyline"""
    fr = _frames(pts)
    rings = []
    for i, (p, r) in enumerate(zip(pts, radii)):
        t, n, b = fr[i]
        f = i / max(1, len(pts) - 1)
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides
            rr = r
            if lobes:
                rr *= 1.0 + lobe_amp * math.cos(lobes * (a + twist * f)) * (1 - 0.55 * f)
            if gnarl:
                rr *= 1.0 + gnarl * fbm((math.cos(a) * 2.2 + seedo, math.sin(a) * 2.2,
                                         f * 5.0 + seedo), 3)
            v = Vector(p) + (n * math.cos(a) + b * math.sin(a)) * rr
            ring.append(len(verts))
            verts.append(tuple(v))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, b_ = rings[i], rings[i + 1]
        for s in range(sides):
            k = (s + 1) % sides
            faces.append((a[s], b_[s], b_[k], a[k]))
            midx.append(mat_id)
    if cap:
        faces.append(tuple(reversed(rings[0])))
        midx.append(mat_id)
        faces.append(tuple(rings[-1]))
        midx.append(mat_id)
    return rings


def branch_path(p0, d0, length, steps, curve, up_bias, seed, droop=0.0):
    """organic branch centreline: noise wander + gravity / light bias"""
    pts, p, d = [tuple(p0)], Vector(p0), Vector(d0).normalized()
    for i in range(steps):
        f = i / steps
        w = Vector((fbm((seed, f * 3.1, 0.0), 3),
                    fbm((seed + 5, f * 3.1, 1.0), 3),
                    fbm((seed + 9, f * 3.1, 2.0), 3)))
        d = (d + w * curve + Vector((0, 0, up_bias - droop * f)) * 0.5).normalized()
        p = p + d * (length / steps)
        pts.append(tuple(p))
    return pts


def build_tree(origin=(5.6, 4.4, 0.35), scale=1.0):
    verts, faces, midx = [], [], []
    O = Vector(origin)
    blobs = []                     # (centre, radius) for the canopy
    rnd = random.Random(21)

    # ---------------- buttress roots ----------------
    NROOT = 11
    for i in range(NROOT):
        a = 2 * math.pi * i / NROOT + rnd.uniform(-0.16, 0.16)
        out = Vector((math.cos(a), math.sin(a), 0))
        L = (3.0 + rnd.uniform(-0.6, 1.3)) * scale
        pts = branch_path(O + out * 0.9 * scale + Vector((0, 0, 1.15 * scale)),
                          out * 0.75 + Vector((0, 0, -0.62)),
                          L, 7, 0.30, -0.16, seed=i * 3.7)
        pts = [(x, y, max(z, O.z - 0.35 + 0.10 * fbm((x, y, 3), 2))) for x, y, z in pts]
        r0 = (1.15 + rnd.uniform(0, 0.40)) * scale
        radii = [r0 * (1 - 0.86 * (k / (len(pts) - 1)) ** 0.75) + 0.05
                 for k in range(len(pts))]
        sweep(verts, faces, midx, 0, pts, radii, 10, lobes=3, lobe_amp=0.22,
              twist=0.7, gnarl=0.14, seedo=i * 2.0)

    # ---------------- trunk ----------------
    TH = 4.15 * scale
    tpts = branch_path(O + Vector((0, 0, -0.4)), Vector((0.06, 0.05, 1)),
                       TH, 14, 0.10, 0.30, seed=1.3)
    trad = []
    for k in range(len(tpts)):
        f = k / (len(tpts) - 1)
        r = 2.55 * scale * (0.40 + 0.60 * math.exp(-2.3 * f)) * (1 - 0.14 * f)
        r *= 1 + 0.05 * math.sin(f * 9.0)
        trad.append(r)
    sweep(verts, faces, midx, 0, tpts, trad, 20, lobes=7, lobe_amp=0.13,
          twist=1.5, gnarl=0.10, seedo=3.0)

    # ---------------- limbs (recursive) ----------------
    def limb(p, d, length, r, depth, seed):
        # arch up off the trunk, then flatten and droop -> broad banyan crown
        steps = 8 if depth < 2 else 6
        up    = (0.34, 0.06, -0.04, -0.06)[min(depth, 3)]
        droop = (0.40, 0.55, 0.62, 0.62)[min(depth, 3)]
        pts = branch_path(p, d, length, steps, 0.20 + 0.10 * depth, up, seed, droop)
        radii = [r * (1 - 0.80 * (k / (len(pts) - 1)) ** 0.9) + 0.035
                 for k in range(len(pts))]
        sides = max(6, 14 - depth * 3)
        sweep(verts, faces, midx, 0, pts, radii, sides,
              lobes=5 if depth == 0 else 0, lobe_amp=0.11, twist=1.0,
              gnarl=0.11 if depth < 2 else 0.06, seedo=seed)
        tip = Vector(pts[-1])
        tdir = (Vector(pts[-1]) - Vector(pts[-2])).normalized()
        if depth >= 1:                    # foliage clothes the limb, not just its tip
            for k in range(int(len(pts) * 0.62), len(pts) - 1):
                if rnd.random() < 0.75 and pts[k][2] > O.z + 3.1 * scale:
                    p2 = Vector(pts[k]) + Vector((rnd.uniform(-.4, .4),
                                                  rnd.uniform(-.4, .4),
                                                  rnd.uniform(-.25, .35)))
                    blobs.append((p2, (0.50 + 0.34 * rnd.random()) * scale))
        if depth >= 3 or length < 0.9:
            c = tip + tdir * 0.26
            blobs.append((c, (0.72 + 0.36 * rnd.random()) * scale))
            for _ in range(4):          # satellites soften the blob silhouette
                o = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1),
                            rnd.uniform(-0.7, 0.7))) * 0.85 * scale
                blobs.append((c + o, (0.44 + 0.34 * rnd.random()) * scale))
            return
        nch = 3 if depth == 0 else rnd.choice((2, 2, 3, 3))
        base_a = rnd.uniform(0, 6.28)
        for c in range(nch):
            a = base_a + 2 * math.pi * c / nch + rnd.uniform(-0.4, 0.4)
            perp = tdir.cross(Vector((0, 0, 1)))
            if perp.length < 1e-4:
                perp = Vector((1, 0, 0))
            perp.normalize()
            side = (perp * math.cos(a) + tdir.cross(perp) * math.sin(a))
            nd = (tdir * (0.62 + 0.2 * rnd.random())
                  + side * (0.72 + 0.35 * rnd.random())
                  + Vector((0, 0, 0.16))).normalized()
            limb(tip, nd, length * rnd.uniform(0.60, 0.80), r * 0.60,
                 depth + 1, seed + 13.7 * (c + 1))

    tdir = (Vector(tpts[-1]) - Vector(tpts[-3])).normalized()
    NL = 5
    for i in range(NL):
        a = 2 * math.pi * i / NL + rnd.uniform(-0.25, 0.25)
        side = Vector((math.cos(a), math.sin(a), 0))
        d = (tdir * 0.36 + side * 1.35 + Vector((0, 0, 0.30))).normalized()
        start = Vector(tpts[-1 - (i % 3)])
        limb(start, d, (4.05 + rnd.uniform(-0.6, 1.0)) * scale,
             1.05 * scale, 0, seed=40 + i * 7.1)

    tree = new_mesh_obj("TreeWood", verts, faces)
    for p, m in zip(tree.data.polygons, midx):
        p.material_index = m
        p.use_smooth = True
    tree.data.update()
    return tree, blobs, O


def build_canopy(blobs, name="Canopy"):
    """canopy = many displaced icospheres merged into painterly foliage masses"""
    verts, faces, midx = [], [], []
    rnd = random.Random(99)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    base_v = [tuple(v.co) for v in bm.verts]
    base_f = [tuple(l.vert.index for l in f.loops) for f in bm.faces]
    bm.free()
    for c, r in blobs:
        n = len(verts)
        sx = rnd.uniform(0.9, 1.35)
        sy = rnd.uniform(0.9, 1.35)
        sz = rnd.uniform(0.48, 0.70)
        o = rnd.uniform(0, 20)
        for vx, vy, vz in base_v:
            d = 1.0 + 0.46 * fbm((vx * 2.1 + o, vy * 2.1, vz * 2.1), 4)
            verts.append((c.x + vx * r * sx * d,
                          c.y + vy * r * sy * d,
                          c.z + vz * r * sz * d))
        for f in base_f:
            faces.append(tuple(i + n for i in f))
            midx.append(0)
    ob = new_mesh_obj(name, verts, faces)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def mat_bark():
    m = bpy.data.materials.new("Bark")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1300, 0))
    mp = n_new(N, "ShaderNodeMapping", (-1100, 0))
    mp.inputs["Scale"].default_value = (3.0, 3.0, 0.28)     # vertical ridges
    L.new(co.outputs["Object"], mp.inputs["Vector"])
    nz = noise_node(N, L, mp.outputs["Vector"], 6.0, 10.0, 0.68, (-880, 60))
    vo = n_new(N, "ShaderNodeTexVoronoi", (-880, -220))
    vo.inputs["Scale"].default_value = 3.0
    L.new(mp.outputs["Vector"], vo.inputs["Vector"])
    mix = n_new(N, "ShaderNodeMix", (-640, 40), data_type='FLOAT')
    mix.inputs[0].default_value = 0.4
    L.new(nz.outputs["Fac"], mix.inputs[2])
    L.new(vo.outputs["Distance"], mix.inputs[3])
    rp = ramp(N, L, mix.outputs[0], [
        (0.20, (0.118, 0.082, 0.055, 1)),     # deep fissure
        (0.42, (0.268, 0.196, 0.130, 1)),
        (0.62, (0.470, 0.360, 0.238, 1)),
        (0.82, (0.660, 0.530, 0.372, 1)),     # sun-bleached ridge
    ], (-400, 40))
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.78
    b.inputs["Subsurface Weight"].default_value = 0.06
    bump = n_new(N, "ShaderNodeBump", (-180, -240))
    bump.inputs["Strength"].default_value = 0.55
    bump.inputs["Distance"].default_value = 0.04
    L.new(mix.outputs[0], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_leaves():
    """pale cream-gold canopy: diffuse + heavy translucency so it glows backlit"""
    m = bpy.data.materials.new("Leaves")
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    co = n_new(N, "ShaderNodeTexCoord", (-1400, 0))
    nz = noise_node(N, L, co.outputs["Object"], 1.6, 9.0, 0.62, (-1180, 120))
    nz2 = noise_node(N, L, co.outputs["Object"], 9.0, 6.0, 0.55, (-1180, -160))
    mix = n_new(N, "ShaderNodeMix", (-950, 40), data_type='FLOAT')
    mix.inputs[0].default_value = 0.35
    L.new(nz.outputs["Fac"], mix.inputs[2])
    L.new(nz2.outputs["Fac"], mix.inputs[3])
    # sunlit crown is cream, the shaded underside stays green
    geo = n_new(N, "ShaderNodeNewGeometry", (-1180, -430))
    sep = n_new(N, "ShaderNodeSeparateXYZ", (-1000, -430))
    L.new(geo.outputs["Position"], sep.inputs[0])
    hz = n_new(N, "ShaderNodeMath", (-830, -430), operation='MULTIPLY_ADD')
    L.new(sep.outputs["Z"], hz.inputs[0])
    hz.inputs[1].default_value = 0.085
    hz.inputs[2].default_value = -0.24
    up = n_new(N, "ShaderNodeSeparateXYZ", (-1000, -640))
    L.new(geo.outputs["Normal"], up.inputs[0])
    upw = n_new(N, "ShaderNodeMath", (-830, -640), operation='MULTIPLY')
    L.new(up.outputs["Z"], upw.inputs[0])
    upw.inputs[1].default_value = 0.22
    hsum = n_new(N, "ShaderNodeMath", (-700, -520), operation='ADD')
    L.new(hz.outputs[0], hsum.inputs[0])
    L.new(upw.outputs[0], hsum.inputs[1])
    tot = n_new(N, "ShaderNodeMath", (-820, 40), operation='ADD')
    L.new(mix.outputs[0], tot.inputs[0])
    L.new(hsum.outputs[0], tot.inputs[1])
    rp = ramp(N, L, tot.outputs[0], [
        (0.26, (0.300, 0.420, 0.180, 1)),     # shaded interior green
        (0.44, (0.560, 0.660, 0.300, 1)),
        (0.60, (0.820, 0.850, 0.520, 1)),
        (0.75, (0.960, 0.930, 0.700, 1)),     # cream
        (0.90, (1.000, 0.960, 0.820, 1)),
    ], (-700, 60))
    dif = n_new(N, "ShaderNodeBsdfDiffuse", (-400, 160))
    dif.inputs["Roughness"].default_value = 0.9
    tr = n_new(N, "ShaderNodeBsdfTranslucent", (-400, -40))
    gl = n_new(N, "ShaderNodeBsdfGlossy", (-400, -220))
    gl.inputs["Roughness"].default_value = 0.45
    L.new(rp.outputs["Color"], dif.inputs["Color"])
    L.new(rp.outputs["Color"], tr.inputs["Color"])
    gl.inputs["Color"].default_value = (1.0, 0.95, 0.85, 1)
    m1 = n_new(N, "ShaderNodeMixShader", (-160, 40))
    m1.inputs[0].default_value = 0.46
    L.new(dif.outputs[0], m1.inputs[1])
    L.new(tr.outputs[0], m1.inputs[2])
    m2 = n_new(N, "ShaderNodeMixShader", (40, 0))
    m2.inputs[0].default_value = 0.08
    L.new(m1.outputs[0], m2.inputs[1])
    L.new(gl.outputs[0], m2.inputs[2])
    L.new(m2.outputs[0], out.inputs["Surface"])
    return m

# ============================================================================
#  AUTOMATIC FRAMING  -- fit every renderable object into the frame
# ============================================================================
def fit_camera(cam, scene, margin=1.06, shift=(0.0, 0.0), target=None,
               only=None, axis='xy', place_y=None):
    pts = []
    for ob in scene.objects:
        if ob.type != 'MESH' or ob.hide_render:
            continue
        if only is not None and ob.name not in only:
            continue
        M = ob.matrix_world
        vs = ob.data.vertices           # bound_box can be stale for built meshes
        stride = max(1, len(vs) // 3000)
        for i in range(0, len(vs), stride):
            pts.append(M @ vs[i].co)
    if not pts:
        return
    tgt = Vector(target) if target else (sum(pts, Vector()) / len(pts))
    axis = (cam.location - tgt).normalized()
    d = (cam.location - tgt).length
    sx = scene.render.resolution_x
    sy = scene.render.resolution_y
    tan_x = (cam.data.sensor_width * 0.5) / cam.data.lens
    tan_y = tan_x * (sy / sx)
    for _ in range(30):
        cam.location = tgt + axis * d
        cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
        bpy.context.view_layer.update()
        inv = cam.matrix_world.inverted()
        need = 0.0
        for p in pts:
            q = inv @ p
            z = -q.z
            if z <= 0.05:
                need = max(need, 4.0)
                continue
            need = max(need, abs(q.x) / (z * tan_x))
            if axis == 'xy':
                need = max(need, abs(q.y) / (z * tan_y))
        if abs(need * margin - 1.0) < 0.004:
            break
        d *= (1.0 + 0.85 * (need * margin - 1.0))
    cam.location = tgt + axis * d
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    if place_y is not None:
        # put the fitted objects' vertical centre at `place_y` down the frame
        inv = cam.matrix_world.inverted()
        ndc = [(inv @ p) for p in pts]
        vals = [q.y / (-q.z * tan_y) for q in ndc if -q.z > 0.05]
        cur = (max(vals) + min(vals)) * 0.5
        print("place_y cur", round(cur, 3))
        cam.data.shift_y = (cur - (1.0 - 2.0 * place_y)) * tan_y / (2.0 * tan_x)
    if shift != (0.0, 0.0):
        cam.data.shift_x, cam.data.shift_y = shift
    bpy.context.view_layer.update()
    print("FIT distance", round(d, 2), "shift_y", round(cam.data.shift_y, 4))
    return d

# ============================================================================
#  PROP TOOLKIT
# ============================================================================
class MB:
    """tiny mesh builder: accumulate verts/faces/material ids, emit one object"""
    def __init__(self):
        self.v, self.f, self.m, self.sm = [], [], [], []

    def add(self, verts, faces, mid=0, smooth=False):
        n = len(self.v)
        self.v.extend(verts)
        for fc in faces:
            self.f.append(tuple(i + n for i in fc))
            self.m.append(mid)
            self.sm.append(smooth)
        return n

    def box(self, centre, size, rot=None, mid=0):
        cx, cy, cz = centre
        sx, sy, sz = (s * 0.5 for s in size)
        vs = [(x, y, z) for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)]
        if rot is not None:
            R = rot if isinstance(rot, Matrix) else Matrix.Rotation(rot, 3, 'Z')
            vs = [tuple(R @ Vector(v)) for v in vs]
        vs = [(v[0] + cx, v[1] + cy, v[2] + cz) for v in vs]
        fs = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1),
              (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
        self.add(vs, fs, mid)

    def tube(self, pts, radii, sides=8, mid=0, smooth=True, cap=True):
        n0 = len(self.v)
        f0 = len(self.f)
        sweep(self.v, self.f, self.m, mid, pts, radii, sides, cap=cap)
        for _ in range(len(self.f) - f0):
            self.sm.append(smooth)
        return n0

    def blob(self, c, r, scale=(1, 1, 1), squash=0.0, seed=0, mid=0, subd=2):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subd, radius=1.0)
        vs, fs = [], []
        for v in bm.verts:
            x, y, z = v.co
            d = 1.0 + squash * fbm((x * 2 + seed, y * 2, z * 2), 3)
            vs.append((c[0] + x * r * scale[0] * d,
                       c[1] + y * r * scale[1] * d,
                       c[2] + z * r * scale[2] * d))
        for f in bm.faces:
            fs.append(tuple(l.vert.index for l in f.loops))
        bm.free()
        self.add(vs, fs, mid, smooth=True)

    def ribbon(self, pts, widths, up=(0, 0, 1), mid=0, smooth=True):
        """flat strip swept along a polyline -- paths, banners, waterfalls"""
        n = len(self.v)
        U = Vector(up)
        rows = []
        for i, (p, w) in enumerate(zip(pts, widths)):
            a = Vector(pts[min(i + 1, len(pts) - 1)])
            b = Vector(pts[max(i - 1, 0)])
            t = (a - b)
            t = t.normalized() if t.length > 1e-6 else Vector((1, 0, 0))
            s = t.cross(U)
            s = s.normalized() if s.length > 1e-5 else Vector((1, 0, 0))
            rows.append((Vector(p) - s * w * 0.5, Vector(p) + s * w * 0.5))
        vs, fs = [], []
        for a, b in rows:
            vs.append(tuple(a)); vs.append(tuple(b))
        for i in range(len(rows) - 1):
            fs.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
        self.add(vs, fs, mid, smooth=smooth)
        return n

    def emit(self, name, *materials):
        ob = new_mesh_obj(name, self.v, self.f)
        for p, m, sm in zip(ob.data.polygons, self.m, self.sm):
            p.material_index = m
            p.use_smooth = sm
        ob.data.update()
        if materials:
            assign(ob, *materials)
        return ob


def rim_point(t):
    r = rim_radius(t)
    x, y = math.cos(t) * r, math.sin(t) * r
    return Vector((x, y, top_height(x, y)))


def ground(x, y):
    return top_height(x, y)


# ============================================================================
#  STONE PLAZA + FLAGSTONE PATH
# ============================================================================
def build_plaza(centre, r_out=5.6, steps=3):
    """concentric terraced stone rings around the tree"""
    mb = MB()
    cx, cy = centre[0], centre[1]
    NA = 96
    base = ground(cx, cy)
    levels = [(r_out, base + 0.04), (r_out * 0.84, base + 0.40),
              (r_out * 0.66, base + 0.74), (r_out * 0.48, base + 1.02)][:steps + 1]
    prev_ring = None
    for li, (r, z) in enumerate(levels):
        ring, ringi = [], []
        for j in range(NA):
            a = 2 * math.pi * j / NA
            rr = r * (1 + 0.055 * fbm((math.cos(a) * 1.4, math.sin(a) * 1.4, li * 3.0), 3))
            ring.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z))
        n = len(mb.v)
        mb.v.extend(ring)
        ringi = [n + j for j in range(NA)]
        if prev_ring is None:
            # outer apron blends down to the grass
            n2 = len(mb.v)
            for j in range(NA):
                a = 2 * math.pi * j / NA
                rr = r * 1.13 * (1 + 0.06 * fbm((math.cos(a), math.sin(a), 9.0), 3))
                x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr
                mb.v.append((x, y, ground(x, y) - 0.03))
            for j in range(NA):
                k = (j + 1) % NA
                mb.f.append((n2 + j, n + j, n + k, n2 + k))
                mb.m.append(0); mb.sm.append(False)
        else:
            for j in range(NA):                      # riser
                k = (j + 1) % NA
                mb.f.append((prev_ring[j], ringi[j], ringi[k], prev_ring[k]))
                mb.m.append(0); mb.sm.append(False)
        prev_ring = ringi
    # cap the innermost level
    c = len(mb.v)
    mb.v.append((cx, cy, levels[-1][1]))
    for j in range(NA):
        k = (j + 1) % NA
        mb.f.append((prev_ring[j], c, prev_ring[k]))
        mb.m.append(0); mb.sm.append(False)
    return mb


def path_ribbon(mb, pts, width=1.5, mid=0, lift=0.045):
    dense = []
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        for k in range(6):
            p = a.lerp(b, k / 6.0)
            dense.append((p.x, p.y, ground(p.x, p.y) + lift))
    p = Vector(pts[-1]); dense.append((p.x, p.y, ground(p.x, p.y) + lift))
    w = [width * (1 + 0.10 * fbm((d[0] * 0.4, d[1] * 0.4, 2.0), 2)) for d in dense]
    mb.ribbon(dense, w, mid=mid, smooth=False)


# ============================================================================
#  BRIDGE  (deck planks + posts + rope rails + lanterns + banners)
# ============================================================================
def build_bridge(mbw, mbr, mbm, mbg, mbb, angle, out_len=4.2, width=2.0, lights=None):
    """returns list of lantern world positions"""
    base = rim_point(angle)
    outd = Vector((math.cos(angle), math.sin(angle), 0))
    side = Vector((-outd.y, outd.x, 0))
    z0 = base.z + 0.10
    start = base - outd * 2.10
    lanterns = []

    # ---- deck: individual planks with a gentle sag ----
    NP = int(out_len / 0.30)
    for i in range(NP):
        f = i / (NP - 1)
        p = start + outd * (out_len * f)
        sag = -0.16 * math.sin(math.pi * f) * 0.55
        jit = 0.012 * (hash01(i, 3) - 0.5)
        w = width * (1 - 0.06 * f)
        mbw.box((p.x, p.y, z0 + sag + jit), (0.265, w, 0.145),
                rot=Matrix.Rotation(angle, 3, 'Z'), mid=0)
    # stringers under the deck
    for sgn in (-1, 1):
        a = start + side * sgn * width * 0.45
        b = start + outd * out_len + side * sgn * width * 0.42
        mbw.tube([(a.x, a.y, z0 - 0.14), ((a.x + b.x) / 2, (a.y + b.y) / 2, z0 - 0.24),
                  (b.x, b.y, z0 - 0.16)], [0.115, 0.130, 0.115], 6, mid=0)

    # ---- posts ----
    post_f = (0.06, 0.94)
    tops = []
    for f in post_f:
        for sgn in (-1, 1):
            p = start + outd * (out_len * f) + side * sgn * width * 0.5
            h = 1.75 if f > 0.5 else 2.05
            mbw.box((p.x, p.y, z0 + h * 0.5), (0.30, 0.30, h),
                    rot=Matrix.Rotation(angle + 0.15, 3, 'Z'), mid=0)
            mbw.box((p.x, p.y, z0 + h + 0.07), (0.46, 0.46, 0.14),
                    rot=Matrix.Rotation(angle + 0.15, 3, 'Z'), mid=0)
            tops.append((p, z0 + h))

    # ---- rope rails: catenary between the posts on each side ----
    for si, sgn in enumerate((-1, 1)):
        a = start + outd * (out_len * post_f[0]) + side * sgn * width * 0.5
        b = start + outd * (out_len * post_f[1]) + side * sgn * width * 0.5
        for hz, sag in ((1.32, 0.20), (0.78, 0.13)):
            pts = []
            for k in range(13):
                f = k / 12
                p = a.lerp(b, f)
                pts.append((p.x, p.y, z0 + hz - sag * math.sin(math.pi * f)))
            mbr.tube(pts, [0.055] * 13, 6, mid=0)

    # ---- lanterns on the outer posts ----
    for (p, ztop) in tops[2:]:
        lp = p + outd * 0.02
        hang = Vector((lp.x, lp.y, ztop - 0.02))
        mbm.tube([(hang.x, hang.y, ztop + 0.12), (hang.x, hang.y, ztop - 0.10)],
                 [0.035, 0.035], 5, mid=0)
        c = (hang.x, hang.y, ztop - 0.52)
        mbg.box(c, (0.34, 0.34, 0.52), rot=Matrix.Rotation(angle, 3, 'Z'), mid=0)
        mbm.box((c[0], c[1], c[2] + 0.26), (0.36, 0.36, 0.08),
                rot=Matrix.Rotation(angle, 3, 'Z'), mid=0)
        mbm.box((c[0], c[1], c[2] - 0.23), (0.30, 0.30, 0.06),
                rot=Matrix.Rotation(angle, 3, 'Z'), mid=0)
        lanterns.append(Vector(c))

    # ---- banners hanging off the outer beam ----
    for sgn in (-0.62, 0.0, 0.62):
        if abs(sgn) < 0.01 and hash01(angle, 5) < 0.5:
            continue
        anchor = start + outd * (out_len * 0.90) + side * (sgn * width * 0.5)
        H, NSEG = 3.1, 12
        pts, ws = [], []
        for k in range(NSEG + 1):
            f = k / NSEG
            sway = 0.16 * math.sin(f * 2.4 + angle) * f
            pts.append((anchor.x + outd.x * sway * 0.4 + side.x * sway,
                        anchor.y + outd.y * sway * 0.4 + side.y * sway,
                        z0 - 0.05 - H * f))
            ws.append(0.95 * (1 - 0.14 * f))
        mbb.ribbon(pts, ws, up=tuple(outd), mid=0, smooth=True)
    return lanterns


# ============================================================================
#  WATERFALLS / VINES / FLOATING ROCKS / SKY LANTERNS
# ============================================================================
def build_waterfall(mb, angle, drop=9.0, width=0.9, mid=0):
    top = rim_point(angle)
    outd = Vector((math.cos(angle), math.sin(angle), 0))
    pts, ws = [], []
    N = 30
    for k in range(N + 1):
        f = k / N
        # narrow at the lip, bows out over the cliff, fans out as it falls
        bow = 0.85 * math.sin(min(1.0, f * 2.4) * math.pi * 0.5) - 0.22 * f
        x = top.x + outd.x * bow
        y = top.y + outd.y * bow
        z = top.z + 0.05 - drop * (f ** 1.30)
        pts.append((x, y, z))
        w = width * (0.95 + 1.05 * f ** 0.85) * (1 + 0.18 * fbm((f * 6, angle, 3), 3))
        ws.append(w * (1.0 - 0.55 * smoothstep(0.72, 1.0, f)))   # dissipates
    mb.ribbon(pts, ws, up=(0, 0, 1), mid=mid)
    pts2 = [(x + outd.x * 0.20, y + outd.y * 0.20, z + 0.12) for x, y, z in pts]
    mb.ribbon(pts2, [w * 0.55 for w in ws], up=(0, 0, 1), mid=mid)
    # mist where it lands
    for k in range(3):
        f = 0.80 + 0.06 * k
        i = int(f * N)
        mb.blob(pts[i], width * (0.34 + 0.16 * k),
                scale=(1.4, 1.4, 0.55), squash=0.5, seed=angle * 7 + k,
                mid=mid, subd=2)


def vine_clumps(rnd, n_clumps=8, per=(4, 10), spread=0.20):
    """vines hang in clumps, not as an even fringe"""
    out = []
    for c in range(n_clumps):
        a0 = rnd.uniform(0, 2 * math.pi)
        for _ in range(rnd.randint(*per)):
            out.append(a0 + rnd.gauss(0, spread))
    return out


def build_vines(mbs, mbl, angles, rnd):
    """hanging creepers on the cliff face: stem tube + leaf blobs"""
    for a in angles:
        top = rim_point(a)
        outd = Vector((math.cos(a), math.sin(a), 0))
        L = rnd.uniform(1.1, 3.6)
        N = 14
        pts = []
        for k in range(N + 1):
            f = k / N
            drift = 0.35 * fbm((a * 3.0, f * 2.5, 7.0), 3)
            pts.append((top.x + outd.x * (0.18 + 0.10 * f + drift * 0.3),
                        top.y + outd.y * (0.18 + 0.10 * f + drift * 0.3),
                        top.z + 0.05 - L * f))
        mbs.tube(pts, [0.045 * (1 - 0.6 * k / N) + 0.012 for k in range(N + 1)], 4, mid=0)
        for k in range(1, N + 1):
            f = k / N
            for _ in range(3):
                o = Vector((rnd.uniform(-.20, .20), rnd.uniform(-.20, .20),
                            rnd.uniform(-.13, .13)))
                c = Vector(pts[k]) + o
                mbl.blob(tuple(c), rnd.uniform(0.085, 0.165),
                         scale=(1.7, 1.7, 0.42), squash=0.40,
                         seed=rnd.uniform(0, 30), mid=0, subd=1)
            if rnd.random() < 0.22:                      # blossom on the creeper
                c2 = Vector(pts[k]) + Vector((rnd.uniform(-.2, .2),
                                              rnd.uniform(-.2, .2), 0.04))
                mbl.blob(tuple(c2), rnd.uniform(0.055, 0.095),
                         scale=(1.6, 1.6, 0.5), squash=0.2,
                         seed=rnd.uniform(0, 30), mid=1, subd=1)


def build_floating_rocks(mb_rock, mb_grass, rnd, n=16):
    out = []
    for i in range(n):
        a = rnd.uniform(0, 2 * math.pi)
        rr = rim_radius(a) * rnd.uniform(0.45, 1.35)
        z = rnd.uniform(-11.5, -3.0)
        c = (math.cos(a) * rr + rnd.uniform(-2, 2),
             math.sin(a) * rr + rnd.uniform(-2, 2), z)
        s = rnd.uniform(0.30, 1.15)
        mb_rock.blob(c, s, scale=(1.25, 1.15, 0.85), squash=0.55,
                     seed=rnd.uniform(0, 50), mid=0, subd=2)
        if rnd.random() < 0.55:                       # grass cap
            mb_grass.blob((c[0], c[1], c[2] + s * 0.55), s * 0.82,
                          scale=(1.1, 1.0, 0.34), squash=0.45,
                          seed=rnd.uniform(0, 50), mid=0, subd=2)
        out.append((Vector(c), s))
    return out


def build_sky_lanterns(mb, rnd, spots):
    pos = []
    for (x, y, z, s) in spots:
        mb.blob((x, y, z), 0.30 * s, scale=(1.0, 1.0, 1.25), squash=0.10,
                seed=rnd.uniform(0, 9), mid=0, subd=2)
        mb.blob((x, y, z - 0.34 * s), 0.11 * s, scale=(1.0, 1.0, 0.5),
                squash=0.0, seed=1, mid=0, subd=1)
        pos.append(Vector((x, y, z)))
    return pos


# ============================================================================
#  SCATTER: shore rocks, flowers, tufts, lily pads
# ============================================================================
def scatter_top(mb_rock, mb_flower, mb_tuft, mb_pad, rnd):
    # --- rocks along the rim and the shore -----------------------------------
    for i in range(75):
        a = rnd.uniform(0, 2 * math.pi)
        rr = rim_radius(a) * rnd.uniform(0.88, 0.985)
        x, y = math.cos(a) * rr, math.sin(a) * rr
        s = rnd.uniform(0.16, 0.62)
        mb_rock.blob((x, y, ground(x, y) + s * 0.35), s,
                     scale=(1.3, 1.1, 0.75), squash=0.5,
                     seed=rnd.uniform(0, 60), mid=0, subd=1)
    for i in range(42):                                  # shoreline boulders
        t = rnd.uniform(0, 2 * math.pi)
        for _ in range(1):
            lo, hi = 0.3, 1.7
            for _ in range(18):
                mid_ = (lo + hi) / 2
                dx = POND_C[0] + math.cos(t) * POND_A * mid_ * math.cos(POND_ROT) \
                     - math.sin(t) * POND_B * mid_ * math.sin(POND_ROT)
                dy = POND_C[1] + math.cos(t) * POND_A * mid_ * math.sin(POND_ROT) \
                     + math.sin(t) * POND_B * mid_ * math.cos(POND_ROT)
                if pond_sd(dx, dy) < 0: lo = mid_
                else: hi = mid_
            f = lo * rnd.uniform(0.995, 1.055)   # hug the water, not the path
            x = POND_C[0] + math.cos(t) * POND_A * f * math.cos(POND_ROT) \
                - math.sin(t) * POND_B * f * math.sin(POND_ROT)
            y = POND_C[1] + math.cos(t) * POND_A * f * math.sin(POND_ROT) \
                + math.sin(t) * POND_B * f * math.cos(POND_ROT)
        s = rnd.uniform(0.09, 0.26)
        mb_rock.blob((x, y, ground(x, y) + s * 0.3), s,
                     scale=(1.4, 1.2, 0.6), squash=0.5,
                     seed=rnd.uniform(0, 60), mid=0, subd=1)

    # --- grass tufts + flowers over the sward --------------------------------
    for i in range(3400):
        a = rnd.uniform(0, 2 * math.pi)
        rr = rim_radius(a) * math.sqrt(rnd.random()) * 0.99
        x, y = math.cos(a) * rr, math.sin(a) * rr
        if pond_sd(x, y) < 0.10:
            continue
        z = ground(x, y)
        edge = min(1.0, max(0.0, (rr / rim_radius(a) - 0.55) / 0.45))
        if rnd.random() < 0.008 + 0.055 * edge ** 3:
            s = rnd.uniform(0.035, 0.070) * (1 + 0.7 * edge)
            mb_tuft.blob((x, y, z + s * 0.45), s, scale=(1.5, 1.5, 1.25),
                         squash=0.6, seed=rnd.uniform(0, 90), mid=0, subd=1)
        elif rnd.random() < 0.22:
            s = rnd.uniform(0.026, 0.046)
            mb_flower.blob((x, y, z + 0.048), s, scale=(1.8, 1.8, 0.38),
                           squash=0.2, seed=rnd.uniform(0, 90), mid=0, subd=1)

    # --- lily pads near the pond edge ---------------------------------------
    for i in range(70):
        t = rnd.uniform(0, 2 * math.pi)
        f = rnd.uniform(0.45, 0.94)
        x = POND_C[0] + math.cos(t) * POND_A * f * math.cos(POND_ROT) \
            - math.sin(t) * POND_B * f * math.sin(POND_ROT)
        y = POND_C[1] + math.cos(t) * POND_A * f * math.sin(POND_ROT) \
            + math.sin(t) * POND_B * f * math.cos(POND_ROT)
        if pond_sd(x, y) > -0.02:
            continue
        s = rnd.uniform(0.13, 0.26)
        mb_pad.blob((x, y, WATER_Z + 0.015), s, scale=(1.0, 1.0, 0.09),
                    squash=0.25, seed=rnd.uniform(0, 40), mid=0, subd=1)

# ============================================================================
#  PROP MATERIALS
# ============================================================================
def mat_stone():
    m = bpy.data.materials.new("Stone")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1400, 0))
    # voronoi cells = flagstones; the F2-F1 edge is the mortar joint
    vo = n_new(N, "ShaderNodeTexVoronoi", (-1150, 120))
    vo.feature = 'DISTANCE_TO_EDGE'
    vo.inputs["Scale"].default_value = 0.65
    L.new(co.outputs["Object"], vo.inputs["Vector"])
    vc = n_new(N, "ShaderNodeTexVoronoi", (-1150, -160))
    vc.inputs["Scale"].default_value = 0.65
    L.new(co.outputs["Object"], vc.inputs["Vector"])
    grain = noise_node(N, L, co.outputs["Object"], 16.0, 6.0, 0.6, (-1150, -420))
    joint = ramp(N, L, vo.outputs["Distance"], [
        (0.00, (0.10, 0.095, 0.09, 1)),
        (0.045, (0.470, 0.450, 0.420, 1)),
        (0.30, (0.605, 0.578, 0.532, 1)),
    ], (-880, 140))
    # per-slab tint so the paving is not uniform
    slab = ramp(N, L, vc.outputs["Color"], [
        (0.20, (0.660, 0.620, 0.560, 1)), (0.80, (0.880, 0.835, 0.765, 1))], (-880, -180))
    mix = n_new(N, "ShaderNodeMix", (-560, 60), data_type='RGBA')
    mix.inputs[0].default_value = 1.0
    mix.blend_type = 'MULTIPLY'
    L.new(joint.outputs["Color"], mix.inputs[6])
    L.new(slab.outputs["Color"], mix.inputs[7])
    gm = n_new(N, "ShaderNodeMix", (-330, 60), data_type='RGBA')
    gm.inputs[0].default_value = 0.18
    gm.blend_type = 'MULTIPLY'
    L.new(mix.outputs[2], gm.inputs[6])
    L.new(grain.outputs["Color"], gm.inputs[7])
    L.new(gm.outputs[2], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.82
    bump = n_new(N, "ShaderNodeBump", (-150, -260))
    bump.inputs["Strength"].default_value = 0.6
    bump.inputs["Distance"].default_value = 0.05
    L.new(joint.outputs["Color"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_rope():
    m = bpy.data.materials.new("Rope")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.360, 0.290, 0.196, 1)
    b.inputs["Roughness"].default_value = 0.95
    return m


def mat_metal():
    m = bpy.data.materials.new("LanternFrame")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.185, 0.140, 0.098, 1)
    b.inputs["Roughness"].default_value = 0.45
    b.inputs["Metallic"].default_value = 0.65
    return m


def mat_lantern_glass(strength=4.5):
    m = bpy.data.materials.new("LanternGlass")
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    e = n_new(N, "ShaderNodeEmission", (-260, 0))
    e.inputs["Color"].default_value = (1.0, 0.50, 0.18, 1)
    e.inputs["Strength"].default_value = strength
    L.new(e.outputs[0], out.inputs["Surface"])
    return m


def mat_banner():
    """pale blue-grey pennant with a soft gradient and a woven sheen"""
    m = bpy.data.materials.new("Banner")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1200, 0))
    sep = n_new(N, "ShaderNodeSeparateXYZ", (-1000, 0))
    L.new(co.outputs["Object"], sep.inputs[0])
    rp = ramp(N, L, sep.outputs["Z"], [
        (0.10, (0.560, 0.660, 0.720, 1)),
        (0.55, (0.760, 0.830, 0.870, 1)),
        (0.95, (0.900, 0.930, 0.940, 1)),
    ], (-760, 0))
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.68
    b.inputs["Subsurface Weight"].default_value = 0.35
    b.inputs["Subsurface Radius"].default_value = (0.4, 0.5, 0.6)
    m.use_backface_culling = False
    return m


def mat_waterfall():
    """thin falling sheet: mostly translucent white with a soft self-glow"""
    m = bpy.data.materials.new("Waterfall")
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    co = n_new(N, "ShaderNodeTexCoord", (-1300, 0))
    mp = n_new(N, "ShaderNodeMapping", (-1100, 0))
    mp.inputs["Scale"].default_value = (7.0, 7.0, 0.7)   # streaks along the fall
    L.new(co.outputs["Object"], mp.inputs["Vector"])
    nz = noise_node(N, L, mp.outputs["Vector"], 7.0, 8.0, 0.6, (-880, 0))
    a = ramp(N, L, nz.outputs["Fac"], [
        (0.18, (0.35, 0.35, 0.35, 1)), (0.62, (1, 1, 1, 1))], (-640, -180))
    tr = n_new(N, "ShaderNodeBsdfTranslucent", (-400, 120))
    tr.inputs["Color"].default_value = (1.30, 1.34, 1.40, 1)
    gl = n_new(N, "ShaderNodeBsdfGlossy", (-400, -60))
    gl.inputs["Roughness"].default_value = 0.18
    gl.inputs["Color"].default_value = (1, 1, 1, 1)
    mixs = n_new(N, "ShaderNodeMixShader", (-180, 60))
    mixs.inputs[0].default_value = 0.35
    L.new(tr.outputs[0], mixs.inputs[1])
    L.new(gl.outputs[0], mixs.inputs[2])
    em = n_new(N, "ShaderNodeEmission", (-180, -400))
    em.inputs["Color"].default_value = (0.92, 0.96, 1.0, 1)
    em.inputs["Strength"].default_value = 0.16
    lit_mix = n_new(N, "ShaderNodeAddShader", (-20, -140))
    L.new(mixs.outputs[0], lit_mix.inputs[0])
    L.new(em.outputs[0], lit_mix.inputs[1])
    trans = n_new(N, "ShaderNodeBsdfTransparent", (-180, -220))
    fin = n_new(N, "ShaderNodeMixShader", (60, 0))
    L.new(a.outputs["Color"], fin.inputs[0])
    L.new(trans.outputs[0], fin.inputs[1])
    L.new(lit_mix.outputs[0], fin.inputs[2])
    L.new(fin.outputs[0], out.inputs["Surface"])
    m.use_backface_culling = False
    if hasattr(m, "blend_method"):
        try:
            m.blend_method = 'BLEND'
        except Exception:
            pass
    return m


def mat_foliage(name, cols, rough=0.88, trans=0.35):
    """generic painterly foliage: colour ramp + translucency"""
    m = bpy.data.materials.new(name)
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    co = n_new(N, "ShaderNodeTexCoord", (-1200, 0))
    nz = noise_node(N, L, co.outputs["Object"], 3.5, 8.0, 0.6, (-980, 0))
    rp = ramp(N, L, nz.outputs["Fac"], cols, (-740, 0))
    dif = n_new(N, "ShaderNodeBsdfDiffuse", (-460, 120))
    dif.inputs["Roughness"].default_value = rough
    tr = n_new(N, "ShaderNodeBsdfTranslucent", (-460, -80))
    L.new(rp.outputs["Color"], dif.inputs["Color"])
    L.new(rp.outputs["Color"], tr.inputs["Color"])
    mx = n_new(N, "ShaderNodeMixShader", (-200, 0))
    mx.inputs[0].default_value = trans
    L.new(dif.outputs[0], mx.inputs[1])
    L.new(tr.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"])
    return m


def mat_flower():
    return mat_foliage("Flower", [
        (0.18, (1.00, 1.00, 0.99, 1)),
        (0.42, (1.00, 0.94, 0.97, 1)),
        (0.62, (0.98, 0.86, 0.93, 1)),
        (0.84, (1.00, 0.98, 0.88, 1)),
    ], rough=0.9, trans=0.55)


def mat_tuft():
    return mat_foliage("Tuft", [
        (0.22, (0.330, 0.470, 0.130, 1)),
        (0.45, (0.520, 0.660, 0.200, 1)),
        (0.68, (0.710, 0.800, 0.300, 1)),
        (0.88, (0.860, 0.900, 0.450, 1)),
    ], trans=0.40)


def mat_vineleaf():
    return mat_foliage("VineLeaf", [
        (0.20, (0.140, 0.260, 0.070, 1)),
        (0.44, (0.290, 0.430, 0.110, 1)),
        (0.66, (0.470, 0.600, 0.170, 1)),
        (0.86, (0.660, 0.740, 0.280, 1)),
    ], trans=0.45)


def mat_lilypad():
    return mat_foliage("LilyPad", [
        (0.30, (0.200, 0.330, 0.130, 1)),
        (0.70, (0.400, 0.540, 0.200, 1)),
    ], trans=0.25)


def mat_skylantern():
    m = bpy.data.materials.new("SkyLantern")
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    out = N["Material Output"]
    e = n_new(N, "ShaderNodeEmission", (-260, 0))
    e.inputs["Color"].default_value = (1.0, 0.34, 0.10, 1)
    e.inputs["Strength"].default_value = 2.6
    L.new(e.outputs[0], out.inputs["Surface"])
    return m


# ============================================================================
#  HDRI WORLD  -- bundled Blender studio HDRI drives the lighting,
#  but camera rays see a flat paper-white sweep so the background stays clean
# ============================================================================
def setup_world_hdri(scene, hdri="sunrise.exr", strength=1.0, rot=0.0,
                     env_clamp=20.0, gloss_scale=0.22, gloss_clamp=45.0,
                     bg=(0.905, 0.893, 0.872), bg_strength=None):
    import os as _os
    w = bpy.data.worlds.new("World")
    scene.world = w
    w.use_nodes = True
    N, L = w.node_tree.nodes, w.node_tree.links
    for n in list(N):
        N.remove(n)
    out = n_new(N, "ShaderNodeOutputWorld", (600, 0))

    path = _os.path.join(bpy.utils.resource_path('LOCAL'),
                         "datafiles", "studiolights", "world", hdri)
    env = None
    if _os.path.exists(path):
        co = n_new(N, "ShaderNodeTexCoord", (-900, -200))
        mp = n_new(N, "ShaderNodeMapping", (-700, -200))
        mp.inputs["Rotation"].default_value = (0, 0, rot)
        L.new(co.outputs["Generated"], mp.inputs["Vector"])
        env = n_new(N, "ShaderNodeTexEnvironment", (-450, -200))
        env.image = bpy.data.images.load(path)
        L.new(mp.outputs["Vector"], env.inputs["Vector"])
        print("HDRI:", path)
    lit = n_new(N, "ShaderNodeBackground", (-120, -160))
    lit.inputs["Strength"].default_value = strength
    if env:
        # warm the sky and lift its floor -> high-key golden ambient
        tint = n_new(N, "ShaderNodeMix", (-250, -320), data_type='RGBA')
        tint.blend_type = 'MULTIPLY'
        tint.inputs[0].default_value = 1.0
        L.new(env.outputs["Color"], tint.inputs[6])
        tint.inputs[7].default_value = (1.0, 0.90, 0.76, 1)
        lift = n_new(N, "ShaderNodeMix", (-250, -520), data_type='RGBA')
        lift.blend_type = 'ADD'
        lift.inputs[0].default_value = 1.0
        L.new(tint.outputs[2], lift.inputs[6])
        lift.inputs[7].default_value = (0.10, 0.095, 0.085, 1)
        L.new(lift.outputs[2], lit.inputs["Color"])
    else:
        lit.inputs["Color"].default_value = (1.0, 0.94, 0.86, 1)

    # --- what MIRRORS see: same sky, capped and scaled down, so the sun
    #     still lays a bright streak on the pond without blowing it white
    gloss = n_new(N, "ShaderNodeBackground", (-120, -760))
    gloss.inputs["Strength"].default_value = gloss_scale
    if env:
        gcap = n_new(N, "ShaderNodeMix", (-320, -760), data_type='RGBA')
        gcap.blend_type = 'DARKEN'
        gcap.inputs[0].default_value = 1.0
        L.new(tint.outputs[2], gcap.inputs[6])
        gcap.inputs[7].default_value = (gloss_clamp,) * 3 + (1,)
        L.new(gcap.outputs[2], gloss.inputs["Color"])
    else:
        gloss.inputs["Color"].default_value = (1.0, 0.90, 0.80, 1)

    # --- what the CAMERA sees: a flat paper-white sweep -------------------
    seen = n_new(N, "ShaderNodeBackground", (-120, 160))
    seen.inputs["Color"].default_value = (*bg, 1)
    seen.inputs["Strength"].default_value = BGSTR if bg_strength is None else bg_strength

    lp = n_new(N, "ShaderNodeLightPath", (-120, 420))
    gmix = n_new(N, "ShaderNodeMixShader", (120, -300))
    L.new(lp.outputs["Is Glossy Ray"], gmix.inputs[0])
    L.new(lit.outputs[0], gmix.inputs[1])    # diffuse / ambient lighting
    L.new(gloss.outputs[0], gmix.inputs[2])  # what mirrors see
    mix = n_new(N, "ShaderNodeMixShader", (380, 0))
    L.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    L.new(gmix.outputs[0], mix.inputs[1])
    L.new(seen.outputs[0], mix.inputs[2])    # what the camera sees
    L.new(mix.outputs[0], out.inputs["Surface"])
    return w


def add_point_lights(positions, energy=55.0, colour=(1.0, 0.55, 0.22),
                     radius=0.22, name="Lamp"):
    obs = []
    for i, p in enumerate(positions):
        ld = bpy.data.lights.new(f"{name}{i}", 'POINT')
        ld.energy = energy
        ld.color = colour
        ld.shadow_soft_size = radius
        o = bpy.data.objects.new(f"{name}{i}", ld)
        bpy.context.scene.collection.objects.link(o)
        o.location = tuple(p)
        obs.append(o)
    return obs


# ============================================================================
#  SUN CARD -- a warm emitter the WATER can reflect but the camera cannot see.
#  This is what puts the sunset streak across the pond in the reference.
# ============================================================================
def add_sun_card(direction=(0.10, -0.95, -0.25), dist=46.0, size=8.5,
                 colour=(1.0, 0.58, 0.24), strength=34.0, name="SunCard"):
    d = Vector(direction).normalized()
    pos = -d * dist
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=size * 0.5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = pos
    ob.rotation_euler = (-d).to_track_quat('Z', 'Y').to_euler()
    m = bpy.data.materials.new(name)
    t, N, L = nt(m)
    N.remove(N["Principled BSDF"])
    e = n_new(N, "ShaderNodeEmission", (-200, 0))
    e.inputs["Color"].default_value = (*colour, 1)
    co = n_new(N, "ShaderNodeTexCoord", (-900, -160))
    gr = n_new(N, "ShaderNodeTexGradient", (-700, -160))
    gr.gradient_type = 'SPHERICAL'
    mp = n_new(N, "ShaderNodeMapping", (-820, -160))
    mp.inputs["Location"].default_value = (-0.5, -0.5, 0.0)
    L.new(co.outputs["Generated"], mp.inputs["Vector"])
    L.new(mp.outputs["Vector"], gr.inputs["Vector"])
    pw = n_new(N, "ShaderNodeMath", (-520, -160), operation='POWER')
    L.new(gr.outputs["Fac"], pw.inputs[0])
    pw.inputs[1].default_value = 2.0
    mul = n_new(N, "ShaderNodeMath", (-360, -160), operation='MULTIPLY')
    L.new(pw.outputs[0], mul.inputs[0])
    mul.inputs[1].default_value = strength
    L.new(mul.outputs[0], e.inputs["Strength"])
    L.new(e.outputs[0], N["Material Output"].inputs["Surface"])
    ob.data.materials.append(m)
    for attr in ("visible_camera", "visible_shadow", "visible_diffuse"):
        if hasattr(ob, attr):
            setattr(ob, attr, False)
    ob.visible_glossy = True
    return ob


# ============================================================================
#  RECTANGULAR-SECTION BEAM SWEEP  (torii lintels, fence rails, steps)
# ============================================================================
def beam(mb, pts, widths, heights, mid=0, smooth=False, roll=0.0):
    """sweep a rectangle along a polyline -- square timber, not tube"""
    fr = _frames(pts)
    rings = []
    n0 = len(mb.v)
    for i, (p, w, h) in enumerate(zip(pts, widths, heights)):
        t, n, b = fr[i]
        # keep the beam's "up" as close to world Z as the frame allows
        up = Vector((0, 0, 1))
        side = t.cross(up)
        if side.length < 1e-4:
            side = Vector(n)
        side.normalize()
        up = side.cross(t).normalized()
        if roll:
            c, s = math.cos(roll), math.sin(roll)
            side, up = side * c + up * s, up * c - side * s
        ring = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            v = Vector(p) + side * (sx * w * 0.5) + up * (sy * h * 0.5)
            ring.append(len(mb.v))
            mb.v.append(tuple(v))
        rings.append(ring)
    for i in range(len(rings) - 1):
        a, c = rings[i], rings[i + 1]
        for k in range(4):
            kk = (k + 1) % 4
            mb.f.append((a[k], c[k], c[kk], a[kk]))
            mb.m.append(mid)
            mb.sm.append(smooth)
    mb.f.append(tuple(reversed(rings[0])))
    mb.m.append(mid); mb.sm.append(smooth)
    mb.f.append(tuple(rings[-1]))
    mb.m.append(mid); mb.sm.append(smooth)
    return n0


# ============================================================================
#  TORII GATE
#  two battered pillars, a curved upturned kasagi, a straight nuki,
#  a central shingaku tablet and a lantern slung under the crossbeam
# ============================================================================
def build_torii(mb_wood, mb_metal, mb_glass, centre, facing=0.0,
                height=4.1, span=3.0, scale=1.0):
    """returns the world position of the hanging lantern"""
    cx, cy = centre[0], centre[1]
    base_z = ground(cx, cy)
    H = height * scale
    S = span * scale
    ax = Vector((math.cos(facing), math.sin(facing), 0))     # gate opening axis
    sd = Vector((-ax.y, ax.x, 0))                            # along the lintel

    # ---- pillars: battered (leaning slightly inward), tapering upward -----
    r0 = 0.21 * scale
    for sgn in (-1, 1):
        foot = Vector((cx, cy, base_z - 0.25)) + sd * (sgn * S * 0.5)
        head = Vector((cx, cy, base_z + H)) + sd * (sgn * (S * 0.5 - 0.10 * scale))
        pts = [foot.lerp(head, k / 6.0) for k in range(7)]
        radii = [r0 * (1.18 - 0.30 * (k / 6.0)) for k in range(7)]
        mb_wood.tube([tuple(p) for p in pts], radii, 12, mid=0)
        # base stone collar
        mb_wood.box(tuple(foot + Vector((0, 0, 0.30))),
                    (r0 * 3.0, r0 * 3.0, 0.24), mid=1)

    # ---- nuki: the straight tie-beam, protruding past the pillars --------
    zn = base_z + H * 0.74
    a = Vector((cx, cy, zn)) - sd * (S * 0.5 + 0.42 * scale)
    b = Vector((cx, cy, zn)) + sd * (S * 0.5 + 0.42 * scale)
    beam(mb_wood, [tuple(a), tuple(b)],
         [0.19 * scale] * 2, [0.30 * scale] * 2, mid=0)

    # ---- kasagi: curved top lintel with upturned ends --------------------
    zk = base_z + H
    N = 21
    pts, ws, hs = [], [], []
    half = S * 0.5 + 0.95 * scale
    for k in range(N):
        f = k / (N - 1)
        u = (f - 0.5) * 2.0                       # -1 .. 1
        p = Vector((cx, cy, zk)) + sd * (u * half)
        p.z += (0.34 * u * u + 0.10) * scale      # sagi -- the upward sweep
        pts.append(tuple(p))
        ws.append(0.26 * scale * (1 - 0.22 * abs(u)))
        hs.append(0.22 * scale * (1 - 0.30 * abs(u) ** 2))
    beam(mb_wood, pts, ws, hs, mid=0, smooth=True)
    # shimaki: the slimmer beam tucked under the kasagi
    pts2 = [(x, y, z - 0.20 * scale) for x, y, z in pts]
    beam(mb_wood, pts2, [w * 0.80 for w in ws], [h * 0.55 for h in hs],
         mid=0, smooth=True)

    # ---- shingaku: the small tablet between nuki and kasagi ---------------
    zt = (zn + zk) * 0.5 + 0.12 * scale
    mb_wood.box((cx, cy, zt), (0.10 * scale, 0.46 * scale, 0.52 * scale),
                rot=Matrix.Rotation(facing, 3, 'Z'), mid=0)

    # ---- hanging lantern under the nuki ----------------------------------
    lz = zn - 0.62 * scale
    mb_metal.tube([(cx, cy, zn - 0.14 * scale), (cx, cy, lz + 0.30 * scale)],
                  [0.022 * scale] * 2, 5, mid=0)
    mb_glass.blob((cx, cy, lz), 0.30 * scale, scale=(1.0, 1.0, 1.22),
                  squash=0.05, seed=3, mid=0, subd=2)
    mb_metal.box((cx, cy, lz + 0.36 * scale),
                 (0.40 * scale, 0.40 * scale, 0.07 * scale),
                 rot=Matrix.Rotation(facing, 3, 'Z'), mid=0)
    mb_metal.box((cx, cy, lz - 0.34 * scale),
                 (0.32 * scale, 0.32 * scale, 0.06 * scale),
                 rot=Matrix.Rotation(facing, 3, 'Z'), mid=0)
    return Vector((cx, cy, lz))


def build_steps(mb, start, end, n=4, width=1.5, mid=1):
    """a short flight of stone slabs climbing toward the gate"""
    a, b = Vector(start), Vector(end)
    for i in range(n):
        f = (i + 0.5) / n
        p = a.lerp(b, f)
        z = ground(p.x, p.y) + 0.05 + 0.055 * i
        ang = math.atan2((b - a).y, (b - a).x)
        mb.box((p.x, p.y, z),
               ((b - a).length / n * 1.05, width * (1 - 0.05 * i), 0.16),
               rot=Matrix.Rotation(ang, 3, 'Z'), mid=mid)


# ============================================================================
#  DIRT PATH  -- a worn track across the sward (island 2)
# ============================================================================
def mat_dirt():
    m = bpy.data.materials.new("Dirt")
    t, N, L = nt(m)
    b = N["Principled BSDF"]
    co = n_new(N, "ShaderNodeTexCoord", (-1200, 0))
    nz = noise_node(N, L, co.outputs["Object"], 9.0, 8.0, 0.62, (-950, 0))
    rp = ramp(N, L, nz.outputs["Fac"], [
        (0.28, (0.400, 0.320, 0.235, 1)),
        (0.52, (0.560, 0.470, 0.352, 1)),
        (0.76, (0.720, 0.630, 0.490, 1)),
    ], (-700, 0))
    L.new(rp.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    bump = n_new(N, "ShaderNodeBump", (-420, -220))
    bump.inputs["Strength"].default_value = 0.3
    L.new(nz.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def mat_wisteria():
    return mat_foliage("Wisteria", [
        (0.18, (0.520, 0.430, 0.700, 1)),
        (0.44, (0.680, 0.600, 0.850, 1)),
        (0.70, (0.800, 0.740, 0.930, 1)),
        (0.90, (0.900, 0.870, 0.970, 1)),
    ], rough=0.9, trans=0.55)


# ============================================================================
#  FLOWERING RIM SHRUBS  -- the cushions of blossom that fringe both islands
# ============================================================================
def build_rim_shrubs(mb_leaf, mb_bloom, rnd, n_clusters=30, per=(5, 14),
                     inset=(0.90, 1.00), bloom_chance=0.45):
    for c in range(n_clusters):
        a0 = rnd.uniform(0, 2 * math.pi)
        cluster_r = rnd.uniform(0.40, 1.45)
        if rnd.random() < 0.22:      # gaps in the fringe
            continue
        for _ in range(rnd.randint(*per)):
            a = a0 + rnd.gauss(0, 0.075)
            rr = rim_radius(a) * rnd.uniform(*inset)
            x = math.cos(a) * rr + rnd.uniform(-0.3, 0.3)
            y = math.sin(a) * rr + rnd.uniform(-0.3, 0.3)
            z = ground(x, y)
            s = rnd.uniform(0.16, 0.34) * cluster_r
            mb_leaf.blob((x, y, z + s * 0.55), s, scale=(1.35, 1.35, 0.85),
                         squash=0.55, seed=rnd.uniform(0, 70), mid=0, subd=2)
            if rnd.random() < bloom_chance:
                mb_bloom.blob((x + rnd.uniform(-.18, .18),
                               y + rnd.uniform(-.18, .18),
                               z + s * 1.05), s * rnd.uniform(0.30, 0.52),
                              scale=(1.5, 1.5, 0.55), squash=0.30,
                              seed=rnd.uniform(0, 70), mid=0, subd=1)
