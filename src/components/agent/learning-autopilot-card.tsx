'use client';

import React, { useState, useEffect, useTransition } from 'react';
import {
  Compass,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  ShieldCheck,
  SlidersHorizontal,
  X,
  Clock,
  RotateCcw,
  Activity,
  ChevronDown,
  ChevronUp,
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

function getBeforeAfterText(situation: AutopilotSituation) {
  switch (situation.triggerType) {
    case 'LEARNING_PATH_BEHIND_SCHEDULE':
      return {
        beforeTitle: 'Current Plan is Delayed',
        beforeDesc: situation.detectedIssue || 'Behind target milestones on your active roadmap.',
        afterTitle: 'Target Catch-Up Allocation',
        afterDesc: situation.actionProposal?.description || 'Catch-up review activity scheduled to realign with your milestone goal.',
      };
    case 'WORKLOAD_CONFLICT':
      return {
        beforeTitle: 'Overloaded Daily Schedule',
        beforeDesc: situation.detectedIssue || "Today's queue exceeds estimated cognitive limits.",
        afterTitle: 'Balanced Focused Session',
        afterDesc: situation.actionProposal?.description || 'Low-priority tasks deferred; core learning activities prioritized.',
      };
    case 'RECURRING_LEARNING_MISTAKES':
      return {
        beforeTitle: 'Unaddressed Mistake Patterns',
        beforeDesc: situation.detectedIssue || 'Persistent errors logged without active remediation practice.',
        afterTitle: 'Targeted Concept Remediation',
        afterDesc: situation.actionProposal?.description || 'Dedicated practice task created to reinforce the underlying concept.',
      };
    default:
      return {
        beforeTitle: 'Current State',
        beforeDesc: situation.detectedIssue || situation.whyDetected,
        afterTitle: 'Recommended Adjustment',
        afterDesc: situation.actionProposal?.description || situation.recommendedAction,
      };
  }
}

export function LearningAutopilotCard() {
  const [evaluation, setEvaluation] = useState<AutopilotEvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
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

  // Prevent background scrolling and handle Escape key when modal is open
  useEffect(() => {
    if (!isReviewOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        setIsReviewOpen(false);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isReviewOpen, isPending]);

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
        }, 2000);
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
  const beforeAfter = getBeforeAfterText(situation);
  const displayedEvidence = showAllEvidence ? situation.evidenceBasis : situation.evidenceBasis.slice(0, 3);

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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="autopilot-modal-title"
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-hidden animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setIsReviewOpen(false);
            }
          }}
        >
          <div className="bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-2xl max-w-2xl w-full max-h-[88vh] flex flex-col shadow-2xl relative overflow-hidden animate-scaleIn">
            
            {/* 1. STICKY HEADER */}
            <div className="sticky top-0 z-20 bg-[var(--exec-surface)]/95 backdrop-blur-md px-5 sm:px-6 py-4 border-b border-[var(--exec-border)] flex items-start justify-between shrink-0">
              <div className="space-y-0.5 pr-4">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
                    <SlidersHorizontal className="w-4 h-4" />
                  </span>
                  <h2 id="autopilot-modal-title" className="text-sm sm:text-base font-heading font-bold text-[var(--exec-text)]">
                    Review Adjustment
                  </h2>
                  <Badge variant={triggerMeta.badge} className="text-[10px]">
                    {triggerMeta.label}
                  </Badge>
                </div>
                <p className="text-xs text-[var(--exec-text-muted)] font-sans">
                  Autopilot suggested a learning pace adjustment based on your recent activity.
                </p>
              </div>

              <button
                type="button"
                onClick={() => !isPending && setIsReviewOpen(false)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-[var(--exec-text-muted)] hover:text-[var(--exec-text)] hover:bg-[var(--exec-surface-secondary)] transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 2. SCROLLABLE BODY */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 text-xs text-[var(--exec-text)] overscroll-contain">
              {actionSuccessMessage ? (
                <div className="p-5 bg-emerald-500/10 border border-emerald-500/25 rounded-2xl flex items-center gap-3.5 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div className="space-y-0.5">
                    <p className="font-heading font-bold text-sm">Adjustment Approved & Applied</p>
                    <p className="text-xs font-mono text-emerald-600 dark:text-emerald-400">{actionSuccessMessage}</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* SECTION 1 — WHAT I DETECTED */}
                  <div className="p-4 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-heading font-bold text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                        <span>Section 1 — What I Detected</span>
                      </div>
                      <Badge variant={situation.priority === 'URGENT' ? 'amber' : 'slate'} className="text-[10px]">
                        Priority: {situation.priority}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-[var(--exec-text)] text-xs sm:text-sm">
                        {situation.title}
                      </p>
                      <p className="text-xs text-[var(--exec-text-muted)] leading-relaxed">
                        {situation.whyDetected}
                      </p>
                    </div>
                  </div>

                  {/* SECTION 2 — WHY (EVIDENCE TELEMETRY) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)] flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-sky-500" />
                        Section 2 — Why (Evidence Telemetry)
                      </span>
                      <span className="text-[10px] font-mono text-[var(--exec-text-muted)]">
                        {situation.evidenceBasis.length} signal{situation.evidenceBasis.length === 1 ? '' : 's'} verified
                      </span>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] space-y-2">
                      {displayedEvidence.map((ev, i) => (
                        <div key={i} className="text-xs font-mono text-[var(--exec-text)] flex items-start gap-2 leading-relaxed">
                          <span className="text-sky-500 font-bold shrink-0 mt-0.5">•</span>
                          <span>{ev}</span>
                        </div>
                      ))}

                      {situation.evidenceBasis.length > 3 && (
                        <button
                          type="button"
                          onClick={() => setShowAllEvidence(!showAllEvidence)}
                          className="text-[11px] font-mono text-sky-600 dark:text-sky-400 hover:underline pt-1 flex items-center gap-1 cursor-pointer"
                        >
                          {showAllEvidence ? (
                            <>Show fewer evidence signals <ChevronUp className="w-3 h-3" /></>
                          ) : (
                            <>View {situation.evidenceBasis.length - 3} more evidence signal(s) <ChevronDown className="w-3 h-3" /></>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SECTION 3 — WHAT I RECOMMEND */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)] flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                      Section 3 — What I Recommend
                    </span>
                    <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/25 space-y-3">
                      <div className="space-y-1">
                        <p className="font-semibold text-xs sm:text-sm text-[var(--exec-text)]">
                          {situation.actionProposal?.title || situation.recommendedAction}
                        </p>
                        <p className="text-xs text-[var(--exec-text-muted)] leading-relaxed">
                          {situation.actionProposal?.description || situation.recommendedAction}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-sky-500/15">
                        <div className="flex items-center gap-2 text-[11px]">
                          <Clock className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                          <span className="text-[var(--exec-text-muted)]">Est. Effort:</span>
                          <span className="font-mono font-semibold text-[var(--exec-text)]">
                            ~ {situation.actionProposal?.estimatedMinutes || 30} mins
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-[var(--exec-text-muted)]">Benefit:</span>
                          <span className="font-medium text-emerald-600 dark:text-emerald-400 truncate">
                            {situation.expectedBenefit}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 4 — WHAT WILL HAPPEN (Before -> After) */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-muted)] flex items-center gap-1.5">
                      <ArrowRight className="w-3.5 h-3.5 text-amber-500" />
                      Section 4 — What Will Happen
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* BEFORE */}
                      <div className="p-3.5 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          Before Adjustment
                        </div>
                        <p className="font-semibold text-xs text-[var(--exec-text)]">
                          {beforeAfter.beforeTitle}
                        </p>
                        <p className="text-[11px] text-[var(--exec-text-muted)] leading-relaxed">
                          {beforeAfter.beforeDesc}
                        </p>
                      </div>

                      {/* AFTER */}
                      <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          After Approval
                        </div>
                        <p className="font-semibold text-xs text-[var(--exec-text)]">
                          {beforeAfter.afterTitle}
                        </p>
                        <p className="text-[11px] text-[var(--exec-text-muted)] leading-relaxed">
                          {beforeAfter.afterDesc}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* SECTION 5 — HUMAN APPROVAL REQUIRED (Phase 5 Gate) */}
                  <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="text-[11px] font-heading font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                        HUMAN APPROVAL REQUIRED
                      </p>
                      <p className="text-[11px] text-amber-900/80 dark:text-amber-200/80 leading-relaxed font-sans">
                        This adjustment will only execute once you approve it below. No automated writes or rescheduling will take place without your consent.
                      </p>
                    </div>
                  </div>

                  {/* SECTION 6 — COLLAPSED TECHNICAL DETAILS */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                      className="w-full py-2 px-3 rounded-lg border border-[var(--exec-border)] bg-[var(--exec-surface-secondary)] text-[11px] font-mono text-[var(--exec-text-muted)] hover:text-[var(--exec-text)] flex items-center justify-between transition-colors cursor-pointer"
                    >
                      <span>View Technical Details</span>
                      {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {showTechnicalDetails && (
                      <div className="mt-2 p-3.5 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] font-mono text-[11px] space-y-1.5 text-[var(--exec-text-muted)]">
                        <div><span className="text-[var(--exec-text)] font-semibold">Decision Engine:</span> Phase 6C ({situation.decisionType})</div>
                        <div><span className="text-[var(--exec-text)] font-semibold">Action Type:</span> {situation.actionProposal?.actionType || 'RECOMMENDATION_ONLY'}</div>
                        <div><span className="text-[var(--exec-text)] font-semibold">Safety Gate:</span> Phase 5 Confirmed Action</div>
                        <div className="truncate"><span className="text-[var(--exec-text)] font-semibold">Fingerprint:</span> {situation.fingerprint}</div>
                        <div><span className="text-[var(--exec-text)] font-semibold">Detected At:</span> {new Date(situation.detectedAt).toLocaleString()}</div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* 3. STICKY FOOTER */}
            <div className="sticky bottom-0 z-20 bg-[var(--exec-surface)]/95 backdrop-blur-md px-5 sm:px-6 py-4 border-t border-[var(--exec-border)] flex items-center justify-between gap-3 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => !isPending && setIsReviewOpen(false)}
                disabled={isPending || !!actionSuccessMessage}
                className="text-xs font-sans px-4 cursor-pointer"
              >
                Not Now
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDismiss(situation.fingerprint)}
                  disabled={isPending || !!actionSuccessMessage}
                  className="text-xs text-[var(--exec-text-muted)] hover:text-[var(--exec-text)] hidden sm:inline-flex cursor-pointer"
                >
                  Dismiss Alert
                </Button>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApplyAdjustment(situation)}
                  disabled={isPending || !!actionSuccessMessage}
                  className="bg-amber-600 hover:bg-amber-500 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-slate-950 font-semibold px-4 shadow-sm cursor-pointer"
                >
                  {isPending ? (
                    <span className="flex items-center gap-1.5">
                      <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      Applying...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Approve Adjustment
                    </span>
                  )}
                </Button>
              </div>
            </div>

          </div>
        </div>
      )}
    </GlassCard>
  );
}

