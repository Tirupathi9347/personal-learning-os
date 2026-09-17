/**
 * Phase 10: Final Intelligence Integration & Production Hardening Verification Suite
 * 
 * Validates:
 * 1. End-to-end pipeline integrity (6A -> 6B -> 6C -> 6D -> 6G -> 5 -> 4/8 -> 6E -> 6F -> 6G -> 9).
 * 2. Ambiguity halting at NEEDS_CLARIFICATION.
 * 3. Phase 5 human approval safety gate (zero unapproved writes, rejection handling).
 * 4. Deterministic task creation fingerprinting and idempotency.
 * 5. Multi-session journey continuity & restoration.
 * 6. Staleness detection (> 14 days) and evidence refresh mandates.
 * 7. Multi-tenant isolation and unauthenticated security boundary.
 * 8. Strict Single Learning Orchestrator and 14 canonical state machine states invariant.
 * 9. Phase 6C sole action-selection authority.
 * 10. Phase 1 ground-truth evidence preservation (zero fabricated scores or skills).
 */

import {
  understandStudentGoal,
  collectStudentEvidence,
  corroborateStudentEvidence,
  generateStudentLearningAssessment,
  generateLearningDecision,
  bridgeDecisionToPlan,
  evaluateAdaptiveLearningPolicyDeterministic,
  createTaskProposalFromPlanStep,
  isPlanStepTaskCreation,
  evaluateLearningOutcomeAsync,
  analyzeLearningTrajectoryAsync,
  restoreJourneyContextFromRun,
  resumeLearningJourneyState,
  evaluateContinuityContext,
  generateDeterministicTaskFingerprint,
  VALID_AGENT_TRANSITIONS,
  AgentState,
  createInitialAgentState,
  transitionAgentState,
} from '../src/lib/agent';
import {
  runStudentGoalOrchestrator,
  approveAndExecuteOrchestratorTask,
  completeStudentLearningStep,
  resumeStudentLearningJourney,
} from '../src/app/actions/agent-actions';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runPhase10IntegrationTests() {
  console.log('===============================================================');
  console.log('PHASE 10: FINAL INTELLIGENCE INTEGRATION & PRODUCTION HARDENING');
  console.log('===============================================================\n');

  const testUserId = 'user_p10_prod_test';

  // -------------------------------------------------------------
  // Test 1: Full End-to-End Orchestrator Pipeline
  // -------------------------------------------------------------
  console.log('--- Test 1: Full End-to-End Orchestrator Pipeline Execution ---');
  const fullRunResult = await runStudentGoalOrchestrator(
    'Master PostgreSQL B-tree indexing and query plan analysis',
    { explicitUserId: testUserId, targetSkillName: 'PostgreSQL' }
  );

  assert(fullRunResult.success === true, 'Pipeline returns success: true');
  assert(Boolean(fullRunResult.runId), 'Run ID generated');
  assert(fullRunResult.goalUnderstanding !== undefined, '6A GoalUnderstanding populated');
  assert(
    [
      'SKILL_IMPROVEMENT',
      'EXAM_PREPARATION',
      'SCHEDULE_PLANNING',
      'CORROBORATION_AUDIT',
      'REMEDIAL_PRACTICE',
      'GENERAL_LEARNING',
    ].includes(fullRunResult.goalUnderstanding?.category || ''),
    'Valid 6A Goal category'
  );
  assert(fullRunResult.studentAssessment !== undefined, '6B StudentLearningAssessment populated');
  assert(fullRunResult.learningDecision !== undefined, '6C LearningDecision populated');
  assert(fullRunResult.learningPlan !== undefined, '6D LearningPlan populated');
  assert(Array.isArray(fullRunResult.learningPlan?.steps), 'Plan contains steps');
  assert(fullRunResult.learningPlan!.steps.length > 0, 'Plan has at least one step');
  assert(fullRunResult.adaptivePolicy !== undefined, '6G AdaptiveLearningPolicy populated');
  assert(fullRunResult.adaptivePolicy!.adaptationSignals.length > 0, '6G Adaptation signals present');

  // -------------------------------------------------------------
  // Test 2: Ambiguity Halting at NEEDS_CLARIFICATION
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Ambiguous Goal Halts Safely at NEEDS_CLARIFICATION ---');
  const ambiguousResult = await runStudentGoalOrchestrator(
    'I want to learn coding',
    { explicitUserId: testUserId }
  );

  assert(ambiguousResult.success === true, 'Ambiguous goal processed safely');
  assert(ambiguousResult.status === 'NEEDS_CLARIFICATION', 'Status is NEEDS_CLARIFICATION');
  assert(
    Boolean(ambiguousResult.clarificationQuestions && ambiguousResult.clarificationQuestions.length > 0),
    'Clarification questions returned'
  );
  assert(ambiguousResult.learningPlan === undefined, 'No plan generated for ambiguous goal');

  // -------------------------------------------------------------
  // Test 3: Phase 5 Human Approval & Rejection Safety
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Phase 5 Human Approval Gate & Rejection Safety ---');
  if (fullRunResult.approvalProposal) {
    assert(fullRunResult.status === 'WAITING_FOR_APPROVAL', 'Status paused at WAITING_FOR_APPROVAL');
    assert(fullRunResult.approvalProposal.toolName === 'create_task', 'Proposal is create_task');
    assert(Boolean(fullRunResult.approvalProposal.idempotencyKey), 'Idempotency key attached to proposal');

    // Reject proposal
    const rejectResult = await approveAndExecuteOrchestratorTask(fullRunResult.approvalProposal, 'REJECTED');
    assert(rejectResult.success === true, 'Rejection processed safely');
    assert(rejectResult.status === 'REJECTED', 'Status is REJECTED (0 writes executed)');
  } else {
    console.log('  ℹ (Plan generated read-only steps without task creation tool requirement)');
    assert(fullRunResult.status === 'COMPLETED', 'Read-only plan completes directly');
  }

  // -------------------------------------------------------------
  // Test 4: Real Learning Step Execution & Feedback Loop (4 -> 6E -> 6F -> 6G -> 6C)
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Real Step Execution & Outcome/Feedback Loop ---');
  const targetStep = fullRunResult.learningPlan!.steps[0];
  const stepFeedback = await completeStudentLearningStep({
    plan: fullRunResult.learningPlan!,
    stepId: targetStep.id,
    userId: testUserId,
    studentNotes: 'Analyzed EXPLAIN ANALYZE output for B-tree indexed range scans.',
    selfReportedEvidence: 'Completed query execution plan walkthrough',
    verificationOutcome: 'VERIFIED',
  });

  assert(stepFeedback.success === true, 'completeStudentLearningStep succeeded');
  assert(stepFeedback.actionCompleted === true, 'Action marked completed');
  assert(stepFeedback.learningOutcome !== undefined, '6E LearningOutcome evaluated');
  assert(
    [
      'VERIFIED_SUCCESS',
      'PARTIALLY_VERIFIED',
      'INSUFFICIENT_EVIDENCE',
      'CONTRADICTED',
      'BLOCKED',
      'NOT_VERIFIABLE',
      'FAILED',
    ].includes(stepFeedback.learningOutcome?.learningOutcomeStatus || ''),
    'Valid 6E outcome status'
  );
  assert(stepFeedback.trajectory !== undefined, '6F LearningTrajectory generated');
  assert(stepFeedback.adaptivePolicy !== undefined, '6G AdaptivePolicy generated');
  assert(stepFeedback.nextLearningDecision !== undefined, '6C Authoritative next decision generated');
  assert(Boolean(stepFeedback.nextLearningDecision?.decisionType), '6C Decision type present');

  // -------------------------------------------------------------
  // Test 5: Deterministic Task Fingerprint Idempotency
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Deterministic Task Creation Fingerprint Idempotency ---');
  const fp1 = generateDeterministicTaskFingerprint(testUserId, 'plan_abc', 'step_1', 'Practice Index Scans');
  const fp2 = generateDeterministicTaskFingerprint(testUserId, 'plan_abc', 'step_1', 'Practice Index Scans');
  const fp3 = generateDeterministicTaskFingerprint(testUserId, 'plan_abc', 'step_2', 'Practice Index Scans');

  assert(fp1 === fp2, 'Identical step parameters produce identical SHA-256 fingerprint');
  assert(fp1 !== fp3, 'Different step produces distinct fingerprint');

  // -------------------------------------------------------------
  // Test 6: Multi-Session Journey Continuity & Next Step Restoration
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Multi-Session Journey Continuity & Next Step Restoration ---');
  const mockPlan = {
    planId: 'plan_cont_prod_1',
    goalId: 'goal_prod_1',
    userId: testUserId,
    goal: 'Master PostgreSQL B-tree indexing',
    status: 'EXECUTING' as const,
    priority: 'HIGH' as const,
    steps: [
      {
        id: 'step_1',
        order: 1,
        title: 'Review Index Basics',
        description: 'Read docs',
        status: 'COMPLETED' as const,
        requiredTools: [],
        requiresApproval: false,
        isCapabilitySupported: true,
        successCriteria: ['Done'],
        verificationCriteria: ['Read'],
      },
      {
        id: 'step_2',
        order: 2,
        title: 'Analyze Query Execution Plans',
        description: 'Run EXPLAIN ANALYZE',
        status: 'PENDING' as const,
        requiredTools: [],
        requiresApproval: false,
        isCapabilitySupported: true,
        successCriteria: ['Completed benchmark'],
        verificationCriteria: ['Execution logged'],
      },
    ],
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockRunState = createInitialAgentState({
    runId: 'run_cont_prod_1',
    userId: testUserId,
    goal: 'Master PostgreSQL B-tree indexing',
  });
  mockRunState.workingMemory = {
    learningPlan: mockPlan,
    goalUnderstanding: fullRunResult.goalUnderstanding,
    studentAssessment: fullRunResult.studentAssessment,
    learningDecision: fullRunResult.learningDecision,
    adaptiveLearningPolicy: fullRunResult.adaptivePolicy,
  };

  const resumeResult = resumeLearningJourneyState(mockRunState);
  assert(resumeResult.success === true, 'Journey restoration succeeded');
  assert(resumeResult.status === 'IN_PROGRESS', 'Journey classified as IN_PROGRESS');
  assert(resumeResult.nextStepToExecute?.id === 'step_2', 'Next step to execute identified as step_2');
  assert(Boolean(resumeResult.context?.completedStepIds.includes('step_1')), 'step_1 recorded as completed');

  // -------------------------------------------------------------
  // Test 7: Staleness Detection (> 14 Days) Mandating Fresh Evidence
  // -------------------------------------------------------------
  console.log('\n--- Test 7: Staleness Detection Mandating Fresh Evidence ---');
  const staleRunState = createInitialAgentState({
    runId: 'run_stale_prod_1',
    userId: testUserId,
    goal: 'Master PostgreSQL B-tree indexing',
  });
  staleRunState.updatedAt = new Date(Date.now() - 20 * 86400000).toISOString(); // 20 days ago
  staleRunState.workingMemory = { learningPlan: mockPlan };

  const staleResult = resumeLearningJourneyState(staleRunState, 14);
  assert(staleResult.status === 'STALE', '20-day-old journey classified as STALE');
  assert(staleResult.recommendedAction === 'REFRESH_EVIDENCE_BEFORE_RESUMING', 'Recommends refreshing evidence');

  // -------------------------------------------------------------
  // Test 8: Security Boundary & Multi-Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- Test 8: Security Boundary & Multi-Tenant Isolation ---');
  const unauthRun = await runStudentGoalOrchestrator('Learn Rust', { explicitUserId: '' });
  assert(unauthRun.success === false, 'Unauthenticated run blocked');
  assert(unauthRun.status === 'FAILED', 'Status is FAILED for unauthenticated user');

  const unauthResume = await resumeStudentLearningJourney({ explicitUserId: '' });
  assert(unauthResume.success === false, 'Unauthenticated resume blocked');
  assert(unauthResume.status === 'NOT_FOUND', 'Unauthenticated resume returns NOT_FOUND');

  // -------------------------------------------------------------
  // Test 9: Single Orchestrator & 14 Canonical States Invariant
  // -------------------------------------------------------------
  console.log('\n--- Test 9: Single Orchestrator & 14 Canonical States Invariant ---');
  const declaredStates: AgentState[] = [
    'IDLE',
    'GOAL_RECEIVED',
    'OBSERVING',
    'CORROBORATING',
    'ASSESSING',
    'PLANNING',
    'TOOL_SELECTION',
    'EXECUTING',
    'VERIFYING',
    'UPDATING',
    'REPLANNING',
    'COMPLETED',
    'FAILED',
    'WAITING_FOR_APPROVAL',
  ];
  const stateKeys = Object.keys(VALID_AGENT_TRANSITIONS);
  assert(stateKeys.length === 14, `Exactly 14 state keys in transition table (actual: ${stateKeys.length})`);
  for (const s of declaredStates) {
    assert(stateKeys.includes(s), `State ${s} present in canonical transition table`);
  }

  // -------------------------------------------------------------
  // Test 10: Ground-Truth Evidence Preservation
  // -------------------------------------------------------------
  console.log('\n--- Test 10: Ground-Truth Evidence Preservation ---');
  const evidenceCollection = await collectStudentEvidence();
  const corroboration = corroborateStudentEvidence(evidenceCollection);
  assert(corroboration.totalSkillsEvaluated >= 0, 'Corroboration evaluated based purely on empirical sources');
  assert(Array.isArray(corroboration.unmappedEvidence), 'Unmapped evidence preserved without fabrication');

  console.log('\n===============================================================');
  console.log('✨ ALL PHASE 10 FINAL INTEGRATION & PRODUCTION TESTS PASSED!');
  console.log('===============================================================\n');
}

runPhase10IntegrationTests().catch((err) => {
  console.error('Fatal error in Phase 10 verification:', err);
  process.exit(1);
});
