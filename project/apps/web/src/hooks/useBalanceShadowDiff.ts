import { useCallback, useEffect, useState } from 'react';
import {
  balanceShadowDiffApi,
  type BalanceDisplayShadowDiffReport,
} from '@/lib/api/balance-shadow-diff';

interface UseBalanceShadowDiffOptions {
  caseId: string;
  asOfDate?: string;
  enabled: boolean;
}

interface UseBalanceShadowDiffReturn {
  data: BalanceDisplayShadowDiffReport | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Opt-in shadow diff verisini ceker; kapaliyken network istegi yapmaz.
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - BalanceShadowDiffPanel() → GET /interest-engine/case/:caseId/balance/display/shadow-diff (audit-only UI paneli)
 * </remarks>
 */
export function useBalanceShadowDiff({
  caseId,
  asOfDate,
  enabled,
}: UseBalanceShadowDiffOptions): UseBalanceShadowDiffReturn {
  const [data, setData] = useState<BalanceDisplayShadowDiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShadowDiff = useCallback(async () => {
    if (!enabled || !caseId) return;

    setLoading(true);
    setError(null);

    try {
      const report = await balanceShadowDiffApi.getShadowDiff(caseId, asOfDate);
      setData(report);
    } catch (err: any) {
      console.error('[useBalanceShadowDiff] Error:', err);
      setError(err.message || 'Shadow diff alinamadi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [asOfDate, caseId, enabled]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!enabled || !caseId) return;

      setLoading(true);
      setError(null);

      try {
        const report = await balanceShadowDiffApi.getShadowDiff(caseId, asOfDate);
        if (!cancelled) setData(report);
      } catch (err: any) {
        if (!cancelled) {
          console.error('[useBalanceShadowDiff] Error:', err);
          setError(err.message || 'Shadow diff alinamadi');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [asOfDate, caseId, enabled]);

  return {
    data,
    loading,
    error,
    refetch: fetchShadowDiff,
  };
}
