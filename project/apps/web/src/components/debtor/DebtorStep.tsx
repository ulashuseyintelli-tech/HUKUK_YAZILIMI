"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Plus, Search, Users, Building2, Landmark, X, MapPin, Mail, Phone, AlertCircle,
  ScanLine, Sparkles, Upload, FileText, Loader2, CheckCircle, ArrowRight, Edit2, Trash2,
  Calendar, DollarSign, FileCheck, AlertTriangle
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Debtor, CaseDebtor, DebtorType, DebtorRole, NotificationMode,
  DebtorTypeLabels, DebtorRoleLabels, NotificationModeLabels,
} from "@/types/debtor";
import { NewDebtorModal } from "./NewDebtorModal";
import { SelectedDebtorCard } from "./SelectedDebtorCard";

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

// Para birimi sembolleri
const CurrencySymbols: Record<string, string> = {
  TRY: "₺",
  USD: "$",
  EUR: "€",
  GBP: "£",
  CHF: "CHF",
};

interface DebtorStepProps {
  selectedDebtors: CaseDebtor[];
  onDebtorsChange: (debtors: CaseDebtor[]) => void;
  onDebtInfoDetected?: (debtInfo: DebtDocumentResult["debtInfo"]) => void;
}

export function DebtorStep({ selectedDebtors, onDebtorsChange, onDebtInfoDetected }: DebtorStepProps) {
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
  const [wizardError, setWizardError] = useState<string | null>(null);
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
    const newCaseDebtor: CaseDebtor = {
      debtorId: debtor.id,
      debtor,
      role: DebtorRole.ASIL_BORCLU,
      notificationMode: debtor.kepAddress ? NotificationMode.KEP : NotificationMode.NORMAL,
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
      
      const newCaseDebtor: CaseDebtor = {
        debtorId: savedDebtor.id,
        debtor: savedDebtor,
        role,
        notificationMode: NotificationMode.NORMAL,
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
    
    // Borç bilgilerini üst bileşene aktar
    if (onDebtInfoDetected && wizardResult.debtInfo) {
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
    <div className="space-y-3">
      {/* 🧠 Akıllı Borçlu Sihirbazı - Kompakt Üst Panel */}
      <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-medium text-amber-900 text-sm">🧠 Akıllı Borçlu Sihirbazı</h3>
              <p className="text-xs text-amber-700">
                Borç evrakını yükleyin, borçluyu / rolü / vade-tutarı otomatik tespit edelim
              </p>
            </div>
          </div>
          {!showWizard && (
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm flex items-center gap-1.5 text-sm"
            >
              <ScanLine className="h-4 w-4" />
              Evrak Tara
            </button>
          )}
        </div>

        {/* Sihirbaz Açık */}
        {showWizard && !wizardResult && (
          <div className="mt-3 p-3 bg-white/70 rounded-lg border border-amber-200">
            {/* Dosya Yükleme Alanı */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all ${
                isDragging 
                  ? "border-amber-500 bg-amber-100 scale-[1.01]" 
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
              <div className="flex items-center justify-center gap-3">
                <Upload className="h-6 w-6 text-amber-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-amber-800">
                    {isDragging ? "Dosyayı Bırakın" : "Borç evrakını sürükleyip bırakın veya tıklayın"}
                  </p>
                  <p className="text-xs text-amber-600">
                    Fatura, senet, çek, kira sözleşmesi (PDF, JPG, PNG, Word)
                  </p>
                </div>
              </div>
            </div>

            {/* Seçilen Dosya ve Aksiyon */}
            <div className="mt-2 flex items-center gap-2">
              {selectedFile && (
                <div className="flex-1 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-800 truncate">{selectedFile.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="p-1 hover:bg-amber-100 rounded"
                  >
                    <X className="h-3 w-3 text-amber-600" />
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={handleWizardScan}
                disabled={!selectedFile || wizardScanning}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm"
              >
                {wizardScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Taranıyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Tara
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setShowWizard(false); resetWizard(); }}
                className="px-3 py-2 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm"
              >
                İptal
              </button>
            </div>

            {/* Hata Mesajı */}
            {wizardError && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-xs">
                <AlertTriangle className="h-4 w-4" />
                {wizardError}
              </div>
            )}
          </div>
        )}

        {/* Sihirbaz Sonuçları - Kompakt */}
        {wizardResult && (
          <div className="mt-3 space-y-2">
            {/* Evrak Türü */}
            <div className="p-2 bg-white/70 rounded-lg border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-900">
                  {DocumentTypeLabels[wizardResult.documentType] || wizardResult.documentType}
                </span>
                <span className="text-xs text-amber-600">
                  ({wizardResult.suggestedCaseType === "KAMBIYO" ? "Kambiyo" : wizardResult.suggestedCaseType === "KIRA" ? "Kira" : "İlamsız"})
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                wizardResult.confidence >= 70 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
              }`}>
                %{wizardResult.confidence}
              </span>
            </div>

            {/* Bulunan Kişiler - Kompakt Liste */}
            {wizardResult.parties.length > 0 && (
              <div className="p-2 bg-white/70 rounded-lg border border-amber-200">
                <h4 className="font-medium text-amber-900 mb-2 text-sm flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> Bulunan Kişiler
                </h4>
                <div className="space-y-1">
                  {wizardResult.parties.map((party, index) => (
                    <div key={index} className="p-2 bg-amber-50 rounded flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {party.type === "INDIVIDUAL" && <Users className="h-3.5 w-3.5 text-emerald-500" />}
                        {party.type === "COMPANY" && <Building2 className="h-3.5 w-3.5 text-blue-500" />}
                        {party.type === "PUBLIC_INSTITUTION" && <Landmark className="h-3.5 w-3.5 text-purple-500" />}
                        <span className="font-medium text-sm text-amber-900">{party.name}</span>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          party.role === "BORCLU" ? "bg-red-100 text-red-700" :
                          party.role === "ALACAKLI" ? "bg-green-100 text-green-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {RoleLabels[party.role] || party.role}
                        </span>
                      </div>
                      {(party.role === "BORCLU" || party.role === "KEFIL" || party.role === "CIRANTA" || 
                        party.role === "AVAL" || party.role === "MUTESELSIL") && (
                        <button
                          type="button"
                          onClick={() => handleAcceptParty(party)}
                          className="px-2 py-1 bg-emerald-500 text-white text-xs rounded hover:bg-emerald-600 flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Ekle
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Borç Bilgileri - Kompakt */}
            {(wizardResult.debtInfo.amount || wizardResult.debtInfo.dueDate) && (
              <div className="p-2 bg-white/70 rounded-lg border border-amber-200">
                <div className="flex items-center gap-4 text-sm">
                  {wizardResult.debtInfo.amount && (
                    <div>
                      <span className="text-xs text-amber-600">Tutar: </span>
                      <span className="font-semibold text-amber-900">
                        {CurrencySymbols[wizardResult.debtInfo.currency]}{wizardResult.debtInfo.amount.toLocaleString("tr-TR")}
                      </span>
                    </div>
                  )}
                  {wizardResult.debtInfo.dueDate && (
                    <div>
                      <span className="text-xs text-amber-600">Vade: </span>
                      <span className="font-semibold text-amber-900">
                        {new Date(wizardResult.debtInfo.dueDate).toLocaleDateString("tr-TR")}
                      </span>
                    </div>
                  )}
                  {wizardResult.debtInfo.documentNo && (
                    <div>
                      <span className="text-xs text-amber-600">Belge No: </span>
                      <span className="font-semibold text-amber-900">{wizardResult.debtInfo.documentNo}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Aksiyon Butonları */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAcceptAllDebtors}
                className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg hover:from-emerald-600 hover:to-teal-600 transition-all text-sm flex items-center gap-1.5"
              >
                <CheckCircle className="h-4 w-4" />
                Tüm Borçluları Ekle
              </button>
              <button
                type="button"
                onClick={resetWizard}
                className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 text-sm flex items-center gap-1"
              >
                <ScanLine className="h-3.5 w-3.5" />
                Yeni Tara
              </button>
              <button
                type="button"
                onClick={() => { setShowWizard(false); resetWizard(); }}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 text-sm"
              >
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Header - Kompakt */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Borçlular</h2>
          <p className="text-xs text-muted-foreground">
            Takibe dahil edilecek borçluları seçin veya yeni borçlu ekleyin
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.INDIVIDUAL)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
          >
            <Users className="h-3.5 w-3.5" /> Şahıs Ekle
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.COMPANY)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Building2 className="h-3.5 w-3.5" /> Kurum Ekle
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.PUBLIC_INSTITUTION)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Landmark className="h-3.5 w-3.5" /> Kamu Ekle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sol Panel: Borçlu Rehberi */}
        <div className="border rounded-lg p-3">
          <h3 className="font-medium mb-2 flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Borçlu Rehberi
          </h3>

          {/* Arama ve Filtre */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ad, TCKN, VKN veya telefon..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Tip Filtreleri */}
          <div className="flex gap-1 mb-2">
            {[
              { value: "ALL", label: "Tümü", icon: null },
              { value: DebtorType.INDIVIDUAL, label: "Şahıs", icon: Users },
              { value: DebtorType.COMPANY, label: "Kurum", icon: Building2 },
              { value: DebtorType.PUBLIC_INSTITUTION, label: "Kamu", icon: Landmark },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTypeFilter(opt.value as any)}
                className={`px-2 py-1 text-xs rounded-full flex items-center gap-1 ${
                  typeFilter === opt.value
                    ? "bg-primary text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {opt.icon && <opt.icon className="h-3 w-3" />}
                {opt.label}
              </button>
            ))}
          </div>


          {/* Borçlu Listesi - Daha kısa */}
          <div className="max-h-[280px] overflow-y-auto space-y-1.5">
            {loading ? (
              <div className="text-center py-6 text-muted-foreground text-sm">Yükleniyor...</div>
            ) : filteredDebtors.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {searchTerm ? "Sonuç bulunamadı" : "Borçlu bulunamadı"}
              </div>
            ) : (
              filteredDebtors.slice(0, 10).map((debtor) => (
                <div
                  key={debtor.id}
                  className="p-2 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => addDebtorToCase(debtor)}>
                      <div className="flex items-center gap-2">
                        {debtor.type === DebtorType.INDIVIDUAL && <Users className="h-3.5 w-3.5 text-emerald-500" />}
                        {debtor.type === DebtorType.COMPANY && <Building2 className="h-3.5 w-3.5 text-blue-500" />}
                        {debtor.type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-3.5 w-3.5 text-purple-500" />}
                        <span className="font-medium text-sm">{debtor.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                        {debtor.identityNo && <span>{debtor.identityNo}</span>}
                        {debtor.phone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" />{debtor.phone}</span>}
                        {debtor.email && <span className="flex items-center gap-0.5"><Mail className="h-3 w-3" />{debtor.email}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEditDebtorModal(debtor); }}
                        className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Düzenle"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => addDebtorToCase(debtor)}
                        className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white flex items-center gap-0.5 font-medium"
                      >
                        + Ekle
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
            {filteredDebtors.length > 10 && (
              <p className="text-xs text-center text-muted-foreground py-1">
                +{filteredDebtors.length - 10} daha... (arama yapın)
              </p>
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçili Borçlular */}
        <div className="border rounded-lg p-3">
          <h3 className="font-medium mb-2 flex items-center gap-2 text-sm">
            <Users className="h-4 w-4" /> Bu Takip İçin Seçili Borçlular
            {selectedDebtors.length > 0 && (
              <span className="text-xs bg-primary text-white px-1.5 py-0.5 rounded-full">
                {selectedDebtors.length}
              </span>
            )}
          </h3>

          {selectedDebtors.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <p className="text-muted-foreground text-sm">Henüz borçlu seçilmedi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sol panelden mevcut borçlu seçin veya yeni borçlu ekleyin
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
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
        />
      )}
    </div>
  );
}
