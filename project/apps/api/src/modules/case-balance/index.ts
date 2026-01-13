/**
 * Case Balance Module (Masraf Avansı Ledger)
 * 
 * @alias AdvanceLedger
 * @see ARCHITECTURE.md
 */

export { CaseBalanceService } from './case-balance.service';
export { CaseBalanceModule } from './case-balance.module';

// Alias exports (gelecekte ana isim olacak)
export { CaseBalanceService as AdvanceLedgerService } from './case-balance.service';
export { CaseBalanceModule as AdvanceLedgerModule } from './case-balance.module';

// Types
export type { CreditBalanceDto, DebitBalanceDto } from './case-balance.service';
