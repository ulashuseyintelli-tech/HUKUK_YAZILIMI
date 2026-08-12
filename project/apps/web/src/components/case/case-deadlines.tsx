'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
import { Calendar, Clock, AlertTriangle, Plus, Edit, Trash2, Check, X, Loader2, Bell } from 'lucide-react';

interface Deadline {
  id: string;
  title: string;
  type: 'TEBLIGAT' | 'ITIRAZ' | 'TEMYIZ' | 'HACIZ' | 'SATIS' | 'DIGER';
  dueDate: string;
  reminderDays: number;
  isCompleted: boolean;
  notes?: string;
  createdAt: string;
}

interface CaseDeadlinesProps {
  caseId: string;
}

const DEADLINE_TYPES = [
  { id: 'TEBLIGAT', label: 'Tebligat Süresi', color: 'blue', defaultDays: 7 },
  { id: 'ITIRAZ', label: 'İtiraz Süresi', color: 'orange', defaultDays: 7 },
  { id: 'TEMYIZ', label: 'Temyiz Süresi', color: 'purple', defaultDays: 15 },
  { id: 'HACIZ', label: 'Haciz Talebi', color: 'red', defaultDays: 30 },
  { id: 'SATIS', label: 'Satış Talebi', color: 'green', defaultDays: 60 },
  { id: 'DIGER', label: 'Diğer', color: 'gray', defaultDays: 7 },
];

export function CaseDeadlines({ caseId }: CaseDeadlinesProps) {
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // PR-2A1: mutation hatasi GORUNUR olmali; sure kaydi uydurulamaz (zamanasimi riski).
  const [actionError, setActionError] = useState<string | null>(null);
  // Mutation BASARILI ama liste tazelenemedi -> kayit durur, gorunum bayat.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();

  const [formData, setFormData] = useState({
    title: '',
    type: 'DIGER' as Deadline['type'],
    dueDate: '',
    reminderDays: 3,
    notes: '',
  });

  useEffect(() => {
    void loadDeadlines();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: okuma yolu hatayi YUTMAZ ve demo veri URETMEZ.
  //
  // Iki cagrim ACIKCA ayrilir (bos catch/suppression YOK — bu programin kendi kurali):
  //  - initial load: hata state'e yazilir, promise KONTROLLU tamamlanir
  //  - mutation refresh (`propagateError: true`): ayni hata state'e yazilir VE cagirana
  //    propagate edilir; aksi halde `runMutation` refresh basarisizligini goremez,
  //    yanlislikla SUCCESS uretir ve SUCCESS_STALE hic calismaz.
  //
  // Malformed yanit GERCEK EMPTY sayilmaz: `data` dizi degilse dogrulanmis bos liste
  // degildir -> gorunur load error + refresh failure.
  const loadDeadlines = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/deadlines`);
      const rows = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) {
        throw new Error('MALFORMED_LIST_RESPONSE');
      }
      setDeadlines(rows as never);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Süreler yüklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.title || !formData.dueDate) return;
    // PR-2A1: senkron kilit -> hizli cift tik ikinci bir POST uretmez.
    await submitLock.run(async () => {
      setSaving(true);
      setActionError(null);
      setStaleNotice(null);

      const outcome = await runMutation({
        mutate: () =>
          editingId
            ? api.patch(`/cases/${caseId}/deadlines/${editingId}`, formData)
            : api.post(`/cases/${caseId}/deadlines`, formData),
        // Basari YALNIZ sunucudan yeniden okunarak yansitilir; form verisinden kayit
        // URETILMEZ. Eski davranis sureyi yerel uyduruyordu = takip edilmeyen sure.
        refresh: () => loadDeadlines({ propagateError: true }),
        failureMessage: 'Süre kaydedilemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Süre KAYDEDİLDİ, ancak liste yenilenemedi. Görünen liste bayat olabilir.',
      });

      if (!submitLock.isMounted()) return;

      setSaving(false);
      if (outcome.status === 'FAILED') {
        setActionError(outcome.error.message);
        return; // form KORUNUR, yeniden gonderilebilir
      }
      // SUCCESS ve SUCCESS_STALE: kayit KESINLESTI -> ayni payload yeniden gonderilemez.
      resetForm();
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleEdit = (deadline: Deadline) => {
    setEditingId(deadline.id);
    setFormData({
      title: deadline.title,
      type: deadline.type,
      dueDate: deadline.dueDate.split('T')[0],
      reminderDays: deadline.reminderDays,
      notes: deadline.notes || '',
    });
    setShowForm(true);
  };

  const handleToggleComplete = async (id: string) => {
    const deadline = deadlines.find(d => d.id === id);
    if (!deadline) return;

    // PR-2A1: yerel guncelleme eskiden try/catch DISINDA idi -> istek basarisiz olsa bile
    // sure "tamamlandi" gorunuyordu. Artik yalniz sunucu kabul ettikten sonra degisir.
    setActionError(null);
    setStaleNotice(null);
    // Anahtar kararli kayit kimligidir (liste index'i DEGIL).
    await rowLock.run(`deadline:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () =>
          api.patch(`/cases/${caseId}/deadlines/${id}`, { isCompleted: !deadline.isCompleted }),
        refresh: () => loadDeadlines({ propagateError: true }),
        failureMessage: 'Süre durumu güncellenemedi. Kayıt DEĞİŞMEDİ.',
        staleMessage: 'Süre durumu GÜNCELLENDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu son tarihi silmek istediğinize emin misiniz?')) return;

    // PR-2A1: PESSIMISTIC silme. Satir yalniz sunucu silmeyi kabul ettikten sonra kaybolur.
    setActionError(null);
    setStaleNotice(null);
    await rowLock.run(`deadline:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/deadlines/${id}`),
        refresh: () => loadDeadlines({ propagateError: true }),
        failureMessage: 'Süre silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
        staleMessage: 'Süre SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      // Hata halinde satir ve secim durumu AYNEN korunur.
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  // PR-2A1: stale bandindaki tekrar denemesi YALNIZ okuma yolunu calistirir.
  // Mutation callback'i ASLA yeniden cagrilmaz -> cift kayit uretilemez.
  const [refreshingStale, setRefreshingStale] = useState(false);
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadDeadlines({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null); // basarili tazeleme -> band TEMIZLENIR
    // basarisizsa band ve retry KORUNUR
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({
      title: '',
      type: 'DIGER',
      dueDate: '',
      reminderDays: 3,
      notes: '',
    });
  };

  const getTypeInfo = (type: string) => {
    return DEADLINE_TYPES.find(t => t.id === type) || DEADLINE_TYPES[5];
  };

  const getTypeColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-700 border-blue-200',
      orange: 'bg-orange-100 text-orange-700 border-orange-200',
      purple: 'bg-purple-100 text-purple-700 border-purple-200',
      red: 'bg-red-100 text-red-700 border-red-200',
      green: 'bg-green-100 text-green-700 border-green-200',
      gray: 'bg-gray-100 text-gray-700 border-gray-200',
    };
    return colors[color] || colors.gray;
  };

  const getDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getUrgencyColor = (days: number, isCompleted: boolean) => {
    if (isCompleted) return 'text-gray-400';
    if (days < 0) return 'text-red-600';
    if (days <= 3) return 'text-red-500';
    if (days <= 7) return 'text-orange-500';
    return 'text-green-600';
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Sort: incomplete first, then by due date
  const sortedDeadlines = [...deadlines].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  const upcomingCount = deadlines.filter(d => !d.isCompleted && getDaysRemaining(d.dueDate) <= 7).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PR-2A1: mutation hatalari GORUNUR; sessizce yutulmaz, kayit uydurulmaz. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {staleNotice ? (
        <div role="status" data-testid="stale-notice" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="flex-1">{staleNotice}</span>
          <button type="button" onClick={handleStaleRefresh} disabled={refreshingStale} data-testid="stale-refresh" className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50">
            Listeyi yenile
          </button>
        </div>
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Son Tarihler
          {upcomingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs">
              {upcomingCount} yaklaşan
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          Ekle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Başlık *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Son tarih başlığı"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tür</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as Deadline['type'] }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                {DEADLINE_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Son Tarih *</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hatırlatma (gün önce)</label>
              <input
                type="number"
                value={formData.reminderDays}
                onChange={(e) => setFormData(prev => ({ ...prev, reminderDays: parseInt(e.target.value) || 0 }))}
                min={0}
                max={30}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Not</label>
              <input
                type="text"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
                placeholder="Opsiyonel not"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 border rounded-lg hover:bg-gray-100"
            >
              İptal
            </button>
            <button
              onClick={handleSubmit}
              disabled={!formData.title || !formData.dueDate || saving}
              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editingId ? 'Güncelle' : 'Kaydet'}
            </button>
          </div>
        </div>
      )}

      {/* Deadlines List */}
      {sortedDeadlines.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz son tarih eklenmemiş</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedDeadlines.map((deadline) => {
            const typeInfo = getTypeInfo(deadline.type);
            const daysRemaining = getDaysRemaining(deadline.dueDate);
            const urgencyColor = getUrgencyColor(daysRemaining, deadline.isCompleted);

            return (
              <div
                key={deadline.id}
                className={`p-3 border rounded-lg ${deadline.isCompleted ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggleComplete(deadline.id)}
                    className={`mt-0.5 p-1 rounded ${
                      deadline.isCompleted
                        ? 'bg-green-100 text-green-600'
                        : 'border text-gray-400 hover:text-green-600 hover:border-green-600'
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${deadline.isCompleted ? 'line-through text-gray-400' : ''}`}>
                        {deadline.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs border ${getTypeColor(typeInfo.color)}`}>
                        {typeInfo.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-sm">
                      <span className={`flex items-center gap-1 ${urgencyColor}`}>
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(deadline.dueDate)}
                      </span>
                      {!deadline.isCompleted && (
                        <span className={`font-medium ${urgencyColor}`}>
                          {daysRemaining < 0
                            ? `${Math.abs(daysRemaining)} gün geçti!`
                            : daysRemaining === 0
                            ? 'Bugün!'
                            : `${daysRemaining} gün kaldı`}
                        </span>
                      )}
                      {deadline.reminderDays > 0 && (
                        <span className="flex items-center gap-1 text-gray-400">
                          <Bell className="h-3 w-3" />
                          {deadline.reminderDays} gün önce hatırlat
                        </span>
                      )}
                    </div>

                    {deadline.notes && (
                      <p className="text-xs text-gray-500 mt-1">{deadline.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(deadline)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(deadline.id)}
                      aria-label="Süreyi sil"
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
