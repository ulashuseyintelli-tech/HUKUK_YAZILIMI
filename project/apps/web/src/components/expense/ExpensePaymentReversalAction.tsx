"use client";

import { useEffect, useRef, useState } from 'react';
import { api, type ExpensePaymentReversalOptions } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { toActionError } from '@/lib/action-error';

/** Existing case Finance row only; eligibility and every financial coordinate are server-owned. */
export function ExpensePaymentReversalAction({ expenseId, caseId, onReversed }: {
  expenseId: string; caseId: string; onReversed?: () => void | Promise<void>;
}) {
  const { user, tenant } = useAuth();
  const key = JSON.stringify([tenant?.id ?? user?.tenantId, user?.id, caseId, expenseId]);
  const current = useRef(key); current.current = key;
  const pending = useRef<symbol | null>(null);
  const [view, setView] = useState<{ key: string; value: ExpensePaymentReversalOptions } | null>(null);
  const [result, setResult] = useState<{ key: string; ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    current.current = key;
    pending.current = null; setView(null); setResult(null); setBusy(false); setReason(''); setSelected(''); setConfirmed(false);
    return () => { current.current = ''; };
  }, [key]);
  const source = view?.key === key ? view.value : null;
  const outcome = result?.key === key ? result : null;
  const choice = source?.payments.find(row => row.expensePaymentId === selected);
  if (!user) return null;

  const load = async () => {
    if (pending.current) return;
    const token = Symbol(); pending.current = token; setBusy(true); setView(null); setResult(null); setSelected(''); setConfirmed(false);
    try {
      const value = await api.getExpensePaymentReversalOptions(expenseId, caseId);
      if (current.current === key && pending.current === token) setView({ key, value });
    } catch (error) {
      if (current.current === key && pending.current === token) setResult({ key, ok: false, message: toActionError(error, 'Ödeme düzeltme kaynağı okunamadı.').message });
    } finally {
      if (current.current === key && pending.current === token) { pending.current = null; setBusy(false); }
    }
  };
  const reverse = async () => {
    if (pending.current || !choice?.eligible || !confirmed || reason.trim().length < 10 || outcome?.ok) return;
    const token = Symbol(); pending.current = token; setBusy(true); setResult(null);
    try {
      const value = await api.reverseExpensePayment(expenseId, choice.expensePaymentId, reason.trim());
      if (current.current !== key || pending.current !== token) return;
      if (value.originalAmount !== choice.originalAmount || value.currency !== choice.currency) throw new Error('Ters kayıt sonucu seçilen kaynakla eşleşmiyor; güncel kaydı yeniden okuyun.');
      setView(previous => previous?.key === key ? { key, value: { ...previous.value, payments: previous.value.payments.map(row => row.expensePaymentId === choice.expensePaymentId
        ? { ...row, eligible: false, completedAt: value.completedAt, blockedReason: null } : row) } } : previous);
      setResult({ key, ok: true, message: 'Tam ters kayıt tamamlandı. Özgün ödeme geçmişi korundu; banka iadesi veya talep iptali yapılmadı.' });
      try { await onReversed?.(); } catch {
        if (current.current === key) setResult({ key, ok: true, message: 'Tam ters kayıt tamamlandı; güncel liste okunamadı. Listeyi yeniden okuyun.' });
      }
    } catch (error) {
      if (current.current === key && pending.current === token) {
        setView(null); setResult({ key, ok: false, message: toActionError(error, 'Ters kayıt tamamlanamadı; otomatik tekrar yapılmadı.').message });
      }
    } finally {
      if (current.current === key && pending.current === token) { pending.current = null; setBusy(false); }
    }
  };
  return <div className="mt-2 border-t pt-2 text-xs">
    <button type="button" onClick={load} disabled={busy} className="rounded border px-2 py-1 disabled:opacity-50">Ödeme düzeltme kaydını aç</button>
    {source && <div>
      {source.payments.length === 0 && <p>Bu talepte kayıtlı ödeme yok.</p>}
      {source.payments.map(row => <p key={row.expensePaymentId}>
        {row.originalAmount} {row.currency} — {row.completedAt ? 'Tam ters kaydedildi; özgün ödeme geçmiştedir.' : row.blockedReason === 'EXPENSE_PAYMENT_REVERSAL_INSUFFICIENT_BALANCE'
          ? 'Kaynak dosya avans bakiyesi yetersiz.' : row.blockedReason ? 'Kaynak veya işlem koşulları doğrulanamadı.' : 'Tam düzeltme için seçilebilir.'}
      </p>)}
      {source.payments.some(row => row.eligible) && <>
        <label>Özgün ödeme<select aria-label="Ters kaydedilecek ödeme" disabled={busy || outcome?.ok} value={selected}
          onChange={event => { setSelected(event.target.value); setConfirmed(false); }}>
          <option value="">Seçiniz</option>{source.payments.filter(row => row.eligible).map(row => <option key={row.expensePaymentId} value={row.expensePaymentId}>
            {row.originalAmount} {row.currency} — {row.paymentDate}</option>)}
        </select></label>
        <label className="block">Ters kayıt gerekçesi<textarea aria-label="Ödeme ters kayıt gerekçesi" value={reason} disabled={busy || outcome?.ok}
          onChange={event => setReason(event.target.value)} className="block w-full rounded border p-2" /></label>
        <label className="block"><input type="checkbox" checked={confirmed} disabled={busy || !choice?.eligible || outcome?.ok}
          onChange={event => setConfirmed(event.target.checked)} /> Özgün ödemenin tamamını aynı hesap ve para biriminde düzeltmeyi onaylıyorum.</label>
        <button type="button" onClick={reverse} disabled={busy || !choice?.eligible || !confirmed || reason.trim().length < 10 || outcome?.ok}
          className="rounded border px-2 py-1 disabled:opacity-50">{busy ? 'İşleniyor…' : 'Tam Ters Kayıt Yap'}</button>
      </>}
    </div>}
    {outcome && <p role={outcome.ok ? 'status' : 'alert'}>{outcome.message}</p>}
  </div>;
}
