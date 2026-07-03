'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lightbulb, AlertCircle, Plus, Undo2, XCircle, Pencil } from 'lucide-react';
import {
  clientIntelStatementApi,
  type ClientIntelStatement,
  type ClientIntelCategory,
  type ClientIntelStatus,
} from '@/lib/api/client-intel-statement';

/**
 * Client Intake / Müvekkil Analiz 4.7d — "Müvekkil İstihbaratı".
 *
 * 4.7d-1: promote edilen ClientIntelStatement'ları case detayında salt-okuma gösterir.
 * 4.7d-2a: ACTIVE kayıtların yanında inactive kayıtları (RETRACTED/FALSE_POSITIVE/SUPERSEDED)
 *          ayrı "Geçmiş / Pasif Kayıtlar" alanında, soluk + status badge ile gösterir.
 * CLIENT-INTEL-DEBTOR-SURFACE-BUILD: case VEYA debtor scope (mutually exclusive) — gruplama/render
 *          mantığı scope-agnostik olduğundan yeni component YAZILMADI, prop imzası genellendi.
 * CLIENT-INTEL-4.7D-2: lifecycle mutasyonları eklendi (geri çek / yanlış pozitif / düzelt / yeni
 *          ekle). Yalnız ACTIVE kayıtlar retract/false-positive/supersede alabilir (backend guard'ı
 *          ile aynı kural). Create yalnız hem case hem debtor hedefi çözülebiliyorsa gösterilir
 *          (backend her ikisini de zorunlu kılar — bkz caseId/debtorId + createCaseId/createDebtorId).
 *
 * ⛔ SINIRLAR (KORUNUR):
 *  - CAPABILITY backend'de kalır: bu component hiçbir yetki ön-kontrolü YAPMAZ, aksiyon butonları
 *    her zaman render olur; backend 403/400 verirse mesajı olduğu gibi gösterir.
 *  - MUHASEBE DEĞİL: accounting/statement/cari terimi kullanılmaz; finansal görünüm verilmez.
 *  - APPROVAL/PATRON ONAY copy'si kullanılmaz.
 *  - Bu beyanlar müvekkil DECLARED; doğrulanmış kesin bilgi/onay defteri DEĞİL.
 *  - ASSET/CONTACT kategori YOK (4.6c kapsam dışı); DebtorIntelligence/DebtorCommunication kullanılmaz.
 */

const CATEGORY_LABELS: Record<ClientIntelCategory, string> = {
  INCOME_SOURCE: 'Gelir Kaynağı',
  COMMERCIAL_RELATION: 'Ticari İlişki',
  FAMILY_CIRCLE: 'Aile / Yakın Çevre',
  DIGITAL_FOOTPRINT: 'Dijital İz',
  PAYMENT_HISTORY: 'Tahsilat Geçmişi',
  STRATEGY: 'Dosya Stratejisi',
};

const CATEGORY_ORDER: ClientIntelCategory[] = [
  'INCOME_SOURCE',
  'COMMERCIAL_RELATION',
  'FAMILY_CIRCLE',
  'DIGITAL_FOOTPRINT',
  'PAYMENT_HISTORY',
  'STRATEGY',
];

const STATUS_LABEL: Record<ClientIntelStatus, string> = {
  ACTIVE: 'Geçerli',
  RETRACTED: 'Geri alındı',
  FALSE_POSITIVE: 'Yanlış kayıt',
  SUPERSEDED: 'Güncellendi',
};

const STATUS_BADGE: Record<ClientIntelStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  RETRACTED: 'bg-gray-200 text-gray-600',
  FALSE_POSITIVE: 'bg-red-100 text-red-700',
  SUPERSEDED: 'bg-blue-100 text-blue-700',
};

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR');
}

/** inactive kayıtlar için kronolojik sıralama anahtarı (en yeni işlem önce). */
function inactiveTs(r: ClientIntelStatement): string {
  return r.revokedAt || r.supersededAt || r.createdAt || '';
}

function groupByCategory(items: ClientIntelStatement[]): { category: ClientIntelCategory; rows: ClientIntelStatement[] }[] {
  const map = new Map<ClientIntelCategory, ClientIntelStatement[]>();
  for (const it of items) {
    const arr = map.get(it.category) ?? [];
    arr.push(it);
    map.set(it.category, arr);
  }
  const known = CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({ category: c, rows: map.get(c)! }));
  const unknown = [...map.keys()]
    .filter((c) => !CATEGORY_ORDER.includes(c))
    .map((c) => ({ category: c, rows: map.get(c)! }));
  return [...known, ...unknown];
}

function StatusBadge({ status }: { status: ClientIntelStatus }) {
  return (
    <span className={`rounded px-1 py-px text-[9px] font-medium ${STATUS_BADGE[status] ?? 'bg-slate-200 text-slate-600'}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const inputCls =
  'w-full rounded border border-slate-200 px-2 py-1 text-[11px] text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-400';

/** retract / false-positive ortak inline formu — yalnız opsiyonel gerekçe. */
function TransitionInlineForm({
  confirmLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  /** Onay butonunun erişilebilir adı — üstteki toggle butonuyla (aynı satırda görünür) ÇAKIŞMAMALI. */
  confirmLabel: string;
  pending: boolean;
  onSubmit: (note?: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="mt-1 space-y-1 rounded border border-slate-200 bg-white p-1.5">
      <textarea
        className={inputCls}
        rows={2}
        placeholder="Gerekçe (opsiyonel)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
          disabled={pending}
          onClick={() => onSubmit(note.trim() || undefined)}
        >
          {pending ? 'Kaydediliyor…' : confirmLabel}
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
          disabled={pending}
          onClick={onCancel}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/** supersede inline formu — yeni value zorunlu (düzeltme = yeni kayıt), label/note opsiyonel. */
function SupersedeInlineForm({
  initialValue,
  initialLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initialValue: string;
  initialLabel: string;
  pending: boolean;
  onSubmit: (payload: { value: string; label?: string; note?: string }) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [label, setLabel] = useState(initialLabel);
  const [note, setNote] = useState('');
  const isValid = value.trim().length > 0;

  return (
    <div className="mt-1 space-y-1 rounded border border-slate-200 bg-white p-1.5">
      <input
        className={inputCls}
        placeholder="Başlık (opsiyonel)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={pending}
      />
      <textarea
        className={inputCls}
        rows={2}
        placeholder="Yeni bilgi (zorunlu)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      />
      <textarea
        className={inputCls}
        rows={1}
        placeholder="Not (opsiyonel)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
          disabled={pending || !isValid}
          onClick={() => onSubmit({ value: value.trim(), label: label.trim() || undefined, note: note.trim() || undefined })}
        >
          {pending ? 'Kaydediliyor…' : 'Düzelt'}
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
          disabled={pending}
          onClick={onCancel}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

/** yeni istihbarat ekleme formu — kategori + value zorunlu. */
function CreateInlineForm({
  pending,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  onSubmit: (payload: { category: ClientIntelCategory; value: string; label?: string; note?: string }) => void;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<ClientIntelCategory>('STRATEGY');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const isValid = value.trim().length > 0;

  return (
    <div className="mb-2 space-y-1 rounded-md border border-indigo-100 bg-indigo-50/40 p-2">
      <select
        className={inputCls}
        value={category}
        onChange={(e) => setCategory(e.target.value as ClientIntelCategory)}
        disabled={pending}
      >
        {CATEGORY_ORDER.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABELS[c]}
          </option>
        ))}
      </select>
      <input
        className={inputCls}
        placeholder="Başlık (opsiyonel)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        disabled={pending}
      />
      <textarea
        className={inputCls}
        rows={2}
        placeholder="İstihbarat bilgisi (zorunlu)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
      />
      <textarea
        className={inputCls}
        rows={1}
        placeholder="Not (opsiyonel)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={pending}
      />
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="rounded bg-indigo-600 px-2 py-0.5 text-[10px] font-medium text-white disabled:opacity-50"
          disabled={pending || !isValid}
          onClick={() => onSubmit({ category, value: value.trim(), label: label.trim() || undefined, note: note.trim() || undefined })}
        >
          {pending ? 'Ekleniyor…' : 'Ekle'}
        </button>
        <button
          type="button"
          className="rounded px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
          disabled={pending}
          onClick={onCancel}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}

export interface IntelStatementSectionProps {
  caseId?: string;
  debtorId?: string;
  /** Create hedefi (opsiyonel) — verilmezse caseId/debtorId'den fallback alınır. */
  createCaseId?: string;
  createDebtorId?: string;
}

export function IntelStatementSection({ caseId, debtorId, createCaseId, createDebtorId }: IntelStatementSectionProps) {
  const hasCase = !!caseId;
  const hasDebtor = !!debtorId;
  // Tam olarak biri (XOR) verilmeli — ikisi birden veya hiçbiri gelirse sorgu ATILMAZ, guard gösterilir.
  const isValidScope = hasCase !== hasDebtor;

  const queryClient = useQueryClient();
  const queryKey = ['client-intel-statements', hasCase ? 'case' : 'debtor', caseId ?? debtorId ?? null];

  // 4.7d-2a: TÜM statüler (read-only liste). listByCaseAllStatuses/listByDebtorAllStatuses backend
  // default-ACTIVE'i aşar.
  const q = useQuery({
    queryKey,
    queryFn: () =>
      hasCase
        ? clientIntelStatementApi.listByCaseAllStatuses(caseId!)
        : clientIntelStatementApi.listByDebtorAllStatuses(debtorId!),
    enabled: isValidScope,
  });

  // Create hedefi: backend HER İKİSİNİ de zorunlu kılar (route caseId + body debtorId). Görüntüleme
  // scope'undan (caseId/debtorId) fallback alınır; debtor-scope kullanımında createCaseId ile
  // tamamlanır (bkz DebtorDetailDrawer). Case-scope'ta createDebtorId verilmezse create GÖSTERİLMEZ
  // (hangi borçlu belirsiz — yanlış borçluya yazmaktansa gizlemek tercih edildi).
  const effectiveCreateCaseId = createCaseId ?? caseId;
  const effectiveCreateDebtorId = createDebtorId ?? debtorId;
  const canCreate = !!effectiveCreateCaseId && !!effectiveCreateDebtorId;

  const [actionError, setActionError] = useState<string | null>(null);
  const [openAction, setOpenAction] = useState<{ id: string; type: 'retract' | 'false-positive' | 'supersede' } | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const retractMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => clientIntelStatementApi.retract(id, { note }),
    onSuccess: () => {
      setOpenAction(null);
      setActionError(null);
      invalidate();
    },
    onError: (e: any) => setActionError(e?.message || 'Geri çekme başarısız'),
  });

  const falsePositiveMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => clientIntelStatementApi.markFalsePositive(id, { note }),
    onSuccess: () => {
      setOpenAction(null);
      setActionError(null);
      invalidate();
    },
    onError: (e: any) => setActionError(e?.message || 'Yanlış pozitif işaretleme başarısız'),
  });

  const supersedeMut = useMutation({
    mutationFn: ({ id, value, label, note }: { id: string; value: string; label?: string; note?: string }) =>
      clientIntelStatementApi.supersede(id, { value, label, note }),
    onSuccess: () => {
      setOpenAction(null);
      setActionError(null);
      invalidate();
    },
    onError: (e: any) => setActionError(e?.message || 'Düzeltme başarısız'),
  });

  const createMut = useMutation({
    mutationFn: (payload: { category: ClientIntelCategory; value: string; label?: string; note?: string }) =>
      clientIntelStatementApi.create(effectiveCreateCaseId!, { ...payload, debtorId: effectiveCreateDebtorId! }),
    onSuccess: () => {
      setShowCreateForm(false);
      setActionError(null);
      invalidate();
    },
    onError: (e: any) => setActionError(e?.message || 'Ekleme başarısız'),
  });

  const items = q.data ?? [];
  const active = items.filter((r) => r.status === 'ACTIVE');
  const inactive = items
    .filter((r) => r.status !== 'ACTIVE')
    .sort((a, b) => inactiveTs(b).localeCompare(inactiveTs(a)));
  const activeGroups = groupByCategory(active);

  function renderActiveRow(r: ClientIntelStatement) {
    const isOpen = openAction?.id === r.id;
    return (
      <div key={r.id} className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
        {r.label && <div className="text-[11px] font-medium text-gray-600">{r.label}</div>}
        <p className="text-[12px] text-gray-800 whitespace-pre-wrap break-words">{r.value}</p>
        {r.note && <p className="mt-0.5 text-[10px] text-gray-500">Not: {r.note}</p>}
        <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-gray-400">
          <StatusBadge status={r.status} />
          {fmtDate(r.createdAt) && <span>{fmtDate(r.createdAt)}</span>}
        </div>
        <div className="mt-1 flex items-center gap-2.5">
          <button
            type="button"
            className="flex items-center gap-0.5 text-[10px] text-gray-500 hover:text-gray-700"
            onClick={() => setOpenAction(isOpen && openAction?.type === 'retract' ? null : { id: r.id, type: 'retract' })}
          >
            <Undo2 className="h-3 w-3" /> Geri Çek
          </button>
          <button
            type="button"
            className="flex items-center gap-0.5 text-[10px] text-red-600 hover:text-red-800"
            onClick={() => setOpenAction(isOpen && openAction?.type === 'false-positive' ? null : { id: r.id, type: 'false-positive' })}
          >
            <XCircle className="h-3 w-3" /> Yanlış Pozitif
          </button>
          <button
            type="button"
            className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-800"
            onClick={() => setOpenAction(isOpen && openAction?.type === 'supersede' ? null : { id: r.id, type: 'supersede' })}
          >
            <Pencil className="h-3 w-3" /> Yerine Yeni Bilgi Koy
          </button>
        </div>

        {isOpen && openAction?.type === 'retract' && (
          <TransitionInlineForm
            confirmLabel="Onayla"
            pending={retractMut.isPending}
            onSubmit={(note) => retractMut.mutate({ id: r.id, note })}
            onCancel={() => setOpenAction(null)}
          />
        )}
        {isOpen && openAction?.type === 'false-positive' && (
          <TransitionInlineForm
            confirmLabel="Onayla"
            pending={falsePositiveMut.isPending}
            onSubmit={(note) => falsePositiveMut.mutate({ id: r.id, note })}
            onCancel={() => setOpenAction(null)}
          />
        )}
        {isOpen && openAction?.type === 'supersede' && (
          <SupersedeInlineForm
            initialValue={r.value}
            initialLabel={r.label ?? ''}
            pending={supersedeMut.isPending}
            onSubmit={(payload) => supersedeMut.mutate({ id: r.id, ...payload })}
            onCancel={() => setOpenAction(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-3">
      <div className="flex items-center gap-2 mb-1">
        <Lightbulb className="h-4 w-4 text-indigo-600 shrink-0" />
        <h4 className="text-[13px] font-semibold text-gray-800">Müvekkil İstihbaratı</h4>
        {q.isSuccess && active.length > 0 && (
          <span className="ml-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700">
            {active.length}
          </span>
        )}
        {isValidScope && canCreate && !showCreateForm && (
          <button
            type="button"
            className="ml-auto flex items-center gap-0.5 rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
            onClick={() => setShowCreateForm(true)}
          >
            <Plus className="h-3 w-3" /> Yeni İstihbarat Ekle
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        Müvekkil analiz formlarından onaylanıp aktarılan bilgiler burada görüntülenir. Bu beyanlar
        müvekkil tarafından bildirilmiştir; doğrulanmış kesin bilgi değildir.
      </p>

      {actionError && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-2 text-[11px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {actionError}
        </div>
      )}

      {isValidScope && showCreateForm && (
        <CreateInlineForm
          pending={createMut.isPending}
          onSubmit={(payload) => createMut.mutate(payload)}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {!isValidScope ? (
        <div className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-2 text-[11px] text-amber-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> Kullanım hatası: caseId veya debtorId'den tam olarak biri verilmelidir.
        </div>
      ) : q.isLoading ? (
        <p className="text-[11px] text-gray-400 py-3 text-center">Yükleniyor…</p>
      ) : q.isError ? (
        <div className="flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-2 text-[11px] text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> İstihbarat bilgileri yüklenemedi.
        </div>
      ) : active.length === 0 && inactive.length === 0 ? (
        <p className="text-[11px] text-gray-400 py-3 text-center">
          {hasCase ? 'Bu dosya için' : 'Bu borçlu için'} henüz doğrulanmış müvekkil istihbaratı yok.
        </p>
      ) : (
        <div className="space-y-3">
          {/* ACTIVE — kategori bazlı (mevcut görünüm + "Geçerli" badge + lifecycle aksiyonları) */}
          {active.length > 0 ? (
            activeGroups.map((g) => (
              <div key={g.category}>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  {CATEGORY_LABELS[g.category as ClientIntelCategory] ?? g.category}
                </div>
                <div className="space-y-1.5">{g.rows.map(renderActiveRow)}</div>
              </div>
            ))
          ) : (
            <p className="text-[11px] text-gray-400">Geçerli (aktif) müvekkil istihbaratı yok.</p>
          )}

          {/* INACTIVE — "Geçmiş / Pasif Kayıtlar" (soluk, read-only, badge'li; aksiyon YOK — yalnız ACTIVE'e uygulanır) */}
          {inactive.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">
                Geçmiş / Pasif Kayıtlar ({inactive.length})
              </div>
              <div className="space-y-1.5">
                {inactive.map((r) => (
                  <div key={r.id} className="rounded-md border border-slate-100 bg-slate-50/30 px-2.5 py-1.5 opacity-70">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-medium text-gray-500">
                        {CATEGORY_LABELS[r.category] ?? r.category}
                      </span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.label && <div className="text-[11px] font-medium text-gray-500">{r.label}</div>}
                    <p className="text-[12px] text-gray-600 whitespace-pre-wrap break-words">{r.value}</p>
                    {r.lifecycleNote && <p className="mt-0.5 text-[10px] text-gray-500">Gerekçe: {r.lifecycleNote}</p>}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                      {fmtDate(r.revokedAt) && <span>İşlem tarihi: {fmtDate(r.revokedAt)}</span>}
                      {fmtDate(r.supersededAt) && <span>Güncellendi: {fmtDate(r.supersededAt)}</span>}
                      {r.supersededById && <span>Yeni kayıtla güncellendi</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default IntelStatementSection;
