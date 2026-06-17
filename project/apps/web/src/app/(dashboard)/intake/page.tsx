"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, IntakeSubmission, IntakeSubmissionStatus } from "@/lib/api";

/**
 * Müvekkil Bilgi Formu — İnceleme Kuyruğu (Faz 4.7 PR-C1) — personel/JWT.
 *
 * REVIEW-ONLY: yalnız kuyruk listesi. Promote / kanoniğe yazım YOK (C2 ayrı).
 */

const STATUS_LABELS: Record<IntakeSubmissionStatus, string> = {
  CLIENT_SUBMITTED: "Yeni gönderim",
  IN_REVIEW: "İncelemede",
  PARTIALLY_PROMOTED: "Kısmen işlendi",
  COMPLETED: "Tamamlandı",
  REJECTED: "Reddedildi",
};

const STATUS_CLASSES: Record<IntakeSubmissionStatus, string> = {
  CLIENT_SUBMITTED: "bg-blue-100 text-blue-800",
  IN_REVIEW: "bg-amber-100 text-amber-800",
  PARTIALLY_PROMOTED: "bg-violet-100 text-violet-800",
  COMPLETED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-700",
};

const FILTERS: { value: "" | IntakeSubmissionStatus; label: string }[] = [
  { value: "", label: "Bekleyenler" },
  { value: "CLIENT_SUBMITTED", label: "Yeni gönderim" },
  { value: "IN_REVIEW", label: "İncelemede" },
  { value: "PARTIALLY_PROMOTED", label: "Kısmen işlendi" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "REJECTED", label: "Reddedildi" },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("tr-TR");
}

export default function IntakeQueuePage() {
  const [items, setItems] = useState<IntakeSubmission[] | null>(null);
  const [status, setStatus] = useState<"" | IntakeSubmissionStatus>("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    setItems(null);
    try {
      const data = await api.listIntakeSubmissions(status ? { status } : undefined);
      setItems(data);
    } catch {
      setItems([]);
      setError("İnceleme kuyruğu yüklenemedi.");
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-800">Bilgi Formları</h1>
        <select
          aria-label="Durum filtresi"
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | IntakeSubmissionStatus)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          {FILTERS.map((f) => (
            <option key={f.value || "default"} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Müvekkillerin doldurduğu bilgi formu gönderimleri. Bir gönderimi inceleyip alanları onaylayın
        ya da reddedin.
      </p>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {items === null ? (
          <p className="text-sm text-slate-400 p-6 text-center">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-400 p-6 text-center">Bu filtrede gönderim yok.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 font-medium">Durum</th>
                <th className="px-4 py-2 font-medium">Gönderim tarihi</th>
                <th className="px-4 py-2 font-medium">Dosya</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[s.status]}`}>
                      {STATUS_LABELS[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{fmtDate(s.submittedAt)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/cases/${s.caseId}`} className="text-slate-500 hover:text-slate-700 underline">
                      Dosyaya git
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/intake-review/${s.id}`}
                      className="text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      İncele →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
