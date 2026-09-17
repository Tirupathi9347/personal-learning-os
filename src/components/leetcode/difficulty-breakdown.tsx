'use client';

import { LeetCodeProfile } from '@/types';
import { Award } from 'lucide-react';

export function DifficultyBreakdown({ profile }: { profile: LeetCodeProfile | null }) {
  if (!profile) return null;

  const total = profile.total_solved || 1;
  const easyPct = Math.round(((profile.easy_solved || 0) / total) * 100);
  const medPct = Math.round(((profile.medium_solved || 0) / total) * 100);
  const hardPct = Math.round(((profile.hard_solved || 0) / total) * 100);

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <Award className="w-4 h-4 text-amber-400" />
          <span>Difficulty Distribution Percentage Share</span>
        </h3>
        <span className="text-[11px] text-slate-400">Total: {profile.total_solved} solved</span>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex">
        <div
          title={`Easy: ${easyPct}% (${profile.easy_solved})`}
          style={{ width: `${easyPct}%` }}
          className="h-full bg-emerald-500 transition-all hover:opacity-80"
        />
        <div
          title={`Medium: ${medPct}% (${profile.medium_solved})`}
          style={{ width: `${medPct}%` }}
          className="h-full bg-amber-500 transition-all hover:opacity-80"
        />
        <div
          title={`Hard: ${hardPct}% (${profile.hard_solved})`}
          style={{ width: `${hardPct}%` }}
          className="h-full bg-red-500 transition-all hover:opacity-80"
        />
      </div>

      {/* Percentage Badges */}
      <div className="flex items-center justify-between text-xs pt-1">
        <div className="flex items-center gap-1.5 text-emerald-400">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-semibold">Easy: {profile.easy_solved}</span>
          <span className="text-slate-500 text-[11px]">({easyPct}%)</span>
        </div>

        <div className="flex items-center gap-1.5 text-amber-400">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span className="font-semibold">Medium: {profile.medium_solved}</span>
          <span className="text-slate-500 text-[11px]">({medPct}%)</span>
        </div>

        <div className="flex items-center gap-1.5 text-red-400">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="font-semibold">Hard: {profile.hard_solved}</span>
          <span className="text-slate-500 text-[11px]">({hardPct}%)</span>
        </div>
      </div>
    </div>
  );
}
