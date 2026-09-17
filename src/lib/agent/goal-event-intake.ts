/**
 * Feature 2C: Goal and Event Intake Engine for the Agentic Learning OS.
 * 
 * Provides:
 * - Strongly-typed, validated intake for manual student goals and automated system events.
 * - Text normalization preserving exact user meaning without hallucinated facts.
 * - Strict tenant isolation (rejects user ID mismatches against authenticated session).
 * - Safe conversion into AgentTriggerContext ready for the Learning Orchestrator.
 */

import {
  StudentGoalInput,
  SystemEventInput,
  AgentTriggerContext,
  IntakeResult,
  GoalCategory,
  SystemEventType,
  TriggerPriority,
} from './intake-types';
import {
  AgentRunState,
  AgentSafetyLimits,
  AgentEventTrigger,
} from './state-types';
import { createInitialAgentState } from './state-machine';

export const ALLOWED_SYSTEM_EVENT_TYPES: readonly SystemEventType[] = [
  'MISSED_TASK',
  'MISSED_STUDY_SESSION',
  'APPROACHING_DEADLINE',
  'NEW_ASSIGNMENT',
  'ASSESSMENT_RESULT_CHANGED',
  'GITHUB_ACTIVITY_CHANGE',
  'LEETCODE_SUBMISSION_EVENT',
  'SCHEDULED_AUDIT_TICK',
] as const;

export const ALLOWED_GOAL_CATEGORIES: readonly GoalCategory[] = [
  'EXAM_PREPARATION',
  'SKILL_IMPROVEMENT',
  'SCHEDULE_PLANNING',
  'CORROBORATION_AUDIT',
  'REMEDIAL_PRACTICE',
  'GENERAL_LEARNING',
] as const;

/**
 * Normalizes user-supplied goal text:
 * - Trims leading and trailing whitespace.
 * - Collapses internal whitespace/newlines.
 * - Removes non-printable control characters without altering wording.
 */
export function normalizeGoalText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Strip control chars
    .replace(/\s+/g, ' ') // Collapse multiple whitespace/newlines
    .trim();
}

/**
 * Deterministically categorizes a student goal based on explicit keywords.
 * Never fabricates facts or alters input.
 */
export function detectGoalCategory(normalizedText: string, explicitCategory?: GoalCategory): GoalCategory {
  if (explicitCategory && ALLOWED_GOAL_CATEGORIES.includes(explicitCategory)) {
    return explicitCategory;
  }

  const lower = normalizedText.toLowerCase();
  if (lower.includes('exam') || lower.includes('test') || lower.includes('midterm') || lower.includes('final') || lower.includes('quiz')) {
    return 'EXAM_PREPARATION';
  }
  if (lower.includes('schedule') || lower.includes('calendar') || lower.includes('deadline') || lower.includes('plan my week') || lower.includes('plan my day')) {
    return 'SCHEDULE_PLANNING';
  }
  if (lower.includes('audit') || lower.includes('corroborate') || lower.includes('verify my') || lower.includes('evidence audit')) {
    return 'CORROBORATION_AUDIT';
  }
  if (lower.includes('remedial') || lower.includes('weakness') || lower.includes('mistake') || lower.includes('error review')) {
    return 'REMEDIAL_PRACTICE';
  }
  if (lower.includes('improve') || lower.includes('master') || lower.includes('learn') || lower.includes('practice') || lower.includes('study')) {
    return 'SKILL_IMPROVEMENT';
  }

  return 'GENERAL_LEARNING';
}

/**
 * Validates and intakes a student-submitted goal.
 */
export function validateAndIntakeStudentGoal(
  input: StudentGoalInput,
  authenticatedUserId?: string
): IntakeResult<AgentTriggerContext> {
  // 1. Validate User ID presence and tenant isolation
  if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
    return {
      success: false,
      error: {
        code: 'ERR_MISSING_USER_ID',
        message: 'Goal input must specify a valid userId.',
        field: 'userId',
      },
    };
  }

  const trimmedUserId = input.userId.trim();

  if (authenticatedUserId && authenticatedUserId !== trimmedUserId) {
    return {
      success: false,
      error: {
        code: 'ERR_UNAUTHORIZED_USER_MISMATCH',
        message: 'Tenant boundary violation: Goal userId does not match authenticated user session.',
        field: 'userId',
      },
    };
  }

  // 2. Validate raw goal text
  if (!input.rawGoalText || typeof input.rawGoalText !== 'string' || input.rawGoalText.trim() === '') {
    return {
      success: false,
      error: {
        code: 'ERR_EMPTY_GOAL_TEXT',
        message: 'Goal text cannot be empty or whitespace only.',
        field: 'rawGoalText',
      },
    };
  }

  if (input.rawGoalText.length > 2000) {
    return {
      success: false,
      error: {
        code: 'ERR_GOAL_TEXT_TOO_LONG',
        message: 'Goal text exceeds maximum allowed length (2,000 characters).',
        field: 'rawGoalText',
      },
    };
  }

  const normalizedText = normalizeGoalText(input.rawGoalText);
  if (normalizedText.length === 0) {
    return {
      success: false,
      error: {
        code: 'ERR_EMPTY_GOAL_TEXT',
        message: 'Goal text contains only non-printable control characters.',
        field: 'rawGoalText',
      },
    };
  }

  // 3. Resolve category and priority deterministically
  const goalCategory = detectGoalCategory(normalizedText, input.category);
  const priority: TriggerPriority = input.priority || 'MEDIUM';
  const now = new Date().toISOString();
  const triggerId = `trg_goal_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 4. Construct validated AgentTriggerContext
  const triggerContext: AgentTriggerContext = {
    triggerId,
    userId: trimmedUserId,
    triggerType: 'STUDENT_GOAL',
    isAutomated: false,
    eventTrigger: 'MANUAL_GOAL',
    normalizedGoalText: normalizedText,
    goalCategory,
    priority,
    receivedAt: now,
    eventTimestamp: null,
    entityId: null,
    targetSkillName: input.targetSkillName?.trim() || null,
    timeframeHint: input.timeframeHint?.trim() || null,
    contextData: input.metadata || {},
    validationMetadata: {
      validatedAt: now,
      version: '1.0.0',
      sourceModule: 'goal-event-intake',
    },
  };

  return {
    success: true,
    triggerContext,
  };
}

/**
 * Validates and intakes a system-emitted reactive event.
 */
export function validateAndIntakeSystemEvent(
  input: SystemEventInput,
  authenticatedUserId?: string
): IntakeResult<AgentTriggerContext> {
  // 1. Validate User ID presence and tenant isolation
  if (!input.userId || typeof input.userId !== 'string' || input.userId.trim() === '') {
    return {
      success: false,
      error: {
        code: 'ERR_MISSING_USER_ID',
        message: 'System event input must specify a valid userId.',
        field: 'userId',
      },
    };
  }

  const trimmedUserId = input.userId.trim();

  if (authenticatedUserId && authenticatedUserId !== trimmedUserId) {
    return {
      success: false,
      error: {
        code: 'ERR_UNAUTHORIZED_USER_MISMATCH',
        message: 'Tenant boundary violation: Event userId does not match authenticated user session.',
        field: 'userId',
      },
    };
  }

  // 2. Validate Event Type
  if (!input.eventType || !ALLOWED_SYSTEM_EVENT_TYPES.includes(input.eventType)) {
    return {
      success: false,
      error: {
        code: 'ERR_INVALID_EVENT_TYPE',
        message: `Invalid or unrecognized system eventType '${input.eventType}'. Allowed types: [${ALLOWED_SYSTEM_EVENT_TYPES.join(', ')}]`,
        field: 'eventType',
      },
    };
  }

  // 3. Validate Timestamp
  if (!input.eventTimestamp || typeof input.eventTimestamp !== 'string') {
    return {
      success: false,
      error: {
        code: 'ERR_MISSING_TIMESTAMP',
        message: 'System event must specify an eventTimestamp string.',
        field: 'eventTimestamp',
      },
    };
  }

  const timestampMs = new Date(input.eventTimestamp).getTime();
  if (isNaN(timestampMs)) {
    return {
      success: false,
      error: {
        code: 'ERR_INVALID_TIMESTAMP',
        message: 'System event eventTimestamp must be a valid ISO 8601 date string.',
        field: 'eventTimestamp',
      },
    };
  }

  // 4. Validate Payload
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) {
    return {
      success: false,
      error: {
        code: 'ERR_INVALID_EVENT_PAYLOAD',
        message: 'System event payload must be a non-null key-value object.',
        field: 'payload',
      },
    };
  }

  // 5. Map Event to Orchestrator Event Trigger & Priority
  let eventTrigger: AgentEventTrigger = 'EXTERNAL_SYNC';
  let defaultPriority: TriggerPriority = 'MEDIUM';
  let generatedGoalSummary = '';

  switch (input.eventType) {
    case 'MISSED_TASK': {
      eventTrigger = 'STUDENT_MISTAKE_LOGGED';
      defaultPriority = 'HIGH';
      const taskTitle = typeof input.payload.title === 'string' ? ` "${input.payload.title}"` : '';
      generatedGoalSummary = `System Event: Missed scheduled task${taskTitle}${input.entityId ? ` [ID: ${input.entityId}]` : ''}. Review and adjust study schedule.`;
      break;
    }
    case 'MISSED_STUDY_SESSION': {
      eventTrigger = 'STUDENT_MISTAKE_LOGGED';
      defaultPriority = 'HIGH';
      generatedGoalSummary = `System Event: Missed study session. Propose rescheduling or remediation.`;
      break;
    }
    case 'APPROACHING_DEADLINE': {
      eventTrigger = 'PROACTIVE_RECOMMENDATION';
      defaultPriority = 'HIGH';
      const deadlineItem = typeof input.payload.itemTitle === 'string' ? ` for "${input.payload.itemTitle}"` : '';
      generatedGoalSummary = `System Event: Approaching deadline detected${deadlineItem}. Re-prioritize upcoming tasks.`;
      break;
    }
    case 'NEW_ASSIGNMENT': {
      eventTrigger = 'PROACTIVE_RECOMMENDATION';
      defaultPriority = 'MEDIUM';
      const assignTitle = typeof input.payload.title === 'string' ? ` "${input.payload.title}"` : '';
      generatedGoalSummary = `System Event: New assignment logged${assignTitle}. Formulate preparation plan.`;
      break;
    }
    case 'ASSESSMENT_RESULT_CHANGED': {
      eventTrigger = 'SKILL_GAP_DETECTED';
      defaultPriority = 'MEDIUM';
      generatedGoalSummary = `System Event: Assessment score updated. Refresh skill corroboration assessment.`;
      break;
    }
    case 'GITHUB_ACTIVITY_CHANGE': {
      eventTrigger = 'EXTERNAL_SYNC';
      defaultPriority = 'LOW';
      generatedGoalSummary = `System Event: GitHub activity updated. Re-evaluate external evidence.`;
      break;
    }
    case 'LEETCODE_SUBMISSION_EVENT': {
      eventTrigger = 'EXTERNAL_SYNC';
      defaultPriority = 'LOW';
      generatedGoalSummary = `System Event: New LeetCode submission recorded. Update algorithmic skill evidence.`;
      break;
    }
    case 'SCHEDULED_AUDIT_TICK': {
      eventTrigger = 'SCHEDULED_AUDIT';
      defaultPriority = 'LOW';
      generatedGoalSummary = `System Event: Scheduled periodic corroboration audit triggered.`;
      break;
    }
  }

  if (input.severity === 'CRITICAL') {
    defaultPriority = 'URGENT';
  } else if (input.severity === 'HIGH') {
    defaultPriority = 'HIGH';
  }

  const now = new Date().toISOString();
  const triggerId = `trg_event_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  // 6. Construct validated AgentTriggerContext
  const triggerContext: AgentTriggerContext = {
    triggerId,
    userId: trimmedUserId,
    triggerType: 'SYSTEM_EVENT',
    isAutomated: true,
    eventTrigger,
    normalizedGoalText: generatedGoalSummary,
    systemEventType: input.eventType,
    priority: defaultPriority,
    receivedAt: now,
    eventTimestamp: input.eventTimestamp,
    entityId: input.entityId || null,
    targetSkillName: typeof input.payload.skillName === 'string' ? input.payload.skillName : null,
    timeframeHint: typeof input.payload.timeframe === 'string' ? input.payload.timeframe : null,
    contextData: {
      ...input.payload,
      source: input.source,
      ...(input.metadata || {}),
    },
    validationMetadata: {
      validatedAt: now,
      version: '1.0.0',
      sourceModule: 'goal-event-intake',
    },
  };

  return {
    success: true,
    triggerContext,
  };
}

/**
 * Initializes a new AgentRunState from a validated AgentTriggerContext.
 */
export function createAgentInitialStateFromTrigger(
  triggerContext: AgentTriggerContext,
  safetyLimits?: Partial<AgentSafetyLimits>
): AgentRunState {
  return createInitialAgentState({
    userId: triggerContext.userId,
    goal: triggerContext.normalizedGoalText,
    eventTrigger: triggerContext.eventTrigger,
    safetyLimits,
    initialMetadata: {
      triggerContext,
    },
  });
}
