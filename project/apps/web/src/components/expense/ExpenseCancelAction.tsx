"use client";

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { toActionError } from '@/lib/action-error';

/** OperationDeck expense row; server rechecks history and authority before cancellation. */
export function ExpenseCancelAction({ expenseId, status, paidAmount, hasPaymentHistory, onCancelled }: {
  expenseId: string;
  status?: string;
  paidAmount?: number;
  hasPaymentHistory?: boolean;
  onCancelled?: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);
  const current = useRef(expenseId);
  const inFlight = useRef(false);
  useEffect(() => {
    current.current = expenseId;
    inFlight.current = false;
    setBusy(false); setReason(''); setResult(null);
  }, [expenseId]);
  const activeResult = result?.id === expenseId ? result : null;
  if (!status || !['PENDING', 'SENT', 'REMINDED', 'OVERDUE'].includes(status) || paidAmount !== 0 || hasPaymentHistory !== false) return null;

  const cancel = async () => {
    if (inFlight.current || activeResult?.ok || !reason.trim()) return;
    const id = expenseId;
    inFlight.current = true; setBusy(true); setResult(null);
    try {
      const response = await api.cancelExpenseRequest(id, reason.trim());
      if (current.current !== id) return;
      if (response?.id !== id || response?.status !== 'CANCELLED') {
        setResult({ id, ok: false, message: 'İptal sonucu doğrulanamadı; talebin güncel durumunu yeniden okuyun.' });
        return;
      }
      setResult({ id, ok: true, message: 'Talep iptal edildi. Gerçekleşmiş masraf ve ödeme kayıtları geri alınmadı.' });
      try { await onCancelled?.(); } catch {
        if (current.current === id) setResult({ id, ok: true, message: 'Talep iptal edildi; güncel liste okunamadı. Listeyi yeniden okuyun.' });
      }
    } catch (error) {
      if (current.current === id) setResult({ id, ok: false, message: toActionError(error, 'Talep iptal edilemedi.').message });
    } finally {
      if (current.current === id) { inFlight.current = false; setBusy(false); }
    }
  };
  return <div className="mt-2 border-t pt-2 text-xs">
    <label className="block">
      İptal gerekçesi
      <textarea aria-label="Masraf talebi iptal gerekçesi" value={reason} disabled={busy || activeResult?.ok}
        onChange={event => setReason(event.target.value)} className="mt-1 block w-full rounded border p-2" />
    </label>
    <button type="button" onClick={cancel} disabled={busy || activeResult?.ok || !reason.trim()}
      className="mt-1 rounded border px-2 py-1 disabled:opacity-50">
      {busy ? 'İptal ediliyor…' : 'Talebi Gerekçeyle İptal Et'}
    </button>
    {activeResult && <p role={activeResult.ok ? 'status' : 'alert'} className="mt-1">{activeResult.message}</p>}
  </div>;
}
