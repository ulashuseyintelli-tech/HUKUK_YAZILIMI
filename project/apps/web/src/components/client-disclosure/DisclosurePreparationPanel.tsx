'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * X1-B02 seçim yüzeyi + PR-1.2 komut aksiyonu.
 *
 * PR-1.2 ÖNCESİ: panel salt-okunurdu ve hiçbir ekran FD kökü oluşturamıyordu →
 * bir müvekkilin İLK bildirimi ofis yüzeyinden kurulamıyordu.
 * Artık seçili kaynak için gerçek create komutu çalışır. Ham disposition ID
 * gönderilmez/gösterilmez; yalnız tek yönlü `preparationReference` taşınır.
 */
export function DisclosurePreparationPanel({ clientId }: { clientId: string }) {
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [createError, setCreateError] = useState<string | null>(null);
  // CIFT-SUBMIT KILIDI: `isPending` ayni tick icinde henuz guncellenmedigi icin
  // hizli ard arda tiklamalar birden fazla mutation baslatabiliyordu. Senkron ref
  // kilidi, React re-render'ini beklemeden ikinci cagriyi engeller.
  const inFlight = useRef(false);

  // Endpoint guarded confirmation ENVELOPE DONDURMEZ (controller'da authorize() yok) →
  // gereksiz guarded-action sarmalayici EKLENMEZ; gercek sozlesmeye uyulur.
  const create = useMutation({
    mutationFn: (preparationReference: string) =>
      clientFinancialDisclosureApi.createFromPreparationSource(clientId, preparationReference),
    onMutate: () => setCreateError(null),
    onSettled: () => {
      inFlight.current = false;
    },
    onSuccess: async () => {
      // Basari YALNIZ dogrulanmis yanittan sonra islenir; iki yuzey de FRESH yenilenir.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['client-financial-disclosures', 'office-list', clientId] }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-preparation-sources', clientId],
        }),
      ]);
    },
    onError: () => {
      // Secim KORUNUR, panel kapanmaz; kullanici tekrar deneyebilir.
      setCreateError('Finansal bildirim hazırlanamadı. Yetkinizi kontrol edip yeniden deneyin.');
    },
  });
  // PR-1.1 — `catch { return null }` KALDIRILDI.
  //
  // Eski hâlde hata yakalanıp `null` dönüyordu; react-query bunu BAŞARILI bir sonuç
  // sayıyor, isError hiç true olmuyordu. Sonuç: "yüklenemedi" ile "kaynak yok" ayırt
  // edilemiyordu ve kullanıcının yeniden deneme yolu yoktu.
  // Artık hata YUKARI VERİLİR (fail-closed davranış korunur: hata hâlinde liste
  // gösterilmez), ayrımlar korunur ve kullanıcı yeniden deneyebilir.
  // Ham API hata gövdesi kullanıcıya GÖSTERİLMEZ — generic mesaj kullanılır.
  const sources = useQuery({
    queryKey: ['client-financial-disclosures', 'office-preparation-sources', clientId],
    queryFn: () => clientFinancialDisclosureApi.listPreparationSources(clientId),
    retry: false,
  });

  if (sources.isLoading) return <Spinner data-testid="disclosure-preparation-loading" />;
  if (sources.isError || !sources.isSuccess || !sources.data) {
    return (
      <div
        role="alert"
        data-testid="disclosure-preparation-error"
        className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      >
        <p>Bildirim hazırlama kaynakları yüklenemedi.</p>
        <button
          type="button"
          onClick={() => void sources.refetch()}
          disabled={sources.isFetching}
          className="mt-2 rounded-md border border-red-300 bg-white px-3 py-1 text-sm font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
        >
          {sources.isFetching ? 'Yeniden deneniyor…' : 'Yeniden dene'}
        </button>
      </div>
    );
  }

  const canCreate = sources.data.items.some((item) => item.canCreateFinancialDisclosure);

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

      {/* PR-1.2 — komut aksiyonu. Capability SUNUCUDAN gelir; UI rol tahmini yapmaz. */}
      {sources.data.items.length > 0 ? (
        <div className="mt-3 space-y-2">
          <button
            type="button"
            data-testid="disclosure-create-button"
            disabled={!selectedReference || !canCreate || create.isPending}
            onClick={() => {
              if (!selectedReference || !canCreate || create.isPending) return;
              if (inFlight.current) return; // senkron kilit: ayni tick'te ikinci mutation YOK
              inFlight.current = true;
              create.mutate(selectedReference);
            }}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {create.isPending ? 'Hazırlanıyor…' : 'Finansal Bildirim Hazırla'}
          </button>

          {!canCreate ? (
            <p className="text-xs text-gray-500">
              Finansal bildirim hazırlama yetkiniz yok (avukat veya yetkilendirilmiş muhasebe
              personeli gerekir).
            </p>
          ) : null}

          {createError ? (
            <p role="alert" data-testid="disclosure-create-error" className="text-sm text-red-700">
              {createError}
            </p>
          ) : null}

          {create.isSuccess && !createError ? (
            <p role="status" data-testid="disclosure-create-success" className="text-sm text-green-700">
              {create.data.replayed
                ? 'Bu kaynak için bildirim zaten mevcuttu; güncel kayıt gösteriliyor.'
                : `Finansal bildirim hazırlandı (sürüm v${create.data.version}, ${create.data.status}).`}
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
