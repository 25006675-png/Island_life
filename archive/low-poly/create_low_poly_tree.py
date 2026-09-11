import bpy
import math
from mathutils import Vector


OUTPUT = r"C:\Documents\Island life\Low-poly\low_poly_purple_tree.blend"
RENDER = r"C:\Documents\Island life\Low-poly\low_poly_purple_tree.png"


def material(name, color, roughness=0.72):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


PURPLE = material("Foliage violet", (0.43, 0.16, 0.77))
LILAC = material("Foliage lilac", (0.62, 0.31, 0.90))
HIGHLIGHT = material("Foliage highlight", (0.76, 0.46, 0.96))
BARK = material("Faceted plum bark", (0.20, 0.09, 0.16))
GROUND = material("Warm gray", (0.24, 0.22, 0.22))


def cone_between(name, start, end, r1, r2, mat, vertices=7):
    start, end = Vector(start), Vector(end)
    delta = end - start
    midpoint = (start + end) / 2
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=r1, radius2=r2,
                                    depth=delta.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(delta.normalized())
    return obj


def lobe(name, location, scale, rotation, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=1, radius2=0.28,
                                    depth=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    obj.data.materials.append(mat)
    return obj


def foliage_tier(z, radius, depth, count, seed=0):
    # A broad, irregular crown made from low-poly lobes around a conical core.
    bpy.ops.mesh.primitive_cone_add(vertices=9, radius1=radius * 0.78,
                                    radius2=radius * 0.22, depth=depth,
                                    location=(0, 0, z))
    core = bpy.context.object
    core.name = "Faceted foliage core"
    core.data.materials.append(LILAC)

    for i in range(count):
        angle = 2 * math.pi * i / count + seed * 0.29
        r = radius * (0.57 + 0.12 * math.sin(i * 2.37 + seed))
        x, y = r * math.cos(angle), r * math.sin(angle)
        width = radius * (0.46 + 0.08 * math.cos(i * 1.91))
        lobe_mat = HIGHLIGHT if i in (1, 2) else (LILAC if i % 3 else PURPLE)
        lobe("Angular hanging foliage", (x, y, z - depth * 0.23),
             (width, width * 0.74, depth * 0.45),
             (0.15 * math.sin(angle), 0.2 * math.cos(angle), angle), lobe_mat)


# Reset scene.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Tapered trunk and the two visible fork systems.
cone_between("Main faceted trunk", (0, 0, 0), (0.03, 0, 4.85), 0.48, 0.19, BARK)
cone_between("Left lower branch", (0, 0, 1.5), (-0.56, 0.06, 2.55), 0.25, 0.10, BARK)
cone_between("Right lower branch", (0.03, 0, 2.05), (0.61, -0.04, 3.04), 0.20, 0.08, BARK)
cone_between("Left upper branch", (0.02, 0, 3.55), (-0.34, 0.04, 4.24), 0.15, 0.06, BARK)
cone_between("Right upper branch", (0.02, 0, 3.58), (0.36, -0.02, 4.34), 0.15, 0.06, BARK)

# Four tiers following the supplied reference's stepped silhouette.
foliage_tier(1.80, 1.44, 0.70, 8, 1)
foliage_tier(3.12, 1.31, 0.68, 8, 2)
foliage_tier(4.36, 0.92, 0.58, 7, 3)
foliage_tier(5.38, 0.54, 0.90, 6, 4)

# Ground, camera, and soft studio lighting.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.48))
plane = bpy.context.object
plane.name = "Studio ground"
plane.data.materials.append(GROUND)

bpy.ops.object.light_add(type='AREA', location=(4.2, -4.0, 7.2))
key = bpy.context.object
key.name = "Large soft key"
key.data.energy = 900
key.data.shape = 'DISK'
key.data.size = 5

bpy.ops.object.light_add(type='AREA', location=(-4.0, 2.0, 4.0))
fill = bpy.context.object
fill.data.energy = 300
fill.data.size = 4

bpy.ops.object.camera_add(location=(8.2, -10.2, 6.3))
camera = bpy.context.object
camera.name = "Reference camera"
bpy.context.scene.camera = camera
target = Vector((0, 0, 2.75))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.lens = 57

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 900
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = RENDER
scene.world.color = (0.055, 0.045, 0.07)
scene.view_settings.look = 'AgX - Medium High Contrast'

bpy.ops.wm.save_as_mainfile(filepath=OUTPUT)
bpy.ops.render.render(write_still=True)
