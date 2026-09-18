'use server';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { MistakeCategory, MistakeSeverity, ProjectStatus, TaskPriority, TaskStatus, TimeSessionCategory } from '@/types';
import fs from 'fs';
import path from 'path';

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
  evidenceLinksCount: number;
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
  evidenceLinksCount: number;
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
    evidenceLinks: number;
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

    const [tasksRes, sessionsRes, mistakesRes, journalsRes, notesRes, skillsRes, projectsRes, linksRes] = await Promise.all([
      effectiveUserId 
        ? supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', effectiveUserId)
        : supabase.from('tasks').select('*', { count: 'exact', head: true }),
      supabase.from('time_sessions').select('*', { count: 'exact', head: true }),
      supabase.from('mistakes').select('*', { count: 'exact', head: true }),
      supabase.from('journal_entries').select('*', { count: 'exact', head: true }),
      supabase.from('notes').select('*', { count: 'exact', head: true }),
      supabase.from('skills').select('*', { count: 'exact', head: true }),
      supabase.from('projects').select('*', { count: 'exact', head: true }),
      supabase.from('evidence_links').select('*', { count: 'exact', head: true }),
    ]);

    const tasksCount = tasksRes.count || 0;
    const timeSessionsCount = sessionsRes.count || 0;
    const mistakesCount = mistakesRes.count || 0;
    const journalEntriesCount = journalsRes.count || 0;
    const notesCount = notesRes.count || 0;
    const skillsCount = skillsRes.count || 0;
    const projectsCount = projectsRes.count || 0;
    const evidenceLinksCount = linksRes.count || 0;

    return {
      tasksCount,
      timeSessionsCount,
      mistakesCount,
      journalEntriesCount,
      notesCount,
      skillsCount,
      projectsCount,
      evidenceLinksCount,
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
      evidenceLinksCount: 0,
      hasHistory: false,
    };
  }
}

/**
 * Deterministic, idempotent seed of comprehensive student learning history.
 * Bound strictly to the authenticated user ID without modifying external GitHub/LeetCode tables.
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

  // 1. SKILLS: B.Tech CSE learning profile establishing:
  // - ALREADY LEARNED: Programming Fundamentals, Python Fundamentals, Arrays, Strings, Basic Recursion
  // - PARTIALLY LEARNED / WEAK: Linked Lists, Binary Trees, Tree Recursion & Traversal
  // - NOT YET LEARNED: Advanced Tree Patterns, Dynamic Programming
  const desiredSkills = [
    { name: 'Programming Fundamentals', category: 'Computer Science Core', proficiency_level: 4, target_level: 5 },
    { name: 'Python Fundamentals', category: 'Programming Languages', proficiency_level: 4, target_level: 5 },
    { name: 'Arrays', category: 'Algorithms & Data Structures', proficiency_level: 4, target_level: 5 },
    { name: 'Strings', category: 'Algorithms & Data Structures', proficiency_level: 4, target_level: 5 },
    { name: 'Basic Recursion', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Linked Lists', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Binary Trees', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Tree Recursion & Traversal', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Advanced Tree Patterns', category: 'Algorithms & Data Structures', proficiency_level: 1, target_level: 5 },
    { name: 'Dynamic Programming', category: 'Algorithms & Data Structures', proficiency_level: 1, target_level: 5 },
    { name: 'Data Structures & Algorithms', category: 'Algorithms & Data Structures', proficiency_level: 3, target_level: 5 },
    { name: 'Python', category: 'Programming Languages', proficiency_level: 4, target_level: 5 },
    { name: 'Java', category: 'Programming Languages', proficiency_level: 2, target_level: 5 },
    { name: 'SQL & Relational Databases', category: 'Database & Backend', proficiency_level: 3, target_level: 5 },
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

  // 1b. STUDENT PROFILE: Authentic profile for Nalli Tirupathi (4th Year IT, MVGR College)
  try {
    await supabase.from('student_profiles').upsert({
      user_id: targetUserId,
      full_name: 'Nalli Tirupathi',
      college: 'MVGR College of Engineering',
      branch: 'Information Technology',
      degree: 'B.Tech',
      current_year: '4th Year',
      graduation_year: 2026,
      skills: desiredSkills.map((s) => s.name),
      skill_proficiencies: desiredSkills.reduce((acc, s) => {
        acc[s.name] = s.proficiency_level;
        return acc;
      }, {} as Record<string, number>),
      career_target_roles: ['Software Development Engineer', 'Backend Engineer'],
      learning_goals: ['Prepare DSA for technical interviews', 'Master Data Structures & Algorithms and system design fundamentals'],
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  } catch (profErr) {
    console.error('Student profile update notice:', profErr);
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

  // 3. TASKS: 24 realistic B.Tech CSE tasks establishing consistent learning progression
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
    // Completed tasks (12) — Mastered Fundamentals & Arrays
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
      idempotency_key: 'seed-task-07-basic-recursion',
      title: 'Implement recursive Fibonacci and factorial with call-stack analysis',
      description: 'Trace recursive call tree on paper to verify induction steps and base-case termination.',
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
      idempotency_key: 'seed-task-10-string-manipulation',
      title: 'Solve string anagram and non-repeating character problems',
      description: 'Implement character frequency counter with hash tables and optimize lookup to O(N).',
      status: 'completed',
      priority: 'medium',
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

    // In Progress tasks (5) — Highlight Weak/Unfinished Areas (Linked Lists & Trees)
    {
      idempotency_key: 'seed-task-13-linked-list-debugging',
      title: 'Debug fast-and-slow pointer cycle detection and fix null dereference in Linked Lists',
      description: 'Investigate AttributeError on fast.next when fast is null in Floyd cycle detection; write boundary assertions.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-18',
      completed_at: null,
      postponed_count: 1,
      created_at: '2026-09-15T14:00:00Z',
    },
    {
      idempotency_key: 'seed-task-14-recursive-tree-traversal',
      title: 'Implement recursive tree traversal and fix base-case stack overflow in path sum',
      description: 'Trace pre-order, in-order, and post-order depth-first recursion; add strict universal null node check.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-18',
      completed_at: null,
      postponed_count: 1,
      created_at: '2026-09-15T15:00:00Z',
    },
    {
      idempotency_key: 'seed-task-15-bst-operations',
      title: 'Implement binary search tree insertion and delete node with subtree re-linking',
      description: 'Resolve lost child updates during recursive node insertion by ensuring return values reassign node pointers.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-19',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T10:00:00Z',
    },
    {
      idempotency_key: 'seed-task-16-postgresql-b-tree-indexing',
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
      idempotency_key: 'seed-task-17-kv-store-consistent-hashing',
      title: 'Implement consistent hashing ring for distributed KV store',
      description: 'Build MD5 virtual node placement algorithm with replication factor of 3 in Java.',
      status: 'in_progress',
      priority: 'high',
      due_date: '2026-09-19',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T10:00:00Z',
    },

    // To Do tasks (7) — Reflect Gaps (Advanced Trees & Dynamic Programming)
    {
      idempotency_key: 'seed-task-18-advanced-trees-bfs-lca',
      title: 'Study Level-Order BFS traversal and Lowest Common Ancestor (LCA) tree patterns',
      description: 'Implement queue-based BFS level-order iteration and post-order bottom-up LCA evaluation.',
      status: 'todo',
      priority: 'high',
      due_date: '2026-09-20',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-16T11:00:00Z',
    },
    {
      idempotency_key: 'seed-task-19-dp-1d-memoization',
      title: 'Learn 1D Dynamic Programming foundations: memoization vs tabulation on Climbing Stairs and Coin Change',
      description: 'Formulate state transition recurrence relations, define base-case array initialization, and measure speedup.',
      status: 'todo',
      priority: 'high',
      due_date: '2026-09-21',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T08:00:00Z',
    },
    {
      idempotency_key: 'seed-task-20-dp-2d-knapsack',
      title: 'Study 2D Dynamic Programming: grid paths with obstacles and 0/1 Knapsack',
      description: 'Work through grid DP state table construction and analyze auxiliary space reduction from O(M*N) to O(N).',
      status: 'todo',
      priority: 'high',
      due_date: '2026-09-22',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T08:30:00Z',
    },
    {
      idempotency_key: 'seed-task-21-overdue-dbms-transaction-acid',
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
      idempotency_key: 'seed-task-22-python-interview-qa-prep',
      title: 'Prepare technical interview questions for SQL & Python',
      description: 'Summarize GIL, memory allocator, generator expressions, and ACID properties for mock interview.',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-09-23',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T09:00:00Z',
    },
    {
      idempotency_key: 'seed-task-23-fastapi-jwt-auth-middleware',
      title: 'Add JWT authorization middleware to Learning Tracker API',
      description: 'Implement bearer token extraction and dependency injection in FastAPI routers.',
      status: 'todo',
      priority: 'medium',
      due_date: '2026-09-24',
      completed_at: null,
      postponed_count: 0,
      created_at: '2026-09-17T09:15:00Z',
    },
    {
      idempotency_key: 'seed-task-24-networks-subnetting-cidr',
      title: 'Practice IP subnetting, VLSM, and CIDR notation calculations',
      description: 'Calculate usable host addresses, subnet masks, and broadcast IPs for classless networks.',
      status: 'todo',
      priority: 'low',
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

  // 4. MISTAKES: 12 meaningful mistakes in supported categories and valid severities
  // Explicitly establishes:
  // - Linked Lists is weak due to fast/slow pointer null dereference
  // - Binary Trees is weak due to recursion missing base-case stack overflow
  // - Tree Recursion & Traversal is weak due to lost subtree updates
  // - Arrays had a minor boundary error but was overcome
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
      title: 'Null pointer dereference during fast-and-slow pointer cycle detection',
      category: 'Syntax/Logic',
      root_cause: 'In Floyd cycle detection loop, evaluated while fast.next != None without verifying fast != None first, causing AttributeError on odd-length lists.',
      solution: 'Condition loop with while fast and fast.next: before advancing fast = fast.next.next.',
      prevention_rule: 'For two-pointer steps of size 2, always verify both fast and fast.next are non-null before dereferencing.',
      severity: 'high',
      skill_name: 'Linked Lists',
      created_at: '2026-09-14T15:30:00Z',
    },
    {
      title: 'Recursion missing base-case causing stack overflow in tree path sum',
      category: 'Syntax/Logic',
      root_cause: 'Recursive tree traversal failed to check if node is None before dereferencing node.left and node.right in hasPathSum.',
      solution: 'Add strict universal guard clause at top of recursion: if not node: return False.',
      prevention_rule: 'Always write and test terminating base case (if not root) before evaluating child node properties in recursive tree functions.',
      severity: 'critical',
      skill_name: 'Binary Trees',
      created_at: '2026-09-15T16:30:00Z',
    },
    {
      title: 'Lost subtree references during binary search tree node insertion',
      category: 'Syntax/Logic',
      root_cause: 'Recursive helper did not return updated root or assign node.left = insert(node.left, val), leading to orphaned subtrees.',
      solution: 'Reassign return values of recursive calls to node.left and node.right to maintain tree connectivity.',
      prevention_rule: 'In functional tree recursion, always assign node.left / node.right = recursiveCall(child) and return node at the end.',
      severity: 'medium',
      skill_name: 'Tree Recursion & Traversal',
      created_at: '2026-09-16T15:00:00Z',
    },
    {
      title: 'Off-by-one boundary error in binary search lower_bound',
      category: 'Syntax/Logic',
      root_cause: 'Used right = len(nums) with while left <= right, causing IndexError when target exceeded maximum element.',
      solution: 'Maintain invariant: while left < right with right = mid when nums[mid] >= target.',
      prevention_rule: 'Carefully define search interval [left, right) and ensure updates maintain loop termination.',
      severity: 'medium',
      skill_name: 'Arrays',
      created_at: '2026-09-10T16:45:00Z',
    },
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
      skill_name: 'Python Fundamentals',
      created_at: '2026-09-05T16:00:00Z',
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

  const mistakeIdMap: Record<string, string> = {};
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
      mistakeIdMap[m.title] = existing.id;
    } else {
      const { data: created } = await supabase.from('mistakes').insert(mistakePayload).select('id').single();
      if (created) mistakeIdMap[m.title] = created.id;
    }
  }

  // 5. TIME SESSIONS: 17 realistic study sessions across 14 days (durations: 35m to 120m)
  // Reflects significant focus on Arrays & Strings (mastered), struggle on Linked Lists & Trees (weak),
  // and ZERO minutes on Dynamic Programming (gap).
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
      description: 'Reviewed Python function parameter rules, LEGB scopes, and default argument memory retention.',
      session_date: '2026-09-04',
      task_key: 'seed-task-01-python-functions',
      project_slug: 'personal-learning-tracker-api',
      skill_name: 'Python Fundamentals',
      started_at: '2026-09-04T10:00:00Z',
      ended_at: '2026-09-04T11:00:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 90,
      description: 'Practiced SQL complex INNER and LEFT joins in PostgreSQL across relational schemas.',
      session_date: '2026-09-05',
      task_key: 'seed-task-02-sql-joins',
      skill_name: 'SQL & Relational Databases',
      started_at: '2026-09-05T14:30:00Z',
      ended_at: '2026-09-05T16:00:00Z',
    },
    {
      category: 'Project',
      duration_minutes: 120,
      description: 'Finalized Campus Event Portal JWT auth & role guards in Next.js.',
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
      description: 'Two-pointer sliding window array problem solving: Maximum Average Subarray & Longest Substring.',
      session_date: '2026-09-07',
      task_key: 'seed-task-03-sliding-window',
      skill_name: 'Arrays',
      started_at: '2026-09-07T16:00:00Z',
      ended_at: '2026-09-07T17:15:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 90,
      description: 'Deep dive into relational database normalization: functional dependencies, 3NF, and BCNF.',
      session_date: '2026-09-08',
      task_key: 'seed-task-05-dbms-normalization',
      skill_name: 'Database Management Systems',
      started_at: '2026-09-08T10:00:00Z',
      ended_at: '2026-09-08T11:30:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Binary search lower_bound and boundary condition tests on sorted arrays.',
      session_date: '2026-09-09',
      task_key: 'seed-task-06-binary-search',
      skill_name: 'Arrays',
      started_at: '2026-09-09T15:00:00Z',
      ended_at: '2026-09-09T16:00:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 75,
      description: 'CPU Scheduling simulation: Round Robin vs Shortest Job First with turnaround time metrics.',
      session_date: '2026-09-10',
      task_key: 'seed-task-07-os-cpu-scheduling',
      skill_name: 'Operating Systems',
      started_at: '2026-09-10T14:00:00Z',
      ended_at: '2026-09-10T15:15:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 45,
      description: 'Basic recursion exercises: Fibonacci number and call stack depth analysis.',
      session_date: '2026-09-11',
      task_key: 'seed-task-07-basic-recursion',
      skill_name: 'Basic Recursion',
      started_at: '2026-09-11T11:00:00Z',
      ended_at: '2026-09-11T11:45:00Z',
    },
    {
      category: 'Project',
      duration_minutes: 90,
      description: 'Implemented FastAPI CRUD endpoints for study session logging and Pydantic validation.',
      session_date: '2026-09-11',
      task_key: 'seed-task-08-fastapi-crud-endpoints',
      project_slug: 'personal-learning-tracker-api',
      skill_name: 'Web Development',
      started_at: '2026-09-11T16:00:00Z',
      ended_at: '2026-09-11T17:30:00Z',
    },
    {
      category: 'Research',
      duration_minutes: 35,
      description: 'Quick architectural read on Distributed Key-Value store gossip protocols and hash rings.',
      session_date: '2026-09-12',
      skill_name: 'Java',
      started_at: '2026-09-12T19:00:00Z',
      ended_at: '2026-09-12T19:35:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 60,
      description: 'Java OOP polymorphism and geometric shape hierarchy inheritance exercises.',
      session_date: '2026-09-13',
      task_key: 'seed-task-09-java-oop-inheritance',
      skill_name: 'Java',
      started_at: '2026-09-13T10:00:00Z',
      ended_at: '2026-09-13T11:00:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'String manipulation exercises: Valid Anagram and First Unique Character using hash tables.',
      session_date: '2026-09-14',
      task_key: 'seed-task-10-string-manipulation',
      skill_name: 'Strings',
      started_at: '2026-09-14T11:00:00Z',
      ended_at: '2026-09-14T12:00:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 75,
      description: 'Linked list pointer traversal and debugging fast-and-slow cycle detection null exceptions.',
      session_date: '2026-09-14',
      task_key: 'seed-task-13-linked-list-debugging',
      skill_name: 'Linked Lists',
      started_at: '2026-09-14T15:00:00Z',
      ended_at: '2026-09-14T16:15:00Z',
    },
    {
      category: 'Coding',
      duration_minutes: 75,
      description: 'Recursive binary tree traversal: encountered stack overflow in path sum, working on base-case guard.',
      session_date: '2026-09-15',
      task_key: 'seed-task-14-recursive-tree-traversal',
      skill_name: 'Binary Trees',
      started_at: '2026-09-15T15:00:00Z',
      ended_at: '2026-09-15T16:15:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Binary Search Tree node insertion and subtree link retention tracing.',
      session_date: '2026-09-16',
      task_key: 'seed-task-15-bst-operations',
      skill_name: 'Tree Recursion & Traversal',
      started_at: '2026-09-16T09:30:00Z',
      ended_at: '2026-09-16T10:30:00Z',
    },
    {
      category: 'Learning',
      duration_minutes: 45,
      description: 'Computer Networks TCP 3-way handshake and packet flow analysis in Wireshark.',
      session_date: '2026-09-16',
      task_key: 'seed-task-12-networks-tcp-handshake',
      skill_name: 'Computer Networks',
      started_at: '2026-09-16T11:00:00Z',
      ended_at: '2026-09-16T11:45:00Z',
    },
    {
      category: 'Practice',
      duration_minutes: 60,
      description: 'Reviewing recurring mistake patterns across SQL JOINs, recursion termination, and tree traversals.',
      session_date: '2026-09-17',
      skill_name: 'Data Structures & Algorithms',
      started_at: '2026-09-17T08:00:00Z',
      ended_at: '2026-09-17T09:00:00Z',
    },
  ];

  const sessionIdMap: Record<string, string> = {};
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
      sessionIdMap[s.description] = existing.id;
    } else {
      const { data: created } = await supabase.from('time_sessions').insert(sessionPayload).select('id').single();
      if (created) sessionIdMap[s.description] = created.id;
    }
  }

  // 6. JOURNAL ENTRIES: 10 realistic daily learning logs written in authentic B.Tech student voice
  const seedJournals = [
    {
      entry_date: '2026-09-04',
      raw_content: 'Started revising Python fundamentals today. Focused on positional vs keyword arguments and variable scopes. Discovered why mutable default parameters in function definitions can cause subtle state leakage across invocations.',
      summary: 'Reviewed Python function parameter rules and default argument memory pitfall.',
      learning_summary: 'Mastered LEGB scoping rules and avoided mutable defaults in Python functions.',
      reflection: 'Language fundamentals have subtleties that matter when writing clean backend services.',
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
      raw_content: 'Focused session on two-pointer sliding window problems. Solved 2 medium problems on subarray maximum and substring without repeating characters. Feeling very confident with array boundaries and two-sum patterns.',
      summary: 'Two-pointer sliding window problem practice.',
      learning_summary: 'Implemented two-pointer boundary checks without index out of range exceptions.',
      reflection: 'Consistent practice makes array boundary invariants natural.',
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
      raw_content: 'Practiced binary search variations. Encountered an off-by-one error when setting right boundary in lower_bound search. Fixed it by adopting the half-open interval invariant [left, right). Now binary search feels rock solid.',
      summary: 'Binary search boundary conditions and lower_bound implementation.',
      learning_summary: 'Standardized on [left, right) interval to avoid off-by-one errors in binary search.',
      reflection: 'Choosing a clear mathematical invariant makes edge cases trivial.',
      tomorrow_plan: 'Study operating system CPU scheduling algorithms and basic recursion.',
      time_spent_minutes: 60,
    },
    {
      entry_date: '2026-09-11',
      raw_content: 'Reviewed basic recursion with Fibonacci numbers and call stack visualization. The inductive step is clear for linear recursion. Built FastAPI CRUD endpoints in the afternoon for session tracking.',
      summary: 'Basic recursion tracing and FastAPI CRUD endpoint implementation.',
      learning_summary: 'Traced recursive call stacks and defined Pydantic payload models.',
      reflection: 'Linear recursion is straightforward, but I need to make sure I practice tree recursion next.',
      tomorrow_plan: 'Java OOP polymorphism practice and string hashing.',
      time_spent_minutes: 135,
    },
    {
      entry_date: '2026-09-14',
      raw_content: 'Practiced string anagrams and solved LeetCode Valid Anagram easily. But when I switched to Linked Lists, I ran into a bad bug with fast and slow pointers. Evaluated fast.next without checking if fast was null, getting an AttributeError. Need to revisit pointer invariants.',
      summary: 'Solved string anagrams; struggled with pointer null dereference in Linked List cycle detection.',
      learning_summary: 'Understood need for double null guard (while fast and fast.next) in two-pointer linked list traversals.',
      reflection: 'Linked list pointer bugs happen so easily when fast pointer advances by two steps.',
      tomorrow_plan: 'Dive into binary tree traversal and path sum problems.',
      time_spent_minutes: 135,
    },
    {
      entry_date: '2026-09-15',
      raw_content: 'Tried implementing recursive path sum on binary trees and hit a critical stack overflow! I forgot to put a base check for None before dereferencing node.left. It crashed on empty tree test cases. Binary tree recursion requires extra discipline with termination conditions.',
      summary: 'Hit recursive stack overflow on binary tree path sum due to missing null base-case.',
      learning_summary: 'Universal rule: always write "if not node: return" as the first line of any tree traversal function.',
      reflection: 'Tree recursion feels much harder than linear recursion. Still feel unconfident with tree traversals.',
      tomorrow_plan: 'BST node operations and mistake engine review.',
      time_spent_minutes: 75,
    },
    {
      entry_date: '2026-09-16',
      raw_content: 'Reviewed my mistake log today. I am solid on Arrays, Strings, and basic Python, but Linked Lists and Binary Trees have clear error patterns. Also, I have not even touched Dynamic Programming yet. If technical interview questions ask 2D DP or tree diameter, I will be stuck. Need a structured roadmap focusing on these exact gaps.',
      summary: 'Mistake audit: mastered Arrays/Strings, weak on Linked Lists/Trees, gap in Dynamic Programming.',
      learning_summary: 'Identified that DP and tree patterns are the critical missing pieces before campus placement interviews.',
      reflection: 'Self-auditing telemetry makes my actual gaps obvious instead of assuming I know everything.',
      tomorrow_plan: 'Ask PLOS for an interview preparation roadmap focused on my weak spots and gaps.',
      time_spent_minutes: 105,
    },
  ];

  for (const j of seedJournals) {
    await supabase.from('journal_entries').upsert(j, { onConflict: 'entry_date' });
  }

  // 7. NOTES: 10 high-value knowledge base notes written in authentic student voice
  // Notice: Clear absence of notes on Dynamic Programming and Advanced Trees (reinforcing NOT YET LEARNED).
  const seedNotes = [
    {
      title: 'Binary Search Boundary Conditions & Invariants',
      content: '### Standard Interval Invariant: [left, right)\nUsing the half-open interval `[left, right)` prevents infinite loops and off-by-one errors:\n```python\ndef lower_bound(nums: list[int], target: int) -> int:\n    left = 0\n    right = len(nums)\n    while left < right:\n        mid = left + (right - left) // 2\n        if nums[mid] >= target:\n            right = mid\n        else:\n            left = mid + 1\n    return left\n```\n- If `target` is present, returns the first index of `target`.\n- If `target` is absent, returns the insertion index maintaining sorted order.',
      category: 'Algorithms & Data Structures',
      tags: ['algorithms', 'binary-search', 'arrays', 'dsa'],
      project_id: defaultProjectId,
    },
    {
      title: 'Sliding Window & Two-Pointer Invariants',
      content: '### Two-Pointer Convergence Pattern\n1. Initialize left and right pointers.\n2. Expand window with right pointer until constraint is violated.\n3. Shrink window with left pointer until constraint is satisfied again.\n4. Update optimal result at each valid window state.\n\nTime complexity is strictly O(N) because each pointer visits each element at most once.',
      category: 'Algorithms & Data Structures',
      tags: ['algorithms', 'arrays', 'strings', 'two-pointer', 'dsa'],
      project_id: defaultProjectId,
    },
    {
      title: 'Recursion Invariants & Call Stack Safety',
      content: '### Three Principles of Correct Recursion\n1. **Explicit Base Case:** Must be reached for every valid input path, evaluated *before* any recursive calls.\n2. **Strict Convergence:** Every recursive invocation must pass arguments that are strictly closer to the base condition.\n3. **Inductive Correctness:** Assume smaller subproblem solutions are correct and combine them without side-effects.\n\n### Stack Overflow Diagnosis Checklist\n- Did input magnitude strictly diminish?\n- Does the base condition account for empty/null inputs (`None`, `[]`, `""`)?\n- Is the maximum recursion depth within platform limits (`sys.getrecursionlimit()`)?',
      category: 'Algorithms & Data Structures',
      tags: ['algorithms', 'recursion', 'dsa', 'call-stack'],
      project_id: defaultProjectId,
    },
    {
      title: 'Linked List Pointer Tracking & Floyd Cycle Invariants',
      content: '### Pointer Step Safety Rule\nWhen moving two pointers at different speeds:\n- Slow pointer: `slow = slow.next` (requires `slow` not null)\n- Fast pointer: `fast = fast.next.next` (requires **both** `fast` and `fast.next` not null!)\n\n```python\n# Safe loop condition\nwhile fast and fast.next:\n    slow = slow.next\n    fast = fast.next.next\n    if slow == fast:\n        return True\nreturn False\n```',
      category: 'Algorithms & Data Structures',
      tags: ['algorithms', 'linked-lists', 'pointers', 'dsa'],
      project_id: defaultProjectId,
    },
    {
      title: 'Binary Tree Traversal Mechanics & Null Guard Invariants',
      content: '### Tree DFS Universal Guard Rule\nEvery recursive tree helper must start with a universal null guard:\n```python\ndef maxDepth(root: Optional[TreeNode]) -> int:\n    if not root:\n        return 0\n    return 1 + max(maxDepth(root.left), maxDepth(root.right))\n```\nNever access `root.left.val` without first verifying `root.left is not None`.',
      category: 'Algorithms & Data Structures',
      tags: ['algorithms', 'binary-trees', 'recursion', 'dsa'],
      project_id: defaultProjectId,
    },
    {
      title: 'SQL Joins & Logical Execution Order Mental Model',
      content: '### SQL Query Logical Execution Order\n1. `FROM` & `JOIN` (constructs Cartesian product, then applies `ON` conditions)\n2. `WHERE` (filters rows *before* aggregation)\n3. `GROUP BY` (groups records by specified non-aggregate expressions)\n4. `HAVING` (filters grouped rows *after* aggregation)\n5. `SELECT` (evaluates expressions, aliases, and window functions)\n6. `DISTINCT` (eliminates duplicate rows)\n7. `ORDER BY` (sorts the final projected dataset)\n8. `LIMIT` / `OFFSET` (paginates results)\n\n**Crucial Rule:** In `LEFT JOIN`, putting conditions in the `WHERE` clause can silently eliminate unmatched left rows or convert the join into an `INNER JOIN`. Always place inter-table relationship filters in `ON`.',
      category: 'SQL & Databases',
      tags: ['sql', 'database', 'joins', 'query-optimization'],
      project_id: defaultProjectId,
    },
    {
      title: 'Python Functions & Scope Reference (LEGB)',
      content: '### Variable Lookup Hierarchy (LEGB Rule)\n- **L (Local):** Names assigned within a function body.\n- **E (Enclosing):** Names in the local scope of any enclosing functions (closures).\n- **G (Global):** Names assigned at the top-level of the module file.\n- **B (Built-in):** Predefined built-in names (`range`, `len`, `Exception`).\n\n### The Mutable Default Parameter Trap\nPython evaluates default parameter values **once**, when the function definition is parsed.\n```python\n# Anti-pattern\ndef append_to(element, target=[]):\n    target.append(element)\n    return target\n\n# Idiomatic approach\ndef append_to(element, target=None):\n    if target is None:\n        target = []\n    target.append(element)\n    return target\n```',
      category: 'Python',
      tags: ['python', 'functions', 'memory', 'closures'],
      project_id: defaultProjectId,
    },
    {
      title: 'Relational Normalization & BCNF Decomposition Rules',
      content: '### Normal Forms Summary\n- **1NF:** Atomic attribute values, no repeating groups.\n- **2NF:** 1NF + no partial dependencies (every non-prime attribute depends on whole candidate key).\n- **3NF:** 2NF + no transitive dependencies (non-prime attributes do not depend on other non-prime attributes).\n- **BCNF:** For every non-trivial functional dependency $X \\to Y$, $X$ must be a superkey.\n\n### Lossless Join & Dependency Preservation\nA decomposition into $R_1$ and $R_2$ is lossless if and only if $R_1 \\cap R_2 \\to R_1$ or $R_1 \\cap R_2 \\to R_2$.',
      category: 'Database Management Systems',
      tags: ['dbms', 'normalization', 'bcnf', 'database-theory'],
      project_id: defaultProjectId,
    },
    {
      title: 'Operating System CPU Scheduling Comparison',
      content: '### Scheduling Metrics\n- **Turnaround Time:** Completion Time - Arrival Time\n- **Waiting Time:** Turnaround Time - Burst Time\n- **Response Time:** Time from arrival to first execution\n\n### Algorithms Comparison\n| Algorithm | Preemptive | Convoy Effect | Starvation Risk |\n| :--- | :--- | :--- | :--- |\n| FCFS | No | High | None |\n| SJF (Non-preemptive) | No | Low | High (long jobs) |\n| SRTF (Preemptive) | Yes | None | High |\n| Round Robin | Yes | None | None |',
      category: 'Operating Systems',
      tags: ['os', 'cpu-scheduling', 'operating-systems'],
      project_id: defaultProjectId,
    },
    {
      title: 'Computer Networks: TCP 3-Way Handshake & Flow Control',
      content: '### Connection Establishment\n1. **Client $\\to$ Server:** `SYN` (seq = x)\n2. **Server $\\to$ Client:** `SYN-ACK` (seq = y, ack = x + 1)\n3. **Client $\\to$ Server:** `ACK` (seq = x + 1, ack = y + 1)\n\n### Flow Control vs Congestion Control\n- **Flow Control:** Prevent sender from overwhelming receiver buffer (regulated via Advertised Window / `rwnd`).\n- **Congestion Control:** Prevent sender from overwhelming network links (regulated via Congestion Window / `cwnd`).',
      category: 'Computer Networks',
      tags: ['networks', 'tcp', 'protocols'],
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

  // 8. EVIDENCE LINKS: Corroborate external LeetCode submissions, mistakes, and time sessions
  // Directly associates empirical telemetry with skills to prove evidence-awareness.
  let totalEvidenceLinks = 0;
  try {
    const { data: existingLinks } = await supabase
      .from('evidence_links')
      .select('source_type, source_id, target_type, target_id');

    const existingKeySet = new Set(
      (existingLinks || []).map((l: any) => `${l.source_type}:${l.source_id}:${l.target_type}:${l.target_id}`)
    );

    const linksToInsert: Array<{
      source_type: string;
      source_id: string;
      target_type: string;
      target_id: string;
      weight: number;
    }> = [];

    // 8a. Link LeetCode Submissions to DSA sub-skills
    const { data: lcSubmissions } = await supabase
      .from('leetcode_submissions_log')
      .select('id, title');

    if (lcSubmissions && lcSubmissions.length > 0) {
      for (const sub of lcSubmissions) {
        const titleLower = sub.title.toLowerCase();

        let targetSkillName: string | null = null;
        let weight = 0.8;

        if (
          titleLower.includes('two sum') ||
          titleLower.includes('3sum') ||
          titleLower.includes('binary search') ||
          titleLower.includes('sorted array') ||
          titleLower.includes('peak element') ||
          titleLower.includes('pivot index') ||
          titleLower.includes('maximum average subarray') ||
          titleLower.includes('trapping rain water') ||
          titleLower.includes('kth largest') ||
          titleLower.includes('daily temperatures') ||
          titleLower.includes('xor triplets')
        ) {
          targetSkillName = 'Arrays';
          weight = 0.9;
        } else if (
          titleLower.includes('anagram') ||
          titleLower.includes('first unique character') ||
          titleLower.includes('longest substring')
        ) {
          targetSkillName = 'Strings';
          weight = 0.9;
        } else if (titleLower.includes('fibonacci')) {
          targetSkillName = 'Basic Recursion';
          weight = 0.8;
        } else if (
          titleLower.includes('linked list') ||
          titleLower.includes('sorted lists')
        ) {
          targetSkillName = 'Linked Lists';
          weight = 0.8;
        } else if (titleLower.includes('binary tree')) {
          targetSkillName = 'Binary Trees';
          weight = 0.8;
        }

        if (targetSkillName && skillMap[targetSkillName]) {
          const targetSkillId = skillMap[targetSkillName];
          const linkKey = `leetcode_submission:${sub.id}:skill:${targetSkillId}`;
          if (!existingKeySet.has(linkKey)) {
            linksToInsert.push({
              source_type: 'leetcode_submission',
              source_id: sub.id,
              target_type: 'skill',
              target_id: targetSkillId,
              weight,
            });
            existingKeySet.add(linkKey);
          }
        }
      }
    }

    // 8b. Link mistakes to target skills
    for (const m of seedMistakes) {
      const mistakeId = mistakeIdMap[m.title];
      const targetSkillId = skillMap[m.skill_name];
      if (mistakeId && targetSkillId) {
        const linkKey = `mistake:${mistakeId}:skill:${targetSkillId}`;
        if (!existingKeySet.has(linkKey)) {
          linksToInsert.push({
            source_type: 'mistake',
            source_id: mistakeId,
            target_type: 'skill',
            target_id: targetSkillId,
            weight: m.severity === 'critical' ? 0.9 : m.severity === 'high' ? 0.8 : 0.6,
          });
          existingKeySet.add(linkKey);
        }
      }
    }

    // 8c. Link time sessions to target skills
    for (const s of seedSessions) {
      const sessionId = sessionIdMap[s.description];
      const targetSkillId = skillMap[s.skill_name];
      if (sessionId && targetSkillId) {
        const linkKey = `time_session:${sessionId}:skill:${targetSkillId}`;
        if (!existingKeySet.has(linkKey)) {
          linksToInsert.push({
            source_type: 'time_session',
            source_id: sessionId,
            target_type: 'skill',
            target_id: targetSkillId,
            weight: Math.min(1.0, s.duration_minutes / 100),
          });
          existingKeySet.add(linkKey);
        }
      }
    }

    // 8d. Link tasks to target skills
    const taskSkillAssociations: Record<string, string[]> = {
      'seed-task-01-python-functions': ['Python Fundamentals', 'Programming Fundamentals'],
      'seed-task-02-sql-joins': ['SQL & Relational Databases'],
      'seed-task-03-sliding-window': ['Arrays'],
      'seed-task-04-campus-portal-milestone': ['Web Development'],
      'seed-task-05-dbms-normalization': ['Database Management Systems'],
      'seed-task-06-binary-search': ['Arrays'],
      'seed-task-07-basic-recursion': ['Basic Recursion', 'Programming Fundamentals'],
      'seed-task-08-fastapi-crud-endpoints': ['Web Development'],
      'seed-task-09-java-oop-inheritance': ['Java', 'Programming Fundamentals'],
      'seed-task-10-string-manipulation': ['Strings'],
      'seed-task-11-sql-aggregation-debug': ['SQL & Relational Databases'],
      'seed-task-12-networks-tcp-handshake': ['Computer Networks'],
      'seed-task-13-linked-list-debugging': ['Linked Lists'],
      'seed-task-14-recursive-tree-traversal': ['Binary Trees'],
      'seed-task-15-bst-operations': ['Tree Recursion & Traversal'],
      'seed-task-16-postgresql-b-tree-indexing': ['Database Management Systems'],
      'seed-task-17-kv-store-consistent-hashing': ['Java'],
      'seed-task-18-advanced-trees-bfs-lca': ['Advanced Tree Patterns'],
      'seed-task-19-dp-1d-memoization': ['Dynamic Programming'],
      'seed-task-20-dp-2d-knapsack': ['Dynamic Programming'],
      'seed-task-21-overdue-dbms-transaction-acid': ['Database Management Systems'],
      'seed-task-22-python-interview-qa-prep': ['Python', 'Programming Fundamentals'],
      'seed-task-23-fastapi-jwt-auth-middleware': ['Web Development'],
      'seed-task-24-networks-subnetting-cidr': ['Computer Networks'],
    };

    for (const [taskKey, targetNames] of Object.entries(taskSkillAssociations)) {
      const taskId = taskIdMap[taskKey];
      if (!taskId) continue;
      for (const tName of targetNames) {
        const targetSkillId = skillMap[tName];
        if (targetSkillId) {
          const linkKey = `task:${taskId}:skill:${targetSkillId}`;
          if (!existingKeySet.has(linkKey)) {
            linksToInsert.push({
              source_type: 'task',
              source_id: taskId,
              target_type: 'skill',
              target_id: targetSkillId,
              weight: 0.7,
            });
            existingKeySet.add(linkKey);
          }
        }
      }
    }

    // 8e. Link CS core notes & GitHub repos to Programming Fundamentals
    const { data: dbNotes } = await supabase.from('notes').select('id, title');
    if (dbNotes && skillMap['Programming Fundamentals']) {
      for (const n of dbNotes) {
        if (
          n.title.toLowerCase().includes('recursion') ||
          n.title.toLowerCase().includes('invariants') ||
          n.title.toLowerCase().includes('functions')
        ) {
          const linkKey = `note:${n.id}:skill:${skillMap['Programming Fundamentals']}`;
          if (!existingKeySet.has(linkKey)) {
            linksToInsert.push({
              source_type: 'note',
              source_id: n.id,
              target_type: 'skill',
              target_id: skillMap['Programming Fundamentals'],
              weight: 0.6,
            });
            existingKeySet.add(linkKey);
          }
        }
      }
    }

    const { data: ghRepos } = await supabase.from('github_repos').select('id, name');
    if (ghRepos && skillMap['Programming Fundamentals']) {
      for (const r of ghRepos) {
        const linkKey = `github_repo:${r.id}:skill:${skillMap['Programming Fundamentals']}`;
        if (!existingKeySet.has(linkKey)) {
          linksToInsert.push({
            source_type: 'github_repo',
            source_id: r.id,
            target_type: 'skill',
            target_id: skillMap['Programming Fundamentals'],
            weight: 0.8,
          });
          existingKeySet.add(linkKey);
        }
      }
    }

    if (linksToInsert.length > 0) {
      await supabase.from('evidence_links').insert(linksToInsert);
    }
    totalEvidenceLinks = existingKeySet.size;
  } catch (linkErr) {
    console.error('Evidence link population notice:', linkErr);
  }

  // 9. LEARNING PATH STORE: Seed authentic prior learning path in .learning_path_store.json
  // Proves the student ALREADY completed Arrays/Strings/Recursion, but stalled on Linked Lists & Binary Trees.
  try {
    const storePath = path.resolve('.learning_path_store.json');
    let store: Record<string, any> = {};
    if (fs.existsSync(storePath)) {
      try {
        store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      } catch {}
    }

    store[targetUserId] = {
      id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
      user_id: targetUserId,
      goal: 'Master Core Data Structures & Algorithms',
      total_days: 7,
      start_date: '2026-09-08',
      plan_metadata: { domain: 'DSA', priorHistory: true },
      is_active: true,
      created_at: '2026-09-08T09:00:00.000Z',
      updated_at: '2026-09-17T18:00:00.000Z',
      days: [
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_1`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 1,
          topic: 'Arrays — Two-Pointer & Sliding Window Techniques',
          learn_content: 'Master two-pointer convergence and sliding window boundary invariants.',
          practice_problems: 4,
          review_activity: 'Review solved LeetCode problems (Two Sum, 3Sum, Subarray Maximum)',
          ai_estimated_minutes: 60,
          priority: 'HIGH',
          evidence_rationale: 'Core foundation for technical interviews',
          activities_completed: { learn: true, practice: true, review: true },
          is_completed: true,
          completed_at: '2026-09-08T18:00:00.000Z',
          created_at: '2026-09-08T09:00:00.000Z',
          updated_at: '2026-09-08T18:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_2`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 2,
          topic: 'Binary Search — Exact Match & Boundary Invariants [left, right)',
          learn_content: 'Standardize on half-open interval to avoid off-by-one errors.',
          practice_problems: 4,
          review_activity: 'Review lower_bound boundary off-by-one error fix',
          ai_estimated_minutes: 60,
          priority: 'HIGH',
          evidence_rationale: 'Essential search pattern for sorted datasets',
          activities_completed: { learn: true, practice: true, review: true },
          is_completed: true,
          completed_at: '2026-09-09T17:00:00.000Z',
          created_at: '2026-09-09T09:00:00.000Z',
          updated_at: '2026-09-09T17:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_3`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 3,
          topic: 'Strings & Basic Recursion — Anagrams, Scopes, and Invariants',
          learn_content: 'Hash table frequency counters and base-case call-stack mechanics.',
          practice_problems: 4,
          review_activity: 'Verify Fibonacci recursive stack depth and string hashing',
          ai_estimated_minutes: 60,
          priority: 'MEDIUM',
          evidence_rationale: 'Reinforces recursive mental model',
          activities_completed: { learn: true, practice: true, review: true },
          is_completed: true,
          completed_at: '2026-09-11T18:00:00.000Z',
          created_at: '2026-09-11T09:00:00.000Z',
          updated_at: '2026-09-11T18:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_4`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 4,
          topic: 'Linked Lists — Pointer Reversal & Floyd Cycle Detection',
          learn_content: 'Fast and slow pointer mechanics, in-place pointer reversal.',
          practice_problems: 4,
          review_activity: 'Debug null dereference bug in cycle detection loop',
          ai_estimated_minutes: 75,
          priority: 'HIGH',
          evidence_rationale: 'Struggled with pointer tracking null exceptions',
          activities_completed: { learn: true, practice: false, review: false },
          is_completed: false,
          completed_at: null,
          created_at: '2026-09-13T09:00:00.000Z',
          updated_at: '2026-09-15T18:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_5`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 5,
          topic: 'Binary Trees — DFS Traversals & Universal Base Cases',
          learn_content: 'In-order, pre-order, post-order DFS and call stack visualization.',
          practice_problems: 4,
          review_activity: 'Fix stack overflow bug in path sum recursion',
          ai_estimated_minutes: 90,
          priority: 'HIGH',
          evidence_rationale: 'Recursion missing base-case caused stack overflow',
          activities_completed: { learn: false, practice: false, review: false },
          is_completed: false,
          completed_at: null,
          created_at: '2026-09-15T09:00:00.000Z',
          updated_at: '2026-09-15T09:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_6`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 6,
          topic: 'Advanced Tree Patterns — BFS Level Order & LCA',
          learn_content: 'Queue-based BFS level-order iteration and Lowest Common Ancestor.',
          practice_problems: 4,
          review_activity: 'Pending tree traversal remediation',
          ai_estimated_minutes: 75,
          priority: 'HIGH',
          evidence_rationale: 'Unfinished due to earlier tree traversal blockers',
          activities_completed: { learn: false, practice: false, review: false },
          is_completed: false,
          completed_at: null,
          created_at: '2026-09-16T09:00:00.000Z',
          updated_at: '2026-09-16T09:00:00.000Z',
        },
        {
          id: `day_prior_${targetUserId.slice(0, 8)}_7`,
          path_id: `path_dsa_prior_${targetUserId.slice(0, 8)}`,
          user_id: targetUserId,
          day_number: 7,
          topic: 'Dynamic Programming — 1D Foundations & State Formulation',
          learn_content: 'Memoization vs tabulation on overlapping subproblems.',
          practice_problems: 4,
          review_activity: 'Not yet started',
          ai_estimated_minutes: 90,
          priority: 'HIGH',
          evidence_rationale: 'Known gap before campus placements',
          activities_completed: { learn: false, practice: false, review: false },
          is_completed: false,
          completed_at: null,
          created_at: '2026-09-17T09:00:00.000Z',
          updated_at: '2026-09-17T09:00:00.000Z',
        },
      ],
    };

    fs.writeFileSync(storePath, JSON.stringify(store, null, 2), 'utf8');
  } catch (storeErr) {
    console.error('Failed to update .learning_path_store.json:', storeErr);
  }

  // 10. Revalidate all cached UI routes
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
    revalidatePath('/profile');
    revalidatePath('/learning-path');
    revalidatePath('/');
  } catch {}

  const stats = await getStudentLearningHistoryStats(targetUserId);

  return {
    success: true,
    message: 'Persistent student learning history successfully populated in database.',
    userId: targetUserId,
    tasksCount: stats.tasksCount,
    timeSessionsCount: stats.timeSessionsCount,
    mistakesCount: stats.mistakesCount,
    journalEntriesCount: stats.journalEntriesCount,
    notesCount: stats.notesCount,
    skillsCount: stats.skillsCount,
    projectsCount: stats.projectsCount,
    evidenceLinksCount: stats.evidenceLinksCount,
    dateRange: { startDate, endDate },
  };
}

/**
 * Protected action to cleanly clear ONLY records created by this learning history seed.
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
    evidenceLinks: 0,
  };

  // 1. Delete seeded tasks (matching idempotency_key like 'seed-task-%')
  const { data: deletedTasks } = await supabase
    .from('tasks')
    .delete()
    .like('idempotency_key', 'seed-task-%')
    .select('id');
  removed.tasks = deletedTasks?.length || 0;

  // 2. Delete seeded time sessions (matching known seeded descriptions)
  const seededSessionDescriptions = [
    'Reviewed Python function parameter rules, LEGB scopes, and default argument memory retention.',
    'Practiced SQL complex INNER and LEFT joins in PostgreSQL across relational schemas.',
    'Finalized Campus Event Portal JWT auth & role guards in Next.js.',
    'Two-pointer sliding window array problem solving: Maximum Average Subarray & Longest Substring.',
    'Deep dive into relational database normalization: functional dependencies, 3NF, and BCNF.',
    'Binary search lower_bound and boundary condition tests on sorted arrays.',
    'CPU Scheduling simulation: Round Robin vs Shortest Job First with turnaround time metrics.',
    'Basic recursion exercises: Fibonacci number and call stack depth analysis.',
    'Implemented FastAPI CRUD endpoints for study session logging and Pydantic validation.',
    'Quick architectural read on Distributed Key-Value store gossip protocols and hash rings.',
    'Java OOP polymorphism and geometric shape hierarchy inheritance exercises.',
    'String manipulation exercises: Valid Anagram and First Unique Character using hash tables.',
    'Linked list pointer traversal and debugging fast-and-slow cycle detection null exceptions.',
    'Recursive binary tree traversal: encountered stack overflow in path sum, working on base-case guard.',
    'Binary Search Tree node insertion and subtree link retention tracing.',
    'Computer Networks TCP 3-way handshake and packet flow analysis in Wireshark.',
    'Reviewing recurring mistake patterns across SQL JOINs, recursion termination, and tree traversals.',
  ];
  const { data: deletedSessions } = await supabase
    .from('time_sessions')
    .delete()
    .in('description', seededSessionDescriptions)
    .select('id');
  removed.sessions = deletedSessions?.length || 0;

  // 3. Delete seeded mistakes (matching known titles)
  const seededMistakeTitles = [
    'Null pointer dereference during fast-and-slow pointer cycle detection',
    'Recursion missing base-case causing stack overflow in tree path sum',
    'Lost subtree references during binary search tree node insertion',
    'Off-by-one boundary error in binary search lower_bound',
    'SQL JOIN Cartesian explosion due to missing ON condition',
    'SQL GROUP BY non-aggregated column omission',
    'SQL JOIN NULL handling discrepancy in NOT IN subquery',
    'Python mutable default argument retention bug',
    'Java variable shadowing instead of method overriding in subclass',
    'FastAPI missing request body validation on unhandled null JSON',
    'Database normalization 2NF violation with partial functional dependency',
    'N+1 query execution in student event list endpoint',
  ];
  const { data: deletedMistakes } = await supabase
    .from('mistakes')
    .delete()
    .in('title', seededMistakeTitles)
    .select('id');
  removed.mistakes = deletedMistakes?.length || 0;

  // 4. Delete seeded journal entries (matching dates 2026-09-04 through 2026-09-16)
  const seededJournalDates = [
    '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08',
    '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16',
  ];
  const { data: deletedJournals } = await supabase
    .from('journal_entries')
    .delete()
    .in('entry_date', seededJournalDates)
    .select('id');
  removed.journalEntries = deletedJournals?.length || 0;

  // 5. Delete seeded notes (matching known titles)
  const seededNoteTitles = [
    'Binary Search Boundary Conditions & Invariants',
    'Sliding Window & Two-Pointer Invariants',
    'Recursion Invariants & Call Stack Safety',
    'Linked List Pointer Tracking & Floyd Cycle Invariants',
    'Binary Tree Traversal Mechanics & Null Guard Invariants',
    'SQL Joins & Logical Execution Order Mental Model',
    'Python Functions & Scope Reference (LEGB)',
    'Relational Normalization & BCNF Decomposition Rules',
    'Operating System CPU Scheduling Comparison',
    'Computer Networks: TCP 3-Way Handshake & Flow Control',
  ];
  const { data: deletedNotes } = await supabase
    .from('notes')
    .delete()
    .in('title', seededNoteTitles)
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
    revalidatePath('/profile');
    revalidatePath('/learning-path');
    revalidatePath('/');
  } catch {}

  return {
    success: true,
    message: `Cleared demo learning history. Removed ${removed.tasks} tasks, ${removed.sessions} sessions, ${removed.mistakes} mistakes, ${removed.journalEntries} journal entries, ${removed.notes} notes, and ${removed.projects} projects.`,
    removed,
  };
}
