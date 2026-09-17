import { GoogleGenerativeAI } from '@google/generative-ai';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/crypto/encryption';
import { ProposedChangesPayload } from '@/types';
import { SYSTEM_PARSER_PROMPT } from './prompts';

export interface ResolvedAiConfig {
  apiKey: string;
  modelName: string;
  source: 'vault' | 'environment';
}

/**
 * Server-only key & model resolution.
 * Decrypts API key in server memory. Never returns decrypted key to browser endpoints.
 */
export async function getResolvedGeminiConfig(): Promise<ResolvedAiConfig> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'gemini')
      .eq('is_active', true)
      .single();

    if (data && data.encrypted_key && data.iv && data.auth_tag) {
      const decryptedKey = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
      return {
        apiKey: decryptedKey,
        modelName: data.selected_model || 'gemini-3.5-flash',
        source: 'vault',
      };
    }
  } catch (error) {
    // Fall back to environment variable if vault lookup fails or table is unpopulated
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (!envKey) {
    throw new Error('No valid Gemini API key found in vault or environment variables.');
  }

  return {
    apiKey: envKey,
    modelName: process.env.DEFAULT_GEMINI_MODEL || 'gemini-3.5-flash',
    source: 'environment',
  };
}

/**
 * Parse natural-language updates into structured proposed changes.
 */
export async function parseNaturalLanguageUpdate(
  rawPrompt: string,
  existingContextSummary?: string
): Promise<{ config: ResolvedAiConfig; payload: ProposedChangesPayload }> {
  const config = await getResolvedGeminiConfig();
  const genAI = new GoogleGenerativeAI(config.apiKey);
  
  const model = genAI.getGenerativeModel({
    model: config.modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const promptText = `
${SYSTEM_PARSER_PROMPT}

Context Summary (Current State):
${existingContextSummary || 'No existing active tasks.'}

User Update Prompt:
"${rawPrompt}"
  `;

  const result = await model.generateContent(promptText);
  const responseText = result.response.text();

  try {
    const parsedPayload: ProposedChangesPayload = JSON.parse(responseText);
    return { config, payload: parsedPayload };
  } catch (err) {
    throw new Error(`Failed to parse Gemini response as JSON: ${responseText}`);
  }
}
