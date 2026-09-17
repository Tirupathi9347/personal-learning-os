'use client';

import { useState, useEffect, useRef } from 'react';
import { TimeSession, TimeSessionCategory, Task, Project, Skill } from '@/types';
import { createTimeSession, deleteTimeSession } from '@/app/actions/time-actions';
import { Clock, Play, Pause, Square, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const CATEGORIES: TimeSessionCategory[] = ['Learning', 'Coding', 'Project', 'Research', 'Course', 'Practice'];

const CATEGORY_COLORS: Record<TimeSessionCategory, string> = {
  Learning: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Coding: 'bg-sky-50 text-sky-800 border-sky-200',
  Project: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  Research: 'bg-amber-50 text-amber-800 border-amber-200',
  Course: 'bg-purple-50 text-purple-800 border-purple-200',
  Practice: 'bg-rose-50 text-rose-800 border-rose-200',
};

interface TimeClientProps {
  initialSessions: TimeSession[];
  initialTotals: {
    todayMinutes: number;
    weeklyMinutes: number;
    categoryTotals: Record<TimeSessionCategory, number>;
  };
  tasks: Task[];
  projects: Project[];
  skills: Skill[];
}

export function TimeClient({ initialSessions, initialTotals, tasks, projects, skills }: TimeClientProps) {
  const [sessions, setSessions] = useState<TimeSession[]>(initialSessions);
  const [totals, setTotals] = useState(initialTotals);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Focus Stopwatch State
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<TimeSessionCategory>('Coding');
  const [timerDescription, setTimerDescription] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [isSavingSession, setIsSavingSession] = useState(false);

  // Manual Form State
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualDuration, setManualDuration] = useState<number>(30);
  const [manualCategory, setManualCategory] = useState<TimeSessionCategory>('Learning');
  const [manualDescription, setManualDescription] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const [manualTaskId, setManualTaskId] = useState('');
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualSkillId, setManualSkillId] = useState('');

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    try {
      const savedTimer = localStorage.getItem('active_focus_timer');
      if (savedTimer) {
        const parsed = JSON.parse(savedTimer);
        let elapsed = parsed.elapsedSeconds || 0;

        if (parsed.isRunning && parsed.startTime) {
          const now = Date.now();
          const additionalSecs = Math.floor((now - parsed.startTime) / 1000);
          elapsed += Math.max(0, additionalSecs);
        }

        setSeconds(elapsed);
        setIsRunning(parsed.isRunning);
        if (parsed.category) setSelectedCategory(parsed.category);
        if (parsed.description) setTimerDescription(parsed.description);
        if (parsed.taskId) setSelectedTaskId(parsed.taskId);
        if (parsed.projectId) setSelectedProjectId(parsed.projectId);
        if (parsed.skillId) setSelectedSkillId(parsed.skillId);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'active_focus_timer',
        JSON.stringify({
          elapsedSeconds: seconds,
          isRunning,
          startTime: isRunning ? Date.now() : null,
          category: selectedCategory,
          description: timerDescription,
          taskId: selectedTaskId,
          projectId: selectedProjectId,
          skillId: selectedSkillId,
        })
      );
    } catch {
      // Ignore
    }
  }, [seconds, isRunning, selectedCategory, timerDescription, selectedTaskId, selectedProjectId, selectedSkillId]);

  const handleStartPause = () => {
    setIsRunning(!isRunning);
  };

  const handleResetStopwatch = () => {
    setIsRunning(false);
    setSeconds(0);
    localStorage.removeItem('active_focus_timer');
  };

  const handleStopAndSave = async () => {
    if (seconds < 10) {
      setStatusMsg({ type: 'error', text: 'Session must be at least 10 seconds to save.' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }

    setIsSavingSession(true);
    setStatusMsg(null);

    const durationMins = Math.max(1, Math.round(seconds / 60));

    const res = await createTimeSession({
      category: selectedCategory,
      duration_minutes: durationMins,
      description: timerDescription || `${selectedCategory} focus session`,
      task_id: selectedTaskId || null,
      project_id: selectedProjectId || null,
      skill_id: selectedSkillId || null,
    });

    setIsSavingSession(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: `Saved ${durationMins} min focus session under "${selectedCategory}"!` });
      setTimeout(() => setStatusMsg(null), 3000);
      handleResetStopwatch();
      setTimerDescription('');
      if (res.data) {
        setSessions([res.data, ...sessions]);
        setTotals((prev) => ({
          ...prev,
          todayMinutes: prev.todayMinutes + durationMins,
          weeklyMinutes: prev.weeklyMinutes + durationMins,
        }));
      }
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to save session.' });
    }
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDuration || manualDuration <= 0) return;

    setIsSavingSession(true);
    setStatusMsg(null);

    const res = await createTimeSession({
      category: manualCategory,
      duration_minutes: manualDuration,
      description: manualDescription || `Manual ${manualCategory} session`,
      session_date: manualDate,
      task_id: manualTaskId || null,
      project_id: manualProjectId || null,
      skill_id: manualSkillId || null,
    });

    setIsSavingSession(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: `Saved manual ${manualDuration} min session!` });
      setTimeout(() => setStatusMsg(null), 3000);
      setShowManualForm(false);
      setManualDescription('');
      if (res.data) {
        setSessions([res.data, ...sessions]);
        setTotals((prev) => ({
          ...prev,
          todayMinutes: prev.todayMinutes + manualDuration,
          weeklyMinutes: prev.weeklyMinutes + manualDuration,
        }));
      }
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to save manual entry.' });
    }
  };

  const handleDeleteSession = async (id: string) => {
    setSessions(sessions.filter((s) => s.id !== id));
    await deleteTimeSession(id);
  };

  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatMinsToHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} mins`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<Clock className="w-5 h-5 text-[#0284C7]" />}
        title="Focus Timer Workspace"
        description="Track active study sessions, categorize work, and auto-accumulate focus time into your journal."
        actions={
          <Button
            onClick={() => setShowManualForm(!showManualForm)}
            variant="outline"
            size="sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showManualForm ? 'Hide Form' : 'Log Manual Entry'}</span>
          </Button>
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

      {/* Daily & Weekly Totals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <GlassCard>
          <span className="text-xs font-mono font-bold text-[#646A73] uppercase tracking-wider">Today&apos;s Focus Time</span>
          <div className="text-3xl font-mono font-bold text-[#0284C7] mt-2">{formatMinsToHours(totals.todayMinutes)}</div>
          <span className="text-[10px] font-mono text-[#8C929B] mt-1 block">Auto-synced to Daily Journal</span>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-mono font-bold text-[#646A73] uppercase tracking-wider">Past 7 Days Total</span>
          <div className="text-3xl font-mono font-bold text-indigo-700 mt-2">{formatMinsToHours(totals.weeklyMinutes)}</div>
          <span className="text-[10px] font-mono text-[#8C929B] mt-1 block">Rolling weekly cumulative</span>
        </GlassCard>

        <GlassCard>
          <span className="text-xs font-mono font-bold text-[#646A73] uppercase tracking-wider">Top Focus Category</span>
          <div className="text-3xl font-heading font-bold text-emerald-700 mt-2">
            {Object.entries(totals.categoryTotals).reduce((a, b) => (b[1] > a[1] ? b : a), ['Coding', 0])[0]}
          </div>
          <span className="text-[10px] font-mono text-[#8C929B] mt-1 block">Based on logged minutes</span>
        </GlassCard>
      </div>

      {/* Focus Stopwatch Component */}
      <GlassCard className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-[#E2E5E9] pb-4">
          <div>
            <h2 className="text-sm font-heading font-bold text-[#17191D] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#0284C7] animate-pulse" />
              <span>Interactive Focus Stopwatch</span>
            </h2>
            <p className="text-[11px] font-sans text-[#646A73]">Timer state automatically persists across page navigation.</p>
          </div>

          {/* Category Selector Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-full text-[11px] font-mono font-bold uppercase border transition-all ${
                  selectedCategory === cat
                    ? CATEGORY_COLORS[cat] + ' ring-2 ring-sky-500/30 shadow-xs'
                    : 'bg-white text-[#646A73] border-[#E2E5E9] hover:text-[#17191D]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Stopwatch Digital Clock Display */}
        <div className="text-center py-8 bg-[#F8F9FB] border border-[#E2E5E9] rounded-2xl space-y-3 shadow-inner">
          <div className="text-6xl md:text-7xl font-mono font-black text-[#17191D] tracking-wider">
            {formatTime(seconds)}
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
            <span className="text-xs font-mono font-semibold text-[#646A73]">
              {isRunning ? 'TIMER ACTIVE' : seconds > 0 ? 'TIMER PAUSED' : 'READY TO START'}
            </span>
          </div>
        </div>

        {/* Stopwatch Inputs & Entity Linkage */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Session Notes / Description</label>
            <Input
              type="text"
              placeholder="e.g. Solved LeetCode DP problems, built auth system..."
              value={timerDescription}
              onChange={(e) => setTimerDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Link Task</label>
            <Select
              value={selectedTaskId}
              onChange={(e) => setSelectedTaskId(e.target.value)}
              className="w-full"
            >
              <option value="">-- No Task Link --</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Link Skill</label>
            <Select
              value={selectedSkillId}
              onChange={(e) => setSelectedSkillId(e.target.value)}
              className="w-full"
            >
              <option value="">-- No Skill Link --</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>
                  Skill: {s.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Stopwatch Control Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[#E2E5E9]">
          <button
            onClick={handleResetStopwatch}
            disabled={seconds === 0}
            className="px-3 py-1.5 text-xs font-mono text-[#8C929B] hover:text-[#17191D] disabled:opacity-30 transition-colors"
          >
            Reset Timer
          </button>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleStartPause}
              variant={isRunning ? "danger" : "primary"}
              size="md"
            >
              {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isRunning ? 'Pause Timer' : seconds > 0 ? 'Resume Timer' : 'Start Focus Session'}</span>
            </Button>

            <Button
              onClick={handleStopAndSave}
              disabled={seconds < 10 || isSavingSession}
              variant="secondary"
              size="md"
            >
              {isSavingSession ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
              <span>Stop & Save Session</span>
            </Button>
          </div>
        </div>
      </GlassCard>

      {/* Manual Time Entry Form (Togglable) */}
      {showManualForm && (
        <GlassCard>
          <form onSubmit={handleManualSave} className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
              <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0284C7]" />
                <span>Manual Study Session Entry</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Duration (Minutes) *</label>
                <Input
                  type="number"
                  min={1}
                  value={manualDuration}
                  onChange={(e) => setManualDuration(Number(e.target.value))}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Category *</label>
                <Select
                  value={manualCategory}
                  onChange={(e) => setManualCategory(e.target.value as TimeSessionCategory)}
                  className="w-full"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Session Date *</label>
                <Input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-[#646A73] mb-1">Description / Notes</label>
              <Input
                type="text"
                placeholder="Completed offline textbook chapter 4..."
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E5E9]">
              <Button type="button" onClick={() => setShowManualForm(false)} variant="ghost" size="sm">
                Cancel
              </Button>
              <Button type="submit" disabled={isSavingSession} variant="primary" size="sm">
                Save Manual Session
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Logged Sessions History */}
      <GlassCard>
        <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 mb-4">
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase">Logged Time Sessions History</h3>
          <span className="text-[11px] font-mono text-[#646A73]">{sessions.length} sessions recorded</span>
        </div>

        {sessions.length === 0 ? (
          <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
            No time sessions logged yet. Start the stopwatch above or log a manual entry!
          </div>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((sess) => (
              <div key={sess.id} className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={sess.category === 'Coding' ? 'cyan' : 'emerald'}>
                      {sess.category}
                    </Badge>
                    <span className="font-bold text-[#17191D] font-mono">{formatMinsToHours(sess.duration_minutes)}</span>
                    <span className="text-[#646A73] font-mono text-[11px]">({sess.session_date})</span>
                  </div>
                  <p className="text-[#17191D] font-sans">{sess.description || 'Focus session'}</p>
                </div>

                <button
                  onClick={() => handleDeleteSession(sess.id)}
                  className="p-1.5 rounded text-[#8C929B] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
