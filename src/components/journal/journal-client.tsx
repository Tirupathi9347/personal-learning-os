'use client';

import { useState } from 'react';
import { JournalEntry } from '@/types';
import { saveJournalEntry, importTodayCommitsToJournal, importTodayLeetCodeToJournal, getJournalEntries } from '@/app/actions/journal-actions';
import { BookOpen, Save, Calendar, Clock, Loader2, CheckCircle2, GitCommit, Code2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';

interface JournalClientProps {
  initialEntries: JournalEntry[];
}

export function JournalClient({ initialEntries }: JournalClientProps) {
  const [entries, setEntries] = useState<JournalEntry[]>(initialEntries);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayEntry = entries.find((e) => e.entry_date === todayStr);

  // Form State for Today's Entry
  const [rawContent, setRawContent] = useState(todayEntry?.raw_content || '');
  const [learningSummary, setLearningSummary] = useState(todayEntry?.learning_summary || '');
  const [reflection, setReflection] = useState(todayEntry?.reflection || '');
  const [tomorrowPlan, setTomorrowPlan] = useState(todayEntry?.tomorrow_plan || '');
  const [timeSpent, setTimeSpent] = useState<number>(todayEntry?.time_spent_minutes || 0);

  const [isSaving, setIsSaving] = useState(false);
  const [isImportingGh, setIsImportingGh] = useState(false);
  const [isImportingLc, setIsImportingLc] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const refreshEntries = async () => {
    const updated = await getJournalEntries();
    setEntries(updated);
    const updatedToday = updated.find((e) => e.entry_date === todayStr);
    if (updatedToday) {
      setRawContent(updatedToday.raw_content || '');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawContent.trim() || isSaving) return;

    setIsSaving(true);
    setStatusMsg(null);

    const res = await saveJournalEntry({
      raw_content: rawContent,
      learning_summary: learningSummary || null,
      reflection: reflection || null,
      tomorrow_plan: tomorrowPlan || null,
      time_spent_minutes: Number(timeSpent) || 0,
    });

    setIsSaving(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: 'Journal entry saved successfully!' });
      setTimeout(() => setStatusMsg(null), 3000);
      refreshEntries();
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to save journal.' });
    }
  };

  const handleImportGitHubCommits = async () => {
    setIsImportingGh(true);
    setStatusMsg(null);

    const res = await importTodayCommitsToJournal();
    setIsImportingGh(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: res.message });
      refreshEntries();
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  const handleImportLeetCodeSubmissions = async () => {
    setIsImportingLc(true);
    setStatusMsg(null);

    const res = await importTodayLeetCodeToJournal();
    setIsImportingLc(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: res.message });
      refreshEntries();
    } else {
      setStatusMsg({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<BookOpen className="w-5 h-5 text-emerald-600" />}
        title="Daily Learning Journal Workspace"
        description="Record structured daily summaries, reflections, and synced activity logs."
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={handleImportGitHubCommits}
              disabled={isImportingGh}
              variant="outline"
              size="sm"
            >
              {isImportingGh ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5 text-[#0284C7]" />}
              <span>Import GitHub</span>
            </Button>

            <Button
              onClick={handleImportLeetCodeSubmissions}
              disabled={isImportingLc}
              variant="outline"
              size="sm"
            >
              {isImportingLc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Code2 className="w-3.5 h-3.5 text-amber-600" />}
              <span>Import LeetCode</span>
            </Button>
          </div>
        }
      />

      {statusMsg && (
        <div className={`p-3.5 rounded-xl flex items-center gap-2 text-xs font-mono border ${
          statusMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Today's Entry Form */}
      <GlassCard>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#17191D]">
              <Calendar className="w-4 h-4 text-[#0284C7]" />
              <span>Today&apos;s Record ({todayStr})</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-[#8C929B]" />
              <Input
                type="number"
                placeholder="Mins spent"
                value={timeSpent || ''}
                onChange={(e) => setTimeSpent(Number(e.target.value))}
                className="w-28 text-center"
              />
              <span className="text-xs font-mono text-[#646A73]">mins</span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">
                Raw Daily Log / What I did today *
              </label>
              <Textarea
                rows={4}
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                placeholder="Today I completed Python decorators, worked on project AeroHub, solved 5 LeetCode problems..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">
                  Learning Summary (Key Concepts)
                </label>
                <Textarea
                  rows={2}
                  value={learningSummary}
                  onChange={(e) => setLearningSummary(e.target.value)}
                  placeholder="Learned Python closures and decorator wrapping..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">
                  Tomorrow&apos;s Plan
                </label>
                <Textarea
                  rows={2}
                  value={tomorrowPlan}
                  onChange={(e) => setTomorrowPlan(e.target.value)}
                  placeholder="Revise CNN backpropagation and solve 3 LeetCode tree problems..."
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-[#E2E5E9]">
            <span className="text-[11px] font-mono text-[#8C929B]">Auto-saved fields preserve your daily record.</span>

            <Button type="submit" disabled={isSaving || !rawContent.trim()} variant="primary" size="md">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Today&apos;s Journal</span>
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Journal History */}
      <div className="space-y-3">
        <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase tracking-wider">Journal History</h3>

        {entries.length === 0 ? (
          <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
            No journal entries logged yet.
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <GlassCard key={entry.id} className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                  <span className="text-xs font-mono font-bold text-emerald-700">{entry.entry_date}</span>
                  <span className="text-[10px] font-mono text-[#646A73]">{entry.time_spent_minutes || 0} mins logged</span>
                </div>
                <p className="text-xs text-[#17191D] whitespace-pre-wrap font-mono bg-[#F8F9FB] p-3 rounded-lg border border-[#E2E5E9]">{entry.raw_content}</p>
                {entry.tomorrow_plan && (
                  <div className="pt-2 border-t border-[#E2E5E9]">
                    <span className="text-[10px] font-mono font-bold text-[#0284C7]">Tomorrow&apos;s Plan: </span>
                    <span className="text-xs text-[#646A73] font-sans">{entry.tomorrow_plan}</span>
                  </div>
                )}
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
