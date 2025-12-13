'use client';

import { useState, useEffect } from 'react';
import { StickyNote, Plus, X, Pin, Bell, Trash2, Edit, Check, Loader2 } from 'lucide-react';

interface Note {
  id: string;
  content: string;
  color: string;
  isPinned: boolean;
  reminder?: string;
  createdAt: string;
  updatedAt: string;
}

interface StickyNotesProps {
  maxNotes?: number;
}

const COLORS = [
  { id: 'yellow', bg: 'bg-yellow-100', border: 'border-yellow-300' },
  { id: 'blue', bg: 'bg-blue-100', border: 'border-blue-300' },
  { id: 'green', bg: 'bg-green-100', border: 'border-green-300' },
  { id: 'pink', bg: 'bg-pink-100', border: 'border-pink-300' },
  { id: 'purple', bg: 'bg-purple-100', border: 'border-purple-300' },
  { id: 'orange', bg: 'bg-orange-100', border: 'border-orange-300' },
];

const STORAGE_KEY = 'stickyNotes';

export function StickyNotes({ maxNotes = 6 }: StickyNotesProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showColorPicker, setShowColorPicker] = useState<string | null>(null);

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setNotes(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  const saveNotes = (list: Note[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setNotes(list);
  };

  const handleAddNote = () => {
    if (notes.length >= maxNotes) {
      alert(`Maksimum ${maxNotes} not ekleyebilirsiniz`);
      return;
    }

    const newNote: Note = {
      id: Date.now().toString(),
      content: '',
      color: 'yellow',
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    saveNotes([newNote, ...notes]);
    setEditingId(newNote.id);
    setEditContent('');
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    
    saveNotes(notes.map(n => 
      n.id === editingId 
        ? { ...n, content: editContent, updatedAt: new Date().toISOString() }
        : n
    ));
    setEditingId(null);
    setEditContent('');
  };

  const handleDelete = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id));
  };

  const handleTogglePin = (id: string) => {
    saveNotes(notes.map(n => 
      n.id === id ? { ...n, isPinned: !n.isPinned } : n
    ));
  };

  const handleChangeColor = (id: string, color: string) => {
    saveNotes(notes.map(n => 
      n.id === id ? { ...n, color } : n
    ));
    setShowColorPicker(null);
  };

  const handleSetReminder = (id: string) => {
    const date = prompt('Hatırlatma tarihi (YYYY-MM-DD):');
    if (date) {
      saveNotes(notes.map(n => 
        n.id === id ? { ...n, reminder: date } : n
      ));
    }
  };

  const getColorClasses = (colorId: string) => {
    return COLORS.find(c => c.id === colorId) || COLORS[0];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  // Sort: pinned first, then by updated date
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Hızlı Notlar
          <span className="text-xs text-gray-400">({notes.length}/{maxNotes})</span>
        </h3>
        <button
          onClick={handleAddNote}
          disabled={notes.length >= maxNotes}
          className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Notes Grid */}
      {notes.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <StickyNote className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz not yok</p>
          <button
            onClick={handleAddNote}
            className="mt-2 text-blue-600 hover:underline text-sm"
          >
            İlk notu ekle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {sortedNotes.map((note) => {
            const colorClasses = getColorClasses(note.color);
            const isEditing = editingId === note.id;

            return (
              <div
                key={note.id}
                className={`relative p-3 rounded-lg border-2 ${colorClasses.bg} ${colorClasses.border} min-h-[120px]`}
              >
                {/* Actions */}
                <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleTogglePin(note.id)}
                    className={`p-1 rounded ${note.isPinned ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setShowColorPicker(showColorPicker === note.id ? null : note.id)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-400" />
                  </button>
                  <button
                    onClick={() => handleSetReminder(note.id)}
                    className={`p-1 rounded ${note.reminder ? 'text-orange-600' : 'text-gray-400 hover:text-orange-600'}`}
                  >
                    <Bell className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Color Picker */}
                {showColorPicker === note.id && (
                  <div className="absolute top-8 right-1 bg-white rounded-lg shadow-lg border p-2 flex gap-1 z-10">
                    {COLORS.map((color) => (
                      <button
                        key={color.id}
                        onClick={() => handleChangeColor(note.id, color.id)}
                        className={`w-5 h-5 rounded-full ${color.bg} ${color.border} border-2 ${
                          note.color === color.id ? 'ring-2 ring-blue-500' : ''
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Pin indicator */}
                {note.isPinned && (
                  <Pin className="absolute top-1 left-1 h-3 w-3 text-blue-600" />
                )}

                {/* Content */}
                {isEditing ? (
                  <div className="pt-4">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-20 bg-transparent border-none resize-none focus:outline-none text-sm"
                      placeholder="Not yazın..."
                      autoFocus
                    />
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditingId(null); setEditContent(''); }}
                        className="p-1 text-gray-500 hover:bg-white/50 rounded"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        className="p-1 text-green-600 hover:bg-white/50 rounded"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="pt-4 cursor-pointer min-h-[80px]"
                    onClick={() => { setEditingId(note.id); setEditContent(note.content); }}
                  >
                    {note.content ? (
                      <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">Düzenlemek için tıklayın...</p>
                    )}
                  </div>
                )}

                {/* Footer */}
                <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(note.updatedAt)}</span>
                  {note.reminder && (
                    <span className="flex items-center gap-0.5 text-orange-600">
                      <Bell className="h-3 w-3" />
                      {formatDate(note.reminder)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
