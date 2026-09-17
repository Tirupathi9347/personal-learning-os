'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Compass,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ShieldAlert,
  SlidersHorizontal,
  X,
  Clock,
  RotateCcw,
  Check,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  getAutopilotEvaluation,
  applyAutopilotAdjustment,
  dismissAutopilotAlert,
} from '@/app/actions/autopilot-actions';
import {
  AutopilotEvaluationResult,
  AutopilotSituation,
} from '@/lib/agent/autopilot-types';

const DISMISSED_STORAGE_KEY = 'plos_autopilot_dismissed_fps';

export function LearningAutopilotCard() {
  const [evaluation, setEvaluation] = useState<AutopilotEvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load dismissed fingerprints from localStorage
  const getDismissedFps = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(DISMISSED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  };

  const addDismissedFp = (fp: string) => {
    try {
      const current = getDismissedFps();
      if (!current.includes(fp)) {
        const updated = [...current, fp];
        localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch {
      // ignore
    }
  };

  const fetchEvaluation = React.useCallback(() => {
    setIsLoading(true);
    const dismissed = getDismissedFps();
    getAutopilotEvaluation(dismissed)
      .then((res) => {
        if (res.success && res.data) {
          setEvaluation(res.data);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchEvaluation();
  }, [fetchEvaluation]);

  const handleDismiss = (fp: string) => {
    addDismissedFp(fp);
    dismissAutopilotAlert(fp);
    setIsReviewOpen(false);
    fetchEvaluation();
  };

  const handleApplyAdjustment = (situation: AutopilotSituation) => {
    if (!situation.actionProposal) return;

    startTransition(async () => {
      const res = await applyAutopilotAdjustment(situation.actionProposal!, situation.fingerprint);
      if (res.success) {
        setActionSuccessMessage(res.message);
        addDismissedFp(situation.fingerprint);
        dismissAutopilotAlert(situation.fingerprint);
        setTimeout(() => {
          setIsReviewOpen(false);
          setActionSuccessMessage(null);
          fetchEvaluation();
        }, 2200);
      }
    });
  };

  if (isLoading) {
    return (
      <GlassCard className="p-4 border border-[var(--exec-border)] bg-[var(--exec-surface)] animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--exec-surface-secondary)]" />
          <div className="space-y-1.5 flex-1">
            <div className="h-3 w-32 bg-[var(--exec-surface-secondary)] rounded" />
            <div className="h-2.5 w-64 bg-[var(--exec-surface-secondary)] rounded" />
          </div>
        </div>
      </GlassCard>
    );
  }

  const situation = evaluation?.situation;

  // -------------------------------------------------------------------------
  // On-Track Empty State (Clean, non-intrusive)
  // -------------------------------------------------------------------------
  if (!situation || !evaluation?.hasSituation) {
    return (
      <GlassCard className="p-4 border border-[var(--exec-border)] bg-[var(--exec-surface)] relative overflow-hidden transition-all duration-200">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
                  Learning Autopilot
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Optimal Pace
                </span>
              </div>
              <p className="text-xs text-[var(--exec-text)] mt-0.5">
                {evaluation?.onTrackSummary || "You're on track. Nothing needs your attention right now."}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono text-[var(--exec-text-muted)]">
            <span>Monitoring 3 Triggers</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>
      </GlassCard>
    );
  }

  // -------------------------------------------------------------------------
  // Active Alert State (Prominent, intelligent, actionable)
  // -------------------------------------------------------------------------
  const triggerLabels: Record<string, { label: string; badge: 'amber' | 'indigo' | 'emerald' }> = {
    LEARNING_PATH_BEHIND_SCHEDULE: { label: 'Behind Schedule', badge: 'amber' },
    WORKLOAD_CONFLICT: { label: 'Workload Conflict', badge: 'indigo' },
    RECURRING_LEARNING_MISTAKES: { label: 'Recurring Mistake', badge: 'amber' },
  };

  const triggerMeta = triggerLabels[situation.triggerType] || { label: 'Autopilot Alert', badge: 'amber' };

  return (
    <GlassCard className="p-5 border-l-4 border-l-amber-500 border-y border-r border-[var(--exec-border)] bg-[var(--exec-surface)] relative overflow-hidden shadow-xs">
      <div className="space-y-3.5">
        {/* Header bar */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
              <Compass className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  Learning Autopilot
                </span>
                <Badge variant={triggerMeta.badge} className="text-[10px]">
                  {triggerMeta.label}
                </Badge>
                <span className="text-[10px] font-mono text-[var(--exec-text-muted)] hidden sm:inline">
                  Phase 6C Decision Engine
                </span>
              </div>
              <h3 className="text-sm font-semibold text-[var(--exec-text)] mt-0.5">
                I noticed something that needs your attention.
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDismiss(situation.fingerprint)}
              className="text-xs text-[var(--exec-text-muted)] hover:text-[var(--exec-text)]"
            >
              Dismiss
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsReviewOpen(true)}
              className="bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-medium"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 mr-1" />
              <span>Review Adjustment</span>
            </Button>
          </div>
        </div>

        {/* 2-Column Summary Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {/* Detected Issue & Why */}
          <div className="p-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--exec-text)]">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
              <span>Detected: {situation.title}</span>
            </div>
            <p className="text-xs text-[var(--exec-text-muted)] font-mono leading-relaxed">
              <span className="font-semibold text-[var(--exec-text)]">Why: </span>
              {situation.whyDetected}
            </p>
          </div>

          {/* Recommended Action & Expected Benefit */}
          <div className="p-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--exec-text)]">
              <Sparkles className="w-3.5 h-3.5 text-sky-500" />
              <span>Recommended Action</span>
            </div>
            <p className="text-xs text-[var(--exec-text)] leading-relaxed">
              {situation.recommendedAction}
            </p>
            <p className="text-[11px] text-[var(--exec-text-muted)] font-mono">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Benefit: </span>
              {situation.expectedBenefit}
            </p>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------- */}
      {/* Phase 5 Human Approval Review Modal / Confirmation Gate */}
      {/* ------------------------------------------------------------------- */}
      {isReviewOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-[var(--exec-border)] pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-[var(--exec-text)]">
                  Review Autopilot Recommendation
                </h3>
              </div>
              <button
                onClick={() => setIsReviewOpen(false)}
                className="text-[var(--exec-text-muted)] hover:text-[var(--exec-text)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {actionSuccessMessage ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
                <Check className="w-5 h-5 shrink-0" />
                <p className="text-xs font-mono">{actionSuccessMessage}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Evidence Basis */}
                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
                    Evidence Telemetry
                  </span>
                  <div className="p-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-lg space-y-1">
                    {situation.evidenceBasis.map((ev, i) => (
                      <div key={i} className="text-xs font-mono text-[var(--exec-text)] flex items-start gap-1.5">
                        <span className="text-sky-500">•</span>
                        <span>{ev}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Proposed Modification (What will change) */}
                <div className="space-y-1.5">
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)]">
                    What will change (Phase 5 Safety Gate)
                  </span>
                  <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--exec-text)]">
                        {situation.actionProposal?.title || situation.recommendedAction}
                      </span>
                      <Badge variant="amber" className="text-[10px]">
                        Human Confirmation Required
                      </Badge>
                    </div>
                    <p className="text-xs text-[var(--exec-text-muted)]">
                      {situation.actionProposal?.description || situation.recommendedAction}
                    </p>
                    <p className="text-[11px] font-mono text-[var(--exec-text-muted)]">
                      Decision Authority: 6C ({situation.decisionType}) // Zero autonomous writes
                    </p>
                  </div>
                </div>

                {/* Action Controls */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() => handleDismiss(situation.fingerprint)}
                    disabled={isPending}
                  >
                    Dismiss Alert
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => handleApplyAdjustment(situation)}
                    disabled={isPending}
                    className="bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-semibold"
                  >
                    {isPending ? 'Applying...' : 'Approve & Apply Adjustment'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </GlassCard>
  );
}
