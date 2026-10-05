'use client';

/**
 * PAYOUT-APPROVAL-2 PR-2b — Onay bekleyen/onaylanmış müvekkile ödeme talepleri (CLIENT_PAYOUT_POST).
 *
 * Approval Inbox genel amaçlıdır (bkz. office-approvals sayfası) — actionCode-özel "sonraki aksiyon"
 * mekanizması YOK; onaylandıktan sonra hiçbir "Kesinleştir" butonu göstermez (OfficeApprovalDecisionActions
 * yalnız PENDING_APPROVAL'da render olur). Bu component o boşluğu TALEP SAHİBİ tarafında kapatır:
 * officeApprovalApi.getMine() ile kendi CLIENT_PAYOUT_POST taleplerini (tüm dosyalar) çeker, bu
 * case/caseClient'a ait olanları savedIntent üzerinden filtreler, PENDING_APPROVAL olanlar için DBIND §5
 * self-approval "Onayla" aksiyonu ve talep sahibinin kendi bekleyen talebi için "Geri Çek" (cancel) aksiyonu, APPROVED olanlar için
 * "Kesinleştir" (finalize) aksiyonu sunar. "Değiştirerek onay" ödeme talebinde YOKTUR (sunucu 400 döner).
 * Kesinleşmiş talep (APPROVED + yürütme işareti SUCCEEDED) listelenmez (bkz. isFinalized); reddedilen / geri
 * çekilen / revizyon istenen / değiştirerek onaylanan talepler düğmesiz listelenmeye devam eder.
 *
 * Yetki UI'da TAKLİT EDİLMEZ: backend zaten defense-in-depth uyguluyor (payload-drift guard +
 * PayoutApprovalPolicy re-check) — bu component yalnız görünürlük/tetikleme sağlar, otorite DEĞİLDİR.
 * Eligible olmayan bir requester "Kesinleştir"e tıklarsa backend'in 403 mesajı olduğu gibi gösterilir.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { AlertCircle, ClipboardCheck } from 'lucide-react';
import { officeApprovalApi, type OfficeApprovalDetail, type OfficeApprovalSummary } from '@/lib/api/office-approval';
import { clientAccountingApi, formatMoneyString } from '@/lib/api/client-accounting';
import { STATUS_LABELS } from '@/components/office-approval/status-labels';
import { isPayoutIntent, type PayoutIntent } from './payout-intent';

const CLIENT_PAYOUT_POST = 'CLIENT_PAYOUT_POST';

/**
 * Kesinleşmiş talep: karar APPROVED + yürütme işareti SUCCEEDED. Kesinleştirme karar durumunu değiştirmez
 * (APPROVED kalır); ödeme taleplerinde SUCCEEDED işaretini yalnız finalize yazar ve yalnız ödeme kaydı
 * (ClientPayout) oluştuktan sonra (bkz. client-payout.service.ts finalize()). Böyle bir talepte bekleyen iş
 * yoktur → kartta listelenmez; ödeme "Müvekkile Ödemeler" listesinde görünür.
 * İşaret yazılamamışsa (SUCCEEDED değilse) talep "Kesinleştir" düğmesiyle kalır: tıklama backend'de aynı
 * anahtarla tekrar yanıtı (idempotentReplay) döndürür ve işareti tamamlar — yeni ödeme oluşmaz.
 */
function isFinalized(request: Pick<OfficeApprovalSummary, 'status' | 'executionStatus'>): boolean {
  return request.status === 'APPROVED' && request.executionStatus === 'SUCCEEDED';
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
  const [payoutActionError, setPayoutActionError] = useState<string | null>(null);

  const mineQ = useQuery({
    queryKey: ['client-payout-approval-requests'],
    queryFn: () => officeApprovalApi.getMine(),
  });

  const payoutRequestIds = useMemo(
    () =>
      (mineQ.data ?? [])
        .filter((r) => r.actionCode === CLIENT_PAYOUT_POST && !isFinalized(r))
        .map((r) => r.id),
    [mineQ.data],
  );

  // Liste özeti (getMine) savedIntent İÇERMEZ (bkz. office-approval.dto.ts toSummaryDto) — case/caseClient
  // scope doğrulaması + finalize payload'ının yeniden kurulması için detay çekilmesi ZORUNLU.
  const detailsQ = useQuery({
    queryKey: ['client-payout-approval-request-details', payoutRequestIds.join(',')],
    queryFn: () => Promise.all(payoutRequestIds.map((id) => officeApprovalApi.getDetail(id))),
    enabled: payoutRequestIds.length > 0,
    // Talep listesi değişince (talep kesinleşti / yeni talep) sorgu anahtarı da değişir. Yeni detaylar gelene
    // kadar önceki detaylar ekranda kalır; aksi halde kalan satırlarla birlikte kart bir an kaybolup geri gelir.
    // Listeden düşen talep aşağıda kimliğiyle elenir.
    placeholderData: keepPreviousData,
  });

  const scoped = useMemo(() => {
    if (!detailsQ.data) return [];
    const listedIds = new Set(payoutRequestIds);
    return detailsQ.data
      .map((detail) => ({ detail, intent: isPayoutIntent(detail.savedIntent) ? detail.savedIntent : null }))
      .filter(
        (row): row is { detail: OfficeApprovalDetail; intent: PayoutIntent } =>
          // Yalnız güncel özet listesinde duran talepler (önceki detaylar geçiş sırasında ekranda tutulur).
          listedIds.has(row.detail.id) &&
          row.intent !== null &&
          row.intent.caseId === caseId &&
          row.intent.caseClientId === caseClientId &&
          // Özet listesi bayatken detay güncel dönebilir: kesinleşmiş talep burada da elenir.
          !isFinalized(row.detail),
      );
  }, [detailsQ.data, payoutRequestIds, caseId, caseClientId]);

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
      setPayoutActionError(null);
      queryClient.invalidateQueries({ queryKey: ['client-accounting-outstanding'] });
      queryClient.invalidateQueries({ queryKey: ['client-accounting-payouts'] });
      queryClient.invalidateQueries({ queryKey: ['client-statement'] });
      // Muhasebe Defteri (FinancialStatementPanel) ödemeyi günlükten okur; kesinleştirme yeni günlük satırı
      // yazdığı için panel de yenilenir — yoksa "Müvekkile Borç (Net)" güncel, panel kapanışı eski kalır.
      queryClient.invalidateQueries({ queryKey: ['financial-statement'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-request-details'] });
    },
    onError: (e: unknown) => {
      setPayoutActionError(friendlyFinalizeError((e as Error)?.message));
    },
  });

  const approveMutation = useMutation({
    mutationFn: (approvalRequestId: string) => officeApprovalApi.approve(approvalRequestId),
    onSuccess: () => {
      setPayoutActionError(null);
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-request-details'] });
    },
    onError: (e: unknown) => {
      setPayoutActionError((e as Error)?.message || 'Onaylama başarısız oldu.');
    },
  });

  // Talep sahibi kendi BEKLEYEN talebini geri çeker (POST /office-approvals/:id/cancel). Kural sunucudadır: yalnız talep
  // sahibi ve yalnız PENDING_APPROVAL; başka durumda / başka kullanıcıda sunucunun reddi aynen gösterilir.
  const cancelMutation = useMutation({
    mutationFn: (approvalRequestId: string) => officeApprovalApi.cancel(approvalRequestId),
    onSuccess: () => {
      setPayoutActionError(null);
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-requests'] });
      queryClient.invalidateQueries({ queryKey: ['client-payout-approval-request-details'] });
    },
    onError: (e: unknown) => {
      setPayoutActionError((e as Error)?.message || 'Talep geri çekilemedi.');
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

      {payoutActionError && (
        <div className="flex items-start gap-2 text-red-600 text-xs mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {payoutActionError}
        </div>
      )}

      <div className="space-y-2">
        {scoped.map(({ detail, intent }) => {
          const isFinalizingThis = finalizeMutation.isPending && finalizeMutation.variables?.approvalRequestId === detail.id;
          const isApprovingThis = approveMutation.isPending && approveMutation.variables === detail.id;
          const isCancellingThis = cancelMutation.isPending && cancelMutation.variables === detail.id;
          const anyPending = approveMutation.isPending || finalizeMutation.isPending || cancelMutation.isPending;
          return (
            <div key={detail.id} className="flex items-center justify-between border rounded-lg p-3 text-sm">
              <div>
                <div className="font-medium">{formatMoneyString(intent.amount, intent.currency)}</div>
                {intent.note && <div className="text-xs text-gray-500 mt-0.5">{intent.note}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{STATUS_LABELS[detail.status] ?? detail.status}</Badge>
                {detail.status === 'PENDING_APPROVAL' && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPayoutActionError(null);
                      cancelMutation.mutate(detail.id);
                    }}
                    disabled={anyPending}
                  >
                    {isCancellingThis ? <Spinner className="w-4 h-4" /> : 'Geri Çek'}
                  </Button>
                )}
                {detail.status === 'PENDING_APPROVAL' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPayoutActionError(null);
                      approveMutation.mutate(detail.id);
                    }}
                    disabled={anyPending}
                  >
                    {isApprovingThis ? <Spinner className="w-4 h-4" /> : 'Onayla'}
                  </Button>
                )}
                {detail.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPayoutActionError(null);
                      finalizeMutation.mutate({ approvalRequestId: detail.id, intent });
                    }}
                    disabled={anyPending}
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
