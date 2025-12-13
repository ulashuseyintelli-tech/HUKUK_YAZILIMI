'use client';

import { useState, useEffect } from 'react';
import { Mail, Calendar, FileText, Plus, Trash2, Check, Clock, Bell } from 'lucide-react';

interface ReportSubscription {
  id: string;
  clientId: string;
  reportType: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  email: string;
  isActive: boolean;
  lastSent?: string;
  nextSend?: string;
}

interface ReportSubscriptionProps {
  clientId: string;
  clientName?: string;
  clientEmail?: string;
}

const REPORT_TYPES = [
  { id: 'case_summary', label: 'Dosya Özeti', description: 'Tüm dosyaların durumu' },
  { id: 'collection', label: 'Tahsilat Raporu', description: 'Tahsilat detayları' },
  { id: 'activity', label: 'Aktivite Raporu', description: 'Son işlemler' },
  { id: 'financial', label: 'Mali Rapor', description: 'Gelir/gider özeti' },
];

const STORAGE_KEY = 'reportSubscriptions';

export function ReportSubscriptionManager({ clientId, clientName, clientEmail }: ReportSubscriptionProps) {
  const [subscriptions, setSubscriptions] = useState<ReportSubscription[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ reportType: 'case_summary', frequency: 'weekly' as ReportSubscription['frequency'], email: clientEmail || '' });

  useEffect(() => { loadSubscriptions(); }, [clientId]);

  const loadSubscriptions = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const all: ReportSubscription[] = JSON.parse(stored);
        setSubscriptions(all.filter(s => s.clientId === clientId));
      }
    } catch (e) { console.error('Failed to load subscriptions'); }
  };

  const saveSubscriptions = (list: ReportSubscription[]) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const all: ReportSubscription[] = stored ? JSON.parse(stored) : [];
      const others = all.filter(s => s.clientId !== clientId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...others, ...list]));
      setSubscriptions(list);
    } catch (e) { console.error('Failed to save subscriptions'); }
  };

  const addSubscription = () => {
    if (!form.email) return;
    const nextSend = getNextSendDate(form.frequency);
    const newSub: ReportSubscription = { id: Date.now().toString(), clientId, reportType: form.reportType, frequency: form.frequency, email: form.email, isActive: true, nextSend };
    saveSubscriptions([...subscriptions, newSub]);
    setForm({ reportType: 'case_summary', frequency: 'weekly', email: clientEmail || '' });
    setShowForm(false);
  };

  const toggleActive = (id: string) => saveSubscriptions(subscriptions.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s));
  const deleteSubscription = (id: string) => saveSubscriptions(subscriptions.filter(s => s.id !== id));

  const getNextSendDate = (freq: ReportSubscription['frequency']): string => {
    const now = new Date();
    if (freq === 'daily') now.setDate(now.getDate() + 1);
    else if (freq === 'weekly') now.setDate(now.getDate() + 7);
    else now.setMonth(now.getMonth() + 1);
    return now.toISOString();
  };

  const getFrequencyLabel = (freq: ReportSubscription['frequency']) => {
    if (freq === 'daily') return 'Günlük';
    if (freq === 'weekly') return 'Haftalık';
    return 'Aylık';
  };

  const getReportLabel = (type: string) => REPORT_TYPES.find(r => r.id === type)?.label || type;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Mail className="h-5 w-5" />Rapor Abonelikleri {clientName && <span className="text-gray-500 text-sm">- {clientName}</span>}</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" />Abonelik Ekle</button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Rapor Türü</label>
            <select value={form.reportType} onChange={(e) => setForm({ ...form, reportType: e.target.value })} className="w-full border rounded-lg px-3 py-2">
              {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label} - {r.description}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Sıklık</label>
              <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as ReportSubscription['frequency'] })} className="w-full border rounded-lg px-3 py-2">
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-posta</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@example.com" className="w-full border rounded-lg px-3 py-2" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm">İptal</button>
            <button onClick={addSubscription} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Ekle</button>
          </div>
        </div>
      )}

      {/* Subscriptions List */}
      {subscriptions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Bell className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p>Henüz rapor aboneliği yok</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map((sub) => (
            <div key={sub.id} className={`bg-white border rounded-lg p-4 ${!sub.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleActive(sub.id)} className={`p-1.5 rounded ${sub.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {sub.isActive ? <Check className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{getReportLabel(sub.reportType)}</span>
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{getFrequencyLabel(sub.frequency)}</span>
                    </div>
                    <p className="text-sm text-gray-500"><Mail className="h-3 w-3 inline mr-1" />{sub.email}</p>
                    {sub.nextSend && <p className="text-xs text-gray-400"><Calendar className="h-3 w-3 inline mr-1" />Sonraki: {new Date(sub.nextSend).toLocaleDateString('tr-TR')}</p>}
                  </div>
                </div>
                <button onClick={() => deleteSubscription(sub.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
