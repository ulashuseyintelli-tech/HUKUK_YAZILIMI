'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Spinner } from '@hukuk/ui';
import { FileClock, FileText } from 'lucide-react';
import {
  clientFinancialDisclosureApi,
  type OfficeDisclosureSummary,
} from '@/lib/api/client-financial-disclosure';
import { DisclosureStatusBadge } from './DisclosureStatusBadge';

const displayDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString('tr-TR') : '—';

const displayAmount = (value: string, currency: string) => `${value} ${currency}`;

function CurrentEffectiveMark({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      Güncel geçerli sürüm
    </span>
  ) : null;
}

function DisclosureList({
  items,
  selectedVersionId,
  onSelect,
}: {
  items: readonly OfficeDisclosureSummary[];
  selectedVersionId: string | null;
  onSelect: (item: OfficeDisclosureSummary) => void;
}) {
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <FileText className="h-4 w-4" aria-hidden /> Finansal bildirimler
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-3">Büro dosya no</th>
              <th className="py-2 pr-3">Müvekkil</th>
              <th className="py-2 pr-3">Sürüm</th>
              <th className="py-2 pr-3">Durum</th>
              <th className="py-2 pr-3">Müvekkil net</th>
              <th className="py-2">Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.versionId} className="border-b last:border-0">
                <td className="py-2 pr-3">
                  <button
                    type="button"
                    className="font-medium text-blue-700 hover:underline"
                    aria-pressed={selectedVersionId === item.versionId}
                    aria-label={`${item.officeFileNumber} numaralı finansal bildirimi aç`}
                    onClick={() => onSelect(item)}
                  >
                    {item.officeFileNumber}
                  </button>
                </td>
                <td className="py-2 pr-3">{item.clientName}</td>
                <td className="py-2 pr-3">v{item.version}</td>
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap gap-1">
                    <DisclosureStatusBadge status={item.status} />
                    <CurrentEffectiveMark active={item.isCurrentEffective} />
                  </div>
                </td>
                <td className="py-2 pr-3">{displayAmount(item.clientNetAmount, item.currency)}</td>
                <td className="py-2">{displayDate(item.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function FinancialDisclosureWorkspace({ clientId }: { clientId: string }) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['client-financial-disclosures', 'office-list', clientId],
    queryFn: () => clientFinancialDisclosureApi.list(clientId),
  });

  // Route parametresi değişirse eski müvekkilin seçimi yeni scope'a taşınmaz.
  const selection =
    list.data?.items.find((item) => item.versionId === selectedVersionId) ??
    list.data?.items[0] ??
    null;

  const detail = useQuery({
    queryKey: ['client-financial-disclosures', 'office-detail', clientId, selection?.versionId],
    queryFn: () => clientFinancialDisclosureApi.getDetail(clientId, selection!.versionId),
    enabled: Boolean(selection),
  });

  const history = useQuery({
    queryKey: ['client-financial-disclosures', 'office-history', clientId, selection?.disclosureId],
    queryFn: () => clientFinancialDisclosureApi.getHistory(clientId, selection!.disclosureId),
    enabled: Boolean(selection),
  });

  if (list.isLoading) return <Spinner data-testid="financial-disclosures-loading" />;
  if (list.isError || !list.isSuccess) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Finansal bildirimler yüklenemedi. Yetki ve müvekkil kapsamını kontrol edin.
      </div>
    );
  }
  if (list.data.items.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="font-semibold">Finansal bildirimler</h2>
        <p className="mt-2 text-sm text-gray-500">Bu müvekkil için finansal bildirim bulunmuyor.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DisclosureList
        items={list.data.items}
        selectedVersionId={selection?.versionId ?? null}
        onSelect={(item) => setSelectedVersionId(item.versionId)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-base font-semibold">Bildirim detayı</h2>
          {detail.isLoading ? <Spinner data-testid="financial-disclosure-detail-loading" /> : null}
          {detail.isError ? (
            <p role="alert" className="mt-2 text-sm text-red-700">Bildirim detayı yüklenemedi.</p>
          ) : null}
          {detail.isSuccess ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <DisclosureStatusBadge status={detail.data.status} />
                <CurrentEffectiveMark active={detail.data.isCurrentEffective} />
              </div>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                <dt className="text-gray-500">Büro dosya no</dt><dd>{detail.data.officeFileNumber}</dd>
                <dt className="text-gray-500">Sürüm</dt><dd>v{detail.data.version}</dd>
                <dt className="text-gray-500">Toplam tahsilat</dt><dd>{displayAmount(detail.data.totalCollected, detail.data.currency)}</dd>
                <dt className="text-gray-500">Müvekkil net</dt><dd>{displayAmount(detail.data.clientNetAmount, detail.data.currency)}</dd>
                <dt className="text-gray-500">Yayım tarihi</dt><dd>{displayDate(detail.data.publishedAt)}</dd>
              </dl>
              <div>
                <h3 className="font-medium">Kalemler</h3>
                {detail.data.lines.length === 0 ? (
                  <p className="mt-1 text-gray-500">Kalem bulunmuyor.</p>
                ) : (
                  <ul className="mt-1 divide-y">
                    {detail.data.lines.map((line, index) => (
                      <li key={`${line.type}-${index}`} className="flex justify-between py-1">
                        <span>{line.type}</span>
                        <span>{displayAmount(line.amount, detail.data.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileClock className="h-4 w-4" aria-hidden /> Sürüm geçmişi
          </h2>
          {history.isLoading ? <Spinner data-testid="financial-disclosure-history-loading" /> : null}
          {history.isError ? (
            <p role="alert" className="mt-2 text-sm text-red-700">Sürüm geçmişi yüklenemedi.</p>
          ) : null}
          {history.isSuccess ? (
            history.data.items.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">Sürüm geçmişi bulunmuyor.</p>
            ) : (
              <ol className="mt-3 space-y-2">
                {history.data.items.map((item) => {
                  const isCurrentEffective = history.data.currentEffectiveVersionId === item.versionId;
                  return (
                    <li key={item.versionId} className="rounded-md border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">Sürüm {item.version}</span>
                        <div className="flex flex-wrap gap-1">
                          <DisclosureStatusBadge status={item.status} />
                          <CurrentEffectiveMark active={isCurrentEffective} />
                        </div>
                      </div>
                      <p className="mt-1 text-gray-500">{displayDate(item.updatedAt)}</p>
                    </li>
                  );
                })}
              </ol>
            )
          ) : null}
        </Card>
      </div>
    </div>
  );
}
