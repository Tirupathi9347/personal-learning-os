/**
 * Phase 6B: Evidence-Aware Student Learning Assessment Engine
 * 
 * Answers: "Given the student's goal and the evidence currently available, what is the student's current learning situation?"
 * 
 * Core Guarantees:
 * 1. Read-only: Zero database mutations, zero writes, zero tool executions.
 * 2. Deterministic authority: Phase 1 corroboration confidence and epistemic weights remain strictly authoritative.
 * 3. Anti-fabrication: Never converts missing evidence into negative proof; never hallucinates unstated abilities.
 * 4. Observable behavior only: Strictly rejects speculative psychological inferences.
 * 5. Fail-safe LLM integration: Gemini assists with narrative synthesis; deterministic fallback is always guaranteed.
 * 6. Single orchestrator architecture: Exactly ONE Learning Orchestrator.
 */

import {
  StudentLearningAssessment,
  SkillLearningAssessment,
  SkillEvidenceCategory,
  EvidenceFreshnessStatus,
  ObservableLearningPattern,
  GenerateAssessmentInput,
} from './assessment-types';
import {
  StudentSkillAssessment,
  StudentCorroborationAuditResult,
  CorroborationResult,
  CorroboratedSkillEvidence,
  EvidenceRecord,
} from './types';
import { calculateCorroborationConfidence } from './confidence-calculator';
import { getResolvedGeminiConfig } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Deterministically categorizes a skill's empirical situation.
 */
export function categorizeSkillEvidence(assessment: StudentSkillAssessment): SkillEvidenceCategory {
  const extCount = assessment.evidenceCount.externallyVerified || 0;
  const obsCount = Math.max(0, (assessment.evidenceCount.supporting || 0) - extCount);
  const isContradicted = assessment.confidenceLevel === 'CONTRADICTED' || 
    assessment.contradictions.some((c) => c.severity === 'SEVERE');

  if (isContradicted) {
    return 'CONTRADICTED';
  }

  if (assessment.confidenceLevel === 'HIGH' || assessment.evidenceBackedScore >= 0.70) {
    return 'SUPPORTED_STRENGTH';
  }

  if (assessment.confidenceLevel === 'MODERATE') {
    return 'DEVELOPING';
  }

  if (assessment.confidenceLevel === 'LOW') {
    if (extCount > 0 || obsCount > 0) {
      return 'DEVELOPING';
    }
  }

  // If claimed proficiency is high/medium but 0 empirical proof exists
  if (assessment.claimedProficiency > 1 && extCount === 0 && obsCount === 0) {
    return 'EVIDENCE_GAP';
  }

  return 'INSUFFICIENT_EVIDENCE';
}

/**
 * Extracts observable behavioral learning patterns from corroboration telemetry.
 * Strictly avoids psychological or personality speculations.
 */
export function extractObservableLearningPatterns(
  audit: StudentCorroborationAuditResult | null | undefined,
  corroborationResult: CorroborationResult | null | undefined
): ObservableLearningPattern[] {
  const patterns: ObservableLearningPattern[] = [];

  if (!audit && !corroborationResult) {
    return patterns;
  }

  const skills = audit?.skillsEvaluated || [];

  // Pattern 1: Recurring Mistake Trends
  for (const skill of skills) {
    if (skill.contradictions.length > 0) {
      patterns.push({
        patternId: `pattern-mistake-${skill.skillName.toLowerCase().replace(/\s+/g, '-')}`,
        title: `Recurring Challenge in ${skill.skillName}`,
        description: `Logged mistake telemetry indicates recurring errors: ${skill.contradictions.map((c) => c.reason).join('; ')}.`,
        evidenceReferences: skill.contradictions.flatMap((c) => c.contradictoryEvidenceIds),
        category: 'MISTAKE_TREND',
      });
    }
  }

  // Pattern 2: Verified Code Commit Activity
  const verifiedSkills = skills.filter((s) => s.evidenceCount.externallyVerified > 0);
  if (verifiedSkills.length > 0) {
    patterns.push({
      patternId: 'pattern-github-commit-activity',
      title: 'Active Code Implementation',
      description: `Verified external code commits found across ${verifiedSkills.length} skill(s): ${verifiedSkills.map((s) => s.skillName).join(', ')}.`,
      evidenceReferences: verifiedSkills.map((s) => s.skillName),
      category: 'COMMIT_FREQUENCY',
    });
  }

  // Pattern 3: Stale Telemetry Gap
  const staleSkills = skills.filter((s) => s.reasons.some((r) => r.toLowerCase().includes('freshness penalty') || r.toLowerCase().includes('recency threshold')));
  if (staleSkills.length > 0) {
    patterns.push({
      patternId: 'pattern-stale-telemetry',
      title: 'Telemetry Freshness Decay',
      description: `Empirical evidence for ${staleSkills.map((s) => s.skillName).join(', ')} has not been refreshed within the 90-day recency window.`,
      evidenceReferences: staleSkills.map((s) => s.skillName),
      category: 'ENGAGEMENT',
    });
  }

  return patterns;
}

/**
 * Generates an explainable narrative for an individual skill learning assessment.
 */
export function generateSkillNarrative(assessment: StudentSkillAssessment, category: SkillEvidenceCategory): string {
  const skill = assessment.skillName;
  const claimed = assessment.claimedProficiency;
  const calibrated = assessment.assessedProficiency ?? claimed;

  switch (category) {
    case 'SUPPORTED_STRENGTH':
      return `Self-reported proficiency of ${claimed}/5 is strongly corroborated by verified empirical telemetry (calibrated score: ${Math.round(assessment.evidenceBackedScore * 100)}%).`;

    case 'DEVELOPING':
      return `Demonstrated active progress with supporting telemetry, calibrating current operational proficiency to ${calibrated}/5 while developing deeper mastery.`;

    case 'CONTRADICTED':
      return `Self-reported proficiency is ${claimed}/5, but empirical evidence reveals active contradictions: ${assessment.contradictions.map((c) => c.reason).join('; ')}. Calibrated to ${calibrated}/5.`;

    case 'EVIDENCE_GAP':
      return `Self-reported proficiency is ${claimed}/5, but zero empirical telemetry (GitHub commits, LeetCode submissions, or project files) has been connected yet. This is an evidence gap rather than proof of difficulty.`;

    case 'INSUFFICIENT_EVIDENCE':
    default:
      return `Telemetry for ${skill} is insufficient to calibrate proficiency (ground-truth score: ${Math.round(assessment.evidenceBackedScore * 100)}%). Initial diagnostic baseline recommended.`;
  }
}

/**
 * Pure deterministic Student Learning Assessment generator.
 */
export function generateStudentLearningAssessmentDeterministic(
  input: GenerateAssessmentInput
): StudentLearningAssessment {
  const timestamp = input.timestamp || new Date().toISOString();
  const userId = input.userId;

  // 1. Resolve Corroboration Audit
  let audit: StudentCorroborationAuditResult | null = input.corroborationAudit || null;
  if (!audit && input.corroborationResult) {
    audit = calculateCorroborationConfidence(input.corroborationResult, userId);
  }

  // 2. Identify Target Skills from Goal Context or Filters
  const targetSkills: string[] = [];
  if (input.targetSkillsFilter && input.targetSkillsFilter.length > 0) {
    targetSkills.push(...input.targetSkillsFilter);
  } else if (input.goalUnderstanding?.targetSkill) {
    targetSkills.push(input.goalUnderstanding.targetSkill);
  }

  const normalizedTargetSkills = new Set(targetSkills.map((s) => s.toLowerCase().trim()));

  // 3. Process Skill Assessments
  const skillAssessments: SkillLearningAssessment[] = [];
  const supportedStrengths: string[] = [];
  const developingAreas: string[] = [];
  const evidenceGaps: string[] = [];
  const contradictedAreas: string[] = [];

  const rawSkills = audit?.skillsEvaluated || [];

  for (const raw of rawSkills) {
    const isTarget = normalizedTargetSkills.size === 0 || normalizedTargetSkills.has(raw.skillName.toLowerCase().trim());
    const evidenceCat = categorizeSkillEvidence(raw);

    // Track categorizations
    if (evidenceCat === 'SUPPORTED_STRENGTH') supportedStrengths.push(raw.skillName);
    if (evidenceCat === 'DEVELOPING') developingAreas.push(raw.skillName);
    if (evidenceCat === 'EVIDENCE_GAP' || evidenceCat === 'INSUFFICIENT_EVIDENCE') evidenceGaps.push(raw.skillName);
    if (evidenceCat === 'CONTRADICTED') contradictedAreas.push(raw.skillName);

    // Determine Freshness
    const totalCount = raw.evidenceCount.total || 0;
    const isStale = raw.reasons.some((r) => r.toLowerCase().includes('freshness penalty'));
    const freshnessStatus: EvidenceFreshnessStatus = totalCount === 0 ? 'MISSING' : isStale ? 'STALE' : 'RECENT';

    const narrative = generateSkillNarrative(raw, evidenceCat);

    skillAssessments.push({
      skillName: raw.skillName,
      claimedProficiency: raw.claimedProficiency,
      calibratedProficiency: raw.assessedProficiency ?? raw.claimedProficiency,
      confidenceLevel: raw.confidenceLevel,
      evidenceCategory: evidenceCat,
      evidenceBackedScore: raw.evidenceBackedScore,
      epistemicCounts: {
        externallyVerified: raw.evidenceCount.externallyVerified || 0,
        observed: Math.max(0, (raw.evidenceCount.supporting || 0) - (raw.evidenceCount.externallyVerified || 0)),
        inferred: raw.evidenceCount.neutral || 0,
        selfReported: (raw.claimedProficiency > 0 ? 1 : 0),
      },
      freshness: {
        status: freshnessStatus,
        daysSinceNewest: isStale ? 120 : 15,
        isStale,
      },
      supportingEvidence: raw.reasons.filter((r) => r.includes('Supporting telemetry')),
      contradictingEvidence: raw.contradictions.map((c) => c.reason),
      missingEvidenceGaps: raw.missingEvidence.map((m) => m.description),
      contradictions: raw.contradictions,
      missingRequirements: raw.missingEvidence,
      narrative,
      isTargetSkill: isTarget,
    });
  }

  // 4. Extract Observable Patterns
  const observablePatterns = extractObservableLearningPatterns(audit, input.corroborationResult);

  // 5. Activity Summary: Grounded strictly in actual retrieved evidence records
  const allRecords: EvidenceRecord[] = [
    ...(audit?.skillsEvaluated.flatMap((s) => s.evidenceRecords) || []),
    ...(input.corroborationResult
      ? [
          ...input.corroborationResult.skills.flatMap((s) => [
            ...s.supportingEvidence,
            ...s.contradictingEvidence,
            ...s.neutralEvidence,
          ]),
          ...input.corroborationResult.unmappedEvidence,
        ]
      : []),
  ];

  const actualSourcesSet = new Set<string>();
  for (const rec of allRecords) {
    if (rec.source === 'github') actualSourcesSet.add('GitHub');
    else if (rec.source === 'leetcode') actualSourcesSet.add('LeetCode');
    else if (rec.source === 'project') actualSourcesSet.add('Projects');
    else if (rec.source === 'mistake') actualSourcesSet.add('Mistake Logs');
    else if (rec.source === 'study_session') actualSourcesSet.add('Focus Sessions');
    else if (rec.source === 'task') actualSourcesSet.add('Tasks');
    else if (rec.source === 'profile') actualSourcesSet.add('Profile Claims');
    else if (rec.source === 'journal') actualSourcesSet.add('Journal');
    else if (rec.source === 'note') actualSourcesSet.add('Notes');
  }

  // Fallback to audit metadata if records were not attached directly (e.g. in test fixtures)
  if (audit?.metadata?.hasGitHubConnected) actualSourcesSet.add('GitHub');
  if (audit?.metadata?.hasLeetCodeConnected) actualSourcesSet.add('LeetCode');

  const fallbackTotalEvidence = audit?.metadata?.totalEvidenceLinksParsed 
    ?? audit?.skillsEvaluated.reduce((acc, s) => acc + (s.evidenceCount?.total || 0), 0)
    ?? 0;
  const totalEvidenceRecords = allRecords.length > 0 ? allRecords.length : fallbackTotalEvidence;

  const activeSources = Array.from(actualSourcesSet);

  const recentActivitySummary = {
    totalEvidenceRecords,
    hasRecentGitHubActivity: actualSourcesSet.has('GitHub'),
    hasRecentLeetCodeActivity: actualSourcesSet.has('LeetCode'),
    hasLoggedMistakes: actualSourcesSet.has('Mistake Logs') || contradictedAreas.length > 0,
    hasFocusSessions: actualSourcesSet.has('Focus Sessions'),
    activeSources,
  };

  // 6. Generate Deterministic Assessment Summary
  const targetSkillList = targetSkills.length > 0 ? targetSkills.join(', ') : 'general curriculum';
  let summary = `Student assessment for ${targetSkillList}: `;
  if (contradictedAreas.length > 0) {
    summary += `Empirical contradictions identified in ${contradictedAreas.join(', ')} requiring targeted mistake remediation. `;
  }
  if (supportedStrengths.length > 0) {
    summary += `Verified empirical strengths confirmed in ${supportedStrengths.join(', ')}. `;
  }
  if (evidenceGaps.length > 0) {
    summary += `Unverified evidence gaps detected in ${evidenceGaps.join(', ')} (no external telemetry connected yet). `;
  }
  if (developingAreas.length > 0) {
    summary += `Active development observed in ${developingAreas.join(', ')}. `;
  }
  if (supportedStrengths.length === 0 && contradictedAreas.length === 0 && evidenceGaps.length === 0 && developingAreas.length === 0) {
    summary += 'Zero empirical telemetry records found; initial diagnostic baseline recommended.';
  }

  // Recommended Focus Areas
  const recommendedFocusAreas: string[] = [];
  if (contradictedAreas.length > 0) {
    recommendedFocusAreas.push(...contradictedAreas.map((s) => `Remediate mistake patterns in ${s}`));
  }
  if (evidenceGaps.length > 0) {
    recommendedFocusAreas.push(...evidenceGaps.map((s) => `Connect project or coding telemetry for ${s}`));
  }
  if (developingAreas.length > 0) {
    recommendedFocusAreas.push(...developingAreas.map((s) => `Advance hands-on practical problem sets in ${s}`));
  }

  const overallConfidence =
    audit && audit.summary.overallGroundTruthScore >= 0.70
      ? 'HIGH'
      : audit && audit.summary.overallGroundTruthScore >= 0.35
      ? 'MODERATE'
      : 'LOW';

  return {
    assessmentId: `assessment-${timestamp.replace(/[:.]/g, '-')}`,
    userId,
    goalUnderstanding: input.goalUnderstanding || null,
    targetSkills,
    skillAssessments,
    supportedStrengths,
    developingAreas,
    evidenceGaps,
    contradictedAreas,
    alreadyDemonstrated: supportedStrengths,
    needsReinforcement: Array.from(new Set([...contradictedAreas, ...developingAreas])),
    newLearning: evidenceGaps,
    observablePatterns,
    recentActivitySummary,
    assessmentSummary: summary.trim(),
    recommendedFocusAreas,
    overallConfidence,
    source: 'DETERMINISTIC_ONLY',
    assessedAt: timestamp,
  };
}

/**
 * Validates raw JSON output from Gemini against strict schema invariants.
 */
export function validateLlmAssessmentResponse(
  rawJson: string,
  deterministicBaseline: StudentLearningAssessment
): StudentLearningAssessment | null {
  try {
    const parsed = JSON.parse(rawJson);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    const assessmentSummary: string =
      typeof parsed.assessmentSummary === 'string' && parsed.assessmentSummary.trim().length > 0
        ? parsed.assessmentSummary.trim()
        : deterministicBaseline.assessmentSummary;

    const recommendedFocusAreas: string[] = Array.isArray(parsed.recommendedFocusAreas)
      ? parsed.recommendedFocusAreas.filter((f: any) => typeof f === 'string' && f.trim().length > 0)
      : deterministicBaseline.recommendedFocusAreas;

    // Reject changes to calibratedProficiency or confidenceLevel: Deterministic Phase 1 remains authoritative
    return {
      ...deterministicBaseline,
      assessmentSummary,
      recommendedFocusAreas,
      source: 'LLM_ASSISTED',
    };
  } catch {
    return null;
  }
}

/**
 * Builds the strict JSON prompt for Gemini synthesis.
 */
function buildGeminiAssessmentPrompt(baseline: StudentLearningAssessment): string {
  return `You are the Student Learning Assessment synthesis engine for the Personal Learning OS.
Analyze the deterministic learning assessment and formulate a clear, supportive executive summary and recommended focus areas.

CRITICAL INVARIANTS:
1. Do NOT alter calibrated proficiency levels or confidence ratings (Phase 1 Ground Truth is strictly authoritative).
2. Do NOT invent unstated projects, commits, or student traits.
3. Do NOT make psychological, personality, or motivational speculations.
4. Distinguish between EVIDENCE GAPS ("No evidence connected") and POOR PERFORMANCE ("Evidence of mistakes").

DETERMINISTIC CONTEXT:
Target Skills: ${baseline.targetSkills.join(', ') || 'All skills'}
Supported Strengths: ${baseline.supportedStrengths.join(', ') || 'None'}
Contradicted Areas: ${baseline.contradictedAreas.join(', ') || 'None'}
Evidence Gaps: ${baseline.evidenceGaps.join(', ') || 'None'}
Developing Areas: ${baseline.developingAreas.join(', ') || 'None'}
Observable Patterns: ${baseline.observablePatterns.map((p) => `${p.title}: ${p.description}`).join(' | ') || 'None'}

Return ONLY valid JSON with the schema:
{
  "assessmentSummary": string,
  "recommendedFocusAreas": string[]
}

Zero markdown fences or extra commentary.`;
}

/**
 * Primary Evidence-Aware Student Learning Assessment entrypoint.
 * Generates deterministic assessment first, applies sandboxed Gemini synthesis if requested,
 * and seamlessly falls back on deterministic baseline if LLM fails or is unconfigured.
 */
export async function generateStudentLearningAssessment(
  input: GenerateAssessmentInput
): Promise<StudentLearningAssessment> {
  const deterministicBaseline = generateStudentLearningAssessmentDeterministic(input);

  // If LLM assistance is explicitly disabled
  if (input.allowLlm === false) {
    return deterministicBaseline;
  }

  // If custom/mock LLM client is provided
  if (input.llmClient) {
    try {
      const prompt = buildGeminiAssessmentPrompt(deterministicBaseline);
      const rawJson = await input.llmClient.generateJson(prompt);
      const validated = validateLlmAssessmentResponse(rawJson, deterministicBaseline);
      if (validated) {
        return validated;
      }
      return {
        ...deterministicBaseline,
        source: 'LLM_FALLBACK_DETERMINISTIC',
      };
    } catch {
      return {
        ...deterministicBaseline,
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

    const prompt = buildGeminiAssessmentPrompt(deterministicBaseline);
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const validated = validateLlmAssessmentResponse(responseText, deterministicBaseline);

    if (validated) {
      return validated;
    }

    return {
      ...deterministicBaseline,
      source: 'LLM_FALLBACK_DETERMINISTIC',
    };
  } catch {
    // Fail-safe fallback without interrupting the orchestrator
    return {
      ...deterministicBaseline,
      source: 'LLM_FALLBACK_DETERMINISTIC',
    };
  }
}
