/**
 * Phase 4E: Evidence-Based Verification & Controlled Replanning Types
 * 
 * Defines strongly-typed contracts for evidence-based outcome verification,
 * criteria-to-telemetry mapping, epistemic classification scoring, contradiction tracking,
 * deterministic replanning decisions, and structured replan contexts for the
 * SINGLE Learning Orchestrator Agent.
 */

import {
  LearningPlan,
  PlanStep,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import {
  PlanStepExecutionResult,
  VerificationHandoff,
} from './plan-execution-types';
import {
  EvidenceRecord,
  EvidenceClassification,
  EvidencePolarity,
  EvidenceSourceType,
  StudentCorroborationAuditResult,
  CorroborationResult,
} from './types';

/**
 * The 6 canonical verification outcome statuses.
 */
export type StepVerificationStatus =
  | 'VERIFIED'              // All criteria supported by empirical evidence (OBSERVED / EXTERNALLY_VERIFIED) with 0 material contradictions.
  | 'PARTIALLY_VERIFIED'     // Some criteria supported with empirical evidence, but gaps or ambiguities remain.
  | 'INSUFFICIENT_EVIDENCE'  // Required empirical evidence is missing, unobserved, or only self-reported claims exist.
  | 'CONTRADICTED'          // Strong empirical evidence directly contradicts the intended outcome (e.g. repeated mistakes, low quiz score).
  | 'NOT_VERIFIABLE'        // Verification criteria require unsupported capabilities/sources not present in the application.
  | 'BLOCKED';              // Execution itself failed, was blocked by dependencies, unavailable tools, or lacked approval.

/**
 * Granular evaluation of a single verification criterion statement.
 */
export interface CriterionEvaluation {
  /** The criterion statement text from PlanStep.verificationCriteria */
  criterionText: string;
  /** Verification status for this individual criterion */
  status: StepVerificationStatus;
  /** Epistemic authority of the evidence supporting/contradicting this criterion */
  evidenceClassification?: EvidenceClassification;
  /** List of supporting evidence IDs or snippets */
  supportingEvidence: string[];
  /** List of contradicting evidence IDs or snippets */
  contradictingEvidence: string[];
  /** Description of missing evidence if insufficient */
  missingEvidenceDescription?: string;
  /** Whether the capability required to verify this criterion is supported by the application */
  isCapabilitySupported: boolean;
  /** Missing application capability if unsupported (e.g. 'quiz_assessment_database') */
  missingCapability?: string;
  /** Transparent explanation */
  explanation: string;
}

/**
 * Result of evaluating evidence for an executed PlanStep.
 */
export interface StepVerificationResult {
  /** Parent plan ID */
  planId: string;
  /** Executed step ID */
  stepId: string;
  /** Overall verification outcome status */
  status: StepVerificationStatus;
  /** Individual criterion evaluations */
  criteriaEvaluations: CriterionEvaluation[];
  /** Empirical evidence records evaluated */
  evaluatedEvidence: EvidenceRecord[];
  /** Summary of supporting evidence items */
  supportingEvidenceSummary: string[];
  /** Summary of contradicting evidence items */
  contradictingEvidenceSummary: string[];
  /** Summary of missing evidence requirements */
  missingEvidenceSummary: string[];
  /** Highest epistemic classification observed among supporting evidence */
  strongestEvidenceClassification?: EvidenceClassification | null;
  /** Calculated verification confidence (0.0 to 1.0) */
  verificationConfidence: number;
  /** Comprehensive pedagogical and factual explanation */
  explanation: string;
  /** Recommended next action */
  recommendedAction: string;
  /** Whether a controlled replan is warranted based on verification outcome */
  isReplanWarranted: boolean;
  /** Specific trigger reason if replanning is warranted */
  replanTriggerReason?: string;
  /** ISO 8601 evaluation timestamp */
  evaluatedAt: string;
}

/**
 * Structured Replan Context preserved across plan supersessions.
 */
export interface ReplanContext {
  /** Original student goal */
  originalGoal: string;
  /** Original plan ID that is being superseded */
  originalPlanId: string;
  /** Step IDs that succeeded and completed */
  completedStepIds: string[];
  /** Step IDs that failed or were blocked */
  failedStepIds: string[];
  /** Step IDs whose verification was contradicted or insufficient */
  unverifiedStepIds: string[];
  /** Detailed verification results for executed steps */
  verificationResults: StepVerificationResult[];
  /** Specific unresolved evidence gaps to address in the new plan */
  unresolvedGaps: string[];
  /** Contradictions detected that require remedial practice */
  contradictions: string[];
  /** Specific pedagogical focus for the replanned curriculum */
  suggestedFocus: string;
  /** Primary reason triggering the replanning cycle */
  reasonForReplanning: string;
  /** Immutable snapshot of the previous LearningPlan */
  previousPlanSnapshot: LearningPlan;
  /** Current assessment context if updated */
  updatedAssessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null;
  /** Timestamp when replan context was formulated */
  formulatedAt: string;
}

/**
 * Result of a controlled replanning decision.
 */
export interface ReplanDecisionResult {
  /** Whether replanning is required */
  shouldReplan: boolean;
  /** Replan trigger reason */
  reason: string;
  /** Complete replan context payload if replanning is warranted */
  replanContext?: ReplanContext;
  /** Superseded previous plan instance with status === 'SUPERSEDED' */
  supersededPlan?: LearningPlan;
  /** Newly generated candidate plan if replanning succeeded */
  newCandidatePlan?: LearningPlan;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input options for verifying an executed plan step.
 */
export interface VerifyPlanStepInput {
  /** The parent LearningPlan */
  plan: LearningPlan;
  /** Target step that was executed */
  stepId: string;
  /** Step execution result from Phase 4D */
  executionResult: PlanStepExecutionResult;
  /** Authenticated user ID */
  authenticatedUserId: string;
  /** Optional evidence collection or corroboration records */
  evidenceRecords?: EvidenceRecord[];
  /** Optional assessment context */
  assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
}
