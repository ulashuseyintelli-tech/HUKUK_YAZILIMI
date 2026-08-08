'use client';

/**
 * CAD C2-B02 — KVKK rıza kayıtları: salt-görüntü liste + MEVCUT aksiyonlar
 * (grant/revoke — backend D02 eşiği karar verir; UI YENİ yetki modeli KURMAZ).
 * Fail-closed ret gerekçesiyle gösterilir (ComplianceFailClosed).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import {
  clientComplianceApi,
  toComplianceError,
  type ClientConsentRecord,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const dt = (v?: string | null) => (v ? new Date(v).toLocaleString('tr-TR') : '—');

export function ConsentRecordsSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [activity, setActivity] = useState('');
  const [note, setNote] = useState('');

  const consents = useQuery({
    queryKey: ['client-compliance', 'consents', clientId],
    queryFn: () => clientComplianceApi.listConsents(clientId),
  });

  const grant = useMutation({
    mutationFn: () => clientComplianceApi.grantConsent(clientId, { activity, note: note || undefined }),
    onSuccess: () => {
      setActivity(''); setNote('');
      void qc.invalidateQueries({ queryKey: ['client-compliance', 'consents', clientId] });
    },
  });
  const revoke = useMutation({
    mutationFn: (a: string) => clientComplianceApi.revokeConsent(clientId, { activity: a }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['client-compliance', 'consents', clientId] }),
  });

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <ShieldCheck className="h-4 w-4" aria-hidden /> KVKK Rıza Kayıtları
      </h2>

      {consents.isLoading ? <Spinner data-testid="consents-loading" /> : null}
      {consents.isError ? (
        <ComplianceFailClosed title="Rıza kayıtları alınamadı" error={toComplianceError(consents.error)} />
      ) : null}

      {consents.isSuccess ? (
        consents.data.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Bu müvekkil için kayıtlı rıza bulunmuyor.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1 pr-2">Faaliyet</th>
                <th className="py-1 pr-2">Durum</th>
                <th className="py-1 pr-2">Kayıt</th>
                <th className="py-1 pr-2">Geri Çekme</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {consents.data.map((c: ClientConsentRecord) => {
                const revoked = !!c.revokedAt || c.status === 'REVOKED';
                return (
                  <tr key={c.id} className="border-t">
                    <td className="py-1.5 pr-2 font-medium">{c.activity}</td>
                    <td className="py-1.5 pr-2">
                      <Badge variant={revoked ? 'secondary' : 'default'}>
                        {revoked ? 'GERİ ÇEKİLDİ' : 'AKTİF'}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-2">{dt(c.grantedAt ?? c.createdAt)}</td>
                    <td className="py-1.5 pr-2">{dt(c.revokedAt)}</td>
                    <td className="py-1.5 text-right">
                      {!revoked ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(c.activity)}
                        >
                          <ShieldOff className="mr-1 h-3.5 w-3.5" aria-hidden /> Geri çek
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : null}

      {revoke.isError ? (
        <div className="mt-2">
          <ComplianceFailClosed title="Geri çekme reddedildi" error={toComplianceError(revoke.error)} />
        </div>
      ) : null}

      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-medium">Yeni rıza kaydı</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Faaliyet</span>
            <input
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="rounded-md border px-2 py-1.5"
              placeholder="ör. GREETING"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Not (opsiyonel)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="rounded-md border px-2 py-1.5" />
          </label>
          <Button size="sm" disabled={!activity || grant.isPending} onClick={() => grant.mutate()}>
            Kaydet
          </Button>
        </div>
        {grant.isError ? (
          <div className="mt-2">
            <ComplianceFailClosed title="Rıza kaydı reddedildi" error={toComplianceError(grant.error)} />
          </div>
        ) : null}
      </div>
    </Card>
  );
}
