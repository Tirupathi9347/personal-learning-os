/**
 * Phase 3B & 3C: Real Read-Only Agent Tools & Strict Schemas for the Agentic Learning OS.
 * 
 * Provides:
 * - Strongly-typed, machine-readable ToolDefinitions with precise input/output schemas.
 * - Strict rejection of unknown parameters and invalid types.
 * - Reusable execution wrappers that delegate directly to existing server actions.
 * - Strict adherence to READ_ONLY permissions, LOW risk levels, and audit boundaries.
 * - Non-fabricating handling of empty data and disconnected integrations.
 * - Central registration mechanism for orchestrator capability discovery.
 */

import { ToolDefinition } from './tool-types';
import { AgentToolRegistry, agentToolRegistry } from './tool-registry';

// Direct imports of existing server actions — NO duplicated database queries
import { getStudentProfile } from '@/app/actions/profile-actions';
import { getTasks } from '@/app/actions/task-actions';
import { getSkills } from '@/app/actions/skill-actions';
import { getProjects } from '@/app/actions/project-actions';
import { getMistakes } from '@/app/actions/mistake-actions';
import { getTimeSessions } from '@/app/actions/time-actions';
import {
  getSyncedGitHubRepos,
  getSyncedGitHubActivity,
  getGitHubContributionMatrix,
} from '@/app/actions/github-actions';
import {
  getSyncedLeetCodeProfile,
  getSyncedLeetCodeSubmissions,
  getLeetCodeContributionMatrix,
} from '@/app/actions/leetcode-actions';

import {
  StudentProfile,
  Task,
  Skill,
  Project,
  Mistake,
  TimeSession,
  GitHubRepo,
  GitHubActivityLog,
  LeetCodeProfile,
  LeetCodeSubmission,
} from '@/types';

// ============================================================================
// 1. Tool: get_student_profile
// ============================================================================

export interface GetStudentProfileInput extends Record<string, unknown> {}

export interface GetStudentProfileOutput {
  profile: StudentProfile | null;
  hasProfile: boolean;
  targetRoles: string[];
  skills: string[];
}

export const getStudentProfileToolDef: ToolDefinition<GetStudentProfileInput, GetStudentProfileOutput> = {
  name: 'get_student_profile',
  description: 'Fetches the student profile including target roles, bio, university, and core focus areas.',
  category: 'STUDENT_TELEMETRY',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'Structured student profile record or empty profile container',
    properties: {
      profile: {
        type: 'object',
        description: 'Raw student profile entity from database or null if draft',
        nullable: true,
      },
      hasProfile: {
        type: 'boolean',
        description: 'True if a saved non-draft student profile exists',
      },
      targetRoles: {
        type: 'array',
        description: 'Career target roles declared by the student',
        items: {
          type: 'string',
          description: 'Role name',
        },
      },
      skills: {
        type: 'array',
        description: 'Skills attached to the student profile',
        items: {
          type: 'string',
          description: 'Skill name',
        },
      },
    },
  },
  auditMetadata: {
    targetEntity: 'student_profiles',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of student profile and background goals',
  },
  tags: ['profile', 'student', 'telemetry', 'read_only'],
};

export async function executeGetStudentProfileTool(
  _input: GetStudentProfileInput = {}
): Promise<GetStudentProfileOutput> {
  const profile = await getStudentProfile();
  return {
    profile,
    hasProfile: Boolean(profile && profile.id !== 'draft'),
    targetRoles: profile?.career_target_roles || [],
    skills: profile?.skills || [],
  };
}

// ============================================================================
// 2. Tool: get_tasks
// ============================================================================

export interface GetTasksInput extends Record<string, unknown> {
  status?: 'todo' | 'in_progress' | 'completed';
  limit?: number;
  userId?: string;
}

export interface GetTasksOutput {
  tasks: Task[];
  totalCount: number;
  pendingCount: number;
  completedCount: number;
}

export const getTasksToolDef: ToolDefinition<GetTasksInput, GetTasksOutput> = {
  name: 'get_tasks',
  description: 'Retrieves learning tasks and action items, optionally filtered by status or capped by limit.',
  category: 'TASK_MANAGEMENT',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter tasks by status',
        enum: ['todo', 'in_progress', 'completed'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return (1-100)',
        minimum: 1,
        maximum: 100,
        integer: true,
      },
      userId: {
        type: 'string',
        description: 'Optional student user ID to scope task query',
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'List of tasks and status breakdown statistics',
    properties: {
      tasks: {
        type: 'array',
        description: 'Array of task records matching the query',
      },
      totalCount: {
        type: 'number',
        description: 'Total number of tasks in the database',
      },
      pendingCount: {
        type: 'number',
        description: 'Number of pending (todo or in_progress) tasks',
      },
      completedCount: {
        type: 'number',
        description: 'Number of completed tasks',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'tasks',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of student task list',
  },
  tags: ['tasks', 'todo', 'read_only'],
};

export async function executeGetTasksTool(
  input: GetTasksInput = {}
): Promise<GetTasksOutput> {
  const allTasks = await getTasks(input.userId);
  let filtered = allTasks || [];

  if (input.status) {
    filtered = filtered.filter((t) => t.status === input.status);
  }

  if (typeof input.limit === 'number' && input.limit > 0) {
    filtered = filtered.slice(0, Math.floor(input.limit));
  }

  return {
    tasks: filtered,
    totalCount: (allTasks || []).length,
    pendingCount: (allTasks || []).filter((t) => t.status !== 'completed').length,
    completedCount: (allTasks || []).filter((t) => t.status === 'completed').length,
  };
}

// ============================================================================
// 3. Tool: get_skills
// ============================================================================

export interface GetSkillsInput extends Record<string, unknown> {
  category?: string;
  minProficiency?: number;
}

export interface GetSkillsOutput {
  skills: Skill[];
  totalCount: number;
  categories: string[];
}

export const getSkillsToolDef: ToolDefinition<GetSkillsInput, GetSkillsOutput> = {
  name: 'get_skills',
  description: 'Retrieves tracked technical and theoretical skills with current and target proficiency levels.',
  category: 'CURRICULUM_AND_GOALS',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter skills by category name (case-insensitive substring or exact match)',
      },
      minProficiency: {
        type: 'number',
        description: 'Minimum current proficiency level (1-5)',
        minimum: 1,
        maximum: 5,
        integer: true,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'List of tracked skills and available categories',
    properties: {
      skills: {
        type: 'array',
        description: 'Array of tracked skill records',
      },
      totalCount: {
        type: 'number',
        description: 'Total number of skills tracked',
      },
      categories: {
        type: 'array',
        description: 'Unique list of skill category names',
        items: {
          type: 'string',
          description: 'Category name',
        },
      },
    },
  },
  auditMetadata: {
    targetEntity: 'skills',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of student skills and proficiencies',
  },
  tags: ['skills', 'proficiency', 'read_only'],
};

export async function executeGetSkillsTool(
  input: GetSkillsInput = {}
): Promise<GetSkillsOutput> {
  const allSkills = await getSkills();
  let filtered = allSkills || [];

  if (input.category) {
    const term = input.category.toLowerCase().trim();
    filtered = filtered.filter(
      (s) => s.category?.toLowerCase() === term || s.category?.toLowerCase().includes(term)
    );
  }

  if (typeof input.minProficiency === 'number') {
    filtered = filtered.filter((s) => s.proficiency_level >= (input.minProficiency || 0));
  }

  const uniqueCategories = Array.from(
    new Set((allSkills || []).map((s) => s.category).filter(Boolean))
  );

  return {
    skills: filtered,
    totalCount: (allSkills || []).length,
    categories: uniqueCategories,
  };
}

// ============================================================================
// 4. Tool: get_projects
// ============================================================================

export interface GetProjectsInput extends Record<string, unknown> {
  status?: 'active' | 'completed' | 'planned' | 'paused';
}

export interface GetProjectsOutput {
  projects: Project[];
  totalCount: number;
}

export const getProjectsToolDef: ToolDefinition<GetProjectsInput, GetProjectsOutput> = {
  name: 'get_projects',
  description: 'Retrieves student software and learning projects with status, repository links, and timelines.',
  category: 'CURRICULUM_AND_GOALS',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: 'Filter projects by status',
        enum: ['active', 'completed', 'planned', 'paused'],
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'List of student projects',
    properties: {
      projects: {
        type: 'array',
        description: 'Array of project records',
      },
      totalCount: {
        type: 'number',
        description: 'Total number of projects in the system',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'projects',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of student projects',
  },
  tags: ['projects', 'portfolio', 'read_only'],
};

export async function executeGetProjectsTool(
  input: GetProjectsInput = {}
): Promise<GetProjectsOutput> {
  const allProjects = await getProjects();
  let filtered = allProjects || [];

  if (input.status) {
    filtered = filtered.filter((p) => p.status === input.status);
  }

  return {
    projects: filtered,
    totalCount: (allProjects || []).length,
  };
}

// ============================================================================
// 5. Tool: get_mistakes
// ============================================================================

export interface GetMistakesInput extends Record<string, unknown> {
  category?: string;
  severity?: 'minor' | 'moderate' | 'critical';
  limit?: number;
}

export interface GetMistakesOutput {
  mistakes: Mistake[];
  totalCount: number;
}

export const getMistakesToolDef: ToolDefinition<GetMistakesInput, GetMistakesOutput> = {
  name: 'get_mistakes',
  description: 'Retrieves logged academic and conceptual mistakes, root cause analyses, and prevention rules.',
  category: 'MISTAKE_LOGGING',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter mistakes by category',
      },
      severity: {
        type: 'string',
        description: 'Filter mistakes by severity level',
        enum: ['minor', 'moderate', 'critical'],
      },
      limit: {
        type: 'number',
        description: 'Maximum number of mistakes to return (1-100)',
        minimum: 1,
        maximum: 100,
        integer: true,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'List of logged mistakes with root causes',
    properties: {
      mistakes: {
        type: 'array',
        description: 'Array of logged mistake entries',
      },
      totalCount: {
        type: 'number',
        description: 'Total number of logged mistakes',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'mistakes',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of logged student mistakes',
  },
  tags: ['mistakes', 'reflection', 'read_only'],
};

export async function executeGetMistakesTool(
  input: GetMistakesInput = {}
): Promise<GetMistakesOutput> {
  const allMistakes = await getMistakes();
  let filtered = allMistakes || [];

  if (input.category) {
    const term = input.category.toLowerCase().trim();
    filtered = filtered.filter(
      (m) => m.category?.toLowerCase() === term || m.category?.toLowerCase().includes(term)
    );
  }

  if (input.severity) {
    filtered = filtered.filter((m) => m.severity === input.severity);
  }

  if (typeof input.limit === 'number' && input.limit > 0) {
    filtered = filtered.slice(0, Math.floor(input.limit));
  }

  return {
    mistakes: filtered,
    totalCount: (allMistakes || []).length,
  };
}

// ============================================================================
// 6. Tool: get_time_sessions
// ============================================================================

export interface GetTimeSessionsInput extends Record<string, unknown> {
  category?: string;
  limit?: number;
}

export interface GetTimeSessionsOutput {
  sessions: TimeSession[];
  totalSessions: number;
  totalDurationMinutes: number;
}

export const getTimeSessionsToolDef: ToolDefinition<GetTimeSessionsInput, GetTimeSessionsOutput> = {
  name: 'get_time_sessions',
  description: 'Retrieves focus sessions and logged study time across learning categories and projects.',
  category: 'SCHEDULE_AND_TIME',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Filter time sessions by category',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of sessions to return (1-200)',
        minimum: 1,
        maximum: 200,
        integer: true,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'List of study sessions and accumulated focus duration',
    properties: {
      sessions: {
        type: 'array',
        description: 'Array of time session records',
      },
      totalSessions: {
        type: 'number',
        description: 'Total number of recorded sessions',
      },
      totalDurationMinutes: {
        type: 'number',
        description: 'Sum of focus duration in minutes',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'time_sessions',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of focus time and study sessions',
  },
  tags: ['time', 'sessions', 'focus', 'read_only'],
};

export async function executeGetTimeSessionsTool(
  input: GetTimeSessionsInput = {}
): Promise<GetTimeSessionsOutput> {
  const allSessions = await getTimeSessions();
  let filtered = allSessions || [];

  if (input.category) {
    const term = input.category.toLowerCase().trim();
    filtered = filtered.filter(
      (s) => s.category?.toLowerCase() === term || s.category?.toLowerCase().includes(term)
    );
  }

  if (typeof input.limit === 'number' && input.limit > 0) {
    filtered = filtered.slice(0, Math.floor(input.limit));
  }

  const totalDurationMinutes = (allSessions || []).reduce(
    (acc, s) => acc + (s.duration_minutes || 0),
    0
  );

  return {
    sessions: filtered,
    totalSessions: (allSessions || []).length,
    totalDurationMinutes,
  };
}

// ============================================================================
// 7. Tool: get_github_activity
// ============================================================================

export interface GetGithubActivityInput extends Record<string, unknown> {
  limit?: number;
}

export interface GetGithubActivityOutput {
  isConnected: boolean;
  repos: GitHubRepo[];
  recentActivity: GitHubActivityLog[];
  contributionMatrix: {
    totalCommits: number;
    currentStreak: number;
    longestStreak: number;
  };
}

export const getGithubActivityToolDef: ToolDefinition<GetGithubActivityInput, GetGithubActivityOutput> = {
  name: 'get_github_activity',
  description: 'Retrieves synced GitHub repositories, commit activity logs, and contribution streak metrics.',
  category: 'EXTERNAL_INTEGRATION',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of activity events to return (1-100)',
        minimum: 1,
        maximum: 100,
        integer: true,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'GitHub repositories, recent events, and streak metrics',
    properties: {
      isConnected: {
        type: 'boolean',
        description: 'True if student has connected a healthy GitHub account with synced telemetry',
      },
      repos: {
        type: 'array',
        description: 'List of synced GitHub repositories',
      },
      recentActivity: {
        type: 'array',
        description: 'List of recent GitHub commit and PR activity events',
      },
      contributionMatrix: {
        type: 'object',
        description: 'Summary contribution metrics and streak counts',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'github_activity_logs',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of synced GitHub telemetry',
  },
  tags: ['github', 'commits', 'telemetry', 'read_only'],
};

export async function executeGetGithubActivityTool(
  input: GetGithubActivityInput = {}
): Promise<GetGithubActivityOutput> {
  const [repos, activity, matrix] = await Promise.all([
    getSyncedGitHubRepos(),
    getSyncedGitHubActivity(),
    getGitHubContributionMatrix(),
  ]);

  let filteredActivity = activity || [];
  if (typeof input.limit === 'number' && input.limit > 0) {
    filteredActivity = filteredActivity.slice(0, Math.floor(input.limit));
  }

  const isConnected = Boolean((repos && repos.length > 0) || (activity && activity.length > 0));

  return {
    isConnected,
    repos: repos || [],
    recentActivity: filteredActivity,
    contributionMatrix: {
      totalCommits: matrix?.totalCommits || 0,
      currentStreak: matrix?.currentStreak || 0,
      longestStreak: matrix?.longestStreak || 0,
    },
  };
}

// ============================================================================
// 8. Tool: get_leetcode_activity
// ============================================================================

export interface GetLeetcodeActivityInput extends Record<string, unknown> {
  limit?: number;
}

export interface GetLeetcodeActivityOutput {
  isConnected: boolean;
  profile: LeetCodeProfile | null;
  recentSubmissions: LeetCodeSubmission[];
  contributionMatrix: {
    totalSolved: number;
    currentStreak: number;
    longestStreak: number;
  };
}

export const getLeetcodeActivityToolDef: ToolDefinition<GetLeetcodeActivityInput, GetLeetcodeActivityOutput> = {
  name: 'get_leetcode_activity',
  description: 'Retrieves synced LeetCode problem-solving stats, recent submissions, and heatmap metrics.',
  category: 'EXTERNAL_INTEGRATION',
  operationType: 'READ',
  permissionLevel: 'READ_ONLY',
  riskLevel: 'LOW',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of recent submissions to return (1-100)',
        minimum: 1,
        maximum: 100,
        integer: true,
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: 'object',
    description: 'LeetCode profile statistics, submission logs, and solving metrics',
    properties: {
      isConnected: {
        type: 'boolean',
        description: 'True if student has connected a LeetCode username with synced stats',
      },
      profile: {
        type: 'object',
        description: 'Cached LeetCode profile record or null',
        nullable: true,
      },
      recentSubmissions: {
        type: 'array',
        description: 'List of recent accepted LeetCode submissions',
      },
      contributionMatrix: {
        type: 'object',
        description: 'Summary solving metrics and streak stats',
      },
    },
  },
  auditMetadata: {
    targetEntity: 'leetcode_profile_cache',
    affectsStudentData: false,
    isReversible: true,
    requiresUserConfirmation: false,
    auditDescription: 'Pure read-only query of synced LeetCode telemetry',
  },
  tags: ['leetcode', 'dsa', 'telemetry', 'read_only'],
};

export async function executeGetLeetcodeActivityTool(
  input: GetLeetcodeActivityInput = {}
): Promise<GetLeetcodeActivityOutput> {
  const [profile, submissions, matrix] = await Promise.all([
    getSyncedLeetCodeProfile(),
    getSyncedLeetCodeSubmissions(),
    getLeetCodeContributionMatrix(),
  ]);

  let filteredSubs = submissions || [];
  if (typeof input.limit === 'number' && input.limit > 0) {
    filteredSubs = filteredSubs.slice(0, Math.floor(input.limit));
  }

  const isConnected = Boolean(profile || (submissions && submissions.length > 0));

  return {
    isConnected,
    profile: profile || null,
    recentSubmissions: filteredSubs,
    contributionMatrix: {
      totalSolved: matrix?.totalSolved || (profile?.total_solved ?? 0),
      currentStreak: matrix?.currentStreak || 0,
      longestStreak: matrix?.longestStreak || 0,
    },
  };
}

// ============================================================================
// Master Read-Only Tool Array and Registration Helper
// ============================================================================

export const READ_ONLY_TOOLS: readonly ToolDefinition[] = Object.freeze([
  getStudentProfileToolDef,
  getTasksToolDef,
  getSkillsToolDef,
  getProjectsToolDef,
  getMistakesToolDef,
  getTimeSessionsToolDef,
  getGithubActivityToolDef,
  getLeetcodeActivityToolDef,
]);

/**
 * Registers all 8 Phase 3B/3C READ_ONLY tools with the specified or default AgentToolRegistry.
 */
export function registerReadOnlyTools(registry: AgentToolRegistry = agentToolRegistry): void {
  for (const tool of READ_ONLY_TOOLS) {
    if (!registry.hasTool(tool.name)) {
      registry.registerTool(tool);
    }
  }
}

// Automatically register in the global singleton for instant availability
registerReadOnlyTools(agentToolRegistry);
