'use client';

/**
 * CAD C2-B03 — Legal Hold + silme değerlendirmesi.
 * Kurallar: aktif hold varken kısıtlanan aksiyonlar GÖRÜNÜR şekilde kısıtlı
 * (disabled + açıklama) — tıklanıp sunucudan reddedilen "sahte aktif" buton YASAK.
 * Silme değerlendirmesi HİÇBİR ŞEY SİLMEZ; 8-koşullu gate'in karşılanmayan
 * gerekçeleri kullanıcıya AÇIK listelenir (backend unmetConditions).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Gavel, ShieldAlert } from 'lucide-react';
import {
  clientComplianceLegalHoldApi,
  toComplianceError,
  type ClientLegalHoldRecord,
  type DeletionEvaluationResult,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'AKTİF',
  RELEASE_REQUESTED: 'KALDIRMA TALEP EDİLDİ',
  RELEASED: 'KALDIRILDI',
};

export function LegalHoldSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [releaseReason, setReleaseReason] = useState('');
  const [evaluation, setEvaluation] = useState<DeletionEvaluationResult | null>(null);

  const holds = useQuery({
    queryKey: ['client-compliance', 'legal-holds', clientId],
    queryFn: () => clientComplianceLegalHoldApi.listHolds(clientId),
  });
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['client-compliance', 'legal-holds', clientId] });

  const place = useMutation({
    mutationFn: () => clientComplianceLegalHoldApi.placeHold(clientId, { scopeType: 'CLIENT', reason }),
    onSuccess: () => { setReason(''); invalidate(); },
  });
  const requestRelease = useMutation({
    mutationFn: (holdId: string) => clientComplianceLegalHoldApi.requestRelease(holdId, releaseReason),
    onSuccess: () => { setReleaseReason(''); invalidate(); },
  });
  const approveRelease = useMutation({
    mutationFn: (holdId: string) => clientComplianceLegalHoldApi.approveRelease(holdId),
    onSuccess: invalidate,
  });
  const evaluate = useMutation({
    mutationFn: () => clientComplianceLegalHoldApi.evaluateDeletion(clientId),
    onSuccess: (r) => setEvaluation(r),
  });

  const hasActiveHold = (holds.data ?? []).some((h) => h.status === 'ACTIVE' || h.status === 'RELEASE_REQUESTED');
  const actionError = place.error ?? requestRelease.error ?? approveRelease.error ?? evaluate.error;

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <Gavel className="h-4 w-4" aria-hidden /> Legal Hold (Hukuki Saklama)
      </h2>

      {holds.isLoading ? <Spinner data-testid="holds-loading" /> : null}
      {holds.isError ? (
        <ComplianceFailClosed title="Legal hold kayıtları alınamadı" error={toComplianceError(holds.error)} />
      ) : null}
      {!holds.isLoading && !holds.isError && !holds.isSuccess ? (
        <ComplianceFailClosed title="Legal hold kayıtları yüklenemedi" error={{ message: 'Kayıt durumu belirlenemedi — fail-closed (sessiz boş ekran yasak).' }} />
      ) : null}

      {holds.isSuccess ? (
        holds.data.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Bu müvekkil için legal hold kaydı bulunmuyor.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {holds.data.map((h: ClientLegalHoldRecord) => (
              <li key={h.id} className="rounded-md border p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={h.status === 'RELEASED' ? 'secondary' : 'default'}>
                    {STATUS_LABELS[h.status] ?? h.status}
                  </Badge>
                  <span className="font-medium">{h.scopeType}</span>
                  <span className="text-gray-600">{h.reason}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {h.status === 'ACTIVE' ? (
                    <>
                      <input
                        value={releaseReason}
                        onChange={(e) => setReleaseReason(e.target.value)}
                        placeholder="Kaldırma gerekçesi"
                        className="rounded-md border px-2 py-1 text-sm"
                      />
                      <Button size="sm" variant="outline"
                        disabled={!releaseReason || requestRelease.isPending}
                        onClick={() => requestRelease.mutate(h.id)}>
                        Kaldırma talep et
                      </Button>
                    </>
                  ) : null}
                  {h.status === 'RELEASE_REQUESTED' ? (
                    <Button size="sm" variant="outline" disabled={approveRelease.isPending}
                      onClick={() => approveRelease.mutate(h.id)}>
                      Kaldırmayı onayla (2. adım)
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {actionError ? (
        <div className="mt-2">
          <ComplianceFailClosed title="Legal hold işlemi reddedildi" error={toComplianceError(actionError)} />
        </div>
      ) : null}

      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-medium">Yeni hold</h3>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-gray-500">Gerekçe</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-md border px-2 py-1.5" />
          </label>
          <Button size="sm" disabled={!reason || place.isPending} onClick={() => place.mutate()}>
            Hold uygula
          </Button>
        </div>
      </div>

      <div className="mt-4 border-t pt-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ShieldAlert className="h-4 w-4" aria-hidden /> Silme değerlendirmesi
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Hiçbir veri silinmez; yalnız 8 koşullu kapı değerlendirilir ve sonuç audit'e yazılır.
        </p>
        {hasActiveHold ? (
          <p className="mt-2 rounded-md bg-gray-50 p-2 text-sm text-gray-600" data-testid="deletion-restricted">
            Aktif legal hold nedeniyle silme yolu KISITLI — değerlendirme koşulları aşağıda yine görülebilir.
          </p>
        ) : null}
        <Button size="sm" variant="outline" className="mt-2" disabled={evaluate.isPending}
          onClick={() => evaluate.mutate()}>
          Değerlendir
        </Button>

        {evaluation ? (
          <div className="mt-2 rounded-md border p-2 text-sm" role="status">
            <div className="font-medium">
              Sonuç: {evaluation.allowed ? 'SİLME KOŞULLARI SAĞLANIYOR' : 'SİLME KOŞULLARI SAĞLANMIYOR (fail-closed)'}
            </div>
            {(evaluation.unmetConditions ?? []).length > 0 ? (
              <ul className="mt-1 list-inside list-disc font-mono text-xs text-amber-800">
                {(evaluation.unmetConditions ?? []).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
