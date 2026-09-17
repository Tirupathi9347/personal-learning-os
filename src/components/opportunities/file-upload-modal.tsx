'use client';

import { useState, useRef } from 'react';
import { processOpportunityDocument, saveExtractedOpportunities } from '@/app/actions/file-opportunity-actions';
import { checkDuplicateOpportunity, mergeOpportunityWithExisting } from '@/app/actions/opportunity-actions';
import { ExtractedOpportunityItem, ExtractionResult } from '@/lib/ai/opportunity-extractor';
import { Opportunity, DuplicateMatchResult } from '@/types';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea } from '@/components/ui/input';
import { Upload, FileText, Sparkles, X, Check, Loader2, ShieldCheck, AlertCircle, Edit2, Quote, CheckSquare, Square, GitMerge, AlertTriangle, Layers } from 'lucide-react';

interface FileUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function FileUploadModal({ onClose, onSuccess }: FileUploadModalProps) {
  const [step, setStep] = useState<'upload' | 'processing' | 'review'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractionResult | null>(null);
  const [extractedItems, setExtractedItems] = useState<ExtractedOpportunityItem[]>([]);
  const [duplicateMatches, setDuplicateMatches] = useState<Record<number, DuplicateMatchResult>>({});
  const [approvedIndices, setApprovedIndices] = useState<number[]>([]);
  const [mergeIndices, setMergeIndices] = useState<Record<number, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMessage(null);
    }
  };

  const handleProcessFile = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setStep('processing');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const res = await processOpportunityDocument(formData);

    if (res.success && res.data) {
      setExtractionResult(res.data);
      setExtractedItems(res.data.opportunities);

      // Perform Phase 3 pre-save Duplicate Intelligence checks against database
      const dupResults: Record<number, DuplicateMatchResult> = {};
      const autoApproved: number[] = [];
      const defaultMergeMap: Record<number, boolean> = {};

      for (let i = 0; i < res.data.opportunities.length; i++) {
        const candidate = res.data.opportunities[i];
        const matchResult = await checkDuplicateOpportunity(candidate);
        dupResults[i] = matchResult;

        if (matchResult.matchLevel === 'EXACT_MATCH' || matchResult.matchLevel === 'STRONG_MATCH') {
          defaultMergeMap[i] = true;
          autoApproved.push(i);
        } else if (matchResult.matchLevel === 'POSSIBLE_DUPLICATE') {
          // Flag for review - do NOT auto-merge
          defaultMergeMap[i] = false;
          autoApproved.push(i);
        } else {
          autoApproved.push(i);
        }
      }

      setDuplicateMatches(dupResults);
      setMergeIndices(defaultMergeMap);
      setApprovedIndices(autoApproved);
      setIsProcessing(false);
      setStep('review');
    } else {
      setIsProcessing(false);
      setStep('upload');
      setErrorMessage(res.error || 'Failed to process document with Gemini AI.');
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
    setMergeIndices((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleItemChange = (index: number, field: keyof ExtractedOpportunityItem, value: any) => {
    const updated = [...extractedItems];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedItems(updated);
  };

  const handleConfirmAndSave = async () => {
    const approvedItems = extractedItems.filter((_, i) => approvedIndices.includes(i));

    if (approvedItems.length === 0 || isSaving) {
      setErrorMessage('Please select at least 1 opportunity record to save or merge.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    const itemsToInsertNew: ExtractedOpportunityItem[] = [];

    for (let i = 0; i < extractedItems.length; i++) {
      if (!approvedIndices.includes(i)) continue;

      const item = extractedItems[i];
      const dup = duplicateMatches[i];
      const shouldMerge = mergeIndices[i];

      if (shouldMerge && dup && dup.matchedOpportunity) {
        // Merge into existing opportunity record, preserving source history
        await mergeOpportunityWithExisting(dup.matchedOpportunity.id, {
          source: extractionResult?.sourceType || 'FILE_UPLOAD',
          source_identifier: item.source_identifier || selectedFile?.name || null,
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
      const res = await saveExtractedOpportunities(
        itemsToInsertNew,
        extractionResult?.sourceType || 'FILE_UPLOAD',
        selectedFile?.name
      );

      if (!res.success) {
        setIsSaving(false);
        setErrorMessage(res.error || 'Failed to save new opportunity records.');
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
        {/* Header */}
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#17191D]">
            <Sparkles className="w-4 h-4 text-[#0284C7]" />
            <span>FILE INTELLIGENCE // AI EXTRACTION & DUPLICATE CHECK</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 font-sans text-xs">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: UPLOAD DROPZONE */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-10 border-2 border-dashed border-[#E2E5E9] hover:border-[#0284C7] rounded-2xl bg-[#F8F9FB] text-center space-y-3 cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-white border border-[#E2E5E9] flex items-center justify-center mx-auto text-[#0284C7] group-hover:scale-110 transition-transform shadow-xs">
                  <Upload className="w-5 h-5" />
                </div>

                <div className="space-y-1 font-mono">
                  <p className="text-xs font-bold text-[#17191D]">
                    {selectedFile ? selectedFile.name : 'Click to upload document or drag and drop'}
                  </p>
                  <p className="text-[11px] text-[#8C929B]">
                    Supports PDF, DOC, DOCX, TXT, and WhatsApp exported chat logs (.txt)
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {selectedFile && (
                <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between font-mono text-xs text-sky-900">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0284C7]" />
                    <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <Button onClick={handleProcessFile} disabled={isProcessing} variant="primary" size="sm">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Analyze with Gemini AI</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PROCESSING LOADER */}
          {step === 'processing' && (
            <div className="p-12 text-center space-y-4 font-mono">
              <Loader2 className="w-8 h-8 animate-spin text-[#0284C7] mx-auto" />
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-[#17191D]">Analyzing Document & Duplicate Intelligence</h4>
                <p className="text-[11px] text-[#646A73]">
                  Gemini AI is parsing opportunities, scanning existing records for duplicates, and structuring fields...
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW SCREEN & AI CONFIRMATION GATE */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between font-mono text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    AI CONFIRMATION GATE: Detected {extractedItems.length} opportunity record(s). ({approvedIndices.length} approved)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="emerald">{extractionResult?.sourceType}</Badge>
                  {selectedFile && <span className="text-[10px] text-emerald-800 font-mono truncate max-w-[120px]">{selectedFile.name}</span>}
                </div>
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
                      {/* Item Title Bar & Approval Toggle */}
                      <div className="flex items-start justify-between border-b border-[#E2E5E9] pb-2.5 font-mono gap-2">
                        <div className="flex items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleApproveItem(idx)}
                            className="text-[#0284C7] hover:scale-110 transition-transform"
                            title={isApproved ? 'Deselect Opportunity' : 'Approve Opportunity'}
                          >
                            {isApproved ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4 text-[#8C929B]" />
                            )}
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
                          <button
                            type="button"
                            onClick={() => setEditingIndex(editingIndex === idx ? null : idx)}
                            className="p-1 rounded bg-[#EEF0F3] hover:bg-[#E2E5E9] border border-[#E2E5E9] text-[#17191D] transition-colors flex items-center gap-1 font-mono text-[10px]"
                            title="Edit fields"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-[#0284C7]" />
                            <span>{editingIndex === idx ? 'Done' : 'Edit'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Phase 3 Duplicate Intelligence Match Banner */}
                      {dupMatch && dupMatch.matchLevel !== 'NO_MATCH' && dupMatch.matchedOpportunity && (
                        <div className={`p-3 rounded-xl font-mono text-xs border space-y-1.5 ${
                          dupMatch.matchLevel === 'POSSIBLE_DUPLICATE'
                            ? 'bg-amber-50 border-amber-200 text-amber-900'
                            : 'bg-sky-50 border-sky-200 text-sky-900'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 font-bold">
                              {dupMatch.matchLevel === 'POSSIBLE_DUPLICATE' ? (
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                              ) : (
                                <GitMerge className="w-4 h-4 text-[#0284C7] shrink-0" />
                              )}
                              <span>
                                {dupMatch.matchLevel === 'POSSIBLE_DUPLICATE'
                                  ? 'POSSIBLE DUPLICATE — REVIEW NEEDED'
                                  : 'DUPLICATE MATCH FOUND'}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold">
                              Match Score: {Math.round(dupMatch.matchScore * 100)}%
                            </span>
                          </div>

                          <p className="text-[11px] text-[#646A73]">
                            Matches existing record: <strong>{dupMatch.matchedOpportunity.organization} - {dupMatch.matchedOpportunity.title}</strong>
                          </p>
                          <p className="text-[10px] italic text-[#8C929B]">Reason: {dupMatch.matchReason}</p>

                          <div className="pt-1 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleMergeOption(idx)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${
                                isMerging
                                  ? 'bg-[#17191D] text-white shadow-xs'
                                  : 'bg-white text-[#17191D] border border-[#E2E5E9] hover:bg-[#EEF0F3]'
                              }`}
                            >
                              <GitMerge className="w-3 h-3" />
                              <span>{isMerging ? 'Action: Merge into Existing Record' : 'Action: Save as New Separate Record'}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Source Evidence Snippet */}
                      {item.evidence_snippet && (
                        <div className="p-2.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-start gap-2 font-mono text-[11px] text-[#646A73]">
                          <Quote className="w-3.5 h-3.5 text-[#0284C7] shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold text-[#17191D] block text-[10px] uppercase">Detected Source Evidence:</span>
                            <p className="italic text-[#17191D]">&quot;{item.evidence_snippet}&quot;</p>
                          </div>
                        </div>
                      )}

                      {/* Source Metadata */}
                      <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono text-[#8C929B] bg-[#F8F9FB] px-2.5 py-1 rounded-lg border border-[#E2E5E9]">
                        <span>Source Type: <strong>{extractionResult?.sourceType || 'FILE'}</strong></span>
                        {selectedFile && <span>File: <strong>{selectedFile.name}</strong></span>}
                        {item.source_identifier && <span>Ref: <strong>{item.source_identifier}</strong></span>}
                      </div>

                      {/* Extracted Fields vs Missing Fields */}
                      {editingIndex === idx ? (
                        <div className="space-y-3 pt-1 font-mono text-xs">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-[#646A73] uppercase">Title</label>
                              <Input
                                type="text"
                                value={item.title}
                                onChange={(e) => handleItemChange(idx, 'title', e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-[#646A73] uppercase">Organization</label>
                              <Input
                                type="text"
                                value={item.organization}
                                onChange={(e) => handleItemChange(idx, 'organization', e.target.value)}
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-[#646A73] uppercase">Description</label>
                            <Textarea
                              rows={2}
                              value={item.description || ''}
                              onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2.5 font-sans">
                          <h4 className="text-xs font-heading font-bold text-[#17191D]">{item.title}</h4>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[11px]">
                            <div>
                              <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Stipend / Salary</span>
                              {item.stipend || item.salary ? (
                                <span className="font-bold text-emerald-700">{item.stipend || item.salary}</span>
                              ) : (
                                <span className="text-[#8C929B] italic">Not specified</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Deadline</span>
                              {item.deadline ? (
                                <span className="font-bold text-[#0284C7]">{item.deadline}</span>
                              ) : (
                                <span className="text-[#8C929B] italic">Not specified</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Location</span>
                              {item.location || item.work_mode ? (
                                <span className="font-bold text-[#17191D]">{item.location || item.work_mode}</span>
                              ) : (
                                <span className="text-[#8C929B] italic">Not specified</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[#8C929B] block text-[10px] uppercase font-bold">Eligibility</span>
                              {item.eligibility ? (
                                <span className="font-bold text-[#17191D] truncate block">{item.eligibility}</span>
                              ) : (
                                <span className="text-[#8C929B] italic">Not specified</span>
                              )}
                            </div>
                          </div>

                          {item.skills_required && item.skills_required.length > 0 && (
                            <div className="flex flex-wrap gap-1 font-mono text-[10px] pt-1">
                              <span className="text-[#8C929B]">Skills:</span>
                              {item.skills_required.map((skill, sIdx) => (
                                <span key={sIdx} className="bg-[#EEF0F3] px-1.5 py-0.5 rounded border border-[#E2E5E9] text-[#17191D]">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </GlassCard>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E2E5E9]">
                <Button type="button" onClick={() => setStep('upload')} variant="outline" size="sm">
                  Back to Upload
                </Button>

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
