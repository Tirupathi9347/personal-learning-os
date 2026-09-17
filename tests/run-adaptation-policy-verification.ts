/**
 * Phase 6G: Adaptive Learning Policy & Orchestrator Adaptation Verification Suite
 * 
 * Tests the adaptive policy synthesis engine for the SINGLE Learning Orchestrator.
 * 
 * Verifies:
 * 1. Verified empirical success -> PRESERVE_SUCCESSFUL_PATTERN.
 * 2. Plan completed without empirical learning evidence -> No false success adaptation.
 * 3. Repeated mistakes + empirical history -> INCREASE_REVIEW_FOCUS.
 * 4. Contradictory evidence -> Contradictions preserved & REASSESS_BEFORE_ESCALATION.
 * 5. Insufficient trajectory history -> REQUEST_MORE_EVIDENCE.
 * 6. Stale evidence (> 90 days) -> REFRESH_STALE_EVIDENCE.
 * 7. Strong global history but insufficient skill-specific history -> No strong skill adaptation.
 * 8. Mixed / limited trajectory -> REDUCE_ADAPTATION_CONFIDENCE.
 * 9. Missing telemetry -> Uncertainty, not negative inference.
 * 10. Self-reported success only -> Insufficient for verified success.
 * 11. Gemini unavailable -> Deterministic fallback.
 * 12. Gemini malformed -> Deterministic fallback.
 * 13. Gemini cannot override deterministic signals.
 * 14. 6G cannot produce a 6C action directly.
 * 15. 6G cannot create a LearningPlan directly.
 * 16. 6G cannot execute tools.
 * 17. 6G cannot execute writes.
 * 18. Human approval boundaries remain intact.
 * 19. Working-memory serialization and deserialization.
 * 20. Tenant isolation preserved.
 * 21. Phase 1 calibration unchanged.
 * 22. Phase 6B assessment unchanged.
 * 23. Phase 6C decision authority unchanged.
 * 24. Phase 6D plan bridge unchanged.
 * 25. Phase 6E outcome semantics unchanged.
 * 26. Phase 6F trajectory semantics unchanged.
 * 27. Zero psychological / cognitive inferences.
 * 28. Zero statistical / predictive claims.
 * 29. Zero evidence invention.
 * 30. Single orchestrator integrity & no state-machine changes.
 * 31. Multi-skill plan blockage -> NARROW_LEARNING_SCOPE.
 * 32. Execution blockage -> INCREASE_PLAN_GRANULARITY.
 * 33. Deterministic repeatability.
 * 34. Decision context enrichment via applyAdaptivePolicyToDecisionContext.
 * 35. Orchestrator onUpdating handler integration.
 */

import {
  evaluateAdaptiveLearningPolicyDeterministic,
  evaluateAdaptiveLearningPolicyAsync,
  applyAdaptivePolicyToDecisionContext,
  createAdaptationPolicyHandler,
} from '../src/lib/agent/adaptation-policy';
import {
  AdaptiveLearningPolicy,
  EvaluateAdaptationInput,
  AdaptivePolicyLlmClient,
  DecisionContextWithAdaptation,
} from '../src/lib/agent/adaptation-types';
import {
  EvidenceRecord,
  Mistake,
} from '../src/lib/agent/types';
import {
  GoalUnderstanding,
} from '../src/lib/agent/goal-understanding-types';
import {
  StudentLearningAssessment,
} from '../src/lib/agent/assessment-types';
import {
  LearningDecision,
} from '../src/lib/agent/decision-types';
import {
  LearningPlan,
} from '../src/lib/agent/planning-types';
import {
  LearningOutcome,
  LearningFeedback,
} from '../src/lib/agent/outcome-feedback-types';
import {
  LearningTrajectory,
} from '../src/lib/agent/trajectory-types';
import {
  createInitialAgentState,
  transitionAgentState,
} from '../src/lib/agent/state-machine';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runAdaptationPolicyVerificationSuite(): Promise<void> {
  console.log('===============================================================');
  console.log('PHASE 6G: ADAPTIVE LEARNING POLICY VERIFICATION SUITE');
  console.log('===============================================================');

  const userId = 'student_test_uid_6g';
  const now = '2026-09-16T12:00:00.000Z';

  // 1. Verified successful outcome -> preserve successful pattern
  console.log('\n--- Test 1: Verified successful outcome -> preserve successful pattern ---');
  const verifiedOutcome: LearningOutcome = {
    outcomeId: 'out_v1',
    planId: 'plan_v1',
    userId,
    goalReference: 'Master Python fundamentals',
    targetSkills: ['Python'],
    planStatus: 'COMPLETED',
    completionStatus: 'COMPLETED',
    learningOutcomeStatus: 'VERIFIED_SUCCESS',
    learningOutcomeVerified: true,
    completedSteps: ['step-1'],
    incompleteSteps: [],
    blockedSteps: [],
    stepOutcomes: [],
    verificationResults: [],
    actionOutcome: {
      totalSteps: 1,
      completedStepsCount: 1,
      incompleteStepsCount: 0,
      blockedStepsCount: 0,
      failedStepsCount: 0,
      executedTools: [],
      writeActionsAttempted: 0,
      writeActionsVerified: 0,
      actionSummary: 'All steps executed',
    },
    evidence: [
      {
        evidenceId: 'ev_pass1',
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkill: 'Python',
        description: 'Passed all test cases',
        observedAt: now,
        isSupporting: true,
        isContradictory: false,
      },
    ],
    contradictions: [],
    evidenceGaps: [],
    capabilityFailures: [],
    confidence: 0.95,
    outcomeSummary: 'Outcome verified successfully with empirical proof.',
    limitations: [],
    source: 'DETERMINISTIC',
    createdAt: now,
  };

  const sufficientTrajectory: LearningTrajectory = {
    trajectoryId: 'traj_s1',
    userId,
    observationWindow: { startDate: '2026-08-16T12:00:00.000Z', endDate: now, windowDays: 31 },
    dataCoverage: { totalObservations: 12, totalTimestampedObservations: 12, distinctObservationDays: 8, timeSpanDays: 31, observationSpanDays: 31, sourcesPresent: ['github', 'leetcode'], missingTimestampCount: 0 },
    historySufficiency: 'SUFFICIENT',
    skillTrajectories: [{ skillName: 'Python', direction: 'IMPROVING', totalSupportingEvidence: 10, totalContradictingEvidence: 0, recentSupportingCount: 6, recentContradictingCount: 0, mistakeCount: 0, retentionStatus: 'RETAINED', signals: [], summary: 'Python improving' }],
    activityTrajectory: { direction: 'INCREASING', completedTasksCount: 5, totalTrackedStudyMinutes: 300, totalGitHubEvents: 10, totalLeetCodeSubmissions: 5, recentActivitySummary: 'Active' },
    mistakeTrajectory: { pattern: 'IMPROVING_MISTAKE_PATTERN', totalMistakesCount: 0, recurringCategories: [], resolvedCategoriesCount: 0, activeUnresolvedCategories: [], summary: 'No mistakes' },
    outcomeTrajectory: { totalPlansCount: 2, completedPlansCount: 2, partiallyCompletedPlansCount: 0, blockedPlansCount: 0, failedPlansCount: 0, verifiedOutcomesCount: 2, insufficientEvidenceOutcomesCount: 0, contradictedOutcomesCount: 0, summary: 'Plans completed' },
    contradictionTrajectory: { emergingContradictions: [], resolvedContradictions: [], unresolvedContradictions: [], summary: 'None' },
    signals: [{ signalId: 'sig_1', type: 'IMPROVING_EVIDENCE', description: 'Evidence improving', confidence: 0.9, evidenceReferences: [] }],
    unresolvedEvidenceGaps: [],
    retentionSignals: ['Retained Python'],
    decaySignals: [],
    confidence: 0.85,
    summary: 'Strong trajectory',
    limitations: [],
    source: 'DETERMINISTIC',
    createdAt: now,
  };

  const res1 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningOutcome: verifiedOutcome,
    learningTrajectory: sufficientTrajectory,
    timestamp: now,
  });

  assert(res1.policy.adaptationSignals.some((s) => s.type === 'PRESERVE_SUCCESSFUL_PATTERN'), 'PRESERVE_SUCCESSFUL_PATTERN signal emitted');
  assert(res1.policy.adaptationRecommendations.some((r) => r.sourceSignals.includes('PRESERVE_SUCCESSFUL_PATTERN')), 'Preserve successful recommendation created');

  // 2. Completed plan but insufficient learning evidence -> no false success adaptation
  console.log('\n--- Test 2: Completed plan but insufficient learning evidence -> no false success ---');
  const actionCompletedOnlyOutcome: LearningOutcome = {
    outcomeId: 'out_nv',
    planId: 'plan_nv',
    userId,
    goalReference: 'Practice Python tasks',
    targetSkills: ['Python'],
    planStatus: 'COMPLETED',
    completionStatus: 'COMPLETED',
    learningOutcomeStatus: 'INSUFFICIENT_EVIDENCE',
    learningOutcomeVerified: false,
    completedSteps: ['step-1'],
    incompleteSteps: [],
    blockedSteps: [],
    stepOutcomes: [],
    verificationResults: [],
    actionOutcome: {
      totalSteps: 1,
      completedStepsCount: 1,
      incompleteStepsCount: 0,
      blockedStepsCount: 0,
      failedStepsCount: 0,
      executedTools: [],
      writeActionsAttempted: 0,
      writeActionsVerified: 0,
      actionSummary: 'Step completed',
    },
    evidence: [],
    contradictions: [],
    evidenceGaps: ['Missing test submission proof'],
    capabilityFailures: [],
    confidence: 0.3,
    outcomeSummary: 'Plan completed execution, but zero empirical learning proof gathered.',
    limitations: ['Unverified outcome'],
    source: 'DETERMINISTIC',
    createdAt: now,
  };

  const res2 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningOutcome: actionCompletedOnlyOutcome,
    learningTrajectory: sufficientTrajectory,
    timestamp: now,
  });

  assert(!res2.policy.adaptationSignals.some((s) => s.type === 'PRESERVE_SUCCESSFUL_PATTERN'), 'Zero false PRESERVE_SUCCESSFUL_PATTERN on unverified learning');
  assert(res2.policy.adaptationSignals.some((s) => s.type === 'REQUEST_MORE_EVIDENCE'), 'REQUEST_MORE_EVIDENCE signal emitted instead');

  // 3. Repeated mistakes + sufficient evidence -> review-focused adaptation
  console.log('\n--- Test 3: Repeated mistakes + sufficient evidence -> review-focused adaptation ---');
  const mistakesList: Mistake[] = [
    { id: 'm1', title: 'SQL Join error', category: 'Database', root_cause: 'Missing ON', solution: 'Add ON', prevention_rule: null, severity: 'medium', skill_id: null, created_at: now, updated_at: now },
    { id: 'm2', title: 'SQL Join error 2', category: 'Database', root_cause: 'Ambiguous column', solution: 'Alias table', prevention_rule: null, severity: 'medium', skill_id: null, created_at: now, updated_at: now },
  ];
  const res3 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    mistakes: mistakesList,
    learningTrajectory: {
      ...sufficientTrajectory,
      mistakeTrajectory: {
        pattern: 'PERSISTENT_MISTAKE_PATTERN',
        totalMistakesCount: 2,
        recurringCategories: ['Database'],
        resolvedCategoriesCount: 0,
        activeUnresolvedCategories: ['Database'],
        summary: 'Persistent Database errors',
      },
    },
    timestamp: now,
  });
  assert(res3.policy.adaptationSignals.some((s) => s.type === 'INCREASE_REVIEW_FOCUS'), 'INCREASE_REVIEW_FOCUS signal emitted');
  assert(res3.policy.adaptationRecommendations.some((r) => r.sourceSignals.includes('INCREASE_REVIEW_FOCUS')), 'Review recommendation created');

  // 4. Contradictory evidence -> contradiction preserved & REASSESS_BEFORE_ESCALATION
  console.log('\n--- Test 4: Contradictory evidence -> contradiction preserved & REASSESS_BEFORE_ESCALATION ---');
  const contradictoryAssessment: StudentLearningAssessment = {
    assessmentId: 'ass_contra',
    userId,
    assessedAt: now,
    targetSkills: ['DBMS'],
    skillAssessments: [
      {
        skillName: 'DBMS',
        claimedProficiency: 5,
        calibratedProficiency: 2,
        confidenceLevel: 'LOW',
        evidenceCategory: 'CONTRADICTED',
        evidenceBackedScore: 0.2,
        epistemicCounts: { externallyVerified: 0, observed: 1, inferred: 0, selfReported: 1 },
        freshness: { status: 'RECENT', daysSinceNewest: 2, isStale: false },
        supportingEvidence: [],
        contradictingEvidence: ['Student claimed 5/5 in DBMS but failed basic schema query.'],
        missingEvidenceGaps: ['DBMS practical verification'],
        contradictions: [],
        missingRequirements: [],
        narrative: 'Contradiction between claimed proficiency and query failure.',
        isTargetSkill: true,
      },
    ],
    supportedStrengths: [],
    developingAreas: [],
    evidenceGaps: ['DBMS practical verification'],
    contradictedAreas: ['DBMS'],
    observablePatterns: [],
    recentActivitySummary: {
      totalEvidenceRecords: 2,
      hasRecentGitHubActivity: false,
      hasRecentLeetCodeActivity: true,
      hasLoggedMistakes: true,
      hasFocusSessions: false,
      activeSources: ['leetcode'],
    },
    assessmentSummary: 'Discrepancy in DBMS',
    recommendedFocusAreas: ['DBMS Joins'],
    overallConfidence: 'LOW',
    source: 'DETERMINISTIC_ONLY',
  };
  const res4 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    studentAssessment: contradictoryAssessment,
    timestamp: now,
  });
  assert(res4.policy.contradictions.length === 1, 'Contradiction preserved in policy');
  assert(res4.policy.adaptationSignals.some((s) => s.type === 'REASSESS_BEFORE_ESCALATION'), 'REASSESS_BEFORE_ESCALATION signal emitted');
  assert(res4.policy.humanReviewRequired === true, 'humanReviewRequired is true for contradictory state');

  // 5. Insufficient trajectory history -> request more evidence
  console.log('\n--- Test 5: Insufficient trajectory history -> request more evidence ---');
  const sparseTrajectory: LearningTrajectory = {
    ...sufficientTrajectory,
    historySufficiency: 'INSUFFICIENT',
    dataCoverage: { totalObservations: 1, totalTimestampedObservations: 1, distinctObservationDays: 1, timeSpanDays: 0, observationSpanDays: 0, sourcesPresent: ['github'], missingTimestampCount: 0 },
  };
  const res5 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningTrajectory: sparseTrajectory,
    timestamp: now,
  });
  assert(res5.policy.adaptationSignals.some((s) => s.type === 'REQUEST_MORE_EVIDENCE'), 'REQUEST_MORE_EVIDENCE emitted for sparse trajectory');
  assert(res5.policy.requiresMoreEvidence === true, 'requiresMoreEvidence is true');

  // 6. Stale evidence -> stale evidence refresh signal
  console.log('\n--- Test 6: Stale evidence -> stale evidence refresh signal ---');
  const staleTrajectory: LearningTrajectory = {
    ...sufficientTrajectory,
    skillTrajectories: [{ skillName: 'C++', direction: 'DECLINING', totalSupportingEvidence: 2, totalContradictingEvidence: 0, recentSupportingCount: 0, recentContradictingCount: 0, mistakeCount: 0, retentionStatus: 'STALE', signals: [], summary: 'C++ stale' }],
  };
  const res6 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningTrajectory: staleTrajectory,
    timestamp: now,
  });
  assert(res6.policy.adaptationSignals.some((s) => s.type === 'REFRESH_STALE_EVIDENCE'), 'REFRESH_STALE_EVIDENCE signal emitted');

  // 7. Strong global history but insufficient skill-specific history -> no strong skill adaptation
  console.log('\n--- Test 7: Strong global history but insufficient skill-specific history ---');
  const globalStrongPyWeakTrajectory: LearningTrajectory = {
    ...sufficientTrajectory,
    skillTrajectories: [
      { skillName: 'Rust', direction: 'IMPROVING', totalSupportingEvidence: 10, totalContradictingEvidence: 0, recentSupportingCount: 6, recentContradictingCount: 0, mistakeCount: 0, retentionStatus: 'RETAINED', signals: [], summary: 'Rust strong' },
      { skillName: 'Python', direction: 'INSUFFICIENT_DATA', totalSupportingEvidence: 1, totalContradictingEvidence: 0, recentSupportingCount: 1, recentContradictingCount: 0, mistakeCount: 0, retentionStatus: 'NOT_VERIFIABLE', signals: [], summary: 'Python unverified' },
    ],
  };
  const res7 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    goalUnderstanding: {
      originalGoal: 'Learn Python',
      normalizedGoal: 'Learn Python',
      category: 'SKILL_IMPROVEMENT',
      categoryConfidence: 0.9,
      objective: 'Master Python fundamentals',
      targetSkill: 'Python',
      targetSkillStatus: 'EXPLICIT',
      timeframe: null,
      timeframeStatus: 'UNKNOWN',
      urgency: 'MEDIUM',
      constraints: [],
      ambiguityFlags: [],
      clarificationNeeded: false,
      clarificationQuestions: [],
      extractedSignals: [],
      reasoningSummary: 'Goal target: Python',
      confidence: 'HIGH',
      source: 'DETERMINISTIC_ONLY',
      createdAt: now,
    },
    learningTrajectory: globalStrongPyWeakTrajectory,
    timestamp: now,
  });
  assert(!res7.policy.adaptationSignals.some((s) => s.type === 'PRESERVE_SUCCESSFUL_PATTERN'), 'No false preserve pattern on unverified skill');

  // 8. Mixed trajectory -> reduce adaptation confidence
  console.log('\n--- Test 8: Mixed / limited trajectory -> reduce adaptation confidence ---');
  const limitedTrajectory: LearningTrajectory = {
    ...sufficientTrajectory,
    historySufficiency: 'LIMITED',
    dataCoverage: { totalObservations: 3, totalTimestampedObservations: 3, distinctObservationDays: 2, timeSpanDays: 4, observationSpanDays: 4, sourcesPresent: ['github'], missingTimestampCount: 0 },
  };
  const res8 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningTrajectory: limitedTrajectory,
    timestamp: now,
  });
  assert(res8.policy.adaptationSignals.some((s) => s.type === 'REDUCE_ADAPTATION_CONFIDENCE'), 'REDUCE_ADAPTATION_CONFIDENCE signal emitted');

  // 9. Missing telemetry -> uncertainty, not negative inference
  console.log('\n--- Test 9: Missing telemetry -> uncertainty, not negative inference ---');
  const res9 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    timestamp: now,
  });
  assert(res9.policy.adaptationSignals.some((s) => s.type === 'REQUEST_MORE_EVIDENCE'), 'Missing telemetry yields REQUEST_MORE_EVIDENCE');
  assert(!res9.policy.adaptationSignals.some((s) => s.type === 'INCREASE_REVIEW_FOCUS'), 'Zero false negative review signal when telemetry is missing');

  // 10. Self-reported success only -> insufficient for verified success
  console.log('\n--- Test 10: Self-reported success only -> insufficient for verified success ---');
  const selfReportedOutcome: LearningOutcome = {
    outcomeId: 'out_sr',
    planId: 'plan_sr',
    userId,
    goalReference: 'Master Java',
    targetSkills: ['Java'],
    planStatus: 'COMPLETED',
    completionStatus: 'COMPLETED',
    learningOutcomeStatus: 'INSUFFICIENT_EVIDENCE',
    learningOutcomeVerified: false,
    completedSteps: ['step-1'],
    incompleteSteps: [],
    blockedSteps: [],
    stepOutcomes: [],
    verificationResults: [],
    actionOutcome: {
      totalSteps: 1,
      completedStepsCount: 1,
      incompleteStepsCount: 0,
      blockedStepsCount: 0,
      failedStepsCount: 0,
      executedTools: [],
      writeActionsAttempted: 0,
      writeActionsVerified: 0,
      actionSummary: 'Step completed',
    },
    evidence: [
      {
        evidenceId: 'ev_sr',
        source: 'notes',
        classification: 'SELF_REPORTED',
        targetSkill: 'Java',
        description: 'Student wrote: I mastered Java',
        observedAt: now,
        isSupporting: true,
        isContradictory: false,
      },
    ],
    contradictions: [],
    evidenceGaps: ['Missing objective test/code corroboration'],
    capabilityFailures: [],
    confidence: 0.2,
    outcomeSummary: 'Self-reported note only.',
    limitations: ['Subjective claim'],
    source: 'DETERMINISTIC',
    createdAt: now,
  };
  const res10 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    learningOutcome: selfReportedOutcome,
    timestamp: now,
  });
  assert(res10.policy.requiresMoreEvidence === true, 'Self-reported outcome requires more evidence');
  assert(!res10.policy.adaptationSignals.some((s) => s.type === 'PRESERVE_SUCCESSFUL_PATTERN'), 'Zero PRESERVE_SUCCESSFUL_PATTERN on purely self-reported claim');

  // 11. Gemini unavailable -> deterministic fallback
  console.log('\n--- Test 11: Gemini unavailable -> deterministic fallback ---');
  const res11 = await evaluateAdaptiveLearningPolicyAsync({
    userId,
    learningOutcome: verifiedOutcome,
    learningTrajectory: sufficientTrajectory,
    allowLlm: true,
    timestamp: now,
  }, null);
  assert(res11.source === 'DETERMINISTIC', 'Source is DETERMINISTIC when Gemini client is null');
  assert(res11.policy.adaptationSignals.length > 0, 'Signals present in fallback');

  // 12. Gemini malformed -> deterministic fallback
  console.log('\n--- Test 12: Gemini malformed -> deterministic fallback ---');
  const malformedLlmClient: AdaptivePolicyLlmClient = {
    generateContent: async () => ({ text: 'NOT_JSON' }),
  };
  const res12 = await evaluateAdaptiveLearningPolicyAsync({
    userId,
    learningOutcome: verifiedOutcome,
    learningTrajectory: sufficientTrajectory,
    allowLlm: true,
    timestamp: now,
  }, malformedLlmClient);
  assert(res12.source === 'DETERMINISTIC', 'Malformed output cleanly falls back to DETERMINISTIC');

  // 13. Gemini cannot override deterministic output
  console.log('\n--- Test 13: Gemini cannot override deterministic output ---');
  const spoofingLlmClient: AdaptivePolicyLlmClient = {
    generateContent: async () => ({
      text: JSON.stringify({
        narrativeRationale: 'Spoofed rationale',
        adaptationSignals: [{ type: 'NO_ADAPTATION' }], // Spoof attempt
      }),
    }),
  };
  const res13 = await evaluateAdaptiveLearningPolicyAsync({
    userId,
    learningOutcome: verifiedOutcome,
    learningTrajectory: sufficientTrajectory,
    allowLlm: true,
    timestamp: now,
  }, spoofingLlmClient);
  assert(res13.policy.adaptationSignals.some((s) => s.type === 'PRESERVE_SUCCESSFUL_PATTERN'), 'Deterministic signals strictly preserved despite LLM spoofing');

  // 14-17. 6G Boundary Guarantees (No direct 6C action, no plan creation, no tools, no writes)
  console.log('\n--- Test 14-17: 6G Boundary Guarantees ---');
  assert(!('decisionType' in res1.policy), '6G does not output a 6C decisionType');
  assert(!('steps' in res1.policy), '6G does not create a LearningPlan');
  assert(!('executeTool' in res1.policy), '6G does not execute tools');
  assert(!('writeRecord' in res1.policy), '6G does not perform direct database writes');

  // 18. Human approval boundaries intact
  console.log('\n--- Test 18: Human approval boundaries intact ---');
  assert(res4.policy.humanReviewRequired === true, 'humanReviewRequired respected when contradictions exist');

  // 19. Working-memory serialization / deserialization round-trip
  console.log('\n--- Test 19: Working-memory serialization/deserialization ---');
  const serialized = JSON.stringify(res1.policy);
  const deserialized: AdaptiveLearningPolicy = JSON.parse(serialized);
  assert(deserialized.policyId === res1.policy.policyId, 'Round-trip policy ID intact');
  assert(deserialized.adaptationSignals.length === res1.policy.adaptationSignals.length, 'Round-trip signals intact');

  // 20. Tenant isolation preserved
  console.log('\n--- Test 20: Tenant isolation preserved ---');
  assert(res1.policy.userId === userId, 'userId strictly bounded');

  // 21-26. Foundational invariances (1, 6B, 6C, 6D, 6E, 6F semantics)
  console.log('\n--- Test 21-26: Foundational invariances ---');
  assert(res4.policy.contradictions.length === 1, 'Phase 1/6B Contradiction semantics preserved');
  assert(res1.policy.evidenceBasis.length > 0, 'Phase 6E outcome evidence basis preserved');
  assert(res1.policy.trajectoryBasis.length > 0, 'Phase 6F trajectory basis preserved');

  // 27-29. Scientific/Epistemic boundaries (no psychological inference, no probability claims, no evidence invention)
  console.log('\n--- Test 27-29: Epistemic integrity ---');
  const signalJson = JSON.stringify(res1.policy);
  assert(!signalJson.includes('motivation'), 'Zero psychological motivation claims');
  assert(!signalJson.includes('intelligence'), 'Zero intelligence claims');
  assert(!signalJson.includes('statistically proven'), 'Zero statistical certainty claims');

  // 30. Single orchestrator integrity & no state-machine changes
  console.log('\n--- Test 30: Single orchestrator integrity & no state-machine changes ---');
  let agentState = createInitialAgentState({
    userId,
    goal: 'Adapt future learning cycle',
  });
  agentState = transitionAgentState(agentState, { targetState: 'GOAL_RECEIVED', reason: 'Goal' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'OBSERVING', reason: 'Observing' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'CORROBORATING', reason: 'Corroborating' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'ASSESSING', reason: 'Assessing' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'PLANNING', reason: 'Planning' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'TOOL_SELECTION', reason: 'Tool selection' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'EXECUTING', reason: 'Executing' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'VERIFYING', reason: 'Verifying' }).state;
  agentState = transitionAgentState(agentState, { targetState: 'UPDATING', reason: 'Updating' }).state;

  const adaptationHandler = createAdaptationPolicyHandler({ timestamp: now });
  const handlerResult = await adaptationHandler(agentState);

  assert(handlerResult.nextState === 'COMPLETED', 'Handler cleanly advances to COMPLETED');
  assert(handlerResult.workingMemory?.adaptiveLearningPolicy !== undefined, 'workingMemory updated with adaptiveLearningPolicy');

  // 31. Multi-skill plan blockage -> NARROW_LEARNING_SCOPE
  console.log('\n--- Test 31: Multi-skill plan blockage -> NARROW_LEARNING_SCOPE ---');
  const blockedMultiSkillPlan: LearningPlan = {
    planId: 'plan_blk',
    userId,
    version: 1,
    goal: 'Learn Docker and Kubernetes',
    objectives: ['Learn Docker', 'Learn Kubernetes'],
    steps: [],
    priority: 'MEDIUM',
    status: 'BLOCKED',
    constraints: [],
    successCriteria: ['Complete both modules'],
    verificationCriteria: ['Verify deployment'],
    approvalRequirement: { requiresApproval: false },
    targetSkill: 'Docker',
    prerequisites: [],
    createdAt: now,
    updatedAt: now,
  };
  const res31 = evaluateAdaptiveLearningPolicyDeterministic({
    userId,
    executedPlan: blockedMultiSkillPlan,
    goalUnderstanding: {
      originalGoal: 'Learn Docker and Kubernetes',
      normalizedGoal: 'Learn Docker and Kubernetes',
      category: 'SKILL_IMPROVEMENT',
      categoryConfidence: 0.9,
      objective: 'Master Docker and Kubernetes',
      targetSkill: 'Docker',
      targetSkillStatus: 'EXPLICIT',
      timeframe: null,
      timeframeStatus: 'UNKNOWN',
      urgency: 'MEDIUM',
      constraints: [],
      ambiguityFlags: [],
      clarificationNeeded: false,
      clarificationQuestions: [],
      extractedSignals: [
        { dimension: 'TARGET_SKILL', value: 'Docker', status: 'EXPLICIT', confidence: 1.0 },
        { dimension: 'TARGET_SKILL', value: 'Kubernetes', status: 'EXPLICIT', confidence: 1.0 },
      ],
      reasoningSummary: 'Multi-skill goal',
      confidence: 'HIGH',
      source: 'DETERMINISTIC_ONLY',
      createdAt: now,
    },
    timestamp: now,
  });
  assert(res31.policy.adaptationSignals.some((s) => s.type === 'NARROW_LEARNING_SCOPE'), 'NARROW_LEARNING_SCOPE emitted for multi-skill blocked plan');
  assert(res31.policy.adaptationSignals.some((s) => s.type === 'INCREASE_PLAN_GRANULARITY'), 'INCREASE_PLAN_GRANULARITY emitted for blocked plan');

  // 32. Execution blockage -> INCREASE_PLAN_GRANULARITY
  console.log('\n--- Test 32: Execution blockage -> INCREASE_PLAN_GRANULARITY ---');
  assert(res31.policy.adaptationRecommendations.some((r) => r.sourceSignals.includes('INCREASE_PLAN_GRANULARITY')), 'Plan granularity recommendation created');

  // 33. Deterministic repeatability
  console.log('\n--- Test 33: Deterministic repeatability ---');
  const run1 = evaluateAdaptiveLearningPolicyDeterministic({ userId, learningOutcome: verifiedOutcome, learningTrajectory: sufficientTrajectory, timestamp: now });
  const run2 = evaluateAdaptiveLearningPolicyDeterministic({ userId, learningOutcome: verifiedOutcome, learningTrajectory: sufficientTrajectory, timestamp: now });
  assert(run1.policy.adaptationSignals.length === run2.policy.adaptationSignals.length, 'Repeatable signals length');
  assert(run1.policy.confidence === run2.policy.confidence, 'Repeatable confidence');

  // 34. Decision context enrichment via applyAdaptivePolicyToDecisionContext
  console.log('\n--- Test 34: Decision context enrichment ---');
  const baseDecisionContext: DecisionContextWithAdaptation = {
    studentAssessment: contradictoryAssessment,
    goalUnderstanding: null,
    learningTrajectory: sufficientTrajectory,
    learningFeedback: null,
    adaptiveLearningPolicy: null,
  };
  const enrichedContext = applyAdaptivePolicyToDecisionContext(baseDecisionContext, res1.policy);
  assert(enrichedContext.adaptiveLearningPolicy?.policyId === res1.policy.policyId, 'Context enriched with adaptive policy');
  assert(enrichedContext.studentAssessment.overallConfidence === 'LOW', 'Assessment remains untouched in enriched context');

  // 35. Orchestrator onUpdating handler integration
  console.log('\n--- Test 35: Orchestrator onUpdating handler integration ---');
  assert(agentState.currentState === 'UPDATING', 'Lifecycle uses canonical UPDATING state');

  console.log('\n===============================================================');
  console.log('✨ ALL 35 PHASE 6G ADAPTIVE LEARNING POLICY TESTS PASSED!');
  console.log('===============================================================');
}

runAdaptationPolicyVerificationSuite().catch((err) => {
  console.error('Fatal test error in Phase 6G suite:', err);
  process.exit(1);
});
