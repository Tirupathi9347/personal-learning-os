# Personal Learning OS (PLOS)

> **An evidence-grounded AI learning system that turns a student's real learning data into a personalized roadmap, daily learning path, adaptive feedback, and proactive guidance.**

## Why PLOS?

Most learning platforms give students content.

**PLOS helps decide what the student should do next — based on evidence of what they already know, what they struggle with, and how they are progressing.**

It connects the student's learning history into one continuous loop:

```text
Student Goal
    ↓
Understand the Goal
    ↓
Check Real Learning Evidence
    ↓
Assess Current Level
    ↓
Choose the Next Action
    ↓
Build a Personalized Roadmap
    ↓
Student Accepts / Edits the Plan
    ↓
Learning Path + Daily Execution
    ↓
Measure Outcomes
    ↓
Adapt Future Learning
    ↓
Continue the Journey
```

## Core Features

### 🧠 Evidence-Grounded Learning Coach
The Learning Coach analyzes available student evidence from:

- Skills and profile
- Tasks and completion history
- Study sessions
- Mistakes and recurring patterns
- Notes and journal entries
- Projects
- GitHub activity, when connected
- LeetCode activity, when connected
- Previous learning outcomes and trajectory

It does **not** invent student performance or external activity.

### 🗺️ Personalized Day-by-Day Roadmaps
A roadmap is generated for the student's actual level and timeframe.

For example:

```text
Day 1 — Topic A
Learn → Practice → Review
~ 45 min

Day 2 — Topic B
Learn → Practice → Review
~ 90 min

Day 3 — Topic C
...
```

Existing strengths can receive lighter review, while weak or contradictory evidence can receive more practice and remediation.

Students can edit **time and priority** before adding the roadmap to their Learning Path.

### 📚 Learning Path
Accepted roadmaps become persistent learning journeys.

Students can see:

- Current day
- Upcoming days
- Completed activities
- Progress by day
- Overall progress
- What to learn
- What to practice
- What to review
- Next action

### 📅 Today's Learning
The Dashboard turns the saved Learning Path into a daily action list.

```text
TODAY — DAY 2

→ Practice recursion       45 min
○ Review mistakes          20 min
○ Complete today's task    30 min

[ Continue Learning ]
```

Manual tasks remain separate from Learning Path activities.

### 🔄 Adaptive Learning Loop
After real learning activity is completed:

```text
Outcome
  ↓
Trajectory
  ↓
Adaptation Signal
  ↓
Next Learning Decision
```

The system can adjust future learning without rewriting completed history.

### 🤖 Learning Autopilot
PLOS can proactively detect meaningful situations such as:

- falling behind on the Learning Path
- excessive daily workload
- recurring learning mistakes

It explains **what it detected, why it matters, and what it recommends**.

Persistent actions remain behind human approval.

### 🔐 Human-Controlled Actions
The system can prepare actions, but state-changing operations require explicit student confirmation.

Example:

```text
PLOS detected a recurring SQL mistake.

Recommended:
Add a focused remediation task.

[ Approve ]   [ Not Now ]
```

## Agent Architecture

PLOS uses a **single Learning Orchestrator**, not a swarm of independent runtime agents.

It operates through a controlled 14-state workflow:

```text
IDLE
  ↓
GOAL_RECEIVED
  ↓
OBSERVING
  ↓
CORROBORATING
  ↓
ASSESSING
  ↓
PLANNING
  ↓
TOOL_SELECTION
  ↓
EXECUTING
  ↓
VERIFYING
  ↓
UPDATING
  ↓
COMPLETED
```

Additional controlled states handle replanning, failure, and human approval.

### Architecture principles

- **Single orchestrator**
- **Deterministic-first reasoning**
- **Evidence before inference**
- **6C as the action-selection authority**
- **Human approval for state-changing writes**
- **Authenticated, user-scoped persistence**
- **No fabricated student telemetry**
- **No silent rewriting of learning history**

Gemini can provide optional narrative enrichment, but it does not override the deterministic evidence, decision, safety, or verification layers.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, TypeScript |
| UI | Tailwind CSS, responsive design system |
| Backend | Next.js Server Actions |
| Database | Supabase / PostgreSQL |
| AI | Gemini (optional narrative enrichment) |
| External Data | GitHub + LeetCode integrations |
| Validation | TypeScript, ESLint, automated verification suites |
| Deployment | Vercel |

## Project Structure

```text
src/
├── app/                # Routes, layouts, server actions
├── components/         # UI components
├── lib/
│   └── agent/          # Learning Orchestrator and intelligence layers
├── types/              # Shared application types
└── ...

supabase/               # Database schema / SQL
tests/                  # Verification suites
public/                 # Static assets
```

## Getting Started

### 1. Clone

```bash
git clone https://github.com/Tirupathi9347/personal-learning-os.git
cd personal-learning-os
```

### 2. Install

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Add the required values to `.env.local`.

**Never commit `.env` or `.env.local`.**

### 4. Start development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 5. Production checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Demo Flow

For a quick demonstration:

1. Open **Learning Coach**
2. Enter:

   **"I need to learn coding basics in 2 days according to my level."**

3. Review the evidence-grounded starting point.
4. Inspect the personalized day-by-day roadmap.
5. Edit time or priority if needed.
6. Click **Add to Learning Path**.
7. Open **Learning Path**.
8. Return to the Dashboard and view **Today's Learning**.
9. Complete an activity.
10. Show progress and the adaptive feedback loop.
11. Demonstrate **Learning Autopilot** detecting a problem and proposing an action.

## Data & Safety

PLOS is designed around a simple rule:

> **If the system does not have evidence, it should say so.**

- Student data is user-scoped.
- Row Level Security is used for protected database access.
- External integrations are not fabricated.
- State-changing actions require explicit approval.
- Learning progress comes from persisted completion data.
- Demo/seed data can be separated and cleared before starting fresh personal use.

## What Makes PLOS Different?

PLOS is not just:

**AI + Study Plan**

It is:

**Student Evidence + Decision Engine + Learning Path + Execution + Feedback + Adaptation + Continuity + Autopilot**

The goal is to create a learning system that continuously answers:

> **"Given where I am right now, what is the most useful thing for me to do next?"**

## Status

**Submission-ready prototype / working product demo**

The project includes automated verification across the major learning, persistence, safety, and agentic workflows.

---

### Built with a focus on

**Personalization • Evidence • Explainability • Adaptation • Human Control**
