import { isLegalBasisResolverEnabled } from '../../claim-item/formation-intent/legal-basis-resolver-activation';

export const UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG =
  'UYAP_M01_LEGAL_BASIS_CONSUMER_ENABLED';

/**
 * UYAP-M01 is a consumer-only composition. Both the RECEIVABLE resolver and
 * the UYAP consumer boundary must be explicitly enabled; either missing flag
 * keeps the provider dormant.
 */
export function isUyapM01LegalBasisConsumerEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env[UYAP_M01_LEGAL_BASIS_CONSUMER_FLAG] === 'true' &&
    isLegalBasisResolverEnabled(env)
  );
}
