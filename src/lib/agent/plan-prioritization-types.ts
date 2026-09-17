/**
 * Phase 4C: Plan Prioritization & Scheduling Preparation Types
 * 
 * Defines strongly-typed contracts for deterministic plan step prioritization,
 * dependency readiness evaluation, ground-truth tool capability auditing,
 * topological scheduling tiers, and non-mutating scheduling proposals for the
 * SINGLE Learning Orchestrator Agent.
 */

import {
  LearningPlan,
  PlanStep,
  PlanPriority,
  PlanEffortEstimate,
  PlanStatus,
} from './planning-types';
import { GoalCategory } from './intake-types';

/**
 * Granular readiness classification for a single plan step.
 */
export type StepReadinessStatus =
  | 'READY'                                  // All dependencies met, tools available, plan ready, no blockers.
  | 'BLOCKED_BY_DEPENDENCIES'               // One or more predecessor steps have not been completed/satisfied.
  | 'BLOCKED_BY_UNAVAILABLE_CAPABILITY'     // Requires a tool/capability not present in the ToolRegistry.
  | 'BLOCKED_BY_APPROVAL'                   // Action requires explicit human approval before execution.
  | 'BLOCKED_BY_PLAN_STATUS'                // Parent plan is not in READY or EXECUTING status.
  | 'COMPLETED'                             // Step has already been completed.
  | 'SUPERSEDED';                           // Step was superseded or invalidated.

/**
 * Detailed evaluation of a single step's priority, readiness, and tool capabilities.
 */
export interface PrioritizedStepEvaluation {
  /** Unique step identifier */
  stepId: string;
  /** Parent plan ID */
  planId: string;
  /** Original 1-based step order in plan */
  originalOrder: number;
  /** Step title */
  title: string;
  /** Detailed intended action description */
  description: string;
  /** Pedagogical rationale */
  rationale: string;
  /** Base priority declared on step */
  basePriority: PlanPriority;
  /** Calibrated effective priority after contextual evaluation */
  effectivePriority: PlanPriority;
  /** Numeric priority weight for deterministic sorting (e.g. 4 = URGENT, 3 = HIGH, 2 = MEDIUM, 1 = LOW) */
  priorityScore: number;
  /** Transparent explanation of why this priority score and rank was assigned */
  priorityJustification: string;
  /** List of step IDs this step directly depends on */
  dependencies: string[];
  /** Assigned topological scheduling tier (1-based: Tier 1, Tier 2, etc.) */
  schedulingTier: number;
  /** Granular readiness status */
  readinessStatus: StepReadinessStatus;
  /** Boolean flag: true only if readinessStatus === 'READY' */
  isExecutionReady: boolean;
  /** List of specific blocking reasons preventing immediate execution readiness */
  blockingReasons: string[];
  /** Tools requested by this step */
  requiredTools: string[] | null;
  /** Tools requested that ARE present in the actual Phase 3 ToolRegistry */
  availableTools: string[];
  /** Tools requested that ARE NOT present in the actual Phase 3 ToolRegistry */
  unavailableTools: string[];
  /** Target skill identifier if present; null if general */
  targetSkill: string | null;
  /** Estimated effort (strictly preserved as null if unknown; never fabricated) */
  estimatedEffort: PlanEffortEstimate | null;
  /** Empirical verification criteria */
  verificationCriteria: string[];
  /** Human approval requirement */
  requiresApproval: boolean;
}

/**
 * A discrete topological scheduling tier containing steps that can be prepared in parallel.
 */
export interface ScheduledTier {
  /** 1-based tier index (Tier 1 = initial independent steps, Tier 2 = dependent, etc.) */
  tierNumber: number;
  /** Descriptive summary of this tier's milestone role */
  tierLabel: string;
  /** Step IDs in this tier, sorted deterministically by priority and tie-breaking rules */
  stepIds: string[];
  /** Evaluated step objects in this tier */
  steps: PrioritizedStepEvaluation[];
  /** Whether all steps in this tier are execution-ready */
  isTierReady: boolean;
}

/**
 * Capability audit summary comparing plan tool requirements against actual Tool Registry.
 */
export interface PlanCapabilityAudit {
  /** Total distinct tool names requested across all steps */
  totalToolsRequested: number;
  /** Tool names verified to exist in the actual Tool Registry */
  verifiedAvailableTools: string[];
  /** Tool names requested that do NOT exist in the Tool Registry */
  unregisteredUnavailableTools: string[];
  /** True if any required tool is missing from the registry */
  hasUnavailableCapabilities: boolean;
  /** Explicit limitation notes */
  capabilityLimitations: string[];
}

/**
 * Intent vs Execution boundary confirmation.
 * Guarantees zero side effects occurred during prioritization and proposal preparation.
 */
export interface IntentVsExecutionBoundary {
  /** Strictly false in Phase 4C: No tool execution was initiated */
  isExecutionTriggered: false;
  /** Strictly false in Phase 4C: No calendar events were created or modified */
  isCalendarModified: false;
  /** Strictly false in Phase 4C: No tasks were created or modified */
  isTaskModified: false;
  /** Strictly false in Phase 4C: No database tables or records were modified */
  isDatabaseModified: false;
  /** Transparent audit disclaimer */
  disclaimer: string;
}

/**
 * The complete, strongly-typed Scheduling Proposal Contract.
 * Represents the deterministic pre-execution blueprint for a LearningPlan.
 */
export interface PlanSchedulingProposal {
  /** Unique plan identifier */
  planId: string;
  /** Student user ID */
  userId: string;
  /** Original student goal preserved verbatim */
  goal: string;
  /** Categorization */
  category?: GoalCategory;
  /** Target skill or topic */
  targetSkill: string | null;
  /** Lifecycle status of the parent plan */
  planStatus: PlanStatus;
  /** Timeframe hint if known; null if unknown (never converted to fake dates) */
  timeframeHint: string | null;
  /** Total count of steps */
  totalSteps: number;
  /** Count of steps that are immediately execution-ready */
  readyStepsCount: number;
  /** Count of steps that are currently blocked */
  blockedStepsCount: number;
  /** Discrete topological scheduling tiers */
  schedulingTiers: ScheduledTier[];
  /** Complete linear execution order (ordered step IDs after multi-factor deterministic sorting) */
  linearExecutionOrder: string[];
  /** All step evaluations in linear execution order */
  prioritizedSteps: PrioritizedStepEvaluation[];
  /** Architectural capability audit against actual Tool Registry */
  capabilityAudit: PlanCapabilityAudit;
  /** Explicit boundary guarantees confirming zero mutations */
  boundaryGuarantees: IntentVsExecutionBoundary;
  /** Overall justification for the prioritization and scheduling structure */
  proposalRationale: string;
  /** Unresolved clarifications or missing information */
  unresolvedClarifications: string[];
  /** Deterministic generation timestamp (ISO 8601) */
  generatedAt: string;
}

/**
 * Input options for the deterministic plan prioritization engine.
 */
export interface PrioritizePlanOptions {
  /** Optional custom ToolRegistry instance to validate against (defaults to agentToolRegistry) */
  registry?: import('./tool-registry').AgentToolRegistry;
  /** Optional fixed ISO timestamp for deterministic testing */
  timestamp?: string;
}

/**
 * Result of prioritizing a plan.
 */
export interface PlanPrioritizationResult {
  success: boolean;
  proposal?: PlanSchedulingProposal;
  errors?: string[];
}
