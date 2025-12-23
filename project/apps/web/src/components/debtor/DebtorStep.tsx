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
    <div className="space-y-6">
      {/* 🧠 Akıllı Borçlu Sihirbazı - Üst Panel */}
      <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border-2 border-amber-200 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-md">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900 flex items-center gap-2">
              🧠 Akıllı Borçlu Sihirbazı
            </h3>
            <p className="text-xs text-amber-700">
              Borç evrakını yükleyin, borçluyu / rolü / vade-tutarı otomatik tespit edelim
            </p>
          </div>
          {!showWizard && (
            <button
              type="button"
              onClick={() => setShowWizard(true)}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-md flex items-center gap-2"
            >
              <ScanLine className="h-4 w-4" />
              Evrak Tara
            </button>
          )}
        </div>

        {/* Sihirbaz Açık */}
        {showWizard && !wizardResult && (
          <div className="mt-4 p-4 bg-white/70 rounded-xl border border-amber-200">
            {/* Dosya Yükleme Alanı */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                isDragging 
                  ? "border-amber-500 bg-amber-100 scale-[1.02] shadow-lg" 
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
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-amber-100 flex items-center justify-center">
                <Upload className="h-8 w-8 text-amber-500" />
              </div>
              <p className="text-sm font-medium text-amber-800 mb-1">
                {isDragging ? "Dosyayı Bırakın" : "Borç evrakını sürükleyip bırakın veya tıklayın"}
              </p>
              <p className="text-xs text-amber-600">
                Fatura, senet, çek, kira sözleşmesi, cari hesap ekstresi (PDF, JPG, PNG, Word)
              </p>
            </div>

            {/* Seçilen Dosya */}
            {selectedFile && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">{selectedFile.name}</p>
                    <p className="text-xs text-amber-600">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  className="p-1.5 hover:bg-amber-100 rounded-lg"
                >
                  <X className="h-4 w-4 text-amber-600" />
                </button>
              </div>
            )}

            {/* Hata Mesajı */}
            {wizardError && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700 text-sm">
                <AlertTriangle className="h-4 w-4" />
                {wizardError}
              </div>
            )}

            {/* Aksiyon Butonları */}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleWizardScan}
                disabled={!selectedFile || wizardScanning}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-md"
              >
                {wizardScanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Taranıyor...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Tara ve Analiz Et
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setShowWizard(false); resetWizard(); }}
                className="px-4 py-2 border border-amber-300 text-amber-700 rounded-xl hover:bg-amber-50"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {/* Sihirbaz Sonuçları */}
        {wizardResult && (
          <div className="mt-4 space-y-4">
            {/* Evrak Türü ve Güven */}
            <div className="p-3 bg-white/70 rounded-xl border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileCheck className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-900">
                    Evrak Türü: {DocumentTypeLabels[wizardResult.documentType] || wizardResult.documentType}
                  </p>
                  <p className="text-xs text-amber-600">
                    Önerilen Takip: {wizardResult.suggestedCaseType === "KAMBIYO" ? "Kambiyo Takibi" : 
                                    wizardResult.suggestedCaseType === "KIRA" ? "Kira Takibi" : "İlamsız Takip"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-600">Güven:</span>
                <span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${
                  wizardResult.confidence >= 70 ? "bg-emerald-100 text-emerald-700" : 
                  wizardResult.confidence >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
                }`}>
                  %{wizardResult.confidence}
                </span>
              </div>
            </div>

            {/* Bulunan Kişiler/Kurumlar */}
            {wizardResult.parties.length > 0 && (
              <div className="p-4 bg-white/70 rounded-xl border border-amber-200">
                <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" /> Bulunan Kişiler/Kurumlar
                </h4>
                <div className="space-y-2">
                  {wizardResult.parties.map((party, index) => (
                    <div key={index} className="p-3 bg-amber-50 rounded-lg flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {party.type === "INDIVIDUAL" && <Users className="h-4 w-4 text-emerald-500" />}
                        {party.type === "COMPANY" && <Building2 className="h-4 w-4 text-blue-500" />}
                        {party.type === "PUBLIC_INSTITUTION" && <Landmark className="h-4 w-4 text-purple-500" />}
                        <div>
                          <p className="font-medium text-amber-900">{party.name}</p>
                          <div className="flex items-center gap-2 text-xs text-amber-600">
                            <span className={`px-1.5 py-0.5 rounded ${
                              party.role === "BORCLU" ? "bg-red-100 text-red-700" :
                              party.role === "ALACAKLI" ? "bg-green-100 text-green-700" :
                              "bg-amber-100 text-amber-700"
                            }`}>
                              {RoleLabels[party.role] || party.role}
                            </span>
                            {party.identityNo && <span>{party.identityNo}</span>}
                            {party.city && <span>{party.city}</span>}
                          </div>
                        </div>
                      </div>
                      {(party.role === "BORCLU" || party.role === "KEFIL" || party.role === "CIRANTA" || 
                        party.role === "AVAL" || party.role === "MUTESELSIL") && (
                        <button
                          type="button"
                          onClick={() => handleAcceptParty(party)}
                          className="px-3 py-1.5 bg-emerald-500 text-white text-xs rounded-lg hover:bg-emerald-600 flex items-center gap-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Ekle
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tebligat Adresi Önerisi */}
            {wizardResult.parties.some(p => p.address && (p.role === "BORCLU" || p.role === "KEFIL" || p.role === "CIRANTA")) && (
              <div className="p-4 bg-white/70 rounded-xl border border-amber-200">
                <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                  <MapPin className="h-4 w-4" /> Tebligat Adresi Önerisi
                </h4>
                <div className="space-y-2">
                  {wizardResult.parties
                    .filter(p => p.address && (p.role === "BORCLU" || p.role === "KEFIL" || p.role === "CIRANTA"))
                    .map((party, index) => (
                      <div key={index} className="p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-blue-900 mb-1">{party.name}</p>
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div>
                                <p className="text-sm text-blue-800">{party.address}</p>
                                {(party.district || party.city) && (
                                  <p className="text-xs text-blue-600 mt-0.5">
                                    {party.district && `${party.district} / `}{party.city}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-lg">
                            Belgeden Tespit
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 mt-2 italic">
                          💡 Bu adres borçlu eklenirken tebligat adresi olarak kaydedilecek
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Borç Bilgileri */}
            {(wizardResult.debtInfo.amount || wizardResult.debtInfo.dueDate) && (
              <div className="p-4 bg-white/70 rounded-xl border border-amber-200">
                <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" /> Borç Bilgileri
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {wizardResult.debtInfo.amount && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Tutar</p>
                      <p className="font-semibold text-amber-900">
                        {CurrencySymbols[wizardResult.debtInfo.currency]}{wizardResult.debtInfo.amount.toLocaleString("tr-TR")}
                      </p>
                    </div>
                  )}
                  {wizardResult.debtInfo.dueDate && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Vade</p>
                      <p className="font-semibold text-amber-900">
                        {new Date(wizardResult.debtInfo.dueDate).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                  )}
                  {wizardResult.debtInfo.documentNo && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Belge No</p>
                      <p className="font-semibold text-amber-900">{wizardResult.debtInfo.documentNo}</p>
                    </div>
                  )}
                  {wizardResult.debtInfo.issueDate && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Düzenleme</p>
                      <p className="font-semibold text-amber-900">
                        {new Date(wizardResult.debtInfo.issueDate).toLocaleDateString("tr-TR")}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Banka Bilgileri (Çek için) */}
            {wizardResult.bankInfo && (wizardResult.bankInfo.bankName || wizardResult.bankInfo.iban) && (
              <div className="p-4 bg-white/70 rounded-xl border border-amber-200">
                <h4 className="font-medium text-amber-900 mb-3 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Banka Bilgileri
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {wizardResult.bankInfo.bankName && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Banka</p>
                      <p className="font-semibold text-amber-900">{wizardResult.bankInfo.bankName}</p>
                    </div>
                  )}
                  {wizardResult.bankInfo.branchName && (
                    <div className="p-2 bg-amber-50 rounded-lg">
                      <p className="text-xs text-amber-600">Şube</p>
                      <p className="font-semibold text-amber-900">{wizardResult.bankInfo.branchName}</p>
                    </div>
                  )}
                  {wizardResult.bankInfo.iban && (
                    <div className="p-2 bg-amber-50 rounded-lg col-span-2">
                      <p className="text-xs text-amber-600">IBAN</p>
                      <p className="font-semibold text-amber-900 font-mono text-sm">{wizardResult.bankInfo.iban}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tahsilat İletişimi Önerisi */}
            {wizardResult.debtInfo.amount && wizardResult.parties.some(p => p.role === "BORCLU") && (
              <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-200">
                <h4 className="font-medium text-violet-900 mb-3 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Tahsilat İletişimi
                </h4>
                <p className="text-sm text-violet-700 mb-3">
                  Borçluya ödeme hatırlatması göndermek için SMS veya e-posta taslağı hazırlandı.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const debtorParty = wizardResult.parties.find(p => p.role === "BORCLU");
                      if (debtorParty && wizardResult.debtInfo.amount) {
                        const smsText = `Sayın ${debtorParty.name},\n\n${wizardResult.debtInfo.documentNo ? `${wizardResult.debtInfo.documentNo} numaralı belgeye istinaden ` : ""}${CurrencySymbols[wizardResult.debtInfo.currency]}${wizardResult.debtInfo.amount.toLocaleString("tr-TR")} tutarındaki borcunuzun ${wizardResult.debtInfo.dueDate ? `${new Date(wizardResult.debtInfo.dueDate).toLocaleDateString("tr-TR")} tarihinde vadesi dolmuştur` : "ödenmesi gerekmektedir"}.\n\nBorcunuzu en kısa sürede ödemenizi rica ederiz.`;
                        navigator.clipboard.writeText(smsText);
                        alert("SMS metni panoya kopyalandı!");
                      }
                    }}
                    className="px-4 py-2 bg-violet-500 text-white text-sm rounded-lg hover:bg-violet-600 flex items-center gap-2"
                  >
                    <Phone className="h-4 w-4" />
                    SMS Taslağını Kopyala
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const debtorParty = wizardResult.parties.find(p => p.role === "BORCLU");
                      if (debtorParty && wizardResult.debtInfo.amount) {
                        const emailSubject = `Ödeme Hatırlatması - ${CurrencySymbols[wizardResult.debtInfo.currency]}${wizardResult.debtInfo.amount.toLocaleString("tr-TR")}`;
                        const emailBody = `Sayın ${debtorParty.name},\n\n${wizardResult.debtInfo.documentNo ? `${wizardResult.debtInfo.documentNo} numaralı belgeye istinaden ` : ""}${CurrencySymbols[wizardResult.debtInfo.currency]}${wizardResult.debtInfo.amount.toLocaleString("tr-TR")} tutarındaki borcunuz bulunmaktadır.\n\n${wizardResult.debtInfo.dueDate ? `Vade Tarihi: ${new Date(wizardResult.debtInfo.dueDate).toLocaleDateString("tr-TR")}\n\n` : ""}Borcunuzu en kısa sürede ödemenizi rica ederiz.\n\nSaygılarımızla`;
                        const mailtoLink = `mailto:${debtorParty.phone || ""}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                        window.open(mailtoLink, "_blank");
                      }
                    }}
                    className="px-4 py-2 bg-violet-100 text-violet-700 text-sm rounded-lg hover:bg-violet-200 flex items-center gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    E-posta Taslağını Aç
                  </button>
                </div>
              </div>
            )}

            {/* Aksiyon Butonları */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleAcceptAllDebtors}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl hover:from-emerald-600 hover:to-teal-600 transition-all shadow-md flex items-center gap-2"
              >
                <CheckCircle className="h-4 w-4" />
                Tüm Borçluları Ekle
              </button>
              <button
                type="button"
                onClick={resetWizard}
                className="px-4 py-2 border border-amber-300 text-amber-700 rounded-xl hover:bg-amber-50 flex items-center gap-2"
              >
                <ScanLine className="h-4 w-4" />
                Yeni Evrak Tara
              </button>
              <button
                type="button"
                onClick={() => { setShowWizard(false); resetWizard(); }}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50"
              >
                Kapat
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Borçlular</h2>
          <p className="text-sm text-muted-foreground">
            Takibe dahil edilecek borçluları seçin veya yeni borçlu ekleyin
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.INDIVIDUAL)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600"
          >
            <Users className="h-4 w-4" /> Şahıs Ekle
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.COMPANY)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Building2 className="h-4 w-4" /> Kurum Ekle
          </button>
          <button
            type="button"
            onClick={() => openNewDebtorModal(DebtorType.PUBLIC_INSTITUTION)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600"
          >
            <Landmark className="h-4 w-4" /> Kamu Ekle
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sol Panel: Borçlu Rehberi */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Search className="h-4 w-4" /> Borçlu Rehberi
          </h3>

          {/* Arama ve Filtre */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ad, TCKN, VKN veya telefon..."
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Tip Filtreleri */}
          <div className="flex gap-1 mb-3">
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
                className={`px-3 py-1.5 text-xs rounded-full flex items-center gap-1 ${
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


          {/* Borçlu Listesi */}
          <div className="max-h-[400px] overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
            ) : filteredDebtors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? "Sonuç bulunamadı" : "Borçlu bulunamadı"}
              </div>
            ) : (
              filteredDebtors.map((debtor) => (
                <div
                  key={debtor.id}
                  className="p-3 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => addDebtorToCase(debtor)}>
                      <div className="flex items-center gap-2">
                        {debtor.type === DebtorType.INDIVIDUAL && <Users className="h-4 w-4 text-emerald-500" />}
                        {debtor.type === DebtorType.COMPANY && <Building2 className="h-4 w-4 text-blue-500" />}
                        {debtor.type === DebtorType.PUBLIC_INSTITUTION && <Landmark className="h-4 w-4 text-purple-500" />}
                        <span className="font-medium">{debtor.name}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-2">
                        {debtor.identityNo && <span>{debtor.identityNo}</span>}
                        {debtor.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{debtor.phone}</span>}
                        {debtor.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{debtor.email}</span>}
                      </div>
                      {debtor.debtorAddresses?.[0] && (
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {debtor.debtorAddresses[0].city}
                          {debtor.debtorAddresses[0].district && ` / ${debtor.debtorAddresses[0].district}`}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openEditDebtorModal(debtor); }}
                        className="text-xs p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Düzenle"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => addDebtorToCase(debtor)}
                        className="text-xs px-2.5 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary hover:text-white flex items-center gap-1 font-medium"
                      >
                        <Plus className="h-3 w-3" />
                        Ekle
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçili Borçlular */}
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" /> Bu Takip İçin Seçili Borçlular
            {selectedDebtors.length > 0 && (
              <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                {selectedDebtors.length}
              </span>
            )}
          </h3>

          {selectedDebtors.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-lg">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">Henüz borçlu seçilmedi</p>
              <p className="text-xs text-muted-foreground mt-1">
                Sol panelden mevcut borçlu seçin veya yeni borçlu ekleyin
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
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
