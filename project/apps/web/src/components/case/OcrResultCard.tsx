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
  ChevronUp,
  FileText,
  Target,
  Brain,
} from "lucide-react";

interface ClassificationResult {
  detectedType: string;
  detectedSubCategory: string | null;
  confidence: number;
  matchedKeywords: string[];
  suggestedFormCode: string | null;
  explanation: string;
}

interface OcrResultCardProps {
  result: ClassificationResult;
  onAccept: () => void;
  onReject: () => void;
}

const typeLabels: Record<string, { label: string; color: string; icon: string; description: string }> = {
  ILAMLI: { 
    label: "İlamlı Takip", 
    color: "blue", 
    icon: "⚖️",
    description: "Mahkeme kararına dayalı icra takibi"
  },
  ILAMSIZ: { 
    label: "İlamsız Takip", 
    color: "gray", 
    icon: "📋",
    description: "Mahkeme kararı olmadan başlatılan takip"
  },
  KAMBIYO: { 
    label: "Kambiyo Takibi", 
    color: "green", 
    icon: "📜",
    description: "Bono, çek veya poliçeye dayalı takip"
  },
  KIRA: { 
    label: "Kira Takibi", 
    color: "purple", 
    icon: "🏠",
    description: "Kira alacağı veya tahliye takibi"
  },
  IPOTEK: { 
    label: "İpotek Takibi", 
    color: "orange", 
    icon: "🏦",
    description: "İpoteğin paraya çevrilmesi yoluyla takip"
  },
  REHIN: { 
    label: "Rehin Takibi", 
    color: "red", 
    icon: "🔐",
    description: "Rehnin paraya çevrilmesi yoluyla takip"
  },
  UNKNOWN: { 
    label: "Belirsiz", 
    color: "gray", 
    icon: "❓",
    description: "Belge türü otomatik belirlenemedi"
  },
};

const subCategoryLabels: Record<string, { label: string; icon: string }> = {
  GENEL: { label: "Genel Alacak", icon: "💼" },
  NAFAKA: { label: "Nafaka Alacağı", icon: "📅" },
  DOVIZ: { label: "Döviz Alacağı", icon: "💱" },
  KIRA: { label: "Kira Alacağı", icon: "🏠" },
};

export function OcrResultCard({ result, onAccept, onReject }: OcrResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const typeInfo = typeLabels[result.detectedType] || typeLabels.UNKNOWN;
  const subCategoryInfo = result.detectedSubCategory 
    ? subCategoryLabels[result.detectedSubCategory] 
    : null;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 70) return "text-green-600 bg-green-100";
    if (confidence >= 40) return "text-yellow-600 bg-yellow-100";
    return "text-red-600 bg-red-100";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 70) return "Yüksek Güven";
    if (confidence >= 40) return "Orta Güven";
    return "Düşük Güven";
  };

  return (
    <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border-2 border-emerald-200 p-6 mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-emerald-500 rounded-lg">
          <Brain className="h-6 w-6 text-white" />
        </div>
        <div>
          <h2 className="font-semibold text-lg">🔍 Belge Analiz Sonucu</h2>
          <p className="text-sm text-muted-foreground">
            Sistem belgenizi analiz etti ve takip türünü belirledi
          </p>
        </div>
      </div>

      {/* Main Result Card */}
      <div className="bg-white rounded-xl p-5 mb-4 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-4xl">{typeInfo.icon}</span>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
                Tespit Edilen Takip Türü
              </div>
              <div className="text-xl font-bold text-emerald-700">
                {typeInfo.label}
              </div>
              {subCategoryInfo && (
                <div className="flex items-center gap-1 mt-1">
                  <span>{subCategoryInfo.icon}</span>
                  <span className="text-sm text-muted-foreground">
                    {subCategoryInfo.label}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Confidence Badge */}
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${getConfidenceColor(result.confidence)}`}>
            <Target className="h-3 w-3 inline mr-1" />
            %{result.confidence} - {getConfidenceLabel(result.confidence)}
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-4">{typeInfo.description}</p>

        {/* Confidence Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Güven Skoru</span>
            <span>%{result.confidence}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                result.confidence >= 70 ? "bg-green-500" :
                result.confidence >= 40 ? "bg-yellow-500" : "bg-red-500"
              }`}
              style={{ width: `${result.confidence}%` }}
            />
          </div>
        </div>

        {/* Matched Keywords */}
        {result.matchedKeywords.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2">Eşleşen Anahtar Kelimeler:</div>
            <div className="flex flex-wrap gap-1">
              {result.matchedKeywords.map((keyword, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full"
                >
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Explanation */}
      <div className="bg-white/70 rounded-lg p-4 mb-4">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-sm mb-1">Açıklama</h4>
            <p className="text-sm text-muted-foreground">{result.explanation}</p>
          </div>
        </div>
      </div>

      {/* Expandable Details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between p-3 bg-white/50 rounded-lg mb-4 hover:bg-white/70 transition-colors"
      >
        <span className="text-sm font-medium">Detaylı Bilgi</span>
        {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {showDetails && (
        <div className="space-y-4 mb-4">
          {/* Suggested Form */}
          {result.suggestedFormCode && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <h4 className="font-medium text-sm text-blue-900">Önerilen Form</h4>
              </div>
              <p className="text-sm text-blue-800">{result.suggestedFormCode}</p>
            </div>
          )}

          {/* What Happens Next */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-purple-600" />
              <h4 className="font-medium text-sm text-purple-900">Kabul Ettiğinizde</h4>
            </div>
            <ul className="text-xs text-purple-800 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-purple-500">✓</span>
                Takip türü otomatik ayarlanacak
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500">✓</span>
                İlgili form şablonları hazırlanacak
              </li>
              {result.detectedSubCategory === "NAFAKA" && (
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">✓</span>
                  Nafaka hesaplama otomasyonu aktif olacak
                </li>
              )}
              {result.detectedSubCategory === "DOVIZ" && (
                <li className="flex items-start gap-2">
                  <span className="text-purple-500">✓</span>
                  Döviz kuru takibi aktif olacak
                </li>
              )}
            </ul>
          </div>

          {/* Low Confidence Warning */}
          {result.confidence < 50 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <h4 className="font-medium text-sm text-amber-900">Düşük Güven Uyarısı</h4>
              </div>
              <p className="text-xs text-amber-800">
                Belge analizi düşük güven skoruyla tamamlandı. Lütfen takip türünü manuel olarak doğrulayın.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onAccept}
          className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-emerald-700 transition-colors"
        >
          <CheckCircle className="h-4 w-4" />
          Kabul Et ve Devam Et
        </button>
        <button
          onClick={onReject}
          className="px-4 py-3 border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Değiştir
        </button>
      </div>
    </div>
  );
}
