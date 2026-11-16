export const CASE_CLAIM_CURRENCY_MESSAGE = 'Alacak kaleminin para birimi dosya para birimiyle aynı olmalıdır. Tutar veya para birimi çevrilmedi.';

export function caseClaimCurrencyMatches(caseCurrency: unknown, currency: unknown): boolean {
  return typeof caseCurrency === 'string' && /^[A-Z]{3}$/.test(caseCurrency) && currency === caseCurrency;
}

/** Inspect original form/OCR values before the legacy Due payload drops currency metadata. */
export function assertCaseClaimDraftCurrencies(caseCurrency: string, raws: readonly any[]): void {
  for (const raw of raws) {
    // Old Due-only drafts have no per-item currency in their contract. Do not invent one from the wrapper's TRY label.
    const currency = raw?.__legacyDue ? raw.__legacyDue.currency : raw?.currency;
    if (currency !== undefined && !caseClaimCurrencyMatches(caseCurrency, currency)) {
      throw new Error(CASE_CLAIM_CURRENCY_MESSAGE);
    }
  }
}
