/**
 * Phase 3A: Tool Registry Architecture Verification Suite
 * 
 * Verifies:
 * 1. Valid tool registration (READ_ONLY, LOW_RISK_WRITE, APPROVAL_REQUIRED).
 * 2. Duplicate-name rejection.
 * 3. Invalid/incomplete definition rejection.
 * 4. Tool lookup & existence checks.
 * 5. Read-only vs write mutation classification and separation.
 * 6. Permission and risk metadata enforcement (including contradiction prevention).
 * 7. Safe handling of an empty registry.
 * 8. Machine-readable input schema validation.
 */

import {
  createToolRegistry,
  ToolRegistryError,
  validateToolDefinition,
  ToolDefinition,
} from '../src/lib/agent/tool-registry';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runToolRegistryVerification() {
  console.log('------------------------------------------------------------------');
  console.log('🛠️  RUNNING TOOL REGISTRY ARCHITECTURE VERIFICATION (PHASE 3A)');
  console.log('------------------------------------------------------------------\n');

  const registry = createToolRegistry();

  // Test 1: Safe Handling of an Empty Registry
  console.log('Test 1: Verifying Safe Handling of an Empty Registry...');
  assert(registry.getToolCount() === 0, 'Empty registry should have count 0');
  assert(registry.getToolNames().length === 0, 'Empty registry should return empty names array');
  assert(registry.getTool('non_existent') === undefined, 'Non-existent lookup should return undefined safely');
  assert(registry.hasTool('non_existent') === false, 'hasTool should return false for empty registry');
  assert(registry.listTools().length === 0, 'listTools on empty registry should return empty array');
  assert(registry.getReadOnlyTools().length === 0, 'getReadOnlyTools should return empty array');
  assert(registry.getMutationTools().length === 0, 'getMutationTools should return empty array');
  assert(registry.getToolsRequiringApproval().length === 0, 'getToolsRequiringApproval should return empty array');
  console.log('   ✅ Empty registry safely returns zero counts, empty lists, and undefined lookups without crashing.\n');

  // Test 2: Valid Tool Registration
  console.log('Test 2: Verifying Valid Tool Registration across Permission Tiers...');
  
  const readTool: ToolDefinition = {
    name: 'get_student_tasks',
    description: 'Retrieves pending and completed learning tasks for the authenticated student.',
    category: 'TASK_MANAGEMENT',
    operationType: 'READ',
    permissionLevel: 'READ_ONLY',
    riskLevel: 'LOW',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by task status',
          enum: ['pending', 'in_progress', 'completed'],
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return',
        },
      },
    },
    outputSchema: {
      type: 'array',
      description: 'List of task records matching the query',
    },
    auditMetadata: {
      targetEntity: 'tasks',
      affectsStudentData: false,
      isReversible: true,
      requiresUserConfirmation: false,
      auditDescription: 'Pure read query of student task list',
    },
    tags: ['tasks', 'read', 'telemetry'],
  };

  const lowRiskWriteTool: ToolDefinition = {
    name: 'log_journal_note',
    description: 'Appends a reflective study journal entry to the student learning log.',
    category: 'JOURNAL_AND_NOTES',
    operationType: 'WRITE',
    permissionLevel: 'LOW_RISK_WRITE',
    riskLevel: 'LOW',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Title of the journal entry',
        },
        content: {
          type: 'string',
          description: 'Body content of the study note',
        },
      },
      required: ['title', 'content'],
    },
    outputSchema: {
      type: 'object',
      description: 'Created journal entry record',
    },
    auditMetadata: {
      targetEntity: 'journal',
      affectsStudentData: true,
      isReversible: true,
      requiresUserConfirmation: false,
      auditDescription: 'Safe append-only student journal note',
    },
    tags: ['journal', 'write', 'notes'],
  };

  const approvalRequiredTool: ToolDefinition = {
    name: 'reschedule_exam_deadline',
    description: 'Reschedules an active course exam deadline and alters associated study plans.',
    category: 'SCHEDULE_AND_TIME',
    operationType: 'WRITE',
    permissionLevel: 'APPROVAL_REQUIRED',
    riskLevel: 'HIGH',
    inputSchema: {
      type: 'object',
      properties: {
        examId: {
          type: 'string',
          description: 'Target exam ID to reschedule',
        },
        newDate: {
          type: 'string',
          description: 'New ISO date for the exam',
        },
        reason: {
          type: 'string',
          description: 'Justification for rescheduling',
        },
      },
      required: ['examId', 'newDate'],
    },
    outputSchema: {
      type: 'object',
      description: 'Updated exam schedule record',
    },
    auditMetadata: {
      targetEntity: 'calendar',
      affectsStudentData: true,
      isReversible: false,
      requiresUserConfirmation: true,
      auditDescription: 'High-impact schedule change requiring explicit student approval',
    },
    tags: ['calendar', 'schedule', 'approval_required'],
  };

  registry.registerTool(readTool);
  registry.registerTool(lowRiskWriteTool);
  registry.registerTool(approvalRequiredTool);

  assert(registry.getToolCount() === 3, 'Registry count should be 3 after valid registrations');
  assert(registry.hasTool('get_student_tasks'), 'Registry should contain get_student_tasks');
  assert(registry.hasTool('log_journal_note'), 'Registry should contain log_journal_note');
  assert(registry.hasTool('reschedule_exam_deadline'), 'Registry should contain reschedule_exam_deadline');
  console.log('   ✅ Successfully registered READ_ONLY, LOW_RISK_WRITE, and APPROVAL_REQUIRED tools.\n');

  // Test 3: Duplicate Tool Name Rejection
  console.log('Test 3: Verifying Duplicate Tool Name Rejection...');
  let duplicateRejected = false;
  try {
    registry.registerTool({ ...readTool });
  } catch (err) {
    if (err instanceof ToolRegistryError && err.code === 'ERR_DUPLICATE_TOOL') {
      duplicateRejected = true;
    }
  }
  assert(duplicateRejected, 'Registering a tool with an existing name must throw ERR_DUPLICATE_TOOL');
  console.log('   ✅ Duplicate tool registration strictly blocked with ERR_DUPLICATE_TOOL.\n');

  // Test 4: Invalid Definition Rejection
  console.log('Test 4: Verifying Incomplete / Invalid Tool Definition Rejection...');
  
  // 4a. Missing name
  const missingName = { ...readTool, name: '' };
  assert(!validateToolDefinition(missingName).isValid, 'Missing name should fail validation');

  // 4b. Invalid name format (uppercase/symbols)
  const invalidName = { ...readTool, name: 'GetStudentTasks!' };
  assert(!validateToolDefinition(invalidName).isValid, 'Invalid name format should fail validation');

  // 4c. Short description
  const shortDesc = { ...readTool, name: 'valid_tool_name', description: 'short' };
  assert(!validateToolDefinition(shortDesc).isValid, 'Short description should fail validation');

  // 4d. Missing input schema
  const missingInputSchema = { ...readTool, name: 'valid_tool_2', inputSchema: undefined as any };
  assert(!validateToolDefinition(missingInputSchema).isValid, 'Missing input schema should fail validation');

  // 4e. Undeclared required property in schema
  const undeclaredReq = {
    ...readTool,
    name: 'valid_tool_3',
    inputSchema: {
      type: 'object' as const,
      properties: { a: { type: 'string' as const, description: 'desc' } },
      required: ['b'],
    },
  };
  assert(!validateToolDefinition(undeclaredReq).isValid, 'Undeclared required property must fail validation');

  // 4f. Missing audit metadata
  const missingAudit = { ...readTool, name: 'valid_tool_4', auditMetadata: undefined as any };
  assert(!validateToolDefinition(missingAudit).isValid, 'Missing audit metadata must fail validation');

  console.log('   ✅ Incomplete, malformed, and invalid tool definitions are strictly rejected.\n');

  // Test 5: Read-Only vs Mutation Classification
  console.log('Test 5: Verifying Read-Only vs Mutation Classification & Filtering...');
  const readOnlyTools = registry.getReadOnlyTools();
  const mutationTools = registry.getMutationTools();
  const approvalTools = registry.getToolsRequiringApproval();

  assert(readOnlyTools.length === 1, 'Should have exactly 1 read-only tool');
  assert(readOnlyTools[0].name === 'get_student_tasks', 'Read-only tool must be get_student_tasks');
  assert(readOnlyTools[0].operationType === 'READ', 'Read tool operationType must be READ');
  assert(readOnlyTools[0].permissionLevel === 'READ_ONLY', 'Read tool permission must be READ_ONLY');

  assert(mutationTools.length === 2, 'Should have exactly 2 mutation tools');
  assert(mutationTools.every((t) => t.operationType === 'WRITE'), 'All mutation tools must be operationType WRITE');
  assert(
    mutationTools.every((t) => t.permissionLevel !== 'READ_ONLY'),
    'No mutation tool can have READ_ONLY permission'
  );

  assert(approvalTools.length === 1, 'Should have exactly 1 tool requiring approval');
  assert(approvalTools[0].name === 'reschedule_exam_deadline', 'Approval tool must be reschedule_exam_deadline');
  console.log('   ✅ Read-only and mutation tools cleanly separated without cross-contamination.\n');

  // Test 6: Permission / Risk Metadata & Contradiction Enforcement
  console.log('Test 6: Verifying Permission / Risk Metadata Contradiction Enforcement...');

  // 6a. WRITE operation with READ_ONLY permission
  const writeWithReadOnly = {
    ...lowRiskWriteTool,
    name: 'contradictory_write',
    operationType: 'WRITE' as const,
    permissionLevel: 'READ_ONLY' as const,
  };
  const writeCheck = validateToolDefinition(writeWithReadOnly);
  assert(!writeCheck.isValid, 'WRITE operation with READ_ONLY permission must be rejected');
  assert(
    writeCheck.errors.some((e) => e.code === 'ERR_CONTRADICTORY_WRITE_PERMISSION'),
    'Must return ERR_CONTRADICTORY_WRITE_PERMISSION'
  );

  // 6b. READ operation with write permission
  const readWithWritePerm = {
    ...readTool,
    name: 'contradictory_read',
    operationType: 'READ' as const,
    permissionLevel: 'LOW_RISK_WRITE' as const,
  };
  const readCheck = validateToolDefinition(readWithWritePerm);
  assert(!readCheck.isValid, 'READ operation with LOW_RISK_WRITE permission must be rejected');
  assert(
    readCheck.errors.some((e) => e.code === 'ERR_CONTRADICTORY_READ_PERMISSION'),
    'Must return ERR_CONTRADICTORY_READ_PERMISSION'
  );

  // 6c. APPROVAL_REQUIRED permission with requiresUserConfirmation = false
  const approvalWithoutConfirm = {
    ...approvalRequiredTool,
    name: 'contradictory_approval',
    auditMetadata: {
      ...approvalRequiredTool.auditMetadata,
      requiresUserConfirmation: false,
    },
  };
  const approvalCheck = validateToolDefinition(approvalWithoutConfirm);
  assert(!approvalCheck.isValid, 'APPROVAL_REQUIRED without confirmation requirement must be rejected');
  assert(
    approvalCheck.errors.some((e) => e.code === 'ERR_CONTRADICTORY_CONFIRMATION_REQUIREMENT'),
    'Must return ERR_CONTRADICTORY_CONFIRMATION_REQUIREMENT'
  );

  console.log('   ✅ Machine-readable permission invariants strictly enforce non-contradictory metadata.\n');

  // Test 7: Tool Lookup and Discovery Filtering
  console.log('Test 7: Verifying Tool Lookup and Discovery Filtering...');
  const taskTools = registry.getToolsByCategory('TASK_MANAGEMENT');
  assert(taskTools.length === 1 && taskTools[0].name === 'get_student_tasks', 'Category filter should match');

  const lowRiskTools = registry.listTools({ maxRiskLevel: 'LOW' });
  assert(lowRiskTools.length === 2, 'Max risk LOW filter should return 2 tools');

  const taggedNotes = registry.listTools({ tags: ['notes'] });
  assert(taggedNotes.length === 1 && taggedNotes[0].name === 'log_journal_note', 'Tag filter should match');

  const retrievedTool = registry.getTool('reschedule_exam_deadline');
  assert(retrievedTool !== undefined, 'Direct tool lookup should return definition');
  assert(retrievedTool?.riskLevel === 'HIGH', 'Retrieved tool should retain riskLevel HIGH');
  assert(retrievedTool?.auditMetadata.requiresUserConfirmation === true, 'Retrieved tool should retain auditMetadata');

  console.log('   ✅ Tool lookup, category filtering, risk-capping, and tag queries work accurately.\n');

  // Test 8: Runtime Input Schema Validation
  console.log('Test 8: Verifying Input Schema Validation...');
  
  // Valid input for log_journal_note
  const validJournalInput = registry.validateToolInput('log_journal_note', {
    title: 'DBMS Study Session',
    content: 'Reviewed indexing and B+ trees for 2 hours.',
  });
  assert(validJournalInput.isValid, 'Valid journal input should pass schema validation');

  // Missing required parameter
  const missingFieldInput = registry.validateToolInput('log_journal_note', {
    title: 'Missing Content',
  });
  assert(!missingFieldInput.isValid, 'Missing required parameter must fail validation');
  assert(missingFieldInput.errors.some((e) => e.parameter === 'content'), 'Error must specify parameter "content"');

  // Invalid parameter type
  const badTypeInput = registry.validateToolInput('get_student_tasks', {
    limit: 'ten' as any,
  });
  assert(!badTypeInput.isValid, 'String instead of number must fail validation');

  // Invalid enum value
  const badEnumInput = registry.validateToolInput('get_student_tasks', {
    status: 'invalid_status',
  });
  assert(!badEnumInput.isValid, 'Unrecognized enum value must fail validation');

  console.log('   ✅ Input schema validation accurately detects missing fields, bad types, and invalid enums.\n');

  console.log('------------------------------------------------------------------');
  console.log('✨ ALL TOOL REGISTRY ARCHITECTURE (PHASE 3A) TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runToolRegistryVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
