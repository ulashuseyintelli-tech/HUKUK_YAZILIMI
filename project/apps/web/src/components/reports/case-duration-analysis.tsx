'use client';

import { useState, useEffect } from 'react';
import { Clock, TrendingUp, TrendingDown, BarChart3, Filter, Calendar } from 'lucide-react';

interface CaseDuration {
  caseId: string;
  fileNumber: string;
  caseType: string;
  status: string;
  startDate: string;
  endDate?: string;
  durationDays: number;
  isActive: boolean;
}

interface DurationStats {
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  totalCases: number;
  activeCases: number;
  closedCases: number;
  byType: Record<string, { avg: number; count: number }>;
  byStatus: Record<string, { avg: number; count: number }>;
}

type FilterPeriod = 'all' | 'year' | 'quarter' | 'month';

export function CaseDurationAnalysis() {
  const [cases, setCases] = useState<CaseDuration[]>([]);
  const [stats, setStats] = useState<DurationStats | null>(null);
  const [period, setPeriod] = useState<FilterPeriod>('year');
  const [caseType, setCaseType] = useState<string>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [period, caseType]);

  const loadData = () => {
    setLoading(true);
    // Demo data
    const demo: CaseDuration[] = [
      { caseId: '1', fileNumber: '2024/1001', caseType: 'ILAMSIZ', status: 'HITAM', startDate: '2024-01-15', endDate: '2024-06-20', durationDays: 157, isActive: false },
      { caseId: '2', fileNumber: '2024/1002', caseType: 'KAMBIYO', status: 'DERDEST', startDate: '2024-03-10', durationDays: 278, isActive: true },
      { caseId: '3', fileNumber: '2024/1003', caseType: 'ILAMLI', status: 'HITAM', startDate: '2024-02-01', endDate: '2024-08-15', durationDays: 196, isActive: false },
      { caseId: '4', fileNumber: '2024/1004', caseType: 'ILAMSIZ', status: 'ISLEMDE', startDate: '2024-05-20', durationDays: 207, isActive: true },
      { caseId: '5', fileNumber: '2024/1005', caseType: 'KAMBIYO', status: 'HITAM', startDate: '2024-04-01', endDate: '2024-09-30', durationDays: 182, isActive: false },
    ];

    const filtered = caseType === 'all' ? demo : demo.filter(c => c.caseType === caseType);
    setCases(filtered);

    // Calculate stats
    const closedCases = filtered.filter(c => !c.isActive);
    const activeCases = filtered.filter(c => c.isActive);
    const durations = closedCases.map(c => c.durationDays);

    const byType: Record<string, { avg: number; count: number }> = {};
    const byStatus: Record<string, { avg: number; count: number }> = {};

    filtered.forEach(c => {
      if (!byType[c.caseType]) byType[c.caseType] = { avg: 0, count: 0 };
      byType[c.caseType].count++;
      byType[c.caseType].avg += c.durationDays;

      if (!byStatus[c.status]) byStatus[c.status] = { avg: 0, count: 0 };
      byStatus[c.status].count++;
      byStatus[c.status].avg += c.durationDays;
    });

    Object.keys(byType).forEach(k => { byType[k].avg = Math.round(byType[k].avg / byType[k].count); });
    Object.keys(byStatus).forEach(k => { byStatus[k].avg = Math.round(byStatus[k].avg / byStatus[k].count); });

    setStats({
      avgDuration: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
      minDuration: durations.length ? Math.min(...durations) : 0,
      maxDuration: durations.length ? Math.max(...durations) : 0,
      totalCases: filtered.length,
      activeCases: activeCases.length,
      closedCases: closedCases.length,
      byType,
      byStatus,
    });
    setLoading(false);
  };

  const TYPE_LABELS: Record<string, string> = { ILAMSIZ: 'İlamsız', ILAMLI: 'İlamlı', KAMBIYO: 'Kambiyo' };
  const STATUS_LABELS: Record<string, string> = { DERDEST: 'Derdest', ISLEMDE: 'İşlemde', HITAM: 'Hitam' };

  if (loading || !stats) {
    return <div className="flex items-center justify-center py-12"><Clock className="h-6 w-6 animate-pulse text-gray-400" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select value={period} onChange={(e) => setPeriod(e.target.value as FilterPeriod)} className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="all">Tüm Zamanlar</option>
            <option value="year">Bu Yıl</option>
            <option value="quarter">Bu Çeyrek</option>
            <option value="month">Bu Ay</option>
          </select>
        </div>
        <select value={caseType} onChange={(e) => setCaseType(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="all">Tüm Türler</option>
          <option value="ILAMSIZ">İlamsız</option>
          <option value="ILAMLI">İlamlı</option>
          <option value="KAMBIYO">Kambiyo</option>
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Clock className="h-5 w-5 text-blue-600" />} label="Ort. Süre" value={`${stats.avgDuration} gün`} color="blue" />
        <StatCard icon={<TrendingDown className="h-5 w-5 text-green-600" />} label="Min Süre" value={`${stats.minDuration} gün`} color="green" />
        <StatCard icon={<TrendingUp className="h-5 w-5 text-red-600" />} label="Max Süre" value={`${stats.maxDuration} gün`} color="red" />
        <StatCard icon={<BarChart3 className="h-5 w-5 text-purple-600" />} label="Toplam Dosya" value={stats.totalCases.toString()} color="purple" />
      </div>

      {/* By Type */}
      <div className="bg-white rounded-xl border p-4">
        <h4 className="font-medium mb-3">Takip Türüne Göre Ortalama Süre</h4>
        <div className="space-y-3">
          {Object.entries(stats.byType).map(([type, data]) => (
            <div key={type} className="flex items-center gap-3">
              <span className="w-20 text-sm text-gray-600">{TYPE_LABELS[type] || type}</span>
              <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min((data.avg / stats.maxDuration) * 100, 100)}%` }} />
              </div>
              <span className="w-20 text-sm font-medium text-right">{data.avg} gün</span>
              <span className="w-16 text-xs text-gray-400">({data.count} dosya)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Cases Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b"><h4 className="font-medium">Son Kapanan Dosyalar</h4></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-2">Dosya No</th>
                <th className="text-left px-4 py-2">Tür</th>
                <th className="text-left px-4 py-2">Başlangıç</th>
                <th className="text-left px-4 py-2">Bitiş</th>
                <th className="text-right px-4 py-2">Süre</th>
              </tr>
            </thead>
            <tbody>
              {cases.filter(c => !c.isActive).slice(0, 5).map((c) => (
                <tr key={c.caseId} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-blue-600">{c.fileNumber}</td>
                  <td className="px-4 py-2">{TYPE_LABELS[c.caseType] || c.caseType}</td>
                  <td className="px-4 py-2">{new Date(c.startDate).toLocaleDateString('tr-TR')}</td>
                  <td className="px-4 py-2">{c.endDate ? new Date(c.endDate).toLocaleDateString('tr-TR') : '-'}</td>
                  <td className="px-4 py-2 text-right font-medium">{c.durationDays} gün</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const bgColors: Record<string, string> = { blue: 'bg-blue-50', green: 'bg-green-50', red: 'bg-red-50', purple: 'bg-purple-50' };
  return (
    <div className={`${bgColors[color]} rounded-xl p-4`}>
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-sm text-gray-600">{label}</span></div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
