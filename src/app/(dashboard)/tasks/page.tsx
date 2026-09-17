import { getTasks } from '@/app/actions/task-actions';
import { TasksClient } from '@/components/tasks/tasks-client';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const tasks = await getTasks();
  return <TasksClient initialTasks={tasks} />;
}
