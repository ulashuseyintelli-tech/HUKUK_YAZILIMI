'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
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
  // PR-2A1: mutation hatasi GORUNUR; kayit uydurulmaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();
  // Stale bandindaki tekrar denemesi YALNIZ okuma yolunu calistirir; mutation ASLA tekrarlanmaz.
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadNotes({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  useEffect(() => {
    void loadNotes();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: okuma yolu hatayı YUTMAZ ve demo veri ÜRETMEZ.
  // `addNote`'un refresh'i budur; yutarsa `runMutation` tazeleme hatasını göremez,
  // yanlışlıkla SUCCESS üretir ve SUCCESS_STALE hiç çalışmaz.
  const loadNotes = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/notes`);
      const rows = (res as { data?: unknown })?.data;
      // Malformed yanıt GERÇEK EMPTY sayılmaz.
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setNotes(rows as Note[]);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Notlar yüklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    // PR-2A1: create yolunda idempotency anahtarı YOK → senkron kilit şart.
    await submitLock.run(async () => {
      setAdding(true);
      setActionError(null);
      setStaleNotice(null);

      const outcome = await runMutation({
        mutate: () => api.post(`/cases/${caseId}/notes`, { content: newNote, isPrivate }),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır; yerel not ÜRETİLMEZ
        // (eski davranış "optimistic update for demo" ile tam bunu yapıyordu).
        refresh: () => loadNotes({ propagateError: true }),
        failureMessage: 'Not kaydedilemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Not KAYDEDİLDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;
      setAdding(false);
      if (outcome.status === 'FAILED') {
        setActionError(outcome.error.message);
        return; // form KORUNUR, metin kaybolmaz
      }
      // SUCCESS ve SUCCESS_STALE: kayıt KESİNLEŞTİ → aynı payload yeniden gönderilemez.
      setNewNote('');
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const deleteNote = async (noteId: string) => {
    if (!confirm('Bu notu silmek istediğinize emin misiniz?')) return;
    setActionError(null);
    setStaleNotice(null);

    // PR-2A1: PESSIMISTIC silme + satır bazlı kilit. Eski davranış `catch` içinde de
    // satırı listeden çıkarıyordu → silme başarısızken not ekrandan kayboluyordu.
    // Anahtar kararlı kayıt kimliğidir (liste index'i DEĞİL).
    await rowLock.run(`note:${caseId}:${noteId}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/notes/${noteId}`),
        refresh: () => loadNotes({ propagateError: true }),
        failureMessage: 'Not silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
        staleMessage: 'Not SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      // Hata hâlinde satır ve seçim durumu AYNEN korunur — hiçbir state yazılmaz.
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
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
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {staleNotice ? (
        <div role="status" data-testid="stale-notice" className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{staleNotice}</span>
          <button type="button" onClick={handleStaleRefresh} disabled={refreshingStale} data-testid="stale-refresh" className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
            Listeyi yenile
          </button>
        </div>
      ) : null}
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
