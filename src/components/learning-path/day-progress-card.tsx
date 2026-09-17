'use client';

import React, { useState, useTransition } from 'react';
import {
  BookOpen,
  FlaskConical,
  RefreshCw,
  CheckCircle2,
  Circle,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LearningPathDay, LearningPathDayActivities } from '@/types';
import { toggleLearningPathActivity } from '@/app/actions/learning-path-actions';

// ============================================================================
// Helpers
// ============================================================================

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  MEDIUM: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30',
  HIGH: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  URGENT: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30',
};

function activityCount(acts: LearningPathDayActivities): { done: number; total: number } {
  const done = [acts.learn, acts.practice, acts.review].filter(Boolean).length;
  return { done, total: 3 };
}

// ============================================================================
// Main Component
// ============================================================================

interface DayProgressCardProps {
  day: LearningPathDay;
  currentDayNumber: number;
  defaultExpanded?: boolean;
}

export function DayProgressCard({ day, currentDayNumber, defaultExpanded = false }: DayProgressCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activities, setActivities] = useState<LearningPathDayActivities>(
    day.activities_completed ?? { learn: false, practice: false, review: false }
  );
  const [isPending, startTransition] = useTransition();
  const [togglingActivity, setTogglingActivity] = useState<string | null>(null);

  const { done, total } = activityCount(activities);
  const progressPct = Math.round((done / total) * 100);

  const isCompleted = day.is_completed || (activities.learn && activities.practice && activities.review);
  const isToday = day.day_number === currentDayNumber;
  const isFuture = day.day_number > currentDayNumber;

  const handleToggleActivity = (activity: 'learn' | 'practice' | 'review') => {
    setTogglingActivity(activity);
    const targetState = !activities[activity];

    // Optimistic local state update
    setActivities((prev) => ({ ...prev, [activity]: targetState }));

    startTransition(async () => {
      const result = await toggleLearningPathActivity(day.id, activity, targetState);
      if (result.success && result.updatedDay) {
        setActivities(result.updatedDay.activities_completed ?? { ...activities, [activity]: targetState });
      }
      setTogglingActivity(null);
    });
  };

  return (
    <div
      className={`rounded-2xl border overflow-hidden transition-all ${
        isCompleted
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : isToday
          ? 'border-sky-500/40 bg-[var(--exec-surface)] shadow-sm ring-1 ring-sky-500/10'
          : isFuture
          ? 'border-[var(--exec-border)] bg-[var(--exec-surface)] opacity-70'
          : 'border-[var(--exec-border)] bg-[var(--exec-surface)]'
      }`}
    >
      {/* Day Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left transition-colors hover:bg-[var(--exec-surface-secondary)]"
      >
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <span
            className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
              isCompleted
                ? 'bg-emerald-500 text-white'
                : isToday
                ? 'bg-sky-500 text-white'
                : 'bg-[var(--exec-surface-secondary)] text-[var(--exec-text-muted)] border border-[var(--exec-border)]'
            }`}
          >
            {isCompleted ? <CheckCircle2 className="w-4 h-4" /> : `D${day.day_number}`}
          </span>

          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-heading font-bold text-[var(--exec-text)]">
                Day {day.day_number} — {day.topic}
              </span>
              {isToday && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30">
                  → TODAY
                </span>
              )}
              {isCompleted && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  ✓ COMPLETED
                </span>
              )}
              {isFuture && !isToday && !isCompleted && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-slate-500/10 text-[var(--exec-text-muted)] border border-[var(--exec-border)]">
                  ○ UPCOMING
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono text-[var(--exec-text-muted)]">
              <span>{done} / {total} activities complete</span>
              <span>•</span>
              <span className={isCompleted ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}>
                {progressPct}%
              </span>
            </div>
          </div>
        </div>

        {/* Right side: Priority + Time + Expand toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`px-2 py-0.5 rounded-lg border text-[10px] font-mono font-bold uppercase ${
              PRIORITY_COLORS[day.priority] || PRIORITY_COLORS.MEDIUM
            }`}
          >
            {day.priority}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--exec-text-muted)]">
            <Clock className="w-3 h-3" />
            {day.ai_estimated_minutes}m
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-[var(--exec-text-muted)]" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[var(--exec-text-muted)]" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-[var(--exec-border)] pt-4">
          {/* Activity: Learn */}
          <ActivityRow
            icon={<BookOpen className="w-3.5 h-3.5 text-indigo-500" />}
            label="Learn"
            labelColor="text-indigo-600 dark:text-indigo-400"
            content={day.learn_content}
            isDone={!!activities.learn}
            isLoading={isPending && togglingActivity === 'learn'}
            onToggle={() => handleToggleActivity('learn')}
          />

          {/* Activity: Practice */}
          <ActivityRow
            icon={<FlaskConical className="w-3.5 h-3.5 text-sky-500" />}
            label="Practice"
            labelColor="text-sky-600 dark:text-sky-400"
            content={`${day.practice_problems} problem${day.practice_problems !== 1 ? 's' : ''}`}
            isDone={!!activities.practice}
            isLoading={isPending && togglingActivity === 'practice'}
            onToggle={() => handleToggleActivity('practice')}
          />

          {/* Activity: Review */}
          <ActivityRow
            icon={<RefreshCw className="w-3.5 h-3.5 text-emerald-500" />}
            label="Review"
            labelColor="text-emerald-600 dark:text-emerald-400"
            content={day.review_activity}
            isDone={!!activities.review}
            isLoading={isPending && togglingActivity === 'review'}
            onToggle={() => handleToggleActivity('review')}
          />

          {/* Evidence rationale */}
          {day.evidence_rationale && (
            <div className="flex items-start gap-2 pt-2 border-t border-[var(--exec-border)]">
              <Zap className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-[var(--exec-text-muted)] leading-relaxed italic">
                <span className="font-semibold not-italic text-amber-600 dark:text-amber-400">Why this time: </span>
                {day.evidence_rationale}
              </p>
            </div>
          )}

          {/* All done message */}
          {isCompleted && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Day {day.day_number} complete — great work!</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ActivityRow sub-component
// ============================================================================

interface ActivityRowProps {
  icon: React.ReactNode;
  label: string;
  labelColor: string;
  content: string;
  isDone: boolean;
  isLoading: boolean;
  onToggle: () => void;
}

function ActivityRow({
  icon, label, labelColor, content, isDone, isLoading, onToggle,
}: ActivityRowProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isLoading}
      className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
        isDone
          ? 'bg-emerald-500/8 border-emerald-500/30'
          : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] hover:border-sky-500/40 hover:bg-sky-500/5'
      }`}
    >
      {/* Checkbox / Done indicator */}
      <div className="shrink-0 mt-0.5">
        {isLoading ? (
          <RefreshCw className="w-4 h-4 text-sky-500 animate-spin" />
        ) : isDone ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
        ) : (
          <Circle className="w-4 h-4 text-[var(--exec-text-muted)]" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${labelColor}`}>
            {label}
          </span>
          {icon}
          {isDone && (
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
              ✓ Done
            </span>
          )}
        </div>
        <p className={`text-xs leading-relaxed ${isDone ? 'line-through text-[var(--exec-text-muted)]' : 'text-[var(--exec-text)]'}`}>
          {content}
        </p>
      </div>
    </button>
  );
}
