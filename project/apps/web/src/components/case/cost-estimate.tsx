"use client";

import { useState } from "react";
import { Calculator, TrendingUp, AlertCircle, Sparkles, RefreshCw } from "lucide-react";

interface CostCategory {
  category: string;
  estimated: number;
  confidence: number;
}

interface CostEstimateResult {
  totalEstimate: number;
  confidenceLevel: "HIGH" | "MEDIUM" | "LOW";
  categories: CostCategory[];
  factors: string[];
  recommendations: string[];
}

const mockEstimate: CostEstimateResult = {
  totalEstimate: 12500,
  confidenceLevel: "MEDIUM",
  categories: [
    { category: "Harç ve Masraflar", estimated: 3500, confidence: 85 },
    { category: "Posta ve Tebligat", estimated: 800, confidence: 90 },
    { category: "Bilirkişi Ücreti", estimated: 4000, confidence: 60 },
    { category: "Keşif Masrafı", estimated: 2500, confidence: 55 },
    { category: "Diğer Masraflar", estimated: 1700, confidence: 70 },
  ],
  factors: [
    "Dosya türü: İlamlı İcra",
    "Tahmini süre: 6-8 ay",
    "Borçlu sayısı: 2",
    "Benzer dosya ortalaması",
  ],
  recommendations: [
    "Bilirkişi masrafı için ön ödeme talep edilebilir",
    "Tebligat masraflarını minimize etmek için e-tebligat tercih edilebilir",
    "Keşif gerekirse toplu keşif planlanabilir",
  ],
};

const confidenceColors = {
  HIGH: { bg: "bg-green-100", text: "text-green-700", label: "Yüksek" },
  MEDIUM: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Orta" },
  LOW: { bg: "bg-red-100", text: "text-red-700", label: "Düşük" },
};

interface CaseCostEstimateProps {
  caseId?: string;
}

export function CaseCostEstimate({ caseId }: CaseCostEstimateProps) {
  const [estimate, setEstimate] = useState<CostEstimateResult | null>(null);
  const [loading, setLoading] = useState(false);

  const generateEstimate = () => {
    setLoading(true);
    setTimeout(() => {
      setEstimate(mockEstimate);
      setLoading(false);
    }, 1500);
  };

  if (!estimate) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border p-6 text-center">
        <Sparkles className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h3 className="font-semibold mb-2">AI Maliyet Tahmini</h3>
        <p className="text-sm text-gray-500 mb-4">
          Yapay zeka ile dosya maliyetlerini tahmin edin
        </p>
        <button
          onClick={generateEstimate}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 mx-auto disabled:opacity-50"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Hesaplanıyor...
            </>
          ) : (
            <>
              <Calculator className="w-4 h-4" /> Tahmin Oluştur
            </>
          )}
        </button>
      </div>
    );
  }

  const conf = confidenceColors[estimate.confidenceLevel];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Calculator className="w-5 h-5" /> Maliyet Tahmini
        </h3>
        <button
          onClick={generateEstimate}
          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-4 mb-4">
        <div className="text-sm opacity-80">Tahmini Toplam Maliyet</div>
        <div className="text-3xl font-bold">{estimate.totalEstimate.toLocaleString("tr-TR")} ₺</div>
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs px-2 py-0.5 rounded ${conf.bg} ${conf.text}`}>
            Güven: {conf.label}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <h4 className="text-sm font-medium">Kategori Bazlı Tahmin</h4>
        {estimate.categories.map((cat, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex justify-between text-sm mb-1">
                <span>{cat.category}</span>
                <span className="font-medium">{cat.estimated.toLocaleString("tr-TR")} ₺</span>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{ width: `${cat.confidence}%` }}
                />
              </div>
            </div>
            <span className="text-xs text-gray-500 w-10">%{cat.confidence}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Etki Faktörleri
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            {estimate.factors.map((f, idx) => (
              <li key={idx}>• {f}</li>
            ))}
          </ul>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" /> Öneriler
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
            {estimate.recommendations.map((r, idx) => (
              <li key={idx}>• {r}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        * Bu tahmin AI tarafından benzer dosyalar analiz edilerek oluşturulmuştur.
      </div>
    </div>
  );
}
