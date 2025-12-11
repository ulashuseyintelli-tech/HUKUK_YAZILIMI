"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, X } from "lucide-react";
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
import { DocumentSourceSelector, DocumentSourceType, ClassificationResult } from "@/components/case/DocumentSourceSelector";
import { WizardResultCard } from "@/components/case/WizardResultCard";
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

interface Lawyer { id?: string; name: string; surname: string; barNumber?: string; canSign: boolean; isNew?: boolean; }
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
      const [lawyersRes, clientsRes, debtorsRes, officesRes, lookupsRes, usersRes] = await Promise.all([
        api.getLawyers().catch(() => []), api.getClients().catch(() => []), 
        api.searchDebtors().catch(() => []), api.get('/execution-offices').catch(() => ({ data: { data: [] } })),
        api.get('/lookups').catch(() => ({ data: { data: { takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [] } } })),
        api.get('/users').catch(() => ({ data: { data: [] } })),
      ]);
      setExistingLawyers(lawyersRes || []);
      setExistingClients(clientsRes?.data || clientsRes || []);
      setExistingDebtors(debtorsRes?.data || debtorsRes || []);
      setExecutionOffices(officesRes?.data?.data || []);
      setLookups(lookupsRes?.data?.data || { takipTuru: [], asama: [], risk: [], borcluTipi: [], durumEtiketi: [], mahiyetTipi: [] });
      setUsers(usersRes?.data?.data || []);
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

  const filteredOffices = selectedCity ? executionOffices.filter(o => o.city === selectedCity) : executionOffices;
  
  // Sıralama: 1) Varsayılan/Tespit edilen il, 2) İstanbul, Ankara, İzmir, 3) Alfabetik
  const userCity = settings.defaultCity || detectedCity;
  const bigCities = ['İstanbul', 'Ankara', 'İzmir'];
  const allCities = [...new Set(executionOffices.map(o => o.city))];
  const cities = [
    // Kullanıcının ili (varsa ve listede varsa)
    ...(userCity && allCities.includes(userCity) && !bigCities.includes(userCity) ? [userCity] : []),
    // Üç büyük il
    ...bigCities.filter(c => allCities.includes(c) && c !== userCity),
    // Geri kalanı alfabetik
    ...allCities.filter(c => !bigCities.includes(c) && c !== userCity).sort((a, b) => a.localeCompare(b, 'tr'))
  ];

  const addExistingLawyer = (lawyer: any) => { if (!lawyers.find(l => l.id === lawyer.id)) setLawyers([...lawyers, { ...lawyer, canSign: false, isNew: false }]); };
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

  const prevStep = () => { setError(""); setCurrentStep(prev => Math.max(prev - 1, 0)); };

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
        lawyers: lawyers.filter(l => l.name && l.surname).map(l => ({ id: l.isNew ? undefined : l.id, name: l.name, surname: l.surname, barNumber: l.barNumber, canSign: l.canSign })),
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
    <div className="w-full max-w-4xl mx-auto px-1 sm:px-2 lg:px-0 min-w-0">
      <div className="mb-2 sm:mb-4">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs sm:text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" /> Takiplere Dön
        </Link>
      </div>

      <div className="mb-3 sm:mb-4">
        {/* Mobil: Sadece mevcut adım göster */}
        <div className="lg:hidden flex items-center justify-between mb-1">
          <span className="text-xs sm:text-sm font-medium text-primary">{steps[currentStep].title}</span>
          <span className="text-xs text-muted-foreground">{currentStep + 1} / {steps.length}</span>
        </div>
        <div className="lg:hidden flex gap-0.5">
          {steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => { setError(""); setCurrentStep(step.id); }}
              className={`flex-1 h-1 rounded-full transition-colors ${currentStep >= step.id ? "bg-primary" : "bg-gray-200"}`}
            />
          ))}
        </div>
        
        {/* Desktop: Tam stepper - sadece lg ve üstünde */}
        <div className="hidden lg:flex items-center justify-between overflow-x-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => { setError(""); setCurrentStep(step.id); }}
                className={`flex items-center justify-center w-8 h-8 min-w-[2rem] rounded-full border-2 text-sm transition-all hover:scale-110 cursor-pointer ${currentStep > step.id ? "bg-primary border-primary text-white hover:bg-primary/80" : currentStep === step.id ? "border-primary text-primary" : "border-gray-300 text-gray-400 hover:border-primary hover:text-primary"}`}
              >
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id + 1}
              </button>
              <button
                type="button"
                onClick={() => { setError(""); setCurrentStep(step.id); }}
                className={`ml-2 text-xs font-medium cursor-pointer hover:text-primary ${currentStep >= step.id ? "text-foreground" : "text-gray-400"}`}
              >
                {step.title}
              </button>
              {index < steps.length - 1 && <div className={`w-6 h-0.5 mx-1 flex-shrink-0 ${currentStep > step.id ? "bg-primary" : "bg-gray-300"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-3 sm:p-4 md:p-6 min-w-0 overflow-hidden">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

        {currentStep === 0 && (
          <div>
            {showDocumentSelector ? (
              <DocumentSourceSelector onSelect={handleDocumentSourceSelect} onSkip={() => { setShowDocumentSelector(false); setShowWizard(false); }} />
            ) : wizardResult ? (
              <WizardResultCard result={wizardResult} onAccept={() => {
                setCaseData(prev => ({ ...prev, subCategory: wizardResult.subCategory, currency: wizardResult.currency as any, interestType: wizardResult.interestRateType === "DEGISKEN" ? "YASAL" : "SABIT", interestDescription: wizardResult.interestDescription }));
                setWizardResult(null); if (selectedForm) setCurrentStep(1);
              }} onRestart={() => { setWizardResult(null); setShowWizard(true); }} />
            ) : showWizard && documentSource === "ILAM" ? (
              <CaseWizard onComplete={(result) => { setWizardResult(result); setShowWizard(false); }} onSkip={() => setShowWizard(false)} />
            ) : showWizard && documentSource === "KAMBIYO" ? (
              <KambiyoWizard onComplete={(result) => { const kambiyoForm = formMetadata.find(f => f.code === result.suggestedFormCode); if (kambiyoForm) setSelectedForm(kambiyoForm); setShowWizard(false); setCurrentStep(1); }} onSkip={() => { setShowWizard(false); const kambiyoForm = formMetadata.find(f => f.code === "FORM_10"); if (kambiyoForm) setSelectedForm(kambiyoForm); }} />
            ) : showWizard && documentSource === "SOZLESME" ? (
              <IlamsizWizard onComplete={(result) => { const ilamsizForm = formMetadata.find(f => f.code === result.suggestedFormCode); if (ilamsizForm) setSelectedForm(ilamsizForm); setShowWizard(false); setCurrentStep(1); }} onSkip={() => { setShowWizard(false); const ilamsizForm = formMetadata.find(f => f.code === "FORM_7"); if (ilamsizForm) setSelectedForm(ilamsizForm); }} />
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
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Yetkili Avukatlar</h2>
              <button type="button" onClick={addNewLawyer} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Avukat</button>
            </div>
            {existingLawyers.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Avukatlardan Seç</label><div className="flex flex-wrap gap-2">{existingLawyers.filter(l => !lawyers.find(sl => sl.id === l.id)).map(lawyer => (<button key={lawyer.id} type="button" onClick={() => addExistingLawyer(lawyer)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{lawyer.name} {lawyer.surname}</button>))}</div></div>)}
            {lawyers.length === 0 ? (<p className="text-center py-8 text-muted-foreground">Henüz avukat eklenmedi</p>) : (<div className="space-y-3">{lawyers.map((lawyer, index) => (<div key={index} className="border rounded-lg p-4 relative"><button type="button" onClick={() => removeLawyer(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>{!lawyer.isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}<div className="grid grid-cols-3 gap-3"><input type="text" value={lawyer.name} onChange={e => updateLawyer(index, "name", e.target.value)} disabled={!lawyer.isNew} placeholder="Ad" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /><input type="text" value={lawyer.surname} onChange={e => updateLawyer(index, "surname", e.target.value)} disabled={!lawyer.isNew} placeholder="Soyad" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /><input type="text" value={lawyer.barNumber || ""} onChange={e => updateLawyer(index, "barNumber", e.target.value)} disabled={!lawyer.isNew} placeholder="Baro Sicil No" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /></div><label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={lawyer.canSign} onChange={e => updateLawyer(index, "canSign", e.target.checked)} className="rounded" /><span className="text-sm">İmza Yetkisi</span></label></div>))}</div>)}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Alacaklılar (Müvekkiller)</h2>
              <button type="button" onClick={addNewCreditor} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Alacaklı</button>
            </div>
            {existingClients.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Müvekkillerden Seç</label><div className="flex flex-wrap gap-2">{existingClients.filter(c => !creditors.find(sc => sc.id === c.id)).map(client => (<button key={client.id} type="button" onClick={() => addExistingCreditor(client)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{client.name}</button>))}</div></div>)}
            {creditors.length === 0 ? (<p className="text-center py-8 text-muted-foreground">Henüz alacaklı eklenmedi</p>) : (<div className="space-y-3">{creditors.map((creditor, index) => (<PartyForm key={index} party={creditor} isNew={creditor.isNew || false} onUpdate={(field, value) => updateCreditor(index, field, value)} onRemove={() => removeCreditor(index)} />))}</div>)}
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

        <div className="flex flex-col sm:flex-row justify-between gap-3 mt-8 pt-4 border-t">
          <button type="button" onClick={prevStep} disabled={currentStep === 0} className="inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50 order-2 sm:order-1"><ArrowLeft className="h-4 w-4" /> Geri</button>
          {currentStep < steps.length - 1 ? (
            <button type="button" onClick={nextStep} className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 order-1 sm:order-2">İleri <ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading} className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 order-1 sm:order-2">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Oluşturuluyor..." : "Takibi Oluştur"}</button>
          )}
        </div>
      </div>

      {detailModalForm && <FormDetailModal form={detailModalForm} isOpen={!!detailModalForm} onClose={() => setDetailModalForm(null)} onSelect={() => { handleFormSelect(detailModalForm); setDetailModalForm(null); }} />}
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
