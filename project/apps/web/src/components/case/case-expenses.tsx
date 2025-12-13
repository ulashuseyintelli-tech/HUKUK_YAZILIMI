'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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

  useEffect(() => {
    loadExpenses();
  }, [caseId]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/expenses`);
      setExpenses(res.data?.data || []);
    } catch (e) {
      // Demo data
      setExpenses([
        {
          id: '1',
          date: new Date().toISOString(),
          category: 'harç',
          description: 'Başvuru harcı',
          amount: 500,
          billable: true,
          billed: false,
        },
        {
          id: '2',
          date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          category: 'posta',
          description: 'Tebligat masrafı',
          amount: 150,
          billable: true,
          billed: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.category || !formData.amount) return;
    setSaving(true);
    
    const expenseData = {
      ...formData,
      amount: parseFloat(formData.amount),
    };

    try {
      if (editingId) {
        await api.put(`/cases/${caseId}/expenses/${editingId}`, expenseData);
      } else {
        await api.post(`/cases/${caseId}/expenses`, expenseData);
      }
      loadExpenses();
    } catch (e) {
      // Demo: add locally
      const newExpense: Expense = {
        id: editingId || Date.now().toString(),
        date: formData.date,
        category: formData.category,
        description: formData.description,
        amount: parseFloat(formData.amount),
        billable: formData.billable,
        billed: false,
      };
      
      if (editingId) {
        setExpenses(prev => prev.map(exp => exp.id === editingId ? newExpense : exp));
      } else {
        setExpenses(prev => [...prev, newExpense]);
      }
    } finally {
      setSaving(false);
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu masrafı silmek istediğinize emin misiniz?')) return;
    
    try {
      await api.delete(`/cases/${caseId}/expenses/${id}`);
    } catch (e) {
      // Demo: remove locally
    }
    setExpenses(prev => prev.filter(exp => exp.id !== id));
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
                      onClick={() => handleDelete(expense.id)}
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
