'use client';

/**
 * ClientInfoRequestsTab — "Bilgi Talepleri" (Task 5).
 *
 * ClientInfoRequest = legacy/email adapter kanalı (kanonik değil; ClientIntake canonical'dır —
 * bkz. ClientIntakeTab). Mevcut dosya-bazlı okuma ve üç işlem ucu tüketilir.
 * CL-Z03 işlem görünürlüğü sunucu sinyalinden gelir; tarayıcı yeni bir yetki üretmez.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ClientInfoRequestDTO, type ClientInfoRequestStatus } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ClientInfoRequestActions } from '@/components/address-discovery/ClientInfoRequestCard';

export interface ClientInfoRequestsCase {
  id: string;
  fileNumber?: string | null;
  caseStatus?: string | null;
}

interface ClientInfoRequestsTabProps {
  cases: ClientInfoRequestsCase[];
  clientId?: string;
}

const STATUS_LABELS: Record<ClientInfoRequestStatus, string> = {
  SENT: 'Gönderildi',
  RESPONDED: 'Yanıtlandı',
  NO_RESPONSE: 'Yanıt yok',
};

const STATUS_CLASSES: Record<ClientInfoRequestStatus, string> = {
  SENT: 'bg-blue-100 text-blue-800',
  RESPONDED: 'bg-green-100 text-green-800',
  NO_RESPONSE: 'bg-amber-100 text-amber-800',
};

const caseLabel = (caseItem: ClientInfoRequestsCase) =>
  [caseItem.fileNumber || caseItem.id, caseItem.caseStatus].filter(Boolean).join(' · ');

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('tr-TR');
};

const ts = (d?: string | null) => {
  if (!d) return 0;
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? 0 : dt.getTime();
};

function StatusBadge({ status }: { status: ClientInfoRequestStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function ClientInfoRequestsTab({ cases, clientId }: ClientInfoRequestsTabProps) {
  const { user } = useAuth();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id ?? null);
  const effectiveCaseId = cases.some(c => c.id === selectedCaseId) ? selectedCaseId : cases[0]?.id ?? null;
  const context = `${user?.tenantId}:${user?.id}:${user?.role}:${clientId ?? ''}:${effectiveCaseId ?? ''}`;
  const current = useRef(context); current.current = context;
  const sequence = useRef(0), mounted = useRef(true);
  const [result, setResult] = useState<{ context: string; requests: ClientInfoRequestDTO[] | null; error: string }>({ context: '', requests: null, error: '' });
  const [notice, setNotice] = useState<{ context: string; text: string } | null>(null);
  const requests = result.context === context ? result.requests : null;
  const error = result.context === context ? result.error : '';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (cases.length === 0) {
      setSelectedCaseId(null);
      return;
    }

    setSelectedCaseId((current) => (current && cases.some((c) => c.id === current) ? current : cases[0].id));
  }, [cases]);

  const reload = useCallback(async () => {
    const run = ++sequence.current;
    const active = () => mounted.current && current.current === context && sequence.current === run;
    setResult({ context, requests: null, error: '' });
    if (!effectiveCaseId) { if (active()) setResult({ context, requests: [], error: '' }); return; }
    try {
      const list = await (clientId === undefined ? api.getClientInfoRequestsForCase(effectiveCaseId)
        : api.getClientInfoRequestsForCase(effectiveCaseId, clientId));
      if (!Array.isArray(list) || list.some(row => row.caseId !== effectiveCaseId || (clientId !== undefined && row.clientId !== clientId))) {
        throw new Error('Info request context mismatch');
      }
      if (active()) setResult({ context, requests: [...list].sort((a, b) => ts(b.sentAt) - ts(a.sentAt)), error: '' });
    } catch (failure) {
      if (active()) setResult({ context, requests: [], error: 'Bilgi talepleri yüklenemedi.' });
      throw failure;
    }
  }, [effectiveCaseId, clientId, context]);
  useEffect(() => { void reload().catch(() => undefined); return () => { sequence.current++; }; }, [reload]);

  if (cases.length === 0) {
    return <p className="text-center py-6 text-gray-500">Bilgi talepleri dosya üzerinden gönderilir; bu müvekkile bağlı dosya yok.</p>;
  }

  const selectedCase = cases.find((c) => c.id === effectiveCaseId) ?? cases[0];
  const loading = requests === null;

  return (
    <div className="space-y-5">
      {cases.length > 1 ? (
        <div className="max-w-md">
          <label htmlFor="client-info-requests-case" className="block text-xs font-medium text-gray-500 mb-1">
            Dosya
          </label>
          <select
            id="client-info-requests-case"
            value={selectedCase.id}
            onChange={(event) => setSelectedCaseId(event.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {cases.map((caseItem) => (
              <option key={caseItem.id} value={caseItem.id}>
                {caseLabel(caseItem)}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-gray-500">Dosya: {caseLabel(selectedCase)}</p>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice?.context === context && <p role="status" className="text-sm">{notice.text}</p>}

      {error ? null : loading ? (
        <p className="text-center py-6 text-sm text-gray-400">Bilgi talepleri yükleniyor…</p>
      ) : requests.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">
          Bu dosya için bilgi talebi yok.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-medium">Durum</th>
                <th className="px-3 py-2 font-medium">Alıcı</th>
                <th className="px-3 py-2 font-medium">Konu</th>
                <th className="px-3 py-2 font-medium">İlgili Borçlu</th>
                <th className="px-3 py-2 font-medium">Gönderim</th>
                <th className="px-3 py-2 font-medium">Yanıt</th>
                <th className="px-3 py-2 font-medium">Hatırlatma</th>
                {clientId && <th className="px-3 py-2 font-medium">İşlemler</th>}
              </tr>
            </thead>
            <tbody>
              {requests.map((req) => (
                <tr key={req.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-3 py-2 text-gray-600">{req.emailTo}</td>
                  <td className="px-3 py-2 text-gray-600">{req.emailSubject}</td>
                  <td className="px-3 py-2 text-gray-600">{req.debtor?.name || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(req.sentAt)}</td>
                  <td className="px-3 py-2 text-gray-600">{fmtDate(req.respondedAt)}</td>
                  <td className="px-3 py-2 text-gray-600">{req.reminderCount}</td>
                  {clientId && <td className="px-3 py-2">
                    {req.actions ? <ClientInfoRequestActions key={`${context}:${req.id}`} request={req} onUpdate={async () => {
                      try {
                        await reload();
                        if (mounted.current && current.current === context) setNotice({ context, text: 'Bilgi talebi işlemi tamamlandı.' });
                      } catch (failure) {
                        if (mounted.current && current.current === context) setNotice({ context, text: 'İşlem tamamlandı; liste yenilenemedi. Tekrar işlem yapmadan güncel kaydı kontrol edin.' });
                        throw failure;
                      }
                    }} /> : <span className="text-xs text-gray-500">İşlem kullanılamıyor.</span>}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
