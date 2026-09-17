'use client';

import { useState } from 'react';
import { StudentProfile } from '@/types';
import { updateStudentProfile } from '@/app/actions/profile-actions';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select } from '@/components/ui/input';
import { X, Loader2, Save, User, GraduationCap, Code2, Briefcase, MapPin, Target } from 'lucide-react';

interface ProfileEditModalProps {
  profile: StudentProfile | null;
  onClose: () => void;
  onSaved: () => void;
}

const OPPORTUNITY_TYPES = [
  'INTERNSHIP', 'JOB', 'HACKATHON', 'SCHOLARSHIP', 'FELLOWSHIP',
  'COMPETITION', 'WORKSHOP', 'CERTIFICATION', 'RESEARCH', 'OTHER'
];

const WORK_MODES = ['REMOTE', 'HYBRID', 'ON_SITE'];

export function ProfileEditModal({ profile, onClose, onSaved }: ProfileEditModalProps) {
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [college, setCollege] = useState(profile?.college || '');
  const [branch, setBranch] = useState(profile?.branch || '');
  const [degree, setDegree] = useState(profile?.degree || '');
  const [currentYear, setCurrentYear] = useState(profile?.current_year || '');
  const [graduationYear, setGraduationYear] = useState<string>(profile?.graduation_year ? String(profile.graduation_year) : '');

  const [skillsInput, setSkillsInput] = useState(profile?.skills ? profile.skills.join(', ') : '');
  const [projectTechInput, setProjectTechInput] = useState(
    profile?.relevant_project_technologies ? profile.relevant_project_technologies.join(', ') : ''
  );
  const [targetRolesInput, setTargetRolesInput] = useState(
    profile?.career_target_roles ? profile.career_target_roles.join(', ') : ''
  );
  const [interestsInput, setInterestsInput] = useState(profile?.interests ? profile.interests.join(', ') : '');
  const [learningGoalsInput, setLearningGoalsInput] = useState(
    profile?.learning_goals ? profile.learning_goals.join(', ') : ''
  );

  const [selectedOpportunityTypes, setSelectedOpportunityTypes] = useState<string[]>(
    profile?.preferred_opportunity_types || ['INTERNSHIP', 'JOB']
  );
  const [locationsInput, setLocationsInput] = useState(
    profile?.preferred_locations ? profile.preferred_locations.join(', ') : ''
  );
  const [selectedWorkModes, setSelectedWorkModes] = useState<string[]>(
    profile?.preferred_work_modes || ['REMOTE', 'HYBRID']
  );

  const [minStipend, setMinStipend] = useState(profile?.min_stipend || '');
  const [expectedSalary, setExpectedSalary] = useState(profile?.expected_salary || '');
  const [availabilityStatus, setAvailabilityStatus] = useState(profile?.availability_status || 'Available Immediately');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const toggleType = (t: string) => {
    setSelectedOpportunityTypes((prev) =>
      prev.includes(t) ? prev.filter((item) => item !== t) : [...prev, t]
    );
  };

  const toggleWorkMode = (m: string) => {
    setSelectedWorkModes((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const parseArray = (str: string) =>
      str.split(',').map((s) => s.trim()).filter(Boolean);

    const payload: Partial<StudentProfile> = {
      user_id: profile?.user_id,
      full_name: fullName.trim() || null,
      college: college.trim() || null,
      branch: branch.trim() || null,
      degree: degree.trim() || null,
      current_year: currentYear.trim() || null,
      graduation_year: graduationYear.trim() ? Number(graduationYear.trim()) : null,
      skills: parseArray(skillsInput),
      relevant_project_technologies: parseArray(projectTechInput),
      career_target_roles: parseArray(targetRolesInput),
      interests: parseArray(interestsInput),
      learning_goals: parseArray(learningGoalsInput),
      preferred_opportunity_types: selectedOpportunityTypes,
      preferred_locations: parseArray(locationsInput),
      preferred_work_modes: selectedWorkModes,
      min_stipend: minStipend.trim() || null,
      expected_salary: expectedSalary.trim() || null,
      availability_status: availabilityStatus.trim() || null,
    };

    const res = await updateStudentProfile(payload);
    setIsSubmitting(false);

    if (res.success) {
      onSaved();
      onClose();
    } else {
      setErrorMessage(res.error || 'Failed to save student profile.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop">
      <div
        className="w-full max-w-3xl glass-modal overflow-hidden font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB] font-mono">
          <div className="flex items-center gap-2 font-bold text-xs text-[#17191D]">
            <User className="w-4 h-4 text-[#0284C7]" />
            <span>EDIT STUDENT & CAREER PROFILE</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[78vh] overflow-y-auto text-xs">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl font-mono text-rose-800 text-xs">
              {errorMessage}
            </div>
          )}

          {/* Section 1: Academic & Personal Identity */}
          <div className="space-y-3 p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono">
            <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
              <GraduationCap className="w-4 h-4 text-[#0284C7]" />
              <span>1. ACADEMIC & PERSONAL IDENTITY</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Full Name</label>
                <Input type="text" placeholder="e.g. Alex Chen" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">College / University</label>
                <Input type="text" placeholder="e.g. Stanford University" value={college} onChange={(e) => setCollege(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Degree</label>
                <Input type="text" placeholder="e.g. B.Tech / B.S." value={degree} onChange={(e) => setDegree(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Branch / Major</label>
                <Input type="text" placeholder="e.g. Computer Science" value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Current Year</label>
                <Select value={currentYear} onChange={(e) => setCurrentYear(e.target.value)}>
                  <option value="">-- Select Year --</option>
                  <option value="1st Year">1st Year</option>
                  <option value="2nd Year">2nd Year</option>
                  <option value="3rd Year">3rd Year</option>
                  <option value="4th Year">4th Year</option>
                  <option value="Graduated">Graduated</option>
                </Select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Graduation Year</label>
                <Input type="number" placeholder="2026" value={graduationYear} onChange={(e) => setGraduationYear(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Section 2: Skills & Project Tech */}
          <div className="space-y-3 p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono">
            <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
              <Code2 className="w-4 h-4 text-emerald-600" />
              <span>2. SKILLS & PROJECT TECHNOLOGIES</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Core Skills (Comma separated)</label>
              <Input type="text" placeholder="TypeScript, React, Python, PostgreSQL, System Design" value={skillsInput} onChange={(e) => setSkillsInput(e.target.value)} />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Relevant Project Technologies</label>
              <Input type="text" placeholder="Next.js, Tailwind CSS, Supabase, Docker, Redis" value={projectTechInput} onChange={(e) => setProjectTechInput(e.target.value)} />
            </div>
          </div>

          {/* Section 3: Career Goals & Target Roles */}
          <div className="space-y-3 p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono">
            <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <span>3. CAREER GOALS & TARGET ROLES</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Career / Target Roles (Comma separated)</label>
                <Input type="text" placeholder="Full Stack Developer, Software Engineer, AI Engineer" value={targetRolesInput} onChange={(e) => setTargetRolesInput(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Technical Interests</label>
                <Input type="text" placeholder="Generative AI, Distributed Systems, Cloud Architecture" value={interestsInput} onChange={(e) => setInterestsInput(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Learning Goals</label>
              <Input type="text" placeholder="Master Next.js App Router, Complete 150 LeetCode Mediums" value={learningGoalsInput} onChange={(e) => setLearningGoalsInput(e.target.value)} />
            </div>
          </div>

          {/* Section 4: Opportunity Preferences */}
          <div className="space-y-3 p-4 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono">
            <div className="flex items-center gap-2 text-xs font-bold text-[#17191D]">
              <Target className="w-4 h-4 text-amber-600" />
              <span>4. OPPORTUNITY & LOCATION PREFERENCES</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-2">Preferred Opportunity Types</label>
              <div className="flex flex-wrap gap-2">
                {OPPORTUNITY_TYPES.map((t) => {
                  const isChecked = selectedOpportunityTypes.includes(t);
                  return (
                    <button
                      type="button"
                      key={t}
                      onClick={() => toggleType(t)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all border ${
                        isChecked ? 'bg-[#17191D] text-white border-[#17191D]' : 'bg-white text-[#646A73] border-[#E2E5E9] hover:bg-[#EEF0F3]'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Preferred Locations (Comma separated)</label>
                <Input type="text" placeholder="Remote, San Francisco CA, Bengaluru India" value={locationsInput} onChange={(e) => setLocationsInput(e.target.value)} />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Preferred Work Modes</label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {WORK_MODES.map((m) => {
                    const isChecked = selectedWorkModes.includes(m);
                    return (
                      <button
                        type="button"
                        key={m}
                        onClick={() => toggleWorkMode(m)}
                        className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all border ${
                          isChecked ? 'bg-[#0284C7] text-white border-[#0284C7]' : 'bg-white text-[#646A73] border-[#E2E5E9] hover:bg-[#EEF0F3]'
                        }`}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Min Expected Stipend</label>
                <Input type="text" placeholder="e.g. $1,000/mo or ₹30,000/mo" value={minStipend} onChange={(e) => setMinStipend(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Expected Salary</label>
                <Input type="text" placeholder="e.g. $100,000/yr" value={expectedSalary} onChange={(e) => setExpectedSalary(e.target.value)} />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#646A73] uppercase mb-1">Availability Status</label>
                <Input type="text" placeholder="e.g. Available Summer 2026" value={availabilityStatus} onChange={(e) => setAvailabilityStatus(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E5E9] font-mono">
            <Button type="button" onClick={onClose} variant="ghost" size="sm">Cancel</Button>
            <Button type="submit" disabled={isSubmitting} variant="primary" size="sm">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Student Profile</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
