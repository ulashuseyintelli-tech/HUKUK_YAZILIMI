import { Inject, Injectable, Logger, Optional, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ClientStatementStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { OfficeService } from '@/modules/office/office.service';
import { resolveSchedulerTimezone } from '../../common/scheduler-timezone';
import { ClientStatementService } from './client-statement.service';
import { ClientStatementPdfService } from './client-statement-pdf.service';
import { resolveClientSafeFileReferences } from './client-statement-file-reference';
import { buildClientStatementRender } from './client-statement-render.mapper';
import {
  assertStatementDeliverable,
  buildStatementDeliveryMessage,
  type ClientStatementDeliveryPort,
} from './client-statement-delivery.contract';
import {
  CLIENT_STATEMENT_MONTHLY_CRON,
  CLIENT_STATEMENT_MONTHLY_JOB_CLASS,
  buildMonthlyStatementDedupeKey,
  buildMonthlyStatementLockKey,
  resolvePreviousMonthPeriod,
} from './client-statement-monthly-period';

/**
 * CAD C3-B04 — AYLIK EKSTRE ÜRETİMİ VE TESLİMİ (P6).
 *
 * VARSAYILAN KAPALI: `CLIENT_STATEMENT_MONTHLY_DELIVERY` env'i açıkça `'true'`
 * olmadıkça koşu HİÇBİR sorgu çalıştırmaz, HİÇBİR ekstre üretmez, HİÇBİR mail
 * göndermez. Kalıcı schedule activation owner teyidine tabidir (ACTIVATION DEBT).
 *
 * TESLİM MODU: taşıma portu (`CLIENT_STATEMENT_DELIVERY_PORT`) bu modülde
 * KAYITLI DEĞİLDİR. Port enjekte edilmemişse koşu `PLAN_ONLY` çalışır — teslim
 * adayı hesaplanır, PDF/mail ÜRETİLMEZ ve gönderilmez. Gerçek gönderim, kalıcı
 * outbox + audit kaydıyla birlikte C3-B05'te bağlanır.
 *
 * DUPLICATE ÜRETİM: asıl garanti `ClientStatementService.createClientLevel`in
 * kendi advisory lock + period-scoped tek-ACTIVE guard'ıdır. Buradaki ön kontrol
 * yalnız gereksiz iş ve gereksiz Conflict üretimini önler; yarışta gelen Conflict
 * duplicate'in ENGELLENDİĞİ anlamına gelir ve hata olarak değil `SKIPPED` olarak
 * raporlanır.
 *
 * DUPLICATE GÖNDERİM: gönderim öncesi, mevcut ClientNotification idempotency
 * kaydı (`dedupeKey` + `status='SENT'`) READ-ONLY sorgulanır; koşu içi ikinci
 * kez teslim ayrıca in-run ledger ile engellenir. KALICI teslim defteri bu blokta
 * KURULMAZ (şema sahibi X3; kalıcı outbox C3-B05) — bu sınır `persistentDeliveryLedger:
 * false` alanıyla açıkça raporlanır, "engellendi" diye örtülmez.
 */

export const CLIENT_STATEMENT_DELIVERY_PORT = 'CLIENT_STATEMENT_DELIVERY_PORT';

/** Sistem koşusunun ürettiği ekstrelerde `generatedById` (FK yok — plain string). */
export const CLIENT_STATEMENT_MONTHLY_ACTOR = 'SYSTEM_MONTHLY_STATEMENT';

export type MonthlyDeliveryOutcome =
  | 'DELIVERED'
  | 'PLANNED'
  | 'SKIPPED_NO_RECIPIENT'
  | 'SKIPPED_EMPTY_PERIOD'
  | 'SKIPPED_ALREADY_DELIVERED'
  | 'SKIPPED_DUPLICATE_RUN'
  | 'FAILED';

export interface MonthlyDeliveryTargetResult {
  tenantId: string;
  clientId: string;
  outcome: MonthlyDeliveryOutcome;
  /** Üretim kararı: yeni ekstre mi, aynı dönemde zaten ACTIVE olan mı, hiç üretilmedi mi. */
  statementSource: 'GENERATED' | 'REUSED' | 'NONE';
  reason?: string;
}

export interface MonthlyDeliveryRunResult {
  enabled: boolean;
  deliveryMode: 'PLAN_ONLY' | 'PORT';
  /** Kalıcı teslim defteri kuruldu mu — B04'te HAYIR (B05'e devredildi). */
  persistentDeliveryLedger: boolean;
  periodKey: string | null;
  scanned: number;
  generated: number;
  reused: number;
  delivered: number;
  planned: number;
  skipped: number;
  failed: number;
  targets: readonly MonthlyDeliveryTargetResult[];
}

interface ClientContactRow {
  type: string | null;
  value: string | null;
  isPrimary: boolean | null;
}

interface ClientRow {
  id: string;
  tenantId: string;
  displayName: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  contacts?: ClientContactRow[] | null;
}

@Injectable()
export class ClientStatementMonthlyDeliveryService implements OnModuleInit {
  private readonly logger = new Logger(ClientStatementMonthlyDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly statements: ClientStatementService,
    private readonly pdf: ClientStatementPdfService,
    private readonly office: OfficeService,
    @Optional() private readonly scheduler?: SchedulerRegistry,
    @Optional() @Inject(CLIENT_STATEMENT_DELIVERY_PORT)
    private readonly deliveryPort?: ClientStatementDeliveryPort,
  ) {}

  /** Env bayrağı — açık teyit olmadan KAPALI. */
  isEnabled(): boolean {
    return process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY === 'true';
  }

  /**
   * Cron KAYDI bayrağa bağlıdır: kapalıyken `@Cron` dekoratörünün aksine hiçbir job
   * kaydedilmez → kanonik cron envanteri (W3-F03 runtime doğrulaması) DEĞİŞMEZ.
   * Aktivasyon owner teyidine tabidir; teyit geldiğinde envanter beklentisi de o
   * aktivasyon değişikliğinin parçası olarak güncellenir (ACTIVATION DEBT).
   */
  onModuleInit(): void {
    if (!this.isEnabled() || !this.scheduler) return;

    const job = new CronJob(
      CLIENT_STATEMENT_MONTHLY_CRON,
      () => {
        void this.handleMonthlyCron();
      },
      null,
      false,
      resolveSchedulerTimezone(CLIENT_STATEMENT_MONTHLY_JOB_CLASS),
    );
    this.scheduler.addCronJob(CLIENT_STATEMENT_MONTHLY_JOB_CLASS, job as any);
    job.start();
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - onModuleInit'te bayrak açıkken kaydedilen cron (her ayın 1'i 03:00, Europe/Istanbul)
  /// </remarks>
  async handleMonthlyCron(): Promise<void> {
    if (!this.isEnabled()) return;
    const result = await this.runMonthlyDelivery(new Date());
    this.logger.log(
      `Aylık ekstre koşusu (${result.periodKey}): tarandı=${result.scanned} üretildi=${result.generated} ` +
        `yeniden-kullanıldı=${result.reused} teslim=${result.delivered} plan=${result.planned} ` +
        `atlandı=${result.skipped} başarısız=${result.failed}`,
    );
  }

  async runMonthlyDelivery(
    now: Date,
    scope: { tenantId?: string; clientId?: string } = {},
  ): Promise<MonthlyDeliveryRunResult> {
    const deliveryMode: 'PLAN_ONLY' | 'PORT' = this.deliveryPort ? 'PORT' : 'PLAN_ONLY';

    if (!this.isEnabled()) {
      // Kapalıyken TEK sorgu bile çalıştırılmaz.
      return this.emptyResult(deliveryMode, null, false);
    }

    const period = resolvePreviousMonthPeriod(now);
    const clients = (await this.prisma.client.findMany({
      where: {
        isActive: true,
        ...(scope.tenantId ? { tenantId: scope.tenantId } : {}),
        ...(scope.clientId ? { id: scope.clientId } : {}),
      },
      select: {
        id: true,
        tenantId: true,
        displayName: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        contacts: { select: { type: true, value: true, isPrimary: true } },
      },
      orderBy: [{ tenantId: 'asc' }, { id: 'asc' }],
    })) as unknown as ClientRow[];

    const result = this.emptyResult(deliveryMode, period.periodKey, true);
    const targets: MonthlyDeliveryTargetResult[] = [];
    const deliveredInRun = new Set<string>();
    result.scanned = clients.length;

    for (const client of clients) {
      const target = await this.processClient(client, period, deliveredInRun);
      targets.push(target);

      if (target.statementSource === 'GENERATED') result.generated += 1;
      if (target.statementSource === 'REUSED') result.reused += 1;
      if (target.outcome === 'DELIVERED') result.delivered += 1;
      else if (target.outcome === 'PLANNED') result.planned += 1;
      else if (target.outcome === 'FAILED') result.failed += 1;
      else result.skipped += 1;
    }

    return { ...result, targets };
  }

  private async processClient(
    client: ClientRow,
    period: { periodKey: string; periodStart: Date; periodEnd: Date },
    deliveredInRun: Set<string>,
  ): Promise<MonthlyDeliveryTargetResult> {
    const base = { tenantId: client.tenantId, clientId: client.id };

    const recipientEmail = this.resolveRecipientEmail(client);
    if (!recipientEmail) {
      return { ...base, outcome: 'SKIPPED_NO_RECIPIENT', statementSource: 'NONE' };
    }

    let statementId: string | null = null;
    let statementSource: 'GENERATED' | 'REUSED' = 'REUSED';

    try {
      statementId = await this.findActiveClientLevelStatementId(client, period);
      if (!statementId) {
        const created = await this.statements.createClientLevel(
          client.tenantId,
          client.id,
          CLIENT_STATEMENT_MONTHLY_ACTOR,
          {
            periodStart: period.periodStart.toISOString(),
            periodEnd: period.periodEnd.toISOString(),
          } as any,
        );
        statementId = created.id;
        statementSource = 'GENERATED';
      }
    } catch (error: any) {
      // Yarışta ikinci koşu Conflict alır → duplicate üretim ENGELLENDİ demektir.
      if (error?.status === 409 || error?.constructor?.name === 'ConflictException') {
        return { ...base, outcome: 'SKIPPED_DUPLICATE_RUN', statementSource: 'NONE', reason: 'active-statement-race' };
      }
      this.logger.warn(`Aylık ekstre üretilemedi (${client.tenantId}/${client.id}): ${error?.message || error}`);
      return { ...base, outcome: 'FAILED', statementSource: 'NONE', reason: 'generate-failed' };
    }

    const statement = await this.statements.findOne(client.tenantId, statementId);
    if (!statement.lines || statement.lines.length === 0) {
      return { ...base, outcome: 'SKIPPED_EMPTY_PERIOD', statementSource };
    }

    const dedupeKey = buildMonthlyStatementDedupeKey(statement.id, period.periodKey);
    if (deliveredInRun.has(dedupeKey)) {
      return { ...base, outcome: 'SKIPPED_ALREADY_DELIVERED', statementSource, reason: 'in-run-ledger' };
    }

    const alreadySent = await this.prisma.clientNotification.findFirst({
      where: { tenantId: client.tenantId, dedupeKey, status: 'SENT' },
      select: { id: true },
    });
    if (alreadySent) {
      return { ...base, outcome: 'SKIPPED_ALREADY_DELIVERED', statementSource, reason: 'notification-ledger' };
    }

    if (!this.deliveryPort) {
      // PLAN_ONLY: PDF üretilmez, mail kurulmaz, gönderim yapılmaz.
      return { ...base, outcome: 'PLANNED', statementSource };
    }

    try {
      assertStatementDeliverable(statement.status as ClientStatementStatus, recipientEmail);

      const caseIds = statement.lines
        .map((line: any) => line.caseId)
        .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
      const fileReferences = await resolveClientSafeFileReferences(
        this.prisma,
        client.tenantId,
        client.id,
        caseIds,
      );
      const office = await this.office.getOrCreate(client.tenantId);

      const render = buildClientStatementRender({
        statement: statement as any,
        officeName: office?.name ?? '',
        clientName: this.resolveClientName(client),
        fileReferences,
      });
      const pdf = await this.pdf.render(render, statement.status as ClientStatementStatus);
      const message = buildStatementDeliveryMessage({ render, recipientEmail, pdf });

      const sent = await this.deliveryPort.send(message);
      if (!sent?.success) {
        return { ...base, outcome: 'FAILED', statementSource, reason: sent?.errorCode || 'delivery-failed' };
      }

      deliveredInRun.add(dedupeKey);
      return { ...base, outcome: 'DELIVERED', statementSource };
    } catch (error: any) {
      this.logger.warn(`Aylık ekstre teslim edilemedi (${client.tenantId}/${client.id}): ${error?.message || error}`);
      return { ...base, outcome: 'FAILED', statementSource, reason: 'delivery-error' };
    }
  }

  /**
   * Aynı dönemde ACTIVE client-level ekstre var mı? Eşzamanlı koşular advisory
   * lock ile serileştirilir (üretim garantisi createClientLevel'da; bu kontrol
   * gereksiz iş ve gereksiz Conflict üretimini önler).
   */
  private async findActiveClientLevelStatementId(
    client: ClientRow,
    period: { periodKey: string; periodStart: Date; periodEnd: Date },
  ): Promise<string | null> {
    const lockKey = buildMonthlyStatementLockKey(client.tenantId, client.id, period.periodKey);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.clientStatement.findFirst({
        where: {
          tenantId: client.tenantId,
          clientId: client.id,
          caseId: null,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          status: ClientStatementStatus.ACTIVE,
        },
        select: { id: true },
      });
      return existing?.id ?? null;
    });
  }

  /** Kanonik alıcı çözümü (ClientNotificationService.sendEmail deseni — yeni yetki modeli KURULMAZ). */
  private resolveRecipientEmail(client: ClientRow): string | null {
    const contacts = client.contacts || [];
    const primary = contacts.find((c) => c.type === 'EMAIL' && c.isPrimary === true);
    const anyEmail = contacts.find((c) => c.type === 'EMAIL');
    const raw = primary?.value || anyEmail?.value || client.email || '';
    const normalized = raw.trim().toLowerCase();
    return normalized.includes('@') ? normalized : null;
  }

  private resolveClientName(client: ClientRow): string {
    return (
      client.displayName ||
      client.name ||
      [client.firstName, client.lastName].filter(Boolean).join(' ').trim() ||
      'Müvekkil'
    );
  }

  private emptyResult(
    deliveryMode: 'PLAN_ONLY' | 'PORT',
    periodKey: string | null,
    enabled: boolean,
  ): MonthlyDeliveryRunResult {
    return {
      enabled,
      deliveryMode,
      persistentDeliveryLedger: false,
      periodKey,
      scanned: 0,
      generated: 0,
      reused: 0,
      delivered: 0,
      planned: 0,
      skipped: 0,
      failed: 0,
      targets: [],
    };
  }
}
