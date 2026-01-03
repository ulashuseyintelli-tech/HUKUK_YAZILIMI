"use client";

import { useState, useEffect } from "react";
import { X, Send, CheckCircle, AlertTriangle, Zap, MapPin, ArrowRight, Megaphone } from "lucide-react";
import { Button } from "@hukuk/ui";
import {
  ServiceStatus,
  ServiceChannel,
  ServiceReturnReason,
  ServiceStatusLabels,
  ServiceChannelLabels,
  ServiceReturnReasonLabels,
  ServiceStatusTransitions,
  UpdateServiceStatusDTO,
  DebtorDetailDTO,
  AddressDTO,
  AddressTypeLabels,
  AddressTypeIcons,
  NextAddressSuggestionDTO,
  api,
} from "@/lib/api";

interface ServiceUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  debtor: DebtorDetailDTO;
  onSubmit: (data: UpdateServiceStatusDTO) => Promise<void>;
  isLoading?: boolean;
}

// Direct entry mode allows skipping intermediate states
// e.g., directly entering DELIVERED without going through READY → SENT
const DIRECT_ENTRY_STATUSES: ServiceStatus[] = ["DELIVERED", "RETURNED", "MUHTAR", "ANNOUNCEMENT"];

export function ServiceUpdateModal({
  isOpen,
  onClose,
  debtor,
  onSubmit,
  isLoading = false,
}: ServiceUpdateModalProps) {
  const currentStatus = debtor.service.status;
  const allowedTransitions = ServiceStatusTransitions[currentStatus] || [];

  const [isDirectEntry, setIsDirectEntry] = useState(false);
  const [status, setStatus] = useState<ServiceStatus>(currentStatus);
  const [channel, setChannel] = useState<ServiceChannel>(
    (debtor.service.channel as ServiceChannel) || "PHYSICAL"
  );
  const [trackingNo, setTrackingNo] = useState(debtor.service.trackingNo || "");
  const [sentAt, setSentAt] = useState(
    debtor.service.sentAt ? debtor.service.sentAt.split("T")[0] : ""
  );
  const [deliveredAt, setDeliveredAt] = useState(
    debtor.service.deliveredAt ? debtor.service.deliveredAt.split("T")[0] : ""
  );
  const [returnedAt, setReturnedAt] = useState(
    debtor.service.returnedAt ? debtor.service.returnedAt.split("T")[0] : ""
  );
  const [returnReason, setReturnReason] = useState<ServiceReturnReason | "">(
    debtor.service.returnReason || ""
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  
  // Address selection state
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    debtor.selectedAddressId || ""
  );
  
  // TK 21/2 state
  const [applyTK21_2, setApplyTK21_2] = useState(false);
  const [tk21_2MuhtarDate, setTk21_2MuhtarDate] = useState("");
  const [tk21_2DoorPostDate, setTk21_2DoorPostDate] = useState("");
  const [tk21_2NoticeDate, setTk21_2NoticeDate] = useState("");

  // Next address suggestion state (Phase 2)
  const [nextAddressSuggestion, setNextAddressSuggestion] = useState<NextAddressSuggestionDTO | null>(null);
  const [isLoadingSuggestion, setIsLoadingSuggestion] = useState(false);

  // Get addresses and check TK 21/2 eligibility
  const addresses = debtor.addresses || [];
  const selectedAddress = addresses.find(a => a.id === selectedAddressId);
  const canApplyTK21_2 = selectedAddress?.canApply21_2 && 
    selectedAddress?.type === "MERNIS" && 
    (status === "RETURNED" || currentStatus === "RETURNED");

  // Available statuses based on mode
  const availableStatuses = isDirectEntry 
    ? DIRECT_ENTRY_STATUSES 
    : allowedTransitions;

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsDirectEntry(false);
      setStatus(currentStatus);
      setChannel((debtor.service.channel as ServiceChannel) || "PHYSICAL");
      setTrackingNo(debtor.service.trackingNo || "");
      setSentAt(debtor.service.sentAt ? debtor.service.sentAt.split("T")[0] : "");
      setDeliveredAt(debtor.service.deliveredAt ? debtor.service.deliveredAt.split("T")[0] : "");
      setReturnedAt(debtor.service.returnedAt ? debtor.service.returnedAt.split("T")[0] : "");
      setReturnReason(debtor.service.returnReason || "");
      setNote("");
      setError(null);
      setSelectedAddressId(debtor.selectedAddressId || "");
      setApplyTK21_2(false);
      setTk21_2MuhtarDate("");
      setTk21_2DoorPostDate("");
      setTk21_2NoticeDate("");
      setNextAddressSuggestion(null);
    }
  }, [isOpen, debtor, currentStatus]);

  // Fetch next address suggestion when return reason is selected (Phase 2)
  useEffect(() => {
    const fetchSuggestion = async () => {
      if (status === "RETURNED" && returnReason && selectedAddressId && debtor.id) {
        setIsLoadingSuggestion(true);
        try {
          const suggestion = await api.suggestNextAddress(
            selectedAddressId,
            debtor.id,
            returnReason as ServiceReturnReason
          );
          setNextAddressSuggestion(suggestion);
          
          // Auto-enable TK 21/2 if suggested
          if (suggestion.canApplyTK21_2) {
            setApplyTK21_2(true);
          }
        } catch (err) {
          console.error("Failed to fetch next address suggestion:", err);
        } finally {
          setIsLoadingSuggestion(false);
        }
      } else {
        setNextAddressSuggestion(null);
      }
    };

    fetchSuggestion();
  }, [status, returnReason, selectedAddressId, debtor.id]);

  if (!isOpen) return null;

  const isDeliveredStateCheck = ["DELIVERED", "MUHTAR", "ANNOUNCEMENT"].includes(currentStatus);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // For delivered state editing, use current status
    const effectiveStatus = isDeliveredStateCheck ? currentStatus : status;

    // Validation
    if (effectiveStatus === "SENT" && !sentAt) {
      setError("Gönderim tarihi zorunludur");
      return;
    }
    if ((effectiveStatus === "DELIVERED" || effectiveStatus === "MUHTAR" || effectiveStatus === "ANNOUNCEMENT") && !deliveredAt) {
      setError("Tebliğ tarihi zorunludur");
      return;
    }
    if (effectiveStatus === "RETURNED") {
      if (!returnedAt) {
        setError("İade tarihi zorunludur");
        return;
      }
      if (!returnReason) {
        setError("İade sebebi zorunludur");
        return;
      }
    }

    // TK 21/2 validation
    if (applyTK21_2) {
      if (!tk21_2MuhtarDate || !tk21_2DoorPostDate || !tk21_2NoticeDate) {
        setError("TK 21/2 için tüm tarihler zorunludur");
        return;
      }
    }

    const data: UpdateServiceStatusDTO = {
      status: effectiveStatus,
      channel,
      trackingNo: trackingNo || undefined,
      sentAt: sentAt ? new Date(sentAt).toISOString() : undefined,
      deliveredAt: deliveredAt ? new Date(deliveredAt).toISOString() : undefined,
      returnedAt: returnedAt ? new Date(returnedAt).toISOString() : undefined,
      returnReason: returnReason || undefined,
      note: note || undefined,
      directEntry: isDirectEntry || isDeliveredStateCheck || undefined,
      // Address tracking
      addressId: selectedAddressId || undefined,
      // TK 21/2 fields
      applyTK21_2: applyTK21_2 || undefined,
      tk21_2MuhtarDate: tk21_2MuhtarDate ? new Date(tk21_2MuhtarDate).toISOString() : undefined,
      tk21_2DoorPostDate: tk21_2DoorPostDate ? new Date(tk21_2DoorPostDate).toISOString() : undefined,
      tk21_2NoticeDate: tk21_2NoticeDate ? new Date(tk21_2NoticeDate).toISOString() : undefined,
    };

    try {
      await onSubmit(data);
      onClose();
    } catch (err: any) {
      setError(err.message || "Bir hata oluştu");
    }
  };

  const getStatusIcon = (s: ServiceStatus) => {
    switch (s) {
      case "DELIVERED":
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case "RETURNED":
      case "FAILED":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "SENT":
        return <Send className="w-4 h-4 text-blue-500" />;
      default:
        return null;
    }
  };

  const isTerminal = allowedTransitions.length === 0 && !["DELIVERED", "MUHTAR", "ANNOUNCEMENT"].includes(currentStatus);
  const isDeliveredState = ["DELIVERED", "MUHTAR", "ANNOUNCEMENT"].includes(currentStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {isDeliveredState ? "Tebligat Bilgilerini Düzenle" : "Tebligat Durumu Güncelle"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Current Status */}
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-500">Mevcut Durum</div>
            <div className="font-medium flex items-center gap-2 mt-1">
              {getStatusIcon(currentStatus)}
              {debtor.serviceLabel}
            </div>
          </div>

          {/* Address Selection */}
          {addresses.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <label className="block text-sm font-medium text-blue-800 mb-2">
                <MapPin className="w-4 h-4 inline mr-1" />
                Tebligat Adresi
              </label>
              <select
                value={selectedAddressId}
                onChange={(e) => {
                  setSelectedAddressId(e.target.value);
                  setApplyTK21_2(false); // Reset TK 21/2 when address changes
                }}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              >
                <option value="">Adres seçiniz...</option>
                {addresses.map((addr) => (
                  <option key={addr.id} value={addr.id}>
                    {AddressTypeIcons[addr.type]} {AddressTypeLabels[addr.type]} - {addr.fullText.substring(0, 40)}...
                  </option>
                ))}
              </select>
              {selectedAddress && (
                <div className="mt-2 text-xs text-blue-700">
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedAddress.verified && (
                      <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ Doğrulanmış</span>
                    )}
                    {selectedAddress.canApply21_2 && (
                      <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">TK 21/2</span>
                    )}
                    {selectedAddress.riskFlags.length > 0 && (
                      <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">⚠️ Risk</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {isTerminal ? (
            <div className="p-4 bg-green-50 text-green-700 rounded-lg text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <div className="font-medium">Tebligat Tamamlandı</div>
              <div className="text-sm mt-1">Bu borçlu için tebligat süreci sonlanmıştır.</div>
            </div>
          ) : isDeliveredState ? (
            <>
              {/* Tebliğ edilmiş - sadece tarih düzenleme */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="text-sm text-amber-700 mb-2">
                  ✏️ Tebliğ bilgilerini düzenleyebilirsiniz
                </div>
              </div>

              {/* Tebliğ Tarihi */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tebliğ Tarihi <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={deliveredAt}
                  onChange={(e) => setDeliveredAt(e.target.value)}
                  max={new Date().toISOString().split("T")[0]}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Kanal */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kanal
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as ServiceChannel)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {(Object.keys(ServiceChannelLabels) as ServiceChannel[]).map((c) => (
                    <option key={c} value={c}>
                      {ServiceChannelLabels[c]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Takip No */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PTT Barkod / Takip No
                </label>
                <input
                  type="text"
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  placeholder="RR123456789TR"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Not */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Not (opsiyonel)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Düzenleme sebebi..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Footer - inside form */}
              <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
                  İptal
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !deliveredAt}
                >
                  {isLoading ? "Kaydediliyor..." : "Güncelle"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Mode Toggle - Direct Entry */}
              {!isTerminal && currentStatus !== "DELIVERED" && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="text-sm text-blue-700">Elle Tarih Girişi</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newDirectEntry = !isDirectEntry;
                      setIsDirectEntry(newDirectEntry);
                      // When enabling direct entry, default to DELIVERED
                      // When disabling, reset to current status
                      setStatus(newDirectEntry ? "DELIVERED" : currentStatus);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      isDirectEntry ? "bg-blue-600" : "bg-gray-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        isDirectEntry ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}

              {isDirectEntry && (
                <div className="p-2 bg-amber-50 text-amber-700 text-xs rounded">
                  ⚠️ Elle giriş modu: Ara adımları atlayarak doğrudan tebliğ/iade tarihi girebilirsiniz.
                </div>
              )}

              {/* New Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Yeni Durum
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ServiceStatus)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {!isDirectEntry && (
                    <option value={currentStatus}>{ServiceStatusLabels[currentStatus]} (Mevcut)</option>
                  )}
                  {availableStatuses.map((s) => (
                    <option key={s} value={s}>
                      {ServiceStatusLabels[s]}
                    </option>
                  ))}
                </select>
              </div>

              {/* TEBLİĞ TARİHİ - Elle giriş modunda en önemli alan, üstte göster */}
              {/* DEBUG: isDirectEntry={isDirectEntry}, status={status} */}
              {isDirectEntry && (
                <div className="p-3 bg-green-50 border-2 border-green-300 rounded-lg">
                  <label className="block text-sm font-medium text-green-800 mb-1">
                    📅 Tebliğ Tarihi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveredAt}
                    onChange={(e) => setDeliveredAt(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 border-2 border-green-400 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-medium"
                  />
                  <p className="text-xs text-green-600 mt-1">Hukuki süreler bu tarihten başlar</p>
                </div>
              )}

              {/* İADE TARİHİ - Elle giriş modunda üstte göster */}
              {isDirectEntry && status === "RETURNED" && (
                <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-red-800 mb-1">
                      📅 İade Tarihi <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={returnedAt}
                      onChange={(e) => setReturnedAt(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      className="w-full px-3 py-2 border-2 border-red-400 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-red-800 mb-1">
                      İade Sebebi <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value as ServiceReturnReason)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    >
                      <option value="">Seçiniz...</option>
                      {(Object.keys(ServiceReturnReasonLabels) as ServiceReturnReason[]).map((r) => (
                        <option key={r} value={r}>
                          {ServiceReturnReasonLabels[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Channel */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Kanal
                </label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as ServiceChannel)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {(Object.keys(ServiceChannelLabels) as ServiceChannel[]).map((c) => (
                    <option key={c} value={c}>
                      {ServiceChannelLabels[c]}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tracking Number */}
              {(status === "SENT" || status === "DELIVERED" || status === "RETURNED") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    PTT Barkod / Takip No
                  </label>
                  <input
                    type="text"
                    value={trackingNo}
                    onChange={(e) => setTrackingNo(e.target.value)}
                    placeholder="RR123456789TR"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Sent Date */}
              {(status === "SENT" || status === "DELIVERED" || status === "RETURNED") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Gönderim Tarihi {status === "SENT" && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="date"
                    value={sentAt}
                    onChange={(e) => setSentAt(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Delivered Date */}
              {(status === "DELIVERED" || status === "MUHTAR" || status === "ANNOUNCEMENT") && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tebliğ Tarihi <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={deliveredAt}
                    onChange={(e) => setDeliveredAt(e.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              )}

              {/* Returned Date & Reason */}
              {status === "RETURNED" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      İade Tarihi <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={returnedAt}
                      onChange={(e) => setReturnedAt(e.target.value)}
                      max={new Date().toISOString().split("T")[0]}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      İade Sebebi <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value as ServiceReturnReason)}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seçiniz...</option>
                      {(Object.keys(ServiceReturnReasonLabels) as ServiceReturnReason[]).map((r) => (
                        <option key={r} value={r}>
                          {ServiceReturnReasonLabels[r]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* TK 21/2 Option - Only for MERNIS addresses */}
                  {canApplyTK21_2 && (
                    <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-purple-800 text-sm">TK 21/2 Uygula</div>
                          <div className="text-xs text-purple-600">Bila tebligat (muhtara teslim)</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setApplyTK21_2(!applyTK21_2)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            applyTK21_2 ? "bg-purple-600" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              applyTK21_2 ? "translate-x-6" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>

                      {applyTK21_2 && (
                        <div className="space-y-2 pt-2 border-t border-purple-200">
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">
                              Muhtara Teslim Tarihi <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={tk21_2MuhtarDate}
                              onChange={(e) => setTk21_2MuhtarDate(e.target.value)}
                              max={new Date().toISOString().split("T")[0]}
                              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">
                              Kapıya Yapıştırma Tarihi <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={tk21_2DoorPostDate}
                              onChange={(e) => setTk21_2DoorPostDate(e.target.value)}
                              max={new Date().toISOString().split("T")[0]}
                              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-purple-700 mb-1">
                              İhbarname Tarihi <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={tk21_2NoticeDate}
                              onChange={(e) => setTk21_2NoticeDate(e.target.value)}
                              max={new Date().toISOString().split("T")[0]}
                              className="w-full px-2 py-1.5 text-sm border rounded focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next Address Suggestion - Phase 2 */}
                  {nextAddressSuggestion && !applyTK21_2 && (
                    <div className={`p-3 rounded-lg border space-y-2 ${
                      nextAddressSuggestion.shouldAnnounce 
                        ? "bg-amber-50 border-amber-200" 
                        : nextAddressSuggestion.nextAddress 
                          ? "bg-blue-50 border-blue-200"
                          : "bg-gray-50 border-gray-200"
                    }`}>
                      <div className="flex items-center gap-2">
                        {nextAddressSuggestion.shouldAnnounce ? (
                          <Megaphone className="w-4 h-4 text-amber-600" />
                        ) : (
                          <ArrowRight className="w-4 h-4 text-blue-600" />
                        )}
                        <span className={`font-medium text-sm ${
                          nextAddressSuggestion.shouldAnnounce ? "text-amber-800" : "text-blue-800"
                        }`}>
                          Sonraki Adım Önerisi
                        </span>
                      </div>
                      <p className={`text-sm ${
                        nextAddressSuggestion.shouldAnnounce ? "text-amber-700" : "text-blue-700"
                      }`}>
                        {nextAddressSuggestion.suggestion}
                      </p>
                      {nextAddressSuggestion.nextAddress && (
                        <button
                          type="button"
                          onClick={() => setSelectedAddressId(nextAddressSuggestion.nextAddress!.id)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Bu adresi seç →
                        </button>
                      )}
                    </div>
                  )}

                  {isLoadingSuggestion && (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                        Sonraki adres önerisi hesaplanıyor...
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Not (opsiyonel)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ek açıklama..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}
            </>
          )}

          {/* Footer - inside form */}
          <div className="flex justify-end gap-2 pt-4 mt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              İptal
            </Button>
            {!isTerminal && (
              <Button
                type="submit"
                disabled={
                  isLoading || 
                  (!isDirectEntry && status === currentStatus) ||
                  (isDirectEntry && !status)
                }
              >
                {isLoading ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
