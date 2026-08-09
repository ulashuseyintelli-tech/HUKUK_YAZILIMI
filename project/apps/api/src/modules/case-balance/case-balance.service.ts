import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientNotificationService } from '@/modules/client-notification/client-notification.service';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
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

/**
 * C1-B05-B — TYPED gerçekleşen-masraf posting komutu girdisi (owner kararı).
 * postingKey: çağıran sağlar, STABLE (timestamp yok); aynı (tenant, postingKey) EN FAZLA 1 kez POST edilir.
 */
export interface PostExpenseActualDto {
  amount: number;
  postingKey: string;
  description?: string;
}

export interface PostExpenseActualResult {
  success: true;
  alreadyPosted: boolean;
  ledgerId: string;
  newBalance: number;
  notification:
    | { outcome: 'QUEUED_AND_DISPATCHED'; notificationId: string; dispatchStatus: string }
    | { outcome: 'QUEUED'; notificationId: string }
    | { outcome: 'RECIPIENT_SCOPE_AMBIGUOUS' }
    | { outcome: 'ALREADY_POSTED_NO_NEW_INTENT' };
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
    // C1-B05-B: typed EXPENSE_ACTUAL posting için delivery-intent bağımlılıkları.
    // @Optional: mevcut unit testler `new CaseBalanceService(prisma)` ile kurulabilir kalır;
    // postExpenseActual bu bağımlılıklar olmadan çağrılırsa açıkça reddeder (fail-closed).
    @Optional() private readonly clientNotification?: ClientNotificationService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcherService,
  ) {}

  /**
   * Dosya bakiyesini getir veya oluştur
   */
  /// <remarks>
  /// Güvenlik sözleşmesi (CLIENT-P0-T04-C1 — tenant fail-closed containment):
  /// - `tenantId` yalnız authenticated principal'dan gelir; body/query/path üzerinden tenant otoritesi kabul edilmez.
  /// - `caseId`'nin authenticated tenant'a ait olduğu, herhangi bir bakiye/ledger/journal yan etkisinden ÖNCE burada doğrulanır.
  /// - Route-erişilebilir tüm yollar (getBalance/getLedger/credit/debit) bu tek noktadan geçer → service-level fail-closed.
  /// - Cross-tenant veya bilinmeyen dava aynı tenant-scoped NotFound yanıtını alır (existence oracle yok).
  /// - Mevcut CaseBalance satırı authenticated tenant ile eşleşmezse fail-closed; historical mismatch auto-repair EDİLMEZ.
  /// </remarks>
  async getOrCreateBalance(tenantId: string, caseId: string) {
    // 1) Dava sahipliği: caseId authenticated tenant'a ait mi? Değilse tenant-scoped NotFound (existence oracle yok).
    const ownedCase = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!ownedCase) {
      throw new NotFoundException('Dava bulunamadı');
    }

    // 2) Mevcut bakiye satırı varsa tenant eşleşmeli; eşleşmiyorsa fail-closed (mutasyon yok, auto-repair yok).
    const existing = await this.prisma.caseBalance.findUnique({ where: { caseId } });
    if (existing) {
      if (existing.tenantId !== tenantId) {
        throw new ForbiddenException('CaseBalance tenant uyuşmazlığı');
      }
      return existing;
    }

    // 3) Sahiplik doğrulandı → yeni bakiye oluştur. Concurrent create global `caseId @unique` fence'ine
    //    düşerse yeniden okuyup tenant doğrula; idempotency/unique davranışı korunur.
    try {
      return await this.prisma.caseBalance.create({
        data: {
          tenantId,
          caseId,
          balance: 0,
          lowThreshold: 500, // Varsayılan düşük bakiye eşiği
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const raced = await this.prisma.caseBalance.findUnique({ where: { caseId } });
        if (raced && raced.tenantId === tenantId) {
          return raced;
        }
        throw new ForbiddenException('CaseBalance tenant uyuşmazlığı');
      }
      throw error;
    }
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

  /**
   * C1-B05-B — YETKİLİ TYPED GERÇEKLEŞEN-MASRAF POSTING KOMUTU (owner kararı).
   *
   * Generic debit()'ten farkları:
   * - Ledger satırı yazım anında DURABLE + TYPED sınıflandırılır (entryKind=EXPENSE_ACTUAL);
   *   haciz/operasyon/manuel/reversal DEBIT'leri bu değeri ASLA almaz.
   * - Posting idempotency: (tenantId, postingKey) advisory lock + DB unique → EN FAZLA 1 ledger satırı.
   * - Finansal kayıt + QUEUED notification delivery-intent AYNI transaction'da kalıcılaşır (outcome-4);
   *   provider çağrısı COMMIT SONRASI yapılır (outcome-5); mail başarısızlığı POSTED kaydı
   *   rollback ETMEZ (outcome-6) — dispatch best-effort'tur ve asla throw ile yayılmaz.
   * - Alıcı: dosyanın KESİN TEK creditor müvekkili (CaseClient ∪ Case.clientId aday kümesi tam 1
   *   farklı müvekkile inerse); belirsizse GÖNDERİM YOK (broadcast yasak) — posting yine POSTED olur.
   * - ExpenseRequest RECEIVED/PAID bu komuta DÖNÜŞTÜRÜLMEZ (onlar müvekkil ödemesi = CREDIT).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - CaseBalanceController.postExpenseActual() → POST /cases/:caseId/balance/expense-actual (ADMIN)
   * </remarks>
   */
  async postExpenseActual(
    tenantId: string,
    caseId: string,
    dto: PostExpenseActualDto,
    userId: string,
  ): Promise<PostExpenseActualResult> {
    if (!this.clientNotification || !this.notificationDispatcher) {
      throw new ConflictException('postExpenseActual: notification bağımlılıkları yapılandırılmamış');
    }
    if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('Geçersiz tutar: pozitif sayı olmalı');
    }
    if (typeof dto.postingKey !== 'string' || !/^[A-Za-z0-9._:-]{1,120}$/.test(dto.postingKey)) {
      throw new BadRequestException('Geçersiz postingKey: 1-120 karakter, [A-Za-z0-9._:-]');
    }

    // Tenant fail-closed sahiplik + bakiye (debit() ile aynı tek nokta).
    const balance = await this.getOrCreateBalance(tenantId, caseId);

    // Dosya + KESİN creditor müvekkil çözümü (tek source-of-truth aday kümesi; belirsiz → gönderim yok).
    const caseRow = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: {
        id: true,
        clientId: true,
        fileNumber: true,
        executionFileNumber: true,
        caseClients: { select: { clientId: true } },
      },
    });
    if (!caseRow) {
      throw new NotFoundException('Dava bulunamadı');
    }
    const candidateClientIds = new Set<string>(caseRow.caseClients.map((cc) => cc.clientId));
    if (caseRow.clientId) candidateClientIds.add(caseRow.clientId);
    const recipientClientId = candidateClientIds.size === 1 ? [...candidateClientIds][0] : null;

    // Bildirim token'ları (POL-4: yalnız insan-okur alanlar; raw iç ID YOK; tr-TR biçim).
    let tokens: Record<string, string> | null = null;
    if (recipientClientId) {
      const [client, office] = await Promise.all([
        this.prisma.client.findFirst({ where: { id: recipientClientId, tenantId }, select: { displayName: true, name: true } }),
        this.prisma.office.findFirst({ where: { tenantId }, select: { name: true, phone: true } }),
      ]);
      tokens = {
        clientName: client?.displayName || client?.name || 'Müvekkil',
        caseFileNumber: caseRow.fileNumber ?? '',
        executionFileNumber: caseRow.executionFileNumber ?? '',
        expenseDate: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        description: dto.description || 'Gerçekleşen masraf',
        amount: dto.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        currency: 'TL',
        officeName: office?.name ?? '',
        officePhone: office?.phone ?? '',
      };
    }

    // Bakiye yeterliliği: debit() davranışı birebir (politika icat edilmez).
    if (Number(balance.balance) < dto.amount) {
      throw new BadRequestException(
        `Yetersiz bakiye. Mevcut: ${balance.balance} TL, Gerekli: ${dto.amount} TL`
      );
    }

    const lockKeyText = `expense-actual-post|${tenantId}|${dto.postingKey}`;
    const txResult = await this.prisma.$transaction(async (tx) => {
      // Aynı (tenant, postingKey) posting'leri serileştir; DB unique constraint son savunma hattıdır.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKeyText}, 0))`;

      const existing = await tx.balanceLedger.findFirst({
        where: { tenantId, postingKey: dto.postingKey },
        select: { id: true },
      });
      if (existing) {
        // İdempotent replay: ikinci ledger/intent/mail YOK (outcome: en fazla 1). Mevcut intent'e
        // DOKUNULMAZ (QUEUED ise drain işler; PENDING/SENT/FAILED durumları korunur).
        return { alreadyPosted: true as const, ledgerId: existing.id, intentId: null, newBalance: Number(balance.balance) };
      }

      const ledger = await tx.balanceLedger.create({
        data: {
          tenantId,
          caseBalanceId: balance.id,
          type: BalanceLedgerType.DEBIT,
          amount: -dto.amount, // Negatif (debit ile aynı işaret sözleşmesi)
          entryKind: 'EXPENSE_ACTUAL',
          postingKey: dto.postingKey,
          source: `expense_actual:${dto.postingKey}`,
          sourceId: dto.postingKey,
          description: dto.description || 'Gerçekleşen masraf',
          createdById: userId,
        },
      });

      const updatedBalance = await tx.caseBalance.update({
        where: { id: balance.id },
        data: { balance: { decrement: dto.amount } },
      });

      // Journal: mevcut BalanceLedger DEBIT yolu birebir (suppress prefix'lerine düşmez).
      const journalDraft = this.buildBalanceLedgerJournalDraft(tenantId, caseId, ledger as JournalableBalanceLedgerRow);
      if (journalDraft) {
        await this.writeBalanceLedgerJournal(tx, journalDraft);
      }

      // QUEUED delivery-intent AYNI TX'te (outcome-4). Render YOK; provider YOK.
      let intentId: string | null = null;
      if (recipientClientId && tokens) {
        const intent = await this.clientNotification!.enqueueEmailIntentInTransaction(tx, tenantId, userId, {
          clientId: recipientClientId,
          caseId,
          type: 'MASRAF_GERCEKLESEN',
          dedupeKey: `EXPENSE_ACTUAL_POSTED:BalanceLedger:${ledger.id}:1`,
          templateCode: 'EXPENSE_ACTUAL_POSTED',
          tokens,
        });
        intentId = intent.notificationId;
      }

      return { alreadyPosted: false as const, ledgerId: ledger.id, intentId, newBalance: Number(updatedBalance.balance) };
    });

    // COMMIT SONRASI best-effort teslim (outcome-5/6): başarısızlık POSTED kaydı ETKİLEMEZ.
    if (txResult.alreadyPosted) {
      return {
        success: true,
        alreadyPosted: true,
        ledgerId: txResult.ledgerId,
        newBalance: txResult.newBalance,
        notification: { outcome: 'ALREADY_POSTED_NO_NEW_INTENT' },
      };
    }
    if (!txResult.intentId) {
      this.logger.warn(`postExpenseActual: alıcı çözülemedi (aday=${candidateClientIds.size}) — bildirim üretilmedi (caseId=${caseId})`);
      return {
        success: true,
        alreadyPosted: false,
        ledgerId: txResult.ledgerId,
        newBalance: txResult.newBalance,
        notification: { outcome: 'RECIPIENT_SCOPE_AMBIGUOUS' },
      };
    }
    try {
      const dispatch = await this.notificationDispatcher!.dispatchQueuedIntent(tenantId, userId, txResult.intentId);
      return {
        success: true,
        alreadyPosted: false,
        ledgerId: txResult.ledgerId,
        newBalance: txResult.newBalance,
        notification: { outcome: 'QUEUED_AND_DISPATCHED', notificationId: txResult.intentId, dispatchStatus: dispatch.status },
      };
    } catch {
      // dispatchQueuedIntent zaten throw etmez; bu guard salt savunmadır. Intent QUEUED/PENDING kalır.
      return {
        success: true,
        alreadyPosted: false,
        ledgerId: txResult.ledgerId,
        newBalance: txResult.newBalance,
        notification: { outcome: 'QUEUED', notificationId: txResult.intentId },
      };
    }
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
