# Island Life — Judge User Guide

Island Life turns a student's timetable and feelings into a floating 3D island. A full week makes the island sit lower in the sky, while recent mood check-ins shape its weather. This guide provides a simple route through the main experience.

<!-- Submission owner: before sharing this guide, open both links below in an incognito window without a Vercel account and confirm they load. The older island-life-one.vercel.app address is behind Vercel Deployment Protection and asks for a Vercel login, so do not use it. Do not commit judge passwords to this file. -->

## Before you begin

- **App:** [https://island-life-r21r.vercel.app/](https://island-life-r21r.vercel.app/) (opens the welcome page first)
- **Instant demo:** [https://island-life-r21r.vercel.app/?enter=demo](https://island-life-r21r.vercel.app/?enter=demo) (skips the welcome page and goes straight into the demo sky)
- **Recommended browser:** the latest Chrome or Edge on a laptop or desktop, with the window full-screen
- **Suggested test time:** 8–10 minutes
- Please allow up to one minute for the 3D world to load on the first visit.
- No account, camera, notification or calendar permission is required for the demo route.
- **Good to know:** the demo's clock opens in the evening, after the day's activities have passed. Today's blocks therefore read "did it happen?" in the Planner. This is expected.

## Choose a route

| Route | Best for | Data used |
| --- | --- | --- |
| **Demo island — recommended first** | Seeing every important feature quickly | Preloaded fictional data for Aisha and four friends; changes remain in this browser only |
| **Signed-in island** | Testing accounts, persistence, private data, invitations and Google Calendar | A Supabase account and data created by the judge |

## Route A — recommended 8-minute demo

### 1. Enter Aisha's demo sky

Open the [instant demo link](https://island-life-r21r.vercel.app/?enter=demo). Alternatively, open the [main app](https://island-life-r21r.vercel.app/), press **Come ashore** to watch the arrival (or **Skip** at the top right), and then select **Try the demo island**.

Wait until the floating islands appear with the message "Welcome to the demo sky. This is Aisha's island, and her four friends." Blomy, the gardener, then offers a short guided tour.

**What the tour asks you to do:** tap **My island**, hold `W A S D` to walk, tap **How do you feel?**, open the **Planner**, open **Your balance**, and finally cross a bridge. Each step waits until you have done it. You can press **Skip** at any point.

**Expected result:** six labelled islands appear in one shared sky: **My island** (Aisha's), **Ben's**, **Chen's**, **Dara's** and **Eli's island**, around **The gathering Island** in the middle. Aisha's sample timetable, mood history and friends are already loaded.

### 2. See how workload changes the island

1. Open the settings panel with the **☷ icon** at the top right (its tooltip reads "Tune the world"). The panel's heading is **Make it your evening**.
2. Scroll down inside the panel to **Try the demo week**.
3. Select **Exam week** and observe the island sink. The left card shows roughly "38 m below your usual" and the sky becomes **Drizzle**.
4. Select **A light week** and observe it float higher with a clear sky.
5. Select **A rough few days** and observe cloud or rain appear.
6. Select **Back to this evening** to restore the original sample.

Tip: press **Sky view** at the bottom to watch the island move. When you are walking on the island it is harder to see it sink.

**What this demonstrates:** island height represents workload compared with the student's own normal week. Weather represents the recent mood trend; workload and mood are deliberately kept separate.

### 3. Record a mood check-in

1. Select **How do you feel?** at the top.
2. Choose **Calm**, **Happy**, **Tired**, **Stressed** or **Low**. Adding a photo is optional.
3. Look for the message "A calm lantern lights up on your pier." and, in the **At a glance** card on the left, the updated feelings and sky.

**Expected result:** the check-in is recorded immediately. One check-in creates a lantern; several recent check-ins gradually influence the island's weather. Below the five feelings the panel also asks **How draining was each one?** for today's activities. Answering is optional, and your island uses the answers to learn what a heavy week means for you.

### 4. Inspect and edit the planner

1. Select **Planner**.
2. Switch between **Day**, **Week** and **Month** to inspect Aisha's sample schedule.
3. Select **+ Add a block**.
4. Enter a title (**What**), then choose the **Day**, **Starts**, **For** (duration) and **Kind**. **Friends see** controls how much your friends can see: *Everything*, *Kind and size only*, or *Nothing*.
5. Select **Save**. A message says the block "is on your plan".
6. Switch to **Week** view and confirm that the new block is shown. In **Day** view it may sit at the bottom of the list, so scroll down.

Each activity kind has its own tree species. Pressing **Done** makes the tree take root in colour; **Let go** makes it drift away without punishment.

### 5. Test active rebalancing

1. Select **Your balance**. The sheet is titled **Your week, in balance**.
2. Review **This week, by area** (Time, Mental, Physical, Social, Errands), **Where your time goes**, **How you've felt**, **Done so far** and **What your island has learned**.
3. Scroll down to **Small changes that would help**.
4. Apply a suggestion, for example **Add a slow evening tomorrow, 20:30** or **Invite [friend] for a walk this Saturday**.
5. Confirm that the button changes to **Done ✓** and that a message appears, such as "Walk with Ben added for Saturday. Your bridges warm a little."
6. Reopen **Planner** and confirm that the suggested block was added or moved.

Notes:
- A suggestion that adds an activity also adds load, so the island may sit a little lower afterwards. The point is that the student chooses what to do about it.
- **Invite [friend] for a walk** puts a walk on your own plan and warms the bridge to that friend. It does not message the friend. To send a message, leave a note at their gate (see step 6).
- To undo a suggestion, open the Planner and press **Let go** on the block.

**What this demonstrates:** the app does not merely display stress. Its recommendations make a real change to the student's plan, and the change is reversible.

### 6. Explore the social and 3D experience

1. Close any open panel and press **Sky view**, then choose another person's island label (for example **Ben's island**).
2. Select **Take a walk** at the bottom.
3. Use the controls below to move around the islands and cross the bridges. Walk onto a bridge and press **Go** to cross to a friend's island.
4. At a friend's gate, a wooden sign lets you leave a short note.

| Action | Control |
| --- | --- |
| Walk (hold the key) | `W A S D` or arrow keys |
| Run | `Shift` |
| Jump | `Space` |
| Turn | `Q` / `E` |
| Tilt camera | `R` / `F` |
| Zoom | `Z` / `X` |
| Return to sky view | `Esc` |
| Look around | Drag with the mouse or use touch |

Friends can see another island's general height, weather and permitted activity silhouettes, but not private timetable details. A block you mark *Nothing* is not sent to friends at all.

### 7. Decorate the island

1. Return to **Sky view**.
2. Select the bag icon beside the dewdrop count (💧).
3. Choose an affordable decoration: **Flower bed** (15), **Garden bench** (30), **Stone lanterns** (40), **Kite** (50) or **Little well** (60). The demo starts with a few hundred dewdrops, so all are affordable.
4. Confirm with **Grow it**.

**Expected result:** dewdrops are deducted and Blomy says a line about the new decoration. The decoration grows near the windmill at the centre of your island's clock-face path. Walk there to see it. Dewdrops are earned through healthy participation such as finishing blocks, notes between friends and shared tasks; they cannot be purchased.

## Route B — signed-in account and backend

Use this route after the demo. If the team provided a judge account, use those credentials. Otherwise, select **Continue with Google** or **New here? Make your island**. A newly created email account may require email confirmation.

1. Open the [main app](https://island-life-r21r.vercel.app/), press **Come ashore** (or **Skip**), and then **Sign in to my island**.
2. Sign in with the provided judge account, select **Continue with Google**, or create an account.
3. If this is a new account, choose **Start a new sky**. An invite code can instead be used to join an existing friend's sky.
4. Select **Enter your island**.
5. Add a planner block and refresh the page to confirm that it persists.
6. Record a mood check-in and confirm that it appears in **Your balance**.
7. Open **Planner** → **Sync calendars** to test Google Calendar connection. Calendar access is optional and can be skipped.
8. Open the **☷ icon** (the **Make it your evening** panel) to find **Your sky**, with **Copy invite link** and the notifications button.
9. Use **Log out** when finished.

### Calendar privacy

- Island Life reads calendar titles and times only to create the student's private plan.
- Friends do not see private event titles.
- Two-way sync is off by default.
- If enabled, Island Life writes only to a separate calendar named **Island Life** and does not modify the user's original calendars.

## What judges should be able to verify

- A heavy timetable lowers the island; a lighter week raises it.
- Recent feelings influence weather and appear as lanterns.
- The planner supports day, week and month views plus editable activity blocks.
- Balance recommendations can update the planner in one action.
- Friends receive useful wellbeing signals without receiving private calendar details.
- Dewdrops reward engagement and can be spent on island decorations.
- Signed-in data persists after refresh, subject to a working network connection.

## Troubleshooting

| Problem | Suggested action |
| --- | --- |
| A Vercel login page appears | You have opened an old, protected address. Use [https://island-life-r21r.vercel.app/](https://island-life-r21r.vercel.app/), or ask the team for the current public link. |
| The 3D world loads slowly | Wait up to one minute, close heavy browser tabs, and ensure hardware acceleration is enabled. On a slower device, add `?lite` to the app address (for example `https://island-life-r21r.vercel.app/?enter=demo&lite`). |
| Sign-in or an external service is unavailable | Continue with the [instant demo](https://island-life-r21r.vercel.app/?enter=demo); the core judging journey does not depend on Supabase, Google or Gemini. |
| The guided tour covers an action | Select **Skip**. To bring it back, open the **☷ icon** and select **Show the guide again**. |
| The walking step of the tour does not advance | Click on the 3D scene first, then hold `W A S D` for a second or two. |
| I cannot find "Tune the world" | It is the **☷ icon** at the top right. Its panel is titled **Make it your evening**, and the demo scenarios are further down under **Try the demo week**. |
| Sound is unwanted | Use the speaker button at the top, or the music and effects sliders in the **☷** panel. The core experience does not require audio. |
| A previous demo purchase remains | Open the demo in an incognito/private window for a clean browser state. |
| A panel fills a mobile screen | Use its **×** button to close it, or rotate the device to landscape. On a phone the top buttons show icons only: ♡ How do you feel?, ◐ Your balance, ◷ Planner, speaker, ☷ settings, and the bag for the shop. |

The recommended judging route is the demo because it is deterministic, contains no personal information, and remains usable if external services are unavailable.
