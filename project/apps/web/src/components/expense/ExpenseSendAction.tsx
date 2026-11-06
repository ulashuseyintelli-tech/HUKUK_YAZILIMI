"use client";

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { expenseSendRequestFailed, interpretExpenseSendResponse, type ExpenseSendUiState } from '@/lib/expense-send-result';

/** Existing expense row only; this action never creates another expense. */
export function ExpenseSendAction({ expenseId, status }: { expenseId: string; status?: string }) {
  const [busy, setBusy] = useState(false);
  const [boundResult, setResult] = useState<{ id: string; value: ExpenseSendUiState } | null>(null);
  const result = boundResult?.id === expenseId ? boundResult.value : null;
  const current = useRef(expenseId);
  useEffect(() => { current.current = expenseId; setResult(null); setBusy(false); }, [expenseId]);
  if (!status || !['PENDING', 'SENT', 'REMINDED', 'PARTIAL'].includes(status)) return null;
  const send = async () => {
    if (busy) return;
    const id = expenseId;
    setBusy(true);
    try {
      const next = interpretExpenseSendResponse(await api.sendExpenseEmail(id));
      if (current.current === id) setResult({ id, value: next });
    } catch (error) {
      if (current.current === id) setResult({ id, value: expenseSendRequestFailed(error) });
    } finally { if (current.current === id) setBusy(false); }
  };
  return <div className="mt-2 border-t pt-2 text-xs">
    <button type="button" disabled={busy || result?.kind === 'accepted' || result?.kind === 'uncertain'} onClick={send}
      className="rounded border px-2 py-1 disabled:opacity-50">
      {busy ? 'Kontrol ediliyor…' : 'Gönderim Onayını Kontrol Et ve Gönder'}
    </button>
    {result && <p role={result.kind === 'accepted' ? 'status' : 'alert'} className="mt-1">{result.message}</p>}
    {result?.kind === 'approval' && <a className="underline" href="/office-approvals">Onay Kutusu — {result.approvalStatus}</a>}
  </div>;
}
