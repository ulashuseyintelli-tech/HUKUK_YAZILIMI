'use client';

/**
 * TM3 Faz 7 — Müvekkil Muhasebesi (read-only) sayfası.  Route: /clients/:clientId/accounting?caseId=
 *
 * Tasarım kilitleri (Ulaş, 9 şart):
 *  - UI bir HESAP MOTORU DEĞİLDİR. Müvekkile-borç (outstanding) backend'de hesaplanır (PR #554);
 *    burada client-side bakiye hesabı YOKTUR (mock/flag de yok — gerçek endpoint).
 *  - Finansal scope `caseClientId`'dir, `clientId` DEĞİL. clientId yalnız sayfa bağlamı.
 *  - HELD (emanet) / sözleşmesel ücret / büro masrafı kesintisi / masraf-avansı (BalanceLedger cari)
 *    müvekkile-borç DEĞİLDİR ve outstanding'e girmez (kullanıcıya açıkça belirtilir).
 *  - Sayfa okur + müvekkile ödeme kaydı (POST /client-payouts) yapar. Disposition POSTING (onay)
 *    bu sayfada YOKTUR; outstanding'i UI HESAPLAMAZ (backend otorite).
 */

import { useState } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Wallet, Info, FolderOpen, FileText, AlertCircle, Plus } from 'lucide-react';
import {
  clientAccountingApi,
  formatMoneyString,
  ROLE_LABELS,
  type ClientAccountingCase,
} from '@/lib/api/client-accounting';
import { PayoutCreateModal } from '@/components/client-accounting/PayoutCreateModal';

const PAGE_SIZE = 20;

export default function ClientAccountingPage() {
  const params = useParams();
  const clientId = params.clientId as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const caseIdParam = searchParams.get('caseId');
  const [page, setPage] = useState(1);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const queryClient = useQueryClient();

  // 1) Müvekkilin dosyaları (+ caseClientId resolve)
  const casesQ = useQuery({
    queryKey: ['client-accounting-cases', clientId],
    queryFn: () => clientAccountingApi.getCases(clientId),
    enabled: !!clientId,
  });

  const cases = casesQ.data ?? [];
  const selected: ClientAccountingCase | undefined =
    cases.find((c) => c.caseId === caseIdParam) ?? cases[0];
  const caseId = selected?.caseId;
  const caseClientId = selected?.caseClientId;
  const currency = selected?.currency ?? 'TRY';

  // 2) Seçili dosya/alacaklı için müvekkile-borç (backend otorite)
  const outstandingQ = useQuery({
    queryKey: ['client-accounting-outstanding', caseId, caseClientId, currency],
    queryFn: () => clientAccountingApi.getOutstanding(caseId!, caseClientId!, currency),
    enabled: !!caseId && !!caseClientId,
  });

  // 3) Müvekkile yapılan ödemeler (paginated)
  const payoutsQ = useQuery({
    queryKey: ['client-accounting-payouts', caseId, caseClientId, currency, page],
    queryFn: () =>
      clientAccountingApi.listPayouts({
        caseId: caseId!,
        caseClientId: caseClientId!,
        currency,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: !!caseId && !!caseClientId,
  });

  const onSelectCase = (newCaseId: string) => {
    setPage(1);
    router.replace(`${pathname}?caseId=${encodeURIComponent(newCaseId)}`);
  };

  // ── Loading / empty (dosya yok) durumları ──────────────────────────────────
  if (casesQ.isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (casesQ.isError) {
    return (
      <div className="p-4">
        <Card className="p-4 flex items-center gap-2 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">Müvekkil dosyaları yüklenemedi.</span>
        </Card>
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="p-4">
        <PageHeader />
        <Card className="p-8 mt-4 flex flex-col items-center gap-2 text-gray-500">
          <FolderOpen className="w-8 h-8" />
          <span className="text-sm">Bu müvekkilin alacaklı olduğu (muhasebeye konu) dosya bulunmuyor.</span>
        </Card>
      </div>
    );
  }

  const totalPages = payoutsQ.data ? Math.max(1, Math.ceil(payoutsQ.data.total / PAGE_SIZE)) : 1;

  return (
    <div className="h-full flex flex-col overflow-auto p-4 gap-4">
      <PageHeader />

      {/* Dosya seçici */}
      <Card className="p-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Dosya</label>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selected?.caseId ?? ''}
            onChange={(e) => onSelectCase(e.target.value)}
            className="border rounded px-3 py-2 text-sm min-w-[280px]"
          >
            {cases.map((c) => (
              <option key={c.caseId} value={c.caseId}>
                {c.caseNumber}
                {c.executionFileNumber ? ` — İcra: ${c.executionFileNumber}` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <Badge variant="secondary">{ROLE_LABELS[selected.role] ?? selected.role}</Badge>
          )}
        </div>
      </Card>

      {/* Müvekkile borç (outstanding) */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h2 className="font-medium text-gray-900">Müvekkile Borç (Net)</h2>
          </div>
          <div className="flex items-center gap-2">
            {outstandingQ.isFetching && <Spinner className="w-4 h-4" />}
            <Button size="sm" onClick={() => setShowPayoutModal(true)} disabled={!caseId || !caseClientId}>
              <Plus className="w-4 h-4 mr-1" /> Ödeme Kaydet
            </Button>
          </div>
        </div>

        <div className="mt-3">
          {outstandingQ.isError ? (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" />
              <span>Tutar hesaplanamadı.</span>
            </div>
          ) : outstandingQ.data ? (
            <div className="text-3xl font-semibold text-emerald-700">
              {formatMoneyString(outstandingQ.data.outstanding, outstandingQ.data.currency)}
            </div>
          ) : (
            <Spinner className="w-5 h-5" />
          )}
        </div>

        {/* Tanım notu — UI yanıltmasın */}
        <div className="mt-3 flex items-start gap-2 rounded-md bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
          <Info className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Müvekkile borç</strong> = onaylanmış (POSTED) müvekkil-payı dağıtım satırları (tahsilatı
            onaylı/CONFIRMED) − müvekkile yapılan ödemeler. <br />
            Emanette tutulan tutar (HELD), sözleşmesel vekâlet ücreti kesintisi, büro masrafı kesintisi ve
            masraf-avansı (cari/BalanceLedger) bu tutara <strong>dâhil değildir</strong>.
          </div>
        </div>
      </Card>

      {/* Ödeme geçmişi */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-5 h-5 text-gray-600" />
          <h2 className="font-medium text-gray-900">Müvekkile Ödemeler</h2>
          {payoutsQ.data && (
            <Badge variant="secondary" className="ml-1">
              {payoutsQ.data.total} kayıt
            </Badge>
          )}
          {payoutsQ.isFetching && <Spinner className="w-4 h-4 ml-1" />}
        </div>

        {payoutsQ.isError ? (
          <div className="flex items-center gap-2 text-red-600 text-sm py-4">
            <AlertCircle className="w-4 h-4" />
            <span>Ödemeler yüklenemedi.</span>
          </div>
        ) : !payoutsQ.data || payoutsQ.data.items.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center">
            Bu dosya/alacaklı için kayıtlı ödeme yok.
          </div>
        ) : (
          <>
            <div className="overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="border-b text-left">
                    <th className="px-3 py-2">Tarih</th>
                    <th className="px-3 py-2 text-right">Tutar</th>
                    <th className="px-3 py-2">Durum</th>
                    <th className="px-3 py-2">Not</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payoutsQ.data.items.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(p.paidAt).toLocaleString('tr-TR')}
                      </td>
                      <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {formatMoneyString(p.amount, p.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary">{p.status === 'RECORDED' ? 'Kaydedildi' : p.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{p.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 mt-3 text-sm">
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  disabled={page <= 1 || payoutsQ.isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Önceki
                </button>
                <span className="text-gray-500">
                  {page} / {totalPages}
                </span>
                <button
                  className="px-2 py-1 border rounded disabled:opacity-40"
                  disabled={page >= totalPages || payoutsQ.isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Sonraki
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {showPayoutModal && selected && caseId && caseClientId && (
        <PayoutCreateModal
          caseId={caseId}
          caseClientId={caseClientId}
          currency={currency}
          outstanding={outstandingQ.data?.outstanding ?? null}
          caseLabel={`${selected.caseNumber}${selected.executionFileNumber ? ` — İcra: ${selected.executionFileNumber}` : ''}`}
          onClose={() => setShowPayoutModal(false)}
          onSuccess={(result) => {
            setShowPayoutModal(false);
            setPage(1);
            // Outstanding + ödeme listesi + (varsa) ekstre query'lerini tazele → drift yok.
            queryClient.invalidateQueries({ queryKey: ['client-accounting-outstanding'] });
            queryClient.invalidateQueries({ queryKey: ['client-accounting-payouts'] });
            queryClient.invalidateQueries({ queryKey: ['client-statement'] });
            if (result.idempotentReplay) {
              alert('Bu ödeme zaten kayıtlıydı; tekrar oluşturulmadı (idempotent).');
            }
          }}
        />
      )}
    </div>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Müvekkil Muhasebesi</h1>
      <p className="text-sm text-gray-500">
        Dosya bazında müvekkile borç (net) ve müvekkile yapılan ödemeler.
      </p>
    </div>
  );
}
