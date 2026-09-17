'use client';

import { useState, useEffect } from 'react';
import { getLeetCodeCategoryMastery } from '@/app/actions/leetcode-actions';
import { Cpu, Loader2 } from 'lucide-react';

export function CategoryMastery() {
  const [categories, setCategories] = useState<{ category: string; count: number; badgeColor: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getLeetCodeCategoryMastery().then((data) => {
      setCategories(data);
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return (
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
        <span>Categorizing solved problem domains...</span>
      </div>
    );
  }

  return (
    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <span>Algorithm & DSA Category Mastery</span>
        </h3>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
        {categories.map((item) => (
          <div
            key={item.category}
            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${item.badgeColor}`}
          >
            <span className="font-semibold truncate max-w-[75%]">{item.category}</span>
            <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-black/40">
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
