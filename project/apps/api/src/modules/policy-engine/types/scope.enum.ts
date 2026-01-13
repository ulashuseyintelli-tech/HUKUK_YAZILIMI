/**
 * Scope Enum
 * 
 * Kararın bağlandığı seviye. Hierarchical fact resolution için kullanılır.
 * Scope chain: ASSET → DEBTOR → CASE
 */

export enum Scope {
  /** Dosya seviyesi - en üst scope */
  CASE = 'CASE',
  
  /** Borçlu seviyesi - dosya altında */
  DEBTOR = 'DEBTOR',
  
  /** Varlık seviyesi - borçlu altında */
  ASSET = 'ASSET',
  
  /** Masraf seviyesi - dosya altında */
  EXPENSE = 'EXPENSE',
}

/**
 * Scope hierarchy - üstten alta
 * ASSET scope'undaki bir fact lookup, DEBTOR ve CASE scope'larını da kontrol eder
 */
export const SCOPE_HIERARCHY: Record<Scope, Scope[]> = {
  [Scope.CASE]: [Scope.CASE],
  [Scope.DEBTOR]: [Scope.DEBTOR, Scope.CASE],
  [Scope.ASSET]: [Scope.ASSET, Scope.DEBTOR, Scope.CASE],
  [Scope.EXPENSE]: [Scope.EXPENSE, Scope.CASE],
};

/**
 * Verilen scope için parent scope'ları getir
 */
export function getParentScopes(scope: Scope): Scope[] {
  return SCOPE_HIERARCHY[scope].slice(1); // İlk eleman kendisi, geri kalanı parent'lar
}

/**
 * Verilen scope için tüm scope chain'i getir (kendisi dahil)
 */
export function getScopeChain(scope: Scope): Scope[] {
  return SCOPE_HIERARCHY[scope];
}
