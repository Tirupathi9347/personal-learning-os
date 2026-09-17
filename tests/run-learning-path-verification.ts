import fs from 'fs';
import path from 'path';

try {
  const envPath = path.resolve('.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
} catch (e) {
  console.warn('Env load notice:', e);
}

import { createServiceRoleClient } from '../src/lib/supabase/server';
import { saveRoadmapAsLearningPath, getActiveLearningPath, toggleLearningPathActivity, getLearningPathTodaySection } from '../src/app/actions/learning-path-actions';

async function main() {
  console.log('=== Testing Learning Path Persistence ===');
  
  const supabase = createServiceRoleClient();
  
  // 1. Check if tables exist
  const { data: pathCheck, error: checkErr } = await supabase.from('learning_paths').select('id').limit(1);
  if (checkErr) {
    console.error('learning_paths table check error:', checkErr.message);
  } else {
    console.log('✓ learning_paths table exists, rows found:', pathCheck?.length);
  }

  // 2. Test saving a 2-day roadmap
  const saveRes = await saveRoadmapAsLearningPath({
    goal: 'Learn Binary Tree Traversal & Recursion in 2 Days',
    days: [
      {
        dayNumber: 1,
        topic: 'Binary Tree Traversal Basics (In-order, Pre-order, Post-order)',
        learnContent: 'Understand tree nodes, recursion call stack, DFS traversals.',
        practiceProblems: 3,
        reviewActivity: 'Review traversal recursion tracing mistakes.',
        aiEstimatedMinutes: 45,
        priority: 'HIGH',
        evidenceRationale: 'Telemetry indicates beginner status with trees.',
      },
      {
        dayNumber: 2,
        topic: 'BST Operations & Recursive Search',
        learnContent: 'BST properties, insertion, deletion, searching.',
        practiceProblems: 5,
        reviewActivity: 'Review edge cases with null nodes.',
        aiEstimatedMinutes: 90,
        priority: 'MEDIUM',
        evidenceRationale: 'Reinforces day 1 traversal mastery.',
      },
    ],
  });

  console.log('Save Roadmap result:', saveRes);

  // 3. Test retrieving active learning path
  const activeRes = await getActiveLearningPath();
  console.log('Active Learning Path:', {
    success: activeRes.success,
    goal: activeRes.data?.goal,
    totalDays: activeRes.data?.total_days,
    daysCount: activeRes.data?.days?.length,
  });

  if (activeRes.data?.days?.[0]) {
    const day1 = activeRes.data.days[0];
    console.log('Testing activity check-off on Day 1 (learn):');
    const toggleRes = await toggleLearningPathActivity(day1.id, 'learn', true);
    console.log('Toggle result:', {
      success: toggleRes.success,
      activities: toggleRes.updatedDay?.activities_completed,
      isCompleted: toggleRes.updatedDay?.is_completed,
    });
  }

  // 4. Test Today section
  const todayRes = await getLearningPathTodaySection();
  console.log('Today Section for Dashboard:', {
    success: todayRes.success,
    goal: todayRes.data?.goal,
    currentDayNumber: todayRes.data?.currentDayNumber,
    overallProgress: todayRes.data?.overallProgress,
    currentDayTopic: todayRes.data?.currentDay?.topic,
    currentDayActivities: todayRes.data?.currentDay?.activities_completed,
  });

  console.log('=== Learning Path Verification Complete ===');
}

main().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
