"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { ActionError } from '@/components/ui/action-error';
import { toActionErrorMessage } from '@/lib/action-error';
import { runMutation, runRefreshOnly } from '@/lib/mutation-outcome';
import { useKeyedSubmitLock } from '@/lib/use-submit-lock';
import { getInterestReadDisplayLabel } from "@/lib/interest-type-resolver";
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
  interestRate?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  dueDate?: string;
  sourceDocumentType?: string;
  sortOrder?: number;
  status: string;
  isCalculated: boolean;
}

interface ClaimSummary {
  caseId: string;
  currency: string;
  items: { type: string; label: string; amount: number; count: number }[];
  totals: {
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
  };
  calculationDate: string;
}

const itemTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  PRINCIPAL: { label: "Asıl Alacak", icon: DollarSign, color: "text-blue-600 bg-blue-100" },
  INTEREST: { label: "Faiz", icon: Percent, color: "text-green-600 bg-green-100" },
  PRE_INTEREST: { label: "Takip Öncesi Faiz", icon: Percent, color: "text-green-600 bg-green-100" },
  POST_INTEREST: { label: "Takip Sonrası Faiz", icon: Percent, color: "text-emerald-600 bg-emerald-100" },
  EXPENSE: { label: "Masraf", icon: Receipt, color: "text-orange-600 bg-orange-100" },
  FEE: { label: "Harç", icon: Receipt, color: "text-amber-600 bg-amber-100" },
  ATTORNEY_FEE: { label: "Vekalet Ücreti", icon: Scale, color: "text-purple-600 bg-purple-100" },
  PENALTY: { label: "Tazminat", icon: AlertCircle, color: "text-red-600 bg-red-100" },
  CHECK_PENALTY: { label: "Çek Tazminatı", icon: AlertCircle, color: "text-red-600 bg-red-100" },
  CONTRACTUAL_PENALTY: { label: "Cezai Şart", icon: AlertCircle, color: "text-red-600 bg-red-100" },
  TAX_KDV: { label: "KDV", icon: Receipt, color: "text-gray-600 bg-gray-100" },
  TAX_BSMV: { label: "BSMV", icon: Receipt, color: "text-gray-600 bg-gray-100" },
  TAX_KKDF: { label: "KKDF", icon: Receipt, color: "text-gray-600 bg-gray-100" },
  OTHER: { label: "Diğer", icon: FileText, color: "text-gray-600 bg-gray-100" },
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

  useEffect(() => {
    void loadData();
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
      setSummary(((summaryRes as { data?: { data?: unknown } })?.data?.data as ClaimSummary) ?? null);
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

      {/* Özet Kartları */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
            <p className="text-sm text-blue-700">Asıl Alacak</p>
            <p className="text-xl font-bold text-blue-600">
              {formatCurrency(summary.totals.principal, summary.currency)}
            </p>
          </div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4">
            <p className="text-sm text-green-700">Toplam Faiz</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(summary.totals.totalInterest, summary.currency)}
            </p>
          </div>
          <div className="bg-orange-50 rounded-xl border border-orange-200 p-4">
            <p className="text-sm text-orange-700">Masraf + Harç</p>
            <p className="text-xl font-bold text-orange-600">
              {formatCurrency(summary.totals.expense + summary.totals.fee, summary.currency)}
            </p>
          </div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4">
            <p className="text-sm text-purple-700">Toplam Alacak</p>
            <p className="text-2xl font-bold text-purple-600">
              {formatCurrency(summary.totals.grandTotal, summary.currency)}
            </p>
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
                      {item.isCalculated && (
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                          Otomatik
                        </span>
                      )}
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
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {formatCurrency(item.amount, item.currency)}
                  </span>
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


      {/* Detaylı Özet Tablosu */}
      {summary && (
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
            <div className="flex justify-between py-3 bg-primary/10 rounded px-3 mt-2">
              <span className="font-semibold">TOPLAM ALACAK</span>
              <span className="font-bold text-primary text-lg">
                {formatCurrency(summary.totals.grandTotal, summary.currency)}
              </span>
            </div>
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


// PR-5c: Metadata-only düzenleme modalı.
// KIRMIZI ÇİZGİ: amount / itemType / currency / status / collectedAmount / demandedAmount
// payload'a ASLA girmez — tutar ve kalem tipi bakiye cutover'a kadar kilitli (salt görüntü).
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
  });

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
  const hasHighImpactChanges =
    form.dueDate !== initialHighImpact.dueDate ||
    form.interestStartDate !== initialHighImpact.interestStartDate ||
    form.interestEndDate !== initialHighImpact.interestEndDate ||
    form.interestRate !== initialHighImpact.interestRate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, any> = {
        description: form.description || undefined,
        referenceNo: form.referenceNo || undefined,
        sortOrder: form.sortOrder !== "" ? parseInt(form.sortOrder, 10) : undefined,
      };
      if (form.dueDate !== initialHighImpact.dueDate) payload.dueDate = form.dueDate || undefined;
      if (form.interestStartDate !== initialHighImpact.interestStartDate) {
        payload.interestStartDate = form.interestStartDate || undefined;
      }
      if (form.interestEndDate !== initialHighImpact.interestEndDate) {
        payload.interestEndDate = form.interestEndDate || undefined;
      }
      if (form.interestRate !== initialHighImpact.interestRate) {
        payload.interestRate = form.interestRate !== "" ? parseFloat(form.interestRate) : undefined;
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Faiz Başlangıç</label>
              <input
                type="date"
                value={form.interestStartDate}
                onChange={(e) => setForm((p) => ({ ...p, interestStartDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Faiz Bitiş</label>
              <input
                type="date"
                value={form.interestEndDate}
                onChange={(e) => setForm((p) => ({ ...p, interestEndDate: e.target.value }))}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Faiz Oranı (%)</label>
            <input
              type="number"
              step="0.01"
              value={form.interestRate}
              onChange={(e) => setForm((p) => ({ ...p, interestRate: e.target.value }))}
              placeholder="örn. 24"
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-primary"
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
