'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  FlaskConical,
  RefreshCw,
  CheckCircle2,
  Circle,
  Clock,
  ArrowRight,
  Compass,
  Sparkles,
  Milestone,
} from 'lucide-react';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LearningPathDay, LearningPathDayActivities } from '@/types';
import { toggleLearningPathActivity, TodayLearningSection } from '@/app/actions/learning-path-actions';

interface TodayLearningCardProps {
  todaySection: TodayLearningSection | null;
}

export function TodayLearningCard({ todaySection }: TodayLearningCardProps) {
  const [currentDay, setCurrentDay] = useState<LearningPathDay | null>(
    todaySection?.currentDay ?? null
  );
  const [activities, setActivities] = useState<LearningPathDayActivities>(
    todaySection?.currentDay?.activities_completed ?? { learn: false, practice: false, review: false }
  );
  const [isPending, startTransition] = useTransition();
  const [togglingActivity, setTogglingActivity] = useState<string | null>(null);

  if (!todaySection || !todaySection.pathId || !currentDay) {
    return (
      <GlassCard className="relative overflow-hidden border-dashed">
        <CardHeader>
          <CardTitle>
            <Milestone className="w-4 h-4 text-sky-500" />
            <span>Today&apos;s Learning Focus</span>
          </CardTitle>
          <Link
            href="/learning-coach"
            className="text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1"
          >
            Launch Coach <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>

        <div className="p-6 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-500 mx-auto flex items-center justify-center">
            <Compass className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-heading font-semibold text-[var(--exec-text)]">
              No Active Learning Path
            </h4>
            <p className="text-xs text-[var(--exec-text-muted)] max-w-md mx-auto font-sans">
              Generate a personalized day-by-day roadmap in the Learning Coach and save it to your persistent Learning Path.
            </p>
          </div>
          <Link href="/learning-coach">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs font-medium">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              Generate Learning Roadmap
            </Button>
          </Link>
        </div>
      </GlassCard>
    );
  }

  const doneCount = [activities.learn, activities.practice, activities.review].filter(Boolean).length;
  const dayProgressPct = Math.round((doneCount / 3) * 100);
  const isDayCompleted = doneCount === 3 || currentDay.is_completed;

  // Time remaining calculation
  const totalMins = currentDay.ai_estimated_minutes || 60;
  const minsPerActivity = totalMins / 3;
  const remainingMins = Math.max(0, Math.round((3 - doneCount) * minsPerActivity));

  const handleToggle = (activity: 'learn' | 'practice' | 'review') => {
    setTogglingActivity(activity);
    const targetState = !activities[activity];

    startTransition(async () => {
      const result = await toggleLearningPathActivity(currentDay.id, activity, targetState);
      if (result.success && result.updatedDay) {
        setCurrentDay(result.updatedDay);
        setActivities(result.updatedDay.activities_completed ?? { ...activities, [activity]: targetState });
      }
      setTogglingActivity(null);
    });
  };

  return (
    <GlassCard className="space-y-4 relative overflow-hidden">
      {/* Header */}
      <CardHeader>
        <CardTitle>
          <Milestone className="w-4 h-4 text-sky-500" />
          <span>Today&apos;s Learning Focus</span>
        </CardTitle>
        <Link
          href="/learning-path"
          className="text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 font-medium"
        >
          View Full Path <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>

      {/* Hero / Day Title */}
      <div className="p-4 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-mono font-bold">
              Day {todaySection.currentDayNumber} of {todaySection.totalDays}
            </span>
            <h3 className="text-sm font-heading font-bold text-[var(--exec-text)] leading-tight">
              {currentDay.topic}
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={currentDay.priority === 'URGENT' ? 'crimson' : currentDay.priority === 'HIGH' ? 'amber' : 'cyan'}>
              {currentDay.priority} Priority
            </Badge>
            {isDayCompleted ? (
              <span className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Day Done
              </span>
            ) : (
              <span className="text-[11px] font-mono text-[var(--exec-text-muted)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {remainingMins > 0 ? `~${remainingMins}m left` : 'Completed'}
              </span>
            )}
          </div>
        </div>

        {/* Goal context */}
        <p className="text-[11px] text-[var(--exec-text-muted)] truncate">
          <span className="font-semibold text-[var(--exec-text)]">Goal:</span> {todaySection.goal}
        </p>

        {/* Day Progress bar */}
        <div className="space-y-1 pt-1">
          <div className="flex items-center justify-between text-[10px] font-mono text-[var(--exec-text-muted)]">
            <span>Daily Progress ({doneCount} / 3 activities)</span>
            <span className="font-bold text-[var(--exec-text)]">{dayProgressPct}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--exec-surface)] border border-[var(--exec-border)] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isDayCompleted ? 'bg-emerald-500' : 'bg-sky-500'
              }`}
              style={{ width: `${dayProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Interactive Activities Checklist */}
      <div className="space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-wider text-[var(--exec-text-muted)] font-bold">
          Today&apos;s Checklist (Direct Check-off)
        </p>

        {/* 1. Learn */}
        <button
          type="button"
          onClick={() => handleToggle('learn')}
          disabled={isPending && togglingActivity === 'learn'}
          className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
            activities.learn
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] hover:border-sky-500/30'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {activities.learn ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Circle className="w-4 h-4 text-[var(--exec-text-muted)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Learn
              </span>
              <BookOpen className="w-3 h-3 text-indigo-500" />
            </div>
            <p className={`text-xs leading-relaxed ${activities.learn ? 'line-through text-[var(--exec-text-muted)]' : 'text-[var(--exec-text)]'}`}>
              {currentDay.learn_content}
            </p>
          </div>
        </button>

        {/* 2. Practice */}
        <button
          type="button"
          onClick={() => handleToggle('practice')}
          disabled={isPending && togglingActivity === 'practice'}
          className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
            activities.practice
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] hover:border-sky-500/30'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {activities.practice ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Circle className="w-4 h-4 text-[var(--exec-text-muted)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Practice
              </span>
              <FlaskConical className="w-3 h-3 text-sky-500" />
            </div>
            <p className={`text-xs font-medium ${activities.practice ? 'line-through text-[var(--exec-text-muted)]' : 'text-[var(--exec-text)]'}`}>
              Complete {currentDay.practice_problems} targeted problem{currentDay.practice_problems !== 1 ? 's' : ''}
            </p>
          </div>
        </button>

        {/* 3. Review */}
        <button
          type="button"
          onClick={() => handleToggle('review')}
          disabled={isPending && togglingActivity === 'review'}
          className={`w-full p-3 rounded-xl border text-left flex items-start gap-3 transition-all ${
            activities.review
              ? 'bg-emerald-500/5 border-emerald-500/30'
              : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] hover:border-sky-500/30'
          }`}
        >
          <div className="mt-0.5 shrink-0">
            {activities.review ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            ) : (
              <Circle className="w-4 h-4 text-[var(--exec-text-muted)]" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Review
              </span>
              <RefreshCw className="w-3 h-3 text-emerald-500" />
            </div>
            <p className={`text-xs leading-relaxed ${activities.review ? 'line-through text-[var(--exec-text-muted)]' : 'text-[var(--exec-text)]'}`}>
              {currentDay.review_activity}
            </p>
          </div>
        </button>
      </div>

      {/* Footer / Overall path status */}
      <div className="pt-2 border-t border-[var(--exec-border)] flex items-center justify-between text-[11px] font-mono text-[var(--exec-text-muted)]">
        <span>Overall Roadmap Progress:</span>
        <span className="font-bold text-sky-600 dark:text-sky-400">
          {todaySection.completedDaysCount} / {todaySection.totalDays} Days ({todaySection.overallProgress}%)
        </span>
      </div>
    </GlassCard>
  );
}
