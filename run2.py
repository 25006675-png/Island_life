# -*- coding: utf-8 -*-
"""Island 2 -- the square meadow island with the torii gate.

    blender -b -P run2.py -- [--engine EEVEE|CYCLES] [--samples N] [--res N]
                            [--out path.png] [--save scene.blend]

Reference: 6319d8cc-d786-4b21-a9a2-a9cf99b65540.png
Only the arch is built; the props on the sward (hammock, washing line,
picnic set) are deliberately left out.
"""
import bpy, os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, "island_build.py"), encoding="utf-8").read(),
             "island_build.py", "exec"))

# ---- member islands: dry meadow, irregular outline, deep keel -------------
POND_ON  = False
VARIANT  = argval("--variant", 0, int)   # 0,1,2 -> one outline per member
SQUIRCLE = 2.7           # rounded, not square
R0       = 13.0          # ~24% larger than the old 10.5 -- room for ~30 plantings
KEEL     = 1.02          # tapers to a ridge, as in the reference
RIM_WOBBLE  = 0.13       # broad lobes
RIM_WOBBLE2 = 0.055      # finer bays and headlands
RIM_SEED = 0.7 + 3.1 * VARIANT
GRASS_Z  = 0.35
CLIFF_DEEP = 1.35        # island 2 sits on a deeper block

TORII_AT = (-5.4, 5.0)
TORII_FACING = math.radians(-42.0)


def build_all():
    wipe()
    sc = bpy.context.scene
    rnd = random.Random(1717 + 101 * VARIANT)

    # ---------------- landmass ----------------
    island, outline, rim_xy = build_island()
    assign(island, mat_grass(), mat_rock())
    link(island, "Island")

    # ---------------- torii gate + its approach steps ----------------
    mbw, mbm, mbg, mbs = MB(), MB(), MB(), MB()
    lantern = build_torii(mbw, mbm, mbg, TORII_AT, facing=TORII_FACING,
                          height=4.3, span=3.1, scale=1.0)
    ap = Vector((math.cos(TORII_FACING), math.sin(TORII_FACING), 0))
    build_steps(mbs, (TORII_AT[0] - ap.x * 2.6, TORII_AT[1] - ap.y * 2.6),
                (TORII_AT[0] - ap.x * 0.5, TORII_AT[1] - ap.y * 0.5),
                n=4, width=2.0, mid=0)
    torii = mbw.emit("Torii")
    assign(torii, mat_wood(), mat_stone())
    link(torii, "Props")
    for ob, mt in ((mbm.emit("ToriiMetal"), mat_metal()),
                   (mbg.emit("ToriiGlass"), mat_lantern_glass(6.0)),
                   (mbs.emit("ToriiSteps"), mat_stone())):
        assign(ob, mt)
        link(ob, "Props")
    add_point_lights([lantern], energy=26.0, radius=0.28)

    # ---------------- hanging creepers, incl. wisteria ----------------
    mb_vs, mb_vl = MB(), MB()
    build_vines(mb_vs, mb_vl, vine_clumps(rnd, n_clumps=12, per=(4, 9),
                                          spread=0.14), rnd)
    vs = mb_vs.emit("VineStems", mat_wood("VineStem", (0.30, 0.26, 0.16, 1),
                                          (0.42, 0.40, 0.24, 1)))
    vl = mb_vl.emit("VineLeaves")
    assign(vl, mat_vineleaf(), mat_wisteria())
    link(vs, "FX"); link(vl, "FX")

    # ---------------- floating debris ----------------
    mb_fr, mb_fg = MB(), MB()
    build_floating_rocks(mb_fr, mb_fg, rnd, n=14)
    fr = mb_fr.emit("FloatRock", mat_rock())
    fg = mb_fg.emit("FloatGrass", mat_tuft())
    link(fr, "FX"); link(fg, "FX")

    # ---------------- ground scatter ----------------
    mb_sr, mb_fl, mb_tu, mb_lp = MB(), MB(), MB(), MB()
    scatter_top(mb_sr, mb_fl, mb_tu, mb_lp, rnd)
    for ob, mt in ((mb_sr.emit("ScatterRocks"), mat_rock()),
                   (mb_fl.emit("Flowers"), mat_flower()),
                   (mb_tu.emit("Tufts"), mat_tuft())):
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
    setup_world_hdri(sc, "sunrise.exr", strength=AMB, rot=math.radians(59.5))
    return dict(island=island, torii=torii)


def main():
    build_all()
    sc = bpy.context.scene
    setup_render(sc, ENGINE, SAMPLES, RESX)
    fit_camera(sc.camera, sc, margin=1.06, axis='x',
               only={"Island"}, place_y=0.56)
    setup_compositor(sc)
    if SAVEBLEND:
        bpy.ops.wm.save_as_mainfile(filepath=SAVEBLEND)
    if "--norender" in argv:          # asset rebuilds only need the .blend
        print("SAVED", SAVEBLEND)
        return
    sc.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("WROTE", OUT)


main()
