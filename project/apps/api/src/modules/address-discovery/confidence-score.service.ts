import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AddressSource } from '@prisma/client';

/**
 * Güven Skoru Hesaplama Servisi
 * 
 * 4 faktörlü skor hesaplama:
 * 1. Kaynak güvenilirliği (40%)
 * 2. Doğrulama durumu (25%)
 * 3. Güncellik (20%)
 * 4. Tebligat başarı oranı (15%)
 */

// Kaynak güvenilirlik skorları
const SOURCE_SCORES: Record<AddressSource, number> = {
  MERNIS: 100,
  UYAP: 90,
  UYAP_AA: 90,
  MERSIS: 85,
  UYAP_AF: 85,
  UYAP_AB: 80,
  SGK_LETTER: 80,
  UYAP_AJ: 75,
  VERGI_LETTER: 75,
  TICARET_SICILI: 70,
  TICARET_SICILI_LETTER: 70,
  CONTRACT: 60,
  CLIENT: 50,
  BELEDIYE_LETTER: 50,
  CROSS_FILE: 40,
  USER_INPUT: 30,
  UYAP_AR: 30, // GSM - düşük güvenilirlik
};

export interface ConfidenceScoreBreakdown {
  total: number;
  sourceScore: number;
  sourceWeight: number;
  verificationScore: number;
  verificationWeight: number;
  freshnessScore: number;
  freshnessWeight: number;
  successRateScore: number;
  successRateWeight: number;
  factors: {
    source: string;
    verified: boolean;
    daysSinceUpdate: number;
    successRate: number | null;
  };
}

@Injectable()
export class ConfidenceScoreService {
  private readonly logger = new Logger(ConfidenceScoreService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Tenant sınırı: addressId GERÇEKTEN bu tenant'ın bir borçlusuna ait mi?
   * Confidence uçları ham addressId aldığı için her erişimde ownership doğrulanmalı
   * (aksi halde başka tenant'ın adresi okunur/güncellenir). Bulunamazsa 404.
   * <remarks>
   * Çağrıldığı yerler:
   * - AddressDiscoveryController.getConfidenceScore() → GET /address-discovery/confidence/:addressId
   * - AddressDiscoveryController.getConfidenceScoreBreakdown() → GET /address-discovery/confidence/:addressId/breakdown
   * </remarks>
   */
  async assertAddressBelongsToTenant(tenantId: string, addressId: string): Promise<void> {
    const owned = await this.prisma.debtorAddress.findFirst({
      where: { id: addressId, debtor: { tenantId } },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Adres bulunamadı');
    }
  }

  /**
   * Tenant sınırı: debtorId bu tenant'a ait mi? Bulunamazsa 404.
   * <remarks>
   * Çağrıldığı yerler:
   * - AddressDiscoveryController.updateAllScoresForDebtor() → POST /address-discovery/confidence/debtor/:debtorId/update-all
   * </remarks>
   */
  async assertDebtorBelongsToTenant(tenantId: string, debtorId: string): Promise<void> {
    const owned = await this.prisma.debtor.findFirst({
      where: { id: debtorId, tenantId },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Borçlu bulunamadı');
    }
  }

  /**
   * Adres için güven skoru hesapla
   */
  calculateScore(address: {
    source: AddressSource;
    verified: boolean;
    verifiedAt?: Date | null;
    updatedAt: Date;
    successfulNotifications?: number;
    totalNotifications?: number;
  }): number {
    let score = 0;

    // 1. Kaynak güvenilirliği (40%)
    const sourceScore = SOURCE_SCORES[address.source] || 20;
    score += sourceScore * 0.4;

    // 2. Doğrulama durumu (25%)
    if (address.verified) {
      score += 100 * 0.25;
    } else if (address.verifiedAt) {
      // Eski doğrulama var ama artık geçerli değil
      score += 50 * 0.25;
    }

    // 3. Güncellik (20%)
    const daysSinceUpdate = this.daysBetween(address.updatedAt, new Date());
    let freshnessScore = 0;
    if (daysSinceUpdate < 30) {
      freshnessScore = 100;
    } else if (daysSinceUpdate < 90) {
      freshnessScore = 75;
    } else if (daysSinceUpdate < 180) {
      freshnessScore = 50;
    } else if (daysSinceUpdate < 365) {
      freshnessScore = 25;
    }
    score += freshnessScore * 0.2;

    // 4. Tebligat başarı oranı (15%)
    const total = address.totalNotifications || 0;
    const successful = address.successfulNotifications || 0;
    if (total > 0) {
      const successRate = successful / total;
      score += (successRate * 100) * 0.15;
    } else {
      // Henüz tebligat yapılmamış - nötr skor
      score += 50 * 0.15;
    }

    return Math.round(score);
  }

  /**
   * Skor detaylarını getir
   */
  getScoreBreakdown(address: {
    source: AddressSource;
    verified: boolean;
    verifiedAt?: Date | null;
    updatedAt: Date;
    successfulNotifications?: number;
    totalNotifications?: number;
  }): ConfidenceScoreBreakdown {
    const sourceScore = SOURCE_SCORES[address.source] || 20;
    const daysSinceUpdate = this.daysBetween(address.updatedAt, new Date());
    
    let freshnessScore = 0;
    if (daysSinceUpdate < 30) freshnessScore = 100;
    else if (daysSinceUpdate < 90) freshnessScore = 75;
    else if (daysSinceUpdate < 180) freshnessScore = 50;
    else if (daysSinceUpdate < 365) freshnessScore = 25;

    let verificationScore = 0;
    if (address.verified) verificationScore = 100;
    else if (address.verifiedAt) verificationScore = 50;

    const total = address.totalNotifications || 0;
    const successful = address.successfulNotifications || 0;
    const successRate = total > 0 ? successful / total : null;
    const successRateScore = successRate !== null ? successRate * 100 : 50;

    return {
      total: this.calculateScore(address),
      sourceScore,
      sourceWeight: 0.4,
      verificationScore,
      verificationWeight: 0.25,
      freshnessScore,
      freshnessWeight: 0.2,
      successRateScore,
      successRateWeight: 0.15,
      factors: {
        source: address.source,
        verified: address.verified,
        daysSinceUpdate,
        successRate,
      },
    };
  }

  /**
   * Adres ID'si ile güven skoru hesapla ve güncelle
   */
  async updateAddressScore(addressId: string): Promise<number> {
    const address = await this.prisma.debtorAddress.findUnique({
      where: { id: addressId },
      include: {
        serviceHistory: {
          select: { toStatus: true },
        },
      },
    });

    if (!address) {
      throw new Error('Adres bulunamadı');
    }

    // Tebligat istatistiklerini hesapla
    const totalNotifications = address.serviceHistory.length;
    const successfulNotifications = address.serviceHistory.filter(
      h => h.toStatus === 'DELIVERED'
    ).length;

    const score = this.calculateScore({
      source: address.source,
      verified: address.verified,
      verifiedAt: address.verifiedAt,
      updatedAt: address.updatedAt,
      totalNotifications,
      successfulNotifications,
    });

    // Skoru güncelle
    await this.prisma.debtorAddress.update({
      where: { id: addressId },
      data: { confidenceScore: score },
    });

    return score;
  }

  /**
   * Borçlunun tüm adreslerinin skorlarını güncelle
   */
  async updateAllScoresForDebtor(debtorId: string): Promise<void> {
    const addresses = await this.prisma.debtorAddress.findMany({
      where: { debtorId },
      select: { id: true },
    });

    for (const address of addresses) {
      try {
        await this.updateAddressScore(address.id);
      } catch (error) {
        this.logger.error(`Skor güncellenemedi: ${address.id}`, error);
      }
    }
  }

  /**
   * CaseDebtor'un tüm adreslerinin skorlarını güncelle
   */
  async updateAllScoresForCaseDebtor(caseDebtorId: string): Promise<void> {
    const caseDebtor = await this.prisma.caseDebtor.findUnique({
      where: { id: caseDebtorId },
      select: { debtorId: true },
    });

    if (caseDebtor) {
      await this.updateAllScoresForDebtor(caseDebtor.debtorId);
    }
  }

  /**
   * İki tarih arasındaki gün farkı
   */
  private daysBetween(date1: Date, date2: Date): number {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date2.getTime() - date1.getTime()) / oneDay));
  }
}
