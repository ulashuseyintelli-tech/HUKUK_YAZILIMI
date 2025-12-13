'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Gavel, Plus, Trash2, Edit, X, Check, Loader2, Calendar, Clock, MapPin, FileText, AlertCircle } from 'lucide-react';

interface Hearing {
  id: string;
  date: string;
  time: string;
  court: string;
  courtRoom?: string;
  type: string;
  status: 'scheduled' | 'completed' | 'postponed' | 'cancelled';
  result?: string;
  notes?: string;
  nextHearingDate?: string;
}

interface CaseHearingsProps {
  caseId: string;
}

const HEARING_TYPES = [
  { id: 'ilk', name: 'İlk Duruşma' },
  { id: 'ara', name: 'Ara Duruşma' },
  { id: 'kesif', name: 'Keşif' },
  { id: 'bilirkisi', name: 'Bilirkişi İncelemesi' },
  { id: 'karar', name: 'Karar Duruşması' },
  { id: 'temyiz', name: 'Temyiz Duruşması' },
];

const HEARING_STATUS = [
  { id: 'scheduled', name: 'Planlandı', color: 'blue' },
  { id: 'completed', name: 'Tamamlandı', color: 'green' },
  { id: 'postponed', name: 'Ertelendi', color: 'yellow' },
  { id: 'cancelled', name: 'İptal', color: 'red' },
];

export function CaseHearings({ caseId }: CaseHearingsProps) {
  const [hearings, setHearings] = useState<Hearing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    date: '',
    time: '09:00',
    court: '',
    courtRoom: '',
    type: '',
    notes: '',
  });
  const [resultData, setResultData] = useState({
    status: 'completed' as Hearing['status'],
    result: '',
    nextHearingDate: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadHearings();
  }, [caseId]);

  const loadHearings = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/hearings`);
      setHearings(res.data?.data || []);
    } catch (e) {
      // Demo data
      setHearings([
        {
          id: '1',
          date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          time: '10:00',
          court: 'İstanbul 5. İcra Hukuk Mahkemesi',
          courtRoom: 'Salon 3',
          type: 'ilk',
          status: 'scheduled',
        },
        {
          id: '2',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          time: '14:00',
          court: 'İstanbul 5. İcra Hukuk Mahkemesi',
          type: 'ara',
          status: 'completed',
          result: 'Bilirkişi raporu bekleniyor. Dosya ertelendi.',
          nextHearingDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.date || !formData.court || !formData.type) return;
    setSaving(true);

    try {
      if (editingId) {
        await api.put(`/cases/${caseId}/hearings/${editingId}`, formData);
      } else {
        await api.post(`/cases/${caseId}/hearings`, formData);
      }
      loadHearings();
    } catch (e) {
      // Demo: add locally
      const newHearing: Hearing = {
        id: editingId || Date.now().toString(),
        date: formData.date,
        time: formData.time,
        court: formData.court,
        courtRoom: formData.courtRoom,
        type: formData.type,
        status: 'scheduled',
        notes: formData.notes,
      };
      
      if (editingId) {
        setHearings(prev => prev.map(h => h.id === editingId ? newHearing : h));
      } else {
        setHearings(prev => [...prev, newHearing]);
      }
    } finally {
      setSaving(false);
      resetForm();
    }
  };

  const handleSaveResult = async () => {
    if (!showResultModal) return;
    setSaving(true);

    try {
      await api.put(`/cases/${caseId}/hearings/${showResultModal}/result`, resultData);
      loadHearings();
    } catch (e) {
      // Demo: update locally
      setHearings(prev => prev.map(h => 
        h.id === showResultModal 
          ? { ...h, ...resultData }
          : h
      ));
    } finally {
      setSaving(false);
      setShowResultModal(null);
      setResultData({ status: 'completed', result: '', nextHearingDate: '' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bu duruşmayı silmek istediğinize emin misiniz?')) return;
    
    try {
      await api.delete(`/cases/${caseId}/hearings/${id}`);
    } catch (e) {
      // Demo: remove locally
    }
    setHearings(prev => prev.filter(h => h.id !== id));
  };

  const handleEdit = (hearing: Hearing) => {
    setEditingId(hearing.id);
    setFormData({
      date: hearing.date.split('T')[0],
      time: hearing.time,
      court: hearing.court,
      courtRoom: hearing.courtRoom || '',
      type: hearing.type,
      notes: hearing.notes || '',
    });
    setShowAddForm(true);
  };

  const resetForm = () => {
    setFormData({
      date: '',
      time: '09:00',
      court: '',
      courtRoom: '',
      type: '',
      notes: '',
    });
    setEditingId(null);
    setShowAddForm(false);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('tr-TR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getStatusInfo = (status: Hearing['status']) => {
    return HEARING_STATUS.find(s => s.id === status) || HEARING_STATUS[0];
  };

  const getTypeInfo = (type: string) => {
    return HEARING_TYPES.find(t => t.id === type)?.name || type;
  };

  const isUpcoming = (date: string) => {
    return new Date(date) > new Date();
  };

  const upcomingHearings = hearings.filter(h => h.status === 'scheduled' && isUpcoming(h.date));
  const pastHearings = hearings.filter(h => h.status !== 'scheduled' || !isUpcoming(h.date));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upcoming Alert */}
      {upcomingHearings.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            <span className="font-medium text-blue-800">
              {upcomingHearings.length} yaklaşan duruşma var
            </span>
          </div>
        </div>
      )}

      {/* Add Button */}
      {!showAddForm && (
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Duruşma Ekle
        </button>
      )}

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="p-4 border rounded-lg bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{editingId ? 'Duruşma Düzenle' : 'Yeni Duruşma'}</h4>
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
              <label className="block text-xs font-medium mb-1">Saat</label>
              <input
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Mahkeme</label>
            <input
              type="text"
              value={formData.court}
              onChange={(e) => setFormData({ ...formData, court: e.target.value })}
              placeholder="Örn: İstanbul 5. İcra Hukuk Mahkemesi"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">Salon/Oda</label>
              <input
                type="text"
                value={formData.courtRoom}
                onChange={(e) => setFormData({ ...formData, courtRoom: e.target.value })}
                placeholder="Opsiyonel"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Duruşma Türü</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Seçiniz...</option>
                {HEARING_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Opsiyonel notlar..."
              rows={2}
              className="w-full border rounded px-2 py-1.5 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={resetForm} className="px-3 py-1.5 border rounded text-sm hover:bg-gray-100">
              İptal
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.date || !formData.court || !formData.type}
              className="px-3 py-1.5 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              {editingId ? 'Güncelle' : 'Ekle'}
            </button>
          </div>
        </div>
      )}

      {/* Hearings List */}
      {hearings.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <Gavel className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Henüz duruşma kaydı yok</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Upcoming */}
          {upcomingHearings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Yaklaşan Duruşmalar</h4>
              {upcomingHearings.map((hearing) => (
                <HearingCard
                  key={hearing.id}
                  hearing={hearing}
                  onEdit={() => handleEdit(hearing)}
                  onDelete={() => handleDelete(hearing.id)}
                  onAddResult={() => setShowResultModal(hearing.id)}
                  getTypeInfo={getTypeInfo}
                  getStatusInfo={getStatusInfo}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}

          {/* Past */}
          {pastHearings.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-2">Geçmiş Duruşmalar</h4>
              {pastHearings.map((hearing) => (
                <HearingCard
                  key={hearing.id}
                  hearing={hearing}
                  onEdit={() => handleEdit(hearing)}
                  onDelete={() => handleDelete(hearing.id)}
                  onAddResult={() => setShowResultModal(hearing.id)}
                  getTypeInfo={getTypeInfo}
                  getStatusInfo={getStatusInfo}
                  formatDate={formatDate}
                  isPast
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Result Modal */}
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-md mx-4">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Duruşma Sonucu</h3>
              <button onClick={() => setShowResultModal(null)} className="text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Durum</label>
                <select
                  value={resultData.status}
                  onChange={(e) => setResultData({ ...resultData, status: e.target.value as Hearing['status'] })}
                  className="w-full border rounded px-3 py-2"
                >
                  {HEARING_STATUS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Sonuç/Karar</label>
                <textarea
                  value={resultData.result}
                  onChange={(e) => setResultData({ ...resultData, result: e.target.value })}
                  placeholder="Duruşma sonucu..."
                  rows={3}
                  className="w-full border rounded px-3 py-2 resize-none"
                />
              </div>
              {resultData.status === 'postponed' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Sonraki Duruşma Tarihi</label>
                  <input
                    type="date"
                    value={resultData.nextHearingDate}
                    onChange={(e) => setResultData({ ...resultData, nextHearingDate: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button onClick={() => setShowResultModal(null)} className="px-4 py-2 border rounded-lg">
                İptal
              </button>
              <button
                onClick={handleSaveResult}
                disabled={saving}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HearingCard({
  hearing,
  onEdit,
  onDelete,
  onAddResult,
  getTypeInfo,
  getStatusInfo,
  formatDate,
  isPast,
}: {
  hearing: Hearing;
  onEdit: () => void;
  onDelete: () => void;
  onAddResult: () => void;
  getTypeInfo: (type: string) => string;
  getStatusInfo: (status: Hearing['status']) => { name: string; color: string };
  formatDate: (date: string) => string;
  isPast?: boolean;
}) {
  const status = getStatusInfo(hearing.status);
  const statusColors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700',
  };

  return (
    <div className={`p-4 border rounded-lg mb-2 ${isPast ? 'bg-gray-50' : 'bg-white'}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColors[status.color]}`}>
              {status.name}
            </span>
            <span className="text-xs text-gray-500">{getTypeInfo(hearing.type)}</span>
          </div>
          <p className="font-medium">{hearing.court}</p>
          {hearing.courtRoom && (
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {hearing.courtRoom}
            </p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" /> {formatDate(hearing.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> {hearing.time}
            </span>
          </div>
          {hearing.result && (
            <div className="mt-2 p-2 bg-gray-100 rounded text-sm">
              <p className="text-gray-700">{hearing.result}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hearing.status === 'scheduled' && (
            <button
              onClick={onAddResult}
              className="p-1.5 text-purple-600 hover:bg-purple-50 rounded"
              title="Sonuç Gir"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
            <Edit className="h-4 w-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
