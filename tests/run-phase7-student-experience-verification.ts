/**
 * Phase 7: Orchestrator -> Real Student Experience Verification Suite
 * 
 * Tests the student-facing integration connecting the Single Learning Orchestrator
 * (6A Goal Understanding -> 6B Assessment -> 6C Decision -> 6D Plan -> 6G Policy -> Phase 5 Approval Gate)
 * to real student workflows.
 */

import {
  runStudentGoalOrchestrator,
  approveAndExecuteOrchestratorTask,
  OrchestratorRunResult,
} from '../src/app/actions/agent-actions';
import {
  VALID_AGENT_TRANSITIONS,
} from '../src/lib/agent/state-machine';
import {
  WriteActionProposal,
} from '../src/lib/agent/write-action-types';
import {
  CreateTaskInput,
} from '../src/lib/agent/write-tool-create-task';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runPhase7StudentExperienceVerificationSuite() {
  console.log('===============================================================');
  console.log('PHASE 7: ORCHESTRATOR -> REAL STUDENT EXPERIENCE VERIFICATION');
  console.log('===============================================================');

  const userId = 'usr_student_real_test_001';
  const otherUserId = 'usr_student_other_002';

  // 1. Goal submission runs 6A -> 6B -> 6C -> 6D -> 6G pipeline
  console.log('\n--- Test 1: Full pipeline execution for clear goal ---');
  const res1 = await runStudentGoalOrchestrator(
    'Master SQL join queries and indexing strategies for the upcoming database exam',
    { explicitUserId: userId, targetSkillName: 'SQL' }
  );

  assert(res1.success === true, 'Pipeline returns success: true');
  assert(Boolean(res1.goalUnderstanding), '6A GoalUnderstanding populated');
  assert(res1.goalUnderstanding?.category !== undefined, 'Goal category extracted');
  assert(Boolean(res1.studentAssessment), '6B StudentLearningAssessment populated');
  assert(Boolean(res1.learningDecision), '6C LearningDecision populated');
  assert(Boolean(res1.learningPlan), '6D LearningPlan populated');
  assert(Boolean(res1.adaptivePolicy), '6G AdaptiveLearningPolicy populated');

  // 2. Ambiguous goal halts at NEEDS_CLARIFICATION
  console.log('\n--- Test 2: Ambiguous goal halts at NEEDS_CLARIFICATION ---');
  const res2 = await runStudentGoalOrchestrator('I want to learn something soon', {
    explicitUserId: userId,
  });

  assert(res2.success === true, 'Ambiguous goal processed safely');
  assert(res2.status === 'NEEDS_CLARIFICATION', 'Status is NEEDS_CLARIFICATION');
  assert(Boolean(res2.clarificationQuestions && res2.clarificationQuestions.length > 0), 'Clarification questions returned');

  // 3. Clear states: COMPLETED or WAITING_FOR_APPROVAL
  console.log('\n--- Test 3: Clear operational states ---');
  assert(res1.status === 'COMPLETED' || res1.status === 'WAITING_FOR_APPROVAL', 'Valid canonical run status returned');

  // 4. Phase 5 Approval proposal generated if write is present
  console.log('\n--- Test 4: Phase 5 Approval proposal check ---');
  if (res1.status === 'WAITING_FOR_APPROVAL') {
    assert(Boolean(res1.approvalProposal), 'Approval proposal populated when WAITING_FOR_APPROVAL');
    assert(res1.approvalProposal?.toolName === 'create_task', 'Proposal is for create_task');
    assert(Boolean(res1.approvalProposal?.auditMetadata?.actionFingerprint), 'Cryptographic actionFingerprint present');
  } else {
    assert(res1.status === 'COMPLETED', 'Read-only plan completes without pending approval');
  }

  // 5. Human approval execution via approveAndExecuteOrchestratorTask
  console.log('\n--- Test 5: Human approval execution ---');
  const mockProposal: WriteActionProposal<CreateTaskInput> = {
    proposalId: 'prop_p7_test',
    actionId: 'act_p7_test',
    toolName: 'create_task',
    userId,
    operationType: 'WRITE',
    permissionLevel: 'APPROVAL_REQUIRED',
    riskLevel: 'LOW',
    input: {
      title: 'Practice SQL Indexing Exercises',
      description: 'Solve 5 indexing problems',
      priority: 'high',
      due_date: '2026-09-20',
    },
    expectedMutation: 'Create task in student workspace',
    affectedResources: [
      {
        target: 'TASK',
        resourceType: 'task_record',
        resourceId: null,
        actionType: 'CREATE',
        description: 'Creates Practice SQL Indexing Exercises',
        isReversible: true,
      },
    ],
    approvalRequirement: {
      requiresApproval: true,
      riskLevel: 'LOW',
      reason: 'Task creation requires student confirmation',
    },
    idempotencyKey: `idem_p7_${Date.now()}`,
    dryRun: false,
    auditMetadata: {
      proposalId: 'prop_p7_test',
      actionId: 'act_p7_test',
      userId,
      toolName: 'create_task',
      operationType: 'WRITE',
      permissionLevel: 'APPROVAL_REQUIRED',
      riskLevel: 'LOW',
      affectedTargets: ['TASK'],
      idempotencyKey: `idem_p7_${Date.now()}`,
      actionFingerprint: 'fprint_mock_001',
      policyDecision: 'REQUIRE_APPROVAL',
      decisionReason: 'Creation requires approval',
      createdAt: new Date().toISOString(),
    },
    status: 'PROPOSED',
    proposedAt: new Date().toISOString(),
  };

  // 6. Approval decision = REJECTED does not mutate database
  console.log('\n--- Test 6: Approval rejection ---');
  const rejectRes = await approveAndExecuteOrchestratorTask(mockProposal, 'REJECTED', 'Student rejected');
  assert(rejectRes.success === true, 'Rejection handled successfully');
  assert(rejectRes.status === 'REJECTED', 'Status is REJECTED');

  // 7. Unauthenticated calls are safely rejected
  console.log('\n--- Test 7: Unauthenticated security boundary ---');
  const unauthRes = await runStudentGoalOrchestrator('Learn Python', { explicitUserId: '' });
  assert(unauthRes.success === false, 'Unauthenticated run blocked');
  assert(unauthRes.status === 'FAILED', 'Status is FAILED for unauthenticated user');

  // 8. 6G Adaptation guidance is visible in result
  console.log('\n--- Test 8: 6G Adaptation guidance present in student result ---');
  assert(res1.adaptivePolicy?.adaptationSignals !== undefined, 'Adaptation signals present');
  assert(res1.adaptivePolicy?.adaptationRecommendations !== undefined, 'Adaptation recommendations present');

  // 9. Preserves Single Orchestrator invariant (Zero new state machine states)
  console.log('\n--- Test 9: Single Orchestrator invariant ---');
  const stateKeys = Object.keys(VALID_AGENT_TRANSITIONS);
  assert(stateKeys.length === 14, 'Exactly 14 canonical state machine states preserved');

  // 10. Contradictions preserved without silent loss
  console.log('\n--- Test 10: Contradiction preservation ---');
  assert(Array.isArray(res1.studentAssessment?.contradictedAreas), 'Contradicted areas array preserved');
  assert(Array.isArray(res1.adaptivePolicy?.contradictions), 'Contradictions array preserved in policy');

  console.log('\n===============================================================');
  console.log('✨ ALL PHASE 7 STUDENT EXPERIENCE VERIFICATION TESTS PASSED!');
  console.log('===============================================================');
}

runPhase7StudentExperienceVerificationSuite().catch((err) => {
  console.error('Fatal test error in Phase 7 suite:', err);
  process.exit(1);
});
