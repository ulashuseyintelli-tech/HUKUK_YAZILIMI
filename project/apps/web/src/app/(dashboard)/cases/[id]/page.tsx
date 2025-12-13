"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  FileText,
  User,
  Users,
  Scale,
  Calendar,
  DollarSign,
  Edit,
  Brain,
  AlertTriangle,
  Clock,
  Activity,
  Settings,
  Tag,
  Plus,
  X,
  Info,
  Save,
  FileCheck,
  Share2,
  StickyNote,
} from "lucide-react";
import { Badge } from "@hukuk/ui";
import { api } from "@/lib/api";
import { AiSuggestionsModal } from "@/components/ui/AiSuggestionsModal";
import {
  CaseSummaryCard,
  StatusCards,
  AutomationPanel,
  CaseFlagsPanel,
  CaseTimeline,
  DocumentGenerator,
  CaseNotes,
  ShareCaseModal,
  CaseTags,
} from "@/components/case";

const caseTypeLabels: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz Yoluyla Takip",
  MORTGAGE: "İpotekli Takip",
  PLEDGE: "Rehinli Takip",
  CHECK: "Çek Takibi",
  BOND: "Senet Takibi",
  RENTAL: "Kira Takibi",
  BANKRUPTCY: "İflas Takibi",
  OTHER: "Diğer",
};



interface CaseDetail {
  id: string;
  fileNumber: string;
  executionFileNumber?: string;
  type: string;
  subType?: string;
  status: string;
  caseStatus: string;
  executionPath: string;
  caseDate: string;
  principalAmount?: number;
  interestRate?: number;
  startDate?: string;
  notes?: string;
  createdAt: string;
  workflowStage?: string;
  riskScore?: number;
  isAutoMode?: boolean;
  isAutomationEnabled?: boolean;
  autoActionsCount?: number;
  nextActionAt?: string;
  nextAutoAction?: string;
  daysLeft?: number;
  hasArticle4Request?: boolean;
  isArchived?: boolean;
  showToClient?: boolean;
  allowUyapActions?: boolean;
  hasUyapWarning?: boolean;
  uyapBirimKodu?: string;
  automationConfig?: any;
  // Alt Kategori ve Para Birimi
  subCategory?: "GENEL" | "NAFAKA" | "DOVIZ" | "KIRA" | "CEZA";
  currency?: "TRY" | "USD" | "EUR" | "GBP" | "CHF";
  interestType?: string;
  interestDescription?: string;
  nafakaStartDate?: string;
  monthlyNafakaAmount?: number;
  exchangeDate?: string;
  exchangeRateType?: string;
  // OCR Bilgileri
  preDetectedCaseType?: string;
  preDetectedSubCategory?: string;
  ocrText?: string;
  isAutoDetected?: boolean;
  confidenceScore?: number;
  // Ek Bilgi Alanları
  dahiliNot?: string;
  muvekkilNotu?: string;
  sonDegerlendirmeTarihi?: string;
  // Lookup İlişkileri
  takipTuru?: { id: string; name: string; code: string };
  asama?: { id: string; name: string; code: string };
  risk?: { id: string; name: string; color?: string };
  borcluTipi?: { id: string; name: string };
  durumEtiketi?: { id: string; name: string; color?: string };
  sorumluPersonel?: { id: string; name: string; surname: string };
  formType?: { id: string; name: string; code: string };
  mahiyetTipi?: { id: string; name: string; code: string; uyapCode?: string };
  reportingSummary?: string;
  dues?: {
    id: string;
    type: string;
    description?: string;
    amount: number;
    dueDate: string;
  }[];
  client?: {
    id: string;
    name: string;
    type: string;
    identityNo?: string;
    phone?: string;
    email?: string;
  };
  debtors: {
    id: string;
    role: string;
    debtor: {
      id: string;
      name: string;
      type: string;
      identityNo?: string;
      phone?: string;
    };
  }[];
  lawyers?: {
    id: string;
    canSign: boolean;
    lawyer: {
      id: string;
      name: string;
      surname: string;
      barNumber?: string;
    };
  }[];
  tasks: any[];
  collections: any[];
  lifecycleEvents?: any[];
  riskReports?: any[];
}

export default function CaseDetailPage() {
  const params = useParams();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  
  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiPrediction, setAiPrediction] = useState<any>(null);
  
  // Groups state
  const [caseGroups, setCaseGroups] = useState<any[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#3b82f6");
  
  // Ek Bilgi state
  const [extraInfo, setExtraInfo] = useState({
    dahiliNot: "",
    muvekkilNotu: "",
    sonDegerlendirmeTarihi: "",
  });
  const [extraInfoSaving, setExtraInfoSaving] = useState(false);
  
  // Vekalet kontrolü state
  const [poaWarnings, setPoaWarnings] = useState<{ clientName: string; lawyerName: string; message: string; }[]>([]);
  
  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  
  // Raporlama Panel state
  const [showReportingPanel, setShowReportingPanel] = useState(false);
  const [reportingData, setReportingData] = useState({
    takipTuruId: "",
    mahiyetTipiId: "",
    riskId: "",
    durumEtiketiId: "",
    borcluTipiId: "",
    sorumluPersonelId: "",
  });
  const [reportingSaving, setReportingSaving] = useState(false);
  const [lookups, setLookups] = useState<{
    takipTuru: any[];
    mahiyetTipi: any[];
    risk: any[];
    durumEtiketi: any[];
    borcluTipi: any[];
    users: any[];
  }>({
    takipTuru: [],
    mahiyetTipi: [],
    risk: [],
    durumEtiketi: [],
    borcluTipi: [],
    users: [],
  });

  const handleAiAnalysis = async () => {
    if (!caseData) return;
    
    setAiModalOpen(true);
    setAiLoading(true);
    setAiError(null);
    
    try {
      const [suggestRes, predictRes] = await Promise.all([
        api.get(`/ai/case/${caseData.id}/suggest`),
        api.get(`/ai/case/${caseData.id}/predict`),
      ]);
      
      setAiSuggestions(suggestRes.data?.data || []);
      setAiPrediction(predictRes.data?.data || null);
    } catch (error: any) {
      setAiError(error.message || 'AI analizi yapılırken bir hata oluştu');
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (params.id) {
      fetchCase();
      fetchGroups();
      fetchLookups();
    }
  }, [params.id]);

  const fetchLookups = async () => {
    try {
      const [takipTuruRes, mahiyetTipiRes, riskRes, durumEtiketiRes, borcluTipiRes, usersRes] = await Promise.all([
        api.get('/lookups/takipTuru'),
        api.get('/lookups/mahiyetTipi'),
        api.get('/lookups/risk'),
        api.get('/lookups/durumEtiketi'),
        api.get('/lookups/borcluTipi'),
        api.get('/users'),
      ]);
      setLookups({
        takipTuru: takipTuruRes?.data?.data || [],
        mahiyetTipi: mahiyetTipiRes?.data?.data || [],
        risk: riskRes?.data?.data || [],
        durumEtiketi: durumEtiketiRes?.data?.data || [],
        borcluTipi: borcluTipiRes?.data?.data || [],
        users: usersRes?.data?.data || [],
      });
    } catch (error) {
      console.error("Lookup verileri yüklenemedi:", error);
    }
  };

  const fetchGroups = async () => {
    try {
      const [caseGroupsRes, allGroupsRes] = await Promise.all([
        api.get(`/cases/${params.id}/groups`),
        api.get('/groups'),
      ]);
      setCaseGroups(caseGroupsRes?.data?.data || []);
      setAllGroups(allGroupsRes?.data?.data || []);
    } catch (error) {
      console.error("Gruplar yüklenemedi:", error);
    }
  };

  const handleAddGroup = async (groupId: string) => {
    try {
      await api.post(`/cases/${params.id}/groups/${groupId}`);
      fetchGroups();
    } catch (error) {
      console.error("Grup eklenemedi:", error);
    }
  };

  const handleRemoveGroup = async (groupId: string) => {
    try {
      await api.delete(`/cases/${params.id}/groups/${groupId}`);
      fetchGroups();
    } catch (error) {
      console.error("Grup çıkarılamadı:", error);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await api.post('/groups', {
        name: newGroupName,
        description: newGroupDescription,
        color: newGroupColor,
        isGlobal: true,
      });
      setNewGroupName("");
      setNewGroupDescription("");
      setShowNewGroupModal(false);
      fetchGroups();
    } catch (error) {
      console.error("Grup oluşturulamadı:", error);
    }
  };

  const fetchCase = async () => {
    try {
      setLoading(true);
      const data = await api.getCase(params.id as string);
      setCaseData(data);
      // Ek bilgi alanlarını güncelle
      setExtraInfo({
        dahiliNot: data.dahiliNot || "",
        muvekkilNotu: data.muvekkilNotu || "",
        sonDegerlendirmeTarihi: data.sonDegerlendirmeTarihi?.split("T")[0] || "",
      });
      // Raporlama verilerini güncelle
      setReportingData({
        takipTuruId: data.takipTuru?.id || "",
        mahiyetTipiId: data.mahiyetTipi?.id || "",
        riskId: data.risk?.id || "",
        durumEtiketiId: data.durumEtiketi?.id || "",
        borcluTipiId: data.borcluTipi?.id || "",
        sorumluPersonelId: data.sorumluPersonel?.id || "",
      });
    } catch (error) {
      console.error("Takip yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
  };

  // Vekalet kontrolü - müvekkil ve avukat kombinasyonları için
  const checkPoaValidity = async (data: CaseDetail) => {
    if (!data.client?.id || !data.lawyers?.length) {
      setPoaWarnings([]);
      return;
    }

    const warnings: typeof poaWarnings = [];

    for (const lawyerEntry of data.lawyers) {
      if (!lawyerEntry.lawyer?.id) continue;
      
      try {
        const response = await api.get(`/poa/check/valid?clientId=${data.client.id}&lawyerId=${lawyerEntry.lawyer.id}`);
        const result = response.data;
        
        if (!result.isValid) {
          warnings.push({
            clientName: data.client.name,
            lawyerName: `${lawyerEntry.lawyer.name} ${lawyerEntry.lawyer.surname}`,
            message: result.message || "Geçerli vekalet bulunamadı",
          });
        } else if (result.daysRemaining !== undefined && result.daysRemaining <= 30) {
          warnings.push({
            clientName: data.client.name,
            lawyerName: `${lawyerEntry.lawyer.name} ${lawyerEntry.lawyer.surname}`,
            message: `Vekalet ${result.daysRemaining} gün içinde sona erecek`,
          });
        }
      } catch (err) {
        // API hatası - sessizce geç
      }
    }
    
    setPoaWarnings(warnings);
  };

  // Case yüklendiğinde vekalet kontrolü yap
  useEffect(() => {
    if (caseData) {
      checkPoaValidity(caseData);
    }
  }, [caseData?.id]);

  const handleSaveExtraInfo = async () => {
    if (!caseData) return;
    setExtraInfoSaving(true);
    try {
      await api.patch(`/cases/${caseData.id}`, {
        dahiliNot: extraInfo.dahiliNot || null,
        muvekkilNotu: extraInfo.muvekkilNotu || null,
        sonDegerlendirmeTarihi: extraInfo.sonDegerlendirmeTarihi || null,
      });
      fetchCase();
    } catch (error) {
      console.error("Ek bilgi kaydedilemedi:", error);
    } finally {
      setExtraInfoSaving(false);
    }
  };

  const handleSaveReporting = async () => {
    if (!caseData) return;
    setReportingSaving(true);
    try {
      await api.patch(`/cases/${caseData.id}`, {
        takipTuruId: reportingData.takipTuruId || null,
        mahiyetTipiId: reportingData.mahiyetTipiId || null,
        riskId: reportingData.riskId || null,
        durumEtiketiId: reportingData.durumEtiketiId || null,
        borcluTipiId: reportingData.borcluTipiId || null,
        sorumluPersonelId: reportingData.sorumluPersonelId || null,
      });
      setShowReportingPanel(false);
      fetchCase();
    } catch (error) {
      console.error("Raporlama bilgisi kaydedilemedi:", error);
    } finally {
      setReportingSaving(false);
    }
  };

  // Alacak kalemi tipi etiketleri
  const dueTypeLabels: Record<string, string> = {
    PRINCIPAL: "Asıl Alacak",
    INTEREST: "İşleyen Faiz",
    EXPENSE: "Takip Gideri",
    COURT_FEE: "Mahkeme Harcı",
    LAWYER_FEE: "Vekalet Ücreti",
    OTHER: "Diğer",
  };

  // Statü değiştir
  const handleStatusChange = async (newStatus: string) => {
    if (!caseData) return;
    try {
      await api.post(`/case-status/${caseData.id}/change`, { status: newStatus });
      fetchCase();
    } catch (error) {
      console.error("Statü değiştirilemedi:", error);
    }
  };

  // Flag değiştir
  const handleFlagChange = async (flags: any) => {
    if (!caseData) return;
    try {
      await api.patch(`/cases/${caseData.id}`, flags);
      fetchCase();
    } catch (error) {
      console.error("Flag değiştirilemedi:", error);
    }
  };

  // Auto mode toggle
  const handleToggleAutoMode = async () => {
    if (!caseData) return;
    try {
      await api.post(`/automation/cases/${caseData.id}/toggle-auto`);
      fetchCase();
    } catch (error) {
      console.error("Toggle error:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Takip bulunamadı</p>
        <Link href="/cases" className="text-primary hover:underline mt-2 inline-block">
          Takiplere dön
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Genel", icon: FileText },
    { id: "dues", label: "Alacak", icon: DollarSign },
    { id: "notes", label: "Notlar", icon: StickyNote },
    { id: "status", label: "Statü", icon: Activity },
    { id: "groups", label: "Grup", icon: Tag },
    { id: "extra", label: "Ek Bilgi", icon: Info },
    { id: "automation", label: "Oto.", icon: Settings },
    { id: "timeline", label: "Zaman", icon: Clock },
    { id: "documents", label: "Belge", icon: FileText },
    { id: "parties", label: "Taraf", icon: Users },
    { id: "risk", label: "Risk", icon: AlertTriangle },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Link href="/cases" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Takiplere Dön
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowShareModal(true)}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted"
          >
            <Share2 className="h-3 w-3" /> Paylaş
          </button>
          <Link href={`/cases/${caseData.id}/edit`} className="inline-flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-muted">
            <Edit className="h-3 w-3" /> Düzenle
          </Link>
        </div>
      </div>

      {/* Summary Card - Kompakt */}
      <CaseSummaryCard
        fileNumber={caseData.fileNumber}
        formType={caseData.formType?.name || caseTypeLabels[caseData.type]}
        executionPath={caseData.executionPath || "HACIZ"}
        caseStatus={caseData.caseStatus || "DERDEST"}
        isAutomationEnabled={caseData.isAutomationEnabled ?? true}
        hasUyapWarning={caseData.hasUyapWarning ?? !caseData.uyapBirimKodu}
        uyapCode={caseData.uyapBirimKodu}
        riskScore={caseData.riskScore}
        lastAction={caseData.lifecycleEvents?.[0]?.action}
        nextAutoAction={caseData.nextAutoAction}
      />

      {/* Vekalet Uyarı Bandı */}
      {poaWarnings.length > 0 && (
        <div className={`rounded-lg p-3 my-2 ${
          poaWarnings.some(w => w.message.includes("bulunamadı")) 
            ? "bg-red-50 border border-red-200" 
            : "bg-amber-50 border border-amber-200"
        }`}>
          <div className="flex items-start gap-2">
            <FileCheck className={`h-4 w-4 mt-0.5 flex-shrink-0 ${
              poaWarnings.some(w => w.message.includes("bulunamadı")) 
                ? "text-red-600" 
                : "text-amber-600"
            }`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${
                poaWarnings.some(w => w.message.includes("bulunamadı")) 
                  ? "text-red-800" 
                  : "text-amber-800"
              }`}>
                {poaWarnings.some(w => w.message.includes("bulunamadı")) 
                  ? "⚠️ Geçerli Vekalet Yok - UYAP İşlemleri Engellenecek" 
                  : "⏰ Vekalet Süresi Dolmak Üzere"}
              </p>
              <ul className="mt-1 space-y-0.5">
                {poaWarnings.map((warning, idx) => (
                  <li key={idx} className={`text-xs ${
                    warning.message.includes("bulunamadı") 
                      ? "text-red-700" 
                      : "text-amber-700"
                  }`}>
                    • <span className="font-medium">{warning.lawyerName}</span> → {warning.clientName}: {warning.message}
                  </li>
                ))}
              </ul>
            </div>
            <Link
              href="/settings/clients"
              className={`text-xs text-white px-2 py-1 rounded flex-shrink-0 ${
                poaWarnings.some(w => w.message.includes("bulunamadı")) 
                  ? "bg-red-600 hover:bg-red-700" 
                  : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              Vekalet Ekle
            </Link>
          </div>
        </div>
      )}

      {/* Quick Stats - Kompakt */}
      <div className="grid grid-cols-4 gap-2 my-2">
        <div className="bg-white rounded border p-2">
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 text-blue-600" />
            <div>
              <p className="text-[10px] text-muted-foreground">Ana Para</p>
              <p className="text-xs font-semibold">{caseData.principalAmount ? `${Number(caseData.principalAmount).toLocaleString("tr-TR")} ₺` : "-"}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded border p-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-green-600" />
            <div>
              <p className="text-[10px] text-muted-foreground">Tarih</p>
              <p className="text-xs font-semibold">{caseData.caseDate ? new Date(caseData.caseDate).toLocaleDateString("tr-TR") : "-"}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded border p-2">
          <div className="flex items-center gap-1.5">
            <Users className="h-3 w-3 text-purple-600" />
            <div>
              <p className="text-[10px] text-muted-foreground">Borçlu</p>
              <p className="text-xs font-semibold">{caseData.debtors?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded border p-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-orange-600" />
            <div>
              <p className="text-[10px] text-muted-foreground">Kalan Gün</p>
              <p className="text-xs font-semibold">{caseData.daysLeft !== undefined ? `${caseData.daysLeft} gün` : "-"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-0.5 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-2 py-1 border-b-2 -mb-px text-xs ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <tab.icon className="h-3 w-3" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto mt-2">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-3">
            {activeTab === "overview" && (
              <div className="bg-white rounded-lg border p-3 space-y-3">
                <h3 className="text-sm font-semibold">Takip Bilgileri</h3>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Takip No</p><p className="font-medium">{caseData.fileNumber}</p></div>
                  <div><p className="text-muted-foreground">İcra Dosya No</p><p className="font-medium">{caseData.executionFileNumber || "-"}</p></div>
                  <div><p className="text-muted-foreground">Takip Türü</p><p className="font-medium">{caseData.formType?.name || caseTypeLabels[caseData.type]}</p></div>
                  <div><p className="text-muted-foreground">Alt Tür</p><p className="font-medium">{caseData.subType || "-"}</p></div>
                  <div><p className="text-muted-foreground">Faiz Oranı</p><p className="font-medium">{caseData.interestRate ? `%${caseData.interestRate}` : "-"}</p></div>
                  <div><p className="text-muted-foreground">Oluşturulma</p><p className="font-medium">{new Date(caseData.createdAt).toLocaleDateString("tr-TR")}</p></div>
                </div>
                {/* Etiketler */}
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Etiketler</p>
                  <CaseTags caseId={caseData.id} />
                </div>
              </div>
            )}

            {activeTab === "overview" && (
              <div className="bg-white rounded-lg border p-3 space-y-3">
              {/* Risk Sınıfı ve Durum Etiketi */}
              <div className="border-t pt-6">
                <h4 className="font-semibold mb-4">📊 Dosya Durumu</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Risk Sınıfı */}
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <label className="block text-sm font-medium text-amber-800 mb-2">Risk Sınıfı</label>
                    <select
                      value={caseData.risk?.id || ""}
                      onChange={async (e) => {
                        try {
                          await api.patch(`/cases/${caseData.id}`, { riskId: e.target.value || null });
                          fetchCase();
                        } catch (err) { console.error(err); }
                      }}
                      className="w-full rounded-lg border border-amber-300 px-3 py-2 text-sm outline-none focus:border-amber-500 bg-white"
                    >
                      <option value="">Belirsiz</option>
                      {lookups.risk.map((item: any) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    {caseData.risk && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: caseData.risk.color || '#9ca3af' }} />
                        <span className="text-sm font-medium" style={{ color: caseData.risk.color }}>{caseData.risk.name}</span>
                      </div>
                    )}
                  </div>

                  {/* Durum Etiketi */}
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <label className="block text-sm font-medium text-blue-800 mb-2">Durum Etiketi</label>
                    <select
                      value={caseData.durumEtiketi?.id || ""}
                      onChange={async (e) => {
                        try {
                          await api.patch(`/cases/${caseData.id}`, { durumEtiketiId: e.target.value || null });
                          fetchCase();
                        } catch (err) { console.error(err); }
                      }}
                      className="w-full rounded-lg border border-blue-300 px-3 py-2 text-sm outline-none focus:border-blue-500 bg-white"
                    >
                      <option value="">Seçiniz</option>
                      {lookups.durumEtiketi.map((item: any) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    {caseData.durumEtiketi && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: caseData.durumEtiketi.color || '#3b82f6' }} />
                        <span className="text-sm font-medium" style={{ color: caseData.durumEtiketi.color }}>{caseData.durumEtiketi.name}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {caseData.notes && (
                <div>
                  <h4 className="font-medium mb-2">Notlar</h4>
                  <p className="text-muted-foreground">{caseData.notes}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "dues" && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Alacak Kalemleri
                </h3>
              </div>

              {/* Raporlama Özeti Banner */}
              <div 
                onClick={() => setShowReportingPanel(true)}
                className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-purple-600 font-medium mb-1">📊 Raporlama Özeti</p>
                    <p className="font-medium text-purple-900">
                      {caseData.reportingSummary || "Sınıflandırılmamış - Tıklayarak düzenleyin"}
                    </p>
                  </div>
                  <Edit className="h-5 w-5 text-purple-400" />
                </div>
              </div>

              {/* Alacak Kalemleri Tablosu */}
              {caseData.dues && caseData.dues.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 font-medium">Kalem Türü</th>
                        <th className="text-left py-3 px-4 font-medium">Açıklama</th>
                        <th className="text-right py-3 px-4 font-medium">Tutar</th>
                        <th className="text-left py-3 px-4 font-medium">Vade Tarihi</th>
                        <th className="text-left py-3 px-4 font-medium">Raporlama</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caseData.dues.map((due) => (
                        <tr key={due.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              due.type === 'PRINCIPAL' ? 'bg-blue-100 text-blue-700' :
                              due.type === 'INTEREST' ? 'bg-green-100 text-green-700' :
                              due.type === 'EXPENSE' ? 'bg-orange-100 text-orange-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {dueTypeLabels[due.type] || due.type}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-muted-foreground">
                            {due.description || "-"}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {Number(due.amount).toLocaleString("tr-TR")} ₺
                          </td>
                          <td className="py-3 px-4">
                            {new Date(due.dueDate).toLocaleDateString("tr-TR")}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              onClick={() => setShowReportingPanel(true)}
                              className="text-xs text-purple-600 hover:text-purple-800 hover:underline truncate max-w-[200px] block"
                              title={caseData.reportingSummary || "Düzenle"}
                            >
                              {caseData.reportingSummary 
                                ? (caseData.reportingSummary.length > 30 
                                    ? caseData.reportingSummary.substring(0, 30) + "..." 
                                    : caseData.reportingSummary)
                                : "Düzenle →"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-semibold">
                        <td colSpan={2} className="py-3 px-4">Toplam</td>
                        <td className="py-3 px-4 text-right">
                          {caseData.dues.reduce((sum, d) => sum + Number(d.amount), 0).toLocaleString("tr-TR")} ₺
                        </td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 border-2 border-dashed rounded-lg">
                  <DollarSign className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-muted-foreground">Henüz alacak kalemi eklenmemiş</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Takip oluştururken alacak kalemleri ekleyebilirsiniz
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === "notes" && (
            <CaseNotes caseId={caseData.id} />
          )}

          {activeTab === "status" && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold mb-4">Statü Değiştir</h3>
              <StatusCards
                currentStatus={caseData.caseStatus || "DERDEST"}
                onStatusChange={handleStatusChange}
              />
            </div>
          )}

          {activeTab === "groups" && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Dosya Grupları
                </h3>
                <button
                  onClick={() => setShowNewGroupModal(true)}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" /> Yeni Grup Oluştur
                </button>
              </div>

              {/* Mevcut Gruplar */}
              <div>
                <h4 className="text-sm font-medium mb-2">Bu Dosyanın Grupları</h4>
                {caseGroups.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-4 text-center border-2 border-dashed rounded-lg">
                    Bu dosya henüz bir gruba eklenmedi
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {caseGroups.map((cg: any) => (
                      <span
                        key={cg.id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium"
                        style={{ backgroundColor: `${cg.group?.color || '#3b82f6'}20`, color: cg.group?.color || '#3b82f6' }}
                      >
                        {cg.group?.name}
                        <button
                          onClick={() => handleRemoveGroup(cg.group?.id)}
                          className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Grup Ekle */}
              <div>
                <h4 className="text-sm font-medium mb-2">Gruba Ekle</h4>
                <div className="flex flex-wrap gap-2">
                  {allGroups
                    .filter((g: any) => !caseGroups.find((cg: any) => cg.group?.id === g.id))
                    .map((group: any) => (
                      <button
                        key={group.id}
                        onClick={() => handleAddGroup(group.id)}
                        className="px-3 py-1.5 text-sm border rounded-full hover:bg-gray-50 flex items-center gap-1"
                        style={{ borderColor: group.color || '#e5e7eb' }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: group.color || '#3b82f6' }} />
                        {group.name}
                        {group._count?.caseGroups !== undefined && (
                          <span className="text-xs text-muted-foreground">({group._count.caseGroups})</span>
                        )}
                      </button>
                    ))}
                  {allGroups.filter((g: any) => !caseGroups.find((cg: any) => cg.group?.id === g.id)).length === 0 && (
                    <p className="text-sm text-muted-foreground">Tüm gruplara eklenmiş</p>
                  )}
                </div>
              </div>

              {/* Yeni Grup Modal */}
              {showNewGroupModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl p-6 w-full max-w-md">
                    <h3 className="font-semibold mb-4">Yeni Grup Oluştur</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Grup Adı *</label>
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="Ör: Stratejik Dosyalar"
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Açıklama</label>
                        <textarea
                          value={newGroupDescription}
                          onChange={(e) => setNewGroupDescription(e.target.value)}
                          placeholder="Grup açıklaması..."
                          rows={2}
                          className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Renk</label>
                        <div className="flex gap-2">
                          {['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'].map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setNewGroupColor(color)}
                              className={`w-8 h-8 rounded-full border-2 ${newGroupColor === color ? 'border-gray-900' : 'border-transparent'}`}
                              style={{ backgroundColor: color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                      <button
                        onClick={() => setShowNewGroupModal(false)}
                        className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                      >
                        İptal
                      </button>
                      <button
                        onClick={handleCreateGroup}
                        disabled={!newGroupName.trim()}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                      >
                        Oluştur
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "extra" && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Ek Bilgiler
                </h3>
                <button
                  onClick={handleSaveExtraInfo}
                  disabled={extraInfoSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {extraInfoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Kaydet
                </button>
              </div>

              {/* Sınıflandırma Bilgileri (Sadece Görüntüleme) */}
              <div className="p-4 bg-purple-50 rounded-lg">
                <h4 className="text-sm font-semibold mb-3 text-purple-800">📊 Sınıflandırma Bilgileri</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-purple-600">Takip Türü:</span>
                    <p className="font-medium">{caseData.takipTuru?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-purple-600">Aşama:</span>
                    <p className="font-medium">{caseData.asama?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-purple-600">Risk:</span>
                    <p className="font-medium" style={{ color: caseData.risk?.color }}>{caseData.risk?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-purple-600">Borçlu Tipi:</span>
                    <p className="font-medium">{caseData.borcluTipi?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-purple-600">Durum Etiketi:</span>
                    <p className="font-medium" style={{ color: caseData.durumEtiketi?.color }}>{caseData.durumEtiketi?.name || "-"}</p>
                  </div>
                  <div>
                    <span className="text-purple-600">Sorumlu:</span>
                    <p className="font-medium">{caseData.sorumluPersonel ? `${caseData.sorumluPersonel.name} ${caseData.sorumluPersonel.surname}` : "-"}</p>
                  </div>
                </div>
              </div>

              {/* Notlar */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Dahili Not <span className="text-xs text-muted-foreground">(Müvekkile gitmez)</span>
                  </label>
                  <textarea
                    value={extraInfo.dahiliNot}
                    onChange={(e) => setExtraInfo({ ...extraInfo, dahiliNot: e.target.value })}
                    rows={3}
                    placeholder="Sadece büro içi görünür notlar..."
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Müvekkil Notu <span className="text-xs text-muted-foreground">(Raporlarda görünür)</span>
                  </label>
                  <textarea
                    value={extraInfo.muvekkilNotu}
                    onChange={(e) => setExtraInfo({ ...extraInfo, muvekkilNotu: e.target.value })}
                    rows={3}
                    placeholder="Müvekkile gösterilebilir notlar..."
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary resize-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Son Değerlendirme Tarihi</label>
                  <input
                    type="date"
                    value={extraInfo.sonDegerlendirmeTarihi}
                    onChange={(e) => setExtraInfo({ ...extraInfo, sonDegerlendirmeTarihi: e.target.value })}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "automation" && (
            <AutomationPanel
              isAutomationEnabled={caseData.isAutomationEnabled ?? true}
              isAutoMode={caseData.isAutoMode ?? false}
              daysLeft={caseData.daysLeft}
              nextAutoAction={caseData.nextAutoAction}
              nextActionAt={caseData.nextActionAt}
              automationConfig={caseData.automationConfig}
              onToggleAutoMode={handleToggleAutoMode}
            />
          )}

          {activeTab === "timeline" && (
            <CaseTimeline
              currentStage={caseData.workflowStage || "INITIAL"}
              events={caseData.lifecycleEvents || []}
              caseCreatedAt={caseData.createdAt}
            />
          )}

          {activeTab === "documents" && (
            <DocumentGenerator
              caseId={caseData.id}
              hasArticle4Request={caseData.hasArticle4Request ?? false}
              subCategory={caseData.subCategory || "GENEL"}
              currency={caseData.currency || "TRY"}
              onArticle4Change={(value) => handleFlagChange({ hasArticle4Request: value })}
            />
          )}

          {activeTab === "parties" && (
            <div className="space-y-6">
              {/* Alacaklı */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Alacaklı (Müvekkil)
                </h3>
                {caseData.client ? (
                  <div className="border rounded-lg p-4">
                    <p className="font-medium">{caseData.client.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {caseData.client.type === "INDIVIDUAL" ? "Gerçek Kişi" : "Tüzel Kişi"}
                      {caseData.client.identityNo && ` • ${caseData.client.identityNo}`}
                    </p>
                    {caseData.client.phone && (
                      <p className="text-sm mt-1">📞 {caseData.client.phone}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Alacaklı bilgisi yok</p>
                )}
              </div>

              {/* Avukatlar */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Scale className="h-5 w-5" />
                  Yetkili Avukatlar
                </h3>
                {caseData.lawyers && caseData.lawyers.length > 0 ? (
                  <div className="space-y-2">
                    {caseData.lawyers.map((l) => (
                      <div key={l.id} className="border rounded-lg p-4 flex items-center justify-between">
                        <div>
                          <p className="font-medium">
                            {(l.lawyer as any).displayName || `Av. ${l.lawyer.name} ${l.lawyer.surname}`}
                          </p>
                          {l.lawyer.barNumber && (
                            <p className="text-sm text-muted-foreground">
                              Baro Sicil: {l.lawyer.barNumber}
                            </p>
                          )}
                        </div>
                        {l.canSign && <Badge variant="success">İmza Yetkili</Badge>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Avukat bilgisi yok</p>
                )}
              </div>

              {/* Borçlular */}
              <div className="bg-white rounded-xl border p-6">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Borçlular
                </h3>
                {caseData.debtors && caseData.debtors.length > 0 ? (
                  <div className="space-y-2">
                    {caseData.debtors.map((d) => (
                      <div key={d.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{d.debtor.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {d.debtor.type === "INDIVIDUAL" ? "Gerçek Kişi" : "Tüzel Kişi"}
                              {d.debtor.identityNo && ` • ${d.debtor.identityNo}`}
                            </p>
                          </div>
                          <Badge>{d.role === "DEBTOR" ? "Borçlu" : d.role}</Badge>
                        </div>
                        {d.debtor.phone && (
                          <p className="text-sm mt-2">📞 {d.debtor.phone}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">Borçlu bilgisi yok</p>
                )}
              </div>
            </div>
          )}

          {activeTab === "risk" && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <h3 className="font-semibold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Risk Analizi
              </h3>

              {/* Risk Sınıfı Güncelleme */}
              <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
                <h4 className="font-medium flex items-center gap-2 mb-4">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Risk Sınıfı Belirleme
                </h4>
                <p className="text-sm text-amber-700 mb-4">
                  Risk durumu dosya açıldıktan sonra mal varlığı, maaş haczi imkanı, taahhüt durumu, karşılıksız çek cezası gibi faktörlere göre manuel belirlenir.
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {lookups.risk.map((risk: any) => (
                    <button
                      key={risk.id}
                      onClick={async () => {
                        try {
                          await api.patch(`/cases/${caseData.id}`, { riskId: risk.id });
                          fetchCase();
                        } catch (e) { console.error(e); }
                      }}
                      className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                        caseData.risk?.id === risk.id 
                          ? 'border-amber-500 bg-white shadow-md' 
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: risk.color || '#9ca3af' }}
                        />
                        <div className="text-left">
                          <p className="font-medium">{risk.name}</p>
                          <p className="text-xs text-muted-foreground">{risk.description}</p>
                        </div>
                      </div>
                      {caseData.risk?.id === risk.id && (
                        <span className="text-amber-600 text-sm font-medium">✓ Seçili</span>
                      )}
                    </button>
                  ))}
                  {/* Belirsiz seçeneği */}
                  <button
                    onClick={async () => {
                      try {
                        await api.patch(`/cases/${caseData.id}`, { riskId: null });
                        fetchCase();
                      } catch (e) { console.error(e); }
                    }}
                    className={`flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      !caseData.risk?.id 
                        ? 'border-amber-500 bg-white shadow-md' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-4 h-4 rounded-full bg-gray-400" />
                      <div className="text-left">
                        <p className="font-medium">Belirsiz</p>
                        <p className="text-xs text-muted-foreground">Henüz değerlendirilmedi</p>
                      </div>
                    </div>
                    {!caseData.risk?.id && (
                      <span className="text-amber-600 text-sm font-medium">✓ Seçili</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Risk Skoru */}
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-lg font-medium">Genel Risk Skoru</span>
                  <span className={`text-3xl font-bold ${
                    (caseData.riskScore || 0) < 30 ? 'text-green-600' :
                    (caseData.riskScore || 0) < 60 ? 'text-yellow-600' :
                    (caseData.riskScore || 0) < 80 ? 'text-orange-600' : 'text-red-600'
                  }`}>
                    {caseData.riskScore || 0}/100
                  </span>
                </div>
                <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      (caseData.riskScore || 0) < 30 ? 'bg-green-500' :
                      (caseData.riskScore || 0) < 60 ? 'bg-yellow-500' :
                      (caseData.riskScore || 0) < 80 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${caseData.riskScore || 0}%` }}
                  />
                </div>
              </div>

              {/* AI Analizi */}
              <div className="bg-indigo-50 rounded-xl p-6">
                <h4 className="font-medium flex items-center gap-2 mb-4">
                  <Brain className="h-5 w-5 text-indigo-600" />
                  AI Önerileri
                </h4>
                <button 
                  onClick={handleAiAnalysis}
                  className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Brain className="h-4 w-4" />
                  AI Analizi Yap
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <CaseFlagsPanel
            isArchived={caseData.isArchived ?? false}
            showToClient={caseData.showToClient ?? true}
            allowUyapActions={caseData.allowUyapActions ?? true}
            onFlagChange={handleFlagChange}
          />
        </div>
      </div>
    </div>

      {/* Raporlama Düzenleme Paneli */}
      {showReportingPanel && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                📊 Raporlama Bilgileri
              </h3>
              <button
                onClick={() => setShowReportingPanel(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Takip Türü */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Takip Türü <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportingData.takipTuruId}
                  onChange={(e) => setReportingData({ ...reportingData, takipTuruId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.takipTuru.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {/* Mahiyet Tipi */}
              <div>
                <label className="block text-sm font-medium mb-1">Mahiyet Tipi (Alacak Türü)</label>
                <select
                  value={reportingData.mahiyetTipiId}
                  onChange={(e) => setReportingData({ ...reportingData, mahiyetTipiId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.mahiyetTipi.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {/* Risk Sınıfı */}
              <div>
                <label className="block text-sm font-medium mb-1">Risk Sınıfı</label>
                <select
                  value={reportingData.riskId}
                  onChange={(e) => setReportingData({ ...reportingData, riskId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.risk.map((item: any) => (
                    <option key={item.id} value={item.id} style={{ color: item.color }}>{item.name}</option>
                  ))}
                </select>
              </div>

              {/* Durum Etiketi */}
              <div>
                <label className="block text-sm font-medium mb-1">Durum Etiketi</label>
                <select
                  value={reportingData.durumEtiketiId}
                  onChange={(e) => setReportingData({ ...reportingData, durumEtiketiId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.durumEtiketi.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {/* Borçlu Tipi */}
              <div>
                <label className="block text-sm font-medium mb-1">Borçlu Tipi</label>
                <select
                  value={reportingData.borcluTipiId}
                  onChange={(e) => setReportingData({ ...reportingData, borcluTipiId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.borcluTipi.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>

              {/* Sorumlu Personel */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Sorumlu Personel <span className="text-red-500">*</span>
                </label>
                <select
                  value={reportingData.sorumluPersonelId}
                  onChange={(e) => setReportingData({ ...reportingData, sorumluPersonelId: e.target.value })}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Seçiniz...</option>
                  {lookups.users.map((user: any) => (
                    <option key={user.id} value={user.id}>{user.name} {user.surname}</option>
                  ))}
                </select>
              </div>

              {/* Mevcut Gruplar */}
              {caseGroups.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-muted-foreground mb-2">Gruplar:</p>
                  <div className="flex flex-wrap gap-1">
                    {caseGroups.map((cg: any) => (
                      <span
                        key={cg.id}
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: `${cg.group?.color || '#3b82f6'}20`, color: cg.group?.color || '#3b82f6' }}
                      >
                        {cg.group?.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
              <button
                onClick={() => setShowReportingPanel(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                İptal
              </button>
              <button
                onClick={handleSaveReporting}
                disabled={reportingSaving}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
              >
                {reportingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestions Modal */}
      <AiSuggestionsModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        suggestions={aiSuggestions}
        prediction={aiPrediction}
        loading={aiLoading}
        error={aiError}
        caseFileNumber={caseData.fileNumber}
      />

      {/* Share Case Modal */}
      <ShareCaseModal
        caseId={caseData.id}
        fileNumber={caseData.fileNumber}
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />
    </div>
  );
}
