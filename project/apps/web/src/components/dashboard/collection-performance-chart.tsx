'use client';

import { useState } from 'react';
import { TrendingUp, Target, Calendar, BarChart3, ArrowUp, ArrowDown } from 'lucide-react';

interface PerformanceData {
  period: string;
  target: number;
  actual: number;
  previousPeriod: number;
}

export function CollectionPerformanceChart() {
  const [view, setView] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');

  // Demo data
  const monthlyData: PerformanceData[] = [
    { period: 'Ocak', target: 500000, actual: 420000, previousPeriod: 380000 },
    { period: 'Şubat', target: 500000, actual: 550000, previousPeriod: 410000 },
    { period: 'Mart', target: 550000, actual: 480000, previousPeriod: 450000 },
    { period: 'Nisan', target: 550000, actual: 620000, previousPeriod: 520000 },
    { period: 'Mayıs', target: 600000, actual: 580000, previousPeriod: 490000 },
    { period: 'Haziran', target: 600000, actual: 710000, previousPeriod: 550000 },
  ];

  const data = monthlyData;
  const maxValue = Math.max(...data.flatMap(d => [d.target, d.actual, d.previousPeriod]));
  const totalTarget = data.reduce((s, d) => s + d.target, 0);
  const totalActual = data.reduce((s, d) => s + d.actual, 0);
  const totalPrevious = data.reduce((s, d) => s + d.previousPeriod, 0);
  const achievementRate = Math.round((totalActual / totalTarget) * 100);
  const growthRate = Math.round(((totalActual - totalPrevious) / totalPrevious) * 100);

  const formatCurrency = (n: number) => n >= 1000000 ? `${(n/1000000).toFixed(1)}M` : `${(n/1000).toFixed(0)}K`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2"><TrendingUp className="h-5 w-5" />Tahsilat Performansı</h3>
        <div className="flex gap-1">
          {(['monthly', 'quarterly', 'yearly'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 rounded text-sm ${view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 hover:bg-gray-200'}`}>
              {v === 'monthly' ? 'Aylık' : v === 'quarterly' ? 'Çeyreklik' : 'Yıllık'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 rounded-xl p-4 text-center">
          <Target className="h-5 w-5 mx-auto mb-1 text-blue-600" />
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalTarget)}₺</p>
          <p className="text-xs text-blue-600">Hedef</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 text-center">
          <BarChart3 className="h-5 w-5 mx-auto mb-1 text-green-600" />
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalActual)}₺</p>
          <p className="text-xs text-green-600">Gerçekleşen</p>
        </div>
        <div className={`${achievementRate >= 100 ? 'bg-green-50' : 'bg-orange-50'} rounded-xl p-4 text-center`}>
          <div className={`flex items-center justify-center gap-1 ${achievementRate >= 100 ? 'text-green-600' : 'text-orange-600'}`}>
            {growthRate >= 0 ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
          </div>
          <p className={`text-2xl font-bold ${achievementRate >= 100 ? 'text-green-700' : 'text-orange-700'}`}>%{achievementRate}</p>
          <p className={`text-xs ${achievementRate >= 100 ? 'text-green-600' : 'text-orange-600'}`}>Başarı Oranı</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white border rounded-xl p-4">
        <div className="flex items-end gap-2 h-48">
          {data.map((d, i) => {
            const targetHeight = (d.target / maxValue) * 100;
            const actualHeight = (d.actual / maxValue) * 100;
            const prevHeight = (d.previousPeriod / maxValue) * 100;
            const achieved = d.actual >= d.target;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center gap-1 h-40">
                  <div className="w-3 bg-gray-200 rounded-t" style={{ height: `${prevHeight}%` }} title={`Önceki: ${formatCurrency(d.previousPeriod)}₺`} />
                  <div className={`w-4 ${achieved ? 'bg-green-500' : 'bg-orange-500'} rounded-t`} style={{ height: `${actualHeight}%` }} title={`Gerçekleşen: ${formatCurrency(d.actual)}₺`} />
                  <div className="w-1 bg-blue-400 rounded-t" style={{ height: `${targetHeight}%` }} title={`Hedef: ${formatCurrency(d.target)}₺`} />
                </div>
                <span className="text-xs text-gray-500">{d.period.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-center gap-6 mt-4 text-xs">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-gray-200 rounded" />Önceki Dönem</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" />Gerçekleşen</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-400 rounded" />Hedef</span>
        </div>
      </div>

      {/* Trend Analysis */}
      <div className="bg-white border rounded-xl p-4">
        <h4 className="font-medium mb-3">Trend Analizi</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${growthRate >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {growthRate >= 0 ? <ArrowUp className="h-5 w-5 text-green-600" /> : <ArrowDown className="h-5 w-5 text-red-600" />}
            </div>
            <div>
              <p className={`text-lg font-bold ${growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>{growthRate >= 0 ? '+' : ''}{growthRate}%</p>
              <p className="text-xs text-gray-500">Geçen döneme göre</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-blue-100">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold">{data.filter(d => d.actual >= d.target).length}/{data.length}</p>
              <p className="text-xs text-gray-500">Hedef tutturulan ay</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
