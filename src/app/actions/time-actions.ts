'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { TimeSession, TimeSessionCategory } from '@/types';
import { revalidatePath } from 'next/cache';
import { getTodayJournal, saveJournalEntry } from '@/app/actions/journal-actions';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore static generation store missing error outside Next.js context
  }
}

/**
 * Fetch all logged time sessions.
 */
export async function getTimeSessions(): Promise<TimeSession[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('time_sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('Could not find the table')) {
        console.warn('time_sessions table not yet created in Supabase SQL Editor.');
      } else {
        console.error('Error fetching time sessions:', error.message);
      }
      return [];
    }
    return (data as TimeSession[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Create a new focus session or manual time entry.
 * Auto-accumulates time into today's Daily Journal entry!
 */
export async function createTimeSession(input: {
  category: TimeSessionCategory;
  duration_minutes: number;
  description?: string | null;
  session_date?: string;
  task_id?: string | null;
  project_id?: string | null;
  skill_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
}): Promise<{ success: boolean; data?: TimeSession; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const targetDate = input.session_date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('time_sessions')
      .insert({
        category: input.category,
        duration_minutes: Math.max(1, input.duration_minutes),
        description: input.description || null,
        session_date: targetDate,
        task_id: input.task_id || null,
        project_id: input.project_id || null,
        skill_id: input.skill_id || null,
        started_at: input.started_at || null,
        ended_at: input.ended_at || null,
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('Could not find the table')) {
        return {
          success: false,
          error: "Table 'time_sessions' does not exist in Supabase yet. Please run the SQL snippet in your Supabase SQL Editor.",
        };
      }
      return { success: false, error: error.message };
    }

    const session = data as TimeSession;

    // Auto-link session as Universal Evidence to Skill or Project if selected
    if (input.skill_id) {
      await supabase.from('evidence_links').insert({
        source_type: 'time_session',
        source_id: session.id,
        target_type: 'skill',
        target_id: input.skill_id,
        weight: 1.0,
      });
    }

    if (input.project_id) {
      await supabase.from('evidence_links').insert({
        source_type: 'time_session',
        source_id: session.id,
        target_type: 'project',
        target_id: input.project_id,
        weight: 1.0,
      });
    }

    // Auto-update time_spent_minutes in today's Daily Journal
    const todayJournal = await getTodayJournal();
    const currentJournalMins = todayJournal?.time_spent_minutes || 0;
    const newJournalMins = currentJournalMins + session.duration_minutes;
    const currentRaw = todayJournal?.raw_content || `Logged activities for ${targetDate}.`;

    await saveJournalEntry({
      entry_date: targetDate,
      raw_content: currentRaw,
      learning_summary: todayJournal?.learning_summary || null,
      reflection: todayJournal?.reflection || null,
      tomorrow_plan: todayJournal?.tomorrow_plan || null,
      time_spent_minutes: newJournalMins,
    });

    safeRevalidate('/time');
    safeRevalidate('/journal');
    safeRevalidate('/skills');
    safeRevalidate('/projects');
    safeRevalidate('/');

    return { success: true, data: session };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create time session.' };
  }
}

/**
 * Calculate Daily, Weekly, and Category Time Totals.
 */
export async function getTimeTotals(): Promise<{
  todayMinutes: number;
  weeklyMinutes: number;
  categoryTotals: Record<TimeSessionCategory, number>;
}> {
  try {
    const sessions = await getTimeSessions();
    const todayStr = new Date().toISOString().split('T')[0];

    // Compute start of week (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let todayMinutes = 0;
    let weeklyMinutes = 0;
    const categoryTotals: Record<TimeSessionCategory, number> = {
      Learning: 0,
      Coding: 0,
      Project: 0,
      Research: 0,
      Course: 0,
      Practice: 0,
    };

    for (const s of sessions) {
      if (s.session_date === todayStr) {
        todayMinutes += s.duration_minutes;
      }

      const sessionDateObj = new Date(s.session_date);
      if (sessionDateObj >= sevenDaysAgo) {
        weeklyMinutes += s.duration_minutes;
      }

      if (categoryTotals[s.category] !== undefined) {
        categoryTotals[s.category] += s.duration_minutes;
      }
    }

    return {
      todayMinutes,
      weeklyMinutes,
      categoryTotals,
    };
  } catch (err) {
    return {
      todayMinutes: 0,
      weeklyMinutes: 0,
      categoryTotals: {
        Learning: 0,
        Coding: 0,
        Project: 0,
        Research: 0,
        Course: 0,
        Practice: 0,
      },
    };
  }
}

/**
 * Delete a time session.
 */
export async function deleteTimeSession(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('time_sessions').delete().eq('id', id);
    if (error) return { success: false, error: error.message };

    safeRevalidate('/time');
    safeRevalidate('/journal');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
