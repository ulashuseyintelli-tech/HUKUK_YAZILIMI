'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Spinner } from '@hukuk/ui';
import { ClipboardList } from 'lucide-react';
import {
  clientFinancialDisclosureApi,
  type OfficeDisclosurePreparationSource,
} from '@/lib/api/client-financial-disclosure';
import { DisclosureStatusBadge } from './DisclosureStatusBadge';

const displayDate = (value: string) => new Date(value).toLocaleString('tr-TR');
const displayAmount = (value: string, currency: string) => `${value} ${currency}`;

function ExistingDisclosureState({ source }: { source: OfficeDisclosurePreparationSource }) {
  if (!source.existingDisclosure) {
    return <span className="text-sm text-gray-500">Mevcut bildirim kökü yok.</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">Mevcut bildirim kökü</span>
      {source.existingDisclosure.status ? (
        <DisclosureStatusBadge status={source.existingDisclosure.status} />
      ) : (
        <span className="text-xs text-gray-500">Güncel sürüm yok</span>
      )}
    </div>
  );
}

/** X1-B02: PRE01'in yalnız POSTED kaynaklardan kurduğu salt-okunur seçim yüzeyi. */
export function DisclosurePreparationPanel({ clientId }: { clientId: string }) {
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const sources = useQuery({
    queryKey: ['client-financial-disclosures', 'office-preparation-sources', clientId],
    // Ham API hata gövdesini query state'ine dahi taşımadan generic fail-closed sonuç üretir.
    queryFn: async () => {
      try {
        return await clientFinancialDisclosureApi.listPreparationSources(clientId);
      } catch {
        return null;
      }
    },
    retry: false,
  });

  if (sources.isLoading) return <Spinner data-testid="disclosure-preparation-loading" />;
  if (sources.isError || !sources.isSuccess || !sources.data) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Bildirim hazırlama kaynakları yüklenemedi.
      </div>
    );
  }

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ClipboardList className="h-4 w-4" aria-hidden /> Bildirim hazırlama kaynakları
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Yalnız kesinleştirilmiş (POSTED) ve bu müvekkile bağlı kaynaklar gösterilir.
      </p>

      {sources.data.items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Hazırlamaya uygun POSTED kaynak bulunmuyor.</p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {sources.data.items.map((source) => {
            const selected = selectedReference === source.preparationReference;
            return (
              <li key={source.preparationReference}>
                <button
                  type="button"
                  className={`w-full rounded-lg border p-3 text-left ${
                    selected ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  aria-pressed={selected}
                  aria-label={`${source.officeFileNumber} numaralı POSTED kaynağı seç`}
                  onClick={() => setSelectedReference(source.preparationReference)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">Büro dosya no: {source.officeFileNumber}</span>
                    <span className="text-sm">{displayAmount(source.totalAmount, source.currency)}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Kesinleştirme: {displayDate(source.postedAt)}</p>
                  <div className="mt-2"><ExistingDisclosureState source={source} /></div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedReference ? (
        <p role="status" className="mt-3 text-sm font-medium text-blue-800">
          Hazırlama kaynağı seçildi.
        </p>
      ) : null}
    </Card>
  );
}
