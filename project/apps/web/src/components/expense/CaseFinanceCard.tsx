"use client";

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { clientAccountingApi } from '@/lib/api/client-accounting';
import { useAuth } from '@/lib/auth-context';
import { toActionError } from '@/lib/action-error';

export interface CaseFinanceCardsContext {
  caseId: string;
  clients: Array<{ id: string; name: string }>;
  currencies: string[];
  sourceStatus: 'READY' | 'LOADING' | 'ERROR';
}
type MoneyRow = { amount: string; currency: string; label?: string };
const validMoney = (row: MoneyRow) => typeof row.amount === 'string'
  && /^-?\d+(?:\.\d{1,2})?$/.test(row.amount) && /^[A-Z]{3}$/.test(row.currency);
/** Presentation only: do not convert exact server amounts to binary floating point. */
export function displayFinanceMoney(row: MoneyRow) {
  if (!validMoney(row)) throw new Error('Mali tutar doğrulanamadı');
  const [whole, fraction = ''] = row.amount.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')} ${row.currency}`;
}

export function CaseFinanceCard({ kind, context, refreshKey = 0 }: {
  kind: 'actual' | 'payable'; context: CaseFinanceCardsContext; refreshKey?: number;
}) {
  const { user, tenant } = useAuth();
  const key = JSON.stringify([tenant?.id ?? user?.tenantId, user?.id, kind, context, refreshKey]);
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<{ key: string; rows?: MoneyRow[]; message?: string; error?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setView(null);
    const run = async () => {
      try {
        if (!user || !context.caseId) throw new Error('Dosya ve oturum bağlamı doğrulanamadı');
        if (kind === 'payable' && context.sourceStatus !== 'READY') {
          if (context.sourceStatus === 'ERROR') throw new Error('Dağıtım kaynakları okunamadı');
          return;
        }
        let rows: MoneyRow[];
        if (kind === 'actual') {
          const result = await api.getActualExpenseSummary(context.caseId);
          if (result.caseId !== context.caseId || result.basis !== 'TYPED_EXPENSE_ACTUAL' || result.scope !== 'CASE'
            || typeof result.exists !== 'boolean' || !Array.isArray(result.totals)) throw new Error('Masraf kaynağı doğrulanamadı');
          if (!result.exists) {
            if (result.totals.length) throw new Error('Hesap yokluğu ile masraf kayıtları tutarsız');
            if (!cancelled) setView({ key, message: 'Dosyada masraf avansı hesabı yok; toplam gösterilmiyor.' });
            return;
          }
          rows = result.totals;
          if (!rows.length || new Set(rows.map(row => row.currency)).size !== rows.length
            || result.totals.some(row => !Number.isInteger(row.count) || row.count < 0 || !/^\d+(?:\.\d{1,2})?$/.test(row.amount))) throw new Error('Masraf toplamı doğrulanamadı');
        } else {
          if (!context.clients.length) {
            if (!cancelled) setView({ key, message: 'Doğrulanmış alacaklı müvekkil bağı yok; tutar gösterilmiyor.' });
            return;
          }
          if (!context.currencies.length || context.currencies.some(c => !/^[A-Z]{3}$/.test(c))) throw new Error('Para birimi doğrulanamadı');
          rows = await Promise.all(context.clients.flatMap(client => context.currencies.map(async currency => {
            const result = await clientAccountingApi.getOutstanding(context.caseId, client.id, currency);
            if (result.caseId !== context.caseId || result.caseClientId !== client.id || result.currency !== currency) throw new Error('Müvekkil hesap kapsamı doğrulanamadı');
            return { amount: result.outstanding, currency, label: client.name };
          })));
        }
        if (rows.some(row => !validMoney(row))) throw new Error('Mali tutar doğrulanamadı');
        if (!cancelled) setView({ key, rows });
      } catch (error) {
        if (!cancelled) setView({ key, error: true, message: toActionError(error, 'Mali kaynak okunamadı.').message });
      }
    };
    void run();
    return () => { cancelled = true; };
    // key contains the full tenant/actor/case/client/currency identity and source state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = view?.key === key ? view : null;
  return <div className="p-3 rounded-lg bg-slate-50 border border-slate-200" data-testid={`finance-${kind}-card`}>
    <p className="text-[10px] text-slate-600 uppercase tracking-wide">{kind === 'payable' ? 'Müvekkile Borç (Net)' : 'Kaydı doğrulanmış gerçekleşen masraf'}</p>
    {!current ? <p role="status" className="text-xs">Yükleniyor…</p> : current.rows ? current.rows.map((row, index) =>
      <p key={`${row.label ?? ''}:${row.currency}:${index}`} className="text-sm font-semibold">{row.label && `${row.label}: `}{displayFinanceMoney(row)}</p>)
      : <p role={current.error ? 'alert' : 'status'} className="text-xs">{current.message}</p>}
    {kind === 'actual' && <p className="text-[9px] text-slate-500">Dosya / para birimi bazında yalnız türü ve kaynağı doğrulanmış kayıtlar. Genel avans düşümleri dahil değildir.</p>}
    <button type="button" className="mt-1 text-xs underline" onClick={() => setAttempt(value => value + 1)}>Yenile</button>
  </div>;
}
