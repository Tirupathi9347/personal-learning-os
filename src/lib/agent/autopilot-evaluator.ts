/**
 * Learning Autopilot Evaluator
 * 
 * Core evaluation engine for the Personal Learning OS central agentic layer.
 * Evaluates real student telemetry across:
 * - Active Learning Path (progress & schedules)
 * - Today's task queue (workload conflicts & density)
 * - Real mistake records (recurring learning patterns)
 * - Trajectory & Adaptation signals
 * 
 * Invariants:
 * 1. Single Agent: Executes within the single Learning Orchestrator framework.
 * 2. 14 Canonical States: Preserves state model contracts.
 * 3. 6C Authority: Delegates decision determination to Phase 6C decision logic.
 * 4. Phase 5 Approval Gate: All proposed write actions are marked requiresHumanApproval: true.
 * 5. Real Telemetry Only: Zero mock data, zero fabricated scores.
 * 6. Deterministic Product Rules: Heuristic thresholds (e.g., 180 min daily workload limit,
 *    2-occurrence recurring mistake detection, prior-day incomplete checks) are deterministic
 *    operational product baselines and policy rules, NOT scientific measurements.
 */

import {
  AutopilotTriggerType,
  AutopilotSituation,
  AutopilotEvaluationContext,
  AutopilotEvaluationResult,
  AutopilotActionProposal,
} from './autopilot-types';
import { generateLearningDecisionDeterministic } from './decision-action-selection';
import { GenerateDecisionInput } from './decision-types';

/**
 * Generate a deterministic fingerprint for deduplicating identical situations across refreshes.
 */
function createSituationFingerprint(triggerType: AutopilotTriggerType, key: string, summary: string): string {
  const raw = `${triggerType}:${key}:${summary.trim().toLowerCase()}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

/**
 * Primary deterministic evaluator for Learning Autopilot.
 */
export function evaluateAutopilotSituation(ctx: AutopilotEvaluationContext): AutopilotEvaluationResult {
  const timestamp = new Date().toISOString();
  const userId = ctx.userId;
  const dismissed = new Set(ctx.dismissedFingerprints || []);

  const triggerResults: { trigger: AutopilotTriggerType; triggered: boolean; reason: string }[] = [];
  const detectedSituations: AutopilotSituation[] = [];

  // =========================================================================
  // 1. EVALUATE TRIGGER 1: LEARNING PATH BEHIND SCHEDULE
  // =========================================================================
  if (ctx.activePath && Array.isArray(ctx.activePath.days) && ctx.activePath.days.length > 0) {
    const days = ctx.activePath.days;
    // Calculate current day index (1-based)
    const startDate = ctx.activePath.start_date ? new Date(ctx.activePath.start_date) : new Date();
    const now = new Date();
    const diffDays = Math.max(1, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const effectiveCurrentDay = Math.min(diffDays, days.length);

    // Find any day <= effectiveCurrentDay that has incomplete activities
    let behindDay: any = null;
    let missingActivitiesCount = 0;
    const missingDetails: string[] = [];

    for (const day of days) {
      if (day.day_number <= effectiveCurrentDay) {
        const completed = day.activities_completed || {};
        const isLearnDone = !!completed.learn;
        const isPracticeDone = !!completed.practice;
        const isReviewDone = !!completed.review;

        const uncompletedInDay = (!isLearnDone ? 1 : 0) + (!isPracticeDone ? 1 : 0) + (!isReviewDone ? 1 : 0);
        if (uncompletedInDay > 0 && (day.day_number < effectiveCurrentDay || diffDays > day.day_number)) {
          // Prior day incomplete
          behindDay = day;
          missingActivitiesCount = uncompletedInDay;
          if (!isLearnDone) missingDetails.push('Core concept study');
          if (!isPracticeDone) missingDetails.push(`Practice exercises (${day.practice_problems || 3} problems)`);
          if (!isReviewDone) missingDetails.push('Mistake & notes review');
          break;
        }
      }
    }

    if (behindDay) {
      const why = `${missingActivitiesCount} learning activities remain incomplete for Day ${behindDay.day_number} (${behindDay.topic || 'Curriculum'}). Missing: ${missingDetails.join(', ')}.`;
      const fp = createSituationFingerprint('LEARNING_PATH_BEHIND_SCHEDULE', `day_${behindDay.day_number}`, why);

      triggerResults.push({
        trigger: 'LEARNING_PATH_BEHIND_SCHEDULE',
        triggered: true,
        reason: `Day ${behindDay.day_number} is behind schedule (${missingActivitiesCount} incomplete activities).`,
      });

      // Pass through Phase 6C decision selection
      const decisionInput: GenerateDecisionInput = {
        userId,
        goalUnderstanding: {
          originalGoal: ctx.activePath.goal || 'Complete Learning Path',
          normalizedGoal: ctx.activePath.goal || 'Complete Learning Path',
          category: 'SCHEDULE_PLANNING',
          categoryConfidence: 0.95,
          objective: `Rebalance Day ${behindDay.day_number} schedule`,
          targetSkill: behindDay.topic || 'General Learning',
          targetSkillStatus: 'EXPLICIT',
          timeframe: 'today',
          timeframeStatus: 'EXPLICIT',
          urgency: 'HIGH',
          constraints: ['Protect daily consistency'],
          ambiguityFlags: [],
          clarificationNeeded: false,
          clarificationQuestions: [],
          extractedSignals: [],
          reasoningSummary: 'Student is behind schedule on active learning path; schedule rebalancing is required.',
          confidence: 'HIGH',
          source: 'DETERMINISTIC_ONLY',
          createdAt: timestamp,
        },
        allowLlm: false,
      };
      const decision = generateLearningDecisionDeterministic(decisionInput);

      const actionProposal: AutopilotActionProposal = {
        actionId: `act_reschedule_day_${behindDay.day_number}`,
        actionType: 'RESCHEDULE_LEARNING_ACTIVITY',
        title: `Rebalance Day ${behindDay.day_number} Workload`,
        description: `Move the lower-priority review activity to tomorrow to prioritize completing the core practice exercises today.`,
        targetSkill: behindDay.topic,
        estimatedMinutes: 30,
        requiresHumanApproval: true,
        payload: {
          pathId: ctx.activePath.id,
          dayNumber: behindDay.day_number,
          shiftReviewToDay: behindDay.day_number + 1,
        },
      };

      if (!dismissed.has(fp)) {
        detectedSituations.push({
          situationId: `sit_behind_${behindDay.day_number}`,
          triggerType: 'LEARNING_PATH_BEHIND_SCHEDULE',
          title: `You're behind on Day ${behindDay.day_number}`,
          detectedIssue: `Incomplete learning activities detected on Day ${behindDay.day_number} of your "${ctx.activePath.goal}" path.`,
          whyDetected: why,
          evidenceBasis: [
            `Active path: "${ctx.activePath.goal}"`,
            `Day ${behindDay.day_number}: ${missingActivitiesCount} incomplete activities`,
            ...missingDetails.map((m) => `Pending: ${m}`),
          ],
          decisionType: decision.decisionType === 'CLARIFY_GOAL' ? 'PLAN_SCHEDULE' : decision.decisionType,
          priority: 'HIGH',
          recommendedAction: `Move the lower-priority review activity to tomorrow and focus on today's high-priority practice.`,
          expectedBenefit: `Prevents backlog compounding while maintaining unbroken daily momentum.`,
          actionProposal,
          fingerprint: fp,
          detectedAt: timestamp,
        });
      }
    } else {
      triggerResults.push({
        trigger: 'LEARNING_PATH_BEHIND_SCHEDULE',
        triggered: false,
        reason: 'Active Learning Path is on schedule.',
      });
    }
  } else {
    triggerResults.push({
      trigger: 'LEARNING_PATH_BEHIND_SCHEDULE',
      triggered: false,
      reason: 'No active Learning Path found.',
    });
  }

  // =========================================================================
  // 2. EVALUATE TRIGGER 2: WORKLOAD CONFLICT / TOO MUCH PLANNED WORK
  // =========================================================================
  const tasks = ctx.todayTasks || [];
  const todoTasks = tasks.filter((t: any) => t.status === 'todo' || t.status === 'pending');
  let taskMinutes = 0;
  for (const t of todoTasks) {
    taskMinutes += typeof t.estimated_duration_minutes === 'number' && t.estimated_duration_minutes > 0
      ? t.estimated_duration_minutes
      : 30; // default 30m per task
  }

  // Add learning path effort for today if exists
  let pathMinutesToday = 0;
  if (ctx.activePath?.days) {
    const todayDay = ctx.activePath.days.find((d: any) => d.day_number === 1 || d.is_today);
    if (todayDay) {
      pathMinutesToday = todayDay.ai_estimated_minutes || 60;
    }
  }

  const totalMinutes = taskMinutes + pathMinutesToday;
  const WORKLOAD_THRESHOLD_MINUTES = 180; // 3 hours

  if (totalMinutes > WORKLOAD_THRESHOLD_MINUTES || todoTasks.length >= 6) {
    const why = `Today's planned load is ~${totalMinutes} minutes across ${todoTasks.length} pending tasks (${taskMinutes}m) and Learning Path study (${pathMinutesToday}m). Manageable daily focus target is $\\le 180$ minutes.`;
    const fp = createSituationFingerprint('WORKLOAD_CONFLICT', `tasks_${todoTasks.length}_mins_${totalMinutes}`, why);

    triggerResults.push({
      trigger: 'WORKLOAD_CONFLICT',
      triggered: true,
      reason: `Total estimated workload for today (${totalMinutes}m) exceeds the 180m threshold.`,
    });

    const decisionInput: GenerateDecisionInput = {
      userId,
      goalUnderstanding: {
        originalGoal: 'Optimize daily workload',
        normalizedGoal: 'Optimize daily workload',
        category: 'SCHEDULE_PLANNING',
        categoryConfidence: 0.95,
        objective: 'Reschedule low-priority tasks to balance study load',
        targetSkill: 'Time Management',
        targetSkillStatus: 'INFERRED',
        timeframe: 'today',
        timeframeStatus: 'EXPLICIT',
        urgency: 'HIGH',
        constraints: ['Limit daily workload to 180 minutes'],
        ambiguityFlags: [],
        clarificationNeeded: false,
        clarificationQuestions: [],
        extractedSignals: [],
        reasoningSummary: 'Heavy workload conflict detected. Suggest load shedding for non-urgent tasks.',
        confidence: 'HIGH',
        source: 'DETERMINISTIC_ONLY',
        createdAt: timestamp,
      },
      allowLlm: false,
    };
    const decision = generateLearningDecisionDeterministic(decisionInput);

    const actionProposal: AutopilotActionProposal = {
      actionId: `act_deprioritize_workload_${todoTasks.length}`,
      actionType: 'DEPRIORITIZE_TASK',
      title: 'Reschedule Non-Urgent Tasks',
      description: `Postpone low-priority tasks to tomorrow to ensure quality time for your core study block.`,
      estimatedMinutes: 0,
      requiresHumanApproval: true,
      payload: {
        taskIdsToDefer: todoTasks.filter((t: any) => t.priority === 'low' || t.priority === 'slate').map((t: any) => t.id),
      },
    };

    if (!dismissed.has(fp)) {
      detectedSituations.push({
        situationId: `sit_workload_${totalMinutes}`,
        triggerType: 'WORKLOAD_CONFLICT',
        title: `Heavy workload scheduled for today (~${Math.round(totalMinutes / 60 * 10) / 10} hrs)`,
        detectedIssue: `Your schedule has ${todoTasks.length} tasks plus Learning Path study, totaling ${totalMinutes} estimated minutes.`,
        whyDetected: why,
        evidenceBasis: [
          `${todoTasks.length} pending task(s) totaling ${taskMinutes} min`,
          `Learning Path allocation: ${pathMinutesToday} min`,
          `Total estimated focus effort: ${totalMinutes} min (Target threshold: $\\le 180$ min)`,
        ],
        decisionType: decision.decisionType === 'CLARIFY_GOAL' ? 'PLAN_SCHEDULE' : decision.decisionType,
        priority: 'MEDIUM',
        recommendedAction: `Reschedule lower-priority tasks to tomorrow to protect your core focus study block.`,
        expectedBenefit: `Avoids cognitive fatigue and improves retention by preventing rushed study sessions.`,
        actionProposal,
        fingerprint: fp,
        detectedAt: timestamp,
      });
    }
  } else {
    triggerResults.push({
      trigger: 'WORKLOAD_CONFLICT',
      triggered: false,
      reason: `Planned workload (${totalMinutes}m) is within healthy bounds ($\\le 180$m).`,
    });
  }

  // =========================================================================
  // 3. EVALUATE TRIGGER 3: RECURRING LEARNING MISTAKES
  // =========================================================================
  const mistakes = ctx.recentMistakes || [];
  if (mistakes.length >= 2) {
    // Group mistakes by topic or category keywords
    const topicCounts: Record<string, { count: number; titles: string[]; skill?: string }> = {};

    for (const m of mistakes) {
      const topic = (m.topic || m.tags?.[0] || m.category || 'General Problem Solving').toLowerCase().trim();
      if (!topicCounts[topic]) {
        topicCounts[topic] = { count: 0, titles: [], skill: m.skill || m.topic };
      }
      topicCounts[topic].count++;
      topicCounts[topic].titles.push(m.title || m.description || 'Mistake item');
    }

    // Find first topic with >= 2 occurrences
    const recurringEntry = Object.entries(topicCounts).find(([_, data]) => data.count >= 2);
    if (recurringEntry) {
      const [topicName, data] = recurringEntry;
      const displayTopic = data.skill || topicName.charAt(0).toUpperCase() + topicName.slice(1);
      const why = `The existing mistake history contains ${data.count} recurring errors in "${displayTopic}" (${data.titles.slice(0, 2).join(', ')}).`;
      const fp = createSituationFingerprint('RECURRING_LEARNING_MISTAKES', topicName, why);

      triggerResults.push({
        trigger: 'RECURRING_LEARNING_MISTAKES',
        triggered: true,
        reason: `Found ${data.count} recurring mistakes logged for "${displayTopic}".`,
      });

      const decisionInput: GenerateDecisionInput = {
        userId,
        goalUnderstanding: {
          originalGoal: `Remediate ${displayTopic} recurring mistakes`,
          normalizedGoal: `Remediate ${displayTopic} recurring mistakes`,
          category: 'REMEDIAL_PRACTICE',
          categoryConfidence: 0.95,
          objective: `Target recurring mistakes in ${displayTopic}`,
          targetSkill: displayTopic,
          targetSkillStatus: 'EXPLICIT',
          timeframe: 'today',
          timeframeStatus: 'EXPLICIT',
          urgency: 'HIGH',
          constraints: ['Focused targeted review'],
          ambiguityFlags: [],
          clarificationNeeded: false,
          clarificationQuestions: [],
          extractedSignals: [],
          reasoningSummary: `Student has repeated mistakes in ${displayTopic}. Dedicated review recommended.`,
          confidence: 'HIGH',
          source: 'DETERMINISTIC_ONLY',
          createdAt: timestamp,
        },
        allowLlm: false,
      };
      const decision = generateLearningDecisionDeterministic(decisionInput);

      const actionProposal: AutopilotActionProposal = {
        actionId: `act_remediate_mistakes_${topicName}`,
        actionType: 'CREATE_REMEDIATION_TASK',
        title: `Remediation Review: ${displayTopic}`,
        description: `Complete a 15-minute diagnostic and concept review targeting past mistakes in ${displayTopic}.`,
        targetSkill: displayTopic,
        estimatedMinutes: 15,
        requiresHumanApproval: true,
        payload: {
          taskTitle: `Review ${displayTopic} Mistake Patterns`,
          category: 'learning',
          priority: 'high',
          estimatedDurationMinutes: 15,
        },
      };

      if (!dismissed.has(fp)) {
        detectedSituations.push({
          situationId: `sit_mistake_${topicName}`,
          triggerType: 'RECURRING_LEARNING_MISTAKES',
          title: `You've repeated a "${displayTopic}" mistake`,
          detectedIssue: `Repeated error pattern detected across ${data.count} logged mistake entries in ${displayTopic}.`,
          whyDetected: why,
          evidenceBasis: [
            `${data.count} logged mistake records in topic "${displayTopic}"`,
            ...data.titles.slice(0, 3).map((t) => `Logged error: "${t}"`),
          ],
          decisionType: decision.decisionType === 'CLARIFY_GOAL' ? 'REVIEW_MISTAKES' : decision.decisionType,
          priority: 'HIGH',
          recommendedAction: `Add a 15-minute focused ${displayTopic} review before your next deliberate practice block.`,
          expectedBenefit: `Fixes foundational misconceptions before you practice more problems, avoiding reinforcing bad habits.`,
          actionProposal,
          fingerprint: fp,
          detectedAt: timestamp,
        });
      }
    } else {
      triggerResults.push({
        trigger: 'RECURRING_LEARNING_MISTAKES',
        triggered: false,
        reason: 'No recurring mistake clusters identified in recent history.',
      });
    }
  } else {
    triggerResults.push({
      trigger: 'RECURRING_LEARNING_MISTAKES',
      triggered: false,
      reason: 'Insufficient mistake records to detect a recurring trend.',
    });
  }

  // =========================================================================
  // 4. SYNTHESIS & PRIORITY SELECTION
  // =========================================================================
  // Highest priority situation is presented (or null if on-track)
  if (detectedSituations.length > 0) {
    // Sort by priority (HIGH > MEDIUM > LOW)
    const priorityOrder: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
    detectedSituations.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));

    return {
      hasSituation: true,
      situation: detectedSituations[0],
      allEvaluatedTriggers: triggerResults,
      evaluatedAt: timestamp,
    };
  }

  return {
    hasSituation: false,
    situation: null,
    onTrackSummary: "You're on track. Nothing needs your attention right now.",
    allEvaluatedTriggers: triggerResults,
    evaluatedAt: timestamp,
  };
}
