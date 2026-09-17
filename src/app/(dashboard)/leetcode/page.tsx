import { getSyncedLeetCodeProfile, getSyncedLeetCodeSubmissions } from '@/app/actions/leetcode-actions';
import { LeetCodeClient } from '@/components/leetcode/leetcode-client';

export default async function LeetCodePage() {
  const [profile, submissions] = await Promise.all([
    getSyncedLeetCodeProfile(),
    getSyncedLeetCodeSubmissions(),
  ]);

  return <LeetCodeClient initialProfile={profile} initialSubmissions={submissions} />;
}
