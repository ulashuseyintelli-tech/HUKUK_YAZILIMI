'use client';

/**
 * PAYOUT-APPROVAL-2 PR-2b — Onay bekleyen/onaylanmış müvekkile ödeme talepleri (CLIENT_PAYOUT_POST).
 *
 * Approval Inbox genel amaçlıdır (bkz. office-approvals sayfası) — actionCode-özel "sonraki aksiyon"
 * mekanizması YOK; onaylandıktan sonra hiçbir "Kesinleştir" butonu göstermez (OfficeApprovalDecisionActions
 * yalnız PENDING_APPROVAL'da render olur). Bu component o boşluğu TALEP SAHİBİ tarafında kapatır:
 * officeApprovalApi.getMine() ile kendi CLIENT_PAYOUT_POST taleplerini (tüm dosyalar) çeker, bu
 * case/caseClient'a ait olanları savedIntent üzerinden filtreler, APPROVED olanlar için "Kesinleştir"
 * (finalize) aksiyonu sunar.
 *
 * Yetki UI'da TAKLİT EDİLMEZ: backend zaten defense-in-depth uyguluyor (payload-drift guard +
 * PayoutApprovalPolicy re-check) — bu component yalnız görünürlük/tetikleme sağlar, otorite DEĞİLDİR.
 * Eligible olmayan bir requester "Kesinleştir"e tıklarsa backend'in 403 mesajı olduğu gibi gösterilir.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { AlertCircle, ClipboardCheck } from 'lucide-react';
import { officeApprovalApi, type OfficeApprovalDetail } from '@/lib/api/office-approval';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { STATUS_LABELS } from '@/components/office-approval/status-labels';

const CLIENT_PAYOUT_POST = 'CLIENT_PAYOUT_POST';

interface PayoutIntent {
  caseId: string;
  caseClientId: string;
  amount: string;
  currency: string;
  note: string | null;
  idempotencyKey: string;
}

function isPayoutIntent(value: unknown): value is PayoutIntent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.caseId === 'string' &&
    typeof v.caseClientId === 'string' &&
    typeof v.amount === 'string' &&
    typeof v.currency === 'string' &&
    typeof v.idempotencyKey === 'string'
  );
}

/** Backend hata mesajını kullanıcı diline çevirir (mesaj backend otoritesini değiştirmez). */
function friendlyFinalizeError(message: string): string {
  const m = message || '';
  if (/aşamaz|outstanding/i.test(m)) return `Tutar, müvekkile borcunu (net) aşıyor. ${m}`;
  if (/eşleşmiyor|drift/i.test(m)) {
    return 'Onaylanan talep ile kesinleştirme tutarı eşleşmiyor (drift). Talebi iptal edip yeniden oluşturun.';
  }
  return m || 'Kesinleştirme başarısız oldu.';
}

interface PendingPayoutRequestsProps {
  caseId: string;
  caseClientId: string;
}

export function PendingPayoutRequests({ caseId, caseClientId }: PendingPayoutRequestsProps) {
  const queryClient = useQueryClient();
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const mineQ = useQuery({
    queryKey: ['client-payout-approval-requests'],
    queryFn: () => officeApprovalApi.getMine(),
  });

  const payoutRequestIds = useMemo(
    () => (mineQ.data ?? []).filter((r) => r.actionCode === CLIENT_PAYOUT_POST).map((r) => r.id),
    [mineQ.data],
  );

  // Liste özeti (getMine) savedIntent İÇERMEZ (bkz. office-approval.dto.ts toSummaryDto) — case/caseClient
  // scope doğrulaması + finalize payload'ının yeniden kurulması için detay çekilmesi ZORUNLU.
  const detailsQ = useQuery({
    queryKey: ['client-payout-approval-request-details', payoutRequestIds.join(',')],
    queryFn: () => Promise.all(payoutRequestIds.map((id) => officeApprovalApi.getDetail(id))),
    enabled: payoutRequestIds.length > 0,
  });

  const scoped = useMemo(() => {
    if (!detailsQ.data) return [];
    return detailsQ.data
      .map((detail) => ({ detail, intent: isPayoutIntent(detail.savedIntent) ? detail.savedIntent : null }))
      .filter(
        (row): row is { detail: OfficeApprovalDetail; intent: PayoutIntent } =>
          row.intent !== null && row.intent.caseId === caseId && row.intent.caseClientId === caseClientId,
      );
  }, [detailsQ.data, caseId, caseClientId]);

  const finalizeMutation = useMutation({
    mutationFn: ({ approvalRequestId, intent }: { approvalRequestId: string; intent: PayoutIntent }) =>
      clientAccountingApi.finalizePayout(approvalRequestId, {
        caseId: intent.caseId,
        caseClientId: intent.caseClientId,
        amount: intent.amount,
        currency: intent.currency,
        note: intent.note ?? undefined,
        idempotencyKey: intent.idempotencyKey,
      }),
    onSuccess: () => {
      setFinalizeError(null);
      queryClient.invalidateQueries({ queryKey: ['client-accounting-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['client-accounting-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['client-statement'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-request-details'] });
    },
    onError: (e: unknown) => {
      setFinalizeError(friendlyFinalizeError((e as Error)?.message));
    },
  });

  // Sessiz görünürlük widget'ı: ana muhasebe sayfasını bloklamaz/kırmaz — yükleme/hata durumunda gizlenir.
  if (mineQ.isLoading || (payoutRequestIds.length > 0 && detailsQ.isLoading)) return null;
  if (mineQ.isError) return null;
  if (scoped.length === 0) return null;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ClipboardCheck className="w-5 h-5 text-blue-600" />
        <h2 className="text-base font-bold text-gray-900">Onay Bekleyen Ödeme Talepleri</h2>
        <Badge variant="secondary" className="ml-1">
          {scoped.length}
        </Badge>
      </div>

      {finalizeError && (
        <div className="flex items-start gap-2 text-red-600 text-xs mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {finalizeError}
        </div>
      )}

      <div className="space-y-2">
        {scoped.map(({ detail, intent }) => {
          const isFinalizingThis = finalizeMutation.isPending && finalizeMutation.variables?.approvalRequestId === detail.id;
          return (
            <div key={detail.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
              <div>
                <div className="font-medium">{formatMoneyString(intent.amount, intent.currency)}</div>
                {intent.note && <div className="text-xs text-gray-500 mt-0.5">{intent.note}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{STATUS_LABELS[detail.status] ?? detail.status}</Badge>
                {detail.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setFinalizeError(null);
                      finalizeMutation.mutate({ approvalRequestId: detail.id, intent });
                    }}
                    disabled={finalizeMutation.isPending}
                  >
                    {isFinalizingThis ? <Spinner className="w-4 h-4" /> : 'Kesinleştir'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default PendingPayoutRequests;
