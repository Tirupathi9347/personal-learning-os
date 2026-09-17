'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  CheckSquare, 
  BookOpen, 
  FileText, 
  FolderGit2, 
  Award, 
  Clock, 
  ShieldAlert, 
  GitBranch, 
  Code2, 
  TrendingUp, 
  Search, 
  Settings, 
  History,
  Sparkles,
  Compass,
  User,
  Brain,
  Milestone
} from 'lucide-react';

const NAV_GROUPS = [
  {
    name: 'Core',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard },
      { name: 'Learning Coach', href: '/learning-coach', icon: Brain },
      { name: 'Learning Path', href: '/learning-path', icon: Milestone },
      { name: 'Student Profile', href: '/profile', icon: User },
      { name: 'Opportunity Hub', href: '/opportunities', icon: Compass },
      { name: 'Tasks', href: '/tasks', icon: CheckSquare },
      { name: 'Journal', href: '/journal', icon: BookOpen },
      { name: 'Knowledge Base', href: '/notes', icon: FileText },
      { name: 'Project Hub', href: '/projects', icon: FolderGit2 },
      { name: 'Skills Graph', href: '/skills', icon: Award },
    ],
  },
  {
    name: 'Productivity',
    items: [
      { name: 'Focus Timer', href: '/time', icon: Clock },
      { name: 'Mistake Engine', href: '/mistakes', icon: ShieldAlert },
    ],
  },
  {
    name: 'Integrations',
    items: [
      { name: 'GitHub Hub', href: '/github', icon: GitBranch },
      { name: 'LeetCode', href: '/leetcode', icon: Code2 },
    ],
  },
  {
    name: 'Analytics',
    items: [
      { name: 'Search', href: '/search', icon: Search },
      { name: 'Analytics', href: '/analytics', icon: TrendingUp },
    ],
  },
  {
    name: 'System',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings },
      { name: 'Action History', href: '/history', icon: History },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[var(--exec-surface)] border-r border-[var(--exec-border)] min-h-screen flex flex-col justify-between p-4 shrink-0 font-sans shadow-sm transition-all duration-200">
      <div className="space-y-6">
        {/* Brand Executive Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-8 h-8 rounded-lg bg-[#17191D] dark:bg-[#242930] flex items-center justify-center text-white shadow-sm border border-[var(--exec-border)]">
            <Sparkles className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <h2 className="text-xs font-mono font-extrabold text-[var(--exec-text)] tracking-wider uppercase">
              System Command
            </h2>
            <span className="text-[10px] font-mono text-[var(--exec-text-subtle)] block">EXECUTIVE WORKFLOW</span>
          </div>
        </div>

        {/* Grouped Navigation Links */}
        <nav className="space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.name} className="space-y-1">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--exec-text-subtle)] px-2 block">
                {group.name}
              </span>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) group ${
                        isActive
                          ? 'bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 font-bold border-r-2 border-sky-600 dark:border-sky-400 shadow-xs translate-x-0.5'
                          : 'text-[var(--exec-text-muted)] hover:text-[var(--exec-text)] hover:bg-[var(--exec-surface-secondary)] hover:translate-x-0.5'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive ? 'text-sky-600 dark:text-sky-400' : 'text-[var(--exec-text-subtle)] group-hover:text-[var(--exec-text)]'}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Vitality System Footer */}
      <div className="pt-4 border-t border-[var(--exec-border)] space-y-2">
        <div className="p-2.5 bg-[var(--exec-surface-secondary)] border border-[var(--exec-border)] rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono font-semibold text-[var(--exec-text)]">Sys Operational</span>
          </div>
          <span className="text-[9px] font-mono text-[var(--exec-text-subtle)] uppercase font-bold">RSC Active</span>
        </div>
      </div>
    </aside>
  );
}
