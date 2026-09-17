import {
  saveRoadmapAsLearningPath,
  getActiveLearningPath,
  toggleLearningPathActivity,
  getLearningPathTodaySection,
  archiveLearningPath,
} from '../src/app/actions/learning-path-actions';

async function main() {
  console.log('--- Starting Comprehensive Learning Path Verification ---');

  // Step 1: Save a sample 3-day roadmap
  const saveResult = await saveRoadmapAsLearningPath({
    goal: 'Master Dynamic Programming in 3 Days',
    days: [
      {
        dayNumber: 1,
        topic: '1D Memoization & Tabulation',
        learnContent: 'Understand state transition tables and Fibonacci pattern',
        practiceProblems: 3,
        reviewActivity: 'Review time and space complexity tradeoffs',
        aiEstimatedMinutes: 60,
        priority: 'HIGH',
        evidenceRationale: 'Essential foundation for dynamic programming mastery',
      },
      {
        dayNumber: 2,
        topic: '2D Grid & Subsequence Patterns',
        learnContent: 'Unique Paths and Longest Common Subsequence state formulation',
        practiceProblems: 3,
        reviewActivity: 'Diagram the 2D grid transitions',
        aiEstimatedMinutes: 75,
        priority: 'HIGH',
        evidenceRationale: 'Common pattern in LeetCode Medium problem sets',
      },
      {
        dayNumber: 3,
        topic: 'Knapsack & Interval DP',
        learnContent: '0/1 Knapsack, Unbounded Knapsack, and Target Sum variations',
        practiceProblems: 2,
        reviewActivity: 'Consolidate DP decision tree templates in notes',
        aiEstimatedMinutes: 90,
        priority: 'MEDIUM',
        evidenceRationale: 'Final consolidation milestone',
      },
    ],
    planMetadata: { source: 'VerificationScript' },
  });

  console.log('1. saveRoadmapAsLearningPath result:', saveResult);
  if (!saveResult.success || !saveResult.pathId) {
    throw new Error('Failed to save learning path: ' + saveResult.error);
  }

  // Step 2: Hydrate active learning path
  const activeResult = await getActiveLearningPath();
  console.log('2. getActiveLearningPath result:', {
    success: activeResult.success,
    id: activeResult.data?.id,
    goal: activeResult.data?.goal,
    total_days: activeResult.data?.total_days,
    daysCount: activeResult.data?.days?.length,
  });

  if (!activeResult.success || !activeResult.data || activeResult.data.days?.length !== 3) {
    throw new Error('getActiveLearningPath did not return expected 3-day path');
  }

  // Step 3: Complete all 3 activities on Day 1
  const day1 = activeResult.data.days[0];
  await toggleLearningPathActivity(day1.id, 'learn', true);
  await toggleLearningPathActivity(day1.id, 'practice', true);
  const day1Final = await toggleLearningPathActivity(day1.id, 'review', true);

  console.log('3. Completed Day 1 activities result:', {
    success: day1Final.success,
    is_completed: day1Final.updatedDay?.is_completed,
    activities: day1Final.updatedDay?.activities_completed,
  });

  if (!day1Final.updatedDay?.is_completed) {
    throw new Error('Day 1 should be marked is_completed: true after learn, practice, review');
  }

  // Step 4: Check Dashboard Today's Section
  const todaySection = await getLearningPathTodaySection();
  console.log('4. getLearningPathTodaySection with 1 day done:', {
    currentDayNumber: todaySection.data?.currentDayNumber,
    completedDaysCount: todaySection.data?.completedDaysCount,
    overallProgress: todaySection.data?.overallProgress,
  });

  if (todaySection.data?.completedDaysCount !== 1 || todaySection.data?.overallProgress !== 33) {
    throw new Error('Progress computation mismatch: expected 1 completed day and 33% progress');
  }

  // Step 5: Test Archiving
  const archiveResult = await archiveLearningPath();
  console.log('5. archiveLearningPath result:', archiveResult);
  if (!archiveResult.success) {
    throw new Error('archiveLearningPath failed');
  }

  const afterArchive = await getActiveLearningPath();
  console.log('6. getActiveLearningPath after archive:', afterArchive.data);
  if (afterArchive.data !== null) {
    throw new Error('Expected null active learning path after archiving');
  }

  // Step 6: Test Flat Milestone list save
  const flatSaveResult = await saveRoadmapAsLearningPath({
    goal: 'Learn Docker and Kubernetes in 2 Steps',
    days: [
      {
        dayNumber: 1,
        topic: 'Docker Containers & Multi-stage Builds',
        learnContent: 'Containerization principles and Dockerfile best practices',
        practiceProblems: 2,
        reviewActivity: 'Review container security principles',
        aiEstimatedMinutes: 50,
        priority: 'MEDIUM',
      },
      {
        dayNumber: 2,
        topic: 'Kubernetes Pods & Deployments',
        learnContent: 'Declarative YAML manifests and service routing',
        practiceProblems: 2,
        reviewActivity: 'Verify rollout strategies',
        aiEstimatedMinutes: 60,
        priority: 'HIGH',
      },
    ],
  });

  console.log('7. Flat Milestone save result:', flatSaveResult);
  if (!flatSaveResult.success) {
    throw new Error('Flat milestone save failed');
  }

  const activeFlat = await getActiveLearningPath();
  console.log('8. Active flat path hydrated:', {
    goal: activeFlat.data?.goal,
    total_days: activeFlat.data?.total_days,
  });

  if (activeFlat.data?.total_days !== 2) {
    throw new Error('Expected 2 days for flat milestone plan');
  }

  console.log('--- All Learning Path Persistence & Workflow Tests Passed! ---');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
