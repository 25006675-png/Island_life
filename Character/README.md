# Leaf gardener

Open `leaf_gardener.blend` in Blender 5.2. The scene opens in the portrait camera view. Press F12 to render.

The character follows `Screenshot 2026-09-09 215218.png`; a copy of that image is packed into the blend file. The watering tool is omitted. The unseen back is an interpretation of the reference.

The model includes thick sculpted cap leaves, modeled central and branching leaf veins, a two-leaf crown sprout, a golden bob with seamlessly merged sides, an ovoid head with a curved jaw and soft chin, integrated cheek pads, recessed eye sockets, subtle brow and temple transitions, glossy eyes, vertex-colored cheek blush, small freckles, cream sleeves and cuffs, a petal collar, continuous green overalls, shoulder straps, button holes and thread, a dimensional sprout pocket, garment seams, and rubber boots with cuffs, heel tabs and sole treads.

The latest face is rebuilt from an ovoid skull and individual facial contours, replacing the previous rounded-box head. Unified hair framing and the brighter green hat are retained. Earlier models and portraits are saved with the `_v1` and `_v2` suffixes.

Objects are organized into six character collections and a separate studio collection. Move **LEAF GARDENER • character root** to reposition the character. Materials are procedural; no external textures are required. Leaf thickness and subdivision modifiers remain editable.

This is an unrigged high-detail presentation model. It has no animation rig, game-ready retopology, or animation UV layout. Overlapping separate parts are intentional construction details; the entire character is not one watertight printable mesh.

Deliverables:

- `leaf_gardener.blend` — native editable model, packed reference, lights, and five cameras.
- `leaf_gardener.png` — final 1800 × 2160 portrait render.
- `leaf_gardener_front.png` and `leaf_gardener_back.png` — alternate review views.
- `leaf_gardener_side.png` — profile review.
- `leaf_gardener_face.png` — close three-quarter view of the facial contours.
- `create_leaf_gardener.py` — reproducible Blender generation script.
- `geometry_review.json` — evaluated geometry counts and validation results.

Rebuild from PowerShell:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --python 'C:/Documents/Island life/Character/create_leaf_gardener.py'
```

Append `-- --preview` for the smaller preview. Rebuilding replaces the generated blend and render in this folder; save manual edits under another filename first.
