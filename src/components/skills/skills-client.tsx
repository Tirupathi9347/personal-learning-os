'use client';

import { useState } from 'react';
import { EvidenceGraphItem, Skill } from '@/types';
import { createSkill, updateSkillProficiency } from '@/app/actions/skill-actions';
import { getEvidenceGraph, linkEvidence } from '@/app/actions/evidence-actions';
import { getNotes } from '@/app/actions/note-actions';
import { Award, Plus, Layers, X, Loader2, Link2, AlertCircle, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { StudentEvidenceAudit } from '@/components/agent/student-evidence-audit';

interface SkillsClientProps {
  initialSkills: Skill[];
}

export function SkillsClient({ initialSkills }: SkillsClientProps) {
  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'CATALOG'>('AUDIT');

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Machine Learning');
  const [proficiency, setProficiency] = useState(2);
  const [targetLevel, setTargetLevel] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Universal Evidence Inspector Modal State
  const [inspectingSkill, setInspectingSkill] = useState<Skill | null>(null);
  const [evidenceItems, setEvidenceItems] = useState<EvidenceGraphItem[]>([]);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);

  // Link Evidence State
  const [availableNotes, setAvailableNotes] = useState<{ id: string; title: string }[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState('');
  const [isLinking, setIsLinking] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createSkill({
      name: name.trim(),
      category: category.trim() || 'General',
      proficiency_level: Number(proficiency),
      target_level: Number(targetLevel),
    });

    setIsSubmitting(false);

    if (res.success) {
      setName('');
      if (res.data) {
        setSkills([res.data, ...skills]);
      }
    } else {
      setErrorMessage(res.error || 'Failed to add skill.');
    }
  };

  const handleUpdateLevel = async (id: string, level: number) => {
    setSkills(skills.map((s) => (s.id === id ? { ...s, proficiency_level: level } : s)));
    await updateSkillProficiency(id, level);
  };

  const openEvidenceInspector = async (skill: Skill) => {
    setInspectingSkill(skill);
    setIsLoadingEvidence(true);

    const [graph, notesList] = await Promise.all([
      getEvidenceGraph('skill', skill.id),
      getNotes(),
    ]);

    setEvidenceItems(graph);
    setAvailableNotes(notesList.map((n) => ({ id: n.id, title: n.title })));
    setIsLoadingEvidence(false);
  };

  const handleAddEvidenceLink = async () => {
    if (!inspectingSkill || !selectedNoteId || isLinking) return;

    setIsLinking(true);
    await linkEvidence('note', selectedNoteId, 'skill', inspectingSkill.id);
    setIsLinking(false);

    const updatedGraph = await getEvidenceGraph('skill', inspectingSkill.id);
    setEvidenceItems(updatedGraph);
    setSelectedNoteId('');
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<Award className="w-5 h-5 text-amber-600" />}
        title="Skills Matrix & Universal Evidence System"
        description="Track skill proficiency claims, verify empirical evidence traces, and audit ground-truth confidence."
      />

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-[var(--exec-border)] pb-2">
        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === 'AUDIT'
              ? 'bg-[#17191D] dark:bg-white text-white dark:text-[#17191D] shadow-xs'
              : 'text-[var(--exec-text-muted)] hover:bg-[var(--exec-surface-secondary)] border border-transparent'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Ground-Truth Evidence Audit</span>
        </button>
        <button
          onClick={() => setActiveTab('CATALOG')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === 'CATALOG'
              ? 'bg-[#17191D] dark:bg-white text-white dark:text-[#17191D] shadow-xs'
              : 'text-[var(--exec-text-muted)] hover:bg-[var(--exec-surface-secondary)] border border-transparent'
          }`}
        >
          <Layers className="w-4 h-4 text-sky-500" />
          <span>Skill Claims Catalog ({skills.length})</span>
        </button>
      </div>

      {activeTab === 'AUDIT' ? (
        <StudentEvidenceAudit />
      ) : (
        <div className="space-y-6">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Add Skill Form */}
          <GlassCard>
            <form onSubmit={handleCreate} className="space-y-4">
              <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase tracking-wider">Add Skill Domain Claim</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input
                  type="text"
                  placeholder="Skill Name (e.g. Computer Vision, PyTorch)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="md:col-span-2"
                  required
                />
                <Input
                  type="text"
                  placeholder="Category (e.g. Machine Learning)"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                <div className="flex gap-2">
                  <Select
                    value={proficiency}
                    onChange={(e) => setProficiency(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5].map((lvl) => (
                      <option key={lvl} value={lvl}>Level {lvl}</option>
                    ))}
                  </Select>
                  <Button type="submit" disabled={isSubmitting || !name.trim()} variant="primary" size="md" className="flex-1">
                    {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>Add</span>
                  </Button>
                </div>
              </div>
            </form>
          </GlassCard>

          {/* Skills Grid */}
          {skills.length === 0 ? (
            <div className="p-8 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
              No skills registered yet. Add your first skill claim above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {skills.map((skill) => (
                <GlassCard key={skill.id} className="space-y-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                      <div>
                        <h4 className="text-xs font-heading font-bold text-[#17191D]">{skill.name}</h4>
                        <span className="text-[10px] font-mono text-[#8C929B] uppercase tracking-wider">{skill.category}</span>
                      </div>
                      <Badge variant="amber">Level {skill.proficiency_level} / {skill.target_level}</Badge>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-mono text-[#646A73]">
                        <span>Proficiency Track</span>
                        <span>{skill.proficiency_level} of {skill.target_level}</span>
                      </div>
                      <div className="flex gap-1.5">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => handleUpdateLevel(skill.id, level)}
                            className={`h-2 flex-1 rounded-full transition-all ${
                              level <= skill.proficiency_level
                                ? 'bg-amber-500 hover:bg-amber-600'
                                : 'bg-[#E2E5E9] hover:bg-[#D0D4DC]'
                            }`}
                            title={`Set to level ${level}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E2E5E9] flex items-center justify-between">
                    <span className="text-[10px] font-mono text-[#8C929B]">
                      Added {skill.created_at.split('T')[0]}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openEvidenceInspector(skill)}
                    >
                      <Layers className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>Inspect Graph</span>
                    </Button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Universal Evidence Inspector Modal */}
      {inspectingSkill && (
        <div className="fixed inset-0 z-50 bg-[#17191D]/40 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div 
            className="w-full max-w-2xl bg-white border border-[#E2E5E9] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-amber-50/60">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-amber-900">
                <Layers className="w-4 h-4 text-amber-600" />
                <h3>
                  EVIDENCE INSPECTOR: <span className="text-amber-700">{inspectingSkill.name}</span>
                </h3>
              </div>
              <button 
                onClick={() => setInspectingSkill(null)}
                className="p-1 rounded-lg text-[#8C929B] hover:text-[#17191D] hover:bg-[#EEF0F3] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <p className="text-xs text-[#646A73]">
                Supporting records and artifacts linked to prove mastery in <strong className="text-[#17191D]">{inspectingSkill.name}</strong>.
              </p>

              {/* Add Link Controller */}
              <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-center gap-2">
                <Select
                  value={selectedNoteId}
                  onChange={(e) => setSelectedNoteId(e.target.value)}
                  className="flex-1 text-xs"
                >
                  <option value="">Select Note to Link as Evidence...</option>
                  {availableNotes.map((n) => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </Select>
                <Button
                  onClick={handleAddEvidenceLink}
                  disabled={!selectedNoteId || isLinking}
                  variant="primary"
                  size="sm"
                >
                  {isLinking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                  <span>Link Note</span>
                </Button>
              </div>

              {/* Evidence Items List */}
              {isLoadingEvidence ? (
                <div className="p-6 text-center text-xs font-mono text-[#8C929B] flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                  <span>Gathering evidence trace graph...</span>
                </div>
              ) : evidenceItems.length === 0 ? (
                <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
                  No evidence linked yet for this skill. Select a note above to attach proof.
                </div>
              ) : (
                <div className="space-y-2">
                  {evidenceItems.map((item) => (
                    <div key={item.id} className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="amber">{item.type}</Badge>
                          <h4 className="text-xs font-semibold text-[#17191D]">{item.title}</h4>
                        </div>
                        {item.summary && (
                          <p className="text-[11px] text-[#646A73] font-sans">{item.summary}</p>
                        )}
                      </div>
                      {item.date && (
                        <span className="text-[10px] font-mono text-[#8C929B]">{item.date}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
