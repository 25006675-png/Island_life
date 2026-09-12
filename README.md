
# Island Life

<p align="center">
  <img src="docs/images/Banner.png" alt="Banner" width="100%" />
</p>

**Team:** Codenected  
**Team Member:** Lee Kai Hong, Leow Shen En, Choong Zhuo Lin, Chung Jun  
**Problem Statement:** Stress & Workload Manager

## Project Links

- **Video Presentation:** _To be added_
- **Presentation Slides:** _To be added_
- **Prototype:** [Island Life Prototype](https://island-life-one.vercel.app/)



# 1. Project Overview

## 1.1 Problem

Today’s university students live in a state of continuous overcommitment, constantly striving to balance:

- Demanding academics
- Co-curricular leadership
- Sports
- Part-time jobs
- Vibrant social lives

By defaulting to saying **"yes" to every opportunity**, students inevitably trigger severe burnout and emotional vacancy—ending up with a sense of doing everything, yet feeling empty and accomplishing nothing.

This issue stems from a fundamental flaw in current productivity solutions:

- Traditional tools such as standard **Pomodoro timers** rely on rigid countdowns and flat, 2D interfaces that treat users like machines, completely unable to sense mental fatigue or burnout states.
- Energy-tracking apps such as **Pensus** capture biological energy metrics but deliver them through clinical, uninspired interfaces that lack creativity and personal engagement.

These limitations leave three core stakeholder groups underserved:

1. **Gen Z university students**
   - Need aesthetic, visual-first tools to express themselves.
   - Need better ways to manage their mental bandwidth.

2. **Peer groups**
   - Lack collaborative spaces for shared accountability and study sessions.

3. **University support networks**
   - Bear the cost of student mental health crises.

**Island Life** directly addresses this gap by transforming routine focus management into an immersive, customizable **3D island-building experience** that inherently understands burnout and empowers friends to build healthy study habits together.



## 1.2 Our Solution

Island Life translates a student's week into an immersive, floating **3D island in the sky** that makes mental load visible before burnout hits.

Built with **Three.js** and custom **Blender assets**, the platform:

- Converts scheduled commitments across **seven activity categories** into growing trees.
- Uses the island’s physical **altitude** to represent weekly workload density.
- Transforms real-time **weather** based on emotional check-ins.
- Uses an ambient **AI Gardener** to monitor fatigue trends.
- Suggests pre-scheduled, **single-tap rest activities** rather than enforcing rigid study marathons.
- Provides a daily **2-minute "Golden Window"** photo prompt for friends to share authentic BeReal-style study moments.
- Connects peer islands through **privacy-first bridges** that display emotional weather rather than private calendars.
- Replaces streak penalties with a guilt-free **"Let Go"** mechanic.
- Values and rewards **rest equally with work**.

Island Life turns daily focus into a shared, supportive journey toward **sustainable mental balance**.



# 2. Ideation & Process

## 2.1 Ideas We Considered

The following table summarizes the ideas explored during ideation and explains why each concept was either **chosen** or **dropped**.

| Idea | Decision / Reason |
|---|---|
| **Personalized 3D Island World (3D Sky Island)** — **Chosen** | Replaces flat 2D dashboards with an interactive Three.js 3D sanctuary. Translates weekly load into physical island altitude and emotions into dynamic weather, making burnout instantly visible without charts. |
| **1-Tap Photo Check-Ins ("The Golden Window")** — **Chosen** | Inspired by BeReal, a daily 2-minute dual-camera check-in captures authentic, unfiltered study moments. Photos are displayed on The Gathering Island carousel, offering real social proof without fake timers. |
| **Shared Peer Bridges & Gathering Island** — **Chosen** | Connects friends through physical bridges and shared hubs. Friends can see emotional weather and altitude, leave gate notes, and complete group wellness tasks while keeping private plans **100% confidential**. |
| **Empathic AI Gardener & Rest Nudge** — **Chosen** | Monitors emotional check-ins and workload density. Automatically suggests personalized, pre-scheduled rest activities such as tea breaks, walks, or early sleep that can be applied in one tap to prevent burnout before it happens. |
| **Guilt-Free "Let Go" & Balanced Rewards** — **Chosen** | Eliminates anxiety-inducing streak counters. Letting go of a task causes its glass tree to quietly drift away without penalty, while resting earns the same reward—**Dewdrops 💧**—as studying. |
| **Visual Activity Trees & Timetable Clock Path** — **Chosen** | Classifies seven activity types into distinct tree species, using glass trees for upcoming tasks and solid trees for completed tasks. Today's schedule is rendered as a glowing clock-face path walked by a light in real time. |
| **Blender MCP Server Pipeline** — **Chosen** | Uses a **Model Context Protocol (MCP)** server running Python scripts to control Blender, automating 3D asset generation and scene creation to dramatically speed up development. |
| **Forest-Style Single-Player Tree Planting** — **Dropped** | Forest is an isolating 2D experience that relies on passive timers, which can easily be faked, and punishes users with dead trees when stopping early. This can induce guilt rather than encourage healthy balance. |
| **Crypto-Reward / Tokenomics Concept** — **Dropped** | Mentor Zach advised dropping the concept because Web3/crypto rewards are overused in hackathon pitches, create unnecessary transaction friction, and distract from the core wellness and mental-health goals. |
| **Traditional Virtual Garden Concept** — **Dropped** | Mentor Zach advised dropping the concept because standard 2D/3D garden plots are saturated and generic. It was replaced by the floating 3D sky island, where altitude, weather, and trees directly represent mental-health metrics. |
| **Audio Analysis & Automated AI Pathfinder** — **Dropped** | Audio tracking is invasive to user privacy. Automated pathfinders may also present schedule adjustments with false confidence, potentially leading users through inaccurate sequences if fatigue or priorities are misinterpreted. |

---

## 2.2 Ideation Boards

![Ideation Board](docs/images/Island_Life_Ideation_Board-1.png)

### This is explanation
---

## 2.3 Mentor Consultation

| Date | Mentor | Feedback Received | What Was Changed |
|---|---|---|---|
| **5 Sept 2026** | **Zach Khong** | During our design review, mentor Zach advised us to discard generic **"virtual garden"** and **"crypto-reward"** mechanics because they are overused and lack differentiation. Instead, he validated our strongest visual and social features: the **1-tap BeReal-style photo check-ins** and our **interactive 3D island model**. Architecturally, he recommended using an **MCP server connected to Blender** for streamlined 3D asset generation, paired with **Three.js** to render dynamic, customizable 3D web environments. We also refined the product by synthesizing feature sets from leading focus and energy tools such as **Opal** for focus enforcement and **Uplift / Operator** for smart energy and session tracking. | We completely eliminated generic virtual-garden and crypto-reward mechanics and focused on our two strongest innovations: **interactive 3D environments** and **1-tap BeReal-style photo check-ins**. Rather than creating an isolating single-player task manager, we designed **George Island** as a community-driven ecosystem where users coexist in shared visual spaces while retaining deep personal aesthetic customization. To build this vision under hackathon constraints, we deployed an **MCP server** to programmatically control Blender for automated asset generation and paired it with **Three.js** for animated web environments. We also benchmarked leading productivity applications, combining **Opal’s focus enforcement**, **Operator/Uplift’s ambient energy tracking**, **Pensus’s energy awareness**, and **traditional Pomodoro intervals** into a cohesive wellness platform aimed at combating burnout. |





# 3. Design & Prototype

## Prototype

**Live Prototype:**  
[https://island-life-one.vercel.app/](https://island-life-one.vercel.app/)




### Recommended Screens

Embed or link approximately **4–8 key screens** and provide a short caption explaining the interaction shown in each.

Suggested examples:

1. Personal 3D Island
2. Weekly workload visualization
3. Emotional weather system
4. AI Gardener rest suggestion
5. Golden Window photo check-in
6. Gathering Island
7. Peer bridge interaction
8. "Let Go" task interaction



# 4. What Makes It Different

Island Life differentiates itself by combining an expressive **3D environment**, real-world focus verification, burnout-aware mechanics, privacy-preserving social interaction, and procedural customization.

## Competitive Comparison

| Feature | **Island Life** | **Forest** | **Pensus** | **Pomodoro** | **Operator / Uplift** |
|---|---|---|---|---|---|
| **Core Visual & World Experience** | **Interactive 3D Web Environment** built with Three.js, featuring dynamic altitude, lighting, camera control, and weather. | Static, top-down 2D grid/forest layout with minimal visual depth. | Clinical 2D administrative dashboards with numbers, progress rings, and charts. | Minimalist 2D timers, numerical countdowns, or basic progress bars. | Agent OS / workspace dashboards with task logs, lists, and workflow UI. |
| **Proof of Focus Verification** | **1-Tap BeReal-Style Photo Check-Ins.** Dual-camera snapshots confirm real study setups and post to a shared carousel. | Passive countdown timer. Trees grow even if the phone sits idle on a desk while the user watches TV or sleeps. | Mechanical background timer with zero real-world activity verification. | Mechanical background timer with zero real-world activity verification. | Mechanical background timer with zero real-world activity verification. |
| **Burnout Prevention & Mental Wellness** | **Empathic Rest & Energy Loops.** The AI Gardener monitors fatigue, prompts single-tap rest, and rewards rest equally with **Dewdrops 💧**. | **Punitive design.** Stopping early kills a tree, potentially inducing guilt and encouraging continuous, draining study marathons. | **Analytical logging.** Tracks energy metrics but presents them as dry administrative logs. | **Rigid mechanics.** Enforces strict 25/5-minute intervals regardless of mental bandwidth or flow state. | **Predictive execution.** Optimizes task scheduling and agent workflows but lacks emotional or visual wellness mechanics. |
| **Social Co-Presence & Community** | **Privacy-Preserving 3D Bridges.** Users can visit peer islands, view emotional weather, leave gate notes, and complete group tasks together. | Primarily single-player focus. Shared study rooms only synchronize a timer number across users. | Solitary utility tool with no social or community mechanics. | Solitary utility tool with no social or community mechanics. | Team workspace feeds, command centers, or collaborative task-sharing pools. |
| **Asset & Environment Customization** | **Automated 3D Procedural Engine.** Uses Python scripts and Blender through an MCP server to generate dynamic 3D island assets. | Fixed, unlockable 2D virtual trees that lack personal identity or deep expression. | Basic UI theme changes such as light/dark mode and accent colors. | Basic UI theme changes such as light/dark mode and accent colors. | Basic UI theme changes such as light/dark mode and accent colors. |



# 5. Technical Architecture & Feasibility

## 5.1 Tech Stack

Document the project's:

- **Frontend**
- **Backend**
- **Database**
- **APIs**
- **External services**
- **Hosting infrastructure**

For each technology, explain:

1. **Why it was selected**
2. **What role it performs**
3. **What limitations or constraints are expected**

For example, if a service such as Supabase is selected because it offers a free tier, also document any technical constraints such as the need for a proxy or service limits.

### Current Technologies Mentioned

| Technology | Purpose |
|---|---|
| **Three.js** | Renders the interactive 3D island environment directly in the browser. |
| **Blender** | Creates and manages custom 3D assets. |
| **Python** | Controls automated asset-generation scripts. |
| **Model Context Protocol (MCP) Server** | Connects programmatic workflows with Blender to accelerate asset and scene generation. |
| **Vercel** | Hosts the current prototype. |

---

## 5.2 System Architecture


---

## 5.3 Future Plan

### 1. Calendar Sync

Classes, shifts, and deadlines would automatically appear on the user's island without requiring manual re-entry.

The planner already demonstrates the connection flow. Production integrations would include:

| Platform | Integration Method | Planned Capability |
|---|---|---|
| **Google Calendar** | Google Calendar API | Two-way synchronization |
| **Outlook / Microsoft 365** | Microsoft Graph | Two-way synchronization covering most university accounts |
| **Apple iCloud Calendar** | CalDAV | Calendar synchronization |
| **Canvas** | ICS calendar feed | Import coursework and calendar events |
| **Moodle** | ICS calendar feed | Import coursework and calendar events |
| **Blackboard** | ICS calendar feed | Import coursework and calendar events |
| **Google Classroom** | Google Classroom API | Import coursework due dates |

### 2. Mobile Version

Develop a mobile-optimized version featuring:

- A lighter 3D island
- Compressed models
- One-thumb controls
- Mobile-friendly interactions

The goal is to make the entire Island Life experience accessible **from a user's pocket**.

### 3. Real Accounts & Friends

Introduce a proper backend supporting:

- User accounts
- Friend invitations
- Persistent relationships
- Live emotional weather between friends
- Shared social interactions

### 4. Gentle Milestones

Introduce positive milestones that celebrate sustainable balance rather than productivity streaks.

Examples include:

- **First week in balance**
- **First slow evening**
- Other wellness-focused achievements

The objective is to reinforce sustainable habits without introducing guilt or pressure.



# Core Product Principles

Island Life is designed around several core principles:

- **Make workload visible instead of abstract.**
- **Prevent burnout rather than merely measure productivity.**
- **Reward rest as much as work.**
- **Provide social accountability without exposing private schedules.**
- **Use visual and emotional feedback instead of clinical dashboards.**
- **Avoid punishment-based streak mechanics.**
- **Create authentic proof of focus through real-world interactions.**
- **Make productivity feel expressive, social, and personally meaningful.**

---

# Summary

**Island Life** reimagines student productivity as an immersive social wellness experience.

Instead of presenting students with another timer, checklist, or administrative dashboard, it transforms their schedule, workload, emotional state, focus sessions, and rest into a living **3D island ecosystem**.

Its key differentiators include:

- 🌴 **Interactive 3D Sky Island**
- 🌦️ **Emotion-Driven Weather**
- 🌳 **Activity-Based Trees**
- 🤖 **Empathic AI Gardener**
- 📸 **Golden Window Photo Check-Ins**
- 🌉 **Privacy-Preserving Peer Bridges**
- 💧 **Balanced Dewdrop Rewards**
- 🍃 **Guilt-Free "Let Go" Mechanic**
- 🧑‍🤝‍🧑 **Shared Gathering Island**
- 🛠️ **Blender + MCP Procedural Asset Pipeline**

The central goal is not simply to help students **do more**, but to help them recognize when they are doing **too much**—and build healthier, more sustainable habits together.
  
<div align="center">
  <strong>Made by Team Codenected</strong>
  <br>
  <strong><em>© Codenection 2026<em>
</div>