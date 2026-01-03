"use client";

import { useState, useEffect } from "react";
import {
  X,
  User,
  Building2,
  MapPin,
  Phone,
  Mail,
  FileText,
  Clock,
  Send,
  RotateCcw,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@hukuk/ui";
import { api, DebtorDetailDTO, ServiceHistoryItem, DebtorRoleLabels, UpdateServiceStatusDTO } from "@/lib/api";
import { ServiceStatusBadge } from "./ServiceStatusBadge";
import { AlertBadge } from "./AlertBadge";
import { ServiceUpdateModal } from "./modals/ServiceUpdateModal";
import { ServiceHistoryTimeline } from "./ServiceHistoryTimeline";

interface DebtorDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseDebtorId: string;
  onUpdate?: () => void;
}

export function DebtorDetailDrawer({
  isOpen,
  onClose,
  caseId,
  caseDebtorId,
  onUpdate,
}: DebtorDetailDrawerProps) {
  const [debtor, setDebtor] = useState<DebtorDetailDTO | null>(null);
  const [history, setHistory] = useState<ServiceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);

  // Fetch debtor detail
  useEffect(() => {
    if (isOpen && caseDebtorId) {
      fetchDebtor();
    }
  }, [isOpen, caseDebtorId]);

  const fetchDebtor = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCaseDebtorDetail(caseId, caseDebtorId);
      setDebtor(data);
      setQuickNote(data.quickNote || "");
    } catch (err) {
      console.error("Borçlu detayı yüklenemedi:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    if (history.length > 0) return; // Already loaded
    setIsHistoryLoading(true);
    try {
      const data = await api.getServiceHistory(caseId, caseDebtorId);
      setHistory(data);
    } catch (err) {
      console.error("Tebligat geçmişi yüklenemedi:", err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      fetchHistory();
    }
    setShowHistory(!showHistory);
  };

  const handleServiceUpdate = async (data: UpdateServiceStatusDTO) => {
    setIsUpdating(true);
    try {
      await api.updateServiceStatus(caseId, caseDebtorId, data);
      await fetchDebtor();
      setHistory([]); // Reset history to refetch
      onUpdate?.();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRetry = async () => {
    setIsUpdating(true);
    try {
      await api.startNewServiceAttempt(caseId, caseDebtorId);
      await fetchDebtor();
      setHistory([]);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || "Yeni tebligat başlatılamadı");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveNote = async () => {
    try {
      await api.updateDebtorQuickNote(caseId, caseDebtorId, quickNote);
      setIsEditingNote(false);
      onUpdate?.();
    } catch (err: any) {
      alert(err.message || "Not kaydedilemedi");
    }
  };

  if (!isOpen) return null;

  const canRetry = debtor && ["RETURNED", "FAILED"].includes(debtor.service.status);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Borçlu Detayı</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">
              <Clock className="w-6 h-6 animate-spin mx-auto mb-2" />
              Yükleniyor...
            </div>
          ) : debtor ? (
            <div className="p-4 space-y-6">
              {/* Identity Section */}
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {debtor.personType === "LEGAL" ? (
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-blue-600" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="w-5 h-5 text-gray-600" />
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-lg">{debtor.displayName}</div>
                      <div className="text-sm text-gray-500">
                        {DebtorRoleLabels[debtor.role]}
                      </div>
                    </div>
                  </div>
                  <AlertBadge alertCount={debtor.alertCount} alertLevel={debtor.alertLevel} issues={debtor.issues} />
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {debtor.identityMasked && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileText className="w-4 h-4" />
                      {debtor.identityMasked}
                    </div>
                  )}
                  {debtor.phoneMasked && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Phone className="w-4 h-4" />
                      {debtor.phoneMasked}
                    </div>
                  )}
                  {debtor.emailMasked && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <Mail className="w-4 h-4" />
                      {debtor.emailMasked}
                    </div>
                  )}
                  {debtor.addressShort && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapPin className="w-4 h-4" />
                      {debtor.addressShort}
                    </div>
                  )}
                </div>
              </div>

              {/* Service Status Section */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Tebligat Durumu</h3>
                  <ServiceStatusBadge status={debtor.serviceStatus} serviceLabel={debtor.serviceLabel} />
                </div>

                {/* TEBLİĞ TARİHİ - En kritik bilgi, belirgin göster */}
                {debtor.service.deliveredAt && (
                  <div className="p-3 bg-green-100 border border-green-300 rounded-lg">
                    <div className="text-xs text-green-700 font-medium uppercase tracking-wide">Tebliğ Tarihi</div>
                    <div className="text-lg font-bold text-green-800 mt-0.5">
                      {new Date(debtor.service.deliveredAt).toLocaleDateString("tr-TR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric"
                      })}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      Hukuki süreler bu tarihten itibaren başlar
                    </div>
                  </div>
                )}

                {/* Gönderim Tarihi */}
                {debtor.service.sentAt && !debtor.service.deliveredAt && (
                  <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                    <div className="text-xs text-blue-600">Gönderim Tarihi</div>
                    <div className="text-sm font-medium text-blue-800">
                      {new Date(debtor.service.sentAt).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                )}

                {/* İade Tarihi */}
                {debtor.service.returnedAt && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded">
                    <div className="text-xs text-red-600">İade Tarihi</div>
                    <div className="text-sm font-medium text-red-800">
                      {new Date(debtor.service.returnedAt).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                )}

                {/* Service Details */}
                {debtor.service.trackingNo && (
                  <div className="text-sm">
                    <span className="text-gray-500">Takip No:</span>{" "}
                    <span className="font-mono">{debtor.service.trackingNo}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    onClick={() => setIsServiceModalOpen(true)}
                    disabled={isUpdating}
                  >
                    <Send className="w-4 h-4 mr-1" />
                    Güncelle
                  </Button>
                  {canRetry && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRetry}
                      disabled={isUpdating}
                    >
                      <RotateCcw className="w-4 h-4 mr-1" />
                      Yeni Deneme
                    </Button>
                  )}
                </div>

                {/* History Toggle */}
                <button
                  onClick={handleToggleHistory}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 pt-2"
                >
                  <History className="w-4 h-4" />
                  Tebligat Geçmişi
                  {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showHistory && (
                  <div className="pt-2 border-t">
                    <ServiceHistoryTimeline history={history} isLoading={isHistoryLoading} />
                  </div>
                )}
              </div>

              {/* Assets Section */}
              <div className="space-y-2">
                <h3 className="font-medium">Malvarlığı</h3>
                <div className="flex flex-wrap gap-2">
                  <AssetBadge label="Araç" status={debtor.assets.vehicle} icon="🚗" />
                  <AssetBadge label="Tapu" status={debtor.assets.realEstate} icon="🏠" />
                  <AssetBadge label="Banka" status={debtor.assets.bank} icon="🏦" />
                  <AssetBadge label="SGK/Maaş" status={debtor.assets.sgkWage} icon="💼" />
                </div>
                {debtor.assets.lastQueryAt && (
                  <div className="text-xs text-gray-500">
                    Son sorgu: {new Date(debtor.assets.lastQueryAt).toLocaleDateString("tr-TR")}
                  </div>
                )}
              </div>

              {/* Quick Note Section */}
              <div className="space-y-2">
                <h3 className="font-medium">Hızlı Not</h3>
                {isEditingNote ? (
                  <div className="space-y-2">
                    <textarea
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      maxLength={240}
                      rows={3}
                      className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Borçlu hakkında kısa not..."
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400">{quickNote.length}/240</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => {
                          setQuickNote(debtor.quickNote || "");
                          setIsEditingNote(false);
                        }}>
                          İptal
                        </Button>
                        <Button size="sm" onClick={handleSaveNote}>
                          Kaydet
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => setIsEditingNote(true)}
                    className="p-3 bg-yellow-50 rounded-lg text-sm cursor-pointer hover:bg-yellow-100 transition-colors min-h-[60px]"
                  >
                    {debtor.quickNote || (
                      <span className="text-gray-400 italic">Not eklemek için tıklayın...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Risk Flags */}
              {debtor.riskFlags.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium text-red-600">Risk Uyarıları</h3>
                  <div className="flex flex-wrap gap-2">
                    {debtor.riskFlags.map((flag) => (
                      <span
                        key={flag}
                        className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full"
                      >
                        {flag === "BANKRUPTCY" && "İflas Riski"}
                        {flag === "ADDRESS_SUSPECT" && "Adres Şüpheli"}
                        {flag === "CONCORDAT" && "Konkordato"}
                        {flag === "DECEASED" && "Vefat"}
                        {flag === "COMPANY_CLOSED" && "Şirket Kapandı"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-gray-500">
              Borçlu bilgisi bulunamadı
            </div>
          )}
        </div>
      </div>

      {/* Service Update Modal */}
      {debtor && (
        <ServiceUpdateModal
          isOpen={isServiceModalOpen}
          onClose={() => setIsServiceModalOpen(false)}
          debtor={debtor}
          onSubmit={handleServiceUpdate}
          isLoading={isUpdating}
        />
      )}
    </>
  );
}

// Asset Badge Component
function AssetBadge({
  label,
  status,
  icon,
}: {
  label: string;
  status: "YES" | "NO" | "UNKNOWN" | "PENDING" | "ERROR";
  icon: string;
}) {
  const colors = {
    YES: "bg-green-100 text-green-700",
    NO: "bg-red-100 text-red-700",
    UNKNOWN: "bg-gray-100 text-gray-500",
    PENDING: "bg-yellow-100 text-yellow-700",
    ERROR: "bg-red-100 text-red-700",
  };

  return (
    <span className={`px-2 py-1 rounded text-xs ${colors[status]}`}>
      {icon} {label}: {status === "YES" ? "Var" : status === "NO" ? "Yok" : status === "PENDING" ? "Sorgulanıyor" : "?"}
    </span>
  );
}
