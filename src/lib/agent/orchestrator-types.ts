/**
 * Feature 2B: Learning Orchestrator Loop Types for the Agentic Learning OS.
 * 
 * Defines typed handler interfaces, execution options, and serializable result contracts
 * for the SINGLE Learning Orchestrator Agent.
 */

import {
  AgentState,
  AgentRunState,
  AgentApprovalRequest,
  EvidenceCollectionResult,
  CorroborationResult,
  StudentCorroborationAuditResult,
} from './types';

/**
 * Result returned by the Observation handler.
 */
export interface ObservingHandlerResult {
  evidenceCollection?: EvidenceCollectionResult;
  requiresApproval?: boolean;
  approvalRequest?: AgentApprovalRequest;
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Corroboration handler.
 */
export interface CorroboratingHandlerResult {
  corroboration?: CorroborationResult;
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Assessment handler.
 */
export interface AssessingHandlerResult {
  audit?: StudentCorroborationAuditResult;
  requiresPlanning?: boolean; // If false, execution completes cleanly at assessment (e.g. audit-only goals)
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Planning handler.
 */
export interface PlanningHandlerResult {
  plan?: unknown;
  requiresApproval?: boolean;
  approvalRequest?: AgentApprovalRequest;
  needsReplan?: boolean;
  isComplete?: boolean; // If goal is achieved with no tools needed, completes directly
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Tool Selection handler.
 */
export interface ToolSelectionHandlerResult {
  selectedTool?: unknown;
  requiresApproval?: boolean;
  approvalRequest?: AgentApprovalRequest;
  needsReplan?: boolean;
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Tool Execution handler.
 */
export interface ExecutingHandlerResult {
  executionOutput?: unknown;
  requiresApproval?: boolean;
  approvalRequest?: AgentApprovalRequest;
  needsReplan?: boolean;
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Verification handler.
 */
export interface VerifyingHandlerResult {
  verified: boolean;
  needsReplan?: boolean;
  failureReason?: string;
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Updating handler.
 */
export interface UpdatingHandlerResult {
  hasMoreSteps?: boolean;
  nextState?: 'TOOL_SELECTION' | 'EXECUTING' | 'PLANNING' | 'COMPLETED';
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Result returned by the Replanning handler.
 */
export interface ReplanningHandlerResult {
  nextState?: 'PLANNING' | 'OBSERVING' | 'TOOL_SELECTION';
  workingMemory?: Record<string, unknown>;
  reason?: string;
}

/**
 * Pluggable handlers for the Learning Orchestrator execution stages.
 * Each handler provides an explicit typed boundary.
 */
export interface OrchestratorHandlers {
  onObserving?: (state: AgentRunState) => Promise<ObservingHandlerResult>;
  onCorroborating?: (state: AgentRunState) => Promise<CorroboratingHandlerResult>;
  onAssessing?: (state: AgentRunState) => Promise<AssessingHandlerResult>;
  onPlanning?: (state: AgentRunState) => Promise<PlanningHandlerResult>;
  onToolSelection?: (state: AgentRunState) => Promise<ToolSelectionHandlerResult>;
  onExecuting?: (state: AgentRunState) => Promise<ExecutingHandlerResult>;
  onVerifying?: (state: AgentRunState) => Promise<VerifyingHandlerResult>;
  onUpdating?: (state: AgentRunState) => Promise<UpdatingHandlerResult>;
  onReplanning?: (state: AgentRunState) => Promise<ReplanningHandlerResult>;
}

import { SupabaseClient } from '@supabase/supabase-js';
import { AgentTriggerContext } from './intake-types';

/**
 * Execution configuration for the Orchestrator loop.
 */
export interface OrchestratorExecutionOptions {
  handlers?: OrchestratorHandlers;
  /** Maximum loop step iterations to prevent infinite execution cycles (default: 50) */
  maxLoopSteps?: number;
  /** Authenticated Supabase client for RLS-scoped agent run persistence */
  supabase?: SupabaseClient;
  /** Whether to persist transitions to public.agent_runs (default: true if supabase is provided) */
  persistState?: boolean;
  /** Original validated trigger context if available */
  triggerContext?: AgentTriggerContext;
}

/**
 * Final serializable execution output of the Learning Orchestrator run.
 */
export interface OrchestratorExecutionResult {
  success: boolean;
  finalState: AgentRunState;
  status: 'COMPLETED' | 'PAUSED_FOR_APPROVAL' | 'FAILED';
  totalTransitions: number;
  persisted?: boolean;
  persistenceError?: {
    code: string;
    message: string;
  };
  error?: {
    code: string;
    message: string;
    state: AgentState;
  };
}

