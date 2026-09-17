import React from 'react';
import { Metadata } from 'next';
import { LearningCoachView } from '@/components/agent/learning-coach-view';

export const metadata: Metadata = {
  title: 'Personal Learning Coach | Personal Learning OS',
  description: 'Evidence-aware personal learning coach and tailored roadmap generator.',
};

export const dynamic = 'force-dynamic';

export default function LearningCoachPage() {
  return (
    <div className="animate-page-entrance py-2">
      <LearningCoachView />
    </div>
  );
}
