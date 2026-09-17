'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { Mistake, MistakeCategory, MistakeSeverity } from '@/types';
import { revalidatePath } from 'next/cache';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore static generation store missing error outside Next.js context
  }
}

/**
 * Fetch all logged mistakes.
 */
export async function getMistakes(): Promise<Mistake[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('mistakes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.message.includes('Could not find the table')) {
        console.warn('mistakes table not yet created in Supabase SQL Editor.');
      } else {
        console.error('Error fetching mistakes:', error.message);
      }
      return [];
    }
    return (data as Mistake[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Create a new Mistake log entry.
 */
export async function createMistake(input: {
  title: string;
  category: MistakeCategory;
  root_cause: string;
  solution: string;
  prevention_rule?: string | null;
  severity?: MistakeSeverity;
  skill_id?: string | null;
}): Promise<{ success: boolean; data?: Mistake; error?: string }> {
  try {
    if (!input.title || !input.title.trim()) {
      return { success: false, error: 'Mistake title cannot be empty.' };
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('mistakes')
      .insert({
        title: input.title.trim(),
        category: input.category || 'Syntax/Logic',
        root_cause: input.root_cause || 'Undetermined root cause.',
        solution: input.solution || 'Manual resolution.',
        prevention_rule: input.prevention_rule || null,
        severity: input.severity || 'medium',
        skill_id: input.skill_id || null,
      })
      .select()
      .single();

    if (error) {
      if (error.message.includes('Could not find the table')) {
        return {
          success: false,
          error: "Table 'mistakes' does not exist in Supabase yet. Please run the SQL snippet in your Supabase SQL Editor.",
        };
      }
      return { success: false, error: error.message };
    }

    const mistake = data as Mistake;

    // Auto-link evidence to connected Skill if selected
    if (input.skill_id) {
      await supabase.from('evidence_links').insert({
        source_type: 'mistake',
        source_id: mistake.id,
        target_type: 'skill',
        target_id: input.skill_id,
        weight: 1.0,
      });
    }

    safeRevalidate('/mistakes');
    safeRevalidate('/skills');
    safeRevalidate('/');

    return { success: true, data: mistake };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create mistake entry.' };
  }
}

/**
 * Delete a mistake by ID.
 */
export async function deleteMistake(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('mistakes').delete().eq('id', id);
    if (error) return { success: false, error: error.message };

    safeRevalidate('/mistakes');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
