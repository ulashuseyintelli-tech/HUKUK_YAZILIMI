'use client';

/**
 * TM3 Faz 7 — Müvekkil Muhasebesi sayfası.  Route: /clients/:clientId/accounting?caseId=
 *
 * Tasarım kilitleri (Ulaş):
 *  - UI bir HESAP MOTORU DEĞİLDİR. Her kart backend'in döndürdüğü tek alanı gösterir; UI hiçbir
 *    bakiye/borç toplamı HESAPLAMAZ (otorite backend). Tek birleşik "balance" YOKTUR.
 *  - Faz 7-V: 5 PARA GERÇEĞİ ayrı kutularda — karışmasın:
 *      1) Müvekkile Borç (Net)  = proceeds (POSTED CLIENT_PAYABLE − RECORDED ClientPayout)
 *      2) Müvekkilden Talep Edilen Masraf  = ExpenseRequest (seçili müvekkil) — müvekkile borç DEĞİL
 *      3) Müvekkilden Tahsil Edilen Masraf = ExpenseRequest ödenen
 *      4) Masraf/Avans Bakiyesi = CaseBalance/BalanceLedger — payout defteri DEĞİL
 *      5) Borçlu Tahsilatı = dosyaya borçludan gelen tahsilat — otomatik müvekkile borç DEĞİL
 *  - Finansal scope: proceeds/payout = caseClientId; masraf = seçili clientId; avans/tahsilat = dosya.
 *  - Ekstre (ClientStatement) üret/yenile bu sayfada YOK (ayrı mutation gate = Faz 7-E).
 */

import { useState, type ComponentType, type ReactNode } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { Wallet, Send, CheckCircle, Landmark, Building2, FileText, FolderOpen, AlertCircle, Plus } from 'lucide-react';
import {
  clientAccountingApi,
  formatMoneyString,
  ROLE_LABELS,
  type ClientAccountingCase,
} from '@/lib/api/client-accounting';
import { PayoutCreateModal } from '@/components/client-accounting/PayoutCreateModal';
import { StatementSection } from '@/components/client-accounting/StatementSection';

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

  // Kart 1 — Müvekkile Borç (Net) / proceeds (caseClientId-scope, backend otorite)
  const outstandingQ = useQuery({
    queryKey: ['client-accounting-outstanding', caseId, caseClientId, currency],
    queryFn: () => clientAccountingApi.getOutstanding(caseId!, caseClientId!, currency),
    enabled: !!caseId && !!caseClientId,
  });

  // Kart 2/3 — Seçili müvekkilin masraf özeti (ExpenseRequest, clientId filtreli)
  const expenseQ = useQuery({
    queryKey: ['client-accounting-expense', caseId, clientId],
    queryFn: () => clientAccountingApi.getExpenseSummary(caseId!, clientId),
    enabled: !!caseId && !!clientId,
  });

  // Kart 4 — Masraf/Avans bakiyesi (CaseBalance, dosya-level)
  const balanceQ = useQuery({
    queryKey: ['client-accounting-balance', caseId],
    queryFn: () => clientAccountingApi.getCaseBalance(caseId!),
    enabled: !!caseId,
  });

  // Kart 5 — Borçlu tahsilatı (calculation-summary.toplamTahsilat, dosya-level)
  const collectionQ = useQuery({
    queryKey: ['client-accounting-debtor-collection', caseId],
    queryFn: () => clientAccountingApi.getDebtorCollectionTotal(caseId!),
    enabled: !!caseId,
  });

  // Müvekkile yapılan ödemeler (paginated)
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

      {/* 5 PARA GERÇEĞİ — ayrı kutular (karışmasın) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {/* 1 — Müvekkile Borç (Net) / proceeds + Ödeme Kaydet (Faz7 #559) */}
        <SummaryCard
          icon={Wallet}
          accent="text-emerald-600"
          valueAccent="text-emerald-700"
          title="Müvekkile Borç (Net)"
          loading={outstandingQ.isLoading}
          error={outstandingQ.isError}
          fetching={outstandingQ.isFetching}
          value={outstandingQ.data ? formatMoneyString(outstandingQ.data.outstanding, currency) : null}
          note={
            <>
              Müvekkile ödenecek proceeds bakiyesi. Masraf talepleri bu tutara <strong>dâhil değildir</strong>.
            </>
          }
          action={
            <Button size="sm" onClick={() => setShowPayoutModal(true)} disabled={!caseId || !caseClientId}>
              <Plus className="w-4 h-4 mr-1" /> Ödeme Kaydet
            </Button>
          }
        />

        {/* 2 — Müvekkilden Talep Edilen Masraf */}
        <SummaryCard
          icon={Send}
          accent="text-amber-600"
          valueAccent="text-amber-700"
          title="Müvekkilden Talep Edilen Masraf"
          loading={expenseQ.isLoading}
          error={expenseQ.isError}
          fetching={expenseQ.isFetching}
          value={expenseQ.data ? formatMoneyString(String(expenseQ.data.totalRequested), currency) : null}
          sub={expenseQ.data ? `Ödenmemiş: ${formatMoneyString(String(expenseQ.data.totalPending), currency)}` : undefined}
          note="Müvekkilden istenen masraf/avans tutarı. Müvekkile borç değildir."
        />

        {/* 3 — Müvekkilden Tahsil Edilen Masraf */}
        <SummaryCard
          icon={CheckCircle}
          accent="text-green-600"
          valueAccent="text-green-700"
          title="Müvekkilden Tahsil Edilen Masraf"
          loading={expenseQ.isLoading}
          error={expenseQ.isError}
          fetching={expenseQ.isFetching}
          value={expenseQ.data ? formatMoneyString(String(expenseQ.data.totalPaid), currency) : null}
          note="Müvekkilin ödediği masraf/avans tutarı."
        />

        {/* 4 — Masraf/Avans Bakiyesi */}
        <SummaryCard
          icon={Landmark}
          accent="text-slate-600"
          valueAccent="text-slate-800"
          title="Masraf/Avans Bakiyesi"
          loading={balanceQ.isLoading}
          error={balanceQ.isError}
          fetching={balanceQ.isFetching}
          value={balanceQ.data ? formatMoneyString(balanceQ.data.balance, balanceQ.data.currency) : null}
          note="BalanceLedger/CaseBalance kaynaklı avans hareketleri. Payout defteri değildir."
        />

        {/* 5 — Borçlu Tahsilatı */}
        <SummaryCard
          icon={Building2}
          accent="text-indigo-600"
          valueAccent="text-indigo-700"
          title="Borçlu Tahsilatı"
          loading={collectionQ.isLoading}
          error={collectionQ.isError}
          fetching={collectionQ.isFetching}
          value={collectionQ.data != null ? formatMoneyString(String(collectionQ.data), currency) : null}
          note="Borçludan dosyaya gelen tahsilatlar. Otomatik olarak müvekkile borç anlamına gelmez."
        />
      </div>

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

      {/* Müvekkil Ekstresi — Faz 7-E: liste + Oluştur/Yenile (immutable snapshot, period-scoped) */}
      {caseId && (
        <StatementSection
          caseId={caseId}
          clientId={clientId}
          currency={currency}
          caseOpenedAt={selected?.caseOpenedAt ?? null}
        />
      )}

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

/** Tek para gerçeği kartı — backend'in döndürdüğü değeri gösterir; UI hesap YAPMAZ. */
function SummaryCard({
  icon: Icon,
  accent,
  valueAccent,
  title,
  value,
  sub,
  note,
  loading,
  error,
  fetching,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  accent: string;
  valueAccent: string;
  title: string;
  value: string | null;
  sub?: string;
  note: ReactNode;
  loading?: boolean;
  error?: boolean;
  fetching?: boolean;
  action?: ReactNode;
}) {
  return (
    <Card className="p-4 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-5 h-5 ${accent}`} />
          <h2 className="font-medium text-gray-900 text-sm">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {fetching && <Spinner className="w-4 h-4" />}
          {action}
        </div>
      </div>

      <div className="mt-2">
        {error ? (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Yüklenemedi.</span>
          </div>
        ) : loading || value === null ? (
          <Spinner className="w-5 h-5" />
        ) : (
          <div className={`text-2xl font-semibold ${valueAccent}`}>{value}</div>
        )}
        {sub && !error && value !== null && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>

      <div className="mt-2 text-[11px] text-gray-500 leading-snug">{note}</div>
    </Card>
  );
}

function PageHeader() {
  return (
    <div>
      <h1 className="text-xl font-semibold text-gray-900">Müvekkil Muhasebesi</h1>
      <p className="text-sm text-gray-500">
        Dosya bazında 5 para gerçeği ayrı ayrı: müvekkile borç (net), müvekkilden talep/tahsil edilen masraf,
        masraf/avans bakiyesi ve borçlu tahsilatı.
      </p>
    </div>
  );
}
