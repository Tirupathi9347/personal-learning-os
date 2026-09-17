'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { parseNaturalLanguageUpdate } from '@/lib/ai/gemini';
import { ActionHistoryItem, PendingAiAction, ProposedChangesPayload } from '@/types';
import { revalidatePath } from 'next/cache';

/**
 * Step 1: Send user prompt to Gemini parser and queue in pending_ai_actions.
 */
export async function submitNaturalLanguagePrompt(
  rawPrompt: string
): Promise<{ success: boolean; data?: PendingAiAction; error?: string }> {
  try {
    if (!rawPrompt || rawPrompt.trim() === '') {
      return { success: false, error: 'Prompt cannot be empty.' };
    }

    const supabase = createServiceRoleClient();
    
    // Fetch active tasks and projects for AI context
    const [{ data: activeTasks }, { data: activeProjects }] = await Promise.all([
      supabase.from('tasks').select('id, title, status').eq('status', 'todo'),
      supabase.from('projects').select('id, title').eq('status', 'active'),
    ]);

    const taskContext = activeTasks && activeTasks.length > 0
      ? `Active Tasks: ${activeTasks.map((t: any) => `[ID: ${t.id}] ${t.title}`).join('; ')}`
      : 'No active tasks.';

    const projectContext = activeProjects && activeProjects.length > 0
      ? `Active Projects: ${activeProjects.map((p: any) => `[ID: ${p.id}] ${p.title}`).join('; ')}`
      : 'No active projects.';

    const contextSummary = `${taskContext}\n${projectContext}`;

    // Call Gemini Parser (Key decrypted server-side)
    const { payload } = await parseNaturalLanguageUpdate(rawPrompt, contextSummary);

    // Save as pending AI action
    const { data: pendingAction, error } = await supabase
      .from('pending_ai_actions')
      .insert({
        raw_prompt: rawPrompt,
        proposed_changes: payload,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: pendingAction as PendingAiAction };
  } catch (err: any) {
    return { success: false, error: err.message || 'AI Parsing failed.' };
  }
}

/**
 * Step 2: Apply approved changes to database & record inverse payload for undo support.
 */
export async function applyPendingAction(
  actionId: string,
  editedPayload?: ProposedChangesPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();

    // Fetch the pending record
    const { data: pendingRecord, error: fetchErr } = await supabase
      .from('pending_ai_actions')
      .select('*')
      .eq('id', actionId)
      .single();

    if (fetchErr || !pendingRecord) {
      return { success: false, error: 'Pending action record not found.' };
    }

    const payloadToApply: ProposedChangesPayload = editedPayload || pendingRecord.proposed_changes;

    const inverseChanges: any[] = [];
    const executionLogs: string[] = [];

    // Process each change item
    for (const item of payloadToApply.changes) {
      if (item.action === 'task.create') {
        const { data: createdTask, error } = await supabase
          .from('tasks')
          .insert({
            title: item.data.title || 'Untitled Task',
            description: item.data.description || null,
            priority: item.data.priority || 'medium',
            due_date: item.data.due_date || null,
            project_id: item.data.project_id || null,
            status: 'todo',
          })
          .select()
          .single();

        if (!error && createdTask) {
          executionLogs.push(`Created task: ${createdTask.title}`);
          inverseChanges.push({
            action: 'task.delete',
            target_id: createdTask.id,
          });
        }
      } else if (item.action === 'task.complete') {
        let taskId = item.target_id;
        let prevStatus = 'todo';

        if (!taskId && item.data?.title) {
          const { data: matchedTask } = await supabase
            .from('tasks')
            .select('id, status')
            .ilike('title', `%${item.data.title}%`)
            .limit(1)
            .maybeSingle();

          if (matchedTask) {
            taskId = matchedTask.id;
            prevStatus = matchedTask.status;
          }
        }

        if (taskId) {
          await supabase
            .from('tasks')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', taskId);

          executionLogs.push(`Marked task completed: ${item.data?.title || taskId}`);
          inverseChanges.push({
            action: 'task.update_status',
            target_id: taskId,
            previous_status: prevStatus,
          });
        }
      } else if (item.action === 'journal.create' || item.action === 'journal.update') {
        const targetDate = item.data.entry_date || new Date().toISOString().split('T')[0];

        const { data: existingJournal } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('entry_date', targetDate)
          .maybeSingle();

        const { error } = await supabase
          .from('journal_entries')
          .upsert(
            {
              entry_date: targetDate,
              raw_content: item.data.raw_content || pendingRecord.raw_prompt,
              learning_summary: item.data.learning_summary || null,
              reflection: item.data.reflection || null,
              tomorrow_plan: item.data.tomorrow_plan || null,
              time_spent_minutes: item.data.time_spent_minutes || 0,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'entry_date' }
          );

        if (!error) {
          executionLogs.push(`Updated daily journal for ${targetDate}`);
          inverseChanges.push({
            action: 'journal.restore',
            entry_date: targetDate,
            previous_data: existingJournal || null,
          });
        }
      } else if (item.action === 'note.create') {
        const { data: createdNote, error } = await supabase
          .from('notes')
          .insert({
            title: item.data.title || 'Untitled Note',
            content: item.data.content || '',
            category: item.data.category || 'General',
            tags: item.data.tags || [],
            project_id: item.data.project_id || null,
          })
          .select()
          .single();

        if (!error && createdNote) {
          executionLogs.push(`Created note: ${createdNote.title}`);
          inverseChanges.push({
            action: 'note.delete',
            target_id: createdNote.id,
          });
        }
      } else if (item.action === 'project.create') {
        const title = item.data.title || 'Untitled Project';
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

        const { data: createdProject, error } = await supabase
          .from('projects')
          .insert({
            title,
            slug: slug || `project-${Date.now()}`,
            description: item.data.description || null,
            status: item.data.status || 'active',
            github_repo_url: item.data.github_repo_url || null,
          })
          .select()
          .single();

        if (!error && createdProject) {
          executionLogs.push(`Created project: ${createdProject.title}`);
          inverseChanges.push({
            action: 'project.delete',
            target_id: createdProject.id,
          });
        }
      } else if (item.action === 'skill.create') {
        const { data: createdSkill, error } = await supabase
          .from('skills')
          .insert({
            name: item.data.name || 'New Skill',
            category: item.data.category || 'General',
            proficiency_level: item.data.proficiency_level || 1,
            target_level: item.data.target_level || 5,
          })
          .select()
          .single();

        if (!error && createdSkill) {
          executionLogs.push(`Created skill: ${createdSkill.name}`);
          inverseChanges.push({
            action: 'skill.delete',
            target_id: createdSkill.id,
          });
        }
      }
    }

    // Record action history with inverse payload
    await supabase.from('action_history').insert({
      action_type: 'ai_confirmation_apply',
      description: payloadToApply.summary || pendingRecord.raw_prompt,
      payload: payloadToApply,
      inverse_payload: { inverseChanges },
      status: 'applied',
    });

    // Update pending action status to approved
    await supabase
      .from('pending_ai_actions')
      .update({
        status: 'approved',
        proposed_changes: payloadToApply,
        updated_at: new Date().toISOString(),
      })
      .eq('id', actionId);

    revalidatePath('/tasks');
    revalidatePath('/journal');
    revalidatePath('/notes');
    revalidatePath('/projects');
    revalidatePath('/skills');
    revalidatePath('/history');
    revalidatePath('/');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to apply changes.' };
  }
}

/**
 * Reject pending action.
 */
export async function rejectPendingAction(actionId: string): Promise<{ success: boolean }> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from('pending_ai_actions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', actionId);

    revalidatePath('/');
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

/**
 * Fetch Action History items for Reversal/Undo interface.
 */
export async function getActionHistory(): Promise<ActionHistoryItem[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('action_history')
      .select('*')
      .order('executed_at', { ascending: false });

    return (data as ActionHistoryItem[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Undo / Reverse a previously applied action using inverse_payload.
 */
export async function undoActionHistory(historyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data: item, error: fetchErr } = await supabase
      .from('action_history')
      .select('*')
      .eq('id', historyId)
      .single();

    if (fetchErr || !item || item.status === 'undone') {
      return { success: false, error: 'Action history record invalid or already undone.' };
    }

    const inverseChanges = item.inverse_payload?.inverseChanges || [];

    for (const inv of inverseChanges) {
      if (inv.action === 'task.delete' && inv.target_id) {
        await supabase.from('tasks').delete().eq('id', inv.target_id);
      } else if (inv.action === 'note.delete' && inv.target_id) {
        await supabase.from('notes').delete().eq('id', inv.target_id);
      } else if (inv.action === 'project.delete' && inv.target_id) {
        await supabase.from('projects').delete().eq('id', inv.target_id);
      } else if (inv.action === 'skill.delete' && inv.target_id) {
        await supabase.from('skills').delete().eq('id', inv.target_id);
      } else if (inv.action === 'task.update_status' && inv.target_id) {
        await supabase
          .from('tasks')
          .update({ status: inv.previous_status || 'todo' })
          .eq('id', inv.target_id);
      } else if (inv.action === 'journal.restore' && inv.entry_date) {
        if (inv.previous_data) {
          await supabase.from('journal_entries').upsert(inv.previous_data);
        } else {
          await supabase.from('journal_entries').delete().eq('entry_date', inv.entry_date);
        }
      }
    }

    await supabase
      .from('action_history')
      .update({ status: 'undone' })
      .eq('id', historyId);

    revalidatePath('/tasks');
    revalidatePath('/journal');
    revalidatePath('/notes');
    revalidatePath('/projects');
    revalidatePath('/skills');
    revalidatePath('/history');
    revalidatePath('/');

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to undo action.' };
  }
}
