"use client";

import React, { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { 
  Search, Users, Building2, Landmark, X, AlertCircle,
  ScanLine, Sparkles, Upload, FileText, Loader2, CheckCircle,
  AlertTriangle, Scroll, FileCheck
} from "lucide-react";
import { api } from "@/lib/api";
import { MAX_OCR_UPLOAD_BYTES, MAX_OCR_UPLOAD_LABEL } from "@/lib/upload-limits";
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
  hasIncompleteSelected,
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

/**
 * BUG-2a — Sihirbazda tespit edilen `party` → backend CreateDebtorDto'ya UYUMLU payload.
 * Test edilebilirlik için export edilir (kapsam: tek prod dosyası → ayrı lib açılmadı).
 *
 * Eski kod `name` / `identityNo` / `type:"WORK"` / `fullAddress` gönderiyordu; backend
 * whitelist + forbidNonWhitelisted olduğundan bunlar 400'lerdi. Burada DTO alan adlarına
 * map edilir: firstName/lastName | companyName | institutionName · tckn/vkn · addressType/street.
 *
 * INDIVIDUAL'da ad+soyad ZORUNLU (backend validateDebtorByType). Ayrıştırılamazsa { ok:false }
 * döner → caller POST ETMEZ ve sahte soyad ("—") YAZMAZ (karar: ulas).
 */
export type WizardDebtorBuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

export function buildWizardDebtorPayload(
  party: DebtDocumentResult["parties"][0],
): WizardDebtorBuildResult {
  const debtorType =
    party.type === "INDIVIDUAL"
      ? DebtorType.INDIVIDUAL
      : party.type === "COMPANY"
      ? DebtorType.COMPANY
      : DebtorType.PUBLIC_INSTITUTION;
  // BUG-1/OCR NOTU: multi-instrument akışı keşideciyi DAİMA INDIVIDUAL etiketliyor
  // (ocr.service buildDebtResultFromInstruments). Bir A.Ş. çeki bu yüzden geçici olarak
  // gerçek-kişi gibi kaydolabilir; party-type düzeltmesi BUG-1/OCR kapsamı, bu PR'da DOKUNULMAZ.

  const rawName = (party.name || "").trim();

  const nameFields: {
    firstName?: string;
    lastName?: string;
    companyName?: string;
    institutionName?: string;
  } = {};
  if (debtorType === DebtorType.INDIVIDUAL) {
    const tokens = rawName.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
      return {
        ok: false,
        error: `"${rawName || "İsimsiz"}" için ad ve soyad ayrıştırılamadı. Lütfen manuel ekleyin/düzeltin.`,
      };
    }
    nameFields.lastName = tokens[tokens.length - 1];
    nameFields.firstName = tokens.slice(0, -1).join(" ");
  } else if (debtorType === DebtorType.COMPANY) {
    if (!rawName) return { ok: false, error: "Şirket adı okunamadı. Lütfen manuel ekleyin." };
    nameFields.companyName = rawName;
  } else {
    if (!rawName) return { ok: false, error: "Kurum adı okunamadı. Lütfen manuel ekleyin." };
    nameFields.institutionName = rawName;
  }

  // Kimlik: 11 hane → tckn (gerçek kişi), 10 hane → vkn (tüzel). Aksi halde gönderilmez.
  const idDigits = (party.identityNo || "").replace(/\D/g, "");
  const identity: { tckn?: string; vkn?: string } = {};
  if (debtorType === DebtorType.INDIVIDUAL && idDigits.length === 11) identity.tckn = idDigits;
  else if (debtorType === DebtorType.COMPANY && idDigits.length === 10) identity.vkn = idDigits;

  // Adres: backend CreateDebtorAddressDto → addressType(enum) + street + city ZORUNLU.
  // Yalnız hem adres hem şehir varsa gönder ("WORK" enum'da yok → "IS").
  const addresses =
    party.address && party.city
      ? [
          {
            addressType: "IS",
            street: party.address,
            city: party.city,
            district: party.district,
            isPrimary: true,
          },
        ]
      : [];

  return {
    ok: true,
    payload: {
      type: debtorType,
      ...nameFields,
      ...identity,
      ...(party.phone ? { phone: party.phone } : {}),
      addresses,
      forceCreate: true,
    },
  };
}

// BUG-3: party review (edit/rol/yoksay) — saf yardımcılar, export (kapsam: tek prod dosyası DebtorStep.tsx).
export type PartyDraft = DebtDocumentResult["parties"][0];
export interface PartyRow {
  draft: PartyDraft;
  ignored: boolean;
  added: boolean;
}

const DEBTOR_ROLES: string[] = ["BORCLU", "KEFIL", "CIRANTA", "AVAL", "MUTESELSIL"];

/** Borçlu-tarafı rol mü (ALACAKLI hariç)? Per-party Ekle butonu + bulk filtre bunu kullanır. */
export function isDebtorRole(role: string): boolean {
  return DEBTOR_ROLES.includes(role);
}

/** Scan partilerinden ilk review satırları (ignored/added=false, draft = kopya). */
export function buildInitialPartyRows(parties: DebtDocumentResult["parties"]): PartyRow[] {
  return (parties ?? []).map((p) => ({ draft: { ...p }, ignored: false, added: false }));
}

/** Bulk "Tümünü Ekle" hedefleri: yoksaylı/eklenmiş/ALACAKLI hariç (pure; testlerde kullanılır). */
export function selectablePartyRows(rows: PartyRow[]): PartyRow[] {
  return rows.filter((r) => !r.ignored && !r.added && isDebtorRole(r.draft.role));
}

interface DebtorStepProps {
  selectedDebtors: CaseDebtor[];
  onDebtorsChange: Dispatch<SetStateAction<CaseDebtor[]>>;
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
  const [partyRows, setPartyRows] = useState<PartyRow[]>([]);
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

  // BUG-3: yeni scan geldiğinde party review satırlarını YENİDEN kur (reviewRows ikizi).
  useEffect(() => {
    setPartyRows(buildInitialPartyRows(wizardResult?.parties ?? []));
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
    
    if (file.size > MAX_OCR_UPLOAD_BYTES) {
      setWizardError(`Dosya boyutu ${MAX_OCR_UPLOAD_LABEL}'dan büyük olamaz.`);
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
  // BUG-3: editlenmiş party draft'ı alır ve SONUCU DÖNDÜRÜR (caller hata/added/kapanışı yönetir).
  //   buildWizardDebtorPayload (BUG-2) korunur → tek-kelime/şekil doğrulaması AYNI.
  const handleAcceptParty = async (
    draft: PartyDraft,
  ): Promise<{ ok: true } | { ok: false; error: string }> => {
    const built = buildWizardDebtorPayload(draft);
    if (!built.ok) return { ok: false, error: built.error };
    try {
      
      const response = await api.post("/debtors", built.payload);
      const savedDebtor = response.data?.data || response.data;
      
      // Dosyaya ekle
      const role = draft.role === "BORCLU" ? DebtorRole.ASIL_BORCLU :
                   draft.role === "KEFIL" ? DebtorRole.MUTESELSIL_KEFIL :
                   draft.role === "CIRANTA" ? DebtorRole.CIRANTA :
                   draft.role === "AVAL" ? DebtorRole.AVAL :
                   draft.role === "MUTESELSIL" ? DebtorRole.MUSETEREK_BORCLU :
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
      
      // BUG-2b: stale-closure → functional update. Bulk loop'ta her parti TAZE prev'e eklenir
      // (eski [...selectedDebtors, x] yalnız SONUNCU borçluyu bırakıyordu).
      onDebtorsChange((prev) => [...prev, newCaseDebtor]);

      // Borçlu listesini yenile
      await loadDebtors();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: `Borçlu kaydedilemedi: ${err.message}` };
    }
  };

  // Sihirbaz: Tüm borçluları kabul et
  const handleAcceptAllDebtors = async () => {
    if (!wizardResult) return;
    setWizardError(null);

    // BUG-3: editlenmiş partyRows üzerinden (yoksaylı/eklenmiş/ALACAKLI hariç). İndeks için inline filtre.
    const targets = partyRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !row.ignored && !row.added && isDebtorRole(row.draft.role));

    const addedIdx: number[] = [];
    let lastError: string | null = null;
    for (const { row, index } of targets) {
      const res = await handleAcceptParty(row.draft);
      if (res.ok) addedIdx.push(index);
      else lastError = res.error;
    }
    if (addedIdx.length > 0) {
      setPartyRows((rows) => rows.map((r, i) => (addedIdx.includes(i) ? { ...r, added: true } : r)));
    }

    // (b) Bir parti bile eklenemezse: wizard AÇIK kalır + hata görünür (enstrüman emit + kapatma YOK).
    const failCount = targets.length - addedIdx.length;
    if (failCount > 0) {
      setWizardError(
        failCount === 1 && lastError
          ? lastError
          : `${failCount} borçlu eklenemedi. Lütfen düzeltip tekrar deneyin.`,
      );
      return;
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

  // BUG-3: partyRows düzenleme yardımcıları (per-party edit / yoksay / ekle).
  const updatePartyDraft = (index: number, patch: Partial<PartyDraft>) => {
    setPartyRows((rows) =>
      rows.map((r, i) => (i === index ? { ...r, draft: { ...r.draft, ...patch } } : r)),
    );
  };

  const updatePartyRow = (index: number, patch: Partial<Omit<PartyRow, "draft">>) => {
    setPartyRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const acceptPartyRow = async (index: number) => {
    setWizardError(null);
    const res = await handleAcceptParty(partyRows[index].draft);
    if (res.ok) updatePartyRow(index, { added: true });
    else setWizardError(res.error);
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

          {/* BUG-2: sonuç panelinde de hata göster (ör. tek-kelime isim → POST yok + uyarı). */}
          {wizardError && (
            <div className="p-1.5 bg-red-50 border border-red-200 rounded flex items-center gap-1 text-red-700 text-[10px]">
              <AlertTriangle className="h-3 w-3 flex-shrink-0" />
              {wizardError}
            </div>
          )}

          {partyRows.length > 0 && (
            <div className="space-y-1">
              {partyRows.map((row, index) => (
                <div
                  key={index}
                  className={`p-1.5 bg-white rounded border flex flex-wrap items-center gap-1 text-xs ${
                    row.ignored ? "border-gray-200 opacity-50" : "border-amber-200"
                  }`}
                >
                  <input
                    type="text"
                    data-testid={`party-name-${index}`}
                    value={row.draft.name}
                    onChange={(e) => updatePartyDraft(index, { name: e.target.value })}
                    disabled={row.ignored || row.added}
                    placeholder="Ad Soyad / Unvan"
                    className="flex-1 min-w-[110px] px-1 py-0.5 border rounded text-xs disabled:bg-gray-50"
                  />
                  <select
                    data-testid={`party-type-${index}`}
                    value={row.draft.type}
                    onChange={(e) => updatePartyDraft(index, { type: e.target.value as PartyDraft["type"] })}
                    disabled={row.ignored || row.added}
                    className="px-1 py-0.5 border rounded text-[10px] disabled:bg-gray-50"
                  >
                    <option value="INDIVIDUAL">Şahıs</option>
                    <option value="COMPANY">Kurum</option>
                    <option value="PUBLIC_INSTITUTION">Kamu</option>
                  </select>
                  <select
                    data-testid={`party-role-${index}`}
                    value={row.draft.role}
                    onChange={(e) => updatePartyDraft(index, { role: e.target.value as PartyDraft["role"] })}
                    disabled={row.ignored || row.added}
                    className="px-1 py-0.5 border rounded text-[10px] disabled:bg-gray-50"
                  >
                    <option value="BORCLU">Borçlu</option>
                    <option value="ALACAKLI">Alacaklı</option>
                    <option value="KEFIL">Kefil</option>
                    <option value="CIRANTA">Ciranta</option>
                    <option value="AVAL">Aval</option>
                    <option value="MUTESELSIL">Müteselsil Borçlu</option>
                  </select>
                  <input
                    type="text"
                    data-testid={`party-id-${index}`}
                    value={row.draft.identityNo ?? ""}
                    onChange={(e) => updatePartyDraft(index, { identityNo: e.target.value })}
                    disabled={row.ignored || row.added}
                    placeholder="TCKN/VKN"
                    className="w-[100px] px-1 py-0.5 border rounded text-[10px] disabled:bg-gray-50"
                  />
                  {row.added ? (
                    <span className="px-1 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] flex items-center gap-0.5">
                      <CheckCircle className="h-3 w-3" /> Eklendi
                    </span>
                  ) : row.ignored ? (
                    <button
                      type="button"
                      onClick={() => updatePartyRow(index, { ignored: false })}
                      className="px-1 py-0.5 border border-gray-300 text-gray-600 text-[10px] rounded hover:bg-gray-50"
                    >
                      Geri al
                    </button>
                  ) : (
                    <>
                      {isDebtorRole(row.draft.role) && (
                        <button
                          type="button"
                          data-testid={`party-accept-${index}`}
                          onClick={() => acceptPartyRow(index)}
                          className="px-1 py-0.5 bg-emerald-500 text-white text-[10px] rounded hover:bg-emerald-600"
                        >
                          Ekle
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updatePartyRow(index, { ignored: true })}
                        className="px-1 py-0.5 border border-gray-300 text-gray-600 text-[10px] rounded hover:bg-gray-50"
                      >
                        Yoksay
                      </button>
                    </>
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
              disabled={
                isAcceptDisabled(
                  shouldShowInstrumentTable(wizardResult.instruments),
                  reviewRows.filter((r) => r.selected).length,
                ) ||
                hasIncompleteSelected(reviewRows.filter((r) => r.selected).map((r) => r.instrument))
              }
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
