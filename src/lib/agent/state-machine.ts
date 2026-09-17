/**
 * Feature 2A: Deterministic State Machine for the SINGLE Learning Orchestrator Agent.
 * 
 * Provides:
 * - Explicit, immutable state transitions.
 * - Guard rails preventing invalid state leaps.
 * - Safety limits enforcement (max tool iterations, max replans, failure damping).
 * - Pause and resume mechanics for human approval.
 * - Audit-ready transition history.
 */

import {
  AgentState,
  AgentRunState,
  AgentSafetyLimits,
  AgentStateTransitionInput,
  AgentTransitionResult,
  AgentRunContext,
  AgentEventTrigger,
} from './state-types';

/**
 * Default safety bounds for the Learning Orchestrator Agent.
 */
export const DEFAULT_AGENT_SAFETY_LIMITS: AgentSafetyLimits = {
  maxToolIterations: 10,
  maxReplans: 3,
  maxConsecutiveFailures: 2,
  approvalTimeoutMs: 1000 * 60 * 60 * 24, // 24 hours
};

/**
 * Explicit state transition table.
 * Every valid destination state for each origin state is strictly declared here.
 */
export const VALID_AGENT_TRANSITIONS: Record<AgentState, readonly AgentState[]> = {
  IDLE: ['GOAL_RECEIVED', 'FAILED'],
  GOAL_RECEIVED: ['OBSERVING', 'PLANNING', 'WAITING_FOR_APPROVAL', 'FAILED'],
  OBSERVING: ['CORROBORATING', 'WAITING_FOR_APPROVAL', 'FAILED'],
  CORROBORATING: ['ASSESSING', 'FAILED'],
  ASSESSING: ['PLANNING', 'COMPLETED', 'FAILED'],
  PLANNING: ['TOOL_SELECTION', 'WAITING_FOR_APPROVAL', 'REPLANNING', 'COMPLETED', 'FAILED'],
  WAITING_FOR_APPROVAL: ['EXECUTING', 'TOOL_SELECTION', 'PLANNING', 'REPLANNING', 'IDLE', 'FAILED'],
  TOOL_SELECTION: ['EXECUTING', 'WAITING_FOR_APPROVAL', 'REPLANNING', 'FAILED'],
  EXECUTING: ['VERIFYING', 'WAITING_FOR_APPROVAL', 'REPLANNING', 'FAILED'],
  VERIFYING: ['UPDATING', 'REPLANNING', 'FAILED'],
  UPDATING: ['COMPLETED', 'TOOL_SELECTION', 'EXECUTING', 'PLANNING', 'REPLANNING', 'FAILED'],
  REPLANNING: ['PLANNING', 'OBSERVING', 'TOOL_SELECTION', 'FAILED'],
  COMPLETED: ['IDLE', 'GOAL_RECEIVED'],
  FAILED: ['IDLE', 'GOAL_RECEIVED', 'REPLANNING'],
};

/**
 * Validates whether a transition from `fromState` to `toState` is structurally allowed.
 */
export function isValidAgentTransition(fromState: AgentState, toState: AgentState): boolean {
  if (fromState === toState) {
    // Re-entrant transitions to the same state are allowed for waiting/updating if valid
    return ['WAITING_FOR_APPROVAL', 'UPDATING', 'REPLANNING'].includes(fromState);
  }
  const allowed = VALID_AGENT_TRANSITIONS[fromState];
  return Boolean(allowed && allowed.includes(toState));
}

/**
 * Returns all valid next states from a given current state.
 */
export function getValidNextAgentStates(fromState: AgentState): readonly AgentState[] {
  return VALID_AGENT_TRANSITIONS[fromState] || [];
}

/**
 * Initializes a new, clean AgentRunState in the IDLE state.
 */
export function createInitialAgentState(params: {
  runId?: string;
  userId: string;
  goal: string;
  eventTrigger?: AgentEventTrigger;
  safetyLimits?: Partial<AgentSafetyLimits>;
  initialMetadata?: Record<string, unknown>;
}): AgentRunState {
  const now = new Date().toISOString();
  const runId = params.runId || `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const context: AgentRunContext = {
    runId,
    userId: params.userId,
    goal: params.goal,
    eventTrigger: params.eventTrigger || 'MANUAL_GOAL',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    metadata: params.initialMetadata || {},
  };

  const safetyLimits: AgentSafetyLimits = {
    ...DEFAULT_AGENT_SAFETY_LIMITS,
    ...(params.safetyLimits || {}),
  };

  return {
    runId,
    userId: params.userId,
    currentState: 'IDLE',
    previousState: null,
    context,
    safetyLimits,
    counters: {
      toolIterations: 0,
      replans: 0,
      consecutiveFailures: 0,
      totalExecutedActions: 0,
    },
    activeApprovalRequest: null,
    lastFailure: null,
    evidenceContext: {},
    transitionHistory: [
      {
        id: `tr_${Date.now()}_init`,
        fromState: 'IDLE',
        toState: 'IDLE',
        timestamp: now,
        reason: 'Agent run initialized.',
      },
    ],
    workingMemory: {},
    updatedAt: now,
  };
}

/**
 * Deterministically transitions the Agent State Machine.
 * 
 * Enforces:
 * 1. Valid transition rules.
 * 2. Replanning limits (`maxReplans`).
 * 3. Tool execution limits (`maxToolIterations`).
 * 4. Human approval state attachment.
 * 5. Failure recording and recovery state.
 * 6. Non-mutating state evolution (returns a new immutable state object).
 */
export function transitionAgentState(
  currentState: AgentRunState,
  transition: AgentStateTransitionInput
): AgentTransitionResult {
  const { targetState, reason } = transition;
  const fromState = currentState.currentState;
  const now = new Date().toISOString();

  // 1. Guard: Check if transition is structurally permitted
  if (!isValidAgentTransition(fromState, targetState)) {
    return {
      success: false,
      state: currentState,
      error: {
        code: 'ERR_INVALID_TRANSITION',
        message: `Invalid state transition from '${fromState}' to '${targetState}'. Allowed transitions: [${getValidNextAgentStates(fromState).join(', ')}]`,
        fromState,
        targetState,
      },
    };
  }

  // 2. Guard: Safety Limit on Tool Iterations
  if (
    (targetState === 'TOOL_SELECTION' || targetState === 'EXECUTING') &&
    currentState.counters.toolIterations >= currentState.safetyLimits.maxToolIterations
  ) {
    return {
      success: false,
      state: currentState,
      error: {
        code: 'ERR_MAX_TOOL_ITERATIONS_EXCEEDED',
        message: `Safety limit exceeded: Run reached maximum tool iterations (${currentState.safetyLimits.maxToolIterations}).`,
        fromState,
        targetState,
      },
    };
  }

  // 3. Guard: Safety Limit on Replans
  if (
    targetState === 'REPLANNING' &&
    currentState.counters.replans >= currentState.safetyLimits.maxReplans
  ) {
    return {
      success: false,
      state: currentState,
      error: {
        code: 'ERR_MAX_REPLANS_EXCEEDED',
        message: `Safety limit exceeded: Run reached maximum replanning attempts (${currentState.safetyLimits.maxReplans}).`,
        fromState,
        targetState,
      },
    };
  }

  // 4. Update Counters
  const nextCounters = { ...currentState.counters };
  if (targetState === 'TOOL_SELECTION' || targetState === 'EXECUTING') {
    nextCounters.toolIterations += 1;
  }
  if (targetState === 'REPLANNING') {
    nextCounters.replans += 1;
  }
  if (targetState === 'UPDATING') {
    nextCounters.totalExecutedActions += 1;
    nextCounters.consecutiveFailures = 0; // Reset consecutive failures on successful execution
  }
  if (targetState === 'FAILED') {
    nextCounters.consecutiveFailures += 1;
  }

  // 5. Handle Human Approval Request
  let nextApproval = currentState.activeApprovalRequest;
  if (targetState === 'WAITING_FOR_APPROVAL') {
    if (transition.approvalRequest) {
      nextApproval = { ...transition.approvalRequest };
    }
  } else if (fromState === 'WAITING_FOR_APPROVAL' && transition.approvalDecision) {
    if (nextApproval) {
      nextApproval = {
        ...nextApproval,
        decision: transition.approvalDecision.decision,
        decisionNotes: transition.approvalDecision.notes,
        resolvedAt: now,
      };
    }
  } else if (targetState === 'IDLE') {
    nextApproval = null;
  }

  // 6. Handle Failure Recording
  let nextFailure = currentState.lastFailure;
  if (targetState === 'FAILED' && transition.failure) {
    nextFailure = { ...transition.failure };
  } else if (targetState === 'IDLE') {
    nextFailure = null;
  }

  // 7. Update Evidence Context & Working Memory
  const nextEvidence = {
    ...currentState.evidenceContext,
    ...(transition.evidenceUpdate || {}),
  };

  const nextMemory = {
    ...currentState.workingMemory,
    ...(transition.workingMemoryUpdate || {}),
  };

  // 8. Update Run Context Timestamps
  const nextContext: AgentRunContext = {
    ...currentState.context,
    updatedAt: now,
    completedAt: targetState === 'COMPLETED' ? now : currentState.context.completedAt,
  };

  // 9. Append to Transition History
  const transitionRecord = {
    id: `tr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fromState,
    toState: targetState,
    timestamp: now,
    reason,
    metadata: transition.metadata,
  };

  const nextHistory = [...currentState.transitionHistory, transitionRecord];

  // 10. Assemble Final Immutable Next State
  const nextState: AgentRunState = {
    runId: currentState.runId,
    userId: currentState.userId,
    currentState: targetState,
    previousState: fromState,
    context: nextContext,
    safetyLimits: currentState.safetyLimits,
    counters: nextCounters,
    activeApprovalRequest: nextApproval,
    lastFailure: nextFailure,
    evidenceContext: nextEvidence,
    transitionHistory: nextHistory,
    workingMemory: nextMemory,
    updatedAt: now,
  };

  return {
    success: true,
    state: nextState,
  };
}
