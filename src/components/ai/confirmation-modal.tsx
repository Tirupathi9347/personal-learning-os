'use client';

import { useState } from 'react';
import { applyPendingAction, rejectPendingAction } from '@/app/actions/ai-actions';
import { PendingAiAction } from '@/types';
import { ShieldCheck, Check, X, Edit2, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface ConfirmationModalProps {
  pendingAction: PendingAiAction;
  onClose: () => void;
}

export function ConfirmationModal({
  pendingAction,
  onClose,
}: ConfirmationModalProps) {
  const [editedPayloadJson, setEditedPayloadJson] = useState(
    JSON.stringify(pendingAction.proposed_changes, null, 2)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleApply = async () => {
    let finalPayload = pendingAction.proposed_changes;
    if (isEditing) {
      try {
        finalPayload = JSON.parse(editedPayloadJson);
      } catch {
        setErrorMessage('Invalid JSON format in payload editor.');
        return;
      }
    }

    setIsApplying(true);
    setErrorMessage(null);

    const res = await applyPendingAction(pendingAction.id, finalPayload);
    setIsApplying(false);

    if (res.success) {
      onClose();
      window.location.reload();
    } else {
      setErrorMessage(res.error || 'Failed to apply action.');
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    await rejectPendingAction(pendingAction.id);
    setIsRejecting(false);
    onClose();
  };

  const summaryText = pendingAction.proposed_changes?.summary || pendingAction.raw_prompt;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 glass-backdrop">
      <div
        className="w-full max-w-xl glass-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E2E5E9] flex items-center justify-between bg-emerald-50/60">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-emerald-800">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>CONFIRMATION GATE // HUMAN REVIEW REQUIRED</span>
          </div>
          <Badge variant="emerald">PROPOSED ACTION</Badge>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 font-sans text-xs">
          <div className="p-3 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl space-y-1">
            <span className="text-[10px] font-mono font-bold text-[#8C929B] uppercase">Proposed Summary:</span>
            <p className="font-medium text-[#17191D]">{summaryText}</p>
          </div>

          {/* JSON Payload Inspector & Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-[#646A73] uppercase">Structured Mutation Payload:</span>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className="flex items-center gap-1 text-[11px] font-mono font-semibold text-[#0284C7] hover:underline"
              >
                <Edit2 className="w-3 h-3" />
                <span>{isEditing ? 'View JSON' : 'Edit JSON'}</span>
              </button>
            </div>

            {isEditing ? (
              <Textarea
                rows={8}
                value={editedPayloadJson}
                onChange={(e) => setEditedPayloadJson(e.target.value)}
                className="font-mono text-xs bg-white text-[#17191D]"
              />
            ) : (
              <pre className="p-3.5 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl font-mono text-[11px] text-[#17191D] overflow-x-auto max-h-48">
                {JSON.stringify(pendingAction.proposed_changes, null, 2)}
              </pre>
            )}
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E2E5E9]">
            <Button
              type="button"
              onClick={handleReject}
              disabled={isRejecting || isApplying}
              variant="outline"
              size="md"
            >
              {isRejecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              <span>Reject & Cancel</span>
            </Button>

            <Button
              type="button"
              onClick={handleApply}
              disabled={isApplying || isRejecting}
              variant="primary"
              size="md"
            >
              {isApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 text-emerald-400" />}
              <span>Confirm & Apply Action</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
