'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, Spinner } from '@hukuk/ui';
import { X, ArrowLeftRight, AlertCircle, Lock, CheckCircle2 } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import {
  clientOffsetApi,
  friendlyOffsetError,
  type OffsetPreview,
  type CreateOffsetInput,
} from '@/lib/api/client-offset';

interface OffsetDrawerProps {
  clientId: string;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  /** Başarılı apply sonrası (parent query invalidation + drawer kapatma için). */
  onApplied?: () => void;
}

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `offset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * TM3 Faz C C-2b — Müvekkil Mahsubu Side Drawer (D1: modal DEĞİL; sağ panel, muhasebe bağlamı korunur).
 * D2: eligibility tamamen backend. D3: FE HESAP YAPMAZ (preview backend'den). D4: apply öncesi PREVIEW zorunlu.
 * D5: canApply=false → read-only aç (form doldurtma; "yalnız Partner/Manager"). Enforcement backend'de (403).
 */
export function OffsetDrawer({ clientId, currency, isOpen, onClose, onApplied }: OffsetDrawerProps) {
  const queryClient = useQueryClient();
  const [payableCcId, setPayableCcId] = useState('');
  const [expenseReqId, setExpenseReqId] = useState('');
  const [amount, setAmount] = useState('');
  // Önizlenen offset: data + ona kilitli idempotencyKey + input snapshot. Girdi değişince null'lanır (re-preview zorunlu).
  const [preview, setPreview] = useState<{ data: OffsetPreview; key: string; input: CreateOffsetInput } | null>(null);

  const eligQ = useQuery({
    queryKey: ['client-offset-eligibility', clientId, currency],
    queryFn: () => clientOffsetApi.getEligibility(clientId, currency),
    enabled: isOpen && !!clientId,
  });

  const canApply = eligQ.data?.canApply === true;
  const buckets = eligQ.data?.eligiblePayableBuckets ?? [];
  const expenses = eligQ.data?.eligibleExpenseRequests ?? [];
  const selectedBucket = buckets.find((b) => b.payableCaseClientId === payableCcId) ?? null;
  const selectedExpense = expenses.find((e) => e.expenseRequestId === expenseReqId) ?? null;

  const parsedAmount = Number((amount || '').replace(',', '.'));
  const amountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const legsSelected = !!selectedBucket && !!selectedExpense;
  // C-2A: seçili bacakların backend-sağladığı azami mahsup = min(payable available, expense unpaid).
  // SADECE UX uyarısı; nihai otorite backend (400 OFFSET_EXCEEDS_AVAILABLE korunur). FE muhasebe HESAPLAMAZ.
  const selectedMax =
    selectedBucket && selectedExpense
      ? Math.min(Number(selectedBucket.availableOutstanding), Number(selectedExpense.unpaidAmount))
      : null;
  const exceedsMax = selectedMax != null && Number.isFinite(selectedMax) && amountValid && parsedAmount > selectedMax;

  function buildInput(): CreateOffsetInput | null {
    if (!selectedBucket || !selectedExpense || !amountValid) return null;
    return {
      clientId,
      currency,
      payableCaseId: selectedBucket.payableCaseId,
      payableCaseClientId: selectedBucket.payableCaseClientId,
      expenseCaseId: selectedExpense.expenseCaseId,
      expenseRequestId: selectedExpense.expenseRequestId,
      amount: (amount || '').replace(',', '.'),
      idempotencyKey: '', // preview sonrası atanır
    };
  }

  // Girdi değişince önizlemeyi geçersiz kıl (apply yeniden preview ister).
  const invalidatePreview = () => setPreview(null);

  const previewMut = useMutation({
    mutationFn: () => {
      const input = buildInput()!;
      return clientOffsetApi.preview({
        clientId: input.clientId, currency: input.currency,
        payableCaseId: input.payableCaseId, payableCaseClientId: input.payableCaseClientId,
        expenseCaseId: input.expenseCaseId, expenseRequestId: input.expenseRequestId, amount: input.amount,
      });
    },
    onSuccess: (data) => {
      const input = buildInput()!;
      setPreview({ data, key: genIdempotencyKey(), input }); // bu önizlenen offset'e kilitli key
    },
  });

  const applyMut = useMutation({
    mutationFn: () => clientOffsetApi.create({ ...preview!.input, idempotencyKey: preview!.key }),
    onSuccess: () => {
      // Mahsup payable+cari+ekstre+hareketleri etkiler → DOĞRU Genel Cari query key'lerini tazele.
      // (FIX: summary key 'client-cari-summary' — 'client-accounting-summary' hiçbir query'ye karşılık gelmiyordu;
      //  case-scope 'client-accounting-outstanding' Genel Cari ile alakasız → çıkarıldı.)
      ['client-offset-eligibility', 'client-cari-summary', 'client-cari-movements', 'client-level-statements'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      );
      resetForm();
      onApplied?.();
      onClose();
    },
  });

  function resetForm() {
    setPayableCcId(''); setExpenseReqId(''); setAmount(''); setPreview(null);
  }

  if (!isOpen) return null;

  const previewMatchesCurrent = !!preview && JSON.stringify(buildInput()) === JSON.stringify({ ...preview.input, idempotencyKey: '' });

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="fixed inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <div className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b bg-gray-50 px-4 py-3">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-semibold text-gray-900">Müvekkil Mahsubu</h2>
          </div>
          <button onClick={onClose} aria-label="Kapat" className="rounded p-1 hover:bg-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {eligQ.isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : eligQ.isError ? (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" /> Uygunluk verisi alınamadı.
            </div>
          ) : (
            <div className="space-y-4">
              {/* D5 — read-only capability bildirimi */}
              {!canApply && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[13px] text-amber-800">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>Bu işlem yalnız <strong>Partner / Manager</strong> tarafından yapılabilir. Görünüm salt-okunur.</span>
                </div>
              )}

              <p className="text-[12px] text-gray-500">
                Bir alacak (payable) kaynağı ve bir masraf borcu seçin, tutar girin ve önizleyin. Hesaplar backend tarafından yapılır.
              </p>

              {/* Payable leg */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Alacak Kaynağı (müvekkile borç)</label>
                <select
                  value={payableCcId} disabled={!canApply}
                  onChange={(e) => { setPayableCcId(e.target.value); invalidatePreview(); }}
                  className="w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">— Seçin —</option>
                  {buckets.map((b) => (
                    <option key={b.payableCaseClientId} value={b.payableCaseClientId}>
                      {b.caseNumber || b.payableCaseId} · {formatMoneyString(b.availableOutstanding, b.currency)} ({b.role})
                    </option>
                  ))}
                </select>
                {buckets.length === 0 && <p className="mt-1 text-[11px] text-gray-400">Uygun alacak kaynağı yok.</p>}
              </div>

              {/* Expense leg */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Masraf Borcu (ödenmemiş)</label>
                <select
                  value={expenseReqId} disabled={!canApply}
                  onChange={(e) => { setExpenseReqId(e.target.value); invalidatePreview(); }}
                  className="w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                >
                  <option value="">— Seçin —</option>
                  {expenses.map((x) => (
                    <option key={x.expenseRequestId} value={x.expenseRequestId}>
                      {x.caseNumber || x.expenseCaseId} · {formatMoneyString(x.unpaidAmount, x.currency)} ({x.requestStatus})
                    </option>
                  ))}
                </select>
                {expenses.length === 0 && <p className="mt-1 text-[11px] text-gray-400">Ödenmemiş masraf yok.</p>}
              </div>

              {/* Amount */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Mahsup Tutarı ({currency})</label>
                <input
                  type="text" inputMode="decimal" value={amount} disabled={!canApply}
                  onChange={(e) => { setAmount(e.target.value); invalidatePreview(); }}
                  placeholder="0,00"
                  className="w-full rounded border px-3 py-2 text-sm disabled:bg-gray-100"
                />
                {exceedsMax && selectedMax != null && (
                  <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-600">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    Tutar, seçili bacakların azami mahsup edilebilir tutarını ({formatMoneyString(String(selectedMax), currency)}) aşıyor. Nihai kontrol backend'dedir; aşan tutar reddedilir.
                  </p>
                )}
              </div>

              {/* Önizle */}
              {canApply && (
                <Button
                  variant="outline" size="sm"
                  disabled={!legsSelected || !amountValid || previewMut.isPending}
                  onClick={() => previewMut.mutate()}
                >
                  {previewMut.isPending ? <Spinner className="h-4 w-4" /> : 'Önizle'}
                </Button>
              )}
              {previewMut.isError && (
                <div className="flex items-start gap-2 text-[12px] text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {friendlyOffsetError(previewMut.error)}
                </div>
              )}

              {/* D4 — Preview kartı (hesap backend'den; FE render eder) */}
              {preview && previewMatchesCurrent && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Mahsup Önizleme</div>
                  <PreviewRow label="Müvekkile Borç" before={preview.data.payableBefore} after={preview.data.payableAfter} currency={currency} />
                  <PreviewRow label="Masraf Borcu" before={preview.data.expenseBefore} after={preview.data.expenseAfter} currency={currency} />
                  <div className="my-1.5 border-t border-indigo-100" />
                  <PreviewRow label="Net Pozisyon" before={preview.data.netBefore} after={preview.data.netAfter} currency={currency} bold />
                  <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${preview.data.netUnchanged ? 'text-emerald-700' : 'text-red-600'}`}>
                    {preview.data.netUnchanged
                      ? <><CheckCircle2 className="h-4 w-4" /> Net pozisyon değişmeyecek.</>
                      : <><AlertCircle className="h-4 w-4" /> Net pozisyon değişiyor — beklenmedik durum.</>}
                  </div>
                  <p className="mt-1 text-[11px] text-gray-500">Azami tutar: {formatMoneyString(preview.data.maxAmount, currency)}</p>
                </div>
              )}

              {/* Uygula (preview zorunlu) */}
              {canApply && (
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={onClose} disabled={applyMut.isPending}>Vazgeç</Button>
                  <Button
                    size="sm"
                    disabled={!previewMatchesCurrent || applyMut.isPending}
                    onClick={() => applyMut.mutate()}
                    title={!previewMatchesCurrent ? 'Önce önizleyin' : undefined}
                  >
                    {applyMut.isPending ? <Spinner className="h-4 w-4" /> : 'Uygula'}
                  </Button>
                </div>
              )}
              {applyMut.isError && (
                <div className="flex items-start gap-2 text-[12px] text-red-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {friendlyOffsetError(applyMut.error)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewRow({ label, before, after, currency, bold }: { label: string; before: string; after: string; currency: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-0.5 text-[13px] ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        <span className="text-gray-500">{formatMoneyString(before, currency)}</span>
        <span className="mx-1.5 text-gray-400">→</span>
        <span>{formatMoneyString(after, currency)}</span>
      </span>
    </div>
  );
}
