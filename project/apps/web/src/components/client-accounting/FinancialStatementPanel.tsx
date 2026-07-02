'use client';

/**
 * ACCT-5B — Muhasebe Defteri paneli (AccountingJournal-kaynaklı, journal-derived read-only projeksiyon).
 *
 * ACCT-5A (backend, #817) office-wide read yaptı: JwtAuthGuard + tenant-scope yeterli, ekstra
 * capability/rol gerekmiyor — case-scope finansal okuma bu büroda zaten böyle (case-fee-agreement,
 * disposition-outstanding vb. ile aynı desen). Bu panel salt-okuma; hiçbir mutation tetiklemez,
 * hiçbir bakiye/toplam HESAPLAMAZ (backend'in döndürdüğü alanları doğrudan gösterir).
 *
 * DİKKAT — bu, sayfadaki "Müvekkil Ekstresi" (ClientStatement, StatementSection) ile AYNI ŞEY
 * DEĞİLDİR: Ekstre dönemsel immutable snapshot (create/supersede mutation'dır); bu panel ise
 * AccountingJournal'dan HER İSTEKTE canlı okunan bir defter görünümüdür, snapshot ALMAZ.
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@hukuk/ui';
import { BookOpen, AlertCircle, Info } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import { AccountingTable } from './AccountingTable';
import {
  financialStatementApi,
  financialStatementAccountLabel,
  type FinancialStatementMovement,
} from '@/lib/api/financial-statement';

export interface FinancialStatementPanelProps {
  caseId: string;
  clientId: string;
  caseClientId: string | null;
  currency: string;
  /** ISO — varsayılan dönem başlangıcı için (dosya açılışı). Yoksa 90 gün geriye düşer. */
  caseOpenedAt: string | null;
}

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultFrom(caseOpenedAt: string | null): string {
  if (caseOpenedAt) return toDateInput(new Date(caseOpenedAt));
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 90);
  return toDateInput(d);
}

export function FinancialStatementPanel({ caseId, clientId, caseClientId, currency, caseOpenedAt }: FinancialStatementPanelProps) {
  const defaults = useMemo(() => ({ from: defaultFrom(caseOpenedAt), to: toDateInput(new Date()) }), [caseOpenedAt]);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);

  const periodValid = !!from && !!to && from <= to;

  const statementQ = useQuery({
    queryKey: ['financial-statement', caseId, clientId, caseClientId, from, to, currency],
    queryFn: () =>
      financialStatementApi.getClientCaseStatement({
        caseId,
        clientId,
        caseClientId,
        from: `${from}T00:00:00.000Z`,
        to: `${to}T23:59:59.999Z`,
        currency,
      }),
    enabled: !!caseId && !!clientId && periodValid,
  });

  const report = statementQ.data;
  const movements = report?.movements ?? [];

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-gray-600" />
          <h2 className="font-medium text-gray-900">Muhasebe Defteri</h2>
          {report && (
            <Badge variant="secondary" className="ml-1">
              {movements.length} hareket
            </Badge>
          )}
          {statementQ.isFetching && <Spinner className="w-4 h-4 ml-1" />}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
            aria-label="Başlangıç tarihi"
          />
          <span className="text-gray-400">–</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-2 py-1 text-xs"
            aria-label="Bitiş tarihi"
          />
        </div>
      </div>

      <div className="mb-2 flex items-start gap-2 rounded-md bg-blue-50 border border-blue-100 p-2 text-[11px] text-blue-800">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          Bu defter, AccountingJournal kaynağından <strong>canlı</strong> okunur; yukarıdaki <strong>Müvekkil Ekstresi</strong>{' '}
          gibi dönemsel bir kayıt (snapshot) ALMAZ.
        </span>
      </div>

      {!periodValid ? (
        <div className="flex items-center gap-2 text-red-600 text-sm py-4">
          <AlertCircle className="w-4 h-4" />
          <span>Başlangıç tarihi bitiş tarihinden sonra olamaz.</span>
        </div>
      ) : statementQ.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Spinner className="w-5 h-5" />
        </div>
      ) : statementQ.isError ? (
        <div className="flex items-center gap-2 text-red-600 text-sm py-4">
          <AlertCircle className="w-4 h-4" />
          <span>Muhasebe defteri yüklenemedi.</span>
        </div>
      ) : !report || movements.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">Seçili dönemde defter hareketi bulunmuyor.</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 mb-3 text-sm">
            <span>
              Açılış: <strong className="tabular-nums">{formatMoneyString(report.opening.amount, report.opening.currency)}</strong>
            </span>
            <span>
              Kapanış: <strong className="tabular-nums">{formatMoneyString(report.closing.amount, report.closing.currency)}</strong>
            </span>
          </div>

          <div className="thin-scrollbar overflow-auto rounded-lg border">
            <AccountingTable
              head={
                <>
                  <th>Tarih</th>
                  <th>Hesap</th>
                  <th>Yön</th>
                  <th className="text-right">Tutar</th>
                  <th>Kaynak</th>
                  <th>Not</th>
                </>
              }
            >
              {movements.map((m) => (
                <MovementRow key={m.lineNo} movement={m} />
              ))}
            </AccountingTable>
          </div>

          {report.reconciliation.warnings.length > 0 && (
            <div className="mt-2 text-[11px] text-gray-400">
              {report.reconciliation.warnings.map((w) => (
                <div key={w.code}>{w.message}</div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function MovementRow({ movement }: { movement: FinancialStatementMovement }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap text-gray-600">{new Date(movement.statementDate).toLocaleDateString('tr-TR')}</td>
      <td>{financialStatementAccountLabel(movement.accountCode)}</td>
      <td>
        <Badge variant="secondary">{movement.direction === 'CREDIT' ? 'Alacak' : 'Borç'}</Badge>
      </td>
      <td className="text-right">{formatMoneyString(movement.amount, movement.currency)}</td>
      <td className="text-gray-600 text-xs">{movement.source.displayRef}</td>
      <td className="text-gray-600">{movement.note ?? '—'}</td>
    </tr>
  );
}

export default FinancialStatementPanel;
