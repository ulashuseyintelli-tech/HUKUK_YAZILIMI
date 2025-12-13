'use client';

import { useState, useEffect } from 'react';
import { FileText, Users, DollarSign, TrendingUp, TrendingDown, Clock, AlertTriangle, CheckCircle, Scale, Gavel } from 'lucide-react';

interface CaseStats {
  totalCases: number;
  activeCases: number;
  closedCases: number;
  totalDebt: number;
  collectedAmount: number;
  collectionRate: number;
  avgDuration: number;
  pendingHearings: number;
  expiringPoas: number;
  trends: {
    cases: number;
    collection: number;
  };
}

interface CaseStatCardsProps {
  compact?: boolean;
}

export function CaseStatCards({ compact = false }: CaseStatCardsProps) {
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = () => {
    // Demo data
    setStats({
      totalCases: 1247, activeCases: 892, closedCases: 355, totalDebt: 45680000, collectedAmount: 28750000,
      collectionRate: 62.9, avgDuration: 145, pendingHearings: 12, expiringPoas: 3,
      trends: { cases: 8.5, collection: 12.3 }
    });
    setLoading(false);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}M ₺`;
    if (amount >= 1000) return `${(amount / 1000).toFixed(0)}K ₺`;
    return `${amount} ₺`;
  };

  if (loading || !stats) return <div className="animate-pulse h-32 bg-gray-100 rounded-xl" />;

  const cards = [
    { icon: <FileText className="h-5 w-5" />, label: 'Toplam Dosya', value: stats.totalCases.toLocaleString('tr-TR'), sub: `${stats.activeCases} aktif`, color: 'blue', trend: stats.trends.cases },
    { icon: <DollarSign className="h-5 w-5" />, label: 'Toplam Alacak', value: formatCurrency(stats.totalDebt), sub: formatCurrency(stats.collectedAmount) + ' tahsil', color: 'green', trend: stats.trends.collection },
    { icon: <TrendingUp className="h-5 w-5" />, label: 'Tahsilat Oranı', value: `%${stats.collectionRate.toFixed(1)}`, sub: 'Genel başarı', color: 'purple' },
    { icon: <Clock className="h-5 w-5" />, label: 'Ort. Süre', value: `${stats.avgDuration} gün`, sub: 'Dosya kapanış', color: 'orange' },
    { icon: <Gavel className="h-5 w-5" />, label: 'Bekleyen Duruşma', value: stats.pendingHearings.toString(), sub: 'Bu ay', color: 'red' },
    { icon: <AlertTriangle className="h-5 w-5" />, label: 'Vekalet Uyarısı', value: stats.expiringPoas.toString(), sub: 'Süresi dolacak', color: 'yellow' },
  ];

  const colorClasses: Record<string, { bg: string; icon: string; text: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', text: 'text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', text: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', text: 'text-purple-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', text: 'text-orange-700' },
    red: { bg: 'bg-red-50', icon: 'text-red-600', text: 'text-red-700' },
    yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600', text: 'text-yellow-700' },
  };

  if (compact) {
    return (
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {cards.map((card, i) => (
          <div key={i} className={`${colorClasses[card.color].bg} rounded-lg p-3 text-center`}>
            <div className={`${colorClasses[card.color].icon} mx-auto mb-1`}>{card.icon}</div>
            <p className="text-lg font-bold">{card.value}</p>
            <p className="text-xs text-gray-500 truncate">{card.label}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((card, i) => (
        <div key={i} className="bg-white rounded-xl border p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${colorClasses[card.color].bg}`}>
              <span className={colorClasses[card.color].icon}>{card.icon}</span>
            </div>
            <span className="text-sm text-gray-500">{card.label}</span>
          </div>
          <p className="text-2xl font-bold mb-1">{card.value}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">{card.sub}</span>
            {card.trend !== undefined && (
              <span className={`text-xs flex items-center gap-0.5 ${card.trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {card.trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(card.trend)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Individual stat card for custom use
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: number;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red' | 'yellow';
  onClick?: () => void;
}

export function StatCard({ icon, label, value, subtitle, trend, color = 'blue', onClick }: StatCardProps) {
  const colorClasses: Record<string, { bg: string; icon: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600' },
    green: { bg: 'bg-green-50', icon: 'text-green-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600' },
    red: { bg: 'bg-red-50', icon: 'text-red-600' },
    yellow: { bg: 'bg-yellow-50', icon: 'text-yellow-600' },
  };

  return (
    <div onClick={onClick} className={`bg-white rounded-xl border p-4 hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color].bg}`}>
          <span className={colorClasses[color].icon}>{icon}</span>
        </div>
        <span className="text-sm text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <div className="flex items-center justify-between">
        {subtitle && <span className="text-xs text-gray-400">{subtitle}</span>}
        {trend !== undefined && (
          <span className={`text-xs flex items-center gap-0.5 ${trend >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}
