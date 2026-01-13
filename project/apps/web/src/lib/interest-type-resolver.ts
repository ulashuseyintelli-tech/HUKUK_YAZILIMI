/**
 * FAİZ TÜRÜ BELİRLEME MOTORU
 * 
 * Faiz türü seçimi şu kurallara göre yapılır:
 * 1. Sözleşmede akdi faiz oranı varsa → AKDI (sabit veya değişen)
 * 2. Akdi oran yoksa + ticari iş → TICARI_DEGISEN (TCMB Avans)
 * 3. Akdi oran yoksa + ticari değil → YASAL
 * 
 * Ticari iş tespiti:
 * - CEK, SENET, FATURA, CARI_HESAP → varsayılan ticari
 * - KIRA, NAFAKA, AIDAT → varsayılan ticari değil
 * - Kullanıcı override edebilir
 */

// ═══════════════════════════════════════════════════════════════════════════
// UI INTEREST TYPE (Web tarafı için kullanıcı dostu isimler)
// ═══════════════════════════════════════════════════════════════════════════

export type InterestTypeCode = 
  | 'YOK'
  | 'YASAL'
  | 'TICARI_DEGISEN'
  | 'TICARI_SABIT'
  | 'AKDI'
  | 'BANKA_TL'
  | 'KAMU_BANKA_TL';

// ═══════════════════════════════════════════════════════════════════════════
// API INTEREST TYPE (Backend InterestTypeCode enum değerleri)
// ═══════════════════════════════════════════════════════════════════════════

export type ApiInterestTypeCode =
  | 'LEGAL_3095'
  | 'COMMERCIAL_AVANS_3095_2_2'
  | 'COMMERCIAL_FIXED'
  | 'TTK_1530'
  | 'CONTRACTUAL'
  | 'MEVDUAT_TL_BANKALARCA'
  | 'MEVDUAT_USD_BANKALARCA'
  | 'MEVDUAT_EUR_BANKALARCA'
  | 'MEVDUAT_TL_KAMU'
  | 'MEVDUAT_USD_KAMU'
  | 'MEVDUAT_EUR_KAMU';

// ═══════════════════════════════════════════════════════════════════════════
// UI → API MAPPING (Request gönderirken kullan)
// ═══════════════════════════════════════════════════════════════════════════

const UI_TO_API_MAP: Record<InterestTypeCode, ApiInterestTypeCode | null> = {
  'YOK': null,
  'YASAL': 'LEGAL_3095',
  'TICARI_DEGISEN': 'COMMERCIAL_AVANS_3095_2_2',
  'TICARI_SABIT': 'COMMERCIAL_FIXED',
  'AKDI': 'CONTRACTUAL',
  'BANKA_TL': 'MEVDUAT_TL_BANKALARCA',
  'KAMU_BANKA_TL': 'MEVDUAT_TL_KAMU',
};

/**
 * UI faiz türünü API faiz türüne çevir
 * API'ye request gönderirken kullan
 */
export function mapUiToApiInterestType(uiType: InterestTypeCode): ApiInterestTypeCode | null {
  return UI_TO_API_MAP[uiType] ?? null;
}

// ═══════════════════════════════════════════════════════════════════════════
// API → UI MAPPING (Response alırken kullan)
// ═══════════════════════════════════════════════════════════════════════════

const API_TO_UI_MAP: Record<ApiInterestTypeCode, InterestTypeCode> = {
  'LEGAL_3095': 'YASAL',
  'COMMERCIAL_AVANS_3095_2_2': 'TICARI_DEGISEN',
  'COMMERCIAL_FIXED': 'TICARI_SABIT',
  'TTK_1530': 'TICARI_DEGISEN', // TTK 1530 de ticari değişen olarak göster
  'CONTRACTUAL': 'AKDI',
  'MEVDUAT_TL_BANKALARCA': 'BANKA_TL',
  'MEVDUAT_USD_BANKALARCA': 'BANKA_TL',
  'MEVDUAT_EUR_BANKALARCA': 'BANKA_TL',
  'MEVDUAT_TL_KAMU': 'KAMU_BANKA_TL',
  'MEVDUAT_USD_KAMU': 'KAMU_BANKA_TL',
  'MEVDUAT_EUR_KAMU': 'KAMU_BANKA_TL',
};

/**
 * API faiz türünü UI faiz türüne çevir
 * API'den response alırken kullan
 */
export function mapApiToUiInterestType(apiType: ApiInterestTypeCode | string): InterestTypeCode {
  return API_TO_UI_MAP[apiType as ApiInterestTypeCode] ?? 'YASAL';
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST TYPE RESOLVER (Mevcut mantık)
// ═══════════════════════════════════════════════════════════════════════════

export interface InterestTypeInput {
  /** Alacak kalem türü (CEK, SENET, FATURA, KIRA, vb.) */
  kalemTuru: string;
  /** Sözleşmede belirtilen akdi faiz oranı (varsa) */
  contractInterestRate?: number | null;
  /** Ticari iş mi? (kullanıcı override edebilir) */
  isCommercial?: boolean | null;
  /** Belge kaynağı */
  documentSource?: 'ILAM' | 'KAMBIYO' | 'SOZLESME' | 'VEKALETNAME' | null;
}

export interface InterestTypeResult {
  /** Belirlenen faiz türü kodu */
  interestType: InterestTypeCode;
  /** Sabit oran (AKDI veya TICARI_SABIT için) */
  fixedRate?: number;
  /** Açıklama */
  explanation: string;
  /** Ticari iş olarak değerlendirildi mi */
  isCommercial: boolean;
  /** Kullanıcı değiştirebilir mi */
  canOverride: boolean;
  /** Önerilen alternatifler */
  alternatives: { code: InterestTypeCode; label: string; reason: string }[];
}

/**
 * Kalem türüne göre varsayılan ticari iş durumunu belirle
 */
export function getDefaultCommercialStatus(kalemTuru: string): boolean {
  const ticariKalemler = ['CEK', 'SENET', 'FATURA', 'CARI_HESAP', 'KREDI', 'BANKA', 'IPOTEK', 'REHIN'];
  const ticariOlmayanKalemler = ['KIRA', 'NAFAKA', 'AIDAT', 'NAFAKA_BIRIKIMIS', 'NAFAKA_ISLEYECEK'];
  
  if (ticariKalemler.includes(kalemTuru)) return true;
  if (ticariOlmayanKalemler.includes(kalemTuru)) return false;
  
  // Varsayılan: ticari değil (güvenli taraf)
  return false;
}

/**
 * Faiz türünü belirle
 */
export function resolveInterestType(input: InterestTypeInput): InterestTypeResult {
  const { kalemTuru, contractInterestRate, isCommercial: userIsCommercial, documentSource } = input;
  
  // 1. Ticari iş durumunu belirle
  const defaultCommercial = getDefaultCommercialStatus(kalemTuru);
  const isCommercial = userIsCommercial ?? defaultCommercial;
  
  // 2. Kambiyo senetleri için özel kural (TTK gereği her zaman ticari)
  if (kalemTuru === 'CEK' || kalemTuru === 'SENET' || documentSource === 'KAMBIYO') {
    return {
      interestType: 'TICARI_DEGISEN',
      explanation: 'Kambiyo senetleri (çek/senet) için TTK gereği ticari temerrüt faizi uygulanır.',
      isCommercial: true,
      canOverride: false, // Kambiyo için değiştirilemez
      alternatives: [],
    };
  }
  
  // 3. İlamlı takipler için özel kural (işin niteliğine göre)
  // İş ticari ise → ticari temerrüt faizi, değilse → yasal faiz
  if (kalemTuru === 'ILAM' || documentSource === 'ILAM') {
    if (isCommercial) {
      return {
        interestType: 'TICARI_DEGISEN',
        explanation: 'Ticari iş kapsamındaki ilam için ticari temerrüt faizi uygulanır.',
        isCommercial: true,
        canOverride: true,
        alternatives: [
          { code: 'YASAL', label: 'Yasal Faiz', reason: 'İş ticari değil' },
          { code: 'AKDI', label: 'Akdi Faiz', reason: 'İlamda akdi faiz belirtilmiş' },
        ],
      };
    }
    return {
      interestType: 'YASAL',
      explanation: 'Ticari olmayan ilam için yasal faiz oranı uygulanır.',
      isCommercial: false,
      canOverride: true,
      alternatives: [
        { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'İş aslında ticari' },
        { code: 'AKDI', label: 'Akdi Faiz', reason: 'İlamda akdi faiz belirtilmiş' },
      ],
    };
  }
  
  // 3.5. Aidat alacakları için özel kural (KMK aylık %5)
  // Kat Mülkiyeti Kanunu m.20 gereği aylık %5 (yıllık %60) gecikme tazminatı uygulanabilir
  if (kalemTuru === 'AIDAT') {
    if (contractInterestRate && contractInterestRate > 0) {
      return {
        interestType: 'AKDI',
        fixedRate: contractInterestRate,
        explanation: `Yönetim planında/kararda belirtilen %${contractInterestRate} gecikme tazminatı uygulanır.`,
        isCommercial: false,
        canOverride: true,
        alternatives: [
          { code: 'YASAL', label: 'Yasal Faiz', reason: 'Yönetim planında oran yok' },
        ],
      };
    }
    // Varsayılan: KMK aylık %5 (yıllık %60)
    return {
      interestType: 'AKDI',
      fixedRate: 60, // Aylık %5 = Yıllık %60
      explanation: 'Kat Mülkiyeti Kanunu m.20 gereği aylık %5 (yıllık %60) gecikme tazminatı uygulanır.',
      isCommercial: false,
      canOverride: true,
      alternatives: [
        { code: 'YASAL', label: 'Yasal Faiz', reason: 'KMK oranı yerine yasal faiz' },
      ],
    };
  }
  
  // 3.6. Kira alacakları için özel kural (tacir kira ilişkisinde avans faizi)
  if (kalemTuru === 'KIRA') {
    // Tacir kira ilişkisinde (ticari kira) avans faizi uygulanabilir
    if (isCommercial) {
      return {
        interestType: 'TICARI_DEGISEN',
        explanation: 'Tacir kira ilişkisinde (ticari kira) TCMB avans faiz oranı uygulanır.',
        isCommercial: true,
        canOverride: true,
        alternatives: [
          { code: 'YASAL', label: 'Yasal Faiz', reason: 'Konut kirası, ticari değil' },
          { code: 'AKDI', label: 'Akdi Faiz', reason: 'Sözleşmede oran var' },
        ],
      };
    }
    // Konut kirası - yasal faiz
    return {
      interestType: 'YASAL',
      explanation: 'Konut kira alacağı için yasal faiz oranı uygulanır.',
      isCommercial: false,
      canOverride: true,
      alternatives: [
        { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'Tacir kira ilişkisi (ticari kira)' },
        { code: 'AKDI', label: 'Akdi Faiz', reason: 'Sözleşmede oran var' },
      ],
    };
  }
  
  // 4. İpotek ve Rehin için özel kural (sözleşmesel faiz öncelikli)
  if (kalemTuru === 'IPOTEK' || kalemTuru === 'REHIN') {
    if (contractInterestRate && contractInterestRate > 0) {
      return {
        interestType: 'AKDI',
        fixedRate: contractInterestRate,
        explanation: `${kalemTuru === 'IPOTEK' ? 'İpotek akit tablosunda' : 'Rehin sözleşmesinde'} belirtilen %${contractInterestRate} akdi faiz oranı uygulanır.`,
        isCommercial: true,
        canOverride: true,
        alternatives: [
          { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'Akdi oran yerine TCMB avans oranı' },
        ],
      };
    }
    // Akdi oran belirtilmemişse ticari temerrüt faizi
    return {
      interestType: 'TICARI_DEGISEN',
      explanation: `${kalemTuru === 'IPOTEK' ? 'İpotek' : 'Rehin'} alacağı için ticari temerrüt faizi uygulanır. Sözleşmede akdi oran varsa belirtiniz.`,
      isCommercial: true,
      canOverride: true,
      alternatives: [
        { code: 'AKDI', label: 'Akdi Faiz', reason: 'Sözleşmede oran var' },
      ],
    };
  }
  
  // 5. Banka/Kredi alacakları için özel kural (akdi faiz öncelikli)
  if (kalemTuru === 'KREDI' || kalemTuru === 'BANKA') {
    if (contractInterestRate && contractInterestRate > 0) {
      return {
        interestType: 'AKDI',
        fixedRate: contractInterestRate,
        explanation: `Kredi sözleşmesinde belirtilen %${contractInterestRate} akdi faiz oranı uygulanır.`,
        isCommercial: true,
        canOverride: true,
        alternatives: [
          { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'Akdi oran yerine TCMB avans oranı' },
        ],
      };
    }
    // Akdi oran belirtilmemişse ticari temerrüt faizi
    return {
      interestType: 'TICARI_DEGISEN',
      explanation: 'Banka/kredi alacağı için ticari temerrüt faizi uygulanır. Sözleşmede akdi oran varsa belirtiniz.',
      isCommercial: true,
      canOverride: true,
      alternatives: [
        { code: 'AKDI', label: 'Akdi Faiz', reason: 'Sözleşmede oran var' },
      ],
    };
  }
  
  // 6. Akdi faiz oranı varsa
  if (contractInterestRate && contractInterestRate > 0) {
    return {
      interestType: 'AKDI',
      fixedRate: contractInterestRate,
      explanation: `Sözleşmede belirtilen %${contractInterestRate} akdi faiz oranı uygulanır.`,
      isCommercial,
      canOverride: true,
      alternatives: [
        { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'Akdi oran yerine TCMB avans oranı' },
        { code: 'YASAL', label: 'Yasal Faiz', reason: 'Akdi oran yerine yasal faiz' },
      ],
    };
  }
  
  // 7. Akdi oran yok + ticari iş
  if (isCommercial) {
    return {
      interestType: 'TICARI_DEGISEN',
      explanation: 'Ticari iş kapsamında TCMB avans faiz oranı (değişen) uygulanır.',
      isCommercial: true,
      canOverride: true,
      alternatives: [
        { code: 'YASAL', label: 'Yasal Faiz', reason: 'Ticari değil, yasal faiz uygulansın' },
        { code: 'TICARI_SABIT', label: 'Ticari Sabit', reason: 'Sabit oran belirlemek istiyorum' },
      ],
    };
  }
  
  // 8. Akdi oran yok + ticari değil
  return {
    interestType: 'YASAL',
    explanation: 'Ticari olmayan alacak için yasal faiz oranı uygulanır.',
    isCommercial: false,
    canOverride: true,
    alternatives: [
      { code: 'TICARI_DEGISEN', label: 'TCMB Avans (Değişen)', reason: 'Aslında ticari iş' },
      { code: 'AKDI', label: 'Akdi Faiz', reason: 'Sözleşmede oran var' },
    ],
  };
}

/**
 * Kalem türü değiştiğinde faiz türü önerisini güncelle
 */
export function getInterestTypeForKalemTuru(
  kalemTuru: string,
  contractRate?: number | null,
  userIsCommercial?: boolean | null
): InterestTypeResult {
  return resolveInterestType({
    kalemTuru,
    contractInterestRate: contractRate,
    isCommercial: userIsCommercial,
  });
}

/**
 * Faiz türü etiketleri
 */
export const INTEREST_TYPE_LABELS: Record<InterestTypeCode, string> = {
  YOK: 'Faiz Yok',
  YASAL: 'Yasal Faiz (%9 / %24)',
  TICARI_DEGISEN: 'Ticari Temerrüt - TCMB Avans (Değişen)',
  TICARI_SABIT: 'Ticari - Sabit Oran',
  AKDI: 'Akdi Faiz (Sözleşme)',
  BANKA_TL: 'Mevduat Faizi TL',
  KAMU_BANKA_TL: 'Kamu Bankası Mevduat',
};
