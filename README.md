# Personal Learning OS (PLOS)

> An evidence-grounded, private, single-user Learning Orchestration System powered by deterministic intelligence and human-in-the-loop safety.

---

## 🌟 Key Architecture & Capabilities

The Personal Learning OS is architected around **ONE Single Learning Orchestrator Agent** with a strictly bound, deterministic 14-state machine, grounded evidence corroboration, and complete multi-session continuity.

### Core Architecture Highlights:
- **Phase 1: Ground-Truth Evidence Foundation**: Pure empirical telemetry across tasks, journal logs, notes, mistake reviews, LeetCode submissions, and GitHub commits. Zero fabricated skill scores or mastery claims.
- **Phase 2: Single Orchestrator State Machine**: Exactly 14 canonical states (`IDLE`, `GOAL_RECEIVED`, `OBSERVING`, `CORROBORATING`, `ASSESSING`, `PLANNING`, `TOOL_SELECTION`, `EXECUTING`, `VERIFYING`, `UPDATING`, `REPLANNING`, `COMPLETED`, `FAILED`, `WAITING_FOR_APPROVAL`).
- **Phase 3: Safe Read Tools**: Multi-source telemetry aggregation with explicit epistemic status tagging (`OBSERVED`, `SELF_REPORTED`, `INFERRED`, `EXTERNALLY_VERIFIED`).
- **Phase 4: Planning & Execution Verification**: Explicit success and verification criteria without speculative assumptions.
- **Phase 5: Controlled Writes & Human Approval Gate**: All state-mutating tools (`create_task`) strictly require explicit human confirmation. Rejection produces zero side effects; approval executes with SHA-256 idempotency deduplication and post-write verification.
- **Phase 6A–6G: Intelligent Pedagogical Engine**:
  - **6A Goal Understanding**: Natural language decomposition and clarification generation for ambiguous inputs.
  - **6B Evidence-Aware Assessment**: Multi-source skill evaluations preserving contradictions and evidence gaps.
  - **6C Action Selection**: **Sole authority** for choosing next pedagogical actions (`PRACTICE`, `CORROBORATE_EVIDENCE`, `DEEP_DIVE`, `REVIEW_MISTAKES`, `CLARIFY_GOAL`, `ASSESS_PREREQUISITE`).
  - **6D Decision-to-Plan Bridge**: Grounded transformation into actionable, capability-supported plan steps.
  - **6E Outcome & Feedback Loop**: Post-execution evaluation distinguishing action completion from actual learning evidence.
  - **6F Longitudinal Trajectory**: Temporal observability and directional trend analysis over multi-session history.
  - **6G Adaptive Policy**: Dynamic adaptation guidance (`PRESERVE_SUCCESSFUL_PATTERN`, `INCREASE_REVIEW_FOCUS`, `NARROW_LEARNING_SCOPE`, `REQUEST_MORE_EVIDENCE`).
- **Phase 7: Student Experience Entry Point**: Seamless, unified interactive AI Learning Assistant on the Executive Command Center dashboard.
- **Phase 8: Real Learning Execution & Feedback**: Step-by-step interactive workflow with transparent *What*, *Why*, *Target Skill*, *Expected Outcome*, and *Verification Criteria*.
- **Phase 9: Intelligent Learning Continuity**: Cross-session journey restoration detecting `IN_PROGRESS`, `COMPLETED`, `BLOCKED`, and `STALE` states, preventing duplicate task creation and inheriting prior trajectory.
- **Phase 10: Production Hardening**: End-to-end type safety, tenant isolation, and comprehensive regression verification.

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js (v18+ or v20+)
- npm or pnpm
- Supabase project credentials (URL & Service Role Key / Anon Key)

### 2. Environment Configuration
Create a `.env.local` file with the following keys:
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Optional: Gemini API Key for narrative enrichment (system runs deterministically without it)
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Installation
```bash
npm install
```

### 4. Running Development Server
```bash
npm run dev
```
Navigate to [http://localhost:3000](http://localhost:3000).

---

## 🧪 Verification & Testing

To run the complete suite of regression and integration verification tests:

```bash
# Phase 10 Final Integration Suite
npx tsx tests/run-phase10-final-integration-verification.ts

# Phase 9 Learning Continuity Suite
npx tsx tests/run-phase9-learning-continuity-verification.ts

# Phase 8 Real Execution Feedback Suite
npx tsx tests/run-phase8-real-execution-feedback-verification.ts

# Phase 7 Student Experience Suite
npx tsx tests/run-phase7-student-experience-verification.ts

# Phase 6G Adaptive Policy Suite
npx tsx tests/run-adaptation-policy-verification.ts

# TypeScript Type Check
npx tsc --noEmit

# ESLint
npm run lint

# Production Build
npm run build
```

---

## 🛡️ Safety & Architectural Invariants

- **Agent Count**: Strictly **ONE** Single Learning Orchestrator. No swarms, subagents, or background actors.
- **State Machine**: Preserved exactly **14 canonical states**.
- **Action Selection**: Phase 6C is the **sole authority** for next action selection.
- **Write Approval**: Phase 5 human approval is **mandatory** for state-mutating actions.
- **Evidence Integrity**: Zero fabricated scores or skills. Purely empirical.
- **Database Schema**: 100% reuse of existing Supabase tables. No unnecessary migrations.
