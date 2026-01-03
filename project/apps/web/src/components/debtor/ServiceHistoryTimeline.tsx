"use client";

import { Clock, ArrowRight, Send, CheckCircle, AlertTriangle, RotateCcw, MapPin } from "lucide-react";
import {
  ServiceStatus,
  ServiceStatusLabels,
  ServiceReturnReasonLabels,
  ServiceHistoryItem,
  AddressTypeLabels,
} from "@/lib/api";

interface ServiceHistoryTimelineProps {
  history: ServiceHistoryItem[];
  isLoading?: boolean;
}

export function ServiceHistoryTimeline({ history, isLoading }: ServiceHistoryTimelineProps) {
  if (isLoading) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Clock className="w-5 h-5 animate-spin mx-auto mb-2" />
        Yükleniyor...
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="p-4 text-center text-gray-500 text-sm">
        Henüz tebligat geçmişi yok
      </div>
    );
  }

  const getStatusIcon = (status: ServiceStatus) => {
    switch (status) {
      case "DELIVERED":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "RETURNED":
      case "FAILED":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "SENT":
        return <Send className="w-4 h-4 text-blue-500" />;
      case "READY":
        return <RotateCcw className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-3">
      {history.map((item) => (
        <div
          key={item.id}
          className="relative pl-6 pb-3 border-l-2 border-gray-200 last:border-l-transparent"
        >
          {/* Timeline dot */}
          <div className="absolute -left-[9px] top-0 w-4 h-4 bg-white rounded-full border-2 border-gray-300 flex items-center justify-center">
            {getStatusIcon(item.toStatus)}
          </div>

          {/* Content */}
          <div className="bg-gray-50 rounded-lg p-3">
            {/* Status transition */}
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="text-gray-500">{ServiceStatusLabels[item.fromStatus]}</span>
              <ArrowRight className="w-3 h-3 text-gray-400" />
              <span className="text-gray-900">{ServiceStatusLabels[item.toStatus]}</span>
            </div>

            {/* Details */}
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              {/* Address info (TK compliance) */}
              {item.addressText && (
                <div className="flex items-start gap-1.5 p-2 bg-blue-50 rounded border border-blue-100">
                  <MapPin className="w-3 h-3 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-blue-700">
                      {item.addressType ? AddressTypeLabels[item.addressType] : "Adres"}
                    </div>
                    <div className="text-blue-600">{item.addressText}</div>
                  </div>
                </div>
              )}
              {item.trackingNo && (
                <div>Takip No: <span className="font-mono">{item.trackingNo}</span></div>
              )}
              {item.actionDate && (
                <div>İşlem Tarihi: {formatDate(item.actionDate)}</div>
              )}
              {item.returnReason && (
                <div className="text-red-600">
                  Sebep: {ServiceReturnReasonLabels[item.returnReason as keyof typeof ServiceReturnReasonLabels] || item.returnReason}
                </div>
              )}
              {item.note && (
                <div className="italic text-gray-600 mt-1">"{item.note}"</div>
              )}
            </div>

            {/* Timestamp */}
            <div className="mt-2 text-xs text-gray-400">
              {formatDate(item.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
