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
 * Case Balance Service (Masraf Avansı Ledger)
 * 
 * Bu servis dosya bazlı masraf avansı takibi yapar:
 * - credit(): Müvekkilden avans alındı
 * - debit(): Masraf harcandı
 * - adjust(): Manuel düzeltme
 * 
 * NOT: Bu "alacak bakiyesi" DEĞİL, "masraf avansı bakiyesi"dir.
 * Alacak hesaplaması için interest-engine kullanın.
 * 
 * @alias AdvanceLedgerService (gelecekte rename edilecek)
 * @see ARCHITECTURE.md - Source of Truth Matrix
 */

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

export interface ReverseExpensePaymentBalanceLedgerInput {
  expensePaymentId: string;
  originalBalanceLedgerId: string;
  caseBalanceId: string;
  amount: Prisma.Decimal | Prisma.Decimal.Value;
  currency?: string | null;
  description?: string;
}

export interface ReverseExpensePaymentBalanceLedgerResult {
  ledgerId: string;
  newBalance: number;
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
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceController.credit() → POST /cases/:caseId/balance/credit (manuel/direct avans kredi)
  /// - ExpenseRequestService.create() → paidByLawyer expense_request kredi yolu
  /// - ExpenseRequestService.createFromPackage() → paidByLawyer package expense_request kredi yolu
  /// - ExpenseRequestService.markAsReceived() → expense_request ödeme alındı kredi yolu
  /// - ExpenseRequestService.recordPayment() → expense_payment kredi yolu
  /// </remarks>
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
   * Bakiyeden düş (masraf yapıldı)
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceController.debit() → POST /cases/:caseId/balance/debit (direct masraf/avans debit)
  /// </remarks>
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
  /// Cagrildigi yerler:
  /// - ExpenseRequestService.reversePayment() -> tx-ici expense_payment reversal debit; journal suppress korunur.
  /// </remarks>
  async reverseExpensePaymentCreditInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    input: ReverseExpensePaymentBalanceLedgerInput,
    userId: string,
  ): Promise<ReverseExpensePaymentBalanceLedgerResult> {
    const amount = new Prisma.Decimal(input.amount as Prisma.Decimal.Value);
    if (amount.lte(0)) {
      throw new BadRequestException('ExpensePayment reversal ledger amount must be positive.');
    }

    const ledger = await tx.balanceLedger.create({
      data: {
        tenantId,
        caseBalanceId: input.caseBalanceId,
        type: BalanceLedgerType.DEBIT,
        amount: amount.mul(-1),
        currency: input.currency ?? 'TRY',
        source: `expense_payment:${input.expensePaymentId}:reversal`,
        sourceId: input.expensePaymentId,
        description: input.description ?? 'Masraf odeme reversal',
        createdById: userId,
      },
    });

    const updatedBalance = await tx.caseBalance.update({
      where: { id: input.caseBalanceId },
      data: {
        balance: { decrement: amount },
      },
    });

    const journalDraft = this.buildBalanceLedgerJournalDraft(tenantId, caseId, ledger as JournalableBalanceLedgerRow);
    if (journalDraft) {
      await this.writeBalanceLedgerJournal(tx, journalDraft);
    }

    return { ledgerId: ledger.id, newBalance: Number(updatedBalance.balance) };
  }
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.credit() → CREDIT BalanceLedger journal draft üretimi
  /// - CaseBalanceService.debit() → DEBIT BalanceLedger journal draft üretimi
  /// </remarks>
  private buildBalanceLedgerJournalDraft(
    tenantId: string,
    caseId: string,
    ledger: JournalableBalanceLedgerRow,
  ): ValidatedJournalEntryDraft | null {
    if (ledger.type !== BalanceLedgerType.CREDIT && ledger.type !== BalanceLedgerType.DEBIT) {
      return null;
    }

    if (this.isSuppressedBalanceLedgerJournalSource(ledger.source, ledger.sourceId)) {
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
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.credit() → tx-içi direct CREDIT BalanceLedger journal write
  /// - CaseBalanceService.debit() → tx-içi direct DEBIT BalanceLedger journal write
  /// </remarks>
  private async writeBalanceLedgerJournal(tx: Prisma.TransactionClient, draft: ValidatedJournalEntryDraft): Promise<void> {
    const journalWrite = await this.journalWriter.write({ draft }, tx);
    if (!journalWrite.ok) {
      throw new ConflictException(`BalanceLedger journal write failed: ${journalWrite.errors.map((error) => error.code).join(', ')}`);
    }
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseBalanceService.buildBalanceLedgerJournalDraft() → canonical live source kaynaklı BalanceLedger journal suppress kontrolü
  /// </remarks>
  private isSuppressedBalanceLedgerJournalSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
    return (
      this.isDispositionLineBalanceLedgerSource(source, sourceId) ||
      this.isExpensePaymentBalanceLedgerSource(source, sourceId)
    );
  }

  private isDispositionLineBalanceLedgerSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
    return this.parseDispositionLineSource(source) !== null || this.parseDispositionLineSource(sourceId) !== null || source === 'disposition_line';
  }

  private isExpensePaymentBalanceLedgerSource(source: string | null | undefined, sourceId: string | null | undefined): boolean {
    return this.parseExpensePaymentSource(source) !== null || this.parseExpensePaymentSource(sourceId) !== null || source === 'expense_payment';
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

  private parseExpensePaymentSource(value: string | null | undefined): string | null {
    if (!value) return null;
    const prefix = 'expense_payment:';
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
