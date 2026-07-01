'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { api, type ClientActionCatalogItem, type ClientOperatingSnapshot } from '@/lib/api';

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
  'notification.template.send': 'Şablon bildirim gönder',
  'case.open_related': 'İlgili dosyaları aç',
  'activity.view_timeline': 'Aktiviteyi görüntüle',
};

const ACTION_DESCRIPTIONS: Partial<Record<ClientActionCatalogItem['key'], string>> = {
  'contact.update_missing_info': 'Müvekkil kimlik ve iletişim ekranına gider.',
  'intake.link.create': 'Komut sözleşmesi tamamlanınca aktifleşir.',
  'intake.link.send': 'Gerçek gönderim sonraki typed command fazında açılır.',
  'poa.reminder.send': 'Vekalet teslim motoru hazır olduğunda açılır.',
  'notification.template.send': 'Bildirim dispatch sözleşmesi hazır olduğunda açılır.',
  'case.open_related': 'Müvekkile bağlı dosyalar görünümüne gider.',
  'activity.view_timeline': 'Read-only aktivite zaman çizelgesine geçer.',
};

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
          {snapshot.signals.map((signal) => (
            <div key={`${signal.key}-${signal.target.caseId ?? 'client'}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${severityClass(signal.severity)}`}>
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{signal.label}</p>
                <p className="text-xs opacity-80">{signal.description}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Info className="h-4 w-4" />
          Operasyonel uyarı yok.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {actions.map((item) => (
          <ActionItem key={item.key} item={item} onNavigateActivity={onNavigateActivity} />
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

function ActionItem({ item, onNavigateActivity }: { item: ClientActionCatalogItem; onNavigateActivity?: () => void }) {
  const label = ACTION_LABELS[item.key] || item.label;
  const description = ACTION_DESCRIPTIONS[item.key] || item.description;
  const isActivity = item.key === 'activity.view_timeline';
  const isLink = item.enabled && !!item.href && !isActivity;

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
        </div>
        {isActivity && item.enabled ? (
          <button
            type="button"
            onClick={onNavigateActivity}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Aç
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : isLink ? (
          <Link
            href={item.href!}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Aç
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-400"
          >
            Kapalı
          </button>
        )}
      </div>
    </div>
  );
}