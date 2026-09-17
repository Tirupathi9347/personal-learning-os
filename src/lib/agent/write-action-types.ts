/**
 * Phase 5A: Controlled Write-Action Safety Foundation Types
 * 
 * Defines strongly-typed contracts for:
 * - Write action proposals (distinguishing INTENT from EXECUTION)
 * - Permission and risk classification
 * - Side-effect target declarations
 * - Strict schema validation boundaries
 * - Dry-run / preview guarantees (zero mutations)
 * - Explicit human approval and approval integrity verification
 * - Deterministic idempotency tracking
 * - Forbidden action classifications
 * - Auditing and tenant isolation
 * 
 * NOTE: Phase 5A is SAFETY LAYER ONLY. No actual write tools or mutations are executed.
 */

import {
  ToolOperationType,
  ToolPermissionLevel,
  ToolRiskLevel,
  ToolInputSchema,
} from './tool-types';
import {
  ApprovalDecision,
  ApprovalRiskLevel,
} from './state-types';

/**
 * Valid canonical side-effect target domains.
 * Every write proposal MUST explicitly declare its target domains.
 */
export type SideEffectTarget =
  | 'TASK'
  | 'CALENDAR'
  | 'SKILL'
  | 'PROJECT'
  | 'PROFILE'
  | 'JOURNAL'
  | 'NOTE'
  | 'DATABASE'
  | 'EXTERNAL_SYSTEM';

/**
 * Valid lifecycle statuses for a proposed write action.
 * NOTE: Explicitly NO 'EXECUTED' status in Phase 5A!
 */
export type WriteProposalStatus =
  | 'PROPOSED'   // Formulated intent awaiting policy evaluation
  | 'VALIDATED'  // Policy, schema, tenant, and side-effects checked
  | 'APPROVED'   // Explicit human approval verified with valid fingerprint
  | 'BLOCKED'    // Blocked by policy, schema violation, or rejection
  | 'FORBIDDEN';  // Prohibited by security policy; non-executable

/**
 * Policy outcome decision for a write safety evaluation.
 */
export type WritePolicyDecision =
  | 'ALLOW'             // Safe to proceed to staging/execution stage (in future phases)
  | 'REQUIRE_APPROVAL'  // Paused pending explicit human approval
  | 'BLOCK'             // Blocked due to validation error, missing info, or rejection
  | 'FORBIDDEN';         // Categorically prohibited; can never be authorized

/**
 * Human approval decision outcome.
 */
export type WriteApprovalDecision = 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'INVALID';

/**
 * Explicit declaration of a side-effect that a proposed write action may cause.
 */
export interface SideEffectDeclaration {
  /** Target entity/domain modified */
  target: SideEffectTarget;
  /** Specific resource type name (e.g. 'task_record', 'study_event', 'student_skill') */
  resourceType: string;
  /** Specific ID if updating an existing record, or null for new creation */
  resourceId?: string | null;
  /** High-level mutation action */
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC';
  /** Human-readable explanation of what will be affected */
  description: string;
  /** Whether the mutation is known to be reversible */
  isReversible: boolean;
}

/**
 * Human approval requirement specification for a write action.
 */
export interface WriteApprovalRequirement {
  /** Whether explicit human approval is required before execution */
  requiresApproval: boolean;
  /** Assessed risk level */
  riskLevel: ToolRiskLevel;
  /** Reason why approval is or is not required */
  reason: string;
  /** Optional approval request ID */
  approvalRequestId?: string | null;
}

/**
 * Non-transferable, cryptographically-fingerprinted human approval record.
 */
export interface WriteActionApprovalRecord {
  /** Unique approval ID */
  approvalId: string;
  /** Target proposal ID this approval authorizes */
  proposalId: string;
  /** Deterministic SHA-256 fingerprint of (userId, toolName, input, affectedResources, riskLevel) */
  actionFingerprint: string;
  /** Authenticated user ID that granted or rejected the approval */
  userId: string;
  /** Explicit human decision */
  decision: WriteApprovalDecision;
  /** Optional notes from the user */
  decisionNotes?: string;
  /** ISO 8601 timestamp when decided */
  decidedAt: string;
  /** ISO 8601 timestamp when this approval expires */
  expiresAt: string;
  /** Strictly false: approvals cannot be transferred across actions, users, or modified inputs */
  isTransferable: false;
}

/**
 * Immutable audit metadata attached to every write proposal.
 */
export interface WriteActionAuditMetadata {
  /** Unique proposal ID */
  proposalId: string;
  /** Proposed action ID */
  actionId: string;
  /** Authenticated user ID */
  userId: string;
  /** Tool name requested */
  toolName: string;
  /** Operation type (strictly 'WRITE') */
  operationType: ToolOperationType;
  /** Permission level */
  permissionLevel: ToolPermissionLevel;
  /** Risk rating */
  riskLevel: ToolRiskLevel;
  /** Declared side-effect targets */
  affectedTargets: SideEffectTarget[];
  /** Idempotency key */
  idempotencyKey: string;
  /** Deterministic action fingerprint */
  actionFingerprint: string;
  /** Policy decision */
  policyDecision: WritePolicyDecision;
  /** Detailed reason */
  decisionReason: string;
  /** ISO 8601 creation timestamp */
  createdAt: string;
}

/**
 * Core Write Action Proposal Contract.
 * Distinguishes proposed INTENT from actual execution.
 */
export interface WriteActionProposal<TInput extends Record<string, unknown> = Record<string, unknown>> {
  /** Unique proposal identifier */
  proposalId: string;
  /** Unique step/action identifier */
  actionId: string;
  /** Target tool name to be invoked */
  toolName: string;
  /** Target student user ID (must match authenticated tenant context) */
  userId: string;
  /** Operation type (strictly 'WRITE' for write actions) */
  operationType: ToolOperationType;
  /** Declared permission level */
  permissionLevel: ToolPermissionLevel;
  /** Risk classification level */
  riskLevel: ToolRiskLevel;
  /** Validated input payload */
  input: TInput;
  /** Optional input schema for runtime validation */
  inputSchema?: ToolInputSchema;
  /** Clear human-readable description of expected mutation */
  expectedMutation: string;
  /** Explicit list of all affected resources/domains */
  affectedResources: SideEffectDeclaration[];
  /** Approval requirement specification */
  approvalRequirement: WriteApprovalRequirement;
  /** Deterministic idempotency key */
  idempotencyKey: string;
  /** Whether this proposal is evaluated in dry-run/preview mode */
  dryRun: boolean;
  /** Immutable audit metadata */
  auditMetadata: WriteActionAuditMetadata;
  /** Current proposal status (PROPOSED, VALIDATED, APPROVED, BLOCKED, FORBIDDEN) */
  status: WriteProposalStatus;
  /** ISO 8601 creation timestamp */
  proposedAt: string;
}

/**
 * Side-effect boundary certification for dry-run evaluations.
 */
export interface DryRunGuarantees {
  /** Strictly false: Zero task records were created, updated, or deleted */
  isTaskModified: false;
  /** Strictly false: Zero calendar events were created, updated, or deleted */
  isCalendarModified: false;
  /** Strictly false: Zero database records were created, updated, or deleted */
  isDatabaseModified: false;
  /** Strictly false: Zero skills were created, updated, or deleted */
  isSkillModified: false;
  /** Strictly false: Zero external systems or APIs were contacted */
  isExternalSideEffectTriggered: false;
  /** Strictly true: Pure in-memory simulation guarantee */
  isDryRunGuaranteed: true;
}

/**
 * Result of executing a pure dry-run / preview on a write action proposal.
 */
export interface DryRunPreviewResult {
  /** Confirms this is a pure dry-run preview */
  isDryRun: true;
  /** Whether the proposal is valid and would be executable once authorized */
  isExecutable: boolean;
  /** Human-readable summary of proposed action */
  summary: string;
  /** Resource targets affected */
  affectedEntities: string[];
  /** Detailed description of potential mutations */
  potentialMutations: string[];
  /** Whether the mutations are reversible */
  isReversible: boolean;
  /** Safety and risk assessment explanation */
  riskAssessment: string;
  /** Approval requirement notice */
  requiresApproval: boolean;
  /** Certified side-effect boundary guarantees */
  guarantees: DryRunGuarantees;
}

/**
 * Comprehensive result of evaluating a write action proposal through the safety policy engine.
 */
export interface WriteSafetyEvaluationResult {
  /** Overall policy decision (ALLOW, REQUIRE_APPROVAL, BLOCK, FORBIDDEN) */
  decision: WritePolicyDecision;
  /** Target proposal ID */
  proposalId: string;
  /** High-level action summary */
  actionSummary: string;
  /** Permission level */
  permissionLevel: ToolPermissionLevel;
  /** Risk rating */
  riskLevel: ToolRiskLevel;
  /** Whether human approval is required */
  requiresApproval: boolean;
  /** Approval resolution status if an approval record was provided */
  approvalStatus?: WriteApprovalDecision;
  /** Structured validation errors if blocked */
  validationErrors: string[];
  /** Declared affected resources */
  affectedResources: SideEffectDeclaration[];
  /** Expected mutation description */
  expectedMutation: string;
  /** Idempotency evaluation status */
  idempotencyStatus: 'VALID' | 'DUPLICATE' | 'INVALID';
  /** Pure dry-run preview payload */
  dryRunPreview: DryRunPreviewResult;
  /** Sanitized audit metadata */
  auditMetadata: WriteActionAuditMetadata;
  /** ISO 8601 evaluation timestamp */
  evaluatedAt: string;
}

/**
 * Input options for evaluating a write action proposal through the safety policy.
 */
export interface EvaluateWriteSafetyInput<TInput extends Record<string, unknown> = Record<string, unknown>> {
  /** The proposed write action */
  proposal: WriteActionProposal<TInput>;
  /** Authenticated user ID from trusted server-side session */
  authenticatedUserId: string;
  /** Optional existing human approval record */
  approvalRecord?: WriteActionApprovalRecord | null;
  /** Optional set of previously seen idempotency keys for duplicate detection */
  seenIdempotencyKeys?: Set<string> | readonly string[];
  /** Fixed timestamp for deterministic testing */
  timestamp?: string;
}
