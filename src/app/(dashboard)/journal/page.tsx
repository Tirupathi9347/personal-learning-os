import { getJournalEntries } from '@/app/actions/journal-actions';
import { JournalClient } from '@/components/journal/journal-client';

export const dynamic = 'force-dynamic';

export default async function JournalPage() {
  const entries = await getJournalEntries();
  return <JournalClient initialEntries={entries} />;
}
