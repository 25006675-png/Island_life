# The science behind Island Life

> **Island Life isn't a metaphor we made up. It's a well-established burnout model, turned into a world you can see.**

Island Life borrows from two fields that have measured workload and strain for decades:

- **Sports science**, which works out how hard each athlete is training without breaking them.
- **Occupational psychology**, which studies why work leads to burnout.

This page explains each idea in plain words: where it comes from, what Island Life takes from it, and what we are careful *not* to claim. The exact formulas are in [algorithm.md](algorithm.md).

---

## At a glance

| Idea | Field | Island Life uses it for |
|---|---|---|
| [Session-RPE](#1-session-rpe-how-hard-was-that) | Sports science | "How draining was that?" × how long it took = the load of one activity |
| [Acute:chronic workload](#2-the-acutechronic-workload-ratio-this-week-against-your-normal) | Sports science | Altitude: this week against *your* normal week |
| [Fitness–fatigue model](#3-the-fitnessfatigue-model-load-wears-you-down-then-fades) | Sports science | The same lecture feeling heavier after three late nights |
| [Effort–Recovery model](#4-the-effortrecovery-model-recovery-is-the-point) | Occupational psychology | How fast rest brings each student back |
| [Job Demands–Resources model](#5-the-job-demandsresources-model-the-whole-island) | Occupational psychology | The whole island: demands sink it, resources hold it up, strain shows in the sky |
| [Experience sampling and day reconstruction](#6-asking-while-its-fresh-experience-sampling-and-day-reconstruction) | Psychology research | Short questions the same evening, while the day is fresh |
| [Learning from few answers](#7-learning-from-few-answers) | Statistics, machine learning | Learning each student's costs from a handful of taps, without overreacting |

---

## 1. Session-RPE: "How hard was that?"

**What it is.** In 2001, exercise scientist Carl Foster proposed a simple way to measure training load [3]. After each session, the athlete rates how hard it felt. The rating is multiplied by the session's length, and the result is that session's load. It builds on Gunnar Borg's work on *perceived exertion* [4]: how hard something feels is a valid measurement in itself, not a rough guess at a "real" number.

**Where it is used.** Professional and university sports teams use it every day to track training load, because it costs nothing and needs no equipment.

**What Island Life takes.** After an activity, the island asks *"How draining was that?"* (Light, Okay or Draining), and multiplies the answer by how long the activity lasted:

```
load of an activity = how draining it felt × hours
```

So three hours of revision can weigh more than three hours of band practice, *for this student*. A calendar alone could never tell the difference.

---

## 2. The acute:chronic workload ratio: this week against your normal

**What it is.** Sports scientists noticed that injuries cluster when an athlete's training suddenly jumps above what they are used to [5, 6]. They compare the **acute** load (roughly the last week) with the **chronic** load (roughly the last month). A big jump above an athlete's own normal is the warning sign, not heavy training in itself. A refinement weights recent weeks more heavily, using an exponentially weighted average [7].

**Where it is used.** Elite football, rugby and cricket teams use it to manage players' training weeks.

**What Island Life takes.** The island compares **this week with your own normal week**:

| This week against your normal | Island |
|---|---|
| half or less | high in the sky |
| about the same | mid-sky |
| one and a half times or more | down at the cloud sea |

The student who always does 50 hours is not sunk by 50 hours. The one who usually does 20 is sunk by 35. That is what *"heavy means something different for everyone"* looks like as a rule.

**What we don't claim.** Some sports scientists question whether this ratio actually *predicts injury* [15]. Island Life uses it only to compare a week with the same student's own normal week. It does not predict harm. Fixed limits also stop chronic overload from quietly becoming "normal" (see [algorithm.md, 2.5](algorithm.md#25-guardrails-on-altitude)).

---

## 3. The fitness–fatigue model: load wears you down, then fades

**What it is.** In 1975, Eric Banister described training as two effects running at once [8]. Every session builds fatigue, and fatigue fades over the following days. How you perform depends on what is still left over from recent days.

**What Island Life takes.** The same lecture feels easy on Monday and exhausting on Thursday after three late nights. So the island does not give each activity one fixed weight. It keeps a running sense of how **worn down** the student is, from the days just before. Recent days count most and older days fade, which is how the island can expect Thursday to feel heavier than Monday.

---

## 4. The Effort–Recovery model: recovery is the point

**What it is.** In occupational psychology, Meijman and Mulder's Effort–Recovery model [9] says effort itself is not harmful. Strain builds up when there is **not enough recovery** between efforts.

**What Island Life takes.** Students recover at different speeds. The island tries three recovery speeds and keeps whichever best matches each student's own answers. It then tells them in words: *"You usually bounce back within a couple of days."* This is also why rest earns dewdrops just like study does. In this model, rest is not time off from the work; it is part of it.

---

## 5. The Job Demands–Resources model: the whole island

**What it is.** The Job Demands–Resources (JD-R) model [12, 13] is one of the most widely used models of burnout. It says:

- **Demands** (workload, pressure, deadlines) drain energy.
- **Resources** (support, recovery, people around you) refill it and protect against strain.
- **Strain** is what you feel when demands outrun resources for too long.

**What Island Life takes.** The island *is* this model, drawn as a place:

| JD-R model | Island Life |
|---|---|
| Demands | Your schedule → **altitude** |
| Resources | Rest, friends, recovery → **bridges, rest blocks, notes, shared tasks** |
| Strain | How you feel → **weather** |

**The idea JD-R gives us: workload and feelings are linked, but not always.** For some students, mood follows the schedule closely. For others it barely does, because their hard weeks come from sleep, people, home or money. Island Life does not assume either. It **measures how linked they are for each student**, and uses that only to choose what kind of help to offer:

| What the island sees | What the gardener offers |
|---|---|
| A heavy week, and feelings follow the schedule | A schedule fix: move something marked "can wait" |
| A light week, but a heavy sky | **Not** a schedule fix: rest, or a friend across the bridge. *"It might not be your schedule."* |
| A grey sky for two weeks running | A gentle, private pointer to real support, such as the university's counselling service |

A planner only sees the schedule, and a mood tracker only sees feelings. Island Life sees both, so it can notice *which one is the problem*.

---

## 6. Asking while it's fresh: experience sampling and day reconstruction

**What it is.** The experience-sampling method [1] and ecological momentary assessment [2] are standard psychology research methods. Instead of asking people at the end of the week how it went, they ask briefly and often, close to the moment. People remember a whole week badly, but they rate the last hour well. Asking after every activity is tiring, though, so Kahneman and colleagues built the **Day Reconstruction Method** [16]: people go back over the day's activities that same evening. It gives a picture close to experience sampling with far fewer interruptions.

**What Island Life takes.** Two short questions, each one tap:

| Question | When | It changes |
|---|---|---|
| "How are you?" | Once, in the evening | The sky (a lantern, then the weather) |
| "How draining was that?" | Straight after, about one or two of the day's activities | The island's height |

Questions about **things** move the island. Questions about **you** change the sky. Feelings are never predicted, only asked.

To avoid the fatigue that frequent questions cause, the whole day costs one notification: at most two activity questions, one per kind, none at night or during an activity, and fewer if the student starts ignoring them.

---

## 7. Learning from few answers

Three well-known ideas let the island learn from a handful of taps without overreacting to any one of them:

- **The delta rule** [10]. After each answer, the island nudges its estimate a little towards what the student said: further when it was more wrong, less when it was nearly right. It is one of the oldest learning rules in machine learning, and simple enough to explain in one sentence.
- **Shrinkage towards a sensible default** [11]. Every student starts from the same reasonable defaults. Each default counts as five answers, so the first few taps move things gently. The more a student answers, the more the island becomes theirs.
- **Uncertainty sampling** [14]. The island asks most about what it is least sure of: a new kind of activity, or an unusual stretch of days. So **it asks less the better it knows you**, but never stops checking, because the same activity can feel different another day.

---

## What Island Life deliberately does not do

These lines come from the same research, read carefully:

- **It never diagnoses.** It never labels a student or explains why they feel the way they do. It only chooses *which kind of help* to offer.
- **It never asks why** someone feels bad.
- **It never lets AI decide a number.** Gemini sorts calendar entries into kinds, and suggests the gardener's idea from free times the app has found, which the app checks before showing. The rules above decide everything else, and they can be read and tested.
- **It never puts anything on a plan** until the student taps it.

---

## How to say it in the pitch

- *"Most apps count hours. Island Life asks one question about your day's activities, the same one elite sports teams ask their athletes: how hard was that?"*
- *"Your island sinks when this week is heavier than **your** normal week, the way coaches compare an athlete's last week with their last month."*
- *"When your feelings don't match your schedule, Island Life notices it isn't about your timetable, and stops suggesting timetable fixes."*
- *"Island Life isn't a metaphor we made up. It's a well-established burnout model, turned into a world you can see."*

## Questions judges may ask

**"Isn't the acute:chronic ratio debated?"**
Yes, as a *predictor of injury* [15]. We don't use it to predict anything. We use it to compare a week with the same student's own normal week, and fixed limits catch real overload whatever the ratio says.

**"How much data does it need?"**
On day one, the student's normal week comes from four weeks of imported calendar history. Learning what drains *them* takes about two to three weeks of answers, and the app says *"still learning"* until then. In a one-week pilot, students see their normal week and the forecast, but little personal learning, and we say so.

**"Isn't self-report subjective?"**
That's the point. The island measures how the week feels *to you*, which no calendar can. Sports science made the same choice with session-RPE [3, 4]: how hard a session felt captures intensity that counting minutes misses.

**"Why not just let AI work it out?"**
A model that judges your week can't be explained, can't be checked, and isn't personal. These rules fit on one page ([algorithm.md](algorithm.md)), are covered by tests, and learn from each student's own answers. AI gets one bounded job: once the rules say the gardener should speak, Gemini suggests the idea, picking only from free times the app found.

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
