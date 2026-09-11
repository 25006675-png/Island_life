# Island Life

## Register

product

## Users and purpose

A laptop visual demo for exploring a cozy floating island neighborhood. Select an island for a closeup, then walk the leaf gardener around the islands and across connecting bridges.

## Personality and references

Serene, warm, hopeful. Follow the supplied twilight neighborhood reference and the existing painterly Blender asset palettes. Avoid harsh lighting, dark science fiction styling, and neon effects.

## Principles

- The world occupies the screen; controls remain secondary.
- Preserve the finished islands, Ghibli planting, and leaf gardener.
- Light, cloud, and atmosphere carry the magic.
- Altitude, local weather (one continuous strain value), bridge light, sky tone, and time of day remain adjustable.

## Accessibility

Provide keyboard walking, visible focus, labeled controls, reduced motion, and a keyboard alternative to selecting islands in the scene.




Island Life — Scene Description (v1 demo)

A stress & workload manager for students, rendered as a Ghibli-style world of floating islands. The world itself is the data visualization: land = actions, sky = feelings, altitude = load. v1 is a visual demo (Three.js scene + separate planning UI), driven by mock data and a demo control panel — no live backend.

Scenes

1. Sky overview (shared world). Several personal islands float at different altitudes around one larger community island, connected to it by arched light-bridges (hub-and-spoke). A glowing cloud sea spans the bottom of the frame; faint fixed horizontal light bands mark altitude zones. Buttons: "Sky view" / "Take a walk". Clicking an island zooms/lands into scene 2.

2. Personal island (close-up). One island with a torii-like light arch, six tree groves, a glowing clock-face path, a wisp, and a player avatar.

Element → meaning (one element = one meaning)
Path = today's timetable, laid out like a clock face. It leaves the arch, runs once round the middle of the island at a steady pace (07:00 → 22:00), and curves back toward the arch ending in an arrow — it points home rather than closing the loop. Each block is an arc as long as it lasts; one segment = 30 min; segment color = activity category; free time is pale path. A disc marks each block's stop. Behind the wisp: bright, with light flowing toward it. Ahead: softer. (Routing through the groves made a path nobody could trace, so the path reads as time; the trees carry the category.)
Wisp = the current time. A small light spirit that walks the path in real time; it is always at the node of the currently scheduled block. Emerges from the arch at dawn, returns at night.
Arch = home / day boundary. Where the path begins and ends. Avatar spawn point.
Trees = activities. Each category has its own species and color; trees grow in their category's grove (zones are emergent from the groves, softly blended edges):
Study — purple tiered pagoda tree
Work — amber round oak
Errands — sage topiary cluste
Social — pink blossom tree
Exercise — coral curved palm
Rest — powder-blue willow
Other — bare pale sculptural tree with floating motes Tree size = duration tier (small ≤30 min / medium ~1–1.5 h / large 2 h+).
Ghost trees = the plan (future). Planned blocks stand as full-size translucent glass versions of their species. On completion, the ghost fills with color and light ("takes root"). Skipped ghosts thin out and drift away quietly — no dramatic death.
Solid trees = the past (done). Rolling ~1-week window; older trees dissolve into the terrain, permanently enriching that grove's ground tint (history becomes soil).
Emotion lanterns = feelings. A check-in (one-tap emotion, optional photo) releases a colored lantern that rises into the personal island's sky; past days settle as stars.
Weather = subjective strain (backward-looking). Rolling multi-day trend of emotion check-ins + schedule signals → one continuous value, not three states: clear with a soft sun glow → cloud gathers and thickens (low mist in the middle) → the cloud darkens and rain begins as a drizzle and grows. One heavy day never makes it rain; today's feeling is the lantern, the weather is the trend. Framed as surfacing burnout risk, never diagnosing.
Altitude = objective load (forward-looking). Committed hours vs. free capacity. Heavier week = island floats lower toward the cloud sea; cloud sea = 100% capacity. Fixed sky bands are the shared baseline; tapping the island shows the exact % ("31/35 hrs").
Bridges = connections. Each personal island bridges to the community island. Bridge glow = recent interaction warmth; unused bridges dim to a quiet minimum, never break.
Community island = the gathering place. No personal-data language (no path, gauge, or ghosts). One giant luminous gathering tree on buttress roots, a flat flagstone plaza, a pond beside the tree (reeds, lotus, a jetty and giant lily-pad steps out to a small round deck, a footbridge from the far shore), notice board, bridge landings.
Photo lanterns over the deck = the daily shared moment. Once a day a random 2-minute "golden window" pings the whole friend group; each member's photo becomes a small lantern floating just above head height over the pond deck (photo visible on its face; walk up and press E, or tap, to view). Late posts until midnight still land, slightly softer. No post = simply no lantern; absence is never rendered. One photo lantern per person per day. Photo lanterns are the only lanterns on the community island, so "lantern" always means someone's moment or feeling.
Privacy defaults

Friends see altitude, weather, sky tone, and island fullness — never task contents. Per-item visibility: hidden / silhouette (default: species + size only) / open (full label revealed on proximity).

Interactions (v1)
Sky view ↔ land on island (camera zoom transition)
"Take a walk": free avatar movement on the island; approaching a tree/lantern reveals its detail card (proximity reveal, e.g. "15 Sept · badminton")
Path-lift morph: pressing "schedule" lifts the path off the terrain into a flat readable timetable ribbon (signature transition)
Timetable input & task overview live in a separate conventional UI panel (remote dashboard); the island is the visualization of that plan, not the editor. v1: a Planner sheet with Day / Week / Month views. Week: drag on empty time to add, drag a block to move it, drag its edge to resize, click to edit (title, day, time, kind, who sees it, "repeats every week", "can wait if the week gets full"). Month: load bar + category dots per day; a day opens its week. Day: that day's list; today's is the path. Altitude comes from the week's real committed hours.
Emotion check-in lives in its own "How do you feel?" panel at the top: one tap, optional photo.
Camera: in walk mode, drag to orbit the avatar and scroll to zoom; WASD moves relative to the camera; Space jumps. Trees between avatar and camera never swallow the view.

Balance panel (analysis + solutions)

Not a separate page and not a modal popup — an expanding sheet that slides up over the current scene when triggered (tapping the altitude gauge, weather chip, or an "insights" button). The 3D scene stays alive behind it: dimmed and softly blurred, island still drifting, so the panel reads as part of the world, not a context switch. The user's avatar appears at the left edge of the panel, standing and viewing the readout (the avatar never speaks or gives advice). v1: the gardener waits at a home spot on the left of the sheet's top edge; while a sheet is open you walk it with ← → (or A D), jump with Space, and turn it with Q E through eight real angles rendered from the 3D model. It hops when the plan changes. The planner sheet and the lifted timetable ribbon have it too (on the ribbon it starts at "now" and walks through the day, lighting the block it stands on), so opening a sheet never feels like leaving the world. Collapse by swiping down or tapping the scene.

Panel contents, top to bottom:
Load header — current capacity: "31 / 35 hrs committed · 89%", with the altitude band it corresponds to and a small 4-week trend sparkline.
Balance chart — compact per-category bar or ring (study / work / errands / social / exercise / rest) for this week, planned vs. completed.
Weather explanation — one warm sentence on why the current weather: "Cloudy — a few low-mood evenings and two late nights this week."
Suggestions list — every row is an action, not a report. Each suggestion has a one-tap apply button that visibly edits the plan: "Push 2 low-priority blocks to next week ✓", "Add a rest block Thursday evening ✓", "Invite a friend for a walk this weekend ✓". Applying updates the ghost trees / path / altitude in the scene behind the panel in real time — the world visibly rebalances.

Tone: microcopy stays warm and non-clinical ("your rest grove has been quiet this week 🌿", never "Rest: 0 hrs, -100%"). Surfacing, never diagnosing; suggesting, never scolding.

v1 demo: panel runs on mock data; 3 scripted suggestions (one rebalance, one rest, one social), each actually mutating the mock plan so the behind-scene updates on apply.

Dewdrops (decoration economy, roadmap tier)

A slow drip of dewdrops from completed blocks and golden-window participation, spent on island decorations and care tokens. It never claims to touch workload or stress; it's just how your island gets a windmill. v1 shows the counter (a chip beside the load and weather chips, and one line in the balance panel) and one decoration: a windmill at the hub of your clock-face path. No shop, no purchase flow.

Achievements reward balance, never volume. Paying out for "50 study hours" or "20 tasks this week" would reward the burnout the app exists to prevent. So they celebrate what the brief wants more of: "First week with rest in every day" 🌿, "Completed a shared mission with a friend", "Accepted an invitation on a rainy week", "A balanced week: all six groves grew", and gentle milestones ("your first willow", "100 lanterns in your sky"). Volume-neutral, recovery-positive, social-positive. One-time or weekly-resetting, never chained (no streaks, no leaderboards). Rewards are seasoning, not the engine: the retention engine is the island itself, the accumulated landscape. In the pitch this is half a sentence: small rewards, tuned to celebrate balance rather than volume.

Demo control panel (judge-facing, v1 only)

Sliders/toggles to drive the scene without a backend: per-island altitude, per-island weather (one continuous strain slider: clear → cloud → drizzle → rain), bridge glow intensity, sky tone, time of day (or follow the real clock), ring the golden window now, ghost↔solid tree ratio.

Art direction

Hand-painted Ghibli-inspired stylized 3D; pastel twilight palette (mint, lavender, peach, soft gold); magic via light — emissive lanterns, glowing path and bridges, bloom, fog, gradient sky dome, drifting sparkles. Warm key light upper-left to match baked asset lighting. Runs on a laptop; mobile performance out of scope for v1.