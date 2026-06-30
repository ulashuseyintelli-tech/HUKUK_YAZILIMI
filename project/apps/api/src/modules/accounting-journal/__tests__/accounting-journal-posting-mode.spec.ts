import {
  ACCOUNTING_JOURNAL_POSTING_MODE_ENV,
  isAccountingJournalPostingDisabled,
  isAccountingJournalPostingEnforce,
  isAccountingJournalPostingMode,
  isAccountingJournalPostingShadow,
  resolveAccountingJournalPostingMode,
  shouldAttemptAccountingJournalPosting,
  shouldEnforceAccountingJournalPosting,
} from '../accounting-journal-posting-mode';

describe('Accounting journal posting mode contract', () => {
  it('missing env defaults to disabled and does not attempt journal posting', () => {
    const mode = resolveAccountingJournalPostingMode({});

    expect(mode).toBe('disabled');
    expect(isAccountingJournalPostingDisabled(mode)).toBe(true);
    expect(shouldAttemptAccountingJournalPosting(mode)).toBe(false);
    expect(shouldEnforceAccountingJournalPosting(mode)).toBe(false);
  });

  it('resolves disabled mode as default-off journal posting', () => {
    const mode = resolveAccountingJournalPostingMode({
      [ACCOUNTING_JOURNAL_POSTING_MODE_ENV]: 'disabled',
    });

    expect(mode).toBe('disabled');
    expect(isAccountingJournalPostingMode(mode)).toBe(true);
    expect(isAccountingJournalPostingDisabled(mode)).toBe(true);
    expect(shouldAttemptAccountingJournalPosting(mode)).toBe(false);
  });

  it('resolves shadow mode as best-effort journal posting without enforce semantics', () => {
    const mode = resolveAccountingJournalPostingMode({
      [ACCOUNTING_JOURNAL_POSTING_MODE_ENV]: 'shadow',
    });

    expect(mode).toBe('shadow');
    expect(isAccountingJournalPostingMode(mode)).toBe(true);
    expect(isAccountingJournalPostingShadow(mode)).toBe(true);
    expect(shouldAttemptAccountingJournalPosting(mode)).toBe(true);
    expect(shouldEnforceAccountingJournalPosting(mode)).toBe(false);
  });

  it('resolves enforce mode as future fail-closed journal posting', () => {
    const mode = resolveAccountingJournalPostingMode({
      [ACCOUNTING_JOURNAL_POSTING_MODE_ENV]: 'enforce',
    });

    expect(mode).toBe('enforce');
    expect(isAccountingJournalPostingMode(mode)).toBe(true);
    expect(isAccountingJournalPostingEnforce(mode)).toBe(true);
    expect(shouldAttemptAccountingJournalPosting(mode)).toBe(true);
    expect(shouldEnforceAccountingJournalPosting(mode)).toBe(true);
  });

  it('invalid mode fails safe to disabled', () => {
    for (const raw of ['enabled', 'live', 'ENFORCE', 'shadow-mode', '']) {
      const mode = resolveAccountingJournalPostingMode({
        [ACCOUNTING_JOURNAL_POSTING_MODE_ENV]: raw,
      });

      expect(mode).toBe('disabled');
      expect(shouldAttemptAccountingJournalPosting(mode)).toBe(false);
      expect(shouldEnforceAccountingJournalPosting(mode)).toBe(false);
    }
  });
});