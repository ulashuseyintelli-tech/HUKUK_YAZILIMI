'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Spinner } from '@hukuk/ui';
import { CheckCircle2 } from 'lucide-react';
import {
  clientFinancialDisclosureApi,
  type OfficeDisclosureActionCapabilities,
} from '@/lib/api/client-financial-disclosure';
import { officeApprovalApi } from '@/lib/api/office-approval';

const DISCLOSURE_APPROVAL_ACTION = 'CLIENT_FINANCIAL_DISCLOSURE_APPROVE';
const DISCLOSURE_APPROVAL_TARGET = 'ClientFinancialDisclosureVersion';

type ApprovalAction =
  | { readonly kind: 'request-office' }
  | { readonly kind: 'complete-office' }
  | { readonly kind: 'reconcile-consumed' }
  | { readonly kind: 'request-content'; readonly recipientEmail: string }
  | { readonly kind: 'complete-content' }
  | { readonly kind: 'publish' };

const successMessage: Record<ApprovalAction['kind'], string> = {
  'request-office': 'Ofis onay talebi oluşturuldu.',
  'complete-office': 'Ofis onayı tamamlandı.',
  'reconcile-consumed': 'Kayıtlı onay kararı bildirime uygulandı.',
  'request-content': 'İçerik ve alıcı onaya gönderildi.',
  'complete-content': 'İçerik onayı tamamlandı.',
  publish: 'Yayın ve teslim işlemi tamamlandı.',
};

const errorMessage: Record<ApprovalAction['kind'], string> = {
  'request-office': 'Ofis onay talebi oluşturulamadı.',
  'complete-office': 'Ofis onayı tamamlanamadı.',
  'reconcile-consumed': 'Kayıtlı onay kararı bildirime uygulanamadı.',
  'request-content': 'İçerik onay talebi oluşturulamadı.',
  'complete-content': 'İçerik onayı tamamlanamadı.',
  publish: 'Yayın ve teslim işlemi tamamlanamadı.',
};

/**
 * X1-B04: Görünürlük yalnız PRE01 `actions` projeksiyonundan gelir. Bu bileşen rol
 * veya eligibility türetmez; her komutun canonical yetki ve lifecycle kontrolü backend'dedir.
 */
export function DisclosureApprovalPanel({
  clientId,
  versionId,
  actions,
}: {
  clientId: string;
  versionId: string;
  actions: OfficeDisclosureActionCapabilities;
}) {
  const queryClient = useQueryClient();
  const [recipientEmail, setRecipientEmail] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (action: ApprovalAction) => {
      switch (action.kind) {
        case 'request-office':
          return clientFinancialDisclosureApi.requestOfficeApproval(versionId);
        case 'reconcile-consumed':
          return clientFinancialDisclosureApi.reconcileConsumedOfficeApproval(versionId);
        case 'complete-office': {
          // Inbox yalnız eligible approver'a, kendi talepleri hariç, tenant-scoped kayıt döndürür.
          // ID komut bağlama girdisidir; UI'a render edilmez ve disclosure projection'ına eklenmez.
          const inbox = await officeApprovalApi.getInbox('PENDING_APPROVAL');
          const request = inbox.find(
            (entry) =>
              entry.actionCode === DISCLOSURE_APPROVAL_ACTION &&
              entry.targetType === DISCLOSURE_APPROVAL_TARGET &&
              entry.targetRef === versionId,
          );
          if (!request) throw new Error('Disclosure approval binding unavailable');
          return clientFinancialDisclosureApi.completeOfficeApproval(versionId, request.id);
        }
        case 'request-content':
          return clientFinancialDisclosureApi.requestContentApproval(
            versionId,
            action.recipientEmail,
          );
        case 'complete-content':
          return clientFinancialDisclosureApi.completeContentApproval(versionId);
        case 'publish':
          return clientFinancialDisclosureApi.publish(versionId);
      }
    },
    onMutate: () => {
      setNotice(null);
      setError(null);
    },
    onSuccess: async (_result, action) => {
      setNotice(successMessage[action.kind]);
      if (action.kind === 'request-content') setRecipientEmail('');
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-list', clientId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-detail', clientId, versionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-history', clientId],
        }),
      ]);
    },
    onError: (_cause, action) => {
      // Provider/backend ayrıntısı ve teknik hata kimlikleri office UI'a taşınmaz.
      setError(errorMessage[action.kind]);
    },
  });

  const hasAction =
    actions.canRequestOfficeApproval ||
    actions.canCompleteOfficeApproval ||
    actions.canRequestContentApproval ||
    actions.canCompleteContentApproval ||
    actions.canPublish;
  const pendingKind = mutation.isPending ? mutation.variables?.kind : undefined;

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <CheckCircle2 className="h-4 w-4" aria-hidden /> Onay ve yayın zinciri
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Kullanılabilir işlemler sunucudaki mevcut yetki ve yaşam döngüsü kurallarından gelir.
      </p>

      {!hasAction ? (
        <p className="mt-3 text-sm text-gray-500">Bu sürüm için kullanılabilir işlem bulunmuyor.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {actions.canRequestOfficeApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ kind: 'request-office' })}
          >
            {pendingKind === 'request-office' ? <Spinner className="h-4 w-4" /> : 'Ofis onayına gönder'}
          </Button>
        ) : null}

        {actions.canCompleteOfficeApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ kind: 'complete-office' })}
          >
            {pendingKind === 'complete-office' ? <Spinner className="h-4 w-4" /> : 'Ofis onayını tamamla'}
          </Button>
        ) : null}

        {actions.canReconcileConsumedApproval ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="reconcile-consumed-approval"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ kind: 'reconcile-consumed' })}
          >
            {pendingKind === 'reconcile-consumed' ? (
              <Spinner className="h-4 w-4" />
            ) : (
              'Onay kararını bildirime uygula'
            )}
          </Button>
        ) : null}

        {actions.canRequestContentApproval ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate({ kind: 'request-content', recipientEmail: recipientEmail.trim() });
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block text-gray-500">Onaylanacak alıcı e-postası</span>
              <input
                type="email"
                required
                value={recipientEmail}
                onChange={(event) => setRecipientEmail(event.target.value)}
                className="rounded-md border px-2 py-1.5"
                autoComplete="email"
              />
            </label>
            <Button size="sm" type="submit" disabled={mutation.isPending || !recipientEmail.trim()}>
              {pendingKind === 'request-content' ? <Spinner className="h-4 w-4" /> : 'İçerik onayına gönder'}
            </Button>
          </form>
        ) : null}

        {actions.canCompleteContentApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ kind: 'complete-content' })}
          >
            {pendingKind === 'complete-content' ? <Spinner className="h-4 w-4" /> : 'İçerik onayını tamamla'}
          </Button>
        ) : null}

        {actions.canPublish ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ kind: 'publish' })}
          >
            {pendingKind === 'publish' ? <Spinner className="h-4 w-4" /> : 'Yayınla ve gönder'}
          </Button>
        ) : null}
      </div>

      {notice ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    </Card>
  );
}
