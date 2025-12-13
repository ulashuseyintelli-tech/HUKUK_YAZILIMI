'use client';

import { useState, useEffect } from 'react';
import { Bell, Plus, Trash2, Edit, Check, X, Clock, FileText, AlertTriangle, Settings } from 'lucide-react';

interface ReminderRule {
  id: string;
  name: string;
  trigger: 'status_change' | 'days_since' | 'amount_threshold' | 'deadline_approaching';
  condition: string;
  action: 'email' | 'notification' | 'task';
  recipients: string[];
  message: string;
  isActive: boolean;
}

const STORAGE_KEY = 'autoReminderRules';

const TRIGGERS = [
  { id: 'status_change', label: 'Durum Değişikliği', icon: <FileText className="h-4 w-4" /> },
  { id: 'days_since', label: 'Gün Sayısı Aşımı', icon: <Clock className="h-4 w-4" /> },
  { id: 'amount_threshold', label: 'Tutar Eşiği', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'deadline_approaching', label: 'Son Tarih Yaklaşıyor', icon: <Bell className="h-4 w-4" /> },
];

const ACTIONS = [
  { id: 'email', label: 'E-posta Gönder' },
  { id: 'notification', label: 'Bildirim Oluştur' },
  { id: 'task', label: 'Görev Oluştur' },
];

export function AutoReminderRules() {
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<ReminderRule>>({
    trigger: 'days_since', action: 'notification', isActive: true, recipients: []
  });

  useEffect(() => { loadRules(); }, []);

  const loadRules = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setRules(JSON.parse(stored));
      else {
        const demo: ReminderRule[] = [
          { id: '1', name: '30 Gün İşlemsiz Dosya', trigger: 'days_since', condition: '30', action: 'notification', recipients: [], message: 'Dosyada 30 gündür işlem yapılmadı', isActive: true },
          { id: '2', name: 'Yüksek Tutarlı Dosya', trigger: 'amount_threshold', condition: '500000', action: 'email', recipients: ['avukat@hukuk.com'], message: 'Yüksek tutarlı dosya dikkat gerektirir', isActive: true },
        ];
        setRules(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load rules'); }
  };

  const saveRules = (list: ReminderRule[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setRules(list);
  };

  const handleSave = () => {
    if (!form.name || !form.condition || !form.message) return;
    if (editingId) {
      saveRules(rules.map(r => r.id === editingId ? { ...r, ...form } as ReminderRule : r));
    } else {
      saveRules([...rules, { ...form, id: Date.now().toString() } as ReminderRule]);
    }
    resetForm();
  };

  const handleEdit = (rule: ReminderRule) => {
    setForm(rule);
    setEditingId(rule.id);
    setShowForm(true);
  };

  const handleDelete = (id: string) => saveRules(rules.filter(r => r.id !== id));
  const toggleActive = (id: string) => saveRules(rules.map(r => r.id === id ? { ...r, isActive: !r.isActive } : r));
  const resetForm = () => { setForm({ trigger: 'days_since', action: 'notification', isActive: true, recipients: [] }); setEditingId(null); setShowForm(false); };

  const getTriggerLabel = (t: string) => TRIGGERS.find(tr => tr.id === t)?.label || t;
  const getActionLabel = (a: string) => ACTIONS.find(ac => ac.id === a)?.label || a;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Settings className="h-5 w-5" />Otomatik Hatırlatıcı Kuralları</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" />Yeni Kural
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Kural Adı</label>
              <input type="text" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder="Örn: 30 Gün İşlemsiz" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Tetikleyici</label>
              <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as ReminderRule['trigger'] })} className="w-full border rounded-lg px-3 py-2">
                {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Koşul Değeri</label>
              <input type="text" value={form.condition || ''} onChange={(e) => setForm({ ...form, condition: e.target.value })} className="w-full border rounded-lg px-3 py-2" placeholder={form.trigger === 'days_since' ? 'Gün sayısı' : form.trigger === 'amount_threshold' ? 'Tutar' : 'Değer'} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Aksiyon</label>
              <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as ReminderRule['action'] })} className="w-full border rounded-lg px-3 py-2">
                {ACTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Alıcılar (virgülle ayırın)</label>
              <input type="text" value={form.recipients?.join(', ') || ''} onChange={(e) => setForm({ ...form, recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="w-full border rounded-lg px-3 py-2" placeholder="email@example.com" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Mesaj</label>
              <textarea value={form.message || ''} onChange={(e) => setForm({ ...form, message: e.target.value })} className="w-full border rounded-lg px-3 py-2" rows={2} placeholder="Hatırlatıcı mesajı..." />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 border rounded-lg hover:bg-gray-50">İptal</button>
            <button onClick={handleSave} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Kaydet</button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Henüz kural tanımlanmadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div key={rule.id} className={`bg-white border rounded-lg p-4 ${!rule.isActive ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleActive(rule.id)} className={`mt-1 p-1 rounded ${rule.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {rule.isActive ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                  </button>
                  <div>
                    <p className="font-medium">{rule.name}</p>
                    <p className="text-sm text-gray-500">{getTriggerLabel(rule.trigger)}: {rule.condition} → {getActionLabel(rule.action)}</p>
                    <p className="text-xs text-gray-400 mt-1">{rule.message}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleEdit(rule)} className="p-1.5 hover:bg-gray-100 rounded"><Edit className="h-4 w-4 text-gray-400" /></button>
                  <button onClick={() => handleDelete(rule.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="h-4 w-4 text-gray-400 hover:text-red-500" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
