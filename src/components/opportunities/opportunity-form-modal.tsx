'use client';

import { Opportunity, OpportunityType, OpportunityStatus, OpportunityWorkMode } from '@/types';
import { createOpportunity, updateOpportunity } from '@/app/actions/opportunity-actions';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select } from '@/components/ui/input';
import { X, Loader2, Save } from 'lucide-react';
import { useState } from 'react';

interface OpportunityFormModalProps {
  initialData?: Opportunity | null;
  onClose: () => void;
  onSaved: () => void;
}

export function OpportunityFormModal({ initialData, onClose, onSaved }: OpportunityFormModalProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [organization, setOrganization] = useState(initialData?.organization || '');
  const [type, setType] = useState<OpportunityType>(initialData?.type || 'INTERNSHIP');
  const [role, setRole] = useState(initialData?.role || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [eligibility, setEligibility] = useState(initialData?.eligibility || '');
  const [educationRequirements, setEducationRequirements] = useState(initialData?.education_requirements || '');
  const [branchRequirements, setBranchRequirements] = useState(initialData?.branch_requirements || '');
  const [skillsInput, setSkillsInput] = useState(initialData?.skills_required ? initialData.skills_required.join(', ') : '');
  const [location, setLocation] = useState(initialData?.location || '');
  const [workMode, setWorkMode] = useState<OpportunityWorkMode | ''>(initialData?.work_mode || 'REMOTE');
  const [stipend, setStipend] = useState(initialData?.stipend || '');
  const [salary, setSalary] = useState(initialData?.salary || '');
  const [deadline, setDeadline] = useState(initialData?.deadline || '');
  const [applicationUrl, setApplicationUrl] = useState(initialData?.application_url || '');
  const [source, setSource] = useState(initialData?.source || 'MANUAL');
  const [status, setStatus] = useState<OpportunityStatus>(initialData?.status || 'NEW');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !organization.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const skillsArray = skillsInput.split(',').map((s) => s.trim()).filter(Boolean);

    const payload = {
      title: title.trim(),
      organization: organization.trim(),
      type,
      role: role.trim() || null,
      description: description.trim() || null,
      eligibility: eligibility.trim() || null,
      education_requirements: educationRequirements.trim() || null,
      branch_requirements: branchRequirements.trim() || null,
      skills_required: skillsArray,
      location: location.trim() || null,
      work_mode: workMode ? (workMode as OpportunityWorkMode) : null,
      stipend: stipend.trim() || null,
      salary: salary.trim() || null,
      deadline: deadline || null,
      application_url: applicationUrl.trim() || null,
      source: source.trim() || 'MANUAL',
      status,
    };

    let res;
    if (initialData?.id) {
      res = await updateOpportunity(initialData.id, payload);
    } else {
      res = await createOpportunity(payload);
    }

    setIsSubmitting(false);

    if (res.success) {
      onSaved();
      onClose();
    } else {
      setErrorMessage(res.error || 'Failed to save opportunity record.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop">
      <div
        className="w-full max-w-2xl glass-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase">
            {initialData ? 'Edit Opportunity Record' : 'Add Opportunity Record'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-sans text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl font-mono text-rose-800 text-xs">
              {errorMessage}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Opportunity Title *</label>
              <Input type="text" placeholder="e.g. Software Engineer Intern 2025" value={title} onChange={(e) => setTitle(e.target.value)} required />
            </div>
            <div>
              <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Organization *</label>
              <Input type="text" placeholder="e.g. Google" value={organization} onChange={(e) => setOrganization(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Type *</label>
              <Select value={type} onChange={(e) => setType(e.target.value as OpportunityType)} className="w-full">
                <option value="INTERNSHIP">INTERNSHIP</option>
                <option value="JOB">JOB</option>
                <option value="HACKATHON">HACKATHON</option>
                <option value="SCHOLARSHIP">SCHOLARSHIP</option>
                <option value="FELLOWSHIP">FELLOWSHIP</option>
                <option value="COMPETITION">COMPETITION</option>
                <option value="WORKSHOP">WORKSHOP</option>
                <option value="CERTIFICATION">CERTIFICATION</option>
                <option value="RESEARCH">RESEARCH</option>
                <option value="OTHER">OTHER</option>
              </Select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Work Mode</label>
              <Select value={workMode} onChange={(e) => setWorkMode(e.target.value as OpportunityWorkMode)} className="w-full">
                <option value="REMOTE">REMOTE</option>
                <option value="HYBRID">HYBRID</option>
                <option value="ON_SITE">ON SITE</option>
              </Select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Pipeline Status</label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as OpportunityStatus)} className="w-full">
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
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Location</label>
              <Input type="text" placeholder="e.g. Mountain View, CA" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Stipend / Salary</label>
              <Input type="text" placeholder="e.g. $50/hr or $120k" value={stipend} onChange={(e) => setStipend(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Application Deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Application URL</label>
            <Input type="url" placeholder="https://careers.google.com/jobs/..." value={applicationUrl} onChange={(e) => setApplicationUrl(e.target.value)} />
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Required Skills (Comma separated)</label>
            <Input type="text" placeholder="Python, Algorithms, Distributed Systems" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)} />
          </div>

          <div>
            <label className="block text-[11px] font-mono font-bold text-[#646A73] uppercase mb-1">Description / Notes</label>
            <Textarea rows={3} placeholder="Role description & requirements..." value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E5E9]">
            <Button type="button" onClick={onClose} variant="ghost" size="sm">Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || !organization.trim()} variant="primary" size="sm">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{initialData ? 'Update Record' : 'Save Opportunity'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
