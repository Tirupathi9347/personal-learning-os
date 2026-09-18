import * as fs from 'fs';
import * as path from 'path';

// Pre-load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import { getTasks } from '../src/app/actions/task-actions';
import { getMistakes } from '../src/app/actions/mistake-actions';
import { getJournalEntries } from '../src/app/actions/journal-actions';
import { getNotes } from '../src/app/actions/note-actions';
import { getSkills } from '../src/app/actions/skill-actions';
import { getProjects } from '../src/app/actions/project-actions';
import { getTimeSessions } from '../src/app/actions/time-actions';

async function verifyAll() {
  console.log('=== VERIFYING PERSISTENT DEMO LEARNING HISTORY AGAINST UI ACTIONS ===\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. External Integrations Check (MUST BE UNCHANGED)
  const [repos, ghLogs, lcProfile, lcSubmissions] = await Promise.all([
    supabase.from('github_repos').select('*', { count: 'exact' }),
    supabase.from('github_activity_logs').select('*', { count: 'exact' }),
    supabase.from('leetcode_profile_cache').select('*', { count: 'exact' }),
    supabase.from('leetcode_submissions_log').select('*', { count: 'exact' }),
  ]);

  console.log('EXTERNAL INTEGRATION COUNTS:');
  console.log('  github_repos:', repos.count, '(expected: 2)');
  console.log('  github_activity_logs:', ghLogs.count, '(expected: 3)');
  console.log('  leetcode_profile_cache:', lcProfile.count, '(expected: 1)');
  console.log('  leetcode_submissions_log:', lcSubmissions.count, '(expected: 20)');

  if (repos.count! < 2 || ghLogs.count !== 3 || lcProfile.count !== 1 || lcSubmissions.count !== 20) {
    console.error('❌ INTEGRATION INVARIANCE VIOLATION!');
    process.exit(1);
  }
  console.log('✅ External integrations completely untouched!\n');

  // 2. UI Actions Retrieval Check (Testing what the actual pages fetch!)
  const [tasks, mistakes, journals, notes, skills, projects, sessions] = await Promise.all([
    getTasks(),
    getMistakes(),
    getJournalEntries(),
    getNotes(),
    getSkills(),
    getProjects(),
    getTimeSessions(),
  ]);

  console.log('UI SERVER ACTIONS RETRIEVAL RESULTS:');
  console.log(`  getTasks() retrieved: ${tasks.length} tasks`);
  console.log(`  getMistakes() retrieved: ${mistakes.length} mistakes`);
  console.log(`  getJournalEntries() retrieved: ${journals.length} journal entries`);
  console.log(`  getNotes() retrieved: ${notes.length} notes`);
  console.log(`  getSkills() retrieved: ${skills.length} skills`);
  console.log(`  getProjects() retrieved: ${projects.length} projects`);
  console.log(`  getTimeSessions() retrieved: ${sessions.length} time sessions`);

  // Assertions
  if (tasks.length === 0) {
    console.error('❌ FAILURE: getTasks() returned 0 tasks!');
    process.exit(1);
  }
  if (mistakes.length === 0) {
    console.error('❌ FAILURE: getMistakes() returned 0 mistakes!');
    process.exit(1);
  }

  // 3. Task Status Breakdown
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const todo = tasks.filter(t => t.status === 'todo').length;
  console.log(`\nTASK BREAKDOWN: Completed: ${completed}, In-Progress: ${inProgress}, To-Do: ${todo}`);

  // 4. Mistake Categories & Severities
  const categories = Array.from(new Set(mistakes.map(m => m.category)));
  const severities = Array.from(new Set(mistakes.map(m => m.severity)));
  console.log(`MISTAKE CATEGORIES: ${categories.join(', ')}`);
  console.log(`MISTAKE SEVERITIES: ${severities.join(', ')}`);

  // 5. Test Skill Check
  const hasTypoSkill = skills.some(s => s.name === 'wecwecwrvv');
  if (hasTypoSkill) {
    console.error('❌ FAILURE: test skill "wecwecwrvv" is still present in skills table!');
    process.exit(1);
  }
  console.log('✅ Test skill "wecwecwrvv" successfully deleted!');

  console.log('\n🎉 ALL PERSISTENT DEMO LEARNING HISTORY AUDITS PASSED WITH FLYING COLORS!');
}

verifyAll().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
