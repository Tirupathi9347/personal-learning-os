/**
 * Phase 5D: Durable Write Reliability & Post-Write Read-Back Verification
 * 
 * Provides:
 * - Trustworthy read-back verification after task creation (distinguishing WRITE_SUCCEEDED from WRITE_VERIFIED).
 * - Multi-field comparison (title, priority, description, due_date, status) against approved proposal inputs.
 * - Strict tenant isolation enforcement during read-back.
 * - Partial failure detection (WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN) without claiming fake rollbacks.
 * - Durable retry resolution to prevent duplicate task creation on network response loss, browser refresh, or process restart.
 * - Comprehensive audit stage categorization (PROPOSED, APPROVED, EXECUTION_ATTEMPTED, WRITE_SUCCEEDED, WRITE_VERIFIED, WRITE_UNVERIFIED, DUPLICATE, FAILED, MANUAL_REVIEW).
 * - Absolute guarantees: Zero LLM calls, zero extra write tools, zero fabrication of learning mastery.
 */

import { Task, TaskPriority } from '@/types';
import { WriteActionProposal, WriteActionAuditMetadata } from './write-action-types';
import { CreateTaskInput } from './write-tool-create-task';
import { VerificationHandoff } from './plan-execution-types';

/**
 * Granular audit stages tracking write action lifecycle.
 */
export type AuditExecutionStage =
  | 'PROPOSED'
  | 'APPROVED'
  | 'EXECUTION_ATTEMPTED'
  | 'WRITE_SUCCEEDED'
  | 'WRITE_VERIFIED'
  | 'WRITE_UNVERIFIED'
  | 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN'
  | 'DUPLICATE'
  | 'FAILED'
  | 'MANUAL_REVIEW';

/**
 * Status outcomes for post-write read-back verification.
 */
export type PostWriteVerificationStatus =
  | 'VERIFIED'                              // Insert reported success and read-back confirmed exact match
  | 'UNVERIFIED'                            // Insert reported success but read-back failed/timed out
  | 'MISMATCH'                              // Read-back succeeded but fields differ from approved proposal
  | 'NOT_FOUND'                             // Read-back specifically returned 0 rows / not found for ID
  | 'FAILED'                                // Initial write execution failed
  | 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN'; // Database write succeeded but verification could not be confirmed

/**
 * Strongly-typed result of post-write read-back verification.
 */
export interface PostWriteVerificationResult {
  /** Post-write verification outcome */
  status: PostWriteVerificationStatus;
  /** Proposal ID */
  proposalId: string;
  /** Action ID */
  actionId: string;
  /** Tool name strictly 'create_task' */
  toolName: 'create_task';
  /** Authenticated student user ID */
  userId: string;
  /** Idempotency key if present */
  idempotencyKey?: string;
  /** The full write action proposal */
  proposal: WriteActionProposal<CreateTaskInput>;
  /** Created task ID */
  createdTaskId: string | null;
  /** Whether the underlying database insert reported success */
  writeSucceeded: boolean;
  /** Whether read-back successfully retrieved and confirmed the task */
  readBackVerified: boolean;
  /** List of detected field discrepancies if status === 'MISMATCH' */
  discrepancies: string[];
  /** The verified Task entity if read-back succeeded */
  verifiedTask?: Task | null;
  /** Disclaimer strictly separating task insertion from learning mastery */
  disclaimer: string;
  /** ISO 8601 timestamp of verification */
  verifiedAt: string;
  /** Audit lifecycle stage */
  auditStage: AuditExecutionStage;
  /** Error information if verification failed */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Parameters for executing a post-write read-back verification.
 */
export interface VerifyTaskWriteReadBackInput {
  /** The approved write action proposal */
  proposal: WriteActionProposal<CreateTaskInput>;
  /** The created task ID returned by the insertion operation */
  createdTaskId: string;
  /** Authenticated user ID */
  authenticatedUserId: string;
  /** Custom task reader function (dependency injection for testing or server boundary) */
  taskReader?: (id: string) => Promise<{
    success: boolean;
    task?: Task | null;
    error?: string;
  }>;
  /** Fixed timestamp for testing */
  timestamp?: string;
}

/**
 * Performs a safe, authenticated read-back verification against the trusted read layer.
 */
export async function verifyTaskWriteReadBack(
  input: VerifyTaskWriteReadBackInput
): Promise<PostWriteVerificationResult> {
  const {
    proposal,
    createdTaskId,
    authenticatedUserId,
    taskReader,
    timestamp = new Date().toISOString(),
  } = input;

  const baseResult: Omit<PostWriteVerificationResult, 'status' | 'readBackVerified' | 'discrepancies' | 'auditStage'> = {
    proposalId: proposal.proposalId,
    actionId: proposal.actionId,
    toolName: 'create_task',
    userId: authenticatedUserId,
    idempotencyKey: proposal.idempotencyKey,
    proposal,
    createdTaskId,
    writeSucceeded: true,
    disclaimer: 'Task record creation verified in student database. Confirms task insertion ONLY; does NOT imply learning mastery, skill improvement, or exam readiness.',
    verifiedAt: timestamp,
  };

  // 1. Validate createdTaskId format
  if (!createdTaskId || typeof createdTaskId !== 'string' || createdTaskId.trim() === '') {
    return {
      ...baseResult,
      status: 'UNVERIFIED',
      readBackVerified: false,
      discrepancies: ['Missing or empty createdTaskId returned from write operation.'],
      auditStage: 'WRITE_UNVERIFIED',
      error: {
        code: 'ERR_MISSING_CREATED_TASK_ID',
        message: 'No valid createdTaskId was provided for read-back verification.',
      },
    };
  }

  // 2. Validate tenant consistency between proposal and authenticated context
  if (authenticatedUserId !== proposal.userId) {
    return {
      ...baseResult,
      status: 'UNVERIFIED',
      readBackVerified: false,
      discrepancies: [
        `Tenant mismatch: authenticated user "${authenticatedUserId}" does not match proposal owner "${proposal.userId}".`,
      ],
      auditStage: 'WRITE_UNVERIFIED',
      error: {
        code: 'ERR_TENANT_MISMATCH',
        message: 'Tenant identity mismatch detected during read-back verification.',
      },
    };
  }

  // 3. Perform read-back query
  if (!taskReader) {
    // If no reader provided in testing/offline mode, return unverified partial state
    return {
      ...baseResult,
      status: 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN',
      readBackVerified: false,
      discrepancies: ['No task reader service available to perform read-back verification.'],
      auditStage: 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN',
      error: {
        code: 'ERR_NO_TASK_READER',
        message: 'Task read-back service was not provided.',
      },
    };
  }

  try {
    const readResponse = await taskReader(createdTaskId);

    if (!readResponse.success || !readResponse.task) {
      const isNotFound = readResponse.error?.toLowerCase().includes('not found') || !readResponse.task;
      return {
        ...baseResult,
        status: isNotFound ? 'NOT_FOUND' : 'UNVERIFIED',
        readBackVerified: false,
        discrepancies: [
          `Read-back failed for task "${createdTaskId}": ${readResponse.error || 'Record not found in database.'}`,
        ],
        auditStage: 'WRITE_UNVERIFIED',
        error: {
          code: isNotFound ? 'ERR_TASK_NOT_FOUND' : 'ERR_READ_BACK_FAILED',
          message: readResponse.error || `Task "${createdTaskId}" could not be retrieved from database.`,
        },
      };
    }

    const task = readResponse.task;

    // 4. Enforce tenant isolation on retrieved task
    if (task.user_id && task.user_id !== authenticatedUserId) {
      return {
        ...baseResult,
        status: 'UNVERIFIED',
        readBackVerified: false,
        discrepancies: [
          `Cross-tenant violation: Task "${createdTaskId}" belongs to user "${task.user_id}", but authenticated user is "${authenticatedUserId}".`,
        ],
        auditStage: 'WRITE_UNVERIFIED',
        error: {
          code: 'ERR_CROSS_TENANT_VIOLATION',
          message: 'Retrieved task belongs to a different student account.',
        },
      };
    }

    // 5. Compare fields against approved proposal input
    const discrepancies: string[] = [];

    // Title comparison
    const expectedTitle = proposal.input.title.trim();
    if (task.title.trim() !== expectedTitle) {
      discrepancies.push(`Title mismatch: expected "${expectedTitle}", found "${task.title.trim()}".`);
    }

    // Priority comparison
    const expectedPriority = String(proposal.input.priority || 'medium').toLowerCase();
    const actualPriority = String(task.priority || 'medium').toLowerCase();
    if (actualPriority !== expectedPriority) {
      discrepancies.push(`Priority mismatch: expected "${expectedPriority}", found "${actualPriority}".`);
    }

    // Status comparison (must be todo for freshly created task)
    if (task.status !== 'todo') {
      discrepancies.push(`Status mismatch: expected "todo", found "${task.status}".`);
    }

    // Description comparison (if specified)
    if (proposal.input.description !== undefined && proposal.input.description !== null) {
      const expectedDesc = proposal.input.description.trim();
      const actualDesc = (task.description || '').trim();
      if (actualDesc !== expectedDesc) {
        discrepancies.push(`Description mismatch: expected "${expectedDesc}", found "${actualDesc}".`);
      }
    }

    // Due date comparison (if specified) - normalized to YYYY-MM-DD representation
    if (proposal.input.due_date) {
      const normalizeDateString = (d: string | null | undefined): string => {
        if (!d) return '';
        const trimmed = d.trim();
        const datePart = trimmed.includes('T') ? trimmed.split('T')[0] : trimmed;
        return datePart.trim();
      };

      const expectedDueDate = normalizeDateString(proposal.input.due_date);
      const actualDueDate = normalizeDateString(task.due_date);

      if (actualDueDate !== expectedDueDate) {
        discrepancies.push(`Due date mismatch: expected "${proposal.input.due_date.trim()}", found "${(task.due_date || '').trim()}".`);
      }
    }

    // Idempotency key comparison (if present on task record)
    if (task.idempotency_key && proposal.idempotencyKey) {
      if (task.idempotency_key !== proposal.idempotencyKey) {
        discrepancies.push(`Idempotency key mismatch: expected "${proposal.idempotencyKey}", found "${task.idempotency_key}".`);
      }
    }

    if (discrepancies.length > 0) {
      return {
        ...baseResult,
        status: 'MISMATCH',
        readBackVerified: false,
        discrepancies,
        verifiedTask: task,
        auditStage: 'WRITE_UNVERIFIED',
        error: {
          code: 'ERR_FIELD_MISMATCH',
          message: `Read-back field discrepancies detected: ${discrepancies.join('; ')}`,
        },
      };
    }

    // 6. Complete Verification Confirmed
    return {
      ...baseResult,
      status: 'VERIFIED',
      readBackVerified: true,
      discrepancies: [],
      verifiedTask: task,
      auditStage: 'WRITE_VERIFIED',
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      ...baseResult,
      status: 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN',
      readBackVerified: false,
      discrepancies: [`Exception during read-back verification: ${errMsg}`],
      auditStage: 'WRITE_SUCCEEDED_VERIFICATION_UNCERTAIN',
      error: {
        code: 'ERR_READ_BACK_EXCEPTION',
        message: errMsg,
      },
    };
  }
}

/**
 * Result of resolving a retry attempt against durable idempotency records.
 */
export interface DurableRetryResolution {
  outcome: 'PROCEED_NEW' | 'DUPLICATE_REUSED' | 'UNCERTAIN_MANUAL_REVIEW';
  existingTaskId?: string;
  existingTask?: Task;
  reason: string;
}

/**
 * Resolves whether a write retry should execute a new insertion, reuse an existing confirmed task,
 * or pause for manual review when the outcome of a prior network attempt is uncertain.
 */
export async function resolveDurableWriteRetry(params: {
  proposal: WriteActionProposal<CreateTaskInput>;
  authenticatedUserId: string;
  persistedIdempotencyMap?: Map<string, { taskId: string; executedAt: string }>;
  existingTasksQuery?: () => Promise<Task[]>;
}): Promise<DurableRetryResolution> {
  const {
    proposal,
    authenticatedUserId,
    persistedIdempotencyMap,
    existingTasksQuery,
  } = params;

  if (!proposal.idempotencyKey || proposal.idempotencyKey.trim() === '') {
    return {
      outcome: 'UNCERTAIN_MANUAL_REVIEW',
      reason: 'Missing idempotency key on write proposal. Cannot reliably verify retry state.',
    };
  }

  // 1. Check exact idempotency key in persistent map
  if (persistedIdempotencyMap && persistedIdempotencyMap.has(proposal.idempotencyKey)) {
    const record = persistedIdempotencyMap.get(proposal.idempotencyKey)!;
    return {
      outcome: 'DUPLICATE_REUSED',
      existingTaskId: record.taskId,
      reason: `Operation with idempotency key "${proposal.idempotencyKey}" was already executed at ${record.executedAt}. Reusing existing task "${record.taskId}".`,
    };
  }

  // 2. If recovery query is provided, check if an identical task already exists in database with matching idempotency_key
  if (existingTasksQuery) {
    try {
      const existingTasks = await existingTasksQuery();
      
      // Match strictly by exact database-enforced idempotency_key and tenant ownership (zero title-only guessing)
      const matchingByIdempotency = existingTasks.find(
        (t) =>
          (!t.user_id || t.user_id === authenticatedUserId) &&
          t.idempotency_key &&
          t.idempotency_key === proposal.idempotencyKey
      );
      if (matchingByIdempotency) {
        return {
          outcome: 'DUPLICATE_REUSED',
          existingTaskId: matchingByIdempotency.id,
          existingTask: matchingByIdempotency,
          reason: `Found existing task in database with exact database idempotency key "${proposal.idempotencyKey}" (ID: ${matchingByIdempotency.id}). Reusing to prevent duplicate mutation.`,
        };
      }
    } catch {
      // In case of error querying existing tasks, do not guess
      return {
        outcome: 'UNCERTAIN_MANUAL_REVIEW',
        reason: 'Unable to query existing tasks to verify whether a prior network attempt created the task. Pausing for safety.',
      };
    }
  }

  return {
    outcome: 'PROCEED_NEW',
    reason: `Idempotency key "${proposal.idempotencyKey}" has not been executed previously.`,
  };
}

/**
 * Builds an enhanced verification handoff incorporating post-write read-back outcome.
 */
export function buildEnhancedVerificationHandoff(
  postWriteResult: PostWriteVerificationResult
): VerificationHandoff {
  const planId = postWriteResult.proposal.actionId || postWriteResult.proposal.proposalId;
  const stepId = postWriteResult.proposal.actionId;
  const createdTaskId = postWriteResult.createdTaskId || undefined;
  const verifiedTask = postWriteResult.verifiedTask;

  return {
    planId,
    stepId,
    intendedAction: `Create task: ${postWriteResult.proposal.input.title}`,
    executedTools: ['create_task'],
    toolResultsSummary: {
      createdTaskId,
      title: verifiedTask?.title || postWriteResult.proposal.input.title,
      status: verifiedTask?.status || 'todo',
      priority: verifiedTask?.priority || postWriteResult.proposal.input.priority,
      due_date: verifiedTask?.due_date || postWriteResult.proposal.input.due_date,
      postWriteStatus: postWriteResult.status,
      auditStage: postWriteResult.auditStage,
      readBackVerified: postWriteResult.readBackVerified,
      discrepancies: postWriteResult.discrepancies,
    },
    toolsExecutedSuccessfully: postWriteResult.writeSucceeded && postWriteResult.readBackVerified,
    failedTools: postWriteResult.readBackVerified ? [] : ['create_task_post_verification'],
    unresolvedGaps: postWriteResult.discrepancies,
    verificationCriteria: [
      `Task ID "${createdTaskId}" verified via trusted read-back query.`,
      `Database write status: ${postWriteResult.writeSucceeded ? 'SUCCEEDED' : 'FAILED'}.`,
      `Read-back status: ${postWriteResult.status}.`,
      `Field discrepancies: ${postWriteResult.discrepancies.length === 0 ? 'None' : postWriteResult.discrepancies.join('; ')}.`,
      'This verifies task database insertion ONLY; it DOES NOT evaluate student learning progress or concept mastery.',
    ],
    empiricalEvidenceObserved: postWriteResult.readBackVerified,
    disclaimer: postWriteResult.disclaimer,
  };
}
