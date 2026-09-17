/**
 * Phase 5A: Controlled Write-Action Safety Foundation
 * 
 * Implements deterministic safety, policy evaluation, schema enforcement,
 * tenant isolation, human approval integrity, side-effect declarations,
 * forbidden operation detection, and dry-run preview guarantees for the
 * SINGLE Learning Orchestrator Agent.
 * 
 * NOTE: Phase 5A establishes the SAFETY LAYER ONLY. No mutations or write tools are executed.
 */

import * as crypto from 'crypto';
import {
  ToolOperationType,
  ToolPermissionLevel,
  ToolRiskLevel,
  ToolInputSchema,
} from './tool-types';
import {
  SideEffectTarget,
  SideEffectDeclaration,
  WriteProposalStatus,
  WritePolicyDecision,
  WriteApprovalDecision,
  WriteActionApprovalRecord,
  WriteActionAuditMetadata,
  WriteActionProposal,
  DryRunPreviewResult,
  WriteSafetyEvaluationResult,
  EvaluateWriteSafetyInput,
} from './write-action-types';
import { sanitizeWorkingMemory } from './run-persistence';

export const VALID_SIDE_EFFECT_TARGETS: readonly SideEffectTarget[] = [
  'TASK',
  'CALENDAR',
  'SKILL',
  'PROJECT',
  'PROFILE',
  'JOURNAL',
  'NOTE',
  'DATABASE',
  'EXTERNAL_SYSTEM',
] as const;

export const VALID_PERMISSION_LEVELS: readonly ToolPermissionLevel[] = [
  'READ_ONLY',
  'LOW_RISK_WRITE',
  'APPROVAL_REQUIRED',
  'FORBIDDEN',
] as const;

export const VALID_RISK_LEVELS: readonly ToolRiskLevel[] = [
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
] as const;

/**
 * Patterns matching categorically forbidden tool names.
 */
const FORBIDDEN_TOOL_PATTERNS = [
  /^delete_all/i,
  /^truncate/i,
  /^drop_/i,
  /^wipe_/i,
  /^update_auth/i,
  /^disable_rls/i,
  /^export_private_keys/i,
  /^execute_shell/i,
  /^make_financial_transaction/i,
  /^bypass_permissions/i,
];

/**
 * Patterns matching forbidden keys or values in write action payloads.
 */
const FORBIDDEN_PAYLOAD_PATTERNS = /apiKey|password|secret|serviceRoleKey|privateKey|oauthToken|authTag|dropDatabase|evalScript/i;

/**
 * Deterministically sorts object keys for canonical serialization.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  const sortedKeys = Object.keys(obj as Record<string, unknown>).sort();
  const result: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    result[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return result;
}

/**
 * Computes a deterministic SHA-256 action fingerprint from the core mutation parameters.
 * Any material change in user, tool, input, affected resources, or risk level
 * will produce a completely different fingerprint, invalidating previous approvals.
 */
export function computeActionFingerprint(params: {
  userId: string;
  toolName: string;
  input: Record<string, unknown>;
  affectedResources: SideEffectDeclaration[];
  riskLevel: ToolRiskLevel;
}): string {
  const canonicalPayload = {
    userId: params.userId,
    toolName: params.toolName,
    input: sortObjectKeys(params.input),
    affectedResources: sortObjectKeys(params.affectedResources),
    riskLevel: params.riskLevel,
  };

  const jsonString = JSON.stringify(canonicalPayload);
  return crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * Generates a deterministic idempotency key for a proposed write action.
 */
export function generateIdempotencyKey(params: {
  userId: string;
  toolName: string;
  input: Record<string, unknown>;
  contextId?: string;
}): string {
  const canonical = {
    userId: params.userId,
    toolName: params.toolName,
    input: sortObjectKeys(params.input),
    contextId: params.contextId || 'default',
  };
  const hash = crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').substring(0, 24);
  return `idem_${params.toolName}_${hash}`;
}

/**
 * Validates a proposed write action input against a strict schema.
 */
export function validateWriteProposalInput(
  schema?: ToolInputSchema,
  input?: unknown
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      isValid: false,
      errors: ['Input payload must be a non-null object.'],
    };
  }

  const payload = input as Record<string, unknown>;

  if (!schema) {
    // If no schema is defined on the proposal, require non-empty object without forbidden keys
    if (Object.keys(payload).length === 0) {
      return { isValid: false, errors: ['Input payload cannot be empty.'] };
    }
    return { isValid: true, errors: [] };
  }

  // 1. Check required properties
  if (Array.isArray(schema.required)) {
    for (const reqKey of schema.required) {
      if (payload[reqKey] === undefined || payload[reqKey] === null || payload[reqKey] === '') {
        errors.push(`Required parameter "${reqKey}" is missing.`);
      }
    }
  }

  // 2. Check property types & bounds
  const definedProps = schema.properties || {};
  for (const [key, val] of Object.entries(payload)) {
    const propDef = definedProps[key];

    // Check unknown properties
    if (!propDef) {
      if (schema.additionalProperties !== true) {
        errors.push(`Unknown parameter "${key}" is not allowed.`);
      }
      continue;
    }

    if (val === undefined || val === null) {
      if (val === null && !propDef.nullable) {
        errors.push(`Parameter "${key}" cannot be null.`);
      }
      continue;
    }

    const valType = Array.isArray(val) ? 'array' : typeof val;
    if (valType !== propDef.type) {
      errors.push(`Parameter "${key}" must be of type "${propDef.type}", but received "${valType}".`);
      continue;
    }

    // String enum check
    if (propDef.type === 'string' && propDef.enum) {
      if (!propDef.enum.includes(val as string)) {
        errors.push(`Parameter "${key}" must be one of: [${propDef.enum.join(', ')}]. Received: "${String(val)}".`);
      }
    }

    // Number bounds check
    if (propDef.type === 'number' && typeof val === 'number') {
      if (propDef.minimum !== undefined && val < propDef.minimum) {
        errors.push(`Parameter "${key}" must be >= ${propDef.minimum}. Received: ${val}.`);
      }
      if (propDef.maximum !== undefined && val > propDef.maximum) {
        errors.push(`Parameter "${key}" must be <= ${propDef.maximum}. Received: ${val}.`);
      }
      if (propDef.integer && !Number.isInteger(val)) {
        errors.push(`Parameter "${key}" must be an integer.`);
      }
    }

    // Array items check
    if (propDef.type === 'array' && Array.isArray(val) && propDef.items) {
      for (let i = 0; i < val.length; i++) {
        const itemVal = val[i];
        const itemType = Array.isArray(itemVal) ? 'array' : typeof itemVal;
        if (itemType !== propDef.items.type) {
          errors.push(`Item at index ${i} in parameter "${key}" must be of type "${propDef.items.type}".`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates declared side-effect targets against valid canonical targets.
 */
export function validateSideEffectDeclarations(
  declarations?: SideEffectDeclaration[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(declarations) || declarations.length === 0) {
    return {
      isValid: false,
      errors: ['Write action must declare at least one explicit side-effect target.'],
    };
  }

  for (let i = 0; i < declarations.length; i++) {
    const decl = declarations[i];
    if (!decl || typeof decl !== 'object') {
      errors.push(`Side-effect declaration at index ${i} must be an object.`);
      continue;
    }

    if (!decl.target || !VALID_SIDE_EFFECT_TARGETS.includes(decl.target)) {
      errors.push(
        `Side-effect declaration at index ${i} has invalid target "${String(decl.target)}". Allowed: [${VALID_SIDE_EFFECT_TARGETS.join(', ')}].`
      );
    }

    if (!decl.resourceType || typeof decl.resourceType !== 'string' || decl.resourceType.trim() === '') {
      errors.push(`Side-effect declaration at index ${i} must have a non-empty resourceType string.`);
    }

    if (!decl.actionType || !['CREATE', 'UPDATE', 'DELETE', 'SYNC'].includes(decl.actionType)) {
      errors.push(
        `Side-effect declaration at index ${i} has invalid actionType "${String(decl.actionType)}". Allowed: [CREATE, UPDATE, DELETE, SYNC].`
      );
    }

    if (!decl.description || typeof decl.description !== 'string' || decl.description.trim() === '') {
      errors.push(`Side-effect declaration at index ${i} must have a non-empty description.`);
    }

    if (typeof decl.isReversible !== 'boolean') {
      errors.push(`Side-effect declaration at index ${i} isReversible must be a boolean.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Inspects a proposal for forbidden operations, security violations, or sensitive key tampering.
 */
export function checkForForbiddenAction(
  proposal: WriteActionProposal
): { isForbidden: boolean; reason?: string } {
  // 1. Check declared permission level
  if (proposal.permissionLevel === 'FORBIDDEN') {
    return {
      isForbidden: true,
      reason: 'Proposal is explicitly declared with FORBIDDEN permission level.',
    };
  }

  // 2. Check forbidden tool name patterns
  for (const pat of FORBIDDEN_TOOL_PATTERNS) {
    if (pat.test(proposal.toolName)) {
      return {
        isForbidden: true,
        reason: `Tool "${proposal.toolName}" matches prohibited destructive/security tool pattern.`,
      };
    }
  }

  // 3. Check forbidden payload keys and values
  const inputStr = JSON.stringify(proposal.input);
  if (FORBIDDEN_PAYLOAD_PATTERNS.test(inputStr)) {
    return {
      isForbidden: true,
      reason: 'Write action input contains prohibited sensitive credential, authentication, or secret keys.',
    };
  }

  return { isForbidden: false };
}

/**
 * Validates human approval integrity and expiration.
 */
export function validateApprovalIntegrity(
  proposal: WriteActionProposal,
  approvalRecord?: WriteActionApprovalRecord | null,
  currentTimestamp: string = new Date().toISOString()
): { isValid: boolean; status: WriteApprovalDecision; error?: string } {
  if (!approvalRecord) {
    return {
      isValid: false,
      status: 'INVALID',
      error: 'No human approval record provided.',
    };
  }

  // 1. Tenant match on approval
  if (approvalRecord.userId !== proposal.userId) {
    return {
      isValid: false,
      status: 'INVALID',
      error: `Approval was granted by user "${approvalRecord.userId}", which does not match proposal user "${proposal.userId}".`,
    };
  }

  // 2. Proposal ID match
  if (approvalRecord.proposalId !== proposal.proposalId) {
    return {
      isValid: false,
      status: 'INVALID',
      error: `Approval is for proposal "${approvalRecord.proposalId}", but received proposal "${proposal.proposalId}".`,
    };
  }

  // 3. Cryptographic Fingerprint Verification (Material change check)
  const currentFingerprint = computeActionFingerprint({
    userId: proposal.userId,
    toolName: proposal.toolName,
    input: proposal.input,
    affectedResources: proposal.affectedResources,
    riskLevel: proposal.riskLevel,
  });

  if (approvalRecord.actionFingerprint !== currentFingerprint) {
    return {
      isValid: false,
      status: 'INVALID',
      error: 'Approval fingerprint mismatch: The proposed action was materially modified after human approval was granted.',
    };
  }

  // 4. Decision check
  if (approvalRecord.decision === 'REJECTED') {
    return {
      isValid: false,
      status: 'REJECTED',
      error: `Human approval was explicitly rejected: ${approvalRecord.decisionNotes || 'User rejected action'}.`,
    };
  }

  if (approvalRecord.decision !== 'APPROVED') {
    return {
      isValid: false,
      status: approvalRecord.decision,
      error: `Approval record status is "${approvalRecord.decision}".`,
    };
  }

  // 5. Expiration check
  if (approvalRecord.expiresAt && currentTimestamp > approvalRecord.expiresAt) {
    return {
      isValid: false,
      status: 'EXPIRED',
      error: `Human approval expired at ${approvalRecord.expiresAt}. Current time is ${currentTimestamp}.`,
    };
  }

  return {
    isValid: true,
    status: 'APPROVED',
  };
}

/**
 * Generates a pure dry-run / preview for a write action proposal with certified boundary guarantees.
 */
export function generateDryRunPreview(
  proposal: WriteActionProposal,
  validationErrors: string[]
): DryRunPreviewResult {
  const affectedEntities = proposal.affectedResources.map(
    (r) => `[${r.target}] ${r.resourceType} (${r.actionType}): ${r.description}`
  );

  const potentialMutations = proposal.affectedResources.map(
    (r) => `${r.actionType} ${r.resourceType}${r.resourceId ? ` (ID: ${r.resourceId})` : ''}`
  );

  const allReversible = proposal.affectedResources.every((r) => r.isReversible);
  const isExecutable = validationErrors.length === 0 && proposal.permissionLevel !== 'FORBIDDEN';

  const riskAssessment = `Assessed as ${proposal.riskLevel} risk (${proposal.permissionLevel}). ${
    proposal.approvalRequirement.requiresApproval ? 'Requires explicit human confirmation.' : 'Pre-authorized for automated staged execution.'
  }`;

  return {
    isDryRun: true,
    isExecutable,
    summary: `Dry-run preview for tool "${proposal.toolName}": ${proposal.expectedMutation}`,
    affectedEntities,
    potentialMutations,
    isReversible: allReversible,
    riskAssessment,
    requiresApproval: proposal.approvalRequirement.requiresApproval,
    guarantees: {
      isTaskModified: false,
      isCalendarModified: false,
      isDatabaseModified: false,
      isSkillModified: false,
      isExternalSideEffectTriggered: false,
      isDryRunGuaranteed: true,
    },
  };
}

/**
 * Core Deterministic Policy Evaluator for Write Action Proposals.
 * 
 * Enforces:
 * 1. Server-side tenant isolation
 * 2. Strict operation classification (operationType === 'WRITE')
 * 3. Permission & risk level validation
 * 4. Categorical forbidden operation rejection
 * 5. Side-effect target validation
 * 6. Input schema validation
 * 7. Idempotency identity checking & duplicate detection
 * 8. Approval requirement & approval integrity verification
 * 9. Dry-run preview generation (zero mutations)
 */
export function evaluateWriteSafetyPolicy<TInput extends Record<string, unknown> = Record<string, unknown>>(
  options: EvaluateWriteSafetyInput<TInput>
): WriteSafetyEvaluationResult {
  const {
    proposal,
    authenticatedUserId,
    approvalRecord = null,
    seenIdempotencyKeys = new Set<string>(),
    timestamp = new Date().toISOString(),
  } = options;

  const validationErrors: string[] = [];
  let decision: WritePolicyDecision = 'ALLOW';
  let requiresApproval = Boolean(proposal.approvalRequirement?.requiresApproval);
  let approvalStatus: WriteApprovalDecision | undefined = undefined;
  let idempotencyStatus: 'VALID' | 'DUPLICATE' | 'INVALID' = 'VALID';

  // 1. Tenant Isolation Validation
  if (!authenticatedUserId || authenticatedUserId.trim() === '') {
    validationErrors.push('Unauthenticated execution context: authenticatedUserId is missing.');
    decision = 'BLOCK';
  } else if (proposal.userId !== authenticatedUserId) {
    validationErrors.push(
      `Tenant isolation mismatch: Proposal userId "${proposal.userId}" does not match authenticated session userId "${authenticatedUserId}".`
    );
    decision = 'BLOCK';
  }

  // 2. Operation Type Validation
  if (proposal.operationType !== 'WRITE') {
    validationErrors.push(
      `Invalid operationType: Expected "WRITE" for write action proposal, but received "${proposal.operationType}".`
    );
    decision = 'BLOCK';
  }

  // 3. Permission Level & Risk Level Validation
  if (!VALID_PERMISSION_LEVELS.includes(proposal.permissionLevel)) {
    validationErrors.push(
      `Unknown permissionLevel "${String(proposal.permissionLevel)}". Allowed: [${VALID_PERMISSION_LEVELS.join(', ')}].`
    );
    decision = 'BLOCK';
  }

  if (!VALID_RISK_LEVELS.includes(proposal.riskLevel)) {
    validationErrors.push(
      `Unknown riskLevel "${String(proposal.riskLevel)}". Allowed: [${VALID_RISK_LEVELS.join(', ')}].`
    );
    decision = 'BLOCK';
  }

  // 4. Forbidden Action Check (Categorical rejection)
  const forbiddenCheck = checkForForbiddenAction(proposal);
  if (forbiddenCheck.isForbidden) {
    validationErrors.push(`FORBIDDEN ACTION: ${forbiddenCheck.reason}`);
    decision = 'FORBIDDEN';
  }

  // 5. Side-Effect Target Validation
  const sideEffectValidation = validateSideEffectDeclarations(proposal.affectedResources);
  if (!sideEffectValidation.isValid) {
    for (const err of sideEffectValidation.errors) {
      validationErrors.push(err);
    }
    if (decision !== 'FORBIDDEN') decision = 'BLOCK';
  }

  // 6. Schema Validation
  const schemaValidation = validateWriteProposalInput(proposal.inputSchema, proposal.input);
  if (!schemaValidation.isValid) {
    for (const err of schemaValidation.errors) {
      validationErrors.push(err);
    }
    if (decision !== 'FORBIDDEN') decision = 'BLOCK';
  }

  // 7. Idempotency Key Validation
  if (!proposal.idempotencyKey || typeof proposal.idempotencyKey !== 'string' || proposal.idempotencyKey.trim() === '') {
    validationErrors.push('Missing required idempotencyKey on write proposal.');
    idempotencyStatus = 'INVALID';
    if (decision !== 'FORBIDDEN') decision = 'BLOCK';
  } else {
    const isDuplicate = seenIdempotencyKeys instanceof Set
      ? seenIdempotencyKeys.has(proposal.idempotencyKey)
      : Array.isArray(seenIdempotencyKeys) && seenIdempotencyKeys.includes(proposal.idempotencyKey);

    if (isDuplicate) {
      validationErrors.push(`Duplicate write action detected with idempotency key "${proposal.idempotencyKey}".`);
      idempotencyStatus = 'DUPLICATE';
      if (decision !== 'FORBIDDEN') decision = 'BLOCK';
    }
  }

  // 8. Human Approval Evaluation
  if (proposal.permissionLevel === 'APPROVAL_REQUIRED' || proposal.riskLevel === 'HIGH' || proposal.riskLevel === 'CRITICAL') {
    requiresApproval = true;
  }

  if (decision !== 'FORBIDDEN' && decision !== 'BLOCK') {
    if (requiresApproval) {
      if (!approvalRecord) {
        decision = 'REQUIRE_APPROVAL';
      } else {
        const approvalCheck = validateApprovalIntegrity(proposal, approvalRecord, timestamp);
        approvalStatus = approvalCheck.status;

        if (!approvalCheck.isValid) {
          validationErrors.push(`Approval validation failed: ${approvalCheck.error}`);
          decision = approvalCheck.status === 'REJECTED' || approvalCheck.status === 'EXPIRED' || approvalCheck.status === 'INVALID'
            ? 'BLOCK'
            : 'REQUIRE_APPROVAL';
        } else {
          decision = 'ALLOW';
        }
      }
    } else {
      // Low risk write without explicit approval requirement
      decision = 'ALLOW';
    }
  }

  // 9. Generate Pure Dry-Run Preview
  const dryRunPreview = generateDryRunPreview(proposal, validationErrors);

  // 10. Assemble Sanitized Audit Metadata
  const affectedTargets = Array.isArray(proposal.affectedResources)
    ? Array.from(new Set(proposal.affectedResources.map((r) => r.target).filter((t) => VALID_SIDE_EFFECT_TARGETS.includes(t))))
    : [];

  const rawAudit: WriteActionAuditMetadata = {
    proposalId: proposal.proposalId,
    actionId: proposal.actionId,
    userId: proposal.userId,
    toolName: proposal.toolName,
    operationType: proposal.operationType,
    permissionLevel: proposal.permissionLevel,
    riskLevel: proposal.riskLevel,
    affectedTargets,
    idempotencyKey: proposal.idempotencyKey,
    actionFingerprint: computeActionFingerprint({
      userId: proposal.userId,
      toolName: proposal.toolName,
      input: proposal.input,
      affectedResources: proposal.affectedResources,
      riskLevel: proposal.riskLevel,
    }),
    policyDecision: decision,
    decisionReason: validationErrors.length > 0
      ? validationErrors.join('; ')
      : decision === 'ALLOW'
      ? 'Proposal satisfied all schema, tenant, risk, and approval safety checks.'
      : 'Action paused pending explicit human confirmation.',
    createdAt: timestamp,
  };

  const auditMetadata = sanitizeWorkingMemory(rawAudit as unknown as Record<string, unknown>) as unknown as WriteActionAuditMetadata;

  return {
    decision,
    proposalId: proposal.proposalId,
    actionSummary: `${proposal.toolName} (${proposal.riskLevel} Risk, ${proposal.permissionLevel}): ${proposal.expectedMutation}`,
    permissionLevel: proposal.permissionLevel,
    riskLevel: proposal.riskLevel,
    requiresApproval,
    approvalStatus,
    validationErrors,
    affectedResources: proposal.affectedResources,
    expectedMutation: proposal.expectedMutation,
    idempotencyStatus,
    dryRunPreview,
    auditMetadata,
    evaluatedAt: timestamp,
  };
}

/**
 * Creates a valid, strongly-typed WriteActionProposal with computed fingerprint and audit metadata.
 */
export function createWriteActionProposal<TInput extends Record<string, unknown> = Record<string, unknown>>(params: {
  proposalId?: string;
  actionId: string;
  toolName: string;
  userId: string;
  permissionLevel: ToolPermissionLevel;
  riskLevel: ToolRiskLevel;
  input: TInput;
  inputSchema?: ToolInputSchema;
  expectedMutation: string;
  affectedResources: SideEffectDeclaration[];
  requiresApproval?: boolean;
  approvalReason?: string;
  idempotencyKey?: string;
  contextId?: string;
  dryRun?: boolean;
  proposedAt?: string;
}): WriteActionProposal<TInput> {
  const timestamp = params.proposedAt || new Date().toISOString();
  const proposalId = params.proposalId || `prop_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const idempotencyKey = params.idempotencyKey || generateIdempotencyKey({
    userId: params.userId,
    toolName: params.toolName,
    input: params.input,
    contextId: params.contextId,
  });

  const requiresApproval = params.requiresApproval ?? (
    params.permissionLevel === 'APPROVAL_REQUIRED' || params.riskLevel === 'HIGH' || params.riskLevel === 'CRITICAL'
  );

  const actionFingerprint = computeActionFingerprint({
    userId: params.userId,
    toolName: params.toolName,
    input: params.input,
    affectedResources: params.affectedResources,
    riskLevel: params.riskLevel,
  });

  const affectedTargets = Array.isArray(params.affectedResources)
    ? Array.from(new Set(params.affectedResources.map((r) => r.target)))
    : [];

  const auditMetadata: WriteActionAuditMetadata = {
    proposalId,
    actionId: params.actionId,
    userId: params.userId,
    toolName: params.toolName,
    operationType: 'WRITE',
    permissionLevel: params.permissionLevel,
    riskLevel: params.riskLevel,
    affectedTargets,
    idempotencyKey,
    actionFingerprint,
    policyDecision: 'ALLOW',
    decisionReason: 'Proposal initialized',
    createdAt: timestamp,
  };

  return {
    proposalId,
    actionId: params.actionId,
    toolName: params.toolName,
    userId: params.userId,
    operationType: 'WRITE',
    permissionLevel: params.permissionLevel,
    riskLevel: params.riskLevel,
    input: params.input,
    inputSchema: params.inputSchema,
    expectedMutation: params.expectedMutation,
    affectedResources: params.affectedResources,
    approvalRequirement: {
      requiresApproval,
      riskLevel: params.riskLevel,
      reason: params.approvalReason || (requiresApproval ? 'Action risk or permission level mandates human confirmation.' : 'Low risk pre-authorized write.'),
      approvalRequestId: null,
    },
    idempotencyKey,
    dryRun: params.dryRun ?? true,
    auditMetadata,
    status: 'PROPOSED',
    proposedAt: timestamp,
  };
}
