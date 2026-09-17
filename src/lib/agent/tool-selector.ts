/**
 * Phase 3D: Deterministic Tool Selection for the SINGLE Learning Orchestrator.
 * 
 * Provides:
 * - Deterministic, rule-grounded selection of the minimal sufficient tool set for any goal or event.
 * - Dynamic discovery and capability lookup through the Phase 3A Tool Registry.
 * - Strict enforcement of READ_ONLY tool permission boundaries.
 * - Deduplication and deterministic ordering of tool selection items.
 * - Safe handling of ambiguous or minimal contexts.
 * 
 * NOTE: This module performs TOOL SELECTION ONLY. It does not execute any tools.
 */

import { AgentTriggerContext, GoalCategory, SystemEventType } from './intake-types';
import { AgentEvidenceContext } from './state-types';
import { AgentToolRegistry, agentToolRegistry } from './tool-registry';
import { ToolCategory } from './tool-types';

/**
 * A single tool recommended for execution in the current agent step.
 */
export interface ToolSelectionItem {
  toolName: string;
  reason: string;
  category: ToolCategory;
  priority: number; // 1 = highest priority, 2 = secondary, etc.
  input?: Record<string, unknown>;
}

/**
 * Structured, ordered output plan of selected tools.
 */
export interface ToolSelectionPlan {
  selectedTools: ToolSelectionItem[];
  totalSelected: number;
  rationale: string;
  isExecutionAllowed: boolean;
  rejectedTools?: Array<{ toolName: string; reason: string }>;
  generatedAt: string;
}

/**
 * Coding and technical skill keywords indicating external repository/coding telemetry relevance.
 */
const TECHNICAL_SKILL_KEYWORDS = [
  'python',
  'typescript',
  'javascript',
  'java',
  'c++',
  'cpp',
  'rust',
  'golang',
  'go',
  'sql',
  'algorithm',
  'algorithms',
  'dsa',
  'data structures',
  'leetcode',
  'github',
  'coding',
  'programming',
  'react',
  'nextjs',
  'node',
  'backend',
  'frontend',
  'database',
  'dbms',
];

/**
 * Checks whether a goal text or skill name refers to a coding/technical domain.
 */
function isTechnicalCodingContext(goalText: string, skillName?: string | null): boolean {
  const text = `${goalText} ${skillName || ''}`.toLowerCase();
  return TECHNICAL_SKILL_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Deterministically selects the minimal sufficient set of tools for a given trigger context.
 */
export function selectToolsForOrchestrator(
  triggerContext: AgentTriggerContext,
  evidenceContext?: AgentEvidenceContext,
  registry: AgentToolRegistry = agentToolRegistry
): ToolSelectionPlan {
  const selectedMap = new Map<string, ToolSelectionItem>();
  const rejectedTools: Array<{ toolName: string; reason: string }> = [];

  const goalText = (triggerContext.normalizedGoalText || '').toLowerCase();
  const category = triggerContext.goalCategory;
  const eventType = triggerContext.systemEventType;
  const targetSkill = triggerContext.targetSkillName;
  const isTechnical = isTechnicalCodingContext(goalText, targetSkill);

  // Helper to safely propose a tool
  const proposeTool = (
    name: string,
    reason: string,
    priority: number,
    input?: Record<string, unknown>
  ) => {
    const toolDef = registry.getTool(name);
    if (!toolDef) {
      rejectedTools.push({ toolName: name, reason: `Tool "${name}" is not registered in Tool Registry.` });
      return;
    }

    // Permission enforcement: ONLY READ_ONLY tools may be selected in Phase 3
    if (toolDef.permissionLevel !== 'READ_ONLY' || toolDef.operationType !== 'READ') {
      rejectedTools.push({
        toolName: name,
        reason: `Tool "${name}" has permission level "${toolDef.permissionLevel}". Write-capable tools cannot be selected in Phase 3.`,
      });
      return;
    }

    // Prevent duplicate entries while preserving highest priority
    if (selectedMap.has(name)) {
      const existing = selectedMap.get(name)!;
      if (priority < existing.priority) {
        selectedMap.set(name, {
          toolName: name,
          reason,
          category: toolDef.category,
          priority,
          input: input || existing.input,
        });
      }
      return;
    }

    selectedMap.set(name, {
      toolName: name,
      reason,
      category: toolDef.category,
      priority,
      input,
    });
  };

  let rationale = '';

  // ==========================================================================
  // Rule 1: System Events
  // ==========================================================================
  if (triggerContext.triggerType === 'SYSTEM_EVENT') {
    switch (eventType) {
      case 'SCHEDULED_AUDIT_TICK':
      case 'ASSESSMENT_RESULT_CHANGED':
        rationale = 'Scheduled corroboration audit requiring multi-source evidence inspection.';
        proposeTool('get_skills', 'Inspect current skill claims and proficiencies', 1, targetSkill ? { category: targetSkill } : undefined);
        proposeTool('get_projects', 'Inspect relevant practical project evidence', 2);
        proposeTool('get_github_activity', 'Verify external commit telemetry', 3, { limit: 20 });
        proposeTool('get_leetcode_activity', 'Verify external problem-solving telemetry', 4, { limit: 20 });
        proposeTool('get_mistakes', 'Verify recorded conceptual mistakes and penalties', 5, { limit: 10 });
        break;

      case 'MISSED_TASK':
      case 'MISSED_STUDY_SESSION':
      case 'APPROACHING_DEADLINE':
        rationale = 'Reactive schedule anomaly requiring task status and focus session review.';
        proposeTool('get_tasks', 'Inspect status and deadlines of pending tasks', 1, { status: 'todo' });
        proposeTool('get_time_sessions', 'Inspect recent focus time allocation and study cadence', 2, { limit: 10 });
        break;

      case 'GITHUB_ACTIVITY_CHANGE':
        rationale = 'External GitHub activity event requiring repository and commit log verification.';
        proposeTool('get_github_activity', 'Fetch latest synced GitHub commit and PR activity', 1, { limit: 15 });
        proposeTool('get_skills', 'Evaluate if updated repository activity impacts tracked skills', 2);
        break;

      case 'LEETCODE_SUBMISSION_EVENT':
        rationale = 'External LeetCode submission event requiring DSA stats and submission verification.';
        proposeTool('get_leetcode_activity', 'Fetch latest synced LeetCode submissions and streaks', 1, { limit: 15 });
        proposeTool('get_skills', 'Evaluate algorithm and problem solving skill proficiencies', 2, { category: 'Algorithms' });
        break;

      default:
        rationale = 'Generic system event; inspecting student profile and task state.';
        proposeTool('get_student_profile', 'Review student profile and baseline context', 1);
        proposeTool('get_tasks', 'Inspect pending student tasks', 2);
        break;
    }
  }

  // ==========================================================================
  // Rule 2: Student Goals
  // ==========================================================================
  else {
    switch (category) {
      case 'EXAM_PREPARATION':
        rationale = 'Exam preparation goal requiring syllabus proficiency, mistake review, and study tasks.';
        proposeTool(
          'get_skills',
          'Inspect syllabus competencies and proficiency gaps for the target exam',
          1,
          targetSkill ? { category: targetSkill } : undefined
        );
        proposeTool(
          'get_mistakes',
          'Inspect past mistakes and conceptual weaknesses related to exam topics',
          2,
          targetSkill ? { category: targetSkill, limit: 10 } : { limit: 10 }
        );
        proposeTool(
          'get_tasks',
          'Inspect pending study tasks, revision milestones, and upcoming due dates',
          3,
          { limit: 20 }
        );
        break;

      case 'SKILL_IMPROVEMENT':
      case 'REMEDIAL_PRACTICE':
        rationale = 'Skill improvement goal requiring baseline proficiency, applied projects, and mistake logs.';
        proposeTool(
          'get_skills',
          'Retrieve current and target proficiency levels for the requested skill',
          1,
          targetSkill ? { category: targetSkill } : undefined
        );
        proposeTool(
          'get_projects',
          'Review practical projects utilizing or building the target skill',
          2
        );
        proposeTool(
          'get_mistakes',
          'Review recorded mistakes to identify focus areas for improvement',
          3,
          targetSkill ? { category: targetSkill, limit: 10 } : { limit: 10 }
        );

        // Include technical external sources only if skill is technical
        if (isTechnical) {
          proposeTool(
            'get_github_activity',
            'Inspect practical code contributions for technical skill verification',
            4,
            { limit: 15 }
          );
          proposeTool(
            'get_leetcode_activity',
            'Inspect algorithmic problem solving stats if relevant to skill',
            5,
            { limit: 15 }
          );
        }
        break;

      case 'SCHEDULE_PLANNING':
        rationale = 'Schedule and deadline planning goal requiring pending tasks, focus history, and student availability.';
        proposeTool(
          'get_tasks',
          'Retrieve all pending and in-progress learning tasks with deadlines',
          1
        );
        proposeTool(
          'get_time_sessions',
          'Inspect historical focus time and study duration patterns',
          2,
          { limit: 20 }
        );
        proposeTool(
          'get_student_profile',
          'Review target roles and academic availability to align schedule',
          3
        );
        break;

      case 'CORROBORATION_AUDIT':
        rationale = 'Student-requested corroboration audit requiring comprehensive evidence inspection.';
        proposeTool('get_skills', 'Inspect claimed skills and baseline ratings', 1);
        proposeTool('get_projects', 'Inspect student projects supporting claims', 2);
        proposeTool('get_github_activity', 'Verify external GitHub commit history', 3, { limit: 20 });
        proposeTool('get_leetcode_activity', 'Verify external LeetCode problem solving telemetry', 4, { limit: 20 });
        proposeTool('get_mistakes', 'Inspect logged mistakes for contradiction penalties', 5, { limit: 15 });
        break;

      case 'GENERAL_LEARNING':
      default:
        // Handle specific keywords in general learning or unclassified goals
        if (goalText.includes('exam') || goalText.includes('test') || goalText.includes('quiz')) {
          rationale = 'Exam-related goal detected; selecting syllabus skills, mistakes, and tasks.';
          proposeTool('get_skills', 'Inspect skills relevant to exam preparation', 1, targetSkill ? { category: targetSkill } : undefined);
          proposeTool('get_mistakes', 'Review mistakes in preparation for exam', 2, { limit: 10 });
          proposeTool('get_tasks', 'Check upcoming study milestones', 3);
        } else if (goalText.includes('plan') || goalText.includes('schedule') || goalText.includes('week')) {
          rationale = 'Schedule/planning keywords detected; selecting tasks, time sessions, and profile.';
          proposeTool('get_tasks', 'Retrieve tasks for schedule planning', 1);
          proposeTool('get_time_sessions', 'Analyze focus time capacity', 2, { limit: 20 });
          proposeTool('get_student_profile', 'Review student profile constraints', 3);
        } else if (targetSkill || isTechnical) {
          rationale = 'Technical skill learning goal detected; selecting skills, projects, and telemetry.';
          proposeTool('get_skills', 'Inspect baseline skill proficiencies', 1, targetSkill ? { category: targetSkill } : undefined);
          proposeTool('get_projects', 'Inspect active projects related to skill', 2);
          proposeTool('get_mistakes', 'Review logged conceptual errors', 3, { limit: 10 });
        } else {
          // Minimal fallback for empty or completely ambiguous goals
          rationale = 'Ambiguous/general goal; selecting student profile and tasks for foundational context.';
          proposeTool('get_student_profile', 'Inspect student profile to ground general inquiry', 1);
          proposeTool('get_tasks', 'Inspect active tasks for immediate learning context', 2, { limit: 10 });
        }
        break;
    }
  }

  // Sort selected tools by deterministic priority order (1, 2, 3...)
  const selectedTools = Array.from(selectedMap.values()).sort((a, b) => a.priority - b.priority);

  return {
    selectedTools,
    totalSelected: selectedTools.length,
    rationale,
    isExecutionAllowed: true, // All selected tools are verified READ_ONLY
    rejectedTools: rejectedTools.length > 0 ? rejectedTools : undefined,
    generatedAt: new Date().toISOString(),
  };
}
