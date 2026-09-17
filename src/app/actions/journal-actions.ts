'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { JournalEntry } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getJournalEntries(): Promise<JournalEntry[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('journal_entries')
      .select('*')
      .order('entry_date', { ascending: false });

    if (error) {
      console.error('Error fetching journal entries:', error.message);
      return [];
    }
    return data as JournalEntry[];
  } catch (err) {
    return [];
  }
}

export async function getTodayJournal(): Promise<JournalEntry | null> {
  try {
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('entry_date', today)
      .maybeSingle();

    return data as JournalEntry | null;
  } catch (err) {
    return null;
  }
}

export async function saveJournalEntry(input: {
  raw_content: string;
  summary?: string | null;
  learning_summary?: string | null;
  reflection?: string | null;
  tomorrow_plan?: string | null;
  time_spent_minutes?: number;
  entry_date?: string;
}): Promise<{ success: boolean; data?: JournalEntry; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const targetDate = input.entry_date || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('journal_entries')
      .upsert(
        {
          entry_date: targetDate,
          raw_content: input.raw_content,
          summary: input.summary || null,
          learning_summary: input.learning_summary || null,
          reflection: input.reflection || null,
          tomorrow_plan: input.tomorrow_plan || null,
          time_spent_minutes: input.time_spent_minutes || 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'entry_date' }
      )
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    try { revalidatePath('/journal'); } catch {}
    try { revalidatePath('/'); } catch {}
    return { success: true, data: data as JournalEntry };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Import today's synced GitHub commits into Daily Journal.
 */
export async function importTodayCommitsToJournal(
  entryDate?: string
): Promise<{ success: boolean; importedCount: number; message: string }> {
  try {
    const supabase = createServiceRoleClient();
    const targetDate = entryDate || new Date().toISOString().split('T')[0];

    const { data: logs } = await supabase
      .from('github_activity_logs')
      .select('*')
      .order('occurred_at', { ascending: false });

    if (!logs || logs.length === 0) {
      return { success: false, importedCount: 0, message: 'No synced GitHub activity logs found to import.' };
    }

    const dateLogs = logs.filter((log) => {
      const logDate = new Date(log.occurred_at).toISOString().split('T')[0];
      return logDate === targetDate;
    });

    const targetLogs = dateLogs.length > 0 ? dateLogs : logs.slice(0, 5);

    const commitBullets = targetLogs
      .map((l) => `- [GitHub] ${l.event_type} on \`${l.repo_name}\`: ${l.message || 'Updated code'}`)
      .join('\n');

    const formattedHeader = `\n\n### 🐙 Synced GitHub Activity (${targetDate})\n${commitBullets}`;

    const existing = await getTodayJournal();
    const currentRaw = existing?.raw_content || `Logged activities for ${targetDate}.`;
    const currentLearning = existing?.learning_summary || '';

    const newRaw = currentRaw.includes('Synced GitHub Activity')
      ? currentRaw
      : `${currentRaw}${formattedHeader}`;

    const newLearning = currentLearning.includes('Synced GitHub Activity')
      ? currentLearning
      : `${currentLearning}\n- Synced ${targetLogs.length} GitHub commit events.`;

    const res = await saveJournalEntry({
      entry_date: targetDate,
      raw_content: newRaw,
      learning_summary: newLearning,
      summary: existing?.summary || 'Daily learning log',
      reflection: existing?.reflection || null,
      tomorrow_plan: existing?.tomorrow_plan || null,
      time_spent_minutes: existing?.time_spent_minutes || 30,
    });

    if (!res.success) {
      return { success: false, importedCount: 0, message: res.error || 'Failed to save journal entry.' };
    }

    try { revalidatePath('/journal'); } catch {}
    return {
      success: true,
      importedCount: targetLogs.length,
      message: `Successfully imported ${targetLogs.length} GitHub commit logs into your daily journal!`,
    };
  } catch (err: any) {
    return { success: false, importedCount: 0, message: err.message || 'Failed to import commits.' };
  }
}

/**
 * Import today's solved LeetCode problems into Daily Journal.
 */
export async function importTodayLeetCodeToJournal(
  entryDate?: string
): Promise<{ success: boolean; importedCount: number; message: string }> {
  try {
    const supabase = createServiceRoleClient();
    const targetDate = entryDate || new Date().toISOString().split('T')[0];

    const { data: subs } = await supabase
      .from('leetcode_submissions_log')
      .select('*')
      .order('timestamp', { ascending: false });

    if (!subs || subs.length === 0) {
      return { success: false, importedCount: 0, message: 'No synced LeetCode submissions found to import.' };
    }

    const dateSubs = subs.filter((sub) => {
      const subDate = new Date(sub.timestamp).toISOString().split('T')[0];
      return subDate === targetDate;
    });

    const targetSubs = dateSubs.length > 0 ? dateSubs : subs.slice(0, 5);

    const problemBullets = targetSubs
      .map((s) => `- [LeetCode] Solved: **${s.title}** (${s.difficulty}) - [Link](https://leetcode.com/problems/${s.title_slug})`)
      .join('\n');

    const formattedHeader = `\n\n### 🧩 Synced LeetCode Submissions (${targetDate})\n${problemBullets}`;

    const existing = await getTodayJournal();
    const currentRaw = existing?.raw_content || `Logged activities for ${targetDate}.`;
    const currentLearning = existing?.learning_summary || '';

    const newRaw = currentRaw.includes('Synced LeetCode Submissions')
      ? currentRaw
      : `${currentRaw}${formattedHeader}`;

    const newLearning = currentLearning.includes('Synced LeetCode Submissions')
      ? currentLearning
      : `${currentLearning}\n- Solved ${targetSubs.length} LeetCode problems.`;

    const res = await saveJournalEntry({
      entry_date: targetDate,
      raw_content: newRaw,
      learning_summary: newLearning,
      summary: existing?.summary || 'Daily learning log',
      reflection: existing?.reflection || null,
      tomorrow_plan: existing?.tomorrow_plan || null,
      time_spent_minutes: existing?.time_spent_minutes || 30,
    });

    if (!res.success) {
      return { success: false, importedCount: 0, message: res.error || 'Failed to save journal entry.' };
    }

    try { revalidatePath('/journal'); } catch {}
    return {
      success: true,
      importedCount: targetSubs.length,
      message: `Successfully imported ${targetSubs.length} LeetCode solved problems into your daily journal!`,
    };
  } catch (err: any) {
    return { success: false, importedCount: 0, message: err.message || 'Failed to import LeetCode activity.' };
  }
}
