"use client";

// PR-5: Hata logu detay drawer'ı. Tüm alanlar + metadata viewer (GÜVENLİ JSON: <pre>, max-height,
// overflow, HTML render YOK → React text-escape) + requestId üst alanda. Çözülmemişse resolve formu.
import { type ErrorLogRecord } from "@/lib/api";
import { ResolveErrorLogForm } from "./ResolveErrorLogForm";

interface Props {
  log: ErrorLogRecord | null;
  onClose: () => void;
  onResolved: (updated: ErrorLogRecord) => void;
}

function fmt(d?: string | null): string {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("tr-TR");
  } catch {
    return String(d);
  }
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className={`text-sm break-words ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

export function ErrorLogDetailDrawer({ log, onClose, onResolved }: Props) {
  if (!log) return null;
  const requestId = log.metadata && typeof log.metadata === "object" ? (log.metadata as any).requestId : undefined;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Hata log detayı">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-xl bg-white h-full overflow-y-auto p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Hata Detayı</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="text-gray-400 hover:text-gray-700">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 text-xs">
          <span className="px-2 py-0.5 rounded bg-gray-100">{log.level}</span>
          <span className="px-2 py-0.5 rounded bg-gray-100">{log.source}</span>
          <span className={`px-2 py-0.5 rounded ${log.isResolved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {log.isResolved ? "Çözüldü" : "Açık"}
          </span>
        </div>

        {requestId && <Field label="Request ID" value={String(requestId)} mono />}
        <Field label="Mesaj" value={log.message} />
        {log.endpoint && (
          <Field
            label="Endpoint"
            value={`${log.method ?? ""} ${log.endpoint}${log.statusCode ? ` (${log.statusCode})` : ""}`.trim()}
          />
        )}
        <Field label="Tekrar" value={String(log.occurrenceCount ?? 1)} />
        <Field label="İlk görülme" value={fmt(log.firstSeenAt ?? log.createdAt)} />
        <Field label="Son görülme" value={fmt(log.lastSeenAt ?? log.createdAt)} />
        {log.userId && <Field label="Kullanıcı" value={log.userId} mono />}

        {log.stack && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Stack</div>
            <pre className="max-h-64 overflow-auto bg-gray-900 text-gray-100 text-xs p-3 rounded">{log.stack}</pre>
          </div>
        )}

        {log.metadata && (
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">Metadata</div>
            <pre className="max-h-64 overflow-auto bg-gray-50 text-xs p-3 rounded border">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        )}

        {log.isResolved ? (
          <div className="mt-4 border-t pt-4">
            <div className="text-green-700 font-medium text-sm mb-2">Çözüldü</div>
            {log.resolution && <Field label="Açıklama" value={log.resolution} />}
            {log.resolvedBy && <Field label="Çözen" value={log.resolvedBy} mono />}
            {log.resolvedAt && <Field label="Çözüm zamanı" value={fmt(log.resolvedAt)} />}
          </div>
        ) : (
          <div className="mt-4 border-t pt-4">
            <ResolveErrorLogForm logId={log.id} onResolved={onResolved} />
          </div>
        )}
      </div>
    </div>
  );
}
