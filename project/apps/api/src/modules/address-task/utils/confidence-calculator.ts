import { AddressCategory, AddressSourceDetail, ConfidenceLevel } from '@prisma/client';

/**
 * Adres kategorisine göre temel öncelik skoru
 */
const CATEGORY_BASE_SCORES: Record<AddressCategory, number> = {
  MERNIS_RESIDENCE: 90,
  DECLARED_CLIENT: 80,
  DECLARED_DOCUMENT: 60,
  SGK_ADDRESS: 50,
  TICARET_SICIL: 40,
  VERGI_DAIRESI: 45,
  GSM_OPERATOR: 35,
};

/**
 * Kaynak detayına göre güven seviyesi
 */
const SOURCE_CONFIDENCE: Record<AddressSourceDetail, ConfidenceLevel> = {
  UYAP_MERNIS: 'HIGH',
  UYAP_SGK: 'HIGH',
  UYAP_TICARET: 'HIGH',
  CLIENT_REPLY_EMAIL: 'MEDIUM',
  CLIENT_REPLY_WHATSAPP: 'MEDIUM',
  DOCUMENT_SCAN: 'MEDIUM',
  MANUAL_ENTRY: 'MEDIUM',
  INSTITUTION_LETTER: 'HIGH',
};

/**
 * Güven seviyesine göre skor modifikasyonu
 */
const CONFIDENCE_MODIFIERS: Record<ConfidenceLevel, number> = {
  HIGH: 5,
  MEDIUM: 0,
  LOW: -10,
};

/**
 * Kaynak detayından güven seviyesi hesapla
 */
export function getConfidenceLevel(sourceDetail: AddressSourceDetail | null): ConfidenceLevel {
  if (!sourceDetail) return 'MEDIUM';
  return SOURCE_CONFIDENCE[sourceDetail] || 'MEDIUM';
}

/**
 * Adres öncelik skorunu hesapla
 * 
 * @param category Adres kategorisi
 * @param confidenceLevel Güven seviyesi
 * @param retrievedAt Adresin alındığı tarih
 * @returns 0-100 arası öncelik skoru
 */
export function calculatePriorityScore(
  category: AddressCategory | null,
  confidenceLevel: ConfidenceLevel | null,
  retrievedAt: Date | null,
): number {
  // Temel skor
  let score = category ? CATEGORY_BASE_SCORES[category] : 50;
  
  // Güven seviyesi modifikasyonu
  if (confidenceLevel) {
    score += CONFIDENCE_MODIFIERS[confidenceLevel];
  }
  
  // Tarih modifikasyonu
  if (retrievedAt) {
    const now = new Date();
    const daysSinceRetrieval = Math.floor(
      (now.getTime() - retrievedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Son 30 gün içinde alındıysa +10
    if (daysSinceRetrieval <= 30) {
      score += 10;
    }
    // 1 yıldan eski ise -20
    else if (daysSinceRetrieval > 365) {
      score -= 20;
    }
  }
  
  // Skoru 0-100 arasında tut
  return Math.max(0, Math.min(100, score));
}

/**
 * Adres kategorisinden güven seviyesi çıkar
 */
export function getConfidenceLevelFromCategory(category: AddressCategory | null): ConfidenceLevel {
  if (!category) return 'MEDIUM';
  
  switch (category) {
    case 'MERNIS_RESIDENCE':
    case 'TICARET_SICIL':
      return 'HIGH';
    case 'DECLARED_CLIENT':
    case 'DECLARED_DOCUMENT':
    case 'SGK_ADDRESS':
    case 'VERGI_DAIRESI':
      return 'MEDIUM';
    case 'GSM_OPERATOR':
      return 'LOW';
    default:
      return 'MEDIUM';
  }
}
