import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars: Record<string, string> = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    envVars[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
  }
}

const supabase = createClient(
  envVars['NEXT_PUBLIC_SUPABASE_URL'],
  envVars['SUPABASE_SERVICE_ROLE_KEY']
);

async function main() {
  const { data: subs } = await supabase.from('leetcode_submissions_log').select('id, title, status, difficulty, lang, timestamp');
  console.log(`LC Submissions (${subs?.length || 0}):`);
  subs?.forEach((s, idx) => console.log(`${idx + 1}. [${s.status}] ${s.title} (${s.difficulty}, ${s.lang}) - ${s.timestamp}`));

  const { data: repos } = await supabase.from('github_repos').select('id, name, full_name, language, description');
  console.log('\nGH Repos:', repos);
}

main().catch(console.error);
