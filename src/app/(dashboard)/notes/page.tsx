import { getNotes } from '@/app/actions/note-actions';
import { NotesClient } from '@/components/notes/notes-client';

export const dynamic = 'force-dynamic';

export default async function NotesPage() {
  const notes = await getNotes();
  return <NotesClient initialNotes={notes} />;
}
