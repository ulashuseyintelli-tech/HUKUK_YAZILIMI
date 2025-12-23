"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Building2, Briefcase, Home, CreditCard, Plus, X, Send, Clock, CheckCircle,
  AlertTriangle, ChevronRight, Loader2, FileText, Users, MapPin,
  FolderOpen, Scale, Banknote, Edit2, Upload, Scan
} from "lucide-react";
import { api } from "@/lib/api";

// Üçüncü şahıs türleri
export enum ThirdPartyType {
  ISVEREN = "ISVEREN",
  BANKA = "BANKA",
  KIRACI = "KIRACI",
  BORC_ALACAKLI = "BORC_ALACAKLI",
  DIGER = "DIGER",
}

// Üçüncü şahıs türü etiketleri
const ThirdPartyTypeLabels: Record<ThirdPartyType, string> = {
  [ThirdPartyType.ISVEREN]: "İşveren",
  [ThirdPartyType.BANKA]: "Banka",
  [ThirdPartyType.KIRACI]: "Kiracı",
  [ThirdPartyType.BORC_ALACAKLI]: "Borç-Alacaklı",
  [ThirdPartyType.DIGER]: "Diğer",
};

// Üçüncü şahıs türü ikonları
const ThirdPartyTypeIcons: Record<ThirdPartyType, React.ElementType> = {
  [ThirdPartyType.ISVEREN]: Briefcase,
  [ThirdPartyType.BANKA]: Building2,
  [ThirdPartyType.KIRACI]: Home,
  [ThirdPartyType.BORC_ALACAKLI]: CreditCard,
  [ThirdPartyType.DIGER]: Users,
};

// İhbarname durumu
interface IhbarnameStatus {
  currentStage: "NONE" | "89_1" | "89_2" | "89_3" | "COMPLETED";
  currentStatus: string | null;
  nextAction: "SEND_89_1" | "SEND_89_2" | "SEND_89_3" | "WAIT_RESPONSE" | "COMPLETED" | null;
  daysRemaining: number | null;
  canProceed: boolean;
  message: string;
}

// Üçüncü şahıs
interface ThirdParty {
  id: string;
  type: ThirdPartyType;
  name: string;
  identityNo?: string;
  address?: string;
  city?: string;
  phone?: string;
  email?: string;
  kepAddress?: string;
  relationDesc?: string;
  ihbarname89_1_date?: string;
  ihbarname89_1_status?: string;
  ihbarname89_2_date?: string;
  ihbarname89_2_status?: string;
  ihbarname89_3_date?: string;
  ihbarname89_3_status?: string;
  responseDate?: string;
  responseContent?: string;
  ihbarnameStatus?: IhbarnameStatus;
}

// Dış dosya (borçlunun alacaklı olduğu dosya)
interface ExternalCase {
  id: string;
  externalOffice: string;
  externalCaseNo: string;
  counterpartyName: string;
  claimAmount: number;
  claimCurrency: string;
  attachmentStatus: "HACIZ_TALEP" | "HACIZ_KONDU" | "CEVAP_BEKLENIYOR" | "TAHSIL_BASLADI" | "KAPANDI";
  attachedAt?: string;
  receivedAmount?: number;
  notes?: string;
}

interface ThirdPartyPanelProps {
  caseDebtorId: string;
  debtorName: string;
  caseId?: string; // Belge oluşturma için gerekli
}

export function ThirdPartyPanel({ caseDebtorId, debtorName, caseId }: ThirdPartyPanelProps) {
  const [activeTab, setActiveTab] = useState<"89" | "dosya">("89");
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [externalCases, setExternalCases] = useState<ExternalCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddExternalCaseModal, setShowAddExternalCaseModal] = useState(false);
  const [sendingIhbarname, setSendingIhbarname] = useState<string | null>(null);
  const [ocrScanResult, setOcrScanResult] = useState<OcrExternalCaseResult | null>(null);
  const [showEditExternalCaseModal, setShowEditExternalCaseModal] = useState(false);
  const [editingExternalCase, setEditingExternalCase] = useState<ExternalCase | null>(null);
  const [showCollectionModal, setShowCollectionModal] = useState(false);
  const [collectionExternalCase, setCollectionExternalCase] = useState<ExternalCase | null>(null);

// OCR tarama sonucu tipi
interface OcrExternalCaseResult {
  externalOffice?: string;
  externalCaseNo?: string;
  counterpartyName?: string;
  claimAmount?: number;
  claimCurrency?: string;
  attachmentDate?: string;
  documentType?: string;
  confidence?: number;
}

  useEffect(() => {
    if (activeTab === "89") {
      loadThirdParties();
    } else {
      loadExternalCases();
    }
  }, [caseDebtorId, activeTab]);

  const loadThirdParties = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/case-debtors/${caseDebtorId}/third-parties/with-status`);
      setThirdParties(res.data || []);
    } catch (err) {
      console.error("Üçüncü şahıslar yüklenemedi:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadExternalCases = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/case-debtors/${caseDebtorId}/external-cases`);
      setExternalCases(res.data || []);
    } catch (err) {
      console.error("Dış dosyalar yüklenemedi:", err);
      // API henüz yoksa boş liste göster
      setExternalCases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendNextIhbarname = async (thirdPartyId: string) => {
    try {
      setSendingIhbarname(thirdPartyId);
      await api.post(`/third-parties/${thirdPartyId}/send-next`);
      await loadThirdParties();
    } catch (err: any) {
      alert(err.message || "İhbarname gönderilemedi");
    } finally {
      setSendingIhbarname(null);
    }
  };

  // PDF indirme yardımcı fonksiyonu
  const downloadPdf = async (endpoint: string, body: any, filename: string) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    
    const response = await fetch(`${apiUrl}/api${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || "Belge oluşturulamadı");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Alacak Haczi Talebi belgesi oluştur
  const handleGenerateAlacakHacziTalebi = async (ec: ExternalCase) => {
    if (!caseId) {
      alert("Belge oluşturmak için dosya detay sayfasından erişin.");
      return;
    }
    
    try {
      await downloadPdf(
        `/documents/case/${caseId}/alacak-haczi-talebi`,
        {
          externalOffice: ec.externalOffice,
          externalCaseNo: ec.externalCaseNo,
          counterpartyName: ec.counterpartyName,
          claimAmount: ec.claimAmount,
          claimCurrency: ec.claimCurrency,
        },
        `alacak-haczi-talebi-${ec.externalCaseNo.replace(/\//g, '-')}.pdf`
      );
    } catch (err: any) {
      alert(err.message || "Belge oluşturulamadı");
    }
  };

  // 89 İhbarname belgesi oluştur ve indir
  const handleGenerateIhbarname = async (tp: ThirdParty, stage: string) => {
    if (!caseId) {
      alert("Belge oluşturmak için dosya detay sayfasından erişin.");
      return;
    }

    const endpoint = stage === "89_1" ? "ihbarname-89-1" :
                     stage === "89_2" ? "ihbarname-89-2" :
                     stage === "89_3" ? "ihbarname-89-3" : null;
    
    if (!endpoint) {
      alert("Geçersiz ihbarname aşaması");
      return;
    }

    try {
      const body: any = {
        thirdPartyName: tp.name,
        thirdPartyAddress: tp.address || "",
        thirdPartyType: tp.type,
        relationDesc: tp.relationDesc,
      };

      if (stage === "89_2" || stage === "89_3") {
        body.ihbarname89_1_date = tp.ihbarname89_1_date;
      }
      if (stage === "89_3") {
        body.ihbarname89_2_date = tp.ihbarname89_2_date;
      }

      await downloadPdf(
        `/documents/case/${caseId}/${endpoint}`,
        body,
        `${stage.replace("_", "-")}-ihbarname-${tp.name.substring(0, 20)}.pdf`
      );
    } catch (err: any) {
      alert(err.message || "Belge oluşturulamadı");
    }
  };

  // Dış dosya sil
  const handleDeleteExternalCase = async (ec: ExternalCase) => {
    if (!confirm(`"${ec.externalCaseNo}" dosyasını silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      await api.delete(`/external-cases/${ec.id}`);
      loadExternalCases();
    } catch (err: any) {
      alert(err.response?.data?.message || err.message || "Dış dosya silinemedi");
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "NONE": return "bg-gray-100 text-gray-600";
      case "89_1": return "bg-blue-100 text-blue-700";
      case "89_2": return "bg-amber-100 text-amber-700";
      case "89_3": return "bg-orange-100 text-orange-700";
      case "COMPLETED": return "bg-emerald-100 text-emerald-700";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "NONE": return "Başlamadı";
      case "89_1": return "89/1";
      case "89_2": return "89/2";
      case "89_3": return "89/3";
      case "COMPLETED": return "Tamamlandı";
      default: return stage;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "HACIZ_TALEP": return "bg-blue-100 text-blue-700";
      case "HACIZ_KONDU": return "bg-amber-100 text-amber-700";
      case "CEVAP_BEKLENIYOR": return "bg-orange-100 text-orange-700";
      case "TAHSIL_BASLADI": return "bg-emerald-100 text-emerald-700";
      case "KAPANDI": return "bg-gray-100 text-gray-600";
      default: return "bg-gray-100 text-gray-600";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "HACIZ_TALEP": return "Haciz Talep Edildi";
      case "HACIZ_KONDU": return "Haciz Kondu";
      case "CEVAP_BEKLENIYOR": return "Cevap Bekleniyor";
      case "TAHSIL_BASLADI": return "Tahsil Başladı";
      case "KAPANDI": return "Kapandı";
      default: return status;
    }
  };

  return (
    <div className="border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Scale className="h-5 w-5 text-indigo-500" />
            Üçüncü Şahıslar & Alacak Haczi
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {debtorName} için haciz işlemleri
          </p>
        </div>
      </div>

      {/* Tab Seçimi */}
      <div className="flex border-b mb-4">
        <button
          type="button"
          onClick={() => setActiveTab("89")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "89"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Building2 className="h-4 w-4 inline mr-1.5" />
          89 İhbarname ({thirdParties.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("dosya")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "dosya"
              ? "border-indigo-500 text-indigo-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <FolderOpen className="h-4 w-4 inline mr-1.5" />
          Borçlunun Dosyaları ({externalCases.length})
        </button>
      </div>

      {/* Tab İçeriği: 89 İhbarname */}
      {activeTab === "89" && (
        <>
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Üçüncü Şahıs Ekle
            </button>
          </div>
          
          {loading ? (
        <div className="text-center py-8 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          Yükleniyor...
        </div>
      ) : thirdParties.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">Henüz üçüncü şahıs eklenmedi</p>
          <p className="text-xs text-muted-foreground mt-1">
            Banka, işveren veya kiracı ekleyerek 89 ihbarname sürecini başlatın
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {thirdParties.map((tp) => {
            const Icon = ThirdPartyTypeIcons[tp.type] || Users;
            const status = tp.ihbarnameStatus;
            
            return (
              <div key={tp.id} className="p-4 border rounded-lg hover:border-indigo-200 transition-colors">
                {/* Üst Kısım: Bilgiler */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <Icon className="h-5 w-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-medium">{tp.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span className="px-1.5 py-0.5 bg-gray-100 rounded">
                          {ThirdPartyTypeLabels[tp.type]}
                        </span>
                        {tp.identityNo && <span>{tp.identityNo}</span>}
                      </div>
                      {tp.address && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {tp.address}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Durum Badge */}
                  {status && (
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStageColor(status.currentStage)}`}>
                      {getStageLabel(status.currentStage)}
                    </span>
                  )}
                </div>

                {/* 89 İhbarname Timeline */}
                <div className="flex items-center gap-2 mb-3">
                  {/* 89/1 */}
                  <div className={`flex-1 p-2 rounded-lg text-center text-xs ${
                    tp.ihbarname89_1_date ? "bg-blue-100 text-blue-700" : "bg-gray-50 text-gray-400"
                  }`}>
                    <p className="font-medium">89/1</p>
                    {tp.ihbarname89_1_date && (
                      <p className="text-[10px] mt-0.5">
                        {new Date(tp.ihbarname89_1_date).toLocaleDateString("tr-TR")}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                  
                  {/* 89/2 */}
                  <div className={`flex-1 p-2 rounded-lg text-center text-xs ${
                    tp.ihbarname89_2_date ? "bg-amber-100 text-amber-700" : "bg-gray-50 text-gray-400"
                  }`}>
                    <p className="font-medium">89/2</p>
                    {tp.ihbarname89_2_date && (
                      <p className="text-[10px] mt-0.5">
                        {new Date(tp.ihbarname89_2_date).toLocaleDateString("tr-TR")}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                  
                  {/* 89/3 */}
                  <div className={`flex-1 p-2 rounded-lg text-center text-xs ${
                    tp.ihbarname89_3_date ? "bg-orange-100 text-orange-700" : "bg-gray-50 text-gray-400"
                  }`}>
                    <p className="font-medium">89/3</p>
                    {tp.ihbarname89_3_date && (
                      <p className="text-[10px] mt-0.5">
                        {new Date(tp.ihbarname89_3_date).toLocaleDateString("tr-TR")}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                  
                  {/* Cevap */}
                  <div className={`flex-1 p-2 rounded-lg text-center text-xs ${
                    tp.responseDate ? "bg-emerald-100 text-emerald-700" : "bg-gray-50 text-gray-400"
                  }`}>
                    <p className="font-medium">Cevap</p>
                    {tp.responseDate && (
                      <p className="text-[10px] mt-0.5">
                        {new Date(tp.responseDate).toLocaleDateString("tr-TR")}
                      </p>
                    )}
                  </div>
                </div>

                {/* Durum Mesajı ve Aksiyon */}
                {status && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      {status.nextAction === "WAIT_RESPONSE" ? (
                        <>
                          <Clock className="h-4 w-4 text-amber-500" />
                          <span className="text-amber-700">{status.message}</span>
                        </>
                      ) : status.currentStage === "COMPLETED" ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span className="text-emerald-700">{status.message}</span>
                        </>
                      ) : status.canProceed ? (
                        <>
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          <span className="text-orange-700">{status.message}</span>
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-600">{status.message}</span>
                        </>
                      )}
                    </div>
                    
                    {/* Belge Oluştur Butonu */}
                    {status.currentStage !== "NONE" && (
                      <button
                        type="button"
                        onClick={() => handleGenerateIhbarname(tp, status.currentStage)}
                        className="px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 flex items-center gap-1"
                      >
                        <FileText className="h-3 w-3" />
                        {status.currentStage} Belgesi
                      </button>
                    )}
                    
                    {status.canProceed && status.nextAction && status.nextAction !== "COMPLETED" && (
                      <button
                        type="button"
                        onClick={() => handleSendNextIhbarname(tp.id)}
                        disabled={sendingIhbarname === tp.id}
                        className="px-3 py-1.5 bg-indigo-500 text-white text-xs rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1"
                      >
                        {sendingIhbarname === tp.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3" />
                        )}
                        {status.nextAction === "SEND_89_1" && "89/1 Gönder"}
                        {status.nextAction === "SEND_89_2" && "89/2 Gönder"}
                        {status.nextAction === "SEND_89_3" && "89/3 Gönder"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* Tab İçeriği: Borçlunun Dosyaları (Alacak Haczi) */}
      {activeTab === "dosya" && (
        <>
          <div className="flex justify-end gap-2 mb-3">
            <ExternalCaseOcrScanner
              onScanComplete={(data) => {
                // OCR sonuçlarını modal'a aktar
                setOcrScanResult(data);
                setShowAddExternalCaseModal(true);
              }}
            />
            <button
              type="button"
              onClick={() => setShowAddExternalCaseModal(true)}
              className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 flex items-center gap-1"
            >
              <Plus className="h-4 w-4" /> Dış Dosya Ekle
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Yükleniyor...
            </div>
          ) : externalCases.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <FolderOpen className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Henüz dış dosya eklenmedi</p>
              <p className="text-xs text-muted-foreground mt-1">
                Borçlunun alacaklı olduğu icra dosyalarını ekleyerek alacak haczi uygulayın
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {externalCases.map((ec) => (
                <div key={ec.id} className="p-4 border rounded-lg hover:border-indigo-200 transition-colors">
                  {/* Üst Kısım: Dosya Bilgileri */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Scale className="h-5 w-5 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium">{ec.externalCaseNo}</p>
                        <p className="text-xs text-muted-foreground">{ec.externalOffice}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 bg-gray-100 rounded">
                            Karşı Borçlu: {ec.counterpartyName}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Durum Badge */}
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${getStatusColor(ec.attachmentStatus)}`}>
                      {getStatusLabel(ec.attachmentStatus)}
                    </span>
                  </div>

                  {/* Tutar Bilgileri */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="p-2 bg-gray-50 rounded-lg text-center">
                      <p className="text-xs text-gray-500">Alacak Tutarı</p>
                      <p className="font-semibold text-sm">
                        {ec.claimAmount.toLocaleString('tr-TR')} {ec.claimCurrency === "TRY" ? "₺" : ec.claimCurrency}
                      </p>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg text-center">
                      <p className="text-xs text-emerald-600">Tahsil Edilen</p>
                      <p className="font-semibold text-sm text-emerald-700">
                        {(ec.receivedAmount || 0).toLocaleString('tr-TR')} {ec.claimCurrency === "TRY" ? "₺" : ec.claimCurrency}
                      </p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-lg text-center">
                      <p className="text-xs text-amber-600">Kalan</p>
                      <p className="font-semibold text-sm text-amber-700">
                        {(ec.claimAmount - (ec.receivedAmount || 0)).toLocaleString('tr-TR')} {ec.claimCurrency === "TRY" ? "₺" : ec.claimCurrency}
                      </p>
                    </div>
                  </div>

                  {/* Haciz Tarihi ve Notlar */}
                  {(ec.attachedAt || ec.notes) && (
                    <div className="pt-2 border-t text-xs text-muted-foreground">
                      {ec.attachedAt && (
                        <span className="mr-3">
                          Haciz Tarihi: {new Date(ec.attachedAt).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                      {ec.notes && <span>{ec.notes}</span>}
                    </div>
                  )}

                  {/* Aksiyonlar */}
                  <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t">
                    {/* Alacak Haczi Talebi Belgesi */}
                    {ec.attachmentStatus === "HACIZ_TALEP" && (
                      <button
                        type="button"
                        onClick={() => handleGenerateAlacakHacziTalebi(ec)}
                        className="px-2 py-1 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded"
                      >
                        <FileText className="h-3 w-3 inline mr-1" /> Haciz Talebi
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingExternalCase(ec);
                        setShowEditExternalCaseModal(true);
                      }}
                      className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                    >
                      <Edit2 className="h-3 w-3 inline mr-1" /> Düzenle
                    </button>
                    {(ec.attachmentStatus === "TAHSIL_BASLADI" || ec.attachmentStatus === "HACIZ_KONDU") && (
                      <button
                        type="button"
                        onClick={() => {
                          setCollectionExternalCase(ec);
                          setShowCollectionModal(true);
                        }}
                        className="px-2 py-1 text-xs text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded"
                      >
                        <Banknote className="h-3 w-3 inline mr-1" /> Tahsilat Ekle
                      </button>
                    )}
                    {/* Silme butonu - sadece tahsilat yoksa */}
                    {(!ec.receivedAmount || ec.receivedAmount === 0) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExternalCase(ec)}
                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                      >
                        <X className="h-3 w-3 inline mr-1" /> Sil
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Yeni Üçüncü Şahıs Modal */}
      {showAddModal && (
        <AddThirdPartyModal
          caseDebtorId={caseDebtorId}
          onClose={() => setShowAddModal(false)}
          onSaved={() => {
            setShowAddModal(false);
            loadThirdParties();
          }}
        />
      )}

      {/* Yeni Dış Dosya Modal */}
      {showAddExternalCaseModal && (
        <AddExternalCaseModal
          caseDebtorId={caseDebtorId}
          initialData={ocrScanResult}
          onClose={() => {
            setShowAddExternalCaseModal(false);
            setOcrScanResult(null);
          }}
          onSaved={() => {
            setShowAddExternalCaseModal(false);
            setOcrScanResult(null);
            loadExternalCases();
          }}
        />
      )}

      {/* Dış Dosya Düzenleme Modal */}
      {showEditExternalCaseModal && editingExternalCase && (
        <EditExternalCaseModal
          externalCase={editingExternalCase}
          onClose={() => {
            setShowEditExternalCaseModal(false);
            setEditingExternalCase(null);
          }}
          onSaved={() => {
            setShowEditExternalCaseModal(false);
            setEditingExternalCase(null);
            loadExternalCases();
          }}
        />
      )}

      {/* Tahsilat Ekleme Modal */}
      {showCollectionModal && collectionExternalCase && (
        <AddCollectionModal
          externalCase={collectionExternalCase}
          onClose={() => {
            setShowCollectionModal(false);
            setCollectionExternalCase(null);
          }}
          onSaved={() => {
            setShowCollectionModal(false);
            setCollectionExternalCase(null);
            loadExternalCases();
          }}
        />
      )}
    </div>
  );
}


// Yeni Üçüncü Şahıs Ekleme Modal
interface AddThirdPartyModalProps {
  caseDebtorId: string;
  onClose: () => void;
  onSaved: () => void;
}

function AddThirdPartyModal({ caseDebtorId, onClose, onSaved }: AddThirdPartyModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    type: ThirdPartyType.BANKA,
    name: "",
    identityNo: "",
    address: "",
    city: "",
    phone: "",
    email: "",
    kepAddress: "",
    relationDesc: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      alert("Lütfen üçüncü şahıs adını girin");
      return;
    }

    try {
      setSaving(true);
      await api.post(`/case-debtors/${caseDebtorId}/third-parties`, formData);
      onSaved();
    } catch (err: any) {
      alert(err.message || "Üçüncü şahıs eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-lg">Yeni Üçüncü Şahıs Ekle</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Tür Seçimi */}
          <div>
            <label className="block text-sm font-medium mb-2">Üçüncü Şahıs Türü</label>
            <div className="grid grid-cols-5 gap-2">
              {Object.entries(ThirdPartyTypeLabels).map(([type, label]) => {
                const Icon = ThirdPartyTypeIcons[type as ThirdPartyType];
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: type as ThirdPartyType })}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      formData.type === type
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-5 w-5 mx-auto mb-1" />
                    <span className="text-xs">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Ad/Ünvan */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {formData.type === ThirdPartyType.BANKA ? "Banka Adı" :
               formData.type === ThirdPartyType.ISVEREN ? "İşveren Adı/Ünvanı" :
               formData.type === ThirdPartyType.KIRACI ? "Kiracı Adı" : "Ad/Ünvan"} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder={formData.type === ThirdPartyType.BANKA ? "Örn: Türkiye İş Bankası A.Ş." : ""}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* VKN/TCKN */}
          <div>
            <label className="block text-sm font-medium mb-1">VKN / TCKN</label>
            <input
              type="text"
              value={formData.identityNo}
              onChange={(e) => setFormData({ ...formData, identityNo: e.target.value })}
              placeholder="Vergi veya TC Kimlik No"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Adres */}
          <div>
            <label className="block text-sm font-medium mb-1">Adres</label>
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Tebligat adresi"
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* İl */}
          <div>
            <label className="block text-sm font-medium mb-1">İl</label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
              placeholder="İl"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* İletişim */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Telefon</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0XXX XXX XX XX"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">E-posta</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="email@ornek.com"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* KEP Adresi */}
          <div>
            <label className="block text-sm font-medium mb-1">KEP Adresi</label>
            <input
              type="text"
              value={formData.kepAddress}
              onChange={(e) => setFormData({ ...formData, kepAddress: e.target.value })}
              placeholder="kep@hs01.kep.tr"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* İlişki Açıklaması */}
          <div>
            <label className="block text-sm font-medium mb-1">İlişki Açıklaması</label>
            <input
              type="text"
              value={formData.relationDesc}
              onChange={(e) => setFormData({ ...formData, relationDesc: e.target.value })}
              placeholder={formData.type === ThirdPartyType.ISVEREN ? "Borçlunun işvereni" : 
                          formData.type === ThirdPartyType.BANKA ? "Borçlunun hesabının bulunduğu banka" : ""}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Ekle
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// OCR ile Dış Dosya Tarama Bileşeni
interface ExternalCaseOcrScannerProps {
  onScanComplete: (data: OcrExternalCaseResult) => void;
}

interface OcrExternalCaseResult {
  externalOffice?: string;
  externalCaseNo?: string;
  counterpartyName?: string;
  claimAmount?: number;
  claimCurrency?: string;
  attachmentDate?: string;
  documentType?: string;
  confidence?: number;
}

function ExternalCaseOcrScanner({ onScanComplete }: ExternalCaseOcrScannerProps) {
  const [scanning, setScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScanning(true);
      
      const formData = new FormData();
      formData.append("file", file);

      const res = await api.post("/ocr/scan-external-case", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.success && res.data?.data) {
        const data = res.data.data;
        onScanComplete({
          externalOffice: data.externalOffice,
          externalCaseNo: data.externalCaseNo,
          counterpartyName: data.counterpartyName,
          claimAmount: data.claimAmount,
          claimCurrency: data.claimCurrency || "TRY",
          attachmentDate: data.attachmentDate,
          documentType: data.documentType,
          confidence: data.confidence,
        });
      } else {
        alert("Belgeden bilgi çıkarılamadı. Lütfen manuel olarak girin.");
      }
    } catch (err: any) {
      console.error("OCR hatası:", err);
      alert(err.response?.data?.message || "Belge taranamadı");
    } finally {
      setScanning(false);
      // Input'u temizle
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx"
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={scanning}
        className="px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
      >
        {scanning ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Taranıyor...
          </>
        ) : (
          <>
            <Scan className="h-4 w-4" />
            Belge Tara
          </>
        )}
      </button>
    </>
  );
}


// Yeni Dış Dosya (Alacak Haczi) Ekleme Modal
interface AddExternalCaseModalProps {
  caseDebtorId: string;
  initialData?: OcrExternalCaseResult | null;
  onClose: () => void;
  onSaved: () => void;
}

function AddExternalCaseModal({ caseDebtorId, initialData, onClose, onSaved }: AddExternalCaseModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    externalOffice: initialData?.externalOffice || "",
    externalCaseNo: initialData?.externalCaseNo || "",
    counterpartyName: initialData?.counterpartyName || "",
    claimAmount: initialData?.claimAmount?.toString() || "",
    claimCurrency: initialData?.claimCurrency || "TRY",
    attachmentStatus: "HACIZ_TALEP" as "HACIZ_TALEP" | "HACIZ_KONDU" | "CEVAP_BEKLENIYOR" | "TAHSIL_BASLADI" | "KAPANDI",
    attachedAt: initialData?.attachmentDate || "",
    notes: "",
  });
  
  // OCR'dan gelen veri varsa bilgi göster
  const hasOcrData = initialData && initialData.confidence;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.externalOffice.trim() || !formData.externalCaseNo.trim()) {
      alert("Lütfen icra dairesi ve dosya numarasını girin");
      return;
    }

    if (!formData.counterpartyName.trim()) {
      alert("Lütfen karşı borçlu adını girin");
      return;
    }

    try {
      setSaving(true);
      await api.post(`/case-debtors/${caseDebtorId}/external-cases`, {
        ...formData,
        claimAmount: parseFloat(formData.claimAmount) || 0,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || "Dış dosya eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Dış Dosya Ekle (Alacak Haczi)</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Borçlunun alacaklı olduğu icra dosyasını ekleyin
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        {/* OCR Bilgisi */}
        {hasOcrData && (
          <div className="mx-4 mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-purple-700">
              <Scan className="h-4 w-4" />
              <span className="font-medium">Belgeden Otomatik Tespit Edildi</span>
              <span className="text-xs bg-purple-200 px-1.5 py-0.5 rounded">
                %{initialData.confidence} güven
              </span>
            </div>
            <p className="text-xs text-purple-600 mt-1">
              Belge türü: {initialData.documentType || "Bilinmiyor"} - Lütfen bilgileri kontrol edin
            </p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* İcra Dairesi */}
          <div>
            <label className="block text-sm font-medium mb-1">İcra Dairesi *</label>
            <input
              type="text"
              value={formData.externalOffice}
              onChange={(e) => setFormData({ ...formData, externalOffice: e.target.value })}
              placeholder="Örn: İstanbul 5. İcra Dairesi"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Dosya Numarası */}
          <div>
            <label className="block text-sm font-medium mb-1">Dosya Numarası *</label>
            <input
              type="text"
              value={formData.externalCaseNo}
              onChange={(e) => setFormData({ ...formData, externalCaseNo: e.target.value })}
              placeholder="Örn: 2024/12345"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          {/* Karşı Borçlu */}
          <div>
            <label className="block text-sm font-medium mb-1">Karşı Borçlu (Dosyadaki Borçlu) *</label>
            <input
              type="text"
              value={formData.counterpartyName}
              onChange={(e) => setFormData({ ...formData, counterpartyName: e.target.value })}
              placeholder="Borçlunun alacaklı olduğu kişi/kurum"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              required
            />
            <p className="text-xs text-muted-foreground mt-1">
              Bu dosyada borçlumuz alacaklı konumunda, karşı borçlu ise bu kişi/kurumdur
            </p>
          </div>

          {/* Alacak Tutarı ve Para Birimi */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Alacak Tutarı</label>
              <input
                type="number"
                value={formData.claimAmount}
                onChange={(e) => setFormData({ ...formData, claimAmount: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Para Birimi</label>
              <select
                value={formData.claimCurrency}
                onChange={(e) => setFormData({ ...formData, claimCurrency: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          {/* Haciz Durumu */}
          <div>
            <label className="block text-sm font-medium mb-1">Haciz Durumu</label>
            <select
              value={formData.attachmentStatus}
              onChange={(e) => setFormData({ ...formData, attachmentStatus: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="HACIZ_TALEP">Haciz Talep Edildi</option>
              <option value="HACIZ_KONDU">Haciz Kondu</option>
              <option value="CEVAP_BEKLENIYOR">Cevap Bekleniyor</option>
              <option value="TAHSIL_BASLADI">Tahsil Başladı</option>
              <option value="KAPANDI">Kapandı</option>
            </select>
          </div>

          {/* Haciz Tarihi */}
          <div>
            <label className="block text-sm font-medium mb-1">Haciz Tarihi</label>
            <input
              type="date"
              value={formData.attachedAt}
              onChange={(e) => setFormData({ ...formData, attachedAt: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ek bilgiler, sıra, rüçhan notları..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Ekle
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Dış Dosya Düzenleme Modal
interface EditExternalCaseModalProps {
  externalCase: ExternalCase;
  onClose: () => void;
  onSaved: () => void;
}

function EditExternalCaseModal({ externalCase, onClose, onSaved }: EditExternalCaseModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    externalOffice: externalCase.externalOffice,
    externalCaseNo: externalCase.externalCaseNo,
    counterpartyName: externalCase.counterpartyName,
    claimAmount: externalCase.claimAmount.toString(),
    claimCurrency: externalCase.claimCurrency,
    attachmentStatus: externalCase.attachmentStatus,
    attachedAt: externalCase.attachedAt || "",
    notes: externalCase.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      await api.put(`/external-cases/${externalCase.id}`, {
        ...formData,
        claimAmount: parseFloat(formData.claimAmount) || 0,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || "Dış dosya güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Dış Dosya Düzenle</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {externalCase.externalCaseNo}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* İcra Dairesi */}
          <div>
            <label className="block text-sm font-medium mb-1">İcra Dairesi</label>
            <input
              type="text"
              value={formData.externalOffice}
              onChange={(e) => setFormData({ ...formData, externalOffice: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Dosya Numarası */}
          <div>
            <label className="block text-sm font-medium mb-1">Dosya Numarası</label>
            <input
              type="text"
              value={formData.externalCaseNo}
              onChange={(e) => setFormData({ ...formData, externalCaseNo: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Karşı Borçlu */}
          <div>
            <label className="block text-sm font-medium mb-1">Karşı Borçlu</label>
            <input
              type="text"
              value={formData.counterpartyName}
              onChange={(e) => setFormData({ ...formData, counterpartyName: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Alacak Tutarı */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Alacak Tutarı</label>
              <input
                type="number"
                value={formData.claimAmount}
                onChange={(e) => setFormData({ ...formData, claimAmount: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Para Birimi</label>
              <select
                value={formData.claimCurrency}
                onChange={(e) => setFormData({ ...formData, claimCurrency: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
              >
                <option value="TRY">TRY (₺)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>

          {/* Haciz Durumu */}
          <div>
            <label className="block text-sm font-medium mb-1">Haciz Durumu</label>
            <select
              value={formData.attachmentStatus}
              onChange={(e) => setFormData({ ...formData, attachmentStatus: e.target.value as any })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            >
              <option value="HACIZ_TALEP">Haciz Talep Edildi</option>
              <option value="HACIZ_KONDU">Haciz Kondu</option>
              <option value="CEVAP_BEKLENIYOR">Cevap Bekleniyor</option>
              <option value="TAHSIL_BASLADI">Tahsil Başladı</option>
              <option value="KAPANDI">Kapandı</option>
            </select>
          </div>

          {/* Haciz Tarihi */}
          <div>
            <label className="block text-sm font-medium mb-1">Haciz Tarihi</label>
            <input
              type="date"
              value={formData.attachedAt}
              onChange={(e) => setFormData({ ...formData, attachedAt: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                "Kaydet"
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


// Tahsilat Ekleme Modal
interface AddCollectionModalProps {
  externalCase: ExternalCase;
  onClose: () => void;
  onSaved: () => void;
}

function AddCollectionModal({ externalCase, onClose, onSaved }: AddCollectionModalProps) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  const remainingAmount = externalCase.claimAmount - (externalCase.receivedAmount || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      alert("Lütfen geçerli bir tutar girin");
      return;
    }

    if (amount > remainingAmount) {
      alert(`Tahsilat tutarı kalan tutardan (${remainingAmount.toLocaleString('tr-TR')} ${externalCase.claimCurrency}) fazla olamaz`);
      return;
    }

    try {
      setSaving(true);
      await api.post(`/external-cases/${externalCase.id}/collection`, {
        amount,
        date: formData.date,
        notes: formData.notes,
      });
      onSaved();
    } catch (err: any) {
      alert(err.message || "Tahsilat eklenemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-lg">Tahsilat Ekle</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {externalCase.externalCaseNo} - {externalCase.counterpartyName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Özet */}
        <div className="p-4 bg-gray-50 border-b">
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <p className="text-gray-500">Toplam Alacak</p>
              <p className="font-semibold">
                {externalCase.claimAmount.toLocaleString('tr-TR')} {externalCase.claimCurrency === "TRY" ? "₺" : externalCase.claimCurrency}
              </p>
            </div>
            <div>
              <p className="text-emerald-600">Tahsil Edilen</p>
              <p className="font-semibold text-emerald-700">
                {(externalCase.receivedAmount || 0).toLocaleString('tr-TR')} {externalCase.claimCurrency === "TRY" ? "₺" : externalCase.claimCurrency}
              </p>
            </div>
            <div>
              <p className="text-amber-600">Kalan</p>
              <p className="font-semibold text-amber-700">
                {remainingAmount.toLocaleString('tr-TR')} {externalCase.claimCurrency === "TRY" ? "₺" : externalCase.claimCurrency}
              </p>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Tutar */}
          <div>
            <label className="block text-sm font-medium mb-1">Tahsilat Tutarı *</label>
            <div className="relative">
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0.00"
                className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 pr-12"
                required
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                {externalCase.claimCurrency === "TRY" ? "₺" : externalCase.claimCurrency}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, amount: remainingAmount.toString() })}
              className="text-xs text-indigo-600 hover:text-indigo-800 mt-1"
            >
              Tamamını tahsil et ({remainingAmount.toLocaleString('tr-TR')})
            </button>
          </div>

          {/* Tarih */}
          <div>
            <label className="block text-sm font-medium mb-1">Tahsilat Tarihi</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Notlar */}
          <div>
            <label className="block text-sm font-medium mb-1">Notlar</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Tahsilat açıklaması..."
              rows={2}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Butonlar */}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Kaydediliyor...
                </>
              ) : (
                <>
                  <Banknote className="h-4 w-4" />
                  Tahsilat Ekle
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
