'use client';

import { useEffect, useState } from 'react';
import { clientStatementApi } from '@/lib/api/client-statement';
import { toActionErrorMessage } from '@/lib/action-error';
import { useKeyedSubmitLock } from '@/lib/use-submit-lock';

export interface MonthlyDeliveryRow {
  statementId: string;
  periodKey: string;
  state: string;
  attempts: number;
  nextRetryAt: string | null;
  canRecover: boolean;
}

const LABELS: Record<string, string> = {
  SENT: 'Sağlayıcı kabulü kayıtlı', RECONCILE_SENT: 'Gönderim kanıtı uzlaştırılacak',
  RECONCILIATION_REQUIRED: 'Sonuç belirsiz — elle uzlaştırma gerekli', EXHAUSTED: 'Deneme sınırı doldu',
  RETRY_NOT_DUE: 'Tekrar zamanı bekleniyor', RETRY_ELIGIBLE: 'Güvenli tekrar yapılabilir', IN_PROGRESS: 'İşlem sürüyor',
};

/** Existing ADMIN diagnostic page; action permission remains independently enforced by the server. */
export function MonthlyStatementDeliveryRecovery({ rows, onRefresh }: { rows?: MonthlyDeliveryRow[]; onRefresh: () => Promise<void> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useKeyedSubmitLock();
  useEffect(() => { setMessage(null); }, [rows]);

  const recover = async (row: MonthlyDeliveryRow) => {
    await lock.run(`monthly-delivery:${row.statementId}`, async () => {
      setBusy(row.statementId); setMessage(null);
      try {
        const result = await clientStatementApi.recoverMonthlyDelivery(row.statementId);
        const outcome = !result.enabled ? 'DISABLED' : result.target?.outcome;
        const text = outcome === 'RECONCILED' ? 'Gönderim kanıtı uzlaştırıldı; yeni e-posta gönderilmedi.'
          : outcome === 'DELIVERED' ? 'Sağlayıcı kabulü kaydedildi.'
          : outcome === 'RECONCILIATION_REQUIRED' ? 'Teslim sonucu belirsiz; yeniden gönderim yapılmadı. Elle uzlaştırma gerekli.'
          : outcome === 'FAILED' ? 'Gönderim başarısız; durum kaydı korundu.'
          : outcome === 'DISABLED' ? 'Aylık teslim kapalı; işlem yapılmadı.' : 'İşlem yapılmadı; güncel teslim durumunu kontrol edin.';
        try { await onRefresh(); setMessage(text); }
        catch { setMessage(`${text} Güncel görünüm yenilenemedi; tekrar gönderim başlatmadan listeyi yenileyin.`); }
      } catch (error) { setMessage(toActionErrorMessage(error, 'Aylık teslim işlemi yapılamadı.')); }
      finally { setBusy(null); }
    });
  };

  if (!rows) return <section aria-label="Aylık ekstre teslimleri"><p role="status">Aylık teslim durumu doğrulanamadı.</p></section>;
  return <section className="rounded-xl border bg-white p-4 space-y-3" aria-label="Aylık ekstre teslimleri">
    <h2 className="font-semibold">Aylık PDF teslimleri</h2>
    <p className="text-xs text-gray-600">Belirsiz sonuçlar yeniden gönderilmez. Kayıtlı sağlayıcı kabulü, posta kutusuna teslim kanıtı değildir.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
    {!rows.length && <p className="text-sm text-gray-500">Aylık teslim kaydı yok.</p>}
    {rows.map(row => <div key={row.statementId} className="flex items-center justify-between gap-3 border-t pt-2 text-sm">
      <span>{row.periodKey} · {LABELS[row.state] ?? 'Durum doğrulanamadı'} · {row.attempts} deneme</span>
      {row.canRecover && ['RETRY_ELIGIBLE', 'RECONCILE_SENT'].includes(row.state) && <button type="button" disabled={busy !== null} onClick={() => void recover(row)} className="rounded border px-3 py-1 disabled:opacity-50">
        {busy === row.statementId ? 'İşleniyor…' : row.state === 'RECONCILE_SENT' ? 'Kanıtı uzlaştır' : 'Güvenli tekrar'}
      </button>}
    </div>)}
  </section>;
}
