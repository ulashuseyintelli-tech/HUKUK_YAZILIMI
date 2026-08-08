'use client';

/**
 * CAD C2-B03 — DSAR (Veri Sahibi Başvuruları). Durum makinesi BACKEND'ten projekte
 * edilir (RECEIVED → IN_REVIEW → RESPONDED); UI kendi makinesini KURMAZ — aksiyon
 * butonları yalnız backend durumunun izin verdiği geçişte görünür. Fail-closed
 * retler gerekçesiyle gösterilir. (address-discovery "Bilgi Talepleri" AYRI yüzeydir.)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Inbox } from 'lucide-react';
import {
  clientComplianceDsarApi,
  toComplianceError,
  type ClientDsarRecord,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR') : '—');
const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'ALINDI',
  IN_REVIEW: 'İNCELEMEDE',
  RESPONDED: 'YANITLANDI',
};

export function DsarRequestsSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [type, setType] = useState('INFORMATION');
  const [channel, setChannel] = useState('WRITTEN');
  const [note, setNote] = useState('');

  const requests = useQuery({
    queryKey: ['client-compliance', 'dsar', clientId],
    queryFn: () => clientComplianceDsarApi.listRequests(clientId),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['client-compliance', 'dsar', clientId] });

  const create = useMutation({
    mutationFn: () =>
      clientComplianceDsarApi.createRequest(clientId, {
        type, channel, receivedAt: new Date().toISOString(),
      }),
    onSuccess: invalidate,
  });
  const startReview = useMutation({
    mutationFn: (id: string) => clientComplianceDsarApi.startReview(id),
    onSuccess: invalidate,
  });
  const respond = useMutation({
    mutationFn: (id: string) => clientComplianceDsarApi.respond(id, note),
    onSuccess: () => { setNote(''); invalidate(); },
  });

  const actionError = create.error ?? startReview.error ?? respond.error;

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Inbox className="h-4 w-4" aria-hidden /> Veri Sahibi Başvuruları (DSAR)
      </h2>

      {requests.isLoading ? <Spinner data-testid="dsar-loading" /> : null}
      {requests.isError ? (
        <ComplianceFailClosed title="DSAR kayıtları alınamadı" error={toComplianceError(requests.error)} />
      ) : null}
      {!requests.isLoading && !requests.isError && !requests.isSuccess ? (
        <ComplianceFailClosed title="DSAR kayıtları yüklenemedi" error={{ message: 'Kayıt durumu belirlenemedi — fail-closed (sessiz boş ekran yasak).' }} />
      ) : null}

      {requests.isSuccess ? (
        requests.data.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Bu müvekkil için kayıtlı veri sahibi başvurusu bulunmuyor.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2">Tür</th>
                <th className="py-1 pr-2">Kanal</th>
                <th className="py-1 pr-2">Durum</th>
                <th className="py-1 pr-2">Alındı</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r: ClientDsarRecord) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="py-1.5 pr-2 font-medium">{r.type}</td>
                  <td className="py-1.5 pr-2">{r.channel}</td>
                  <td className="py-1.5 pr-2">
                    <Badge>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                  </td>
                  <td className="py-1.5 pr-2">{dt(r.receivedAt)}</td>
                  <td className="py-1.5 text-right">
                    {r.status === 'RECEIVED' ? (
                      <Button size="sm" variant="outline" disabled={startReview.isPending}
                        onClick={() => startReview.mutate(r.id)}>
                        İncelemeye al
                      </Button>
                    ) : null}
                    {r.status === 'IN_REVIEW' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <input value={note} onChange={(e) => setNote(e.target.value)}
                          placeholder="Yanıt notu" className="rounded-md border px-2 py-1 text-sm" />
                        <Button size="sm" disabled={!note || respond.isPending}
                          onClick={() => respond.mutate(r.id)}>
                          Yanıtla
                        </Button>
                      </span>
                    ) : null}
                    {r.status === 'RESPONDED' ? (
                      <span className="text-xs text-gray-500">Yanıt: {dt(r.respondedAt)}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}

      {actionError ? (
        <div className="mt-2">
          <ComplianceFailClosed title="DSAR işlemi reddedildi" error={toComplianceError(actionError)} />
        </div>
      ) : null}

      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-medium">Yeni başvuru kaydı</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Tür</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border px-2 py-1.5">
              <option value="INFORMATION">Bilgi</option>
              <option value="ACCESS_CONFIRMATION">Erişim teyidi</option>
              <option value="PURPOSE_REVIEW">Amaç incelemesi</option>
              <option value="THIRD_PARTY_DISCLOSURE">3. kişi aktarımı</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Kanal</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-md border px-2 py-1.5">
              <option value="WRITTEN">Yazılı</option>
              <option value="KEP">KEP</option>
              <option value="REGISTERED_EMAIL">Kayıtlı e-posta</option>
              <option value="OTHER_ELECTRONIC">Diğer elektronik</option>
            </select>
          </label>
          <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>Kaydet</Button>
        </div>
      </div>
    </Card>
  );
}
