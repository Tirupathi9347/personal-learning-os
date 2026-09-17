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
import { executeGetTasksTool, executeGetSkillsTool, executeGetMistakesTool, executeGetTimeSessionsTool, executeGetProjectsTool, executeGetStudentProfileTool } from '../src/lib/agent/read-tools';
import { runStudentGoalOrchestrator } from '../src/app/actions/agent-actions';
import { seedStudentLearningHistory, getStudentLearningHistoryStats } from '../src/app/actions/seed-learning-history-actions';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  [PASS] ${msg}`);
}

async function main() {
  console.log('=== VERIFYING PERSISTENT STUDENT LEARNING HISTORY SEED ===\n');

  // 1. Direct Supabase verification
  console.log('--- 1. Direct Supabase Table & Row Count Verification ---');
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const user = users.find((u) => u.email === 'user@example.com') || users[0];
  console.log(`User: ${user.email} (${user.id})`);

  const stats = await getStudentLearningHistoryStats(user.id);
  console.log('Database Stats:', stats);

  assert(stats.tasksCount >= 10, `Tasks count must be at least 10 (found ${stats.tasksCount})`);
  assert(stats.timeSessionsCount >= 9, `Time sessions count must be at least 9 (found ${stats.timeSessionsCount})`);
  assert(stats.mistakesCount >= 5, `Mistakes count must be at least 5 (found ${stats.mistakesCount})`);
  assert(stats.journalEntriesCount >= 8, `Journal entries count must be at least 8 (found ${stats.journalEntriesCount})`);
  assert(stats.notesCount >= 5, `Notes count must be at least 5 (found ${stats.notesCount})`);
  assert(stats.skillsCount >= 5, `Skills count must be at least 5 (found ${stats.skillsCount})`);
  assert(stats.projectsCount >= 2, `Projects count must be at least 2 (found ${stats.projectsCount})`);

  // 2. User ownership & status distribution on tasks
  console.log('\n--- 2. User Ownership & Task Status Distribution ---');
  const { data: userTasks } = await supabase.from('tasks').select('*').eq('user_id', user.id);
  assert(Boolean(userTasks && userTasks.length >= 10), 'All seeded tasks must have user_id strictly bound');
  
  const completedTasks = userTasks!.filter((t) => t.status === 'completed');
  const inProgressTasks = userTasks!.filter((t) => t.status === 'in_progress');
  const todoTasks = userTasks!.filter((t) => t.status === 'todo');

  console.log(`Status breakdown: completed=${completedTasks.length}, in_progress=${inProgressTasks.length}, todo=${todoTasks.length}`);
  assert(completedTasks.length >= 3, 'Must have completed tasks in history');
  assert(inProgressTasks.length >= 1, 'Must have in_progress tasks in history');
  assert(todoTasks.length >= 2, 'Must have todo tasks in history');

  // 3. GitHub & LeetCode untouched verification
  console.log('\n--- 3. GitHub and LeetCode Integrity Check ---');
  const { count: ghRepoCount } = await supabase.from('github_repos').select('*', { count: 'exact', head: true });
  const { count: lcProfileCount } = await supabase.from('leetcode_profile_cache').select('*', { count: 'exact', head: true });
  console.log(`GitHub Repos Count: ${ghRepoCount}, LeetCode Profile Cache Count: ${lcProfileCount}`);
  assert(ghRepoCount === 2, `GitHub repos must remain untouched (got ${ghRepoCount})`);
  assert(lcProfileCount === 1, `LeetCode cache must remain untouched (got ${lcProfileCount})`);

  // 4. Test Agent Read-Only Tools
  console.log('\n--- 4. Agent Read-Only Tools Retrieval Verification ---');
  const tasksToolOutput = await executeGetTasksTool({ userId: user.id });
  assert(tasksToolOutput.tasks.length >= 10, `get_tasks returned ${tasksToolOutput.tasks.length} tasks`);

  const skillsToolOutput = await executeGetSkillsTool();
  assert(skillsToolOutput.skills.some((s) => s.name === 'Python'), 'get_skills returned Python');
  assert(skillsToolOutput.skills.some((s) => s.name === 'SQL & Relational Databases'), 'get_skills returned SQL');

  const mistakesToolOutput = await executeGetMistakesTool();
  assert(mistakesToolOutput.mistakes.length >= 5, `get_mistakes returned ${mistakesToolOutput.mistakes.length} mistakes`);
  assert(mistakesToolOutput.mistakes.some((m) => (m.category as string).toLowerCase().includes('database') || (m.category as string).toLowerCase().includes('sql')), 'get_mistakes includes SQL/Database mistakes');

  const timeSessionsToolOutput = await executeGetTimeSessionsTool();
  assert(timeSessionsToolOutput.sessions.length >= 9, `get_time_sessions returned ${timeSessionsToolOutput.sessions.length} sessions`);
  assert(timeSessionsToolOutput.totalDurationMinutes >= 400, `Total focus duration: ${timeSessionsToolOutput.totalDurationMinutes} mins`);

  const projectsToolOutput = await executeGetProjectsTool();
  assert(projectsToolOutput.projects.some((p) => p.slug === 'personal-learning-tracker-api'), 'get_projects includes Personal Learning Tracker API');

  const profileToolOutput = await executeGetStudentProfileTool();
  assert(profileToolOutput.hasProfile, 'get_student_profile returns active student profile');
  console.log('Profile student name:', profileToolOutput.profile?.full_name);

  // 5. Test Learning Coach with Goal 1
  console.log('\n--- 5. Learning Coach Test: "I need to learn coding basics in 2 days according to my level" ---');
  const coachRes1 = await runStudentGoalOrchestrator('I need to learn coding basics in 2 days according to my level.');
  assert(coachRes1.success, 'Coach run 1 succeeded');
  assert(Boolean(coachRes1.learningPlan?.steps && coachRes1.learningPlan.steps.length > 0), 'Generated learning plan steps');
  console.log('Coach Decision 1:', (coachRes1.learningDecision as any)?.rationale || (coachRes1.learningDecision as any)?.overallStrategy);
  console.log('Observed Assessment 1:', (coachRes1.studentAssessment as any)?.level || 'Assessment present');

  // 6. Test Learning Coach with Goal 2 (SQL Mistakes Grounding)
  console.log('\n--- 6. Learning Coach Test: "I keep making mistakes in SQL and need a plan for this week" ---');
  const coachRes2 = await runStudentGoalOrchestrator('I keep making mistakes in SQL and need a plan for this week.');
  assert(coachRes2.success, 'Coach run 2 succeeded');
  assert(Boolean(coachRes2.learningPlan?.steps && coachRes2.learningPlan.steps.length > 0), 'Generated SQL mistake remediation plan');
  console.log('Coach Decision 2:', (coachRes2.learningDecision as any)?.rationale || (coachRes2.learningDecision as any)?.overallStrategy);
  console.log('First step title:', coachRes2.learningPlan?.steps[0]?.title);
  assert(
    Boolean(
      coachRes2.learningPlan?.steps.some((s) => 
        s.title.toLowerCase().includes('sql') || 
        s.title.toLowerCase().includes('dbms') ||
        s.title.toLowerCase().includes('database') || 
        s.title.toLowerCase().includes('mistake') || 
        s.title.toLowerCase().includes('misconception') ||
        s.description.toLowerCase().includes('join') ||
        s.description.toLowerCase().includes('sql') ||
        s.description.toLowerCase().includes('dbms')
      )
    ),
    'Plan directly targets SQL/DBMS mistake remediation based on historical evidence'
  );

  console.log('\n=== ALL PERSISTENT STUDENT HISTORY VERIFICATION CHECKS PASSED ===');
}

main().catch((err) => {
  console.error('Verification failure:', err);
  process.exit(1);
});
