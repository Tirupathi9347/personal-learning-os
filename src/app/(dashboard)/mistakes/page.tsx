import { getMistakes } from '@/app/actions/mistake-actions';
import { getSkills } from '@/app/actions/skill-actions';
import { MistakesClient } from '@/components/mistakes/mistakes-client';

export const dynamic = 'force-dynamic';

export default async function MistakesPage() {
  const [mistakes, skills] = await Promise.all([getMistakes(), getSkills()]);

  return <MistakesClient initialMistakes={mistakes} skills={skills} />;
}
