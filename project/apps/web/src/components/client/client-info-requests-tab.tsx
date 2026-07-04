'use client';

/**
 * ClientInfoRequestsTab — "Bilgi Talepleri" (Task 5).
 *
 * ClientInfoRequest = legacy/email adapter kanalı (kanonik değil; ClientIntake canonical'dır —
 * bkz. ClientIntakeTab). Bu sekme YALNIZ okuma: address-discovery modülünün mevcut dosya-bazlı
 * endpoint'i (GET /address-discovery/client-info-request/case/:caseId) müvekkilin dosyaları
 * üzerinden dolaşılarak gösterilir. Yeni endpoint/mutation YOK; respond/reminder/no-response
 * aksiyonları case detayında (address-discovery) zaten var — burada tekrarlanmaz (read-only v1).
 */
import { useEffect, useState } from 'react';
import { api, type ClientInfoRequestDTO, type ClientInfoRequestStatus } from '@/lib/api';

export interface ClientInfoRequestsCase {
  id: string;
  fileNumber?: string | null;
  caseStatus?: string | null;
}

interface ClientInfoRequestsTabProps {
  cases: ClientInfoRequestsCase[];
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

export function ClientInfoRequestsTab({ cases }: ClientInfoRequestsTabProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id ?? null);
  const [requests, setRequests] = useState<ClientInfoRequestDTO[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (cases.length === 0) {
      setSelectedCaseId(null);
      return;
    }

    setSelectedCaseId((current) => (current && cases.some((c) => c.id === current) ? current : cases[0].id));
  }, [cases]);

  useEffect(() => {
    if (!selectedCaseId) {
      setRequests([]);
      setError('');
      return;
    }

    let active = true;
    setRequests(null);
    setError('');

    api
      .getClientInfoRequestsForCase(selectedCaseId)
      .then((list) => {
        if (!active) return;
        setRequests([...list].sort((a, b) => ts(b.sentAt) - ts(a.sentAt)));
      })
      .catch(() => {
        if (!active) return;
        setRequests([]);
        setError('Bilgi talepleri yüklenemedi.');
      });

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  if (cases.length === 0) {
    return <p className="text-center py-6 text-gray-500">Bu müvekkile bağlı dosya yok.</p>;
  }

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? cases[0];
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

      {loading ? (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
