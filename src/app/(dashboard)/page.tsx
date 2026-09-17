import { getTasks } from '@/app/actions/task-actions';
import { getTodayJournal } from '@/app/actions/journal-actions';
import { getVaultConfig } from '@/app/actions/vault-actions';
import { getLearningPathTodaySection } from '@/app/actions/learning-path-actions';
import Link from 'next/link';
import { CheckSquare, BookOpen, Key, Sparkles, Plus, ArrowRight, ShieldCheck, Activity } from 'lucide-react';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LearningCoachSummaryCard } from '@/components/agent/learning-coach-summary-card';
import { LearningAutopilotCard } from '@/components/agent/learning-autopilot-card';
import { TodayLearningCard } from '@/components/learning-path/today-learning-card';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [tasks, todayJournal, vaultConfig, todayLearningResult] = await Promise.all([
    getTasks(),
    getTodayJournal(),
    getVaultConfig(),
    getLearningPathTodaySection(),
  ]);

  const todoTasks = tasks.filter((t) => t.status === 'todo');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const todayLearning = todayLearningResult.success ? todayLearningResult.data ?? null : null;

  return (
    <div className="space-y-6 animate-page-entrance">
      {/* Executive Command Center Hero Banner */}
      <div className="p-6 bg-[var(--exec-surface)] border border-[var(--exec-border)] rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-sky-500" />
            <h1 className="text-xl font-heading font-bold text-[var(--exec-text)] tracking-tight">
              Executive Command Center // Personal Learning OS
            </h1>
          </div>
          <p className="text-xs text-[var(--exec-text-muted)] max-w-2xl font-sans">
            Private single-user intelligent learning system. Execute updates via <kbd className="px-2 py-0.5 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded text-[var(--exec-text)] font-mono text-[11px]">⌘K</kbd> to parse journal logs and tasks with human-in-the-loop confirmation.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <Link href="/tasks">
            <Button variant="primary" size="md">
              <Plus className="w-4 h-4" />
              <span>Manage Tasks</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Central Learning Autopilot Layer */}
      <LearningAutopilotCard />

      {/* Dedicated Learning Coach Summary & Quick Resume Card */}
      <LearningCoachSummaryCard />

      {/* Metric KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">Active Tasks</span>
            <CheckSquare className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-3xl font-mono font-bold text-[var(--exec-text)] mt-2">{todoTasks.length}</div>
          <p className="text-[11px] font-mono text-[var(--exec-text-muted)] mt-1">{completedTasks.length} tasks completed</p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">Daily Journal</span>
            <BookOpen className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-sm font-heading font-bold text-[var(--exec-text)] mt-2">
            {todayJournal ? 'LOGGED' : 'NOT RECORDED'}
          </div>
          <p className="text-[11px] font-mono text-[var(--exec-text-muted)] mt-1">
            {todayJournal ? `${todayJournal.time_spent_minutes || 0} mins logged today` : 'Press ⌘K to submit log'}
          </p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">AI Vault</span>
            <Key className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-sm font-mono font-bold text-[var(--exec-text)] mt-2 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>{vaultConfig?.has_key ? 'ENCRYPTED' : 'UNSET'}</span>
          </div>
          <p className="text-[11px] font-mono text-[var(--exec-text-muted)] mt-1">
            Model: {vaultConfig?.selected_model || 'gemini-3.6-flash'}
          </p>
        </GlassCard>

        <GlassCard>
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-[var(--exec-text-muted)] uppercase font-bold tracking-wider">System Mode</span>
            <Activity className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-sm font-heading font-bold text-[var(--exec-text)] mt-2">
            CONFIRMATION GATE
          </div>
          <p className="text-[11px] font-mono text-[var(--exec-text-muted)] mt-1">Human-in-the-loop active</p>
        </GlassCard>
      </div>

      {/* Today's Learning Path Section */}
      <TodayLearningCard todaySection={todayLearning} />

      {/* Main Grid: Active Tasks & Today's Journal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Tasks Widget */}
        <GlassCard>
          <CardHeader>
            <CardTitle>
              <CheckSquare className="w-4 h-4 text-sky-500" />
              <span>Pending Task Queue</span>
            </CardTitle>
            <Link href="/tasks" className="text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>

          {todoTasks.length === 0 ? (
            <p className="text-xs text-[var(--exec-text-muted)] py-6 text-center font-mono">No active tasks pending. Add tasks manually or via AI Command Bar.</p>
          ) : (
            <div className="space-y-2">
              {todoTasks.slice(0, 5).map((task) => (
                <div key={task.id} className="p-3 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-lg flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-medium text-[var(--exec-text)]">{task.title}</h4>
                    {task.due_date && (
                      <span className="text-[10px] font-mono text-[var(--exec-text-muted)]">Due: {task.due_date}</span>
                    )}
                  </div>
                  <Badge variant={task.priority === 'high' ? 'amber' : 'slate'}>
                    {task.priority}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Today's Journal Widget */}
        <GlassCard>
          <CardHeader>
            <CardTitle>
              <BookOpen className="w-4 h-4 text-emerald-500" />
              <span>Today&apos;s Journal Record</span>
            </CardTitle>
            <Link href="/journal" className="text-xs font-mono text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1">
              Journal Hub <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>

          {todayJournal ? (
            <div className="p-4 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-lg space-y-2">
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wide">
                Recorded for {todayJournal.entry_date}
              </span>
              <p className="text-xs text-[var(--exec-text)] whitespace-pre-wrap font-mono">{todayJournal.raw_content}</p>
              {todayJournal.tomorrow_plan && (
                <div className="pt-2 border-t border-[var(--exec-border)]">
                  <span className="text-[10px] font-mono font-bold text-sky-600 dark:text-sky-400">Tomorrow&apos;s Plan:</span>
                  <p className="text-xs text-[var(--exec-text-muted)] mt-0.5">{todayJournal.tomorrow_plan}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 bg-[var(--exec-surface-secondary)] border border-dashed border-[var(--exec-border)] rounded-lg text-center space-y-3">
              <p className="text-xs text-[var(--exec-text-muted)] font-sans">No journal entry recorded for today yet.</p>
              <Link href="/journal">
                <Button variant="outline" size="sm">
                  Open Daily Journal
                </Button>
              </Link>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
