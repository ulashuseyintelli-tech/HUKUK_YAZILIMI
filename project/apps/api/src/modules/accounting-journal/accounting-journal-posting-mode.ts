export const ACCOUNTING_JOURNAL_POSTING_MODE_ENV = 'ACCOUNTING_JOURNAL_POSTING_MODE' as const;

export const ACCOUNTING_JOURNAL_POSTING_MODES = ['disabled', 'shadow', 'enforce'] as const;

export type AccountingJournalPostingMode = (typeof ACCOUNTING_JOURNAL_POSTING_MODES)[number];

export type AccountingJournalPostingModeEnv = Record<string, string | undefined>;

export function isAccountingJournalPostingMode(value: string): value is AccountingJournalPostingMode {
  return ACCOUNTING_JOURNAL_POSTING_MODES.includes(value as AccountingJournalPostingMode);
}

export function resolveAccountingJournalPostingMode(
  env: AccountingJournalPostingModeEnv = process.env,
): AccountingJournalPostingMode {
  const raw = env[ACCOUNTING_JOURNAL_POSTING_MODE_ENV];
  if (!raw) return 'disabled';

  const candidate = raw.trim();
  return isAccountingJournalPostingMode(candidate) ? candidate : 'disabled';
}

export function isAccountingJournalPostingDisabled(mode: AccountingJournalPostingMode): boolean {
  return mode === 'disabled';
}

export function isAccountingJournalPostingShadow(mode: AccountingJournalPostingMode): boolean {
  return mode === 'shadow';
}

export function isAccountingJournalPostingEnforce(mode: AccountingJournalPostingMode): boolean {
  return mode === 'enforce';
}

export function shouldAttemptAccountingJournalPosting(mode: AccountingJournalPostingMode): boolean {
  return mode === 'shadow' || mode === 'enforce';
}

export function shouldEnforceAccountingJournalPosting(mode: AccountingJournalPostingMode): boolean {
  return mode === 'enforce';
}
