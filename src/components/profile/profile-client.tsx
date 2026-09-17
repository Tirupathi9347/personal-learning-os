'use client';

import { useState } from 'react';
import { StudentProfile } from '@/types';
import { getStudentProfile } from '@/app/actions/profile-actions';
import { ProfileEditModal } from './profile-edit-modal';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  GraduationCap,
  Code2,
  Briefcase,
  Target,
  MapPin,
  Edit2,
  Award,
  FolderGit2,
  BookOpen,
  DollarSign,
  Compass,
  CheckCircle2,
} from 'lucide-react';
import Link from 'next/link';

interface ProfileClientProps {
  initialProfile: StudentProfile | null;
}

export function ProfileClient({ initialProfile }: ProfileClientProps) {
  const [profile, setProfile] = useState<StudentProfile | null>(initialProfile);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const refreshProfile = async () => {
    const updated = await getStudentProfile();
    if (updated) setProfile(updated);
  };

  const hasIdentity = profile?.full_name || profile?.college || profile?.branch;

  return (
    <div className="space-y-6 animate-page-entrance">
      {/* Executive Page Header */}
      <PageHeader
        title="Student & Career Profile"
        description="Single source of truth for Opportunity Intelligence, skills, career goals, and opportunity preferences."
        icon={<User className="w-5 h-5 text-[#0284C7]" />}
        actions={
          <div className="flex items-center gap-2 font-mono">
            <Link href="/opportunities">
              <Button variant="outline" size="sm">
                <Compass className="w-3.5 h-3.5 text-[#0284C7]" />
                <span>Opportunity Hub</span>
              </Button>
            </Link>

            <Button onClick={() => setIsEditOpen(true)} variant="primary" size="md">
              <Edit2 className="w-4 h-4" />
              <span>Edit Profile</span>
            </Button>
          </div>
        }
      />

      {/* Main Profile Header Banner */}
      <GlassCard className="p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#17191D] text-white font-mono font-bold text-2xl flex items-center justify-center shadow-md">
              {profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : 'S'}
            </div>

            <div>
              <div className="flex items-center gap-2 font-mono">
                <h1 className="text-xl font-heading font-bold text-[#17191D]">
                  {profile?.full_name || 'Student Profile'}
                </h1>
                <Badge variant={hasIdentity ? 'emerald' : 'amber'}>
                  {hasIdentity ? 'Active Profile' : 'Unpopulated'}
                </Badge>
              </div>

              <p className="text-xs font-mono text-[#646A73] mt-1">
                {profile?.college ? `${profile.college}` : 'College Not Specified'}
                {profile?.branch ? ` • ${profile.branch}` : ''}
                {profile?.degree ? ` (${profile.degree})` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="px-3 py-1 bg-sky-50 text-[#0284C7] border border-sky-200 rounded-lg font-bold">
              {profile?.availability_status || 'Availability Not Specified'}
            </span>
          </div>
        </div>
      </GlassCard>

      {/* 4-Grid Core Student Profile Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Academic Identity */}
        <GlassCard className="space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 text-xs font-bold text-[#17191D]">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#0284C7]" />
              <h3>Academic Identity</h3>
            </div>
            <span className="text-[10px] text-[#8C929B]">Education & Year</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[11px] text-[#8C929B]">College / Institute</span>
              <p className="font-bold text-[#17191D] truncate">{profile?.college || 'Not specified'}</p>
            </div>

            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[11px] text-[#8C929B]">Degree & Branch</span>
              <p className="font-bold text-[#17191D] truncate">
                {profile?.degree || profile?.branch ? `${profile?.degree || ''} ${profile?.branch || ''}`.trim() : 'Not specified'}
              </p>
            </div>

            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[11px] text-[#8C929B]">Current Year</span>
              <p className="font-bold text-[#0284C7]">{profile?.current_year || 'Not specified'}</p>
            </div>

            <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
              <span className="text-[11px] text-[#8C929B]">Graduation Year</span>
              <p className="font-bold text-[#17191D]">{profile?.graduation_year || 'Not specified'}</p>
            </div>
          </div>
        </GlassCard>

        {/* Section 2: Skills & Project Technologies */}
        <GlassCard className="space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 text-xs font-bold text-[#17191D]">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-emerald-600" />
              <h3>Skills & Tech Stack</h3>
            </div>
            <Link href="/skills" className="text-[10px] text-[#0284C7] hover:underline flex items-center gap-1">
              <Award className="w-3 h-3" />
              <span>Skills Graph</span>
            </Link>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5">Core Technical Skills</span>
              {profile?.skills && profile.skills.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.skills.map((skill, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-[#EEF0F3] border border-[#E2E5E9] rounded-md font-semibold text-[#17191D]">
                      {skill}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[#8C929B] italic">No skills listed yet.</p>
              )}
            </div>

            <div className="pt-2 border-t border-[#E2E5E9]">
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5 flex items-center justify-between">
                <span>Relevant Project Technologies</span>
                <Link href="/projects" className="text-[#0284C7] hover:underline normal-case font-normal text-[10px] flex items-center gap-1">
                  <FolderGit2 className="w-3 h-3" />
                  <span>Project Hub</span>
                </Link>
              </span>
              {profile?.relevant_project_technologies && profile.relevant_project_technologies.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.relevant_project_technologies.map((tech, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-md font-semibold">
                      {tech}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[#8C929B] italic">No project technologies listed yet.</p>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Section 3: Career Goals & Target Roles */}
        <GlassCard className="space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 text-xs font-bold text-[#17191D]">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <h3>Career Target Roles & Interests</h3>
            </div>
            <span className="text-[10px] text-[#8C929B]">Goals</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5">Target Roles</span>
              {profile?.career_target_roles && profile.career_target_roles.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.career_target_roles.map((role, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded-md font-bold">
                      {role}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[#8C929B] italic">No target roles specified.</p>
              )}
            </div>

            <div className="pt-2 border-t border-[#E2E5E9]">
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5">Technical Interests</span>
              {profile?.interests && profile.interests.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.interests.map((interest, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-sky-50 text-[#0284C7] border border-sky-200 rounded-md font-semibold">
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[#8C929B] italic">No interests listed.</p>
              )}
            </div>

            <div className="pt-2 border-t border-[#E2E5E9]">
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5">Learning Goals</span>
              {profile?.learning_goals && profile.learning_goals.length > 0 ? (
                <ul className="space-y-1 text-xs">
                  {profile.learning_goals.map((goal, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-[#17191D]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{goal}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[#8C929B] italic">No active learning goals listed.</p>
              )}
            </div>
          </div>
        </GlassCard>

        {/* Section 4: Opportunity & Location Preferences */}
        <GlassCard className="space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-3 text-xs font-bold text-[#17191D]">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-600" />
              <h3>Opportunity & Location Preferences</h3>
            </div>
            <span className="text-[10px] text-[#8C929B]">Preferences</span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1.5">Preferred Opportunity Types</span>
              {profile?.preferred_opportunity_types && profile.preferred_opportunity_types.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {profile.preferred_opportunity_types.map((type, idx) => (
                    <Badge key={idx} variant="cyan">
                      {type}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-[#8C929B] italic">No preferred types specified.</p>
              )}
            </div>

            <div className="pt-2 border-t border-[#E2E5E9] grid grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1">Preferred Locations</span>
                {profile?.preferred_locations && profile.preferred_locations.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {profile.preferred_locations.map((loc, idx) => (
                      <span key={idx} className="text-[10px] font-bold text-[#17191D] bg-[#F8F9FB] border border-[#E2E5E9] px-2 py-0.5 rounded">
                        {loc}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#8C929B] italic">Not specified</p>
                )}
              </div>

              <div>
                <span className="text-[11px] text-[#646A73] uppercase font-bold block mb-1">Preferred Work Modes</span>
                {profile?.preferred_work_modes && profile.preferred_work_modes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {profile.preferred_work_modes.map((mode, idx) => (
                      <Badge key={idx} variant="indigo">
                        {mode}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-[#8C929B] italic">Not specified</p>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-[#E2E5E9] grid grid-cols-2 gap-3">
              <div className="p-2.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[10px] text-[#8C929B]">Min Expected Stipend</span>
                <p className="font-bold text-emerald-700">{profile?.min_stipend || 'Not specified'}</p>
              </div>

              <div className="p-2.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
                <span className="text-[10px] text-[#8C929B]">Expected Salary</span>
                <p className="font-bold text-[#0284C7]">{profile?.expected_salary || 'Not specified'}</p>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Edit Profile Modal */}
      {isEditOpen && (
        <ProfileEditModal
          profile={profile}
          onClose={() => setIsEditOpen(false)}
          onSaved={refreshProfile}
        />
      )}
    </div>
  );
}
