/**
 * Phase 5C: Orchestrator-Controlled Approval & Write Execution Adapter
 * 
 * Provides:
 * - Deterministic conversion of eligible PlanSteps into structured create_task WriteActionProposals.
 * - Integration of Phase 5A safety policy and Phase 5B create_task execution into the SINGLE Learning Orchestrator loop.
 * - Strict enforcement of the human approval boundary (transitions to WAITING_FOR_APPROVAL; zero agent self-approval).
 * - Cryptographic fingerprint revalidation upon orchestrator resume (rejecting tampered proposals).
 * - Idempotency tracking across pause/resume cycles (preventing duplicate task creation on retry).
 * - Verification handoff generation for Phase 4E (confirming task insertion without claiming learning mastery).
 * - Sanitized working memory updates and strict tenant isolation.
 */

import {
  LearningPlan,
  PlanStep,
  PlanStepStatus,
} from './planning-types';
import {
  WriteActionProposal,
  WriteActionApprovalRecord,
  SideEffectDeclaration,
  WriteSafetyEvaluationResult,
} from './write-action-types';
import {
  evaluateWriteSafetyPolicy,
  createWriteActionProposal,
  computeActionFingerprint,
  generateIdempotencyKey,
  validateApprovalIntegrity,
} from './write-action-safety';
import {
  CreateTaskInput,
  createTaskInputSchema,
  executeCreateTaskTool,
  CreateTaskToolExecutionResult,
  createCreateTaskProposal,
} from './write-tool-create-task';
import {
  AgentRunState,
  AgentApprovalRequest,
} from './state-types';
import {
  ExecutingHandlerResult,
  VerifyingHandlerResult,
  OrchestratorExecutionOptions,
  OrchestratorExecutionResult,
} from './orchestrator-types';
import { resumeLearningOrchestrator } from './learning-orchestrator';
import { sanitizeWorkingMemory } from './run-persistence';
import { Task, TaskPriority } from '@/types';
import {
  PostWriteVerificationResult,
  resolveDurableWriteRetry,
} from './post-write-verifier';

/**
 * Creates an Orchestrator Verification Handler specifically confirming write operations.
 * Strictly verifies database insertion without claiming learning mastery or exam readiness.
 */
export function createOrchestratorWriteVerifyingHandler(options?: {
  timestamp?: string;
}) {
  return async function onVerifying(state: AgentRunState): Promise<VerifyingHandlerResult> {
    const memory = state.workingMemory;
    const createdTaskId = memory.createdTaskId as string | undefined;
    const createdTask = memory.createdTask as Task | undefined;
    const lastWriteResult = memory.lastWriteResult as CreateTaskToolExecutionResult | undefined;

    if (!createdTaskId || !lastWriteResult || lastWriteResult.status !== 'EXECUTED') {
      return {
        verified: false,
        needsReplan: true,
        failureReason: 'Missing created task ID or failed write result in working memory.',
      };
    }

    // Phase 5D: Check post-write read-back verification result if present
    const postWrite = lastWriteResult.postWriteVerification;
    if (postWrite) {
      if (postWrite.status === 'MISMATCH') {
        return {
          verified: false,
          needsReplan: true,
          failureReason: `Post-write verification MISMATCH: ${postWrite.discrepancies.join('; ')}`,
          workingMemory: {
            postWriteVerification: postWrite,
          },
        };
      }

      if (postWrite.status === 'NOT_FOUND') {
        return {
          verified: false,
          needsReplan: true,
          failureReason: `Post-write verification NOT_FOUND: Task "${createdTaskId}" was not found in read-back.`,
          workingMemory: {
            postWriteVerification: postWrite,
          },
        };
      }

      if (postWrite.status === 'UNVERIFIED' || postWrite.status === 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN') {
        return {
          verified: false,
          needsReplan: true,
          failureReason: `Post-write verification UNCERTAIN: ${postWrite.error?.message || 'Read-back unconfirmed.'}`,
          workingMemory: {
            postWriteVerification: postWrite,
          },
        };
      }
    }

    const verificationHandoff = {
      verifiedAt: options?.timestamp || new Date().toISOString(),
      actionType: 'create_task',
      createdTaskId,
      taskTitle: createdTask?.title || lastWriteResult.createdTask?.title,
      userId: state.userId,
      isTaskRecordVerified: true,
      learningMasteryClaimed: false,
      disclaimer: 'Task record successfully created in student task manager. This confirms task creation ONLY; it DOES NOT imply learning mastery, goal completion, or exam readiness.',
    };

    return {
      verified: true,
      reason: `Verified task record "${createdTaskId}" created successfully in database.`,
      workingMemory: {
        verificationHandoff,
        postWriteVerification: postWrite,
      },
    };
  };
}

/**
 * Resumes an orchestrator run paused at WAITING_FOR_APPROVAL specifically for a write proposal.
 */
export async function resumeOrchestratorWithWriteApproval(
  pausedState: AgentRunState,
  decision: 'APPROVED' | 'REJECTED',
  options?: {
    notes?: string;
    taskService?: (input: {
      title: string;
      description?: string | null;
      priority?: TaskPriority;
      due_date?: string | null;
      idempotency_key?: string | null;
      user_id?: string | null;
    }) => Promise<{ success: boolean; data?: Task; error?: string; isDuplicateReused?: boolean }>;
    taskReader?: (id: string) => Promise<{
      success: boolean;
      task?: Task | null;
      error?: string;
    }>;
    persistedIdempotencyMap?: Map<string, { taskId: string; executedAt: string }>;
    existingTasksQuery?: () => Promise<Task[]>;
    orchestratorOptions?: OrchestratorExecutionOptions;
  }
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

  const writeHandler = createOrchestratorWriteExecutingHandler({
    taskService: options?.taskService,
    taskReader: options?.taskReader,
    persistedIdempotencyMap: options?.persistedIdempotencyMap,
    existingTasksQuery: options?.existingTasksQuery,
  });

  const verifyHandler = createOrchestratorWriteVerifyingHandler();

  const mergedHandlers = {
    onVerifying: verifyHandler,
    ...(options?.orchestratorOptions?.handlers || {}),
    onExecuting: writeHandler,
  };

  return resumeLearningOrchestrator(
    pausedState,
    {
      targetState: 'EXECUTING',
      decision,
      notes: options?.notes,
    },
    {
      ...(options?.orchestratorOptions || {}),
      handlers: mergedHandlers,
    }
  );
}

/**
 * Checks if a PlanStep is explicitly designed to perform task creation.
 */
export function isPlanStepTaskCreation(step: PlanStep): boolean {
  if (!step) return false;

  // 1. Explicit tool declaration
  if (Array.isArray(step.requiredTools) && step.requiredTools.includes('create_task')) {
    return true;
  }

  // 2. Action payload explicit tool indicator
  if (step.actionPayload && typeof step.actionPayload === 'object') {
    const payload = step.actionPayload as Record<string, unknown>;
    if (payload.toolName === 'create_task' || payload.actionType === 'create_task') {
      return true;
    }
  }

  // 3. Step ID or Title explicit intent
  if (step.id.includes('create-task') || step.id.includes('task-creation')) {
    return true;
  }

  return false;
}

/**
 * Maps a PlanPriority ('LOW' | 'MEDIUM' | 'HIGH' | 'URGENT') to a TaskPriority ('low' | 'medium' | 'high').
 */
function mapPlanPriorityToTaskPriority(priority?: string | null): TaskPriority {
  const norm = String(priority || 'medium').toLowerCase();
  if (norm === 'low') return 'low';
  if (norm === 'high' || norm === 'urgent') return 'high';
  return 'medium';
}

/**
 * Deterministically constructs a create_task WriteActionProposal from an eligible PlanStep.
 */
export function createTaskProposalFromPlanStep(
  plan: LearningPlan,
  stepId: string,
  authenticatedUserId: string,
  options?: {
    contextId?: string;
    timestamp?: string;
  }
): {
  success: boolean;
  proposal?: WriteActionProposal<CreateTaskInput>;
  error?: string;
} {
  const timestamp = options?.timestamp || new Date().toISOString();

  // 1. Tenant validation
  if (!authenticatedUserId || authenticatedUserId.trim() === '') {
    return {
      success: false,
      error: 'Unauthenticated context: Missing authenticated user ID.',
    };
  }

  if (authenticatedUserId !== plan.userId) {
    return {
      success: false,
      error: `Tenant mismatch: Authenticated user "${authenticatedUserId}" does not match plan owner "${plan.userId}".`,
    };
  }

  // 2. Step resolution
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) {
    return {
      success: false,
      error: `Target step "${stepId}" does not exist in plan "${plan.planId}".`,
    };
  }

  if (!isPlanStepTaskCreation(step)) {
    return {
      success: false,
      error: `Step "${stepId}" is not configured for task creation.`,
    };
  }

  // 3. Extract task fields without fabrication
  let title = step.title.trim();
  let description: string | null = step.description ? step.description.trim() : null;
  let priority: TaskPriority = mapPlanPriorityToTaskPriority(step.priority);
  let dueDate: string | null = null;

  if (step.actionPayload && typeof step.actionPayload === 'object') {
    const p = step.actionPayload as Record<string, unknown>;
    if (typeof p.title === 'string' && p.title.trim() !== '') {
      title = p.title.trim();
    }
    if (typeof p.description === 'string') {
      description = p.description.trim();
    }
    if (typeof p.priority === 'string') {
      priority = mapPlanPriorityToTaskPriority(p.priority);
    }
    if (typeof p.due_date === 'string' && p.due_date.trim() !== '') {
      dueDate = p.due_date.trim();
    }
  }

  if (!title) {
    return {
      success: false,
      error: 'Cannot construct create_task proposal: Step title is empty.',
    };
  }

  const taskInput: CreateTaskInput = {
    title,
    description,
    priority,
    due_date: dueDate,
  };

  const contextId = options?.contextId || `${plan.planId}_${step.id}`;
  const idempotencyKey = generateIdempotencyKey({
    userId: authenticatedUserId,
    toolName: 'create_task',
    input: taskInput,
    contextId,
  });

  const proposal = createCreateTaskProposal({
    actionId: step.id,
    userId: authenticatedUserId,
    input: taskInput,
    idempotencyKey,
    contextId,
    dryRun: false,
    proposedAt: timestamp,
  });

  return {
    success: true,
    proposal,
  };
}

/**
 * Builds a non-transferable WriteActionApprovalRecord from an AgentApprovalRequest.
 */
export function buildApprovalRecordFromRequest(
  request: AgentApprovalRequest,
  proposal: WriteActionProposal<CreateTaskInput>,
  authenticatedUserId: string,
  options?: {
    expiresInMs?: number;
    timestamp?: string;
  }
): WriteActionApprovalRecord {
  const timestamp = options?.timestamp || new Date().toISOString();
  const expiresInMs = options?.expiresInMs || 1000 * 60 * 60 * 24; // 24 hours
  const expiresAt = new Date(new Date(timestamp).getTime() + expiresInMs).toISOString();

  const actionFingerprint = computeActionFingerprint({
    userId: proposal.userId,
    toolName: proposal.toolName,
    input: proposal.input,
    affectedResources: proposal.affectedResources,
    riskLevel: proposal.riskLevel,
  });

  const decision = request.decision === 'APPROVED' ? 'APPROVED' : 'REJECTED';

  return {
    approvalId: request.id,
    proposalId: proposal.proposalId,
    actionFingerprint,
    userId: authenticatedUserId,
    decision,
    decisionNotes: request.decisionNotes || undefined,
    decidedAt: request.resolvedAt || timestamp,
    expiresAt,
    isTransferable: false,
  };
}

/**
 * Creates an Orchestrator Execution Handler specifically managing write proposals and controlled write execution.
 */
export function createOrchestratorWriteExecutingHandler(options?: {
  taskService?: (input: {
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    due_date?: string | null;
    idempotency_key?: string | null;
    user_id?: string | null;
  }) => Promise<{ success: boolean; data?: Task; error?: string; isDuplicateReused?: boolean }>;
  taskReader?: (id: string) => Promise<{
    success: boolean;
    task?: Task | null;
    error?: string;
  }>;
  persistedIdempotencyMap?: Map<string, { taskId: string; executedAt: string }>;
  existingTasksQuery?: () => Promise<Task[]>;
  timestamp?: string;
}) {
  return async function onExecuting(state: AgentRunState): Promise<ExecutingHandlerResult> {
    const timestamp = options?.timestamp || new Date().toISOString();
    const memory = state.workingMemory;
    const plan = memory.plan as LearningPlan | undefined;
    const currentStepId = (memory.currentStepId as string | undefined) || (plan?.steps[0]?.id);

    if (!plan || !currentStepId) {
      return {
        needsReplan: true,
        reason: 'Missing plan or target step ID in working memory.',
      };
    }

    const step = plan.steps.find((s) => s.id === currentStepId);
    if (!step) {
      return {
        needsReplan: true,
        reason: `Target step "${currentStepId}" not found in plan.`,
      };
    }

    // Check if this step is a write action (create_task)
    const isWrite = isPlanStepTaskCreation(step);
    if (!isWrite) {
      return {
        needsReplan: true,
        reason: `Step "${currentStepId}" is not configured for write tool execution in Phase 5C.`,
      };
    }

    // 1. Obtain or construct WriteActionProposal
    let proposal = memory.activeWriteProposal as WriteActionProposal<CreateTaskInput> | undefined;
    if (!proposal) {
      const propResult = createTaskProposalFromPlanStep(plan, currentStepId, state.userId, {
        timestamp,
      });

      if (!propResult.success || !propResult.proposal) {
        return {
          needsReplan: true,
          reason: `Failed to construct create_task proposal: ${propResult.error || 'Unknown error'}`,
        };
      }
      proposal = propResult.proposal;
    }

    // 2. Track executed idempotency keys to prevent duplicate resume writes
    const executedKeysArray = (memory.executedIdempotencyKeys as string[] | undefined) || [];
    const seenIdempotencyKeys = new Set<string>(executedKeysArray);

    // 3. Check if we already have an active approval request
    const approvalReq = state.activeApprovalRequest;

    // A. INITIAL EVALUATION (Not yet approved)
    if (!approvalReq || approvalReq.decision === 'PENDING') {
      // Evaluate safety policy
      const safetyEval = evaluateWriteSafetyPolicy({
        proposal,
        authenticatedUserId: state.userId,
        approvalRecord: null,
        seenIdempotencyKeys,
        timestamp,
      });

      if (safetyEval.decision === 'FORBIDDEN') {
        return {
          needsReplan: true,
          reason: `Write action is FORBIDDEN: ${safetyEval.validationErrors.join('; ')}`,
        };
      }

      if (safetyEval.decision === 'BLOCK') {
        return {
          needsReplan: true,
          reason: `Write action blocked by safety policy: ${safetyEval.validationErrors.join('; ')}`,
        };
      }

      if (safetyEval.decision === 'REQUIRE_APPROVAL') {
        const approvalRequestId = `req_${proposal.proposalId}_${Date.now()}`;
        const newApprovalRequest: AgentApprovalRequest = {
          id: approvalRequestId,
          actionType: 'create_task',
          description: proposal.expectedMutation,
          riskLevel: proposal.riskLevel,
          payload: {
            proposal,
            taskInput: proposal.input,
          },
          requestedAt: timestamp,
          decision: 'PENDING',
        };

        return {
          requiresApproval: true,
          approvalRequest: newApprovalRequest,
          reason: 'Write operation requires explicit human confirmation.',
          workingMemory: {
            activeWriteProposal: proposal,
            currentStepId,
          },
        };
      }
    }

    // B. RESUMED AFTER HUMAN APPROVAL RESOLUTION
    if (approvalReq && approvalReq.decision !== 'PENDING') {
      // User explicitly rejected
      if (approvalReq.decision === 'REJECTED') {
        return {
          needsReplan: true,
          reason: `Human user explicitly rejected task creation: ${approvalReq.decisionNotes || 'User canceled action'}`,
          workingMemory: {
            lastRejectionNotes: approvalReq.decisionNotes,
            activeWriteProposal: proposal,
          },
        };
      }

      // User approved -> Build Approval Record and verify fingerprint integrity
      const approvalRecord = buildApprovalRecordFromRequest(approvalReq, proposal, state.userId, {
        timestamp,
      });

      // Recalculate fingerprint and revalidate
      const integrityCheck = validateApprovalIntegrity(proposal, approvalRecord, timestamp);
      if (!integrityCheck.isValid) {
        return {
          needsReplan: true,
          reason: `Approval integrity validation failed: ${integrityCheck.error}`,
          workingMemory: {
            integrityFailure: integrityCheck.error,
          },
        };
      }

      // Check if already executed in this run (Duplicate resume prevention)
      if (seenIdempotencyKeys.has(proposal.idempotencyKey)) {
        return {
          needsReplan: false,
          reason: `Duplicate resume suppressed: Idempotency key "${proposal.idempotencyKey}" was already executed.`,
          workingMemory: {
            duplicateSuppression: true,
          },
        };
      }

      // Phase 5D: Check durable retry resolution
      const retryResolution = await resolveDurableWriteRetry({
        proposal,
        authenticatedUserId: state.userId,
        persistedIdempotencyMap: options?.persistedIdempotencyMap,
        existingTasksQuery: options?.existingTasksQuery,
      });

      if (retryResolution.outcome === 'DUPLICATE_REUSED') {
        return {
          needsReplan: false,
          reason: `Duplicate retry resolved safely: ${retryResolution.reason}`,
          workingMemory: {
            duplicateSuppression: true,
            createdTaskId: retryResolution.existingTaskId,
            createdTask: retryResolution.existingTask,
          },
        };
      }

      if (retryResolution.outcome === 'UNCERTAIN_MANUAL_REVIEW') {
        return {
          needsReplan: true,
          reason: `Write retry halted for safety: ${retryResolution.reason}`,
          workingMemory: {
            manualReviewRequired: true,
          },
        };
      }

      // Execute Phase 5B / 5D create_task tool
      const execResult = await executeCreateTaskTool({
        proposal,
        authenticatedUserId: state.userId,
        approvalRecord,
        seenIdempotencyKeys,
        dryRun: false,
        taskService: options?.taskService,
        taskReader: options?.taskReader,
        timestamp,
      });

      if (execResult.status === 'FAILED') {
        return {
          needsReplan: true,
          reason: `create_task execution failed: ${execResult.error?.message || 'Database error'}`,
          workingMemory: {
            lastWriteError: execResult.error,
          },
        };
      }

      // Successful Execution
      const nextExecutedKeys = [...executedKeysArray, proposal.idempotencyKey];

      // Update Step Status on Plan
      const updatedSteps = plan.steps.map((s) => {
        if (s.id === currentStepId) {
          return {
            ...s,
            status: 'COMPLETED' as PlanStepStatus,
            output: execResult,
            updatedAt: timestamp,
          };
        }
        return s;
      });

      const updatedPlan: LearningPlan = {
        ...plan,
        steps: updatedSteps,
        updatedAt: timestamp,
      };

      const verificationHandoff = {
        verifiedAt: timestamp,
        actionType: 'create_task',
        createdTaskId: execResult.createdTaskId,
        taskTitle: execResult.createdTask?.title,
        userId: state.userId,
        isTaskRecordVerified: true,
        learningMasteryClaimed: false,
        disclaimer: 'Task record successfully created in student task manager. This confirms task creation ONLY; it DOES NOT imply learning mastery, goal completion, or exam readiness.',
      };

      const sanitizedMemory = sanitizeWorkingMemory({
        plan: updatedPlan,
        currentStepId,
        createdTask: execResult.createdTask,
        createdTaskId: execResult.createdTaskId,
        executionOutput: execResult,
        executedIdempotencyKeys: nextExecutedKeys,
        lastWriteResult: execResult,
        verificationHandoff,
      });

      return {
        executionOutput: execResult,
        reason: `Successfully executed create_task (Task ID: ${execResult.createdTaskId}).`,
        workingMemory: sanitizedMemory,
      };
    }

    return {
      needsReplan: true,
      reason: 'Unexpected approval state during write execution.',
    };
  };
}
