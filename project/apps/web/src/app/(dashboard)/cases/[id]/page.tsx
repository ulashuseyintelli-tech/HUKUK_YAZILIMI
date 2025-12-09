"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
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

const statusLabels: Record<string, string> = {
  ACTIVE: "Aktif",
  CLOSED: "Kapalı",
  SUSPENDED: "Askıda",
  ARCHIVED: "Arşiv",
};

const statusColors: Record<string, "default" | "success" | "warning" | "destructive"> = {
  ACTIVE: "success",
  CLOSED: "default",
  SUSPENDED: "warning",
  ARCHIVED: "default",
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
  formType?: { id: string; name: string; code: string };
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
  const router = useRouter();
  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  
  // AI Modal state
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<any[]>([]);
  const [aiPrediction, setAiPrediction] = useState<any>(null);

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
    }
  }, [params.id]);

  const fetchCase = async () => {
    try {
      setLoading(true);
      const data = await api.getCase(params.id as string);
      setCaseData(data);
    } catch (error) {
      console.error("Takip yüklenemedi:", error);
    } finally {
      setLoading(false);
    }
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
    { id: "overview", label: "Genel Bilgiler", icon: FileText },
    { id: "status", label: "Statü", icon: Activity },
    { id: "automation", label: "Otomasyon", icon: Settings },
    { id: "timeline", label: "Zaman Çizelgesi", icon: Clock },
    { id: "documents", label: "Belgeler", icon: FileText },
    { id: "parties", label: "Taraflar", icon: Users },
    { id: "risk", label: "Risk Analizi", icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/cases"
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Takiplere Dön
          </Link>
        </div>
        <Link
          href={`/cases/${caseData.id}/edit`}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-muted"
        >
          <Edit className="h-4 w-4" />
          Düzenle
        </Link>
      </div>

      {/* Summary Card (E.26-27) */}
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

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ana Para</p>
              <p className="text-lg font-semibold">
                {caseData.principalAmount
                  ? `${Number(caseData.principalAmount).toLocaleString("tr-TR")} ₺`
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Takip Tarihi</p>
              <p className="text-lg font-semibold">
                {caseData.caseDate
                  ? new Date(caseData.caseDate).toLocaleDateString("tr-TR")
                  : "-"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Borçlu Sayısı</p>
              <p className="text-lg font-semibold">{caseData.debtors?.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kalan Gün</p>
              <p className="text-lg font-semibold">
                {caseData.daysLeft !== undefined ? `${caseData.daysLeft} gün` : "-"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 -mb-px transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {activeTab === "overview" && (
            <div className="bg-white rounded-xl border p-6 space-y-6">
              <h3 className="font-semibold">Takip Bilgileri</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Takip No</p>
                  <p className="font-medium">{caseData.fileNumber}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">İcra Dosya No</p>
                  <p className="font-medium">{caseData.executionFileNumber || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Takip Türü</p>
                  <p className="font-medium">{caseData.formType?.name || caseTypeLabels[caseData.type]}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alt Tür</p>
                  <p className="font-medium">{caseData.subType || "-"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Faiz Oranı</p>
                  <p className="font-medium">
                    {caseData.interestRate ? `%${caseData.interestRate}` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Oluşturulma</p>
                  <p className="font-medium">
                    {new Date(caseData.createdAt).toLocaleDateString("tr-TR")}
                  </p>
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

          {activeTab === "status" && (
            <div className="bg-white rounded-xl border p-6">
              <h3 className="font-semibold mb-4">Statü Değiştir</h3>
              <StatusCards
                currentStatus={caseData.caseStatus || "DERDEST"}
                onStatusChange={handleStatusChange}
              />
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
                            {l.lawyer.name} {l.lawyer.surname}
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
    </div>
  );
}
