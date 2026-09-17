'use client';

import { useState, useEffect } from 'react';
import { 
  StudentCorroborationAuditResult, 
  StudentSkillAssessment, 
  SkillConfidenceLevel, 
  EvidenceClassification, 
  EvidenceRecord 
} from '@/lib/agent/types';
import { getStudentEvidenceAudit } from '@/app/actions/agent-actions';
import { 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  AlertOctagon, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Clock, 
  Layers, 
  Search, 
  GitBranch, 
  Code2, 
  Activity, 
  Check, 
  X,
  Info
} from 'lucide-react';
import { GlassCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface StudentEvidenceAuditProps {
  initialAudit?: StudentCorroborationAuditResult | null;
}

export function StudentEvidenceAudit({ initialAudit }: StudentEvidenceAuditProps) {
  const [audit, setAudit] = useState<StudentCorroborationAuditResult | null>(initialAudit || null);
  const [isLoading, setIsLoading] = useState(!initialAudit);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());

  const fetchAudit = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    const res = await getStudentEvidenceAudit();
    setIsLoading(false);
    if (res.success && res.data) {
      setAudit(res.data);
    } else {
      setErrorMessage(res.error || 'Failed to load evidence audit.');
    }
  };

  useEffect(() => {
    if (!initialAudit) {
      fetchAudit();
    }
  }, [initialAudit]);

  const toggleSkillExpand = (skillName: string) => {
    const next = new Set(expandedSkills);
    if (next.has(skillName)) {
      next.delete(skillName);
    } else {
      next.add(skillName);
    }
    setExpandedSkills(next);
  };

  // Helper for confidence badges
  const renderConfidenceBadge = (level: SkillConfidenceLevel) => {
    switch (level) {
      case 'HIGH':
        return (
          <Badge variant="emerald">
            <ShieldCheck className="w-3 h-3" />
            <span>High Confidence</span>
          </Badge>
        );
      case 'MODERATE':
        return (
          <Badge variant="cyan">
            <CheckCircle2 className="w-3 h-3" />
            <span>Moderate</span>
          </Badge>
        );
      case 'LOW':
        return (
          <Badge variant="amber">
            <AlertTriangle className="w-3 h-3" />
            <span>Low Confidence</span>
          </Badge>
        );
      case 'CONTRADICTED':
        return (
          <Badge variant="crimson">
            <AlertOctagon className="w-3 h-3" />
            <span>Contradicted</span>
          </Badge>
        );
      case 'UNVERIFIED':
      default:
        return (
          <Badge variant="slate">
            <HelpCircle className="w-3 h-3" />
            <span>Unverified</span>
          </Badge>
        );
    }
  };

  // Helper for classification badges
  const renderClassificationBadge = (classification: EvidenceClassification) => {
    switch (classification) {
      case 'EXTERNALLY_VERIFIED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <Check className="w-2.5 h-2.5" /> Externally Verified
          </span>
        );
      case 'OBSERVED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
            <Activity className="w-2.5 h-2.5" /> Observed
          </span>
        );
      case 'INFERRED':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            Inferred
          </span>
        );
      case 'SELF_REPORTED':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700">
            Self-Reported
          </span>
        );
    }
  };

  // Filter skills
  const filteredSkills = (audit?.skillsEvaluated || []).filter((s) => {
    const matchesFilter =
      selectedFilter === 'ALL' ||
      s.confidenceLevel === selectedFilter;

    const matchesSearch =
      searchQuery.trim() === '' ||
      s.skillName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.category && s.category.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* 1. Header & Re-run Action */}
      <div className="p-6 bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-base font-heading font-bold text-[var(--exec-text)] tracking-tight">
              Student Ground-Truth Evidence Audit
            </h2>
            <Badge variant="emerald">Deterministic v1.0</Badge>
          </div>
          <p className="text-xs text-[var(--exec-text-muted)] max-w-2xl font-sans">
            Independent epistemic evaluation of student skill claims against verified GitHub commits, LeetCode submissions, focus time, and documented mistakes.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchAudit}
          disabled={isLoading}
          className="shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Running Audit...' : 'Re-run Evidence Audit'}</span>
        </Button>
      </div>

      {/* Error state */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {/* 2. Executive Summary Metrics */}
      {!isLoading && audit && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-[var(--exec-text-subtle)] uppercase font-bold tracking-wider">
                Overall Ground Truth
              </span>
              <div className="text-2xl font-mono font-bold text-[var(--exec-text)] mt-1.5 flex items-baseline gap-1">
                <span>{Math.round(audit.summary.overallGroundTruthScore * 100)}%</span>
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Calibrated veracity
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 uppercase font-bold tracking-wider">
                High Confidence
              </span>
              <div className="text-2xl font-mono font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                {audit.summary.highConfidenceCount}
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Verified proof
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-sky-700 dark:text-sky-400 uppercase font-bold tracking-wider">
                Moderate
              </span>
              <div className="text-2xl font-mono font-bold text-sky-600 dark:text-sky-400 mt-1.5">
                {audit.summary.moderateConfidenceCount}
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Observed practice
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 uppercase font-bold tracking-wider">
                Low Confidence
              </span>
              <div className="text-2xl font-mono font-bold text-amber-600 dark:text-amber-400 mt-1.5">
                {audit.summary.lowConfidenceCount}
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Sparse telemetry
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-rose-700 dark:text-rose-400 uppercase font-bold tracking-wider">
                Contradicted
              </span>
              <div className="text-2xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-1.5">
                {audit.summary.contradictedCount}
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Mistakes / Failures
              </p>
            </GlassCard>

            <GlassCard className="p-4">
              <span className="text-[10px] font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">
                Unverified
              </span>
              <div className="text-2xl font-mono font-bold text-[var(--exec-text-subtle)] mt-1.5">
                {audit.summary.unverifiedCount}
              </div>
              <p className="text-[10px] font-mono text-[var(--exec-text-muted)] mt-1">
                Pure self-claims
              </p>
            </GlassCard>
          </div>

          {/* Connected Telemetry Status Bar */}
          <div className="px-4 py-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-mono font-bold uppercase text-[var(--exec-text-subtle)]">
                Active Ground-Truth Feeds:
              </span>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${audit.metadata.hasGitHubConnected ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[var(--exec-text-muted)]'}`}>
                  <GitBranch className="w-3.5 h-3.5" />
                  <span>GitHub {audit.metadata.hasGitHubConnected ? 'Synced' : 'Not Connected'}</span>
                </span>
                <span className="text-[var(--exec-border)]">•</span>
                <span className={`inline-flex items-center gap-1 font-mono text-[11px] ${audit.metadata.hasLeetCodeConnected ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : 'text-[var(--exec-text-muted)]'}`}>
                  <Code2 className="w-3.5 h-3.5" />
                  <span>LeetCode {audit.metadata.hasLeetCodeConnected ? 'Synced' : 'Not Connected'}</span>
                </span>
              </div>
            </div>

            <span className="font-mono text-[10px] text-[var(--exec-text-muted)]">
              {audit.metadata.totalEvidenceLinksParsed} evidence artifacts parsed
            </span>
          </div>

          {/* Warnings Banner if any */}
          {audit.warnings && audit.warnings.length > 0 && (
            <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl space-y-1">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>EPISTEMIC AUDIT WARNINGS</span>
              </div>
              <ul className="text-xs text-amber-900 dark:text-amber-200/90 list-disc list-inside space-y-0.5 pl-1">
                {audit.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Filter Controls & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: `All (${audit.skillsEvaluated.length})` },
                { id: 'HIGH', label: `High (${audit.summary.highConfidenceCount})` },
                { id: 'MODERATE', label: `Moderate (${audit.summary.moderateConfidenceCount})` },
                { id: 'LOW', label: `Low (${audit.summary.lowConfidenceCount})` },
                { id: 'CONTRADICTED', label: `Contradicted (${audit.summary.contradictedCount})` },
                { id: 'UNVERIFIED', label: `Unverified (${audit.summary.unverifiedCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSelectedFilter(tab.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                    selectedFilter === tab.id
                      ? 'bg-[#17191D] dark:bg-white text-white dark:text-[#17191D] font-bold shadow-xs'
                      : 'bg-[var(--exec-surface)] hover:bg-[var(--exec-surface-secondary)] text-[var(--exec-text-muted)] border border-[var(--exec-border)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-[var(--exec-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search skills or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-xl text-[var(--exec-text)] placeholder:text-[var(--exec-text-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* 4. Skills Assessment List */}
          {filteredSkills.length === 0 ? (
            <GlassCard className="p-8 text-center space-y-2">
              <HelpCircle className="w-8 h-8 text-[var(--exec-text-muted)] mx-auto opacity-50" />
              <h3 className="text-xs font-mono font-bold uppercase text-[var(--exec-text)]">
                No Skills Found
              </h3>
              <p className="text-xs text-[var(--exec-text-muted)] max-w-sm mx-auto">
                No skills match the current filter or search criteria.
              </p>
            </GlassCard>
          ) : (
            <div className="space-y-3">
              {filteredSkills.map((skill) => {
                const isExpanded = expandedSkills.has(skill.skillName);
                const supportingCount = skill.evidenceCount.supporting;
                const contradictingCount = skill.evidenceCount.contradicting;
                const externallyVerifiedCount = skill.evidenceCount.externallyVerified;

                return (
                  <GlassCard
                    key={skill.skillName}
                    className="p-4 transition-all duration-200 hover:border-neutral-400 dark:hover:border-neutral-600"
                  >
                    {/* Primary Row Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-heading font-bold text-[var(--exec-text)]">
                            {skill.skillName}
                          </span>
                          {skill.category && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--exec-surface-secondary)] text-[var(--exec-text-muted)] border border-[var(--exec-border)]">
                              {skill.category}
                            </span>
                          )}
                          {renderConfidenceBadge(skill.confidenceLevel)}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-[var(--exec-text-muted)]">
                          <span>
                            Claim: <strong className="text-[var(--exec-text)]">{skill.claimedProficiency}/5</strong>
                          </span>
                          <span>•</span>
                          <span>
                            Calibrated Assessment:{' '}
                            <strong className="text-sky-600 dark:text-sky-400">
                              {skill.assessedProficiency !== null ? `${skill.assessedProficiency}/5` : 'Uncalibrated'}
                            </strong>
                          </span>
                          <span>•</span>
                          <span>
                            Confidence Score:{' '}
                            <strong className="text-[var(--exec-text)]">
                              {Math.round(skill.evidenceBackedScore * 100)}%
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Evidence Summary Badges & Accordion Trigger */}
                      <div className="flex items-center gap-2 self-end md:self-center">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono">
                          {externallyVerifiedCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold">
                              {externallyVerifiedCount} verified
                            </span>
                          )}
                          {contradictingCount > 0 && (
                            <span className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold">
                              {contradictingCount} contradictory
                            </span>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSkillExpand(skill.skillName)}
                          className="text-xs"
                        >
                          <span>{isExpanded ? 'Hide Details' : 'Inspect Evidence'}</span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Expandable Deep Audit Drawer */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-[var(--exec-border)] space-y-4 text-xs font-sans animate-fadeIn">
                        {/* Score Breakdown Bar */}
                        {skill.breakdown && (
                          <div className="p-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl space-y-2">
                            <span className="text-[10px] font-mono uppercase font-bold text-[var(--exec-text-subtle)]">
                              Deterministic Score Formula Breakdown
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                              <div>
                                <span className="text-[var(--exec-text-muted)] block">Positive Strength:</span>
                                <span className="font-bold text-[var(--exec-text)]">
                                  {Math.round(skill.breakdown.supportingStrength * 100)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--exec-text-muted)] block">Contradiction Penalty:</span>
                                <span className={`font-bold ${skill.breakdown.contradictionPenalty > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-[var(--exec-text)]'}`}>
                                  -{Math.round(skill.breakdown.contradictionPenalty * 100)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--exec-text-muted)] block">Completeness Factor:</span>
                                <span className="font-bold text-[var(--exec-text)]">
                                  {Math.round(skill.breakdown.completenessMultiplier * 100)}%
                                </span>
                              </div>
                              <div>
                                <span className="text-[var(--exec-text-muted)] block">Freshness Multiplier:</span>
                                <span className="font-bold text-[var(--exec-text)]">
                                  {Math.round(skill.breakdown.freshnessMultiplier * 100)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Concise Reasons List */}
                        {skill.reasons && skill.reasons.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-mono uppercase font-bold text-[var(--exec-text-subtle)]">
                              Audit Explanation
                            </span>
                            <ul className="space-y-1 pl-1">
                              {skill.reasons.map((r, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-[var(--exec-text)]">
                                  <Info className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
                                  <span>{r}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Contradictions Section if any */}
                        {skill.contradictions.length > 0 && (
                          <div className="space-y-2 p-3 bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl">
                            <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-rose-800 dark:text-rose-300 uppercase">
                              <AlertOctagon className="w-3.5 h-3.5" />
                              <span>Detected Empirical Contradictions ({skill.contradictions.length})</span>
                            </div>
                            <ul className="space-y-1 text-rose-900 dark:text-rose-200/90 text-xs pl-1">
                              {skill.contradictions.map((c) => (
                                <li key={c.id} className="flex items-start gap-2">
                                  <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200">
                                    {c.severity}
                                  </span>
                                  <span>{c.reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Supporting Evidence Items List */}
                        <div className="space-y-2">
                          <span className="text-[10px] font-mono uppercase font-bold text-[var(--exec-text-subtle)]">
                            Supporting Telemetry Records ({skill.evidenceCount.supporting})
                          </span>
                          {skill.evidenceRecords.filter((e) => e.polarity === 'SUPPORTS').length === 0 ? (
                            <p className="text-xs text-[var(--exec-text-muted)] italic">
                              No supporting empirical evidence found.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {skill.evidenceRecords
                                .filter((e) => e.polarity === 'SUPPORTS')
                                .map((record) => (
                                  <div
                                    key={record.id}
                                    className="p-2.5 bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                  >
                                    <div className="space-y-0.5">
                                      <div className="flex items-center gap-2">
                                        {renderClassificationBadge(record.classification)}
                                        <span className="text-[10px] font-mono text-[var(--exec-text-muted)]">
                                          Source: {record.source}
                                        </span>
                                      </div>
                                      <p className="text-xs text-[var(--exec-text)]">
                                        {record.description}
                                      </p>
                                    </div>

                                    {record.sourceRef?.url && (
                                      <a
                                        href={record.sourceRef.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] font-mono text-sky-600 hover:underline flex items-center gap-1 shrink-0"
                                      >
                                        <span>View Source</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                    )}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>

                        {/* Missing Requirements & Recommended Actions */}
                        {skill.missingEvidence.length > 0 && (
                          <div className="space-y-2 p-3 bg-neutral-50 dark:bg-neutral-900/60 border border-[var(--exec-border)] rounded-xl">
                            <span className="text-[10px] font-mono uppercase font-bold text-[var(--exec-text-subtle)]">
                              Verification Gaps & Actionable Steps ({skill.missingEvidence.length})
                            </span>
                            <ul className="space-y-1.5 text-xs text-[var(--exec-text)]">
                              {skill.missingEvidence.map((m, idx) => (
                                <li key={idx} className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="amber">{m.requiredClassification}</Badge>
                                    <span>{m.description}</span>
                                  </div>
                                  <p className="text-[11px] text-[var(--exec-text-muted)] font-mono pl-4">
                                    &rarr; Recommendation: {m.recommendedAction}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </GlassCard>
                );
              })}
            </div>
          )}

          {/* 5. System Limitations & Telemetry Scope Footer */}
          {audit.limitations && audit.limitations.length > 0 && (
            <div className="p-4 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl text-xs space-y-1.5">
              <span className="text-[10px] font-mono uppercase font-bold text-[var(--exec-text-subtle)]">
                Audit Scope & Limitations
              </span>
              <ul className="text-xs text-[var(--exec-text-muted)] space-y-0.5 list-disc list-inside">
                {audit.limitations.map((lim, idx) => (
                  <li key={idx}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
