"use client";

import { DebtorsSummaryDTO } from "@/lib/api";
import { Users, AlertTriangle, Loader2 } from "lucide-react";

interface DebtorsSummaryBarProps {
  summary: DebtorsSummaryDTO;
  isLoading?: boolean;
}

/**
 * Simplified summary bar - shows only essential info
 * "Borçlu 3 • Riskli 1" format instead of detailed breakdown
 */
export function DebtorsSummaryBar({ summary, isLoading }: DebtorsSummaryBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Loader2 className="w-3 h-3 animate-spin" />
        <span>Yükleniyor...</span>
      </div>
    );
  }

  // Calculate action needed count (NOT_STARTED + RETURNED + FAILED)
  const actionNeeded = summary.pending + summary.returned;

  return (
    <div className="flex items-center gap-3 text-[10px]">
      {/* Total debtors */}
      <div className="flex items-center gap-1 text-slate-600">
        <Users className="w-3 h-3" />
        <span className="font-medium">{summary.total}</span>
        <span>Borçlu</span>
      </div>

      {/* Action needed - only show if > 0 */}
      {actionNeeded > 0 && (
        <>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1 text-amber-600">
            <span className="font-medium">{actionNeeded}</span>
            <span>İşlem Bekliyor</span>
          </div>
        </>
      )}

      {/* Danger count - only show if > 0 */}
      {summary.danger > 0 && (
        <>
          <span className="text-slate-300">•</span>
          <div className="flex items-center gap-1 text-red-600">
            <AlertTriangle className="w-3 h-3" />
            <span className="font-medium">{summary.danger}</span>
            <span>Riskli</span>
          </div>
        </>
      )}

      {/* All good message */}
      {actionNeeded === 0 && summary.danger === 0 && summary.total > 0 && (
        <>
          <span className="text-slate-300">•</span>
          <span className="text-emerald-600">✓ Tümü tebliğ edildi</span>
        </>
      )}
    </div>
  );
}
