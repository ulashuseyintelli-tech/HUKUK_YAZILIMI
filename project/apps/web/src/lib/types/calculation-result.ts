/**
 * Calculation Result Types
 * 
 * UNAVAILABLE state için tip güvenli sonuç tipleri.
 * "0 döndür" yerine "yok" semantiği.
 * 
 * @see docs/single-source-of-truth-architecture.md
 */

/**
 * Hesaplama durumu
 */
export type CalculationStatus = 
  | 'SUCCESS'      // Hesaplama başarılı
  | 'UNAVAILABLE'  // Servis erişilemez
  | 'INVALID_INPUT' // Geçersiz girdi
  | 'LOADING';     // Yükleniyor

/**
 * Tip güvenli hesaplama sonucu
 * 
 * "0" yerine "null" veya "UNAVAILABLE" döner.
 * UI bu durumu "Hesaplanamadı" olarak gösterir.
 */
export interface CalculationResult<T> {
  status: CalculationStatus;
  data: T | null;
  error?: {
    code: string;
    message: string;
  };
  cached?: boolean;
  cacheExpiry?: string;
}

/**
 * Faiz hesaplama sonucu
 */
export interface InterestCalculationData {
  estimatedInterest: number;
  currentRate: number;
  days: number;
  interestType: string;
}

/**
 * Masraf hesaplama sonucu
 */
export interface FeeCalculationData {
  estimatedFees: number;
  estimatedAttorneyFee: number;
  tariffYear: number;
  breakdown: {
    basvurmaHarci: number;
    vekaletHarci: number;
    pesinHarc: number;
    dosyaGideri: number;
    tebligatGideri: number;
    vekaletPulu: number;
  };
}

/**
 * Birleşik preview sonucu (gelecek için)
 */
export interface CombinedPreviewData {
  interest: InterestCalculationData | null;
  fees: FeeCalculationData | null;
  warnings?: string[];
}

/**
 * UNAVAILABLE sonucu oluştur
 */
export function createUnavailableResult<T>(
  code: string,
  message: string
): CalculationResult<T> {
  return {
    status: 'UNAVAILABLE',
    data: null,
    error: { code, message },
    cached: false,
  };
}

/**
 * SUCCESS sonucu oluştur
 */
export function createSuccessResult<T>(
  data: T,
  cached: boolean = false,
  cacheExpiry?: string
): CalculationResult<T> {
  return {
    status: 'SUCCESS',
    data,
    cached,
    cacheExpiry,
  };
}

/**
 * LOADING sonucu oluştur
 */
export function createLoadingResult<T>(): CalculationResult<T> {
  return {
    status: 'LOADING',
    data: null,
  };
}

/**
 * Sonuç başarılı mı kontrol et
 */
export function isSuccess<T>(result: CalculationResult<T>): result is CalculationResult<T> & { data: T } {
  return result.status === 'SUCCESS' && result.data !== null;
}

/**
 * Sonuç kullanılamaz mı kontrol et
 */
export function isUnavailable<T>(result: CalculationResult<T>): boolean {
  return result.status === 'UNAVAILABLE';
}

export default CalculationResult;
