'use client';

import { useTheme } from './theme-provider';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
      title={`Switch to ${resolvedTheme === 'dark' ? 'Light' : 'Dark'} Mode`}
      className={`rounded-full px-2.5 py-1.5 transition-all duration-200 ${className || ''}`}
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-3.5 h-3.5 text-amber-400 animate-in spin-in-90 duration-200" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-slate-700 animate-in spin-in-90 duration-200" />
      )}
      <span className="text-[11px] font-mono font-bold uppercase hidden md:inline">
        {resolvedTheme === 'dark' ? 'Light' : 'Dark'}
      </span>
    </Button>
  );
}
