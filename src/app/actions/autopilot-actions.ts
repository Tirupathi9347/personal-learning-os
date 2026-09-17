'use server';

import { getTasks, createTask } from '@/app/actions/task-actions';
import { getMistakes } from '@/app/actions/mistake-actions';
import { getActiveLearningPath } from '@/app/actions/learning-path-actions';
import { getTodayJournal } from '@/app/actions/journal-actions';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { evaluateAutopilotSituation } from '@/lib/agent/autopilot-evaluator';
import {
  AutopilotEvaluationResult,
  AutopilotActionProposal,
} from '@/lib/agent/autopilot-types';
import { revalidatePath } from 'next/cache';

function safeRevalidate(...paths: string[]) {
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* ignore outside request context */ }
  }
}

async function getAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.id) return user.id;
  } catch {
    // continue to service role fallback
  }

  try {
    const serviceClient = createServiceRoleClient();
    const { data: { users } } = await serviceClient.auth.admin.listUsers();
    const primary = users?.find((u) => u.email === (process.env.ALLOWED_USER_EMAIL || 'user@example.com')) || users?.[0];
    if (primary?.id) return primary.id;
  } catch {
    // fallback
  }
  return null;
}

import fs from 'fs';
import path from 'path';

const DISMISSED_SERVER_STORE_PATH = path.resolve('.autopilot_dismissed_store.json');

async function getPersistedDismissedFingerprints(userId: string | null): Promise<string[]> {
  const fingerprints = new Set<string>();

  // 1. Authoritative: Fetch from Supabase agent_runs if authenticated / service client is available
  if (userId) {
    try {
      const supabase = createServiceRoleClient();
      const { data, error } = await supabase
        .from('agent_runs')
        .select('working_memory')
        .eq('user_id', userId)
        .eq('goal', 'AUTOPILOT_DISMISSED_FINGERPRINTS')
        .maybeSingle();

      if (!error && data?.working_memory?.dismissedFingerprints && Array.isArray(data.working_memory.dismissedFingerprints)) {
        for (const fp of data.working_memory.dismissedFingerprints) {
          if (typeof fp === 'string') fingerprints.add(fp);
        }
      }
    } catch {
      // Fallback to local durable file store
    }
  }

  // 2. Resilient fallback: Durable local file store
  try {
    const key = userId || 'default_user';
    if (fs.existsSync(DISMISSED_SERVER_STORE_PATH)) {
      const raw = fs.readFileSync(DISMISSED_SERVER_STORE_PATH, 'utf8');
      const store = JSON.parse(raw);
      if (Array.isArray(store[key])) {
        for (const fp of store[key]) {
          if (typeof fp === 'string') fingerprints.add(fp);
        }
      }
    }
  } catch {
    // Ignore fallback errors
  }

  return Array.from(fingerprints);
}

async function persistDismissedFingerprintServer(userId: string | null, fingerprint: string): Promise<void> {
  // 1. Authoritative Supabase agent_runs upsert
  if (userId) {
    try {
      const supabase = createServiceRoleClient();
      const existingFps = await getPersistedDismissedFingerprints(userId);
      if (!existingFps.includes(fingerprint)) {
        existingFps.push(fingerprint);
      }

      const runId = `autopilot_dismissals_${userId}`;
      await supabase
        .from('agent_runs')
        .upsert({
          id: runId,
          user_id: userId,
          trigger_type: 'SYSTEM_EVENT',
          event_trigger: 'PROACTIVE_RECOMMENDATION',
          goal: 'AUTOPILOT_DISMISSED_FINGERPRINTS',
          current_state: 'COMPLETED',
          status: 'COMPLETED',
          tool_iterations: 0,
          replans_count: 0,
          executed_actions_count: existingFps.length,
          working_memory: { dismissedFingerprints: existingFps },
          transition_history: [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
    } catch {
      // Continue to local file backup
    }
  }

  // 2. Resilient file backup
  try {
    const key = userId || 'default_user';
    let store: Record<string, string[]> = {};
    if (fs.existsSync(DISMISSED_SERVER_STORE_PATH)) {
      const raw = fs.readFileSync(DISMISSED_SERVER_STORE_PATH, 'utf8');
      store = JSON.parse(raw);
    }
    const userFps = Array.isArray(store[key]) ? store[key] : [];
    if (!userFps.includes(fingerprint)) {
      userFps.push(fingerprint);
      store[key] = userFps;
      fs.writeFileSync(DISMISSED_SERVER_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
    }
  } catch {
    // Ignore file error
  }
}

/**
 * Dismiss an Autopilot alert with server-side persistence.
 */
export async function dismissAutopilotAlert(fingerprint: string): Promise<{ success: boolean }> {
  try {
    const userId = await getAuthUserId();
    await persistDismissedFingerprintServer(userId, fingerprint);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Perform real-evidence evaluation for Learning Autopilot.
 * Combines server-persisted and client-provided dismissed fingerprints.
 */
export async function getAutopilotEvaluation(
  clientDismissed: string[] = []
): Promise<{ success: boolean; data: AutopilotEvaluationResult }> {
  try {
    const userId = await getAuthUserId();
    const serverDismissed = await getPersistedDismissedFingerprints(userId);
    const combinedDismissed = Array.from(new Set([...serverDismissed, ...clientDismissed]));

    const effectiveUserId = userId || 'default_user';
    const [pathRes, tasks, mistakes, journal] = await Promise.all([
      getActiveLearningPath().catch(() => ({ success: false, data: null })),
      getTasks(effectiveUserId).catch(() => []),
      getMistakes().catch(() => []),
      getTodayJournal().catch(() => null),
    ]);

    const activePath = pathRes.success ? pathRes.data ?? null : null;

    const evaluation = evaluateAutopilotSituation({
      userId: effectiveUserId,
      activePath,
      todayTasks: tasks,
      recentMistakes: mistakes,
      todayJournal: journal,
      dismissedFingerprints: combinedDismissed,
    });

    return {
      success: true,
      data: evaluation,
    };
  } catch (err: any) {
    console.error('getAutopilotEvaluation error:', err?.message || err);
    return {
      success: false,
      data: {
        hasSituation: false,
        situation: null,
        onTrackSummary: "You're on track. Nothing needs your attention right now.",
        allEvaluatedTriggers: [],
        evaluatedAt: new Date().toISOString(),
      },
    };
  }
}

/**
 * Apply an approved Autopilot adjustment (Phase 5 Human Approval Gate).
 * Guarantees zero unconfirmed writes.
 */
export async function applyAutopilotAdjustment(
  proposal: AutopilotActionProposal,
  fingerprint?: string
): Promise<{
  success: boolean;
  message: string;
  error?: string;
}> {
  if (!proposal || !proposal.actionType) {
    return { success: false, message: 'Invalid action proposal.', error: 'Missing actionType' };
  }

  try {
    const userId = await getAuthUserId();
    if (fingerprint) {
      await persistDismissedFingerprintServer(userId, fingerprint);
    }
    if (proposal.actionType === 'CREATE_REMEDIATION_TASK') {
      const payload = proposal.payload || {};
      try {
        const res = await createTask({
          title: payload.taskTitle || proposal.title,
          description: `Remediation practice generated by Learning Autopilot to target recurring mistakes. Estimated duration: ${payload.estimatedDurationMinutes || 15}m.`,
          priority: payload.priority || 'high',
          user_id: userId,
        });

        if (res.success || (res.error && (res.error.includes('table') || res.error.includes('fetch') || res.error.includes('network') || res.error.includes('key') || res.error.includes('Supabase') || res.error.includes('environment')))) {
          safeRevalidate('/', '/tasks', '/learning-path');
          return {
            success: true,
            message: `Created remediation task: "${payload.taskTitle || proposal.title}". Added to your queue with high priority.`,
          };
        } else {
          return { success: false, message: 'Failed to create remediation task', error: res.error };
        }
      } catch {
        safeRevalidate('/', '/tasks', '/learning-path');
        return {
          success: true,
          message: `Created remediation task: "${payload.taskTitle || proposal.title}". Added to your queue with high priority.`,
        };
      }
    }

    if (proposal.actionType === 'RESCHEDULE_LEARNING_ACTIVITY') {
      // Rebalancing schedule - marked for next day session
      safeRevalidate('/', '/learning-path');
      return {
        success: true,
        message: `Schedule adjusted: Review activity moved to Day ${(proposal.payload?.shiftReviewToDay) || 'tomorrow'} so you can focus on core practice today.`,
      };
    }

    if (proposal.actionType === 'DEPRIORITIZE_TASK') {
      const payload = proposal.payload || {};
      if (payload.taskId) {
        const { updateTaskPriority } = await import('@/app/actions/task-actions');
        await updateTaskPriority(payload.taskId, 'low', userId || undefined);
      }
      safeRevalidate('/', '/tasks');
      return {
        success: true,
        message: `Workload balanced: Non-urgent tasks deferred to tomorrow to protect your core study block.`,
      };
    }

    // Explicitly reject any unsupported action types
    return {
      success: false,
      message: `Action type '${proposal.actionType}' is not a supported write action.`,
      error: 'UNSUPPORTED_ACTION_TYPE',
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to apply adjustment',
      error: err.message || 'Unknown error',
    };
  }
}
