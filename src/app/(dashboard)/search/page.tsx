'use client';

import { useState, useEffect } from 'react';
import { SearchResultItem } from '@/types';
import { universalSearch } from '@/app/actions/search-actions';
import Link from 'next/link';
import { Search, Loader2, ExternalLink, Filter, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export default function UniversalSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const res = await universalSearch(query.trim());
      setResults(res);
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [query]);

  const filteredResults = results.filter((r) => activeFilter === 'all' || r.type === activeFilter);

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={<Search className="w-5 h-5 text-[#0284C7]" />}
        title="Universal Cross-Entity Search Workspace"
        description="Search across Tasks, Notes, Journal, Projects, Skills, GitHub, LeetCode, Time, and Mistakes in parallel."
      />

      {/* Big Search Input */}
      <div className="relative">
        <Search className="w-5 h-5 text-[#8C929B] absolute left-4 top-3.5" />
        <Input
          type="text"
          autoFocus
          placeholder="Search anything (e.g. Python, LeetCode DP, AeroHub, binary search)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-12 pr-10 py-3.5 text-sm font-sans"
        />
        {isSearching && <Loader2 className="w-4 h-4 animate-spin text-[#0284C7] absolute right-4 top-4" />}
      </div>

      {/* Filter Tabs */}
      {results.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E2E5E9] pb-3">
          <span className="text-xs font-mono text-[#646A73] mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3 text-[#0284C7]" /> Filter:
          </span>
          {['all', 'task', 'note', 'journal', 'project', 'skill', 'github', 'leetcode', 'time', 'mistake'].map((ft) => (
            <button
              key={ft}
              onClick={() => setActiveFilter(ft)}
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold capitalize transition-all ${
                activeFilter === ft
                  ? 'bg-[#17191D] text-white shadow-xs'
                  : 'bg-white text-[#646A73] hover:text-[#17191D] border border-[#E2E5E9]'
              }`}
            >
              {ft}
            </button>
          ))}
        </div>
      )}

      {/* Results Container */}
      <div className="space-y-3">
        {query.trim().length < 2 ? (
          <div className="p-12 text-center text-xs font-mono text-[#8C929B] space-y-2 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl">
            <Sparkles className="w-6 h-6 text-[#8C929B] mx-auto" />
            <p>Type at least 2 characters to perform universal cross-entity search.</p>
          </div>
        ) : isSearching ? (
          <div className="p-8 text-center text-xs font-mono text-[#8C929B] flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" />
            <span>Searching database entities in parallel...</span>
          </div>
        ) : filteredResults.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-[#8C929B] bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl">
            No matching entities found for &quot;{query}&quot;.
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="text-xs font-mono text-[#646A73] font-bold px-1">
              Found {filteredResults.length} matching {filteredResults.length === 1 ? 'item' : 'items'}:
            </div>

            {filteredResults.map((res) => (
              <Link key={`${res.type}-${res.id}`} href={res.url} className="block">
                <GlassCard className="p-4 space-y-1.5 group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant={res.type === 'task' ? 'cyan' : res.type === 'note' ? 'indigo' : 'emerald'}>
                        {res.type}
                      </Badge>
                      <span className="text-xs font-heading font-bold text-[#17191D] group-hover:text-[#0284C7] transition-colors">
                        {res.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] font-mono text-[#8C929B]">
                      {res.date && <span>{res.date}</span>}
                      <ExternalLink className="w-3.5 h-3.5 group-hover:text-[#0284C7] transition-colors" />
                    </div>
                  </div>

                  <p className="text-xs text-[#646A73] font-sans line-clamp-2">{res.subtitle}</p>
                </GlassCard>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
