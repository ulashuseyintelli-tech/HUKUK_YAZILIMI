import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';

// Migration sonrası @prisma/client'tan import edilecek
// import { BalanceLedgerType } from '@prisma/client';
const BalanceLedgerType = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT',
  ADJUST: 'ADJUST',
  REFUND: 'REFUND',
} as const;

export interface CreditBalanceDto {
  amount: number;
  source: string;        // "expense_request:xxx", "manual"
  sourceId?: string;
  description?: string;
}

export interface DebitBalanceDto {
  amount: number;
  source: string;        // "operation:haciz", "operation:tebligat"
  sourceId?: string;
  description?: string;
}

@Injectable()
export class CaseBalanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * Dosya bakiyesini getir veya oluştur
   */
  async getOrCreateBalance(tenantId: string, caseId: string) {
    // Önce upsert ile oluştur veya getir
    const balance = await this.prisma.caseBalance.upsert({
      where: { caseId },
      update: {}, // Varsa güncelleme yapma
      create: {
        tenantId,
        caseId,
        balance: 0,
        lowThreshold: 500, // Varsayılan düşük bakiye eşiği
      },
    });

    return balance;
  }

  /**
   * Dosya bakiyesini getir
   */
  async getBalance(tenantId: string, caseId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);
    
    // Son hareketleri de getir
    const recentLedger = await this.prisma.balanceLedger.findMany({
      where: { caseBalanceId: balance.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      ...balance,
      isLow: Number(balance.balance) < Number(balance.lowThreshold || 500),
      recentLedger,
    };
  }

  /**
   * Bakiye hareketlerini listele
   */
  async getLedger(tenantId: string, caseId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    return this.prisma.balanceLedger.findMany({
      where: { caseBalanceId: balance.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Bakiyeye kredi ekle (ödeme geldi)
   */
  async credit(tenantId: string, caseId: string, dto: CreditBalanceDto, userId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    // Transaction ile güncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Ledger kaydı oluştur
      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.CREDIT,
          amount: dto.amount,
          source: dto.source,
          sourceId: dto.sourceId,
          description: dto.description || 'Masraf avansı alındı',
          createdById: userId,
        },
      });

      // Bakiyeyi güncelle
      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: {
          balance: { increment: dto.amount },
        },
      });

      return { balance: updatedBalance, ledger };
    });

    return {
      success: true,
      newBalance: Number(result.balance.balance),
      ledgerId: result.ledger.id,
    };
  }

  /**
   * Bakiyeden düş (masraf yapıldı)
   */
  async debit(tenantId: string, caseId: string, dto: DebitBalanceDto, userId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    // Bakiye yeterli mi kontrol et
    if (Number(balance.balance) < dto.amount) {
      throw new BadRequestException(
        `Yetersiz bakiye. Mevcut: ${balance.balance} TL, Gerekli: ${dto.amount} TL`
      );
    }

    // Transaction ile güncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Ledger kaydı oluştur (negatif tutar)
      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.DEBIT,
          amount: -dto.amount, // Negatif
          source: dto.source,
          sourceId: dto.sourceId,
          description: dto.description || 'Masraf harcandı',
          createdById: userId,
        },
      });

      // Bakiyeyi güncelle
      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: {
          balance: { decrement: dto.amount },
        },
      });

      return { balance: updatedBalance, ledger };
    });

    return {
      success: true,
      newBalance: Number(result.balance.balance),
      ledgerId: result.ledger.id,
      isLow: Number(result.balance.balance) < Number(balance.lowThreshold || 500),
    };
  }

  /**
   * Manuel düzeltme
   */
  async adjust(tenantId: string, caseId: string, amount: number, reason: string, userId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    const result = await this.prisma.$transaction(async (tx) => {
      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.ADJUST,
          amount,
          source: 'manual_adjust',
          description: reason,
          createdById: userId,
        },
      });

      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: {
          balance: { increment: amount },
        },
      });

      return { balance: updatedBalance, ledger };
    });

    return {
      success: true,
      newBalance: Number(result.balance.balance),
      ledgerId: result.ledger.id,
    };
  }

  /**
   * Düşük bakiye eşiğini güncelle
   */
  async setLowThreshold(tenantId: string, caseId: string, threshold: number) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    return this.prisma.caseBalance.update({
      where: { id: balance.id },
      data: { lowThreshold: threshold },
    });
  }
}
