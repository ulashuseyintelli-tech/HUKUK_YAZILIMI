import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ClientApprovalStatus,
  ClientApprovalEventType,
  ClientApprovalDecision,
  ClientApprovalSubjectType,
  Prisma,
} from '@prisma/client';
import { NotificationDispatcherService } from '@/modules/client-notification/notification-dispatcher.service';
import { OfficeService } from '@/modules/office/office.service';
import {
  CreateClientApprovalRequestDto,
  DecisionClientApprovalDto,
} from './dto/client-approval.dto';

const TERMINAL: ClientApprovalStatus[] = [
  ClientApprovalStatus.APPROVED,
  ClientApprovalStatus.REJECTED,
  ClientApprovalStatus.EXPIRED,
  ClientApprovalStatus.CANCELLED,
];

/**
 * Müvekkil Onay Defteri servisi (PR-2).
 *
 * DEFTER, karar motoru DEĞİL: CPE (policy-engine) hâlâ tek karar otoritesi.
 * Bu servis CPE'yi çağırmaz, CPE kararını veya ExpenseRequest state'ini DEĞİŞTİRMEZ.
 *
 * İLKELER:
 * - subjectId POLİMORFİK (FK yok). EXPENSE_REQUEST tipinde SOFT-validate edilir.
 * - Terminal kararlar (APPROVED/REJECTED/EXPIRED/CANCELLED) değişmez; düzeltme = yeni request.
 * - Her geçiş tek transaction'da: request update + ClientApprovalEvent (append-only) create.
 * - Multitenant: tüm okuma/yazma tenantId ile filtrelenir; FK hedefleri aynı tenant doğrulanır.
 * - update/delete + PATCH/PUT/DELETE route SUNULMAZ (immutability).
 */
@Injectable()
export class ClientApprovalService {
  private readonly logger = new Logger(ClientApprovalService.name);

  constructor(
    private prisma: PrismaService,
    private dispatcher: NotificationDispatcherService,
    private office: OfficeService,
  ) {}

  /**
   * Onay talebi oluştur (DRAFT) + CREATED event.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.create() → POST /client-approvals/case/:caseId
   * </remarks>
   */
  async create(tenantId: string, caseId: string, userId: string, dto: CreateClientApprovalRequestDto) {
    const caseItem = await this.prisma.case.findFirst({
      where: { id: caseId, tenantId },
      select: { id: true },
    });
    if (!caseItem) throw new NotFoundException('Takip bulunamadı');

    const client = await this.prisma.client.findFirst({
      where: { id: dto.clientId, tenantId },
      select: { id: true },
    });
    if (!client) throw new NotFoundException('Müvekkil bulunamadı');

    // SOFT-validate (M2-1): yalnız EXPENSE_REQUEST tipinde; bulunamazsa REDDETMEZ (gevşek bağ).
    let subjectLabel = dto.subjectLabel ?? null;
    if (dto.subjectType === ClientApprovalSubjectType.EXPENSE_REQUEST && dto.subjectId) {
      const er = await this.prisma.expenseRequest.findFirst({
        where: { id: dto.subjectId, tenantId },
        select: { id: true, totalAmount: true },
      });
      if (er && !subjectLabel) {
        subjectLabel = `Masraf talebi #${er.id.slice(0, 8)} (${er.totalAmount} TRY)`;
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.clientApprovalRequest.create({
        data: {
          tenantId,
          caseId,
          clientId: dto.clientId,
          subjectType: dto.subjectType,
          subjectId: dto.subjectId ?? null,
          subjectLabel,
          title: dto.title ?? null,
          description: dto.description ?? null,
          channel: dto.channel ?? undefined,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          status: ClientApprovalStatus.DRAFT,
          requestedById: userId,
        },
      });
      await this.writeEvent(tx, request.id, {
        eventType: ClientApprovalEventType.CREATED,
        fromStatus: null,
        toStatus: ClientApprovalStatus.DRAFT,
        byUserId: userId,
      });
      return request;
    });
  }

  /**
   * Müvekkile gönderildi olarak işaretle (DRAFT → SENT). MAIL GÖNDERMEZ — yalnız state + event.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.send() → POST /client-approvals/:id/send
   * </remarks>
   */
  async send(tenantId: string, id: string, userId: string, note?: string) {
    const updated = await this.transition(tenantId, id, userId, {
      allowedFrom: [ClientApprovalStatus.DRAFT],
      to: ClientApprovalStatus.SENT,
      eventType: ClientApprovalEventType.SENT,
      extra: { sentAt: new Date() },
      note,
    });
    // State commit edildi → mail BEST-EFFORT (başarısızlık state'i değiştirmez)
    await this.notify(tenantId, userId, updated, 'APPROVAL_REQUEST');
    return updated;
  }

  /**
   * Müvekkil kararı (SENT → APPROVED/REJECTED).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.decision() → POST /client-approvals/:id/decision
   * </remarks>
   */
  async decision(tenantId: string, id: string, userId: string, dto: DecisionClientApprovalDto) {
    const approve = dto.decision === ClientApprovalDecision.APPROVE;
    const updated = await this.transition(tenantId, id, userId, {
      allowedFrom: [ClientApprovalStatus.SENT],
      to: approve ? ClientApprovalStatus.APPROVED : ClientApprovalStatus.REJECTED,
      eventType: approve ? ClientApprovalEventType.APPROVED : ClientApprovalEventType.REJECTED,
      extra: { decidedAt: new Date(), decision: dto.decision, decisionNote: dto.note ?? null },
      note: dto.note,
    });
    // State commit edildi → onay sonucu maili BEST-EFFORT
    await this.notify(tenantId, userId, updated, 'APPROVAL_RESULT');
    return updated;
  }

  /**
   * İptal et (DRAFT|SENT → CANCELLED). Kayıt silinmez.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.cancel() → POST /client-approvals/:id/cancel
   * </remarks>
   */
  async cancel(tenantId: string, id: string, userId: string, note?: string) {
    return this.transition(tenantId, id, userId, {
      allowedFrom: [ClientApprovalStatus.DRAFT, ClientApprovalStatus.SENT],
      to: ClientApprovalStatus.CANCELLED,
      eventType: ClientApprovalEventType.CANCELLED,
      note,
    });
  }

  /**
   * Süresi doldu (SENT → EXPIRED) — MANUEL tetik (cron yok, M2-2).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.expire() → POST /client-approvals/:id/expire
   * </remarks>
   */
  async expire(tenantId: string, id: string, userId: string, note?: string) {
    return this.transition(tenantId, id, userId, {
      allowedFrom: [ClientApprovalStatus.SENT],
      to: ClientApprovalStatus.EXPIRED,
      eventType: ClientApprovalEventType.EXPIRED,
      note,
    });
  }

  /**
   * Dosya bazlı liste (opsiyonel status filtresi; default: tümü).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.listByCase() → GET /client-approvals/case/:caseId?status=
   * </remarks>
   */
  async listByCase(tenantId: string, caseId: string, status?: ClientApprovalStatus) {
    return this.prisma.clientApprovalRequest.findMany({
      where: { tenantId, caseId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Tek kayıt + event geçmişi (append-only defter).
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - ClientApprovalController.findOne() → GET /client-approvals/:id
   * </remarks>
   */
  async findOne(tenantId: string, id: string) {
    const record = await this.prisma.clientApprovalRequest.findFirst({
      where: { id, tenantId },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!record) throw new NotFoundException('Onay talebi bulunamadı');
    return record;
  }

  // ==================== mail tetiği (Faz 3.4) ====================

  /**
   * Onay maili — BEST-EFFORT. Token derleme + dispatch tamamen try/catch içinde:
   * mail (veya token okuması) başarısız olsa bile commit'li state DEĞİŞMEZ, throw etmez.
   * templateCode: APPROVAL_REQUEST (send) | APPROVAL_RESULT (decision).
   */
  private async notify(
    tenantId: string,
    userId: string,
    req: { id: string; clientId: string; caseId: string; subjectLabel: string | null; decision: ClientApprovalDecision | null },
    templateCode: 'APPROVAL_REQUEST' | 'APPROVAL_RESULT',
  ): Promise<void> {
    try {
      const [client, kase, office] = await Promise.all([
        this.prisma.client.findFirst({
          where: { id: req.clientId, tenantId },
          select: { displayName: true, name: true, firstName: true, lastName: true },
        }),
        this.prisma.case.findFirst({
          where: { id: req.caseId, tenantId },
          select: { fileNumber: true, executionFileNumber: true },
        }),
        this.office.getOrCreate(tenantId),
      ]);

      const tokens: Record<string, string> = {
        clientName: client?.displayName || client?.name || [client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'Müvekkil',
        caseFileNumber: kase?.fileNumber ?? '',
        executionFileNumber: kase?.executionFileNumber ?? '',
        subjectLabel: req.subjectLabel ?? '',
        officeName: office?.name ?? '',
      };
      if (templateCode === 'APPROVAL_RESULT') {
        tokens.decision = req.decision === ClientApprovalDecision.APPROVE ? 'Onaylandı' : 'Reddedildi';
      }

      await this.dispatcher.dispatch(tenantId, userId, {
        clientId: req.clientId,
        caseId: req.caseId,
        templateCode,
        type: 'CLIENT_APPROVAL',
        tokens,
        refType: 'ClientApprovalRequest',
        refId: req.id,
      });
    } catch (e: any) {
      this.logger.warn(`Onay maili tetiklenemedi (${templateCode}, ${req.id}): ${e.message}`);
    }
  }

  // ==================== iç yardımcılar ====================

  /**
   * Ortak geçiş: tenant-sahipli kaydı bul, terminal/izin kontrolü, atomik update + event.
   */
  private async transition(
    tenantId: string,
    id: string,
    userId: string,
    opts: {
      allowedFrom: ClientApprovalStatus[];
      to: ClientApprovalStatus;
      eventType: ClientApprovalEventType;
      extra?: Prisma.ClientApprovalRequestUpdateInput;
      note?: string;
    },
  ) {
    const existing = await this.prisma.clientApprovalRequest.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundException('Onay talebi bulunamadı');

    if (TERMINAL.includes(existing.status)) {
      throw new BadRequestException(
        `Terminal kayıt değiştirilemez (durum: ${existing.status}). Düzeltme için yeni onay talebi açın.`,
      );
    }
    if (!opts.allowedFrom.includes(existing.status)) {
      throw new BadRequestException(
        `Geçersiz geçiş: ${existing.status} → ${opts.to}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.clientApprovalRequest.update({
        where: { id },
        data: { status: opts.to, ...(opts.extra ?? {}) },
      });
      await this.writeEvent(tx, id, {
        eventType: opts.eventType,
        fromStatus: existing.status,
        toStatus: opts.to,
        byUserId: userId,
        note: opts.note,
      });
      return updated;
    });
  }

  private async writeEvent(
    tx: Prisma.TransactionClient,
    approvalRequestId: string,
    data: {
      eventType: ClientApprovalEventType;
      fromStatus: ClientApprovalStatus | null;
      toStatus: ClientApprovalStatus;
      byUserId?: string | null;
      note?: string | null;
    },
  ) {
    return tx.clientApprovalEvent.create({
      data: {
        approvalRequestId,
        eventType: data.eventType,
        fromStatus: data.fromStatus,
        toStatus: data.toStatus,
        byUserId: data.byUserId ?? null,
        note: data.note ?? null,
      },
    });
  }
}
