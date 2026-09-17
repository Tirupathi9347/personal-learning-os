'use client';

import { useState, useEffect } from 'react';
import { GitHubActivityLog, Project, ProjectStatus } from '@/types';
import { createProject, updateProjectStatus, deleteProject } from '@/app/actions/project-actions';
import { getProjectLatestCommits } from '@/app/actions/github-actions';
import { FolderGit2, Plus, Trash2, ExternalLink, Loader2, AlertCircle, GitCommit } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select } from '@/components/ui/input';

function ProjectCommitsFeed({ repoUrl }: { repoUrl: string }) {
  const [commits, setCommits] = useState<GitHubActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getProjectLatestCommits(repoUrl).then((res) => {
      setCommits(res);
      setIsLoading(false);
    });
  }, [repoUrl]);

  if (isLoading || commits.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-[#E2E5E9] space-y-1">
      <span className="text-[10px] font-mono font-bold text-[#646A73] flex items-center gap-1">
        <GitCommit className="w-3 h-3 text-[#0284C7]" />
        <span>Recent Commits:</span>
      </span>
      <div className="space-y-1">
        {commits.map((c) => (
          <div key={c.id} className="text-[11px] text-[#17191D] font-mono flex items-center justify-between bg-[#F8F9FB] px-2.5 py-1 rounded-lg border border-[#E2E5E9]">
            <span className="truncate max-w-[80%]">{c.message}</span>
            <span className="text-[9px] text-[#8C929B]">{new Date(c.occurred_at).toLocaleDateString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProjectsClientProps {
  initialProjects: Project[];
}

export function ProjectsClient({ initialProjects }: ProjectsClientProps) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [githubUrl, setGithubUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await createProject({
      title: title.trim(),
      description: description.trim() || null,
      status,
      github_repo_url: githubUrl.trim() || null,
    });

    setIsSubmitting(false);

    if (res.success) {
      setTitle('');
      setDescription('');
      setGithubUrl('');
      if (res.data) {
        setProjects([res.data, ...projects]);
      }
    } else {
      setErrorMessage(res.error || 'Failed to create project.');
    }
  };

  const handleStatusChange = async (id: string, newStatus: ProjectStatus) => {
    setProjects(projects.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    await updateProjectStatus(id, newStatus);
  };

  const handleDelete = async (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
    await deleteProject(id);
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<FolderGit2 className="w-5 h-5 text-[#0284C7]" />}
        title="Project Management Workspace"
        description="Track learning projects, goals, and GitHub repository linkages."
      />

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Create Project Form */}
      <GlassCard>
        <form onSubmit={handleCreate} className="space-y-4">
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase tracking-wider">Create New Learning Project</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="Project Title (e.g. AeroHub SEG System)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="GitHub Repo URL (optional)"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                className="flex-1"
              />
              <Select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              >
                <option value="active">Active</option>
                <option value="planning">Planning</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>

          <Textarea
            rows={2}
            placeholder="Project Objectives & Scope..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="resize-none"
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting || !title.trim()} variant="primary" size="md">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Create Project</span>
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Project Cards Grid */}
      {projects.length === 0 ? (
        <div className="p-8 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
          No active projects found. Create your first project above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <GlassCard key={project.id} className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                  <span className="text-xs font-heading font-bold text-[#17191D]">{project.title}</span>
                  <Select
                    value={project.status}
                    onChange={(e) => handleStatusChange(project.id, e.target.value as ProjectStatus)}
                    className="text-[10px] font-mono font-bold uppercase py-0.5 text-[#0284C7]"
                  >
                    <option value="active">Active</option>
                    <option value="planning">Planning</option>
                    <option value="paused">Paused</option>
                    <option value="completed">Completed</option>
                  </Select>
                </div>

                {project.description && (
                  <p className="text-xs text-[#646A73] font-sans line-clamp-2">{project.description}</p>
                )}

                {/* Feature C: Live Project Commits Feed */}
                {project.github_repo_url && (
                  <ProjectCommitsFeed repoUrl={project.github_repo_url} />
                )}
              </div>

              <div className="pt-3 border-t border-[#E2E5E9] flex items-center justify-between">
                {project.github_repo_url ? (
                  <a
                    href={project.github_repo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] font-mono text-[#0284C7] hover:underline font-bold"
                  >
                    <FolderGit2 className="w-3.5 h-3.5" />
                    <span>View Repository</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-[11px] font-mono text-[#8C929B]">No repo linked</span>
                )}

                <button
                  onClick={() => handleDelete(project.id)}
                  className="p-1.5 rounded text-[#8C929B] hover:text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
