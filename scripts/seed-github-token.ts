import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const encryptionSecret = process.env.ENCRYPTION_SECRET || '';
const githubPat = process.env.GITHUB_PAT || '';

if (!url || !serviceKey || !encryptionSecret || !githubPat) {
  console.error('Missing required environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_SECRET, GITHUB_PAT).');
  process.exit(1);
}

function encryptApiKey(plaintext: string) {
  const key = Buffer.from(encryptionSecret, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

async function seedGitHubToken() {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  
  console.log('1. Encrypting GitHub PAT with AES-256-GCM...');
  const encrypted = encryptApiKey(githubPat);

  console.log('2. Saving encrypted PAT to api_keys_config vault...');
  const { data, error } = await supabase
    .from('api_keys_config')
    .upsert(
      {
        provider: 'github',
        encrypted_key: encrypted.encryptedKey,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        selected_model: 'github-rest-api',
        is_active: true,
        health_status: 'healthy',
        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' }
    )
    .select();

  if (error) {
    console.error('❌ Vault error:', error.message);
    return;
  }

  console.log('✅ GitHub PAT securely encrypted & saved to Vault table!');

  console.log('\n3. Testing connection against GitHub API...');
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${githubPat}`,
        'User-Agent': 'Personal-Learning-OS',
      },
    });

    if (!res.ok) {
      console.error(`❌ GitHub API test failed with HTTP ${res.status}:`, await res.text());
      return;
    }

    const userData = await res.json();
    console.log(`🎉 SUCCESS! Connected to GitHub as user: @${userData.login} (${userData.name || 'User'})`);
    console.log(` - Public Repos: ${userData.public_repos}`);
    console.log(` - Profile URL: ${userData.html_url}`);
  } catch (err: any) {
    console.error('❌ GitHub connection error:', err.message);
  }
}

seedGitHubToken();
