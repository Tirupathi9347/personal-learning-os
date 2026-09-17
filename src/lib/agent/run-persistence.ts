/**
 * Feature 2E-2: Agent Run Persistence Engine for the Agentic Learning OS.
 * 
 * Provides:
 * - Deterministic persistence of agent runs to Supabase (public.agent_runs).
 * - Row Level Security (RLS) enforcement via authenticated Supabase client.
 * - Loading and deserialization of existing runs for pause/resume flows.
 * - Strict exclusion of secrets, raw API tokens, and credentials.
 * - Structured persistence error handling.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  AgentRunState,
  AgentState,
} from './state-types';
import { DEFAULT_AGENT_SAFETY_LIMITS } from './state-machine';
import { AgentTriggerContext } from './intake-types';
import {
  AgentRunDbRecord,
  AgentRunStatus,
  serializeAgentRunToDb,
} from './persistence-types';

const SENSITIVE_KEY_PATTERN = /apiKey|secret|token|password|authTag|encryptedKey|geminiKey|privateKey|credential/i;

/**
 * Sanitizes working memory recursively to ensure no secrets, credentials, or private tokens
 * are persisted to the database.
 */
export function sanitizeWorkingMemory(memory: Record<string, unknown>): Record<string, unknown> {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(memory)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      // Exclude sensitive keys
      continue;
    }

    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeWorkingMemory(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        item && typeof item === 'object' && !(item instanceof Date)
          ? sanitizeWorkingMemory(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Persists or updates an AgentRunState into the public.agent_runs table.
 * Strictly relies on the authenticated client and Supabase RLS.
 */
export async function persistAgentRunState(
  supabase: SupabaseClient,
  state: AgentRunState,
  status: AgentRunStatus,
  triggerContext?: AgentTriggerContext
): Promise<{
  success: boolean;
  record?: AgentRunDbRecord;
  error?: { code: string; message: string };
}> {
  try {
    const rawRecord = serializeAgentRunToDb(state, status, triggerContext);

    // Apply strict working memory sanitization
    const sanitizedRecord: AgentRunDbRecord = {
      ...rawRecord,
      working_memory: sanitizeWorkingMemory(rawRecord.working_memory),
    };

    const { data, error } = await supabase
      .from('agent_runs')
      .upsert(sanitizedRecord, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      return {
        success: false,
        error: {
          code: 'ERR_PERSISTENCE_DB_ERROR',
          message: error.message,
        },
      };
    }

    return {
      success: true,
      record: data as AgentRunDbRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: 'ERR_PERSISTENCE_EXCEPTION',
        message,
      },
    };
  }
}

/**
 * Deserializes an AgentRunDbRecord row back into an in-memory AgentRunState.
 */
export function deserializeDbRecordToAgentRun(record: AgentRunDbRecord): AgentRunState {
  return {
    runId: record.id,
    userId: record.user_id,
    currentState: record.current_state,
    previousState:
      record.transition_history && record.transition_history.length > 1
        ? record.transition_history[record.transition_history.length - 2].toState
        : null,
    context: {
      runId: record.id,
      userId: record.user_id,
      goal: record.goal,
      eventTrigger: record.event_trigger,
      createdAt: record.started_at,
      updatedAt: record.updated_at,
      completedAt: record.completed_at,
      metadata: record.trigger_context || {},
    },
    safetyLimits: {
      ...DEFAULT_AGENT_SAFETY_LIMITS,
    },
    counters: {
      toolIterations: record.tool_iterations || 0,
      replans: record.replans_count || 0,
      consecutiveFailures: record.status === 'FAILED' ? 1 : 0,
      totalExecutedActions: record.executed_actions_count || 0,
    },
    activeApprovalRequest: record.approval_request || null,
    lastFailure: record.failure_info || null,
    evidenceContext: {},
    transitionHistory: record.transition_history || [],
    workingMemory: record.working_memory || {},
    updatedAt: record.updated_at,
  };
}

/**
 * Loads an existing Agent Run from the database by runId, enforcing RLS.
 */
export async function loadAgentRunFromDb(
  supabase: SupabaseClient,
  runId: string
): Promise<{
  success: boolean;
  state?: AgentRunState;
  status?: AgentRunStatus;
  record?: AgentRunDbRecord;
  error?: { code: string; message: string };
}> {
  try {
    if (!runId || runId.trim() === '') {
      return {
        success: false,
        error: {
          code: 'ERR_INVALID_RUN_ID',
          message: 'runId cannot be empty.',
        },
      };
    }

    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId.trim())
      .single();

    if (error || !data) {
      return {
        success: false,
        error: {
          code: 'ERR_RUN_NOT_FOUND',
          message: error ? error.message : `Agent run with ID '${runId}' not found or access denied.`,
        },
      };
    }

    const record = data as AgentRunDbRecord;
    const state = deserializeDbRecordToAgentRun(record);

    return {
      success: true,
      state,
      status: record.status,
      record,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: 'ERR_LOAD_EXCEPTION',
        message,
      },
    };
  }
}

/**
 * Lists agent runs for the currently authenticated user.
 */
export async function listUserAgentRunsFromDb(
  supabase: SupabaseClient,
  limit: number = 20
): Promise<{
  success: boolean;
  data?: AgentRunDbRecord[];
  error?: { code: string; message: string };
}> {
  try {
    const { data, error } = await supabase
      .from('agent_runs')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return {
        success: false,
        error: {
          code: 'ERR_LIST_RUNS_ERROR',
          message: error.message,
        },
      };
    }

    return {
      success: true,
      data: (data as AgentRunDbRecord[]) || [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: {
        code: 'ERR_LIST_EXCEPTION',
        message,
      },
    };
  }
}
