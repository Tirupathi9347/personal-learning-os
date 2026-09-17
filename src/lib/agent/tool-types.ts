/**
 * Phase 3A: Tool Registry Architecture Types for the Agentic Learning OS.
 * 
 * Defines strongly-typed, machine-readable contracts for tool registration,
 * permission levels, risk classification, read/write boundaries, input/output schemas,
 * and execution audit metadata.
 */

import { ApprovalRiskLevel } from './state-types';

/**
 * Explicit operational classification of a tool.
 * Distinguishes pure, non-mutating queries from state-mutating actions.
 */
export type ToolOperationType = 'READ' | 'WRITE';

/**
 * Strict permission classes governing when and how a tool can be invoked.
 */
export type ToolPermissionLevel =
  | 'READ_ONLY'           // Pure inspection; non-mutating, zero side effects.
  | 'LOW_RISK_WRITE'      // Safe, localized, reversible writes (e.g., logging a reflection note).
  | 'APPROVAL_REQUIRED'   // High-impact or irreversible mutations requiring explicit human approval.
  | 'FORBIDDEN';          // Disallowed execution (e.g., destructive system wipes, privilege escalation).

/**
 * Risk classification for tool operations, aligned with state machine approval levels.
 */
export type ToolRiskLevel = ApprovalRiskLevel; // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Domain categories for agent tools.
 */
export type ToolCategory =
  | 'STUDENT_TELEMETRY'
  | 'CURRICULUM_AND_GOALS'
  | 'TASK_MANAGEMENT'
  | 'SCHEDULE_AND_TIME'
  | 'EVIDENCE_COLLECTION'
  | 'JOURNAL_AND_NOTES'
  | 'MISTAKE_LOGGING'
  | 'EXTERNAL_INTEGRATION'
  | 'SYSTEM_AND_DIAGNOSTICS';

/**
 * JSON Schema property descriptor for tool input parameters and outputs.
 */
export interface ToolPropertySchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required?: boolean;
  enum?: readonly (string | number | boolean)[];
  items?: ToolPropertySchema;
  properties?: Record<string, ToolPropertySchema>;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  integer?: boolean;
  nullable?: boolean;
}

/**
 * Input parameter specification schema for a tool.
 */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, ToolPropertySchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

/**
 * Output schema descriptor for tool execution results.
 */
export interface ToolOutputSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'void';
  description: string;
  properties?: Record<string, ToolPropertySchema>;
}

/**
 * Mandatory audit and safety metadata for tool definitions.
 */
export interface ToolAuditMetadata {
  /** Target entity or domain modified/inspected (e.g. 'tasks', 'calendar', 'notes') */
  targetEntity: string;
  /** Whether invoking this tool modifies student state, records, or external state */
  affectsStudentData: boolean;
  /** Whether the effects of this tool can be undone or reversed */
  isReversible: boolean;
  /** Whether human confirmation is strictly required prior to execution */
  requiresUserConfirmation: boolean;
  /** Human-readable explanation of why this risk/permission level was assigned */
  auditDescription: string;
}

/**
 * Complete, strongly-typed tool definition contract.
 * Every tool registered in the Agent OS must satisfy this definition.
 */
export interface ToolDefinition<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput = unknown
> {
  /** Unique snake_case or kebab-case identifier (e.g., 'get_student_tasks') */
  name: string;
  /** Comprehensive human/agent-readable explanation of what the tool accomplishes */
  description: string;
  /** Domain classification for discovery and capability filtering */
  category: ToolCategory;
  /** Whether the tool is a pure read or a stateful mutation */
  operationType: ToolOperationType;
  /** Enforceable permission tier */
  permissionLevel: ToolPermissionLevel;
  /** Risk rating for execution gating */
  riskLevel: ToolRiskLevel;
  /** Machine-readable input parameter schema */
  inputSchema: ToolInputSchema;
  /** Machine-readable output contract schema */
  outputSchema: ToolOutputSchema;
  /** Mandatory safety and audit classification metadata */
  auditMetadata: ToolAuditMetadata;
  /** Semantic version string (e.g. '1.0.0') */
  version?: string;
  /** Optional capability tags for semantic discovery */
  tags?: readonly string[];
  /** Phantom types for input/output typing in TypeScript */
  _input?: TInput;
  _output?: TOutput;
}

/**
 * Filter options for querying available tools in the registry.
 */
export interface ToolFilterOptions {
  category?: ToolCategory;
  operationType?: ToolOperationType;
  permissionLevel?: ToolPermissionLevel;
  maxRiskLevel?: ToolRiskLevel;
  tags?: readonly string[];
  targetEntity?: string;
}

/**
 * Validation error details when a tool definition fails registry criteria.
 */
export interface ToolValidationError {
  field: string;
  message: string;
  code: string;
}

/**
 * Result of validating a tool definition prior to registration.
 */
export interface ToolValidationResult {
  isValid: boolean;
  errors: ToolValidationError[];
}

/**
 * Result of validating runtime input against a tool's input schema.
 */
export interface ToolInputValidationResult {
  isValid: boolean;
  errors: Array<{
    parameter: string;
    message: string;
  }>;
}
