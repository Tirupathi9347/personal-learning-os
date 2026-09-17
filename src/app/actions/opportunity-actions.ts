'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { Opportunity, OpportunityFilters, OpportunityStatus, DuplicateMatchResult, SourceHistoryItem } from '@/types';
import { findBestDuplicateMatch } from '@/lib/ai/duplicate-detector';
import { sanitizeOpportunityType, sanitizeWorkMode, sanitizeDeadline } from '@/lib/ai/opportunity-sanitizer';
import { revalidatePath } from 'next/cache';

/**
 * Fetch opportunities with optional filtering and keyword search.
 */
export async function getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
  try {
    const supabase = createServiceRoleClient();
    let query = supabase.from('opportunities').select('*').order('created_at', { ascending: false });

    if (filters?.type && filters.type !== 'ALL') {
      query = query.eq('type', filters.type);
    }

    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }

    if (filters?.work_mode && filters.work_mode !== 'ALL') {
      query = query.eq('work_mode', filters.work_mode);
    }

    if (filters?.source && filters.source !== 'ALL') {
      query = query.ilike('source', `%${filters.source}%`);
    }

    if (filters?.closingSoonOnly) {
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      query = query.gte('deadline', today).lte('deadline', nextWeek);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching opportunities:', error.message);
      return [];
    }

    let results = (data as Opportunity[]) || [];

    if (filters?.query && filters.query.trim() !== '') {
      const q = filters.query.toLowerCase().trim();
      results = results.filter(
        (o) =>
          o.title.toLowerCase().includes(q) ||
          o.organization.toLowerCase().includes(q) ||
          (o.role && o.role.toLowerCase().includes(q)) ||
          (o.skills_required && o.skills_required.some((s) => s.toLowerCase().includes(q)))
      );
    }

    return results;
  } catch (err) {
    return [];
  }
}

/**
 * Fetch single opportunity record by ID.
 */
export async function getOpportunityById(id: string): Promise<Opportunity | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.from('opportunities').select('*').eq('id', id).single();
    if (error) return null;
    return (data as Opportunity) || null;
  } catch (err) {
    return null;
  }
}

/**
 * Check if a candidate opportunity matches any existing database opportunity.
 */
export async function checkDuplicateOpportunity(candidate: Partial<Opportunity>): Promise<DuplicateMatchResult> {
  try {
    const existing = await getOpportunities();
    return findBestDuplicateMatch(candidate, existing);
  } catch (err) {
    return { matchLevel: 'NO_MATCH', matchedOpportunity: null, matchScore: 0, matchReason: 'Check failed' };
  }
}

/**
 * Merge new opportunity source data into an existing opportunity record without losing historical sources or evidence.
 */
export async function mergeOpportunityWithExisting(
  existingId: string,
  newSourcePayload: {
    source: string;
    source_identifier?: string | null;
    evidence_snippet?: string | null;
    description?: string | null;
    stipend?: string | null;
    salary?: string | null;
    deadline?: string | null;
    application_url?: string | null;
    skills_required?: string[] | null;
  }
): Promise<{ success: boolean; data?: Opportunity; error?: string }> {
  try {
    const existing = await getOpportunityById(existingId);
    if (!existing) {
      return { success: false, error: 'Existing opportunity record not found.' };
    }

    const supabase = createServiceRoleClient();

    // Preserve source history
    const existingHistory: SourceHistoryItem[] = existing.sources_history || [];
    const newHistoryItem: SourceHistoryItem = {
      source_type: newSourcePayload.source,
      source_identifier: newSourcePayload.source_identifier || null,
      timestamp: new Date().toISOString(),
      evidence_snippet: newSourcePayload.evidence_snippet || null,
    };
    const updatedHistory = [...existingHistory, newHistoryItem];

    // Combine evidence snippets
    const existingSnippets = existing.evidence_snippets || [];
    const updatedSnippets = newSourcePayload.evidence_snippet
      ? Array.from(new Set([...existingSnippets, newSourcePayload.evidence_snippet]))
      : existingSnippets;

    // Combine skills
    const existingSkills = existing.skills_required || [];
    const combinedSkills = newSourcePayload.skills_required
      ? Array.from(new Set([...existingSkills, ...newSourcePayload.skills_required]))
      : existingSkills;

    // Preserve or fill unpopulated fields
    const updatedPayload = {
      description: existing.description || newSourcePayload.description || null,
      stipend: existing.stipend || newSourcePayload.stipend || null,
      salary: existing.salary || newSourcePayload.salary || null,
      deadline: existing.deadline || newSourcePayload.deadline || null,
      application_url: existing.application_url || newSourcePayload.application_url || null,
      skills_required: combinedSkills.length > 0 ? combinedSkills : null,
      sources_history: updatedHistory,
      evidence_snippets: updatedSnippets,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('opportunities')
      .update(updatedPayload)
      .eq('id', existingId)
      .select()
      .single();

    if (error) return { success: false, error: error.message };

    revalidatePath('/opportunities');
    return { success: true, data: data as Opportunity };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Create a new Opportunity record.
 */
export async function createOpportunity(
  payload: Partial<Opportunity>
): Promise<{ success: boolean; data?: Opportunity; error?: string }> {
  try {
    if (!payload.title || !payload.organization || !payload.type) {
      return { success: false, error: 'Title, Organization, and Opportunity Type are required.' };
    }

    const supabase = createServiceRoleClient();

    const initialHistory: SourceHistoryItem[] = [
      {
        source_type: payload.source || 'MANUAL',
        source_identifier: payload.source_identifier || null,
        timestamp: new Date().toISOString(),
        evidence_snippet: (payload as any).evidence_snippet || null,
      },
    ];

    const initialSnippets = (payload as any).evidence_snippet ? [(payload as any).evidence_snippet] : [];

    let userId = payload.user_id;
    if (!userId) {
      try {
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user?.id) userId = user.id;
      } catch (e) {}
    }

    const cleanType = sanitizeOpportunityType(payload.type);
    const cleanWorkMode = sanitizeWorkMode(payload.work_mode);
    const cleanDeadline = sanitizeDeadline(payload.deadline);

    const { data, error } = await supabase
      .from('opportunities')
      .insert({
        user_id: userId || null,
        title: payload.title.trim(),
        organization: payload.organization.trim(),
        type: cleanType,
        role: payload.role?.trim() || null,
        description: payload.description?.trim() || null,
        eligibility: payload.eligibility?.trim() || null,
        education_requirements: payload.education_requirements?.trim() || null,
        branch_requirements: payload.branch_requirements?.trim() || null,
        skills_required: payload.skills_required || [],
        location: payload.location?.trim() || null,
        work_mode: cleanWorkMode,
        stipend: payload.stipend?.trim() || null,
        salary: payload.salary?.trim() || null,
        deadline: cleanDeadline,
        application_url: payload.application_url?.trim() || null,
        source: payload.source?.trim() || 'MANUAL',
        source_identifier: payload.source_identifier?.trim() || null,
        confidence: payload.confidence ?? 1.0,
        status: payload.status || 'NEW',
        sources_history: initialHistory,
        evidence_snippets: initialSnippets,
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/opportunities');
    revalidatePath('/search');
    revalidatePath('/');

    return { success: true, data: data as Opportunity };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create opportunity.' };
  }
}

/**
 * Update pipeline status of an opportunity record.
 */
export async function updateOpportunityStatus(
  id: string,
  status: OpportunityStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('opportunities')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/opportunities');
    revalidatePath('/');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Full edit update of an opportunity record.
 */
export async function updateOpportunity(
  id: string,
  payload: Partial<Opportunity>
): Promise<{ success: boolean; data?: Opportunity; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('opportunities')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/opportunities');
    return { success: true, data: data as Opportunity };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Delete an opportunity record.
 */
export async function deleteOpportunity(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('opportunities').delete().eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/opportunities');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
