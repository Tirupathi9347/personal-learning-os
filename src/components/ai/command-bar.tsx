'use client';

import { useState } from 'react';
import { useAICommand } from './ai-command-provider';
import { submitNaturalLanguagePrompt } from '@/app/actions/ai-actions';
import { ConfirmationModal } from './confirmation-modal';
import { PendingAiAction } from '@/types';
import { Sparkles, X, ArrowRight, Loader2, Lightbulb } from 'lucide-react';
import { Input } from '@/components/ui/input';

const PROMPT_SUGGESTIONS = [
  'Add high priority task to revise CNN backpropagation by tomorrow',
  'Log today journal 90 mins python closures and leetcode DP',
  'Mark task CNN backpropagation as completed',
  'Create project AeroHub SEG system with active status',
];

export function CommandBar() {
  const { isCommandBarOpen, closeCommandBar } = useAICommand();
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Confirmation State
  const [pendingAction, setPendingAction] = useState<PendingAiAction | null>(null);

  if (!isCommandBarOpen && !pendingAction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);

    const res = await submitNaturalLanguagePrompt(prompt.trim());
    setIsProcessing(false);

    if (res.success && res.data) {
      setPendingAction(res.data);
      setPrompt('');
      closeCommandBar();
    } else {
      setErrorMessage(res.error || 'Failed to process command.');
    }
  };

  const handleSelectSuggestion = (text: string) => {
    setPrompt(text);
  };

  return (
    <>
      {isCommandBarOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 p-4 glass-backdrop">
          <div
            className="w-full max-w-2xl glass-modal overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-[#F8F9FB]">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-[#17191D]">
                <Sparkles className="w-4 h-4 text-[#0284C7]" />
                <span>AI COMMAND CENTER // NATURAL LANGUAGE ENGINE</span>
              </div>
              <button
                onClick={closeCommandBar}
                className="p-1 rounded-md text-[#8C929B] hover:text-[#17191D] hover:bg-[#EEF0F3] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Input Bar */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="relative">
                <Input
                  type="text"
                  autoFocus
                  placeholder="Tell the OS what to do (e.g. Add task, log journal, update progress)..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="pl-4 pr-12 py-3.5 text-sm font-sans"
                />
                <button
                  type="submit"
                  disabled={isProcessing || !prompt.trim()}
                  className="absolute right-2 top-2 p-2 bg-[#17191D] hover:bg-[#25282D] disabled:opacity-30 text-white rounded-md transition-all shadow-sm"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                </button>
              </div>

              {errorMessage && (
                <p className="text-xs text-rose-600 font-mono bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                  {errorMessage}
                </p>
              )}

              {/* Sample Prompt Pills */}
              <div className="space-y-2 pt-2">
                <span className="text-[11px] font-mono font-bold text-[#8C929B] uppercase flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 text-[#0284C7]" />
                  <span>Suggested Prompts:</span>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_SUGGESTIONS.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      className="text-left text-[11px] font-sans text-[#646A73] hover:text-[#17191D] bg-[#F8F9FB] hover:bg-[#EEF0F3] border border-[#E2E5E9] px-2.5 py-1 rounded-md transition-all"
                    >
                      &ldquo;{sug}&rdquo;
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E5E9] flex items-center justify-between text-[11px] font-mono text-[#8C929B]">
                <span>Gemini natural language parsing engine active</span>
                <div className="flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 bg-[#EEF0F3] border border-[#E2E5E9] rounded text-[#17191D] font-bold">Esc</kbd>
                  <span>to close</span>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Human-In-The-Loop Confirmation Modal */}
      {pendingAction && (
        <ConfirmationModal
          pendingAction={pendingAction}
          onClose={() => setPendingAction(null)}
        />
      )}
    </>
  );
}
