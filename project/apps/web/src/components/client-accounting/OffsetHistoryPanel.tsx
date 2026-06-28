'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Badge, Spinner } from '@hukuk/ui';
import { ArrowLeftRight, AlertCircle, X } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import { clientOffsetApi, friendlyOffsetError, type ClientOffsetRecord } from '@/lib/api/client-offset';
import { AccountingPanel } from './AccountingPanel';

interface OffsetHistoryPanelProps {
  clientId: string;
  currency?: string;
  cases?: Array<{ caseId: string; caseNumber: string }>;
  className?: string;
}

function genIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `offset-rev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * TM3 Faz C C-2b — Mahsup Geçmişi (D6: Genel Ekstre'den AYRI panel). APPLY+REVERSAL listesi.
 * REVERSAL → "İptal edildi" badge. Reverse-edilmiş APPLY → İptal butonu PASİF. Reverse=reason≥10 (PARTNER/MANAGER).
 * UI HESAPLAMAZ; backend otorite. canApply yalnız UX (reverse butonu görünürlüğü); enforcement backend (403).
 */
export function OffsetHistoryPanel({ clientId, currency = 'TRY', cases, className }: OffsetHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [reverseTarget, setReverseTarget] = useState<ClientOffsetRecord | null>(null);

  const listQ = useQuery({
    queryKey: ['client-offset-history', clientId, currency],
    queryFn: () => clientOffsetApi.list(clientId, { currency }),
    enabled: !!clientId,
  });
  const eligQ = useQuery({
    queryKey: ['client-offset-eligibility', clientId, currency],
    queryFn: () => clientOffsetApi.getEligibility(clientId, currency),
    enabled: !!clientId,
  });
  const canApply = eligQ.data?.canApply === true;

  const rows = listQ.data ?? [];
  // Reverse edilmiş APPLY id kümesi (REVERSAL.reversesOffsetId) → İptal butonu pasifleştirme.
  const reversedApplyIds = useMemo(
    () => new Set(rows.filter((r) => r.kind === 'REVERSAL' && r.reversesOffsetId).map((r) => r.reversesOffsetId as string)),
    [rows],
  );
  const caseNo = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cases ?? []) m.set(c.caseId, c.caseNumber);
    return m;
  }, [cases]);
  const label = (caseId: string) => caseNo.get(caseId) || `${caseId.slice(0, 6)}…`;

  function onReversed() {
    ['client-offset-history', 'client-offset-eligibility', 'client-accounting-summary', 'client-cari-movements',
      'client-level-statements', 'client-accounting-outstanding'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
    setReverseTarget(null);
  }

  return (
    <>
      <AccountingPanel
        ariaLabel="Mahsup geçmişi tablosu"
        className={className}
        title={
          <>
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-indigo-600" />
            <h2 className="text-[15px] font-bold text-gray-900">Mahsup Geçmişi</h2>
            <Badge variant="secondary" className="ml-1">{rows.length}</Badge>
            {(listQ.isFetching || eligQ.isFetching) && <Spinner className="ml-1 h-4 w-4" />}
          </>
        }
        footer={<p className="text-[11px] text-gray-400">Mahsup = nakit hareketsiz; net pozisyon değişmez. İptal yalnız Partner/Manager.</p>}
      >
        {listQ.isLoading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : listQ.isError ? (
          <div className="px-4 py-6 text-center text-sm text-red-600">Mahsup geçmişi alınamadı.</div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500">Henüz mahsup yok.</div>
        ) : (
          <table className="w-full text-[13px] tabular-nums [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2">
            <thead className="sticky top-0 z-10 bg-gray-50 [&_th]:font-semibold">
              <tr className="border-b text-left">
                <th className="whitespace-nowrap">Tarih</th>
                <th>Alacak (Payable)</th>
                <th>Masraf (Expense)</th>
                <th className="text-right">Tutar</th>
                <th>Durum</th>
                <th className="text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => {
                const isReversal = r.kind === 'REVERSAL';
                const alreadyReversed = r.kind === 'APPLY' && reversedApplyIds.has(r.id);
                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${isReversal ? 'bg-slate-50/50' : ''}`}>
                    <td className="whitespace-nowrap text-gray-600">{new Date(r.createdAt).toLocaleDateString('tr-TR')}</td>
                    <td className="whitespace-nowrap">{label(r.payableCaseId)}</td>
                    <td className="whitespace-nowrap">{label(r.expenseCaseId)}</td>
                    <td className="text-right font-semibold">{formatMoneyString(r.amount, r.currency)}</td>
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
            </tbody>
          </table>
        )}
      </AccountingPanel>

      {reverseTarget && (
        <ReverseModal
          offset={reverseTarget}
          currency={currency}
          onClose={() => setReverseTarget(null)}
          onReversed={onReversed}
        />
      )}
    </>
  );
}

function ReverseModal({ offset, currency, onClose, onReversed }: {
  offset: ClientOffsetRecord; currency: string; onClose: () => void; onReversed: () => void;
}) {
  const [reason, setReason] = useState('');
  const [idempotencyKey] = useState<string>(genIdempotencyKey); // mount başına tek key (retry-safe)
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
