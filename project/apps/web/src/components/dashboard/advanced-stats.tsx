'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  type DashboardReadState,
  fromResponse,
  fromError,
  freshData,
  staleData,
  isPending,
  isStale,
} from '@/lib/dashboard-read-state';
import { 
  TrendingUp, TrendingDown, DollarSign, Users, FileText, 
  Calendar, Target, PieChart, BarChart3, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface StatsData {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalClients: number;
  totalDebtors: number;
  totalCollected: number;
  totalPrincipal: number;
  collectionRate: number;
  avgCaseDuration: number;
  casesThisMonth: number;
  casesLastMonth: number;
  collectionsThisMonth: number;
  collectionsLastMonth: number;
  riskDistribution: { name: string; count: number; color: string }[];
  statusDistribution: { name: string; count: number; color: string }[];
  monthlyTrend: { month: string; cases: number; collections: number }[];
}

/**
 * WSMR-A2: GET başarısızsa UYDURMA BİR FİNANSAL TABLO basılıyordu — 1.250 dosya,
 * 2.450.000 TL tahsilat, %28,8 tahsilat oranı, sahte risk/durum dağılımları.
 * Kullanıcı bunu gerçek ofis verisi sanıyordu. Ayrıca `res.data?.data` doğrulanmadan
 * atanıyordu: gövde bozuksa bileşen sessizce hiçbir şey render etmiyordu.
 */
const validateStats = (raw: unknown): StatsData | undefined => {
  const d = (raw as { data?: { data?: unknown } })?.data?.data as Record<string, unknown> | undefined;
  if (!d || typeof d !== 'object') return undefined;
  const nums = ['totalCases', 'activeCases', 'closedCases', 'totalCollected', 'collectionRate'] as const;
  if (!nums.every((k) => typeof d[k] === 'number' && Number.isFinite(d[k]))) return undefined;
  return d as unknown as StatsData;
};

export function AdvancedStats() {
  const [state, setState] = useState<DashboardReadState<StatsData>>({ status: 'IDLE' });
  const stats = freshData(state) ?? staleData(state);
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  useEffect(() => {
    loadStats();
  }, [period]);

  const loadStats = async () => {
    setState((p) => (isPending(p) ? { status: 'LOADING' } : p));
    try {
      const res = await api.get(`/reports/advanced-stats?period=${period}`);
      setState(fromResponse(res, validateStats, () => false, Date.now()));
    } catch (e) {
      setState((prev) =>
        fromError(e, prev, { endpoint: '/reports/advanced-stats', widget: 'Gelişmiş istatistikler' }),
      );
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
  };

  const getChangePercent = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  if (isPending(state)) {
    return (
      <div className="bg-white rounded-xl border p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-white rounded-xl border p-6 text-center">
        <p className="text-sm font-medium text-red-600">İstatistikler alınamadı</p>
        <button
          type="button"
          onClick={loadStats}
          className="mt-1 text-xs text-blue-600 underline hover:text-blue-800"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  const caseChange = Number(getChangePercent(stats.casesThisMonth, stats.casesLastMonth));
  const collectionChange = Number(getChangePercent(stats.collectionsThisMonth, stats.collectionsLastMonth));

  return (
    <div className="space-y-4">
      {isStale(state) && (
        <p className="text-xs text-yellow-700">Güncel olmayabilir</p>
      )}
      {/* Period Selector */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-indigo-600" />
          Gelişmiş İstatistikler
        </h3>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs rounded-md transition-colors ${
                period === p ? 'bg-white shadow text-indigo-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {p === 'week' ? 'Hafta' : p === 'month' ? 'Ay' : 'Yıl'}
            </button>
          ))}
        </div>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Toplam Dosya"
          value={stats.totalCases.toLocaleString('tr-TR')}
          subtitle={`${stats.activeCases} aktif`}
          icon={<FileText className="h-5 w-5" />}
          color="blue"
        />
        <StatCard
          title="Tahsilat Oranı"
          value={`%${stats.collectionRate.toFixed(1)}`}
          subtitle={formatCurrency(stats.totalCollected)}
          icon={<Target className="h-5 w-5" />}
          color="green"
        />
        <StatCard
          title="Bu Ay Dosya"
          value={stats.casesThisMonth.toString()}
          change={caseChange}
          icon={<Calendar className="h-5 w-5" />}
          color="purple"
        />
        <StatCard
          title="Bu Ay Tahsilat"
          value={formatCurrency(stats.collectionsThisMonth)}
          change={collectionChange}
          icon={<DollarSign className="h-5 w-5" />}
          color="emerald"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Risk Distribution */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-orange-500" />
            Risk Dağılımı
          </h4>
          <div className="space-y-2">
            {stats.riskDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="flex-1 text-sm">{item.name}</span>
                <span className="text-sm font-medium">{item.count}</span>
                <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ 
                      width: `${(item.count / stats.activeCases) * 100}%`,
                      backgroundColor: item.color 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-blue-500" />
            Durum Dağılımı
          </h4>
          <div className="space-y-2">
            {stats.statusDistribution.map((item) => (
              <div key={item.name} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="flex-1 text-sm">{item.name}</span>
                <span className="text-sm font-medium">{item.count}</span>
                <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ 
                      width: `${(item.count / stats.activeCases) * 100}%`,
                      backgroundColor: item.color 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-500" />
            Özet Bilgiler
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Müvekkil Sayısı</span>
              <span className="font-semibold">{stats.totalClients}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Borçlu Sayısı</span>
              <span className="font-semibold">{stats.totalDebtors}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Ort. Dosya Süresi</span>
              <span className="font-semibold">{stats.avgCaseDuration} gün</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Toplam Alacak</span>
              <span className="font-semibold text-blue-600">{formatCurrency(stats.totalPrincipal)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white rounded-xl border p-4">
        <h4 className="text-sm font-medium mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-500" />
          Aylık Trend
        </h4>
        <div className="flex items-end gap-2 h-32">
          {stats.monthlyTrend.map((item, idx) => {
            const maxCases = Math.max(...stats.monthlyTrend.map(m => m.cases));
            const height = (item.cases / maxCases) * 100;
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center">
                  <span className="text-xs text-gray-500 mb-1">{item.cases}</span>
                  <div
                    className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t"
                    style={{ height: `${height}px` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{item.month}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  change,
  icon,
  color,
}: {
  title: string;
  value: string;
  subtitle?: string;
  change?: number;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'purple' | 'emerald';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{title}</span>
        <span className={`p-1.5 rounded-lg ${colors[color]}`}>{icon}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          <span>{Math.abs(change)}% geçen aya göre</span>
        </div>
      )}
    </div>
  );
}
