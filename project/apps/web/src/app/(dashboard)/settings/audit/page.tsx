'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Shield, User, Clock, FileText, RefreshCw } from 'lucide-react';

type AuditSafeScalar = string | number | boolean | null;
type AuditSafeValue = AuditSafeScalar | AuditSafeValue[] | { [key: string]: AuditSafeValue };

interface AuditSafeProjection {
  id?: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: {
    id: string | null;
    displayName: string | null;
  };
  description: string | null;
  metadata?: Record<string, AuditSafeValue>;
  oldValues?: Record<string, AuditSafeValue>;
  newValues?: Record<string, AuditSafeValue>;
  rawValuePresence: {
    metadata: boolean;
    oldValues: boolean;
    newValues: boolean;
  };
  createdAt?: string | null;
}

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userName?: string;
  userIp?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  safeProjection?: AuditSafeProjection | null;
  createdAt: string;
}

const actionLabels: Record<string, { label: string; color: string }> = {
  CREATE: { label: 'Oluşturma', color: 'bg-green-100 text-green-700' },
  UPDATE: { label: 'Güncelleme', color: 'bg-blue-100 text-blue-700' },
  DELETE: { label: 'Silme', color: 'bg-red-100 text-red-700' },
  LOGIN: { label: 'Giriş', color: 'bg-purple-100 text-purple-700' },
  LOGOUT: { label: 'Çıkış', color: 'bg-gray-100 text-gray-700' },
  EXPORT: { label: 'Dışa Aktarma', color: 'bg-yellow-100 text-yellow-700' },
};

const entityLabels: Record<string, string> = {
  CASE: 'Takip',
  CLIENT: 'Müvekkil',
  POA: 'Vekalet',
  USER: 'Kullanıcı',
  DEBTOR: 'Borçlu',
  TASK: 'Görev',
  DOCUMENT: 'Belge',
};

function labelAction(action: string): string {
  return actionLabels[action]?.label || action;
}

function labelEntity(entityType: string): string {
  return entityLabels[entityType] || entityType;
}

function safeSummary(log: AuditLog): string {
  return log.safeProjection?.description || `${labelAction(log.action)} - ${labelEntity(log.entityType)}`;
}

function safeActor(log: AuditLog): string {
  return log.safeProjection?.actor.displayName || log.safeProjection?.actor.id || '-';
}

function hasSafeFields(fields?: Record<string, AuditSafeValue>): boolean {
  return !!fields && Object.keys(fields).length > 0;
}

function formatSafeValue(value: AuditSafeValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return value.toLocaleString('tr-TR');
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(formatSafeValue).join(', ');
  return Object.entries(value)
    .map(([key, nestedValue]) => `${key}: ${formatSafeValue(nestedValue)}`)
    .join(', ');
}

function SafeFieldList({
  title,
  fields,
  tone,
}: {
  title: string;
  fields?: Record<string, AuditSafeValue>;
  tone: 'neutral' | 'old' | 'new';
}) {
  if (!hasSafeFields(fields)) return null;

  const toneClass =
    tone === 'old'
      ? 'border-red-100 bg-red-50'
      : tone === 'new'
        ? 'border-green-100 bg-green-50'
        : 'border-slate-100 bg-slate-50';

  return (
    <div>
      <label className="text-xs text-gray-500">{title}</label>
      <dl className={`mt-1 rounded border ${toneClass} divide-y divide-white/70 text-xs`}>
        {Object.entries(fields ?? {}).map(([key, value]) => (
          <div key={key} className="grid grid-cols-[minmax(7rem,0.38fr)_1fr] gap-3 px-3 py-2">
            <dt className="font-medium text-gray-600 break-all">{key}</dt>
            <dd className="text-gray-800 break-words">{formatSafeValue(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SafeUnavailableNotice({ log }: { log: AuditLog }) {
  if (log.safeProjection) return null;
  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      Safe audit summary unavailable. Ham audit JSON bu görünümde gösterilmez.
    </div>
  );
}

function SafePresenceNotice({ projection }: { projection?: AuditSafeProjection | null }) {
  if (!projection) return null;

  const hiddenRawSections = [
    projection.rawValuePresence.metadata && !hasSafeFields(projection.metadata) ? 'metadata' : null,
    projection.rawValuePresence.oldValues && !hasSafeFields(projection.oldValues) ? 'eski değerler' : null,
    projection.rawValuePresence.newValues && !hasSafeFields(projection.newValues) ? 'yeni değerler' : null,
  ].filter(Boolean);

  if (hiddenRawSections.length === 0) return null;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      Ham {hiddenRawSections.join(', ')} mevcut; güvenli projeksiyona uygun alan olmadığı için içerik gösterilmedi.
    </div>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, [page, filters.action, filters.entityType]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '20');
      if (filters.action) params.append('action', filters.action);
      if (filters.entityType) params.append('entityType', filters.entityType);

      const res = await api.get(`/audit/logs?${params.toString()}`);
      if (res.data) {
        setLogs(res.data.logs || []);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (error) {
      console.error('Audit logs yüklenemedi:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 rounded-lg">
            <Shield className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Audit Log</h1>
            <p className="text-xs text-muted-foreground">Sistem işlem geçmişi</p>
          </div>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Yenile
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4 p-3 bg-white rounded-lg border">
        <select
          aria-label="İşlem filtresi"
          value={filters.action}
          onChange={(e) => { setFilters({ ...filters, action: e.target.value }); setPage(1); }}
          className="px-3 py-2 text-sm border rounded-lg"
        >
          <option value="">Tüm İşlemler</option>
          <option value="CREATE">Oluşturma</option>
          <option value="UPDATE">Güncelleme</option>
          <option value="DELETE">Silme</option>
          <option value="LOGIN">Giriş</option>
          <option value="LOGOUT">Çıkış</option>
          <option value="EXPORT">Dışa Aktarma</option>
        </select>
        <select
          aria-label="Varlık filtresi"
          value={filters.entityType}
          onChange={(e) => { setFilters({ ...filters, entityType: e.target.value }); setPage(1); }}
          className="px-3 py-2 text-sm border rounded-lg"
        >
          <option value="">Tüm Varlıklar</option>
          <option value="CASE">Takip</option>
          <option value="CLIENT">Müvekkil</option>
          <option value="POA">Vekalet</option>
          <option value="USER">Kullanıcı</option>
          <option value="DEBTOR">Borçlu</option>
          <option value="TASK">Görev</option>
        </select>
      </div>

      <div className="flex-1 bg-white rounded-lg border overflow-hidden">
        <div className="overflow-auto h-full">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-3 font-medium">Tarih</th>
                <th className="text-left p-3 font-medium">İşlem</th>
                <th className="text-left p-3 font-medium">Varlık</th>
                <th className="text-left p-3 font-medium">Kullanıcı</th>
                <th className="text-left p-3 font-medium">Güvenli Özet</th>
                <th className="text-left p-3 font-medium">Detay</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Yükleniyor...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    Kayıt bulunamadı
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-xs">{formatDate(log.createdAt)}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${actionLabels[log.action]?.color || 'bg-gray-100'}`}>
                        {labelAction(log.action)}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span>{labelEntity(log.entityType)}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <span>{safeActor(log)}</span>
                      </div>
                    </td>
                    <td className="p-3 max-w-xs truncate">
                      {safeSummary(log)}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Görüntüle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Önceki
          </button>
          <span className="text-sm">Sayfa {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm border rounded disabled:opacity-50"
          >
            Sonraki
          </button>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">İşlem Detayı</h3>
              <button
                aria-label="Detayı kapat"
                onClick={() => setSelectedLog(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="text-xs text-gray-500">Tarih</label>
                  <p className="font-medium">{formatDate(selectedLog.createdAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">İşlem</label>
                  <p><span className={`px-2 py-1 rounded text-xs ${actionLabels[selectedLog.action]?.color}`}>
                    {labelAction(selectedLog.action)}
                  </span></p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Varlık Tipi</label>
                  <p className="font-medium">{labelEntity(selectedLog.entityType)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Varlık ID</label>
                  <p className="font-mono text-xs">{selectedLog.safeProjection?.entityId || selectedLog.entityId || '-'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Kullanıcı</label>
                  <p className="font-medium">{safeActor(selectedLog)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500">IP Adresi</label>
                  <p className="font-mono text-xs">{selectedLog.userIp || '-'}</p>
                </div>
              </div>

              <SafeUnavailableNotice log={selectedLog} />

              <div>
                <label className="text-xs text-gray-500">Güvenli Özet</label>
                <p className="text-sm mt-1">{selectedLog.safeProjection?.description || 'Safe audit summary unavailable'}</p>
              </div>

              <SafeFieldList title="Güvenli Metadata" fields={selectedLog.safeProjection?.metadata} tone="neutral" />
              <SafeFieldList title="Güvenli Eski Değerler" fields={selectedLog.safeProjection?.oldValues} tone="old" />
              <SafeFieldList title="Güvenli Yeni Değerler" fields={selectedLog.safeProjection?.newValues} tone="new" />
              <SafePresenceNotice projection={selectedLog.safeProjection} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
