"use client";

// WP-1d-5-5: Hukuki Sorumlu Avukat KONTROLLÜ değişikliği (frontend-only UI).
// Mevcut backend endpoint'i tüketir: PATCH /cases/:id/legal-responsible-lawyer (#474).
// Kanonik dil: "Hukuki sorumlu avukat DEVREDİLMEZ; hukuki sorumlu avukat kaydı KURALLI şekilde DEĞİŞTİRİLİR."
// "Devir"/"atama"/"personel" copy'si KULLANILMAZ. Aday listesi YALNIZ case'e bağlı CaseLawyer'lar.
// Güvenlik backend'de (ADMIN-only hard guard + tenant); bu UI yalnız affordance + dostu hata gösterimi.

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

// Backend semantic hata mesajını (içinde [CODE] taşıyabilir) kullanıcı-dostu Türkçe mesaja çevirir.
// Çıplak teknik kod kullanıcıya BASILMAZ. Bilinmeyen mesajda [CODE] eki temizlenir.
export function mapLegalResponsibleError(message?: string): string {
  const m = message || "";
  if (m.includes("LEGAL_RESPONSIBLE_REASON_REQUIRED")) return "Değişiklik nedeni zorunludur.";
  if (m.includes("TARGET_CASE_LAWYER_NOT_FOUND")) return "Seçilen avukat bu dosyanın avukatları arasında bulunamadı.";
  if (m.includes("LEGAL_RESPONSIBLE_LAWYER_ALREADY_CURRENT")) return "Seçilen avukat zaten Hukuki Sorumlu Avukat.";
  if (m.includes("LEGAL_RESPONSIBLE_INVARIANT_VIOLATION")) return "Hukuki sorumlu avukat kaydı tutarsız olduğu için işlem yapılamadı.";
  if (m.includes("INVALID_LEGAL_RESPONSIBLE_PAYLOAD")) return "Geçersiz istek; lütfen alanları kontrol edin.";
  if (m.toLowerCase().includes("yetki")) return "Bu işlemi yapma yetkiniz yok.";
  return m.replace(/\s*\[[A-Z_]+\]\s*$/, "").trim() || "İşlem başarısız oldu.";
}

interface CaseLawyerOption {
  lawyerId: string;
  label: string;
  isCurrent: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  lawyers: any[]; // caseData.lawyers (CaseLawyer[]; le.lawyer.{id,name,surname}, le.role/isResponsible)
  onSuccess: () => void;
  initialLawyerId?: string; // WP-1d-5-6: drawer'dan ön-seçili açılış (avukata tıkla → bu avukatı hedefle)
}

function buildOptions(lawyers: any[]): CaseLawyerOption[] {
  return (lawyers || [])
    .filter((le) => le?.lawyer?.id)
    .map((le) => {
      const isCurrent = le.role === "RESPONSIBLE" || le.isResponsible === true;
      const ad = `${le.lawyer.name ?? ""} ${le.lawyer.surname ?? ""}`.replace(/\s+/g, " ").trim();
      return {
        lawyerId: le.lawyer.id as string,
        label: `Av. ${ad}${isCurrent ? " (mevcut)" : ""}`,
        isCurrent,
      };
    });
}

export function LegalResponsibleLawyerModal({ isOpen, onClose, caseId, lawyers, onSuccess, initialLawyerId }: Props) {
  const [lawyerId, setLawyerId] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Açılışta formu sıfırla. initialLawyerId verilmişse (drawer'dan açılış) hedef avukatı ön-seç.
  useEffect(() => {
    if (isOpen) {
      setLawyerId(initialLawyerId ?? "");
      setReason("");
      setNote("");
      setError(null);
      setSuccess(false);
      setLoading(false);
    }
  }, [isOpen, initialLawyerId]);

  if (!isOpen) return null;

  const options = buildOptions(lawyers);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!lawyerId) {
      setError("Yeni hukuki sorumlu avukat seçiniz.");
      return;
    }
    if (!reason.trim()) {
      setError("Değişiklik nedeni zorunludur.");
      return;
    }
    setLoading(true);
    try {
      await api.changeLegalResponsibleLawyer(caseId, {
        lawyerId,
        reason: reason.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setSuccess(true);
      onSuccess(); // parent: case + responsibility-at + responsibility-history refresh
    } catch (err: any) {
      setError(mapLegalResponsibleError(err?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md" role="dialog" aria-label="Hukuki Sorumlu Avukat Kaydını Değiştir">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Hukuki Sorumlu Avukat Kaydını Değiştir</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded" aria-label="Kapat">
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {success ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle2 className="h-5 w-5" />
              <span>Hukuki sorumlu avukat kaydı güncellendi.</span>
            </div>
            <div className="flex justify-end">
              <button onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded">
                Kapat
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <p className="text-[11px] text-gray-500">
              Hukuki sorumlu avukat devredilmez; kayıt kurallı şekilde değiştirilir. Yalnız bu dosyaya bağlı avukatlar listelenir.
            </p>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="lrl-lawyer">
                Yeni Hukuki Sorumlu Avukat
              </label>
              <select
                id="lrl-lawyer"
                aria-label="Yeni Hukuki Sorumlu Avukat"
                value={lawyerId}
                onChange={(e) => setLawyerId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
              >
                <option value="">Seçiniz…</option>
                {options.map((o) => (
                  <option key={o.lawyerId} value={o.lawyerId}>
                    {o.label}
                  </option>
                ))}
              </select>
              {options.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">Bu dosyaya bağlı avukat bulunamadı.</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="lrl-reason">
                Değişiklik Nedeni
              </label>
              <textarea
                id="lrl-reason"
                aria-label="Değişiklik Nedeni"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
                placeholder="Bu değişikliğin nedeni (zorunlu)"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="lrl-note">
                Not (opsiyonel)
              </label>
              <textarea
                id="lrl-note"
                aria-label="Not"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className="w-full border rounded px-2 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded">
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Kaydı Değiştir
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default LegalResponsibleLawyerModal;
