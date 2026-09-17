/**
 * Phase 6G: Adaptive Learning Policy & Orchestrator Adaptation Engine
 * 
 * Implements deterministic policy evaluation for the SINGLE Learning Orchestrator,
 * synthesizing signals from assessments (6B), decisions (6C), plans (6D), outcomes (6E),
 * and longitudinal trajectories (6F) into actionable policy guidance for future orchestration.
 * 
 * Core Guarantees:
 * 1. Strictly Observational: Never replaces 6C decision selection or forces execution.
 * 2. Deterministic-First: Identical inputs produce identical adaptation signals and recommendations.
 * 3. Zero Fabrication: Does not invent learning outcomes, historical trends, or scores.
 * 4. Epistemic Grounding: Preserves Phase 1 classifications, contradictions, and evidence gaps.
 * 5. Zero Psychological Inference: Strictly describes observable telemetry and outcomes.
 * 6. Strictly READ-ONLY: Pure in-memory calculation; zero database writes or skill calibrations.
 */

import {
  AdaptiveLearningPolicy,
  AdaptationSignal,
  AdaptationRecommendation,
  AdaptationSignalType,
  EvaluateAdaptationInput,
  AdaptivePolicyResult,
  AdaptivePolicyLlmClient,
  DecisionContextWithAdaptation,
} from './adaptation-types';
import {
  AgentRunState,
  AgentState,
} from './state-types';
import {
  sanitizeWorkingMemory,
} from './run-persistence';
import {
  UpdatingHandlerResult,
} from './orchestrator-types';
import {
  LearningPlan,
} from './planning-types';
import {
  LearningOutcome,
  LearningFeedback,
} from './outcome-feedback-types';
import {
  LearningTrajectory,
} from './trajectory-types';
import {
  getResolvedGeminiConfig,
} from '@/lib/ai/gemini';
import {
  GoogleGenerativeAI,
} from '@google/generative-ai';

export * from './adaptation-types';

/**
 * Pure deterministic evaluation of AdaptiveLearningPolicy based on empirical inputs.
 */
export function evaluateAdaptiveLearningPolicyDeterministic(
  input: EvaluateAdaptationInput
): AdaptivePolicyResult {
  const startTime = Date.now();
  const timestamp = input.timestamp || new Date().toISOString();
  const userId = input.userId;

  const goalUnderstanding = input.goalUnderstanding;
  const studentAssessment = input.studentAssessment;
  const previousDecision = input.previousDecision;
  const executedPlan = input.executedPlan;
  const learningOutcome = input.learningOutcome;
  const learningFeedback = input.learningFeedback;
  const learningTrajectory = input.learningTrajectory;
  const rawEvidence = input.evidenceRecords || [];
  const rawMistakes = input.mistakes || [];

  const targetSkills: string[] = [];
  if (goalUnderstanding?.targetSkill) {
    targetSkills.push(goalUnderstanding.targetSkill);
  }
  if (goalUnderstanding?.extractedSignals) {
    for (const sig of goalUnderstanding.extractedSignals) {
      if (sig.dimension === 'TARGET_SKILL' && sig.value && !targetSkills.includes(sig.value)) {
        targetSkills.push(sig.value);
      }
    }
  }
  if (studentAssessment?.targetSkills) {
    for (const s of studentAssessment.targetSkills) {
      if (!targetSkills.includes(s)) targetSkills.push(s);
    }
  }
  if (previousDecision?.targetSkills) {
    for (const s of previousDecision.targetSkills) {
      if (!targetSkills.includes(s)) targetSkills.push(s);
    }
  }
  if (learningOutcome?.targetSkills) {
    for (const s of learningOutcome.targetSkills) {
      if (!targetSkills.includes(s)) targetSkills.push(s);
    }
  }
  if (executedPlan?.targetSkill) {
    if (!targetSkills.includes(executedPlan.targetSkill)) targetSkills.push(executedPlan.targetSkill);
  }
  if (executedPlan?.steps) {
    for (const step of executedPlan.steps) {
      if (step.targetSkill && !targetSkills.includes(step.targetSkill)) {
        targetSkills.push(step.targetSkill);
      }
    }
  }
  if (targetSkills.length === 0) {
    targetSkills.push('General');
  }

  const signals: AdaptationSignal[] = [];
  const recommendations: AdaptationRecommendation[] = [];
  const limitations: string[] = [];
  const evidenceBasis: string[] = [];
  const trajectoryBasis: string[] = [];
  const feedbackBasis: string[] = [];
  const contradictions: string[] = [];
  const evidenceGaps: string[] = [];

  // Aggregate evidence basis
  if (learningOutcome?.evidence) {
    for (const ev of learningOutcome.evidence) {
      evidenceBasis.push(`${ev.source}:${ev.classification} - ${ev.description}`);
    }
  }
  if (studentAssessment?.skillAssessments) {
    for (const sa of studentAssessment.skillAssessments) {
      for (const ev of sa.supportingEvidence) {
        evidenceBasis.push(ev);
      }
    }
  }

  // Aggregate contradictions
  if (studentAssessment?.contradictedAreas) {
    for (const c of studentAssessment.contradictedAreas) {
      if (!contradictions.includes(c)) contradictions.push(`Contradicted skill: ${c}`);
    }
  }
  if (previousDecision?.contradictions) {
    for (const c of previousDecision.contradictions) {
      if (!contradictions.includes(c)) contradictions.push(c);
    }
  }
  if (learningOutcome?.contradictions) {
    for (const c of learningOutcome.contradictions) {
      if (!contradictions.includes(c)) contradictions.push(c);
    }
  }
  if (learningTrajectory?.contradictionTrajectory?.unresolvedContradictions) {
    for (const c of learningTrajectory.contradictionTrajectory.unresolvedContradictions) {
      if (!contradictions.includes(c)) contradictions.push(c);
    }
  }

  // Aggregate evidence gaps
  if (studentAssessment?.evidenceGaps) {
    for (const g of studentAssessment.evidenceGaps) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
  }
  if (previousDecision?.evidenceGaps) {
    for (const g of previousDecision.evidenceGaps) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
  }
  if (learningOutcome?.evidenceGaps) {
    for (const g of learningOutcome.evidenceGaps) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
  }
  if (learningFeedback?.evidenceGaps) {
    for (const g of learningFeedback.evidenceGaps) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
  }
  if (learningTrajectory?.unresolvedEvidenceGaps) {
    for (const g of learningTrajectory.unresolvedEvidenceGaps) {
      if (!evidenceGaps.includes(g)) evidenceGaps.push(g);
    }
  }

  // Aggregate trajectory basis
  if (learningTrajectory?.signals) {
    for (const s of learningTrajectory.signals) {
      trajectoryBasis.push(s.description);
    }
  }

  // Aggregate feedback basis
  if (learningFeedback?.feedbackSummary) {
    feedbackBasis.push(learningFeedback.feedbackSummary);
  }
  if (learningFeedback?.unresolvedObjectives && learningFeedback.unresolvedObjectives.length > 0) {
    feedbackBasis.push(`Unresolved objectives: ${learningFeedback.unresolvedObjectives.join(', ')}`);
  }

  // Check history sufficiency
  const historySufficiency = learningTrajectory?.historySufficiency || 'NONE';
  const isHistorySparse = historySufficiency === 'NONE' || historySufficiency === 'INSUFFICIENT';
  const isHistoryLimited = historySufficiency === 'LIMITED';

  let requiresMoreEvidence = false;
  let humanReviewRequired = false;

  // -------------------------------------------------------------
  // RULE 1: Verified Empirical Success Preservation
  // -------------------------------------------------------------
  const isOutcomeVerifiedSuccess = learningOutcome?.learningOutcomeStatus === 'VERIFIED_SUCCESS';
  const hasStrongOrSufficientHistory = historySufficiency === 'SUFFICIENT' || historySufficiency === 'STRONG';
  
  if (isOutcomeVerifiedSuccess && (hasStrongOrSufficientHistory || learningOutcome?.learningOutcomeVerified === true)) {
    const sig: AdaptationSignal = {
      signalId: `sig_pres_${Date.now()}`,
      type: 'PRESERVE_SUCCESSFUL_PATTERN',
      reason: 'Empirical telemetry directly confirmed verified learning success under the active plan and instructional pacing.',
      targetSkillName: targetSkills[0],
      confidence: 0.9,
      evidenceBasis: learningOutcome?.evidence?.map((e) => e.evidenceId) || (learningOutcome ? [learningOutcome.outcomeId] : []),
      limitations: [],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_pres_${Date.now()}`,
      focusArea: targetSkills[0] || 'Core',
      suggestedAdjustment: 'Maintain current instructional granularity, practice cadence, and verified difficulty tier.',
      pedagogicalRationale: 'Observable empirical evidence demonstrates successful comprehension and execution.',
      sourceSignals: ['PRESERVE_SUCCESSFUL_PATTERN'],
    });
  }

  // -------------------------------------------------------------
  // RULE 2: Review Focus on Persistent Mistakes / Errors
  // -------------------------------------------------------------
  const hasPersistentMistakes = learningTrajectory?.mistakeTrajectory?.pattern === 'PERSISTENT_MISTAKE_PATTERN';
  const hasContradictedOutcome = learningOutcome?.learningOutcomeStatus === 'CONTRADICTED';
  const hasMultipleMistakes = rawMistakes.length >= 2;

  if (hasPersistentMistakes || hasContradictedOutcome || hasMultipleMistakes) {
    const sig: AdaptationSignal = {
      signalId: `sig_rev_${Date.now()}`,
      type: 'INCREASE_REVIEW_FOCUS',
      reason: 'Persistent mistakes or contradictory performance observed across recent practice sessions.',
      targetSkillName: targetSkills[0],
      confidence: 0.85,
      evidenceBasis: rawMistakes.map((m) => m.id),
      limitations: [],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_rev_${Date.now()}`,
      focusArea: 'Mistake Analysis',
      suggestedAdjustment: 'Prioritize error review, root-cause reflection, and targeted problem sets resolving recurring mistakes before advancing.',
      pedagogicalRationale: 'Recurring mistakes indicate unaddressed conceptual edge cases or syntax patterns.',
      sourceSignals: ['INCREASE_REVIEW_FOCUS'],
    });
  }

  // -------------------------------------------------------------
  // RULE 3: Scope Narrowing on Multi-Skill Friction / Blockages
  // -------------------------------------------------------------
  const isPlanBlockedOrPartial = executedPlan?.status === 'BLOCKED' || learningOutcome?.learningOutcomeStatus === 'BLOCKED' || learningOutcome?.learningOutcomeStatus === 'PARTIALLY_VERIFIED';
  if (isPlanBlockedOrPartial && targetSkills.length > 1) {
    const sig: AdaptationSignal = {
      signalId: `sig_narrow_${Date.now()}`,
      type: 'NARROW_LEARNING_SCOPE',
      reason: 'Multi-skill learning plan encountered execution friction or incomplete step verification.',
      targetSkillName: targetSkills[0],
      confidence: 0.8,
      evidenceBasis: [],
      limitations: ['Multi-skill goal decomposed to single focus area.'],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_narrow_${Date.now()}`,
      focusArea: targetSkills[0],
      suggestedAdjustment: `Narrow upcoming learning scope strictly to ${targetSkills[0]} before addressing secondary skills (${targetSkills.slice(1).join(', ')}).`,
      pedagogicalRationale: 'Focused single-concept practice reduces cognitive overhead and isolating execution blockers.',
      sourceSignals: ['NARROW_LEARNING_SCOPE'],
    });
  }

  // -------------------------------------------------------------
  // RULE 4: Plan Granularity Increase on Execution Blockage
  // -------------------------------------------------------------
  if (executedPlan?.status === 'BLOCKED' || executedPlan?.status === 'FAILED' || learningOutcome?.learningOutcomeStatus === 'PARTIALLY_VERIFIED') {
    const sig: AdaptationSignal = {
      signalId: `sig_gran_${Date.now()}`,
      type: 'INCREASE_PLAN_GRANULARITY',
      reason: 'Previous plan had unexecuted, partially completed, or blocked steps.',
      confidence: 0.8,
      evidenceBasis: executedPlan ? [executedPlan.planId] : [],
      limitations: [],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_gran_${Date.now()}`,
      focusArea: 'Planning Structure',
      suggestedAdjustment: 'Construct smaller, atomic plan steps with explicit read-only verification boundaries.',
      pedagogicalRationale: 'Fine-grained steps facilitate incremental progress and prompt blockage detection.',
      sourceSignals: ['INCREASE_PLAN_GRANULARITY'],
    });
  }

  // -------------------------------------------------------------
  // RULE 5: Practice Focus on Developing Proficiency
  // -------------------------------------------------------------
  const isDevelopingProficiency = studentAssessment?.skillAssessments?.some(
    (s) => s.confidenceLevel === 'MODERATE' || s.confidenceLevel === 'LOW'
  ) || (studentAssessment?.developingAreas && studentAssessment.developingAreas.length > 0);
  if (isDevelopingProficiency && !isOutcomeVerifiedSuccess && !hasPersistentMistakes) {
    const sig: AdaptationSignal = {
      signalId: `sig_prac_${Date.now()}`,
      type: 'INCREASE_PRACTICE_FOCUS',
      reason: 'Student skill assessment indicates developing proficiency requiring hands-on problem-solving exercises.',
      targetSkillName: targetSkills[0],
      confidence: 0.75,
      evidenceBasis: [],
      limitations: [],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_prac_${Date.now()}`,
      focusArea: targetSkills[0],
      suggestedAdjustment: 'Focus future cycles on active practice tasks, coding exercises, or problem submissions.',
      pedagogicalRationale: 'Developing skills benefit from repeated application under varying conditions.',
      sourceSignals: ['INCREASE_PRACTICE_FOCUS'],
    });
  }

  // -------------------------------------------------------------
  // RULE 6: Reassess Before Escalation on Active Contradictions
  // -------------------------------------------------------------
  if (contradictions.length > 0) {
    const sig: AdaptationSignal = {
      signalId: `sig_reassess_${Date.now()}`,
      type: 'REASSESS_BEFORE_ESCALATION',
      reason: `Empirical contradictions remain unresolved: ${contradictions.join('; ')}.`,
      confidence: 0.85,
      evidenceBasis: [],
      limitations: ['Contradiction between self-reported claim and empirical telemetry.'],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_reassess_${Date.now()}`,
      focusArea: 'Skill Calibration',
      suggestedAdjustment: 'Perform a baseline diagnostic or direct observation before increasing curriculum difficulty.',
      pedagogicalRationale: 'Resolving epistemic contradictions prevents miscalibrated planning expectations.',
      sourceSignals: ['REASSESS_BEFORE_ESCALATION'],
    });
    humanReviewRequired = true;
  }

  // -------------------------------------------------------------
  // RULE 7: Stale Evidence Refresh
  // -------------------------------------------------------------
  const hasStaleEvidenceSignal = learningTrajectory?.signals?.some(
    (s) => s.type === 'STALE_EVIDENCE'
  );
  const hasStaleSkillTrajectory = learningTrajectory?.skillTrajectories?.some(
    (s) => s.retentionStatus === 'STALE' || s.retentionStatus === 'POSSIBLE_DECAY'
  );
  if (hasStaleEvidenceSignal || hasStaleSkillTrajectory) {
    const sig: AdaptationSignal = {
      signalId: `sig_stale_${Date.now()}`,
      type: 'REFRESH_STALE_EVIDENCE',
      reason: 'Primary supporting evidence for target skills is older than 90 days without recent corroborating telemetry.',
      confidence: 0.85,
      evidenceBasis: [],
      limitations: [],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_stale_${Date.now()}`,
      focusArea: 'Evidence Freshness',
      suggestedAdjustment: 'Collect fresh observable telemetry (e.g. recent repository commits or coding submissions) to update baseline confidence.',
      pedagogicalRationale: 'Evidence freshness ensures calibration aligns with current student capabilities.',
      sourceSignals: ['REFRESH_STALE_EVIDENCE'],
    });
  }

  // -------------------------------------------------------------
  // RULE 8: Request More Evidence on Sparse / Unverified Telemetry
  // -------------------------------------------------------------
  const isOutcomeInsufficientEvidence = learningOutcome?.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE';
  if (isHistorySparse || isOutcomeInsufficientEvidence) {
    requiresMoreEvidence = true;
    const sig: AdaptationSignal = {
      signalId: `sig_req_ev_${Date.now()}`,
      type: 'REQUEST_MORE_EVIDENCE',
      reason: 'Telemetry is sparse, unverified, or self-reported only; longitudinal history is insufficient to support aggressive adaptation.',
      confidence: 0.9,
      evidenceBasis: [],
      limitations: ['Insufficient longitudinal records (< 2 distinct observation days).'],
    };
    signals.push(sig);
    recommendations.push({
      recommendationId: `rec_req_ev_${Date.now()}`,
      focusArea: 'Evidence Gathering',
      suggestedAdjustment: 'Incorporate observable practice steps with verifiable outputs before escalating plan complexity.',
      pedagogicalRationale: 'Ground-truth evidence collection is prerequisite to high-confidence curriculum adaptation.',
      sourceSignals: ['REQUEST_MORE_EVIDENCE'],
    });
  }

  // -------------------------------------------------------------
  // RULE 9: Reduce Adaptation Confidence on Limited History
  // -------------------------------------------------------------
  if (isHistoryLimited) {
    signals.push({
      signalId: `sig_red_conf_${Date.now()}`,
      type: 'REDUCE_ADAPTATION_CONFIDENCE',
      reason: 'Longitudinal history spans a limited timeframe (< 7 days or < 3 distinct days); policy recommendations are preliminary.',
      confidence: 0.8,
      evidenceBasis: [],
      limitations: ['Limited temporal observation window.'],
    });
  }

  // -------------------------------------------------------------
  // RULE 10: Continue Current Approach (Fallback when stable)
  // -------------------------------------------------------------
  if (signals.length === 0) {
    signals.push({
      signalId: `sig_cont_${Date.now()}`,
      type: 'CONTINUE_CURRENT_APPROACH',
      reason: 'Current telemetry and execution outcomes exhibit stable, balanced progress without requiring policy shift.',
      confidence: 0.75,
      evidenceBasis: [],
      limitations: [],
    });
    recommendations.push({
      recommendationId: `rec_cont_${Date.now()}`,
      focusArea: 'General',
      suggestedAdjustment: 'Maintain existing curriculum pacing and active learning strategy.',
      pedagogicalRationale: 'Telemetry shows consistent progress without notable failure modes.',
      sourceSignals: ['CONTINUE_CURRENT_APPROACH'],
    });
  }

  // -------------------------------------------------------------
  // Limitations Compilation
  // -------------------------------------------------------------
  if (isHistorySparse) {
    limitations.push('History sufficiency is INSUFFICIENT; adaptations are constrained to conservative evidence-gathering.');
  } else if (isHistoryLimited) {
    limitations.push('History sufficiency is LIMITED; policy adjustments represent preliminary heuristics.');
  }
  if (contradictions.length > 0) {
    limitations.push(`${contradictions.length} active contradiction(s) require diagnostic verification.`);
  }
  if (evidenceGaps.length > 0) {
    limitations.push(`${evidenceGaps.length} evidence gap(s) identified.`);
  }
  limitations.push('Adaptive learning policy provides observational guidance and does not replace Phase 6C decision selection or Phase 5 write safety.');

  // Calculate Overall Observational Confidence
  let overallConfidence = 0.5;
  if (historySufficiency === 'STRONG' && !requiresMoreEvidence) {
    overallConfidence = 0.85;
  } else if (historySufficiency === 'SUFFICIENT' && !requiresMoreEvidence) {
    overallConfidence = 0.75;
  } else if (isHistoryLimited) {
    overallConfidence = 0.6;
  } else {
    overallConfidence = 0.4;
  }

  const policyId = `policy_${userId}_${Date.now()}`;
  const policy: AdaptiveLearningPolicy = {
    policyId,
    userId,
    goalReference: goalUnderstanding?.objective || goalUnderstanding?.originalGoal || previousDecision?.goalReference || null,
    sourceDecisionId: previousDecision?.decisionId || null,
    sourcePlanId: executedPlan?.planId || null,
    sourceOutcomeId: learningOutcome?.outcomeId || null,
    targetSkills,
    adaptationSignals: signals,
    adaptationRecommendations: recommendations,
    evidenceBasis,
    trajectoryBasis,
    feedbackBasis,
    contradictions,
    evidenceGaps,
    confidence: overallConfidence,
    requiresMoreEvidence,
    humanReviewRequired,
    source: 'DETERMINISTIC',
    limitations,
    createdAt: timestamp,
    metadata: input.metadata,
  };

  const evaluationTimeMs = Date.now() - startTime;
  return {
    policy,
    source: 'DETERMINISTIC',
    evaluationTimeMs,
  };
}

/**
 * Pure helper function to apply AdaptiveLearningPolicy to a future DecisionContext container.
 * 
 * Guarantees:
 * 1. Strictly additive context: Does NOT overwrite 6C decision rules or mutate student proficiencies.
 * 2. 6C remains the sole decision authority.
 */
export function applyAdaptivePolicyToDecisionContext(
  context: DecisionContextWithAdaptation,
  policy: AdaptiveLearningPolicy | null
): DecisionContextWithAdaptation {
  return {
    ...context,
    adaptiveLearningPolicy: policy,
  };
}

/**
 * Evaluates AdaptiveLearningPolicy with optional Gemini LLM narrative augmentation.
 * 
 * Safety Invariant:
 * Deterministic signals, recommendations, and limitations are authoritative.
 * Gemini may ONLY provide human-readable explanations.
 */
export async function evaluateAdaptiveLearningPolicyAsync(
  input: EvaluateAdaptationInput,
  llmClient?: AdaptivePolicyLlmClient | null
): Promise<AdaptivePolicyResult> {
  const deterministicResult = evaluateAdaptiveLearningPolicyDeterministic(input);

  if (input.allowLlm === false) {
    return deterministicResult;
  }

  try {
    let client: AdaptivePolicyLlmClient | null = llmClient || null;

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
        return deterministicResult;
      }
    }

    if (!client) {
      return deterministicResult;
    }

    const p = deterministicResult.policy;
    const prompt = `You are the Adaptive Learning Policy reasoning component in a Personal Learning OS.
Explain the pedagogical rationale and adaptation posture for the student based on factual signals.

FACTUAL ADAPTATION SIGNALS:
- Target Skills: ${p.targetSkills.join(', ')}
- Signals: ${JSON.stringify(p.adaptationSignals.map((s) => ({ type: s.type, reason: s.reason })))}
- Recommendations: ${JSON.stringify(p.adaptationRecommendations.map((r) => r.suggestedAdjustment))}
- Contradictions: ${JSON.stringify(p.contradictions)}
- Requires More Evidence: ${p.requiresMoreEvidence}

RULES:
1. Do NOT invent new signals, actions, or historical facts.
2. Do NOT make psychological or personality inferences (no claims about motivation, discipline, laziness).
3. Do NOT make statistical or predictive claims.
4. Output a JSON object with a single string key: "narrativeRationale".`;

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

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return deterministicResult;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.narrativeRationale === 'string' && parsed.narrativeRationale.trim() !== '') {
      const augmentedPolicy: AdaptiveLearningPolicy = {
        ...p,
        source: 'GEMINI_AUGMENTED',
        metadata: {
          ...p.metadata,
          narrativeRationale: parsed.narrativeRationale.trim(),
        },
      };
      return {
        policy: augmentedPolicy,
        source: 'GEMINI_AUGMENTED',
        evaluationTimeMs: deterministicResult.evaluationTimeMs,
      };
    }

    return deterministicResult;
  } catch {
    return deterministicResult;
  }
}

/**
 * Creates an onUpdating handler integrating Phase 6G Adaptive Learning Policy
 * into the SINGLE Learning Orchestrator lifecycle.
 */
export function createAdaptationPolicyHandler(options?: {
  geminiClient?: AdaptivePolicyLlmClient | null;
  allowLlm?: boolean;
  timestamp?: string;
}) {
  return async function onUpdating(state: AgentRunState): Promise<UpdatingHandlerResult> {
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const learningOutcome = memory.learningOutcome as LearningOutcome | undefined;
    const learningFeedback = memory.learningFeedback as LearningFeedback | undefined;
    const learningTrajectory = memory.learningTrajectory as LearningTrajectory | undefined;

    const policyResult = await evaluateAdaptiveLearningPolicyAsync(
      {
        userId: state.userId,
        executedPlan: plan,
        learningOutcome,
        learningFeedback,
        learningTrajectory,
        evidenceRecords: state.evidenceContext.collection?.records || [],
        allowLlm: options?.allowLlm ?? false,
        timestamp: options?.timestamp,
      },
      options?.geminiClient
    );

    const sanitizedUpdate = sanitizeWorkingMemory({
      ...memory,
      adaptiveLearningPolicy: policyResult.policy,
    });

    return {
      hasMoreSteps: false,
      nextState: 'COMPLETED',
      reason: `Adaptive learning policy evaluated (${policyResult.policy.adaptationSignals.length} signals); advancing to COMPLETED.`,
      workingMemory: sanitizedUpdate,
    };
  };
}
