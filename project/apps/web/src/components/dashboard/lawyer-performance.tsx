'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User, Briefcase, TrendingUp, Clock, Award, Loader2, BarChart3 } from 'lucide-react';

interface LawyerStats {
  id: string;
  name: string;
  activeCases: number;
  closedCases: number;
  totalCollection: number;
  collectionRate: number;
  avgCaseDuration: number;
  pendingTasks: number;
  upcomingHearings: number;
  performance: number; // 0-100
}

interface LawyerPerformanceDashboardProps {
  period?: 'week' | 'month' | 'year';
}

export function LawyerPerformanceDashboard({ period = 'month' }: LawyerPerformanceDashboardProps) {
  const [lawyers, setLawyers] = useState<LawyerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState(period);
  const [sortBy, setSortBy] = useState<'performance' | 'collection' | 'cases'>('performance');

  useEffect(() => {
    loadStats();
  }, [selectedPeriod]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/lawyer-performance?period=${selectedPeriod}`);
      setLawyers(res.data?.data || []);
    } catch (e) {
      // Demo data
      setLawyers([
        { id: '1', name: 'Av. Mehmet Yılmaz', activeCases: 45, closedCases: 12, totalCollection: 850000, collectionRate: 72, avgCaseDuration: 45, pendingTasks: 8, upcomingHearings: 3, performance: 85 },
        { id: '2', name: 'Av. Ayşe Demir', activeCases: 38, closedCases: 18, totalCollection: 1200000, collectionRate: 85, avgCaseDuration: 38, pendingTasks: 5, upcomingHearings: 2, performance: 92 },
        { id: '3', name: 'Av. Can Öztürk', activeCases: 52, closedCases: 8, totalCollection: 620000, collectionRate: 58, avgCaseDuration: 52, pendingTasks: 12, upcomingHearings: 5, performance: 68 },
        { id: '4', name: 'Av. Zeynep Kaya', activeCases: 30, closedCases: 22, totalCollection: 980000, collectionRate: 78, avgCaseDuration: 42, pendingTasks: 3, upcomingHearings: 1, performance: 88 },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(amount);
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const getPerformanceBarColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const sortedLawyers = [...lawyers].sort((a, b) => {
    if (sortBy === 'performance') return b.performance - a.performance;
    if (sortBy === 'collection') return b.totalCollection - a.totalCollection;
    return b.activeCases - a.activeCases;
  });

  const totalStats = {
    activeCases: lawyers.reduce((sum, l) => sum + l.activeCases, 0),
    closedCases: lawyers.reduce((sum, l) => sum + l.closedCases, 0),
    totalCollection: lawyers.reduce((sum, l) => sum + l.totalCollection, 0),
    avgPerformance: lawyers.length > 0 ? Math.round(lawyers.reduce((sum, l) => sum + l.performance, 0) / lawyers.length) : 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Avukat Performans Analizi
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as any)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="week">Bu Hafta</option>
            <option value="month">Bu Ay</option>
            <option value="year">Bu Yıl</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="performance">Performansa Göre</option>
            <option value="collection">Tahsilata Göre</option>
            <option value="cases">Dosya Sayısına Göre</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Toplam Aktif Dosya</p>
          <p className="text-2xl font-bold">{totalStats.activeCases}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Kapatılan Dosya</p>
          <p className="text-2xl font-bold text-green-600">{totalStats.closedCases}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Toplam Tahsilat</p>
          <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalStats.totalCollection)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Ort. Performans</p>
          <p className="text-2xl font-bold">%{totalStats.avgPerformance}</p>
        </div>
      </div>

      {/* Lawyer Cards */}
      <div className="grid grid-cols-2 gap-4">
        {sortedLawyers.map((lawyer, index) => (
          <div key={lawyer.id} className="bg-white rounded-xl border p-4">
            <div className="flex items-start gap-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                  <User className="h-6 w-6 text-gray-400" />
                </div>
                {index < 3 && (
                  <div className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-400 text-yellow-900' :
                    index === 1 ? 'bg-gray-300 text-gray-700' :
                    'bg-orange-300 text-orange-800'
                  }`}>
                    {index + 1}
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{lawyer.name}</h3>
                  <span className={`px-2 py-0.5 rounded text-sm font-medium ${getPerformanceColor(lawyer.performance)}`}>
                    %{lawyer.performance}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getPerformanceBarColor(lawyer.performance)}`}
                    style={{ width: `${lawyer.performance}%` }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <p className="text-lg font-semibold">{lawyer.activeCases}</p>
                    <p className="text-xs text-gray-500">Aktif</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-green-600">{lawyer.closedCases}</p>
                    <p className="text-xs text-gray-500">Kapalı</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-blue-600">%{lawyer.collectionRate}</p>
                    <p className="text-xs text-gray-500">Tahsilat</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{lawyer.avgCaseDuration}</p>
                    <p className="text-xs text-gray-500">Ort. Gün</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {lawyer.pendingTasks} bekleyen görev
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" />
                    {lawyer.upcomingHearings} duruşma
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
