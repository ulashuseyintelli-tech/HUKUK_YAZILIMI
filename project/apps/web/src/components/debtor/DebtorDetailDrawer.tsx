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
  Pencil,
  Search,
} from "lucide-react";
import { Button } from "@hukuk/ui";
import { api, DebtorDetailDTO, ServiceHistoryItem, DebtorRoleLabels, UpdateServiceStatusDTO } from "@/lib/api";
import { AlertBadge } from "./AlertBadge";
import { ServiceUpdateModal } from "./modals/ServiceUpdateModal";
import { ServiceHistoryTimeline } from "./ServiceHistoryTimeline";
import { NewDebtorModal } from "./NewDebtorModal";
import { AddressListSection } from "./AddressListSection";
import { NotificationChainPanel } from "./NotificationChainPanel";
import { AddressDiscoveryPanel } from "../address-discovery";
import { AssetQueryPanel } from "./AssetQueryPanel";
import { Debtor, DebtorType } from "@/types/debtor";

type DrawerTab = 'info' | 'research' | 'assets';

interface DebtorDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  caseDebtorId: string;
  clientId?: string;
  clientEmail?: string;
  onUpdate?: () => void;
}

export function DebtorDetailDrawer({
  isOpen,
  onClose,
  caseId,
  caseDebtorId,
  clientId,
  clientEmail,
  onUpdate,
}: DebtorDetailDrawerProps) {
  const [debtor, setDebtor] = useState<DebtorDetailDTO | null>(null);
  const [history, setHistory] = useState<ServiceHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDebtorData, setEditDebtorData] = useState<Debtor | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [quickNote, setQuickNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [activeTab, setActiveTab] = useState<DrawerTab>('info');

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

  // Borçlu düzenleme modal'ını aç
  const handleOpenEditModal = async () => {
    if (!debtor) return;
    try {
      // Tam borçlu verisini çek
      const fullDebtor = await api.getDebtor(debtor.id);
      setEditDebtorData(fullDebtor);
      setIsEditModalOpen(true);
    } catch (err: any) {
      alert(err.message || "Borçlu bilgisi yüklenemedi");
    }
  };

  // Borçlu düzenleme sonrası
  const handleDebtorSaved = async () => {
    setIsEditModalOpen(false);
    setEditDebtorData(null);
    await fetchDebtor();
    onUpdate?.();
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

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-200 px-4">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'info'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <User className="w-4 h-4" />
            Bilgiler
          </button>
          <button
            onClick={() => setActiveTab('research')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'research'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Search className="w-4 h-4" />
            Adres Araştırma
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === 'assets'
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileText className="w-4 h-4" />
            Malvarlığı
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
            <>
              {/* Info Tab Content */}
              {activeTab === 'info' && (
                <div className="p-2.5 space-y-2">
              {/* Identity Section */}
              <div className="space-y-1">
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenEditModal}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                      title="Borçluyu Düzenle"
                    >
                      <Pencil className="w-4 h-4" />
                      Düzenle
                    </button>
                    <AlertBadge alertCount={debtor.alertCount} alertLevel={debtor.alertLevel} issues={debtor.issues} />
                  </div>
                </div>

                {/* Contact Info - Full details */}
                <div className="bg-slate-50 rounded-lg p-1.5 space-y-0.5">
                  {/* Identity */}
                  {debtor.identityNo && (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-slate-700">
                        {debtor.personType === "LEGAL" ? "VKN:" : "TCKN:"} {debtor.identityNo}
                      </span>
                    </div>
                  )}
                  {/* Phone */}
                  {debtor.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <a href={`tel:${debtor.phone}`} className="text-sm font-medium text-blue-600 hover:underline">
                        {debtor.phone}
                      </a>
                    </div>
                  )}
                  {/* Email */}
                  {debtor.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <a href={`mailto:${debtor.email}`} className="text-sm font-medium text-blue-600 hover:underline">
                        {debtor.email}
                      </a>
                    </div>
                  )}
                  {/* Full Address - Legacy (tek adres) */}
                  {debtor.address && !debtor.addresses?.length && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-700">{debtor.address}</span>
                    </div>
                  )}
                </div>

                {/* Address List Section (Tebligat Kanunu'na uygun) */}
                <div className="mt-1">
                  <AddressListSection
                    debtorId={debtor.id}
                    caseDebtorId={caseDebtorId}
                    addresses={debtor.addresses || []}
                    selectedAddressId={debtor.selectedAddressId}
                    debtorType={debtor.personType === "LEGAL" ? "LEGAL" : "NATURAL"}
                    identityNo={debtor.identityNo}
                    onUpdate={fetchDebtor}
                  />
                </div>

                {/* Notification Chain Panel (Phase 4) */}
                <div className="mt-1">
                  <NotificationChainPanel
                    debtorId={debtor.id}
                    onAddressSelect={async (addressId) => {
                      try {
                        await api.setActiveAddress(caseDebtorId, addressId);
                        fetchDebtor();
                      } catch (err: any) {
                        alert(err.message || "Adres seçilemedi");
                      }
                    }}
                  />
                </div>
              </div>

              {/* Service Status Section */}
              <div className="bg-gray-50 rounded-lg p-2 space-y-1">
                <h3 className="font-medium text-[11px]">Tebligat Durumu</h3>

                {/* TEBLİĞ TARİHİ + KESİNLEŞME GERİ SAYIMI */}
                {debtor.service.deliveredAt && (
                  <div className="p-1.5 bg-amber-50 border border-amber-200 rounded">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[9px] text-amber-700 font-medium uppercase tracking-wide">Tebliğ Tarihi</div>
                        <div className="text-sm font-bold text-amber-800">
                          {new Date(debtor.service.deliveredAt).toLocaleDateString("tr-TR", {
                            day: "2-digit",
                            month: "long",
                            year: "numeric"
                          })}
                        </div>
                      </div>
                      <FinalizationCountdown deliveredAt={debtor.service.deliveredAt} />
                    </div>
                  </div>
                )}

                {/* Gönderim Tarihi */}
                {debtor.service.sentAt && !debtor.service.deliveredAt && (
                  <div className="p-1.5 bg-blue-50 border border-blue-200 rounded">
                    <div className="text-[10px] text-blue-600">Gönderim Tarihi</div>
                    <div className="text-xs font-medium text-blue-800">
                      {new Date(debtor.service.sentAt).toLocaleDateString("tr-TR")}
                    </div>
                  </div>
                )}

                {/* İade Tarihi */}
                {debtor.service.returnedAt && (
                  <div className="p-1.5 bg-red-50 border border-red-200 rounded">
                    <div className="text-[10px] text-red-600">İade Tarihi</div>
                    <div className="text-xs font-medium text-red-800">
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
                <div className="flex gap-1.5 pt-1">
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
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 pt-1"
                >
                  <History className="w-4 h-4" />
                  Tebligat Geçmişi
                  {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showHistory && (
                  <div className="pt-1 border-t">
                    <ServiceHistoryTimeline history={history} isLoading={isHistoryLoading} />
                  </div>
                )}
              </div>

              {/* Haciz Potansiyeli - MESAT/AT Skoru */}
              <div>
                <h3 className="font-medium text-[11px] flex items-center gap-1 mb-0.5">
                  <span>💰</span> Haciz Potansiyeli
                </h3>
                <SeizureScoreBadge assets={debtor.assets} />
                <div className="flex flex-wrap gap-0.5 mt-0.5">
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
              <div>
                <h3 className="font-medium text-[11px] mb-0.5">Hızlı Not</h3>
                {isEditingNote ? (
                  <div className="space-y-1">
                    <textarea
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      maxLength={240}
                      rows={2}
                      className="w-full px-2 py-1.5 border rounded text-xs resize-none focus:ring-2 focus:ring-blue-500"
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
                    className="p-2 bg-yellow-50 rounded text-xs cursor-pointer hover:bg-yellow-100 transition-colors min-h-[40px]"
                  >
                    {debtor.quickNote || (
                      <span className="text-gray-400 italic">Not eklemek için tıklayın...</span>
                    )}
                  </div>
                )}
              </div>

              {/* Risk Flags */}
              {debtor.riskFlags.length > 0 && (
                <div>
                  <h3 className="font-medium text-[11px] text-red-600 mb-0.5">Risk Uyarıları</h3>
                  <div className="flex flex-wrap gap-0.5">
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
              )}

              {/* Research Tab Content */}
              {activeTab === 'research' && (
                <div className="p-2.5">
                  <AddressDiscoveryPanel
                    caseDebtorId={caseDebtorId}
                    debtorId={debtor.id}
                    debtorName={debtor.displayName}
                    caseId={caseId}
                    clientId={clientId}
                    clientEmail={clientEmail}
                    debtorType={debtor.personType === "LEGAL" ? "COMPANY" : "INDIVIDUAL"}
                    onAddressAdded={fetchDebtor}
                  />
                </div>
              )}

              {/* Assets Tab Content */}
              {activeTab === 'assets' && (
                <div className="p-2.5">
                  <AssetQueryPanel
                    caseDebtorId={caseDebtorId}
                    onRefresh={fetchDebtor}
                  />
                </div>
              )}
            </>
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

      {/* Edit Debtor Modal */}
      {isEditModalOpen && editDebtorData && (
        <NewDebtorModal
          initialType={editDebtorData.type as DebtorType}
          editDebtor={editDebtorData}
          onSave={handleDebtorSaved}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditDebtorData(null);
          }}
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

// Kesinleşme Geri Sayımı
function FinalizationCountdown({ deliveredAt }: { deliveredAt: string }) {
  const delivered = new Date(deliveredAt);
  const finalization = new Date(delivered);
  finalization.setDate(finalization.getDate() + 7); // İlamsız icra için 7 gün
  
  const now = new Date();
  const diffMs = finalization.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) {
    return (
      <div className="text-right">
        <div className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-bold">
          ✓ Kesinleşti
        </div>
        <div className="text-xs text-emerald-600 mt-1">
          {finalization.toLocaleDateString("tr-TR")}
        </div>
      </div>
    );
  }
  
  const urgencyColor = diffDays <= 2 ? "bg-red-500" : diffDays <= 5 ? "bg-amber-500" : "bg-blue-500";
  
  return (
    <div className="text-right">
      <div className={`px-3 py-1.5 ${urgencyColor} text-white rounded-lg text-sm font-bold`}>
        {diffDays} gün kaldı
      </div>
      <div className="text-xs text-slate-500 mt-1">
        Kesinleşme: {finalization.toLocaleDateString("tr-TR")}
      </div>
    </div>
  );
}

// Haciz Potansiyeli Skoru
function SeizureScoreBadge({ assets }: { assets: { vehicle: string; realEstate: string; bank: string; sgkWage: string } }) {
  let score = 0;
  if (assets.vehicle === "YES") score += 2;
  if (assets.realEstate === "YES") score += 3;
  if (assets.bank === "YES") score += 1;
  if (assets.sgkWage === "YES") score += 2;
  
  const maxScore = 8;
  const percentage = Math.round((score / maxScore) * 100);
  
  let level: "HIGH" | "MEDIUM" | "LOW";
  let color: string;
  let label: string;
  
  if (score >= 5) {
    level = "HIGH";
    color = "bg-emerald-100 text-emerald-700 border-emerald-300";
    label = "Yüksek Potansiyel";
  } else if (score >= 2) {
    level = "MEDIUM";
    color = "bg-amber-100 text-amber-700 border-amber-300";
    label = "Orta Potansiyel";
  } else {
    level = "LOW";
    color = "bg-red-100 text-red-700 border-red-300";
    label = "Düşük Potansiyel";
  }
  
  return (
    <div className={`px-3 py-2 rounded-lg border ${color}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-lg font-bold">{score}/{maxScore}</span>
      </div>
      <div className="mt-1 h-1.5 bg-white/50 rounded-full overflow-hidden">
        <div 
          className={`h-full ${level === "HIGH" ? "bg-emerald-500" : level === "MEDIUM" ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
