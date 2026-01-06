/**
 * Takip Tipi → Faiz Stratejisi Eşleme Konfigürasyonu
 * 
 * Bu dosya, her takip tipine göre hangi faiz türünün ve başlangıç tarihinin
 * kullanılacağını belirler. Yapılacaklar.txt'deki gereksinimlere göre hazırlandı.
 */

import { InterestTypeCode } from './types';

// ============================================================================
// ENUMS
// ============================================================================

export enum CaseType {
  // Kambiyo Takipleri (İİK 167 vd.)
  KAMBIYO_CEK = 'KAMBIYO_CEK',
  KAMBIYO_BONO = 'KAMBIYO_BONO',
  KAMBIYO_POLICE = 'KAMBIYO_POLICE',
  
  // İlamsız Takipler
  ILAMSIZ_GENEL = 'ILAMSIZ_GENEL',
  ILAMSIZ_KIRA = 'ILAMSIZ_KIRA',
  ILAMSIZ_NAFAKA = 'ILAMSIZ_NAFAKA',
  
  // İlamlı Takipler
  ILAMLI = 'ILAMLI',
  
  // Özel Takipler
  IPOTEK = 'IPOTEK',
  REHIN = 'REHIN',
  
  // TTK 1530 (Mal/Hizmet Tedariki Geç Ödeme)
  TTK_1530_SUPPLY = 'TTK_1530_SUPPLY',
}

export enum StartDateEvent {
  DRAW_DATE = 'DRAW_DATE',           // Keşide tarihi (çek)
  PRESENTATION_DATE = 'PRESENTATION_DATE', // İbraz tarihi (çek)
  DUE_DATE = 'DUE_DATE',             // Vade tarihi (senet, fatura)
  NOTICE_DATE = 'NOTICE_DATE',       // İhtar tarihi
  DEFAULT_DATE = 'DEFAULT_DATE',     // Temerrüt tarihi
  FOLLOWUP_DATE = 'FOLLOWUP_DATE',   // Takip tarihi
  JUDGMENT_DATE = 'JUDGMENT_DATE',   // İlam tarihi
  DELIVERY_DATE = 'DELIVERY_DATE',   // Teslim tarihi (TTK 1530)
}

export enum DebtNature {
  COMMERCIAL = 'COMMERCIAL',         // Ticari alacak
  CIVIL = 'CIVIL',                   // Adi alacak
  CONTRACTUAL = 'CONTRACTUAL',       // Sözleşmesel
  SUPPLY_DELAY = 'SUPPLY_DELAY',     // Mal/hizmet geç ödeme (TTK 1530)
}

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================

export interface InterestStrategy {
  /** Varsayılan faiz türü */
  defaultInterestType: InterestTypeCode | 'AUTO_BY_DEBT_NATURE';
  
  /** Başlangıç tarihi politikası */
  startDatePolicy: 'EVENT_BASED' | 'FIXED' | 'DUE_DATE_OR_30D';
  
  /** İzin verilen başlangıç olayları */
  allowedStartEvents: StartDateEvent[];
  
  /** Varsayılan başlangıç olayı */
  defaultStartEvent: StartDateEvent;
  
  /** Gün sayısı hesaplama bazı */
  dayCountBasis: 365 | 360;
  
  /** Bileşik faiz mi? */
  compounding: boolean;
  
  /** Oran serisi kaynağı */
  rateSeriesSource: 'TCMB_AVANS' | 'TCMB_TTK1530' | 'TCMB_YASAL' | 'CONTRACT';
  
  /** Ticari ilişki varsayılan mı? */
  assumeCommercial: boolean;
  
  /** Özel kurallar */
  specialRules?: {
    /** Karşılıksız çek tazminatı dahil mi? */
    includeKarsilisizCekTazminati?: boolean;
    /** İbraz >= vade kontrolü */
    requireIbrazAfterVade?: boolean;
  };
}

// ============================================================================
// STRATEGY REGISTRY
// ============================================================================

export const INTEREST_STRATEGIES: Record<CaseType, InterestStrategy> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // KAMBİYO TAKİPLERİ (İİK 167 vd.)
  // ═══════════════════════════════════════════════════════════════════════════
  
  [CaseType.KAMBIYO_CEK]: {
    defaultInterestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DRAW_DATE,
      StartDateEvent.PRESENTATION_DATE,
      StartDateEvent.NOTICE_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.PRESENTATION_DATE, // İbraz tarihi
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_AVANS',
    assumeCommercial: true,
    specialRules: {
      includeKarsilisizCekTazminati: true,
      requireIbrazAfterVade: true,
    },
  },

  [CaseType.KAMBIYO_BONO]: {
    defaultInterestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.NOTICE_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE, // Vade tarihi
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_AVANS',
    assumeCommercial: true,
  },

  [CaseType.KAMBIYO_POLICE]: {
    defaultInterestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.NOTICE_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_AVANS',
    assumeCommercial: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // İLAMSIZ TAKİPLER
  // ═══════════════════════════════════════════════════════════════════════════

  [CaseType.ILAMSIZ_GENEL]: {
    defaultInterestType: 'AUTO_BY_DEBT_NATURE', // Ticari ise avans, değilse yasal
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.NOTICE_DATE,
      StartDateEvent.DEFAULT_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_AVANS', // Ticari varsayım
    assumeCommercial: false, // Kullanıcı belirler
  },

  [CaseType.ILAMSIZ_KIRA]: {
    defaultInterestType: InterestTypeCode.LEGAL_3095, // Kira genelde yasal faiz
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.NOTICE_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_YASAL',
    assumeCommercial: false,
  },

  [CaseType.ILAMSIZ_NAFAKA]: {
    defaultInterestType: InterestTypeCode.LEGAL_3095,
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_YASAL',
    assumeCommercial: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // İLAMLI TAKİPLER
  // Not: İlamlı takiplerde faiz türü işin niteliğine göre değişir
  // Ticari iş ise → TCMB Avans, değilse → Yasal faiz
  // ═══════════════════════════════════════════════════════════════════════════

  [CaseType.ILAMLI]: {
    defaultInterestType: 'AUTO_BY_DEBT_NATURE', // Ticari ise avans, değilse yasal
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.JUDGMENT_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.JUDGMENT_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_YASAL', // Varsayılan, ticari ise TCMB_AVANS
    assumeCommercial: false, // Kullanıcı belirler
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ÖZEL TAKİPLER
  // ═══════════════════════════════════════════════════════════════════════════

  [CaseType.IPOTEK]: {
    defaultInterestType: InterestTypeCode.CONTRACTUAL, // Sözleşmesel
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.DEFAULT_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'CONTRACT',
    assumeCommercial: true,
  },

  [CaseType.REHIN]: {
    defaultInterestType: InterestTypeCode.CONTRACTUAL,
    startDatePolicy: 'EVENT_BASED',
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.DEFAULT_DATE,
      StartDateEvent.FOLLOWUP_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'CONTRACT',
    assumeCommercial: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TTK 1530 (MAL/HİZMET TEDARİKİ GEÇ ÖDEME)
  // ═══════════════════════════════════════════════════════════════════════════

  [CaseType.TTK_1530_SUPPLY]: {
    defaultInterestType: InterestTypeCode.TTK_1530,
    startDatePolicy: 'DUE_DATE_OR_30D', // Vade veya teslimden 30 gün sonra
    allowedStartEvents: [
      StartDateEvent.DUE_DATE,
      StartDateEvent.DELIVERY_DATE,
    ],
    defaultStartEvent: StartDateEvent.DUE_DATE,
    dayCountBasis: 365,
    compounding: false,
    rateSeriesSource: 'TCMB_TTK1530',
    assumeCommercial: true,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Takip tipine göre faiz stratejisini döndürür
 */
export function getInterestStrategy(caseType: CaseType): InterestStrategy {
  return INTEREST_STRATEGIES[caseType] || INTEREST_STRATEGIES[CaseType.ILAMSIZ_GENEL];
}

/**
 * Alacak niteliğine göre faiz türünü belirler
 */
export function resolveInterestTypeByDebtNature(
  debtNature: DebtNature,
): InterestTypeCode {
  switch (debtNature) {
    case DebtNature.COMMERCIAL:
      return InterestTypeCode.COMMERCIAL_AVANS_3095_2_2;
    case DebtNature.SUPPLY_DELAY:
      return InterestTypeCode.TTK_1530;
    case DebtNature.CONTRACTUAL:
      return InterestTypeCode.CONTRACTUAL;
    case DebtNature.CIVIL:
    default:
      return InterestTypeCode.LEGAL_3095;
  }
}

/**
 * Başlangıç olayı etiketlerini döndürür
 */
export const START_DATE_EVENT_LABELS: Record<StartDateEvent, string> = {
  [StartDateEvent.DRAW_DATE]: 'Keşide Tarihi',
  [StartDateEvent.PRESENTATION_DATE]: 'İbraz Tarihi',
  [StartDateEvent.DUE_DATE]: 'Vade Tarihi',
  [StartDateEvent.NOTICE_DATE]: 'İhtar Tarihi',
  [StartDateEvent.DEFAULT_DATE]: 'Temerrüt Tarihi',
  [StartDateEvent.FOLLOWUP_DATE]: 'Takip Tarihi',
  [StartDateEvent.JUDGMENT_DATE]: 'İlam Tarihi',
  [StartDateEvent.DELIVERY_DATE]: 'Teslim Tarihi',
};
