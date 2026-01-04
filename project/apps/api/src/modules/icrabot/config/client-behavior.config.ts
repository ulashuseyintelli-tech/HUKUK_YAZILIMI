/**
 * CLIENT BEHAVIOR CONFIG v5
 * 
 * Müvekkil ödeme davranışı modelleme.
 * Hatırlatma planı optimizasyonu.
 * Avans tahsilat tahmini.
 */

// ==================== TYPES ====================

export type ClientSegment =
  | 'PREMIUM'           // Hızlı ödeyen, yüksek hacimli
  | 'STANDARD'          // Normal ödeme davranışı
  | 'SLOW_PAYER'        // Geç ödeyen
  | 'PROBLEMATIC'       // Sorunlu (sık gecikme, itiraz)
  | 'NEW';              // Yeni müvekkil (veri yok)

export type PaymentBehavior =
  | 'IMMEDIATE'         // Hemen öder (0-2 gün)
  | 'PROMPT'            // Çabuk öder (3-7 gün)
  | 'NORMAL'            // Normal sürede öder (8-14 gün)
  | 'DELAYED'           // Gecikmeli öder (15-30 gün)
  | 'VERY_DELAYED'      // Çok gecikmeli (30+ gün)
  | 'UNPREDICTABLE';    // Tahmin edilemez

export interface ClientProfile {
  clientId: string;
  segment: ClientSegment;
  paymentBehavior: PaymentBehavior;
  
  // İstatistikler
  stats: ClientPaymentStats;
  
  // Tercihler
  preferences: ClientPreferences;
  
  // Skorlar
  scores: ClientScores;
  
  // Önerilen strateji
  recommendedStrategy: ReminderStrategy;
}

export interface ClientPaymentStats {
  // Genel
  totalAdvanceRequests: number;
  totalAdvancesPaid: number;
  totalAdvancesOverdue: number;
  
  // Süre
  avgPaymentDays: number;
  medianPaymentDays: number;
  minPaymentDays: number;
  maxPaymentDays: number;
  
  // Tutarlar
  totalAmountRequested: number;
  totalAmountPaid: number;
  avgAdvanceAmount: number;
  
  // Hatırlatma
  avgRemindersBeforePayment: number;
  responseRateToReminders: number; // 0-1
  
  // Son aktivite
  lastAdvanceRequestDate?: Date;
  lastPaymentDate?: Date;
  daysSinceLastPayment?: number;
}

export interface ClientPreferences {
  preferredChannel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PHONE';
  preferredContactTime: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ANY';
  preferredLanguage: 'TR' | 'EN';
  
  // İletişim sıklığı toleransı
  maxRemindersPerWeek: number;
  
  // Özel notlar
  notes?: string;
}

export interface ClientScores {
  // Ödeme güvenilirliği (0-100)
  reliabilityScore: number;
  
  // Hız skoru (0-100)
  speedScore: number;
  
  // İletişim skoru (0-100)
  communicationScore: number;
  
  // Genel skor (0-100)
  overallScore: number;
}

export interface ReminderStrategy {
  strategyId: string;
  name: string;
  
  // Hatırlatma planı
  reminderPlan: ReminderPlanItem[];
  
  // Eskalasyon
  escalationRules: EscalationRule[];
  
  // Özel ayarlar
  settings: ReminderSettings;
}

export interface ReminderPlanItem {
  dayOffset: number;           // Talep tarihinden kaç gün sonra
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PHONE';
  template: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  skipIfPaid: boolean;
  skipIfResponded: boolean;
}

export interface EscalationRule {
  triggerAfterDays: number;
  triggerAfterReminders: number;
  action: 'ESCALATE_TO_ATTORNEY' | 'ESCALATE_TO_PARTNER' | 'PAUSE_CASE' | 'SEND_FORMAL_NOTICE';
  notifyRecipients: string[];
}

export interface ReminderSettings {
  // Minimum gün aralığı
  minDaysBetweenReminders: number;
  
  // Maksimum hatırlatma sayısı
  maxTotalReminders: number;
  
  // Hafta sonu gönderim
  allowWeekendReminders: boolean;
  
  // Tatil günleri
  skipHolidays: boolean;
  
  // Otomatik eskalasyon
  autoEscalate: boolean;
}

// ==================== SEGMENT DEFINITIONS ====================

export const SEGMENT_DEFINITIONS: Record<ClientSegment, {
  name: string;
  description: string;
  criteria: {
    minReliabilityScore: number;
    maxAvgPaymentDays: number;
    minTotalAdvances: number;
  };
}> = {
  PREMIUM: {
    name: 'Premium Müvekkil',
    description: 'Hızlı ödeyen, güvenilir müvekkil',
    criteria: {
      minReliabilityScore: 85,
      maxAvgPaymentDays: 5,
      minTotalAdvances: 5,
    },
  },
  STANDARD: {
    name: 'Standart Müvekkil',
    description: 'Normal ödeme davranışı gösteren müvekkil',
    criteria: {
      minReliabilityScore: 60,
      maxAvgPaymentDays: 14,
      minTotalAdvances: 3,
    },
  },
  SLOW_PAYER: {
    name: 'Yavaş Ödeyen',
    description: 'Gecikmeli ödeme yapan müvekkil',
    criteria: {
      minReliabilityScore: 40,
      maxAvgPaymentDays: 30,
      minTotalAdvances: 2,
    },
  },
  PROBLEMATIC: {
    name: 'Sorunlu Müvekkil',
    description: 'Sık gecikme veya ödeme sorunu yaşanan müvekkil',
    criteria: {
      minReliabilityScore: 0,
      maxAvgPaymentDays: 999,
      minTotalAdvances: 1,
    },
  },
  NEW: {
    name: 'Yeni Müvekkil',
    description: 'Henüz yeterli veri olmayan müvekkil',
    criteria: {
      minReliabilityScore: 0,
      maxAvgPaymentDays: 999,
      minTotalAdvances: 0,
    },
  },
};

// ==================== REMINDER STRATEGIES ====================

export const REMINDER_STRATEGIES: Record<ClientSegment, ReminderStrategy> = {
  PREMIUM: {
    strategyId: 'STRATEGY_PREMIUM',
    name: 'Premium Strateji',
    reminderPlan: [
      { dayOffset: 0, channel: 'EMAIL', template: 'AVANS_TALEBI', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 7, channel: 'EMAIL', template: 'AVANS_HATIRLATMA', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: true },
    ],
    escalationRules: [
      { triggerAfterDays: 14, triggerAfterReminders: 2, action: 'ESCALATE_TO_ATTORNEY', notifyRecipients: ['attorney'] },
    ],
    settings: {
      minDaysBetweenReminders: 7,
      maxTotalReminders: 2,
      allowWeekendReminders: false,
      skipHolidays: true,
      autoEscalate: false,
    },
  },
  
  STANDARD: {
    strategyId: 'STRATEGY_STANDARD',
    name: 'Standart Strateji',
    reminderPlan: [
      { dayOffset: 0, channel: 'EMAIL', template: 'AVANS_TALEBI', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 3, channel: 'SMS', template: 'AVANS_HATIRLATMA_KISA', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 7, channel: 'EMAIL', template: 'AVANS_HATIRLATMA', priority: 'HIGH', skipIfPaid: true, skipIfResponded: true },
      { dayOffset: 10, channel: 'SMS', template: 'AVANS_HATIRLATMA_KISA', priority: 'HIGH', skipIfPaid: true, skipIfResponded: false },
    ],
    escalationRules: [
      { triggerAfterDays: 14, triggerAfterReminders: 4, action: 'ESCALATE_TO_ATTORNEY', notifyRecipients: ['attorney'] },
    ],
    settings: {
      minDaysBetweenReminders: 3,
      maxTotalReminders: 4,
      allowWeekendReminders: false,
      skipHolidays: true,
      autoEscalate: true,
    },
  },
  
  SLOW_PAYER: {
    strategyId: 'STRATEGY_SLOW',
    name: 'Yavaş Ödeyen Stratejisi',
    reminderPlan: [
      { dayOffset: 0, channel: 'EMAIL', template: 'AVANS_TALEBI', priority: 'HIGH', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 2, channel: 'SMS', template: 'AVANS_HATIRLATMA_KISA', priority: 'HIGH', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 5, channel: 'EMAIL', template: 'AVANS_HATIRLATMA', priority: 'HIGH', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 7, channel: 'PHONE', template: 'AVANS_TELEFON', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 10, channel: 'EMAIL', template: 'AVANS_SON_UYARI', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 14, channel: 'SMS', template: 'AVANS_SON_UYARI_KISA', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
    ],
    escalationRules: [
      { triggerAfterDays: 7, triggerAfterReminders: 3, action: 'ESCALATE_TO_ATTORNEY', notifyRecipients: ['attorney'] },
      { triggerAfterDays: 14, triggerAfterReminders: 5, action: 'ESCALATE_TO_PARTNER', notifyRecipients: ['partner', 'attorney'] },
    ],
    settings: {
      minDaysBetweenReminders: 2,
      maxTotalReminders: 6,
      allowWeekendReminders: true,
      skipHolidays: false,
      autoEscalate: true,
    },
  },
  
  PROBLEMATIC: {
    strategyId: 'STRATEGY_PROBLEMATIC',
    name: 'Sorunlu Müvekkil Stratejisi',
    reminderPlan: [
      { dayOffset: 0, channel: 'EMAIL', template: 'AVANS_TALEBI_RESMI', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 1, channel: 'SMS', template: 'AVANS_HATIRLATMA_KISA', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 3, channel: 'PHONE', template: 'AVANS_TELEFON', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 5, channel: 'EMAIL', template: 'AVANS_SON_UYARI', priority: 'URGENT', skipIfPaid: true, skipIfResponded: false },
    ],
    escalationRules: [
      { triggerAfterDays: 3, triggerAfterReminders: 2, action: 'ESCALATE_TO_ATTORNEY', notifyRecipients: ['attorney'] },
      { triggerAfterDays: 7, triggerAfterReminders: 4, action: 'PAUSE_CASE', notifyRecipients: ['attorney', 'partner'] },
    ],
    settings: {
      minDaysBetweenReminders: 1,
      maxTotalReminders: 4,
      allowWeekendReminders: true,
      skipHolidays: false,
      autoEscalate: true,
    },
  },
  
  NEW: {
    strategyId: 'STRATEGY_NEW',
    name: 'Yeni Müvekkil Stratejisi',
    reminderPlan: [
      { dayOffset: 0, channel: 'EMAIL', template: 'AVANS_TALEBI', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 5, channel: 'EMAIL', template: 'AVANS_HATIRLATMA', priority: 'NORMAL', skipIfPaid: true, skipIfResponded: false },
      { dayOffset: 10, channel: 'SMS', template: 'AVANS_HATIRLATMA_KISA', priority: 'HIGH', skipIfPaid: true, skipIfResponded: false },
    ],
    escalationRules: [
      { triggerAfterDays: 14, triggerAfterReminders: 3, action: 'ESCALATE_TO_ATTORNEY', notifyRecipients: ['attorney'] },
    ],
    settings: {
      minDaysBetweenReminders: 5,
      maxTotalReminders: 3,
      allowWeekendReminders: false,
      skipHolidays: true,
      autoEscalate: true,
    },
  },
};

// ==================== SCORING FUNCTIONS ====================

/**
 * Müvekkil güvenilirlik skoru hesapla
 */
export function calculateReliabilityScore(stats: ClientPaymentStats): number {
  if (stats.totalAdvanceRequests === 0) return 50; // Yeni müvekkil
  
  let score = 50; // Başlangıç
  
  // Ödeme oranı (+30 puan max)
  const paymentRate = stats.totalAdvancesPaid / stats.totalAdvanceRequests;
  score += paymentRate * 30;
  
  // Gecikme oranı (-20 puan max)
  const overdueRate = stats.totalAdvancesOverdue / stats.totalAdvanceRequests;
  score -= overdueRate * 20;
  
  // Ortalama ödeme süresi (+20 puan max)
  if (stats.avgPaymentDays <= 3) score += 20;
  else if (stats.avgPaymentDays <= 7) score += 15;
  else if (stats.avgPaymentDays <= 14) score += 10;
  else if (stats.avgPaymentDays <= 21) score += 5;
  else score -= 5;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Müvekkil hız skoru hesapla
 */
export function calculateSpeedScore(stats: ClientPaymentStats): number {
  if (stats.totalAdvancesPaid === 0) return 50;
  
  // Ortalama ödeme süresine göre skor
  if (stats.avgPaymentDays <= 2) return 100;
  if (stats.avgPaymentDays <= 5) return 85;
  if (stats.avgPaymentDays <= 7) return 70;
  if (stats.avgPaymentDays <= 14) return 55;
  if (stats.avgPaymentDays <= 21) return 40;
  if (stats.avgPaymentDays <= 30) return 25;
  return 10;
}

/**
 * Müvekkil iletişim skoru hesapla
 */
export function calculateCommunicationScore(stats: ClientPaymentStats): number {
  let score = 50;
  
  // Hatırlatma yanıt oranı (+30 puan max)
  score += stats.responseRateToReminders * 30;
  
  // Ortalama hatırlatma sayısı (-20 puan max)
  if (stats.avgRemindersBeforePayment <= 1) score += 20;
  else if (stats.avgRemindersBeforePayment <= 2) score += 10;
  else if (stats.avgRemindersBeforePayment <= 3) score += 0;
  else if (stats.avgRemindersBeforePayment <= 4) score -= 10;
  else score -= 20;
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Genel skor hesapla
 */
export function calculateOverallScore(scores: Omit<ClientScores, 'overallScore'>): number {
  return Math.round(
    scores.reliabilityScore * 0.5 +
    scores.speedScore * 0.3 +
    scores.communicationScore * 0.2
  );
}

/**
 * Müvekkil segmentini belirle
 */
export function determineClientSegment(
  stats: ClientPaymentStats,
  scores: ClientScores
): ClientSegment {
  // Yeni müvekkil kontrolü
  if (stats.totalAdvanceRequests < 2) {
    return 'NEW';
  }
  
  // Premium
  if (
    scores.reliabilityScore >= SEGMENT_DEFINITIONS.PREMIUM.criteria.minReliabilityScore &&
    stats.avgPaymentDays <= SEGMENT_DEFINITIONS.PREMIUM.criteria.maxAvgPaymentDays
  ) {
    return 'PREMIUM';
  }
  
  // Standard
  if (
    scores.reliabilityScore >= SEGMENT_DEFINITIONS.STANDARD.criteria.minReliabilityScore &&
    stats.avgPaymentDays <= SEGMENT_DEFINITIONS.STANDARD.criteria.maxAvgPaymentDays
  ) {
    return 'STANDARD';
  }
  
  // Slow Payer
  if (
    scores.reliabilityScore >= SEGMENT_DEFINITIONS.SLOW_PAYER.criteria.minReliabilityScore &&
    stats.avgPaymentDays <= SEGMENT_DEFINITIONS.SLOW_PAYER.criteria.maxAvgPaymentDays
  ) {
    return 'SLOW_PAYER';
  }
  
  // Problematic
  return 'PROBLEMATIC';
}

/**
 * Ödeme davranışını belirle
 */
export function determinePaymentBehavior(stats: ClientPaymentStats): PaymentBehavior {
  if (stats.totalAdvancesPaid === 0) return 'UNPREDICTABLE';
  
  const avg = stats.avgPaymentDays;
  const variance = stats.maxPaymentDays - stats.minPaymentDays;
  
  // Yüksek varyans = tahmin edilemez
  if (variance > 20) return 'UNPREDICTABLE';
  
  if (avg <= 2) return 'IMMEDIATE';
  if (avg <= 7) return 'PROMPT';
  if (avg <= 14) return 'NORMAL';
  if (avg <= 30) return 'DELAYED';
  return 'VERY_DELAYED';
}

// ==================== PROFILE FUNCTIONS ====================

/**
 * Müvekkil profili oluştur
 */
export function buildClientProfile(
  clientId: string,
  stats: ClientPaymentStats,
  preferences?: Partial<ClientPreferences>
): ClientProfile {
  // Skorları hesapla
  const reliabilityScore = calculateReliabilityScore(stats);
  const speedScore = calculateSpeedScore(stats);
  const communicationScore = calculateCommunicationScore(stats);
  const overallScore = calculateOverallScore({ reliabilityScore, speedScore, communicationScore });
  
  const scores: ClientScores = {
    reliabilityScore,
    speedScore,
    communicationScore,
    overallScore,
  };
  
  // Segment ve davranış belirle
  const segment = determineClientSegment(stats, scores);
  const paymentBehavior = determinePaymentBehavior(stats);
  
  // Varsayılan tercihler
  const defaultPreferences: ClientPreferences = {
    preferredChannel: 'EMAIL',
    preferredContactTime: 'MORNING',
    preferredLanguage: 'TR',
    maxRemindersPerWeek: 2,
  };
  
  return {
    clientId,
    segment,
    paymentBehavior,
    stats,
    preferences: { ...defaultPreferences, ...preferences },
    scores,
    recommendedStrategy: REMINDER_STRATEGIES[segment],
  };
}

/**
 * Tahmini ödeme süresi
 */
export function predictPaymentDays(profile: ClientProfile): {
  expected: number;
  min: number;
  max: number;
  confidence: number;
} {
  const { stats, paymentBehavior } = profile;
  
  // Yeterli veri yoksa varsayılan
  if (stats.totalAdvancesPaid < 3) {
    return {
      expected: 10,
      min: 3,
      max: 21,
      confidence: 0.3,
    };
  }
  
  // Davranışa göre tahmin
  const behaviorMultiplier: Record<PaymentBehavior, number> = {
    IMMEDIATE: 0.8,
    PROMPT: 0.9,
    NORMAL: 1.0,
    DELAYED: 1.1,
    VERY_DELAYED: 1.3,
    UNPREDICTABLE: 1.0,
  };
  
  const multiplier = behaviorMultiplier[paymentBehavior];
  const expected = Math.round(stats.avgPaymentDays * multiplier);
  
  // Güven hesapla
  const variance = stats.maxPaymentDays - stats.minPaymentDays;
  const confidence = paymentBehavior === 'UNPREDICTABLE' ? 0.3 : Math.max(0.4, 1 - variance / 30);
  
  return {
    expected,
    min: Math.max(1, stats.minPaymentDays),
    max: stats.maxPaymentDays + 7,
    confidence,
  };
}

/**
 * Sonraki hatırlatma zamanını hesapla
 */
export function getNextReminderTime(
  profile: ClientProfile,
  advanceRequestDate: Date,
  remindersSent: number,
  lastReminderDate?: Date
): Date | null {
  const strategy = profile.recommendedStrategy;
  const plan = strategy.reminderPlan;
  
  // Maksimum hatırlatma kontrolü
  if (remindersSent >= strategy.settings.maxTotalReminders) {
    return null;
  }
  
  // Sonraki planlanmış hatırlatmayı bul
  const nextPlanItem = plan[remindersSent];
  if (!nextPlanItem) {
    return null;
  }
  
  // Tarih hesapla
  const nextDate = new Date(advanceRequestDate);
  nextDate.setDate(nextDate.getDate() + nextPlanItem.dayOffset);
  
  // Minimum aralık kontrolü
  if (lastReminderDate) {
    const minNextDate = new Date(lastReminderDate);
    minNextDate.setDate(minNextDate.getDate() + strategy.settings.minDaysBetweenReminders);
    
    if (nextDate < minNextDate) {
      nextDate.setTime(minNextDate.getTime());
    }
  }
  
  // Hafta sonu kontrolü
  if (!strategy.settings.allowWeekendReminders) {
    const day = nextDate.getDay();
    if (day === 0) nextDate.setDate(nextDate.getDate() + 1); // Pazar → Pazartesi
    if (day === 6) nextDate.setDate(nextDate.getDate() + 2); // Cumartesi → Pazartesi
  }
  
  return nextDate;
}

/**
 * Eskalasyon gerekli mi kontrol et
 */
export function checkEscalation(
  profile: ClientProfile,
  advanceRequestDate: Date,
  remindersSent: number,
  isPaid: boolean
): EscalationRule | null {
  if (isPaid) return null;
  
  const strategy = profile.recommendedStrategy;
  const daysSinceRequest = Math.floor(
    (Date.now() - advanceRequestDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // Eskalasyon kurallarını kontrol et
  for (const rule of strategy.escalationRules) {
    if (
      daysSinceRequest >= rule.triggerAfterDays &&
      remindersSent >= rule.triggerAfterReminders
    ) {
      return rule;
    }
  }
  
  return null;
}
