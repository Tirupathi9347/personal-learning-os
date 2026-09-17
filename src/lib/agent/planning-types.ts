/**
 * Phase 4A: Planning Model Types for the Agentic Learning OS.
 * 
 * Defines the strongly typed, deterministic planning contracts, schemas,
 * step representations, dependency relationships, verification boundaries,
 * and status lifecycle for the SINGLE Learning Orchestrator Agent.
 */

import { ApprovalRiskLevel } from './state-types';
import { AgentTriggerContext, TriggerPriority } from './intake-types';
import { StudentCorroborationAuditResult, CorroborationResult } from './types';

/**
 * The 8 canonical statuses of a Learning Plan.
 */
export type PlanStatus =
  | 'DRAFT'
  | 'VALIDATING'
  | 'READY'
  | 'EXECUTING'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'SUPERSEDED';

/**
 * The 8 canonical statuses of an individual Plan Step.
 */
export type PlanStepStatus =
  | 'PENDING'
  | 'READY'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'SUPERSEDED';

/**
 * Plan & Step Priority alignment.
 */
export type PlanPriority = TriggerPriority; // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

/**
 * Structured estimated effort contract.
 * Note: Must NEVER be fabricated; unknown values must remain undefined/null.
 */
export interface PlanEffortEstimate {
  estimatedMinutes?: number | null;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD' | 'CHALLENGING' | null;
  confidenceNotes?: string | null;
}

/**
 * Human approval requirement descriptor for a plan or step.
 */
export interface PlanApprovalRequirement {
  requiresApproval: boolean;
  riskLevel?: ApprovalRiskLevel | null;
  reason?: string | null;
  approvalRequestId?: string | null;
  isApproved?: boolean | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
}

/**
 * Structured summary of decision-ready assessment context associated with a plan.
 */
export interface DecisionReadyAssessmentSummary {
  auditId: string;
  generatedAt: string;
  studentUserId?: string | null;
  overallScore: number;
  verifiedSkillsCount: number;
  unverifiedSkillsCount: number;
  contradictedSkillsCount: number;
  warnings: string[];
  limitations: string[];
}

/**
 * Individual, strongly-typed Plan Step.
 * Strictly separates intended action and tool requirements from empirical verification criteria.
 */
export interface PlanStep {
  /** Unique step identifier within the plan (e.g., 'step-1', 'step-dbms-normalization-quiz') */
  id: string;
  /** Reference to the parent plan ID */
  planId: string;
  /** Explicit 1-based sequential display order */
  order: number;
  /** Concise, human-readable title of the step */
  title: string;
  /** Comprehensive description of the intended action */
  description: string;
  /** Pedagogical rationale / justification explaining why this step is required */
  rationale: string;
  /** Priority level for step scheduling and resource allocation */
  priority: PlanPriority;
  /** Current execution status of this step */
  status: PlanStepStatus;
  /**
   * Estimated effort (time/difficulty).
   * Strict Rule: Optional; must remain null/undefined if unknown. Never invent estimates.
   */
  estimatedEffort?: PlanEffortEstimate | null;
  /**
   * Explicit array of step IDs within this plan that MUST complete before this step can begin.
   * Circular dependencies are strictly rejected by the validator.
   */
  dependencies: string[];
  /**
   * Conceptual, skill-based, or external prerequisites (e.g., 'Basic SQL SELECT mastery').
   */
  prerequisites: string[];
  /**
   * Specific target skill or topic identifier/name if applicable, or null if cross-cutting.
   */
  targetSkill?: string | null;
  /**
   * List of required tool names from the ToolRegistry if applicable, or null if no tools needed.
   */
  requiredTools?: string[] | null;
  /**
   * Step-level constraints (e.g., 'Must be done in a single focus block', 'Requires non-empty mistake log').
   */
  constraints: string[];
  /**
   * Concrete conditions defining when this step's action is finished.
   */
  successCriteria: string[];
  /**
   * Concrete empirical conditions defining how to verify correctness/evidence.
   * STRICT SEPARATION: Distinct from the intended action.
   */
  verificationCriteria: string[];
  /**
   * Whether this step requires explicit human approval before execution.
   */
  requiresApproval: boolean;
  /**
   * Risk rating for approval gating if approval is required.
   */
  approvalRiskLevel?: ApprovalRiskLevel | null;
  /**
   * Structured parameters/payload for tool invocation or action execution.
   */
  actionPayload?: Record<string, unknown> | null;
  /**
   * Step execution output or result record once executed.
   */
  output?: unknown | null;
  /**
   * Error message or diagnostic failure details if step failed.
   */
  failureReason?: string | null;
  /**
   * Reference to replacing step ID if superseded during replanning.
   */
  supersededByStepId?: string | null;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
  /** Arbitrary extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Top-level, strongly-typed Learning Plan Contract.
 * Represents the complete deterministic blueprint for a student goal.
 */
export interface LearningPlan {
  /** Unique plan identifier (e.g., 'plan_exam_dbms_2026_09_16_abc123') */
  planId: string;
  /** Student user ID */
  userId: string;
  /** The primary overarching goal statement */
  goal: string;
  /** One or more explicit, measurable objectives (must not be empty) */
  objectives: string[];
  /** Ordered list of plan steps with explicit dependencies and verification criteria */
  steps: PlanStep[];
  /** Plan execution priority */
  priority: PlanPriority;
  /** Current lifecycle status of the plan */
  status: PlanStatus;
  /** Plan-level constraints (e.g., 'Exam date in 7 days', 'Max 2 hours per day') */
  constraints: string[];
  /** Plan-level overall success criteria */
  successCriteria: string[];
  /** Plan-level verification criteria separated from actions */
  verificationCriteria: string[];
  /** Human approval requirement for the overall plan */
  approvalRequirement: PlanApprovalRequirement;
  /**
   * Associated AgentTriggerContext if initiated by a specific goal/event.
   * Optional; null/undefined if detached.
   */
  triggerContext?: AgentTriggerContext | null;
  /**
   * Associated decision-ready assessment context if generated after observation/assessment.
   * Optional; null/undefined if detached.
   */
  decisionReadyAssessment?: DecisionReadyAssessmentSummary | null;
  /**
   * Target skill or topic name where available, or null/undefined if unknown.
   */
  targetSkill?: string | null;
  /**
   * Overall estimated effort if known. Optional; must remain null/undefined if unknown.
   */
  estimatedEffort?: PlanEffortEstimate | null;
  /**
   * General conceptual or system prerequisites for executing this plan.
   */
  prerequisites: string[];
  /**
   * Identifier of the new plan that superseded this plan during replanning.
   */
  supersededByPlanId?: string | null;
  /** ISO 8601 timestamp when this plan was superseded */
  supersededAt?: string | null;
  /** Human or system rationale for supersession */
  supersessionReason?: string | null;
  /** Plan version number (starts at 1; increments on major revisions) */
  version: number;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last update timestamp */
  updatedAt: string;
  /** Arbitrary extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input contract for constructing a new Learning Plan.
 */
export interface CreatePlanInput {
  planId?: string;
  userId: string;
  goal: string;
  objectives: string[];
  steps: Array<Omit<PlanStep, 'planId' | 'order' | 'createdAt' | 'updatedAt'> & {
    planId?: string;
    order?: number;
    createdAt?: string;
    updatedAt?: string;
  }>;
  priority?: PlanPriority;
  status?: PlanStatus;
  constraints?: string[];
  successCriteria?: string[];
  verificationCriteria?: string[];
  approvalRequirement?: Partial<PlanApprovalRequirement>;
  triggerContext?: AgentTriggerContext | null;
  decisionReadyAssessment?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null;
  targetSkill?: string | null;
  estimatedEffort?: PlanEffortEstimate | null;
  prerequisites?: string[];
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validation error record for plan integrity checks.
 */
export interface PlanValidationError {
  code: string;
  message: string;
  field?: string;
  stepId?: string;
}

/**
 * Result of validating a Learning Plan.
 */
export interface PlanValidationResult {
  isValid: boolean;
  plan?: LearningPlan;
  errors: PlanValidationError[];
  warnings?: string[];
}

/**
 * Result of validating plan dependencies (DAG cycle check).
 */
export interface DependencyValidationResult {
  isValid: boolean;
  hasCycles: boolean;
  cycles: string[][];
  executionTiers?: string[][];
  missingDependencies: Array<{
    stepId: string;
    missingDependencyId: string;
  }>;
  selfDependencies: string[];
  errors: string[];
}

/**
 * Input for transitioning a plan status.
 */
export interface PlanStatusTransitionInput {
  targetStatus: PlanStatus;
  reason?: string;
  updatedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Result of transitioning a plan status.
 */
export interface PlanStatusTransitionResult {
  success: boolean;
  plan: LearningPlan;
  previousStatus: PlanStatus;
  newStatus: PlanStatus;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Input for superseding an existing plan.
 */
export interface PlanSupersedeInput {
  newPlanId: string;
  reason: string;
  supersededAt?: string;
}
