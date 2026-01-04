/**
 * MANUAL OVERRIDE CONFIG v5
 * 
 * Otomatik kararların manuel olarak geçersiz kılınması.
 * Audit kaydı ve yetki kontrolü.
 */

import { ActionType } from './idempotency.config';
import { RiskLevel } from './risk-scoring.config';
import { LockType, GateType } from './locks-and-gates.config';

// ==================== TYPES ====================

export type OverrideType =
  | 'UNLOCK_LOCK'           // Kilidi aç
  | 'BYPASS_GATE'           // Kapıyı atla
  | 'ACCEPT_RISK'           // Riski kabul et
  | 'FORCE_ACTION'          // Aksiyonu zorla
  | 'SKIP_VALIDATION'       // Validasyonu atla
  | 'CHANGE_DECISION'       // Kararı değiştir
  | 'OVERRIDE_SIMULATION';  // Simülasyon sonucunu geçersiz kıl

export type OverrideStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED';

export type RequiredRole = 'ATTORNEY' | 'PARTNER' | 'ADMIN' | 'SYSTEM';

export interface OverrideRequest {
  requestId: string;
  overrideType: OverrideType;
  
  // Hedef
  targetType: 'LOCK' | 'GATE' | 'ACTION' | 'DECISION' | 'SIMULATION';
  targetId: string;
  
  // Bağlam
  caseId: string;
  debtorId?: string;
  assetId?: string;
  
  // Talep bilgileri
  requestedBy: string;
  requestedByRole: RequiredRole;
  requestedAt: Date;
  reason: string;
  justification: string;
  
  // Onay bilgileri
  status: OverrideStatus;
  approvedBy?: string;
  approvedByRole?: RequiredRole;
  approvedAt?: Date;
  rejectionReason?: string;
  
  // Geçerlilik
  expiresAt?: Date;
  executedAt?: Date;
  
  // Audit
  auditTrail: OverrideAuditEntry[];
}

export interface OverrideAuditEntry {
  timestamp: Date;
  action: string;
  performedBy: string;
  role: RequiredRole;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export interface OverrideRule {
  ruleId: string;
  overrideType: OverrideType;
  
  // İzin verilen durumlar
  allowedFor: {
    lockTypes?: LockType[];
    gateTypes?: GateType[];
    actionTypes?: ActionType[];
    riskLevels?: RiskLevel[];
  };
  
  // Yetki gereksinimleri
  requiredRole: RequiredRole;
  requiresApproval: boolean;
  approverRole?: RequiredRole;
  
  // Kısıtlamalar
  maxOverridesPerDay: number;
  maxOverridesPerCase: number;
  cooldownMinutes: number;
  
  // Geçerlilik
  validityHours: number;
  
  // Audit
  requiresJustification: boolean;
  minJustificationLength: number;
  
  isActive: boolean;
}

export interface OverridePolicy {
  // Genel ayarlar
  globalEnabled: boolean;
  
  // Varsayılan geçerlilik süresi (saat)
  defaultValidityHours: number;
  
  // Günlük limit
  dailyOverrideLimit: number;
  
  // Zorunlu alanlar
  requireReason: boolean;
  requireJustification: boolean;
  
  // Bildirimler
  notifyOnOverride: boolean;
  notifyRecipients: string[];
  
  // Audit
  auditRetentionDays: number;
}

// ==================== OVERRIDE RULES ====================

export const OVERRIDE_RULES: OverrideRule[] = [
  // Kilit açma kuralları
  {
    ruleId: 'OR_UNLOCK_COST',
    overrideType: 'UNLOCK_LOCK',
    allowedFor: {
      lockTypes: ['LOCK_COST_ACTIONS', 'LOCK_ADVANCE_PENDING'],
    },
    requiredRole: 'ATTORNEY',
    requiresApproval: false,
    maxOverridesPerDay: 10,
    maxOverridesPerCase: 3,
    cooldownMinutes: 60,
    validityHours: 24,
    requiresJustification: true,
    minJustificationLength: 20,
    isActive: true,
  },
  
  {
    ruleId: 'OR_UNLOCK_EXECUTION',
    overrideType: 'UNLOCK_LOCK',
    allowedFor: {
      lockTypes: ['LOCK_EXECUTION_ACTIONS', 'LOCK_SALE_ACTIONS'],
    },
    requiredRole: 'ATTORNEY',
    requiresApproval: true,
    approverRole: 'PARTNER',
    maxOverridesPerDay: 5,
    maxOverridesPerCase: 2,
    cooldownMinutes: 120,
    validityHours: 12,
    requiresJustification: true,
    minJustificationLength: 50,
    isActive: true,
  },
  
  // Kapı atlama kuralları
  {
    ruleId: 'OR_BYPASS_COST_GATE',
    overrideType: 'BYPASS_GATE',
    allowedFor: {
      gateTypes: ['GATE_COST'],
    },
    requiredRole: 'ATTORNEY',
    requiresApproval: true,
    approverRole: 'PARTNER',
    maxOverridesPerDay: 3,
    maxOverridesPerCase: 1,
    cooldownMinutes: 240,
    validityHours: 8,
    requiresJustification: true,
    minJustificationLength: 50,
    isActive: true,
  },
  
  {
    ruleId: 'OR_BYPASS_APPROVAL_GATE',
    overrideType: 'BYPASS_GATE',
    allowedFor: {
      gateTypes: ['GATE_APPROVAL', 'GATE_RISK'],
    },
    requiredRole: 'PARTNER',
    requiresApproval: false,
    maxOverridesPerDay: 5,
    maxOverridesPerCase: 2,
    cooldownMinutes: 60,
    validityHours: 24,
    requiresJustification: true,
    minJustificationLength: 30,
    isActive: true,
  },
  
  // Risk kabul kuralları
  {
    ruleId: 'OR_ACCEPT_HIGH_RISK',
    overrideType: 'ACCEPT_RISK',
    allowedFor: {
      riskLevels: ['HIGH'],
    },
    requiredRole: 'ATTORNEY',
    requiresApproval: true,
    approverRole: 'PARTNER',
    maxOverridesPerDay: 3,
    maxOverridesPerCase: 1,
    cooldownMinutes: 480,
    validityHours: 24,
    requiresJustification: true,
    minJustificationLength: 100,
    isActive: true,
  },
  
  {
    ruleId: 'OR_ACCEPT_CRITICAL_RISK',
    overrideType: 'ACCEPT_RISK',
    allowedFor: {
      riskLevels: ['CRITICAL'],
    },
    requiredRole: 'PARTNER',
    requiresApproval: true,
    approverRole: 'ADMIN',
    maxOverridesPerDay: 1,
    maxOverridesPerCase: 1,
    cooldownMinutes: 1440, // 24 saat
    validityHours: 12,
    requiresJustification: true,
    minJustificationLength: 200,
    isActive: true,
  },
  
  // Aksiyon zorlama kuralları
  {
    ruleId: 'OR_FORCE_QUERY',
    overrideType: 'FORCE_ACTION',
    allowedFor: {
      actionTypes: ['QUERY_SGK', 'QUERY_TAKBIS', 'QUERY_VEHICLE', 'QUERY_BANK', 'QUERY_TRADE_REGISTRY'],
    },
    requiredRole: 'ATTORNEY',
    requiresApproval: false,
    maxOverridesPerDay: 20,
    maxOverridesPerCase: 5,
    cooldownMinutes: 30,
    validityHours: 4,
    requiresJustification: false,
    minJustificationLength: 0,
    isActive: true,
  },
  
  {
    ruleId: 'OR_FORCE_CRITICAL_ACTION',
    overrideType: 'FORCE_ACTION',
    allowedFor: {
      actionTypes: ['SUBMIT_YAKALAMA_REQUEST', 'REQUEST_SALE', 'ANNOUNCE_SALE'],
    },
    requiredRole: 'PARTNER',
    requiresApproval: true,
    approverRole: 'ADMIN',
    maxOverridesPerDay: 2,
    maxOverridesPerCase: 1,
    cooldownMinutes: 1440,
    validityHours: 8,
    requiresJustification: true,
    minJustificationLength: 150,
    isActive: true,
  },
  
  // Simülasyon override
  {
    ruleId: 'OR_OVERRIDE_SIMULATION',
    overrideType: 'OVERRIDE_SIMULATION',
    allowedFor: {},
    requiredRole: 'ATTORNEY',
    requiresApproval: true,
    approverRole: 'PARTNER',
    maxOverridesPerDay: 5,
    maxOverridesPerCase: 2,
    cooldownMinutes: 120,
    validityHours: 24,
    requiresJustification: true,
    minJustificationLength: 50,
    isActive: true,
  },
];

// ==================== OVERRIDE POLICY ====================

export const OVERRIDE_POLICY: OverridePolicy = {
  globalEnabled: true,
  defaultValidityHours: 24,
  dailyOverrideLimit: 50,
  requireReason: true,
  requireJustification: true,
  notifyOnOverride: true,
  notifyRecipients: ['partner', 'admin'],
  auditRetentionDays: 365,
};

// ==================== PREDEFINED REASONS ====================

export const OVERRIDE_REASONS: Record<OverrideType, string[]> = {
  UNLOCK_LOCK: [
    'Müvekkil avansı nakit ödedi',
    'Müvekkil talimatı ile acil işlem',
    'Hatalı kilit - düzeltme',
    'Süre aşımı - yeniden değerlendirme',
    'Diğer',
  ],
  BYPASS_GATE: [
    'Müvekkil onayı alındı (sözlü)',
    'Acil durum - süre kısıtı',
    'Sistem hatası - manuel devam',
    'Diğer',
  ],
  ACCEPT_RISK: [
    'Müvekkil riski kabul etti',
    'Stratejik karar - uzun vadeli',
    'Kısmi tahsilat beklentisi',
    'Emsal dosya başarısı',
    'Diğer',
  ],
  FORCE_ACTION: [
    'Acil sorgu gereksinimi',
    'Sistem gecikmesi - manuel tetikleme',
    'Test amaçlı',
    'Diğer',
  ],
  SKIP_VALIDATION: [
    'Validasyon hatası - veri düzeltildi',
    'Geçici sistem sorunu',
    'Diğer',
  ],
  CHANGE_DECISION: [
    'Yeni bilgi geldi',
    'Müvekkil talebi',
    'Strateji değişikliği',
    'Diğer',
  ],
  OVERRIDE_SIMULATION: [
    'Simülasyon parametreleri hatalı',
    'Piyasa koşulları değişti',
    'Özel durum - manuel değerlendirme',
    'Diğer',
  ],
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Override kuralını bul
 */
export function findOverrideRule(
  overrideType: OverrideType,
  targetDetails: {
    lockType?: LockType;
    gateType?: GateType;
    actionType?: ActionType;
    riskLevel?: RiskLevel;
  }
): OverrideRule | null {
  const rules = OVERRIDE_RULES.filter(r => r.isActive && r.overrideType === overrideType);
  
  for (const rule of rules) {
    const { allowedFor } = rule;
    
    // Lock type kontrolü
    if (targetDetails.lockType && allowedFor.lockTypes) {
      if (allowedFor.lockTypes.includes(targetDetails.lockType)) {
        return rule;
      }
    }
    
    // Gate type kontrolü
    if (targetDetails.gateType && allowedFor.gateTypes) {
      if (allowedFor.gateTypes.includes(targetDetails.gateType)) {
        return rule;
      }
    }
    
    // Action type kontrolü
    if (targetDetails.actionType && allowedFor.actionTypes) {
      if (allowedFor.actionTypes.includes(targetDetails.actionType)) {
        return rule;
      }
    }
    
    // Risk level kontrolü
    if (targetDetails.riskLevel && allowedFor.riskLevels) {
      if (allowedFor.riskLevels.includes(targetDetails.riskLevel)) {
        return rule;
      }
    }
    
    // Genel kural (allowedFor boş)
    if (
      !allowedFor.lockTypes &&
      !allowedFor.gateTypes &&
      !allowedFor.actionTypes &&
      !allowedFor.riskLevels
    ) {
      return rule;
    }
  }
  
  return null;
}

/**
 * Override talebi oluştur
 */
export function createOverrideRequest(
  overrideType: OverrideType,
  targetType: OverrideRequest['targetType'],
  targetId: string,
  caseId: string,
  requestedBy: string,
  requestedByRole: RequiredRole,
  reason: string,
  justification: string,
  options?: {
    debtorId?: string;
    assetId?: string;
    expiresInHours?: number;
  }
): OverrideRequest {
  const now = new Date();
  const expiresAt = options?.expiresInHours
    ? new Date(now.getTime() + options.expiresInHours * 60 * 60 * 1000)
    : new Date(now.getTime() + OVERRIDE_POLICY.defaultValidityHours * 60 * 60 * 1000);
  
  return {
    requestId: `OR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    overrideType,
    targetType,
    targetId,
    caseId,
    debtorId: options?.debtorId,
    assetId: options?.assetId,
    requestedBy,
    requestedByRole,
    requestedAt: now,
    reason,
    justification,
    status: 'PENDING',
    expiresAt,
    auditTrail: [
      {
        timestamp: now,
        action: 'REQUEST_CREATED',
        performedBy: requestedBy,
        role: requestedByRole,
        details: { reason, justification },
      },
    ],
  };
}

/**
 * Override talebini onayla
 */
export function approveOverrideRequest(
  request: OverrideRequest,
  approvedBy: string,
  approvedByRole: RequiredRole
): OverrideRequest {
  const now = new Date();
  
  return {
    ...request,
    status: 'APPROVED',
    approvedBy,
    approvedByRole,
    approvedAt: now,
    auditTrail: [
      ...request.auditTrail,
      {
        timestamp: now,
        action: 'REQUEST_APPROVED',
        performedBy: approvedBy,
        role: approvedByRole,
        details: {},
      },
    ],
  };
}

/**
 * Override talebini reddet
 */
export function rejectOverrideRequest(
  request: OverrideRequest,
  rejectedBy: string,
  rejectedByRole: RequiredRole,
  rejectionReason: string
): OverrideRequest {
  const now = new Date();
  
  return {
    ...request,
    status: 'REJECTED',
    rejectionReason,
    auditTrail: [
      ...request.auditTrail,
      {
        timestamp: now,
        action: 'REQUEST_REJECTED',
        performedBy: rejectedBy,
        role: rejectedByRole,
        details: { rejectionReason },
      },
    ],
  };
}

/**
 * Override talebini çalıştır
 */
export function executeOverrideRequest(
  request: OverrideRequest,
  executedBy: string,
  executedByRole: RequiredRole
): OverrideRequest {
  const now = new Date();
  
  return {
    ...request,
    status: 'EXECUTED',
    executedAt: now,
    auditTrail: [
      ...request.auditTrail,
      {
        timestamp: now,
        action: 'REQUEST_EXECUTED',
        performedBy: executedBy,
        role: executedByRole,
        details: {},
      },
    ],
  };
}

/**
 * Override izni kontrol et
 */
export function canRequestOverride(
  overrideType: OverrideType,
  userRole: RequiredRole,
  targetDetails: {
    lockType?: LockType;
    gateType?: GateType;
    actionType?: ActionType;
    riskLevel?: RiskLevel;
  },
  existingOverrides: OverrideRequest[],
  caseId: string
): { allowed: boolean; reason?: string } {
  // Global kontrol
  if (!OVERRIDE_POLICY.globalEnabled) {
    return { allowed: false, reason: 'Override sistemi devre dışı' };
  }
  
  // Kural bul
  const rule = findOverrideRule(overrideType, targetDetails);
  if (!rule) {
    return { allowed: false, reason: 'Bu işlem için override kuralı tanımlı değil' };
  }
  
  // Rol kontrolü
  const roleHierarchy: RequiredRole[] = ['ADMIN', 'PARTNER', 'ATTORNEY', 'SYSTEM'];
  const userRoleIndex = roleHierarchy.indexOf(userRole);
  const requiredRoleIndex = roleHierarchy.indexOf(rule.requiredRole);
  
  if (userRoleIndex > requiredRoleIndex) {
    return { allowed: false, reason: `Bu işlem için ${rule.requiredRole} yetkisi gerekli` };
  }
  
  // Günlük limit kontrolü
  const today = new Date().toISOString().split('T')[0];
  const todayOverrides = existingOverrides.filter(
    o => o.requestedAt.toISOString().split('T')[0] === today &&
         o.overrideType === overrideType &&
         o.status !== 'REJECTED'
  );
  
  if (todayOverrides.length >= rule.maxOverridesPerDay) {
    return { allowed: false, reason: `Günlük override limiti (${rule.maxOverridesPerDay}) aşıldı` };
  }
  
  // Dosya bazlı limit kontrolü
  const caseOverrides = existingOverrides.filter(
    o => o.caseId === caseId &&
         o.overrideType === overrideType &&
         o.status !== 'REJECTED'
  );
  
  if (caseOverrides.length >= rule.maxOverridesPerCase) {
    return { allowed: false, reason: `Bu dosya için override limiti (${rule.maxOverridesPerCase}) aşıldı` };
  }
  
  // Cooldown kontrolü
  const lastOverride = caseOverrides
    .filter(o => o.status === 'EXECUTED')
    .sort((a, b) => (b.executedAt?.getTime() ?? 0) - (a.executedAt?.getTime() ?? 0))[0];
  
  if (lastOverride?.executedAt) {
    const minutesSinceLast = (Date.now() - lastOverride.executedAt.getTime()) / (1000 * 60);
    if (minutesSinceLast < rule.cooldownMinutes) {
      const remaining = Math.ceil(rule.cooldownMinutes - minutesSinceLast);
      return { allowed: false, reason: `Cooldown süresi: ${remaining} dakika kaldı` };
    }
  }
  
  return { allowed: true };
}

/**
 * Justification validasyonu
 */
export function validateJustification(
  overrideType: OverrideType,
  justification: string,
  targetDetails: {
    lockType?: LockType;
    gateType?: GateType;
    actionType?: ActionType;
    riskLevel?: RiskLevel;
  }
): { valid: boolean; error?: string } {
  const rule = findOverrideRule(overrideType, targetDetails);
  
  if (!rule) {
    return { valid: false, error: 'Kural bulunamadı' };
  }
  
  if (!rule.requiresJustification) {
    return { valid: true };
  }
  
  if (!justification || justification.trim().length === 0) {
    return { valid: false, error: 'Gerekçe zorunludur' };
  }
  
  if (justification.trim().length < rule.minJustificationLength) {
    return {
      valid: false,
      error: `Gerekçe en az ${rule.minJustificationLength} karakter olmalıdır`,
    };
  }
  
  return { valid: true };
}
