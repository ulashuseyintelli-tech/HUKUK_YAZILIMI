"use client";

import { ArrowLeft, Clock, AlertTriangle } from "lucide-react";
import Link from "next/link";

interface CaseHeaderProps {
  fileNumber: string;
  executionFileNumber?: string;
  caseStatus: string;
  type: string;
  subType?: string;
  executionOffice?: {
    name: string;
    city: string;
    uyapCode?: string;
  };
  uyapBirimKodu?: string;
  lastEnforcementActionAt?: string;
  caseDate: string;
}

// Status badge colors
const statusColors: Record<string, string> = {
  DERDEST: "bg-emerald-100 text-emerald-700",
  KAPALI: "bg-slate-100 text-slate-600",
  BEKLEMEDE: "bg-amber-100 text-amber-700",
  IPTAL: "bg-red-100 text-red-600",
};

// Calculate days since last action and remaining days (İİK 78)
function calculateDays(lastActionDate?: string, caseDate?: string) {
  const baseDate = lastActionDate || caseDate;
  if (!baseDate) return { daysSince: 0, remaining: 365 };
  
  const lastAction = new Date(baseDate);
  const now = new Date();
  const diffTime = now.getTime() - lastAction.getTime();
  const daysSince = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const remaining = Math.max(0, 365 - daysSince);
  
  return { daysSince, remaining };
}

export function CaseHeader({
  fileNumber,
  executionFileNumber,
  caseStatus,
  type,
  subType,
  executionOffice,
  uyapBirimKodu,
  lastEnforcementActionAt,
  caseDate,
}: CaseHeaderProps) {
  const { daysSince, remaining } = calculateDays(lastEnforcementActionAt, caseDate);
  const isUyapConnected = !!uyapBirimKodu;
  const isRiskZone = remaining < 30;

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2">
      {/* Single Row Header */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: Back + Case Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Link 
            href="/cases" 
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
          </Link>
          
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-slate-900">
              Takip: {fileNumber}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${statusColors[caseStatus] || statusColors.DERDEST}`}>
              {caseStatus}
            </span>
            <span className="text-sm text-slate-600">
              {type} {subType ? `• ${subType}` : ""}
            </span>
          </div>
        </div>

        {/* Center: Execution Info */}
        <div className="hidden md:flex items-center gap-4 text-xs text-slate-500">
          {executionFileNumber && (
            <span>Dosya: {executionFileNumber}</span>
          )}
          {executionOffice && (
            <span>{executionOffice.name}</span>
          )}
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${isUyapConnected ? "bg-emerald-500" : "bg-slate-300"}`} />
            <span>UYAP: {isUyapConnected ? "Bağlı" : "Bağlı Değil"}</span>
          </div>
        </div>

        {/* Right: Time Info */}
        <div className="flex items-center gap-4 text-xs flex-shrink-0">
          <div className="flex items-center gap-1 text-slate-500">
            <Clock className="w-3.5 h-3.5" />
            <span>Son İşlem: {daysSince} gün</span>
          </div>
          <div className={`flex items-center gap-1 ${isRiskZone ? "text-red-600 font-medium" : "text-slate-500"}`}>
            {isRiskZone && <AlertTriangle className="w-3.5 h-3.5" />}
            <span>Kalan: {remaining} gün</span>
          </div>
        </div>
      </div>
    </div>
  );
}
