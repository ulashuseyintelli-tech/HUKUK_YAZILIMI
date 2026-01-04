/**
 * IDEMPOTENCY CONFIG v5
 * 
 * "İşi iki kere yapmama" zırhı.
 * Her UYAP aksiyonu için fingerprint üretir ve duplicate kontrolü yapar.
 */

import * as crypto from 'crypto';

// ==================== TYPES ====================

export type ActionType =
  // Tebligat
  | 'SEND_ETEBLIGAT'
  | 'SEND_PHYSICAL_TEBLIGAT'
  | 'REQUEST_MAZBATA'
  // Haciz
  | 'PLACE_BANK_LIEN'
  | 'PLACE_VEHICLE_LIEN'
  | 'PLACE_REAL_ESTATE_LIEN'
  | 'PLACE_WAGE_GARNISHMENT'
  | 'PLACE_PENSION_GARNISHMENT'
  | 'SUBMIT_YAKALAMA_REQUEST'
  // Satış
  | 'REQUEST_SALE'
  | 'ANNOUNCE_SALE'
  // Sorgu
  | 'QUERY_SGK'
  | 'QUERY_TAKBIS'
  | 'QUERY_VEHICLE'
  | 'QUERY_BANK'
  | 'QUERY_TRADE_REGISTRY'
  // Diğer
  | 'SUBMIT_DOCUMENT'
  | 'REQUEST_100_INFO';

export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'FAILED' | 'CANCELLED';

export interface ActionFingerprint {
  fingerprint: string;
  actionType: ActionType;
  caseId: string;
  debtorId?: string;
  assetId?: string;
  date: string; // YYYY-MM-DD
  params: Record<string, any>;
  createdAt: Date;
  status: ActionStatus;
  completedAt?: Date;
  uyapRef?: string; // UYAP'tan dönen referans
  error?: string;
}

export interface IdempotencyCheckResult {
  canProceed: boolean;
  reason: string;
  existingAction?: ActionFingerprint;
  suggestedAction?: 'SKIP' | 'REFRESH_STATUS' | 'RETRY' | 'PROCEED';
}

// ==================== FINGERPRINT GENERATION ====================

/**
 * Aksiyon için fingerprint üret
 */
export function generateActionFingerprint(
  actionType: ActionType,
  caseId: string,
  params: {
    debtorId?: string;
    assetId?: string;
    date?: Date;
    additionalParams?: Record<string, any>;
  }
): string {
  const date = params.date || new Date();
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  
  const fingerprintData = {
    actionType,
    caseId,
    debtorId: params.debtorId || '',
    assetId: params.assetId || '',
    date: dateStr,
    ...params.additionalParams,
  };
  
  // Sıralı JSON string oluştur (tutarlılık için)
  const sortedJson = JSON.stringify(fingerprintData, Object.keys(fingerprintData).sort());
  
  // SHA256 hash
  return crypto.createHash('sha256').update(sortedJson).digest('hex').substring(0, 32);
}

/**
 * Aksiyon kaydı oluştur
 */
export function createActionRecord(
  actionType: ActionType,
  caseId: string,
  params: {
    debtorId?: string;
    assetId?: string;
    date?: Date;
    additionalParams?: Record<string, any>;
  }
): ActionFingerprint {
  const fingerprint = generateActionFingerprint(actionType, caseId, params);
  const date = params.date || new Date();
  
  return {
    fingerprint,
    actionType,
    caseId,
    debtorId: params.debtorId,
    assetId: params.assetId,
    date: date.toISOString().split('T')[0],
    params: params.additionalParams || {},
    createdAt: new Date(),
    status: 'PENDING',
  };
}

// ==================== IDEMPOTENCY RULES ====================

/**
 * Aksiyon türüne göre idempotency kuralları
 */
export const IDEMPOTENCY_RULES: Record<ActionType, {
  // Aynı gün içinde tekrar edilebilir mi
  allowSameDayRetry: boolean;
  // Kaç gün sonra tekrar edilebilir
  retryAfterDays: number;
  // DONE durumunda tekrar edilebilir mi
  allowRetryAfterDone: boolean;
  // FAILED durumunda otomatik retry
  autoRetryOnFail: boolean;
  // Maksimum retry sayısı
  maxRetries: number;
}> = {
  // Tebligat - aynı gün tekrar edilmez
  SEND_ETEBLIGAT: {
    allowSameDayRetry: false,
    retryAfterDays: 1,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 3,
  },
  SEND_PHYSICAL_TEBLIGAT: {
    allowSameDayRetry: false,
    retryAfterDays: 7, // Fiziki tebligat için daha uzun
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 2,
  },
  REQUEST_MAZBATA: {
    allowSameDayRetry: false,
    retryAfterDays: 1,
    allowRetryAfterDone: true, // Mazbata tekrar sorgulanabilir
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  
  // Haciz - kesinlikle tekrar edilmez
  PLACE_BANK_LIEN: {
    allowSameDayRetry: false,
    retryAfterDays: 365, // 1 yıl
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  PLACE_VEHICLE_LIEN: {
    allowSameDayRetry: false,
    retryAfterDays: 365,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  PLACE_REAL_ESTATE_LIEN: {
    allowSameDayRetry: false,
    retryAfterDays: 365,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  PLACE_WAGE_GARNISHMENT: {
    allowSameDayRetry: false,
    retryAfterDays: 365,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  PLACE_PENSION_GARNISHMENT: {
    allowSameDayRetry: false,
    retryAfterDays: 365,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  SUBMIT_YAKALAMA_REQUEST: {
    allowSameDayRetry: false,
    retryAfterDays: 30,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  
  // Satış
  REQUEST_SALE: {
    allowSameDayRetry: false,
    retryAfterDays: 30,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 1,
  },
  ANNOUNCE_SALE: {
    allowSameDayRetry: false,
    retryAfterDays: 7,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 2,
  },
  
  // Sorgular - daha sık tekrar edilebilir
  QUERY_SGK: {
    allowSameDayRetry: true,
    retryAfterDays: 0,
    allowRetryAfterDone: true,
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  QUERY_TAKBIS: {
    allowSameDayRetry: true,
    retryAfterDays: 0,
    allowRetryAfterDone: true,
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  QUERY_VEHICLE: {
    allowSameDayRetry: true,
    retryAfterDays: 0,
    allowRetryAfterDone: true,
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  QUERY_BANK: {
    allowSameDayRetry: true,
    retryAfterDays: 0,
    allowRetryAfterDone: true,
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  QUERY_TRADE_REGISTRY: {
    allowSameDayRetry: true,
    retryAfterDays: 0,
    allowRetryAfterDone: true,
    autoRetryOnFail: true,
    maxRetries: 5,
  },
  
  // Diğer
  SUBMIT_DOCUMENT: {
    allowSameDayRetry: false,
    retryAfterDays: 1,
    allowRetryAfterDone: false,
    autoRetryOnFail: false,
    maxRetries: 3,
  },
  REQUEST_100_INFO: {
    allowSameDayRetry: false,
    retryAfterDays: 7,
    allowRetryAfterDone: true,
    autoRetryOnFail: false,
    maxRetries: 3,
  },
};

// ==================== CHECK FUNCTIONS ====================

/**
 * Aksiyonun yapılıp yapılamayacağını kontrol et
 */
export function checkIdempotency(
  actionType: ActionType,
  existingActions: ActionFingerprint[],
  newFingerprint: string
): IdempotencyCheckResult {
  const rules = IDEMPOTENCY_RULES[actionType];
  const today = new Date().toISOString().split('T')[0];
  
  // Aynı fingerprint var mı?
  const exactMatch = existingActions.find(a => a.fingerprint === newFingerprint);
  
  if (exactMatch) {
    // DONE durumunda
    if (exactMatch.status === 'DONE') {
      if (!rules.allowRetryAfterDone) {
        return {
          canProceed: false,
          reason: 'Bu işlem daha önce başarıyla tamamlandı',
          existingAction: exactMatch,
          suggestedAction: 'SKIP',
        };
      }
      
      // Retry süresi geçmiş mi?
      const completedDate = exactMatch.completedAt || exactMatch.createdAt;
      const daysSinceCompletion = Math.floor(
        (Date.now() - completedDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysSinceCompletion < rules.retryAfterDays) {
        return {
          canProceed: false,
          reason: `Bu işlem ${rules.retryAfterDays - daysSinceCompletion} gün sonra tekrar edilebilir`,
          existingAction: exactMatch,
          suggestedAction: 'REFRESH_STATUS',
        };
      }
    }
    
    // IN_PROGRESS durumunda
    if (exactMatch.status === 'IN_PROGRESS') {
      return {
        canProceed: false,
        reason: 'Bu işlem şu anda devam ediyor',
        existingAction: exactMatch,
        suggestedAction: 'REFRESH_STATUS',
      };
    }
    
    // PENDING durumunda
    if (exactMatch.status === 'PENDING') {
      return {
        canProceed: false,
        reason: 'Bu işlem kuyrukta bekliyor',
        existingAction: exactMatch,
        suggestedAction: 'SKIP',
      };
    }
    
    // FAILED durumunda
    if (exactMatch.status === 'FAILED') {
      // Retry sayısı aşıldı mı?
      const retryCount = existingActions.filter(
        a => a.fingerprint === newFingerprint && a.status === 'FAILED'
      ).length;
      
      if (retryCount >= rules.maxRetries) {
        return {
          canProceed: false,
          reason: `Maksimum deneme sayısına (${rules.maxRetries}) ulaşıldı`,
          existingAction: exactMatch,
          suggestedAction: 'SKIP',
        };
      }
      
      if (rules.autoRetryOnFail) {
        return {
          canProceed: true,
          reason: 'Önceki deneme başarısız, otomatik yeniden deneniyor',
          existingAction: exactMatch,
          suggestedAction: 'RETRY',
        };
      }
    }
  }
  
  // Aynı gün aynı tip işlem var mı?
  const sameDayAction = existingActions.find(
    a => a.actionType === actionType && 
         a.date === today && 
         a.status !== 'FAILED' && 
         a.status !== 'CANCELLED'
  );
  
  if (sameDayAction && !rules.allowSameDayRetry) {
    return {
      canProceed: false,
      reason: 'Bu işlem bugün zaten yapıldı',
      existingAction: sameDayAction,
      suggestedAction: 'SKIP',
    };
  }
  
  return {
    canProceed: true,
    reason: 'İşlem yapılabilir',
    suggestedAction: 'PROCEED',
  };
}

/**
 * Kritik aksiyon mu kontrol et
 */
export function isCriticalAction(actionType: ActionType): boolean {
  const criticalActions: ActionType[] = [
    'PLACE_BANK_LIEN',
    'PLACE_VEHICLE_LIEN',
    'PLACE_REAL_ESTATE_LIEN',
    'PLACE_WAGE_GARNISHMENT',
    'PLACE_PENSION_GARNISHMENT',
    'SUBMIT_YAKALAMA_REQUEST',
    'REQUEST_SALE',
  ];
  return criticalActions.includes(actionType);
}

/**
 * Geri dönüşü olmayan aksiyon mu kontrol et
 */
export function isIrreversibleAction(actionType: ActionType): boolean {
  const irreversibleActions: ActionType[] = [
    'PLACE_BANK_LIEN',
    'PLACE_VEHICLE_LIEN',
    'PLACE_REAL_ESTATE_LIEN',
    'SUBMIT_YAKALAMA_REQUEST',
    'REQUEST_SALE',
    'ANNOUNCE_SALE',
  ];
  return irreversibleActions.includes(actionType);
}
