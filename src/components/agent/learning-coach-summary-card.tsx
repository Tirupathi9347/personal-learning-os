'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Brain, ArrowRight, Sparkles, CheckCircle2, Clock, ListChecks } from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { resumeStudentLearningJourney, OrchestratorRunResult } from '@/app/actions/agent-actions';

const STORAGE_KEY = 'plos_active_learning_coach_run';

export function LearningCoachSummaryCard() {
  const [activeRun, setActiveRun] = useState<OrchestratorRunResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // 1. Quick local cache check
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.runResult) {
          setActiveRun(parsed.runResult);
        }
      }
    } catch {
      // ignore
    }

    // 2. Authoritative server check
    resumeStudentLearningJourney()
      .then((res) => {
        if (res.success && res.context && res.context.learningPlan) {
          const ctx = res.context;
          setActiveRun({
            success: true,
            runId: ctx.runId,
            status: ctx.pendingStepIds.length === 0 ? 'COMPLETED' : 'COMPLETED',
            goalUnderstanding: ctx.goalUnderstanding || undefined,
            studentAssessment: ctx.studentAssessment || undefined,
            learningDecision: ctx.previousDecision || undefined,
            learningPlan: ctx.learningPlan || undefined,
            adaptivePolicy: ctx.adaptivePolicy || undefined,
          });
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const steps = activeRun?.learningPlan?.steps || [];
  const completedCount = steps.filter((s) => s.status === 'COMPLETED').length;
  const totalCount = steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const nextStep = steps.find((s) => s.status !== 'COMPLETED');

  return (
    <GlassCard className="relative overflow-hidden border border-[var(--exec-border)] shadow-xs bg-[var(--exec-surface)] p-5 font-sans">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left Info */}
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
            <Brain className="w-5 h-5" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
                Personal Learning Coach
              </span>
              {activeRun?.learningPlan && (
                <Badge variant="emerald" className="text-[10px]">
                  Active Journey
                </Badge>
              )}
            </div>

            {activeRun?.learningPlan ? (
              <div>
                <h3 className="text-sm font-semibold text-[var(--exec-text)] line-clamp-1">
                  {activeRun.goalUnderstanding?.objective || activeRun.goalUnderstanding?.originalGoal || 'Active Curriculum'}
                </h3>
                {nextStep && (
                  <p className="text-xs text-[var(--exec-text-muted)] flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-[var(--exec-text)]">Next:</span>
                    <span className="line-clamp-1">{nextStep.title}</span>
                  </p>
                )}
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-[var(--exec-text)]">
                  Ready to achieve a new learning goal?
                </h3>
                <p className="text-xs text-[var(--exec-text-muted)]">
                  Create a tailored roadmap grounded in your GitHub, LeetCode, and skills history.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Action & Progress */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 shrink-0">
          {activeRun?.learningPlan && totalCount > 0 && (
            <div className="space-y-1 sm:text-right min-w-[140px]">
              <div className="flex sm:justify-end items-center gap-1.5 text-xs font-mono text-[var(--exec-text-muted)]">
                <span className="font-bold text-[var(--exec-text)]">{completedCount}/{totalCount}</span>
                <span>Milestones ({progressPercent}%)</span>
              </div>
              <div className="w-full bg-[var(--exec-surface-secondary)] rounded-full h-1.5 overflow-hidden border border-[var(--exec-border)]">
                <div 
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          <Link href="/learning-coach">
            <Button variant="primary" size="sm" className="gap-1.5 font-medium shadow-xs w-full sm:w-auto">
              <span>{activeRun?.learningPlan ? 'Resume Learning' : 'Open Learning Coach'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </GlassCard>
  );
}
