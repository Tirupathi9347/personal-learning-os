export type TaskStatus = 'todo' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: string;
  user_id?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  completed_at: string | null;
  postponed_count: number;
  project_id?: string | null;
  idempotency_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  raw_content: string;
  summary: string | null;
  learning_summary: string | null;
  reflection: string | null;
  tomorrow_plan: string | null;
  time_spent_minutes: number;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';

export interface Project {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  github_repo_url: string | null;
  start_date: string | null;
  target_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  proficiency_level: number;
  target_level: number;
  created_at: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  category: string | null;
  tags: string[] | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TopicNode {
  id: string;
  title: string;
  parent_id: string | null;
  description: string | null;
  mastery_percentage: number;
  created_at: string;
}

export interface GitHubRepo {
  id: string;
  github_id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  pushed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GitHubActivityLog {
  id: string;
  event_id: string;
  event_type: string;
  repo_name: string;
  message: string | null;
  url: string | null;
  occurred_at: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface LeetCodeProfile {
  id: string;
  username: string;
  ranking: number | null;
  total_solved: number;
  easy_solved: number;
  medium_solved: number;
  hard_solved: number;
  acceptance_rate: number;
  last_synced_at: string;
  created_at: string;
}

export interface LeetCodeSubmission {
  id: string;
  submission_id: string;
  username: string;
  title: string;
  title_slug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
  status: string;
  lang: string | null;
  timestamp: string;
  created_at: string;
}

export type TimeSessionCategory = 'Learning' | 'Coding' | 'Project' | 'Research' | 'Course' | 'Practice';

export interface TimeSession {
  id: string;
  category: TimeSessionCategory;
  duration_minutes: number;
  description: string | null;
  session_date: string;
  task_id?: string | null;
  project_id?: string | null;
  skill_id?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
}

export type MistakeSeverity = 'low' | 'medium' | 'high' | 'critical';
export type MistakeCategory = 'Syntax/Logic' | 'Architecture' | 'Performance' | 'Database' | 'API' | 'Security';

export interface Mistake {
  id: string;
  title: string;
  category: MistakeCategory;
  root_cause: string;
  solution: string;
  prevention_rule: string | null;
  severity: MistakeSeverity;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchResultItem {
  id: string;
  type: 'task' | 'note' | 'journal' | 'project' | 'skill' | 'github' | 'leetcode' | 'time' | 'mistake' | 'opportunity';
  title: string;
  subtitle: string;
  url: string;
  date?: string;
}

export type OpportunityType = 
  | 'INTERNSHIP' 
  | 'JOB' 
  | 'HACKATHON' 
  | 'SCHOLARSHIP' 
  | 'FELLOWSHIP' 
  | 'COMPETITION' 
  | 'WORKSHOP' 
  | 'CERTIFICATION' 
  | 'RESEARCH' 
  | 'OTHER';

export type OpportunityStatus = 
  | 'NEW' 
  | 'SAVED' 
  | 'INTERESTED' 
  | 'APPLIED' 
  | 'INTERVIEW' 
  | 'SELECTED' 
  | 'REJECTED' 
  | 'NOT_INTERESTED' 
  | 'EXPIRED';

export type OpportunityWorkMode = 'REMOTE' | 'HYBRID' | 'ON_SITE';

export interface SourceHistoryItem {
  source_type: string;
  source_identifier: string | null;
  timestamp: string;
  evidence_snippet?: string | null;
}

export interface Opportunity {
  id: string;
  user_id: string;
  title: string;
  organization: string;
  type: OpportunityType;
  role: string | null;
  description: string | null;
  eligibility: string | null;
  education_requirements: string | null;
  branch_requirements: string | null;
  skills_required: string[] | null;
  location: string | null;
  work_mode: OpportunityWorkMode | null;
  stipend: string | null;
  salary: string | null;
  deadline: string | null;
  application_url: string | null;
  source: string | null;
  source_identifier: string | null;
  confidence: number | null;
  status: OpportunityStatus;
  needs_review?: boolean | null;
  google_calendar_event_id?: string | null;
  calendar_synced?: boolean | null;
  sources_history?: SourceHistoryItem[] | null;
  evidence_snippets?: string[] | null;
  created_at: string;
  updated_at: string;
}

export type QualityClassification = 'HIGH_CONFIDENCE' | 'NEEDS_REVIEW' | 'REJECTED';

export interface GmailSyncCheckpoint {
  id: string;
  user_id: string;
  last_history_id: string | null;
  last_message_id: string | null;
  last_synced_at: string;
  processed_message_ids: string[];
  total_emails_processed: number;
  total_opportunities_detected: number;
  total_opportunities_saved: number;
  total_duplicates_merged: number;
  total_needs_review: number;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: string;
  user_id?: string | null;
  full_name?: string | null;
  college?: string | null;
  branch?: string | null;
  degree?: string | null;
  current_year?: string | null;
  graduation_year?: number | null;
  skills?: string[] | null;
  skill_proficiencies?: Record<string, number> | null;
  relevant_project_technologies?: string[] | null;
  career_target_roles?: string[] | null;
  interests?: string[] | null;
  learning_goals?: string[] | null;
  preferred_opportunity_types?: string[] | null;
  preferred_locations?: string[] | null;
  preferred_work_modes?: string[] | null;
  min_stipend?: string | null;
  expected_salary?: string | null;
  availability_status?: string | null;
  created_at: string;
  updated_at: string;
}

export type DuplicateMatchLevel = 'EXACT_MATCH' | 'STRONG_MATCH' | 'POSSIBLE_DUPLICATE' | 'NO_MATCH';

export interface DuplicateMatchResult {
  matchLevel: DuplicateMatchLevel;
  matchedOpportunity: Opportunity | null;
  matchScore: number;
  matchReason: string;
}

export interface OpportunityFilters {
  query?: string;
  type?: OpportunityType | 'ALL';
  status?: OpportunityStatus | 'ALL';
  source?: string | 'ALL';
  work_mode?: OpportunityWorkMode | 'ALL';
  closingSoonOnly?: boolean;
}

export interface EvidenceLink {
  id: string;
  source_type: 'journal' | 'note' | 'task' | 'github_activity' | 'leetcode_submission' | 'time_session' | 'mistake';
  source_id: string;
  target_type: 'skill' | 'project' | 'topic';
  target_id: string;
  weight: number;
  created_at: string;
}

export interface EvidenceGraphItem {
  id: string;
  type: 'journal' | 'note' | 'task' | 'github_activity' | 'leetcode_submission' | 'time_session' | 'mistake';
  title: string;
  summary?: string;
  date?: string;
  weight: number;
}

export interface ApiKeyPublicConfig {
  id: string;
  provider: string;
  selected_model: string;
  is_active: boolean;
  health_status: 'healthy' | 'degraded' | 'invalid' | 'unknown';
  last_checked_at: string | null;
  created_at: string;
  has_key: boolean;
}

export type ProposedActionType = 
  | 'task.create'
  | 'task.update'
  | 'task.complete'
  | 'journal.create'
  | 'journal.update'
  | 'note.create'
  | 'project.create'
  | 'skill.create'
  | 'evidence.link';

export interface ProposedChangeItem {
  id?: string;
  action: ProposedActionType;
  summary: string;
  target_id?: string;
  data: Record<string, any>;
}

export interface ProposedChangesPayload {
  summary: string;
  changes: ProposedChangeItem[];
}

export interface PendingAiAction {
  id: string;
  raw_prompt: string;
  proposed_changes: ProposedChangesPayload;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  created_at: string;
  updated_at: string;
}

export interface ActionHistoryItem {
  id: string;
  action_type: string;
  description: string;
  payload: any;
  inverse_payload: any;
  status: 'applied' | 'undone';
  executed_at: string;
}

// ============================================================================
// Learning Path Persistence
// ============================================================================

export type LearningPathPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface LearningPathDayActivities {
  learn: boolean;
  practice: boolean;
  review: boolean;
}

export interface LearningPathDay {
  id: string;
  path_id: string;
  user_id: string;
  day_number: number;
  topic: string;
  learn_content: string;
  practice_problems: number;
  review_activity: string;
  ai_estimated_minutes: number;
  priority: LearningPathPriority;
  evidence_rationale: string | null;
  activities_completed: LearningPathDayActivities;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LearningPath {
  id: string;
  user_id: string;
  goal: string;
  total_days: number;
  start_date: string;    // ISO date string YYYY-MM-DD
  plan_metadata: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  days?: LearningPathDay[];
}

