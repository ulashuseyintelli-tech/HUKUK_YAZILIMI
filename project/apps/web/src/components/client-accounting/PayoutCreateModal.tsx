'use client';

/**
 * TM3 Faz 7 — Müvekkile ödeme kaydı modalı (POST /client-payouts).
 *
 * D1 (KIRMIZI ÇİZGİ): Payout = ClientPayout + CLIENT_PAYOUT_SENT. Proceeds/dağıtım tarafında
 * kapanır; masraf-avansı defterine YAZILMAZ. Bu UI'da defter adı geçmez.
 *
 * UI outstanding HESAPLAMAZ: gösterilen/ön-kontrolde kullanılan tutar backend'den gelir
 * (prop). amount<=outstanding yalnız erken uyarı; KESİN otorite backend (over-payout,
 * idempotency-conflict, scope doğrulaması backend'de).
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Spinner } from '@hukuk/ui';
import { X, AlertCircle, Wallet } from 'lucide-react';
import { clientAccountingApi, formatMoneyString, type CreatePayoutResult } from '@/lib/api/client-accounting';

interface PayoutCreateModalProps {
  caseId: string;
  caseClientId: string;
  currency: string;
  /** Backend'den gelen güncel müvekkile-borç (string). null=henüz yok. UI HESAPLAMAZ. */
  outstanding: string | null;
  caseLabel: string;
  onClose: () => void;
  onSuccess: (result: CreatePayoutResult) => void;
}

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `payout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Backend hata mesajını kullanıcı diline çevirir (mesaj backend otoritesini değiştirmez). */
function friendlyError(message: string): string {
  const m = message || '';
  if (/aşamaz|outstanding/i.test(m)) return `Tutar, müvekkile borcunu (net) aşıyor. ${m}`;
  if (/idempotency|farklı payload/i.test(m)) {
    return 'Bu ödeme anahtarı farklı bir tutarla zaten kullanılmış (idempotency çakışması). Sayfayı yenileyip tekrar deneyin.';
  }
  if (/geçersiz|yabancı|uygun rolde/i.test(m)) return `Dosya/alacaklı doğrulaması başarısız: ${m}`;
  return m || 'Ödeme kaydedilemedi.';
}

export function PayoutCreateModal({
  caseId,
  caseClientId,
  currency,
  outstanding,
  caseLabel,
  onClose,
  onSuccess,
}: PayoutCreateModalProps) {
  // idempotencyKey YAŞAM DÖNGÜSÜ:
  //  - Lazy initializer (genIdempotencyKey FONKSİYON referansı) → MOUNT başına BİR KEZ üretilir
  //    (her render'da değil). Aynı submit/retry boyunca SABİT kalır → aynı payload retry idempotent.
  //  - Bu modal page'de KOŞULLU render edilir ({showPayoutModal && ...}); başarı/iptal sonrası
  //    setShowPayoutModal(false) → UNMOUNT. Bir sonraki "Ödeme Kaydet" → fresh MOUNT → YENİ key.
  //  - Sonuç: aynı sayfa oturumunda ikinci ödeme ESKİ key'i KULLANMAZ → hatalı
  //    IDEMPOTENCY_KEY_CONFLICT ile yanlışlıkla bloke OLMAZ. (kanıt: payout-create-modal-idempotency.test.tsx)
  const [idempotencyKey] = useState<string>(genIdempotencyKey);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [validationError, setValidationError] = useState<string | null>(null);

  const outstandingNum =
    outstanding != null && Number.isFinite(Number(outstanding)) ? Number(outstanding) : null;

  const mutation = useMutation({
    mutationFn: () =>
      clientAccountingApi.createPayout({
        caseId,
        caseClientId,
        amount: amount.replace(',', '.'),
        currency,
        note: note.trim() || undefined,
        idempotencyKey,
      }),
    onSuccess: (result) => onSuccess(result),
  });

  const parsedAmount = Number(amount.replace(',', '.'));
  const amountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const exceedsOutstanding = outstandingNum != null && amountValid && parsedAmount > outstandingNum;

  const goConfirm = () => {
    setValidationError(null);
    if (!amountValid) {
      setValidationError('Geçerli bir pozitif tutar girin.');
      return;
    }
    if (exceedsOutstanding) {
      setValidationError(
        `Tutar, müvekkile borcunu (${formatMoneyString(String(outstandingNum), currency)}) aşamaz.`,
      );
      return;
    }
    setStep('confirm');
  };

  const submitError = mutation.isError ? friendlyError((mutation.error as Error)?.message) : null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            <h3 className="font-semibold">Müvekkile Ödeme Kaydet</h3>
          </div>
          <button onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="text-xs text-gray-500">
            <div>
              Dosya: <span className="text-gray-800">{caseLabel}</span>
            </div>
            <div className="mt-1">
              Müvekkile borç (net):{' '}
              <span className="font-medium text-emerald-700">
                {outstandingNum != null ? formatMoneyString(String(outstandingNum), currency) : '—'}
              </span>
            </div>
          </div>

          {step === 'form' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tutar ({currency})</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="0,00"
                  className="w-full border rounded px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Not (opsiyonel)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              {validationError && (
                <div className="flex items-center gap-2 text-red-600 text-xs">
                  <AlertCircle className="w-4 h-4" />
                  {validationError}
                </div>
              )}
              <p className="text-[11px] text-gray-400">
                Tutarın müvekkile borcu aşıp aşmadığı backend tarafından kesin kontrol edilir.
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={onClose}>
                  Vazgeç
                </Button>
                <Button onClick={goConfirm} disabled={!amountValid || exceedsOutstanding}>
                  Devam
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md bg-gray-50 border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Tutar</span>
                  <span className="font-semibold text-emerald-700">
                    {formatMoneyString(amount.replace(',', '.'), currency)}
                  </span>
                </div>
                {note.trim() && (
                  <div className="flex justify-between mt-1">
                    <span className="text-gray-500">Not</span>
                    <span className="text-gray-800">{note.trim()}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600">
                Bu tutarda müvekkile ödeme kaydı oluşturulacak. Onaylıyor musunuz?
              </p>
              {submitError && (
                <div className="flex items-start gap-2 text-red-600 text-xs">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {submitError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setStep('form')} disabled={mutation.isPending}>
                  Geri
                </Button>
                <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                  {mutation.isPending ? <Spinner className="w-4 h-4" /> : 'Onayla ve Kaydet'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PayoutCreateModal;
