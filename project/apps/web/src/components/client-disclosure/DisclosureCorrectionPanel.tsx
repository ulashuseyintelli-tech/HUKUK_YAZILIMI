'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card } from '@hukuk/ui';
import { useAuth } from '@/lib/auth-context';
import { clientFinancialDisclosureApi, type OfficeDisclosureActionCapabilities } from '@/lib/api/client-financial-disclosure';

type Operation = 'CREATE' | 'REVERSE';
type Form = { context: string; operation: Operation; reason: string; confirmed: boolean };

export function DisclosureCorrectionPanel({ clientId, versionId, actions, successorVersionId, onSelectVersion }: {
  clientId: string; versionId: string; actions: OfficeDisclosureActionCapabilities;
  successorVersionId: string | null; onSelectVersion: (id: string) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const context = `${user?.tenantId ?? ''}:${user?.id ?? ''}:${clientId}:${versionId}`;
  const current = useRef(context);
  current.current = context;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [state, setState] = useState<Form | null>(null);
  const [message, setMessage] = useState<{ context: string; error: boolean; text: string } | null>(null);
  const form = state?.context === context ? state : null;
  const active = (key: string) => mounted.current && current.current === key;
  const mutation = useMutation({
    mutationFn: async (command: Form & { clientId: string; versionId: string }) => {
      if (command.operation === 'CREATE') {
        const result = await clientFinancialDisclosureApi.createCorrection(command.clientId, command.versionId, command.reason);
        if (!result?.disclosureVersionId || result.disclosureVersionId === command.versionId) throw new Error('Correction unavailable');
        return { kind: 'CREATE' as const, id: result.disclosureVersionId, replayed: result.replayed };
      }
      const result = await clientFinancialDisclosureApi.reverse(command.versionId, command.reason);
      if (result?.status !== 'REVERSED') throw new Error('Reversal unavailable');
      return { kind: 'REVERSE' as const, id: command.versionId, replayed: result.replayed };
    },
    onSuccess: async (result, command) => {
      await Promise.all(['office-list', 'office-detail', 'office-history', 'office-timeline', 'office-preview'].map(surface =>
        queryClient.invalidateQueries({ queryKey: ['client-financial-disclosures', surface, command.clientId] })));
      if (!active(command.context)) return;
      setState(null);
      setMessage({ context: command.context, error: false, text: result.kind === 'CREATE'
        ? result.replayed ? 'Mevcut düzeltme sürümü açıldı.' : 'Düzeltme sürümü açıldı. Yeni onaylar ve yayın tamamlanana kadar önceki bildirim güncel kalır.'
        : 'Bildirim geri alındı. Bu işlem para iadesi değildir.' });
      if (result.kind === 'CREATE') onSelectVersion(result.id);
    },
    onError: (_error, command) => {
      if (active(command.context)) setMessage({ context: command.context, error: true,
        text: 'İşlem tamamlanamadı. Güncel yetki ve bildirim durumunu kontrol edin.' });
    },
  });
  const authenticated = Boolean(user?.id && user?.tenantId);
  if (!authenticated || (!actions.canReverse && !actions.canCreateCorrection && !successorVersionId)) return null;
  const begin = (operation: Operation) => {
    setMessage(null);
    setState({ context, operation, reason: '', confirmed: false });
  };
  return <Card className="p-4">
    <h2 className="font-semibold">Bildirim düzeltme</h2>
    <div className="mt-3 flex gap-2">
      {actions.canCreateCorrection ? <Button variant="outline" disabled={mutation.isPending} onClick={() => begin('CREATE')}>Düzeltme hazırla</Button> : null}
      {actions.canReverse ? <Button variant="outline" disabled={mutation.isPending} onClick={() => begin('REVERSE')}>Geri al</Button> : null}
      {successorVersionId ? <Button variant="outline" disabled={mutation.isPending} onClick={() => onSelectVersion(successorVersionId)}>Düzeltme sürümünü aç</Button> : null}
    </div>
    {form ? <form className="mt-3 space-y-3" onSubmit={event => {
      event.preventDefault();
      const allowed = form.operation === 'CREATE' ? actions.canCreateCorrection : actions.canReverse;
      if (!allowed || !form.reason.trim() || !form.confirmed || mutation.isPending) return;
      mutation.mutate({ ...form, reason: form.reason.trim(), clientId, versionId });
    }}>
      <label className="block text-sm">Müvekkile gösterilecek gerekçe
        <textarea aria-label="Müvekkile gösterilecek gerekçe" className="mt-1 block w-full rounded border p-2" value={form.reason}
          disabled={mutation.isPending} onChange={event => setState({ ...form, reason: event.target.value })} />
      </label>
      <p className="text-sm text-gray-600">İç not veya strateji yazmayın. Eski bildirim ve mali işlem geçmişi korunur.</p>
      <label className="block text-sm"><input type="checkbox" checked={form.confirmed} disabled={mutation.isPending}
        onChange={event => setState({ ...form, confirmed: event.target.checked })} /> Gerekçenin müvekkile görüneceğini ve işlemin para iadesi olmadığını onaylıyorum.</label>
      <Button type="submit" disabled={mutation.isPending || !form.reason.trim() || !form.confirmed}>
        {form.operation === 'CREATE' ? 'Düzeltme taslağını oluştur' : 'Bildirimi geri al'}
      </Button>
      <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setState(null)}>Vazgeç</Button>
    </form> : null}
    {message?.context === context ? <p className="mt-3 text-sm" role={message.error ? 'alert' : 'status'}>{message.text}</p> : null}
  </Card>;
}
