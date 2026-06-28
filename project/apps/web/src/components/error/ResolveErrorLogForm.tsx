"use client";

// PR-5: Hata logu "çözüldü" formu. FRONTEND ZORUNLU: trim(resolution).length >= 10.
// Backend boş kabul etse de UI gevşemez (boş/kısa açıklamada submit ettirmez).
import { useState } from "react";
import { api, type ErrorLogRecord } from "@/lib/api";

const MIN_LEN = 10;

interface Props {
  logId: string;
  onResolved: (updated: ErrorLogRecord) => void;
}

export function ResolveErrorLogForm({ logId, onResolved }: Props) {
  const [resolution, setResolution] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedLen = resolution.trim().length;
  const valid = trimmedLen >= MIN_LEN;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.resolveErrorLog(logId, resolution.trim());
      onResolved(updated);
    } catch (e: any) {
      setError(e?.message || "Çözümleme başarısız");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="text-sm font-medium mb-2">Çözüldü olarak işaretle</div>
      <textarea
        value={resolution}
        onChange={(e) => setResolution(e.target.value)}
        placeholder={`Çözüm açıklaması (en az ${MIN_LEN} karakter)`}
        rows={3}
        aria-label="Çözüm açıklaması"
        className="w-full border rounded p-2 text-sm"
      />
      <div className="flex items-center justify-between mt-2">
        <span className={`text-xs ${valid ? "text-gray-400" : "text-amber-600"}`}>
          {trimmedLen}/{MIN_LEN}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || submitting}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Kaydediliyor..." : "Çözüldü İşaretle"}
        </button>
      </div>
      {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
    </div>
  );
}
