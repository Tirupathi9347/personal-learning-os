/**
 * Phase 6B: Evidence-Aware Student Assessment Types
 * 
 * Defines strongly-typed contracts for deterministic + LLM-assisted
 * student learning situation assessments for the SINGLE Learning Orchestrator.
 */

import { GoalCategory } from './intake-types';
import { GoalUnderstanding } from './goal-understanding-types';
import {
  StudentSkillAssessment,
  StudentCorroborationAuditResult,
  CorroborationResult,
  EvidenceRecord,
  EvidenceClassification,
  SkillConfidenceLevel,
  EvidenceContradiction,
  MissingEvidenceRequirement,
} from './types';

/**
 * Descriptive categorization of a skill's empirical grounding.
 * Strictly avoids subjective/arbitrary rankings like "best" or "worst".
 */
export type SkillEvidenceCategory =
  | 'SUPPORTED_STRENGTH'
  | 'DEVELOPING'
  | 'EVIDENCE_GAP'
  | 'CONTRADICTED'
  | 'INSUFFICIENT_EVIDENCE';

/**
 * Freshness status of empirical telemetry for a skill.
 */
export type EvidenceFreshnessStatus = 'RECENT' | 'STALE' | 'MISSING';

/**
 * Concrete, observable behavioral patterns detected from evidence.
 * Strictly avoids psychological traits, personality inferences, or speculation.
 */
export interface ObservableLearningPattern {
  /** Machine-readable pattern identifier */
  patternId: string;
  /** Human-readable title of the pattern */
  title: string;
  /** Observable behavioral description grounded in telemetry */
  description: string;
  /** Supporting evidence records or IDs */
  evidenceReferences: string[];
  /** Pattern type (e.g. 'TASK_EXECUTION', 'MISTAKE_TREND', 'FOCUS_TIME', 'COMMIT_FREQUENCY', 'PROBLEM_SOLVING') */
  category: 'TASK_EXECUTION' | 'MISTAKE_TREND' | 'FOCUS_TIME' | 'COMMIT_FREQUENCY' | 'PROBLEM_SOLVING' | 'ENGAGEMENT';
}

/**
 * Granular assessment for an individual student skill.
 * Integrates Phase 1 corroboration confidence with goal-specific relevance.
 */
export interface SkillLearningAssessment {
  /** Normalized name of the skill */
  skillName: string;
  /** Self-reported claimed proficiency level (1 - 5, or 0 if un-claimed) */
  claimedProficiency: number;
  /** Evidence-backed calibrated proficiency level (1 - 5) from Phase 1 */
  calibratedProficiency: number;
  /** Phase 1 confidence classification */
  confidenceLevel: SkillConfidenceLevel;
  /** Evidence-grounded status classification */
  evidenceCategory: SkillEvidenceCategory;
  /** Numeric ground-truth evidence score (0.0 to 1.0) */
  evidenceBackedScore: number;
  /** Epistemic counts by evidence tier */
  epistemicCounts: {
    externallyVerified: number;
    observed: number;
    inferred: number;
    selfReported: number;
  };
  /** Freshness assessment */
  freshness: {
    status: EvidenceFreshnessStatus;
    daysSinceNewest: number | null;
    isStale: boolean;
  };
  /** Direct supporting evidence items */
  supportingEvidence: string[];
  /** Direct contradictory evidence items */
  contradictingEvidence: string[];
  /** Unverified dimensions or missing telemetry requirements */
  missingEvidenceGaps: string[];
  /** Contradictions preserved from Phase 1 */
  contradictions: EvidenceContradiction[];
  /** Missing requirements preserved from Phase 1 */
  missingRequirements: MissingEvidenceRequirement[];
  /** Concise explainability narrative for this skill */
  narrative: string;
  /** Whether this skill was explicitly targeted by the student's current goal */
  isTargetSkill: boolean;
}

/**
 * Comprehensive Student Learning Assessment output contract.
 * Answers: "Given the student's goal and available evidence, what is the student's current learning situation?"
 */
export interface StudentLearningAssessment {
  /** Unique ID for the assessment snapshot */
  assessmentId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Associated goal understanding from Phase 6A if available */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Target skills explicitly relevant to the active goal */
  targetSkills: string[];
  /** Assessments for all evaluated relevant skills */
  skillAssessments: SkillLearningAssessment[];
  /** Skills classified as supported strengths */
  supportedStrengths: string[];
  /** Skills classified as actively developing */
  developingAreas: string[];
  /** Skills with significant empirical gaps (claims without proof) */
  evidenceGaps: string[];
  /** Skills classified as active empirical contradictions */
  contradictedAreas: string[];
  /** Structured UI representation: Already demonstrated / verified strengths */
  alreadyDemonstrated?: string[];
  /** Structured UI representation: Topics needing reinforcement / remediation */
  needsReinforcement?: string[];
  /** Structured UI representation: New learning / topics with insufficient prior evidence */
  newLearning?: string[];
  /** Observable behavioral learning patterns */
  observablePatterns: ObservableLearningPattern[];
  /** High-level summary of recent activity telemetry */
  recentActivitySummary: {
    totalEvidenceRecords: number;
    hasRecentGitHubActivity: boolean;
    hasRecentLeetCodeActivity: boolean;
    hasLoggedMistakes: boolean;
    hasFocusSessions: boolean;
    activeSources: string[];
  };
  /** Overall synthesis of the student's current learning situation */
  assessmentSummary: string;
  /** Concrete, grounded pedagogical focus areas */
  recommendedFocusAreas: string[];
  /** Overall assessment confidence level */
  overallConfidence: 'HIGH' | 'MODERATE' | 'LOW';
  /** Processing engine source */
  source: 'DETERMINISTIC_ONLY' | 'LLM_ASSISTED' | 'LLM_FALLBACK_DETERMINISTIC';
  /** ISO 8601 timestamp of assessment */
  assessedAt: string;
}

/**
 * Client interface for injecting custom or mocked LLM generation for testing or production.
 */
export interface AssessmentLlmClient {
  generateJson: (prompt: string) => Promise<string>;
}

/**
 * Input configuration for generating an Evidence-Aware Student Assessment.
 */
export interface GenerateAssessmentInput {
  /** Authenticated student user ID (strictly authoritative) */
  userId: string;
  /** Phase 6A Goal Understanding context */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Raw goal text if goalUnderstanding is not available */
  rawGoalText?: string | null;
  /** Phase 1 Corroboration Audit result or CorroborationResult */
  corroborationAudit?: StudentCorroborationAuditResult | null;
  /** Raw evidence collection if audit is not pre-calculated */
  corroborationResult?: CorroborationResult | null;
  /** Optional filter to restrict analysis to specific skills */
  targetSkillsFilter?: string[] | null;
  /** Whether to allow LLM assistance (default: true) */
  allowLlm?: boolean;
  /** Custom LLM client for testing or specific model configuration */
  llmClient?: AssessmentLlmClient;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
}
