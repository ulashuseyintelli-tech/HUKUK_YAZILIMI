'use client';

/**
 * CAD C2-B04 — Efektif capability + POA görünümü.
 * Kural: POA canonical kaynağını PROJEKTE EDER, yeniden HESAPLAMAZ. Karar
 * (allowed/reasonCode/basisPoaIds) backend'in effective-capabilities çıktısından
 * gelir; UI yalnız gösterir. Action-catalog da mevcut projeksiyondur (yeni türetme yok).
 * Fail-closed retler gerekçesiyle görünür; sessiz boş ekran YASAK.
 */
import { useQuery } from '@tanstack/react-query';
import { Card, Badge, Spinner } from '@hukuk/ui';
import { KeyRound } from 'lucide-react';
import {
  clientComplianceCapabilityApi,
  toComplianceError,
  type EffectiveCapabilityDecision,
  type EffectiveClientCapabilities,
  type ClientActionCatalogItem,
} from '@/lib/api/client-compliance';
import { ComplianceFailClosed } from './ComplianceFailClosed';

const CAP_LABELS: Record<string, string> = {
  canCollect: 'Tahsil',
  canWaive: 'Feragat',
  canSettle: 'Sulh',
  canRelease: 'İbra',
};
const REASON_LABELS: Record<string, string> = {
  ALLOWED: 'Geçerli POA kapsıyor',
  NO_VALID_POA: 'Geçerli POA yok',
  POA_SCOPE_NOT_COVERED: 'POA kapsamı yetkiyi içermiyor',
  POA_EXPLICIT_COLLECT_RESTRICTION: 'POA açık tahsil kısıtı',
  FLAT_FLAG_RESTRICTION: 'Legacy flag kısıtı',
};

export function EffectiveCapabilitySection({ clientId }: { clientId: string }) {
  const caps = useQuery({
    queryKey: ['client-compliance', 'effective-capabilities', clientId],
    queryFn: () => clientComplianceCapabilityApi.effectiveCapabilities(clientId),
  });
  const actions = useQuery({
    queryKey: ['client-compliance', 'action-catalog', clientId],
    queryFn: () => clientComplianceCapabilityApi.actionCatalog(clientId),
  });

  const order: Array<keyof EffectiveClientCapabilities> = ['canCollect', 'canWaive', 'canSettle', 'canRelease'];

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <KeyRound className="h-4 w-4" aria-hidden /> Efektif Yetki + Vekalet (POA) Görünümü
      </h2>
      <p className="mt-1 text-xs text-gray-500">
        Karar canonical POA kaynağından projekte edilir; bu ekran yeniden hesaplama yapmaz.
      </p>

      {caps.isLoading ? <Spinner data-testid="caps-loading" /> : null}
      {caps.isError ? (
        <ComplianceFailClosed title="Efektif yetki alınamadı" error={toComplianceError(caps.error)} />
      ) : null}
      {!caps.isLoading && !caps.isError && !caps.isSuccess ? (
        <ComplianceFailClosed
          title="Efektif yetki yüklenemedi"
          error={{ message: 'Durum belirlenemedi — fail-closed (sessiz boş ekran yasak).' }}
        />
      ) : null}

      {caps.isSuccess ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-1 pr-2">Yetki</th>
              <th className="py-1 pr-2">Durum</th>
              <th className="py-1 pr-2">Gerekçe</th>
              <th className="py-1 pr-2">Dayanak POA</th>
            </tr>
          </thead>
          <tbody>
            {order.map((k) => {
              const d: EffectiveCapabilityDecision = caps.data[k];
              return (
                <tr key={k} className="border-t">
                  <td className="py-1.5 pr-2 font-medium">{CAP_LABELS[k] ?? k}</td>
                  <td className="py-1.5 pr-2">
                    <Badge variant={d.allowed ? 'default' : 'secondary'}>
                      {d.allowed ? 'YETKİLİ' : 'YETKİSİZ'}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-2">{REASON_LABELS[d.reasonCode] ?? d.reasonCode}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">
                    {d.basisPoaIds.length ? d.basisPoaIds.join(', ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      <div className="mt-4 border-t pt-3">
        <h3 className="text-sm font-medium">Aksiyon kataloğu (mevcut projeksiyon)</h3>
        {actions.isError ? (
          <ComplianceFailClosed title="Aksiyon kataloğu alınamadı" error={toComplianceError(actions.error)} />
        ) : null}
        {actions.isSuccess ? (
          actions.data.filter((a) => a.visibility !== 'hidden').length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Görüntülenebilir aksiyon yok.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {actions.data
                .filter((a: ClientActionCatalogItem) => a.visibility !== 'hidden')
                .map((a: ClientActionCatalogItem) => (
                  <li key={a.key} className="flex items-center gap-2">
                    <Badge variant={a.enabled ? 'default' : 'secondary'}>
                      {a.enabled ? 'AÇIK' : 'KAPALI'}
                    </Badge>
                    <span>{a.label}</span>
                    {!a.enabled && a.disabledReason ? (
                      <span className="text-xs text-gray-500">— {a.disabledReason}</span>
                    ) : null}
                  </li>
                ))}
            </ul>
          )
        ) : null}
      </div>
    </Card>
  );
}
