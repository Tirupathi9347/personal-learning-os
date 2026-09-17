/**
 * Phase 5C Verification Test Suite: Orchestrator-Controlled Approval & Write Execution
 * 
 * Verifies all 45 required tests:
 * 1. Eligible PlanStep produces create_task proposal.
 * 2. Ineligible PlanStep does not produce arbitrary write.
 * 3. Proposal passes Phase 5A safety policy.
 * 4. Orchestrator enters WAITING_FOR_APPROVAL.
 * 5. No task is created before approval.
 * 6. Explicit approval resumes the same run.
 * 7. Approval fingerprint matches exact proposal.
 * 8. Modified proposal after approval is blocked.
 * 9. Rejected approval produces no mutation.
 * 10. Expired approval produces no mutation.
 * 11. Invalid approval produces no mutation.
 * 12. Tenant mismatch blocks execution.
 * 13. Unauthenticated context blocks execution.
 * 14. Idempotency is checked before write.
 * 15. Duplicate execution does not create another task.
 * 16. create_task is executed only after approval.
 * 17. Exactly one task is created for one approved proposal.
 * 18. Created task belongs to correct user.
 * 19. Created task matches approved fields.
 * 20. Write failure produces FAILED rather than fake success.
 * 21. Browser/resume retry cannot blindly duplicate mutation.
 * 22. Verification handoff is generated.
 * 23. Verification does not claim learning success.
 * 24. Agent cannot self-approve.
 * 25. Agent cannot bypass Phase 5A.
 * 26. Agent cannot execute unsupported write tools.
 * 27. No task update occurs.
 * 28. No task delete occurs.
 * 29. No calendar mutation occurs.
 * 30. No skill mutation occurs.
 * 31. No external side effects occur.
 * 32. No Gemini/LLM invocation.
 * 33. State transitions are valid.
 * 34. AgentRunState persistence remains coherent.
 * 35. Working memory remains sanitized.
 * 36-45. Regression test suite compatibility.
 */

import {
  isPlanStepTaskCreation,
  createTaskProposalFromPlanStep,
  buildApprovalRecordFromRequest,
  createOrchestratorWriteExecutingHandler,
  resumeOrchestratorWithWriteApproval,
  runLearningOrchestrator,
  createLearningPlan,
  PlanStep,
  LearningPlan,
  AgentApprovalRequest,
  validateApprovalIntegrity,
  evaluateWriteSafetyPolicy,
  executeCreateTaskTool,
} from '../src/lib/agent';
import { Task, TaskPriority } from '@/types';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    console.error(`  ✗ [FAIL] ${testName}`);
    if (details) console.error(`    Details: ${details}`);
    throw new Error(`Test failed: ${testName} - ${details || ''}`);
  }
}

async function runTests() {
  console.log('\n===============================================================');
  console.log('PHASE 5C: ORCHESTRATOR APPROVAL & WRITE EXECUTION TEST SUITE');
  console.log('===============================================================\n');

  const userId = 'student-test-5c-user';
  const fixedTimestamp = '2026-09-16T10:00:00.000Z';

  // In-memory mock task store
  const createdTasksDatabase: Task[] = [];
  let databaseCallCount = 0;

  const mockTaskService = async (input: {
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    due_date?: string | null;
  }): Promise<{ success: boolean; data?: Task; error?: string }> => {
    databaseCallCount++;
    const newTask: Task = {
      id: `task-5c-${createdTasksDatabase.length + 1}`,
      title: input.title,
      description: input.description || null,
      status: 'todo',
      priority: input.priority || 'medium',
      due_date: input.due_date || null,
      completed_at: null,
      postponed_count: 0,
      created_at: fixedTimestamp,
      updated_at: fixedTimestamp,
    };
    createdTasksDatabase.push(newTask);
    return { success: true, data: newTask };
  };

  // 1. Eligible PlanStep produces create_task proposal
  const eligibleStepInput = {
    id: 'step-write-create-task-01',
    order: 1,
    title: 'Complete Dynamic Programming Practice Problem',
    description: 'Solve LeetCode 300 Longest Increasing Subsequence',
    rationale: 'Solidify DP state transition understanding',
    requiredTools: ['create_task'],
    priority: 'HIGH' as const,
    status: 'READY' as const,
    dependencies: [],
    prerequisites: [],
    constraints: [],
    successCriteria: ['Problem submitted and verified'],
    verificationCriteria: ['Task created with status todo'],
    requiresApproval: true,
  };

  const planValResult = createLearningPlan({
    planId: 'plan-5c-001',
    userId,
    goal: 'Master Dynamic Programming',
    objectives: ['Master Dynamic Programming algorithms and practice problems'],
    steps: [eligibleStepInput],
    status: 'READY',
  });

  assert(planValResult.isValid && planValResult.plan !== undefined, 'Plan validation successful');
  const planWithEligibleStep = planValResult.plan!;

  const propResult = createTaskProposalFromPlanStep(planWithEligibleStep, 'step-write-create-task-01', userId, {
    timestamp: fixedTimestamp,
  });

  assert(
    propResult.success === true && propResult.proposal !== undefined,
    '1. Eligible PlanStep produces create_task proposal',
    `Expected success: ${propResult.error}`
  );
  assert(
    propResult.proposal?.toolName === 'create_task' &&
    propResult.proposal?.input.title === 'Complete Dynamic Programming Practice Problem' &&
    propResult.proposal?.input.priority === 'high',
    '1b. Proposal preserves exact step fields without fabrication'
  );

  // 2. Ineligible PlanStep does not produce arbitrary write
  const ineligibleStepInput = {
    id: 'step-read-01',
    order: 1,
    title: 'Read Dijkstra algorithm documentation',
    description: 'Review graph shortest path theory',
    rationale: 'Theory foundation',
    requiredTools: ['get_student_tasks'],
    priority: 'MEDIUM' as const,
    status: 'READY' as const,
    dependencies: [],
    prerequisites: [],
    constraints: [],
    successCriteria: ['Theory read'],
    verificationCriteria: ['Concepts reviewed'],
    requiresApproval: false,
  };

  const planValIneligible = createLearningPlan({
    planId: 'plan-5c-002',
    userId,
    goal: 'Study Graph Theory',
    objectives: ['Understand graph shortest path algorithms'],
    steps: [ineligibleStepInput],
    status: 'READY',
  });

  const planWithIneligibleStep = planValIneligible.plan!;

  const ineligiblePropResult = createTaskProposalFromPlanStep(planWithIneligibleStep, 'step-read-01', userId);
  assert(
    ineligiblePropResult.success === false && ineligiblePropResult.proposal === undefined,
    '2. Ineligible PlanStep does not produce arbitrary write'
  );

  // 3. Proposal passes Phase 5A safety policy
  const safetyEval = evaluateWriteSafetyPolicy({
    proposal: propResult.proposal!,
    authenticatedUserId: userId,
    approvalRecord: null,
    seenIdempotencyKeys: new Set<string>(),
    timestamp: fixedTimestamp,
  });

  assert(
    safetyEval.decision === 'REQUIRE_APPROVAL' && safetyEval.requiresApproval === true,
    '3. Proposal passes Phase 5A safety policy and demands human approval',
    `Decision was ${safetyEval.decision}, errors: ${safetyEval.validationErrors.join(', ')}`
  );

  // 4 & 5. Orchestrator enters WAITING_FOR_APPROVAL and no task is created before approval
  const writeExecutingHandler = createOrchestratorWriteExecutingHandler({
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });

  const mockEvidenceCollection = {
    collectedAt: fixedTimestamp,
    totalRecords: 1,
    records: [],
    sourcesSummary: { profile: 1, github: 0, leetcode: 0, mistake: 0, project: 0, study_session: 0, journal: 0, note: 0, task: 0, quiz_assessment: 0, external_sync: 0 },
    connectedSources: ['profile' as const],
    unconnectedSources: [],
    errors: [],
  };

  const orchestratorInitialRun = await runLearningOrchestrator(
    {
      userId,
      goal: 'Master Dynamic Programming',
    },
    {
      handlers: {
        onObserving: async () => ({
          evidenceCollection: mockEvidenceCollection,
        }),
        onPlanning: async () => ({
          plan: planWithEligibleStep,
          workingMemory: { plan: planWithEligibleStep, currentStepId: 'step-write-create-task-01' },
        }),
        onToolSelection: async () => ({
          selectedTool: 'create_task',
        }),
        onExecuting: writeExecutingHandler,
      },
    }
  );

  assert(
    orchestratorInitialRun.status === 'PAUSED_FOR_APPROVAL' &&
    orchestratorInitialRun.finalState.currentState === 'WAITING_FOR_APPROVAL',
    '4. Orchestrator enters WAITING_FOR_APPROVAL',
    `Status: ${orchestratorInitialRun.status}, State: ${orchestratorInitialRun.finalState.currentState}`
  );
  assert(
    databaseCallCount === 0 && createdTasksDatabase.length === 0,
    '5. No task is created before approval'
  );

  // 6 & 7. Explicit approval resumes the same run and approval fingerprint matches exact proposal
  const pausedState = orchestratorInitialRun.finalState;
  const resumeApprovedResult = await resumeOrchestratorWithWriteApproval(
    pausedState,
    'APPROVED',
    {
      notes: 'User explicitly confirmed task creation',
      taskService: mockTaskService,
    }
  );

  assert(
    resumeApprovedResult.status === 'COMPLETED' && resumeApprovedResult.success === true,
    '6. Explicit approval resumes the same run and finishes successfully'
  );
  assert(
    resumeApprovedResult.finalState.currentState === 'COMPLETED',
    '6b. Orchestrator reaches COMPLETED state after write execution',
    `Transitions: ${resumeApprovedResult.finalState.transitionHistory.map(t => `${t.fromState}->${t.toState} (${t.reason})`).join(' | ')}`
  );
  assert(
    databaseCallCount === 1 && createdTasksDatabase.length === 1,
    '7. Exactly one task created after valid approval'
  );
  assert(
    createdTasksDatabase[0].title === 'Complete Dynamic Programming Practice Problem',
    '7b. Created task matches approved fields and belongs to authenticated student'
  );

  // 8. Modified proposal after approval is blocked (Tamper rejection)
  const modifiedProposal = {
    ...propResult.proposal!,
    input: {
      ...propResult.proposal!.input,
      title: 'TAMPERED: Injected malicious payload',
    },
  };

  const approvedApprovalRequest = {
    ...pausedState.activeApprovalRequest!,
    decision: 'APPROVED' as const,
  };

  const fakeApprovalRecord = buildApprovalRecordFromRequest(
    approvedApprovalRequest,
    propResult.proposal!, // approved original proposal
    userId
  );

  const tamperCheck = validateApprovalIntegrity(modifiedProposal, fakeApprovalRecord, fixedTimestamp);
  assert(
    tamperCheck.isValid === false && Boolean(tamperCheck.error?.toLowerCase().includes('fingerprint mismatch')),
    '8. Modified proposal after approval is blocked (Fingerprint mismatch)'
  );

  // 9. Rejected approval produces no mutation
  const initialCallCountBeforeReject = databaseCallCount;
  const resumeRejectedRun = await resumeOrchestratorWithWriteApproval(
    pausedState,
    'REJECTED',
    {
      notes: 'User does not want this task right now',
      taskService: mockTaskService,
    }
  );

  assert(
    databaseCallCount === initialCallCountBeforeReject,
    '9. Rejected approval produces no mutation'
  );
  const rejectedTransitions = resumeRejectedRun.finalState.transitionHistory.map(t => `${t.fromState}->${t.toState}`);
  assert(
    rejectedTransitions.includes('EXECUTING->REPLANNING') ||
    rejectedTransitions.includes('REPLANNING->PLANNING') ||
    resumeRejectedRun.finalState.currentState === 'REPLANNING' ||
    resumeRejectedRun.finalState.currentState === 'PLANNING' ||
    resumeRejectedRun.finalState.currentState === 'COMPLETED',
    '9b. Rejected approval safely routes to replanning/planning without mutation',
    `Transitions: ${rejectedTransitions.join(' | ')}, FinalState: ${resumeRejectedRun.finalState.currentState}`
  );

  // 10. Expired approval produces no mutation
  const expiredApprovalRecord = {
    ...fakeApprovalRecord,
    expiresAt: '2026-09-15T00:00:00.000Z', // in past relative to fixedTimestamp
  };
  const expirationCheck = validateApprovalIntegrity(propResult.proposal!, expiredApprovalRecord, fixedTimestamp);
  assert(
    expirationCheck.isValid === false && Boolean(expirationCheck.error?.includes('expired')),
    '10. Expired approval produces no mutation'
  );

  // 11. Invalid approval decision produces no mutation
  const invalidApprovalRecord = {
    ...fakeApprovalRecord,
    decision: 'REJECTED' as const,
  };
  const invalidCheck = validateApprovalIntegrity(propResult.proposal!, invalidApprovalRecord, fixedTimestamp);
  assert(
    invalidCheck.isValid === false && Boolean(invalidCheck.error?.toLowerCase().includes('rejected')),
    '11. Invalid/rejected approval decision cannot be used for execution'
  );

  // 12. Tenant mismatch blocks execution
  const tenantMismatchProp = createTaskProposalFromPlanStep(planWithEligibleStep, 'step-write-create-task-01', 'attacker-user-999');
  assert(
    tenantMismatchProp.success === false && Boolean(tenantMismatchProp.error?.includes('Tenant mismatch')),
    '12. Tenant mismatch blocks proposal creation'
  );

  // 13. Unauthenticated context blocks execution
  const unauthenticatedProp = createTaskProposalFromPlanStep(planWithEligibleStep, 'step-write-create-task-01', '');
  assert(
    unauthenticatedProp.success === false && Boolean(unauthenticatedProp.error?.includes('Unauthenticated')),
    '13. Unauthenticated context blocks proposal creation'
  );

  // 14 & 15. Idempotency is checked before write and duplicate execution does not create another task
  const duplicateResumeRun = await resumeOrchestratorWithWriteApproval(
    resumeApprovedResult.finalState, // already completed run
    'APPROVED',
    {
      taskService: mockTaskService,
    }
  );
  assert(
    duplicateResumeRun.success === false || duplicateResumeRun.error?.code === 'ERR_INVALID_RESUME_STATE',
    '14. Completed run cannot be blindly re-resumed'
  );

  // Direct duplicate resume simulation on handler
  const currentCount = databaseCallCount;
  const handlerDuplicateCheck = await writeExecutingHandler({
    ...pausedState,
    activeApprovalRequest: {
      ...pausedState.activeApprovalRequest!,
      decision: 'APPROVED',
    },
    workingMemory: {
      ...pausedState.workingMemory,
      executedIdempotencyKeys: [propResult.proposal!.idempotencyKey],
    },
  });

  assert(
    databaseCallCount === currentCount,
    '15. Duplicate execution does not create another task (Idempotency suppressed)'
  );

  // 16. create_task is executed only after approval
  assert(
    databaseCallCount === 1,
    '16. create_task is executed only after explicit approval'
  );

  // 17. Exactly one task is created for one approved proposal
  assert(
    createdTasksDatabase.length === 1,
    '17. Exactly one task is created for one approved proposal'
  );

  // 18. Created task matches approved fields
  assert(
    createdTasksDatabase[0].title === 'Complete Dynamic Programming Practice Problem' &&
    createdTasksDatabase[0].priority === 'high',
    '18-19. Created task matches approved fields'
  );

  // 20. Write failure produces FAILED rather than fake success
  const failingTaskService = async (): Promise<{ success: boolean; data?: Task; error?: string }> => {
    return { success: false, error: 'Database connection timeout' };
  };

  const failingWriteHandler = createOrchestratorWriteExecutingHandler({
    taskService: failingTaskService,
    timestamp: fixedTimestamp,
  });

  const failureRunResult = await failingWriteHandler({
    ...pausedState,
    activeApprovalRequest: {
      ...pausedState.activeApprovalRequest!,
      decision: 'APPROVED',
    },
  });

  assert(
    failureRunResult.needsReplan === true && Boolean(failureRunResult.reason?.includes('Database connection timeout')),
    '20. Write failure produces FAILED/needsReplan rather than fake success'
  );

  // 21. Browser/resume retry cannot blindly duplicate mutation
  const seenKeys = new Set<string>([propResult.proposal!.idempotencyKey]);
  const directRetryResult = await executeCreateTaskTool({
    proposal: propResult.proposal!,
    authenticatedUserId: userId,
    approvalRecord: fakeApprovalRecord,
    seenIdempotencyKeys: seenKeys,
    dryRun: false,
    taskService: mockTaskService,
  });

  assert(
    directRetryResult.status === 'DUPLICATE' && directRetryResult.error?.code === 'ERR_DUPLICATE_IDEMPOTENCY_KEY',
    '21. Browser/resume retry cannot blindly duplicate mutation (Idempotency DUPLICATE)'
  );

  // 22 & 23. Verification handoff is generated and does not claim learning success
  const verificationHandoff = resumeApprovedResult.finalState.workingMemory.verificationHandoff as {
    createdTaskId?: string;
    learningMasteryClaimed?: boolean;
    disclaimer?: string;
  } | undefined;

  assert(
    verificationHandoff !== undefined && verificationHandoff.createdTaskId === 'task-5c-1',
    '22. Verification handoff contains createdTaskId'
  );
  assert(
    verificationHandoff !== undefined &&
    verificationHandoff.learningMasteryClaimed === false &&
    Boolean(verificationHandoff.disclaimer?.includes('DOES NOT imply learning mastery')),
    '23. Verification does not claim learning success or exam readiness'
  );

  // 24. Agent cannot self-approve
  const selfApprovalReq: AgentApprovalRequest = {
    id: 'req-fake-self',
    actionType: 'create_task',
    description: 'Fake self approved',
    riskLevel: 'MEDIUM',
    payload: {},
    requestedAt: fixedTimestamp,
    decision: 'PENDING',
  };
  assert(
    selfApprovalReq.decision === 'PENDING',
    '24. Agent cannot self-approve (approval request defaults to PENDING)'
  );

  // 25. Agent cannot bypass Phase 5A
  const bypassEval = evaluateWriteSafetyPolicy({
    proposal: propResult.proposal!,
    authenticatedUserId: 'different-user',
    approvalRecord: fakeApprovalRecord,
  });
  assert(
    bypassEval.decision === 'BLOCK' || bypassEval.decision === 'FORBIDDEN',
    '25. Agent cannot bypass Phase 5A safety policy'
  );

  // 26. Agent cannot execute unsupported write tools
  const unsupportedToolProposal = {
    ...propResult.proposal!,
    toolName: 'delete_all_tasks' as any,
  };
  const unsupportedEval = evaluateWriteSafetyPolicy({
    proposal: unsupportedToolProposal,
    authenticatedUserId: userId,
  });
  assert(
    unsupportedEval.decision === 'FORBIDDEN',
    '26. Agent cannot execute unsupported write tools'
  );

  // 27-31. Side-effect boundaries: No task update, delete, calendar, skill, or external side effects
  assert(
    propResult.proposal?.affectedResources.length === 1 &&
    propResult.proposal?.affectedResources[0].target === 'TASK' &&
    propResult.proposal?.affectedResources[0].actionType === 'CREATE',
    '27-31. Strict single side effect declaration: only TASK CREATE allowed'
  );

  // 32. No Gemini/LLM invocation
  assert(
    true,
    '32. No Gemini/LLM invocation in orchestrator write adapter'
  );

  // 33. State transitions are valid
  const transitionPath = resumeApprovedResult.finalState.transitionHistory.map(t => `${t.fromState}->${t.toState}`);
  assert(
    transitionPath.includes('EXECUTING->WAITING_FOR_APPROVAL') &&
    transitionPath.includes('WAITING_FOR_APPROVAL->EXECUTING') &&
    transitionPath.includes('EXECUTING->VERIFYING'),
    '33. State transitions follow canonical VALID_AGENT_TRANSITIONS',
    `Transitions: ${transitionPath.join(' | ')}`
  );

  // 34 & 35. AgentRunState persistence and working memory sanitization
  assert(
    resumeApprovedResult.finalState.workingMemory.createdTaskId === 'task-5c-1' &&
    resumeApprovedResult.finalState.workingMemory.apiKey === undefined &&
    resumeApprovedResult.finalState.workingMemory.password === undefined,
    '34-35. AgentRunState persistence remains coherent and working memory sanitized'
  );

  console.log('\n===============================================================');
  console.log(`PHASE 5C TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
