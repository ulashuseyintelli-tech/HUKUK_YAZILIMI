"use client";

import { useState, useEffect } from "react";
import { X, Clock, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { Button } from "@hukuk/ui";
import { api, ServiceHistoryItem, ServiceStatusLabels, ServiceReturnReasonLabels } from "@/lib/api";

interface AddressHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  addressId: string;
}

export function AddressHistoryModal({
  isOpen,
  onClose,
  addressId,
}: AddressHistoryModalProps) {
  const [history, setHistory] = useState<ServiceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && addressId) {
      fetchHistory();
    }
  }, [isOpen, addressId]);

  const fetchHistory = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getAddressHistory(addressId);
      setHistory(data);
    } catch (err: any) {
      setError(err.message || "Geçmiş yüklenemedi");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "DELIVERED":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "RETURNED":
      case "FAILED":
        return <XCircle className="w-4 h-4 text-red-500" />;
      case "SENT":
        return <Clock className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="text-lg font-semibold">Adres Tebligat Geçmişi</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 overflow-y-auto max-h-[calc(80vh-120px)]">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-6 h-6 animate-spin mx-auto mb-2" />
                Yükleniyor...
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500">{error}</div>
            ) : history.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                Bu adrese henüz tebligat yapılmamış
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="border rounded-lg p-3 space-y-2"
                  >
                    {/* Status Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.toStatus)}
                        <span className="font-medium text-sm">
                          {ServiceStatusLabels[item.toStatus] || item.toStatus}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {item.actionDate && new Date(item.actionDate).toLocaleDateString("tr-TR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="text-xs text-gray-600 space-y-1">
                      {item.channel && (
                        <div>
                          <span className="text-gray-400">Kanal:</span>{" "}
                          {item.channel}
                        </div>
                      )}
                      {item.trackingNo && (
                        <div>
                          <span className="text-gray-400">Takip No:</span>{" "}
                          {item.trackingNo}
                        </div>
                      )}
                      {item.returnReason && (
                        <div className="text-amber-600">
                          <span className="text-gray-400">İade Sebebi:</span>{" "}
                          {(ServiceReturnReasonLabels as Record<string, string>)[item.returnReason] || item.returnReason}
                        </div>
                      )}
                      {item.note && (
                        <div className="italic">
                          <span className="text-gray-400">Not:</span> {item.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end p-4 border-t bg-gray-50">
            <Button variant="outline" onClick={onClose}>
              Kapat
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
