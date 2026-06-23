import { FEATURE_FLAGS } from '@/lib/config/feature-flags';

type SearchParamsLike = Pick<URLSearchParams, 'get'>;

export function shouldShowBalanceShadowDisplay(
  searchParams: SearchParamsLike,
  flagEnabled = FEATURE_FLAGS.BALANCE_SHADOW_DISPLAY,
): boolean {
  return flagEnabled && searchParams.get('balanceShadow') === '1';
}

export function getBalanceShadowDisplayDate(searchParams: SearchParamsLike): string | undefined {
  return searchParams.get('balanceShadowDate') ?? undefined;
}
