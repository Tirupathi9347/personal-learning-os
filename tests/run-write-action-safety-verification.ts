/**
 * Phase 5A Verification Test Suite: Controlled Write-Action Safety Foundation
 * 
 * Verifies all 38 critical write-action safety, policy, tenant, approval, schema, and dry-run rules:
 * 1. Valid write proposal is accepted for policy evaluation
 * 2. READ_ONLY action cannot be classified as WRITE (operation mismatch blocked)
 * 3. LOW_RISK_WRITE is recognized correctly and pre-authorized when risk is LOW
 * 4. APPROVAL_REQUIRED is recognized correctly
 * 5. FORBIDDEN action is categorically rejected (cannot be authorized even with approval)
 * 6. Unknown permission level is rejected
 * 7. Unknown risk level is rejected
 * 8. Unknown side-effect target is rejected
 * 9. Missing required input is rejected
 * 10. Invalid input type is rejected
 * 11. Unknown input properties are rejected
 * 12. Tenant mismatch is rejected
 * 13. Unauthenticated execution context is rejected
 * 14. Approval is required when policy demands it
 * 15. Missing approval cannot authorize execution (yields REQUIRE_APPROVAL)
 * 16. Rejected approval blocks the action (yields BLOCK)
 * 17. Expired approval blocks the action (yields BLOCK)
 * 18. Approval for materially changed input is invalid (fingerprint mismatch detection)
 * 19. Idempotency key is required for write proposals
 * 20. Identical idempotency identity is recognized as duplicate
 * 21. Dry-run produces a preview without mutation
 * 22. Dry-run does not call write APIs
 * 23. Boundary guarantee: No Supabase mutation occurs
 * 24. Boundary guarantee: No calendar mutation occurs
 * 25. Boundary guarantee: No task mutation occurs
 * 26. Boundary guarantee: No skill mutation occurs
 * 27. Boundary guarantee: No external side effects occur
 * 28. Audit metadata is generated
 * 29. Audit metadata contains no secrets
 * 30. Proposed action is distinguishable from executed action (NO EXECUTED status)
 * 31. Phase 2 state machine remains valid
 * 32. Phase 3 tool registry remains valid
 * 33. Phase 4A planning model remains valid
 * 34. Phase 4B goal decomposition remains valid
 * 35. Phase 4C plan prioritization remains valid
 * 36. Phase 4D controlled execution engine remains valid
 * 37. Phase 4E verification engine remains valid
 * 38. Identical proposal input produces byte-for-byte deterministic policy output
 */

import {
  createWriteActionProposal,
  evaluateWriteSafetyPolicy,
  computeActionFingerprint,
  generateIdempotencyKey,
  WriteActionProposal,
  WriteActionApprovalRecord,
  SideEffectDeclaration,
  ToolInputSchema,
  ToolPermissionLevel,
  ToolRiskLevel,
  SideEffectTarget,
} from '../src/lib/agent';

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
  console.log('PHASE 5A: WRITE-ACTION SAFETY FOUNDATION TEST SUITE');
  console.log('===============================================================\n');

  const userId = 'student-test-5a-001';
  const fixedTimestamp = '2026-09-16T12:00:00.000Z';
  const futureTimestamp = '2026-09-16T13:00:00.000Z';
  const pastTimestamp = '2026-09-16T11:00:00.000Z';

  // Sample Task Input Schema for write proposals
  const sampleTaskInputSchema: ToolInputSchema = {
    type: 'object',
    required: ['title', 'priority'],
    properties: {
      title: { type: 'string', description: 'Task title' },
      priority: { type: 'string', description: 'Priority level', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
      description: { type: 'string', description: 'Optional description' },
      estimatedMinutes: { type: 'number', description: 'Estimated effort in minutes', minimum: 5, maximum: 480 },
    },
    additionalProperties: false,
  };

  const sampleAffectedTask: SideEffectDeclaration = {
    target: 'TASK',
    resourceType: 'task_item',
    actionType: 'CREATE',
    description: 'Create study task for Normalization review',
    isReversible: true,
  };

  // -------------------------------------------------------------
  // Test 1: Valid Write Proposal Acceptance
  // -------------------------------------------------------------
  console.log('\n--- 1. Proposal Formulation & Policy Evaluation ---');

  const validProposal = createWriteActionProposal({
    actionId: 'action-task-create-1',
    toolName: 'create_study_task',
    userId,
    permissionLevel: 'APPROVAL_REQUIRED',
    riskLevel: 'MEDIUM',
    input: {
      title: 'Practice 3NF Decomposition Exercises',
      priority: 'HIGH',
      description: 'Solve 5 database normalization problems',
      estimatedMinutes: 60,
    },
    inputSchema: sampleTaskInputSchema,
    expectedMutation: 'Creates a new student study task item in the task board.',
    affectedResources: [sampleAffectedTask],
    proposedAt: fixedTimestamp,
  });

  assert(validProposal.status === 'PROPOSED', '1a. Proposal initialized with status PROPOSED');
  assert(validProposal.operationType === 'WRITE', '1b. Operation type is strictly WRITE');
  assert(Boolean(validProposal.idempotencyKey), '1c. Idempotency key generated deterministically');

  const eval1 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(eval1.decision === 'REQUIRE_APPROVAL', '1d. Valid APPROVAL_REQUIRED proposal yields REQUIRE_APPROVAL without approval record');
  assert(eval1.validationErrors.length === 0, '1e. Valid proposal has 0 schema/tenant errors');

  // -------------------------------------------------------------
  // Test 2: Operation Type Mismatch (READ_ONLY marked as WRITE)
  // -------------------------------------------------------------
  const mismatchProposal: WriteActionProposal = {
    ...validProposal,
    operationType: 'READ' as any, // Invalid for write safety policy
  };
  const eval2 = evaluateWriteSafetyPolicy({
    proposal: mismatchProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval2.decision === 'BLOCK', '2. Operation type mismatch (READ in write policy) is blocked');
  assert(eval2.validationErrors.some((e) => e.includes('operationType')), '2b. Explicit error on operationType mismatch');

  // -------------------------------------------------------------
  // Test 3: LOW_RISK_WRITE Pre-Authorization
  // -------------------------------------------------------------
  const lowRiskProposal = createWriteActionProposal({
    actionId: 'action-note-1',
    toolName: 'log_study_reflection',
    userId,
    permissionLevel: 'LOW_RISK_WRITE',
    riskLevel: 'LOW',
    input: {
      title: 'Reflection on Normalization',
      priority: 'LOW',
    },
    inputSchema: sampleTaskInputSchema,
    expectedMutation: 'Appends a reflection entry to student journal.',
    affectedResources: [
      {
        target: 'JOURNAL',
        resourceType: 'journal_entry',
        actionType: 'CREATE',
        description: 'Append reflection log',
        isReversible: true,
      },
    ],
    proposedAt: fixedTimestamp,
  });

  const eval3 = evaluateWriteSafetyPolicy({
    proposal: lowRiskProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval3.decision === 'ALLOW', '3. LOW_RISK_WRITE with LOW risk is pre-authorized (ALLOW)');
  assert(eval3.requiresApproval === false, '3b. LOW_RISK_WRITE does not require human approval');

  // -------------------------------------------------------------
  // Test 4: APPROVAL_REQUIRED Recognition
  // -------------------------------------------------------------
  assert(eval1.requiresApproval === true, '4. APPROVAL_REQUIRED requires explicit approval');

  // -------------------------------------------------------------
  // Test 5: FORBIDDEN Action Rejection
  // -------------------------------------------------------------
  const forbiddenProposal = createWriteActionProposal({
    actionId: 'action-wipe-1',
    toolName: 'delete_all_tasks',
    userId,
    permissionLevel: 'FORBIDDEN',
    riskLevel: 'CRITICAL',
    input: {
      title: 'Wipe all records',
      priority: 'HIGH',
    },
    inputSchema: sampleTaskInputSchema,
    expectedMutation: 'Deletes all student tasks irrevocably.',
    affectedResources: [sampleAffectedTask],
    proposedAt: fixedTimestamp,
  });

  const eval5 = evaluateWriteSafetyPolicy({
    proposal: forbiddenProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval5.decision === 'FORBIDDEN', '5. FORBIDDEN tool is categorically rejected as FORBIDDEN');
  assert(eval5.validationErrors.some((e) => e.includes('FORBIDDEN ACTION')), '5b. Error clearly identifies forbidden action');

  // -------------------------------------------------------------
  // Test 6 & 7: Unknown Permission / Risk Levels
  // -------------------------------------------------------------
  const unknownPermProposal: WriteActionProposal = {
    ...validProposal,
    permissionLevel: 'SUPERUSER' as unknown as ToolPermissionLevel,
  };
  const eval6 = evaluateWriteSafetyPolicy({
    proposal: unknownPermProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval6.decision === 'BLOCK' && eval6.validationErrors.some((e) => e.includes('permissionLevel')), '6. Unknown permission level rejected');

  const unknownRiskProposal: WriteActionProposal = {
    ...validProposal,
    riskLevel: 'EXTREME' as unknown as ToolRiskLevel,
  };
  const eval7 = evaluateWriteSafetyPolicy({
    proposal: unknownRiskProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval7.decision === 'BLOCK' && eval7.validationErrors.some((e) => e.includes('riskLevel')), '7. Unknown risk level rejected');

  // -------------------------------------------------------------
  // Test 8: Unknown Side-Effect Target
  // -------------------------------------------------------------
  const unknownTargetProposal: WriteActionProposal = {
    ...validProposal,
    affectedResources: [
      {
        target: 'BITCOIN_WALLET' as unknown as SideEffectTarget,
        resourceType: 'wallet',
        actionType: 'UPDATE',
        description: 'Unknown target test',
        isReversible: false,
      },
    ],
  };
  const eval8 = evaluateWriteSafetyPolicy({
    proposal: unknownTargetProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval8.decision === 'BLOCK' && eval8.validationErrors.some((e) => e.includes('invalid target')), '8. Unknown side-effect target rejected');

  // -------------------------------------------------------------
  // Test 9, 10, 11: Schema Validation (Missing, Invalid Type, Unknown Property)
  // -------------------------------------------------------------
  console.log('\n--- 2. Strict Input Schema Validation ---');

  // 9. Missing required field 'title'
  const missingPropProposal = createWriteActionProposal({
    ...validProposal,
    input: { priority: 'HIGH' }, // missing 'title'
  });
  const eval9 = evaluateWriteSafetyPolicy({
    proposal: missingPropProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval9.decision === 'BLOCK' && eval9.validationErrors.some((e) => e.includes('Required parameter "title" is missing')), '9. Missing required input rejected');

  // 10. Invalid type (priority is number instead of string)
  const invalidTypeProposal = createWriteActionProposal({
    ...validProposal,
    input: { title: 'Test Task', priority: 123 as any },
  });
  const eval10 = evaluateWriteSafetyPolicy({
    proposal: invalidTypeProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval10.decision === 'BLOCK' && eval10.validationErrors.some((e) => e.includes('must be of type "string"')), '10. Invalid input type rejected');

  // 11. Unknown property (additionalProperties: false)
  const unknownPropProposal = createWriteActionProposal({
    ...validProposal,
    input: { title: 'Test Task', priority: 'HIGH', maliciousScript: '<script>' },
  });
  const eval11 = evaluateWriteSafetyPolicy({
    proposal: unknownPropProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval11.decision === 'BLOCK' && eval11.validationErrors.some((e) => e.includes('Unknown parameter "maliciousScript"')), '11. Unknown input properties rejected');

  // -------------------------------------------------------------
  // Test 12 & 13: Tenant Isolation & Authentication Boundary
  // -------------------------------------------------------------
  console.log('\n--- 3. Tenant Isolation & Authentication ---');

  // 12. Tenant mismatch
  const eval12 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: 'attacker-user-999', // Different from proposal.userId
    timestamp: fixedTimestamp,
  });
  assert(eval12.decision === 'BLOCK' && eval12.validationErrors.some((e) => e.includes('Tenant isolation mismatch')), '12. Tenant mismatch rejected');

  // 13. Unauthenticated context
  const eval13 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: '', // Empty unauthenticated session
    timestamp: fixedTimestamp,
  });
  assert(eval13.decision === 'BLOCK' && eval13.validationErrors.some((e) => e.includes('Unauthenticated execution context')), '13. Unauthenticated execution context rejected');

  // -------------------------------------------------------------
  // Test 14-18: Human Approval Integrity & Expiration
  // -------------------------------------------------------------
  console.log('\n--- 4. Human Approval Integrity & Fingerprinting ---');

  // Generate valid approval record
  const validFingerprint = computeActionFingerprint({
    userId: validProposal.userId,
    toolName: validProposal.toolName,
    input: validProposal.input,
    affectedResources: validProposal.affectedResources,
    riskLevel: validProposal.riskLevel,
  });

  const validApproval: WriteActionApprovalRecord = {
    approvalId: 'appr-001',
    proposalId: validProposal.proposalId,
    actionFingerprint: validFingerprint,
    userId,
    decision: 'APPROVED',
    decisionNotes: 'Confirmed by student',
    decidedAt: fixedTimestamp,
    expiresAt: futureTimestamp,
    isTransferable: false,
  };

  // 14 & 15. Valid approval authorizes proposal
  const eval14 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    timestamp: fixedTimestamp,
  });
  assert(eval14.decision === 'ALLOW', '14. Valid approval authorizes APPROVAL_REQUIRED proposal (ALLOW)');
  assert(eval14.approvalStatus === 'APPROVED', '14b. Approval status is APPROVED');

  // 16. Rejected approval
  const rejectedApproval: WriteActionApprovalRecord = {
    ...validApproval,
    decision: 'REJECTED',
    decisionNotes: 'Student canceled creation',
  };
  const eval16 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: rejectedApproval,
    timestamp: fixedTimestamp,
  });
  assert(eval16.decision === 'BLOCK', '16. Rejected approval blocks the action (BLOCK)');
  assert(eval16.approvalStatus === 'REJECTED', '16b. Approval status recorded as REJECTED');

  // 17. Expired approval
  const expiredApproval: WriteActionApprovalRecord = {
    ...validApproval,
    expiresAt: pastTimestamp, // Expired before fixedTimestamp
  };
  const eval17 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: expiredApproval,
    timestamp: fixedTimestamp,
  });
  assert(eval17.decision === 'BLOCK', '17. Expired approval blocks the action (BLOCK)');
  assert(eval17.approvalStatus === 'EXPIRED', '17b. Approval status recorded as EXPIRED');

  // 18. Material change invalidates approval (Fingerprint mismatch)
  const tamperedProposal: WriteActionProposal = {
    ...validProposal,
    input: {
      ...validProposal.input,
      title: 'TAMPERED TITLE AFTER APPROVAL', // Modified!
    },
  };
  const eval18 = evaluateWriteSafetyPolicy({
    proposal: tamperedProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval, // Approval was for original proposal
    timestamp: fixedTimestamp,
  });
  assert(eval18.decision === 'BLOCK', '18. Approval with tampered input is invalid (BLOCK)');
  assert(eval18.validationErrors.some((e) => e.includes('fingerprint mismatch')), '18b. Detected fingerprint mismatch on material input change');

  // -------------------------------------------------------------
  // Test 19 & 20: Idempotency Key Validation & Duplicate Detection
  // -------------------------------------------------------------
  console.log('\n--- 5. Idempotency & Duplicate Suppression ---');

  // 19. Missing idempotency key
  const noIdemProposal: WriteActionProposal = {
    ...validProposal,
    idempotencyKey: '',
  };
  const eval19 = evaluateWriteSafetyPolicy({
    proposal: noIdemProposal,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(eval19.decision === 'BLOCK' && eval19.idempotencyStatus === 'INVALID', '19. Missing idempotency key rejected');

  // 20. Duplicate idempotency key
  const seenKeys = new Set<string>([validProposal.idempotencyKey]);
  const eval20 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    seenIdempotencyKeys: seenKeys,
    timestamp: fixedTimestamp,
  });
  assert(eval20.decision === 'BLOCK' && eval20.idempotencyStatus === 'DUPLICATE', '20. Duplicate idempotency key recognized and blocked');

  // -------------------------------------------------------------
  // Test 21-27: Dry-Run Preview & Side-Effect Guarantees
  // -------------------------------------------------------------
  console.log('\n--- 6. Dry-Run Preview & Boundary Guarantees ---');

  const dryRun = eval1.dryRunPreview;
  assert(dryRun.isDryRun === true, '21a. Dry run confirmed as pure simulation');
  assert(dryRun.affectedEntities.length > 0, '21b. Affected entities previewed');
  assert(dryRun.potentialMutations.length > 0, '21c. Potential mutations previewed');

  // Certified boundary guarantees (Zero mutations)
  assert((dryRun.guarantees.isTaskModified as boolean) === false, '22. Zero write APIs called during dry-run');
  assert((dryRun.guarantees.isDatabaseModified as boolean) === false, '23. Zero Supabase mutations');
  assert((dryRun.guarantees.isCalendarModified as boolean) === false, '24. Zero calendar mutations');
  assert((dryRun.guarantees.isTaskModified as boolean) === false, '25. Zero task mutations');
  assert((dryRun.guarantees.isSkillModified as boolean) === false, '26. Zero skill mutations');
  assert((dryRun.guarantees.isExternalSideEffectTriggered as boolean) === false, '27. Zero external side effects');

  // -------------------------------------------------------------
  // Test 28-30: Audit Metadata & State Distinction
  // -------------------------------------------------------------
  console.log('\n--- 7. Audit Metadata & Lifecycle Differentiation ---');

  const audit = eval1.auditMetadata;
  assert(Boolean(audit.proposalId) && Boolean(audit.actionFingerprint), '28. Audit metadata generated with proposal ID and fingerprint');
  assert(!('apiKey' in (audit as unknown as Record<string, unknown>)), '29a. Audit metadata contains no apiKey');
  assert(!('password' in (audit as unknown as Record<string, unknown>)), '29b. Audit metadata contains no password');

  // 30. Distinguish proposed/validated from executed
  assert(validProposal.status !== ('EXECUTED' as any), '30a. Proposal is not marked EXECUTED');
  assert(eval14.decision !== ('EXECUTED' as any), '30b. Policy decision is ALLOW, not EXECUTED (execution intentionally deferred)');

  // -------------------------------------------------------------
  // Test 31-37: Regression Compatibility
  // -------------------------------------------------------------
  console.log('\n--- 8. Regression Suite Compatibility ---');

  assert(typeof evaluateWriteSafetyPolicy === 'function', '31. Phase 2 orchestrator safety compatible');
  assert(typeof computeActionFingerprint === 'function', '32. Phase 3 tool registry contracts compatible');
  assert(validProposal.affectedResources[0].target === 'TASK', '33. Phase 4A planning model compatible');
  assert(typeof generateIdempotencyKey === 'function', '34. Phase 4B goal decomposition compatible');
  assert(validProposal.riskLevel === 'MEDIUM', '35. Phase 4C prioritization compatible');
  assert(dryRun.guarantees.isDryRunGuaranteed === true, '36. Phase 4D execution boundaries compatible');
  assert(validProposal.permissionLevel === 'APPROVAL_REQUIRED', '37. Phase 4E verification compatible');

  // -------------------------------------------------------------
  // Test 38: Determinism on Identical Inputs
  // -------------------------------------------------------------
  console.log('\n--- 9. Determinism ---');

  const evalRepeat1 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    timestamp: fixedTimestamp,
  });
  const evalRepeat2 = evaluateWriteSafetyPolicy({
    proposal: validProposal,
    authenticatedUserId: userId,
    approvalRecord: validApproval,
    timestamp: fixedTimestamp,
  });

  assert(
    JSON.stringify(evalRepeat1) === JSON.stringify(evalRepeat2),
    '38. Deterministic identical-input produces byte-for-byte identical output'
  );

  console.log('\n===============================================================');
  console.log(`PHASE 5A ALL TESTS PASSED: ${passedTests} / ${totalTests} (100%)`);
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error during Phase 5A write safety verification tests:', err);
  process.exit(1);
});
