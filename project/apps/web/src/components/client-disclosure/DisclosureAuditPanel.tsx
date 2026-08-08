'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@hukuk/ui';
import { History } from 'lucide-react';
import {
  clientFinancialDisclosureApi,
  type OfficeDisclosureActionCapabilities,
  type OfficeDisclosureDetail,
  type OfficeDisclosureTimelineEventType,
} from '@/lib/api/client-financial-disclosure';

const eventLabel: Record<OfficeDisclosureTimelineEventType, string> = {
  VERSION_CREATED: 'Bildirim sürümü oluşturuldu',
  OFFICE_APPROVAL_REQUESTED: 'Ofis onayı istendi',
  OFFICE_APPROVED: 'Ofis onayı tamamlandı',
  CONTENT_APPROVED: 'İçerik ve alıcı onayı tamamlandı',
  SEND_REQUESTED: 'Teslim işlemi başlatıldı',
  PROVIDER_ACCEPTED: 'Teslim sağlayıcısı kabul etti',
  SEND_FAILED: 'Teslim işlemi başarısız oldu',
  PUBLISHED: 'Bildirim yayımlandı',
  REVERSED: 'Bildirim ters kayıtla kapatıldı',
  SUPERSEDED: 'Bildirim yeni sürümle değiştirildi',
  CANCELLED: 'Bildirim iptal edildi',
};

const actorLabel = {
  OFFICE_USER: 'Büro kullanıcısı',
  SYSTEM: 'Sistem',
} as const;

const displayDate = (value: string) => new Date(value).toLocaleString('tr-TR');

/**
 * X1-B05: Timeline yalnız PRE01 curated projection'ını gösterir. Retry görünürlüğü
 * server capability'sinden gelir ve mevcut idempotency-bound backend komutunu tüketir.
 */
export function DisclosureAuditPanel({
  clientId,
  versionId,
  delivery,
  actions,
}: {
  clientId: string;
  versionId: string;
  delivery: OfficeDisclosureDetail['delivery'];
  actions: OfficeDisclosureActionCapabilities;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timeline = useQuery({
    queryKey: ['client-financial-disclosures', 'office-timeline', clientId, versionId],
    queryFn: () => clientFinancialDisclosureApi.getTimeline(clientId, versionId),
  });
  const retry = useMutation({
    mutationFn: () => clientFinancialDisclosureApi.retryPublication(versionId),
    onMutate: () => {
      setNotice(null);
      setError(null);
    },
    onSuccess: async () => {
      setNotice('Kontrollü teslim retry’ı işlendi; güncel durum yenilendi.');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-list', clientId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-detail', clientId, versionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-history', clientId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-timeline', clientId, versionId],
        }),
      ]);
    },
    onError: () => {
      // Provider/backend ayrıntısı ve teknik hata kimlikleri office UI'a taşınmaz.
      setError('Kontrollü teslim retry’ı tamamlanamadı.');
    },
  });

  const deliveryFailed = delivery.state === 'FAILED_RETRY_AVAILABLE';

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <History className="h-4 w-4" aria-hidden /> Audit zaman çizelgesi
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Bildirim yaşam döngüsünün kullanıcı ve sistem olayları.
      </p>

      {deliveryFailed ? (
        <div role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Teslim sağlayıcısı bildirimi kabul etmedi veya kabul kanıtı alınamadı. İçerik ve
          alıcı mühürü korunarak yalnız kontrollü retry başlatılabilir.
        </div>
      ) : null}

      {deliveryFailed && actions.canRetryPublication ? (
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
        >
          {retry.isPending ? <Spinner className="h-4 w-4" /> : 'Kontrollü teslim retry’ını başlat'}
        </Button>
      ) : null}

      {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}

      {timeline.isLoading ? <Spinner data-testid="financial-disclosure-timeline-loading" /> : null}
      {timeline.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          Audit zaman çizelgesi yüklenemedi.
        </p>
      ) : null}
      {timeline.isSuccess ? (
        timeline.data.events.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Audit olayı bulunmuyor.</p>
        ) : (
          <ol className="mt-3 space-y-2">
            {timeline.data.events.map((event, index) => (
              <li key={`${event.type}-${event.occurredAt}-${index}`} className="rounded-md border p-3 text-sm">
                <p className="font-medium">{eventLabel[event.type]}</p>
                <p className="mt-1 text-gray-500">
                  {actorLabel[event.actor]} · {displayDate(event.occurredAt)}
                </p>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </Card>
  );
}
