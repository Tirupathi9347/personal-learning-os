/**
 * Automated Verification Suite for Feature 2A: Agent State Model
 * 
 * Verifies:
 * 1. Initial State Creation (IDLE)
 * 2. Full Happy Path Cycle (All canonical 14 states represented)
 * 3. Invalid Transition Prevention (Invalid leaps strictly blocked)
 * 4. Human Approval Workflow (Pause & Resume mechanics)
 * 5. Failure and Controlled Replanning Cycle
 * 6. Safety Limit Enforcement: Max Replans Budget
 * 7. Safety Limit Enforcement: Max Tool Iterations Budget
 * 8. Auditability and Immutable Transition History
 */

import assert from 'assert';
import {
  AgentState,
  createInitialAgentState,
  isValidAgentTransition,
  getValidNextAgentStates,
  transitionAgentState,
  DEFAULT_AGENT_SAFETY_LIMITS,
} from '../src/lib/agent';

async function runStateModelVerificationSuite() {
  console.log('----------------------------------------------------');
  console.log('🤖 RUNNING AGENT STATE MODEL VERIFICATION (FEATURE 2A)');
  console.log('----------------------------------------------------');

  const userId = 'student-test-uid-456';
  const goal = 'Master React Server Components and corroborate proficiency';

  // ----------------------------------------------------
  // TEST 1: Initial State Creation
  // ----------------------------------------------------
  console.log('\nTest 1: Verifying Initial State Creation...');
  let state = createInitialAgentState({
    userId,
    goal,
    eventTrigger: 'MANUAL_GOAL',
  });

  assert.strictEqual(state.currentState, 'IDLE');
  assert.strictEqual(state.previousState, null);
  assert.strictEqual(state.counters.toolIterations, 0);
  assert.strictEqual(state.counters.replans, 0);
  assert.strictEqual(state.context.goal, goal);
  assert.strictEqual(state.transitionHistory.length, 1);
  console.log('   ✅ Initial state created at IDLE with clean counters and history.');

  // ----------------------------------------------------
  // TEST 2: Canonical Happy Path Transition Sequence
  // ----------------------------------------------------
  console.log('\nTest 2: Verifying Canonical Happy Path Cycle...');
  const sequence: { target: AgentState; reason: string }[] = [
    { target: 'GOAL_RECEIVED', reason: 'Student submitted a new learning goal.' },
    { target: 'OBSERVING', reason: 'Collecting student profile, commits, and submissions telemetry.' },
    { target: 'CORROBORATING', reason: 'Corroborating claimed skills against empirical evidence.' },
    { target: 'ASSESSING', reason: 'Calculating evidence-backed confidence scores and skill gaps.' },
    { target: 'PLANNING', reason: 'Generating tailored practice curriculum and tasks.' },
    { target: 'TOOL_SELECTION', reason: 'Selecting automated assessment / task creation tool.' },
    { target: 'EXECUTING', reason: 'Executing selected task provisioning action.' },
    { target: 'VERIFYING', reason: 'Verifying task creation output and preconditions.' },
    { target: 'UPDATING', reason: 'Updating student telemetry and progress records.' },
    { target: 'COMPLETED', reason: 'Goal workflow completed successfully.' },
  ];

  for (const step of sequence) {
    const res = transitionAgentState(state, {
      targetState: step.target,
      reason: step.reason,
    });
    assert(res.success, `Transition to ${step.target} failed: ${res.error?.message}`);
    state = res.state;
    assert.strictEqual(state.currentState, step.target);
  }

  assert.strictEqual(state.currentState, 'COMPLETED');
  assert.strictEqual(state.counters.toolIterations, 2); // TOOL_SELECTION + EXECUTING
  assert.strictEqual(state.counters.totalExecutedActions, 1); // UPDATING
  console.log('   ✅ Successfully completed canonical 10-step lifecycle to COMPLETED.');

  // ----------------------------------------------------
  // TEST 3: Preventing Invalid Transitions
  // ----------------------------------------------------
  console.log('\nTest 3: Verifying Invalid State Transitions are Strictly Blocked...');
  const idleState = createInitialAgentState({ userId, goal });

  const invalidAttempts: [AgentState, AgentState][] = [
    ['IDLE', 'EXECUTING'],
    ['IDLE', 'COMPLETED'],
    ['IDLE', 'VERIFYING'],
    ['OBSERVING', 'EXECUTING'],
    ['CORROBORATING', 'UPDATING'],
    ['ASSESSING', 'EXECUTING'],
  ];

  for (const [from, to] of invalidAttempts) {
    const isAllowed = isValidAgentTransition(from, to);
    assert.strictEqual(isAllowed, false, `Transition from ${from} to ${to} should be blocked`);

    const mockState = { ...idleState, currentState: from };
    const res = transitionAgentState(mockState, {
      targetState: to,
      reason: 'Illegal leap attempt',
    });
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.error?.code, 'ERR_INVALID_TRANSITION');
  }
  console.log('   ✅ All 6 invalid leap attempts were strictly rejected by transition guards.');

  // ----------------------------------------------------
  // TEST 4: Human Approval Pause & Resume Mechanics
  // ----------------------------------------------------
  console.log('\nTest 4: Verifying Human Approval Pause & Resume Flow...');
  let approvalRun = createInitialAgentState({ userId, goal });

  // Move to PLANNING
  approvalRun = transitionAgentState(approvalRun, { targetState: 'GOAL_RECEIVED', reason: 'Goal received' }).state;
  approvalRun = transitionAgentState(approvalRun, { targetState: 'PLANNING', reason: 'Direct planning' }).state;

  // Pause for human approval
  const approvalRes = transitionAgentState(approvalRun, {
    targetState: 'WAITING_FOR_APPROVAL',
    reason: 'Action requires student confirmation.',
    approvalRequest: {
      id: 'req_001',
      actionType: 'DELETE_OBSOLETE_DRAFT_GOAL',
      description: 'Requesting confirmation to remove outdated roadmap node',
      riskLevel: 'HIGH',
      payload: { goalId: 'goal-123' },
      requestedAt: new Date().toISOString(),
      decision: 'PENDING',
    },
  });

  assert(approvalRes.success);
  approvalRun = approvalRes.state;
  assert.strictEqual(approvalRun.currentState, 'WAITING_FOR_APPROVAL');
  assert(approvalRun.activeApprovalRequest !== null);
  assert.strictEqual(approvalRun.activeApprovalRequest.decision, 'PENDING');

  // Human Approves -> Resume to EXECUTING
  const resumeRes = transitionAgentState(approvalRun, {
    targetState: 'EXECUTING',
    reason: 'Student confirmed action.',
    approvalDecision: {
      decision: 'APPROVED',
      notes: 'Approved via modal dialog.',
    },
  });

  assert(resumeRes.success);
  approvalRun = resumeRes.state;
  assert.strictEqual(approvalRun.currentState, 'EXECUTING');
  assert.strictEqual(approvalRun.activeApprovalRequest?.decision, 'APPROVED');
  console.log('   ✅ Human approval pause and resume completed with tracked decision audit.');

  // ----------------------------------------------------
  // TEST 5: Failure and Controlled Replanning Cycle
  // ----------------------------------------------------
  console.log('\nTest 5: Verifying Failure and Controlled Replanning Flow...');
  let replanRun = createInitialAgentState({ userId, goal });
  replanRun = transitionAgentState(replanRun, { targetState: 'GOAL_RECEIVED', reason: 'Start' }).state;
  replanRun = transitionAgentState(replanRun, { targetState: 'PLANNING', reason: 'Plan 1' }).state;
  replanRun = transitionAgentState(replanRun, { targetState: 'TOOL_SELECTION', reason: 'Select tool' }).state;
  replanRun = transitionAgentState(replanRun, { targetState: 'EXECUTING', reason: 'Execute' }).state;
  replanRun = transitionAgentState(replanRun, { targetState: 'VERIFYING', reason: 'Verify' }).state;

  // Verification detects deficit -> trigger REPLANNING
  const replanRes = transitionAgentState(replanRun, {
    targetState: 'REPLANNING',
    reason: 'Verification showed incomplete knowledge mastery, generating remedial exercise.',
  });
  assert(replanRes.success);
  replanRun = replanRes.state;
  assert.strictEqual(replanRun.currentState, 'REPLANNING');
  assert.strictEqual(replanRun.counters.replans, 1);

  // Return to PLANNING -> Complete
  replanRun = transitionAgentState(replanRun, { targetState: 'PLANNING', reason: 'Adjusted remedial plan' }).state;
  replanRun = transitionAgentState(replanRun, { targetState: 'COMPLETED', reason: 'Remedial plan prepared' }).state;
  assert.strictEqual(replanRun.currentState, 'COMPLETED');
  console.log('   ✅ Controlled replan cycle completed with updated counters.');

  // ----------------------------------------------------
  // TEST 6: Safety Limit Enforcement - Max Replans
  // ----------------------------------------------------
  console.log('\nTest 6: Verifying Max Replanning Safety Limit...');
  let safetyRun = createInitialAgentState({
    userId,
    goal,
    safetyLimits: { maxReplans: 2, maxToolIterations: 5, maxConsecutiveFailures: 2 },
  });

  // Replan 1
  safetyRun = transitionAgentState(safetyRun, { targetState: 'GOAL_RECEIVED', reason: 'Init' }).state;
  safetyRun = transitionAgentState(safetyRun, { targetState: 'PLANNING', reason: 'P1' }).state;
  safetyRun = transitionAgentState(safetyRun, { targetState: 'REPLANNING', reason: 'R1' }).state;
  assert.strictEqual(safetyRun.counters.replans, 1);

  // Replan 2
  safetyRun = transitionAgentState(safetyRun, { targetState: 'PLANNING', reason: 'P2' }).state;
  safetyRun = transitionAgentState(safetyRun, { targetState: 'REPLANNING', reason: 'R2' }).state;
  assert.strictEqual(safetyRun.counters.replans, 2);

  // Replan 3 (Should be BLOCKED because maxReplans = 2)
  safetyRun = transitionAgentState(safetyRun, { targetState: 'PLANNING', reason: 'P3' }).state;
  const blockedReplan = transitionAgentState(safetyRun, { targetState: 'REPLANNING', reason: 'R3 attempt' });
  assert.strictEqual(blockedReplan.success, false);
  assert.strictEqual(blockedReplan.error?.code, 'ERR_MAX_REPLANS_EXCEEDED');
  console.log(`   ✅ Replan 3 blocked: Safety limit enforced (${safetyRun.safetyLimits.maxReplans} max).`);

  // ----------------------------------------------------
  // TEST 7: Safety Limit Enforcement - Max Tool Iterations
  // ----------------------------------------------------
  console.log('\nTest 7: Verifying Max Tool Iterations Safety Limit...');
  let toolLimitRun = createInitialAgentState({
    userId,
    goal,
    safetyLimits: { maxToolIterations: 3, maxReplans: 5, maxConsecutiveFailures: 2 },
  });

  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'GOAL_RECEIVED', reason: 'Init' }).state;
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'PLANNING', reason: 'P1' }).state;

  // Tool Iteration 1
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'TOOL_SELECTION', reason: 'T1' }).state;
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'EXECUTING', reason: 'E1' }).state;
  // Tool Iteration 2
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'VERIFYING', reason: 'V1' }).state;
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'UPDATING', reason: 'U1' }).state;
  toolLimitRun = transitionAgentState(toolLimitRun, { targetState: 'TOOL_SELECTION', reason: 'T2' }).state;
  assert.strictEqual(toolLimitRun.counters.toolIterations, 3); // 3 tool state transitions

  // Tool Iteration 4 (Should be BLOCKED because maxToolIterations = 3)
  const blockedTool = transitionAgentState(toolLimitRun, { targetState: 'EXECUTING', reason: 'E2 attempt' });
  assert.strictEqual(blockedTool.success, false);
  assert.strictEqual(blockedTool.error?.code, 'ERR_MAX_TOOL_ITERATIONS_EXCEEDED');
  console.log(`   ✅ Tool execution blocked: Safety limit enforced (${toolLimitRun.safetyLimits.maxToolIterations} max).`);

  // ----------------------------------------------------
  // TEST 8: Full Transition Auditability
  // ----------------------------------------------------
  console.log('\nTest 8: Verifying State Transition History Audit Trail...');
  assert(state.transitionHistory.length >= 10);
  for (const tr of state.transitionHistory) {
    assert(tr.id.startsWith('tr_'));
    assert(tr.timestamp.length > 0);
    assert(tr.reason.length > 0);
  }
  console.log(`   ✅ Complete audit trail verified with ${state.transitionHistory.length} chronological transition records.`);

  console.log('\n----------------------------------------------------');
  console.log('✨ ALL AGENT STATE MODEL (FEATURE 2A) VERIFICATION TESTS PASSED!');
  console.log('----------------------------------------------------');
}

runStateModelVerificationSuite().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
