'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
import { CheckSquare, Plus, Trash2, Edit, X, Check, Loader2, Square, GripVertical } from 'lucide-react';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  order: number;
  dueDate?: string;
  assignee?: string;
}

interface CaseChecklistProps {
  caseId: string;
}

export function CaseChecklist({ caseId }: CaseChecklistProps) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  // PR-2A1: mutation hatası GÖRÜNÜR; kalem uydurulmaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();
  // Stale bandındaki tekrar denemesi YALNIZ okuma yolunu çalıştırır; mutation ASLA tekrarlanmaz.
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadChecklist({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  useEffect(() => {
    void loadChecklist();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: okuma yolu hatayı YUTMAZ ve demo veri ÜRETMEZ.
  //  - initial load: hata state'e yazılır, promise KONTROLLÜ tamamlanır
  //  - mutation refresh (`propagateError: true`): hata çağırana propagate edilir; aksi
  //    hâlde `runMutation` tazeleme hatasını göremez ve SUCCESS_STALE hiç çalışmaz
  //  - malformed yanıt GERÇEK EMPTY sayılmaz
  const loadChecklist = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/checklist`);
      const rows = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setItems(rows as ChecklistItem[]);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Kontrol listesi yüklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    // PR-2A1: create yolunda idempotency anahtarı YOK → senkron kilit şart
    // (Enter tuşu + düğme aynı tick içinde iki POST üretebiliyordu).
    await submitLock.run(async () => {
      setSaving(true);
      setActionError(null);
      setStaleNotice(null);

      const outcome = await runMutation({
        mutate: () => api.post(`/cases/${caseId}/checklist`, { text: newItemText }),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır; yerel kalem ÜRETİLMEZ.
        refresh: () => loadChecklist({ propagateError: true }),
        failureMessage: 'Madde eklenemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Madde EKLENDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;
      setSaving(false);
      if (outcome.status === 'FAILED') {
        // `setNewItemText('')` eskiden `finally` içindeydi → hata hâlinde de metin
        // siliniyordu. Artık metin KORUNUR, kullanıcı yeniden gönderebilir.
        setActionError(outcome.error.message);
        return;
      }
      setNewItemText('');
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    setActionError(null);
    setStaleNotice(null);

    // PR-2A1: yerel güncelleme `try/catch` DIŞINDA idi → istek başarısız olsa bile madde
    // "tamamlandı" görünüyordu. Artık yalnız sunucu kabul ettikten sonra değişir.
    // Anahtar kararlı kayıt kimliğidir (liste index'i DEĞİL); aynı maddeye ikinci tık
    // hiç başlamaz, farklı maddeler birbirini bloklamaz.
    await rowLock.run(`checklist:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () =>
          api.patch(`/cases/${caseId}/checklist/${id}`, { completed: !item.completed }),
        refresh: () => loadChecklist({ propagateError: true }),
        failureMessage: 'Madde durumu güncellenemedi. Kayıt DEĞİŞMEDİ.',
        staleMessage: 'Madde durumu GÜNCELLENDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;

    setActionError(null);
    setStaleNotice(null);
    const targetId = editingId;

    // PR-2A1: düzenleme kapanışı (`setEditingId(null)`) eskiden hata hâlinde de
    // çalışıyordu → kullanıcı değişikliği kaydedilmiş sanıyordu. Artık alan yalnız
    // sunucu kabul ettikten sonra kapanır.
    await rowLock.run(`checklist:${caseId}:${targetId}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.patch(`/cases/${caseId}/checklist/${targetId}`, { text: editText }),
        refresh: () => loadChecklist({ propagateError: true }),
        failureMessage: 'Madde güncellenemedi. Kayıt DEĞİŞMEDİ, lütfen tekrar deneyin.',
        staleMessage: 'Madde GÜNCELLENDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') {
        setActionError(outcome.error.message);
        return; // düzenleme alanı ve metin KORUNUR
      }
      setEditingId(null);
      setEditText('');
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    setStaleNotice(null);

    // PR-2A1: PESSIMISTIC silme. Satır çıkarma `try/catch` DIŞINDA idi → silme
    // başarısız olsa bile madde ekrandan kayboluyordu. Artık yalnız sunucu kabul
    // ettikten sonra kaybolur; hata hâlinde satır ve seçim durumu AYNEN korunur.
    await rowLock.run(`checklist:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/checklist/${id}`),
        refresh: () => loadChecklist({ propagateError: true }),
        failureMessage: 'Madde silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
        staleMessage: 'Madde SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PR-2A1: okuma ve mutation hataları GÖRÜNÜR; sessizce yutulmaz. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {/* Mutation başarılı ama tazeleme başarısız → kayıt durur, görünüm bayat.
          Band liste yüzeyindedir ve yalnız başarılı tazelemede temizlenir. */}
      {staleNotice ? (
        <div
          role="status"
          data-testid="stale-notice"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">{staleNotice}</span>
          <button
            type="button"
            onClick={handleStaleRefresh}
            disabled={refreshingStale}
            data-testid="stale-refresh"
            className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Listeyi yenile
          </button>
        </div>
      ) : null}

      {/* Progress */}
      {totalCount > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">İlerleme</span>
            <span className="font-medium">{completedCount}/{totalCount} (%{progressPercent})</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Add New Item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
          placeholder="Yeni madde ekle..."
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={handleAddItem}
          disabled={!newItemText.trim() || saving}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>

      {/* Checklist Items */}
      {items.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <CheckSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz kontrol listesi maddesi yok</p>
        </div>
      ) : (
        <div className="space-y-1">
          {items.sort((a, b) => a.order - b.order).map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 group ${
                item.completed ? 'bg-green-50/50' : ''
              }`}
            >
              <button
                onClick={() => handleToggle(item.id)}
                className={`p-1 rounded ${
                  item.completed 
                    ? 'text-green-600 hover:text-green-700' 
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {item.completed ? (
                  <CheckSquare className="h-5 w-5" />
                ) : (
                  <Square className="h-5 w-5" />
                )}
              </button>

              {editingId === item.id ? (
                <div className="flex-1 flex gap-2">
                  <input
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                    className="flex-1 border rounded px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="p-1 text-green-600 hover:bg-green-50 rounded"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${item.completed ? 'line-through text-gray-400' : ''}`}>
                    {item.text}
                  </span>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 transition-opacity">
                    <button
                      onClick={() => handleEdit(item)}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
