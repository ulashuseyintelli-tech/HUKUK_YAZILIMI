"use client";

import { AlertTriangle, TrendingUp } from "lucide-react";

interface MiniFinanceWidgetProps {
  principalAmount?: number;
  collectedAmount?: number;
  expenseAmount?: number;
  currency?: string;
  onClick?: () => void;
}

function formatCurrency(amount: number, currency: string = "TRY"): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function MiniFinanceWidget({
  principalAmount = 0,
  collectedAmount = 0,
  expenseAmount = 0,
  currency = "TRY",
  onClick,
}: MiniFinanceWidgetProps) {
  const hasOpenBalance = principalAmount > collectedAmount;
  const openBalance = principalAmount - collectedAmount;

  return (
    <button
      onClick={onClick}
      className="bg-slate-50 hover:bg-slate-100 rounded-lg p-2.5 text-left transition-colors min-w-[200px]"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
          Hesap Özeti
        </span>
        <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
      </div>
      
      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between">
          <span className="text-slate-500">Asıl:</span>
          <span className="font-medium text-slate-700">{formatCurrency(principalAmount, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Tahsil:</span>
          <span className="font-medium text-emerald-600">{formatCurrency(collectedAmount, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Masraf:</span>
          <span className="font-medium text-slate-700">{formatCurrency(expenseAmount, currency)}</span>
        </div>
      </div>

      {hasOpenBalance && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-200 flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="w-3 h-3" />
          <span className="font-medium">Açık: {formatCurrency(openBalance, currency)}</span>
        </div>
      )}
    </button>
  );
}
