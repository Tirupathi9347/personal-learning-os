/**
 * Feature 2E-1: Agent Run Persistence Types for the Agentic Learning OS.
 * 
 * Defines the database row contracts and serialization mappers for persisting
 * Learning Orchestrator runs to Supabase (public.agent_runs).
 */

import {
  AgentState,
  AgentRunState,
  AgentFailureInfo,
  AgentApprovalRequest,
  AgentStateTransitionRecord,
  AgentEventTrigger,
} from './state-types';
import {
  TriggerType,
  AgentTriggerContext,
} from './intake-types';

/**
 * Top-level status of an agent run in storage.
 */
export type AgentRunStatus =
  | 'RUNNING'
  | 'PAUSED_FOR_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

/**
 * Exact schema representation of a row in the public.agent_runs Supabase table.
 */
export interface AgentRunDbRecord {
  id: string;
  user_id: string;
  trigger_type: TriggerType;
  event_trigger: AgentEventTrigger;
  goal: string;
  trigger_context: Record<string, unknown>;
  current_state: AgentState;
  status: AgentRunStatus;
  tool_iterations: number;
  replans_count: number;
  executed_actions_count: number;
  failure_info: AgentFailureInfo | null;
  approval_request: AgentApprovalRequest | null;
  working_memory: Record<string, unknown>;
  transition_history: AgentStateTransitionRecord[];
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  created_at?: string;
}

/**
 * Deterministically serializes an in-memory AgentRunState into a database-ready AgentRunDbRecord.
 * Ensures no raw credentials or secrets are stored.
 */
export function serializeAgentRunToDb(
  state: AgentRunState,
  status: AgentRunStatus,
  triggerContext?: AgentTriggerContext
): AgentRunDbRecord {
  const triggerType: TriggerType = triggerContext?.triggerType || (state.context.eventTrigger === 'MANUAL_GOAL' ? 'STUDENT_GOAL' : 'SYSTEM_EVENT');

  return {
    id: state.runId,
    user_id: state.userId,
    trigger_type: triggerType,
    event_trigger: state.context.eventTrigger,
    goal: state.context.goal,
    trigger_context: (triggerContext ? (triggerContext as unknown as Record<string, unknown>) : (state.context.metadata?.triggerContext as Record<string, unknown>) || {}),
    current_state: state.currentState,
    status,
    tool_iterations: state.counters.toolIterations,
    replans_count: state.counters.replans,
    executed_actions_count: state.counters.totalExecutedActions,
    failure_info: state.lastFailure,
    approval_request: state.activeApprovalRequest,
    working_memory: state.workingMemory || {},
    transition_history: state.transitionHistory || [],
    started_at: state.context.createdAt,
    updated_at: state.updatedAt,
    completed_at: state.context.completedAt || (status === 'COMPLETED' ? state.updatedAt : null),
  };
}
