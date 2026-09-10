# Ghibli asset series

Six painterly 3D props, each built from a self-contained Blender Python script.
No textures, no downloaded assets — every shape is generated, every colour is
sampled off the matching `reference.png`.

## Building

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python <script>
```

| Asset | Script | Render time | Pieces |
|---|---|---|---|
| [Purple tree](Purple%20tree/) | `create_ghibli_tree_v6.py` | ~18 s | 854 leaves |
| [Mushroom cluster](Mushroom%20cluster/) | `create_mushrooms.py` | ~21 s | 4 caps, 81 flecks |
| [Clover patch](Clover%20patch/) | `create_clover.py` | ~36 s | ~1,100 blades and leaflets |
| [Coral palm](Coral%20palm/) | `create_palm.py` | ~21 s | 320 pinnae, 114 trunk plates |
| [Golden oak](Golden%20oak/) | `create_oak.py` | ~36 s | 3,125 leaves in 12 clusters |
| [Sakura tree](Sakura%20tree/) | `create_sakura.py` | ~40 s | 3,296 blossoms, 16 falling petals |
| [Pale tree](Pale%20tree/) | `create_pale_tree.py` | ~25 s | 593 branch tubes, 14 motes |
| [Blue willow](Blue%20willow/) | `create_willow.py` | ~35 s | 3,623 leaves on 159 strands |
| [Sage topiary](Sage%20topiary/) | `create_topiary.py` | ~30 s | 2,316 leaves in 19 puffs, 4 mushrooms |
| [Magic mushrooms](Magic%20mushrooms/) | `create_magic_mushrooms.py` | ~30 s | 3 tree-sized amanitas on one root mound, glowing gills and spots |

Each script saves a `.blend` alongside its `.png`, with objects sorted into
named collections (trunk / canopy / studio) so anything can be re-posed by hand.

## `_common/`

`ghibli_studio.py` is the shared rig — all five newer assets import it. The
references are one photographic series, so they share a studio: flat warm-cream
ground (`#eee5da`), soft near-uniform light, orthographic camera.

Key pieces:

* `srgb()` — the colour convention. Every palette value in the series is an
  sRGB byte triple **sampled off the reference image**, converted to linear.
* `ramp()` / `pick()` — a light→dark material ramp; assets choose an entry per
  object from a computed "exposure". This is what carries the painted look:
  form comes from the chosen shade, not only from the lighting.
* `grad()` / `paint()` / `vcol_material()` — the continuous equivalent, writing
  smooth per-vertex colour. Use these for large smooth surfaces.
* `tube()` — swept tube for every trunk, limb and stem, shaded by how each face
  turns to the key light.
* `blade()` + outline helpers — flat curved blades for leaves, petals, grass
  and frond leaflets.
* `studio()` / `render()` — the backdrop, lights, camera and output settings.

`probe.py` measures a render against its reference — background colour, subject
bounding box, and dominant colours by k-means:

```
python _common/probe.py "Golden oak/reference.png" "Golden oak/ghibli_oak.png" -k 6
```

Every asset here was matched numerically with it rather than by eye, which is
how the framing and palettes line up as closely as they do.

## Things learned the hard way

These cost several rebuilds each; they are the notes worth keeping.

* **Use the `Standard` view transform, not AgX.** AgX desaturates these flat
  illustration palettes badly — the purple tree's foliage came out at a median
  of `(192,182,207)` against the reference's `(121,113,205)`, near grey. Under
  `Standard`, authored sRGB values render back close to what was sampled.
* **The backdrop is a pure Emission plane.** Emission ignores shading, so it
  renders as an exact flat colour and catches no contact shadow — which is what
  the references show.
* **Per-face material picking stair-steps on smooth surfaces.** Fine for a
  canopy of individually flat-coloured leaves; visibly blocky across a mushroom
  cap. Use `paint()` there instead.
* **Anything periodic in the polar angle reads as ribbing.** The first mushroom
  caps looked like pumpkins. Drive mottling from 2D noise (`lump()`) instead.
* **Scatter leaves *tangent* to a cluster, not radially.** Radial leaves bristle
  outward and leave the core sphere visible between them; tangent ones blanket
  it. This was the single biggest fix on the oak.
* **Plates on a cylinder must be swept about its axis.** A flat plate wide
  enough to read will poke out at its edges — the palm trunk went through three
  attempts before this.
* **Measure the reference's ellipses to recover its camera.** The mushroom cap
  rim gives minor/major = 0.33, i.e. ~19° elevation. Much better than guessing.

## Per-asset notes

**Purple tree** — predates `_common/` and is standalone; `create_ghibli_tree_v6.py`
carries its own copy of the rig. See [its README](Purple%20tree/README.md) for the
v1–v7 history and the two places it still differs from its reference.

**Mushroom cluster** — sizes come from the big cap's radius being 0.37× the
cluster height. Cap spots are separate discs whose rims are painted to the local
cap colour, so their edges dissolve instead of reading as pasted-on stickers.

**Clover patch** — everything is small: leaflet ~0.35 units, blue flower ~0.28
across, against a 4.6-unit patch. The first attempt had them ~3× oversize. The
bed mesh is deliberately smaller than the planting so no bare ground shows.

**Coral palm** — trunk plates are swept about the trunk axis and span a little
over their 1/6 share of the circumference, so neighbours overlap without
standing proud of the silhouette.

**Golden oak** — the canopy is twelve overlapping cluster spheres, not one mass;
that is what produces the reference's cauliflower silhouette.

**Sakura** — blossoms are five-lobed rosettes generated as single flat meshes
(`rosette()`). Clusters are kept small and gappy on purpose so the recursive
branch work shows through, which the reference makes a feature of.
A later pass cleaned up a "dirty" look. Blossoms had jumped several shades
apart from ±.12 exposure jitter and ±.34 rosette tilt, which faced some into
the key and blew them out to white stickers. The ramp had also run on to a
crimson darker than anything in the reference. Now the ramp follows the
reference's own pinks nudged bluer against the warm key, with a narrow
exposure range. The bole continues up into the fork, where ending it flat had
left a collar, and branch end caps are deleted.
A third pass made the clusters round (now 2,556 blossoms: 1,530 read too sparse). A shell
of flat outward-facing rosettes reads as a box: at the outline each one is
edge-on, a straight line about 0.7× the cluster radius long, and the top ones
make a flat lid. Now the round form comes from a painted core ball (a vertex
colour gradient), and deeply cupped rosettes sit on its surface as petal
detail, wrapping well under the ball. Rosette size is the balance point: at
.22-.33 of the cluster radius the canopy read sparse, and at .28-.40 the
clusters squared off again. It's set at .25-.36.

The last three are the PRODUCT.md species for Other, Rest and Errands. Their
positions are laid out in the reference's pixel space at 150 px per unit, so
all three use ortho scale 8.36.

**Pale tree** (Other) — two trunks braided about a shared axis, then recursive
antler forks that open in each limb's own vertical plane. All wood is
repainted with smooth vertex colour after building: per-face shade picking
turned the dense braided trunk into a pixel mosaic. Branch end caps are
deleted, because smooth shading averaged each cap into its last ring and drew a
pale band at every joint. The motes are emission spheres with a facing-falloff
halo that fakes bloom; the halos are render-only and would need dropping from
a browser export.

**Blue willow** (Rest) — the first build dressed core spheres in closed rings
of straight curtains and read as heavy blue cylinders. Now each strand is a
fountain curve (`droop()`): its heading relaxes exponentially from upward to
straight down, so it arcs over and falls. Strands start at different depths
inside the lobe, and there are no core spheres, so the canopy stays
see-through. Hem lengths vary by about ±0.9 units and leaves taper toward the
tips. Leaves are forced to hang even where the strand rises. There are no
branchlet tubes: leaves hang below the path, so the arch always poked out.

**Sage topiary** — three trunks with an oak-style puff canopy each (tangent
leaves on hidden core spheres), with sprigs and painted mushroom caps at the
foot. Built for Errands, then replaced there by the magic mushrooms.

**Magic mushrooms** (Errands) — the mushroom cluster's amanitas at tree
proportions: stems far taller than the caps are wide. At first there were five
separate stems, which read as several things. Now three stems lean their feet
in to one shared root mound, so each planting reads as a single organism. The gills are radial ridges painted into vertex
colour, so the underside needs 144 segments. Both gills and cap spots use a
Principled material that emits its own vertex colour. Spot emission above
about 1 blows them out to white, and they read as holes in the cap. The camera
looks slightly up so the gills show. With an ortho camera the lower frame then
starts below the floor, so the floor is hidden from the camera and a
camera-only cream wall stands behind instead. The original Mushroom cluster is
untouched: it still serves the Foraging groves.
