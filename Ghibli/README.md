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
