'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { Note } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getNotes(query?: string, category?: string): Promise<Note[]> {
  try {
    const supabase = createServiceRoleClient();
    let builder = supabase.from('notes').select('*').order('updated_at', { ascending: false });

    if (category) {
      builder = builder.eq('category', category);
    }

    if (query && query.trim()) {
      const clean = query.trim();
      builder = builder.or(`title.ilike.%${clean}%,content.ilike.%${clean}%`);
    }

    const { data, error } = await builder;

    if (error) {
      console.error('Error fetching notes:', error.message);
      return [];
    }
    return (data as Note[]) || [];
  } catch (err) {
    return [];
  }
}

export async function createNote(input: {
  title: string;
  content: string;
  category?: string | null;
  tags?: string[] | null;
  project_id?: string | null;
}): Promise<{ success: boolean; data?: Note; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('notes')
      .insert({
        title: input.title,
        content: input.content,
        category: input.category || 'General',
        tags: input.tags || [],
        project_id: input.project_id || null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/notes');
    revalidatePath('/');
    return { success: true, data: data as Note };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteNote(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('notes').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/notes');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
