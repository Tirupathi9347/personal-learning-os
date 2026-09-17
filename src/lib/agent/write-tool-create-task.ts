/**
 * Phase 5B: First Controlled Write Tool: create_task
 * 
 * Provides:
 * - Strongly-typed ToolDefinition for the first controlled write operation: create_task.
 * - Strict schema validation matching the real application Task schema (title, description, priority, due_date).
 * - Complete Phase 5A safety policy enforcement pipeline:
 *   Schema -> Tenant -> Permissions -> Risk -> Side-Effects -> Idempotency -> Human Approval Fingerprint -> Existing Task Service.
 * - Non-fabricating dry-run preview mode (zero task creations).
 * - Safe error handling without pretending successful rollbacks.
 * - Clear post-creation verification handoff strictly distinguishing TASK CREATED from LEARNING SUCCESS.
 * - Safe audit metadata generation (sanitized, zero secrets).
 * - Central registration in the canonical AgentToolRegistry.
 */

import {
  ToolDefinition,
  ToolInputSchema,
} from './tool-types';
import { AgentToolRegistry, agentToolRegistry } from './tool-registry';
import {
  WriteActionProposal,
  WriteActionApprovalRecord,
  SideEffectDeclaration,
  WriteSafetyEvaluationResult,
  DryRunPreviewResult,
  WriteActionAuditMetadata,
} from './write-action-types';
import {
  evaluateWriteSafetyPolicy,
  createWriteActionProposal,
  computeActionFingerprint,
  generateIdempotencyKey,
} from './write-action-safety';
import { createTask } from '@/app/actions/task-actions';
import { Task, TaskPriority } from '@/types';
import { VerificationHandoff } from './plan-execution-types';
import { sanitizeWorkingMemory } from './run-persistence';
import {
  PostWriteVerificationResult,
  verifyTaskWriteReadBack,
  buildEnhancedVerificationHandoff,
} from './post-write-verifier';

/**
 * Strict input payload contract for create_task tool.
 * Strictly reflects the real application task model.
 */
export interface CreateTaskInput extends Record<string, unknown> {
  /** Required task title (1 to 255 characters) */
  title: string;
  /** Optional task description */
  description?: string | null;
  /** Optional task priority ('low' | 'medium' | 'high') */
  priority?: TaskPriority | null;
  /** Optional due date string (YYYY-MM-DD or ISO timestamp) */
  due_date?: string | null;
}

/**
 * Output payload returned by create_task tool execution.
 */
export interface CreateTaskOutput {
  /** Whether the task was created successfully */
  success: boolean;
  /** The created Task entity if successful */
  task?: Task | null;
  /** Error message if creation failed */
  error?: string | null;
  /** Created task record ID */
  createdTaskId?: string | null;
  /** Verification handoff package */
  verificationHandoff?: VerificationHandoff;
}

/**
 * Execution outcome status for create_task write tool.
 * Distinguishes VALIDATED, REQUIRES_APPROVAL, BLOCKED, FORBIDDEN, DUPLICATE, EXECUTED, and FAILED.
 */
export type CreateTaskExecutionStatus =
  | 'VALIDATED'          // Passed all checks in dry-run mode (no task created)
  | 'REQUIRES_APPROVAL'  // Paused pending human confirmation
  | 'BLOCKED'            // Blocked by validation error, tenant mismatch, or rejection
  | 'FORBIDDEN'          // Blocked due to forbidden security policy
  | 'DUPLICATE'          // Blocked because idempotency key was already executed
  | 'EXECUTED'           // Successfully executed: exactly ONE task created
  | 'FAILED';            // Database/service execution failed

/**
 * Comprehensive execution result for create_task tool.
 */
export interface CreateTaskToolExecutionResult {
  /** Execution status */
  status: CreateTaskExecutionStatus;
  /** Target tool name ('create_task') */
  toolName: 'create_task';
  /** Proposal ID */
  proposalId: string;
  /** Action ID */
  actionId: string;
  /** Authenticated user ID */
  userId: string;
  /** Created task ID if status === 'EXECUTED' */
  createdTaskId?: string | null;
  /** Created Task object if status === 'EXECUTED' */
  createdTask?: Task | null;
  /** Human-readable mutation summary */
  mutationSummary: string;
  /** Policy evaluation result */
  safetyEvaluation: WriteSafetyEvaluationResult;
  /** Structured verification handoff */
  verificationHandoff?: VerificationHandoff;
  /** Phase 5D Post-write read-back verification result */
  postWriteVerification?: PostWriteVerificationResult;
  /** Whether the task creation was resolved as an existing record via database-enforced uniqueness */
  isDuplicateReused?: boolean;
  /** Sanitized audit metadata */
  auditMetadata: WriteActionAuditMetadata;
  /** Error information if status is FAILED or BLOCKED */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** ISO 8601 execution timestamp */
  executedAt: string;
}

/**
 * Strict Input Schema for create_task tool.
 * Strictly disallows unknown or unsupported properties (additionalProperties: false).
 */
export const createTaskInputSchema: ToolInputSchema = {
  type: 'object',
  required: ['title'],
  properties: {
    title: {
      type: 'string',
      description: 'Clear, actionable title for the study task (1 to 255 characters)',
    },
    description: {
      type: 'string',
      description: 'Optional detailed explanation or requirements for the task',
      nullable: true,
    },
    priority: {
      type: 'string',
      description: 'Task priority level',
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      nullable: true,
    },
    due_date: {
      type: 'string',
      description: 'Optional target due date in YYYY-MM-DD format',
      nullable: true,
    },
  },
  additionalProperties: false,
};

/**
 * Canonical ToolDefinition for create_task write tool.
 */
export const createTaskToolDef: ToolDefinition<CreateTaskInput, CreateTaskOutput> = {
  name: 'create_task',
  description: 'Creates a single study task item for the authenticated student. Requires explicit human approval and deterministic idempotency.',
  category: 'TASK_MANAGEMENT',
  operationType: 'WRITE',
  permissionLevel: 'APPROVAL_REQUIRED',
  riskLevel: 'MEDIUM',
  version: '1.0.0',
  inputSchema: createTaskInputSchema,
  outputSchema: {
    type: 'object',
    description: 'Output payload containing task creation status and the created task record',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the task was created successfully',
      },
      task: {
        type: 'object',
        description: 'The created task record',
        nullable: true,
      },
      createdTaskId: {
        type: 'string',
        description: 'The unique ID of the created task',
        nullable: true,
      },
      error: {
        type: 'string',
        description: 'Error message if creation failed',
        nullable: true,
      },
    },
  },
  auditMetadata: {
    targetEntity: 'tasks',
    affectsStudentData: true,
    isReversible: true,
    requiresUserConfirmation: true,
    auditDescription: 'Creates exactly ONE task record in the tasks table for the authenticated student.',
  },
  tags: ['tasks', 'write', 'controlled_mutation', 'approval_required'],
};

/**
 * Input parameters for executing the create_task write tool pipeline.
 */
export interface ExecuteCreateTaskToolInput {
  /** The write action proposal for creating a task */
  proposal: WriteActionProposal<CreateTaskInput>;
  /** Authenticated user ID from trusted server-side session */
  authenticatedUserId: string;
  /** Human approval record (required for execution if not dryRun) */
  approvalRecord?: WriteActionApprovalRecord | null;
  /** Set of previously seen idempotency keys for duplicate prevention */
  seenIdempotencyKeys?: Set<string> | readonly string[];
  /** Whether to execute as dryRun simulation (default: derived from proposal.dryRun) */
  dryRun?: boolean;
  /** Custom task creation service for testing or dependency injection */
  taskService?: (input: {
    title: string;
    description?: string | null;
    priority?: TaskPriority;
    due_date?: string | null;
    idempotency_key?: string | null;
    user_id?: string | null;
  }) => Promise<{ success: boolean; data?: Task; error?: string; isDuplicateReused?: boolean }>;
  /** Custom task reader service for trusted post-write read-back verification */
  taskReader?: (id: string) => Promise<{
    success: boolean;
    task?: Task | null;
    error?: string;
  }>;
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
}

/**
 * Executes the complete Phase 5B / 5D create_task write tool pipeline.
 * 
 * Guarantees:
 * 1. Executes ONLY when all Phase 5A safety, tenant, schema, and approval checks pass.
 * 2. Scoped to exactly ONE task mutation for the authenticated student.
 * 3. Never performs bulk creation, updates, deletes, or calendar/skill mutations.
 * 4. Zero LLM calls.
 * 5. Deterministic idempotency key checks and database-enforced uniqueness.
 */
export async function executeCreateTaskTool(
  input: ExecuteCreateTaskToolInput
): Promise<CreateTaskToolExecutionResult> {
  const {
    proposal,
    authenticatedUserId,
    approvalRecord,
    seenIdempotencyKeys = new Set<string>(),
    dryRun = proposal.dryRun,
    taskService = createTask,
    taskReader,
    timestamp = new Date().toISOString(),
  } = input;

  // 1. Run Phase 5A Safety Policy Evaluation
  const safetyEval = evaluateWriteSafetyPolicy<CreateTaskInput>({
    proposal,
    authenticatedUserId,
    approvalRecord,
    seenIdempotencyKeys,
    timestamp,
  });

  const baseResult: Omit<CreateTaskToolExecutionResult, 'status' | 'mutationSummary'> = {
    toolName: 'create_task',
    proposalId: proposal.proposalId,
    actionId: proposal.actionId,
    userId: authenticatedUserId,
    safetyEvaluation: safetyEval,
    auditMetadata: safetyEval.auditMetadata,
    executedAt: timestamp,
  };

  // 2. Handle Policy Rejections / Pauses
  if (safetyEval.decision === 'FORBIDDEN') {
    return {
      ...baseResult,
      status: 'FORBIDDEN',
      mutationSummary: 'Action categorically rejected by security policy (FORBIDDEN).',
      error: {
        code: 'ERR_FORBIDDEN_OPERATION',
        message: safetyEval.validationErrors.join('; '),
      },
    };
  }

  if (safetyEval.decision === 'BLOCK') {
    const isDup = safetyEval.idempotencyStatus === 'DUPLICATE';
    return {
      ...baseResult,
      status: isDup ? 'DUPLICATE' : 'BLOCKED',
      mutationSummary: isDup
        ? `Duplicate task creation suppressed: Idempotency key "${proposal.idempotencyKey}" already processed.`
        : `Task creation blocked by safety policy: ${safetyEval.validationErrors.join('; ')}`,
      error: {
        code: isDup ? 'ERR_DUPLICATE_IDEMPOTENCY_KEY' : 'ERR_WRITE_SAFETY_BLOCKED',
        message: safetyEval.validationErrors.join('; '),
      },
    };
  }

  // 3. Handle Dry-Run Mode (Zero Database Mutations)
  if (dryRun) {
    return {
      ...baseResult,
      status: 'VALIDATED',
      mutationSummary: `[DRY RUN] Previewed task creation for "${proposal.input.title}" (${proposal.input.priority || 'medium'} priority). Zero database mutations executed.`,
      createdTaskId: null,
      createdTask: null,
    };
  }

  if (safetyEval.decision === 'REQUIRE_APPROVAL') {
    return {
      ...baseResult,
      status: 'REQUIRES_APPROVAL',
      mutationSummary: 'Task creation paused pending explicit human confirmation.',
    };
  }

  // 4. Execute Real Task Creation via Database Service (with database-enforced idempotency key)
  try {
    const createResult = await taskService({
      title: proposal.input.title.trim(),
      description: proposal.input.description ? proposal.input.description.trim() : null,
      priority: (proposal.input.priority as TaskPriority) || 'medium',
      due_date: proposal.input.due_date ? proposal.input.due_date.trim() : null,
      idempotency_key: proposal.idempotencyKey || null,
      user_id: authenticatedUserId,
    });

    if (!createResult.success || !createResult.data) {
      return {
        ...baseResult,
        status: 'FAILED',
        mutationSummary: `Task creation service failed: ${createResult.error || 'Unknown database error'}.`,
        error: {
          code: 'ERR_TASK_CREATION_FAILED',
          message: createResult.error || 'Failed to insert task record into database.',
        },
      };
    }

    const createdTask = createResult.data;
    const isDuplicateReused = !!createResult.isDuplicateReused;

    // 5. Phase 5D: Post-Write Read-Back Verification
    let postWriteVerification: PostWriteVerificationResult | undefined = undefined;
    if (taskReader) {
      postWriteVerification = await verifyTaskWriteReadBack({
        proposal,
        createdTaskId: createdTask.id,
        authenticatedUserId,
        taskReader,
        timestamp,
      });
    }

    // 6. Build Verification Handoff (TASK CREATED != LEARNING SUCCESS)
    const verificationHandoff: VerificationHandoff = postWriteVerification
      ? buildEnhancedVerificationHandoff(postWriteVerification)
      : {
          planId: proposal.actionId || proposal.proposalId,
          stepId: proposal.actionId,
          intendedAction: `Create task: ${proposal.input.title}`,
          executedTools: ['create_task'],
          toolResultsSummary: {
            createdTaskId: createdTask.id,
            title: createdTask.title,
            status: createdTask.status,
            priority: createdTask.priority,
            due_date: createdTask.due_date,
            createdAt: createdTask.created_at,
          },
          toolsExecutedSuccessfully: true,
          failedTools: [],
          unresolvedGaps: [],
          verificationCriteria: [
            `Task record created in database with ID "${createdTask.id}"`,
          ],
          empiricalEvidenceObserved: true,
          disclaimer: 'Task record successfully created in student task manager. This confirms task creation ONLY; it Does NOT imply learning mastery or task completion.',
        };

    const auditStage = isDuplicateReused
      ? 'DUPLICATE'
      : postWriteVerification
        ? postWriteVerification.auditStage
        : 'WRITE_SUCCEEDED';

    const mutationSummary = isDuplicateReused
      ? `Task already exists in database (deduplicated via database unique constraint on idempotency key). Reused existing record ID: ${createdTask.id}.`
      : `Successfully created task "${createdTask.title}" (ID: ${createdTask.id}, Priority: ${createdTask.priority}, Status: ${createdTask.status}).`;

    return {
      ...baseResult,
      status: isDuplicateReused ? 'DUPLICATE' : 'EXECUTED',
      isDuplicateReused,
      createdTaskId: createdTask.id,
      createdTask,
      postWriteVerification,
      mutationSummary,
      verificationHandoff,
      auditMetadata: {
        ...safetyEval.auditMetadata,
        decisionReason: isDuplicateReused
          ? `Duplicate task reused via database uniqueness constraint (ID: ${createdTask.id}).`
          : `Task created successfully with ID ${createdTask.id} (${auditStage}).`,
      },
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ...baseResult,
      status: 'FAILED',
      mutationSummary: `Task creation threw an unexpected runtime exception: ${errMsg}.`,
      error: {
        code: 'ERR_TASK_CREATION_EXCEPTION',
        message: errMsg,
      },
    };
  }
}

/**
 * Creates a helper write proposal specifically formatted for create_task.
 */
export function createCreateTaskProposal(params: {
  actionId: string;
  userId: string;
  input: CreateTaskInput;
  idempotencyKey?: string;
  contextId?: string;
  dryRun?: boolean;
  proposedAt?: string;
}): WriteActionProposal<CreateTaskInput> {
  const affectedResources: SideEffectDeclaration[] = [
    {
      target: 'TASK',
      resourceType: 'tasks',
      actionType: 'CREATE',
      description: `Create task item: "${params.input.title}"`,
      isReversible: true,
    },
  ];

  return createWriteActionProposal<CreateTaskInput>({
    actionId: params.actionId,
    toolName: 'create_task',
    userId: params.userId,
    permissionLevel: 'APPROVAL_REQUIRED',
    riskLevel: 'MEDIUM',
    input: params.input,
    inputSchema: createTaskInputSchema,
    expectedMutation: `Creates a single task record "${params.input.title}" in the student tasks table.`,
    affectedResources,
    requiresApproval: true,
    approvalReason: 'Creating a new task modifies the student task board and mandates explicit human approval.',
    idempotencyKey: params.idempotencyKey,
    contextId: params.contextId,
    dryRun: params.dryRun ?? true,
    proposedAt: params.proposedAt,
  });
}

/**
 * Master Write Tool Array containing create_task.
 */
export const WRITE_TOOLS: readonly ToolDefinition[] = Object.freeze([
  createTaskToolDef,
]);

/**
 * Registers the create_task write tool into the canonical AgentToolRegistry.
 */
export function registerWriteTools(registry: AgentToolRegistry = agentToolRegistry): void {
  for (const tool of WRITE_TOOLS) {
    if (!registry.hasTool(tool.name)) {
      registry.registerTool(tool);
    }
  }
}

// Automatically register create_task tool into the global singleton registry
registerWriteTools(agentToolRegistry);
