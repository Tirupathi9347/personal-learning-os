'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { Skill } from '@/types';
import { revalidatePath } from 'next/cache';

export async function getSkills(): Promise<Skill[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .order('proficiency_level', { ascending: false });

    if (error) {
      console.error('Error fetching skills:', error.message);
      return [];
    }
    return (data as Skill[]) || [];
  } catch (err) {
    return [];
  }
}

export async function createSkill(input: {
  name: string;
  category: string;
  proficiency_level?: number;
  target_level?: number;
}): Promise<{ success: boolean; data?: Skill; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('skills')
      .insert({
        name: input.name,
        category: input.category || 'General',
        proficiency_level: input.proficiency_level || 1,
        target_level: input.target_level || 5,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/skills');
    revalidatePath('/');
    return { success: true, data: data as Skill };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function updateSkillProficiency(
  id: string,
  proficiencyLevel: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const level = Math.max(1, Math.min(5, proficiencyLevel));
    const { error } = await supabase
      .from('skills')
      .update({ proficiency_level: level })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/skills');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
