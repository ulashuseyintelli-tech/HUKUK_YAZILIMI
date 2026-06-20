"use client";

import { useState, useEffect } from "react";
import {
  Link2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Megaphone,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  NotificationChainDTO,
  AddressTypeLabels,
  AddressTypeIcons,
  api,
} from "@/lib/api";

interface NotificationChainPanelProps {
  debtorId: string;
  onAddressSelect?: (addressId: string) => void;
  readOnly?: boolean;
}

export function NotificationChainPanel({
  debtorId,
  onAddressSelect,
  readOnly = false,
}: NotificationChainPanelProps) {
  const [chain, setChain] = useState<NotificationChainDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchChain = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getNotificationChain(debtorId);
      setChain(data);
    } catch (err: any) {
      setError(err.message || "Tebligat zinciri yüklenemedi");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchChain();
  }, [debtorId]);

  if (isLoading && !chain) {
    return (
      <div className="border rounded-lg bg-white p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Tebligat zinciri yükleniyor...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 rounded-lg bg-red-50 p-3">
        <div className="text-red-700 text-xs">{error}</div>
        <button
          onClick={fetchChain}
          className="mt-1.5 px-2 py-1 text-xs border border-red-300 rounded hover:bg-red-100"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  if (!chain) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return "bg-emerald-500";
      case "EXHAUSTED":
        return "bg-red-500";
      default:
        return "bg-blue-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return "Tebliğ Edildi";
      case "EXHAUSTED":
        return "Tüm Adresler Tükendi";
      default:
        return "Devam Ediyor";
    }
  };

  return (
    <div className="border rounded-lg bg-white">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-medium text-xs">Tebligat Zinciri</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full text-white ${getStatusColor(
              chain.chainStatus
            )}`}
          >
            {getStatusLabel(chain.chainStatus)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500">
            {chain.remainingCount}/{chain.addresses.length}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-2 pb-1.5 space-y-0.5">
          {/* Summary Stats - Compact */}
          <div className="flex items-center justify-center gap-3 text-center">
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold text-gray-900">{chain.totalAttempts}</span>
              <span className="text-[9px] text-gray-500">Deneme</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold text-emerald-600">{chain.remainingCount}</span>
              <span className="text-[9px] text-gray-500">Kalan</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold text-red-600">{chain.exhaustedCount}</span>
              <span className="text-[9px] text-gray-500">Tükenen</span>
            </div>
          </div>

          {/* Recommendation - Compact */}
          <div
            className={`px-1.5 py-0.5 rounded text-[10px] leading-tight ${
              chain.chainStatus === "DELIVERED"
                ? "bg-emerald-50 text-emerald-700"
                : chain.chainStatus === "EXHAUSTED"
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
            }`}
          >
            {chain.chainStatus === "EXHAUSTED" && (
              <Megaphone className="w-2.5 h-2.5 inline mr-0.5" />
            )}
            {chain.recommendation}
          </div>
          {readOnly && (
            <div className="px-1.5 py-0.5 rounded text-[10px] leading-tight bg-gray-50 text-gray-600 border border-gray-200">
              Pasif kayit: adres secimi kapali.
            </div>
          )}

          {/* Address Chain - Compact */}
          <div>
            {chain.addresses.map((item) => (
              <div
                key={item.address.id}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] mb-px ${
                  item.address.id === chain.currentAddressId
                    ? "border-blue-400 bg-blue-50"
                    : item.isExhausted
                    ? "border-red-200 bg-red-50/50 opacity-50"
                    : item.nextInChain
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-gray-200"
                }`}
              >
                {/* Status Icon */}
                {item.lastAttempt?.status === "DELIVERED" ||
                item.lastAttempt?.status === "MUHTAR" ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                ) : item.isExhausted ? (
                  <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                ) : item.nextInChain ? (
                  <ArrowRight className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                ) : item.address.id === chain.currentAddressId ? (
                  <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-blue-100 flex-shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" />
                )}

                {/* Type Icon + Label */}
                <span className="flex-shrink-0">{AddressTypeIcons[item.address.type]}</span>
                <span className="font-medium text-gray-800 truncate flex-1">
                  {AddressTypeLabels[item.address.type]}
                </span>

                {/* Badges */}
                {item.address.id === chain.currentAddressId && (
                  <span className="text-[9px] bg-blue-500 text-white px-0.5 rounded">Aktif</span>
                )}
                {item.nextInChain && (
                  <span className="text-[9px] bg-emerald-500 text-white px-0.5 rounded">Sıra</span>
                )}

                {/* Attempt Count */}
                <span className="text-[9px] text-gray-400 flex-shrink-0">{item.attemptCount}x</span>

                {/* Select Button */}
                {!item.isExhausted &&
                  item.address.id !== chain.currentAddressId &&
                  onAddressSelect &&
                  !readOnly && (
                    <button
                      onClick={() => onAddressSelect(item.address.id)}
                      className="text-blue-600 hover:text-blue-800 px-1 hover:bg-blue-100 rounded"
                    >
                      Seç
                    </button>
                  )}
              </div>
            ))}
          </div>

          {/* Refresh Button - Compact */}
          <button
            onClick={fetchChain}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-0.5 text-[9px] text-gray-400 hover:text-gray-600 pt-0.5"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>
      )}
    </div>
  );
}
