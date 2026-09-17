/**
 * Phase 6A: Intelligent Goal Understanding Verification Suite
 * 
 * Verifies:
 * 1. Clear skill-improvement goal parsing
 * 2. Clear exam-preparation goal parsing with timeframe and subtopic extraction
 * 3. General learning goal parsing
 * 4. Schedule-planning goal parsing
 * 5. Remedial-practice goal parsing
 * 6. Corroboration-audit goal parsing
 * 7. Ambiguous / vague goal detection (clarificationNeeded: true)
 * 8. Missing target skill detection with structured clarification questions
 * 9. Missing timeframe detection (marked UNKNOWN, never fabricated)
 * 10. Explicit vs Inferred epistemic status tracking
 * 11. Anti-hallucination guarantee (no fabricated dates, hours, or scores)
 * 12. Malformed LLM JSON response triggers graceful fallback
 * 13. LLM network failure / timeout triggers graceful fallback
 * 14. Invalid category in LLM output is rejected
 * 15. Authenticated user identity immutability
 * 16. Phase 1 Corroboration Audit telemetry grounding
 * 17. Interoperability with deterministic goal decomposition
 * 18. SINGLE Learning Orchestrator state machine preservation
 */

import assert from 'assert';
import {
  understandStudentGoal,
  understandStudentGoalDeterministic,
  validateLlmGoalUnderstandingResponse,
  UnderstandGoalInput,
  GoalUnderstanding,
  decomposeStudentGoal,
  validateAndIntakeStudentGoal,
  StudentCorroborationAuditResult,
  createInitialAgentState,
} from '../src/lib/agent';

async function runGoalUnderstandingVerificationSuite() {
  console.log('===============================================================');
  console.log('🧠 RUNNING PHASE 6A: INTELLIGENT GOAL UNDERSTANDING VERIFICATION');
  console.log('===============================================================\n');

  const userId = 'student-test-uid-phase6a';
  const fixedTimestamp = '2026-09-16T18:00:00.000Z';

  // --------------------------------------------------------------------------
  // Test 1: Clear Skill-Improvement Goal
  // --------------------------------------------------------------------------
  console.log('Test 1: Clear Skill-Improvement Goal...');
  const res1 = await understandStudentGoal({
    userId,
    rawGoalText: 'I want to improve my Python skills for data engineering and pipelines',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res1.category, 'SKILL_IMPROVEMENT');
  assert.strictEqual(res1.targetSkill, 'Python');
  assert.strictEqual(res1.targetSkillStatus, 'EXPLICIT');
  assert.strictEqual(res1.subtopic, 'Data Engineering');
  assert.strictEqual(res1.clarificationNeeded, false);
  assert(res1.confidence === 'HIGH' || res1.confidence === 'MODERATE');
  console.log('  ✓ [PASS] 1. Skill improvement understood with targetSkill = Python and subtopic = Data Engineering\n');

  // --------------------------------------------------------------------------
  // Test 2: Clear Exam-Preparation Goal with Timeframe & Subtopic
  // --------------------------------------------------------------------------
  console.log('Test 2: Clear Exam-Preparation Goal...');
  const res2 = await understandStudentGoal({
    userId,
    rawGoalText: "I have my DBMS exam next Friday and I'm weak in normalization. Help me prepare.",
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res2.category, 'EXAM_PREPARATION');
  assert.strictEqual(res2.targetSkill, 'DBMS');
  assert.strictEqual(res2.targetSkillStatus, 'EXPLICIT');
  assert.strictEqual(res2.subtopic, 'Normalization');
  assert.strictEqual(res2.timeframe, 'next Friday');
  assert.strictEqual(res2.timeframeStatus, 'EXPLICIT');
  assert.strictEqual(res2.urgency, 'HIGH');
  assert.strictEqual(res2.clarificationNeeded, false);
  assert.strictEqual(res2.confidence, 'HIGH');
  console.log('  ✓ [PASS] 2. Exam goal correctly parsed with DBMS / Normalization / next Friday / HIGH urgency\n');

  // --------------------------------------------------------------------------
  // Test 3: General Learning Goal
  // --------------------------------------------------------------------------
  console.log('Test 3: General Learning Goal...');
  const res3 = await understandStudentGoal({
    userId,
    rawGoalText: 'Overview of distributed systems architecture and system design principles',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res3.category, 'GENERAL_LEARNING');
  assert.strictEqual(res3.targetSkill, 'System Design');
  assert.strictEqual(res3.targetSkillStatus, 'EXPLICIT');
  assert.strictEqual(res3.clarificationNeeded, false);
  console.log('  ✓ [PASS] 3. General learning goal correctly identified\n');

  // --------------------------------------------------------------------------
  // Test 4: Schedule-Planning Goal
  // --------------------------------------------------------------------------
  console.log('Test 4: Schedule-Planning Goal...');
  const res4 = await understandStudentGoal({
    userId,
    rawGoalText: 'Plan my study schedule for this week around upcoming deadlines',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res4.category, 'SCHEDULE_PLANNING');
  assert.strictEqual(res4.timeframe, 'this week');
  assert.strictEqual(res4.timeframeStatus, 'EXPLICIT');
  assert.strictEqual(res4.clarificationNeeded, false);
  console.log('  ✓ [PASS] 4. Schedule planning goal correctly parsed with timeframe = this week\n');

  // --------------------------------------------------------------------------
  // Test 5: Remedial-Practice Goal
  // --------------------------------------------------------------------------
  console.log('Test 5: Remedial-Practice Goal...');
  const res5 = await understandStudentGoal({
    userId,
    rawGoalText: 'Review and fix my recurring mistake patterns in SQL query optimization',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res5.category, 'REMEDIAL_PRACTICE');
  assert.strictEqual(res5.targetSkill, 'DBMS');
  assert.strictEqual(res5.subtopic, 'Query Optimization');
  assert.strictEqual(res5.clarificationNeeded, false);
  console.log('  ✓ [PASS] 5. Remedial practice goal correctly recognized\n');

  // --------------------------------------------------------------------------
  // Test 6: Corroboration-Audit Goal
  // --------------------------------------------------------------------------
  console.log('Test 6: Corroboration-Audit Goal...');
  const res6 = await understandStudentGoal({
    userId,
    rawGoalText: 'Please run an evidence audit and verify my claimed skills against GitHub and LeetCode',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res6.category, 'CORROBORATION_AUDIT');
  assert.strictEqual(res6.clarificationNeeded, false);
  console.log('  ✓ [PASS] 6. Corroboration audit goal correctly identified\n');

  // --------------------------------------------------------------------------
  // Test 7: Ambiguous / Vague Goal Detection
  // --------------------------------------------------------------------------
  console.log('Test 7: Ambiguous / Vague Goal Detection...');
  const res7 = await understandStudentGoal({
    userId,
    rawGoalText: 'help me code',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res7.clarificationNeeded, true);
  assert(res7.clarificationQuestions.length > 0);
  assert(res7.ambiguityFlags.includes('MISSING_TARGET_SKILL') || res7.ambiguityFlags.includes('VAGUE_GOAL_SCOPE'));
  assert.strictEqual(res7.confidence, 'LOW');
  console.log('  ✓ [PASS] 7. Vague goal triggers clarificationNeeded: true with clarificationQuestions\n');

  // --------------------------------------------------------------------------
  // Test 8: Missing Target Skill Prompting
  // --------------------------------------------------------------------------
  console.log('Test 8: Missing Target Skill Handling...');
  const res8 = await understandStudentGoal({
    userId,
    rawGoalText: 'Prepare me for my exam in 3 days',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res8.targetSkill, null);
  assert.strictEqual(res8.targetSkillStatus, 'UNKNOWN');
  assert(res8.clarificationQuestions.some((q) => q.dimension === 'TARGET_SKILL'));
  console.log('  ✓ [PASS] 8. Missing target skill correctly generates TARGET_SKILL question\n');

  // --------------------------------------------------------------------------
  // Test 9: Missing Timeframe Detection (Marked UNKNOWN, Never Fabricated)
  // --------------------------------------------------------------------------
  console.log('Test 9: Missing Timeframe Handling (Anti-Fabrication)...');
  const res9 = await understandStudentGoal({
    userId,
    rawGoalText: 'I want to master React custom hooks',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res9.timeframe, null);
  assert.strictEqual(res9.timeframeStatus, 'UNKNOWN');
  assert.strictEqual(res9.targetSkill, 'React');
  assert.strictEqual(res9.subtopic, 'Custom Hooks');
  console.log('  ✓ [PASS] 9. Unstated timeframe remains null / UNKNOWN without fabricating dates\n');

  // --------------------------------------------------------------------------
  // Test 10: Explicit vs Inferred Epistemic Tracking
  // --------------------------------------------------------------------------
  console.log('Test 10: Explicit vs Inferred Information Tagging...');
  const res10 = await understandStudentGoal({
    userId,
    rawGoalText: 'I have an Operating Systems exam tomorrow and need CPU scheduling review with only 2 hours available',
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res10.targetSkillStatus, 'EXPLICIT');
  assert.strictEqual(res10.timeframeStatus, 'EXPLICIT');
  assert.strictEqual(res10.urgency, 'CRITICAL');
  assert(res10.constraints.length > 0);
  assert(res10.constraints[0].includes('2 hours'));
  console.log('  ✓ [PASS] 10. Direct student statements strictly tagged as EXPLICIT\n');

  // --------------------------------------------------------------------------
  // Test 11: Unknown Information Is Not Invented
  // --------------------------------------------------------------------------
  console.log('Test 11: Anti-Hallucination Invariant Verification...');
  const res11 = understandStudentGoalDeterministic({
    userId,
    rawGoalText: 'I need help with DBMS',
  });

  assert.strictEqual(res11.timeframe, null);
  assert.strictEqual(res11.timeframeStatus, 'UNKNOWN');
  assert.strictEqual(res11.subtopic, null);
  assert.strictEqual(res11.constraints.length, 0);
  assert.strictEqual(res11.originalGoal, 'I need help with DBMS');
  console.log('  ✓ [PASS] 11. Zero hallucination of dates, constraints, or subtopics\n');

  // --------------------------------------------------------------------------
  // Test 12: Malformed LLM Response Triggers Deterministic Fallback
  // --------------------------------------------------------------------------
  console.log('Test 12: Malformed LLM Response Handling...');
  const mockMalformedLlmClient = {
    generateJson: async () => 'NOT_VALID_JSON{{{',
  };

  const res12 = await understandStudentGoal({
    userId,
    rawGoalText: 'Prepare for Python exam in 5 days',
    llmClient: mockMalformedLlmClient,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res12.source, 'LLM_FALLBACK_DETERMINISTIC');
  assert.strictEqual(res12.targetSkill, 'Python');
  assert.strictEqual(res12.category, 'EXAM_PREPARATION');
  console.log('  ✓ [PASS] 12. Malformed LLM JSON safely falls back to deterministic baseline\n');

  // --------------------------------------------------------------------------
  // Test 13: LLM Network Failure / Timeout Triggers Fallback
  // --------------------------------------------------------------------------
  console.log('Test 13: LLM Network / Timeout Error Handling...');
  const mockErrorLlmClient = {
    generateJson: async () => {
      throw new Error('Network connection aborted (503 Service Unavailable)');
    },
  };

  const res13 = await understandStudentGoal({
    userId,
    rawGoalText: 'Study Operating Systems memory management',
    llmClient: mockErrorLlmClient,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res13.source, 'LLM_FALLBACK_DETERMINISTIC');
  assert.strictEqual(res13.targetSkill, 'Operating Systems');
  assert.strictEqual(res13.subtopic, 'Memory Management');
  console.log('  ✓ [PASS] 13. LLM exception caught safely without crashing or halting run\n');

  // --------------------------------------------------------------------------
  // Test 14: Invalid Category in LLM Response Rejected
  // --------------------------------------------------------------------------
  console.log('Test 14: Invalid Category in LLM Response Rejected...');
  const mockInvalidCategoryLlmClient = {
    generateJson: async () => JSON.stringify({
      category: 'INVALID_NON_EXISTENT_CATEGORY',
      objective: 'Do random things',
    }),
  };

  const res14 = await understandStudentGoal({
    userId,
    rawGoalText: 'Learn React server components',
    llmClient: mockInvalidCategoryLlmClient,
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(res14.source, 'LLM_FALLBACK_DETERMINISTIC');
  assert.strictEqual(res14.category, 'SKILL_IMPROVEMENT'); // Falls back to valid deterministic category
  console.log('  ✓ [PASS] 14. Invalid category rejected by schema validation\n');

  // --------------------------------------------------------------------------
  // Test 15: Authenticated User Identity Immutability
  // --------------------------------------------------------------------------
  console.log('Test 15: Authenticated User Identity Immutability...');
  const authenticatedUid = 'student-auth-12345';
  const intakeRes = validateAndIntakeStudentGoal(
    { userId: authenticatedUid, rawGoalText: 'Prepare for DBMS exam next Friday' },
    authenticatedUid
  );

  assert(intakeRes.success && intakeRes.triggerContext);
  const triggerCtx = intakeRes.triggerContext;

  const goalUnderstanding = await understandStudentGoal({
    userId: triggerCtx.userId,
    rawGoalText: triggerCtx.normalizedGoalText,
    allowLlm: false,
  });

  // Goal understanding does not mutate or override triggerContext.userId
  assert.strictEqual(triggerCtx.userId, authenticatedUid);
  console.log('  ✓ [PASS] 15. Authenticated user identity remains strictly immutable\n');

  // --------------------------------------------------------------------------
  // Test 16: Phase 1 Corroborated Evidence Grounding
  // --------------------------------------------------------------------------
  console.log('Test 16: Phase 1 Evidence Telemetry Grounding...');
  const mockEvidenceAudit: StudentCorroborationAuditResult = {
    auditId: 'audit-phase6a-01',
    studentUserId: userId,
    generatedAt: fixedTimestamp,
    summary: {
      totalSkillsClaimed: 2,
      highConfidenceCount: 1,
      moderateConfidenceCount: 0,
      lowConfidenceCount: 0,
      unverifiedCount: 0,
      contradictedCount: 1,
      overallGroundTruthScore: 0.5,
    },
    skillsEvaluated: [
      {
        skillId: 's1',
        skillName: 'Python',
        claimedProficiency: 4,
        assessedProficiency: 4,
        evidenceBackedScore: 0.85,
        confidenceLevel: 'HIGH',
        evidenceCount: { total: 5, supporting: 5, contradicting: 0, neutral: 0, externallyVerified: 5 },
        evidenceRecords: [],
        contradictions: [],
        missingEvidence: [],
        reasons: ['5 verified GitHub commits'],
        lastEvaluatedAt: fixedTimestamp,
      },
      {
        skillId: 's2',
        skillName: 'DBMS',
        claimedProficiency: 4,
        assessedProficiency: 2,
        evidenceBackedScore: 0.2,
        confidenceLevel: 'CONTRADICTED',
        evidenceCount: { total: 3, supporting: 1, contradicting: 2, neutral: 0, externallyVerified: 1 },
        evidenceRecords: [],
        contradictions: [{
          id: 'c1',
          skillName: 'DBMS',
          claimedProficiency: 4,
          contradictoryEvidenceIds: ['e1'],
          reason: 'High failure rate on normalization quizzes',
          severity: 'SEVERE',
        }],
        missingEvidence: [{
          skillName: 'DBMS',
          requiredClassification: 'EXTERNALLY_VERIFIED',
          description: 'Verified project code',
          recommendedAction: 'Build a relational schema and upload to GitHub',
        }],
        reasons: ['Significant test failures'],
        lastEvaluatedAt: fixedTimestamp,
      },
    ],
    warnings: [],
    limitations: [],
    metadata: {
      hasGitHubConnected: true,
      hasLeetCodeConnected: true,
      totalEvidenceLinksParsed: 8,
      engineVersion: '1.0.0',
    },
  };

  const res16 = await understandStudentGoal({
    userId,
    rawGoalText: 'Help me review DBMS mistakes before my exam',
    evidenceAudit: mockEvidenceAudit,
    allowLlm: false,
    timestamp: fixedTimestamp,
  });

  assert(res16.evidenceContextSummary !== undefined);
  assert.deepStrictEqual(res16.evidenceContextSummary.verifiedSkills, ['Python']);
  assert.deepStrictEqual(res16.evidenceContextSummary.contradictedSkills, ['DBMS']);
  assert.strictEqual(res16.evidenceContextSummary.overallGroundTruthScore, 0.5);
  console.log('  ✓ [PASS] 16. Corroborated evidence grounded into GoalUnderstanding without mutating student claim\n');

  // --------------------------------------------------------------------------
  // Test 17: Goal Decomposition Interoperability
  // --------------------------------------------------------------------------
  console.log('Test 17: Goal Decomposition Interoperability...');
  const decompRes = decomposeStudentGoal({
    triggerContext: triggerCtx,
    goalUnderstanding: res2, // Feed Phase 6A GoalUnderstanding
    timestamp: fixedTimestamp,
  });

  assert.strictEqual(decompRes.status, 'DECOMPOSED');
  if (decompRes.status === 'DECOMPOSED') {
    assert.strictEqual(decompRes.category, 'EXAM_PREPARATION');
    assert.strictEqual(decompRes.targetSkill, 'DBMS');
    assert.strictEqual(decompRes.timeframeHint, 'next Friday');
    assert(decompRes.candidateSteps.length >= 3);
    assert(decompRes.candidateSteps[0].status === 'READY');
  }
  console.log('  ✓ [PASS] 17. Goal decomposition cleanly consumes Phase 6A GoalUnderstanding\n');

  // --------------------------------------------------------------------------
  // Test 18: SINGLE Learning Orchestrator State Machine Preservation
  // --------------------------------------------------------------------------
  console.log('Test 18: SINGLE Learning Orchestrator State Machine Invariants...');
  const initialState = createInitialAgentState({
    userId,
    goal: res2.normalizedGoal,
    initialMetadata: { goalUnderstanding: res2 },
  });

  assert.strictEqual(initialState.currentState, 'IDLE');
  assert.strictEqual(initialState.context.userId, userId);
  assert.strictEqual(initialState.context.goal, res2.normalizedGoal);
  assert.strictEqual(initialState.counters.replans, 0);
  assert.strictEqual(initialState.counters.toolIterations, 0);
  console.log('  ✓ [PASS] 18. Orchestrator state model intact with exactly ONE learning orchestrator\n');

  console.log('===============================================================');
  console.log('🎉 ALL 18 PHASE 6A GOAL UNDERSTANDING TESTS PASSED!');
  console.log('===============================================================\n');
}

runGoalUnderstandingVerificationSuite().catch((err) => {
  console.error('❌ Verification suite failed:', err);
  process.exit(1);
});
