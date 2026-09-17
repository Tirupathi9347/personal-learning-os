/**
 * Phase 3E: Read-Only Tool Execution and Result Handling for the Agentic Learning OS.
 * 
 * Provides:
 * - Safe, isolated execution of registered READ_ONLY tools from a ToolSelectionPlan.
 * - Strict runtime enforcement of permissions (operationType === 'READ', permissionLevel === 'READ_ONLY').
 * - Runtime input schema validation via the Phase 3A/3C Tool Registry.
 * - Timeout gating and duplicate execution suppression per batch.
 * - Strongly-typed, sanitized ToolExecutionResult and ToolBatchExecutionResult contracts.
 * - Graceful failure isolation across independent read-only queries.
 * 
 * NOTE: This module executes ONLY registered READ_ONLY tools. No write operations or Gemini calls are performed.
 */

import { ToolAuditMetadata, ToolDefinition } from './tool-types';
import { AgentToolRegistry, agentToolRegistry } from './tool-registry';
import { ToolSelectionPlan, ToolSelectionItem } from './tool-selector';
import { sanitizeWorkingMemory } from './run-persistence';
import {
  executeGetStudentProfileTool,
  executeGetTasksTool,
  executeGetSkillsTool,
  executeGetProjectsTool,
  executeGetMistakesTool,
  executeGetTimeSessionsTool,
  executeGetGithubActivityTool,
  executeGetLeetcodeActivityTool,
} from './read-tools';

/**
 * Execution status for an attempted tool.
 */
export type ToolExecutionStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'BLOCKED';

/**
 * Strongly-typed execution output for a single tool run.
 */
export interface ToolExecutionResult<TOutput = unknown> {
  executionId: string;
  toolName: string;
  status: ToolExecutionStatus;
  startedAt: string; // ISO 8601
  completedAt: string; // ISO 8601
  durationMs: number;
  input?: Record<string, unknown>;
  output?: TOutput;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  auditMetadata: ToolAuditMetadata;
}

/**
 * Options configuring batch tool execution.
 */
export interface ToolBatchExecutionOptions {
  registry?: AgentToolRegistry;
  timeoutMs?: number; // Per-tool execution timeout in ms (default: 10,000)
  allowDuplicates?: boolean; // Whether duplicate tool calls in one batch are permitted (default: false)
  stopOnFirstFailure?: boolean; // Whether to halt batch on any failure (default: false)
  customExecutors?: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
}

/**
 * Aggregate execution report for a full ToolSelectionPlan.
 */
export interface ToolBatchExecutionResult {
  batchId: string;
  totalAttempted: number;
  successfulCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
  results: ToolExecutionResult[];
  resultsByTool: Record<string, ToolExecutionResult>;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  isFullySuccessful: boolean;
}

/**
 * Registry of canonical read-only tool executor functions.
 */
const DEFAULT_READ_ONLY_EXECUTORS: Record<
  string,
  (input: Record<string, unknown>) => Promise<unknown>
> = {
  get_student_profile: (input) => executeGetStudentProfileTool(input),
  get_tasks: (input) => executeGetTasksTool(input),
  get_skills: (input) => executeGetSkillsTool(input),
  get_projects: (input) => executeGetProjectsTool(input),
  get_mistakes: (input) => executeGetMistakesTool(input),
  get_time_sessions: (input) => executeGetTimeSessionsTool(input),
  get_github_activity: (input) => executeGetGithubActivityTool(input),
  get_leetcode_activity: (input) => executeGetLeetcodeActivityTool(input),
};

/**
 * Helper to generate unique execution IDs.
 */
function generateExecutionId(toolName: string): string {
  const timestamp = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `exec_${toolName}_${timestamp}_${rand}`;
}

/**
 * Safely executes a promise with a timeout deadline.
 */
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  toolName: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tool "${toolName}" timed out after ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Executes a single registered READ_ONLY tool by name with strict validation and permission guards.
 */
export async function executeReadOnlyTool<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput = unknown
>(
  toolName: string,
  input: TInput = {} as TInput,
  options: ToolBatchExecutionOptions = {}
): Promise<ToolExecutionResult<TOutput>> {
  const executionId = generateExecutionId(toolName);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const registry = options.registry || agentToolRegistry;
  const timeoutMs = options.timeoutMs || 10000;

  const toolDef = registry.getTool(toolName);

  // 1. Check Tool Registration
  if (!toolDef) {
    const completedAt = new Date().toISOString();
    return {
      executionId,
      toolName,
      status: 'BLOCKED',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      error: {
        code: 'ERR_UNREGISTERED_TOOL',
        message: `Cannot execute tool "${toolName}": Tool is not registered in Tool Registry.`,
      },
      auditMetadata: {
        targetEntity: 'unknown',
        affectsStudentData: false,
        isReversible: true,
        requiresUserConfirmation: false,
        auditDescription: 'Blocked attempt to execute unregistered tool',
      },
    };
  }

  const auditMetadata: ToolAuditMetadata = { ...toolDef.auditMetadata };

  // 2. Strict Permission & Mutation Guards (Enforce at runtime)
  if (toolDef.operationType !== 'READ' || toolDef.permissionLevel !== 'READ_ONLY') {
    const completedAt = new Date().toISOString();
    return {
      executionId,
      toolName,
      status: 'BLOCKED',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      error: {
        code: 'ERR_PERMISSION_DENIED',
        message: `Execution blocked: Tool "${toolName}" has permissionLevel "${toolDef.permissionLevel}" and operationType "${toolDef.operationType}". Only READ_ONLY tools can be executed.`,
      },
      auditMetadata,
    };
  }

  // 3. Runtime Input Schema Validation
  const inputValidation = registry.validateToolInput(toolName, input);
  if (!inputValidation.isValid) {
    const completedAt = new Date().toISOString();
    return {
      executionId,
      toolName,
      status: 'BLOCKED',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      error: {
        code: 'ERR_INVALID_TOOL_INPUT',
        message: `Input validation failed for tool "${toolName}": ${inputValidation.errors.map((e) => `${e.parameter}: ${e.message}`).join('; ')}`,
        details: inputValidation.errors,
      },
      auditMetadata,
    };
  }

  // 4. Resolve Executor
  const executor =
    options.customExecutors?.[toolName] || DEFAULT_READ_ONLY_EXECUTORS[toolName];

  if (!executor) {
    const completedAt = new Date().toISOString();
    return {
      executionId,
      toolName,
      status: 'FAILED',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      error: {
        code: 'ERR_EXECUTOR_NOT_FOUND',
        message: `No execution handler is mapped for registered tool "${toolName}".`,
      },
      auditMetadata,
    };
  }

  // 5. Execute with Timeout & Exception Isolation
  try {
    const rawOutput = await executeWithTimeout(
      executor(input),
      timeoutMs,
      toolName
    );

    const completedAt = new Date().toISOString();
    return {
      executionId,
      toolName,
      status: 'SUCCESS',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      output: rawOutput as TOutput,
      auditMetadata,
    };
  } catch (err: any) {
    const completedAt = new Date().toISOString();
    const isTimeout = err.message?.includes('timed out');
    return {
      executionId,
      toolName,
      status: 'FAILED',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      input: sanitizeWorkingMemory(input),
      error: {
        code: isTimeout ? 'ERR_TOOL_TIMEOUT' : 'ERR_TOOL_EXECUTION_FAILURE',
        message: err.message || `Unhandled error during execution of "${toolName}".`,
        details: err.stack,
      },
      auditMetadata,
    };
  }
}

/**
 * Executes an entire ToolSelectionPlan sequentially in priority order.
 * Isolates individual failures, suppresses accidental duplicate runs, and aggregates results.
 */
export async function executeToolSelectionPlan(
  plan: ToolSelectionPlan,
  options: ToolBatchExecutionOptions = {}
): Promise<ToolBatchExecutionResult> {
  const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  const results: ToolExecutionResult[] = [];
  const resultsByTool: Record<string, ToolExecutionResult> = {};
  const executedNames = new Set<string>();

  // Handle empty plan
  if (!plan.selectedTools || plan.selectedTools.length === 0) {
    const completedAt = new Date().toISOString();
    return {
      batchId,
      totalAttempted: 0,
      successfulCount: 0,
      failedCount: 0,
      blockedCount: 0,
      skippedCount: 0,
      results: [],
      resultsByTool: {},
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      isFullySuccessful: true,
    };
  }

  for (const item of plan.selectedTools) {
    // Duplicate execution protection within the same batch
    if (!options.allowDuplicates && executedNames.has(item.toolName)) {
      const skippedResult: ToolExecutionResult = {
        executionId: generateExecutionId(item.toolName),
        toolName: item.toolName,
        status: 'SKIPPED',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        input: sanitizeWorkingMemory(item.input || {}),
        error: {
          code: 'ERR_DUPLICATE_EXECUTION_SUPPRESSED',
          message: `Tool "${item.toolName}" was already executed in this batch. Duplicate execution suppressed.`,
        },
        auditMetadata: {
          targetEntity: 'unknown',
          affectsStudentData: false,
          isReversible: true,
          requiresUserConfirmation: false,
          auditDescription: 'Suppressed redundant duplicate tool execution',
        },
      };

      results.push(skippedResult);
      continue;
    }

    executedNames.add(item.toolName);

    const execResult = await executeReadOnlyTool(
      item.toolName,
      item.input || {},
      options
    );

    results.push(execResult);
    resultsByTool[item.toolName] = execResult;

    if (options.stopOnFirstFailure && (execResult.status === 'FAILED' || execResult.status === 'BLOCKED')) {
      break;
    }
  }

  const completedAt = new Date().toISOString();
  const successfulCount = results.filter((r) => r.status === 'SUCCESS').length;
  const failedCount = results.filter((r) => r.status === 'FAILED').length;
  const blockedCount = results.filter((r) => r.status === 'BLOCKED').length;
  const skippedCount = results.filter((r) => r.status === 'SKIPPED').length;

  return {
    batchId,
    totalAttempted: results.length,
    successfulCount,
    failedCount,
    blockedCount,
    skippedCount,
    results,
    resultsByTool,
    startedAt,
    completedAt,
    durationMs: Date.now() - startTime,
    isFullySuccessful: failedCount === 0 && blockedCount === 0,
  };
}
