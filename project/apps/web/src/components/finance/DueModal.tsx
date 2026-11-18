"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { recordCurrencyCode } from "@/lib/record-currency-display";
import { caseClaimCurrencyMatches, CASE_CLAIM_CURRENCY_MESSAGE } from "@/lib/case-claim-currency";

const DUE_TYPES = [
  { value: "PRINCIPAL", label: "Ana Para (Asıl Alacak)" },
  { value: "INTEREST", label: "Faiz" },
  { value: "EXPENSE", label: "Masraf" },
  { value: "VEKALET_UCRETI", label: "Vekalet Ücreti" },
  { value: "HARC", label: "Harç" },
  { value: "TAZMINAT", label: "Tazminat" },
  { value: "CEZAI_SART", label: "Cezai Şart" },
  { value: "NAFAKA", label: "Nafaka" },
  { value: "KIRA", label: "Kira Alacağı" },
  { value: "AIDAT", label: "Aidat" },
  { value: "KOMISYON", label: "Komisyon" },
  { value: "PRIM", label: "Prim/İkramiye" },
  { value: "OTHER", label: "Diğer" },
];

export function dueTypeOptionsForMode(existingType?: string) {
  if (existingType === "NAFAKA") {
    return DUE_TYPES.filter((type) => type.value === "NAFAKA");
  }
  if (existingType) {
    return DUE_TYPES.filter((type) => type.value !== "NAFAKA");
  }
  return DUE_TYPES;
}

const INTEREST_TYPES = [
  { value: "YASAL", label: "Yasal Faiz (%24)" },
  { value: "TICARI_DEGISEN", label: "Ticari Faiz - TCMB Avans (Değişken)" },
  { value: "TICARI_SABIT", label: "Ticari Faiz - Sabit Oran" },
  { value: "OZEL", label: "Özel Oran (Sözleşme)" },
];

/** Para birimi seçim alanında sabit duran seçenekler */
const LISTED_CURRENCIES = ["TRY", "USD", "EUR", "GBP"];

interface DueModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  due?: any; // Edit mode
  onSuccess: () => void;
  /** Dosyanın para birimi: YENİ kalemde seçimin varsayılanı (kilit değil; düzenlemede kaydın kendi değeri geçerlidir) */
  defaultCurrency?: string | null;
}

export interface DueFormState {
  type: string;
  description: string;
  amount: string;
  dueDate: string;
  currency: string;
  interestType: string;
}

/** Düzenleme formunun kayıttan türetilen başlangıç değerleri (değişiklik tespitinin de ölçütü). */
export function dueFormFromRecord(due: any): DueFormState {
  return {
    type: due.type || "PRINCIPAL",
    description: due.description || "",
    amount: due.amount?.toString() || "",
    dueDate: due.dueDate ? new Date(due.dueDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
    currency: due.currency || "TRY",
    interestType: due.interestType || "YASAL",
  };
}

/**
 * Düzenlemede sunucuya YALNIZ kullanıcının değiştirdiği alanlar gider. Değişmeyen varsayılan alanlar (ör. hiç
 * dokunulmamış "Faiz Türü") gönderilmez: sunucu, dosya kalemine bağlı alacak kaleminin onaya tabi bilgisini (tutar,
 * tür, vade, faiz) bu pencereden değiştirtmez; gereksiz gönderilen alan onaylı bilgiyi etkileyemesin diye yük dardır.
 * Hiçbir alan değişmediyse boş nesne döner (istek atılmaz).
 */
export function buildDueUpdatePayload(initial: DueFormState, form: DueFormState): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (form.type !== initial.type) changes.type = form.type;
  // Boşaltılan açıklama gönderilmez (önceki davranış: boş açıklama "değişiklik yok" sayılır).
  if (form.description !== initial.description && form.description) changes.description = form.description;
  if (parseFloat(form.amount) !== parseFloat(initial.amount)) changes.amount = parseFloat(form.amount);
  if (form.dueDate !== initial.dueDate) changes.dueDate = form.dueDate;
  if (form.currency !== initial.currency) changes.currency = form.currency;
  if (form.type === "PRINCIPAL" && form.interestType !== initial.interestType) changes.interestType = form.interestType;
  return changes;
}

/** Sunucunun "bu pencereden yapılamaz / yetki yok" retleri: iletisi açıklayıcıdır ve pencerede aynen gösterilir. */
const DUE_BLOCK_CODES = new Set([
  "DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL",
  "DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL",
  "DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL",
  "DUE_CLAIM_ITEM_BUSY",
  "DUE_BOUND_CLAIM_ITEM_CLOSED",
  "DUE_WRITE_FORBIDDEN",
]);

/** Hata bir Due engel reddiyse kullanıcıya gösterilecek sunucu iletisi; değilse null. */
export function dueBlockNotice(error: any): string | null {
  const code = error?.body?.code;
  return typeof code === "string" && DUE_BLOCK_CODES.has(code) && error?.message ? String(error.message) : null;
}

const DUE_APPROVAL_FALLBACK =
  "İşlem onaya gönderildi. İkinci bir kişinin onayından sonra uygulanır; o zamana kadar dosya kalemleri değişmez.";

/**
 * Sunucu isteği UYGULAMADIYSA ve onaya gönderdiyse (ekleme; hesap ve dışa aktarım çıktısını etkileyen değişiklik; bağlı
 * kalemi olmayan kalemin silinmesi) kullanıcıya gösterilecek ileti; istek doğrudan uygulandıysa null.
 */
export function dueApprovalNotice(result: any): string | null {
  if (!result || typeof result !== "object" || result.approvalRequired !== true) return null;
  return typeof result.message === "string" && result.message ? result.message : DUE_APPROVAL_FALLBACK;
}

export function DueModal({ isOpen, onClose, caseId, due, onSuccess, defaultCurrency }: DueModalProps) {
  // Alan boşsa şema varsayılanı (TRY) — dosya para birimi verilmeyen çağrı önceki gibi davranır
  const newDueCurrency = recordCurrencyCode(defaultCurrency);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Sunucunun engel reddi (onaya tabi değişiklik / bekleyen talep / yetki): pencerede kalıcı ve okunur gösterilir.
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  // İstek onaya gönderildi (kayıt değişmedi): ileti pencerede kalır; kullanıcı okuyup kapatır.
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [form, setForm] = useState<DueFormState>({
    type: "PRINCIPAL",
    description: "",
    amount: "",
    dueDate: new Date().toISOString().split("T")[0],
    currency: newDueCurrency,
    interestType: "YASAL", // Default: Yasal Faiz
  });
  const availableDueTypes = dueTypeOptionsForMode(due?.type);
  // Dosyanın / kaydın para birimi sabit listede yoksa (ör. CHF) seçim alanına eklenir: alan ilk seçeneği gösterirken
  // form başka bir para birimi göndermesin, kullanıcı dosya para birimine geri dönebilsin.
  const unlistedCurrencies = Array.from(new Set([newDueCurrency, due?.currency, form.currency])).filter(
    (code): code is string => typeof code === "string" && code !== "" && !LISTED_CURRENCIES.includes(code),
  );

  useEffect(() => {
    setBlockNotice(null);
    setApprovalNotice(null);
    if (due) {
      setForm(dueFormFromRecord(due));
    } else {
      setForm({
        type: "PRINCIPAL",
        description: "",
        amount: "",
        dueDate: new Date().toISOString().split("T")[0],
        currency: newDueCurrency,
        interestType: "YASAL",
      });
    }
  }, [due, isOpen, newDueCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.type) return;
    if (!caseClaimCurrencyMatches(newDueCurrency, form.currency)) {
      alert(CASE_CLAIM_CURRENCY_MESSAGE);
      return;
    }

    // Düzenleme: yalnız değişen alanlar gider; hiçbir alan değişmediyse istek atılmaz.
    const changes = due?.id ? buildDueUpdatePayload(dueFormFromRecord(due), form) : null;
    if (changes && Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setBlockNotice(null);
    setApprovalNotice(null);
    setLoading(true);
    try {
      const result =
        due?.id && changes
          ? await api.updateDue(caseId, due.id, changes as any)
          : await api.createDue(caseId, {
              type: form.type as any,
              description: form.description || undefined,
              amount: parseFloat(form.amount),
              dueDate: form.dueDate,
              currency: form.currency,
              interestType: form.type === 'PRINCIPAL' ? form.interestType : undefined,
            });
      const pending = dueApprovalNotice(result);
      if (pending) {
        // Kayıt değişmedi; pencere açık kalır ve ileti okunur. Liste yenilenmez (yenilenecek kayıt yok).
        setApprovalNotice(pending);
        return;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Kaydetme hatası:", error);
      const notice = dueBlockNotice(error);
      if (notice) setBlockNotice(notice);
      else alert(`Kaydetme başarısız: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!due?.id) return;
    if (!confirm("Bu alacak kalemini silmek istediğinize emin misiniz?")) return;

    setBlockNotice(null);
    setApprovalNotice(null);
    setDeleting(true);
    try {
      const pending = dueApprovalNotice(await api.deleteDue(caseId, due.id));
      if (pending) {
        setApprovalNotice(pending);
        return;
      }
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Silme hatası:", error);
      const notice = dueBlockNotice(error);
      if (notice) setBlockNotice(notice);
      else alert(`Silme başarısız: ${error?.message || 'Bilinmeyen hata'}`);
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* Yönlendirme notu ve engel iletisi pencereyi uzatır: kısa ekranda taşmasın diye yükseklik sınırı + kaydırma. */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold text-gray-900">
            {due ? "Alacak Kalemi Düzenle" : "Yeni Alacak Kalemi"}
          </h3>
          <div className="flex items-center gap-2">
            {due?.id && (
              <button 
                onClick={handleDelete} 
                disabled={deleting}
                className="text-red-500 hover:text-red-700 p-1"
                title="Sil"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          {due?.id && due?.type !== "NAFAKA" && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Bağlı alacak kaleminin tutarını, türünü, vadesini ya da faiz bilgisini değiştiren düzenlemeler ve silme
              iki kişi onayına tabidir; bu pencereden yapılamaz. Bunları &quot;Alacak Kalemleri (Kanonik)&quot;
              panelinde kalemi düzenleyerek isteyin. Alt tür değişikliği (ör. asıl alacak → kira) bu pencereden
              istenir ve ikinci bir kişinin onayıyla uygulanır.
            </p>
          )}
          {due?.id && due?.type === "NAFAKA" && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Tutar, vade ve faiz değişikliği ile silme ikinci bir kişinin onayıyla uygulanır; açıklama doğrudan kaydedilir.
            </p>
          )}
          {!due?.id && (
            <p className="text-[11px] text-gray-500 leading-snug">
              Yeni kalem ikinci bir kişinin onayından sonra dosyaya eklenir; o zamana kadar borca ve dışa aktarıma girmez.
            </p>
          )}
          {approvalNotice && (
            <div role="status" className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-900 leading-snug">
              <p className="font-semibold mb-0.5">Onaya gönderildi</p>
              <p>{approvalNotice}</p>
            </div>
          )}
          {blockNotice && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 leading-snug">
              <p className="font-semibold mb-0.5">Bu işlem bu pencereden yapılamadı</p>
              <p>{blockNotice}</p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tür *</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {availableDueTypes.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Açıklama</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Opsiyonel açıklama"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tutar *</label>
              <input
                type="text"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => {
                  // Sadece rakam, nokta ve virgül kabul et
                  const value = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                  setForm({ ...form, amount: value });
                }}
                placeholder="0.00"
                required
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Para Birimi</label>
              <select
                value={form.currency}
                disabled
                title="FR-7: Alacak kalemi dosya para biriminde olmalıdır; eski kayıt dönüştürülmez."
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
                <option value="GBP">£ GBP</option>
                {unlistedCurrencies.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Vade Tarihi</label>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Faiz Türü - Sadece Ana Para için göster */}
          {form.type === 'PRINCIPAL' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Faiz Türü
                <span className="text-gray-400 font-normal ml-1">(Takip öncesi/sonrası faiz hesabında kullanılır)</span>
              </label>
              <select
                value={form.interestType}
                onChange={(e) => setForm({ ...form, interestType: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {INTEREST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                {form.interestType === 'YASAL' && 'Genel haciz takiplerinde varsayılan faiz türü'}
                {form.interestType === 'TICARI_DEGISEN' && 'Çek/Senet takiplerinde ve ticari ilişkilerde kullanılır'}
                {form.interestType === 'TICARI_SABIT' && 'Sözleşmede belirlenmiş sabit ticari faiz oranı'}
                {form.interestType === 'OZEL' && 'Sözleşmede belirlenmiş özel faiz oranı'}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={loading || !form.amount}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {due ? "Güncelle" : "Ekle"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
