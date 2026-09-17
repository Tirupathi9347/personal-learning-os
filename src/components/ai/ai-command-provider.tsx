'use client';

import { createContext, useContext, useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { CommandBar } from '@/components/ai/command-bar';

interface AICommandContextType {
  isCommandBarOpen: boolean;
  openCommandBar: () => void;
  closeCommandBar: () => void;
}

const AICommandContext = createContext<AICommandContextType>({
  isCommandBarOpen: false,
  openCommandBar: () => {},
  closeCommandBar: () => {},
});

export const useAICommand = () => useContext(AICommandContext);

export function AICommandProvider({ children }: { children: React.ReactNode }) {
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);

  const openCommandBar = () => setIsCommandBarOpen(true);
  const closeCommandBar = () => setIsCommandBarOpen(false);

  return (
    <AICommandContext.Provider value={{ isCommandBarOpen, openCommandBar, closeCommandBar }}>
      <div className="flex min-h-screen bg-[var(--exec-bg)] text-[var(--exec-text)]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
            {children}
          </main>
        </div>

        {/* Global AI Command Bar */}
        <CommandBar />
      </div>
    </AICommandContext.Provider>
  );
}
