'use client';

import { useState } from 'react';
import { LeetCodeProfile, LeetCodeSubmission } from '@/types';
import { syncLeetCodeData } from '@/app/actions/leetcode-actions';
import { LeetCodeHeatmap } from '@/components/leetcode/leetcode-heatmap';
import { DifficultyBreakdown } from '@/components/leetcode/difficulty-breakdown';
import { CategoryMastery } from '@/components/leetcode/category-mastery';
import { Code2, RefreshCw, ExternalLink, Loader2, CheckCircle2, AlertCircle, Award, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface LeetCodeClientProps {
  initialProfile: LeetCodeProfile | null;
  initialSubmissions: LeetCodeSubmission[];
}

export function LeetCodeClient({ initialProfile, initialSubmissions }: LeetCodeClientProps) {
  const [profile, setProfile] = useState<LeetCodeProfile | null>(initialProfile);
  const [submissions, setSubmissions] = useState<LeetCodeSubmission[]>(initialSubmissions);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<'All' | 'Easy' | 'Medium' | 'Hard'>('All');

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);

    const res = await syncLeetCodeData();
    setIsSyncing(false);

    if (res.success) {
      setMessage({
        type: 'success',
        text: `LeetCode sync complete! Total solved: ${res.totalSolved}, synced ${res.syncedSubmissionsCount} submissions.`,
      });
    } else {
      setMessage({ type: 'error', text: res.error || 'LeetCode sync failed.' });
    }
  };

  // Filter Submissions
  const filteredSubmissions = submissions.filter((sub) => {
    const matchesSearch = sub.title.toLowerCase().includes(searchQuery.toLowerCase()) || sub.title_slug.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDifficulty = difficultyFilter === 'All' || sub.difficulty.toLowerCase() === difficultyFilter.toLowerCase();
    return matchesSearch && matchesDifficulty;
  });

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<Code2 className="w-5 h-5 text-amber-600" />}
        title="LeetCode Analytics Workspace"
        description="Problem solving statistics, difficulty breakdown, and submission history."
        actions={
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            variant="secondary"
            size="md"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Syncing LeetCode...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync LeetCode Data</span>
              </>
            )}
          </Button>
        }
      />

      {message && (
        <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
          message.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Feature A: 365-Day LeetCode Solving Heatmap Matrix & Streaks */}
      <LeetCodeHeatmap />

      {/* Feature B: Visual Difficulty Progress Bar */}
      <DifficultyBreakdown profile={profile} />

      {/* Feature C: Algorithm & DSA Category Mastery Badges */}
      <CategoryMastery />

      {/* Submissions Section */}
      <GlassCard>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-[#E2E5E9] pb-3 mb-4">
          <CardTitle>
            <Award className="w-4 h-4 text-amber-600" />
            <span>Recent Accepted Submissions Log</span>
          </CardTitle>

          {/* Interactive Search & Difficulty Filter Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8C929B] absolute left-2.5 top-2.5" />
              <Input
                type="text"
                placeholder="Search problem title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 py-1.5 w-48 text-xs"
              />
            </div>

            <div className="flex items-center bg-[#F8F9FB] border border-[#E2E5E9] rounded-lg p-0.5 text-xs font-mono">
              {(['All', 'Easy', 'Medium', 'Hard'] as const).map((diff) => (
                <button
                  key={diff}
                  onClick={() => setDifficultyFilter(diff)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                    difficultyFilter === diff
                      ? 'bg-[#17191D] text-white'
                      : 'text-[#646A73] hover:text-[#17191D]'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredSubmissions.length === 0 ? (
          <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
            No synced LeetCode submissions match your filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSubmissions.map((sub) => (
              <div key={sub.id} className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-heading font-bold text-[#17191D]">{sub.title}</span>
                  <Badge variant="emerald">{sub.status}</Badge>
                </div>

                <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-[#646A73]">
                  <span>Solved on: {new Date(sub.timestamp).toLocaleDateString()}</span>
                  <a
                    href={`https://leetcode.com/problems/${sub.title_slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[#0284C7] hover:underline font-bold"
                  >
                    <span>View Problem</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
