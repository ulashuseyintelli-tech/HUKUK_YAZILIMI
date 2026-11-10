'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Lock } from 'lucide-react';
import { Card, Button, Badge, Spinner } from '@hukuk/ui';
import {
  clientComplianceSpecialCategoryApi, clientSpecialCategoryAccessApi, toComplianceError,
  type ClientSpecialCategoryContent, type ClientSpecialCategoryMeta,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';
import { SpecialCategoryAccessPanel } from './SpecialCategoryAccessPanel';

const dt = (v?: string) => v ? new Date(v).toLocaleString('tr-TR') : '—';

export function SpecialCategorySection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [caseId, setCaseId] = useState('');
  const [opened, setOpened] = useState<(ClientSpecialCategoryContent & { scope: string }) | null>(null);
  const scope = clientId + ':' + caseId;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const capabilities = useQuery({
    queryKey: ['client-compliance', 'k73', clientId, caseId],
    queryFn: () => clientSpecialCategoryAccessApi.capabilities(clientId, caseId || undefined),
  });
  const canList = capabilities.isSuccess && !capabilities.isError && capabilities.data.operations.LIST.allowed;
  const canRead = capabilities.isSuccess && !capabilities.isError && capabilities.data.operations.READ.allowed;
  const records = useQuery({
    queryKey: ['client-compliance', 'special-category', clientId, caseId],
    queryFn: () => caseId ? clientComplianceSpecialCategoryApi.listRecords(clientId, caseId) : clientComplianceSpecialCategoryApi.listRecords(clientId),
    enabled: canList,
  });
  const openRecord = useMutation({
    gcTime: 0,
    mutationFn: (input: { id: string; caseId: string; scope: string }) => input.caseId
      ? clientComplianceSpecialCategoryApi.readRecord(input.id, input.caseId)
      : clientComplianceSpecialCategoryApi.readRecord(input.id),
    onSuccess: (record, input) => {
      if (currentScope.current === input.scope && record.clientId === clientId && Date.parse(record.accessExpiresAt) > Date.now()) {
        setOpened({ ...record, scope: input.scope });
        openRecord.reset(); // retain plaintext only in the explicitly opened, expiring view
      }
    },
    onError: () => setOpened(null),
  });
  useEffect(() => { setOpened(null); openRecord.reset(); }, [clientId, caseId]); // actor/object context never carries plaintext forward
  useEffect(() => {
    if (capabilities.isError || records.isError || !canRead) setOpened(null);
  }, [capabilities.isError, records.isError, canRead]);
  useEffect(() => {
    if (!opened) return;
    const remaining = Date.parse(opened.accessExpiresAt) - Date.now();
    if (!(remaining > 0)) { setOpened(null); openRecord.reset(); return; }
    const timer = setTimeout(() => {
      setOpened(null); openRecord.reset();
      void qc.invalidateQueries({ queryKey: ['client-compliance', 'k73', clientId] });
    }, Math.min(remaining, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [opened, clientId, qc]);
  const clear = () => { setOpened(null); openRecord.reset(); };
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold"><Lock className="h-4 w-4" aria-hidden /> Özel Nitelikli Veri (KVKK md.6)</h2>
      <p className="mt-1 text-xs text-gray-500">İçerik varsayılan gizlidir; açma işlemi mevcut yetkiye, kapsama, süreli izne ve audit'e bağlıdır.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="text-sm">Erişim kapsamı
          <select aria-label="Özel veri erişim kapsamı" value={caseId} onChange={e => { clear(); setCaseId(e.target.value); }}>
            <option value="">Müvekkil kapsamı</option>
            {(capabilities.data?.caseScopes ?? []).filter(c => c.caseId !== null).map(c => <option key={c.caseId} value={c.caseId!}>{c.label}</option>)}
          </select>
        </label>
        <Button size="sm" variant="outline" onClick={() => { clear(); void capabilities.refetch(); }}>İzin durumunu yenile</Button>
      </div>
      {capabilities.isLoading || records.isLoading ? <Spinner data-testid="special-loading" /> : null}
      {capabilities.isError ? <ComplianceFailClosed title="Özel veri yetki durumu alınamadı" error={toComplianceError(capabilities.error)} /> : null}
      {capabilities.isSuccess && !canList ? <ComplianceFailClosed title="Özel veri listesi açılamadı" error={{ message: 'Bu kapsam için geçerli süreli listeleme yetkisi yok.' }} /> : null}
      {records.isError ? <ComplianceFailClosed title="Özel nitelikli kayıtlar alınamadı" error={toComplianceError(records.error)} /> : null}
      {canList && records.isSuccess ? (
        records.data.length === 0 ? <p className="mt-2 text-sm text-gray-500">Bu müvekkil için özel nitelikli veri kaydı bulunmuyor.</p> :
        <table className="mt-3 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-2">Kategori</th><th className="py-1 pr-2">Ekleyen</th><th className="py-1 pr-2">Tarih</th><th className="py-1" /></tr></thead>
          <tbody>{records.data.map((r: ClientSpecialCategoryMeta) => (
            <tr key={r.id} className="border-t">
              <td className="py-1.5 pr-2"><Badge>{r.category}</Badge></td>
              <td className="py-1.5 pr-2 font-mono text-xs">{r.createdByUserId ?? '—'}</td><td className="py-1.5 pr-2">{dt(r.createdAt)}</td>
              <td className="py-1.5 text-right"><Button size="sm" variant="outline" disabled={!canRead || openRecord.isPending}
                onClick={() => { setOpened(null); openRecord.mutate({ id: r.id, caseId, scope }); }}>
                <Eye className="mr-1 h-3.5 w-3.5" aria-hidden /> İçeriği aç
              </Button></td>
            </tr>
          ))}</tbody>
        </table>
      ) : null}
      {openRecord.isError ? <div className="mt-2"><ComplianceFailClosed title="İçerik açılamadı" error={toComplianceError(openRecord.error)} /></div> : null}
      {opened && opened.scope === scope && opened.clientId === clientId && canRead && !capabilities.isError && !records.isError && Date.parse(opened.accessExpiresAt) > Date.now() ? (
        <div className="mt-3 rounded-md border border-gray-300 bg-gray-50 p-3" role="status">
          <div className="flex items-center gap-2 text-sm font-medium"><Eye className="h-4 w-4" aria-hidden /> {opened.category} — açık içerik</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{opened.content}</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={clear}>Gizle</Button>
        </div>
      ) : null}
      {capabilities.data?.canManage && !capabilities.isError ? <SpecialCategoryAccessPanel key={clientId} clientId={clientId} onChanged={clear} /> : null}
    </Card>
  );
}
