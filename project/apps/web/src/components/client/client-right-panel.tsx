'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, CircleDashed, Loader2, ShieldAlert } from 'lucide-react';
import { api, type ClientActionCatalogItem, type ClientOperatingSnapshot } from '@/lib/api';

interface ClientRightPanelProps {
  clientId: string;
  onNavigateActions: () => void;
  onNavigateActivity?: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

const COMMAND_ACTIONS = new Set<ClientActionCatalogItem['key']>([
  'intake.link.create',
  'poa.reminder.send',
  'notification.template.send',
  'document.request.send',
]);

const HEALTH_LABELS: Record<ClientOperatingSnapshot['health'], string> = {
  healthy: 'Saglikli',
  attention: 'Dikkat',
  blocked: 'Bloklu',
};

const RISK_LABELS: Record<ClientOperatingSnapshot['riskLevel'], string> = {
  low: 'Dusuk risk',
  medium: 'Orta risk',
  high: 'Yuksek risk',
};

function healthClass(health: ClientOperatingSnapshot['health']) {
  if (health === 'blocked') return 'border-red-200 bg-red-50 text-red-800';
  if (health === 'attention') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
}

function severityClass(severity: ClientOperatingSnapshot['signals'][number]['severity']) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-blue-200 bg-blue-50 text-blue-800';
}

function disabledText(item: ClientActionCatalogItem) {
  return item.disabledReason || item.requiredState || 'Bu islem su anda kapali.';
}

function sortVisibleActions(items: ClientActionCatalogItem[]) {
  return items
    .filter((item) => item.visibility === 'visible')
    .sort((a, b) => a.order - b.order);
}

function isCommandAction(item: ClientActionCatalogItem) {
  return COMMAND_ACTIONS.has(item.key);
}

export function ClientRightPanel({ clientId, onNavigateActions, onNavigateActivity }: ClientRightPanelProps) {
  const [state, setState] = useState<LoadState>('loading');
  const [snapshot, setSnapshot] = useState<ClientOperatingSnapshot | null>(null);
  const [actions, setActions] = useState<ClientActionCatalogItem[]>([]);

  useEffect(() => {
    let active = true;
    setState('loading');

    Promise.all([api.getClientOperatingSnapshot(clientId), api.getClientActionCatalog(clientId)])
      .then(([snap, catalog]) => {
        if (!active) return;
        setSnapshot(snap.data);
        setActions(sortVisibleActions(catalog.data));
        setState('ready');
      })
      .catch(() => {
        if (!active) return;
        setSnapshot(null);
        setActions([]);
        setState('error');
      });

    return () => {
      active = false;
    };
  }, [clientId]);

  const importantSignals = useMemo(
    () =>
      (snapshot?.signals ?? [])
        .filter((signal) => signal.severity === 'critical' || signal.severity === 'warning')
        .slice(0, 4),
    [snapshot],
  );
  const enabledActions = useMemo(() => actions.filter((item) => item.enabled).slice(0, 4), [actions]);
  const disabledActions = useMemo(() => actions.filter((item) => !item.enabled).slice(0, 4), [actions]);

  if (state === 'loading') {
    return (
      <aside className="rounded-xl border bg-white p-4 text-sm text-gray-500 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Operasyon paneli yukleniyor...
        </div>
      </aside>
    );
  }

  if (state === 'error' || !snapshot) {
    return (
      <aside className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 xl:sticky xl:top-4 xl:self-start">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Operasyon paneli yuklenemedi.
        </div>
      </aside>
    );
  }

  return (
    <aside className="space-y-4 rounded-xl border bg-white p-4 xl:sticky xl:top-4 xl:self-start" aria-label="Operasyon paneli">
      <div>
        <p className="text-sm font-semibold text-gray-900">Operasyon paneli</p>
        <p className="mt-1 text-xs text-gray-500">Read-only durum ve aksiyon ozeti</p>
      </div>

      <div className={`rounded-lg border px-3 py-2 text-sm ${healthClass(snapshot.health)}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">{HEALTH_LABELS[snapshot.health]}</span>
          <span className="text-xs">{RISK_LABELS[snapshot.riskLevel]}</span>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <ShieldAlert className="h-3.5 w-3.5" />
          Sinyaller
        </div>
        {importantSignals.length > 0 ? (
          <div className="space-y-2">
            {importantSignals.map((signal) => (
              <div key={`${signal.key}-${signal.target.caseId ?? 'client'}`} className={`rounded-lg border px-3 py-2 ${severityClass(signal.severity)}`}>
                <p className="text-sm font-medium">{signal.label}</p>
                <p className="mt-1 text-xs opacity-80">{signal.description}</p>
                {signal.actionKey && <p className="mt-1 text-xs opacity-80">Aksiyon: {signal.actionKey}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Kritik veya uyarı sinyali yok.
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          <CircleDashed className="h-3.5 w-3.5" />
          Hızlı aksiyonlar
        </div>
        <div className="space-y-2">
          {enabledActions.length > 0 ? (
            enabledActions.map((item) => (
              <ActionSummary
                key={item.key}
                item={item}
                onNavigateActions={onNavigateActions}
                onNavigateActivity={onNavigateActivity}
              />
            ))
          ) : (
            <p className="rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-500">Aktif aksiyon yok.</p>
          )}
        </div>
      </section>

      {disabledActions.length > 0 && (
        <section>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Kapalı aksiyonlar</div>
          <div className="space-y-2">
            {disabledActions.map((item) => (
              <div key={item.key} className="rounded-lg border bg-gray-50 px-3 py-2">
                <p className="text-sm font-medium text-gray-700">{item.label}</p>
                <p className="mt-1 text-xs text-gray-500">{disabledText(item)}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

function ActionSummary({
  item,
  onNavigateActions,
  onNavigateActivity,
}: {
  item: ClientActionCatalogItem;
  onNavigateActions: () => void;
  onNavigateActivity?: () => void;
}) {
  const isActivity = item.key === 'activity.view_timeline';
  const isCommand = isCommandAction(item);

  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-sm font-medium text-gray-900">{item.label}</p>
      <p className="mt-1 text-xs text-gray-500">{item.description}</p>
      <div className="mt-2">
        {isActivity ? (
          <button
            type="button"
            onClick={onNavigateActivity ?? onNavigateActions}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Aktiviteyi ac
            <ArrowRight className="h-3 w-3" />
          </button>
        ) : item.href && !isCommand ? (
          <Link
            href={item.href}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Ac
            <ArrowRight className="h-3 w-3" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={onNavigateActions}
            className="inline-flex items-center gap-1 rounded-md border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            Islemler'de ac
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
