'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@hukuk/ui';
import { clientSpecialCategoryAccessApi as api, toComplianceError, type K73Operation } from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const operationLabel = { LIST: 'Üstveri listeleme', READ: 'İçerik okuma', CREATE: 'Kayıt oluşturma' };

export function SpecialCategoryAccessPanel({ clientId, onChanged }: { clientId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('');
  const [caseId, setCaseId] = useState('');
  const [operation, setOperation] = useState<K73Operation>('LIST');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const candidates = useQuery({ queryKey: ['client-compliance', 'k73-candidates', clientId, caseId, search],
    queryFn: () => api.candidates(clientId, caseId || undefined, search) });
  const grants = useQuery({ queryKey: ['client-compliance', 'k73-grants', clientId], queryFn: () => api.listGrants(clientId) });
  const changed = () => {
    onChanged();
    void qc.invalidateQueries({ queryKey: ['client-compliance', 'k73-grants', clientId] });
    void qc.invalidateQueries({ queryKey: ['client-compliance', 'k73', clientId] });
    void qc.invalidateQueries({ queryKey: ['client-compliance', 'special-category', clientId] });
  };
  const command = useMutation({
    mutationFn: async (action: { kind: 'grant' | 'revoke' | 'duty'; id?: string }) => {
      if (!reason.trim()) throw new Error('Gerekçe zorunludur.');
      if (action.kind === 'revoke') return api.revoke(action.id!, reason);
      if (!subject) throw new Error('Kullanıcı seçin.');
      if (action.kind === 'duty') return api.dutyChange(subject, reason);
      const start = new Date(from), end = new Date(until);
      if (!from || !until || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
        throw new Error('Açık başlangıç ve sonlu bitiş seçin.');
      }
      return api.grant({ clientId, ...(caseId ? { caseId } : {}), subjectUserId: subject,
        operation, validFrom: start.toISOString(), validUntil: end.toISOString(), reason });
    },
    onSuccess: changed,
  });
  const subjects = new Map<string, string>((candidates.data?.users ?? []).map(u => [u.id, u.label]));
  for (const grant of grants.data ?? []) if (!subjects.has(grant.subjectUserId)) subjects.set(grant.subjectUserId, grant.subjectUserId);
  return (
    <section className="mt-4 space-y-3 border-t pt-3" aria-label="Süreli özel veri yetkileri">
      <h3 className="font-semibold">Süreli özel veri yetkileri</h3>
      <p className="text-xs text-gray-600">Yönetim hakkı içerik okuma hakkı değildir. Kendinize yetki veremezsiniz; eski yetkiler yeniden açılmaz.</p>
      <label className="block text-sm">Kullanıcı ara
        <input aria-label="Kullanıcı ara" className="ml-2 rounded border p-1" value={search} onChange={e => { setSearch(e.target.value); setSubject(''); }} />
      </label>
      <label className="block text-sm">Kullanıcı
        <select aria-label="Özel veri kullanıcısı" className="ml-2 rounded border p-1" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">Seçin</option>{[...subjects].map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
      {candidates.data?.truncated ? <p className="text-xs">Sonuç sınırlı; adıyla arayarak daraltın.</p> : null}
      <label className="block text-sm">Yetki kapsamı
        <select aria-label="Yetki dosya kapsamı" className="ml-2 rounded border p-1" value={caseId} onChange={e => { setCaseId(e.target.value); setSubject(''); }}>
          <option value="">Bu müvekkil — mevcut canonical ilişkilerle sınırlı</option>
          {(candidates.data?.cases ?? []).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <label className="block text-sm">İşlem
        <select aria-label="Özel veri işlemi" className="ml-2 rounded border p-1" value={operation} onChange={e => setOperation(e.target.value as K73Operation)}>
          {(Object.keys(operationLabel) as K73Operation[]).map(op => <option key={op} value={op}>{operationLabel[op]}</option>)}
        </select>
      </label>
      <label className="block text-sm">Başlangıç <input aria-label="Yetki başlangıcı" type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label className="block text-sm">Bitiş <input aria-label="Yetki bitişi" type="datetime-local" value={until} onChange={e => setUntil(e.target.value)} /></label>
      <label className="block text-sm">Gerekçe <input aria-label="Yetki gerekçesi" maxLength={1000} className="ml-2 rounded border p-1" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={command.isPending || candidates.isError || grants.isError} onClick={() => command.mutate({ kind: 'grant' })}>Süreli yetki ver</Button>
        <Button variant="outline" disabled={command.isPending || !subject} onClick={() => command.mutate({ kind: 'duty' })}>Seçilen kişinin görev değişikliği — tüm K7.3 yetkilerini kapat</Button>
      </div>
      {candidates.isError || grants.isError ? <ComplianceFailClosed title="Yetki yönetimi yüklenemedi" error={toComplianceError(candidates.error ?? grants.error)} /> : null}
      {command.isError ? <ComplianceFailClosed title="Yetki işlemi tamamlanmadı" error={toComplianceError(command.error)} /> : null}
      {command.isSuccess ? <p role="status" className="text-sm">Yetki işlemi tamamlandı.</p> : null}
      <ul className="space-y-2 text-xs">
        {(grants.data ?? []).map(grant => (
          <li key={grant.id} className="rounded border p-2">
            {subjects.get(grant.subjectUserId) ?? grant.subjectUserId} — {operationLabel[grant.operation]} — {grant.caseId ?? 'Müvekkil kapsamı'} —
            {new Date(grant.validFrom).toLocaleString('tr-TR')} / {new Date(grant.validUntil).toLocaleString('tr-TR')}
            {grant.revokedAt ? ' — Kapatıldı' : new Date(grant.validUntil) <= new Date() ? ' — Süresi doldu' : ' — Süreye bağlı'}
            {!grant.revokedAt ? <Button size="sm" variant="outline" disabled={command.isPending} onClick={() => command.mutate({ kind: 'revoke', id: grant.id })}>Gerekçeyle geri al</Button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
