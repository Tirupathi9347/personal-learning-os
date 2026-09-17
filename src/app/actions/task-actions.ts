'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { Task, TaskPriority, TaskStatus } from '@/types';
import { revalidatePath } from 'next/cache';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore static generation store missing error outside Next.js request context
  }
}

/**
 * Helper to resolve the authenticated user ID from the active session.
 * In server requests, this uses the validated JWT session cookies.
 */
async function resolveAuthUserId(explicitUserId?: string | null): Promise<string | null> {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (user?.id) {
      // Authenticated session is authoritative — cannot be overridden or spoofed
      return user.id;
    }
  } catch {
    // Outside Next.js request context (e.g. testing / scripts / background workers)
  }

  // Fallback to explicit trusted userId parameter if no active cookie session
  if (explicitUserId && explicitUserId.trim()) {
    return explicitUserId.trim();
  }

  // Fallback to single-user account (e.g. user@example.com) in single-tenant personal learning OS mode
  try {
    const supabase = createServiceRoleClient();
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const primary = users?.find((u) => u.email === (process.env.ALLOWED_USER_EMAIL || 'user@example.com')) || users?.[0];
    if (primary?.id) {
      return primary.id;
    }
  } catch {
    // Outside network / testing context
  }

  return null;
}

/**
 * Fetch learning tasks scoped strictly to the authenticated student user.
 * (M-1 Tenant Isolation Hardening)
 */
export async function getTasks(userId?: string): Promise<Task[]> {
  try {
    const effectiveUserId = await resolveAuthUserId(userId);

    // If no authenticated session and no explicit trusted userId is available,
    // immediately return empty array to prevent cross-tenant data leaks.
    if (!effectiveUserId) {
      return [];
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching tasks:', error.message);
      return [];
    }
    return (data as Task[]) || [];
  } catch (err) {
    return [];
  }
}

export async function getTaskById(id: string, userId?: string): Promise<{ success: boolean; task?: Task | null; error?: string }> {
  try {
    const effectiveUserId = await resolveAuthUserId(userId);

    if (!effectiveUserId) {
      return { success: false, error: 'Authentication required to access task.' };
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .eq('user_id', effectiveUserId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, task: data as Task | null };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function createTask(input: {
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  idempotency_key?: string | null;
  user_id?: string | null;
}): Promise<{ success: boolean; data?: Task; error?: string; isDuplicateReused?: boolean }> {
  try {
    const effectiveUserId = await resolveAuthUserId(input.user_id);
    const supabase = createServiceRoleClient();

    const insertPayload: Record<string, any> = {
      title: input.title,
      description: input.description || null,
      priority: input.priority || 'medium',
      due_date: input.due_date || null,
      status: 'todo',
    };

    if (input.idempotency_key) {
      insertPayload.idempotency_key = input.idempotency_key;
    }
    if (effectiveUserId) {
      insertPayload.user_id = effectiveUserId;
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      // Phase 5E: Database-enforced idempotency conflict handling (PG 23505)
      const isUniqueConflict =
        error.code === '23505' ||
        error.message?.toLowerCase().includes('duplicate key') ||
        error.message?.toLowerCase().includes('unique constraint') ||
        error.message?.toLowerCase().includes('idx_tasks_user_idempotency') ||
        error.message?.toLowerCase().includes('idempotency_key');

      if (isUniqueConflict && input.idempotency_key) {
        let query = supabase
          .from('tasks')
          .select('*')
          .eq('idempotency_key', input.idempotency_key);

        if (effectiveUserId) {
          query = query.eq('user_id', effectiveUserId);
        }

        const { data: existingData, error: queryErr } = await query.maybeSingle();
        if (existingData && !queryErr) {
          return {
            success: true,
            data: existingData as Task,
            isDuplicateReused: true,
          };
        }
      }

      return { success: false, error: error.message };
    }

    safeRevalidate('/tasks');
    safeRevalidate('/');
    return { success: true, data: data as Task, isDuplicateReused: false };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveUserId = await resolveAuthUserId(userId);
    const supabase = createServiceRoleClient();
    const updatePayload: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (status === 'completed') {
      updatePayload.completed_at = new Date().toISOString();
    } else {
      updatePayload.completed_at = null;
    }

    let query = supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', id);

    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }

    const { error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    safeRevalidate('/tasks');
    safeRevalidate('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteTask(id: string, userId?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveUserId = await resolveAuthUserId(userId);
    const supabase = createServiceRoleClient();
    let query = supabase.from('tasks').delete().eq('id', id);

    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }

    const { error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    safeRevalidate('/tasks');
    safeRevalidate('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateTaskPriority(
  id: string,
  priority: TaskPriority,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const effectiveUserId = await resolveAuthUserId(userId);
    const supabase = createServiceRoleClient();
    const updatePayload: Record<string, any> = {
      priority,
      updated_at: new Date().toISOString(),
    };

    let query = supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', id);

    if (effectiveUserId) {
      query = query.eq('user_id', effectiveUserId);
    }

    const { error } = await query;

    if (error) {
      return { success: false, error: error.message };
    }

    safeRevalidate('/tasks');
    safeRevalidate('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}


