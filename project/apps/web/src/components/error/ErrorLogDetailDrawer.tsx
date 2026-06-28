"use client";

// PR-5 + polish: Hata logu detay drawer'ı. Tüm alanlar + metadata viewer (GÜVENLİ JSON: <pre>,
// max-height, overflow, HTML render YOK → React text-escape) + requestId üstte. Çözülmemişse resolve formu.
// Polish: requestId/stack/metadata copy butonları · firstSeen/lastSeen/resolvedAt göreli zaman (absolute=title)
// · uzun message taşmadan sarılır. KORUNAN: metadata/stack yalnız text/pre; resolve akışı; alan semantiği.
import { type ErrorLogRecord } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { ResolveErrorLogForm } from "./ResolveErrorLogForm";
import { CopyButton } from "./CopyButton";

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
      <div className={`text-sm break-words whitespace-pre-wrap ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function TimeField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 mb-0.5">{label}</div>
      <div className="text-sm" title={fmt(value)}>
        {relativeTime(value)}
      </div>
    </div>
  );
}

export function ErrorLogDetailDrawer({ log, onClose, onResolved }: Props) {
  if (!log) return null;
  const requestId = log.metadata && typeof log.metadata === "object" ? (log.metadata as any).requestId : undefined;
  const metadataJson = log.metadata ? JSON.stringify(log.metadata, null, 2) : "";

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
          {(log.occurrenceCount ?? 1) > 1 && (
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">×{log.occurrenceCount}</span>
          )}
        </div>

        {requestId && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs text-gray-500">Request ID</span>
              <CopyButton value={String(requestId)} ariaLabel="Request ID kopyala" />
            </div>
            <div className="text-sm font-mono break-all">{String(requestId)}</div>
          </div>
        )}

        <Field label="Mesaj" value={log.message} />
        {log.endpoint && (
          <Field
            label="Endpoint"
            value={`${log.method ?? ""} ${log.endpoint}${log.statusCode ? ` (${log.statusCode})` : ""}`.trim()}
          />
        )}
        <Field label="Tekrar" value={String(log.occurrenceCount ?? 1)} />
        <TimeField label="İlk görülme" value={log.firstSeenAt ?? log.createdAt} />
        <TimeField label="Son görülme" value={log.lastSeenAt ?? log.createdAt} />
        {log.userId && <Field label="Kullanıcı" value={log.userId} mono />}

        {log.stack && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Stack</span>
              <CopyButton value={log.stack} ariaLabel="Stack kopyala" />
            </div>
            <pre className="max-h-64 overflow-auto bg-gray-900 text-gray-100 text-xs p-3 rounded">{log.stack}</pre>
          </div>
        )}

        {log.metadata && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Metadata</span>
              <CopyButton value={metadataJson} ariaLabel="Metadata kopyala" />
            </div>
            <pre className="max-h-64 overflow-auto bg-gray-50 text-xs p-3 rounded border">{metadataJson}</pre>
          </div>
        )}

        {log.isResolved ? (
          <div className="mt-4 border-t pt-4">
            <div className="text-green-700 font-medium text-sm mb-2">Çözüldü</div>
            {log.resolution && <Field label="Açıklama" value={log.resolution} />}
            {log.resolvedBy && <Field label="Çözen" value={log.resolvedBy} mono />}
            {log.resolvedAt && <TimeField label="Çözüm zamanı" value={log.resolvedAt} />}
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
