import { getActiveLearningPath, archiveLearningPath } from '@/app/actions/learning-path-actions';
import { DayProgressCard } from '@/components/learning-path/day-progress-card';
import { Button } from '@/components/ui/button';
import { GlassCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  BookMarked,
  Brain,
  Target,
  CheckCircle2,
  Calendar,
  TrendingUp,
  ArrowRight,
  Plus,
  AlertCircle,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function LearningPathPage() {
  const result = await getActiveLearningPath();

  if (!result.success) {
    return (
      <div className="space-y-6 animate-page-entrance">
        <div className="p-6 rounded-2xl bg-rose-500/5 border border-rose-500/20 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500" />
          <p className="text-sm text-[var(--exec-text)]">
            Failed to load Learning Path: {result.error}
          </p>
        </div>
      </div>
    );
  }

  const path = result.data;

  // ── No active path ──
  if (!path) {
    return (
      <div className="space-y-6 animate-page-entrance">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
            <BookMarked className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold text-[var(--exec-text)]">
              My Learning Path
            </h1>
            <p className="text-xs text-[var(--exec-text-muted)] font-sans">
              Your AI-generated day-by-day roadmap will appear here
            </p>
          </div>
        </div>

        <GlassCard className="p-10 text-center space-y-5">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Brain className="w-8 h-8 text-sky-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-heading font-bold text-[var(--exec-text)]">
              No Active Learning Path
            </h2>
            <p className="text-sm text-[var(--exec-text-muted)] max-w-md mx-auto font-sans leading-relaxed">
              Go to the Learning Coach, enter a goal with a timeframe (e.g. &quot;learn graph algorithms in 5 days&quot;),
              generate your personalized roadmap, then click{' '}
              <strong className="text-sky-600 dark:text-sky-400">Add to Learning Path</strong>.
            </p>
          </div>
          <Link href="/learning-coach">
            <Button variant="primary" size="md" className="gap-2">
              <Brain className="w-4 h-4" />
              Open Learning Coach
            </Button>
          </Link>
        </GlassCard>
      </div>
    );
  }

  // ── Active path: compute stats ──
  const days = path.days ?? [];
  const completedDays = days.filter((d) => d.is_completed).length;
  const totalDays = path.total_days;
  const overallPct = totalDays > 0 ? Math.round((completedDays / totalDays) * 100) : 0;

  // Current day based on start_date
  const startDate = new Date(path.start_date);
  startDate.setHours(0, 0, 0, 0);
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const elapsedDays = Math.floor((todayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const currentDayNumber = Math.max(1, Math.min(elapsedDays + 1, totalDays));

  const currentDay = days.find((d) => d.day_number === currentDayNumber);
  const startDateFormatted = new Date(path.start_date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="space-y-6 animate-page-entrance">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20">
            <BookMarked className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <h1 className="text-xl font-heading font-bold text-[var(--exec-text)]">
              My Learning Path
            </h1>
            <p className="text-xs text-[var(--exec-text-muted)] font-sans line-clamp-1">
              {path.goal}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link href="/learning-coach">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Brain className="w-3.5 h-3.5" />
              New Roadmap
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Overall Progress */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
              Overall
            </span>
            <TrendingUp className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--exec-text)]">{overallPct}%</div>
          <div className="mt-1.5 h-1.5 bg-[var(--exec-surface-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </GlassCard>

        {/* Current Day */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
              Today
            </span>
            <Calendar className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--exec-text)]">
            Day {currentDayNumber}
          </div>
          <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-0.5">
            of {totalDays} total
          </p>
        </GlassCard>

        {/* Completed Days */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
              Completed
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-mono font-bold text-[var(--exec-text)]">
            {completedDays}
          </div>
          <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-0.5">
            {totalDays - completedDays} remaining
          </p>
        </GlassCard>

        {/* Started */}
        <GlassCard className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
              Started
            </span>
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm font-mono font-bold text-[var(--exec-text)]">
            {startDateFormatted}
          </div>
          <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-0.5">
            {overallPct === 100 ? '🎉 Complete!' : 'In progress'}
          </p>
        </GlassCard>
      </div>

      {/* Goal Banner */}
      <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 flex items-start gap-3">
        <Target className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400 block mb-0.5">
            Learning Goal
          </span>
          <p className="text-sm font-heading font-semibold text-[var(--exec-text)]">{path.goal}</p>
        </div>
      </div>

      {/* Day Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--exec-text)] flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-sky-500" />
            Day-by-Day Roadmap
          </h2>
          <span className="text-[10px] font-mono text-[var(--exec-text-muted)]">
            {completedDays}/{totalDays} days done
          </span>
        </div>

        {days.map((day) => (
          <DayProgressCard
            key={day.id}
            day={day}
            currentDayNumber={currentDayNumber}
            defaultExpanded={day.day_number === currentDayNumber}
          />
        ))}

        {days.length === 0 && (
          <div className="p-8 rounded-2xl bg-[var(--exec-surface-secondary)] border border-dashed border-[var(--exec-border)] text-center">
            <p className="text-xs text-[var(--exec-text-muted)] font-sans">No days found in this learning path.</p>
          </div>
        )}
      </div>

      {/* Completion celebration */}
      {overallPct === 100 && (
        <div className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
          <p className="text-lg">🎉</p>
          <h3 className="text-sm font-heading font-bold text-emerald-700 dark:text-emerald-300">
            Learning Path Complete!
          </h3>
          <p className="text-xs text-[var(--exec-text-muted)] font-sans">
            You have completed all {totalDays} days. Head to Learning Coach for your next goal.
          </p>
          <Link href="/learning-coach">
            <Button variant="primary" size="sm" className="gap-2 mt-2">
              <Brain className="w-3.5 h-3.5" />
              Start New Journey
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
