'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
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

type ScopedApprovalAction = ApprovalAction & {
  readonly clientId: string;
  readonly versionId: string;
  readonly tenantId: string;
  readonly actorUserId: string;
  readonly contextKey: string;
};

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
  const { user } = useAuth();
  const contextKey = `${user?.tenantId}:${user?.id}:${clientId}:${versionId}`;
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const [selection, setSelection] = useState({ contextKey, email: '' });
  const [notice, setNotice] = useState<{ contextKey: string; text: string } | null>(null);
  const [error, setError] = useState<{ contextKey: string; text: string } | null>(null);
  const recipientStage = actions.canRequestContentApproval || actions.canCompleteContentApproval || actions.canPublish;
  const recipients = useQuery({
    queryKey: ['client-financial-disclosures', 'recipient-selection', user?.tenantId, user?.id, clientId, versionId],
    queryFn: () => clientFinancialDisclosureApi.getRecipientSelection(clientId, versionId),
    enabled: !!user && recipientStage,
  });
  const options = recipients.isSuccess ? recipients.data.options : [];
  const recipientEmail = selection.contextKey === contextKey ? selection.email : '';
  const validSelection = recipients.isSuccess && options.some(option => option.email === recipientEmail);
  const selectedRecipient = recipients.isSuccess ? recipients.data.selectedRecipient : null;

  const mutation = useMutation({
    mutationFn: async (action: ScopedApprovalAction) => {
      switch (action.kind) {
        case 'request-office':
          return clientFinancialDisclosureApi.requestOfficeApproval(action.versionId);
        case 'reconcile-consumed':
          return clientFinancialDisclosureApi.reconcileConsumedOfficeApproval(action.versionId);
        case 'complete-office': {
          // Inbox yalnız eligible approver'a, kendi talepleri hariç, tenant-scoped kayıt döndürür.
          // ID komut bağlama girdisidir; UI'a render edilmez ve disclosure projection'ına eklenmez.
          const inbox = await officeApprovalApi.getInbox('PENDING_APPROVAL');
          const request = inbox.find(
            (entry) =>
              entry.actionCode === DISCLOSURE_APPROVAL_ACTION &&
              entry.targetType === DISCLOSURE_APPROVAL_TARGET &&
              entry.targetRef === action.versionId,
          );
          if (!request) throw new Error('Disclosure approval binding unavailable');
          return clientFinancialDisclosureApi.completeOfficeApproval(action.versionId, request.id);
        }
        case 'request-content':
          return clientFinancialDisclosureApi.requestContentApproval(
            action.versionId,
            action.recipientEmail,
          );
        case 'complete-content':
          return clientFinancialDisclosureApi.completeContentApproval(action.versionId);
        case 'publish':
          return clientFinancialDisclosureApi.publish(action.versionId);
      }
    },
    onMutate: () => {
      setNotice(null);
      setError(null);
    },
    onSuccess: async (_result, action) => {
      if (currentContext.current === action.contextKey) {
        if (action.kind === 'publish' && (!_result || typeof _result !== 'object' || !('status' in _result) || _result.status !== 'PUBLISHED')) {
          setError({ contextKey: action.contextKey, text: 'Bildirim yayımlanmadı; teslim durumu denetim panelinden kontrol edilmelidir.' });
        } else {
          setNotice({ contextKey: action.contextKey, text: successMessage[action.kind] });
        }
        if (action.kind === 'request-content') setSelection({ contextKey: action.contextKey, email: '' });
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-list', action.clientId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-detail', action.clientId, action.versionId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'office-history', action.clientId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['client-financial-disclosures', 'recipient-selection', action.tenantId, action.actorUserId, action.clientId, action.versionId],
        }),
      ]);
    },
    onError: (_cause, action) => {
      // Provider/backend ayrıntısı ve teknik hata kimlikleri office UI'a taşınmaz.
      if (currentContext.current === action.contextKey) {
        setError({ contextKey: action.contextKey, text: errorMessage[action.kind] });
      }
    },
  });

  const submit = (action: ApprovalAction) => {
    if (!user) {
      setError({ contextKey, text: 'Oturum bilgisi alınamadı.' });
      return;
    }
    mutation.mutate({ ...action, clientId, versionId, contextKey, tenantId: user.tenantId, actorUserId: user.id });
  };

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

      {recipientStage && (
        <div className="mt-3 text-sm">
          {recipients.isError ? <p role="alert">Müvekkilin alıcı kayıtları yüklenemedi. İşlem tamamlanmadı.</p> :
            recipients.isPending ? <p>Alıcı kayıtları yükleniyor...</p> :
              selectedRecipient ? <p>Onaya bağlı alıcı: {selectedRecipient.email}</p> :
                options.length === 0 ? <p>Müvekkil kayıtlarında seçilebilir e-posta adresi yok.</p> : null}
        </div>
      )}

      {!hasAction ? (
        <p className="mt-3 text-sm text-gray-500">Bu sürüm için kullanılabilir işlem bulunmuyor.</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {actions.canRequestOfficeApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => submit({ kind: 'request-office' })}
          >
            {pendingKind === 'request-office' ? <Spinner className="h-4 w-4" /> : 'Ofis onayına gönder'}
          </Button>
        ) : null}

        {actions.canCompleteOfficeApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending}
            onClick={() => submit({ kind: 'complete-office' })}
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
            onClick={() => submit({ kind: 'reconcile-consumed' })}
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
              if (validSelection) submit({ kind: 'request-content', recipientEmail });
            }}
          >
            <label className="text-sm">
              <span className="mb-1 block text-gray-500">Onaylanacak alıcı e-postası</span>
              <select
                required
                value={recipientEmail}
                onChange={(event) => setSelection({ contextKey, email: event.target.value })}
                className="rounded-md border px-2 py-1.5"
                disabled={mutation.isPending || !recipients.isSuccess}
              >
                <option value="">Müvekkil kaydından alıcı seçin</option>
                {options.map(option => <option key={option.email} value={option.email}>{option.label} — {option.email}</option>)}
              </select>
            </label>
            <Button size="sm" type="submit" disabled={mutation.isPending || !validSelection}>
              {pendingKind === 'request-content' ? <Spinner className="h-4 w-4" /> : 'İçerik onayına gönder'}
            </Button>
          </form>
        ) : null}

        {actions.canCompleteContentApproval ? (
          <Button
            size="sm"
            disabled={mutation.isPending || !selectedRecipient}
            onClick={() => submit({ kind: 'complete-content' })}
          >
            {pendingKind === 'complete-content' ? <Spinner className="h-4 w-4" /> : 'İçerik onayını tamamla'}
          </Button>
        ) : null}

        {actions.canPublish ? (
          <Button
            size="sm"
            disabled={mutation.isPending || !selectedRecipient}
            onClick={() => submit({ kind: 'publish' })}
          >
            {pendingKind === 'publish' ? <Spinner className="h-4 w-4" /> : 'Yayınla ve gönder'}
          </Button>
        ) : null}
      </div>

      {notice?.contextKey === contextKey ? <p role="status" className="mt-3 text-sm text-emerald-700">{notice.text}</p> : null}
      {error?.contextKey === contextKey ? <p role="alert" className="mt-3 text-sm text-red-700">{error.text}</p> : null}
    </Card>
  );
}
