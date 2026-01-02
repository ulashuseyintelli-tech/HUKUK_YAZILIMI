"use client";

import { useState, useEffect } from "react";
import { Wallet, TrendingUp, TrendingDown, AlertTriangle, RefreshCw, Plus } from "lucide-react";
import { api } from "@/lib/api";

interface BalanceWidgetProps {
  caseId: string;
  onCreateExpenseRequest?: () => void;
  compact?: boolean;
}

interface BalanceData {
  id: string;
  caseId: string;
  balance: number;
  lowThreshold: number;
  isLow: boolean;
  recentLedger: Array<{
    id: string;
    type: "CREDIT" | "DEBIT" | "ADJUST" | "REFUND";
    amount: number;
    description: string;
    createdAt: string;
  }>;
}

export function BalanceWidget({ caseId, onCreateExpenseRequest, compact = false }: BalanceWidgetProps) {
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBalance = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCaseBalance(caseId);
      setBalance(data);
    } catch (err: any) {
      // Bakiye henüz oluşturulmamış olabilir
      setBalance({
        id: "",
        caseId,
        balance: 0,
        lowThreshold: 500,
        isLow: true,
        recentLedger: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalance();
  }, [caseId]);

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${compact ? "p-3" : ""}`}>
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
            <div className="h-6 bg-gray-200 rounded w-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!balance) return null;

  const isPositive = balance.balance > 0;
  const isLow = balance.isLow;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
          isLow
            ? "bg-amber-50 border-amber-200 text-amber-800"
            : "bg-green-50 border-green-200 text-green-800"
        }`}
      >
        <Wallet className="h-4 w-4" />
        <span className="text-sm font-medium">
          {balance.balance.toLocaleString("tr-TR")} ₺
        </span>
        {isLow && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`p-2 rounded-lg ${
              isLow ? "bg-amber-100" : "bg-green-100"
            }`}
          >
            <Wallet
              className={`h-5 w-5 ${
                isLow ? "text-amber-600" : "text-green-600"
              }`}
            />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Masraf Bakiyesi</h3>
            {isLow && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Bakiye düşük
              </p>
            )}
          </div>
        </div>
        <button
          onClick={loadBalance}
          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600"
          title="Yenile"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Balance */}
      <div className="px-4 py-4">
        <div
          className={`text-3xl font-bold ${
            isPositive ? "text-green-600" : isLow ? "text-amber-600" : "text-gray-900"
          }`}
        >
          {balance.balance.toLocaleString("tr-TR")} ₺
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Eşik: {balance.lowThreshold.toLocaleString("tr-TR")} ₺
        </p>
      </div>

      {/* Recent Ledger */}
      {balance.recentLedger.length > 0 && (
        <div className="px-4 pb-3">
          <p className="text-xs font-medium text-gray-500 mb-2">Son Hareketler</p>
          <div className="space-y-1.5">
            {balance.recentLedger.slice(0, 3).map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  {entry.type === "CREDIT" ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                  )}
                  <span className="text-gray-600 truncate max-w-[150px]">
                    {entry.description || entry.type}
                  </span>
                </div>
                <span
                  className={`font-medium ${
                    entry.type === "CREDIT" ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {entry.type === "CREDIT" ? "+" : ""}
                  {entry.amount.toLocaleString("tr-TR")} ₺
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action */}
      {isLow && onCreateExpenseRequest && (
        <div className="px-4 pb-4">
          <button
            onClick={onCreateExpenseRequest}
            className="w-full py-2 px-3 text-sm bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Masraf Talebi Oluştur
          </button>
        </div>
      )}
    </div>
  );
}
