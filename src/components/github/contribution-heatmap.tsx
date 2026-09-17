'use client';

import { useState, useEffect, useMemo } from 'react';
import { getGitHubContributionMatrix, getSyncedGitHubActivity } from '@/app/actions/github-actions';
import { GitHubActivityLog } from '@/types';
import { Flame, Trophy, Calendar, Loader2, X, GitCommit, ExternalLink, Activity } from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ContributionHeatmap() {
  const [data, setData] = useState<{
    days: { date: string; count: number; level: number }[];
    totalCommits: number;
    currentStreak: number;
    longestStreak: number;
  } | null>(null);
  const [activities, setActivities] = useState<GitHubActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Day Modal State
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number; level: number } | null>(null);

  useEffect(() => {
    Promise.all([getGitHubContributionMatrix(), getSyncedGitHubActivity()]).then(([matrix, actList]) => {
      setData(matrix);
      setActivities(actList);
      setIsLoading(false);
    });
  }, []);

  const LEVEL_CLASSES = [
    'heatmap-cell',
    'heatmap-cell heatmap-lvl-1',
    'heatmap-cell heatmap-lvl-2',
    'heatmap-cell heatmap-lvl-3',
    'heatmap-cell heatmap-lvl-4',
  ];

  // Memoize activity filtering per day
  const selectedDayActivities = useMemo(() => {
    if (!selectedDay) return [];
    return activities.filter((a) => {
      const aDate = new Date(a.occurred_at).toISOString().split('T')[0];
      return aDate === selectedDay.date;
    });
  }, [selectedDay, activities]);

  if (isLoading) {
    return (
      <GlassCard className="p-6 text-center text-xs font-mono text-[#8C929B] flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" />
        <span>Calculating 365-day contribution matrix...</span>
      </GlassCard>
    );
  }

  if (!data || data.days.length === 0) {
    return null;
  }

  return (
    <GlassCard className="space-y-4">
      {/* Header Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E5E9] pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#0284C7]" />
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase">365-Day Contribution Heatmap Matrix</h3>
          <span className="text-[10px] font-mono text-[#8C929B]">(Click any cell to inspect)</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#F8F9FB] border border-[#E2E5E9] rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-[#0284C7]" />
            <span className="text-[#646A73]">Total:</span>
            <span className="font-bold text-[#17191D]">{data.totalCommits} commits</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg">
            <Flame className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-[#646A73]">Streak:</span>
            <span className="font-bold text-amber-800">{data.currentStreak} d</span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-lg">
            <Trophy className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[#646A73]">Max:</span>
            <span className="font-bold text-emerald-800">{data.longestStreak} d</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid (52 Columns x 7 Rows) */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-grid grid-rows-7 grid-flow-col gap-1">
          {data.days.map((day) => (
            <button
              key={day.date}
              onClick={() => setSelectedDay(day)}
              title={`${day.date}: ${day.count} commits (Click to view)`}
              className={`w-3 h-3 ${LEVEL_CLASSES[day.level]} cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500`}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-[10px] font-mono text-[#646A73] pt-1">
        <span>Less</span>
        {LEVEL_CLASSES.map((cls, idx) => (
          <span key={idx} className={`w-3 h-3 ${cls}`} />
        ))}
        <span>More</span>
      </div>

      {/* Interactive Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-[#17191D]/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg bg-white border border-[#E2E5E9] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-sky-50/60">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-sky-900">
                <GitCommit className="w-4 h-4 text-[#0284C7]" />
                <h3>
                  GITHUB RECORD: <span className="text-[#0284C7]">{selectedDay.date}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-lg text-[#8C929B] hover:text-[#17191D] hover:bg-[#EEF0F3] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto font-mono">
              <div className="flex items-center justify-between p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl">
                <span className="text-xs text-[#646A73]">Total Activity / Commits</span>
                <Badge variant={selectedDay.count > 0 ? 'cyan' : 'slate'}>
                  {selectedDay.count} {selectedDay.count === 1 ? 'commit' : 'commits'}
                </Badge>
              </div>

              {selectedDay.count === 0 ? (
                <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center space-y-2">
                  <Activity className="w-6 h-6 text-[#8C929B] mx-auto" />
                  <p className="text-xs text-[#646A73]">No GitHub commit activity recorded on <strong className="text-[#17191D]">{selectedDay.date}</strong>.</p>
                  <span className="text-[10px] text-[#8C929B] block">Rest day or off-platform development.</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <span className="text-[11px] font-bold text-[#646A73]">Recorded Commits & Events:</span>
                  {selectedDayActivities.length === 0 ? (
                    <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-xs text-[#646A73]">
                      {selectedDay.count} commits logged in historical matrix summary.
                    </div>
                  ) : (
                    selectedDayActivities.map((act) => (
                      <div key={act.id} className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <Badge variant="cyan">{act.event_type}</Badge>
                          <span className="text-xs font-bold text-[#17191D]">{act.repo_name}</span>
                        </div>
                        <p className="text-xs text-[#17191D] line-clamp-2">{act.message || 'Updated code'}</p>
                        {act.url && (
                          <a
                            href={act.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-[#0284C7] hover:underline pt-1 font-bold"
                          >
                            <span>View on GitHub</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </GlassCard>
  );
}
