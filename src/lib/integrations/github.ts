import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/crypto/encryption';

export interface ResolvedGitHubConfig {
  token: string;
  source: 'vault' | 'environment';
}

/**
 * Server-only key resolution.
 * Decrypts GitHub PAT in server memory. Never returns decrypted token to browser endpoints.
 */
export async function getResolvedGitHubConfig(): Promise<ResolvedGitHubConfig> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'github')
      .eq('is_active', true)
      .maybeSingle();

    if (data && data.encrypted_key && data.iv && data.auth_tag) {
      const decryptedToken = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
      return {
        token: decryptedToken,
        source: 'vault',
      };
    }
  } catch (error) {
    // Fall back to environment variable if vault lookup fails
  }

  const envToken = process.env.GITHUB_PAT;
  if (!envToken) {
    throw new Error('No valid GitHub PAT found in vault or environment variables.');
  }

  return {
    token: envToken,
    source: 'environment',
  };
}

/**
 * Perform server-side authenticated fetch against GitHub REST API.
 */
export async function fetchGitHubApi(endpoint: string, options: RequestInit = {}) {
  const config = await getResolvedGitHubConfig();

  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${config.token}`,
      'User-Agent': 'Personal-Learning-OS',
      ...options.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${errorText}`);
  }

  const remaining = res.headers.get('x-ratelimit-remaining');
  return {
    data: await res.json(),
    rateLimitRemaining: remaining ? parseInt(remaining, 10) : null,
  };
}
