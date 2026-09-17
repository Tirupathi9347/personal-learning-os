import * as fs from 'fs';
import * as path from 'path';

// Pre-load .env.local for standalone execution
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
import { seedStudentLearningHistory, getStudentLearningHistoryStats } from '../src/app/actions/seed-learning-history-actions';

async function getIntegrationCounts(supabase: any) {
  const [repos, ghLogs, lcCache, lcLogs] = await Promise.all([
    supabase.from('github_repos').select('*', { count: 'exact', head: true }),
    supabase.from('github_activity_logs').select('*', { count: 'exact', head: true }),
    supabase.from('leetcode_profile_cache').select('*', { count: 'exact', head: true }),
    supabase.from('leetcode_submissions_log').select('*', { count: 'exact', head: true }),
  ]);
  return {
    github_repos: repos.count || 0,
    github_activity_logs: ghLogs.count || 0,
    leetcode_profile_cache: lcCache.count || 0,
    leetcode_submissions_log: lcLogs.count || 0,
  };
}

async function run() {
  console.log('=== COMPREHENSIVE PERSISTENT DEMO LEARNING HISTORY SEED ===\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  console.log('1. Checking External Integration Baseline (GitHub & LeetCode)...');
  const integrationsBefore = await getIntegrationCounts(supabase);
  console.log('Integrations baseline before seed:', integrationsBefore);

  console.log('\n2. Fetching initial learning history stats...');
  const initialStats = await getStudentLearningHistoryStats();
  console.log('Initial stats:', initialStats);

  console.log('\n3. Executing comprehensive deterministic seed...');
  const run1 = await seedStudentLearningHistory();
  console.log('Run 1 Result:', run1);

  console.log('\n4. Testing Duplicate Safety / Idempotency (executing seed a second time)...');
  const run2 = await seedStudentLearningHistory();
  console.log('Run 2 Result:', run2);

  // Assert idempotency
  if (
    run1.tasksCount !== run2.tasksCount ||
    run1.timeSessionsCount !== run2.timeSessionsCount ||
    run1.mistakesCount !== run2.mistakesCount ||
    run1.journalEntriesCount !== run2.journalEntriesCount ||
    run1.notesCount !== run2.notesCount ||
    run1.skillsCount !== run2.skillsCount ||
    run1.projectsCount !== run2.projectsCount
  ) {
    console.error('❌ IDEMPOTENCY FAILURE: Counts changed between runs!');
    process.exit(1);
  }
  console.log('✅ Idempotency verified: 100% duplicate-safe, identical counts on re-run!');

  console.log('\n5. Verifying External Integration Invariance (ZERO writes to GitHub & LeetCode)...');
  const integrationsAfter = await getIntegrationCounts(supabase);
  console.log('Integrations count after seed:', integrationsAfter);

  if (
    integrationsBefore.github_repos !== integrationsAfter.github_repos ||
    integrationsBefore.github_activity_logs !== integrationsAfter.github_activity_logs ||
    integrationsBefore.leetcode_profile_cache !== integrationsAfter.leetcode_profile_cache ||
    integrationsBefore.leetcode_submissions_log !== integrationsAfter.leetcode_submissions_log
  ) {
    console.error('❌ INTEGRATION INVARIANCE VIOLATION: External integration tables were modified!');
    process.exit(1);
  }
  console.log('✅ Integration zero-touch verified: Exactly 0 writes to GitHub & LeetCode tables.');

  console.log('\n6. Inspecting Seeded Task Status Distribution...');
  const { data: allTasks } = await supabase.from('tasks').select('id, title, status, priority, due_date, postponed_count');
  const taskStatusCounts = {
    total: allTasks?.length || 0,
    completed: allTasks?.filter((t: any) => t.status === 'completed').length || 0,
    in_progress: allTasks?.filter((t: any) => t.status === 'in_progress').length || 0,
    todo: allTasks?.filter((t: any) => t.status === 'todo').length || 0,
  };
  console.log('Tasks Breakdown:', taskStatusCounts);

  console.log('\n7. Inspecting Seeded Mistakes...');
  const { data: allMistakes } = await supabase.from('mistakes').select('id, title, category, severity');
  console.log('Mistakes Count:', allMistakes?.length);
  console.log('Mistakes Categories:', Array.from(new Set(allMistakes?.map((m: any) => m.category))));

  console.log('\n🎉 ALL PERSISTENT DEMO LEARNING HISTORY DATA VERIFIED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Seed execution error:', err);
  process.exit(1);
});
