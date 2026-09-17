/**
 * Phase 4D: Controlled Plan Execution Engine for the SINGLE Learning Orchestrator.
 * 
 * Provides:
 * - Safe, deterministic execution of PlanSteps requiring ONLY registered READ_ONLY tools.
 * - Comprehensive 12-point execution eligibility validation before invoking any tool.
 * - Direct reuse of Phase 3 Tool Registry and Read-Only Tool Executor without code duplication.
 * - Strict tenant isolation validating authenticated student IDs against plan ownership.
 * - Sanitized working memory updates preventing persistence of tokens, secrets, or raw dumps.
 * - Clean Phase 4E verification handoff separating tool execution from learning outcomes.
 * - Enforceable side-effect guarantees (zero task, calendar, or database mutations).
 */

import {
  LearningPlan,
  PlanStep,
  PlanStepStatus,
} from './planning-types';
import {
  AgentToolRegistry,
  agentToolRegistry,
} from './tool-registry';
import {
  executeReadOnlyTool,
  ToolExecutionResult,
} from './tool-executor';
import { sanitizeWorkingMemory } from './run-persistence';
import {
  AgentApprovalRequest,
  AgentSafetyLimits,
  AgentExecutionCounters,
  AgentRunState,
} from './state-types';
import { ExecutingHandlerResult } from './orchestrator-types';
import {
  ExecutePlanStepInput,
  PlanStepExecutionResult,
  PlanStepExecutionStatus,
  StepExecutionEligibilityResult,
  VerificationHandoff,
  StepSideEffectGuarantees,
} from './plan-execution-types';

/**
 * Default safety limits if not supplied in runtime context.
 */
const DEFAULT_SAFETY_LIMITS: AgentSafetyLimits = {
  maxToolIterations: 10,
  maxReplans: 3,
  maxConsecutiveFailures: 2,
};

/**
 * Default execution counters if not supplied in runtime context.
 */
const DEFAULT_EXECUTION_COUNTERS: AgentExecutionCounters = {
  toolIterations: 0,
  replans: 0,
  consecutiveFailures: 0,
  totalExecutedActions: 0,
};

/**
 * Generates a unique execution identifier for a plan step run.
 */
function generateStepExecutionId(planId: string, stepId: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `exec_${stepId}_${ts}_${rand}`;
}

/**
 * Validates all 12 safety, tenant, dependency, registry, and permission conditions
 * before permitting a PlanStep to execute.
 */
export function validateStepExecutionEligibility(
  input: ExecutePlanStepInput
): StepExecutionEligibilityResult {
  const { plan, stepId, authenticatedUserId } = input;
  const registry = input.registry || agentToolRegistry;
  const limits = input.safetyLimits || DEFAULT_SAFETY_LIMITS;
  const counters = input.counters || DEFAULT_EXECUTION_COUNTERS;
  const blockingReasons: string[] = [];

  // 1. Authenticated Student Context / Tenant Isolation
  if (!authenticatedUserId || typeof authenticatedUserId !== 'string' || authenticatedUserId.trim() === '') {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons: ['Tenant isolation failure: Missing or invalid authenticated user ID.'],
      plan,
    };
  }

  if (authenticatedUserId !== plan.userId) {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons: [
        `Tenant isolation failure: Authenticated user "${authenticatedUserId}" does not match plan owner "${plan.userId}".`,
      ],
      plan,
    };
  }

  // 2. Plan Execution Status Check
  if (plan.status !== 'READY' && plan.status !== 'EXECUTING') {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons: [
        `Parent plan is in "${plan.status}" status (execution requires READY or EXECUTING).`,
      ],
      plan,
    };
  }

  // 3. Step Existence Check
  const step = plan.steps.find((s) => s.id === stepId);
  if (!step) {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons: [`Target step "${stepId}" does not exist in plan "${plan.planId}".`],
      plan,
    };
  }

  // 4. Step Already Completed Check (Idempotency)
  if (step.status === 'COMPLETED') {
    return {
      isEligible: false,
      status: 'SKIPPED',
      blockingReasons: [`Step "${stepId}" is already COMPLETED and will not be re-executed.`],
      step,
      plan,
    };
  }

  // 5. Step Superseded or Skipped Check
  if (step.status === 'SUPERSEDED' || step.status === 'SKIPPED') {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons: [`Step "${stepId}" has status "${step.status}" and cannot be executed.`],
      step,
      plan,
    };
  }

  // 6. Predecessor Dependencies Check
  if (Array.isArray(step.dependencies) && step.dependencies.length > 0) {
    for (const depId of step.dependencies) {
      const depStep = plan.steps.find((s) => s.id === depId);
      if (!depStep) {
        blockingReasons.push(
          `Predecessor dependency "${depId}" does not exist in the plan.`
        );
      } else if (depStep.status !== 'COMPLETED') {
        blockingReasons.push(
          `Predecessor dependency "${depId}" is not satisfied (current status: "${depStep.status}").`
        );
      }
    }
  }

  // 7. Execution Limits Check (Safety Counters)
  if (counters.toolIterations >= limits.maxToolIterations) {
    blockingReasons.push(
      `Execution safety limit reached: toolIterations (${counters.toolIterations}) >= maxToolIterations (${limits.maxToolIterations}).`
    );
  }

  if (counters.consecutiveFailures >= limits.maxConsecutiveFailures) {
    blockingReasons.push(
      `Execution halted: consecutiveFailures (${counters.consecutiveFailures}) >= maxConsecutiveFailures (${limits.maxConsecutiveFailures}).`
    );
  }

  // 8. Tool Registry & Read-Only Permission Checks
  if (Array.isArray(step.requiredTools) && step.requiredTools.length > 0) {
    for (const toolName of step.requiredTools) {
      const toolDef = registry.getTool(toolName);
      if (!toolDef) {
        blockingReasons.push(
          `Required tool "${toolName}" is not registered in the Phase 3 Tool Registry.`
        );
      } else {
        if (toolDef.operationType !== 'READ') {
          blockingReasons.push(
            `Required tool "${toolName}" has operationType "${toolDef.operationType}". Only READ tools are permitted in Phase 4D.`
          );
        }
        if (toolDef.permissionLevel !== 'READ_ONLY') {
          blockingReasons.push(
            `Required tool "${toolName}" has permissionLevel "${toolDef.permissionLevel}". Only READ_ONLY tools are permitted in Phase 4D.`
          );
        }
      }
    }
  }

  // 9. Input Schema Validation
  if (step.actionPayload && Array.isArray(step.requiredTools)) {
    for (const toolName of step.requiredTools) {
      if (registry.hasTool(toolName)) {
        const valRes = registry.validateToolInput(toolName, step.actionPayload);
        if (!valRes.isValid) {
          blockingReasons.push(
            `Invalid input for tool "${toolName}": ${valRes.errors.map((e) => `${e.parameter}: ${e.message}`).join('; ')}`
          );
        }
      }
    }
  }

  // If any blocking reason was identified, return BLOCKED
  if (blockingReasons.length > 0) {
    return {
      isEligible: false,
      status: 'BLOCKED',
      blockingReasons,
      step,
      plan,
    };
  }

  // 10. Human Approval Requirement Check
  if (step.requiresApproval) {
    const approvalRequest: AgentApprovalRequest = {
      id: `appr_${step.id}_${Date.now()}`,
      actionType: 'PLAN_STEP_EXECUTION',
      description: `Approval required to execute step "${step.title}" (${step.id})`,
      riskLevel: step.approvalRiskLevel || 'MEDIUM',
      payload: {
        planId: plan.planId,
        stepId: step.id,
        actionPayload: step.actionPayload || {},
        requiredTools: step.requiredTools || [],
      },
      requestedAt: new Date().toISOString(),
      decision: 'PENDING',
    };

    return {
      isEligible: false,
      status: 'REQUIRES_APPROVAL',
      blockingReasons: ['Step execution paused pending explicit user approval.'],
      approvalRequest,
      step,
      plan,
    };
  }

  // All 12 checks passed: Step is eligible for execution
  return {
    isEligible: true,
    status: 'ELIGIBLE',
    blockingReasons: [],
    step,
    plan,
  };
}

/**
 * Summarizes tool execution results safely without dumping massive database payloads.
 */
function summarizeToolResults(results: ToolExecutionResult[]): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const r of results) {
    summary[r.toolName] = {
      status: r.status,
      durationMs: r.durationMs,
      hasOutput: r.output !== undefined && r.output !== null,
      error: r.error ? { code: r.error.code, message: r.error.message } : undefined,
    };
  }
  return summary;
}

/**
 * Executes a single PlanStep in a controlled manner using registered READ_ONLY tools.
 */
export async function executePlanStep(
  input: ExecutePlanStepInput
): Promise<PlanStepExecutionResult> {
  const startedAt = input.timestamp || new Date().toISOString();
  const startTime = Date.now();
  const planId = input.plan.planId;
  const stepId = input.stepId;
  const executionId = generateStepExecutionId(planId, stepId);
  const registry = input.registry || agentToolRegistry;
  const timeoutMs = input.timeoutMs || 10000;

  const sideEffectGuarantees: StepSideEffectGuarantees = {
    isTaskModified: false,
    isCalendarModified: false,
    isDatabaseModified: false,
    isExternalSideEffectTriggered: false,
    auditDescription:
      'Controlled read-only execution completed. Zero tasks, calendar events, or database records were modified.',
  };

  // 1. Eligibility Check
  const eligibility = validateStepExecutionEligibility(input);
  if (!eligibility.isEligible || !eligibility.step) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    if (eligibility.status === 'SKIPPED') {
      return {
        executionId,
        planId,
        stepId,
        status: 'SKIPPED',
        startedAt,
        completedAt,
        durationMs,
        selectedTools: [],
        toolResults: [],
        workingMemoryUpdate: {
          lastStepExecution: {
            stepId,
            status: 'SKIPPED',
            reason: eligibility.blockingReasons[0] || 'Step already completed.',
          },
        },
        blockingReason: eligibility.blockingReasons[0],
        sideEffectGuarantees,
      };
    }

    if (eligibility.status === 'REQUIRES_APPROVAL') {
      return {
        executionId,
        planId,
        stepId,
        status: 'REQUIRES_APPROVAL',
        startedAt,
        completedAt,
        durationMs,
        selectedTools: eligibility.step?.requiredTools || [],
        toolResults: [],
        approvalRequest: eligibility.approvalRequest,
        workingMemoryUpdate: {
          lastStepExecution: {
            stepId,
            status: 'REQUIRES_APPROVAL',
            approvalRequestId: eligibility.approvalRequest?.id,
          },
        },
        blockingReason: 'Step requires explicit user approval.',
        sideEffectGuarantees,
      };
    }

    return {
      executionId,
      planId,
      stepId,
      status: 'BLOCKED',
      startedAt,
      completedAt,
      durationMs,
      selectedTools: eligibility.step?.requiredTools || [],
      toolResults: [],
      error: {
        code: 'ERR_STEP_EXECUTION_BLOCKED',
        message: eligibility.blockingReasons.join('; '),
      },
      blockingReason: eligibility.blockingReasons.join('; '),
      workingMemoryUpdate: {
        lastStepExecution: {
          stepId,
          status: 'BLOCKED',
          blockingReasons: eligibility.blockingReasons,
        },
      },
      sideEffectGuarantees,
    };
  }

  const step = eligibility.step;
  const toolsToExecute = Array.isArray(step.requiredTools) ? [...step.requiredTools] : [];
  const toolResults: ToolExecutionResult[] = [];
  let stepStatus: PlanStepExecutionStatus = 'SUCCESS';
  let stepError: { code: string; message: string; details?: unknown } | undefined;

  // 2. Execute Required READ_ONLY Tools Sequentially in Deterministic Order
  for (const toolName of toolsToExecute) {
    const toolPayload = step.actionPayload || {};
    const toolRes = await executeReadOnlyTool(toolName, toolPayload, {
      registry,
      timeoutMs,
      customExecutors: input.customExecutors,
    });

    toolResults.push(toolRes);

    if (toolRes.status !== 'SUCCESS') {
      stepStatus = 'FAILED';
      stepError = {
        code: toolRes.error?.code || 'ERR_TOOL_EXECUTION_FAILED',
        message: `Tool "${toolName}" failed: ${toolRes.error?.message || 'Unknown error'}`,
        details: toolRes.error?.details,
      };
      // Halt execution of subsequent tools in this step upon failure
      break;
    }
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  // 3. Synthesize Verification Handoff
  const failedTools = toolResults.filter((r) => r.status !== 'SUCCESS').map((r) => r.toolName);
  const verificationHandoff: VerificationHandoff = {
    planId,
    stepId,
    intendedAction: step.description,
    executedTools: toolResults.map((r) => r.toolName),
    toolResultsSummary: summarizeToolResults(toolResults),
    toolsExecutedSuccessfully: stepStatus === 'SUCCESS',
    failedTools,
    unresolvedGaps: [],
    verificationCriteria: [...step.verificationCriteria],
    empiricalEvidenceObserved: toolResults.some(
      (r) => r.status === 'SUCCESS' && r.output !== null && r.output !== undefined
    ),
    disclaimer:
      'Execution of read-only tools captures telemetry but does NOT prove student skill acquisition or task completion. Verification must be performed independently.',
  };

  // 4. Update Step and Plan Status
  const updatedSteps: PlanStep[] = input.plan.steps.map((s) => {
    if (s.id !== stepId) return s;
    const newStepStatus: PlanStepStatus = stepStatus === 'SUCCESS' ? 'COMPLETED' : 'FAILED';
    return {
      ...s,
      status: newStepStatus,
      failureReason: stepError?.message ?? null,
      output: sanitizeWorkingMemory(summarizeToolResults(toolResults)),
      updatedAt: completedAt,
    };
  });

  const updatedPlan: LearningPlan = {
    ...input.plan,
    steps: updatedSteps,
    updatedAt: completedAt,
  };

  // 5. Build Sanitized Working Memory Payload
  const workingMemoryUpdate = {
    lastStepExecution: {
      executionId,
      stepId,
      status: stepStatus,
      executedTools: toolResults.map((r) => r.toolName),
      durationMs,
      verificationHandoff,
      completedAt,
    },
    plan: updatedPlan,
  };

  return {
    executionId,
    planId,
    stepId,
    status: stepStatus,
    startedAt,
    completedAt,
    durationMs,
    selectedTools: toolsToExecute,
    toolResults,
    verificationHandoff,
    workingMemoryUpdate,
    error: stepError,
    updatedPlan,
    sideEffectGuarantees,
  };
}

/**
 * Creates an Orchestrator-compatible onExecuting handler linking the Learning Orchestrator
 * loop directly to controlled plan step execution.
 */
export function createPlanExecutingHandler(
  options: {
    authenticatedUserId: string;
    registry?: AgentToolRegistry;
    safetyLimits?: AgentSafetyLimits;
    customExecutors?: Record<string, (input: Record<string, unknown>) => Promise<unknown>>;
    timeoutMs?: number;
  }
): (state: AgentRunState) => Promise<ExecutingHandlerResult> {
  return async (state: AgentRunState): Promise<ExecutingHandlerResult> => {
    // 1. Resolve active plan from working memory or evidence context
    const plan = state.workingMemory.plan as LearningPlan | undefined;
    if (!plan) {
      return {
        needsReplan: false,
        reason: 'Execution skipped: No active LearningPlan present in working memory.',
        workingMemory: {
          executionSkippedReason: 'NO_ACTIVE_PLAN',
        },
      };
    }

    // 2. Identify the next step to execute (first non-completed step)
    const nextStep = plan.steps.find(
      (s) => s.status !== 'COMPLETED' && s.status !== 'SUPERSEDED' && s.status !== 'SKIPPED'
    );

    if (!nextStep) {
      return {
        executionOutput: { message: 'All plan steps already completed.' },
        reason: 'All plan steps are already completed.',
        workingMemory: { allStepsCompleted: true },
      };
    }

    // 3. Execute Step
    const execResult = await executePlanStep({
      plan,
      stepId: nextStep.id,
      authenticatedUserId: options.authenticatedUserId,
      registry: options.registry,
      safetyLimits: options.safetyLimits || state.safetyLimits,
      counters: state.counters,
      customExecutors: options.customExecutors,
      timeoutMs: options.timeoutMs,
    });

    if (execResult.status === 'REQUIRES_APPROVAL' && execResult.approvalRequest) {
      return {
        requiresApproval: true,
        approvalRequest: execResult.approvalRequest,
        workingMemory: execResult.workingMemoryUpdate,
        reason: `Step "${nextStep.title}" requires human approval before execution.`,
      };
    }

    if (execResult.status === 'FAILED') {
      return {
        needsReplan: true,
        reason: execResult.error?.message || `Execution of step "${nextStep.id}" failed.`,
        workingMemory: execResult.workingMemoryUpdate,
      };
    }

    if (execResult.status === 'BLOCKED') {
      return {
        needsReplan: true,
        reason: execResult.blockingReason || `Execution of step "${nextStep.id}" is blocked.`,
        workingMemory: execResult.workingMemoryUpdate,
      };
    }

    return {
      executionOutput: execResult,
      reason: `Executed step "${nextStep.id}" (${execResult.selectedTools.length} tool(s) run).`,
      workingMemory: execResult.workingMemoryUpdate,
    };
  };
}
