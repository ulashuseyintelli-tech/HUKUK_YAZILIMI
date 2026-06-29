"use client";

// Hata logu detay drawer'ı — Humanized Display + Remediation Guide.
// İKİ KATMAN: (1) kullanıcı/yönetici için anlaşılır Türkçe — "Bu hata ne anlama geliyor?"
// (başlık·özet·muhtemel etki·ne yapmalısınız) + "Teknik ekip için çözüm notu". (2) korunan
// teknik bölüm: ham mesaj/kod/işlem kimliği/endpoint/stack/metadata + copy butonları.
// KORUNAN: metadata/stack yalnız text/pre (HTML render YOK → React text-escape); resolve akışı;
// ham teknik veri SİLİNMEZ. Türkçeleştirme yalnız GÖRÜNTÜ — saklanan veri değişmez.
import { type ErrorLogRecord } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { getErrorLogPresentation } from "@/lib/error-log-presentation";
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

// Sıralı aksiyon listesi — numaralar CSS marker (list-decimal), metin düğümü DEĞİL.
function ActionList({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal list-inside text-sm space-y-1 mt-1">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ol>
  );
}

export function ErrorLogDetailDrawer({ log, onClose, onResolved }: Props) {
  if (!log) return null;
  const p = getErrorLogPresentation(log);
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
          <span className="px-2 py-0.5 rounded bg-gray-100">{p.levelLabel}</span>
          <span className="px-2 py-0.5 rounded bg-gray-100">{p.sourceLabel}</span>
          <span className={`px-2 py-0.5 rounded ${log.isResolved ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {log.isResolved ? "Çözüldü" : "Açık"}
          </span>
          {(log.occurrenceCount ?? 1) > 1 && (
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">×{log.occurrenceCount}</span>
          )}
        </div>

        {/* KATMAN 1 — kullanıcı/yönetici için anlaşılır anlam */}
        <section className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
            Bu hata ne anlama geliyor?
          </div>
          <div className="text-base font-semibold text-gray-900">{p.title}</div>
          <div className="text-sm text-gray-700 mt-1">{p.summary}</div>

          {p.pageLabel && (
            <div className="mt-3 rounded-md bg-white/70 border border-blue-100 px-3 py-2">
              <span className="text-xs font-medium text-gray-500">Sorunlu Sayfa: </span>
              <span className="text-sm font-semibold text-gray-900">{p.pageLabel}</span>
            </div>
          )}

          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500">Muhtemel Etki</div>
            <div className="text-sm text-gray-700 mt-0.5">{p.impact}</div>
          </div>

          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500">Ne Yapmalısınız?</div>
            <ActionList items={p.userAction} />
          </div>
        </section>

        {/* Teknik ekip çözüm notu */}
        <section className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
            Teknik ekip için çözüm notu
          </div>
          <ActionList items={p.technicalAction} />
        </section>

        {/* KATMAN 2 — korunan teknik detay */}
        <div className="border-t pt-4">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Teknik Detay</div>

          {requestId && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-500">İşlem Kimliği</span>
                <CopyButton value={String(requestId)} ariaLabel="İşlem Kimliği kopyala" />
              </div>
              <div className="text-sm font-mono break-all">{String(requestId)}</div>
            </div>
          )}

          <Field label="Teknik Mesaj" value={log.message} />
          <Field label="Teknik Kod" value={p.technicalCode} mono />
          <Field label="Kaynak" value={p.sourceLabel} />
          {log.endpoint && (
            <Field
              label="Endpoint"
              value={`${log.method ?? ""} ${p.endpointLabel || log.endpoint}${log.statusCode ? ` (${log.statusCode})` : ""}`.trim()}
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
        </div>

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
