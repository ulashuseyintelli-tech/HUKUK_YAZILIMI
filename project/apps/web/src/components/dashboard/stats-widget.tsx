'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { TrendingUp, TrendingDown, Minus, FileText, Users, CreditCard, Clock } from 'lucide-react';

interface Stats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalClients: number;
  totalCollections: number;
  pendingTasks: number;
  // Değişim oranları
  casesChange: number;
  collectionsChange: number;
}

export function StatsWidget() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const [casesRes, clientsRes, collectionsRes, tasksRes] = await Promise.all([
        api.get('/cases/stats').catch(() => ({ data: { total: 0, active: 0, closed: 0 } })),
        api.get('/clients').catch(() => ({ data: [] })),
        api.get('/collections/stats').catch(() => ({ data: { total: 0 } })),
        api.get('/tasks?status=PENDING').catch(() => ({ data: [] })),
      ]);

      setStats({
        totalCases: casesRes.data?.total || 0,
        activeCases: casesRes.data?.active || 0,
        closedCases: casesRes.data?.closed || 0,
        totalClients: Array.isArray(clientsRes.data) ? clientsRes.data.length : 0,
        totalCollections: collectionsRes.data?.total || 0,
        pendingTasks: Array.isArray(tasksRes.data) ? tasksRes.data.length : 0,
        casesChange: 12, // Demo değer
        collectionsChange: 8, // Demo değer
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (change < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-20 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      label: 'Toplam Takip',
      value: stats?.totalCases || 0,
      change: stats?.casesChange || 0,
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
    },
    {
      label: 'Aktif Takip',
      value: stats?.activeCases || 0,
      icon: Clock,
      color: 'text-green-600 bg-green-100',
    },
    {
      label: 'Müvekkil',
      value: stats?.totalClients || 0,
      icon: Users,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      label: 'Bekleyen Görev',
      value: stats?.pendingTasks || 0,
      icon: CreditCard,
      color: 'text-orange-600 bg-orange-100',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statCards.map((stat, i) => (
        <div key={i} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{stat.label}</span>
            <div className={`p-2 rounded-lg ${stat.color}`}>
              <stat.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-2xl font-bold">{formatNumber(stat.value)}</span>
            {stat.change !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {getTrendIcon(stat.change)}
                <span className={stat.change > 0 ? 'text-green-600' : stat.change < 0 ? 'text-red-600' : 'text-gray-400'}>
                  {Math.abs(stat.change)}%
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
