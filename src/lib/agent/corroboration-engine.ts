import { 
  EvidenceRecord, 
  EvidenceCollectionResult, 
  CorroboratedSkillEvidence, 
  CorroborationResult, 
  EvidenceContradiction, 
  ContradictionSeverity,
  MissingEvidenceRequirement, 
  EvidenceFreshness 
} from './types';
import { collectStudentEvidence } from './evidence-collector';

export interface CorroborationOptions {
  stalenessThresholdDays?: number; // Default 90 days
}

/**
 * Feature 1C: Corroboration Engine for Agentic Learning OS.
 * 
 * Deterministic, strictly read-only engine that evaluates each student's
 * claimed skill against collected empirical evidence.
 * 
 * Responsibilities:
 * - Groups evidence by skill.
 * - Isolates SUPPORTS, CONTRADICTS, and NEUTRAL evidence.
 * - Enforces epistemic tiers (never treats self-reported claims as proof).
 * - Identifies genuine conflicting evidence (severe/moderate/mild contradictions).
 * - Detects missing evidence gaps and telemetry staleness.
 * - Leaves final confidence score calculation to Feature 1D.
 */
export function corroborateStudentEvidence(
  collectionResult: EvidenceCollectionResult,
  options?: CorroborationOptions
): CorroborationResult {
  const evaluatedAt = new Date().toISOString();
  const stalenessThresholdDays = options?.stalenessThresholdDays ?? 90;

  // 1. Index all unique skills mentioned in claims or evidence
  interface SkillBucket {
    skillId?: string | null;
    skillName: string;
    category?: string;
    claimedProficiency: number;
    hasExplicitClaim: boolean;
    records: EvidenceRecord[];
  }

  const skillBuckets = new Map<string, SkillBucket>();
  const unmappedEvidence: EvidenceRecord[] = [];

  // Helper to normalize skill lookup key
  const toSkillKey = (name: string) => name.toLowerCase().trim();

  // First pass: Discover explicit claims from 'profile' source
  for (const record of collectionResult.records) {
    if (record.source === 'profile') {
      const key = toSkillKey(record.targetSkillName);
      let bucket = skillBuckets.get(key);

      const claimedLevel = record.metrics?.score || 1;

      if (!bucket) {
        bucket = {
          skillId: record.targetSkillId || null,
          skillName: record.targetSkillName,
          category: record.sourceRef?.tableName === 'skills' ? 'Framework' : 'Profile',
          claimedProficiency: claimedLevel,
          hasExplicitClaim: true,
          records: [record],
        };
        skillBuckets.set(key, bucket);
      } else {
        bucket.hasExplicitClaim = true;
        // Keep highest self-reported level if multiple claims exist
        if (claimedLevel > bucket.claimedProficiency) {
          bucket.claimedProficiency = claimedLevel;
        }
        if (record.targetSkillId && !bucket.skillId) {
          bucket.skillId = record.targetSkillId;
        }
        bucket.records.push(record);
      }
    }
  }

  // Second pass: Route non-profile evidence to corresponding skills
  for (const record of collectionResult.records) {
    if (record.source === 'profile') {
      // Already processed in first pass
      continue;
    }

    const rawTarget = record.targetSkillName?.trim();

    // If target is undefined, 'General', or blank, mark as unmapped
    if (!rawTarget || rawTarget.toLowerCase() === 'general') {
      unmappedEvidence.push(record);
      continue;
    }

    const key = toSkillKey(rawTarget);
    let bucket = skillBuckets.get(key);

    if (!bucket) {
      // Demonstrated competency without an explicit self-claim
      bucket = {
        skillId: record.targetSkillId || null,
        skillName: rawTarget,
        category: 'Demonstrated (Unclaimed)',
        claimedProficiency: 0,
        hasExplicitClaim: false,
        records: [record],
      };
      skillBuckets.set(key, bucket);
    } else {
      if (record.targetSkillId && !bucket.skillId) {
        bucket.skillId = record.targetSkillId;
      }
      bucket.records.push(record);
    }
  }

  // 2. Evaluate each skill bucket against corroboration rules
  const corroboratedSkills: CorroboratedSkillEvidence[] = [];
  let severeContradictionsCount = 0;
  let moderateContradictionsCount = 0;
  let mildContradictionsCount = 0;
  let totalMissingRequirements = 0;
  let unverifiedSkillCount = 0;
  let staleSkillCount = 0;

  for (const bucket of Array.from(skillBuckets.values())) {
    const supportingEvidence: EvidenceRecord[] = [];
    const contradictingEvidence: EvidenceRecord[] = [];
    const neutralEvidence: EvidenceRecord[] = [];

    let externallyVerifiedCount = 0;
    let observedCount = 0;
    let inferredCount = 0;
    let selfReportedCount = 0;

    // Separate by polarity and count classifications
    for (const r of bucket.records) {
      if (r.polarity === 'SUPPORTS') {
        supportingEvidence.push(r);
      } else if (r.polarity === 'CONTRADICTS') {
        contradictingEvidence.push(r);
      } else {
        neutralEvidence.push(r);
      }

      if (r.classification === 'EXTERNALLY_VERIFIED') {
        externallyVerifiedCount++;
      } else if (r.classification === 'OBSERVED') {
        observedCount++;
      } else if (r.classification === 'INFERRED') {
        inferredCount++;
      } else if (r.classification === 'SELF_REPORTED') {
        selfReportedCount++;
      }
    }

    // 3. Compute Evidence Freshness Telemetry
    // Consider empirical evidence timestamps (EXTERNALLY_VERIFIED or OBSERVED)
    const empiricalTimestamps: number[] = [];

    for (const r of [...supportingEvidence, ...contradictingEvidence]) {
      if (r.classification === 'EXTERNALLY_VERIFIED' || r.classification === 'OBSERVED') {
        const timeMs = new Date(r.observedAt).getTime();
        if (!isNaN(timeMs)) {
          empiricalTimestamps.push(timeMs);
        }
      }
    }

    empiricalTimestamps.sort((a, b) => b - a); // descending: newest first

    let freshness: EvidenceFreshness;
    if (empiricalTimestamps.length > 0) {
      const newestMs = empiricalTimestamps[0];
      const oldestMs = empiricalTimestamps[empiricalTimestamps.length - 1];
      const nowMs = Date.now();
      const daysSinceNewest = Math.max(0, Math.floor((nowMs - newestMs) / (1000 * 60 * 60 * 24)));
      const isStale = daysSinceNewest > stalenessThresholdDays;

      freshness = {
        newestEvidenceDate: new Date(newestMs).toISOString(),
        oldestEvidenceDate: new Date(oldestMs).toISOString(),
        daysSinceNewest,
        isStale,
      };

      if (isStale) staleSkillCount++;
    } else {
      // No empirical evidence
      freshness = {
        newestEvidenceDate: null,
        oldestEvidenceDate: null,
        daysSinceNewest: null,
        isStale: true,
      };
      unverifiedSkillCount++;
    }

    // 4. Detect Genuine Contradictions
    const contradictions: EvidenceContradiction[] = [];

    // Contradiction Rule A: High Claim vs Documented Mistakes
    const mistakes = contradictingEvidence.filter((e) => e.source === 'mistake');
    if (bucket.claimedProficiency >= 3 && mistakes.length > 0) {
      const hasCriticalOrHigh = mistakes.some(
        (m) => m.weight >= 0.6 || m.description.toLowerCase().includes('critical') || m.description.toLowerCase().includes('high severity')
      );
      const isModerate = mistakes.some((m) => m.weight >= 0.4) || mistakes.length >= 3;

      let severity: ContradictionSeverity = 'MILD';
      if (hasCriticalOrHigh) {
        severity = 'SEVERE';
      } else if (isModerate) {
        severity = 'MODERATE';
      } else {
        severity = 'MILD';
      }

      const contradiction: EvidenceContradiction = {
        id: `contra-mistake-${bucket.skillName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        skillName: bucket.skillName,
        claimedProficiency: bucket.claimedProficiency,
        contradictoryEvidenceIds: mistakes.map((m) => m.id),
        severity,
        reason: severity === 'SEVERE'
          ? `Student claims proficiency ${bucket.claimedProficiency}/5, but has ${mistakes.length} documented high/critical mistake(s) directly tied to ${bucket.skillName}.`
          : severity === 'MODERATE'
          ? `Student claims proficiency ${bucket.claimedProficiency}/5, but has ${mistakes.length} logged mistake(s) indicating notable conceptual deficiencies.`
          : `Student claims proficiency ${bucket.claimedProficiency}/5, but has ${mistakes.length} minor logged mistake(s) (e.g. syntax or minor edge case).`,
      };
      contradictions.push(contradiction);

      if (severity === 'SEVERE') severeContradictionsCount++;
      else if (severity === 'MODERATE') moderateContradictionsCount++;
      else mildContradictionsCount++;
    }

    // Contradiction Rule B: Claimed Competency vs Failed Submissions
    const failedSubs = contradictingEvidence.filter((e) => e.source === 'leetcode');
    const acceptedSubs = supportingEvidence.filter((e) => e.source === 'leetcode');
    if (bucket.claimedProficiency >= 3 && failedSubs.length > 0) {
      const isAllFailed = acceptedSubs.length === 0;

      const contradiction: EvidenceContradiction = {
        id: `contra-leetcode-${bucket.skillName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        skillName: bucket.skillName,
        claimedProficiency: bucket.claimedProficiency,
        contradictoryEvidenceIds: failedSubs.map((f) => f.id),
        severity: isAllFailed ? 'SEVERE' : 'MODERATE',
        reason: isAllFailed
          ? `Claimed proficiency is ${bucket.claimedProficiency}/5, but all ${failedSubs.length} verified submissions failed or timed out without an accepted solution.`
          : `High execution failure rate: ${failedSubs.length} failed submission(s) vs ${acceptedSubs.length} accepted for ${bucket.skillName}.`,
      };
      contradictions.push(contradiction);

      if (isAllFailed) severeContradictionsCount++;
      else moderateContradictionsCount++;
    }

    // Contradiction Rule C: High Claim vs Repeated Task Procrastination
    const problemTasks = contradictingEvidence.filter((e) => e.source === 'task');
    if (bucket.claimedProficiency >= 3 && problemTasks.length > 0) {
      const contradiction: EvidenceContradiction = {
        id: `contra-task-${bucket.skillName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        skillName: bucket.skillName,
        claimedProficiency: bucket.claimedProficiency,
        contradictoryEvidenceIds: problemTasks.map((t) => t.id),
        severity: 'MILD',
        reason: `Execution friction detected: ${problemTasks.length} task(s) related to ${bucket.skillName} were repeatedly postponed or cancelled.`,
      };
      contradictions.push(contradiction);
      mildContradictionsCount++;
    }

    // Contradiction Rule D: Advanced Claim with Zero Empirical Evidence
    if (bucket.claimedProficiency >= 4 && externallyVerifiedCount === 0 && observedCount === 0) {
      const contradiction: EvidenceContradiction = {
        id: `contra-unverified-${bucket.skillName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        skillName: bucket.skillName,
        claimedProficiency: bucket.claimedProficiency,
        contradictoryEvidenceIds: bucket.records.map((r) => r.id),
        severity: 'MODERATE',
        reason: `Advanced proficiency self-claimed (${bucket.claimedProficiency}/5), but there is zero observed project activity or externally verified telemetry to substantiate this claim.`,
      };
      contradictions.push(contradiction);
      moderateContradictionsCount++;
    }

    // 5. Detect Missing / Insufficient Evidence
    const missingEvidence: MissingEvidenceRequirement[] = [];

    // Missing Rule A: Missing External Verification
    if (externallyVerifiedCount === 0 && bucket.hasExplicitClaim) {
      missingEvidence.push({
        skillName: bucket.skillName,
        requiredClassification: 'EXTERNALLY_VERIFIED',
        description: `No tamper-resistant third-party proof (GitHub commit/PR or LeetCode submission) found for ${bucket.skillName}.`,
        recommendedAction: `Push a relevant codebase to GitHub or complete a LeetCode problem demonstrating ${bucket.skillName}.`,
      });
      totalMissingRequirements++;
    }

    // Missing Rule B: Missing Observed Practice or Projects
    if (observedCount === 0 && externallyVerifiedCount === 0 && bucket.hasExplicitClaim) {
      missingEvidence.push({
        skillName: bucket.skillName,
        requiredClassification: 'OBSERVED',
        description: `No practical project repository, focused study time, or completed tasks logged for ${bucket.skillName}.`,
        recommendedAction: `Log a dedicated focus session or create an active project incorporating ${bucket.skillName}.`,
      });
      totalMissingRequirements++;
    }

    // Missing Rule C: Evidence is Stale
    if (freshness.isStale && (externallyVerifiedCount > 0 || observedCount > 0)) {
      missingEvidence.push({
        skillName: bucket.skillName,
        requiredClassification: 'OBSERVED',
        description: `Latest empirical evidence is ${freshness.daysSinceNewest} days old (exceeds ${stalenessThresholdDays}-day recency window).`,
        recommendedAction: `Perform a fresh practice session or commit new code to verify the skill has not atrophied.`,
      });
      totalMissingRequirements++;
    }

    // Missing Rule D: Unresolved Mistakes Without Counter-Evidence
    if (contradictingEvidence.length > 0 && supportingEvidence.length === 0) {
      missingEvidence.push({
        skillName: bucket.skillName,
        requiredClassification: 'OBSERVED',
        description: `Logged errors/mistakes remain uncountered by any verified successful implementations.`,
        recommendedAction: `Demonstrate adherence to logged prevention rules in a new project task or practice session.`,
      });
      totalMissingRequirements++;
    }

    corroboratedSkills.push({
      skillId: bucket.skillId,
      skillName: bucket.skillName,
      category: bucket.category,
      claimedProficiency: bucket.claimedProficiency,
      hasExplicitClaim: bucket.hasExplicitClaim,
      supportingEvidence,
      contradictingEvidence,
      neutralEvidence,
      classificationCounts: {
        externallyVerified: externallyVerifiedCount,
        observed: observedCount,
        inferred: inferredCount,
        selfReported: selfReportedCount,
      },
      contradictions,
      missingEvidence,
      freshness,
      lastEvaluatedAt: evaluatedAt,
    });
  }

  // 6. Limitations & Caveats
  const limitations: string[] = [
    'Automated multiple-choice / conceptual quiz telemetry is currently unmonitored.',
    'External ground truth is constrained to connected GitHub and LeetCode API credentials.',
  ];

  if (unmappedEvidence.length > 0) {
    limitations.push(
      `${unmappedEvidence.length} evidence record(s) could not be safely attributed to a specific skill and were preserved in unmappedEvidence rather than guessed.`
    );
  }

  return {
    evaluatedAt,
    totalSkillsEvaluated: corroboratedSkills.length,
    skills: corroboratedSkills,
    unmappedEvidence,
    contradictionSummary: {
      totalContradictions:
        severeContradictionsCount + moderateContradictionsCount + mildContradictionsCount,
      severeCount: severeContradictionsCount,
      moderateCount: moderateContradictionsCount,
      mildCount: mildContradictionsCount,
    },
    missingEvidenceSummary: {
      totalRequirements: totalMissingRequirements,
      unverifiedSkillCount,
      staleSkillCount,
    },
    limitations,
  };
}

/**
 * Async Convenience Handler: Runs Evidence Collection (1B) and Corroboration Engine (1C) in sequence.
 */
export async function evaluateStudentCorroboration(
  options?: CorroborationOptions
): Promise<CorroborationResult> {
  const collectionResult = await collectStudentEvidence();
  return corroborateStudentEvidence(collectionResult, options);
}
