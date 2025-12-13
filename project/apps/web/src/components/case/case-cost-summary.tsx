'use client';

import { useState } from 'react';
import { DollarSign, TrendingUp, TrendingDown, PieChart, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface CostSummaryProps {
  caseId: string;
}

interface CostData {
  expenses: { category: string; amount: number; color: string }[];
  income: { source: string; amount: number; color: string }[];
  totalExpense: number;
  totalIncome: number;
  profit: number;
  profitMargin: number;
}

export function CaseCostSummary({ caseId }: CostSummaryProps) {
  const [period, setPeriod] = useState<'all' | 'month' | 'year'>('all');

  // Demo data
  const data: CostData = {
    expenses: [
      { category: 'Harç', amount: 5200, color: '#EF4444' },
      { category: 'Posta/Tebligat', amount: 850, color: '#F59E0B' },
      { category: 'Bilirkişi', amount: 3500, color: '#8B5CF6' },
      { category: 'Yol/Ulaşım', amount: 1200, color: '#06B6D4' },
      { category: 'Diğer', amount: 650, color: '#6B7280' },
    ],
    income: [
      { source: 'Tahsilat', amount: 45000, color: '#10B981' },
      { source: 'Vekalet Ücreti', amount: 8500, color: '#3B82F6' },
      { source: 'Faiz', amount: 12000, color: '#EC4899' },
    ],
    totalExpense: 11400,
    totalIncome: 65500,
    profit: 54100,
    profitMargin: 82.6
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
  const maxExpense = Math.max(...data.expenses.map(e => e.amount));
  const maxIncome = Math.max(...data.income.map(i => i.amount));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><DollarSign className="h-5 w-5" />Maliyet Özeti</h3>
        <div className="flex gap-1">
          {(['all', 'year', 'month'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {p === 'all' ? 'Tümü' : p === 'year' ? 'Yıl' : 'Ay'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-red-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-600 mb-1"><ArrowDownRight className="h-4 w-4" /><span className="text-sm">Masraf</span></div>
          <p className="text-xl font-bold text-red-700">{formatCurrency(data.totalExpense)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-600 mb-1"><ArrowUpRight className="h-4 w-4" /><span className="text-sm">Gelir</span></div>
          <p className="text-xl font-bold text-green-700">{formatCurrency(data.totalIncome)}</p>
        </div>
        <div className={`${data.profit >= 0 ? 'bg-blue-50' : 'bg-orange-50'} rounded-xl p-4`}>
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4" /><span className="text-sm">Kar/Zarar</span></div>
          <p className={`text-xl font-bold ${data.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>{formatCurrency(data.profit)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-600 mb-1"><PieChart className="h-4 w-4" /><span className="text-sm">Kar Marjı</span></div>
          <p className="text-xl font-bold text-purple-700">%{data.profitMargin.toFixed(1)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Expenses Chart */}
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3 flex items-center gap-2"><TrendingDown className="h-4 w-4 text-red-500" />Masraf Dağılımı</h4>
          <div className="space-y-3">
            {data.expenses.map((e, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: e.color }} />{e.category}</span>
                  <span className="font-medium">{formatCurrency(e.amount)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(e.amount / maxExpense) * 100}%`, backgroundColor: e.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Income Chart */}
        <div className="bg-white border rounded-xl p-4">
          <h4 className="font-medium mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-green-500" />Gelir Dağılımı</h4>
          <div className="space-y-3">
            {data.income.map((i, idx) => (
              <div key={idx}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: i.color }} />{i.source}</span>
                  <span className="font-medium">{formatCurrency(i.amount)}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(i.amount / maxIncome) * 100}%`, backgroundColor: i.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Bar */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4" />Gelir/Gider Karşılaştırması</h4>
        <div className="flex items-center gap-2 h-8">
          <div className="bg-red-500 h-full rounded-l" style={{ width: `${(data.totalExpense / data.totalIncome) * 100}%` }} />
          <div className="bg-green-500 h-full rounded-r flex-1" />
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Masraf: {formatCurrency(data.totalExpense)}</span>
          <span>Gelir: {formatCurrency(data.totalIncome)}</span>
        </div>
      </div>
    </div>
  );
}
