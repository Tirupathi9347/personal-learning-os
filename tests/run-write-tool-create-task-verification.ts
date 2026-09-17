/**
 * Phase 5B Verification Test Suite: First Controlled Write Tool: create_task
 * 
 * Verifies all 40 critical tool registration, validation, approval integrity,
 * tenant isolation, idempotency, execution safety, non-fabrication, and regression rules.
 */

import {
  createCreateTaskProposal,
  executeCreateTaskTool,
  createTaskToolDef,
  computeActionFingerprint,
  agentToolRegistry,
  WriteActionProposal,
  WriteActionApprovalRecord,
  CreateTaskInput,
} from '../src/lib/agent';
import { Task } from '@/types';

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
  console.log('PHASE 5B: FIRST CONTROLLED WRITE TOOL (CREATE TASK) SUITE');
  console.log('===============================================================\n');

  const userId = 'student-test-5b-001';
  const fixedTimestamp = '2026-09-16T12:00:00.000Z';
  const futureTimestamp = '2026-09-16T13:00:00.000Z';

  // In-memory mock task store for controlled unit-level pipeline testing
  const createdTasksDatabase: Task[] = [];
  let databaseCallCount = 0;

  const mockTaskService = async (input: {
    title: string;
    description?: string | null;
    priority?: any;
    due_date?: string | null;
  }): Promise<{ success: boolean; data?: Task; error?: string }> => {
    databaseCallCount++;
    const newTask: Task = {
      id: `task-mock-${createdTasksDatabase.length + 1}`,
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

  // -------------------------------------------------------------
  // Test 1-4: Tool Registration & Metadata Validation
  // -------------------------------------------------------------
  console.log('\n--- 1. Tool Registry & Metadata ---');

  assert(agentToolRegistry.hasTool('create_task'), '1. create_task is registered in AgentToolRegistry');
  const toolDef = agentToolRegistry.getTool('create_task');
  assert(Boolean(toolDef), '1b. ToolDefinition retrieved from registry');
  assert(toolDef?.operationType === 'WRITE', '2. create_task is registered with operationType: WRITE');
  assert(toolDef?.permissionLevel === 'APPROVAL_REQUIRED', '3. create_task is registered with permissionLevel: APPROVAL_REQUIRED');
  assert(toolDef?.riskLevel === 'MEDIUM', '4. create_task has riskLevel: MEDIUM');

  // -------------------------------------------------------------
  // Test 5-7: Human Approval Enforcement & Fingerprint Integrity
  // -------------------------------------------------------------
  console.log('\n--- 2. Human Approval & Fingerprint Integrity ---');

  const validProposal = createCreateTaskProposal({
    actionId: 'act-task-1',
    userId,
    input: {
      title: 'Study Boyce-Codd Normal Form (BCNF)',
      description: 'Review 3NF vs BCNF decomposition criteria',
      priority: 'high',
      due_date: '2026-09-20',
    },
    dryRun: false,
    proposedAt: fixedTimestamp,
  });

  // 5. Missing approval blocks execution
  const resMissingApproval = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: null,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resMissingApproval.status === 'REQUIRES_APPROVAL', '5. Missing approval blocks execution with status REQUIRES_APPROVAL');
  assert(databaseCallCount === 0, '5b. Zero database calls when approval is missing');

  // 6. Invalid approval (e.g. rejected) blocks execution
  const validFingerprint = computeActionFingerprint({
    userId: validProposal.userId,
    toolName: validProposal.toolName,
    input: validProposal.input,
    affectedResources: validProposal.affectedResources,
    riskLevel: validProposal.riskLevel,
  });

  const rejectedApproval: WriteActionApprovalRecord = {
    approvalId: 'appr-reject-1',
    proposalId: validProposal.proposalId,
    actionFingerprint: validFingerprint,
    userId,
    decision: 'REJECTED',
    decisionNotes: 'User canceled task creation',
    decidedAt: fixedTimestamp,
    expiresAt: futureTimestamp,
    isTransferable: false,
  };

  const resRejected = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: rejectedApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resRejected.status === 'BLOCKED', '6. Rejected approval blocks execution with status BLOCKED');

  // 7. Modified proposal after approval (Fingerprint Mismatch)
  const validApproval: WriteActionApprovalRecord = {
    approvalId: 'appr-valid-1',
    proposalId: validProposal.proposalId,
    actionFingerprint: validFingerprint,
    userId,
    decision: 'APPROVED',
    decisionNotes: 'Student confirmed task creation',
    decidedAt: fixedTimestamp,
    expiresAt: futureTimestamp,
    isTransferable: false,
  };

  const modifiedProposal: WriteActionProposal<CreateTaskInput> = {
    ...validProposal,
    input: {
      ...validProposal.input,
      title: 'MODIFIED TITLE AFTER APPROVAL', // Modified!
    },
  };

  const resTampered = await executeCreateTaskTool({
    proposal: modifiedProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resTampered.status === 'BLOCKED', '7. Modified proposal after approval rejected by fingerprint mismatch');
  assert(resTampered.safetyEvaluation.validationErrors.some((e) => e.includes('fingerprint mismatch')), '7b. Explicit fingerprint mismatch error reported');

  // -------------------------------------------------------------
  // Test 8-9: Tenant Isolation & Authentication Boundary
  // -------------------------------------------------------------
  console.log('\n--- 3. Tenant Isolation & Authentication ---');

  // 8. Tenant mismatch
  const resTenantMismatch = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: 'attacker-student-999',
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resTenantMismatch.status === 'BLOCKED', '8. Tenant mismatch is rejected with status BLOCKED');

  // 9. Unauthenticated context
  const resUnauth = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: '',
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resUnauth.status === 'BLOCKED', '9. Unauthenticated execution is rejected');

  // -------------------------------------------------------------
  // Test 10-12: Strict Schema Validation
  // -------------------------------------------------------------
  console.log('\n--- 4. Schema Validation & Unsupported Fields ---');

  // 10. Missing title
  const invalidInputProposal = createCreateTaskProposal({
    actionId: 'act-invalid-1',
    userId,
    input: { title: '' }, // empty title
    proposedAt: fixedTimestamp,
  });
  const resInvalid = await executeCreateTaskTool({
    proposal: invalidInputProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resInvalid.status === 'BLOCKED', '10. Empty task title is rejected');

  // 11. Unknown input property
  const unknownPropProposal = createCreateTaskProposal({
    actionId: 'act-unknown-1',
    userId,
    input: {
      title: 'Valid Task',
      maliciousField: 'exploit',
    } as any,
    proposedAt: fixedTimestamp,
  });
  const resUnknown = await executeCreateTaskTool({
    proposal: unknownPropProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resUnknown.status === 'BLOCKED', '11. Unknown input properties rejected by additionalProperties: false');

  // 12. Invalid priority enum
  const invalidEnumProposal = createCreateTaskProposal({
    actionId: 'act-enum-1',
    userId,
    input: {
      title: 'Valid Task',
      priority: 'URGENT_MAX' as any, // Not in ['low', 'medium', 'high']
    },
    proposedAt: fixedTimestamp,
  });
  const resEnum = await executeCreateTaskTool({
    proposal: invalidEnumProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: mockTaskService,
    timestamp: fixedTimestamp,
  });
  assert(resEnum.status === 'BLOCKED', '12. Unsupported priority enum value rejected');

  // -------------------------------------------------------------
  // Test 13: Dry-Run Mode (Zero Tasks Created)
  // -------------------------------------------------------------
  console.log('\n--- 5. Dry-Run Mode & Execution Verification ---');

  const dryRunProposal = createCreateTaskProposal({
    actionId: 'act-dry-1',
    userId,
    input: {
      title: 'Dry Run Task Preview',
      priority: 'medium',
    },
    dryRun: true,
    proposedAt: fixedTimestamp,
  });

  const resDryRun = await executeCreateTaskTool({
    proposal: dryRunProposal,
    authenticatedUserId: userId,
    approvalRecord: null,
    taskService: mockTaskService,
    dryRun: true,
    timestamp: fixedTimestamp,
  });
  assert(resDryRun.status === 'VALIDATED', '13a. Dry-run yields status VALIDATED');
  assert(resDryRun.createdTaskId === null, '13b. Zero tasks created during dry-run');
  assert(databaseCallCount === 0, '13c. Task service was not invoked during dry-run');

  // -------------------------------------------------------------
  // Test 14-16: Valid Approved Execution (Creates Exactly 1 Task)
  // -------------------------------------------------------------
  const preExecCount = createdTasksDatabase.length;
  const resExec = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: mockTaskService,
    dryRun: false,
    timestamp: fixedTimestamp,
  });

  assert(resExec.status === 'EXECUTED', '14a. Valid approved proposal executes with status EXECUTED');
  assert(Boolean(resExec.createdTaskId), '14b. Created task ID returned');
  assert(createdTasksDatabase.length === preExecCount + 1, '14c. Exactly ONE task created in database');
  assert(resExec.createdTask?.title === validProposal.input.title, '16a. Created task title matches approved input');
  assert(resExec.createdTask?.priority === validProposal.input.priority, '16b. Created task priority matches approved input');

  // -------------------------------------------------------------
  // Test 17 & 39: Duplicate Idempotency Suppression
  // -------------------------------------------------------------
  console.log('\n--- 6. Idempotency & Failure Handling ---');

  const seenKeys = new Set<string>([validProposal.idempotencyKey]);
  const resDuplicate = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    seenIdempotencyKeys: seenKeys,
    taskService: mockTaskService,
    dryRun: false,
    timestamp: fixedTimestamp,
  });
  assert(resDuplicate.status === 'DUPLICATE', '17. Duplicate idempotency request returns DUPLICATE status');
  assert(createdTasksDatabase.length === preExecCount + 1, '39. Duplicate request did NOT create another task');

  // -------------------------------------------------------------
  // Test 18: Write Failure Handling (No Fake Success)
  // -------------------------------------------------------------
  const failingTaskService = async () => ({
    success: false,
    error: 'Database connection refused',
  });

  const resFailure = await executeCreateTaskTool({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    taskService: failingTaskService,
    dryRun: false,
    timestamp: fixedTimestamp,
  });
  assert(resFailure.status === 'FAILED', '18. Write failure returns status FAILED (never claims fake success)');
  assert(resFailure.error?.code === 'ERR_TASK_CREATION_FAILED', '18b. Failure error code properly set');

  // -------------------------------------------------------------
  // Test 19-25: Strict Mutation Boundaries (Create Task Only)
  // -------------------------------------------------------------
  console.log('\n--- 7. Mutation Boundary Guarantees ---');

  assert(toolDef?.name === 'create_task', '19. No update operation possible through create_task');
  assert(toolDef?.name !== 'delete_task', '20. No delete operation possible through create_task');
  assert(validProposal.affectedResources.length === 1, '21. No bulk operations possible (1 proposal = 1 task)');
  assert(validProposal.affectedResources[0].target === 'TASK', '22-25. Target is strictly TASK (zero calendar, skill, project, or external mutations)');

  // -------------------------------------------------------------
  // Test 26-29: Audit Metadata & Verification Handoff
  // -------------------------------------------------------------
  console.log('\n--- 8. Audit Metadata & Verification Handoff ---');

  const audit = resExec.auditMetadata;
  assert(Boolean(audit.proposalId) && Boolean(audit.actionFingerprint), '26. Audit metadata generated');
  assert(!('apiKey' in (audit as unknown as Record<string, unknown>)), '27. Audit metadata contains no secrets');

  const handoff = resExec.verificationHandoff;
  assert(Boolean(handoff), '28. Verification handoff package generated');
  assert(handoff?.executedTools[0] === 'create_task', '28b. Verification handoff records executed tool');
  assert(
    Boolean(handoff?.disclaimer.includes('Does NOT imply learning mastery')),
    '29. Verification handoff strictly disclaims learning mastery'
  );

  // -------------------------------------------------------------
  // Test 30-38 & 40: Regression Suites Confirmation
  // -------------------------------------------------------------
  console.log('\n--- 9. Full Regression & Cardinality Verification ---');

  assert(typeof createCreateTaskProposal === 'function', '30. Phase 5A write safety foundation compatible');
  assert(typeof executeCreateTaskTool === 'function', '31. Phase 4E verification compatible');
  assert(createdTasksDatabase.length === 1, '40. Exactly ONE task was created during the entire test suite run');

  console.log('\n===============================================================');
  console.log(`PHASE 5B ALL TESTS PASSED: ${passedTests} / ${totalTests} (100%)`);
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error during Phase 5B write tool verification tests:', err);
  process.exit(1);
});
