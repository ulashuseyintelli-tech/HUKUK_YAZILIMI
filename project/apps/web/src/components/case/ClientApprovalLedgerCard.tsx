'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { clientApprovalApi, type ClientApprovalStatus } from '@/lib/api/client-approval';

const STATUS: Record<ClientApprovalStatus, string> = {
  DRAFT: 'Taslak', SENT: 'Gönderim kaydı', APPROVED: 'Onay kaydı', REJECTED: 'Ret kaydı', EXPIRED: 'Süresi dolmuş', CANCELLED: 'İptal kaydı',
};
const EVENT = { CREATED: 'Oluşturuldu', SENT: 'Gönderim kaydı', APPROVED: 'Onay kaydı', REJECTED: 'Ret kaydı', CANCELLED: 'İptal edildi', EXPIRED: 'Süresi doldu' };
const SUBJECT = { EXPENSE_REQUEST: 'Masraf talebi', OPERATION: 'İşlem', OTHER: 'Diğer' };
const fmt = (value: string | null) => value ? new Date(value).toLocaleString('tr-TR') : 'Kayıt yok';
const actor = (value: string | null) => value?.trim() ? `İç hesap referansı: ${value}` : 'İşleyen hesap bilgisi yok';

interface Props { caseId: string; clients?: readonly { id: string; name: string }[] }

function LedgerRead({ caseId, clients = [] }: Props) {
  const { user, loading } = useAuth();
  // Partition by the actual session actor as well as tenant/case; none of these grant access.
  const context = [user?.tenantId, user?.id, user?.role, caseId];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['client-approval-ledger', ...context],
    queryFn: () => clientApprovalApi.list(caseId, user!.tenantId),
    enabled: !loading && Boolean(user?.id && user.tenantId && caseId),
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });
  const freshList = list.isSuccess && !list.isFetching;
  const selected = freshList ? list.data.find(row => row.id === selectedId) : undefined;
  const detail = useQuery({
    queryKey: ['client-approval-ledger-detail', ...context, selected?.id, selected?.clientId],
    queryFn: () => clientApprovalApi.detail(selected!, user!.tenantId),
    enabled: Boolean(selected), retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always',
  });
  if (loading) return <p role="status">Oturum doğrulanıyor…</p>;
  if (!user?.id || !user.tenantId) return <p role="alert">Kayıtlar için geçerli personel oturumu gerekiyor.</p>;
  if (list.isFetching || list.isPending) return <p role="status">Onay defteri yükleniyor…</p>;
  if (!freshList) return <p role="alert">Onay defteri okunamadı. Yetki veya dosya kapsamı doğrulanamadı.</p>;
  if (!list.data.length) return <p>Bu dosyada görüntülenebilen onay kaydı bulunmuyor.</p>;
  const current = selected && detail.isSuccess && !detail.isFetching ? detail.data : null;
  return <div className="space-y-3">
    <ul className="space-y-2">
      {list.data.map(row => <li key={row.id} className="rounded border border-slate-200 p-2">
        <button type="button" className="text-left text-blue-700 underline" aria-pressed={selectedId === row.id} onClick={() => setSelectedId(row.id)}>
          {row.title || row.subjectLabel || SUBJECT[row.subjectType]} — {STATUS[row.status]}
        </button>
        <p>{clients.find(client => client.id === row.clientId)?.name || 'Müvekkil adı bu görünümde yok'}</p>
        <p>Oluşturulma: {fmt(row.createdAt)} · Kayıt kanalı: {row.channel}</p>
      </li>)}
    </ul>
    {selected && <section aria-label="Onay kaydı ayrıntısı" className="space-y-2 rounded border border-slate-200 p-3">
      {detail.isFetching || detail.isPending ? <p role="status">Kayıt geçmişi yükleniyor…</p> : !current ?
        <p role="alert">Kayıt ayrıntısı okunamadı. Yetki veya dosya kapsamı doğrulanamadı.</p> : <>
          <h3 className="font-semibold">{current.title || current.subjectLabel || SUBJECT[current.subjectType]}</h3>
          <p>Defter durumu: {STATUS[current.status]} · Kayıt kanalı: {current.channel}</p>
          <p>{current.description || 'Açıklama kaydı yok'}</p>
          <p>Talebi kaydeden: {actor(current.requestedById)}</p>
          <p>Karar alanı: {current.decision === 'APPROVE' ? 'Onay' : current.decision === 'REJECT' ? 'Ret' : 'Kayıt yok'}</p>
          <p>Karar notu: {current.decisionNote || 'Kayıt yok'}</p>
          <p>Gönderim: {fmt(current.sentAt)} · Karar: {fmt(current.decidedAt)} · Son geçerlilik: {fmt(current.expiresAt)}</p>
          <h4 className="font-semibold">Olay geçmişi</h4>
          {!current.events.length ? <p>Olay kaydı bulunmuyor.</p> : <ol className="space-y-2">{current.events.map(event => <li key={event.id}>
            <p>{EVENT[event.eventType]} · {fmt(event.createdAt)} · {actor(event.byUserId)}</p>
            <p>{event.fromStatus ? STATUS[event.fromStatus] : 'Önceki durum kaydı yok'} → {STATUS[event.toStatus]}</p>
            {event.note && <p>{event.note}</p>}
          </li>)}</ol>}
        </>}
    </section>}
  </div>;
}

/** CaseDetailPage consumer. Mounts reads only on explicit expansion; never sends or records a decision. */
export function ClientApprovalLedgerCard(props: Props) {
  const [open, setOpen] = useState(false);
  return <section className="space-y-3 rounded border border-slate-200 bg-white p-3 text-sm" aria-label="Müvekkil onay defteri">
    <button type="button" className="font-semibold" aria-expanded={open} onClick={() => setOpen(value => !value)}>Müvekkil onay defteri</button>
    {open && <>
      <p className="rounded bg-amber-50 p-2 text-amber-900">Bu defter personelin kaydettiği talep ve işlem geçmişidir. PORTAL kanal etiketi, doğrulanmış müvekkil kimliği veya müvekkilin bizzat karar verdiği anlamına gelmez. Gönderim kaydı teslim kanıtı değildir; kayıtlar ödeme ya da işlem yetkisi vermez.</p>
      <LedgerRead key={props.caseId} {...props} />
    </>}
  </section>;
}
