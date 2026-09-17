/**
 * Phase 3A: Tool Registry Architecture for the Agentic Learning OS.
 * 
 * Provides:
 * - Deterministic, strongly-typed tool registration and discovery.
 * - Strict schema, permission, risk, and read/write boundary validation.
 * - Rejection of duplicate or incomplete tool definitions.
 * - Machine-readable permission classes preventing silent execution of mutations.
 * - Safe handling of empty registry states.
 * 
 * NOTE: This module defines the tool architecture ONLY. No tools are executed here.
 */

import {
  ToolDefinition,
  ToolValidationResult,
  ToolValidationError,
  ToolInputValidationResult,
  ToolFilterOptions,
  ToolCategory,
  ToolOperationType,
  ToolPermissionLevel,
  ToolRiskLevel,
} from './tool-types';

export * from './tool-types';

const VALID_CATEGORIES: readonly ToolCategory[] = [
  'STUDENT_TELEMETRY',
  'CURRICULUM_AND_GOALS',
  'TASK_MANAGEMENT',
  'SCHEDULE_AND_TIME',
  'EVIDENCE_COLLECTION',
  'JOURNAL_AND_NOTES',
  'MISTAKE_LOGGING',
  'EXTERNAL_INTEGRATION',
  'SYSTEM_AND_DIAGNOSTICS',
];

const VALID_OPERATIONS: readonly ToolOperationType[] = ['READ', 'WRITE'];

const VALID_PERMISSIONS: readonly ToolPermissionLevel[] = [
  'READ_ONLY',
  'LOW_RISK_WRITE',
  'APPROVAL_REQUIRED',
  'FORBIDDEN',
];

const VALID_RISK_LEVELS: readonly ToolRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const RISK_HIERARCHY: Record<ToolRiskLevel, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

const TOOL_NAME_REGEX = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Custom error thrown by the Tool Registry for invalid operations or violations.
 */
export class ToolRegistryError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(`[ToolRegistry] ${code}: ${message}`);
    this.name = 'ToolRegistryError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Validates a ToolDefinition against the Phase 3A architecture rules.
 * Enforces schema validity, non-empty descriptions, and strict permission/operation integrity.
 */
export function validateToolDefinition(tool: unknown): ToolValidationResult {
  const errors: ToolValidationError[] = [];

  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    return {
      isValid: false,
      errors: [
        {
          field: 'root',
          message: 'Tool definition must be a non-null object.',
          code: 'ERR_INVALID_OBJECT',
        },
      ],
    };
  }

  const def = tool as Partial<ToolDefinition>;

  // 1. Tool Name Validation
  if (!def.name || typeof def.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Tool name is required and must be a string.',
      code: 'ERR_MISSING_NAME',
    });
  } else if (!TOOL_NAME_REGEX.test(def.name)) {
    errors.push({
      field: 'name',
      message: `Tool name "${def.name}" must be lower_snake_case starting with a letter (2-64 chars).`,
      code: 'ERR_INVALID_NAME_FORMAT',
    });
  }

  // 2. Description Validation
  if (!def.description || typeof def.description !== 'string') {
    errors.push({
      field: 'description',
      message: 'Tool description is required and must be a string.',
      code: 'ERR_MISSING_DESCRIPTION',
    });
  } else if (def.description.trim().length < 10) {
    errors.push({
      field: 'description',
      message: 'Tool description must be at least 10 characters long.',
      code: 'ERR_DESCRIPTION_TOO_SHORT',
    });
  }

  // 3. Category Validation
  if (!def.category || !VALID_CATEGORIES.includes(def.category as ToolCategory)) {
    errors.push({
      field: 'category',
      message: `Category must be one of: ${VALID_CATEGORIES.join(', ')}`,
      code: 'ERR_INVALID_CATEGORY',
    });
  }

  // 4. Operation Type Validation
  if (!def.operationType || !VALID_OPERATIONS.includes(def.operationType as ToolOperationType)) {
    errors.push({
      field: 'operationType',
      message: `Operation type must be "READ" or "WRITE".`,
      code: 'ERR_INVALID_OPERATION_TYPE',
    });
  }

  // 5. Permission Level Validation
  if (!def.permissionLevel || !VALID_PERMISSIONS.includes(def.permissionLevel as ToolPermissionLevel)) {
    errors.push({
      field: 'permissionLevel',
      message: `Permission level must be one of: ${VALID_PERMISSIONS.join(', ')}`,
      code: 'ERR_INVALID_PERMISSION_LEVEL',
    });
  }

  // 6. Risk Level Validation
  if (!def.riskLevel || !VALID_RISK_LEVELS.includes(def.riskLevel as ToolRiskLevel)) {
    errors.push({
      field: 'riskLevel',
      message: `Risk level must be one of: ${VALID_RISK_LEVELS.join(', ')}`,
      code: 'ERR_INVALID_RISK_LEVEL',
    });
  }

  // 7. Strict Permission & Operation Contradiction Checks
  if (def.operationType === 'READ' && def.permissionLevel !== 'READ_ONLY') {
    errors.push({
      field: 'permissionLevel',
      message: `A READ operation must have permissionLevel "READ_ONLY", but received "${def.permissionLevel}".`,
      code: 'ERR_CONTRADICTORY_READ_PERMISSION',
    });
  }

  if (def.operationType === 'WRITE' && def.permissionLevel === 'READ_ONLY') {
    errors.push({
      field: 'permissionLevel',
      message: 'A WRITE operation cannot have permissionLevel "READ_ONLY". Must be LOW_RISK_WRITE, APPROVAL_REQUIRED, or FORBIDDEN.',
      code: 'ERR_CONTRADICTORY_WRITE_PERMISSION',
    });
  }

  // 8. Input Schema Validation
  if (!def.inputSchema || typeof def.inputSchema !== 'object') {
    errors.push({
      field: 'inputSchema',
      message: 'Tool inputSchema is required.',
      code: 'ERR_MISSING_INPUT_SCHEMA',
    });
  } else {
    if (def.inputSchema.type !== 'object') {
      errors.push({
        field: 'inputSchema.type',
        message: 'Tool inputSchema.type must be "object".',
        code: 'ERR_INVALID_INPUT_SCHEMA_TYPE',
      });
    }
    if (!def.inputSchema.properties || typeof def.inputSchema.properties !== 'object') {
      errors.push({
        field: 'inputSchema.properties',
        message: 'Tool inputSchema.properties must be a valid property map.',
        code: 'ERR_INVALID_INPUT_SCHEMA_PROPERTIES',
      });
    } else if (Array.isArray(def.inputSchema.required)) {
      for (const reqProp of def.inputSchema.required) {
        if (!def.inputSchema.properties[reqProp]) {
          errors.push({
            field: 'inputSchema.required',
            message: `Required property "${reqProp}" is not declared in inputSchema.properties.`,
            code: 'ERR_UNDECLARED_REQUIRED_PROPERTY',
          });
        }
      }
    }
  }

  // 9. Output Schema Validation
  if (!def.outputSchema || typeof def.outputSchema !== 'object') {
    errors.push({
      field: 'outputSchema',
      message: 'Tool outputSchema is required.',
      code: 'ERR_MISSING_OUTPUT_SCHEMA',
    });
  } else {
    if (!def.outputSchema.type || typeof def.outputSchema.type !== 'string') {
      errors.push({
        field: 'outputSchema.type',
        message: 'Tool outputSchema.type is required.',
        code: 'ERR_MISSING_OUTPUT_SCHEMA_TYPE',
      });
    }
    if (!def.outputSchema.description || typeof def.outputSchema.description !== 'string') {
      errors.push({
        field: 'outputSchema.description',
        message: 'Tool outputSchema.description is required.',
        code: 'ERR_MISSING_OUTPUT_SCHEMA_DESCRIPTION',
      });
    }
  }

  // 10. Audit Metadata Validation
  if (!def.auditMetadata || typeof def.auditMetadata !== 'object') {
    errors.push({
      field: 'auditMetadata',
      message: 'Tool auditMetadata is required.',
      code: 'ERR_MISSING_AUDIT_METADATA',
    });
  } else {
    const audit = def.auditMetadata;
    if (!audit.targetEntity || typeof audit.targetEntity !== 'string') {
      errors.push({
        field: 'auditMetadata.targetEntity',
        message: 'auditMetadata.targetEntity must be a non-empty string.',
        code: 'ERR_MISSING_TARGET_ENTITY',
      });
    }
    if (typeof audit.affectsStudentData !== 'boolean') {
      errors.push({
        field: 'auditMetadata.affectsStudentData',
        message: 'auditMetadata.affectsStudentData must be a boolean.',
        code: 'ERR_INVALID_AFFECTS_STUDENT_DATA',
      });
    }
    if (typeof audit.isReversible !== 'boolean') {
      errors.push({
        field: 'auditMetadata.isReversible',
        message: 'auditMetadata.isReversible must be a boolean.',
        code: 'ERR_INVALID_IS_REVERSIBLE',
      });
    }
    if (typeof audit.requiresUserConfirmation !== 'boolean') {
      errors.push({
        field: 'auditMetadata.requiresUserConfirmation',
        message: 'auditMetadata.requiresUserConfirmation must be a boolean.',
        code: 'ERR_INVALID_REQUIRES_CONFIRMATION',
      });
    }
    if (!audit.auditDescription || typeof audit.auditDescription !== 'string') {
      errors.push({
        field: 'auditMetadata.auditDescription',
        message: 'auditMetadata.auditDescription must be a non-empty string.',
        code: 'ERR_MISSING_AUDIT_DESCRIPTION',
      });
    }

    // Integrity: If permission is APPROVAL_REQUIRED, confirmation must be true
    if (def.permissionLevel === 'APPROVAL_REQUIRED' && !audit.requiresUserConfirmation) {
      errors.push({
        field: 'auditMetadata.requiresUserConfirmation',
        message: 'Tools with permissionLevel "APPROVAL_REQUIRED" must have auditMetadata.requiresUserConfirmation = true.',
        code: 'ERR_CONTRADICTORY_CONFIRMATION_REQUIREMENT',
      });
    }

    // Integrity: If operation is WRITE, affectsStudentData must be consistent
    if (def.operationType === 'WRITE' && !audit.affectsStudentData) {
      errors.push({
        field: 'auditMetadata.affectsStudentData',
        message: 'WRITE operations must have auditMetadata.affectsStudentData set to true.',
        code: 'ERR_CONTRADICTORY_AFFECTS_STUDENT_DATA',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Machine-readable Tool Registry for the Learning Orchestrator.
 * Stores validated tool specifications, supports semantic lookup, and enforces safety boundaries.
 */
export class AgentToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * Registers a single tool definition.
   * Validates the definition and rejects duplicates or malformed contracts.
   */
  public registerTool<TInput extends Record<string, unknown>, TOutput>(
    definition: ToolDefinition<TInput, TOutput>
  ): void {
    const validation = validateToolDefinition(definition);
    if (!validation.isValid) {
      const errorMsg = validation.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
      throw new ToolRegistryError(
        'ERR_INVALID_TOOL_DEFINITION',
        `Failed to register tool "${definition?.name || 'unknown'}": ${errorMsg}`,
        validation.errors
      );
    }

    if (this.tools.has(definition.name)) {
      throw new ToolRegistryError(
        'ERR_DUPLICATE_TOOL',
        `Cannot register tool "${definition.name}": A tool with this name is already registered.`
      );
    }

    // Freeze deep copy to prevent runtime tampering
    this.tools.set(definition.name, Object.freeze({ ...definition }));
  }

  /**
   * Registers an array of tool definitions in bulk.
   */
  public registerTools(definitions: ToolDefinition[]): void {
    for (const def of definitions) {
      this.registerTool(def);
    }
  }

  /**
   * Retrieves a registered tool definition by unique name.
   * Returns undefined safely if the tool does not exist.
   */
  public getTool<TInput extends Record<string, unknown> = Record<string, unknown>, TOutput = unknown>(
    name: string
  ): ToolDefinition<TInput, TOutput> | undefined {
    return this.tools.get(name) as ToolDefinition<TInput, TOutput> | undefined;
  }

  /**
   * Checks whether a tool with the given name is registered.
   */
  public hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Lists all registered tools, optionally matching filtered criteria.
   */
  public listTools(filter?: ToolFilterOptions): ToolDefinition[] {
    const all = Array.from(this.tools.values());
    if (!filter) {
      return all;
    }

    return all.filter((tool) => {
      if (filter.category && tool.category !== filter.category) {
        return false;
      }
      if (filter.operationType && tool.operationType !== filter.operationType) {
        return false;
      }
      if (filter.permissionLevel && tool.permissionLevel !== filter.permissionLevel) {
        return false;
      }
      if (filter.targetEntity && tool.auditMetadata.targetEntity !== filter.targetEntity) {
        return false;
      }
      if (filter.maxRiskLevel) {
        const toolRiskScore = RISK_HIERARCHY[tool.riskLevel] || 99;
        const maxRiskScore = RISK_HIERARCHY[filter.maxRiskLevel] || 0;
        if (toolRiskScore > maxRiskScore) {
          return false;
        }
      }
      if (filter.tags && filter.tags.length > 0) {
        const toolTags = tool.tags || [];
        const hasAllTags = filter.tags.every((tag) => toolTags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Returns all read-only inspection tools.
   */
  public getReadOnlyTools(): ToolDefinition[] {
    return this.listTools({ operationType: 'READ' });
  }

  /**
   * Returns all write-capable mutation tools.
   */
  public getMutationTools(): ToolDefinition[] {
    return this.listTools({ operationType: 'WRITE' });
  }

  /**
   * Returns all tools requiring human approval.
   */
  public getToolsRequiringApproval(): ToolDefinition[] {
    return this.listTools({ permissionLevel: 'APPROVAL_REQUIRED' });
  }

  /**
   * Returns all tools belonging to a specific domain category.
   */
  public getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.listTools({ category });
  }

  /**
   * Returns the total count of registered tools.
   */
  public getToolCount(): number {
    return this.tools.size;
  }

  /**
   * Returns an array of all registered tool names.
   */
  public getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Validates runtime input arguments against a registered tool's schema.
   */
  public validateToolInput(toolName: string, input: unknown): ToolInputValidationResult {
    const tool = this.getTool(toolName);
    if (!tool) {
      return {
        isValid: false,
        errors: [{ parameter: 'root', message: `Tool "${toolName}" is not registered.` }],
      };
    }

    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {
        isValid: false,
        errors: [{ parameter: 'root', message: 'Tool input must be an object payload.' }],
      };
    }

    const payload = input as Record<string, unknown>;
    const errors: Array<{ parameter: string; message: string }> = [];

    // Check required fields
    if (tool.inputSchema.required) {
      for (const reqKey of tool.inputSchema.required) {
        if (payload[reqKey] === undefined || payload[reqKey] === null || payload[reqKey] === '') {
          errors.push({
            parameter: reqKey,
            message: `Required parameter "${reqKey}" is missing.`,
          });
        }
      }
    }

    // Check basic property types and bounds
    for (const [key, val] of Object.entries(payload)) {
      const propDef = tool.inputSchema.properties[key];
      if (!propDef) {
        if (tool.inputSchema.additionalProperties !== true) {
          errors.push({
            parameter: key,
            message: `Unknown parameter "${key}" is not allowed.`,
          });
        }
        continue;
      }

      if (val === undefined || val === null) {
        if (val === null && !propDef.nullable) {
          errors.push({
            parameter: key,
            message: `Parameter "${key}" cannot be null.`,
          });
        }
        continue;
      }

      const valType = Array.isArray(val) ? 'array' : typeof val;
      if (valType !== propDef.type) {
        errors.push({
          parameter: key,
          message: `Parameter "${key}" expected type "${propDef.type}", got "${valType}".`,
        });
        continue;
      }

      if (valType === 'number') {
        const numVal = val as number;
        if (Number.isNaN(numVal)) {
          errors.push({
            parameter: key,
            message: `Parameter "${key}" cannot be NaN.`,
          });
        } else {
          if (propDef.integer && !Number.isInteger(numVal)) {
            errors.push({
              parameter: key,
              message: `Parameter "${key}" must be an integer.`,
            });
          }
          if (typeof propDef.minimum === 'number' && numVal < propDef.minimum) {
            errors.push({
              parameter: key,
              message: `Parameter "${key}" value ${numVal} must be greater than or equal to ${propDef.minimum}.`,
            });
          }
          if (typeof propDef.maximum === 'number' && numVal > propDef.maximum) {
            errors.push({
              parameter: key,
              message: `Parameter "${key}" value ${numVal} must be less than or equal to ${propDef.maximum}.`,
            });
          }
        }
      }

      if (propDef.enum && !propDef.enum.includes(val as string | number | boolean)) {
        errors.push({
          parameter: key,
          message: `Parameter "${key}" value "${String(val)}" must be one of: ${propDef.enum.join(', ')}`,
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Clears all registered tools (used for test isolation).
   */
  public clear(): void {
    this.tools.clear();
  }
}

/**
 * Creates a new, isolated AgentToolRegistry instance.
 */
export function createToolRegistry(): AgentToolRegistry {
  return new AgentToolRegistry();
}

/**
 * Global default tool registry singleton.
 */
export const agentToolRegistry = createToolRegistry();
