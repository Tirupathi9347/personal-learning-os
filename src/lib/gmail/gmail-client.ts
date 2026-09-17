import { createServiceRoleClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/encryption';

export interface GmailTokens {
  access_token: string;
  refresh_token: string;
  expiry_date?: number;
  email_address?: string;
}

export interface ResolvedGmailConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Fetch Google Client ID and Secret from Vault or environment.
 */
export async function getGmailOAuthConfig(): Promise<ResolvedGmailConfig> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'gmail_oauth')
      .eq('is_active', true)
      .maybeSingle();

    if (data && data.encrypted_key && data.iv && data.auth_tag) {
      const decrypted = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
      const parsed = JSON.parse(decrypted);
      if (parsed.clientId && parsed.clientSecret) {
        return { clientId: parsed.clientId, clientSecret: parsed.clientSecret };
      }
    }
  } catch (err) {
    // Fall back to environment
  }

  const clientId = process.env.GMAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

  return { clientId, clientSecret };
}

/**
 * Fetch stored encrypted Gmail user tokens from Vault.
 */
export async function getStoredGmailTokens(): Promise<GmailTokens | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'gmail_tokens')
      .eq('is_active', true)
      .maybeSingle();

    if (!data || !data.encrypted_key) return null;

    const decrypted = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
    return JSON.parse(decrypted) as GmailTokens;
  } catch (err) {
    return null;
  }
}

/**
 * Store encrypted Gmail user tokens in Vault.
 */
export async function saveGmailTokens(tokens: GmailTokens): Promise<boolean> {
  try {
    const encrypted = encryptApiKey(JSON.stringify(tokens));
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('api_keys_config')
      .upsert(
        {
          provider: 'gmail_tokens',
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          selected_model: tokens.email_address || 'me',
          is_active: true,
          health_status: 'healthy',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      );

    return !error;
  } catch (err) {
    return false;
  }
}

/**
 * Delete Gmail tokens from Vault.
 */
export async function removeGmailTokens(): Promise<boolean> {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('api_keys_config')
      .delete()
      .eq('provider', 'gmail_tokens');

    return !error;
  } catch (err) {
    return false;
  }
}

/**
 * Get valid Access Token, refreshing automatically if expired.
 */
export async function getValidAccessToken(): Promise<{ accessToken: string; emailAddress?: string } | null> {
  const tokens = await getStoredGmailTokens();
  if (!tokens || !tokens.refresh_token) return null;

  const now = Date.now();
  if (tokens.access_token && tokens.expiry_date && tokens.expiry_date > now + 60000) {
    return { accessToken: tokens.access_token, emailAddress: tokens.email_address };
  }

  // Refresh token using Google OAuth endpoint
  const oauthConfig = await getGmailOAuthConfig();
  if (!oauthConfig.clientId || !oauthConfig.clientSecret) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      client_id: oauthConfig.clientId,
      client_secret: oauthConfig.clientSecret,
      refresh_token: tokens.refresh_token,
      grant_type: 'refresh_token',
    });

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const newAccessToken = data.access_token;
    const newExpiry = Date.now() + (data.expires_in || 3600) * 1000;

    const updatedTokens: GmailTokens = {
      ...tokens,
      access_token: newAccessToken,
      expiry_date: newExpiry,
    };

    await saveGmailTokens(updatedTokens);
    return { accessToken: newAccessToken, emailAddress: tokens.email_address };
  } catch (err) {
    return null;
  }
}

/**
 * Signal filtering logic to detect opportunity-related emails before sending to Gemini.
 */
export function isOpportunityEmail(subject: string, bodySnippet: string): boolean {
  const combined = `${subject} ${bodySnippet}`.toLowerCase();
  
  // Non-opportunity noise exclusion patterns
  const noiseExclusions = [
    'receipt', 'invoice', 'order confirmation', 'password reset',
    'security alert', 'verification code', 'newsletter unsubscribe',
    'shipping update', 'bank statement', 'transaction alert'
  ];

  if (noiseExclusions.some((noise) => combined.includes(noise))) {
    return false;
  }

  // Opportunity signal keywords
  const opportunitySignals = [
    'internship', 'job opening', 'hiring', 'career', 'opportunity',
    'hackathon', 'scholarship', 'fellowship', 'competition', 'workshop',
    'certification', 'research assistant', 'stipend', 'interview invitation',
    'application status', 'job offer', 'apply now', 'software engineer intern',
    'developer intern', 'campus ambassador', 'call for papers'
  ];

  return opportunitySignals.some((signal) => combined.includes(signal));
}
