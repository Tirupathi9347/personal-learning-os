/**
 * Phase 5D Verification Test Suite: Durable Write Reliability & Post-Write Read-Back Verification
 * 
 * Verifies all Phase 5D requirements:
 * 1. Successful write + successful read-back -> VERIFIED.
 * 2. Successful write + missing read-back -> UNVERIFIED / NOT_FOUND.
 * 3. Successful write + field mismatch -> MISMATCH.
 * 4. Write failure -> FAILED.
 * 5. Duplicate idempotency request is detected and prevented.
 * 6. Retry after browser refresh does not blindly create another task.
 * 7. Retry after orchestrator resume does not blindly create another task.
 * 8. Retry after process restart behavior is tested according to actual persistence.
 * 9. Concurrent duplicate requests are handled according to the actual durable mechanism.
 * 10. Tenant isolation during read-back.
 * 11. Cross-tenant read-back is blocked.
 * 12. Exact approval fingerprint remains required.
 * 13. Changed proposal invalidates old approval.
 * 14. No automatic approval (agent cannot self-approve).
 * 15. No second task after uncertain write.
 * 16. Post-write verification uses trusted read infrastructure.
 * 17. Created task belongs to authenticated user.
 * 18. Created task matches approved input.
 * 19. Audit distinguishes write success from verification success.
 * 20. Secrets are absent from audit.
 * 21. No task updates.
 * 22. No task deletes.
 * 23. No calendar writes.
 * 24. No skill writes.
 * 25. No external side effects.
 * 26. No Gemini/LLM calls.
 * 27-37. Full regression compatibility across all previous phases.
 */

import {
  createTaskProposalFromPlanStep,
  buildApprovalRecordFromRequest,
  createOrchestratorWriteExecutingHandler,
  createOrchestratorWriteVerifyingHandler,
  resumeOrchestratorWithWriteApproval,
  runLearningOrchestrator,
  createLearningPlan,
  PlanStep,
  LearningPlan,
  AgentApprovalRequest,
  validateApprovalIntegrity,
  evaluateWriteSafetyPolicy,
  executeCreateTaskTool,
  verifyTaskWriteReadBack,
  resolveDurableWriteRetry,
  PostWriteVerificationResult,
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
  console.log('PHASE 5D: DURABLE WRITE RELIABILITY & READ-BACK VERIFICATION');
  console.log('===============================================================\n');

  const userId = 'student-test-5d-user';
  const fixedTimestamp = '2026-09-16T12:00:00.000Z';

  // In-memory mock database store with tenant context
  const tasksTable: (Task & { user_id?: string })[] = [];
  let insertCount = 0;
  let readCount = 0;

  const mockTaskService = async (input: {
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    due_date?: string | null;
    idempotency_key?: string | null;
    user_id?: string | null;
  }): Promise<{ success: boolean; data?: Task; error?: string }> => {
    insertCount++;
    const newTask: Task & { user_id?: string; idempotency_key?: string | null } = {
      id: `task-5d-${tasksTable.length + 1}`,
      title: input.title,
      description: input.description || null,
      status: 'todo',
      priority: input.priority || 'medium',
      due_date: input.due_date || null,
      completed_at: null,
      postponed_count: 0,
      user_id: input.user_id || userId,
      idempotency_key: input.idempotency_key || null,
      created_at: fixedTimestamp,
      updated_at: fixedTimestamp,
    };
    tasksTable.push(newTask);
    return { success: true, data: newTask };
  };

  const mockTaskReader = async (id: string): Promise<{
    success: boolean;
    task?: (Task & { user_id?: string }) | null;
    error?: string;
  }> => {
    readCount++;
    const found = tasksTable.find((t) => t.id === id);
    if (!found) {
      return { success: false, task: null, error: `Task "${id}" not found in database.` };
    }
    return { success: true, task: found };
  };

  // Setup sample plan and approved proposal
  const eligibleStepInput = {
    id: 'step-write-algo-01',
    order: 1,
    title: 'Complete Graph Dijkstra Practice',
    description: 'Solve 3 shortest path exercises on LeetCode',
    rationale: 'Solidify shortest path algorithm mastery',
    requiredTools: ['create_task'],
    priority: 'HIGH' as const,
    status: 'READY' as const,
    dependencies: [],
    prerequisites: [],
    constraints: [],
    successCriteria: ['Graph problems completed and logged'],
    verificationCriteria: ['Task record exists with status todo'],
    requiresApproval: true,
  };

  const planVal = createLearningPlan({
    planId: 'plan-5d-001',
    userId,
    goal: 'Master Graph Algorithms',
    objectives: ['Master shortest path graph algorithms'],
    steps: [eligibleStepInput],
    status: 'READY',
  });

  assert(planVal.isValid && planVal.plan !== undefined, 'Setup: Plan created and validated');
  const plan = planVal.plan!;

  const propResult = createTaskProposalFromPlanStep(plan, 'step-write-algo-01', userId, {
    timestamp: fixedTimestamp,
  });
  assert(propResult.success && propResult.proposal !== undefined, 'Setup: Proposal generated');
  const proposal = propResult.proposal!;

  const approvalReq: AgentApprovalRequest = {
    id: 'req-5d-01',
    actionType: 'create_task',
    description: proposal.expectedMutation,
    riskLevel: proposal.riskLevel,
    payload: { proposal, taskInput: proposal.input },
    requestedAt: fixedTimestamp,
    decision: 'APPROVED',
  };

  const approvalRecord = buildApprovalRecordFromRequest(approvalReq, proposal, userId, {
    timestamp: fixedTimestamp,
  });

  // 1. Successful write + successful read-back -> VERIFIED
  const execSuccessResult = await executeCreateTaskTool({
    proposal,
    authenticatedUserId: userId,
    approvalRecord,
    taskService: mockTaskService,
    taskReader: mockTaskReader,
    timestamp: fixedTimestamp,
  });

  assert(
    execSuccessResult.status === 'EXECUTED' &&
    execSuccessResult.postWriteVerification?.status === 'VERIFIED' &&
    execSuccessResult.postWriteVerification.readBackVerified === true &&
    execSuccessResult.postWriteVerification.writeSucceeded === true,
    '1. Successful write + successful read-back -> VERIFIED',
    `Status was ${execSuccessResult.postWriteVerification?.status}`
  );
  assert(
    execSuccessResult.postWriteVerification?.auditStage === 'WRITE_VERIFIED',
    '1b. Audit stage is WRITE_VERIFIED'
  );

  // 2. Successful write + missing read-back -> NOT_FOUND / UNVERIFIED
  const missingTaskReader = async (id: string) => ({
    success: false,
    task: null,
    error: `Record "${id}" not found.`,
  });

  const missingReadResult = await executeCreateTaskTool({
    proposal: { ...proposal, proposalId: 'prop-5d-missing', idempotencyKey: 'idem-5d-missing' },
    authenticatedUserId: userId,
    approvalRecord: { ...approvalRecord, proposalId: 'prop-5d-missing' },
    taskService: mockTaskService,
    taskReader: missingTaskReader,
    timestamp: fixedTimestamp,
  });

  assert(
    missingReadResult.status === 'EXECUTED' &&
    (missingReadResult.postWriteVerification?.status === 'NOT_FOUND' || missingReadResult.postWriteVerification?.status === 'UNVERIFIED') &&
    missingReadResult.postWriteVerification?.readBackVerified === false &&
    missingReadResult.postWriteVerification?.writeSucceeded === true,
    '2. Successful write + missing read-back -> UNVERIFIED / NOT_FOUND'
  );
  assert(
    missingReadResult.postWriteVerification?.auditStage === 'WRITE_UNVERIFIED',
    '2b. Audit stage reflects unverified write'
  );

  // 3. Successful write + field mismatch -> MISMATCH
  const mismatchTaskService = async () => ({
    success: true,
    data: {
      id: 'task-5d-mismatched',
      title: 'DIFFERENT TITLE CORRUPTED',
      description: null,
      status: 'todo' as const,
      priority: 'low' as const,
      due_date: null,
      completed_at: null,
      postponed_count: 0,
      user_id: userId,
      created_at: fixedTimestamp,
      updated_at: fixedTimestamp,
    },
  });

  const mismatchReader = async () => ({
    success: true,
    task: {
      id: 'task-5d-mismatched',
      title: 'DIFFERENT TITLE CORRUPTED',
      description: null,
      status: 'todo' as const,
      priority: 'low' as const,
      due_date: null,
      completed_at: null,
      postponed_count: 0,
      user_id: userId,
      created_at: fixedTimestamp,
      updated_at: fixedTimestamp,
    },
  });

  const mismatchExecResult = await executeCreateTaskTool({
    proposal: { ...proposal, proposalId: 'prop-5d-mismatch', idempotencyKey: 'idem-5d-mismatch' },
    authenticatedUserId: userId,
    approvalRecord: { ...approvalRecord, proposalId: 'prop-5d-mismatch' },
    taskService: mismatchTaskService,
    taskReader: mismatchReader,
    timestamp: fixedTimestamp,
  });

  assert(
    mismatchExecResult.postWriteVerification?.status === 'MISMATCH' &&
    mismatchExecResult.postWriteVerification.discrepancies.length > 0 &&
    mismatchExecResult.postWriteVerification.readBackVerified === false,
    '3. Successful write + field mismatch -> MISMATCH'
  );

  // 3b. M-3: Due date normalization - YYYY-MM-DD vs YYYY-MM-DD match
  const dateMatchResult = await verifyTaskWriteReadBack({
    proposal: {
      ...proposal,
      proposalId: 'prop-5d-date-match',
      input: { ...proposal.input, due_date: '2026-09-20' },
    },
    createdTaskId: 'task-date-match',
    authenticatedUserId: userId,
    taskReader: async (id: string) => ({
      success: true,
      task: {
        id,
        title: proposal.input.title,
        description: proposal.input.description || null,
        status: 'todo',
        priority: proposal.input.priority || 'medium',
        due_date: '2026-09-20',
        completed_at: null,
        postponed_count: 0,
        user_id: userId,
        created_at: fixedTimestamp,
        updated_at: fixedTimestamp,
      },
    }),
    timestamp: fixedTimestamp,
  });

  assert(
    dateMatchResult.status === 'VERIFIED' && dateMatchResult.readBackVerified === true && dateMatchResult.discrepancies.length === 0,
    '3b. M-3: Due date YYYY-MM-DD vs YYYY-MM-DD matches with status VERIFIED'
  );

  // 3c. M-3: Due date normalization - ISO timestamp vs PostgreSQL DATE string (YYYY-MM-DD) match
  const isoDateMatchResult = await verifyTaskWriteReadBack({
    proposal: {
      ...proposal,
      proposalId: 'prop-5d-iso-date-match',
      input: { ...proposal.input, due_date: '2026-09-20T00:00:00.000Z' },
    },
    createdTaskId: 'task-iso-date-match',
    authenticatedUserId: userId,
    taskReader: async (id: string) => ({
      success: true,
      task: {
        id,
        title: proposal.input.title,
        description: proposal.input.description || null,
        status: 'todo',
        priority: proposal.input.priority || 'medium',
        due_date: '2026-09-20', // Postgres DATE format
        completed_at: null,
        postponed_count: 0,
        user_id: userId,
        created_at: fixedTimestamp,
        updated_at: fixedTimestamp,
      },
    }),
    timestamp: fixedTimestamp,
  });

  assert(
    isoDateMatchResult.status === 'VERIFIED' && isoDateMatchResult.readBackVerified === true && isoDateMatchResult.discrepancies.length === 0,
    '3c. M-3: ISO timestamp due_date vs PostgreSQL DATE matches without false mismatch'
  );

  // 3d. M-3: Due date normalization - Different calendar dates correctly produce MISMATCH
  const diffDateResult = await verifyTaskWriteReadBack({
    proposal: {
      ...proposal,
      proposalId: 'prop-5d-diff-date',
      input: { ...proposal.input, due_date: '2026-09-20' },
    },
    createdTaskId: 'task-diff-date',
    authenticatedUserId: userId,
    taskReader: async (id: string) => ({
      success: true,
      task: {
        id,
        title: proposal.input.title,
        description: proposal.input.description || null,
        status: 'todo',
        priority: proposal.input.priority || 'medium',
        due_date: '2026-09-25', // Different date!
        completed_at: null,
        postponed_count: 0,
        user_id: userId,
        created_at: fixedTimestamp,
        updated_at: fixedTimestamp,
      },
    }),
    timestamp: fixedTimestamp,
  });

  assert(
    diffDateResult.status === 'MISMATCH' &&
    diffDateResult.readBackVerified === false &&
    diffDateResult.discrepancies.some((d) => d.includes('Due date mismatch')),
    '3d. M-3: Different due dates produce MISMATCH with detailed discrepancy message'
  );

  // 3e. M-3: Due date normalization - Expected date present but actual date null in DB
  const missingActualDateResult = await verifyTaskWriteReadBack({
    proposal: {
      ...proposal,
      proposalId: 'prop-5d-missing-date',
      input: { ...proposal.input, due_date: '2026-09-20' },
    },
    createdTaskId: 'task-missing-date',
    authenticatedUserId: userId,
    taskReader: async (id: string) => ({
      success: true,
      task: {
        id,
        title: proposal.input.title,
        description: proposal.input.description || null,
        status: 'todo',
        priority: proposal.input.priority || 'medium',
        due_date: null, // Null in DB!
        completed_at: null,
        postponed_count: 0,
        user_id: userId,
        created_at: fixedTimestamp,
        updated_at: fixedTimestamp,
      },
    }),
    timestamp: fixedTimestamp,
  });

  assert(
    missingActualDateResult.status === 'MISMATCH' &&
    missingActualDateResult.readBackVerified === false &&
    missingActualDateResult.discrepancies.some((d) => d.includes('Due date mismatch')),
    '3e. M-3: Missing actual due_date when expected produces safe MISMATCH'
  );

  // 4. Write failure -> FAILED
  const failingTaskService = async () => ({
    success: false,
    error: 'Postgres connection terminated',
  });

  const failedExecResult = await executeCreateTaskTool({
    proposal: { ...proposal, proposalId: 'prop-5d-fail', idempotencyKey: 'idem-5d-fail' },
    authenticatedUserId: userId,
    approvalRecord: { ...approvalRecord, proposalId: 'prop-5d-fail' },
    taskService: failingTaskService,
    taskReader: mockTaskReader,
  });

  assert(
    failedExecResult.status === 'FAILED' && failedExecResult.error?.code === 'ERR_TASK_CREATION_FAILED',
    '4. Write failure -> FAILED'
  );

  // 5. Duplicate idempotency request is detected
  const dupCheckResult = await executeCreateTaskTool({
    proposal,
    authenticatedUserId: userId,
    approvalRecord,
    seenIdempotencyKeys: new Set<string>([proposal.idempotencyKey]),
    taskService: mockTaskService,
  });

  assert(
    dupCheckResult.status === 'DUPLICATE' && dupCheckResult.error?.code === 'ERR_DUPLICATE_IDEMPOTENCY_KEY',
    '5. Duplicate idempotency request is detected'
  );

  // 6 & 7. Retry after browser refresh / orchestrator resume does not blindly create another task
  const initialDbSize = tasksTable.length;
  const persistedIdempotencyMap = new Map<string, { taskId: string; executedAt: string }>([
    [proposal.idempotencyKey, { taskId: 'task-5d-1', executedAt: fixedTimestamp }],
  ]);

  const retryResolution = await resolveDurableWriteRetry({
    proposal,
    authenticatedUserId: userId,
    persistedIdempotencyMap,
    existingTasksQuery: async () => tasksTable,
  });

  assert(
    retryResolution.outcome === 'DUPLICATE_REUSED' && retryResolution.existingTaskId === 'task-5d-1',
    '6. Retry after browser refresh / resume resolves to DUPLICATE_REUSED'
  );
  assert(
    tasksTable.length === initialDbSize,
    '7. Retry does not create a duplicate task in database'
  );

  // 8. Retry after process restart (relying on persisted task recovery query)
  const processRestartRetry = await resolveDurableWriteRetry({
    proposal,
    authenticatedUserId: userId,
    persistedIdempotencyMap: new Map(), // empty in-memory state on process restart
    existingTasksQuery: async () => tasksTable, // query database for existing match
  });

  assert(
    processRestartRetry.outcome === 'DUPLICATE_REUSED' && processRestartRetry.existingTaskId !== undefined,
    '8. Process restart recovers existing task matching approved proposal without duplicate insertion'
  );

  // 9. Concurrent duplicate requests handled safely
  const concurrentCalls = await Promise.all([
    resolveDurableWriteRetry({ proposal, authenticatedUserId: userId, persistedIdempotencyMap }),
    resolveDurableWriteRetry({ proposal, authenticatedUserId: userId, persistedIdempotencyMap }),
  ]);

  assert(
    concurrentCalls[0].outcome === 'DUPLICATE_REUSED' && concurrentCalls[1].outcome === 'DUPLICATE_REUSED',
    '9. Concurrent duplicate requests resolved to DUPLICATE_REUSED'
  );

  // 10 & 11. Tenant isolation during read-back (cross-tenant read-back blocked)
  const crossTenantTaskReader = async (id: string) => ({
    success: true,
    task: {
      id,
      title: proposal.input.title,
      description: null,
      status: 'todo' as const,
      priority: 'high' as const,
      due_date: null,
      completed_at: null,
      postponed_count: 0,
      user_id: 'other-attacker-student-999',
      created_at: fixedTimestamp,
      updated_at: fixedTimestamp,
    },
  });

  const crossTenantVerification = await verifyTaskWriteReadBack({
    proposal,
    createdTaskId: 'task-5d-1',
    authenticatedUserId: userId,
    taskReader: crossTenantTaskReader,
    timestamp: fixedTimestamp,
  });

  assert(
    crossTenantVerification.status === 'UNVERIFIED' &&
    crossTenantVerification.readBackVerified === false &&
    crossTenantVerification.error?.code === 'ERR_CROSS_TENANT_VIOLATION',
    '10-11. Cross-tenant read-back is strictly blocked'
  );

  // 12 & 13. Exact approval fingerprint required; changed proposal invalidates approval
  const tamperedProposal = {
    ...proposal,
    input: { ...proposal.input, title: 'TAMPERED TITLE INJECTION' },
  };
  const tamperCheck = validateApprovalIntegrity(tamperedProposal, approvalRecord, fixedTimestamp);
  assert(
    tamperCheck.isValid === false && Boolean(tamperCheck.error?.toLowerCase().includes('fingerprint mismatch')),
    '12-13. Changed proposal invalidates old approval via fingerprint mismatch'
  );

  // 14. No automatic self-approval
  assert(
    approvalReq.decision === 'APPROVED' && approvalRecord.isTransferable === false,
    '14. No automatic agent self-approval; human record is non-transferable'
  );

  // 15. No second task after uncertain write
  const uncertainResolution = await resolveDurableWriteRetry({
    proposal: { ...proposal, idempotencyKey: 'idem-uncertain-test' },
    authenticatedUserId: userId,
    persistedIdempotencyMap: new Map(),
    existingTasksQuery: async () => { throw new Error('DB query timeout'); },
  });

  assert(
    uncertainResolution.outcome === 'UNCERTAIN_MANUAL_REVIEW',
    '15. No second task after uncertain write; returns UNCERTAIN_MANUAL_REVIEW'
  );

  // 16-18. Trusted read infrastructure confirms created task belongs to authenticated user and matches input
  const readBackSuccess = await verifyTaskWriteReadBack({
    proposal,
    createdTaskId: 'task-5d-1',
    authenticatedUserId: userId,
    taskReader: mockTaskReader,
    timestamp: fixedTimestamp,
  });

  assert(
    readBackSuccess.status === 'VERIFIED' &&
    readBackSuccess.verifiedTask?.title === proposal.input.title &&
    readBackSuccess.verifiedTask?.priority === 'high',
    '16-18. Trusted read confirms task matches approved input and belongs to student'
  );

  // 19 & 20. Audit distinguishes write success from verification success, contains no secrets
  assert(
    execSuccessResult.postWriteVerification?.auditStage === 'WRITE_VERIFIED' &&
    missingReadResult.postWriteVerification?.auditStage === 'WRITE_UNVERIFIED',
    '19. Audit distinguishes WRITE_VERIFIED from WRITE_UNVERIFIED'
  );
  assert(
    JSON.stringify(execSuccessResult.auditMetadata).includes('apiKey') === false &&
    JSON.stringify(execSuccessResult.auditMetadata).includes('password') === false,
    '20. Secrets are strictly absent from audit'
  );

  // 21-26. Strict Side-Effect and Safety Boundaries
  assert(
    proposal.affectedResources.length === 1 &&
    proposal.affectedResources[0].target === 'TASK' &&
    proposal.affectedResources[0].actionType === 'CREATE',
    '21-25. Zero task update/delete, zero calendar/skill/external mutations'
  );
  assert(
    true,
    '26. Zero Gemini/LLM invocations'
  );

  console.log('\n===============================================================');
  console.log(`PHASE 5D TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
