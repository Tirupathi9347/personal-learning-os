/**
 * Phase 4D: Controlled Plan Execution Engine Types
 * 
 * Defines strongly-typed contracts for controlled plan step execution,
 * eligibility validation, ground-truth read-only tool orchestration,
 * sanitization boundaries, verification handoffs, and side-effect guarantees
 * for the SINGLE Learning Orchestrator Agent.
 */

import {
  LearningPlan,
  PlanStep,
  PlanPriority,
  PlanStepStatus,
  PlanStatus,
} from './planning-types';
import {
  ToolExecutionResult,
  ToolExecutionStatus,
  ToolBatchExecutionOptions,
} from './tool-executor';
import { AgentToolRegistry } from './tool-registry';
import {
  AgentSafetyLimits,
  AgentExecutionCounters,
  AgentApprovalRequest,
  ApprovalRiskLevel,
} from './state-types';

/**
 * Execution outcome status for an attempted PlanStep run.
 */
export type PlanStepExecutionStatus =
  | 'SUCCESS'            // Step and all required tools completed successfully.
  | 'FAILED'             // Step execution failed (e.g. tool runtime error).
  | 'BLOCKED'            // Step cannot execute (missing dependency, plan status, unavailable tool, limit reached).
  | 'SKIPPED'            // Step was already completed or skipped.
  | 'REQUIRES_APPROVAL'; // Step execution paused pending explicit user approval.

/**
 * Result of checking whether a PlanStep is eligible for immediate execution.
 */
export interface StepExecutionEligibilityResult {
  /** True if and only if all 12 safety & dependency conditions are satisfied */
  isEligible: boolean;
  /** High-level eligibility status */
  status: 'ELIGIBLE' | 'BLOCKED' | 'REQUIRES_APPROVAL' | 'SKIPPED' | 'FAILED';
  /** List of all blocking reasons if ineligible */
  blockingReasons: string[];
  /** Approval request payload if approval is required */
  approvalRequest?: AgentApprovalRequest;
  /** Resolved target step object */
  step?: PlanStep;
  /** Target parent plan */
  plan?: LearningPlan;
}

/**
 * Verification Handoff Contract.
 * Conveys execution results to future Phase 4E verification without claiming learning outcomes.
 */
export interface VerificationHandoff {
  /** Parent plan ID */
  planId: string;
  /** Executed step ID */
  stepId: string;
  /** Intended action description from the plan */
  intendedAction: string;
  /** Tool names that were executed during this step */
  executedTools: string[];
  /** Sanitized summary of tool results */
  toolResultsSummary: Record<string, unknown>;
  /** Whether all required read-only tools executed with status SUCCESS */
  toolsExecutedSuccessfully: boolean;
  /** Any tools that failed during execution */
  failedTools: string[];
  /** Any unresolved knowledge gaps or missing data */
  unresolvedGaps: string[];
  /** Empirical verification criteria specified on the step */
  verificationCriteria: string[];
  /** Whether empirical telemetry was observed (e.g. non-empty records retrieved) */
  empiricalEvidenceObserved: boolean;
  /** Explicit architectural disclaimer */
  disclaimer: string;
}

/**
 * Side-effect boundary confirmation guarantees.
 */
export interface StepSideEffectGuarantees {
  /** Strictly false in Phase 4D: No task records were created, updated, or deleted */
  isTaskModified: false;
  /** Strictly false in Phase 4D: No calendar events were created, updated, or deleted */
  isCalendarModified: false;
  /** Strictly false in Phase 4D: No database records were created, updated, or deleted */
  isDatabaseModified: false;
  /** Strictly false in Phase 4D: No external side effects (emails, webhooks, LLM calls) occurred */
  isExternalSideEffectTriggered: false;
  /** Verification description */
  auditDescription: string;
}

/**
 * Strongly-typed execution result for an individual PlanStep execution attempt.
 */
export interface PlanStepExecutionResult {
  /** Unique execution identifier */
  executionId: string;
  /** Parent plan ID */
  planId: string;
  /** Executed step ID */
  stepId: string;
  /** Execution outcome status */
  status: PlanStepExecutionStatus;
  /** ISO 8601 start timestamp */
  startedAt: string;
  /** ISO 8601 completion timestamp */
  completedAt: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** List of tool names selected and executed */
  selectedTools: string[];
  /** Detailed tool execution results from Phase 3 executor */
  toolResults: ToolExecutionResult[];
  /** Verification handoff package for Phase 4E */
  verificationHandoff?: VerificationHandoff;
  /** Sanitized update payload suitable for AgentRunState.workingMemory */
  workingMemoryUpdate: Record<string, unknown>;
  /** Error information if status is FAILED or BLOCKED */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Explicit blocking reason if status is BLOCKED */
  blockingReason?: string;
  /** Human approval request if status is REQUIRES_APPROVAL */
  approvalRequest?: AgentApprovalRequest;
  /** Updated plan instance reflecting step execution status */
  updatedPlan?: LearningPlan;
  /** Certified side-effect boundary guarantees */
  sideEffectGuarantees: StepSideEffectGuarantees;
}

/**
 * Input parameters for executing a specific plan step.
 */
export interface ExecutePlanStepInput {
  /** The validated LearningPlan containing the step */
  plan: LearningPlan;
  /** ID of the specific step to execute */
  stepId: string;
  /** Authenticated user ID (must match plan.userId for tenant isolation) */
  authenticatedUserId: string;
  /** Optional custom ToolRegistry instance (defaults to agentToolRegistry) */
  registry?: AgentToolRegistry;
  /** Safety limits for loop/iteration guarding */
  safetyLimits?: AgentSafetyLimits;
  /** Execution counters for rate/failure tracking */
  counters?: AgentExecutionCounters;
  /** Optional per-tool timeout in milliseconds */
  timeoutMs?: number;
  /** Custom tool executors for controlled unit testing without real DB */
  customExecutors?: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
}
