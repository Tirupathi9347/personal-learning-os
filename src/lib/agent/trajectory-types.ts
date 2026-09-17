/**
 * Phase 6F: Longitudinal Learning Trajectory & Adaptation Signal Types
 * 
 * Defines strongly-typed contracts for analyzing how student evidence, activity,
 * outcomes, mistakes, contradictions, and learning signals evolve over time.
 * 
 * Core Guarantees:
 * 1. Strictly Observational: Answers "How is the learning trajectory changing over time?", NEVER decides actions (6C responsibility).
 * 2. Zero Historical Fabrication: Never manufactures historical skill scores, trends, or assessments. Missing history is explicitly flagged as INSUFFICIENT_HISTORY.
 * 3. Epistemic Preservation: Uses Phase 1 evidence classifications and Phase 6E outcomes.
 * 4. Zero Psychological Inference: Strictly tracks observable telemetry; never infers motivation, intelligence, or personality.
 * 5. Strictly READ-ONLY: Zero database mutations, zero skill calibrations, zero writes.
 */

import {
  EvidenceRecord,
  EvidenceClassification,
  EvidenceSourceType,
  Mistake,
  TimeSession,
  GitHubActivityLog,
  LeetCodeSubmission,
  Task,
  StudentCorroborationAuditResult,
  CorroborationResult,
} from './types';
import {
  LearningPlan,
} from './planning-types';
import {
  LearningOutcome,
  LearningFeedback,
} from './outcome-feedback-types';

/**
 * Categorical rating of temporal data coverage and longitudinal observability.
 * 
 * NOTE: This is a heuristic measure of temporal data spread and telemetry density,
 * NOT a scientifically validated measure of learning quality, cognitive retention,
 * or statistical certainty.
 */
export type HistorySufficiency =
  | 'NONE'          // Zero historical records found
  | 'INSUFFICIENT'  // Single snapshot, < 2 timestamps, < 2 distinct days, or < 1 day span; no trend can be established
  | 'LIMITED'       // 2-4 observations or < 3 distinct days or short timeframe (< 7 days); tentative directional signals only
  | 'SUFFICIENT'    // >= 5 observations across >= 3 distinct days and >= 7 days timeframe; reliable trend signals
  | 'STRONG';       // Rich historical telemetry (>= 10 observations, >= 7 distinct days, >= 30 days span)

/**
 * Directional trajectory movement for a skill or activity metric.
 */
export type TrajectoryDirection =
  | 'IMPROVING'
  | 'STABLE'
  | 'DECLINING'
  | 'INCREASING'
  | 'DECREASING'
  | 'MIXED'
  | 'INSUFFICIENT_DATA';

/**
 * Minimal canonical trajectory signal types.
 */
export type TrajectorySignalType =
  | 'IMPROVING_EVIDENCE'           // Evidence quality, volume, or test pass rate has increased over time
  | 'STABLE_EVIDENCE'              // Telemetry shows consistent corroboration with little variance
  | 'DECLINING_EVIDENCE'           // Telemetry shows fewer supporting data points or decreasing performance
  | 'PERSISTENT_WEAKNESS_SIGNAL'   // Specific skill/topic has repeated negative evidence across multiple time windows
  | 'RECURRING_MISTAKE_PATTERN'    // Identical or related error categories recur in recent history
  | 'MISTAKE_RESOLUTION'           // Previously recurring mistake category has no recent occurrences
  | 'CONTRADICTION_EMERGING'       // New contradiction detected between claim/expected outcome and recent telemetry
  | 'CONTRADICTION_RESOLVED'       // Prior contradiction resolved by recent positive empirical evidence
  | 'INCREASING_ACTIVITY'          // Frequency/volume of study, problem-solving, or commits is increasing
  | 'DECREASING_ACTIVITY'          // Frequency/volume of recorded activity is decreasing
  | 'MIXED_ACTIVITY'               // Highly irregular activity distribution across the window
  | 'PLAN_COMPLETION_PATTERN'      // High rate of recent planned step/task completions
  | 'PLAN_BLOCKAGE_PATTERN'        // Repeated plan blockages due to unavailable environment capabilities
  | 'INSUFFICIENT_HISTORY'         // Insufficient historical records to establish a valid trajectory
  | 'STALE_EVIDENCE'               // Primary supporting evidence is older than 90 days without recent refresh
  | 'RETENTION_SIGNAL'             // Positive performance observed after substantial elapsed time
  | 'RETENTION_NOT_VERIFIABLE';    // Cannot evaluate retention due to absence of follow-up telemetry

/**
 * Individual granular longitudinal observation / signal.
 */
export interface TrajectoryObservation {
  /** Unique signal observation ID */
  signalId: string;
  /** Canonical signal type */
  type: TrajectorySignalType;
  /** Human-readable factual explanation based on telemetry */
  description: string;
  /** Relevant skill name if skill-specific, or null if cross-cutting */
  skillName?: string | null;
  /** Signal confidence (0.0 to 1.0) */
  confidence: number;
  /** Relevant evidence or entity IDs supporting this signal */
  evidenceReferences: string[];
  /** First and last observation timestamps associated with this signal */
  observedWindow?: {
    firstObservedAt?: string;
    lastObservedAt?: string;
  };
}

/**
 * Longitudinal trajectory for a specific target skill.
 */
export interface SkillTrajectory {
  /** Skill name */
  skillName: string;
  /** Overall trend direction */
  direction: TrajectoryDirection;
  /** Total supporting evidence records across time */
  totalSupportingEvidence: number;
  /** Total contradicting evidence records across time */
  totalContradictingEvidence: number;
  /** Recent supporting evidence count (e.g. within recent half of window) */
  recentSupportingCount: number;
  /** Recent contradicting evidence count */
  recentContradictingCount: number;
  /** Total logged mistakes linked to this skill */
  mistakeCount: number;
  /** Retention assessment indicator */
  retentionStatus: 'RETAINED' | 'POSSIBLE_DECAY' | 'STALE' | 'NOT_VERIFIABLE';
  /** Granular signals specific to this skill */
  signals: TrajectoryObservation[];
  /** Detailed factual summary */
  summary: string;
}

/**
 * Longitudinal trajectory of student study & practice activity over time.
 */
export interface ActivityTrajectory {
  /** Overall activity trend */
  direction: TrajectoryDirection;
  /** Total completed tasks with timestamps */
  completedTasksCount: number;
  /** Total tracked study minutes across time sessions */
  totalTrackedStudyMinutes: number;
  /** Total GitHub activity events recorded */
  totalGitHubEvents: number;
  /** Total LeetCode submissions recorded */
  totalLeetCodeSubmissions: number;
  /** Activity counts grouped by time intervals (if timestamps present) */
  recentActivitySummary: string;
}

/**
 * Longitudinal trajectory of mistakes and recurring error patterns.
 */
export interface MistakeTrajectory {
  /** Overall mistake pattern classification */
  pattern: 'PERSISTENT_MISTAKE_PATTERN' | 'IMPROVING_MISTAKE_PATTERN' | 'RESOLVED_MISTAKE_PATTERN' | 'INSUFFICIENT_MISTAKE_HISTORY';
  /** Total mistakes recorded */
  totalMistakesCount: number;
  /** Categories of recurring mistakes */
  recurringCategories: string[];
  /** Number of mistake categories resolved */
  resolvedCategoriesCount: number;
  /** Active unresolved mistake categories */
  activeUnresolvedCategories: string[];
  /** Factual summary */
  summary: string;
}

/**
 * Longitudinal trajectory of learning plans and execution outcomes (Phase 6E integration).
 */
export interface OutcomeTrajectory {
  /** Total learning plans evaluated */
  totalPlansCount: number;
  /** Count of fully completed plans */
  completedPlansCount: number;
  /** Count of partially completed plans */
  partiallyCompletedPlansCount: number;
  /** Count of blocked plans */
  blockedPlansCount: number;
  /** Count of failed plans */
  failedPlansCount: number;
  /** Count of verified learning outcomes */
  verifiedOutcomesCount: number;
  /** Count of insufficient evidence outcomes */
  insufficientEvidenceOutcomesCount: number;
  /** Count of contradicted outcomes */
  contradictedOutcomesCount: number;
  /** Concise factual summary */
  summary: string;
}

/**
 * Longitudinal trajectory of contradictions detected and resolved.
 */
export interface ContradictionTrajectory {
  /** Newly emerging contradictions in recent window */
  emergingContradictions: string[];
  /** Contradictions resolved by subsequent empirical evidence */
  resolvedContradictions: string[];
  /** Persistent unresolved contradictions */
  unresolvedContradictions: string[];
  /** Factual summary */
  summary: string;
}

/**
 * Primary strongly-typed Learning Trajectory Contract.
 * Represents the complete longitudinal state of the student over an observation window.
 */
export interface LearningTrajectory {
  /** Unique trajectory analysis snapshot ID */
  trajectoryId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Explicit observation time window */
  observationWindow: {
    startDate?: string;
    endDate?: string;
    windowDays?: number;
  };
  /** Factual data coverage & temporal spread metadata */
  dataCoverage: {
    totalObservations: number;
    totalTimestampedObservations: number;
    distinctObservationDays: number;
    timeSpanDays: number;
    observationSpanDays: number;
    sourcesPresent: string[];
    missingTimestampCount: number;
  };
  /** Heuristic rating of temporal data coverage and observability */
  historySufficiency: HistorySufficiency;
  /** Longitudinal trajectory per evaluated skill */
  skillTrajectories: SkillTrajectory[];
  /** Overall activity trajectory */
  activityTrajectory: ActivityTrajectory;
  /** Mistake and error trajectory */
  mistakeTrajectory: MistakeTrajectory;
  /** Learning plan & outcome trajectory */
  outcomeTrajectory: OutcomeTrajectory;
  /** Contradiction trajectory */
  contradictionTrajectory: ContradictionTrajectory;
  /** High-level canonical signals detected */
  signals: TrajectoryObservation[];
  /** Unresolved evidence gaps identified across the window */
  unresolvedEvidenceGaps: string[];
  /** Observed retention signals */
  retentionSignals: string[];
  /** Observed evidence decay / staleness signals */
  decaySignals: string[];
  /** Observational confidence in trajectory findings based on available telemetry coverage (0.0 to 1.0) */
  confidence: number;
  /** Comprehensive factual summary */
  summary: string;
  /** Explicit limitations and data gap notices */
  limitations: string[];
  /** Analysis origin */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Input options for longitudinal trajectory analysis.
 */
export interface AnalyzeTrajectoryInput {
  /** Authenticated student user ID */
  userId: string;
  /** Historical empirical evidence records */
  evidenceRecords?: EvidenceRecord[];
  /** Historical or current assessment contexts */
  assessments?: Array<StudentCorroborationAuditResult | CorroborationResult>;
  /** Historical mistake records */
  mistakes?: Mistake[];
  /** Tracked time sessions */
  timeSessions?: TimeSession[];
  /** GitHub activity logs */
  githubActivity?: GitHubActivityLog[];
  /** LeetCode submissions */
  leetcodeSubmissions?: LeetCodeSubmission[];
  /** Historical tasks */
  tasks?: Task[];
  /** Historical learning plans */
  learningPlans?: LearningPlan[];
  /** Historical learning outcomes (Phase 6E) */
  learningOutcomes?: LearningOutcome[];
  /** Historical learning feedback (Phase 6E) */
  learningFeedbacks?: LearningFeedback[];
  /** Configurable observation window filter */
  observationWindowDays?: number;
  /** Whether to allow LLM narrative assistance */
  allowLlm?: boolean;
  /** Fixed timestamp for deterministic evaluation */
  timestamp?: string;
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of longitudinal trajectory analysis.
 */
export interface LearningTrajectoryResult {
  /** The evaluated LearningTrajectory snapshot */
  trajectory: LearningTrajectory;
  /** Source of analysis */
  source: 'DETERMINISTIC' | 'GEMINI_AUGMENTED';
  /** Analysis duration in milliseconds */
  evaluationTimeMs: number;
}

/**
 * Optional Gemini LLM client interface for trajectory narrative augmentation.
 */
export interface TrajectoryLlmClient {
  generateContent(prompt: string): Promise<{
    text?: string | (() => string);
  }>;
}
