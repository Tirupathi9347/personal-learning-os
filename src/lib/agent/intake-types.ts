/**
 * Feature 2C: Goal and Event Intake Types for the Agentic Learning OS.
 * 
 * Defines strongly-typed inputs, system event schemas, and the normalized
 * AgentTriggerContext for the SINGLE Learning Orchestrator Agent.
 */

import { AgentEventTrigger } from './state-types';

/**
 * Top-level classification of what initiated the agent run.
 */
export type TriggerType = 'STUDENT_GOAL' | 'SYSTEM_EVENT';

/**
 * Common high-level goal categories for student requests.
 */
export type GoalCategory =
  | 'EXAM_PREPARATION'
  | 'SKILL_IMPROVEMENT'
  | 'SCHEDULE_PLANNING'
  | 'CORROBORATION_AUDIT'
  | 'REMEDIAL_PRACTICE'
  | 'GENERAL_LEARNING';

/**
 * System event types that can trigger reactive orchestrator runs.
 */
export type SystemEventType =
  | 'MISSED_TASK'
  | 'MISSED_STUDY_SESSION'
  | 'APPROACHING_DEADLINE'
  | 'NEW_ASSIGNMENT'
  | 'ASSESSMENT_RESULT_CHANGED'
  | 'GITHUB_ACTIVITY_CHANGE'
  | 'LEETCODE_SUBMISSION_EVENT'
  | 'SCHEDULED_AUDIT_TICK';

/**
 * Execution priority for goal/event scheduling.
 */
export type TriggerPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/**
 * Raw input payload for student-initiated goals (CommandBar or Direct Input).
 */
export interface StudentGoalInput {
  userId: string;
  rawGoalText: string;
  targetSkillName?: string;
  timeframeHint?: string;
  category?: GoalCategory;
  priority?: TriggerPriority;
  metadata?: Record<string, unknown>;
}

/**
 * Raw input payload for system-emitted reactive events.
 */
export interface SystemEventInput {
  userId: string;
  eventType: SystemEventType;
  source: 'task' | 'study_session' | 'calendar' | 'assessment' | 'github' | 'leetcode' | 'system';
  eventTimestamp: string; // ISO 8601
  payload: Record<string, unknown>;
  entityId?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  metadata?: Record<string, unknown>;
}

/**
 * Safe, normalized, and validated trigger context passed to the Learning Orchestrator.
 */
export interface AgentTriggerContext {
  triggerId: string;
  userId: string;
  triggerType: TriggerType;
  isAutomated: boolean; // false for manual student goals, true for system events
  eventTrigger: AgentEventTrigger;
  normalizedGoalText: string;
  goalCategory?: GoalCategory;
  systemEventType?: SystemEventType;
  priority: TriggerPriority;
  receivedAt: string; // ISO 8601
  eventTimestamp?: string | null;
  entityId?: string | null;
  targetSkillName?: string | null;
  timeframeHint?: string | null;
  contextData: Record<string, unknown>;
  validationMetadata: {
    validatedAt: string;
    version: string;
    sourceModule: string;
  };
}

/**
 * Result of validating and intaking a goal or event.
 */
export interface IntakeResult<T = AgentTriggerContext> {
  success: boolean;
  triggerContext?: T;
  error?: {
    code: string;
    message: string;
    field?: string;
  };
}
