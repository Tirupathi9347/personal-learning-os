/**
 * Phase 6E: Outcome, Feedback & Learning Loop Evaluator
 * 
 * Implements deterministic-first, LLM-augmented outcome evaluation and feedback loop
 * for the SINGLE Learning Orchestrator.
 * 
 * Answers: "What actually happened after the plan was executed?"
 * 
 * Core Rules:
 * 1. Strictly READ-ONLY: 0 database mutations, 0 skill modifications, 0 write tool executions.
 * 2. Strict separation of ACTION OUTCOME (operational facts) from LEARNING OUTCOME (empirical proof of learning).
 * 3. Plan completion != learning success.
 * 4. Epistemic ground-truth: Uses Phase 1 classifications (SELF_REPORTED, OBSERVED, INFERRED, EXTERNALLY_VERIFIED).
 * 5. Contradictions, evidence gaps, and capability failures are preserved without loss.
 * 6. Missing evidence is uncertainty, NOT student failure.
 * 7. 6E produces feedback for future 6B/6C passes; 6E NEVER decides the next learning action.
 */

import {
  LearningPlan,
  PlanStep,
  PlanStepStatus,
  PlanStatus,
} from './planning-types';
import {
  PlanStepExecutionResult,
} from './plan-execution-types';
import {
  EvidenceRecord,
  EvidenceClassification,
  StudentCorroborationAuditResult,
  CorroborationResult,
} from './types';
import {
  StepVerificationStatus,
  StepVerificationResult,
} from './verification-types';
import {
  PostWriteVerificationResult,
} from './post-write-verifier';
import {
  PlanCompletionStatus,
  LearningOutcomeStatus,
  OutcomeEvidence,
  StepOutcomeSummary,
  ActionOutcomeSummary,
  CapabilityFailureRecord,
  LearningOutcome,
  LearningFeedback,
  EvaluateOutcomeInput,
  LearningOutcomeResult,
  FeedbackLlmClient,
} from './outcome-feedback-types';
import { getResolvedGeminiConfig } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentRunState } from './state-types';
import { UpdatingHandlerResult } from './orchestrator-types';
import { sanitizeWorkingMemory } from './run-persistence';

export * from './outcome-feedback-types';

/**
 * Deterministically evaluates a LearningPlan's execution and verification results
 * into a strongly-typed LearningOutcome and LearningFeedback.
 */
export function evaluateLearningOutcomeDeterministic(
  input: EvaluateOutcomeInput
): LearningOutcomeResult {
  const startTime = Date.now();
  const timestamp = input.timestamp || new Date().toISOString();
  const { plan } = input;
  const planId = plan.planId;
  const userId = plan.userId;
  const decisionId = input.decisionId || (plan.metadata?.decisionId as string | undefined) || null;
  const goalReference = plan.goal;
  const targetSkills: string[] = plan.targetSkill
    ? [plan.targetSkill]
    : Array.isArray(plan.metadata?.targetSkills)
    ? (plan.metadata.targetSkills as string[])
    : [];

  const stepExecutionMap = new Map<string, PlanStepExecutionResult>();
  if (Array.isArray(input.stepExecutionResults)) {
    for (const res of input.stepExecutionResults) {
      stepExecutionMap.set(res.stepId, res);
    }
  }

  const stepVerificationMap = new Map<string, StepVerificationResult>();
  if (Array.isArray(input.stepVerificationResults)) {
    for (const vRes of input.stepVerificationResults) {
      stepVerificationMap.set(vRes.stepId, vRes);
    }
  }

  // 1. Compile per-step outcome summaries and capability failures
  const stepOutcomes: StepOutcomeSummary[] = [];
  const completedSteps: string[] = [];
  const incompleteSteps: string[] = [];
  const blockedSteps: string[] = [];
  const capabilityFailures: CapabilityFailureRecord[] = [];
  const executedToolsSet = new Set<string>();

  const unavailablePlanCaps: string[] = Array.isArray(plan.metadata?.unavailableCapabilities)
    ? (plan.metadata?.unavailableCapabilities as string[])
    : [];

  for (const step of plan.steps) {
    const execRes = stepExecutionMap.get(step.id);
    const verRes = stepVerificationMap.get(step.id);

    // Determine execution status
    const effectiveStatus: PlanStepStatus = execRes
      ? execRes.status === 'SUCCESS'
        ? 'COMPLETED'
        : execRes.status === 'BLOCKED'
        ? 'BLOCKED'
        : 'FAILED'
      : step.status;

    // An action is completed if execution succeeded or step is marked COMPLETED
    const isActionCompleted = effectiveStatus === 'COMPLETED';
    // Learning is verified if empirical verification status is VERIFIED
    const isLearningVerified = verRes?.status === 'VERIFIED';

    if (isActionCompleted) {
      completedSteps.push(step.id);
    } else if (effectiveStatus === 'BLOCKED') {
      blockedSteps.push(step.id);
    } else {
      incompleteSteps.push(step.id);
    }

    // Collect executed tools
    const stepExecutedTools = execRes?.selectedTools || (isActionCompleted && step.requiredTools ? step.requiredTools : []);
    for (const t of stepExecutedTools) {
      executedToolsSet.add(t);
    }

    // Detect capability failures
    if (step.requiredTools) {
      for (const reqTool of step.requiredTools) {
        if (unavailablePlanCaps.includes(reqTool)) {
          capabilityFailures.push({
            stepId: step.id,
            capability: reqTool,
            reason: step.failureReason || `Required tool capability "${reqTool}" is unavailable in the environment.`,
          });
        }
      }
    }

    // Check verification criteria for unsupported capabilities
    if (verRes) {
      for (const crit of verRes.criteriaEvaluations) {
        if (!crit.isCapabilitySupported && crit.missingCapability) {
          if (!capabilityFailures.some((cf) => cf.stepId === step.id && cf.capability === crit.missingCapability)) {
            capabilityFailures.push({
              stepId: step.id,
              capability: crit.missingCapability,
              reason: crit.explanation,
            });
          }
        }
      }
    }

    stepOutcomes.push({
      stepId: step.id,
      order: step.order,
      title: step.title,
      executionStatus: effectiveStatus,
      verificationStatus: verRes?.status || null,
      isActionCompleted,
      isLearningVerified,
      failureReason: execRes?.error?.message || step.failureReason || null,
      requiredTools: step.requiredTools || null,
      executedTools: stepExecutedTools,
    });
  }

  // 2. Compute Action Outcome Summary
  const totalSteps = plan.steps.length;
  const completedStepsCount = completedSteps.length;
  const incompleteStepsCount = incompleteSteps.length;
  const blockedStepsCount = blockedSteps.length;
  const failedStepsCount = stepOutcomes.filter((s) => s.executionStatus === 'FAILED').length;
  const writeResults = input.postWriteVerificationResults || [];
  const writeActionsAttempted = writeResults.length;
  const writeActionsVerified = writeResults.filter((w) => w.status === 'VERIFIED').length;

  let actionSummary = `Action execution: ${completedStepsCount} of ${totalSteps} steps completed.`;
  if (blockedStepsCount > 0) {
    actionSummary += ` ${blockedStepsCount} step(s) blocked by unavailable capabilities or prerequisites.`;
  }
  if (failedStepsCount > 0) {
    actionSummary += ` ${failedStepsCount} step(s) failed execution.`;
  }
  if (writeActionsAttempted > 0) {
    actionSummary += ` ${writeActionsVerified} of ${writeActionsAttempted} write action(s) verified in database.`;
  }

  const actionOutcome: ActionOutcomeSummary = {
    totalSteps,
    completedStepsCount,
    incompleteStepsCount,
    blockedStepsCount,
    failedStepsCount,
    executedTools: Array.from(executedToolsSet),
    writeActionsAttempted,
    writeActionsVerified,
    actionSummary,
  };

  // 3. Compute Plan Completion Status
  let completionStatus: PlanCompletionStatus = 'COMPLETED';
  if (totalSteps === 0) {
    completionStatus = 'COMPLETED';
  } else if (completedStepsCount === totalSteps) {
    completionStatus = 'COMPLETED';
  } else if (blockedStepsCount === totalSteps || (blockedStepsCount > 0 && completedStepsCount === 0)) {
    completionStatus = 'BLOCKED';
  } else if (failedStepsCount > 0 && completedStepsCount === 0) {
    completionStatus = 'FAILED';
  } else {
    completionStatus = 'PARTIALLY_COMPLETED';
  }

  // 4. Aggregate Empirical Evidence, Contradictions, and Evidence Gaps
  const outcomeEvidence: OutcomeEvidence[] = [];
  const contradictions: string[] = [];
  const evidenceGaps: string[] = [];
  const limitations: string[] = [];

  // Carry over contradictions from plan metadata or assessment context
  if (Array.isArray(plan.metadata?.contradictions)) {
    for (const c of plan.metadata.contradictions) {
      if (typeof c === 'string' && !contradictions.includes(c)) {
        contradictions.push(c);
      }
    }
  }

  // Carry over evidence gaps from plan metadata or assessment context
  if (Array.isArray(plan.metadata?.evidenceGaps)) {
    for (const g of plan.metadata.evidenceGaps) {
      if (typeof g === 'string' && !evidenceGaps.includes(g)) {
        evidenceGaps.push(g);
      }
    }
  }

  // Aggregate evidence and findings from StepVerificationResults
  const verificationResults = input.stepVerificationResults || [];
  for (const vRes of verificationResults) {
    for (const c of vRes.contradictingEvidenceSummary) {
      if (!contradictions.includes(c)) contradictions.push(c);
    }
    for (const g of vRes.missingEvidenceSummary) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
    for (const ev of vRes.evaluatedEvidence) {
      if (!outcomeEvidence.some((oe) => oe.evidenceId === ev.id)) {
        outcomeEvidence.push({
          evidenceId: ev.id,
          source: ev.source,
          classification: ev.classification,
          description: ev.description,
          targetSkill: ev.targetSkillName || null,
          observedAt: ev.observedAt,
          isSupporting: ev.polarity === 'SUPPORTS',
          isContradictory: ev.polarity === 'CONTRADICTS',
        });
      }
    }
  }

  // Aggregate additional raw evidence records if provided
  if (Array.isArray(input.evidenceRecords)) {
    for (const ev of input.evidenceRecords) {
      if (!outcomeEvidence.some((oe) => oe.evidenceId === ev.id)) {
        outcomeEvidence.push({
          evidenceId: ev.id,
          source: ev.source,
          classification: ev.classification,
          description: ev.description,
          targetSkill: ev.targetSkillName || null,
          observedAt: ev.observedAt,
          isSupporting: ev.polarity === 'SUPPORTS',
          isContradictory: ev.polarity === 'CONTRADICTS',
        });
      }
    }
  }

  // Record capability failure limitations
  for (const cf of capabilityFailures) {
    limitations.push(`Capability "${cf.capability}" was unavailable during execution of step "${cf.stepId}".`);
  }

  // 5. Determine Epistemic Learning Outcome Status
  // Strict rule: Action completion != Learning success
  let learningOutcomeStatus: LearningOutcomeStatus = 'INSUFFICIENT_EVIDENCE';
  let learningOutcomeVerified = false;
  let overallConfidence = 0.5;

  const hasContradictions = contradictions.length > 0 || verificationResults.some((v) => v.status === 'CONTRADICTED');
  const hasCapabilityBlocker = capabilityFailures.length > 0 || completionStatus === 'BLOCKED' || verificationResults.some((v) => v.status === 'BLOCKED');
  const hasUnsupportedCriteria = verificationResults.some((v) => v.status === 'NOT_VERIFIABLE');
  const allStepsVerified = verificationResults.length > 0 && verificationResults.every((v) => v.status === 'VERIFIED');
  const someStepsVerified = verificationResults.some((v) => v.status === 'VERIFIED' || v.status === 'PARTIALLY_VERIFIED');

  if (hasCapabilityBlocker && completedStepsCount === 0) {
    learningOutcomeStatus = 'BLOCKED';
    learningOutcomeVerified = false;
    overallConfidence = 0.8;
  } else if (hasContradictions) {
    learningOutcomeStatus = 'CONTRADICTED';
    learningOutcomeVerified = false;
    overallConfidence = 0.9; // High confidence that contradiction exists
  } else if (hasUnsupportedCriteria && completedStepsCount === 0) {
    learningOutcomeStatus = 'NOT_VERIFIABLE';
    learningOutcomeVerified = false;
    overallConfidence = 0.85;
  } else if (allStepsVerified && completedStepsCount === totalSteps) {
    // Check if supporting evidence has empirical backing (OBSERVED or EXTERNALLY_VERIFIED)
    const hasEmpiricalProof = outcomeEvidence.some(
      (e) => (e.classification === 'OBSERVED' || e.classification === 'EXTERNALLY_VERIFIED') && e.isSupporting
    );
    if (hasEmpiricalProof) {
      learningOutcomeStatus = 'VERIFIED_SUCCESS';
      learningOutcomeVerified = true;
      overallConfidence = 0.95;
    } else {
      // If evidence was only self-reported or inferred, cannot claim verified learning success
      learningOutcomeStatus = 'INSUFFICIENT_EVIDENCE';
      learningOutcomeVerified = false;
      overallConfidence = 0.5;
    }
  } else if (someStepsVerified || (completedStepsCount > 0 && completedStepsCount < totalSteps)) {
    learningOutcomeStatus = 'PARTIALLY_VERIFIED';
    learningOutcomeVerified = false;
    overallConfidence = 0.65;
  } else if (completedStepsCount === totalSteps && outcomeEvidence.length === 0) {
    // Action completed, but zero empirical telemetry verifying learning improvement
    learningOutcomeStatus = 'INSUFFICIENT_EVIDENCE';
    learningOutcomeVerified = false;
    overallConfidence = 0.4;
  } else if (failedStepsCount > 0) {
    learningOutcomeStatus = 'FAILED';
    learningOutcomeVerified = false;
    overallConfidence = 0.8;
  } else {
    learningOutcomeStatus = 'INSUFFICIENT_EVIDENCE';
    learningOutcomeVerified = false;
    overallConfidence = 0.5;
  }

  // 6. Formulate Outcome Summary & Limitations
  let outcomeSummary = `Plan "${plan.goal}" execution finished with status ${completionStatus}. `;
  if (learningOutcomeStatus === 'VERIFIED_SUCCESS') {
    outcomeSummary += `Empirical learning outcome successfully verified from observable telemetry.`;
  } else if (learningOutcomeStatus === 'PARTIALLY_VERIFIED') {
    outcomeSummary += `Operational actions progressed, but learning outcome is only partially verified due to remaining evidence gaps.`;
  } else if (learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE') {
    outcomeSummary += `Operational action completed, but empirical telemetry confirming learning/proficiency improvement is currently insufficient.`;
  } else if (learningOutcomeStatus === 'CONTRADICTED') {
    outcomeSummary += `Post-execution evidence directly contradicts expected learning outcomes (${contradictions.join('; ')}).`;
  } else if (learningOutcomeStatus === 'BLOCKED') {
    outcomeSummary += `Plan was blocked because required environment capabilities are unavailable (${capabilityFailures.map((c) => c.capability).join(', ')}).`;
  } else if (learningOutcomeStatus === 'NOT_VERIFIABLE') {
    outcomeSummary += `Learning outcome is not verifiable because required diagnostic/scoring capabilities are unsupported in the application.`;
  } else {
    outcomeSummary += `Plan execution failed before learning outcomes could be established.`;
  }

  if (writeActionsVerified > 0) {
    outcomeSummary += ` Note: ${writeActionsVerified} task write(s) were successfully created and verified in the database.`;
  }

  // 7. Construct Strongly-Typed LearningOutcome
  const outcomeId = `outcome_${planId}_${Date.now()}`;
  const outcome: LearningOutcome = {
    outcomeId,
    userId,
    planId,
    decisionId,
    goalReference,
    targetSkills,
    planStatus: plan.status,
    completionStatus,
    completedSteps,
    incompleteSteps,
    blockedSteps,
    stepOutcomes,
    verificationResults,
    actionOutcome,
    learningOutcomeStatus,
    learningOutcomeVerified,
    evidence: outcomeEvidence,
    contradictions,
    evidenceGaps,
    capabilityFailures,
    writeResults: writeResults.length > 0 ? writeResults : undefined,
    confidence: overallConfidence,
    outcomeSummary,
    limitations,
    source: 'DETERMINISTIC',
    createdAt: timestamp,
    metadata: input.metadata,
  };

  // 8. Generate Structured LearningFeedback for future assessment passes
  const feedback = generateLearningFeedback(outcome);

  const evaluationTimeMs = Date.now() - startTime;
  return {
    outcome,
    feedback,
    source: 'DETERMINISTIC',
    evaluationTimeMs,
  };
}

/**
 * Generates structured LearningFeedback from an evaluated LearningOutcome.
 * Strictly separates observational feedback from future decision-making.
 */
export function generateLearningFeedback(outcome: LearningOutcome): LearningFeedback {
  const verifiedActions: string[] = [];
  for (const step of outcome.stepOutcomes) {
    if (step.isActionCompleted) {
      verifiedActions.push(`Action "${step.title}" completed (Step ID: ${step.stepId})`);
    }
  }
  if (outcome.actionOutcome.writeActionsVerified > 0) {
    verifiedActions.push(`${outcome.actionOutcome.writeActionsVerified} database task write(s) verified via post-write read-back.`);
  }

  const unresolvedObjectives: string[] = [];
  if (!outcome.learningOutcomeVerified) {
    unresolvedObjectives.push(`Empirical verification of learning outcome for "${outcome.goalReference}" remains unfulfilled (status: ${outcome.learningOutcomeStatus}).`);
  }
  for (const step of outcome.stepOutcomes) {
    if (!step.isActionCompleted) {
      unresolvedObjectives.push(`Step "${step.title}" was not completed (${step.executionStatus}).`);
    }
  }

  const capabilityLimitations = Array.from(new Set(outcome.capabilityFailures.map((cf) => cf.capability)));

  let feedbackSummary = `Feedback for plan ${outcome.planId}: Status is ${outcome.learningOutcomeStatus}. `;
  if (outcome.learningOutcomeVerified) {
    feedbackSummary += `Learning objectives were empirically corroborated with positive supporting evidence.`;
  } else if (outcome.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE') {
    feedbackSummary += `Activity occurred, but ground-truth telemetry has not yet proven skill calibration change.`;
  } else if (outcome.learningOutcomeStatus === 'CONTRADICTED') {
    feedbackSummary += `Contradictory evidence observed; recommended focus for next assessment is mistake review or prerequisite reinforcement.`;
  } else if (outcome.learningOutcomeStatus === 'BLOCKED') {
    feedbackSummary += `Blocked by missing tool capabilities: ${capabilityLimitations.join(', ')}.`;
  } else {
    feedbackSummary += outcome.outcomeSummary;
  }

  return {
    feedbackId: `feedback_${outcome.outcomeId}`,
    userId: outcome.userId,
    planId: outcome.planId,
    decisionId: outcome.decisionId,
    outcomeStatus: outcome.learningOutcomeStatus,
    verifiedActions,
    unresolvedObjectives,
    newlyObservedEvidence: outcome.evidence,
    evidenceGaps: outcome.evidenceGaps,
    contradictions: outcome.contradictions,
    capabilityLimitations,
    learningOutcomeConfidence: outcome.confidence,
    feedbackSummary,
    createdAt: outcome.createdAt,
    metadata: outcome.metadata,
  };
}

/**
 * Evaluates LearningOutcome with optional Gemini LLM narrative augmentation.
 * 
 * Strict Safety Invariant:
 * Deterministic outcome status, verification criteria, and evidence classifications
 * are authoritative. Gemini may ONLY augment human-readable narrative text.
 */
export async function evaluateLearningOutcomeAsync(
  input: EvaluateOutcomeInput,
  llmClient?: FeedbackLlmClient | null
): Promise<LearningOutcomeResult> {
  // 1. Run authoritative deterministic evaluation first
  const deterministicResult = evaluateLearningOutcomeDeterministic(input);

  if (input.allowLlm === false) {
    return deterministicResult;
  }

  // 2. Attempt LLM narrative summarization
  try {
    let client: FeedbackLlmClient | null = llmClient || null;

    if (!client) {
      try {
        const config = await getResolvedGeminiConfig();
        if (config.apiKey) {
          const genAI = new GoogleGenerativeAI(config.apiKey);
          const model = genAI.getGenerativeModel({ model: config.modelName || 'gemini-1.5-pro' });
          client = {
            generateContent: async (prompt: string) => {
              const res = await model.generateContent(prompt);
              return { text: res.response.text() };
            },
          };
        }
      } catch {
        // No Gemini API key configured -> proceed with deterministic evaluation
        return deterministicResult;
      }
    }

    if (!client) {
      return deterministicResult;
    }

    const deterministicOutcome = deterministicResult.outcome;
    const deterministicFeedback = deterministicResult.feedback;

    const prompt = `You are the Outcome & Feedback Evaluator in a Personal Learning OS.
Summarize the factual execution results and learning feedback for the student.

FACTUAL EXECUTION DATA:
- Goal: "${deterministicOutcome.goalReference}"
- Plan Completion Status: ${deterministicOutcome.completionStatus}
- Learning Outcome Status: ${deterministicOutcome.learningOutcomeStatus}
- Learning Outcome Verified: ${deterministicOutcome.learningOutcomeVerified}
- Completed Steps: ${deterministicOutcome.completedSteps.length} of ${deterministicOutcome.stepOutcomes.length}
- Blocked Steps: ${deterministicOutcome.blockedSteps.length}
- Contradictions: ${JSON.stringify(deterministicOutcome.contradictions)}
- Evidence Gaps: ${JSON.stringify(deterministicOutcome.evidenceGaps)}
- Missing Capabilities: ${JSON.stringify(deterministicFeedback.capabilityLimitations)}
- Write Actions Verified: ${deterministicOutcome.actionOutcome.writeActionsVerified}

RULES:
1. Do NOT invent learning improvement if Learning Outcome Verified is false.
2. Clearly separate what actions the student did from what learning was actually verified.
3. If evidence is missing, state that evidence is missing without calling it a failure.
4. If capability was missing, state the capability was unavailable.
5. Provide a JSON object with exactly two keys: "outcomeSummary" (string) and "feedbackSummary" (string).`;

    const response = await client.generateContent(prompt);
    let rawText = '';
    if (typeof response.text === 'function') {
      rawText = response.text();
    } else if (typeof response.text === 'string') {
      rawText = response.text;
    }

    if (!rawText || rawText.trim() === '') {
      return deterministicResult;
    }

    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return deterministicResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.outcomeSummary === 'string' && typeof parsed.feedbackSummary === 'string') {
      // Augment ONLY the human-readable summary fields; ALL status/evidence fields remain strictly deterministic
      const augmentedOutcome: LearningOutcome = {
        ...deterministicOutcome,
        outcomeSummary: parsed.outcomeSummary.trim() || deterministicOutcome.outcomeSummary,
        source: 'GEMINI_AUGMENTED',
      };

      const augmentedFeedback: LearningFeedback = {
        ...deterministicFeedback,
        feedbackSummary: parsed.feedbackSummary.trim() || deterministicFeedback.feedbackSummary,
      };

      return {
        outcome: augmentedOutcome,
        feedback: augmentedFeedback,
        source: 'GEMINI_AUGMENTED',
        evaluationTimeMs: deterministicResult.evaluationTimeMs,
      };
    }

    return deterministicResult;
  } catch {
    // Fail-safe: Always return deterministic result on any LLM or network failure
    return deterministicResult;
  }
}

/**
 * Creates an onUpdating handler for the SINGLE Learning Orchestrator Agent loop
 * that integrates Phase 6E Outcome & Feedback evaluation.
 */
export function createOutcomeFeedbackHandler(options?: {
  geminiClient?: FeedbackLlmClient | null;
  allowLlm?: boolean;
  timestamp?: string;
}) {
  return async function onUpdating(state: AgentRunState): Promise<UpdatingHandlerResult> {
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const stepVerification = memory.stepVerification as StepVerificationResult | undefined;
    const postWriteResult = memory.postWriteResult as PostWriteVerificationResult | undefined;

    if (!plan) {
      return {
        hasMoreSteps: false,
        nextState: 'COMPLETED',
        reason: 'Updating telemetry completed (no active plan).',
      };
    }

    const verificationResults: StepVerificationResult[] = stepVerification ? [stepVerification] : [];
    const postWriteResults: PostWriteVerificationResult[] = postWriteResult ? [postWriteResult] : [];

    const evalResult = await evaluateLearningOutcomeAsync(
      {
        plan,
        decisionId: (memory.decisionId as string) || (plan.metadata?.decisionId as string) || null,
        stepVerificationResults: verificationResults,
        postWriteVerificationResults: postWriteResults,
        allowLlm: options?.allowLlm ?? false,
        timestamp: options?.timestamp,
      },
      options?.geminiClient
    );

    const sanitizedUpdate = sanitizeWorkingMemory({
      ...memory,
      learningOutcome: evalResult.outcome,
      learningFeedback: evalResult.feedback,
    });

    return {
      hasMoreSteps: false,
      nextState: 'COMPLETED',
      reason: `Outcome evaluated (${evalResult.outcome.learningOutcomeStatus}); advancing to COMPLETED.`,
      workingMemory: sanitizedUpdate,
    };
  };
}
