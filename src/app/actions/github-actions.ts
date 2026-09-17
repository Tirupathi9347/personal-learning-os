'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/encryption';
import { fetchGitHubApi } from '@/lib/integrations/github';
import { ApiKeyPublicConfig, GitHubActivityLog, GitHubRepo } from '@/types';
import { revalidatePath } from 'next/cache';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore static generation store missing error outside Next.js request context
  }
}

/**
 * Save or update GitHub Personal Access Token in encrypted Vault.
 * Token is encrypted on the server using AES-256-GCM.
 * Never logs or returns plaintext token to the client.
 */
export async function saveGitHubToken(
  plaintextToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!plaintextToken || plaintextToken.trim() === '') {
      return { success: false, error: 'GitHub Token cannot be empty.' };
    }

    const encrypted = encryptApiKey(plaintextToken.trim());
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('api_keys_config')
      .upsert(
        {
          provider: 'github',
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          selected_model: 'github-rest-api',
          is_active: true,
          health_status: 'healthy',
          last_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'provider' }
      );

    if (error) {
      return { success: false, error: error.message };
    }

    safeRevalidate('/settings');
    safeRevalidate('/github');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save GitHub token.' };
  }
}

/**
 * Fetch safe public configuration for GitHub Vault.
 */
export async function getGitHubVaultConfig(): Promise<ApiKeyPublicConfig | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('id, provider, selected_model, is_active, health_status, last_checked_at, created_at, encrypted_key')
      .eq('provider', 'github')
      .maybeSingle();

    if (!data) {
      return null;
    }

    return {
      id: data.id,
      provider: data.provider,
      selected_model: data.selected_model || 'github-rest-api',
      is_active: data.is_active,
      health_status: data.health_status || 'healthy',
      last_checked_at: data.last_checked_at,
      created_at: data.created_at,
      has_key: !!data.encrypted_key,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Server-side health check verifying token against GitHub /user.
 */
export async function testGitHubConnection(): Promise<{ success: boolean; message: string; username?: string }> {
  try {
    const { data: user, rateLimitRemaining } = await fetchGitHubApi('/user');
    const supabase = createServiceRoleClient();

    await supabase
      .from('api_keys_config')
      .update({ health_status: 'healthy', last_checked_at: new Date().toISOString() })
      .eq('provider', 'github');

    safeRevalidate('/settings');
    safeRevalidate('/github');
    return {
      success: true,
      username: user.login,
      message: `Successfully connected as GitHub user @${user.login}! (Rate Limit Remaining: ${rateLimitRemaining ?? 'N/A'})`,
    };
  } catch (err: any) {
    const supabase = createServiceRoleClient();
    await supabase
      .from('api_keys_config')
      .update({ health_status: 'invalid', last_checked_at: new Date().toISOString() })
      .eq('provider', 'github');

    safeRevalidate('/settings');
    safeRevalidate('/github');
    return { success: false, message: `GitHub Connection failed: ${err.message}` };
  }
}

/**
 * Sync Repositories & User Events from GitHub into PostgreSQL database.
 * Upserts active repositories and automatically prunes stale/deleted repositories.
 * Prevents duplicate entries using UNIQUE(github_id) and UNIQUE(event_id).
 */
export async function syncGitHubData(): Promise<{
  success: boolean;
  syncedReposCount: number;
  syncedEventsCount: number;
  prunedReposCount: number;
  error?: string;
}> {
  try {
    const supabase = createServiceRoleClient();

    // 1. Get authenticated user login
    const { data: user } = await fetchGitHubApi('/user');
    const username = user.login;

    // 2. Fetch Active User Repositories from GitHub API
    const { data: repos } = await fetchGitHubApi('/user/repos?sort=updated&per_page=100');
    let syncedReposCount = 0;
    const activeGithubIds = new Set<number>();

    for (const repo of repos) {
      activeGithubIds.add(repo.id);

      const { error } = await supabase.from('github_repos').upsert(
        {
          github_id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          html_url: repo.html_url,
          description: repo.description || null,
          stargazers_count: repo.stargazers_count || 0,
          forks_count: repo.forks_count || 0,
          language: repo.language || null,
          pushed_at: repo.pushed_at || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'github_id' }
      );
      if (!error) syncedReposCount++;
    }

    // 3. Prune stale/deleted repositories from database that no longer exist on GitHub
    let prunedReposCount = 0;
    const { data: existingRepos } = await supabase.from('github_repos').select('id, github_id');
    
    if (existingRepos && existingRepos.length > 0) {
      const staleDbIds = existingRepos
        .filter((existing) => !activeGithubIds.has(existing.github_id))
        .map((existing) => existing.id);

      if (staleDbIds.length > 0) {
        const { error: deleteErr } = await supabase
          .from('github_repos')
          .delete()
          .in('id', staleDbIds);

        if (!deleteErr) {
          prunedReposCount = staleDbIds.length;
        }
      }
    }

    // 4. Fetch User Activity Events (Commits, Pull Requests, Issues)
    const { data: events } = await fetchGitHubApi(`/users/${username}/events?per_page=30`);
    let syncedEventsCount = 0;

    for (const ev of events) {
      let commitMsg: string | null = null;
      let targetUrl: string | null = null;

      if (ev.type === 'PushEvent' && ev.payload?.commits?.length > 0) {
        commitMsg = ev.payload.commits.map((c: any) => c.message).join('; ');
        targetUrl = `https://github.com/${ev.repo.name}/commits`;
      } else if (ev.type === 'PullRequestEvent') {
        commitMsg = `PR #${ev.payload?.number}: ${ev.payload?.pull_request?.title || 'Pull Request'}`;
        targetUrl = ev.payload?.pull_request?.html_url || `https://github.com/${ev.repo.name}`;
      } else if (ev.type === 'IssuesEvent') {
        commitMsg = `Issue #${ev.payload?.issue?.number}: ${ev.payload?.issue?.title || 'Issue'}`;
        targetUrl = ev.payload?.issue?.html_url || `https://github.com/${ev.repo.name}`;
      } else {
        commitMsg = `${ev.type} on ${ev.repo.name}`;
        targetUrl = `https://github.com/${ev.repo.name}`;
      }

      const { data: syncedLog, error } = await supabase
        .from('github_activity_logs')
        .upsert(
          {
            event_id: ev.id,
            event_type: ev.type,
            repo_name: ev.repo.name,
            message: commitMsg,
            url: targetUrl,
            occurred_at: ev.created_at,
            payload: ev.payload || {},
          },
          { onConflict: 'event_id' }
        )
        .select()
        .single();

      if (!error && syncedLog) {
        syncedEventsCount++;

        // Auto-link commit activity to active Projects matching repository URL
        const { data: matchingProjects } = await supabase
          .from('projects')
          .select('id, github_repo_url')
          .ilike('github_repo_url', `%${ev.repo.name}%`);

        if (matchingProjects && matchingProjects.length > 0) {
          for (const proj of matchingProjects) {
            await supabase.from('evidence_links').upsert(
              {
                source_type: 'github_activity',
                source_id: syncedLog.id,
                target_type: 'project',
                target_id: proj.id,
                weight: 1.0,
              },
              { onConflict: 'id' }
            );
          }
        }
      }
    }

    safeRevalidate('/github');
    safeRevalidate('/projects');
    safeRevalidate('/skills');
    safeRevalidate('/');

    return {
      success: true,
      syncedReposCount,
      syncedEventsCount,
      prunedReposCount,
    };
  } catch (err: any) {
    return {
      success: false,
      syncedReposCount: 0,
      syncedEventsCount: 0,
      prunedReposCount: 0,
      error: err.message || 'GitHub Sync failed.',
    };
  }
}

/**
 * Get synced GitHub Repositories.
 */
export async function getSyncedGitHubRepos(): Promise<GitHubRepo[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('github_repos')
      .select('*')
      .order('pushed_at', { ascending: false });

    return (data as GitHubRepo[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Get synced GitHub Activity Logs.
 */
export async function getSyncedGitHubActivity(): Promise<GitHubActivityLog[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('github_activity_logs')
      .select('*')
      .order('occurred_at', { ascending: false });

    return (data as GitHubActivityLog[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Feature A: Get 365-Day Contribution Heatmap Matrix & Streaks.
 */
export async function getGitHubContributionMatrix(): Promise<{
  days: { date: string; count: number; level: number }[];
  totalCommits: number;
  currentStreak: number;
  longestStreak: number;
}> {
  try {
    const supabase = createServiceRoleClient();
    const { data: logs } = await supabase
      .from('github_activity_logs')
      .select('occurred_at')
      .order('occurred_at', { ascending: true });

    // Group logs by YYYY-MM-DD
    const countsByDate: Record<string, number> = {};
    if (logs) {
      for (const log of logs) {
        const dateStr = new Date(log.occurred_at).toISOString().split('T')[0];
        countsByDate[dateStr] = (countsByDate[dateStr] || 0) + 1;
      }
    }

    // Build last 365 days array
    const today = new Date();
    const days: { date: string; count: number; level: number }[] = [];
    let totalCommits = 0;

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = countsByDate[dateStr] || 0;
      totalCommits += count;

      let level = 0;
      if (count > 0 && count <= 2) level = 1;
      else if (count > 2 && count <= 5) level = 2;
      else if (count > 5 && count <= 8) level = 3;
      else if (count > 8) level = 4;

      days.push({ date: dateStr, count, level });
    }

    // Calculate streaks
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    for (const day of days) {
      if (day.count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Current streak working backwards from today
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) {
        currentStreak++;
      } else if (i === days.length - 1) {
        // If today has 0 commits, check yesterday
        continue;
      } else {
        break;
      }
    }

    return {
      days,
      totalCommits,
      currentStreak,
      longestStreak,
    };
  } catch (err) {
    return { days: [], totalCommits: 0, currentStreak: 0, longestStreak: 0 };
  }
}

/**
 * Feature B: Get Language Breakdown across active repositories.
 */
export async function getGitHubLanguageBreakdown(): Promise<{ language: string; count: number; percentage: number; color: string }[]> {
  try {
    const repos = await getSyncedGitHubRepos();
    const langCounts: Record<string, number> = {};
    let totalWithLang = 0;

    for (const repo of repos) {
      if (repo.language) {
        langCounts[repo.language] = (langCounts[repo.language] || 0) + 1;
        totalWithLang++;
      }
    }

    if (totalWithLang === 0) return [];

    const COLOR_MAP: Record<string, string> = {
      TypeScript: 'bg-blue-500',
      JavaScript: 'bg-yellow-400',
      Python: 'bg-emerald-500',
      HTML: 'bg-orange-500',
      CSS: 'bg-purple-500',
      C: 'bg-slate-400',
      'C++': 'bg-pink-500',
      Rust: 'bg-amber-600',
      Go: 'bg-cyan-500',
      Java: 'bg-red-500',
    };

    return Object.entries(langCounts)
      .map(([lang, count]) => ({
        language: lang,
        count,
        percentage: Math.round((count / totalWithLang) * 100),
        color: COLOR_MAP[lang] || 'bg-indigo-500',
      }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    return [];
  }
}

/**
 * Feature C: Get latest 3 commits for a project matching github_repo_url.
 */
export async function getProjectLatestCommits(repoUrl: string): Promise<GitHubActivityLog[]> {
  try {
    if (!repoUrl) return [];
    const supabase = createServiceRoleClient();

    // Extract repo name e.g. "Tirupathi9347/Personal-Learning-OS"
    const cleanRepoName = repoUrl.replace(/https?:\/\/github\.com\//, '').replace(/\/$/, '');

    const { data } = await supabase
      .from('github_activity_logs')
      .select('*')
      .ilike('repo_name', `%${cleanRepoName}%`)
      .order('occurred_at', { ascending: false })
      .limit(3);

    return (data as GitHubActivityLog[]) || [];
  } catch (err) {
    return [];
  }
}
