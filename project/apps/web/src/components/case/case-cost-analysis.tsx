'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { toActionErrorMessage } from '@/lib/action-error';
import { DollarSign, TrendingUp, TrendingDown, PieChart, Loader2, ArrowRight } from 'lucide-react';

interface CostItem {
  category: string;
  label: string;
  amount: number;
  color: string;
}

interface CostAnalysisData {
  totalExpenses: number;
  totalRevenue: number;
  profit: number;
  profitMargin: number;
  expenses: CostItem[];
  revenue: CostItem[];
  monthlyTrend: { month: string; expense: number; revenue: number }[];
}

interface CaseCostAnalysisProps {
  caseId: string;
}

export function CaseCostAnalysis({ caseId }: CaseCostAnalysisProps) {
  const [data, setData] = useState<CostAnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  // WSMR-A3c: GET basarisizsa UYDURMA kayit uretilmez; gorunur hata + retry.
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalysis();
  }, [caseId]);

  const loadAnalysis = async () => {
    setLoadError(null);
    setLoading(true);
    try {
      const res = await api.get(`/cases/${caseId}/cost-analysis`);
      setData(res.data?.data || res.data);
    } catch (e) {
      // WSMR-A3c · UYDURMA KAYITLAR KALDIRILDI. Eskiden burada sabit sahte
      // veri GERCEK dosya bilgisi gibi gosteriliyordu.
      setData(null);
      setLoadError(toActionErrorMessage(e, 'Maliyet analizi alınamadı'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const getColorClass = (color: string, type: 'bg' | 'text') => {
    const colors: Record<string, Record<string, string>> = {
      blue: { bg: 'bg-blue-500', text: 'text-blue-600' },
      green: { bg: 'bg-green-500', text: 'text-green-600' },
      purple: { bg: 'bg-purple-500', text: 'text-purple-600' },
      orange: { bg: 'bg-orange-500', text: 'text-orange-600' },
      gray: { bg: 'bg-gray-500', text: 'text-gray-600' },
      red: { bg: 'bg-red-500', text: 'text-red-600' },
    };
    return colors[color]?.[type] || colors.gray[type];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // WSMR-A3c: hata gorunur ve salt-okuma tekrar denenebilir.
  if (loadError) {
    return (
      <div className="bg-white rounded-xl border p-6 text-center" role="alert">
        <p className="text-sm font-medium text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={loadAnalysis}
          className="mt-2 text-xs text-blue-600 underline hover:text-blue-800"
        >
          Tekrar dene
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-gray-500">
        <DollarSign className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Maliyet verisi bulunamadı</p>
      </div>
    );
  }

  const maxTrendValue = Math.max(
    ...data.monthlyTrend.map(t => Math.max(t.expense, t.revenue))
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-xs text-red-600 flex items-center gap-1">
            <TrendingDown className="h-3 w-3" />
            Toplam Masraf
          </p>
          <p className="text-xl font-bold text-red-700">{formatCurrency(data.totalExpenses)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-xs text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Toplam Gelir
          </p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(data.totalRevenue)}</p>
        </div>
        <div className={`rounded-xl p-4 ${data.profit >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
          <p className={`text-xs ${data.profit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
            Net Kar/Zarar
          </p>
          <p className={`text-xl font-bold ${data.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
            {formatCurrency(data.profit)}
          </p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <p className="text-xs text-purple-600">Kar Marjı</p>
          <p className="text-xl font-bold text-purple-700">%{data.profitMargin}</p>
        </div>
      </div>

      {/* Expense & Revenue Breakdown */}
      <div className="grid grid-cols-2 gap-6">
        {/* Expenses */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="font-medium mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            Masraf Dağılımı
          </h4>
          <div className="space-y-3">
            {data.expenses.map((item) => {
              const percent = data.totalExpenses > 0 
                ? Math.round((item.amount / data.totalExpenses) * 100) 
                : 0;
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{item.label}</span>
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getColorClass(item.color, 'bg')}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">%{percent}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl border p-4">
          <h4 className="font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Gelir Dağılımı
          </h4>
          <div className="space-y-3">
            {data.revenue.map((item) => {
              const percent = data.totalRevenue > 0 
                ? Math.round((item.amount / data.totalRevenue) * 100) 
                : 0;
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{item.label}</span>
                    <span className="font-medium">{formatCurrency(item.amount)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getColorClass(item.color, 'bg')}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">%{percent}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Trend */}
      <div className="bg-white rounded-xl border p-4">
        <h4 className="font-medium mb-4">Aylık Trend</h4>
        <div className="flex items-end gap-2 h-32">
          {data.monthlyTrend.map((month) => (
            <div key={month.month} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex gap-0.5 items-end h-24">
                <div
                  className="flex-1 bg-red-400 rounded-t"
                  style={{ height: `${maxTrendValue > 0 ? (month.expense / maxTrendValue) * 100 : 0}%` }}
                  title={`Masraf: ${formatCurrency(month.expense)}`}
                />
                <div
                  className="flex-1 bg-green-400 rounded-t"
                  style={{ height: `${maxTrendValue > 0 ? (month.revenue / maxTrendValue) * 100 : 0}%` }}
                  title={`Gelir: ${formatCurrency(month.revenue)}`}
                />
              </div>
              <span className="text-xs text-gray-500">{month.month}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-red-400 rounded" />
            Masraf
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 bg-green-400 rounded" />
            Gelir
          </span>
        </div>
      </div>
    </div>
  );
}
