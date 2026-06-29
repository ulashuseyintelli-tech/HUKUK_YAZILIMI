'use client';

/**
 * TM3 Faz B-2 — Müvekkil GENEL Ekstresi (client-level, caseId=null) bölümü. Genel Cari ekranında.
 *
 * Backend Faz B: createClientLevel / listByClient / supersede(client-dalı). Yalnız CLIENT_SPECIFIC
 * hareketler (CASE_CONTEXT YOK). Immutable snapshot; düzeltme = Yenile (supersede). Mahsup YOK.
 *
 * UI HESAP MOTORU DEĞİL: borç/alacak/bakiye backend'den. runningBalance = "Ekstre Net Bakiyesi"
 * (müvekkile özgü net pozisyon) — "genel bakiye/gerçek borç" gibi iddialı isim KULLANILMAZ.
 * Satır tipi etiketleri KİLİTLİ (CLIENT_PAYMENT = "Masraf Tahsil Edildi", müvekkile ödeme DEĞİL).
 *
 * B-2.2 (frontend-only): AccountingPanel kontratı — başlık+Oluştur SABİT, açıklama SABİT (subHeader),
 * ekstre listesi kendi içinde scroll (sticky thead). Modal panel dışında. Mantık/label DEĞİŞMEDİ.
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Spinner, Button } from '@hukuk/ui';
import { FileText, Plus, AlertCircle, X, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import {
  clientStatementApi,
  toDateInput,
  addDaysInput,
  STATEMENT_STATUS_LABELS,
  CLIENT_STATEMENT_LINE_LABELS,
  type ClientStatement,
} from '@/lib/api/client-statement';
import { AccountingPanel } from './AccountingPanel';
import { AccountingTable } from './AccountingTable';

interface ClientLevelStatementSectionProps {
  clientId: string;
  currency: string;
  /** Satır "Dosya" kolonu için (caseId → dosya no); Genel Cari kırılımından, ekstra sorgu yok. */
  cases: { caseId: string; caseNumber: string }[];
  /** Dashboard grid item sizing (min-h-0/min-w-0) için panel köküne geçer. */
  className?: string;
}

type ModalState = null | { mode: 'create' } | { mode: 'supersede'; target: ClientStatement };

export function ClientLevelStatementSection({ clientId, currency, cases, className }: ClientLevelStatementSectionProps) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const caseNo = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cases) m.set(c.caseId, c.caseNumber);
    return m;
  }, [cases]);

  const statementsQ = useQuery({
    queryKey: ['client-level-statements', clientId],
    queryFn: () => clientStatementApi.listByClient(clientId),
    enabled: !!clientId,
  });
  const statements = statementsQ.data ?? [];

  const onDone = () => {
    setModal(null);
    queryClient.invalidateQueries({ queryKey: ['client-level-statements', clientId] });
  };

  return (
    <>
      <AccountingPanel
        ariaLabel="Müvekkil genel ekstresi tablosu"
        className={className}
        title={
          <>
            <FileText className="h-5 w-5 shrink-0 text-gray-600" />
            <h2 className="text-[15px] font-bold text-gray-900">Müvekkil Genel Ekstresi</h2>
            {statementsQ.data && (
              <Badge variant="secondary" className="ml-1">
                {statements.length} aktif
              </Badge>
            )}
            {statementsQ.isFetching && <Spinner className="ml-1 h-4 w-4" />}
          </>
        }
        actions={
          <Button size="sm" onClick={() => setModal({ mode: 'create' })} disabled={!clientId}>
            <Plus className="mr-1 h-4 w-4" /> Genel Ekstre Oluştur
          </Button>
        }
        subHeader={
          <p className="text-[11px] text-gray-400">
            Müvekkilin tüm dosyalarındaki müvekkile özgü hareketlerin immutable dönem snapshot'ı. Dosya geneli
            (borçlu tahsilatı/avans) tutarlar bu ekstreye <strong>girmez</strong>.
          </p>
        }
      >
        {statementsQ.isError ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Genel ekstreler yüklenemedi.</span>
          </div>
        ) : statements.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            Henüz genel ekstre yok. Bir dönem seçip <strong>Genel Ekstre Oluştur</strong> ile immutable snapshot üretebilirsiniz.
          </div>
        ) : (
          <AccountingTable
            head={
              <>
                <th>Dönem</th>
                <th className="text-right">Ekstre Net Bakiyesi</th>
                <th>Durum</th>
                <th className="text-right">İşlem</th>
              </>
            }
          >
            {statements.map((s) => (
              <StatementRow
                key={s.id}
                statement={s}
                currency={currency}
                caseNo={caseNo}
                expanded={detailId === s.id}
                onToggle={() => setDetailId(detailId === s.id ? null : s.id)}
                onRenew={() => setModal({ mode: 'supersede', target: s })}
              />
            ))}
          </AccountingTable>
        )}
      </AccountingPanel>

      {modal && (
        <StatementFormModal
          mode={modal.mode}
          target={modal.mode === 'supersede' ? modal.target : undefined}
          clientId={clientId}
          statements={statements}
          onClose={() => setModal(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function StatementRow({
  statement,
  currency,
  caseNo,
  expanded,
  onToggle,
  onRenew,
}: {
  statement: ClientStatement;
  currency: string;
  caseNo: Map<string, string>;
  expanded: boolean;
  onToggle: () => void;
  onRenew: () => void;
}) {
  const detailQ = useQuery({
    queryKey: ['client-statement', statement.id],
    queryFn: () => clientStatementApi.get(statement.id),
    enabled: expanded,
  });
  const period = `${new Date(statement.periodStart).toLocaleDateString('tr-TR')} – ${new Date(statement.periodEnd).toLocaleDateString('tr-TR')}`;

  return (
    <>
      <tr className="hover:bg-gray-50">
        <td className="px-3 py-2 whitespace-nowrap">{period}</td>
        <td className="px-3 py-2 text-right font-semibold whitespace-nowrap">
          {formatMoneyString(statement.closingBalance, statement.currency || currency)}
        </td>
        <td className="px-3 py-2">
          <Badge variant="secondary">{STATEMENT_STATUS_LABELS[statement.status] ?? statement.status}</Badge>
        </td>
        <td className="px-3 py-2">
          <div className="flex justify-end gap-2">
            <button className="px-2 py-1 border rounded text-xs flex items-center gap-1" onClick={onToggle}>
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />} Görüntüle
            </button>
            {statement.status === 'ACTIVE' && (
              <button className="px-2 py-1 border rounded text-xs text-amber-700" onClick={onRenew}>
                Yenile
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="px-3 py-2 bg-gray-50">
            {detailQ.isLoading ? (
              <Spinner className="w-5 h-5" />
            ) : detailQ.isError ? (
              <div className="flex items-center gap-2 text-red-600 text-xs">
                <AlertCircle className="w-4 h-4" /> Ekstre detayı yüklenemedi.
              </div>
            ) : (
              <StatementDetail statement={detailQ.data!} currency={currency} caseNo={caseNo} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatementDetail({ statement, currency, caseNo }: { statement: ClientStatement; currency: string; caseNo: Map<string, string> }) {
  const lines = statement.lines ?? [];
  const cur = statement.currency || currency;
  return (
    <div className="text-xs">
      <div className="flex flex-wrap gap-4 mb-2 text-gray-600">
        <span>Açılış (devir): <strong>{formatMoneyString(statement.openingBalance, cur)}</strong></span>
        <span>Ekstre Net Bakiyesi: <strong>{formatMoneyString(statement.closingBalance, cur)}</strong></span>
        <span>Üreten: {statement.generatedById}</span>
        <span>{new Date(statement.createdAt).toLocaleString('tr-TR')}</span>
      </div>
      {lines.length === 0 ? (
        <div className="text-gray-500 py-2">Bu dönemde müvekkile özgü hareket yok (sıfır-hareketli ekstre).</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-1 pr-2">Tarih</th>
              <th className="py-1 pr-2">İşlem</th>
              <th className="py-1 pr-2">Dosya</th>
              <th className="py-1 pr-2 text-right">Borç</th>
              <th className="py-1 pr-2 text-right">Alacak</th>
              <th className="py-1 pr-2 text-right">Ekstre Net Bakiyesi</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(l.lineDate).toLocaleDateString('tr-TR')}</td>
                <td className="py-1 pr-2">{CLIENT_STATEMENT_LINE_LABELS[l.lineType] ?? l.lineType}</td>
                <td className="py-1 pr-2 whitespace-nowrap">{l.caseId ? (caseNo.get(l.caseId) ?? '—') : '—'}</td>
                <td className="py-1 pr-2 text-right">{Number(l.debit) ? formatMoneyString(l.debit, cur) : '—'}</td>
                <td className="py-1 pr-2 text-right">{Number(l.credit) ? formatMoneyString(l.credit, cur) : '—'}</td>
                <td className="py-1 pr-2 text-right">{formatMoneyString(l.runningBalance, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatementFormModal({
  mode,
  target,
  clientId,
  statements,
  onClose,
  onDone,
}: {
  mode: 'create' | 'supersede';
  target?: ClientStatement;
  clientId: string;
  statements: ClientStatement[];
  onClose: () => void;
  onDone: () => void;
}) {
  // Default dönem: supersede → target dönemi; create → son periodEnd+1 → bugün / yoksa bugün.
  const defaults = useMemo(() => {
    const today = toDateInput(new Date());
    if (mode === 'supersede' && target) {
      return { start: toDateInput(new Date(target.periodStart)), end: toDateInput(new Date(target.periodEnd)) };
    }
    const lastEnd = statements.length ? statements.map((s) => s.periodEnd).sort().slice(-1)[0] : null;
    const start = lastEnd ? addDaysInput(toDateInput(new Date(lastEnd)), 1) : today;
    return { start, end: today };
  }, [mode, target, statements]);

  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        periodStart: new Date(`${periodStart}T00:00:00.000Z`).toISOString(),
        periodEnd: new Date(`${periodEnd}T23:59:59.000Z`).toISOString(),
        note: note.trim() || undefined,
      };
      if (mode === 'supersede' && target) {
        return clientStatementApi.supersede(target.id, payload);
      }
      return clientStatementApi.createClientLevel(clientId, payload);
    },
    onSuccess: () => onDone(),
  });

  const periodValid = periodStart && periodEnd && periodStart <= periodEnd;

  const submit = () => {
    setValidationError(null);
    if (!periodValid) {
      setValidationError('Başlangıç tarihi bitiş tarihinden sonra olamaz.');
      return;
    }
    mutation.mutate();
  };

  const rawError = mutation.isError ? (mutation.error as Error)?.message ?? '' : '';
  const isConflict = /ekstre zaten var/i.test(rawError);
  const submitError = mutation.isError
    ? isConflict
      ? 'Bu dönem için zaten aktif bir genel ekstre var. Değiştirmek için ilgili ekstrede "Yenile" kullanın.'
      : rawError || 'Genel ekstre oluşturulamadı.'
    : null;

  const title = mode === 'supersede' ? 'Genel Ekstreyi Yenile (Supersede)' : 'Genel Ekstre Oluştur';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <button onClick={onClose} aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {mode === 'supersede' && target && (
            <div className="text-xs text-gray-500">
              Yenilenen genel ekstre dönemi:{' '}
              <span className="text-gray-800">
                {new Date(target.periodStart).toLocaleDateString('tr-TR')} – {new Date(target.periodEnd).toLocaleDateString('tr-TR')}
              </span>{' '}
              — değiştirebilirsiniz.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dönem Başı</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => { setPeriodStart(e.target.value); setValidationError(null); }}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dönem Sonu</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => { setPeriodEnd(e.target.value); setValidationError(null); }}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Not (opsiyonel)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
          </div>

          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 p-2 text-[11px] text-amber-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Genel ekstre kesinleşince <strong>değişmez</strong> (immutable). Yalnız müvekkile özgü hareketleri
              (borç/ödeme/masraf) içerir; dosya geneli tutarlar girmez. Düzeltme için <strong>Yenile</strong> (supersede).
            </span>
          </div>

          <div className="text-[11px] text-gray-400">
            Seçilen dönemde müvekkile özgü hareket yoksa <strong>sıfır-hareketli</strong> genel ekstre oluşturulur.
          </div>

          {validationError && (
            <div className="flex items-center gap-2 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4" />
              {validationError}
            </div>
          )}
          {submitError && (
            <div className="flex items-start gap-2 text-red-600 text-xs">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {submitError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={mutation.isPending}>
              Vazgeç
            </Button>
            <Button onClick={submit} disabled={mutation.isPending || !periodValid}>
              {mutation.isPending ? <Spinner className="w-4 h-4" /> : mode === 'supersede' ? 'Yenile' : 'Oluştur'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClientLevelStatementSection;
