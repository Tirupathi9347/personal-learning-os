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
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    envVars[key] = val;
  }
}

const url = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const serviceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log('=== INSPECTING CURRENT SUPABASE DATABASE STATE ===\n');

  const { data: { users }, error: uErr } = await supabase.auth.admin.listUsers();
  const user = users.find(u => u.email === 'user@example.com') || users[0];
  console.log(`Authenticated User: ${user?.email} (ID: ${user?.id})`);

  const { data: insData, error: insErr } = await supabase
    .from('tasks')
    .insert({
      title: 'Review Python function arguments and variable scopes',
      description: 'Review positional vs keyword args, *args, **kwargs, and default parameter evaluation.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-08',
      completed_at: '2026-09-08T16:30:00Z',
      postponed_count: 0,
      created_at: '2026-09-07T10:00:00Z',
      user_id: user?.id,
      idempotency_key: 'seed-task-20260907-python-functions'
    })
    .select();

  console.log('Task Insert Result:', { insData, insErr });

  const tables = [
    'tasks',
    'time_sessions',
    'mistakes',
    'journal_entries',
    'notes',
    'skills',
    'projects',
    'student_profiles',
    'evidence_links',
    'github_repos',
    'github_activity_logs',
    'leetcode_profile_cache',
    'leetcode_submissions_log'
  ];

  for (const t of ['tasks', 'journal_entries', 'notes', 'skills', 'projects', 'student_profiles']) {
    const { data } = await supabase.from(t).select('*');
    console.log(`\n=== Detailed rows for "${t}" (${data?.length || 0}) ===`);
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
