# -*- coding: utf-8 -*-
"""Scene assembly + render driver.

    blender -b -P run.py -- [--engine EEVEE|CYCLES] [--samples N] [--res N]
                           [--out path.png] [--save scene.blend]
"""
import bpy, os, sys, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
exec(compile(open(os.path.join(HERE, "island_build.py"), encoding="utf-8").read(),
             "island_build.py", "exec"))

# ---- pond: in the middle of the island, tucked against the gathering tree's
# plaza. A short jetty leaves the plaza side and giant lily pads step out to a
# small round deck; a little footbridge from the far shore is the second way
# on. The web scene's photo lanterns float over the deck. Its bridges leave
# this island at 150, 10 and 300 degrees (Blender frame).
POND_C         = (-2.0, -1.8)
POND_A, POND_B = 4.4, 3.4
POND_ROT       = math.radians(-48)    # long axis perpendicular to the tree
POND_BEND      = 0.0
LILY_PADS      = 18           # keep the water open; the pad steps carry the look
PU =(math.cos(POND_ROT), math.sin(POND_ROT))    # long axis
PV = (-PU[1], PU[0])                              # short axis, toward the tree
DECK_V, DECK_R = -1.0, 1.3    # deck centre (short-axis offset) and radius
WALK_Z = 0.24                 # jetty / pad / deck tops: above the 0.17 the web scene treats as water


def pond_at(u, v):
    """u along the pond's long axis, v along its short axis (toward the tree)"""
    return (POND_C[0] + PU[0] * u + PV[0] * v, POND_C[1] + PU[1] * u + PV[1] * v)


def build_pond_walk(mb_jetty, mb_pads, mb_deck):
    rot = Matrix.Rotation(math.atan2(PV[1], PV[0]), 3, 'Z')
    # jetty: planks from the plaza side out over the bank, on two pilings
    for k in range(6):
        mb_jetty.box((*pond_at(0, 4.45 - k * 0.3), WALK_Z - 0.03), (0.26, 1.35, 0.1), rot=rot)
    for u in (-0.55, 0.55):
        x, y = pond_at(u, 3.0)
        mb_jetty.tube([(x, y, -0.5), (x, y, WALK_Z - 0.06)], [0.08, 0.08], 8)
    # giant lily pads curving from the jetty to the deck; they overlap so the
    # web scene's height field reads them as one walkable chain
    p0, p1, p2 = pond_at(0, 2.55), pond_at(1.5, 0.9), pond_at(0, DECK_V + DECK_R * 0.85)
    for i in range(5):
        t = i / 4
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        mb_pads.blob((x, y, WALK_Z - 0.03), 0.62 + 0.05 * math.sin(i * 2.3),
                     scale=(1.0, 1.0, 0.10), squash=0.2, seed=i * 5.1, mid=0, subd=2)
    # the deck: round, planked, with a rim and two little lanterns
    dc = pond_at(0, DECK_V)
    for k in range(9):
        o = -DECK_R + (k + 0.5) * (2 * DECK_R / 9)
        w = 2 * math.sqrt(max(0.0, DECK_R ** 2 - o ** 2))
        mb_deck.box((dc[0] + PV[0] * o, dc[1] + PV[1] * o, WALK_Z - 0.04),
                    (2 * DECK_R / 9 * 0.92, w, 0.12), rot=rot)
    rim = [(dc[0] + math.cos(a) * DECK_R, dc[1] + math.sin(a) * DECK_R, WALK_Z + 0.02)
           for a in (2 * math.pi * k / 40 for k in range(41))]
    mb_deck.tube(rim, [0.06] * len(rim), 6, cap=False)
    # second way on: a little arched footbridge from the far shore; planks
    # overlap so the height field never finds a gap between them
    for k in range(8):
        f = k / 7
        mb_jetty.box((*pond_at(0, DECK_V - DECK_R * 0.8 - k * 0.3), WALK_Z - 0.03 + 0.14 * math.sin(math.pi * f)),
                     (0.32, 1.2, 0.1), rot=rot)


def build_reeds(mb_reed, mb_head, rnd):
    # clumps at the waterline, clear of the jetty (t = pi/2)
    for t in (0.25, 2.45, 3.95, 5.5):
        lo, hi = 0.3, 1.7
        for _ in range(20):
            mid = (lo + hi) / 2
            if pond_sd(*pond_at(math.cos(t) * POND_A * mid, math.sin(t) * POND_B * mid)) < 0: lo = mid
            else: hi = mid
        cx, cy = pond_at(math.cos(t) * POND_A * lo * 0.97, math.sin(t) * POND_B * lo * 0.97)
        for _ in range(rnd.randint(5, 8)):
            x, y = cx + rnd.uniform(-0.4, 0.4), cy + rnd.uniform(-0.4, 0.4)
            h, lx, ly = rnd.uniform(0.7, 1.35), rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2)
            pts = [(x + lx * f * f, y + ly * f * f, WATER_Z - 0.1 + h * f) for f in (0, 0.35, 0.7, 1)]
            mb_reed.tube(pts, [0.03, 0.026, 0.02, 0.008], 5)
            if rnd.random() < 0.45:
                hx, hy, hz = pts[2]
                mb_head.blob((hx, hy, hz + 0.05), 0.055, scale=(1, 1, 3.0), seed=rnd.uniform(0, 30), subd=1)


def build_lotus(mb, rnd, n=4):
    placed = tries = 0
    while placed < n and tries < 400:
        tries += 1
        t, f = rnd.uniform(0, 2 * math.pi), rnd.uniform(0.55, 0.85)
        u, v = math.cos(t) * POND_A * f, math.sin(t) * POND_B * f
        if -0.9 < u < 2.2 and v > -0.3: continue                  # the jetty and pad steps
        if abs(u) < 1.0 and v < DECK_V: continue                   # the footbridge
        if math.hypot(u, v - DECK_V) < DECK_R + 1.5: continue      # the lanterns' ring round the deck
        x, y = pond_at(u, v)
        if pond_sd(x, y) > -0.08: continue
        mb.blob((x, y, WATER_Z + 0.012), 0.34, scale=(1, 1, 0.07), squash=0.2, seed=placed * 3.3, mid=0, subd=1)
        for k in range(6):
            a = k * math.pi / 3 + rnd.uniform(-0.2, 0.2)
            mb.blob((x + math.cos(a) * 0.09, y + math.sin(a) * 0.09, WATER_Z + 0.09), 0.08,
                    scale=(1.6, 0.8, 0.9), squash=0.1, seed=k + placed, mid=1, subd=1)
        mb.blob((x, y, WATER_Z + 0.12), 0.05, mid=2, subd=1)
        placed += 1

# bridge / waterfall / vine placement, in radians around the rim
BRIDGES   = [math.radians(300), math.radians(10), math.radians(150)]  # = web bridges
FALLS     = [math.radians(221), math.radians(250), math.radians(112)]  # clear of them
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
    torig = (TREE_AT[0], TREE_AT[1], ground(TREE_AT[0], TREE_AT[1]) + 0.08)
    tree, blobs, O = build_tree(origin=torig, scale=1.26)
    assign(tree, mat_bark())
    link(tree, "Tree")
    canopy = build_canopy(blobs)
    assign(canopy, mat_leaves())
    link(canopy, "Tree")

    # ---------------- stone plaza + paths ----------------
    # a flat flagstone ring, flush with the grass; the buttress roots cross it
    mb_stone = build_plaza(torig, r_out=5.8, steps=0)
    def landing(a, r=10.9):
        return (math.cos(a) * r, math.sin(a) * r)
    # a paved route from the plaza to each bridge; the 10-degree bridge lands
    # on the plaza apron itself, so it needs no path of its own
    path_ribbon(mb_stone, [(5.9, -1.2), (5.8, -4.6), landing(BRIDGES[0])],
                width=1.45)
    path_ribbon(mb_stone, [(-0.5, 5.6), (-4.5, 6.4), landing(BRIDGES[2])],
                width=1.35)
    plaza = mb_stone.emit("Plaza", mat_stone())
    link(plaza, "Props")

    # ---------------- pond: jetty, lily-pad steps, deck, reeds, lotus ----------------
    prnd = random.Random(606)          # own stream, so the rest of the scatter is unchanged
    mb_j, mb_p, mb_d = MB(), MB(), MB()
    build_pond_walk(mb_j, mb_p, mb_d)
    for ob, mt in ((mb_j.emit("Jetty"), mat_wood()), (mb_p.emit("LilySteps"), mat_lilypad()),
                   (mb_d.emit("Deck"), mat_wood())):
        assign(ob, mt)
        link(ob, "Props")
    mb_r, mb_h, mb_lo = MB(), MB(), MB()
    build_reeds(mb_r, mb_h, prnd)
    build_lotus(mb_lo, prnd)
    for ob in (mb_r.emit("Reeds", mat_tuft()),
               mb_h.emit("ReedHeads", mat_wood("ReedHead", (0.36, 0.22, 0.12, 1), (0.50, 0.33, 0.18, 1))),
               mb_lo.emit("Lotus", mat_lilypad(), mat_flower(), mat("LotusHeart", (1.0, 0.78, 0.30, 1)))):
        link(ob, "Scatter")

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
    if "--norender" in argv:          # asset rebuilds only need the .blend
        print("SAVED", SAVEBLEND)
        return
    sc.render.filepath = OUT
    bpy.ops.render.render(write_still=True)
    print("WROTE", OUT)


main()
