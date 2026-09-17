'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { SearchResultItem } from '@/types';

/**
 * Universal cross-entity search querying Tasks, Notes, Journal Entries, Projects, Skills, GitHub, LeetCode, Time Sessions, and Mistakes in parallel.
 */
export async function universalSearch(queryInput: string): Promise<SearchResultItem[]> {
  if (!queryInput || queryInput.trim().length < 2) {
    return [];
  }

  const query = queryInput.trim().toLowerCase();
  const supabase = createServiceRoleClient();

  try {
    const [
      { data: tasks },
      { data: notes },
      { data: journal },
      { data: projects },
      { data: skills },
      { data: ghActivity },
      { data: lcSubs },
      { data: timeSessions },
      { data: mistakes },
      { data: opportunities },
    ] = await Promise.all([
      supabase.from('tasks').select('*').or(`title.ilike.%${query}%,description.ilike.%${query}%`).limit(10),
      supabase.from('notes').select('*').or(`title.ilike.%${query}%,content.ilike.%${query}%`).limit(10),
      supabase.from('journal_entries').select('*').or(`raw_content.ilike.%${query}%,learning_summary.ilike.%${query}%`).limit(10),
      supabase.from('projects').select('*').or(`title.ilike.%${query}%,description.ilike.%${query}%`).limit(10),
      supabase.from('skills').select('*').or(`name.ilike.%${query}%,category.ilike.%${query}%`).limit(10),
      supabase.from('github_activity_logs').select('*').or(`repo_name.ilike.%${query}%,message.ilike.%${query}%`).limit(10),
      supabase.from('leetcode_submissions_log').select('*').or(`title.ilike.%${query}%,title_slug.ilike.%${query}%`).limit(10),
      supabase.from('time_sessions').select('*').or(`description.ilike.%${query}%,category.ilike.%${query}%`).limit(10),
      supabase.from('mistakes').select('*').or(`title.ilike.%${query}%,root_cause.ilike.%${query}%,solution.ilike.%${query}%`).limit(10),
      supabase.from('opportunities').select('*').or(`title.ilike.%${query}%,organization.ilike.%${query}%`).limit(10),
    ]);

    const results: SearchResultItem[] = [];

    if (opportunities) {
      for (const o of opportunities) {
        results.push({
          id: o.id,
          type: 'opportunity',
          title: o.title,
          subtitle: `${o.organization} • ${o.type} (${o.status})`,
          url: '/opportunities',
          date: o.deadline ? o.deadline : undefined,
        });
      }
    }

    if (tasks) {
      for (const t of tasks) {
        results.push({
          id: t.id,
          type: 'task',
          title: t.title,
          subtitle: `Task (${t.status}) • Priority: ${t.priority}`,
          url: '/tasks',
          date: t.created_at ? new Date(t.created_at).toLocaleDateString() : undefined,
        });
      }
    }

    if (notes) {
      for (const n of notes) {
        results.push({
          id: n.id,
          type: 'note',
          title: n.title,
          subtitle: `Note • Category: ${n.category || 'General'}`,
          url: '/notes',
          date: n.created_at ? new Date(n.created_at).toLocaleDateString() : undefined,
        });
      }
    }

    if (journal) {
      for (const j of journal) {
        results.push({
          id: j.id,
          type: 'journal',
          title: `Daily Journal: ${j.entry_date}`,
          subtitle: j.summary || j.raw_content.substring(0, 80),
          url: '/journal',
          date: j.entry_date,
        });
      }
    }

    if (projects) {
      for (const p of projects) {
        results.push({
          id: p.id,
          type: 'project',
          title: p.title,
          subtitle: `Project • Status: ${p.status}`,
          url: '/projects',
          date: p.created_at ? new Date(p.created_at).toLocaleDateString() : undefined,
        });
      }
    }

    if (skills) {
      for (const s of skills) {
        results.push({
          id: s.id,
          type: 'skill',
          title: s.name,
          subtitle: `Skill • Level ${s.proficiency_level}/${s.target_level} (${s.category})`,
          url: '/skills',
        });
      }
    }

    if (ghActivity) {
      for (const gh of ghActivity) {
        results.push({
          id: gh.id,
          type: 'github',
          title: `GitHub: ${gh.event_type} on ${gh.repo_name}`,
          subtitle: gh.message || 'Updated code',
          url: '/github',
          date: new Date(gh.occurred_at).toLocaleDateString(),
        });
      }
    }

    if (lcSubs) {
      for (const lc of lcSubs) {
        results.push({
          id: lc.id,
          type: 'leetcode',
          title: `LeetCode: ${lc.title}`,
          subtitle: `Solved (${lc.difficulty}) • Status: ${lc.status}`,
          url: '/leetcode',
          date: new Date(lc.timestamp).toLocaleDateString(),
        });
      }
    }

    if (timeSessions) {
      for (const ts of timeSessions) {
        results.push({
          id: ts.id,
          type: 'time',
          title: `Focus Session: ${ts.category} (${ts.duration_minutes} mins)`,
          subtitle: ts.description || 'Focus session',
          url: '/time',
          date: ts.session_date,
        });
      }
    }

    if (mistakes) {
      for (const m of mistakes) {
        results.push({
          id: m.id,
          type: 'mistake',
          title: `Mistake: ${m.title}`,
          subtitle: `Category: ${m.category} • Severity: ${m.severity}`,
          url: '/mistakes',
          date: m.created_at ? new Date(m.created_at).toLocaleDateString() : undefined,
        });
      }
    }

    return results;
  } catch (err) {
    return [];
  }
}
