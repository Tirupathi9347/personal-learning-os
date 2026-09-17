/**
 * Phase 4B: Goal Decomposition Verification Test Suite
 * 
 * Verifies:
 * 1. Clear skill-improvement goal decomposition.
 * 2. Exam-preparation goal decomposition.
 * 3. Corroboration-audit goal decomposition.
 * 4. Goal with target skill and evidence gaps / contradictions in assessment context.
 * 5. Goal with missing optional information (preserves null/undefined, zero fabrication).
 * 6. Ambiguous/vague goal returns NEEDS_CLARIFICATION instead of guessing.
 * 7. Dependency graph is acyclic (verified via Phase 4A DAG validator).
 * 8. Original goal intent is preserved verbatim.
 * 9. Deterministic identical-input output (100% deep equality).
 * 10. No tools or mutations are executed.
 */

import {
  decomposeStudentGoal,
  detectGoalAmbiguity,
  validatePlanDependencies,
  AgentTriggerContext,
  StudentCorroborationAuditResult,
  DecomposedGoalResult,
  NeedsClarificationResult,
} from '../src/lib/agent';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

function createMockTrigger(partial: Partial<AgentTriggerContext>): AgentTriggerContext {
  return {
    triggerId: 'trig-decomp-123',
    userId: 'student_user_abc',
    triggerType: 'STUDENT_GOAL',
    isAutomated: false,
    eventTrigger: 'MANUAL_GOAL',
    normalizedGoalText: partial.normalizedGoalText || 'Default goal text',
    goalCategory: partial.goalCategory || 'GENERAL_LEARNING',
    priority: partial.priority || 'MEDIUM',
    receivedAt: '2026-09-16T12:00:00.000Z',
    targetSkillName: partial.targetSkillName ?? null,
    timeframeHint: partial.timeframeHint ?? null,
    contextData: {},
    validationMetadata: {
      validatedAt: '2026-09-16T12:00:00.000Z',
      version: '1.0.0',
      sourceModule: 'goal-event-intake',
    },
    ...partial,
  };
}

async function runGoalDecompositionTestSuite() {
  console.log('------------------------------------------------------------------');
  console.log('⚡ RUNNING GOAL DECOMPOSITION VERIFICATION (PHASE 4B)');
  console.log('------------------------------------------------------------------');

  const fixedTimestamp = '2026-09-16T12:00:00.000Z';

  // Test 1: Clear skill-improvement goal decomposition
  console.log('\nTest 1: Verifying Clear Skill-Improvement Goal Decomposition...');
  const skillTrigger = createMockTrigger({
    normalizedGoalText: 'Master Database Normalization (1NF, 2NF, 3NF, BCNF) in DBMS',
    goalCategory: 'SKILL_IMPROVEMENT',
    targetSkillName: 'DBMS',
    priority: 'HIGH',
  });

  const skillResult = decomposeStudentGoal({
    triggerContext: skillTrigger,
    timestamp: fixedTimestamp,
  });

  assert(skillResult.status === 'DECOMPOSED', `Expected DECOMPOSED status, got: ${skillResult.status}`);
  const skillDecomp = skillResult as DecomposedGoalResult;
  assert(skillDecomp.category === 'SKILL_IMPROVEMENT', 'Category must match SKILL_IMPROVEMENT');
  assert(skillDecomp.targetSkill === 'DBMS', 'Target skill must be DBMS');
  assert(skillDecomp.priority === 'HIGH', 'Priority must match trigger');
  assert(skillDecomp.objectives.length === 3, 'Must generate 3 structured learning objectives');
  assert(skillDecomp.candidateSteps.length === 3, 'Must generate 3 candidate steps');
  assert(skillDecomp.candidatePlan !== undefined, 'Candidate LearningPlan must be generated');
  assert(skillDecomp.candidatePlan.status === 'READY', 'Candidate plan must be in READY status');
  console.log(`   ✅ Skill-Improvement decomposed: ${skillDecomp.objectives.length} objectives, ${skillDecomp.candidateSteps.length} candidate steps.`);

  // Test 2: Exam-preparation goal decomposition
  console.log('\nTest 2: Verifying Exam-Preparation Goal Decomposition...');
  const examTrigger = createMockTrigger({
    normalizedGoalText: 'Prepare for DBMS Midterm Exam in 7 days',
    goalCategory: 'EXAM_PREPARATION',
    targetSkillName: 'DBMS',
    timeframeHint: 'in 7 days',
    priority: 'HIGH',
  });

  const examResult = decomposeStudentGoal({
    triggerContext: examTrigger,
    timestamp: fixedTimestamp,
  });

  assert(examResult.status === 'DECOMPOSED', `Expected DECOMPOSED status, got: ${examResult.status}`);
  const examDecomp = examResult as DecomposedGoalResult;
  assert(examDecomp.category === 'EXAM_PREPARATION', 'Category must be EXAM_PREPARATION');
  assert(examDecomp.timeframeHint === 'in 7 days', 'Timeframe hint must be preserved');
  assert(examDecomp.constraints.some((c) => c.includes('in 7 days')), 'Constraints must include timeframe hint');
  assert(examDecomp.candidateSteps.some((s) => s.id === 'step-exam-mock-simulation'), 'Must include mock simulation step');
  console.log('   ✅ Exam-Preparation decomposed with syllabus audit, remedial drills, and mock simulation.');

  // Test 3: Corroboration-audit goal decomposition
  console.log('\nTest 3: Verifying Corroboration-Audit Goal Decomposition...');
  const auditTrigger = createMockTrigger({
    normalizedGoalText: 'Audit my skills and corroborate external evidence',
    goalCategory: 'CORROBORATION_AUDIT',
    priority: 'MEDIUM',
  });

  const auditResult = decomposeStudentGoal({
    triggerContext: auditTrigger,
    timestamp: fixedTimestamp,
  });

  assert(auditResult.status === 'DECOMPOSED', `Expected DECOMPOSED status, got: ${auditResult.status}`);
  const auditDecomp = auditResult as DecomposedGoalResult;
  assert(auditDecomp.category === 'CORROBORATION_AUDIT', 'Category must be CORROBORATION_AUDIT');
  assert(auditDecomp.candidateSteps.length === 3, 'Must have 3 candidate steps for audit lifecycle');
  assert(Boolean(auditDecomp.candidateSteps[0].requiredTools?.includes('get_student_profile')), 'Step 1 must include profile inspection');
  assert(auditDecomp.constraints.some((c) => c.includes('Read-only')), 'Must specify read-only constraint');
  console.log('   ✅ Corroboration-Audit decomposed into telemetry collection, corroboration analysis, and confidence report.');

  // Test 4: Goal with target skill and evidence gaps / contradictions in assessment context
  console.log('\nTest 4: Verifying Grounding in Assessment Evidence Gaps & Contradictions...');
  const mockAssessment: StudentCorroborationAuditResult = {
    auditId: 'audit-test-999',
    studentUserId: 'student_user_abc',
    generatedAt: fixedTimestamp,
    summary: {
      totalSkillsClaimed: 1,
      highConfidenceCount: 0,
      moderateConfidenceCount: 0,
      lowConfidenceCount: 0,
      unverifiedCount: 0,
      contradictedCount: 1,
      overallGroundTruthScore: 0.35,
    },
    skillsEvaluated: [
      {
        skillId: 'skill-dbms-1',
        skillName: 'DBMS',
        category: 'Database Engineering',
        claimedProficiency: 4,
        assessedProficiency: 2,
        evidenceBackedScore: 0.35,
        confidenceLevel: 'CONTRADICTED',
        evidenceCount: {
          total: 4,
          supporting: 1,
          contradicting: 3,
          neutral: 0,
          externallyVerified: 1,
        },
        evidenceRecords: [],
        lastEvaluatedAt: fixedTimestamp,
        contradictions: [
          {
            id: 'contra-1',
            skillName: 'DBMS',
            claimedProficiency: 4,
            contradictoryEvidenceIds: ['ev-mistake-1'],
            reason: 'Failed 3NF decomposition 4 times in recent quizzes',
            severity: 'SEVERE',
          },
        ],
        missingEvidence: [
          {
            skillName: 'DBMS',
            requiredClassification: 'EXTERNALLY_VERIFIED',
            description: 'At least one verified relational database project with schema implementation',
            recommendedAction: 'Build and commit a verified database project repository',
          },
        ],
        reasons: ['Severe contradictions in 3NF decomposition'],
        breakdown: {
          supportingStrength: 0.2,
          contradictionPenalty: 0.8,
          freshnessMultiplier: 1.0,
          completenessMultiplier: 0.8,
          rawScore: 0.35,
          finalScore: 0.35,
        },
      },
    ],
    warnings: ['Student skill claims contradict empirical telemetry'],
    limitations: [],
    metadata: {
      hasGitHubConnected: true,
      hasLeetCodeConnected: false,
      totalEvidenceLinksParsed: 4,
      engineVersion: '1.0.0',
    },
  };

  const gapTrigger = createMockTrigger({
    normalizedGoalText: 'Prepare for DBMS exam and fix my weak areas',
    goalCategory: 'EXAM_PREPARATION',
    targetSkillName: 'DBMS',
    priority: 'HIGH',
  });

  const gapResult = decomposeStudentGoal({
    triggerContext: gapTrigger,
    assessmentContext: mockAssessment,
    timestamp: fixedTimestamp,
  });

  assert(gapResult.status === 'DECOMPOSED', 'Goal with assessment context must decompose successfully');
  const gapDecomp = gapResult as DecomposedGoalResult;
  // Step 2 must incorporate the specific contradiction identified in assessment context
  const step2 = gapDecomp.candidateSteps.find((s) => s.id === 'step-exam-remedial-drills')!;
  assert(step2 !== undefined, 'Remedial drills step must exist');
  assert(
    step2.description.includes('Failed 3NF decomposition') || step2.rationale.includes('contradiction'),
    'Step 2 must ground in the assessment contradiction'
  );
  console.log('   ✅ Assessment contradictions and evidence gaps successfully grounded into candidate step descriptions.');

  // Test 5: Goal with missing optional information (preserves null/undefined, zero fabrication)
  console.log('\nTest 5: Verifying Preservation of Unknown Optional Information (Zero Fabrication)...');
  const minimalTrigger = createMockTrigger({
    normalizedGoalText: 'Study Operating Systems Memory Management',
    goalCategory: 'GENERAL_LEARNING',
    targetSkillName: null, // omitted
    timeframeHint: null,   // omitted
  });

  const minimalResult = decomposeStudentGoal({
    triggerContext: minimalTrigger,
    assessmentContext: null, // omitted
    timestamp: fixedTimestamp,
  });

  assert(minimalResult.status === 'DECOMPOSED', 'Minimal goal must decompose');
  const minDecomp = minimalResult as DecomposedGoalResult;
  assert(minDecomp.targetSkill === null, 'Target skill must be null when not provided');
  assert(minDecomp.timeframeHint === null, 'Timeframe hint must be null when not provided');
  assert(minDecomp.candidatePlan.estimatedEffort === null, 'Plan estimatedEffort must remain null (never fabricated)');
  for (const s of minDecomp.candidateSteps) {
    assert(s.estimatedEffort === null, 'Step estimatedEffort must remain null');
  }
  console.log('   ✅ Optional values preserved as null without fabricating deadlines, effort, or skill claims.');

  // Test 6: Ambiguous / vague goals return NEEDS_CLARIFICATION
  console.log('\nTest 6: Verifying Ambiguous / Vague Goals Return NEEDS_CLARIFICATION...');
  const vagueGoals = [
    'help',
    'study',
    'learn',
    'do something',
    'help me',
    'learn stuff',
    'practice',
    'asdf',
  ];

  for (const vague of vagueGoals) {
    const vagueTrigger = createMockTrigger({
      normalizedGoalText: vague,
      goalCategory: 'GENERAL_LEARNING',
      targetSkillName: null,
    });

    const vagueResult = decomposeStudentGoal({
      triggerContext: vagueTrigger,
      timestamp: fixedTimestamp,
    });

    assert(
      vagueResult.status === 'NEEDS_CLARIFICATION',
      `Goal "${vague}" should return NEEDS_CLARIFICATION, got: ${vagueResult.status}`
    );
    const clarResult = vagueResult as NeedsClarificationResult;
    assert(clarResult.missingDimensions.includes('TARGET_SKILL'), 'Must flag TARGET_SKILL as missing dimension');
    assert(clarResult.clarificationPrompt.length > 0, 'Must include helpful clarification prompt');
  }
  console.log(`   ✅ All ${vagueGoals.length} ambiguous/vague test goals safely returned NEEDS_CLARIFICATION.`);

  // Test 7: Dependency graph is acyclic (DAG check)
  console.log('\nTest 7: Verifying Dependency Graphs Are Acyclic (DAG Safety)...');
  const allCategories: Array<AgentTriggerContext['goalCategory']> = [
    'EXAM_PREPARATION',
    'SKILL_IMPROVEMENT',
    'CORROBORATION_AUDIT',
    'REMEDIAL_PRACTICE',
    'SCHEDULE_PLANNING',
    'GENERAL_LEARNING',
  ];

  for (const cat of allCategories) {
    const trig = createMockTrigger({
      normalizedGoalText: `Learn and practice ${cat} curriculum`,
      goalCategory: cat,
      targetSkillName: 'Computer Science',
    });
    const res = decomposeStudentGoal({ triggerContext: trig, timestamp: fixedTimestamp });
    assert(res.status === 'DECOMPOSED', `Decomposition for ${cat} must succeed`);
    const decompRes = res as DecomposedGoalResult;
    const dagCheck = validatePlanDependencies(decompRes.candidateSteps);
    assert(dagCheck.isValid, `DAG for ${cat} must be valid`);
    assert(!dagCheck.hasCycles, `DAG for ${cat} must have zero cycles`);
    assert(dagCheck.executionTiers !== undefined, `DAG for ${cat} must have computed execution tiers`);
  }
  console.log('   ✅ All 6 category decompositions verified as strictly acyclic Directed Acyclic Graphs.');

  // Test 8: Original goal intent is preserved verbatim
  console.log('\nTest 8: Verifying Preservation of Original Goal Intent...');
  const preciseGoal = 'Master Lossless Join Decomposition and Dependency Preservation in Relational Databases';
  const preciseTrigger = createMockTrigger({
    normalizedGoalText: preciseGoal,
    goalCategory: 'SKILL_IMPROVEMENT',
    targetSkillName: 'Relational Databases',
    priority: 'HIGH',
  });

  const preciseResult = decomposeStudentGoal({ triggerContext: preciseTrigger, timestamp: fixedTimestamp });
  assert(preciseResult.status === 'DECOMPOSED', 'Decomposition must succeed');
  const preciseDecomp = preciseResult as DecomposedGoalResult;
  assert(preciseDecomp.goal === preciseGoal, 'Original goal text must match verbatim');
  assert(preciseDecomp.candidatePlan.goal === preciseGoal, 'Candidate plan goal must match verbatim');
  console.log('   ✅ Original student goal text and intent preserved verbatim across plan artifacts.');

  // Test 9: Deterministic identical-input output (100% deep equality)
  console.log('\nTest 9: Verifying Deterministic Output for Identical Inputs...');
  const triggerA = createMockTrigger({
    normalizedGoalText: 'Prepare for Python DSA Assessment in 5 days',
    goalCategory: 'EXAM_PREPARATION',
    targetSkillName: 'Python',
    timeframeHint: 'in 5 days',
    priority: 'HIGH',
  });

  const res1 = decomposeStudentGoal({ triggerContext: triggerA, planId: 'fixed-plan-id', timestamp: fixedTimestamp });
  const res2 = decomposeStudentGoal({ triggerContext: triggerA, planId: 'fixed-plan-id', timestamp: fixedTimestamp });

  const json1 = JSON.stringify(res1);
  const json2 = JSON.stringify(res2);
  assert(json1 === json2, 'Decomposition results for identical inputs must be byte-for-byte identical');
  console.log('   ✅ Determinism verified: Identical inputs produce byte-for-byte identical decomposition outputs.');

  // Test 10: Confirmation that candidate steps are not executed and no mutations occur
  console.log('\nTest 10: Verifying Zero Tool Execution / Zero State Mutations...');
  // All steps generated should be in candidate READY/PENDING state, with null outputs and null execution timestamps
  for (const step of skillDecomp.candidateSteps) {
    assert(step.output === null, `Step "${step.id}" output must be null (not executed)`);
    assert(step.status === 'READY' || step.status === 'PENDING', `Step "${step.id}" must be READY or PENDING`);
  }
  console.log('   ✅ Confirmed: Candidate steps are purely structural and zero tools were executed.');

  // Test 11: Verify ONLY registered tools are used across all 6 goal categories (No unregistered tools)
  console.log('\nTest 11: Verifying All Categories Generate ONLY Registered Tools (Tool Registry Conformance)...');
  const validRegisteredToolNames = new Set([
    'get_student_profile',
    'get_tasks',
    'get_skills',
    'get_projects',
    'get_mistakes',
    'get_time_sessions',
    'get_github_activity',
    'get_leetcode_activity',
    'create_task',
  ]);

  for (const cat of allCategories) {
    const trig = createMockTrigger({
      normalizedGoalText: `Study and master ${cat} curriculum`,
      goalCategory: cat,
      targetSkillName: 'Computer Science',
    });
    const res = decomposeStudentGoal({ triggerContext: trig, timestamp: fixedTimestamp });
    assert(res.status === 'DECOMPOSED', `Decomposition for ${cat} must succeed`);
    const decompRes = res as DecomposedGoalResult;

    for (const step of decompRes.candidateSteps) {
      if (Array.isArray(step.requiredTools) && step.requiredTools.length > 0) {
        for (const tool of step.requiredTools) {
          assert(
            validRegisteredToolNames.has(tool),
            `Category "${cat}" Step "${step.id}" references unregistered tool: "${tool}". Tool must be in Phase 3 registry!`
          );
        }
      }
    }
  }
  console.log('   ✅ All 6 decomposition categories generate ONLY valid registered tools from Phase 3 Registry.');

  // Test 12: Zero references to stale get_notes across any category
  console.log('\nTest 12: Verifying ZERO References to Stale get_notes Tool...');
  for (const cat of allCategories) {
    const trig = createMockTrigger({
      normalizedGoalText: `Master ${cat} domain thoroughly`,
      goalCategory: cat,
      targetSkillName: 'Operating Systems',
    });
    const res = decomposeStudentGoal({ triggerContext: trig, timestamp: fixedTimestamp });
    const decompRes = res as DecomposedGoalResult;
    for (const step of decompRes.candidateSteps) {
      assert(
        !step.requiredTools?.includes('get_notes'),
        `Step "${step.id}" in category "${cat}" must NOT contain stale get_notes tool reference.`
      );
    }
  }
  console.log('   ✅ Confirmed: Exactly 0 references to get_notes across all generated candidate steps.');

  // Test 13: Verification criteria do not claim nonexistent diagnostic quiz infrastructure
  console.log('\nTest 13: Verifying Verification Criteria Grounding (No Nonexistent Quiz DB Claims)...');
  for (const cat of allCategories) {
    const trig = createMockTrigger({
      normalizedGoalText: `Complete ${cat} learning plan`,
      goalCategory: cat,
      targetSkillName: 'Algorithms',
    });
    const res = decomposeStudentGoal({ triggerContext: trig, timestamp: fixedTimestamp });
    const decompRes = res as DecomposedGoalResult;
    for (const step of decompRes.candidateSteps) {
      for (const vc of step.verificationCriteria) {
        assert(
          !vc.toLowerCase().includes('quiz_assessment_database') &&
          !vc.toLowerCase().includes('diagnostic assessment score record verified in database') &&
          !vc.toLowerCase().includes('diagnostic quiz submission verified in assessment telemetry'),
          `Step "${step.id}" in category "${cat}" contains ungrounded verification criterion: "${vc}"`
        );
      }
    }
  }
  console.log('   ✅ Confirmed: Verification criteria reference only available telemetry (tasks, focus time, git, skills).');

  console.log('\n------------------------------------------------------------------');
  console.log('✨ ALL GOAL DECOMPOSITION (PHASE 4B) VERIFICATION TESTS PASSED (13/13)!');
  console.log('------------------------------------------------------------------');
}

runGoalDecompositionTestSuite().catch((err) => {
  console.error('❌ Goal decomposition verification failed:', err);
  process.exit(1);
});
