'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { EvidenceGraphItem, EvidenceLink } from '@/types';
import { revalidatePath } from 'next/cache';

/**
 * Link an evidence item (journal, note, or task) to a target claim (skill or project).
 */
export async function linkEvidence(
  sourceType: 'journal' | 'note' | 'task',
  sourceId: string,
  targetType: 'skill' | 'project' | 'topic',
  targetId: string,
  weight: number = 1.0
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('evidence_links').insert({
      source_type: sourceType,
      source_id: sourceId,
      target_type: targetType,
      target_id: targetId,
      weight,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/skills');
    revalidatePath('/projects');
    revalidatePath('/evidence');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetch full evidence graph items supporting a skill or project.
 */
export async function getEvidenceGraph(
  targetType: 'skill' | 'project' | 'topic',
  targetId: string
): Promise<EvidenceGraphItem[]> {
  try {
    const supabase = createServiceRoleClient();

    // 1. Fetch evidence links matching target
    const { data: links, error: linkErr } = await supabase
      .from('evidence_links')
      .select('*')
      .eq('target_type', targetType)
      .eq('target_id', targetId);

    if (linkErr || !links || links.length === 0) {
      return [];
    }

    const items: EvidenceGraphItem[] = [];

    for (const link of links as EvidenceLink[]) {
      if (link.source_type === 'task') {
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, status, due_date')
          .eq('id', link.source_id)
          .maybeSingle();

        if (task) {
          items.push({
            id: task.id,
            type: 'task',
            title: task.title,
            summary: `Task Status: ${task.status}`,
            date: task.due_date || undefined,
            weight: link.weight,
          });
        }
      } else if (link.source_type === 'note') {
        const { data: note } = await supabase
          .from('notes')
          .select('id, title, category, created_at')
          .eq('id', link.source_id)
          .maybeSingle();

        if (note) {
          items.push({
            id: note.id,
            type: 'note',
            title: note.title,
            summary: `Note Category: ${note.category || 'General'}`,
            date: note.created_at.split('T')[0],
            weight: link.weight,
          });
        }
      } else if (link.source_type === 'journal') {
        const { data: journal } = await supabase
          .from('journal_entries')
          .select('id, entry_date, raw_content')
          .eq('id', link.source_id)
          .maybeSingle();

        if (journal) {
          items.push({
            id: journal.id,
            type: 'journal',
            title: `Journal Log (${journal.entry_date})`,
            summary: journal.raw_content.slice(0, 100),
            date: journal.entry_date,
            weight: link.weight,
          });
        }
      }
    }

    return items;
  } catch (err) {
    return [];
  }
}
