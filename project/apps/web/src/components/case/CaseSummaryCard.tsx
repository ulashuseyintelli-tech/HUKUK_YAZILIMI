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
    <div className="bg-white rounded-xl border shadow-sm">
      {/* UYAP Uyarı Bandı (E.27) */}
      {hasUyapWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-2 text-amber-700">
            <FileWarning className="h-4 w-4" />
            <span className="text-sm font-medium">UYAP kodu eksik!</span>
          </div>
          {onFindUyapCode && (
            <button
              onClick={onFindUyapCode}
              className="text-sm text-amber-700 hover:text-amber-900 underline"
            >
              Daire Kodunu Bul
            </button>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Başlık ve Statü */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">{fileNumber}</h2>
            <p className="text-sm text-muted-foreground">
              {formType || "Form seçilmedi"} • {executionPathLabels[executionPath || "HACIZ"]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isAutomationEnabled ? "success" : "default"}>
              <Zap className="h-3 w-3 mr-1" />
              {isAutomationEnabled ? "Otomasyon Açık" : "Otomasyon Kapalı"}
            </Badge>
            <Badge variant={caseStatus === "DERDEST" || caseStatus === "ISLEMDE" ? "success" : "default"}>
              {statusLabels[caseStatus] || caseStatus}
            </Badge>
          </div>
        </div>

        {/* Özet Bilgiler */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* UYAP Durumu */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">UYAP Durumu</p>
            <p className={`text-sm font-medium ${uyapCode ? "text-green-600" : "text-amber-600"}`}>
              {uyapCode ? `Kod: ${uyapCode}` : "Kod Yok"}
            </p>
          </div>

          {/* Risk Skoru */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Tahsilat Riski</p>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${getRiskColor(riskScore)}`}>
                %{riskScore}
              </span>
            </div>
          </div>

          {/* Son İşlem */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Son İşlem</p>
            <p className="text-sm font-medium truncate">{lastAction || "-"}</p>
          </div>

          {/* Sıradaki İşlem */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Sıradaki İşlem</p>
            <p className="text-sm font-medium truncate">{nextAutoAction || "-"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
