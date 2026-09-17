'use client';

import { useAICommand } from '@/components/ai/ai-command-provider';
import { Search, Sparkles, Command, ShieldCheck, Plus, Import } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

import { ThemeToggle } from '@/components/theme/theme-toggle';

export function Header() {
  const { openCommandBar } = useAICommand();

  return (
    <header className="h-16 bg-[var(--exec-surface)]/90 backdrop-blur-md border-b border-[var(--exec-border)] px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs transition-all duration-200">
      {/* Search & AI Trigger Input Bar */}
      <div className="flex items-center gap-3 flex-1 max-w-xl">
        <button
          onClick={openCommandBar}
          className="w-full bg-[var(--exec-surface-secondary)] hover:bg-[var(--exec-border)]/50 border border-[var(--exec-border)] rounded-full px-4 py-2 flex items-center justify-between text-xs text-[var(--exec-text-muted)] transition-all group shadow-2xs"
        >
          <div className="flex items-center gap-2.5">
            <Search className="w-3.5 h-3.5 text-[var(--exec-text-subtle)] group-hover:text-sky-500 transition-colors" />
            <span className="font-mono text-[11px]">Command Palette...</span>
          </div>

          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[var(--exec-text-muted)] bg-[var(--exec-surface)] border border-[var(--exec-border)] px-2 py-0.5 rounded-md shadow-2xs">
            <Command className="w-3 h-3" />
            <span>K</span>
          </kbd>
        </button>
      </div>

      {/* Top Header Actions & Status Badges */}
      <div className="flex items-center gap-2.5">
        <ThemeToggle />

        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-full text-xs font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="text-[11px] font-semibold text-[var(--exec-text)]">Confirmation Gate</span>
        </div>

        <Link href="/journal">
          <Button variant="outline" size="sm" className="hidden sm:inline-flex rounded-full">
            <Import className="w-3.5 h-3.5 text-[#0284C7] dark:text-sky-400" />
            <span>Import</span>
          </Button>
        </Link>

        <Link href="/notes">
          <Button variant="primary" size="sm" className="rounded-full">
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </Button>
        </Link>
      </div>
    </header>
  );
}
