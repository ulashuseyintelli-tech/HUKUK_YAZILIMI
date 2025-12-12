"use client";

import { useState } from "react";
import { CheckCircle, Sparkles, ArrowRight, RotateCcw, Scale, ChevronDown, ChevronUp } from "lucide-react";

interface WizardResult {
  subCategory: "GENEL" | "NAFAKA" | "DOVIZ";
  currency: string;
  interestRateType: string;
  interestDescription: string;
  recommendation: string;
  explanation: string;
  legalBasis?: string;
  tips?: string[];
  warnings?: string[];
  automationFeatures?: string[];
}

interface WizardResultCardProps {
  result: WizardResult;
  onAccept: () => void;
  onRestart: () => void;
}

const subCategoryLabels: Record<string, { label: string; icon: string }> = {
  GENEL: { label: "İlamlı Genel", icon: "💼" },
  NAFAKA: { label: "İlamlı Nafaka", icon: "📅" },
  DOVIZ: { label: "İlamlı Döviz", icon: "💱" },
};

export function WizardResultCard({ result, onAccept, onRestart }: WizardResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const categoryInfo = subCategoryLabels[result.subCategory];

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20 p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 bg-primary rounded-lg">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-sm">🧠 Akıllı Sihirbaz Önerisi</h2>
          <p className="text-xs text-muted-foreground">Cevaplarınıza göre en uygun takip türü belirlendi</p>
        </div>
      </div>

      <div className="bg-white rounded-lg p-3 mb-3 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">{categoryInfo.icon}</span>
          <div>
            <div className="text-[10px] text-muted-foreground uppercase">ÖNERİLEN TAKİP TÜRÜ</div>
            <div className="text-base font-bold text-primary">{result.recommendation}</div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-2">{result.explanation}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-gray-50 rounded p-2">
            <div className="text-[10px] text-muted-foreground">Alt Kategori</div>
            <div className="font-medium">{categoryInfo.label}</div>
          </div>
          <div className="bg-gray-50 rounded p-2">
            <div className="text-[10px] text-muted-foreground">Para Birimi</div>
            <div className="font-medium">{result.currency}</div>
          </div>
        </div>
      </div>

      {result.legalBasis && (
        <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-3 flex items-start gap-2">
          <Scale className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-xs text-blue-900">Hukuki Dayanak</h4>
            <p className="text-[10px] text-blue-800">{result.legalBasis}</p>
          </div>
        </div>
      )}

      <button onClick={() => setShowDetails(!showDetails)} className="w-full flex items-center justify-between p-2 bg-white/50 rounded mb-3 hover:bg-white/70 transition-colors text-xs">
        <span className="font-medium">Detaylı Bilgi ve İpuçları</span>
        {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {showDetails && (
        <div className="bg-white/50 rounded p-2 mb-3 text-xs">
          <h4 className="font-medium mb-1 flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" /> Sizin için hazırladıklarımız:
          </h4>
          <ul className="text-[11px] text-muted-foreground space-y-0.5">
            <li>• İlam tipi: {categoryInfo.label}</li>
            <li>• Para birimi: {result.currency}</li>
            <li>• Faiz tipi: {result.interestRateType === "DEGISKEN" ? "Değişken oranlı" : "Sabit oranlı"}</li>
            <li>• Takip talebi şablonu otomatik üretilecek</li>
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={onAccept} className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1 hover:bg-primary/90">
          Bu Öneriyi Kabul Et <ArrowRight className="h-3 w-3" />
        </button>
        <button onClick={onRestart} className="px-3 py-2 border rounded-lg hover:bg-gray-50" title="Yeniden başlat">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
