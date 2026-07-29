export const RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG =
  'RECEIVABLE_LEGAL_BASIS_RESOLVER_ENABLED';

export function isLegalBasisResolverEnabled(env = process.env): boolean {
  return env[RECEIVABLE_LEGAL_BASIS_RESOLVER_FLAG] === 'true';
}
