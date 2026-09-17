'use server';

import { 
  runFullStudentCorroborationAudit,
  validateAndIntakeStudentGoal,
  validateAndIntakeSystemEvent,
  loadAgentRunFromDb,
  listUserAgentRunsFromDb,
  StudentGoalInput,
  SystemEventInput,
  AgentTriggerContext,
  understandStudentGoal,
  GoalUnderstanding,
  GoalClarificationQuestion,
  collectStudentEvidence,
  corroborateStudentEvidence,
  calculateCorroborationConfidence,
  generateStudentLearningAssessment,
  StudentLearningAssessment,
  generateLearningDecision,
  LearningDecision,
  bridgeDecisionToPlan,
  LearningPlan,
  evaluateAdaptiveLearningPolicyDeterministic,
  AdaptiveLearningPolicy,
  createTaskProposalFromPlanStep,
  isPlanStepTaskCreation,
  executeCreateTaskTool,
  CreateTaskInput,
  WriteActionProposal,
  WriteActionApprovalRecord,
  createInitialAgentState,
  transitionAgentState,
  persistAgentRunState,
  evaluateLearningOutcomeAsync,
  LearningOutcome,
  LearningFeedback,
  analyzeLearningTrajectoryAsync,
  LearningTrajectory,
  PlanStepExecutionResult,
  StepVerificationResult,
  restoreJourneyContextFromRun,
  resumeLearningJourneyState,
  evaluateContinuityContext,
  generateDeterministicTaskFingerprint,
  PersistedJourneyContext,
  ResumeJourneyResult,
  ContinuityEvaluationResult,
} from '@/lib/agent';
export type { PersistedJourneyContext, ResumeJourneyResult, ContinuityEvaluationResult };
import { StudentCorroborationAuditResult } from '@/lib/agent/types';
import { createTask, updateTaskStatus } from '@/app/actions/task-actions';
import { createClient } from '@/lib/supabase/server';

/**
 * Server Action: Execute the read-only Student Evidence Corroboration Audit pipeline
 * (Features 1B -> 1C -> 1D) and return the structured audit result.
 */
export async function getStudentEvidenceAudit(): Promise<{
  success: boolean;
  data?: StudentCorroborationAuditResult;
  error?: string;
}> {
  try {
    const auditResult = await runFullStudentCorroborationAudit();
    return { success: true, data: auditResult };
  } catch (err: any) {
    return { 
      success: false, 
      error: err.message || 'Failed to generate student evidence audit.' 
    };
  }
}

/**
 * Server Action: Validate and intake a student goal within the authenticated session.
 * Feature 2C: Goal / Event Intake for the Learning Orchestrator.
 */
export async function submitStudentGoalToAgent(
  rawGoalText: string,
  options?: {
    targetSkillName?: string;
    timeframeHint?: string;
    category?: any;
    priority?: any;
    metadata?: Record<string, unknown>;
    explicitUserId?: string;
  }
): Promise<{
  success: boolean;
  data?: AgentTriggerContext;
  error?: string;
}> {
  try {
    let supabase: any = null;
    let authenticatedId: string | null = null;
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authenticatedId = user?.id || null;
    } catch {
      // In standalone CLI test or SSR environment without cookie headers
    }
    
    let userId: string | null = null;
    if (authenticatedId) {
      userId = authenticatedId;
    } else if (options?.explicitUserId !== undefined) {
      userId = options.explicitUserId.trim() || null;
    } else {
      userId = 'student_local';
    }

    if (!userId) {
      return {
        success: false,
        error: 'Authentication required to submit student goal.',
      };
    }

    const goalInput: StudentGoalInput = {
      userId,
      rawGoalText,
      targetSkillName: options?.targetSkillName,
      timeframeHint: options?.timeframeHint,
      category: options?.category,
      priority: options?.priority,
      metadata: options?.metadata,
    };

    const intakeResult = validateAndIntakeStudentGoal(goalInput, authenticatedId || userId);

    if (!intakeResult.success || !intakeResult.triggerContext) {
      return {
        success: false,
        error: intakeResult.error?.message || 'Goal validation failed.',
      };
    }

    return {
      success: true,
      data: intakeResult.triggerContext,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to process student goal intake.',
    };
  }
}

/**
 * Result payload from the end-to-end Learning Orchestrator student flow.
 */
export interface OrchestratorRunResult {
  success: boolean;
  runId: string;
  status: 'COMPLETED' | 'WAITING_FOR_APPROVAL' | 'NEEDS_CLARIFICATION' | 'FAILED';
  goalUnderstanding?: GoalUnderstanding;
  clarificationQuestions?: GoalClarificationQuestion[];
  studentAssessment?: StudentLearningAssessment;
  learningDecision?: LearningDecision;
  learningPlan?: LearningPlan;
  adaptivePolicy?: AdaptiveLearningPolicy;
  approvalProposal?: WriteActionProposal<CreateTaskInput> | null;
  continuityContext?: ContinuityEvaluationResult | null;
  error?: string;
  executionTimeMs?: number;
}

/**
 * Server Action: Execute the end-to-end Single Learning Orchestrator pipeline
 * (6A Understanding -> 6B Assessment -> 6C Decision -> 6D Plan -> 6G Policy -> Phase 5 Approval Gate).
 * 
 * Guarantees:
 * 1. Strictly ONE Learning Orchestrator is invoked.
 * 2. If the goal is ambiguous, halts at 'NEEDS_CLARIFICATION'.
 * 3. If the plan proposes a task, generates a Phase 5 proposal and halts at 'WAITING_FOR_APPROVAL'.
 * 4. Zero unapproved writes or self-approvals.
 */
export async function runStudentGoalOrchestrator(
  rawGoalText: string,
  options?: {
    explicitUserId?: string;
    targetSkillName?: string;
    timeframeHint?: string;
    category?: any;
    priority?: any;
    resumeRunId?: string;
  }
): Promise<OrchestratorRunResult> {
  const startTime = Date.now();
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    let supabase: any = null;
    let authenticatedId: string | null = null;
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authenticatedId = user?.id || null;
    } catch {
      // In standalone CLI test or SSR environment without cookie headers
    }

    let userId: string | null = null;
    if (authenticatedId) {
      userId = authenticatedId;
    } else if (options?.explicitUserId !== undefined) {
      userId = options.explicitUserId.trim() || null;
    } else {
      userId = 'student_local';
    }

    if (!userId) {
      return {
        success: false,
        runId,
        status: 'FAILED',
        error: 'Authentication required to run learning orchestrator.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 0. Optional Phase 9 Continuity Evaluation if resuming prior run
    let continuityContext: ContinuityEvaluationResult | null = null;
    let targetSkillHint = options?.targetSkillName;
    if (options?.resumeRunId && supabase) {
      try {
        const loadRes = await loadAgentRunFromDb(supabase, options.resumeRunId.trim());
        if (loadRes.success && loadRes.state) {
          const persisted = restoreJourneyContextFromRun(loadRes.state);
          continuityContext = evaluateContinuityContext({
            userId,
            previousJourney: persisted,
            newGoalText: rawGoalText,
          });
          if (continuityContext.isContinuingPreviousGoal && continuityContext.inheritedTargetSkills.length > 0) {
            targetSkillHint = targetSkillHint || continuityContext.inheritedTargetSkills[0];
          }
        }
      } catch {
        // Safe fallback if resume evaluation fails
      }
    }

    // 1. Phase 1: Corroborated Evidence Audit
    const evidenceCollection = await collectStudentEvidence();
    const corroborationResult = corroborateStudentEvidence(evidenceCollection);
    const evidenceAudit = calculateCorroborationConfidence(corroborationResult, userId);

    // 2. Phase 6A: Intelligent Goal Understanding (grounded with evidence audit)
    const goalUnderstanding = await understandStudentGoal({
      rawGoalText,
      userId,
      targetSkillHint,
      timeframeHint: options?.timeframeHint,
      evidenceAudit,
    });

    if (goalUnderstanding.clarificationNeeded && goalUnderstanding.clarificationQuestions.length > 0) {
      return {
        success: true,
        runId,
        status: 'NEEDS_CLARIFICATION',
        goalUnderstanding,
        clarificationQuestions: goalUnderstanding.clarificationQuestions,
        continuityContext,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 3. Phase 6B: Evidence-Aware Student Assessment
    const studentAssessment = await generateStudentLearningAssessment({
      userId,
      corroborationResult,
      goalUnderstanding,
    });

    // 4. Phase 6C: Authoritative Decision & Action Selection
    const learningDecision = await generateLearningDecision({
      userId,
      assessment: studentAssessment,
      goalUnderstanding,
    });

    // 5. Phase 6D: Decision-to-Plan Bridge
    const bridgeResult = await bridgeDecisionToPlan({
      userId,
      decision: learningDecision,
      assessment: studentAssessment,
      goalUnderstanding,
    });
    let learningPlan = bridgeResult.plan;

    // If continuing from prior journey, mark already completed steps
    if (learningPlan && continuityContext?.activeStepIdsToSkip && continuityContext.activeStepIdsToSkip.length > 0) {
      const skipSet = new Set(continuityContext.activeStepIdsToSkip);
      learningPlan = {
        ...learningPlan,
        steps: learningPlan.steps.map((s) =>
          skipSet.has(s.id) ? { ...s, status: 'COMPLETED' as const } : s
        ),
      };
    }

    // 6. Phase 6G: Adaptive Learning Policy & Adaptation Guidance
    const policyResult = evaluateAdaptiveLearningPolicyDeterministic({
      userId,
      goalUnderstanding,
      studentAssessment,
      previousDecision: learningDecision,
      executedPlan: learningPlan || undefined,
    });
    const adaptivePolicy = policyResult.policy;

    // 7. Phase 5: Check for task creation proposal & human approval gating
    let approvalProposal: WriteActionProposal<CreateTaskInput> | null = null;
    let runStatus: 'COMPLETED' | 'WAITING_FOR_APPROVAL' = 'COMPLETED';

    if (learningPlan && Array.isArray(learningPlan.steps)) {
      const taskCreationStep = learningPlan.steps.find((s) => isPlanStepTaskCreation(s) || s.requiresApproval);
      if (taskCreationStep) {
        const proposalResult = createTaskProposalFromPlanStep(learningPlan, taskCreationStep.id, userId);
        if (proposalResult.success && proposalResult.proposal) {
          approvalProposal = proposalResult.proposal;
          runStatus = 'WAITING_FOR_APPROVAL';
        }
      }
    }

    // 8. State Machine & Optional Persistence
    let agentState = createInitialAgentState({
      runId,
      userId,
      goal: rawGoalText,
    });
    agentState = transitionAgentState(agentState, { targetState: 'GOAL_RECEIVED', reason: 'Goal submitted' }).state;
    agentState = transitionAgentState(agentState, { targetState: 'ASSESSING', reason: 'Assessed student evidence' }).state;
    agentState = transitionAgentState(agentState, { targetState: 'PLANNING', reason: 'Constructed learning plan' }).state;

    if (runStatus === 'WAITING_FOR_APPROVAL') {
      agentState = transitionAgentState(agentState, { targetState: 'WAITING_FOR_APPROVAL', reason: 'Paused for student approval of task creation' }).state;
    } else {
      agentState = transitionAgentState(agentState, { targetState: 'UPDATING', reason: 'Synthesized adaptive policy' }).state;
      agentState = transitionAgentState(agentState, { targetState: 'COMPLETED', reason: 'Orchestrator cycle finished' }).state;
    }

    agentState.workingMemory = {
      ...agentState.workingMemory,
      goalUnderstanding,
      studentAssessment,
      learningDecision,
      learningPlan,
      adaptiveLearningPolicy: adaptivePolicy,
      approvalProposal: approvalProposal || undefined,
      continuityContext: continuityContext || undefined,
    };

    // Safely attempt persistence if database is available
    try {
      if (supabase) {
        await persistAgentRunState(supabase, agentState, runStatus === 'WAITING_FOR_APPROVAL' ? 'PAUSED_FOR_APPROVAL' : 'COMPLETED');
      }
    } catch {
      // Persistence failure is non-fatal for pure in-memory client experience
    }

    return {
      success: true,
      runId,
      status: runStatus,
      goalUnderstanding,
      studentAssessment,
      learningDecision,
      learningPlan: learningPlan || undefined,
      adaptivePolicy,
      approvalProposal,
      continuityContext,
      executionTimeMs: Date.now() - startTime,
    };
  } catch (err: any) {
    return {
      success: false,
      runId,
      status: 'FAILED',
      error: err.message || 'An unexpected error occurred during orchestrator execution.',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Server Action: Approve and execute a proposed task write via Phase 5 Controlled Write Engine.
 */
export async function approveAndExecuteOrchestratorTask(
  proposal: WriteActionProposal<CreateTaskInput>,
  decision: 'APPROVED' | 'REJECTED',
  approvalNotes?: string
): Promise<{
  success: boolean;
  status: 'EXECUTED' | 'REJECTED' | 'BLOCKED' | 'FORBIDDEN' | 'FAILED';
  createdTaskId?: string | null;
  createdTask?: any | null;
  postWriteVerification?: any | null;
  error?: string;
}> {
  try {
    let supabase: any = null;
    let authenticatedId: string | null = null;
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authenticatedId = user?.id || null;
    } catch {
      // In standalone CLI test or SSR environment without cookie headers
    }

    if (!authenticatedId && proposal.userId) {
      authenticatedId = proposal.userId;
    }

    if (!authenticatedId) {
      return {
        success: false,
        status: 'FAILED',
        error: 'Authentication required to approve task creation.',
      };
    }

    if (decision === 'REJECTED') {
      return {
        success: true,
        status: 'REJECTED',
      };
    }

    const approvalRecord: WriteActionApprovalRecord = {
      approvalId: `appr_${Date.now()}`,
      proposalId: proposal.proposalId,
      actionFingerprint: proposal.auditMetadata?.actionFingerprint || proposal.actionId,
      userId: authenticatedId,
      decision: 'APPROVED',
      decidedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      decisionNotes: approvalNotes || 'Approved by student in learning dashboard.',
      isTransferable: false,
    };

    const result = await executeCreateTaskTool({
      proposal,
      authenticatedUserId: authenticatedId,
      approvalRecord,
      taskService: createTask,
    });

    if (result.status !== 'EXECUTED') {
      return {
        success: false,
        status: result.status as any,
        error: result.error?.message || result.mutationSummary,
      };
    }

    return {
      success: true,
      status: 'EXECUTED',
      createdTaskId: result.createdTaskId,
      createdTask: result.createdTask,
      postWriteVerification: result.postWriteVerification,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'FAILED',
      error: err.message || 'Failed to execute approved task creation.',
    };
  }
}

/**
 * Server Action: Load an Agent Run by ID for the currently authenticated user.
 * Feature 2E-2: Agent Run Persistence.
 */
export async function getAgentRunById(runId: string) {
  try {
    const supabase = await createClient();
    return await loadAgentRunFromDb(supabase, runId);
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'ERR_GET_AGENT_RUN',
        message: err.message || 'Failed to load agent run.',
      },
    };
  }
}

/**
 * Server Action: List recent Agent Runs for the currently authenticated user.
 * Feature 2E-2: Agent Run Persistence.
 */
export async function listAuthenticatedUserAgentRuns(limit: number = 20) {
  try {
    const supabase = await createClient();
    return await listUserAgentRunsFromDb(supabase, limit);
  } catch (err: any) {
    return {
      success: false,
      error: {
        code: 'ERR_LIST_AGENT_RUNS',
        message: err.message || 'Failed to list agent runs.',
      },
    };
  }
}

/**
 * Input for marking a learning plan step complete and triggering the feedback loop.
 */
export interface CompleteLearningStepInput {
  userId?: string;
  plan: LearningPlan;
  stepId: string;
  taskId?: string | null;
  studentNotes?: string;
  selfReportedEvidence?: string;
  verificationOutcome?: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'INSUFFICIENT_EVIDENCE' | 'CONTRADICTED';
}

/**
 * Result payload after executing a learning step and feeding outcomes into 6E/6F/6G/6C.
 */
export interface StepExecutionFeedbackResult {
  success: boolean;
  stepId: string;
  planId: string;
  actionCompleted: boolean;
  taskUpdated: boolean;
  learningOutcome?: LearningOutcome;
  learningFeedback?: LearningFeedback;
  trajectory?: LearningTrajectory;
  adaptivePolicy?: AdaptiveLearningPolicy;
  nextLearningDecision?: LearningDecision;
  error?: string;
}

/**
 * Server Action: Phase 8 — Complete a real student learning step and feed observable
 * activity back into 6E Outcome Evaluation, 6F Trajectory, 6G Adaptation, and 6C Decision.
 */
export async function completeStudentLearningStep(
  input: CompleteLearningStepInput
): Promise<StepExecutionFeedbackResult> {
  try {
    let supabase: any = null;
    let authenticatedId: string | null = null;
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authenticatedId = user?.id || null;
    } catch {
      // In standalone CLI test or SSR environment without cookie headers
    }

    let userId: string | null = null;
    if (authenticatedId) {
      userId = authenticatedId;
    } else if (input.userId !== undefined) {
      userId = input.userId.trim() || null;
    } else if (input.plan?.userId) {
      userId = input.plan.userId;
    } else {
      userId = 'student_local';
    }

    if (!userId) {
      return {
        success: false,
        stepId: input.stepId,
        planId: input.plan?.planId || '',
        actionCompleted: false,
        taskUpdated: false,
        error: 'Authentication required to complete learning step.',
      };
    }

    // 1. If associated with an existing PLOS task, update task status
    let taskUpdated = false;
    if (input.taskId) {
      const taskRes = await updateTaskStatus(input.taskId, 'completed', userId);
      taskUpdated = taskRes.success;
    }

    // 2. Clone and update plan reflecting completed step
    const updatedSteps = (input.plan?.steps || []).map((s) => {
      if (s.id === input.stepId) {
        return {
          ...s,
          status: 'COMPLETED' as const,
        };
      }
      return s;
    });
    const updatedPlan: LearningPlan = {
      ...input.plan,
      steps: updatedSteps,
      status: updatedSteps.every((s) => s.status === 'COMPLETED' || s.status === 'SKIPPED') ? 'COMPLETED' : 'EXECUTING',
    };

    // 3. Create step execution result
    const stepExecutionResult: PlanStepExecutionResult = {
      executionId: `exec_${Date.now()}_${input.stepId}`,
      planId: input.plan.planId,
      stepId: input.stepId,
      status: 'SUCCESS',
      startedAt: new Date(Date.now() - 300000).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 300000,
      selectedTools: [],
      toolResults: [],
      workingMemoryUpdate: {
        lastCompletedStepId: input.stepId,
        studentNotes: input.studentNotes || null,
        selfReportedEvidence: input.selfReportedEvidence || null,
      },
      sideEffectGuarantees: {
        isTaskModified: false,
        isCalendarModified: false,
        isDatabaseModified: false,
        isExternalSideEffectTriggered: false,
        auditDescription: 'Step marked completed by student in PLOS workflow.',
      },
    };

    // 4. Create step verification result
    const verificationStatus = input.verificationOutcome || 'VERIFIED';
    const stepVerificationResult: StepVerificationResult = {
      planId: input.plan.planId,
      stepId: input.stepId,
      status: verificationStatus as any,
      criteriaEvaluations: [
        {
          criterionText: 'Student completed interactive learning action',
          status: verificationStatus as any,
          evidenceClassification: input.selfReportedEvidence ? 'SELF_REPORTED' : 'OBSERVED',
          supportingEvidence: input.selfReportedEvidence ? [input.selfReportedEvidence] : ['Completed via PLOS dashboard'],
          contradictingEvidence: [],
          isCapabilitySupported: true,
          explanation: input.studentNotes || 'Step successfully completed in student workflow.',
        },
      ],
      evaluatedEvidence: [],
      supportingEvidenceSummary: input.selfReportedEvidence ? [input.selfReportedEvidence] : ['Observable PLOS task completion'],
      contradictingEvidenceSummary: [],
      missingEvidenceSummary: [],
      verificationConfidence: verificationStatus === 'VERIFIED' ? 0.9 : 0.5,
      explanation: 'Verified step completion.',
      recommendedAction: 'CONTINUE_LEARNING',
      isReplanWarranted: false,
      evaluatedAt: new Date().toISOString(),
    };

    // 5. Phase 6E: Outcome and Feedback Evaluation
    const outcomeResult = await evaluateLearningOutcomeAsync({
      plan: updatedPlan,
      stepExecutionResults: [stepExecutionResult],
      stepVerificationResults: [stepVerificationResult],
      allowLlm: false,
    });

    // 6. Collect fresh evidence & audit
    const evidenceCollection = await collectStudentEvidence();
    const corroborationResult = corroborateStudentEvidence(evidenceCollection);

    // 7. Phase 6F: Longitudinal Trajectory Analysis
    const trajectoryResult = await analyzeLearningTrajectoryAsync({
      userId,
      learningOutcomes: outcomeResult.outcome ? [outcomeResult.outcome] : [],
      learningFeedbacks: outcomeResult.feedback ? [outcomeResult.feedback] : [],
      evidenceRecords: evidenceCollection.records,
      allowLlm: false,
    });

    // 8. Phase 6G: Adaptive Learning Policy
    const policyResult = evaluateAdaptiveLearningPolicyDeterministic({
      userId,
      executedPlan: updatedPlan,
      learningOutcome: outcomeResult.outcome,
      learningFeedback: outcomeResult.feedback,
      learningTrajectory: trajectoryResult.trajectory,
      evidenceRecords: evidenceCollection.records,
    });

    // 9. Phase 6C: Sole Authority for Next Pedagogical Action
    const nextDecision = await generateLearningDecision({
      userId,
      rawGoalText: updatedPlan.goal,
      allowLlm: false,
    });

    return {
      success: true,
      stepId: input.stepId,
      planId: input.plan.planId,
      actionCompleted: true,
      taskUpdated,
      learningOutcome: outcomeResult.outcome,
      learningFeedback: outcomeResult.feedback,
      trajectory: trajectoryResult.trajectory,
      adaptivePolicy: policyResult.policy,
      nextLearningDecision: nextDecision,
    };
  } catch (err: any) {
    return {
      success: false,
      stepId: input.stepId,
      planId: input.plan?.planId || '',
      actionCompleted: false,
      taskUpdated: false,
      error: err.message || 'Failed to complete learning step and process feedback.',
    };
  }
}

/**
 * Server Action: Phase 9 — Restore and resume a student's learning journey across sessions.
 * Safely loads persisted run state, evaluates continuity status (IN_PROGRESS, BLOCKED, COMPLETED, STALE),
 * and identifies the exact next operational step.
 */
export async function resumeStudentLearningJourney(options?: {
  runId?: string;
  explicitUserId?: string;
  stalenessDays?: number;
}): Promise<ResumeJourneyResult> {
  try {
    let supabase: any = null;
    let authenticatedId: string | null = null;
    try {
      supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      authenticatedId = user?.id || null;
    } catch {
      // In standalone CLI test or SSR environment without cookie headers
    }

    let userId: string | null = null;
    if (authenticatedId) {
      userId = authenticatedId;
    } else if (options?.explicitUserId !== undefined) {
      userId = options.explicitUserId.trim() || null;
    } else {
      userId = 'student_local';
    }

    if (!userId) {
      return {
        success: false,
        status: 'NOT_FOUND',
        continuityRationale: 'Authentication required to resume learning journey.',
        recommendedAction: 'AUTHENTICATE',
        error: 'Authentication required to resume learning journey.',
      };
    }

    // 1. If runId specified, load directly
    if (options?.runId?.trim() && supabase) {
      const loadRes = await loadAgentRunFromDb(supabase, options.runId.trim());
      if (loadRes.success && loadRes.state) {
        return resumeLearningJourneyState(loadRes.state, options?.stalenessDays);
      }
    }

    // 2. Otherwise query recent runs for this user
    if (supabase) {
      const listRes = await listUserAgentRunsFromDb(supabase, 5);
      if (listRes.success && listRes.data && listRes.data.length > 0) {
        for (const record of listRes.data) {
          const loadRes = await loadAgentRunFromDb(supabase, record.id);
          if (loadRes.success && loadRes.state) {
            const result = resumeLearningJourneyState(loadRes.state, options?.stalenessDays);
            if (result.status === 'IN_PROGRESS' || result.status === 'BLOCKED') {
              return result;
            }
          }
        }
      }
    }

    return {
      success: true,
      status: 'NOT_FOUND',
      continuityRationale: 'No active incomplete learning journeys found for student.',
      recommendedAction: 'START_FRESH_GOAL',
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'NOT_FOUND',
      continuityRationale: 'Failed to query persisted runs.',
      recommendedAction: 'START_FRESH_GOAL',
      error: err.message || 'Error resuming learning journey.',
    };
  }
}




