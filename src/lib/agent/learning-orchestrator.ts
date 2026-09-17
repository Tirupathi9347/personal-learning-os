/**
 * Feature 2B: Learning Orchestrator Execution Loop Foundation.
 * 
 * Implements the deterministic execution loop for the SINGLE Learning Orchestrator Agent.
 * 
 * Core Guarantees:
 * 1. The Feature 2A State Machine is the ONLY authority for state transitions.
 * 2. Iterative execution with strict loop step bounds and safety limits (no uncontrolled recursion).
 * 3. Supports the full canonical lifecycle:
 *    GOAL_RECEIVED -> OBSERVING -> CORROBORATING -> ASSESSING -> PLANNING -> TOOL_SELECTION -> EXECUTING -> VERIFYING -> UPDATING -> COMPLETED
 * 4. Supports WAITING_FOR_APPROVAL, REPLANNING, and FAILED states.
 * 5. Explicit typed handler boundaries for future tool/agent actions (never fakes success).
 * 6. Returns a fully serializable execution result with complete transition history.
 */

import {
  AgentRunState,
  AgentStateTransitionInput,
  AgentState,
  AgentSafetyLimits,
  AgentEventTrigger,
} from './state-types';
import {
  createInitialAgentState,
  transitionAgentState,
} from './state-machine';
import { collectStudentEvidence } from './evidence-collector';
import { corroborateStudentEvidence } from './corroboration-engine';
import { calculateCorroborationConfidence } from './confidence-calculator';
import {
  OrchestratorExecutionOptions,
  OrchestratorExecutionResult,
} from './orchestrator-types';
import {
  persistAgentRunState,
} from './run-persistence';
import {
  AgentRunStatus,
} from './persistence-types';

/**
 * Helper to compute the AgentRunStatus from the current AgentState.
 */
function deriveRunStatus(state: AgentState): AgentRunStatus {
  if (state === 'COMPLETED') return 'COMPLETED';
  if (state === 'WAITING_FOR_APPROVAL') return 'PAUSED_FOR_APPROVAL';
  if (state === 'FAILED') return 'FAILED';
  return 'RUNNING';
}

/**
 * Executes the Learning Orchestrator loop until reaching a terminal or paused state.
 */
export async function runLearningOrchestrator(
  initialStateOrParams:
    | AgentRunState
    | {
        runId?: string;
        userId: string;
        goal: string;
        eventTrigger?: AgentEventTrigger;
        safetyLimits?: Partial<AgentSafetyLimits>;
        initialMetadata?: Record<string, unknown>;
      },
  options: OrchestratorExecutionOptions = {}
): Promise<OrchestratorExecutionResult> {
  const { 
    handlers = {}, 
    maxLoopSteps = 50, 
    supabase, 
    persistState = Boolean(supabase),
    triggerContext 
  } = options;

  let state: AgentRunState =
    'currentState' in initialStateOrParams
      ? initialStateOrParams
      : createInitialAgentState(initialStateOrParams);

  let stepCount = 0;
  let persistenceError: { code: string; message: string } | undefined;

  // Persist initial state if database client is provided
  if (supabase && persistState) {
    const initialPersist = await persistAgentRunState(
      supabase,
      state,
      deriveRunStatus(state.currentState),
      triggerContext
    );
    if (!initialPersist.success) {
      persistenceError = initialPersist.error;
    }
  }

  // Primary Iterative State Execution Loop
  while (stepCount < maxLoopSteps) {
    stepCount++;
    const current = state.currentState;

    // 1. Terminal State Checks
    if (current === 'COMPLETED' || current === 'WAITING_FOR_APPROVAL' || current === 'FAILED') {
      const finalStatus = deriveRunStatus(current);
      if (supabase && persistState) {
        const termPersist = await persistAgentRunState(supabase, state, finalStatus, triggerContext);
        if (!termPersist.success && !persistenceError) {
          persistenceError = termPersist.error;
        }
      }

      const terminalStatus: 'COMPLETED' | 'PAUSED_FOR_APPROVAL' | 'FAILED' =
        current === 'COMPLETED'
          ? 'COMPLETED'
          : current === 'WAITING_FOR_APPROVAL'
          ? 'PAUSED_FOR_APPROVAL'
          : 'FAILED';

      return {
        success: current === 'COMPLETED' || current === 'WAITING_FOR_APPROVAL',
        finalState: state,
        status: terminalStatus,
        totalTransitions: state.transitionHistory.length,
        persisted: Boolean(supabase && persistState && !persistenceError),
        persistenceError,
        error: state.lastFailure
          ? {
              code: state.lastFailure.code,
              message: state.lastFailure.message,
              state: state.lastFailure.failedAtState,
            }
          : undefined,
      };
    }

    // 2. Dispatch State Execution
    let transitionInput: AgentStateTransitionInput | null = null;

    try {
      switch (current) {
        case 'IDLE': {
          transitionInput = {
            targetState: 'GOAL_RECEIVED',
            reason: 'Initiating orchestrator cycle from IDLE.',
          };
          break;
        }

        case 'GOAL_RECEIVED': {
          transitionInput = {
            targetState: 'OBSERVING',
            reason: 'Advancing to telemetry and evidence observation stage.',
          };
          break;
        }

        case 'OBSERVING': {
          if (handlers.onObserving) {
            const obsRes = await handlers.onObserving(state);
            if (obsRes.requiresApproval && obsRes.approvalRequest) {
              transitionInput = {
                targetState: 'WAITING_FOR_APPROVAL',
                reason: obsRes.reason || 'Observation requires user confirmation.',
                approvalRequest: obsRes.approvalRequest,
                workingMemoryUpdate: obsRes.workingMemory,
              };
            } else {
              transitionInput = {
                targetState: 'CORROBORATING',
                reason: obsRes.reason || 'Collected student evidence telemetry.',
                evidenceUpdate: { collection: obsRes.evidenceCollection },
                workingMemoryUpdate: {
                  evidenceCollection: obsRes.evidenceCollection,
                  ...(obsRes.workingMemory || {}),
                },
              };
            }
          } else {
            // Native integration with Phase 1 Evidence Collector
            if (state.evidenceContext.collection) {
              transitionInput = {
                targetState: 'CORROBORATING',
                reason: `Using provided evidence collection (${state.evidenceContext.collection.totalRecords} records).`,
              };
            } else {
              try {
                const collection = await collectStudentEvidence();
                transitionInput = {
                  targetState: 'CORROBORATING',
                  reason: `Collected ${collection.totalRecords} empirical evidence records across ${collection.connectedSources.length} sources.`,
                  evidenceUpdate: { collection },
                  workingMemoryUpdate: {
                    evidenceCollectionSummary: {
                      collectedAt: collection.collectedAt,
                      totalRecords: collection.totalRecords,
                      connectedSources: collection.connectedSources,
                      unconnectedSources: collection.unconnectedSources,
                      sourcesSummary: collection.sourcesSummary,
                    },
                  },
                };
              } catch (err: unknown) {
                const errMsg = err instanceof Error ? err.message : String(err);
                transitionInput = {
                  targetState: 'FAILED',
                  reason: `Evidence collection failed: ${errMsg}`,
                  failure: {
                    code: 'ERR_EVIDENCE_COLLECTION_FAILED',
                    message: errMsg,
                    failedAtState: 'OBSERVING',
                    timestamp: new Date().toISOString(),
                    recoverable: false,
                  },
                };
              }
            }
          }
          break;
        }

        case 'CORROBORATING': {
          if (handlers.onCorroborating) {
            const corrRes = await handlers.onCorroborating(state);
            transitionInput = {
              targetState: 'ASSESSING',
              reason: corrRes.reason || 'Corroborated student evidence against skill claims.',
              evidenceUpdate: { corroboration: corrRes.corroboration },
              workingMemoryUpdate: corrRes.workingMemory,
            };
          } else if (state.evidenceContext.collection) {
            // Native integration with Phase 1 Corroboration Engine
            try {
              const corroboration = corroborateStudentEvidence(state.evidenceContext.collection);
              transitionInput = {
                targetState: 'ASSESSING',
                reason: `Corroborated ${corroboration.totalSkillsEvaluated} skill claims (${corroboration.contradictionSummary.totalContradictions} contradictions, ${corroboration.missingEvidenceSummary.totalRequirements} missing requirements).`,
                evidenceUpdate: { corroboration },
                workingMemoryUpdate: {
                  corroborationSummary: {
                    evaluatedAt: corroboration.evaluatedAt,
                    totalSkillsEvaluated: corroboration.totalSkillsEvaluated,
                    contradictionSummary: corroboration.contradictionSummary,
                    missingEvidenceSummary: corroboration.missingEvidenceSummary,
                    unmappedCount: corroboration.unmappedEvidence.length,
                  },
                },
              };
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              transitionInput = {
                targetState: 'FAILED',
                reason: `Evidence corroboration failed: ${errMsg}`,
                failure: {
                  code: 'ERR_CORROBORATION_FAILED',
                  message: errMsg,
                  failedAtState: 'CORROBORATING',
                  timestamp: new Date().toISOString(),
                  recoverable: false,
                },
              };
            }
          } else {
            transitionInput = {
              targetState: 'FAILED',
              reason: 'Cannot corroborate without evidence collection.',
              failure: {
                code: 'ERR_MISSING_EVIDENCE_COLLECTION',
                message: 'No evidence collection present in state for corroboration.',
                failedAtState: 'CORROBORATING',
                timestamp: new Date().toISOString(),
                recoverable: false,
              },
            };
          }
          break;
        }

        case 'ASSESSING': {
          let computedAudit = state.evidenceContext.corroboration
            ? calculateCorroborationConfidence(state.evidenceContext.corroboration, state.userId)
            : undefined;

          if (handlers.onAssessing) {
            const assessRes = await handlers.onAssessing(state);
            if (assessRes.audit) {
              computedAudit = assessRes.audit;
            }
            const targetState: AgentState = assessRes.requiresPlanning === false ? 'COMPLETED' : 'PLANNING';

            const decisionReadyAssessment = computedAudit ? {
              auditId: computedAudit.auditId,
              generatedAt: computedAudit.generatedAt,
              studentUserId: computedAudit.studentUserId,
              summary: computedAudit.summary,
              verifiedSkillsCount: computedAudit.skillsEvaluated.filter(
                (s) => s.confidenceLevel === 'HIGH' || s.confidenceLevel === 'MODERATE'
              ).length,
              unverifiedSkillsCount: computedAudit.summary.unverifiedCount,
              contradictedSkillsCount: computedAudit.summary.contradictedCount,
              skillsEvaluated: computedAudit.skillsEvaluated.map((s) => ({
                skillName: s.skillName,
                claimedProficiency: s.claimedProficiency,
                assessedProficiency: s.assessedProficiency,
                evidenceBackedScore: s.evidenceBackedScore,
                confidenceLevel: s.confidenceLevel,
                supportingCount: s.evidenceCount.supporting,
                contradictingCount: s.evidenceCount.contradicting,
                contradictions: s.contradictions,
                missingEvidence: s.missingEvidence,
                reasons: s.reasons,
                breakdown: s.breakdown,
              })),
              warnings: computedAudit.warnings,
              limitations: computedAudit.limitations,
            } : undefined;

            transitionInput = {
              targetState,
              reason: assessRes.reason || (assessRes.requiresPlanning === false
                ? 'Assessment completed; goal requires no further planning or actions.'
                : 'Evidence-backed assessment generated; proceeding to curriculum planning.'),
              evidenceUpdate: { audit: computedAudit },
              workingMemoryUpdate: {
                ...(decisionReadyAssessment ? { decisionReadyAssessment } : {}),
                ...(assessRes.workingMemory || {}),
              },
            };
          } else if (state.evidenceContext.corroboration) {
            // Native integration with Phase 1 Confidence Calculator
            try {
              const audit = computedAudit || calculateCorroborationConfidence(state.evidenceContext.corroboration, state.userId);
              
              // Structure a rich, decision-ready assessment context for planning
              const decisionReadyAssessment = {
                auditId: audit.auditId,
                generatedAt: audit.generatedAt,
                studentUserId: audit.studentUserId,
                summary: audit.summary,
                verifiedSkillsCount: audit.skillsEvaluated.filter(
                  (s) => s.confidenceLevel === 'HIGH' || s.confidenceLevel === 'MODERATE'
                ).length,
                unverifiedSkillsCount: audit.summary.unverifiedCount,
                contradictedSkillsCount: audit.summary.contradictedCount,
                skillsEvaluated: audit.skillsEvaluated.map((s) => ({
                  skillName: s.skillName,
                  claimedProficiency: s.claimedProficiency,
                  assessedProficiency: s.assessedProficiency,
                  evidenceBackedScore: s.evidenceBackedScore,
                  confidenceLevel: s.confidenceLevel,
                  supportingCount: s.evidenceCount.supporting,
                  contradictingCount: s.evidenceCount.contradicting,
                  contradictions: s.contradictions,
                  missingEvidence: s.missingEvidence,
                  reasons: s.reasons,
                  breakdown: s.breakdown,
                })),
                warnings: audit.warnings,
                limitations: audit.limitations,
              };

              transitionInput = {
                targetState: 'PLANNING',
                reason: `Assessed ${audit.skillsEvaluated.length} skills (Ground-Truth Score: ${Math.round(audit.summary.overallGroundTruthScore * 100)}%). Prepared decision-ready assessment context for planning.`,
                evidenceUpdate: { audit },
                workingMemoryUpdate: {
                  decisionReadyAssessment,
                },
              };
            } catch (err: unknown) {
              const errMsg = err instanceof Error ? err.message : String(err);
              transitionInput = {
                targetState: 'FAILED',
                reason: `Confidence assessment failed: ${errMsg}`,
                failure: {
                  code: 'ERR_ASSESSMENT_FAILED',
                  message: errMsg,
                  failedAtState: 'ASSESSING',
                  timestamp: new Date().toISOString(),
                  recoverable: false,
                },
              };
            }
          } else {
            transitionInput = {
              targetState: 'FAILED',
              reason: 'Cannot calculate confidence assessment without corroboration result.',
              failure: {
                code: 'ERR_MISSING_CORROBORATION',
                message: 'No corroboration result present in state for assessment.',
                failedAtState: 'ASSESSING',
                timestamp: new Date().toISOString(),
                recoverable: false,
              },
            };
          }
          break;
        }

        case 'PLANNING': {
          if (handlers.onPlanning) {
            const planRes = await handlers.onPlanning(state);
            if (planRes.requiresApproval && planRes.approvalRequest) {
              transitionInput = {
                targetState: 'WAITING_FOR_APPROVAL',
                reason: planRes.reason || 'Proposed plan requires student approval.',
                approvalRequest: planRes.approvalRequest,
                workingMemoryUpdate: planRes.workingMemory,
              };
            } else if (planRes.needsReplan) {
              transitionInput = {
                targetState: 'REPLANNING',
                reason: planRes.reason || 'Plan adjustments required.',
                workingMemoryUpdate: planRes.workingMemory,
              };
            } else if (planRes.isComplete) {
              transitionInput = {
                targetState: 'COMPLETED',
                reason: planRes.reason || 'Plan determined goal is already fulfilled.',
                workingMemoryUpdate: planRes.workingMemory,
              };
            } else {
              transitionInput = {
                targetState: 'TOOL_SELECTION',
                reason: planRes.reason || 'Plan formulated; advancing to tool selection.',
                workingMemoryUpdate: { plan: planRes.plan, ...(planRes.workingMemory || {}) },
              };
            }
          } else {
            // Default analytical termination if no planning handler is configured
            transitionInput = {
              targetState: 'COMPLETED',
              reason: 'Analysis and assessment phase concluded. No action handlers registered.',
            };
          }
          break;
        }

        case 'TOOL_SELECTION': {
          if (handlers.onToolSelection) {
            const toolRes = await handlers.onToolSelection(state);
            if (toolRes.requiresApproval && toolRes.approvalRequest) {
              transitionInput = {
                targetState: 'WAITING_FOR_APPROVAL',
                reason: toolRes.reason || 'Tool execution requires user confirmation.',
                approvalRequest: toolRes.approvalRequest,
                workingMemoryUpdate: toolRes.workingMemory,
              };
            } else if (toolRes.needsReplan) {
              transitionInput = {
                targetState: 'REPLANNING',
                reason: toolRes.reason || 'No suitable tool available; triggering replanning.',
                workingMemoryUpdate: toolRes.workingMemory,
              };
            } else {
              transitionInput = {
                targetState: 'EXECUTING',
                reason: toolRes.reason || 'Tool selected; advancing to execution.',
                workingMemoryUpdate: { selectedTool: toolRes.selectedTool, ...(toolRes.workingMemory || {}) },
              };
            }
          } else {
            // Explicit guard: Never fake tool selection without a handler
            transitionInput = {
              targetState: 'FAILED',
              reason: 'Tool selection stage reached but no tool selection handler is registered.',
              failure: {
                code: 'ERR_UNIMPLEMENTED_TOOL_SELECTION',
                message: 'No tool selection handler provided for stage TOOL_SELECTION.',
                failedAtState: 'TOOL_SELECTION',
                timestamp: new Date().toISOString(),
                recoverable: false,
              },
            };
          }
          break;
        }

        case 'EXECUTING': {
          if (handlers.onExecuting) {
            const execRes = await handlers.onExecuting(state);
            if (execRes.requiresApproval && execRes.approvalRequest) {
              transitionInput = {
                targetState: 'WAITING_FOR_APPROVAL',
                reason: execRes.reason || 'Action execution paused for confirmation.',
                approvalRequest: execRes.approvalRequest,
                workingMemoryUpdate: execRes.workingMemory,
              };
            } else if (execRes.needsReplan) {
              transitionInput = {
                targetState: 'REPLANNING',
                reason: execRes.reason || 'Execution encountered non-fatal impediment; replanning.',
                workingMemoryUpdate: execRes.workingMemory,
              };
            } else {
              transitionInput = {
                targetState: 'VERIFYING',
                reason: execRes.reason || 'Action executed; advancing to verification.',
                workingMemoryUpdate: { executionOutput: execRes.executionOutput, ...(execRes.workingMemory || {}) },
              };
            }
          } else {
            // Explicit guard: Never fake execution without a handler
            transitionInput = {
              targetState: 'FAILED',
              reason: 'Execution stage reached but no execution handler is registered.',
              failure: {
                code: 'ERR_UNIMPLEMENTED_EXECUTION',
                message: 'No execution handler provided for stage EXECUTING.',
                failedAtState: 'EXECUTING',
                timestamp: new Date().toISOString(),
                recoverable: false,
              },
            };
          }
          break;
        }

        case 'VERIFYING': {
          if (handlers.onVerifying) {
            const verRes = await handlers.onVerifying(state);
            if (verRes.verified) {
              transitionInput = {
                targetState: 'UPDATING',
                reason: verRes.reason || 'Action outcome successfully verified.',
                workingMemoryUpdate: verRes.workingMemory,
              };
            } else if (verRes.needsReplan) {
              transitionInput = {
                targetState: 'REPLANNING',
                reason: verRes.reason || `Verification failed: ${verRes.failureReason || 'Triggering replanning.'}`,
                workingMemoryUpdate: verRes.workingMemory,
              };
            } else {
              transitionInput = {
                targetState: 'FAILED',
                reason: verRes.reason || `Verification failed: ${verRes.failureReason || 'Unrecoverable error.'}`,
                failure: {
                  code: 'ERR_VERIFICATION_FAILED',
                  message: verRes.failureReason || 'Post-execution verification failed.',
                  failedAtState: 'VERIFYING',
                  timestamp: new Date().toISOString(),
                  recoverable: false,
                },
              };
            }
          } else {
            // Explicit guard: Never fake verification
            transitionInput = {
              targetState: 'FAILED',
              reason: 'Verification stage reached but no verification handler is registered.',
              failure: {
                code: 'ERR_UNIMPLEMENTED_VERIFICATION',
                message: 'No verification handler provided for stage VERIFYING.',
                failedAtState: 'VERIFYING',
                timestamp: new Date().toISOString(),
                recoverable: false,
              },
            };
          }
          break;
        }

        case 'UPDATING': {
          if (handlers.onUpdating) {
            const upRes = await handlers.onUpdating(state);
            const nextTarget = upRes.hasMoreSteps ? (upRes.nextState || 'TOOL_SELECTION') : 'COMPLETED';
            transitionInput = {
              targetState: nextTarget,
              reason: upRes.reason || (upRes.hasMoreSteps
                ? `Updated state; advancing to next step (${nextTarget}).`
                : 'Updated state; all workflow steps completed.'),
              workingMemoryUpdate: upRes.workingMemory,
            };
          } else {
            // Default updating advances to COMPLETED
            transitionInput = {
              targetState: 'COMPLETED',
              reason: 'Telemetry updated; cycle completed.',
            };
          }
          break;
        }

        case 'REPLANNING': {
          if (handlers.onReplanning) {
            const repRes = await handlers.onReplanning(state);
            const nextTarget = repRes.nextState || 'PLANNING';
            transitionInput = {
              targetState: nextTarget,
              reason: repRes.reason || `Replanning formulated; returning to ${nextTarget}.`,
              workingMemoryUpdate: repRes.workingMemory,
            };
          } else {
            transitionInput = {
              targetState: 'PLANNING',
              reason: 'Replanning triggered; returning to planning stage.',
            };
          }
          break;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      transitionInput = {
        targetState: 'FAILED',
        reason: `Unexpected runtime exception in state '${current}': ${message}`,
        failure: {
          code: 'ERR_UNHANDLED_EXCEPTION',
          message,
          failedAtState: current,
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      };
    }

    // 3. Execute Deterministic State Machine Transition
    if (!transitionInput) {
      const failTransition = transitionAgentState(state, {
        targetState: 'FAILED',
        reason: `Orchestrator unable to determine next transition from state '${current}'.`,
        failure: {
          code: 'ERR_STALLED_TRANSITION',
          message: `No transition generated for state '${current}'.`,
          failedAtState: current,
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      });
      state = failTransition.state;
      continue;
    }

    const transitionResult = transitionAgentState(state, transitionInput);

    if (!transitionResult.success) {
      // Transition rejected by state guard or safety limit -> Force FAILED terminal state
      const failResult = transitionAgentState(state, {
        targetState: 'FAILED',
        reason: `Transition rejected: ${transitionResult.error?.message}`,
        failure: {
          code: transitionResult.error?.code || 'ERR_TRANSITION_REJECTED',
          message: transitionResult.error?.message || 'Transition blocked by state guard.',
          failedAtState: current,
          timestamp: new Date().toISOString(),
          recoverable: false,
        },
      });
      state = failResult.state;
      continue;
    }

    state = transitionResult.state;

    // 4. Persist updated agent state after each meaningful transition
    if (supabase && persistState) {
      const stepStatus = deriveRunStatus(state.currentState);
      const stepPersist = await persistAgentRunState(supabase, state, stepStatus, triggerContext);
      if (!stepPersist.success && !persistenceError) {
        persistenceError = stepPersist.error;
      }
    }
  }

  // 5. Safety Guard: Loop steps exceeded
  if (state.currentState !== 'COMPLETED' && state.currentState !== 'FAILED' && state.currentState !== 'WAITING_FOR_APPROVAL') {
    const timeoutResult = transitionAgentState(state, {
      targetState: 'FAILED',
      reason: `Safety limit exceeded: Orchestrator loop reached ${maxLoopSteps} steps without terminating.`,
      failure: {
        code: 'ERR_MAX_LOOP_STEPS_EXCEEDED',
        message: `Execution aborted after reaching maximum loop step limit (${maxLoopSteps}).`,
        failedAtState: state.currentState,
        timestamp: new Date().toISOString(),
        recoverable: false,
      },
    });
    state = timeoutResult.state;
  }

  const finalStatus = deriveRunStatus(state.currentState);
  if (supabase && persistState) {
    const finalPersist = await persistAgentRunState(supabase, state, finalStatus, triggerContext);
    if (!finalPersist.success && !persistenceError) {
      persistenceError = finalPersist.error;
    }
  }

  const terminalStatus: 'COMPLETED' | 'PAUSED_FOR_APPROVAL' | 'FAILED' =
    state.currentState === 'COMPLETED'
      ? 'COMPLETED'
      : state.currentState === 'WAITING_FOR_APPROVAL'
      ? 'PAUSED_FOR_APPROVAL'
      : 'FAILED';

  return {
    success: state.currentState === 'COMPLETED' || state.currentState === 'WAITING_FOR_APPROVAL',
    finalState: state,
    status: terminalStatus,
    totalTransitions: state.transitionHistory.length,
    persisted: Boolean(supabase && persistState && !persistenceError),
    persistenceError,
    error: state.lastFailure
      ? {
          code: state.lastFailure.code,
          message: state.lastFailure.message,
          state: state.lastFailure.failedAtState,
        }
      : undefined,
  };
}

/**
 * Resumes an orchestrator run from a paused WAITING_FOR_APPROVAL state.
 */
export async function resumeLearningOrchestrator(
  pausedState: AgentRunState,
  decisionPayload: {
    targetState: 'EXECUTING' | 'TOOL_SELECTION' | 'PLANNING' | 'REPLANNING' | 'IDLE';
    decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
    notes?: string;
  },
  options: OrchestratorExecutionOptions = {}
): Promise<OrchestratorExecutionResult> {
  if (pausedState.currentState !== 'WAITING_FOR_APPROVAL') {
    return {
      success: false,
      finalState: pausedState,
      status: 'FAILED',
      totalTransitions: pausedState.transitionHistory.length,
      error: {
        code: 'ERR_INVALID_RESUME_STATE',
        message: `Cannot resume agent from state '${pausedState.currentState}'. Agent must be in 'WAITING_FOR_APPROVAL'.`,
        state: pausedState.currentState,
      },
    };
  }

  // Transition out of WAITING_FOR_APPROVAL using decision payload
  const resumeResult = transitionAgentState(pausedState, {
    targetState: decisionPayload.targetState,
    reason: `User resolved approval request with decision '${decisionPayload.decision}'.`,
    approvalDecision: {
      decision: decisionPayload.decision,
      notes: decisionPayload.notes,
    },
  });

  if (!resumeResult.success) {
    return {
      success: false,
      finalState: pausedState,
      status: 'FAILED',
      totalTransitions: pausedState.transitionHistory.length,
      error: {
        code: resumeResult.error?.code || 'ERR_RESUME_TRANSITION_FAILED',
        message: resumeResult.error?.message || 'Failed to resume agent state.',
        state: pausedState.currentState,
      },
    };
  }

  // Continue running the orchestrator loop from the resumed state
  return runLearningOrchestrator(resumeResult.state, options);
}
