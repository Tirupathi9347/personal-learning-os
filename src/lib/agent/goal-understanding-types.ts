/**
 * Phase 6A: Intelligent Goal Understanding Types
 * 
 * Defines strongly-typed contracts for deterministic + LLM-assisted
 * natural-language goal understanding for the SINGLE Learning Orchestrator.
 */

import { GoalCategory, TriggerPriority } from './intake-types';
import { StudentCorroborationAuditResult } from './types';

/**
 * Epistemic status of a piece of extracted information.
 * - EXPLICIT: Directly stated by the student in the prompt.
 * - INFERRED: Reasonably derived from the student's wording without fabrication.
 * - UNKNOWN: Not provided in the prompt.
 */
export type InformationEpistemicStatus = 'EXPLICIT' | 'INFERRED' | 'UNKNOWN';

/**
 * Overall confidence in the goal understanding result.
 */
export type GoalUnderstandingConfidence = 'HIGH' | 'MODERATE' | 'LOW';

/**
 * Inferred or explicit goal urgency level.
 */
export type GoalUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * An individual signal extracted from the student's input.
 */
export interface ExtractedSignal {
  /** Dimension or entity type (e.g. 'TARGET_SKILL', 'EXAM_TIMEFRAME', 'TOPIC', 'DIFFICULTY', 'DESIRED_OUTCOME') */
  dimension: string;
  /** Extracted raw or normalized value */
  value: string;
  /** Epistemic status: whether directly stated or inferred */
  status: InformationEpistemicStatus;
  /** Confidence score between 0.0 and 1.0 */
  confidence: number;
  /** Short explanation or quote supporting this signal */
  rationale?: string;
}

/**
 * Structured clarification question generated when information is missing or ambiguous.
 */
export interface GoalClarificationQuestion {
  /** Specific missing dimension (e.g. 'TARGET_SKILL', 'TIMEFRAME', 'GOAL_SCOPE') */
  dimension: string;
  /** Friendly, concise question prompt for the student */
  question: string;
  /** Suggested multiple-choice options to make answering fast and effortless */
  suggestedOptions?: string[];
}

/**
 * Structured, validated output contract for Goal Understanding.
 */
export interface GoalUnderstanding {
  /** Original verbatim student input */
  originalGoal: string;
  /** Normalized, cleaned goal text */
  normalizedGoal: string;
  /** Canonical goal category */
  category: GoalCategory;
  /** Categorization confidence between 0.0 and 1.0 */
  categoryConfidence: number;
  /** Concise, actionable primary objective statement */
  objective: string;
  /** Target skill or subject if identified, or null if unknown */
  targetSkill: string | null;
  /** Epistemic status of the target skill */
  targetSkillStatus: InformationEpistemicStatus;
  /** Identified subtopic or focus area (e.g. 'Normalization' within 'DBMS') */
  subtopic?: string | null;
  /** Explicit or inferred timeframe expression (e.g. 'next Friday', 'in 7 days', or null) */
  timeframe: string | null;
  /** Epistemic status of the timeframe */
  timeframeStatus: InformationEpistemicStatus;
  /** Goal urgency rating derived from timeframe or explicit wording */
  urgency: GoalUrgency;
  /** Explicitly stated student constraints (e.g. 'only 1 hour per day', 'no heavy math') */
  constraints: string[];
  /** Ambiguity flags identifying vague or missing dimensions */
  ambiguityFlags: string[];
  /** Whether critical information is missing requiring student clarification */
  clarificationNeeded: boolean;
  /** Targeted clarification questions if clarification is needed */
  clarificationQuestions: GoalClarificationQuestion[];
  /** Detailed signals extracted from input */
  extractedSignals: ExtractedSignal[];
  /** Human-readable explanation of how the goal was understood */
  reasoningSummary: string;
  /** Overall understanding confidence */
  confidence: GoalUnderstandingConfidence;
  /** Processing engine source */
  source: 'DETERMINISTIC_ONLY' | 'LLM_ASSISTED' | 'LLM_FALLBACK_DETERMINISTIC';
  /** Optional summary of Phase 1 corroborated evidence grounding */
  evidenceContextSummary?: {
    verifiedSkills: string[];
    unverifiedSkills: string[];
    contradictedSkills: string[];
    overallGroundTruthScore?: number;
  };
  /** ISO 8601 timestamp of generation */
  createdAt: string;
}

/**
 * Client interface for injecting custom or mocked LLM generation for testing or production.
 */
export interface GoalUnderstandingLlmClient {
  generateJson: (prompt: string) => Promise<string>;
}

/**
 * Input configuration for the Goal Understanding engine.
 */
export interface UnderstandGoalInput {
  /** Authenticated user ID (strictly authoritative, cannot be mutated) */
  userId: string;
  /** Raw natural-language goal text submitted by student */
  rawGoalText: string;
  /** Optional pre-identified target skill hint */
  targetSkillHint?: string | null;
  /** Optional pre-identified timeframe hint */
  timeframeHint?: string | null;
  /** Optional pre-selected category hint */
  categoryHint?: GoalCategory | null;
  /** Optional Phase 1 Corroboration Audit results for evidence grounding */
  evidenceAudit?: StudentCorroborationAuditResult | null;
  /** Whether to allow LLM assistance (default: true if configured, false in fallback/offline) */
  allowLlm?: boolean;
  /** Custom LLM client for testing or specific model configuration */
  llmClient?: GoalUnderstandingLlmClient;
  /** Explicit fixed timestamp for deterministic tests */
  timestamp?: string;
}
