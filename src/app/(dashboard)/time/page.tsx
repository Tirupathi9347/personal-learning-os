import { getTimeSessions, getTimeTotals } from '@/app/actions/time-actions';
import { getTasks } from '@/app/actions/task-actions';
import { getProjects } from '@/app/actions/project-actions';
import { getSkills } from '@/app/actions/skill-actions';
import { TimeClient } from '@/components/time/time-client';

export const dynamic = 'force-dynamic';

export default async function TimeTrackingPage() {
  const [sessions, totals, tasks, projects, skills] = await Promise.all([
    getTimeSessions(),
    getTimeTotals(),
    getTasks(),
    getProjects(),
    getSkills(),
  ]);

  return (
    <TimeClient
      initialSessions={sessions}
      initialTotals={totals}
      tasks={tasks}
      projects={projects}
      skills={skills}
    />
  );
}
