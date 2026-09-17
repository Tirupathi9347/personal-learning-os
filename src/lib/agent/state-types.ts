/**
 * Feature 2A: Agent State Model Types for the Agentic Learning OS.
 * 
 * Defines the strongly-typed, explicit state model, safety bounds, and
 * transition contracts for the SINGLE Learning Orchestrator Agent.
 */

import { 
  EvidenceCollectionResult, 
  CorroborationResult, 
  StudentCorroborationAuditResult 
} from './types';

/**
 * The 14 canonical states of the Learning Orchestrator Agent.
 */
export type AgentState =
  | 'IDLE'
  | 'GOAL_RECEIVED'
  | 'OBSERVING'
  | 'CORROBORATING'
  | 'ASSESSING'
  | 'PLANNING'
  | 'TOOL_SELECTION'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'UPDATING'
  | 'REPLANNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'WAITING_FOR_APPROVAL';

/**
 * Triggers that initiate an agent goal or cycle.
 */
export type AgentEventTrigger =
  | 'MANUAL_GOAL'
  | 'SCHEDULED_AUDIT'
  | 'STUDENT_MISTAKE_LOGGED'
  | 'STUDY_SESSION_COMPLETED'
  | 'EXTERNAL_SYNC'
  | 'SKILL_GAP_DETECTED'
  | 'PROACTIVE_RECOMMENDATION';

/**
 * Configurable safety limits to prevent runaway loops, infinite tool execution,
 * or recursive replanning.
 */
export interface AgentSafetyLimits {
  /** Maximum number of tool iterations allowed in a single run (default: 10) */
  maxToolIterations: number;
  /** Maximum number of replanning attempts allowed in a single run (default: 3) */
  maxReplans: number;
  /** Maximum consecutive execution failures before triggering FAILED (default: 2) */
  maxConsecutiveFailures: number;
  /** Optional timeout for human approval in milliseconds */
  approvalTimeoutMs?: number;
}

/**
 * Runtime execution counters for safety limit enforcement.
 */
export interface AgentExecutionCounters {
  /** Total tool selection / execution iterations in this run */
  toolIterations: number;
  /** Total replanning attempts in this run */
  replans: number;
  /** Current consecutive failure count */
  consecutiveFailures: number;
  /** Total successfully executed and verified actions */
  totalExecutedActions: number;
}

/**
 * Structured details about an agent failure.
 */
export interface AgentFailureInfo {
  code: string;
  message: string;
  failedAtState: AgentState;
  timestamp: string; // ISO 8601
  details?: unknown;
  recoverable: boolean;
}

/**
 * Permission/Risk levels for actions requiring human confirmation.
 */
export type ApprovalRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/**
 * Decision status for human approval.
 */
export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'MODIFIED';

/**
 * Human approval request contract.
 */
export interface AgentApprovalRequest {
  id: string;
  actionType: string;
  description: string;
  riskLevel: ApprovalRiskLevel;
  payload: Record<string, unknown>;
  requestedAt: string; // ISO 8601
  resolvedAt?: string | null;
  decision: ApprovalDecision;
  decisionNotes?: string;
}

/**
 * Record of a single state transition for auditing and determinism.
 */
export interface AgentStateTransitionRecord {
  id: string;
  fromState: AgentState;
  toState: AgentState;
  timestamp: string; // ISO 8601
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * Contextual parameters for an agent run.
 */
export interface AgentRunContext {
  runId: string;
  userId: string;
  goal: string;
  eventTrigger: AgentEventTrigger;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  completedAt?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Working memory and ground-truth evidence context attached to the run.
 */
export interface AgentEvidenceContext {
  collection?: EvidenceCollectionResult;
  corroboration?: CorroborationResult;
  audit?: StudentCorroborationAuditResult;
}

/**
 * Complete snapshot of the Learning Orchestrator Agent's state at any point in time.
 * Designed for pure in-memory execution and future serialization into Supabase.
 */
export interface AgentRunState {
  runId: string;
  userId: string;
  currentState: AgentState;
  previousState: AgentState | null;
  context: AgentRunContext;
  safetyLimits: AgentSafetyLimits;
  counters: AgentExecutionCounters;
  activeApprovalRequest: AgentApprovalRequest | null;
  lastFailure: AgentFailureInfo | null;
  evidenceContext: AgentEvidenceContext;
  transitionHistory: AgentStateTransitionRecord[];
  workingMemory: Record<string, unknown>;
  updatedAt: string; // ISO 8601
}

/**
 * Input payload for requesting a state transition.
 */
export interface AgentStateTransitionInput {
  targetState: AgentState;
  reason: string;
  failure?: AgentFailureInfo;
  approvalRequest?: AgentApprovalRequest;
  approvalDecision?: {
    decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
    notes?: string;
  };
  evidenceUpdate?: Partial<AgentEvidenceContext>;
  workingMemoryUpdate?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Result of attempting a state transition.
 */
export interface AgentTransitionResult {
  success: boolean;
  state: AgentRunState;
  error?: {
    code: string;
    message: string;
    fromState: AgentState;
    targetState: AgentState;
  };
}
