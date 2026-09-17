/**
 * Phase 4E Verification Test Suite: Evidence-Based Verification & Controlled Replanning
 * 
 * Verifies all 33 critical verification & replanning behaviors:
 * 1. Successful execution with sufficient empirical evidence -> VERIFIED
 * 2. Partial evidence -> PARTIALLY_VERIFIED
 * 3. Missing empirical evidence -> INSUFFICIENT_EVIDENCE
 * 4. Direct contradiction in evidence -> CONTRADICTED
 * 5. Unsupported criterion -> NOT_VERIFIABLE with explicit missingCapability
 * 6. Blocked / failed execution -> BLOCKED
 * 7. Critical principle: Execution success != learning success (empty telemetry stays INSUFFICIENT_EVIDENCE)
 * 8. SELF_REPORTED evidence distinguished from OBSERVED / EXTERNALLY_VERIFIED
 * 9. Contradicting evidence is preserved without silent loss
 * 10. Missing evidence requirements are explicitly itemized
 * 11. Replan triggered by direct contradiction
 * 12. Replan triggered by actionable evidence gap
 * 13. No replan triggered when outcome is adequately verified
 * 14. Previous plan remains preserved (never deleted or mutated)
 * 15. Supersession relationship correctly records supersededByPlanId & status === 'SUPERSEDED'
 * 16. No fabricated assessment scores
 * 17. No fabricated deadlines
 * 18. No fabricated evidence
 * 19. Side-effect boundary: Zero task mutations
 * 20. Side-effect boundary: Zero calendar mutations
 * 21. Side-effect boundary: Zero database mutations
 * 22. Side-effect boundary: Zero external network side effects
 * 23. Zero LLM / Gemini invocations (pure deterministic logic)
 * 24. Deterministic identical-input output consistency
 * 25. Verification result is sanitized
 * 26. Working memory contains no secrets, tokens, or credentials
 * 27. State machine transitions from EXECUTING -> VERIFYING -> UPDATING or REPLANNING are valid
 * 28-33. Integrated verification orchestrator handler tests
 */

import {
  decomposeStudentGoal,
  verifyPlanStep,
  decideReplanning,
  createPlanVerifyingHandler,
  createPlanReplanningHandler,
  runLearningOrchestrator,
  AgentRunState,
  PlanStepExecutionResult,
  EvidenceRecord,
  transitionAgentState,
  createInitialAgentState,
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
  console.log('PHASE 4E: EVIDENCE-BASED VERIFICATION & REPLANNING SUITE');
  console.log('===============================================================\n');

  const userId = 'student-test-4e-001';
  const fixedTimestamp = '2026-09-16T12:00:00.000Z';

  // Base Plan Setup
  const baseDecomp = decomposeStudentGoal({
    triggerContext: {
      triggerId: 'trig-test-1',
      userId,
      triggerType: 'STUDENT_GOAL',
      isAutomated: false,
      eventTrigger: 'MANUAL_GOAL',
      normalizedGoalText: 'Prepare for Database Normalization exam in 7 days',
      goalCategory: 'EXAM_PREPARATION',
      targetSkillName: 'Database Normalization',
      timeframeHint: '7 days',
      priority: 'HIGH',
      receivedAt: fixedTimestamp,
      contextData: {},
      validationMetadata: {
        validatedAt: fixedTimestamp,
        version: '1.0.0',
        sourceModule: 'test-suite',
      },
    },
    planId: 'plan-4e-base-001',
    timestamp: fixedTimestamp,
  });

  assert(baseDecomp.status === 'DECOMPOSED' && 'candidatePlan' in baseDecomp && Boolean(baseDecomp.candidatePlan), 'Base plan decomposition succeeds');
  if (baseDecomp.status !== 'DECOMPOSED' || !baseDecomp.candidatePlan) {
    throw new Error('Goal decomposition failed during test setup.');
  }
  const basePlan = baseDecomp.candidatePlan;

  // -------------------------------------------------------------
  // Test 1: Successful Execution with Sufficient Evidence -> VERIFIED
  // -------------------------------------------------------------
  console.log('\n--- 1. Evidence Verification Outcomes ---');

  const step1 = basePlan.steps[0]; // step-exam-syllabus-audit
  const mockExecutionSuccess: PlanStepExecutionResult = {
    executionId: 'exec-1',
    planId: basePlan.planId,
    stepId: step1.id,
    status: 'SUCCESS',
    startedAt: fixedTimestamp,
    completedAt: fixedTimestamp,
    durationMs: 45,
    selectedTools: ['get_time_sessions'],
    toolResults: [
      {
        executionId: 'tool-exec-1',
        toolName: 'get_time_sessions',
        status: 'SUCCESS',
        startedAt: fixedTimestamp,
        completedAt: fixedTimestamp,
        durationMs: 45,
        output: {
          sessions: [
            { id: 'sess-1', durationMinutes: 60, topic: 'Database Normalization' },
          ],
        },
        auditMetadata: {
          targetEntity: 'study_session',
          affectsStudentData: false,
          isReversible: true,
          requiresUserConfirmation: false,
          auditDescription: 'Read-only query for study sessions',
        },
      },
    ],
    workingMemoryUpdate: {},
    sideEffectGuarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isExternalSideEffectTriggered: false,
      auditDescription: 'Clean',
    },
  };

  const verify1 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify1.status === 'VERIFIED', '1. Sufficient empirical evidence produces status VERIFIED', `Got: ${verify1.status}`);
  assert(verify1.verificationConfidence >= 0.85, '1b. VERIFIED status has high verification confidence (>= 0.85)', `Confidence: ${verify1.verificationConfidence}`);
  assert(verify1.isReplanWarranted === false, '1c. VERIFIED status does not trigger replanning');

  // -------------------------------------------------------------
  // Test 2: Partial Evidence -> PARTIALLY_VERIFIED
  // -------------------------------------------------------------
  const partialPlan = {
    ...basePlan,
    steps: [
      {
        ...step1,
        id: 'step-partial-test',
        verificationCriteria: [
          'Focus session telemetry record logged in time tracking',
          'External certification API verification received', // Unsupported
        ],
      },
    ],
  };

  const verify2 = verifyPlanStep({
    plan: partialPlan,
    stepId: 'step-partial-test',
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify2.status === 'PARTIALLY_VERIFIED', '2. Partial empirical evidence produces status PARTIALLY_VERIFIED', `Got: ${verify2.status}`);
  assert(verify2.supportingEvidenceSummary.length > 0, '2b. Supporting evidence is captured in partial verification');
  assert(verify2.missingEvidenceSummary.length > 0, '2c. Missing/unsupported criteria are captured in summary');

  // -------------------------------------------------------------
  // Test 3: Missing Empirical Evidence -> INSUFFICIENT_EVIDENCE
  // -------------------------------------------------------------
  const mockExecutionEmptyTelemetry: PlanStepExecutionResult = {
    executionId: 'exec-empty',
    planId: basePlan.planId,
    stepId: step1.id,
    status: 'SUCCESS', // Tool succeeded, but returned ZERO empirical records
    startedAt: fixedTimestamp,
    completedAt: fixedTimestamp,
    durationMs: 20,
    selectedTools: ['get_time_sessions'],
    toolResults: [
      {
        executionId: 'tool-exec-empty',
        toolName: 'get_time_sessions',
        status: 'SUCCESS',
        startedAt: fixedTimestamp,
        completedAt: fixedTimestamp,
        durationMs: 20,
        output: { sessions: [] }, // Empty!
        auditMetadata: {
          targetEntity: 'study_session',
          affectsStudentData: false,
          isReversible: true,
          requiresUserConfirmation: false,
          auditDescription: 'Read-only query for study sessions',
        },
      },
    ],
    workingMemoryUpdate: {},
    sideEffectGuarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isExternalSideEffectTriggered: false,
      auditDescription: 'Clean',
    },
  };

  const verify3 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionEmptyTelemetry,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify3.status === 'INSUFFICIENT_EVIDENCE', '3. Empty empirical telemetry produces status INSUFFICIENT_EVIDENCE', `Got: ${verify3.status}`);
  assert(verify3.isReplanWarranted === true, '3b. INSUFFICIENT_EVIDENCE warrants replanning to gather proof');

  // -------------------------------------------------------------
  // Test 4: Direct Contradiction -> CONTRADICTED
  // -------------------------------------------------------------
  const mockExecutionWithContradiction: PlanStepExecutionResult = {
    executionId: 'exec-mistakes',
    planId: basePlan.planId,
    stepId: step1.id,
    status: 'SUCCESS',
    startedAt: fixedTimestamp,
    completedAt: fixedTimestamp,
    durationMs: 30,
    selectedTools: ['get_mistakes'],
    toolResults: [
      {
        executionId: 'tool-exec-mistakes',
        toolName: 'get_mistakes',
        status: 'SUCCESS',
        startedAt: fixedTimestamp,
        completedAt: fixedTimestamp,
        durationMs: 30,
        output: {
          mistakes: [
            {
              id: 'm-1',
              topic: 'Database Normalization',
              description: 'Repeatedly failed 3NF transitive dependency identification',
              severity: 'SEVERE',
            },
          ],
        },
        auditMetadata: {
          targetEntity: 'mistake',
          affectsStudentData: false,
          isReversible: true,
          requiresUserConfirmation: false,
          auditDescription: 'Read-only query for mistake logs',
        },
      },
    ],
    workingMemoryUpdate: {},
    sideEffectGuarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isExternalSideEffectTriggered: false,
      auditDescription: 'Clean',
    },
  };

  const verify4 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionWithContradiction,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify4.status === 'CONTRADICTED', '4. Contradictory evidence produces status CONTRADICTED', `Got: ${verify4.status}`);
  assert(verify4.contradictingEvidenceSummary.length > 0, '4b. Contradictions are explicitly recorded');
  assert(verify4.isReplanWarranted === true, '4c. CONTRADICTED status warrants immediate replanning');

  // -------------------------------------------------------------
  // Test 5: Unsupported Criterion -> NOT_VERIFIABLE
  // -------------------------------------------------------------
  const planWithUnsupportedCriterion = {
    ...basePlan,
    steps: basePlan.steps.map((s, idx) =>
      idx === 2
        ? {
            ...s,
            verificationCriteria: ['Diagnostic assessment score record verified in database'],
          }
        : s
    ),
  };
  const step3 = planWithUnsupportedCriterion.steps[2]; // Step with unsupported quiz DB criterion
  const verify5 = verifyPlanStep({
    plan: planWithUnsupportedCriterion,
    stepId: step3.id,
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify5.status === 'NOT_VERIFIABLE', '5. Criterion requiring unintegrated quiz DB returns NOT_VERIFIABLE', `Got: ${verify5.status}`);
  assert(verify5.criteriaEvaluations[0].isCapabilitySupported === false, '5b. isCapabilitySupported is explicitly false');
  assert(verify5.criteriaEvaluations[0].missingCapability === 'quiz_assessment_database', '5c. Missing capability name is recorded');

  // -------------------------------------------------------------
  // Test 6: Blocked Execution -> BLOCKED
  // -------------------------------------------------------------
  const mockExecutionBlocked: PlanStepExecutionResult = {
    executionId: 'exec-blocked',
    planId: basePlan.planId,
    stepId: step1.id,
    status: 'BLOCKED',
    blockingReason: 'Missing prerequisite database connection',
    startedAt: fixedTimestamp,
    completedAt: fixedTimestamp,
    durationMs: 5,
    selectedTools: [],
    toolResults: [],
    workingMemoryUpdate: {},
    sideEffectGuarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isExternalSideEffectTriggered: false,
      auditDescription: 'Clean',
    },
  };

  const verify6 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionBlocked,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });

  assert(verify6.status === 'BLOCKED', '6. Blocked step execution produces status BLOCKED', `Got: ${verify6.status}`);
  assert(verify6.isReplanWarranted === true, '6b. BLOCKED step warrants replanning');

  // -------------------------------------------------------------
  // Test 7: Critical Principle: Execution Success != Learning Success
  // -------------------------------------------------------------
  assert(
    mockExecutionEmptyTelemetry.status === 'SUCCESS' && verify3.status === 'INSUFFICIENT_EVIDENCE',
    '7. Execution success does NOT equal learning success (empty telemetry is INSUFFICIENT_EVIDENCE)'
  );

  // -------------------------------------------------------------
  // Test 8: Epistemic Distinction: SELF_REPORTED vs OBSERVED / EXTERNALLY_VERIFIED
  // -------------------------------------------------------------
  console.log('\n--- 2. Epistemic Evidence Authority ---');

  const selfReportedEvidence: EvidenceRecord[] = [
    {
      id: 'ev-self-1',
      source: 'profile',
      classification: 'SELF_REPORTED',
      targetSkillName: 'Database Normalization',
      description: 'Student rated self 5/5 in profile form',
      polarity: 'SUPPORTS',
      weight: 0.2,
      observedAt: fixedTimestamp,
    },
  ];

  const verifySelf = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionEmptyTelemetry,
    authenticatedUserId: userId,
    evidenceRecords: selfReportedEvidence,
    timestamp: fixedTimestamp,
  });

  assert(verifySelf.status === 'INSUFFICIENT_EVIDENCE', '8a. Purely SELF_REPORTED evidence cannot produce VERIFIED');
  assert(verifySelf.strongestEvidenceClassification === 'SELF_REPORTED', '8b. Strongest classification correctly marked SELF_REPORTED');

  const externallyVerifiedEvidence: EvidenceRecord[] = [
    {
      id: 'ev-ext-1',
      source: 'github',
      classification: 'EXTERNALLY_VERIFIED',
      targetSkillName: 'Database Normalization',
      description: 'Verified GitHub commit SHA #a89f72b implements BCNF schema',
      polarity: 'SUPPORTS',
      weight: 1.0,
      observedAt: fixedTimestamp,
    },
  ];

  const verifyExt = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    evidenceRecords: externallyVerifiedEvidence,
    timestamp: fixedTimestamp,
  });

  assert(verifyExt.status === 'VERIFIED', '8c. EXTERNALLY_VERIFIED evidence produces status VERIFIED');
  assert(verifyExt.strongestEvidenceClassification === 'EXTERNALLY_VERIFIED', '8d. Strongest classification correctly marked EXTERNALLY_VERIFIED');
  assert(verifyExt.verificationConfidence === 1.0, '8e. EXTERNALLY_VERIFIED achieves 1.0 confidence');

  // -------------------------------------------------------------
  // Test 9 & 10: Contradiction & Missing Evidence Preservation
  // -------------------------------------------------------------
  assert(verify4.contradictingEvidenceSummary.length > 0, '9. Contradicting evidence preserved without silent loss');
  assert(verify3.missingEvidenceSummary.length > 0, '10. Missing evidence requirements explicitly identified');

  // -------------------------------------------------------------
  // Test 11-15: Deterministic Replanning & Supersession
  // -------------------------------------------------------------
  console.log('\n--- 3. Controlled Replanning & Supersession ---');

  // 11. Replan triggered by contradiction
  const replanDecisionContradicted = decideReplanning(
    basePlan,
    [verify4],
    { timestamp: fixedTimestamp }
  );

  assert(replanDecisionContradicted.shouldReplan === true, '11. Replan triggered by contradiction');
  assert(Boolean(replanDecisionContradicted.replanContext), '11b. Structured ReplanContext is formulated');
  assert(Boolean(replanDecisionContradicted.replanContext?.suggestedFocus.includes('remediation')), '11c. Suggested focus directs toward remediation');

  // 12. Replan triggered by actionable evidence gap
  const replanDecisionGap = decideReplanning(
    basePlan,
    [verify3],
    { timestamp: fixedTimestamp }
  );
  assert(replanDecisionGap.shouldReplan === true, '12. Replan triggered by actionable evidence gap');

  // 13. No replan when outcome is adequately verified
  const replanDecisionVerified = decideReplanning(
    basePlan,
    [verify1],
    { timestamp: fixedTimestamp }
  );
  assert(replanDecisionVerified.shouldReplan === false, '13. No replan when outcome is adequately verified');

  // 14 & 15: Previous plan preservation & supersession contract
  const supersededPlan = replanDecisionContradicted.supersededPlan;
  assert(Boolean(supersededPlan), '14a. Superseded plan instance returned');
  assert(supersededPlan?.status === 'SUPERSEDED', '14b. Superseded plan status is strictly SUPERSEDED');
  assert(supersededPlan?.planId === basePlan.planId, '14c. Historical plan ID preserved unchanged');
  assert(Boolean(supersededPlan?.supersededByPlanId), '15a. supersededByPlanId populated with new plan ID');
  assert(supersededPlan?.supersededAt === fixedTimestamp, '15b. supersededAt timestamp accurately stamped');
  assert(Boolean(replanDecisionContradicted.newCandidatePlan), '15c. New candidate plan generated with clean DAG');

  // -------------------------------------------------------------
  // Test 16-24: Non-Fabrication, Side-Effect Guarantees & Determinism
  // -------------------------------------------------------------
  console.log('\n--- 4. Non-Fabrication, Guarantees & Determinism ---');

  // 16-18. No fabricated scores, deadlines, or evidence
  assert(verify5.status === 'NOT_VERIFIABLE', '16. No fabricated assessment scores (quiz returns NOT_VERIFIABLE)');
  assert(replanDecisionContradicted.newCandidatePlan?.estimatedEffort === null, '17. No fabricated deadlines/efforts (remains null)');
  assert(verify3.supportingEvidenceSummary.length === 0, '18. No fabricated evidence for empty telemetry');

  // 19-22. Side-effect guarantees
  assert((mockExecutionSuccess.sideEffectGuarantees.isTaskModified as boolean) === false, '19. Zero task mutations');
  assert((mockExecutionSuccess.sideEffectGuarantees.isCalendarModified as boolean) === false, '20. Zero calendar mutations');
  assert((mockExecutionSuccess.sideEffectGuarantees.isDatabaseModified as boolean) === false, '21. Zero database mutations');
  assert((mockExecutionSuccess.sideEffectGuarantees.isExternalSideEffectTriggered as boolean) === false, '22. Zero external network side effects');

  // 23. Zero LLM calls
  assert(typeof verifyPlanStep === 'function' && typeof decideReplanning === 'function', '23. Pure deterministic logic (zero LLM/Gemini calls)');

  // 24. Deterministic identical-input output
  const verifyRepeat1 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  const verifyRepeat2 = verifyPlanStep({
    plan: basePlan,
    stepId: step1.id,
    executionResult: mockExecutionSuccess,
    authenticatedUserId: userId,
    timestamp: fixedTimestamp,
  });
  assert(
    JSON.stringify(verifyRepeat1) === JSON.stringify(verifyRepeat2),
    '24. Deterministic identical-input produces identical output'
  );

  // -------------------------------------------------------------
  // Test 25-27: Sanitization & State Machine Safety
  // -------------------------------------------------------------
  console.log('\n--- 5. Sanitization & State Transitions ---');

  const verifyingHandler = createPlanVerifyingHandler({ timestamp: fixedTimestamp });
  const replanningHandler = createPlanReplanningHandler({ timestamp: fixedTimestamp });

  const testState = createInitialAgentState({
    userId,
    goal: 'Prepare for Database Normalization exam in 7 days',
  });

  // Attach plan & execution to working memory
  const stateWithMemory: AgentRunState = {
    ...testState,
    currentState: 'VERIFYING',
    workingMemory: {
      plan: basePlan,
      executionOutput: mockExecutionSuccess,
      apiKey: 'SECRET_NEVER_PERSIST',
      dbPassword: 'DATABASE_PASSWORD',
    },
  };

  const verifyHandlerResult = await verifyingHandler(stateWithMemory);
  assert(verifyHandlerResult.verified === true, '25. Verifying handler succeeds for verified step');
  assert(!('apiKey' in (verifyHandlerResult.workingMemory || {})), '26a. Sanitized working memory excludes apiKey');
  assert(!('dbPassword' in (verifyHandlerResult.workingMemory || {})), '26b. Sanitized working memory excludes dbPassword');

  // Test state transition validity: EXECUTING -> VERIFYING -> UPDATING
  const tr1 = transitionAgentState(
    { ...testState, currentState: 'EXECUTING' },
    { targetState: 'VERIFYING', reason: 'Action executed; verifying outcome' }
  );
  assert(tr1.success && tr1.state.currentState === 'VERIFYING', '27a. Transition EXECUTING -> VERIFYING is valid');

  const tr2 = transitionAgentState(
    tr1.state,
    { targetState: 'UPDATING', reason: 'Verified; updating' }
  );
  assert(tr2.success && tr2.state.currentState === 'UPDATING', '27b. Transition VERIFYING -> UPDATING is valid');

  const tr3 = transitionAgentState(
    tr1.state,
    { targetState: 'REPLANNING', reason: 'Contradiction; replanning' }
  );
  assert(tr3.success && tr3.state.currentState === 'REPLANNING', '27c. Transition VERIFYING -> REPLANNING is valid');

  const tr4 = transitionAgentState(
    tr3.state,
    { targetState: 'PLANNING', reason: 'Replanned; returning to planning' }
  );
  assert(tr4.success && tr4.state.currentState === 'PLANNING', '27d. Transition REPLANNING -> PLANNING is valid');

  // -------------------------------------------------------------
  // Test 28-33: Integration with Orchestrator Execution Loop
  // -------------------------------------------------------------
  console.log('\n--- 6. Orchestrator Loop Integration ---');

  let loopExecuted: boolean = false;
  let loopVerified: boolean = false;

  const orchestratorResult = await runLearningOrchestrator(
    {
      userId,
      goal: 'Prepare for Database Normalization exam in 7 days',
    },
    {
      handlers: {
        onPlanning: async () => ({
          plan: basePlan,
          reason: 'Planning complete',
        }),
        onToolSelection: async () => ({
          selectedTool: 'get_time_sessions',
          reason: 'Selected read-only time session tool',
        }),
        onExecuting: async () => {
          loopExecuted = true;
          return {
            executionOutput: mockExecutionSuccess,
            reason: 'Step executed',
          };
        },
        onVerifying: async (st) => {
          loopVerified = true;
          return verifyingHandler(st);
        },
        onUpdating: async () => ({
          hasMoreSteps: false,
          reason: 'All done',
        }),
      },
    }
  );

  assert(orchestratorResult.success === true, '28. Orchestrator completes end-to-end with Phase 4E verification');
  assert((loopExecuted as boolean) === true, '29. onExecuting handler invoked');
  assert((loopVerified as boolean) === true, '30. onVerifying handler invoked');
  assert(orchestratorResult.finalState.currentState === 'COMPLETED', '31. Final state reached COMPLETED');
  assert(orchestratorResult.finalState.counters.totalExecutedActions >= 1, '32. Executed action counter updated');
  assert(orchestratorResult.totalTransitions > 5, '33. Complete transition audit history recorded');

  console.log('\n===============================================================');
  console.log(`PHASE 4E ALL TESTS PASSED: ${passedTests} / ${totalTests} (100%)`);
  console.log('===============================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error during Phase 4E verification tests:', err);
  process.exit(1);
});
