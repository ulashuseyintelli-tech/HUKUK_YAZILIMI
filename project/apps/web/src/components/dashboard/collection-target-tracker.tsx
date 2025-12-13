'use client';

import { useState, useEffect } from 'react';
import { Target, Users, User, TrendingUp, Edit, Check, X } from 'lucide-react';

interface TargetData {
  id: string;
  name: string;
  type: 'individual' | 'team';
  targetAmount: number;
  collectedAmount: number;
  period: string;
}

const STORAGE_KEY = 'collectionTargets';

export function CollectionTargetTracker() {
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'individual' as TargetData['type'], targetAmount: 0 });

  useEffect(() => { loadTargets(); }, []);

  const loadTargets = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTargets(JSON.parse(stored));
      else {
        const demo: TargetData[] = [
          { id: '1', name: 'Av. Mehmet Kaya', type: 'individual', targetAmount: 500000, collectedAmount: 380000, period: '2024-12' },
          { id: '2', name: 'Av. Ayşe Demir', type: 'individual', targetAmount: 400000, collectedAmount: 420000, period: '2024-12' },
          { id: '3', name: 'Av. Ali Yıldız', type: 'individual', targetAmount: 350000, collectedAmount: 280000, period: '2024-12' },
          { id: '4', name: 'İcra Ekibi', type: 'team', targetAmount: 1500000, collectedAmount: 1200000, period: '2024-12' },
        ];
        setTargets(demo);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
      }
    } catch (e) { console.error('Failed to load targets'); }
  };

  const saveTargets = (list: TargetData[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    setTargets(list);
  };

  const handleSave = () => {
    if (!form.name || form.targetAmount <= 0) return;
    if (editingId) {
      saveTargets(targets.map(t => t.id === editingId ? { ...t, name: form.name, type: form.type, targetAmount: form.targetAmount } : t));
    } else {
      saveTargets([...targets, { id: Date.now().toString(), name: form.name, type: form.type, targetAmount: form.targetAmount, collectedAmount: 0, period: new Date().toISOString().slice(0, 7) }]);
    }
    resetForm();
  };

  const handleEdit = (t: TargetData) => { setForm({ name: t.name, type: t.type, targetAmount: t.targetAmount }); setEditingId(t.id); setShowForm(true); };
  const resetForm = () => { setForm({ name: '', type: 'individual', targetAmount: 0 }); setEditingId(null); setShowForm(false); };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  const getProgress = (t: TargetData) => t.targetAmount > 0 ? Math.round((t.collectedAmount / t.targetAmount) * 100) : 0;
  const getProgressColor = (p: number) => p >= 100 ? 'bg-green-500' : p >= 75 ? 'bg-blue-500' : p >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  const individualTargets = targets.filter(t => t.type === 'individual');
  const teamTargets = targets.filter(t => t.type === 'team');
  const totalTarget = targets.reduce((s, t) => s + t.targetAmount, 0);
  const totalCollected = targets.reduce((s, t) => s + t.collectedAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><Target className="h-5 w-5" />Tahsilat Hedef Takibi</h3>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Hedef Ekle</button>
      </div>

      {/* Overall Progress */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-4 text-white">
        <div className="flex items-center justify-between mb-2">
          <span>Genel İlerleme</span>
          <span className="text-2xl font-bold">%{totalTarget > 0 ? Math.round((totalCollected / totalTarget) * 100) : 0}</span>
        </div>
        <div className="h-3 bg-white/30 rounded-full overflow-hidden">
          <div className="h-full bg-white rounded-full" style={{ width: `${totalTarget > 0 ? Math.min((totalCollected / totalTarget) * 100, 100) : 0}%` }} />
        </div>
        <div className="flex justify-between text-sm mt-2 opacity-80">
          <span>Tahsil: {formatCurrency(totalCollected)}</span>
          <span>Hedef: {formatCurrency(totalTarget)}</span>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="İsim" className="border rounded-lg px-3 py-2" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TargetData['type'] })} className="border rounded-lg px-3 py-2">
              <option value="individual">Bireysel</option>
              <option value="team">Takım</option>
            </select>
            <input type="number" value={form.targetAmount || ''} onChange={(e) => setForm({ ...form, targetAmount: parseFloat(e.target.value) || 0 })} placeholder="Hedef Tutar" className="border rounded-lg px-3 py-2" />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-3 py-1.5 border rounded-lg hover:bg-gray-50 text-sm">İptal</button>
            <button onClick={handleSave} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">{editingId ? 'Güncelle' : 'Ekle'}</button>
          </div>
        </div>
      )}

      {/* Individual Targets */}
      {individualTargets.length > 0 && (
        <div>
          <h4 className="font-medium text-sm text-gray-500 mb-2 flex items-center gap-1"><User className="h-4 w-4" />Bireysel Hedefler</h4>
          <div className="space-y-2">
            {individualTargets.map((t) => {
              const progress = getProgress(t);
              return (
                <div key={t.id} className="bg-white border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{t.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${progress >= 100 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>%{progress}</span>
                      <button onClick={() => handleEdit(t)} className="p-1 hover:bg-gray-100 rounded"><Edit className="h-3 w-3 text-gray-400" /></button>
                    </div>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className={`h-full ${getProgressColor(progress)} rounded-full`} style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{formatCurrency(t.collectedAmount)}</span>
                    <span>{formatCurrency(t.targetAmount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Targets */}
      {teamTargets.length > 0 && (
        <div>
          <h4 className="font-medium text-sm text-gray-500 mb-2 flex items-center gap-1"><Users className="h-4 w-4" />Takım Hedefleri</h4>
          <div className="space-y-2">
            {teamTargets.map((t) => {
              const progress = getProgress(t);
              return (
                <div key={t.id} className="bg-white border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{t.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs ${progress >= 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>%{progress}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                    <div className={`h-full ${getProgressColor(progress)} rounded-full`} style={{ width: `${Math.min(progress, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{formatCurrency(t.collectedAmount)}</span>
                    <span>{formatCurrency(t.targetAmount)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leaderboard */}
      <div className="bg-gray-50 rounded-lg p-3">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-1"><TrendingUp className="h-4 w-4" />Sıralama</h4>
        <div className="space-y-1">
          {[...individualTargets].sort((a, b) => getProgress(b) - getProgress(a)).slice(0, 3).map((t, i) => (
            <div key={t.id} className="flex items-center gap-2 text-sm">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-300' : 'bg-orange-300'}`}>{i + 1}</span>
              <span className="flex-1">{t.name}</span>
              <span className="font-medium">%{getProgress(t)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
