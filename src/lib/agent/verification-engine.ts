/**
 * Phase 4E: Evidence-Based Verification & Controlled Replanning Engine
 * 
 * Provides:
 * - Deterministic outcome verification evaluating executed PlanSteps against empirical telemetry.
 * - Epistemic distinction between SELF_REPORTED, OBSERVED, INFERRED, and EXTERNALLY_VERIFIED evidence.
 * - Strict separation of execution success from learning success (execution success != learning success).
 * - Detection of unsupported verification capabilities (NOT_VERIFIABLE) without faking data.
 * - Contradiction detection and preservation of both supporting and contradictory evidence.
 * - Controlled replanning decisions producing structured ReplanContext and superseding old plans.
 * - Sanitized working memory updates and strict side-effect guarantees (0 DB/task/calendar mutations).
 * - Zero LLM/Gemini calls; pure deterministic ground-truth verification.
 */

import {
  LearningPlan,
  PlanStep,
  PlanStepStatus,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import { supersedePlan } from './planning-model';
import {
  PlanStepExecutionResult,
} from './plan-execution-types';
import {
  EvidenceRecord,
  EvidenceClassification,
  StudentCorroborationAuditResult,
  CorroborationResult,
  StudentSkillAssessment,
} from './types';
import {
  StepVerificationStatus,
  CriterionEvaluation,
  StepVerificationResult,
  ReplanContext,
  ReplanDecisionResult,
  VerifyPlanStepInput,
} from './verification-types';
import { sanitizeWorkingMemory } from './run-persistence';
import { decomposeStudentGoal } from './goal-decomposition';
import { AgentRunState } from './state-types';
import { VerifyingHandlerResult, ReplanningHandlerResult } from './orchestrator-types';

/**
 * List of known unsupported capabilities in the current application architecture.
 * If a verification criterion specifically requires these, it is marked NOT_VERIFIABLE.
 */
const UNSUPPORTED_CAPABILITY_PATTERNS: Array<{
  pattern: RegExp;
  capabilityName: string;
  explanation: string;
}> = [
  {
    pattern: /diagnostic assessment score record verified in database|diagnostic quiz submission|proctored exam score|quiz_assessment_database/i,
    capabilityName: 'quiz_assessment_database',
    explanation: 'The application currently does not possess an integrated diagnostic quiz/assessment scoring database.',
  },
  {
    pattern: /external certification|official certificate api|credential verification service/i,
    capabilityName: 'external_certification_service',
    explanation: 'No external certification or credential verification API is connected to the application.',
  },
  {
    pattern: /biometric focus sensor|eeg telemetry|eye tracking/i,
    capabilityName: 'biometric_sensors',
    explanation: 'Hardware biometric and EEG sensory telemetry is not supported.',
  },
];

/**
 * Normalizes assessment context into a list of assessed skills for contradiction/gap checking.
 */
function extractSkillAssessments(
  assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null
): StudentSkillAssessment[] {
  if (!assessmentContext) return [];

  if ('skillsEvaluated' in assessmentContext && Array.isArray(assessmentContext.skillsEvaluated)) {
    return assessmentContext.skillsEvaluated as StudentSkillAssessment[];
  }

  return [];
}

/**
 * Checks if a verification criterion demands an unsupported application capability.
 */
function checkUnsupportedCapability(criterionText: string): { isUnsupported: boolean; capability?: string; explanation?: string } {
  for (const item of UNSUPPORTED_CAPABILITY_PATTERNS) {
    if (item.pattern.test(criterionText)) {
      return {
        isUnsupported: true,
        capability: item.capabilityName,
        explanation: item.explanation,
      };
    }
  }
  return { isUnsupported: false };
}

/**
 * Evaluates an individual verification criterion against empirical telemetry and assessment records.
 */
export function evaluateCriterionAgainstEvidence(
  criterionText: string,
  step: PlanStep,
  executionResult: PlanStepExecutionResult,
  evidenceRecords: EvidenceRecord[],
  assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null
): CriterionEvaluation {
  // 1. Check if execution itself failed or was blocked
  if (executionResult.status === 'FAILED' || executionResult.status === 'BLOCKED') {
    return {
      criterionText,
      status: 'BLOCKED',
      isCapabilitySupported: true,
      supportingEvidence: [],
      contradictingEvidence: [],
      explanation: `Step execution ${executionResult.status.toLowerCase()}: ${executionResult.blockingReason || executionResult.error?.message || 'Tool execution unsuccessful'}.`,
    };
  }

  // 2. Check for Unsupported Application Capabilities
  const unsupportedCheck = checkUnsupportedCapability(criterionText);
  if (unsupportedCheck.isUnsupported) {
    return {
      criterionText,
      status: 'NOT_VERIFIABLE',
      isCapabilitySupported: false,
      missingCapability: unsupportedCheck.capability,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidenceDescription: `Required capability "${unsupportedCheck.capability}" is not supported in the current system.`,
      explanation: unsupportedCheck.explanation || `Criterion requires unsupported capability "${unsupportedCheck.capability}".`,
    };
  }

  // 3. Extract relevant evidence records from tool execution output & passed evidence
  const supporting: string[] = [];
  const contradicting: string[] = [];
  let strongestClass: EvidenceClassification | undefined = undefined;

  const targetSkill = step.targetSkill?.toLowerCase() || '';

  // Check assessment context for known contradictions
  const assessedSkills = extractSkillAssessments(assessmentContext);
  const matchedAssessedSkill = assessedSkills.find(
    (s) => targetSkill && s.skillName.toLowerCase() === targetSkill
  );

  if (matchedAssessedSkill && matchedAssessedSkill.contradictions && matchedAssessedSkill.contradictions.length > 0) {
    for (const c of matchedAssessedSkill.contradictions) {
      contradicting.push(`Assessment Contradiction: ${c.reason} (Severity: ${c.severity})`);
    }
  }

  // Check tool results for observed evidence
  const toolResults = executionResult.toolResults || [];
  for (const tr of toolResults) {
    if (tr.status === 'SUCCESS' && tr.output) {
      const out = tr.output as Record<string, unknown>;

      // Mistake tool output check
      if (tr.toolName === 'get_mistakes') {
        const mistakes = (out.mistakes || (Array.isArray(out) ? out : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(mistakes) && mistakes.length > 0) {
          const matchingMistakes = mistakes.filter((m) => {
            const topic = String(m.topic || m.title || m.description || '').toLowerCase();
            return !targetSkill || topic.includes(targetSkill);
          });
          if (matchingMistakes.length > 0) {
            contradicting.push(
              `Observed ${matchingMistakes.length} recurring mistake log(s) for ${step.targetSkill || 'target topic'}.`
            );
          }
        }
      }

      // Time session telemetry check
      if (tr.toolName === 'get_time_sessions') {
        const sessions = (out.timeSessions || out.sessions || (Array.isArray(out) ? out : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(sessions) && sessions.length > 0) {
          supporting.push(`Observed ${sessions.length} focus study session record(s) in time tracking telemetry.`);
          strongestClass = strongestClass === 'EXTERNALLY_VERIFIED' ? 'EXTERNALLY_VERIFIED' : 'OBSERVED';
        }
      }

      // Task completion telemetry check
      if (tr.toolName === 'get_tasks') {
        const tasks = (out.tasks || (Array.isArray(out) ? out : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(tasks) && tasks.length > 0) {
          supporting.push(`Observed ${tasks.length} task record(s) in task management telemetry.`);
          strongestClass = strongestClass === 'EXTERNALLY_VERIFIED' ? 'EXTERNALLY_VERIFIED' : 'OBSERVED';
        }
      }

      // GitHub external telemetry check
      if (tr.toolName === 'get_github_activity') {
        const commits = (out.activity || out.commits || (Array.isArray(out) ? out : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(commits) && commits.length > 0) {
          supporting.push(`Externally verified ${commits.length} GitHub commit record(s).`);
          strongestClass = 'EXTERNALLY_VERIFIED';
        }
      }

      // LeetCode external telemetry check
      if (tr.toolName === 'get_leetcode_activity') {
        const subs = (out.submissions || (Array.isArray(out) ? out : [])) as Array<Record<string, unknown>>;
        if (Array.isArray(subs) && subs.length > 0) {
          supporting.push(`Externally verified ${subs.length} LeetCode submission record(s).`);
          strongestClass = 'EXTERNALLY_VERIFIED';
        }
      }

      // Profile / Skills check (Can be SELF_REPORTED unless corroborated)
      if (tr.toolName === 'get_student_profile' || tr.toolName === 'get_skills') {
        if (!strongestClass) {
          strongestClass = 'SELF_REPORTED';
          supporting.push('Self-reported profile / skill record observed.');
        }
      }
    }
  }

  // Scan provided evidenceRecords
  for (const rec of evidenceRecords) {
    const recSkill = rec.targetSkillName.toLowerCase();
    const isMatch = !targetSkill || recSkill.includes(targetSkill) || targetSkill.includes(recSkill);

    if (isMatch) {
      if (rec.polarity === 'CONTRADICTS') {
        contradicting.push(`[${rec.classification}] ${rec.description}`);
      } else if (rec.polarity === 'SUPPORTS') {
        supporting.push(`[${rec.classification}] ${rec.description}`);
        if (rec.classification === 'EXTERNALLY_VERIFIED') {
          strongestClass = 'EXTERNALLY_VERIFIED';
        } else if (rec.classification === 'OBSERVED' && strongestClass !== 'EXTERNALLY_VERIFIED') {
          strongestClass = 'OBSERVED';
        } else if (rec.classification === 'INFERRED' && (!strongestClass || strongestClass === 'SELF_REPORTED')) {
          strongestClass = 'INFERRED';
        } else if (!strongestClass) {
          strongestClass = rec.classification;
        }
      }
    }
  }

  // 4. Decide Criterion Status based on Epistemic Evidence
  if (contradicting.length > 0) {
    return {
      criterionText,
      status: 'CONTRADICTED',
      evidenceClassification: strongestClass,
      isCapabilitySupported: true,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      explanation: `Criterion contradicted by empirical evidence: ${contradicting.join('; ')}.`,
    };
  }

  if (supporting.length > 0) {
    // Crucial rule: SELF_REPORTED alone cannot claim VERIFIED
    if (strongestClass === 'SELF_REPORTED') {
      return {
        criterionText,
        status: 'INSUFFICIENT_EVIDENCE',
        evidenceClassification: 'SELF_REPORTED',
        isCapabilitySupported: true,
        supportingEvidence: supporting,
        contradictingEvidence: [],
        missingEvidenceDescription: 'Evidence is solely self-reported; empirical observed or externally verified proof is required.',
        explanation: 'Criterion has only self-reported claims without empirical corroboration.',
      };
    }

    return {
      criterionText,
      status: 'VERIFIED',
      evidenceClassification: strongestClass,
      isCapabilitySupported: true,
      supportingEvidence: supporting,
      contradictingEvidence: [],
      explanation: `Criterion verified by empirical evidence (${strongestClass || 'OBSERVED'}).`,
    };
  }

  // No evidence found
  return {
    criterionText,
    status: 'INSUFFICIENT_EVIDENCE',
    isCapabilitySupported: true,
    supportingEvidence: [],
    contradictingEvidence: [],
    missingEvidenceDescription: `No empirical telemetry observed to substantiate criterion: "${criterionText}".`,
    explanation: 'No supporting telemetry or empirical records found for this criterion.',
  };
}

/**
 * Deterministically verifies an executed PlanStep against its verification criteria and empirical telemetry.
 */
export function verifyPlanStep(input: VerifyPlanStepInput): StepVerificationResult {
  const {
    plan,
    stepId,
    executionResult,
    evidenceRecords = [],
    assessmentContext = null,
  } = input;
  const timestamp = input.timestamp || new Date().toISOString();

  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) {
    return {
      planId: plan.planId,
      stepId,
      status: 'BLOCKED',
      criteriaEvaluations: [],
      evaluatedEvidence: evidenceRecords,
      supportingEvidenceSummary: [],
      contradictingEvidenceSummary: [],
      missingEvidenceSummary: [`Step "${stepId}" not found in parent plan "${plan.planId}".`],
      verificationConfidence: 0.0,
      explanation: `Verification failed: Step "${stepId}" does not exist in plan "${plan.planId}".`,
      recommendedAction: 'Verify step ID before executing verification.',
      isReplanWarranted: true,
      replanTriggerReason: `Missing step "${stepId}" in plan.`,
      evaluatedAt: timestamp,
    };
  }

  // Handle execution-level failure or blocking
  if (executionResult.status === 'FAILED' || executionResult.status === 'BLOCKED') {
    return {
      planId: plan.planId,
      stepId,
      status: 'BLOCKED',
      criteriaEvaluations: [],
      evaluatedEvidence: evidenceRecords,
      supportingEvidenceSummary: [],
      contradictingEvidenceSummary: [],
      missingEvidenceSummary: [executionResult.blockingReason || executionResult.error?.message || 'Execution was blocked or failed'],
      verificationConfidence: 0.0,
      explanation: `Step execution did not complete successfully (Status: ${executionResult.status}).`,
      recommendedAction: 'Resolve execution impediment or replan curriculum.',
      isReplanWarranted: true,
      replanTriggerReason: `Step execution ${executionResult.status.toLowerCase()}: ${executionResult.blockingReason || executionResult.error?.message || 'Failure'}`,
      evaluatedAt: timestamp,
    };
  }

  const criteria = step.verificationCriteria || [];
  const criteriaEvaluations: CriterionEvaluation[] = [];

  // Evaluate each criterion individually
  if (criteria.length > 0) {
    for (const crit of criteria) {
      const evaluation = evaluateCriterionAgainstEvidence(
        crit,
        step,
        executionResult,
        evidenceRecords,
        assessmentContext
      );
      criteriaEvaluations.push(evaluation);
    }
  } else {
    // Default criterion if none explicitly provided
    const defaultEvaluation = evaluateCriterionAgainstEvidence(
      'Empirical telemetry record observed for target action',
      step,
      executionResult,
      evidenceRecords,
      assessmentContext
    );
    criteriaEvaluations.push(defaultEvaluation);
  }

  // Aggregate summaries
  const supportingSummary: string[] = [];
  const contradictingSummary: string[] = [];
  const missingSummary: string[] = [];
  let highestClassification: EvidenceClassification | null = null;

  for (const ev of criteriaEvaluations) {
    for (const sup of ev.supportingEvidence) {
      if (!supportingSummary.includes(sup)) supportingSummary.push(sup);
    }
    for (const con of ev.contradictingEvidence) {
      if (!contradictingSummary.includes(con)) contradictingSummary.push(con);
    }
    if (ev.missingEvidenceDescription && !missingSummary.includes(ev.missingEvidenceDescription)) {
      missingSummary.push(ev.missingEvidenceDescription);
    }

    if (ev.evidenceClassification) {
      if (ev.evidenceClassification === 'EXTERNALLY_VERIFIED') {
        highestClassification = 'EXTERNALLY_VERIFIED';
      } else if (ev.evidenceClassification === 'OBSERVED' && highestClassification !== 'EXTERNALLY_VERIFIED') {
        highestClassification = 'OBSERVED';
      } else if (ev.evidenceClassification === 'INFERRED' && (!highestClassification || highestClassification === 'SELF_REPORTED')) {
        highestClassification = 'INFERRED';
      } else if (!highestClassification) {
        highestClassification = ev.evidenceClassification;
      }
    }
  }

  // Derive Overall Step Verification Status
  const statusCounts = {
    VERIFIED: criteriaEvaluations.filter((c) => c.status === 'VERIFIED').length,
    PARTIALLY_VERIFIED: criteriaEvaluations.filter((c) => c.status === 'PARTIALLY_VERIFIED').length,
    INSUFFICIENT_EVIDENCE: criteriaEvaluations.filter((c) => c.status === 'INSUFFICIENT_EVIDENCE').length,
    CONTRADICTED: criteriaEvaluations.filter((c) => c.status === 'CONTRADICTED').length,
    NOT_VERIFIABLE: criteriaEvaluations.filter((c) => c.status === 'NOT_VERIFIABLE').length,
    BLOCKED: criteriaEvaluations.filter((c) => c.status === 'BLOCKED').length,
  };

  let overallStatus: StepVerificationStatus = 'INSUFFICIENT_EVIDENCE';
  let confidence = 0.2;
  let isReplanWarranted = false;
  let replanTriggerReason: string | undefined = undefined;

  if (statusCounts.CONTRADICTED > 0) {
    overallStatus = 'CONTRADICTED';
    confidence = 0.05;
    isReplanWarranted = true;
    replanTriggerReason = `Empirical evidence directly contradicts intended outcome for step "${step.title}". Detected: ${contradictingSummary.join('; ')}`;
  } else if (statusCounts.BLOCKED > 0) {
    overallStatus = 'BLOCKED';
    confidence = 0.0;
    isReplanWarranted = true;
    replanTriggerReason = `Step "${step.title}" execution was blocked or failed.`;
  } else if (statusCounts.VERIFIED === criteriaEvaluations.length) {
    overallStatus = 'VERIFIED';
    confidence = highestClassification === 'EXTERNALLY_VERIFIED' ? 1.0 : 0.9;
    isReplanWarranted = false;
  } else if (statusCounts.NOT_VERIFIABLE === criteriaEvaluations.length) {
    overallStatus = 'NOT_VERIFIABLE';
    confidence = 0.0;
    isReplanWarranted = false; // Unsupported capability alone does not warrant blind replan loop
  } else if (statusCounts.VERIFIED > 0 && (statusCounts.INSUFFICIENT_EVIDENCE > 0 || statusCounts.NOT_VERIFIABLE > 0 || statusCounts.PARTIALLY_VERIFIED > 0)) {
    overallStatus = 'PARTIALLY_VERIFIED';
    confidence = 0.6;
    isReplanWarranted = false;
  } else if (statusCounts.INSUFFICIENT_EVIDENCE > 0) {
    overallStatus = 'INSUFFICIENT_EVIDENCE';
    confidence = highestClassification === 'SELF_REPORTED' ? 0.25 : 0.15;
    isReplanWarranted = true;
    replanTriggerReason = `Insufficient empirical evidence to corroborate step "${step.title}". Missing: ${missingSummary.join('; ')}`;
  }

  // Formulate explanation & recommended next action
  let explanation = '';
  let recommendedAction = '';

  switch (overallStatus) {
    case 'VERIFIED':
      explanation = `All verification criteria for step "${step.title}" were substantiated by empirical evidence (${highestClassification || 'OBSERVED'}).`;
      recommendedAction = 'Proceed to next planned learning step.';
      break;
    case 'PARTIALLY_VERIFIED':
      explanation = `Step "${step.title}" partially verified. Some empirical evidence was observed, but ${missingSummary.length} criteria require further corroboration.`;
      recommendedAction = 'Continue with curriculum while monitoring unverified areas.';
      break;
    case 'INSUFFICIENT_EVIDENCE':
      explanation = `Step "${step.title}" lacked sufficient empirical evidence. ${highestClassification === 'SELF_REPORTED' ? 'Only self-reported claims exist.' : 'No empirical telemetry observed.'}`;
      recommendedAction = 'Trigger controlled replanning to schedule dedicated practice or evidence collection.';
      break;
    case 'CONTRADICTED':
      explanation = `Intended learning outcome for step "${step.title}" is contradicted by empirical evidence (${contradictingSummary.join('; ')}).`;
      recommendedAction = 'Trigger controlled replanning to inject targeted remedial practice.';
      break;
    case 'NOT_VERIFIABLE':
      explanation = `Verification criteria for step "${step.title}" require capabilities not supported in the current application (${missingSummary.join('; ')}).`;
      recommendedAction = 'Update verification criteria to use supported telemetry sources (focus timer, task logs, git commits).';
      break;
    case 'BLOCKED':
      explanation = `Step "${step.title}" was blocked during execution.`;
      recommendedAction = 'Resolve blocking dependency or replan without blocked tools.';
      break;
  }

  return {
    planId: plan.planId,
    stepId,
    status: overallStatus,
    criteriaEvaluations,
    evaluatedEvidence: evidenceRecords,
    supportingEvidenceSummary: supportingSummary,
    contradictingEvidenceSummary: contradictingSummary,
    missingEvidenceSummary: missingSummary,
    strongestEvidenceClassification: highestClassification,
    verificationConfidence: confidence,
    explanation,
    recommendedAction,
    isReplanWarranted,
    replanTriggerReason,
    evaluatedAt: timestamp,
  };
}

/**
 * Deterministically decides whether a LearningPlan requires replanning based on verification results.
 * Preserves historical plans via Phase 4A supersession model (supersedePlan).
 */
export function decideReplanning(
  plan: LearningPlan,
  verificationResults: StepVerificationResult[],
  options?: {
    assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null;
    timestamp?: string;
  }
): ReplanDecisionResult {
  const timestamp = options?.timestamp || new Date().toISOString();

  const contradictedSteps = verificationResults.filter((r) => r.status === 'CONTRADICTED');
  const insufficientSteps = verificationResults.filter((r) => r.status === 'INSUFFICIENT_EVIDENCE' && r.isReplanWarranted);
  const blockedSteps = verificationResults.filter((r) => r.status === 'BLOCKED');
  const verifiedSteps = verificationResults.filter((r) => r.status === 'VERIFIED');

  const shouldReplan = contradictedSteps.length > 0 || insufficientSteps.length > 0 || blockedSteps.length > 0;

  if (!shouldReplan) {
    return {
      shouldReplan: false,
      reason: `No replanning warranted. ${verifiedSteps.length} step(s) verified with zero material contradictions or unresolvable gaps.`,
      metadata: {
        totalStepsEvaluated: verificationResults.length,
        verifiedCount: verifiedSteps.length,
      },
    };
  }

  // Construct Replan Reason and Suggested Focus
  let reason = '';
  let suggestedFocus = '';
  let newCategory: 'REMEDIAL_PRACTICE' | 'SKILL_IMPROVEMENT' | 'GENERAL_LEARNING' = 'GENERAL_LEARNING';

  const allContradictions: string[] = [];
  const allGaps: string[] = [];

  for (const r of verificationResults) {
    for (const c of r.contradictingEvidenceSummary) {
      if (!allContradictions.includes(c)) allContradictions.push(c);
    }
    for (const m of r.missingEvidenceSummary) {
      if (!allGaps.includes(m)) allGaps.push(m);
    }
  }

  if (contradictedSteps.length > 0) {
    reason = `Replanning triggered by ${contradictedSteps.length} contradicted step(s): ${contradictedSteps.map((s) => s.replanTriggerReason).join('; ')}`;
    suggestedFocus = `Targeted remediation on detected mistakes and misconceptions (${allContradictions.slice(0, 2).join('; ')})`;
    newCategory = 'REMEDIAL_PRACTICE';
  } else if (insufficientSteps.length > 0) {
    reason = `Replanning triggered by ${insufficientSteps.length} step(s) with actionable evidence gaps: ${insufficientSteps.map((s) => s.replanTriggerReason).join('; ')}`;
    suggestedFocus = `Structured practice and empirical evidence collection for ${plan.targetSkill || 'target subject'}`;
    newCategory = 'SKILL_IMPROVEMENT';
  } else {
    reason = `Replanning triggered by ${blockedSteps.length} blocked step(s).`;
    suggestedFocus = `Alternative execution path avoiding blocked tools`;
  }

  // Construct structured ReplanContext
  const completedStepIds = plan.steps.filter((s) => s.status === 'COMPLETED').map((s) => s.id);
  const failedStepIds = plan.steps.filter((s) => s.status === 'FAILED' || s.status === 'BLOCKED').map((s) => s.id);
  const unverifiedStepIds = verificationResults.filter((r) => r.status !== 'VERIFIED').map((r) => r.stepId);

  const replanContext: ReplanContext = {
    originalGoal: plan.goal,
    originalPlanId: plan.planId,
    completedStepIds,
    failedStepIds,
    unverifiedStepIds,
    verificationResults,
    unresolvedGaps: allGaps,
    contradictions: allContradictions,
    suggestedFocus,
    reasonForReplanning: reason,
    previousPlanSnapshot: { ...plan },
    updatedAssessmentContext: options?.assessmentContext ?? plan.decisionReadyAssessment,
    formulatedAt: timestamp,
  };

  // Supersede previous plan cleanly via Phase 4A supersedePlan
  const newPlanId = `plan_${Date.now()}_replan_${Math.random().toString(36).substring(2, 7)}`;
  const supersededPlan = supersedePlan(plan, {
    newPlanId,
    reason,
    supersededAt: timestamp,
  });

  // Deterministically generate candidate new plan using Phase 4B Goal Decomposition if trigger context exists
  let newCandidatePlan: LearningPlan | undefined = undefined;
  if (plan.triggerContext) {
    const replanGoalText = `${plan.goal} (Replanned Focus: ${suggestedFocus})`;
    const decompResult = decomposeStudentGoal({
      triggerContext: {
        ...plan.triggerContext,
        normalizedGoalText: replanGoalText,
        goalCategory: newCategory,
      },
      assessmentContext: options?.assessmentContext ?? plan.decisionReadyAssessment,
      planId: newPlanId,
      timestamp,
    });

    if (decompResult.status === 'DECOMPOSED' && decompResult.candidatePlan) {
      newCandidatePlan = {
        ...decompResult.candidatePlan,
        metadata: {
          ...(decompResult.candidatePlan.metadata || {}),
          supersedesPlanId: plan.planId,
          replanReason: reason,
        },
      };
    }
  }

  return {
    shouldReplan: true,
    reason,
    replanContext,
    supersededPlan,
    newCandidatePlan,
    metadata: {
      totalStepsEvaluated: verificationResults.length,
      contradictedCount: contradictedSteps.length,
      insufficientCount: insufficientSteps.length,
      blockedCount: blockedSteps.length,
    },
  };
}

/**
 * Creates an onVerifying handler for the SINGLE Learning Orchestrator Agent loop.
 */
export function createPlanVerifyingHandler(options: {
  getEvidenceRecords?: (state: AgentRunState) => Promise<EvidenceRecord[]> | EvidenceRecord[];
  timestamp?: string;
}) {
  return async function onVerifying(state: AgentRunState): Promise<VerifyingHandlerResult> {
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const executionOutput = memory.executionOutput as PlanStepExecutionResult | undefined;

    if (!plan || !executionOutput) {
      return {
        verified: false,
        needsReplan: true,
        reason: 'Missing plan or execution output in working memory during verification stage.',
        failureReason: 'Missing plan or execution output in working memory.',
      };
    }

    const customEvidence = options.getEvidenceRecords
      ? await options.getEvidenceRecords(state)
      : [];

    // Verify step deterministically
    const verifyResult = verifyPlanStep({
      plan,
      stepId: executionOutput.stepId,
      executionResult: executionOutput,
      authenticatedUserId: state.userId,
      evidenceRecords: customEvidence,
      assessmentContext: state.evidenceContext.audit || state.evidenceContext.corroboration,
      timestamp: options.timestamp,
    });

    // Update step status on plan copy
    const updatedSteps = plan.steps.map((s) => {
      if (s.id === executionOutput.stepId) {
        return {
          ...s,
          status: (verifyResult.status === 'VERIFIED'
            ? 'COMPLETED'
            : verifyResult.status === 'CONTRADICTED' || verifyResult.status === 'BLOCKED'
            ? 'FAILED'
            : s.status) as PlanStepStatus,
          output: verifyResult,
        };
      }
      return s;
    });

    const updatedPlan: LearningPlan = {
      ...plan,
      steps: updatedSteps,
      updatedAt: verifyResult.evaluatedAt,
    };

    // Sanitize working memory payload
    const sanitizedVerifyResult = sanitizeWorkingMemory({
      stepVerification: verifyResult,
      updatedPlan,
    });

    if (verifyResult.status === 'VERIFIED') {
      return {
        verified: true,
        reason: `Step "${executionOutput.stepId}" successfully verified by empirical evidence.`,
        workingMemory: sanitizedVerifyResult,
      };
    }

    if (verifyResult.isReplanWarranted) {
      return {
        verified: false,
        needsReplan: true,
        reason: verifyResult.replanTriggerReason || `Verification ${verifyResult.status.toLowerCase()}; triggering replan.`,
        failureReason: verifyResult.explanation,
        workingMemory: sanitizedVerifyResult,
      };
    }

    // Partially verified or non-blocking outcome
    return {
      verified: true,
      reason: `Step "${executionOutput.stepId}" verification status: ${verifyResult.status}. Advancing with notice.`,
      workingMemory: sanitizedVerifyResult,
    };
  };
}

/**
 * Creates an onReplanning handler for the SINGLE Learning Orchestrator Agent loop.
 */
export function createPlanReplanningHandler(options?: {
  timestamp?: string;
}) {
  return async function onReplanning(state: AgentRunState): Promise<ReplanningHandlerResult> {
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const stepVerification = memory.stepVerification as StepVerificationResult | undefined;

    if (!plan) {
      return {
        nextState: 'PLANNING',
        reason: 'Replanning triggered without active plan; returning to initial planning.',
      };
    }

    const verifications = stepVerification ? [stepVerification] : [];
    const replanDecision = decideReplanning(plan, verifications, {
      assessmentContext: state.evidenceContext.audit || state.evidenceContext.corroboration,
      timestamp: options?.timestamp,
    });

    const sanitizedUpdate = sanitizeWorkingMemory({
      replanDecision,
      supersededPlan: replanDecision.supersededPlan,
      plan: replanDecision.newCandidatePlan || replanDecision.supersededPlan,
    });

    return {
      nextState: 'PLANNING',
      reason: replanDecision.reason,
      workingMemory: sanitizedUpdate,
    };
  };
}
