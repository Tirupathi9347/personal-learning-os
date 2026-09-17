/**
 * Phase 6F: Longitudinal Learning Trajectory & Adaptation Signal Analyzer
 * 
 * Implements deterministic-first, LLM-augmented longitudinal intelligence
 * for the SINGLE Learning Orchestrator.
 * 
 * Answers: "How is the student's learning trajectory changing over time?"
 * 
 * Core Rules:
 * 1. Strictly Observational: 0 decisions (6C responsibility), 0 database mutations, 0 skill mutations.
 * 2. Zero Historical Fabrication: Never manufactures historical skill scores, trends, or assessments. Missing history is explicitly flagged as INSUFFICIENT_HISTORY.
 * 3. Epistemic Preservation: Uses Phase 1 evidence classifications and Phase 6E outcomes.
 * 4. Zero Psychological Inference: Strictly tracks observable telemetry; never infers motivation, intelligence, or personality.
 * 5. Full Deterministic Authority: Deterministic signals and classifications are authoritative. Gemini is optional for human-readable summaries only.
 */

import {
  EvidenceRecord,
  Mistake,
  TimeSession,
  GitHubActivityLog,
  LeetCodeSubmission,
  Task,
  StudentCorroborationAuditResult,
  CorroborationResult,
} from './types';
import {
  LearningPlan,
} from './planning-types';
import {
  LearningOutcome,
  LearningFeedback,
} from './outcome-feedback-types';
import {
  HistorySufficiency,
  TrajectoryDirection,
  TrajectorySignalType,
  TrajectoryObservation,
  SkillTrajectory,
  ActivityTrajectory,
  MistakeTrajectory,
  OutcomeTrajectory,
  ContradictionTrajectory,
  LearningTrajectory,
  AnalyzeTrajectoryInput,
  LearningTrajectoryResult,
  TrajectoryLlmClient,
} from './trajectory-types';
import { getResolvedGeminiConfig } from '@/lib/ai/gemini';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AgentRunState } from './state-types';
import { UpdatingHandlerResult } from './orchestrator-types';
import { sanitizeWorkingMemory } from './run-persistence';

export * from './trajectory-types';

/**
 * Deterministically analyzes historical learning telemetry and computes
 * longitudinal learning trajectory and adaptation signals.
 */
export function analyzeLearningTrajectoryDeterministic(
  input: AnalyzeTrajectoryInput
): LearningTrajectoryResult {
  const startTime = Date.now();
  const timestamp = input.timestamp || new Date().toISOString();
  const userId = input.userId;
  const currentEpoch = new Date(timestamp).getTime();

  const evidenceRecords = input.evidenceRecords || [];
  const mistakes = input.mistakes || [];
  const timeSessions = input.timeSessions || [];
  const githubActivity = input.githubActivity || [];
  const leetcodeSubmissions = input.leetcodeSubmissions || [];
  const tasks = input.tasks || [];
  const learningPlans = input.learningPlans || [];
  const learningOutcomes = input.learningOutcomes || [];
  const learningFeedbacks = input.learningFeedbacks || [];
  const assessments = input.assessments || [];

  // 1. Collect all valid timestamps across all entities to determine coverage & sufficiency
  const timestamps: number[] = [];
  const sourcesPresentSet = new Set<string>();

  for (const e of evidenceRecords) {
    if (e.observedAt) {
      const t = new Date(e.observedAt).getTime();
      if (!isNaN(t)) timestamps.push(t);
    }
    if (e.source) sourcesPresentSet.add(e.source);
  }

  for (const m of mistakes) {
    if (m.created_at) {
      const t = new Date(m.created_at).getTime();
      if (!isNaN(t)) timestamps.push(t);
    }
    sourcesPresentSet.add('mistake');
  }

  for (const s of timeSessions) {
    const sessionTime = s.started_at || s.session_date || s.created_at;
    if (sessionTime) {
      const t = new Date(sessionTime).getTime();
      if (!isNaN(t)) timestamps.push(t);
    }
    sourcesPresentSet.add('study_session');
  }

  for (const g of githubActivity) {
    const ghTime = g.occurred_at || g.created_at;
    if (ghTime) {
      const t = new Date(ghTime).getTime();
      if (!isNaN(t)) timestamps.push(t);
    }
    sourcesPresentSet.add('github');
  }

  for (const l of leetcodeSubmissions) {
    const lcTime = l.timestamp || l.created_at;
    if (lcTime) {
      const t = new Date(lcTime).getTime();
      if (!isNaN(t)) timestamps.push(t);
    }
    sourcesPresentSet.add('leetcode');
  }

  for (const t of tasks) {
    if (t.created_at) {
      const timeVal = new Date(t.created_at).getTime();
      if (!isNaN(timeVal)) timestamps.push(timeVal);
    }
    sourcesPresentSet.add('task');
  }

  for (const p of learningPlans) {
    if (p.createdAt) {
      const timeVal = new Date(p.createdAt).getTime();
      if (!isNaN(timeVal)) timestamps.push(timeVal);
    }
    sourcesPresentSet.add('learning_plan');
  }

  for (const o of learningOutcomes) {
    if (o.createdAt) {
      const timeVal = new Date(o.createdAt).getTime();
      if (!isNaN(timeVal)) timestamps.push(timeVal);
    }
    sourcesPresentSet.add('learning_outcome');
  }

  timestamps.sort((a, b) => a - b);

  const totalObservations = timestamps.length;
  const distinctDaysSet = new Set<string>();
  for (const t of timestamps) {
    const dayStr = new Date(t).toISOString().slice(0, 10);
    distinctDaysSet.add(dayStr);
  }
  const distinctObservationDays = distinctDaysSet.size;

  let timeSpanDays = 0;
  let minDateStr: string | undefined;
  let maxDateStr: string | undefined;

  if (totalObservations > 0) {
    const minTimestamp = timestamps[0];
    const maxTimestamp = timestamps[timestamps.length - 1];
    timeSpanDays = Math.max(0, Math.round((maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24)));
    minDateStr = new Date(minTimestamp).toISOString();
    maxDateStr = new Date(maxTimestamp).toISOString();
  }

  const totalTelemetryItems = evidenceRecords.length + mistakes.length + timeSessions.length + githubActivity.length + leetcodeSubmissions.length + tasks.length + learningPlans.length + learningOutcomes.length;
  const missingTimestampCount = Math.max(0, totalTelemetryItems - totalObservations);

  // 2. Determine History Sufficiency (Temporal Data Coverage Level)
  let historySufficiency: HistorySufficiency = 'NONE';
  if (totalObservations === 0) {
    historySufficiency = 'NONE';
  } else if (totalObservations < 2 || distinctObservationDays < 2 || timeSpanDays < 1) {
    historySufficiency = 'INSUFFICIENT';
  } else if (totalObservations < 5 || distinctObservationDays < 3 || timeSpanDays < 7) {
    historySufficiency = 'LIMITED';
  } else if (totalObservations < 10 || distinctObservationDays < 7 || timeSpanDays < 30) {
    historySufficiency = 'SUFFICIENT';
  } else {
    historySufficiency = 'STRONG';
  }

  const signals: TrajectoryObservation[] = [];
  const limitations: string[] = [];
  const retentionSignals: string[] = [];
  const decaySignals: string[] = [];
  const unresolvedEvidenceGaps: string[] = [];

  if (historySufficiency === 'NONE' || historySufficiency === 'INSUFFICIENT') {
    signals.push({
      signalId: `sig_insufficient_${Date.now()}_1`,
      type: 'INSUFFICIENT_HISTORY',
      description: 'Historical telemetry is insufficient to establish longitudinal trend direction.',
      confidence: 0.9,
      evidenceReferences: [],
    });
    limitations.push('Telemetry contains fewer than 2 observations, fewer than 2 distinct observation days, or spans less than 1 day. Insufficient longitudinal spread.');
  } else if (historySufficiency === 'LIMITED') {
    limitations.push('Telemetry spans a brief period (< 7 days) or few distinct observation days (< 3 days). Observed trends are preliminary.');
  }

  if (distinctObservationDays > 0 && distinctObservationDays < 3) {
    limitations.push('Telemetry is concentrated across very few distinct days; temporal spread is limited.');
  }
  if (timeSpanDays > 0 && timeSpanDays < 7) {
    limitations.push('Observation window is short (< 7 days).');
  }
  if (missingTimestampCount > 0) {
    limitations.push(`${missingTimestampCount} telemetry record(s) lack valid timestamps and were excluded from temporal trend calculations.`);
  }
  limitations.push('Longitudinal trajectory findings represent heuristic temporal observability based on available telemetry and do not constitute statistical proof or predictive certainty of learning.');

  // 3. Skill Trajectory Analysis
  const skillMap = new Map<string, {
    evidence: EvidenceRecord[];
    mistakes: Mistake[];
    submissions: LeetCodeSubmission[];
  }>();

  for (const e of evidenceRecords) {
    const sName = e.targetSkillName || 'General';
    if (!skillMap.has(sName)) skillMap.set(sName, { evidence: [], mistakes: [], submissions: [] });
    skillMap.get(sName)!.evidence.push(e);
  }

  for (const m of mistakes) {
    const sName = m.category || 'General';
    if (!skillMap.has(sName)) skillMap.set(sName, { evidence: [], mistakes: [], submissions: [] });
    skillMap.get(sName)!.mistakes.push(m);
  }

  for (const l of leetcodeSubmissions) {
    const sName = l.lang || 'General';
    if (!skillMap.has(sName)) skillMap.set(sName, { evidence: [], mistakes: [], submissions: [] });
    skillMap.get(sName)!.submissions.push(l);
  }

  // Window midpoint for comparing older vs recent half
  const windowStart = timestamps.length > 0 ? timestamps[0] : currentEpoch;
  const windowMidpoint = windowStart + (currentEpoch - windowStart) / 2;

  const skillTrajectories: SkillTrajectory[] = [];

  for (const [skillName, data] of Array.from(skillMap.entries())) {
    const skillEv = data.evidence;
    const supporting = skillEv.filter((e) => e.polarity === 'SUPPORTS');
    const contradicting = skillEv.filter((e) => e.polarity === 'CONTRADICTS');

    // Extract skill-specific timestamps
    const skillTimestamps: number[] = [];
    for (const e of skillEv) {
      if (e.observedAt) {
        const t = new Date(e.observedAt).getTime();
        if (!isNaN(t)) skillTimestamps.push(t);
      }
    }
    for (const m of data.mistakes) {
      if (m.created_at) {
        const t = new Date(m.created_at).getTime();
        if (!isNaN(t)) skillTimestamps.push(t);
      }
    }
    for (const l of data.submissions) {
      const lcTime = l.timestamp || l.created_at;
      if (lcTime) {
        const t = new Date(lcTime).getTime();
        if (!isNaN(t)) skillTimestamps.push(t);
      }
    }
    skillTimestamps.sort((a, b) => a - b);
    const skillDistinctDays = new Set(skillTimestamps.map((t) => new Date(t).toISOString().slice(0, 10))).size;
    const skillTimeSpanDays = skillTimestamps.length > 0
      ? Math.max(0, Math.round((skillTimestamps[skillTimestamps.length - 1] - skillTimestamps[0]) / (1000 * 60 * 60 * 24)))
      : 0;

    const isSkillHistorySufficient = skillTimestamps.length >= 2 && skillDistinctDays >= 2 && skillTimeSpanDays >= 1;

    const recentSupporting = supporting.filter((e) => new Date(e.observedAt).getTime() >= windowMidpoint);
    const earlierSupporting = supporting.filter((e) => new Date(e.observedAt).getTime() < windowMidpoint);

    const recentContradicting = contradicting.filter((e) => new Date(e.observedAt).getTime() >= windowMidpoint);
    const earlierContradicting = contradicting.filter((e) => new Date(e.observedAt).getTime() < windowMidpoint);

    const skillSignals: TrajectoryObservation[] = [];
    let direction: TrajectoryDirection = 'INSUFFICIENT_DATA';
    let retentionStatus: 'RETAINED' | 'POSSIBLE_DECAY' | 'STALE' | 'NOT_VERIFIABLE' = 'NOT_VERIFIABLE';

    if (historySufficiency === 'NONE' || historySufficiency === 'INSUFFICIENT' || !isSkillHistorySufficient) {
      direction = 'INSUFFICIENT_DATA';
      retentionStatus = 'NOT_VERIFIABLE';
    } else {
      // Direction classification
      if (recentSupporting.length > earlierSupporting.length && recentContradicting.length <= earlierContradicting.length) {
        direction = 'IMPROVING';
        const obs: TrajectoryObservation = {
          signalId: `sig_imp_${skillName}_${Date.now()}`,
          type: 'IMPROVING_EVIDENCE',
          description: `Supporting evidence frequency for ${skillName} increased in recent telemetry.`,
          skillName,
          confidence: 0.85,
          evidenceReferences: recentSupporting.map((e) => e.id),
        };
        skillSignals.push(obs);
        signals.push(obs);
      } else if (recentContradicting.length > earlierContradicting.length || (earlierSupporting.length > 0 && recentSupporting.length === 0)) {
        direction = 'DECLINING';
        const obs: TrajectoryObservation = {
          signalId: `sig_dec_${skillName}_${Date.now()}`,
          type: 'DECLINING_EVIDENCE',
          description: `Recent telemetry shows fewer supporting evidence items or increasing contradictions for ${skillName}.`,
          skillName,
          confidence: 0.8,
          evidenceReferences: recentContradicting.map((e) => e.id),
        };
        skillSignals.push(obs);
        signals.push(obs);
      } else {
        direction = 'STABLE';
        const obs: TrajectoryObservation = {
          signalId: `sig_stb_${skillName}_${Date.now()}`,
          type: 'STABLE_EVIDENCE',
          description: `Evidence volume and performance for ${skillName} remained consistent across observation window.`,
          skillName,
          confidence: 0.75,
          evidenceReferences: supporting.map((e) => e.id),
        };
        skillSignals.push(obs);
        signals.push(obs);
      }

      // Retention & Staleness Analysis (Observational Only)
      const oldEvidence = supporting.filter(
        (e) => (currentEpoch - new Date(e.observedAt).getTime()) > (30 * 24 * 60 * 60 * 1000)
      );

      if (oldEvidence.length > 0) {
        if (recentSupporting.length > 0) {
          retentionStatus = 'RETAINED';
          const rMsg = `Observable telemetry is consistent with retained performance for ${skillName} following historical baseline.`;
          retentionSignals.push(rMsg);
          signals.push({
            signalId: `sig_ret_${skillName}_${Date.now()}`,
            type: 'RETENTION_SIGNAL',
            description: rMsg,
            skillName,
            confidence: 0.85,
            evidenceReferences: [...oldEvidence.map((e) => e.id), ...recentSupporting.map((e) => e.id)],
          });
        } else if (recentContradicting.length > 0) {
          retentionStatus = 'POSSIBLE_DECAY';
          const dMsg = `Observable telemetry is consistent with possible decline/errors for ${skillName} following historical baseline.`;
          decaySignals.push(dMsg);
          signals.push({
            signalId: `sig_decay_${skillName}_${Date.now()}`,
            type: 'DECLINING_EVIDENCE',
            description: dMsg,
            skillName,
            confidence: 0.8,
            evidenceReferences: recentContradicting.map((e) => e.id),
          });
        } else {
          retentionStatus = 'STALE';
          const sMsg = `Primary supporting evidence for ${skillName} is older than 90 days without recent refreshing telemetry.`;
          decaySignals.push(sMsg);
          signals.push({
            signalId: `sig_stale_${skillName}_${Date.now()}`,
            type: 'STALE_EVIDENCE',
            description: sMsg,
            skillName,
            confidence: 0.85,
            evidenceReferences: oldEvidence.map((e) => e.id),
          });
        }
      } else {
        retentionStatus = 'NOT_VERIFIABLE';
      }
    }

    skillTrajectories.push({
      skillName,
      direction,
      totalSupportingEvidence: supporting.length,
      totalContradictingEvidence: contradicting.length,
      recentSupportingCount: recentSupporting.length,
      recentContradictingCount: recentContradicting.length,
      mistakeCount: data.mistakes.length,
      retentionStatus,
      signals: skillSignals,
      summary: `Skill ${skillName}: ${direction} trend (${supporting.length} supporting, ${contradicting.length} contradicting evidence items).`,
    });
  }

  // 4. Activity Trajectory Analysis
  const totalTrackedStudyMinutes = timeSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
  const completedTasksCount = tasks.filter((t) => t.status === 'completed').length;
  const totalGitHubEvents = githubActivity.length;
  const totalLeetCodeSubmissions = leetcodeSubmissions.length;

  let activityDirection: TrajectoryDirection = 'INSUFFICIENT_DATA';
  if (historySufficiency === 'NONE' || historySufficiency === 'INSUFFICIENT') {
    activityDirection = 'INSUFFICIENT_DATA';
  } else {
    // Compare total activity in recent half vs earlier half
    const recentSessions = timeSessions.filter((s) => {
      const t = new Date(s.started_at || s.session_date || s.created_at).getTime();
      return !isNaN(t) && t >= windowMidpoint;
    });
    const earlierSessions = timeSessions.filter((s) => {
      const t = new Date(s.started_at || s.session_date || s.created_at).getTime();
      return !isNaN(t) && t < windowMidpoint;
    });

    const recentSubmissions = leetcodeSubmissions.filter((l) => {
      const t = new Date(l.timestamp || l.created_at).getTime();
      return !isNaN(t) && t >= windowMidpoint;
    });
    const earlierSubmissions = leetcodeSubmissions.filter((l) => {
      const t = new Date(l.timestamp || l.created_at).getTime();
      return !isNaN(t) && t < windowMidpoint;
    });

    const recentCommits = githubActivity.filter((g) => {
      const t = new Date(g.occurred_at || g.created_at).getTime();
      return !isNaN(t) && t >= windowMidpoint;
    });
    const earlierCommits = githubActivity.filter((g) => {
      const t = new Date(g.occurred_at || g.created_at).getTime();
      return !isNaN(t) && t < windowMidpoint;
    });

    const recentActivityScore = recentSessions.length + recentSubmissions.length + recentCommits.length;
    const earlierActivityScore = earlierSessions.length + earlierSubmissions.length + earlierCommits.length;

    if (recentActivityScore > earlierActivityScore * 1.25) {
      activityDirection = 'INCREASING';
      signals.push({
        signalId: `sig_act_inc_${Date.now()}`,
        type: 'INCREASING_ACTIVITY',
        description: 'Observable student activity volume (sessions, submissions, commits) has increased over time.',
        confidence: 0.85,
        evidenceReferences: [],
      });
    } else if (earlierActivityScore > recentActivityScore * 1.25 && earlierActivityScore > 0) {
      activityDirection = 'DECREASING';
      signals.push({
        signalId: `sig_act_dec_${Date.now()}`,
        type: 'DECREASING_ACTIVITY',
        description: 'Observable student activity volume decreased in the recent observation window.',
        confidence: 0.8,
        evidenceReferences: [],
      });
    } else if (recentActivityScore > 0 || earlierActivityScore > 0) {
      activityDirection = 'STABLE';
    } else {
      activityDirection = 'INSUFFICIENT_DATA';
    }
  }

  const activityTrajectory: ActivityTrajectory = {
    direction: activityDirection,
    completedTasksCount,
    totalTrackedStudyMinutes,
    totalGitHubEvents,
    totalLeetCodeSubmissions,
    recentActivitySummary: `Recorded ${completedTasksCount} completed tasks, ${totalTrackedStudyMinutes} focus minutes, ${totalGitHubEvents} GitHub events, ${totalLeetCodeSubmissions} LeetCode submissions.`,
  };

  // 5. Mistake Trajectory Analysis
  const totalMistakesCount = mistakes.length;
  const categoryCounts = new Map<string, number>();
  for (const m of mistakes) {
    const cat = m.category || 'General';
    categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  }

  const recurringCategories: string[] = [];
  for (const [cat, count] of Array.from(categoryCounts.entries())) {
    if (count >= 2) recurringCategories.push(cat);
  }

  let mistakePattern: 'PERSISTENT_MISTAKE_PATTERN' | 'IMPROVING_MISTAKE_PATTERN' | 'RESOLVED_MISTAKE_PATTERN' | 'INSUFFICIENT_MISTAKE_HISTORY' = 'INSUFFICIENT_MISTAKE_HISTORY';

  if (totalMistakesCount < 2 || historySufficiency === 'NONE' || historySufficiency === 'INSUFFICIENT') {
    mistakePattern = 'INSUFFICIENT_MISTAKE_HISTORY';
  } else if (recurringCategories.length > 0) {
    // Check if recurring categories appeared in recent half
    const recentMistakes = mistakes.filter((m) => new Date(m.created_at).getTime() >= windowMidpoint);
    const hasRecentRecurring = recentMistakes.some((m) => recurringCategories.includes(m.category || 'General'));

    if (hasRecentRecurring) {
      mistakePattern = 'PERSISTENT_MISTAKE_PATTERN';
      signals.push({
        signalId: `sig_mstk_rec_${Date.now()}`,
        type: 'RECURRING_MISTAKE_PATTERN',
        description: `Recurring mistake patterns observed in categories: ${recurringCategories.join(', ')}.`,
        confidence: 0.85,
        evidenceReferences: recentMistakes.map((m) => m.id),
      });
    } else {
      mistakePattern = 'RESOLVED_MISTAKE_PATTERN';
      signals.push({
        signalId: `sig_mstk_res_${Date.now()}`,
        type: 'MISTAKE_RESOLUTION',
        description: `Prior recurring mistake patterns in ${recurringCategories.join(', ')} have zero occurrences in recent telemetry.`,
        confidence: 0.8,
        evidenceReferences: [],
      });
    }
  } else {
    mistakePattern = 'IMPROVING_MISTAKE_PATTERN';
  }

  const mistakeTrajectory: MistakeTrajectory = {
    pattern: mistakePattern,
    totalMistakesCount,
    recurringCategories,
    resolvedCategoriesCount: mistakePattern === 'RESOLVED_MISTAKE_PATTERN' ? recurringCategories.length : 0,
    activeUnresolvedCategories: mistakePattern === 'PERSISTENT_MISTAKE_PATTERN' ? recurringCategories : [],
    summary: `Mistake pattern: ${mistakePattern} (${totalMistakesCount} total logged mistakes, ${recurringCategories.length} recurring categories).`,
  };

  // 6. Outcome Trajectory Analysis (Phase 6E Integration)
  const totalPlansCount = learningPlans.length;
  const completedPlansCount = learningPlans.filter((p) => p.status === 'COMPLETED').length;
  const partiallyCompletedPlansCount = learningPlans.filter((p) => p.status === 'EXECUTING' || (p.status as any) === 'IN_PROGRESS').length;
  const blockedPlansCount = learningPlans.filter((p) => p.status === 'BLOCKED').length;
  const failedPlansCount = learningPlans.filter((p) => p.status === 'FAILED').length;

  const verifiedOutcomesCount = learningOutcomes.filter((o) => o.learningOutcomeStatus === 'VERIFIED_SUCCESS').length;
  const insufficientEvidenceOutcomesCount = learningOutcomes.filter((o) => o.learningOutcomeStatus === 'INSUFFICIENT_EVIDENCE').length;
  const contradictedOutcomesCount = learningOutcomes.filter((o) => o.learningOutcomeStatus === 'CONTRADICTED').length;

  if (blockedPlansCount > 0 && blockedPlansCount >= completedPlansCount) {
    signals.push({
      signalId: `sig_plan_blk_${Date.now()}`,
      type: 'PLAN_BLOCKAGE_PATTERN',
      description: 'Multiple learning plans have encountered execution blockages due to unavailable environment capabilities.',
      confidence: 0.85,
      evidenceReferences: learningPlans.filter((p) => p.status === 'BLOCKED').map((p) => p.planId),
    });
  } else if (completedPlansCount > 0 && verifiedOutcomesCount > 0) {
    signals.push({
      signalId: `sig_plan_comp_${Date.now()}`,
      type: 'PLAN_COMPLETION_PATTERN',
      description: 'Consistent execution and empirical verification across planned learning workflows.',
      confidence: 0.9,
      evidenceReferences: learningPlans.filter((p) => p.status === 'COMPLETED').map((p) => p.planId),
    });
  }

  const outcomeTrajectory: OutcomeTrajectory = {
    totalPlansCount,
    completedPlansCount,
    partiallyCompletedPlansCount,
    blockedPlansCount,
    failedPlansCount,
    verifiedOutcomesCount,
    insufficientEvidenceOutcomesCount,
    contradictedOutcomesCount,
    summary: `Plans: ${completedPlansCount} completed, ${blockedPlansCount} blocked, ${failedPlansCount} failed. Outcomes: ${verifiedOutcomesCount} verified, ${insufficientEvidenceOutcomesCount} unverified.`,
  };

  // 7. Contradiction Trajectory
  const emergingContradictions: string[] = [];
  const resolvedContradictions: string[] = [];
  const unresolvedContradictions: string[] = [];

  for (const o of learningOutcomes) {
    for (const c of o.contradictions) {
      if (!unresolvedContradictions.includes(c)) {
        unresolvedContradictions.push(c);
      }
    }
  }

  for (const a of assessments) {
    if ('contradictions' in a && Array.isArray((a as any).contradictions)) {
      for (const c of (a as any).contradictions) {
        if (typeof c === 'string' && !unresolvedContradictions.includes(c)) {
          unresolvedContradictions.push(c);
        }
      }
    }
  }

  if (unresolvedContradictions.length > 0) {
    signals.push({
      signalId: `sig_contra_${Date.now()}`,
      type: 'CONTRADICTION_EMERGING',
      description: `Active contradictions present: ${unresolvedContradictions.join('; ')}.`,
      confidence: 0.9,
      evidenceReferences: [],
    });
  }

  const contradictionTrajectory: ContradictionTrajectory = {
    emergingContradictions,
    resolvedContradictions,
    unresolvedContradictions,
    summary: `${unresolvedContradictions.length} active contradiction(s) identified.`,
  };

  // 8. Collect Evidence Gaps
  for (const o of learningOutcomes) {
    for (const g of o.evidenceGaps) {
      if (!unresolvedEvidenceGaps.includes(g)) unresolvedEvidenceGaps.push(g);
    }
  }
  for (const f of learningFeedbacks) {
    for (const g of f.evidenceGaps) {
      if (!unresolvedEvidenceGaps.includes(g)) unresolvedEvidenceGaps.push(g);
    }
  }

  // 9. Overall Confidence & Summary
  let overallConfidence = 0.5;
  if (historySufficiency === 'STRONG') overallConfidence = 0.9;
  else if (historySufficiency === 'SUFFICIENT') overallConfidence = 0.8;
  else if (historySufficiency === 'LIMITED') overallConfidence = 0.65;
  else overallConfidence = 0.4;

  let summary = `Longitudinal analysis (${timeSpanDays} days span, sufficiency: ${historySufficiency}). `;
  if (skillTrajectories.length > 0) {
    summary += `Evaluated ${skillTrajectories.length} skill trajectory(s). `;
  }
  summary += `${activityTrajectory.recentActivitySummary} ${mistakeTrajectory.summary}`;

  const trajectoryId = `traj_${userId}_${Date.now()}`;
  const trajectory: LearningTrajectory = {
    trajectoryId,
    userId,
    observationWindow: {
      startDate: minDateStr,
      endDate: maxDateStr,
      windowDays: timeSpanDays,
    },
    dataCoverage: {
      totalObservations,
      totalTimestampedObservations: totalObservations,
      distinctObservationDays,
      timeSpanDays,
      observationSpanDays: timeSpanDays,
      sourcesPresent: Array.from(sourcesPresentSet),
      missingTimestampCount,
    },
    historySufficiency,
    skillTrajectories,
    activityTrajectory,
    mistakeTrajectory,
    outcomeTrajectory,
    contradictionTrajectory,
    signals,
    unresolvedEvidenceGaps,
    retentionSignals,
    decaySignals,
    confidence: overallConfidence,
    summary,
    limitations,
    source: 'DETERMINISTIC',
    createdAt: timestamp,
    metadata: input.metadata,
  };

  const evaluationTimeMs = Date.now() - startTime;
  return {
    trajectory,
    source: 'DETERMINISTIC',
    evaluationTimeMs,
  };
}

/**
 * Evaluates LearningTrajectory with optional Gemini LLM narrative summarization.
 * 
 * Strict Safety Invariant:
 * Deterministic signals, sufficiency ratings, and classifications are authoritative.
 * Gemini may ONLY summarize and provide human-readable explanations.
 */
export async function analyzeLearningTrajectoryAsync(
  input: AnalyzeTrajectoryInput,
  llmClient?: TrajectoryLlmClient | null
): Promise<LearningTrajectoryResult> {
  const deterministicResult = analyzeLearningTrajectoryDeterministic(input);

  if (input.allowLlm === false) {
    return deterministicResult;
  }

  try {
    let client: TrajectoryLlmClient | null = llmClient || null;

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

    const t = deterministicResult.trajectory;
    const prompt = `You are the Longitudinal Learning Intelligence component in a Personal Learning OS.
Summarize the factual longitudinal trajectory signals and observations for the student.

FACTUAL TRAJECTORY DATA:
- History Sufficiency: ${t.historySufficiency}
- Observation Window: ${t.dataCoverage.timeSpanDays} days (${t.dataCoverage.totalObservations} data points)
- Skill Trajectories: ${JSON.stringify(t.skillTrajectories.map((s) => ({ skill: s.skillName, direction: s.direction, retention: s.retentionStatus })))}
- Activity Trend: ${t.activityTrajectory.direction}
- Mistake Pattern: ${t.mistakeTrajectory.pattern}
- Signals: ${JSON.stringify(t.signals.map((s) => s.description))}
- Active Contradictions: ${JSON.stringify(t.contradictionTrajectory.unresolvedContradictions)}

RULES:
1. Do NOT invent historical data, scores, or trends not in the data.
2. Do NOT make psychological or personality inferences (no claims about motivation, discipline, laziness).
3. Provide a JSON object with a single key: "summary" (string).`;

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
    if (typeof parsed.summary === 'string' && parsed.summary.trim() !== '') {
      const augmentedTrajectory: LearningTrajectory = {
        ...t,
        summary: parsed.summary.trim(),
        source: 'GEMINI_AUGMENTED',
      };
      return {
        trajectory: augmentedTrajectory,
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
 * Creates an onUpdating handler integrating Phase 6F Longitudinal Trajectory Analysis
 * into the SINGLE Learning Orchestrator lifecycle.
 */
export function createTrajectoryAnalysisHandler(options?: {
  geminiClient?: TrajectoryLlmClient | null;
  allowLlm?: boolean;
  timestamp?: string;
}) {
  return async function onUpdating(state: AgentRunState): Promise<UpdatingHandlerResult> {
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const learningOutcome = memory.learningOutcome as LearningOutcome | undefined;
    const learningFeedback = memory.learningFeedback as LearningFeedback | undefined;

    const trajResult = await analyzeLearningTrajectoryAsync(
      {
        userId: state.userId,
        learningPlans: plan ? [plan] : [],
        learningOutcomes: learningOutcome ? [learningOutcome] : [],
        learningFeedbacks: learningFeedback ? [learningFeedback] : [],
        evidenceRecords: state.evidenceContext.collection?.records || [],
        allowLlm: options?.allowLlm ?? false,
        timestamp: options?.timestamp,
      },
      options?.geminiClient
    );

    const sanitizedUpdate = sanitizeWorkingMemory({
      ...memory,
      learningTrajectory: trajResult.trajectory,
    });

    return {
      hasMoreSteps: false,
      nextState: 'COMPLETED',
      reason: `Longitudinal trajectory evaluated (Sufficiency: ${trajResult.trajectory.historySufficiency}); advancing to COMPLETED.`,
      workingMemory: sanitizedUpdate,
    };
  };
}
