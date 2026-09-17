'use server';

import { createServiceRoleClient } from '@/lib/supabase/server';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/encryption';
import { fetchLeetCodeUserStats, getResolvedLeetCodeUsername } from '@/lib/integrations/leetcode';
import { ApiKeyPublicConfig, LeetCodeProfile, LeetCodeSubmission } from '@/types';
import { revalidatePath } from 'next/cache';

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Ignore static generation store missing error outside Next.js request context
  }
}

/**
 * Save LeetCode username in encrypted Vault.
 */
export async function saveLeetCodeConfig(
  usernameInput: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!usernameInput || usernameInput.trim() === '') {
      return { success: false, error: 'LeetCode username cannot be empty.' };
    }

    const cleanUsername = usernameInput.trim();
    const encrypted = encryptApiKey(cleanUsername);
    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from('api_keys_config')
      .upsert(
        {
          provider: 'leetcode',
          encrypted_key: encrypted.encryptedKey,
          iv: encrypted.iv,
          auth_tag: encrypted.authTag,
          selected_model: 'leetcode-graphql-api',
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
    safeRevalidate('/leetcode');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to save LeetCode config.' };
  }
}

/**
 * Fetch safe public configuration for LeetCode Vault.
 */
export async function getLeetCodeVaultConfig(): Promise<(ApiKeyPublicConfig & { username?: string }) | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'leetcode')
      .maybeSingle();

    if (!data) return null;

    let decryptedUsername = '';
    if (data.encrypted_key && data.iv && data.auth_tag) {
      try {
        decryptedUsername = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
      } catch {
        // Ignore
      }
    }

    return {
      id: data.id,
      provider: data.provider,
      selected_model: data.selected_model || 'leetcode-graphql-api',
      is_active: data.is_active,
      health_status: (data.health_status as any) || 'healthy',
      last_checked_at: data.last_checked_at,
      created_at: data.created_at,
      has_key: !!data.encrypted_key,
      username: decryptedUsername,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Server-side health check testing LeetCode username against API.
 */
export async function testLeetCodeConnection(): Promise<{ success: boolean; message: string; stats?: any }> {
  try {
    const username = await getResolvedLeetCodeUsername();
    const stats = await fetchLeetCodeUserStats(username);

    const supabase = createServiceRoleClient();
    await supabase
      .from('api_keys_config')
      .update({ health_status: 'healthy', last_checked_at: new Date().toISOString() })
      .eq('provider', 'leetcode');

    safeRevalidate('/settings');
    safeRevalidate('/leetcode');

    return {
      success: true,
      message: `Successfully connected to LeetCode handle @${username}! Total Solved: ${stats.totalSolved} (Easy: ${stats.easySolved}, Medium: ${stats.mediumSolved}, Hard: ${stats.hardSolved}).`,
      stats,
    };
  } catch (err: any) {
    const supabase = createServiceRoleClient();
    await supabase
      .from('api_keys_config')
      .update({ health_status: 'invalid', last_checked_at: new Date().toISOString() })
      .eq('provider', 'leetcode');

    safeRevalidate('/settings');
    safeRevalidate('/leetcode');
    return { success: false, message: `LeetCode Connection test failed: ${err.message}` };
  }
}

/**
 * Sync LeetCode profile stats & recent accepted submissions into PostgreSQL database cache.
 * Deduplicates submissions by UNIQUE(submission_id).
 */
export async function syncLeetCodeData(): Promise<{
  success: boolean;
  totalSolved: number;
  syncedSubmissionsCount: number;
  error?: string;
}> {
  try {
    const username = await getResolvedLeetCodeUsername();
    const stats = await fetchLeetCodeUserStats(username);
    const supabase = createServiceRoleClient();

    // 1. Cache Profile Stats
    const { error: profileErr } = await supabase.from('leetcode_profile_cache').upsert(
      {
        username: stats.username,
        ranking: stats.ranking,
        total_solved: stats.totalSolved,
        easy_solved: stats.easySolved,
        medium_solved: stats.mediumSolved,
        hard_solved: stats.hardSolved,
        acceptance_rate: stats.acceptanceRate,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'username' }
    );

    if (profileErr) {
      console.error('Error caching LeetCode profile:', profileErr.message);
    }

    // 2. Cache Recent Accepted Submissions
    let syncedSubmissionsCount = 0;

    for (const sub of stats.recentSubmissions) {
      const { data: syncedSub, error: subErr } = await supabase
        .from('leetcode_submissions_log')
        .upsert(
          {
            submission_id: sub.id,
            username: stats.username,
            title: sub.title,
            title_slug: sub.titleSlug,
            difficulty: 'Medium',
            status: 'Accepted',
            timestamp: sub.timestamp,
          },
          { onConflict: 'submission_id' }
        )
        .select()
        .single();

      if (!subErr && syncedSub) {
        syncedSubmissionsCount++;

        // Auto-link LeetCode problem solving evidence to matching Skills
        const { data: algoSkills } = await supabase
          .from('skills')
          .select('id')
          .or('name.ilike.%algorithm%,name.ilike.%problem%,name.ilike.%data structure%,category.ilike.%computer science%');

        if (algoSkills && algoSkills.length > 0) {
          for (const sk of algoSkills) {
            await supabase.from('evidence_links').upsert(
              {
                source_type: 'leetcode_submission',
                source_id: syncedSub.id,
                target_type: 'skill',
                target_id: sk.id,
                weight: 1.0,
              },
              { onConflict: 'id' }
            );
          }
        }
      }
    }

    safeRevalidate('/leetcode');
    safeRevalidate('/skills');
    safeRevalidate('/journal');
    safeRevalidate('/');

    return {
      success: true,
      totalSolved: stats.totalSolved,
      syncedSubmissionsCount,
    };
  } catch (err: any) {
    return {
      success: false,
      totalSolved: 0,
      syncedSubmissionsCount: 0,
      error: err.message || 'LeetCode Sync failed.',
    };
  }
}

/**
 * Get cached LeetCode Profile from database.
 */
export async function getSyncedLeetCodeProfile(): Promise<LeetCodeProfile | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('leetcode_profile_cache')
      .select('*')
      .order('last_synced_at', { ascending: false })
      .maybeSingle();

    return (data as LeetCodeProfile) || null;
  } catch (err) {
    return null;
  }
}

/**
 * Get cached LeetCode Submissions Log from database.
 */
export async function getSyncedLeetCodeSubmissions(): Promise<LeetCodeSubmission[]> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('leetcode_submissions_log')
      .select('*')
      .order('timestamp', { ascending: false });

    return (data as LeetCodeSubmission[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Feature A: Get 365-Day LeetCode Solving Heatmap Matrix & Streaks.
 */
export async function getLeetCodeContributionMatrix(): Promise<{
  days: { date: string; count: number; level: number }[];
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
}> {
  try {
    const supabase = createServiceRoleClient();
    const { data: subs } = await supabase
      .from('leetcode_submissions_log')
      .select('timestamp')
      .order('timestamp', { ascending: true });

    const countsByDate: Record<string, number> = {};
    if (subs) {
      for (const sub of subs) {
        const dateStr = new Date(sub.timestamp).toISOString().split('T')[0];
        countsByDate[dateStr] = (countsByDate[dateStr] || 0) + 1;
      }
    }

    const today = new Date();
    const days: { date: string; count: number; level: number }[] = [];
    let totalSolved = 0;

    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = countsByDate[dateStr] || 0;
      totalSolved += count;

      let level = 0;
      if (count > 0 && count <= 1) level = 1;
      else if (count === 2) level = 2;
      else if (count >= 3 && count <= 4) level = 3;
      else if (count >= 5) level = 4;

      days.push({ date: dateStr, count, level });
    }

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

    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i].count > 0) {
        currentStreak++;
      } else if (i === days.length - 1) {
        continue;
      } else {
        break;
      }
    }

    return {
      days,
      totalSolved,
      currentStreak,
      longestStreak,
    };
  } catch (err) {
    return { days: [], totalSolved: 0, currentStreak: 0, longestStreak: 0 };
  }
}

/**
 * Feature C: Get Algorithm & DSA Category Mastery Breakdown from solved problems.
 */
export async function getLeetCodeCategoryMastery(): Promise<{ category: string; count: number; badgeColor: string }[]> {
  try {
    const subs = await getSyncedLeetCodeSubmissions();
    const categoryCounts: Record<string, number> = {
      'Arrays & Hashing': 0,
      'Two Pointers & Sliding Window': 0,
      'Stack & Queue': 0,
      'Binary Search': 0,
      'Linked List': 0,
      'Trees & Graphs': 0,
      'Dynamic Programming': 0,
      'Math & Bit Manipulation': 0,
    };

    for (const sub of subs) {
      const slug = sub.title_slug.toLowerCase();
      if (slug.includes('array') || slug.includes('hash') || slug.includes('two-sum') || slug.includes('duplicate')) {
        categoryCounts['Arrays & Hashing']++;
      } else if (slug.includes('pointer') || slug.includes('window') || slug.includes('water') || slug.includes('palindrome')) {
        categoryCounts['Two Pointers & Sliding Window']++;
      } else if (slug.includes('stack') || slug.includes('queue') || slug.includes('parenthes')) {
        categoryCounts['Stack & Queue']++;
      } else if (slug.includes('search') || slug.includes('binary')) {
        categoryCounts['Binary Search']++;
      } else if (slug.includes('list') || slug.includes('node')) {
        categoryCounts['Linked List']++;
      } else if (slug.includes('tree') || slug.includes('graph') || slug.includes('path') || slug.includes('depth')) {
        categoryCounts['Trees & Graphs']++;
      } else if (slug.includes('dynamic') || slug.includes('dp') || slug.includes('subsequence') || slug.includes('climb')) {
        categoryCounts['Dynamic Programming']++;
      } else {
        categoryCounts['Math & Bit Manipulation']++;
      }
    }

    const COLOR_MAP: Record<string, string> = {
      'Arrays & Hashing': 'text-amber-400 bg-amber-950/60 border-amber-800',
      'Two Pointers & Sliding Window': 'text-blue-400 bg-blue-950/60 border-blue-800',
      'Stack & Queue': 'text-purple-400 bg-purple-950/60 border-purple-800',
      'Binary Search': 'text-cyan-400 bg-cyan-950/60 border-cyan-800',
      'Linked List': 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
      'Trees & Graphs': 'text-indigo-400 bg-indigo-950/60 border-indigo-800',
      'Dynamic Programming': 'text-rose-400 bg-rose-950/60 border-rose-800',
      'Math & Bit Manipulation': 'text-slate-300 bg-slate-800/60 border-slate-700',
    };

    return Object.entries(categoryCounts).map(([cat, count]) => ({
      category: cat,
      count,
      badgeColor: COLOR_MAP[cat] || 'text-slate-300 bg-slate-800 border-slate-700',
    }));
  } catch (err) {
    return [];
  }
}
