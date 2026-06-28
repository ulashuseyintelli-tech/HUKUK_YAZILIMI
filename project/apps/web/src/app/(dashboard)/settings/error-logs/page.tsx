"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Info, Bug, CheckCircle, RefreshCw } from "lucide-react";
import { api, type ErrorLogRecord, type ErrorLogStats } from "@/lib/api";
import { ErrorLogDetailDrawer } from "@/components/error/ErrorLogDetailDrawer";
import { relativeTime } from "@/lib/relative-time";

const levelConfig: Record<string, { icon: ReactNode; color: string; bg: string }> = {
  ERROR: { icon: <AlertCircle className="w-4 h-4" />, color: "text-red-600", bg: "bg-red-100" },
  WARN: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-yellow-600", bg: "bg-yellow-100" },
  INFO: { icon: <Info className="w-4 h-4" />, color: "text-blue-600", bg: "bg-blue-100" },
  DEBUG: { icon: <Bug className="w-4 h-4" />, color: "text-gray-600", bg: "bg-gray-100" },
};

const PAGE_SIZE = 50;

export default function ErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLogRecord[]>([]);
  const [stats, setStats] = useState<ErrorLogStats>({ total: 0, errors: 0, warnings: 0, unresolved: 0 });
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState<ErrorLogRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setForbidden(false);
    try {
      const [list, st] = await Promise.all([
        api.getErrorLogs({ level: levelFilter || undefined, source: sourceFilter || undefined, page, limit: PAGE_SIZE }),
        api.getErrorLogStats(),
      ]);
      setLogs(list.logs ?? []);
      setTotalPages(list.totalPages ?? 1);
      setStats(st);
    } catch (e: any) {
      if (e?.status === 403) {
        setForbidden(true);
        setLogs([]);
      } else {
        console.error("Error fetching logs:", e);
      }
    } finally {
      setLoading(false);
    }
  }, [levelFilter, sourceFilter, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleResolved = (updated: ErrorLogRecord) => {
    setSelected(updated);
    setLogs((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    api.getErrorLogStats().then(setStats).catch(() => undefined);
  };

  const onFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setPage(1);
  };

  if (forbidden) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Hata Logları</h1>
        <div className="bg-white rounded-lg border p-8 text-center text-gray-600">
          Bu sayfayı görüntüleme yetkiniz yok.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Hata Logları</h1>
        <button onClick={fetchData} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard value={stats.total} label="Toplam Log" />
        <StatCard value={stats.errors} label="Hata" tone="red" />
        <StatCard value={stats.warnings} label="Uyarı" tone="yellow" />
        <StatCard value={stats.unresolved} label="Çözülmemiş" tone="orange" />
      </div>

      <div className="flex gap-3 mb-4">
        <select value={levelFilter} onChange={(e) => onFilter(setLevelFilter)(e.target.value)} aria-label="Seviye filtresi" className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tüm Seviyeler</option>
          <option value="ERROR">Hata</option>
          <option value="WARN">Uyarı</option>
          <option value="INFO">Bilgi</option>
          <option value="DEBUG">Debug</option>
        </select>
        <select value={sourceFilter} onChange={(e) => onFilter(setSourceFilter)(e.target.value)} aria-label="Kaynak filtresi" className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tüm Kaynaklar</option>
          <option value="API">API</option>
          <option value="FRONTEND">Frontend</option>
          <option value="CRON">Cron</option>
          <option value="UYAP">UYAP</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Yükleniyor...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Henüz log kaydı yok</div>
        ) : (
          <div className="divide-y">
            {logs.map((log) => {
              const config = levelConfig[log.level] || levelConfig.INFO;
              return (
                <button key={log.id} type="button" onClick={() => setSelected(log)} className="w-full text-left p-4 hover:bg-gray-50 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${config.bg} ${config.color}`}>{config.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>{log.level}</span>
                      <span className="text-xs text-gray-500">{log.source}</span>
                      {(log.occurrenceCount ?? 1) > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">×{log.occurrenceCount}</span>
                      )}
                      {log.isResolved && <CheckCircle className="w-4 h-4 text-green-500" />}
                    </div>
                    <div className="font-medium mt-1 truncate">{log.message}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      <span title={new Date(log.lastSeenAt ?? log.createdAt).toLocaleString("tr-TR")}>
                        {relativeTime(log.lastSeenAt ?? log.createdAt)}
                      </span>
                      {log.endpoint && <span className="ml-2">{log.method} {log.endpoint}</span>}
                      {log.statusCode && <span className="ml-2">({log.statusCode})</span>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4 text-sm">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 border rounded disabled:opacity-50">
            Önceki
          </button>
          <span className="text-gray-500">Sayfa {page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1.5 border rounded disabled:opacity-50">
            Sonraki
          </button>
        </div>
      )}

      <ErrorLogDetailDrawer log={selected} onClose={() => setSelected(null)} onResolved={handleResolved} />
    </div>
  );
}

function StatCard({ value, label, tone }: { value: number; label: string; tone?: "red" | "yellow" | "orange" }) {
  const card =
    tone === "red" ? "bg-red-50 border-red-200" : tone === "yellow" ? "bg-yellow-50 border-yellow-200" : tone === "orange" ? "bg-orange-50 border-orange-200" : "bg-white";
  const num = tone === "red" ? "text-red-600" : tone === "yellow" ? "text-yellow-600" : tone === "orange" ? "text-orange-600" : "";
  const lbl = tone === "red" ? "text-red-500" : tone === "yellow" ? "text-yellow-500" : tone === "orange" ? "text-orange-500" : "text-gray-500";
  return (
    <div className={`rounded-lg border p-4 ${card}`}>
      <div className={`text-2xl font-bold ${num}`}>{value}</div>
      <div className={`text-sm ${lbl}`}>{label}</div>
    </div>
  );
}
