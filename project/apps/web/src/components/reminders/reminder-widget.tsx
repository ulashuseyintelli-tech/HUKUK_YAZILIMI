'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Bell, Plus, Check, Clock, Trash2, X } from 'lucide-react';
import Link from 'next/link';

interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  caseId?: string;
  caseNumber?: string;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
}

export function ReminderWidget() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newReminder, setNewReminder] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'medium' as const,
  });

  useEffect(() => {
    loadReminders();
  }, []);

  const loadReminders = async () => {
    try {
      // API'den hatırlatıcıları çek
      const res = await api.get('/calendar/events?type=HATIRLATICI');
      const events = res.data || [];
      setReminders(events.map((e: any) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        dueDate: e.date,
        caseId: e.caseId,
        caseNumber: e.caseNumber,
        isCompleted: e.isCompleted || false,
        priority: e.priority || 'medium',
      })));
    } catch (e) {
      // localStorage'dan yükle
      const saved = localStorage.getItem('reminders');
      if (saved) {
        setReminders(JSON.parse(saved));
      }
    } finally {
      setLoading(false);
    }
  };

  const addReminder = async () => {
    if (!newReminder.title || !newReminder.dueDate) return;

    const reminder: Reminder = {
      id: Date.now().toString(),
      ...newReminder,
      isCompleted: false,
    };

    try {
      await api.post('/calendar/events', {
        title: newReminder.title,
        description: newReminder.description,
        date: newReminder.dueDate,
        type: 'HATIRLATICI',
        priority: newReminder.priority,
      });
      loadReminders();
    } catch (e) {
      // localStorage'a kaydet
      const updated = [...reminders, reminder];
      setReminders(updated);
      localStorage.setItem('reminders', JSON.stringify(updated));
    }

    setNewReminder({ title: '', description: '', dueDate: '', priority: 'medium' });
    setShowAddModal(false);
  };

  const toggleComplete = async (id: string) => {
    const updated = reminders.map(r => 
      r.id === id ? { ...r, isCompleted: !r.isCompleted } : r
    );
    setReminders(updated);
    localStorage.setItem('reminders', JSON.stringify(updated));

    try {
      await api.put(`/calendar/events/${id}`, { isCompleted: !reminders.find(r => r.id === id)?.isCompleted });
    } catch (e) {
      // Sessizce geç
    }
  };

  const deleteReminder = async (id: string) => {
    const updated = reminders.filter(r => r.id !== id);
    setReminders(updated);
    localStorage.setItem('reminders', JSON.stringify(updated));

    try {
      await api.delete(`/calendar/events/${id}`);
    } catch (e) {
      // Sessizce geç
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'border-l-red-500 bg-red-50';
      case 'medium': return 'border-l-yellow-500 bg-yellow-50';
      case 'low': return 'border-l-green-500 bg-green-50';
      default: return 'border-l-gray-500 bg-gray-50';
    }
  };

  const isOverdue = (date: string) => {
    return new Date(date) < new Date() && !reminders.find(r => r.dueDate === date)?.isCompleted;
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Bugün';
    if (d.toDateString() === tomorrow.toDateString()) return 'Yarın';
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  };

  const activeReminders = reminders.filter(r => !r.isCompleted).sort((a, b) => 
    new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl border p-4">
        <div className="h-6 bg-gray-200 rounded w-32 mb-4 animate-pulse" />
        {[1, 2].map(i => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg mb-2 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Bell className="h-5 w-5 text-orange-500" />
          Hatırlatıcılar
          {activeReminders.length > 0 && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
              {activeReminders.length}
            </span>
          )}
        </h3>
        <button
          onClick={() => setShowAddModal(true)}
          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <Plus className="h-3 w-3" /> Ekle
        </button>
      </div>

      {activeReminders.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p>Aktif hatırlatıcı yok</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {activeReminders.slice(0, 5).map((reminder) => (
            <div
              key={reminder.id}
              className={`border-l-4 rounded-lg p-2 ${getPriorityColor(reminder.priority)} ${
                isOverdue(reminder.dueDate) ? 'ring-1 ring-red-300' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => toggleComplete(reminder.id)}
                    className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                      reminder.isCompleted ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
                    }`}
                  >
                    {reminder.isCompleted && <Check className="h-3 w-3" />}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${reminder.isCompleted ? 'line-through text-gray-400' : ''}`}>
                      {reminder.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs flex items-center gap-1 ${isOverdue(reminder.dueDate) ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        <Clock className="h-3 w-3" />
                        {formatDate(reminder.dueDate)}
                      </span>
                      {reminder.caseNumber && (
                        <Link href={`/cases/${reminder.caseId}`} className="text-xs text-blue-600 hover:underline">
                          {reminder.caseNumber}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => deleteReminder(reminder.id)}
                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeReminders.length > 5 && (
        <Link href="/calendar" className="block text-center text-xs text-blue-600 hover:underline mt-2">
          +{activeReminders.length - 5} daha...
        </Link>
      )}

      {/* Add Reminder Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-sm mx-4 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="h-5 w-5 text-orange-500" />
                Yeni Hatırlatıcı
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Başlık *</label>
                <input
                  type="text"
                  value={newReminder.title}
                  onChange={(e) => setNewReminder({ ...newReminder, title: e.target.value })}
                  placeholder="Hatırlatıcı başlığı"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Tarih *</label>
                <input
                  type="date"
                  value={newReminder.dueDate}
                  onChange={(e) => setNewReminder({ ...newReminder, dueDate: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Öncelik</label>
                <select
                  value={newReminder.priority}
                  onChange={(e) => setNewReminder({ ...newReminder, priority: e.target.value as any })}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="low">Düşük</option>
                  <option value="medium">Orta</option>
                  <option value="high">Yüksek</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <textarea
                  value={newReminder.description}
                  onChange={(e) => setNewReminder({ ...newReminder, description: e.target.value })}
                  placeholder="Opsiyonel açıklama"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={addReminder}
                disabled={!newReminder.title || !newReminder.dueDate}
                className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 disabled:opacity-50"
              >
                Ekle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
