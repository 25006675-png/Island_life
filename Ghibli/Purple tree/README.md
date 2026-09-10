# Ghibli purple tree

**Chosen version: `ghibli_purple_tree.blend` / `.png`** — the three-parasol build from the
v3 era (saved 9 Sep, 22:04). Picked by the user over v6/v7, and it's the one
`tools/export_assets.py` exports as `purple.glb`. No script regenerates it exactly, so treat the
`.blend` as the source.

Reference: `c0ec40e8-1b70-46ed-9d95-3ceae3f08f49.png`

## Rebuild

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --python create_ghibli_tree_v6.py
```

Self-contained — no textures or downloaded assets. ~18s, 854 individually placed leaf objects,
grouped into collections for trunk / lower / middle / top canopy / studio.

## Version history

| | notes |
|---|---|
| v1–v3 | earlier session: leaf shape and canopy massing passes |
| v4 | heavier trunk, dome crowns, emissive cream backdrop. Over-lit ~3x |
| v5 | switched AgX → Standard view transform; AgX was desaturating foliage to grey (median rgb 192,182,207 vs reference 121,113,205). All palette values sampled off the reference as sRGB and converted to linear |
| **v6** | tier heights/radii/stacking measured off the reference so the crowns read as three separate parasols; bark ramp lifted ~40%; foliage biased brighter. **Keeper** |
| v7 | added a bare cone spire to the top tier and pulled the tone back down. Spire reads too sharp//traffic-cone; superseded by the v6 look |

## Notes for the next pass, if any

Measured against the reference (via 512px percentile sampling of foliage/trunk pixels):

* v6 foliage is brighter and pinker than the reference — median `(187,140,214)` vs `(121,113,205)`.
  The reference's mid-tone body colour is a *more saturated blue-violet* than either its shadows
  or its highlights, which a simple light→dark ramp doesn't reproduce.
* v6 trunk tone is a good match: `(116,90,89)` vs reference `(124,102,93)`.
* Background and framing match exactly: `#ebe2d6`, subject bbox 248×467 vs reference 241×480.

`create_ghibli_tree_v7.py` already contains a re-derived blue-violet ramp if that's worth
revisiting — it just also carries the spire change, which isn't wanted.
