'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
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

  useEffect(() => {
    loadChecklist();
  }, [caseId]);

  const loadChecklist = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/checklist`);
      setItems(res.data?.data || []);
    } catch (e) {
      // Demo data
      setItems([
        { id: '1', text: 'Vekaletname kontrolü', completed: true, order: 1 },
        { id: '2', text: 'Borçlu adres tespiti', completed: true, order: 2 },
        { id: '3', text: 'Ödeme emri gönderimi', completed: false, order: 3 },
        { id: '4', text: 'Tebligat takibi', completed: false, order: 4 },
        { id: '5', text: 'Haciz talebi hazırlama', completed: false, order: 5 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItemText.trim()) return;
    setSaving(true);

    try {
      await api.post(`/cases/${caseId}/checklist`, { text: newItemText });
      loadChecklist();
    } catch (e) {
      // Demo: add locally
      const newItem: ChecklistItem = {
        id: Date.now().toString(),
        text: newItemText,
        completed: false,
        order: items.length + 1,
      };
      setItems(prev => [...prev, newItem]);
    } finally {
      setSaving(false);
      setNewItemText('');
    }
  };

  const handleToggle = async (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    try {
      await api.patch(`/cases/${caseId}/checklist/${id}`, { completed: !item.completed });
    } catch (e) {
      // Demo: update locally
    }
    setItems(prev => prev.map(i => i.id === id ? { ...i, completed: !i.completed } : i));
  };

  const handleEdit = (item: ChecklistItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;

    try {
      await api.patch(`/cases/${caseId}/checklist/${editingId}`, { text: editText });
    } catch (e) {
      // Demo: update locally
    }
    setItems(prev => prev.map(i => i.id === editingId ? { ...i, text: editText } : i));
    setEditingId(null);
    setEditText('');
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/cases/${caseId}/checklist/${id}`);
    } catch (e) {
      // Demo: remove locally
    }
    setItems(prev => prev.filter(i => i.id !== id));
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
