'use client';

import { useState } from 'react';
import { Opportunity, OpportunityStatus } from '@/types';
import { updateOpportunityStatus, deleteOpportunity } from '@/app/actions/opportunity-actions';
import { syncOpportunityToGoogleCalendar } from '@/app/actions/calendar-actions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { OpportunityMatchResult } from '@/lib/ai/opportunity-matcher';
import { X, ExternalLink, Trash2, Calendar, CheckCircle2, AlertCircle, Loader2, Clock, Target } from 'lucide-react';

interface OpportunityDetailModalProps {
  opportunity: Opportunity;
  onClose: () => void;
  onEdit: (opportunity: Opportunity) => void;
  matchResult?: OpportunityMatchResult | null;
}

export function OpportunityDetailModal({ opportunity, onClose, onEdit, matchResult }: OpportunityDetailModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    await updateOpportunityStatus(opportunity.id, e.target.value as OpportunityStatus);
  };

  const handleExplicitMarkApplied = async () => {
    await updateOpportunityStatus(opportunity.id, 'APPLIED');
  };

  const handleCalendarClick = () => {
    if (!opportunity.deadline) {
      setStatusMessage({
        type: 'error',
        text: 'No deadline specified for this opportunity. Cannot create a deadline event.',
      });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    if (['NEW', 'SAVED', 'INTERESTED'].includes(opportunity.status)) {
      setShowCalendarModal(true);
    } else {
      executeCalendarSync('CALENDAR_ONLY');
    }
  };

  const executeCalendarSync = async (actionType: 'MARK_APPLIED_AND_CALENDAR' | 'CALENDAR_ONLY') => {
    setIsCalendarSyncing(true);
    setStatusMessage(null);
    setShowCalendarModal(false);

    const res = await syncOpportunityToGoogleCalendar(opportunity.id, actionType);
    setIsCalendarSyncing(false);

    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message || 'Synced to Google Calendar!' });
    } else {
      setStatusMessage({ type: 'error', text: res.error || 'Calendar sync failed.' });
    }
    setTimeout(() => setStatusMessage(null), 5000);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this opportunity record?')) {
      setIsDeleting(true);
      await deleteOpportunity(opportunity.id);
      setIsDeleting(false);
      onClose();
    }
  };

  const initial = opportunity.organization.charAt(0).toUpperCase();
  const isAppliedState = ['APPLIED', 'INTERVIEW', 'SELECTED'].includes(opportunity.status);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop">
      <div
        className="w-full max-w-2xl glass-modal overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#17191D] text-white font-mono font-bold flex items-center justify-center text-xs">
              {initial}
            </div>
            <div>
              <span className="text-[10px] font-mono text-[#8C929B] uppercase font-bold">{opportunity.organization}</span>
              <h3 className="text-sm font-heading font-bold text-[#17191D]">{opportunity.title}</h3>
            </div>
          </div>

          <button onClick={onClose} className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto font-sans text-xs">
          {statusMessage && (
            <div className={`p-3 rounded-xl flex items-center gap-2 text-xs font-mono border ${
              statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[#646A73]">Pipeline Status:</span>
              <Select value={opportunity.status} onChange={handleStatusChange} className="text-xs font-bold py-1">
                <option value="NEW">NEW</option>
                <option value="SAVED">SAVED</option>
                <option value="INTERESTED">INTERESTED</option>
                <option value="APPLIED">APPLIED</option>
                <option value="INTERVIEW">INTERVIEW</option>
                <option value="SELECTED">SELECTED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="NOT_INTERESTED">NOT INTERESTED</option>
                <option value="EXPIRED">EXPIRED</option>
              </Select>
            </div>

            <Badge variant="cyan">{opportunity.type}</Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-[11px]">
            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[#8C929B]">Location & Mode</span>
              <p className="font-bold text-[#17191D]">{opportunity.location || opportunity.work_mode || 'Not specified'}</p>
            </div>
            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[#8C929B]">Stipend / Compensation</span>
              <p className="font-bold text-emerald-700">{opportunity.stipend || opportunity.salary || 'Not specified'}</p>
            </div>
            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[#8C929B]">Application Deadline</span>
              {opportunity.deadline ? (
                <p className="font-bold text-[#0284C7]">{opportunity.deadline}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => onEdit(opportunity)}
                  className="text-xs font-bold text-[#0284C7] hover:underline flex items-center gap-1 mt-0.5"
                >
                  <Clock className="w-3.5 h-3.5 text-[#0284C7]" />
                  <span>+ Set Deadline Date</span>
                </button>
              )}
            </div>
          </div>

          {/* Phase 6 Workflow Actions Bar */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono text-xs">
            {!isAppliedState && (
              <button
                type="button"
                onClick={handleExplicitMarkApplied}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg font-bold flex items-center gap-1.5 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Mark as Applied</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleCalendarClick}
              disabled={isCalendarSyncing}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                opportunity.calendar_synced
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                  : 'bg-white hover:bg-[#EEF0F3] text-[#17191D] border border-[#E2E5E9]'
              }`}
            >
              {isCalendarSyncing ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" />
              ) : opportunity.calendar_synced ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Calendar className="w-4 h-4 text-[#0284C7]" />
              )}
              <span>{opportunity.calendar_synced ? 'Added to Calendar' : 'Add to Google Calendar'}</span>
            </button>
          </div>

          {/* Phase 7 Match Analysis Card */}
          {matchResult && (
            <div className="p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2 font-bold">
                <div className="flex items-center gap-2 text-[#17191D]">
                  <Target className="w-4 h-4 text-[#0284C7]" />
                  <span>PERSONALIZED MATCH ANALYSIS</span>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-bold border ${
                  matchResult.tier === 'STRONG'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : matchResult.tier === 'GOOD'
                    ? 'bg-sky-50 text-sky-800 border-sky-300'
                    : matchResult.tier === 'PARTIAL'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-white text-[#646A73] border-[#E2E5E9]'
                }`}>
                  {matchResult.score}% Match ({matchResult.tier} FIT)
                </span>
              </div>

              <div className="space-y-2">
                {matchResult.matchedReasons.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-emerald-800 block uppercase">Matched Criteria:</span>
                    <ul className="space-y-0.5 pl-2">
                      {matchResult.matchedReasons.map((reason, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-[#17191D]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {matchResult.missingRequirements.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-[#E2E5E9]">
                    <span className="text-[11px] font-bold text-amber-800 block uppercase">Missing / Weak Criteria:</span>
                    <ul className="space-y-0.5 pl-2">
                      {matchResult.missingRequirements.map((req, idx) => (
                        <li key={idx} className="flex items-center gap-1.5 text-[#646A73]">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {opportunity.description && (
            <div className="space-y-1.5">
              <h4 className="font-mono font-bold text-[11px] text-[#646A73] uppercase">Description / Scope</h4>
              <p className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono text-xs whitespace-pre-wrap text-[#17191D]">
                {opportunity.description}
              </p>
            </div>
          )}

          {opportunity.skills_required && opportunity.skills_required.length > 0 && (
            <div className="space-y-1.5 font-mono">
              <h4 className="font-bold text-[11px] text-[#646A73] uppercase">Required Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {opportunity.skills_required.map((skill, idx) => (
                  <span key={idx} className="px-2.5 py-1 bg-[#EEF0F3] border border-[#E2E5E9] rounded-md text-xs font-semibold text-[#17191D]">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(opportunity.eligibility || opportunity.education_requirements || opportunity.branch_requirements) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
              {opportunity.eligibility && (
                <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                  <span className="text-[#8C929B] font-bold text-[10px] uppercase">Eligibility</span>
                  <p className="text-[#17191D]">{opportunity.eligibility}</p>
                </div>
              )}
              {opportunity.education_requirements && (
                <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                  <span className="text-[#8C929B] font-bold text-[10px] uppercase">Education / Degree</span>
                  <p className="text-[#17191D]">{opportunity.education_requirements}</p>
                </div>
              )}
            </div>
          )}

          {opportunity.evidence_snippets && opportunity.evidence_snippets.length > 0 && (
            <div className="space-y-1.5 font-mono">
              <h4 className="font-bold text-[11px] text-[#646A73] uppercase">Collected Evidence Snippets</h4>
              <div className="space-y-1">
                {opportunity.evidence_snippets.map((snip, idx) => (
                  <div key={idx} className="p-2 bg-[#F8F9FB] border border-[#E2E5E9] rounded-lg text-xs italic text-[#17191D]">
                    &quot;{snip}&quot;
                  </div>
                ))}
              </div>
            </div>
          )}

          {opportunity.sources_history && opportunity.sources_history.length > 0 && (
            <div className="space-y-1.5 font-mono">
              <h4 className="font-bold text-[11px] text-[#646A73] uppercase">Source Lineage & Merged History</h4>
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-2 text-[11px]">
                {opportunity.sources_history.map((src, idx) => (
                  <div key={idx} className="flex items-center justify-between border-b border-[#E2E5E9] last:border-0 pb-1 last:pb-0">
                    <span>Source #{idx + 1}: <strong>{src.source_type}</strong> ({src.source_identifier || 'Direct'})</span>
                    <span className="text-[#8C929B]">{new Date(src.timestamp).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between font-mono text-[11px] text-sky-900">
            <span>Primary Source: <strong>{opportunity.source || 'MANUAL'}</strong> | Confidence Rating: <strong>{Math.round((opportunity.confidence || 1.0) * 100)}%</strong></span>
            <span>Recorded {new Date(opportunity.created_at).toLocaleDateString()}</span>
          </div>
        </div>

        <div className="p-4 border-t border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
          <button onClick={handleDelete} disabled={isDeleting} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg flex items-center gap-1 text-xs font-mono">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Record</span>
          </button>

          <div className="flex items-center gap-2">
            {opportunity.application_url && (
              <a
                href={opportunity.application_url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open Application Link in new tab (Does NOT auto-mark applied)"
              >
                <Button variant="primary" size="sm">
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Apply Link</span>
                </Button>
              </a>
            )}
            <Button onClick={() => onEdit(opportunity)} variant="outline" size="sm">
              Edit Record
            </Button>
          </div>
        </div>

        {/* Phase 6 Calendar UX Choice Modal */}
        {showCalendarModal && (
          <div
            className="fixed inset-0 z-50 bg-black/10 flex items-center justify-center p-4"
            onClick={(e) => { e.stopPropagation(); setShowCalendarModal(false); }}
          >
            <div
              className="w-full max-w-sm bg-white border border-[#E2E5E9] rounded-2xl shadow-2xl p-5 space-y-4 font-mono text-xs animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                <div className="flex items-center gap-2 font-bold text-[#17191D]">
                  <Calendar className="w-4 h-4 text-[#0284C7]" />
                  <span>ADD TO GOOGLE CALENDAR</span>
                </div>
                <button onClick={() => setShowCalendarModal(false)} className="text-[#8C929B] hover:text-[#17191D]">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-[#646A73] font-sans">
                Opportunity is currently in <strong>{opportunity.status}</strong> status. Choose how you want to add the deadline event (<strong>{opportunity.deadline}</strong>) to Google Calendar:
              </p>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => executeCalendarSync('MARK_APPLIED_AND_CALENDAR')}
                  className="w-full p-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-left text-xs font-bold text-emerald-900 flex items-center justify-between transition-colors"
                >
                  <span>1. Mark Applied & Add to Calendar</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </button>

                <button
                  type="button"
                  onClick={() => executeCalendarSync('CALENDAR_ONLY')}
                  className="w-full p-2.5 bg-[#F8F9FB] hover:bg-[#EEF0F3] border border-[#E2E5E9] rounded-xl text-left text-xs font-bold text-[#17191D] flex items-center justify-between transition-colors"
                >
                  <span>2. Add to Calendar Only (Keep {opportunity.status})</span>
                  <Calendar className="w-4 h-4 text-[#0284C7]" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCalendarModal(false)}
                className="w-full p-2 text-center text-xs font-bold text-[#8C929B] hover:text-[#17191D]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
