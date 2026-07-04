'use client';

/**
 * TM3 Faz 7-E — Müvekkil Ekstresi bölümü (liste + Oluştur/Yenile + detay).
 *
 * Ekstre = IMMUTABLE snapshot (backend #564). create()/supersede() MUTATION; düzeltme = Yenile (supersede).
 * Aynı dönem için tek ACTIVE (backend guard + advisory-lock) → "Oluştur" çakışırsa "Yenile" önerilir.
 * Preview YOK: kullanıcı create öncesi sayfadaki 5 kartı canlı görür; create o dönemi DONDURUR.
 */

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Spinner, Button } from '@hukuk/ui';
import { FileText, Plus, AlertCircle, X, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { formatMoneyString } from '@/lib/api/client-accounting';
import {
  clientStatementApi,
  toDateInput,
  addDaysInput,
  STATEMENT_STATUS_LABELS,
  type ClientStatement,
} from '@/lib/api/client-statement';

interface StatementSectionProps {
  caseId: string;
  clientId: string;
  currency: string;
  caseOpenedAt: string | null;
}

type ModalState = null | { mode: 'create' } | { mode: 'supersede'; target: ClientStatement };

export function StatementSection({ caseId, clientId, currency, caseOpenedAt }: StatementSectionProps) {
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<ModalState>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const statementsQ = useQuery({
    queryKey: ['client-statements', caseId],
    queryFn: () => clientStatementApi.list(caseId),
    enabled: !!caseId,
  });

  const statements = statementsQ.data ?? [];

  const onDone = () => {
    setModal(null);
    queryClient.invalidateQueries({ queryKey: ['client-statements', caseId] });
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-gray-600" />
          <h2 className="font-medium text-gray-900">Müvekkil Ekstresi</h2>
          {statementsQ.data && (
            <Badge variant="secondary" className="ml-1">
              {statements.length} aktif
            </Badge>
          )}
          {statementsQ.isFetching && <Spinner className="w-4 h-4 ml-1" />}
        </div>
        <Button size="sm" onClick={() => setModal({ mode: 'create' })} disabled={!caseId || !clientId}>
          <Plus className="w-4 h-4 mr-1" /> Ekstre Oluştur
        </Button>
      </div>

      {statementsQ.isError ? (
        <div className="flex items-center gap-2 text-red-600 text-sm py-4">
          <AlertCircle className="w-4 h-4" />
          <span>Ekstreler yüklenemedi.</span>
        </div>
      ) : statements.length === 0 ? (
        <div className="text-sm text-gray-500 py-6 text-center">
          Henüz ekstre oluşturulmamış. Bir dönem seçip <strong>Ekstre Oluştur</strong> ile immutable snapshot üretebilirsiniz.
        </div>
      ) : (
        <div className="overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b text-left">
                <th className="px-3 py-2">Dönem</th>
                <th className="px-3 py-2 text-right">Kapanış Bakiyesi</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {statements.map((s) => (
                <StatementRow
                  key={s.id}
                  statement={s}
                  currency={currency}
                  expanded={detailId === s.id}
                  onToggle={() => setDetailId(detailId === s.id ? null : s.id)}
                  onRenew={() => setModal({ mode: 'supersede', target: s })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <StatementFormModal
          mode={modal.mode}
          target={modal.mode === 'supersede' ? modal.target : undefined}
          caseId={caseId}
          clientId={clientId}
          currency={currency}
          caseOpenedAt={caseOpenedAt}
          statements={statements}
          onClose={() => setModal(null)}
          onDone={onDone}
        />
      )}
    </Card>
  );
}

function StatementRow({
  statement,
  currency,
  expanded,
  onToggle,
  onRenew,
}: {
  statement: ClientStatement;
  currency: string;
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
        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">
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
              <StatementDetail statement={detailQ.data!} currency={currency} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function StatementDetail({ statement, currency }: { statement: ClientStatement; currency: string }) {
  const lines = statement.lines ?? [];
  return (
    <div className="text-xs">
      <div className="flex flex-wrap gap-4 mb-2 text-gray-600">
        <span>Açılış: <strong>{formatMoneyString(statement.openingBalance, statement.currency || currency)}</strong></span>
        <span>Kapanış: <strong>{formatMoneyString(statement.closingBalance, statement.currency || currency)}</strong></span>
        <span>Üreten: {statement.generatedById}</span>
        <span>{new Date(statement.createdAt).toLocaleString('tr-TR')}</span>
      </div>
      {lines.length === 0 ? (
        <div className="text-gray-500 py-2">Bu dönemde hareket yok (sıfır-hareketli ekstre).</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-1 pr-2">Tarih</th>
              <th className="py-1 pr-2">Tür</th>
              <th className="py-1 pr-2 text-right">Borç</th>
              <th className="py-1 pr-2 text-right">Alacak</th>
              <th className="py-1 pr-2 text-right">Bakiye</th>
              <th className="py-1">Not</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="py-1 pr-2 whitespace-nowrap">{new Date(l.lineDate).toLocaleDateString('tr-TR')}</td>
                <td className="py-1 pr-2">{l.lineType}</td>
                <td className="py-1 pr-2 text-right">{Number(l.debit) ? formatMoneyString(l.debit, currency) : '—'}</td>
                <td className="py-1 pr-2 text-right">{Number(l.credit) ? formatMoneyString(l.credit, currency) : '—'}</td>
                <td className="py-1 pr-2 text-right">{formatMoneyString(l.runningBalance, currency)}</td>
                <td className="py-1 text-gray-600">{l.note ?? '—'}</td>
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
  caseId,
  clientId,
  currency,
  caseOpenedAt,
  statements,
  onClose,
  onDone,
}: {
  mode: 'create' | 'supersede';
  target?: ClientStatement;
  caseId: string;
  clientId: string;
  currency: string;
  caseOpenedAt: string | null;
  statements: ClientStatement[];
  onClose: () => void;
  onDone: () => void;
}) {
  // Default period: supersede → target dönemi korunur; create → son periodEnd+1 → bugün / yoksa dosya açılışı → bugün.
  const defaults = useMemo(() => {
    const today = toDateInput(new Date());
    if (mode === 'supersede' && target) {
      return { start: toDateInput(new Date(target.periodStart)), end: toDateInput(new Date(target.periodEnd)) };
    }
    const lastEnd = statements.length
      ? statements.map((s) => s.periodEnd).sort().slice(-1)[0]
      : null;
    const start = lastEnd
      ? addDaysInput(toDateInput(new Date(lastEnd)), 1)
      : caseOpenedAt
        ? toDateInput(new Date(caseOpenedAt))
        : today;
    return { start, end: today };
  }, [mode, target, statements, caseOpenedAt]);

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
      return clientStatementApi.create(caseId, { clientId, ...payload });
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
  const isConflict = /aktif ekstre zaten var/i.test(rawError);
  const submitError = mutation.isError
    ? isConflict
      ? 'Bu dönem için zaten aktif bir ekstre var. Değiştirmek için ilgili ekstrede "Yenile" kullanın.'
      : rawError || 'Ekstre oluşturulamadı.'
    : null;

  const title = mode === 'supersede' ? 'Ekstreyi Yenile (Supersede)' : 'Ekstre Oluştur';

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
              Yenilenen ekstre dönemi:{' '}
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

          {/* immutable uyarısı (her zaman) */}
          <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-100 p-2 text-[11px] text-amber-800">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Ekstre kesinleşince <strong>değişmez</strong> (immutable snapshot). Düzeltme için yeni ekstre üretilir
              (<strong>Yenile</strong> = supersede; eski ekstre "Yenilendi" olarak kalır).
            </span>
          </div>

          {/* boş-ekstre uyarısı (preview yok → statik bilgi) */}
          <div className="text-[11px] text-gray-400">
            Seçilen dönemde cari hareket yoksa <strong>sıfır-hareketli</strong> ekstre oluşturulur (meşru tarihsel kayıt).
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

export default StatementSection;
