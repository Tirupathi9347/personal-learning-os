'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { extractOpportunitiesFromText, ExtractionResult, ExtractedOpportunityItem } from '@/lib/ai/opportunity-extractor';
import { sanitizeOpportunityType, sanitizeWorkMode, sanitizeDeadline } from '@/lib/ai/opportunity-sanitizer';
import { Opportunity } from '@/types';
import { revalidatePath } from 'next/cache';
import JSZip from 'jszip';

/**
 * Extract opportunities from uploaded document files (FormData wrapper).
 */
export async function processOpportunityDocument(
  formData: FormData
): Promise<{ success: boolean; data?: ExtractionResult; error?: string }> {
  try {
    const file = formData.get('file') as File | null;
    if (!file) {
      return { success: false, error: 'No file provided.' };
    }

    const buffer = await file.arrayBuffer();
    const fileName = file.name || 'document.txt';
    const mimeType = file.type || 'text/plain';

    const res = await processFileAndExtractOpportunities(buffer, fileName, mimeType);
    if (!res.success) {
      return { success: false, error: res.error };
    }

    return { success: true, data: res.result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to process document.' };
  }
}

export async function processFileAndExtractOpportunities(
  fileBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<{ success: boolean; result?: ExtractionResult; error?: string }> {
  try {
    let rawText = '';
    const lowerName = fileName.toLowerCase();

    if (lowerName.endsWith('.txt') || mimeType === 'text/plain') {
      const decoder = new TextDecoder('utf-8');
      rawText = decoder.decode(fileBuffer);
    } else if (lowerName.endsWith('.docx')) {
      const zip = await JSZip.loadAsync(fileBuffer);
      const documentXml = await zip.file('word/document.xml')?.async('text');
      if (documentXml) {
        rawText = documentXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        return { success: false, error: 'Could not parse text from .docx file.' };
      }
    } else {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      rawText = decoder.decode(fileBuffer);
      rawText = rawText.replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    }

    if (!rawText || rawText.trim().length === 0) {
      return { success: false, error: 'Extracted text is empty.' };
    }

    const sourceType = lowerName.includes('whatsapp') ? 'WHATSAPP_EXPORT' : 'DOCUMENT';
    const result = await extractOpportunitiesFromText(rawText, fileName, sourceType);

    return { success: true, result };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to process document file.' };
  }
}

/**
 * Save confirmed opportunities into database (AI Confirmation Gate).
 */
export async function saveExtractedOpportunities(
  items: ExtractedOpportunityItem[],
  sourceType: string,
  fileName?: string
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  try {
    if (!items || items.length === 0) {
      return { success: false, savedCount: 0, error: 'No items selected to save.' };
    }

    const supabase = createServiceRoleClient();
    let savedCount = 0;
    let firstError: string | null = null;

    let userId: string | null = null;
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user?.id) userId = user.id;
    } catch (e) {}

    for (const item of items) {
      const initialHistory = [
        {
          source_type: sourceType || 'FILE_UPLOAD',
          source_identifier: item.source_identifier || fileName || null,
          timestamp: new Date().toISOString(),
          evidence_snippet: item.evidence_snippet || null,
        },
      ];

      const initialSnippets = item.evidence_snippet ? [item.evidence_snippet] : [];

      const cleanType = sanitizeOpportunityType(item.type);
      const cleanWorkMode = sanitizeWorkMode(item.work_mode);
      const cleanDeadline = sanitizeDeadline(item.deadline);

      const { error } = await supabase.from('opportunities').insert({
        user_id: userId,
        title: item.title,
        organization: item.organization,
        type: cleanType,
        role: item.role || null,
        description: item.description || null,
        eligibility: item.eligibility || null,
        education_requirements: item.education_requirements || null,
        branch_requirements: item.branch_requirements || null,
        skills_required: item.skills_required || [],
        location: item.location || null,
        work_mode: cleanWorkMode,
        stipend: item.stipend || null,
        salary: item.salary || null,
        deadline: cleanDeadline,
        application_url: item.application_url || null,
        source: sourceType || 'FILE_UPLOAD',
        source_identifier: item.source_identifier || fileName || null,
        confidence: item.confidence ?? 0.85,
        status: 'NEW',
        sources_history: initialHistory,
        evidence_snippets: initialSnippets,
      });

      if (error) {
        console.error('Error inserting opportunity:', error.message);
        if (!firstError) firstError = error.message;
      } else {
        savedCount++;
      }
    }

    revalidatePath('/opportunities');
    revalidatePath('/search');
    revalidatePath('/');

    if (savedCount === 0 && firstError) {
      return { success: false, savedCount: 0, error: firstError };
    }

    return { success: true, savedCount };
  } catch (err: any) {
    return { success: false, savedCount: 0, error: err.message || 'Failed to save opportunities.' };
  }
}
