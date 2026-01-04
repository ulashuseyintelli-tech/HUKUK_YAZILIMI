/**
 * CHANNEL MATRIX CONFIG
 * 
 * v3: Borçlu x Tebligat Kanalı Matrisi.
 * channel_matrix_v3.yaml'dan alınmıştır.
 * 
 * Aynı dosyada her borçlu için farklı tebligat kanalı olabilir.
 */

import { TebligatChannel, TebligatOutcome, AddressType } from '../types/recipe.types';

/**
 * Borçlu için kanal seçim kuralları
 */
export interface ChannelRule {
  when: string;
  set: TebligatChannel;
}

export const DEBTOR_CHANNEL_RULES: ChannelRule[] = [
  {
    when: 'debtor.hasUetsAddress == true && debtor.requiresPhysicalCopy == false',
    set: 'E_TEBLIGAT',
  },
  {
    when: 'debtor.hasUetsAddress == false && debtor.hasPhysicalAddress == true',
    set: 'FIZIKI',
  },
  {
    when: 'debtor.hasUetsAddress == true && debtor.requiresPhysicalCopy == true',
    set: 'KARMA',
  },
];

/**
 * Polling politikası (dakika cinsinden)
 */
export interface PollingPolicy {
  first24hMinutes: number;
  after24hHours: number;
  afterTebligSayildiHours: number;
}

export const POLLING_POLICIES: Record<TebligatChannel, PollingPolicy> = {
  E_TEBLIGAT: {
    first24hMinutes: 120,      // İlk 24 saat: 2 saatte bir
    after24hHours: 6,          // 24 saat sonra: 6 saatte bir
    afterTebligSayildiHours: 24, // Tebliğ sayıldıktan sonra: günde bir
  },
  FIZIKI: {
    first24hMinutes: 1440,     // İlk 24 saat: günde bir (fiziki için daha yavaş)
    after24hHours: 24,         // 24 saat sonra: günde bir
    afterTebligSayildiHours: 24,
  },
  KARMA: {
    first24hMinutes: 120,      // E-tebligat politikasını kullan
    after24hHours: 6,
    afterTebligSayildiHours: 24,
  },
};

/**
 * E-tebligat ekranından okunan durumlar → outcome mapping
 */
export const E_TEBLIGAT_OUTCOME_MAPPING: Record<string, TebligatOutcome> = {
  'delivered_date_present': 'KUTUDA',
  'okundu_true': 'OKUNDU',
  'deemed_served': 'TEBLIG_SAYILDI',
  'mazbata_present': 'MAZBATA_OLUSTU',
};

/**
 * Fiziki tebligat durumları → outcome mapping
 */
export const FIZIKI_OUTCOME_MAPPING: Record<string, TebligatOutcome> = {
  'status_teblig_edildi': 'TEBLIG_SAYILDI',
  'status_iade': 'IADE',
  'status_bila': 'BILA',
};

/**
 * Borçu için tebligat kanalını belirle
 */
export function determineChannel(debtor: {
  hasUetsAddress: boolean;
  hasPhysicalAddress: boolean;
  requiresPhysicalCopy?: boolean;
}): TebligatChannel {
  if (debtor.hasUetsAddress && debtor.requiresPhysicalCopy) {
    return 'KARMA';
  }
  if (debtor.hasUetsAddress) {
    return 'E_TEBLIGAT';
  }
  if (debtor.hasPhysicalAddress) {
    return 'FIZIKI';
  }
  return 'FIZIKI'; // Default
}

/**
 * Polling interval'ını hesapla (dakika cinsinden)
 */
export function calculatePollingInterval(
  channel: TebligatChannel,
  sentAt: Date,
  isServed: boolean
): number {
  const policy = POLLING_POLICIES[channel];
  const now = new Date();
  const hoursSinceSent = (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60);

  if (isServed) {
    return policy.afterTebligSayildiHours * 60;
  }

  if (hoursSinceSent < 24) {
    return policy.first24hMinutes;
  }

  return policy.after24hHours * 60;
}

/**
 * E-tebligat durumunu outcome'a çevir
 */
export function mapETebligatStatus(status: {
  deliveredDate: Date | null;
  isRead: boolean;
  hasMazbata: boolean;
  deemedServed: boolean;
}): TebligatOutcome {
  if (status.hasMazbata) return 'MAZBATA_OLUSTU';
  if (status.deemedServed) return 'TEBLIG_SAYILDI';
  if (status.isRead) return 'OKUNDU';
  if (status.deliveredDate) return 'KUTUDA';
  return 'GONDERILDI';
}

/**
 * Fiziki tebligat durumunu outcome'a çevir
 */
export function mapFizikiStatus(pttStatus: string): TebligatOutcome {
  const statusLower = pttStatus.toLowerCase();
  
  if (statusLower.includes('tebliğ edildi') || statusLower.includes('teslim')) {
    return 'TEBLIG_SAYILDI';
  }
  if (statusLower.includes('iade')) {
    return 'IADE';
  }
  if (statusLower.includes('bila') || statusLower.includes('bulunamadı')) {
    return 'BILA';
  }
  if (statusLower.includes('iptal')) {
    return 'IPTAL';
  }
  
  return 'GONDERILDI';
}

/**
 * Outcome'a göre sonraki aksiyonu öner
 */
export function suggestNextAction(outcome: TebligatOutcome): string | null {
  switch (outcome) {
    case 'KUTUDA':
      return 'Tebliğ sayılma tarihini bekle (5 gün)';
    case 'OKUNDU':
      return 'Mazbata sorgula';
    case 'TEBLIG_SAYILDI':
      return 'Kesinleşme süresini başlat';
    case 'MAZBATA_OLUSTU':
      return 'Kesinleşme kontrolü yap';
    case 'IADE':
      return 'Yeni adres araştır, yeniden tebligat gönder';
    case 'BILA':
      return 'TK 21 değerlendir veya yeni adres araştır';
    default:
      return null;
  }
}

/**
 * Tebligat kanalı için Türkçe isim
 */
export function getChannelDisplayName(channel: TebligatChannel): string {
  const names: Record<TebligatChannel, string> = {
    E_TEBLIGAT: 'E-Tebligat',
    FIZIKI: 'Fiziki Tebligat',
    KARMA: 'Karma (E-Tebligat + Fiziki)',
  };
  return names[channel];
}

/**
 * Outcome için Türkçe isim
 */
export function getOutcomeDisplayName(outcome: TebligatOutcome): string {
  const names: Record<TebligatOutcome, string> = {
    GONDERILDI: 'Gönderildi',
    KUTUDA: 'Posta Kutusunda',
    OKUNDU: 'Okundu',
    TEBLIG_SAYILDI: 'Tebliğ Edilmiş Sayıldı',
    MAZBATA_OLUSTU: 'Mazbata Oluştu',
    IADE: 'İade',
    BILA: 'Bila (Bulunamadı)',
    TEKRAR: 'Yeniden Tebligat',
    IPTAL: 'İptal',
    HATA: 'Hata',
  };
  return names[outcome];
}
