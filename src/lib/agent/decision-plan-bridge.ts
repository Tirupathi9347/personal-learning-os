/**
 * Phase 6D: Decision-to-Plan Bridge Engine (Capability Reality & Execution-Safety Hardened)
 * 
 * Converts a Phase 6C LearningDecision into a valid, operational Phase 4 LearningPlan
 * that can be safely validated, prioritized, and executed by the SINGLE Learning Orchestrator.
 * 
 * Strict Capability Reality & Safety Rules:
 * 1. Strictly READ-ONLY: Produces an operational LearningPlan blueprint; zero task writes, zero DB mutations.
 * 2. Never invent capabilities: Only tools present in the actual Phase 3 ToolRegistry may be marked executable.
 * 3. Descriptive Action vs Executable Capability: If a desired pedagogical action lacks a registered tool
 *    (e.g. interactive diagnostic test runner), the step is explicitly marked BLOCKED and the capability
 *    is listed in unavailableCapabilities.
 * 4. Read vs Sync: Reading telemetry is NOT synchronizing telemetry. No external sync or refresh is claimed.
 * 5. Assessment Engine: The system has no automated mock test runner or grading engine. Prep steps represent
 *    self-paced practice without claiming automated mock exam scoring.
 * 6. Verifiable Criteria: Verification criteria must only reference actual observable sources (read tools,
 *    logged mistakes, study session records).
 * 7. Never invent deadlines: Preserves explicit timeframes or leaves them unstated.
 * 8. Clarification Gate: If clarification is needed, halts autonomous plan generation.
 * 9. Phase 4 Authority: Delegates plan construction, DAG validation, and dependency checking to Phase 4.
 */

import {
  DecisionPlanBridgeInput,
  DecisionPlanBridgeResult,
  DecisionPlanBridgeStatus,
} from './bridge-types';
import {
  LearningPlan,
  PlanStep,
  PlanPriority,
  PlanStatus,
  PlanStepStatus,
  CreatePlanInput,
} from './planning-types';
import { createLearningPlan, validatePlanDependencies } from './planning-model';
import { agentToolRegistry } from './tool-registry';
import './read-tools';
import './write-tool-create-task';
import { DEFAULT_AVAILABLE_CAPABILITIES } from './decision-action-selection';

export * from './bridge-types';

/**
 * Primary entry point: Bridge a LearningDecision into a Phase 4 LearningPlan.
 */
export async function bridgeDecisionToPlan(
  input: DecisionPlanBridgeInput
): Promise<DecisionPlanBridgeResult> {
  return bridgeDecisionToPlanDeterministic(input);
}

/**
 * Purely deterministic Decision-to-Plan bridge engine with strict capability verification.
 */
export function bridgeDecisionToPlanDeterministic(
  input: DecisionPlanBridgeInput
): DecisionPlanBridgeResult {
  const {
    decision,
    goalUnderstanding,
    assessment,
    availableCapabilities = DEFAULT_AVAILABLE_CAPABILITIES,
    timestamp = new Date().toISOString(),
  } = input;

  const userId = input.userId || decision.userId;
  const resolvedCapabilities = availableCapabilities ?? DEFAULT_AVAILABLE_CAPABILITIES;
  const planId = input.planId || `plan_bridge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // 1. Clarification Gate: If clarification is required, halt autonomous planning
  if (decision.clarificationNeeded || decision.decisionType === 'CLARIFY_GOAL') {
    return {
      status: 'CLARIFICATION_REQUIRED',
      decisionId: decision.decisionId,
      userId,
      decisionType: decision.decisionType,
      priority: decision.priority,
      confidence: decision.confidence,
      targetSkills: decision.targetSkills,
      primaryObjective: decision.primaryObjective,
      recommendedAction: decision.recommendedAction,
      clarificationQuestions: decision.clarificationQuestions || [],
      blockingReasons: ['Student clarification is required before an executable plan can be generated.'],
      rationale: decision.rationale,
      evidenceBasis: decision.evidenceBasis,
      contradictions: decision.contradictions,
      evidenceGaps: decision.evidenceGaps,
      requiredCapabilities: decision.requiredCapabilities,
      unavailableCapabilities: decision.unavailableCapabilities,
      generatedAt: timestamp,
      source: 'DETERMINISTIC',
      metadata: input.metadata,
    };
  }

  // 2. Determine target skill and goal statement
  const primaryTargetSkill = decision.targetSkills[0] || goalUnderstanding?.targetSkill || 'General Learning';
  const goalStatement = decision.goalReference || goalUnderstanding?.originalGoal || decision.primaryObjective;

  // 3. Generate candidate steps based on the canonical DecisionType
  const { candidateSteps, requiredTools, planConstraints } = generateStepsForDecisionType({
    planId,
    decision,
    primaryTargetSkill,
    goalUnderstanding,
    assessment,
    resolvedCapabilities,
    timestamp,
  });

  // 4. Audit tool capabilities against ToolRegistry and resolvedCapabilities
  const unavailableCapabilities: string[] = [];
  for (const tool of requiredTools) {
    const isRegistered = agentToolRegistry.hasTool(tool);
    const isAvailable = resolvedCapabilities.includes(tool);
    if (!isRegistered || !isAvailable) {
      if (!unavailableCapabilities.includes(tool)) {
        unavailableCapabilities.push(tool);
      }
    }
  }

  // If any required tool is missing, mark the dependent step as BLOCKED
  if (unavailableCapabilities.length > 0) {
    for (const step of candidateSteps) {
      if (step.requiredTools?.some((t) => unavailableCapabilities.includes(t))) {
        step.status = 'BLOCKED';
        const missingTools = step.requiredTools.filter((t) => unavailableCapabilities.includes(t));
        step.failureReason = `Requires unavailable tool capability: ${missingTools.join(', ')} (not registered in ToolRegistry)`;
      }
    }
  }

  // 5. Construct Phase 4 CreatePlanInput
  const planPriority: PlanPriority = decision.priority;
  const isBlocked = decision.decisionType === 'WAIT_FOR_MORE_EVIDENCE' || unavailableCapabilities.length > 0;
  const initialPlanStatus: PlanStatus = isBlocked ? 'BLOCKED' : 'READY';

  const createPlanInput: CreatePlanInput = {
    planId,
    userId,
    goal: goalStatement,
    objectives: [decision.primaryObjective],
    steps: candidateSteps,
    priority: planPriority,
    status: initialPlanStatus,
    targetSkill: primaryTargetSkill !== 'General Learning' ? primaryTargetSkill : null,
    constraints: [
      ...planConstraints,
      ...(goalUnderstanding?.constraints || []),
      ...(goalUnderstanding?.timeframe ? [`Timeframe: ${goalUnderstanding.timeframe}`] : []),
    ],
    successCriteria: [
      `Complete all assigned steps for objective: "${decision.primaryObjective}"`,
      `Empirically verify learning telemetry matches the intended action`,
    ],
    verificationCriteria: [
      `Evidence telemetry retrieved and audited against ground-truth standards`,
      `Zero unverified learning outcome claims`,
    ],
    approvalRequirement: {
      requiresApproval: decision.requiresHumanApproval,
      reason: decision.requiresHumanApproval ? 'High urgency or controlled action requires human review' : null,
    },
    metadata: {
      decisionId: decision.decisionId,
      decisionType: decision.decisionType,
      decisionRationale: decision.rationale,
      evidenceBasis: decision.evidenceBasis,
      contradictions: decision.contradictions,
      evidenceGaps: decision.evidenceGaps,
      unavailableCapabilities,
      ...input.metadata,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // 6. Hand off to Phase 4 createLearningPlan for strict schema & DAG validation
  const planValidation = createLearningPlan(createPlanInput);

  if (!planValidation.isValid || !planValidation.plan) {
    return {
      status: 'REJECTED',
      decisionId: decision.decisionId,
      userId,
      decisionType: decision.decisionType,
      priority: decision.priority,
      confidence: decision.confidence,
      targetSkills: decision.targetSkills,
      primaryObjective: decision.primaryObjective,
      recommendedAction: decision.recommendedAction,
      clarificationQuestions: [],
      blockingReasons: planValidation.errors.map((e) => `${e.field || 'Plan'}: ${e.message}`),
      rationale: `Failed Phase 4 plan validation: ${planValidation.errors.map((e) => e.message).join('; ')}`,
      evidenceBasis: decision.evidenceBasis,
      contradictions: decision.contradictions,
      evidenceGaps: decision.evidenceGaps,
      requiredCapabilities: Array.from(new Set(requiredTools)),
      unavailableCapabilities,
      generatedAt: timestamp,
      source: 'DETERMINISTIC',
      metadata: input.metadata,
    };
  }

  // 7. Determine final bridge status
  let bridgeStatus: DecisionPlanBridgeStatus = 'PLAN_GENERATED';
  const blockingReasons: string[] = [];

  if (decision.decisionType === 'WAIT_FOR_MORE_EVIDENCE') {
    bridgeStatus = 'BLOCKED_WAITING_EVIDENCE';
    blockingReasons.push('Plan is waiting for external telemetry or missing telemetry connections.');
  } else if (unavailableCapabilities.length > 0) {
    bridgeStatus = 'BLOCKED_BY_CAPABILITY';
    blockingReasons.push(`Plan requires unavailable environment capabilities: ${unavailableCapabilities.join(', ')}`);
  }

  return {
    status: bridgeStatus,
    decisionId: decision.decisionId,
    userId,
    decisionType: decision.decisionType,
    priority: decision.priority,
    confidence: decision.confidence,
    targetSkills: decision.targetSkills,
    primaryObjective: decision.primaryObjective,
    recommendedAction: decision.recommendedAction,
    plan: planValidation.plan,
    clarificationQuestions: [],
    blockingReasons,
    rationale: decision.rationale,
    evidenceBasis: decision.evidenceBasis,
    contradictions: decision.contradictions,
    evidenceGaps: decision.evidenceGaps,
    requiredCapabilities: Array.from(new Set(requiredTools)),
    unavailableCapabilities,
    generatedAt: timestamp,
    source: 'DETERMINISTIC',
    metadata: input.metadata,
  };
}

// ============================================================================
// Internal Step Generators for Canonical Decision Types
// ============================================================================

interface StepGenerationContext {
  planId: string;
  decision: import('./decision-types').LearningDecision;
  primaryTargetSkill: string;
  goalUnderstanding?: import('./goal-understanding-types').GoalUnderstanding | null;
  assessment?: import('./assessment-types').StudentLearningAssessment | null;
  resolvedCapabilities: string[];
  timestamp: string;
}

// ============================================================================
// Evidence-Aware Day-by-Day Roadmap Generator
// ============================================================================

/**
 * Parse a numeric day count from natural-language timeframe strings.
 * Returns null if no parseable day count is found.
 * Examples: "2 days" → 2, "in 7 days" → 7, "next week" → 7, "3 day" → 3
 */
function parseTimeframeDays(timeframe: string | null | undefined): number | null {
  if (!timeframe) return null;
  const lower = timeframe.toLowerCase().trim();

  // Explicit "N days" or "N-day"
  const explicit = lower.match(/(\d+)\s*[-\s]?day/);
  if (explicit) {
    const n = parseInt(explicit[1], 10);
    return n >= 1 && n <= 30 ? n : null;
  }
  // "next week" / "a week" / "one week"
  if (lower.includes('week') && !lower.match(/\d/)) return 7;
  // "a month" / "one month"
  if (lower.includes('month') && !lower.match(/\d/)) return 14; // cap at 14 for usability

  return null;
}

/**
 * Derive minutes and priority for a given day based on student evidence.
 *
 * Evidence rules (strictly from assessment data):
 *  - calibratedProficiency >= 4 (strong)  → 30 min, LOW priority
 *  - calibratedProficiency 2-3 (developing) → 60-75 min, MEDIUM priority
 *  - calibratedProficiency <= 1 (weak) or CONTRADICTED → 90 min, HIGH priority
 *  - Mistakes recorded for this skill → adds 15 min, bumps priority one level
 *  - No evidence at all → 60 min baseline, MEDIUM priority
 */
function deriveEffortFromEvidence(
  skillName: string,
  assessment: import('./assessment-types').StudentLearningAssessment | null | undefined,
  mistakeCount: number,
): { minutes: number; priority: PlanPriority; rationale: string } {
  const DEFAULT_MINUTES = 60;

  if (!assessment || !assessment.skillAssessments || assessment.skillAssessments.length === 0) {
    return {
      minutes: DEFAULT_MINUTES + (mistakeCount > 0 ? 15 : 0),
      priority: mistakeCount > 2 ? 'HIGH' : 'MEDIUM',
      rationale: `No prior skill evidence found — using ${DEFAULT_MINUTES} min baseline.${mistakeCount > 0 ? ` ${mistakeCount} mistake(s) logged → extra 15 min.` : ''}`,
    };
  }

  // Find matching skill assessment (case-insensitive prefix match)
  const lowerSkill = skillName.toLowerCase();
  const match = assessment.skillAssessments.find(
    (s) =>
      s.skillName.toLowerCase().includes(lowerSkill) ||
      lowerSkill.includes(s.skillName.toLowerCase())
  );

  if (!match) {
    return {
      minutes: DEFAULT_MINUTES + (mistakeCount > 0 ? 15 : 0),
      priority: mistakeCount > 2 ? 'HIGH' : 'MEDIUM',
      rationale: `No evidence found for "${skillName}" — using ${DEFAULT_MINUTES} min baseline.${mistakeCount > 0 ? ` ${mistakeCount} mistake(s) logged → extra 15 min.` : ''}`,
    };
  }

  const prof = match.calibratedProficiency;
  const isContradicted = match.evidenceCategory === 'CONTRADICTED';

  let minutes: number;
  let priority: PlanPriority;
  let baseRationale: string;

  if (isContradicted || prof <= 1) {
    minutes = 90;
    priority = 'HIGH';
    baseRationale = `Calibrated proficiency ${prof}/5 (${isContradicted ? 'contradicted' : 'weak'}) → 90 min deep study required.`;
  } else if (prof >= 4) {
    minutes = 30;
    priority = 'LOW';
    baseRationale = `Calibrated proficiency ${prof}/5 (strong) → brief 30 min review sufficient.`;
  } else {
    minutes = prof === 3 ? 60 : 75;
    priority = 'MEDIUM';
    baseRationale = `Calibrated proficiency ${prof}/5 (developing) → ${minutes} min focused study.`;
  }

  // Mistake adjustment
  if (mistakeCount > 0) {
    minutes += 15;
    if (priority === 'LOW') priority = 'MEDIUM';
    else if (priority === 'MEDIUM') priority = 'HIGH';
    baseRationale += ` ${mistakeCount} mistake(s) logged for this area → +15 min remediation.`;
  }

  return { minutes, priority, rationale: baseRationale };
}

/**
 * Build a curriculum of N days from the decision + assessment context.
 * Topics and sub-topics are derived from the target skill domain and
 * the decision type — never hardcoded for a specific technology.
 */
function buildDayCurriculum(
  numDays: number,
  primaryTargetSkill: string,
  decisionType: string,
  assessment: import('./assessment-types').StudentLearningAssessment | null | undefined,
): Array<{
  topic: string;
  learn: string;
  practiceCount: number;
  reviewActivity: string;
}> {
  const days: Array<{ topic: string; learn: string; practiceCount: number; reviewActivity: string }> = [];

  // Phase breakdown ratios (dynamic by total days)
  // ≤ 2 days → Foundation + Practice
  // 3-5 days → Foundation, Core, Practice, Review
  // 6-14 days → extended cycle: Foundation, Topics, Practice, Deep Dive, Review, Apply

  const hasWeakness = (() => {
    if (!assessment?.skillAssessments) return false;
    return assessment.skillAssessments.some(
      (s) => s.calibratedProficiency <= 2 || s.evidenceCategory === 'CONTRADICTED'
    );
  })();

  const isFoundationNeeded =
    decisionType === 'BUILD_FOUNDATION' ||
    decisionType === 'ASSESS_SKILL' ||
    hasWeakness;

  // Build phase labels proportional to numDays
  for (let d = 1; d <= numDays; d++) {
    const fraction = (d - 1) / Math.max(numDays - 1, 1); // 0.0 to 1.0

    let topic: string;
    let learn: string;
    let practiceCount: number;
    let reviewActivity: string;

    if (numDays === 1) {
      topic = `${primaryTargetSkill} — Focused Study`;
      learn = `Core concepts, syntax, and key patterns of ${primaryTargetSkill}.`;
      practiceCount = 3;
      reviewActivity = 'Review all logged mistakes and update mistake log';
    } else if (fraction < 0.25) {
      // Foundation phase
      const phaseLabel = isFoundationNeeded ? 'Foundations & Syntax' : 'Concept Review';
      topic = `${primaryTargetSkill} — ${phaseLabel}`;
      learn = `${isFoundationNeeded ? 'Core definitions, data structures, and fundamental patterns' : 'Key concepts, edge cases, and standard idioms'} of ${primaryTargetSkill}.`;
      practiceCount = 3;
      reviewActivity = 'Review existing notes and identify knowledge gaps';
    } else if (fraction < 0.55) {
      // Core skill phase
      const dayInPhase = Math.round((fraction - 0.25) / 0.30 * numDays) + 1;
      topic = `${primaryTargetSkill} — Core Problem-Solving (Part ${dayInPhase})`;
      learn = `Standard algorithms, patterns, and application techniques in ${primaryTargetSkill}. Focus on time/space complexity trade-offs.`;
      practiceCount = d <= 3 ? 4 : 5;
      reviewActivity = 'Review yesterday\'s mistakes and refine your approach notes';
    } else if (fraction < 0.80) {
      // Practice & Depth
      const dayInPhase = Math.round((fraction - 0.55) / 0.25 * numDays) + 1;
      topic = `${primaryTargetSkill} — Applied Practice (Session ${dayInPhase})`;
      learn = `Advanced patterns, optimizations, and real-world applications of ${primaryTargetSkill}.`;
      practiceCount = 5;
      reviewActivity = 'Log any new mistakes; review mistake patterns from previous days';
    } else {
      // Final synthesis / review
      topic = `${primaryTargetSkill} — Synthesis & Consolidation`;
      learn = `Comprehensive review of all covered material: patterns, edge cases, and mastery checkpoints.`;
      practiceCount = numDays <= 3 ? 3 : 6;
      reviewActivity = 'Full mistake log review; note remaining gaps for future study';
    }

    days.push({ topic, learn, practiceCount, reviewActivity });
  }

  return days;
}

/**
 * Generate one PlanStep per day for timeframe-based goals.
 * Each step carries rich metadata for the UI to render day cards.
 */
function generateDayByDaySteps(ctx: StepGenerationContext & { numDays: number }): {
  candidateSteps: Array<Omit<PlanStep, 'planId' | 'order' | 'createdAt' | 'updatedAt'>>;
  requiredTools: string[];
  planConstraints: string[];
} {
  const { planId, decision, primaryTargetSkill, goalUnderstanding, assessment, timestamp, numDays } = ctx;
  const requiredTools: string[] = [];
  const planConstraints: string[] = [`Day-by-day roadmap spanning ${numDays} day(s)`];

  // Count total mistakes in the assessment (rough signal for remediation weight)
  const mistakeCount = assessment?.observablePatterns?.filter(
    (p: import('./assessment-types').ObservableLearningPattern) => p.category === 'MISTAKE_TREND'
  ).length ?? 0;


  // Build curriculum skeleton
  const curriculum = buildDayCurriculum(numDays, primaryTargetSkill, decision.decisionType, assessment);

  const candidateSteps: Array<Omit<PlanStep, 'planId' | 'order' | 'createdAt' | 'updatedAt'>> = [];

  for (let d = 0; d < numDays; d++) {
    const dayNum = d + 1;
    const day = curriculum[d];
    const isLast = dayNum === numDays;

    // Evidence-driven effort for this day
    const daySkill = d < Math.floor(numDays * 0.6) ? primaryTargetSkill : primaryTargetSkill;
    const { minutes, priority, rationale: evidenceRationale } = deriveEffortFromEvidence(
      daySkill,
      assessment,
      d === 0 ? mistakeCount : 0, // only apply mistake penalty on day 1 to avoid over-amplification
    );

    const stepId = `${planId}_day_${dayNum}`;
    const prevStepId = d > 0 ? `${planId}_day_${d}` : null;

    candidateSteps.push({
      id: stepId,
      title: `Day ${dayNum} — ${day.topic}`,
      description: `📖 Learn: ${day.learn}\n⚡ Practice: ${day.practiceCount} problem${day.practiceCount !== 1 ? 's' : ''}\n🔍 Review: ${day.reviewActivity}`,
      rationale: evidenceRationale,
      priority,
      status: d === 0 ? 'READY' : 'PENDING',
      dependencies: prevStepId ? [prevStepId] : [],
      prerequisites: d === 0 ? [] : [`Day ${d} completed`],
      targetSkill: primaryTargetSkill,
      requiredTools: null,
      constraints: [
        `Complete within Day ${dayNum} study block`,
        ...(isLast ? ['Final synthesis — consolidate all learnings'] : []),
      ],
      successCriteria: [
        `Study "${day.topic}" concepts for the session`,
        `Complete ${day.practiceCount} practice problem${day.practiceCount !== 1 ? 's' : ''}`,
        day.reviewActivity,
      ],
      verificationCriteria: [
        `${day.practiceCount} practice exercise${day.practiceCount !== 1 ? 's' : ''} completed and checked`,
        `Mistake log reviewed at end of session`,
      ],
      estimatedEffort: {
        estimatedMinutes: minutes,
        difficulty: minutes >= 90 ? 'HARD' : minutes >= 60 ? 'MEDIUM' : 'EASY',
        confidenceNotes: evidenceRationale,
      },
      requiresApproval: false,
      metadata: {
        // Day-specific fields consumed by the roadmap UI
        dayNumber: dayNum,
        totalDays: numDays,
        isDayByDay: true,
        topic: day.topic,
        learnContent: day.learn,
        practiceProblems: day.practiceCount,
        reviewActivity: day.reviewActivity,
        aiEstimatedMinutes: minutes,
        evidenceRationale,
        timeframe: goalUnderstanding?.timeframe ?? null,
      },
    });
  }

  return { candidateSteps, requiredTools, planConstraints };
}

// ============================================================================
// Existing Per-Decision-Type Step Generator (used when no timeframe is present)
// ============================================================================

function generateStepsForDecisionType(ctx: StepGenerationContext): {
  candidateSteps: Array<Omit<PlanStep, 'planId' | 'order' | 'createdAt' | 'updatedAt'>>;
  requiredTools: string[];
  planConstraints: string[];
} {
  // --- Day-by-day override when a parseable timeframe exists ---
  const timeframeDays = parseTimeframeDays(ctx.goalUnderstanding?.timeframe);
  if (timeframeDays !== null && timeframeDays >= 1) {
    return generateDayByDaySteps({ ...ctx, numDays: timeframeDays });
  }

  // --- Fallback: existing 2-step per-decision-type templates ---
  const { decision, primaryTargetSkill, planId } = ctx;
  const requiredTools: string[] = [];
  const planConstraints: string[] = [];
  const steps: Array<Omit<PlanStep, 'planId' | 'order' | 'createdAt' | 'updatedAt'>> = [];

  switch (decision.decisionType) {
    case 'ASSESS_SKILL': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Core Concept Review: ${primaryTargetSkill} Fundamentals`,
        description: `Review fundamental concepts, syntax patterns, and core principles of ${primaryTargetSkill} to establish a clear baseline.`,
        rationale: 'Reviewing core concepts establishes a solid baseline for deliberate practice.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Focus on fundamental definitions, standard patterns, and mental models.'],
        successCriteria: [
          `Review core concept definitions and syntax rules for ${primaryTargetSkill}`,
          'Document 3-5 key principles in study notes',
        ],
        verificationCriteria: [`Concept checklist reviewed and foundational notes logged`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'EASY' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Hands-on Diagnostic Exercises in ${primaryTargetSkill}`,
        description: `Complete 6 to 8 targeted beginner exercises to gauge practical problem-solving capability.`,
        rationale: 'Practical exercises demonstrate operational ability and identify immediate areas for improvement.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 core concept review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Implement solutions independently before checking reference answers.'],
        successCriteria: [
          `Complete 6-8 practical coding exercises in ${primaryTargetSkill}`,
          'Verify all exercise test cases execute successfully',
        ],
        verificationCriteria: [`Diagnostic exercise solutions completed and verified`],
        estimatedEffort: { estimatedMinutes: 60, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'BUILD_FOUNDATION': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Study Core Fundamentals of ${primaryTargetSkill}`,
        description: `Review fundamental concepts, language syntax, and foundational patterns of ${primaryTargetSkill}.`,
        rationale: 'Calibrated proficiency is low; building strong foundational understanding is prerequisite to problem-solving.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Cover foundational definitions and standard structures.'],
        successCriteria: [`Core concept review completed for ${primaryTargetSkill}`],
        verificationCriteria: [`Concept checklist reviewed in study block`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'EASY' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Foundational Practice Exercises in ${primaryTargetSkill}`,
        description: `Work through beginner-to-intermediate problem sets reinforcing core fundamentals.`,
        rationale: 'Solidify foundational theory with practical application.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 foundational review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Focus on clean understanding and syntax accuracy.'],
        successCriteria: [`Complete foundational exercises in ${primaryTargetSkill}`],
        verificationCriteria: [`Exercises completed and checked against reference solutions`],
        estimatedEffort: { estimatedMinutes: 60, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'TARGET_WEAK_AREA': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Isolate and Study Weak Subtopics in ${primaryTargetSkill}`,
        description: `Target specific weak concepts and recurring difficulty areas in ${primaryTargetSkill}.`,
        rationale: 'Targeted remediation accelerates mastery by focusing effort on specific knowledge deficits.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Focus strictly on isolated weak subtopics.'],
        successCriteria: [`Weak subtopics reviewed and annotated`],
        verificationCriteria: [`Conceptual gaps documented and addressed`],
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Targeted Practice on Weak Areas in ${primaryTargetSkill}`,
        description: `Solve focused practice problems designed specifically around the isolated weak concepts.`,
        rationale: 'Verify comprehension through direct targeted problem-solving.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 subtopic isolation completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Work through problem variations.'],
        successCriteria: [`Solve targeted problems with zero unassisted errors`],
        verificationCriteria: [`Targeted practice problems completed and validated`],
        requiresApproval: false,
      });
      break;
    }

    case 'REINFORCE_DEVELOPING_SKILL': {
      requiredTools.push('get_projects', 'get_leetcode_activity');
      steps.push({
        id: `${planId}_step_1`,
        title: `Review Core Patterns in ${primaryTargetSkill}`,
        description: `Review intermediate patterns and techniques in ${primaryTargetSkill} to strengthen developing skill.`,
        rationale: 'Student has moderate observed foundation; reinforcing patterns elevates proficiency.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: ['get_projects'],
        constraints: ['Focus on idiomatic and structured problem-solving.'],
        successCriteria: [`Intermediate patterns reviewed`],
        verificationCriteria: [`Pattern notes reviewed in study block`],
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Structured Problem Solving in ${primaryTargetSkill}`,
        description: `Solve medium-difficulty problems applying reinforced patterns in ${primaryTargetSkill}.`,
        rationale: 'Transition developing skill into a supported strength through deliberate problem-solving.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 pattern review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: ['get_leetcode_activity'],
        constraints: ['Aim for clean, optimal implementations.'],
        successCriteria: [`Solve 2-3 medium problem sets`],
        verificationCriteria: [`LeetCode activity telemetry inspected for completed submissions`],
        requiresApproval: false,
      });
      break;
    }

    case 'PRACTICE': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Deliberate Practice Challenge Selection for ${primaryTargetSkill}`,
        description: `Select high-yield, advanced practice challenges aligned with student goals in ${primaryTargetSkill}.`,
        rationale: 'High calibrated proficiency supports advanced deliberate practice.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Select problems matching interview or advanced project criteria.'],
        successCriteria: [`Practice problem set selected`],
        verificationCriteria: [`Problems queued in learning plan`],
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Execute Timed Deliberate Practice in ${primaryTargetSkill}`,
        description: `Complete selected challenges under timed conditions to simulate real-world execution.`,
        rationale: 'Deepen fluency and speed through deliberate timed execution.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 challenge selection completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Adhere to time-block constraints.'],
        successCriteria: [`Complete practice challenge block`],
        verificationCriteria: [`Deliberate practice session executed and reviewed`],
        requiresApproval: false,
      });
      break;
    }

    case 'REVIEW_MISTAKES': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Analyze Recurring Misconceptions in ${primaryTargetSkill}`,
        description: `Review recorded mistake logs to identify core root causes and syntax/conceptual traps in ${primaryTargetSkill}.`,
        rationale: 'Systematic root-cause review prevents recurring errors and solidifies correct mental models.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Document exact root causes and write clean prevention notes.'],
        successCriteria: [
          `Identify 2-3 persistent mistake patterns in ${primaryTargetSkill}`,
          'Document correct solution strategies in personal notes',
        ],
        verificationCriteria: [`Root-cause analysis notes completed and logged`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Re-solve Challenging Problems with Clean Code`,
        description: `Re-attempt the problems where errors previously occurred, writing verified solutions from scratch without consulting old notes.`,
        rationale: 'Empirically verify remediation through successful, unassisted problem re-solving.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 root cause review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Solve without consulting previous erroneous attempts.'],
        successCriteria: [
          `All targeted problem variations solved with 100% test pass rate`,
          'Zero recurring syntax or logic slips',
        ],
        verificationCriteria: [`Clean problem re-solving solutions validated`],
        estimatedEffort: { estimatedMinutes: 60, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'PREPARE_FOR_ASSESSMENT': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Review High-Yield Competencies for ${primaryTargetSkill}`,
        description: `Review high-frequency concepts, core patterns, and assessment formats in ${primaryTargetSkill}.`,
        rationale: 'Evaluation readiness requires strategic alignment with high-yield assessment domains.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Align study focus with declared exam or interview domains.'],
        successCriteria: [`High-yield topic checklist reviewed and summarized`],
        verificationCriteria: [`Study checklist reviewed and logged`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Timed Self-Paced Practice Problem Set in ${primaryTargetSkill}`,
        description: `Complete a set of 5-8 practice problems under timed study conditions to build speed and stamina.`,
        rationale: 'Deepen problem-solving stamina and conceptual readiness through timed practice.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 scope review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Work within timed focus blocks.'],
        successCriteria: [`Complete practice problem set with verified correctness`],
        verificationCriteria: [`Practice problem set completed and verified`],
        estimatedEffort: { estimatedMinutes: 60, difficulty: 'HARD' },
        requiresApproval: false,
      });
      break;
    }

    case 'PLAN_SCHEDULE': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Set Up Dedicated Study Schedule for ${primaryTargetSkill}`,
        description: `Establish daily 45-to-60 minute focus blocks structured around ${primaryTargetSkill} milestones.`,
        rationale: 'Effective learning requires sustainable, consistent study pacing.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Fit within realistic weekly availability.'],
        successCriteria: [`Structured study schedule created and committed`],
        verificationCriteria: [`Study blocks scheduled and reviewed`],
        estimatedEffort: { estimatedMinutes: 30, difficulty: 'EASY' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Execute Initial Core Focus Session in ${primaryTargetSkill}`,
        description: `Complete your first dedicated focus session and document key takeaways.`,
        rationale: 'Build immediate momentum by executing the first planned study interval.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 schedule setup completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Complete full focus duration without distractions.'],
        successCriteria: [`First study block completed and reflection noted`],
        verificationCriteria: [`Focus session completed and verified`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'CORROBORATE_EVIDENCE': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Concept Self-Review: ${primaryTargetSkill}`,
        description: `Review fundamental concepts and patterns in ${primaryTargetSkill} with structured notes to establish verified mastery.`,
        rationale: 'Aligning concepts through active recall grounds understanding in verifiable knowledge.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Focus on clear mental models and syntax accuracy.'],
        successCriteria: [`Self-review notes logged for ${primaryTargetSkill}`],
        verificationCriteria: [`Concept review notes completed and logged`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'EASY' },
        requiresApproval: false,
      });

      steps.push({
        id: `${planId}_step_2`,
        title: `Hands-on Code Implementation in ${primaryTargetSkill}`,
        description: `Build a small functional project or solve 5 practice exercises to demonstrate operational proficiency.`,
        rationale: 'Demonstrate operational ability through practical code implementation.',
        priority: decision.priority,
        status: 'PENDING',
        dependencies: [`${planId}_step_1`],
        prerequisites: ['Step 1 self-review completed'],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Ensure clean, runnable code with zero syntax errors.'],
        successCriteria: [`Practical exercise set or mini-project completed`],
        verificationCriteria: [`Code solution executed and verified`],
        estimatedEffort: { estimatedMinutes: 60, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'CONTINUE_CURRENT_PATH': {
      steps.push({
        id: `${planId}_step_1`,
        title: `Advance Active Learning Progression in ${primaryTargetSkill}`,
        description: `Proceed with the next planned module and hands-on practice set in ${primaryTargetSkill}.`,
        rationale: 'Current learning trajectory is well-supported by evidence; continuing progression maintains momentum.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Maintain established study pace.'],
        successCriteria: [`Complete current trajectory milestone`],
        verificationCriteria: [`Progress milestone noted in working context`],
        estimatedEffort: { estimatedMinutes: 45, difficulty: 'MEDIUM' },
        requiresApproval: false,
      });
      break;
    }

    case 'WAIT_FOR_MORE_EVIDENCE': {
      planConstraints.push('Blocked: Waiting for external telemetry or missing integration data.');
      steps.push({
        id: `${planId}_step_1`,
        title: `Connect Telemetry Sources for ${primaryTargetSkill}`,
        description: `Connect external GitHub, LeetCode, or study session tracking to provide necessary evidence for ${primaryTargetSkill}.`,
        rationale: 'Insufficient data available to generate a reliable learning plan.',
        priority: decision.priority,
        status: 'BLOCKED',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: ['Awaiting integration activation.'],
        successCriteria: [`Telemetry sources connected`],
        verificationCriteria: [`Telemetry connection verified as pending/unconnected`],
        requiresApproval: false,
      });
      break;
    }

    default: {
      steps.push({
        id: `${planId}_step_1`,
        title: `Structured Practice in ${primaryTargetSkill}`,
        description: `Engage in structured learning and deliberate practice for ${primaryTargetSkill}.`,
        rationale: decision.rationale || 'General deliberate practice aligned with goal.',
        priority: decision.priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: primaryTargetSkill,
        requiredTools: null,
        constraints: [],
        successCriteria: [`Complete practice block`],
        verificationCriteria: [`Practice outcomes verified in working memory`],
        requiresApproval: false,
      });
    }
  }

  return { candidateSteps: steps, requiredTools, planConstraints };
}
