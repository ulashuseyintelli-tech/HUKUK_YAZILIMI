'use client';

import { useState } from 'react';
import { Calculator, Calendar, TrendingUp, Download, RefreshCw } from 'lucide-react';

interface InterestPeriod {
  startDate: string;
  endDate: string;
  days: number;
  rate: number;
  interest: number;
  cumulative: number;
}

interface InterestCalculatorProps {
  initialPrincipal?: number;
  initialDate?: string;
}

const LEGAL_RATES: Record<string, number> = {
  '2024-H2': 24,
  '2024-H1': 24,
  '2023-H2': 24,
  '2023-H1': 18.25,
  '2022-H2': 15.75,
  '2022-H1': 9,
};

const COMMERCIAL_RATES: Record<string, number> = {
  '2024-H2': 54,
  '2024-H1': 54,
  '2023-H2': 54,
  '2023-H1': 43.25,
  '2022-H2': 40.75,
  '2022-H1': 34,
};

export function InterestCalculator({ initialPrincipal = 0, initialDate }: InterestCalculatorProps) {
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [startDate, setStartDate] = useState(initialDate || '');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [interestType, setInterestType] = useState<'legal' | 'commercial'>('legal');
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [periods, setPeriods] = useState<InterestPeriod[]>([]);
  const [totalInterest, setTotalInterest] = useState(0);

  const getRateForPeriod = (date: Date): number => {
    if (customRate !== null) return customRate;
    
    const year = date.getFullYear();
    const half = date.getMonth() < 6 ? 'H1' : 'H2';
    const key = `${year}-${half}`;
    
    const rates = interestType === 'legal' ? LEGAL_RATES : COMMERCIAL_RATES;
    return rates[key] || (interestType === 'legal' ? 24 : 54);
  };

  const calculateInterest = () => {
    if (!principal || !startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      alert('Bitiş tarihi başlangıç tarihinden sonra olmalıdır');
      return;
    }

    const calculatedPeriods: InterestPeriod[] = [];
    let currentDate = new Date(start);
    let cumulative = 0;

    while (currentDate < end) {
      const periodStart = new Date(currentDate);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      
      // Period end is either end of half-year or end date
      let periodEnd: Date;
      if (month < 6) {
        periodEnd = new Date(year, 6, 1);
      } else {
        periodEnd = new Date(year + 1, 0, 1);
      }
      
      if (periodEnd > end) {
        periodEnd = new Date(end);
      }

      const days = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
      const rate = getRateForPeriod(periodStart);
      const interest = (principal * rate * days) / (365 * 100);
      cumulative += interest;

      calculatedPeriods.push({
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0],
        days,
        rate,
        interest: Math.round(interest * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
      });

      currentDate = periodEnd;
    }

    setPeriods(calculatedPeriods);
    setTotalInterest(Math.round(cumulative * 100) / 100);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(amount);
  };

  const handleExport = () => {
    if (periods.length === 0) return;

    let csv = 'Başlangıç,Bitiş,Gün,Oran (%),Faiz,Kümülatif\n';
    periods.forEach(p => {
      csv += `${p.startDate},${p.endDate},${p.days},${p.rate},${p.interest},${p.cumulative}\n`;
    });
    csv += `\nAna Para:,${principal}\n`;
    csv += `Toplam Faiz:,${totalInterest}\n`;
    csv += `Genel Toplam:,${principal + totalInterest}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `faiz_hesaplama_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleReset = () => {
    setPrincipal(initialPrincipal);
    setStartDate(initialDate || '');
    setEndDate(new Date().toISOString().split('T')[0]);
    setCustomRate(null);
    setPeriods([]);
    setTotalInterest(0);
  };

  return (
    <div className="space-y-6">
      {/* Input Form */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-medium flex items-center gap-2 mb-4">
          <Calculator className="h-5 w-5" />
          Faiz Hesaplama
        </h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ana Para (TL)</label>
            <input
              type="number"
              value={principal || ''}
              onChange={(e) => setPrincipal(parseFloat(e.target.value) || 0)}
              className="w-full border rounded-lg px-3 py-2"
              placeholder="100.000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Faiz Türü</label>
            <select
              value={interestType}
              onChange={(e) => setInterestType(e.target.value as any)}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="legal">Yasal Faiz</option>
              <option value="commercial">Ticari Faiz</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={customRate !== null}
              onChange={(e) => setCustomRate(e.target.checked ? 24 : null)}
              className="rounded"
            />
            <span className="text-sm">Özel Oran Kullan</span>
          </label>
          {customRate !== null && (
            <input
              type="number"
              value={customRate}
              onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
              className="w-24 border rounded px-2 py-1 text-sm"
              placeholder="%"
              step={0.25}
            />
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={calculateInterest}
            disabled={!principal || !startDate || !endDate}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <TrendingUp className="h-4 w-4" />
            Hesapla
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Results */}
      {periods.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
            <div className="text-center">
              <p className="text-xs text-gray-500">Ana Para</p>
              <p className="text-lg font-bold">{formatCurrency(principal)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Toplam Faiz</p>
              <p className="text-lg font-bold text-orange-600">{formatCurrency(totalInterest)}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Genel Toplam</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(principal + totalInterest)}</p>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left">Dönem</th>
                  <th className="px-4 py-2 text-right">Gün</th>
                  <th className="px-4 py-2 text-right">Oran (%)</th>
                  <th className="px-4 py-2 text-right">Faiz</th>
                  <th className="px-4 py-2 text-right">Kümülatif</th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-2">
                      <span className="text-gray-500">{period.startDate}</span>
                      <span className="mx-1">→</span>
                      <span>{period.endDate}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{period.days}</td>
                    <td className="px-4 py-2 text-right">{period.rate}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(period.interest)}</td>
                    <td className="px-4 py-2 text-right font-medium">{formatCurrency(period.cumulative)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Export */}
          <div className="p-4 border-t">
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              CSV İndir
            </button>
          </div>
        </div>
      )}

      {/* Rate Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="font-medium mb-2 text-sm">Güncel Faiz Oranları</h4>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Yasal Faiz (2024)</p>
            <p className="font-medium">%24</p>
          </div>
          <div>
            <p className="text-gray-500">Ticari Faiz (2024)</p>
            <p className="font-medium">%54</p>
          </div>
        </div>
      </div>
    </div>
  );
}
