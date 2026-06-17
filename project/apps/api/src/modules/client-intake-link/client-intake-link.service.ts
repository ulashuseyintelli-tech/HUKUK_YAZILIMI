import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ClientIntakeLinkStatus } from '@prisma/client';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import { CreateClientIntakeLinkDto } from './dto/client-intake-link.dto';

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
    const caseItem = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');

    const client = await this.prisma.client.findFirst({ where: { id: dto.clientId, tenantId }, select: { id: true } });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    if (dto.expiresAt && new Date(dto.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('expiresAt gelecekte olmalı');
    }

    // Ham token + hash (ham token DB'de YOK)
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const link = await this.prisma.clientIntakeLink.create({
      data: {
        tenantId,
        caseId,
        clientId: dto.clientId,
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

    // best-effort mail (state'i bozmaz)
    await this.notifyLink(tenantId, userId, link.id, dto.clientId, caseId, intakeUrl, link.expiresAt);

    // rawToken + intakeUrl YALNIZ burada (tek sefer) döner; sonra erişilemez.
    return { link, rawToken, intakeUrl };
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

  // ==================== iç yardımcılar ====================

  private buildUrl(rawToken: string): string {
    const base = (process.env.PUBLIC_INTAKE_BASE_URL || '').replace(/\/+$/, '');
    return `${base}/intake/${rawToken}`;
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
      const [client, kase, office] = await Promise.all([
        this.prisma.client.findFirst({ where: { id: clientId, tenantId }, select: { displayName: true, name: true, firstName: true, lastName: true } }),
        this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { fileNumber: true, executionFileNumber: true } }),
        this.office.getOrCreate(tenantId),
      ]);

      const tokens: Record<string, string> = {
        clientName: client?.displayName || client?.name || [client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'Müvekkil',
        caseFileNumber: kase?.fileNumber ?? '',
        executionFileNumber: kase?.executionFileNumber ?? '',
        intakeUrl,
        expiresAt: expiresAt ? expiresAt.toISOString().slice(0, 10) : 'süresiz',
        officeName: office?.name ?? '',
      };

      await this.dispatcher.dispatch(tenantId, userId, {
        clientId,
        caseId,
        templateCode: 'INTAKE_LINK',
        type: 'CLIENT_INFO',
        tokens,
        refType: 'ClientIntakeLink',
        refId: linkId,
      });
    } catch (e: any) {
      // Token/URL HATA MESAJINA KOYULMAZ (sızıntı önleme).
      this.logger.warn(`Intake link maili tetiklenemedi (link=${linkId}): ${e.message}`);
    }
  }
}
