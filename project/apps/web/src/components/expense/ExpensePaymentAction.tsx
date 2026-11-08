"use client";

import { useEffect, useRef, useState } from 'react';
import { api, type ExpensePaymentCommand } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { createIdempotencyKey } from '@/lib/idempotency-key';
import { toActionError } from '@/lib/action-error';

/** Records an existing receipt; does not execute a bank transfer or create an advance account. */
export function ExpensePaymentAction({ expenseId, caseId, status, onRecorded }: {
  expenseId: string; caseId: string; status: string; onRecorded?: () => void | Promise<void>;
}) {
  const { user, tenant } = useAuth();
  const key = JSON.stringify([tenant?.id ?? user?.tenantId, user?.id, caseId, expenseId]);
  const current = useRef(key); current.current = key;
  const pending = useRef(false);
  const command = useRef<{ key: string; payload: ExpensePaymentCommand } | null>(null);
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false);
  const [source, setSource] = useState<{ key: string; currency: string } | null>(null);
  const [amount, setAmount] = useState(''), [date, setDate] = useState(''), [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [outcome, setOutcome] = useState<{ key: string; ok: boolean; message: string } | null>(null);
  useEffect(() => {
    pending.current = false; command.current = null; setOpened(false); setBusy(false); setSource(null);
    setAmount(''); setDate(''); setReference(''); setOutcome(null);
    return () => { current.current = ''; };
  }, [key]);
  if (!user || user.role === 'VIEWER' || status === 'CANCELLED' || status === 'PAID') return null;
  const result = outcome?.key === key ? outcome : null;
  const currency = source?.key === key ? source.currency : null;
  const open = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setOutcome(null);
    try {
      const value = await api.getExpenseRequest(expenseId);
      if (value.id !== expenseId || value.caseId !== caseId || typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency)) throw new Error('Ödeme kaynağı doğrulanamadı');
      if (current.current === key) { setSource({ key, currency: value.currency }); setOpened(true); }
    } catch (error) { if (current.current === key) setOutcome({ key, ok: false, message: toActionError(error, 'Ödeme kaynağı okunamadı.').message }); }
    finally { if (current.current === key) { pending.current = false; setBusy(false); } }
  };
  const pay = async () => {
    if (pending.current || !currency || result?.ok) return;
    pending.current = true; setBusy(true); setOutcome(null);
    try {
      if (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !date) throw new Error('Pozitif tutar ve ödeme tarihi gereklidir.');
      const payload = { amount: Number(amount), paymentDate: new Date(`${date}T12:00:00.000Z`).toISOString(), method, reference: reference.trim() };
      const identity = JSON.stringify([key, payload]);
      if (command.current?.key !== identity) command.current = { key: identity, payload: { ...payload, idempotencyKey: createIdempotencyKey('expense-payment') } };
      const value = await api.recordExpensePayment(expenseId, command.current.payload);
      if (current.current !== key) return;
      if (value.id !== expenseId || value.caseId !== caseId || value.currency !== currency || !['PARTIAL', 'PAID'].includes(value.status)) throw new Error('Ödeme sonucu doğrulanamadı; aynı anahtarla yeniden sorgulayın.');
      setOutcome({ key, ok: true, message: 'Ödeme kaydı tamamlandı. Banka transferi yapılmadı.' });
      try { await onRecorded?.(); } catch { if (current.current === key) setOutcome({ key, ok: true, message: 'Ödeme kaydı tamamlandı; liste yenilenemedi. Listeyi yeniden okuyun.' }); }
    } catch (error) { if (current.current === key) setOutcome({ key, ok: false, message: toActionError(error, 'Ödeme kaydedilemedi; otomatik tekrar yapılmadı.').message }); }
    finally { if (current.current === key) { pending.current = false; setBusy(false); } }
  };
  return <div className="mt-2 border-t pt-2 text-xs">
    <button type="button" onClick={open} disabled={busy || result?.ok} className="rounded border px-2 py-1">Ödeme kaydet</button>
    {opened && currency && <div>
      <p>Talep para birimi: {currency}. Mevcut ve aynı para biriminde avans hesabı gerekir.</p>
      <label>Tutar<input aria-label="Masraf ödeme tutarı" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy || result?.ok} inputMode="decimal" /></label>
      <label>Ödeme tarihi<input aria-label="Masraf ödeme tarihi" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={busy || result?.ok} /></label>
      <label>Yöntem<select aria-label="Masraf ödeme yöntemi" value={method} onChange={e => setMethod(e.target.value)} disabled={busy || result?.ok}>
        <option value="BANK_TRANSFER">Banka kaydı</option><option value="CASH">Nakit</option><option value="OTHER">Diğer</option>
      </select></label>
      <label>Referans<input aria-label="Masraf ödeme referansı" value={reference} onChange={e => setReference(e.target.value)} disabled={busy || result?.ok} /></label>
      <button type="button" onClick={pay} disabled={busy || result?.ok} className="rounded border px-2 py-1">{busy ? 'İşleniyor…' : 'Ödeme kaydını onayla'}</button>
    </div>}
    {result && <p role={result.ok ? 'status' : 'alert'}>{result.message}</p>}
  </div>;
}
