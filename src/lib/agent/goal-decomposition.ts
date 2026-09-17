/**
 * Phase 4B: Deterministic Goal Decomposition Engine for the SINGLE Learning Orchestrator.
 * 
 * Provides:
 * - Deterministic conversion of validated AgentTriggerContext + assessment context into structured objectives & PlanSteps.
 * - Semantic ambiguity detection (NEEDS_CLARIFICATION) for underspecified or vague goals.
 * - Evidence gap and contradiction grounding from Phase 1 assessment telemetry.
 * - Strict preservation of original student goal text, timeframe hints, and target skills.
 * - Zero external LLM calls; zero tool mutations; zero fabricated student facts.
 * - Full Phase 4A LearningPlan contract compatibility with verified DAG dependencies.
 */

import {
  AgentTriggerContext,
  GoalCategory,
} from './intake-types';
import {
  LearningPlan,
  PlanStep,
  PlanPriority,
  PlanApprovalRequirement,
  DecisionReadyAssessmentSummary,
} from './planning-types';
import {
  createLearningPlan,
  validatePlanDependencies,
} from './planning-model';
import {
  StudentCorroborationAuditResult,
  CorroborationResult,
  StudentSkillAssessment,
} from './types';
import {
  DecomposeGoalInput,
  GoalDecompositionResult,
  DecomposedGoalResult,
  NeedsClarificationResult,
  GoalClarificationDimension,
} from './decomposition-types';

/**
 * Stop-words and generic verbs that convey no specific domain, subject, or scope.
 */
const VAGUE_GOAL_TERMS = new Set([
  'help',
  'learn',
  'study',
  'practice',
  'test',
  'exam',
  'pass',
  'do',
  'work',
  'start',
  'improve',
  'master',
  'prepare',
  'read',
  'plan',
  'code',
  'programming',
  'something',
  'stuff',
  'things',
  'everything',
  'anything',
]);

/**
 * Checks if a goal is too vague, generic, or underspecified to safely decompose.
 */
export function detectGoalAmbiguity(
  normalizedGoal: string,
  targetSkillName?: string | null,
  category?: GoalCategory
): { isVague: boolean; missingDimensions: GoalClarificationDimension[]; reason?: string; prompt?: string } {
  const text = normalizedGoal.trim().toLowerCase();
  const words = text.split(/[\s,.-]+/).filter((w) => w.length > 0);

  // 1. Extreme brevity / single-token check without explicit skill
  if (!targetSkillName) {
    if (text.length < 6 || words.length <= 1) {
      return {
        isVague: true,
        missingDimensions: ['TARGET_SKILL', 'GOAL_SCOPE'],
        reason: 'Goal statement is too brief or contains only a single token without specifying a clear learning domain or actionable scope.',
        prompt: 'Please specify the subject, skill, or exam you want to focus on (e.g., "Master Database Normalization in DBMS" or "Prepare for Python Exam in 7 days").',
      };
    }
  }

  // 2. Tokenize and filter stop words
  const meaningfulWords = words.filter((w) => !VAGUE_GOAL_TERMS.has(w) && w.length > 2);

  // If no target skill is provided and all words are generic/vague terms or insufficient specificity
  if (!targetSkillName) {
    if (meaningfulWords.length === 0) {
      return {
        isVague: true,
        missingDimensions: ['TARGET_SKILL', 'GOAL_SCOPE'],
        reason: 'Goal consists entirely of generic actions without specifying a subject, skill, or concrete outcome.',
        prompt: 'What specific topic, skill, or exam would you like to plan for? (e.g., "Learn TypeScript Generics" or "Review SQL Mistakes").',
      };
    }

    if (meaningfulWords.length === 1 && words.length <= 2 && text.length < 12) {
      return {
        isVague: true,
        missingDimensions: ['TARGET_SKILL', 'GOAL_SCOPE'],
        reason: 'Goal contains insufficient detail to formulate actionable milestones.',
        prompt: 'Please provide more details on what you would like to accomplish (e.g., "Study Binary Trees in DSA").',
      };
    }
  }

  // 3. Ultra-generic phrases like "help me study", "i want to learn", "do some practice"
  const genericPhrases = [
    'help me',
    'help me study',
    'help me learn',
    'i want to learn',
    'i want to study',
    'teach me',
    'do some work',
    'do something',
    'learn stuff',
    'study stuff',
    'practice stuff',
  ];

  if (!targetSkillName && genericPhrases.includes(text)) {
    return {
      isVague: true,
      missingDimensions: ['TARGET_SKILL', 'GOAL_SCOPE'],
      reason: 'The goal is a generic open-ended request with no defined learning topic.',
      prompt: 'Please tell me which skill or topic you would like to work on.',
    };
  }

  return {
    isVague: false,
    missingDimensions: [],
  };
}

/**
 * Extracts relevant assessed skills from the assessment context.
 */
function extractSkillAssessments(
  assessmentContext?: DecisionReadyAssessmentSummary | StudentCorroborationAuditResult | CorroborationResult | null,
  targetSkill?: string | null
): StudentSkillAssessment[] {
  if (!assessmentContext) return [];

  // Check for full StudentCorroborationAuditResult
  if ('skillsEvaluated' in assessmentContext && Array.isArray(assessmentContext.skillsEvaluated)) {
    const skills = assessmentContext.skillsEvaluated as StudentSkillAssessment[];
    if (targetSkill) {
      const matched = skills.filter(
        (s) => s.skillName.toLowerCase() === targetSkill.toLowerCase()
      );
      return matched.length > 0 ? matched : skills;
    }
    return skills;
  }

  return [];
}

/**
 * Generates category-specific objectives, candidate steps, constraints, and criteria.
 */
function generateCategoryDecomposition(
  category: GoalCategory,
  goalText: string,
  targetSkill: string | null,
  timeframeHint: string | null,
  priority: PlanPriority,
  assessmentSkills: StudentSkillAssessment[],
  timestamp: string
) {
  const domainLabel = targetSkill ? targetSkill : 'the target subject';
  const objectives: string[] = [];
  const candidateSteps: PlanStep[] = [];
  const constraints: string[] = [];
  const successCriteria: string[] = [];
  const verificationCriteria: string[] = [];
  const prerequisites: string[] = [];

  // Timeframe constraint if explicitly provided
  if (timeframeHint) {
    constraints.push(`Target timeframe: ${timeframeHint}`);
  }

  // Look for contradictions or missing evidence in assessment
  const matchedSkill = assessmentSkills.find(
    (s) => targetSkill && s.skillName.toLowerCase() === targetSkill.toLowerCase()
  );
  const contradictions = matchedSkill?.contradictions || [];
  const missingRequirements = matchedSkill?.missingEvidence || [];

  switch (category) {
    case 'EXAM_PREPARATION': {
      objectives.push(
        `Systematic review of core syllabus domains and theoretical principles for ${domainLabel}`,
        `High-yield deliberate practice addressing unverified areas and recurring mistakes in ${domainLabel}`,
        `Timed diagnostic simulation to verify exam readiness under simulated conditions`
      );

      constraints.push('Prioritize high-weight exam topics and high-frequency mistake patterns');
      successCriteria.push(
        `Achieve >= 85% accuracy on ${domainLabel} diagnostic review`,
        `Complete all structured practice sets prior to target exam deadline`
      );
      verificationCriteria.push(
        `Empirical focus session telemetry and task completions verified in database`,
        `Focus study sessions logged with total duration verified`
      );
      prerequisites.push(`Basic prerequisite familiarity with ${domainLabel} curriculum`);

      // Candidate Step 1: Syllabus & Theory Audit
      candidateSteps.push({
        id: 'step-exam-syllabus-audit',
        planId: '',
        order: 1,
        title: `Audit ${domainLabel} Syllabus & Theory Foundations`,
        description: `Review curriculum outline, skill proficiencies, and core focus areas for ${domainLabel}.`,
        rationale: 'Solid theoretical understanding is required before engaging in high-yield problem solving.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_skills', 'get_student_profile'],
        constraints: ['Keep initial review focused on key principles'],
        successCriteria: [`Core concept proficiencies for ${domainLabel} reviewed`],
        verificationCriteria: [`Focus session telemetry record logged in time tracking`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      // Candidate Step 2: Targeted Remedial & Practice Drills
      const hasContradictions = contradictions.length > 0;
      const step2Rationale = hasContradictions
        ? `Resolve ${contradictions.length} identified contradiction(s) and mistake patterns in ${domainLabel}.`
        : `Strengthen procedural problem solving in ${domainLabel} through structured practice.`;

      candidateSteps.push({
        id: 'step-exam-remedial-drills',
        planId: '',
        order: 2,
        title: `Targeted Problem Solving & Remediation for ${domainLabel}`,
        description: hasContradictions
          ? `Solve focused practice problems specifically targeting logged mistake patterns: ${contradictions.map((c) => c.reason).slice(0, 2).join('; ')}.`
          : `Solve progressive practice problems covering standard exam question patterns for ${domainLabel}.`,
        rationale: step2Rationale,
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-exam-syllabus-audit'],
        prerequisites: [`Completion of ${domainLabel} syllabus audit`],
        targetSkill: targetSkill,
        requiredTools: ['get_mistakes', 'get_tasks'],
        constraints: ['Emphasize accuracy and root cause understanding over speed'],
        successCriteria: [`Complete targeted practice set for ${domainLabel}`],
        verificationCriteria: [`Practice task completions logged with verified timestamp`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      // Candidate Step 3: Timed Mock Evaluation
      candidateSteps.push({
        id: 'step-exam-mock-simulation',
        planId: '',
        order: 3,
        title: `Timed Diagnostic Simulation for ${domainLabel}`,
        description: `Complete a comprehensive timed diagnostic assessment simulating real exam conditions.`,
        rationale: 'Timed diagnostic testing evaluates retrieval speed, stress resilience, and authentic mastery.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-exam-remedial-drills'],
        prerequisites: [`Targeted practice problem completion`],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_time_sessions'],
        constraints: ['Strict time limit per question block'],
        successCriteria: [`Diagnostic simulation submitted with >= 80% score`],
        verificationCriteria: [`Diagnostic practice task completion and focus duration verified in database`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }

    case 'SKILL_IMPROVEMENT': {
      objectives.push(
        `Theoretical comprehension and concept mapping of ${domainLabel}`,
        `Deliberate hands-on practice resolving knowledge gaps in ${domainLabel}`,
        `Practical application and empirical mastery verification for ${domainLabel}`
      );

      constraints.push('Ensure each milestone produces observable evidence');
      successCriteria.push(
        `Demonstrate verified competency in ${domainLabel} with zero contradictory evidence`,
        `Successfully complete hands-on exercise milestone`
      );
      verificationCriteria.push(
        `Empirical evidence records logged from verified telemetry or task completions`,
        `Skill confidence level upgraded to MODERATE or HIGH`
      );
      prerequisites.push(`Foundational baseline knowledge for ${domainLabel}`);

      // Step 1: Concept Exploration
      candidateSteps.push({
        id: 'step-concept-foundations',
        planId: '',
        order: 1,
        title: `Study Foundations & Architecture of ${domainLabel}`,
        description: `Review tracked skill proficiencies and key operational mechanisms for ${domainLabel}.`,
        rationale: 'Concept clarity prevents procedural misconceptions and recurring errors.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_skills', 'get_student_profile'],
        constraints: [],
        successCriteria: [`Foundational concepts of ${domainLabel} mapped`],
        verificationCriteria: [`Focus session record created with verified duration`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      // Step 2: Deliberate Hands-on Practice
      const missingEvidenceNote = missingRequirements.length > 0
        ? ` Target missing evidence requirements: ${missingRequirements.map((m) => m.description).slice(0, 2).join('; ')}.`
        : '';

      candidateSteps.push({
        id: 'step-deliberate-practice',
        planId: '',
        order: 2,
        title: `Deliberate Practice & Exercise Drills for ${domainLabel}`,
        description: `Complete targeted implementation exercises and problem sets for ${domainLabel}.${missingEvidenceNote}`,
        rationale: 'Active procedural practice anchors theoretical knowledge into durable long-term retention.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-concept-foundations'],
        prerequisites: [`Foundations of ${domainLabel}`],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_mistakes'],
        constraints: [],
        successCriteria: [`Exercise milestone completed with verified outputs`],
        verificationCriteria: [`Task completion records logged with non-empty payload`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      // Step 3: Synthesis & Empirical Verification
      candidateSteps.push({
        id: 'step-applied-synthesis',
        planId: '',
        order: 3,
        title: `Applied Synthesis & Verification for ${domainLabel}`,
        description: `Build a small working artifact, code commit, or pass a structured verification check for ${domainLabel}.`,
        rationale: 'Empirically verifiable artifacts provide tamper-resistant proof of mastery.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-deliberate-practice'],
        prerequisites: [`Deliberate practice exercises completed`],
        targetSkill: targetSkill,
        requiredTools: ['get_projects', 'get_skills'],
        constraints: [],
        successCriteria: [`Synthesized artifact or verification test completed successfully`],
        verificationCriteria: [`External telemetry (commit, submission, or quiz) corroborated`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }

    case 'CORROBORATION_AUDIT': {
      objectives.push(
        `Collect empirical telemetry records across connected data sources for ${domainLabel}`,
        `Corroborate claimed proficiencies against observed and externally verified evidence`,
        `Generate calibrated epistemic confidence assessment audit report`
      );

      constraints.push('Read-only inspection only; zero state mutations');
      successCriteria.push(
        `Complete audit of all claimed vs demonstrated skills`,
        `Identify all unverified claims, contradictions, and evidence freshness gaps`
      );
      verificationCriteria.push(
        `Deterministic StudentCorroborationAuditResult generated with overallGroundTruthScore`
      );

      candidateSteps.push({
        id: 'step-audit-telemetry-collection',
        planId: '',
        order: 1,
        title: `Collect Ground-Truth Evidence for ${domainLabel}`,
        description: `Aggregate empirical records from GitHub, LeetCode, focus time, tasks, and mistake logs.`,
        rationale: 'Ground-truth evidence collection is the mandatory pre-condition for epistemic audit.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_student_profile', 'get_skills', 'get_tasks', 'get_time_sessions'],
        constraints: ['Strict read-only operation'],
        successCriteria: ['Telemetry evidence collected across all connected sources'],
        verificationCriteria: ['Evidence collection result object populated with non-zero records'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-audit-corroboration-analysis',
        planId: '',
        order: 2,
        title: `Corroborate Evidence & Detect Contradictions`,
        description: `Evaluate collected records against student skill claims, classifying polarity and epistemics.`,
        rationale: 'Detecting contradictions separates unsubstantiated self-reports from verified capabilities.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-audit-telemetry-collection'],
        prerequisites: ['Evidence collection completed'],
        targetSkill: targetSkill,
        requiredTools: ['get_mistakes', 'get_skills'],
        constraints: [],
        successCriteria: ['Corroboration evaluation matrix generated'],
        verificationCriteria: ['CorroborationResult structured with contradiction summary'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-audit-report-generation',
        planId: '',
        order: 3,
        title: `Synthesize Calibrated Confidence Audit Report`,
        description: `Calculate mathematical confidence scores, freshness decays, and compile decision-ready audit.`,
        rationale: 'Provides transparent, audit-ready diagnostic reporting to the student.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-audit-corroboration-analysis'],
        prerequisites: ['Corroboration analysis completed'],
        targetSkill: targetSkill,
        requiredTools: ['get_skills'],
        constraints: [],
        successCriteria: ['Final StudentCorroborationAuditResult emitted'],
        verificationCriteria: ['DecisionReadyAssessmentSummary attached to agent state'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }

    case 'REMEDIAL_PRACTICE': {
      objectives.push(
        `Analyze mistake logs and isolate recurring error mechanisms for ${domainLabel}`,
        `Execute targeted remediation drills on identified misconceptions`,
        `Verify elimination of error patterns via structured verification`
      );

      constraints.push('Focus exclusively on high-frequency and severe mistake classifications');
      successCriteria.push(
        `Resolve all identified recurring mistake patterns in ${domainLabel}`,
        `Achieve 100% error-free execution on verification drills`
      );
      verificationCriteria.push(
        `Mistake log status transitioned and zero new errors logged during verification test`
      );

      candidateSteps.push({
        id: 'step-mistake-root-cause-analysis',
        planId: '',
        order: 1,
        title: `Analyze Mistake Logs & Root Causes for ${domainLabel}`,
        description: `Inspect logged errors, misconception categories, and failed problem contexts for ${domainLabel}.`,
        rationale: 'Accurate root cause classification ensures remediation addresses the fundamental conceptual defect.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_mistakes', 'get_skills'],
        constraints: [],
        successCriteria: [`Mistake patterns for ${domainLabel} categorized`],
        verificationCriteria: [`Mistake log audit retrieved with non-empty results`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-remedial-targeted-practice',
        planId: '',
        order: 2,
        title: `Execute Targeted Remedial Drills for ${domainLabel}`,
        description: `Practice custom exercises engineered to counteract identified misconception patterns.`,
        rationale: 'Counter-example drills replace flawed heuristics with correct mental models.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-mistake-root-cause-analysis'],
        prerequisites: ['Root cause analysis completed'],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_mistakes'],
        constraints: [],
        successCriteria: [`Remedial practice batch completed`],
        verificationCriteria: [`Completed remedial exercise tasks recorded`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-remedial-verification-quiz',
        planId: '',
        order: 3,
        title: `Verify Error Elimination for ${domainLabel}`,
        description: `Complete a diagnostic check containing edge cases related to the original mistakes.`,
        rationale: 'Confirms that the student has overcome the specific error pattern under test conditions.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-remedial-targeted-practice'],
        prerequisites: ['Remedial practice batch completed'],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_mistakes'],
        constraints: [],
        successCriteria: [`Diagnostic check completed with 0 recurring errors`],
        verificationCriteria: [`Verification practice task completed with zero recurring errors logged`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }

    case 'SCHEDULE_PLANNING': {
      objectives.push(
        `Audit active deadlines, open milestones, and study time history for ${domainLabel}`,
        `Structure prioritized learning blocks and focus sessions aligned with student goals`
      );

      constraints.push('Respect maximum daily study capacity');
      successCriteria.push(
        `Generate realistic, conflict-free study schedule`,
        `Align planned focus blocks with high-priority exam or skill milestones`
      );
      verificationCriteria.push(
        `Study schedule proposal formulated with clear daily milestones`
      );

      candidateSteps.push({
        id: 'step-schedule-telemetry-audit',
        planId: '',
        order: 1,
        title: `Audit Open Tasks & Time Allocation Trends`,
        description: `Inspect pending tasks, approaching exam dates, and recent focus session durations.`,
        rationale: 'Scheduling must be grounded in empirical capacity and actual pending obligations.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_time_sessions'],
        constraints: [],
        successCriteria: ['Open tasks and time trends retrieved'],
        verificationCriteria: ['Task and time session records loaded'],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-study-block-allocation',
        planId: '',
        order: 2,
        title: `Structure Prioritized Study Blocks for ${domainLabel}`,
        description: `Formulate dedicated study sessions prioritized by deadline urgency and skill importance.`,
        rationale: 'Time blocking creates structured accountability and reduces decision fatigue.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-schedule-telemetry-audit'],
        prerequisites: ['Telemetry audit completed'],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks'],
        constraints: [],
        successCriteria: ['Prioritized study schedule structured'],
        verificationCriteria: ['Schedule plan validated against constraints'],
        requiresApproval: true,
        approvalRiskLevel: 'MEDIUM',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }

    case 'GENERAL_LEARNING':
    default: {
      objectives.push(
        `Explore and map foundational concepts for ${domainLabel}`,
        `Apply core principles through structured exercises and problem solving`,
        `Verify learning retention and synthesis with empirical checks`
      );

      constraints.push('Maintain progressive concept difficulty');
      successCriteria.push(`Demonstrate measurable proficiency in ${domainLabel}`);
      verificationCriteria.push(`Completed milestone evidence recorded in telemetry logs`);

      candidateSteps.push({
        id: 'step-general-exploration',
        planId: '',
        order: 1,
        title: `Explore Concepts & Resources for ${domainLabel}`,
        description: `Review skill proficiencies, target domains, and conceptual foundations for ${domainLabel}.`,
        rationale: 'Initial concept exploration establishes the necessary mental framework.',
        priority: priority,
        status: 'READY',
        dependencies: [],
        prerequisites: [],
        targetSkill: targetSkill,
        requiredTools: ['get_skills', 'get_student_profile'],
        constraints: [],
        successCriteria: [`Core materials for ${domainLabel} reviewed`],
        verificationCriteria: [`Study session telemetry logged`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-general-practice',
        planId: '',
        order: 2,
        title: `Hands-on Practice & Exercises for ${domainLabel}`,
        description: `Solve practical problems and exercises to apply concepts of ${domainLabel}.`,
        rationale: 'Practical application converts abstract knowledge into operational competence.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-general-exploration'],
        prerequisites: [`Exploration of ${domainLabel} completed`],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks'],
        constraints: [],
        successCriteria: [`Practice tasks completed`],
        verificationCriteria: [`Task completion records logged`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      candidateSteps.push({
        id: 'step-general-verification',
        planId: '',
        order: 3,
        title: `Synthesis & Knowledge Verification for ${domainLabel}`,
        description: `Complete a synthesis review or diagnostic check to verify mastery of ${domainLabel}.`,
        rationale: 'Verification ensures long-term retention before concluding the learning cycle.',
        priority: priority,
        status: 'PENDING',
        dependencies: ['step-general-practice'],
        prerequisites: [`Practice tasks completed`],
        targetSkill: targetSkill,
        requiredTools: ['get_tasks', 'get_skills'],
        constraints: [],
        successCriteria: [`Synthesis review completed successfully`],
        verificationCriteria: [`Synthesis practice task completion recorded in database`],
        requiresApproval: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      break;
    }
  }

  return {
    objectives,
    candidateSteps,
    constraints,
    successCriteria,
    verificationCriteria,
    prerequisites,
  };
}

/**
 * Deterministically decomposes a validated AgentTriggerContext into a structured
 * set of objectives and candidate PlanSteps compatible with Phase 4A LearningPlan.
 */
export function decomposeStudentGoal(input: DecomposeGoalInput): GoalDecompositionResult {
  const { triggerContext, assessmentContext } = input;
  const timestamp = input.timestamp || new Date().toISOString();

  // 1. Validate Input Presence
  if (!triggerContext || !triggerContext.normalizedGoalText) {
    return {
      status: 'REJECTED',
      originalGoal: triggerContext?.normalizedGoalText || '',
      code: 'ERR_EMPTY_TRIGGER_CONTEXT',
      reason: 'Trigger context or normalized goal text is missing.',
      generatedAt: timestamp,
    };
  }

  const goalText = triggerContext.normalizedGoalText.trim();
  const targetSkill = triggerContext.targetSkillName ?? input.goalUnderstanding?.targetSkill ?? null;
  const timeframeHint = triggerContext.timeframeHint ?? input.goalUnderstanding?.timeframe ?? null;
  const category: GoalCategory = triggerContext.goalCategory || input.goalUnderstanding?.category || 'GENERAL_LEARNING';
  const priority: PlanPriority = triggerContext.priority || 'MEDIUM';

  // 2. Ambiguity & Vagueness Detection
  const ambiguity = detectGoalAmbiguity(goalText, targetSkill, category);
  if (ambiguity.isVague) {
    return {
      status: 'NEEDS_CLARIFICATION',
      originalGoal: goalText,
      reason: ambiguity.reason || 'Goal statement is too vague or ambiguous to decompose.',
      clarificationPrompt: ambiguity.prompt || 'Please provide more details about your specific goal.',
      missingDimensions: ambiguity.missingDimensions,
      suggestedClarifications: [
        'Specify the subject or skill (e.g., DBMS, Python, TypeScript)',
        'Mention the timeframe or target deadline (e.g., in 7 days, this week)',
        'Clarify the specific topic or problem area (e.g., Normalization, Graph Algorithms)',
      ],
      generatedAt: timestamp,
    };
  }

  // 3. Extract relevant assessment context if available
  const assessedSkills = extractSkillAssessments(assessmentContext, targetSkill);

  // 4. Generate Deterministic Category Decomposition
  const decomp = generateCategoryDecomposition(
    category,
    goalText,
    targetSkill,
    timeframeHint,
    priority,
    assessedSkills,
    timestamp
  );

  // 5. Determine Human Approval Requirement
  const isHighRiskCategory = category === 'SCHEDULE_PLANNING' || priority === 'URGENT';
  const approvalRequirement: PlanApprovalRequirement = {
    requiresApproval: isHighRiskCategory,
    riskLevel: isHighRiskCategory ? 'MEDIUM' : null,
    reason: isHighRiskCategory
      ? 'Plan alters student scheduling milestones or has URGENT priority.'
      : null,
    approvalRequestId: null,
    isApproved: null,
    approvedAt: null,
    approvedBy: null,
  };

  // 6. Assemble candidate LearningPlan and validate with Phase 4A Validator
  const planId = input.planId || `plan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const planResult = createLearningPlan({
    planId,
    userId: triggerContext.userId,
    goal: goalText,
    objectives: decomp.objectives,
    steps: decomp.candidateSteps.map((s) => ({
      ...s,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
    priority: priority,
    status: 'READY',
    constraints: decomp.constraints,
    successCriteria: decomp.successCriteria,
    verificationCriteria: decomp.verificationCriteria,
    approvalRequirement: approvalRequirement,
    triggerContext: triggerContext,
    decisionReadyAssessment: assessmentContext,
    targetSkill: targetSkill,
    estimatedEffort: null, // Strictly preserved as null without fabrication
    prerequisites: decomp.prerequisites,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    metadata: {
      decomposedAt: timestamp,
      category: category,
      timeframeHint: timeframeHint,
    },
  });

  if (!planResult.isValid || !planResult.plan) {
    return {
      status: 'REJECTED',
      originalGoal: goalText,
      code: 'ERR_PLAN_VALIDATION_FAILED',
      reason: `Decomposed plan failed validation: ${planResult.errors.map((e) => e.message).join('; ')}`,
      generatedAt: timestamp,
    };
  }

  // 7. Verify DAG Cycle Safety
  const depCheck = validatePlanDependencies(planResult.plan.steps);
  if (!depCheck.isValid || depCheck.hasCycles) {
    return {
      status: 'REJECTED',
      originalGoal: goalText,
      code: 'ERR_CIRCULAR_DEPENDENCY_DETECTED',
      reason: `Decomposed steps contain invalid dependencies: ${depCheck.errors.join('; ')}`,
      generatedAt: timestamp,
    };
  }

  const rationale = `Deterministically decomposed goal under "${category}" category into ${decomp.objectives.length} objectives and ${decomp.candidateSteps.length} candidate steps with verified DAG dependencies.`;

  return {
    status: 'DECOMPOSED',
    goal: goalText,
    category,
    targetSkill,
    timeframeHint,
    priority,
    objectives: decomp.objectives,
    candidateSteps: planResult.plan.steps,
    constraints: decomp.constraints,
    successCriteria: decomp.successCriteria,
    verificationCriteria: decomp.verificationCriteria,
    prerequisites: decomp.prerequisites,
    approvalRequirement,
    candidatePlan: planResult.plan,
    decompositionRationale: rationale,
    generatedAt: timestamp,
    metadata: {
      executionTiers: depCheck.executionTiers,
      assessedSkillsCount: assessedSkills.length,
    },
  };
}
