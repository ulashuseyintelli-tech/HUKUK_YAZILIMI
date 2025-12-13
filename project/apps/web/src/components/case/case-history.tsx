'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { History, RotateCcw, ChevronDown, ChevronRight, User, Clock, Loader2, Search, Filter } from 'lucide-react';

interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: string | number | null;
  newValue: string | number | null;
}

interface HistoryEntry {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE';
  userId: string;
  userName: string;
  timestamp: string;
  changes: FieldChange[];
  canRevert: boolean;
}

interface CaseHistoryProps {
  caseId: string;
  onRevert?: (entryId: string) => void;
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Durum',
  riskLevel: 'Risk Seviyesi',
  statusLabel: 'Durum Etiketi',
  principalAmount: 'Ana Para',
  interestAmount: 'Faiz',
  totalAmount: 'Toplam Tutar',
  lawyerId: 'Avukat',
  staffId: 'Personel',
  notes: 'Notlar',
  priority: 'Öncelik',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Oluşturuldu', color: 'bg-green-100 text-green-700' },
  UPDATE: { label: 'Güncellendi', color: 'bg-blue-100 text-blue-700' },
  DELETE: { label: 'Silindi', color: 'bg-red-100 text-red-700' },
  STATUS_CHANGE: { label: 'Durum Değişti', color: 'bg-purple-100 text-purple-700' },
};

export function CaseHistory({ caseId, onRevert }: CaseHistoryProps) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [reverting, setReverting] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, [caseId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/history`);
      setHistory(res.data?.data || []);
    } catch (e) {
      // Demo data
      setHistory([
        {
          id: '1',
          action: 'UPDATE',
          userId: 'u1',
          userName: 'Av. Mehmet Yılmaz',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          changes: [
            { field: 'status', fieldLabel: 'Durum', oldValue: 'DERDEST', newValue: 'ISLEMDE' },
            { field: 'notes', fieldLabel: 'Notlar', oldValue: null, newValue: 'Haciz talebi hazırlandı' },
          ],
          canRevert: true,
        },
        {
          id: '2',
          action: 'STATUS_CHANGE',
          userId: 'u2',
          userName: 'Admin',
          timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          changes: [
            { field: 'riskLevel', fieldLabel: 'Risk Seviyesi', oldValue: 'MEDIUM', newValue: 'HIGH' },
          ],
          canRevert: true,
        },
        {
          id: '3',
          action: 'UPDATE',
          userId: 'u1',
          userName: 'Av. Mehmet Yılmaz',
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          changes: [
            { field: 'principalAmount', fieldLabel: 'Ana Para', oldValue: 100000, newValue: 125000 },
            { field: 'interestAmount', fieldLabel: 'Faiz', oldValue: 15000, newValue: 20000 },
          ],
          canRevert: false,
        },
        {
          id: '4',
          action: 'CREATE',
          userId: 'u2',
          userName: 'Admin',
          timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          changes: [],
          canRevert: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (entryId: string) => {
    if (!confirm('Bu değişikliği geri almak istediğinize emin misiniz?')) return;
    setReverting(entryId);

    try {
      await api.post(`/cases/${caseId}/history/${entryId}/revert`);
      loadHistory();
      onRevert?.(entryId);
    } catch (e) {
      alert('Geri alma başarısız');
    } finally {
      setReverting(null);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedIds);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedIds(newExpanded);
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (hours < 1) return 'Az önce';
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatValue = (value: string | number | null) => {
    if (value === null || value === undefined) return <span className="text-gray-400 italic">boş</span>;
    if (typeof value === 'number') {
      return new Intl.NumberFormat('tr-TR').format(value);
    }
    return value;
  };

  const filteredHistory = history.filter(entry => {
    if (filterAction && entry.action !== filterAction) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (entry.userName.toLowerCase().includes(search)) return true;
      if (entry.changes.some(c => 
        c.fieldLabel.toLowerCase().includes(search) ||
        String(c.oldValue).toLowerCase().includes(search) ||
        String(c.newValue).toLowerCase().includes(search)
      )) return true;
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ara..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">Tüm İşlemler</option>
          <option value="CREATE">Oluşturma</option>
          <option value="UPDATE">Güncelleme</option>
          <option value="STATUS_CHANGE">Durum Değişikliği</option>
          <option value="DELETE">Silme</option>
        </select>
      </div>

      {/* History List */}
      {filteredHistory.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Geçmiş kaydı bulunamadı</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredHistory.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            const actionInfo = ACTION_LABELS[entry.action];

            return (
              <div key={entry.id} className="border rounded-lg overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => entry.changes.length > 0 && toggleExpand(entry.id)}
                >
                  {entry.changes.length > 0 ? (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )
                  ) : (
                    <div className="w-4" />
                  )}

                  <span className={`px-2 py-0.5 rounded text-xs ${actionInfo.color}`}>
                    {actionInfo.label}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span className="font-medium">{entry.userName}</span>
                      {entry.changes.length > 0 && (
                        <span className="text-gray-500">
                          ({entry.changes.length} değişiklik)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(entry.timestamp)}
                    </span>
                    {entry.canRevert && onRevert && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevert(entry.id);
                        }}
                        disabled={reverting === entry.id}
                        className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded disabled:opacity-50"
                        title="Geri Al"
                      >
                        {reverting === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && entry.changes.length > 0 && (
                  <div className="border-t bg-gray-50 p-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500">
                          <th className="pb-2 font-medium">Alan</th>
                          <th className="pb-2 font-medium">Eski Değer</th>
                          <th className="pb-2 font-medium">Yeni Değer</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.changes.map((change, i) => (
                          <tr key={i} className="border-t border-gray-200">
                            <td className="py-2 font-medium">{change.fieldLabel}</td>
                            <td className="py-2 text-red-600">{formatValue(change.oldValue)}</td>
                            <td className="py-2 text-green-600">{formatValue(change.newValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
