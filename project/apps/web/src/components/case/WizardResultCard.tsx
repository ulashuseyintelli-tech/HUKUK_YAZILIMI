"use client";

import { useState } from "react";
import { 
  CheckCircle, 
  Sparkles, 
  ArrowRight, 
  RotateCcw, 
  Lightbulb, 
  AlertTriangle, 
  Zap,
  Scale,
  ChevronDown,
  ChevronUp
} from "lucide-react";

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

const subCategoryLabels: Record<string, { label: string; color: string; icon: string }> = {
  GENEL: { label: "İlamlı Genel", color: "blue", icon: "💼" },
  NAFAKA: { label: "İlamlı Nafaka", color: "purple", icon: "📅" },
  DOVIZ: { label: "İlamlı Döviz", color: "green", icon: "💱" },
};

export function WizardResultCard({ result, onAccept, onRestart }: WizardResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const categoryInfo = subCategoryLabels[result.subCategory];

  return (
    <div className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border-2 border-primary/20 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary rounded-lg">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">🧠 Akıllı Sihirbaz Önerisi</h2>
          <p className="text-sm text-muted-foreground">
            Cevaplarınıza göre en uygun takip türü belirlendi
          </p>
        </div>
      </div>

      {/* Recommendation Card */}
      <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-3xl">{categoryInfo.icon}</span>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              Önerilen Takip Türü
            </div>
            <div className="text-xl font-bold text-primary">
              {result.recommendation}
            </div>
          </div>
        </div>

        <p className="text-muted-foreground text-sm mb-4">{result.explanation}</p>

        {/* Details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-muted-foreground text-xs mb-1">Alt Kategori</div>
            <div className="font-medium">{categoryInfo.label}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-muted-foreground text-xs mb-1">Para Birimi</div>
            <div className="font-medium">{result.currency}</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 col-span-2">
            <div className="text-muted-foreground text-xs mb-1">Faiz Açıklaması</div>
            <div className="font-medium text-xs">{result.interestDescription}</div>
          </div>
        </div>
      </div>

      {/* Legal Basis */}
      {result.legalBasis && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <Scale className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-medium text-sm text-blue-900 mb-1">Hukuki Dayanak</h4>
              <p className="text-xs text-blue-800">{result.legalBasis}</p>
            </div>
          </div>
        </div>
      )}

      {/* Expandable Details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between p-3 bg-white/50 rounded-lg mb-4 hover:bg-white/70 transition-colors"
      >
        <span className="text-sm font-medium">Detaylı Bilgi ve İpuçları</span>
        {showDetails ? (
          <ChevronUp className="h-4 w-4" />
        ) : (
          <ChevronDown className="h-4 w-4" />
        )}
      </button>

      {showDetails && (
        <div className="space-y-4 mb-4">
          {/* Tips */}
          {result.tips && result.tips.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-green-600" />
                <h4 className="font-medium text-sm text-green-900">İpuçları</h4>
              </div>
              <ul className="text-xs text-green-800 space-y-1">
                {result.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-green-500">•</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {result.warnings && result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h4 className="font-medium text-sm text-amber-900">Dikkat Edilmesi Gerekenler</h4>
              </div>
              <ul className="text-xs text-amber-800 space-y-1">
                {result.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500">•</span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Automation Features */}
          {result.automationFeatures && result.automationFeatures.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-purple-600" />
                <h4 className="font-medium text-sm text-purple-900">Otomasyon Özellikleri</h4>
              </div>
              <ul className="text-xs text-purple-800 space-y-1">
                {result.automationFeatures.map((feature, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-purple-500">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      <div className="bg-white/50 rounded-lg p-4 mb-4">
        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          Sizin için hazırladıklarımız:
        </h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• İlam tipi: {categoryInfo.label}</li>
          <li>• Para birimi: {result.currency}</li>
          <li>
            • Faiz tipi:{" "}
            {result.interestRateType === "DEGISKEN" ? "Değişken oranlı" : "Sabit oranlı"}
          </li>
          <li>• Takip talebi şablonu otomatik üretilecek</li>
          {result.subCategory === "NAFAKA" && (
            <li>• Aylık nafaka otomasyonu aktif olacak</li>
          )}
          {result.subCategory === "DOVIZ" && (
            <li>• Kur hesaplaması fiili ödeme tarihine göre yapılacak</li>
          )}
        </ul>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onAccept}
          className="flex-1 py-3 bg-primary text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors"
        >
          Bu Öneriyi Kabul Et
          <ArrowRight className="h-4 w-4" />
        </button>
        <button
          onClick={onRestart}
          className="px-4 py-3 border rounded-lg hover:bg-gray-50 transition-colors"
          title="Sihirbazı yeniden başlat"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
