'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { Project, ProjectStatus } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getProjects(): Promise<Project[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error.message);
      return [];
    }
    return (data as Project[]) || [];
  } catch (err) {
    return [];
  }
}

export async function createProject(input: {
  title: string;
  description?: string | null;
  status?: ProjectStatus;
  github_repo_url?: string | null;
  start_date?: string | null;
  target_end_date?: string | null;
}): Promise<{ success: boolean; data?: Project; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const slug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    const { data, error } = await supabase
      .from('projects')
      .insert({
        title: input.title,
        slug: slug || `project-${Date.now()}`,
        description: input.description || null,
        status: input.status || 'active',
        github_repo_url: input.github_repo_url || null,
        start_date: input.start_date || new Date().toISOString().split('T')[0],
        target_end_date: input.target_end_date || null,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/projects');
    revalidatePath('/');
    return { success: true, data: data as Project };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('projects')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/projects');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function deleteProject(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('projects').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/projects');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
