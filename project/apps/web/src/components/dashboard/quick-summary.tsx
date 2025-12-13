'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { 
  TrendingUp, TrendingDown, DollarSign, 
  FileText, Users, Calendar, AlertTriangle 
} from 'lucide-react';

interface SummaryData {
  totalCases: number;
  activeCases: number;
  totalClients: number;
  totalCollections: number;
  pendingTasks: number;
  expiringPoas: number;
  upcomingHearings: number;
  monthlyGrowth: number;
}

export function QuickSummary() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    try {
      const [casesRes, clientsRes, poaRes, calendarRes] = await Promise.all([
        api.get('/cases/stats').catch(() => ({ data: {} })),
        api.get('/clients').catch(() => ({ data: [] })),
        api.get('/poa/expiring/list?days=30').catch(() => ({ data: [] })),
        api.get('/calendar/upcoming?limit=10').catch(() => ({ data: [] })),
      ]);

      const hearings = (calendarRes.data || []).filter((e: any) => e.type === 'DURUSMA');

      setData({
        totalCases: casesRes.data?.total || 0,
        activeCases: casesRes.data?.active || 0,
        totalClients: Array.isArray(clientsRes.data?.data) ? clientsRes.data.data.length : 0,
        totalCollections: casesRes.data?.totalCollections || 0,
        pendingTasks: casesRes.data?.pendingTasks || 0,
        expiringPoas: Array.isArray(poaRes.data?.data) ? poaRes.data.data.length : 0,
        upcomingHearings: hearings.length,
        monthlyGrowth: 12, // Demo
      });
    } catch (e) {
      setData({
        totalCases: 0,
        activeCases: 0,
        totalClients: 0,
        totalCollections: 0,
        pendingTasks: 0,
        expiringPoas: 0,
        upcomingHearings: 0,
        monthlyGrowth: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-white rounded-xl border p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-16 mb-2" />
            <div className="h-8 bg-gray-200 rounded w-12" />
          </div>
        ))}
      </div>
    );
  }

  const cards = [
    {
      label: 'Aktif Dosya',
      value: data?.activeCases || 0,
      total: data?.totalCases || 0,
      icon: FileText,
      color: 'text-blue-600 bg-blue-100',
      trend: data?.monthlyGrowth || 0,
    },
    {
      label: 'Müvekkil',
      value: data?.totalClients || 0,
      icon: Users,
      color: 'text-green-600 bg-green-100',
    },
    {
      label: 'Yaklaşan Duruşma',
      value: data?.upcomingHearings || 0,
      icon: Calendar,
      color: 'text-purple-600 bg-purple-100',
    },
    {
      label: 'Vekalet Uyarısı',
      value: data?.expiringPoas || 0,
      icon: AlertTriangle,
      color: data?.expiringPoas ? 'text-red-600 bg-red-100' : 'text-gray-600 bg-gray-100',
      alert: (data?.expiringPoas || 0) > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card, i) => (
        <div 
          key={i} 
          className={`bg-white rounded-xl border p-4 ${card.alert ? 'border-red-200' : ''}`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500">{card.label}</span>
            <div className={`p-1.5 rounded-lg ${card.color}`}>
              <card.icon className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <span className="text-2xl font-bold">{card.value}</span>
              {card.total !== undefined && card.total > 0 && (
                <span className="text-xs text-gray-400 ml-1">/ {card.total}</span>
              )}
            </div>
            {card.trend !== undefined && card.trend !== 0 && (
              <div className={`flex items-center gap-0.5 text-xs ${card.trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {card.trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(card.trend)}%
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
