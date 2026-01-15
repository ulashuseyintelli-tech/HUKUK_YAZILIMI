'use client';

/**
 * Interest Calculator Component
 * 
 * ⚠️ REFACTORED: Artık backend API kullanıyor
 * Frontend'de hesaplama YASAK - tüm hesaplamalar backend'den gelir.
 * 
 * @see ARCHITECTURE.md - Source of Truth Matrix
 * @see interest-engine/interest-engine.service.ts
 */

import { useState } from 'react';
import { Calculator, Calendar, TrendingUp, Download, RefreshCw, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

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
  caseId?: string;
}

interface InterestCalculationResult {
  segments: Array<{
    periodStart: string;
    periodEnd: string;
    days: number;
    rate: number;
    segmentInterest: number;
  }>;
  totalInterest: number;
  principal: number;
  totalDue: number;
}

export function InterestCalculator({ initialPrincipal = 0, initialDate, caseId }: InterestCalculatorProps) {
  const [principal, setPrincipal] = useState(initialPrincipal);
  const [startDate, setStartDate] = useState(initialDate || '');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [interestType, setInterestType] = useState<'LEGAL_3095' | 'COMMERCIAL_AVANS_3095_2_2'>('LEGAL_3095');
  const [customRate, setCustomRate] = useState<number | null>(null);
  const [periods, setPeriods] = useState<InterestPeriod[]>([]);
  const [totalInterest, setTotalInterest] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculateInterest = async () => {
    if (!principal || !startDate || !endDate) return;

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (start >= end) {
      setError('Bitiş tarihi başlangıç tarihinden sonra olmalıdır');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Backend API'den hesaplama al
      const response = await apiClient.post<InterestCalculationResult>('/interest-engine/calculate', {
        principalItems: [{
          id: 'temp-calc',
          amount: principal,
          currency: 'TRY',
          startDate: startDate,
          interestType: customRate !== null ? 'CONTRACTUAL' : interestType,
          fixedRate: customRate !== null ? customRate / 100 : undefined,
        }],
        asOfDate: endDate,
        caseId: caseId || 'preview',
      });

      const result = response.data;
      
      // Segment'leri UI formatına dönüştür
      let cumulative = 0;
      const calculatedPeriods: InterestPeriod[] = result.segments.map(seg => {
        cumulative += seg.segmentInterest;
        return {
          startDate: seg.periodStart,
          endDate: seg.periodEnd,
          days: seg.days,
          rate: seg.rate * 100, // Backend decimal döner, UI yüzde gösterir
          interest: Math.round(seg.segmentInterest * 100) / 100,
          cumulative: Math.round(cumulative * 100) / 100,
        };
      });

      setPeriods(calculatedPeriods);
      setTotalInterest(Math.round(result.totalInterest * 100) / 100);
    } catch (err: any) {
      console.error('[InterestCalculator] API Error:', err);
      setError(err.response?.data?.message || 'Faiz hesaplanamadı');
    } finally {
      setLoading(false);
    }
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
    setError(null);
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
              <option value="LEGAL_3095">Yasal Faiz (3095)</option>
              <option value="COMMERCIAL_AVANS_3095_2_2">Ticari Faiz (Avans)</option>
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

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={calculateInterest}
            disabled={!principal || !startDate || !endDate || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <TrendingUp className="h-4 w-4" />
            )}
            {loading ? 'Hesaplanıyor...' : 'Hesapla'}
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
                    <td className="px-4 py-2 text-right">{period.rate.toFixed(2)}</td>
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
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Faiz Hesaplama Bilgisi</p>
            <p className="mt-1 text-blue-700">
              Tüm faiz hesaplamaları backend interest-engine tarafından yapılmaktadır.
              Güncel TCMB oranları otomatik olarak uygulanır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
