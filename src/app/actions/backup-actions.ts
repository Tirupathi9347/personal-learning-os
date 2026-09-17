'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import JSZip from 'jszip';

export async function generateSystemBackupZip(): Promise<{
  success: boolean;
  base64Zip?: string;
  filename?: string;
  itemCounts?: Record<string, number>;
  error?: string;
}> {
  try {
    const supabase = createServiceRoleClient();

    // Query all database entities in parallel
    const [
      { data: tasks },
      { data: journalEntries },
      { data: notes },
      { data: projects },
      { data: skills },
      { data: topicNodes },
      { data: timeSessions },
      { data: mistakes },
      { data: evidenceLinks },
      { data: githubRepos },
      { data: githubActivity },
      { data: leetcodeProfile },
      { data: leetcodeSubmissions },
    ] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }),
      supabase.from('notes').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('*').order('created_at', { ascending: false }),
      supabase.from('skills').select('*').order('created_at', { ascending: false }),
      supabase.from('topic_nodes').select('*').order('created_at', { ascending: false }),
      supabase.from('time_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('mistakes').select('*').order('created_at', { ascending: false }),
      supabase.from('evidence_links').select('*').order('created_at', { ascending: false }),
      supabase.from('github_repos').select('*').order('created_at', { ascending: false }),
      supabase.from('github_activity_logs').select('*').order('occurred_at', { ascending: false }),
      supabase.from('leetcode_profile_cache').select('*').order('last_synced_at', { ascending: false }),
      supabase.from('leetcode_submissions_log').select('*').order('timestamp', { ascending: false }),
    ]);

    // Construct Master Database JSON (EXCLUDING api_keys_config or credentials!)
    const databaseJson = {
      export_version: '1.0',
      exported_at: new Date().toISOString(),
      entities: {
        tasks: tasks || [],
        journal_entries: journalEntries || [],
        notes: notes || [],
        projects: projects || [],
        skills: skills || [],
        topic_nodes: topicNodes || [],
        time_sessions: timeSessions || [],
        mistakes: mistakes || [],
        evidence_links: evidenceLinks || [],
        github_repos: githubRepos || [],
        github_activity_logs: githubActivity || [],
        leetcode_profile: leetcodeProfile || [],
        leetcode_submissions: leetcodeSubmissions || [],
      },
    };

    const zip = new JSZip();

    // 1. Add Master JSON File
    zip.file('database.json', JSON.stringify(databaseJson, null, 2));

    // 2. Add Markdown Files Folder
    const mdFolder = zip.folder('markdown');

    // Notes Markdown
    if (notes && notes.length > 0 && mdFolder) {
      const notesFolder = mdFolder.folder('notes');
      for (const n of notes) {
        const safeTitle = (n.title || 'untitled').replace(/[^a-zA-Z0-9_-]/g, '_');
        const content = `# ${n.title}\n\n**Category**: ${n.category || 'General'}\n**Tags**: ${(n.tags || []).join(', ')}\n**Created At**: ${n.created_at}\n\n---\n\n${n.content}`;
        notesFolder?.file(`${safeTitle}.md`, content);
      }
    }

    // Daily Journals Markdown
    if (journalEntries && journalEntries.length > 0 && mdFolder) {
      const journalFolder = mdFolder.folder('journals');
      for (const j of journalEntries) {
        const content = `# Daily Journal: ${j.entry_date}\n\n**Time Logged**: ${j.time_spent_minutes || 0} mins\n**Summary**: ${j.summary || 'None'}\n\n---\n\n## Log Content\n${j.raw_content}\n\n## Learning Summary\n${j.learning_summary || 'None'}\n\n## Tomorrow's Plan\n${j.tomorrow_plan || 'None'}`;
        journalFolder?.file(`${j.entry_date}.md`, content);
      }
    }

    // Projects Markdown
    if (projects && projects.length > 0 && mdFolder) {
      const projectsFolder = mdFolder.folder('projects');
      for (const p of projects) {
        const content = `# Project: ${p.title}\n\n**Status**: ${p.status}\n**GitHub**: ${p.github_repo_url || 'N/A'}\n**Start Date**: ${p.start_date || 'N/A'}\n\n---\n\n${p.description || 'No description provided.'}`;
        projectsFolder?.file(`${p.slug || 'project'}.md`, content);
      }
    }

    // Tasks Summary Markdown
    if (tasks && tasks.length > 0 && mdFolder) {
      const taskBullets = tasks
        .map((t) => `- [${t.status === 'completed' ? 'x' : ' '}] **${t.title}** (Priority: ${t.priority}, Due: ${t.due_date || 'None'}) - ${t.description || ''}`)
        .join('\n');
      mdFolder.file('tasks.md', `# Master Tasks List\n\nTotal Tasks: ${tasks.length}\n\n${taskBullets}`);
    }

    // Skills Summary Markdown
    if (skills && skills.length > 0 && mdFolder) {
      const skillBullets = skills
        .map((s) => `- **${s.name}** (${s.category}): Level ${s.proficiency_level}/${s.target_level}`)
        .join('\n');
      mdFolder.file('skills.md', `# Master Skills Matrix\n\nTotal Skills: ${skills.length}\n\n${skillBullets}`);
    }

    // Mistakes Summary Markdown
    if (mistakes && mistakes.length > 0 && mdFolder) {
      const mistakeBullets = mistakes
        .map((m) => `### ${m.title}\n- **Category**: ${m.category}\n- **Severity**: ${m.severity}\n- **Root Cause**: ${m.root_cause}\n- **Solution**: ${m.solution}\n- **Prevention Rule**: ${m.prevention_rule || 'None'}\n`)
        .join('\n');
      mdFolder.file('mistakes.md', `# Master Technical Mistakes Log\n\nTotal Logged: ${mistakes.length}\n\n${mistakeBullets}`);
    }

    // Time Sessions Summary Markdown
    if (timeSessions && timeSessions.length > 0 && mdFolder) {
      const timeBullets = timeSessions
        .map((ts) => `- **${ts.session_date}**: ${ts.category} (${ts.duration_minutes} mins) - ${ts.description || 'Focus session'}`)
        .join('\n');
      mdFolder.file('time_sessions.md', `# Time Tracking History\n\nTotal Sessions: ${timeSessions.length}\n\n${timeBullets}`);
    }

    // GitHub & LeetCode Summary Markdown
    if (mdFolder) {
      if (githubActivity && githubActivity.length > 0) {
        const ghBullets = githubActivity
          .map((g) => `- [${new Date(g.occurred_at).toLocaleDateString()}] ${g.event_type} on \`${g.repo_name}\`: ${g.message || ''}`)
          .join('\n');
        mdFolder.file('github_summary.md', `# Synced GitHub Activity Logs\n\n${ghBullets}`);
      }

      if (leetcodeSubmissions && leetcodeSubmissions.length > 0) {
        const lcBullets = leetcodeSubmissions
          .map((l) => `- [${new Date(l.timestamp).toLocaleDateString()}] Solved: **${l.title}** (${l.difficulty}) - Status: ${l.status}`)
          .join('\n');
        mdFolder.file('leetcode_summary.md', `# Synced LeetCode Accepted Submissions\n\n${lcBullets}`);
      }
    }

    // Generate Zip Buffer
    const zipBase64 = await zip.generateAsync({ type: 'base64' });
    const todayStr = new Date().toISOString().split('T')[0];
    const filename = `personal-learning-os-backup-${todayStr}.zip`;

    const itemCounts = {
      notes: (notes || []).length,
      journals: (journalEntries || []).length,
      tasks: (tasks || []).length,
      projects: (projects || []).length,
      skills: (skills || []).length,
      timeSessions: (timeSessions || []).length,
      mistakes: (mistakes || []).length,
      githubActivity: (githubActivity || []).length,
      leetcodeSubmissions: (leetcodeSubmissions || []).length,
    };

    return {
      success: true,
      base64Zip: zipBase64,
      filename,
      itemCounts,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to generate system backup zip.',
    };
  }
}
