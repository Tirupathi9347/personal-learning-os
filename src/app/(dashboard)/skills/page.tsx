import { getSkills } from '@/app/actions/skill-actions';
import { SkillsClient } from '@/components/skills/skills-client';

export const dynamic = 'force-dynamic';

export default async function SkillsPage() {
  const skills = await getSkills();
  return <SkillsClient initialSkills={skills} />;
}
