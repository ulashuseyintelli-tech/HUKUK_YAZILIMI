import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  AccountingJournalWriterService,
  buildAccountingJournal,
  createCanonicalSourceHash,
  validateJournalDraft,
  type BalanceLedgerJournalSource,
  type BalanceLedgerRecordedType,
  type ValidatedJournalEntryDraft,
} from '../accounting-journal';

/**
 * Case Balance Service (Masraf AvansÄ± Ledger)
 * 
 * Bu servis dosya bazlÄ± masraf avansÄ± takibi yapar:
 * - credit(): MÃ¼vekkilden avans alÄ±ndÄ±
 * - debit(): Masraf harcandÄ±
 * - adjust(): Manuel dÃ¼zeltme
 * 
 * NOT: Bu "alacak bakiyesi" DEÄÄ°L, "masraf avansÄ± bakiyesi"dir.
 * Alacak hesaplamasÄ± iÃ§in interest-engine kullanÄ±n.
 * 
 * @alias AdvanceLedgerService (gelecekte rename edilecek)
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

// Migration sonrasÄ± @prisma/client'tan import edilecek
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

type JournalableBalanceLedgerRow = {
  id: string;
  tenantId: string;
  type: BalanceLedgerRecordedType;
  amount: Prisma.Decimal | number | string;
  currency: string;
  source: string;
  sourceId: string | null;
  createdById: string | null;
  createdAt: Date | string;
};
/**
 * @alias AdvanceLedgerService
 */
@Injectable()
export class CaseBalanceService {
  private readonly logger = new Logger(CaseBalanceService.name);

  constructor(
    private prisma: PrismaService,
    private readonly journalWriter: AccountingJournalWriterService = new AccountingJournalWriterService(prisma),
  ) {}

  /**
   * Dosya bakiyesini getir veya oluÅŸtur
   */
  async getOrCreateBalance(tenantId: string, caseId: string) {
    // Ã–nce upsert ile oluÅŸtur veya getir
    const balance = await this.prisma.caseBalance.upsert({
      where: { caseId },
      update: {}, // Varsa gÃ¼ncelleme yapma
      create: {
        tenantId,
        caseId,
        balance: 0,
        lowThreshold: 500, // VarsayÄ±lan dÃ¼ÅŸÃ¼k bakiye eÅŸiÄŸi
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
   * Bakiyeye kredi ekle (Ã¶deme geldi)
   */
  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CaseBalanceController.credit() â†’ POST /cases/:caseId/balance/credit (manuel/direct avans kredi)
  /// - ExpenseRequestService.create() â†’ paidByLawyer expense_request kredi yolu
  /// - ExpenseRequestService.createFromPackage() â†’ paidByLawyer package expense_request kredi yolu
  /// - ExpenseRequestService.markAsReceived() â†’ expense_request Ã¶deme alÄ±ndÄ± kredi yolu
  /// - ExpenseRequestService.recordPayment() â†’ expense_payment kredi yolu
  /// </remarks>
  async credit(tenantId: string, caseId: string, dto: CreditBalanceDto, userId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    // Transaction ile gÃ¼ncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Ledger kaydÄ± oluÅŸtur
      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.CREDIT,
          amount: dto.amount,
          source: dto.source,
          sourceId: dto.sourceId,
          description: dto.description || 'Masraf avansÄ± alÄ±ndÄ±',
          createdById: userId,
        },
      });

      // Bakiyeyi gÃ¼ncelle
      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: {
          balance: { increment: dto.amount },
        },
      });
      const journalDraft = this.buildBalanceLedgerJournalDraft(tenantId, caseId, ledger as JournalableBalanceLedgerRow);
      if (journalDraft) {
        await this.writeBalanceLedgerJournal(tx, journalDraft);
      }
      return { balance: updatedBalance, ledger };
    });

    return {
      success: true,
      newBalance: Number(result.balance.balance),
      ledgerId: result.ledger.id,
    };
  }

  /**
   * Bakiyeden dÃ¼ÅŸ (masraf yapÄ±ldÄ±)
   */
  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CaseBalanceController.debit() â†’ POST /cases/:caseId/balance/debit (direct masraf/avans debit)
  /// </remarks>
  async debit(tenantId: string, caseId: string, dto: DebitBalanceDto, userId: string) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    // Bakiye yeterli mi kontrol et
    if (Number(balance.balance) < dto.amount) {
      throw new BadRequestException(
        `Yetersiz bakiye. Mevcut: ${balance.balance} TL, Gerekli: ${dto.amount} TL`
      );
    }

    // Transaction ile gÃ¼ncelle
    const result = await this.prisma.$transaction(async (tx) => {
      // Ledger kaydÄ± oluÅŸtur (negatif tutar)
      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.DEBIT,
          amount: -dto.amount, // Negatif
          source: dto.source,
          sourceId: dto.sourceId,
          description: dto.description || 'Masraf harcandÄ±',
          createdById: userId,
        },
      });

      // Bakiyeyi gÃ¼ncelle
      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: {
          balance: { decrement: dto.amount },
        },
      });
      const journalDraft = this.buildBalanceLedgerJournalDraft(tenantId, caseId, ledger as JournalableBalanceLedgerRow);
      if (journalDraft) {
        await this.writeBalanceLedgerJournal(tx, journalDraft);
      }
      return { balance: updatedBalance, ledger };
    });

    return {
      success: true,
      newBalance: Number(result.balance.balance),
      ledgerId: result.ledger.id,
      isLow: Number(result.balance.balance) < Number(balance.lowThreshold || 500),
    };
  }

  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CaseBalanceService.credit() â†’ CREDIT BalanceLedger journal draft Ã¼retimi
  /// - CaseBalanceService.debit() â†’ DEBIT BalanceLedger journal draft Ã¼retimi
  /// </remarks>
  private buildBalanceLedgerJournalDraft(
    tenantId: string,
    caseId: string,
    ledger: JournalableBalanceLedgerRow,
  ): ValidatedJournalEntryDraft | null {
    if (ledger.type !== BalanceLedgerType.CREDIT && ledger.type !== BalanceLedgerType.DEBIT) {
      return null;
    }

    if (this.isDispositionLineBalanceLedgerSource(ledger.source, ledger.sourceId)) {
      return null;
    }

    const createdAt = ledger.createdAt instanceof Date ? ledger.createdAt : new Date(ledger.createdAt);
    const createdAtIso = createdAt.toISOString();
    const payload = {
      amount: this.positiveJournalAmount(ledger.amount),
      caseId,
      balanceLedgerId: ledger.id,
      ledgerType: ledger.type,
      source: ledger.source,
      sourceId: ledger.sourceId,
      isIncrease: ledger.type === BalanceLedgerType.CREDIT,
    } satisfies BalanceLedgerJournalSource['payload'];

    const sourceVersion = `${createdAtIso}:${ledger.id}`;
    const source: BalanceLedgerJournalSource = {
      tenantId,
      sourceType: 'BALANCE_LEDGER',
      sourceId: ledger.id,
      sourceVersion,
      sourceAction: 'posted',
      occurredAt: createdAtIso,
      effectiveDate: createdAtIso.slice(0, 10),
      actorId: ledger.createdById,
      currency: ledger.currency,
      sourceHash: createCanonicalSourceHash({
        tenantId,
        sourceType: 'BALANCE_LEDGER',
        sourceId: ledger.id,
        sourceAction: 'posted',
        sourceVersion,
        occurredAt: createdAtIso,
        effectiveDate: createdAtIso.slice(0, 10),
        actorId: ledger.createdById,
        currency: ledger.currency,
        payload,
      }),
      metadata: {
        sourceName: 'balance-ledger',
      },
      payload,
    };

    const built = buildAccountingJournal(source);
    if (!built.ok) {
      throw new ConflictException(`BalanceLedger journal mapping failed: ${built.errors.map((error) => error.code).join(', ')}`);
    }

    const validated = validateJournalDraft(built.draft);
    if (!validated.ok) {
      throw new ConflictException(`BalanceLedger journal validation failed: ${validated.errors.map((error) => error.code).join(', ')}`);
    }

    return validated.draft;
  }

  /// <remarks>
  /// Ã‡aÄŸrÄ±ldÄ±ÄŸÄ± yerler:
  /// - CaseBalanceService.credit() â†’ tx-iÃ§i direct CREDIT BalanceLedger journal write
  /// - CaseBalanceService.debit() â†’ tx-iÃ§i direct DEBIT BalanceLedger journal write
  /// </remarks>
  private async writeBalanceLedgerJournal(tx: Prisma.TransactionClient, draft: ValidatedJournalEntryDraft): Promise<void> {
    const journalWrite = await this.journalWriter.write({ draft }, tx);
    if (!journalWrite.ok) {
      throw new ConflictException(`BalanceLedger journal write failed: ${journalWrite.errors.map((error) => error.code).join(', ')}`);
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.buildBalanceLedgerJournalDraft() → correlated disposition_line BalanceLedger suppress kontrolü
  /// </remarks>
  private isDispositionLineBalanceLedgerSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
    return this.parseDispositionLineSource(source) !== null || this.parseDispositionLineSource(sourceId) !== null || source === 'disposition_line';
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.isDispositionLineBalanceLedgerSource() → disposition_line source format parse
  /// </remarks>
  private parseDispositionLineSource(value: string | null | undefined): string | null {
    if (!value) return null;
    const prefix = 'disposition_line:';
    return value.startsWith(prefix) ? value.slice(prefix.length) : null;
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.buildBalanceLedgerJournalDraft() → journal amount normalize
  /// </remarks>
  private positiveJournalAmount(amount: Prisma.Decimal | number | string): string {
    const decimal = new Prisma.Decimal(amount as Prisma.Decimal.Value);
    return decimal.lt(0) ? decimal.mul(-1).toString() : decimal.toString();
  }

  /**
   * Manuel dÃ¼zeltme
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
   * DÃ¼ÅŸÃ¼k bakiye eÅŸiÄŸini gÃ¼ncelle
   */
  async setLowThreshold(tenantId: string, caseId: string, threshold: number) {
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    return this.prisma.caseBalance.update({
      where: { id: balance.id },
      data: { lowThreshold: threshold },
    });
  }
}
