"use client";

import { AlertTriangle, Zap, FileWarning, Activity } from "lucide-react";
import { Badge } from "@hukuk/ui";

interface CaseSummaryCardProps {
  fileNumber: string;
  formType?: string;
  executionPath?: string;
  caseStatus: string;
  isAutomationEnabled: boolean;
  hasUyapWarning: boolean;
  uyapCode?: string;
  riskScore?: number;
  lastAction?: string;
  nextAutoAction?: string;
  onFindUyapCode?: () => void;
}

const statusLabels: Record<string, string> = {
  DERDEST: "Derdest",
  ISLEMDE: "İşlemde",
  DERKENAR: "Derkenar",
  HITAM: "Hitam",
  INFAZ: "İnfaz",
  MUVEKKILE_IADE: "Müvekkile İade",
  ACIZ: "Aciz",
  BATAK: "Batak",
  MAHSUP: "Mahsup",
  TEMLIK: "Temlik",
};

const executionPathLabels: Record<string, string> = {
  HACIZ: "Haciz Yolu",
  IFLAS: "İflas Yolu",
  REHIN: "Rehin Paraya Çevirme",
  IPOTEK: "İpotek Paraya Çevirme",
  TAHLIYE: "Tahliye",
};

export function CaseSummaryCard({
  fileNumber,
  formType,
  executionPath,
  caseStatus,
  isAutomationEnabled,
  hasUyapWarning,
  uyapCode,
  riskScore = 0,
  lastAction,
  nextAutoAction,
  onFindUyapCode,
}: CaseSummaryCardProps) {
  const getRiskColor = (score: number) => {
    if (score < 30) return "text-green-600 bg-green-100";
    if (score < 60) return "text-yellow-600 bg-yellow-100";
    if (score < 80) return "text-orange-600 bg-orange-100";
    return "text-red-600 bg-red-100";
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* UYAP Uyarı Bandı (E.27) */}
      {hasUyapWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-1.5 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center gap-1.5 text-amber-700">
            <FileWarning className="h-3 w-3" />
            <span className="text-xs font-medium">UYAP kodu eksik!</span>
          </div>
          {onFindUyapCode && (
            <button
              onClick={onFindUyapCode}
              className="text-xs text-amber-700 hover:text-amber-900 underline"
            >
              Daire Kodunu Bul
            </button>
          )}
        </div>
      )}

      <div className="p-3 sm:p-4">
        {/* Başlık ve Statü */}
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base sm:text-lg font-bold truncate">{fileNumber}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {formType || "Form seçilmedi"} • {executionPathLabels[executionPath || "HACIZ"]}
            </p>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 ml-2">
            <Badge variant={isAutomationEnabled ? "success" : "default"} className="text-xs px-1.5 py-0.5">
              <Zap className="h-3 w-3 mr-0.5" />
              <span className="hidden sm:inline">{isAutomationEnabled ? "Otomasyon Açık" : "Otomasyon Kapalı"}</span>
              <span className="sm:hidden">{isAutomationEnabled ? "Açık" : "Kapalı"}</span>
            </Badge>
            <Badge variant={caseStatus === "DERDEST" || caseStatus === "ISLEMDE" ? "success" : "default"} className="text-xs px-1.5 py-0.5">
              {statusLabels[caseStatus] || caseStatus}
            </Badge>
          </div>
        </div>

        {/* Özet Bilgiler */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {/* UYAP Durumu */}
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">UYAP Durumu</p>
            <p className={`text-xs sm:text-sm font-medium truncate ${uyapCode ? "text-green-600" : "text-amber-600"}`}>
              {uyapCode ? `Kod: ${uyapCode}` : "Kod Yok"}
            </p>
          </div>

          {/* Risk Skoru */}
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Tahsilat Riski</p>
            <span className={`text-xs sm:text-sm font-bold px-1.5 py-0.5 rounded ${getRiskColor(riskScore)}`}>
              %{riskScore}
            </span>
          </div>

          {/* Son İşlem */}
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Son İşlem</p>
            <p className="text-xs sm:text-sm font-medium truncate">{lastAction || "-"}</p>
          </div>

          {/* Sıradaki İşlem */}
          <div className="p-2 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground">Sıradaki İşlem</p>
            <p className="text-xs sm:text-sm font-medium truncate">{nextAutoAction || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
