'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Scale, FileText, Clock, CheckCircle, AlertTriangle, TrendingUp } from 'lucide-react';

interface LawyerWorkload {
  id: string;
  name: string;
  surname: string;
  barNumber?: string;
  totalCases: number;
  activeCases: number;
  pendingTasks: number;
  completedThisMonth: number;
  avgResponseTime: number;
  upcomingHearings: number;
  workloadScore: number; // 0-100
}

export function LawyerWorkloadReport() {
  const [lawyers, setLawyers] = useState<LawyerWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'cards'>('cards');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get('/reports/lawyer-workload');
      setLawyers(res.data?.data || []);
    } catch (e) {
      // Demo data
      setLawyers([
        { id: '1', name: 'Ahmet', surname: 'Yılmaz', barNumber: '12345', totalCases: 85, activeCases: 62, pendingTasks: 15, completedThisMonth: 8, avgResponseTime: 2.5, upcomingHearings: 3, workloadScore: 78 },
        { id: '2', name: 'Ayşe', surname: 'Demir', barNumber: '23456', totalCases: 65, activeCases: 48, pendingTasks: 8, completedThisMonth: 12, avgResponseTime: 1.8, upcomingHearings: 5, workloadScore: 65 },
        { id: '3', name: 'Mehmet', surname: 'Kaya', barNumber: '34567', totalCases: 42, activeCases: 35, pendingTasks: 22, completedThisMonth: 4, avgResponseTime: 4.2, upcomingHearings: 2, workloadScore: 92 },
        { id: '4', name: 'Fatma', surname: 'Öztürk', barNumber: '45678', totalCases: 55, activeCases: 40, pendingTasks: 10, completedThisMonth: 6, avgResponseTime: 2.1, upcomingHearings: 4, workloadScore: 58 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getWorkloadColor = (score: number) => {
    if (score >= 80) return { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-500' };
    if (score >= 60) return { bg: 'bg-yellow-100', text: 'text-yellow-700', bar: 'bg-yellow-500' };
    return { bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-500' };
  };

  const getWorkloadLabel = (score: number) => {
    if (score >= 80) return 'Yoğun';
    if (score >= 60) return 'Normal';
    return 'Düşük';
  };

  const totalStats = {
    totalLawyers: lawyers.length,
    totalActiveCases: lawyers.reduce((sum, l) => sum + l.activeCases, 0),
    totalPendingTasks: lawyers.reduce((sum, l) => sum + l.pendingTasks, 0),
    avgWorkload: lawyers.length > 0 ? lawyers.reduce((sum, l) => sum + l.workloadScore, 0) / lawyers.length : 0,
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-48 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Özet Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Scale className="h-5 w-5 text-indigo-600" />
            <span className="text-sm text-gray-600">Toplam Avukat</span>
          </div>
          <p className="text-2xl font-bold">{totalStats.totalLawyers}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-gray-600">Aktif Dosya</span>
          </div>
          <p className="text-2xl font-bold">{totalStats.totalActiveCases}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-5 w-5 text-orange-600" />
            <span className="text-sm text-gray-600">Bekleyen Görev</span>
          </div>
          <p className="text-2xl font-bold">{totalStats.totalPendingTasks}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            <span className="text-sm text-gray-600">Ort. İş Yükü</span>
          </div>
          <p className="text-2xl font-bold">%{totalStats.avgWorkload.toFixed(0)}</p>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex justify-end">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setView('cards')}
            className={`px-3 py-1 text-sm rounded-md ${view === 'cards' ? 'bg-white shadow' : ''}`}
          >
            Kartlar
          </button>
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1 text-sm rounded-md ${view === 'table' ? 'bg-white shadow' : ''}`}
          >
            Tablo
          </button>
        </div>
      </div>

      {/* Avukat Kartları */}
      {view === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lawyers.map((lawyer) => {
            const colors = getWorkloadColor(lawyer.workloadScore);
            return (
              <div key={lawyer.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="font-semibold">Av. {lawyer.name} {lawyer.surname}</h4>
                    {lawyer.barNumber && (
                      <p className="text-sm text-gray-500">Baro Sicil: {lawyer.barNumber}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {getWorkloadLabel(lawyer.workloadScore)}
                  </span>
                </div>

                {/* İş Yükü Barı */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">İş Yükü</span>
                    <span className="font-medium">%{lawyer.workloadScore}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${colors.bar}`}
                      style={{ width: `${lawyer.workloadScore}%` }}
                    />
                  </div>
                </div>

                {/* İstatistikler */}
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-blue-600">{lawyer.activeCases}</p>
                    <p className="text-xs text-gray-500">Aktif Dosya</p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-orange-600">{lawyer.pendingTasks}</p>
                    <p className="text-xs text-gray-500">Bekleyen</p>
                  </div>
                  <div className="p-2 bg-gray-50 rounded-lg">
                    <p className="text-lg font-bold text-purple-600">{lawyer.upcomingHearings}</p>
                    <p className="text-xs text-gray-500">Duruşma</p>
                  </div>
                </div>

                {/* Alt Bilgiler */}
                <div className="mt-4 pt-4 border-t flex justify-between text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span>Bu ay: {lawyer.completedThisMonth} tamamlandı</span>
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Clock className="h-4 w-4" />
                    <span>Ort. {lawyer.avgResponseTime} gün</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tablo Görünümü */}
      {view === 'table' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium">Avukat</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Aktif Dosya</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Bekleyen Görev</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Bu Ay Tamamlanan</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Yaklaşan Duruşma</th>
                <th className="text-right px-4 py-3 text-sm font-medium">Ort. Yanıt Süresi</th>
                <th className="text-center px-4 py-3 text-sm font-medium">İş Yükü</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lawyers.map((lawyer) => {
                const colors = getWorkloadColor(lawyer.workloadScore);
                return (
                  <tr key={lawyer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium">Av. {lawyer.name} {lawyer.surname}</p>
                        {lawyer.barNumber && (
                          <p className="text-xs text-gray-500">{lawyer.barNumber}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">{lawyer.activeCases}</td>
                    <td className="px-4 py-3 text-right">
                      {lawyer.pendingTasks > 15 ? (
                        <span className="flex items-center justify-end gap-1 text-red-600">
                          <AlertTriangle className="h-4 w-4" />
                          {lawyer.pendingTasks}
                        </span>
                      ) : (
                        lawyer.pendingTasks
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-green-600">{lawyer.completedThisMonth}</td>
                    <td className="px-4 py-3 text-right">{lawyer.upcomingHearings}</td>
                    <td className="px-4 py-3 text-right">{lawyer.avgResponseTime} gün</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${colors.bar}`}
                            style={{ width: `${lawyer.workloadScore}%` }}
                          />
                        </div>
                        <span className={`text-xs font-medium ${colors.text}`}>
                          %{lawyer.workloadScore}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
