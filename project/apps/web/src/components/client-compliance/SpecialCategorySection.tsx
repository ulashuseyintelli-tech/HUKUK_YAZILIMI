'use client';

/**
 * CAD C2-B04 — Özel nitelikli (KVKK md.6) veri.
 * Kural: içerik VARSAYILAN GİZLİ — liste yalnız kategori + üst-veri gösterir (backend
 * de içerik döndürmez). "İçeriği aç" ayrı elevated + anahtar-gerektiren okumadır;
 * CLIENT_SPECIAL_CATEGORY_DATA_KEY yoksa backend K7.3 ile fail-closed reddeder ve o
 * gerekçe operatöre AÇIKÇA gösterilir (sessiz boş içerik YASAK). İçerik ekranda tutulmaz;
 * yalnız açılan tek kayıt için geçici gösterilir.
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Lock, Eye } from 'lucide-react';
import {
  clientComplianceSpecialCategoryApi,
  toComplianceError,
  type ClientSpecialCategoryContent,
  type ClientSpecialCategoryMeta,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR') : '—');

export function SpecialCategorySection({ clientId }: { clientId: string }) {
  const [opened, setOpened] = useState<ClientSpecialCategoryContent | null>(null);

  const records = useQuery({
    queryKey: ['client-compliance', 'special-category', clientId],
    queryFn: () => clientComplianceSpecialCategoryApi.listRecords(clientId),
  });

  const openRecord = useMutation({
    mutationFn: (recordId: string) => clientComplianceSpecialCategoryApi.readRecord(recordId),
    onSuccess: (r) => setOpened(r),
  });

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Lock className="h-4 w-4" aria-hidden /> Özel Nitelikli Veri (KVKK md.6)
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        İçerik varsayılan gizlidir; açma işlemi yetkiye ve audit'e bağlıdır.
      </p>

      {records.isLoading ? <Spinner data-testid="special-loading" /> : null}
      {records.isError ? (
        <ComplianceFailClosed title="Özel nitelikli kayıtlar alınamadı" error={toComplianceError(records.error)} />
      ) : null}
      {!records.isLoading && !records.isError && !records.isSuccess ? (
        <ComplianceFailClosed
          title="Özel nitelikli kayıtlar yüklenemedi"
          error={{ message: 'Kayıt durumu belirlenemedi — fail-closed (sessiz boş ekran yasak).' }}
        />
      ) : null}

      {records.isSuccess ? (
        records.data.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Bu müvekkil için özel nitelikli veri kaydı bulunmuyor.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2">Kategori</th>
                <th className="py-1 pr-2">Ekleyen</th>
                <th className="py-1 pr-2">Tarih</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {records.data.map((r: ClientSpecialCategoryMeta) => (
                <tr key={r.id} className="border-t">
                  <td className="py-1.5 pr-2"><Badge>{r.category}</Badge></td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{r.createdByUserId ?? '—'}</td>
                  <td className="py-1.5 pr-2">{dt(r.createdAt)}</td>
                  <td className="py-1.5 text-right">
                    <Button size="sm" variant="outline" disabled={openRecord.isPending}
                      onClick={() => { setOpened(null); openRecord.mutate(r.id); }}>
                      <Eye className="mr-1 h-3.5 w-3.5" aria-hidden /> İçeriği aç
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {openRecord.isError ? (
        <div className="mt-2">
          <ComplianceFailClosed title="İçerik açılamadı" error={toComplianceError(openRecord.error)} />
        </div>
      ) : null}

      {opened ? (
        <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3" role="status">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Eye className="h-4 w-4" aria-hidden /> {opened.category} — açık içerik
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{opened.content}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setOpened(null)}>Gizle</Button>
        </div>
      ) : null}
    </Card>
  );
}
