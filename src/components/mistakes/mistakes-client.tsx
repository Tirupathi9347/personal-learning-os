'use client';

import { useState } from 'react';
import { Mistake, MistakeCategory, MistakeSeverity, Skill } from '@/types';
import { createMistake, deleteMistake } from '@/app/actions/mistake-actions';
import { ShieldAlert, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Bug, Lightbulb, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const CATEGORIES: MistakeCategory[] = ['Syntax/Logic', 'Architecture', 'Performance', 'Database', 'API', 'Security'];

interface MistakesClientProps {
  initialMistakes: Mistake[];
  skills: Skill[];
}

export function MistakesClient({ initialMistakes, skills }: MistakesClientProps) {
  const [mistakes, setMistakes] = useState<Mistake[]>(initialMistakes);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MistakeCategory>('Syntax/Logic');
  const [severity, setSeverity] = useState<MistakeSeverity>('medium');
  const [rootCause, setRootCause] = useState('');
  const [solution, setSolution] = useState('');
  const [preventionRule, setPreventionRule] = useState('');
  const [skillId, setSkillId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Filter State
  const [filterCategory, setFilterCategory] = useState<string>('All');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rootCause.trim() || !solution.trim() || isSaving) return;

    setIsSaving(true);
    setStatusMsg(null);

    const res = await createMistake({
      title: title.trim(),
      category,
      severity,
      root_cause: rootCause.trim(),
      solution: solution.trim(),
      prevention_rule: preventionRule.trim() || null,
      skill_id: skillId || null,
    });

    setIsSaving(false);

    if (res.success) {
      setStatusMsg({ type: 'success', text: 'Mistake log & prevention rule recorded!' });
      setTimeout(() => setStatusMsg(null), 3000);
      setShowForm(false);
      setTitle('');
      setRootCause('');
      setSolution('');
      setPreventionRule('');
      if (res.data) {
        setMistakes([res.data, ...mistakes]);
      }
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Failed to save mistake log.' });
    }
  };

  const handleDelete = async (id: string) => {
    setMistakes(mistakes.filter((m) => m.id !== id));
    await deleteMistake(id);
  };

  const filteredMistakes = mistakes.filter((m) => filterCategory === 'All' || m.category === filterCategory);

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<ShieldAlert className="w-5 h-5 text-rose-600" />}
        title="Mistake & Debugging Engine"
        description="Record root causes, resolutions, and prevention rules to avoid repeating past bugs."
        actions={
          <Button
            onClick={() => setShowForm(!showForm)}
            variant="danger"
            size="md"
          >
            <Plus className="w-4 h-4" />
            <span>{showForm ? 'Hide Form' : 'Log Technical Mistake'}</span>
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

      {/* Form */}
      {showForm && (
        <GlassCard>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3">
              <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase flex items-center gap-2">
                <Bug className="w-4 h-4 text-rose-600" />
                <span>Record Technical Bug or Architecture Mistake</span>
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Mistake / Bug Title *</label>
                <Input
                  type="text"
                  placeholder="e.g. Unchecked null reference in user auth token..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Category *</label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MistakeCategory)}
                  className="w-full"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Severity *</label>
                <Select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as MistakeSeverity)}
                  className="w-full"
                >
                  <option value="low">Low (Minor annoyance)</option>
                  <option value="medium">Medium (Standard bug)</option>
                  <option value="high">High (Broken feature)</option>
                  <option value="critical">Critical (Data loss / Security)</option>
                </Select>
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Link Skill</label>
                <Select
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
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

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Root Cause Analysis *</label>
                <Textarea
                  rows={2}
                  placeholder="Why did this break? Missing null check on line 42..."
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Fix / Solution Applied *</label>
                <Textarea
                  rows={2}
                  placeholder="Added optional chaining and fallback default state..."
                  value={solution}
                  onChange={(e) => setSolution(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-[#646A73] mb-1">Prevention Rule / Guardrail</label>
                <Input
                  type="text"
                  placeholder="Rule: Always validate token payload before dereferencing."
                  value={preventionRule}
                  onChange={(e) => setPreventionRule(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E5E9]">
              <Button type="button" onClick={() => setShowForm(false)} variant="ghost" size="sm">
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving} variant="danger" size="sm">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Mistake Log'}
              </Button>
            </div>
          </form>
        </GlassCard>
      )}

      {/* Mistakes Log Stream */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[#E2E5E9] pb-3 mb-4 gap-2">
          <CardTitle>Recorded Mistake Logs & Rules</CardTitle>

          {/* Category Filter Tabs */}
          <div className="flex items-center bg-[#F8F9FB] border border-[#E2E5E9] rounded-lg p-0.5 text-xs font-mono">
            {['All', ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                  filterCategory === cat ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'text-[#646A73] hover:text-[#17191D]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filteredMistakes.length === 0 ? (
          <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
            No mistake logs recorded. Click <strong>Log Technical Mistake</strong> above to document a bug.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMistakes.map((m) => (
              <div key={m.id} className="p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={m.severity === 'critical' || m.severity === 'high' ? 'crimson' : 'amber'}>
                      {m.severity}
                    </Badge>
                    <span className="text-xs font-heading font-bold text-[#17191D]">{m.title}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-[11px] font-mono text-[#646A73]">{m.category}</span>
                    <button onClick={() => handleDelete(m.id)} className="text-[#8C929B] hover:text-rose-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 bg-white border border-[#E2E5E9] rounded-lg space-y-1">
                    <span className="text-[10px] font-mono font-bold text-amber-700 flex items-center gap-1">
                      <Bug className="w-3 h-3" /> Root Cause:
                    </span>
                    <p className="text-[#17191D] font-sans">{m.root_cause}</p>
                  </div>

                  <div className="p-3 bg-white border border-[#E2E5E9] rounded-lg space-y-1">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" /> Solution:
                    </span>
                    <p className="text-[#17191D] font-sans">{m.solution}</p>
                  </div>
                </div>

                {m.prevention_rule && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-[11px] text-rose-800 font-mono">
                    <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
                    <span><strong>Prevention Rule:</strong> {m.prevention_rule}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
