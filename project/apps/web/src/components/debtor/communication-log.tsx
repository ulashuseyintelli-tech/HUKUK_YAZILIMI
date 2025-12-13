'use client';

import { useState, useEffect } from 'react';
import { Phone, Mail, MessageSquare, Plus, Search, Filter, Calendar, User, CheckCircle, XCircle, Clock } from 'lucide-react';

interface CommunicationEntry {
  id: string;
  type: 'call' | 'email' | 'sms' | 'meeting';
  direction: 'inbound' | 'outbound';
  date: string;
  subject: string;
  notes?: string;
  result: 'success' | 'no_answer' | 'callback' | 'refused';
  user: string;
}

interface CommunicationLogProps {
  debtorId: string;
  debtorName?: string;
}

const STORAGE_KEY = 'debtorCommunicationLog';

export function DebtorCommunicationLog({ debtorId, debtorName }: CommunicationLogProps) {
  const [entries, setEntries] = useState<CommunicationEntry[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ type: 'call' as CommunicationEntry['type'], direction: 'outbound' as CommunicationEntry['direction'], subject: '', notes: '', result: 'success' as CommunicationEntry['result'] });

  useEffect(() => { loadEntries(); }, [debtorId]);

  const loadEntries = () => {
    try {
      const stored = localStorage.getItem(`${STORAGE_KEY}_${debtorId}`);
      if (stored) setEntries(JSON.parse(stored));
      else {
        const demo: CommunicationEntry[] = [
          { id: '1', type: 'call', direction: 'outbound', date: new Date().toISOString(), subject: 'Ödeme hatırlatması', notes: 'Borçlu 15 gün içinde ödeme sözü verdi', result: 'success', user: 'Av. Mehmet' },
          { id: '2', type: 'email', direction: 'outbound', date: new Date(Date.now() - 86400000).toISOString(), subject: 'Ödeme emri bildirimi', result: 'success', user: 'Sistem' },
          { id: '3', type: 'call', direction: 'outbound', date: new Date(Date.now() - 172800000).toISOString(), subject: 'İlk iletişim denemesi', result: 'no_answer', user: 'Av. Mehmet' },
        ];
        setEntries(demo);
      }
    } catch (e) { console.error('Failed to load entries'); }
  };

  const saveEntries = (list: CommunicationEntry[]) => {
    localStorage.setItem(`${STORAGE_KEY}_${debtorId}`, JSON.stringify(list));
    setEntries(list);
  };

  const addEntry = () => {
    if (!form.subject) return;
    const newEntry: CommunicationEntry = { ...form, id: Date.now().toString(), date: new Date().toISOString(), user: 'Kullanıcı' };
    saveEntries([newEntry, ...entries]);
    setForm({ type: 'call', direction: 'outbound', subject: '', notes: '', result: 'success' });
    setShowForm(false);
  };

  const getTypeIcon = (type: CommunicationEntry['type']) => {
    if (type === 'call') return <Phone className="h-4 w-4" />;
    if (type === 'email') return <Mail className="h-4 w-4" />;
    if (type === 'sms') return <MessageSquare className="h-4 w-4" />;
    return <User className="h-4 w-4" />;
  };

  const getResultBadge = (result: CommunicationEntry['result']) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      success: { bg: 'bg-green-100', text: 'text-green-700', label: 'Başarılı' },
      no_answer: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Cevap Yok' },
      callback: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Geri Aranacak' },
      refused: { bg: 'bg-red-100', text: 'text-red-700', label: 'Reddetti' },
    };
    const s = styles[result];
    return <span className={`px-2 py-0.5 rounded text-xs ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const filtered = entries
    .filter(e => filter === 'all' || e.type === filter)
    .filter(e => e.subject.toLowerCase().includes(search.toLowerCase()) || e.notes?.toLowerCase().includes(search.toLowerCase()));

  const stats = { total: entries.length, success: entries.filter(e => e.result === 'success').length, calls: entries.filter(e => e.type === 'call').length };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Phone className="h-5 w-5" />İletişim Logu {debtorName && <span className="text-gray-500 text-sm">- {debtorName}</span>}</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" />Kayıt Ekle</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-blue-600">{stats.total}</p><p className="text-xs text-gray-500">Toplam</p></div>
        <div className="bg-green-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-green-600">{stats.success}</p><p className="text-xs text-gray-500">Başarılı</p></div>
        <div className="bg-purple-50 rounded-lg p-3 text-center"><p className="text-2xl font-bold text-purple-600">{stats.calls}</p><p className="text-xs text-gray-500">Arama</p></div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as CommunicationEntry['type'] })} className="border rounded-lg px-3 py-2">
              <option value="call">Telefon</option><option value="email">E-posta</option><option value="sms">SMS</option><option value="meeting">Görüşme</option>
            </select>
            <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as CommunicationEntry['direction'] })} className="border rounded-lg px-3 py-2">
              <option value="outbound">Giden</option><option value="inbound">Gelen</option>
            </select>
          </div>
          <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Konu" className="w-full border rounded-lg px-3 py-2" />
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notlar" className="w-full border rounded-lg px-3 py-2" rows={2} />
          <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as CommunicationEntry['result'] })} className="w-full border rounded-lg px-3 py-2">
            <option value="success">Başarılı</option><option value="no_answer">Cevap Yok</option><option value="callback">Geri Aranacak</option><option value="refused">Reddetti</option>
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm">İptal</button>
            <button onClick={addEntry} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">Kaydet</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ara..." className="w-full pl-10 pr-4 py-2 border rounded-lg" />
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">Tümü</option><option value="call">Telefon</option><option value="email">E-posta</option><option value="sms">SMS</option>
        </select>
      </div>

      {/* Entries */}
      <div className="space-y-2">
        {filtered.map((entry) => (
          <div key={entry.id} className="bg-white border rounded-lg p-3">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-full ${entry.direction === 'inbound' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>{getTypeIcon(entry.type)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{entry.subject}</span>
                  {getResultBadge(entry.result)}
                </div>
                {entry.notes && <p className="text-sm text-gray-500 mt-1">{entry.notes}</p>}
                <p className="text-xs text-gray-400 mt-1"><Calendar className="h-3 w-3 inline mr-1" />{new Date(entry.date).toLocaleString('tr-TR')} • {entry.user}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
