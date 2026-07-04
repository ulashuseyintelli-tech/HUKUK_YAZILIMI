"use client";

import { useEffect, useState } from "react";
import {
  FileText, ListTodo, Receipt, Database, FolderOpen, MessageSquare,
  ChevronDown, Plus, AlertTriangle, Clock, Zap, User, Check, X,
  ArrowRight, Calendar, Tag, ExternalLink, MapPin, Loader2,
  Scale, Users, Wallet, Send, FileCheck, HourglassIcon, DollarSign, Trash2
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type PanelId = "tasks" | "finance" | "uyap" | "related" | "icra-notes" | "client-requests" | "accounting" | null;

// İcra Notu (iç - hukuki strateji)
interface IcraNote {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string };
  isEdited?: boolean;
  editedAt?: string;
}

// Müvekkil Talebi
interface ClientRequest {
  id: string;
  type: "BILGILENDIRME" | "MASRAF_TALEBI" | "EVRAK_TALEBI" | "ONAY_BEKLEYEN";
  content: string;
  amount?: number; // Masraf talebi için
  status: "BEKLIYOR" | "TAMAMLANDI" | "IPTAL";
  createdAt: string;
  createdBy?: { name: string };
  completedAt?: string;
  responseNote?: string;
}

// Dağıtım/Mutabakat Kaydı
interface AccountingRecord {
  id: string;
  type: "MASRAF_TALEBI_GONDERILDI" | "ODEME_BEKLENIYOR" | "ODEME_ALINDI" | "MAHSUP" | "IADE" | "DAGITIM_BEKLIYOR" | "MANUEL_REVERSAL_GEREKLI";
  description: string;
  amount?: number;
  createdAt: string;
  relatedRequestId?: string; // İlişkili talep
  disposition?: DispositionPostingRecord;
}

type DispositionPostingLineType =
  | "CLIENT_PAYABLE"
  | "CONTRACTUAL_FEE_WITHHELD"
  | "FIRM_EXPENSE_REIMBURSEMENT"
  | "CLIENT_EXPENSE_REIMBURSEMENT"
  | "OFFSET_CLIENT_ADVANCE"
  | "OTHER";

interface DispositionPostingLineInput {
  type: DispositionPostingLineType;
  amount: string | number;
  caseClientId?: string | null;
  note?: string;
}

interface DispositionPostingRecord {
  id: string;
  collectionId: string;
  status: string;
  totalAmount: string | number;
  currency: string;
  beneficiaryScope: string;
  caseClientId?: string | null;
  manualReversalRequiredAt?: string | null;
}

// S8-B FAZ-1a — Dağıtım önerisi (advisory-only preview). Üretilen satırlar pre-fill edilir; otorite recommend().
interface DistributionRecommendationInput {
  attorneyFee?: { mode: "AMOUNT"; amount: string; note?: string };
}
interface DistributionRecommendationResult {
  suggestedLines: Array<{
    // Advisory kaynaktan gelir (CollectionDispositionLineType geniş kümesi); FAZ-1a yalnız
    // CONTRACTUAL_FEE_WITHHELD | CLIENT_PAYABLE döner — modal'a yazarken DispositionPostingLineType'a cast edilir.
    type: string;
    amount: string;
    caseClientId: string | null;
    origin?: string;
    note?: string;
    // FAZ-2 provenance: origin='FEE_AGREEMENT' ise kaynak CaseFeeAgreement id'si.
    feeAgreementId?: string;
  }>;
  warnings: string[];
  expenseModule: {
    candidates: Array<{ expenseRequestId: string; caseId: string; status: string; remaining: string }>;
  };
}

interface EligibleDispositionClient {
  id: string;
  name: string;
  role?: string;
}

interface DistributionDecisionLineState {
  id: string;
  type: DispositionPostingLineType;
  amount: string;
  caseClientId: string;
  note: string;
  // FAZ-2 — backend provenance (yalnız recommend()'den prefill edilen satırlarda dolu; FE hesaplamaz).
  origin?: "FEE_MANUAL" | "FEE_AGREEMENT" | "CLIENT_PAYABLE_RESIDUAL";
  feeAgreementId?: string;
}

// Eski Note tipi (geriye uyumluluk)
interface Note {
  id: string;
  content: string;
  createdAt: string;
  createdBy?: { name: string };
  type?: "AVUKAT" | "MUVEKKIL" | "SISTEM";
}

interface Task {
  id: string;
  title: string;
  description?: string;
  source: "SISTEM" | "MANUEL";
  basis?: string; // Kanun maddesi veya UYAP olayı (taskType)
  status: "BEKLIYOR" | "YAPILDI" | "IPTAL";
  dueDate?: string;
  priority?: "HIGH" | "MEDIUM" | "LOW";
  category?: "SONRAKI_HAMLE" | "SURE_BAGLI" | "RISK";
  taskType?: string; // Backend task type (CLIENT_REQUEST_DEBTOR_ADDRESSES vb.)
}

interface FinanceItem {
  id: string;
  type: "TAHSILAT" | "MASRAF_YAPILAN" | "MASRAF_TALEP";
  amount: number;
  date: string;
  description?: string;
  status?: string;
  // Expense-specific fields
  paidAmount?: number;
  remainingAmount?: number;
  items?: Array<{ code: string; label: string; suggestedAmount?: number; finalAmount: number; wasOverridden?: boolean }>;
}

interface UyapQuery {
  id: string;
  queryType: string;
  status: "BEKLIYOR" | "TAMAMLANDI" | "HATA";
  createdAt: string;
  result?: string;
  canRepeat?: boolean;
}

interface RelatedCase {
  id: string;
  fileNumber: string;
  type: string;
  status: string;
  relation: "AYNI_BORCLU" | "ITIRAZ" | "MENFI_TESPIT" | "CEZA" | "DIGER";
  debtorName?: string;
}


// S8-B FAZ-2 — CaseFeeAgreement (akdi ücret sözleşmesi). Backend otoritesi; FE HESAPLAMAZ.
interface CaseFeeAgreementSummary {
  id: string;
  feeType: "FLAT_AMOUNT" | "PERCENTAGE_OF_COLLECTION";
  flatAmount: string | null;
  percentageBps: number | null;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "TERMINATED";
  note?: string | null;
}
interface CaseFeeAgreementInput {
  feeType: "FLAT_AMOUNT" | "PERCENTAGE_OF_COLLECTION";
  flatAmount?: string;
  percentageBps?: number;
  note?: string;
}

interface OperationDeckProps {
  caseId: string;
  notes?: Note[]; // Geriye uyumluluk
  icraNotlar?: IcraNote[];
  muvekkilTalepleri?: ClientRequest[];
  muhasebeKayitlari?: AccountingRecord[];
  accountingEmptyMessage?: string;
  eligibleDispositionClients?: EligibleDispositionClient[];
  postingDispositionId?: string | null;
  // S8-B FAZ-0 — onay yaşam döngüsü: öner (HELD→RECOMMENDED) → onayla (→APPROVED) → kesinleştir (→POSTED).
  onRecommendDisposition?: (disposition: DispositionPostingRecord, lines: DispositionPostingLineInput[]) => Promise<void> | void;
  onApproveDisposition?: (disposition: DispositionPostingRecord) => Promise<void> | void;
  onPostDisposition?: (disposition: DispositionPostingRecord) => Promise<void> | void;
  // S8-B FAZ-1a — Dağıtım önerisi üreteci (preview; persist YOK). Üretilen satırlar modal'a pre-fill edilir.
  onPrepareDistributionRecommendation?: (
    dispositionId: string,
    input: DistributionRecommendationInput,
  ) => Promise<DistributionRecommendationResult>;
  // S8-B FAZ-2 — CaseFeeAgreement CRUD (controller hazır; PR-4 FE editörü). Yalnız ACTIVE düzenlenebilir.
  onFetchActiveFeeAgreement?: (caseClientId: string) => Promise<CaseFeeAgreementSummary | null>;
  onCreateFeeAgreement?: (caseClientId: string, input: CaseFeeAgreementInput) => Promise<CaseFeeAgreementSummary>;
  onUpdateFeeAgreement?: (agreementId: string, input: CaseFeeAgreementInput) => Promise<CaseFeeAgreementSummary>;
  onTerminateFeeAgreement?: (agreementId: string) => Promise<CaseFeeAgreementSummary>;
  tasks?: Task[];
  financeItems?: FinanceItem[];
  uyapQueries?: UyapQuery[];
  relatedCases?: RelatedCase[];
  clientBalance?: number;
  onAddNote?: () => void;
  onAddIcraNote?: () => void;
  onAddClientRequest?: (type: ClientRequest['type']) => void;
  onCompleteRequest?: (requestId: string) => void;
  onAddTask?: () => void;
  onOpenChat?: () => void;
  onTaskAction?: (taskId: string, action: "complete" | "cancel") => void;
  onConfirmReceived?: (taskId: string) => void; // "Zaten aldık" butonu için
  onRunQuery?: (queryType: string) => void;
  onTriggerAddressWorkflow?: () => void;
  addressWorkflowLoading?: boolean;
}

// ============================================================================
// PANEL CONFIGS
// ============================================================================

const panels = [
  { id: "tasks" as PanelId, label: "Yapılacaklar", icon: ListTodo, color: "text-amber-600", bg: "bg-amber-50" },
  { id: "finance" as PanelId, label: "Finans", icon: Receipt, color: "text-emerald-600", bg: "bg-emerald-50" },
  { id: "uyap" as PanelId, label: "UYAP Sorgu", icon: Database, color: "text-blue-600", bg: "bg-blue-50" },
  { id: "related" as PanelId, label: "İlişkili", icon: FolderOpen, color: "text-purple-600", bg: "bg-purple-50" },
  { id: "icra-notes" as PanelId, label: "İcra Notları", icon: Scale, color: "text-slate-600", bg: "bg-slate-50" },
  { id: "client-requests" as PanelId, label: "Müvekkil Talepleri", icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
  { id: "accounting" as PanelId, label: "Dağıtım & Mutabakat", icon: Wallet, color: "text-teal-600", bg: "bg-teal-50" },
];

// ============================================================================
// HELPERS
// ============================================================================

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString("tr-TR") : "-";
const formatDateTime = (d: string) => d ? new Date(d).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-";
const formatTL = (n: number) => n.toLocaleString("tr-TR", { minimumFractionDigits: 0 }) + " ₺";
const distributionBucketOptions: Array<{ type: DispositionPostingLineType; label: string; description: string }> = [
  { type: "CLIENT_PAYABLE", label: "Müvekkile Ödenecek", description: "Müvekkil payı" },
  { type: "CLIENT_EXPENSE_REIMBURSEMENT", label: "Müvekkil Masraf İadesi", description: "Müvekkile iade edilecek masraf" },
  { type: "CONTRACTUAL_FEE_WITHHELD", label: "Sözleşmesel Ücret Mahsubu", description: "Avukatlık/firmaya kalan ücret" },
  { type: "FIRM_EXPENSE_REIMBURSEMENT", label: "Firma Masraf Mahsubu", description: "Firma tarafından karşılanan masraf" },
  { type: "OFFSET_CLIENT_ADVANCE", label: "Müvekkil Avans Mahsubu", description: "Mevcut avans bakiyesine mahsup" },
  { type: "OTHER", label: "Diğer", description: "Sınıflandırılmamış dağıtım satırı" },
];

const clientAttributedDistributionTypes = new Set<DispositionPostingLineType>([
  "CLIENT_PAYABLE",
  "CLIENT_EXPENSE_REIMBURSEMENT",
]);

const isClientAttributedDistributionType = (type: DispositionPostingLineType) =>
  clientAttributedDistributionTypes.has(type);

const parseAmountCents = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return 0;
  const numericValue = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numericValue)) return Number.NaN;
  return Math.round(numericValue * 100);
};

const formatAmountInput = (cents: number) => (cents / 100).toFixed(2);

const formatCents = (cents: number, currency = "TRY") =>
  (cents / 100).toLocaleString("tr-TR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const createDistributionLineId = () =>
  `distribution-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const accountingTypeLabels: Record<AccountingRecord["type"], string> = {
  MASRAF_TALEBI_GONDERILDI: "Talep Gönderildi",
  ODEME_BEKLENIYOR: "Ödeme Bekleniyor",
  ODEME_ALINDI: "Dağıtım Kesinleşti",
  MAHSUP: "Mahsup",
  IADE: "İptal/Reversal",
  DAGITIM_BEKLIYOR: "Dağıtım Bekliyor",
  MANUEL_REVERSAL_GEREKLI: "Manuel Takip Gerekli",
};

const accountingTypeColors: Record<AccountingRecord["type"], string> = {
  MASRAF_TALEBI_GONDERILDI: "bg-blue-100 text-blue-700",
  ODEME_BEKLENIYOR: "bg-amber-100 text-amber-700",
  ODEME_ALINDI: "bg-emerald-100 text-emerald-700",
  MAHSUP: "bg-slate-100 text-slate-600",
  IADE: "bg-slate-100 text-slate-600",
  DAGITIM_BEKLIYOR: "bg-amber-100 text-amber-700",
  MANUEL_REVERSAL_GEREKLI: "bg-orange-100 text-orange-700",
};

const priorityColors = {
  HIGH: "bg-red-100 text-red-700 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
};

const statusColors = {
  BEKLIYOR: "bg-amber-100 text-amber-700",
  YAPILDI: "bg-emerald-100 text-emerald-700",
  IPTAL: "bg-slate-100 text-slate-500",
  TAMAMLANDI: "bg-emerald-100 text-emerald-700",
  HATA: "bg-red-100 text-red-700",
};

const relationLabels = {
  AYNI_BORCLU: "Aynı Borçlu",
  ITIRAZ: "İtiraz Davası",
  MENFI_TESPIT: "Menfi Tespit",
  CEZA: "Ceza Davası",
  DIGER: "Diğer",
};

const queryTypeLabels: Record<string, string> = {
  SGK: "SGK Sorgusu",
  TAPU: "Tapu Sorgusu",
  ARAC: "Araç Sorgusu",
  BANKA: "Banka Sorgusu",
  MERNIS: "Mernis Sorgusu",
  TICARET_SICIL: "Ticaret Sicil",
};


// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function OperationDeck({
  caseId,
  notes = [],
  icraNotlar = [],
  muvekkilTalepleri = [],
  muhasebeKayitlari = [],
  accountingEmptyMessage = "Bu dosyada henüz dağıtım/mutabakat kaydı yok.",
  eligibleDispositionClients = [],
  postingDispositionId = null,
  onRecommendDisposition,
  onApproveDisposition,
  onPostDisposition,
  onPrepareDistributionRecommendation,
  onFetchActiveFeeAgreement,
  onCreateFeeAgreement,
  onUpdateFeeAgreement,
  onTerminateFeeAgreement,
  tasks = [],
  financeItems = [],
  uyapQueries = [],
  relatedCases = [],
  clientBalance = 0,
  onAddNote,
  onAddIcraNote,
  onAddClientRequest,
  onCompleteRequest,
  onAddTask,
  onOpenChat,
  onTaskAction,
  onConfirmReceived,
  onRunQuery,
  onTriggerAddressWorkflow,
  addressWorkflowLoading = false,
}: OperationDeckProps) {
  const [activePanel, setActivePanel] = useState<PanelId>(null);
  const [postingActionMessage, setPostingActionMessage] = useState<string | null>(null);
  const [distributionModalRecord, setDistributionModalRecord] = useState<AccountingRecord | null>(null);
  const [distributionLines, setDistributionLines] = useState<DistributionDecisionLineState[]>([]);
  const [distributionSubmitError, setDistributionSubmitError] = useState<string | null>(null);
  // S8-B FAZ-1a — dağıtım önerisi (advisory preview) state'i
  const [distributionFeeInput, setDistributionFeeInput] = useState("");
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationWarnings, setRecommendationWarnings] = useState<string[]>([]);
  const [recommendationCandidates, setRecommendationCandidates] = useState<
    DistributionRecommendationResult["expenseModule"]["candidates"]
  >([]);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);

  // S8-B FAZ-2 — CaseFeeAgreement (akdi ücret sözleşmesi) kartı state'i. Backend otoritesi; FE HESAPLAMAZ.
  // undefined=henüz çekilmedi · null=çekildi, ACTIVE sözleşme yok.
  const [feeAgreementsByCaseClientId, setFeeAgreementsByCaseClientId] = useState<
    Record<string, CaseFeeAgreementSummary | null | undefined>
  >({});
  const [feeAgreementLoadingId, setFeeAgreementLoadingId] = useState<string | null>(null);
  const [feeAgreementFormFor, setFeeAgreementFormFor] = useState<string | null>(null); // caseClientId
  const [feeAgreementFormMode, setFeeAgreementFormMode] = useState<"create" | "edit">("create");
  const [feeAgreementEditingId, setFeeAgreementEditingId] = useState<string | null>(null);
  const [feeAgreementFeeType, setFeeAgreementFeeType] = useState<"FLAT_AMOUNT" | "PERCENTAGE_OF_COLLECTION">("FLAT_AMOUNT");
  const [feeAgreementAmountInput, setFeeAgreementAmountInput] = useState("");
  const [feeAgreementPercentInput, setFeeAgreementPercentInput] = useState("");
  const [feeAgreementNoteInput, setFeeAgreementNoteInput] = useState("");
  const [feeAgreementValidationError, setFeeAgreementValidationError] = useState<string | null>(null);
  const [feeAgreementSubmitError, setFeeAgreementSubmitError] = useState<string | null>(null);
  const [feeAgreementSubmitting, setFeeAgreementSubmitting] = useState(false);
  const [feeAgreementTerminatingId, setFeeAgreementTerminatingId] = useState<string | null>(null);

  // Panel açıldığında (accounting sekmesi) her uygun caseClient için ACTIVE sözleşmeyi lazy-fetch et.
  useEffect(() => {
    if (activePanel !== "accounting" || !onFetchActiveFeeAgreement) return;
    for (const client of eligibleDispositionClients) {
      if (feeAgreementsByCaseClientId[client.id] !== undefined) continue;
      setFeeAgreementLoadingId(client.id);
      onFetchActiveFeeAgreement(client.id)
        .then((agreement) => {
          setFeeAgreementsByCaseClientId((prev) => ({ ...prev, [client.id]: agreement }));
        })
        .catch(() => {
          // Read hatası sessizce yutulmaz ama kart "—" gösterip devam eder; kritik akış değil.
          setFeeAgreementsByCaseClientId((prev) => ({ ...prev, [client.id]: null }));
        })
        .finally(() => setFeeAgreementLoadingId(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePanel, eligibleDispositionClients, onFetchActiveFeeAgreement]);

  /** Backend hata mesajını kullanıcı diline çevirir (mesaj backend otoritesini değiştirmez). */
  const friendlyFeeAgreementError = (message: string): string => {
    const m = message || "";
    if (/zaten ACTIVE/i.test(m)) return "Bu müvekkil için zaten aktif bir ücret sözleşmesi var. Sayfayı yenileyin.";
    if (/eşzamanlı değişti/i.test(m)) return "Sözleşme başka bir işlemle değişti. Sayfayı yenileyip tekrar deneyin.";
    if (/Sonlandırılacak ACTIVE/i.test(m)) return "Sonlandırılacak aktif sözleşme bulunamadı (zaten değişmiş olabilir).";
    if (/Yalnız ACTIVE sözleşme güncellenebilir/i.test(m)) return "Bu sözleşme artık aktif değil (başka bir işlemle değişmiş olabilir). Sayfayı yenileyin.";
    if (/geçersiz\/yabancı/i.test(m)) return `Müvekkil doğrulaması başarısız: ${m}`;
    return m || "İşlem tamamlanamadı.";
  };

  const closeFeeAgreementForm = () => {
    setFeeAgreementFormFor(null);
    setFeeAgreementEditingId(null);
    setFeeAgreementFeeType("FLAT_AMOUNT");
    setFeeAgreementAmountInput("");
    setFeeAgreementPercentInput("");
    setFeeAgreementNoteInput("");
    setFeeAgreementValidationError(null);
    setFeeAgreementSubmitError(null);
  };

  const openCreateFeeAgreementForm = (caseClientId: string) => {
    closeFeeAgreementForm();
    setFeeAgreementFormMode("create");
    setFeeAgreementFormFor(caseClientId);
  };

  const openEditFeeAgreementForm = (caseClientId: string, agreement: CaseFeeAgreementSummary) => {
    closeFeeAgreementForm();
    setFeeAgreementFormMode("edit");
    setFeeAgreementFormFor(caseClientId);
    setFeeAgreementEditingId(agreement.id);
    setFeeAgreementFeeType(agreement.feeType);
    setFeeAgreementAmountInput(agreement.flatAmount ?? "");
    setFeeAgreementPercentInput(
      agreement.percentageBps != null ? (agreement.percentageBps / 100).toString() : "",
    );
    setFeeAgreementNoteInput(agreement.note ?? "");
  };

  const submitFeeAgreementForm = async (caseClientId: string) => {
    setFeeAgreementValidationError(null);
    setFeeAgreementSubmitError(null);

    const input: CaseFeeAgreementInput = { feeType: feeAgreementFeeType, note: feeAgreementNoteInput.trim() || undefined };
    if (feeAgreementFeeType === "FLAT_AMOUNT") {
      const amt = parseAmountCents(feeAgreementAmountInput);
      if (!Number.isFinite(amt) || amt <= 0) {
        setFeeAgreementValidationError("Geçerli bir pozitif tutar girin.");
        return;
      }
      input.flatAmount = formatAmountInput(amt);
    } else {
      // Kullanıcı yüzde (%) girer; basis-points'e ÇEVRİLİR (hesaplama DEĞİL — birim dönüşümü, backend faithful-int bekler).
      const pct = Number(feeAgreementPercentInput.trim().replace(",", "."));
      if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
        setFeeAgreementValidationError("Geçerli bir yüzde girin (0-100 arası).");
        return;
      }
      input.percentageBps = Math.round(pct * 100);
    }

    setFeeAgreementSubmitting(true);
    try {
      let result: CaseFeeAgreementSummary;
      if (feeAgreementFormMode === "create" && onCreateFeeAgreement) {
        result = await onCreateFeeAgreement(caseClientId, input);
      } else if (feeAgreementFormMode === "edit" && feeAgreementEditingId && onUpdateFeeAgreement) {
        result = await onUpdateFeeAgreement(feeAgreementEditingId, input);
      } else {
        return;
      }
      setFeeAgreementsByCaseClientId((prev) => ({ ...prev, [caseClientId]: result }));
      closeFeeAgreementForm();
    } catch (error: any) {
      setFeeAgreementSubmitError(friendlyFeeAgreementError(error?.message));
    } finally {
      setFeeAgreementSubmitting(false);
    }
  };

  const handleTerminateFeeAgreement = async (caseClientId: string, agreement: CaseFeeAgreementSummary) => {
    if (!onTerminateFeeAgreement) return;
    const confirmed = typeof window === "undefined" || window.confirm("Bu ücret sözleşmesini sonlandırmak istediğinize emin misiniz?");
    if (!confirmed) return;
    setFeeAgreementTerminatingId(agreement.id);
    try {
      const result = await onTerminateFeeAgreement(agreement.id);
      setFeeAgreementsByCaseClientId((prev) => ({ ...prev, [caseClientId]: result.status === "ACTIVE" ? result : null }));
    } catch (error: any) {
      alert(friendlyFeeAgreementError(error?.message));
    } finally {
      setFeeAgreementTerminatingId(null);
    }
  };

  const feeAgreementSummaryLabel = (agreement: CaseFeeAgreementSummary): string => {
    if (agreement.feeType === "FLAT_AMOUNT") {
      return `Sabit ücret: ${formatCents(parseAmountCents(agreement.flatAmount ?? "0"))}`;
    }
    const pct = agreement.percentageBps != null ? (agreement.percentageBps / 100).toString() : "?";
    return `Tahsilatın %${pct}'i`;
  };

  const resetRecommendationState = () => {
    setDistributionFeeInput("");
    setRecommendationWarnings([]);
    setRecommendationCandidates([]);
    setRecommendationError(null);
    setRecommendationLoading(false);
  };

  const eligibleClientsForDisposition = eligibleDispositionClients.filter((client) => Boolean(client.id));

  const togglePanel = (id: PanelId) => {
    setActivePanel(activePanel === id ? null : id);
  };

  const getDispositionTotalCents = (record: AccountingRecord | null) =>
    parseAmountCents(record?.disposition?.totalAmount ?? record?.amount ?? 0);

  const createInitialDistributionLine = (record: AccountingRecord): DistributionDecisionLineState => {
    const totalCents = getDispositionTotalCents(record);
    const singleClientId = eligibleClientsForDisposition.length === 1 ? eligibleClientsForDisposition[0].id : "";
    const defaultType: DispositionPostingLineType = eligibleClientsForDisposition.length > 0 ? "CLIENT_PAYABLE" : "OTHER";

    return {
      id: createDistributionLineId(),
      type: defaultType,
      amount: totalCents > 0 ? formatAmountInput(totalCents) : "",
      caseClientId: singleClientId,
      note: "",
    };
  };

  const openDistributionDecisionModal = (record: AccountingRecord) => {
    if (!record.disposition || String(record.disposition.status || "").toUpperCase() !== "HELD_PENDING_DISTRIBUTION") return;

    setPostingActionMessage(null);
    setDistributionSubmitError(null);
    resetRecommendationState();
    setDistributionModalRecord(record);
    setDistributionLines([createInitialDistributionLine(record)]);
  };

  const closeDistributionDecisionModal = () => {
    setDistributionModalRecord(null);
    setDistributionLines([]);
    setDistributionSubmitError(null);
    resetRecommendationState();
  };

  const updateDistributionLine = (lineId: string, updates: Partial<DistributionDecisionLineState>) => {
    setDistributionLines((lines) =>
      lines.map((line) => {
        if (line.id !== lineId) return line;
        const nextLine = { ...line, ...updates };
        if (updates.type && !isClientAttributedDistributionType(updates.type)) {
          nextLine.caseClientId = "";
        }
        return nextLine;
      }),
    );
    setDistributionSubmitError(null);
  };

  const addDistributionLine = () => {
    const targetCents = getDispositionTotalCents(distributionModalRecord);
    const currentTotalCents = distributionLines.reduce((sum, line) => sum + parseAmountCents(line.amount), 0);
    const remainingCents = targetCents - currentTotalCents;

    setDistributionLines((lines) => [
      ...lines,
      {
        id: createDistributionLineId(),
        type: "OTHER",
        amount: remainingCents > 0 ? formatAmountInput(remainingCents) : "",
        caseClientId: "",
        note: "",
      },
    ]);
    setDistributionSubmitError(null);
  };

  const removeDistributionLine = (lineId: string) => {
    setDistributionLines((lines) => (lines.length > 1 ? lines.filter((line) => line.id !== lineId) : lines));
    setDistributionSubmitError(null);
  };

  const getDistributionValidationMessage = () => {
    const disposition = distributionModalRecord?.disposition;
    if (!distributionModalRecord || !disposition) return "Dağıtım kaydı bulunamadı.";
    if (!onRecommendDisposition) return "Dağıtım önerme aksiyonu bu görünümde kullanılamıyor.";
    if (String(disposition.status || "").toUpperCase() !== "HELD_PENDING_DISTRIBUTION") {
      return "Yalnız bekleyen dağıtım kayıtları kesinleştirilebilir.";
    }

    const targetCents = getDispositionTotalCents(distributionModalRecord);
    if (!Number.isFinite(targetCents) || targetCents <= 0) return "Dağıtım tutarı geçerli değil.";
    if (distributionLines.length === 0) return "En az bir dağıtım satırı gerekir.";

    const requiresClientSelection =
      eligibleClientsForDisposition.length > 1 ||
      String(disposition.beneficiaryScope || "").toUpperCase().includes("CLUSTER");

    for (const line of distributionLines) {
      const lineAmountCents = parseAmountCents(line.amount);
      if (!Number.isFinite(lineAmountCents) || lineAmountCents <= 0) {
        return "Tüm dağıtım satırlarında geçerli tutar olmalı.";
      }
      if (requiresClientSelection && isClientAttributedDistributionType(line.type) && !line.caseClientId) {
        return "Müvekkil payı ve müvekkil masraf iadesi için alacaklı seçimi zorunlu.";
      }
    }

    const totalCents = distributionLines.reduce((sum, line) => sum + parseAmountCents(line.amount), 0);
    if (totalCents !== targetCents) return "Dağıtım toplamı tahsilat tutarıyla birebir eşit olmalı.";

    return null;
  };

  const handleDistributionDecisionSubmit = async () => {
    const validationMessage = getDistributionValidationMessage();
    if (validationMessage) {
      setDistributionSubmitError(validationMessage);
      return;
    }

    const disposition = distributionModalRecord?.disposition;
    if (!disposition || !onRecommendDisposition) return;

    const payloadLines: DispositionPostingLineInput[] = distributionLines.map((line) => {
      const payloadLine: DispositionPostingLineInput = {
        type: line.type,
        amount: formatAmountInput(parseAmountCents(line.amount)),
      };
      if (isClientAttributedDistributionType(line.type) && line.caseClientId) {
        payloadLine.caseClientId = line.caseClientId;
      }
      if (line.note.trim()) {
        payloadLine.note = line.note.trim();
      }
      return payloadLine;
    });

    try {
      await onRecommendDisposition(disposition, payloadLines);
      setPostingActionMessage("Dağıtım önerisi kaydedildi — onay bekliyor.");
      closeDistributionDecisionModal();
    } catch (error: any) {
      setDistributionSubmitError(error?.message || "Dağıtım önerisi kaydedilemedi.");
    }
  };

  // S8-B FAZ-1a — Dağıtım önerisi hazırla: BE generator'dan suggestedLines al → modal'a pre-fill et (advisory; persist YOK).
  // FE HESAPLAMAZ: tutarlar BE Decimal'inden gelir; yalnız mevcut format util'leriyle input'a normalize edilir.
  const handlePrepareRecommendation = async () => {
    const disposition = distributionModalRecord?.disposition;
    if (!disposition?.id || !onPrepareDistributionRecommendation) return;
    setRecommendationError(null);
    setRecommendationLoading(true);
    try {
      const feeRaw = distributionFeeInput.trim();
      const input: DistributionRecommendationInput = feeRaw
        ? { attorneyFee: { mode: "AMOUNT", amount: formatAmountInput(parseAmountCents(feeRaw)) } }
        : {};
      const rec = await onPrepareDistributionRecommendation(disposition.id, input);
      if (rec.suggestedLines.length > 0) {
        setDistributionLines(
          rec.suggestedLines.map((line) => ({
            id: createDistributionLineId(),
            type: line.type as DispositionPostingLineType,
            amount: formatAmountInput(parseAmountCents(line.amount)),
            caseClientId: line.caseClientId ?? "",
            note: line.note ?? "",
            // FAZ-2 — backend provenance'ı aynen taşı (FE hesaplamaz, yalnız gösterir).
            origin: line.origin as DistributionDecisionLineState["origin"],
            feeAgreementId: line.feeAgreementId,
          })),
        );
      }
      setRecommendationWarnings(rec.warnings ?? []);
      setRecommendationCandidates(rec.expenseModule?.candidates ?? []);
      setDistributionSubmitError(null);
    } catch (error: any) {
      setRecommendationError(error?.message || "Dağıtım önerisi alınamadı.");
    } finally {
      setRecommendationLoading(false);
    }
  };

  // S8-B FAZ-0 — Hızlı öner: tek satır CLIENT_PAYABLE = tahsilatın tamamı → DISTRIBUTION_RECOMMENDED (onay bekler; finansal etki YOK).
  const handleRecommendShortcut = async (record: AccountingRecord) => {
    const disposition = record.disposition;
    if (!disposition || String(disposition.status || "").toUpperCase() !== "HELD_PENDING_DISTRIBUTION") return;

    setPostingActionMessage(null);
    const totalAmount = Number(disposition.totalAmount ?? record.amount ?? 0);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      setPostingActionMessage("Dağıtım tutarı geçerli değil.");
      return;
    }

    const eligibleClients = eligibleClientsForDisposition;
    if (eligibleClients.length > 1) {
      setPostingActionMessage("Çoklu alacaklı dosyada 'Dağıtımı Belirle' ile alacaklı seçimi gerekir.");
      return;
    }
    if (eligibleClients.length === 0) {
      setPostingActionMessage("Dağıtım önermek için uygun alacaklı bulunamadı.");
      return;
    }
    if (!onRecommendDisposition) {
      setPostingActionMessage("Dağıtım önerme aksiyonu bu görünümde kullanılamıyor.");
      return;
    }

    const payloadAmount = typeof disposition.totalAmount === "string" ? disposition.totalAmount : totalAmount.toFixed(2);
    try {
      await onRecommendDisposition(disposition, [{ type: "CLIENT_PAYABLE", amount: payloadAmount, caseClientId: eligibleClients[0].id }]);
      setPostingActionMessage("Dağıtım önerisi kaydedildi — onay bekliyor.");
    } catch (error: any) {
      setPostingActionMessage(error?.message || "Dağıtım önerisi kaydedilemedi.");
    }
  };

  // S8-B FAZ-0 — Onayla: DISTRIBUTION_RECOMMENDED → DISTRIBUTION_APPROVED (yalnız Partner/Manager; yetki backend + P4'te).
  const handleApproveDispositionClick = async (record: AccountingRecord) => {
    const disposition = record.disposition;
    if (!disposition || String(disposition.status || "").toUpperCase() !== "DISTRIBUTION_RECOMMENDED") return;
    if (!onApproveDisposition) {
      setPostingActionMessage("Onay aksiyonu bu görünümde kullanılamıyor.");
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm("Bu dağıtım önerisini onaylıyor musunuz? Onay yetkisi yalnız Partner/Manager'dadır.");
    if (!confirmed) return;
    setPostingActionMessage(null);
    try {
      await onApproveDisposition(disposition);
      setPostingActionMessage("Dağıtım onaylandı — kesinleştirilebilir.");
    } catch (error: any) {
      setPostingActionMessage(error?.message || "Dağıtım onaylanamadı.");
    }
  };

  // S8-B FAZ-0 — Kesinleştir: DISTRIBUTION_APPROVED → POSTED (finansal etki burada doğar).
  const handlePostApprovedClick = async (record: AccountingRecord) => {
    const disposition = record.disposition;
    if (!disposition || String(disposition.status || "").toUpperCase() !== "DISTRIBUTION_APPROVED") return;
    if (!onPostDisposition) {
      setPostingActionMessage("Kesinleştirme aksiyonu bu görünümde kullanılamıyor.");
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm("Onaylı dağıtımı muhasebeleştirmek istediğinize emin misiniz? Müvekkile borç / mahsup kaynağı bu işlemle oluşur.");
    if (!confirmed) return;
    setPostingActionMessage(null);
    try {
      await onPostDisposition(disposition);
    } catch (error: any) {
      setPostingActionMessage(error?.message || "Dağıtım kesinleştirilemedi.");
    }
  };

  const activeDistributionDisposition = distributionModalRecord?.disposition ?? null;
  const activeDistributionCurrency = activeDistributionDisposition?.currency || "TRY";
  const activeDistributionTargetCents = getDispositionTotalCents(distributionModalRecord);
  const activeDistributionLineTotalCents = distributionLines.reduce((sum, line) => sum + parseAmountCents(line.amount), 0);
  const activeDistributionDifferenceCents = activeDistributionTargetCents - activeDistributionLineTotalCents;
  const distributionValidationMessage = distributionModalRecord ? getDistributionValidationMessage() : null;
  const distributionFeedbackMessage = distributionSubmitError || distributionValidationMessage;
  const isDistributionSubmitting = Boolean(
    activeDistributionDisposition?.id && postingDispositionId === activeDistributionDisposition.id,
  );
  const canSubmitDistributionDecision = Boolean(distributionModalRecord) && !distributionValidationMessage && !isDistributionSubmitting;

  // Counts for badges
  const pendingTasks = tasks.filter(t => t.status === "BEKLIYOR").length;
  const highPriorityTasks = tasks.filter(t => t.priority === "HIGH" && t.status === "BEKLIYOR").length;
  const pendingQueries = uyapQueries.filter(q => q.status === "BEKLIYOR").length;
  const pendingRequests = muvekkilTalepleri.filter(r => r.status === "BEKLIYOR").length;

  // Group tasks by category
  const nextMove = tasks.find(t => t.category === "SONRAKI_HAMLE" && t.status === "BEKLIYOR");
  const timeBoundTasks = tasks.filter(t => t.category === "SURE_BAGLI" && t.status === "BEKLIYOR");
  const riskTasks = tasks.filter(t => t.category === "RISK" && t.status === "BEKLIYOR");

  return (
    <div className="border-t border-slate-200 bg-white">
      {/* Panel Headers - Horizontal Tab Bar */}
      <div className="flex items-center gap-1 px-3 py-2 bg-slate-50 border-b overflow-x-auto">
        {panels.map((panel) => {
          const Icon = panel.icon;
          const isActive = activePanel === panel.id;
          const count = panel.id === "tasks" ? pendingTasks : 
                        panel.id === "uyap" ? pendingQueries :
                        panel.id === "related" ? relatedCases.length :
                        panel.id === "icra-notes" ? icraNotlar.length :
                        panel.id === "client-requests" ? muvekkilTalepleri.length :
                        panel.id === "accounting" ? muhasebeKayitlari.length : 0;
          const hasUrgent = (panel.id === "tasks" && highPriorityTasks > 0) || 
                           (panel.id === "client-requests" && pendingRequests > 0);

          return (
            <button
              key={panel.id}
              onClick={() => togglePanel(panel.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                isActive 
                  ? `${panel.bg} ${panel.color} shadow-sm ring-1 ring-inset ring-current/20` 
                  : "text-slate-500 hover:bg-white hover:text-slate-700"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{panel.label}</span>
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  hasUrgent ? "bg-red-500 text-white" : isActive ? "bg-white/80" : "bg-slate-200"
                }`}>
                  {count}
                </span>
              )}
              <ChevronDown className={`w-3 h-3 transition-transform ${isActive ? "rotate-180" : ""}`} />
            </button>
          );
        })}

        {/* Chat Button - Always visible, opens drawer */}
        <button
          onClick={onOpenChat}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Müvekkil Chat</span>
        </button>
      </div>


      {/* Panel Content */}
      {activePanel && (
        <div className="animate-in slide-in-from-top-2 duration-200">
          {/* ═══════════════════════════════════════════════════════════════════
              YAPILACAKLAR PANELİ - EN KRİTİK
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "tasks" && (
            <div className="p-4 space-y-4">
              {/* Bir Sonraki Hamle */}
              {nextMove && (
                <div className="p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Bir Sonraki Hamle</span>
                    <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-medium ${
                      nextMove.source === "SISTEM" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {nextMove.source === "SISTEM" ? "Sistem Önerisi" : "Manuel"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-800">{nextMove.title}</p>
                  {nextMove.basis && (
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" /> {nextMove.basis}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => onTaskAction?.(nextMove.id, "complete")}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium hover:bg-emerald-700"
                    >
                      <Check className="w-3 h-3" /> Yapıldı
                    </button>
                    <button
                      onClick={() => onTaskAction?.(nextMove.id, "cancel")}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300"
                    >
                      <X className="w-3 h-3" /> İptal
                    </button>
                  </div>
                </div>
              )}

              {/* Süreye Bağlı İşler */}
              {timeBoundTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Süreye Bağlı İşler</span>
                  </div>
                  <div className="space-y-2">
                    {timeBoundTasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-2 rounded border border-slate-200 bg-white">
                        <div>
                          <p className="text-sm text-slate-700">{task.title}</p>
                          {task.dueDate && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              <Calendar className="w-3 h-3" /> {formatDate(task.dueDate)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${priorityColors[task.priority || "LOW"]}`}>
                            {task.priority === "HIGH" ? "Acil" : task.priority === "MEDIUM" ? "Normal" : "Düşük"}
                          </span>
                          {/* "Zaten aldık" butonu - sadece adres talebi görevleri için */}
                          {(task.basis === 'CLIENT_REQUEST_DEBTOR_ADDRESSES' || task.taskType === 'CLIENT_REQUEST_DEBTOR_ADDRESSES') && onConfirmReceived && (
                            <button 
                              onClick={() => onConfirmReceived(task.id)} 
                              className="px-2 py-1 text-[10px] bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                              title="Adresler zaten alındı"
                            >
                              Zaten aldık
                            </button>
                          )}
                          <button onClick={() => onTaskAction?.(task.id, "complete")} className="p-1 hover:bg-emerald-100 rounded">
                            <Check className="w-4 h-4 text-emerald-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Uyarıları */}
              {riskTasks.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Risk Uyarıları</span>
                  </div>
                  <div className="space-y-2">
                    {riskTasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between p-2 rounded border border-red-200 bg-red-50">
                        <div>
                          <p className="text-sm text-red-800 font-medium">{task.title}</p>
                          {task.basis && <p className="text-xs text-red-600 mt-0.5">{task.basis}</p>}
                        </div>
                        <ArrowRight className="w-4 h-4 text-red-400" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Boş durum */}
              {tasks.filter(t => t.status === "BEKLIYOR").length === 0 && (
                <div className="text-center py-6 text-slate-400">
                  <ListTodo className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Bekleyen iş yok</p>
                </div>
              )}

              {/* Görev Ekle */}
              {onAddTask && (
                <button
                  onClick={onAddTask}
                  className="w-full flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-600"
                >
                  <Plus className="w-3 h-3" /> Manuel Görev Ekle
                </button>
              )}

              {/* Adres İş Akışını Başlat */}
              {onTriggerAddressWorkflow && (
                <button
                  onClick={onTriggerAddressWorkflow}
                  disabled={addressWorkflowLoading}
                  className={`w-full flex items-center justify-center gap-1 py-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700 font-medium ${
                    addressWorkflowLoading 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-purple-100 hover:border-purple-300'
                  }`}
                >
                  {addressWorkflowLoading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> İşleniyor...
                    </>
                  ) : (
                    <>
                      <MapPin className="w-3 h-3" /> Adres İş Akışını Başlat
                    </>
                  )}
                </button>
              )}
            </div>
          )}


          {/* ═══════════════════════════════════════════════════════════════════
              FİNANS PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "finance" && (
            <div className="p-4 space-y-4">
              {/* Özet Kartları */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-[10px] text-emerald-600 uppercase tracking-wide">Tahsilat</p>
                  <p className="text-lg font-bold text-emerald-700">
                    {formatTL(financeItems.filter(f => f.type === "TAHSILAT").reduce((s, f) => s + f.amount, 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-[10px] text-red-600 uppercase tracking-wide">Yapılan Masraf</p>
                  <p className="text-lg font-bold text-red-700">
                    {formatTL(financeItems.filter(f => f.type === "MASRAF_YAPILAN").reduce((s, f) => s + f.amount, 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-[10px] text-amber-600 uppercase tracking-wide">Masraf Talebi</p>
                  <p className="text-lg font-bold text-amber-700">
                    {formatTL(financeItems.filter(f => f.type === "MASRAF_TALEP").reduce((s, f) => s + f.amount, 0))}
                  </p>
                  <p className="text-[9px] text-amber-500">
                    Ödenen: {formatTL(financeItems.filter(f => f.type === "MASRAF_TALEP").reduce((s, f) => s + (f.paidAmount || 0), 0))}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wide">Müvekkil Bakiye</p>
                  <p className={`text-lg font-bold ${clientBalance >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {formatTL(clientBalance)}
                  </p>
                </div>
              </div>

              {/* Masraf Talepleri (Expense Requests) */}
              {financeItems.filter(f => f.type === "MASRAF_TALEP").length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Masraf Talepleri</p>
                  <div className="space-y-2 max-h-[150px] overflow-y-auto">
                    {financeItems.filter(f => f.type === "MASRAF_TALEP").map(item => (
                      <div key={item.id} className={`p-3 rounded-lg border ${
                        item.status === 'PAID' ? 'border-emerald-200 bg-emerald-50/50' :
                        item.status === 'PARTIAL' ? 'border-amber-200 bg-amber-50/50' :
                        'border-slate-200 bg-white'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-700">{item.description}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            item.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                            item.status === 'PARTIAL' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {item.status === 'PAID' ? 'Ödendi' : item.status === 'PARTIAL' ? 'Kısmi' : 'Bekliyor'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-500">{formatDate(item.date)}</span>
                          <div className="text-right">
                            <span className="font-semibold text-slate-700">{formatTL(item.amount)}</span>
                            {item.paidAmount !== undefined && item.paidAmount > 0 && item.paidAmount < item.amount && (
                              <span className="text-emerald-600 ml-2">({formatTL(item.paidAmount)} ödendi)</span>
                            )}
                          </div>
                        </div>
                        {/* Kalem detayları */}
                        {item.items && item.items.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-100">
                            <div className="space-y-1">
                              {item.items.slice(0, 3).map((subItem, idx) => (
                                <div key={idx} className="flex justify-between text-[10px] text-slate-500">
                                  <span>{subItem.label}</span>
                                  <span>{formatTL(subItem.finalAmount)}</span>
                                </div>
                              ))}
                              {item.items.length > 3 && (
                                <p className="text-[10px] text-slate-400 italic">+{item.items.length - 3} kalem daha</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Son İşlemler (Tahsilatlar) */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Son İşlemler</p>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {financeItems.filter(f => f.type !== "MASRAF_TALEP").slice(0, 10).map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded bg-slate-50 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${
                          item.type === "TAHSILAT" ? "bg-emerald-500" : "bg-red-500"
                        }`} />
                        <span className="text-slate-700">{item.description || item.type}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-medium ${
                          item.type === "TAHSILAT" ? "text-emerald-600" : "text-red-600"
                        }`}>
                          {item.type === "TAHSILAT" ? "+" : "-"}{formatTL(item.amount)}
                        </span>
                        <p className="text-[10px] text-slate-400">{formatDate(item.date)}</p>
                      </div>
                    </div>
                  ))}
                  {financeItems.filter(f => f.type !== "MASRAF_TALEP").length === 0 && (
                    <p className="text-center py-4 text-slate-400 text-sm">Henüz işlem yok</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              UYAP SORGULAMA PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "uyap" && (
            <div className="p-4 space-y-4">
              {/* Hızlı Sorgu Butonları */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Hızlı Sorgu</p>
                <div className="flex flex-wrap gap-2">
                  {["SGK", "TAPU", "ARAC", "BANKA", "MERNIS"].map(type => (
                    <button
                      key={type}
                      onClick={() => onRunQuery?.(type)}
                      className="px-3 py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100"
                    >
                      {queryTypeLabels[type] || type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sorgu Geçmişi */}
              <div>
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Sorgu Geçmişi</p>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {uyapQueries.map(query => (
                    <div key={query.id} className="flex items-center justify-between p-2 rounded border border-slate-200 bg-white">
                      <div>
                        <p className="text-sm text-slate-700">{queryTypeLabels[query.queryType] || query.queryType}</p>
                        <p className="text-[10px] text-slate-400">{formatDateTime(query.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[query.status]}`}>
                          {query.status === "TAMAMLANDI" ? "Tamamlandı" : query.status === "BEKLIYOR" ? "Bekliyor" : "Hata"}
                        </span>
                        {query.canRepeat && (
                          <button
                            onClick={() => onRunQuery?.(query.queryType)}
                            className="p-1 hover:bg-slate-100 rounded"
                            title="Tekrar Sorgula"
                          >
                            <ArrowRight className="w-3 h-3 text-slate-400" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {uyapQueries.length === 0 && (
                    <p className="text-center py-4 text-slate-400 text-sm">Henüz sorgu yapılmamış</p>
                  )}
                </div>
              </div>
            </div>
          )}


          {/* ═══════════════════════════════════════════════════════════════════
              İLİŞKİLİ DAVALAR PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "related" && (
            <div className="p-4">
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {relatedCases.map(rc => (
                  <a
                    key={rc.id}
                    href={`/cases/${rc.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-slate-200 bg-white hover:border-purple-300 hover:bg-purple-50/50 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{rc.fileNumber}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {rc.type} • {relationLabels[rc.relation]}
                      </p>
                      {rc.debtorName && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{rc.debtorName}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                        rc.status === "DERDEST" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {rc.status}
                      </span>
                      <ExternalLink className="w-4 h-4 text-slate-400" />
                    </div>
                  </a>
                ))}
                {relatedCases.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">İlişkili dosya yok</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              İCRA NOTLARI PANELİ (İç - Hukuki Strateji)
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "icra-notes" && (
            <div className="p-4">
              <div className="mb-3 p-2 bg-slate-100 rounded-lg">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Scale className="w-3 h-3" />
                  Hukuki strateji ve değerlendirme notları • Müvekkile görünmez
                </p>
              </div>
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {icraNotlar.map(note => (
                  <div key={note.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-500">{note.createdBy?.name || "Avukat"}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(note.createdAt)}</span>
                      {note.isEdited && (
                        <span className="text-[10px] text-amber-500 italic">düzenlendi</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
                {icraNotlar.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <Scale className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Henüz icra notu eklenmemiş</p>
                  </div>
                )}
              </div>

              {/* İcra Notu Ekle */}
              {onAddIcraNote && (
                <button
                  onClick={onAddIcraNote}
                  className="w-full mt-3 flex items-center justify-center gap-1 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-600"
                >
                  <Plus className="w-3 h-3" /> İcra Notu Ekle
                </button>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MÜVEKKİL TALEPLERİ PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "client-requests" && (
            <div className="p-4">
              <div className="mb-3 p-2 bg-indigo-50 rounded-lg">
                <p className="text-[10px] text-indigo-600 uppercase tracking-wide flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Müvekkil iletişimi ve talepler • Müvekkil portalında görünür
                </p>
              </div>

              {/* Hızlı Talep Butonları */}
              {onAddClientRequest && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <button
                    onClick={() => onAddClientRequest("MASRAF_TALEBI")}
                    className="flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700 hover:bg-amber-100"
                  >
                    <DollarSign className="w-3 h-3" /> Masraf Talebi
                  </button>
                  <button
                    onClick={() => onAddClientRequest("EVRAK_TALEBI")}
                    className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 hover:bg-blue-100"
                  >
                    <FileCheck className="w-3 h-3" /> Evrak Talebi
                  </button>
                  <button
                    onClick={() => onAddClientRequest("BILGILENDIRME")}
                    className="flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 hover:bg-slate-100"
                  >
                    <Send className="w-3 h-3" /> Bilgilendirme
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {muvekkilTalepleri.map(request => (
                  <div key={request.id} className={`p-3 rounded-lg border ${
                    request.status === "BEKLIYOR" 
                      ? "border-amber-200 bg-amber-50/50" 
                      : request.status === "TAMAMLANDI"
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-slate-200 bg-slate-50"
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      {request.type === "MASRAF_TALEBI" && <DollarSign className="w-3 h-3 text-amber-600" />}
                      {request.type === "EVRAK_TALEBI" && <FileCheck className="w-3 h-3 text-blue-600" />}
                      {request.type === "BILGILENDIRME" && <Send className="w-3 h-3 text-slate-600" />}
                      {request.type === "ONAY_BEKLEYEN" && <HourglassIcon className="w-3 h-3 text-purple-600" />}
                      <span className="text-xs font-medium text-slate-700">
                        {request.type === "MASRAF_TALEBI" ? "Masraf Talebi" :
                         request.type === "EVRAK_TALEBI" ? "Evrak Talebi" :
                         request.type === "BILGILENDIRME" ? "Bilgilendirme" : "Onay Bekleyen"}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(request.createdAt)}</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        request.status === "BEKLIYOR" ? "bg-amber-100 text-amber-700" :
                        request.status === "TAMAMLANDI" ? "bg-emerald-100 text-emerald-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {request.status === "BEKLIYOR" ? "Bekliyor" : 
                         request.status === "TAMAMLANDI" ? "Tamamlandı" : "İptal"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{request.content}</p>
                    {request.amount && (
                      <p className="text-sm font-semibold text-amber-700 mt-1">
                        {request.amount.toLocaleString("tr-TR")} ₺
                      </p>
                    )}
                    {request.status === "BEKLIYOR" && onCompleteRequest && (
                      <button
                        onClick={() => onCompleteRequest(request.id)}
                        className="mt-2 flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs hover:bg-emerald-200"
                      >
                        <Check className="w-3 h-3" /> Tamamlandı
                      </button>
                    )}
                  </div>
                ))}
                {muvekkilTalepleri.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Henüz talep yok</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              DAĞITIM & MUTABAKAT PANELİ
          ═══════════════════════════════════════════════════════════════════ */}
          {activePanel === "accounting" && (
            <div className="p-4">
              <div className="mb-3 p-2 bg-teal-50 rounded-lg">
                <p className="text-[10px] text-teal-600 uppercase tracking-wide flex items-center gap-1">
                  <Wallet className="w-3 h-3" />
                  Tahsilat dağıtım kayıtları
                </p>
                <p className="mt-1 text-[11px] text-teal-700">Tahsilatların müvekkil payı, ücret/masraf mahsubu ve payout öncesi dağıtım durumunu gösterir.</p>
              </div>

              {/* S8-B FAZ-2 — Ücret Sözleşmesi kartı (her uygun caseClient için bir kart; genelde tek). */}
              {eligibleDispositionClients.length > 0 && onFetchActiveFeeAgreement && (
                <div className="mb-4 space-y-2">
                  {eligibleDispositionClients.map((client) => {
                    const agreement = feeAgreementsByCaseClientId[client.id];
                    const isLoading = feeAgreementLoadingId === client.id && agreement === undefined;
                    const isFormOpen = feeAgreementFormFor === client.id;
                    const isActive = Boolean(agreement && agreement.status === "ACTIVE");
                    const isTerminating = isActive && feeAgreementTerminatingId === agreement!.id;

                    return (
                      <div key={client.id} className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                              Ücret Sözleşmesi{eligibleDispositionClients.length > 1 ? ` — ${client.name}` : ""}
                            </p>
                            {isLoading && <p className="mt-1 text-xs text-slate-400">Yükleniyor…</p>}
                            {!isLoading && isActive && agreement && (
                              <p className="mt-1 text-sm font-medium text-slate-700">{feeAgreementSummaryLabel(agreement)}</p>
                            )}
                            {!isLoading && !isActive && (
                              <p className="mt-1 text-sm text-slate-500">Aktif ücret sözleşmesi yok.</p>
                            )}
                          </div>
                          {!isLoading && !isFormOpen && (
                            <div className="flex shrink-0 gap-2">
                              {isActive && agreement ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditFeeAgreementForm(client.id, agreement)}
                                    className="rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                                  >
                                    Düzenle
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTerminateFeeAgreement(client.id, agreement)}
                                    disabled={isTerminating}
                                    className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {isTerminating && <Loader2 className="h-3 w-3 animate-spin" />}
                                    Sonlandır
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openCreateFeeAgreementForm(client.id)}
                                  className="inline-flex items-center gap-1 rounded-md border border-indigo-300 bg-white px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                                >
                                  <Plus className="h-3 w-3" /> Yeni Sözleşme
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {isFormOpen && (
                          <div className="mt-3 space-y-2 rounded-md border border-indigo-200 bg-white p-3">
                            <div className="grid gap-2 sm:grid-cols-2">
                              <label className="text-xs font-medium text-slate-600">
                                Ücret türü
                                <select
                                  aria-label="Ücret türü"
                                  value={feeAgreementFeeType}
                                  onChange={(e) => setFeeAgreementFeeType(e.target.value as "FLAT_AMOUNT" | "PERCENTAGE_OF_COLLECTION")}
                                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                >
                                  <option value="FLAT_AMOUNT">Sabit tutar</option>
                                  <option value="PERCENTAGE_OF_COLLECTION">Tahsilat yüzdesi</option>
                                </select>
                              </label>
                              {feeAgreementFeeType === "FLAT_AMOUNT" ? (
                                <label className="text-xs font-medium text-slate-600">
                                  Tutar (₺)
                                  <input
                                    aria-label="Ücret tutarı"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={feeAgreementAmountInput}
                                    onChange={(e) => setFeeAgreementAmountInput(e.target.value)}
                                    placeholder="0.00"
                                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </label>
                              ) : (
                                <label className="text-xs font-medium text-slate-600">
                                  Yüzde (%)
                                  <input
                                    aria-label="Ücret yüzdesi"
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={feeAgreementPercentInput}
                                    onChange={(e) => setFeeAgreementPercentInput(e.target.value)}
                                    placeholder="0.00"
                                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                </label>
                              )}
                            </div>
                            <label className="block text-xs font-medium text-slate-600">
                              Not (opsiyonel)
                              <input
                                aria-label="Sözleşme notu"
                                value={feeAgreementNoteInput}
                                onChange={(e) => setFeeAgreementNoteInput(e.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              />
                            </label>
                            {feeAgreementValidationError && (
                              <p className="flex items-center gap-1 text-xs text-red-600">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {feeAgreementValidationError}
                              </p>
                            )}
                            {feeAgreementSubmitError && (
                              <p className="flex items-center gap-1 text-xs text-red-600">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> {feeAgreementSubmitError}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-400">
                              Tutar/yüzde geçerliliği ve tek-aktif kuralı backend tarafından kesin doğrulanır.
                            </p>
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={closeFeeAgreementForm}
                                disabled={feeAgreementSubmitting}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Vazgeç
                              </button>
                              <button
                                type="button"
                                onClick={() => submitFeeAgreementForm(client.id)}
                                disabled={feeAgreementSubmitting}
                                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {feeAgreementSubmitting && <Loader2 className="h-3 w-3 animate-spin" />}
                                {feeAgreementFormMode === "create" ? "Oluştur" : "Kaydet (yeni versiyon)"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {postingActionMessage && (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {postingActionMessage}
                </div>
              )}
              <div className="space-y-2 max-h-[250px] overflow-y-auto">
                {muhasebeKayitlari.map(record => (
                  <div key={record.id} className="p-3 rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="w-3 h-3 text-teal-500" />
                      <span className="text-[10px] text-slate-400">{formatDateTime(record.createdAt)}</span>
                      <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium ${accountingTypeColors[record.type]}`}>
                        {accountingTypeLabels[record.type]}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{record.description}</p>
                    {record.amount && (
                      <p className={`text-sm font-semibold mt-1 ${
                        record.type === "ODEME_ALINDI" ? "text-emerald-600" : "text-slate-700"
                      }`}>
                        {record.type === "ODEME_ALINDI" ? "+" : ""}{record.amount.toLocaleString("tr-TR")} ₺
                      </p>
                    )}
                    {(() => {
                      const dispId = record.disposition?.id;
                      const st = String(record.disposition?.status || "").toUpperCase();
                      const busy = postingDispositionId === dispId;
                      const amt = Number(record.disposition?.totalAmount ?? record.amount ?? 0);
                      const amtOk = Number.isFinite(amt) && amt > 0;
                      const spin = busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />;
                      // S8-B FAZ-0 — HELD → öner; RECOMMENDED → onayla; APPROVED → kesinleştir; POSTED → dağıtıldı.
                      if (st === "HELD_PENDING_DISTRIBUTION") {
                        return (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => handleRecommendShortcut(record)} disabled={busy || !amtOk}
                              className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60">
                              {spin} Dağıtım Öner
                            </button>
                            <button type="button" onClick={() => openDistributionDecisionModal(record)} disabled={busy || !amtOk}
                              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60">
                              <ListTodo className="h-3 w-3" /> Dağıtımı Belirle
                            </button>
                          </div>
                        );
                      }
                      if (st === "DISTRIBUTION_RECOMMENDED") {
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Öneri — onay bekliyor</span>
                            <button type="button" onClick={() => handleApproveDispositionClick(record)} disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60">
                              {spin} Onayla
                            </button>
                          </div>
                        );
                      }
                      if (st === "DISTRIBUTION_APPROVED") {
                        return (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Onaylandı</span>
                            <button type="button" onClick={() => handlePostApprovedClick(record)} disabled={busy}
                              className="inline-flex items-center gap-1.5 rounded-md border border-teal-300 bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60">
                              {spin} Kesinleştir (Muhasebeleştir)
                            </button>
                          </div>
                        );
                      }
                      if (st === "POSTED") {
                        return (
                          <div className="mt-2">
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Dağıtıldı</span>
                          </div>
                        );
                      }
                      return null;
                    })()}                  </div>
                ))}
                {muhasebeKayitlari.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{accountingEmptyMessage}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {distributionModalRecord?.disposition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="distribution-decision-title">
          <div className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="distribution-decision-title" className="text-base font-semibold text-slate-900">Dağıtımı Belirle</h2>
                <p className="mt-1 text-sm text-slate-500">Tahsilat tutarını müvekkil payı, ücret/masraf mahsubu ve diğer dağıtım satırlarına ayırın.</p>
              </div>
              <button
                type="button"
                onClick={closeDistributionDecisionModal}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
              <div className="mb-4 grid gap-3 rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-900 sm:grid-cols-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">Tahsilat toplamı</p>
                  <p className="mt-1 font-semibold">{formatCents(activeDistributionTargetCents, activeDistributionCurrency)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">Dağıtılan</p>
                  <p className="mt-1 font-semibold">{formatCents(activeDistributionLineTotalCents, activeDistributionCurrency)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600">Kalan fark</p>
                  <p className={`mt-1 font-semibold ${activeDistributionDifferenceCents === 0 ? "text-teal-700" : "text-amber-700"}`}>
                    {formatCents(activeDistributionDifferenceCents, activeDistributionCurrency)}
                  </p>
                </div>
              </div>

              {onPrepareDistributionRecommendation && (
                <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/60 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <label className="text-xs font-medium text-slate-600">
                      Avukatlık ücreti (opsiyonel)
                      <input
                        aria-label="Avukatlık ücreti"
                        type="number"
                        min="0"
                        step="0.01"
                        value={distributionFeeInput}
                        onChange={(event) => setDistributionFeeInput(event.target.value)}
                        placeholder="0.00"
                        className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 sm:w-44"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handlePrepareRecommendation}
                      disabled={recommendationLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-md border border-indigo-300 bg-white px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {recommendationLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Dağıtım Önerisi Hazırla
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    Brüt → ücret → müvekkile kalan satırlarını önerir. Satırlar düzenlenebilir; kesinleşmeden önce yetkili onayı gerekir.
                  </p>
                  {recommendationError && (
                    <p className="mt-2 text-xs text-red-600">{recommendationError}</p>
                  )}
                  {recommendationWarnings.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {recommendationWarnings.map((warning, warnIndex) => (
                        <li key={warnIndex} className="flex items-start gap-1 text-[11px] text-amber-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {recommendationCandidates.length > 0 && (
                    <div className="mt-2 rounded-md border border-slate-200 bg-white p-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Masraf adayları (yalnız bilgi — otomatik uygulanmaz)
                      </p>
                      <ul className="mt-1 space-y-1">
                        {recommendationCandidates.map((candidate) => (
                          <li
                            key={candidate.expenseRequestId}
                            className="flex items-center justify-between gap-2 text-[11px] text-slate-600"
                          >
                            <span className="truncate">{candidate.expenseRequestId} · {candidate.status}</span>
                            <span className="font-medium text-slate-700">{candidate.remaining}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-3">
                {distributionLines.map((line, index) => {
                  const requiresClientField = isClientAttributedDistributionType(line.type);

                  return (
                    <div key={line.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-600">Satır {index + 1}</span>
                          {line.origin === "FEE_AGREEMENT" && (
                            <span
                              className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700"
                              title={line.feeAgreementId ? `Ücret sözleşmesi: ${line.feeAgreementId}` : "Ücret sözleşmesinden hesaplandı"}
                            >
                              Sözleşmeden hesaplandı
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeDistributionLine(line.id)}
                          disabled={distributionLines.length === 1}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 className="h-3 w-3" />
                          Satırı Sil
                        </button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1.3fr]">
                        <label className="text-xs font-medium text-slate-600">
                          Bucket
                          <select
                            aria-label="Dağıtım kalemi türü"
                            value={line.type}
                            onChange={(event) => updateDistributionLine(line.id, { type: event.target.value as DispositionPostingLineType })}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          >
                            {distributionBucketOptions.map((option) => (
                              <option key={option.type} value={option.type}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="text-xs font-medium text-slate-600">
                          Tutar
                          <input
                            aria-label="Dağıtım tutarı"
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.amount}
                            onChange={(event) => updateDistributionLine(line.id, { amount: event.target.value })}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          />
                        </label>

                        {requiresClientField ? (
                          <label className="text-xs font-medium text-slate-600">
                            Alacaklı
                            <select
                              aria-label="Alacaklı seçimi"
                              value={line.caseClientId}
                              onChange={(event) => updateDistributionLine(line.id, { caseClientId: event.target.value })}
                              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                            >
                              <option value="">Alacaklı seçin</option>
                              {eligibleClientsForDisposition.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs text-slate-500">
                            <span className="font-medium text-slate-600">Alacaklı</span>
                            <p className="mt-1">Bu bucket için caseClientId gerekmez.</p>
                          </div>
                        )}
                      </div>

                      <label className="mt-3 block text-xs font-medium text-slate-600">
                        Not
                        <input
                          aria-label="Dağıtım notu"
                          value={line.note}
                          onChange={(event) => updateDistributionLine(line.id, { note: event.target.value })}
                          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                          placeholder="Opsiyonel"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={addDistributionLine}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:border-teal-300 hover:text-teal-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Satır Ekle
              </button>

              {distributionFeedbackMessage && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {distributionFeedbackMessage}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={closeDistributionDecisionModal}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDistributionDecisionSubmit}
                disabled={!canSubmitDistributionDecision}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDistributionSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Dağıtım Önerisini Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OperationDeck;
