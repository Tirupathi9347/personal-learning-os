/**
 * Phase 6D: Decision-to-Plan Bridge Types
 * 
 * Defines strongly-typed contracts for converting a Phase 6C LearningDecision
 * into a validated, operational Phase 4 LearningPlan for the SINGLE Learning Orchestrator.
 */

import { LearningDecision, DecisionType, DecisionPriority, DecisionConfidence } from './decision-types';
import { GoalUnderstanding } from './goal-understanding-types';
import { StudentLearningAssessment } from './assessment-types';
import { LearningPlan, PlanStep, CreatePlanInput } from './planning-types';
import { StudentCorroborationAuditResult } from './types';

/**
 * Status of the Decision-to-Plan bridge transformation.
 */
export type DecisionPlanBridgeStatus =
  | 'PLAN_GENERATED'             // Successfully mapped into a valid, DAG-verified LearningPlan
  | 'CLARIFICATION_REQUIRED'     // Gated by clarification needs; executable plan intentionally omitted
  | 'BLOCKED_BY_CAPABILITY'      // Requires capabilities absent from the environment
  | 'BLOCKED_WAITING_EVIDENCE'   // Blocked waiting for external evidence or telemetry connection
  | 'REJECTED';                  // Invalid inputs or irreconcilable constraints

/**
 * Input configuration for bridging a LearningDecision into a LearningPlan.
 */
export interface DecisionPlanBridgeInput {
  /** The originating Phase 6C Learning Decision (strictly authoritative) */
  decision: LearningDecision;
  /** Phase 6A Goal Understanding context if available */
  goalUnderstanding?: GoalUnderstanding | null;
  /** Phase 6B Student Learning Assessment context if available */
  assessment?: StudentLearningAssessment | null;
  /** Phase 1 Corroboration Audit result if available */
  corroborationAudit?: StudentCorroborationAuditResult | null;
  /** Available tools / capabilities in the execution environment */
  availableCapabilities?: string[] | null;
  /** Authenticated user ID (must match decision.userId) */
  userId?: string;
  /** Optional custom plan ID */
  planId?: string;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
  /** Arbitrary extensible metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Output contract of the Decision-to-Plan bridge.
 */
export interface DecisionPlanBridgeResult {
  /** Lifecycle outcome status */
  status: DecisionPlanBridgeStatus;
  /** Traceable decision ID */
  decisionId: string;
  /** Authenticated user ID */
  userId: string;
  /** Canonical decision type */
  decisionType: DecisionType;
  /** Execution priority */
  priority: DecisionPriority;
  /** Ground-truth confidence */
  confidence: DecisionConfidence;
  /** Target skills involved */
  targetSkills: string[];
  /** Primary objective */
  primaryObjective: string;
  /** Recommended action category */
  recommendedAction: string;
  /** Assembled, DAG-validated LearningPlan (omitted if clarification required or rejected) */
  plan?: LearningPlan;
  /** Clarification questions if status is CLARIFICATION_REQUIRED */
  clarificationQuestions: string[];
  /** Reasons why the plan or execution is blocked */
  blockingReasons: string[];
  /** Evidence-grounded rationale */
  rationale: string;
  /** Supporting evidence telemetry references */
  evidenceBasis: string[];
  /** Preserved empirical contradictions */
  contradictions: string[];
  /** Preserved empirical evidence gaps */
  evidenceGaps: string[];
  /** Verified required capabilities */
  requiredCapabilities: string[];
  /** Unavailable or missing capabilities */
  unavailableCapabilities: string[];
  /** Generation timestamp (ISO 8601) */
  generatedAt: string;
  /** Processing engine source */
  source: 'DETERMINISTIC' | 'LLM_ASSISTED' | 'LLM_FALLBACK_DETERMINISTIC';
  /** Extensible metadata */
  metadata?: Record<string, unknown>;
}
