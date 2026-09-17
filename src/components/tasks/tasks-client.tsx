'use client';

import { useState } from 'react';
import { Task, TaskPriority, TaskStatus } from '@/types';
import { createTask, updateTaskStatus, deleteTask } from '@/app/actions/task-actions';
import { CheckSquare, Plus, Trash2, CheckCircle, Clock, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface TasksClientProps {
  initialTasks: Task[];
}

export function TasksClient({ initialTasks }: TasksClientProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const res = await createTask({
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: dueDate || null,
    });

    setTitle('');
    setDescription('');
    setDueDate('');
    setIsSubmitting(false);

    if (res.data) {
      setTasks([res.data, ...tasks]);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'todo' : 'completed';
    setTasks(
      tasks.map((t) => (t.id === task.id ? { ...t, status: nextStatus, completed_at: nextStatus === 'completed' ? new Date().toISOString() : null } : t))
    );
    await updateTaskStatus(task.id, nextStatus);
  };

  const handleDelete = async (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
    await deleteTask(id);
  };

  const pendingTasks = tasks.filter((t) => t.status === 'todo');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<CheckSquare className="w-5 h-5 text-[#0284C7]" />}
        title="Task Productivity Workspace"
        description="Organize, prioritize, and track your daily learning and development tasks."
      />

      {/* Manual Task Add Form */}
      <GlassCard>
        <form onSubmit={handleCreate} className="space-y-4">
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase tracking-wider">Add New Task</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              type="text"
              placeholder="Task Title (e.g. Revise CNN backpropagation)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="md:col-span-2"
              required
            />
            <div className="flex gap-2">
              <Select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </Select>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !title.trim()} variant="primary" size="md">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Add Task</span>
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Task List */}
      <div className="space-y-6">
        {/* Pending Section */}
        <div className="space-y-3">
          <h3 className="text-xs font-mono font-bold text-[#17191D] flex items-center gap-2 uppercase tracking-wider">
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Pending Tasks ({pendingTasks.length})</span>
          </h3>

          {pendingTasks.length === 0 ? (
            <div className="p-6 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
              No pending tasks.
            </div>
          ) : (
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <GlassCard
                  key={task.id}
                  className="p-3.5 flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleStatus(task)}
                      className="w-5 h-5 rounded border border-[#E2E5E9] bg-white flex items-center justify-center hover:border-emerald-500 text-transparent hover:text-emerald-600 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <div>
                      <h4 className="text-xs font-medium text-[#17191D]">{task.title}</h4>
                      {task.due_date && (
                        <span className="text-[10px] font-mono text-[#646A73]">Due: {task.due_date}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant={task.priority === 'high' ? 'amber' : 'slate'}>
                      {task.priority}
                    </Badge>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="p-1 rounded text-[#8C929B] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>

        {/* Completed Section */}
        {completedTasks.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[#E2E5E9]">
            <h3 className="text-xs font-mono font-bold text-[#646A73] flex items-center gap-2 uppercase tracking-wider">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>Completed Tasks ({completedTasks.length})</span>
            </h3>

            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleToggleStatus(task)}
                      className="w-5 h-5 rounded border border-emerald-300 bg-emerald-50 flex items-center justify-center text-emerald-700"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <h4 className="text-xs font-medium text-[#646A73] line-through">{task.title}</h4>
                  </div>

                  <button
                    onClick={() => handleDelete(task.id)}
                    className="p-1 rounded text-[#8C929B] hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
