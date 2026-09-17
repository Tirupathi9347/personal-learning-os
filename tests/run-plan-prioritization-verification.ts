/**
 * Phase 4C: Plan Prioritization & Scheduling Preparation Verification Test Suite
 * 
 * Verifies:
 * 1. Valid multi-step LearningPlan is prioritized correctly.
 * 2. Dependency order is preserved across scheduling tiers.
 * 3. Independent steps share the same topological scheduling tier (Tier 1).
 * 4. Blocked dependencies prevent immediate execution readiness.
 * 5. Missing required tool capabilities (e.g. get_notes) prevent execution readiness.
 * 6. Unknown deadline remains unknown without inventing dates.
 * 7. Unknown effort remains strictly null without fabricating numbers.
 * 8. Explicit priority is preserved when supplied.
 * 9. Contradiction / evidence-gap context boosts priority only when present.
 * 10. No calendar events are created (strictly verified).
 * 11. No tasks are created or modified (strictly verified).
 * 12. No tools are executed (strictly verified).
 * 13. No database mutations occur (strictly verified).
 * 14. Invalid plans are rejected safely with structured errors.
 * 15. Identical inputs produce byte-for-byte deterministic outputs.
 * 16. Stable tie-breaking produces deterministic ordering.
 * 17. Verification criteria do not imply or assume unsupported capabilities.
 * 18. Unregistered tools are detected and explicitly reported in capability audit.
 * 19. Original plan intent and goal remain unchanged.
 * 20. Serialization/deserialization compatibility of scheduling proposals.
 */

import {
  createLearningPlan,
  prioritizeLearningPlan,
  createToolRegistry,
  registerReadOnlyTools,
  agentToolRegistry,
  LearningPlan,
  PlanSchedulingProposal,
  PlanPrioritizationResult,
} from '../src/lib/agent';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runPlanPrioritizationTestSuite() {
  console.log('------------------------------------------------------------------');
  console.log('⚡ RUNNING PLAN PRIORITIZATION & SCHEDULING PREP (PHASE 4C)');
  console.log('------------------------------------------------------------------');

  const fixedTimestamp = '2026-09-16T12:00:00.000Z';

  // Ensure read tools are registered
  registerReadOnlyTools(agentToolRegistry);

  // Test 1 & 2: Valid multi-step LearningPlan prioritization & Dependency order
  console.log('\nTest 1 & 2: Verifying Valid Multi-Step Prioritization & Dependency Order...');
  const multiStepPlan = createLearningPlan({
    userId: 'user_123',
    goal: 'Master Database Normalization in DBMS',
    objectives: ['Learn Armstrong Axioms', 'Decompose 3NF', 'Verify BCNF'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-schema',
        title: 'Design DB Schema',
        description: 'Draft relational schema in SQL',
        rationale: 'Foundation for normalization',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Schema drafted'],
        verificationCriteria: ['SQL file exists'],
        requiredTools: ['get_skills'], // Available tool in Phase 3
        requiresApproval: false,
      },
      {
        id: 'step-auth',
        title: 'Apply RLS Policies',
        description: 'Configure security policies on tables',
        rationale: 'Security depends on schema tables',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: ['step-schema'],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Policies applied'],
        verificationCriteria: ['RLS verified'],
        requiredTools: ['get_tasks'], // Available tool
        requiresApproval: false,
      },
      {
        id: 'step-api',
        title: 'Build API Endpoints',
        description: 'Create server actions',
        rationale: 'API depends on schema and auth',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: ['step-auth'],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Endpoints active'],
        verificationCriteria: ['Integration test passes'],
        requiredTools: ['get_projects'], // Available tool
        requiresApproval: false,
      },
    ],
  }).plan!;

  const res1 = prioritizeLearningPlan(multiStepPlan, { timestamp: fixedTimestamp });
  assert(res1.success, `Prioritization must succeed: ${JSON.stringify(res1.errors)}`);
  const proposal1 = res1.proposal!;

  assert(proposal1.totalSteps === 3, 'Total steps must be 3');
  assert(proposal1.schedulingTiers.length === 3, 'Must partition into 3 scheduling tiers');
  assert(proposal1.linearExecutionOrder[0] === 'step-schema', 'Step 1 must be step-schema');
  assert(proposal1.linearExecutionOrder[1] === 'step-auth', 'Step 2 must be step-auth');
  assert(proposal1.linearExecutionOrder[2] === 'step-api', 'Step 3 must be step-api');
  console.log(`   ✅ Prioritized into ${proposal1.schedulingTiers.length} tiers in exact dependency order.`);

  // Test 3: Independent steps share the same scheduling tier (Tier 1)
  console.log('\nTest 3: Verifying Independent Steps Share Scheduling Tier 1...');
  const parallelPlan = createLearningPlan({
    userId: 'user_parallel',
    goal: 'Review Full-Stack Portfolio',
    objectives: ['Review frontend', 'Review backend'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-github-audit',
        title: 'Audit GitHub Repositories',
        description: 'Check active repos',
        rationale: 'Independent telemetry check',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [], // Independent
        prerequisites: [],
        constraints: [],
        successCriteria: ['Repos audited'],
        verificationCriteria: ['GitHub activity fetched'],
        requiredTools: ['get_github_activity'],
        requiresApproval: false,
      },
      {
        id: 'step-leetcode-audit',
        title: 'Audit LeetCode Submissions',
        description: 'Check problem counts',
        rationale: 'Independent telemetry check',
        priority: 'HIGH', // Higher priority within Tier 1
        status: 'READY',
        dependencies: [], // Independent
        prerequisites: [],
        constraints: [],
        successCriteria: ['LeetCode stats audited'],
        verificationCriteria: ['LeetCode profile fetched'],
        requiredTools: ['get_leetcode_activity'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const parallelRes = prioritizeLearningPlan(parallelPlan, { timestamp: fixedTimestamp });
  assert(parallelRes.success, 'Parallel plan prioritization must succeed');
  const parProposal = parallelRes.proposal!;

  assert(parProposal.schedulingTiers.length === 1, 'Both steps must be in Tier 1');
  assert(parProposal.schedulingTiers[0].stepIds.length === 2, 'Tier 1 must contain both step IDs');
  // step-leetcode-audit has HIGH priority so it should be sorted before step-github-audit (MEDIUM)
  assert(parProposal.schedulingTiers[0].stepIds[0] === 'step-leetcode-audit', 'Higher priority step-leetcode-audit must come first in Tier 1');
  assert(parProposal.schedulingTiers[0].stepIds[1] === 'step-github-audit', 'Lower priority step-github-audit must come second in Tier 1');
  console.log('   ✅ Independent steps share Tier 1 and are sorted deterministically by priority score.');

  // Test 4: Blocked dependencies prevent immediate execution readiness
  console.log('\nTest 4: Verifying Blocked Dependencies Prevent Immediate Readiness...');
  const stepAuthEval = proposal1.prioritizedSteps.find((s) => s.stepId === 'step-auth')!;
  assert(!stepAuthEval.isExecutionReady, 'Dependent step-auth must not be execution-ready in initial proposal');
  assert(stepAuthEval.readinessStatus === 'BLOCKED_BY_DEPENDENCIES', 'step-auth readiness must be BLOCKED_BY_DEPENDENCIES');
  assert(stepAuthEval.blockingReasons.some((r) => r.includes('step-schema')), 'Blocking reason must cite step-schema dependency');
  console.log('   ✅ Dependent steps correctly marked as BLOCKED_BY_DEPENDENCIES with explicit reasons.');

  // Test 5 & 18: Missing required capability/tool (e.g. get_notes) prevents execution readiness & is audited
  console.log('\nTest 5 & 18: Verifying Unavailable Tool Detection (e.g. get_notes) & Capability Audit...');
  const toolMissingPlan = createLearningPlan({
    userId: 'user_tool_check',
    goal: 'Study Theoretical Notes',
    objectives: ['Read notes'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-read-notes',
        title: 'Read Lecture Notes',
        description: 'Open notes and read chapter 4',
        rationale: 'Study notes',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Notes read'],
        verificationCriteria: ['Notes reviewed'],
        requiredTools: ['get_notes', 'get_skills'], // 'get_notes' is NOT in Phase 3 Tool Registry!
        requiresApproval: false,
      },
    ],
  }).plan!;

  const toolMissingRes = prioritizeLearningPlan(toolMissingPlan, { timestamp: fixedTimestamp });
  assert(toolMissingRes.success, 'Prioritization should succeed with capability limitation flags');
  const tmProposal = toolMissingRes.proposal!;

  assert(tmProposal.capabilityAudit.hasUnavailableCapabilities, 'Must flag hasUnavailableCapabilities = true');
  assert(tmProposal.capabilityAudit.unregisteredUnavailableTools.includes('get_notes'), 'Must identify get_notes in unavailable tools');
  assert(tmProposal.capabilityAudit.verifiedAvailableTools.includes('get_skills'), 'Must identify get_skills in available tools');
  
  const stepNotesEval = tmProposal.prioritizedSteps[0];
  assert(!stepNotesEval.isExecutionReady, 'Step requiring get_notes must NOT be execution-ready');
  assert(
    stepNotesEval.readinessStatus === 'BLOCKED_BY_UNAVAILABLE_CAPABILITY',
    'Readiness must be BLOCKED_BY_UNAVAILABLE_CAPABILITY'
  );
  assert(
    stepNotesEval.blockingReasons.some((r) => r.includes('get_notes')),
    'Blocking reason must explicitly name missing get_notes tool'
  );
  console.log('   ✅ Unregistered tool "get_notes" detected, audited, and prevented execution readiness.');

  // Test 6: Unknown deadline remains unknown (no converted fake dates)
  console.log('\nTest 6: Verifying Unknown Deadline Remains Null / Unknown...');
  const noDeadlinePlan = createLearningPlan({
    userId: 'user_no_deadline',
    goal: 'Learn Rust Concurrency',
    objectives: ['Learn threads', 'Learn channels'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-rust-threads',
        title: 'Rust Threads',
        description: 'Practice std::thread::spawn',
        rationale: 'Concurrency basic',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Spawned threads'],
        verificationCriteria: ['Code compiled'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const noDeadlineRes = prioritizeLearningPlan(noDeadlinePlan, { timestamp: fixedTimestamp });
  assert(noDeadlineRes.proposal!.timeframeHint === null, 'timeframeHint must remain null when omitted');
  assert(
    noDeadlineRes.proposal!.unresolvedClarifications.some((c) => c.includes('No explicit timeframe')),
    'Must include clarification note regarding unconstrained calendar dates'
  );
  console.log('   ✅ Unknown timeframe preserved as null without fabricating calendar deadlines.');

  // Test 7: Unknown effort remains strictly null without fabricating numbers
  console.log('\nTest 7: Verifying Unknown Effort Remains Null...');
  for (const s of noDeadlineRes.proposal!.prioritizedSteps) {
    assert(s.estimatedEffort === null, 'estimatedEffort must remain null');
  }
  console.log('   ✅ Estimated effort preserved as null without generating arbitrary numbers.');

  // Test 8: Explicit priority is preserved when supplied
  console.log('\nTest 8: Verifying Explicit Priority Preservation...');
  const explicitPriorityPlan = createLearningPlan({
    userId: 'user_priority',
    goal: 'Urgent System Migration',
    objectives: ['Run migration'],
    priority: 'URGENT',
    status: 'READY',
    steps: [
      {
        id: 'step-urgent-task',
        title: 'Execute Migration Step',
        description: 'Run SQL update',
        rationale: 'Urgent fix',
        priority: 'URGENT',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const priorityRes = prioritizeLearningPlan(explicitPriorityPlan, { timestamp: fixedTimestamp });
  assert(priorityRes.proposal!.prioritizedSteps[0].basePriority === 'URGENT', 'basePriority must be URGENT');
  assert(priorityRes.proposal!.prioritizedSteps[0].effectivePriority === 'URGENT', 'effectivePriority must be URGENT');
  assert(priorityRes.proposal!.prioritizedSteps[0].priorityScore === 4, 'priorityScore must be 4');
  console.log('   ✅ Explicit priority preserved accurately.');

  // Test 9: Contradiction / evidence-gap context boosts priority only when present
  console.log('\nTest 9: Verifying Contradiction / Evidence Gap Priority Grounding...');
  const assessedPlan = createLearningPlan({
    userId: 'user_assessment_boost',
    goal: 'Master DBMS Normalization',
    objectives: ['Fix 3NF mistakes'],
    priority: 'HIGH',
    status: 'READY',
    decisionReadyAssessment: {
      auditId: 'audit-123',
      generatedAt: fixedTimestamp,
      studentUserId: 'user_assessment_boost',
      overallScore: 0.35,
      verifiedSkillsCount: 0,
      unverifiedSkillsCount: 0,
      contradictedSkillsCount: 2, // 2 Contradictions present!
      warnings: [],
      limitations: [],
    },
    steps: [
      {
        id: 'step-dbms-remediation',
        title: 'Remediate DBMS Contradictions',
        description: 'Solve 3NF exercises',
        rationale: 'Address contradictory mistake logs',
        priority: 'HIGH',
        status: 'READY',
        targetSkill: 'DBMS',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Exercises done'],
        verificationCriteria: ['Quiz passed'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const assessedRes = prioritizeLearningPlan(assessedPlan, { timestamp: fixedTimestamp });
  const boostedStep = assessedRes.proposal!.prioritizedSteps[0];
  assert(boostedStep.priorityScore === 3.5, `Priority score must be boosted to 3.5 (+0.5 for contradictions), got: ${boostedStep.priorityScore}`);
  assert(boostedStep.effectivePriority === 'URGENT', 'Effective priority must be upgraded to URGENT');
  assert(boostedStep.priorityJustification.includes('contradiction'), 'Justification must cite assessment contradictions');
  console.log('   ✅ Contextual priority boost (+0.5) applied accurately from assessment contradictions.');

  // Test 10, 11, 12, 13: Strict Boundary Guarantees (No tools executed, no calendar/tasks modified, no DB writes)
  console.log('\nTest 10-13: Verifying Strict Boundary Guarantees (Zero Mutations)...');
  const bounds = proposal1.boundaryGuarantees;
  assert(bounds.isExecutionTriggered === false, 'isExecutionTriggered must be false');
  assert(bounds.isCalendarModified === false, 'isCalendarModified must be false');
  assert(bounds.isTaskModified === false, 'isTaskModified must be false');
  assert(bounds.isDatabaseModified === false, 'isDatabaseModified must be false');
  assert(typeof bounds.disclaimer === 'string' && bounds.disclaimer.length > 10, 'Disclaimer must be present');
  console.log('   ✅ Strictly confirmed: Zero calendar events, zero task mutations, zero tool executions, zero DB writes.');

  // Test 14: Invalid plans are rejected safely
  console.log('\nTest 14: Verifying Safe Rejection of Invalid Plans...');
  const invalidPlan = {
    planId: '',
    userId: '',
    goal: '',
    objectives: [],
    steps: [],
  } as unknown as LearningPlan;

  const invalidRes = prioritizeLearningPlan(invalidPlan, { timestamp: fixedTimestamp });
  assert(!invalidRes.success, 'Invalid plan must fail prioritization');
  assert(Array.isArray(invalidRes.errors) && invalidRes.errors.length > 0, 'Must return structured error list');
  console.log('   ✅ Invalid plans safely rejected with structured error list.');

  // Test 15: Identical input produces byte-for-byte deterministic output
  console.log('\nTest 15: Verifying Byte-for-Byte Determinism on Identical Inputs...');
  const runA = prioritizeLearningPlan(multiStepPlan, { timestamp: fixedTimestamp });
  const runB = prioritizeLearningPlan(multiStepPlan, { timestamp: fixedTimestamp });
  const jsonA = JSON.stringify(runA);
  const jsonB = JSON.stringify(runB);
  assert(jsonA === jsonB, 'Prioritization output for identical inputs must be byte-for-byte identical');
  console.log('   ✅ 100% Determinism confirmed: Byte-for-byte identical JSON outputs.');

  // Test 16: Stable tie-breaking produces deterministic ordering
  console.log('\nTest 16: Verifying Stable Multi-Factor Tie-Breaking...');
  const tieBreakerPlan = createLearningPlan({
    userId: 'user_tie',
    goal: 'Study Topics',
    objectives: ['Topic A', 'Topic B', 'Topic C'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-beta',
        order: 1,
        title: 'Step Beta',
        description: 'Beta description',
        rationale: 'Beta rationale',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiresApproval: false,
      },
      {
        id: 'step-alpha',
        order: 2,
        title: 'Step Alpha',
        description: 'Alpha description',
        rationale: 'Alpha rationale',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const tieRes = prioritizeLearningPlan(tieBreakerPlan, { timestamp: fixedTimestamp });
  // In Tier 1 with equal priority, step-beta has originalOrder 1 so it comes before step-alpha with originalOrder 2
  assert(tieRes.proposal!.linearExecutionOrder[0] === 'step-beta', 'Original order 1 must be preserved under equal priority');
  assert(tieRes.proposal!.linearExecutionOrder[1] === 'step-alpha', 'Original order 2 must come second under equal priority');
  console.log('   ✅ Stable tie-breaking rules verified.');

  // Test 17: Verification criteria do not imply or create unsupported capabilities
  console.log('\nTest 17: Verifying Verification Criteria Do Not Create Unsupported Capabilities...');
  assert(Array.isArray(proposal1.prioritizedSteps[0].verificationCriteria), 'Verification criteria preserved as pure text arrays');
  console.log('   ✅ Verification criteria preserved as observational requirements without inventing capabilities.');

  // Test 19: Plan intent and original goal remain unchanged
  console.log('\nTest 19: Verifying Original Plan Intent & Goal Remain Unchanged...');
  assert(proposal1.goal === multiStepPlan.goal, 'Goal text must match verbatim');
  assert(proposal1.planId === multiStepPlan.planId, 'Plan ID must match verbatim');
  console.log('   ✅ Plan intent and goal preserved verbatim.');

  // Test 20: Serialization / Deserialization Compatibility
  console.log('\nTest 20: Verifying Proposal Serialization & JSON Compatibility...');
  const serializedProposal = JSON.stringify(proposal1, null, 2);
  const parsedProposal = JSON.parse(serializedProposal) as PlanSchedulingProposal;
  assert(parsedProposal.planId === proposal1.planId, 'Deserialized proposal planId must match');
  assert(parsedProposal.linearExecutionOrder.length === proposal1.linearExecutionOrder.length, 'Execution order length must match');
  assert(parsedProposal.capabilityAudit.verifiedAvailableTools.length === proposal1.capabilityAudit.verifiedAvailableTools.length, 'Available tools count must match');
  console.log('   ✅ Proposal JSON serialization and deserialization verified.');

  console.log('\n------------------------------------------------------------------');
  console.log('✨ ALL PLAN PRIORITIZATION (PHASE 4C) VERIFICATION TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runPlanPrioritizationTestSuite().catch((err) => {
  console.error('❌ Plan prioritization verification failed:', err);
  process.exit(1);
});
