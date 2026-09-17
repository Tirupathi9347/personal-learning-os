/**
 * Phase 4B: Goal Decomposition Types for the Agentic Learning OS.
 * 
 * Defines strongly-typed contracts for deterministic goal decomposition,
 * structured objectives, candidate plan steps, and ambiguity/clarification detection
 * for the SINGLE Learning Orchestrator Agent.
 */

import { GoalCategory, AgentTriggerContext } from './intake-types';
import {
  LearningPlan,
  PlanStep,
  PlanPriority,
  PlanApprovalRequirement,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import { StudentCorroborationAuditResult, CorroborationResult } from './types';
import { GoalUnderstanding } from './goal-understanding-types';

/**
 * Lifecycle status of a goal decomposition attempt.
 */
export type GoalDecompositionStatus =
  | 'DECOMPOSED'
  | 'NEEDS_CLARIFICATION'
  | 'REJECTED';

/**
 * Specific dimensions where additional student clarification is required.
 */
export type GoalClarificationDimension =
  | 'TARGET_SKILL'
  | 'TIMEFRAME'
  | 'GOAL_SCOPE'
  | 'ASSESSMENT_BASELINE';

/**
 * Successful deterministic goal decomposition output.
 * Fully compatible with the Phase 4A LearningPlan contract.
 */
export interface DecomposedGoalResult {
  status: 'DECOMPOSED';
  /** Original goal statement preserved verbatim */
  goal: string;
  /** Categorization of the goal */
  category: GoalCategory;
  /** Target skill or topic if explicitly present in context; null/undefined if unknown */
  targetSkill?: string | null;
  /** Timeframe hint if explicitly specified (e.g. 'in 7 days'); null/undefined if unknown */
  timeframeHint?: string | null;
  /** Inferred or explicit priority */
  priority: PlanPriority;
  /** Explicit, measurable learning objectives */
  objectives: string[];
  /** Candidate plan steps forming a validated Directed Acyclic Graph (DAG) */
  candidateSteps: PlanStep[];
  /** Inferred or explicit plan constraints */
  constraints: string[];
  /** Overall success criteria for the plan */
  successCriteria: string[];
  /** Empirical verification criteria strictly separated from action */
  verificationCriteria: string[];
  /** Conceptual or skill prerequisites */
  prerequisites: string[];
  /** Human approval requirement contract */
  approvalRequirement: PlanApprovalRequirement;
  /** Fully assembled and validated candidate Phase 4A LearningPlan */
  candidatePlan: LearningPlan;
  /** Deterministic explanation of the pedagogical decomposition rationale */
  decompositionRationale: string;
  /** ISO 8601 timestamp of generation */
  generatedAt: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Structured result returned when a student goal is too vague or ambiguous to safely decompose.
 */
export interface NeedsClarificationResult {
  status: 'NEEDS_CLARIFICATION';
  originalGoal: string;
  reason: string;
  clarificationPrompt: string;
  missingDimensions: GoalClarificationDimension[];
  suggestedClarifications?: string[];
  generatedAt: string;
}

/**
 * Structured result returned when a goal input cannot be processed.
 */
export interface GoalDecompositionRejectedResult {
  status: 'REJECTED';
  originalGoal: string;
  reason: string;
  code: string;
  generatedAt: string;
}

/**
 * Discriminated union of all possible goal decomposition outcomes.
 */
export type GoalDecompositionResult =
  | DecomposedGoalResult
  | NeedsClarificationResult
  | GoalDecompositionRejectedResult;

/**
 * Input contract for the deterministic goal decomposition engine.
 */
export interface DecomposeGoalInput {
  triggerContext: AgentTriggerContext;
  assessmentContext?:
    | DecisionReadyAssessmentSummary
    | StudentCorroborationAuditResult
    | CorroborationResult
    | null;
  goalUnderstanding?: GoalUnderstanding;
  planId?: string;
  timestamp?: string;
}
