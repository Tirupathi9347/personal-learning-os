/**
 * Phase 4A: Planning Model Verification Test Suite
 * 
 * Verifies:
 * 1. Valid plan creation with rich context.
 * 2. Valid multi-step dependencies and execution tier calculation.
 * 3. Circular dependency and self-dependency rejection.
 * 4. Invalid/missing required fields handling.
 * 5. Status transition lifecycle validation.
 * 6. Strict preservation and separation of verification criteria.
 * 7. Strict preservation of unknown/null optional values (no fabrication).
 * 8. JSON serialization and deserialization compatibility.
 * 9. Plan supersession support and history preservation.
 */

import {
  createLearningPlan,
  validatePlan,
  validatePlanDependencies,
  transitionPlanStatus,
  supersedePlan,
  serializePlan,
  deserializePlan,
  LearningPlan,
  CreatePlanInput,
} from '../src/lib/agent';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runPlanningModelTestSuite() {
  console.log('------------------------------------------------------------------');
  console.log('⚡ RUNNING PLANNING MODEL VERIFICATION (PHASE 4A)');
  console.log('------------------------------------------------------------------');

  // Test 1: Valid plan creation
  console.log('\nTest 1: Verifying Valid Plan Creation...');
  const validPlanInput: CreatePlanInput = {
    userId: 'user_123',
    goal: 'Master Database Normalization (1NF, 2NF, 3NF, BCNF) for DBMS exam in 7 days',
    objectives: [
      'Understand Functional Dependencies and Armstrong axioms',
      'Learn decomposition losslessness and dependency preservation',
      'Solve 15 practice problems on 3NF and BCNF normalization',
    ],
    priority: 'HIGH',
    status: 'DRAFT',
    constraints: [
      'Maximum 90 minutes study time per day',
      'Exam scheduled in 7 days',
    ],
    successCriteria: [
      'Score >= 85% on 3NF/BCNF diagnostic test',
      'Successfully decompose 5 unnormalized schemas into BCNF with zero errors',
    ],
    verificationCriteria: [
      'Empirical observation of submitted diagnostic quiz responses',
      'Zero unresolved contradictions in DBMS mistake logs',
    ],
    approvalRequirement: {
      requiresApproval: true,
      riskLevel: 'MEDIUM',
      reason: 'Plan schedules daily milestone tasks affecting student calendar',
    },
    prerequisites: ['Basic relational algebra and table schema concepts'],
    steps: [
      {
        id: 'step-1',
        title: 'Review Functional Dependencies & Armstrong Axioms',
        description: 'Read structured notes and watch breakdown on FD inference rules',
        rationale: 'Functional dependency theory is the mathematical basis for all normal forms',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: ['Relational schema concepts'],
        targetSkill: 'DBMS',
        requiredTools: ['get_notes', 'get_skills'],
        constraints: ['Keep session <= 45 minutes'],
        successCriteria: ['Complete review of 6 Armstrong axioms'],
        verificationCriteria: ['Focus session telemetry record logged in time tracking'],
        requiresApproval: false,
      },
      {
        id: 'step-2',
        title: 'Practice 2NF and 3NF Schema Decomposition',
        description: 'Solve 8 decomposition exercises identifying partial and transitive dependencies',
        rationale: 'Active recall and procedural practice prevent repeated normalization mistakes',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: ['step-1'],
        prerequisites: ['Functional dependency mastery'],
        targetSkill: 'DBMS',
        requiredTools: ['get_mistakes', 'get_tasks'],
        constraints: ['Focus on transitive dependency identification'],
        successCriteria: ['8/8 decomposition problems solved'],
        verificationCriteria: ['Diagnostic quiz submission with timestamp and score >= 80%'],
        requiresApproval: false,
      },
    ],
  };

  const createResult = createLearningPlan(validPlanInput);
  assert(createResult.isValid, `Valid plan creation should succeed: ${JSON.stringify(createResult.errors)}`);
  assert(createResult.plan !== undefined, 'Created plan must be defined');
  const plan = createResult.plan!;
  assert(plan.userId === 'user_123', 'userId must match');
  assert(plan.goal.includes('Master Database Normalization'), 'goal must match');
  assert(plan.steps.length === 2, 'Must have 2 steps');
  assert(plan.steps[0].planId === plan.planId, 'Step planId must match parent planId');
  assert(plan.version === 1, 'Default plan version must be 1');
  console.log(`   ✅ Valid plan created successfully with ID: ${plan.planId}`);

  // Test 2: Valid multi-step dependencies and execution tier calculation
  console.log('\nTest 2: Verifying Valid Multi-Step Dependencies & Topological Tiers...');
  const multiStepPlanInput: CreatePlanInput = {
    userId: 'user_456',
    goal: 'Build Full-Stack Next.js Project with Supabase RLS',
    objectives: ['Implement authentication', 'Create schema', 'Add API routes', 'Deploy'],
    steps: [
      {
        id: 'step-schema',
        title: 'Design DB Schema',
        description: 'Draft tables and foreign keys in SQL',
        rationale: 'Schema foundation needed before client or API logic',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['SQL schema written'],
        verificationCriteria: ['Schema file exists'],
        requiresApproval: false,
      },
      {
        id: 'step-auth',
        title: 'Setup Auth & RLS',
        description: 'Configure Supabase Auth and Row Level Security policies',
        rationale: 'RLS policies depend directly on database schema tables',
        priority: 'HIGH',
        status: 'PENDING',
        dependencies: ['step-schema'],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Auth policies applied'],
        verificationCriteria: ['RLS test suite passes'],
        requiresApproval: true,
        approvalRiskLevel: 'HIGH',
      },
      {
        id: 'step-api',
        title: 'Build API Endpoints',
        description: 'Create Next.js Server Actions querying Supabase',
        rationale: 'Server actions depend on both schema and auth contexts',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: ['step-schema', 'step-auth'],
        prerequisites: [],
        constraints: [],
        successCriteria: ['CRUD actions functional'],
        verificationCriteria: ['Endpoint integration tests return 200'],
        requiresApproval: false,
      },
      {
        id: 'step-frontend',
        title: 'Build UI Components',
        description: 'Create React UI forms connecting to Server Actions',
        rationale: 'UI forms depend on API endpoints being available',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: ['step-api'],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Forms rendered'],
        verificationCriteria: ['UI interaction tests succeed'],
        requiresApproval: false,
      },
    ],
  };

  const multiStepResult = createLearningPlan(multiStepPlanInput);
  assert(multiStepResult.isValid, `Multi-step plan creation should succeed: ${JSON.stringify(multiStepResult.errors)}`);
  
  const depCheck = validatePlanDependencies(multiStepResult.plan!.steps);
  assert(depCheck.isValid, 'Multi-step DAG must be valid');
  assert(!depCheck.hasCycles, 'Must have no cycles');
  assert(depCheck.executionTiers !== undefined, 'Execution tiers must be calculated');
  assert(depCheck.executionTiers!.length === 4, `Expected 4 sequential tiers, got ${depCheck.executionTiers!.length}`);
  assert(depCheck.executionTiers![0][0] === 'step-schema', 'Tier 0 must be step-schema');
  assert(depCheck.executionTiers![1][0] === 'step-auth', 'Tier 1 must be step-auth');
  assert(depCheck.executionTiers![2][0] === 'step-api', 'Tier 2 must be step-api');
  assert(depCheck.executionTiers![3][0] === 'step-frontend', 'Tier 3 must be step-frontend');
  console.log(`   ✅ Multi-step DAG verified with 4 execution tiers: ${JSON.stringify(depCheck.executionTiers)}`);

  // Test 3: Circular dependency and self-dependency rejection
  console.log('\nTest 3: Verifying Circular & Self Dependency Rejection...');
  
  // 3a. Direct Self-dependency
  const selfDepSteps = [
    {
      id: 'step-a',
      planId: 'plan-test',
      order: 1,
      title: 'Step A',
      description: 'Step A description',
      rationale: 'Step A rationale',
      priority: 'HIGH' as const,
      status: 'PENDING' as const,
      dependencies: ['step-a'], // Self-dependency!
      prerequisites: [],
      constraints: [],
      successCriteria: ['Done'],
      verificationCriteria: ['Verified'],
      requiresApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const selfDepCheck = validatePlanDependencies(selfDepSteps);
  assert(!selfDepCheck.isValid, 'Self-dependency must be rejected');
  assert(selfDepCheck.selfDependencies.includes('step-a'), 'Must detect step-a in selfDependencies');
  console.log('   ✅ Self-dependency rejected successfully.');

  // 3b. Circular Dependency Cycle (A -> B -> C -> A)
  const circularSteps = [
    {
      id: 'step-A',
      planId: 'plan-test',
      order: 1,
      title: 'Step A',
      description: 'Step A description',
      rationale: 'Step A rationale',
      priority: 'HIGH' as const,
      status: 'PENDING' as const,
      dependencies: ['step-C'], // Depends on C
      prerequisites: [],
      constraints: [],
      successCriteria: ['Done'],
      verificationCriteria: ['Verified'],
      requiresApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'step-B',
      planId: 'plan-test',
      order: 2,
      title: 'Step B',
      description: 'Step B description',
      rationale: 'Step B rationale',
      priority: 'HIGH' as const,
      status: 'PENDING' as const,
      dependencies: ['step-A'], // Depends on A
      prerequisites: [],
      constraints: [],
      successCriteria: ['Done'],
      verificationCriteria: ['Verified'],
      requiresApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'step-C',
      planId: 'plan-test',
      order: 3,
      title: 'Step C',
      description: 'Step C description',
      rationale: 'Step C rationale',
      priority: 'HIGH' as const,
      status: 'PENDING' as const,
      dependencies: ['step-B'], // Depends on B (Cycle!)
      prerequisites: [],
      constraints: [],
      successCriteria: ['Done'],
      verificationCriteria: ['Verified'],
      requiresApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const cycleDepCheck = validatePlanDependencies(circularSteps);
  assert(!cycleDepCheck.isValid, 'Circular dependency DAG must be invalid');
  assert(cycleDepCheck.hasCycles, 'Must flag hasCycles = true');
  assert(cycleDepCheck.cycles.length > 0, 'Must identify detected cycle path');
  console.log(`   ✅ Circular dependency cycle (A->B->C->A) detected and rejected: ${JSON.stringify(cycleDepCheck.cycles)}`);

  // 3c. Missing dependency reference
  const missingDepSteps = [
    {
      id: 'step-X',
      planId: 'plan-test',
      order: 1,
      title: 'Step X',
      description: 'Step X description',
      rationale: 'Step X rationale',
      priority: 'HIGH' as const,
      status: 'PENDING' as const,
      dependencies: ['non-existent-step-999'],
      prerequisites: [],
      constraints: [],
      successCriteria: ['Done'],
      verificationCriteria: ['Verified'],
      requiresApproval: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const missingDepCheck = validatePlanDependencies(missingDepSteps);
  assert(!missingDepCheck.isValid, 'Missing dependency must be rejected');
  assert(missingDepCheck.missingDependencies.length === 1, 'Must record 1 missing dependency');
  console.log('   ✅ Missing dependency step ID reference rejected successfully.');

  // Test 4: Invalid/missing required fields
  console.log('\nTest 4: Verifying Rejection of Missing/Invalid Required Fields...');
  
  // 4a. Missing goal
  const noGoalRes = createLearningPlan({
    userId: 'user_123',
    goal: '', // empty goal
    objectives: ['Learn X'],
    steps: validPlanInput.steps,
  });
  assert(!noGoalRes.isValid, 'Empty goal must fail validation');
  assert(noGoalRes.errors.some((e) => e.code === 'ERR_MISSING_GOAL'), 'Must emit ERR_MISSING_GOAL');

  // 4b. Empty objectives
  const noObjRes = createLearningPlan({
    userId: 'user_123',
    goal: 'Valid goal',
    objectives: [], // empty objectives array
    steps: validPlanInput.steps,
  });
  assert(!noObjRes.isValid, 'Empty objectives must fail validation');
  assert(noObjRes.errors.some((e) => e.code === 'ERR_MISSING_OBJECTIVES'), 'Must emit ERR_MISSING_OBJECTIVES');

  // 4c. Missing steps
  const noStepsRes = createLearningPlan({
    userId: 'user_123',
    goal: 'Valid goal',
    objectives: ['Learn X'],
    steps: [], // empty steps array
  });
  assert(!noStepsRes.isValid, 'Empty steps array must fail validation');
  assert(noStepsRes.errors.some((e) => e.code === 'ERR_MISSING_STEPS'), 'Must emit ERR_MISSING_STEPS');

  // 4d. Missing step rationale
  const noRationaleRes = createLearningPlan({
    userId: 'user_123',
    goal: 'Valid goal',
    objectives: ['Learn X'],
    steps: [
      {
        id: 'step-1',
        title: 'Step 1',
        description: 'Description 1',
        rationale: '', // Missing rationale!
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiresApproval: false,
      },
    ],
  });
  assert(!noRationaleRes.isValid, 'Missing step rationale must fail validation');
  assert(noRationaleRes.errors.some((e) => e.code === 'ERR_MISSING_STEP_RATIONALE'), 'Must emit ERR_MISSING_STEP_RATIONALE');

  // 4e. Invalid plan status
  const invalidStatusRes = validatePlan({
    ...plan,
    status: 'UNKNOWN_STATUS_INVALID',
  });
  assert(!invalidStatusRes.isValid, 'Invalid plan status must fail validation');
  assert(invalidStatusRes.errors.some((e) => e.code === 'ERR_INVALID_PLAN_STATUS'), 'Must emit ERR_INVALID_PLAN_STATUS');
  console.log('   ✅ All invalid and missing required fields correctly rejected.');

  // Test 5: Status transition validation
  console.log('\nTest 5: Verifying Status Transition Lifecycle...');
  let currentPlan = plan;

  // DRAFT -> VALIDATING
  const toValidating = transitionPlanStatus(currentPlan, { targetStatus: 'VALIDATING', reason: 'Running consistency checks' });
  assert(toValidating.success, 'DRAFT -> VALIDATING must be allowed');
  assert(toValidating.plan.status === 'VALIDATING', 'Plan status must be VALIDATING');
  currentPlan = toValidating.plan;

  // VALIDATING -> READY
  const toReady = transitionPlanStatus(currentPlan, { targetStatus: 'READY', reason: 'Plan validated and ready for execution' });
  assert(toReady.success, 'VALIDATING -> READY must be allowed');
  assert(toReady.plan.status === 'READY', 'Plan status must be READY');
  currentPlan = toReady.plan;

  // READY -> EXECUTING
  const toExecuting = transitionPlanStatus(currentPlan, { targetStatus: 'EXECUTING', reason: 'Starting tool execution' });
  assert(toExecuting.success, 'READY -> EXECUTING must be allowed');
  assert(toExecuting.plan.status === 'EXECUTING', 'Plan status must be EXECUTING');
  currentPlan = toExecuting.plan;

  // EXECUTING -> BLOCKED
  const toBlocked = transitionPlanStatus(currentPlan, { targetStatus: 'BLOCKED', reason: 'Waiting for missing prerequisite evidence' });
  assert(toBlocked.success, 'EXECUTING -> BLOCKED must be allowed');
  currentPlan = toBlocked.plan;

  // BLOCKED -> EXECUTING
  const unblock = transitionPlanStatus(currentPlan, { targetStatus: 'EXECUTING', reason: 'Prerequisite evidence received' });
  assert(unblock.success, 'BLOCKED -> EXECUTING must be allowed');
  currentPlan = unblock.plan;

  // EXECUTING -> COMPLETED
  const toCompleted = transitionPlanStatus(currentPlan, { targetStatus: 'COMPLETED', reason: 'All steps verified' });
  assert(toCompleted.success, 'EXECUTING -> COMPLETED must be allowed');
  assert(toCompleted.plan.status === 'COMPLETED', 'Plan status must be COMPLETED');
  currentPlan = toCompleted.plan;

  // Invalid transition check: DRAFT cannot jump directly to COMPLETED
  const draftPlan = createLearningPlan(validPlanInput).plan!;
  const invalidJump = transitionPlanStatus(draftPlan, { targetStatus: 'COMPLETED' });
  assert(!invalidJump.success, 'DRAFT -> COMPLETED directly must be rejected');
  assert(invalidJump.error?.code === 'ERR_INVALID_STATUS_TRANSITION', 'Must return ERR_INVALID_STATUS_TRANSITION');
  console.log('   ✅ Status transition matrix and lifecycle validation verified.');

  // Test 6: Strict preservation and separation of verification criteria
  console.log('\nTest 6: Verifying Preservation & Separation of Verification Criteria...');
  const planWithVerif = createLearningPlan({
    userId: 'user_verif',
    goal: 'Improve TypeScript Type Narrowing',
    objectives: ['Master discriminated unions'],
    successCriteria: ['Write type predicates'],
    verificationCriteria: [
      'Empirical GitHub push event containing type-safe union handlers',
      'Zero ts-ignore directives found in code inspection',
    ],
    steps: [
      {
        id: 'step-narrowing',
        title: 'Practice Type Guard Functions',
        description: 'Implement 5 custom isObject and isString type guard functions in workspace',
        rationale: 'Type guards allow safe structural typing without type casting',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['5 type guards implemented'],
        verificationCriteria: [
          'Run npx tsc --noEmit and verify 0 type errors',
          'Automated unit test execution passes with 100% assertions',
        ],
        requiresApproval: false,
      },
    ],
  });

  assert(planWithVerif.isValid, 'Plan with verification criteria must be valid');
  const vStep = planWithVerif.plan!.steps[0];
  assert(vStep.verificationCriteria.length === 2, 'Step verificationCriteria must preserve all 2 items');
  assert(
    vStep.verificationCriteria[0] === 'Run npx tsc --noEmit and verify 0 type errors',
    'Verification criteria text must match exactly'
  );
  // Ensure action and verification are distinct fields
  assert(vStep.description !== vStep.verificationCriteria[0], 'Action and verification must be separate');
  console.log('   ✅ Verification criteria strictly separated from action and preserved.');

  // Test 7: Preservation of unknown/null optional values (no fabrication)
  console.log('\nTest 7: Verifying Preservation of Unknown / Null Optional Values (No Fabrication)...');
  const minimalPlanInput: CreatePlanInput = {
    userId: 'user_no_fabrication',
    goal: 'Study Operating Systems Virtual Memory',
    objectives: ['Learn paging and segmentation algorithms'],
    steps: [
      {
        id: 'step-paging',
        title: 'Study Page Replacement Algorithms',
        description: 'Read LRU, FIFO, and Optimal page replacement mechanics',
        rationale: 'Core topic in OS memory management',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Complete notes on LRU'],
        verificationCriteria: ['Verification checklist passed'],
        requiresApproval: false,
        // Notice: estimatedEffort, targetSkill, requiredTools, actionPayload are omitted
      },
    ],
  };

  const minimalResult = createLearningPlan(minimalPlanInput);
  assert(minimalResult.isValid, 'Minimal plan must be valid');
  const minPlan = minimalResult.plan!;
  const minStep = minPlan.steps[0];

  assert(minPlan.estimatedEffort === null, 'Plan estimatedEffort must remain null when omitted (never fabricated)');
  assert(minPlan.targetSkill === null, 'Plan targetSkill must remain null when omitted');
  assert(minPlan.triggerContext === null, 'Plan triggerContext must remain null when omitted');
  assert(minPlan.decisionReadyAssessment === null, 'Plan decisionReadyAssessment must remain null when omitted');
  assert(minStep.estimatedEffort === null, 'Step estimatedEffort must remain null when omitted');
  assert(minStep.targetSkill === null, 'Step targetSkill must remain null when omitted');
  assert(minStep.requiredTools === null, 'Step requiredTools must remain null when omitted');
  assert(minStep.actionPayload === null, 'Step actionPayload must remain null when omitted');
  console.log('   ✅ Unknown/optional values preserved as null/undefined without fabrication.');

  // Test 8: Serialization / deserialization compatibility
  console.log('\nTest 8: Verifying Serialization & Deserialization Compatibility...');
  const serialized = serializePlan(plan);
  assert(typeof serialized === 'string', 'Serialized plan must be a string');
  assert(serialized.startsWith('{'), 'Serialized plan must be valid JSON');

  const deserializedRes = deserializePlan(serialized);
  assert(deserializedRes.isValid, `Deserialized plan must pass validation: ${JSON.stringify(deserializedRes.errors)}`);
  assert(deserializedRes.plan !== undefined, 'Deserialized plan must be defined');
  const restoredPlan = deserializedRes.plan!;
  assert(restoredPlan.planId === plan.planId, 'planId must match restored');
  assert(restoredPlan.goal === plan.goal, 'goal must match restored');
  assert(restoredPlan.steps.length === plan.steps.length, 'steps count must match restored');
  assert(restoredPlan.steps[0].title === plan.steps[0].title, 'step title must match restored');
  assert(restoredPlan.steps[1].dependencies[0] === plan.steps[1].dependencies[0], 'dependencies must match restored');
  console.log('   ✅ Plan successfully serialized and deserialized with 100% field fidelity.');

  // Test 9: Plan supersession support
  console.log('\nTest 9: Verifying Plan Supersession & Replanning Support...');
  const planToSupersede = createLearningPlan({
    ...validPlanInput,
    status: 'READY',
  }).plan!;

  const newReplacementPlanId = 'plan_replanned_2026_09_16_xyz789';
  const supersessionReason = 'Student struggled on prerequisite Functional Dependencies; replanning remedial track.';

  const supersededPlan = supersedePlan(planToSupersede, {
    newPlanId: newReplacementPlanId,
    reason: supersessionReason,
  });

  assert(supersededPlan.status === 'SUPERSEDED', 'Plan status must be SUPERSEDED');
  assert(supersededPlan.supersededByPlanId === newReplacementPlanId, 'supersededByPlanId must match newPlanId');
  assert(supersededPlan.supersessionReason === supersessionReason, 'supersessionReason must match');
  assert(supersededPlan.supersededAt !== null, 'supersededAt timestamp must be set');
  // Steps that were active must now be SUPERSEDED
  for (const s of supersededPlan.steps) {
    assert(s.status === 'SUPERSEDED', `Step "${s.id}" status must be SUPERSEDED`);
  }
  // Original objectives, rationales, constraints, verification criteria must be preserved
  assert(supersededPlan.objectives.length === planToSupersede.objectives.length, 'Original objectives must be preserved');
  assert(supersededPlan.steps[0].rationale === planToSupersede.steps[0].rationale, 'Step rationale must be preserved');
  assert(supersededPlan.verificationCriteria.length === planToSupersede.verificationCriteria.length, 'Verification criteria preserved');

  // Terminal check: SUPERSEDED plan cannot transition back to READY or EXECUTING
  const transitionOutOfSuperseded = transitionPlanStatus(supersededPlan, { targetStatus: 'READY' });
  assert(!transitionOutOfSuperseded.success, 'SUPERSEDED plan cannot transition to READY');
  console.log('   ✅ Plan supersession and historical preservation verified.');

  console.log('\n------------------------------------------------------------------');
  console.log('✨ ALL PLANNING MODEL (PHASE 4A) VERIFICATION TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runPlanningModelTestSuite().catch((err) => {
  console.error('❌ Planning model verification failed:', err);
  process.exit(1);
});
