import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakeLinkDeliveryStatus, ClientIntakeLinkStatus, Prisma } from '@prisma/client';
import { DispatchResult, NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { CreateClientIntakeLinkDto, CreateClientWorkspaceIntakeLinkDto } from './dto/client-intake-link.dto';

// Liste/detayda DÖNDÜRÜLECEK alanlar — tokenHash ASLA dışa verilmez.
const PUBLIC_SELECT = {
  id: true,
  tenantId: true,
  caseId: true,
  clientId: true,
  status: true,
  scope: true,
  expiresAt: true,
  maxUses: true,
  useCount: true,
  createdById: true,
  createdAt: true,
} as const;

const DELIVERY_SELECT = {
  id: true,
  tenantId: true,
  clientId: true,
  caseId: true,
  intakeLinkId: true,
  idempotencyKey: true,
  dedupeKey: true,
  channel: true,
  status: true,
  notificationId: true,
  attemptCount: true,
  lastError: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

const DELIVERY_WITH_LINK_SELECT = {
  ...DELIVERY_SELECT,
  intakeLink: { select: PUBLIC_SELECT },
} as const;

const REDACTED_INTAKE_URL = '[REDACTED_INTAKE_LINK]';

type IntakeLinkWriteDb = Pick<PrismaService, 'clientIntakeLink'> | Prisma.TransactionClient;

/**
 * Müvekkil İntake Linki servisi (Faz 4.3) — personel/JWT.
 *
 * Yalnız LİNK ÜRETİMİ + best-effort INTAKE_LINK maili. Public submit/review/promote DEĞİL.
 *
 * GÜVENLİK (kilitli kararlar):
 * - Ham token = 32 byte random → base64url. DB'ye YALNIZ sha256(token) = tokenHash yazılır.
 *   Ham token ASLA saklanmaz; yalnız create yanıtında + mailde TEK sefer döner.
 * - Liste/detay tokenHash'i DÖNDÜRMEZ (PUBLIC_SELECT).
 * - Mail best-effort: başarısız olsa da link ACTIVE kalır (Faz 3 omurgası).
 * - Multitenant: case/client aynı tenant doğrulanır.
 */
@Injectable()
export class ClientIntakeLinkService {
  private readonly logger = new Logger(ClientIntakeLinkService.name);

  constructor(
    private prisma: PrismaService,
    private dispatcher: NotificationDispatcherService,
    private office: OfficeService,
  ) {}

  /**
   * Link üret (ACTIVE) + best-effort INTAKE_LINK maili. rawToken + intakeUrl TEK sefer döner.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeLinkController.create() → POST /client-intake-links/case/:caseId
   * </remarks>
   */
  async create(tenantId: string, caseId: string, userId: string, dto: CreateClientIntakeLinkDto) {
    await this.assertLegacyCreateBoundary(tenantId, caseId, dto.clientId);
    const result = await this.createLinkRecord(this.prisma, tenantId, dto.clientId, caseId, userId, dto);

    // best-effort mail (state'i bozmaz)
    await this.notifyLink(tenantId, userId, result.link.id, dto.clientId, caseId, result.intakeUrl, result.link.expiresAt);

    // rawToken + intakeUrl YALNIZ burada (tek sefer) döner; sonra erişilemez.
    return result;
  }

  /**
   * Client Workspace Action Center create command: link üretir, dispatch yapmaz.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientController.createIntakeLink() -> POST /clients/:clientId/cases/:caseId/intake-links
   * </remarks>
   */
  async createForClientWorkspace(
    tenantId: string,
    clientId: string,
    caseId: string,
    userId: string,
    dto: CreateClientWorkspaceIntakeLinkDto,
  ) {
    await this.assertClientWorkspaceCreateBoundary(tenantId, clientId, caseId);
    return this.createLinkRecord(this.prisma, tenantId, clientId, caseId, userId, dto);
  }

  /**
   * Client Workspace Action Center create-and-deliver command: link üretir ve aynı request içinde delivery dener.
   * Response raw token veya public form URL dönmez; persisted notification body redacted kalır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientController.createAndDeliverIntakeLink() -> POST /clients/:clientId/cases/:caseId/intake-links/create-and-deliver
   * </remarks>
   */
  async createAndDeliverForClientWorkspace(
    tenantId: string,
    clientId: string,
    caseId: string,
    userId: string,
    idempotencyKey: string | undefined,
    dto: CreateClientWorkspaceIntakeLinkDto,
  ) {
    const normalizedIdempotencyKey = this.normalizeIdempotencyKey(idempotencyKey);
    await this.assertClientWorkspaceCreateBoundary(tenantId, clientId, caseId);

    const existing = await this.findDeliveryByIdempotencyKey(tenantId, normalizedIdempotencyKey);
    if (existing) {
      return { link: existing.intakeLink, delivery: this.toDeliveryResponse(existing) };
    }

    const dedupeKey = this.buildDeliveryDedupeKey(clientId, caseId, normalizedIdempotencyKey);
    let created: { link: any; rawToken: string; intakeUrl: string; delivery: any };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const result = await this.createLinkRecord(tx, tenantId, clientId, caseId, userId, dto);
        const delivery = await tx.clientIntakeLinkDelivery.create({
          data: {
            tenantId,
            clientId,
            caseId,
            intakeLinkId: result.link.id,
            idempotencyKey: normalizedIdempotencyKey,
            dedupeKey,
            channel: 'EMAIL',
            status: ClientIntakeLinkDeliveryStatus.PENDING,
            attemptCount: 0,
            createdById: userId,
          },
          select: DELIVERY_SELECT,
        });
        return { ...result, delivery };
      });
    } catch (error: any) {
      if (this.isUniqueConstraintError(error)) {
        const concurrent = await this.findDeliveryByIdempotencyKey(tenantId, normalizedIdempotencyKey);
        if (concurrent) return { link: concurrent.intakeLink, delivery: this.toDeliveryResponse(concurrent) };
      }
      throw error;
    }

    await this.prisma.clientIntakeLinkDelivery.update({
      where: { id: created.delivery.id },
      data: {
        status: ClientIntakeLinkDeliveryStatus.SENDING,
        attemptCount: { increment: 1 },
        lastError: null,
      },
      select: DELIVERY_SELECT,
    });

    const dispatch = await this.notifyLinkForCreateAndDeliver(
      tenantId,
      userId,
      created.delivery.id,
      created.delivery.dedupeKey,
      clientId,
      caseId,
      created.intakeUrl,
      created.link.expiresAt,
    );
    const failed = dispatch.status === 'failed';
    const finalDelivery = await this.prisma.clientIntakeLinkDelivery.update({
      where: { id: created.delivery.id },
      data: {
        status: failed ? ClientIntakeLinkDeliveryStatus.FAILED : ClientIntakeLinkDeliveryStatus.SENT,
        notificationId: dispatch.notificationId,
        lastError: failed ? this.sanitizeDeliveryError(dispatch.error) : null,
      },
      select: DELIVERY_SELECT,
    });

    return { link: created.link, delivery: this.toDeliveryResponse(finalDelivery) };
  }

  /**
   * Linki iptal et (ACTIVE → REVOKED). Submit kapanır.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeLinkController.revoke() → POST /client-intake-links/:id/revoke
   * </remarks>
   */
  async revoke(tenantId: string, id: string, userId: string) {
    const existing = await this.prisma.clientIntakeLink.findFirst({ where: { id, tenantId }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('İntake linki bulunamadı');
    if (existing.status !== ClientIntakeLinkStatus.ACTIVE) {
      throw new BadRequestException(`Yalnız ACTIVE link iptal edilebilir (durum: ${existing.status})`);
    }
    return this.prisma.clientIntakeLink.update({
      where: { id },
      data: { status: ClientIntakeLinkStatus.REVOKED },
      select: PUBLIC_SELECT,
    });
  }

  /**
   * Dosya bazlı link listesi — tokenHash DÖNDÜRMEZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeLinkController.listByCase() → GET /client-intake-links/case/:caseId?status=
   * </remarks>
   */
  async listByCase(tenantId: string, caseId: string, status?: ClientIntakeLinkStatus) {
    return this.prisma.clientIntakeLink.findMany({
      where: { tenantId, caseId, ...(status ? { status } : {}) },
      select: PUBLIC_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tek link (metadata) — tokenHash DÖNDÜRMEZ.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientIntakeLinkController.findOne() → GET /client-intake-links/:id
   * </remarks>
   */
  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.clientIntakeLink.findFirst({ where: { id, tenantId }, select: PUBLIC_SELECT });
    if (!record) throw new NotFoundException('İntake linki bulunamadı');
    return record;
  }

  private normalizeIdempotencyKey(idempotencyKey?: string): string {
    const normalized = (idempotencyKey || '').trim();
    if (!normalized) throw new BadRequestException('Idempotency-Key header zorunludur');
    if (normalized.length > 200) throw new BadRequestException('Idempotency-Key en fazla 200 karakter olabilir');
    return normalized;
  }

  private buildDeliveryDedupeKey(clientId: string, caseId: string, idempotencyKey: string): string {
    const keyHash = createHash('sha256').update(idempotencyKey).digest('hex');
    return `INTAKE_LINK_DELIVERY:${clientId}:${caseId}:${keyHash}`;
  }

  private async findDeliveryByIdempotencyKey(tenantId: string, idempotencyKey: string) {
    return this.prisma.clientIntakeLinkDelivery.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
      select: DELIVERY_WITH_LINK_SELECT,
    });
  }

  private toDeliveryResponse(delivery: any) {
    return {
      id: delivery.id,
      status: String(delivery.status).toLowerCase(),
      channel: delivery.channel,
      notificationId: delivery.notificationId ?? undefined,
      attemptCount: delivery.attemptCount,
      error: delivery.lastError ?? undefined,
    };
  }

  private isUniqueConstraintError(error: any): boolean {
    return error?.code === 'P2002' || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002');
  }

  private async assertLegacyCreateBoundary(tenantId: string, caseId: string, clientId: string): Promise<void> {
    const caseItem = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');
  }

  private async assertClientWorkspaceCreateBoundary(tenantId: string, clientId: string, caseId: string): Promise<void> {
    const caseItem = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');

    const client = await this.prisma.client.findFirst({ where: { id: clientId, tenantId, isActive: true }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    const caseClient = await this.prisma.caseClient.findFirst({ where: { caseId, clientId }, select: { id: true } });
    if (!caseClient) throw new NotFoundException('Takip/müvekkil ilişkisi bulunamadı');
  }

  private assertFutureExpiresAt(expiresAt?: string): void {
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt gelecekte olmalı');
    }
  }

  private async createLinkRecord(
    db: IntakeLinkWriteDb,
    tenantId: string,
    clientId: string,
    caseId: string,
    userId: string,
    dto: Pick<CreateClientIntakeLinkDto, 'scope' | 'expiresAt' | 'maxUses'>,
  ) {
    this.assertFutureExpiresAt(dto.expiresAt);

    // Ham token + hash (ham token DB'de YOK)
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const link = await db.clientIntakeLink.create({
      data: {
        tenantId,
        caseId,
        clientId,
        tokenHash,
        status: ClientIntakeLinkStatus.ACTIVE,
        scope: dto.scope,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        maxUses: dto.maxUses ?? 1,
        createdById: userId,
      },
      select: PUBLIC_SELECT,
    });

    const intakeUrl = this.buildUrl(rawToken);
    return { link, rawToken, intakeUrl };
  }
  // ==================== iç yardımcılar ====================

  private buildUrl(rawToken: string): string {
    const base = (process.env.PUBLIC_INTAKE_BASE_URL || '').replace(/\/+$/, '');
    return `${base}/intake/${rawToken}`;
  }

  private async buildLinkNotificationTokens(
    tenantId: string,
    clientId: string,
    caseId: string,
    intakeUrl: string,
    expiresAt: Date | null,
  ): Promise<Record<string, string>> {
    const [client, kase, office] = await Promise.all([
      this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { displayName: true, name: true, firstName: true, lastName: true } }),
      this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { fileNumber: true, executionFileNumber: true } }),
      this.office.getOrCreate(tenantId),
    ]);

    return {
      clientName: client?.displayName || client?.name || [client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'Müvekkil',
      caseFileNumber: kase?.fileNumber ?? '',
      executionFileNumber: kase?.executionFileNumber ?? '',
      intakeUrl,
      expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 10) : 'süresiz',
      officeName: office?.name ?? '',
    };
  }

  private redactedTokens(tokens: Record<string, string>): Record<string, string> {
    return { ...tokens, intakeUrl: REDACTED_INTAKE_URL };
  }

  private async notifyLinkForCreateAndDeliver(
    tenantId: string,
    userId: string,
    deliveryId: string,
    dedupeKey: string,
    clientId: string,
    caseId: string,
    intakeUrl: string,
    expiresAt: Date | null,
  ): Promise<DispatchResult> {
    try {
      const tokens = await this.buildLinkNotificationTokens(tenantId, clientId, caseId, intakeUrl, expiresAt);

      return this.dispatcher.dispatch(tenantId, userId, {
        clientId,
        caseId,
        templateCode: 'INTAKE_LINK',
        type: 'CLIENT_INFO',
        tokens,
        persistedTokens: this.redactedTokens(tokens),
        refType: 'ClientIntakeLinkDelivery',
        refId: deliveryId,
        dedupeKey,
      });
    } catch (error: any) {
      return { status: 'failed', dedupeKey, error: this.sanitizeDeliveryError(error?.message) };
    }
  }

  private sanitizeDeliveryError(message?: string): string {
    return (message || 'Intake link delivery failed').toString().replace(/https?:\/\/\S+/g, REDACTED_INTAKE_URL).slice(0, 500);
  }

  /**
   * INTAKE_LINK maili — BEST-EFFORT. Token/URL app-log'una yazılmaz; tamamen try/catch.
   * Mail (veya token okuması) başarısız olsa bile link ACTIVE kalır, throw etmez.
   */
  private async notifyLink(
    tenantId: string,
    userId: string,
    linkId: string,
    clientId: string,
    caseId: string,
    intakeUrl: string,
    expiresAt: Date | null,
  ): Promise<void> {
    try {
      const tokens = await this.buildLinkNotificationTokens(tenantId, clientId, caseId, intakeUrl, expiresAt);

      await this.dispatcher.dispatch(tenantId, userId, {
        clientId,
        caseId,
        templateCode: 'INTAKE_LINK',
        type: 'CLIENT_INFO',
        tokens,
        persistedTokens: this.redactedTokens(tokens),
        refType: 'ClientIntakeLink',
        refId: linkId,
      });
    } catch (e: any) {
      // Token/URL HATA MESAJINA KOYULMAZ (sızıntı önleme).
      this.logger.warn(`Intake link maili tetiklenemedi (link=${linkId}): ${this.sanitizeDeliveryError(e.message)}`);
    }
  }
}