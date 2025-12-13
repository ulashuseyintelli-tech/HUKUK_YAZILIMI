'use client';

import { useState, useEffect } from 'react';
import { History, Clock, User, ArrowRight, Calendar, BarChart3 } from 'lucide-react';

interface StatusChange {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedAt: string;
  changedBy: string;
  reason?: string;
  durationDays: number;
}

interface CaseStatusHistoryProps {
  caseId: string;
}

const STATUS_COLORS: Record<string, string> = {
  DERDEST: 'bg-blue-100 text-blue-700',
  ISLEMDE: 'bg-yellow-100 text-yellow-700',
  BEKLEMEDE: 'bg-orange-100 text-orange-700',
  HITAM: 'bg-green-100 text-green-700',
  DERKENAR: 'bg-gray-100 text-gray-700',
  IPTAL: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  DERDEST: 'Derdest', ISLEMDE: 'İşlemde', BEKLEMEDE: 'Beklemede',
  HITAM: 'Hitam', DERKENAR: 'Derkenar', IPTAL: 'İptal'
};

export function CaseStatusHistory({ caseId }: CaseStatusHistoryProps) {
  const [history, setHistory] = useState<StatusChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHistory(); }, [caseId]);

  const loadHistory = () => {
    // Demo data
    setHistory([
      { id: '1', fromStatus: '', toStatus: 'DERDEST', changedAt: '2024-06-15T10:00:00', changedBy: 'Av. Mehmet Kaya', durationDays: 0 },
      { id: '2', fromStatus: 'DERDEST', toStatus: 'ISLEMDE', changedAt: '2024-07-01T14:30:00', changedBy: 'Av. Mehmet Kaya', reason: 'Ödeme emri gönderildi', durationDays: 16 },
      { id: '3', fromStatus: 'ISLEMDE', toStatus: 'BEKLEMEDE', changedAt: '2024-07-20T09:15:00', changedBy: 'Av. Ayşe Demir', reason: 'Tebligat bekleniyor', durationDays: 19 },
      { id: '4', fromStatus: 'BEKLEMEDE', toStatus: 'ISLEMDE', changedAt: '2024-08-10T11:00:00', changedBy: 'Sistem', reason: 'Tebligat tamamlandı', durationDays: 21 },
      { id: '5', fromStatus: 'ISLEMDE', toStatus: 'DERDEST', changedAt: '2024-09-05T16:45:00', changedBy: 'Av. Mehmet Kaya', reason: 'Haciz talebi hazırlanıyor', durationDays: 26 },
    ]);
    setLoading(false);
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString('tr-TR');
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Calculate time spent in each status
  const statusDurations = history.reduce((acc, h) => {
    if (h.fromStatus) {
      acc[h.fromStatus] = (acc[h.fromStatus] || 0) + h.durationDays;
    }
    return acc;
  }, {} as Record<string, number>);

  const totalDays = Object.values(statusDurations).reduce((s, d) => s + d, 0);
  const maxDuration = Math.max(...Object.values(statusDurations), 1);

  if (loading) return <div className="animate-pulse h-48 bg-gray-100 rounded-xl" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><History className="h-5 w-5" />Durum Geçmişi</h3>
        <span className="text-sm text-gray-500">{history.length} değişiklik</span>
      </div>

      {/* Duration Analysis */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Durum Süre Analizi</h4>
        <div className="space-y-2">
          {Object.entries(statusDurations).map(([status, days]) => (
            <div key={status} className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded text-xs w-24 text-center ${STATUS_COLORS[status] || 'bg-gray-100'}`}>
                {STATUS_LABELS[status] || status}
              </span>
              <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(days / maxDuration) * 100}%` }} />
              </div>
              <span className="text-sm font-medium w-16 text-right">{days} gün</span>
              <span className="text-xs text-gray-400 w-12 text-right">%{Math.round((days / totalDays) * 100)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2 text-right">Toplam: {totalDays} gün</p>
      </div>

      {/* Timeline */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3">Değişiklik Geçmişi</h4>
        <div className="space-y-4">
          {history.map((h, i) => (
            <div key={h.id} className="flex gap-4">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${i === history.length - 1 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                {i < history.length - 1 && <div className="w-0.5 flex-1 bg-gray-200" />}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {h.fromStatus && (
                    <>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[h.fromStatus] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[h.fromStatus] || h.fromStatus}
                      </span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                    </>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[h.toStatus] || 'bg-gray-100'}`}>
                    {STATUS_LABELS[h.toStatus] || h.toStatus}
                  </span>
                  {h.durationDays > 0 && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{h.durationDays} gün sonra
                    </span>
                  )}
                </div>
                {h.reason && <p className="text-sm text-gray-600 mt-1">{h.reason}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(h.changedAt)} {formatTime(h.changedAt)}</span>
                  <span className="flex items-center gap-1"><User className="h-3 w-3" />{h.changedBy}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
