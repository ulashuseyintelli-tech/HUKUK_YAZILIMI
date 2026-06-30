'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  api,
  type IntakeFieldCategory,
  type IntakeLink,
  type IntakeLinkStatus,
  type IntakeSubmission,
  type IntakeSubmissionStatus,
} from '@/lib/api';

export interface ClientIntakeCase {
  id: string;
  fileNumber?: string | null;
  caseStatus?: string | null;
}

interface ClientIntakeTabProps {
  cases: ClientIntakeCase[];
}

const SUBMISSION_STATUSES: IntakeSubmissionStatus[] = [
  'CLIENT_SUBMITTED',
  'IN_REVIEW',
  'PARTIALLY_PROMOTED',
  'COMPLETED',
  'REJECTED',
];

const LINK_STATUS_LABELS: Record<IntakeLinkStatus, string> = {
  ACTIVE: 'Aktif',
  USED: 'Kullanıldı',
  EXPIRED: 'Süresi doldu',
  REVOKED: 'İptal edildi',
};

const LINK_STATUS_CLASSES: Record<IntakeLinkStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  USED: 'bg-blue-100 text-blue-800',
  EXPIRED: 'bg-amber-100 text-amber-800',
  REVOKED: 'bg-slate-100 text-slate-600',
};

const SUBMISSION_STATUS_LABELS: Record<IntakeSubmissionStatus, string> = {
  CLIENT_SUBMITTED: 'Yeni gönderim',
  IN_REVIEW: 'İncelemede',
  PARTIALLY_PROMOTED: 'Kısmen işlendi',
  COMPLETED: 'Tamamlandı',
  REJECTED: 'Reddedildi',
};

const SUBMISSION_STATUS_CLASSES: Record<IntakeSubmissionStatus, string> = {
  CLIENT_SUBMITTED: 'bg-blue-100 text-blue-800',
  IN_REVIEW: 'bg-amber-100 text-amber-800',
  PARTIALLY_PROMOTED: 'bg-indigo-100 text-indigo-800',
  COMPLETED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-700',
};

const CATEGORY_LABELS: Record<IntakeFieldCategory, string> = {
  INCOME_SOURCE: 'Gelir Kaynağı',
  COMMERCIAL_RELATION: 'Ticari İlişki',
  FAMILY_CIRCLE: 'Aile / Yakın Çevre',
  DIGITAL_FOOTPRINT: 'Dijital İz',
  PAYMENT_HISTORY: 'Tahsilat Geçmişi',
  STRATEGY: 'Dosya Stratejisi',
  ADDRESS: 'Adres',
  ASSET: 'Varlık',
  CONTACT: 'İletişim',
};

const caseLabel = (caseItem: ClientIntakeCase) =>
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

async function listAllSubmissions(caseId: string): Promise<IntakeSubmission[]> {
  const groups = await Promise.all(
    SUBMISSION_STATUSES.map((status) => api.listIntakeSubmissions({ caseId, status })),
  );
  const byId = new Map<string, IntakeSubmission>();
  for (const item of groups.flat()) byId.set(item.id, item);
  return Array.from(byId.values()).sort((a, b) => ts(b.submittedAt) - ts(a.submittedAt));
}

function StatusBadge({ label, className }: { label: string; className: string }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

export function ClientIntakeTab({ cases }: ClientIntakeTabProps) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(cases[0]?.id ?? null);
  const [links, setLinks] = useState<IntakeLink[] | null>(null);
  const [submissions, setSubmissions] = useState<IntakeSubmission[] | null>(null);
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
      setLinks([]);
      setSubmissions([]);
      setError('');
      return;
    }

    let active = true;
    setLinks(null);
    setSubmissions(null);
    setError('');

    Promise.all([api.listIntakeLinks(selectedCaseId), listAllSubmissions(selectedCaseId)])
      .then(([nextLinks, nextSubmissions]) => {
        if (!active) return;
        setLinks(nextLinks);
        setSubmissions(nextSubmissions);
      })
      .catch(() => {
        if (!active) return;
        setLinks([]);
        setSubmissions([]);
        setError('Intake bilgileri yüklenemedi.');
      });

    return () => {
      active = false;
    };
  }, [selectedCaseId]);

  if (cases.length === 0) {
    return <p className="text-center py-6 text-gray-500">Bu müvekkile bağlı dosya yok.</p>;
  }

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? cases[0];
  const loading = links === null || submissions === null;

  return (
    <div className="space-y-5">
      {cases.length > 1 ? (
        <div className="max-w-md">
          <label htmlFor="client-intake-case" className="block text-xs font-medium text-gray-500 mb-1">
            Dosya
          </label>
          <select
            id="client-intake-case"
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
        <p className="text-center py-6 text-sm text-gray-400">Intake bilgileri yükleniyor…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Link</p>
              <p className="text-lg font-semibold text-gray-800">{links.length}</p>
            </div>
            <div className="rounded-lg border bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Gönderim</p>
              <p className="text-lg font-semibold text-gray-800">{submissions.length}</p>
            </div>
          </div>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Intake Linkleri</h3>
            {links.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">
                Bu dosya için intake linki yok.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Durum</th>
                      <th className="px-3 py-2 font-medium">Kategoriler</th>
                      <th className="px-3 py-2 font-medium">Oluşturma</th>
                      <th className="px-3 py-2 font-medium">Son kullanma</th>
                      <th className="px-3 py-2 font-medium">Kullanım</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((link) => (
                      <tr key={link.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <StatusBadge
                            label={LINK_STATUS_LABELS[link.status]}
                            className={LINK_STATUS_CLASSES[link.status]}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-600">
                          {link.scope.map((category) => CATEGORY_LABELS[category] ?? category).join(', ')}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(link.createdAt)}</td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(link.expiresAt)}</td>
                        <td className="px-3 py-2 text-gray-600">
                          {link.useCount}/{link.maxUses}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Intake Gönderimleri</h3>
            {submissions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-gray-400">
                Bu dosya için intake gönderimi yok.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                      <th className="px-3 py-2 font-medium">Durum</th>
                      <th className="px-3 py-2 font-medium">Gönderim tarihi</th>
                      <th className="px-3 py-2 font-medium">İnceleme tarihi</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map((submission) => (
                      <tr key={submission.id} className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <StatusBadge
                            label={SUBMISSION_STATUS_LABELS[submission.status]}
                            className={SUBMISSION_STATUS_CLASSES[submission.status]}
                          />
                        </td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(submission.submittedAt)}</td>
                        <td className="px-3 py-2 text-gray-600">{fmtDate(submission.reviewedAt)}</td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/client-intake/${submission.id}`}
                            className="text-sm font-medium text-blue-600 hover:text-blue-800"
                          >
                            Detaylı incelemeye git
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}