"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, Check, Plus, X, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { FormMetadata, SubFormMetadata, FormCategory } from "@/types/form-metadata";
import { WizardAnswers } from "@/types/wizard";
import { formMetadata, filterFormsByCategory } from "@/config/form-metadata";
import { FormWizard } from "@/components/case/FormWizard";
import { CaseWizard, CaseSubCategoryType, CurrencyType } from "@/components/case/CaseWizard";
import { IlamsizWizard } from "@/components/case/IlamsizWizard";
import { KambiyoWizard } from "@/components/case/KambiyoWizard";
import { CategoryFilter } from "@/components/case/CategoryFilter";
import { FormCard } from "@/components/case/FormCard";
import { FormDetailModal } from "@/components/case/FormDetailModal";
import { FrequentForms } from "@/components/case/FrequentForms";
import { RecentForms } from "@/components/case/RecentForms";
import { CrossCheckWarning } from "@/components/case/CrossCheckWarning";
import { DocumentSourceSelector, DocumentSourceType, ClassificationResult } from "@/components/case/DocumentSourceSelector";
import { WizardResultCard } from "@/components/case/WizardResultCard";
import { useFormHistory } from "@/hooks/useFormHistory";
import { checkFormConsistency, CaseDataForCheck } from "@/utils/form-cross-check";
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
    subCategory: "GENEL" | "NAFAKA" | "DOVIZ";
    currency: string;
    interestRateType: string;
    interestDescription: string;
    recommendation: string;
    explanation: string;
    legalBasis?: string;
    tips?: string[];
    warnings?: string[];
    automationFeatures?: string[];
  } | null>(null);
  
  // Ayarlardan sihirbaz tercihini uygula
  useEffect(() => {
    if (settingsLoaded) {
      setShowWizard(settings.showWizardOnNewCase);
      // Varsayılan takip yolunu uygula
      if (settings.defaultExecutionPath) {
        setCaseData(prev => ({ ...prev, executionPath: settings.defaultExecutionPath }));
      }
    }
  }, [settingsLoaded, settings.showWizardOnNewCase, settings.defaultExecutionPath]);
  const [wizardAnswers, setWizardAnswers] = useState<WizardAnswers | null>(null);
  const [recommendedForm, setRecommendedForm] = useState<FormMetadata | null>(null);
  const [selectedForm, setSelectedForm] = useState<FormMetadata | null>(null);
  const [selectedSubForm, setSelectedSubForm] = useState<SubFormMetadata | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<FormCategory | "ALL">("ALL");
  const [detailModalForm, setDetailModalForm] = useState<FormMetadata | null>(null);
  const [crossCheckResult, setCrossCheckResult] = useState<ReturnType<typeof checkFormConsistency> | null>(null);
  const [existingLawyers, setExistingLawyers] = useState<any[]>([]);
  const [existingClients, setExistingClients] = useState<any[]>([]);
  const [existingDebtors, setExistingDebtors] = useState<any[]>([]);
  const [caseData, setCaseData] = useState({ 
    fileNumber: "", 
    executionFileNumber: "", 
    startDate: new Date().toISOString().split("T")[0], 
    notes: "",
    executionPath: "HACIZ",
    executionOfficeId: "",
    uyapBirimKodu: "",
    caseStatus: "DERDEST",
    hasArticle4Request: false,
    // Alt Kategori (İlamlı Genel/Nafaka/Döviz)
    subCategory: "GENEL" as "GENEL" | "NAFAKA" | "DOVIZ",
    currency: "TRY" as "TRY" | "USD" | "EUR" | "GBP" | "CHF",
    interestType: "YASAL",
    interestDescription: "",
    // Nafaka için
    nafakaStartDate: "",
    monthlyNafakaAmount: "",
    // Döviz için
    exchangeDate: "",
    exchangeRateType: "ODEME_TARIHI" as "TAKIP_TARIHI" | "ODEME_TARIHI",
  });
  const [executionOffices, setExecutionOffices] = useState<ExecutionOffice[]>([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [creditors, setCreditors] = useState<Party[]>([]);
  const [debtors, setDebtors] = useState<Party[]>([]);
  const [dues, setDues] = useState<DueItem[]>([]);

  useEffect(() => { loadExistingData(); }, []);

  const loadExistingData = async () => {
    try {
      const [lawyersRes, clientsRes, debtorsRes, officesRes] = await Promise.all([
        api.getLawyers().catch(() => []), 
        api.getClients().catch(() => []), 
        api.searchDebtors().catch(() => []),
        api.get('/execution-offices').catch(() => ({ data: { data: [] } })),
      ]);
      setExistingLawyers(lawyersRes || []);
      setExistingClients(clientsRes?.data || clientsRes || []);
      setExistingDebtors(debtorsRes?.data || debtorsRes || []);
      setExecutionOffices(officesRes?.data?.data || []);
      
      // Otomatik dosya numarası al (ayrı try-catch ile)
      try {
        const nextFileNumber = await api.getNextFileNumber();
        console.log("Next file number response:", nextFileNumber);
        if (nextFileNumber) {
          setCaseData(prev => ({ ...prev, fileNumber: nextFileNumber }));
        }
      } catch (e) {
        console.error("Dosya numarası alınamadı:", e);
      }
    } catch (err) { console.error("Mevcut veriler yüklenemedi:", err); }
  };

  // Dayanak belge seçimi handler
  const handleDocumentSourceSelect = (sourceType: DocumentSourceType, ocrResultData?: ClassificationResult) => {
    setDocumentSource(sourceType);
    setShowDocumentSelector(false);
    
    if (ocrResultData) {
      setOcrResult(ocrResultData);
      // OCR sonucuna göre alt kategori ve para birimini ayarla
      if (ocrResultData.detectedSubCategory === "NAFAKA") {
        setCaseData(prev => ({ ...prev, subCategory: "NAFAKA", currency: "TRY" }));
      } else if (ocrResultData.detectedSubCategory === "DOVIZ") {
        setCaseData(prev => ({ ...prev, subCategory: "DOVIZ", currency: "USD" }));
      }
    }
    
    // Belge türüne göre sihirbazı göster
    if (sourceType === "KAMBIYO") {
      // Kambiyo için KambiyoWizard göster
      setShowWizard(true);
    } else if (sourceType === "ILAM") {
      // İlam için İlamlı Sihirbazı göster (CaseWizard - Para alacağı? → TL/Döviz? → Nafaka?)
      setShowWizard(true);
      // İlamlı formu seç
      const ilamliForm = formMetadata.find(f => f.code === "FORM_2_3_4_5");
      if (ilamliForm) setSelectedForm(ilamliForm);
    } else if (sourceType === "SOZLESME") {
      // Sözleşme için İlamsızWizard göster
      setShowWizard(true);
    }
  };

  const handleWizardComplete = (recommended: FormMetadata | null, answers: WizardAnswers) => {
    setWizardAnswers(answers);
    setRecommendedForm(recommended);
    setShowWizard(false);
    if (recommended) setSelectedForm(recommended);
  };

  const handleFormSelect = (form: FormMetadata, subForm?: SubFormMetadata) => {
    setSelectedForm(form);
    setSelectedSubForm(subForm || null);
    setError(""); // Hata mesajını temizle
    if (!form.subForms || form.subForms.length === 0 || subForm) setCurrentStep(1);
  };

  const handleCaseDataChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setCaseData((prev) => ({ ...prev, [name]: newValue }));
  };

  const [uyapWarning, setUyapWarning] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState<ExecutionOffice | null>(null);
  
  const handleOfficeChange = (officeId: string) => {
    setCaseData((prev) => ({ ...prev, executionOfficeId: officeId }));
    const office = executionOffices.find((o) => o.id === officeId);
    setSelectedOffice(office || null);
    if (office?.uyapCode) {
      setCaseData((prev) => ({ ...prev, uyapBirimKodu: office.uyapCode || '' }));
      setUyapWarning(false);
    } else if (officeId) {
      setCaseData((prev) => ({ ...prev, uyapBirimKodu: '' }));
      setUyapWarning(true);
    } else {
      setUyapWarning(false);
    }
  };

  const filteredOffices = selectedCity 
    ? executionOffices.filter((o) => o.city === selectedCity)
    : executionOffices;

  const cities = [...new Set(executionOffices.map((o) => o.city))].sort();

  const addExistingLawyer = (lawyer: any) => { if (!lawyers.find((l) => l.id === lawyer.id)) setLawyers([...lawyers, { ...lawyer, canSign: false, isNew: false }]); };
  const addNewLawyer = () => setLawyers([...lawyers, { name: "", surname: "", barNumber: "", canSign: false, isNew: true }]);
  const updateLawyer = (index: number, field: keyof Lawyer, value: any) => { const updated = [...lawyers]; updated[index] = { ...updated[index], [field]: value }; setLawyers(updated); };
  const removeLawyer = (index: number) => setLawyers(lawyers.filter((_, i) => i !== index));

  const addExistingCreditor = (client: any) => { if (!creditors.find((c) => c.id === client.id)) setCreditors([...creditors, { ...client, isNew: false }]); };
  const addNewCreditor = () => setCreditors([...creditors, { type: "INDIVIDUAL", name: "", isNew: true }]);
  const updateCreditor = (index: number, field: keyof Party, value: any) => { const updated = [...creditors]; updated[index] = { ...updated[index], [field]: value }; setCreditors(updated); };
  const removeCreditor = (index: number) => setCreditors(creditors.filter((_, i) => i !== index));

  const addExistingDebtor = (debtor: any) => { if (!debtors.find((d) => d.id === debtor.id)) setDebtors([...debtors, { ...debtor, isNew: false }]); };
  const addNewDebtor = () => setDebtors([...debtors, { type: "INDIVIDUAL", name: "", isNew: true }]);
  const updateDebtor = (index: number, field: keyof Party, value: any) => { const updated = [...debtors]; updated[index] = { ...updated[index], [field]: value }; setDebtors(updated); };
  const removeDebtor = (index: number) => setDebtors(debtors.filter((_, i) => i !== index));

  // Alacak Kalemleri fonksiyonları
  const addNewDue = () => setDues([...dues, { type: "PRINCIPAL", description: "", amount: "", dueDate: new Date().toISOString().split("T")[0] }]);
  const updateDue = (index: number, field: keyof DueItem, value: any) => { const updated = [...dues]; updated[index] = { ...updated[index], [field]: value }; setDues(updated); };
  const removeDue = (index: number) => setDues(dues.filter((_, i) => i !== index));
  const getTotalDues = () => dues.reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0);

  const nextStep = () => {
    if (currentStep === 0 && !selectedForm) { setError("Lütfen bir form türü seçin"); return; }
    if (currentStep === 0 && selectedForm?.subForms?.length && !selectedSubForm) { setError("Lütfen bir alt form türü seçin"); return; }
    if (currentStep === 1 && !caseData.fileNumber.trim()) { setError("Takip No (Büro Dosya No) zorunludur"); return; }
    setError("");
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const prevStep = () => { setError(""); setCurrentStep((prev) => Math.max(prev - 1, 0)); };

  // FormCategory'den CaseType'a mapping
  const mapCategoryToCaseType = (category: string | undefined): string => {
    const mapping: Record<string, string> = {
      GENEL_ICRA: "GENERAL_EXECUTION",
      KAMBIYO: "CHECK",
      IPOTEK_REHIN: "MORTGAGE",
      IFLAS: "BANKRUPTCY",
      KIRA: "RENTAL",
    };
    return mapping[category || ""] || "GENERAL_EXECUTION";
  };

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await api.createCase({
        fileNumber: caseData.fileNumber,
        executionFileNumber: caseData.executionFileNumber || undefined,
        type: mapCategoryToCaseType(selectedForm?.category),
        subType: selectedSubForm?.code || selectedForm?.code,
        startDate: caseData.startDate || undefined,
        notes: caseData.notes || undefined,
        // Yeni alanlar
        executionPath: caseData.executionPath,
        caseStatus: caseData.caseStatus,
        executionOfficeId: caseData.executionOfficeId || undefined,
        uyapBirimKodu: caseData.uyapBirimKodu || undefined,
        hasArticle4Request: caseData.hasArticle4Request,
        // Alt Kategori (İlamlı Genel/Nafaka/Döviz)
        subCategory: caseData.subCategory,
        currency: caseData.currency,
        interestType: caseData.interestType,
        // Nafaka bilgileri
        nafakaStartDate: caseData.nafakaStartDate || undefined,
        monthlyNafakaAmount: caseData.monthlyNafakaAmount ? parseFloat(caseData.monthlyNafakaAmount) : undefined,
        // Döviz bilgileri
        exchangeDate: caseData.exchangeDate || undefined,
        exchangeRateType: caseData.exchangeRateType,
        // Taraflar
        lawyers: lawyers.filter((l) => l.name && l.surname).map((l) => ({ id: l.isNew ? undefined : l.id, name: l.name, surname: l.surname, barNumber: l.barNumber, canSign: l.canSign })),
        creditors: creditors.filter((c) => c.name).map((c) => ({ id: c.isNew ? undefined : c.id, type: c.type, name: c.name, identityNo: c.identityNo, taxOffice: c.taxOffice, phone: c.phone, email: c.email, address: c.address })),
        debtors: debtors.filter((d) => d.name).map((d) => ({ id: d.isNew ? undefined : d.id, type: d.type, name: d.name, identityNo: d.identityNo, taxOffice: d.taxOffice, phone: d.phone, email: d.email, address: d.address })),
        // Alacak Kalemleri
        dues: dues.filter((d) => d.amount && parseFloat(d.amount) > 0).map((d) => ({ type: d.type, description: d.description || undefined, amount: parseFloat(d.amount), dueDate: d.dueDate })),
      });
      if (selectedForm) recordUsage(selectedForm.code);
      router.push(`/cases/${response.id}`);
    } catch (err: any) { setError(err.message || "Takip oluşturulurken bir hata oluştu"); } finally { setLoading(false); }
  };

  const filteredForms = filterFormsByCategory(categoryFilter === "ALL" ? null : categoryFilter);
  const recentHistory = getRecentForms();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/cases" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Takiplere Dön
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 text-sm ${currentStep > step.id ? "bg-primary border-primary text-white" : currentStep === step.id ? "border-primary text-primary" : "border-gray-300 text-gray-400"}`}>
                {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id + 1}
              </div>
              <span className={`ml-2 text-xs font-medium hidden sm:block ${currentStep >= step.id ? "text-foreground" : "text-gray-400"}`}>{step.title}</span>
              {index < steps.length - 1 && <div className={`w-8 h-0.5 mx-2 ${currentStep > step.id ? "bg-primary" : "bg-gray-300"}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border p-6">
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg">{error}</div>}

        {currentStep === 0 && (
          <div>
            {/* Adım 1: Dayanak Belge Seçimi */}
            {showDocumentSelector ? (
              <DocumentSourceSelector 
                onSelect={handleDocumentSourceSelect}
                onSkip={() => { setShowDocumentSelector(false); setShowWizard(false); }}
              />
            ) : wizardResult ? (
              /* Sihirbaz Sonuç Kartı */
              <WizardResultCard
                result={wizardResult}
                onAccept={() => {
                  // Sonucu kabul et, form bilgilerine geç
                  setCaseData(prev => ({
                    ...prev,
                    subCategory: wizardResult.subCategory,
                    currency: wizardResult.currency as any,
                    interestType: wizardResult.interestRateType === "DEGISKEN" ? "YASAL" : "SABIT",
                    interestDescription: wizardResult.interestDescription,
                  }));
                  setWizardResult(null);
                  if (selectedForm) setCurrentStep(1);
                }}
                onRestart={() => {
                  setWizardResult(null);
                  setShowWizard(true);
                }}
              />
            ) : showWizard && documentSource === "ILAM" ? (
              /* İlamlı Takip Sihirbazı - Para alacağı? → TL/Döviz? → Nafaka? */
              <CaseWizard 
                onComplete={(result) => {
                  // Sihirbaz sonucunu wizardResult'a kaydet ve sonuç kartını göster
                  setWizardResult(result);
                  setShowWizard(false);
                }}
                onSkip={() => setShowWizard(false)}
              />
            ) : showWizard && documentSource === "KAMBIYO" ? (
              /* Kambiyo Takibi Sihirbazı - Bono/Poliçe/Çek */
              <KambiyoWizard 
                onComplete={(result) => {
                  // Kambiyo formu seç
                  const kambiyoForm = formMetadata.find(f => f.code === result.suggestedFormCode);
                  if (kambiyoForm) setSelectedForm(kambiyoForm);
                  setShowWizard(false);
                  setCurrentStep(1);
                }}
                onSkip={() => {
                  setShowWizard(false);
                  const kambiyoForm = formMetadata.find(f => f.code === "FORM_10");
                  if (kambiyoForm) setSelectedForm(kambiyoForm);
                }}
              />
            ) : showWizard && documentSource === "SOZLESME" ? (
              /* İlamsız Takip Sihirbazı - Kira/Tahliye/Genel */
              <IlamsizWizard 
                onComplete={(result) => {
                  // İlamsız formu seç
                  const ilamsizForm = formMetadata.find(f => f.code === result.suggestedFormCode);
                  if (ilamsizForm) setSelectedForm(ilamsizForm);
                  setShowWizard(false);
                  setCurrentStep(1);
                }}
                onSkip={() => {
                  setShowWizard(false);
                  const ilamsizForm = formMetadata.find(f => f.code === "FORM_7");
                  if (ilamsizForm) setSelectedForm(ilamsizForm);
                }}
              />
            ) : showWizard ? (
              <FormWizard onComplete={handleWizardComplete} onSkip={() => setShowWizard(false)} />
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-2">İcra Takip Formu Seçin</h2>
                <p className="text-muted-foreground mb-4">Durumunuza uygun formu seçin veya sihirbazı kullanın</p>
                
                {/* OCR Sonucu Bilgisi */}
                {ocrResult && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <span className="font-medium">🎯 Belge Analizi:</span> {ocrResult.explanation}
                    </p>
                  </div>
                )}
                
                {/* Dayanak Belge Bilgisi */}
                {documentSource && (
                  <div className="mb-4 p-3 bg-gray-50 border rounded-lg flex items-center justify-between">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Dayanak Belge: </span>
                      <span className="font-medium">
                        {documentSource === "ILAM" && "Mahkeme Kararı / İlam"}
                        {documentSource === "KAMBIYO" && "Senet / Bono / Çek"}
                        {documentSource === "SOZLESME" && "Sözleşme / Fatura"}
                      </span>
                    </div>
                    <button 
                      onClick={() => { setShowDocumentSelector(true); setDocumentSource(null); setOcrResult(null); }}
                      className="text-xs text-primary hover:underline"
                    >
                      Değiştir
                    </button>
                  </div>
                )}
                
                {/* Seçilen Form Gösterimi */}
                {selectedForm && (
                  <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-800 font-medium mb-1">✓ Seçilen Form</p>
                    <p className="text-green-900 font-semibold">{selectedForm.title}</p>
                    {selectedSubForm && <p className="text-sm text-green-700">Alt Tür: {selectedSubForm.title}</p>}
                    <button 
                      onClick={() => { setSelectedForm(null); setSelectedSubForm(null); }}
                      className="mt-2 text-sm text-green-600 hover:text-green-800 underline"
                    >
                      Değiştir
                    </button>
                  </div>
                )}
                
                {recommendedForm && (
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-2 font-medium">🎯 Sihirbaz Önerisi</p>
                    <FormCard form={recommendedForm} isSelected={selectedForm?.code === recommendedForm.code} isRecommended onSelect={handleFormSelect} onInfoClick={setDetailModalForm} />
                  </div>
                )}

                <FrequentForms onSelect={handleFormSelect} />
                {recentHistory.length > 0 && <RecentForms recentHistory={recentHistory} onSelect={handleFormSelect} />}

                <div className="mb-4">
                  <CategoryFilter selectedCategory={categoryFilter} onCategoryChange={setCategoryFilter} />
                </div>

                <div className="space-y-3">
                  {filteredForms.filter(f => f.code !== recommendedForm?.code).map((form) => (
                    <FormCard key={form.code} form={form} isSelected={selectedForm?.code === form.code} onSelect={handleFormSelect} onInfoClick={setDetailModalForm} />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Takip Bilgileri</h2>
              <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full">{selectedSubForm?.title || selectedForm?.title}</span>
            </div>

            {/* Temel Bilgiler */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Takip No (Büro Dosya No) <span className="text-red-500">*</span></label>
                <input type="text" name="fileNumber" value={caseData.fileNumber} onChange={handleCaseDataChange} placeholder="Ör: 2024/1001" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Takip Tarihi <span className="text-red-500">*</span></label>
                <input type="date" name="startDate" value={caseData.startDate} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
            </div>

            {/* Takip Yolu ve Statü */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Takip Yolu <span className="text-red-500">*</span></label>
                <select name="executionPath" value={caseData.executionPath} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="HACIZ">Haciz Yolu</option>
                  <option value="IFLAS">İflas Yolu</option>
                  <option value="REHIN">Rehin Paraya Çevirme</option>
                  <option value="IPOTEK">İpotek Paraya Çevirme</option>
                  <option value="TAHLIYE">Tahliye</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Başlangıç Statüsü</label>
                <select name="caseStatus" value={caseData.caseStatus} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                  <option value="DERDEST">Derdest - Yeni dosya için varsayılan</option>
                  <option value="ISLEMDE">İşlemde - Sistem dışı başlayan dosya</option>
                  <option value="DERKENAR">Derkenar - Yan işlem niteliğinde</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">Kapanış statüleri dosya ilerledikten sonra seçilebilir</p>
              </div>
            </div>

            {/* İlamlı Alacak Alt Kategorisi */}
            <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <span className="text-lg">🎯</span> İlamlı Alacak Türü
              </h3>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setCaseData(prev => ({ ...prev, subCategory: "GENEL", currency: "TRY" }))}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    caseData.subCategory === "GENEL" 
                      ? "border-blue-500 bg-blue-50" 
                      : "border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="text-xl mb-1">💼</div>
                  <div className="font-medium text-sm">Genel Alacak</div>
                  <div className="text-xs text-muted-foreground">Tek seferlik para alacağı</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCaseData(prev => ({ ...prev, subCategory: "NAFAKA", currency: "TRY" }))}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    caseData.subCategory === "NAFAKA" 
                      ? "border-purple-500 bg-purple-50" 
                      : "border-gray-200 hover:border-purple-300"
                  }`}
                >
                  <div className="text-xl mb-1">📅</div>
                  <div className="font-medium text-sm">Nafaka</div>
                  <div className="text-xs text-muted-foreground">Aylık periyodik alacak</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCaseData(prev => ({ ...prev, subCategory: "DOVIZ", currency: "USD" }))}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    caseData.subCategory === "DOVIZ" 
                      ? "border-green-500 bg-green-50" 
                      : "border-gray-200 hover:border-green-300"
                  }`}
                >
                  <div className="text-xl mb-1">💱</div>
                  <div className="font-medium text-sm">Döviz Alacağı</div>
                  <div className="text-xs text-muted-foreground">Yabancı para alacağı</div>
                </button>
              </div>

              {/* Alt kategoriye göre ek alanlar */}
              {caseData.subCategory === "DOVIZ" && (
                <div className="mt-3 p-3 bg-white rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Döviz Türü</label>
                      <select name="currency" value={caseData.currency} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm">
                        <option value="USD">USD - Amerikan Doları</option>
                        <option value="EUR">EUR - Euro</option>
                        <option value="GBP">GBP - İngiliz Sterlini</option>
                        <option value="CHF">CHF - İsviçre Frangı</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Kur Hesaplama</label>
                      <select name="exchangeRateType" value={caseData.exchangeRateType} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm">
                        <option value="ODEME_TARIHI">Fiili Ödeme Tarihi Kuru</option>
                        <option value="TAKIP_TARIHI">Takip Tarihi Kuru</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-green-700">💡 Döviz alacağı: Fiili ödeme tarihindeki T.C. Merkez Bankası efektif satış kuru üzerinden tahsil edilecek.</p>
                </div>
              )}

              {caseData.subCategory === "NAFAKA" && (
                <div className="mt-3 p-3 bg-white rounded-lg space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">Nafaka Başlangıç Tarihi</label>
                      <input type="date" name="nafakaStartDate" value={caseData.nafakaStartDate} onChange={handleCaseDataChange} className="w-full rounded-lg border px-3 py-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Aylık Nafaka Tutarı (₺)</label>
                      <input type="number" name="monthlyNafakaAmount" value={caseData.monthlyNafakaAmount} onChange={handleCaseDataChange} placeholder="0.00" className="w-full rounded-lg border px-3 py-2 text-sm" />
                    </div>
                  </div>
                  <p className="text-xs text-purple-700">💡 Nafaka alacağı: Devam eden aylarla birlikte tahsil edilecek. Aylık nafakalar otomatik hesaplanacak.</p>
                </div>
              )}

              {caseData.subCategory === "GENEL" && (
                <div className="mt-3 p-3 bg-white rounded-lg">
                  <p className="text-xs text-blue-700">💡 Genel alacak: Değişen oranlarda yasal faizi ile birlikte tahsil edilecek.</p>
                </div>
              )}
            </div>

            {/* İcra Dairesi */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-semibold mb-3">İcra Dairesi Bilgileri</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">İl</label>
                  <select value={selectedCity} onChange={(e) => setSelectedCity(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">Tüm İller</option>
                    {cities.map((city) => (
                      <option key={city} value={city}>{city}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">İcra Dairesi</label>
                  <select value={caseData.executionOfficeId} onChange={(e) => handleOfficeChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                    <option value="">Seçiniz</option>
                    {filteredOffices.map((office) => (
                      <option key={office.id} value={office.id}>{office.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">UYAP Birim Kodu</label>
                  <input type="text" name="uyapBirimKodu" value={caseData.uyapBirimKodu} onChange={handleCaseDataChange} placeholder="Otomatik doldurulur" className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary bg-gray-100 ${uyapWarning ? 'border-amber-500' : ''}`} readOnly />
                  {uyapWarning && (
                    <p className="text-xs text-amber-600 mt-1">⚠️ UYAP kodu bulunamadı; sorgu yapılamaz.</p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm font-medium mb-1">İcra Dosya No (İcra Dairesi Esas No)</label>
                <input type="text" name="executionFileNumber" value={caseData.executionFileNumber} onChange={handleCaseDataChange} placeholder="Ör: 2024/12345 E." className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
              </div>
              
              {/* Seçilen İcra Dairesi Banka Bilgileri */}
              {selectedOffice && (selectedOffice.bankName || selectedOffice.iban || selectedOffice.taxNumber) && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-blue-800 mb-2">📋 İcra Dairesi Hesap Bilgileri</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    {selectedOffice.bankName && (
                      <div>
                        <span className="text-blue-600 font-medium">Banka:</span>{' '}
                        <span className="text-blue-900">{selectedOffice.bankName}{selectedOffice.branchName ? ` - ${selectedOffice.branchName}` : ''}</span>
                      </div>
                    )}
                    {selectedOffice.taxNumber && (
                      <div>
                        <span className="text-blue-600 font-medium">Vergi No:</span>{' '}
                        <span className="text-blue-900">{selectedOffice.taxNumber}</span>
                      </div>
                    )}
                    {selectedOffice.iban && (
                      <div className="md:col-span-2">
                        <span className="text-blue-600 font-medium">IBAN:</span>{' '}
                        <span className="text-blue-900 font-mono text-xs">{selectedOffice.iban}</span>
                        <button 
                          type="button" 
                          onClick={() => navigator.clipboard.writeText(selectedOffice.iban || '')}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Kopyala
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 4. Madde Talep */}
            <div className="p-4 bg-amber-50 rounded-lg">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  name="hasArticle4Request" 
                  checked={caseData.hasArticle4Request} 
                  onChange={handleCaseDataChange}
                  className="w-5 h-5 rounded border-gray-300"
                />
                <div>
                  <span className="font-medium">4. Madde Takip Talebi</span>
                  <p className="text-xs text-muted-foreground">Takip talebi (İİK m.4) düzenlendi mi?</p>
                </div>
              </label>
            </div>

            {/* Notlar */}
            <div>
              <label className="block text-sm font-medium mb-1">Notlar</label>
              <textarea name="notes" value={caseData.notes} onChange={handleCaseDataChange} rows={3} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Yetkili Avukatlar</h2>
              <button type="button" onClick={addNewLawyer} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Avukat</button>
            </div>
            {existingLawyers.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Avukatlardan Seç</label><div className="flex flex-wrap gap-2">{existingLawyers.filter(l => !lawyers.find(sl => sl.id === l.id)).map((lawyer) => (<button key={lawyer.id} type="button" onClick={() => addExistingLawyer(lawyer)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{lawyer.name} {lawyer.surname}</button>))}</div></div>)}
            {lawyers.length === 0 ? (<p className="text-center py-8 text-muted-foreground">Henüz avukat eklenmedi</p>) : (<div className="space-y-3">{lawyers.map((lawyer, index) => (<div key={index} className="border rounded-lg p-4 relative"><button type="button" onClick={() => removeLawyer(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>{!lawyer.isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}<div className="grid grid-cols-3 gap-3"><input type="text" value={lawyer.name} onChange={(e) => updateLawyer(index, "name", e.target.value)} disabled={!lawyer.isNew} placeholder="Ad" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /><input type="text" value={lawyer.surname} onChange={(e) => updateLawyer(index, "surname", e.target.value)} disabled={!lawyer.isNew} placeholder="Soyad" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /><input type="text" value={lawyer.barNumber || ""} onChange={(e) => updateLawyer(index, "barNumber", e.target.value)} disabled={!lawyer.isNew} placeholder="Baro Sicil No" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" /></div><label className="flex items-center gap-2 mt-2"><input type="checkbox" checked={lawyer.canSign} onChange={(e) => updateLawyer(index, "canSign", e.target.checked)} className="rounded" /><span className="text-sm">İmza Yetkisi</span></label></div>))}</div>)}
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Alacaklılar (Müvekkiller)</h2>
              <button type="button" onClick={addNewCreditor} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Alacaklı</button>
            </div>
            {existingClients.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Müvekkillerden Seç</label><div className="flex flex-wrap gap-2">{existingClients.filter(c => !creditors.find(sc => sc.id === c.id)).map((client) => (<button key={client.id} type="button" onClick={() => addExistingCreditor(client)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{client.name}</button>))}</div></div>)}
            {creditors.length === 0 ? (<p className="text-center py-8 text-muted-foreground">Henüz alacaklı eklenmedi</p>) : (<div className="space-y-3">{creditors.map((creditor, index) => (<PartyForm key={index} party={creditor} isNew={creditor.isNew || false} onUpdate={(field, value) => updateCreditor(index, field, value)} onRemove={() => removeCreditor(index)} />))}</div>)}
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Borçlular</h2>
              <button type="button" onClick={addNewDebtor} className="text-sm text-primary hover:underline flex items-center gap-1"><Plus className="h-4 w-4" /> Yeni Borçlu</button>
            </div>
            {existingDebtors.length > 0 && (<div className="mb-4"><label className="block text-sm font-medium mb-2">Mevcut Borçlulardan Seç</label><div className="flex flex-wrap gap-2">{existingDebtors.filter(d => !debtors.find(sd => sd.id === d.id)).map((debtor) => (<button key={debtor.id} type="button" onClick={() => addExistingDebtor(debtor)} className="px-3 py-1 text-sm border rounded-full hover:bg-primary hover:text-white hover:border-primary">{debtor.name}</button>))}</div></div>)}
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
                <button type="button" onClick={addNewDue} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> İlk Kalemi Ekle
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {dues.map((due, index) => (
                  <div key={index} className="border rounded-lg p-4 relative">
                    <button type="button" onClick={() => removeDue(index)} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1">Kalem Türü</label>
                        <select value={due.type} onChange={(e) => updateDue(index, "type", e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary">
                          <option value="PRINCIPAL">Ana Para</option>
                          <option value="INTEREST">Faiz</option>
                          <option value="EXPENSE">Masraf</option>
                          <option value="OTHER">Diğer</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Tutar (₺) <span className="text-red-500">*</span></label>
                        <input type="number" value={due.amount} onChange={(e) => updateDue(index, "amount", e.target.value)} placeholder="0.00" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Vade Tarihi</label>
                        <input type="date" value={due.dueDate} onChange={(e) => updateDue(index, "dueDate", e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">Açıklama</label>
                        <input type="text" value={due.description} onChange={(e) => updateDue(index, "description", e.target.value)} placeholder="Ör: Kira alacağı" className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary" />
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Toplam */}
                <div className="mt-4 p-4 bg-primary/5 rounded-lg flex justify-between items-center">
                  <span className="font-medium">Toplam Alacak:</span>
                  <span className="text-xl font-bold text-primary">{getTotalDues().toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-8 pt-4 border-t">
          <button type="button" onClick={prevStep} disabled={currentStep === 0} className="inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted disabled:opacity-50"><ArrowLeft className="h-4 w-4" /> Geri</button>
          {currentStep < steps.length - 1 ? (
            <button type="button" onClick={nextStep} className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">İleri <ArrowRight className="h-4 w-4" /></button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={loading} className="inline-flex items-center gap-2 px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Oluşturuluyor..." : "Takibi Oluştur"}</button>
          )}
        </div>
      </div>

      {detailModalForm && <FormDetailModal form={detailModalForm} isOpen={!!detailModalForm} onClose={() => setDetailModalForm(null)} onSelect={() => { handleFormSelect(detailModalForm); setDetailModalForm(null); }} />}
      {crossCheckResult && !crossCheckResult.isValid && selectedForm && <CrossCheckWarning result={crossCheckResult} currentForm={selectedForm} onChangeForm={(form) => { setSelectedForm(form); setCrossCheckResult(null); }} onContinue={() => setCrossCheckResult(null)} onDismiss={() => setCrossCheckResult(null)} />}
    </div>
  );
}

function PartyForm({ party, isNew, onUpdate, onRemove }: { party: Party; isNew: boolean; onUpdate: (field: keyof Party, value: any) => void; onRemove: () => void; }) {
  return (
    <div className="border rounded-lg p-4 relative">
      <button type="button" onClick={onRemove} className="absolute top-2 right-2 text-gray-400 hover:text-red-500"><X className="h-5 w-5" /></button>
      {!isNew && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded mb-2 inline-block">Mevcut</span>}
      <div className="grid grid-cols-2 gap-3">
        <select value={party.type} onChange={(e) => onUpdate("type", e.target.value)} disabled={!isNew} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50"><option value="INDIVIDUAL">Gerçek Kişi</option><option value="COMPANY">Tüzel Kişi</option></select>
        <input type="text" value={party.name} onChange={(e) => onUpdate("name", e.target.value)} disabled={!isNew} placeholder={party.type === "INDIVIDUAL" ? "Ad Soyad" : "Firma Adı"} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <input type="text" value={party.identityNo || ""} onChange={(e) => onUpdate("identityNo", e.target.value)} disabled={!isNew} placeholder={party.type === "INDIVIDUAL" ? "TC Kimlik No" : "Vergi No"} className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <input type="tel" value={party.phone || ""} onChange={(e) => onUpdate("phone", e.target.value)} disabled={!isNew} placeholder="Telefon" className="rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50" />
        <textarea value={party.address || ""} onChange={(e) => onUpdate("address", e.target.value)} disabled={!isNew} placeholder="Adres" rows={2} className="col-span-2 rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50 resize-none" />
      </div>
    </div>
  );
}
