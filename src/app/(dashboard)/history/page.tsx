'use client';

import { useState, useEffect } from 'react';
import { ActionHistoryItem } from '@/types';
import { getActionHistory, undoActionHistory } from '@/app/actions/ai-actions';
import { History, RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function HistoryPage() {
  const [history, setHistory] = useState<ActionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchHistory = async () => {
    setIsLoading(true);
    const data = await getActionHistory();
    setHistory(data);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleUndo = async (id: string) => {
    setUndoingId(id);
    setMessage(null);

    const res = await undoActionHistory(id);
    setUndoingId(null);

    if (res.success) {
      setMessage('Action reversed successfully! Task/Journal states updated.');
      fetchHistory();
    } else {
      setMessage(`Undo failed: ${res.error}`);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={<History className="w-5 h-5 text-[#0284C7]" />}
        title="AI Action History & Reversal Workspace"
        description="View and 1-click undo past AI confirmation actions."
      />

      {message && (
        <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl text-xs font-mono text-sky-900 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {isLoading ? (
        <GlassCard className="p-8 text-center text-xs font-mono text-[#8C929B] flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-[#0284C7]" />
          <span>Loading action history...</span>
        </GlassCard>
      ) : history.length === 0 ? (
        <div className="p-8 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
          No AI actions executed yet. Use <kbd className="px-1.5 py-0.5 bg-white border border-[#E2E5E9] rounded text-[#17191D]">⌘K</kbd> to enter natural language updates.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <GlassCard
              key={item.id}
              className="p-4 flex items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={item.status === 'applied' ? 'emerald' : 'amber'}>
                    {item.status}
                  </Badge>
                  <h4 className="text-xs font-semibold text-[#17191D]">{item.description}</h4>
                </div>
                <div className="text-[10px] text-[#8C929B] font-mono">
                  Executed at: {new Date(item.executed_at).toLocaleString()}
                </div>
              </div>

              {item.status === 'applied' && (
                <Button
                  type="button"
                  onClick={() => handleUndo(item.id)}
                  disabled={undoingId === item.id}
                  variant="outline"
                  size="sm"
                >
                  {undoingId === item.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                  )}
                  <span>Undo Action</span>
                </Button>
              )}
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
