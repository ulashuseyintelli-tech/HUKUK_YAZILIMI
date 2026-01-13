import { ActionCode, RiskLevel } from './action-code.enum';
import { Scope } from './scope.enum';

/**
 * Fail mode - hata durumunda davranış
 */
export type FailMode = 'CLOSED' | 'OPEN';

/**
 * Resolver failure mode - context çözümlenemezse davranış
 */
export type ResolverFailureMode = 'FAIL_CLOSED' | 'FAIL_OPEN' | 'SOFT_BLOCK';

/**
 * Lock scope
 */
export type LockScope = 'CASE' | 'DEBTOR' | 'ASSET' | 'NONE';

/**
 * Gate severity
 */
export type GateSeverity = 'HARD' | 'SOFT';

/**
 * High-Risk Action Matrix entry
 * @see docs/high-risk-action-matrix.md
 */
export interface ActionMatrixEntry {
  /** Aksiyon kodu */
  actionCode: ActionCode;
  
  /** Risk seviyesi */
  riskLevel: RiskLevel;
  
  /** Hata durumunda davranış */
  failMode: FailMode;
  
  /** Resolver hatası durumunda davranış */
  resolverFailureMode: ResolverFailureMode;
  
  /** Lock gerekli mi? */
  lockRequired: boolean;
  
  /** Lock scope */
  lockScope: LockScope;
  
  /** Gate severity */
  gateSeverity: GateSeverity;
  
  /** @CpeRequired decorator zorunlu mu? */
  cpeRequiredMandatory: boolean;
  
  /** Scope */
  scope: Scope;
  
  /** Notlar */
  notes?: string;
}

/**
 * High-Risk Action Matrix
 * docs/high-risk-action-matrix.md'den derive edilmiştir
 */
export const ACTION_MATRIX: ActionMatrixEntry[] = [
  // ============================================
  // HIGH Risk Actions
  // ============================================
  {
    actionCode: ActionCode.UYAP_SEND,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'UYAP işlemleri geri alınamaz',
  },
  {
    actionCode: ActionCode.TRIGGER_HACIZ,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'ASSET',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.ASSET,
    notes: 'Haciz işlemi kritik, geri alınamaz',
  },
  {
    actionCode: ActionCode.REQUEST_ENFORCEMENT,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'İcra takibi başlatma, hukuki süreç başlatır',
  },
  {
    actionCode: ActionCode.CLOSE_CASE,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Dosya kapanışı geri alınabilir ama dikkatli olunmalı',
  },
  {
    actionCode: ActionCode.REQUEST_SALE,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'ASSET',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.ASSET,
    notes: 'Satış talebi kritik, varlık üzerinde işlem başlatır',
  },
  {
    actionCode: ActionCode.SEND_NOTIFICATION,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'DEBTOR',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.DEBTOR,
    notes: 'Tebligat hukuki süreç başlatır, geri alınamaz',
  },
  {
    actionCode: ActionCode.SEND_PAYMENT_ORDER,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Ödeme emri gönderimi hukuki süreç başlatır',
  },
  {
    actionCode: ActionCode.EVICTION_REQUEST,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Tahliye talebi kritik hukuki işlem',
  },
  {
    actionCode: ActionCode.FINALIZE_CASE,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: true,
    lockScope: 'CASE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Dosya sonlandırma (tahsil edildi)',
  },
  {
    actionCode: ActionCode.APPROVE_EXPENSE,
    riskLevel: RiskLevel.HIGH,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.EXPENSE,
    notes: 'Masraf onaylama, müvekkile maliyet oluşturur',
  },

  // ============================================
  // MEDIUM Risk Actions
  // ============================================
  {
    actionCode: ActionCode.REQUEST_EXPENSE,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Masraf talebi müvekkile maliyet oluşturur',
  },
  {
    actionCode: ActionCode.SEND_DEBTOR_MSG,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.DEBTOR,
    notes: 'Borçluya mesaj hukuki sonuç doğurabilir',
  },
  {
    actionCode: ActionCode.NOTIFICATION_DELIVERED,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'SOFT_BLOCK',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.DEBTOR,
    notes: 'Tebligat teslim kaydı, süre hesabını başlatır',
  },
  {
    actionCode: ActionCode.ARCHIVE_CASE,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Arşivleme geri alınabilir ama dikkatli olunmalı',
  },
  {
    actionCode: ActionCode.REOPEN_CASE,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Dosya yeniden açma',
  },
  {
    actionCode: ActionCode.CONVERT_FROM_MTS,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'SOFT_BLOCK',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: false,
    scope: Scope.CASE,
    notes: 'MTS\'den normal takibe dönüşüm',
  },
  {
    actionCode: ActionCode.PROCEED_TO_ENFORCEMENT,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'FAIL_CLOSED',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Kesinleşme aşamasına geçiş',
  },
  {
    actionCode: ActionCode.RECORD_COLLECTION,
    riskLevel: RiskLevel.MEDIUM,
    failMode: 'CLOSED',
    resolverFailureMode: 'SOFT_BLOCK',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'HARD',
    cpeRequiredMandatory: true,
    scope: Scope.CASE,
    notes: 'Tahsilat kaydı, mali işlem',
  },

  // ============================================
  // LOW Risk Actions
  // ============================================
  {
    actionCode: ActionCode.UYAP_QUERY,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.CASE,
    notes: 'Sadece sorgu, yan etkisi yok',
  },
  {
    actionCode: ActionCode.QUERY_ASSETS,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.DEBTOR,
    notes: 'Varlık sorgulama, yan etkisi yok',
  },
  {
    actionCode: ActionCode.QUERY_BANK_ACCOUNTS,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.DEBTOR,
    notes: 'Banka hesabı sorgulama, yan etkisi yok',
  },
  {
    actionCode: ActionCode.QUERY_VEHICLES,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.DEBTOR,
    notes: 'Araç sorgulama, yan etkisi yok',
  },
  {
    actionCode: ActionCode.RECORD_EXPENSE_PAYMENT,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.EXPENSE,
    notes: 'Ödeme kaydı, düzeltilebilir',
  },
  {
    actionCode: ActionCode.ADD_NAFAKA_PERIOD,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.CASE,
    notes: 'Nafaka dönemi ekleme, düzeltilebilir',
  },
  {
    actionCode: ActionCode.UPDATE_EXCHANGE_RATE,
    riskLevel: RiskLevel.LOW,
    failMode: 'OPEN',
    resolverFailureMode: 'FAIL_OPEN',
    lockRequired: false,
    lockScope: 'NONE',
    gateSeverity: 'SOFT',
    cpeRequiredMandatory: false,
    scope: Scope.CASE,
    notes: 'Kur güncelleme, düzeltilebilir',
  },
];

/**
 * ActionCode'a göre matrix entry getir
 */
export function getActionMatrixEntry(actionCode: ActionCode): ActionMatrixEntry | undefined {
  return ACTION_MATRIX.find(entry => entry.actionCode === actionCode);
}

/**
 * ActionCode için resolver failure mode getir
 */
export function getResolverFailureMode(actionCode: ActionCode): ResolverFailureMode {
  const entry = getActionMatrixEntry(actionCode);
  return entry?.resolverFailureMode ?? 'FAIL_CLOSED'; // Default: fail-closed
}

/**
 * ActionCode için fail mode getir
 */
export function getFailMode(actionCode: ActionCode): FailMode {
  const entry = getActionMatrixEntry(actionCode);
  return entry?.failMode ?? 'CLOSED'; // Default: fail-closed
}

/**
 * ActionCode için lock gerekli mi?
 */
export function isLockRequired(actionCode: ActionCode): boolean {
  const entry = getActionMatrixEntry(actionCode);
  return entry?.lockRequired ?? false;
}

/**
 * ActionCode için @CpeRequired zorunlu mu?
 */
export function isCpeRequiredMandatory(actionCode: ActionCode): boolean {
  const entry = getActionMatrixEntry(actionCode);
  return entry?.cpeRequiredMandatory ?? true; // Default: mandatory
}
