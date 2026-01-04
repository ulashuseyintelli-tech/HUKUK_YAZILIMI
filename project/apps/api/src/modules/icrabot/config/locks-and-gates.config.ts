/**
 * LOCKS AND GATES CONFIG v5
 * 
 * Masraflı/kritik işlemler için kilit ve kapı sistemi.
 * - LOCK: Belirli koşullar sağlanana kadar işlemi blokla
 * - GATE: Onay/avans/koşul gereksinimi
 * - UNCERTAINTY BUDGET: Belirsizlik bütçesi (unknown-aware decisioning)
 */

import { ActionType } from './idempotency.config';
import { RiskLevel } from './risk-scoring.config';

// ==================== TYPES ====================

export type LockType =
  | 'LOCK_DEBTOR_ACTIONS'      // Borçlu bazlı işlem kilidi
  | 'LOCK_COST_ACTIONS'        // Masraflı işlem kilidi
  | 'LOCK_EXECUTION_ACTIONS'   // İcra işlem kilidi
  | 'LOCK_SALE_ACTIONS'        // Satış işlem kilidi
  | 'LOCK_ADVANCE_PENDING';    // Avans bekleyen kilit

export type GateType =
  | 'GATE_COST'                // Masraf kapısı (avans gerekli)
  | 'GATE_APPROVAL'            // Onay kapısı (avukat onayı)
  | 'GATE_RISK'                // Risk kapısı (risk değerlendirmesi)
  | 'GATE_POA'                 // Vekalet kapısı
  | 'GATE_FINALIZATION'        // Kesinleşme kapısı
  | 'GATE_SERVICE';            // Tebligat kapısı

export type UnlockCondition =
  | 'ADVANCE_RECEIVED'
  | 'APPROVAL_GRANTED'
  | 'RISK_ACCEPTED'
  | 'POA_VALID'
  | 'CASE_FINALIZED'
  | 'SERVICE_EFFECTIVE'
  | 'MANUAL_OVERRIDE'
  | 'TIMEOUT_EXPIRED';

export interface Lock {
  lockId: string;
  lockType: LockType;
  caseId: string;
  debtorId?: string;
  assetId?: string;
  
  // Kilitlenen aksiyonlar
  blockedActions: ActionType[];
  
  // Kilit nedeni
  reason: string;
  reasonCode: string;
  
  // Açılma koşulları
  unlockConditions: UnlockCondition[];
  
  // Zaman bilgileri
  createdAt: Date;
  expiresAt?: Date;
  unlockedAt?: Date;
  unlockedBy?: string;
  unlockReason?: string;
  
  // Durum
  isActive: boolean;
}

export interface Gate {
  gateId: string;
  gateType: GateType;
  
  // Hangi aksiyonlar için geçerli
  applicableActions: ActionType[];
  
  // Geçiş koşulları
  passConditions: GateCondition[];
  
  // Başarısızlık durumu
  onFail: 'BLOCK' | 'WARN' | 'LOG';
  
  // Bypass edilebilir mi
  allowBypass: boolean;
  bypassRequiresApproval: boolean;
  
  isActive: boolean;
}

export interface GateCondition {
  conditionId: string;
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'exists' | 'in';
  value: any;
  errorMessage: string;
}

export interface UncertaintyBudget {
  // Belirsizlik kategorileri
  category: 'ASSET_VALUE' | 'PRIOR_CLAIMS' | 'COLLECTION_PROBABILITY' | 'COST_ESTIMATE';
  
  // Bilinen/bilinmeyen oranı
  knownRatio: number; // 0-1 arası
  
  // Belirsizlik toleransı
  toleranceThreshold: number; // Bu oranın altında karar verme
  
  // Belirsizlik durumunda aksiyon
  onHighUncertainty: 'BLOCK' | 'WARN' | 'REQUIRE_APPROVAL' | 'PROCEED_WITH_CAUTION';
}

// ==================== LOCK DEFINITIONS ====================

export const LOCK_DEFINITIONS: Record<LockType, {
  name: string;
  description: string;
  defaultBlockedActions: ActionType[];
  autoExpireDays?: number;
}> = {
  LOCK_DEBTOR_ACTIONS: {
    name: 'Borçlu İşlem Kilidi',
    description: 'Belirli bir borçlu için tüm işlemleri bloklar',
    defaultBlockedActions: [
      'SEND_ETEBLIGAT',
      'SEND_PHYSICAL_TEBLIGAT',
      'PLACE_BANK_LIEN',
      'PLACE_VEHICLE_LIEN',
      'PLACE_REAL_ESTATE_LIEN',
      'PLACE_WAGE_GARNISHMENT',
      'PLACE_PENSION_GARNISHMENT',
    ],
    autoExpireDays: 30,
  },
  
  LOCK_COST_ACTIONS: {
    name: 'Masraflı İşlem Kilidi',
    description: 'Masraf gerektiren işlemleri bloklar (avans bekleniyor)',
    defaultBlockedActions: [
      'SUBMIT_YAKALAMA_REQUEST',
      'REQUEST_SALE',
      'ANNOUNCE_SALE',
    ],
    autoExpireDays: 14,
  },
  
  LOCK_EXECUTION_ACTIONS: {
    name: 'İcra İşlem Kilidi',
    description: 'Haciz/icra işlemlerini bloklar (risk yüksek)',
    defaultBlockedActions: [
      'PLACE_BANK_LIEN',
      'PLACE_VEHICLE_LIEN',
      'PLACE_REAL_ESTATE_LIEN',
      'PLACE_WAGE_GARNISHMENT',
      'PLACE_PENSION_GARNISHMENT',
      'SUBMIT_YAKALAMA_REQUEST',
    ],
    autoExpireDays: 7,
  },
  
  LOCK_SALE_ACTIONS: {
    name: 'Satış İşlem Kilidi',
    description: 'Satış işlemlerini bloklar',
    defaultBlockedActions: [
      'REQUEST_SALE',
      'ANNOUNCE_SALE',
    ],
    autoExpireDays: 30,
  },
  
  LOCK_ADVANCE_PENDING: {
    name: 'Avans Bekleyen Kilit',
    description: 'Avans alınana kadar ilgili işlemleri bloklar',
    defaultBlockedActions: [
      'SUBMIT_YAKALAMA_REQUEST',
    ],
    autoExpireDays: 14,
  },
};

// ==================== GATE DEFINITIONS ====================

export const GATES: Gate[] = [
  {
    gateId: 'GATE_COST_YAKALAMA',
    gateType: 'GATE_COST',
    applicableActions: ['SUBMIT_YAKALAMA_REQUEST'],
    passConditions: [
      {
        conditionId: 'YAKALAMA_ADVANCE_RECEIVED',
        field: 'case.yakalamaAdvanceReceived',
        operator: 'eq',
        value: true,
        errorMessage: 'Yakalama avansı alınmadan işlem yapılamaz',
      },
    ],
    onFail: 'BLOCK',
    allowBypass: true,
    bypassRequiresApproval: true,
    isActive: true,
  },
  
  {
    gateId: 'GATE_COST_SALE',
    gateType: 'GATE_COST',
    applicableActions: ['REQUEST_SALE', 'ANNOUNCE_SALE'],
    passConditions: [
      {
        conditionId: 'SALE_ADVANCE_RECEIVED',
        field: 'case.saleAdvanceReceived',
        operator: 'eq',
        value: true,
        errorMessage: 'Satış avansı alınmadan işlem yapılamaz',
      },
    ],
    onFail: 'BLOCK',
    allowBypass: true,
    bypassRequiresApproval: true,
    isActive: true,
  },
  
  {
    gateId: 'GATE_APPROVAL_HIGH_RISK',
    gateType: 'GATE_APPROVAL',
    applicableActions: [
      'SUBMIT_YAKALAMA_REQUEST',
      'REQUEST_SALE',
      'PLACE_VEHICLE_LIEN',
      'PLACE_REAL_ESTATE_LIEN',
    ],
    passConditions: [
      {
        conditionId: 'RISK_NOT_HIGH',
        field: 'riskAssessment.level',
        operator: 'in',
        value: ['LOW', 'MEDIUM'],
        errorMessage: 'Risk seviyesi yüksek - avukat onayı gerekli',
      },
    ],
    onFail: 'BLOCK',
    allowBypass: true,
    bypassRequiresApproval: true,
    isActive: true,
  },
  
  {
    gateId: 'GATE_POA_UYAP',
    gateType: 'GATE_POA',
    applicableActions: [
      'SEND_ETEBLIGAT',
      'PLACE_BANK_LIEN',
      'PLACE_VEHICLE_LIEN',
      'PLACE_REAL_ESTATE_LIEN',
      'PLACE_WAGE_GARNISHMENT',
      'PLACE_PENSION_GARNISHMENT',
      'SUBMIT_YAKALAMA_REQUEST',
      'REQUEST_SALE',
      'SUBMIT_DOCUMENT',
    ],
    passConditions: [
      {
        conditionId: 'POA_VALID',
        field: 'case.poaValid',
        operator: 'eq',
        value: true,
        errorMessage: 'Geçerli vekalet olmadan UYAP işlemi yapılamaz',
      },
    ],
    onFail: 'BLOCK',
    allowBypass: false,
    bypassRequiresApproval: false,
    isActive: true,
  },
  
  {
    gateId: 'GATE_FINALIZATION_HACIZ',
    gateType: 'GATE_FINALIZATION',
    applicableActions: [
      'PLACE_BANK_LIEN',
      'PLACE_VEHICLE_LIEN',
      'PLACE_REAL_ESTATE_LIEN',
      'PLACE_WAGE_GARNISHMENT',
      'PLACE_PENSION_GARNISHMENT',
      'SUBMIT_YAKALAMA_REQUEST',
    ],
    passConditions: [
      {
        conditionId: 'CASE_FINALIZED',
        field: 'case.isFinalized',
        operator: 'eq',
        value: true,
        errorMessage: 'Takip kesinleşmeden haciz işlemi yapılamaz',
      },
    ],
    onFail: 'BLOCK',
    allowBypass: false,
    bypassRequiresApproval: false,
    isActive: true,
  },
  
  {
    gateId: 'GATE_SERVICE_FINALIZATION',
    gateType: 'GATE_SERVICE',
    applicableActions: ['QUERY_SGK', 'QUERY_TAKBIS', 'QUERY_VEHICLE', 'QUERY_BANK'],
    passConditions: [
      {
        conditionId: 'SERVICE_EFFECTIVE',
        field: 'debtor.serviceEffective',
        operator: 'eq',
        value: true,
        errorMessage: 'Tebligat gerçekleşmeden varlık sorgusu yapılamaz',
      },
    ],
    onFail: 'WARN', // Sadece uyarı, bloklamaz
    allowBypass: true,
    bypassRequiresApproval: false,
    isActive: true,
  },
];

// ==================== UNCERTAINTY BUDGET ====================

export const UNCERTAINTY_BUDGETS: UncertaintyBudget[] = [
  {
    category: 'ASSET_VALUE',
    knownRatio: 0.7, // %70 güven gerekli
    toleranceThreshold: 0.5, // %50'nin altında karar verme
    onHighUncertainty: 'REQUIRE_APPROVAL',
  },
  {
    category: 'PRIOR_CLAIMS',
    knownRatio: 0.8, // %80 bilinen alacak gerekli
    toleranceThreshold: 0.6,
    onHighUncertainty: 'WARN',
  },
  {
    category: 'COLLECTION_PROBABILITY',
    knownRatio: 0.6,
    toleranceThreshold: 0.4,
    onHighUncertainty: 'PROCEED_WITH_CAUTION',
  },
  {
    category: 'COST_ESTIMATE',
    knownRatio: 0.9, // Masraflar %90 kesin olmalı
    toleranceThreshold: 0.7,
    onHighUncertainty: 'BLOCK',
  },
];

// ==================== COST THRESHOLDS ====================

/**
 * Masraf eşikleri - bu tutarların üzerinde onay gerekir
 */
export const COST_THRESHOLDS = {
  // Otomatik onay limiti (TL)
  AUTO_APPROVE_LIMIT: 1000,
  
  // Avukat onayı gereken limit (TL)
  ATTORNEY_APPROVAL_LIMIT: 5000,
  
  // Müvekkil onayı gereken limit (TL)
  CLIENT_APPROVAL_LIMIT: 10000,
  
  // Masraf türü bazlı limitler
  BY_TYPE: {
    YAKALAMA_AVANSI: 5000,
    SATIS_AVANSI: 10000,
    BILIRKISI_UCRETI: 3000,
    ILAN_MASRAFI: 2000,
    MUHAFAZA_MASRAFI: 1000,
    DIGER: 500,
  },
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Kilit oluştur
 */
export function createLock(
  lockType: LockType,
  caseId: string,
  reason: string,
  options?: {
    debtorId?: string;
    assetId?: string;
    customBlockedActions?: ActionType[];
    expiresInDays?: number;
  }
): Lock {
  const definition = LOCK_DEFINITIONS[lockType];
  const now = new Date();
  
  const expireDays = options?.expiresInDays ?? definition.autoExpireDays;
  
  return {
    lockId: `${lockType}_${caseId}_${Date.now()}`,
    lockType,
    caseId,
    debtorId: options?.debtorId,
    assetId: options?.assetId,
    blockedActions: options?.customBlockedActions ?? definition.defaultBlockedActions,
    reason,
    reasonCode: lockType,
    unlockConditions: getDefaultUnlockConditions(lockType),
    createdAt: now,
    expiresAt: expireDays ? new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000) : undefined,
    isActive: true,
  };
}

/**
 * Kilit türüne göre varsayılan açılma koşulları
 */
function getDefaultUnlockConditions(lockType: LockType): UnlockCondition[] {
  switch (lockType) {
    case 'LOCK_ADVANCE_PENDING':
    case 'LOCK_COST_ACTIONS':
      return ['ADVANCE_RECEIVED', 'MANUAL_OVERRIDE'];
    case 'LOCK_EXECUTION_ACTIONS':
      return ['RISK_ACCEPTED', 'APPROVAL_GRANTED', 'MANUAL_OVERRIDE'];
    case 'LOCK_SALE_ACTIONS':
      return ['ADVANCE_RECEIVED', 'APPROVAL_GRANTED', 'MANUAL_OVERRIDE'];
    case 'LOCK_DEBTOR_ACTIONS':
      return ['SERVICE_EFFECTIVE', 'MANUAL_OVERRIDE', 'TIMEOUT_EXPIRED'];
    default:
      return ['MANUAL_OVERRIDE'];
  }
}

/**
 * Kilidi aç
 */
export function unlockLock(
  lock: Lock,
  unlockedBy: string,
  unlockReason: string,
  condition: UnlockCondition
): Lock {
  return {
    ...lock,
    isActive: false,
    unlockedAt: new Date(),
    unlockedBy,
    unlockReason: `${condition}: ${unlockReason}`,
  };
}

/**
 * Aksiyon için aktif kilitleri kontrol et
 */
export function getActiveLocksForAction(
  locks: Lock[],
  actionType: ActionType,
  caseId: string,
  debtorId?: string,
  assetId?: string
): Lock[] {
  const now = new Date();
  
  return locks.filter(lock => {
    // Aktif değilse atla
    if (!lock.isActive) return false;
    
    // Süresi dolmuşsa atla
    if (lock.expiresAt && lock.expiresAt < now) return false;
    
    // Case eşleşmeli
    if (lock.caseId !== caseId) return false;
    
    // Debtor varsa eşleşmeli
    if (lock.debtorId && debtorId && lock.debtorId !== debtorId) return false;
    
    // Asset varsa eşleşmeli
    if (lock.assetId && assetId && lock.assetId !== assetId) return false;
    
    // Aksiyon bloklu mu
    return lock.blockedActions.includes(actionType);
  });
}

/**
 * Gate kontrolü yap
 */
export function checkGate(
  gate: Gate,
  context: Record<string, any>
): { passed: boolean; failedConditions: GateCondition[] } {
  const failedConditions: GateCondition[] = [];
  
  for (const condition of gate.passConditions) {
    const fieldValue = getNestedValue(context, condition.field);
    const passed = evaluateGateCondition(condition, fieldValue);
    
    if (!passed) {
      failedConditions.push(condition);
    }
  }
  
  return {
    passed: failedConditions.length === 0,
    failedConditions,
  };
}

/**
 * Gate koşulunu değerlendir
 */
function evaluateGateCondition(condition: GateCondition, fieldValue: any): boolean {
  switch (condition.operator) {
    case 'eq':
      return fieldValue === condition.value;
    case 'neq':
      return fieldValue !== condition.value;
    case 'gt':
      return fieldValue > condition.value;
    case 'gte':
      return fieldValue >= condition.value;
    case 'lt':
      return fieldValue < condition.value;
    case 'lte':
      return fieldValue <= condition.value;
    case 'exists':
      return fieldValue !== undefined && fieldValue !== null;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(fieldValue);
    default:
      return false;
  }
}

/**
 * Nested değer getir
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

/**
 * Belirsizlik bütçesi kontrolü
 */
export function checkUncertaintyBudget(
  category: UncertaintyBudget['category'],
  knownRatio: number
): {
  withinBudget: boolean;
  action: UncertaintyBudget['onHighUncertainty'];
  message: string;
} {
  const budget = UNCERTAINTY_BUDGETS.find(b => b.category === category);
  
  if (!budget) {
    return {
      withinBudget: true,
      action: 'PROCEED_WITH_CAUTION',
      message: 'Belirsizlik bütçesi tanımlı değil',
    };
  }
  
  if (knownRatio >= budget.knownRatio) {
    return {
      withinBudget: true,
      action: 'PROCEED_WITH_CAUTION',
      message: 'Yeterli bilgi mevcut',
    };
  }
  
  if (knownRatio < budget.toleranceThreshold) {
    return {
      withinBudget: false,
      action: budget.onHighUncertainty,
      message: `Belirsizlik çok yüksek (${Math.round(knownRatio * 100)}% bilinen, minimum ${Math.round(budget.toleranceThreshold * 100)}% gerekli)`,
    };
  }
  
  return {
    withinBudget: false,
    action: 'WARN',
    message: `Belirsizlik yüksek (${Math.round(knownRatio * 100)}% bilinen, önerilen ${Math.round(budget.knownRatio * 100)}%)`,
  };
}

/**
 * Masraf onay seviyesi belirle
 */
export function getCostApprovalLevel(
  amount: number,
  costType?: keyof typeof COST_THRESHOLDS.BY_TYPE
): 'AUTO' | 'ATTORNEY' | 'CLIENT' {
  // Tür bazlı limit varsa kontrol et
  if (costType && COST_THRESHOLDS.BY_TYPE[costType]) {
    const typeLimit = COST_THRESHOLDS.BY_TYPE[costType];
    if (amount > typeLimit) {
      return amount > COST_THRESHOLDS.CLIENT_APPROVAL_LIMIT ? 'CLIENT' : 'ATTORNEY';
    }
  }
  
  // Genel limitler
  if (amount <= COST_THRESHOLDS.AUTO_APPROVE_LIMIT) {
    return 'AUTO';
  }
  
  if (amount <= COST_THRESHOLDS.ATTORNEY_APPROVAL_LIMIT) {
    return 'ATTORNEY';
  }
  
  return 'CLIENT';
}

/**
 * Aksiyon için tüm kapıları kontrol et
 */
export function checkAllGatesForAction(
  actionType: ActionType,
  context: Record<string, any>
): {
  canProceed: boolean;
  blockedBy: Array<{ gateId: string; reason: string }>;
  warnings: Array<{ gateId: string; message: string }>;
} {
  const applicableGates = GATES.filter(
    g => g.isActive && g.applicableActions.includes(actionType)
  );
  
  const blockedBy: Array<{ gateId: string; reason: string }> = [];
  const warnings: Array<{ gateId: string; message: string }> = [];
  
  for (const gate of applicableGates) {
    const result = checkGate(gate, context);
    
    if (!result.passed) {
      const reasons = result.failedConditions.map(c => c.errorMessage).join('; ');
      
      if (gate.onFail === 'BLOCK') {
        blockedBy.push({ gateId: gate.gateId, reason: reasons });
      } else if (gate.onFail === 'WARN') {
        warnings.push({ gateId: gate.gateId, message: reasons });
      }
    }
  }
  
  return {
    canProceed: blockedBy.length === 0,
    blockedBy,
    warnings,
  };
}
