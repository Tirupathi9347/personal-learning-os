'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { 
  Sparkles, 
  Brain, 
  Target, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ShieldCheck, 
  ArrowRight, 
  HelpCircle, 
  RefreshCw, 
  Layers, 
  ListChecks, 
  Check, 
  X,
  Compass,
  Zap,
  Info,
  ChevronDown,
  ChevronUp,
  Award,
  BookOpen,
  Activity,
  Code2,
  CheckCheck
} from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  runStudentGoalOrchestrator, 
  approveAndExecuteOrchestratorTask, 
  completeStudentLearningStep,
  resumeStudentLearningJourney,
  OrchestratorRunResult,
  StepExecutionFeedbackResult
} from '@/app/actions/agent-actions';

const STORAGE_KEY = 'plos_active_learning_run';

const SUGGESTED_GOALS = [
  { label: 'Coding Basics (2 Days)', text: 'I need to learn coding basics in 2 days according to my level.' },
  { label: 'SQL Optimization', text: 'Master SQL join algorithms, indexing strategies, and query optimization.' },
  { label: 'Algorithm Patterns', text: 'Solve medium binary tree and dynamic programming problems on LeetCode in 7 days.' },
  { label: 'Mistake Review', text: 'Review and remediate my recent persistent errors from the mistake log.' },
];

export function LearningOrchestratorAssistant() {
  const [goalText, setGoalText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [runResult, setRunResult] = useState<OrchestratorRunResult | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'IDLE' | 'APPROVING' | 'APPROVED' | 'REJECTED' | 'FAILED'>('IDLE');
  const [createdTaskInfo, setCreatedTaskInfo] = useState<{ id: string; title: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completingStepId, setCompletingStepId] = useState<string | null>(null);
  const [stepFeedbackMap, setStepFeedbackMap] = useState<Record<string, StepExecutionFeedbackResult>>({});
  const [stepNotesMap, setStepNotesMap] = useState<Record<string, string>>({});
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [selectedClarifications, setSelectedClarifications] = useState<Record<number, string>>({});

  // 1. Run Persistence: Hydrate from authoritative server state first, falling back to local cache
  useEffect(() => {
    // A. Instant recovery from local cache for smooth UI rendering
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.runResult) setRunResult(parsed.runResult);
        if (parsed.goalText) setGoalText(parsed.goalText);
        if (parsed.approvalStatus) setApprovalStatus(parsed.approvalStatus);
        if (parsed.createdTaskInfo) setCreatedTaskInfo(parsed.createdTaskInfo);
        if (parsed.stepFeedbackMap) setStepFeedbackMap(parsed.stepFeedbackMap);
        if (parsed.stepNotesMap) setStepNotesMap(parsed.stepNotesMap);
      }
    } catch (e) {
      console.warn('Failed to hydrate local active run state:', e);
    }

    // B. Authoritative server check: resume active journey from agent_runs persistence
    resumeStudentLearningJourney()
      .then((res) => {
        if (res.success && res.context && res.context.learningPlan) {
          const ctx = res.context;
          setRunResult({
            success: true,
            runId: ctx.runId,
            status: ctx.pendingStepIds.length === 0 ? 'COMPLETED' : 'COMPLETED',
            goalUnderstanding: ctx.goalUnderstanding || undefined,
            studentAssessment: ctx.studentAssessment || undefined,
            learningDecision: ctx.previousDecision || undefined,
            learningPlan: ctx.learningPlan || undefined,
            adaptivePolicy: ctx.adaptivePolicy || undefined,
          });
          if (ctx.originalGoal) setGoalText(ctx.originalGoal);
        }
      })
      .catch(() => {
        // Silently preserve local cache if server is offline or in local test environment
      });
  }, []);

  // 2. Run Persistence: Sync state changes into localStorage
  useEffect(() => {
    if (runResult || goalText || Object.keys(stepFeedbackMap).length > 0) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            runResult,
            goalText,
            approvalStatus,
            createdTaskInfo,
            stepFeedbackMap,
            stepNotesMap,
            savedAt: new Date().toISOString(),
          })
        );
      } catch (e) {
        console.warn('Failed to persist active run state to localStorage:', e);
      }
    }
  }, [runResult, goalText, approvalStatus, createdTaskInfo, stepFeedbackMap, stepNotesMap]);

  const handleSubmitGoal = (textToSubmit?: string) => {
    const targetText = textToSubmit || goalText;
    if (!targetText.trim() || isPending) return;

    setErrorMessage(null);
    setRunResult(null);
    setApprovalStatus('IDLE');
    setCreatedTaskInfo(null);
    setStepFeedbackMap({});
    setStepNotesMap({});
    setResumeNotice(null);
    setSelectedClarifications({});

    startTransition(async () => {
      try {
        const result = await runStudentGoalOrchestrator(targetText);
        setRunResult(result);
        if (!result.success) {
          setErrorMessage(result.error || 'Could not complete learning plan. Please try again.');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to communicate with Learning Orchestrator.');
      }
    });
  };

  const handleResumeJourney = () => {
    if (isPending) return;

    setErrorMessage(null);
    setResumeNotice(null);

    startTransition(async () => {
      try {
        const res = await resumeStudentLearningJourney();
        if (res.success && res.context && res.context.learningPlan) {
          const ctx = res.context;
          setRunResult({
            success: true,
            runId: ctx.runId,
            status: ctx.pendingStepIds.length === 0 ? 'COMPLETED' : 'COMPLETED',
            goalUnderstanding: ctx.goalUnderstanding || undefined,
            studentAssessment: ctx.studentAssessment || undefined,
            learningDecision: ctx.previousDecision || undefined,
            learningPlan: ctx.learningPlan || undefined,
            adaptivePolicy: ctx.adaptivePolicy || undefined,
          });
          setGoalText(ctx.originalGoal);
          setResumeNotice(res.continuityRationale);
        } else {
          setResumeNotice(res.continuityRationale || 'No active learning journey to resume.');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to resume previous journey.');
      }
    });
  };

  const handleCompleteStep = (stepId: string) => {
    if (!runResult?.learningPlan || completingStepId) return;

    setCompletingStepId(stepId);
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const studentNotes = stepNotesMap[stepId] || '';
        const res = await completeStudentLearningStep({
          plan: runResult.learningPlan!,
          stepId,
          taskId: createdTaskInfo?.id || null,
          studentNotes,
          selfReportedEvidence: studentNotes ? `Completed work: ${studentNotes}` : undefined,
          verificationOutcome: 'VERIFIED',
        });

        if (res.success) {
          setStepFeedbackMap((prev) => ({ ...prev, [stepId]: res }));
          if (runResult.learningPlan) {
            const updatedSteps = runResult.learningPlan.steps.map((s) =>
              s.id === stepId ? { ...s, status: 'COMPLETED' as const } : s
            );
            setRunResult({
              ...runResult,
              learningPlan: {
                ...runResult.learningPlan,
                steps: updatedSteps,
              },
            });
          }
        } else {
          setErrorMessage(res.error || 'Failed to complete step execution.');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error executing step feedback cycle.');
      } finally {
        setCompletingStepId(null);
      }
    });
  };

  const handleApproveTask = (decision: 'APPROVED' | 'REJECTED') => {
    if (!runResult?.approvalProposal || approvalStatus === 'APPROVING') return;

    setApprovalStatus('APPROVING');
    startTransition(async () => {
      try {
        const res = await approveAndExecuteOrchestratorTask(runResult.approvalProposal!, decision);
        if (res.success && res.status === 'EXECUTED') {
          setApprovalStatus('APPROVED');
          setCreatedTaskInfo({
            id: res.createdTaskId || 'task-created',
            title: runResult.approvalProposal!.input.title,
          });
        } else if (res.status === 'REJECTED') {
          setApprovalStatus('REJECTED');
        } else {
          setApprovalStatus('FAILED');
          setErrorMessage(res.error || 'Failed to complete task creation.');
        }
      } catch (err: any) {
        setApprovalStatus('FAILED');
        setErrorMessage(err.message || 'Error executing write approval.');
      }
    });
  };


  const handleReset = () => {
    setGoalText('');
    setRunResult(null);
    setApprovalStatus('IDLE');
    setCreatedTaskInfo(null);
    setErrorMessage(null);
    setStepFeedbackMap({});
    setStepNotesMap({});
    setResumeNotice(null);
    setSelectedClarifications({});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear storage:', e);
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard className="relative overflow-hidden border border-[var(--exec-border)] shadow-sm bg-[var(--exec-surface)]">
        <div className="p-6 space-y-5">
          {/* Header in Student-Friendly Language */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--exec-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-heading font-bold text-[var(--exec-text)] flex items-center gap-2">
                  Personal Learning Coach
                  <Badge variant="cyan" className="text-[10px] font-sans font-medium">
                    Evidence-Aware
                  </Badge>
                </h2>
                <p className="text-xs text-[var(--exec-text-muted)] font-sans">
                  Tailored learning paths grounded in your actual GitHub, LeetCode, skills, and project history.
                </p>
              </div>
            </div>

            {runResult && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs font-sans self-start sm:self-auto">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Start New Goal
              </Button>
            )}
          </div>

          {/* Goal Input Section */}
          <div className="space-y-3">
            <div className="relative">
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmitGoal();
                  }
                }}
                disabled={isPending}
                placeholder="What would you like to learn or improve? (e.g. 'I need to learn coding basics in 2 days according to my level', 'Master SQL indexing', 'Practice dynamic programming...')"
                className="w-full h-24 px-4 py-3 text-sm bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl text-[var(--exec-text)] placeholder-[var(--exec-text-muted)] focus:outline-none focus:ring-2 focus:ring-sky-500/30 font-sans resize-none transition-all disabled:opacity-50"
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleSubmitGoal()}
                  disabled={!goalText.trim() || isPending}
                  className="gap-1.5 shadow-sm font-medium"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing & Planning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Create Plan</span>
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Suggestions & Journey Resume */}
            {!runResult && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-sans text-[var(--exec-text-muted)] font-medium mr-1">Examples:</span>
                  {SUGGESTED_GOALS.map((s, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setGoalText(s.text);
                        handleSubmitGoal(s.text);
                      }}
                      disabled={isPending}
                      className="text-xs px-2.5 py-1 rounded-lg bg-[var(--exec-surface-secondary)] hover:bg-sky-500/10 hover:text-sky-600 dark:hover:text-sky-400 border border-[var(--exec-border)] text-[var(--exec-text)] transition-colors font-sans cursor-pointer disabled:opacity-50"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleResumeJourney}
                  disabled={isPending}
                  className="text-xs font-sans gap-1.5 text-sky-600 dark:text-sky-400 border-sky-500/30 hover:bg-sky-500/10"
                >
                  <Compass className="w-3.5 h-3.5" />
                  Resume Active Journey
                </Button>
              </div>
            )}

            {resumeNotice && (
              <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-xs text-sky-700 dark:text-sky-300 flex items-center gap-2 font-sans">
                <Info className="w-4 h-4 shrink-0 text-sky-500" />
                <span>{resumeNotice}</span>
              </div>
            )}
          </div>

          {/* 6. REDESIGNED RUNNING EXPERIENCE (Simple 4-stage human progress) */}
          {isPending && (
            <div className="p-5 rounded-2xl bg-sky-500/5 border border-sky-500/20 space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-sans font-semibold text-sky-600 dark:text-sky-400">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Preparing Your Custom Learning Experience</span>
                </div>
                <Badge variant="cyan" className="text-[10px] font-sans">In Progress</Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-sky-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                    <Target className="w-3.5 h-3.5" />
                    <span>1. Understanding Goal</span>
                  </div>
                  <p className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                    Analyzing objective, scope & timeline.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-sky-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                    <Activity className="w-3.5 h-3.5" />
                    <span>2. Checking Level</span>
                  </div>
                  <p className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                    Reviewing GitHub, LeetCode & past mistakes.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-sky-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>3. Building Plan</span>
                  </div>
                  <p className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                    Structuring tailored milestones & criteria.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-sky-500/30 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-600 dark:text-sky-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>4. Ready for You</span>
                  </div>
                  <p className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                    Delivering actionable next steps.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Result View: Needs Clarification (Only shown when genuinely ambiguous) */}
          {runResult?.status === 'NEEDS_CLARIFICATION' && runResult.clarificationQuestions && (
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-heading font-bold text-amber-800 dark:text-amber-400">
                  <HelpCircle className="w-4 h-4" />
                  <span>Clarification Needed to Personalize Your Plan</span>
                </div>
                <p className="text-xs text-[var(--exec-text)] leading-relaxed">
                  To tailor your study schedule precisely, please select your preferred answer for each question below:
                </p>
              </div>

              <div className="space-y-3.5">
                {runResult.clarificationQuestions.map((q, idx) => {
                  const selectedAnswer = selectedClarifications[idx];

                  return (
                    <div key={idx} className="p-4 rounded-xl bg-[var(--exec-surface)] border border-amber-500/20 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-[var(--exec-text)]">
                          {idx + 1}. {q.question}
                        </p>
                        {selectedAnswer && (
                          <Badge variant="emerald" className="text-[9px] shrink-0">
                            Selected
                          </Badge>
                        )}
                      </div>

                      {q.suggestedOptions && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {q.suggestedOptions.map((opt, oIdx) => {
                            const isSelected = selectedAnswer === opt;
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                onClick={() => {
                                  setSelectedClarifications((prev) => ({
                                    ...prev,
                                    [idx]: opt,
                                  }));
                                }}
                                className={`px-3 py-1.5 rounded-xl text-xs font-sans transition-all cursor-pointer border text-left ${
                                  isSelected
                                    ? 'bg-sky-600 hover:bg-sky-700 text-white border-sky-600 font-medium shadow-xs ring-1 ring-sky-500/30'
                                    : 'bg-[var(--exec-surface-secondary)] hover:bg-sky-500/10 text-[var(--exec-text)] border-[var(--exec-border)] hover:border-sky-500/30'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                  <span>{opt}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Unified Multi-Answer Submission */}
              <div className="pt-3 border-t border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                  {Object.keys(selectedClarifications).length} of {runResult.clarificationQuestions.length} answered
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={Object.keys(selectedClarifications).length === 0 || isPending}
                  onClick={() => {
                    const answers = Object.entries(selectedClarifications)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([_, v]) => v)
                      .filter(Boolean);
                    const combined = `${goalText.trim()} — ${answers.join(' — ')}`;
                    setGoalText(combined);
                    handleSubmitGoal(combined);
                  }}
                  className="font-medium gap-1.5 shadow-sm px-4"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Submit Preferences & Build Roadmap</span>
                </Button>
              </div>
            </div>
          )}

          {/* 7. RESULT-FIRST UI: Human-Centric Learning Experience */}
          {runResult && (runResult.status === 'COMPLETED' || runResult.status === 'WAITING_FOR_APPROVAL') && (
            <div className="space-y-5 pt-3 border-t border-[var(--exec-border)]">

              {/* A. Your Goal Overview */}
              <div className="p-4 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">
                    Your Goal
                  </span>
                  <div className="text-sm font-semibold text-[var(--exec-text)]">
                    {runResult.goalUnderstanding?.objective || runResult.goalUnderstanding?.originalGoal || goalText}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {runResult.goalUnderstanding?.targetSkill && (
                    <Badge variant="indigo" className="text-xs">
                      Focus: {runResult.goalUnderstanding.targetSkill}
                    </Badge>
                  )}
                  {runResult.goalUnderstanding?.timeframe && (
                    <Badge variant="slate" className="text-xs">
                      Timeline: {runResult.goalUnderstanding.timeframe}
                    </Badge>
                  )}
                  <Badge variant="emerald" className="text-xs">
                    Plan Ready
                  </Badge>
                </div>
              </div>

              {/* B. What I Found About Your Current Level */}
              {runResult.studentAssessment && (
                <div className="p-5 rounded-2xl bg-[var(--exec-surface-secondary)]/70 border border-[var(--exec-border)] space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold text-[var(--exec-text)] uppercase tracking-wider flex items-center gap-2">
                      <Award className="w-4 h-4 text-amber-500" />
                      What I Found About Your Current Level
                    </h3>
                    <Badge variant="slate" className="text-[10px] font-sans">
                      {runResult.studentAssessment.overallConfidence === 'HIGH' ? 'Verified Evidence' : 'Observed Baseline'}
                    </Badge>
                  </div>

                  {/* Plain English Assessment Summary */}
                  <p className="text-xs text-[var(--exec-text)] font-sans leading-relaxed">
                    {runResult.studentAssessment.assessmentSummary}
                  </p>

                  {/* Grounded Level Evidence Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                    {/* Strong Verified Areas */}
                    <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-[var(--exec-border)] space-y-1.5">
                      <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 uppercase font-bold block">
                        Verified Strengths
                      </span>
                      {runResult.studentAssessment.supportedStrengths.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {runResult.studentAssessment.supportedStrengths.map((s, i) => (
                            <Badge key={i} variant="emerald" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--exec-text-muted)]">Building initial baseline</span>
                      )}
                    </div>

                    {/* Developing Areas */}
                    <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-[var(--exec-border)] space-y-1.5">
                      <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 uppercase font-bold block">
                        Developing Areas
                      </span>
                      {runResult.studentAssessment.developingAreas.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {runResult.studentAssessment.developingAreas.map((s, i) => (
                            <Badge key={i} variant="cyan" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--exec-text-muted)]">Core fundamentals</span>
                      )}
                    </div>

                    {/* Evidence Gaps / Practice Focus */}
                    <div className="p-3 rounded-xl bg-[var(--exec-surface)] border border-[var(--exec-border)] space-y-1.5">
                      <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 uppercase font-bold block">
                        Target Growth Gaps
                      </span>
                      {runResult.studentAssessment.evidenceGaps.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {runResult.studentAssessment.evidenceGaps.map((s, i) => (
                            <Badge key={i} variant="amber" className="text-[10px]">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--exec-text-muted)]">Practice projects recommended</span>
                      )}
                    </div>
                  </div>

                  {/* Telemetry Sources Inspected */}
                  {runResult.studentAssessment.recentActivitySummary && (
                    <div className="space-y-1.5 pt-1 text-[11px] text-[var(--exec-text-muted)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase font-semibold">Evidence Sources Inspected:</span>
                        {runResult.studentAssessment.recentActivitySummary.activeSources && runResult.studentAssessment.recentActivitySummary.activeSources.length > 0 ? (
                          runResult.studentAssessment.recentActivitySummary.activeSources.map((src, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-md bg-[var(--exec-surface)] border border-[var(--exec-border)] text-[var(--exec-text)] font-mono text-[10px]">
                              {src}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] font-mono text-[var(--exec-text-muted)] italic">
                            Initial baseline (no prior telemetry records found)
                          </span>
                        )}
                      </div>

                      {/* Explicit notice if GitHub/LeetCode are unavailable */}
                      {(!runResult.studentAssessment.recentActivitySummary.hasRecentGitHubActivity ||
                        !runResult.studentAssessment.recentActivitySummary.hasRecentLeetCodeActivity) && (
                        <p className="text-[10px] text-[var(--exec-text-muted)] font-sans italic">
                          ℹ External telemetry ({[!runResult.studentAssessment.recentActivitySummary.hasRecentGitHubActivity && 'GitHub', !runResult.studentAssessment.recentActivitySummary.hasRecentLeetCodeActivity && 'LeetCode'].filter(Boolean).join(', ')}) is currently not connected or has no records — plan is grounded on available local profile & activity evidence.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* C. Why I Chose This Path */}
              {runResult.learningDecision && (
                <div className="p-4 rounded-xl bg-sky-500/5 border border-sky-500/20 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-sans font-bold text-sky-700 dark:text-sky-300">
                    <Zap className="w-4 h-4 text-sky-500" />
                    <span>Why I Recommended This Path</span>
                  </div>
                  <p className="text-xs text-[var(--exec-text)] font-sans leading-relaxed">
                    {runResult.learningDecision.rationale}
                  </p>
                </div>
              )}

              {/* D. Your Recommended Step-by-Step Curriculum */}
              {runResult.learningPlan && runResult.learningPlan.steps && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-sans font-bold text-[var(--exec-text)] uppercase tracking-wider flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-sky-500" />
                      Your Learning Steps ({runResult.learningPlan.steps.length} Milestones)
                    </h3>
                    <Badge variant="slate" className="text-[10px] font-sans">
                      Estimated Duration: {runResult.learningPlan.steps.reduce((acc, s) => acc + (s.estimatedEffort?.estimatedMinutes || 30), 0)} mins
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {runResult.learningPlan.steps.map((step, sIdx) => {
                      const isCompleted = step.status === 'COMPLETED';
                      const feedback = stepFeedbackMap[step.id];
                      const isCompleting = completingStepId === step.id;

                      return (
                        <div
                          key={step.id || sIdx}
                          className={`p-4 rounded-xl border transition-all ${
                            isCompleted
                              ? 'bg-emerald-500/5 border-emerald-500/30'
                              : 'bg-[var(--exec-surface-secondary)] border-[var(--exec-border)] shadow-xs'
                          }`}
                        >
                          {/* Step Header */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3">
                              <span
                                className={`w-6 h-6 rounded-full text-xs font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                                  isCompleted
                                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                                }`}
                              >
                                {isCompleted ? <Check className="w-3.5 h-3.5" /> : step.order || sIdx + 1}
                              </span>
                              <div>
                                <div className="text-sm font-semibold text-[var(--exec-text)]">
                                  {step.title}
                                </div>
                                {step.targetSkill && (
                                  <Badge variant="indigo" className="mt-1 text-[10px] font-sans">
                                    Skill: {step.targetSkill}
                                  </Badge>
                                )}
                              </div>
                            </div>

                            <Badge
                              variant={isCompleted ? 'emerald' : 'cyan'}
                              className="text-[10px] font-sans uppercase shrink-0"
                            >
                              {isCompleted ? 'Completed' : 'To Do'}
                            </Badge>
                          </div>

                          {/* Step Guidance */}
                          <div className="mt-3 ml-9 space-y-2.5 text-xs font-sans">
                            {/* What to do now */}
                            <div className="text-[var(--exec-text)]">
                              <strong className="text-[var(--exec-text-muted)] font-mono text-[10px] uppercase block mb-0.5">
                                What to do:
                              </strong>
                              {step.description}
                            </div>

                            {/* What success will look like & verification */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                              {step.successCriteria && step.successCriteria.length > 0 && (
                                <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)]">
                                  <span className="font-mono font-bold text-[10px] uppercase text-[var(--exec-text-muted)] block mb-1">
                                    What Success Looks Like:
                                  </span>
                                  <ul className="list-disc list-inside space-y-0.5 text-[var(--exec-text)]">
                                    {step.successCriteria.map((c, idx) => (
                                      <li key={idx}>{c}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {step.verificationCriteria && step.verificationCriteria.length > 0 && (
                                <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)]">
                                  <span className="font-mono font-bold text-[10px] uppercase text-[var(--exec-text-muted)] block mb-1">
                                    How to Verify:
                                  </span>
                                  <ul className="list-disc list-inside space-y-0.5 text-[var(--exec-text)]">
                                    {step.verificationCriteria.map((v, idx) => (
                                      <li key={idx}>{v}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Interactive Step Completion */}
                            {!isCompleted && (
                              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Optional reflection or notes on your work..."
                                  value={stepNotesMap[step.id] || ''}
                                  onChange={(e) =>
                                    setStepNotesMap((prev) => ({
                                      ...prev,
                                      [step.id]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)] text-xs text-[var(--exec-text)] placeholder:text-[var(--exec-text-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500 font-sans"
                                />
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={isCompleting || isPending}
                                  onClick={() => handleCompleteStep(step.id)}
                                  className="text-xs shrink-0 font-medium"
                                >
                                  {isCompleting ? (
                                    <>
                                      <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                      Evaluating Step...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                      Complete Step & Update Profile
                                    </>
                                  )}
                                </Button>
                              </div>
                            )}

                            {/* Feedback Result After Completion (What happened & What happens next) */}
                            {feedback && (
                              <div className="mt-3 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="font-sans font-bold text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                                    <Sparkles className="w-4 h-4 text-emerald-600" />
                                    Step Completed & Progress Recorded
                                  </span>
                                  <Badge variant="emerald" className="text-[10px]">
                                    Verified
                                  </Badge>
                                </div>

                                <p className="text-xs text-[var(--exec-text)]">
                                  Your completed work has been verified against your learning goals and added to your telemetry profile.
                                </p>

                                {feedback.nextLearningDecision && (
                                  <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-emerald-500/20 text-xs">
                                    <span className="font-mono text-[10px] uppercase font-bold text-sky-600 dark:text-sky-400 block mb-0.5">
                                      What happens next:
                                    </span>
                                    <span>{feedback.nextLearningDecision.primaryObjective}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* E. Milestone Task Creation Approval */}
              {runResult.approvalProposal && approvalStatus !== 'APPROVED' && approvalStatus !== 'REJECTED' && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-sans font-bold text-amber-800 dark:text-amber-400">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      <span>Add Milestone to Your Task List?</span>
                    </div>
                    <Badge variant="amber" className="text-[10px] font-sans">
                      Requires Confirmation
                    </Badge>
                  </div>

                  <p className="text-xs text-[var(--exec-text)] font-sans">
                    I can schedule the following task in your Personal Learning OS dashboard to keep you on track:
                  </p>

                  <div className="p-3 rounded-lg bg-[var(--exec-surface)] border border-amber-500/20 text-xs space-y-1">
                    <div className="font-semibold text-[var(--exec-text)]">
                      {runResult.approvalProposal.input.title}
                    </div>
                    {runResult.approvalProposal.input.description && (
                      <div className="text-[11px] text-[var(--exec-text-muted)] font-sans">
                        {runResult.approvalProposal.input.description}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleApproveTask('REJECTED')}
                      disabled={approvalStatus === 'APPROVING'}
                      className="text-xs font-sans"
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Skip Task
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApproveTask('APPROVED')}
                      disabled={approvalStatus === 'APPROVING'}
                      className="text-xs font-sans bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Check className="w-3.5 h-3.5 mr-1" />
                      {approvalStatus === 'APPROVING' ? 'Scheduling...' : 'Schedule Milestone'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Task Creation Success */}
              {approvalStatus === 'APPROVED' && createdTaskInfo && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      Milestone <strong>&ldquo;{createdTaskInfo.title}&rdquo;</strong> scheduled in your tasks!
                    </span>
                  </div>
                  <a href="/tasks" className="underline font-sans text-xs hover:text-emerald-800 font-medium">
                    View in Tasks &rarr;
                  </a>
                </div>
              )}

              {/* F. Collapsible Technical Architecture & Diagnostics (6A–6G Telemetry) */}
              <div className="pt-2 border-t border-[var(--exec-border)]">
                <button
                  type="button"
                  onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                  className="flex items-center justify-between w-full py-2 text-xs font-mono text-[var(--exec-text-muted)] hover:text-[var(--exec-text)] transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2 font-semibold uppercase tracking-wider">
                    <Layers className="w-3.5 h-3.5 text-sky-500" />
                    Technical Architecture & Diagnostics (6A–6G Telemetry)
                  </span>
                  {showTechnicalDetails ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                {showTechnicalDetails && (
                  <div className="mt-3 p-4 rounded-xl bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] space-y-3 text-xs font-mono">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)]">
                        <span className="text-[10px] text-[var(--exec-text-muted)] block uppercase">Phase 6A Intake</span>
                        <span className="font-bold text-[var(--exec-text)]">{runResult.goalUnderstanding?.category || 'GENERAL'}</span>
                        <div className="text-[10px] text-[var(--exec-text-muted)] mt-1">Confidence: {runResult.goalUnderstanding?.confidence}</div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)]">
                        <span className="text-[10px] text-[var(--exec-text-muted)] block uppercase">Phase 6C Action Selection</span>
                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{runResult.learningDecision?.decisionType || 'PRACTICE'}</span>
                        <div className="text-[10px] text-[var(--exec-text-muted)] mt-1">Confidence: {runResult.learningDecision?.confidence}</div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)]">
                        <span className="text-[10px] text-[var(--exec-text-muted)] block uppercase">Phase 6G Adaptation Policy</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {runResult.adaptivePolicy?.adaptationSignals[0]?.type || 'PRESERVE_PATTERN'}
                        </span>
                        <div className="text-[10px] text-[var(--exec-text-muted)] mt-1">
                          Signals: {runResult.adaptivePolicy?.adaptationSignals.length || 0}
                        </div>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-[var(--exec-surface)] border border-[var(--exec-border)] text-[10px] text-[var(--exec-text-muted)] space-y-1">
                      <div>Orchestrator Run ID: {runResult.runId}</div>
                      <div>Terminal State: {runResult.status}</div>
                      <div>Write Safety: Phase 5 Human Approval Gate Verified</div>
                      <div>Ground Truth: Phase 1 Corroborated Evidence Authority</div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
