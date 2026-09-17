'use client';

import { useState, useEffect, useMemo } from 'react';
import { getLeetCodeContributionMatrix, getSyncedLeetCodeSubmissions } from '@/app/actions/leetcode-actions';
import { LeetCodeSubmission } from '@/types';
import { Flame, Trophy, Calendar, Loader2, X, Code2, ExternalLink, Activity } from 'lucide-react';

export function LeetCodeHeatmap() {
  const [data, setData] = useState<{
    days: { date: string; count: number; level: number }[];
    totalSolved: number;
    currentStreak: number;
    longestStreak: number;
  } | null>(null);
  const [submissions, setSubmissions] = useState<LeetCodeSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Selected Day Modal State
  const [selectedDay, setSelectedDay] = useState<{ date: string; count: number; level: number } | null>(null);

  useEffect(() => {
    Promise.all([getLeetCodeContributionMatrix(), getSyncedLeetCodeSubmissions()]).then(([matrix, subList]) => {
      setData(matrix);
      setSubmissions(subList);
      setIsLoading(false);
    });
  }, []);

  const LEVEL_COLORS = [
    'bg-slate-950 border border-slate-900', // 0 solved
    'bg-amber-900/60 border border-amber-800',  // 1
    'bg-amber-600 border border-amber-500',     // 2
    'bg-emerald-500 border border-emerald-400', // 3-4
    'bg-emerald-400 border border-emerald-300 shadow-sm shadow-emerald-400/30', // 5+
  ];

  // Memoize submission filtering per day
  const selectedDaySubmissions = useMemo(() => {
    if (!selectedDay) return [];
    return submissions.filter((s) => {
      const sDate = new Date(s.timestamp).toISOString().split('T')[0];
      return sDate === selectedDay.date;
    });
  }, [selectedDay, submissions]);

  if (isLoading) {
    return (
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        <span>Calculating 365-day LeetCode solving matrix...</span>
      </div>
    );
  }

  if (!data || data.days.length === 0) {
    return null;
  }

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
      {/* Header Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold text-slate-200">365-Day LeetCode Solving Heatmap Matrix</h3>
          <span className="text-[10px] text-slate-500">(Click any box to view day details)</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-950 border border-slate-800 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Total Synced:</span>
            <span className="font-bold text-slate-200">{data.totalSolved} solved</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-950/40 border border-amber-800/60 rounded-lg">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400">Current Streak:</span>
            <span className="font-bold text-amber-300">{data.currentStreak} days</span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/60 rounded-lg">
            <Trophy className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Longest Streak:</span>
            <span className="font-bold text-emerald-300">{data.longestStreak} days</span>
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
              title={`${day.date}: ${day.count} solved (Click to view)`}
              className={`w-3 h-3 rounded-sm transition-all hover:scale-150 hover:z-20 cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-400 ${LEVEL_COLORS[day.level]}`}
            />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-400 pt-1">
        <span>Less</span>
        {LEVEL_COLORS.map((color, idx) => (
          <span key={idx} className={`w-3 h-3 rounded-sm ${color}`} />
        ))}
        <span>More</span>
      </div>

      {/* Interactive Day Details Modal */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="flex items-center gap-2">
                <Code2 className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">
                  LeetCode Day Record: <span className="text-amber-400 font-mono">{selectedDay.date}</span>
                </h3>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-xs text-slate-400">Total Solved on Date</span>
                <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  selectedDay.count > 0 ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-400'
                }`}>
                  {selectedDay.count} {selectedDay.count === 1 ? 'problem' : 'problems'}
                </span>
              </div>

              {selectedDay.count === 0 ? (
                <div className="p-6 bg-slate-950/60 border border-slate-800/80 rounded-lg text-center space-y-2">
                  <Activity className="w-6 h-6 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">No LeetCode problems solved on <strong className="text-slate-200">{selectedDay.date}</strong>.</p>
                  <span className="text-[10px] text-slate-500 block">Rest day or zero submissions recorded.</span>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <span className="text-[11px] font-semibold text-slate-400">Solved Problems on Date:</span>
                  {selectedDaySubmissions.length === 0 ? (
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-400">
                      {selectedDay.count} problems solved in historical matrix summary.
                    </div>
                  ) : (
                    selectedDaySubmissions.map((sub) => (
                      <div key={sub.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200">{sub.title}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {sub.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                          <span>Difficulty: {sub.difficulty}</span>
                          <a
                            href={`https://leetcode.com/problems/${sub.title_slug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold"
                          >
                            <span>View Problem</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
