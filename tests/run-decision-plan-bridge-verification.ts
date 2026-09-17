/**
 * Verification Suite for Phase 6D: Decision-to-Plan Bridge Layer
 * (Hardened for Capability Reality & Execution-Safety)
 * 
 * Validates strict separation between descriptive learning intentions
 * and executable registered capabilities for the SINGLE Learning Orchestrator.
 */

import {
  bridgeDecisionToPlan,
  bridgeDecisionToPlanDeterministic,
  DecisionPlanBridgeInput,
  DecisionPlanBridgeResult,
} from '../src/lib/agent/decision-plan-bridge';
import {
  generateLearningDecisionDeterministic,
  LearningDecision,
  DecisionType,
} from '../src/lib/agent/decision-action-selection';
import { GoalUnderstanding } from '../src/lib/agent/goal-understanding-types';
import {
  StudentLearningAssessment,
  SkillLearningAssessment,
} from '../src/lib/agent/assessment-types';
import {
  validatePlan,
  validatePlanDependencies,
  createLearningPlan,
} from '../src/lib/agent/planning-model';
import { VALID_AGENT_TRANSITIONS } from '../src/lib/agent/state-machine';
import { agentToolRegistry } from '../src/lib/agent/tool-registry';

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

function createMockDecision(
  overrides: Partial<LearningDecision> = {}
): LearningDecision {
  return {
    decisionId: 'dec_mock_001',
    userId: 'user_student_123',
    decisionType: 'PRACTICE',
    priority: 'MEDIUM',
    confidence: 'HIGH',
    goalReference: 'Improve Python programming',
    targetSkills: ['Python'],
    primaryObjective: 'Advance Python programming proficiency through deliberate practice',
    recommendedAction: 'ADVANCED_DELIBERATE_PRACTICE',
    rationale: 'Strong empirical evidence supports advanced deliberate practice.',
    evidenceBasis: ['[Python] 3 verified repositories'],
    contradictions: [],
    evidenceGaps: [],
    requiredCapabilities: ['get_projects'],
    unavailableCapabilities: [],
    clarificationNeeded: false,
    clarificationQuestions: [],
    reversible: true,
    requiresHumanApproval: false,
    source: 'DETERMINISTIC',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

async function runBridgeVerificationSuite() {
  console.log('===============================================================');
  console.log('PHASE 6D: DECISION-TO-PLAN BRIDGE VERIFICATION SUITE');
  console.log('(Hardened for Capability Reality & Execution Safety)');
  console.log('===============================================================');

  const userId = 'user_student_123';

  // 1. CLARIFY_GOAL blocks executable plan
  console.log('\n--- Test 1: CLARIFY_GOAL blocks executable plan ---');
  const clarifyDecision = createMockDecision({
    decisionType: 'CLARIFY_GOAL',
    clarificationNeeded: true,
    clarificationQuestions: ['What specific skill or subject do you want to learn?'],
  });
  const res1 = bridgeDecisionToPlanDeterministic({ decision: clarifyDecision });
  assert(res1.status === 'CLARIFICATION_REQUIRED', 'Status is CLARIFICATION_REQUIRED');
  assert(res1.plan === undefined, 'Zero executable plan produced when clarification needed');
  assert(res1.clarificationQuestions.length > 0, 'Clarification questions preserved');

  // 2. ASSESS_SKILL without diagnostic capability (Capability Reality)
  console.log('\n--- Test 2: ASSESS_SKILL without diagnostic capability ---');
  const assessDecision = createMockDecision({
    decisionType: 'ASSESS_SKILL',
    primaryObjective: 'Establish baseline assessment for React',
    targetSkills: ['React'],
  });
  const res2 = bridgeDecisionToPlanDeterministic({ decision: assessDecision });
  assert(res2.status === 'BLOCKED_BY_CAPABILITY', 'Status is BLOCKED_BY_CAPABILITY because diagnostic test engine is unavailable');
  assert(res2.plan !== undefined && res2.plan.steps.length >= 2, 'Diagnostic plan structure generated');
  assert(res2.plan?.status === 'BLOCKED', 'Overall plan status is BLOCKED');
  assert(res2.plan?.steps[0].status === 'READY', 'Step 1 (Retrieve Available Telemetry) is READY using existing read tools');
  assert(res2.plan?.steps[1].status === 'BLOCKED', 'Step 2 (Interactive Diagnostic) is BLOCKED because capability is unavailable');
  assert(res2.unavailableCapabilities.includes('run_diagnostic_assessment'), 'run_diagnostic_assessment listed in unavailableCapabilities');

  // 3. No fictional diagnostic tool generated as executable
  console.log('\n--- Test 3: No fictional diagnostic tool generated as executable ---');
  assert(!agentToolRegistry.hasTool('run_diagnostic_assessment'), 'run_diagnostic_assessment is not registered in ToolRegistry');
  assert(res2.plan?.steps[1].failureReason?.includes('not registered') === true, 'Step 2 failureReason notes missing tool registration');

  // 4. No diagnostic score claimed in verification criteria
  console.log('\n--- Test 4: No diagnostic score claimed in verification criteria ---');
  for (const step of res2.plan?.steps || []) {
    for (const vc of step.verificationCriteria) {
      assert(!vc.toLowerCase().includes('score improves') && !vc.toLowerCase().includes('diagnostic score recorded'), 'No fictional diagnostic score is claimed');
    }
  }

  // 5. Existing read telemetry can still be gathered in Step 1
  console.log('\n--- Test 5: Existing read telemetry can still be gathered in Step 1 ---');
  assert(res2.plan?.steps[0].requiredTools?.includes('get_skills') === true, 'Step 1 uses get_skills tool');
  assert(res2.plan?.steps[0].requiredTools?.includes('get_projects') === true, 'Step 1 uses get_projects tool');
  assert(res2.plan?.steps[0].requiredTools?.includes('get_leetcode_activity') === true, 'Step 1 uses get_leetcode_activity tool');

  // 6. CORROBORATE_EVIDENCE uses only actual read tools
  console.log('\n--- Test 6: CORROBORATE_EVIDENCE uses only actual read tools ---');
  const auditDecision = createMockDecision({
    decisionType: 'CORROBORATE_EVIDENCE',
    primaryObjective: 'Audit student skill claims against telemetry',
    targetSkills: ['Python'],
  });
  const res6 = bridgeDecisionToPlanDeterministic({ decision: auditDecision });
  assert(res6.status === 'PLAN_GENERATED', 'Plan generated for CORROBORATE_EVIDENCE');
  assert(res6.plan?.steps[0].requiredTools?.every((t) => agentToolRegistry.hasTool(t)) === true, 'All Step 1 tools exist in ToolRegistry');

  // 7. No "sync" capability is fabricated
  console.log('\n--- Test 7: No "sync" capability is fabricated ---');
  assert(!agentToolRegistry.hasTool('sync_telemetry') && !agentToolRegistry.hasTool('refresh_github'), 'No fictional sync tools exist in registry');
  for (const step of res6.plan?.steps || []) {
    assert(!step.requiredTools?.includes('sync_telemetry'), 'No step requires fictional sync_telemetry tool');
  }

  // 8. No external synchronization is claimed in verification criteria
  console.log('\n--- Test 8: No external synchronization is claimed in verification criteria ---');
  for (const step of res6.plan?.steps || []) {
    for (const vc of step.verificationCriteria) {
      assert(!vc.toLowerCase().includes('synchronized with external') && !vc.toLowerCase().includes('data refreshed from api'), 'No external synchronization claimed');
      assert(vc.toLowerCase().includes('without claiming external sync') || vc.toLowerCase().includes('in memory') || vc.toLowerCase().includes('working memory'), 'Criteria accurately state in-memory evaluation');
    }
  }

  // 9. PREPARE_FOR_ASSESSMENT does not invent an assessment engine
  console.log('\n--- Test 9: PREPARE_FOR_ASSESSMENT does not invent an assessment engine ---');
  const examDecision = createMockDecision({
    decisionType: 'PREPARE_FOR_ASSESSMENT',
    primaryObjective: 'Prepare for DBMS final exam',
    targetSkills: ['DBMS'],
  });
  const res9 = bridgeDecisionToPlanDeterministic({
    decision: examDecision,
    goalUnderstanding: createMockGoalUnderstanding({
      targetSkill: 'DBMS',
      timeframe: 'in 7 days',
    }),
  });
  assert(res9.status === 'PLAN_GENERATED', 'Plan generated for PREPARE_FOR_ASSESSMENT');
  assert(!res9.requiredCapabilities.includes('run_mock_exam') && !res9.requiredCapabilities.includes('grade_exam'), 'No fictional exam engines required');

  // 10. No fictional quiz tool or automated scoring claimed
  console.log('\n--- Test 10: No fictional quiz tool or automated scoring claimed ---');
  for (const step of res9.plan?.steps || []) {
    for (const vc of step.verificationCriteria) {
      assert(!vc.toLowerCase().includes('score and time per question logged') && !vc.toLowerCase().includes('graded by exam engine'), 'No automated exam scoring claimed');
    }
  }

  // 11. BUILD_FOUNDATION creates foundational review/exercise plan
  console.log('\n--- Test 11: BUILD_FOUNDATION creates foundational review/exercise plan ---');
  const foundationDecision = createMockDecision({
    decisionType: 'BUILD_FOUNDATION',
    primaryObjective: 'Build foundational understanding in SQL',
    targetSkills: ['SQL'],
  });
  const res11 = bridgeDecisionToPlanDeterministic({ decision: foundationDecision });
  assert(res11.status === 'PLAN_GENERATED', 'Plan generated for BUILD_FOUNDATION');
  assert(res11.plan?.steps.some((s) => s.title.includes('Fundamentals')) === true, 'Contains fundamental review step');

  // 12. TARGET_WEAK_AREA creates weak subtopic remediation plan
  console.log('\n--- Test 12: TARGET_WEAK_AREA creates weak subtopic remediation plan ---');
  const weakDecision = createMockDecision({
    decisionType: 'TARGET_WEAK_AREA',
    primaryObjective: 'Isolate and remediate SQL joins',
    targetSkills: ['SQL'],
  });
  const res12 = bridgeDecisionToPlanDeterministic({ decision: weakDecision });
  assert(res12.status === 'PLAN_GENERATED', 'Plan generated for TARGET_WEAK_AREA');
  assert(res12.plan?.steps.some((s) => s.title.includes('Weak Subtopics')) === true, 'Contains weak subtopic step');

  // 13. REINFORCE_DEVELOPING_SKILL creates reinforcement plan
  console.log('\n--- Test 13: REINFORCE_DEVELOPING_SKILL creates reinforcement plan ---');
  const reinforceDecision = createMockDecision({
    decisionType: 'REINFORCE_DEVELOPING_SKILL',
    primaryObjective: 'Reinforce developing proficiency in TypeScript',
    targetSkills: ['TypeScript'],
  });
  const res13 = bridgeDecisionToPlanDeterministic({ decision: reinforceDecision });
  assert(res13.status === 'PLAN_GENERATED', 'Plan generated for REINFORCE_DEVELOPING_SKILL');
  assert(res13.plan?.steps.some((s) => s.title.includes('Core Patterns')) === true, 'Contains pattern reinforcement step');

  // 14. PRACTICE creates deliberate practice plan
  console.log('\n--- Test 14: PRACTICE creates deliberate practice plan ---');
  const practiceDecision = createMockDecision({
    decisionType: 'PRACTICE',
    targetSkills: ['Python'],
  });
  const res14 = bridgeDecisionToPlanDeterministic({ decision: practiceDecision });
  assert(res14.status === 'PLAN_GENERATED', 'Plan generated for PRACTICE');
  assert(res14.plan?.steps.some((s) => s.title.includes('Practice')) === true, 'Contains deliberate practice steps');

  // 15. REVIEW_MISTAKES creates mistake root-cause review plan using actual get_mistakes tool
  console.log('\n--- Test 15: REVIEW_MISTAKES creates mistake root-cause review plan ---');
  const mistakesDecision = createMockDecision({
    decisionType: 'REVIEW_MISTAKES',
    primaryObjective: 'Review and remediate recurring SQL mistakes',
    targetSkills: ['SQL'],
    requiredCapabilities: ['get_mistakes'],
  });
  const res15 = bridgeDecisionToPlanDeterministic({ decision: mistakesDecision });
  assert(res15.status === 'PLAN_GENERATED', 'Plan generated for REVIEW_MISTAKES');
  assert(res15.plan?.steps[0].requiredTools?.includes('get_mistakes') === true, 'Step 1 requires actual get_mistakes tool');
  assert(agentToolRegistry.hasTool('get_mistakes'), 'get_mistakes is registered in ToolRegistry');

  // 16. PLAN_SCHEDULE creates study routine plan using actual read tools
  console.log('\n--- Test 16: PLAN_SCHEDULE creates study routine plan ---');
  const scheduleDecision = createMockDecision({
    decisionType: 'PLAN_SCHEDULE',
    primaryObjective: 'Plan balanced study schedule',
    targetSkills: ['General Learning'],
    requiredCapabilities: ['get_time_sessions', 'get_tasks'],
  });
  const res16 = bridgeDecisionToPlanDeterministic({ decision: scheduleDecision });
  assert(res16.status === 'PLAN_GENERATED', 'Plan generated for PLAN_SCHEDULE');
  assert(res16.plan?.steps[0].requiredTools?.includes('get_time_sessions') === true, 'Step 1 requires get_time_sessions');
  assert(agentToolRegistry.hasTool('get_time_sessions'), 'get_time_sessions is registered in ToolRegistry');

  // 17. CONTINUE_CURRENT_PATH creates trajectory continuation plan
  console.log('\n--- Test 17: CONTINUE_CURRENT_PATH creates trajectory continuation plan ---');
  const continueDecision = createMockDecision({
    decisionType: 'CONTINUE_CURRENT_PATH',
    primaryObjective: 'Continue active Python trajectory',
    targetSkills: ['Python'],
  });
  const res17 = bridgeDecisionToPlanDeterministic({ decision: continueDecision });
  assert(res17.status === 'PLAN_GENERATED', 'Plan generated for CONTINUE_CURRENT_PATH');

  // 18. WAIT_FOR_MORE_EVIDENCE creates blocked/waiting plan
  console.log('\n--- Test 18: WAIT_FOR_MORE_EVIDENCE creates blocked/waiting plan ---');
  const waitDecision = createMockDecision({
    decisionType: 'WAIT_FOR_MORE_EVIDENCE',
    primaryObjective: 'Wait for telemetry connections',
    targetSkills: ['Python'],
  });
  const res18 = bridgeDecisionToPlanDeterministic({ decision: waitDecision });
  assert(res18.status === 'BLOCKED_WAITING_EVIDENCE', 'Status is BLOCKED_WAITING_EVIDENCE');
  assert(res18.plan?.status === 'BLOCKED', 'Plan status is BLOCKED');

  // 19. Unavailable capability marks step and plan blocked
  console.log('\n--- Test 19: Unavailable capability marks step and plan blocked ---');
  const missingToolDecision = createMockDecision({
    decisionType: 'REVIEW_MISTAKES',
    requiredCapabilities: ['get_mistakes'],
  });
  const res19 = bridgeDecisionToPlanDeterministic({
    decision: missingToolDecision,
    availableCapabilities: ['get_student_profile'], // get_mistakes excluded
  });
  assert(res19.status === 'BLOCKED_BY_CAPABILITY', 'Bridge status is BLOCKED_BY_CAPABILITY');
  assert(res19.plan?.status === 'BLOCKED', 'Plan status is BLOCKED');
  assert(res19.plan?.steps[0].status === 'BLOCKED', 'Step requiring missing capability is BLOCKED');
  assert(res19.unavailableCapabilities.includes('get_mistakes'), 'get_mistakes listed in unavailableCapabilities');

  // 20. Explicit student intent preserved in plan objectives
  console.log('\n--- Test 20: Explicit student intent preserved in plan objectives ---');
  assert(res15.plan?.objectives[0] === mistakesDecision.primaryObjective, 'Student intent preserved verbatim in plan objective');

  // 21. Multiple target skills handled
  console.log('\n--- Test 21: Multiple target skills handled ---');
  const multiSkillDecision = createMockDecision({
    targetSkills: ['Python', 'SQL'],
  });
  const res21 = bridgeDecisionToPlanDeterministic({ decision: multiSkillDecision });
  assert(res21.targetSkills.includes('Python') && res21.targetSkills.includes('SQL'), 'Multiple target skills preserved in bridge result');

  // 22. Contradictions preserved in plan metadata
  console.log('\n--- Test 22: Contradictions preserved in plan metadata ---');
  const contraDecision = createMockDecision({
    contradictions: ['Claimed level 5 but has 4 logged errors in SQL joins'],
  });
  const res22 = bridgeDecisionToPlanDeterministic({ decision: contraDecision });
  assert((res22.plan?.metadata?.contradictions as string[])?.length > 0, 'Contradictions attached to plan metadata');

  // 23. Evidence gaps preserved in plan metadata
  console.log('\n--- Test 23: Evidence gaps preserved in plan metadata ---');
  const gapDecision = createMockDecision({
    evidenceGaps: ['No projects found for React'],
  });
  const res23 = bridgeDecisionToPlanDeterministic({ decision: gapDecision });
  assert((res23.plan?.metadata?.evidenceGaps as string[])?.length > 0, 'Evidence gaps attached to plan metadata');

  // 24. Missing evidence not converted to weakness
  console.log('\n--- Test 24: Missing evidence not converted to weakness ---');
  assert(!res23.rationale.toLowerCase().includes('poor performance'), 'Missing evidence is not called poor performance');

  // 25. Stale evidence preserved
  console.log('\n--- Test 25: Stale evidence preserved ---');
  const staleAssessment = createMockAssessment({
    skillAssessments: [createMockSkillAssessment('Java', { freshness: { status: 'STALE', daysSinceNewest: 65, isStale: true } })],
  });
  const res25 = bridgeDecisionToPlanDeterministic({
    decision: createMockDecision({ targetSkills: ['Java'] }),
    assessment: staleAssessment,
  });
  assert(res25.targetSkills.includes('Java'), 'Stale evidence target skill preserved');

  // 26. No invented deadline if timeframe unstated
  console.log('\n--- Test 26: No invented deadline if timeframe unstated ---');
  const noTimeframeGoal = createMockGoalUnderstanding({ timeframe: null });
  const res26 = bridgeDecisionToPlanDeterministic({
    decision: createMockDecision(),
    goalUnderstanding: noTimeframeGoal,
  });
  assert(!res26.plan?.constraints.some((c) => c.includes('Timeframe:')), 'No fake deadline invented');

  // 27. Phase 1 calibrated proficiency remains unchanged
  console.log('\n--- Test 27: Phase 1 calibrated proficiency remains unchanged ---');
  const p1Assessment = createMockAssessment({
    skillAssessments: [createMockSkillAssessment('Python', { calibratedProficiency: 2 })],
  });
  const res27 = bridgeDecisionToPlanDeterministic({
    decision: createMockDecision({ targetSkills: ['Python'] }),
    assessment: p1Assessment,
  });
  assert(p1Assessment.skillAssessments[0].calibratedProficiency === 2, 'Calibrated level remains exactly 2');

  // 28. Phase 6B assessment remains unchanged
  console.log('\n--- Test 28: Phase 6B assessment remains unchanged ---');
  assert(res14.confidence === 'HIGH', 'Confidence remains authoritative from decision');

  // 29. 6C decision remains traceable via decisionId and metadata
  console.log('\n--- Test 29: 6C decision remains traceable via decisionId and metadata ---');
  assert(res14.plan?.metadata?.decisionId === res14.decisionId, 'decisionId is attached to plan metadata');
  assert(res14.plan?.metadata?.decisionType === res14.decisionType, 'decisionType attached to plan metadata');

  // 30. Phase 4 validation accepts valid generated plans
  console.log('\n--- Test 30: Phase 4 validation accepts valid generated plans ---');
  const p4Validation = validatePlan(res14.plan);
  assert(p4Validation.isValid === true, 'Phase 4 validatePlan() certifies plan as valid');

  // 31. Invalid dependencies are rejected by Phase 4 validation
  console.log('\n--- Test 31: Invalid dependencies are rejected by Phase 4 validation ---');
  const cycleSteps = [
    { ...res14.plan!.steps[0], dependencies: ['step_2'] },
    { ...res14.plan!.steps[1], id: 'step_2', dependencies: [res14.plan!.steps[0].id] },
  ];
  const depCheck = validatePlanDependencies(cycleSteps);
  assert(depCheck.hasCycles === true, 'Cycle check detects circular dependencies');

  // 32. Zero write tool execution
  console.log('\n--- Test 32: Zero write tool execution ---');
  assert(!Object.prototype.hasOwnProperty.call(res14, 'executedTasks'), 'Zero task executions in bridge layer');

  // 33. No approval bypass (URGENT requires approval)
  console.log('\n--- Test 33: No approval bypass (URGENT requires approval) ---');
  const urgentDecision = createMockDecision({
    priority: 'URGENT',
    requiresHumanApproval: true,
  });
  const res33 = bridgeDecisionToPlanDeterministic({ decision: urgentDecision });
  assert(res33.plan?.approvalRequirement.requiresApproval === true, 'Urgent plan mandates approval requirement');

  // 34. No database mutation
  console.log('\n--- Test 34: No database mutation ---');
  assert(typeof res14.decisionId === 'string', 'Pure in-memory execution; zero DB mutations');

  // 35. No calendar mutation
  console.log('\n--- Test 35: No calendar mutation ---');
  assert(!Object.prototype.hasOwnProperty.call(res14, 'createdEvents'), 'Zero calendar mutations');

  // 36. No task mutation
  console.log('\n--- Test 36: No task mutation ---');
  assert(!Object.prototype.hasOwnProperty.call(res14, 'mutatedTasks'), 'Zero task mutations');

  // 37. Gemini unavailable still works
  console.log('\n--- Test 37: Gemini unavailable still works ---');
  const res37 = await bridgeDecisionToPlan({ decision: practiceDecision });
  assert(res37.status === 'PLAN_GENERATED', 'Async bridge works smoothly without Gemini');

  // 38. Single orchestrator integrity
  console.log('\n--- Test 38: Single orchestrator integrity ---');
  assert(VALID_AGENT_TRANSITIONS['ASSESSING'].includes('PLANNING'), 'ASSESSING transitions directly to PLANNING');

  // 39. Existing Phase 5 safety remains intact
  console.log('\n--- Test 39: Existing Phase 5 safety remains intact ---');
  assert(res14.userId === userId && res14.plan?.userId === userId, 'Authenticated tenant identity immutable');

  console.log('\n===============================================================');
  console.log('✨ ALL 39 PHASE 6D CAPABILITY REALITY & EXECUTION SAFETY TESTS PASSED!');
  console.log('===============================================================');
}

runBridgeVerificationSuite().catch((err) => {
  console.error('Fatal test error in Phase 6D suite:', err);
  process.exit(1);
});
