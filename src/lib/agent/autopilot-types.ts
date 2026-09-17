/**
 * Learning Autopilot Types
 * 
 * Defines strongly-typed contracts for the Learning Autopilot layer.
 * Grounded in real student context and integrated with Phase 6C decision selection
 * and Phase 5 human-in-the-loop approval.
 */

import { DecisionType, DecisionPriority, LearningDecision } from './decision-types';

export type AutopilotTriggerType =
  | 'LEARNING_PATH_BEHIND_SCHEDULE'
  | 'WORKLOAD_CONFLICT'
  | 'RECURRING_LEARNING_MISTAKES';

export interface AutopilotActionProposal {
  actionId: string;
  actionType: 'RESCHEDULE_LEARNING_ACTIVITY' | 'CREATE_REMEDIATION_TASK' | 'DEPRIORITIZE_TASK' | 'SCHEDULE_MISTAKE_REVIEW';
  title: string;
  description: string;
  targetSkill?: string | null;
  estimatedMinutes: number;
  requiresHumanApproval: boolean;
  payload: Record<string, any>;
}

export interface AutopilotSituation {
  situationId: string;
  triggerType: AutopilotTriggerType;
  title: string;
  detectedIssue: string;
  whyDetected: string;
  evidenceBasis: string[];
  decisionType: DecisionType;
  priority: DecisionPriority;
  recommendedAction: string;
  expectedBenefit: string;
  actionProposal?: AutopilotActionProposal | null;
  fingerprint: string;
  detectedAt: string;
}

export interface AutopilotEvaluationContext {
  userId: string;
  activePath?: any | null;
  todayTasks?: any[];
  recentMistakes?: any[];
  todayJournal?: any | null;
  activeSessions?: any[];
  trajectory?: any | null;
  adaptationSignals?: any[];
  dismissedFingerprints?: string[];
}

export interface AutopilotEvaluationResult {
  hasSituation: boolean;
  situation: AutopilotSituation | null;
  onTrackSummary?: string;
  allEvaluatedTriggers: {
    trigger: AutopilotTriggerType;
    triggered: boolean;
    reason: string;
  }[];
  evaluatedAt: string;
}
