"use client";

import { useState } from "react";
import {
  AUTO_ASSIGN_EXPLANATION,
  buildStaffReactivationPayload,
  caseImpactNotice,
  linkedAccountNotice,
  type StaffReactivationReview,
  type StaffReactivationValues,
} from "@/lib/staff-reactivation";

/**
 * O-5 (owner 05.11.2026, C politikası): aynı kimlikle eklenmek istenen PASİF personel için gözden geçirme diyaloğu.
 * Kartın mevcut izinleri düzenlenebilir gelir (F02-C kuralı: yalnız gerçekten uygulanan izinler işaretlenebilir;
 * uygulanmayan alanlar pasif görünür ve kayıtlı değerleri aynen gönderilir). Onay öncesinde dosya atamalarının
 * yeniden etkili olacağı, yeni takiplere otomatik atama ve bağlı giriş hesabının GERÇEK durumu açıklanır.
 * "Vazgeç" hiçbir istek göndermez. Ağ çağrısını sayfa yapar (onConfirm); diyalog yalnız sonucu gösterir.
 */
export type StaffReactivationOutcome = { ok: true; message: string } | { ok: false; message: string };

type BooleanField = Exclude<keyof StaffReactivationValues, "staffType">;

const INEFFECTIVE: Array<{ key: BooleanField; label: string }> = [
  { key: "canCreateCase", label: "Dosya oluşturabilir" },
  { key: "canEditCase", label: "Dosya düzenleyebilir" },
  { key: "canGenerateDocuments", label: "Belge hazırlayabilir" },
  { key: "canApproveDocuments", label: "Belge onaylayabilir" },
  { key: "canApproveFinance", label: "Muhasebe onaylayabilir" },
  { key: "canSendNotifications", label: "Tebligat gönderebilir" },
];

export function StaffReactivationDialog({
  review,
  staffTypes,
  onConfirm,
  onClose,
}: {
  review: StaffReactivationReview;
  staffTypes: ReadonlyArray<{ value: string; label: string }>;
  onConfirm: (values: StaffReactivationValues) => Promise<StaffReactivationOutcome>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<StaffReactivationValues>(review.values);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<StaffReactivationOutcome | null>(null);
  const done = outcome?.ok === true;
  const set = <K extends keyof StaffReactivationValues>(k: K, v: StaffReactivationValues[K]) =>
    setValues((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (busy || done) return;
    setBusy(true);
    setOutcome(null);
    try {
      setOutcome(await onConfirm(buildStaffReactivationPayload(values)));
    } finally {
      setBusy(false);
    }
  };

  // Bilinmeyen tür kayıtlı değer olarak korunur (seçenek listesinde yoksa yine görünür).
  const typeOptions = staffTypes.some((t) => t.value === values.staffType)
    ? staffTypes
    : [{ value: values.staffType, label: values.staffType }, ...staffTypes];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="staff-reactivation-title"
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-full overflow-y-auto p-5 text-sm"
      >
        <h3 id="staff-reactivation-title" className="text-base font-semibold text-gray-900 mb-2">
          Pasif personel kaydı bulundu
        </h3>
        <p className="text-gray-700">
          <b>{review.name}</b> adlı pasif bir personel kaydı bu TCKN veya e-postayla kayıtlı. Yeni kayıt açılmadı ve hiçbir
          değişiklik yapılmadı.
        </p>

        {!done && (
          <>
            <p className="mt-2 text-gray-700">
              Yeniden etkinleştirmek için izinleri gözden geçirin. Aşağıdaki değerler kartın pasifleştirilmeden önceki
              izinleridir; onaylanan değerler kaydedilir.
            </p>

            <ul aria-label="Yeniden etkinleştirmenin etkisi" className="mt-3 list-disc pl-5 space-y-1 text-gray-800">
              {caseImpactNotice(review).map((t) => (
                <li key={t}>{t}</li>
              ))}
              <li>{linkedAccountNotice(review.linkedAccount)}</li>
            </ul>

            <fieldset className="mt-3 border-t pt-3" disabled={busy}>
              <legend className="font-medium mb-2">İzinler</legend>
              <label className="block mb-2">
                <span className="block text-gray-700">Personel türü</span>
                <select
                  aria-label="Personel türü"
                  value={values.staffType}
                  onChange={(e) => set("staffType", e.target.value)}
                  className="w-full border rounded px-2 py-1"
                >
                  {typeOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-1" title="Gerçek yetki kapısı: alacak kalemi yazma">
                  <input type="checkbox" checked={values.canSeeFinance} onChange={(e) => set("canSeeFinance", e.target.checked)} />
                  Muhasebe görebilir
                </label>
                <label className="flex items-center gap-1" title="Yalnız hazırlık/öneri yetkisi — nihai onay değil">
                  <input
                    type="checkbox"
                    checked={values.canPrepareCollectionDisposition}
                    onChange={(e) => set("canPrepareCollectionDisposition", e.target.checked)}
                  />
                  Tahsilat dağıtımı hazırlayabilir <span className="text-gray-400">(nihai onay değil)</span>
                </label>
                {INEFFECTIVE.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-1 text-gray-500" title="Şu an hiçbir yetki kararında okunmuyor; kayıtlı değer aynen korunur">
                    <input type="checkbox" checked={values[key]} disabled readOnly />
                    {label} <span className="text-gray-400">(şu an uygulanmıyor)</span>
                  </label>
                ))}
              </div>
              <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={values.isDefaultForNewCases}
                    onChange={(e) => set("isDefaultForNewCases", e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-amber-800">⭐ Yeni takiplerde otomatik seç</span>
                    <span className="block text-[11px] text-amber-700">{AUTO_ASSIGN_EXPLANATION}</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </>
        )}

        {outcome && (
          <p role={outcome.ok ? "status" : "alert"} className={`mt-3 ${outcome.ok ? "text-emerald-700" : "text-red-700"}`}>
            {outcome.message}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {done ? (
            <button type="button" onClick={onClose} className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
              Kapat
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {busy ? "Kaydediliyor…" : "İzinleri onayla ve yeniden etkinleştir"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Vazgeç
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
