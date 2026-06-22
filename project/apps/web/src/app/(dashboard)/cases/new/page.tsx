"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, X, AlertTriangle, Calculator, TrendingUp, Receipt, Banknote, FileCheck, Calendar, XCircle, Info, Search, Users, Building2, Landmark, Edit2, Trash2, Phone, Mail, AlertCircle, Settings } from "lucide-react";
import { ProfessionalClaimItemForm } from "@/components/claim-item";
import { api } from "@/lib/api";
import { buildCreateCaseDuesPayload, faturaDueFieldsFromDebtInfo } from "@/lib/case-due-payload";
import { isPoaDuplicateSuppressed } from "@/lib/poa-ux";
import { resolveLawyerIdsFromScan } from "@/lib/lawyer-match";
import { buildStaffPayload } from "@/lib/case-staff-payload";
import { FormMetadata, SubFormMetadata, FormCategory } from "@/types/form-metadata";
import { WizardAnswers } from "@/types/wizard";
import { formMetadata, filterFormsByCategory } from "@/config/form-metadata";
import { shouldShowLookupBanner, lookupBannerMessage, formToTakipTuruCode } from "./lookup-ui";
import { FormWizard } from "@/components/case/FormWizard";
import { CaseWizard } from "@/components/case/CaseWizard";
import { ResponsibleCandidateSelect, buildAssignBody, type ResponsibleSelection } from "@/components/case/responsible-candidate-select";
import { IlamsizWizard } from "@/components/case/IlamsizWizard";
import { KambiyoWizard } from "@/components/case/KambiyoWizard";
import { CategoryFilter } from "@/components/case/CategoryFilter";
import { FormCard } from "@/components/case/FormCard";
import { FormDetailModal } from "@/components/case/FormDetailModal";
import { FrequentForms } from "@/components/case/FrequentForms";
import { RecentForms } from "@/components/case/RecentForms";
import { DocumentSourceSelector, DocumentSourceType, ClassificationResult, PoaScanResult } from "@/components/case/DocumentSourceSelector";
import { WizardResultCard } from "@/components/case/WizardResultCard";
import { PoaScannerWizard } from "@/components/client/PoaScannerWizard";
import { DebtorStep } from "@/components/debtor";
import { selectedInstrumentsToPayload, routeClaimRawsForManualInstruments, CaseInstrumentPayload } from "@/components/debtor/ocr-instrument";
import { FEATURE_FLAGS } from "@/lib/config/feature-flags";
import { CaseDebtor } from "@/types/debtor";
import { PeriodSelector } from "@/components/case/PeriodSelector";
import { useFormHistory } from "@/hooks/useFormHistory";
import { useUserSettings } from "@/lib/user-settings";
import { useAuth } from "@/lib/auth-context";
import {
  clearCaseWizardDraftState,
  loadCaseWizardDraftState,
  sanitizeCaseDebtorsForSubmit,
  saveCaseWizardDraftState,
} from "@/lib/case-wizard-draft";
import { usePreSubmitValidation } from "@/hooks/useValidation";
import { ValidationError } from "@/lib/api";
import { useLimitationCheck, LimitationCheckResult } from "@/hooks/useLimitationCheck";
import { LimitationWarningModal, LimitationBanner } from "@/components/limitation/LimitationWarningModal";

const steps = [
  { id: 0, title: "Form Seçimi", icon: "📋" },
  { id: 1, title: "Takip Bilgileri", icon: "📝" },
  { id: 2, title: "Avukatlar", icon: "👨‍⚖️" },
  { id: 3, title: "Müvekkiller", icon: "👥" },
  { id: 4, title: "Borçlular", icon: "💰" },
  { id: 5, title: "Alacak Kalemleri", icon: "💵" },
];

// Kalem türü etiketleri
const KALEM_TURU_LABELS: Record<string, string> = {
  ASIL_ALACAK: "Asıl Alacak",
  CEK: "Çek Alacağı",
  SENET: "Senet / Bono Alacağı",
  FATURA: "Fatura Alacağı",
  KIRA: "Kira Alacağı",
  ILAM: "İlam Alacağı",
  NAFAKA: "Nafaka",
  ISLEMIS_FAIZ: "İşlemiş Faiz",
  CEK_TAZMINATI: "Çek Tazminatı",
  KOMISYON: "Komisyon",
  IHTIYATI_HACIZ_HARCI: "İhtiyati Haciz Harcı",
  IHTIYATI_VEKALET: "İhtiyati Haciz Vekalet Ücreti",
  VEKALET_UCRETI: "Vekalet Ücreti",
  KDV: "KDV",
  BSMV: "BSMV",
  KKDF: "KKDF",
  DIGER: "Diğer",
};

// Faiz oranları (2024 güncel)
// NOT: YASAL faiz dönemsel hesaplanmalı (2006-2024: %9, 2024+: %24)
// Bu sabitler sadece referans içindir, gerçek hesaplama backend'de yapılır
const FAIZ_ORANLARI: Record<string, number> = {
  TICARI: 48,
  TICARI_2007_ONCESI: 57,
  YASAL: 24, // 2024 sonrası oran, 2024 öncesi %9
  BANKA_TL: 50,
  KAMU_BANKA_TL: 45,
  KAMU_BANKA_USD: 5,
  KAMU_BANKA_EUR: 4,
};

interface Lawyer { 
  id?: string; 
  name: string; 
  surname: string; 
  displayName?: string; // Unvan Ad Soyad (backend'den gelir)
  title?: string; // Unvan/Sıfat (Av., Stj. Av., Huk. Müş., vb.)
  // Kimlik Bilgileri
  tckn?: string; // TC Kimlik No (zorunlu)
  gender?: "E" | "K" | "D"; // Cinsiyet
  // Mesleki Bilgiler
  barNumber?: string; // Baro Sicil No
  barCity?: string; // Kayıtlı Baro
  tbbNo?: string; // TBB No
  lawyerType?: "BARO" | "KURUM" | "SOZLESMELI"; // Vekil Tipi
  // Vergi Bilgileri
  vergiDairesi?: string; // Vergi Dairesi
  vergiNo?: string; // Vergi No (zorunlu)
  // İletişim
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  // Banka Bilgileri
  bankName?: string;
  iban?: string;
  // Statü
  isInHouseCounsel?: boolean; // Kurum Avukatı
  isEmployee?: boolean; // Sigortalı (SSK'lı)
  // Sistem alanları
  role?: "OWNER" | "PARTNER" | "EMPLOYEE" | "INTERN";
  canSign: boolean; 
  isDefaultForNewCases?: boolean;
  isNew?: boolean; 
  isResponsible?: boolean; // Bu dosyada sorumlu mu
  hasSignatureAuthority?: boolean; // Bu dosyada imza yetkisi
}
interface Party { id?: string; type: "INDIVIDUAL" | "COMPANY"; name: string; identityNo?: string; taxOffice?: string; phone?: string; email?: string; address?: string; isNew?: boolean; }
interface ExecutionOffice { id: string; name: string; city: string; district?: string; uyapCode?: string; taxNumber?: string; bankName?: string; branchName?: string; iban?: string; }
interface DueItem { 
  type: "PRINCIPAL" | "INTEREST" | "EXPENSE" | "VEKALET_UCRETI" | "HARC" | "TAZMINAT" | "CEZAI_SART" | "NAFAKA" | "KIRA" | "AIDAT" | "KOMISYON" | "PRIM" | "OTHER"; 
  description: string; 
  amount: string; 
  dueDate: string;
  // Faiz hesaplama için ek alanlar
  interestType?: "YASAL" | "TICARI" | "AVANS" | "TEMERRUT";
  interestRate?: number;
  interestAmount?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  // FATURA (G2b): scan-only fatura → Due belge/KDV metadata (backend G2a → ClaimItem)
  sourceDocumentNo?: string;
  sourceDocumentType?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  kdvAmount?: number;
}

// ── PR-2a (CLAIM-ITEM-WIZARD-2a): çok-kalemli alacak girişi ──────────────────
// claimDraftItems[] = sihirbazda kullanıcının yönettiği alacak kalemleri listesi.
// `raw` = ProfessionalClaimItemForm'un onItemsChange ile verdiği kalem (AlacakKalemi
// + ilamYanAlacaklar + hesapOzeti). dues[] bu listeden buildDuesFromClaimItem köprüsüyle
// türetilir; createCase sözleşmesi (dues[]) DEĞİŞMEZ. Kambiyo/instruments[] PR-2a'da DOKUNULMAZ.
interface ClaimDraftItem {
  id: string;
  raw: any;
}

function genClaimDraftItemId(): string {
  return `cdi_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// PR-2a eski-draft guard: PR-2a ÖNCESİ draft'larda claimDraftItems yok, yalnız dues var.
// Kaybı önlemek için her Due'yu BİREBİR koruyan minimal bir claimDraftItem'a sarar
// (__legacyDue passthrough; buildDuesFromClaimItem onu aynen geri verir). Belge-özel
// metadata ÜRETİLMEZ — yalnız mevcut dues korunur (silent boş gönderme engellenir).
function hydrateClaimDraftItemsFromDues(dues: DueItem[]): ClaimDraftItem[] {
  return dues.map((due) => ({
    id: genClaimDraftItemId(),
    raw: {
      __legacyDue: due,
      kalemTuru: 'ASIL_ALACAK',
      bakiyeTutar: parseFloat(due.amount) || 0,
      vadeTarihi: due.dueDate,
      currency: 'TRY',
    },
  }));
}

function claimItemKalemLabel(kalemTuru?: string): string {
  switch (kalemTuru) {
    case 'CEK': return 'Çek Bedeli';
    case 'SENET': return 'Senet Bedeli';
    case 'ILAM': return 'İlam Asıl Alacağı';
    case 'FATURA': return 'Fatura Alacağı';
    case 'KIRA': return 'Kira Alacağı';
    case 'NAFAKA': return 'Nafaka Alacağı';
    default: return 'Asıl Alacak';
  }
}

// Tek bir alacak kalemini (form çıktısı) DueItem[]'a çevirir — MEVCUT KÖPRÜ.
// (Eski onItemsChange mantığının BİREBİR aynısı; tek-kalem → çok-kalem refactor'unda
// tekrar kullanılabilir saf fonksiyona çıkarıldı.) Çek kimliği persist EDİLMEZ (PR-2a kapsamı:
// yalnız ibrazTarihi → interestStartDate, eskisiyle aynı). startDate = caseData.startDate.
function buildDuesFromClaimItem(item: any, startDate: string): DueItem[] {
  const newDues: DueItem[] = [];
  if (!item) return newDues;
  // PR-2a eski-draft guard: hydrate edilmiş legacy Due passthrough → BİREBİR korunur
  // (type/amount/description/dueDate/interest), normal köprü mantığına girmeden.
  if (item.__legacyDue) return [item.__legacyDue as DueItem];
  const kalemTuru = item.kalemTuru as string;
  const anaKalemLabel = claimItemKalemLabel(kalemTuru);

  // 1. Ana Alacak Kalemi
  if (item.bakiyeTutar && item.bakiyeTutar > 0) {
    newDues.push({
      type: 'PRINCIPAL',
      description: anaKalemLabel,
      amount: item.bakiyeTutar.toString(),
      dueDate: item.vadeTarihi || startDate,
      interestType: item.takipOncesiFaiz || 'YASAL',
      interestRate: 0,
      interestAmount: 0,
      interestStartDate: kalemTuru === 'CEK' && item.cekBilgileri?.ibrazTarihi
        ? item.cekBilgileri.ibrazTarihi
        : item.vadeTarihi,
      interestEndDate: startDate,
    });
  }

  // 2. İlamlı Takip Yan Alacakları
  if (item.ilamYanAlacaklar && Array.isArray(item.ilamYanAlacaklar)) {
    item.ilamYanAlacaklar.forEach((yan: { tur: string; tutar: number; aciklama: string }) => {
      if (yan.tutar > 0) {
        let yanDueType: DueItem['type'] = 'PRINCIPAL';
        let yanLabel = yan.aciklama;
        if (yan.tur === 'ILAM_YARGILAMA_GIDERI') {
          yanDueType = 'EXPENSE';
          yanLabel = 'Yargılama Giderleri';
        } else if (yan.tur === 'ILAM_VEKALET_UCRETI') {
          yanDueType = 'VEKALET_UCRETI';
          yanLabel = 'Karşı Taraf Vekalet Ücreti';
        } else if (yan.tur === 'ILAM_ISLEMIS_FAIZ') {
          yanDueType = 'INTEREST';
          yanLabel = 'İşlemiş Faiz (Dava-İlam Arası)';
        }
        newDues.push({
          type: yanDueType,
          description: yanLabel,
          amount: yan.tutar.toString(),
          dueDate: item.vadeTarihi || startDate,
          interestType: yanDueType === 'INTEREST' ? undefined : 'YASAL',
          interestRate: 0,
          interestAmount: 0,
          interestStartDate: item.vadeTarihi,
          interestEndDate: startDate,
        });
      }
    });
  }

  return newDues;
}

// ── PR-2b-2: kambiyo (CEK/SENET) routing — tek karar routeClaimRawsForManualInstruments (ocr-instrument, saf+testable) ──
// Flag ON: TAM kambiyo → instruments[] (source:MANUAL), dues'a DEĞİL (K1); eksik kambiyo → dues fallback.
// Flag OFF: hepsi dues (PR-2a).
function claimItemsToDues(items: ClaimDraftItem[], startDate: string, manualInstrumentsEnabled: boolean): DueItem[] {
  const { remainingForDues } = routeClaimRawsForManualInstruments(items.map(ci => ci.raw), manualInstrumentsEnabled);
  return remainingForDues.flatMap(raw => buildDuesFromClaimItem(raw, startDate));
}

function claimItemsToManualInstruments(items: ClaimDraftItem[], manualInstrumentsEnabled: boolean): CaseInstrumentPayload[] {
  return routeClaimRawsForManualInstruments(items.map(ci => ci.raw), manualInstrumentsEnabled).manualInstruments;
}

interface LookupItem { id: string; code: string; name: string; description?: string; color?: string; uyapCode?: string; sortOrder: number; }
interface TakipTuruItem extends LookupItem { defaultMahiyetTipiId?: string; defaultBorcluTipiId?: string; }
interface Lookups { takipTuru: TakipTuruItem[]; asama: LookupItem[]; risk: LookupItem[]; borcluTipi: LookupItem[]; durumEtiketi: LookupItem[]; mahiyetTipi: LookupItem[]; }

export default function NewCasePage() {
  const router = useRouter();
  const { recordUsage, recentForms, frequentForms } = useFormHistory();
  const { settings, loaded: settingsLoaded } = useUserSettings();
  const { user, tenant, loading: authLoading } = useAuth();
  const wizardTenantId = tenant?.id || user?.tenantId || null;
  const wizardUserId = user?.id || null;
  const { errors: validationErrors, warnings: validationWarnings, validateCaseCreation, clearValidation, hasErrors: hasValidationErrors } = usePreSubmitValidation();
  const { checkLimitation, result: limitationResult, logRisk } = useLimitationCheck();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showValidationPanel, setShowValidationPanel] = useState(false);
  const [showLimitationModal, setShowLimitationModal] = useState(false);
  const [limitationCheckResult, setLimitationCheckResult] = useState<LimitationCheckResult | null>(null);
  const [showWizard, setShowWizard] = useState(true);
  const [showDocumentSelector, setShowDocumentSelector] = useState(true);
  const [documentSource, setDocumentSource] = useState<DocumentSourceType>(null);
  const [lastWizardStep, setLastWizardStep] = useState<number>(1); // Wizard'ın son kaldığı adım
  const [wizardAnswersCache, setWizardAnswersCache] = useState<{ isKira: boolean | null }>({ isKira: null }); // Wizard cevapları
  const [ocrResult, setOcrResult] = useState<ClassificationResult | null>(null);
  const [wizardResult, setWizardResult] = useState<{
    subCategory: "GENEL" | "NAFAKA" | "DOVIZ"; currency: string; interestRateType: string;
    interestDescription: string; recommendation: string; explanation: string;
  } | null>(null);
  
  useEffect(() => {
    if (settingsLoaded) {
      setShowWizard(settings.showWizardOnNewCase);
      if (!settings.showWizardOnNewCase) setShowDocumentSelector(false);
      if (settings.defaultExecutionPath) setCaseData(prev => ({ ...prev, executionPath: settings.defaultExecutionPath }));
    }
  }, [settingsLoaded, settings.showWizardOnNewCase, settings.defaultExecutionPath]);

  const [wizardAnswers, setWizardAnswers] = useState<WizardAnswers | null>(null);
  const [recommendedForm, setRecommendedForm] = useState<FormMetadata | null>(null);
  const [selectedForm, setSelectedForm] = useState<FormMetadata | null>(null);
  const [selectedSubForm, setSelectedSubForm] = useState<SubFormMetadata | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FormCategory | "ALL">("ALL");
  const [detailModalForm, setDetailModalForm] = useState<FormMetadata | null>(null);
  const [existingLawyers, setExistingLawyers] = useState<any[]>([]);
  const [existingClients, setExistingClients] = useState<any[]>([]);
  const [existingDebtors, setExistingDebtors] = useState<any[]>([]);
  const [existingStaff, setExistingStaff] = useState<any[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<any[]>([]);
  // PR-ASSIGN-2b: /staff listesi başarıyla yüklendi mi? Payload'da undefined-vs-[] ayrımı için
  // şart — yüklendiyse seçim DAİMA dizi (deselection korunur), yüklenmediyse undefined (default).
  const [staffListLoaded, setStaffListLoaded] = useState(false);
  const [teamTab, setTeamTab] = useState<"lawyers" | "staff">("lawyers");
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [caseData, setCaseData] = useState({ 
    fileNumber: "", executionFileNumber: "", startDate: new Date().toISOString().split("T")[0], 
    notes: "", executionPath: "HACIZ", executionOfficeId: "", uyapBirimKodu: "",
    caseStatus: "DERDEST", hasArticle4Request: false,
    subCategory: "GENEL" as "GENEL" | "NAFAKA" | "DOVIZ" | "CEK" | "SENET" | "FATURA" | "KIRA",
    currency: "TRY" as "TRY" | "USD" | "EUR" | "GBP" | "CHF",
    interestType: "YASAL", interestDescription: "",
    nafakaStartDate: "", monthlyNafakaAmount: "",
    exchangeDate: "", exchangeRateType: "ODEME_TARIHI" as "TAKIP_TARIHI" | "ODEME_TARIHI",
    // Yeni lookup alanları
    takipTuruId: "", asamaId: "", riskId: "", durumEtiketiId: "",
    mahiyetTipiId: "", mahiyetKodu: "",
    sorumluPersonelId: "", dahiliNot: "", muvekkilNotu: "",
  });
  const [executionOffices, setExecutionOffices] = useState<ExecutionOffice[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [detectedCity, setDetectedCity] = useState<string>(""); // Konum tespiti ile bulunan il
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [creditors, setCreditors] = useState<Party[]>([]);
  const [debtors, setDebtors] = useState<Party[]>([]); // Eski format (geriye uyumluluk)
  const [caseDebtors, setCaseDebtors] = useState<CaseDebtor[]>([]); // Yeni format
  const [dues, setDues] = useState<DueItem[]>([]);
  const [instruments, setInstruments] = useState<CaseInstrumentPayload[]>([]); // PR-N4b: OCR kambiyo evrakları → createCase payload instruments[]
  // PR-2a: çok-kalemli alacak girişi. claimDraftItems[] tek otorite; dues[] bundan türetilir.
  const [claimDraftItems, setClaimDraftItems] = useState<ClaimDraftItem[]>([]);
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null); // null = yeni kalem ekleme
  const [claimEditorKey, setClaimEditorKey] = useState(0); // editör formunu reset/yükle için remount anahtarı
  const [claimFormBuffer, setClaimFormBuffer] = useState<any | null>(null); // editördeki güncel (henüz eklenmemiş) kalem
  const [lookups, setLookups] = useState<Lookups>({ takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [], mahiyetTipi: [] });
  const [lookupsLoadFailed, setLookupsLoadFailed] = useState(false); // PR-D: /lookups fetch hatası → açık uyarı banner'ı (boş veriden ayrı)
  
  // Vekalet kontrolü state'leri
  const [poaWarnings, setPoaWarnings] = useState<{ clientId: string; clientName: string; lawyerId: string; lawyerName: string; message: string; }[]>([]);
  
  // Masraf mail onay modalı
  const [showExpenseConfirmModal, setShowExpenseConfirmModal] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const [checkingPoa, setCheckingPoa] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; surname: string; role?: string; isActive?: boolean; }[]>([]);
  // M2-G3c: Dosya Sorumlusu = gerçek kişi (Lawyer/StaffMember) seçimi. Zorunlu; create sonrası PATCH ile yazılır.
  const [responsiblePerson, setResponsiblePerson] = useState<ResponsibleSelection | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  // LocalStorage'dan taslak yükle (sayfa yenilendiğinde) - EN ÖNCE ÇALIŞMALI
  useEffect(() => {
    // URL'de ?new=true varsa taslağı yükleme, sıfırdan başla
    if (authLoading) return;

    const draftScope = { tenantId: wizardTenantId, userId: wizardUserId };
    const urlParams = new URLSearchParams(window.location.search);
    const isNewStart = urlParams.get('new') === 'true';
    
    if (isNewStart) {
      // Yeni başlangıç - taslağı temizle ve sıfırdan başla
      clearCaseWizardDraftState(draftScope);
      setDraftLoaded(true);
      return;
    }
    
    const savedState = loadCaseWizardDraftState(draftScope);
    if (savedState) {
      console.log("📦 Taslak yükleniyor:", savedState.savedAt);
      console.log("📦 Kaydedilmiş avukatlar:", savedState.lawyers?.length || 0);
      
      // State'leri geri yükle
      if (savedState.currentStep !== undefined) setCurrentStep(savedState.currentStep);
      if (savedState.lawyers?.length > 0) {
        console.log("📦 Avukatlar yükleniyor:", savedState.lawyers);
        setLawyers(savedState.lawyers);
      }
      if (savedState.creditors?.length > 0) setCreditors(savedState.creditors);
      if (savedState.caseDebtors?.length > 0) setCaseDebtors(savedState.caseDebtors);
      if (savedState.selectedStaff?.length > 0) setSelectedStaff(savedState.selectedStaff);
      if (savedState.dues?.length > 0) setDues(savedState.dues);
      // PR-2a + eski-draft guard: claimDraftItems varsa onu kullan; yoksa ama dues varsa
      // (PR-2a öncesi draft) dues'tan minimal hydrate et → liste boş kalmaz, kalem kaybı önlenir.
      if (savedState.claimDraftItems?.length > 0) {
        setClaimDraftItems(savedState.claimDraftItems);
      } else if (savedState.dues?.length > 0) {
        setClaimDraftItems(hydrateClaimDraftItemsFromDues(savedState.dues));
      }
      if (savedState.instruments?.length > 0) setInstruments(savedState.instruments); // PR-N4b/S4: taslaktan kambiyo evrakları
      if (savedState.caseData) setCaseData(prev => ({ ...prev, ...savedState.caseData }));
      if (savedState.selectedCity) setSelectedCity(savedState.selectedCity);
      if (savedState.documentSource) setDocumentSource(savedState.documentSource);
      if (savedState.showWizard !== undefined) setShowWizard(savedState.showWizard);
      if (savedState.showDocumentSelector !== undefined) setShowDocumentSelector(savedState.showDocumentSelector);
    }
    setDraftLoaded(true);
  }, [authLoading, wizardTenantId, wizardUserId]);

  // State değişikliklerini localStorage'a kaydet
  useEffect(() => {
    // Hem draft hem data yüklenmeden kaydetme
    if (!draftLoaded || !dataLoaded || authLoading) return;
    
    console.log("💾 Taslak kaydediliyor, avukat sayısı:", lawyers.length);
    
    const stateToSave = {
      currentStep,
      lawyers,
      creditors,
      caseDebtors,
      selectedStaff,
      dues,
      claimDraftItems,
      instruments,
      caseData,
      selectedCity,
      documentSource,
      showWizard,
      showDocumentSelector,
    };
    
    saveCaseWizardDraftState(stateToSave, { tenantId: wizardTenantId, userId: wizardUserId });
  }, [currentStep, lawyers, creditors, caseDebtors, selectedStaff, dues, claimDraftItems, instruments, caseData, selectedCity, documentSource, showWizard, showDocumentSelector, draftLoaded, dataLoaded, authLoading, wizardTenantId, wizardUserId]);

  // Mevcut verileri yükle - draftLoaded olduktan sonra
  useEffect(() => {
    if (draftLoaded) {
      loadExistingData();
    }
  }, [draftLoaded]);

  // A2: Dosya Sorumlusu varsayılanı = oturum açan kullanıcı. Draft uygulandıktan (draftLoaded) SONRA
  // çalışır ve YALNIZ alan boşsa doldurur → kayıtlı draft / elle seçim ezilmez (yeni dosya sahipsiz kalmasın).
  useEffect(() => {
    if (draftLoaded && user?.id) {
      setCaseData(prev => prev.sorumluPersonelId ? prev : { ...prev, sorumluPersonelId: user.id });
    }
  }, [draftLoaded, user?.id]);
  
  // Varsayılan il ayarını uygula
  useEffect(() => {
    if (settingsLoaded && settings.defaultCity && !selectedCity) {
      setSelectedCity(settings.defaultCity);
    }
  }, [settingsLoaded, settings.defaultCity]);
  
  // Konum tespiti ile il belirleme (opsiyonel)
  useEffect(() => {
    if (!settings.defaultCity && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            // Koordinatlardan il bulmak için reverse geocoding
            const { latitude, longitude } = position.coords;
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=tr`
            );
            const data = await response.json();
            const city = data.address?.province || data.address?.city || data.address?.state;
            if (city) {
              // Türkçe il adını normalize et
              const normalizedCity = city.replace(' Province', '').replace(' İli', '').trim();
              setDetectedCity(normalizedCity);
            }
          } catch (e) {
            console.log('Konum tespiti yapılamadı');
          }
        },
        () => { /* Konum izni verilmedi */ },
        { timeout: 5000 }
      );
    }
  }, [settings.defaultCity]);

  // Lookups yüklendiğinde ve documentSource seçildiğinde mahiyet tipini otomatik ayarla
  useEffect(() => {
    if (lookups.mahiyetTipi.length === 0) return; // Lookups henüz yüklenmedi
    if (!documentSource) return; // Document source henüz seçilmedi
    if (caseData.takipTuruId) return; // PR-D (D4): takip türü zaten ATANMIŞ ise dokunma. Guard mahiyetTipiId yerine takipTuruId'ye taşındı → draft rehydration'da mahiyetTipiId dolu/takipTuruId boş edge'inde takip türü yeniden atanabilir; kullanıcı seçimini ezmez (yalnız boşken atar).
    
    // Document source'a göre varsayılan mahiyet tipini belirle
    // Veritabanındaki mahiyet kodları: PARA, KIRA, AIDAT, KREDI, NAFAKA, KIRA_FARK, FATURA, CEK, SENET, TAZMINAT, ICRA_INKAR, ISCILIK, DIGER
    let mahiyetCode: string | null = null;
    let takipTuruCode: string | null = null;
    
    if (documentSource === "ILAM") {
      mahiyetCode = "TAZMINAT";
      takipTuruCode = "ILAMLI";
    } else if (documentSource === "KAMBIYO") {
      // Kambiyo için subCategory'ye göre belirle (CEK veya SENET)
      mahiyetCode = caseData.subCategory === "CEK" ? "CEK" : "SENET";
      takipTuruCode = caseData.subCategory === "CEK" ? "KAMBIYO_CEK" : "KAMBIYO_SENET";
    } else if (documentSource === "SOZLESME") {
      // Sözleşme/Fatura/Diğer için varsayılan olarak PARA (Genel Para Alacağı) kullan
      // Kullanıcı wizard'dan farklı bir mahiyet seçerse o kullanılır (FATURA, AIDAT vb.)
      mahiyetCode = "PARA";
      takipTuruCode = "ILAMSIZ_GENEL";
    }
    
    if (mahiyetCode) {
      const mahiyet = lookups.mahiyetTipi.find(m => m.code === mahiyetCode);
      const takipTuru = lookups.takipTuru.find(t => t.code === takipTuruCode);

      // PR-D (D3): lookups yüklü ama beklenen takip türü kodu yoksa = katalog/seed drift.
      // Sessiz kalma → gözlemlenebilir yap. Banner DEĞİL (banner yalnız boş/yüklenememiş lookup için).
      if (takipTuruCode && !takipTuru) {
        console.warn(`[lookup] beklenen takip türü kodu katalogda yok: ${takipTuruCode} (documentSource=${documentSource}) — seed/katalog drift olabilir`);
      }
      console.log(`[useEffect] Mahiyet tipi ayarlanıyor: ${mahiyetCode} -> ${mahiyet?.id}`);
      
      if (mahiyet || takipTuru) {
        setCaseData(prev => ({
          ...prev,
          mahiyetTipiId: mahiyet?.id || prev.mahiyetTipiId,
          mahiyetKodu: mahiyet?.code || mahiyetCode || prev.mahiyetKodu,
          takipTuruId: takipTuru?.id || prev.takipTuruId,
        }));
      }
    }
  }, [lookups.mahiyetTipi, lookups.takipTuru, documentSource, caseData.subCategory]);

  const loadExistingData = async () => {
    try {
      let staffLoadFailed = false; // PR-ASSIGN-2b: /staff fetch hatası → payload'da undefined fallback
      let lookupsFetchFailed = false; // PR-D: /lookups fetch hatası → açık uyarı banner'ı (boş veriden ayrı)
      const [lawyersRes, clientsRes, debtorsRes, officesRes, lookupsRes, usersRes, staffRes] = await Promise.all([
        api.getLawyers().catch((e) => { console.error("getLawyers error:", e); return []; }), 
        api.get('/clients').catch((e) => { console.error("getClients error:", e); return { data: { data: [] } }; }), 
        api.searchDebtors().catch((e) => { console.error("searchDebtors error:", e); return []; }), 
        api.get('/execution-offices').catch(() => ({ data: { data: [] } })),
        api.get('/lookups').catch(() => { lookupsFetchFailed = true; return { data: { data: { takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [], mahiyetTipi: [] } } }; }),
        api.get('/users').catch(() => ({ data: { data: [] } })),
        api.get('/staff').catch(() => { staffLoadFailed = true; return { data: { data: [] } }; }),
      ]);
      const allLawyers = lawyersRes || [];
      setExistingLawyers(allLawyers);
      console.log("Full clientsRes:", JSON.stringify(clientsRes, null, 2));
      const clientsList = clientsRes?.data?.data || [];
      console.log("Extracted clientsList length:", clientsList.length);
      setExistingClients(clientsList);
      setExistingDebtors(debtorsRes?.data || debtorsRes || []);
      setExecutionOffices(officesRes?.data?.data || []);
      setLookups(lookupsRes?.data?.data || { takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [], mahiyetTipi: [] });
      setLookupsLoadFailed(lookupsFetchFailed); // PR-D: fetch hatası vs boş veri ayrımı için
      setUsers(usersRes?.data?.data || []);
      const allStaff = staffRes?.data?.data || [];
      setExistingStaff(allStaff);
      // PR-ASSIGN-2b: yalnız /staff başarıyla yüklendiyse payload'da staff[] gönderilecek
      // (yüklenemediyse undefined → backend default personel). Boş [] gönderip default'ları düşürmeyiz.
      setStaffListLoaded(!staffLoadFailed);
      
      // Varsayılan avukatları otomatik seç (localStorage'dan veya mevcut seçimden yüklenmemişse)
      // lawyers state'i zaten localStorage'dan yüklendiyse dokunma
      setLawyers(currentLawyers => {
        if (currentLawyers.length > 0) {
          console.log("✅ Mevcut avukatlar korunuyor:", currentLawyers.length);
          return currentLawyers;
        }
        
        // Mevcut avukat yoksa varsayılanları yükle
        const defaultLawyers = allLawyers.filter((l: any) => l.isDefaultForNewCases && l.isActive);
        console.log("🔍 Varsayılan avukatlar:", defaultLawyers.length);
        
        if (defaultLawyers.length > 0) {
          const selectedLawyers = defaultLawyers.map((l: any, index: number) => ({
            id: l.id,
            name: l.name,
            surname: l.surname,
            displayName: l.displayName,
            title: l.title,
            barNumber: l.barNumber,
            barCity: l.barCity,
            role: l.role,
            canSign: l.canSign,
            isNew: false,
            isResponsible: index === 0,
            hasSignatureAuthority: l.canSign,
          }));
          console.log("✅ Varsayılan avukatlar yüklendi:", selectedLawyers.length);
          return selectedLawyers;
        }
        
        return currentLawyers;
      });
      
      // Varsayılan personelleri otomatik seç (localStorage'dan veya mevcut seçimden yüklenmemişse)
      setSelectedStaff(currentStaff => {
        if (currentStaff.length > 0) {
          console.log("✅ Mevcut personeller korunuyor:", currentStaff.length);
          return currentStaff;
        }
        
        // Mevcut personel yoksa varsayılanları yükle
        const defaultStaff = allStaff.filter((s: any) => s.isDefaultForNewCases && s.isActive !== false);
        console.log("🔍 Varsayılan personeller:", defaultStaff.length);
        
        if (defaultStaff.length > 0) {
          const selectedStaffList = defaultStaff.map((s: any) => ({
            id: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            staffType: s.staffType,
            roleOnCase: s.staffType,
            canEdit: s.canEditCase || false,
            canApprove: s.canApproveDocuments || false,
            canView: true,
          }));
          console.log("✅ Varsayılan personeller yüklendi:", selectedStaffList.length);
          return selectedStaffList;
        }
        
        return currentStaff;
      });
      
      // Varsayılan aşama: "Dosya Açıldı"
      const defaultAsama = lookupsRes?.data?.data?.asama?.find((a: LookupItem) => a.code === 'DOSYA_ACILDI');
      // Varsayılan durum etiketi: "Yeni Dosya"
      const defaultDurumEtiketi = lookupsRes?.data?.data?.durumEtiketi?.find((d: LookupItem) => d.code === 'YENI_DOSYA' || d.name?.toLowerCase().includes('yeni'));
      if (defaultAsama || defaultDurumEtiketi) {
        setCaseData(prev => ({ 
          ...prev, 
          asamaId: defaultAsama?.id || prev.asamaId,
          durumEtiketiId: defaultDurumEtiketi?.id || prev.durumEtiketiId
        }));
      }
      try {
        const nextFileNumber = await api.getNextFileNumber();
        if (nextFileNumber) setCaseData(prev => ({ ...prev, fileNumber: nextFileNumber }));
      } catch (e) { console.error("Dosya numarası alınamadı:", e); }
      
      // Data yükleme tamamlandı
      setDataLoaded(true);
    } catch (err) { 
      console.error("Mevcut veriler yüklenemedi:", err); 
      setDataLoaded(true); // Hata olsa bile dataLoaded'ı set et
    }
  };

  const handleDocumentSourceSelect = (sourceType: DocumentSourceType, ocrResultData?: ClassificationResult) => {
    setDocumentSource(sourceType);
    setShowDocumentSelector(false);
    if (ocrResultData) {
      setOcrResult(ocrResultData);
      if (ocrResultData.detectedSubCategory === "NAFAKA") setCaseData(prev => ({ ...prev, subCategory: "NAFAKA", currency: "TRY" }));
      else if (ocrResultData.detectedSubCategory === "DOVIZ") setCaseData(prev => ({ ...prev, subCategory: "DOVIZ", currency: "USD" }));
    }
    
    // Belge türüne göre temel ayarları yap (mahiyet tipi useEffect ile otomatik ayarlanacak)
    if (sourceType === "ILAM") {
      setCaseData(prev => ({ ...prev, executionPath: "HACIZ" }));
      setShowWizard(true);
      const ilamliForm = formMetadata.find(f => f.code === "FORM_2_3_4_5");
      if (ilamliForm) setSelectedForm(ilamliForm);
    } else if (sourceType === "KAMBIYO") {
      setCaseData(prev => ({ ...prev, executionPath: "HACIZ", subCategory: "SENET" })); // Varsayılan SENET, wizard'da değişebilir
      setShowWizard(true);
    } else if (sourceType === "SOZLESME") {
      setCaseData(prev => ({ ...prev, executionPath: "HACIZ" }));
      setShowWizard(true);
    }
  };

  // Vekaletname tarama sonucunu işle - müvekkil ve vekalet oluştur
  const handlePoaScan = async (result: PoaScanResult) => {
    try {
      // 1. Müvekkil oluştur
      const clientData = {
        type: result.clientType,
        firstName: result.firstName,
        lastName: result.lastName,
        companyName: result.companyName,
        tckn: result.tckn,
        vkn: result.vkn,
        taxOffice: result.taxOffice,
        phone: result.phone,
        email: result.email,
        address: result.address,
        city: result.city,
        district: result.district,
        canCollect: result.canCollect,
        canWaive: result.canWaive,
        canSettle: result.canSettle,
        canRelease: result.canRelease,
      };
      
      const clientResponse = await api.post("/clients", clientData);
      // API { data: client } döndürüyor, axios da { data: ... } sarıyor
      const savedClient = clientResponse.data?.data || clientResponse.data || clientResponse;
      
      if (!savedClient?.id) {
        throw new Error("Müvekkil kaydedilemedi - ID alınamadı");
      }
      
      console.log("Müvekkil kaydedildi:", savedClient.id, savedClient.displayName);
      
      // 2. Vekalet oluştur
      const poaData = {
        clientId: savedClient.id,
        notaryName: result.notaryName,
        notaryCity: result.notaryCity,
        journalNo: result.poaNumber,
        poaNumber: result.poaNumber,
        dateIssued: result.poaDate ? new Date(result.poaDate) : undefined,
        isLimited: result.isLimited || false,
        validUntil: result.validUntil ? new Date(result.validUntil) : undefined,
        scopeType: result.scopeType || "GENEL",
        scopeDescription: result.scopeDescription,
        canCollect: result.canCollect,
        canWaive: result.canWaive,
        canSettle: result.canSettle,
        canRelease: result.canRelease,
        // Avukatları bul ve ekle
        lawyerIds: [] as string[],
      };
      
      // Avukatları eşleştir: tam-ad normalize + TCKN/baro sinyali + mükerrer
      // kayıtlarda kanonik tercih. Saf/test edilebilir mantık: lib/lawyer-match.ts
      poaData.lawyerIds = resolveLawyerIdsFromScan(result, existingLawyers);

      const poaRes = await api.post("/poa", poaData);
      // PR-2a: aynı vekalet zaten kayıtlıysa backend yeni açmaz; mesajı buna göre ver.
      const poaSuppressed = isPoaDuplicateSuppressed(poaRes);

      // 3. Müvekkil listesini yenile ve seçili olarak ekle
      const clientsRes = await api.get("/clients");
      setExistingClients(clientsRes.data?.data || []);
      addExistingCreditor(savedClient);

      // 4. Bilgi mesajı göster
      alert(poaSuppressed
        ? `✅ Müvekkil "${savedClient.displayName}" kaydedildi.\n\nBu vekalet zaten kayıtlıydı; yeni kayıt açılmadı, mevcut kayıt kullanıldı.\n\nŞimdi takip türünü seçebilirsiniz.`
        : `✅ Müvekkil "${savedClient.displayName}" ve vekalet kaydı başarıyla oluşturuldu!\n\nŞimdi takip türünü seçebilirsiniz.`);
      
    } catch (err: any) {
      alert(`Hata: ${err.message || "Müvekkil veya vekalet oluşturulamadı"}`);
    }
  };

  // Vekalet kontrolü - müvekkil ve avukat kombinasyonları için
  // Seçili avukatlardan herhangi birine verilmiş vekalet varsa geçerli sayılır
  const checkPoaValidity = async () => {
    if (creditors.length === 0 || lawyers.length === 0) {
      setPoaWarnings([]);
      return;
    }

    setCheckingPoa(true);
    const warnings: typeof poaWarnings = [];

    try {
      // Seçili avukatların ID'lerini al
      const lawyerIds = lawyers.filter(l => l.id).map(l => l.id as string);
      
      if (lawyerIds.length === 0) {
        setPoaWarnings([]);
        return;
      }

      for (const creditor of creditors) {
        if (!creditor.id) continue; // Yeni eklenen müvekkiller için kontrol yapma
        
        try {
          // Yeni endpoint: Seçili avukatlardan herhangi birine verilmiş vekalet var mı?
          const response = await api.post('/poa/check/valid-for-lawyers', {
            clientId: creditor.id,
            lawyerIds: lawyerIds,
          });
          const result = response.data;
          
          if (!result.isValid) {
            warnings.push({
              clientId: creditor.id,
              clientName: creditor.name,
              lawyerId: "", // Artık tek avukat değil
              lawyerName: "Seçili avukatlar",
              message: result.message || "Seçili avukatlardan hiçbirine verilmiş geçerli vekalet bulunamadı",
            });
          } else if (result.daysRemaining !== undefined && result.daysRemaining <= 30) {
            warnings.push({
              clientId: creditor.id,
              clientName: creditor.name,
              lawyerId: "",
              lawyerName: "Seçili avukatlar",
              message: result.message || `Vekalet ${result.daysRemaining} gün içinde sona erecek`,
            });
          }
        } catch (err) {
          // API hatası - sessizce geç
          console.error("Vekalet kontrolü hatası:", err);
        }
      }
      
      setPoaWarnings(warnings);
    } finally {
      setCheckingPoa(false);
    }
  };

  // Müvekkil veya avukat değiştiğinde vekalet kontrolü yap
  useEffect(() => {
    if (currentStep >= 2) {
      checkPoaValidity();
    }
  }, [creditors, lawyers, currentStep]);

  const handleWizardComplete = (recommendedFormCode: string) => {
    const recommended = formMetadata.find(f => f.code === recommendedFormCode) || null;
    setRecommendedForm(recommended); setShowWizard(false);
    if (recommended) setSelectedForm(recommended);
  };

  const handleFormSelect = (form: FormMetadata, subForm?: SubFormMetadata) => {
    setSelectedForm(form); setSelectedSubForm(subForm || null); setError("");
    // PR-2: Manuel form seçimi de (sihirbaz gibi) 2. adım Sınıflandırma'sını ÖN-doldursun.
    // Önceden yalnız documentSource'a bağlı useEffect seed ederdi; "Manuel Takip Aç" yolunda
    // documentSource=null kaldığı için Sınıflandırma BOŞ geliyordu. Form → kanonik takipTürü
    // kodu (formToTakipTuruCode) → mevcut handleTakipTuruChange ile mahiyet + borçlu tipi türetilir
    // (kod tekrarı yok). Sihirbaz yolları (CaseWizard/Kambiyo/Ilamsiz) handleFormSelect KULLANMAZ,
    // kendi seed'ini yapar → çift-seed yok.
    const takipTuruCode = formToTakipTuruCode(form.code, subForm?.code);
    if (takipTuruCode) {
      const takipTuru = lookups.takipTuru.find(t => t.code === takipTuruCode);
      if (takipTuru) {
        handleTakipTuruChange(takipTuru.id);
      } else {
        console.warn(`[form-seed] beklenen takip türü kodu katalogda yok: ${takipTuruCode} (form=${form.code}) — seed/katalog drift olabilir`);
      }
    }
    if (!form.subForms || form.subForms.length === 0 || subForm) setCurrentStep(1);
  };

  const handleCaseDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setCaseData(prev => ({ ...prev, [name]: newValue }));
  };

  // Takip türü seçildiğinde otomatik doldurma (Risk hariç - manuel belirlenir)
  const handleTakipTuruChange = (takipTuruId: string) => {
    const selectedTakipTuru = lookups.takipTuru.find(t => t.id === takipTuruId);
    
    console.log(`[TakipTuru] Değişti: ${selectedTakipTuru?.code} (${selectedTakipTuru?.name})`);
    
    setCaseData(prev => {
      const updates: Partial<typeof prev> = { takipTuruId };
      
      if (selectedTakipTuru) {
        // Takip türüne göre mahiyet kodunu otomatik ayarla
        // Veritabanındaki mahiyet kodları: PARA, KIRA, AIDAT, KREDI, NAFAKA, KIRA_FARK, FATURA, CEK, SENET, TAZMINAT, ICRA_INKAR, ISCILIK, TAHLIYE, DIGER
        // PR-D (D5): yalnız kanonik takip türü kodları (lookup-catalog.ts ile hizalı).
        // Ölü anahtarlar kaldırıldı: ILAMSIZ_KAMBIYO, ILAMSIZ_FATURA, KIRA, TAHLIYE (kanonik değil → asla eşleşmezdi).
        const takipTuruMahiyetMap: Record<string, string> = {
          KAMBIYO_CEK: "CEK",
          KAMBIYO_SENET: "SENET",
          ILAMSIZ_GENEL: "PARA",
          ILAMSIZ_KIRA: "KIRA",
          ILAMSIZ_TAHLIYE: "TAHLIYE",
          ILAMLI: "TAZMINAT",
          NAFAKA: "NAFAKA",
          REHIN_TASINIR: "REHIN",
          REHIN_TASINMAZ: "IPOTEK",
          IFLAS_ADI: "PARA",
          IFLAS_KAMBIYO: "SENET",
        };
        
        const mahiyetKodu = takipTuruMahiyetMap[selectedTakipTuru.code];
        if (mahiyetKodu) {
          const mahiyet = lookups.mahiyetTipi.find(m => m.code === mahiyetKodu);
          if (mahiyet) {
            updates.mahiyetTipiId = mahiyet.id;
            updates.mahiyetKodu = mahiyet.code;
          }
        } else if (selectedTakipTuru.defaultMahiyetTipiId) {
          // Varsayılan Mahiyet Tipi (map'te yoksa)
          updates.mahiyetTipiId = selectedTakipTuru.defaultMahiyetTipiId;
          const mahiyet = lookups.mahiyetTipi.find(m => m.id === selectedTakipTuru.defaultMahiyetTipiId);
          if (mahiyet) updates.mahiyetKodu = mahiyet.code;
        }
        
        // Risk durumu otomatik atanmaz - dosya açıldıktan sonra manuel belirlenir
      }
      
      return { ...prev, ...updates };
    });
  };

  const [uyapWarning, setUyapWarning] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<ExecutionOffice | null>(null);
  
  const handleOfficeChange = (officeId: string) => {
    setCaseData(prev => ({ ...prev, executionOfficeId: officeId }));
    const office = executionOffices.find(o => o.id === officeId);
    setSelectedOffice(office || null);
    if (office?.uyapCode) { setCaseData(prev => ({ ...prev, uyapBirimKodu: office.uyapCode || '' })); setUyapWarning(false); }
    else if (officeId) { setCaseData(prev => ({ ...prev, uyapBirimKodu: '' })); setUyapWarning(true); }
    else setUyapWarning(false);
  };

  const filteredOffices = selectedCity ? executionOffices.filter(o => o.city.toLowerCase() === selectedCity.toLowerCase()) : executionOffices;
  
  // İl isimlerini normalize et (İSTANBUL -> İstanbul)
  const normalizeCity = (city: string) => city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
  const allCities = [...new Set(executionOffices.map(o => normalizeCity(o.city)))];
  
  // Sıralama: 1) Varsayılan/Tespit edilen il, 2) İstanbul, Ankara, İzmir, 3) Alfabetik
  const userCity = settings.defaultCity || detectedCity;
  const bigCities = ['İstanbul', 'Ankara', 'İzmir'];
  const cities = [
    // Kullanıcının ili (varsa ve listede varsa)
    ...(userCity && allCities.some(c => c.toLowerCase() === userCity.toLowerCase()) && !bigCities.some(b => b.toLowerCase() === userCity.toLowerCase()) ? [userCity] : []),
    // Üç büyük il
    ...bigCities.filter(c => allCities.some(a => a.toLowerCase() === c.toLowerCase())),
    // Geri kalanı alfabetik
    ...allCities.filter(c => !bigCities.some(b => b.toLowerCase() === c.toLowerCase()) && c.toLowerCase() !== userCity?.toLowerCase()).sort((a, b) => a.localeCompare(b, 'tr'))
  ];

  const addExistingLawyer = (lawyer: any) => { 
    if (!lawyers.find(l => l.id === lawyer.id)) {
      setLawyers([...lawyers, { 
        ...lawyer, 
        canSign: lawyer.canSign || false, 
        isNew: false,
        isResponsible: lawyers.length === 0, // İlk eklenen sorumlu olsun
        hasSignatureAuthority: lawyer.canSign || false,
      }]); 
    }
  };
  const addNewLawyer = () => setLawyers([...lawyers, { name: "", surname: "", barNumber: "", canSign: false, isNew: true }]);
  const updateLawyer = (index: number, field: keyof Lawyer, value: any) => { const updated = [...lawyers]; updated[index] = { ...updated[index], [field]: value }; setLawyers(updated); };
  const removeLawyer = (index: number) => setLawyers(lawyers.filter((_, i) => i !== index));

  const addExistingCreditor = (client: any) => { if (!creditors.find(c => c.id === client.id)) setCreditors([...creditors, { ...client, isNew: false }]); };
  const addNewCreditor = () => setCreditors([...creditors, { type: "INDIVIDUAL", name: "", isNew: true }]);
  const updateCreditor = (index: number, field: keyof Party, value: any) => { const updated = [...creditors]; updated[index] = { ...updated[index], [field]: value }; setCreditors(updated); };
  const removeCreditor = (index: number) => setCreditors(creditors.filter((_, i) => i !== index));

  const addExistingDebtor = (debtor: any) => { if (!debtors.find(d => d.id === debtor.id)) setDebtors([...debtors, { ...debtor, isNew: false }]); };
  const addNewDebtor = () => setDebtors([...debtors, { type: "INDIVIDUAL", name: "", isNew: true }]);
  const updateDebtor = (index: number, field: keyof Party, value: any) => { const updated = [...debtors]; updated[index] = { ...updated[index], [field]: value }; setDebtors(updated); };
  const removeDebtor = (index: number) => setDebtors(debtors.filter((_, i) => i !== index));

  const addNewDue = () => setDues([...dues, { type: "PRINCIPAL", description: "", amount: "", dueDate: new Date().toISOString().split("T")[0] }]);
  const updateDue = (index: number, field: keyof DueItem, value: any) => { const updated = [...dues]; updated[index] = { ...updated[index], [field]: value }; setDues(updated); };
  const removeDue = (index: number) => setDues(dues.filter((_, i) => i !== index));

  // ── PR-2a: çok-kalemli alacak girişi yönetimi ───────────────────────────────
  // claimDraftItems[] tek otorite; her mutasyonda dues[] buildDuesFromClaimItem köprüsüyle
  // yeniden türetilir (createCase yine dues[] gönderir). instruments[] DOKUNULMAZ.
  const applyClaimDraftItems = (next: ClaimDraftItem[]) => {
    setClaimDraftItems(next);
    const allDues = claimItemsToDues(next, caseData.startDate, FEATURE_FLAGS.MANUAL_CASE_INSTRUMENTS);
    setDues(allDues);
    const principalTotal = allDues
      .filter(d => d.type === 'PRINCIPAL')
      .reduce((sum, d) => sum + parseFloat(d.amount || '0'), 0);
    if (principalTotal > 0) setCaseData(prev => ({ ...prev, principalAmount: principalTotal }));
  };
  const resetClaimEditor = () => {
    setEditingItemIndex(null);
    setClaimFormBuffer(null);
    setClaimEditorKey(k => k + 1);
  };
  const handleAddOrUpdateClaimItem = () => {
    if (!claimFormBuffer || !(Number(claimFormBuffer.bakiyeTutar) > 0)) {
      setError("Alacak kalemi eklemek için geçerli bir bakiye tutarı girin");
      return;
    }
    setError("");
    // PR-2a eski-draft guard: düzenlenen kalem artık birebir-legacy passthrough değildir;
    // __legacyDue'yu temizle ki edit, form değerlerinden yeniden türetilsin (sessiz no-op olmasın).
    const cleanRaw = { ...claimFormBuffer };
    delete cleanRaw.__legacyDue;
    const entry: ClaimDraftItem = {
      id: editingItemIndex !== null ? claimDraftItems[editingItemIndex].id : genClaimDraftItemId(),
      raw: cleanRaw,
    };
    if (editingItemIndex !== null) {
      const updated = [...claimDraftItems];
      updated[editingItemIndex] = entry;
      applyClaimDraftItems(updated);
    } else {
      applyClaimDraftItems([...claimDraftItems, entry]);
    }
    resetClaimEditor();
  };
  const handleEditClaimItem = (index: number) => {
    setEditingItemIndex(index);
    setClaimFormBuffer(claimDraftItems[index]?.raw ?? null);
    setClaimEditorKey(k => k + 1); // formu initialItems ile yeniden mount et
  };
  const handleDeleteClaimItem = (index: number) => {
    const updated = claimDraftItems.filter((_, i) => i !== index);
    applyClaimDraftItems(updated);
    if (editingItemIndex === index) {
      resetClaimEditor();
    } else if (editingItemIndex !== null && index < editingItemIndex) {
      setEditingItemIndex(editingItemIndex - 1);
    }
  };
  const getTotalDues = () => dues.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  const nextStep = () => {
    if (currentStep === 0 && !selectedForm) { setError("Lütfen bir form türü seçin"); return; }
    if (currentStep === 0 && selectedForm?.subForms?.length && !selectedSubForm) { setError("Lütfen bir alt form türü seçin"); return; }
    if (currentStep === 1 && !caseData.fileNumber.trim()) { setError("Takip No zorunludur"); return; }
    if (currentStep === 1 && !caseData.takipTuruId) { setError("Takip türü zorunludur"); return; }
    setError(""); setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  // B2: Adım-bazlı yumuşak uyarı (ilerlemeyi engellemez). Girdiler submit
  // validasyonuyla (handleSubmitClick → validateCaseCreation) birebir aynıdır;
  // amaç eksiği son adım yerine ilgili adımda erken sinyallemektir.
  const getStepSoftNotice = (): { message: string; severity: "warning" | "info" } | null => {
    if (currentStep === 2 && lawyers.filter(l => l.name && l.surname).length === 0)
      return { message: "Bu adımda henüz avukat eklemediniz. Şimdi ekleyebilir ya da sonra tamamlayabilirsiniz.", severity: "warning" };
    if (currentStep === 3 && creditors.filter(c => c.name).length === 0)
      return { message: "Bu adımda henüz müvekkil eklemediniz. Şimdi ekleyebilir ya da sonra tamamlayabilirsiniz.", severity: "warning" };
    if (currentStep === 4 && caseDebtors.length === 0)
      return { message: "Bu adımda henüz borçlu eklemediniz. Şimdi ekleyebilir ya da sonra tamamlayabilirsiniz.", severity: "warning" };
    if (currentStep === 5 && dues.filter(d => d.amount && parseFloat(d.amount) > 0).length === 0)
      return { message: "Alacak kalemi eklemediniz — dosya oluşturulduktan sonra ekleyebilirsiniz.", severity: "info" };
    return null;
  };

  const goToStep = (stepId: number) => {
    setError("");
    if (stepId === 0) {
      // Step 0'a gidince belge seçiciye dön
      setShowDocumentSelector(true);
      setShowWizard(false);
      setDocumentSource(null);
      setOcrResult(null);
      setSelectedForm(null);
      setSelectedSubForm(null);
    }
    setCurrentStep(stepId);
  };

  const prevStep = () => { 
    setError(""); 
    if (currentStep === 0) {
      // Step 0'da geri akışı:
      // 1. Form listesi görünüyorsa -> belge seçiciye dön
      // 2. Sihirbaz açıksa -> belge seçiciye dön
      // 3. Belge seçici açıksa -> takipler sayfasına dön
      if (!showDocumentSelector && !showWizard) {
        // Form listesi görünüyor - belge seçiciye dön
        setShowDocumentSelector(true);
        setDocumentSource(null);
        setSelectedForm(null);
        setSelectedSubForm(null);
      } else if (showWizard) {
        // Sihirbazdan geri: belge seçiciye dön (belge türü korunur)
        setShowWizard(false);
        setShowDocumentSelector(true);
      } else if (showDocumentSelector) {
        // Belge seçiciden çık - takipler sayfasına dön
        window.history.back();
      }
    } else if (currentStep === 1) {
      // Step 1'den geri: Sihirbaza veya belge seçiciye dön
      if (documentSource) {
        // Belge türü seçilmişse sihirbazı tekrar aç
        setShowWizard(true);
        setShowDocumentSelector(false);
        setSelectedForm(null);
        setSelectedSubForm(null);
      } else {
        // Belge türü seçilmemişse belge seçiciye dön
        setShowDocumentSelector(true);
        setShowWizard(false);
      }
      setCurrentStep(0);
    } else {
      setCurrentStep(prev => Math.max(prev - 1, 0)); 
    }
  };

  const mapCategoryToCaseType = (category: string | undefined): string => {
    // KAMBIYO kategorisi için subCategory'ye göre CHECK veya BOND belirle
    if (category === "KAMBIYO") {
      // subCategory: CEK -> CHECK, SENET -> BOND
      if (caseData.subCategory === "CEK") return "CHECK";
      if (caseData.subCategory === "SENET") return "BOND";
      // Varsayılan: dues'dan belirle
      const firstDue = dues[0];
      if (firstDue?.description?.toLowerCase().includes("çek")) return "CHECK";
      if (firstDue?.description?.toLowerCase().includes("senet") || firstDue?.description?.toLowerCase().includes("bono")) return "BOND";
      return "CHECK"; // Varsayılan
    }
    const mapping: Record<string, string> = { GENEL_ICRA: "GENERAL_EXECUTION", IPOTEK_REHIN: "MORTGAGE", IFLAS: "BANKRUPTCY", KIRA: "RENTAL" };
    return mapping[category || ""] || "GENERAL_EXECUTION";
  };

  // subCategory mapping - Frontend değerlerini Backend enum'una çevir
  const mapSubCategoryToBackend = (subCat: string): "GENEL" | "NAFAKA" | "DOVIZ" | "KIRA" | "CEZA" => {
    switch (subCat) {
      case "NAFAKA": return "NAFAKA";
      case "DOVIZ": return "DOVIZ";
      case "KIRA": return "KIRA";
      case "CEZA": return "CEZA";
      // CEK, SENET, FATURA, ASIL_ALACAK, ILAM -> GENEL
      default: return "GENEL";
    }
  };

  // Takip oluştur butonuna basınca - önce validasyon, sonra modal
  const handleSubmitClick = () => {
    setError(""); 
    
    // Backend'e gönderilecek subCategory değerini hesapla
    const backendSubCategory = mapSubCategoryToBackend(caseData.subCategory);

    // PR-2a: düzenleyicide bekleyen geçerli kalemi (henüz "Listeye Ekle" denmemiş) tek-kalem
    // kolaylığı için listeye dahil et. dues[] daima claimDraftItems[]'tan türetilir; createCase
    // sözleşmesi (dues[]) değişmez. Modal yolunda da listeye işlendiği için state taze kalır.
    let effClaimItems = claimDraftItems;
    if (editingItemIndex === null && claimFormBuffer && Number(claimFormBuffer.bakiyeTutar) > 0) {
      effClaimItems = [...claimDraftItems, { id: genClaimDraftItemId(), raw: claimFormBuffer }];
      applyClaimDraftItems(effClaimItems);
      resetClaimEditor();
    }
    let effDues = claimItemsToDues(effClaimItems, caseData.startDate, FEATURE_FLAGS.MANUAL_CASE_INSTRUMENTS);
    // Eski-draft güvenliği: claimDraftItems boş ama dues doluysa (PR-2a öncesi draft / hydrate
    // edilmemiş durum) mevcut dues'u kullan — eski draft SESSİZCE boş gönderilmesin.
    if (effDues.length === 0 && dues.length > 0) {
      effDues = dues;
    }
    // PR-2b-2: manuel kambiyo (CEK/SENET) → instruments[] (source:MANUAL). Flag ON'da dues'tan ÇIKARILDI (K1);
    // OFF'ta boş (kambiyo dues'a gitti = PR-2a). createCase'e effDues ile birlikte taşınır.
    const manualInstruments = claimItemsToManualInstruments(effClaimItems, FEATURE_FLAGS.MANUAL_CASE_INSTRUMENTS);

    // Pre-submit validasyon
    const validation = validateCaseCreation({
      takipTuruId: caseData.takipTuruId,
      sorumluPersonelId: responsiblePerson?.id ?? "", // M2-G3c: zorunluluk artık gerçek kişi seçimine bağlı
      mahiyetKodu: caseData.mahiyetKodu,
      lawyers: lawyers.filter(l => l.name && l.surname),
      creditors: creditors.filter(c => c.name),
      caseDebtors: caseDebtors,
      dues: effDues.filter(d => d.amount && parseFloat(d.amount) > 0),
      subCategory: backendSubCategory,
      currency: caseData.currency,
    });

    // Hata varsa goster ve durdur
    if (!validation.valid) {
      setShowValidationPanel(true);
      setError("Lütfen zorunlu alanları doldurun");
      return;
    }

    // Uyari varsa goster ama devam et
    if (validation.warnings.length > 0) {
      setShowValidationPanel(true);
    }

    // Müvekkil seçilmişse masraf mail modalını göster
    const hasClient = creditors.some(c => c.name);
    if (hasClient) {
      setShowExpenseConfirmModal(true);
    } else {
      // Müvekkil yoksa direkt oluştur
      doCreateCase(false, effDues, manualInstruments);
    }
  };

  // Gerçek takip oluşturma fonksiyonu
  const doCreateCase = async (sendExpenseEmail: boolean, duesToSubmit?: DueItem[], manualInstrumentsToSubmit?: CaseInstrumentPayload[]) => {
    setShowExpenseConfirmModal(false);
    setLoading(true);
    
    // Backend'e gönderilecek subCategory değerini hesapla
    const backendSubCategory = mapSubCategoryToBackend(caseData.subCategory);
    const sanitizedCaseDebtors = sanitizeCaseDebtorsForSubmit(
      caseDebtors,
      existingDebtors.length > 0 ? existingDebtors as any : undefined
    );
    
    try {
      const response = await api.createCase({
        fileNumber: caseData.fileNumber, executionFileNumber: caseData.executionFileNumber || undefined,
        type: mapCategoryToCaseType(selectedForm?.category), subType: selectedSubForm?.code || selectedForm?.code,
        startDate: caseData.startDate || undefined, notes: caseData.notes || undefined,
        executionPath: caseData.executionPath, caseStatus: caseData.caseStatus,
        executionOfficeId: caseData.executionOfficeId || undefined, uyapBirimKodu: caseData.uyapBirimKodu || undefined,
        hasArticle4Request: caseData.hasArticle4Request, subCategory: backendSubCategory, currency: caseData.currency,
        interestType: caseData.interestType, nafakaStartDate: caseData.nafakaStartDate || undefined,
        monthlyNafakaAmount: caseData.monthlyNafakaAmount ? parseFloat(caseData.monthlyNafakaAmount) : undefined,
        exchangeDate: caseData.exchangeDate || undefined, exchangeRateType: caseData.exchangeRateType,
        // Yeni lookup alanları
        takipTuruId: caseData.takipTuruId || undefined, asamaId: caseData.asamaId || undefined,
        riskId: caseData.riskId || undefined,
        durumEtiketiId: caseData.durumEtiketiId || undefined, mahiyetTipiId: caseData.mahiyetTipiId || undefined,
        mahiyetKodu: caseData.mahiyetKodu || undefined, sorumluPersonelId: caseData.sorumluPersonelId || undefined,
        dahiliNot: caseData.dahiliNot || undefined, muvekkilNotu: caseData.muvekkilNotu || undefined,
        // Masraf mail gönderimi seçeneği
        sendExpenseEmail: sendExpenseEmail,
        // PR-ASSIGN-2b: seçilen personel → backend kanonik kayıt. Yüklendiyse DAİMA dizi (boş []
        // = deselection); /staff yüklenemediyse undefined → backend isDefaultForNewCases'e döner.
        staff: buildStaffPayload(selectedStaff, staffListLoaded),
        lawyers: lawyers.filter(l => l.name && l.surname).map(l => ({ 
          id: l.isNew ? undefined : l.id, 
          name: l.name, 
          surname: l.surname, 
          tckn: l.tckn,
          gender: l.gender,
          barNumber: l.barNumber,
          barCity: l.barCity,
          tbbNo: l.tbbNo,
          vergiDairesi: l.vergiDairesi,
          vergiNo: l.vergiNo,
          phone: l.phone,
          email: l.email,
          bankName: l.bankName,
          iban: l.iban,
          isInHouseCounsel: l.isInHouseCounsel,
          isEmployee: l.isEmployee,
          canSign: l.canSign,
          isResponsible: l.isResponsible || false,
          hasSignatureAuthority: l.hasSignatureAuthority || false,
        })),
        creditors: creditors.filter(c => c.name).map(c => ({ id: c.isNew ? undefined : c.id, type: c.type, name: c.name, identityNo: c.identityNo, taxOffice: c.taxOffice, phone: c.phone, email: c.email, address: c.address })),
        // Yeni CaseDebtor formatı
        caseDebtors: sanitizedCaseDebtors.map(cd => ({
          debtorId: cd.debtorId,
          role: cd.role,
          liabilityAmount: cd.liabilityAmount,
          liabilityType: cd.liabilityType,
          notificationMode: cd.notificationMode,
          selectedAddressId: cd.selectedAddressId,
          prepareNotification: cd.prepareNotification,
          ilanenJustification: cd.ilanenJustification,
          caseNote: cd.caseNote,
        })),
        // Eski format (geriye uyumluluk)
        debtors: debtors.filter(d => d.name).map(d => ({ id: d.isNew ? undefined : d.id, type: d.type, name: d.name, identityNo: d.identityNo, taxOffice: d.taxOffice, phone: d.phone, email: d.email, address: d.address })),
        dues: buildCreateCaseDuesPayload(duesToSubmit ?? dues),
        // PR-2b-2: OCR instruments[] (source yok=OCR) + manuel kambiyo (source:MANUAL). Flag OFF → yalnız OCR (PR-2a).
        // Modal yolunda manualInstrumentsToSubmit gelmez → claimDraftItems state'ten türetilir (oturmuş).
        instruments: FEATURE_FLAGS.MANUAL_CASE_INSTRUMENTS
          ? [...instruments, ...(manualInstrumentsToSubmit ?? claimItemsToManualInstruments(claimDraftItems, true))]
          : instruments, // PR-N4b: kambiyo evrakları (CaseInstrumentInputDto[])
      });
      // M2-G3c: create-then-PATCH — gerçek kişi Dosya Sorumlusu ataması (backend create'e DOKUNULMADAN).
      // sorumluPersonelId zaten oturum açan kullanıcıya (yaratıcı) görünmez transition fallback olarak yazıldı.
      let responsibleAssignFailed = false;
      if (responsiblePerson) {
        try {
          await api.patch(
            `/cases/${response.id}/responsible-person`,
            buildAssignBody(responsiblePerson)
          );
        } catch {
          responsibleAssignFailed = true;
        }
      }
      if (selectedForm) recordUsage(selectedForm.code);
      // Başarılı kayıt sonrası taslağı temizle
      clearCaseWizardDraftState({ tenantId: wizardTenantId, userId: wizardUserId });
      // M2-G3c: POST başarılı ama PATCH başarısızsa — dosya OLUŞTU; yönlendirmeden ÖNCE açık uyarı ver.
      if (responsibleAssignFailed && typeof window !== "undefined") {
        window.alert(
          'Dosya oluşturuldu ancak Dosya Sorumlusu (gerçek kişi) atanamadı.\nDosya detayında "Dosya Ekibi" bölümünden tekrar atayabilirsiniz.'
        );
      }
      // Yeni takip oluşturuldu - belgeler sekmesine yönlendir
      router.push(`/cases/${response.id}?tab=documents`);
    } catch (err: any) { setError(err.message || "Takip oluşturulurken bir hata oluştu"); } finally { setLoading(false); }
  };

  const filteredForms = filterFormsByCategory(categoryFilter === "ALL" ? null : categoryFilter);

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="flex items-center justify-between mb-1 flex-shrink-0">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Takiplere Dön
        </Link>
        <div className="flex items-center gap-3">
          {draftLoaded && (lawyers.length > 0 || creditors.length > 0 || caseDebtors.length > 0) && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Taslak silinecek ve tüm girilen bilgiler kaybolacak. Emin misiniz?")) {
                  clearCaseWizardDraftState({ tenantId: wizardTenantId, userId: wizardUserId });
                  window.location.reload();
                }
              }}
              className="text-xs text-orange-600 hover:text-orange-700 hover:underline"
            >
              Taslağı Temizle
            </button>
          )}
          <span className="text-xs text-muted-foreground">{currentStep + 1} / {steps.length}</span>
        </div>
      </div>

      <div className="mb-2 p-2 bg-gradient-to-r from-slate-50 to-gray-50 rounded-lg border flex-shrink-0">
        {/* Stepper - Kompakt */}
        <div className="flex items-center">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Circle */}
              <button
                type="button"
                onClick={() => goToStep(step.id)}
                className={`relative flex flex-col items-center group transition-all ${
                  currentStep === step.id ? 'scale-105' : ''
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                  currentStep > step.id 
                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-green-200' 
                    : currentStep === step.id 
                      ? 'bg-gradient-to-br from-primary to-blue-600 text-white shadow-blue-200 ring-2 ring-primary/20' 
                      : 'bg-white border-2 border-gray-300 text-gray-400 group-hover:border-primary/50'
                }`}>
                  {currentStep > step.id ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                  ) : (
                    <span>{step.id + 1}</span>
                  )}
                </div>
                <span className={`mt-1 text-[10px] font-medium whitespace-nowrap transition-colors ${
                  currentStep === step.id 
                    ? 'text-primary' 
                    : currentStep > step.id 
                      ? 'text-green-600' 
                      : 'text-gray-500 group-hover:text-gray-700'
                }`}>
                  {step.title}
                </span>
              </button>
              
              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div className="flex-1 mx-1">
                  <div className={`h-0.5 rounded-full transition-all ${
                    currentStep > step.id 
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500' 
                      : 'bg-gray-200'
                  }`} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg border p-2 overflow-hidden flex flex-col min-h-0">
        {error && <div className="mb-2 p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">{error}</div>}

        {currentStep === 0 && (
          // PR-1 layout fix: step-0 kendi içinde scroll'lansın. Ebeveyn (flex-1 ... overflow-hidden
          // flex flex-col min-h-0) yüksekliği sabit; bu sarmalayıcı düz <div> olduğunda uzun form
          // listesi + footer taşıp KESİLİYORDU (son form yarım, Geri/İleri görünmez). flex-1 min-h-0
          // overflow-y-auto ile içerik kayar, footer altta sabit kalır. Adım 1-5 kendi scroll'unu
          // yönetir; bu className yalnız currentStep===0'ı etkiler.
          <div className="flex-1 min-h-0 overflow-y-auto">
            {showDocumentSelector ? (
              <DocumentSourceSelector onSelect={handleDocumentSourceSelect} onSkip={() => { setShowDocumentSelector(false); setShowWizard(false); }} onPoaScan={handlePoaScan} />
            ) : wizardResult ? (
              <WizardResultCard result={wizardResult} onAccept={() => {
                setCaseData(prev => ({ ...prev, subCategory: wizardResult.subCategory, currency: wizardResult.currency as any, interestType: wizardResult.interestRateType === "DEGISKEN" ? "YASAL" : "SABIT", interestDescription: wizardResult.interestDescription }));
                setWizardResult(null); if (selectedForm) setCurrentStep(1);
              }} onRestart={() => { setWizardResult(null); setShowWizard(true); }} />
            ) : showWizard && documentSource === "ILAM" ? (
              <CaseWizard onComplete={(result) => { 
                // İlamlı takiplerde öneri sayfasını atla, direkt Takip Bilgileri'ne geç
                const ilamliForm = formMetadata.find(f => f.code === "FORM_2_3_4_5");
                if (ilamliForm) setSelectedForm(ilamliForm);
                
                // İlamlı takip türüne göre mahiyet kodu belirle
                const ilamliMahiyetMap: Record<string, string> = {
                  PARA_ALACAGI: "TAZMINAT",
                  NAFAKA: "NAFAKA",
                  IPOTEK: "IPOTEK",
                  TASINIR_REHNI: "REHIN",
                  TASINIR: "DIGER",      // Taşınır teslimi - para alacağı değil
                  TASINMAZ: "DIGER",     // Taşınmaz teslimi - para alacağı değil
                  TAHLIYE: "TAHLIYE",
                  IS_YAPILMASI: "DIGER", // İşin yapılması - para alacağı değil
                  IRTIFAK: "DIGER",      // İrtifak hakkı - para alacağı değil
                  TEMINAT: "PARA",       // Teminat alacağı
                };
                
                const mahiyetKodu = result.ilamliTakipType 
                  ? ilamliMahiyetMap[result.ilamliTakipType] || "TAZMINAT"
                  : "TAZMINAT";
                
                // Takip türü ve mahiyet ayarla
                const takipTuru = lookups.takipTuru.find(t => t.code === "ILAMLI");
                const mahiyet = lookups.mahiyetTipi.find(m => m.code === mahiyetKodu);
                
                setCaseData(prev => ({ 
                  ...prev, 
                  subCategory: result.subCategory, 
                  currency: result.currency as any, 
                  interestType: result.interestRateType === "DEGISKEN" ? "YASAL" : "SABIT", 
                  interestDescription: result.interestDescription,
                  takipTuruId: takipTuru?.id || prev.takipTuruId,
                  mahiyetTipiId: mahiyet?.id || prev.mahiyetTipiId,
                  mahiyetKodu: mahiyetKodu,
                }));
                
                setShowWizard(false); 
                setCurrentStep(1); // Direkt Takip Bilgileri adımına geç
              }} onSkip={() => setShowWizard(false)} />
            ) : showWizard && documentSource === "KAMBIYO" ? (
              <KambiyoWizard 
                onComplete={(result) => { 
                  const kambiyoForm = formMetadata.find(f => f.code === result.suggestedFormCode); 
                  if (kambiyoForm) setSelectedForm(kambiyoForm); 
                  
                  // Senet türüne göre takip türü ve mahiyet güncelle
                  const isCek = result.senetType === "CEK";
                  const takipTuruCode = isCek ? "KAMBIYO_CEK" : "KAMBIYO_SENET";
                  const mahiyetCode = isCek ? "CEK" : "SENET";
                  
                  const takipTuru = lookups.takipTuru.find(t => t.code === takipTuruCode);
                  // PR-D (D5/D3): kanonik KAMBIYO_CEK/KAMBIYO_SENET artık her zaman var → ölü
                  // ILAMSIZ_KAMBIYO + ad-içeren fallback'ler kaldırıldı; miss artık gözlemlenebilir.
                  if (!takipTuru) {
                    console.warn(`[lookup] beklenen takip türü kodu katalogda yok: ${takipTuruCode} (KambiyoWizard) — seed/katalog drift olabilir`);
                  }
                  
                  // Mahiyet tipi - birden fazla fallback ile
                  const mahiyet = lookups.mahiyetTipi.find(m => m.code === mahiyetCode) ||
                                 lookups.mahiyetTipi.find(m => m.name?.toLowerCase().includes(isCek ? "çek" : "senet"));
                  
                  console.log(`[KambiyoWizard] Seçilen: ${result.senetType}`);
                  console.log(`[KambiyoWizard] lookups.mahiyetTipi:`, lookups.mahiyetTipi);
                  console.log(`[KambiyoWizard] Aranan mahiyetCode: ${mahiyetCode}, Bulunan:`, mahiyet);
                  console.log(`[KambiyoWizard] takipTuru:`, takipTuru);
                  
                  setCaseData(prev => ({
                    ...prev,
                    takipTuruId: takipTuru?.id || prev.takipTuruId,
                    mahiyetTipiId: mahiyet?.id || prev.mahiyetTipiId,
                    mahiyetKodu: mahiyetCode,
                    subCategory: isCek ? "CEK" : "SENET",
                    interestType: "TICARI", // Kambiyo için ticari faiz
                    interestDescription: isCek 
                      ? "Çek bedeline takip tarihinden itibaren ticari faiz işletilmesini talep ederiz."
                      : "Senet bedeline vade tarihinden itibaren ticari faiz işletilmesini talep ederiz.",
                  }));
                  
                  // Çek için otomatik alacak kalemleri oluştur (ana para + %10 tazminat)
                  if (isCek) {
                    // Boş ana para kalemi ekle - kullanıcı tutarı girecek
                    setDues([
                      { 
                        type: "PRINCIPAL", 
                        description: "Çek Bedeli", 
                        amount: "", 
                        dueDate: new Date().toISOString().split("T")[0],
                        interestType: "TICARI",
                      },
                    ]);
                  } else {
                    // Senet/Bono için ana para kalemi
                    setDues([
                      { 
                        type: "PRINCIPAL", 
                        description: result.senetType === "BONO" ? "Bono Bedeli" : "Poliçe Bedeli", 
                        amount: "", 
                        dueDate: new Date().toISOString().split("T")[0],
                        interestType: "TICARI",
                      },
                    ]);
                  }
                  
                  setShowWizard(false); 
                  setCurrentStep(1); 
                }} 
                onSkip={() => { setShowWizard(false); const kambiyoForm = formMetadata.find(f => f.code === "FORM_10"); if (kambiyoForm) setSelectedForm(kambiyoForm); }}
                onBack={() => { setShowWizard(false); setShowDocumentSelector(true); }}
              />
            ) : showWizard && documentSource === "SOZLESME" ? (
              <IlamsizWizard 
                initialStep={lastWizardStep}
                onStepChange={(step) => setLastWizardStep(step)}
                initialAnswers={wizardAnswersCache}
                onAnswersChange={(ans) => setWizardAnswersCache(ans)}
                onComplete={(result) => { 
                  const ilamsizForm = formMetadata.find(f => f.code === result.suggestedFormCode); 
                  if (ilamsizForm) setSelectedForm(ilamsizForm); 
                  
                  // Mahiyet ve Takip Türü ayarla
                  const updates: Partial<typeof caseData> = {};
                  
                  if (result.mahiyetCode) {
                    const mahiyet = lookups.mahiyetTipi.find(m => m.code === result.mahiyetCode);
                    if (mahiyet) {
                      updates.mahiyetTipiId = mahiyet.id;
                      updates.mahiyetKodu = result.mahiyetCode;
                    }
                  }
                  
                  if (result.takipTuruCode) {
                    const takipTuru = lookups.takipTuru.find(t => t.code === result.takipTuruCode);
                    if (takipTuru) {
                      updates.takipTuruId = takipTuru.id;
                    }
                  }
                  
                  if (Object.keys(updates).length > 0) {
                    setCaseData(prev => ({ ...prev, ...updates }));
                  }
                  
                  setShowWizard(false); 
                  setCurrentStep(1); 
                }} 
                onSkip={() => { setShowWizard(false); setLastWizardStep(1); setWizardAnswersCache({ isKira: null }); const ilamsizForm = formMetadata.find(f => f.code === "FORM_7"); if (ilamsizForm) setSelectedForm(ilamsizForm); }}
                onBack={() => { setShowWizard(false); setShowDocumentSelector(true); setLastWizardStep(1); setWizardAnswersCache({ isKira: null }); }}
              />
            ) : showWizard ? (
              <FormWizard onComplete={handleWizardComplete} onSkip={() => setShowWizard(false)} />
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-2">İcra Takip Formu Seçin</h2>
                <p className="text-muted-foreground mb-4">Durumunuza uygun formu seçin veya sihirbazı kullanın</p>
                {ocrResult && <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg"><p className="text-sm text-blue-800"><span className="font-medium">🎯 Belge Analizi:</span> {ocrResult.explanation}</p></div>}
                {documentSource && (
                  <div className="mb-4 p-3 bg-gray-50 border rounded-lg flex items-center justify-between">
                    <div className="text-sm"><span className="text-muted-foreground">Dayanak Belge: </span><span className="font-medium">{documentSource === "ILAM" ? "Mahkeme Kararı / İlam" : documentSource === "KAMBIYO" ? "Senet / Bono / Çek" : "Sözleşme / Fatura"}</span></div>
                    <button onClick={() => { setShowDocumentSelector(true); setDocumentSource(null); setOcrResult(null); }} className="text-xs text-primary hover:underline">Değiştir</button>
                  </div>
                )}
                {selectedForm && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-medium mb-1">✓ Seçilen Form</p>
                    <p className="text-green-900 font-semibold">{selectedForm.title}</p>
                    {selectedSubForm && <p className="text-sm text-green-700">Alt Tür: {selectedSubForm.title}</p>}
                    <button onClick={() => { setSelectedForm(null); setSelectedSubForm(null); }} className="mt-2 text-sm text-green-600 hover:text-green-800 underline">Değiştir</button>
                  </div>
                )}
                {recommendedForm && <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg"><p className="text-sm text-yellow-800 mb-2 font-medium">🎯 Sihirbaz Önerisi</p><FormCard form={recommendedForm} isSelected={selectedForm?.code === recommendedForm.code} isRecommended onSelect={handleFormSelect} onInfoClick={setDetailModalForm} /></div>}
                <FrequentForms frequentForms={frequentForms} onSelectForm={(code) => { const form = formMetadata.find(f => f.code === code); if (form) handleFormSelect(form); }} selectedFormCode={selectedForm?.code} />
                {recentForms.length > 0 && <RecentForms recentForms={recentForms} onSelectForm={(code) => { const form = formMetadata.find(f => f.code === code); if (form) handleFormSelect(form); }} selectedFormCode={selectedForm?.code} />}
                <div className="mb-4"><CategoryFilter selectedCategory={categoryFilter} onCategoryChange={setCategoryFilter} /></div>
                <div className="space-y-3">{filteredForms.filter(f => f.code !== recommendedForm?.code).map(form => <FormCard key={form.code} form={form} isSelected={selectedForm?.code === form.code} onSelect={handleFormSelect} onInfoClick={setDetailModalForm} />)}</div>
              </>
            )}
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">Takip Bilgileri</h2>
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{selectedSubForm?.title || selectedForm?.title}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div><label className="block text-xs font-medium mb-0.5">Takip No <span className="text-red-500">*</span></label><input type="text" name="fileNumber" value={caseData.fileNumber} onChange={handleCaseDataChange} placeholder="2024/1001" className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary" /></div>
              <div><label className="block text-xs font-medium mb-0.5">Takip Tarihi <span className="text-red-500">*</span></label><input type="date" name="startDate" value={caseData.startDate} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary" /></div>
              <div><label className="block text-xs font-medium mb-0.5">Takip Yolu <span className="text-red-500">*</span></label><select name="executionPath" value={caseData.executionPath} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="HACIZ">Haciz</option><option value="IFLAS">İflas</option><option value="REHIN">Rehin</option><option value="IPOTEK">İpotek</option><option value="TAHLIYE">Tahliye</option></select></div>
              <div><label className="block text-xs font-medium mb-0.5">Statü</label><select name="caseStatus" value={caseData.caseStatus} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="DERDEST">Derdest</option><option value="ISLEMDE">İşlemde</option><option value="DERKENAR">Derkenar</option></select></div>
            </div>
            <div className="p-2 bg-gray-50 rounded-lg">
              <h3 className="text-xs font-semibold mb-2">İcra Dairesi</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div><label className="block text-xs font-medium mb-0.5">İl</label><select value={selectedCity} onChange={e => setSelectedCity(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Tüm İller</option>{cities.map(city => <option key={city} value={city}>{city}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">İcra Dairesi</label><select value={caseData.executionOfficeId} onChange={e => handleOfficeChange(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{filteredOffices.map(office => <option key={office.id} value={office.id}>{office.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">UYAP Kodu</label><input type="text" name="uyapBirimKodu" value={caseData.uyapBirimKodu} onChange={handleCaseDataChange} placeholder="Otomatik" className={`w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary ${uyapWarning ? 'border-amber-500' : ''}`} /></div>
                <div><label className="block text-xs font-medium mb-0.5">İcra Dosya No</label><input type="text" name="executionFileNumber" value={caseData.executionFileNumber} onChange={handleCaseDataChange} placeholder="2024/12345 E." className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary" /></div>
              </div>
              {selectedOffice && <OfficeBankInfo office={selectedOffice} onUpdate={(updated) => setSelectedOffice({ ...selectedOffice, ...updated })} />}
            </div>
            <div className="p-2 bg-amber-50 rounded-lg"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" name="hasArticle4Request" checked={caseData.hasArticle4Request} onChange={handleCaseDataChange} className="w-4 h-4 rounded border-gray-300" /><span className="text-xs font-medium">4. Madde Takip Talebi (İİK m.4)</span></label></div>
            
            <div className="p-2 bg-purple-50 rounded-lg">
              <h3 className="text-xs font-semibold mb-2 text-purple-800">📊 Sınıflandırma</h3>
              {/* PR-D (D2): lookups yüklenememiş VEYA takip türü tanımı boşsa açık sistem-konfig uyarısı (sessiz "Seçiniz" yerine). */}
              {shouldShowLookupBanner(lookupsLoadFailed, lookups.takipTuru.length) && (
                <div className="mb-2 p-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{lookupBannerMessage(lookupsLoadFailed)}</span>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div><label className="block text-xs font-medium mb-0.5">Takip Türü <span className="text-red-500">*</span></label><select name="takipTuruId" value={caseData.takipTuruId} onChange={(e) => handleTakipTuruChange(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.takipTuru.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                {/* A4 (Dosya Sorumlusu): dropdown yalnız aktif + VIEWER olmayan kullanıcıları gösterir; zaten atanmış değer korunur */}
                {/* M2-G3c: Dosya Sorumlusu = gerçek kişi (Lawyer/StaffMember) picker. User dropdown'unun yerine; zorunlu. */}
                <div><label className="block text-xs font-medium mb-0.5">Dosya Sorumlusu <span className="text-red-500">*</span></label><ResponsibleCandidateSelect value={responsiblePerson} onChange={setResponsiblePerson} disabled={loading} /></div>
                <div><label className="block text-xs font-medium mb-0.5">Aşama</label><select name="asamaId" value={caseData.asamaId} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.asama.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">Mahiyet Tipi</label><select name="mahiyetTipiId" value={caseData.mahiyetTipiId} onChange={(e) => { const selectedId = e.target.value; const selectedItem = lookups.mahiyetTipi.find(m => m.id === selectedId); setCaseData(prev => ({ ...prev, mahiyetTipiId: selectedId, mahiyetKodu: selectedItem?.code || '' })); }} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.mahiyetTipi.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">Mahiyet Kodu</label><input type="text" name="mahiyetKodu" value={caseData.mahiyetKodu} onChange={handleCaseDataChange} placeholder="KIRA, AIDAT" className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary" /></div>
              </div>
            </div>

            <div className="p-2 bg-gray-50 rounded-lg">
              <h3 className="text-xs font-semibold mb-2">📝 Notlar</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <ExpandableTextarea name="dahiliNot" label="Dahili Not" value={caseData.dahiliNot} onChange={handleCaseDataChange} placeholder="Büro içi notlar..." />
                <ExpandableTextarea name="muvekkilNotu" label="Müvekkil Notu" value={caseData.muvekkilNotu} onChange={handleCaseDataChange} placeholder="Raporlarda görünür..." />
                <ExpandableTextarea name="notes" label="Genel Not" value={caseData.notes} onChange={handleCaseDataChange} placeholder="Genel notlar..." />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Header - Kompakt */}
            <div className="flex items-center justify-between mb-1 flex-shrink-0">
              <div>
                <h2 className="text-sm font-semibold">👨‍⚖️ Avukatlar & Personel</h2>
                <p className="text-[10px] text-muted-foreground">Varsayılan olarak işaretlenenler otomatik seçilir</p>
              </div>
              <a href="/settings/office" target="_blank" className="px-2 py-1 bg-primary text-white text-[10px] rounded hover:bg-primary/90 flex items-center gap-1">
                <Settings className="h-3 w-3" /> Büro Ayarları
              </a>
            </div>

            {/* İki Sütunlu Layout */}
            <div className="flex-1 grid grid-cols-2 gap-2 min-h-0 overflow-hidden">
              {/* Sol: Seçili Avukatlar */}
              <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden">
                <h3 className="font-medium mb-1 flex items-center gap-1 text-xs flex-shrink-0">
                  <Users className="h-3 w-3" /> Seçili Avukatlar
                  {lawyers.length > 0 && <span className="text-[10px] bg-primary text-white px-1 py-0.5 rounded-full">{lawyers.length}</span>}
                </h3>

                {lawyers.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed rounded bg-amber-50 border-amber-200">
                    <div className="text-center p-2">
                      <AlertTriangle className="h-5 w-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-amber-800 font-medium text-xs">Varsayılan avukat yok</p>
                      <p className="text-[10px] text-amber-600">Büro Ayarları'ndan avukat ekleyin</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                    {lawyers.map((lawyer, index) => (
                      <div key={lawyer.id || index} className={`p-1.5 border rounded text-xs ${lawyer.isResponsible ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50'}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Users className={`h-3 w-3 ${lawyer.isResponsible ? 'text-indigo-600' : 'text-gray-500'}`} />
                            <span className="font-medium text-[11px]">{lawyer.displayName || `${lawyer.title || "Av."} ${lawyer.name} ${lawyer.surname}`}</span>
                          </div>
                          <button type="button" onClick={() => {
                            setLawyers(prev => {
                              const removed = prev[index];
                              const updated = prev.filter((_, i) => i !== index);
                              if (removed?.isResponsible && updated.length > 0) updated[0] = { ...updated[0], isResponsible: true };
                              return updated;
                            });
                          }} className="p-0.5 text-gray-400 hover:text-red-600 rounded">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-1 pt-1 border-t text-[10px]">
                          <label className="flex items-center gap-0.5 cursor-pointer">
                            <input type="radio" name="responsible" checked={lawyer.isResponsible || false} onChange={() => {
                              const updated = [...lawyers];
                              updated.forEach((l, i) => { l.isResponsible = i === index; });
                              setLawyers(updated);
                            }} className="w-2.5 h-2.5" />
                            <span className={lawyer.isResponsible ? "font-medium text-indigo-700" : ""}>Sorumlu</span>
                          </label>
                          <label className="flex items-center gap-0.5 cursor-pointer">
                            <input type="checkbox" checked={lawyer.hasSignatureAuthority || false} onChange={(e) => {
                              const updated = [...lawyers];
                              updated[index] = { ...updated[index], hasSignatureAuthority: e.target.checked };
                              setLawyers(updated);
                            }} className="w-2.5 h-2.5 rounded" />
                            <span className={lawyer.hasSignatureAuthority ? "font-medium text-amber-700" : ""}>İmza Yetkisi</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sağ: Seçili Personel */}
              <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden bg-gray-50">
                <div className="flex items-center justify-between mb-1 flex-shrink-0">
                  <h3 className="font-medium flex items-center gap-1 text-xs">
                    👥 Seçili Personel
                    {selectedStaff.length > 0 && <span className="text-[10px] bg-orange-500 text-white px-1 py-0.5 rounded-full">{selectedStaff.length}</span>}
                  </h3>
                </div>

                {selectedStaff.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed rounded bg-white">
                    <div className="text-center p-2">
                      <Users className="h-5 w-5 mx-auto text-gray-400 mb-1" />
                      <p className="text-gray-500 text-xs">Personel seçilmedi</p>
                      <p className="text-[10px] text-gray-400">Varsayılan personeller otomatik eklenir</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                    {selectedStaff.map((staff, index) => (
                      <div key={staff.id || index} className="p-1.5 bg-white border rounded flex items-center justify-between text-xs">
                        <div>
                          <span className="font-medium text-[11px]">{staff.firstName} {staff.lastName}</span>
                          <span className="ml-1 text-[10px] text-gray-500">({staff.staffType})</span>
                        </div>
                        <button type="button" onClick={() => setSelectedStaff(selectedStaff.filter((_, i) => i !== index))} className="p-0.5 text-gray-400 hover:text-red-600 rounded">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-amber-600 mt-1 p-1 bg-amber-50 rounded border border-amber-200 flex-shrink-0">
                  ℹ️ Personel dosyaya kaydedilir; ancak UYAP/resmi takip belgelerinde görünmez.
                </p>
              </div>
            </div>

            {/* Vekalet Uyarı Bandı */}
            {poaWarnings.length > 0 && creditors.length > 0 && (
              <div className="mt-1 p-1.5 bg-amber-50 border border-amber-300 rounded flex-shrink-0">
                <div className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                  <p className="text-[10px] text-amber-800">⚠️ Bazı avukatlar için geçerli vekalet bulunamadı</p>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="h-full flex flex-col overflow-hidden">
            {/* Header - Kompakt */}
            <div className="flex items-center justify-between flex-shrink-0 mb-1">
              <div>
                <h2 className="text-sm font-semibold">👥 Müvekkiller / Alacaklılar</h2>
                <p className="text-[10px] text-muted-foreground">
                  Takipte yer alacak müvekkilleri seçin veya yeni ekleyin
                </p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowNewClientModal(true)}
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-emerald-500 text-white rounded hover:bg-emerald-600"
                >
                  <Plus className="h-3 w-3" /> Şahıs Ekle
                </button>
                <PoaScannerWizard
                  asButton={true}
                  onScanComplete={async (result) => {
                    try {
                      const clientData = {
                        type: result.clientType,
                        firstName: result.firstName,
                        lastName: result.lastName,
                        companyName: result.companyName,
                        tckn: result.tckn,
                        vkn: result.vkn,
                        taxOffice: result.taxOffice,
                        phone: result.phone,
                        email: result.email,
                        address: result.address,
                        city: result.city,
                        district: result.district,
                        canCollect: result.canCollect,
                        canWaive: result.canWaive,
                        canSettle: result.canSettle,
                        canRelease: result.canRelease,
                        poaNumber: result.poaNumber,
                        poaDate: result.poaDate,
                        notaryName: result.notaryName,
                        notaryCity: result.notaryCity,
                      };
                      const response = await api.post("/clients", clientData);
                      const saved = response.data || response;
                      const clientsRes = await api.get("/clients");
                      setExistingClients(clientsRes.data?.data || []);
                      addExistingCreditor(saved);
                    } catch (err: any) {
                      alert(err.message || "Müvekkil kaydedilemedi");
                    }
                  }}
                />
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-2 min-h-0 overflow-hidden">
              {/* Sol Panel: Müvekkil Rehberi */}
              <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden">
                <h3 className="font-medium mb-1 flex items-center gap-1 text-xs flex-shrink-0">
                  <Search className="h-3 w-3" /> Müvekkil Rehberi
                </h3>
                <div className="flex-1 overflow-hidden">
                  <CreditorDirectoryPanel
                    existingClients={existingClients}
                    selectedClients={creditors}
                    onAddClient={addExistingCreditor}
                    onEditClient={(client) => {
                      setShowNewClientModal(true);
                    }}
                  />
                </div>
              </div>

              {/* Sağ Panel: Seçili Müvekkiller */}
              <div className="border rounded p-2 flex flex-col min-h-0 overflow-hidden">
                <h3 className="font-medium mb-1 flex items-center gap-1 text-xs flex-shrink-0">
                  <Users className="h-3 w-3" /> Bu Takip İçin Seçili Müvekkiller
                  {creditors.length > 0 && (
                    <span className="text-[10px] bg-primary text-white px-1 py-0.5 rounded-full">
                      {creditors.length}
                    </span>
                  )}
                </h3>

                {creditors.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center border border-dashed rounded">
                    <div className="text-center p-2">
                      <AlertCircle className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
                      <p className="text-muted-foreground text-xs">Henüz müvekkil seçilmedi</p>
                      <p className="text-[10px] text-muted-foreground">
                        Sol panelden mevcut müvekkil seçin
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
                    {creditors.map((creditor, index) => (
                      <SelectedCreditorCard
                        key={creditor.id || index}
                        creditor={creditor}
                        onRemove={() => removeCreditor(index)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Vekalet Uyarı Bandı */}
            {poaWarnings.length > 0 && (
              <div className="mt-1 p-1.5 bg-amber-50 border border-amber-300 rounded flex-shrink-0">
                <div className="flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-[10px] font-medium text-amber-800">⚠️ Vekalet Uyarısı</p>
                    <div className="space-y-0.5 mt-0.5">
                      {poaWarnings.slice(0, 2).map((warning, idx) => (
                        <p key={idx} className="text-[10px] text-amber-700">
                          <span className="font-medium">{warning.clientName}</span> - {warning.lawyerName}: {warning.message}
                        </p>
                      ))}
                    </div>
                    <div className="mt-1 flex gap-1">
                      <Link
                        href="/settings/clients"
                        target="_blank"
                        className="px-2 py-0.5 bg-amber-600 text-white text-[10px] rounded hover:bg-amber-700 flex items-center gap-0.5"
                      >
                        <FileCheck className="h-2.5 w-2.5" />
                        Vekalet Ekle
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPoaWarnings([])}
                        className="px-2 py-0.5 border border-amber-400 text-amber-700 text-[10px] rounded hover:bg-amber-100"
                      >
                        Devam Et
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="h-full flex flex-col overflow-hidden">
            <DebtorStep
              selectedDebtors={caseDebtors}
              onDebtorsChange={setCaseDebtors}
              creditors={creditors.map((c) => ({ name: c.name, identityNo: c.identityNo }))}
              onDebtInfoDetected={(debtInfo, documentType) => {
                // Borç evrakından tespit edilen bilgileri alacak kalemlerine otomatik aktar
                if (debtInfo.amount) {
                  const newDue: DueItem = {
                    type: "PRINCIPAL",
                    description: debtInfo.documentNo
                      ? `${debtInfo.documentNo} numaralı belgeye istinaden asıl alacak`
                      : "Asıl Alacak (Borç evrakından tespit edildi)",
                    amount: debtInfo.amount.toString(),
                    dueDate: debtInfo.dueDate || new Date().toISOString().split("T")[0],
                    // FATURA (G2b, scan-only): documentType=FATURA ise belge/KDV metadata (amount=KDV-dahil genel toplam)
                    ...faturaDueFieldsFromDebtInfo(debtInfo, documentType),
                  };
                  // Mevcut kalemlere ekle (aynı tutar yoksa)
                  const existingAmount = dues.find(d => d.amount === newDue.amount && d.type === "PRINCIPAL");
                  if (!existingAmount) {
                    setDues([...dues, newDue]);
                  }
                  // Para birimini güncelle
                  if (debtInfo.currency && debtInfo.currency !== "TRY") {
                    setCaseData(prev => ({ ...prev, currency: debtInfo.currency as any }));
                  }
                }
              }}
              onInstrumentsDetected={(detected) => {
                // PR-N4b: seçili kambiyo enstrümanları → instruments[] (REPLACE, S3); dues'a PRINCIPAL KONMAZ (K1).
                // Kambiyo PRINCIPAL'ı backend instruments[] üzerinden gider (N3-wire); çek dues'a yazılmaz.
                setInstruments(selectedInstrumentsToPayload(detected));
              }}
            />
          </div>
        )}

        {currentStep === 5 && (
          <div className="min-h-[600px] space-y-3">
            {claimDraftItems.length > 0 && (
              <div className="border rounded-lg p-3 bg-blue-50/40">
                <h3 className="text-sm font-semibold mb-2">Eklenen Alacak Kalemleri ({claimDraftItems.length})</h3>
                <ul className="space-y-1">
                  {claimDraftItems.map((ci, i) => (
                    <li
                      key={ci.id}
                      className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm bg-white ${editingItemIndex === i ? 'ring-2 ring-blue-400' : ''}`}
                    >
                      <span className="truncate">
                        <span className="font-medium">{ci.raw?.__legacyDue?.description || claimItemKalemLabel(ci.raw?.kalemTuru)}</span>
                        {ci.raw?.bakiyeTutar ? ` — ${Number(ci.raw.bakiyeTutar).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ${ci.raw?.currency || 'TRY'}` : ''}
                        {ci.raw?.vadeTarihi ? ` · ${ci.raw.vadeTarihi}` : ''}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <button type="button" onClick={() => handleEditClaimItem(i)} className="text-xs text-blue-600 hover:underline">Düzenle</button>
                        <button type="button" onClick={() => handleDeleteClaimItem(i)} className="text-xs text-red-500 hover:underline">Sil</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ProfessionalClaimItemForm
              key={claimEditorKey}
              initialItems={editingItemIndex !== null && claimDraftItems[editingItemIndex] ? [claimDraftItems[editingItemIndex].raw] : undefined}
              caseType={selectedForm?.category}
              formCode={selectedForm?.code}
              currency={caseData.currency || "TRY"}
              takipTuruCode={lookups.takipTuru.find(t => t.id === caseData.takipTuruId)?.code}
              mahiyetKodu={caseData.mahiyetKodu}
              documentSource={documentSource}
              borcluSayisi={caseDebtors.length || 1}
              fileNumber={caseData.fileNumber}
              takipTarihi={caseData.startDate}
              executionOffice={executionOffices.find(o => o.id === caseData.executionOfficeId) ? {
                name: executionOffices.find(o => o.id === caseData.executionOfficeId)!.name,
                city: executionOffices.find(o => o.id === caseData.executionOfficeId)!.city,
                uyapCode: executionOffices.find(o => o.id === caseData.executionOfficeId)!.uyapCode,
              } : undefined}
              creditors={creditors.map(c => ({
                type: c.type,
                name: c.name,
                identityNo: c.identityNo,
                address: c.address,
              }))}
              lawyers={lawyers.map(l => ({
                name: `${l.name} ${l.surname}`,
                barNumber: l.barNumber || '',
                barCity: l.barCity || '',
              }))}
              debtors={caseDebtors.map(cd => {
                const debtor = existingDebtors.find((d: any) => d.id === cd.debtorId);
                return {
                  type: debtor?.type || 'INDIVIDUAL',
                  name: debtor?.displayName || debtor?.name || '',
                  identityNo: debtor?.tckn || debtor?.vkn,
                  address: debtor?.address,
                  role: cd.role,
                };
              })}
              onItemsChange={(items) => setClaimFormBuffer(items[0] ?? null)}
            />
            <div className="flex items-center justify-end gap-2">
              {editingItemIndex !== null && (
                <button
                  type="button"
                  onClick={resetClaimEditor}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Vazgeç
                </button>
              )}
              <button
                type="button"
                onClick={handleAddOrUpdateClaimItem}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                {editingItemIndex !== null ? 'Kalemi Güncelle' : '+ Kalemi Listeye Ekle'}
              </button>
            </div>
          </div>
        )}

        {/* Validasyon Paneli - Son adimda goster */}
        {currentStep === steps.length - 1 && showValidationPanel && (validationErrors.length > 0 || validationWarnings.length > 0) && (
          <div className={`mt-4 p-4 rounded-lg border ${validationErrors.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center justify-between mb-2">
              <h4 className={`text-sm font-medium flex items-center gap-2 ${validationErrors.length > 0 ? 'text-red-700' : 'text-amber-700'}`}>
                {validationErrors.length > 0 ? (
                  <><XCircle className="h-4 w-4" /> Eksik Alanlar</>
                ) : (
                  <><AlertTriangle className="h-4 w-4" /> Uyarilar</>
                )}
              </h4>
              <button type="button" onClick={() => setShowValidationPanel(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="space-y-1">
              {validationErrors.map((err, i) => (
                <li key={`err-${i}`} className="text-sm text-red-600 flex items-start gap-2">
                  <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {err.message}
                </li>
              ))}
              {validationWarnings.map((warn, i) => (
                <li key={`warn-${i}`} className={`text-sm flex items-start gap-2 ${warn.severity === 'info' ? 'text-blue-600' : 'text-amber-600'}`}>
                  {warn.severity === 'info' ? <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />}
                  {warn.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* B2: Adım-bazlı yumuşak uyarı (adım 2-5) — ilerlemeyi engellemez, yalnız erken bilgilendirir */}
        {(() => {
          const notice = getStepSoftNotice();
          if (!notice) return null;
          const isInfo = notice.severity === "info";
          return (
            <div className={`mt-4 p-3 rounded-lg border flex items-start gap-2 ${isInfo ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
              {isInfo ? <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" /> : <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600" />}
              <span className={`text-sm ${isInfo ? 'text-blue-700' : 'text-amber-700'}`}>{notice.message}</span>
            </div>
          );
        })()}

        {/* Wizard açıkken ana sayfa butonlarını gizle - wizard kendi butonlarını kullanır */}
        {!(currentStep === 0 && showWizard && !showDocumentSelector) && (
          <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8 pt-4 border-t mb-16">
            <button type="button" onClick={prevStep} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-200 hover:border-gray-400 transition-colors order-2 sm:order-1"><ArrowLeft className="h-4 w-4" /> Geri</button>
            {currentStep < steps.length - 1 ? (
              <button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 order-1 sm:order-2">İleri <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" onClick={handleSubmitClick} disabled={loading} className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 order-1 sm:order-2">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Oluşturuluyor..." : "Takibi Oluştur"}</button>
            )}
          </div>
        )}
      </div>

      {detailModalForm && <FormDetailModal form={detailModalForm} isOpen={!!detailModalForm} onClose={() => setDetailModalForm(null)} onSelect={() => { handleFormSelect(detailModalForm); setDetailModalForm(null); }} />}
      
      {/* Yeni Müvekkil Modal */}
      {showNewClientModal && (
        <NewClientModal
          onSave={async (data) => {
            setSavingClient(true);
            try {
              const response = await api.post("/clients", data);
              const saved = response.data || response;
              // Listeyi yenile
              const clientsRes = await api.get("/clients");
              setExistingClients(clientsRes.data?.data || []);
              // Yeni müvekkili seçili olarak ekle
              addExistingCreditor(saved);
              setShowNewClientModal(false);
            } catch (err: any) {
              alert(err.message || "Müvekkil kaydedilemedi");
            }
            setSavingClient(false);
          }}
          onClose={() => setShowNewClientModal(false)}
          saving={savingClient}
        />
      )}

      {/* Masraf Mail Onay Modalı */}
      {showExpenseConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-full">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold">Masraf Talebi Gönderimi</h3>
              </div>
              
              <p className="text-gray-600 mb-6">
                Takip oluşturulacak ve açılış masrafları hesaplanacak. Müvekkile masraf talebi e-postası göndermek ister misiniz?
              </p>
              
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => doCreateCase(true)}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 font-medium"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Mail className="h-4 w-4" />
                  Oluştur ve Masraf Maili Gönder
                </button>
                
                <button
                  type="button"
                  onClick={() => doCreateCase(false)}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sadece Oluştur (Mail Sonra)
                </button>
                
                <button
                  type="button"
                  onClick={() => setShowExpenseConfirmModal(false)}
                  disabled={loading}
                  className="w-full px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
                >
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function PartyForm({ party, isNew, onUpdate, onRemove }: { party: Party; isNew: boolean; onUpdate: (field: keyof Party, value: any) => void; onRemove: () => void; }) {
  return (
    <div className="border rounded-lg p-4 relative">
      <button type="button" onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>
      {!isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}
      <div className="grid grid-cols-2 gap-3">
        <select value={party.type} onChange={e => onUpdate("type", e.target.value)} disabled={!isNew} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"><option value="INDIVIDUAL">Gerçek Kişi</option><option value="COMPANY">Tüzel Kişi</option></select>
        <input type="text" value={party.name} onChange={e => onUpdate("name", e.target.value)} disabled={!isNew} placeholder={party.type === "INDIVIDUAL" ? "Ad Soyad" : "Firma Adı"} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <input type="text" value={party.identityNo || ""} onChange={e => onUpdate("identityNo", e.target.value)} disabled={!isNew} placeholder={party.type === "INDIVIDUAL" ? "TC Kimlik No" : "Vergi No"} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <input type="tel" value={party.phone || ""} onChange={e => onUpdate("phone", e.target.value)} disabled={!isNew} placeholder="Telefon" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <textarea value={party.address || ""} onChange={e => onUpdate("address", e.target.value)} disabled={!isNew} placeholder="Adres" rows={2} className="col-span-2 rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50 resize-none" />
      </div>
    </div>
  );
}

// Genişleyebilir Textarea Bileşeni
function ExpandableTextarea({ name, label, value, onChange, placeholder }: {
  name: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={expanded ? "md:col-span-3" : ""}>
      <label className="block text-xs font-medium mb-0.5">{label}</label>
      <textarea
        name={name}
        value={value}
        onChange={onChange}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        rows={expanded ? 4 : 1}
        placeholder={placeholder}
        className={`w-full rounded border px-2 py-1 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all duration-200 ${expanded ? 'resize-y' : 'resize-none'}`}
      />
    </div>
  );
}

// Avukat Seçim Adımı Bileşeni - Basitleştirilmiş versiyon
// Üstte seçilmiş avukatlar, altta eklenebilecek diğer avukatlar
function LawyerSelectionStep({
  existingLawyers,
  selectedLawyers,
  onAddLawyer,
  onRemoveLawyer,
  onUpdateLawyer,
  onAddNewLawyer,
  onDeleteFromDatabase,
  onSaveNewLawyer,
  onRefreshLawyers,
}: {
  existingLawyers: any[];
  selectedLawyers: Lawyer[];
  onAddLawyer: (lawyer: any) => void;
  onRemoveLawyer: (index: number) => void;
  onUpdateLawyer: (index: number, field: keyof Lawyer, value: any) => void;
  onAddNewLawyer: () => void;
  onDeleteFromDatabase: (lawyerId: string) => Promise<void>;
  onSaveNewLawyer: (index: number) => Promise<void>;
  onRefreshLawyers: () => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  const roleLabels: Record<string, string> = {
    OWNER: "Büro Sahibi",
    PARTNER: "Ortak",
    EMPLOYEE: "Avukat",
    INTERN: "Stajyer",
  };

  // Seçilmemiş avukatları filtrele
  const unselectedLawyers = existingLawyers.filter(l => 
    !selectedLawyers.find(sl => sl.id === l.id)
  );

  // Arama ve rol filtresi
  const filteredUnselected = unselectedLawyers.filter(l => {
    const matchesSearch = !searchTerm || 
      l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.surname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.barNumber?.includes(searchTerm);
    const matchesRole = roleFilter === "ALL" || l.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Avukatlar</h2>
          <p className="text-xs text-muted-foreground">
            Takipte yer alacak avukatları seçin
          </p>
        </div>
        <a 
          href="/settings/office" 
          target="_blank" 
          className="text-xs text-primary hover:underline"
        >
          Ayarlar →
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sol Panel: Avukat Rehberi */}
        <div className="border rounded-lg p-3">
          <h3 className="font-medium mb-2 flex items-center gap-2 text-sm">
            👨‍⚖️ Avukatlar
          </h3>

          {/* Arama */}
          <div className="mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Ad, soyad veya sicil no..."
              className="w-full px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-primary"
            />
          </div>

          {/* Rol Filtreleri */}
          <div className="flex gap-1 mb-2 flex-wrap">
            {[
              { value: "ALL", label: "Tümü" },
              { value: "OWNER", label: "Büro Sahibi" },
              { value: "PARTNER", label: "Ortak" },
              { value: "EMPLOYEE", label: "Avukat" },
              { value: "INTERN", label: "Stajyer" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRoleFilter(opt.value)}
                className={`px-2 py-1 text-xs rounded-full ${
                  roleFilter === opt.value
                    ? "bg-primary text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Avukat Listesi */}
          <div className="max-h-[280px] overflow-y-auto space-y-1.5">
            {filteredUnselected.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {searchTerm ? "Sonuç bulunamadı" : "Tüm avukatlar seçilmiş"}
              </div>
            ) : (
              filteredUnselected.map((lawyer) => (
                <div
                  key={lawyer.id}
                  className="p-2 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => onAddLawyer(lawyer)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {lawyer.displayName || `${lawyer.title || (lawyer.role === "INTERN" ? "Stj. Av." : "Av.")} ${lawyer.name} ${lawyer.surname}`}
                        </span>
                        {lawyer.role && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : 
                            lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : 
                            lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : 
                            "bg-green-100 text-green-700"
                          }`}>
                            {roleLabels[lawyer.role] || lawyer.role}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                        {lawyer.barNumber && <span>#{lawyer.barNumber}</span>}
                        {lawyer.barCity && <span>{lawyer.barCity} Barosu</span>}
                        {lawyer.canSign && <span className="text-amber-600">İmza ✓</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddLawyer(lawyer)}
                      className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white flex items-center gap-0.5 font-medium"
                    >
                      + Ekle
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sağ Panel: Seçili Avukatlar */}
        <div className="border rounded-lg p-3">
          <h3 className="font-medium mb-2 flex items-center gap-2 text-sm">
            ✅ Bu Takip İçin Seçili Avukatlar
            {selectedLawyers.length > 0 && (
              <span className="text-xs bg-primary text-white px-1.5 py-0.5 rounded-full">
                {selectedLawyers.length}
              </span>
            )}
          </h3>

          {selectedLawyers.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <p className="text-muted-foreground text-sm">Henüz avukat seçilmedi</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sol panelden mevcut avukat seçin
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[280px] overflow-y-auto">
              {selectedLawyers.map((lawyer, index) => (
                <div 
                  key={lawyer.id || index} 
                  className={`p-2 border rounded-lg transition-all ${
                    lawyer.isResponsible 
                      ? 'border-primary bg-primary/5' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {lawyer.displayName || `${lawyer.title || (lawyer.role === "INTERN" ? "Stj. Av." : "Av.")} ${lawyer.name} ${lawyer.surname}`}
                        </span>
                        {lawyer.role && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : 
                            lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : 
                            lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : 
                            "bg-green-100 text-green-700"
                          }`}>
                            {roleLabels[lawyer.role] || lawyer.role}
                          </span>
                        )}
                        {lawyer.canSign && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            İmza ✓
                          </span>
                        )}
                      </div>
                      
                      {/* Yetkiler */}
                      <div className="flex items-center gap-3 mt-1.5">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="radio" 
                            name="responsibleLawyer" 
                            checked={lawyer.isResponsible || false} 
                            onChange={() => {
                              selectedLawyers.forEach((_, i) => {
                                if (i !== index) onUpdateLawyer(i, "isResponsible", false);
                              });
                              onUpdateLawyer(index, "isResponsible", true);
                            }} 
                            className="w-3 h-3 text-primary" 
                          />
                          <span className="text-xs">Sorumlu</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={lawyer.hasSignatureAuthority || false} 
                            onChange={(e) => onUpdateLawyer(index, "hasSignatureAuthority", e.target.checked)} 
                            className="w-3 h-3 rounded" 
                          />
                          <span className="text-xs">İmza</span>
                        </label>
                      </div>
                    </div>
                    
                    <button 
                      type="button" 
                      onClick={() => onRemoveLawyer(index)} 
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded transition-colors" 
                      title="Çıkar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {selectedLawyers.length > 0 && !selectedLawyers.some(l => l.isResponsible) && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              ⚠️ Lütfen bir sorumlu avukat seçin
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// İcra Dairesi Banka Bilgileri Bileşeni - Kompakt
function OfficeBankInfo({ office, onUpdate }: { 
  office: ExecutionOffice; 
  onUpdate: (updated: Partial<ExecutionOffice>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({ bankName: office.bankName || '', branchName: office.branchName || '', iban: office.iban || '', taxNumber: office.taxNumber || '' });
  const handleSave = () => { onUpdate(editData); setIsEditing(false); };
  const hasBankInfo = office.bankName || office.iban || office.taxNumber;

  if (isEditing) {
    return (
      <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-blue-800">📋 Hesap Bilgileri</span>
          <div className="flex gap-2"><button type="button" onClick={() => setIsEditing(false)} className="text-xs text-gray-600 hover:underline">İptal</button><button type="button" onClick={handleSave} className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700">Kaydet</button></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <input type="text" value={editData.bankName} onChange={e => setEditData({...editData, bankName: e.target.value})} placeholder="Banka" className="w-full rounded border px-2 py-1 text-xs" />
          <input type="text" value={editData.branchName} onChange={e => setEditData({...editData, branchName: e.target.value})} placeholder="Şube" className="w-full rounded border px-2 py-1 text-xs" />
          <input type="text" value={editData.taxNumber} onChange={e => setEditData({...editData, taxNumber: e.target.value})} placeholder="Vergi No" className="w-full rounded border px-2 py-1 text-xs" />
          <input type="text" value={editData.iban} onChange={e => setEditData({...editData, iban: e.target.value})} placeholder="IBAN" className="w-full rounded border px-2 py-1 text-xs font-mono" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded flex items-center justify-between">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold text-blue-800">📋</span>
        {hasBankInfo ? (<span className="text-blue-900">{office.bankName}{office.iban ? ` • ${office.iban.slice(0,10)}...` : ''}</span>) : (<span className="text-blue-700">Banka bilgisi yok</span>)}
      </div>
      <button type="button" onClick={() => setIsEditing(true)} className="text-xs text-blue-600 hover:underline">{hasBankInfo ? 'Düzenle' : 'Ekle'}</button>
    </div>
  );
}


// Personel Seçim Adımı Bileşeni
function StaffSelectionStep({
  existingStaff,
  selectedStaff,
  onAddStaff,
  onRemoveStaff,
  onUpdateStaff,
}: {
  existingStaff: any[];
  selectedStaff: any[];
  onAddStaff: (staff: any) => void;
  onRemoveStaff: (index: number) => void;
  onUpdateStaff: (index: number, field: string, value: any) => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const staffTypeLabels: Record<string, string> = {
    STAJYER_AVUKAT: "Stajyer Avukat",
    OFIS_KATIBI: "Ofis Katibi",
    ADLI_KATIP: "Adli Katip",
    SEKRETER: "Sekreter",
    MUHASEBE: "Muhasebe",
    ARSIV: "Arşiv",
  };

  const roleOnCaseOptions = [
    { value: "STAJYER", label: "Stajyer" },
    { value: "KONTROL", label: "Kontrol" },
    { value: "YAZI_ISLERI", label: "Yazı İşleri" },
    { value: "MUHASEBE", label: "Muhasebe" },
    { value: "TEBLIGAT_SORUMLUSU", label: "Tebligat Sorumlusu" },
  ];

  const filteredStaff = existingStaff.filter(s =>
    s.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    staffTypeLabels[s.staffType]?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="text-lg font-semibold">Bu Dosya Üzerinde Çalışacak Ekip</h2>
        <p className="text-xs text-muted-foreground">
          Stajyer, katip, sekreter ve muhasebe personelini seçin. Bu kişiler UYAP veya takip belgelerinde görünmez.
          <a href="/settings/office" target="_blank" className="ml-2 text-primary hover:underline">Ayarlar'da düzenle →</a>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sol: Ofis Personeli Listesi */}
        <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
          <h3 className="text-sm font-semibold">Ofis Personeli</h3>
          
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ad, soyad veya görev ile ara..."
            className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredStaff.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchTerm ? "Sonuç bulunamadı" : "Henüz personel eklenmedi. Ayarlar > Büro Ayarları'ndan ekleyebilirsiniz."}
              </p>
            ) : (
              filteredStaff.map((staff) => {
                const isSelected = selectedStaff.find(ss => ss.id === staff.id);
                return (
                  <div
                    key={staff.id}
                    className={`w-full flex items-center justify-between p-2 rounded border transition-colors ${
                      isSelected ? 'bg-green-50 border-green-300' : 'hover:bg-white border-transparent hover:border-primary/30'
                    }`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">{staff.firstName} {staff.lastName}</span>
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                        staff.staffType === "STAJYER_AVUKAT" ? "bg-purple-100 text-purple-700" :
                        staff.staffType === "MUHASEBE" ? "bg-blue-100 text-blue-700" :
                        staff.staffType === "SEKRETER" ? "bg-pink-100 text-pink-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {staffTypeLabels[staff.staffType] || staff.staffType}
                      </span>
                      {isSelected && <span className="ml-2 text-xs text-green-600">✓ Seçili</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {!isSelected ? (
                        <button
                          type="button"
                          onClick={() => onAddStaff(staff)}
                          className="p-1 text-primary hover:bg-primary/10 rounded"
                          title="Dosyaya Ekle"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            const idx = selectedStaff.findIndex(ss => ss.id === staff.id);
                            if (idx >= 0) onRemoveStaff(idx);
                          }}
                          className="p-1 text-orange-500 hover:bg-orange-100 rounded"
                          title="Dosyadan Çıkar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Sağ: Bu Dosya İçin Seçili Personel */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-2">Bu Dosya İçin Seçili Personel</h3>
          
          {selectedStaff.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">Henüz personel seçilmedi</p>
              <p className="text-xs text-muted-foreground mt-1">Soldaki listeden personel ekleyin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedStaff.map((staff, index) => (
                <div key={index} className="p-2 rounded-lg border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{staff.firstName} {staff.lastName}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        staff.staffType === "STAJYER_AVUKAT" ? "bg-purple-100 text-purple-700" :
                        staff.staffType === "MUHASEBE" ? "bg-blue-100 text-blue-700" :
                        staff.staffType === "SEKRETER" ? "bg-pink-100 text-pink-700" :
                        "bg-gray-100 text-gray-700"
                      }`}>
                        {staffTypeLabels[staff.staffType] || staff.staffType}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveStaff(index)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-100 rounded"
                      title="Listeden Çıkar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  
                  {/* Rol ve Yetkiler */}
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs font-medium mb-1">Dosyadaki Rolü</label>
                      <select
                        value={staff.roleOnCase || ""}
                        onChange={(e) => onUpdateStaff(index, "roleOnCase", e.target.value)}
                        className="w-full rounded border px-2 py-1 text-xs"
                      >
                        <option value="">Seçiniz</option>
                        {roleOnCaseOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="flex flex-wrap gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staff.canView || false}
                          onChange={(e) => onUpdateStaff(index, "canView", e.target.checked)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        <span className="text-xs">Görüntüleyebilsin</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staff.canEdit || false}
                          onChange={(e) => onUpdateStaff(index, "canEdit", e.target.checked)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        <span className="text-xs">Düzenleyebilsin</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={staff.canApprove || false}
                          onChange={(e) => onUpdateStaff(index, "canApprove", e.target.checked)}
                          className="w-3.5 h-3.5 rounded"
                        />
                        <span className="text-xs">Onaylayabilsin</span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <p className="text-xs text-muted-foreground mt-3 p-2 bg-amber-50 rounded border border-amber-200">
            ⚠️ Burada seçtiğiniz personel, bu takipte ilgili modüllere erişebilecek, görev ve kontrolleri yapabilecektir. 
            Bu kişiler UYAP veya takip belgelerinde görünmez.
          </p>
        </div>
      </div>
    </div>
  );
}


// Avukat Rehberi Paneli - DebtorStep gibi sol panel
function LawyerDirectoryPanel({
  existingLawyers, selectedLawyers, onAddLawyer
}: {
  existingLawyers: any[]; selectedLawyers: Lawyer[];
  onAddLawyer: (lawyer: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [viewingLawyer, setViewingLawyer] = useState<any>(null);
  
  const filtered = existingLawyers.filter(l => {
    const matchesSearch = !search || 
      l.name?.toLowerCase().includes(search.toLowerCase()) || 
      l.surname?.toLowerCase().includes(search.toLowerCase()) ||
      l.barNumber?.includes(search) ||
      l.displayName?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "ALL" || l.role === roleFilter;
    const notSelected = !selectedLawyers.find(sl => sl.id === l.id);
    return matchesSearch && matchesRole && notSelected;
  });

  const roleLabels: Record<string, string> = { OWNER: "Büro Sahibi", PARTNER: "Ortak", EMPLOYEE: "Avukat", INTERN: "Stajyer" };

  return (
    <div className="space-y-2">
      {/* Arama */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Ad, soyad veya baro sicil no..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-primary"
        />
      </div>

      {/* Rol Filtreleri */}
      <div className="flex gap-1 flex-wrap">
        {[
          { value: "ALL", label: "Tümü" },
          { value: "OWNER", label: "Sahip" },
          { value: "PARTNER", label: "Ortak" },
          { value: "EMPLOYEE", label: "Avukat" },
          { value: "INTERN", label: "Stajyer" },
        ].map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRoleFilter(opt.value)}
            className={`px-2 py-1 text-xs rounded-full ${
              roleFilter === opt.value
                ? "bg-primary text-white"
                : "bg-gray-100 hover:bg-gray-200"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Avukat Listesi */}
      <div className="max-h-[280px] overflow-y-auto space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            {search ? "Sonuç bulunamadı" : "Tüm avukatlar seçilmiş"}
          </div>
        ) : (
          filtered.slice(0, 10).map((lawyer) => (
            <div
              key={lawyer.id}
              className="p-2 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 cursor-pointer" onClick={() => onAddLawyer(lawyer)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {lawyer.displayName || `${lawyer.title || "Av."} ${lawyer.name} ${lawyer.surname}`}
                    </span>
                    {lawyer.isDefaultForNewCases && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">Varsayılan</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                    <span className={`px-1.5 py-0.5 rounded ${
                      lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : 
                      lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : 
                      lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : 
                      "bg-green-100 text-green-700"
                    }`}>
                      {roleLabels[lawyer.role] || "Avukat"}
                    </span>
                    {lawyer.barNumber && <span>Sicil: {lawyer.barNumber}</span>}
                    {lawyer.barCity && <span>{lawyer.barCity} Barosu</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setViewingLawyer(lawyer); }}
                    className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="Detay"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAddLawyer(lawyer)}
                    className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white flex items-center gap-0.5 font-medium"
                  >
                    + Ekle
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
        {filtered.length > 10 && (
          <p className="text-xs text-center text-muted-foreground py-1">
            +{filtered.length - 10} daha... (arama yapın)
          </p>
        )}
      </div>

      {/* Avukat Detay Modal */}
      {viewingLawyer && (
        <LawyerDetailModal lawyer={viewingLawyer} onClose={() => setViewingLawyer(null)} />
      )}
    </div>
  );
}

// Seçili Avukat Kartı - DebtorStep'teki SelectedDebtorCard gibi
function SelectedLawyerCard({ 
  lawyer, 
  onUpdate, 
  onRemove 
}: { 
  lawyer: Lawyer; 
  onUpdate: (field: keyof Lawyer, value: any) => void; 
  onRemove: () => void;
}) {
  const [viewingLawyer, setViewingLawyer] = useState(false);
  const roleLabels: Record<string, string> = { OWNER: "Büro Sahibi", PARTNER: "Ortak", EMPLOYEE: "Avukat", INTERN: "Stajyer" };

  return (
    <>
      <div className={`p-2.5 border rounded-lg transition-colors ${
        lawyer.isResponsible 
          ? "bg-gradient-to-r from-indigo-50/50 to-purple-50/50 border-indigo-200" 
          : "bg-gradient-to-r from-gray-50/50 to-slate-50/50 border-gray-200"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className={`p-1.5 rounded-lg ${lawyer.isResponsible ? 'bg-indigo-100' : 'bg-gray-100'}`}>
              <Users className={`h-4 w-4 ${lawyer.isResponsible ? 'text-indigo-600' : 'text-gray-600'}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">
                  {lawyer.displayName || `${lawyer.title || "Av."} ${lawyer.name} ${lawyer.surname}`}
                </span>
                {lawyer.role && (
                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                    lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : 
                    lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : 
                    lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : 
                    "bg-green-100 text-green-700"
                  }`}>
                    {roleLabels[lawyer.role] || "Avukat"}
                  </span>
                )}
              </div>
              {lawyer.barNumber && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Sicil: {lawyer.barNumber} {lawyer.barCity && `• ${lawyer.barCity}`}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewingLawyer(true)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Detay"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Kaldır"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Yetki Seçenekleri */}
        <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-100">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input 
              type="radio" 
              name="responsible" 
              checked={lawyer.isResponsible || false} 
              onChange={() => onUpdate("isResponsible", true)} 
              className="w-3.5 h-3.5 text-indigo-600" 
            />
            <span className={lawyer.isResponsible ? "font-medium text-indigo-700" : ""}>Sorumlu Avukat</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-xs">
            <input 
              type="checkbox" 
              checked={lawyer.hasSignatureAuthority || false} 
              onChange={(e) => onUpdate("hasSignatureAuthority", e.target.checked)} 
              className="w-3.5 h-3.5 rounded text-amber-600" 
            />
            <span className={lawyer.hasSignatureAuthority ? "font-medium text-amber-700" : ""}>İmza Yetkisi</span>
          </label>
        </div>
      </div>

      {/* Avukat Detay Modal */}
      {viewingLawyer && (
        <LawyerDetailModal lawyer={lawyer} onClose={() => setViewingLawyer(false)} />
      )}
    </>
  );
}

// Kompakt Avukat Seçimi - Tek sayfada yan yana görünüm için (geriye uyumluluk)
function CompactLawyerSelection({
  existingLawyers, selectedLawyers, onAddLawyer, onRemoveLawyer, onUpdateLawyer
}: {
  existingLawyers: any[]; selectedLawyers: Lawyer[];
  onAddLawyer: (lawyer: any) => void; onRemoveLawyer: (index: number) => void;
  onUpdateLawyer: (index: number, field: keyof Lawyer, value: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [viewingLawyer, setViewingLawyer] = useState<any>(null);
  const filtered = existingLawyers.filter(l => 
    l.name?.toLowerCase().includes(search.toLowerCase()) || l.surname?.toLowerCase().includes(search.toLowerCase())
  );
  const roleLabels: Record<string, string> = { OWNER: "Sahip", PARTNER: "Ortak", EMPLOYEE: "Avukat", INTERN: "Stajyer" };

  return (
    <div className="space-y-2">
      {/* Mevcut Avukatlar */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara..." className="w-full rounded border px-2 py-1 text-xs" />
      <div className="max-h-28 overflow-y-auto space-y-1">
        {filtered.map(lawyer => {
          const isSelected = selectedLawyers.find(sl => sl.id === lawyer.id);
          return (
            <div key={lawyer.id} className={`flex items-center justify-between p-1.5 rounded text-xs ${isSelected ? 'bg-green-50 border border-green-300' : 'hover:bg-gray-50'}`}>
              <button type="button" onClick={() => setViewingLawyer(lawyer)} className="text-left hover:text-primary hover:underline">
                {lawyer.title || "Av."} {lawyer.name} {lawyer.surname} <span className="text-muted-foreground">({roleLabels[lawyer.role] || ""})</span>
              </button>
              {!isSelected ? (
                <button type="button" onClick={() => onAddLawyer(lawyer)} className="text-primary hover:underline">Ekle</button>
              ) : (
                <span className="text-green-600">✓</span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Avukat bulunamadı</p>}
      </div>

      {/* Seçili Avukatlar */}
      {selectedLawyers.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Seçili ({selectedLawyers.length})</p>
          {selectedLawyers.map((lawyer, index) => (
            <div key={index} className={`p-1.5 rounded text-xs border ${lawyer.isResponsible ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setViewingLawyer(lawyer)} className="font-medium text-left hover:text-primary hover:underline">
                  {lawyer.title || "Av."} {lawyer.name} {lawyer.surname}
                </button>
                <button type="button" onClick={() => onRemoveLawyer(index)} className="text-red-500 hover:text-red-700">✕</button>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="responsible" checked={lawyer.isResponsible || false} onChange={() => onUpdateLawyer(index, "isResponsible", true)} className="w-3 h-3" />
                  <span>Sorumlu</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={lawyer.hasSignatureAuthority || false} onChange={e => onUpdateLawyer(index, "hasSignatureAuthority", e.target.checked)} className="w-3 h-3 rounded" />
                  <span>İmza</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Avukat Detay Modal */}
      {viewingLawyer && (
        <LawyerDetailModal lawyer={viewingLawyer} onClose={() => setViewingLawyer(null)} />
      )}
    </div>
  );
}

// Avukat Detay Modal
function LawyerDetailModal({ lawyer, onClose }: { lawyer: any; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...lawyer });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/lawyers/${lawyer.id}`, form);
      alert("Avukat bilgileri güncellendi");
      onClose();
    } catch (err: any) {
      alert(err.message || "Güncelleme başarısız");
    }
    setSaving(false);
  };

  const roleLabels: Record<string, string> = { OWNER: "Büro Sahibi", PARTNER: "Ortak", EMPLOYEE: "Avukat", INTERN: "Stajyer" };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-auto shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <svg className="h-5 w-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
            </div>
            <div>
              <h3 className="font-semibold">{lawyer.title || "Av."} {lawyer.name} {lawyer.surname}</h3>
              <p className="text-xs text-muted-foreground">{roleLabels[lawyer.role] || lawyer.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 shadow-sm hover:shadow-md transition-all flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Düzenle
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="h-5 w-5" /></button>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {editing ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1">Ad</label><input value={form.name || ""} onChange={e => setForm({...form, name: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">Soyad</label><input value={form.surname || ""} onChange={e => setForm({...form, surname: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">TC Kimlik No</label><input value={form.tckn || ""} onChange={e => setForm({...form, tckn: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm font-mono" /></div>
                <div><label className="block text-xs font-medium mb-1">Baro Sicil No</label><input value={form.barNumber || ""} onChange={e => setForm({...form, barNumber: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">Kayıtlı Baro</label><input value={form.barCity || ""} onChange={e => setForm({...form, barCity: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">TBB No</label><input value={form.tbbNo || ""} onChange={e => setForm({...form, tbbNo: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">Telefon</label><input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">E-posta</label><input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">Vergi Dairesi</label><input value={form.vergiDairesi || ""} onChange={e => setForm({...form, vergiDairesi: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">Vergi No</label><input value={form.vergiNo || ""} onChange={e => setForm({...form, vergiNo: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm font-mono" /></div>
                <div><label className="block text-xs font-medium mb-1">Banka</label><input value={form.bankName || ""} onChange={e => setForm({...form, bankName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">IBAN</label><input value={form.iban || ""} onChange={e => setForm({...form, iban: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm font-mono" /></div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.canSign || false} onChange={e => setForm({...form, canSign: e.target.checked})} className="w-4 h-4 rounded" /><span className="text-sm">İmza Yetkisi</span></label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.isDefaultForNewCases || false} onChange={e => setForm({...form, isDefaultForNewCases: e.target.checked})} className="w-4 h-4 rounded" /><span className="text-sm">Varsayılan Avukat</span></label>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {lawyer.tckn && <div><span className="text-muted-foreground">TC Kimlik:</span> <span className="font-mono">{lawyer.tckn}</span></div>}
                {lawyer.barNumber && <div><span className="text-muted-foreground">Baro Sicil:</span> {lawyer.barNumber}</div>}
                {lawyer.barCity && <div><span className="text-muted-foreground">Kayıtlı Baro:</span> {lawyer.barCity}</div>}
                {lawyer.tbbNo && <div><span className="text-muted-foreground">TBB No:</span> {lawyer.tbbNo}</div>}
                {lawyer.phone && <div><span className="text-muted-foreground">Telefon:</span> {lawyer.phone}</div>}
                {lawyer.email && <div><span className="text-muted-foreground">E-posta:</span> {lawyer.email}</div>}
                {lawyer.vergiDairesi && <div><span className="text-muted-foreground">Vergi Dairesi:</span> {lawyer.vergiDairesi}</div>}
                {lawyer.vergiNo && <div><span className="text-muted-foreground">Vergi No:</span> <span className="font-mono">{lawyer.vergiNo}</span></div>}
                {lawyer.bankName && <div><span className="text-muted-foreground">Banka:</span> {lawyer.bankName}</div>}
                {lawyer.iban && <div className="col-span-2"><span className="text-muted-foreground">IBAN:</span> <span className="font-mono text-xs">{lawyer.iban}</span></div>}
              </div>
              <div className="flex gap-2 pt-2 border-t">
                {lawyer.canSign && <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded">İmza Yetkisi ✓</span>}
                {lawyer.isDefaultForNewCases && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Varsayılan ✓</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">İptal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...</> : <><Check className="h-4 w-4" /> Kaydet</>}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Kapat</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Kompakt Personel Seçimi - Tek sayfada yan yana görünüm için
function CompactStaffSelection({
  existingStaff, selectedStaff, onAddStaff, onRemoveStaff, onUpdateStaff
}: {
  existingStaff: any[]; selectedStaff: any[];
  onAddStaff: (staff: any) => void; onRemoveStaff: (index: number) => void;
  onUpdateStaff: (index: number, field: string, value: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [viewingStaff, setViewingStaff] = useState<any>(null);
  const staffTypeLabels: Record<string, string> = {
    STAJYER_AVUKAT: "Stajyer", OFIS_KATIBI: "Katip", ADLI_KATIP: "Adli Katip",
    SEKRETER: "Sekreter", MUHASEBE: "Muhasebe", ARSIV: "Arşiv"
  };
  const filtered = existingStaff.filter(s => 
    s.firstName?.toLowerCase().includes(search.toLowerCase()) || s.lastName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      {/* Mevcut Personel */}
      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara..." className="w-full rounded border px-2 py-1 text-xs" />
      <div className="max-h-28 overflow-y-auto space-y-1">
        {filtered.map(staff => {
          const isSelected = selectedStaff.find(ss => ss.id === staff.id);
          return (
            <div key={staff.id} className={`flex items-center justify-between p-1.5 rounded text-xs ${isSelected ? 'bg-green-50 border border-green-300' : 'hover:bg-gray-50'}`}>
              <button type="button" onClick={() => setViewingStaff(staff)} className="text-left hover:text-primary hover:underline">
                {staff.firstName} {staff.lastName} <span className="text-muted-foreground">({staffTypeLabels[staff.staffType] || staff.staffType})</span>
              </button>
              {!isSelected ? (
                <button type="button" onClick={() => onAddStaff(staff)} className="text-primary hover:underline">Ekle</button>
              ) : (
                <span className="text-green-600">✓</span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Personel bulunamadı</p>}
      </div>

      {/* Seçili Personel */}
      {selectedStaff.length > 0 && (
        <div className="border-t pt-2 space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Seçili ({selectedStaff.length})</p>
          {selectedStaff.map((staff, index) => (
            <div key={index} className="p-1.5 rounded text-xs border border-gray-200">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setViewingStaff(staff)} className="font-medium text-left hover:text-primary hover:underline">
                  {staff.firstName} {staff.lastName}
                </button>
                <button type="button" onClick={() => onRemoveStaff(index)} className="text-red-500 hover:text-red-700">✕</button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={staff.canView || false} onChange={e => onUpdateStaff(index, "canView", e.target.checked)} className="w-3 h-3 rounded" />
                  <span>Görüntüle</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={staff.canEdit || false} onChange={e => onUpdateStaff(index, "canEdit", e.target.checked)} className="w-3 h-3 rounded" />
                  <span>Düzenle</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={staff.canApprove || false} onChange={e => onUpdateStaff(index, "canApprove", e.target.checked)} className="w-3 h-3 rounded" />
                  <span>Onayla</span>
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Personel Detay Modal */}
      {viewingStaff && (
        <StaffDetailModal staff={viewingStaff} onClose={() => setViewingStaff(null)} />
      )}
    </div>
  );
}

// Personel Detay Modal
function StaffDetailModal({ staff, onClose }: { staff: any; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ ...staff });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/staff/${staff.id}`, form);
      alert("Personel bilgileri güncellendi");
      onClose();
    } catch (err: any) {
      alert(err.message || "Güncelleme başarısız");
    }
    setSaving(false);
  };

  const staffTypeLabels: Record<string, string> = {
    STAJYER_AVUKAT: "Stajyer Avukat", OFIS_KATIBI: "Ofis Katibi", ADLI_KATIP: "Adli Katip",
    SEKRETER: "Sekreter", MUHASEBE: "Muhasebe", ARSIV: "Arşiv", DIGER: "Diğer"
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md max-h-[85vh] overflow-auto shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            </div>
            <div>
              <h3 className="font-semibold">{staff.firstName} {staff.lastName}</h3>
              <p className="text-xs text-muted-foreground">{staffTypeLabels[staff.staffType] || staff.staffType}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 shadow-sm hover:shadow-md transition-all flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Düzenle
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="h-5 w-5" /></button>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium mb-1">Ad</label><input value={form.firstName || ""} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium mb-1">Soyad</label><input value={form.lastName || ""} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              <div className="col-span-2">
                <label className="block text-xs font-medium mb-1">Görev</label>
                <select value={form.staffType || ""} onChange={e => setForm({...form, staffType: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm">
                  <option value="STAJYER_AVUKAT">Stajyer Avukat</option>
                  <option value="OFIS_KATIBI">Ofis Katibi</option>
                  <option value="ADLI_KATIP">Adli Katip</option>
                  <option value="SEKRETER">Sekreter</option>
                  <option value="MUHASEBE">Muhasebe</option>
                  <option value="ARSIV">Arşiv</option>
                  <option value="DIGER">Diğer</option>
                </select>
              </div>
              <div><label className="block text-xs font-medium mb-1">Telefon</label><input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              <div><label className="block text-xs font-medium mb-1">E-posta</label><input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              {staff.phone && <div><span className="text-muted-foreground">Telefon:</span> {staff.phone}</div>}
              {staff.email && <div><span className="text-muted-foreground">E-posta:</span> {staff.email}</div>}
              {staff.isActive !== undefined && (
                <div className="pt-2 border-t">
                  <span className={`px-2 py-1 rounded text-xs ${staff.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {staff.isActive ? 'Aktif' : 'Pasif'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">İptal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...</> : <><Check className="h-4 w-4" /> Kaydet</>}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Kapat</button>
          )}
        </div>
      </div>
    </div>
  );
}


// Kompakt Müvekkil Seçimi
function CompactClientSelection({
  existingClients, selectedClients, onAddClient, onRemoveClient
}: {
  existingClients: any[]; selectedClients: any[];
  onAddClient: (client: any) => void; onRemoveClient: (index: number) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [viewingClient, setViewingClient] = useState<any>(null);
  
  const filtered = existingClients.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || 
                          c.identityNo?.includes(search);
    const matchesType = typeFilter === "ALL" || c.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const typeLabels: Record<string, string> = { INDIVIDUAL: "Şahıs", PERSON: "Şahıs", COMPANY: "Kurum", PUBLIC: "Kamu" };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ad veya TCKN/VKN ile ara..." className="flex-1 rounded border px-2 py-1 text-xs" />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="rounded border px-2 py-1 text-xs">
          <option value="ALL">Tümü</option>
          <option value="PERSON">Şahıs</option>
          <option value="INDIVIDUAL">Şahıs</option>
          <option value="COMPANY">Kurum</option>
          <option value="PUBLIC">Kamu</option>
        </select>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map(client => {
          const isSelected = selectedClients.find(sc => sc.id === client.id);
          return (
            <div key={client.id} className={`flex items-center justify-between p-1.5 rounded text-xs ${isSelected ? 'bg-green-50 border border-green-300' : 'hover:bg-gray-100'}`}>
              <div className="flex-1">
                <button type="button" onClick={() => setViewingClient(client)} className="font-medium text-left hover:text-primary hover:underline">
                  {client.name}
                </button>
                <span className={`ml-2 px-1 py-0.5 rounded text-xs ${client.type === 'COMPANY' ? 'bg-blue-100 text-blue-700' : client.type === 'PUBLIC' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                  {typeLabels[client.type] || 'Şahıs'}
                </span>
                {client.identityNo && <span className="ml-2 text-muted-foreground">{client.identityNo}</span>}
              </div>
              {!isSelected ? (
                <button type="button" onClick={() => onAddClient(client)} className="text-primary hover:underline text-xs">Ekle</button>
              ) : (
                <span className="text-green-600 text-xs">✓ Seçili</span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Müvekkil bulunamadı</p>}
      </div>

      {/* Müvekkil Detay Modal */}
      {viewingClient && (
        <ClientDetailModal client={viewingClient} onClose={() => setViewingClient(null)} />
      )}
    </div>
  );
}

// Müvekkil Detay Modal
function ClientDetailModal({ client, onClose }: { client: any; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ 
    ...client,
    poaNumber: client.poaNumber || "",
    poaDate: client.poaDate || "",
    notaryName: client.notaryName || "",
    notaryCity: client.notaryCity || "",
    isLimitedPoa: client.isLimitedPoa || false,
    poaValidUntil: client.poaValidUntil || "",
    poaScopeType: client.poaScopeType || "GENEL",
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/clients/${client.id}`, form);
      alert("Müvekkil bilgileri güncellendi");
      onClose();
    } catch (err: any) {
      alert(err.message || "Güncelleme başarısız");
    }
    setSaving(false);
  };

  const isPerson = client.type === "PERSON" || client.type === "INDIVIDUAL";
  const typeLabels: Record<string, string> = { INDIVIDUAL: "Şahıs", PERSON: "Şahıs", COMPANY: "Kurum", PUBLIC: "Kamu" };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] overflow-auto shadow-2xl">
        <div className="flex justify-between items-center p-4 border-b sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-lg ${client.type === 'COMPANY' ? 'bg-blue-100' : client.type === 'PUBLIC' ? 'bg-purple-100' : 'bg-emerald-100'}`}>
              <svg className={`h-5 w-5 ${client.type === 'COMPANY' ? 'text-blue-600' : client.type === 'PUBLIC' ? 'text-purple-600' : 'text-emerald-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {client.type === 'COMPANY' || client.type === 'PUBLIC' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                )}
              </svg>
            </div>
            <div>
              <h3 className="font-semibold">
                {editing 
                  ? (isPerson 
                      ? `${form.firstName || ''} ${form.lastName || ''}`.trim() || client.name 
                      : form.companyName || form.name || client.name)
                  : (isPerson 
                      ? `${client.firstName || ''} ${client.lastName || ''}`.trim() || client.name || client.displayName
                      : client.companyName || client.name || client.displayName)}
              </h3>
              <p className="text-xs text-muted-foreground">{typeLabels[client.type] || client.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs font-medium bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:from-amber-600 hover:to-orange-600 shadow-sm hover:shadow-md transition-all flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                Düzenle
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"><X className="h-5 w-5" /></button>
          </div>
        </div>
        
        <div className="p-4 space-y-4">
          {editing ? (
            <div className="space-y-3">
              {isPerson ? (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1">Ad</label><input value={form.firstName || ""} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  <div><label className="block text-xs font-medium mb-1">Soyad</label><input value={form.lastName || ""} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  <div className="col-span-2"><label className="block text-xs font-medium mb-1">TC Kimlik No</label><input value={form.tckn || form.identityNo || ""} onChange={e => setForm({...form, tckn: e.target.value, identityNo: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm font-mono" /></div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div><label className="block text-xs font-medium mb-1">Kurum Adı</label><input value={form.companyName || form.name || ""} onChange={e => setForm({...form, companyName: e.target.value, name: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="block text-xs font-medium mb-1">VKN</label><input value={form.vkn || form.identityNo || ""} onChange={e => setForm({...form, vkn: e.target.value, identityNo: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm font-mono" /></div>
                    <div><label className="block text-xs font-medium mb-1">Vergi Dairesi</label><input value={form.taxOffice || ""} onChange={e => setForm({...form, taxOffice: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1">Telefon</label><input value={form.phone || ""} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">E-posta</label><input value={form.email || ""} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              </div>
              <div><label className="block text-xs font-medium mb-1">Adres</label><textarea value={form.address || ""} onChange={e => setForm({...form, address: e.target.value})} rows={2} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium mb-1">İl</label><input value={form.city || ""} onChange={e => setForm({...form, city: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                <div><label className="block text-xs font-medium mb-1">İlçe</label><input value={form.district || ""} onChange={e => setForm({...form, district: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
              </div>
              
              {/* Vekalet Bilgileri - Düzenleme */}
              <div className="pt-3 border-t">
                <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                  Vekalet Bilgileri
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-medium mb-1">Yevmiye No</label><input value={form.poaNumber || ""} onChange={e => setForm({...form, poaNumber: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="12345" /></div>
                  <div><label className="block text-xs font-medium mb-1">Vekalet Tarihi</label><input type="date" value={form.poaDate || ""} onChange={e => setForm({...form, poaDate: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" /></div>
                  <div><label className="block text-xs font-medium mb-1">Noter Adı</label><input value={form.notaryName || ""} onChange={e => setForm({...form, notaryName: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="1. Noter" /></div>
                  <div><label className="block text-xs font-medium mb-1">Noter İli</label><input value={form.notaryCity || ""} onChange={e => setForm({...form, notaryCity: e.target.value})} className="w-full border rounded px-2 py-1.5 text-sm" placeholder="İstanbul" /></div>
                </div>
                
                {/* Süreli Vekalet */}
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="checkbox" id="isLimitedPoa" checked={form.isLimitedPoa || false} onChange={e => setForm({...form, isLimitedPoa: e.target.checked})} className="rounded border-amber-400 text-amber-600 focus:ring-amber-500" />
                    <label htmlFor="isLimitedPoa" className="text-xs font-medium text-amber-800">⏰ Süreli Vekalet</label>
                  </div>
                  {form.isLimitedPoa && (
                    <div className="grid grid-cols-2 gap-3 mt-2">
                      <div>
                        <label className="block text-xs font-medium mb-1 text-amber-700">Vekalet Bitiş Tarihi</label>
                        <input type="date" value={form.poaValidUntil || ""} onChange={e => setForm({...form, poaValidUntil: e.target.value})} className="w-full border border-amber-300 rounded px-2 py-1.5 text-sm bg-white focus:ring-amber-500 focus:border-amber-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-amber-700">Kapsam</label>
                        <select value={form.poaScopeType || "GENEL"} onChange={e => setForm({...form, poaScopeType: e.target.value})} className="w-full border border-amber-300 rounded px-2 py-1.5 text-sm bg-white focus:ring-amber-500 focus:border-amber-500">
                          <option value="GENEL">Genel Vekalet</option>
                          <option value="ICRA_TAKIP">İcra Takipleri</option>
                          <option value="BU_DOSYA">Bu Dosya İçin</option>
                          <option value="OZEL">Özel Kapsam</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Vekalet Yetkileri - Düzenleme */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Vekalet Yetkileri</p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.canCollect || false} onChange={e => setForm({...form, canCollect: e.target.checked})} className="rounded border-gray-300 text-green-600 focus:ring-green-500" /> Ahzu Kabza</label>
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.canWaive || false} onChange={e => setForm({...form, canWaive: e.target.checked})} className="rounded border-gray-300 text-green-600 focus:ring-green-500" /> Feragat</label>
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.canSettle || false} onChange={e => setForm({...form, canSettle: e.target.checked})} className="rounded border-gray-300 text-green-600 focus:ring-green-500" /> Sulh</label>
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={form.canRelease || false} onChange={e => setForm({...form, canRelease: e.target.checked})} className="rounded border-gray-300 text-green-600 focus:ring-green-500" /> İbra</label>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {isPerson && client.firstName && <div><span className="text-muted-foreground">Ad:</span> {client.firstName}</div>}
                {isPerson && client.lastName && <div><span className="text-muted-foreground">Soyad:</span> {client.lastName}</div>}
                {!isPerson && client.companyName && <div className="col-span-2"><span className="text-muted-foreground">Kurum:</span> {client.companyName}</div>}
                {(client.tckn || client.identityNo) && <div><span className="text-muted-foreground">{isPerson ? 'TCKN:' : 'VKN:'}</span> <span className="font-mono">{client.tckn || client.identityNo}</span></div>}
                {client.taxOffice && <div><span className="text-muted-foreground">Vergi Dairesi:</span> {client.taxOffice}</div>}
                {client.phone && <div><span className="text-muted-foreground">Telefon:</span> {client.phone}</div>}
                {client.email && <div><span className="text-muted-foreground">E-posta:</span> {client.email}</div>}
                {client.city && <div><span className="text-muted-foreground">İl:</span> {client.city}</div>}
                {client.district && <div><span className="text-muted-foreground">İlçe:</span> {client.district}</div>}
              </div>
              {client.address && (
                <div className="text-sm pt-2 border-t">
                  <span className="text-muted-foreground">Adres:</span>
                  <p className="mt-1">{client.address}</p>
                </div>
              )}
              {/* Vekalet Bilgileri */}
              {(client.poaNumber || client.poaDate || client.notaryName) && (
                <div className="pt-2 border-t">
                  <p className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                    Vekalet Bilgileri
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {client.poaNumber && <div><span className="text-muted-foreground">Yevmiye No:</span> {client.poaNumber}</div>}
                    {client.poaDate && <div><span className="text-muted-foreground">Tarih:</span> {new Date(client.poaDate).toLocaleDateString('tr-TR')}</div>}
                    {client.notaryName && <div><span className="text-muted-foreground">Noter:</span> {client.notaryName}</div>}
                    {client.notaryCity && <div><span className="text-muted-foreground">Noter İli:</span> {client.notaryCity}</div>}
                  </div>
                  
                  {/* Süreli Vekalet Uyarısı */}
                  {client.isLimitedPoa && (
                    <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-600">⏰</span>
                        <div className="text-xs">
                          <span className="font-medium text-amber-800">Süreli Vekalet</span>
                          {client.poaValidUntil && (
                            <span className="text-amber-700 ml-1">
                              - {new Date(client.poaValidUntil).toLocaleDateString('tr-TR')}&apos;e kadar geçerli
                            </span>
                          )}
                        </div>
                      </div>
                      {client.poaScopeType && client.poaScopeType !== 'GENEL' && (
                        <div className="mt-1 text-xs text-amber-600">
                          Kapsam: {client.poaScopeType === 'ICRA_TAKIP' ? 'İcra Takipleri' : client.poaScopeType === 'BU_DOSYA' ? 'Bu Dosya İçin' : 'Özel'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Vekalet Yetkileri */}
              <div className="pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Vekalet Yetkileri</p>
                <div className="flex flex-wrap gap-2">
                  {client.canCollect && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Ahzu Kabza ✓</span>}
                  {client.canWaive && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Feragat ✓</span>}
                  {client.canSettle && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Sulh ✓</span>}
                  {client.canRelease && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">İbra ✓</span>}
                  {!client.canCollect && !client.canWaive && !client.canSettle && !client.canRelease && (
                    <span className="text-xs text-muted-foreground">Yetki bilgisi yok</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t sticky bottom-0 bg-white">
          {editing ? (
            <>
              <button onClick={() => setEditing(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">İptal</button>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Kaydediliyor...</> : <><Check className="h-4 w-4" /> Kaydet</>}
              </button>
            </>
          ) : (
            <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Kapat</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Yeni Müvekkil Modal - Sihirbazda hızlı müvekkil ekleme + Vekaletname Tarama
function NewClientModal({ onSave, onClose, saving }: { 
  onSave: (data: any) => void; 
  onClose: () => void; 
  saving: boolean;
}) {
  const [form, setForm] = useState({
    type: "PERSON" as "PERSON" | "COMPANY" | "PUBLIC",
    firstName: "",
    lastName: "",
    tckn: "",
    companyName: "",
    vkn: "",
    taxOffice: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    district: "",
    canCollect: true,
    canWaive: false,
    canSettle: false,
    canRelease: false,
    // Vekaletname bilgileri
    poaNumber: "",
    poaDate: "",
    notaryName: "",
    notaryCity: "",
  });

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ confidence: number; lawyerName?: string; lawyerBarNumber?: string } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isPerson = form.type === "PERSON";

  // Vekaletname tarama
  const handlePoaScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // FormData için doğrudan fetch kullan
      const token = localStorage.getItem("token");
      const fetchResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/ocr/scan-poa`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      
      if (!fetchResponse.ok) {
        const errorData = await fetchResponse.json().catch(() => ({}));
        throw new Error(errorData.message || "Vekaletname taranamadı");
      }
      
      const response = await fetchResponse.json();

      const data = response.data?.data || response.data;
      
      // Form alanlarını doldur
      setForm(prev => ({
        ...prev,
        type: data.clientType || prev.type,
        firstName: data.firstName || prev.firstName,
        lastName: data.lastName || prev.lastName,
        tckn: data.tckn || prev.tckn,
        companyName: data.companyName || prev.companyName,
        vkn: data.vkn || prev.vkn,
        taxOffice: data.taxOffice || prev.taxOffice,
        phone: data.phone || prev.phone,
        email: data.email || prev.email,
        address: data.address || prev.address,
        city: data.city || prev.city,
        district: data.district || prev.district,
        canCollect: data.canCollect ?? prev.canCollect,
        canWaive: data.canWaive ?? prev.canWaive,
        canSettle: data.canSettle ?? prev.canSettle,
        canRelease: data.canRelease ?? prev.canRelease,
        poaNumber: data.poaNumber || prev.poaNumber,
        poaDate: data.poaDate || prev.poaDate,
        notaryName: data.notaryName || prev.notaryName,
        notaryCity: data.notaryCity || prev.notaryCity,
      }));

      setScanResult({
        confidence: data.confidence || 0,
        lawyerName: data.lawyerName,
        lawyerBarNumber: data.lawyerBarNumber,
      });

    } catch (err: any) {
      alert(err.message || "Vekaletname taranamadı");
    } finally {
      setScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = () => {
    if (isPerson) {
      if (!form.firstName || !form.lastName) { alert("Ad ve Soyad zorunludur"); return; }
      if (!form.tckn || form.tckn.length !== 11) { alert("TCKN 11 haneli olmalıdır"); return; }
    } else {
      if (!form.companyName) { alert("Kurum adı zorunludur"); return; }
      if (!form.vkn || form.vkn.length !== 10) { alert("VKN 10 haneli olmalıdır"); return; }
    }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center p-3 border-b sticky top-0 bg-white">
          <h3 className="font-semibold text-sm">Yeni Müvekkil Ekle</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700"><X className="h-4 w-4" /></button>
        </div>
        
        <div className="p-3 space-y-3">
          {/* Vekaletname Tarama */}
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-blue-700 text-lg">📄</span>
                <div>
                  <p className="text-xs font-semibold text-blue-800">Vekaletname Tara (AI)</p>
                  <p className="text-xs text-blue-600">PDF veya görüntü yükleyin, bilgiler otomatik doldurulsun</p>
                </div>
              </div>
              <label className={`px-3 py-1.5 text-xs rounded cursor-pointer flex items-center gap-1 ${scanning ? 'bg-blue-200 text-blue-600' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                {scanning ? <><Loader2 className="h-3 w-3 animate-spin" /> Taranıyor...</> : <><Plus className="h-3 w-3" /> Vekaletname Yükle</>}
                <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.tiff,.doc,.docx" onChange={handlePoaScan} className="hidden" disabled={scanning} />
              </label>
            </div>
            {scanResult && (
              <div className="mt-2 p-2 bg-white rounded border border-blue-200 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded ${scanResult.confidence >= 70 ? 'bg-green-100 text-green-700' : scanResult.confidence >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    Güven: %{scanResult.confidence}
                  </span>
                  {scanResult.lawyerName && <span className="text-muted-foreground">Vekil: {scanResult.lawyerName}</span>}
                  {scanResult.lawyerBarNumber && <span className="text-muted-foreground">#{scanResult.lawyerBarNumber}</span>}
                </div>
                <p className="text-green-600 mt-1">✓ Bilgiler forma aktarıldı. Lütfen kontrol edin.</p>
              </div>
            )}
          </div>

          {/* Tür Seçimi */}
          <div className="flex gap-2">
            {[
              { value: "PERSON", label: "Şahıs" },
              { value: "COMPANY", label: "Kurum" },
              { value: "PUBLIC", label: "Kamu" },
            ].map(t => (
              <button key={t.value} type="button" onClick={() => setForm({...form, type: t.value as any})}
                className={`flex-1 px-2 py-1.5 rounded border text-xs ${form.type === t.value ? 'border-primary bg-primary/5 font-medium' : 'border-gray-200'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Sol Kolon: Müvekkil Bilgileri */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 border-b pb-1">Müvekkil Bilgileri</p>
              
              {/* Şahıs Alanları */}
              {isPerson ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-0.5">Ad <span className="text-red-500">*</span></label>
                      <input value={form.firstName} onChange={e => setForm({...form, firstName: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.5">Soyad <span className="text-red-500">*</span></label>
                      <input value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-0.5">TCKN <span className="text-red-500">*</span></label>
                    <input value={form.tckn} onChange={e => setForm({...form, tckn: e.target.value.replace(/\D/g, "")})} maxLength={11} placeholder="11 haneli" className="w-full border rounded px-2 py-1 text-xs font-mono" />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium mb-0.5">Kurum Adı <span className="text-red-500">*</span></label>
                    <input value={form.companyName} onChange={e => setForm({...form, companyName: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-0.5">VKN <span className="text-red-500">*</span></label>
                      <input value={form.vkn} onChange={e => setForm({...form, vkn: e.target.value.replace(/\D/g, "")})} maxLength={10} placeholder="10 haneli" className="w-full border rounded px-2 py-1 text-xs font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.5">Vergi Dairesi</label>
                      <input value={form.taxOffice} onChange={e => setForm({...form, taxOffice: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                    </div>
                  </div>
                </>
              )}

              {/* İletişim */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-0.5">Telefon</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5">E-posta</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </div>

              {/* Adres */}
              <div>
                <label className="block text-xs font-medium mb-0.5">Adres</label>
                <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} rows={2} className="w-full border rounded px-2 py-1 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-0.5">İl</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5">İlçe</label>
                  <input value={form.district} onChange={e => setForm({...form, district: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </div>
            </div>

            {/* Sağ Kolon: Vekaletname Bilgileri */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 border-b pb-1">Vekaletname Bilgileri</p>
              
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-0.5">Yevmiye No</label>
                  <input value={form.poaNumber} onChange={e => setForm({...form, poaNumber: e.target.value})} placeholder="12345" className="w-full border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5">Tarih</label>
                  <input type="date" value={form.poaDate} onChange={e => setForm({...form, poaDate: e.target.value})} className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-0.5">Noter Adı</label>
                  <input value={form.notaryName} onChange={e => setForm({...form, notaryName: e.target.value})} placeholder="1. Noter" className="w-full border rounded px-2 py-1 text-xs" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-0.5">Noter İli</label>
                  <input value={form.notaryCity} onChange={e => setForm({...form, notaryCity: e.target.value})} placeholder="İstanbul" className="w-full border rounded px-2 py-1 text-xs" />
                </div>
              </div>

              {/* Yetkiler */}
              <div className="p-2 bg-amber-50 rounded border border-amber-200">
                <p className="text-xs font-medium text-amber-800 mb-1.5">Vekaletname Yetkileri</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={form.canCollect} onChange={e => setForm({...form, canCollect: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                    <span className="text-xs">Ahzu Kabza</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={form.canWaive} onChange={e => setForm({...form, canWaive: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                    <span className="text-xs">Feragat</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={form.canSettle} onChange={e => setForm({...form, canSettle: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                    <span className="text-xs">Sulh</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={form.canRelease} onChange={e => setForm({...form, canRelease: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                    <span className="text-xs">İbra</span>
                  </label>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground p-2 bg-gray-50 rounded">
                💡 Vekaletname yüklerseniz bu alanlar otomatik doldurulur
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center p-3 border-t sticky bottom-0 bg-white">
          <p className="text-xs text-muted-foreground">Kayıt Ayarlar &gt; Müvekkiller'e de eklenir</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs border rounded hover:bg-gray-50">İptal</button>
            <button onClick={handleSubmit} disabled={saving} className="px-3 py-1.5 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
              {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Kaydediliyor...</> : <><Check className="h-3 w-3" /> Kaydet ve Ekle</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


// Müvekkil Rehberi Paneli - DebtorStep gibi sol panel
function CreditorDirectoryPanel({
  existingClients, selectedClients, onAddClient, onEditClient
}: {
  existingClients: any[]; selectedClients: any[];
  onAddClient: (client: any) => void; onEditClient?: (client: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [viewingClient, setViewingClient] = useState<any>(null);
  
  const filtered = existingClients.filter(c => {
    const matchesSearch = c.name?.toLowerCase().includes(search.toLowerCase()) || 
                          c.displayName?.toLowerCase().includes(search.toLowerCase()) ||
                          c.identityNo?.includes(search) ||
                          c.tckn?.includes(search) ||
                          c.vkn?.includes(search) ||
                          c.phone?.includes(search);
    const matchesType = typeFilter === "ALL" || c.type === typeFilter;
    const notSelected = !selectedClients.find(sc => sc.id === c.id);
    return matchesSearch && matchesType && notSelected;
  });

  const typeLabels: Record<string, string> = { INDIVIDUAL: "Şahıs", PERSON: "Şahıs", COMPANY: "Kurum", PUBLIC: "Kamu" };

  return (
    <div className="space-y-2">
      {/* Arama ve Filtre */}
      <div className="flex gap-2 mb-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, TCKN, VKN veya telefon..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Tip Filtreleri */}
      <div className="flex gap-1 mb-2">
        {[
          { value: "ALL", label: "Tümü", icon: null },
          { value: "PERSON", label: "Şahıs", icon: Users },
          { value: "INDIVIDUAL", label: "Şahıs", icon: Users },
          { value: "COMPANY", label: "Kurum", icon: Building2 },
          { value: "PUBLIC", label: "Kamu", icon: Landmark },
        ].filter((opt, idx, arr) => {
          // PERSON ve INDIVIDUAL aynı, sadece birini göster
          if (opt.value === "INDIVIDUAL") return false;
          return true;
        }).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTypeFilter(opt.value)}
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

      {/* Müvekkil Listesi */}
      <div className="max-h-[280px] overflow-y-auto space-y-1.5">
        {filtered.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            {search ? "Sonuç bulunamadı" : "Müvekkil bulunamadı"}
          </div>
        ) : (
          filtered.slice(0, 10).map((client) => {
            const isCompany = client.type === 'COMPANY';
            const isPublic = client.type === 'PUBLIC';
            return (
              <div
                key={client.id}
                className="p-2 border rounded-lg hover:border-primary hover:bg-primary/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => onAddClient(client)}>
                    <div className="flex items-center gap-2">
                      {isCompany ? (
                        <Building2 className="h-3.5 w-3.5 text-blue-500" />
                      ) : isPublic ? (
                        <Landmark className="h-3.5 w-3.5 text-purple-500" />
                      ) : (
                        <Users className="h-3.5 w-3.5 text-emerald-500" />
                      )}
                      <span className="font-medium text-sm">{client.displayName || client.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                      {(client.tckn || client.vkn || client.identityNo) && (
                        <span className="font-mono">{client.tckn || client.vkn || client.identityNo}</span>
                      )}
                      {client.phone && (
                        <span className="flex items-center gap-0.5">
                          <Phone className="h-3 w-3" />{client.phone}
                        </span>
                      )}
                      {client.email && (
                        <span className="flex items-center gap-0.5">
                          <Mail className="h-3 w-3" />{client.email}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setViewingClient(client); }}
                      className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                      title="Düzenle"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onAddClient(client)}
                      className="text-xs px-2 py-1 bg-primary/10 text-primary rounded hover:bg-primary hover:text-white flex items-center gap-0.5 font-medium"
                    >
                      + Ekle
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {filtered.length > 10 && (
          <p className="text-xs text-center text-muted-foreground py-1">
            +{filtered.length - 10} daha... (arama yapın)
          </p>
        )}
      </div>

      {/* Müvekkil Detay Modal */}
      {viewingClient && (
        <ClientDetailModal client={viewingClient} onClose={() => setViewingClient(null)} />
      )}
    </div>
  );
}

// Seçili Müvekkil Kartı - DebtorStep'teki SelectedDebtorCard gibi
function SelectedCreditorCard({ creditor, onRemove }: { creditor: any; onRemove: () => void }) {
  const [viewingClient, setViewingClient] = useState(false);
  const isCompany = creditor.type === 'COMPANY';
  const isPublic = creditor.type === 'PUBLIC';

  return (
    <>
      <div className="p-2.5 border rounded-lg bg-gradient-to-r from-emerald-50/50 to-teal-50/50 border-emerald-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className={`p-1.5 rounded-lg ${isCompany ? 'bg-blue-100' : isPublic ? 'bg-purple-100' : 'bg-emerald-100'}`}>
              {isCompany ? (
                <Building2 className="h-4 w-4 text-blue-600" />
              ) : isPublic ? (
                <Landmark className="h-4 w-4 text-purple-600" />
              ) : (
                <Users className="h-4 w-4 text-emerald-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{creditor.displayName || creditor.name}</span>
                <span className={`px-1.5 py-0.5 rounded text-xs ${
                  isCompany ? 'bg-blue-100 text-blue-700' : 
                  isPublic ? 'bg-purple-100 text-purple-700' : 
                  'bg-emerald-100 text-emerald-700'
                }`}>
                  {isCompany ? 'Kurum' : isPublic ? 'Kamu' : 'Şahıs'}
                </span>
              </div>
              <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                {(creditor.tckn || creditor.vkn || creditor.identityNo) && (
                  <span className="font-mono">{creditor.tckn || creditor.vkn || creditor.identityNo}</span>
                )}
                {creditor.phone && <span>{creditor.phone}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewingClient(true)}
              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Düzenle"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Kaldır"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Müvekkil Detay Modal */}
      {viewingClient && (
        <ClientDetailModal client={creditor} onClose={() => setViewingClient(false)} />
      )}
    </>
  );
}

// Seçili Müvekkiller Listesi - İsme tıklanınca detay modalı açılır (geriye uyumluluk için)
function SelectedCreditorsList({ creditors, onRemove }: { creditors: Party[]; onRemove: (index: number) => void }) {
  const [viewingClient, setViewingClient] = useState<any>(null);

  return (
    <>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {creditors.map((creditor, index) => {
          const isCompany = creditor.type === 'COMPANY';
          const isPublic = (creditor.type as string) === 'PUBLIC';
          return (
            <div key={index} className="p-2 rounded-lg border border-gray-200 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setViewingClient(creditor)} className="font-medium hover:text-primary hover:underline text-left">
                    {creditor.name}
                  </button>
                  <span className={`px-1.5 py-0.5 rounded text-xs ${isCompany ? 'bg-blue-100 text-blue-700' : isPublic ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                    {isCompany ? 'Kurum' : isPublic ? 'Kamu' : 'Şahıs'}
                  </span>
                </div>
                <button type="button" onClick={() => onRemove(index)} className="text-red-500 hover:text-red-700">✕</button>
              </div>
              {creditor.identityNo && <p className="text-muted-foreground">{isCompany || isPublic ? 'VKN' : 'TCKN'}: {creditor.identityNo}</p>}
            </div>
          );
        })}
      </div>

      {/* Müvekkil Detay Modal */}
      {viewingClient && (
        <ClientDetailModal client={viewingClient} onClose={() => setViewingClient(null)} />
      )}
    </>
  );
}


// Alacak Kalemleri Adımı - Faiz Hesaplama ve Kapak Hesabı
function DuesStep({
  dues,
  caseData,
  onAddDue,
  onUpdateDue,
  onRemoveDue,
  getTotalDues,
  extractedData,
  wizardData,
  creditors,
  caseDebtors,
  selectedOffice,
  lawyers,
}: {
  dues: DueItem[];
  caseData: any;
  onAddDue: () => void;
  onUpdateDue: (index: number, field: keyof DueItem, value: any) => void;
  onRemoveDue: (index: number) => void;
  getTotalDues: () => number;
  extractedData?: Record<string, any>;
  wizardData?: Record<string, any>;
  creditors: Array<{ name: string; [key: string]: any }>;
  caseDebtors: any[];
  selectedOffice: any;
  lawyers: Array<{ name: string; surname: string; [key: string]: any }>;
}) {
  const [showInterestPanel, setShowInterestPanel] = useState(false);
  const [showPeriodSelector, setShowPeriodSelector] = useState(false);
  const [showTakipTalebiPreview, setShowTakipTalebiPreview] = useState(false);
  const [takipTalebiContent, setTakipTalebiContent] = useState<string>("");
  const [generatingTakipTalebi, setGeneratingTakipTalebi] = useState(false);
  const [calculatingInterest, setCalculatingInterest] = useState(false);
  const [generatingFromRules, setGeneratingFromRules] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    isValid: boolean;
    errors: { id: string; message: string }[];
    warnings: { id: string; message: string }[];
  } | null>(null);
  const [interestResult, setInterestResult] = useState<{
    principal: number;
    rate: number;
    days: number;
    interest: number;
    total: number;
    description: string;
  } | null>(null);
  const [interestForm, setInterestForm] = useState({
    principalIndex: -1, // Hangi ana para kalemi için hesaplanacak
    interestType: (caseData.interestType === "TICARI" ? "TICARI" : "YASAL") as "YASAL" | "TICARI" | "AVANS" | "TEMERRUT",
    customRate: "",
    startDate: "",
    endDate: new Date().toISOString().split("T")[0],
  });

  // Faiz oranları (2024 yılı için)
  // NOT: YASAL faiz dönemsel hesaplanmalı (2006-2024: %9, 2024+: %24)
  const interestRates = {
    YASAL: 24, // 2024 sonrası oran, 2024 öncesi %9 - dönemsel hesaplama gerekli
    TICARI: 48, // Ticari faiz (avans faizi x 1.5) yaklaşık
    AVANS: 32, // Avans faizi (TCMB reeskont)
    TEMERRUT: 24, // Temerrüt faizi (yasal faiz ile aynı)
  };

  // Ana para kalemlerini bul
  const principalDues = dues.filter(d => d.type === "PRINCIPAL");
  
  // Çek takibi mi kontrol et
  const isCekTakibi = caseData.subCategory === "CEK" || caseData.mahiyetKodu === "CEK";
  
  // Nafaka veya Kira takibi mi kontrol et (dönemsel alacak)
  const isNafakaTakibi = caseData.subCategory === "NAFAKA" || caseData.mahiyetKodu === "NAFAKA";
  const isKiraTakibi = caseData.subCategory === "KIRA" || caseData.mahiyetKodu === "KIRA";
  const isPeriodic = isNafakaTakibi || isKiraTakibi;
  
  // Çek tazminatı kalemi var mı kontrol et
  const hasCekTazminati = dues.some(d => d.description?.includes("Çek Tazminatı") || d.description?.includes("tazminat"));
  
  /**
   * Otomatik faiz hesaplama fonksiyonu - BACKEND API KULLANIMI
   * 
   * Backend interest-engine preview endpoint'ini kullanır.
   * API erişilemezse null döner - TAHMİN YAPILMAZ.
   * 
   * @see docs/single-source-of-truth-architecture.md
   * @see lib/api/interest-engine.ts
   */
  const calculateAutoInterest = async (principal: number, dueDate: string, interestType: "YASAL" | "TICARI") => {
    const today = new Date();
    const due = new Date(dueDate);
    
    // Vade tarihi gelecekte ise faiz hesaplanmaz
    if (due >= today) return null;
    
    const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 0) return null;
    
    try {
      // Backend preview API'den hesaplama al
      const { interestEngineApi, InterestTypeCode } = await import('@/lib/api/interest-engine');
      
      const engineType = interestType === "TICARI" 
        ? InterestTypeCode.COMMERCIAL_AVANS_3095_2_2 
        : InterestTypeCode.LEGAL_3095;
      
      const result = await interestEngineApi.preview({
        principalAmount: principal,
        currency: 'TRY',
        interestType: engineType,
        startDate: dueDate,
        endDate: today.toISOString().split("T")[0],
      });
      
      if (!result.success || !result.data) {
        console.warn('[calculateAutoInterest] Backend preview failed:', result.error);
        // API erişilemezse null döner - TAHMİN YAPILMAZ
        return null;
      }
      
      return {
        interest: result.data.estimatedInterest,
        days: result.data.days,
        rate: result.data.currentRate,
        startDate: dueDate,
        endDate: today.toISOString().split("T")[0],
      };
    } catch (error) {
      console.error('[calculateAutoInterest] API error:', error);
      // API erişilemezse null döner - TAHMİN YAPILMAZ
      return null;
    }
  };

  // Ana para değiştiğinde çek tazminatını ve faizi otomatik hesapla/güncelle
  const handlePrincipalAmountChange = async (index: number, newAmount: string) => {
    onUpdateDue(index, "amount", newAmount);
    
    const amount = parseFloat(newAmount) || 0;
    if (amount <= 0) return;
    
    const dueDate = dues[index]?.dueDate;
    
    // 1. Çek takibi ise tazminat hesapla
    if (isCekTakibi) {
      const tazminatAmount = amount * 0.10; // %10 çek tazminatı
      
      // Mevcut tazminat kalemini bul veya yeni ekle
      const tazminatIndex = dues.findIndex(d => d.description?.includes("Çek Tazminatı"));
      
      if (tazminatIndex >= 0) {
        onUpdateDue(tazminatIndex, "amount", tazminatAmount.toFixed(2));
      } else if (!hasCekTazminati) {
        setTimeout(() => {
          onAddDue();
          setTimeout(() => {
            const newIndex = dues.length;
            onUpdateDue(newIndex, "type", "OTHER");
            onUpdateDue(newIndex, "amount", tazminatAmount.toFixed(2));
            onUpdateDue(newIndex, "description", "Çek Tazminatı (%10)");
            onUpdateDue(newIndex, "dueDate", dueDate || new Date().toISOString().split("T")[0]);
          }, 50);
        }, 50);
      }
    }
    
    // 2. Vade tarihi varsa ve geçmişse faiz hesapla
    if (dueDate) {
      const interestType = isCekTakibi || caseData.interestType === "TICARI" ? "TICARI" : "YASAL";
      const autoInterest = await calculateAutoInterest(amount, dueDate, interestType);
      
      if (autoInterest && autoInterest.interest > 0) {
        // Bu ana para için mevcut faiz kalemini bul
        const existingInterestIndex = dues.findIndex(d => 
          d.type === "INTEREST" && 
          d.description?.includes(dues[index]?.description || "Ana Para")
        );
        
        const interestLabel = interestType === "TICARI" ? "Ticari" : "Yasal";
        const description = `İşlemiş ${interestLabel} Faiz (${dues[index]?.description || "Ana Para"} - ${autoInterest.days} gün)`;
        
        if (existingInterestIndex >= 0) {
          // Mevcut faizi güncelle
          onUpdateDue(existingInterestIndex, "amount", autoInterest.interest.toFixed(2));
          onUpdateDue(existingInterestIndex, "description", description);
        } else {
          // Yeni faiz kalemi ekle
          const delay = isCekTakibi ? 200 : 100; // Çek tazminatı eklendiyse biraz daha bekle
          setTimeout(() => {
            onAddDue();
            setTimeout(() => {
              const newIndex = dues.length + (isCekTakibi && !hasCekTazminati ? 1 : 0);
              onUpdateDue(newIndex, "type", "INTEREST");
              onUpdateDue(newIndex, "amount", autoInterest.interest.toFixed(2));
              onUpdateDue(newIndex, "description", description);
              onUpdateDue(newIndex, "dueDate", autoInterest.endDate);
              onUpdateDue(newIndex, "interestType", interestType);
              onUpdateDue(newIndex, "interestRate", autoInterest.rate);
              onUpdateDue(newIndex, "interestStartDate", autoInterest.startDate);
              onUpdateDue(newIndex, "interestEndDate", autoInterest.endDate);
            }, 50);
          }, delay);
        }
      }
    }
  };
  
  // Vade tarihi değiştiğinde faiz başlangıç tarihini otomatik ayarla ve faizi hesapla
  const handleDueDateChange = async (index: number, newDate: string) => {
    onUpdateDue(index, "dueDate", newDate);
    
    // Ana para kalemi ise ve faiz paneli açıksa, faiz başlangıç tarihini güncelle
    if (dues[index]?.type === "PRINCIPAL" && interestForm.principalIndex === index) {
      setInterestForm(prev => ({ ...prev, startDate: newDate }));
    }
    
    // Ana para kalemi ise ve tutar varsa, faizi otomatik hesapla
    if (dues[index]?.type === "PRINCIPAL") {
      const amount = parseFloat(dues[index]?.amount || "0");
      if (amount > 0 && newDate) {
        const interestType = isCekTakibi || caseData.interestType === "TICARI" ? "TICARI" : "YASAL";
        const autoInterest = await calculateAutoInterest(amount, newDate, interestType);
        
        if (autoInterest && autoInterest.interest > 0) {
          // Bu ana para için mevcut faiz kalemini bul
          const existingInterestIndex = dues.findIndex(d => 
            d.type === "INTEREST" && 
            d.description?.includes(dues[index]?.description || "Ana Para")
          );
          
          const interestLabel = interestType === "TICARI" ? "Ticari" : "Yasal";
          const description = `İşlemiş ${interestLabel} Faiz (${dues[index]?.description || "Ana Para"} - ${autoInterest.days} gün)`;
          
          if (existingInterestIndex >= 0) {
            // Mevcut faizi güncelle
            onUpdateDue(existingInterestIndex, "amount", autoInterest.interest.toFixed(2));
            onUpdateDue(existingInterestIndex, "description", description);
            onUpdateDue(existingInterestIndex, "interestStartDate", autoInterest.startDate);
            onUpdateDue(existingInterestIndex, "interestEndDate", autoInterest.endDate);
          } else {
            // Yeni faiz kalemi ekle
            setTimeout(() => {
              onAddDue();
              setTimeout(() => {
                const newIdx = dues.length;
                onUpdateDue(newIdx, "type", "INTEREST");
                onUpdateDue(newIdx, "amount", autoInterest.interest.toFixed(2));
                onUpdateDue(newIdx, "description", description);
                onUpdateDue(newIdx, "dueDate", autoInterest.endDate);
                onUpdateDue(newIdx, "interestType", interestType);
                onUpdateDue(newIdx, "interestRate", autoInterest.rate);
                onUpdateDue(newIdx, "interestStartDate", autoInterest.startDate);
                onUpdateDue(newIdx, "interestEndDate", autoInterest.endDate);
              }, 50);
            }, 100);
          }
        }
      }
    }
  };

  // ClaimEngine'den otomatik alacak kalemleri oluştur
  const generateFromClaimEngine = async () => {
    // subCategory veya formCode'dan takip türünü belirle
    const subCategory = caseData.subCategory || caseData.formCode || "ILAMSIZ_GENEL";
    
    setGeneratingFromRules(true);
    try {
      // 1. ClaimEngine'den alacak kalemlerini al
      const claimResponse = await api.post("/claim-engine/generate-items", {
        subCategory,
        extractedData: extractedData || {
          total_amount: caseData.totalAmount,
          currency: caseData.currency,
          due_date: caseData.dueDate,
        },
        wizardData: wizardData || {},
      });

      const generatedItems = claimResponse.data || [];
      
      // 2. Fee Engine'den masrafları al
      const caseType = caseData.takipTuruId ? 
        (caseData.mahiyetKodu === "CEK" ? "KAMBIYO" : 
         caseData.mahiyetKodu === "SENET" ? "KAMBIYO" :
         caseData.subCategory === "NAFAKA" ? "ILAMLI" :
         caseData.subCategory === "DOVIZ" ? "ILAMLI" :
         caseData.subCategory === "KIRA" ? "KIRA" :
         "ILAMSIZ") : "ILAMSIZ";
      
      const principalAmount = parseFloat(caseData.totalAmount || "0") || 0;
      
      let feeItems: any[] = [];
      try {
        const feeResponse = await api.post("/fee-engine/calculate-opening-fees", {
          caseType,
          principalAmount,
          accruedInterest: 0,
          debtorCount: 1,
          postageType: "NORMAL",
        });
        feeItems = feeResponse.data?.items || [];
      } catch (feeError) {
        console.log("Fee Engine hatası (devam ediliyor):", feeError);
      }
      
      // Tüm kalemleri birleştir
      const allItems = [...generatedItems, ...feeItems];
      
      if (allItems.length === 0) {
        // Varsayılan ana para kalemi ekle
        onAddDue();
        return;
      }
      
      // Oluşturulan kalemleri dues'a ekle
      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        if (item.amount || item.required) {
          onAddDue();
          // State güncellemesi için biraz bekle
          await new Promise(resolve => setTimeout(resolve, 150));
          const newIndex = dues.length + i;
          const typeMap: Record<string, DueItem["type"]> = {
            PRINCIPAL: "PRINCIPAL",
            ACCRUED_INTEREST: "INTEREST",
            POST_INTEREST_RULE: "INTEREST",
            PENALTY: "OTHER",
            FEE: "EXPENSE",
            POSTAGE: "EXPENSE",
            STAMP: "EXPENSE",
            ATTORNEY_FEE: "EXPENSE",
            EXPENSE: "EXPENSE",
            OTHER: "OTHER",
          };
          onUpdateDue(newIndex, "type", typeMap[item.type] || "OTHER");
          onUpdateDue(newIndex, "amount", (item.amount || 0).toString());
          onUpdateDue(newIndex, "description", item.label || item.description || "Alacak kalemi");
          if (item.dueDate) onUpdateDue(newIndex, "dueDate", item.dueDate);
        }
      }
    } catch (error) {
      console.error("Otomatik oluşturma hatası:", error);
      // Hata durumunda varsayılan ana para kalemi ekle
      onAddDue();
    } finally {
      setGeneratingFromRules(false);
    }
  };

  // Fee Engine'den sadece masrafları ekle
  const addFeesFromEngine = async () => {
    const caseType = caseData.takipTuruId ? 
      (caseData.mahiyetKodu === "CEK" ? "KAMBIYO" : 
       caseData.mahiyetKodu === "SENET" ? "KAMBIYO" :
       caseData.subCategory === "NAFAKA" ? "ILAMLI" :
       caseData.subCategory === "DOVIZ" ? "ILAMLI" :
       caseData.subCategory === "KIRA" ? "KIRA" :
       "ILAMSIZ") : "ILAMSIZ";
    
    // Ana para toplamını hesapla
    const principalTotal = dues
      .filter(d => d.type === "PRINCIPAL")
      .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    
    // İşlemiş faiz toplamını hesapla
    const interestTotal = dues
      .filter(d => d.type === "INTEREST")
      .reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    
    setGeneratingFromRules(true);
    try {
      const response = await api.post("/fee-engine/calculate-opening-fees", {
        caseType,
        principalAmount: principalTotal,
        accruedInterest: interestTotal,
        debtorCount: 1,
        postageType: "NORMAL",
      });
      
      const feeItems = response.data?.items || [];
      
      if (feeItems.length === 0) {
        alert("Bu takip türü için masraf bulunamadı.");
        return;
      }
      
      // Mevcut masraf kalemlerini kontrol et (tekrar eklemeyi önle)
      const existingFeeDescriptions = dues
        .filter(d => d.type === "EXPENSE")
        .map(d => d.description?.toLowerCase());
      
      for (let i = 0; i < feeItems.length; i++) {
        const item = feeItems[i];
        
        // Aynı masraf zaten varsa atla
        if (existingFeeDescriptions.includes(item.label?.toLowerCase())) {
          continue;
        }
        
        onAddDue();
        await new Promise(resolve => setTimeout(resolve, 150));
        const newIndex = dues.length + i;
        onUpdateDue(newIndex, "type", "EXPENSE");
        onUpdateDue(newIndex, "amount", (item.amount || 0).toString());
        onUpdateDue(newIndex, "description", item.label || "Masraf");
        onUpdateDue(newIndex, "dueDate", new Date().toISOString().split("T")[0]);
      }
      
      // Toplam masrafı göster
      const totalFees = response.data?.total || 0;
      console.log(`✅ ${feeItems.length} masraf kalemi eklendi. Toplam: ${totalFees.toFixed(2)} ₺`);
      
    } catch (error) {
      console.error("Masraf ekleme hatası:", error);
      alert("Masraflar eklenirken bir hata oluştu.");
    } finally {
      setGeneratingFromRules(false);
    }
  };

  // Dönem seçiciden gelen dönemleri alacak kalemi olarak ekle
  const handlePeriodsSelected = async (periods: { year: number; month: number; amount: number; dueDate: string; description: string }[]) => {
    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      onAddDue();
      await new Promise(resolve => setTimeout(resolve, 150));
      const newIndex = dues.length + i;
      onUpdateDue(newIndex, "type", "PRINCIPAL");
      onUpdateDue(newIndex, "amount", period.amount.toString());
      onUpdateDue(newIndex, "description", period.description);
      onUpdateDue(newIndex, "dueDate", period.dueDate);
    }
  };

  // Takip Talebi (Örnek 1) önizleme
  const generateTakipTalebiPreview = async () => {
    setGeneratingTakipTalebi(true);
    try {
      const templateData = {
        fileNumber: caseData.fileNumber || "2025/...",
        filingDate: caseData.startDate || new Date().toISOString().split("T")[0],
        executionOffice: {
          name: "... İcra Müdürlüğü",
          city: "...",
        },
        creditors: [], // Wizard'dan gelecek
        lawyers: [], // Wizard'dan gelecek
        debtors: [], // Wizard'dan gelecek
        claimItems: dues.map(d => ({
          type: d.type,
          description: d.description || (d.type === "PRINCIPAL" ? "Asıl Alacak" : d.type === "INTEREST" ? "Faiz" : "Masraf"),
          amount: parseFloat(d.amount) || 0,
          currency: caseData.currency || "TRY",
          dueDate: d.dueDate,
        })),
        totals: {
          principal: kapak.principal,
          interest: kapak.interest,
          fees: kapak.expense,
          total: kapak.total,
          currency: caseData.currency || "TRY",
        },
        interestInfo: {
          type: caseData.interestType === "TICARI" ? "TICARI" : "YASAL",
          description: caseData.interestDescription || "yasal faizi ile birlikte",
          variableRate: true,
        },
        caseType: caseData.subCategory?.includes("ILAMLI") ? "ILAMLI" : "ILAMSIZ",
        subCategory: caseData.subCategory || "GENEL",
        executionPath: caseData.executionPath || "HACIZ",
      };

      const response = await api.post("/template-engine/takip-talebi/preview", templateData);
      setTakipTalebiContent(response.data?.html || response.data?.content || "Belge oluşturulamadı");
      setShowTakipTalebiPreview(true);
    } catch (error) {
      console.error("Takip talebi oluşturma hatası:", error);
      // Fallback: Basit önizleme
      const simplePreview = `
        <div style="font-family: 'Courier New', monospace; white-space: pre-wrap; padding: 20px;">
          <h2 style="text-align: center;">TAKİP TALEBİ (ÖRNEK 1)</h2>
          <p><strong>Dosya No:</strong> ${caseData.fileNumber || "..."}</p>
          <p><strong>Takip Tarihi:</strong> ${caseData.startDate || new Date().toLocaleDateString('tr-TR')}</p>
          <hr/>
          <h3>ALACAK KALEMLERİ:</h3>
          ${dues.map((d, i) => `<p>${i + 1}. ${d.description || d.type}: ${parseFloat(d.amount || "0").toLocaleString('tr-TR')} ${currencySymbol}</p>`).join('')}
          <hr/>
          <p><strong>TOPLAM:</strong> ${kapak.total.toLocaleString('tr-TR')} ${currencySymbol}</p>
        </div>
      `;
      setTakipTalebiContent(simplePreview);
      setShowTakipTalebiPreview(true);
    } finally {
      setGeneratingTakipTalebi(false);
    }
  };

  // Frontend validasyonu - alacak kalemlerini kontrol et
  const validateClaimItems = () => {
    const errors: { id: string; message: string }[] = [];
    const warnings: { id: string; message: string }[] = [];
    
    // 1. Ana para kontrolü
    const principalItems = dues.filter(d => d.type === "PRINCIPAL");
    if (principalItems.length === 0) {
      errors.push({ id: "no_principal", message: "Asıl alacak (ana para) kalemi olmadan takip oluşturulamaz." });
    }
    
    // 2. Tutar kontrolü
    const emptyAmounts = dues.filter(d => !d.amount || parseFloat(d.amount) <= 0);
    if (emptyAmounts.length > 0) {
      errors.push({ id: "empty_amount", message: `${emptyAmounts.length} kalemde tutar girilmemiş.` });
    }
    
    // 3. Çek takibi için tazminat kontrolü
    if (isCekTakibi && principalItems.length > 0 && !hasCekTazminati) {
      warnings.push({ id: "no_cek_tazminati", message: "Çek takibinde %10 çek tazminatı eklenmemiş. Otomatik eklemek için ana para tutarını güncelleyin." });
    }
    
    // 4. İlamlı takip için kesinleşme kontrolü
    if ((caseData.subCategory === "ILAMLI" || caseData.mahiyetKodu === "TAZMINAT") && !caseData.hasArticle4Request) {
      warnings.push({ id: "ilam_finalization", message: "Bazı ilamlar kesinleşmeden icraya konulamaz. Kesinleşme şerhini kontrol edin." });
    }
    
    // 5. Döviz takibi için kur kuralı kontrolü
    if (caseData.subCategory === "DOVIZ" && !caseData.exchangeRateType) {
      errors.push({ id: "forex_policy", message: "Döviz alacağı için kur kuralı seçilmelidir." });
    }
    
    // 6. Nafaka takibi için dönem kontrolü
    if (caseData.subCategory === "NAFAKA" && principalItems.length === 0) {
      warnings.push({ id: "nafaka_periods", message: "Nafaka takibinde dönemsel alacak kalemleri eklenmeli." });
    }
    
    // 7. Faiz kalemi varsa ama ana para yoksa
    const interestItems = dues.filter(d => d.type === "INTEREST");
    if (interestItems.length > 0 && principalItems.length === 0) {
      errors.push({ id: "interest_without_principal", message: "Faiz kalemi var ama ana para kalemi yok." });
    }
    
    // 8. Toplam tutar kontrolü
    const total = dues.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    if (total <= 0 && dues.length > 0) {
      errors.push({ id: "zero_total", message: "Toplam alacak tutarı sıfır veya negatif olamaz." });
    }
    
    setValidationResult({
      isValid: errors.length === 0,
      errors,
      warnings,
    });
  };

  // Alacak kalemleri değiştiğinde validasyonu çalıştır
  useEffect(() => {
    if (dues.length > 0) {
      validateClaimItems();
    } else {
      setValidationResult(null);
    }
  }, [dues, caseData.subCategory, caseData.mahiyetKodu, caseData.hasArticle4Request, caseData.exchangeRateType]);

  // ClaimEngine ile doğrulama (opsiyonel - hata verirse sessizce geç)
  const validateWithClaimEngine = async () => {
    const subCategory = caseData.subCategory || caseData.formCode;
    const caseType = caseData.caseType || caseData.formCategory;
    
    if (!caseType || !subCategory) return;

    try {
      const response = await api.post("/claim-engine/validate", {
        caseType,
        subCategory,
        claimItems: dues.map(d => ({ type: d.type })),
        extractedData: extractedData || {},
        wizardData: wizardData || {},
      });

      if (response.data) {
        // Backend validasyonunu frontend ile birleştir
        setValidationResult(prev => ({
          isValid: (prev?.isValid ?? true) && response.data.isValid,
          errors: [...(prev?.errors || []), ...(response.data.errors || [])],
          warnings: [...(prev?.warnings || []), ...(response.data.warnings || [])],
        }));
      }
    } catch (error) {
      // Doğrulama hatası kritik değil, sessizce geç
      console.log("Backend doğrulama atlandı:", error);
    }
  };

  // Faiz hesapla
  const calculateInterest = async () => {
    if (interestForm.principalIndex < 0) {
      alert("Lütfen faiz hesaplanacak ana para kalemini seçin");
      return;
    }
    
    const principalDue = principalDues[interestForm.principalIndex];
    if (!principalDue) return;

    const principal = parseFloat(principalDue.amount) || 0;
    const startDate = interestForm.startDate || principalDue.dueDate;
    
    if (!startDate) {
      alert("Lütfen faiz başlangıç tarihi belirleyin");
      return;
    }

    setCalculatingInterest(true);
    try {
      const rate = interestForm.customRate 
        ? parseFloat(interestForm.customRate) 
        : interestRates[interestForm.interestType];
      
      const response = await api.get(`/rule-engine/interest?principal=${principal}&startDate=${startDate}&endDate=${interestForm.endDate}&rate=${rate}`);
      const result = response.data;
      setInterestResult(result);
    } catch (err) {
      console.error("Faiz hesaplama hatası:", err);
      // Fallback: Manuel hesaplama
      const rate = interestForm.customRate 
        ? parseFloat(interestForm.customRate) 
        : interestRates[interestForm.interestType];
      const start = new Date(startDate);
      const end = new Date(interestForm.endDate);
      const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const dailyRate = rate / 365 / 100;
      const interest = principal * dailyRate * days;
      
      setInterestResult({
        principal,
        rate,
        days,
        interest: Math.round(interest * 100) / 100,
        total: principal + interest,
        description: `${days} gün için %${rate} ${interestForm.interestType.toLowerCase()} faiz`,
      });
    }
    setCalculatingInterest(false);
  };

  // Hesaplanan faizi alacak kalemi olarak ekle
  const addInterestAsDue = () => {
    if (!interestResult) return;
    
    const principalDue = principalDues[interestForm.principalIndex];
    const interestTypeLabels = {
      YASAL: "Yasal Faiz",
      TICARI: "Ticari Faiz",
      AVANS: "Avans Faizi",
      TEMERRUT: "Temerrüt Faizi",
    };
    
    // Yeni faiz kalemi ekle
    onAddDue();
    // Son eklenen kalemi güncelle
    setTimeout(() => {
      const newIndex = dues.length;
      onUpdateDue(newIndex, "type", "INTEREST");
      onUpdateDue(newIndex, "amount", interestResult.interest.toFixed(2));
      onUpdateDue(newIndex, "description", `${interestTypeLabels[interestForm.interestType]} (${principalDue?.description || "Ana Para"} için - ${interestResult.days} gün)`);
      onUpdateDue(newIndex, "dueDate", interestForm.endDate);
      onUpdateDue(newIndex, "interestType", interestForm.interestType);
      onUpdateDue(newIndex, "interestRate", interestResult.rate);
      onUpdateDue(newIndex, "interestAmount", interestResult.interest);
      onUpdateDue(newIndex, "interestStartDate", interestForm.startDate || principalDue?.dueDate);
      onUpdateDue(newIndex, "interestEndDate", interestForm.endDate);
    }, 100);
    
    setInterestResult(null);
    setShowInterestPanel(false);
  };

  // Kapak hesabı (toplam alacak özeti)
  const getKapakHesabi = () => {
    const principal = dues.filter(d => d.type === "PRINCIPAL").reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const interest = dues.filter(d => d.type === "INTEREST").reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const expense = dues.filter(d => d.type === "EXPENSE").reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const other = dues.filter(d => d.type === "OTHER").reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);
    const total = principal + interest + expense + other;
    
    return { principal, interest, expense, other, total };
  };

  const kapak = getKapakHesabi();
  const currencySymbol = caseData.currency === "USD" ? "$" : caseData.currency === "EUR" ? "€" : "₺";

  return (
    <div className="space-y-4">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">Alacak Kalemleri</h2>
          <p className="text-sm text-muted-foreground">Ana para, faiz, masraf ve diğer alacak kalemlerini ekleyin</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            type="button" 
            onClick={generateFromClaimEngine}
            disabled={generatingFromRules}
            className="text-sm text-emerald-600 hover:text-emerald-700 flex items-center gap-1 px-3 py-1.5 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50"
          >
            {generatingFromRules ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileCheck className="h-4 w-4" />
            )}
            Otomatik Oluştur
          </button>
          <button 
            type="button" 
            onClick={addFeesFromEngine}
            disabled={generatingFromRules}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 disabled:opacity-50"
          >
            {generatingFromRules ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Receipt className="h-4 w-4" />
            )}
            Masrafları Ekle
          </button>
          {isPeriodic && (
            <button 
              type="button" 
              onClick={() => setShowPeriodSelector(true)}
              className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 px-3 py-1.5 border border-purple-200 rounded-lg hover:bg-purple-50"
            >
              <Calendar className="h-4 w-4" /> Dönem Seç
            </button>
          )}
          <button 
            type="button" 
            onClick={() => setShowInterestPanel(!showInterestPanel)} 
            className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1 px-3 py-1.5 border border-orange-200 rounded-lg hover:bg-orange-50"
          >
            <Calculator className="h-4 w-4" /> Faiz Hesapla
          </button>
          <button type="button" onClick={onAddDue} className="text-sm text-primary hover:underline flex items-center gap-1">
            <Plus className="h-4 w-4" /> Kalem Ekle
          </button>
        </div>
      </div>

      {/* Çek Takibi Bilgi Kutusu */}
      {isCekTakibi && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Banknote className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">Çek Takibi - Otomatik Hesaplama Aktif</p>
              <ul className="space-y-1 text-xs">
                <li>✅ Ana para girildiğinde <strong>%10 çek tazminatı</strong> otomatik eklenir</li>
                <li>✅ Vade tarihi geçmişse <strong>işlemiş ticari faiz</strong> otomatik hesaplanır</li>
                <li>• Kambiyo takiplerinde ticari faiz (%{interestRates.TICARI}) uygulanır</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Genel Takip Bilgi Kutusu (Çek değilse) */}
      {!isCekTakibi && dues.length === 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Calculator className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-medium mb-1">Otomatik Faiz Hesaplama</p>
              <ul className="space-y-1 text-xs">
                <li>✅ Ana para ve vade tarihi girildiğinde <strong>işlemiş faiz</strong> otomatik hesaplanır</li>
                <li>✅ Faiz türü: {caseData.interestType === "TICARI" ? `Ticari (%${interestRates.TICARI})` : `Yasal (%${interestRates.YASAL})`}</li>
                <li>• Masrafları eklemek için "Masrafları Ekle" butonunu kullanın</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Doğrulama Uyarıları */}
      {validationResult && (validationResult.errors.length > 0 || validationResult.warnings.length > 0) && (
        <div className="space-y-2">
          {validationResult.errors.map((err) => (
            <div key={err.id} className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {err.message}
            </div>
          ))}
          {validationResult.warnings.map((warn) => (
            <div key={warn.id} className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {warn.message}
            </div>
          ))}
        </div>
      )}

      {/* Faiz Hesaplama Paneli */}
      {showInterestPanel && (
        <div className="border-2 border-orange-200 rounded-lg p-4 bg-orange-50/50">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            <h3 className="font-semibold text-orange-800">Faiz Hesaplama</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
            {/* Ana Para Seçimi */}
            <div>
              <label className="block text-xs font-medium mb-1">Ana Para Kalemi</label>
              <select 
                value={interestForm.principalIndex}
                onChange={e => {
                  const idx = parseInt(e.target.value);
                  setInterestForm(prev => ({ 
                    ...prev, 
                    principalIndex: idx,
                    startDate: idx >= 0 ? principalDues[idx]?.dueDate || "" : ""
                  }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              >
                <option value={-1}>Seçin...</option>
                {principalDues.map((due, idx) => (
                  <option key={idx} value={idx}>
                    {due.description || `Ana Para ${idx + 1}`} - {parseFloat(due.amount || "0").toLocaleString('tr-TR')} {currencySymbol}
                  </option>
                ))}
              </select>
            </div>

            {/* Faiz Türü */}
            <div>
              <label className="block text-xs font-medium mb-1">Faiz Türü</label>
              <select 
                value={interestForm.interestType}
                onChange={e => setInterestForm(prev => ({ ...prev, interestType: e.target.value as any, customRate: "" }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              >
                <option value="YASAL">Yasal Faiz (%{interestRates.YASAL})</option>
                <option value="TICARI">Ticari Faiz (%{interestRates.TICARI})</option>
                <option value="AVANS">Avans Faizi (%{interestRates.AVANS})</option>
                <option value="TEMERRUT">Temerrüt Faizi (%{interestRates.TEMERRUT})</option>
              </select>
            </div>

            {/* Özel Oran */}
            <div>
              <label className="block text-xs font-medium mb-1">Özel Oran (%)</label>
              <input 
                type="number" 
                value={interestForm.customRate}
                onChange={e => setInterestForm(prev => ({ ...prev, customRate: e.target.value }))}
                placeholder={`Varsayılan: ${interestRates[interestForm.interestType]}`}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              />
            </div>

            {/* Başlangıç Tarihi */}
            <div>
              <label className="block text-xs font-medium mb-1">Başlangıç (Vade)</label>
              <input 
                type="date" 
                value={interestForm.startDate}
                onChange={e => setInterestForm(prev => ({ ...prev, startDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              />
            </div>

            {/* Bitiş Tarihi */}
            <div>
              <label className="block text-xs font-medium mb-1">Bitiş (Bugün)</label>
              <input 
                type="date" 
                value={interestForm.endDate}
                onChange={e => setInterestForm(prev => ({ ...prev, endDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button 
              type="button" 
              onClick={calculateInterest}
              disabled={calculatingInterest || interestForm.principalIndex < 0}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
            >
              {calculatingInterest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Hesapla
            </button>
            
            {interestResult && (
              <div className="flex-1 flex items-center justify-between bg-white rounded-lg p-3 border border-orange-200">
                <div className="text-sm">
                  <span className="text-gray-600">{interestResult.description}</span>
                  <div className="font-semibold text-orange-700">
                    Faiz: {interestResult.interest.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}
                  </div>
                </div>
                <button 
                  type="button" 
                  onClick={addInterestAsDue}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Kalem Olarak Ekle
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alacak Kalemleri Listesi */}
      {dues.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">Henüz alacak kalemi eklenmedi</p>
          <button type="button" onClick={onAddDue} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
            <Plus className="h-4 w-4" /> İlk Kalemi Ekle
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {dues.map((due, index) => (
            <div key={index} className={`border rounded-lg p-4 relative ${due.type === "INTEREST" ? "border-orange-200 bg-orange-50/30" : due.type === "EXPENSE" ? "border-blue-200 bg-blue-50/30" : ""}`}>
              <button type="button" onClick={() => onRemoveDue(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500">
                <X className="h-5 w-5" />
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Kalem Türü</label>
                  <select 
                    value={due.type} 
                    onChange={e => onUpdateDue(index, "type", e.target.value)} 
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="PRINCIPAL">Ana Para</option>
                    <option value="INTEREST">Faiz</option>
                    <option value="EXPENSE">Masraf</option>
                    <option value="OTHER">Diğer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Tutar ({currencySymbol}) <span className="text-red-500">*</span></label>
                  <input 
                    type="number" 
                    value={due.amount} 
                    onChange={e => due.type === "PRINCIPAL" ? handlePrincipalAmountChange(index, e.target.value) : onUpdateDue(index, "amount", e.target.value)} 
                    placeholder="0.00" 
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Vade Tarihi</label>
                  <input 
                    type="date" 
                    value={due.dueDate} 
                    onChange={e => handleDueDateChange(index, e.target.value)} 
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Açıklama</label>
                  <input 
                    type="text" 
                    value={due.description} 
                    onChange={e => onUpdateDue(index, "description", e.target.value)} 
                    placeholder="Ör: Kira alacağı" 
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" 
                  />
                </div>
              </div>
              {/* Faiz detayları (varsa) */}
              {due.type === "INTEREST" && due.interestRate && (
                <div className="mt-2 pt-2 border-t border-orange-200 text-xs text-orange-700">
                  <span className="font-medium">%{due.interestRate}</span> oran ile hesaplandı
                  {due.interestStartDate && due.interestEndDate && (
                    <span className="ml-2">({due.interestStartDate} - {due.interestEndDate})</span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Kapak Hesabı (Toplam Alacak Özeti) */}
          <div className="mt-6 border-2 border-primary/20 rounded-lg overflow-hidden">
            <div className="bg-primary/5 px-4 py-2 flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Kapak Hesabı (Alacak Özeti)</h3>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Ana Para</div>
                  <div className="font-semibold text-lg">{kapak.principal.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-xs text-orange-600 mb-1">Faiz</div>
                  <div className="font-semibold text-lg text-orange-700">{kapak.interest.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}</div>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-xs text-blue-600 mb-1">Masraf</div>
                  <div className="font-semibold text-lg text-blue-700">{kapak.expense.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">Diğer</div>
                  <div className="font-semibold text-lg">{kapak.other.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}</div>
                </div>
                <div className="text-center p-3 bg-primary/10 rounded-lg border-2 border-primary/30">
                  <div className="text-xs text-primary mb-1 font-medium">TOPLAM ALACAK</div>
                  <div className="font-bold text-xl text-primary">{kapak.total.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {currencySymbol}</div>
                </div>
              </div>
              
              {/* Faiz açıklaması */}
              {caseData.interestDescription && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                  <strong>Faiz Talebi:</strong> {caseData.interestDescription}
                </div>
              )}
              
              {/* Takip Talebi Önizle Butonu */}
              {dues.length > 0 && kapak.total > 0 && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={generateTakipTalebiPreview}
                    disabled={generatingTakipTalebi}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {generatingTakipTalebi ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileCheck className="h-4 w-4" />
                    )}
                    Takip Talebi Önizle
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Takip Talebi Önizleme Modal */}
      {showTakipTalebiPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-green-600 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <FileCheck className="h-6 w-6" />
                <h2 className="text-lg font-semibold">Takip Talebi (Örnek 1) Önizleme</h2>
              </div>
              <button onClick={() => setShowTakipTalebiPreview(false)} className="text-white/80 hover:text-white">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div dangerouslySetInnerHTML={{ __html: takipTalebiContent }} />
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowTakipTalebiPreview(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => {
                  // Basit text indirme
                  const blob = new Blob([takipTalebiContent.replace(/<[^>]*>/g, '')], { type: 'text/plain;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `takip-talebi-${caseData.fileNumber || 'belge'}.txt`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 flex items-center gap-2"
              >
                <ArrowRight className="h-4 w-4" /> TXT İndir
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("token");
                    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/word`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({
                        fileNumber: caseData.fileNumber,
                        creditors: creditors.filter(c => c.name),
                        debtors: caseDebtors,
                        dues: dues.filter(d => d.amount && parseFloat(d.amount) > 0),
                        executionOffice: selectedOffice,
                        lawyers: lawyers.filter(l => l.name && l.surname),
                        caseDate: caseData.startDate,
                        currency: caseData.currency,
                      }),
                    });
                    if (!response.ok) throw new Error('Word oluşturulamadı');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `takip-talebi-${caseData.fileNumber || 'belge'}.docx`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('Word indirme hatası:', err);
                    alert('Word dosyası oluşturulamadı');
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <FileCheck className="h-4 w-4" /> Word İndir
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("token");
                    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/pdf`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({
                        fileNumber: caseData.fileNumber,
                        creditors: creditors.filter(c => c.name),
                        debtors: caseDebtors,
                        dues: dues.filter(d => d.amount && parseFloat(d.amount) > 0),
                        executionOffice: selectedOffice,
                        lawyers: lawyers.filter(l => l.name && l.surname),
                        caseDate: caseData.startDate,
                        currency: caseData.currency,
                      }),
                    });
                    if (!response.ok) throw new Error('PDF oluşturulamadı');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `takip-talebi-${caseData.fileNumber || 'belge'}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('PDF indirme hatası:', err);
                    alert('PDF dosyası oluşturulamadı');
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
              >
                <FileCheck className="h-4 w-4" /> PDF İndir
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("token");
                    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/template-engine/takip-talebi/xml`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                      body: JSON.stringify({
                        fileNumber: caseData.fileNumber,
                        creditors: creditors.filter(c => c.name),
                        debtors: caseDebtors,
                        dues: dues.filter(d => d.amount && parseFloat(d.amount) > 0),
                        executionOffice: selectedOffice,
                        lawyers: lawyers.filter(l => l.name && l.surname),
                        caseDate: caseData.startDate,
                        currency: caseData.currency,
                      }),
                    });
                    if (!response.ok) throw new Error('XML oluşturulamadı');
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `takip-talebi-${caseData.fileNumber || 'belge'}.xml`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    console.error('XML indirme hatası:', err);
                    alert('XML dosyası oluşturulamadı');
                  }
                }}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <FileCheck className="h-4 w-4" /> XML İndir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dönem Seçici Modal */}
      {showPeriodSelector && (
        <PeriodSelector
          type={isNafakaTakibi ? "NAFAKA" : "KIRA"}
          monthlyAmount={parseFloat(caseData.monthlyNafakaAmount || "0") || 1000}
          currency={caseData.currency || "TRY"}
          onPeriodsSelected={handlePeriodsSelected}
          onClose={() => setShowPeriodSelector(false)}
        />
      )}
    </div>
  );
}
