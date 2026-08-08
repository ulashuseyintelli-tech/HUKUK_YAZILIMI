'use client';

/**
 * CAD C2-B02 — Aydınlatma teslim kayıtları: hangi SÜRÜMÜN hangi tarihte teslim
 * edildiği AÇIKÇA görünür (ClientDisclosureText sürümü + deliveredAt).
 * Salt-görüntü + mevcut aksiyon (teslim kaydı). Fail-closed gerekçeli gösterilir.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { FileCheck2 } from 'lucide-react';
import {
  clientComplianceApi,
  toComplianceError,
  type ClientDisclosureDelivery,
  type ClientDisclosureText,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR') : '—');

export function DisclosureDeliveriesSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [textId, setTextId] = useState('');
  const [method, setMethod] = useState('ELDEN');

  const texts = useQuery({
    queryKey: ['client-compliance', 'disclosure-texts'],
    queryFn: () => clientComplianceApi.listDisclosureTexts(),
  });
  const deliveries = useQuery({
    queryKey: ['client-compliance', 'deliveries', clientId],
    queryFn: () => clientComplianceApi.listDeliveries(clientId),
  });

  const record = useMutation({
    mutationFn: () =>
      clientComplianceApi.recordDelivery(clientId, {
        disclosureTextId: textId,
        method,
        deliveredAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      setTextId('');
      void qc.invalidateQueries({ queryKey: ['client-compliance', 'deliveries', clientId] });
    },
  });

  const versionOf = (id: string): string => {
    const t = (texts.data ?? []).find((x: ClientDisclosureText) => x.id === id);
    return t ? `v${t.version}` : 'sürüm?';
  };

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <FileCheck2 className="h-4 w-4" aria-hidden /> Aydınlatma Teslim Kayıtları
      </h2>

      {deliveries.isLoading || texts.isLoading ? <Spinner data-testid="deliveries-loading" /> : null}
      {deliveries.isError ? (
        <ComplianceFailClosed title="Teslim kayıtları alınamadı" error={toComplianceError(deliveries.error)} />
      ) : null}
      {texts.isError ? (
        <ComplianceFailClosed title="Aydınlatma metin sürümleri alınamadı" error={toComplianceError(texts.error)} />
      ) : null}
      {!deliveries.isLoading && !deliveries.isError && !deliveries.isSuccess ? (
        <ComplianceFailClosed title="Teslim kayıtları yüklenemedi" error={{ message: 'Kayıt durumu belirlenemedi — fail-closed (sessiz boş ekran yasak).' }} />
      ) : null}

      {deliveries.isSuccess ? (
        deliveries.data.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Bu müvekkile kayıtlı aydınlatma teslimi bulunmuyor.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2">Sürüm</th>
                <th className="py-1 pr-2">Teslim Tarihi</th>
                <th className="py-1 pr-2">Yöntem</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.data.map((d: ClientDisclosureDelivery) => (
                <tr key={d.id} className="border-t">
                  <td className="py-1.5 pr-2">
                    <Badge>{versionOf(d.disclosureTextId)}</Badge>
                  </td>
                  <td className="py-1.5 pr-2">{dt(d.deliveredAt)}</td>
                  <td className="py-1.5 pr-2">{d.method}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-medium">Teslim kaydı ekle</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Aydınlatma sürümü</span>
            <select value={textId} onChange={(e) => setTextId(e.target.value)} className="rounded-md border px-2 py-1.5">
              <option value="">Seçin…</option>
              {(texts.data ?? []).map((t: ClientDisclosureText) => (
                <option key={t.id} value={t.id}>
                  v{t.version}{t.title ? ` — ${t.title}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Yöntem</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="rounded-md border px-2 py-1.5">
              <option value="ELDEN">Elden</option>
              <option value="EMAIL">E-posta</option>
              <option value="KEP">KEP</option>
            </select>
          </label>
          <Button size="sm" disabled={!textId || record.isPending} onClick={() => record.mutate()}>
            Kaydet
          </Button>
        </div>
        {record.isError ? (
          <div className="mt-2">
            <ComplianceFailClosed title="Teslim kaydı reddedildi" error={toComplianceError(record.error)} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
