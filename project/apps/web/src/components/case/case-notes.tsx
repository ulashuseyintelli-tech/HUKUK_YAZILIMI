'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { StickyNote, Plus, Trash2, Clock, User } from 'lucide-react';

interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string; surname: string };
  isPrivate: boolean;
}

interface CaseNotesProps {
  caseId: string;
}

export function CaseNotes({ caseId }: CaseNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [caseId]);

  const loadNotes = async () => {
    try {
      const res = await api.get(`/cases/${caseId}/notes`);
      setNotes(res.data || []);
    } catch (e) {
      // Demo data
      setNotes([
        { id: '1', content: 'Borçlu ile telefon görüşmesi yapıldı. Taksit talebi var.', createdAt: new Date().toISOString(), isPrivate: false },
        { id: '2', content: 'Müvekkile bilgi verildi.', createdAt: new Date(Date.now() - 86400000).toISOString(), isPrivate: true },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    try {
      await api.post(`/cases/${caseId}/notes`, { content: newNote, isPrivate });
      setNewNote('');
      loadNotes();
    } catch (e) {
      // Optimistic update for demo
      setNotes(prev => [{
        id: Date.now().toString(),
        content: newNote,
        createdAt: new Date().toISOString(),
        isPrivate,
      }, ...prev]);
      setNewNote('');
    } finally {
      setAdding(false);
    }
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/cases/${caseId}/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="font-semibold flex items-center gap-2 mb-4">
        <StickyNote className="h-5 w-5 text-yellow-500" />
        Notlar
        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">{notes.length}</span>
      </h3>

      {/* Add Note */}
      <div className="mb-4">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Yeni not ekle..."
          className="w-full border rounded-lg p-3 text-sm resize-none"
          rows={2}
        />
        <div className="flex items-center justify-between mt-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-600">Özel not (sadece ben görebilirim)</span>
          </label>
          <button
            onClick={addNote}
            disabled={!newNote.trim() || adding}
            className="flex items-center gap-1 px-3 py-1.5 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {adding ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>

      {/* Notes List */}
      {loading ? (
        <div className="text-center py-4 text-gray-500 text-sm">Yükleniyor...</div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">Henüz not eklenmemiş</div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-3 rounded-lg border-l-4 ${
                note.isPrivate ? 'bg-purple-50 border-l-purple-400' : 'bg-yellow-50 border-l-yellow-400'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDate(note.createdAt)}
                  </span>
                  {note.createdBy && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {note.createdBy.name} {note.createdBy.surname}
                    </span>
                  )}
                  {note.isPrivate && (
                    <span className="px-1.5 py-0.5 bg-purple-200 text-purple-700 rounded text-xs">Özel</span>
                  )}
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
