# -*- coding: utf-8 -*-
"""Scene assembly + render driver.

    blender -b -P run.py -- [--engine EEVEE|CYCLES] [--samples N] [--res N]
                           [--out path.png] [--save scene.blend]
"""
import bpy, os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, "island_build.py"), encoding="utf-8").read(),
             "island_build.py", "exec"))

# ---- pond: sized so there is a continuous walkable shore all the way round.
# Measured: at the old 8.7 x 6.6 the shore pinched to 0.98 m at 158 deg, which
# is impassable at this scale (the bridges are 2 m wide). Shrinking 15% and
# recentring lifts the worst case to 2.53 m, mean 5.6 m.
POND_A, POND_B = 7.39, 5.61
POND_C         = (-1.9, -0.7)

# bridge / waterfall / vine placement, in radians around the rim
BRIDGES   = [-math.pi / 2, 0.0, math.pi, math.pi * 0.52]
FALLS     = [-1.38, -0.96, -2.42]
TREE_AT   = (6.2, 5.6, None)


def build_all():
    wipe()
    sc = bpy.context.scene
    rnd = random.Random(4242)

    # ---------------- landmass + water ----------------
    island, outline, rim_xy = build_island()
    assign(island, mat_grass(), mat_rock())
    link(island, "Island")

    water, pond_edge, pond_pt = build_water()
    assign(water, mat_water())
    link(water, "Island")

    # ---------------- the great tree ----------------
    torig = (TREE_AT[0], TREE_AT[1], ground(TREE_AT[0], TREE_AT[1]) + 0.55)
    tree, blobs, O = build_tree(origin=torig, scale=1.26)
    assign(tree, mat_bark())
    link(tree, "Tree")
    canopy = build_canopy(blobs)
    assign(canopy, mat_leaves())
    link(canopy, "Tree")

    # ---------------- stone plaza + paths ----------------
    mb_stone = build_plaza(torig, r_out=5.8, steps=3)
    front = rim_point(BRIDGES[0])
    right = rim_point(BRIDGES[1])
    path_ribbon(mb_stone, [
        (torig[0] - 4.0, torig[1] - 3.0), (2.2, -0.9), (0.6, -4.2),
        (front.x * 0.55, front.y * 0.62), (front.x * 0.86, front.y * 0.88)],
        width=1.45)
    path_ribbon(mb_stone, [
        (torig[0] + 1.2, torig[1] - 4.6), (7.4, -1.2),
        (right.x * 0.80, right.y * 0.8 - 0.6), (right.x * 0.93, right.y - 0.3)],
        width=1.25)
    plaza = mb_stone.emit("Plaza", mat_stone())
    link(plaza, "Props")

    # ---------------- bridges ----------------
    mbw, mbr, mbm, mbg, mbb = MB(), MB(), MB(), MB(), MB()
    lantern_pos = []
    for i, a in enumerate(BRIDGES):
        lantern_pos += build_bridge(mbw, mbr, mbm, mbg, mbb, a,
                                    out_len=4.2 + 0.5 * (i % 2), width=2.0)
    wood = mbw.emit("BridgeWood", mat_wood())
    rope = mbr.emit("BridgeRope", mat_rope())
    metal = mbm.emit("BridgeMetal", mat_metal())
    glass = mbg.emit("LanternGlass_", mat_lantern_glass())
    banner = mbb.emit("Banners", mat_banner())
    for o in (wood, rope, metal, glass, banner):
        link(o, "Props")
    add_point_lights(lantern_pos, energy=32.0)

    # ---------------- waterfalls ----------------
    mb_fall = MB()
    for a in FALLS:
        build_waterfall(mb_fall, a, drop=rnd.uniform(5.5, 8.5),
                        width=rnd.uniform(0.70, 1.25))
    falls = mb_fall.emit("Waterfalls", mat_waterfall())
    link(falls, "FX")

    # ---------------- hanging vines ----------------
    mb_vs, mb_vl = MB(), MB()
    vine_angles = vine_clumps(rnd, n_clumps=10, per=(3, 7), spread=0.13)
    build_vines(mb_vs, mb_vl, vine_angles, rnd)
    vs = mb_vs.emit("VineStems", mat_wood("VineStem", (0.30, 0.26, 0.16, 1),
                                          (0.42, 0.40, 0.24, 1)))
    vl = mb_vl.emit("VineLeaves")
    assign(vl, mat_vineleaf(), mat_flower())
    link(vs, "FX"); link(vl, "FX")

    # ---------------- floating debris ----------------
    mb_fr, mb_fg = MB(), MB()
    build_floating_rocks(mb_fr, mb_fg, rnd, n=20)
    fr = mb_fr.emit("FloatRock", mat_rock())
    fg = mb_fg.emit("FloatGrass", mat_tuft())
    link(fr, "FX"); link(fg, "FX")

    # ---------------- sky lanterns ----------------
    mb_sl = MB()
    spots = [(-8.5, -2.0, 12.0, 1.15), (-5.0, 1.5, 9.6, 0.95),
             (-2.2, 0.4, 7.6, 0.85), (-3.6, -4.0, 5.2, 0.9),
             (-6.8, -6.5, 4.0, 0.8), (0.4, 2.6, 6.4, 0.75)]
    slpos = build_sky_lanterns(mb_sl, rnd, spots)
    sl = mb_sl.emit("SkyLanterns", mat_skylantern())
    link(sl, "FX")
    add_point_lights(slpos, energy=14.0, colour=(1.0, 0.48, 0.20),
                     radius=0.35, name="SkyLamp")

    # ---------------- ground scatter ----------------
    mb_sr, mb_fl, mb_tu, mb_lp = MB(), MB(), MB(), MB()
    scatter_top(mb_sr, mb_fl, mb_tu, mb_lp, rnd)
    for ob, mt in ((mb_sr.emit("ScatterRocks"), mat_rock()),
                   (mb_fl.emit("Flowers"), mat_flower()),
                   (mb_tu.emit("Tufts"), mat_tuft()),
                   (mb_lp.emit("LilyPads"), mat_lilypad())):
        assign(ob, mt)
        link(ob, "Scatter")

    # ---------------- flowering rim shrubs ----------------
    mb_sh, mb_bl = MB(), MB()
    build_rim_shrubs(mb_sh, mb_bl, rnd, n_clusters=34, per=(6, 15))
    sh = mb_sh.emit("RimShrubs", mat_tuft())
    bl = mb_bl.emit("RimBlossom", mat_flower())
    link(sh, "Scatter"); link(bl, "Scatter")

    # ---------------- camera / light / world ----------------
    setup_camera(sc)
    setup_lights()
    # sunrise.exr's own sun (az 35.5, el 8.1) rotated to sit behind the
    # island -> it lights the scene AND lays the streak across the pond
    setup_world_hdri(sc, "sunrise.exr", strength=AMB, rot=math.radians(59.5))
    return dict(island=island, water=water, tree=tree, canopy=canopy)


def main():
    build_all()
    sc = bpy.context.scene
    setup_render(sc, ENGINE, SAMPLES, RESX)
    # measured off the reference: landmass + bridges span ~97% of the frame
    # width, their vertical centre sits 60% down, canopy runs off the top edge
    fit_camera(sc.camera, sc, margin=1.03, axis='x',
               only={"Island", "BridgeWood"}, place_y=0.60)
    setup_compositor(sc)
    if SAVEBLEND:
        bpy.ops.wm.save_as_mainfile(filepath=SAVEBLEND)
    sc.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("WROTE", OUT)


main()
