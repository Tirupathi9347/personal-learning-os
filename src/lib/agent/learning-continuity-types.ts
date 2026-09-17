/**
 * Phase 9: Intelligent Learning Continuity & Autonomous Follow-Up Types
 * 
 * Defines strongly-typed contracts for cross-session continuity,
 * journey resumption, plan status detection, and duplicate prevention.
 */

import { GoalUnderstanding } from './goal-understanding-types';
import { StudentLearningAssessment } from './assessment-types';
import { LearningDecision } from './decision-types';
import { LearningPlan, PlanStep } from './planning-types';
import { LearningOutcome, LearningFeedback } from './outcome-feedback-types';
import { LearningTrajectory } from './trajectory-types';
import { AdaptiveLearningPolicy } from './adaptation-types';
import { AgentRunState } from './state-types';

/**
 * Status classification of a restored learning journey.
 */
export type JourneyContinuityStatus =
  | 'IN_PROGRESS'    // Active journey with uncompleted pending steps
  | 'BLOCKED'        // Active journey blocked on missing capabilities or dependencies
  | 'COMPLETED'      // All planned steps were completed
  | 'STALE'          // Previous journey is old (> 14 days) and requires fresh evidence corroboration
  | 'NOT_FOUND';     // No prior journey found for student

/**
 * Comprehensive snapshot of historical learning context restored from persistence.
 */
export interface PersistedJourneyContext {
  runId: string;
  userId: string;
  originalGoal: string;
  goalUnderstanding?: GoalUnderstanding | null;
  studentAssessment?: StudentLearningAssessment | null;
  previousDecision?: LearningDecision | null;
  learningPlan?: LearningPlan | null;
  completedStepIds: string[];
  pendingStepIds: string[];
  blockedStepIds: string[];
  totalStepsCount: number;
  completedStepsCount: number;
  learningOutcome?: LearningOutcome | null;
  learningFeedback?: LearningFeedback | null;
  learningTrajectory?: LearningTrajectory | null;
  adaptivePolicy?: AdaptiveLearningPolicy | null;
  lastActiveAt: string;
  isStale: boolean;
  staleReason?: string | null;
}

/**
 * Result of attempting to restore / resume a learning journey.
 */
export interface ResumeJourneyResult {
  success: boolean;
  status: JourneyContinuityStatus;
  runId?: string;
  context?: PersistedJourneyContext | null;
  activePlan?: LearningPlan | null;
  nextStepToExecute?: PlanStep | null;
  continuityRationale: string;
  recommendedAction: string;
  error?: string;
}

/**
 * Configuration for evaluating continuity context in a follow-up orchestrator run.
 */
export interface ContinuityEvaluationInput {
  userId: string;
  previousJourney?: PersistedJourneyContext | null;
  newGoalText?: string | null;
  allowLlm?: boolean;
}

/**
 * Result of evaluating continuity context for next action selection.
 */
export interface ContinuityEvaluationResult {
  isContinuingPreviousGoal: boolean;
  inheritedTargetSkills: string[];
  preservedContradictions: string[];
  activeStepIdsToSkip: string[];
  suggestedDecisionType: string;
  suggestedActionObjective: string;
  continuitySummary: string;
}
