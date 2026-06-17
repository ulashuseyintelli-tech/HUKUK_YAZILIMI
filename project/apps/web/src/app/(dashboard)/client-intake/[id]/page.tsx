"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  api,
  IntakeSubmissionDetail,
  IntakeSubmissionField,
  IntakeFieldCategory,
  IntakeSubmissionStatus,
  IntakeFieldReviewStatus,
} from "@/lib/api";

/**
 * Müvekkil Bilgi Formu — Gönderim İncelemesi (Faz 4.7 PR-C1) — personel/JWT.
 *
 * ⛔ REVIEW-ONLY. Bu ekran KANONİĞE YAZMAZ: yalnız claim + alan onay/ret + toplu +
 * gönderim reddi. Promote (kanoniğe aktarım) AYRI bir iştir (C2) ve bu ekranda
 * BİLİNÇLİ OLARAK YOKTUR — review ile promote sert ayrıdır.
 */

const CATEGORY_LABELS: Record<IntakeFieldCategory, string> = {
  INCOME_SOURCE: "Gelir Kaynağı",
  COMMERCIAL_RELATION: "Ticari İlişki",
  FAMILY_CIRCLE: "Aile / Yakın Çevre",
  DIGITAL_FOOTPRINT: "Dijital İz",
  PAYMENT_HISTORY: "Tahsilat Geçmişi",
  STRATEGY: "Dosya Stratejisi",
  ADDRESS: "Adres",
  ASSET: "Varlık",
  CONTACT: "İletişim",
};

const SUB_STATUS_LABELS: Record<IntakeSubmissionStatus, string> = {
  CLIENT_SUBMITTED: "Yeni gönderim",
  IN_REVIEW: "İncelemede",
  PARTIALLY_PROMOTED: "Kısmen işlendi",
  COMPLETED: "Tamamlandı",
  REJECTED: "Reddedildi",
};

const REVIEW_LABELS: Record<IntakeFieldReviewStatus, string> = {
  PENDING: "Bekliyor",
  APPROVED: "Onaylandı",
  REJECTED: "Reddedildi",
};

const REVIEW_CLASSES: Record<IntakeFieldReviewStatus, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
};

export default function IntakeSubmissionDetailPage({ params }: { params: { id: string } }) {
  const [sub, setSub] = useState<IntakeSubmissionDetail | null>(null);
  const [caseLabel, setCaseLabel] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError("");
    try {
      const d = await api.getIntakeSubmission(params.id);
      setSub(d);
      setSelected(new Set());
      // Okunabilir başlık için dosya bağlamı (best-effort; başarısızsa caseId gösterilir).
      try {
        const c = (await api.getCase(d.caseId)) as {
          fileNumber?: string;
          client?: { displayName?: string; name?: string };
        };
        const name = c?.client?.displayName || c?.client?.name;
        setCaseLabel(`${c?.fileNumber ?? d.caseId}${name ? " · " + name : ""}`);
      } catch {
        setCaseLabel(d.caseId);
      }
    } catch {
      setNotFound(true);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  const isInReview = sub?.status === "IN_REVIEW";
  const canClaim = sub?.status === "CLIENT_SUBMITTED";
  const canReject = sub?.status === "CLIENT_SUBMITTED" || sub?.status === "IN_REVIEW";
  const fieldEditable = (f: IntakeSubmissionField) => isInReview && !f.promotedRefId;

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      await api.claimIntakeSubmission(params.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Üstlenilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const reviewOne = async (fieldId: string, decision: "APPROVE" | "REJECT") => {
    setBusy(true);
    setError("");
    try {
      setSub(await api.reviewIntakeField(fieldId, decision));
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const bulkReview = async (decision: "APPROVE" | "REJECT") => {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const updated = await api.bulkReviewIntakeFields(params.id, Array.from(selected), decision);
      setSub(updated);
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toplu işlem başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const rejectSubmission = async () => {
    setBusy(true);
    setError("");
    try {
      setSub(await api.rejectIntakeSubmission(params.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reddedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (notFound) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link href="/client-intake" className="text-sm text-blue-600 hover:text-blue-800">← Kuyruğa dön</Link>
        <p className="mt-4 text-slate-600">Gönderim bulunamadı.</p>
      </div>
    );
  }
  if (!sub) {
    return <p className="text-sm text-slate-400 p-6">Yükleniyor…</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/client-intake" className="text-sm text-blue-600 hover:text-blue-800">← Kuyruğa dön</Link>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Bilgi Formu Gönderimi</h1>
          <p className="text-sm text-slate-500">
            <Link href={`/cases/${sub.caseId}`} className="underline hover:text-slate-700">
              {caseLabel || sub.caseId}
            </Link>
          </p>
        </div>
        <span className="inline-block rounded px-2.5 py-1 text-xs font-medium bg-slate-100 text-slate-700">
          {SUB_STATUS_LABELS[sub.status]}
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Aksiyon çubuğu — REVIEW lifecycle (promote YOK) */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {canClaim && (
          <button
            type="button"
            onClick={claim}
            disabled={busy}
            className="rounded-md bg-slate-800 text-white px-4 py-2 text-sm font-medium hover:bg-slate-900 disabled:opacity-60"
          >
            İncelemeyi üstlen
          </button>
        )}
        {isInReview && (
          <>
            <button
              type="button"
              onClick={() => bulkReview("APPROVE")}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-green-300 text-green-700 px-3 py-2 text-sm font-medium hover:bg-green-50 disabled:opacity-50"
            >
              Seçili alanları onayla ({selected.size})
            </button>
            <button
              type="button"
              onClick={() => bulkReview("REJECT")}
              disabled={busy || selected.size === 0}
              className="rounded-md border border-red-300 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
            >
              Seçili alanları reddet ({selected.size})
            </button>
          </>
        )}
        {canReject && (
          <button
            type="button"
            onClick={rejectSubmission}
            disabled={busy}
            className="ml-auto rounded-md border border-red-300 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-60"
          >
            Gönderimi reddet
          </button>
        )}
      </div>

      {canClaim && (
        <p className="mt-2 text-xs text-slate-500">
          Alanları incelemek için önce gönderimi üstlenin.
        </p>
      )}

      {/* Alanlar */}
      <div className="mt-4 space-y-2">
        {sub.fields.length === 0 ? (
          <p className="text-sm text-slate-400">Bu gönderimde alan yok.</p>
        ) : (
          sub.fields.map((f) => (
            <div key={f.id} className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                {isInReview && (
                  <input
                    type="checkbox"
                    aria-label={`Seç: ${CATEGORY_LABELS[f.category] ?? f.category}`}
                    className="mt-1 rounded border-slate-300 disabled:opacity-40"
                    checked={selected.has(f.id)}
                    disabled={!fieldEditable(f)}
                    onChange={() => toggleSelect(f.id)}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700">
                      {CATEGORY_LABELS[f.category] ?? f.category}
                    </span>
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${REVIEW_CLASSES[f.reviewStatus]}`}>
                      {REVIEW_LABELS[f.reviewStatus]}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words">{f.value}</p>
                  {f.reviewNote && <p className="mt-1 text-xs text-slate-500">Not: {f.reviewNote}</p>}
                </div>
                {fieldEditable(f) && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => reviewOne(f.id, "APPROVE")}
                      disabled={busy}
                      className="rounded-md border border-green-300 text-green-700 px-2.5 py-1 text-xs font-medium hover:bg-green-50 disabled:opacity-50"
                    >
                      Onayla
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewOne(f.id, "REJECT")}
                      disabled={busy}
                      className="rounded-md border border-red-300 text-red-700 px-2.5 py-1 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
                    >
                      Reddet
                    </button>
                  </div>
                )}
                {f.promotedRefId && (
                  <span className="shrink-0 text-[11px] text-slate-400 mt-1">Düzenlenemez</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
