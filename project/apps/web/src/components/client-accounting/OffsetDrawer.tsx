'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, Spinner } from '@hukuk/ui';
import { X, ArrowLeftRight, AlertCircle, Lock, CheckCircle2 } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import {
  clientOffsetApi,
  friendlyOffsetError,
  type OffsetPreview,
  type CreateOffsetInput,
  type ClientOffsetRecord,
} from '@/lib/api/client-offset';
import { AccountingTable } from './AccountingTable';

interface OffsetDrawerProps {
  clientId: string;
  currency: string;
  isOpen: boolean;
  onClose: () => void;
  /** Başarılı apply sonrası (parent query invalidation + drawer kapatma için). */
  onApplied?: () => void;
  /**
   * S8-A — Mahsup Önerisi ön-doldurma. YALNIZ kolaylık: backend DEĞİŞMEZ, kullanıcı yine Önizle→Uygula yapar.
   * Yalnız eligibility'de GERÇEKTEN var olan id'ler seed edilir (bayat preset sessizce düşer); seed sonrası
   * preview null'lanır → D4 zorunlu önizleme korunur. amount = backend decimal-string'inin birebir kopyası.
   */
  initialSelection?: { payableCaseClientId?: string; expenseRequestId?: string; amount?: string };
}

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `offset-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Başarılı mahsup mutasyonu sonrası tazelenecek Genel Cari query key'leri (tek noktada; apply+reverse paylaşır). */
const OFFSET_INVALIDATE_KEYS = [
  'client-offset-eligibility',
  'client-offset-history',
  'client-cari-summary',
  'client-cari-movements',
  'client-level-statements',
];

/**
 * TM3 Faz C C-2b/C-2c — Müvekkil Mahsubu Side Drawer (D1: modal DEĞİL; sağ panel, muhasebe bağlamı korunur).
 * D2: eligibility tamamen backend. D3: FE HESAP YAPMAZ (preview backend'den). D4: apply öncesi PREVIEW zorunlu.
 * D5: canApply=false → read-only aç ("yalnız Partner/Manager"). Enforcement backend'de (403).
 *
 * C-2c — "Yeni Mahsup | Geçmiş" sekmesi: Geçmiş read-only liste (herkese görünür, READ tenant-level), her APPLY satırında
 * "İptal" (reverse) yalnız PARTNER/MANAGER (canApply) — reason≥10 modal; backend 403/409 friendly. Reverse=ters AYRI kayıt
 * (orijinal değişmez). KALICI yeni panel YOK (drawer içi sekme); B-2.3 FocusDrawer ile karışmaz; UI HESAPLAMAZ.
 */
export function OffsetDrawer({ clientId, currency, isOpen, onClose, onApplied, initialSelection }: OffsetDrawerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'new' | 'history'>('new');
  const [payableCcId, setPayableCcId] = useState('');
  const [expenseReqId, setExpenseReqId] = useState('');
  const [amount, setAmount] = useState('');
  // Önizlenen offset: data + ona kilitli idempotencyKey + input snapshot. Girdi değişince null'lanır (re-preview zorunlu).
  const [preview, setPreview] = useState<{ data: OffsetPreview; key: string; input: CreateOffsetInput } | null>(null);
  const [reverseTarget, setReverseTarget] = useState<ClientOffsetRecord | null>(null);
  // S8-A — initialSelection seed'i açılış başına TEK kez (kullanıcı düzenlemesini ezmemek için).
  const seededRef = useRef(false);

  const eligQ = useQuery({
    queryKey: ['client-offset-eligibility', clientId, currency],
    queryFn: () => clientOffsetApi.getEligibility(clientId, currency),
    enabled: isOpen && !!clientId,
  });

  // C-2c — mahsup geçmişi (APPLY+REVERSAL). Read-only; herkese görünür (#4 kararı: READ tenant-level).
  const historyQ = useQuery({
    queryKey: ['client-offset-history', clientId, currency],
    queryFn: () => clientOffsetApi.list(clientId, { currency }),
    enabled: isOpen && !!clientId,
  });

  const canApply = eligQ.data?.canApply === true;
  const buckets = eligQ.data?.eligiblePayableBuckets ?? [];
  const expenses = eligQ.data?.eligibleExpenseRequests ?? [];
  const selectedBucket = buckets.find((b) => b.payableCaseClientId === payableCcId) ?? null;
  const selectedExpense = expenses.find((e) => e.expenseRequestId === expenseReqId) ?? null;

  // S8-A — Mahsup Önerisi ön-doldurma (best-effort, FE-only):
  // Açılışta + eligibility hazır olunca TEK kez seed eder; YALNIZ eligibility'de var olan id'leri (bayat preset düşer).
  // Seed sonrası preview null + 'Yeni Mahsup' sekmesi; kullanıcı yine Önizle→Uygula yapar (D4 backend otoritesi korunur).
  useEffect(() => {
    if (!isOpen) {
      seededRef.current = false; // kapanışta sıfırla → yeniden açılışta yeni öneri seed edilebilir
      return;
    }
    if (seededRef.current || !eligQ.data || !initialSelection) return;
    const wantP = initialSelection.payableCaseClientId;
    const wantE = initialSelection.expenseRequestId;
    const hasP = !!wantP && buckets.some((b) => b.payableCaseClientId === wantP);
    const hasE = !!wantE && expenses.some((e) => e.expenseRequestId === wantE);
    if (hasP) setPayableCcId(wantP!);
    if (hasE) setExpenseReqId(wantE!);
    // tutar yalnız her iki bacak da geçerliyse seed edilir (öksüz tutar bırakma); faithful backend string.
    if (hasP && hasE && initialSelection.amount) setAmount(initialSelection.amount);
    setPreview(null);
    setTab('new');
    seededRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, eligQ.data, initialSelection]);

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

  // Reverse-edilmiş APPLY id kümesi (REVERSAL.reversesOffsetId) → İptal butonu pasifleştirme.
  const rows = historyQ.data ?? [];
  const reversedApplyIds = useMemo(
    () => new Set(rows.filter((r) => r.kind === 'REVERSAL' && r.reversesOffsetId).map((r) => r.reversesOffsetId as string)),
    [rows],
  );

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

  const invalidateOffsetQueries = () =>
    OFFSET_INVALIDATE_KEYS.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));

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
      invalidateOffsetQueries();
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

        {/* C-2c — sekme: Yeni Mahsup | Geçmiş */}
        <div className="flex shrink-0 border-b" role="tablist">
          <TabButton active={tab === 'new'} onClick={() => setTab('new')}>Yeni Mahsup</TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            Geçmiş{historyQ.data ? ` (${rows.length})` : ''}
          </TabButton>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'new' ? (
            eligQ.isLoading ? (
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

                {/* DASH-7 — Preview kartı HER ZAMAN görünür (boşken placeholder; seçim+önizleme sonrası backend sonucu). */}
                <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">Mahsup Önizleme</div>
                  {preview && previewMatchesCurrent ? (
                    <>
                      <PreviewRow label="Müvekkile Borç" before={preview.data.payableBefore} after={preview.data.payableAfter} currency={currency} />
                      <PreviewRow label="Masraf Borcu" before={preview.data.expenseBefore} after={preview.data.expenseAfter} currency={currency} />
                      <div className="my-1.5 border-t border-indigo-100" />
                      <PreviewRow label="Net Pozisyon" before={preview.data.netBefore} after={preview.data.netAfter} currency={currency} bold />
                      <div
                        className={`mt-2 flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-semibold ${
                          preview.data.netUnchanged ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {preview.data.netUnchanged ? (
                          <><CheckCircle2 className="h-4 w-4 shrink-0" /> Net pozisyon değişmeyecek</>
                        ) : (
                          <><AlertCircle className="h-4 w-4 shrink-0" /> Net pozisyon değişiyor — beklenmedik durum</>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">Azami tutar: {formatMoneyString(preview.data.maxAmount, currency)}</p>
                    </>
                  ) : (
                    <>
                      <PreviewRow label="Müvekkile Borç" before={null} after={null} currency={currency} />
                      <PreviewRow label="Masraf Borcu" before={null} after={null} currency={currency} />
                      <div className="my-1.5 border-t border-indigo-100" />
                      <PreviewRow label="Net Pozisyon" before={null} after={null} currency={currency} bold />
                      <p className="mt-2 text-center text-[12px] text-gray-500">Bir mahsup seçildiğinde önizleme burada oluşacaktır.</p>
                    </>
                  )}
                </div>

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
            )
          ) : (
            /* ── GEÇMİŞ sekmesi (C-2c) — read-only liste + gated reverse ───────────────── */
            historyQ.isLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : historyQ.isError ? (
              <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" /> Mahsup geçmişi alınamadı.
              </div>
            ) : rows.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">Henüz mahsup yok.</div>
            ) : (
              <>
                {!canApply && (
                  <p className="mb-3 flex items-start gap-1.5 text-[11px] text-gray-500">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" /> Mahsup iptali yalnız Partner / Manager tarafından yapılabilir.
                  </p>
                )}
                <AccountingTable
                  head={
                    <>
                      <th className="whitespace-nowrap">Tarih</th>
                      <th className="text-right">Tutar</th>
                      <th>Durum</th>
                      <th className="text-right">İşlem</th>
                    </>
                  }
                >
                  {rows.map((r) => {
                    const isReversal = r.kind === 'REVERSAL';
                    const alreadyReversed = r.kind === 'APPLY' && reversedApplyIds.has(r.id);
                    return (
                      <tr key={r.id} className={`hover:bg-gray-50 ${isReversal ? 'bg-slate-50/50' : ''}`}>
                        <td className="whitespace-nowrap text-gray-600">{new Date(r.createdAt).toLocaleDateString('tr-TR')}</td>
                        <td className="text-right">{formatMoneyString(r.amount, r.currency)}</td>
                        <td className="whitespace-nowrap">
                          {isReversal ? (
                            <Badge variant="secondary">İptal (geri alma)</Badge>
                          ) : alreadyReversed ? (
                            <Badge variant="warning">İptal edildi</Badge>
                          ) : (
                            <Badge variant="success">Uygulandı</Badge>
                          )}
                        </td>
                        <td className="text-right">
                          {r.kind === 'APPLY' ? (
                            <Button
                              variant="ghost" size="sm"
                              disabled={!canApply || alreadyReversed}
                              title={alreadyReversed ? 'Bu mahsup zaten iptal edilmiş' : !canApply ? 'Yalnız Partner/Manager' : undefined}
                              onClick={() => setReverseTarget(r)}
                            >
                              İptal
                            </Button>
                          ) : (
                            <span className="text-[11px] text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </AccountingTable>
                <p className="mt-2 text-[11px] text-gray-400">
                  Mahsup = nakit hareketsiz; net pozisyon değişmez. İptal, ters yönlü AYRI bir kayıt oluşturur; orijinal mahsup değişmez.
                </p>
              </>
            )
          )}
        </div>
      </div>

      {reverseTarget && (
        <ReverseModal
          offset={reverseTarget}
          currency={currency}
          onClose={() => setReverseTarget(null)}
          onReversed={() => { invalidateOffsetQueries(); setReverseTarget(null); }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 px-4 py-2 text-sm font-medium ${
        active ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function PreviewRow({ label, before, after, currency, bold }: { label: string; before: string | null; after: string | null; currency: string; bold?: boolean }) {
  const fmt = (v: string | null) => (v == null ? '—' : formatMoneyString(v, currency));
  return (
    <div className={`flex items-center justify-between py-0.5 text-[13px] ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
      <span>{label}</span>
      <span className="tabular-nums">
        <span className="text-gray-500">{fmt(before)}</span>
        <span className="mx-1.5 text-gray-400">→</span>
        <span>{fmt(after)}</span>
      </span>
    </div>
  );
}

/** C-2c — Mahsup iptali modalı. reason≥10 (trim, FE valide + backend zorunlu); idempotencyKey mount başına (retry-safe). */
function ReverseModal({ offset, currency, onClose, onReversed }: {
  offset: ClientOffsetRecord; currency: string; onClose: () => void; onReversed: () => void;
}) {
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState<string>(genIdempotencyKey);
  const reasonValid = reason.trim().length >= 10;

  const mut = useMutation({
    mutationFn: () => clientOffsetApi.reverse(offset.id, { reason: reason.trim(), idempotencyKey }),
    onSuccess: () => onReversed(),
  });

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold text-gray-900">Mahsup İptali</h3>
          <button onClick={onClose} aria-label="Kapat" className="rounded p-1 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-md border bg-gray-50 p-3 text-[13px] text-gray-700">
            İptal edilecek mahsup: <span className="font-semibold">{formatMoneyString(offset.amount, offset.currency || currency)}</span>
            <div className="mt-1 text-[11px] text-gray-500">İptal, ters yönlü AYRI bir kayıt oluşturur; orijinal mahsup değiştirilmez.</div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">İptal Gerekçesi (en az 10 karakter)</label>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="w-full rounded border px-3 py-2 text-sm" placeholder="Gerekçe…" autoFocus
            />
            {!reasonValid && reason.length > 0 && <p className="mt-1 text-[11px] text-amber-600">En az 10 karakter gerekli.</p>}
          </div>
          {mut.isError && (
            <div className="flex items-start gap-2 text-[12px] text-red-600">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {friendlyOffsetError(mut.error)}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>Vazgeç</Button>
            <Button variant="destructive" size="sm" disabled={!reasonValid || mut.isPending} onClick={() => mut.mutate()}>
              {mut.isPending ? <Spinner className="h-4 w-4" /> : 'Mahsubu İptal Et'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
