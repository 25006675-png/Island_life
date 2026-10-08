# Handover: balloons, dew shop, sound, whale rides

Written 9 Oct 2026 for whoever picks up Island Life next (a developer or a fresh Claude Code session). Four jobs are left, in this order: hot-air balloons, the dew shop, music and sound, and (optional) riding the star whale across a bridge. Everything below is what you need to start without re-reading the whole history.

Deadlines: student pilot 19–25 Oct, hackathon final 15 Nov.

---

## 0. Where things stand

**Branch and state.** Work is on `backend`, **uncommitted** (about 65 changed or new files). Nothing has been pushed. Before anything else, ask the owner whether to commit what is there. A snapshot of the working tree from before the big merge is kept at `refs/backup/pre-arrival` (`git stash create` object, not a branch).

**Commit rules (from the owner):** commit or push only when asked; no `Co-Authored-By` or other Claude trailer on commits.

**Run it.**

```
npm install
npx vite --host 127.0.0.1 --port 5181      # or: npm run dev
```

- `http://127.0.0.1:5181/` opens the welcome page (whale arrival, then sign-in) and hands over to the app.
- `/?enter=demo` goes straight into the demo sky. `/?skiplogin` does too and is what tests use (no guide).
- `/?guide` replays Blomy's first-time guide. `/?touch` shows the phone joystick with a mouse. `/?pr=1` pins the resolution for benchmarks.

**Check your work.**

- `npm test`: 25 unit tests (Node test runner). Must stay green.
- `npx vite build`: builds both pages (`index.html` and `welcome/index.html`, see `vite.config.js`).
- `node tools/perf.mjs http://127.0.0.1:5181/`: draw calls and triangles in the sky view and on foot. Last reading: sky 889 draws / 2.0M triangles, on foot 347 / 1.5M. Don't let your feature push these up much.
- Screenshots: Playwright with software rendering works headless here (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`). The 3D runs about 10x slower than real time, so wait 20–40 s for camera moves. Don't edit source files while a screenshot run is going: Vite reloads the page and resets the scene.

**Code conventions that will bite you.**

- The JS is dense: many statements per line. **A `//` comment inserted in the middle of a line silently comments out the code after it.** This happened four times. Inside a line use `/* … */`; otherwise put the comment on its own line.
- Most source files use CRLF line endings. Tools that rewrite files (Git Bash `sed -i` in particular) can turn them into LF. Git normalises this (`core.autocrlf=true`), but keep files consistent.
- Match the existing comment voice: short plain sentences saying *why*, above the code.

**Design rules the owner has set** (don't undo these):

- Altitude = workload: the gathering island is 0 m and equals a normal week; light weeks float to +45 m, heavy ones sink to −55 m into the cloud sea (top at −50 m). `src/data.js`.
- Weather = feelings over the last 7 days: Calm/Happy 0, Tired 0.55, Low 0.8, Stressed 1, recency-weighted. Cloud = "heavy", never "bad". The owner is happy with the weather as it is now.
- The torii gate stands at the shore (`src/gate.js`), every friend's island has the welcome page's pier in front of it (`src/pier.js`), and Blomy starts each visit on the pier facing the gate.
- Blomy (`src/blomy.js`) is the only character, in 3D and in the 2D sprites (`tools/blomy-sprites.mjs` re-renders them).
- Look: "Violet dusk" sky, Fredoka for headings, Nunito Sans for text, orchid pill buttons (`src/style.css`). Signs in the world stay wood with the handwritten font. Keep the scene calm: the owner dislikes visual noise.

---

## 1. Hot-air balloons (replace the feeling lanterns)

**Why.** A check-in ("How do you feel?") currently hangs a small lantern on the pier railing. It's easy to miss, and it doesn't use the island's main idea, which is height. The owner chose a hot-air balloon: it rises, it's visible from the sky view (friends see who checked in today), and the check-in becomes a small rewarding moment.

**What it should do.**

1. On check-in, a small hot-air balloon in that feeling's colour (`MOODS[k].color` in `src/data.js`) lifts off from the island's pier, rises with a gentle sway and a soft trail, and settles to bob above the island about 8–14 m up.
2. Only **today's** balloons are shown, at most about 4 per island in view (extra ones cluster, or the oldest drifts higher). Small and soft: they must not clutter the sky view.
3. At night, or when the day rolls over, today's balloons drift up and fade into the stars. Past days are already shown as faint stars (`addIsland` in `src/mood.js`).
4. Walking near one isn't possible any more (they're in the air), so the information moves to a **click**: clicking a balloon in the sky view or on foot shows its card ("Your calm balloon · checked in at 14:20", plus the photo if one was added). `mood.pick(raycaster)` and the `pick` hook in `src/life.js` already do this for lanterns.

**Where.**

- `src/mood.js`: the whole lantern system. `slot()` places a lantern on the pier, `lantern()` builds one, `update()` animates it, `near()` finds one within reach, `pick()` handles clicks. Replace the lantern mesh and its pier slots with a balloon and sky positions; keep the API so `src/life.js` barely changes.
- `src/life.js`: `checkIn()` (around line 530) calls `mood.checkIn` and shows "A … lantern lights up on your pier." A friend's check-in arriving live is around line 773. The lantern card for walking up is in `nearest()` (around line 678); remove it once balloons are clickable.
- `index.html`: the "How do you feel?" panel text says the feeling "hangs as a coloured lantern on your pier". Change it.
- `src/main.js`: the guide's step 4 says "It hangs as a lantern on your pier" (search `Pick the one closest`).
- Docs: `docs/algorithm.md` section 3 and `docs/science.md` talk about lanterns. Update the wording, not the maths.

**How to build the balloon cheaply.** Make it by hand in three.js like the pier: an envelope (a `LatheGeometry` teardrop with a few vertical stripes via vertex colours), a small basket (rounded box), and four thin ropes. Then run `mergeStatic()` from `src/merge.js` on it, so each balloon is one or two draw calls. Use `MeshStandardMaterial` with a little emissive so it glows softly at dusk.

**Done when:** check-in in the demo shows the lift-off from your pier; the sky view shows balloons over islands with check-ins today; clicking one shows its card; nothing says "lantern" in the UI; `npm test` passes; `tools/perf.mjs` draws rise by less than about 30.

---

## 2. The dew shop (make it real)

**Now.** `src/shop.js` is a preview: four "Coming soon" cards (garden props, lanterns, paths and stones, care tokens) and no spending. Dewdrops are not stored anywhere. They are **worked out** each time by `dew()` in `src/life.js` (around line 375): finished blocks, golden-window photos, notes read, tasks finished, plus 36 starter drops in the demo.

**What's needed.**

1. **A ledger of spending**, so balance = earned (the existing `dew()`) − spent. Demo: keep purchases in `localStorage`, wrapped in try/catch. Signed-in: a small Supabase table, for example `purchases (id, user_id, item, cost, created_at)`, with row-level security so users see only their own rows. Add a migration under `supabase/migrations/`. The owner runs the production deploy (`node tools/deploy-backend.mjs`); don't deploy yourself.
2. **Things to buy that actually appear on the island.** Keep it small for the pilot, 4–6 items, and make each one visible:
   - **Balloon colours or patterns** (ties into task 1)
   - **A bench or a little well** by the path (place near the windmill, inside the day ring; trees grow in two bands around the ring, see `BAND_IN`/`BAND_OUT` in `src/forest.js`)
   - **Lanterns along the pier** (cosmetic, now that feelings are balloons)
   - **Stepping stones** along the path from the gate
   - **A care token** to leave at a friend's gate: this one goes through the notes system (`backend.sendNote`)
3. **Buying flow:** card shows cost and "You have N"; tap opens a small confirm; on buy, the drop count animates down (there's already a `.dew-count.gain` animation; add a matching spend one), the item appears on your island, and Blomy says one line. Items you own show "Placed" instead of a price.
4. Friends can see your bought decorations when they visit, since they're part of your island. For signed-in users, load `purchases` with the rest of the world in `backend.loadWorld`.

**Keep it fair:** dewdrops are only ever earned by living the week (finishing things, notes, golden moments). No buying dewdrops, no timers, no "limited time" pressure. That matches the app's blame-free rule.

**Done when:** in the demo you can buy an item, see the balance go down, see it on your island, reload and still have it.

---

## 3. Music and sound effects

**Nothing plays any sound yet.** The owner wants music and sound effects and has no time to choose them, so pick sensibly.

**Set-up.**

- One small module, `src/sound.js`, using the Web Audio API: a music bus and an effects bus, each with its own gain, and `play(name)` for effects.
- Browsers block audio until the first click or key press, so start the audio context on the first user gesture (the welcome page's "Come ashore" is a natural one).
- **A sound toggle** in the settings panel (`index.html` `#settings`, next to "Gentle motion"), remembered in `localStorage`. Music volume low by default (about 0.25), effects about 0.5.
- The welcome page (`welcome/index.html`) and the app are two pages; share `src/sound.js` and the same `localStorage` key so the choice carries over.

**Music.** One calm, looping ambient track for the sky (soft pads or a music box, 60–90 s loop), and optionally a gentler, lower version for rainy islands crossfaded by the island's weather. Use only music you're allowed to ship: CC0 or a licence that allows commercial use, and record the source and licence in a `public/assets/audio/CREDITS.md`. Keep files small (OGG/MP3, under about 1.5 MB each).

**Effects, most important first:**

| Moment | Where in code | Sound |
|---|---|---|
| Check-in, balloon lifts off | `checkIn()` in `src/life.js` | soft chime, then a whoosh |
| Arriving on an island (title card) | `arrive()` in `src/main.js` | a short, warm swell |
| Guide step done ("Nice!") | `update()` in `src/guide.js` | a sparkle |
| Guide finished (confetti) | `finish()` in `src/guide.js` | a little fanfare |
| Bridge "Go" | `$('bridge-go').onclick` in `src/main.js` | a whoosh |
| Buying in the shop | `src/shop.js` | coins of water, a drip |
| UI taps (pills, sheets) | the header buttons and sheets | a very quiet tick |
| Footsteps | `walk()` in `src/main.js` | wood on the pier and bridges, soft grass elsewhere; use `player.surface.kind` |
| Rain | weather strain above 0.55 (`createWeather` in `src/atmosphere.js`) | a soft rain loop, volume by strain and distance |
| Welcome page | whale breach, landing, "Come ashore" | splash, thump, chime |

Respect "Gentle motion" off and `prefers-reduced-motion` for anything sudden, and never play sound on page load.

**Done when:** first click starts gentle music; the effects above play; the settings toggle mutes everything and is remembered across both pages; no console errors.

---

## 4. Optional: ride the star whale across a bridge

**Idea from the owner:** when you press **Go** on a bridge, the star whale from the welcome page carries Blomy across instead of her running. It echoes the arrival: the same whale that brought her home takes her to a friend.

**Now:** standing on a bridge shows a banner ("Heading to Ben's island") with **Go**, which runs Blomy across (`bridgeBanner()` and `crossBridge()` in `src/main.js`, around lines 297–330). Walking speed on bridges is 1.8x, Shift runs.

**The whale already exists, twice:**

- `makeWhale()` in `welcome/index.html` (around line 471) is the star whale Blomy rides in on: translucent galaxy skin, glowing seams, star motes, a `seat` object on its shoulder (`whale.userData.seat`) and a `swim` animation. This is the one to reuse. Move it into a shared module (for example `src/whale.js`, the same way `src/pier.js` and `src/blomy.js` were moved out) so the welcome page and the app both import it.
- `whale(size)` in `src/atmosphere.js` is a simpler humpback that swims far out in the background of the app. Leave it as scenery.

**What to build.**

1. On **Go**, the star whale rises out of the cloud sea beside the bridge (a short breach with a splash of cloud, like the welcome page), comes alongside, and Blomy hops onto its seat (`gardener.userData.jump()`, then `ride()`, both in `src/blomy.js`).
2. The whale glides along the bridge's line a few metres beside and above it, using `bridgePoint(bridge,t)` from `src/navigation.js`, with its swim animation and a slight bank. The camera follows as it does now. Keep the existing `travel` state, so pressing a walking key still takes control back (Blomy hops off onto the bridge).
3. At the far end the whale lets her off at the island (the same step-off as `crossBridge()`), dives back into the cloud sea, and the arrival title card plays (`arrive()`).
4. Scale it to the app: Blomy is 2 m in the app but about 5.7 m on the welcome page, so the whale needs scaling down to match (`WHALE_S` on the welcome page).

**Cost:** the star whale has several materials and a per-frame body animation. Only create it while a ride is happening and dispose of it afterwards, and check `tools/perf.mjs` during a ride. With reduced motion or "Gentle motion" off, skip the whale and just move Blomy across as now.

---

## 5. Known issues, not yet fixed

- **Trees are the biggest render cost:** 374 separate draw calls. Drawing each species as one instanced batch per island would cut that to about 50, but it means reworking how `src/forest.js` grows trees, shows glass "ghost" trees, swaps far-away low-detail models and handles clicks. Worth doing before the pilot if phones struggle.
- The camera can pass through the gate's crossbeam as you walk in from the pier.
- The first weather cloud appears at a score of 0.12, while the label says "Clear" until 0.2. The owner said leave it for now.
- Signing in with a real account through the welcome page has **not** been tested end to end (no local Supabase was running). Test with the local stack: `npx supabase start`, `npm run dev:local`, `npm run test:live`. Also make sure Supabase's allowed redirect URLs include `/welcome/`.
- Blomy is about 5.7 m tall on the welcome page and 2 m in the app. The owner hasn't decided whether that should match.
- `public/assets/gardener.glb` is no longer used by the app.
- `src/style.css` starts with an empty `@import url('')` that makes the build print a warning. It was there before this work.
