/**
 * Phase 4C: Deterministic Plan Prioritization & Scheduling Preparation Engine
 * 
 * Provides:
 * - Deterministic plan step prioritization grounded in validated goal and assessment context.
 * - Ground-truth tool capability validation against the actual Phase 3 Tool Registry.
 * - Topological scheduling tiers (partitioning independent vs dependent steps).
 * - Step readiness evaluation and explicit blocking reason identification.
 * - Structured, non-mutating scheduling proposals without task or calendar modifications.
 * - 100% deterministic, reproducible output for identical inputs with stable tie-breaking.
 */

import {
  LearningPlan,
  PlanStep,
  PlanPriority,
} from './planning-types';
import { validatePlan } from './planning-model';
import { AgentToolRegistry, agentToolRegistry } from './tool-registry';
import {
  PrioritizedStepEvaluation,
  ScheduledTier,
  PlanCapabilityAudit,
  PlanSchedulingProposal,
  PrioritizePlanOptions,
  PlanPrioritizationResult,
  StepReadinessStatus,
} from './plan-prioritization-types';

/**
 * Maps string priority to numeric sorting weight.
 */
export const PRIORITY_WEIGHTS: Record<PlanPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Derives effective PlanPriority enum from computed numeric priority score.
 */
export function derivePriorityFromScore(score: number): PlanPriority {
  if (score >= 3.5) return 'URGENT';
  if (score >= 2.5) return 'HIGH';
  if (score >= 1.5) return 'MEDIUM';
  return 'LOW';
}

/**
 * Assigns descriptive label to topological scheduling tiers.
 */
function getTierLabel(tierNumber: number): string {
  switch (tierNumber) {
    case 1:
      return 'Tier 1: Initial Independent Milestones';
    case 2:
      return 'Tier 2: Dependent Procedural & Practice Steps';
    case 3:
      return 'Tier 3: Advanced Synthesis & Verification Steps';
    default:
      return `Tier ${tierNumber}: Downstream Dependent Milestones`;
  }
}

/**
 * Computes topological scheduling tiers for a list of plan steps.
 */
export function computeSchedulingTiers(steps: PlanStep[]): Map<string, number> {
  const stepMap = new Map<string, PlanStep>();
  const stepTierMap = new Map<string, number>();
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    stepMap.set(step.id, step);
    inDegree.set(step.id, step.dependencies.length);
    dependents.set(step.id, []);
  }

  for (const step of steps) {
    for (const depId of step.dependencies) {
      const list = dependents.get(depId);
      if (list) {
        list.push(step.id);
      }
    }
  }

  // Tier 1: Steps with 0 dependencies
  let currentTierNumber = 1;
  let currentTierStepIds: string[] = [];

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentTierStepIds.push(id);
      stepTierMap.set(id, currentTierNumber);
    }
  }

  const processed = new Set<string>(currentTierStepIds);

  while (currentTierStepIds.length > 0) {
    currentTierNumber++;
    const nextTierStepIds: string[] = [];

    for (const stepId of currentTierStepIds) {
      const nextSteps = dependents.get(stepId) || [];
      for (const next of nextSteps) {
        const remaining = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, remaining);
        if (remaining === 0 && !processed.has(next)) {
          nextTierStepIds.push(next);
          stepTierMap.set(next, currentTierNumber);
          processed.add(next);
        }
      }
    }

    currentTierStepIds = nextTierStepIds;
  }

  // Fallback for any step not reached (e.g. disconnected or missing)
  for (const step of steps) {
    if (!stepTierMap.has(step.id)) {
      stepTierMap.set(step.id, 1);
    }
  }

  return stepTierMap;
}

/**
 * Audits all required tools across plan steps against the real Tool Registry.
 */
export function auditPlanCapabilities(
  steps: PlanStep[],
  registry: AgentToolRegistry
): PlanCapabilityAudit {
  const requestedToolsSet = new Set<string>();
  const verifiedAvailableSet = new Set<string>();
  const unregisteredUnavailableSet = new Set<string>();
  const limitations: string[] = [];

  for (const step of steps) {
    if (Array.isArray(step.requiredTools)) {
      for (const toolName of step.requiredTools) {
        requestedToolsSet.add(toolName);
        if (registry.hasTool(toolName)) {
          verifiedAvailableSet.add(toolName);
        } else {
          unregisteredUnavailableSet.add(toolName);
          limitations.push(
            `Step "${step.id}" requires tool "${toolName}" which is not registered in the Phase 3 Tool Registry.`
          );
        }
      }
    }
  }

  const unregisteredUnavailableTools = Array.from(unregisteredUnavailableSet).sort();
  const verifiedAvailableTools = Array.from(verifiedAvailableSet).sort();
  const hasUnavailableCapabilities = unregisteredUnavailableTools.length > 0;

  return {
    totalToolsRequested: requestedToolsSet.size,
    verifiedAvailableTools,
    unregisteredUnavailableTools,
    hasUnavailableCapabilities,
    capabilityLimitations: limitations,
  };
}

/**
 * Evaluates a single plan step's priority, ground-truth tool capabilities, and readiness.
 */
export function evaluateStep(
  step: PlanStep,
  plan: LearningPlan,
  schedulingTier: number,
  registry: AgentToolRegistry
): PrioritizedStepEvaluation {
  const blockingReasons: string[] = [];
  const availableTools: string[] = [];
  const unavailableTools: string[] = [];

  // 1. Tool Capability Ground-Truth Validation
  if (Array.isArray(step.requiredTools)) {
    for (const toolName of step.requiredTools) {
      if (registry.hasTool(toolName)) {
        availableTools.push(toolName);
      } else {
        unavailableTools.push(toolName);
        blockingReasons.push(
          `Requires unavailable tool capability: "${toolName}" (not present in Tool Registry).`
        );
      }
    }
  }

  // 2. Base Priority Score
  const basePriority = step.priority || plan.priority || 'MEDIUM';
  let priorityScore = PRIORITY_WEIGHTS[basePriority] ?? 2;
  let priorityJustification = `Base priority "${basePriority}" assigned from step criticality.`;

  // 3. Contextual Priority Grounding (Contradictions & Evidence Gaps)
  if (plan.decisionReadyAssessment && step.targetSkill) {
    const assessment = plan.decisionReadyAssessment;
    // Check for contradicted count or unverified count
    if (assessment.contradictedSkillsCount > 0) {
      priorityScore += 0.5;
      priorityJustification = `Priority boosted (+0.5) due to ${assessment.contradictedSkillsCount} identified contradiction(s) in assessment telemetry.`;
    } else if (assessment.unverifiedSkillsCount > 0) {
      priorityScore += 0.25;
      priorityJustification = `Priority boosted (+0.25) due to ${assessment.unverifiedSkillsCount} unverified evidence gap(s) in assessment telemetry.`;
    }
  }

  const effectivePriority = derivePriorityFromScore(priorityScore);

  // 4. Granular Readiness Classification
  let readinessStatus: StepReadinessStatus = 'READY';

  if (plan.status !== 'READY' && plan.status !== 'EXECUTING') {
    readinessStatus = 'BLOCKED_BY_PLAN_STATUS';
    blockingReasons.push(`Parent plan is in "${plan.status}" status (must be READY or EXECUTING).`);
  } else if (unavailableTools.length > 0) {
    readinessStatus = 'BLOCKED_BY_UNAVAILABLE_CAPABILITY';
  } else if (schedulingTier > 1) {
    readinessStatus = 'BLOCKED_BY_DEPENDENCIES';
    blockingReasons.push(
      `Predecessor dependencies in earlier tiers must complete before execution: [${step.dependencies.join(', ')}].`
    );
  } else if (step.requiresApproval) {
    readinessStatus = 'BLOCKED_BY_APPROVAL';
    blockingReasons.push('Action requires explicit human approval before execution.');
  }

  const isExecutionReady = readinessStatus === 'READY';

  return {
    stepId: step.id,
    planId: step.planId || plan.planId,
    originalOrder: step.order,
    title: step.title,
    description: step.description,
    rationale: step.rationale,
    basePriority,
    effectivePriority,
    priorityScore,
    priorityJustification,
    dependencies: [...step.dependencies],
    schedulingTier,
    readinessStatus,
    isExecutionReady,
    blockingReasons,
    requiredTools: step.requiredTools ? [...step.requiredTools] : null,
    availableTools: availableTools.sort(),
    unavailableTools: unavailableTools.sort(),
    targetSkill: step.targetSkill ?? null,
    estimatedEffort: step.estimatedEffort ?? null,
    verificationCriteria: [...step.verificationCriteria],
    requiresApproval: Boolean(step.requiresApproval),
  };
}

/**
 * Deterministically sorts steps using strict multi-factor tie-breaking rules:
 * 1. Scheduling Tier ascending (Tier 1 before Tier 2 before Tier 3)
 * 2. Priority score descending (URGENT before HIGH before MEDIUM before LOW)
 * 3. Execution readiness descending (READY before BLOCKED)
 * 4. Original plan step order ascending (1 before 2 before 3)
 * 5. Step ID lexicographical ascending (stable deterministic fallback)
 */
export function sortStepsDeterministically(
  steps: PrioritizedStepEvaluation[]
): PrioritizedStepEvaluation[] {
  return [...steps].sort((a, b) => {
    // 1. Scheduling Tier ascending
    if (a.schedulingTier !== b.schedulingTier) {
      return a.schedulingTier - b.schedulingTier;
    }
    // 2. Priority score descending
    if (a.priorityScore !== b.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    // 3. Execution readiness descending
    if (a.isExecutionReady !== b.isExecutionReady) {
      return a.isExecutionReady ? -1 : 1;
    }
    // 4. Original step order ascending
    if (a.originalOrder !== b.originalOrder) {
      return a.originalOrder - b.originalOrder;
    }
    // 5. Lexicographical step ID ascending
    return a.stepId.localeCompare(b.stepId);
  });
}

/**
 * Deterministically prioritizes a validated LearningPlan and produces a complete,
 * structured, non-mutating Scheduling Proposal.
 */
export function prioritizeLearningPlan(
  plan: LearningPlan,
  options?: PrioritizePlanOptions
): PlanPrioritizationResult {
  const registry = options?.registry || agentToolRegistry;
  const timestamp = options?.timestamp || new Date().toISOString();

  // 1. Validate Input LearningPlan
  const validation = validatePlan(plan);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors.map((e) => e.message),
    };
  }

  // 2. Compute Topological Scheduling Tiers
  const tierMap = computeSchedulingTiers(plan.steps);

  // 3. Audit Tool Capabilities Against Registry
  const capabilityAudit = auditPlanCapabilities(plan.steps, registry);

  // 4. Evaluate Each Step
  const evaluatedSteps: PrioritizedStepEvaluation[] = plan.steps.map((step) => {
    const tier = tierMap.get(step.id) || 1;
    return evaluateStep(step, plan, tier, registry);
  });

  // 5. Deterministic Multi-Factor Linear Sorting
  const sortedSteps = sortStepsDeterministically(evaluatedSteps);
  const linearExecutionOrder = sortedSteps.map((s) => s.stepId);

  // 6. Partition Steps into Discrete Scheduled Tiers
  const tierGroups = new Map<number, PrioritizedStepEvaluation[]>();
  for (const step of sortedSteps) {
    const list = tierGroups.get(step.schedulingTier) || [];
    list.push(step);
    tierGroups.set(step.schedulingTier, list);
  }

  const sortedTierNumbers = Array.from(tierGroups.keys()).sort((a, b) => a - b);
  const schedulingTiers: ScheduledTier[] = sortedTierNumbers.map((tierNum) => {
    const tierSteps = tierGroups.get(tierNum) || [];
    const isTierReady = tierSteps.length > 0 && tierSteps.every((s) => s.isExecutionReady);
    return {
      tierNumber: tierNum,
      tierLabel: getTierLabel(tierNum),
      stepIds: tierSteps.map((s) => s.stepId),
      steps: tierSteps,
      isTierReady,
    };
  });

  const readyStepsCount = evaluatedSteps.filter((s) => s.isExecutionReady).length;
  const blockedStepsCount = evaluatedSteps.length - readyStepsCount;

  // 7. Extract Timeframe / Deadline Hints Without Converting to Fake Dates
  const timeframeHint =
    (typeof plan.metadata?.timeframeHint === 'string' && plan.metadata.timeframeHint) ||
    plan.constraints.find((c) => c.toLowerCase().includes('timeframe') || c.toLowerCase().includes('days') || c.toLowerCase().includes('exam')) ||
    null;

  // 8. Formulate Rationale and Unresolved Clarifications
  const proposalRationale = `Plan prioritized into ${schedulingTiers.length} topological scheduling tiers with ${readyStepsCount} immediately ready step(s) and ${blockedStepsCount} dependent/blocked step(s). Ground-truth tool audit verified ${capabilityAudit.verifiedAvailableTools.length} available tool(s) and identified ${capabilityAudit.unregisteredUnavailableTools.length} unavailable capability requirement(s).`;

  const unresolvedClarifications: string[] = [];
  if (capabilityAudit.hasUnavailableCapabilities) {
    unresolvedClarifications.push(
      `Plan requires unavailable tool capability: [${capabilityAudit.unregisteredUnavailableTools.join(', ')}]. Capability must be provided before dependent steps can execute.`
    );
  }
  if (!timeframeHint) {
    unresolvedClarifications.push('No explicit timeframe or deadline supplied. Scheduling proposal is unconstrained by calendar dates.');
  }

  // 9. Assemble Complete Proposal Contract
  const proposal: PlanSchedulingProposal = {
    planId: plan.planId,
    userId: plan.userId,
    goal: plan.goal,
    category: (plan.metadata?.category as any) || undefined,
    targetSkill: plan.targetSkill ?? null,
    planStatus: plan.status,
    timeframeHint,
    totalSteps: plan.steps.length,
    readyStepsCount,
    blockedStepsCount,
    schedulingTiers,
    linearExecutionOrder,
    prioritizedSteps: sortedSteps,
    capabilityAudit,
    boundaryGuarantees: {
      isExecutionTriggered: false,
      isCalendarModified: false,
      isTaskModified: false,
      isDatabaseModified: false,
      disclaimer: 'This is a deterministic scheduling proposal for planning and preview. No calendar events, tasks, or database records were created or modified.',
    },
    proposalRationale,
    unresolvedClarifications,
    generatedAt: timestamp,
  };

  return {
    success: true,
    proposal,
  };
}
