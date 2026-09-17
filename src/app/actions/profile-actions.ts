'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { StudentProfile } from '@/types';
import { revalidatePath } from 'next/cache';

/**
 * Fetch the active Student Profile (Single Source of Truth for Opportunity Intelligence).
 * Connects dynamically to existing Learning OS skills and projects.
 */
export async function getStudentProfile(): Promise<StudentProfile | null> {
  try {
    const supabase = createServiceRoleClient();
    let userId: string | null = null;

    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user?.id) userId = user.id;
    } catch (e) {}

    let query = supabase.from('student_profiles').select('*');
    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: profiles, error } = await query.limit(1);

    if (error) {
      console.error('Error fetching student profile:', error.message);
    }

    let existingProfile: StudentProfile | null = profiles && profiles.length > 0 ? (profiles[0] as StudentProfile) : null;

    // Dynamically aggregate skills & project tech from existing Learning OS modules if unpopulated
    let aggregatedSkills: string[] = existingProfile?.skills || [];
    let aggregatedProjects: string[] = existingProfile?.relevant_project_technologies || [];

    if (aggregatedSkills.length === 0) {
      try {
        const { data: skillRows } = await supabase.from('skills').select('name');
        if (skillRows && skillRows.length > 0) {
          aggregatedSkills = Array.from(new Set(skillRows.map((s) => s.name).filter(Boolean)));
        }
      } catch (e) {}
    }

    if (aggregatedProjects.length === 0) {
      try {
        const { data: projectRows } = await supabase.from('projects').select('title');
        if (projectRows && projectRows.length > 0) {
          aggregatedProjects = Array.from(new Set(projectRows.map((p) => p.title).filter(Boolean)));
        }
      } catch (e) {}
    }

    if (!existingProfile) {
      return {
        id: 'draft',
        user_id: userId,
        full_name: null,
        college: null,
        branch: null,
        degree: null,
        current_year: null,
        graduation_year: null,
        skills: aggregatedSkills,
        skill_proficiencies: {},
        relevant_project_technologies: aggregatedProjects,
        career_target_roles: [],
        interests: [],
        learning_goals: [],
        preferred_opportunity_types: [],
        preferred_locations: [],
        preferred_work_modes: [],
        min_stipend: null,
        expected_salary: null,
        availability_status: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    return {
      ...existingProfile,
      skills: existingProfile.skills && existingProfile.skills.length > 0 ? existingProfile.skills : aggregatedSkills,
      relevant_project_technologies:
        existingProfile.relevant_project_technologies && existingProfile.relevant_project_technologies.length > 0
          ? existingProfile.relevant_project_technologies
          : aggregatedProjects,
    };
  } catch (err: any) {
    console.error('Failed to get student profile:', err.message);
    return null;
  }
}

/**
 * Save or update Student Profile record.
 */
export async function updateStudentProfile(
  payload: Partial<StudentProfile>
): Promise<{ success: boolean; data?: StudentProfile; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    let userId = payload.user_id;

    if (!userId) {
      try {
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user?.id) userId = user.id;
      } catch (e) {}
    }

    const upsertPayload = {
      user_id: userId || null,
      full_name: payload.full_name?.trim() || null,
      college: payload.college?.trim() || null,
      branch: payload.branch?.trim() || null,
      degree: payload.degree?.trim() || null,
      current_year: payload.current_year?.trim() || null,
      graduation_year: payload.graduation_year || null,
      skills: payload.skills || [],
      skill_proficiencies: payload.skill_proficiencies || {},
      relevant_project_technologies: payload.relevant_project_technologies || [],
      career_target_roles: payload.career_target_roles || [],
      interests: payload.interests || [],
      learning_goals: payload.learning_goals || [],
      preferred_opportunity_types: payload.preferred_opportunity_types || [],
      preferred_locations: payload.preferred_locations || [],
      preferred_work_modes: payload.preferred_work_modes || [],
      min_stipend: payload.min_stipend?.trim() || null,
      expected_salary: payload.expected_salary?.trim() || null,
      availability_status: payload.availability_status?.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('student_profiles')
      .upsert(upsertPayload, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving student profile:', error.message);
      return { success: false, error: error.message };
    }

    revalidatePath('/profile');
    revalidatePath('/opportunities');
    revalidatePath('/');

    return { success: true, data: data as StudentProfile };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update student profile.' };
  }
}
