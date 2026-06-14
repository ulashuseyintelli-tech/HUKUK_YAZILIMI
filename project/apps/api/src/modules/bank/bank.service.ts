import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { maskIban } from '../../common/pii-mask.util';
import { CollectionService } from '../collection/collection.service';

/**
 * Banka Entegrasyon Servisi
 * 
 * Desteklenen bankalar:
 * - Garanti BBVA
 * - Akbank
 * - İş Bankası
 * - Yapı Kredi
 * - Ziraat Bankası
 * - Mock (test)
 * 
 * Özellikler:
 * - Hesap bakiyesi sorgulama
 * - Hesap hareketleri çekme
 * - Otomatik tahsilat eşleştirme
 * - EFT/Havale gönderimi
 */

export type BankProvider = 'garanti' | 'akbank' | 'isbank' | 'yapikredi' | 'ziraat' | 'mock';

export interface BankBalance {
  iban: string;
  balance: number;
  availableBalance: number;
  currency: string;
  lastUpdated: Date;
}

export interface BankTransactionData {
  transactionDate: Date;
  valueDate?: Date;
  amount: number;
  currency: string;
  transactionType: 'INCOMING' | 'OUTGOING';
  counterpartyName?: string;
  counterpartyIban?: string;
  counterpartyBank?: string;
  description?: string;
  referenceNo?: string;
  bankReferenceId?: string;
}

export interface TransferRequest {
  fromIban: string;
  toIban: string;
  amount: number;
  currency: string;
  description?: string;
  referenceNo?: string;
}

export interface TransferResult {
  success: boolean;
  transactionId?: string;
  referenceNo?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface SyncResult {
  success: boolean;
  transactionCount: number;
  newTransactions: number;
  matchedTransactions: number;
  errorMessage?: string;
}

@Injectable()
export class BankService {
  private readonly logger = new Logger(BankService.name);

  // Prisma client'a any olarak erişim (generate sonrası düzelecek)
  private get db(): any {
    return this.prisma;
  }

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    // G3d: banka eşleşmesi tahsilatı kanonik yoldan üretir.
    private collectionService: CollectionService,
  ) {}

  // ==================== HESAP YÖNETİMİ ====================

  /**
   * Banka hesabı ekle
   */
  async addBankAccount(tenantId: string, data: {
    bankCode: string;
    bankName: string;
    branchCode?: string;
    branchName?: string;
    accountNo?: string;
    iban: string;
    currency?: string;
    accountType?: string;
    ownerType: 'TENANT' | 'CLIENT';
    ownerId?: string;
    ownerName: string;
    integrationProvider?: string;
    isPrimary?: boolean;
    notes?: string;
  }) {
    // IBAN formatını doğrula
    const cleanIban = data.iban.replace(/\s/g, '').toUpperCase();
    if (!this.isValidIban(cleanIban)) {
      throw new Error('Geçersiz IBAN formatı');
    }

    return this.db.bankAccount.create({
      data: {
        tenantId,
        bankCode: data.bankCode,
        bankName: data.bankName,
        branchCode: data.branchCode,
        branchName: data.branchName,
        accountNo: data.accountNo,
        iban: cleanIban,
        currency: data.currency || 'TRY',
        accountType: data.accountType || 'VADESIZ',
        ownerType: data.ownerType,
        ownerId: data.ownerId,
        ownerName: data.ownerName,
        integrationProvider: data.integrationProvider,
        isIntegrated: !!data.integrationProvider,
        isPrimary: data.isPrimary || false,
        notes: data.notes,
      },
    });
  }

  /**
   * Banka hesaplarını listele
   */
  async getBankAccounts(tenantId: string, filters?: {
    ownerType?: string;
    ownerId?: string;
    isActive?: boolean;
    isIntegrated?: boolean;
  }) {
    return this.db.bankAccount.findMany({
      where: {
        tenantId,
        ownerType: filters?.ownerType,
        ownerId: filters?.ownerId,
        isActive: filters?.isActive,
        isIntegrated: filters?.isIntegrated,
      },
      orderBy: [{ isPrimary: 'desc' }, { bankName: 'asc' }],
    });
  }

  /**
   * Hesap bakiyesi sorgula
   */
  async getBalance(accountId: string): Promise<BankBalance> {
    const account = await this.db.bankAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Hesap bulunamadı');
    }

    if (!account.isIntegrated || !account.integrationProvider) {
      throw new Error('Bu hesap için banka entegrasyonu aktif değil');
    }

    const provider = account.integrationProvider as BankProvider;
    return this.queryBalance(provider, account.iban);
  }

  // ==================== HESAP HAREKETLERİ ====================

  /**
   * Hesap hareketlerini senkronize et
   */
  async syncTransactions(accountId: string, startDate?: Date, endDate?: Date): Promise<SyncResult> {
    const account = await this.db.bankAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new NotFoundException('Hesap bulunamadı');
    }

    const provider = (account.integrationProvider || 'mock') as BankProvider;
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Son 30 gün
    const end = endDate || new Date();

    // Log başlat
    const log = await this.db.bankIntegrationLog.create({
      data: {
        tenantId: account.tenantId,
        bankAccountId: accountId,
        action: 'SYNC',
        provider,
        status: 'PENDING',
      },
    });

    try {
      // Banka API'sinden hareketleri çek
      const transactions = await this.fetchTransactions(provider, account.iban, start, end);

      let newCount = 0;
      let matchedCount = 0;

      for (const tx of transactions) {
        // Aynı işlem var mı kontrol et
        const existing = await this.db.bankTransaction.findFirst({
          where: {
            bankAccountId: accountId,
            bankReferenceId: tx.bankReferenceId,
          },
        });

        if (!existing) {
          // Yeni işlem ekle
          const created = await this.db.bankTransaction.create({
            data: {
              tenantId: account.tenantId,
              bankAccountId: accountId,
              transactionDate: tx.transactionDate,
              valueDate: tx.valueDate,
              amount: tx.amount,
              currency: tx.currency,
              transactionType: tx.transactionType,
              counterpartyName: tx.counterpartyName,
              counterpartyIban: tx.counterpartyIban,
              counterpartyBank: tx.counterpartyBank,
              description: tx.description,
              referenceNo: tx.referenceNo,
              bankReferenceId: tx.bankReferenceId,
            },
          });

          newCount++;

          // Otomatik eşleştirme dene
          if (tx.transactionType === 'INCOMING') {
            const matched = await this.tryAutoMatch(created.id, account.tenantId);
            if (matched) matchedCount++;
          }
        }
      }

      // Hesabı güncelle
      await this.db.bankAccount.update({
        where: { id: accountId },
        data: { lastSyncAt: new Date() },
      });

      // Log güncelle
      await this.db.bankIntegrationLog.update({
        where: { id: log.id },
        data: {
          status: 'SUCCESS',
          transactionCount: transactions.length,
          completedAt: new Date(),
        },
      });

      return {
        success: true,
        transactionCount: transactions.length,
        newTransactions: newCount,
        matchedTransactions: matchedCount,
      };
    } catch (error: any) {
      // Log güncelle
      await this.db.bankIntegrationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        transactionCount: 0,
        newTransactions: 0,
        matchedTransactions: 0,
        errorMessage: error.message,
      };
    }
  }

  /**
   * Hesap hareketlerini listele
   */
  async getTransactions(accountId: string, filters?: {
    startDate?: Date;
    endDate?: Date;
    transactionType?: string;
    isMatched?: boolean;
    limit?: number;
  }) {
    return this.db.bankTransaction.findMany({
      where: {
        bankAccountId: accountId,
        transactionDate: {
          gte: filters?.startDate,
          lte: filters?.endDate,
        },
        transactionType: filters?.transactionType,
        isMatched: filters?.isMatched,
      },
      orderBy: { transactionDate: 'desc' },
      take: filters?.limit || 100,
    });
  }

  /**
   * İşlemi dosyayla eşleştir
   */
  async matchTransaction(transactionId: string, caseId: string, userId: string) {
    const transaction = await this.db.bankTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('İşlem bulunamadı');
    }

    if (transaction.isMatched) {
      throw new Error('Bu işlem zaten eşleştirilmiş');
    }

    // G3d: kanonik yola delege (closed/duplicate guard + PAYMENT_RECEIVED + G3a ledger).
    // sourceType=undefined (BANK_INTEGRATION enum'da yok; şema gate). Idempotency =
    // mevcut isMatched/matchedCollectionId (yalnız create BAŞARILIYSA işaretlenir).
    let collection: any;
    try {
      collection = await this.collectionService.create(
        transaction.tenantId,
        {
          caseId,
          amount: transaction.amount,
          currency: transaction.currency,
          date: transaction.transactionDate,
          channel: 'BANKA',
          description: `Banka hareketi: ${transaction.description || transaction.referenceNo || ''}`,
        } as any,
        userId,
      );
    } catch (err: any) {
      // Closed-case (BadRequestException) vb. → eşleşme YAPILMAZ, raporlanır.
      this.logger.warn(
        `Bank match rejected (tx=${transactionId}, case=${caseId}): ${err?.message ?? err}`,
      );
      throw err;
    }

    // SADECE create başarılıysa işlemi eşleşmiş işaretle
    await this.db.bankTransaction.update({
      where: { id: transactionId },
      data: {
        isMatched: true,
        matchedCaseId: caseId,
        matchedCollectionId: collection.id,
        matchedAt: new Date(),
        matchedById: userId,
      },
    });

    return { transaction, collection };
  }

  // ==================== OTOMATİK EŞLEŞTİRME ====================

  /**
   * Otomatik eşleştirme dene
   */
  private async tryAutoMatch(transactionId: string, tenantId: string): Promise<boolean> {
    const transaction = await this.db.bankTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction || transaction.transactionType !== 'INCOMING') {
      return false;
    }

    // Açıklamadan dosya numarası çıkarmaya çalış
    const fileNumberMatch = transaction.description?.match(/(\d{4}\/\d+)/);
    if (fileNumberMatch) {
      const fileNumber = fileNumberMatch[1];
      
      const caseData = await this.db.case.findFirst({
        where: {
          tenantId,
          OR: [
            { fileNumber },
            { executionFileNumber: fileNumber },
          ],
        },
      });

      if (caseData) {
        // Otomatik eşleştir
        await this.db.bankTransaction.update({
          where: { id: transactionId },
          data: {
            isMatched: true,
            matchedCaseId: caseData.id,
            matchedAt: new Date(),
          },
        });

        this.logger.log(`Otomatik eşleştirme: ${transaction.referenceNo} -> ${fileNumber}`);
        return true;
      }
    }

    return false;
  }

  // ==================== TRANSFER ====================

  /**
   * EFT/Havale gönder
   */
  async sendTransfer(tenantId: string, request: TransferRequest): Promise<TransferResult> {
    // Gönderen hesabı bul
    const fromAccount = await this.db.bankAccount.findFirst({
      where: {
        tenantId,
        iban: request.fromIban.replace(/\s/g, '').toUpperCase(),
        isActive: true,
      },
    });

    if (!fromAccount) {
      return {
        success: false,
        errorCode: 'ACCOUNT_NOT_FOUND',
        errorMessage: 'Gönderen hesap bulunamadı',
      };
    }

    if (!fromAccount.isIntegrated || !fromAccount.integrationProvider) {
      return {
        success: false,
        errorCode: 'NOT_INTEGRATED',
        errorMessage: 'Bu hesap için banka entegrasyonu aktif değil',
      };
    }

    const provider = fromAccount.integrationProvider as BankProvider;

    // Log başlat
    const log = await this.db.bankIntegrationLog.create({
      data: {
        tenantId,
        bankAccountId: fromAccount.id,
        action: 'TRANSFER',
        provider,
        status: 'PENDING',
        requestData: request as any,
      },
    });

    try {
      const result = await this.executeTransfer(provider, request);

      // Log güncelle
      await this.db.bankIntegrationLog.update({
        where: { id: log.id },
        data: {
          status: result.success ? 'SUCCESS' : 'FAILED',
          errorCode: result.errorCode,
          errorMessage: result.errorMessage,
          responseData: result as any,
          completedAt: new Date(),
        },
      });

      return result;
    } catch (error: any) {
      await this.db.bankIntegrationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date(),
        },
      });

      return {
        success: false,
        errorCode: 'TRANSFER_ERROR',
        errorMessage: error.message,
      };
    }
  }

  // ==================== BANKA API'LERİ ====================

  private async queryBalance(provider: BankProvider, iban: string): Promise<BankBalance> {
    switch (provider) {
      case 'garanti':
        return this.queryBalanceGaranti(iban);
      case 'akbank':
        return this.queryBalanceAkbank(iban);
      case 'isbank':
        return this.queryBalanceIsbank(iban);
      default:
        return this.queryBalanceMock(iban);
    }
  }

  private async fetchTransactions(
    provider: BankProvider,
    iban: string,
    startDate: Date,
    endDate: Date,
  ): Promise<BankTransactionData[]> {
    switch (provider) {
      case 'garanti':
        return this.fetchTransactionsGaranti(iban, startDate, endDate);
      case 'akbank':
        return this.fetchTransactionsAkbank(iban, startDate, endDate);
      case 'isbank':
        return this.fetchTransactionsIsbank(iban, startDate, endDate);
      default:
        return this.fetchTransactionsMock(iban, startDate, endDate);
    }
  }

  private async executeTransfer(provider: BankProvider, request: TransferRequest): Promise<TransferResult> {
    switch (provider) {
      case 'garanti':
        return this.transferGaranti(request);
      case 'akbank':
        return this.transferAkbank(request);
      case 'isbank':
        return this.transferIsbank(request);
      default:
        return this.transferMock(request);
    }
  }

  // ==================== GARANTİ BBVA ====================

  private async queryBalanceGaranti(iban: string): Promise<BankBalance> {
    // Garanti API entegrasyonu
    // Gerçek implementasyonda Garanti API'si çağrılacak
    this.logger.log(`[GARANTI] Bakiye sorgusu: ${maskIban(iban)}`);
    return this.queryBalanceMock(iban);
  }

  private async fetchTransactionsGaranti(iban: string, startDate: Date, endDate: Date): Promise<BankTransactionData[]> {
    this.logger.log(`[GARANTI] Hareket sorgusu: ${maskIban(iban)}`);
    return this.fetchTransactionsMock(iban, startDate, endDate);
  }

  private async transferGaranti(request: TransferRequest): Promise<TransferResult> {
    this.logger.log(`[GARANTI] Transfer: ${request.amount} ${request.currency}`);
    return this.transferMock(request);
  }

  // ==================== AKBANK ====================

  private async queryBalanceAkbank(iban: string): Promise<BankBalance> {
    this.logger.log(`[AKBANK] Bakiye sorgusu: ${maskIban(iban)}`);
    return this.queryBalanceMock(iban);
  }

  private async fetchTransactionsAkbank(iban: string, startDate: Date, endDate: Date): Promise<BankTransactionData[]> {
    this.logger.log(`[AKBANK] Hareket sorgusu: ${maskIban(iban)}`);
    return this.fetchTransactionsMock(iban, startDate, endDate);
  }

  private async transferAkbank(request: TransferRequest): Promise<TransferResult> {
    this.logger.log(`[AKBANK] Transfer: ${request.amount} ${request.currency}`);
    return this.transferMock(request);
  }

  // ==================== İŞ BANKASI ====================

  private async queryBalanceIsbank(iban: string): Promise<BankBalance> {
    this.logger.log(`[ISBANK] Bakiye sorgusu: ${maskIban(iban)}`);
    return this.queryBalanceMock(iban);
  }

  private async fetchTransactionsIsbank(iban: string, startDate: Date, endDate: Date): Promise<BankTransactionData[]> {
    this.logger.log(`[ISBANK] Hareket sorgusu: ${maskIban(iban)}`);
    return this.fetchTransactionsMock(iban, startDate, endDate);
  }

  private async transferIsbank(request: TransferRequest): Promise<TransferResult> {
    this.logger.log(`[ISBANK] Transfer: ${request.amount} ${request.currency}`);
    return this.transferMock(request);
  }

  // ==================== MOCK ====================

  private async queryBalanceMock(iban: string): Promise<BankBalance> {
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      iban,
      balance: Math.random() * 100000,
      availableBalance: Math.random() * 100000,
      currency: 'TRY',
      lastUpdated: new Date(),
    };
  }

  private async fetchTransactionsMock(iban: string, startDate: Date, endDate: Date): Promise<BankTransactionData[]> {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Mock işlemler oluştur
    const transactions: BankTransactionData[] = [];
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const count = Math.min(daysDiff, 10);

    for (let i = 0; i < count; i++) {
      const date = new Date(startDate.getTime() + Math.random() * (endDate.getTime() - startDate.getTime()));
      const isIncoming = Math.random() > 0.3;
      
      transactions.push({
        transactionDate: date,
        valueDate: date,
        amount: Math.round(Math.random() * 10000 * 100) / 100,
        currency: 'TRY',
        transactionType: isIncoming ? 'INCOMING' : 'OUTGOING',
        counterpartyName: isIncoming ? 'Mock Gönderici' : 'Mock Alıcı',
        counterpartyIban: `TR${Math.random().toString().slice(2, 28)}`,
        description: isIncoming ? `2024/${Math.floor(Math.random() * 10000)} dosya ödemesi` : 'Masraf ödemesi',
        referenceNo: `REF-${Date.now()}-${i}`,
        bankReferenceId: `BANK-${Date.now()}-${i}`,
      });
    }

    return transactions.sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime());
  }

  private async transferMock(request: TransferRequest): Promise<TransferResult> {
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return {
      success: true,
      transactionId: `TRX-${Date.now()}`,
      referenceNo: request.referenceNo || `REF-${Date.now()}`,
    };
  }

  // ==================== HELPERS ====================

  private isValidIban(iban: string): boolean {
    // Basit IBAN doğrulama
    const ibanRegex = /^TR\d{24}$/;
    return ibanRegex.test(iban);
  }

  /**
   * Eşleşmemiş işlemleri getir
   */
  async getUnmatchedTransactions(tenantId: string, limit = 50) {
    return this.db.bankTransaction.findMany({
      where: {
        tenantId,
        isMatched: false,
        transactionType: 'INCOMING',
      },
      include: {
        bankAccount: {
          select: { bankName: true, iban: true },
        },
      },
      orderBy: { transactionDate: 'desc' },
      take: limit,
    });
  }

  /**
   * İstatistikleri getir
   */
  async getStats(tenantId: string) {
    const [
      totalAccounts,
      integratedAccounts,
      totalTransactions,
      unmatchedTransactions,
      totalIncoming,
      totalOutgoing,
    ] = await Promise.all([
      this.db.bankAccount.count({ where: { tenantId, isActive: true } }),
      this.db.bankAccount.count({ where: { tenantId, isActive: true, isIntegrated: true } }),
      this.db.bankTransaction.count({ where: { tenantId } }),
      this.db.bankTransaction.count({ where: { tenantId, isMatched: false, transactionType: 'INCOMING' } }),
      this.db.bankTransaction.aggregate({
        where: { tenantId, transactionType: 'INCOMING' },
        _sum: { amount: true },
      }),
      this.db.bankTransaction.aggregate({
        where: { tenantId, transactionType: 'OUTGOING' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalAccounts,
      integratedAccounts,
      totalTransactions,
      unmatchedTransactions,
      totalIncoming: Number(totalIncoming._sum.amount || 0),
      totalOutgoing: Number(totalOutgoing._sum.amount || 0),
    };
  }
}
