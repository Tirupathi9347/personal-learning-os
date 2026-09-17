/**
 * Phase 6C: Decision & Action Selection Engine
 * 
 * Implements deterministic-first, LLM-assisted decision and action selection
 * for the SINGLE Learning Orchestrator.
 * 
 * Answers: "Given what the student wants AND what the evidence says about their current situation,
 * what should the orchestrator do next?"
 * 
 * Rules:
 * 1. Strictly READ-ONLY: Produces a structured decision, zero database mutations, zero write tool executions.
 * 2. Deterministic-first: Ground-truth evidence (Phase 1), Goal Understanding (Phase 6A), and Assessment (Phase 6B) are authoritative.
 * 3. Gemini is an optional reasoning utility inside the orchestrator; fail-safe fallback is guaranteed.
 * 4. Missing evidence is uncertainty, NOT weakness.
 * 5. Contradictions are preserved without guessing or silent overrides.
 * 6. Observable behaviors only; psychological/personality inferences are strictly rejected.
 */

import {
  DecisionType,
  DecisionPriority,
  DecisionConfidence,
  LearningDecision,
  GenerateDecisionInput,
  DecisionLlmClient,
} from './decision-types';
import { GoalUnderstanding } from './goal-understanding-types';
import { StudentLearningAssessment, SkillLearningAssessment } from './assessment-types';
import { getResolvedGeminiConfig } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';

export * from './decision-types';

/**
 * Standard tool capabilities available in the environment by default.
 */
export const DEFAULT_AVAILABLE_CAPABILITIES: string[] = [
  'get_student_profile',
  'get_tasks',
  'get_skills',
  'get_projects',
  'get_mistakes',
  'get_time_sessions',
  'get_github_activity',
  'get_leetcode_activity',
  'create_task',
];

/**
 * Primary entry point: Generate an evidence-grounded Learning Decision.
 */
export async function generateLearningDecision(
  input: GenerateDecisionInput
): Promise<LearningDecision> {
  const deterministicDecision = generateLearningDecisionDeterministic(input);

  // If LLM assistance is disabled, return deterministic decision directly
  if (input.allowLlm === false) {
    return deterministicDecision;
  }

  // If clarification is required, return deterministic CLARIFY_GOAL directly to protect safety
  if (deterministicDecision.decisionType === 'CLARIFY_GOAL') {
    return deterministicDecision;
  }

  // If custom/mock LLM client is provided
  if (input.llmClient) {
    try {
      const llmDecision = await generateLlmAssistedDecisionWithClient(
        input,
        deterministicDecision,
        input.llmClient
      );
      return llmDecision;
    } catch {
      return {
        ...deterministicDecision,
        source: 'LLM_FALLBACK_DETERMINISTIC',
      };
    }
  }

  // Native Gemini execution
  try {
    const config = await getResolvedGeminiConfig();
    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = buildGeminiDecisionPrompt(input, deterministicDecision);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const validated = validateLlmDecisionResponse(responseText, deterministicDecision);

    if (validated) {
      return validated;
    }

    return {
      ...deterministicDecision,
      source: 'LLM_FALLBACK_DETERMINISTIC',
    };
  } catch {
    return {
      ...deterministicDecision,
      source: 'LLM_FALLBACK_DETERMINISTIC',
    };
  }
}

/**
 * Purely deterministic decision & action selection engine.
 */
export function generateLearningDecisionDeterministic(
  input: GenerateDecisionInput
): LearningDecision {
  const {
    userId,
    goalUnderstanding,
    assessment,
    availableCapabilities = DEFAULT_AVAILABLE_CAPABILITIES,
    timestamp = new Date().toISOString(),
  } = input;

  const resolvedCapabilities = availableCapabilities ?? DEFAULT_AVAILABLE_CAPABILITIES;
  const decisionId = `dec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // 1. Check if Phase 6A identified critical ambiguity / clarification needs
  if (goalUnderstanding?.clarificationNeeded === true) {
    const questions = goalUnderstanding.clarificationQuestions?.map((q) => q.question) || [
      'Could you clarify your specific target skill or timeframe?',
    ];
    return {
      decisionId,
      userId,
      decisionType: 'CLARIFY_GOAL',
      priority: 'HIGH',
      confidence: 'HIGH',
      goalReference: goalUnderstanding.originalGoal,
      targetSkills: goalUnderstanding.targetSkill ? [goalUnderstanding.targetSkill] : [],
      primaryObjective: 'Clarify goal scope, target skills, or timeframe with the student',
      recommendedAction: 'REQUEST_STUDENT_CLARIFICATION',
      rationale: 'The goal requires clarification: Missing critical parameters like target skill or scope.',
      evidenceBasis: ['Phase 6A Goal Understanding indicated clarification is needed before planning.'],
      contradictions: [],
      evidenceGaps: ['Goal definition or scope is ambiguous.'],
      requiredCapabilities: ['get_student_profile'],
      unavailableCapabilities: [],
      clarificationNeeded: true,
      clarificationQuestions: questions,
      reversible: true,
      requiresHumanApproval: false,
      source: 'DETERMINISTIC',
      createdAt: timestamp,
    };
  }

  // 2. Identify target skills from GoalUnderstanding or Assessment
  const targetSkills: string[] = [];
  if (goalUnderstanding?.targetSkill) {
    targetSkills.push(goalUnderstanding.targetSkill);
  } else if (assessment?.targetSkills && assessment.targetSkills.length > 0) {
    targetSkills.push(...assessment.targetSkills);
  }

  // Find relevant skill assessments
  const relevantSkillAssessments: SkillLearningAssessment[] = [];
  if (assessment?.skillAssessments) {
    if (targetSkills.length > 0) {
      for (const target of targetSkills) {
        const found = assessment.skillAssessments.find(
          (s) => s.skillName.toLowerCase() === target.toLowerCase()
        );
        if (found) relevantSkillAssessments.push(found);
      }
    } else {
      relevantSkillAssessments.push(...assessment.skillAssessments);
    }
  }

  // 3. Evaluate explicit student intent first (Intent overrides unrelated weaknesses)
  const category = goalUnderstanding?.category;
  const rawGoal = goalUnderstanding?.originalGoal || input.rawGoalText || '';

  // Evidence collections
  const evidenceBasis: string[] = [];
  const contradictions: string[] = [];
  const evidenceGaps: string[] = [];

  for (const sa of relevantSkillAssessments) {
    if (sa.supportingEvidence.length > 0) {
      evidenceBasis.push(...sa.supportingEvidence.map((e) => `[${sa.skillName}] ${e}`));
    }
    if (sa.contradictingEvidence.length > 0) {
      contradictions.push(...sa.contradictingEvidence.map((c) => `[${sa.skillName}] ${c}`));
    }
    if (sa.missingEvidenceGaps.length > 0) {
      evidenceGaps.push(...sa.missingEvidenceGaps.map((g) => `[${sa.skillName}] ${g}`));
    }
  }

  if (assessment?.recentActivitySummary) {
    if (assessment.recentActivitySummary.hasRecentGitHubActivity) {
      evidenceBasis.push('Recent GitHub commit telemetry observed.');
    }
    if (assessment.recentActivitySummary.hasRecentLeetCodeActivity) {
      evidenceBasis.push('Recent LeetCode problem-solving activity observed.');
    }
    if (assessment.recentActivitySummary.hasLoggedMistakes) {
      evidenceBasis.push('Logged student mistake telemetry available.');
    }
  }

  let decisionType: DecisionType = 'PRACTICE';
  let priority: DecisionPriority = (goalUnderstanding?.urgency === 'HIGH' || goalUnderstanding?.urgency === 'CRITICAL') ? 'HIGH' : 'MEDIUM';
  let confidence: DecisionConfidence = assessment?.overallConfidence || 'MODERATE';
  let primaryObjective = 'Advance student skill proficiency through deliberate practice';
  let recommendedAction = 'TARGETED_PRACTICE';
  let rationale = 'Proceed with deliberate practice aligned with the student goal and available evidence.';
  const requiredCapabilities: string[] = [];

  // Check special goal categories with priority on explicit GoalUnderstanding category
  if (category === 'REMEDIAL_PRACTICE' || (!category && /mistake|error|review wrong/i.test(rawGoal))) {
    decisionType = 'REVIEW_MISTAKES';
    priority = 'HIGH';
    primaryObjective = `Review and remediate recurring mistakes in ${targetSkills.join(', ') || 'target topics'}`;
    recommendedAction = 'MISTAKE_ROOT_CAUSE_REVIEW';
    requiredCapabilities.push('get_mistakes');
    rationale = `Goal explicitly targets remedial practice. Evidence includes ${
      assessment?.recentActivitySummary.hasLoggedMistakes
        ? 'logged mistakes ready for remediation'
        : 'recent practice telemetry'
    }.`;
  } else if (category === 'EXAM_PREPARATION' || (!category && /\b(?:exam|midterm|finals?|mock test)\b/i.test(rawGoal))) {
    decisionType = 'PREPARE_FOR_ASSESSMENT';
    priority = goalUnderstanding?.timeframe ? 'HIGH' : 'MEDIUM';
    primaryObjective = `Structured exam/interview preparation for ${targetSkills.join(', ') || 'upcoming evaluation'}`;
    recommendedAction = 'EXAM_PREPARATION_PACING';
    requiredCapabilities.push('get_tasks', 'get_skills');
    rationale = `Student goal is oriented towards an assessment/interview${
      goalUnderstanding?.timeframe ? ` with timeframe "${goalUnderstanding.timeframe}"` : ''
    }. Prioritizing high-yield practice and mock assessment pacing.`;
  } else if (category === 'SCHEDULE_PLANNING' || (!category && /\b(?:schedule|calendar|routine|time block)\b/i.test(rawGoal))) {
    decisionType = 'PLAN_SCHEDULE';
    priority = 'MEDIUM';
    primaryObjective = 'Construct a balanced learning routine and study session schedule';
    recommendedAction = 'SCHEDULE_AND_TIME_BLOCK_PLANNING';
    requiredCapabilities.push('get_time_sessions', 'get_tasks');
    rationale = 'Student explicitly requested schedule and time-allocation planning.';
  } else if (category === 'CORROBORATION_AUDIT' || (!category && /\b(?:audit|corroborat|verify claims?)\b/i.test(rawGoal))) {
    decisionType = 'CORROBORATE_EVIDENCE';
    priority = 'LOW';
    primaryObjective = 'Audit student skill claims against external and observed telemetry';
    recommendedAction = 'CORROBORATION_TELEMETRY_AUDIT';
    requiredCapabilities.push('get_skills', 'get_github_activity', 'get_leetcode_activity', 'get_projects');
    rationale = 'Student requested an audit of skills and evidence grounding.';
  } else {
    // Determine decision based on primary target skill assessment
    const primarySkill = relevantSkillAssessments[0];

    if (!primarySkill) {
      if (targetSkills.length > 0) {
        decisionType = 'ASSESS_SKILL';
        confidence = 'LOW';
        primaryObjective = `Establish baseline assessment for ${targetSkills.join(', ')}`;
        recommendedAction = 'BASELINE_DIAGNOSTIC_ASSESSMENT';
        rationale = `No existing skill record found for ${targetSkills.join(', ')}. A diagnostic baseline is needed.`;
      } else {
        decisionType = 'PRACTICE';
        primaryObjective = 'Engage in deliberate practice';
        recommendedAction = 'DELIBERATE_PRACTICE';
        rationale = 'General learning goal with standard practice recommendation.';
      }
    } else {
      switch (primarySkill.evidenceCategory) {
        case 'CONTRADICTED': {
          decisionType = primarySkill.contradictions.some((c) => /mistake/i.test(c.reason))
            ? 'REVIEW_MISTAKES'
            : 'TARGET_WEAK_AREA';
          priority = 'HIGH';
          primaryObjective = `Remediate contradicted concepts and bridge gap in ${primarySkill.skillName}`;
          recommendedAction = 'REMEDIATE_CONTRADICTED_CONCEPTS';
          requiredCapabilities.push('get_mistakes', 'get_projects');
          rationale = `Self-reported proficiency for ${primarySkill.skillName} is ${primarySkill.claimedProficiency}/5, but empirical evidence contains contradictory signals (${primarySkill.contradictingEvidence.join('; ') || 'recurring mistakes or low success rate'}). Focus on closing conceptual gaps.`;
          break;
        }

        case 'EVIDENCE_GAP': {
          decisionType = 'ASSESS_SKILL';
          confidence = 'LOW';
          priority = 'MEDIUM';
          primaryObjective = `Establish empirical baseline evidence for ${primarySkill.skillName}`;
          recommendedAction = 'ESTABLISH_BASELINE_EVIDENCE';
          requiredCapabilities.push('get_projects', 'get_leetcode_activity', 'get_github_activity');
          rationale = `Student has claimed ${primarySkill.skillName} (${primarySkill.claimedProficiency}/5), but zero observed project, GitHub, or LeetCode telemetry exists. Absence of evidence reflects empirical uncertainty rather than a confirmed deficit; an initial diagnostic is recommended.`;
          break;
        }

        case 'INSUFFICIENT_EVIDENCE': {
          decisionType = 'ASSESS_SKILL';
          confidence = 'LOW';
          priority = 'MEDIUM';
          primaryObjective = `Gather diagnostic assessment data for ${primarySkill.skillName}`;
          recommendedAction = 'DIAGNOSTIC_ASSESSMENT';
          requiredCapabilities.push('get_skills', 'get_tasks');
          rationale = `Available evidence for ${primarySkill.skillName} is insufficient to calibrate proficiency accurately.`;
          break;
        }

        case 'DEVELOPING': {
          decisionType = 'REINFORCE_DEVELOPING_SKILL';
          confidence = 'MODERATE';
          priority = 'MEDIUM';
          primaryObjective = `Reinforce developing proficiency in ${primarySkill.skillName} (calibrated ${primarySkill.calibratedProficiency}/5)`;
          recommendedAction = 'STRUCTURED_REINFORCEMENT_PRACTICE';
          requiredCapabilities.push('get_projects', 'get_leetcode_activity');
          rationale = `Evidence shows active development in ${primarySkill.skillName} with moderate confidence (calibrated ${primarySkill.calibratedProficiency}/5). Reinforcing core concepts and problem-solving is recommended.`;
          break;
        }

        case 'SUPPORTED_STRENGTH': {
          decisionType = 'PRACTICE';
          confidence = 'HIGH';
          priority = 'MEDIUM';
          primaryObjective = `Advance proficiency in ${primarySkill.skillName} (calibrated ${primarySkill.calibratedProficiency}/5)`;
          recommendedAction = 'ADVANCED_DELIBERATE_PRACTICE';
          requiredCapabilities.push('get_projects', 'get_github_activity');
          rationale = `Strong empirical evidence (${primarySkill.supportingEvidence.join(', ') || 'verified projects and activity'}) supports high proficiency in ${primarySkill.skillName} (calibrated ${primarySkill.calibratedProficiency}/5). Proceed with advanced deliberate practice.`;
          break;
        }
      }
    }
  }

  // If the goal is explicitly marked CRITICAL urgency, maintain URGENT priority
  if (goalUnderstanding?.urgency === 'CRITICAL') {
    priority = 'URGENT';
  }

  // 4. Verify required capabilities against available environment capabilities
  const unavailableCapabilities: string[] = [];
  for (const cap of requiredCapabilities) {
    if (!resolvedCapabilities.includes(cap)) {
      unavailableCapabilities.push(cap);
    }
  }

  // If a critical capability is missing, adapt gracefully rather than pretending it exists
  if (unavailableCapabilities.length > 0) {
    if (decisionType === 'CORROBORATE_EVIDENCE' && unavailableCapabilities.includes('get_github_activity')) {
      decisionType = 'WAIT_FOR_MORE_EVIDENCE';
      rationale += ` Note: Some requested telemetry sources (${unavailableCapabilities.join(', ')}) are currently disconnected.`;
    }
  }

  return {
    decisionId,
    userId,
    decisionType,
    priority,
    confidence,
    goalReference: goalUnderstanding?.originalGoal || input.rawGoalText || null,
    targetSkills: targetSkills.length > 0 ? targetSkills : ['General Learning'],
    primaryObjective,
    recommendedAction,
    rationale,
    evidenceBasis: Array.from(new Set(evidenceBasis)),
    contradictions: Array.from(new Set(contradictions)),
    evidenceGaps: Array.from(new Set(evidenceGaps)),
    requiredCapabilities: Array.from(new Set(requiredCapabilities)),
    unavailableCapabilities: Array.from(new Set(unavailableCapabilities)),
    clarificationNeeded: false,
    clarificationQuestions: [],
    reversible: true,
    requiresHumanApproval: priority === 'URGENT',
    source: 'DETERMINISTIC',
    createdAt: timestamp,
    metadata: input.metadata,
  };
}

/**
 * Valid Decision Types set for runtime validation of LLM outputs.
 */
const VALID_DECISION_TYPES: Set<DecisionType> = new Set([
  'CLARIFY_GOAL',
  'ASSESS_SKILL',
  'BUILD_FOUNDATION',
  'TARGET_WEAK_AREA',
  'REINFORCE_DEVELOPING_SKILL',
  'PRACTICE',
  'REVIEW_MISTAKES',
  'PREPARE_FOR_ASSESSMENT',
  'PLAN_SCHEDULE',
  'CORROBORATE_EVIDENCE',
  'CONTINUE_CURRENT_PATH',
  'WAIT_FOR_MORE_EVIDENCE',
]);

function buildGeminiDecisionPrompt(
  input: GenerateDecisionInput,
  deterministic: LearningDecision
): string {
  return `You are a pedagogical decision synthesizer inside the SINGLE Learning Orchestrator.
Analyze the student's goal and evidence assessment to refine the decision rationale.

CRITICAL RULES:
1. Do NOT invent capabilities or tools. Available tools: ${(input.availableCapabilities || DEFAULT_AVAILABLE_CAPABILITIES).join(', ')}.
2. Do NOT invent dates, deadlines, or constraints.
3. Do NOT make psychological, personality, or intelligence assumptions.
4. Deterministic decision type is: "${deterministic.decisionType}".
5. Missing evidence is uncertainty, NOT negative performance.
6. Return strictly a JSON object conforming to the schema below.

JSON Schema:
{
  "decisionType": "${deterministic.decisionType}",
  "primaryObjective": "concise pedagogical objective",
  "recommendedAction": "concise recommended action category",
  "rationale": "detailed evidence-grounded explanation"
}

Context:
Goal: ${deterministic.goalReference || 'Not specified'}
Target Skills: ${JSON.stringify(deterministic.targetSkills)}
Deterministic Type: ${deterministic.decisionType}
Evidence Basis: ${JSON.stringify(deterministic.evidenceBasis)}
Contradictions: ${JSON.stringify(deterministic.contradictions)}
Evidence Gaps: ${JSON.stringify(deterministic.evidenceGaps)}
`;
}

function validateLlmDecisionResponse(
  rawJson: string,
  deterministic: LearningDecision
): LearningDecision | null {
  let parsed: any;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof parsed.rationale !== 'string' ||
    !parsed.rationale.trim()
  ) {
    return null;
  }

  const validatedDecisionType =
    typeof parsed.decisionType === 'string' && VALID_DECISION_TYPES.has(parsed.decisionType)
      ? parsed.decisionType
      : deterministic.decisionType;

  return {
    ...deterministic,
    decisionType: validatedDecisionType,
    primaryObjective: typeof parsed.primaryObjective === 'string' && parsed.primaryObjective.trim()
      ? parsed.primaryObjective.trim()
      : deterministic.primaryObjective,
    recommendedAction: typeof parsed.recommendedAction === 'string' && parsed.recommendedAction.trim()
      ? parsed.recommendedAction.trim()
      : deterministic.recommendedAction,
    rationale: parsed.rationale.trim(),
    source: 'LLM_ASSISTED',
  };
}

async function generateLlmAssistedDecisionWithClient(
  input: GenerateDecisionInput,
  deterministic: LearningDecision,
  client: DecisionLlmClient
): Promise<LearningDecision> {
  const prompt = buildGeminiDecisionPrompt(input, deterministic);
  const rawJson = await client.generateJson(prompt);
  const validated = validateLlmDecisionResponse(rawJson, deterministic);
  if (validated) {
    return validated;
  }
  return {
    ...deterministic,
    source: 'LLM_FALLBACK_DETERMINISTIC',
  };
}
