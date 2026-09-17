'use client';

import { useState } from 'react';
import { GitHubActivityLog, GitHubRepo } from '@/types';
import { syncGitHubData, getSyncedGitHubRepos, getSyncedGitHubActivity } from '@/app/actions/github-actions';
import { ContributionHeatmap } from '@/components/github/contribution-heatmap';
import { LanguageBreakdown } from '@/components/github/language-breakdown';
import { GitBranch, RefreshCw, ExternalLink, Loader2, GitCommit, GitPullRequest, AlertCircle, Star, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface GitHubClientProps {
  initialRepos: GitHubRepo[];
  initialActivities: GitHubActivityLog[];
}

export function GitHubClient({ initialRepos, initialActivities }: GitHubClientProps) {
  const [repos, setRepos] = useState<GitHubRepo[]>(initialRepos);
  const [activities, setActivities] = useState<GitHubActivityLog[]>(initialActivities);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);

    const res = await syncGitHubData();
    if (res.success) {
      try {
        const [updatedRepos, updatedActivities] = await Promise.all([
          getSyncedGitHubRepos(),
          getSyncedGitHubActivity(),
        ]);
        setRepos(updatedRepos);
        setActivities(updatedActivities);
      } catch {
        // Fallback
      }

      const pruneMsg = res.prunedReposCount > 0 ? ` pruned ${res.prunedReposCount} deleted repos,` : '';
      setMessage({
        type: 'success',
        text: `Sync completed! Updated ${res.syncedReposCount} active repos,${pruneMsg} and synced ${res.syncedEventsCount} activity logs.`,
      });
    } else {
      setMessage({ type: 'error', text: res.error || 'GitHub Sync failed.' });
    }
    setIsSyncing(false);
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<GitBranch className="w-5 h-5 text-cyan-400" />}
        title="GitHub Activity Hub"
        description="Synchronized GitHub repositories, commit activity logs, and evidence traces."
        actions={
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            variant="primary"
            size="md"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Syncing GitHub...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync GitHub Activity</span>
              </>
            )}
          </Button>
        }
      />

      {message && (
        <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
          message.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            : 'bg-red-950/60 border-red-800 text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Feature A: 365-Day Contribution Heatmap & Streaks */}
      <ContributionHeatmap />

      {/* Feature B: Repository Language Distribution */}
      <LanguageBreakdown />

      {/* Main Grid: Activity Logs & Repositories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Stream */}
        <GlassCard>
          <CardHeader>
            <CardTitle>
              <GitCommit className="w-4 h-4 text-cyan-400" />
              <span>Recent Commit & Event Stream</span>
            </CardTitle>
          </CardHeader>

          {activities.length === 0 ? (
            <div className="p-6 bg-[#070A11]/60 border border-white/5 rounded-xl text-center text-xs font-mono text-slate-500">
              No synced GitHub activity found. Click <strong>Sync GitHub Activity</strong> above to fetch your recent events.
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {activities.map((act) => (
                <div key={act.id} className="p-3.5 bg-[#070A11]/80 border border-white/5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="cyan">{act.event_type}</Badge>
                      <span className="text-xs font-heading font-bold text-slate-200">{act.repo_name}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{new Date(act.occurred_at).toLocaleDateString()}</span>
                  </div>

                  <p className="text-xs text-slate-300 font-mono line-clamp-2">{act.message || 'No commit message'}</p>

                  {act.url && (
                    <a
                      href={act.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 pt-1 font-bold"
                    >
                      <span>View on GitHub</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Repositories Matrix */}
        <GlassCard>
          <CardHeader>
            <CardTitle>
              <GitPullRequest className="w-4 h-4 text-emerald-400" />
              <span>Synced Repositories</span>
            </CardTitle>
          </CardHeader>

          {repos.length === 0 ? (
            <div className="p-6 bg-[#070A11]/60 border border-white/5 rounded-xl text-center text-xs font-mono text-slate-500">
              No synced repositories. Click Sync above.
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {repos.map((repo) => (
                <div key={repo.id} className="p-3.5 bg-[#070A11]/80 border border-white/5 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-heading font-bold text-slate-200">{repo.full_name}</h4>
                    <a
                      href={repo.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  {repo.description && (
                    <p className="text-xs text-slate-400 font-sans line-clamp-2">{repo.description}</p>
                  )}

                  <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 pt-1">
                    {repo.language && (
                      <span className="text-slate-300 font-bold">{repo.language}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400" />
                      {repo.stargazers_count}
                    </span>
                    {repo.pushed_at && (
                      <span>Pushed: {new Date(repo.pushed_at).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
