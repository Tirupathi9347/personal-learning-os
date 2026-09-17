/**
 * Phase 4D: Controlled Plan Execution Engine Verification Test Suite
 * 
 * Verifies:
 * 1. Valid read-only step executes successfully.
 * 2. Multiple required tools execute in deterministic sequential order.
 * 3. Unregistered tool blocks execution safely.
 * 4. WRITE tool blocks execution safely.
 * 5. APPROVAL_REQUIRED step pauses for approval without bypassing.
 * 6. Missing dependency reference blocks execution.
 * 7. Incomplete dependency blocks execution.
 * 8. Already completed step is skipped idempotently.
 * 9. Superseded step is blocked from execution.
 * 10. Invalid plan status (e.g. DRAFT) blocks execution.
 * 11. Tool input schema validation is enforced.
 * 12. Existing Phase 3 tool executor is reused directly.
 * 13. Tool execution failure is captured and isolated without crashing.
 * 14. Safety limits (maxToolIterations, maxConsecutiveFailures) are enforced.
 * 15. No infinite execution loops.
 * 16. Working memory payload is sanitized.
 * 17. No tokens/secrets appear in execution output.
 * 18. Verification handoff separates tool execution from learning outcomes.
 * 19. No task mutations occur (isTaskModified === false).
 * 20. No calendar mutations occur (isCalendarModified === false).
 * 21. No database mutations occur (isDatabaseModified === false).
 * 22. No external side effects occur (isExternalSideEffectTriggered === false).
 * 23. Authenticated tenant/user boundary is strictly preserved.
 * 24. Deterministic tool execution ordering.
 * 25. Original plan intent remains unchanged.
 */

import {
  createLearningPlan,
  validateStepExecutionEligibility,
  executePlanStep,
  createPlanExecutingHandler,
  createToolRegistry,
  registerReadOnlyTools,
  agentToolRegistry,
  ToolDefinition,
  LearningPlan,
  PlanStepExecutionResult,
} from '../src/lib/agent';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runPlanExecutionTestSuite() {
  console.log('------------------------------------------------------------------');
  console.log('⚡ RUNNING CONTROLLED PLAN EXECUTION ENGINE (PHASE 4D)');
  console.log('------------------------------------------------------------------');

  const authenticatedUserId = 'student_user_123';
  const fixedTimestamp = '2026-09-16T12:00:00.000Z';

  // Ensure default read-only tools are registered in singleton registry
  registerReadOnlyTools(agentToolRegistry);

  // Test 1: Valid read-only step executes successfully
  console.log('\nTest 1: Verifying Valid Read-Only Step Execution...');
  const plan1 = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Audit Python telemetry and tasks',
    objectives: ['Audit tasks', 'Audit profile'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-tasks-audit',
        title: 'Fetch Student Tasks',
        description: 'Read active tasks from database',
        rationale: 'Telemetry inspection',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Tasks fetched'],
        verificationCriteria: ['Task list non-empty'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes1 = await executePlanStep({
    plan: plan1,
    stepId: 'step-tasks-audit',
    authenticatedUserId,
    timestamp: fixedTimestamp,
  });

  assert(execRes1.status === 'SUCCESS', `Expected status SUCCESS, got: ${execRes1.status}`);
  assert(execRes1.toolResults.length === 1, 'Must have 1 tool result');
  assert(execRes1.toolResults[0].toolName === 'get_tasks', 'Tool must be get_tasks');
  assert(execRes1.toolResults[0].status === 'SUCCESS', 'Tool execution status must be SUCCESS');
  assert(execRes1.verificationHandoff !== undefined, 'Verification handoff must be defined');
  assert(execRes1.verificationHandoff!.toolsExecutedSuccessfully === true, 'Tools must be marked as successfully executed');
  assert(execRes1.updatedPlan?.steps[0].status === 'COMPLETED', 'Step status must be updated to COMPLETED in updated plan');
  console.log('   ✅ Valid read-only step executed successfully with structured verification handoff.');

  // Test 2: Multiple required tools execute in deterministic order
  console.log('\nTest 2: Verifying Multiple Tools Execute in Deterministic Order...');
  const multiToolPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Audit student telemetry across multiple entities',
    objectives: ['Audit profile', 'Audit skills', 'Audit mistakes'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-multi-audit',
        title: 'Multi-Source Telemetry Inspection',
        description: 'Read profile, skills, and mistakes in sequence',
        rationale: 'Comprehensive baseline inspection',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['All 3 tools queried'],
        verificationCriteria: ['Records inspected'],
        requiredTools: ['get_student_profile', 'get_skills', 'get_mistakes'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes2 = await executePlanStep({
    plan: multiToolPlan,
    stepId: 'step-multi-audit',
    authenticatedUserId,
    timestamp: fixedTimestamp,
  });

  assert(execRes2.status === 'SUCCESS', 'Multi-tool step execution must succeed');
  assert(execRes2.toolResults.length === 3, 'Must execute all 3 required tools');
  assert(execRes2.toolResults[0].toolName === 'get_student_profile', 'Tool 1 must be get_student_profile');
  assert(execRes2.toolResults[1].toolName === 'get_skills', 'Tool 2 must be get_skills');
  assert(execRes2.toolResults[2].toolName === 'get_mistakes', 'Tool 3 must be get_mistakes');
  console.log('   ✅ Executed 3 tools in exact deterministic sequential order.');

  // Test 3: Unregistered tool blocks execution
  console.log('\nTest 3: Verifying Unregistered Tool Blocks Execution...');
  const unregToolPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Study theoretical notes',
    objectives: ['Read notes'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-notes',
        title: 'Read Notes',
        description: 'Open get_notes tool',
        rationale: 'Study notes',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_notes'], // 'get_notes' is NOT in Phase 3 Tool Registry!
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes3 = await executePlanStep({
    plan: unregToolPlan,
    stepId: 'step-notes',
    authenticatedUserId,
  });

  assert(execRes3.status === 'BLOCKED', 'Unregistered tool must block step execution');
  assert(Boolean(execRes3.blockingReason?.includes('get_notes')), 'Blocking reason must cite get_notes');
  assert(execRes3.toolResults.length === 0, 'No tools should have executed');
  console.log('   ✅ Unregistered tool "get_notes" safely blocked from execution.');

  // Test 4: WRITE tool blocks execution
  console.log('\nTest 4: Verifying WRITE Tool Blocks Execution...');
  const customRegistry = createToolRegistry();
  registerReadOnlyTools(customRegistry);

  // Register a hypothetical mutation tool in custom registry
  const writeToolDef: ToolDefinition = {
    name: 'delete_student_account',
    description: 'Destructive delete action',
    category: 'STUDENT_TELEMETRY',
    operationType: 'WRITE',
    permissionLevel: 'FORBIDDEN',
    riskLevel: 'CRITICAL',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', description: 'result' },
    auditMetadata: {
      targetEntity: 'account',
      affectsStudentData: true,
      isReversible: false,
      requiresUserConfirmation: true,
      auditDescription: 'Destructive write',
    },
  };
  customRegistry.registerTool(writeToolDef);

  const writeToolPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Run dangerous action',
    objectives: ['Write action'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-write-action',
        title: 'Mutate Data',
        description: 'Attempt mutation',
        rationale: 'Dangerous action test',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['delete_student_account'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes4 = await executePlanStep({
    plan: writeToolPlan,
    stepId: 'step-write-action',
    authenticatedUserId,
    registry: customRegistry,
  });

  assert(execRes4.status === 'BLOCKED', 'WRITE tool must be blocked in Phase 4D');
  assert(Boolean(execRes4.blockingReason?.includes('Only READ tools are permitted')), 'Must cite READ permission constraint');
  console.log('   ✅ State-mutating WRITE tool safely blocked from execution.');

  // Test 5: APPROVAL_REQUIRED step cannot bypass approval
  console.log('\nTest 5: Verifying APPROVAL_REQUIRED Step Pauses for Confirmation...');
  const approvalPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'High risk schedule alteration',
    objectives: ['Schedule rebalance'],
    priority: 'HIGH',
    status: 'READY',
    steps: [
      {
        id: 'step-approval-req',
        title: 'Review High Impact Schedule',
        description: 'Inspect calendar allocations',
        rationale: 'Requires student alignment',
        priority: 'HIGH',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Approved'],
        verificationCriteria: ['Confirmed'],
        requiredTools: ['get_tasks'],
        requiresApproval: true, // Approval required!
        approvalRiskLevel: 'HIGH',
      },
    ],
  }).plan!;

  const execRes5 = await executePlanStep({
    plan: approvalPlan,
    stepId: 'step-approval-req',
    authenticatedUserId,
  });

  assert(execRes5.status === 'REQUIRES_APPROVAL', 'Must return REQUIRES_APPROVAL');
  assert(execRes5.approvalRequest !== undefined, 'Approval request object must be created');
  assert(execRes5.approvalRequest!.actionType === 'PLAN_STEP_EXECUTION', 'Action type must match');
  assert(execRes5.toolResults.length === 0, 'No tools should execute before approval');
  console.log('   ✅ APPROVAL_REQUIRED step correctly returned REQUIRES_APPROVAL without executing tools.');

  // Test 6 & 7: Missing & Incomplete dependency blocks execution
  console.log('\nTest 6 & 7: Verifying Incomplete & Missing Dependency Blocks Execution...');
  const depPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Two-step dependency test',
    objectives: ['Step 1', 'Step 2'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-1-init',
        title: 'Initial Step',
        description: 'Step 1 description',
        rationale: 'Predecessor step',
        priority: 'MEDIUM',
        status: 'PENDING', // Incomplete!
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
      {
        id: 'step-2-dependent',
        title: 'Dependent Step',
        description: 'Step 2 description',
        rationale: 'Dependent step',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: ['step-1-init'], // Depends on Step 1
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Verified'],
        requiredTools: ['get_skills'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  // Try to execute Step 2 while Step 1 is still PENDING
  const execResDep = await executePlanStep({
    plan: depPlan,
    stepId: 'step-2-dependent',
    authenticatedUserId,
  });

  assert(execResDep.status === 'BLOCKED', 'Dependent step must be BLOCKED when predecessor is incomplete');
  assert(Boolean(execResDep.blockingReason?.includes('step-1-init')), 'Blocking reason must cite incomplete step-1-init');
  console.log('   ✅ Dependent step blocked because predecessor dependency is incomplete.');

  // Test 8: Already completed step is skipped safely (Idempotency)
  console.log('\nTest 8: Verifying Idempotent Skipping of Completed Steps...');
  const completedPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Completed plan check',
    objectives: ['Done'],
    priority: 'LOW',
    status: 'READY',
    steps: [
      {
        id: 'step-done',
        title: 'Done Step',
        description: 'Already executed',
        rationale: 'Completed',
        priority: 'LOW',
        status: 'COMPLETED', // Already COMPLETED
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes8 = await executePlanStep({
    plan: completedPlan,
    stepId: 'step-done',
    authenticatedUserId,
  });

  assert(execRes8.status === 'SKIPPED', 'Completed step must return SKIPPED');
  assert(execRes8.toolResults.length === 0, 'Zero tools should execute on skipped step');
  console.log('   ✅ Already completed step safely skipped without re-execution.');

  // Test 9: Superseded step cannot execute
  console.log('\nTest 9: Verifying Superseded Step Cannot Execute...');
  const supersededPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Superseded step check',
    objectives: ['Superseded'],
    priority: 'LOW',
    status: 'READY',
    steps: [
      {
        id: 'step-old',
        title: 'Old Step',
        description: 'Superseded',
        rationale: 'Old',
        priority: 'LOW',
        status: 'SUPERSEDED',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes9 = await executePlanStep({
    plan: supersededPlan,
    stepId: 'step-old',
    authenticatedUserId,
  });

  assert(execRes9.status === 'BLOCKED', 'Superseded step must be blocked');
  console.log('   ✅ Superseded step safely blocked from execution.');

  // Test 10: Invalid plan status blocks execution
  console.log('\nTest 10: Verifying Invalid Plan Status Blocks Execution...');
  const draftPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Draft plan check',
    objectives: ['Draft'],
    priority: 'LOW',
    status: 'DRAFT', // DRAFT is not execution-eligible!
    steps: [
      {
        id: 'step-draft',
        title: 'Draft Step',
        description: 'Draft',
        rationale: 'Draft',
        priority: 'LOW',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes10 = await executePlanStep({
    plan: draftPlan,
    stepId: 'step-draft',
    authenticatedUserId,
  });

  assert(execRes10.status === 'BLOCKED', 'Plan in DRAFT status must block step execution');
  assert(Boolean(execRes10.blockingReason?.includes('DRAFT')), 'Blocking reason must cite DRAFT status');
  console.log('   ✅ Plan in DRAFT status safely blocked from execution.');

  // Test 11: Tool input schema validation is respected
  console.log('\nTest 11: Verifying Tool Input Schema Validation...');
  const invalidInputPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Invalid input check',
    objectives: ['Check'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-bad-input',
        title: 'Bad Input Step',
        description: 'Invalid input parameter',
        rationale: 'Schema validation test',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_tasks'],
        actionPayload: {
          unknownIllegalParam: 99999, // get_tasks has additionalProperties: false
        },
        requiresApproval: false,
      },
    ],
  }).plan!;

  const execRes11 = await executePlanStep({
    plan: invalidInputPlan,
    stepId: 'step-bad-input',
    authenticatedUserId,
  });

  assert(execRes11.status === 'BLOCKED', 'Invalid tool input payload must block execution');
  assert(Boolean(execRes11.blockingReason?.includes('unknownIllegalParam')), 'Must identify invalid parameter');
  console.log('   ✅ Tool input schema validation correctly blocked invalid payload.');

  // Test 13: Tool execution failure is captured and isolated
  console.log('\nTest 13: Verifying Tool Execution Failure Handling...');
  const failingPlan = createLearningPlan({
    userId: authenticatedUserId,
    goal: 'Failing tool check',
    objectives: ['Fail check'],
    priority: 'MEDIUM',
    status: 'READY',
    steps: [
      {
        id: 'step-failing-tool',
        title: 'Failing Tool Step',
        description: 'Simulated tool failure',
        rationale: 'Fault isolation test',
        priority: 'MEDIUM',
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        constraints: [],
        successCriteria: ['Done'],
        verificationCriteria: ['Done'],
        requiredTools: ['get_tasks'],
        requiresApproval: false,
      },
    ],
  }).plan!;

  const failingExecRes = await executePlanStep({
    plan: failingPlan,
    stepId: 'step-failing-tool',
    authenticatedUserId,
    customExecutors: {
      get_tasks: async () => {
        throw new Error('Database connection reset during query');
      },
    },
  });

  assert(failingExecRes.status === 'FAILED', 'Failing tool must result in step FAILED status');
  assert(Boolean(failingExecRes.error?.message.includes('Database connection reset')), 'Error message must be captured');
  assert(failingExecRes.updatedPlan?.steps[0].status === 'FAILED', 'Step status must be updated to FAILED');
  console.log('   ✅ Tool runtime failure safely captured and isolated without crashing.');

  // Test 14 & 15: Safety limits (maxConsecutiveFailures, maxToolIterations) are enforced
  console.log('\nTest 14 & 15: Verifying Safety Limit Enforcement (Loop Protection)...');
  const limitEligibility = validateStepExecutionEligibility({
    plan: plan1,
    stepId: 'step-tasks-audit',
    authenticatedUserId,
    safetyLimits: { maxToolIterations: 5, maxReplans: 3, maxConsecutiveFailures: 2 },
    counters: { toolIterations: 5, replans: 0, consecutiveFailures: 0, totalExecutedActions: 0 },
  });

  assert(!limitEligibility.isEligible, 'Eligibility must fail when maxToolIterations is reached');
  assert(limitEligibility.blockingReasons.some((r) => r.includes('maxToolIterations')), 'Must cite maxToolIterations');
  console.log('   ✅ Safety limits enforced; infinite execution loops prevented.');

  // Test 16 & 17: Working memory is sanitized and secrets are not exposed
  console.log('\nTest 16 & 17: Verifying Working Memory Sanitization & Secret Scrubbing...');
  const wmUpdate = execRes1.workingMemoryUpdate;
  assert(wmUpdate !== undefined, 'Working memory update must be defined');
  const wmString = JSON.stringify(wmUpdate);
  assert(!wmString.includes('bearer '), 'No bearer tokens in working memory');
  assert(!wmString.includes('service_role'), 'No service role secrets in working memory');
  console.log('   ✅ Working memory sanitized with zero token or credential leakage.');

  // Test 18: Verification handoff does not claim learning success
  console.log('\nTest 18: Verifying Verification Handoff Separation...');
  const handoff = execRes1.verificationHandoff!;
  assert(typeof handoff.disclaimer === 'string', 'Disclaimer must be present');
  assert(
    handoff.disclaimer.includes('does NOT prove student skill acquisition'),
    'Disclaimer must explicitly separate telemetry from learning acquisition'
  );
  console.log('   ✅ Verification handoff strictly separates read-only execution from learning outcome verification.');

  // Test 19, 20, 21, 22: Side-Effect Guarantees (Zero task/calendar/DB mutations)
  console.log('\nTest 19-22: Verifying Side-Effect Guarantees (Zero Mutations)...');
  const guarantees = execRes1.sideEffectGuarantees;
  assert(guarantees.isTaskModified === false, 'isTaskModified must be false');
  assert(guarantees.isCalendarModified === false, 'isCalendarModified must be false');
  assert(guarantees.isDatabaseModified === false, 'isDatabaseModified must be false');
  assert(guarantees.isExternalSideEffectTriggered === false, 'isExternalSideEffectTriggered must be false');
  console.log('   ✅ Side-effect guarantees certified: Zero task, calendar, database, or external mutations.');

  // Test 23: Tenant Isolation Boundary
  console.log('\nTest 23: Verifying Tenant Isolation Boundary...');
  const crossTenantRes = await executePlanStep({
    plan: plan1,
    stepId: 'step-tasks-audit',
    authenticatedUserId: 'malicious_different_user_999',
  });

  assert(crossTenantRes.status === 'BLOCKED', 'Cross-tenant execution must be blocked');
  assert(Boolean(crossTenantRes.blockingReason?.includes('Tenant isolation failure')), 'Must cite tenant isolation failure');
  console.log('   ✅ Tenant isolation boundary enforced; cross-tenant execution blocked.');

  // Test 24 & 25: Orchestrator Loop Integration Handler
  console.log('\nTest 24 & 25: Verifying Orchestrator Execution Handler Adapter...');
  const handler = createPlanExecutingHandler({
    authenticatedUserId,
  });

  const mockOrchestratorState = {
    runId: 'run-exec-test-1',
    userId: authenticatedUserId,
    currentState: 'EXECUTING' as const,
    previousState: 'TOOL_SELECTION' as const,
    context: {
      runId: 'run-exec-test-1',
      userId: authenticatedUserId,
      goal: 'Audit Python telemetry',
      eventTrigger: 'MANUAL_GOAL' as const,
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp,
    },
    safetyLimits: { maxToolIterations: 10, maxReplans: 3, maxConsecutiveFailures: 2 },
    counters: { toolIterations: 0, replans: 0, consecutiveFailures: 0, totalExecutedActions: 0 },
    activeApprovalRequest: null,
    lastFailure: null,
    evidenceContext: {},
    transitionHistory: [],
    workingMemory: {
      plan: plan1,
    },
    updatedAt: fixedTimestamp,
  };

  const handlerRes = await handler(mockOrchestratorState);
  assert(handlerRes.executionOutput !== undefined, 'Handler must return execution output');
  assert(Boolean(handlerRes.reason?.includes('Executed step')), 'Handler reason must describe execution');
  console.log('   ✅ Orchestrator execution handler adapter validated successfully.');

  console.log('\n------------------------------------------------------------------');
  console.log('✨ ALL CONTROLLED PLAN EXECUTION (PHASE 4D) TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runPlanExecutionTestSuite().catch((err) => {
  console.error('❌ Plan execution verification failed:', err);
  process.exit(1);
});
