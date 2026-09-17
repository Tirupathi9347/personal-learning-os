// Quick DB count checker - no TS, pure ESM
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Read .env.local
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const serviceRoleKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const tables = ['tasks', 'mistakes', 'skills', 'projects', 'notes', 'journal_entries', 'time_sessions'];

console.log('\n🔍 Demo History Database Audit\n' + '='.repeat(40));
for (const table of tables) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    console.log(`❌ ${table}: ERROR - ${error.message}`);
  } else {
    const status = count > 0 ? '✅' : '⚠️';
    console.log(`${status} ${table}: ${count} records`);
  }
}

// Check users
const { data: { users } } = await supabase.auth.admin.listUsers();
console.log(`\n👤 Auth users: ${users?.length || 0}`);
if (users?.length > 0) {
  console.log(`   Primary user: ${users[0].email} (id: ${users[0].id.substring(0, 8)}...)`);
}

// Check tasks status breakdown
const { data: taskData } = await supabase.from('tasks').select('status');
if (taskData) {
  const statusCounts = taskData.reduce((acc, t) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});
  console.log('\n📋 Task Status Breakdown:');
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`   ${status}: ${count}`);
  }
}

console.log('\n' + '='.repeat(40));
console.log('✅ Audit complete.\n');
