import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const encryptionSecret = process.env.ENCRYPTION_SECRET || '';
const geminiApiKey = process.env.GEMINI_API_KEY || '';

if (!url || !serviceKey || !encryptionSecret || !geminiApiKey) {
  console.error('Missing required environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_SECRET, GEMINI_API_KEY).');
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

async function seedKey() {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const encrypted = encryptApiKey(geminiApiKey);

  const { data, error } = await supabase
    .from('api_keys_config')
    .upsert(
      {
        provider: 'gemini',
        encrypted_key: encrypted.encryptedKey,
        iv: encrypted.iv,
        auth_tag: encrypted.authTag,
        selected_model: 'gemini-3.6-flash',
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
  } else {
    console.log('✅ Updated Vault model to gemini-3.6-flash!');
  }
}

seedKey();
