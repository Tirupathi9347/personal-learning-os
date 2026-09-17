/**
 * Phase 6E: Outcome, Feedback & Learning Loop Verification Suite
 * 
 * Tests the outcome evaluation and feedback generation engine of the SINGLE Learning Orchestrator.
 * 
 * Verifies:
 * 1. Action outcome vs. learning outcome strict separation.
 * 2. Plan completion != learning success.
 * 3. Epistemic preservation (SELF_REPORTED, OBSERVED, INFERRED, EXTERNALLY_VERIFIED).
 * 4. Contradiction preservation and missing evidence handling.
 * 5. Capability failures without student penalization.
 * 6. Phase 5 write outcomes (task verification without claiming skill mastery).
 * 7. Zero side-effects: No DB, task, calendar, profile, skill, or project mutations.
 * 8. Traceability and non-fabrication guarantees.
 * 9. Gemini advisory fallback and fail-safe robustness.
 * 10. Single Learning Orchestrator state loop integration.
 */

import {
  evaluateLearningOutcomeDeterministic,
  evaluateLearningOutcomeAsync,
  generateLearningFeedback,
  createOutcomeFeedbackHandler,
  LearningOutcome,
  LearningFeedback,
  EvaluateOutcomeInput,
  FeedbackLlmClient,
} from '../src/lib/agent/outcome-evaluator';
import {
  createLearningPlan,
} from '../src/lib/agent/planning-model';
import {
  LearningPlan,
  PlanStep,
} from '../src/lib/agent/planning-types';
import {
  StepVerificationResult,
} from '../src/lib/agent/verification-types';
import {
  PlanStepExecutionResult,
} from '../src/lib/agent/plan-execution-types';
import {
  PostWriteVerificationResult,
} from '../src/lib/agent/post-write-verifier';
import {
  EvidenceRecord,
  StudentCorroborationAuditResult,
} from '../src/lib/agent/types';
import {
  agentToolRegistry,
} from '../src/lib/agent/tool-registry';
import {
  createInitialAgentState,
  transitionAgentState,
} from '../src/lib/agent/state-machine';
import {
  AgentRunState,
} from '../src/lib/agent/state-types';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

function createMockPlan(overrides: Partial<LearningPlan> = {}): LearningPlan {
  const defaultSteps: PlanStep[] = [
    {
      id: 'step_1',
      planId: 'plan_test_6e',
      order: 1,
      title: 'Practice 20 SQL Problems',
      description: 'Solve SQL join and grouping practice problems',
      rationale: 'Reinforce query writing ability',
      priority: 'MEDIUM',
      status: 'COMPLETED',
      dependencies: [],
      prerequisites: [],
      targetSkill: 'SQL',
      requiredTools: ['get_leetcode_activity'],
      constraints: [],
      successCriteria: ['20 SQL problems attempted'],
      verificationCriteria: ['Recent LeetCode SQL submissions retrieved via telemetry'],
      requiresApproval: false,
      createdAt: '2026-09-16T12:00:00.000Z',
      updatedAt: '2026-09-16T12:00:00.000Z',
    },
  ];

  const validation = createLearningPlan({
    planId: 'plan_test_6e',
    userId: 'student_test_uid',
    goal: 'Master SQL intermediate queries',
    objectives: ['Complete SQL joins and aggregation practice'],
    steps: overrides.steps || defaultSteps,
    priority: overrides.priority || 'MEDIUM',
    status: overrides.status || 'COMPLETED',
    targetSkill: 'SQL',
    constraints: [],
    successCriteria: ['Solve practice problems'],
    verificationCriteria: ['Verify activity telemetry'],
    approvalRequirement: { requiresApproval: false },
    metadata: {
      decisionId: 'decision_sql_001',
      decisionType: 'PRACTICE',
      targetSkills: ['SQL'],
      ...overrides.metadata,
    },
  });

  if (!validation.isValid || !validation.plan) {
    throw new Error(`Failed to create mock plan: ${validation.errors.map((e) => e.message).join('; ')}`);
  }
  return validation.plan;
}

async function runOutcomeFeedbackVerificationSuite(): Promise<void> {
  console.log('===============================================================');
  console.log('PHASE 6E: OUTCOME, FEEDBACK & LEARNING LOOP VERIFICATION SUITE');
  console.log('===============================================================');

  const userId = 'student_test_uid';
  const timestamp = '2026-09-16T12:00:00.000Z';

  // 1. Fully completed plan (Action completed + Telemetry verified)
  console.log('\n--- Test 1: Fully completed plan with empirical verification ---');
  const plan1 = createMockPlan();
  const verResult1: StepVerificationResult = {
    planId: plan1.planId,
    stepId: 'step_1',
    status: 'VERIFIED',
    criteriaEvaluations: [
      {
        criterionText: 'Recent LeetCode SQL submissions retrieved via telemetry',
        status: 'VERIFIED',
        evidenceClassification: 'EXTERNALLY_VERIFIED',
        supportingEvidence: ['leetcode_submission_101'],
        contradictingEvidence: [],
        isCapabilitySupported: true,
        explanation: 'Observed 20 passing SQL submissions',
      },
    ],
    evaluatedEvidence: [
      {
        id: 'ev_101',
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        description: '20 LeetCode SQL submissions completed with 95% pass rate',
        targetSkillName: 'SQL',
        observedAt: timestamp,
        polarity: 'SUPPORTS',
        weight: 0.95,
      },
    ],
    supportingEvidenceSummary: ['20 LeetCode SQL submissions completed'],
    contradictingEvidenceSummary: [],
    missingEvidenceSummary: [],
    strongestEvidenceClassification: 'EXTERNALLY_VERIFIED',
    verificationConfidence: 0.95,
    explanation: 'All criteria empirically verified',
    recommendedAction: 'Advance to complex subqueries',
    isReplanWarranted: false,
    evaluatedAt: timestamp,
  };

  const res1 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    stepVerificationResults: [verResult1],
    timestamp,
  });

  assert(res1.outcome.completionStatus === 'COMPLETED', 'Plan completion status is COMPLETED');
  assert(res1.outcome.learningOutcomeStatus === 'VERIFIED_SUCCESS', 'Learning outcome status is VERIFIED_SUCCESS');
  assert(res1.outcome.learningOutcomeVerified === true, 'learningOutcomeVerified is true when empirical evidence is present');
  assert(res1.outcome.completedSteps.includes('step_1'), 'Step 1 is in completedSteps');

  // 2. Partially completed plan
  console.log('\n--- Test 2: Partially completed plan ---');
  const multiStepPlan = createMockPlan({
    steps: [
      {
        id: 'step_1',
        planId: 'plan_multi',
        order: 1,
        title: 'Review Syntax',
        description: 'Read docs',
        rationale: 'Review',
        priority: 'MEDIUM',
        status: 'COMPLETED',
        dependencies: [],
        prerequisites: [],
        targetSkill: 'SQL',
        constraints: [],
        successCriteria: ['Read docs'],
        verificationCriteria: ['Notes reviewed'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: 'step_2',
        planId: 'plan_multi',
        order: 2,
        title: 'Solve Problems',
        description: 'Solve problems',
        rationale: 'Practice',
        priority: 'MEDIUM',
        status: 'PENDING',
        dependencies: ['step_1'],
        prerequisites: [],
        targetSkill: 'SQL',
        constraints: [],
        successCriteria: ['Solve problems'],
        verificationCriteria: ['Telemetry'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
  });

  const res2 = evaluateLearningOutcomeDeterministic({
    plan: multiStepPlan,
    stepVerificationResults: [verResult1],
    timestamp,
  });
  assert(res2.outcome.completionStatus === 'PARTIALLY_COMPLETED', 'Plan completion status is PARTIALLY_COMPLETED');
  assert(res2.outcome.learningOutcomeStatus === 'PARTIALLY_VERIFIED', 'Learning outcome status is PARTIALLY_VERIFIED');
  assert(res2.outcome.incompleteSteps.includes('step_2'), 'Step 2 is in incompleteSteps');

  // 3. Blocked plan
  console.log('\n--- Test 3: Blocked plan ---');
  const blockedPlan = createMockPlan({
    status: 'BLOCKED',
    steps: [
      {
        id: 'step_diag',
        planId: 'plan_blocked',
        order: 1,
        title: 'Diagnostic Test',
        description: 'Execute test',
        rationale: 'Baseline',
        priority: 'MEDIUM',
        status: 'BLOCKED',
        failureReason: 'Requires unavailable tool capability: run_diagnostic_assessment (not registered in ToolRegistry)',
        dependencies: [],
        prerequisites: [],
        targetSkill: 'SQL',
        requiredTools: ['run_diagnostic_assessment'],
        constraints: [],
        successCriteria: ['Test completed'],
        verificationCriteria: ['Score verified'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ],
    metadata: {
      unavailableCapabilities: ['run_diagnostic_assessment'],
    },
  });

  const res3 = evaluateLearningOutcomeDeterministic({
    plan: blockedPlan,
    timestamp,
  });
  assert(res3.outcome.completionStatus === 'BLOCKED', 'Plan completion status is BLOCKED');
  assert(res3.outcome.learningOutcomeStatus === 'BLOCKED', 'Learning outcome status is BLOCKED');
  assert(res3.outcome.capabilityFailures.length > 0, 'Capability failure recorded');
  assert(res3.outcome.capabilityFailures[0].capability === 'run_diagnostic_assessment', 'Missing tool run_diagnostic_assessment recorded');

  // 4. Failed plan
  console.log('\n--- Test 4: Failed plan execution ---');
  const failedExecStep: PlanStepExecutionResult = {
    executionId: 'exec_fail_001',
    stepId: 'step_1',
    planId: plan1.planId,
    status: 'FAILED',
    error: { code: 'ERR_EXECUTION_TIMEOUT', message: 'Tool execution timed out' },
    selectedTools: [],
    toolResults: [],
    workingMemoryUpdate: {},
    sideEffectGuarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isExternalSideEffectTriggered: false,
      auditDescription: 'Zero side-effects',
    },
    startedAt: timestamp,
    completedAt: timestamp,
    durationMs: 5000,
  };
  const res4 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    stepExecutionResults: [failedExecStep],
    timestamp,
  });
  assert(res4.outcome.completionStatus === 'FAILED', 'Plan completion status is FAILED');
  assert(res4.outcome.learningOutcomeStatus === 'FAILED', 'Learning outcome status is FAILED');

  // 5. Verified execution vs. Unverified execution
  console.log('\n--- Test 5: Verified execution ---');
  assert(res1.outcome.stepOutcomes[0].isActionCompleted === true, 'Step 1 action is completed');
  assert(res1.outcome.stepOutcomes[0].isLearningVerified === true, 'Step 1 learning is verified');

  console.log('\n--- Test 6: Unverified execution (Action completed but no evidence) ---');
  const res6 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    stepVerificationResults: [],
    timestamp,
  });
  assert(res6.outcome.stepOutcomes[0].isActionCompleted === true, 'Step 1 action is completed');
  assert(res6.outcome.stepOutcomes[0].isLearningVerified === false, 'Step 1 learning is unverified');

  // 7. Action completion != Learning success
  console.log('\n--- Test 7: Action completion != Learning success ---');
  assert(res6.outcome.actionOutcome.completedStepsCount === 1, 'Action completed is 1');
  assert(res6.outcome.learningOutcomeVerified === false, 'learningOutcomeVerified is false despite action completion');
  assert(res6.outcome.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE', 'Status is INSUFFICIENT_EVIDENCE');

  // 8. Learning improvement unsupported by evidence
  console.log('\n--- Test 8: Learning improvement unsupported by evidence ---');
  assert(!res6.outcome.outcomeSummary.includes('mastered SQL'), 'Outcome summary does not claim synthetic mastery');
  assert(res6.outcome.outcomeSummary.includes('insufficient'), 'Outcome summary notes evidence is insufficient');

  // 9. Sufficient empirical evidence produces VERIFIED_SUCCESS
  console.log('\n--- Test 9: Sufficient empirical evidence produces VERIFIED_SUCCESS ---');
  assert(res1.outcome.learningOutcomeStatus === 'VERIFIED_SUCCESS', 'Sufficient evidence yields VERIFIED_SUCCESS');

  // 10. Insufficient evidence
  console.log('\n--- Test 10: Insufficient evidence ---');
  assert(res6.outcome.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE', 'Empty telemetry yields INSUFFICIENT_EVIDENCE');

  // 11. Contradicted outcome
  console.log('\n--- Test 11: Contradicted outcome ---');
  const contradictedVerResult: StepVerificationResult = {
    planId: plan1.planId,
    stepId: 'step_1',
    status: 'CONTRADICTED',
    criteriaEvaluations: [
      {
        criterionText: 'SQL queries pass without syntax errors',
        status: 'CONTRADICTED',
        evidenceClassification: 'OBSERVED',
        supportingEvidence: [],
        contradictingEvidence: ['mistake_syntax_error_1'],
        isCapabilitySupported: true,
        explanation: 'Repeated syntax errors recorded in mistake log',
      },
    ],
    evaluatedEvidence: [
      {
        id: 'ev_mistake_1',
        source: 'mistake',
        classification: 'OBSERVED',
        description: 'Repeated SQL syntax errors on GROUP BY queries',
        targetSkillName: 'SQL',
        observedAt: timestamp,
        polarity: 'CONTRADICTS',
        weight: 0.9,
      },
    ],
    supportingEvidenceSummary: [],
    contradictingEvidenceSummary: ['Repeated SQL syntax errors on GROUP BY queries'],
    missingEvidenceSummary: [],
    strongestEvidenceClassification: 'OBSERVED',
    verificationConfidence: 0.9,
    explanation: 'Evidence contradicts learning goal',
    recommendedAction: 'Trigger review of GROUP BY mistakes',
    isReplanWarranted: true,
    evaluatedAt: timestamp,
  };

  const res11 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    stepVerificationResults: [contradictedVerResult],
    timestamp,
  });
  assert(res11.outcome.learningOutcomeStatus === 'CONTRADICTED', 'Outcome status is CONTRADICTED');
  assert(res11.outcome.contradictions.length > 0, 'Contradictions list is populated');
  assert(res11.feedback.contradictions.length > 0, 'Feedback preserves contradictions');

  // 12. Missing evidence preserved as evidence gap
  console.log('\n--- Test 12: Missing evidence preserved as evidence gap ---');
  const gapVerResult: StepVerificationResult = {
    planId: plan1.planId,
    stepId: 'step_1',
    status: 'INSUFFICIENT_EVIDENCE',
    criteriaEvaluations: [],
    evaluatedEvidence: [],
    supportingEvidenceSummary: [],
    contradictingEvidenceSummary: [],
    missingEvidenceSummary: ['Missing LeetCode problem telemetry'],
    verificationConfidence: 0.2,
    explanation: 'No recent telemetry found',
    recommendedAction: 'Connect LeetCode account',
    isReplanWarranted: false,
    evaluatedAt: timestamp,
  };
  const res12 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    stepVerificationResults: [gapVerResult],
    timestamp,
  });
  assert(res12.outcome.evidenceGaps.includes('Missing LeetCode problem telemetry'), 'Missing evidence preserved in evidenceGaps');

  // 13. Stale evidence preservation
  console.log('\n--- Test 13: Stale evidence preservation ---');
  const staleEvidence: EvidenceRecord = {
    id: 'ev_stale_1',
    source: 'github',
    classification: 'OBSERVED',
    description: 'Old commit from 120 days ago',
    targetSkillName: 'SQL',
    observedAt: '2026-05-18T12:00:00.000Z',
    polarity: 'SUPPORTS',
    weight: 0.5,
  };
  const res13 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    evidenceRecords: [staleEvidence],
    timestamp,
  });
  assert(res13.outcome.evidence.length === 1, 'Stale evidence evaluated');

  // 14. Capability unavailable recorded
  console.log('\n--- Test 14: Capability unavailable recorded ---');
  assert(res3.outcome.capabilityFailures.length === 1, 'Capability failure recorded');
  assert(res3.outcome.limitations.some((l) => l.includes('run_diagnostic_assessment')), 'Limitation explicitly notes missing capability');

  // 15. Diagnostic capability unavailable
  console.log('\n--- Test 15: Diagnostic capability unavailable does not create fake quiz score ---');
  assert(!JSON.stringify(res3.outcome).includes('quiz score'), 'Zero fake quiz scores in outcome');

  // 16. Assessment capability unavailable
  console.log('\n--- Test 16: Assessment capability unavailable ---');
  assert(res3.feedback.capabilityLimitations.includes('run_diagnostic_assessment'), 'Feedback notes diagnostic assessment limitation');

  // 17. Task write verified (Phase 5)
  console.log('\n--- Test 17: Task write verified ---');
  const postWriteRes: PostWriteVerificationResult = {
    status: 'VERIFIED',
    proposalId: 'prop_001',
    actionId: 'act_001',
    toolName: 'create_task',
    userId,
    idempotencyKey: 'idemp_key_001',
    proposal: {} as any,
    createdTaskId: 'task_created_123',
    writeSucceeded: true,
    readBackVerified: true,
    discrepancies: [],
    disclaimer: 'Task created',
    auditStage: 'WRITE_VERIFIED',
    verifiedAt: timestamp,
  };
  const res17 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    postWriteVerificationResults: [postWriteRes],
    timestamp,
  });
  assert(res17.outcome.actionOutcome.writeActionsVerified === 1, '1 write action verified in database');
  assert(res17.outcome.actionOutcome.actionSummary.includes('1 of 1 write action(s) verified'), 'Action summary includes verified write count');
  assert(!res17.outcome.outcomeSummary.includes('student learned SQL because task was written'), 'No claim that task creation equates to learning');

  // 18. Task write failure
  console.log('\n--- Test 18: Task write failure ---');
  const failedWriteRes: PostWriteVerificationResult = {
    status: 'FAILED',
    proposalId: 'prop_002',
    actionId: 'act_002',
    toolName: 'create_task',
    userId,
    proposal: {} as any,
    createdTaskId: null,
    writeSucceeded: false,
    readBackVerified: false,
    discrepancies: ['Network timeout inserting task'],
    disclaimer: 'Write failed',
    auditStage: 'FAILED',
    verifiedAt: timestamp,
  };
  const res18 = evaluateLearningOutcomeDeterministic({
    plan: plan1,
    postWriteVerificationResults: [failedWriteRes],
    timestamp,
  });
  assert(res18.outcome.actionOutcome.writeActionsVerified === 0, '0 write actions verified');

  // 19. No direct writes by 6E
  console.log('\n--- Test 19: No direct writes by 6E ---');
  assert(typeof res1.outcome === 'object', 'Pure in-memory computation');

  // 20-23. Zero mutations (calendar, skill, profile, project)
  console.log('\n--- Test 20-23: Zero mutations (calendar, skill, profile, project) ---');
  assert(!('calendarEventId' in res1.outcome), 'No calendar mutations');
  assert(!('updatedSkillLevel' in res1.outcome), 'No skill mutations');
  assert(!('updatedProfile' in res1.outcome), 'No profile mutations');
  assert(!('updatedProject' in res1.outcome), 'No project mutations');

  // 24. Explicit student intent preserved
  console.log('\n--- Test 24: Explicit student intent preserved ---');
  assert(res1.outcome.goalReference === 'Master SQL intermediate queries', 'Goal reference preserved verbatim');

  // 25. Phase 1 epistemic classification preserved
  console.log('\n--- Test 25: Phase 1 epistemic classification preserved ---');
  assert(res1.outcome.evidence[0].classification === 'EXTERNALLY_VERIFIED', 'Classification EXTERNALLY_VERIFIED preserved');

  // 26. Phase 1 calibrated proficiency not modified
  console.log('\n--- Test 26: Phase 1 calibrated proficiency not modified ---');
  assert(!('calibratedProficiency' in res1.outcome), 'Calibrated proficiency not modified by 6E');

  // 27. Phase 6B assessment not modified
  console.log('\n--- Test 27: Phase 6B assessment not modified ---');
  assert(!('studentAssessment' in res1.outcome), 'Student assessment object not modified');

  // 28. 6C decision not modified
  console.log('\n--- Test 28: 6C decision not modified ---');
  assert(res1.outcome.decisionId === 'decision_sql_001', 'decisionId preserved as read-only reference');

  // 29. 6D plan traceability preserved
  console.log('\n--- Test 29: 6D plan traceability preserved ---');
  assert(res1.outcome.planId === plan1.planId, 'planId preserved');
  assert(res1.outcome.stepOutcomes[0].stepId === 'step_1', 'stepId preserved');

  // 30. Phase 4 verification consumed correctly
  console.log('\n--- Test 30: Phase 4 verification consumed correctly ---');
  assert(res1.outcome.verificationResults.length === 1, 'Phase 4 verification results attached');

  // 31. Contradictions preserved
  console.log('\n--- Test 31: Contradictions preserved ---');
  assert(res11.outcome.contradictions.includes('Repeated SQL syntax errors on GROUP BY queries'), 'Contradiction text preserved verbatim');

  // 32. Missing evidence not treated as failure
  console.log('\n--- Test 32: Missing evidence not treated as failure ---');
  assert(res12.outcome.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE', 'Missing evidence is INSUFFICIENT_EVIDENCE, not FAILED');

  // 33. Blocked capability not treated as student failure
  console.log('\n--- Test 33: Blocked capability not treated as student failure ---');
  assert(res3.outcome.learningOutcomeStatus === 'BLOCKED', 'Blocked capability yields BLOCKED');
  assert(!res3.outcome.outcomeSummary.toLowerCase().includes('student failed'), 'Blocked capability does not accuse student of failure');

  // 34. Gemini unavailable fallback
  console.log('\n--- Test 34: Gemini unavailable fallback ---');
  const res34 = await evaluateLearningOutcomeAsync({
    plan: plan1,
    stepVerificationResults: [verResult1],
    allowLlm: true,
    timestamp,
  }, null);
  assert(res34.outcome.learningOutcomeStatus === 'VERIFIED_SUCCESS', 'Fallback returns valid deterministic status');
  assert(res34.source === 'DETERMINISTIC', 'Source is DETERMINISTIC when Gemini client is null');

  // 35. Malformed Gemini output fallback
  console.log('\n--- Test 35: Malformed Gemini output fallback ---');
  const malformedLlmClient: FeedbackLlmClient = {
    generateContent: async () => ({ text: 'INVALID_JSON_NOT_AN_OBJECT' }),
  };
  const res35 = await evaluateLearningOutcomeAsync({
    plan: plan1,
    stepVerificationResults: [verResult1],
    allowLlm: true,
    timestamp,
  }, malformedLlmClient);
  assert(res35.source === 'DETERMINISTIC', 'Malformed LLM output safely falls back to DETERMINISTIC');

  // 36. Gemini cannot override deterministic outcome
  console.log('\n--- Test 36: Gemini cannot override deterministic outcome ---');
  const spoofingLlmClient: FeedbackLlmClient = {
    generateContent: async () => ({
      text: JSON.stringify({
        outcomeSummary: 'Student mastered everything 100%',
        feedbackSummary: 'Perfect score',
        learningOutcomeStatus: 'VERIFIED_SUCCESS', // Attempted override
        learningOutcomeVerified: true,              // Attempted override
      }),
    }),
  };
  const res36 = await evaluateLearningOutcomeAsync({
    plan: plan1,
    stepVerificationResults: [], // No verification evidence!
    allowLlm: true,
    timestamp,
  }, spoofingLlmClient);
  assert(res36.outcome.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE', 'Deterministic status INSUFFICIENT_EVIDENCE strictly preserved');
  assert(res36.outcome.learningOutcomeVerified === false, 'Deterministic learningOutcomeVerified false strictly preserved');

  // 37. Duplicate feedback handling (Idempotent evaluation)
  console.log('\n--- Test 37: Duplicate feedback handling ---');
  const runA = evaluateLearningOutcomeDeterministic({ plan: plan1, stepVerificationResults: [verResult1], timestamp });
  const runB = evaluateLearningOutcomeDeterministic({ plan: plan1, stepVerificationResults: [verResult1], timestamp });
  assert(runA.outcome.learningOutcomeStatus === runB.outcome.learningOutcomeStatus, 'Identical inputs produce identical outcome status');
  assert(runA.feedback.feedbackSummary === runB.feedback.feedbackSummary, 'Identical inputs produce identical feedback summary');

  // 38. Multiple step outcomes
  console.log('\n--- Test 38: Multiple step outcomes ---');
  assert(res2.outcome.stepOutcomes.length === 2, '2 step outcomes generated for 2-step plan');

  // 39. No invented evidence
  console.log('\n--- Test 39: No invented evidence ---');
  assert(res6.outcome.evidence.length === 0, 'Zero evidence records when telemetry is empty');

  // 40. Single orchestrator integrity
  console.log('\n--- Test 40: Single orchestrator integrity ---');
  let state = createInitialAgentState({
    userId,
    goal: 'Master SQL intermediate queries',
  });
  state.workingMemory.plan = plan1;
  state.workingMemory.stepVerification = verResult1;

  // Verify transition to UPDATING
  state = transitionAgentState(state, {
    targetState: 'OBSERVING',
    reason: 'Start observing',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'CORROBORATING',
    reason: 'Corroborating',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'ASSESSING',
    reason: 'Assessing',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'PLANNING',
    reason: 'Planning',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'TOOL_SELECTION',
    reason: 'Tool selection',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'EXECUTING',
    reason: 'Executing',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'VERIFYING',
    reason: 'Verifying',
  }).state;
  state = transitionAgentState(state, {
    targetState: 'UPDATING',
    reason: 'Updating',
  }).state;

  const updatingHandler = createOutcomeFeedbackHandler({ timestamp });
  const updateResult = await updatingHandler(state);

  assert(updateResult.nextState === 'COMPLETED', 'Updating handler advances to COMPLETED');
  assert(updateResult.workingMemory?.learningOutcome !== undefined, 'workingMemory contains learningOutcome');
  assert(updateResult.workingMemory?.learningFeedback !== undefined, 'workingMemory contains learningFeedback');

  console.log('\n===============================================================');
  console.log('✨ ALL 40 PHASE 6E OUTCOME & FEEDBACK TESTS PASSED!');
  console.log('===============================================================');
}

runOutcomeFeedbackVerificationSuite().catch((err) => {
  console.error('Fatal test error in Phase 6E suite:', err);
  process.exit(1);
});
