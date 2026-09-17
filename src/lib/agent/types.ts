import { 
  Skill, 
  StudentProfile, 
  EvidenceLink, 
  GitHubActivityLog, 
  LeetCodeSubmission, 
  Mistake, 
  TimeSession, 
  Project, 
  Task 
} from '@/types';

export type {
  Skill,
  StudentProfile,
  EvidenceLink,
  GitHubActivityLog,
  LeetCodeSubmission,
  Mistake,
  TimeSession,
  Project,
  Task,
};

/**
 * Supported Evidence Sources within Personal Learning OS.
 * Maps both internal self-reported entities and external ground-truth feeds.
 */
export type EvidenceSourceType =
  | 'profile'          // Self-reported in StudentProfile or skills table
  | 'github'           // GitHub commits, push events, repositories
  | 'leetcode'         // LeetCode accepted submissions, contest rating
  | 'project'          // Completed or active codebases / repos
  | 'mistake'          // Logged mistakes, root causes, recurring errors
  | 'study_session'    // Tracked time sessions (Pomodoro / Focus timer)
  | 'journal'          // Daily learning reflections
  | 'note'             // Structured notes and knowledge items
  | 'task'             // Completed to-dos and milestone tasks
  | 'quiz_assessment'  // Assessment scores / quiz results
  | 'external_sync';   // General external telemetry

/**
 * Rigorous epistemic classification of evidence.
 * Prevents treating unverified claims as ground truth.
 */
export type EvidenceClassification =
  | 'SELF_REPORTED'        // Unsubstantiated claims (e.g., student self-rates 4/5 or notes proficiency)
  | 'OBSERVED'             // Directly captured internal telemetry (e.g., logged 3 hours in focus timer, completed task)
  | 'INFERRED'             // Derived via heuristics (e.g., inferred language mastery from repo file extensions)
  | 'EXTERNALLY_VERIFIED'; // Ground truth from tamper-resistant third parties (e.g., GitHub commit SHA, LeetCode submission ID)

/**
 * Epistemic Polarity: Indicates whether an evidence record supports,
 * contradicts, or is neutral towards a claimed skill/competency.
 */
export type EvidencePolarity =
  | 'SUPPORTS'      // Corroborates the claim positively
  | 'CONTRADICTS'   // Refutes, disputes, or highlights deficiencies in the claim (e.g., low quiz score, repeated mistakes)
  | 'NEUTRAL';      // Contextual evidence without definitive positive or negative proof

/**
 * Discrete Confidence Level for an evaluated skill.
 */
export type SkillConfidenceLevel =
  | 'UNVERIFIED'    // Claimed but has 0 supporting empirical evidence
  | 'LOW'           // Minimal or weak evidence; high uncertainty
  | 'MODERATE'      // Partial corroboration with some external or observed proof
  | 'HIGH'          // Strong, multi-source external verification
  | 'CONTRADICTED';  // Significant negative evidence disproves or questions claimed proficiency

/**
 * Pointer reference back to the original database row or external entity.
 */
export interface EvidenceSourceReference {
  sourceType: EvidenceSourceType;
  sourceId?: string;
  tableName?: string;
  externalId?: string;
  url?: string;
  rawSnippet?: string;
  metadata?: Record<string, any>;
}

/**
 * Quantitative metrics attached to an empirical evidence observation.
 */
export interface EvidenceMetrics {
  score?: number;           // e.g. 38 for 38%
  totalPossible?: number;   // e.g. 100, or 20 for 4/20
  frequency?: number;       // e.g. 3 for 3 repeated normalization mistakes
  durationMinutes?: number; // e.g. 120 minutes of tracked study time
}

/**
 * An individual, immutable piece of corroborating or contradictory evidence.
 */
export interface EvidenceRecord {
  id: string;
  source: EvidenceSourceType;
  classification: EvidenceClassification;
  targetSkillName: string;
  targetSkillId?: string | null;
  description: string;
  polarity: EvidencePolarity;
  weight: number; // 0.0 to 1.0 (significance / epistemic authority of this evidence item)
  observedAt: string; // ISO 8601 timestamp
  sourceRef?: EvidenceSourceReference;
  metrics?: EvidenceMetrics;
}

export type ContradictionSeverity = 'MILD' | 'MODERATE' | 'SEVERE';

/**
 * Explicit contradiction detected between claimed proficiency and empirical evidence.
 */
export interface EvidenceContradiction {
  id: string;
  skillName: string;
  claimedProficiency: number; // 1 - 5
  contradictoryEvidenceIds: string[];
  reason: string;
  severity: ContradictionSeverity;
}

/**
 * Missing evidence requirement or recommendation needed to corroborate a claim.
 */
export interface MissingEvidenceRequirement {
  skillName: string;
  requiredClassification: EvidenceClassification;
  description: string;
  recommendedAction: string;
}

/**
 * Quantitative breakdown of factors affecting the confidence score calculation.
 */
export interface ConfidenceScoreBreakdown {
  supportingStrength: number;     // 0.0 to 1.0 (asymptotic positive evidence strength)
  contradictionPenalty: number;   // 0.0 to 1.0 (penalty ratio from contradictory evidence)
  freshnessMultiplier: number;    // 0.0 to 1.0 (recency factor)
  completenessMultiplier: number; // 0.0 to 1.0 (certainty ceiling based on missing gaps)
  rawScore: number;               // unrounded intermediate score
  finalScore: number;             // rounded [0.0, 1.0]
}

/**
 * Ground-truth evaluation of a single student skill.
 * Reconciles claimed proficiency against empirical corroboration.
 */
export interface StudentSkillAssessment {
  skillId?: string | null;
  skillName: string;
  category?: string;
  claimedProficiency: number; // 1 to 5 (from StudentProfile or skills table)
  assessedProficiency?: number | null; // Calibrated proficiency based on evidence (1 - 5)
  evidenceBackedScore: number; // 0.0 to 1.0 (calibrated confidence score)
  confidenceLevel: SkillConfidenceLevel;
  evidenceCount: {
    total: number;
    supporting: number;
    contradicting: number;
    neutral: number;
    externallyVerified: number;
  };
  evidenceRecords: EvidenceRecord[];
  contradictions: EvidenceContradiction[];
  missingEvidence: MissingEvidenceRequirement[];
  reasons: string[];
  breakdown?: ConfidenceScoreBreakdown;
  lastEvaluatedAt: string;
}

/**
 * High-level statistical summary of an audit run.
 */
export interface AuditSummary {
  totalSkillsClaimed: number;
  highConfidenceCount: number;
  moderateConfidenceCount: number;
  lowConfidenceCount: number;
  unverifiedCount: number;
  contradictedCount: number;
  overallGroundTruthScore: number; // 0.0 to 1.0
}

/**
 * Audit Environment Metadata.
 */
export interface AuditMetadata {
  hasGitHubConnected: boolean;
  hasLeetCodeConnected: boolean;
  totalEvidenceLinksParsed: number;
  engineVersion: string;
}

/**
 * Overall Ground-Truth Student Corroboration Audit Result.
 * Produced by Feature 1 (Ground-Truth Corroboration Engine).
 */
export interface StudentCorroborationAuditResult {
  auditId: string;
  studentUserId?: string | null;
  generatedAt: string;
  skillsEvaluated: StudentSkillAssessment[];
  summary: AuditSummary;
  warnings: string[];
  limitations: string[];
  metadata: AuditMetadata;
}

/**
 * Detailed result of the read-only evidence collection phase (Feature 1B).
 */
export interface EvidenceCollectionResult {
  collectedAt: string;
  totalRecords: number;
  records: EvidenceRecord[];
  sourcesSummary: Record<EvidenceSourceType, number>;
  connectedSources: EvidenceSourceType[];
  unconnectedSources: {
    source: EvidenceSourceType;
    reason: string;
  }[];
  errors: string[];
}

/**
 * Freshness assessment for a skill's empirical evidence.
 */
export interface EvidenceFreshness {
  newestEvidenceDate: string | null;
  oldestEvidenceDate: string | null;
  daysSinceNewest: number | null;
  isStale: boolean; // true if no empirical evidence within the staleness threshold (e.g. 90 days)
}

/**
 * Breakdown of corroborating vs contradictory evidence for an individual skill (Feature 1C).
 */
export interface CorroboratedSkillEvidence {
  skillId?: string | null;
  skillName: string;
  category?: string;
  claimedProficiency: number; // 1 to 5 (or 0 if un-claimed but demonstrated)
  hasExplicitClaim: boolean;

  // Evidence groupings by polarity
  supportingEvidence: EvidenceRecord[];
  contradictingEvidence: EvidenceRecord[];
  neutralEvidence: EvidenceRecord[];

  // Classification counts
  classificationCounts: {
    externallyVerified: number;
    observed: number;
    inferred: number;
    selfReported: number;
  };

  // Detected contradictions and gaps
  contradictions: EvidenceContradiction[];
  missingEvidence: MissingEvidenceRequirement[];

  // Freshness telemetry
  freshness: EvidenceFreshness;

  lastEvaluatedAt: string;
}

/**
 * Result of the Corroboration Engine evaluation phase (Feature 1C).
 */
export interface CorroborationResult {
  evaluatedAt: string;
  totalSkillsEvaluated: number;
  skills: CorroboratedSkillEvidence[];
  unmappedEvidence: EvidenceRecord[];
  contradictionSummary: {
    totalContradictions: number;
    severeCount: number;
    moderateCount: number;
    mildCount: number;
  };
  missingEvidenceSummary: {
    totalRequirements: number;
    unverifiedSkillCount: number;
    staleSkillCount: number;
  };
  limitations: string[];
}

// Feature 2A: Re-export Agent State Model Types
export * from './state-types';

// Feature 2B: Re-export Learning Orchestrator Types
export * from './orchestrator-types';

// Feature 2C: Re-export Intake Types
export * from './intake-types';

// Feature 2E-1: Re-export Persistence Types
export * from './persistence-types';



