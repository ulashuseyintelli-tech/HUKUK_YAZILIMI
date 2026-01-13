/**
 * Task 2.1 - CaseTypeStrategy Interface
 *
 * Her dava türü için faiz hesaplama stratejisi
 * Requirements: 2.1-2.8
 */

import { InterestTypeCode } from '../types/domain.types';

// ═══════════════════════════════════════════════════════════════════════════
// CASE TYPE ENUM
// ═══════════════════════════════════════════════════════════════════════════

export enum CaseType {
  /** Kambiyo senedi (çek, bono, poliçe) */
  KAMBIYO_SENEDI = 'KAMBIYO_SENEDI',

  /** İlamsız icra (genel haciz yolu) */
  ILAMSIZ_GENEL = 'ILAMSIZ_GENEL',

  /** İlamlı icra */
  ILAMLI = 'ILAMLI',

  /** TTK 1530 - Ticari işlerde temerrüt */
  TTK_1530 = 'TTK_1530',

  /** Kira alacağı */
  KIRA_ALACAGI = 'KIRA_ALACAGI',

  /** İş hukuku alacağı */
  IS_HUKUKU = 'IS_HUKUKU',

  /** Tüketici alacağı */
  TUKETICI = 'TUKETICI',
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY INTERFACE
// ═══════════════════════════════════════════════════════════════════════════

export interface ClaimBuildConfig {
  /** Varsayılan faiz başlangıç kuralı */
  defaultInterestStartRule: 'DUE_DATE' | 'DEMAND_DATE' | 'DUE_DATE_OR_30D';

  /** Varsayılan faiz türü */
  defaultInterestType: InterestTypeCode;

  /** Fer'i alacak türleri */
  allowedAncillaryTypes: string[];

  /** Masraf türleri */
  allowedExpenseTypes: string[];
}

export interface RateConfig {
  /** İzin verilen faiz türleri */
  allowedRateTypes: InterestTypeCode[];

  /** Varsayılan faiz türü */
  defaultRateType: InterestTypeCode;

  /** Maksimum sözleşme faizi oranı (yasal faizin katı) */
  maxContractRateMultiplier: number;

  /** Döviz alacağı için izin verilen para birimleri */
  allowedCurrencies: string[];
}

export interface PolicyConfig {
  /** Varsayılan yuvarlama kapsamı */
  defaultRoundingScope: 'PER_SEGMENT' | 'TOTAL_ONLY';

  /** Varsayılan yuvarlama modu */
  defaultRoundingMode: 'HALF_UP' | 'HALF_EVEN' | 'DOWN';

  /** Varsayılan alacak öncelik kuralı */
  defaultClaimPriorityRule: 'OLDEST_DUE_FIRST' | 'HIGHEST_RATE_FIRST' | 'CUSTOM';

  /** Aynı gün ödeme kuralı */
  sameDayPaymentRule: 'START_OF_DAY' | 'END_OF_DAY';

  /** Gap policy */
  gapPolicy: 'BLOCK' | 'WARN' | 'INFER';
}

export interface CaseTypeStrategy {
  /** Strateji adı */
  readonly name: string;

  /** Dava türü */
  readonly caseType: CaseType;

  /** Açıklama */
  readonly description: string;

  /** Alacak oluşturma konfigürasyonu */
  getClaimConfig(): ClaimBuildConfig;

  /** Oran konfigürasyonu */
  getRateConfig(): RateConfig;

  /** Policy konfigürasyonu */
  getPolicyConfig(): PolicyConfig;

  /** Bu strateji için geçerli mi? */
  isApplicable(metadata: CaseMetadata): boolean;
}

export interface CaseMetadata {
  /** Dava türü */
  caseType?: CaseType;

  /** Alacak türü (çek, bono, vb.) */
  claimType?: string;

  /** Ticari işlem mi? */
  isCommercial?: boolean;

  /** Tüketici işlemi mi? */
  isConsumer?: boolean;

  /** Para birimi */
  currency?: string;

  /** Sözleşme faizi var mı? */
  hasContractRate?: boolean;

  /** Ek metadata */
  [key: string]: unknown;
}
