'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nativeStatementApi, type NativeStatementSet } from '@/lib/api/client-statement-native';
import { formatMoneyString } from '@/lib/api/client-accounting';
import { turkeyDayStartIso, turkeyDayEndIso } from '@/lib/financial-statement-period';
import { turkeyCalendarDate } from '@/lib/turkey-calendar';

/** Separate E2 set surface. Legacy TRY statements, Generic Cari and H6 activation stay unchanged. */
export function NativeClientStatementSection({ clientId }: { clientId: string }) {
  const cache = useQueryClient();
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [month, setMonth] = useState(turkeyCalendarDate(new Date()).slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [voidNote, setVoidNote] = useState('');
  const query = useQuery({ queryKey: ['native-client-statements', clientId], queryFn: () => nativeStatementApi.list(clientId), enabled: !!clientId, retry: false });
  const sets = query.data?.filter(s => s.clientId === clientId) ?? [];

  async function act(run: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('');
    try {
      const result = await run() as Partial<NativeStatementSet> | null;
      if (!active.current) return;
      setMessage(result?.artifactOutcome === 'FAILED'
        ? 'Belge seti kaydedildi; PDF seti hazır değil. Gönderim yapılmadı.' : success);
      await cache.invalidateQueries({ queryKey: ['native-client-statements', clientId] });
    } catch (error: any) {
      if (!active.current) return;
      setMessage(error?.status === 403 || error?.status === 404 ? 'Bu işlem veya belge kapsamına erişilemiyor.'
        : error?.status === 409 ? 'İşlem tamamlanamadı: belge, kaynak veya teslim durumu uygun değil.' : 'İşlem tamamlanamadı.');
    } finally { if (active.current) setBusy(false); }
  }

  async function create() {
    if (!/^\d{4}-\d{2}$/.test(month)) { setMessage('Geçerli ay seçin.'); return; }
    const [year, value] = month.split('-').map(Number);
    if (value < 1 || value > 12) { setMessage('Geçerli ay seçin.'); return; }
    const last = new Date(Date.UTC(year, value, 0)).getUTCDate();
    await act(() => nativeStatementApi.create(clientId, { periodStart: turkeyDayStartIso(`${month}-01`), periodEnd: turkeyDayEndIso(`${month}-${last}`) }), 'Para birimi başına belge seti oluşturuldu. Gönderim başlatılmadı.');
  }

  async function download(set: NativeStatementSet, currency: string) {
    await act(async () => {
      const blob = await nativeStatementApi.pdf(set.id, currency);
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `ekstre-${currency}.pdf`;
      anchor.click(); URL.revokeObjectURL(url);
    }, 'PDF indirildi.');
  }

  return <section aria-label="Para birimi başına ekstre setleri" className="mt-4 rounded border border-gray-200 p-3 text-sm">
    <h3 className="font-semibold">Para birimi başına ekstre setleri</h3>
    <p className="mb-2 text-xs text-gray-600">Tutarlar kendi para biriminde ayrı belgelerde gösterilir. Kur çevrimi ve ortak toplam yoktur. Oluşturma e-posta göndermez.</p>
    <label>Ekstre ayı <input aria-label="Ekstre ayı" type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={busy} /></label>
    <button type="button" className="ml-2 rounded border px-2 py-1" disabled={busy || !clientId} onClick={() => void create()}>Belge seti oluştur</button>
    {message && <p role="status" className="my-2">{message}</p>}
    {query.isError ? <p role="alert">Belge setleri yüklenemedi. Erişim ve bağlantı durumunu kontrol edin.</p>
      : query.isLoading ? <p>Belge setleri yükleniyor…</p> : !sets.length ? <p>Henüz belge seti yok.</p>
        : sets.map(set => <article key={set.id} className="mt-3 border-t pt-2">
          <p>{new Date(set.periodStart).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} – {new Date(set.periodEnd).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })} · {set.status === 'ACTIVE' ? 'Geçerli' : set.status === 'VOID' ? 'Geçersiz' : 'Yenilenmiş'} · {set.memberCount} belge</p>
          <p className="text-xs text-gray-500">Kaynak kesimi: {new Date(set.sourceCutAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>
          {Date.parse(set.sourceCutAt) < Date.parse(set.periodEnd) && <p>Bu set dönem kapanmadan oluşturuldu. Aylık teslim için dönem kapandıktan sonra seti yenileyin; otomatik yenileme veya gönderim yapılmaz.</p>}
          {set.artifactOutcome === 'FAILED' && <p>PDF seti henüz tamamlanmadı; gönderim kanıtı değildir.</p>}
          {set.deliveries?.[0] && <p>Aylık teslim: {set.deliveries[0].status === 'SENT' ? 'Gönderildi' : set.deliveries[0].status === 'FAILED' ? 'Başarısız' : 'Bekliyor / sonuç uzlaştırılmalı'} · Deneme: {set.deliveries[0].attempts}</p>}
          {set.documents.map(doc => <div key={doc.currency} className="my-1">
            <strong>{doc.currency}</strong> · Açılış: {formatMoneyString(doc.render.openingBalance, doc.currency)} · Ekstre net bakiyesi: {formatMoneyString(doc.render.closingBalance, doc.currency)}
            <button type="button" className="ml-2 underline" disabled={busy || set.status !== 'ACTIVE'} onClick={() => void download(set, doc.currency)}>{doc.currency} PDF</button>
          </div>)}
          <button type="button" className="underline" onClick={() => setExpanded(expanded === set.id ? null : set.id)}>Satırları göster / gizle</button>
          {expanded === set.id && set.documents.map(doc => <table key={doc.currency} aria-label={`${doc.currency} ekstre satırları`} className="my-2 w-full text-xs">
            <caption>{doc.currency}</caption><thead><tr><th>Tarih</th><th>Dosya</th><th>Açıklama</th><th>Borç</th><th>Alacak</th><th>Bakiye</th></tr></thead>
            <tbody>{doc.render.lines.map((line, i) => <tr key={i}><td>{new Date(line.lineDate).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td>{line.fileReference?.value ?? '—'}</td>
              <td>{line.label}{line.isInformational ? ' (Bilgi — bakiyeye dahil değil)' : ''}{line.informationalAmount ? `: ${formatMoneyString(line.informationalAmount, doc.currency)}` : ''} {line.note}</td>
              <td>{formatMoneyString(line.debit, doc.currency)}</td><td>{formatMoneyString(line.credit, doc.currency)}</td><td>{formatMoneyString(line.runningBalance, doc.currency)}</td></tr>)}</tbody></table>)}
          {set.status === 'ACTIVE' && <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="rounded border px-2" disabled={busy} onClick={() => void act(() => nativeStatementApi.supersede(set.id), 'Belge seti bütünüyle yenilendi.')}>Seti yenile</button>
            <input aria-label="Set geçersiz kılma gerekçesi" placeholder="Geçersiz kılma gerekçesi" maxLength={500} value={voidNote} onChange={e => setVoidNote(e.target.value)} />
            <button type="button" className="rounded border px-2" disabled={busy || !voidNote.trim()} onClick={() => void act(() => nativeStatementApi.void(set.id, voidNote), 'Belge seti geçersiz kılındı; geçmiş korundu.')}>Seti geçersiz kıl</button>
            <button type="button" className="rounded border px-2" disabled={busy || !set.deliveries?.length} onClick={() => void act(async () => {
              const result = await nativeStatementApi.retry(set.id);
              if (!result.enabled || !result.target || !['DELIVERED', 'RECONCILED'].includes(result.target.outcome)) throw new Error('Teslim tamamlanmadı');
            }, 'Aylık teslimin kayıtlı sonucu doğrulandı.')}>Kayıtlı aylık teslimi uzlaştır / tekrar dene</button>
          </div>}
        </article>)}
  </section>;
}
