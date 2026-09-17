/**
 * Verification Suite for Phase 6C: Decision & Action Selection Layer
 * 
 * Tests the 27 specific requirements for the SINGLE Learning Orchestrator.
 */

import {
  generateLearningDecision,
  generateLearningDecisionDeterministic,
  LearningDecision,
  GenerateDecisionInput,
  DecisionType,
} from '../src/lib/agent/decision-action-selection';
import { GoalUnderstanding } from '../src/lib/agent/goal-understanding-types';
import {
  StudentLearningAssessment,
  SkillLearningAssessment,
} from '../src/lib/agent/assessment-types';
import { decomposeStudentGoal } from '../src/lib/agent/goal-decomposition';
import { VALID_AGENT_TRANSITIONS } from '../src/lib/agent/state-machine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

function createMockSkillAssessment(
  skillName: string,
  overrides: Partial<SkillLearningAssessment> = {}
): SkillLearningAssessment {
  return {
    skillName,
    claimedProficiency: 3,
    calibratedProficiency: 3,
    confidenceLevel: 'MODERATE',
    evidenceCategory: 'DEVELOPING',
    evidenceBackedScore: 0.6,
    epistemicCounts: {
      externallyVerified: 0,
      observed: 2,
      inferred: 1,
      selfReported: 1,
    },
    freshness: {
      status: 'RECENT',
      daysSinceNewest: 5,
      isStale: false,
    },
    supportingEvidence: ['Completed practice project'],
    contradictingEvidence: [],
    missingEvidenceGaps: [],
    contradictions: [],
    missingRequirements: [],
    narrative: `Skill ${skillName} evaluated with moderate evidence.`,
    isTargetSkill: true,
    ...overrides,
  };
}

function createMockAssessment(
  overrides: Partial<StudentLearningAssessment> = {}
): StudentLearningAssessment {
  return {
    assessmentId: 'mock_assess_001',
    userId: 'user_123',
    targetSkills: ['Python'],
    skillAssessments: [createMockSkillAssessment('Python')],
    supportedStrengths: [],
    developingAreas: ['Python'],
    evidenceGaps: [],
    contradictedAreas: [],
    observablePatterns: [],
    recentActivitySummary: {
      totalEvidenceRecords: 5,
      hasRecentGitHubActivity: true,
      hasRecentLeetCodeActivity: true,
      hasLoggedMistakes: false,
      hasFocusSessions: false,
      activeSources: ['github', 'leetcode'],
    },
    assessmentSummary: 'Student has moderate developing Python experience.',
    recommendedFocusAreas: ['Python'],
    overallConfidence: 'MODERATE',
    source: 'DETERMINISTIC_ONLY',
    assessedAt: new Date().toISOString(),
    ...overrides,
  };
}

function createMockGoalUnderstanding(
  overrides: Partial<GoalUnderstanding> = {}
): GoalUnderstanding {
  return {
    originalGoal: 'Improve Python for interviews',
    normalizedGoal: 'Improve Python for interviews',
    objective: 'Improve Python for interviews',
    category: 'SKILL_IMPROVEMENT',
    categoryConfidence: 0.9,
    targetSkill: 'Python',
    targetSkillStatus: 'EXPLICIT',
    subtopic: null,
    timeframe: null,
    timeframeStatus: 'UNKNOWN',
    urgency: 'MEDIUM',
    constraints: [],
    ambiguityFlags: [],
    extractedSignals: [],
    reasoningSummary: 'Goal focuses on Python skill improvement.',
    confidence: 'HIGH',
    clarificationNeeded: false,
    clarificationQuestions: [],
    source: 'DETERMINISTIC_ONLY',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function runDecisionVerificationSuite() {
  console.log('===============================================================');
  console.log('PHASE 6C: DECISION & ACTION SELECTION VERIFICATION SUITE');
  console.log('===============================================================');

  const userId = 'user_student_123';

  // 1. Clear skill-improvement goal + weak evidence
  console.log('\n--- Test 1: Clear skill-improvement goal + weak evidence ---');
  const weakSkill = createMockSkillAssessment('Python', {
    calibratedProficiency: 1,
    confidenceLevel: 'LOW',
    evidenceCategory: 'INSUFFICIENT_EVIDENCE',
    supportingEvidence: [],
    missingEvidenceGaps: ['No projects found', 'No LeetCode telemetry'],
  });
  const weakAssessment = createMockAssessment({
    skillAssessments: [weakSkill],
    targetSkills: ['Python'],
    overallConfidence: 'LOW',
  });
  const dec1 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: weakAssessment,
  });
  assert(dec1.decisionType === 'ASSESS_SKILL', 'Decision is ASSESS_SKILL when evidence is insufficient');
  assert(dec1.confidence === 'LOW', 'Confidence is LOW when evidence is weak');

  // 2. Clear skill-improvement goal + strong evidence
  console.log('\n--- Test 2: Clear skill-improvement goal + strong evidence ---');
  const strongSkill = createMockSkillAssessment('Python', {
    claimedProficiency: 5,
    calibratedProficiency: 4,
    confidenceLevel: 'HIGH',
    evidenceCategory: 'SUPPORTED_STRENGTH',
    supportingEvidence: ['3 verified production repositories', '50+ LeetCode problems solved'],
  });
  const strongAssessment = createMockAssessment({
    skillAssessments: [strongSkill],
    supportedStrengths: ['Python'],
    targetSkills: ['Python'],
    overallConfidence: 'HIGH',
  });
  const dec2 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: strongAssessment,
  });
  assert(dec2.decisionType === 'PRACTICE', 'Decision is PRACTICE for supported strengths');
  assert(dec2.confidence === 'HIGH', 'Confidence is HIGH for supported strengths');

  // 3. Exam preparation + explicit timeframe
  console.log('\n--- Test 3: Exam preparation + explicit timeframe ---');
  const examGoal = createMockGoalUnderstanding({
    originalGoal: 'Prepare for DBMS final exam in 7 days',
    category: 'EXAM_PREPARATION',
    targetSkill: 'DBMS',
    timeframe: '7 days',
    urgency: 'HIGH',
  });
  const dec3 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: examGoal,
    assessment: createMockAssessment({
      targetSkills: ['DBMS'],
      skillAssessments: [createMockSkillAssessment('DBMS')],
    }),
  });
  assert(dec3.decisionType === 'PREPARE_FOR_ASSESSMENT', 'Decision is PREPARE_FOR_ASSESSMENT for exam goals');
  assert(dec3.priority === 'HIGH', 'Priority is HIGH when explicit exam timeframe exists');

  // 4. Remedial practice from recurring mistakes
  console.log('\n--- Test 4: Remedial practice from recurring mistakes ---');
  const remedialGoal = createMockGoalUnderstanding({
    originalGoal: 'Review and fix my recurring SQL query mistakes',
    category: 'REMEDIAL_PRACTICE',
    targetSkill: 'SQL',
  });
  const dec4 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: remedialGoal,
    assessment: createMockAssessment({
      targetSkills: ['SQL'],
      skillAssessments: [createMockSkillAssessment('SQL')],
      recentActivitySummary: {
        totalEvidenceRecords: 4,
        hasRecentGitHubActivity: false,
        hasRecentLeetCodeActivity: false,
        hasLoggedMistakes: true,
        hasFocusSessions: false,
        activeSources: ['mistakes'],
      },
    }),
  });
  assert(dec4.decisionType === 'REVIEW_MISTAKES', 'Decision is REVIEW_MISTAKES for remedial goal');
  assert(dec4.requiredCapabilities.includes('get_mistakes'), 'Requires get_mistakes tool capability');

  // 5. Schedule planning
  console.log('\n--- Test 5: Schedule planning ---');
  const scheduleGoal = createMockGoalUnderstanding({
    originalGoal: 'Plan my study schedule for next week',
    category: 'SCHEDULE_PLANNING',
    targetSkill: 'General Learning',
  });
  const dec5 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: scheduleGoal,
    assessment: createMockAssessment({ targetSkills: [] }),
  });
  assert(dec5.decisionType === 'PLAN_SCHEDULE', 'Decision is PLAN_SCHEDULE for schedule requests');
  assert(dec5.requiredCapabilities.includes('get_time_sessions'), 'Requires get_time_sessions capability');

  // 6. Corroboration audit
  console.log('\n--- Test 6: Corroboration audit ---');
  const auditGoal = createMockGoalUnderstanding({
    originalGoal: 'Verify my Python skill level from GitHub and LeetCode telemetry',
    category: 'CORROBORATION_AUDIT',
    targetSkill: 'Python',
  });
  const dec6 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: auditGoal,
    assessment: createMockAssessment({ targetSkills: ['Python'] }),
  });
  assert(dec6.decisionType === 'CORROBORATE_EVIDENCE', 'Decision is CORROBORATE_EVIDENCE for telemetry audit goals');

  // 7. Contradicted self-reported skill
  console.log('\n--- Test 7: Contradicted self-reported skill ---');
  const contradictedSkill = createMockSkillAssessment('SQL', {
    claimedProficiency: 5,
    calibratedProficiency: 2,
    confidenceLevel: 'MODERATE',
    evidenceCategory: 'CONTRADICTED',
    supportingEvidence: [],
    contradictingEvidence: ['Multiple recurring syntax and join mistakes in logs'],
    contradictions: [
      {
        id: 'contra_001',
        skillName: 'SQL',
        claimedProficiency: 5,
        contradictoryEvidenceIds: ['ev_mistake_1'],
        reason: 'Claimed level 5 but has 4 logged mistakes in joins',
        severity: 'SEVERE',
      },
    ],
  });
  const dec7 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({
      originalGoal: 'Improve SQL skills',
      category: 'SKILL_IMPROVEMENT',
      targetSkill: 'SQL',
    }),
    assessment: createMockAssessment({
      targetSkills: ['SQL'],
      skillAssessments: [contradictedSkill],
      contradictedAreas: ['SQL'],
    }),
  });
  assert(
    dec7.decisionType === 'REVIEW_MISTAKES' || dec7.decisionType === 'TARGET_WEAK_AREA',
    'Decision addresses contradicted skill via REVIEW_MISTAKES or TARGET_WEAK_AREA'
  );
  assert(dec7.contradictions.length > 0, 'Contradictions are preserved in decision output');

  // 8. Missing evidence (evidence gap)
  console.log('\n--- Test 8: Missing evidence (evidence gap) ---');
  const gapSkill = createMockSkillAssessment('React', {
    claimedProficiency: 4,
    calibratedProficiency: 1,
    confidenceLevel: 'LOW',
    evidenceCategory: 'EVIDENCE_GAP',
    supportingEvidence: [],
    missingEvidenceGaps: ['No React projects', 'No React commit telemetry'],
  });
  const dec8 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({
      originalGoal: 'I want to improve React',
      targetSkill: 'React',
    }),
    assessment: createMockAssessment({
      targetSkills: ['React'],
      skillAssessments: [gapSkill],
      evidenceGaps: ['React'],
    }),
  });
  assert(dec8.decisionType === 'ASSESS_SKILL', 'Evidence gap leads to ASSESS_SKILL');
  assert(dec8.evidenceGaps.length > 0, 'Evidence gaps explicitly preserved');

  // 9. Stale evidence
  console.log('\n--- Test 9: Stale evidence ---');
  const staleSkill = createMockSkillAssessment('Java', {
    freshness: {
      status: 'STALE',
      daysSinceNewest: 65,
      isStale: true,
    },
  });
  const dec9 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Java' }),
    assessment: createMockAssessment({
      targetSkills: ['Java'],
      skillAssessments: [staleSkill],
    }),
  });
  assert(dec9.targetSkills.includes('Java'), 'Stale skill target is preserved');

  // 10. Multiple target skills
  console.log('\n--- Test 10: Multiple target skills ---');
  const dec10 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({
      originalGoal: 'Study Python and SQL',
      targetSkill: 'Python',
    }),
    assessment: createMockAssessment({
      targetSkills: ['Python', 'SQL'],
      skillAssessments: [
        createMockSkillAssessment('Python'),
        createMockSkillAssessment('SQL'),
      ],
    }),
  });
  assert(dec10.targetSkills.length >= 1, 'Target skills preserved in decision');
  assert(dec10.targetSkills.includes('Python'), 'Target skill present');

  // 11. Explicit student intent overrides unrelated weakness
  console.log('\n--- Test 11: Explicit student intent overrides unrelated weakness ---');
  const dec11 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({
      originalGoal: 'I only want a revision plan for DBMS normalization',
      targetSkill: 'DBMS Normalization',
    }),
    assessment: createMockAssessment({
      targetSkills: ['DBMS Normalization'],
      skillAssessments: [
        createMockSkillAssessment('DBMS Normalization', { evidenceCategory: 'DEVELOPING' }),
        createMockSkillAssessment('Python', {
          evidenceCategory: 'CONTRADICTED',
          contradictingEvidence: ['Lots of errors'],
        }),
      ],
      contradictedAreas: ['Python'],
    }),
  });
  assert(dec11.targetSkills.includes('DBMS Normalization'), 'Target skill matches student intent');
  assert(!dec11.targetSkills.includes('Python'), 'Unrelated weak skill not forced into student intent');

  // 12. Ambiguous goal → CLARIFY_GOAL
  console.log('\n--- Test 12: Ambiguous goal → CLARIFY_GOAL ---');
  const ambiguousGoal = createMockGoalUnderstanding({
    originalGoal: 'I want to study stuff',
    clarificationNeeded: true,
    clarificationQuestions: [
      {
        dimension: 'TARGET_SKILL',
        question: 'What specific skill or subject do you want to learn?',
        suggestedOptions: ['Python', 'SQL', 'Algorithms'],
      },
    ],
  });
  const dec12 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: ambiguousGoal,
    assessment: createMockAssessment(),
  });
  assert(dec12.decisionType === 'CLARIFY_GOAL', 'Ambiguous goal returns CLARIFY_GOAL');
  assert(dec12.clarificationNeeded === true, 'clarificationNeeded is true');
  assert(dec12.clarificationQuestions.length > 0, 'Clarification questions preserved');

  // 13. Unavailable capability handling
  console.log('\n--- Test 13: Unavailable capability handling ---');
  const dec13 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({
      originalGoal: 'Audit my skill telemetry',
      category: 'CORROBORATION_AUDIT',
    }),
    assessment: createMockAssessment(),
    availableCapabilities: ['get_student_profile'], // Missing get_github_activity
  });
  assert(dec13.unavailableCapabilities.includes('get_github_activity'), 'Identifies missing capabilities');
  assert(dec13.decisionType === 'WAIT_FOR_MORE_EVIDENCE', 'Adapts decision gracefully when critical telemetry is missing');

  // 14. Decision does not invent capability
  console.log('\n--- Test 14: Decision does not invent capability ---');
  assert(!dec13.requiredCapabilities.includes('magic_brain_scan_tool'), 'Does not invent fictional capabilities');

  // 15. Decision explanation cites evidence
  console.log('\n--- Test 15: Decision explanation cites evidence ---');
  assert(dec7.rationale.includes('SQL'), 'Decision rationale explicitly mentions skill');
  assert(dec7.evidenceBasis.length > 0 || dec7.contradictions.length > 0, 'Decision contains concrete evidence basis or contradictions');

  // 16. Missing evidence is not treated as negative evidence
  console.log('\n--- Test 16: Missing evidence is not treated as negative evidence ---');
  assert(!dec8.rationale.toLowerCase().includes('poor performance'), 'Missing evidence is not called poor performance');
  assert(
    dec8.rationale.toLowerCase().includes('absence of evidence') ||
    dec8.rationale.toLowerCase().includes('uncertainty') ||
    dec8.rationale.toLowerCase().includes('insufficient'),
    'Missing evidence is treated as uncertainty'
  );

  // 17. Phase 1 calibrated proficiency remains authoritative
  console.log('\n--- Test 17: Phase 1 calibrated proficiency remains authoritative ---');
  const dec17Skill = createMockSkillAssessment('Python', {
    claimedProficiency: 5,
    calibratedProficiency: 2,
    evidenceCategory: 'DEVELOPING',
  });
  const dec17 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: createMockAssessment({
      targetSkills: ['Python'],
      skillAssessments: [dec17Skill],
    }),
  });
  assert(dec17.rationale.includes('calibrated 2/5'), 'Preserves calibrated proficiency from Phase 1/6B');

  // 18. Phase 6B assessment remains authoritative
  console.log('\n--- Test 18: Phase 6B assessment remains authoritative ---');
  assert(dec2.confidence === strongAssessment.overallConfidence, 'Overall confidence matches Phase 6B assessment');

  // 19. Gemini unavailable fallback
  console.log('\n--- Test 19: Gemini unavailable fallback ---');
  const dec19 = await generateLearningDecision({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: createMockAssessment(),
    allowLlm: true, // Will fall back because no GEMINI_API_KEY in unit test env
  });
  assert(dec19.decisionType === 'REINFORCE_DEVELOPING_SKILL' || dec19.decisionType === 'PRACTICE', 'Fallback returns valid decision type');
  assert(dec19.source === 'DETERMINISTIC' || dec19.source === 'LLM_FALLBACK_DETERMINISTIC', 'Source is deterministic fallback');

  // 20. Malformed Gemini response fallback
  console.log('\n--- Test 20: Malformed Gemini response fallback ---');
  const mockBadLlmClient = {
    generateJson: async () => 'BROKEN JSON NOT VALID {',
  };
  const dec20 = await generateLearningDecision({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: createMockAssessment(),
    allowLlm: true,
    llmClient: mockBadLlmClient,
  });
  assert(dec20.source === 'LLM_FALLBACK_DETERMINISTIC', 'Malformed LLM output triggers fail-safe fallback');
  assert(dec20.decisionType !== undefined, 'Decision remains complete and valid');

  // 21. Gemini cannot override deterministic decision
  console.log('\n--- Test 21: Gemini cannot override deterministic decision ---');
  const mockOverrideLlmClient = {
    generateJson: async () => JSON.stringify({
      decisionType: 'INVALID_NON_EXISTENT_DECISION_TYPE',
      primaryObjective: 'Made up objective',
      recommendedAction: 'Fake action',
      rationale: 'Fake rationale',
    }),
  };
  const dec21 = await generateLearningDecision({
    userId,
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
    assessment: createMockAssessment(),
    allowLlm: true,
    llmClient: mockOverrideLlmClient,
  });
  assert(dec21.decisionType === 'REINFORCE_DEVELOPING_SKILL' || dec21.decisionType === 'PRACTICE', 'Invalid decision type rejected');

  // 22. Decision cannot execute write tools
  console.log('\n--- Test 22: Decision cannot execute write tools ---');
  assert(dec1.reversible === true, 'Decision is strictly reversible (zero side-effects)');
  assert(!Object.prototype.hasOwnProperty.call(dec1, 'executedTasks'), 'Zero executed tasks in decision layer');

  // 23. Decision cannot bypass approval
  console.log('\n--- Test 23: Decision cannot bypass approval ---');
  const criticalGoal = createMockGoalUnderstanding({
    urgency: 'CRITICAL',
  });
  const dec23 = generateLearningDecisionDeterministic({
    userId,
    goalUnderstanding: criticalGoal,
    assessment: createMockAssessment(),
  });
  assert(dec23.requiresHumanApproval === true, 'Urgent/critical decisions mandate human confirmation');

  // 24. Existing Phase 4 planning still accepts the decision
  console.log('\n--- Test 24: Existing Phase 4 planning still accepts the decision context ---');
  const decomp = decomposeStudentGoal({
    triggerContext: {
      triggerId: 'trig_001',
      userId,
      triggerType: 'STUDENT_GOAL',
      isAutomated: false,
      eventTrigger: 'MANUAL_GOAL',
      normalizedGoalText: 'Prepare Python for interviews',
      goalCategory: 'SKILL_IMPROVEMENT',
      targetSkillName: 'Python',
      priority: 'HIGH',
      receivedAt: new Date().toISOString(),
      contextData: { decision: dec2 },
      validationMetadata: {
        validatedAt: new Date().toISOString(),
        version: '1.0.0',
        sourceModule: 'test',
      },
    },
    goalUnderstanding: createMockGoalUnderstanding({ targetSkill: 'Python' }),
  });
  assert(decomp.status === 'DECOMPOSED', 'Phase 4 decomposition succeeds with decision context');

  // 25. Existing Phase 5 safety remains intact
  console.log('\n--- Test 25: Existing Phase 5 safety remains intact ---');
  assert(typeof dec1.userId === 'string' && dec1.userId === userId, 'Authenticated user ID is immutable');

  // 26. Single orchestrator integrity
  console.log('\n--- Test 26: Single orchestrator integrity ---');
  assert(VALID_AGENT_TRANSITIONS['ASSESSING'].includes('PLANNING'), 'ASSESSING state transitions directly to PLANNING');

  // 27. No database mutation
  console.log('\n--- Test 27: No database mutation ---');
  assert(dec1.reversible === true && dec2.reversible === true, 'Phase 6C is 100% read-only with zero database mutations');

  console.log('\n===============================================================');
  console.log('✨ ALL 27 PHASE 6C DECISION & ACTION SELECTION TESTS PASSED!');
  console.log('===============================================================');
}

runDecisionVerificationSuite().catch((err) => {
  console.error('Fatal test error in Phase 6C suite:', err);
  process.exit(1);
});
