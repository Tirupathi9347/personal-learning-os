'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/encryption';
import { ApiKeyPublicConfig } from '@/types';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { revalidatePath } from 'next/cache';

/**
 * Save or update Gemini API key / AI Model in encrypted Vault.
 * API key is encrypted on the server using AES-256-GCM.
 * Never logs or returns plaintext key to the client.
 */
export async function saveGeminiKey(
  plaintextKey?: string,
  modelName: string = 'gemini-3.5-flash'
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data: existing } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'gemini')
      .maybeSingle();

    // 1. If updating model selection without providing a new key string
    if (!plaintextKey || plaintextKey.trim() === '') {
      if (existing) {
        const { error: updateErr } = await supabase
          .from('api_keys_config')
          .update({
            selected_model: modelName,
            health_status: 'healthy',
            updated_at: new Date().toISOString(),
          })
          .eq('provider', 'gemini');

        if (updateErr) return { success: false, error: updateErr.message };

        revalidatePath('/settings');
        return { success: true };
      }

      // If no Vault record exists yet, encrypt GEMINI_API_KEY from environment if available
      const keyToUse = process.env.GEMINI_API_KEY;
      if (!keyToUse) {
        return { success: false, error: 'No Gemini API key provided or found in environment.' };
      }
      const encrypted = encryptApiKey(keyToUse.trim());

      const { error: insertErr } = await supabase
        .from('api_keys_config')
        .upsert(
          {
            provider: 'gemini',
            encrypted_key: encrypted.encryptedKey,
            iv: encrypted.iv,
            auth_tag: encrypted.authTag,
            selected_model: modelName,
            is_active: true,
            health_status: 'healthy',
            last_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'provider' }
        );

      if (insertErr) return { success: false, error: insertErr.message };

      revalidatePath('/settings');
      return { success: true };
    }

    // 2. If a new plaintext API key string is provided by the user
    const encrypted = encryptApiKey(plaintextKey.trim());
    const { error: upsertErr } = await supabase
      .from('api_keys_config')
      .upsert(
        {
          provider: 'gemini',
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          selected_model: modelName,
          is_active: true,
          health_status: 'healthy',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      );

    if (upsertErr) return { success: false, error: upsertErr.message };

    revalidatePath('/settings');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save configuration.' };
  }
}

/**
 * Save Google OAuth Client ID and Secret in Vault.
 */
export async function saveGmailOAuthConfig(
  clientId: string,
  clientSecret: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!clientId.trim() || !clientSecret.trim()) {
      return { success: false, error: 'Google Client ID and Client Secret are required.' };
    }

    const payload = JSON.stringify({ clientId: clientId.trim(), clientSecret: clientSecret.trim() });
    const encrypted = encryptApiKey(payload);
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('api_keys_config')
      .upsert(
        {
          provider: 'gmail_oauth',
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          selected_model: 'google_oauth2',
          is_active: true,
          health_status: 'healthy',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      );

    if (error) return { success: false, error: error.message };

    revalidatePath('/settings');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fetch safe public configuration (NO DECRYPTED SECRET RETURNED TO CLIENT).
 */
export async function getVaultConfig(): Promise<ApiKeyPublicConfig | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('id, provider, selected_model, is_active, health_status, last_checked_at, created_at, encrypted_key')
      .eq('provider', 'gemini')
      .maybeSingle();

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      provider: data.provider,
      selected_model: data.selected_model || 'gemini-3.5-flash',
      is_active: data.is_active,
      health_status: data.health_status || 'healthy',
      last_checked_at: data.last_checked_at,
      created_at: data.created_at,
      has_key: !!data.encrypted_key,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Perform server-side health check on Gemini API key without leaking plaintext key.
 */
export async function testVaultKey(): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'gemini')
      .single();

    let apiKey = process.env.GEMINI_API_KEY || '';
    let modelName = data?.selected_model || 'gemini-3.5-flash';

    if (data && data.encrypted_key) {
      apiKey = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
    }

    if (!apiKey) {
      return { success: false, message: 'No Gemini key stored in Vault or environment.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    await model.generateContent('ping');

    if (data) {
      await supabase
        .from('api_keys_config')
        .update({ health_status: 'healthy', last_checked_at: new Date().toISOString() })
        .eq('provider', 'gemini');
    }

    revalidatePath('/settings');
    return { success: true, message: `Gemini API Key and Model (${modelName}) verified successfully!` };
  } catch (err: any) {
    if (err.message && err.message.includes('429')) {
      return {
        success: false,
        message: `Quota limit on model. Switch model to "gemini-1.5-flash" in Settings and click Save! Error details: ${err.message}`,
      };
    }

    return { success: false, message: `Key validation failed: ${err.message}` };
  }
}
