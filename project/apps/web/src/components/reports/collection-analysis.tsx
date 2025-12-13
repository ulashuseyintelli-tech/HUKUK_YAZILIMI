"use client";

import { useState } from "react";
import { BarChart3, TrendingUp, TrendingDown, Calendar, Download } from "lucide-react";

interface PeriodData {
  period: string;
  target: number;
  actual: number;
  caseCount: number;
}

const mockData: PeriodData[] = [
  { period: "Ocak 2025", target: 500000, actual: 480000, caseCount: 45 },
  { period: "Şubat 2025", target: 500000, actual: 520000, caseCount: 52 },
  { period: "Mart 2025", target: 550000, actual: 490000, caseCount: 48 },
  { period: "Nisan 2025", target: 550000, actual: 610000, caseCount: 58 },
  { period: "Mayıs 2025", target: 600000, actual: 580000, caseCount: 55 },
  { period: "Haziran 2025", target: 600000, actual: 650000, caseCount: 62 },
];

export function CollectionAnalysisReport() {
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");

  const totalTarget = mockData.reduce((sum, d) => sum + d.target, 0);
  const totalActual = mockData.reduce((sum, d) => sum + d.actual, 0);
  const totalCases = mockData.reduce((sum, d) => sum + d.caseCount, 0);
  const overallRate = Math.round((totalActual / totalTarget) * 100);

  const maxValue = Math.max(...mockData.flatMap((d) => [d.target, d.actual]));

  const currentPeriod = mockData[mockData.length - 1];
  const prevPeriod = mockData[mockData.length - 2];
  const growth = prevPeriod ? Math.round(((currentPeriod.actual - prevPeriod.actual) / prevPeriod.actual) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <BarChart3 className="w-5 h-5" /> Tahsilat Analiz Raporu
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="text-sm border rounded-lg px-2 py-1"
          >
            <option value="monthly">Aylık</option>
            <option value="quarterly">Çeyreklik</option>
            <option value="yearly">Yıllık</option>
          </select>
          <button className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <Download className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-blue-600">{(totalTarget / 1000000).toFixed(1)}M ₺</div>
          <div className="text-xs text-gray-500">Toplam Hedef</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-green-600">{(totalActual / 1000000).toFixed(1)}M ₺</div>
          <div className="text-xs text-gray-500">Toplam Tahsilat</div>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
          <div className="text-xl font-bold text-purple-600">%{overallRate}</div>
          <div className="text-xs text-gray-500">Başarı Oranı</div>
        </div>
        <div className={`rounded-lg p-3 text-center ${growth >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
          <div className={`text-xl font-bold flex items-center justify-center gap-1 ${growth >= 0 ? "text-green-600" : "text-red-600"}`}>
            {growth >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
            {growth >= 0 ? "+" : ""}{growth}%
          </div>
          <div className="text-xs text-gray-500">Büyüme</div>
        </div>
      </div>

      <div className="mb-4">
        <h4 className="text-sm font-medium mb-3">Dönem Karşılaştırması</h4>
        <div className="space-y-3">
          {mockData.map((data, idx) => {
            const rate = Math.round((data.actual / data.target) * 100);
            return (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-24 text-sm text-gray-500">{data.period}</div>
                <div className="flex-1">
                  <div className="flex gap-1 h-6">
                    <div
                      className="bg-blue-200 dark:bg-blue-800 rounded-l"
                      style={{ width: `${(data.target / maxValue) * 100}%` }}
                      title={`Hedef: ${data.target.toLocaleString("tr-TR")} ₺`}
                    />
                  </div>
                  <div className="flex gap-1 h-6 -mt-5">
                    <div
                      className={`rounded-l ${rate >= 100 ? "bg-green-500" : "bg-orange-500"}`}
                      style={{ width: `${(data.actual / maxValue) * 100}%`, opacity: 0.8 }}
                      title={`Gerçekleşen: ${data.actual.toLocaleString("tr-TR")} ₺`}
                    />
                  </div>
                </div>
                <div className="w-16 text-right">
                  <span className={`text-sm font-medium ${rate >= 100 ? "text-green-600" : "text-orange-600"}`}>
                    %{rate}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-blue-200 rounded" /> Hedef</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" /> Gerçekleşen (≥100%)</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded" /> Gerçekleşen (&lt;100%)</span>
        </div>
      </div>

      <div className="border-t pt-4">
        <h4 className="text-sm font-medium mb-2">Trend Analizi</h4>
        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
          <p>• Son 6 ayda toplam {totalCases} dosyadan tahsilat yapıldı</p>
          <p>• Ortalama aylık tahsilat: {Math.round(totalActual / mockData.length).toLocaleString("tr-TR")} ₺</p>
          <p>• En yüksek performans: {mockData.reduce((max, d) => d.actual > max.actual ? d : max).period}</p>
          <p>• Genel trend: {growth >= 0 ? "Yükseliş" : "Düşüş"} eğiliminde</p>
        </div>
      </div>
    </div>
  );
}
