'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Opportunity, StudentProfile } from '@/types';
import { getOpportunities } from '@/app/actions/opportunity-actions';
import { getStudentProfile } from '@/app/actions/profile-actions';
import { calculateOpportunityMatch, OpportunityMatchResult } from '@/lib/ai/opportunity-matcher';
import { OpportunityCard } from './opportunity-card';
import { OpportunityDetailModal } from './opportunity-detail-modal';
import { OpportunityFormModal } from './opportunity-form-modal';
import { FileUploadModal } from './file-upload-modal';
import { GmailSyncModal } from './gmail-sync-modal';
import { getGmailConnectionStatus, getGmailAuthUrl, disconnectGmail } from '@/app/actions/gmail-actions';
import { Compass, Plus, Search, Sparkles, Upload, Mail, RefreshCw, LogOut, Calendar, CheckCircle2, Clock, User, Filter, Target } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { useEffect, useMemo } from 'react';

interface OpportunitiesClientProps {
  initialOpportunities: Opportunity[];
}

export function OpportunitiesClient({ initialOpportunities }: OpportunitiesClientProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(initialOpportunities);
  const [activeTab, setActiveTab] = useState<'all' | 'recommended' | 'new' | 'closing' | 'saved' | 'applied'>('all');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedWorkMode, setSelectedWorkMode] = useState<string>('ALL');

  // Modal & Gmail States
  const [inspectingOpportunity, setInspectingOpportunity] = useState<Opportunity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isGmailSyncOpen, setIsGmailSyncOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [gmailStatus, setGmailStatus] = useState<{
    isConnected: boolean;
    emailAddress?: string;
    lastSyncedAt?: string | null;
    checkpoint?: import('@/types').GmailSyncCheckpoint | null;
  }>({ isConnected: false });

  // Student Profile & Match Engine State
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [quickMatchFilter, setQuickMatchFilter] = useState<'ALL' | 'STRONG_MATCH' | 'SKILL_MATCH' | 'ELIGIBILITY_MATCH' | 'CLOSING_SOON'>('ALL');

  useEffect(() => {
    getGmailConnectionStatus().then(setGmailStatus);
    getStudentProfile().then(setStudentProfile);
  }, []);

  const matchesMap = useMemo(() => {
    const map = new Map<string, OpportunityMatchResult>();
    opportunities.forEach((opp) => {
      map.set(opp.id, calculateOpportunityMatch(opp, studentProfile));
    });
    return map;
  }, [opportunities, studentProfile]);

  const handleConnectGmail = async () => {
    try {
      const url = await getGmailAuthUrl(window.location.origin);
      window.location.href = url;
    } catch (err: any) {
      alert(err.message || 'Failed to initiate Google OAuth. Check GMAIL_CLIENT_ID configuration in Settings.');
    }
  };

  const handleDisconnectGmail = async () => {
    if (confirm('Disconnect Gmail integration? stored tokens will be removed from Vault.')) {
      await disconnectGmail();
      setGmailStatus({ isConnected: false });
    }
  };

  const refreshData = async () => {
    const updated = await getOpportunities();
    setOpportunities(updated);
    const updatedProfile = await getStudentProfile();
    setStudentProfile(updatedProfile);
  };

  // Filter Logic
  const filteredOpportunities = opportunities.filter((item) => {
    const matchRes = matchesMap.get(item.id);

    // Search query filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase().trim();
      const matches =
        item.title.toLowerCase().includes(q) ||
        item.organization.toLowerCase().includes(q) ||
        (item.role && item.role.toLowerCase().includes(q)) ||
        (item.skills_required && item.skills_required.some((s) => s.toLowerCase().includes(q)));
      if (!matches) return false;
    }

    // Type filter
    if (selectedType !== 'ALL' && item.type !== selectedType) return false;

    // Status filter
    if (selectedStatus !== 'ALL' && item.status !== selectedStatus) return false;

    // Work Mode filter
    if (selectedWorkMode !== 'ALL' && item.work_mode !== selectedWorkMode) return false;

    // Quick Match Filters
    if (quickMatchFilter === 'STRONG_MATCH' && matchRes?.tier !== 'STRONG') return false;
    if (quickMatchFilter === 'SKILL_MATCH' && (!matchRes?.skillsOverlap || matchRes.skillsOverlap.length === 0)) return false;
    if (quickMatchFilter === 'ELIGIBILITY_MATCH' && !matchRes?.matchedReasons.some((r) => r.includes('academic'))) return false;
    if (quickMatchFilter === 'CLOSING_SOON') {
      if (!item.deadline) return false;
      const diff = new Date(item.deadline).getTime() - Date.now();
      if (diff < 0 || diff > 7 * 24 * 60 * 60 * 1000) return false;
    }

    // Tab Filters
    if (activeTab === 'new') return item.status === 'NEW';
    if (activeTab === 'saved') return item.status === 'SAVED';
    if (activeTab === 'applied') return item.status === 'APPLIED' || item.status === 'INTERVIEW' || item.status === 'SELECTED';
    if (activeTab === 'closing') {
      if (!item.deadline) return false;
      const diff = new Date(item.deadline).getTime() - Date.now();
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }

    return true;
  });

  // Rank recommendations by Match Score when on "Recommended for You" tab
  const displayOpportunities = useMemo(() => {
    if (activeTab === 'recommended') {
      return [...filteredOpportunities].sort((a, b) => {
        const scoreA = matchesMap.get(a.id)?.score || 0;
        const scoreB = matchesMap.get(b.id)?.score || 0;
        return scoreB - scoreA;
      });
    }
    return filteredOpportunities;
  }, [filteredOpportunities, activeTab, matchesMap]);

  const activePipelineCount = opportunities.filter((o) => ['INTERESTED', 'APPLIED', 'INTERVIEW'].includes(o.status)).length;
  const closingSoonCount = opportunities.filter((o) => {
    if (!o.deadline) return false;
    const diff = new Date(o.deadline).getTime() - Date.now();
    return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<Compass className="w-5 h-5 text-[#0284C7]" />}
        title="Opportunity Intelligence Workspace"
        description="Track internships, jobs, hackathons, scholarships, and fellowships connected with your learning OS."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {gmailStatus.isConnected ? (
              <div className="flex items-center gap-2">
                <div
                  onClick={handleDisconnectGmail}
                  className="px-3 py-1.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-xs font-mono font-bold text-[#17191D] flex items-center gap-1.5 cursor-pointer hover:bg-rose-50 hover:border-rose-200 hover:text-rose-700 transition-all"
                  title="Click to Disconnect Gmail"
                >
                  <Mail className="w-3.5 h-3.5 text-rose-600" />
                  <span className="max-w-[140px] truncate">{gmailStatus.emailAddress || 'Connected'}</span>
                </div>

                <button
                  onClick={handleConnectGmail}
                  className="px-2 py-1 bg-white hover:bg-sky-50 text-[#0284C7] border border-[#0284C7]/30 rounded text-[11px] font-mono font-bold flex items-center gap-1 transition-colors"
                  title="Re-authorize Google OAuth to grant Calendar permissions"
                >
                  <span>Re-authorize Calendar</span>
                </button>

                <button
                  onClick={() => setIsGmailSyncOpen(true)}
                  className="px-3 py-1.5 bg-white hover:bg-[#EEF0F3] border border-[#E2E5E9] rounded-xl text-xs font-mono font-bold text-[#17191D] flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3 h-3 text-[#0284C7]" />
                  <span>Sync Gmail</span>
                </button>
              </div>
            ) : (
              <Button onClick={handleConnectGmail} variant="outline" size="sm">
                <Mail className="w-3.5 h-3.5 text-rose-600" />
                <span>Connect Gmail</span>
              </Button>
            )}

            <Link href="/profile">
              <Button variant="outline" size="sm">
                <User className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Student Profile</span>
              </Button>
            </Link>

            <Button onClick={() => setIsUploadOpen(true)} variant="outline" size="sm">
              <Upload className="w-3.5 h-3.5 text-[#0284C7]" />
              <span>Import File / Chat</span>
            </Button>

            <Button onClick={() => { setEditingOpportunity(null); setIsFormOpen(true); }} variant="primary" size="md">
              <Plus className="w-4 h-4" />
              <span>Add Record</span>
            </Button>
          </div>
        }
      />

      {/* Metric KPI Summary Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        <GlassCard>
          <div className="text-[11px] text-[#646A73] uppercase font-bold">Total Discovered</div>
          <div className="text-3xl font-bold text-[#17191D] mt-1">{opportunities.length}</div>
          <span className="text-[10px] text-[#8C929B] mt-0.5 block">Stored records</span>
        </GlassCard>

        <GlassCard>
          <div className="text-[11px] text-[#646A73] uppercase font-bold">Active Applications</div>
          <div className="text-3xl font-bold text-[#0284C7] mt-1">{activePipelineCount}</div>
          <span className="text-[10px] text-[#8C929B] mt-0.5 block">Applied & Interviewing</span>
        </GlassCard>

        <GlassCard>
          <div className="text-[11px] text-[#646A73] uppercase font-bold">Closing Soon</div>
          <div className="text-3xl font-bold text-amber-700 mt-1">{closingSoonCount}</div>
          <span className="text-[10px] text-[#8C929B] mt-0.5 block">Deadline &lt; 7 days</span>
        </GlassCard>

        <GlassCard>
          <div className="text-[11px] text-[#646A73] uppercase font-bold">Needs Review Queue</div>
          <div className="text-3xl font-bold text-rose-700 mt-1">
            {opportunities.filter((o) => o.needs_review).length}
          </div>
          <span className="text-[10px] text-[#8C929B] mt-0.5 block">Awaiting confirmation</span>
        </GlassCard>
      </div>

      {/* Phase 4B Gmail Incremental Monitoring Status Bar */}
      {gmailStatus.isConnected && (
        <div className="p-3 bg-white border border-[#E2E5E9] rounded-xl flex flex-wrap items-center justify-between font-mono text-xs shadow-xs gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-bold text-[#17191D]">Gmail Incremental Monitoring: ACTIVE</span>
            <span className="text-[#8C929B] text-[11px]">(Hourly Background Sync Fallback)</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <div>
              <span className="text-[#8C929B]">Last Sync: </span>
              <strong className="text-[#17191D]">
                {gmailStatus.lastSyncedAt ? new Date(gmailStatus.lastSyncedAt).toLocaleTimeString() : 'Never'}
              </strong>
            </div>

            {gmailStatus.checkpoint && (
              <>
                <div>
                  <span className="text-[#8C929B]">Emails Processed: </span>
                  <strong className="text-[#0284C7]">{gmailStatus.checkpoint.total_emails_processed}</strong>
                </div>

                <div>
                  <span className="text-[#8C929B]">Detected: </span>
                  <strong className="text-[#17191D]">{gmailStatus.checkpoint.total_opportunities_detected}</strong>
                </div>

                <div>
                  <span className="text-[#8C929B]">Auto-Saved: </span>
                  <strong className="text-emerald-700">{gmailStatus.checkpoint.total_opportunities_saved}</strong>
                </div>

                <div>
                  <span className="text-[#8C929B]">Merged: </span>
                  <strong className="text-indigo-700">{gmailStatus.checkpoint.total_duplicates_merged}</strong>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Phase 6 Upcoming Calendar Deadlines List Panel */}
      {opportunities.some((o) => o.deadline) && (
        <GlassCard className="p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2 text-xs font-bold text-[#17191D]">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#0284C7]" />
              <span>UPCOMING CALENDAR DEADLINES & SYNC STATUS</span>
            </div>
            <span className="text-[11px] text-[#8C929B]">
              {opportunities.filter((o) => o.deadline && o.calendar_synced).length} / {opportunities.filter((o) => o.deadline).length} Synced to Google Calendar
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {opportunities
              .filter((o) => o.deadline)
              .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
              .slice(0, 6)
              .map((item) => (
                <div
                  key={item.id}
                  onClick={() => setInspectingOpportunity(item)}
                  className="p-2.5 bg-[#F8F9FB] hover:bg-white border border-[#E2E5E9] rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-[#0284C7]"
                >
                  <div className="truncate">
                    <span className="text-[10px] text-[#8C929B] font-bold block uppercase truncate">{item.organization}</span>
                    <strong className="text-xs text-[#17191D] truncate block">{item.title}</strong>
                    <span className="text-[10px] text-[#0284C7] font-bold flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3 text-amber-600" />
                      {item.deadline}
                    </span>
                  </div>

                  {item.calendar_synced ? (
                    <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded text-[10px] font-bold flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Added</span>
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-white text-[#646A73] border border-[#E2E5E9] rounded text-[10px] font-bold shrink-0">
                      Not Synced
                    </span>
                  )}
                </div>
              ))}
          </div>
        </GlassCard>
      )}

      {/* Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-[#E2E5E9] pb-3 gap-3">
        <div className="flex flex-wrap items-center bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl p-1 text-xs font-mono">
          {[
            { id: 'all', label: 'All Records' },
            { id: 'recommended', label: 'Recommended for You' },
            { id: 'new', label: 'New' },
            { id: 'closing', label: 'Closing Soon' },
            { id: 'saved', label: 'Saved' },
            { id: 'applied', label: 'Applied' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-white text-[#17191D] shadow-xs border border-[#E2E5E9]'
                  : 'text-[#646A73] hover:text-[#17191D]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Multi-Filter & Search Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#8C929B] absolute left-2.5 top-2.5" />
            <Input
              type="text"
              placeholder="Search keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 py-1 w-44 text-xs"
            />
          </div>

          <Select value={selectedType} onChange={(e) => setSelectedType(e.target.value)} className="py-1 text-xs">
            <option value="ALL">All Types</option>
            <option value="INTERNSHIP">Internship</option>
            <option value="JOB">Job</option>
            <option value="HACKATHON">Hackathon</option>
            <option value="SCHOLARSHIP">Scholarship</option>
            <option value="FELLOWSHIP">Fellowship</option>
            <option value="COMPETITION">Competition</option>
            <option value="WORKSHOP">Workshop</option>
            <option value="CERTIFICATION">Certification</option>
            <option value="RESEARCH">Research</option>
          </Select>

          <Select value={selectedWorkMode} onChange={(e) => setSelectedWorkMode(e.target.value)} className="py-1 text-xs">
            <option value="ALL">All Modes</option>
            <option value="REMOTE">Remote</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ON_SITE">On Site</option>
          </Select>
        </div>
      </div>

      {/* Phase 7 Match Quick Filters Bar */}
      <div className="flex flex-wrap items-center gap-2 font-mono text-xs p-2.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl">
        <span className="text-[11px] font-bold text-[#646A73] uppercase flex items-center gap-1.5 mr-1">
          <Filter className="w-3.5 h-3.5 text-[#0284C7]" />
          <span>Match Filters:</span>
        </span>

        {[
          { id: 'ALL', label: 'All Opportunities' },
          { id: 'STRONG_MATCH', label: 'Strong Matches (80%+)' },
          { id: 'SKILL_MATCH', label: 'Skill Match' },
          { id: 'ELIGIBILITY_MATCH', label: 'Eligibility Match' },
          { id: 'CLOSING_SOON', label: 'Closing Soon' },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setQuickMatchFilter(f.id as any)}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all border ${
              quickMatchFilter === f.id
                ? 'bg-[#0284C7] text-white border-[#0284C7]'
                : 'bg-white text-[#646A73] border-[#E2E5E9] hover:bg-[#EEF0F3]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Opportunities List / Grid */}
      {displayOpportunities.length === 0 ? (
        <div className="p-12 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B] space-y-2">
          <p>No opportunity records found matching your active filters.</p>
          <Button onClick={() => { setEditingOpportunity(null); setIsFormOpen(true); }} variant="outline" size="sm">
            Add Your First Opportunity Record
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayOpportunities.map((op) => (
            <OpportunityCard
              key={op.id}
              opportunity={op}
              matchResult={matchesMap.get(op.id)}
              onInspect={(item) => setInspectingOpportunity(item)}
            />
          ))}
        </div>
      )}

      {/* Detail Inspector Modal */}
      {inspectingOpportunity && (
        <OpportunityDetailModal
          opportunity={inspectingOpportunity}
          matchResult={matchesMap.get(inspectingOpportunity.id)}
          onClose={() => setInspectingOpportunity(null)}
          onEdit={(item) => {
            setInspectingOpportunity(null);
            setEditingOpportunity(item);
            setIsFormOpen(true);
          }}
        />
      )}

      {/* Form Modal */}
      {isFormOpen && (
        <OpportunityFormModal
          initialData={editingOpportunity}
          onClose={() => { setIsFormOpen(false); setEditingOpportunity(null); }}
          onSaved={refreshData}
        />
      )}

      {/* File Upload & AI Opportunity Extractor Modal */}
      {isUploadOpen && (
        <FileUploadModal
          onClose={() => setIsUploadOpen(false)}
          onSuccess={refreshData}
        />
      )}

      {/* Gmail Manual Sync Modal */}
      {isGmailSyncOpen && (
        <GmailSyncModal
          onClose={() => setIsGmailSyncOpen(false)}
          onSuccess={refreshData}
        />
      )}
    </div>
  );
}
