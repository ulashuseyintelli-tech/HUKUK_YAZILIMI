"use client";

import { useState, useEffect } from "react";
import { api, type ClaimLiabilityStateDTO } from "@/lib/api";
import { CLAIM_LIABILITY_KIND_LABELS, ClaimLiabilitySelectionDrawer } from "./ClaimLiabilitySelectionDrawer";
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock } from '@/lib/use-submit-lock';
import { getInterestReadDisplayLabel } from "@/lib/interest-type-resolver";
import type { AnaparasizKalemDokumu } from "@/hooks/useCaseCalculation";
import {
  ATTORNEY_FEE_BASIS_LABELS,
  attorneyFeeBasisLabel,
  type AttorneyFeeBasis,
  CLAIM_ITEM_TYPE_LABELS,
  INTEREST_ACCRUAL_STATUS_LABELS,
  INTEREST_START_PROVENANCE_OPTIONS,
  PROVENANCE_WITHOUT_START_DATE,
  type InterestAccrualStatusCode,
} from "./claim-item-labels";
import {
  DollarSign,
  Plus,
  Trash2,
  Calculator,
  FileText,
  Loader2,
  RefreshCw,
  Percent,
  Receipt,
  Scale,
  AlertCircle,
  Pencil,
} from "lucide-react";

interface ClaimItem {
  id: string;
  itemType: string;
  amount: number;
  currency: string;
  description?: string;
  referenceNo?: string;
  interestType?: string;
  interestTypeCode?: string | null;
  interestAccrualStatus?: string | null;
  /** Faiz başlangıcının kayıtlı dayanağı (InterestStartDateProvenance); null = kayıtlı değil. */
  interestStartDateProvenance?: string | null;
  interestRate?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  dueDate?: string;
  sourceDocumentType?: string;
  /** Vekâlet ücretinin kayıtlı hukuki kaynağı (owner K1); yalnız ATTORNEY_FEE; null = bilinmiyor (çıkarım yok). */
  attorneyFeeBasis?: AttorneyFeeBasis | null;
  sortOrder?: number;
  status: string;
  isCalculated: boolean;
}

// Vekâlet ücreti kaynağı etiketleri ortak etiket modülünde; mevcut içe aktarmalar için buradan yeniden dışa aktarılır.
export { ATTORNEY_FEE_BASIS_LABELS, attorneyFeeBasisLabel, type AttorneyFeeBasis } from "./claim-item-labels";

interface ClaimSummaryTotals {
  principal: number;
  preInterest: number;
  postInterest: number;
  totalInterest: number;
  expense: number;
  fee: number;
  attorneyFee: number;
  penalty: number;
  tax: number;
  other: number;
  grandTotal: number;
}

/** Özet toplamlarının para birimi bağlamı — sunucu kararı (API: claim-item/claim-summary-currency.ts). */
interface ClaimSummaryCurrencyStatus {
  durum: "KALEM_YOK" | "TEK_PARA_BIRIMI" | "KARMA_PARA_BIRIMI" | "PARA_BIRIMI_EKSIK";
  /** `currency` + `totals` tek tutar olarak gösterilebilir mi? */
  toplamGosterilebilir: boolean;
  gerekce: string | null;
  mesaj: string | null;
  alacakParaBirimi: string | null;
  paraBirimleri: string[];
  paraBirimiEksikKalemSayisi: number;
  toplamlarParaBirimiBazinda: { paraBirimi: string; kalemSayisi: number; totals: ClaimSummaryTotals }[];
}

/**
 * Anaparasız dosyada üst özet kutusu ve "Alacak Özeti" (18.11.2026): bu panelin kendi özeti (claim-items summary) faizi
 * yalnız faiz TÜRÜNDEKİ kalemlerden toplar; anaparasız dosyada kalem faizi orada YOKTUR → "0,00" bilinmeyeni sıfır gibi
 * gösteriyordu. Doğru durum sunucunun anaparasız dökümündedir (calculation-summary.anaparasizKalemDokumu: faiz toplamı
 * yalnız her kalemin faiz durumu belliyken dolu, aksi hâlde null — sıfır DEĞİL; nihai borç her zaman null). İstemci hesap
 * YAPMAZ; yalnız sunucu değerini gösterir.
 */
type AnaparasizDokumDurumu =
  | { kaynak: "YOK" }
  | { kaynak: "DOKUM"; dokum: AnaparasizKalemDokumu }
  | { kaynak: "OKUNAMADI" };

async function readAnaparasizDokum(caseId: string): Promise<AnaparasizDokumDurumu> {
  try {
    const res = await api.get(`/cases/${caseId}/calculation-summary`);
    const body = (res as { data?: unknown } | undefined)?.data as Record<string, unknown> | undefined;
    const hesap = (body && typeof body === "object" && !Array.isArray(body) && "anaparasizKalemDokumu" in body
      ? body
      : (body?.data as Record<string, unknown> | undefined)) ?? undefined;
    const dokum = hesap && typeof hesap === "object" && !Array.isArray(hesap)
      ? (hesap.anaparasizKalemDokumu as AnaparasizKalemDokumu | undefined)
      : undefined;
    if (dokum && dokum.gerekce === "NO_PRINCIPAL_BASIS" && Array.isArray(dokum.paraBirimleri)) return { kaynak: "DOKUM", dokum };
    return { kaynak: "YOK" };
  } catch {
    return { kaynak: "OKUNAMADI" };
  }
}

interface ClaimSummary {
  caseId: string;
  currency: string;
  items: { type: string; label: string; amount: number; count: number }[];
  totals: ClaimSummaryTotals;
  calculationDate: string;
  /** Eski sunucu yanıtında yoktur; yoksa gösterim aynen sürer. */
  paraBirimiDurumu?: ClaimSummaryCurrencyStatus;
}

/** Karma para birimli dosyada tek toplam yerine "gösterilemez" yazılan özet kartları (tek para birimli dosyadaki dört kart). */
const TOPLAM_KARTLARI: { baslik: string; kutu: string; etiket: string }[] = [
  { baslik: "Asıl Alacak", kutu: "bg-blue-50 border-blue-200", etiket: "text-blue-700" },
  { baslik: "Toplam Faiz", kutu: "bg-green-50 border-green-200", etiket: "text-green-700" },
  { baslik: "Masraf + Harç", kutu: "bg-orange-50 border-orange-200", etiket: "text-orange-700" },
  { baslik: "Toplam Alacak", kutu: "bg-purple-50 border-purple-200", etiket: "text-purple-700" },
];

/** Para birimi bazındaki özet satırları (sunucunun kategori toplamları; tutarı 0 olan satır yazılmaz). */
const PARA_BIRIMI_TOPLAM_SATIRLARI: { alan: keyof ClaimSummaryTotals; etiket: string }[] = [
  { alan: "principal", etiket: "Asıl Alacak (Ana Para)" },
  { alan: "preInterest", etiket: "Takip Öncesi Faiz" },
  { alan: "postInterest", etiket: "Takip Sonrası Faiz" },
  { alan: "expense", etiket: "Masraflar" },
  { alan: "fee", etiket: "Harçlar" },
  { alan: "attorneyFee", etiket: "Vekalet Ücreti" },
  { alan: "penalty", etiket: "Tazminatlar" },
  { alan: "tax", etiket: "Vergiler (KDV/BSMV/KKDF)" },
  { alan: "other", etiket: "Diğer" },
];

// Etiket metinleri tek kaynaktan (claim-item-labels); burada yalnız simge ve renk eklenir.
const L = CLAIM_ITEM_TYPE_LABELS;
const itemTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  PRINCIPAL: { label: L.PRINCIPAL, icon: DollarSign, color: "text-blue-600 bg-blue-100" },
  INTEREST: { label: L.INTEREST, icon: Percent, color: "text-green-600 bg-green-100" },
  PRE_INTEREST: { label: L.PRE_INTEREST, icon: Percent, color: "text-green-600 bg-green-100" },
  POST_INTEREST: { label: L.POST_INTEREST, icon: Percent, color: "text-emerald-600 bg-emerald-100" },
  EXPENSE: { label: L.EXPENSE, icon: Receipt, color: "text-orange-600 bg-orange-100" },
  FEE: { label: L.FEE, icon: Receipt, color: "text-amber-600 bg-amber-100" },
  ATTORNEY_FEE: { label: L.ATTORNEY_FEE, icon: Scale, color: "text-purple-600 bg-purple-100" },
  PENALTY: { label: L.PENALTY, icon: AlertCircle, color: "text-red-600 bg-red-100" },
  CHECK_PENALTY: { label: L.CHECK_PENALTY, icon: AlertCircle, color: "text-red-600 bg-red-100" },
  CONTRACTUAL_PENALTY: { label: L.CONTRACTUAL_PENALTY, icon: AlertCircle, color: "text-red-600 bg-red-100" },
  TAX_KDV: { label: L.TAX_KDV, icon: Receipt, color: "text-gray-600 bg-gray-100" },
  TAX_BSMV: { label: L.TAX_BSMV, icon: Receipt, color: "text-gray-600 bg-gray-100" },
  TAX_KKDF: { label: L.TAX_KKDF, icon: Receipt, color: "text-gray-600 bg-gray-100" },
  OTHER: { label: L.OTHER, icon: FileText, color: "text-gray-600 bg-gray-100" },
  // İlamda hükmedilen yargılama gideri — tebligat masrafından ayrı tür.
  YARGILAMA_GIDERI: { label: L.YARGILAMA_GIDERI, icon: Scale, color: "text-orange-700 bg-orange-50" },
};

interface Props {
  caseId: string;
  /** PR-5a: salt görüntüleme — tüm mutation aksiyonları (ekle/sil/yeniden-hesapla) gizlenir. */
  readOnly?: boolean;
  /** PR-5c: per-item metadata-only düzenleme (amount/itemType kilitli; readOnly ile kompoze edilir). */
  metadataEdit?: boolean;
  onMetadataEditSuccess?: () => void | Promise<void>;
}

export function ClaimItemPanel({
  caseId,
  readOnly = false,
  metadataEdit = false,
  onMetadataEditSuccess,
}: Props) {
  const [items, setItems] = useState<ClaimItem[]>([]);
  const [summary, setSummary] = useState<ClaimSummary | null>(null);
  // null = henüz okunmadı. Yalnız anapara 0 ve kalem varken okunur (anaparasız dosya); aksi hâlde "YOK".
  const [anaparasiz, setAnaparasiz] = useState<AnaparasizDokumDurumu | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  // PR-2A1: finansal mutation hatalari GORUNUR; faiz/kalem degeri uydurulmaz.
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  // Silmesi KESINLESMIS fakat listede hala gorunen kalemler (SUCCESS_STALE).
  const [deletedStaleIds, setDeletedStaleIds] = useState<string[]>([]);
  const [refreshingStale, setRefreshingStale] = useState(false);
  const rowLock = useKeyedSubmitLock();
  const handleStaleRefresh = async () => {
    setRefreshingStale(true);
    const ok = await runRefreshOnly(() => loadData({ propagateError: true }));
    setRefreshingStale(false);
    if (ok) {
      setStaleNotice(null);
      setDeletedStaleIds([]);
    }
  };
  const [addType, setAddType] = useState<string>("");
  const [editItem, setEditItem] = useState<ClaimItem | null>(null); // PR-5c: metadata-edit modal hedefi
  // Seçimlik borçlu sorumluluğu: kalem başına durum (sunucu hesabı). Okunamazsa panel aynen çalışır, etiket gösterilmez.
  const [liability, setLiability] = useState<ClaimLiabilityStateDTO | null>(null);
  const [liabilityTarget, setLiabilityTarget] = useState<{ claimItemIds: string[]; presetJointAll: boolean } | null>(null);
  const [liabilityNotice, setLiabilityNotice] = useState<string | null>(null);
  // Seçim, metadata düzenlemesi gibi ONAYA giden bir taleptir (kalem doğrudan değişmez). Dosya sayfası paneli
  // "salt okunur + düzenleme kipi" ile kullanır: kalem ekleme / silme gizlidir ama onaya giden talepler açıktır.
  // Giriş bu yüzden düzenleme kipine bağlıdır; yalnız görüntüleme panelinde (düzenleme kipi kapalı) giriş yoktur.
  const canRequestLiability = Boolean(liability?.secimYazmaAcik) && (!readOnly || metadataEdit);
  const loadLiability = async (): Promise<void> => {
    try {
      setLiability(await api.getCaseClaimLiability(caseId));
    } catch {
      setLiability(null);
    }
  };

  useEffect(() => {
    void loadData();
    void loadLiability();
  }, [caseId]);

  // PR-2A1 DEPENDENCY_FIXED: `console.error` tek başına handling değildir — panel
  // sessizce boşalıyordu. Hata GÖRÜNÜR; mutation refresh'i olarak çağrıldığında
  // (`propagateError: true`) çağırana propagate edilir, aksi hâlde `runMutation`
  // tazeleme hatasını göremez ve SUCCESS_STALE hiç çalışmaz.
  // Malformed yanıt GERÇEK EMPTY sayılmaz: finansal listede boş liste ile bozuk
  // yanıt aynı şey değildir.
  const loadData = async (opts?: { propagateError?: boolean }): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const [itemsRes, summaryRes] = await Promise.all([
        api.get(`/claim-items/case/${caseId}`),
        api.get(`/claim-items/case/${caseId}/summary`),
      ]);
      const rows = (itemsRes as { data?: { data?: unknown } })?.data?.data;
      if (!Array.isArray(rows)) throw new Error('MALFORMED_LIST_RESPONSE');
      setItems(rows as ClaimItem[]);
      const ozet = ((summaryRes as { data?: { data?: unknown } })?.data?.data as ClaimSummary) ?? null;
      setSummary(ozet);
      // Anaparasız dosya: üst kutudaki faiz / toplam için sunucunun anaparasız dökümü (hata paneli BOZMAZ → OKUNAMADI).
      if (ozet?.totals && ozet.totals.principal === 0 && rows.length > 0) {
        setAnaparasiz(null);
        setAnaparasiz(await readAnaparasizDokum(caseId));
      } else {
        setAnaparasiz({ kaynak: "YOK" });
      }
    } catch (error) {
      setLoadError(toActionErrorMessage(error, 'Alacak kalemleri yüklenemedi.'));
      if (opts?.propagateError) throw error;
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number, currency = "TRY") => {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(amount);
  };

  const handleDelete = async (id: string) => {
    // Cancel mutation BAŞLATMAZ; hiçbir istek gitmez, retry üretilmez.
    if (!confirm("Bu alacak kalemi için silme talebi oluşturulsun mu?")) return;
    setActionError(null);
    setStaleNotice(null);
    setApprovalNotice(null);

    // PR-2A1: aynı kalem için senkron keyed lock; FARKLI kalemler birbirini bloklamaz.
    await rowLock.run(`claim-item:delete:${caseId}:${id}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.delete(`/claim-items/${id}`),
        // Tazeleme yalnız TERMINAL domain success'te anlamlıdır; `approvalRequired`
        // dalında aşağıda ATLANIR (bkz. refresh koşulu).
        refresh: undefined,
        failureMessage: 'Alacak kalemi silinemedi. Kayıt DURUYOR, lütfen tekrar deneyin.',
      });

      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') {
        // Satır ve seçim AYNEN korunur (pessimistic).
        setActionError(outcome.error.message);
        return;
      }

      // HTTP başarısı ≠ domain başarısı. `approvalRequired` bir ARA DURUMDUR:
      // silme GERÇEKLEŞMEDİ, kalem duruyor. Bu yüzden success yan etkisi (liste
      // tazeleme, satır kaldırma) ÇALIŞMAZ; yalnız mevcut onay yüzeyi bildirilir.
      const envelope = (outcome.data as { data?: { data?: { approvalRequired?: boolean } } })
        ?.data?.data;
      if (envelope?.approvalRequired) {
        setApprovalNotice(
          'Silme talebi onaya gönderildi. Alacak kalemi ONAY VERİLENE KADAR DURUR.',
        );
        return;
      }

      // Terminal domain success → liste sunucudan yeniden okunur.
      const refreshed = await runRefreshOnly(() => loadData({ propagateError: true }));
      if (!rowLock.isMounted()) return;
      if (!refreshed) {
        // Silme KESİNLEŞTİ; tekrar delete SUNULMAZ, yalnız refresh-only uzlaştırma.
        setStaleNotice('Alacak kalemi SİLİNDİ, ancak liste yenilenemedi.');
        setDeletedStaleIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      }
    });
  };

  const handleRecalculateInterest = async () => {
    setActionError(null);
    setStaleNotice(null);
    setApprovalNotice(null);

    // PR-2A1: ANAHTAR gerçek endpoint sözleşmesinden türer —
    // `POST /claim-items/case/:caseId/recalculate-interest` DOSYA kapsamlıdır,
    // kalem kimliği taşımaz. Bu yüzden anahtar da dosya bazlıdır; kalem kimliği
    // eklemek aynı dosya için eşzamanlı çift hesaplamaya izin verirdi.
    await rowLock.run(`claim-item:interest:${caseId}`, async () => {
      const outcome = await runMutation({
        mutate: () => api.post(`/claim-items/case/${caseId}/recalculate-interest`),
        // Sonuç YALNIZ sunucudan yeniden okunarak gösterilir; yerel faiz değeri
        // ASLA uydurulmaz. Başarısızlıkta eski değerler olduğu gibi kalır.
        refresh: () => loadData({ propagateError: true }),
        failureMessage: 'Faiz yeniden hesaplanamadı. Mevcut değerler DEĞİŞMEDİ.',
        staleMessage: 'Faiz YENİDEN HESAPLANDI, ancak liste yenilenemedi.',
      });

      if (!rowLock.isMounted()) return;
      if (outcome.status === 'FAILED') {
        setActionError(outcome.error.message);
        return;
      }
      if (outcome.status === 'SUCCESS_STALE') setStaleNotice(outcome.stale);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Para birimi bağlamı (sunucu kararı; istemci hesabı ve çevirme YOK): etkin kalemler tek para biriminde değilse özetin
  // tek toplamı geçerli tutar değildir → tek toplam yerine "gösterilemez", toplamlar sunucunun para birimi bazındaki
  // değerleriyle yazılır. Karar yoksa (eski sunucu yanıtı) ya da toplam gösterilebiliyorsa gösterim aynen sürer.
  const paraBirimiDurumu = summary?.paraBirimiDurumu;
  const toplamKisitli = paraBirimiDurumu ? !paraBirimiDurumu.toplamGosterilebilir : false;
  // Anaparasız kip: anapara 0 + kalem var ve sunucu dosyanın anaparasız OLMADIĞINI söylemedi (okunuyor / döküm / okunamadı).
  const anaparasizKip = !!summary && summary.totals.principal === 0 && items.length > 0 && anaparasiz?.kaynak !== "YOK";
  const anaparasizGrup = anaparasiz?.kaynak === "DOKUM" && summary
    ? (anaparasiz.dokum.paraBirimleri.find((g) => g.paraBirimi === summary.currency)
      ?? (anaparasiz.dokum.paraBirimleri.length === 1 ? anaparasiz.dokum.paraBirimleri[0] : undefined))
    : undefined;
  // Sunucunun faiz toplamı (yalnız her kalemin faiz durumu belliyken sayı; gerçek sıfır dahil). Aksi hâlde null = belirlenemedi.
  const anaparasizFaiz: number | null = anaparasizGrup && typeof anaparasizGrup.faizToplami === "number" ? anaparasizGrup.faizToplami : null;
  const anaparasizOkunuyor = anaparasizKip && anaparasiz === null;

  return (
    <div className="space-y-6">
      {/* PR-2A1: okuma ve finansal mutation hataları GÖRÜNÜR — tek kopya, ana render
          dalında. Loading erken dönüşünde bant GÖSTERİLMEZ (loading/load-error/data
          durumları birbirine karışmaz). */}
      <ActionError message={loadError} />
      <ActionError message={actionError} />
      {approvalNotice ? (
        <div
          role="status"
          data-testid="approval-notice"
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800"
        >
          {approvalNotice}
        </div>
      ) : null}
      {staleNotice ? (
        <div
          role="status"
          data-testid="stale-notice"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          <span className="flex-1">{staleNotice}</span>
          <button
            type="button"
            onClick={handleStaleRefresh}
            disabled={refreshingStale}
            data-testid="stale-refresh"
            className="shrink-0 rounded border border-amber-300 px-1.5 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Listeyi yenile
          </button>
        </div>
      ) : null}

      {/* Para birimi bağlamı: tek toplam gösterilmedi (sunucu metni) */}
      {toplamKisitli && paraBirimiDurumu?.mesaj ? (
        <div
          role="status"
          data-testid="claim-summary-currency-notice"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {paraBirimiDurumu.mesaj}
        </div>
      ) : null}

      {/* Özet Kartları — tek toplam gösterilemiyorsa tutar yerine "gösterilemez" */}
      {summary && toplamKisitli && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TOPLAM_KARTLARI.map((kart) => (
            <div key={kart.baslik} className={`${kart.kutu} rounded-xl border p-4`}>
              <p className={`text-sm ${kart.etiket}`}>{kart.baslik}</p>
              <p data-testid="claim-summary-card-unavailable" className="text-sm font-medium text-gray-500">
                gösterilemez
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Özet Kartları */}
      {summary && !toplamKisitli && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-sm text-blue-700">Asıl Alacak</p>
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(summary.totals.principal, summary.currency)}
            </p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <p className="text-sm text-green-700">Toplam Faiz</p>
            {!anaparasizKip ? (
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(summary.totals.totalInterest, summary.currency)}
              </p>
            ) : anaparasizOkunuyor ? (
              <p data-testid="claim-summary-interest-loading" className="text-sm font-medium text-gray-500">…</p>
            ) : anaparasizFaiz !== null ? (
              <>
                <p data-testid="claim-summary-interest-principal-free" className="text-xl font-bold text-green-600">
                  {formatCurrency(anaparasizFaiz, summary.currency)}
                </p>
                <p className="text-[11px] text-green-700">açıklayıcı döküm; ayrıntı Hesap Özeti</p>
              </>
            ) : (
              <p data-testid="claim-summary-interest-undetermined" className="text-sm font-medium text-gray-500">
                belirlenemedi
              </p>
            )}
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
            <p className="text-sm text-orange-700">Masraf + Harç</p>
            <p className="text-xl font-bold text-orange-600">
              {formatCurrency(summary.totals.expense + summary.totals.fee, summary.currency)}
            </p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
            <p className="text-sm text-purple-700">Toplam Alacak</p>
            {!anaparasizKip ? (
              <p className="text-2xl font-bold text-purple-600">
                {formatCurrency(summary.totals.grandTotal, summary.currency)}
              </p>
            ) : (
              <>
                {/* Anaparasız dosyada nihai borç toplamı yoktur (sunucu: nihaiBorcToplami null); kalem toplamı nihai borç gibi sunulmaz. */}
                <p data-testid="claim-summary-total-not-final" className="text-sm font-medium text-gray-500">hesaplanamadı</p>
                <p className="text-[11px] text-purple-700">
                  Kalem tutarları toplamı {formatCurrency(summary.totals.grandTotal, summary.currency)}; nihai borç değildir
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Aksiyon Butonları — PR-5a: readOnly'de TÜMÜYLE gizli (mutation + deprecated recalculate/add-interest uçları). */}
      {!readOnly && (
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { setAddType("PRINCIPAL"); setShowAddModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Plus className="h-4 w-4" />
          Ana Para Ekle
        </button>
        <button
          onClick={() => { setAddType("INTEREST"); setShowAddModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
        >
          <Percent className="h-4 w-4" />
          Faiz Ekle
        </button>
        <button
          onClick={() => { setAddType("EXPENSE"); setShowAddModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
        >
          <Receipt className="h-4 w-4" />
          Masraf Ekle
        </button>
        <button
          onClick={() => { setAddType("FEE"); setShowAddModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
        >
          <Receipt className="h-4 w-4" />
          Harç Ekle
        </button>
        <button
          onClick={() => { setAddType("ATTORNEY_FEE"); setShowAddModal(true); }}
          className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
        >
          <Scale className="h-4 w-4" />
          Vekalet Ücreti
        </button>
        <button
          onClick={handleRecalculateInterest}
          className="flex items-center gap-2 px-3 py-2 border rounded-lg hover:bg-gray-50 text-sm ml-auto"
        >
          <RefreshCw className="h-4 w-4" />
          Faizleri Yeniden Hesapla
        </button>
      </div>
      )}


      {/* Alacak Kalemleri Listesi */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h3 className="font-semibold flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Alacak Kalemleri ({items.length})
          </h3>
          {canRequestLiability && items.some((item) => item.status === "ACTIVE") && (
            <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="claim-liability-bulk-actions">
              <button
                type="button"
                data-testid="claim-liability-bulk-button"
                onClick={() =>
                  setLiabilityTarget({
                    claimItemIds: items.filter((item) => item.status === "ACTIVE").map((item) => item.id),
                    presetJointAll: false,
                  })
                }
                className="rounded border px-2 py-1 text-xs hover:bg-white"
              >
                Borçlu sorumluluğu: dosyadaki kalemlere uygula
              </button>
              <button
                type="button"
                data-testid="claim-liability-bulk-joint-button"
                onClick={() =>
                  setLiabilityTarget({
                    claimItemIds: items.filter((item) => item.status === "ACTIVE").map((item) => item.id),
                    presetJointAll: true,
                  })
                }
                className="rounded border px-2 py-1 text-xs hover:bg-white"
                title="Tür müteselsil ve bütün etkin borçlular seçili gelir; dayanak ve onay yine istenir."
              >
                Tümü müteselsil (kısa yol)
              </button>
            </div>
          )}
          {liabilityNotice && (
            <p data-testid="claim-liability-notice" className="mt-2 text-xs text-indigo-800">
              {liabilityNotice}
            </p>
          )}
        </div>
        <div className="divide-y">
          {items.map((item) => {
            const typeInfo = itemTypeLabels[item.itemType] || itemTypeLabels.OTHER;
            const Icon = typeInfo.icon;
            const interestLabel = getInterestReadDisplayLabel(item);
            return (
              <div key={item.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${typeInfo.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{typeInfo.label}</span>
                      {item.itemType === "ATTORNEY_FEE" && (
                        <span
                          data-testid={`claim-item-attorney-fee-basis-${item.id}`}
                          className={`px-2 py-0.5 text-xs rounded ${
                            item.attorneyFeeBasis ? "bg-purple-50 text-purple-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {attorneyFeeBasisLabel(item.attorneyFeeBasis)}
                        </span>
                      )}
                      {item.isCalculated && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          Otomatik
                        </span>
                      )}
                      {(() => {
                        // Seçimlik sorumluluk: seçimi olmayan kalem "Belirlenmedi" görünür (salt okunur etiket).
                        const durum = liability?.kalemler.find((kalem) => kalem.claimItemId === item.id);
                        if (!durum) return null;
                        return (
                          <span
                            data-testid={`claim-item-liability-${item.id}`}
                            className={`px-2 py-0.5 text-xs rounded ${
                              durum.uzlasiyor ? "bg-indigo-50 text-indigo-700" : "bg-red-50 text-red-700"
                            }`}
                            title={
                              durum.uzlasiyor
                                ? "Borçlu sorumluluğu"
                                : "Seçim geçmiş tahsilatla uzlaşmıyor; borçluya bağlı mahsup bu kalemde durur. Seçim yeniden yapılmalı."
                            }
                          >
                            Sorumluluk: {CLAIM_LIABILITY_KIND_LABELS[durum.sorumlulukTuru]}
                            {!durum.uzlasiyor ? " — uzlaşmıyor" : ""}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.description || item.referenceNo || "-"}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      {item.dueDate && (
                        <span className="text-xs text-gray-500">
                          Vade: {new Date(item.dueDate).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                      {interestLabel && (
                        <span className="text-xs text-green-600">
                          {item.interestRate != null ? `%${item.interestRate} ` : ''}{interestLabel}
                        </span>
                      )}
                      {item.interestStartDate && item.interestEndDate && (
                        <span className="text-xs text-orange-600">
                          {new Date(item.interestStartDate).toLocaleDateString("tr-TR")} - {new Date(item.interestEndDate).toLocaleDateString("tr-TR")}
                        </span>
                      )}
                      {(() => {
                        // Kayıtlı faiz durumu ve (faiz işliyorsa) başlangıç + dayanağı; yalnız kayıttan, tahmin yok.
                        const status = item.interestAccrualStatus ?? "UNKNOWN";
                        const statusLabel = INTEREST_ACCRUAL_STATUS_LABELS[status as InterestAccrualStatusCode] ?? "Tanımsız durum";
                        const parts = [`Faiz: ${statusLabel}`];
                        if (status === "ACCRUES") {
                          if (item.interestStartDate) parts.push(`başlangıç ${new Date(item.interestStartDate).toLocaleDateString("tr-TR")}`);
                          const provenance = item.interestStartDateProvenance;
                          parts.push(
                            provenance
                              ? `dayanak: ${INTEREST_START_PROVENANCE_OPTIONS.find((o) => o.code === provenance)?.label ?? "tanımsız"}`
                              : "dayanak kayıtlı değil",
                          );
                        }
                        return (
                          <span data-testid={`claim-item-interest-status-${item.id}`} className="text-xs text-gray-600">
                            {parts.join(" · ")}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {formatCurrency(item.amount, item.currency)}
                  </span>
                  {canRequestLiability && item.status === "ACTIVE" && (
                    <button
                      type="button"
                      data-testid={`claim-item-liability-select-${item.id}`}
                      onClick={() => setLiabilityTarget({ claimItemIds: [item.id], presetJointAll: false })}
                      className="px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 rounded-lg"
                      title="Borçlu sorumluluğunu seç (onaya gider)"
                    >
                      Sorumluluk
                    </button>
                  )}
                  {metadataEdit && (
                  <button
                    onClick={() => setEditItem(item)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Metadata düzenle (tutar ve kalem tipi kilitli)"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Düzenle
                  </button>
                  )}
                  {!readOnly && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    // PR-2A1: `title="Sil"` erisilebilir ad olarak YETMEZ ve coklu
                    // kalemde hangi satir oldugunu ayirt ettirmez. Ad kalem kimligine
                    // baglanir; ekran okuyucu ve testler dogru satiri hedefler.
                    aria-label={`${itemTypeLabels[item.itemType]?.label ?? 'Kalem'} kalemini sil`}
                    // SUCCESS_STALE: silme KESINLESTI, gorunum bayat — bu satir icin
                    // silme AKSIYONU KAPALI; yalniz refresh-only uzlastirma sunulur.
                    // Diger kalemler ETKILENMEZ.
                    disabled={deletedStaleIds.includes(item.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  )}
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              Henüz alacak kalemi eklenmemiş
            </div>
          )}
        </div>
      </div>


      {/* Detaylı Özet Tablosu — tek toplam gösterilemiyorsa: toplamlar para birimi bazında (sunucu değerleri) */}
      {summary && toplamKisitli && (
        <div className="bg-white rounded-xl border p-6" data-testid="claim-summary-by-currency">
          <h4 className="font-semibold mb-4">Alacak Özeti</h4>
          <div className="space-y-4">
            {(paraBirimiDurumu?.toplamlarParaBirimiBazinda ?? []).map((grup) => (
              <div key={grup.paraBirimi} data-testid={`claim-summary-currency-${grup.paraBirimi}`} className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">
                  {grup.paraBirimi} · {grup.kalemSayisi} kalem
                </p>
                {PARA_BIRIMI_TOPLAM_SATIRLARI.filter((satir) => grup.totals[satir.alan] > 0).map((satir) => (
                  <div key={satir.alan} className="flex justify-between py-2 border-b">
                    <span>{satir.etiket}</span>
                    <span className="font-medium">{formatCurrency(grup.totals[satir.alan], grup.paraBirimi)}</span>
                  </div>
                ))}
                <div className="flex justify-between py-2 font-semibold">
                  {/* Anaparasız dosyada bu rakam kalem tutarları toplamıdır (faiz hariç); nihai borç gibi adlandırılmaz. */}
                  <span>{anaparasizKip ? `Kalem tutarları toplamı (${grup.paraBirimi}; faiz hariç, nihai borç değil)` : `Toplam (${grup.paraBirimi})`}</span>
                  <span>{formatCurrency(grup.totals.grandTotal, grup.paraBirimi)}</span>
                </div>
              </div>
            ))}
            <div className="flex justify-between py-3 bg-primary/10 rounded px-3 mt-2">
              <span className="font-semibold">TOPLAM ALACAK</span>
              <span data-testid="claim-summary-grand-total-unavailable" className="font-medium text-gray-500">
                gösterilemez
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Detaylı Özet Tablosu */}
      {summary && !toplamKisitli && (
        <div className="bg-white rounded-xl border p-6">
          <h4 className="font-semibold mb-4">Alacak Özeti</h4>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b">
              <span>Asıl Alacak (Ana Para)</span>
              <span className="font-medium">{formatCurrency(summary.totals.principal, summary.currency)}</span>
            </div>
            {summary.totals.preInterest > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Takip Öncesi Faiz</span>
                <span className="font-medium">{formatCurrency(summary.totals.preInterest, summary.currency)}</span>
              </div>
            )}
            {summary.totals.postInterest > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Takip Sonrası Faiz</span>
                <span className="font-medium">{formatCurrency(summary.totals.postInterest, summary.currency)}</span>
              </div>
            )}
            {summary.totals.expense > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Masraflar</span>
                <span className="font-medium">{formatCurrency(summary.totals.expense, summary.currency)}</span>
              </div>
            )}
            {summary.totals.fee > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Harçlar</span>
                <span className="font-medium">{formatCurrency(summary.totals.fee, summary.currency)}</span>
              </div>
            )}
            {summary.totals.attorneyFee > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Vekalet Ücreti</span>
                <span className="font-medium">{formatCurrency(summary.totals.attorneyFee, summary.currency)}</span>
              </div>
            )}
            {summary.totals.penalty > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Tazminatlar</span>
                <span className="font-medium">{formatCurrency(summary.totals.penalty, summary.currency)}</span>
              </div>
            )}
            {summary.totals.tax > 0 && (
              <div className="flex justify-between py-2 border-b">
                <span>Vergiler (KDV/BSMV/KKDF)</span>
                <span className="font-medium">{formatCurrency(summary.totals.tax, summary.currency)}</span>
              </div>
            )}
            {anaparasizKip ? (
              <>
                <div className="flex justify-between py-2 border-b" data-testid="claim-summary-principal-free-interest-row">
                  <span>Faiz</span>
                  <span className="font-medium">
                    {anaparasizOkunuyor ? "…" : anaparasizFaiz !== null ? formatCurrency(anaparasizFaiz, summary.currency) : "belirlenemedi"}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b">
                  <span>Kalem tutarları toplamı (faiz hariç)</span>
                  <span className="font-medium">{formatCurrency(summary.totals.grandTotal, summary.currency)}</span>
                </div>
                <div className="flex justify-between py-3 bg-primary/10 rounded px-3 mt-2">
                  <span className="font-semibold">TOPLAM ALACAK</span>
                  <span data-testid="claim-summary-grand-total-not-final" className="font-medium text-gray-500">hesaplanamadı</span>
                </div>
                <p data-testid="claim-summary-principal-free-note" className="text-xs text-gray-600">
                  Dosyada anapara kalemi yok. Kalem tutarları kayıtlı tutarlardır; harç, masraf, takip vekâlet ücreti ve ödemeler
                  dahil değildir. Nihai borç toplamı hesaplanamadı. Ayrıntı: Hesap Özeti.
                </p>
              </>
            ) : (
              <div className="flex justify-between py-3 bg-primary/10 rounded px-3 mt-2">
                <span className="font-semibold">TOPLAM ALACAK</span>
                <span className="font-bold text-primary text-lg">
                  {formatCurrency(summary.totals.grandTotal, summary.currency)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ekleme Modal — PR-5a: readOnly'de asla açılmaz */}
      {!readOnly && showAddModal && (
        <AddClaimItemModal
          caseId={caseId}
          itemType={addType}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadData(); }}
        />
      )}

      {/* Seçimlik borçlu sorumluluğu: seçim çekmecesi — yalnız görüntüleme panelinde ve bayrak kapalıyken açılmaz. */}
      {canRequestLiability && liability && liabilityTarget && (
        <ClaimLiabilitySelectionDrawer
          caseId={caseId}
          state={liability}
          claimItemIds={liabilityTarget.claimItemIds}
          presetJointAll={liabilityTarget.presetJointAll}
          onClose={() => setLiabilityTarget(null)}
          onRequested={(message) => {
            setLiabilityTarget(null);
            setLiabilityNotice(message);
          }}
        />
      )}

      {/* PR-5c: Metadata-only düzenleme modalı — amount/itemType kilitli, payload yalnız metadata. */}
      {metadataEdit && editItem && (
        <EditMetadataModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={async () => {
            setEditItem(null);
            await loadData();
            await onMetadataEditSuccess?.();
          }}
        />
      )}
    </div>
  );
}


// Alacak Kalemi Ekleme Modal
function AddClaimItemModal({
  caseId,
  itemType,
  onClose,
  onSuccess,
}: {
  caseId: string;
  itemType: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    description: "",
    referenceNo: "",
    interestType: "YASAL",
    dueDate: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount) return;

    setLoading(true);
    try {
      // Faiz için özel endpoint
      if (itemType === "INTEREST" || itemType === "PRE_INTEREST" || itemType === "POST_INTEREST") {
        await api.post(`/claim-items/case/${caseId}/add-interest`, {
          interestType: form.interestType,
          isPreInterest: itemType !== "POST_INTEREST",
        });
      } else if (itemType === "EXPENSE") {
        await api.post(`/claim-items/case/${caseId}/add-expense`, {
          amount: parseFloat(form.amount),
          description: form.description || "Masraf",
        });
      } else if (itemType === "FEE") {
        await api.post(`/claim-items/case/${caseId}/add-fee`, {
          amount: parseFloat(form.amount),
          description: form.description || "Harç",
        });
      } else if (itemType === "ATTORNEY_FEE") {
        await api.post(`/claim-items/case/${caseId}/add-attorney-fee`, {
          amount: parseFloat(form.amount),
          description: form.description || "Vekalet ücreti",
        });
      } else {
        // Genel ekleme
        await api.post("/claim-items", {
          caseId,
          itemType,
          amount: parseFloat(form.amount),
          description: form.description,
          referenceNo: form.referenceNo,
          dueDate: form.dueDate || undefined,
        });
      }
      alert("Alacak kalemi ekleme talebi onaya gönderildi.");
      onSuccess();
    } catch (error) {
      console.error("Ekleme hatası:", error);
      alert("Ekleme sırasında bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const typeInfo = itemTypeLabels[itemType] || itemTypeLabels.OTHER;
  const isInterest = ["INTEREST", "PRE_INTEREST", "POST_INTEREST"].includes(itemType);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h3 className="font-semibold text-lg mb-4">{typeInfo.label} Ekle</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isInterest ? (
            <div>
              <label className="block text-sm font-medium mb-1">Faiz Türü</label>
              <select
                value={form.interestType}
                onChange={(e) => setForm((p) => ({ ...p, interestType: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="YASAL">Yasal Faiz</option>
                <option value="TICARI">Ticari Faiz</option>
                <option value="AVANS">Avans Faizi</option>
                <option value="OZEL">Özel Faiz</option>
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Faiz tutarı ana para üzerinden otomatik hesaplanacaktır.
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Tutar (₺)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Açıklama</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Açıklama..."
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              {itemType === "PRINCIPAL" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Referans No</label>
                    <input
                      type="text"
                      value={form.referenceNo}
                      onChange={(e) => setForm((p) => ({ ...p, referenceNo: e.target.value }))}
                      placeholder="Fatura no, çek no vb."
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Vade Tarihi</label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </div>
                </>
              )}
            </>
          )}
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || (!isInterest && !form.amount)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Ekleniyor..." : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


/** Düzenleme penceresindeki faiz alanları (yalnız bu doğrulamanın girdisi). */
export interface InterestEditInput {
  initialStatus: string;
  status: string;
  initialProvenance: string;
  provenance: string;
  initialStartDate: string;
  startDate: string;
  /** Kalemde kayıtlı faiz türü var mı (interestType ya da interestTypeCode)? Bu pencerede faiz türü seçilmez. */
  hasInterestType: boolean;
  noInterestReason?: string;
}

/** Düzenlenebilen kalemlerde sunulan seçenekler. Kayıtlı "Faiz işlemez" durumu kilitlidir. */
export const EDITABLE_INTEREST_STATUSES: InterestAccrualStatusCode[] = ["UNKNOWN", "ACCRUES", "NO_INTEREST"];

/**
 * Sunucu kuralının (api interest-accrual-policy.validateInterestAccrualState) istemci yansıması — kural GEVŞETİLMEZ; sunucu yine
 * son karardır. Faiz alanlarına dokunulmadıysa hiçbir şey denetlenmez ("Belirlenmedi" kayıt kendiliğinden değişmez).
 * Hata metni döner; geçerliyse null.
 */
export function validateInterestEdit(input: InterestEditInput): string | null {
  const statusChanged = input.status !== input.initialStatus;
  const provenanceChanged = input.provenance !== input.initialProvenance;
  const startChanged = input.startDate !== input.initialStartDate;
  if (statusChanged && (input.initialStatus === "NO_INTEREST" || !(EDITABLE_INTEREST_STATUSES as string[]).includes(input.status))) {
    return "Bu faiz durumu bu pencereden seçilemez.";
  }
  if (statusChanged && input.status === "NO_INTEREST" && !input.noInterestReason?.trim()) {
    return "Faiz işlememe gerekçesi zorunludur.";
  }
  if (input.status === "ACCRUES" && (statusChanged || provenanceChanged || startChanged)) {
    if (!input.hasInterestType) {
      return "Kalemde faiz türü kayıtlı değil; 'Faiz işler' bu pencereden seçilemez.";
    }
    if (!input.provenance) return "'Faiz işler' için faiz başlangıcının dayanağı seçilmelidir.";
    if (input.provenance !== PROVENANCE_WITHOUT_START_DATE && !input.startDate) {
      return "'Faiz işler' için faiz başlangıç tarihi girilmelidir.";
    }
  }
  return null;
}

// PR-5c: Metadata-only düzenleme modalı.
// KIRMIZI ÇİZGİ: amount / itemType / currency / status / collectedAmount / demandedAmount
// payload'a ASLA girmez — tutar ve kalem tipi bakiye cutover'a kadar kilitli (salt görüntü).
// Faiz durumu ve faiz başlangıcının dayanağı yüksek etkili alandır: YALNIZ kullanıcı değiştirirse yüke girer ve onaya gider.
function EditMetadataModal({
  item,
  onClose,
  onSuccess,
}: {
  item: ClaimItem;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    description: item.description ?? "",
    referenceNo: item.referenceNo ?? "",
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    interestStartDate: item.interestStartDate ? item.interestStartDate.slice(0, 10) : "",
    interestEndDate: item.interestEndDate ? item.interestEndDate.slice(0, 10) : "",
    interestRate: item.interestRate != null ? String(item.interestRate) : "",
    sortOrder: item.sortOrder != null ? String(item.sortOrder) : "",
    attorneyFeeBasis: item.attorneyFeeBasis ?? "",
    interestAccrualStatus: item.interestAccrualStatus ?? "UNKNOWN",
    interestStartDateProvenance: item.interestStartDateProvenance ?? "",
    noInterestReason: "",
  });
  const isAttorneyFee = item.itemType === "ATTORNEY_FEE";
  const initialAttorneyFeeBasis = item.attorneyFeeBasis ?? "";
  const initialStatus = item.interestAccrualStatus ?? "UNKNOWN";
  const initialProvenance = item.interestStartDateProvenance ?? "";
  const statusChanged = form.interestAccrualStatus !== initialStatus;
  const provenanceChanged = form.interestStartDateProvenance !== initialProvenance;
  const requestNoInterest = statusChanged && form.interestAccrualStatus === "NO_INTEREST";
  const statusLocked = initialStatus === "NO_INTEREST" || !(EDITABLE_INTEREST_STATUSES as string[]).includes(initialStatus);
  const interestDetailLocked = initialStatus === "NO_INTEREST" || requestNoInterest;

  const typeInfo = itemTypeLabels[item.itemType] || itemTypeLabels.OTHER;
  const lockNote = "Tutar ve kalem tipi, bakiye cutover tamamlanana kadar düzenlenemez.";
  const amountLabel = new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: item.currency || "TRY",
  }).format(Number(item.amount) || 0);
  const initialHighImpact = {
    dueDate: item.dueDate ? item.dueDate.slice(0, 10) : "",
    interestStartDate: item.interestStartDate ? item.interestStartDate.slice(0, 10) : "",
    interestEndDate: item.interestEndDate ? item.interestEndDate.slice(0, 10) : "",
    interestRate: item.interestRate != null ? String(item.interestRate) : "",
  };
  const attorneyFeeBasisChanged = isAttorneyFee && form.attorneyFeeBasis !== initialAttorneyFeeBasis;
  const hasHighImpactChanges =
    form.dueDate !== initialHighImpact.dueDate ||
    form.interestStartDate !== initialHighImpact.interestStartDate ||
    form.interestEndDate !== initialHighImpact.interestEndDate ||
    form.interestRate !== initialHighImpact.interestRate ||
    attorneyFeeBasisChanged ||
    statusChanged ||
    provenanceChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateInterestEdit({
      initialStatus,
      status: form.interestAccrualStatus,
      initialProvenance,
      provenance: form.interestStartDateProvenance,
      initialStartDate: initialHighImpact.interestStartDate,
      startDate: form.interestStartDate,
      hasInterestType: Boolean(item.interestType || item.interestTypeCode),
      noInterestReason: form.noInterestReason,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    if (requestNoInterest && form.dueDate !== initialHighImpact.dueDate) {
      setError("Vade değişikliğini ayrı onaya gönderin.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        description: form.description || undefined,
        referenceNo: form.referenceNo || undefined,
        sortOrder: form.sortOrder !== "" ? parseInt(form.sortOrder, 10) : undefined,
      };
      if (form.dueDate !== initialHighImpact.dueDate) payload.dueDate = form.dueDate || undefined;
      if (requestNoInterest) {
        Object.assign(payload, {
          interestType: null,
          interestTypeCode: null,
          interestRate: null,
          interestStartDate: null,
          interestEndDate: null,
          interestStartDateProvenance: null,
          noInterestReason: form.noInterestReason.trim(),
        });
      } else if (!interestDetailLocked) {
        if (form.interestStartDate !== initialHighImpact.interestStartDate) {
          payload.interestStartDate = form.interestStartDate || undefined;
        }
        if (form.interestEndDate !== initialHighImpact.interestEndDate) {
          payload.interestEndDate = form.interestEndDate || undefined;
        }
        if (form.interestRate !== initialHighImpact.interestRate) {
          payload.interestRate = form.interestRate !== "" ? parseFloat(form.interestRate) : undefined;
        }
      }
      // Vekâlet ücreti kaynağı yüksek etkilidir (onaya gider); "Belirtilmemiş" seçimi açık null gönderir.
      if (attorneyFeeBasisChanged) {
        payload.attorneyFeeBasis = form.attorneyFeeBasis === "" ? null : form.attorneyFeeBasis;
      }
      // Durum yalnız açık seçimde gönderilir. "Faiz işlemez" geçişi faiz alanlarını yukarıda açıkça boşaltır.
      if (statusChanged) payload.interestAccrualStatus = form.interestAccrualStatus;
      if (provenanceChanged && form.interestAccrualStatus === "ACCRUES" && form.interestStartDateProvenance) {
        payload.interestStartDateProvenance = form.interestStartDateProvenance;
      }

      const res = await api.put(`/claim-items/${item.id}`, payload);
      if (res.data?.data?.approvalRequired) {
        alert("Yüksek etkili alacak kalemi değişikliği onaya gönderildi.");
        onClose();
      } else {
        await onSuccess();
      }
    } catch (err: any) {
      console.error("Metadata güncelleme hatası:", err);
      setError(err?.response?.data?.message || "Güncelleme sırasında bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold text-lg mb-1">Kalem Metadata Düzenle</h3>
          <p className="text-xs text-muted-foreground mb-4">{lockNote}</p>
          {hasHighImpactChanges && (
            <p className="text-xs text-amber-700 mb-4">
              Faiz veya vade değişiklikleri doğrudan kaydedilmez; onaya gönderilir.
            </p>
          )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Kilitli alanlar — salt görüntüleme (disabled) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">
                Kalem Tipi <span className="text-[10px] text-amber-600">(kilitli)</span>
              </label>
              <input
                type="text"
                value={typeInfo.label}
                disabled
                title={lockNote}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Tutar <span className="text-[10px] text-amber-600">(kilitli)</span>
              </label>
              <input
                type="text"
                value={amountLabel}
                disabled
                title={lockNote}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
              />
            </div>
          </div>

          {isAttorneyFee && (
            <div>
              <label htmlFor="claim-item-attorney-fee-basis" className="block text-sm font-medium mb-1">
                Vekâlet Ücreti Türü
              </label>
              <select
                id="claim-item-attorney-fee-basis"
                data-testid="claim-item-attorney-fee-basis-select"
                value={form.attorneyFeeBasis}
                onChange={(e) => setForm((p) => ({ ...p, attorneyFeeBasis: e.target.value as AttorneyFeeBasis | "" }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">{ATTORNEY_FEE_BASIS_LABELS.UNKNOWN}</option>
                <option value="JUDGMENT_AWARDED">{ATTORNEY_FEE_BASIS_LABELS.JUDGMENT_AWARDED} (ilamda hükmedilen)</option>
                <option value="ENFORCEMENT_TARIFF">{ATTORNEY_FEE_BASIS_LABELS.ENFORCEMENT_TARIFF} (tarifeden)</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Belgeye göre seçin; açıklamadan çıkarılmaz. Değişiklik onaya gönderilir.
              </p>
            </div>
          )}

          {/* Düzenlenebilir metadata */}
          <div>
            <label className="block text-sm font-medium mb-1">Açıklama</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="Açıklama..."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Referans No</label>
            <input
              type="text"
              value={form.referenceNo}
              onChange={(e) => setForm((p) => ({ ...p, referenceNo: e.target.value }))}
              placeholder="Fatura no, esas/karar no vb."
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Vade Tarihi</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Sıra No</label>
              <input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          {/* Faiz durumu ve faiz başlangıcının dayanağı — yüksek etkili; değişirse onaya gider. */}
          <div>
            <label htmlFor="claim-item-interest-accrual-status" className="block text-sm font-medium mb-1">
              Faiz Durumu
            </label>
            <select
              id="claim-item-interest-accrual-status"
              data-testid="claim-item-interest-accrual-status-select"
              value={form.interestAccrualStatus}
              disabled={statusLocked}
              onChange={(e) => setForm((p) => ({ ...p, interestAccrualStatus: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-100"
            >
              {(statusLocked ? [initialStatus as InterestAccrualStatusCode] : EDITABLE_INTEREST_STATUSES).map((code) => (
                <option key={code} value={code}>
                  {INTEREST_ACCRUAL_STATUS_LABELS[code] ?? "Tanımsız durum"}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              {statusLocked
                ? "Faiz işlemeyen kalemin durumu bu pencereden değiştirilmez."
                : "Belgeye göre seçin. \"Belirlenmedi\" kayıt siz değiştirmedikçe aynen kalır; değişiklik onaya gönderilir."}
            </p>
          </div>
          {requestNoInterest && (
            <div>
              <label htmlFor="claim-item-no-interest-reason" className="block text-sm font-medium mb-1">
                Faiz işlememe gerekçesi
              </label>
              <textarea
                id="claim-item-no-interest-reason"
                aria-required="true"
                value={form.noInterestReason}
                onChange={(e) => setForm((p) => ({ ...p, noInterestReason: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Onaylandığında faiz alanları boşaltılır. Vade korunur.
              </p>
            </div>
          )}
          {form.interestAccrualStatus === "ACCRUES" && (
            <div>
              <label htmlFor="claim-item-interest-start-provenance" className="block text-sm font-medium mb-1">
                Faiz Başlangıcının Dayanağı
              </label>
              <select
                id="claim-item-interest-start-provenance"
                data-testid="claim-item-interest-start-provenance-select"
                value={form.interestStartDateProvenance}
                onChange={(e) => setForm((p) => ({ ...p, interestStartDateProvenance: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              >
                <option value="">Seçin…</option>
                {INTEREST_START_PROVENANCE_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              {form.interestStartDateProvenance === PROVENANCE_WITHOUT_START_DATE && (
                <p className="text-[11px] text-muted-foreground mt-1">Başlangıç tarihi dosyanın takip tarihinden alınır.</p>
              )}
            </div>
          )}
          {interestDetailLocked && (
            <p className="text-[11px] text-muted-foreground">
              Faiz işlemeyen kalemde başlangıç, bitiş ve oran boş tutulur; bu alanlar düzenlenmez.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="claim-item-interest-start-date" className="block text-sm font-medium mb-1">Faiz Başlangıç</label>
              <input
                id="claim-item-interest-start-date"
                data-testid="claim-item-interest-start-date"
                type="date"
                value={form.interestStartDate}
                disabled={interestDetailLocked}
                onChange={(e) => setForm((p) => ({ ...p, interestStartDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Faiz Bitiş</label>
              <input
                type="date"
                value={form.interestEndDate}
                disabled={interestDetailLocked}
                onChange={(e) => setForm((p) => ({ ...p, interestEndDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-100"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Faiz Oranı (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.interestRate}
              disabled={interestDetailLocked}
              onChange={(e) => setForm((p) => ({ ...p, interestRate: e.target.value }))}
              placeholder="örn. 24"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-gray-100"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
              İptal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Kaydediliyor..." : hasHighImpactChanges ? "Onaya Gönder" : "Kaydet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
