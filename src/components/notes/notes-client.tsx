'use client';

import { useState } from 'react';
import { Note } from '@/types';
import { getNotes, createNote, deleteNote } from '@/app/actions/note-actions';
import { FileText, Search, Plus, Trash2, Tag, Loader2, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { GlassCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface NotesClientProps {
  initialNotes: Note[];
}

export function NotesClient({ initialNotes }: NotesClientProps) {
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState('Computer Vision');
  const [tagsInput, setTagsInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    const data = await getNotes(query);
    setNotes(data);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const tagsArray = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const res = await createNote({
      title: title.trim(),
      content: content.trim(),
      category: category.trim() || 'General',
      tags: tagsArray,
    });

    setIsSubmitting(false);

    if (res.success) {
      setTitle('');
      setContent('');
      setTagsInput('');
      if (res.data) {
        setNotes([res.data, ...notes]);
      }
    } else {
      setErrorMessage(res.error || 'Failed to save note.');
    }
  };

  const handleDelete = async (id: string) => {
    setNotes(notes.filter((n) => n.id !== id));
    await deleteNote(id);
  };

  return (
    <div className="space-y-6 animate-page-entrance">
      <PageHeader
        icon={<FileText className="w-5 h-5 text-indigo-600" />}
        title="Knowledge Base & Notes Workspace"
        description="Searchable Markdown notes, conceptual documentation, and cheat sheets."
      />

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs font-mono text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search Input Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-[#8C929B] absolute left-3.5 top-3.5" />
        <Input
          type="text"
          placeholder="Search notes by keyword, concept, or title (e.g. Backpropagation, CNN, Decorators)..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10 pr-4 py-3"
        />
      </div>

      {/* New Note Form */}
      <GlassCard>
        <form onSubmit={handleCreate} className="space-y-4">
          <h3 className="text-xs font-mono font-bold text-[#17191D] uppercase tracking-wider">Add New Knowledge Note</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              type="text"
              placeholder="Note Title (e.g. CNN Backpropagation Calculus)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="md:col-span-2"
              required
            />
            <Input
              type="text"
              placeholder="Category (e.g. Computer Vision, Algorithms)"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <Textarea
            rows={4}
            placeholder="Markdown Note Content..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Input
              type="text"
              placeholder="Tags comma-separated (e.g. deep-learning, cnn, math)"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full sm:w-72"
            />

            <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()} variant="primary" size="md">
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Save Note</span>
            </Button>
          </div>
        </form>
      </GlassCard>

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="p-8 bg-[#F8F9FB] border border-[#E2E5E9] rounded-xl text-center text-xs font-mono text-[#8C929B]">
          No notes match your query. Add knowledge notes above.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {notes.map((note) => (
            <GlassCard key={note.id} className="space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between border-b border-[#E2E5E9] pb-2">
                  <span className="text-xs font-heading font-bold text-[#17191D]">{note.title}</span>
                  <Badge variant="indigo">{note.category || 'General'}</Badge>
                </div>
                <p className="text-xs text-[#17191D] whitespace-pre-wrap font-mono line-clamp-4 bg-[#F8F9FB] p-3 rounded-lg border border-[#E2E5E9]">
                  {note.content}
                </p>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {note.tags && note.tags.map((tag, idx) => (
                    <span key={idx} className="flex items-center gap-1 text-[10px] font-mono text-[#646A73] bg-[#EEF0F3] px-2 py-0.5 rounded border border-[#E2E5E9]">
                      <Tag className="w-2.5 h-2.5 text-[#0284C7]" />
                      {tag}
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => handleDelete(note.id)}
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
