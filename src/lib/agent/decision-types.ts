/**
 * Phase 6C: Decision & Action Selection Types
 * 
 * Defines strongly-typed contracts for deterministic + LLM-assisted
 * decision and action selection for the SINGLE Learning Orchestrator.
 */

import { GoalUnderstanding } from './goal-understanding-types';
import { StudentLearningAssessment, SkillLearningAssessment } from './assessment-types';
import { TriggerPriority } from './intake-types';

/**
 * Canonical Decision Types for the Learning Orchestrator.
 * Represents WHAT should happen next and WHY, strictly separated from HOW (planning).
 */
export type DecisionType =
  | 'CLARIFY_GOAL'                  // Goal is ambiguous or missing critical dimensions
  | 'ASSESS_SKILL'                  // Evidence gap: need baseline assessment before planning
  | 'BUILD_FOUNDATION'              // Fundamental weakness or low proficiency detected
  | 'TARGET_WEAK_AREA'              // Target specific weak area or topic
  | 'REINFORCE_DEVELOPING_SKILL'    // Moderate evidence: reinforce with focused practice
  | 'PRACTICE'                      // General or advanced deliberate practice
  | 'REVIEW_MISTAKES'               // Recurring mistakes or contradiction resolution
  | 'PREPARE_FOR_ASSESSMENT'        // Exam / interview / deadline preparation
  | 'PLAN_SCHEDULE'                 // Schedule, time-allocation, or pacing planning
  | 'CORROBORATE_EVIDENCE'          // Audit telemetry and calibrate skills
  | 'CONTINUE_CURRENT_PATH'         // Maintain active learning trajectory
  | 'WAIT_FOR_MORE_EVIDENCE';       // Cannot proceed without external telemetry or data

/**
 * Priority classification of a decision.
 */
export type DecisionPriority = TriggerPriority; // 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

/**
 * Epistemic confidence of the decision based on underlying evidence strength.
 */
export type DecisionConfidence = 'HIGH' | 'MODERATE' | 'LOW';

/**
 * Strongly-typed Learning Decision Contract.
 * Represents the structured outcome of Phase 6C decision selection.
 */
export interface LearningDecision {
  /** Unique decision snapshot ID */
  decisionId: string;
  /** Authenticated student user ID */
  userId: string;
  /** Primary decision classification */
  decisionType: DecisionType;
  /** Execution priority */
  priority: DecisionPriority;
  /** Confidence grounded in underlying evidence */
  confidence: DecisionConfidence;
  /** Associated goal statement or reference */
  goalReference?: string | null;
  /** Target skills relevant to this decision */
  targetSkills: string[];
  /** Concise statement of the primary pedagogical objective */
  primaryObjective: string;
  /** High-level recommended next action category */
  recommendedAction: string;
  /** Comprehensive evidence-grounded justification */
  rationale: string;
  /** Specific evidence items or telemetry supporting this decision */
  evidenceBasis: string[];
  /** Empirical contradictions identified during assessment */
  contradictions: string[];
  /** Known evidence gaps related to the target skills */
  evidenceGaps: string[];
  /** Capabilities / tools required to execute the recommended action */
  requiredCapabilities: string[];
  /** Required capabilities that are missing or unavailable in the environment */
  unavailableCapabilities: string[];
  /** Whether the decision requires further student clarification before planning */
  clarificationNeeded: boolean;
  /** Clarification questions if ambiguity must be resolved */
  clarificationQuestions: string[];
  /** Whether this decision is reversible (read-only decisions are always reversible) */
  reversible: boolean;
  /** Whether executing the downstream plan will require human confirmation */
  requiresHumanApproval: boolean;
  /** Processing engine source */
  source: 'DETERMINISTIC' | 'LLM_ASSISTED' | 'LLM_FALLBACK_DETERMINISTIC';
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** Arbitrary extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Client interface for injecting custom or mocked LLM generation for testing or production.
 */
export interface DecisionLlmClient {
  generateJson: (prompt: string) => Promise<string>;
}

/**
 * Input configuration for generating a Learning Decision.
 */
export interface GenerateDecisionInput {
  /** Authenticated student user ID */
  userId: string;
  /** Phase 6A Goal Understanding context */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Phase 6B Student Learning Assessment context */
  assessment?: StudentLearningAssessment | null;
  /** List of registered / available tool names or capabilities in the environment */
  availableCapabilities?: string[] | null;
  /** Raw goal text if goalUnderstanding is not pre-computed */
  rawGoalText?: string | null;
  /** Whether to allow LLM assistance (default: true) */
  allowLlm?: boolean;
  /** Custom LLM client for testing or model integration */
  llmClient?: DecisionLlmClient;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
  /** Extensible options */
  metadata?: Record<string, unknown>;
}
