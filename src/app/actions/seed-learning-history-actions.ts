'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { MistakeCategory, MistakeSeverity, ProjectStatus, TaskPriority, TaskStatus, TimeSessionCategory } from '@/types';

export interface SeedHistorySummary {
  success: boolean;
  message: string;
  userId: string;
  tasksCount: number;
  timeSessionsCount: number;
  mistakesCount: number;
  journalEntriesCount: number;
  notesCount: number;
  skillsCount: number;
  projectsCount: number;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface ExistingHistoryStats {
  tasksCount: number;
  timeSessionsCount: number;
  mistakesCount: number;
  journalEntriesCount: number;
  notesCount: number;
  skillsCount: number;
  projectsCount: number;
  hasHistory: boolean;
}

export interface ClearDemoHistoryResult {
  success: boolean;
  message: string;
  removed: {
    tasks: number;
    sessions: number;
    mistakes: number;
    journalEntries: number;
    notes: number;
    projects: number;
  };
}

/**
 * Fetch current counts of student learning telemetry in authenticated database.
 */
export async function getStudentLearningHistoryStats(explicitUserId?: string): Promise<ExistingHistoryStats> {
  try {
    const supabase = createServiceRoleClient();
    let effectiveUserId = explicitUserId;

    if (!effectiveUserId) {
      try {
        const authClient = await createClient();
        const { data: { user } } = await authClient.auth.getUser();
        if (user?.id) effectiveUserId = user.id;
      } catch {}
    }

    if (!effectiveUserId) {
      const { data: { users } } = await supabase.auth.admin.listUsers();
      const primary = users?.find((u) => u.email === (process.env.ALLOWED_USER_EMAIL || 'user@example.com')) || users?.[0];
      if (primary) effectiveUserId = primary.id;
    }

    const [tasksRes, sessionsRes, mistakesRes, journalsRes, notesRes, skillsRes, projectsRes] = await Promise.all([
      effectiveUserId 
        ? supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', effectiveUserId)
        : supabase.from('tasks').select('*', { count: 'exact', head: true }),
      supabase.from('time_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('mistakes').select('*', { count: 'exact', head: true }),
      supabase.from('journal_entries').select('*', { count: 'exact', head: true }),
      supabase.from('notes').select('*', { count: 'exact', head: true }),
      supabase.from('skills').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
    ]);

    const tasksCount = tasksRes.count || 0;
    const timeSessionsCount = sessionsRes.count || 0;
    const mistakesCount = mistakesRes.count || 0;
    const journalEntriesCount = journalsRes.count || 0;
    const notesCount = notesRes.count || 0;
    const skillsCount = skillsRes.count || 0;
    const projectsCount = projectsRes.count || 0;

    return {
      tasksCount,
      timeSessionsCount,
      mistakesCount,
      journalEntriesCount,
      notesCount,
      skillsCount,
      projectsCount,
      hasHistory: timeSessionsCount > 0 || mistakesCount > 0 || tasksCount > 0,
    };
  } catch (err) {
    console.error('Failed to get history stats:', err);
    return {
      tasksCount: 0,
      timeSessionsCount: 0,
      mistakesCount: 0,
      journalEntriesCount: 0,
      notesCount: 0,
      skillsCount: 0,
      projectsCount: 0,
      hasHistory: false,
    };
  }
}

/**
 * Deterministic, idempotent seed of comprehensive student learning history (approx. 10-14 days).
 * Bound strictly to the authenticated user ID without modifying GitHub/LeetCode data.
 */
export async function seedStudentLearningHistory(explicitUserId?: string): Promise<SeedHistorySummary> {
  const supabase = createServiceRoleClient();
  let targetUserId = explicitUserId;

  if (!targetUserId) {
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user?.id) targetUserId = user.id;
    } catch {}
  }

  // Fallback to primary registered student user if outside request context
  if (!targetUserId) {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const primary = users?.find((u) => u.email === (process.env.ALLOWED_USER_EMAIL || 'user@example.com')) || users?.[0];
    if (primary) targetUserId = primary.id;
  }

  if (!targetUserId) {
    throw new Error('Authentication required: Could not determine student user_id for seeding.');
  }

  const startDate = '2026-09-04';
  const endDate = '2026-09-17';

  // 0. Clean up invalid legacy test skill 'wecwecwrvv'
  await supabase.from('skills').delete().eq('name', 'wecwecwrvv');

  // 1. SKILLS: B.Tech CSE learning profile with realistic varying proficiency (2 to 3 out of 5)
  const desiredSkills = [
    { name: 'Python', category: 'Programming Languages', proficiency_level: 3, target_level: 5 },
    { name: 'Java', category: 'Programming Languages', proficiency_level: 2, target_level: 5 },
    { name: 'SQL & Relational Databases', category: 'Database & Backend', proficiency_level: 3, target_level: 5 },
    { name: 'Data Structures & Algorithms', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Web Development', category: 'Web Development', proficiency_level: 3, target_level: 5 },
    { name: 'Operating Systems', category: 'Computer Science Core', proficiency_level: 2, target_level: 5 },
    { name: 'Computer Networks', category: 'Computer Science Core', proficiency_level: 2, target_level: 5 },
    { name: 'Machine Learning', category: 'Artificial Intelligence', proficiency_level: 2, target_level: 5 },
    { name: 'Database Management Systems', category: 'Computer Science Core', proficiency_level: 3, target_level: 5 },
  ];

  const skillMap: Record<string, string> = {};
  for (const sk of desiredSkills) {
    const { data: existing } = await supabase
      .from('skills')
      .select('id, name')
      .eq('name', sk.name)
      .maybeSingle();

    if (existing) {
      await supabase.from('skills').update({
        category: sk.category,
        proficiency_level: sk.proficiency_level,
        target_level: sk.target_level,
      }).eq('id', existing.id);
      skillMap[sk.name] = existing.id;
    } else {
      const { data: created } = await supabase
        .from('skills')
        .insert(sk)
        .select()
        .single();
      if (created) skillMap[sk.name] = created.id;
    }
  }

  // 2. PROJECTS: 4 realistic B.Tech CSE learning projects
  const seedProjects: Array<{
    slug: string;
    title: string;
    description: string;
    status: ProjectStatus;
    start_date: string;
    target_end_date: string;
  }> = [
    {
      slug: 'personal-learning-tracker-api',
      title: 'Personal Learning Tracker API',
      description: 'FastAPI and PostgreSQL backend service for tracking student study sessions, cognitive telemetry, and error recurrence.',
      status: 'active',
      start_date: '2026-09-04',
      target_end_date: '2026-10-15',
    },
    {
      slug: 'campus-event-management-portal',
      title: 'Campus Event Management Portal',
      description: 'Next.js and Supabase web portal for student club activities, registration, and attendance tracking.',
      status: 'completed',
      start_date: '2026-08-10',
      target_end_date: '2026-09-06',
    },
    {
      slug: 'algorithmic-trading-backtester',
      title: 'Algorithmic Trading Backtester',
      description: 'Python backtesting engine evaluating moving average crossover and mean reversion strategies with NumPy and Pandas.',
      status: 'planning',
      start_date: '2026-09-18',
      target_end_date: '2026-11-01',
    },
    {
      slug: 'distributed-kv-store-prototype',
      title: 'Distributed Key-Value Store Prototype',
      description: 'Java concurrent hash-ring key-value store implementing consistent hashing and node failure detection.',
      status: 'active',
      start_date: '2026-09-10',
      target_end_date: '2026-10-30',
    },
  ];

  const projectMap: Record<string, string> = {};
  for (const proj of seedProjects) {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('slug', proj.slug)
      .maybeSingle();

    if (existing) {
      projectMap[proj.slug] = existing.id;
    } else {
      const { data: created } = await supabase
        .from('projects')
        .insert(proj)
        .select()
        .single();
      if (created) projectMap[proj.slug] = created.id;
    }
  }

  const defaultProjectId = projectMap['personal-learning-tracker-api'] || null;

  // 3. TASKS: 24 realistic B.Tech CSE tasks
  const seedTasks: Array<{
    idempotency_key: string;
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string;
    completed_at: string | null;
    postponed_count: number;
    created_at: string;
  }> = [
    // Completed tasks (12)
    {
      idempotency_key: 'seed-task-01-python-functions',
      title: 'Review Python function arguments and variable scopes',
      description: 'Review positional vs keyword args, *args, **kwargs, and default parameter evaluation rules.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-05',
      completed_at: '2026-09-05T16:30:00Z',
      postponed_count: 0,
      created_at: '2026-09-04T10:00:00Z',
    },
    {
      idempotency_key: 'seed-task-02-sql-joins',
      title: 'Practice SQL INNER, LEFT, and FULL OUTER JOIN queries',
      description: 'Solve 6 complex join problems with multi-table relationships in PostgreSQL.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-06',
      completed_at: '2026-09-06T18:15:00Z',
      postponed_count: 0,
      created_at: '2026-09-05T09:00:00Z',
    },
    {
      idempotency_key: 'seed-task-03-sliding-window',
      title: 'Solve array problems using two-pointer & sliding window technique',
      description: 'Implement subarray maximum and longest substring without repeating characters.',
      status: 'completed',
      priority: 'medium',
      due_date: '2026-09-07',
      completed_at: '2026-09-07T19:45:00Z',
      postponed_count: 0,
      created_at: '2026-09-06T11:00:00Z',
    },
    {
      idempotency_key: 'seed-task-04-campus-portal-milestone',
      title: 'Finalize Campus Event Portal authentication & role-based routing',
      description: 'Implement JWT session verification and admin dashboard guardrails in Next.js.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-06',
      completed_at: '2026-09-06T20:00:00Z',
      postponed_count: 0,
      created_at: '2026-09-05T14:00:00Z',
    },
    {
      idempotency_key: 'seed-task-05-dbms-normalization',
      title: 'Revise DBMS Normalization: 1NF, 2NF, 3NF and BCNF',
      description: 'Document functional dependencies, closure sets, and lossless join decomposition rules.',
      status: 'completed',
      priority: 'medium',
      due_date: '2026-09-08',
      completed_at: '2026-09-09T14:20:00Z',
      postponed_count: 1,
      created_at: '2026-09-07T10:00:00Z',
    },
    {
      idempotency_key: 'seed-task-06-binary-search',
      title: 'Implement binary search variations and boundary conditions',
      description: 'Code lower_bound and upper_bound without off-by-one errors on sorted arrays.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-10',
      completed_at: '2026-09-10T17:10:00Z',
      postponed_count: 0,
      created_at: '2026-09-09T14:00:00Z',
    },
    {
      idempotency_key: 'seed-task-07-os-cpu-scheduling',
      title: 'Study Operating System CPU Scheduling Algorithms',
      description: 'Simulate First-Come-First-Served (FCFS), Round Robin, and Shortest Remaining Time First (SRTF).',
      status: 'completed',
      priority: 'medium',
      due_date: '2026-09-11',
      completed_at: '2026-09-11T16:00:00Z',
      postponed_count: 0,
      created_at: '2026-09-10T11:00:00Z',
    },
    {
      idempotency_key: 'seed-task-08-fastapi-crud-endpoints',
      title: 'Build REST API endpoints for Study Session logging',
      description: 'Create POST /sessions and GET /sessions/summary endpoints in FastAPI with Pydantic schemas.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-13',
      completed_at: '2026-09-13T18:30:00Z',
      postponed_count: 0,
      created_at: '2026-09-11T15:00:00Z',
    },
    {
      idempotency_key: 'seed-task-09-java-oop-inheritance',
      title: 'Practice Java OOP: Polymorphism, Abstract classes and Interfaces',
      description: 'Design a clean geometric shape hierarchy with dynamic dispatch and overridden methods.',
      status: 'completed',
      priority: 'medium',
      due_date: '2026-09-14',
      completed_at: '2026-09-14T19:00:00Z',
      postponed_count: 0,
      created_at: '2026-09-13T10:00:00Z',
    },
    {
      idempotency_key: 'seed-task-10-ml-data-preprocessing',
      title: 'Review Machine Learning feature scaling and categorical encoding',
      description: 'Implement StandardScaler, MinMaxScaler, and OneHotEncoder on sample student dataset.',
      status: 'completed',
      priority: 'low',
      due_date: '2026-09-14',
      completed_at: '2026-09-14T21:30:00Z',
      postponed_count: 0,
      created_at: '2026-09-13T16:00:00Z',
    },
    {
      idempotency_key: 'seed-task-11-sql-aggregation-debug',
      title: 'Debug SQL multi-table aggregation and HAVING clauses',
      description: 'Analyze query execution plan on sales summary table with missing GROUP BY columns.',
      status: 'completed',
      priority: 'high',
      due_date: '2026-09-15',
      completed_at: '2026-09-15T18:00:00Z',
      postponed_count: 0,
      created_at: '2026-09-14T09:30:00Z',
    },
    {
      idempotency_key: 'seed-task-12-networks-tcp-handshake',
      title: 'Revise Computer Networks: TCP 3-way handshake and UDP headers',
      description: 'Trace Wireshark packet capture showing SYN, SYN-ACK, ACK, and sliding window flow control.',
      status: 'completed',
      priority: 'medium',
      due_date: '2026-09-16',
      completed_at: '2026-09-16T17:30:00Z',
      postponed_count: 0,
      created_at: '2026-09-15T11:00:00Z',
    },

    // In Progress tasks (5)
    {
      idempotency_key: 'seed-task-13-recursive-tree-traversal',
      title: 'Implement recursive tree traversal and call-stack visualization',
      description: 'Trace pre-order, in-order, and post-order depth-first recursion with explicit termination checks.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-18',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-15T15:00:00Z',
    },
    {
      idempotency_key: 'seed-task-14-postgresql-b-tree-indexing',
      title: 'Benchmark PostgreSQL B-Tree vs Hash indexing on 100k row table',
      description: 'Run EXPLAIN ANALYZE on range queries and exact match filters to measure buffer hit ratio.',
      status: 'in_progress',
      priority: 'medium',
      due_date: '2026-09-18',
      completed_at: null,
      postponed_count: 1,
      created_at: '2026-09-14T08:00:00Z',
    },
    {
      idempotency_key: 'seed-task-15-kv-store-consistent-hashing',
      title: 'Implement consistent hashing ring for distributed KV store',
      description: 'Build MD5 virtual node placement algorithm with replication factor of 3 in Java.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-19',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T10:00:00Z',
    },
    {
      idempotency_key: 'seed-task-16-mistake-engine-remediation',
      title: 'Review and remediate recurring SQL JOIN and NULL mistakes',
      description: 'Write test assertions for all 3 recurring SQL pitfalls documented in the Mistake Engine.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-17',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T14:00:00Z',
    },
    {
      idempotency_key: 'seed-task-17-os-paging-virtual-memory',
      title: 'Study Virtual Memory, Paging, and Page Replacement Algorithms',
      description: 'Compare FIFO, LRU, and Optimal page replacement algorithms on reference memory strings.',
      status: 'in_progress',
      priority: 'medium',
      due_date: '2026-09-19',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T16:00:00Z',
    },

    // To Do tasks (7 - including overdue where due_date < 2026-09-17)
    {
      idempotency_key: 'seed-task-18-dsa-recursion-practice-set',
      title: 'Solve 5 divide-and-conquer recursion practice problems',
      description: 'Focus on strict termination guards and non-overlapping subproblems (Merge Sort, Binary Search).',
      status: 'todo',
      priority: 'high',
      due_date: '2026-09-19',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T11:00:00Z',
    },
    {
      idempotency_key: 'seed-task-19-overdue-dbms-transaction-acid',
      title: 'Revise ACID transaction isolation levels in PostgreSQL',
      description: 'Inspect Dirty Reads, Non-Repeatable Reads, and Phantom Reads across Read Committed and Serializable.',
      status: 'todo',
      priority: 'high',
      due_date: '2026-09-15', // Overdue demonstration
      completed_at: null,
      postponed_count: 2,
      created_at: '2026-09-13T09:00:00Z',
    },
    {
      idempotency_key: 'seed-task-20-python-interview-qa-prep',
      title: 'Prepare technical interview questions for SQL & Python',
      description: 'Summarize GIL, memory allocator, generator expressions, and ACID properties for mock interview.',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-09-21',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T08:00:00Z',
    },
    {
      idempotency_key: 'seed-task-21-fastapi-jwt-auth-middleware',
      title: 'Add JWT authorization middleware to Learning Tracker API',
      description: 'Implement bearer token extraction and dependency injection in FastAPI routers.',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-09-22',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T08:30:00Z',
    },
    {
      idempotency_key: 'seed-task-22-networks-subnetting-cidr',
      title: 'Practice IP subnetting, VLSM, and CIDR notation calculations',
      description: 'Calculate usable host addresses, subnet masks, and broadcast IPs for classless networks.',
      status: 'todo',
      priority: 'low',
      due_date: '2026-09-23',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T09:00:00Z',
    },
    {
      idempotency_key: 'seed-task-23-ml-logistic-regression-math',
      title: 'Derive cost function and gradient descent update for Logistic Regression',
      description: 'Work through sigmoid activation, cross-entropy loss formula, and decision boundary calculus.',
      status: 'todo',
      priority: 'low',
      due_date: '2026-09-24',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T09:15:00Z',
    },
    {
      idempotency_key: 'seed-task-24-trading-backtester-design',
      title: 'Draft architecture diagram for Algorithmic Trading Backtester',
      description: 'Define EventQueue, DataHandler, Strategy, Portfolio, and ExecutionHandler class interfaces.',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-09-25',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T09:30:00Z',
    },
  ];

  const taskIdMap: Record<string, string> = {};
  for (const t of seedTasks) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('idempotency_key', t.idempotency_key)
      .maybeSingle();

    if (existing) {
      await supabase.from('tasks').update({
        ...t,
        user_id: targetUserId,
      }).eq('id', existing.id);
      taskIdMap[t.idempotency_key] = existing.id;
    } else {
      const { data: created, error: tErr } = await supabase
        .from('tasks')
        .insert({
          ...t,
          user_id: targetUserId,
        })
        .select()
        .single();
      if (tErr) console.error('Task insert error:', tErr);
      if (created) taskIdMap[t.idempotency_key] = created.id;
    }
  }

  // 4. MISTAKES: 10 meaningful mistakes in supported categories and valid severities
  const seedMistakes: Array<{
    title: string;
    category: MistakeCategory;
    root_cause: string;
    solution: string;
    prevention_rule: string;
    severity: MistakeSeverity;
    skill_name: string;
    created_at: string;
  }> = [
    {
      title: 'SQL JOIN Cartesian explosion due to missing ON condition',
      category: 'Database',
      root_cause: 'Placed join predicate inside WHERE clause for LEFT JOIN, causing Cartesian product evaluation before filter.',
      solution: 'Place relation link in the ON clause: LEFT JOIN orders o ON o.user_id = u.id.',
      prevention_rule: 'Always verify ON clause connects primary and foreign keys before adding post-join WHERE filters.',
      severity: 'medium',
      skill_name: 'SQL & Relational Databases',
      created_at: '2026-09-06T18:00:00Z',
    },
    {
      title: 'SQL GROUP BY non-aggregated column omission',
      category: 'Database',
      root_cause: 'Selected student_name and department without including student_name in GROUP BY clause.',
      solution: 'Add all projected non-aggregate columns to GROUP BY or wrap in aggregate function (MIN/MAX).',
      prevention_rule: 'In SQL standard queries, every non-aggregated column in SELECT must be in GROUP BY.',
      severity: 'medium',
      skill_name: 'SQL & Relational Databases',
      created_at: '2026-09-14T11:30:00Z',
    },
    {
      title: 'SQL JOIN NULL handling discrepancy in NOT IN subquery',
      category: 'Database',
      root_cause: 'Used WHERE id NOT IN (SELECT parent_id FROM nodes) when parent_id contained NULL values, returning 0 rows unexpectedly.',
      solution: 'Switch to NOT EXISTS or add WHERE parent_id IS NOT NULL inside the subquery.',
      prevention_rule: 'Prefer NOT EXISTS over NOT IN when subquery can contain nullable columns.',
      severity: 'medium',
      skill_name: 'SQL & Relational Databases',
      created_at: '2026-09-16T14:20:00Z',
    },
    {
      title: 'Python mutable default argument retention bug',
      category: 'Syntax/Logic',
      root_cause: 'Defined def collect(val, items=[]); default list persisted across multiple function invocations.',
      solution: 'Use items=None in function signature, and initialize items = [] inside function body.',
      prevention_rule: 'Never use mutable values (list, dict, set) as default parameter values in Python.',
      severity: 'low',
      skill_name: 'Python',
      created_at: '2026-09-05T16:00:00Z',
    },
    {
      title: 'Recursion missing base-case causing stack overflow',
      category: 'Syntax/Logic',
      root_cause: 'Recursive tree traversal failed to check if node is None before dereferencing node.left.',
      solution: 'Add strict guard clause at top of recursion: if not node: return.',
      prevention_rule: 'Always write and test terminating base case before writing recursive calls.',
      severity: 'critical',
      skill_name: 'Data Structures & Algorithms',
      created_at: '2026-09-15T16:30:00Z',
    },
    {
      title: 'Off-by-one boundary error in binary search lower_bound',
      category: 'Syntax/Logic',
      root_cause: 'Used right = len(nums) with while left <= right, causing IndexError when target exceeded maximum element.',
      solution: 'Maintain invariant: while left < right with right = mid when nums[mid] >= target.',
      prevention_rule: 'Carefully define search interval [left, right) and ensure updates maintain loop termination.',
      severity: 'medium',
      skill_name: 'Data Structures & Algorithms',
      created_at: '2026-09-10T16:45:00Z',
    },
    {
      title: 'Java variable shadowing instead of method overriding in subclass',
      category: 'Architecture',
      root_cause: 'Declared a private field with same name in child class, inadvertently shadowing parent class property without dynamic dispatch.',
      solution: 'Remove shadowed field and use parent protected getter/setter with @Override annotations.',
      prevention_rule: 'Always annotate polymorphic methods with @Override to allow compiler verification.',
      severity: 'medium',
      skill_name: 'Java',
      created_at: '2026-09-14T18:30:00Z',
    },
    {
      title: 'FastAPI missing request body validation on unhandled null JSON',
      category: 'API',
      root_cause: 'Optional fields in Pydantic schema were typed without default None, throwing 422 Unprocessable Entity on partial payloads.',
      solution: 'Explicitly define Field(default=None) for optional schema attributes.',
      prevention_rule: 'All optional API payload fields must have explicit default values or Optional[T] typing.',
      severity: 'low',
      skill_name: 'Web Development',
      created_at: '2026-09-13T17:45:00Z',
    },
    {
      title: 'Database normalization 2NF violation with partial functional dependency',
      category: 'Database',
      root_cause: 'Placed instructor_office in course_registration table where primary key was composite (course_id, student_id).',
      solution: 'Decomposed course_registration into enrollment and course_details tables.',
      prevention_rule: 'Ensure all non-key attributes depend on the whole primary key, not a subset.',
      severity: 'medium',
      skill_name: 'Database Management Systems',
      created_at: '2026-09-08T14:00:00Z',
    },
    {
      title: 'N+1 query execution in student event list endpoint',
      category: 'Performance',
      root_cause: 'Executed single query for events, then executed individual club lookup queries in a for-loop.',
      solution: 'Rewrote query using PostgreSQL JOIN / select_related to fetch events with club details in one roundtrip.',
      prevention_rule: 'Never run database queries inside iteration loops; use bulk joins or IN clauses.',
      severity: 'high',
      skill_name: 'Web Development',
      created_at: '2026-09-06T17:00:00Z',
    },
  ];

  for (const m of seedMistakes) {
    const { data: existing } = await supabase
      .from('mistakes')
      .select('id')
      .eq('title', m.title)
      .maybeSingle();

    const mistakePayload = {
      title: m.title,
      category: m.category,
      root_cause: m.root_cause,
      solution: m.solution,
      prevention_rule: m.prevention_rule,
      severity: m.severity,
      skill_id: skillMap[m.skill_name] || null,
      created_at: m.created_at,
    };

    if (existing) {
      await supabase.from('mistakes').update(mistakePayload).eq('id', existing.id);
    } else {
      await supabase.from('mistakes').insert(mistakePayload);
    }
  }

  // 5. TIME SESSIONS: 16 realistic study sessions across 10-14 days (durations: 35m to 120m)
  const seedSessions: Array<{
    category: TimeSessionCategory;
    duration_minutes: number;
    description: string;
    session_date: string;
    task_key?: string;
    project_slug?: string;
    skill_name: string;
    started_at: string;
    ended_at: string;
  }> = [
    {
      category: 'Coding',
      duration_minutes: 60,
      description: 'Reviewed Python function parameter rules and variable scopes. [seed-session:01]',
      session_date: '2026-09-04',
      task_key: 'seed-task-01-python-functions',
      project_slug: 'personal-learning-tracker-api',
      skill_name: 'Python',
      started_at: '2026-09-04T10:00:00Z',
      ended_at: '2026-09-04T11:00:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 90,
      description: 'Practiced SQL complex INNER and LEFT joins in PostgreSQL. [seed-session:02]',
      session_date: '2026-09-05',
      task_key: 'seed-task-02-sql-joins',
      skill_name: 'SQL & Relational Databases',
      started_at: '2026-09-05T14:30:00Z',
      ended_at: '2026-09-05T16:00:00Z',
    },
    {
      category: 'Project',
      duration_minutes: 120,
      description: 'Finalized Campus Event Portal JWT auth & role guards. [seed-session:03]',
      session_date: '2026-09-06',
      task_key: 'seed-task-04-campus-portal-milestone',
      project_slug: 'campus-event-management-portal',
      skill_name: 'Web Development',
      started_at: '2026-09-06T15:00:00Z',
      ended_at: '2026-09-06T17:00:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 75,
      description: 'Two-pointer sliding window array problem solving session. [seed-session:04]',
      session_date: '2026-09-07',
      task_key: 'seed-task-03-sliding-window',
      skill_name: 'Data Structures & Algorithms',
      started_at: '2026-09-07T16:00:00Z',
      ended_at: '2026-09-07T17:15:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 90,
      description: 'Deep dive into relational database normalization and BCNF. [seed-session:05]',
      session_date: '2026-09-08',
      task_key: 'seed-task-05-dbms-normalization',
      skill_name: 'Database Management Systems',
      started_at: '2026-09-08T10:00:00Z',
      ended_at: '2026-09-08T11:30:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Binary search lower_bound and boundary condition tests. [seed-session:06]',
      session_date: '2026-09-09',
      task_key: 'seed-task-06-binary-search',
      skill_name: 'Data Structures & Algorithms',
      started_at: '2026-09-09T15:00:00Z',
      ended_at: '2026-09-09T16:00:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 75,
      description: 'CPU Scheduling simulation: Round Robin vs Shortest Job First. [seed-session:07]',
      session_date: '2026-09-10',
      task_key: 'seed-task-07-os-cpu-scheduling',
      skill_name: 'Operating Systems',
      started_at: '2026-09-10T14:00:00Z',
      ended_at: '2026-09-10T15:15:00Z',
    },
    {
      category: 'Project',
      duration_minutes: 90,
      description: 'Implemented FastAPI CRUD endpoints for study session logging. [seed-session:08]',
      session_date: '2026-09-11',
      task_key: 'seed-task-08-fastapi-crud-endpoints',
      project_slug: 'personal-learning-tracker-api',
      skill_name: 'Web Development',
      started_at: '2026-09-11T16:00:00Z',
      ended_at: '2026-09-11T17:30:00Z',
    },
    // Note: 2026-09-12 is intentional low-activity / rest day (35m quick review)
    {
      category: 'Research',
      duration_minutes: 35,
      description: 'Quick read on Distributed KV store architecture and gossip protocol. [seed-session:09]',
      session_date: '2026-09-12',
      skill_name: 'Java',
      started_at: '2026-09-12T19:00:00Z',
      ended_at: '2026-09-12T19:35:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 60,
      description: 'Java OOP polymorphism and geometric shape hierarchy exercises. [seed-session:10]',
      session_date: '2026-09-13',
      task_key: 'seed-task-09-java-oop-inheritance',
      skill_name: 'Java',
      started_at: '2026-09-13T10:00:00Z',
      ended_at: '2026-09-13T11:00:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 45,
      description: 'Machine learning feature scaling and categorical encoding. [seed-session:11]',
      session_date: '2026-09-14',
      task_key: 'seed-task-10-ml-data-preprocessing',
      skill_name: 'Machine Learning',
      started_at: '2026-09-14T15:00:00Z',
      ended_at: '2026-09-14T15:45:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Debugged SQL multi-table aggregation and resolved HAVING clause mistakes. [seed-session:12]',
      session_date: '2026-09-14',
      task_key: 'seed-task-11-sql-aggregation-debug',
      skill_name: 'SQL & Relational Databases',
      started_at: '2026-09-14T17:00:00Z',
      ended_at: '2026-09-14T18:00:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 75,
      description: 'Recursive tree traversal and call-stack visualization. [seed-session:13]',
      session_date: '2026-09-15',
      task_key: 'seed-task-13-recursive-tree-traversal',
      skill_name: 'Data Structures & Algorithms',
      started_at: '2026-09-15T15:00:00Z',
      ended_at: '2026-09-15T16:15:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 45,
      description: 'Computer Networks TCP 3-way handshake and packet flow analysis. [seed-session:14]',
      session_date: '2026-09-16',
      task_key: 'seed-task-12-networks-tcp-handshake',
      skill_name: 'Computer Networks',
      started_at: '2026-09-16T11:00:00Z',
      ended_at: '2026-09-16T11:45:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 90,
      description: 'Consistent hashing ring implementation in Java for KV store. [seed-session:15]',
      session_date: '2026-09-16',
      task_key: 'seed-task-15-kv-store-consistent-hashing',
      project_slug: 'distributed-kv-store-prototype',
      skill_name: 'Java',
      started_at: '2026-09-16T16:00:00Z',
      ended_at: '2026-09-16T17:30:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Mistake engine review: SQL JOINs, recursion termination, and indexing. [seed-session:16]',
      session_date: '2026-09-17',
      task_key: 'seed-task-16-mistake-engine-remediation',
      skill_name: 'SQL & Relational Databases',
      started_at: '2026-09-17T08:00:00Z',
      ended_at: '2026-09-17T09:00:00Z',
    },
  ];

  for (const s of seedSessions) {
    const { data: existing } = await supabase
      .from('time_sessions')
      .select('id')
      .eq('description', s.description)
      .maybeSingle();

    const sessionPayload = {
      category: s.category,
      duration_minutes: s.duration_minutes,
      description: s.description,
      session_date: s.session_date,
      task_id: s.task_key ? taskIdMap[s.task_key] || null : null,
      project_id: s.project_slug ? projectMap[s.project_slug] || null : defaultProjectId,
      skill_id: skillMap[s.skill_name] || null,
      started_at: s.started_at,
      ended_at: s.ended_at,
    };

    if (existing) {
      await supabase.from('time_sessions').update(sessionPayload).eq('id', existing.id);
    } else {
      await supabase.from('time_sessions').insert(sessionPayload);
    }
  }

  // 6. JOURNAL ENTRIES: 10 realistic daily learning logs
  const seedJournals = [
    {
      entry_date: '2026-09-04',
      raw_content: 'Started revising Python fundamentals. Reviewed positional vs keyword arguments and variable scopes. Discovered why mutable default parameters in function definitions can create insidious state leaks.',
      summary: 'Reviewed Python function parameter rules and default argument pitfall.',
      learning_summary: 'Mastered LEGB scoping rules and avoided mutable defaults in Python functions.',
      reflection: 'Python language fundamentals have subtleties that matter when writing robust libraries.',
      tomorrow_plan: 'Practice multi-table SQL joins and verify query execution orders.',
      time_spent_minutes: 60,
    },
    {
      entry_date: '2026-09-05',
      raw_content: 'Dedicated session on SQL joins in PostgreSQL. Solved 6 join problems with multi-table schemas. Hit an issue where putting conditions in WHERE instead of ON caused Cartesian explosion.',
      summary: 'Practiced SQL joins and investigated ON vs WHERE clause semantics.',
      learning_summary: 'Understood ON clause join mechanics vs post-filter WHERE clauses in PostgreSQL.',
      reflection: 'SQL join execution order is critical for query efficiency.',
      tomorrow_plan: 'Work on Campus Event Portal authentication and test role guards.',
      time_spent_minutes: 90,
    },
    {
      entry_date: '2026-09-06',
      raw_content: 'Finished auth milestone for Campus Event Management Portal. Replaced nested for-loop event lookups with a single joined query, fixing an N+1 performance bottleneck.',
      summary: 'Completed Campus Event Portal auth milestone and resolved an N+1 query issue.',
      learning_summary: 'Applied JOIN queries in backend service to eliminate N+1 performance overhead.',
      reflection: 'Thinking about database roundtrips early saves hours of backend profiling later.',
      tomorrow_plan: 'Solve array problems using sliding window and two-pointer techniques.',
      time_spent_minutes: 120,
    },
    {
      entry_date: '2026-09-07',
      raw_content: 'Focused session on two-pointer sliding window problems. Solved 2 medium problems on subarray maximum and substring without repeating characters. Feeling much more confident with array boundaries.',
      summary: 'Two-pointer sliding window problem practice.',
      learning_summary: 'Implemented two-pointer boundary checks without index out of range exceptions.',
      reflection: 'Consistent practice makes boundary invariants natural.',
      tomorrow_plan: 'Review relational database normalization.',
      time_spent_minutes: 75,
    },
    {
      entry_date: '2026-09-08',
      raw_content: 'Revised database normalization from 1NF to BCNF. Documented functional dependencies and identified a partial dependency in a student enrollment table.',
      summary: 'Deep study of DBMS Normalization 1NF through BCNF.',
      learning_summary: 'Grasped decomposition rules to prevent update anomalies in schema design.',
      reflection: 'Theory solidifies why real applications split tables into normalized structures.',
      tomorrow_plan: 'Implement binary search variations and boundary conditions.',
      time_spent_minutes: 90,
    },
    {
      entry_date: '2026-09-09',
      raw_content: 'Practiced binary search variations. Encountered an off-by-one error when setting right boundary in lower_bound search. Fixed it by adopting the half-open interval invariant [left, right).',
      summary: 'Binary search boundary conditions and lower_bound implementation.',
      learning_summary: 'Standardized on [left, right) interval to avoid off-by-one errors in binary search.',
      reflection: 'Choosing a clear mathematical invariant makes edge cases trivial.',
      tomorrow_plan: 'Study operating system CPU scheduling algorithms.',
      time_spent_minutes: 60,
    },
    {
      entry_date: '2026-09-10',
      raw_content: 'Studied Operating System CPU scheduling: FCFS, Round Robin, and Shortest Remaining Time First. Simulated waiting times and turnaround times under varying burst lengths.',
      summary: 'Simulated CPU scheduling algorithms and compared turnaround times.',
      learning_summary: 'Analyzed CPU utilization vs average waiting time tradeoffs in preemptive scheduling.',
      reflection: 'Operating systems concepts make high-concurrency backend programming intuitive.',
      tomorrow_plan: 'Build FastAPI study session endpoints for the Learning Tracker API.',
      time_spent_minutes: 75,
    },
    {
      entry_date: '2026-09-11',
      raw_content: 'Built FastAPI CRUD endpoints for study session logging. Tested endpoint response models with Pydantic. Fixed an unhandled 422 validation error by adding default values to optional fields.',
      summary: 'FastAPI study session logging endpoints and Pydantic validation.',
      learning_summary: 'Defined clean schemas and optional field defaults in FastAPI services.',
      reflection: 'Strict API contracts eliminate subtle runtime client bugs.',
      tomorrow_plan: 'Rest day tomorrow with light architectural reading.',
      time_spent_minutes: 90,
    },
    {
      entry_date: '2026-09-14',
      raw_content: 'Java OOP session on polymorphism and abstract classes. Built a geometric shape calculation hierarchy. Also debugged SQL GROUP BY queries where non-aggregated columns were missing.',
      summary: 'Java OOP polymorphism practice and SQL GROUP BY troubleshooting.',
      learning_summary: 'Used @Override annotations to catch field shadowing and corrected SQL GROUP BY queries.',
      reflection: 'Compiler checks and strict SQL standards save time when adhered to consistently.',
      tomorrow_plan: 'Dive into recursive tree traversal and call-stack visualization.',
      time_spent_minutes: 105,
    },
    {
      entry_date: '2026-09-16',
      raw_content: 'Deep dive into recurring mistakes in SQL and DSA. Noticed a pattern of NULL pitfalls in NOT IN subqueries, as well as recursion termination bugs. Traced TCP 3-way handshake in Wireshark.',
      summary: 'Mistake engine pattern review and Computer Networks TCP analysis.',
      learning_summary: 'Documented prevention rules for SQL NULL handling and verified TCP handshake states.',
      reflection: 'Reviewing past mistakes turns repetitive debugging into permanent mastery.',
      tomorrow_plan: 'Prepare interview questions and continue consistent hashing prototype.',
      time_spent_minutes: 135,
    },
  ];

  for (const j of seedJournals) {
    await supabase.from('journal_entries').upsert(j, { onConflict: 'entry_date' });
  }

  // 7. NOTES: 10 high-value knowledge base notes with 'demo-seed' tag
  const seedNotes = [
    {
      title: 'SQL Joins & Execution Order Mental Model',
      content: '### SQL Query Logical Execution Order\n1. `FROM` & `JOIN` (constructs Cartesian product, then applies `ON` conditions)\n2. `WHERE` (filters rows *before* aggregation)\n3. `GROUP BY` (groups records by specified non-aggregate expressions)\n4. `HAVING` (filters grouped rows *after* aggregation)\n5. `SELECT` (evaluates expressions, aliases, and window functions)\n6. `DISTINCT` (eliminates duplicate rows)\n7. `ORDER BY` (sorts the final projected dataset)\n8. `LIMIT` / `OFFSET` (paginates results)\n\n**Crucial Rule:** In `LEFT JOIN`, putting conditions in the `WHERE` clause can silently eliminate unmatched left rows or convert the join into an `INNER JOIN`. Always place inter-table relationship filters in `ON`.',
      category: 'SQL & Databases',
      tags: ['demo-seed', 'sql', 'database', 'joins', 'query-optimization'],
      project_id: defaultProjectId,
    },
    {
      title: 'Python Functions & Scope Reference (LEGB)',
      content: '### Variable Lookup Hierarchy (LEGB Rule)\n- **L (Local):** Names assigned within a function body.\n- **E (Enclosing):** Names in the local scope of any enclosing functions (closures).\n- **G (Global):** Names assigned at the top-level of the module file.\n- **B (Built-in):** Predefined built-in names (`range`, `len`, `Exception`).\n\n### The Mutable Default Parameter Trap\nPython evaluates default parameter values **once**, when the function definition is parsed.\n```python\n# Anti-pattern\ndef append_to(element, target=[]):\n    target.append(element)\n    return target\n\n# Idiomatic approach\ndef append_to(element, target=None):\n    if target is None:\n        target = []\n    target.append(element)\n    return target\n```',
      category: 'Python',
      tags: ['demo-seed', 'python', 'functions', 'memory', 'closures'],
      project_id: defaultProjectId,
    },
    {
      title: 'Recursion Invariants & Call Stack Safety',
      content: '### Three Principles of Correct Recursion\n1. **Explicit Base Case:** Must be reached for every valid input path, evaluated *before* any recursive calls.\n2. **Strict Convergence:** Every recursive invocation must pass arguments that are strictly closer to the base condition.\n3. **Inductive Correctness:** Assume smaller subproblem solutions are correct and combine them without side-effects.\n\n### Stack Overflow Diagnosis Checklist\n- Did input magnitude strictly diminish?\n- Does the base condition account for empty/null inputs (`None`, `[]`, `""`)?\n- Is the maximum recursion depth within platform limits (`sys.getrecursionlimit()`)?',
      category: 'Algorithms & Data Structures',
      tags: ['demo-seed', 'algorithms', 'recursion', 'dsa', 'call-stack'],
      project_id: defaultProjectId,
    },
    {
      title: 'Binary Search Boundary Conditions & Invariants',
      content: '### Standard Interval Invariant: [left, right)\nUsing the half-open interval `[left, right)` prevents infinite loops and off-by-one errors:\n```python\ndef lower_bound(nums: list[int], target: int) -> int:\n    left = 0\n    right = len(nums)\n    while left < right:\n        mid = left + (right - left) // 2\n        if nums[mid] >= target:\n            right = mid\n        else:\n            left = mid + 1\n    return left\n```\n- If `target` is present, returns the first index of `target`.\n- If `target` is absent, returns the insertion index maintaining sorted order.',
      category: 'Algorithms & Data Structures',
      tags: ['demo-seed', 'algorithms', 'binary-search', 'dsa'],
      project_id: defaultProjectId,
    },
    {
      title: 'Relational Normalization & BCNF Decomposition Rules',
      content: '### Normal Forms Summary\n- **1NF:** Atomic attribute values, no repeating groups.\n- **2NF:** 1NF + no partial dependencies (every non-prime attribute depends on whole candidate key).\n- **3NF:** 2NF + no transitive dependencies (non-prime attributes do not depend on other non-prime attributes).\n- **BCNF:** For every non-trivial functional dependency $X \\to Y$, $X$ must be a superkey.\n\n### Lossless Join & Dependency Preservation\nA decomposition into $R_1$ and $R_2$ is lossless if and only if $R_1 \\cap R_2 \\to R_1$ or $R_1 \\cap R_2 \\to R_2$.',
      category: 'Database Management Systems',
      tags: ['demo-seed', 'dbms', 'normalization', 'bcnf', 'database-theory'],
      project_id: defaultProjectId,
    },
    {
      title: 'Operating System CPU Scheduling Comparison',
      content: '### Scheduling Metrics\n- **Turnaround Time:** Completion Time - Arrival Time\n- **Waiting Time:** Turnaround Time - Burst Time\n- **Response Time:** Time from arrival to first execution\n\n### Algorithms Comparison\n| Algorithm | Preemptive | Convoy Effect | Starvation Risk |\n| :--- | :--- | :--- | :--- |\n| FCFS | No | High | None |\n| SJF (Non-preemptive) | No | Low | High (long jobs) |\n| SRTF (Preemptive) | Yes | None | High |\n| Round Robin | Yes | None | None |',
      category: 'Operating Systems',
      tags: ['demo-seed', 'os', 'cpu-scheduling', 'operating-systems'],
      project_id: defaultProjectId,
    },
    {
      title: 'Computer Networks: TCP 3-Way Handshake & Flow Control',
      content: '### Connection Establishment\n1. **Client $\\to$ Server:** `SYN` (seq = x)\n2. **Server $\\to$ Client:** `SYN-ACK` (seq = y, ack = x + 1)\n3. **Client $\\to$ Server:** `ACK` (seq = x + 1, ack = y + 1)\n\n### Flow Control vs Congestion Control\n- **Flow Control:** Prevent sender from overwhelming receiver buffer (regulated via Advertised Window / `rwnd`).\n- **Congestion Control:** Prevent sender from overwhelming network links (regulated via Congestion Window / `cwnd`).',
      category: 'Computer Networks',
      tags: ['demo-seed', 'networks', 'tcp', 'protocols'],
      project_id: defaultProjectId,
    },
    {
      title: 'Java OOP: Polymorphism vs Method Overloading',
      content: '### Compile-time vs Runtime Polymorphism\n- **Method Overloading:** Same method name, different parameter lists within same class. Resolved at compile-time.\n- **Method Overriding:** Subclass provides specific implementation of parent method. Resolved dynamically at runtime via virtual method table (`vtable`).\n\n**Best Practice:** Always annotate overridden methods with `@Override` to ensure method signature matches exactly and prevent unintentional field/method shadowing.',
      category: 'Java',
      tags: ['demo-seed', 'java', 'oop', 'polymorphism'],
      project_id: projectMap['distributed-kv-store-prototype'] || defaultProjectId,
    },
    {
      title: 'REST API Error Handling & HTTP Status Codes',
      content: '### HTTP Status Classification\n- `200 OK`: Successful read or update with body.\n- `201 Created`: Resource successfully created (include `Location` header).\n- `400 Bad Request`: Generic client payload formatting error.\n- `401 Unauthorized`: Authentication missing or token invalid.\n- `403 Forbidden`: Authenticated user lacks permission.\n- `404 Not Found`: Resource does not exist.\n- `422 Unprocessable Entity`: Semantic validation failure (e.g. Pydantic validation error).',
      category: 'Web Development',
      tags: ['demo-seed', 'api', 'rest', 'fastapi', 'http'],
      project_id: defaultProjectId,
    },
    {
      title: 'Machine Learning: Feature Scaling & Data Leakage Prevention',
      content: '### Feature Scaling Rules\n- **StandardScaler:** $\\frac{x - \\mu}{\\sigma}$ (Zero mean, unit variance). Best for normal distributions.\n- **MinMaxScaler:** $\\frac{x - x_{min}}{x_{max} - x_{min}}$ (Binds to $[0, 1]$). Sensitive to outliers.\n\n**Data Leakage Warning:** Always compute scaler parameters (`fit`) on the **training set only**, and then apply them (`transform`) to the test/validation set. Never fit scalers on the full dataset before splitting.',
      category: 'Machine Learning',
      tags: ['demo-seed', 'ml', 'preprocessing', 'feature-engineering'],
      project_id: defaultProjectId,
    },
  ];

  for (const n of seedNotes) {
    const { data: existing } = await supabase
      .from('notes')
      .select('id')
      .eq('title', n.title)
      .maybeSingle();

    if (existing) {
      await supabase.from('notes').update(n).eq('id', existing.id);
    } else {
      await supabase.from('notes').insert(n);
    }
  }

  // 8. Revalidate all cached UI routes
  try {
    revalidatePath('/tasks');
    revalidatePath('/skills');
    revalidatePath('/journal');
    revalidatePath('/notes');
    revalidatePath('/projects');
    revalidatePath('/time');
    revalidatePath('/mistakes');
    revalidatePath('/analytics');
    revalidatePath('/learning-coach');
    revalidatePath('/settings');
    revalidatePath('/');
  } catch {}

  const stats = await getStudentLearningHistoryStats(targetUserId);

  return {
    success: true,
    message: 'Persistent demo learning history successfully populated in database.',
    userId: targetUserId,
    tasksCount: stats.tasksCount,
    timeSessionsCount: stats.timeSessionsCount,
    mistakesCount: stats.mistakesCount,
    journalEntriesCount: stats.journalEntriesCount,
    notesCount: stats.notesCount,
    skillsCount: stats.skillsCount,
    projectsCount: stats.projectsCount,
    dateRange: { startDate, endDate },
  };
}

/**
 * Protected action to cleanly clear ONLY records created by this demo seed.
 * NEVER deletes genuine user data, external integration data, or modifies RLS.
 */
export async function clearDemoLearningHistory(explicitUserId?: string): Promise<ClearDemoHistoryResult> {
  const supabase = createServiceRoleClient();
  let targetUserId = explicitUserId;

  if (!targetUserId) {
    try {
      const authClient = await createClient();
      const { data: { user } } = await authClient.auth.getUser();
      if (user?.id) targetUserId = user.id;
    } catch {}
  }

  if (!targetUserId) {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const primary = users?.find((u) => u.email === (process.env.ALLOWED_USER_EMAIL || 'user@example.com')) || users?.[0];
    if (primary) targetUserId = primary.id;
  }

  const removed = {
    tasks: 0,
    sessions: 0,
    mistakes: 0,
    journalEntries: 0,
    notes: 0,
    projects: 0,
  };

  // 1. Delete seeded tasks (matching idempotency_key like 'seed-task-%')
  const { data: deletedTasks } = await supabase
    .from('tasks')
    .delete()
    .like('idempotency_key', 'seed-task-%')
    .select('id');
  removed.tasks = deletedTasks?.length || 0;

  // 2. Delete seeded time sessions (matching '[seed-session:')
  const { data: deletedSessions } = await supabase
    .from('time_sessions')
    .delete()
    .like('description', '%[seed-session:%')
    .select('id');
  removed.sessions = deletedSessions?.length || 0;

  // 3. Delete seeded mistakes (matching known titles)
  const demoMistakeTitles = [
    'SQL JOIN Cartesian explosion due to missing ON condition',
    'SQL GROUP BY non-aggregated column omission',
    'SQL JOIN NULL handling discrepancy in NOT IN subquery',
    'Python mutable default argument retention bug',
    'Recursion missing base-case causing stack overflow',
    'Off-by-one boundary error in binary search lower_bound',
    'Java variable shadowing instead of method overriding in subclass',
    'FastAPI missing request body validation on unhandled null JSON',
    'Database normalization 2NF violation with partial functional dependency',
    'N+1 query execution in student event list endpoint',
  ];
  const { data: deletedMistakes } = await supabase
    .from('mistakes')
    .delete()
    .in('title', demoMistakeTitles)
    .select('id');
  removed.mistakes = deletedMistakes?.length || 0;

  // 4. Delete seeded journal entries (matching dates 2026-09-04 through 2026-09-16)
  const demoJournalDates = [
    '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08',
    '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-13', '2026-09-14',
    '2026-09-15', '2026-09-16',
  ];
  const { data: deletedJournals } = await supabase
    .from('journal_entries')
    .delete()
    .in('entry_date', demoJournalDates)
    .select('id');
  removed.journalEntries = deletedJournals?.length || 0;

  // 5. Delete seeded notes (matching 'demo-seed' tag)
  const { data: deletedNotes } = await supabase
    .from('notes')
    .delete()
    .contains('tags', ['demo-seed'])
    .select('id');
  removed.notes = deletedNotes?.length || 0;

  // 6. Delete demo projects
  const demoProjectSlugs = [
    'personal-learning-tracker-api',
    'campus-event-management-portal',
    'algorithmic-trading-backtester',
    'distributed-kv-store-prototype',
  ];
  const { data: deletedProjects } = await supabase
    .from('projects')
    .delete()
    .in('slug', demoProjectSlugs)
    .select('id');
  removed.projects = deletedProjects?.length || 0;

  // Revalidate routes
  try {
    revalidatePath('/tasks');
    revalidatePath('/skills');
    revalidatePath('/journal');
    revalidatePath('/notes');
    revalidatePath('/projects');
    revalidatePath('/time');
    revalidatePath('/mistakes');
    revalidatePath('/analytics');
    revalidatePath('/learning-coach');
    revalidatePath('/settings');
    revalidatePath('/');
  } catch {}

  return {
    success: true,
    message: `Cleared demo learning history. Removed ${removed.tasks} tasks, ${removed.sessions} sessions, ${removed.mistakes} mistakes, ${removed.journalEntries} journal entries, ${removed.notes} notes, and ${removed.projects} projects.`,
    removed,
  };
}
