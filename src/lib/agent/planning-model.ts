/**
 * Phase 4A: Planning Model Implementation for the Agentic Learning OS.
 * 
 * Provides deterministic plan construction, schema validation, Directed Acyclic Graph (DAG)
 * dependency validation, cycle detection, lifecycle status transition management, plan supersession,
 * and JSON serialization/deserialization for the SINGLE Learning Orchestrator Agent.
 */

import {
  LearningPlan,
  PlanStep,
  PlanStatus,
  PlanStepStatus,
  PlanPriority,
  CreatePlanInput,
  PlanValidationResult,
  PlanValidationError,
  DependencyValidationResult,
  PlanStatusTransitionInput,
  PlanStatusTransitionResult,
  PlanSupersedeInput,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import { StudentCorroborationAuditResult, CorroborationResult } from './types';

/**
 * Valid canonical statuses for runtime validation.
 */
export const VALID_PLAN_STATUSES: readonly PlanStatus[] = [
  'DRAFT',
  'VALIDATING',
  'READY',
  'EXECUTING',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
  'SUPERSEDED',
] as const;

export const VALID_STEP_STATUSES: readonly PlanStepStatus[] = [
  'PENDING',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
  'SUPERSEDED',
] as const;

export const VALID_PRIORITIES: readonly PlanPriority[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT',
] as const;

/**
 * Allowed status transitions for the Learning Plan lifecycle.
 */
export const ALLOWED_PLAN_STATUS_TRANSITIONS: Record<PlanStatus, readonly PlanStatus[]> = {
  DRAFT: ['VALIDATING', 'SUPERSEDED', 'FAILED'],
  VALIDATING: ['READY', 'BLOCKED', 'FAILED', 'DRAFT', 'SUPERSEDED'],
  READY: ['EXECUTING', 'BLOCKED', 'FAILED', 'SUPERSEDED'],
  EXECUTING: ['BLOCKED', 'COMPLETED', 'FAILED', 'SUPERSEDED'],
  BLOCKED: ['READY', 'EXECUTING', 'FAILED', 'SUPERSEDED'],
  COMPLETED: ['SUPERSEDED'],
  FAILED: ['READY', 'SUPERSEDED'],
  SUPERSEDED: [], // Terminal state
};

/**
 * Allowed status transitions for individual plan steps.
 */
export const ALLOWED_STEP_STATUS_TRANSITIONS: Record<PlanStepStatus, readonly PlanStepStatus[]> = {
  PENDING: ['READY', 'BLOCKED', 'SKIPPED', 'SUPERSEDED', 'FAILED'],
  READY: ['IN_PROGRESS', 'BLOCKED', 'SKIPPED', 'SUPERSEDED', 'FAILED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED', 'BLOCKED', 'SKIPPED', 'SUPERSEDED'],
  BLOCKED: ['READY', 'PENDING', 'FAILED', 'SKIPPED', 'SUPERSEDED'],
  COMPLETED: ['SUPERSEDED'],
  FAILED: ['PENDING', 'READY', 'SUPERSEDED'],
  SKIPPED: ['SUPERSEDED'],
  SUPERSEDED: [], // Terminal state
};

/**
 * Validates whether a proposed plan status transition is allowed.
 */
export function isValidPlanStatusTransition(fromStatus: PlanStatus, toStatus: PlanStatus): boolean {
  if (fromStatus === toStatus) return true;
  const allowed = ALLOWED_PLAN_STATUS_TRANSITIONS[fromStatus];
  return allowed ? allowed.includes(toStatus) : false;
}

/**
 * Validates step dependencies using Directed Acyclic Graph (DAG) cycle detection
 * and missing dependency verification.
 */
export function validatePlanDependencies(steps: PlanStep[]): DependencyValidationResult {
  const stepIds = new Set<string>();
  const duplicateIds = new Set<string>();
  const selfDependencies: string[] = [];
  const missingDependencies: Array<{ stepId: string; missingDependencyId: string }> = [];
  const errors: string[] = [];

  // 1. Index all step IDs and detect duplicate IDs
  for (const step of steps) {
    if (stepIds.has(step.id)) {
      duplicateIds.add(step.id);
    }
    stepIds.add(step.id);
  }

  if (duplicateIds.size > 0) {
    for (const dup of duplicateIds) {
      errors.push(`Duplicate step ID found in plan: "${dup}". Step IDs must be unique.`);
    }
  }

  // 2. Validate existence of referenced dependencies and detect self-dependencies
  const adjList = new Map<string, string[]>();

  for (const step of steps) {
    const deps = Array.isArray(step.dependencies) ? step.dependencies : [];
    adjList.set(step.id, deps);

    for (const depId of deps) {
      if (depId === step.id) {
        selfDependencies.push(step.id);
        errors.push(`Step "${step.id}" cannot depend on itself (self-dependency detected).`);
      } else if (!stepIds.has(depId)) {
        missingDependencies.push({ stepId: step.id, missingDependencyId: depId });
        errors.push(
          `Step "${step.id}" references missing dependency "${depId}" which does not exist in the plan.`
        );
      }
    }
  }

  // 3. Cycle Detection via DFS (State: 0 = unvisited, 1 = visiting/in recursion stack, 2 = visited)
  const visitState = new Map<string, number>();
  const parentTrace = new Map<string, string>();
  const detectedCycles: string[][] = [];

  for (const stepId of stepIds) {
    visitState.set(stepId, 0);
  }

  function dfsDetectCycle(currentId: string, path: string[]) {
    visitState.set(currentId, 1); // Mark as visiting

    const neighbors = adjList.get(currentId) || [];
    for (const nextId of neighbors) {
      if (!stepIds.has(nextId) || nextId === currentId) {
        continue; // Handled in missing/self check
      }

      const state = visitState.get(nextId) ?? 0;
      if (state === 1) {
        // Cycle detected: extract cycle path
        const cycleStartIndex = path.indexOf(nextId);
        if (cycleStartIndex !== -1) {
          const cycle = [...path.slice(cycleStartIndex), nextId];
          detectedCycles.push(cycle);
          errors.push(`Circular dependency detected: ${cycle.join(' -> ')}`);
        } else {
          detectedCycles.push([currentId, nextId, currentId]);
          errors.push(`Circular dependency detected between "${currentId}" and "${nextId}"`);
        }
      } else if (state === 0) {
        parentTrace.set(nextId, currentId);
        dfsDetectCycle(nextId, [...path, nextId]);
      }
    }

    visitState.set(currentId, 2); // Mark as visited
  }

  for (const stepId of stepIds) {
    if (visitState.get(stepId) === 0) {
      dfsDetectCycle(stepId, [stepId]);
    }
  }

  // 4. Compute Execution Tiers if no cycles and no missing dependencies exist
  let executionTiers: string[][] | undefined;
  const hasCycles = detectedCycles.length > 0;
  const isValid = !hasCycles && missingDependencies.length === 0 && selfDependencies.length === 0 && duplicateIds.size === 0;

  if (isValid) {
    executionTiers = computeExecutionTiers(steps);
  }

  return {
    isValid,
    hasCycles,
    cycles: detectedCycles,
    executionTiers,
    missingDependencies,
    selfDependencies,
    errors,
  };
}

/**
 * Computes topological execution tiers (steps in the same tier can execute in parallel).
 */
function computeExecutionTiers(steps: PlanStep[]): string[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const step of steps) {
    inDegree.set(step.id, step.dependencies.length);
    dependents.set(step.id, []);
  }

  for (const step of steps) {
    for (const depId of step.dependencies) {
      const list = dependents.get(depId);
      if (list) {
        list.push(step.id);
      }
    }
  }

  const tiers: string[][] = [];
  let currentTier: string[] = [];

  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) {
      currentTier.push(id);
    }
  }

  const processed = new Set<string>();

  while (currentTier.length > 0) {
    tiers.push(currentTier);
    const nextTier: string[] = [];

    for (const stepId of currentTier) {
      processed.add(stepId);
      const nextSteps = dependents.get(stepId) || [];
      for (const next of nextSteps) {
        const remaining = (inDegree.get(next) ?? 1) - 1;
        inDegree.set(next, remaining);
        if (remaining === 0 && !processed.has(next)) {
          nextTier.push(next);
        }
      }
    }

    currentTier = nextTier;
  }

  return tiers;
}

/**
 * Comprehensive structural, semantic, and dependency validation of a LearningPlan.
 */
export function validatePlan(input: unknown): PlanValidationResult {
  const errors: PlanValidationError[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== 'object') {
    return {
      isValid: false,
      errors: [{ code: 'ERR_INVALID_PLAN_TYPE', message: 'Plan must be a non-null object.' }],
    };
  }

  const raw = input as Record<string, unknown>;

  // 1. Validate top-level required identifiers
  if (!raw.planId || typeof raw.planId !== 'string' || raw.planId.trim() === '') {
    errors.push({
      code: 'ERR_MISSING_PLAN_ID',
      field: 'planId',
      message: 'Plan must have a non-empty string planId.',
    });
  }

  if (!raw.userId || typeof raw.userId !== 'string' || raw.userId.trim() === '') {
    errors.push({
      code: 'ERR_MISSING_USER_ID',
      field: 'userId',
      message: 'Plan must have a non-empty string userId.',
    });
  }

  if (!raw.goal || typeof raw.goal !== 'string' || raw.goal.trim() === '') {
    errors.push({
      code: 'ERR_MISSING_GOAL',
      field: 'goal',
      message: 'Plan must specify a clear, non-empty goal statement.',
    });
  }

  // 2. Validate Objectives
  if (!Array.isArray(raw.objectives) || raw.objectives.length === 0) {
    errors.push({
      code: 'ERR_MISSING_OBJECTIVES',
      field: 'objectives',
      message: 'Plan must contain at least one non-empty objective in an array.',
    });
  } else {
    for (let i = 0; i < raw.objectives.length; i++) {
      const obj = raw.objectives[i];
      if (typeof obj !== 'string' || obj.trim() === '') {
        errors.push({
          code: 'ERR_INVALID_OBJECTIVE',
          field: `objectives[${i}]`,
          message: `Objective at index ${i} must be a non-empty string.`,
        });
      }
    }
  }

  // 3. Validate Status and Priority Enums
  if (!raw.status || typeof raw.status !== 'string' || !VALID_PLAN_STATUSES.includes(raw.status as PlanStatus)) {
    errors.push({
      code: 'ERR_INVALID_PLAN_STATUS',
      field: 'status',
      message: `Status must be one of: ${VALID_PLAN_STATUSES.join(', ')}. Got: ${String(raw.status)}`,
    });
  }

  if (!raw.priority || typeof raw.priority !== 'string' || !VALID_PRIORITIES.includes(raw.priority as PlanPriority)) {
    errors.push({
      code: 'ERR_INVALID_PLAN_PRIORITY',
      field: 'priority',
      message: `Priority must be one of: ${VALID_PRIORITIES.join(', ')}. Got: ${String(raw.priority)}`,
    });
  }

  // 4. Validate Arrays (Constraints, SuccessCriteria, VerificationCriteria, Prerequisites)
  if (!Array.isArray(raw.constraints)) {
    errors.push({
      code: 'ERR_INVALID_CONSTRAINTS',
      field: 'constraints',
      message: 'Constraints must be an array of strings.',
    });
  }

  if (!Array.isArray(raw.successCriteria)) {
    errors.push({
      code: 'ERR_INVALID_SUCCESS_CRITERIA',
      field: 'successCriteria',
      message: 'SuccessCriteria must be an array of strings.',
    });
  }

  if (!Array.isArray(raw.verificationCriteria)) {
    errors.push({
      code: 'ERR_INVALID_VERIFICATION_CRITERIA',
      field: 'verificationCriteria',
      message: 'VerificationCriteria must be an array of strings.',
    });
  }

  if (!Array.isArray(raw.prerequisites)) {
    errors.push({
      code: 'ERR_INVALID_PREREQUISITES',
      field: 'prerequisites',
      message: 'Prerequisites must be an array of strings.',
    });
  }

  // 5. Validate Approval Requirement
  if (!raw.approvalRequirement || typeof raw.approvalRequirement !== 'object') {
    errors.push({
      code: 'ERR_MISSING_APPROVAL_REQUIREMENT',
      field: 'approvalRequirement',
      message: 'Plan must include an approvalRequirement object.',
    });
  } else {
    const appReq = raw.approvalRequirement as Record<string, unknown>;
    if (typeof appReq.requiresApproval !== 'boolean') {
      errors.push({
        code: 'ERR_INVALID_APPROVAL_REQUIREMENT',
        field: 'approvalRequirement.requiresApproval',
        message: 'approvalRequirement.requiresApproval must be a boolean.',
      });
    }
  }

  // 6. Validate Plan Steps
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push({
      code: 'ERR_MISSING_STEPS',
      field: 'steps',
      message: 'Plan must contain an array of at least one PlanStep.',
    });
  } else {
    const steps = raw.steps as PlanStep[];
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const stepIdx = `steps[${i}]`;

      if (!step || typeof step !== 'object') {
        errors.push({
          code: 'ERR_INVALID_STEP_STRUCTURE',
          field: stepIdx,
          message: `Step at index ${i} must be a valid object.`,
        });
        continue;
      }

      if (!step.id || typeof step.id !== 'string' || step.id.trim() === '') {
        errors.push({
          code: 'ERR_MISSING_STEP_ID',
          field: `${stepIdx}.id`,
          message: `Step at index ${i} is missing a required step ID.`,
        });
      }

      if (!step.title || typeof step.title !== 'string' || step.title.trim() === '') {
        errors.push({
          code: 'ERR_MISSING_STEP_TITLE',
          field: `${stepIdx}.title`,
          stepId: step.id,
          message: `Step "${step.id || i}" must have a non-empty title.`,
        });
      }

      if (!step.description || typeof step.description !== 'string' || step.description.trim() === '') {
        errors.push({
          code: 'ERR_MISSING_STEP_DESCRIPTION',
          field: `${stepIdx}.description`,
          stepId: step.id,
          message: `Step "${step.id || i}" must have a non-empty description.`,
        });
      }

      if (!step.rationale || typeof step.rationale !== 'string' || step.rationale.trim() === '') {
        errors.push({
          code: 'ERR_MISSING_STEP_RATIONALE',
          field: `${stepIdx}.rationale`,
          stepId: step.id,
          message: `Step "${step.id || i}" must have a pedagogical rationale explaining why it exists.`,
        });
      }

      if (!step.status || typeof step.status !== 'string' || !VALID_STEP_STATUSES.includes(step.status)) {
        errors.push({
          code: 'ERR_INVALID_STEP_STATUS',
          field: `${stepIdx}.status`,
          stepId: step.id,
          message: `Step "${step.id || i}" has invalid status "${String(step.status)}".`,
        });
      }

      if (!step.priority || typeof step.priority !== 'string' || !VALID_PRIORITIES.includes(step.priority)) {
        errors.push({
          code: 'ERR_INVALID_STEP_PRIORITY',
          field: `${stepIdx}.priority`,
          stepId: step.id,
          message: `Step "${step.id || i}" has invalid priority "${String(step.priority)}".`,
        });
      }

      if (!Array.isArray(step.dependencies)) {
        errors.push({
          code: 'ERR_INVALID_STEP_DEPENDENCIES',
          field: `${stepIdx}.dependencies`,
          stepId: step.id,
          message: `Step "${step.id || i}" dependencies must be an array of step ID strings.`,
        });
      }

      if (!Array.isArray(step.prerequisites)) {
        errors.push({
          code: 'ERR_INVALID_STEP_PREREQUISITES',
          field: `${stepIdx}.prerequisites`,
          stepId: step.id,
          message: `Step "${step.id || i}" prerequisites must be an array of strings.`,
        });
      }

      if (!Array.isArray(step.constraints)) {
        errors.push({
          code: 'ERR_INVALID_STEP_CONSTRAINTS',
          field: `${stepIdx}.constraints`,
          stepId: step.id,
          message: `Step "${step.id || i}" constraints must be an array of strings.`,
        });
      }

      if (!Array.isArray(step.successCriteria)) {
        errors.push({
          code: 'ERR_INVALID_STEP_SUCCESS_CRITERIA',
          field: `${stepIdx}.successCriteria`,
          stepId: step.id,
          message: `Step "${step.id || i}" successCriteria must be an array of strings.`,
        });
      }

      // CRITICAL REQUIREMENT: Strict verification criteria separation
      if (!Array.isArray(step.verificationCriteria)) {
        errors.push({
          code: 'ERR_INVALID_STEP_VERIFICATION_CRITERIA',
          field: `${stepIdx}.verificationCriteria`,
          stepId: step.id,
          message: `Step "${step.id || i}" verificationCriteria must be an array of strings separated from action.`,
        });
      }

      if (typeof step.requiresApproval !== 'boolean') {
        errors.push({
          code: 'ERR_INVALID_STEP_APPROVAL',
          field: `${stepIdx}.requiresApproval`,
          stepId: step.id,
          message: `Step "${step.id || i}" requiresApproval must be a boolean.`,
        });
      }

      // Effort validation: Ensure non-fabricated values if provided
      if (step.estimatedEffort !== undefined && step.estimatedEffort !== null) {
        if (typeof step.estimatedEffort !== 'object') {
          errors.push({
            code: 'ERR_INVALID_STEP_EFFORT',
            field: `${stepIdx}.estimatedEffort`,
            stepId: step.id,
            message: `Step "${step.id || i}" estimatedEffort must be an object or null/undefined.`,
          });
        }
      }
    }

    // 7. DAG Dependency Graph & Cycle Validation
    if (errors.length === 0) {
      const depResult = validatePlanDependencies(steps);
      if (!depResult.isValid) {
        for (const depErr of depResult.errors) {
          errors.push({
            code: depResult.hasCycles
              ? 'ERR_CIRCULAR_DEPENDENCY'
              : depResult.selfDependencies.length > 0
              ? 'ERR_SELF_DEPENDENCY'
              : 'ERR_INVALID_DEPENDENCY',
            field: 'steps.dependencies',
            message: depErr,
          });
        }
      }
    }
  }

  // 8. Timestamps & Version validation
  if (raw.version !== undefined && (typeof raw.version !== 'number' || raw.version < 1)) {
    errors.push({
      code: 'ERR_INVALID_PLAN_VERSION',
      field: 'version',
      message: 'Plan version must be a positive integer >= 1.',
    });
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    plan: isValid ? (raw as unknown as LearningPlan) : undefined,
    errors,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Normalizes decision-ready assessment input into DecisionReadyAssessmentSummary.
 */
function normalizeAssessmentContext(
  assessment?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null
): DecisionReadyAssessmentSummary | null {
  if (!assessment) return null;

  // Check if it's already a summary
  if ('overallScore' in assessment && 'auditId' in assessment) {
    return assessment as DecisionReadyAssessmentSummary;
  }

  // Check if it's full StudentCorroborationAuditResult
  if ('auditId' in assessment && 'skillsEvaluated' in assessment) {
    const audit = assessment as StudentCorroborationAuditResult;
    return {
      auditId: audit.auditId,
      generatedAt: audit.generatedAt,
      studentUserId: audit.studentUserId ?? null,
      overallScore: audit.summary.overallGroundTruthScore,
      verifiedSkillsCount: audit.skillsEvaluated.filter(
        (s) => s.confidenceLevel === 'HIGH' || s.confidenceLevel === 'MODERATE'
      ).length,
      unverifiedSkillsCount: audit.summary.unverifiedCount,
      contradictedSkillsCount: audit.summary.contradictedCount,
      warnings: audit.warnings || [],
      limitations: audit.limitations || [],
    };
  }

  // Handle CorroborationResult
  const corr = assessment as CorroborationResult;
  return {
    auditId: `audit_summary_${Date.now()}`,
    generatedAt: corr.evaluatedAt,
    overallScore: 0.5,
    verifiedSkillsCount: 0,
    unverifiedSkillsCount: corr.missingEvidenceSummary.unverifiedSkillCount,
    contradictedSkillsCount: corr.contradictionSummary.totalContradictions,
    warnings: [],
    limitations: corr.limitations || [],
  };
}

/**
 * Safely constructs a strongly-typed LearningPlan from raw input and validates all contracts.
 */
export function createLearningPlan(input: CreatePlanInput): PlanValidationResult {
  const now = input.createdAt || new Date().toISOString();
  const planId = input.planId || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  // Construct PlanSteps ensuring no fields are fabricated
  const normalizedSteps: PlanStep[] = input.steps.map((rawStep, index) => {
    const stepOrder = typeof rawStep.order === 'number' ? rawStep.order : index + 1;
    return {
      id: rawStep.id,
      planId: rawStep.planId || planId,
      order: stepOrder,
      title: rawStep.title,
      description: rawStep.description,
      rationale: rawStep.rationale,
      priority: rawStep.priority || input.priority || 'MEDIUM',
      status: rawStep.status || 'PENDING',
      estimatedEffort: rawStep.estimatedEffort ?? null,
      dependencies: Array.isArray(rawStep.dependencies) ? [...rawStep.dependencies] : [],
      prerequisites: Array.isArray(rawStep.prerequisites) ? [...rawStep.prerequisites] : [],
      targetSkill: rawStep.targetSkill ?? null,
      requiredTools: Array.isArray(rawStep.requiredTools) ? [...rawStep.requiredTools] : null,
      constraints: Array.isArray(rawStep.constraints) ? [...rawStep.constraints] : [],
      successCriteria: Array.isArray(rawStep.successCriteria) ? [...rawStep.successCriteria] : [],
      verificationCriteria: Array.isArray(rawStep.verificationCriteria) ? [...rawStep.verificationCriteria] : [],
      requiresApproval: Boolean(rawStep.requiresApproval),
      approvalRiskLevel: rawStep.approvalRiskLevel ?? null,
      actionPayload: rawStep.actionPayload ?? null,
      output: rawStep.output ?? null,
      failureReason: rawStep.failureReason ?? null,
      supersededByStepId: rawStep.supersededByStepId ?? null,
      createdAt: rawStep.createdAt || now,
      updatedAt: rawStep.updatedAt || now,
      metadata: rawStep.metadata ? { ...rawStep.metadata } : undefined,
    };
  });

  const plan: LearningPlan = {
    planId,
    userId: input.userId,
    goal: input.goal,
    objectives: Array.isArray(input.objectives) ? [...input.objectives] : [],
    steps: normalizedSteps,
    priority: input.priority || 'MEDIUM',
    status: input.status || 'DRAFT',
    constraints: Array.isArray(input.constraints) ? [...input.constraints] : [],
    successCriteria: Array.isArray(input.successCriteria) ? [...input.successCriteria] : [],
    verificationCriteria: Array.isArray(input.verificationCriteria) ? [...input.verificationCriteria] : [],
    approvalRequirement: {
      requiresApproval: Boolean(input.approvalRequirement?.requiresApproval),
      riskLevel: input.approvalRequirement?.riskLevel ?? null,
      reason: input.approvalRequirement?.reason ?? null,
      approvalRequestId: input.approvalRequirement?.approvalRequestId ?? null,
      isApproved: input.approvalRequirement?.isApproved ?? null,
      approvedAt: input.approvalRequirement?.approvedAt ?? null,
      approvedBy: input.approvalRequirement?.approvedBy ?? null,
    },
    triggerContext: input.triggerContext ?? null,
    decisionReadyAssessment: normalizeAssessmentContext(input.decisionReadyAssessment),
    targetSkill: input.targetSkill ?? null,
    estimatedEffort: input.estimatedEffort ?? null,
    prerequisites: Array.isArray(input.prerequisites) ? [...input.prerequisites] : [],
    supersededByPlanId: null,
    supersededAt: null,
    supersessionReason: null,
    version: input.version || 1,
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata ? { ...input.metadata } : undefined,
  };

  return validatePlan(plan);
}

/**
 * Executes a deterministic status transition on a LearningPlan.
 */
export function transitionPlanStatus(
  plan: LearningPlan,
  input: PlanStatusTransitionInput
): PlanStatusTransitionResult {
  const previousStatus = plan.status;
  const newStatus = input.targetStatus;

  if (!isValidPlanStatusTransition(previousStatus, newStatus)) {
    return {
      success: false,
      plan,
      previousStatus,
      newStatus,
      error: {
        code: 'ERR_INVALID_STATUS_TRANSITION',
        message: `Cannot transition plan status from "${previousStatus}" to "${newStatus}". Allowed targets: [${(
          ALLOWED_PLAN_STATUS_TRANSITIONS[previousStatus] || []
        ).join(', ')}]`,
      },
    };
  }

  const now = new Date().toISOString();
  const updatedPlan: LearningPlan = {
    ...plan,
    status: newStatus,
    updatedAt: now,
    metadata: {
      ...(plan.metadata || {}),
      ...(input.metadata || {}),
      lastStatusTransition: {
        from: previousStatus,
        to: newStatus,
        timestamp: now,
        reason: input.reason || 'Status transition requested.',
        updatedBy: input.updatedBy || 'SYSTEM',
      },
    },
  };

  return {
    success: true,
    plan: updatedPlan,
    previousStatus,
    newStatus,
  };
}

/**
 * Supersedes an existing plan during replanning without destroying original plan context.
 */
export function supersedePlan(
  plan: LearningPlan,
  input: PlanSupersedeInput
): LearningPlan {
  const now = input.supersededAt || new Date().toISOString();

  // Supersede active steps while preserving completed/failed/skipped states
  const updatedSteps: PlanStep[] = plan.steps.map((step) => {
    if (step.status === 'COMPLETED' || step.status === 'FAILED' || step.status === 'SKIPPED') {
      return step;
    }
    return {
      ...step,
      status: 'SUPERSEDED' as PlanStepStatus,
      updatedAt: now,
    };
  });

  return {
    ...plan,
    status: 'SUPERSEDED',
    supersededByPlanId: input.newPlanId,
    supersededAt: now,
    supersessionReason: input.reason,
    updatedAt: now,
    steps: updatedSteps,
  };
}

/**
 * Serializes a LearningPlan into a deterministic, persistence-ready JSON string.
 */
export function serializePlan(plan: LearningPlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Deserializes and validates a JSON string into a strongly-typed LearningPlan.
 */
export function deserializePlan(jsonString: string): PlanValidationResult {
  try {
    const parsed = JSON.parse(jsonString);
    return validatePlan(parsed);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      isValid: false,
      errors: [
        {
          code: 'ERR_JSON_PARSE_FAILED',
          message: `Failed to parse plan JSON: ${errMsg}`,
        },
      ],
    };
  }
}
