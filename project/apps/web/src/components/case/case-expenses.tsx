'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock, useSubmitLock } from '@/lib/use-submit-lock';
import { Receipt, Plus, Trash2, Edit, X, Check, Loader2, DollarSign, Calendar, Tag } from 'lucide-react';

interface Expense {
  id: string;
  date: string;
  category: string;
  description: string;
  amount: number;
  billable: boolean;
  billed: boolean;
  createdBy?: string;
}

interface CaseExpensesProps {
  caseId: string;
}

const EXPENSE_CATEGORIES = [
  { id: 'harç', name: 'Harç', color: '#3b82f6' },
  { id: 'posta', name: 'Posta/Tebligat', color: '#10b981' },
  { id: 'bilirkişi', name: 'Bilirkişi', color: '#f59e0b' },
  { id: 'keşif', name: 'Keşif', color: '#8b5cf6' },
  { id: 'yol', name: 'Yol/Ulaşım', color: '#ec4899' },
  { id: 'fotokopi', name: 'Fotokopi/Baskı', color: '#6b7280' },
  { id: 'diger', name: 'Diğer', color: '#64748b' },
];

export function CaseExpenses({ caseId }: CaseExpensesProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    category: '',
    description: '',
    amount: '',
    billable: true,
  });
  const [saving, setSaving] = useState(false);
  // PR-2A1: masraf finansal kayittir; hata halinde uydurulamaz.
  const [actionError, setActionError] = useState<string | null>(null);
  // Mutation BAŞARILI ama liste tazelenemedi → kayıt durur, görünüm bayat.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const submitLock = useSubmitLock();
  const rowLock = useKeyedSubmitLock();

  // Stale bandındaki tekrar denemesi YALNIZ okuma yolunu çalıştırır; mutation callback'i
  // ASLA yeniden çağrılmaz → çift kayıt üretilemez.
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadExpenses({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) setStaleNotice(null);
  };

  useEffect(() => {
    void loadExpenses();
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
  const loadExpenses = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get(`/cases/${caseId}/expenses`);
      const rows = (res as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) {
        throw new Error('MALFORMED_LIST_RESPONSE');
      }
      setExpenses(rows as never);
    } catch (e) {
      setLoadError(toActionErrorMessage(e, 'Masraflar yüklenemedi.'));
      if (opts?.propagateError) throw e;
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.amount) return;
    // PR-2A1: senkron kilit — hızlı çift tık ikinci bir POST üretmez.
    await submitLock.run(async () => {
      setSaving(true);
      setActionError(null);
      setStaleNotice(null);

      const expenseData = {
        ...formData,
        amount: parseFloat(formData.amount),
      };

      const outcome = await runMutation({
        mutate: () =>
          editingId
            ? api.put(`/cases/${caseId}/expenses/${editingId}`, expenseData)
            : api.post(`/cases/${caseId}/expenses`, expenseData),
        // Başarı YALNIZ sunucudan yeniden okunarak yansıtılır; form verisinden kayıt
        // ÜRETİLMEZ (eski davranış masrafı yerel uyduruyordu).
        refresh: () => loadExpenses({ propagateError: true }),
        failureMessage: 'Masraf kaydedilemedi. Kayıt YAPILMADI, lütfen tekrar deneyin.',
        staleMessage: 'Masraf KAYDEDİLDİ, ancak liste yenilenemedi.',
      });

      if (!submitLock.isMounted()) return;

      setSaving(false);
      if (outcome.status === 'FAILED') {
        setActionError(outcome.error.message);
        return; // form KORUNUR, yeniden gönderilebilir
      }
      // SUCCESS ve SUCCESS_STALE: kayıt KESİNLEŞTİ → aynı payload yeniden gönderilemez.
      resetForm();
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu masrafı silmek istediğinize emin misiniz?')) return;
    
    // PR-2A1: PESSIMISTIC silme + satır bazlı kilit (anahtar kararlı kayıt kimliği,
    // liste index'i DEĞİL). Aynı satıra ikinci tık hiç başlamaz.
    setActionError(null);
    setStaleNotice(null);
    await rowLock.run(`expense:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/cases/${caseId}/expenses/${id}`),
        refresh: () => loadExpenses({ propagateError: true }),
        failureMessage: 'Masraf silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
        staleMessage: 'Masraf SİLİNDİ, ancak liste yenilenemedi.',
      });
      if (!rowLock.isMounted()) return;
      // Hata hâlinde satır ve seçim durumu AYNEN korunur — hiçbir state yazılmaz.
      if (outcome.status === 'FAILED') setActionError(outcome.error.message);
      else if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setFormData({
      date: expense.date.split('T')[0],
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      billable: expense.billable,
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      category: '',
      description: '',
      amount: '',
      billable: true,
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const billableExpenses = expenses.filter(exp => exp.billable).reduce((sum, exp) => sum + exp.amount, 0);
  const billedExpenses = expenses.filter(exp => exp.billed).reduce((sum, exp) => sum + exp.amount, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR');
  };

  const getCategoryInfo = (categoryId: string) => {
    return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || { name: categoryId, color: '#6b7280' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* PR-2A1: mutation hatalari GORUNUR. */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {/* Mutation başarılı ama tazeleme başarısız → kayıt durur, görünüm bayat.
          Band liste yüzeyindedir: modal kapansa bile görünür kalır. */}
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

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-600">Toplam Masraf</p>
          <p className="text-lg font-bold text-blue-800">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="p-3 bg-green-50 rounded-lg">
          <p className="text-xs text-green-600">Faturalanabilir</p>
          <p className="text-lg font-bold text-green-800">{formatCurrency(billableExpenses)}</p>
        </div>
        <div className="p-3 bg-purple-50 rounded-lg">
          <p className="text-xs text-purple-600">Faturalandı</p>
          <p className="text-lg font-bold text-purple-800">{formatCurrency(billedExpenses)}</p>
        </div>
      </div>

      {/* Add Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Masraf Ekle
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{editingId ? 'Masraf Düzenle' : 'Yeni Masraf'}</h4>
            <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tarih</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Kategori</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Seçiniz...</option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Açıklama</label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Masraf açıklaması..."
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Tutar (₺)</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2 border rounded cursor-pointer hover:bg-white">
                <input
                  type="checkbox"
                  checked={formData.billable}
                  onChange={(e) => setFormData({ ...formData, billable: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm">Faturalanabilir</span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={resetForm}
              className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100"
            >
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.category || !formData.amount}
              className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {editingId ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </div>
      )}

      {/* Expenses List */}
      {expenses.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz masraf kaydı yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const category = getCategoryInfo(expense.category);
            return (
              <div key={expense.id} className="p-3 border rounded-lg hover:bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-10 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{expense.description || category.name}</span>
                      {expense.billable && !expense.billed && (
                        <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">Faturalanacak</span>
                      )}
                      {expense.billed && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">Faturalandı</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {formatDate(expense.date)}
                      <Tag className="h-3 w-3 ml-2" />
                      {category.name}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-blue-600">{formatCurrency(expense.amount)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(expense)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(expense.id)}
                      aria-label="Masrafı sil"
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
