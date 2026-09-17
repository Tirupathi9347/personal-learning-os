/**
 * Phase 6E: Outcome, Feedback & Learning Loop Types
 * 
 * Defines strongly-typed contracts for observing and interpreting outcomes
 * AFTER plan execution for the SINGLE Learning Orchestrator.
 * 
 * Core Guarantees:
 * 1. Strict separation of ACTION OUTCOME (what happened/completed) from LEARNING OUTCOME (what was empirically learned).
 * 2. 6E answers "What happened after the plan was executed?", NEVER "What should happen next?" (6C responsibility).
 * 3. Epistemic preservation: Uses Phase 1 classifications (SELF_REPORTED, OBSERVED, INFERRED, EXTERNALLY_VERIFIED).
 * 4. Contradictions, evidence gaps, and capability failures are preserved without loss.
 * 5. Strictly READ-ONLY / IN-MEMORY: Zero database mutations, zero skill calibrations, zero writes.
 */

import {
  LearningPlan,
  PlanStep,
  PlanStepStatus,
  PlanStatus,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import {
  PlanStepExecutionResult,
} from './plan-execution-types';
import {
  EvidenceRecord,
  EvidenceClassification,
  EvidenceSourceType,
  StudentCorroborationAuditResult,
  CorroborationResult,
} from './types';
import {
  StepVerificationStatus,
  StepVerificationResult,
} from './verification-types';
import {
  PostWriteVerificationResult,
} from './post-write-verifier';

/**
 * High-level operational completion status of a LearningPlan.
 */
export type PlanCompletionStatus =
  | 'COMPLETED'             // All planned steps finished execution successfully
  | 'PARTIALLY_COMPLETED'   // Some steps executed, but one or more were skipped, pending, or failed
  | 'BLOCKED'               // Plan execution blocked by missing tools, dependencies, or unfulfilled approval
  | 'FAILED';               // Plan execution halted due to unrecoverable execution errors

/**
 * Epistemic status of empirical learning verification after plan execution.
 * Reuses Phase 4 / verification terminology.
 */
export type LearningOutcomeStatus =
  | 'VERIFIED_SUCCESS'      // Empirical telemetry directly confirms learning objective achieved (OBSERVED/EXTERNALLY_VERIFIED)
  | 'PARTIALLY_VERIFIED'    // Telemetry confirms some criteria, but evidence gaps or unverified sub-goals remain
  | 'INSUFFICIENT_EVIDENCE' // Action occurred, but empirical telemetry confirming learning/proficiency is absent
  | 'CONTRADICTED'          // Telemetry directly contradicts expected outcome (e.g. repeated failure/mistakes)
  | 'BLOCKED'               // Evaluation blocked because execution was blocked or required tools were missing
  | 'NOT_VERIFIABLE'        // Learning outcome cannot be verified because testing/scoring capabilities are unsupported
  | 'FAILED';               // Execution failed or verification encountered critical failure

/**
 * Strongly-typed individual evidence observation attached to an outcome.
 */
export interface OutcomeEvidence {
  /** Unique evidence observation identifier */
  evidenceId: string;
  /** Source origin (e.g. 'github', 'leetcode', 'mistake_log', 'task_telemetry', 'project') */
  source: EvidenceSourceType | string;
  /** Epistemic authority classification */
  classification: EvidenceClassification;
  /** Descriptive explanation of observed telemetry */
  description: string;
  /** Relevant target skill name if applicable */
  targetSkill?: string | null;
  /** Timestamp when evidence was observed */
  observedAt: string;
  /** Whether this evidence supports the intended learning outcome */
  isSupporting: boolean;
  /** Whether this evidence contradicts the intended learning outcome */
  isContradictory: boolean;
  /** Freshness decay multiplier (0.0 to 1.0) */
  freshnessMultiplier?: number;
}

/**
 * Granular summary of an individual step's action and verification outcome.
 */
export interface StepOutcomeSummary {
  /** Unique step ID */
  stepId: string;
  /** Sequential step order */
  order: number;
  /** Human-readable title */
  title: string;
  /** Operational execution status */
  executionStatus: PlanStepStatus;
  /** Epistemic verification status */
  verificationStatus?: StepVerificationStatus | null;
  /** Whether the operational action completed */
  isActionCompleted: boolean;
  /** Whether empirical learning was verified for this step */
  isLearningVerified: boolean;
  /** Diagnostic reason if failed or blocked */
  failureReason?: string | null;
  /** Required tool names */
  requiredTools?: string[] | null;
  /** Actually executed tool names */
  executedTools?: string[];
}

/**
 * Operational summary of action outcomes across the entire plan.
 */
export interface ActionOutcomeSummary {
  /** Total steps in the plan */
  totalSteps: number;
  /** Number of steps whose actions completed */
  completedStepsCount: number;
  /** Number of steps whose actions remain incomplete */
  incompleteStepsCount: number;
  /** Number of steps blocked by capabilities or dependencies */
  blockedStepsCount: number;
  /** Number of steps that failed execution */
  failedStepsCount: number;
  /** All tools executed across steps */
  executedTools: string[];
  /** Number of write actions attempted (Phase 5) */
  writeActionsAttempted: number;
  /** Number of write actions verified via read-back (Phase 5) */
  writeActionsVerified: number;
  /** Concise operational summary */
  actionSummary: string;
}

/**
 * Record of an environment capability failure or missing tool.
 */
export interface CapabilityFailureRecord {
  /** Step ID impacted by the missing capability */
  stepId: string;
  /** Specific capability or tool name (e.g. 'run_diagnostic_assessment', 'quiz_assessment_database') */
  capability: string;
  /** Reason / context why capability was unavailable */
  reason: string;
}

/**
 * The primary strongly-typed Learning Outcome contract.
 * Represents WHAT HAPPENED after plan execution with strict action vs learning separation.
 */
export interface LearningOutcome {
  /** Unique outcome snapshot identifier */
  outcomeId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Parent LearningPlan ID */
  planId: string;
  /** Preceding Phase 6C decision ID if traceable */
  decisionId?: string | null;
  /** Student goal reference statement */
  goalReference: string;
  /** Target skills associated with the plan */
  targetSkills: string[];
  /** Operational plan status */
  planStatus: PlanStatus;
  /** Operational completion status */
  completionStatus: PlanCompletionStatus;
  /** List of step IDs whose actions completed */
  completedSteps: string[];
  /** List of step IDs whose actions were incomplete/pending */
  incompleteSteps: string[];
  /** List of step IDs blocked by capabilities or prerequisites */
  blockedSteps: string[];
  /** Granular summary per step */
  stepOutcomes: StepOutcomeSummary[];
  /** Detailed Phase 4 verification results */
  verificationResults: StepVerificationResult[];
  /** Operational action execution summary */
  actionOutcome: ActionOutcomeSummary;
  /** Epistemic learning outcome status */
  learningOutcomeStatus: LearningOutcomeStatus;
  /** Boolean flag: true ONLY when empirical evidence confirms learning achievement */
  learningOutcomeVerified: boolean;
  /** Evaluated empirical evidence records */
  evidence: OutcomeEvidence[];
  /** Detected or preserved contradictory evidence statements */
  contradictions: string[];
  /** Unresolved evidence gaps */
  evidenceGaps: string[];
  /** Capability failures encountered */
  capabilityFailures: CapabilityFailureRecord[];
  /** Phase 5 post-write verification results if applicable */
  writeResults?: PostWriteVerificationResult[];
  /** Overall verification confidence (0.0 to 1.0) */
  confidence: number;
  /** Comprehensive human-readable outcome summary */
  outcomeSummary: string;
  /** Known limitations of the outcome evaluation */
  limitations: string[];
  /** Outcome evaluation origin */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Structured feedback payload provided to future Phase 6B/6C passes.
 * Strictly separates observational feedback from future decision-making.
 */
export interface LearningFeedback {
  /** Unique feedback identifier */
  feedbackId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Evaluated plan ID */
  planId: string;
  /** Preceding decision ID if available */
  decisionId?: string | null;
  /** Outcome status */
  outcomeStatus: LearningOutcomeStatus;
  /** Verified operational actions that succeeded */
  verifiedActions: string[];
  /** Objectives from the plan that remain unresolved */
  unresolvedObjectives: string[];
  /** Newly observed evidence records for future corroboration */
  newlyObservedEvidence: OutcomeEvidence[];
  /** Current evidence gaps */
  evidenceGaps: string[];
  /** Active contradictions to address */
  contradictions: string[];
  /** Capability limitations in the environment */
  capabilityLimitations: string[];
  /** Confidence in the learning outcome */
  learningOutcomeConfidence: number;
  /** Concise feedback summary for future assessment */
  feedbackSummary: string;
  /** ISO 8601 timestamp */
  createdAt: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input options for evaluating a LearningOutcome.
 */
export interface EvaluateOutcomeInput {
  /** The executed or evaluated LearningPlan */
  plan: LearningPlan;
  /** Preceding Phase 6C decision ID if traceable */
  decisionId?: string | null;
  /** Step execution results from Phase 4D */
  stepExecutionResults?: PlanStepExecutionResult[];
  /** Step verification results from Phase 4E */
  stepVerificationResults?: StepVerificationResult[];
  /** Phase 5 post-write verification results if applicable */
  postWriteVerificationResults?: PostWriteVerificationResult[];
  /** Additional raw evidence records */
  evidenceRecords?: EvidenceRecord[];
  /** Underlying assessment context */
  assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null;
  /** Whether to allow LLM narrative assistance */
  allowLlm?: boolean;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Comprehensive result of evaluating a LearningOutcome and generating feedback.
 */
export interface LearningOutcomeResult {
  /** The structured LearningOutcome */
  outcome: LearningOutcome;
  /** Structured feedback for future iterations */
  feedback: LearningFeedback;
  /** Evaluation source */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** Duration of evaluation in milliseconds */
  evaluationTimeMs: number;
}

/**
 * Optional Gemini LLM client interface for narrative augmentation.
 */
export interface FeedbackLlmClient {
  generateContent(prompt: string): Promise<{
    text?: string | (() => string);
  }>;
}
