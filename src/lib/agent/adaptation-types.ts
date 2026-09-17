/**
 * Phase 6G: Adaptive Learning Policy & Orchestrator Adaptation Types
 * 
 * Defines strongly-typed contracts for determining HOW the SINGLE Learning Orchestrator
 * should adapt future learning policy and orchestration guidance based on already-established
 * evidence, assessments (6B), decisions (6C), plans (6D), outcomes (6E), and trajectories (6F).
 * 
 * Core Guarantees:
 * 1. Strictly Policy Guidance: 6G answers "How should future planning and orchestration adapt?", NEVER replaces 6C decision authority.
 * 2. Observational & Evidence-Grounded: Adapts only based on empirical evidence, verified outcomes, and longitudinal signals.
 * 3. Epistemic Preservation: Preserves Phase 1 calibrations, contradictions, and evidence gaps without modification.
 * 4. Zero Historical/Evidence Fabrication: Never assumes unverified success or fabricates assessment scores.
 * 5. Zero Psychological Inference: Strictly tracks observable telemetry; never speculates on motivation, personality, or intelligence.
 * 6. Strictly READ-ONLY / IN-MEMORY: Zero database mutations, zero write tools, zero skill calibrations.
 */

import {
  EvidenceRecord,
  EvidenceClassification,
  Mistake,
} from './types';
import {
  GoalUnderstanding,
} from './goal-understanding-types';
import {
  StudentLearningAssessment,
} from './assessment-types';
import {
  LearningDecision,
  DecisionType,
} from './decision-types';
import {
  LearningPlan,
} from './planning-types';
import {
  LearningOutcome,
  LearningFeedback,
} from './outcome-feedback-types';
import {
  LearningTrajectory,
  TrajectoryObservation,
  HistorySufficiency,
} from './trajectory-types';

/**
 * Controlled vocabulary of canonical adaptation signal types.
 */
export type AdaptationSignalType =
  | 'PRESERVE_SUCCESSFUL_PATTERN'    // Verified empirical success observed; maintain current instructional granularity and pacing
  | 'INCREASE_PRACTICE_FOCUS'        // Developing or moderate proficiency detected; recommend prioritizing hands-on practice problems
  | 'INCREASE_REVIEW_FOCUS'          // Recurring mistakes or recent contradictions detected; suggest prioritizing error analysis
  | 'NARROW_LEARNING_SCOPE'          // Broad multi-skill plan struggled or repeated blockages/mistakes occurred; suggest focusing on a single sub-skill
  | 'INCREASE_PLAN_GRANULARITY'      // Plan was partially completed or had execution friction; recommend smaller, explicit step chunks
  | 'REQUEST_MORE_EVIDENCE'          // Telemetry is sparse, unverified, or self-reported only; recommend corroboration before complex plans
  | 'REASSESS_BEFORE_ESCALATION'     // Contradiction detected or baseline out of date; recommend diagnostic/assessment before increasing difficulty
  | 'REFRESH_STALE_EVIDENCE'         // Key supporting evidence is older than 90 days; suggest refreshing telemetry
  | 'CONTINUE_CURRENT_APPROACH'      // Stable progress with balanced evidence; maintain course
  | 'REDUCE_ADAPTATION_CONFIDENCE'   // Telemetry is mixed or uncertain; lower confidence in any proactive policy shifts
  | 'NO_ADAPTATION';                 // Insufficient data or neutral state where no policy shift is warranted

/**
 * Granular adaptation signal emitted by the policy engine.
 */
export interface AdaptationSignal {
  /** Unique signal ID */
  signalId: string;
  /** Canonical signal type */
  type: AdaptationSignalType;
  /** Evidence-grounded factual explanation */
  reason: string;
  /** Associated skill name if skill-specific */
  targetSkillName?: string | null;
  /** Observational confidence in signal (0.0 to 1.0) */
  confidence: number;
  /** Empirical evidence references or entity IDs supporting this signal */
  evidenceBasis: string[];
  /** Known limitations affecting this signal */
  limitations: string[];
}

/**
 * Actionable policy recommendation for future orchestration runs.
 */
export interface AdaptationRecommendation {
  /** Unique recommendation ID */
  recommendationId: string;
  /** Target focus area (e.g. "Python Async", "Error Review", "Evidence Corroboration") */
  focusArea: string;
  /** Concrete suggested adjustment to future planning */
  suggestedAdjustment: string;
  /** Pedagogical rationale grounded in empirical outcomes and trajectory */
  pedagogicalRationale: string;
  /** Supporting adaptation signal types */
  sourceSignals: AdaptationSignalType[];
}

/**
 * Primary strongly-typed Adaptive Learning Policy Contract.
 * Represents the orchestrator's synthesized adaptation posture for future learning cycles.
 */
export interface AdaptiveLearningPolicy {
  /** Unique policy snapshot ID */
  policyId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Associated goal statement or reference */
  goalReference?: string | null;
  /** Source Phase 6C decision ID if available */
  sourceDecisionId?: string | null;
  /** Source Phase 6D/4 plan ID if available */
  sourcePlanId?: string | null;
  /** Source Phase 6E outcome ID if available */
  sourceOutcomeId?: string | null;
  /** Target skills under adaptation */
  targetSkills: string[];
  /** Canonical adaptation signals detected */
  adaptationSignals: AdaptationSignal[];
  /** Actionable recommendations for future planning */
  adaptationRecommendations: AdaptationRecommendation[];
  /** Evidence IDs and facts grounding this policy */
  evidenceBasis: string[];
  /** Longitudinal trajectory signals grounding this policy */
  trajectoryBasis: string[];
  /** Outcome feedback items grounding this policy */
  feedbackBasis: string[];
  /** Preserved active contradictions */
  contradictions: string[];
  /** Preserved evidence gaps requiring future empirical telemetry */
  evidenceGaps: string[];
  /** Observational confidence in this adaptation policy (0.0 to 1.0) */
  confidence: number;
  /** Whether the policy requires more evidence before stronger adaptation */
  requiresMoreEvidence: boolean;
  /** Whether human confirmation is required before high-risk changes */
  humanReviewRequired: boolean;
  /** Policy analysis origin */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** Explicit limitations and data gap notices */
  limitations: string[];
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input parameters for evaluating an AdaptiveLearningPolicy.
 */
export interface EvaluateAdaptationInput {
  /** Authenticated student user ID */
  userId: string;
  /** Phase 6A Goal understanding output */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Phase 6B Student learning assessment output */
  studentAssessment?: StudentLearningAssessment | null;
  /** Phase 6C Learning decision output */
  previousDecision?: LearningDecision | null;
  /** Phase 6D / Phase 4 Executed learning plan */
  executedPlan?: LearningPlan | null;
  /** Phase 6E Learning outcome output */
  learningOutcome?: LearningOutcome | null;
  /** Phase 6E Learning feedback output */
  learningFeedback?: LearningFeedback | null;
  /** Phase 6F Longitudinal learning trajectory output */
  learningTrajectory?: LearningTrajectory | null;
  /** Raw evidence records */
  evidenceRecords?: EvidenceRecord[];
  /** Logged mistakes */
  mistakes?: Mistake[];
  /** Evaluation timestamp (ISO 8601) */
  timestamp?: string;
  /** Allow Gemini narrative summarization */
  allowLlm?: boolean;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of evaluating AdaptiveLearningPolicy.
 */
export interface AdaptivePolicyResult {
  /** The generated AdaptiveLearningPolicy contract */
  policy: AdaptiveLearningPolicy;
  /** Policy origin */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** Evaluation execution time in ms */
  evaluationTimeMs: number;
}

/**
 * LLM client interface for advisory narrative augmentation.
 */
export interface AdaptivePolicyLlmClient {
  generateContent: (prompt: string) => Promise<{ text: string | (() => string) }>;
}

/**
 * Context container for future Phase 6C decision selection enriched with Phase 6G policy.
 */
export interface DecisionContextWithAdaptation {
  /** Phase 6B student assessment */
  studentAssessment: StudentLearningAssessment;
  /** Phase 6A goal understanding if available */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Phase 6F longitudinal trajectory if available */
  learningTrajectory?: LearningTrajectory | null;
  /** Phase 6E learning feedback if available */
  learningFeedback?: LearningFeedback | null;
  /** Phase 6G adaptive learning policy guidance */
  adaptiveLearningPolicy?: AdaptiveLearningPolicy | null;
}
