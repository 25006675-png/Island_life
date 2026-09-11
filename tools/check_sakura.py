"""Check that sakura blossoms sit outside and face away from their lobed cores.

Run: blender -b "Ghibli/Sakura tree/ghibli_sakura.blend" --python tools/check_sakura.py
"""
import ast
from pathlib import Path

import bpy
from mathutils import Vector

source = Path(__file__).resolve().parents[1] / 'Ghibli/Sakura tree/create_sakura.py'
tree = ast.parse(source.read_text())
clusters = next(ast.literal_eval(node.value) for node in tree.body
                if isinstance(node, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == 'CLUSTERS' for t in node.targets))

count = 0
failures = []
clearances = []
for seed, (_, _, _, radius, n) in enumerate(clusters):
    core = bpy.data.objects['Cluster core %d' % seed]
    inverse = core.matrix_world.inverted()
    normal_matrix = inverse.to_3x3().transposed()
    for _ in range(int(n * .75)):
        blossom = bpy.data.objects['Blossom %04d' % count]
        assert blossom['cluster_seed'] == seed
        origin = blossom.matrix_world.translation
        actual = (blossom.matrix_world.to_3x3().inverted().transposed()
                  @ blossom.data.vertices[0].normal).normalized()
        # Check against the actual lobed mesh, rather than assuming a sphere.
        hit, point, normal, _ = core.ray_cast(
            inverse @ origin, (inverse.to_3x3() @ -actual).normalized())
        if not hit:
            failures.append(blossom.name + ': misses core')
        else:
            outward = (normal_matrix @ normal).normalized()
            clearance = (origin - core.matrix_world @ point).length / radius
            clearances.append(clearance)
            # Inward-facing flowers hit the far wall; buried ones have no
            # exterior clearance. Allow local slope changes across each lobe.
            if actual.dot(outward) < .50 or not .03 < clearance < .35:
                failures.append(blossom.name + ': buried or facing inward')
        count += 1

assert not failures, '%d/%d invalid blossoms: %s' % (
    len(failures), count, ', '.join(failures[:8]))
print('PASS: all %d blossoms face out from their lobed cores; clearance %.3f-%.3f' % (
    count, min(clearances), max(clearances)))
