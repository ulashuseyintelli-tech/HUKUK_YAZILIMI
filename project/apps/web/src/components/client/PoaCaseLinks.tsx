'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type PoaCaseCandidate, type PoaCaseCandidatesResult, type PoaCaseLinkMutationResult, type PoaCaseLinksResult } from '@/lib/api';

interface Props { clientId: string; poaId: string; poaUpdatedAt?: string }
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const isTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const isCase = (value: unknown): value is PoaCaseCandidate => isRecord(value) && typeof value.caseId === 'string' && Boolean(value.caseId) && (value.fileNumber === null || typeof value.fileNumber === 'string');
const uniqueCases = (rows: PoaCaseCandidate[]) => new Set(rows.map(row => row.caseId)).size === rows.length;

function readLinks(value: unknown): PoaCaseLinksResult {
  if (!isRecord(value) || value.visibility !== 'AUTHORIZED_CASES_ONLY' || typeof value.canManageLinks !== 'boolean' ||
      !isTimestamp(value.poaUpdatedAt) || !Array.isArray(value.data) || !value.data.every(row => isCase(row) && isRecord(row) && isTimestamp(row.sourcePoaUpdatedAt) && typeof row.sourceChanged === 'boolean') || !uniqueCases(value.data)) {
    throw new Error('POA_CASE_LINKS_RESPONSE_INVALID');
  }
  return value as unknown as PoaCaseLinksResult;
}

function readCandidates(value: unknown, page: number): PoaCaseCandidatesResult {
  const pagination = isRecord(value) && isRecord(value.pagination) ? value.pagination : null;
  if (!isRecord(value) || !Array.isArray(value.data) || !value.data.every(isCase) || !uniqueCases(value.data) || !pagination ||
      pagination.page !== page || pagination.limit !== 20 || !Number.isSafeInteger(pagination.total) || (pagination.total as number) < 0 ||
      !Number.isSafeInteger(pagination.totalPages) || (pagination.totalPages as number) < 0 || value.data.length > 20) {
    throw new Error('POA_CASE_CANDIDATES_RESPONSE_INVALID');
  }
  return value as unknown as PoaCaseCandidatesResult;
}

function readMutation(value: unknown, caseId: string, linked: boolean): PoaCaseLinkMutationResult {
  if (!isRecord(value) || value.caseId !== caseId || value.linked !== linked || typeof value.changed !== 'boolean' || !isTimestamp(value.sourcePoaUpdatedAt)) {
    throw new Error('POA_CASE_LINK_MUTATION_RESPONSE_INVALID');
  }
  return value as unknown as PoaCaseLinkMutationResult;
}

function errorMessage(error: unknown, writing = false): string {
  const status = isRecord(error) ? error.status : undefined;
  if (status === 403) return writing ? 'Dosya bağlantılarını değiştirme yetkiniz yok.' : 'Dosya bağlantılarını görüntüleme yetkiniz yok.';
  if (status === 409) return 'Vekalet kaynağı değişti. Bağlantıları yenileyip işlemi yeniden değerlendirin.';
  if (status === 404) return 'Vekalet veya dosya erişimi doğrulanamadı.';
  return writing ? 'Dosya bağlantısı işleminin sonucu doğrulanamadı. Listeyi yenileyin.' : 'Dosya bağlantıları okunamadı. Bu sonuç, bağlantı bulunmadığı anlamına gelmez.';
}

/** The key prevents a previous Client/POA/source snapshot from rendering in a new context. */
export function PoaCaseLinks(props: Props) {
  return <PoaCaseLinksView key={JSON.stringify([props.clientId, props.poaId, props.poaUpdatedAt ?? null])} {...props} />;
}

function PoaCaseLinksView({ poaId }: Props) {
  const [links, setLinks] = useState<PoaCaseLinksResult | null>(null);
  const [reading, setReading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<PoaCaseCandidatesResult | null>(null);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const alive = useRef(true);
  const readSequence = useRef(0);
  const candidateSequence = useRef(0);
  const writeInFlight = useRef(false);

  async function loadLinks() {
    const sequence = ++readSequence.current;
    setReading(true); setReadError(null);
    try {
      const result = readLinks(await api.getPoaCaseLinks(poaId));
      if (!alive.current || sequence !== readSequence.current) return;
      setLinks(result); setNeedsRefresh(false); setActionError(null);
      if (!result.canManageLinks) { setPickerOpen(false); setCandidates(null); candidateSequence.current++; }
    } catch (error) {
      if (!alive.current || sequence !== readSequence.current) return;
      setReadError(errorMessage(error)); setNeedsRefresh(true);
      if (isRecord(error) && (error.status === 403 || error.status === 404)) {
        setLinks(null); setPickerOpen(false); setCandidates(null); candidateSequence.current++;
      }
    } finally {
      if (alive.current && sequence === readSequence.current) setReading(false);
    }
  }

  useEffect(() => {
    alive.current = true;
    void loadLinks();
    return () => { alive.current = false; readSequence.current++; candidateSequence.current++; };
    // A context change remounts this keyed view; old reads and writes are ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poaId]);

  async function loadCandidates(page = 1) {
    if (!links?.canManageLinks || reading || needsRefresh || writeInFlight.current) return;
    const sequence = ++candidateSequence.current;
    setCandidateLoading(true); setCandidateError(null); setCandidates(null);
    try {
      const result = readCandidates(await api.getPoaCaseCandidates(poaId, { page, limit: 20, q: search.trim() }), page);
      if (alive.current && sequence === candidateSequence.current) setCandidates(result);
    } catch (error) {
      if (alive.current && sequence === candidateSequence.current) setCandidateError(errorMessage(error));
    } finally {
      if (alive.current && sequence === candidateSequence.current) setCandidateLoading(false);
    }
  }

  async function changeLink(caseId: string, linked: boolean) {
    if (!links?.canManageLinks || reading || needsRefresh || writeInFlight.current) return;
    writeInFlight.current = true; setWriting(true); setNotice(null); setActionError(null);
    candidateSequence.current++; setCandidates(null); setCandidateLoading(false);
    try {
      const input = { expectedPoaUpdatedAt: links.poaUpdatedAt };
      readMutation(await (linked ? api.linkPoaCase(poaId, caseId, input) : api.unlinkPoaCase(poaId, caseId, input)), caseId, linked);
      if (!alive.current) return;
      setNotice(linked ? 'Dosya bağlantısı kaydedildi; işlem kapsamı ayrıca değerlendirilir.' : 'Dosya bağlantısı kaldırıldı; vekalet kaydı ve geçmişi korunur.');
      setPickerOpen(false);
      // A failed refresh cannot turn an already acknowledged write into a failed mutation.
      await loadLinks();
    } catch (error) {
      if (!alive.current) return;
      setActionError(errorMessage(error, true)); setNeedsRefresh(true);
      if (isRecord(error) && (error.status === 403 || error.status === 404)) {
        readSequence.current++; candidateSequence.current++;
        setReading(false); setCandidateLoading(false);
        setLinks(null); setPickerOpen(false); setCandidates(null);
      }
    } finally {
      if (alive.current) { writeInFlight.current = false; setWriting(false); }
    }
  }

  const canWrite = Boolean(links?.canManageLinks && !reading && !readError && !needsRefresh && !writing);
  return <section aria-label="Vekalet dosya bağlantıları" className="mt-3 space-y-2 border-t pt-3 text-xs">
    <h4 className="font-semibold">Dosya bağlantıları</h4>
    <p className="text-gray-600">Yalnız görüntüleme yetkinizin bulunduğu dosya bağlantıları gösterilir. Bağlantı, işlem yetkisi veya hukuki kapsam uygunluğu değildir.</p>
    {notice && <p role="status" className="text-green-800">{notice}</p>}
    {reading && <p role="status">Dosya bağlantıları yükleniyor…</p>}
    {readError && <p role="alert" className="text-red-700">{readError}</p>}
    {actionError && <p role="alert" className="text-red-700">{actionError}</p>}
    {(readError || needsRefresh) && <button type="button" onClick={() => void loadLinks()} disabled={reading || writing} className="text-blue-700 underline">Bağlantıları yenile</button>}
    {links && !reading && <>
      {links.data.length === 0 ? !readError && <p>Bu görünümde dosya bağlantısı bulunmuyor.</p> : <ul className="space-y-2">
        {links.data.map(row => <li key={row.caseId} className="flex items-start justify-between gap-3 rounded border p-2">
          <div><p className="font-medium">{row.fileNumber || 'Dosya numarası yok'}</p>
            {row.sourceChanged && <p className="text-amber-800">Vekalet kaynağı değişti; bu bağlantı yeniden gözden geçirilmelidir.</p>}
          </div>
          {links.canManageLinks && <button type="button" disabled={!canWrite} onClick={() => void changeLink(row.caseId, false)} aria-label={`${row.fileNumber || row.caseId} bağlantısını kaldır`} className="shrink-0 text-red-700 underline">Bağlantıyı kaldır</button>}
        </li>)}
      </ul>}
      {!links.canManageLinks && <p>Dosya bağlantılarını değiştirme yetkiniz yok.</p>}
      {links.canManageLinks && !pickerOpen && <button type="button" disabled={!canWrite} onClick={() => { setPickerOpen(true); void loadCandidates(); }} className="text-blue-700 underline">Mevcut dosyaya bağla</button>}
    </>}
    {pickerOpen && links?.canManageLinks && <div className="space-y-2 rounded border bg-gray-50 p-3">
      <form onSubmit={event => { event.preventDefault(); void loadCandidates(); }} className="flex gap-2">
        <input aria-label="Dosya numarasıyla ara" value={search} disabled={!canWrite} onChange={event => { setSearch(event.target.value); setCandidates(null); setCandidateError(null); candidateSequence.current++; setCandidateLoading(false); }} className="min-w-0 flex-1 rounded border px-2 py-1" />
        <button type="submit" disabled={!canWrite || candidateLoading} className="rounded border px-2 py-1">Ara</button>
      </form>
      {candidateLoading && <p role="status">Dosya adayları yükleniyor…</p>}
      {candidateError && <p role="alert" className="text-red-700">{candidateError}</p>}
      {candidates && <>
        {candidates.data.length === 0 ? <p>Bu aramada görüntülenebilen dosya adayı yok.</p> : <ul className="space-y-1">
          {candidates.data.map(row => <li key={row.caseId} className="flex items-center justify-between gap-2">
            <span>{row.fileNumber || 'Dosya numarası yok'}</span>
            <button type="button" disabled={!canWrite || links.data.some(link => link.caseId === row.caseId)} onClick={() => void changeLink(row.caseId, true)} aria-label={`${row.fileNumber || row.caseId} dosyasını bağla`} className="text-blue-700 underline">Bağla</button>
          </li>)}
        </ul>}
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={!canWrite || candidateLoading || candidates.pagination.page <= 1} onClick={() => void loadCandidates(candidates.pagination.page - 1)}>Önceki sayfa</button>
          <span>Sayfa {candidates.pagination.page} / {Math.max(1, candidates.pagination.totalPages)} · Görüntülenebilen toplam: {candidates.pagination.total}</span>
          <button type="button" disabled={!canWrite || candidateLoading || candidates.pagination.page >= candidates.pagination.totalPages} onClick={() => void loadCandidates(candidates.pagination.page + 1)}>Sonraki sayfa</button>
        </div>
      </>}
    </div>}
  </section>;
}
