"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Search, Users, Building2, Landmark, X, AlertCircle,
  ScanLine, Sparkles, Upload, FileText, Loader2, CheckCircle,
  AlertTriangle, Scroll, FileCheck
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Debtor, CaseDebtor, DebtorType, DebtorRole, NotificationMode,
  TebligatLegalMethod, TebligatDeliveryType,
} from "@/types/debtor";
import { NewDebtorModal } from "./NewDebtorModal";
import { SelectedDebtorCard } from "./SelectedDebtorCard";
import {
  Instrument,
  ReviewRow,
  decideScanAccept,
  acceptButtonLabel,
  isAcceptDisabled,
  shouldShowInstrumentTable,
  buildInitialReviewRows,
} from "./ocr-instrument";
import { InstrumentReviewTable } from "./InstrumentReviewTable";

// Borç evrakı tarama sonucu tipi
interface DebtDocumentResult {
  documentType: "FATURA" | "SENET" | "CEK" | "KIRA" | "CARI_HESAP" | "SOZLESME" | "DIGER";
  parties: {
    name: string;
    type: "INDIVIDUAL" | "COMPANY" | "PUBLIC_INSTITUTION";
    role: "BORCLU" | "ALACAKLI" | "KEFIL" | "CIRANTA" | "AVAL" | "MUTESELSIL";
    identityNo?: string;
    address?: string;
    city?: string;
    district?: string;
    phone?: string;
    confidence: number;
  }[];
  debtInfo: {
    amount?: number;
    currency: "TRY" | "USD" | "EUR" | "GBP" | "CHF";
    dueDate?: string;
    issueDate?: string;
    documentNo?: string;
    description?: string;
  };
  bankInfo?: {
    bankName?: string;
    branchName?: string;
    accountNo?: string;
    iban?: string;
  };
  suggestedCaseType: "ILAMLI" | "ILAMSIZ" | "KAMBIYO" | "KIRA";
  confidence: number;
  rawText?: string;
  matchedKeywords?: string[];
  // PR-3a: çoklu borç enstrümanı (backend instruments[]). PR-3b review tablosu kullanacak.
  instruments?: Instrument[];
}

// Rol etiketleri
const RoleLabels: Record<string, string> = {
  BORCLU: "Borçlu",
  ALACAKLI: "Alacaklı",
  KEFIL: "Kefil",
  CIRANTA: "Ciranta",
  AVAL: "Aval",
  MUTESELSIL: "Müteselsil Borçlu",
};

// Evrak türü etiketleri
const DocumentTypeLabels: Record<string, string> = {
  FATURA: "Fatura",
  SENET: "Senet / Bono",
  CEK: "Çek",
  KIRA: "Kira Sözleşmesi",
  CARI_HESAP: "Cari Hesap Ekstresi",
  SOZLESME: "Sözleşme",
  DIGER: "Diğer",
};

interface DebtorStepProps {
  selectedDebtors: CaseDebtor[];
  onDebtorsChange: (debtors: CaseDebtor[]) => void;
  onDebtInfoDetected?: (debtInfo: DebtDocumentResult["debtInfo"]) => void;
  onInstrumentsDetected?: (instruments: Instrument[]) => void;
}

export function DebtorStep({ selectedDebtors, onDebtorsChange, onDebtInfoDetected, onInstrumentsDetected }: DebtorStepProps) {
  const [existingDebtors, setExistingDebtors] = useState<Debtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<DebtorType | "ALL">("ALL");
  const [showNewDebtorModal, setShowNewDebtorModal] = useState(false);
  const [newDebtorType, setNewDebtorType] = useState<DebtorType>(DebtorType.INDIVIDUAL);
  const [editingDebtor, setEditingDebtor] = useState<Debtor | null>(null);
  
  // Sihirbaz state'leri
  const [showWizard, setShowWizard] = useState(false);
  const [wizardScanning, setWizardScanning] = useState(false);
  const [wizardResult, setWizardResult] = useState<DebtDocumentResult | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [wizardError, setWizardError] = useState<string | null>(null);

  // PR-3b/N1: çoklu enstrüman (>1) varsa review satırlarını hazırla
  // (needsReview=true → default SEÇİLİ DEĞİL). ≤1 → boş.
  useEffect(() => {
    if (shouldShowInstrumentTable(wizardResult?.instruments)) {
      setReviewRows(buildInitialReviewRows(wizardResult!.instruments!));
    } else {
      setReviewRows([]);
    }
  }, [wizardResult]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDebtors();
  }, []);

  const loadDebtors = async () => {
    try {
      setLoading(true);
      const res = await api.get("/debtors?limit=500");
      setExistingDebtors(res.data?.data || res.data || []);
    } catch (err: any) {
      console.error("Borçlular yüklenemedi:", err?.message || err);
      // Hata durumunda boş liste göster
      setExistingDebtors([]);
    } finally {
      setLoading(false);
    }
  };

  const filteredDebtors = existingDebtors.filter((d) => {
    const matchesSearch = !searchTerm || 
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.identityNo?.includes(searchTerm) ||
      d.phone?.includes(searchTerm);
    const matchesType = typeFilter === "ALL" || d.type === typeFilter;
    const notSelected = !selectedDebtors.find((sd) => sd.debtorId === d.id);
    return matchesSearch && matchesType && notSelected;
  });


  const addDebtorToCase = (debtor: Debtor) => {
    const primaryAddress = debtor.debtorAddresses?.find((a) => a.isPrimary);
    
    // Elektronik tebligat zorunlu mu?
    const isElectronicRequired = 
      debtor.type === DebtorType.COMPANY || 
      debtor.type === DebtorType.PUBLIC_INSTITUTION || 
      !!debtor.kepAddress;
    
    const defaultLegalMethod = isElectronicRequired 
      ? TebligatLegalMethod.ELECTRONIC 
      : TebligatLegalMethod.POSTAL;
    
    const newCaseDebtor: CaseDebtor = {
      debtorId: debtor.id,
      debtor,
      role: DebtorRole.ASIL_BORCLU,
      notificationMode: debtor.kepAddress ? NotificationMode.KEP : NotificationMode.NORMAL,
      tebligatLegalMethod: defaultLegalMethod,
      tebligatDeliveryType: defaultLegalMethod === TebligatLegalMethod.POSTAL ? TebligatDeliveryType.NORMAL : undefined,
      isElectronicRequired,
      selectedAddressId: primaryAddress?.id,
      selectedAddress: primaryAddress,
      prepareNotification: true,
      isNew: false,
    };
    onDebtorsChange([...selectedDebtors, newCaseDebtor]);
  };

  const updateCaseDebtor = (index: number, updates: Partial<CaseDebtor>) => {
    const updated = [...selectedDebtors];
    updated[index] = { ...updated[index], ...updates };
    onDebtorsChange(updated);
  };

  const removeCaseDebtor = (index: number) => {
    onDebtorsChange(selectedDebtors.filter((_, i) => i !== index));
  };



  const openNewDebtorModal = (type: DebtorType) => {
    setNewDebtorType(type);
    setEditingDebtor(null);
    setShowNewDebtorModal(true);
  };

  const openEditDebtorModal = (debtor: Debtor) => {
    setNewDebtorType(debtor.type);
    setEditingDebtor(debtor);
    setShowNewDebtorModal(true);
  };

  const handleDebtorSaved = async (debtor: Debtor) => {
    await loadDebtors();
    // Eğer düzenleme modundaysa ve bu borçlu seçili borçlulardaysa güncelle
    if (editingDebtor) {
      const idx = selectedDebtors.findIndex(sd => sd.debtorId === debtor.id);
      if (idx >= 0) {
        const updated = [...selectedDebtors];
        updated[idx] = { ...updated[idx], debtor };
        onDebtorsChange(updated);
      }
    } else {
      addDebtorToCase(debtor);
    }
    setShowNewDebtorModal(false);
    setEditingDebtor(null);
  };

  // PR-D: Kimliksiz benzer-isim review'unda "Bunu kullan" → yeni kayıt AÇMA, mevcut borçluyu dosyaya ekle.
  const handleUseExistingDebtor = async (candidate: { id: string; name: string }) => {
    // Zaten bu dosyaya eklenmişse tekrar ekleme (addDebtorToCase mükerrer korumasız).
    if (selectedDebtors.some((sd) => sd.debtorId === candidate.id)) {
      setShowNewDebtorModal(false);
      setEditingDebtor(null);
      return;
    }
    let existing = existingDebtors.find((d) => d.id === candidate.id);
    if (!existing) {
      // Liste 500 ile sınırlı; aday listede yoksa id ile çek.
      try {
        const res = await api.get(`/debtors/${candidate.id}`);
        existing = res.data?.data || res.data;
      } catch (err: any) {
        console.error("Mevcut borçlu yüklenemedi:", err?.message || err);
      }
    }
    if (existing) addDebtorToCase(existing);
    setShowNewDebtorModal(false);
    setEditingDebtor(null);
  };

  // Sihirbaz: Dosya seçimi
  const handleWizardFileSelect = (file: File) => {
    const lowerName = file.name.toLowerCase();
    const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png", ".tiff", ".tif", ".doc", ".docx"];
    const isAllowed = allowedExtensions.some(ext => lowerName.endsWith(ext));
    
    if (!isAllowed) {
      setWizardError("Desteklenmeyen dosya formatı. PDF, Word, JPG, PNG veya TIFF yükleyin.");
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setWizardError("Dosya boyutu 10MB'dan büyük olamaz.");
      return;
    }
    
    setSelectedFile(file);
    setWizardError(null);
  };

  // Sihirbaz: Dosya tarama
  const handleWizardScan = async () => {
    if (!selectedFile) return;
    
    setWizardScanning(true);
    setWizardError(null);
    
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      
      const token = localStorage.getItem("token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/ocr/scan-debt-document`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Belge taranamadı");
      }
      
      const data = await response.json();
      setWizardResult(data.data || data);
    } catch (err: any) {
      setWizardError(err.message || "Belge taranırken bir hata oluştu");
    } finally {
      setWizardScanning(false);
    }
  };

  // Sihirbaz: Parti kabul et (borçlu olarak ekle)
  const handleAcceptParty = async (party: DebtDocumentResult["parties"][0]) => {
    // Önce borçlu rehberine kaydet
    try {
      const debtorData = {
        name: party.name,
        type: party.type === "INDIVIDUAL" ? DebtorType.INDIVIDUAL : 
              party.type === "COMPANY" ? DebtorType.COMPANY : DebtorType.PUBLIC_INSTITUTION,
        identityNo: party.identityNo,
        phone: party.phone,
        addresses: party.address ? [{
          type: "WORK",
          fullAddress: party.address,
          city: party.city,
          district: party.district,
          isPrimary: true,
        }] : [],
      };
      
      const response = await api.post("/debtors", debtorData);
      const savedDebtor = response.data?.data || response.data;
      
      // Dosyaya ekle
      const role = party.role === "BORCLU" ? DebtorRole.ASIL_BORCLU :
                   party.role === "KEFIL" ? DebtorRole.MUTESELSIL_KEFIL :
                   party.role === "CIRANTA" ? DebtorRole.CIRANTA :
                   party.role === "AVAL" ? DebtorRole.AVAL :
                   party.role === "MUTESELSIL" ? DebtorRole.MUSETEREK_BORCLU :
                   DebtorRole.ASIL_BORCLU;
      
      // Elektronik tebligat zorunlu mu?
      const isElectronicRequired = 
        savedDebtor.type === DebtorType.COMPANY || 
        savedDebtor.type === DebtorType.PUBLIC_INSTITUTION || 
        !!savedDebtor.kepAddress;
      
      const defaultLegalMethod = isElectronicRequired 
        ? TebligatLegalMethod.ELECTRONIC 
        : TebligatLegalMethod.POSTAL;
      
      const newCaseDebtor: CaseDebtor = {
        debtorId: savedDebtor.id,
        debtor: savedDebtor,
        role,
        notificationMode: NotificationMode.NORMAL,
        tebligatLegalMethod: defaultLegalMethod,
        tebligatDeliveryType: defaultLegalMethod === TebligatLegalMethod.POSTAL ? TebligatDeliveryType.NORMAL : undefined,
        isElectronicRequired,
        prepareNotification: true,
        isNew: false,
      };
      
      onDebtorsChange([...selectedDebtors, newCaseDebtor]);
      
      // Borçlu listesini yenile
      await loadDebtors();
    } catch (err: any) {
      setWizardError(`Borçlu kaydedilemedi: ${err.message}`);
    }
  };

  // Sihirbaz: Tüm borçluları kabul et
  const handleAcceptAllDebtors = async () => {
    if (!wizardResult) return;
    
    const debtorParties = wizardResult.parties.filter(p => 
      p.role === "BORCLU" || p.role === "KEFIL" || p.role === "CIRANTA" || 
      p.role === "AVAL" || p.role === "MUTESELSIL"
    );
    
    for (const party of debtorParties) {
      await handleAcceptParty(party);
    }
    
    // PR-3b: çoklu enstrüman (>1) → YALNIZ onInstrumentsDetected (seçili); aksi → YALNIZ
    // eski onDebtInfoDetected. Çift-ekleme (N due + primary tek due) önlenir.
    const decision = decideScanAccept(
      wizardResult.instruments,
      reviewRows.filter((r) => r.selected).map((r) => r.instrument),
    );
    if (decision.mode === "instruments") {
      onInstrumentsDetected?.(decision.instruments);
    } else if (onDebtInfoDetected && wizardResult.debtInfo) {
      onDebtInfoDetected(wizardResult.debtInfo);
    }
    
    // Sihirbazı kapat
    setWizardResult(null);
    setSelectedFile(null);
    setShowWizard(false);
  };

  // Sihirbaz: Sıfırla
  const resetWizard = () => {
    setWizardResult(null);
    setSelectedFile(null);
    setWizardError(null);
  };

  // Drag & Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleWizardFileSelect(file);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 🧠 Akıllı Borçlu Sihirbazı - Kompakt Üst Panel */}
      {!showWizard && !wizardResult && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-lg p-2 mb-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-amber-900 text-xs">🧠 Akıllı Borçlu Sihirbazı</h3>
                <p className="text-[10px] text-amber-700">
                  Borç evrakını yükleyin, borçluyu otomatik tespit edelim
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="px-2 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm flex items-center gap-1 text-xs"
            >
              <ScanLine className="h-3 w-3" />
              Evrak Tara
            </button>
          </div>
        </div>
      )}

      {/* Sihirbaz Açık */}
      {showWizard && !wizardResult && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-lg p-2 mb-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-600" />
              <span className="font-medium text-amber-900 text-sm">Borç Evrakı Tara</span>
            </div>
            <button
              type="button"
              onClick={() => { setShowWizard(false); resetWizard(); }}
              className="p-1 hover:bg-amber-100 rounded"
            >
              <X className="h-4 w-4 text-amber-600" />
            </button>
          </div>
          {/* Dosya Yükleme Alanı - Kompakt */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded p-2 text-center cursor-pointer transition-all ${
              isDragging 
                ? "border-amber-500 bg-amber-100" 
                : "border-amber-300 hover:border-amber-500 hover:bg-amber-50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx"
              onChange={(e) => e.target.files?.[0] && handleWizardFileSelect(e.target.files[0])}
              className="hidden"
            />
            <div className="flex items-center justify-center gap-2">
              <Upload className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-amber-800">
                {isDragging ? "Bırakın" : "Dosya sürükleyin veya tıklayın"}
              </span>
            </div>
          </div>

          {/* Seçilen Dosya ve Aksiyon */}
          {selectedFile && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 p-1.5 bg-amber-50 border border-amber-200 rounded flex items-center gap-1">
                <FileText className="h-3 w-3 text-amber-600" />
                <span className="text-xs text-amber-800 truncate">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="p-0.5 hover:bg-amber-100 rounded ml-auto"
                >
                  <X className="h-3 w-3 text-amber-600" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleWizardScan}
                disabled={wizardScanning}
                className="px-2 py-1 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 flex items-center gap-1 text-xs"
              >
                {wizardScanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Tara
              </button>
            </div>
          )}

          {wizardError && (
            <div className="mt-2 p-1.5 bg-red-50 border border-red-200 rounded flex items-center gap-1 text-red-700 text-[10px]">
              <AlertTriangle className="h-3 w-3" />
              {wizardError}
            </div>
          )}
        </div>
      )}

      {/* Sihirbaz Sonuçları - Kompakt */}
      {wizardResult && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-lg p-2 mb-2 flex-shrink-0 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-900">
                {DocumentTypeLabels[wizardResult.documentType] || wizardResult.documentType}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                wizardResult.confidence >= 70 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                %{wizardResult.confidence}
              </span>
            </div>
            <button type="button" onClick={() => { setShowWizard(false); resetWizard(); }} className="p-1 hover:bg-amber-100 rounded">
              <X className="h-4 w-4 text-amber-600" />
            </button>
          </div>

          {wizardResult.parties.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {wizardResult.parties.map((party, index) => (
                <div key={index} className="px-2 py-1 bg-white rounded border border-amber-200 flex items-center gap-1 text-xs">
                  <span className="font-medium">{party.name}</span>
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    party.role === "BORCLU" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {RoleLabels[party.role]}
                  </span>
                  {(party.role === "BORCLU" || party.role === "KEFIL" || party.role === "CIRANTA" || 
                    party.role === "AVAL" || party.role === "MUTESELSIL") && (
                    <button
                      type="button"
                      onClick={() => handleAcceptParty(party)}
                      className="px-1 py-0.5 bg-emerald-500 text-white text-[10px] rounded hover:bg-emerald-600"
                    >
                      Ekle
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {shouldShowInstrumentTable(wizardResult.instruments) && (
            <InstrumentReviewTable rows={reviewRows} onChange={setReviewRows} />
          )}

          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleAcceptAllDebtors}
              disabled={isAcceptDisabled(
                shouldShowInstrumentTable(wizardResult.instruments),
                reviewRows.filter((r) => r.selected).length,
              )}
              className="px-2 py-1 bg-emerald-500 text-white rounded text-xs hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <CheckCircle className="h-3 w-3" /> {acceptButtonLabel(shouldShowInstrumentTable(wizardResult.instruments))}
            </button>
            <button
              type="button"
              onClick={resetWizard}
              className="px-2 py-1 border border-amber-300 text-amber-700 rounded text-xs hover:bg-amber-50"
            >
              Yeni Tara
            </button>
          </div>
        </div>
      )}

      {/* Header - Kompakt */}
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold">💰 Borçlular</h2>
          <p className="text-[10px] text-muted-foreground">
            Takibe dahil edilecek borçluları seçin
          </p>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.INDIVIDUAL)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] bg-emerald-500 text-white rounded hover:bg-emerald-600"
          >
            <Users className="h-3 w-3" /> Şahıs
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.COMPANY)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            <Building2 className="h-3 w-3" /> Kurum
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.PUBLIC_INSTITUTION)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            <Landmark className="h-3 w-3" /> Kamu
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.ESTATE)}
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[10px] bg-amber-500 text-white rounded hover:bg-amber-600"
          >
            <Scroll className="h-3 w-3" /> Tereke
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-2 gap-2 min-h-0 overflow-hidden">
        {/* Sol Panel: Borçlu Rehberi */}
        <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden">
          <h3 className="font-medium mb-1 flex items-center gap-1 text-xs flex-shrink-0">
            <Search className="h-3 w-3" /> Borçlu Rehberi
          </h3>

          {/* Arama */}
          <div className="relative mb-1 flex-shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ad, TCKN, VKN..."
              className="w-full pl-7 pr-2 py-1 text-xs border rounded focus:outline-none focus:border-primary"
            />
          </div>

          {/* Tip Filtreleri */}
          <div className="flex gap-1 mb-1 flex-shrink-0">
            {[
              { value: "ALL", label: "Tümü" },
              { value: DebtorType.INDIVIDUAL, label: "Şahıs" },
              { value: DebtorType.COMPANY, label: "Kurum" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTypeFilter(opt.value as any)}
                className={`px-1.5 py-0.5 text-[10px] rounded ${
                  typeFilter === opt.value
                    ? "bg-primary text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Borçlu Listesi */}
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {loading ? (
              <div className="text-center py-4 text-muted-foreground text-xs">Yükleniyor...</div>
            ) : filteredDebtors.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-xs">
                {searchTerm ? "Sonuç bulunamadı" : "Borçlu bulunamadı"}
              </div>
            ) : (
              filteredDebtors.slice(0, 8).map((debtor) => (
                <div
                  key={debtor.id}
                  className="p-1.5 border rounded hover:border-primary hover:bg-primary/5 transition-colors cursor-pointer"
                  onClick={() => addDebtorToCase(debtor)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      {debtor.type === DebtorType.INDIVIDUAL && <Users className="h-3 w-3 text-emerald-500" />}
                      {debtor.type === DebtorType.COMPANY && <Building2 className="h-3 w-3 text-blue-500" />}
                      {debtor.type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-3 w-3 text-purple-500" />}
                      <span className="font-medium text-xs">{debtor.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); addDebtorToCase(debtor); }}
                      className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white"
                    >
                      + Ekle
                    </button>
                  </div>
                  {debtor.identityNo && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{debtor.identityNo}</p>
                  )}
                </div>
              ))
            )}
            {filteredDebtors.length > 8 && (
              <p className="text-[10px] text-center text-muted-foreground py-1">
                +{filteredDebtors.length - 8} daha...
              </p>
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçili Borçlular */}
        <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden">
          <h3 className="font-medium mb-1 flex items-center gap-1 text-xs flex-shrink-0">
            <Users className="h-3 w-3" /> Seçili Borçlular
            {selectedDebtors.length > 0 && (
              <span className="text-[10px] bg-primary text-white px-1 py-0.5 rounded-full">
                {selectedDebtors.length}
              </span>
            )}
          </h3>

          {selectedDebtors.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed rounded">
              <div className="text-center p-2">
                <AlertCircle className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                <p className="text-muted-foreground text-xs">Henüz borçlu seçilmedi</p>
                <p className="text-[10px] text-muted-foreground">
                  Sol panelden seçin
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
              {selectedDebtors.map((caseDebtor, index) => (
                <SelectedDebtorCard
                  key={caseDebtor.debtorId}
                  caseDebtor={caseDebtor}
                  onUpdate={(updates: Partial<CaseDebtor>) => updateCaseDebtor(index, updates)}
                  onRemove={() => removeCaseDebtor(index)}
                  onEdit={(debtor) => openEditDebtorModal(debtor)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Yeni/Düzenle Borçlu Modal */}
      {showNewDebtorModal && (
        <NewDebtorModal
          initialType={newDebtorType}
          editDebtor={editingDebtor || undefined}
          onSave={handleDebtorSaved}
          onClose={() => { setShowNewDebtorModal(false); setEditingDebtor(null); }}
          onUseExisting={handleUseExistingDebtor}
        />
      )}
    </div>
  );
}
