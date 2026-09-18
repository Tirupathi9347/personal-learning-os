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

import { runStudentGoalOrchestrator } from '../src/app/actions/agent-actions';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    throw new Error(msg);
  }
  console.log(`  [PASS] ${msg}`);
}

async function run() {
  console.log('=== VERIFYING ADAPTIVE DSA INTERVIEW ROADMAP GENERATION ===\n');
  console.log('Goal: "I want to prepare DSA for technical interviews."\n');

  const result = await runStudentGoalOrchestrator('I want to prepare DSA for technical interviews.');

  assert(result.success, 'Orchestrator run succeeded');
  assert(Boolean(result.learningPlan), 'Learning plan generated');
  assert(Boolean(result.learningDecision), 'Learning decision generated');

  const decision = result.learningDecision as any;
  const assessment = result.studentAssessment as any;
  const plan = result.learningPlan as any;

  console.log('Decision Type:', decision?.decisionType);
  console.log('Rationale:', decision?.rationale);
  console.log('Total Plan Steps:', plan?.steps?.length);

  assert(decision?.decisionType === 'PREPARE_FOR_ASSESSMENT', `Decision type must be PREPARE_FOR_ASSESSMENT (got ${decision?.decisionType})`);
  assert(plan?.steps?.length === 7, `Must generate 7-day adaptive roadmap (got ${plan?.steps?.length})`);

  // Verify Day-by-Day topics focus on student's actual gaps and weak areas
  const stepTitles = plan.steps.map((s: any) => s.title);
  console.log('\nGenerated Roadmap Steps:');
  plan.steps.forEach((s: any, idx: number) => {
    console.log(`  Day ${idx + 1}: ${s.title}`);
    console.log(`    Rationale: ${s.rationale}`);
    console.log(`    Target Skill: ${s.targetSkill}`);
  });

  // Day 1: Linked Lists remediation
  assert(
    stepTitles[0].toLowerCase().includes('linked list'),
    'Day 1 focuses on Linked Lists remediation (targeting pointer null bug)'
  );

  // Day 2: Binary Trees remediation
  assert(
    stepTitles[1].toLowerCase().includes('binary tree'),
    'Day 2 focuses on Binary Trees remediation (targeting recursion stack overflow bug)'
  );

  // Day 3: Advanced Tree Patterns (gap)
  assert(
    stepTitles[2].toLowerCase().includes('advanced tree') || stepTitles[2].toLowerCase().includes('bfs') || stepTitles[2].toLowerCase().includes('tree'),
    'Day 3 bridges Advanced Tree Patterns gap (BFS, LCA)'
  );

  // Day 4: Dynamic Programming (gap)
  assert(
    stepTitles[3].toLowerCase().includes('dynamic programming'),
    'Day 4 bridges 1D Dynamic Programming gap'
  );

  // Day 5: Dynamic Programming 2D (gap)
  assert(
    stepTitles[4].toLowerCase().includes('dynamic programming') || stepTitles[4].toLowerCase().includes('2d'),
    'Day 5 bridges 2D Dynamic Programming & Knapsack gap'
  );

  // Day 6: Mixed practice leveraging mastered arrays/strings
  assert(
    stepTitles[5].toLowerCase().includes('speed') || stepTitles[5].toLowerCase().includes('practice') || stepTitles[5].toLowerCase().includes('mixed'),
    'Day 6 tests mixed problem velocity'
  );

  // Day 7: Interview simulation
  assert(
    stepTitles[6].toLowerCase().includes('simulation') || stepTitles[6].toLowerCase().includes('interview'),
    'Day 7 conducts full technical interview simulation'
  );

  // Verify structured assessment categories
  console.log('\n--- Structured Assessment State ---');
  console.log('Already Demonstrated:', assessment?.alreadyDemonstrated || assessment?.supportedStrengths);
  console.log('Needs Reinforcement:', assessment?.needsReinforcement);
  console.log('New Learning / Gaps:', assessment?.newLearning || assessment?.evidenceGaps);

  assert(
    Boolean(assessment?.supportedStrengths?.some((s: string) => s.toLowerCase().includes('array'))),
    'Assessment identifies Arrays in supported strengths / already demonstrated'
  );
  assert(
    Boolean(assessment?.supportedStrengths?.some((s: string) => s.toLowerCase().includes('string'))),
    'Assessment identifies Strings in supported strengths / already demonstrated'
  );
  assert(
    Boolean(assessment?.needsReinforcement?.some((s: string) => s.toLowerCase().includes('linked list')) ||
            assessment?.contradictedAreas?.some((s: string) => s.toLowerCase().includes('linked list'))),
    'Assessment identifies Linked Lists in needs reinforcement (contradicted/remediation)'
  );
  assert(
    Boolean(assessment?.needsReinforcement?.some((s: string) => s.toLowerCase().includes('tree')) ||
            assessment?.contradictedAreas?.some((s: string) => s.toLowerCase().includes('tree'))),
    'Assessment identifies Binary Trees in needs reinforcement (contradicted/remediation)'
  );
  assert(
    Boolean(assessment?.evidenceGaps?.some((s: string) => s.toLowerCase().includes('dynamic programming'))),
    'Assessment identifies Dynamic Programming in new learning / insufficient evidence gaps'
  );
  assert(
    Boolean(assessment?.evidenceGaps?.some((s: string) => s.toLowerCase().includes('advanced tree'))),
    'Assessment identifies Advanced Tree Patterns in new learning / insufficient evidence gaps'
  );

  // Verify plan metadata & prerequisites
  assert(
    Boolean(plan?.metadata?.alreadyDemonstrated?.length > 0),
    'Plan metadata explicitly exposes alreadyDemonstrated array for UI'
  );
  assert(
    Boolean(plan?.metadata?.needsReinforcement?.length > 0),
    'Plan metadata explicitly exposes needsReinforcement array for UI'
  );
  assert(
    Boolean(plan?.metadata?.newLearningOrInsufficientEvidence?.length > 0),
    'Plan metadata explicitly exposes newLearningOrInsufficientEvidence array for UI'
  );
  assert(
    Boolean(plan?.prerequisites?.some((p: string) => p.toLowerCase().includes('array') || p.toLowerCase().includes('string'))),
    'Plan prerequisites preserve already demonstrated strengths as foundational baseline'
  );

  // Verify rich step schema fields
  const day1 = plan.steps[0];
  assert(Boolean(day1.metadata?.learningObjective), 'Step 1 exposes learningObjective in metadata');
  assert(Boolean(day1.metadata?.targetSkill), 'Step 1 exposes targetSkill in metadata');
  assert(Boolean(day1.metadata?.whySelected), 'Step 1 exposes whySelected in metadata');
  assert(Boolean(day1.metadata?.expectedOutcome), 'Step 1 exposes expectedOutcome in metadata');
  assert(Boolean(day1.metadata?.practiceActivity), 'Step 1 exposes practiceActivity in metadata');
  assert(Boolean(day1.verificationCriteria?.length > 0), 'Step 1 exposes verificationCriteria');

  // Verify Learning Path Integration
  console.log('\n--- Verifying Learning Path Persistence Flow ---');
  const { saveRoadmapAsLearningPath, getActiveLearningPath } = await import('../src/app/actions/learning-path-actions');
  const formattedDays = plan.steps.map((step: any, sIdx: number) => {
    const meta = (step.metadata as Record<string, any>) || {};
    return {
      dayNumber: meta.dayNumber || sIdx + 1,
      topic: meta.topic || step.title,
      learnContent: meta.learningObjective || step.description,
      practiceProblems: meta.practiceProblems || 4,
      reviewActivity: meta.reviewActivity || 'Review notes',
      aiEstimatedMinutes: meta.aiEstimatedMinutes || step.estimatedEffort?.estimatedMinutes || 60,
      priority: step.priority || 'HIGH',
      evidenceRationale: meta.whySelected || step.rationale,
    };
  });

  const saveRes = await saveRoadmapAsLearningPath({
    goal: plan.goal || 'I want to prepare DSA for technical interviews.',
    days: formattedDays,
    planMetadata: {
      planId: plan.planId,
      priority: plan.priority,
      alreadyDemonstrated: plan.metadata?.alreadyDemonstrated,
      needsReinforcement: plan.metadata?.needsReinforcement,
      newLearningOrInsufficientEvidence: plan.metadata?.newLearningOrInsufficientEvidence,
      source: 'LearningCoach',
    },
  });

  assert(saveRes.success, 'Plan successfully saved to Learning Path through existing flow');
  assert(Boolean(saveRes.pathId), 'Returned valid Learning Path ID');

  const activePathRes = await getActiveLearningPath();
  assert(activePathRes.success && Boolean(activePathRes.data), 'Active Learning Path retrieved from database/store');
  assert(activePathRes.data?.days?.length === 7, `Active Learning Path has 7 structured days (got ${activePathRes.data?.days?.length})`);

  console.log('\n🎉 ALL ADAPTIVE DSA INTERVIEW ROADMAP ASSERTIONS PASSED!');
}

run().catch((err) => {
  console.error('Test execution failure:', err);
  process.exit(1);
});
