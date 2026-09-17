import { getProjects } from '@/app/actions/project-actions';
import { ProjectsClient } from '@/components/projects/projects-client';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const projects = await getProjects();
  return <ProjectsClient initialProjects={projects} />;
}
