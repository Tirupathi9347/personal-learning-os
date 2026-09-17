import { 
  EvidenceClassification, 
  CorroboratedSkillEvidence, 
  CorroborationResult, 
  StudentSkillAssessment, 
  StudentCorroborationAuditResult, 
  SkillConfidenceLevel, 
  ConfidenceScoreBreakdown,
  AuditSummary,
  AuditMetadata
} from './types';
import { evaluateStudentCorroboration } from './corroboration-engine';

/**
 * Epistemic Authority Multipliers by Classification.
 * Ground truth from tamper-resistant sources is given maximum authority (1.0),
 * while self-reported claims are treated with epistemic skepticism (0.05).
 */
export const EPISTEMIC_WEIGHTS: Record<EvidenceClassification, number> = {
  EXTERNALLY_VERIFIED: 1.0, // GitHub commit SHA, LeetCode verified submission
  OBSERVED: 0.7,            // Focus timer sessions, completed tasks, projects
  INFERRED: 0.4,            // Heuristic derivations, category affiliations
  SELF_REPORTED: 0.05,      // Subjective claim, manual self-rating, notes
};

/**
 * Bounded constants for transparent, deterministic confidence calculation.
 */
export const CONFIDENCE_CONSTANTS = {
  /** Asymptotic half-point constant for positive evidence (S = raw / (raw + K)) */
  SUPPORTING_SATURATION_K: 0.85,
  /** Baseline recency threshold in days before freshness decay applies */
  STALENESS_DAYS_THRESHOLD: 90,
  /** Maximum freshness penalty decay at 365+ days */
  MAX_STALENESS_DECAY: 0.35,
  /** Completeness reduction penalty per missing evidence gap */
  MISSING_REQUIREMENT_PENALTY: 0.12,
  /** Floor for completeness factor */
  MIN_COMPLETENESS_FLOOR: 0.45,
  /** Contradiction scaling damping constant */
  CONTRADICTION_DAMPING: 0.6,
  /** Floor for contradiction multiplier */
  MIN_CONTRADICTION_FLOOR: 0.10,
};

/**
 * Calculate deterministic confidence assessment for a single skill.
 */
export function calculateSkillConfidence(
  corroborated: CorroboratedSkillEvidence
): StudentSkillAssessment {
  const evaluatedAt = new Date().toISOString();

  // 1. Calculate Raw Supporting Evidence Strength
  let rawSupportingSum = 0;
  for (const record of corroborated.supportingEvidence) {
    const classWeight = EPISTEMIC_WEIGHTS[record.classification] ?? 0.1;
    rawSupportingSum += (record.weight || 0.5) * classWeight;
  }

  // Asymptotic saturation: S = raw / (raw + K)
  const supportingStrength = rawSupportingSum > 0
    ? rawSupportingSum / (rawSupportingSum + CONFIDENCE_CONSTANTS.SUPPORTING_SATURATION_K)
    : 0;

  // 2. Calculate Raw Contradiction Penalty
  let rawContradictingSum = 0;
  for (const record of corroborated.contradictingEvidence) {
    const classWeight = EPISTEMIC_WEIGHTS[record.classification] ?? 0.5;
    rawContradictingSum += (record.weight || 0.5) * classWeight;
  }

  // Contradiction multiplier: proportional reduction damped by supporting strength
  const contradictionPenaltyRatio = rawContradictingSum > 0
    ? rawContradictingSum / (rawSupportingSum + rawContradictingSum + CONFIDENCE_CONSTANTS.CONTRADICTION_DAMPING)
    : 0;

  const contradictionMultiplier = Math.max(
    CONFIDENCE_CONSTANTS.MIN_CONTRADICTION_FLOOR,
    1.0 - contradictionPenaltyRatio
  );

  // 3. Calculate Completeness Factor (Missing Evidence Gaps)
  // Missing evidence lowers certainty ceiling without being treated as negative evidence
  const missingGapsCount = corroborated.missingEvidence.length;
  const completenessMultiplier = Math.max(
    CONFIDENCE_CONSTANTS.MIN_COMPLETENESS_FLOOR,
    1.0 - (missingGapsCount * CONFIDENCE_CONSTANTS.MISSING_REQUIREMENT_PENALTY)
  );

  // 4. Calculate Freshness Factor
  let freshnessMultiplier = 1.0;
  if (corroborated.freshness.isStale) {
    if (corroborated.freshness.daysSinceNewest !== null && corroborated.freshness.daysSinceNewest !== undefined) {
      const excessDays = Math.max(0, corroborated.freshness.daysSinceNewest - CONFIDENCE_CONSTANTS.STALENESS_DAYS_THRESHOLD);
      const decayRatio = Math.min(1.0, excessDays / 365);
      freshnessMultiplier = Math.max(
        1.0 - CONFIDENCE_CONSTANTS.MAX_STALENESS_DECAY,
        1.0 - (decayRatio * CONFIDENCE_CONSTANTS.MAX_STALENESS_DECAY)
      );
    } else {
      // 0 empirical records exist
      freshnessMultiplier = 0.70;
    }
  }

  // 5. Final Calibrated Score (Bounded strictly [0.0, 1.0])
  const rawScore = supportingStrength * contradictionMultiplier * completenessMultiplier * freshnessMultiplier;
  const finalScore = Math.round(Math.min(1.0, Math.max(0.0, rawScore)) * 100) / 100;

  // 6. Categorize Confidence Level
  const hasSevereContradiction = corroborated.contradictions.some((c) => c.severity === 'SEVERE');
  const hasModerateContradiction = corroborated.contradictions.some((c) => c.severity === 'MODERATE');
  const isContradicted = hasSevereContradiction || (rawContradictingSum > rawSupportingSum && rawContradictingSum >= 0.4);

  let confidenceLevel: SkillConfidenceLevel;
  if (isContradicted) {
    confidenceLevel = 'CONTRADICTED';
  } else if (
    finalScore >= 0.70 &&
    corroborated.classificationCounts.externallyVerified > 0 &&
    corroborated.contradictions.length === 0
  ) {
    confidenceLevel = 'HIGH';
  } else if (
    finalScore >= 0.40 &&
    (corroborated.classificationCounts.externallyVerified > 0 || corroborated.classificationCounts.observed > 0)
  ) {
    confidenceLevel = 'MODERATE';
  } else if (
    finalScore >= 0.15 ||
    corroborated.classificationCounts.observed > 0 ||
    corroborated.classificationCounts.externallyVerified > 0
  ) {
    confidenceLevel = 'LOW';
  } else {
    confidenceLevel = 'UNVERIFIED';
  }

  // 7. Calibrate Assessed Proficiency
  let assessedProficiency: number | null = null;
  if (confidenceLevel === 'HIGH') {
    assessedProficiency = corroborated.claimedProficiency;
  } else if (confidenceLevel === 'MODERATE') {
    assessedProficiency = Math.min(corroborated.claimedProficiency, 3);
  } else if (confidenceLevel === 'LOW') {
    assessedProficiency = Math.min(corroborated.claimedProficiency, 2);
  } else if (confidenceLevel === 'CONTRADICTED') {
    assessedProficiency = Math.max(1, Math.min(corroborated.claimedProficiency - 2, 2));
  } else {
    // UNVERIFIED
    assessedProficiency = 1;
  }

  // 8. Generate Concise Explainability Bullet Reasons
  const reasons: string[] = [];

  // Reason: Supporting Evidence
  if (corroborated.supportingEvidence.length > 0) {
    const extCount = corroborated.classificationCounts.externallyVerified;
    const obsCount = corroborated.classificationCounts.observed;
    const selfCount = corroborated.classificationCounts.selfReported;
    reasons.push(
      `Supporting telemetry: ${extCount} verified third-party item(s), ${obsCount} observed item(s), and ${selfCount} self-reported claim(s) yield ${Math.round(supportingStrength * 100)}% base positive strength.`
    );
  } else {
    reasons.push('Zero supporting empirical evidence found (no projects, focus sessions, commits, or problems logged).');
  }

  // Reason: Contradictory Evidence
  if (corroborated.contradictingEvidence.length > 0) {
    const penaltyPercent = Math.round((1.0 - contradictionMultiplier) * 100);
    reasons.push(
      `Contradiction penalty (-${penaltyPercent}%): ${corroborated.contradictions.length} contradiction(s) logged [${corroborated.contradictions.map((c) => c.reason).join('; ')}].`
    );
  }

  // Reason: Missing Gaps
  if (missingGapsCount > 0) {
    reasons.push(
      `Certainty ceiling (-${Math.round((1.0 - completenessMultiplier) * 100)}%): ${missingGapsCount} unverified gap(s) detected [${corroborated.missingEvidence.map((m) => m.description).join('; ')}].`
    );
  }

  // Reason: Freshness
  if (corroborated.freshness.isStale && corroborated.freshness.daysSinceNewest !== null) {
    reasons.push(
      `Freshness penalty: Newest empirical proof is ${corroborated.freshness.daysSinceNewest} days old (exceeds ${CONFIDENCE_CONSTANTS.STALENESS_DAYS_THRESHOLD}-day recency threshold).`
    );
  }

  const breakdown: ConfidenceScoreBreakdown = {
    supportingStrength: Math.round(supportingStrength * 100) / 100,
    contradictionPenalty: Math.round(contradictionPenaltyRatio * 100) / 100,
    freshnessMultiplier: Math.round(freshnessMultiplier * 100) / 100,
    completenessMultiplier: Math.round(completenessMultiplier * 100) / 100,
    rawScore: Math.round(rawScore * 1000) / 1000,
    finalScore,
  };

  return {
    skillId: corroborated.skillId || null,
    skillName: corroborated.skillName,
    category: corroborated.category,
    claimedProficiency: corroborated.claimedProficiency,
    assessedProficiency,
    evidenceBackedScore: finalScore,
    confidenceLevel,
    evidenceCount: {
      total:
        corroborated.supportingEvidence.length +
        corroborated.contradictingEvidence.length +
        corroborated.neutralEvidence.length,
      supporting: corroborated.supportingEvidence.length,
      contradicting: corroborated.contradictingEvidence.length,
      neutral: corroborated.neutralEvidence.length,
      externallyVerified: corroborated.classificationCounts.externallyVerified,
    },
    evidenceRecords: [
      ...corroborated.supportingEvidence,
      ...corroborated.contradictingEvidence,
      ...corroborated.neutralEvidence,
    ],
    contradictions: corroborated.contradictions,
    missingEvidence: corroborated.missingEvidence,
    reasons,
    breakdown,
    lastEvaluatedAt: evaluatedAt,
  };
}

/**
 * Feature 1D: Confidence Calculator for Agentic Learning OS.
 * Evaluates all skills from a CorroborationResult and produces a complete StudentCorroborationAuditResult.
 */
export function calculateCorroborationConfidence(
  corroborationResult: CorroborationResult,
  studentUserId?: string | null
): StudentCorroborationAuditResult {
  const generatedAt = new Date().toISOString();
  const skillsEvaluated: StudentSkillAssessment[] = [];

  let highCount = 0;
  let moderateCount = 0;
  let lowCount = 0;
  let unverifiedCount = 0;
  let contradictedCount = 0;
  let totalScoreSum = 0;

  for (const skill of corroborationResult.skills) {
    const assessment = calculateSkillConfidence(skill);
    skillsEvaluated.push(assessment);

    if (assessment.confidenceLevel === 'HIGH') highCount++;
    else if (assessment.confidenceLevel === 'MODERATE') moderateCount++;
    else if (assessment.confidenceLevel === 'LOW') lowCount++;
    else if (assessment.confidenceLevel === 'UNVERIFIED') unverifiedCount++;
    else if (assessment.confidenceLevel === 'CONTRADICTED') contradictedCount++;

    totalScoreSum += assessment.evidenceBackedScore;
  }

  const overallGroundTruthScore = skillsEvaluated.length > 0
    ? Math.round((totalScoreSum / skillsEvaluated.length) * 100) / 100
    : 0;

  const summary: AuditSummary = {
    totalSkillsClaimed: skillsEvaluated.length,
    highConfidenceCount: highCount,
    moderateConfidenceCount: moderateCount,
    lowConfidenceCount: lowCount,
    unverifiedCount: unverifiedCount,
    contradictedCount: contradictedCount,
    overallGroundTruthScore,
  };

  const warnings: string[] = [];
  if (contradictedCount > 0) {
    warnings.push(
      `${contradictedCount} skill claim(s) contain severe or moderate empirical contradictions (mistakes, failed submissions, or ungrounded claims).`
    );
  }
  if (unverifiedCount > 0) {
    warnings.push(
      `${unverifiedCount} skill claim(s) rely entirely on self-reported entries with zero supporting telemetry.`
    );
  }

  const metadata: AuditMetadata = {
    hasGitHubConnected: corroborationResult.skills.some((s) =>
      s.supportingEvidence.some((e) => e.source === 'github')
    ),
    hasLeetCodeConnected: corroborationResult.skills.some((s) =>
      s.supportingEvidence.some((e) => e.source === 'leetcode')
    ),
    totalEvidenceLinksParsed: skillsEvaluated.reduce(
      (acc, s) => acc + s.evidenceRecords.length,
      0
    ),
    engineVersion: '1.0.0-deterministic',
  };

  return {
    auditId: `audit-${Date.now()}`,
    studentUserId: studentUserId || null,
    generatedAt,
    skillsEvaluated,
    summary,
    warnings,
    limitations: corroborationResult.limitations,
    metadata,
  };
}

/**
 * Async Convenience Pipeline: Executes full Feature 1 Pipeline (1B -> 1C -> 1D).
 */
export async function runFullStudentCorroborationAudit(
  studentUserId?: string | null
): Promise<StudentCorroborationAuditResult> {
  const corroborationResult = await evaluateStudentCorroboration();
  return calculateCorroborationConfidence(corroborationResult, studentUserId);
}
