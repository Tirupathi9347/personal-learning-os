import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStudentProfile } from '@/app/actions/profile-actions';
import { getSkills } from '@/app/actions/skill-actions';
import { getProjects } from '@/app/actions/project-actions';
import { getMistakes } from '@/app/actions/mistake-actions';
import { getTimeSessions } from '@/app/actions/time-actions';
import { getTasks } from '@/app/actions/task-actions';
import { getSyncedGitHubActivity, getSyncedGitHubRepos } from '@/app/actions/github-actions';
import { getSyncedLeetCodeSubmissions, getSyncedLeetCodeProfile } from '@/app/actions/leetcode-actions';
import { getJournalEntries } from '@/app/actions/journal-actions';
import { getNotes } from '@/app/actions/note-actions';
import { 
  EvidenceRecord, 
  EvidenceSourceType, 
  EvidenceCollectionResult,
  EvidenceLink,
  Skill
} from './types';

/**
 * Feature 1B: Evidence Collector for Agentic Learning OS.
 * 
 * Strictly read-only collector that gathers real, existing student telemetry
 * across all database tables, integrations, and evidence graph links.
 * Normalizes every item into deterministic EvidenceRecords without fabricating
 * missing data or computing final mastery scores.
 */
export async function collectStudentEvidence(): Promise<EvidenceCollectionResult> {
  const collectedAt = new Date().toISOString();
  const records: EvidenceRecord[] = [];
  const errors: string[] = [];
  const connectedSourcesSet = new Set<EvidenceSourceType>();
  const unconnectedSources: { source: EvidenceSourceType; reason: string }[] = [];

  const sourcesSummary: Record<EvidenceSourceType, number> = {
    profile: 0,
    github: 0,
    leetcode: 0,
    project: 0,
    mistake: 0,
    study_session: 0,
    journal: 0,
    note: 0,
    task: 0,
    quiz_assessment: 0,
    external_sync: 0,
  };

  // 1. Fetch Universal Evidence Links for Graph Resolution
  const evidenceLinksBySourceId = new Map<string, EvidenceLink[]>();
  try {
    const supabase = createServiceRoleClient();
    const { data: rawLinks, error: linksErr } = await supabase
      .from('evidence_links')
      .select('*');

    if (!linksErr && rawLinks) {
      for (const link of rawLinks as EvidenceLink[]) {
        const existing = evidenceLinksBySourceId.get(link.source_id) || [];
        existing.push(link);
        evidenceLinksBySourceId.set(link.source_id, existing);
      }
    }
  } catch (err: any) {
    errors.push(`evidence_links lookup: ${err.message || 'Unknown error'}`);
  }

  // 2. Fetch Skills to establish target skill name/ID lookups
  const skillsById = new Map<string, Skill>();
  const skillsByNameLower = new Map<string, Skill>();
  try {
    const skills = await getSkills();
    if (skills && skills.length > 0) {
      connectedSourcesSet.add('profile');
      for (const sk of skills) {
        skillsById.set(sk.id, sk);
        skillsByNameLower.set(sk.name.toLowerCase().trim(), sk);

        // Record skill framework entry as baseline self-reported claim
        records.push({
          id: `evidence-skill-${sk.id}`,
          source: 'profile',
          classification: 'SELF_REPORTED',
          targetSkillName: sk.name,
          targetSkillId: sk.id,
          description: `Skill Framework Claim: ${sk.name} [Category: ${sk.category}, Self-rated: ${sk.proficiency_level}/5, Target: ${sk.target_level}/5]`,
          polarity: 'NEUTRAL',
          weight: 0.1,
          observedAt: sk.created_at,
          sourceRef: {
            sourceType: 'profile',
            sourceId: sk.id,
            tableName: 'skills',
          },
          metrics: {
            score: sk.proficiency_level,
            totalPossible: 5,
          },
        });
        sourcesSummary.profile++;
      }
    } else {
      unconnectedSources.push({
        source: 'profile',
        reason: 'skills table is empty or unpopulated',
      });
    }
  } catch (err: any) {
    errors.push(`skills: ${err.message || 'Failed to fetch skills'}`);
    unconnectedSources.push({ source: 'profile', reason: err.message });
  }

  // Helper to resolve linked skill for any evidence item
  const resolveLinkedSkill = (
    sourceId: string,
    fallbackSkillName?: string,
    explicitSkillId?: string | null
  ): { skillId?: string | null; skillName: string; linkWeight?: number } => {
    // Priority A: Direct foreign key skill_id
    if (explicitSkillId && skillsById.has(explicitSkillId)) {
      return {
        skillId: explicitSkillId,
        skillName: skillsById.get(explicitSkillId)!.name,
      };
    }

    // Priority B: Universal evidence_links
    const links = evidenceLinksBySourceId.get(sourceId);
    if (links && links.length > 0) {
      const skillLink = links.find((l) => l.target_type === 'skill');
      if (skillLink && skillsById.has(skillLink.target_id)) {
        return {
          skillId: skillLink.target_id,
          skillName: skillsById.get(skillLink.target_id)!.name,
          linkWeight: skillLink.weight,
        };
      }
    }

    // Priority C: Exact name match against known skills
    if (fallbackSkillName && skillsByNameLower.has(fallbackSkillName.toLowerCase().trim())) {
      const matched = skillsByNameLower.get(fallbackSkillName.toLowerCase().trim())!;
      return {
        skillId: matched.id,
        skillName: matched.name,
      };
    }

    // Fallback: Use provided string or 'General'
    return {
      skillId: explicitSkillId || null,
      skillName: fallbackSkillName || 'General',
    };
  };

  // 3. Student Profile
  try {
    const profile = await getStudentProfile();
    if (profile && profile.id !== 'draft') {
      connectedSourcesSet.add('profile');

      // Profile skill claims
      if (profile.skills && profile.skills.length > 0) {
        for (const skillStr of profile.skills) {
          const resolved = resolveLinkedSkill(`profile-skill-${skillStr}`, skillStr);
          const profLevel = profile.skill_proficiencies?.[skillStr];

          records.push({
            id: `evidence-profile-${skillStr.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            source: 'profile',
            classification: 'SELF_REPORTED',
            targetSkillName: resolved.skillName,
            targetSkillId: resolved.skillId,
            description: `Student Profile Skill Claim: "${skillStr}"${profLevel ? ` (Self-Reported Proficiency: ${profLevel}/5)` : ''}`,
            polarity: 'NEUTRAL',
            weight: 0.1,
            observedAt: profile.updated_at || profile.created_at,
            sourceRef: {
              sourceType: 'profile',
              sourceId: profile.id,
              tableName: 'student_profiles',
            },
            metrics: profLevel ? { score: profLevel, totalPossible: 5 } : undefined,
          });
          sourcesSummary.profile++;
        }
      }
    }
  } catch (err: any) {
    errors.push(`student_profiles: ${err.message || 'Failed to fetch student profile'}`);
  }

  // 4. Projects
  try {
    const projects = await getProjects();
    if (projects && projects.length > 0) {
      connectedSourcesSet.add('project');
      for (const proj of projects) {
        const resolved = resolveLinkedSkill(proj.id, proj.title);
        const isCompleted = proj.status === 'completed';
        const hasRepo = !!proj.github_repo_url;

        records.push({
          id: `evidence-project-${proj.id}`,
          source: 'project',
          classification: hasRepo ? 'OBSERVED' : 'SELF_REPORTED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Project Artifact: "${proj.title}" [Status: ${proj.status}]${proj.description ? ` - ${proj.description}` : ''}${hasRepo ? ` (Repo: ${proj.github_repo_url})` : ''}`,
          polarity: isCompleted || proj.status === 'active' ? 'SUPPORTS' : 'NEUTRAL',
          weight: resolved.linkWeight ?? (isCompleted ? 0.7 : 0.4),
          observedAt: proj.updated_at || proj.created_at,
          sourceRef: {
            sourceType: 'project',
            sourceId: proj.id,
            tableName: 'projects',
            url: proj.github_repo_url || undefined,
          },
        });
        sourcesSummary.project++;
      }
    } else {
      unconnectedSources.push({ source: 'project', reason: 'projects table is empty' });
    }
  } catch (err: any) {
    errors.push(`projects: ${err.message || 'Failed to fetch projects'}`);
    unconnectedSources.push({ source: 'project', reason: err.message });
  }

  // 5. Mistakes & Bugs Engine
  try {
    const mistakes = await getMistakes();
    if (mistakes && mistakes.length > 0) {
      connectedSourcesSet.add('mistake');
      for (const m of mistakes) {
        const resolved = resolveLinkedSkill(m.id, m.category, m.skill_id);
        const severityWeight =
          m.severity === 'critical' ? 0.8 :
          m.severity === 'high' ? 0.6 :
          m.severity === 'medium' ? 0.4 : 0.2;

        records.push({
          id: `evidence-mistake-${m.id}`,
          source: 'mistake',
          classification: 'OBSERVED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Documented Mistake [${m.category}, ${m.severity} severity]: "${m.title}". Root cause: ${m.root_cause}. Solution: ${m.solution}${m.prevention_rule ? `. Prevention rule: ${m.prevention_rule}` : ''}`,
          polarity: 'CONTRADICTS',
          weight: resolved.linkWeight ?? severityWeight,
          observedAt: m.created_at,
          sourceRef: {
            sourceType: 'mistake',
            sourceId: m.id,
            tableName: 'mistakes',
          },
          metrics: {
            frequency: 1,
          },
        });
        sourcesSummary.mistake++;
      }
    } else {
      unconnectedSources.push({ source: 'mistake', reason: 'mistakes table is empty' });
    }
  } catch (err: any) {
    errors.push(`mistakes: ${err.message || 'Failed to fetch mistakes'}`);
    unconnectedSources.push({ source: 'mistake', reason: err.message });
  }

  // 6. Focus Time Sessions
  try {
    const timeSessions = await getTimeSessions();
    if (timeSessions && timeSessions.length > 0) {
      connectedSourcesSet.add('study_session');
      for (const ts of timeSessions) {
        const resolved = resolveLinkedSkill(ts.id, ts.category, ts.skill_id);
        const durationWeight = Math.min(1.0, Math.max(0.1, ts.duration_minutes / 120));

        records.push({
          id: `evidence-time-${ts.id}`,
          source: 'study_session',
          classification: 'OBSERVED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Time Tracking Session: ${ts.duration_minutes} minutes on ${ts.category} (${ts.session_date})${ts.description ? ` - ${ts.description}` : ''}`,
          polarity: 'SUPPORTS',
          weight: resolved.linkWeight ?? durationWeight,
          observedAt: ts.started_at || ts.created_at || `${ts.session_date}T00:00:00Z`,
          sourceRef: {
            sourceType: 'study_session',
            sourceId: ts.id,
            tableName: 'time_sessions',
          },
          metrics: {
            durationMinutes: ts.duration_minutes,
          },
        });
        sourcesSummary.study_session++;
      }
    } else {
      unconnectedSources.push({ source: 'study_session', reason: 'time_sessions table is empty' });
    }
  } catch (err: any) {
    errors.push(`time_sessions: ${err.message || 'Failed to fetch time sessions'}`);
    unconnectedSources.push({ source: 'study_session', reason: err.message });
  }

  // 7. Tasks
  try {
    const tasks = await getTasks();
    if (tasks && tasks.length > 0) {
      connectedSourcesSet.add('task');
      for (const t of tasks) {
        const resolved = resolveLinkedSkill(t.id, t.title);
        const isCompleted = t.status === 'completed';
        const isProblematic = t.postponed_count >= 3 || t.status === 'cancelled';

        records.push({
          id: `evidence-task-${t.id}`,
          source: 'task',
          classification: 'OBSERVED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Task: "${t.title}" [Status: ${t.status}, Priority: ${t.priority}]${t.postponed_count > 0 ? ` (Postponed ${t.postponed_count} times)` : ''}`,
          polarity: isCompleted ? 'SUPPORTS' : isProblematic ? 'CONTRADICTS' : 'NEUTRAL',
          weight: resolved.linkWeight ?? (isCompleted ? 0.5 : isProblematic ? 0.4 : 0.2),
          observedAt: t.completed_at || t.updated_at || t.created_at,
          sourceRef: {
            sourceType: 'task',
            sourceId: t.id,
            tableName: 'tasks',
          },
          metrics: {
            frequency: t.postponed_count,
          },
        });
        sourcesSummary.task++;
      }
    } else {
      unconnectedSources.push({ source: 'task', reason: 'tasks table is empty' });
    }
  } catch (err: any) {
    errors.push(`tasks: ${err.message || 'Failed to fetch tasks'}`);
    unconnectedSources.push({ source: 'task', reason: err.message });
  }

  // 8. GitHub Activity Logs & Repositories
  try {
    const [ghLogs, ghRepos] = await Promise.all([
      getSyncedGitHubActivity(),
      getSyncedGitHubRepos(),
    ]);

    let hasGhData = false;

    if (ghRepos && ghRepos.length > 0) {
      hasGhData = true;
      for (const repo of ghRepos) {
        const resolved = resolveLinkedSkill(repo.id, repo.language || repo.name);

        records.push({
          id: `evidence-gh-repo-${repo.id}`,
          source: 'github',
          classification: 'EXTERNALLY_VERIFIED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Verified GitHub Repository: ${repo.full_name} (${repo.language || 'Codebase'}, ${repo.stargazers_count} stars, ${repo.forks_count} forks)${repo.description ? ` - ${repo.description}` : ''}`,
          polarity: 'SUPPORTS',
          weight: resolved.linkWeight ?? 0.7,
          observedAt: repo.pushed_at || repo.updated_at || repo.created_at,
          sourceRef: {
            sourceType: 'github',
            sourceId: repo.id,
            externalId: String(repo.github_id),
            url: repo.html_url,
          },
          metrics: {
            score: repo.stargazers_count,
          },
        });
        sourcesSummary.github++;
      }
    }

    if (ghLogs && ghLogs.length > 0) {
      hasGhData = true;
      for (const log of ghLogs) {
        const resolved = resolveLinkedSkill(log.id, log.repo_name);
        const isCommitPush = log.event_type === 'PushEvent';

        records.push({
          id: `evidence-gh-log-${log.id}`,
          source: 'github',
          classification: 'EXTERNALLY_VERIFIED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Verified GitHub ${log.event_type} on ${log.repo_name}: ${log.message || 'Event recorded'}`,
          polarity: 'SUPPORTS',
          weight: resolved.linkWeight ?? (isCommitPush ? 0.8 : 0.6),
          observedAt: log.occurred_at,
          sourceRef: {
            sourceType: 'github',
            sourceId: log.id,
            externalId: log.event_id,
            url: log.url || undefined,
            rawSnippet: log.message || undefined,
          },
        });
        sourcesSummary.github++;
      }
    }

    if (hasGhData) {
      connectedSourcesSet.add('github');
    } else {
      unconnectedSources.push({
        source: 'github',
        reason: 'github_repos and github_activity_logs tables are empty. Connect GitHub in Settings or trigger sync.',
      });
    }
  } catch (err: any) {
    errors.push(`github: ${err.message || 'Failed to fetch GitHub telemetry'}`);
    unconnectedSources.push({ source: 'github', reason: err.message });
  }

  // 9. LeetCode Submissions & Profile Cache
  try {
    const [lcSubs, lcProfile] = await Promise.all([
      getSyncedLeetCodeSubmissions(),
      getSyncedLeetCodeProfile(),
    ]);

    let hasLcData = false;

    if (lcProfile) {
      hasLcData = true;
      const resolved = resolveLinkedSkill(lcProfile.id, 'Data Structures & Algorithms');

      records.push({
        id: `evidence-lc-profile-${lcProfile.id}`,
        source: 'leetcode',
        classification: 'EXTERNALLY_VERIFIED',
        targetSkillName: resolved.skillName,
        targetSkillId: resolved.skillId,
        description: `Verified LeetCode Profile @${lcProfile.username}: ${lcProfile.total_solved} solved (Easy: ${lcProfile.easy_solved}, Medium: ${lcProfile.medium_solved}, Hard: ${lcProfile.hard_solved}), Acceptance: ${lcProfile.acceptance_rate}%`,
        polarity: lcProfile.total_solved > 0 ? 'SUPPORTS' : 'NEUTRAL',
        weight: 0.9,
        observedAt: lcProfile.last_synced_at || lcProfile.created_at,
        sourceRef: {
          sourceType: 'leetcode',
          sourceId: lcProfile.id,
          externalId: lcProfile.username,
          url: `https://leetcode.com/u/${lcProfile.username}/`,
        },
        metrics: {
          score: lcProfile.total_solved,
        },
      });
      sourcesSummary.leetcode++;
    }

    if (lcSubs && lcSubs.length > 0) {
      hasLcData = true;
      for (const sub of lcSubs) {
        const resolved = resolveLinkedSkill(sub.id, sub.lang || 'Algorithms');
        const isAccepted = sub.status === 'Accepted';
        const diffWeight =
          sub.difficulty === 'Hard' ? 0.9 :
          sub.difficulty === 'Medium' ? 0.7 : 0.5;

        records.push({
          id: `evidence-lc-sub-${sub.id}`,
          source: 'leetcode',
          classification: 'EXTERNALLY_VERIFIED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Verified LeetCode ${sub.difficulty} Submission: "${sub.title}" [Result: ${sub.status}${sub.lang ? `, Language: ${sub.lang}` : ''}]`,
          polarity: isAccepted ? 'SUPPORTS' : 'CONTRADICTS',
          weight: resolved.linkWeight ?? diffWeight,
          observedAt: sub.timestamp,
          sourceRef: {
            sourceType: 'leetcode',
            sourceId: sub.id,
            externalId: sub.submission_id,
            url: `https://leetcode.com/problems/${sub.title_slug}/`,
          },
          metrics: {
            score: isAccepted ? 1 : 0,
            totalPossible: 1,
          },
        });
        sourcesSummary.leetcode++;
      }
    }

    if (hasLcData) {
      connectedSourcesSet.add('leetcode');
    } else {
      unconnectedSources.push({
        source: 'leetcode',
        reason: 'leetcode_profile_cache and leetcode_submissions_log tables are empty. Connect LeetCode in Settings or trigger sync.',
      });
    }
  } catch (err: any) {
    errors.push(`leetcode: ${err.message || 'Failed to fetch LeetCode telemetry'}`);
    unconnectedSources.push({ source: 'leetcode', reason: err.message });
  }

  // 10. Daily Journal Entries
  try {
    const journalEntries = await getJournalEntries();
    if (journalEntries && journalEntries.length > 0) {
      connectedSourcesSet.add('journal');
      for (const j of journalEntries) {
        const resolved = resolveLinkedSkill(j.id, 'Learning & Reflection');

        records.push({
          id: `evidence-journal-${j.id}`,
          source: 'journal',
          classification: 'SELF_REPORTED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Daily Journal Reflection (${j.entry_date}): ${j.learning_summary || j.raw_content.slice(0, 120)}${j.time_spent_minutes > 0 ? ` [Logged ${j.time_spent_minutes}m]` : ''}`,
          polarity: 'NEUTRAL',
          weight: resolved.linkWeight ?? 0.2,
          observedAt: `${j.entry_date}T00:00:00Z`,
          sourceRef: {
            sourceType: 'journal',
            sourceId: j.id,
            tableName: 'journal_entries',
            rawSnippet: (j.learning_summary || j.raw_content).slice(0, 200),
          },
          metrics: j.time_spent_minutes ? { durationMinutes: j.time_spent_minutes } : undefined,
        });
        sourcesSummary.journal++;
      }
    } else {
      unconnectedSources.push({ source: 'journal', reason: 'journal_entries table is empty' });
    }
  } catch (err: any) {
    errors.push(`journal: ${err.message || 'Failed to fetch journal entries'}`);
    unconnectedSources.push({ source: 'journal', reason: err.message });
  }

  // 11. Notes & Knowledge Base
  try {
    const notes = await getNotes();
    if (notes && notes.length > 0) {
      connectedSourcesSet.add('note');
      for (const n of notes) {
        const resolved = resolveLinkedSkill(n.id, n.category || n.title);

        records.push({
          id: `evidence-note-${n.id}`,
          source: 'note',
          classification: 'SELF_REPORTED',
          targetSkillName: resolved.skillName,
          targetSkillId: resolved.skillId,
          description: `Knowledge Note: "${n.title}" [Category: ${n.category || 'General'}]${n.tags && n.tags.length > 0 ? ` (Tags: ${n.tags.join(', ')})` : ''}`,
          polarity: 'NEUTRAL',
          weight: resolved.linkWeight ?? 0.2,
          observedAt: n.updated_at || n.created_at,
          sourceRef: {
            sourceType: 'note',
            sourceId: n.id,
            tableName: 'notes',
          },
        });
        sourcesSummary.note++;
      }
    } else {
      unconnectedSources.push({ source: 'note', reason: 'notes table is empty' });
    }
  } catch (err: any) {
    errors.push(`notes: ${err.message || 'Failed to fetch notes'}`);
    unconnectedSources.push({ source: 'note', reason: err.message });
  }

  // Identify unconfigured sources
  unconnectedSources.push({
    source: 'quiz_assessment',
    reason: 'Formal automated quiz assessments are not yet implemented as an integrated database entity.',
  });
  unconnectedSources.push({
    source: 'external_sync',
    reason: 'Generic third-party webhook feeds are not active.',
  });

  return {
    collectedAt,
    totalRecords: records.length,
    records,
    sourcesSummary,
    connectedSources: Array.from(connectedSourcesSet),
    unconnectedSources,
    errors,
  };
}
