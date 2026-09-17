/**
 * Phase 9: Intelligent Learning Continuity & Autonomous Follow-Up Engine
 * 
 * Implements deterministic cross-session journey resumption, continuity evaluation,
 * plan state analysis, and duplicate task/step prevention.
 */

import { AgentRunState } from './state-types';
import {
  JourneyContinuityStatus,
  PersistedJourneyContext,
  ResumeJourneyResult,
  ContinuityEvaluationInput,
  ContinuityEvaluationResult,
} from './learning-continuity-types';
import { LearningPlan, PlanStep } from './planning-types';
import { GoalUnderstanding } from './goal-understanding-types';
import { StudentLearningAssessment } from './assessment-types';
import { LearningDecision } from './decision-types';
import { LearningOutcome, LearningFeedback } from './outcome-feedback-types';
import { LearningTrajectory } from './trajectory-types';
import { AdaptiveLearningPolicy } from './adaptation-types';

export * from './learning-continuity-types';

const DEFAULT_STALENESS_DAYS = 14;

/**
 * Restores structured learning journey context from an in-memory or persisted AgentRunState.
 */
export function restoreJourneyContextFromRun(
  state: AgentRunState,
  stalenessDays: number = DEFAULT_STALENESS_DAYS,
  nowTimestamp?: string
): PersistedJourneyContext {
  const memory = state.workingMemory || {};
  const currentEpoch = nowTimestamp ? new Date(nowTimestamp).getTime() : Date.now();
  const updatedEpoch = state.updatedAt ? new Date(state.updatedAt).getTime() : currentEpoch;
  const daysDiff = Math.max(0, (currentEpoch - updatedEpoch) / (1000 * 60 * 60 * 24));

  const goalUnderstanding = (memory.goalUnderstanding as GoalUnderstanding) || null;
  const studentAssessment = (memory.studentAssessment as StudentLearningAssessment) || null;
  const previousDecision = (memory.learningDecision as LearningDecision) || (memory.decision as LearningDecision) || null;
  const learningPlan = (memory.learningPlan as LearningPlan) || (memory.plan as LearningPlan) || null;
  const learningOutcome = (memory.learningOutcome as LearningOutcome) || null;
  const learningFeedback = (memory.learningFeedback as LearningFeedback) || null;
  const learningTrajectory = (memory.learningTrajectory as LearningTrajectory) || null;
  const adaptivePolicy = (memory.adaptiveLearningPolicy as AdaptiveLearningPolicy) || (memory.adaptivePolicy as AdaptiveLearningPolicy) || null;

  const steps: PlanStep[] = learningPlan?.steps || [];
  const completedStepIds: string[] = [];
  const pendingStepIds: string[] = [];
  const blockedStepIds: string[] = [];

  for (const step of steps) {
    if (step.status === 'COMPLETED' || step.status === 'SKIPPED') {
      completedStepIds.push(step.id);
    } else if (step.status === 'BLOCKED') {
      blockedStepIds.push(step.id);
    } else {
      pendingStepIds.push(step.id);
    }
  }

  const isStale = daysDiff >= stalenessDays;
  const staleReason = isStale
    ? `Previous session was active ${Math.round(daysDiff)} days ago (exceeds ${stalenessDays}-day threshold). Evidence should be refreshed.`
    : null;

  return {
    runId: state.runId,
    userId: state.userId,
    originalGoal: state.context?.goal || goalUnderstanding?.originalGoal || learningPlan?.goal || 'General Learning Goal',
    goalUnderstanding,
    studentAssessment,
    previousDecision,
    learningPlan,
    completedStepIds,
    pendingStepIds,
    blockedStepIds,
    totalStepsCount: steps.length,
    completedStepsCount: completedStepIds.length,
    learningOutcome,
    learningFeedback,
    learningTrajectory,
    adaptivePolicy,
    lastActiveAt: state.updatedAt || new Date().toISOString(),
    isStale,
    staleReason,
  };
}

/**
 * Resumes an active learning journey and calculates the exact next operational step.
 */
export function resumeLearningJourneyState(
  state: AgentRunState,
  stalenessDays: number = DEFAULT_STALENESS_DAYS,
  nowTimestamp?: string
): ResumeJourneyResult {
  const context = restoreJourneyContextFromRun(state, stalenessDays, nowTimestamp);
  const plan = context.learningPlan;

  if (!plan || plan.steps.length === 0) {
    return {
      success: true,
      status: 'NOT_FOUND',
      runId: state.runId,
      context,
      continuityRationale: 'No structured learning plan found in previous run context.',
      recommendedAction: 'START_FRESH_GOAL',
    };
  }

  // Check staleness first
  if (context.isStale) {
    return {
      success: true,
      status: 'STALE',
      runId: state.runId,
      context,
      activePlan: plan,
      continuityRationale: context.staleReason || 'Previous session is stale.',
      recommendedAction: 'REFRESH_EVIDENCE_BEFORE_RESUMING',
    };
  }

  // Check if all steps were completed
  if (context.completedStepsCount === context.totalStepsCount && context.totalStepsCount > 0) {
    return {
      success: true,
      status: 'COMPLETED',
      runId: state.runId,
      context,
      activePlan: plan,
      continuityRationale: 'All planned learning steps in this journey have been completed.',
      recommendedAction: 'PROCEED_TO_NEXT_PEDAGOGICAL_GOAL',
    };
  }

  // Check if blocked by missing capabilities
  if (context.blockedStepIds.length > 0 && context.pendingStepIds.length === 0) {
    return {
      success: true,
      status: 'BLOCKED',
      runId: state.runId,
      context,
      activePlan: plan,
      continuityRationale: `Journey is blocked on ${context.blockedStepIds.length} steps due to unavailable tool capabilities.`,
      recommendedAction: 'REVISE_OR_SIMPLIFY_PLAN',
    };
  }

  // Find the first unfinished step
  const nextStep = plan.steps.find(
    (s) => s.status === 'PENDING' || s.status === 'READY' || s.status === 'IN_PROGRESS'
  ) || null;

  return {
    success: true,
    status: 'IN_PROGRESS',
    runId: state.runId,
    context,
    activePlan: plan,
    nextStepToExecute: nextStep,
    continuityRationale: `Resuming active journey at step ${nextStep ? nextStep.order : 1}: "${nextStep?.title || 'Next step'}". (${context.completedStepsCount}/${context.totalStepsCount} completed)`,
    recommendedAction: 'EXECUTE_NEXT_STEP',
  };
}

/**
 * Generates a deterministic idempotency key for task creations.
 * Guarantees that repeating an orchestrator execution will never produce duplicate tasks.
 */
export function generateDeterministicTaskFingerprint(
  userId: string,
  planId: string,
  stepId: string,
  title: string
): string {
  const normalizedTitle = title.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  return `idem_${userId.slice(0, 8)}_${planId.slice(0, 8)}_${stepId.slice(0, 8)}_${normalizedTitle}`;
}

/**
 * Evaluates continuity context when a student initiates a follow-up or related goal.
 */
export function evaluateContinuityContext(
  input: ContinuityEvaluationInput
): ContinuityEvaluationResult {
  const prev = input.previousJourney;

  if (!prev || !prev.learningPlan) {
    return {
      isContinuingPreviousGoal: false,
      inheritedTargetSkills: [],
      preservedContradictions: [],
      activeStepIdsToSkip: [],
      suggestedDecisionType: 'PRACTICE',
      suggestedActionObjective: input.newGoalText || 'Initial learning goal',
      continuitySummary: 'No prior active journey context. Proceeding with fresh goal assessment.',
    };
  }

  const inheritedSkills: string[] = [];
  if (prev.goalUnderstanding?.targetSkill) {
    inheritedSkills.push(prev.goalUnderstanding.targetSkill);
  }
  if (prev.studentAssessment?.targetSkills) {
    for (const s of prev.studentAssessment.targetSkills) {
      if (!inheritedSkills.includes(s)) inheritedSkills.push(s);
    }
  }

  const preservedContradictions: string[] = prev.studentAssessment?.contradictedAreas || [];
  const activeStepIdsToSkip = prev.completedStepIds;

  let suggestedDecision = 'CONTINUE_CURRENT_PATH';
  if (prev.isStale) {
    suggestedDecision = 'CORROBORATE_EVIDENCE';
  } else if (preservedContradictions.length > 0) {
    suggestedDecision = 'REVIEW_MISTAKES';
  } else if (prev.completedStepsCount === prev.totalStepsCount) {
    suggestedDecision = 'REINFORCE_DEVELOPING_SKILL';
  }

  return {
    isContinuingPreviousGoal: true,
    inheritedTargetSkills: inheritedSkills,
    preservedContradictions,
    activeStepIdsToSkip,
    suggestedDecisionType: suggestedDecision,
    suggestedActionObjective: `Continue learning journey on ${inheritedSkills.join(', ') || prev.originalGoal}`,
    continuitySummary: `Inheriting ${inheritedSkills.length} target skills and ${prev.completedStepIds.length} completed steps from journey "${prev.originalGoal}".`,
  };
}
