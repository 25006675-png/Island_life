# How the island reads your week

> **Your schedule moves the island. You set the sky. And your island learns what heavy means for you.**

Island Life shows two things about a student's week, and keeps them apart on purpose:

| | Comes from | Shown as | Can it be predicted? |
|---|---|---|---|
| **How heavy the week is for you** | The plan, weighed by what you have told the island about your activities | **Altitude**: the island sinks | Yes. It is forecast days ahead and improves as you answer. |
| **How you feel** | What you tell the island each evening | **Lanterns and weather**: the sky | No. It is never predicted, only asked. |

A third thing is measured quietly underneath: **how much your feelings follow your workload**. It is never drawn. It decides which kind of help the gardener offers.

Every part of this rests on established methods from sports science and occupational psychology. The references are at the end, numbered in square brackets.

---

## 1. Two questions

The island asks two short questions, and each feeds one side of the world.

| Question | When | Answers | Feeds |
|---|---|---|---|
| **"How are you?"** | Once, in the evening | Calm · Happy · Tired · Stressed · Low | A lantern, then the weather |
| **"How draining was that?"** | Straight after, about one or two of the day's activities (see section 5) | Light · Okay · Draining | Altitude |

Questions about *things* move the island. Questions about *you* change the sky.

Asking briefly, close to the moment, is the **experience sampling** method used in psychology research [1, 2]. Island Life asks the same evening instead, the way the **Day Reconstruction Method** does [16]: people rate the day's activities while the day is still fresh. That gives a picture close to experience sampling with one interruption a day instead of one per activity, which is what keeps students answering.

---

## 2. Altitude: how heavy the week is *for you*

### 2.1 The load of one activity

Sports teams measure training with **session-RPE** [3, 4]. After each session the athlete rates how hard it was, and that rating multiplied by the session's length is the session's load. Island Life does the same with a student's activities:

```
load of an activity = drain × hours
```

`drain` is measured in **ordinary hours**: 1.0 means an hour as tiring as an ordinary hour of focused work.

| Answer | Drain |
|---|---|
| Light | 0.5 |
| Okay | 1.0 |
| Draining | 1.6 |

When an activity has no answer yet, which covers anything still in the future, the island uses its **prediction** of the drain (2.3).

### 2.2 This week against your normal week

Sports science compares an athlete's last week of training with what they have been doing over the past month. This is the **acute:chronic workload ratio** [5, 6]. The risk is not heavy training in itself. It is a sudden jump above what that body is used to. Island Life applies the same idea to a student's week:

```
this week  W = load of every block this week, Monday to Sunday (done, planned, not let go)
normal     C = your typical week, a running average of the weeks before
ratio      R = W ÷ C
```

The running average is **exponentially weighted** [7]: last week counts most, and older weeks fade out (weight 0.4 on the newest week, roughly four weeks of memory). On the first day, `C` comes from the past four weeks of the student's imported calendar, so there is no empty start. With no calendar, it starts at 30 ordinary hours.

| Ratio | Island |
|---|---|
| half your normal week or less | high in the sky, 45 m up |
| your normal week | level with the gathering island, 0 m |
| one and a half times your normal week or more | down in the cloud sea, 55 m below |

In between, the island moves smoothly: `sink = clamp((R − 0.5) ÷ 1.0, 0, 1)`, and its height runs from 45 m (sink 0) through 0 m (sink 0.5) to −55 m (sink 1), each half in a straight line.

### 2.3 What the island learns from "How draining was that?"

The same lecture is easy on Monday and exhausting on Thursday after three late nights. So the island does not learn one fixed weight per activity. It learns three things about you:

1. **How draining each kind of activity usually is for you** (`cost` per category).
2. **How quickly you wear down** (`sensitivity`).
3. **How quickly rest brings you back** (`recovery`).

A prediction combines them:

```
worn  = (your load over the days before this activity ÷ your normal week) − 1
        recent days count more, fading at your recovery speed
drain = cost[kind] × (1 + sensitivity × worn)
```

`worn` is 0 on a normal stretch, positive after a heavy run and negative after a quiet one. This follows the **fitness–fatigue model** [8] (load builds fatigue, and fatigue fades with time) and the **effort–recovery model** [9] (effort is only a problem when recovery cannot keep up).

**Learning.** After each answer, the island nudges its numbers towards what you said, using the **delta rule** [10]:

```
error         = your answer − predicted drain
cost[kind]   += step × error × (1 + sensitivity × worn)
sensitivity  += step × error × cost[kind] × worn × 0.5
step          = 1 ÷ (answers for this kind, counting this one, + 5)
```

The `+ 5` means each starting value counts as five answers. Early answers move the numbers a lot, and later ones fine-tune them. This is **shrinkage towards a prior** [11]: with little data, the island stays close to sensible defaults.

**Recovery speed** is picked rather than nudged. Each night the island tries three speeds (recent days fading by half every 2, 3.5 or 5 days). It keeps whichever would have predicted your last four weeks of answers best, and it needs at least eight answers to switch away from the middle one.

**A bad day is not a bad activity.** If you answered two or more activities on the same day and they *all* felt heavier than predicted, part of that is the day, not the activities. Before learning, the island subtracts half of that day's average error from each answer. Your evening mood is kept separately and does not alter these numbers.

Starting values, all in ordinary hours:

| Study | Work | Errands | Social | Exercise | Rest | Other |
|---|---|---|---|---|---|---|
| 1.0 | 1.0 | 0.6 | 0.5 | 0.7 | 0.15 | 0.6 |

`sensitivity` starts at 0.5. Every learned value stays inside fixed bounds (cost 0.1–2.5, sensitivity 0–1.5), so one strange week cannot swing the island.

### 2.4 Forecast: heavy days before they arrive

Each coming day gets a predicted load. It is compared with a **typical busy day**: your normal week spread over five days (`C ÷ 5`), because most students' weeks are concentrated on weekdays.

| Day's load against a typical busy day | Label |
|---|---|
| below 0.6 | Light for you |
| 0.6 – 1.4 | A usual day |
| 1.4 – 1.8 | Heavy for you |
| above 1.8 | Very heavy for you |

The forecast appears in three places, never in the sky:
- the planner marks each day,
- a short morning line says what today holds,
- the gardener speaks up when a day ahead is heavy and something on it can wait.

Moving a block changes the forecast at once.

### 2.5 Guardrails on altitude

Comparing you with your own normal can hide chronic overload: if every week is too much, too much becomes normal. So three fixed limits sit beside the learned ones:

- **Your normal week can never be more than 45 ordinary hours**, nor less than 10, however many weeks are averaged.
- **A week of 55 planned hours or more**, or **four or more blocks ending after 23:00**, sinks the island at least to "very full", whatever the ratio says.
- **Learning only touches altitude.** It never touches the weather.

---

## 3. Weather: how you feel

Each evening's answer becomes a **lantern** that rises over your island and stays for the week. The **weather is the sum of your lanterns**:

```
heaviness of a feeling   Calm 0 · Happy 0 · Tired 0.55 · Low 0.8 · Stressed 1
weight of a day          1 today, falling by 0.13 for each day back (a week ago weighs 0.22)
weather                  weighted average of the week's lanterns
```

| Weather value | Sky |
|---|---|
| below 0.2 | Clear |
| 0.2 – 0.35 | Light cloud |
| 0.35 – 0.55 | Cloudy |
| 0.55 – 0.75 | Drizzle |
| 0.75 and above | Rain |

The weather is **never learned and never compared with your normal**. A rainy week is a rainy week, even for someone whose weeks are often rainy. What is normal for you may change what counts as *unusual*, never what counts as *bad*.

Friends see your lanterns and weather. They never see your plan, hours, or the titles of anything you do.

---

## 4. The link: does your weather follow your island?

For some students, mood follows the schedule closely. For others it hardly does: their hard weeks come from sleep, people, home or money. Island Life does not assume either. It **measures** the link for each person:

```
for each of the last 28 days with an evening answer:
    pair  (that day's weather value,  that day's load ÷ a typical busy day)
link  = correlation of the pairs × n ÷ (n + 10)       n = number of pairs
```

The `n ÷ (n + 10)` term is shrinkage again [11]: with ten pairs the link counts for half, and with thirty pairs for three quarters. Below seven pairs the link is reported as *still learning*.

This maps onto the **Job Demands–Resources model** of burnout [12, 13]:

| JD-R model | Island Life |
|---|---|
| Demands | Your schedule → altitude |
| Resources | Rest, friends, recovery → bridges, rest blocks |
| Strain | How you feel → weather |

> **Island Life isn't a metaphor we made up. It's a well-established burnout model, turned into a world you can see.**

---

## 5. What the gardener does with all this

### 5.1 Which help fits

The gardener never says *why* someone feels the way they do. It only chooses *which kind of help* to offer.

The gardener checks these in order and acts on the first that applies:

| # | Situation | Offer |
|---|---|---|
| 1 | Sky Drizzle or worse **for 14 days running** | A private, gentle pointer to real support, such as the university counselling service. Shown once, and easy to dismiss. |
| 2 | Sky Drizzle or worse, island **not** low (sinking under 0.5), and the link below 0.15 or still being learned | **Not a schedule fix.** Rest, or a friend across the bridge. *"Today wasn't a busy day, so it might not be your schedule."* |
| 3 | Island low (sinking 0.65 or more), or a heavy day ahead | A schedule fix: move a block marked *can wait*, or keep an evening free. Exception: when the sky is Drizzle or worse and the link is known to be below 0.15, the offer is rest instead, because schedule fixes have not tracked this student's feelings. |
| – | Anything else, including one bad day | Nothing. One day is noise. |

The rules decide when the gardener speaks and which kind of help fits. Within that, Gemini suggests the idea itself from a summary of the week (kinds of activity and hours, never titles), choosing only from free times and *can wait* blocks the app offers. The app checks the choice and shows it only while that time is still free. If Gemini is unavailable or its idea doesn't check out, the app's own ideas take over: move something that can wait, an early night, a walk, tea with a friend, or a slow evening. Row 1 is always the same fixed text and is never written by AI.

### 5.2 When the island asks

| Rule | Value |
|---|---|
| Activities asked about | Today's blocks of 30 minutes or more that have ended, straight after the evening's "How are you?". Rest blocks are rarely asked about. |
| Chance of asking about an activity | `1 ÷ √(answers for that kind + 1)` plus `0.3 × |worn|`, kept between 0.15 and 1 |
| Activity questions a day | At most 2, one per kind: the kinds the island knows least first, then the longest activity |
| Mood question | Once, in the evening (a single phone notification from 20:00), unless already answered |
| Quiet hours | No questions from 22:00 to 08:00, or during an activity |
| Ignored questions | Three unanswered in a row halve the asking for a week |
| Golden window | One notification to everyone in the sky the minute it opens (phone and desktop), outside quiet hours. It expires with the window, and isn't shown while the island is already on screen |

Asking most about what it is least sure of is **uncertainty sampling** from active learning [14]. The chance never falls below 0.15, because the same activity can still feel different on another day. So the island asks less as it learns, and never stops checking.

---

## 6. What the island never does

- It never diagnoses, labels, or explains a feeling.
- It never asks why someone feels bad.
- It never puts anything on the plan until the student taps it.
- It never shows friends hours, titles, or answers to "How draining was that?"
- It never lets AI decide a number. Gemini sorts imported event titles into kinds, and suggests and words the gardener's ideas from options the app offers and checks. The arithmetic above decides everything else.

---

## 7. Honest limits

- **Learning takes weeks.** At about two answers a day, the costs settle in two to three weeks, and the link needs about a month. In a one-week pilot, students see their normal week (from calendar history) and the forecast, but little personal learning. The interface says *still learning* until there is enough data.
- **The workload ratio is debated.** Sports scientists question whether the acute:chronic ratio predicts injury [15]. Island Life uses it only to compare a week with the same person's normal week, not to predict harm.
- **A link is not a cause.** It is used only to choose what kind of help to offer.
- **Self-report is subjective.** That is the point: the island measures how the week feels *to you*, which no calendar can.

---

## References

1. Csikszentmihalyi, M., & Larson, R. (1987). Validity and reliability of the experience-sampling method. *Journal of Nervous and Mental Disease, 175*(9), 526–536.
2. Shiffman, S., Stone, A. A., & Hufford, M. R. (2008). Ecological momentary assessment. *Annual Review of Clinical Psychology, 4*, 1–32.
3. Foster, C., Florhaug, J. A., Franklin, J., Gottschall, L., Hrovatin, L. A., Parker, S., Doleshal, P., & Dodge, C. (2001). A new approach to monitoring exercise training. *Journal of Strength and Conditioning Research, 15*(1), 109–115.
4. Borg, G. A. (1982). Psychophysical bases of perceived exertion. *Medicine and Science in Sports and Exercise, 14*(5), 377–381.
5. Hulin, B. T., Gabbett, T. J., Blanch, P., Chapman, P., Bailey, D., & Orchard, J. W. (2014). Spikes in acute workload are associated with increased injury risk in elite cricket fast bowlers. *British Journal of Sports Medicine, 48*(8), 708–712.
6. Gabbett, T. J. (2016). The training–injury prevention paradox: should athletes be training smarter and harder? *British Journal of Sports Medicine, 50*(5), 273–280.
7. Williams, S., West, S., Cross, M. J., & Stokes, K. A. (2017). Better way to determine the acute:chronic workload ratio? *British Journal of Sports Medicine, 51*(3), 209–210.
8. Banister, E. W., Calvert, T. W., Savage, M. V., & Bach, T. (1975). A systems model of training for athletic performance. *Australian Journal of Sports Medicine, 7*, 57–61.
9. Meijman, T. F., & Mulder, G. (1998). Psychological aspects of workload. In P. J. D. Drenth, H. Thierry, & C. J. de Wolff (Eds.), *Handbook of Work and Organizational Psychology, Vol. 2: Work Psychology* (pp. 5–33). Psychology Press.
10. Widrow, B., & Hoff, M. E. (1960). Adaptive switching circuits. *IRE WESCON Convention Record, Part 4*, 96–104.
11. Efron, B., & Morris, C. (1975). Data analysis using Stein's estimator and its generalizations. *Journal of the American Statistical Association, 70*(350), 311–319.
12. Demerouti, E., Bakker, A. B., Nachreiner, F., & Schaufeli, W. B. (2001). The job demands–resources model of burnout. *Journal of Applied Psychology, 86*(3), 499–512.
13. Bakker, A. B., & Demerouti, E. (2007). The Job Demands–Resources model: state of the art. *Journal of Managerial Psychology, 22*(3), 309–328.
14. Settles, B. (2009). *Active Learning Literature Survey* (Computer Sciences Technical Report 1648). University of Wisconsin–Madison.
15. Impellizzeri, F. M., Tenan, M. S., Kempton, T., Novak, A., & Coutts, A. J. (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *International Journal of Sports Physiology and Performance, 15*(6), 907–913.
16. Kahneman, D., Krueger, A. B., Schkade, D. A., Schwarz, N., & Stone, A. A. (2004). A survey method for characterizing daily life experience: The day reconstruction method. *Science, 306*(5702), 1776–1780.
