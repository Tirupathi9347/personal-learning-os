'use client';

import { useState } from 'react';
import { Opportunity, OpportunityStatus } from '@/types';
import { updateOpportunityStatus } from '@/app/actions/opportunity-actions';
import { syncOpportunityToGoogleCalendar } from '@/app/actions/calendar-actions';
import { GlassCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/input';
import { MapPin, DollarSign, Eye, Clock, ExternalLink, Calendar, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react';

import { OpportunityMatchResult } from '@/lib/ai/opportunity-matcher';

interface OpportunityCardProps {
  opportunity: Opportunity;
  onInspect: (opportunity: Opportunity) => void;
  matchResult?: OpportunityMatchResult | null;
}

export function OpportunityCard({ opportunity, onInspect, matchResult }: OpportunityCardProps) {
  const [currentStatus, setCurrentStatus] = useState<OpportunityStatus>(opportunity.status);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const newStatus = e.target.value as OpportunityStatus;
    setCurrentStatus(newStatus);
    await updateOpportunityStatus(opportunity.id, newStatus);
  };

  const handleExplicitMarkApplied = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentStatus('APPLIED');
    await updateOpportunityStatus(opportunity.id, 'APPLIED');
  };

  const handleCalendarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!opportunity.deadline) {
      setStatusMessage({
        type: 'error',
        text: 'No deadline specified for this opportunity. Cannot create a deadline event.',
      });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    // UX Rule: If status is NEW, SAVED, or INTERESTED, prompt for choice
    if (['NEW', 'SAVED', 'INTERESTED'].includes(opportunity.status)) {
      setShowCalendarModal(true);
    } else {
      // Directly sync to calendar for APPLIED/INTERVIEW/SELECTED
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

  const initial = opportunity.organization.charAt(0).toUpperCase();

  const isClosingSoon = opportunity.deadline ? (
    new Date(opportunity.deadline).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000 &&
    new Date(opportunity.deadline).getTime() >= Date.now()
  ) : false;

  const isAppliedState = ['APPLIED', 'INTERVIEW', 'SELECTED'].includes(opportunity.status);

  return (
    <GlassCard className="p-4 space-y-3 flex flex-col justify-between group hover:border-[#0284C7]/40 transition-all relative">
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#17191D] text-white font-mono font-bold text-sm flex items-center justify-center shrink-0 shadow-xs">
              {initial}
            </div>
            <div>
              <h4 className="text-xs font-mono font-bold text-[#646A73] uppercase tracking-wider">
                {opportunity.organization}
              </h4>
              <h3 className="text-sm font-heading font-bold text-[#17191D] group-hover:text-[#0284C7] transition-colors line-clamp-1">
                {opportunity.title}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {matchResult && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                matchResult.tier === 'STRONG'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : matchResult.tier === 'GOOD'
                  ? 'bg-sky-50 text-sky-800 border-sky-300'
                  : matchResult.tier === 'PARTIAL'
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-[#F8F9FB] text-[#646A73] border-[#E2E5E9]'
              }`}>
                {matchResult.score}% Match
              </span>
            )}

            <Badge variant={opportunity.type === 'INTERNSHIP' ? 'cyan' : opportunity.type === 'JOB' ? 'indigo' : 'amber'}>
              {opportunity.type}
            </Badge>
          </div>
        </div>

        {statusMessage && (
          <div className={`p-2 rounded-lg text-[11px] font-mono flex items-center gap-1.5 border ${
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}>
            {statusMessage.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
            <span className="truncate">{statusMessage.text}</span>
          </div>
        )}

        {opportunity.skills_required && opportunity.skills_required.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {opportunity.skills_required.slice(0, 4).map((skill, idx) => (
              <span key={idx} className="text-[10px] font-mono text-[#646A73] bg-[#EEF0F3] px-2 py-0.5 rounded border border-[#E2E5E9]">
                {skill}
              </span>
            ))}
            {opportunity.skills_required.length > 4 && (
              <span className="text-[10px] font-mono text-[#8C929B] self-center">
                +{opportunity.skills_required.length - 4} more
              </span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#646A73] pt-1 border-t border-[#E2E5E9]">
          <div className="flex items-center gap-1.5 truncate">
            <MapPin className="w-3 h-3 text-[#0284C7] shrink-0" />
            <span className="truncate">{opportunity.location || opportunity.work_mode || 'Not specified'}</span>
          </div>

          <div className="flex items-center gap-1.5 truncate">
            <DollarSign className="w-3 h-3 text-emerald-600 shrink-0" />
            <span className="truncate">{opportunity.stipend || opportunity.salary || 'Unspecified'}</span>
          </div>
        </div>

        {/* Phase 6 Workflow Actions: External Link & Mark Applied */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {opportunity.application_url && (
            <a
              href={opportunity.application_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 bg-white hover:bg-sky-50 text-[#0284C7] border border-[#0284C7]/30 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-colors"
              title="Open Application URL in new tab (Does NOT auto-mark applied)"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Apply Link</span>
            </a>
          )}

          {!isAppliedState && (
            <button
              type="button"
              onClick={handleExplicitMarkApplied}
              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Mark as Applied</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCalendarClick}
            disabled={isCalendarSyncing}
            className={`px-2 py-1 rounded text-[10px] font-mono font-bold flex items-center gap-1 transition-all ${
              opportunity.calendar_synced
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-white hover:bg-[#EEF0F3] text-[#17191D] border border-[#E2E5E9]'
            }`}
          >
            {isCalendarSyncing ? (
              <Loader2 className="w-3 h-3 animate-spin text-[#0284C7]" />
            ) : opportunity.calendar_synced ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            ) : (
              <Calendar className="w-3 h-3 text-[#0284C7]" />
            )}
            <span>{opportunity.calendar_synced ? 'Added to Calendar' : 'Add to Calendar'}</span>
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-[#E2E5E9] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {opportunity.deadline ? (
            <span className={`text-[10px] font-mono flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
              isClosingSoon ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'text-[#8C929B]'
            }`}>
              <Clock className="w-3 h-3 text-amber-600" />
              {opportunity.deadline}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onInspect(opportunity)}
              className="text-[10px] font-mono text-[#0284C7] hover:underline font-bold flex items-center gap-1"
              title="Inspect & Edit Record to Add Deadline"
            >
              <Clock className="w-3 h-3 text-[#0284C7]" />
              <span>+ Add Deadline</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Select
            value={currentStatus}
            onChange={handleStatusChange}
            className="text-[10px] font-mono font-bold uppercase py-0.5 px-2 bg-white text-[#17191D]"
          >
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

          <button
            onClick={() => onInspect(opportunity)}
            className="p-1.5 bg-[#EEF0F3] hover:bg-[#E2E5E9] border border-[#E2E5E9] rounded-lg text-[#17191D] transition-all"
            title="Inspect Opportunity Record"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
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
    </GlassCard>
  );
}
