'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Ban,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Info,
  Loader2,
  Mail,
  ShieldAlert,
  UserRound,
} from 'lucide-react';
import { api, type ClientActionCatalogItem, type ClientOperatingSnapshot, type ClientWorkspaceCreateAndDeliverResult, type ClientWorkspaceDocumentRequestCode, type ClientWorkspaceDocumentRequestResult, type ClientWorkspacePoaReminderResult, type ClientWorkspaceTemplateNotificationCode, type ClientWorkspaceTemplateNotificationResult, type CreateClientWorkspaceIntakeLinkInput, type CreateIntakeLinkResult, type IntakeFieldCategory } from '@/lib/api';

interface ClientActionsTabProps {
  clientId: string;
  onNavigateActivity?: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

const CATEGORY_LABELS: Record<ClientActionCatalogItem['category'], string> = {
  intake: 'Intake',
  poa: 'Vekalet',
  notification: 'Bildirim',
  document: 'Belge',
  contact: 'İletişim',
  case: 'Dosya',
  activity: 'Aktivite',
};

const ACTION_LABELS: Partial<Record<ClientActionCatalogItem['key'], string>> = {
  'contact.update_missing_info': 'İletişim bilgilerini düzenle',
  'intake.link.create': 'Intake linki oluştur',
  'intake.link.send': 'Intake linki gönder',
  'poa.reminder.send': 'Vekalet hatırlatması gönder',
  'notification.template.send': 'Sablon bildirim gonder',
  'document.request.send': 'Belge talebi gonder',
  'case.open_related': 'İlgili dosyaları aç',
  'activity.view_timeline': 'Aktiviteyi görüntüle',
};

const ACTION_DESCRIPTIONS: Partial<Record<ClientActionCatalogItem['key'], string>> = {
  'contact.update_missing_info': 'Müvekkil kimlik ve iletişim ekranına gider.',
  'intake.link.create': 'Uygun ilgili dosya için intake linki oluşturma hazırlığı.',
  'intake.link.send': 'Gerçek gönderim sonraki typed command fazında açılır.',
  'poa.reminder.send': 'Süresi yaklaşan aktif vekalet için iç ekip hatırlatması gönderir.',
  'notification.template.send': 'V1 allowlist sablonlarindan guvenli muvekkil bildirimi gonderir.',
  'document.request.send': 'V1 allowlist belge talebini guvenli bildirim altyapisiyla gonderir.',
  'case.open_related': 'Müvekkile bağlı dosyalar görünümüne gider.',
  'activity.view_timeline': 'Read-only aktivite zaman çizelgesine geçer.',
};


const INTAKE_SCOPE_LABELS: Record<IntakeFieldCategory, string> = {
  INCOME_SOURCE: 'Gelir Kaynağı',
  COMMERCIAL_RELATION: 'Ticari İlişki',
  FAMILY_CIRCLE: 'Aile / Yakın Çevre',
  DIGITAL_FOOTPRINT: 'Dijital İz',
  PAYMENT_HISTORY: 'Tahsilat Geçmişi',
  STRATEGY: 'Dosya Stratejisi',
  ADDRESS: 'Adres',
  ASSET: 'Varlık',
  CONTACT: 'İletişim',
};

const INTAKE_SCOPE_OPTIONS = Object.keys(INTAKE_SCOPE_LABELS) as IntakeFieldCategory[];
const DEFAULT_INTAKE_SCOPE: IntakeFieldCategory[] = ['ADDRESS'];
const TEMPLATE_NOTIFICATION_OPTIONS: Array<{ value: ClientWorkspaceTemplateNotificationCode; label: string }> = [
  { value: 'GENEL_BILGILENDIRME', label: 'Genel bilgilendirme' },
  { value: 'DOSYA_DURUMU', label: 'Dosya durumu' },
];
const DEFAULT_TEMPLATE_NOTIFICATION_CODE: ClientWorkspaceTemplateNotificationCode = 'GENEL_BILGILENDIRME';
const DOCUMENT_REQUEST_OPTIONS: Array<{ value: ClientWorkspaceDocumentRequestCode; label: string }> = [
  { value: 'GENEL_BELGE', label: 'Genel belge' },
  { value: 'DOSYA_EVRAKI', label: 'Dosya evraki' },
];
const DEFAULT_DOCUMENT_REQUEST_CODES: ClientWorkspaceDocumentRequestCode[] = ['GENEL_BELGE'];
const SNAPSHOT_LABELS = {
  health: {
    healthy: 'Sağlıklı',
    attention: 'Dikkat',
    blocked: 'Blokaj',
  },
  contact: {
    complete: 'Tam',
    missing: 'Eksik',
    waived: 'Vazgeçildi',
  },
  poa: {
    active: 'Aktif',
    missing: 'Eksik',
    expiring: 'Yakında bitecek',
    expired_or_inactive: 'Pasif / süresi dolmuş',
  },
  intake: {
    none: 'Yok',
    link_active: 'Aktif link',
    submitted: 'Yeni gönderim',
    in_review: 'İncelemede',
    completed: 'Tamamlandı',
    rejected: 'Reddedildi',
  },
  notification: {
    none: 'Yok',
    healthy: 'Sağlıklı',
    pending: 'Bekliyor',
    failed: 'Başarısız',
  },
};

function actionIcon(key: ClientActionCatalogItem['key']) {
  if (key.startsWith('contact.')) return <UserRound className="h-4 w-4" />;
  if (key.startsWith('intake.')) return <ClipboardList className="h-4 w-4" />;
  if (key.startsWith('poa.')) return <FileText className="h-4 w-4" />;
  if (key.startsWith('notification.')) return <Mail className="h-4 w-4" />;
  if (key.startsWith('document.')) return <FileText className="h-4 w-4" />;
  if (key.startsWith('activity.')) return <Clock className="h-4 w-4" />;
  return <ArrowRight className="h-4 w-4" />;
}

function healthClass(health?: ClientOperatingSnapshot['health']) {
  if (health === 'blocked') return 'border-red-200 bg-red-50 text-red-700';
  if (health === 'attention') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function severityClass(severity: ClientOperatingSnapshot['signals'][number]['severity']) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
}

const RETRY_AS_NEW_SIGNAL_KEYS = new Set(['intake.delivery_failed', 'intake.delivery_stuck']);

function isRetryAsNewSignal(signal: ClientOperatingSnapshot['signals'][number]) {
  return RETRY_AS_NEW_SIGNAL_KEYS.has(signal.key);
}

function retryAsNewSignalDetail(signal: ClientOperatingSnapshot['signals'][number]) {
  if (signal.key === 'intake.delivery_stuck') {
    return 'Önceki gönderim tamamlanmadan kaldı. Bu işlem aynı linki yeniden göndermez; yeni bağlantı oluşturur ve yeni e-posta gönderimi dener.';
  }
  return 'Önceki gönderim başarısız oldu. Bu işlem aynı linki yeniden göndermez; yeni bağlantı oluşturur ve yeni e-posta gönderimi dener.';
}

function retryAsNewFormNotice(signal: ClientOperatingSnapshot['signals'][number]) {
  const prefix = signal.key === 'intake.delivery_stuck' ? 'Önceki gönderim tamamlanmadan kaldı.' : 'Önceki gönderim başarısız oldu.';
  return `${prefix} Yeni bir intake bağlantısı oluşturulacak ve yeni e-posta gönderimi denenecek. Eski link otomatik iptal edilmez.`;
}
function disabledText(item: ClientActionCatalogItem) {
  return item.disabledReason || item.requiredState || 'Bu işlem sonraki fazda açılacak.';
}

function sortVisibleActions(items: ClientActionCatalogItem[]) {
  return items
    .filter((item) => item.visibility === 'visible')
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
}

export function ClientActionsTab({ clientId, onNavigateActivity }: ClientActionsTabProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [actions, setActions] = useState<ClientActionCatalogItem[]>([]);
  const [snapshot, setSnapshot] = useState<ClientOperatingSnapshot | null>(null);
  const [retryOpenRequest, setRetryOpenRequest] = useState(0);

  const refreshModels = useCallback(async () => {
    const [catalog, snap] = await Promise.all([api.getClientActionCatalog(clientId), api.getClientOperatingSnapshot(clientId)]);
    setActions(sortVisibleActions(catalog.data));
    setSnapshot(snap.data);
    setState('ready');
  }, [clientId]);

  useEffect(() => {
    let active = true;
    setState('loading');

    Promise.all([api.getClientActionCatalog(clientId), api.getClientOperatingSnapshot(clientId)])
      .then(([catalog, snap]) => {
        if (!active) return;
        setActions(sortVisibleActions(catalog.data));
        setSnapshot(snap.data);
        setState('ready');
      })
      .catch(() => {
        if (!active) return;
        setActions([]);
        setSnapshot(null);
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  const enabledCount = useMemo(() => actions.filter((item) => item.enabled).length, [actions]);
  const retryAsNewSignal = useMemo(() => snapshot?.signals.find(isRetryAsNewSignal) ?? null, [snapshot]);
  const retryActionAvailable = useMemo(() => actions.some((item) => item.key === 'intake.link.create' && item.enabled && !!item.target?.caseId), [actions]);

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-gray-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        İşlemler yükleniyor...
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        <AlertCircle className="h-4 w-4 shrink-0" />
        İşlemler yüklenemedi.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SnapshotCard
          label="Durum"
          value={snapshot ? SNAPSHOT_LABELS.health[snapshot.health] : '-'}
          detail={`${enabledCount} aktif işlem`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          className={healthClass(snapshot?.health)}
        />
        <SnapshotCard
          label="İletişim"
          value={snapshot ? SNAPSHOT_LABELS.contact[snapshot.contact.status] : '-'}
          detail={snapshot?.contact.missingFields.length ? snapshot.contact.missingFields.join(', ') : 'Eksik yok'}
          icon={<UserRound className="h-4 w-4" />}
        />
        <SnapshotCard
          label="Vekalet"
          value={snapshot ? SNAPSHOT_LABELS.poa[snapshot.poa.status] : '-'}
          detail={`${snapshot?.poa.activeCount ?? 0} aktif vekalet`}
          icon={<FileText className="h-4 w-4" />}
        />
        <SnapshotCard
          label="Bildirim"
          value={snapshot ? SNAPSHOT_LABELS.notification[snapshot.notification.status] : '-'}
          detail={snapshot?.notification.latest?.channel || 'Son kayıt yok'}
          icon={<Bell className="h-4 w-4" />}
        />
      </div>

      {snapshot?.signals.length ? (
        <div className="space-y-2">
          {snapshot.signals.map((signal) => {
            const retrySignal = isRetryAsNewSignal(signal);
            return (
              <div key={`${signal.key}-${signal.target.caseId ?? 'client'}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${severityClass(signal.severity)}`}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{signal.label}</p>
                  <p className="text-xs opacity-80">{signal.description}</p>
                  {retrySignal && (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs opacity-90">{retryAsNewSignalDetail(signal)} Eski link otomatik iptal edilmez.</p>
                      <button
                        type="button"
                        disabled={!retryActionAvailable}
                        onClick={() => setRetryOpenRequest((value) => value + 1)}
                        className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {retryActionAvailable ? 'Yeni link oluştur ve e-posta ile gönder' : 'Intake link oluşturma için ilgili dosya seçimi gerekli'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Info className="h-4 w-4" />
          Operasyonel uyarı yok.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((item) => (
          <ActionItem
            key={item.key}
            item={item}
            onNavigateActivity={onNavigateActivity}
            onRefreshModels={refreshModels}
            retryAsNewSignal={item.key === 'intake.link.create' ? retryAsNewSignal : null}
            retryOpenRequest={item.key === 'intake.link.create' ? retryOpenRequest : 0}
          />
        ))}
      </div>
    </div>
  );
}

function SnapshotCard({ label, value, detail, icon, className = 'border-gray-200 bg-gray-50 text-gray-700' }: { label: string; value: string; detail: string; icon: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <div className="flex items-center gap-2 text-xs opacity-80">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>{value}</p>
      <p className="mt-0.5 truncate text-xs opacity-75" title={detail}>{detail}</p>
    </div>
  );
}

function endOfDayIso(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

function deliveryStatusText(result: ClientWorkspaceCreateAndDeliverResult) {
  if (result.delivery.status === 'sent') return 'Link oluşturuldu ve e-posta gönderildi.';
  if (result.delivery.status === 'failed') return 'Link oluşturuldu ancak e-posta gonderilemedi.';
  if (result.delivery.status === 'sending') return 'Link oluşturuldu; e-posta gönderimi işleniyor.';
  return 'Link oluşturuldu; e-posta gonderimi bekliyor.';
}

function deliveryStatusClass(status: ClientWorkspaceCreateAndDeliverResult['delivery']['status']) {
  if (status === 'sent') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function poaReminderStatusText(result: ClientWorkspacePoaReminderResult) {
  if (result.status === 'sent') return 'Vekalet hatırlatması gönderildi.';
  if (result.status === 'partial') return 'Vekalet hatırlatması kısmen gönderildi.';
  if (result.status === 'failed') return 'Vekalet hatırlatması gönderilemedi.';
  return 'Gönderilecek yeni vekalet hatırlatması bulunamadı.';
}

function poaReminderStatusClass(status: ClientWorkspacePoaReminderResult['status']) {
  if (status === 'sent') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function templateNotificationStatusText(result: ClientWorkspaceTemplateNotificationResult) {
  if (result.status === 'sent') return 'Sablon bildirimi gonderildi.';
  if (result.status === 'skipped') return 'Bu sablon bildirimi daha once gonderildigi icin tekrar gonderilmedi.';
  return 'Sablon bildirimi gonderilemedi.';
}

function templateNotificationStatusClass(status: ClientWorkspaceTemplateNotificationResult['status']) {
  if (status === 'sent') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function documentRequestStatusText(result: ClientWorkspaceDocumentRequestResult) {
  if (result.status === 'sent') return 'Belge talebi gonderildi.';
  if (result.status === 'skipped') return 'Bu belge talebi daha once islendigi icin tekrar gonderilmedi.';
  return 'Belge talebi gonderilemedi.';
}

function documentRequestStatusClass(status: ClientWorkspaceDocumentRequestResult['status']) {
  if (status === 'sent') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function commandErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function ActionItem({
  item,
  onNavigateActivity,
  onRefreshModels,
  retryAsNewSignal,
  retryOpenRequest,
}: {
  item: ClientActionCatalogItem;
  onNavigateActivity?: () => void;
  onRefreshModels: () => Promise<void>;
  retryAsNewSignal?: ClientOperatingSnapshot['signals'][number] | null;
  retryOpenRequest: number;
}) {
  const label = ACTION_LABELS[item.key] || item.label;
  const description = ACTION_DESCRIPTIONS[item.key] || item.description;
  const isActivity = item.key === 'activity.view_timeline';
  const isIntakeCreate = item.key === 'intake.link.create';
  const isPoaReminder = item.key === 'poa.reminder.send';
  const isTemplateNotification = item.key === 'notification.template.send';
  const isDocumentRequest = item.key === 'document.request.send';
  const isLink = item.enabled && !!item.href && !isActivity;
  const canCreateIntakeLink = isIntakeCreate && item.enabled && !!item.target?.clientId && !!item.target?.caseId;
  const canSendPoaReminder = isPoaReminder && item.enabled && !!item.target?.clientId;
  const canSendTemplateNotification = isTemplateNotification && item.enabled && !!item.target?.clientId;
  const canSendDocumentRequest = isDocumentRequest && item.enabled && !!item.target?.clientId;
  const [formOpen, setFormOpen] = useState(false);
  const [scope, setScope] = useState<Set<IntakeFieldCategory>>(() => new Set(DEFAULT_INTAKE_SCOPE));
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [templateCode, setTemplateCode] = useState<ClientWorkspaceTemplateNotificationCode>(DEFAULT_TEMPLATE_NOTIFICATION_CODE);
  const [documentCodes, setDocumentCodes] = useState<Set<ClientWorkspaceDocumentRequestCode>>(() => new Set(DEFAULT_DOCUMENT_REQUEST_CODES));
  const [runningCommand, setRunningCommand] = useState<'create' | 'deliver' | 'poaReminder' | 'templateNotification' | 'documentRequest' | null>(null);
  const [commandError, setCommandError] = useState('');
  const [created, setCreated] = useState<CreateIntakeLinkResult | null>(null);
  const [deliveryResult, setDeliveryResult] = useState<ClientWorkspaceCreateAndDeliverResult | null>(null);
  const [poaReminderResult, setPoaReminderResult] = useState<ClientWorkspacePoaReminderResult | null>(null);
  const [templateNotificationResult, setTemplateNotificationResult] = useState<ClientWorkspaceTemplateNotificationResult | null>(null);
  const [documentRequestResult, setDocumentRequestResult] = useState<ClientWorkspaceDocumentRequestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const resetCommandForm = () => {
    setScope(new Set(DEFAULT_INTAKE_SCOPE));
    setExpiresAt('');
    setMaxUses('');
    setCommandError('');
  };

  const toggleScope = (category: IntakeFieldCategory) => {
    setScope((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const toggleDocumentCode = (code: ClientWorkspaceDocumentRequestCode) => {
    setDocumentCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const buildInput = (): CreateClientWorkspaceIntakeLinkInput | null => {
    setCommandError('');

    if (scope.size === 0) {
      setCommandError('Lütfen en az bir kategori seçin.');
      return null;
    }

    const parsedMaxUses = maxUses.trim() ? Number.parseInt(maxUses, 10) : undefined;
    if (parsedMaxUses !== undefined && (!Number.isInteger(parsedMaxUses) || parsedMaxUses < 1)) {
      setCommandError('Maksimum kullanım 1 veya daha büyük olmalı.');
      return null;
    }

    return {
      scope: Array.from(scope),
      expiresAt: expiresAt ? endOfDayIso(expiresAt) : undefined,
      maxUses: parsedMaxUses,
    };
  };

  const handleCreateIntakeLink = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreateIntakeLink || !item.target?.caseId || runningCommand) return;
    const input = buildInput();
    if (!input) return;

    setRunningCommand('create');
    setDeliveryResult(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
    try {
      const result = await api.createClientWorkspaceIntakeLink(item.target.clientId, item.target.caseId, input);
      setCreated(result);
      setCopied(false);
      setFormOpen(false);
      resetCommandForm();
      await onRefreshModels();
    } catch (error) {
      setCommandError(commandErrorMessage(error, 'Intake linki oluşturulamadı.'));
    } finally {
      setRunningCommand(null);
    }
  };

  const handleCreateAndDeliver = async () => {
    if (!canCreateIntakeLink || !item.target?.caseId || runningCommand) return;
    const input = buildInput();
    if (!input) return;

    setRunningCommand('deliver');
    setCreated(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
    try {
      const result = await api.createClientWorkspaceIntakeLinkAndDeliver(item.target.clientId, item.target.caseId, input);
      setDeliveryResult(result);
      setFormOpen(false);
      resetCommandForm();
      await onRefreshModels();
    } catch (error) {
      setCommandError(commandErrorMessage(error, 'Intake linki oluşturuldu/gönderildi durumu alınamadı.'));
    } finally {
      setRunningCommand(null);
    }
  };

  const handlePoaReminder = async () => {
    if (!canSendPoaReminder || runningCommand) return;

    setRunningCommand('poaReminder');
    setCommandError('');
    setCreated(null);
    setDeliveryResult(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
    try {
      const result = await api.sendClientWorkspacePoaReminder(item.target!.clientId);
      setPoaReminderResult(result);
      await onRefreshModels();
    } catch (error) {
      setCommandError(commandErrorMessage(error, 'Vekalet hatırlatması gönderilemedi.'));
    } finally {
      setRunningCommand(null);
    }
  };
  const handleTemplateNotification = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSendTemplateNotification || runningCommand) return;

    setRunningCommand('templateNotification');
    setCommandError('');
    setCreated(null);
    setDeliveryResult(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
    try {
      const result = await api.sendClientWorkspaceTemplateNotification(item.target!.clientId, {
        templateCode,
        ...(item.target?.caseId ? { caseId: item.target.caseId } : {}),
      });
      setTemplateNotificationResult(result);
      setFormOpen(false);
      await onRefreshModels();
    } catch (error) {
      setCommandError(commandErrorMessage(error, 'Sablon bildirimi gonderilemedi.'));
    } finally {
      setRunningCommand(null);
    }
  };

  const handleDocumentRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSendDocumentRequest || runningCommand) return;

    const selectedDocumentCodes = Array.from(documentCodes);
    if (selectedDocumentCodes.length === 0) {
      setCommandError('Lutfen en az bir belge talebi secin.');
      return;
    }

    setRunningCommand('documentRequest');
    setCommandError('');
    setCreated(null);
    setDeliveryResult(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
    try {
      const result = await api.sendClientWorkspaceDocumentRequest(item.target!.clientId, {
        documentCodes: selectedDocumentCodes,
        ...(item.target?.caseId ? { caseId: item.target.caseId } : {}),
      });
      setDocumentRequestResult(result);
      setFormOpen(false);
      await onRefreshModels();
    } catch (error) {
      setCommandError(commandErrorMessage(error, 'Belge talebi gonderilemedi.'));
    } finally {
      setRunningCommand(null);
    }
  };

  const handleCopy = async () => {
    if (!created?.intakeUrl) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(created.intakeUrl);
        setCopied(true);
      }
    } catch {
      setCopied(false);
    }
  };

  useEffect(() => {
    if (!retryAsNewSignal || retryOpenRequest < 1 || !canCreateIntakeLink) return;
    setFormOpen(true);
    setCommandError('');
    setCreated(null);
    setDeliveryResult(null);
    setPoaReminderResult(null);
    setTemplateNotificationResult(null);
    setDocumentRequestResult(null);
  }, [canCreateIntakeLink, retryAsNewSignal, retryOpenRequest]);

  const isBusy = runningCommand !== null;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${item.enabled ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
          {item.enabled ? actionIcon(item.key) : <Ban className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900">{label}</p>
            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{CATEGORY_LABELS[item.category]}</span>
          </div>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
          {!item.enabled && <p className="mt-2 text-xs text-amber-700">{disabledText(item)}</p>}
          {commandError && <p className="mt-2 text-xs text-red-600">{commandError}</p>}
        </div>
        {isActivity && item.enabled ? (
          <button
            type="button"
            onClick={onNavigateActivity}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Ac
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : isLink ? (
          <Link
            href={item.href!}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Ac
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : canCreateIntakeLink ? (
          <button
            type="button"
            onClick={() => {
              setFormOpen((value) => !value);
              setCommandError('');
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            {formOpen ? 'Kapat' : 'Oluştur'}
          </button>
        ) : canSendPoaReminder ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={handlePoaReminder}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60"
          >
            {runningCommand === 'poaReminder' ? 'Gönderiliyor...' : 'Gönder'}
          </button>
        ) : canSendTemplateNotification ? (
          <button
            type="button"
            onClick={() => {
              setFormOpen((value) => !value);
              setCommandError('');
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            {formOpen ? 'Kapat' : 'Sec'}
          </button>
        ) : canSendDocumentRequest ? (
          <button
            type="button"
            onClick={() => {
              setFormOpen((value) => !value);
              setCommandError('');
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            {formOpen ? 'Kapat' : 'Sec'}
          </button>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-400"
          >
            {item.enabled ? 'Hazır' : 'Kapalı'}
          </button>
        )}
      </div>

      {canCreateIntakeLink && formOpen && (
        <form onSubmit={handleCreateIntakeLink} className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          {retryAsNewSignal && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-medium">Yeniden yeni link oluştur ve gönder</p>
              <p className="mt-1">{retryAsNewFormNotice(retryAsNewSignal)}</p>
              <p className="mt-1">Bu mevcut linki yeniden gönderme veya aynı link retry işlemi değildir.</p>
            </div>
          )}
          <div>
            <p className="text-xs font-medium text-gray-700">İstenen bilgi kategorileri</p>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {INTAKE_SCOPE_OPTIONS.map((category) => (
                <label key={category} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={scope.has(category)}
                    onChange={() => toggleScope(category)}
                    className="rounded border-gray-300"
                  />
                  {INTAKE_SCOPE_LABELS[category]}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-700">
              Son kullanma
              <input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="text-xs font-medium text-gray-700">
              Maks. kullanım
              <input
                type="number"
                min={1}
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
                placeholder="1"
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {runningCommand === 'create' ? 'Oluşturuluyor...' : 'Link oluştur'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleCreateAndDeliver}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {runningCommand === 'deliver' ? 'Gönderiliyor...' : 'Link oluştur ve e-posta ile gonder'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFormOpen(false);
                resetCommandForm();
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-60"
            >
              Vazgeç
            </button>
          </div>
        </form>
      )}

      {canSendTemplateNotification && formOpen && (
        <form onSubmit={handleTemplateNotification} className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-700">
              Sablon
              <select
                value={templateCode}
                onChange={(event) => setTemplateCode(event.target.value as ClientWorkspaceTemplateNotificationCode)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-normal"
              >
                {TEMPLATE_NOTIFICATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <div className="text-xs text-gray-600">
              <p className="font-medium text-gray-700">Kapsam</p>
              <p className="mt-1">Alici, govde ve token alanlari backend tarafinda guvenli sekilde uretilir.</p>
              {item.target?.caseId && <p className="mt-1">Dosya baglami kullanilacak.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {runningCommand === 'templateNotification' ? 'Gonderiliyor...' : 'Sablon bildirimi gonder'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFormOpen(false);
                setCommandError('');
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-60"
            >
              Vazgec
            </button>
          </div>
        </form>
      )}

      {canSendDocumentRequest && formOpen && (
        <form onSubmit={handleDocumentRequest} className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-gray-700">Belge talebi tipleri</p>
              <div className="mt-2 space-y-1.5">
                {DOCUMENT_REQUEST_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={documentCodes.has(option.value)}
                      onChange={() => toggleDocumentCode(option.value)}
                      className="rounded border-gray-300"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="text-xs text-gray-600">
              <p className="font-medium text-gray-700">Kapsam</p>
              <p className="mt-1">Alici, govde, token ve saglayici payload alanlari backend tarafinda guvenli sekilde uretilir.</p>
              {item.target?.caseId && <p className="mt-1">Dosya baglami kullanilacak.</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={isBusy}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
            >
              {runningCommand === 'documentRequest' ? 'Gonderiliyor...' : 'Belge talebi gonder'}
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setFormOpen(false);
                setCommandError('');
                setDocumentCodes(new Set(DEFAULT_DOCUMENT_REQUEST_CODES));
              }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-60"
            >
              Vazgec
            </button>
          </div>
        </form>
      )}
      {created && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-800">Link oluşturuldu</p>
          <p className="mt-1 text-xs text-emerald-700">Bu link yalnız şimdi gösterilir. Gönderim yapılmadı; linki kopyalayıp uygun kanaldan paylaşın.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-emerald-200 bg-white px-2 py-1 text-xs text-gray-700">
              {created.intakeUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-800"
            >
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
          </div>
        </div>
      )}

      {deliveryResult && (
        <div className={`mt-4 rounded-lg border p-3 ${deliveryStatusClass(deliveryResult.delivery.status)}`}>
          <p className="text-sm font-medium">{deliveryStatusText(deliveryResult)}</p>
          <p className="mt-1 text-xs opacity-80">Gönderim komutu raw link döndürmez; link güvenlik nedeniyle bu ekranda gösterilmez.</p>
          {deliveryResult.delivery.status === 'failed' && deliveryResult.delivery.error && (
            <p className="mt-2 text-xs">{deliveryResult.delivery.error}</p>
          )}
        </div>
      )}
      {templateNotificationResult && (
        <div className={`mt-4 rounded-lg border p-3 ${templateNotificationStatusClass(templateNotificationResult.status)}`}>
          <p className="text-sm font-medium">{templateNotificationStatusText(templateNotificationResult)}</p>
          <p className="mt-1 text-xs opacity-80">Sablon: {TEMPLATE_NOTIFICATION_OPTIONS.find((option) => option.value === templateNotificationResult.templateCode)?.label ?? templateNotificationResult.templateCode}</p>
          <p className="mt-1 text-xs opacity-80">Yanitta alici, govde, dedupe veya saglayici hata detayi gosterilmez.</p>
        </div>
      )}
      {documentRequestResult && (
        <div className={`mt-4 rounded-lg border p-3 ${documentRequestStatusClass(documentRequestResult.status)}`}>
          <p className="text-sm font-medium">{documentRequestStatusText(documentRequestResult)}</p>
          <p className="mt-1 text-xs opacity-80">Belgeler: {documentRequestResult.documentCodes.map((code) => DOCUMENT_REQUEST_OPTIONS.find((option) => option.value === code)?.label ?? code).join(', ')}</p>
          <p className="mt-1 text-xs opacity-80">Yanitta alici, govde, token, dedupe veya saglayici hata detayi gosterilmez.</p>
        </div>
      )}
      {poaReminderResult && (
        <div className={`mt-4 rounded-lg border p-3 ${poaReminderStatusClass(poaReminderResult.status)}`}>
          <p className="text-sm font-medium">{poaReminderStatusText(poaReminderResult)}</p>
          <p className="mt-1 text-xs opacity-80">
            Gönderilen: {poaReminderResult.sent}, başarısız: {poaReminderResult.failed}, atlanan: {poaReminderResult.skipped}.
          </p>
        </div>
      )}

    </div>
  );
}
