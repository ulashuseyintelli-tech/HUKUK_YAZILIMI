"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, AlertCircle, Info, Bug, CheckCircle, RefreshCw, Filter, Search } from "lucide-react";

interface ErrorLog {
  id: string;
  level: string;
  source: string;
  message: string;
  stack?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string;
  isResolved: boolean;
  createdAt: string;
}

const levelConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  ERROR: { icon: <AlertCircle className="w-4 h-4" />, color: "text-red-600", bg: "bg-red-100" },
  WARN: { icon: <AlertTriangle className="w-4 h-4" />, color: "text-yellow-600", bg: "bg-yellow-100" },
  INFO: { icon: <Info className="w-4 h-4" />, color: "text-blue-600", bg: "bg-blue-100" },
  DEBUG: { icon: <Bug className="w-4 h-4" />, color: "text-gray-600", bg: "bg-gray-100" },
};

export default function ErrorLogsPage() {
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, errors: 0, warnings: 0, unresolved: 0 });
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const params = new URLSearchParams();
      if (levelFilter) params.append("level", levelFilter);
      if (sourceFilter) params.append("source", sourceFilter);
      
      const [logsRes, statsRes] = await Promise.all([
        fetch(`http://localhost:8080/api/error-logs?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("http://localhost:8080/api/error-logs/stats", {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      
      const logsData = await logsRes.json();
      const statsData = await statsRes.json();
      setLogs(logsData.logs || []);
      setStats(statsData);
    } catch (e) {
      console.error("Error fetching logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [levelFilter, sourceFilter]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Hata Logları</h1>
        <button onClick={fetchLogs} className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Yenile
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-sm text-gray-500">Toplam Log</div>
        </div>
        <div className="bg-red-50 rounded-lg border border-red-200 p-4">
          <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
          <div className="text-sm text-red-500">Hata</div>
        </div>
        <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">{stats.warnings}</div>
          <div className="text-sm text-yellow-500">Uyarı</div>
        </div>
        <div className="bg-orange-50 rounded-lg border border-orange-200 p-4">
          <div className="text-2xl font-bold text-orange-600">{stats.unresolved}</div>
          <div className="text-sm text-orange-500">Çözülmemiş</div>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">Tüm Seviyeler</option>
          <option value="ERROR">Hata</option>
          <option value="WARN">Uyarı</option>
          <option value="INFO">Bilgi</option>
          <option value="DEBUG">Debug</option>
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
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
                <div key={log.id} className="p-4">
                  <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                    <div className={`p-2 rounded-lg ${config.bg} ${config.color}`}>{config.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${config.bg} ${config.color}`}>{log.level}</span>
                        <span className="text-xs text-gray-500">{log.source}</span>
                        {log.isResolved && <CheckCircle className="w-4 h-4 text-green-500" />}
                      </div>
                      <div className="font-medium mt-1 truncate">{log.message}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(log.createdAt).toLocaleString("tr-TR")}
                        {log.endpoint && <span className="ml-2">{log.method} {log.endpoint}</span>}
                        {log.statusCode && <span className="ml-2">({log.statusCode})</span>}
                      </div>
                    </div>
                  </div>
                  {expandedId === log.id && log.stack && (
                    <pre className="mt-3 p-3 bg-gray-900 text-gray-100 text-xs rounded-lg overflow-x-auto">{log.stack}</pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
