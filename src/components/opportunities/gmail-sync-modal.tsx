'use client';

import { useState, useEffect } from 'react';
import { syncGmailOpportunities, disconnectGmail } from '@/app/actions/gmail-actions';
import { saveExtractedOpportunities } from '@/app/actions/file-opportunity-actions';
import { mergeOpportunityWithExisting } from '@/app/actions/opportunity-actions';
import { ExtractedOpportunityItem } from '@/lib/ai/opportunity-extractor';
import { DuplicateMatchResult } from '@/types';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Mail, Sparkles, X, Check, Loader2, ShieldCheck, AlertCircle, Edit2, Quote, CheckSquare, Square, GitMerge, AlertTriangle, RefreshCw } from 'lucide-react';

interface GmailSyncModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function GmailSyncModal({ onClose, onSuccess }: GmailSyncModalProps) {
  const [step, setStep] = useState<'syncing' | 'review' | 'empty'>('syncing');
  const [totalScanned, setTotalScanned] = useState(0);
  const [opportunityEmailsFound, setOpportunityEmailsFound] = useState(0);
  const [extractedItems, setExtractedItems] = useState<ExtractedOpportunityItem[]>([]);
  const [duplicateMatches, setDuplicateMatches] = useState<Record<number, DuplicateMatchResult>>({});
  const [approvedIndices, setApprovedIndices] = useState<number[]>([]);
  const [mergeIndices, setMergeIndices] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    runSync();
  }, []);

  const runSync = async () => {
    setStep('syncing');
    setErrorMessage(null);

    const res = await syncGmailOpportunities(30);

    if (res.success && res.data) {
      setTotalScanned(res.data.totalScanned);
      setOpportunityEmailsFound(res.data.opportunityEmailsFound);
      setExtractedItems(res.data.opportunities);
      setDuplicateMatches(res.data.duplicateMatches);

      if (res.data.opportunities.length === 0) {
        setStep('empty');
      } else {
        const autoApproved = res.data.opportunities.map((_, i) => i);
        const defaultMergeMap: Record<number, boolean> = {};

        res.data.opportunities.forEach((_, i) => {
          const match = res.data?.duplicateMatches[i];
          if (match && (match.matchLevel === 'EXACT_MATCH' || match.matchLevel === 'STRONG_MATCH')) {
            defaultMergeMap[i] = true;
          }
        });

        setApprovedIndices(autoApproved);
        setMergeIndices(defaultMergeMap);
        setStep('review');
      }
    } else {
      setErrorMessage(res.error || 'Failed to sync Gmail.');
      setStep('empty');
    }
  };

  const toggleApproveItem = (index: number) => {
    if (approvedIndices.includes(index)) {
      setApprovedIndices(approvedIndices.filter((i) => i !== index));
    } else {
      setApprovedIndices([...approvedIndices, index]);
    }
  };

  const toggleMergeOption = (index: number) => {
    setMergeIndices((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleItemChange = (index: number, field: keyof ExtractedOpportunityItem, value: any) => {
    const updated = [...extractedItems];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedItems(updated);
  };

  const handleConfirmAndSave = async () => {
    const approvedItems = extractedItems.filter((_, i) => approvedIndices.includes(i));
    if (approvedItems.length === 0 || isSaving) return;

    setIsSaving(true);
    setErrorMessage(null);

    const itemsToInsertNew: ExtractedOpportunityItem[] = [];

    for (let i = 0; i < extractedItems.length; i++) {
      if (!approvedIndices.includes(i)) continue;

      const item = extractedItems[i];
      const dup = duplicateMatches[i];
      const shouldMerge = mergeIndices[i];

      if (shouldMerge && dup && dup.matchedOpportunity) {
        await mergeOpportunityWithExisting(dup.matchedOpportunity.id, {
          source: 'GMAIL',
          source_identifier: item.source_identifier || 'Gmail Sync',
          evidence_snippet: item.evidence_snippet || null,
          description: item.description || null,
          stipend: item.stipend || null,
          salary: item.salary || null,
          deadline: item.deadline || null,
          application_url: item.application_url || null,
          skills_required: item.skills_required || null,
        });
      } else {
        itemsToInsertNew.push(item);
      }
    }

    if (itemsToInsertNew.length > 0) {
      const res = await saveExtractedOpportunities(itemsToInsertNew, 'GMAIL', 'Gmail Sync');
      if (!res.success) {
        setIsSaving(false);
        setErrorMessage(res.error || 'Failed to save new Gmail opportunity records.');
        return;
      }
    }

    setIsSaving(false);
    onSuccess();
    onClose();
  };

  const getConfidenceBadge = (confidence: number) => {
    const pct = Math.round(confidence * 100);
    if (pct >= 90) {
      return <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">{pct}% (Strong Evidence)</span>;
    } else if (pct >= 70) {
      return <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 font-bold">{pct}% (Clear)</span>;
    } else {
      return <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">{pct}% (Partial/Needs Review)</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop">
      <div
        className="w-full max-w-3xl glass-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#17191D]">
            <Mail className="w-4 h-4 text-rose-600" />
            <span>GMAIL MANUAL SYNC // OPPORTUNITY EXTRACTION</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 font-sans text-xs">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {step === 'syncing' && (
            <div className="p-12 text-center space-y-4 font-mono">
              <Loader2 className="w-8 h-8 animate-spin text-rose-600 mx-auto" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-[#17191D]">Syncing Recent Gmail Messages</h4>
                <p className="text-[11px] text-[#646A73]">
                  Scanning recent inbox messages, applying signal filters, and parsing opportunities with Gemini AI...
                </p>
              </div>
            </div>
          )}

          {step === 'empty' && (
            <div className="p-10 text-center space-y-3 font-mono">
              <p className="text-xs text-[#646A73]">
                Scanned {totalScanned} message(s). Found {opportunityEmailsFound} opportunity email(s).
              </p>
              <p className="text-[11px] text-[#8C929B]">No new opportunity records detected in synced emails.</p>
              <Button onClick={onClose} variant="outline" size="sm">Close</Button>
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between font-mono text-xs text-rose-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    GMAIL CONFIRMATION GATE: Scanned {totalScanned} emails ➔ Detected {extractedItems.length} opportunity record(s).
                  </span>
                </div>
                <Badge variant="indigo">GMAIL SYNC</Badge>
              </div>

              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
                {extractedItems.map((item, idx) => {
                  const isApproved = approvedIndices.includes(idx);
                  const dupMatch = duplicateMatches[idx];
                  const isMerging = mergeIndices[idx];

                  return (
                    <GlassCard
                      key={idx}
                      className={`p-4 space-y-3 transition-all ${
                        isApproved ? 'border-emerald-300 bg-white' : 'border-[#E2E5E9] bg-gray-50 opacity-75'
                      }`}
                    >
                      <div className="flex items-start justify-between border-b border-[#E2E5E9] pb-2.5 font-mono gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleApproveItem(idx)}
                            className="text-[#0284C7] hover:scale-110 transition-transform"
                          >
                            {isApproved ? <CheckSquare className="w-4 h-4 text-emerald-600" /> : <Square className="w-4 h-4 text-[#8C929B]" />}
                          </button>
                          <div>
                            <span className="text-[10px] text-[#8C929B] uppercase font-bold block">
                              Opportunity #{idx + 1} of {extractedItems.length}
                            </span>
                            <span className="text-xs font-bold text-[#17191D]">{item.organization}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[10px]">
                          <Badge variant="cyan">{item.type}</Badge>
                          {getConfidenceBadge(item.confidence)}
                        </div>
                      </div>

                      {dupMatch && dupMatch.matchLevel !== 'NO_MATCH' && dupMatch.matchedOpportunity && (
                        <div className={`p-3 rounded-xl font-mono text-xs border space-y-1.5 ${
                          dupMatch.matchLevel === 'POSSIBLE_DUPLICATE' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-sky-50 border-sky-200 text-sky-900'
                        }`}>
                          <div className="flex items-center justify-between font-bold">
                            <div className="flex items-center gap-2">
                              {dupMatch.matchLevel === 'POSSIBLE_DUPLICATE' ? <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" /> : <GitMerge className="w-4 h-4 text-[#0284C7] shrink-0" />}
                              <span>{dupMatch.matchLevel === 'POSSIBLE_DUPLICATE' ? 'POSSIBLE DUPLICATE — REVIEW' : 'DUPLICATE MATCH FOUND'}</span>
                            </div>
                            <span className="text-[10px]">Match Score: {Math.round(dupMatch.matchScore * 100)}%</span>
                          </div>
                          <p className="text-[11px] text-[#646A73]">Matches: <strong>{dupMatch.matchedOpportunity.organization} - {dupMatch.matchedOpportunity.title}</strong></p>
                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMergeOption(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                                isMerging ? 'bg-[#17191D] text-white shadow-xs' : 'bg-white text-[#17191D] border border-[#E2E5E9]'
                              }`}
                            >
                              <GitMerge className="w-3 h-3" />
                              <span>{isMerging ? 'Action: Merge into Existing Record' : 'Action: Save as New Separate Record'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {item.evidence_snippet && (
                        <div className="p-2.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-start gap-2 font-mono text-[11px] text-[#646A73]">
                          <Quote className="w-3.5 h-3.5 text-[#0284C7] shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-[#17191D] block text-[10px] uppercase">Detected Email Evidence:</span>
                            <p className="italic text-[#17191D]">&quot;{item.evidence_snippet}&quot;</p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#8C929B] bg-[#F8F9FB] px-2.5 py-1 rounded-lg border border-[#E2E5E9]">
                        <span>Source: <strong>GMAIL</strong></span>
                        {item.source_identifier && <span>Ref: <strong>{item.source_identifier}</strong></span>}
                      </div>

                      <div className="space-y-2.5 font-sans">
                        <h4 className="text-xs font-heading font-bold text-[#17191D]">{item.title}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
                          <div>
                            <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Stipend / Salary</span>
                            {item.stipend || item.salary ? <span className="font-bold text-emerald-700">{item.stipend || item.salary}</span> : <span className="text-[#8C929B] italic">Not specified</span>}
                          </div>
                          <div>
                            <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Deadline</span>
                            {item.deadline ? <span className="font-bold text-[#0284C7]">{item.deadline}</span> : <span className="text-[#8C929B] italic">Not specified</span>}
                          </div>
                          <div>
                            <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Location</span>
                            {item.location || item.work_mode ? <span className="font-bold text-[#17191D]">{item.location || item.work_mode}</span> : <span className="text-[#8C929B] italic">Not specified</span>}
                          </div>
                          <div>
                            <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Eligibility</span>
                            {item.eligibility ? <span className="font-bold text-[#17191D] truncate block">{item.eligibility}</span> : <span className="text-[#8C929B] italic">Not specified</span>}
                          </div>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[#E2E5E9]">
                <Button type="button" onClick={onClose} variant="outline" size="sm">Cancel</Button>
                <Button type="button" onClick={handleConfirmAndSave} disabled={isSaving || approvedIndices.length === 0} variant="primary" size="md">
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-400" />}
                  <span>Confirm Actions ({approvedIndices.length} Approved)</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
