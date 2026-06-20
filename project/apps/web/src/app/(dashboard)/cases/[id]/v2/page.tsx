"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Edit,
  Share2,
  Trash2,
  Copy,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  User,
  Shield,
  ChevronRight,
  Plus,
  FileText,
  Receipt,
  Database,
  History,
  FolderOpen,
  MessageSquare,
  ListTodo,
  CreditCard,
  Users,
  Banknote,
} from "lucide-react";
import { api, DebtorListItemDTO, CaseDebtorsResponse } from "@/lib/api";
import { DebtorDetailDrawer } from "@/components/debtor";

// ============================================
// TYPES
// ============================================

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
  currency?: string;
  uyapBirimKodu?: string;
  createdAt: string;
  workflowStage?: string;
  subCategory?: string;
  lastEnforcementActionAt?: string;
  executionOffice?: {
    id: string;
    name: string;
    city: string;
    uyapCode?: string;
    bankName?: string;
    iban?: string;
  };
  caseClients?: {
    id: string;
    role?: string;
    client: {
      id: string;
      name: string;
      displayName?: string;
      type?: "INDIVIDUAL" | "COMPANY" | "PUBLIC";
    };
  }[];
  lawyers?: {
    id: string;
    canSign: boolean;
    role?: "RESPONSIBLE" | "ASSIGNED" | "ASSISTANT" | "INTERN";
    lawyer: {
      id: string;
      name: string;
      surname: string;
      lawyerRank?: "PARTNER" | "MANAGER" | "AUTHORIZED" | "LAWYER" | "INTERN";
    };
  }[];
  staff?: {
    id: string;
    roleOnCase?: string;
    staffMember: {
      id: string;
      firstName: string;
      lastName: string;
      staffType?: string;
    };
  }[];
  claimItems?: any[];
  formType?: { id: string; name: string; code: string };
}

// ============================================
// HELPERS
// ============================================

const caseTypeShort: Record<string, string> = {
  GENERAL_EXECUTION: "Genel Haciz",
  MORTGAGE: "İpotekli",
  PLEDGE: "Rehinli",
  CHECK: "Çek (Kambiyo)",
  BOND: "Senet (Kambiyo)",
  RENTAL: "Kira",
  BANKRUPTCY: "İflas",
  OTHER: "Diğer",
};

const formatCurrency = (amount: number, currency = "TRY") => {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount) + " ₺";
};

const formatDate = (date?: string) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("tr-TR");
};

const calculateDays = (date?: string, baseDate?: string) => {
  const base = baseDate ? new Date(baseDate) : new Date();
  const target = date ? new Date(date) : new Date();
  const diff = Math.floor((base.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  return Math.abs(diff);
};

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function CaseDetailV2Page() {
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debtors, setDebtors] = useState<DebtorListItemDTO[]>([]);
  const [selectedDebtorId, setSelectedDebtorId] = useState<string | null>(null);
  const [isDebtorDrawerOpen, setIsDebtorDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  const fetchCaseData = useCallback(async () => {
    if (!caseId) return;
    try {
      setLoading(true);
      const data = await api.getCase(caseId);
      setCaseData(data);
    } catch (err: any) {
      setError(err.message || "Dosya yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const fetchDebtors = useCallback(async () => {
    if (!caseId) return;
    try {
      const response: CaseDebtorsResponse = await api.getCaseDebtors(caseId, { includePassive: true });
      setDebtors(response.items);
    } catch (err) {
      console.error("Borçlular yüklenirken hata:", err);
    }
  }, [caseId]);

  useEffect(() => {
    fetchCaseData();
    fetchDebtors();
  }, [fetchCaseData, fetchDebtors]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !caseData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-red-600">{error || "Dosya bulunamadı"}</p>
      </div>
    );
  }

  const daysSinceStart = calculateDays(caseData.caseDate);
  const remainingDays = 365 - calculateDays(caseData.lastEnforcementActionAt || caseData.caseDate);
  const isUyapConnected = !!caseData.uyapBirimKodu;

  // Finance calculations (mock for now)
  const finance = {
    genelAlacak: caseData.principalAmount || 50000,
    takipTutari: 50000,
    basvuruHarci: 615.44,
    vekaletHarci: 87.30,
    pesinHarc: 250,
    dusukHarc: 2,
    tebligatUcreti: 138,
    vekaletPulu: 10,
    icraMasraflari: 1307.96,
    pesinHarcDahilTahsilHarci: 2325.41,
    pesinHarcHaricTahsilHarci: 2704.03,
    vekaletUcreti: 11000,
    takipSonrasiFaiz: 0,
    toplamBorcTutari: 62307.96,
    sonBorcTutari: 64421.93,
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* ========== TOP HEADER BAR (Green) ========== */}
      <div className="bg-emerald-600 text-white px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/cases" className="p-1 hover:bg-emerald-700 rounded">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <span className="font-semibold">Takip: {caseData.fileNumber}</span>
            <span className="px-2 py-0.5 bg-emerald-500 rounded text-xs font-medium">
              {caseData.caseStatus}
            </span>
            <span className="text-emerald-200 text-sm">
              {caseTypeShort[caseData.type] || caseData.type}
              {caseData.formType && ` • ${caseData.formType.code}`}
            </span>
            <span className="text-emerald-200 text-sm">
              {caseData.executionOffice?.name || "İcra Dairesi Seçilmedi"}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-sm">
              <div className={`w-2 h-2 rounded-full ${isUyapConnected ? "bg-white" : "bg-red-400"}`} />
              <span>UYAP: {isUyapConnected ? "Bağlı" : "Bağlı Değil"}</span>
            </div>
            <span className="text-sm">Son İşlem: {daysSinceStart} gün</span>
            <span className={`text-sm ${remainingDays < 60 ? "text-red-300 font-medium" : ""}`}>
              Kalan: {remainingDays} gün
            </span>
            <span className="px-2 py-1 bg-emerald-500 rounded text-xs">
              {caseTypeShort[caseData.type]}
            </span>
            
            {/* Action Buttons */}
            <button className="flex items-center gap-1 px-3 py-1.5 bg-green-500 hover:bg-green-400 rounded text-sm font-medium">
              <Banknote className="w-4 h-4" /> Ödeme
            </button>
            <button className="p-1.5 hover:bg-emerald-700 rounded">
              <Edit className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-emerald-700 rounded">
              <Share2 className="w-4 h-4" />
            </button>
            <button className="p-1.5 hover:bg-emerald-700 rounded">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========== SECOND ROW: 3 Columns ========== */}
      <div className="grid grid-cols-12 gap-4 p-4">
        {/* LEFT: İcra Dosya Bilgileri */}
        <div className="col-span-4 bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-emerald-600 font-medium mb-2">İCRA MERCİİ & ENTEGRASYON</div>
          
          {/* İcra Dosya No */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase">İcra Dosya No</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                value={caseData.executionFileNumber || ""}
                readOnly
                className="flex-1 px-3 py-2 border border-emerald-300 rounded bg-emerald-50 text-emerald-700 font-mono"
              />
              <button className="p-2 border rounded hover:bg-slate-50">
                <Copy className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* İcra Dairesi */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase">İcra Dairesi</label>
            <div className="text-sm font-medium text-slate-700 mt-1">
              {caseData.executionOffice?.name || "-"}
            </div>
          </div>

          {/* UYAP */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase">UYAP</label>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-1 rounded text-xs ${isUyapConnected ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                {isUyapConnected ? `Bağlı (${caseData.uyapBirimKodu})` : "Bağlı Değil"}
              </span>
              {!isUyapConnected && (
                <button className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                  UYAP'a Gönder
                </button>
              )}
            </div>
          </div>

          {/* Banka */}
          <div className="mb-3">
            <label className="text-[10px] text-slate-500 uppercase">Banka</label>
            <div className="text-sm text-slate-700 mt-1">
              {caseData.executionOffice?.bankName || "T. Vakıflar Bankası T.A.O."}
            </div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">
              {caseData.executionOffice?.iban || "TR..."}
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button className="text-xs text-blue-600 hover:underline">Asal</button>
            <button className="text-xs text-blue-600 hover:underline">UYAP</button>
            <button className="text-xs text-blue-600 hover:underline">Banka</button>
            <button className="text-xs text-blue-600 hover:underline">Güncel</button>
          </div>
        </div>

        {/* CENTER: Tarihler ve Durum */}
        <div className="col-span-3 bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 font-medium mb-3">TARİHLER ve DURUM</div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Açılış</div>
              <div className="text-lg font-semibold text-slate-800">{formatDate(caseData.caseDate)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Geçen</div>
              <div className="text-lg font-semibold text-amber-600">{daysSinceStart}<span className="text-xs ml-1">gün</span></div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase">Kalan</div>
              <div className={`text-lg font-semibold ${remainingDays < 60 ? "text-red-600" : "text-emerald-600"}`}>
                {remainingDays}<span className="text-xs ml-1">gün</span>
              </div>
              <div className="text-[10px] text-slate-400">Güvenli</div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Son İşlem</span>
              <span className="text-slate-700">{formatDate(caseData.lastEnforcementActionAt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Statü</span>
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs font-medium">
                {caseData.caseStatus}
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: Hesap Özeti */}
        <div className="col-span-5 bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 bg-blue-600 text-white">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold">Hesap Özeti</div>
              <div className="text-[10px] opacity-80">
                {formatDate(caseData.caseDate)} → Hesap: {formatDate(new Date().toISOString())}
              </div>
            </div>
          </div>

          <div className="p-4 space-y-1 text-xs">
            {/* ═══════════ ALACAK KALEMLERİ ═══════════ */}
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-500 uppercase font-medium mb-1">Alacak Kalemleri</p>
              <div className="flex justify-between py-0.5">
                <span className="text-slate-600">Genel Alacak</span>
                <span className="font-medium">{formatCurrency(finance.genelAlacak)}</span>
              </div>
            </div>

            {/* ═══════════ TAKİP TUTARI ═══════════ */}
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1.5 border-t-2 border-blue-300 bg-blue-50 rounded">
              <span className="font-semibold text-blue-800">TAKİP TUTARI</span>
              <span className="font-bold text-blue-700">{formatCurrency(finance.takipTutari)}</span>
            </div>

            {/* ═══════════ İCRA MASRAFLARI ═══════════ */}
            <div className="space-y-0.5 mt-2">
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Başvuru Harcı</span>
                <span>{formatCurrency(finance.basvuruHarci)}</span>
              </div>
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Vekalet Harcı</span>
                <span>{formatCurrency(finance.vekaletHarci)}</span>
              </div>
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Peşin Harç</span>
                <span>{formatCurrency(finance.pesinHarc)}</span>
              </div>
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Düşük Harç</span>
                <span>{formatCurrency(finance.dusukHarc)}</span>
              </div>
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Tebligat Ücreti ({debtors.length} borçlu)</span>
                <span>{formatCurrency(finance.tebligatUcreti)}</span>
              </div>
              <div className="flex justify-between py-0.5 pl-2">
                <span className="text-slate-500">Vekalet Pulu</span>
                <span>{formatCurrency(finance.vekaletPulu)}</span>
              </div>
            </div>

            {/* İcra Masrafları Toplamı */}
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-1 border-t border-slate-300 bg-slate-100 rounded">
              <span className="font-semibold text-slate-700">İCRA MASRAFLARI</span>
              <span className="font-semibold text-slate-700">{formatCurrency(finance.icraMasraflari)}</span>
            </div>

            {/* ═══════════ DİĞER KALEMLER ═══════════ */}
            <div className="space-y-0.5 mt-2">
              <div className="flex justify-between py-0.5 border-t border-slate-200 pt-1">
                <span className="text-slate-600">Vekalet Ücreti</span>
                <span className="font-medium">{formatCurrency(finance.vekaletUcreti)}</span>
              </div>
              <div className="flex justify-between py-0.5 text-orange-600">
                <span>Takip Sonrası Faiz</span>
                <span className="font-medium">+{formatCurrency(finance.takipSonrasiFaiz)}</span>
              </div>
            </div>

            {/* ═══════════ TOPLAM BORÇ ═══════════ */}
            <div className="flex justify-between py-1.5 px-2 -mx-2 mt-2 border-t-2 border-blue-400 bg-blue-100 rounded">
              <span className="font-bold text-blue-900">TOPLAM BORÇ</span>
              <span className="font-bold text-blue-800">{formatCurrency(finance.toplamBorcTutari)}</span>
            </div>

            {/* ═══════════ SON BORÇ ═══════════ */}
            <div className="flex justify-between py-2 px-2 -mx-2 mt-2 border-t-2 border-green-400 bg-green-100 rounded">
              <span className="font-bold text-green-900">SON BORÇ</span>
              <span className="font-bold text-lg text-green-700">{formatCurrency(finance.sonBorcTutari)}</span>
            </div>

            {/* ═══════════ TAHSİL ORANLARI ═══════════ */}
            <div className="mt-3 pt-3 border-t-2 border-slate-400">
              <div className="text-[10px] text-slate-500 font-medium mb-1">Tahsil Harcı Oranlarına Göre Son Borç</div>
              <div className="grid grid-cols-5 gap-2 text-[10px]">
                {[0, 2.27, 4.55, 9.10, 11.38].map((rate, i) => (
                  <div key={i} className="text-center">
                    <div className="text-slate-400">%{rate}</div>
                    <div className="font-medium text-slate-600">{formatCurrency(finance.sonBorcTutari * (1 + rate/100))}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========== THIRD ROW: Dosya Tarafları ========== */}
      <div className="grid grid-cols-12 gap-4 px-4">
        {/* Dosya Ekibi */}
        <div className="col-span-3 bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">DOSYA TARAFLARI</span>
            <button className="text-xs text-blue-600 hover:underline">+ Ekle</button>
          </div>
          
          <div className="mb-3">
            <div className="text-[10px] text-slate-400 uppercase mb-1">Dosya Ekibi</div>
            <div className="text-[10px] text-emerald-600 font-medium mb-1">YETKİLİ AVUKATLAR</div>
            <div className="space-y-1">
              {caseData.lawyers?.filter(l => l.canSign).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Av. {l.lawyer.name} {l.lawyer.surname}</span>
                  <div className="flex gap-1">
                    <span className="text-blue-600 hover:underline cursor-pointer">Disk</span>
                    <span className="text-blue-600 hover:underline cursor-pointer">İmza</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="text-[10px] text-slate-400 uppercase mb-1">DİĞER AVUKATLAR</div>
            <div className="space-y-1">
              {caseData.lawyers?.filter(l => !l.canSign).map((l) => (
                <div key={l.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">Av. {l.lawyer.name} {l.lawyer.surname}</span>
                  <div className="flex gap-1">
                    <span className="text-amber-600">yetki</span>
                    <span className="text-blue-600 hover:underline cursor-pointer">İmza</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-slate-400 uppercase mb-1">YETKİLİ PERSONEL</div>
            <div className="space-y-1">
              {caseData.staff?.map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">{s.staffMember.firstName} {s.staffMember.lastName}</span>
                  <span className="text-slate-400">{s.roleOnCase || "OFİS KATİBİ"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Müvekkiller */}
        <div className="col-span-3 bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500 font-medium">Müvekkiller</span>
            <button className="text-xs text-blue-600 hover:underline">+ Ekle</button>
          </div>
          
          <div className="space-y-2">
            {caseData.caseClients?.map((c) => (
              <div key={c.id} className="p-2 bg-slate-50 rounded">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                    {c.client.type === "COMPANY" ? (
                      <Building2 className="w-3 h-3 text-purple-600" />
                    ) : (
                      <User className="w-3 h-3 text-purple-600" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      {c.client.displayName || c.client.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      T: {c.client.type === "COMPANY" ? "VKN" : "TCKN"} gizli
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(!caseData.caseClients || caseData.caseClients.length === 0) && (
              <div className="text-xs text-slate-400 text-center py-4">Müvekkil yok</div>
            )}
          </div>
        </div>

        {/* Borçlular */}
        <div className="col-span-6 bg-white rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Borçlular</span>
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded">
                {debtors.length} Borçlu
              </span>
              <span className="text-[10px] text-slate-400">
                {debtors.filter(d => d.serviceStatus === "DELIVERED").length} tebliğ edildi
              </span>
              <span className="text-[10px] text-slate-400">
                {debtors.filter(d => d.alertCount > 0).length} Riskli
              </span>
            </div>
            <button className="text-xs text-blue-600 hover:underline">+ Ekle</button>
          </div>

          <div className="space-y-2">
            {debtors.map((d) => {
              const isFinalized = d.serviceStatus === "FINALIZED";
              const isDelivered = d.serviceStatus === "DELIVERED";
              const isPending = d.serviceStatus === "NOT_STARTED" || d.serviceStatus === "READY" || d.serviceStatus === "SENT";
              
              return (
                <button
                  key={d.caseDebtorId}
                  onClick={() => {
                    setSelectedDebtorId(d.caseDebtorId);
                    setIsDebtorDrawerOpen(true);
                  }}
                  className="w-full text-left p-2 rounded border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                        isFinalized ? "bg-emerald-100" : isDelivered ? "bg-blue-100" : "bg-amber-100"
                      }`}>
                        {isFinalized ? (
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Clock className="w-3 h-3 text-amber-600" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                          <span>{d.displayName}</span>
                          {d.lifecycleStatus === "PASSIVE" && (
                            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 text-[9px] rounded">Pasif</span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">{d.role}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isFinalized && (
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Kesinleşti
                          {d.deliveredAt && <span className="text-emerald-500">— {formatDate(d.deliveredAt)}</span>}
                        </span>
                      )}
                      {isPending && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Tebliğ Bekleniyor
                        </span>
                      )}
                      {d.alertCount > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {d.alertCount}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                </button>
              );
            })}
            {debtors.length === 0 && (
              <div className="text-xs text-slate-400 text-center py-4">Borçlu yok</div>
            )}
          </div>
        </div>
      </div>

      {/* ========== ACCORDION TABS ========== */}
      <div className="mt-4 mx-4 bg-white rounded-lg border border-slate-200">
        {/* Tab Headers */}
        <div className="flex flex-wrap border-b border-slate-200">
          {[
            { id: "notes", label: "Notlar", icon: FileText },
            { id: "expenses", label: "Masraflar", icon: Receipt },
            { id: "uyap", label: "Uyap Sorgulama", icon: Database },
            { id: "tasks", label: "Yapılacak İşler", icon: ListTodo },
            { id: "related", label: "İlişkili Davalar", icon: FolderOpen },
            { id: "accounting", label: "Müv. Muhasebe", icon: CreditCard },
            { id: "chat", label: "Müvekkil Chat", icon: MessageSquare },
            { id: "requests", label: "Müv. Diğer Talepler", icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(isActive ? null : tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600 bg-blue-50"
                    : "border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        {activeTab && (
          <div className="p-4 min-h-[200px]">
            <div className="text-sm text-slate-500">
              {activeTab === "notes" && "Notlar içeriği burada görünecek..."}
              {activeTab === "expenses" && "Masraflar içeriği burada görünecek..."}
              {activeTab === "uyap" && "UYAP Sorgulama içeriği burada görünecek..."}
              {activeTab === "tasks" && "Yapılacak İşler içeriği burada görünecek..."}
              {activeTab === "related" && "İlişkili Davalar içeriği burada görünecek..."}
              {activeTab === "accounting" && "Müvekkil Muhasebe içeriği burada görünecek..."}
              {activeTab === "chat" && "Müvekkil Chat içeriği burada görünecek..."}
              {activeTab === "requests" && "Müvekkil Diğer Talepler içeriği burada görünecek..."}
            </div>
          </div>
        )}

        {!activeTab && (
          <div className="p-8 text-center text-slate-400 text-sm">
            Açılır alan | Sekme seçin
          </div>
        )}
      </div>

      {/* Debtor Detail Drawer */}
      {selectedDebtorId && (
        <DebtorDetailDrawer
          caseDebtorId={selectedDebtorId}
          caseId={caseId}
          isOpen={isDebtorDrawerOpen}
          onClose={() => {
            setIsDebtorDrawerOpen(false);
            setSelectedDebtorId(null);
          }}
          onUpdate={fetchDebtors}
        />
      )}
    </div>
  );
}
