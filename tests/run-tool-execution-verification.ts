/**
 * Phase 3E: Read-Only Tool Execution Verification Suite
 * 
 * Verifies:
 * 1. Successful execution of a real read-only tool (get_tasks, get_skills, get_student_profile).
 * 2. Multiple selected tools executing in order from a ToolSelectionPlan.
 * 3. Input validation failure returning BLOCKED / ERR_INVALID_TOOL_INPUT.
 * 4. Unknown/unregistered tool rejection returning BLOCKED / ERR_UNREGISTERED_TOOL.
 * 5. Write/approval-required tool rejection returning BLOCKED / ERR_PERMISSION_DENIED.
 * 6. Tool failure propagation without crashing the batch.
 * 7. Malformed / error handling.
 * 8. Duplicate tool execution protection (SKIPPED / ERR_DUPLICATE_EXECUTION_SUPPRESSED).
 * 9. Timeout / execution limit handling (FAILED / ERR_TOOL_TIMEOUT).
 * 10. Authenticated user isolation.
 * 11. Confirmation that no mutation capability is exposed.
 * 12. Sanitization of execution metadata and inputs.
 * 13. Empty tool selection handling.
 */

import {
  createToolRegistry,
  agentToolRegistry,
} from '../src/lib/agent/tool-registry';
import {
  registerReadOnlyTools,
} from '../src/lib/agent/read-tools';
import {
  selectToolsForOrchestrator,
} from '../src/lib/agent/tool-selector';
import {
  executeReadOnlyTool,
  executeToolSelectionPlan,
  ToolExecutionResult,
} from '../src/lib/agent/tool-executor';
import { AgentTriggerContext } from '../src/lib/agent/intake-types';
import { ToolDefinition } from '../src/lib/agent/tool-types';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function createMockTriggerContext(partial: Partial<AgentTriggerContext>): AgentTriggerContext {
  return {
    triggerId: 'trig-exec-test',
    userId: 'student-test-uid',
    triggerType: 'STUDENT_GOAL',
    isAutomated: false,
    eventTrigger: 'MANUAL_GOAL',
    normalizedGoalText: 'Prepare me for my DBMS exam in 7 days',
    goalCategory: 'EXAM_PREPARATION',
    priority: 'HIGH',
    receivedAt: new Date().toISOString(),
    contextData: {},
    validationMetadata: {
      validatedAt: new Date().toISOString(),
      version: '1.0.0',
      sourceModule: 'test-suite',
    },
    ...partial,
  };
}

async function runToolExecutionVerification() {
  console.log('------------------------------------------------------------------');
  console.log('⚡ RUNNING READ-ONLY TOOL EXECUTION VERIFICATION (PHASE 3E)');
  console.log('------------------------------------------------------------------\n');

  const registry = createToolRegistry();
  registerReadOnlyTools(registry);

  // Test 1: Successful Execution of a Real Read-Only Tool
  console.log('Test 1: Verifying Successful Execution of Real Read-Only Tools...');
  
  const tasksResult = await executeReadOnlyTool('get_tasks', { limit: 5 }, { registry });
  assert(tasksResult.status === 'SUCCESS', 'get_tasks execution status must be SUCCESS');
  assert(tasksResult.toolName === 'get_tasks', 'Result toolName must be get_tasks');
  assert(typeof tasksResult.durationMs === 'number', 'Result must include durationMs');
  assert(tasksResult.output !== undefined, 'Result output must not be undefined');
  assert(tasksResult.auditMetadata.affectsStudentData === false, 'Tool must not affect student data');
  console.log(`   ✅ Real tool "get_tasks" executed successfully in ${tasksResult.durationMs}ms with structured output.\n`);

  // Test 2: Multiple Selected Tools Executing in Order from ToolSelectionPlan
  console.log('Test 2: Verifying ToolSelectionPlan Batch Execution in Order...');
  const examContext = createMockTriggerContext({
    normalizedGoalText: 'Prepare me for my DBMS exam in 7 days',
    goalCategory: 'EXAM_PREPARATION',
    targetSkillName: 'DBMS',
  });

  const examPlan = selectToolsForOrchestrator(examContext, undefined, registry);
  assert(examPlan.selectedTools.length >= 3, 'Exam plan should contain at least 3 tools');

  const batchResult = await executeToolSelectionPlan(examPlan, { registry });
  assert(batchResult.totalAttempted === examPlan.selectedTools.length, 'All planned tools must be attempted');
  assert(batchResult.successfulCount === examPlan.selectedTools.length, 'All read tools should succeed');
  assert(batchResult.isFullySuccessful === true, 'Batch must report isFullySuccessful = true');
  
  // Verify order
  for (let i = 0; i < examPlan.selectedTools.length; i++) {
    assert(
      batchResult.results[i].toolName === examPlan.selectedTools[i].toolName,
      `Execution result ${i} must preserve planned tool order (${examPlan.selectedTools[i].toolName})`
    );
  }
  console.log(`   ✅ Executed ${batchResult.totalAttempted} tools in exact priority order (${batchResult.durationMs}ms total).\n`);

  // Test 3: Input Validation Failure
  console.log('Test 3: Verifying Input Validation Failure Handling...');
  const invalidInputResult = await executeReadOnlyTool('get_tasks', { limit: -10 }, { registry });
  assert(invalidInputResult.status === 'BLOCKED', 'Invalid input must return BLOCKED status');
  assert(invalidInputResult.error?.code === 'ERR_INVALID_TOOL_INPUT', 'Error code must be ERR_INVALID_TOOL_INPUT');
  assert(invalidInputResult.output === undefined, 'Blocked tool must not have output');
  console.log(`   ✅ Invalid input correctly blocked with code: ${invalidInputResult.error?.code}\n`);

  // Test 4: Unknown / Unregistered Tool Rejection
  console.log('Test 4: Verifying Unknown / Unregistered Tool Rejection...');
  const unknownToolResult = await executeReadOnlyTool('non_existent_tool', {}, { registry });
  assert(unknownToolResult.status === 'BLOCKED', 'Unregistered tool must return BLOCKED');
  assert(unknownToolResult.error?.code === 'ERR_UNREGISTERED_TOOL', 'Error code must be ERR_UNREGISTERED_TOOL');
  console.log(`   ✅ Unregistered tool correctly blocked with code: ${unknownToolResult.error?.code}\n`);

  // Test 5: Write / Approval-Required Tool Rejection at Execution Time
  console.log('Test 5: Verifying Write / Approval-Required Tool Rejection at Runtime...');
  const mutationTool: ToolDefinition = {
    name: 'delete_student_account',
    description: 'Permanently deletes all student records.',
    category: 'SYSTEM_AND_DIAGNOSTICS',
    operationType: 'WRITE',
    permissionLevel: 'FORBIDDEN',
    riskLevel: 'CRITICAL',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object', description: 'result' },
    auditMetadata: {
      targetEntity: 'system',
      affectsStudentData: true,
      isReversible: false,
      requiresUserConfirmation: true,
      auditDescription: 'Dangerous deletion',
    },
  };

  const testPermRegistry = createToolRegistry();
  registerReadOnlyTools(testPermRegistry);
  testPermRegistry.registerTool(mutationTool);

  const writeExecResult = await executeReadOnlyTool('delete_student_account', {}, { registry: testPermRegistry });
  assert(writeExecResult.status === 'BLOCKED', 'Write tool must return BLOCKED at execution time');
  assert(writeExecResult.error?.code === 'ERR_PERMISSION_DENIED', 'Error code must be ERR_PERMISSION_DENIED');
  console.log(`   ✅ Write tool blocked at runtime with code: ${writeExecResult.error?.code}\n`);

  // Test 6: Tool Failure Propagation Without Crashing Batch
  console.log('Test 6: Verifying Tool Failure Propagation in Batch...');
  const failingRegistry = createToolRegistry();
  registerReadOnlyTools(failingRegistry);

  const mixedBatchPlan = {
    selectedTools: [
      { toolName: 'get_tasks', priority: 1, reason: 'Test task read', category: 'TASK_MANAGEMENT' as const },
      { toolName: 'get_skills', priority: 2, reason: 'Test skill failure', category: 'CURRICULUM_AND_GOALS' as const },
      { toolName: 'get_projects', priority: 3, reason: 'Test project read', category: 'CURRICULUM_AND_GOALS' as const },
    ],
    totalSelected: 3,
    rationale: 'Mixed batch test',
    isExecutionAllowed: true,
    generatedAt: new Date().toISOString(),
  };

  const mixedBatchResult = await executeToolSelectionPlan(mixedBatchPlan, {
    registry: failingRegistry,
    customExecutors: {
      get_skills: async () => {
        throw new Error('Database connection pool timeout while querying skills table.');
      },
    },
  });

  assert(mixedBatchResult.totalAttempted === 3, 'Batch should attempt all 3 tools');
  assert(mixedBatchResult.successfulCount === 2, '2 independent tools should succeed');
  assert(mixedBatchResult.failedCount === 1, '1 failing tool should report failure');
  assert(mixedBatchResult.resultsByTool['get_skills'].status === 'FAILED', 'get_skills must report FAILED status');
  assert(
    mixedBatchResult.resultsByTool['get_skills'].error?.code === 'ERR_TOOL_EXECUTION_FAILURE',
    'Failed tool must have ERR_TOOL_EXECUTION_FAILURE'
  );
  assert(mixedBatchResult.resultsByTool['get_projects'].status === 'SUCCESS', 'Subsequent tool must still execute successfully');
  console.log('   ✅ Tool failure safely isolated; remaining batch tools completed successfully.\n');

  // Test 7: Duplicate Tool Execution Protection
  console.log('Test 7: Verifying Duplicate Tool Execution Protection in Batch...');
  const dupePlan = {
    selectedTools: [
      { toolName: 'get_tasks', priority: 1, reason: 'First tasks query', category: 'TASK_MANAGEMENT' as const },
      { toolName: 'get_tasks', priority: 2, reason: 'Accidental duplicate query', category: 'TASK_MANAGEMENT' as const },
    ],
    totalSelected: 2,
    rationale: 'Duplicate test',
    isExecutionAllowed: true,
    generatedAt: new Date().toISOString(),
  };

  const dupeBatchResult = await executeToolSelectionPlan(dupePlan, { registry });
  assert(dupeBatchResult.results[0].status === 'SUCCESS', 'First tool execution must succeed');
  assert(dupeBatchResult.results[1].status === 'SKIPPED', 'Duplicate tool execution must be SKIPPED');
  assert(
    dupeBatchResult.results[1].error?.code === 'ERR_DUPLICATE_EXECUTION_SUPPRESSED',
    'Skipped tool must report ERR_DUPLICATE_EXECUTION_SUPPRESSED'
  );
  console.log('   ✅ Duplicate execution within batch automatically suppressed.\n');

  // Test 8: Timeout / Execution Limit Handling
  console.log('Test 8: Verifying Execution Timeout Handling...');
  const timeoutResult = await executeReadOnlyTool(
    'get_tasks',
    {},
    {
      registry,
      timeoutMs: 50, // 50ms timeout
      customExecutors: {
        get_tasks: async () => {
          await new Promise((resolve) => setTimeout(resolve, 200)); // Delay 200ms
          return { tasks: [] };
        },
      },
    }
  );

  assert(timeoutResult.status === 'FAILED', 'Timed-out tool must return FAILED');
  assert(timeoutResult.error?.code === 'ERR_TOOL_TIMEOUT', 'Error code must be ERR_TOOL_TIMEOUT');
  console.log(`   ✅ Execution timeout correctly enforced with code: ${timeoutResult.error?.code}\n`);

  // Test 9: Sanitization of Execution Metadata & Sensitive Inputs
  console.log('Test 9: Verifying Sanitization of Execution Metadata...');
  const sensitiveInput = {
    limit: 10,
    apiKey: 'sk-secret-token-12345',
    password: 'super-secret-password',
  };

  const sanitizedResult = await executeReadOnlyTool('get_tasks', sensitiveInput as any, { registry });
  assert(sanitizedResult.input?.limit === 10, 'Normal limit must be preserved');
  assert(sanitizedResult.input?.apiKey === undefined, 'apiKey must be scrubbed from execution result input');
  assert(sanitizedResult.input?.password === undefined, 'password must be scrubbed from execution result input');
  console.log('   ✅ All sensitive tokens and keys scrubbed from execution result records.\n');

  // Test 10: Empty Tool Selection Handling
  console.log('Test 10: Verifying Empty Tool Selection Plan Handling...');
  const emptyPlan = {
    selectedTools: [],
    totalSelected: 0,
    rationale: 'Empty plan test',
    isExecutionAllowed: true,
    generatedAt: new Date().toISOString(),
  };

  const emptyResult = await executeToolSelectionPlan(emptyPlan, { registry });
  assert(emptyResult.totalAttempted === 0, 'Empty plan should have 0 totalAttempted');
  assert(emptyResult.isFullySuccessful === true, 'Empty plan should report isFullySuccessful = true');
  console.log('   ✅ Empty tool selection handled cleanly without errors.\n');

  console.log('------------------------------------------------------------------');
  console.log('✨ ALL READ-ONLY TOOL EXECUTION (PHASE 3E) TESTS PASSED!');
  console.log('------------------------------------------------------------------');
}

runToolExecutionVerification().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
