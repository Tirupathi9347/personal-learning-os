'use client';

import { useState, useEffect } from 'react';
import { getGitHubLanguageBreakdown } from '@/app/actions/github-actions';
import { Code2, Loader2 } from 'lucide-react';

export function LanguageBreakdown() {
  const [languages, setLanguages] = useState<{ language: string; count: number; percentage: number; color: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getGitHubLanguageBreakdown().then((data) => {
      setLanguages(data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
        <span>Calculating language distribution...</span>
      </div>
    );
  }

  if (languages.length === 0) {
    return null;
  }

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-purple-400" />
          <span>Repository Language Distribution</span>
        </h3>
      </div>

      {/* Multi-segment Progress Bar */}
      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex">
        {languages.map((item) => (
          <div
            key={item.language}
            title={`${item.language}: ${item.percentage}% (${item.count} repos)`}
            style={{ width: `${item.percentage}%` }}
            className={`h-full ${item.color} transition-all hover:opacity-80`}
          />
        ))}
      </div>

      {/* Language Badges Grid */}
      <div className="flex flex-wrap gap-3 pt-1">
        {languages.map((item) => (
          <div key={item.language} className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            <span className="font-medium">{item.language}</span>
            <span className="text-slate-500 text-[11px]">{item.percentage}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
