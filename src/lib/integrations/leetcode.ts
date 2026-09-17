import { createServiceRoleClient } from '@/lib/supabase/server';
import { decryptApiKey } from '@/lib/crypto/encryption';

export interface LeetCodeRawStats {
  username: string;
  ranking: number | null;
  totalSolved: number;
  easySolved: number;
  mediumSolved: number;
  hardSolved: number;
  acceptanceRate: number;
  recentSubmissions: {
    id: string;
    title: string;
    titleSlug: string;
    timestamp: string;
  }[];
}

/**
 * Server-only resolution of stored LeetCode username.
 */
export async function getResolvedLeetCodeUsername(): Promise<string> {
  try {
    const supabase = createServiceRoleClient();
    const { data } = await supabase
      .from('api_keys_config')
      .select('*')
      .eq('provider', 'leetcode')
      .eq('is_active', true)
      .maybeSingle();

    if (data && data.encrypted_key && data.iv && data.auth_tag) {
      const decryptedUsername = decryptApiKey(data.encrypted_key, data.iv, data.auth_tag);
      if (decryptedUsername && decryptedUsername.trim()) {
        return decryptedUsername.trim();
      }
    }
  } catch (err) {
    // Fall back to environment variable
  }

  const envUsername = process.env.LEETCODE_USERNAME;
  if (!envUsername) {
    throw new Error('No valid LeetCode username found in vault or environment variables.');
  }

  return envUsername.trim();
}

/**
 * Fetch profile statistics and recent accepted submissions for a LeetCode user.
 * Tries official GraphQL endpoint with headers, then reliable fallback API mirror.
 */
export async function fetchLeetCodeUserStats(username: string): Promise<LeetCodeRawStats> {
  const cleanUsername = username.trim();

  // Try official GraphQL API first
  try {
    const query = `
      query userProfileAndSubmissions($username: String!) {
        matchedUser(username: $username) {
          username
          profile {
            ranking
          }
          submitStatsGlobal {
            acSubmissionNum {
              difficulty
              count
            }
          }
        }
        recentAcSubmissionList(username: $username, limit: 20) {
          id
          title
          titleSlug
          timestamp
        }
      }
    `;

    const res = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        Referer: 'https://leetcode.com',
      },
      body: JSON.stringify({
        query,
        variables: { username: cleanUsername },
      }),
      cache: 'no-store',
    });

    if (res.ok) {
      const json = await res.json();
      const matched = json.data?.matchedUser;

      if (matched) {
        const stats = matched.submitStatsGlobal?.acSubmissionNum || [];
        const allItem = stats.find((s: any) => s.difficulty === 'All');
        const easyItem = stats.find((s: any) => s.difficulty === 'Easy');
        const mediumItem = stats.find((s: any) => s.difficulty === 'Medium');
        const hardItem = stats.find((s: any) => s.difficulty === 'Hard');

        const recentList = (json.data?.recentAcSubmissionList || []).map((sub: any) => ({
          id: sub.id || `${cleanUsername}-${sub.titleSlug}-${sub.timestamp}`,
          title: sub.title,
          titleSlug: sub.titleSlug,
          timestamp: new Date(parseInt(sub.timestamp, 10) * 1000).toISOString(),
        }));

        return {
          username: cleanUsername,
          ranking: matched.profile?.ranking || null,
          totalSolved: allItem ? allItem.count : 0,
          easySolved: easyItem ? easyItem.count : 0,
          mediumSolved: mediumItem ? mediumItem.count : 0,
          hardSolved: hardItem ? hardItem.count : 0,
          acceptanceRate: 0,
          recentSubmissions: recentList,
        };
      }
    }
  } catch (err) {
    // Continue to fallback
  }

  // Fallback to Alfa LeetCode REST API mirror
  try {
    const [profileRes, acRes] = await Promise.all([
      fetch(`https://alfa-leetcode-api.onrender.com/userProfile/${cleanUsername}`, { cache: 'no-store' }),
      fetch(`https://alfa-leetcode-api.onrender.com/${cleanUsername}/acSubmission?limit=20`, { cache: 'no-store' }),
    ]);

    if (!profileRes.ok) {
      throw new Error(`LeetCode user "@${cleanUsername}" not found or profile is restricted.`);
    }

    const profileData = await profileRes.json();
    const acData = acRes.ok ? await acRes.json() : { submission: [] };

    const recentSubmissions = (acData.submission || []).map((sub: any) => ({
      id: sub.id || `${cleanUsername}-${sub.titleSlug}-${sub.timestamp}`,
      title: sub.title,
      titleSlug: sub.titleSlug,
      timestamp: new Date(parseInt(sub.timestamp, 10) * 1000).toISOString(),
    }));

    return {
      username: cleanUsername,
      ranking: profileData.ranking || null,
      totalSolved: profileData.totalSolved || 0,
      easySolved: profileData.easySolved || 0,
      mediumSolved: profileData.mediumSolved || 0,
      hardSolved: profileData.hardSolved || 0,
      acceptanceRate: profileData.acceptanceRate || 0,
      recentSubmissions,
    };
  } catch (err: any) {
    throw new Error(`Failed to fetch LeetCode data for @${cleanUsername}: ${err.message}`);
  }
}
