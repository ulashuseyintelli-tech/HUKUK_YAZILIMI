"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, X, AlertTriangle, FileCheck } from "lucide-react";
import { api } from "@/lib/api";
import { FormMetadata, SubFormMetadata, FormCategory } from "@/types/form-metadata";
import { WizardAnswers } from "@/types/wizard";
import { formMetadata, filterFormsByCategory } from "@/config/form-metadata";
import { FormWizard } from "@/components/case/FormWizard";
import { CaseWizard } from "@/components/case/CaseWizard";
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
import { useFormHistory } from "@/hooks/useFormHistory";
import { useUserSettings } from "@/lib/user-settings";

const steps = [
  { id: 0, title: "Form Seçimi" },
  { id: 1, title: "Takip Bilgileri" },
  { id: 2, title: "Avukatlar" },
  { id: 3, title: "Alacaklılar" },
  { id: 4, title: "Borçlular" },
  { id: 5, title: "Alacak Kalemleri" },
];

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
interface DueItem { type: "PRINCIPAL" | "INTEREST" | "EXPENSE" | "OTHER"; description: string; amount: string; dueDate: string; }
interface LookupItem { id: string; code: string; name: string; description?: string; color?: string; uyapCode?: string; sortOrder: number; }
interface TakipTuruItem extends LookupItem { defaultMahiyetTipiId?: string; defaultBorcluTipiId?: string; }
interface Lookups { takipTuru: TakipTuruItem[]; asama: LookupItem[]; risk: LookupItem[]; borcluTipi: LookupItem[]; durumEtiketi: LookupItem[]; mahiyetTipi: LookupItem[]; }

export default function NewCasePage() {
  const router = useRouter();
  const { recordUsage, getRecentForms } = useFormHistory();
  const { settings, loaded: settingsLoaded } = useUserSettings();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
  const [teamTab, setTeamTab] = useState<"lawyers" | "staff">("lawyers");
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [savingClient, setSavingClient] = useState(false);
  const [caseData, setCaseData] = useState({ 
    fileNumber: "", executionFileNumber: "", startDate: new Date().toISOString().split("T")[0], 
    notes: "", executionPath: "HACIZ", executionOfficeId: "", uyapBirimKodu: "",
    caseStatus: "DERDEST", hasArticle4Request: false,
    subCategory: "GENEL" as "GENEL" | "NAFAKA" | "DOVIZ",
    currency: "TRY" as "TRY" | "USD" | "EUR" | "GBP" | "CHF",
    interestType: "YASAL", interestDescription: "",
    nafakaStartDate: "", monthlyNafakaAmount: "",
    exchangeDate: "", exchangeRateType: "ODEME_TARIHI" as "TAKIP_TARIHI" | "ODEME_TARIHI",
    // Yeni lookup alanları
    takipTuruId: "", asamaId: "", riskId: "", borcluTipiId: "", durumEtiketiId: "",
    mahiyetTipiId: "", mahiyetKodu: "",
    sorumluPersonelId: "", dahiliNot: "", muvekkilNotu: "",
  });
  const [executionOffices, setExecutionOffices] = useState<ExecutionOffice[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [detectedCity, setDetectedCity] = useState<string>(""); // Konum tespiti ile bulunan il
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [creditors, setCreditors] = useState<Party[]>([]);
  const [debtors, setDebtors] = useState<Party[]>([]);
  const [dues, setDues] = useState<DueItem[]>([]);
  const [lookups, setLookups] = useState<Lookups>({ takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [], mahiyetTipi: [] });
  
  // Vekalet kontrolü state'leri
  const [poaWarnings, setPoaWarnings] = useState<{ clientId: string; clientName: string; lawyerId: string; lawyerName: string; message: string; }[]>([]);
  const [checkingPoa, setCheckingPoa] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string; surname: string; }[]>([]);

  useEffect(() => { loadExistingData(); }, []);
  
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

  const loadExistingData = async () => {
    try {
      const [lawyersRes, clientsRes, debtorsRes, officesRes, lookupsRes, usersRes, staffRes] = await Promise.all([
        api.getLawyers().catch((e) => { console.error("getLawyers error:", e); return []; }), 
        api.get('/clients').catch((e) => { console.error("getClients error:", e); return { data: { data: [] } }; }), 
        api.searchDebtors().catch((e) => { console.error("searchDebtors error:", e); return []; }), 
        api.get('/execution-offices').catch(() => ({ data: { data: [] } })),
        api.get('/lookups').catch(() => ({ data: { data: { takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [] } } })),
        api.get('/users').catch(() => ({ data: { data: [] } })),
        api.get('/staff').catch(() => ({ data: { data: [] } })),
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
      setUsers(usersRes?.data?.data || []);
      setExistingStaff(staffRes?.data?.data || []);
      
      // Varsayılan avukatları otomatik seç
      const defaultLawyers = allLawyers.filter((l: any) => l.isDefaultForNewCases && l.isActive);
      if (defaultLawyers.length > 0) {
        const selectedLawyers = defaultLawyers.map((l: any, index: number) => ({
          id: l.id,
          name: l.name,
          surname: l.surname,
          barNumber: l.barNumber,
          barCity: l.barCity,
          role: l.role,
          canSign: l.canSign,
          isNew: false,
          isResponsible: index === 0, // İlk avukat sorumlu
          hasSignatureAuthority: l.canSign,
        }));
        setLawyers(selectedLawyers);
      }
      
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
    } catch (err) { console.error("Mevcut veriler yüklenemedi:", err); }
  };

  const handleDocumentSourceSelect = (sourceType: DocumentSourceType, ocrResultData?: ClassificationResult) => {
    setDocumentSource(sourceType);
    setShowDocumentSelector(false);
    if (ocrResultData) {
      setOcrResult(ocrResultData);
      if (ocrResultData.detectedSubCategory === "NAFAKA") setCaseData(prev => ({ ...prev, subCategory: "NAFAKA", currency: "TRY" }));
      else if (ocrResultData.detectedSubCategory === "DOVIZ") setCaseData(prev => ({ ...prev, subCategory: "DOVIZ", currency: "USD" }));
    }
    
    // Belge türüne göre sınıflandırma bilgilerini otomatik doldur
    if (sourceType === "ILAM") {
      // İlamlı takip için varsayılan değerler
      const ilamliTakipTuru = lookups.takipTuru.find(t => t.code === "ILAMLI" || t.name?.toLowerCase().includes("ilamlı"));
      // Mahiyet: TAZMINAT (mahkeme kararına dayalı tazminat)
      const ilamliMahiyet = lookups.mahiyetTipi.find(m => m.code === "TAZMINAT") || lookups.mahiyetTipi.find(m => m.name?.toLowerCase().includes("tazminat"));
      const gercekKisi = lookups.borcluTipi.find(b => b.code === "GERCEK_KISI") || lookups.borcluTipi.find(b => b.name?.toLowerCase().includes("gerçek"));
      
      setCaseData(prev => ({
        ...prev,
        takipTuruId: ilamliTakipTuru?.id || prev.takipTuruId,
        mahiyetTipiId: ilamliMahiyet?.id || prev.mahiyetTipiId,
        mahiyetKodu: ilamliMahiyet?.code || prev.mahiyetKodu,
        borcluTipiId: gercekKisi?.id || prev.borcluTipiId,
        executionPath: "HACIZ",
      }));
      
      setShowWizard(true);
      const ilamliForm = formMetadata.find(f => f.code === "FORM_2_3_4_5");
      if (ilamliForm) setSelectedForm(ilamliForm);
    } else if (sourceType === "KAMBIYO") {
      // Kambiyo takibi için varsayılan değerler
      const kambiyoTakipTuru = lookups.takipTuru.find(t => t.code === "KAMBIYO_SENET" || t.code === "KAMBIYO_CEK" || t.name?.toLowerCase().includes("kambiyo"));
      // Mahiyet: SENET (senede dayalı alacak)
      const kambiyoMahiyet = lookups.mahiyetTipi.find(m => m.code === "SENET") || lookups.mahiyetTipi.find(m => m.code === "CEK") || lookups.mahiyetTipi.find(m => m.name?.toLowerCase().includes("senet"));
      const gercekKisi = lookups.borcluTipi.find(b => b.code === "GERCEK_KISI") || lookups.borcluTipi.find(b => b.name?.toLowerCase().includes("gerçek"));
      
      setCaseData(prev => ({
        ...prev,
        takipTuruId: kambiyoTakipTuru?.id || prev.takipTuruId,
        mahiyetTipiId: kambiyoMahiyet?.id || prev.mahiyetTipiId,
        mahiyetKodu: kambiyoMahiyet?.code || prev.mahiyetKodu,
        borcluTipiId: gercekKisi?.id || prev.borcluTipiId,
        executionPath: "HACIZ",
      }));
      
      setShowWizard(true);
    } else if (sourceType === "SOZLESME") {
      // İlamsız/Sözleşme takibi için varsayılan değerler
      const ilamsizTakipTuru = lookups.takipTuru.find(t => t.code === "ILAMSIZ_GENEL" || t.name?.toLowerCase().includes("ilamsız"));
      // Mahiyet: FATURA (fatura ve cari hesap alacağı)
      const sozlesmeMahiyet = lookups.mahiyetTipi.find(m => m.code === "FATURA") || lookups.mahiyetTipi.find(m => m.code === "PARA") || lookups.mahiyetTipi.find(m => m.name?.toLowerCase().includes("fatura"));
      const gercekKisi = lookups.borcluTipi.find(b => b.code === "GERCEK_KISI") || lookups.borcluTipi.find(b => b.name?.toLowerCase().includes("gerçek"));
      
      setCaseData(prev => ({
        ...prev,
        takipTuruId: ilamsizTakipTuru?.id || prev.takipTuruId,
        mahiyetTipiId: sozlesmeMahiyet?.id || prev.mahiyetTipiId,
        mahiyetKodu: sozlesmeMahiyet?.code || prev.mahiyetKodu,
        borcluTipiId: gercekKisi?.id || prev.borcluTipiId,
        executionPath: "HACIZ",
      }));
      
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
      const savedClient = clientResponse.data || clientResponse;
      
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
      
      // Avukatları eşleştir
      if (result.lawyers && result.lawyers.length > 0) {
        for (const lawyer of result.lawyers) {
          const matchedLawyer = existingLawyers.find(
            l => l.barNumber === lawyer.barNumber || 
                 (l.name?.toLowerCase() === lawyer.name?.split(' ')[0]?.toLowerCase() && 
                  l.surname?.toLowerCase() === lawyer.name?.split(' ').slice(1).join(' ')?.toLowerCase())
          );
          if (matchedLawyer) {
            poaData.lawyerIds.push(matchedLawyer.id);
          }
        }
      } else if (result.lawyerBarNumber) {
        const matchedLawyer = existingLawyers.find(l => l.barNumber === result.lawyerBarNumber);
        if (matchedLawyer) {
          poaData.lawyerIds.push(matchedLawyer.id);
        }
      }
      
      await api.post("/poa", poaData);
      
      // 3. Müvekkil listesini yenile ve seçili olarak ekle
      const clientsRes = await api.get("/clients");
      setExistingClients(clientsRes.data?.data || []);
      addExistingCreditor(savedClient);
      
      // 4. Bilgi mesajı göster
      alert(`✅ Müvekkil "${savedClient.displayName}" ve vekalet kaydı başarıyla oluşturuldu!\n\nŞimdi takip türünü seçebilirsiniz.`);
      
    } catch (err: any) {
      alert(`Hata: ${err.message || "Müvekkil veya vekalet oluşturulamadı"}`);
    }
  };

  // Vekalet kontrolü - müvekkil ve avukat kombinasyonları için
  const checkPoaValidity = async () => {
    if (creditors.length === 0 || lawyers.length === 0) {
      setPoaWarnings([]);
      return;
    }

    setCheckingPoa(true);
    const warnings: typeof poaWarnings = [];

    try {
      for (const creditor of creditors) {
        if (!creditor.id) continue; // Yeni eklenen müvekkiller için kontrol yapma
        
        for (const lawyer of lawyers) {
          if (!lawyer.id) continue; // Yeni eklenen avukatlar için kontrol yapma
          
          try {
            const response = await api.get(`/poa/check/valid?clientId=${creditor.id}&lawyerId=${lawyer.id}`);
            const result = response.data;
            
            if (!result.isValid) {
              warnings.push({
                clientId: creditor.id,
                clientName: creditor.name,
                lawyerId: lawyer.id,
                lawyerName: `${lawyer.name} ${lawyer.surname}`,
                message: result.message || "Geçerli vekalet bulunamadı",
              });
            } else if (result.daysRemaining !== undefined && result.daysRemaining <= 30) {
              warnings.push({
                clientId: creditor.id,
                clientName: creditor.name,
                lawyerId: lawyer.id,
                lawyerName: `${lawyer.name} ${lawyer.surname}`,
                message: `Vekalet ${result.daysRemaining} gün içinde sona erecek`,
              });
            }
          } catch (err) {
            // API hatası - sessizce geç
          }
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

  const handleWizardComplete = (recommended: FormMetadata | null, answers: WizardAnswers) => {
    setWizardAnswers(answers); setRecommendedForm(recommended); setShowWizard(false);
    if (recommended) setSelectedForm(recommended);
  };

  const handleFormSelect = (form: FormMetadata, subForm?: SubFormMetadata) => {
    setSelectedForm(form); setSelectedSubForm(subForm || null); setError("");
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
    
    setCaseData(prev => {
      const updates: Partial<typeof prev> = { takipTuruId };
      
      if (selectedTakipTuru) {
        // Varsayılan Mahiyet Tipi
        if (selectedTakipTuru.defaultMahiyetTipiId && !prev.mahiyetTipiId) {
          updates.mahiyetTipiId = selectedTakipTuru.defaultMahiyetTipiId;
          const mahiyet = lookups.mahiyetTipi.find(m => m.id === selectedTakipTuru.defaultMahiyetTipiId);
          if (mahiyet) updates.mahiyetKodu = mahiyet.code;
        }
        
        // Varsayılan Borçlu Tipi
        if (selectedTakipTuru.defaultBorcluTipiId && !prev.borcluTipiId) {
          updates.borcluTipiId = selectedTakipTuru.defaultBorcluTipiId;
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
  const getTotalDues = () => dues.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  const nextStep = () => {
    if (currentStep === 0 && !selectedForm) { setError("Lütfen bir form türü seçin"); return; }
    if (currentStep === 0 && selectedForm?.subForms?.length && !selectedSubForm) { setError("Lütfen bir alt form türü seçin"); return; }
    if (currentStep === 1 && !caseData.fileNumber.trim()) { setError("Takip No zorunludur"); return; }
    setError(""); setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
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
    const mapping: Record<string, string> = { GENEL_ICRA: "GENERAL_EXECUTION", KAMBIYO: "CHECK", IPOTEK_REHIN: "MORTGAGE", IFLAS: "BANKRUPTCY", KIRA: "RENTAL" };
    return mapping[category || ""] || "GENERAL_EXECUTION";
  };

  const handleSubmit = async () => {
    setError(""); setLoading(true);
    try {
      const response = await api.createCase({
        fileNumber: caseData.fileNumber, executionFileNumber: caseData.executionFileNumber || undefined,
        type: mapCategoryToCaseType(selectedForm?.category), subType: selectedSubForm?.code || selectedForm?.code,
        startDate: caseData.startDate || undefined, notes: caseData.notes || undefined,
        executionPath: caseData.executionPath, caseStatus: caseData.caseStatus,
        executionOfficeId: caseData.executionOfficeId || undefined, uyapBirimKodu: caseData.uyapBirimKodu || undefined,
        hasArticle4Request: caseData.hasArticle4Request, subCategory: caseData.subCategory, currency: caseData.currency,
        interestType: caseData.interestType, nafakaStartDate: caseData.nafakaStartDate || undefined,
        monthlyNafakaAmount: caseData.monthlyNafakaAmount ? parseFloat(caseData.monthlyNafakaAmount) : undefined,
        exchangeDate: caseData.exchangeDate || undefined, exchangeRateType: caseData.exchangeRateType,
        // Yeni lookup alanları
        takipTuruId: caseData.takipTuruId || undefined, asamaId: caseData.asamaId || undefined,
        riskId: caseData.riskId || undefined, borcluTipiId: caseData.borcluTipiId || undefined,
        durumEtiketiId: caseData.durumEtiketiId || undefined, mahiyetTipiId: caseData.mahiyetTipiId || undefined,
        mahiyetKodu: caseData.mahiyetKodu || undefined, sorumluPersonelId: caseData.sorumluPersonelId || undefined,
        dahiliNot: caseData.dahiliNot || undefined, muvekkilNotu: caseData.muvekkilNotu || undefined,
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
        debtors: debtors.filter(d => d.name).map(d => ({ id: d.isNew ? undefined : d.id, type: d.type, name: d.name, identityNo: d.identityNo, taxOffice: d.taxOffice, phone: d.phone, email: d.email, address: d.address })),
        dues: dues.filter(d => d.amount && parseFloat(d.amount) > 0).map(d => ({ type: d.type, description: d.description || undefined, amount: parseFloat(d.amount), dueDate: d.dueDate })),
      });
      if (selectedForm) recordUsage(selectedForm.code);
      router.push(`/cases/${response.id}`);
    } catch (err: any) { setError(err.message || "Takip oluşturulurken bir hata oluştu"); } finally { setLoading(false); }
  };

  const filteredForms = filterFormsByCategory(categoryFilter === "ALL" ? null : categoryFilter);
  const recentHistory = getRecentForms();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-2">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Takiplere Dön
        </Link>
        <span className="text-xs text-muted-foreground">{currentStep + 1} / {steps.length}</span>
      </div>

      <div className="mb-2">
        {/* Stepper - kompakt */}
        <div className="flex gap-0.5">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => goToStep(step.id)}
              title={step.title}
              className={`flex-1 h-1.5 rounded-full transition-colors ${currentStep >= step.id ? "bg-primary" : "bg-gray-200"}`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {steps.map((step) => (
            <button key={step.id} onClick={() => goToStep(step.id)} className={`text-[10px] ${currentStep === step.id ? "text-primary font-medium" : "text-gray-400"}`}>
              {step.title}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg border p-3 overflow-auto">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        {currentStep === 0 && (
          <div>
            {showDocumentSelector ? (
              <DocumentSourceSelector onSelect={handleDocumentSourceSelect} onSkip={() => { setShowDocumentSelector(false); setShowWizard(false); }} onPoaScan={handlePoaScan} />
            ) : wizardResult ? (
              <WizardResultCard result={wizardResult} onAccept={() => {
                setCaseData(prev => ({ ...prev, subCategory: wizardResult.subCategory, currency: wizardResult.currency as any, interestType: wizardResult.interestRateType === "DEGISKEN" ? "YASAL" : "SABIT", interestDescription: wizardResult.interestDescription }));
                setWizardResult(null); if (selectedForm) setCurrentStep(1);
              }} onRestart={() => { setWizardResult(null); setShowWizard(true); }} />
            ) : showWizard && documentSource === "ILAM" ? (
              <CaseWizard onComplete={(result) => { setWizardResult(result); setShowWizard(false); }} onSkip={() => setShowWizard(false)} />
            ) : showWizard && documentSource === "KAMBIYO" ? (
              <KambiyoWizard 
                onComplete={(result) => { const kambiyoForm = formMetadata.find(f => f.code === result.suggestedFormCode); if (kambiyoForm) setSelectedForm(kambiyoForm); setShowWizard(false); setCurrentStep(1); }} 
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
                  if (result.mahiyetCode) {
                    const mahiyet = lookups.mahiyetTipi.find(m => m.code === result.mahiyetCode);
                    setCaseData(prev => ({ ...prev, mahiyetTipiId: mahiyet?.id || prev.mahiyetTipiId, mahiyetKodu: result.mahiyetCode || prev.mahiyetKodu }));
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
                <FrequentForms onSelect={handleFormSelect} />
                {recentHistory.length > 0 && <RecentForms recentHistory={recentHistory} onSelect={handleFormSelect} />}
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
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div><label className="block text-xs font-medium mb-0.5">Takip Türü <span className="text-red-500">*</span></label><select name="takipTuruId" value={caseData.takipTuruId} onChange={(e) => handleTakipTuruChange(e.target.value)} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.takipTuru.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">Sorumlu <span className="text-red-500">*</span></label><select name="sorumluPersonelId" value={caseData.sorumluPersonelId} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} {user.surname}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">Aşama</label><select name="asamaId" value={caseData.asamaId} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.asama.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
                <div><label className="block text-xs font-medium mb-0.5">Borçlu Tipi</label><select name="borcluTipiId" value={caseData.borcluTipiId} onChange={handleCaseDataChange} className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"><option value="">Seçiniz</option>{lookups.borcluTipi.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
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
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sol: Avukatlar */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">👨‍⚖️ Avukatlar {lawyers.length > 0 && <span className="ml-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-xs">{lawyers.length}</span>}</h3>
                <a href="/settings/office" target="_blank" className="text-xs text-primary hover:underline">Ayarlar →</a>
              </div>
              <CompactLawyerSelection
                existingLawyers={existingLawyers}
                selectedLawyers={lawyers}
                onAddLawyer={(lawyer) => {
                  if (!lawyers.find(l => l.id === lawyer.id)) {
                    setLawyers([...lawyers, { ...lawyer, isNew: false, isResponsible: lawyers.length === 0, hasSignatureAuthority: lawyer.canSign }]);
                  }
                }}
                onRemoveLawyer={(index) => {
                  setLawyers(prev => {
                    const removed = prev[index];
                    const updated = prev.filter((_, i) => i !== index);
                    if (removed?.isResponsible && updated.length > 0) updated[0] = { ...updated[0], isResponsible: true };
                    return updated;
                  });
                }}
                onUpdateLawyer={(index, field, value) => {
                  const updated = [...lawyers];
                  if (field === 'isResponsible' && value === true) updated.forEach((l, i) => { l.isResponsible = i === index; });
                  else updated[index] = { ...updated[index], [field]: value };
                  setLawyers(updated);
                }}
              />
            </div>

            {/* Sağ: Ekip/Personel */}
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">👥 Ekip/Personel {selectedStaff.length > 0 && <span className="ml-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-xs">{selectedStaff.length}</span>}</h3>
                <a href="/settings/office" target="_blank" className="text-xs text-primary hover:underline">Ayarlar →</a>
              </div>
              <CompactStaffSelection
                existingStaff={existingStaff}
                selectedStaff={selectedStaff}
                onAddStaff={(staff) => {
                  if (!selectedStaff.find(s => s.id === staff.id)) {
                    setSelectedStaff([...selectedStaff, { ...staff, roleOnCase: staff.staffType, canEdit: false, canApprove: false, canView: true }]);
                  }
                }}
                onRemoveStaff={(index) => setSelectedStaff(selectedStaff.filter((_, i) => i !== index))}
                onUpdateStaff={(index, field, value) => {
                  const updated = [...selectedStaff];
                  updated[index] = { ...updated[index], [field]: value };
                  setSelectedStaff(updated);
                }}
              />
                <p className="text-xs text-muted-foreground mt-2 p-1.5 bg-amber-50 rounded border border-amber-200">
                  ⚠️ Personel UYAP/takip belgelerinde görünmez
                </p>
              </div>
            </div>

            {/* Vekalet Uyarı Bandı - Step 2 */}
            {poaWarnings.length > 0 && creditors.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 mb-1">⚠️ Vekalet Eksik</p>
                    <p className="text-xs text-amber-700">
                      Seçilen müvekkil(ler) için bazı avukatlara ait geçerli vekalet bulunamadı.
                      Müvekkiller adımında detayları görebilirsiniz.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h2 className="text-lg font-semibold">Takipte Yer Alacak Müvekkiller (Alacaklılar)</h2>
                <p className="text-xs text-muted-foreground">Aşağıdan müvekkil seçin veya yeni müvekkil ekleyin.</p>
              </div>
              <button type="button" onClick={() => setShowNewClientModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs rounded hover:bg-primary/90">
                <Plus className="h-3.5 w-3.5" /> Manuel Ekle
              </button>
            </div>

            {/* Vekaletname Tarama Sihirbazı */}
            <div className="mb-3">
              <PoaScannerWizard
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
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Sol: Ofis Müvekkilleri */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <h3 className="text-sm font-semibold mb-2">Ofis Müvekkilleri</h3>
                <CompactClientSelection
                  existingClients={existingClients}
                  selectedClients={creditors}
                  onAddClient={addExistingCreditor}
                  onRemoveClient={(index) => removeCreditor(index)}
                />
              </div>
              {/* Sağ: Seçili Müvekkiller */}
              <div className="border rounded-lg p-3">
                <h3 className="text-sm font-semibold mb-2">Bu Takip İçin Seçili Müvekkiller {creditors.length > 0 && <span className="ml-1 bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-xs">{creditors.length}</span>}</h3>
                {creditors.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed rounded-lg">
                    <p className="text-sm text-muted-foreground">Henüz müvekkil seçilmedi</p>
                    <p className="text-xs text-muted-foreground mt-1">Soldaki listeden müvekkil ekleyin</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {creditors.map((creditor, index) => {
                      const isCompany = creditor.type === 'COMPANY';
                      const isPublic = (creditor.type as string) === 'PUBLIC';
                      return (
                        <div key={index} className="p-2 rounded-lg border border-gray-200 text-xs">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{creditor.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${isCompany ? 'bg-blue-100 text-blue-700' : isPublic ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-700'}`}>
                                {isCompany ? 'Kurum' : isPublic ? 'Kamu' : 'Şahıs'}
                              </span>
                            </div>
                            <button type="button" onClick={() => removeCreditor(index)} className="text-red-500 hover:text-red-700">✕</button>
                          </div>
                          {creditor.identityNo && <p className="text-muted-foreground">{isCompany || isPublic ? 'VKN' : 'TCKN'}: {creditor.identityNo}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                {creditors.length === 0 && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">⚠️ Devam etmek için en az 1 müvekkil seçmelisiniz</p>
                )}
              </div>
            </div>

            {/* Vekalet Uyarı Bandı */}
            {poaWarnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 mb-2">⚠️ Vekalet Uyarısı</p>
                    <div className="space-y-1">
                      {poaWarnings.map((warning, idx) => (
                        <p key={idx} className="text-xs text-amber-700">
                          <span className="font-medium">{warning.clientName}</span> için <span className="font-medium">Av. {warning.lawyerName}</span> adına: {warning.message}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Link
                        href="/settings/clients"
                        target="_blank"
                        className="px-3 py-1.5 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 flex items-center gap-1"
                      >
                        <FileCheck className="h-3.5 w-3.5" />
                        Vekalet Ekle
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPoaWarnings([])}
                        className="px-3 py-1.5 border border-amber-400 text-amber-700 text-xs rounded hover:bg-amber-100"
                      >
                        Yine de Devam Et
                      </button>
                    </div>
                    <p className="text-xs text-amber-600 mt-2">
                      💡 Vekalet eklemeden UYAP'a gönderim yapmamanız önerilir.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Borçlular</h2>
              <button type="button" onClick={addNewDebtor} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Borçlu</button>
            </div>
            {existingDebtors.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Borçlulardan Seç</label><div className="flex flex-wrap gap-2">{existingDebtors.filter(d => !debtors.find(sd => sd.id === d.id)).map(debtor => (<button key={debtor.id} type="button" onClick={() => addExistingDebtor(debtor)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{debtor.name}</button>))}</div></div>)}
            {debtors.length === 0 ? (<p className="text-center py-8 text-muted-foreground">Henüz borçlu eklenmedi</p>) : (<div className="space-y-3">{debtors.map((debtor, index) => (<PartyForm key={index} party={debtor} isNew={debtor.isNew || false} onUpdate={(field, value) => updateDebtor(index, field, value)} onRemove={() => removeDebtor(index)} />))}</div>)}
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">Alacak Kalemleri</h2>
                <p className="text-sm text-muted-foreground">Ana para, faiz, masraf ve diğer alacak kalemlerini ekleyin</p>
              </div>
              <button type="button" onClick={addNewDue} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Kalem Ekle</button>
            </div>
            {dues.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <p className="text-muted-foreground mb-4">Henüz alacak kalemi eklenmedi</p>
                <button type="button" onClick={addNewDue} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"><Plus className="h-4 w-4" /> İlk Kalemi Ekle</button>
              </div>
            ) : (
              <div className="space-y-3">
                {dues.map((due, index) => (
                  <div key={index} className="border rounded-lg p-4 relative">
                    <button type="button" onClick={() => removeDue(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div><label className="block text-xs font-medium mb-1">Kalem Türü</label><select value={due.type} onChange={e => updateDue(index, "type", e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"><option value="PRINCIPAL">Ana Para</option><option value="INTEREST">Faiz</option><option value="EXPENSE">Masraf</option><option value="OTHER">Diğer</option></select></div>
                      <div><label className="block text-xs font-medium mb-1">Tutar (₺) <span className="text-red-500">*</span></label><input type="number" value={due.amount} onChange={e => updateDue(index, "amount", e.target.value)} placeholder="0.00" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="block text-xs font-medium mb-1">Vade Tarihi</label><input type="date" value={due.dueDate} onChange={e => updateDue(index, "dueDate", e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" /></div>
                      <div><label className="block text-xs font-medium mb-1">Açıklama</label><input type="text" value={due.description} onChange={e => updateDue(index, "description", e.target.value)} placeholder="Ör: Kira alacağı" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" /></div>
                    </div>
                  </div>
                ))}
                <div className="mt-4 p-4 bg-primary/5 rounded-lg flex justify-between items-center">
                  <span className="font-medium">Toplam Alacak:</span>
                  <span className="text-xl font-bold text-primary">{getTotalDues().toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Wizard açıkken ana sayfa butonlarını gizle - wizard kendi butonlarını kullanır */}
        {!(currentStep === 0 && showWizard && !showDocumentSelector) && (
          <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8 pt-4 border-t">
            <button type="button" onClick={prevStep} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-200 hover:border-gray-400 transition-colors order-2 sm:order-1"><ArrowLeft className="h-4 w-4" /> Geri</button>
            {currentStep < steps.length - 1 ? (
              <button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 order-1 sm:order-2">İleri <ArrowRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" onClick={handleSubmit} disabled={loading} className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 order-1 sm:order-2">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Oluşturuluyor..." : "Takibi Oluştur"}</button>
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

// Avukat Seçim Adımı Bileşeni - Tek kaynak: Ayarlar'daki avukatlar
// Sihirbaz sadece seçim yapar + aynı endpoint'e yazan hızlı ekleme modali sunar
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
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<any>({});
  
  // Form modları: null = kapalı, "add" = yeni ekleme, lawyer objesi = düzenleme
  const [formMode, setFormMode] = useState<null | "add" | any>(null);
  const isAddingNew = formMode === "add";
  const editingLawyer = formMode && formMode !== "add" ? formMode : null;
  
  const filteredLawyers = existingLawyers.filter(l => 
    (l.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     l.surname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     l.barNumber?.includes(searchTerm))
  );

  const roleLabels: Record<string, string> = {
    OWNER: "Büro Sahibi",
    PARTNER: "Ortak",
    EMPLOYEE: "Avukat",
    INTERN: "Stajyer",
  };

  // Yeni avukat ekleme formunu aç
  const startAddingNew = () => {
    setFormData({ 
      name: "", surname: "", tckn: "", gender: "", 
      barNumber: "", barCity: "", tbbNo: "", 
      vergiDairesi: "", vergiNo: "", 
      phone: "", email: "", 
      bankName: "", iban: "", 
      isInHouseCounsel: false, isEmployee: false, canSign: false,
      role: "EMPLOYEE"
    });
    setFormMode("add");
  };

  // Mevcut avukatı düzenleme formunu aç
  const startEditing = (lawyer: any) => {
    setFormData({ ...lawyer });
    setFormMode(lawyer);
  };

  // Formu kapat
  const cancelForm = () => {
    setFormMode(null);
    setFormData({});
  };

  // Kaydet - Ayarlar'daki aynı endpoint'i kullanır
  const handleSave = async () => {
    if (!formData.name?.trim() || !formData.surname?.trim()) {
      alert("Ad ve Soyad zorunludur");
      return;
    }
    if (isAddingNew) {
      // Yeni avukat için zorunlu alanlar
      if (!formData.tckn || formData.tckn.length !== 11) {
        alert("TC Kimlik No 11 haneli olmalıdır");
        return;
      }
      if (!formData.vergiNo || formData.vergiNo.length !== 10) {
        alert("Vergi No 10 haneli olmalıdır");
        return;
      }
    }
    
    setSaving(true);
    try {
      if (isAddingNew) {
        // Yeni avukat - POST /lawyers (Ayarlar'daki aynı endpoint)
        const response = await api.post('/lawyers', formData);
        const saved = response.data || response;
        // Ofis avukat listesine eklendi, şimdi bu takibe de ekle
        onAddLawyer(saved);
        await onRefreshLawyers();
      } else {
        // Mevcut avukat güncelleme - PUT /lawyers/:id
        const response = await api.put(`/lawyers/${editingLawyer.id}`, formData);
        const updated = response.data || response;
        await onRefreshLawyers();
        // Seçili avukatlar listesinde varsa güncelle
        const selectedIndex = selectedLawyers.findIndex(l => l.id === editingLawyer.id);
        if (selectedIndex >= 0) {
          onUpdateLawyer(selectedIndex, "name", updated.name);
          onUpdateLawyer(selectedIndex, "surname", updated.surname);
        }
      }
      cancelForm();
    } catch (err: any) {
      alert(err.message || "Hata oluştu");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h2 className="text-lg font-semibold">Takipte Yer Alacak Avukatlar</h2>
        <p className="text-xs text-muted-foreground">
          Soldaki listeden avukat seçin veya yeni ekleyin. Seçilen avukatlar sağda görünür.
          <a href="/settings/office" target="_blank" className="ml-2 text-primary hover:underline">Ayarlar'da düzenle →</a>
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Sol: Büro Avukatları (Ayarlar'daki liste) + Hızlı Ekleme */}
        <div className="border rounded-lg p-3 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Büro Avukatları</h3>
            <button type="button" onClick={startAddingNew} className="text-xs text-primary hover:underline flex items-center gap-1">
              <Plus className="h-3 w-3" /> Yeni Ekle
            </button>
          </div>
          
          {/* Hızlı Ekleme / Düzenleme Formu - Ayarlar'daki aynı endpoint'i kullanır */}
          {(isAddingNew || editingLawyer) && (
            <div className={`p-3 ${isAddingNew ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'} border rounded-lg space-y-2`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold ${isAddingNew ? 'text-green-700' : 'text-blue-700'}`}>
                  {isAddingNew ? "🚀 Hızlı Avukat Ekle" : `✏️ ${editingLawyer?.name} ${editingLawyer?.surname}`}
                </span>
                <div className="flex items-center gap-2">
                  {!isAddingNew && (
                    <a href="/settings/office" target="_blank" className="text-xs text-blue-600 hover:underline">
                      Detaylı düzenle →
                    </a>
                  )}
                  <button type="button" onClick={cancelForm} className="text-xs text-gray-500 hover:text-gray-700">İptal</button>
                </div>
              </div>
              
              {/* Zorunlu Alanlar - Sarı arka plan */}
              <div className="p-2 bg-amber-50 rounded border border-amber-200">
                <p className="text-xs text-amber-700 mb-2 font-medium">Zorunlu Alanlar</p>
                <div className="grid grid-cols-3 gap-2">
                  <input type="text" value={formData.name || ""} onChange={(e) => setFormData({...formData, name: e.target.value})} placeholder="Ad *" className="rounded border px-2 py-1 text-xs border-amber-300 bg-white" />
                  <input type="text" value={formData.surname || ""} onChange={(e) => setFormData({...formData, surname: e.target.value})} placeholder="Soyad *" className="rounded border px-2 py-1 text-xs border-amber-300 bg-white" />
                  <input type="text" value={formData.tckn || ""} onChange={(e) => setFormData({...formData, tckn: e.target.value.replace(/\D/g, "")})} placeholder="TC Kimlik No *" maxLength={11} className="rounded border px-2 py-1 text-xs border-amber-300 bg-white" />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input type="text" value={formData.vergiNo || ""} onChange={(e) => setFormData({...formData, vergiNo: e.target.value.replace(/\D/g, "")})} placeholder="Vergi No *" maxLength={10} className="rounded border px-2 py-1 text-xs border-amber-300 bg-white" />
                  <input type="text" value={formData.barNumber || ""} onChange={(e) => setFormData({...formData, barNumber: e.target.value})} placeholder="Baro Sicil No *" className="rounded border px-2 py-1 text-xs border-amber-300 bg-white" />
                </div>
              </div>
              
              {/* Opsiyonel Alanlar */}
              <div className="grid grid-cols-4 gap-2">
                <select value={formData.title || ""} onChange={(e) => setFormData({...formData, title: e.target.value})} className="rounded border px-2 py-1 text-xs" title="Unvan/Sıfat">
                  <option value="">Unvan (Otomatik)</option>
                  <option value="Av.">Av.</option>
                  <option value="Stj. Av.">Stj. Av.</option>
                  <option value="Huk. Müş.">Huk. Müş.</option>
                  <option value="İcra Kat.">İcra Kat.</option>
                  <option value="Sek.">Sek.</option>
                  <option value="Muh.">Muh.</option>
                </select>
                <select value={formData.role || "EMPLOYEE"} onChange={(e) => setFormData({...formData, role: e.target.value})} className="rounded border px-2 py-1 text-xs">
                  <option value="OWNER">Büro Sahibi</option>
                  <option value="PARTNER">Ortak</option>
                  <option value="EMPLOYEE">Avukat</option>
                  <option value="INTERN">Stajyer</option>
                </select>
                <input type="text" value={formData.barCity || ""} onChange={(e) => setFormData({...formData, barCity: e.target.value})} placeholder="Kayıtlı Baro" className="rounded border px-2 py-1 text-xs" />
                <input type="text" value={formData.vergiDairesi || ""} onChange={(e) => setFormData({...formData, vergiDairesi: e.target.value})} placeholder="Vergi Dairesi" className="rounded border px-2 py-1 text-xs" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="text" value={formData.bankName || ""} onChange={(e) => setFormData({...formData, bankName: e.target.value})} placeholder="Banka Adı" className="rounded border px-2 py-1 text-xs" />
                <input type="text" value={formData.iban || ""} onChange={(e) => setFormData({...formData, iban: e.target.value.toUpperCase()})} placeholder="IBAN" className="rounded border px-2 py-1 text-xs font-mono" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={formData.canSign || false} onChange={(e) => setFormData({...formData, canSign: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                  <span className="text-xs">İmza Yetkisi</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={formData.isDefaultForNewCases || false} onChange={(e) => setFormData({...formData, isDefaultForNewCases: e.target.checked})} className="w-3.5 h-3.5 rounded" />
                  <span className="text-xs">Yeni takiplerde varsayılan</span>
                </label>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <p className="text-xs text-gray-500">
                  {isAddingNew ? "Kayıt Ayarlar > Avukatlar'a da eklenir" : "Değişiklikler tüm takiplere yansır"}
                </p>
                <button type="button" onClick={handleSave} disabled={saving} className={`px-3 py-1 text-xs text-white rounded flex items-center gap-1 ${isAddingNew ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} disabled:opacity-50`}>
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Kaydediliyor...</> : <><Check className="h-3 w-3" /> {isAddingNew ? 'Kaydet ve Ekle' : 'Güncelle'}</>}
                </button>
              </div>
            </div>
          )}
          
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Ad, soyad veya sicil no ile ara..."
            className="w-full rounded border px-2 py-1.5 text-xs outline-none focus:border-primary"
          />
          
          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredLawyers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">
                {searchTerm ? "Sonuç bulunamadı" : "Henüz avukat eklenmedi. Ayarlar'dan veya yukarıdaki formdan ekleyebilirsiniz."}
              </p>
            ) : (
              filteredLawyers.map((lawyer) => {
                const isSelected = selectedLawyers.find(sl => sl.id === lawyer.id);
                return (
                  <div
                    key={lawyer.id}
                    className={`w-full flex items-center justify-between p-2 rounded border transition-colors ${isSelected ? 'bg-green-50 border-green-300' : 'hover:bg-white border-transparent hover:border-primary/30'}`}
                  >
                    <div className="flex-1">
                      <span className="text-sm font-medium">{lawyer.displayName || `${lawyer.title || (lawyer.role === "INTERN" ? "Stj. Av." : "Av.")} ${lawyer.name} ${lawyer.surname}`}</span>
                      {lawyer.barNumber && <span className="text-xs text-muted-foreground ml-2">#{lawyer.barNumber}</span>}
                      {lawyer.role && (
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
                          {roleLabels[lawyer.role] || lawyer.role}
                        </span>
                      )}
                      {isSelected && <span className="ml-2 text-xs text-green-600">✓ Seçili</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      {lawyer.canSign && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">İmza ✓</span>}
                      <button type="button" onClick={() => startEditing(lawyer)} className="p-1 text-blue-500 hover:bg-blue-100 rounded" title="Düzenle">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      {!isSelected ? (
                        <button type="button" onClick={() => onAddLawyer(lawyer)} className="p-1 text-primary hover:bg-primary/10 rounded" title="Takibe Ekle">
                          <Plus className="h-4 w-4" />
                        </button>
                      ) : (
                        <button type="button" onClick={() => { const idx = selectedLawyers.findIndex(sl => sl.id === lawyer.id); if (idx >= 0) onRemoveLawyer(idx); }} className="p-1 text-orange-500 hover:bg-orange-100 rounded" title="Takipten Çıkar">
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

        {/* Sağ: Bu Takip İçin Seçili Avukatlar - Sadece isim ve yetkiler */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-semibold mb-2">Bu Takip İçin Seçili Avukatlar</h3>
          
          {selectedLawyers.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground">Henüz avukat seçilmedi</p>
              <p className="text-xs text-muted-foreground mt-1">Soldaki listeden avukat ekleyin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {selectedLawyers.map((lawyer, index) => (
                <div key={index} className={`p-2 rounded-lg border ${lawyer.isResponsible ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{lawyer.displayName || `${lawyer.title || (lawyer.role === "INTERN" ? "Stj. Av." : "Av.")} ${lawyer.name} ${lawyer.surname}`}</span>
                        {lawyer.barNumber && <span className="text-xs text-muted-foreground">#{lawyer.barNumber}</span>}
                        {lawyer.role && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${lawyer.role === "OWNER" ? "bg-purple-100 text-purple-700" : lawyer.role === "PARTNER" ? "bg-blue-100 text-blue-700" : lawyer.role === "INTERN" ? "bg-gray-100 text-gray-600" : "bg-green-100 text-green-700"}`}>
                            {roleLabels[lawyer.role] || lawyer.role}
                          </span>
                        )}
                        {lawyer.canSign && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">İmza ✓</span>}
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="radio" name="responsibleLawyer" checked={lawyer.isResponsible || false} onChange={() => onUpdateLawyer(index, "isResponsible", true)} className="w-3.5 h-3.5 text-primary" />
                          <span className="text-xs">Sorumlu Avukat</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input type="checkbox" checked={lawyer.hasSignatureAuthority || false} onChange={(e) => onUpdateLawyer(index, "hasSignatureAuthority", e.target.checked)} className="w-3.5 h-3.5 rounded" />
                          <span className="text-xs">İmza Yetkisi</span>
                        </label>
                      </div>
                    </div>
                    <button type="button" onClick={() => onRemoveLawyer(index)} className="flex-shrink-0 p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded border border-red-300 bg-red-50" title="Listeden Çıkar">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {selectedLawyers.length > 0 && !selectedLawyers.some(l => l.isResponsible) && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">⚠️ Lütfen bir sorumlu avukat seçin</p>
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


// Kompakt Avukat Seçimi - Tek sayfada yan yana görünüm için
function CompactLawyerSelection({
  existingLawyers, selectedLawyers, onAddLawyer, onRemoveLawyer, onUpdateLawyer
}: {
  existingLawyers: any[]; selectedLawyers: Lawyer[];
  onAddLawyer: (lawyer: any) => void; onRemoveLawyer: (index: number) => void;
  onUpdateLawyer: (index: number, field: keyof Lawyer, value: any) => void;
}) {
  const [search, setSearch] = useState("");
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
              <span>{lawyer.title || "Av."} {lawyer.name} {lawyer.surname} <span className="text-muted-foreground">({roleLabels[lawyer.role] || ""})</span></span>
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
                <span className="font-medium">{lawyer.title || "Av."} {lawyer.name} {lawyer.surname}</span>
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
              <span>{staff.firstName} {staff.lastName} <span className="text-muted-foreground">({staffTypeLabels[staff.staffType] || staff.staffType})</span></span>
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
                <span className="font-medium">{staff.firstName} {staff.lastName}</span>
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
                <span className="font-medium">{client.name}</span>
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
