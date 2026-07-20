import { Injectable, Logger, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { maskEmail } from "../../common/pii-mask.util";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { EmailProviderService } from "../notification/email-provider.service";
import { buildClientFieldDiff, PORTAL_ACCESS_FIELDS } from "../client/client-audit.util";
import type { AuditActor } from "../client/client.service";
import { generateRawResetToken, hashResetToken } from "./portal-reset-token.util";
import * as bcrypt from "bcrypt";

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  // CLIENT-P2-U01: hardcoded literal yerine tek isimli sabit (test edilebilir, config-yüzeyi genişletmez).
  private static readonly RESET_TOKEN_TTL_MS = 3600_000; // 1 saat

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    private config: ConfigService,
    private emailProvider: EmailProviderService
  ) {}

  /** user-invite.service.ts acceptUrl() ile AYNI canonical base-URL deseni. */
  private buildResetUrl(rawToken: string): string {
    const base = (this.config.get<string>("WEB_BASE_URL") || this.config.get<string>("APP_BASE_URL") || "")
      .toString()
      .replace(/\/+$/, "");
    return `${base}/portal/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  /**
   * Task 10-S (owner-locked 2026-07-02) — portal erişimi açma/kapatma mutasyon yetkisi.
   * ClientService.assertCanManageLifecycle (Task 8A) ile BİREBİR desen (reuse, yeni altyapı YOK):
   * PARTNER veya canApproveOfficeActions=true delege avukat. Staff/normal kullanıcı 403.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - PortalService.createPortalUser() → mutasyon/audit'ten ÖNCE
   * /// - PortalService.disablePortalUser() → mutasyon/audit'ten ÖNCE
   * /// </remarks>
   */
  private async assertCanManagePortalAccess(userId: string | undefined, tenantId: string): Promise<void> {
    if (!userId || !(await this.officeApproval.isApproverEligible(userId, tenantId))) {
      throw new ForbiddenException(
        "Portal erişimi yönetimi için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)"
      );
    }
  }

  /**
   * Portal kullanıcısı oluştur
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - PortalController.createPortalUser() → POST /api/portal/admin/create-user (JwtAuthGuard; büro/admin portal hesabı aç/yeniden-aktifle)
   * /// actor: YALNIZ auth context (req.user.id). body/payload'dan ASLA türetilmez.
   * /// C0: client.update (hasPortalAccess/portalUserId) ClientService DIŞI bypass → audit AYNI tx içinde.
   * /// </remarks>
   */
  async createPortalUser(clientId: string, email: string, password: string, tenantId: string, actor?: AuditActor) {
    // Müvekkil kontrolü
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

    // Task 10-S: yetkisiz aktör hiçbir yazma yapmaz (mutasyondan/audit'ten ÖNCE).
    await this.assertCanManagePortalAccess(actor?.userId, tenantId);

    // RFA-013: email collision guard — GLOBAL (login email-global çalışıyor; iki aktif kullanıcı
    // aynı email'de olursa login belirsizleşir = güvenlik kokusu). Başka AKTİF user aynı email → 409.
    const emailDup = await this.prisma.clientPortalUser.findFirst({
      where: { email, isActive: true, clientId: { not: clientId } },
    });
    if (emailDup) {
      throw new ConflictException("Bu e-posta başka bir aktif portal kullanıcısında kayıtlı");
    }

    // Şifre hash'le (reactivate'te de yeni şifre → eski şifre geçersiz olur)
    const passwordHash = await bcrypt.hash(password, 10);

    // RFA-013: clientId @unique → disable→tekrar-create eskiden 400 veriyordu (inaktif satır clientId'yi
    // tutuyor). Şimdi: aktif varsa 409; inaktif varsa AYNI id reactivate (yeni şifre + email,
    // resetToken temizle → güvenli); yoksa düz create.
    const existing = await this.prisma.clientPortalUser.findUnique({
      where: { clientId },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException("Bu müvekkil için portal hesabı zaten mevcut");
      }
      // C0 bypass fix: portalUser reactivate + client erişim-bayrağı + audit AYNI transaction.
      // before/after diff snapshot'ı da tx içinde okunur (atomik boundary, race azaltır); audit
      // yazılamazsa rollback → audit'siz erişim açma kalmaz (C0-a deseni).
      await this.prisma.$transaction(async (tx) => {
        const before = await tx.client.findUniqueOrThrow({
          where: { id: clientId },
          select: { id: true, hasPortalAccess: true, portalUserId: true },
        });
        await tx.clientPortalUser.update({
          where: { id: existing.id },
          data: { isActive: true, email, passwordHash, resetToken: null, resetTokenExp: null },
        });
        const after = await tx.client.update({
          where: { id: clientId },
          data: { hasPortalAccess: true, portalUserId: existing.id },
        });
        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "CLIENT_PORTAL_ACCESS_ENABLE",
          entityType: "CLIENT",
          entityId: clientId,
          userId: actor?.userId,
          metadata: {
            portalAction: "REACTIVATE",
            portalUserId: existing.id,
            fieldDiff: buildClientFieldDiff(before, after, PORTAL_ACCESS_FIELDS),
          },
        });
      });
      this.logger.log(`Portal kullanıcısı yeniden aktifleştirildi: ${maskEmail(email)} (Client: ${clientId})`);
      return { success: true, portalUserId: existing.id, _reactivated: true };
    }

    // C0 bypass fix: portalUser create + client erişim-bayrağı + audit AYNI transaction.
    const portalUserId = await this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { id: true, hasPortalAccess: true, portalUserId: true },
      });
      const portalUser = await tx.clientPortalUser.create({
        data: {
          clientId,
          email,
          passwordHash,
        },
      });
      const after = await tx.client.update({
        where: { id: clientId },
        data: { hasPortalAccess: true, portalUserId: portalUser.id },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "CLIENT_PORTAL_ACCESS_ENABLE",
        entityType: "CLIENT",
        entityId: clientId,
        userId: actor?.userId,
        metadata: {
          portalAction: "CREATE",
          portalUserId: portalUser.id,
          fieldDiff: buildClientFieldDiff(before, after, PORTAL_ACCESS_FIELDS),
        },
      });
      return portalUser.id;
    });

    this.logger.log(`Portal kullanıcısı oluşturuldu: ${maskEmail(email)} (Client: ${clientId})`);

    return { success: true, portalUserId };
  }


  /**
   * Portal girişi
   */
  async login(email: string, password: string) {
    const portalUser = await this.prisma.clientPortalUser.findFirst({
      where: { email, isActive: true },
      include: {
        client: {
          select: { id: true, displayName: true, tenantId: true, type: true },
        },
      },
    });

    if (!portalUser) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    const isValid = await bcrypt.compare(password, portalUser.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Geçersiz e-posta veya şifre");
    }

    // Giriş bilgilerini güncelle
    await this.prisma.clientPortalUser.update({
      where: { id: portalUser.id },
      data: {
        lastLoginAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    // JWT token oluştur
    const payload = {
      sub: portalUser.id,
      clientId: portalUser.clientId,
      tenantId: portalUser.client.tenantId,
      type: "portal",
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`Portal girişi: ${maskEmail(email)}`);

    return {
      token,
      user: {
        id: portalUser.id,
        email: portalUser.email,
        clientId: portalUser.clientId,
        clientName: portalUser.client.displayName,
      },
    };
  }

  /**
   * Müvekkilin dosyalarını getir
   */
  async getClientCases(clientId: string, tenantId: string) {
    return this.prisma.case.findMany({
      where: {
        tenantId,
        showToClient: true,
        OR: [
          { clientId },
          { caseClients: { some: { clientId } } },
        ],
      },
      select: {
        id: true,
        fileNumber: true,
        executionFileNumber: true,
        type: true,
        caseStatus: true,
        caseDate: true,
        principalAmount: true,
        workflowStage: true,
        createdAt: true,
        debtors: {
          select: {
            debtor: { select: { name: true } },
          },
        },
        collections: {
          select: { amount: true, date: true },
          orderBy: { date: "desc" },
          take: 5,
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Tek dosya detayı
   */
  async getCaseDetail(caseId: string, clientId: string, tenantId: string) {
    const caseData = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        tenantId,
        showToClient: true,
        OR: [
          { clientId },
          { caseClients: { some: { clientId } } },
        ],
      },
      include: {
        debtors: {
          include: { debtor: { select: { name: true, type: true } } },
        },
        collections: {
          orderBy: { date: "desc" },
        },
        dues: true,
        lifecycleEvents: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!caseData) {
      throw new NotFoundException("Dosya bulunamadı");
    }

    return caseData;
  }

  /**
   * Müvekkilin vekaletlerini getir
   */
  async getClientPoas(clientId: string) {
    return this.prisma.clientPowerOfAttorney.findMany({
      where: { clientId, isActive: true },
      include: {
        lawyers: {
          include: {
            lawyer: { select: { name: true, surname: true, barNumber: true } },
          },
        },
      },
      orderBy: { dateIssued: "desc" },
    });
  }

  /**
   * Şifre değiştir
   */
  async changePassword(portalUserId: string, oldPassword: string, newPassword: string) {
    const portalUser = await this.prisma.clientPortalUser.findUnique({
      where: { id: portalUserId },
    });

    if (!portalUser) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    const isValid = await bcrypt.compare(oldPassword, portalUser.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Mevcut şifre yanlış");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.clientPortalUser.update({
      where: { id: portalUserId },
      data: { passwordHash },
    });

    return { success: true };
  }

  /**
   * Şifre sıfırlama token'ı oluştur ve e-posta ile gönder
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - PortalController.forgotPassword() → POST /api/portal/forgot-password (LoginRateLimitGuard)
   * /// CLIENT-P2-U01: token DB'de yalnız SHA-256 digest olarak saklanır; ham token yalnız e-posta
   * /// linkinde. Bilinen/bilinmeyen hesap + delivery başarı/başarısızlığı AYNI generic {success:true}
   * /// döner (account enumeration + undelivered-token farkı gözlemlenemez).
   * /// </remarks>
   */
  async createResetToken(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const portalUser = await this.prisma.clientPortalUser.findFirst({
      where: { email: normalizedEmail, isActive: true },
      include: { client: { select: { tenantId: true } } },
    });

    if (!portalUser) {
      // Güvenlik için hata verme (account enumeration engeli)
      return { success: true };
    }

    const rawToken = generateRawResetToken();
    const resetToken = hashResetToken(rawToken);
    const resetTokenExp = new Date(Date.now() + PortalService.RESET_TOKEN_TTL_MS);

    await this.prisma.clientPortalUser.update({
      where: { id: portalUser.id },
      data: { resetToken, resetTokenExp },
    });

    const resetUrl = this.buildResetUrl(rawToken);
    const ttlMinutes = Math.round(PortalService.RESET_TOKEN_TTL_MS / 60_000);
    const emailResult = await this.emailProvider.send({
      to: normalizedEmail,
      subject: "Şifre sıfırlama talebi",
      text:
        `Şifrenizi sıfırlamak için: ${resetUrl}\n` +
        `Bu bağlantı ${ttlMinutes} dakika içinde geçersiz olur. Bu talebi siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.`,
      html:
        `<p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>` +
        `<p><a href="${resetUrl}">Şifremi sıfırla</a></p>` +
        `<p>Bu bağlantı ${ttlMinutes} dakika içinde geçersiz olur. Bu talebi siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.</p>`,
    });

    if (!emailResult.success) {
      // Delivery başarısız: yalnız HÂLÂ aynı digest ise conditional temizle (kullanıcı hiç
      // almadığı bir token'la kilitli kalmasın). Ham token hiçbir yere yazılmaz.
      await this.prisma.clientPortalUser.updateMany({
        where: { id: portalUser.id, resetToken },
        data: { resetToken: null, resetTokenExp: null },
      });
      await this.audit.log({
        tenantId: portalUser.client.tenantId,
        action: "PORTAL_RESET_DELIVERY_FAILED",
        entityType: "CLIENT_PORTAL_USER",
        entityId: portalUser.id,
        metadata: { errorCode: emailResult.errorCode ?? "UNKNOWN" },
      });
      this.logger.warn(`Şifre sıfırlama e-postası gönderilemedi: ${maskEmail(normalizedEmail)} (${emailResult.errorCode})`);
      return { success: true };
    }

    await this.audit.log({
      tenantId: portalUser.client.tenantId,
      action: "PORTAL_RESET_REQUEST_CREATED",
      entityType: "CLIENT_PORTAL_USER",
      entityId: portalUser.id,
    });

    this.logger.log(`Şifre sıfırlama token'ı oluşturuldu: ${maskEmail(normalizedEmail)}`);

    return { success: true };
  }

  /**
   * Şifre sıfırla (tek kullanımlık token doğrulaması + atomic conditional update)
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - PortalController.resetPassword() → POST /api/portal/reset-password (LoginRateLimitGuard)
   * /// CLIENT-P2-U01: eski read-then-write TOCTOU deseni kaldırıldı. updateMany'nin WHERE koşulu
   * /// (id+digest+expiry) tek atomic SQL UPDATE'tir — Postgres row-level lock eşzamanlı ikinci
   * /// kullanımı count=0 ile serileştirir (replay/concurrent-replay reddi buradan gelir).
   * /// </remarks>
   */
  async resetPassword(rawToken: string, newPassword: string) {
    const digest = hashResetToken(rawToken);
    const genericError = () => new BadRequestException("Geçersiz veya süresi dolmuş token");

    const outcome = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.clientPortalUser.findFirst({
        where: { resetToken: digest, resetTokenExp: { gt: new Date() }, isActive: true },
        select: { id: true, client: { select: { tenantId: true } } },
      });

      if (!candidate) {
        return { status: "NOT_FOUND" as const };
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      const updated = await tx.clientPortalUser.updateMany({
        where: { id: candidate.id, resetToken: digest, resetTokenExp: { gt: new Date() } },
        data: { passwordHash, resetToken: null, resetTokenExp: null },
      });

      if (updated.count !== 1) {
        return { status: "RACE_LOST" as const, candidate };
      }

      return { status: "SUCCESS" as const, candidate };
    });

    if (outcome.status === "NOT_FOUND") {
      // Tenant bilinmiyor (digest hiçbir satıra eşleşmedi) → user-invite.service.ts accept()
      // NOT_FOUND deseniyle AYNI: sahte tenant'a AuditLog YAZILMAZ, yalnız best-effort log.
      this.logger.warn("Geçersiz/süresi dolmuş portal reset token denemesi");
      throw genericError();
    }

    if (outcome.status === "RACE_LOST") {
      await this.audit.log({
        tenantId: outcome.candidate.client.tenantId,
        action: "PORTAL_PASSWORD_RESET_REJECTED",
        entityType: "CLIENT_PORTAL_USER",
        entityId: outcome.candidate.id,
        metadata: { reasonCode: "CONCURRENT_OR_EXPIRED" },
      });
      throw genericError();
    }

    await this.audit.log({
      tenantId: outcome.candidate.client.tenantId,
      action: "PORTAL_PASSWORD_RESET_SUCCEEDED",
      entityType: "CLIENT_PORTAL_USER",
      entityId: outcome.candidate.id,
    });

    return { success: true };
  }

  /**
   * Portal kullanıcısını devre dışı bırak
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * /// - PortalController.disablePortalUser() → POST /api/portal/admin/disable-user (JwtAuthGuard; büro/admin portal erişimini kapat)
   * /// actor: YALNIZ auth context (req.user.id). body/payload'dan ASLA türetilmez.
   * /// C0: client.update (hasPortalAccess=false) ClientService DIŞI bypass → audit AYNI tx içinde.
   * /// </remarks>
   */
  async disablePortalUser(clientId: string, tenantId: string, actor?: AuditActor) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

    // Task 10-S: yetkisiz aktör hiçbir yazma yapmaz (mutasyondan/audit'ten ÖNCE).
    await this.assertCanManagePortalAccess(actor?.userId, tenantId);

    // C0 bypass fix: portal kullanıcıları pasifle + client erişim-bayrağı kapat + audit AYNI transaction.
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.client.findUniqueOrThrow({
        where: { id: clientId },
        select: { id: true, hasPortalAccess: true, portalUserId: true },
      });
      await tx.clientPortalUser.updateMany({
        where: { clientId },
        data: { isActive: false },
      });
      const after = await tx.client.update({
        where: { id: clientId },
        data: { hasPortalAccess: false },
      });
      await this.audit.logInTransaction(tx, {
        tenantId,
        action: "CLIENT_PORTAL_ACCESS_DISABLE",
        entityType: "CLIENT",
        entityId: clientId,
        userId: actor?.userId,
        metadata: {
          portalAction: "DISABLE",
          fieldDiff: buildClientFieldDiff(before, after, PORTAL_ACCESS_FIELDS),
        },
      });
    });

    return { success: true };
  }

  // ==================== BİLDİRİMLER ====================

  /**
   * Müvekkilin bildirimlerini getir
   */
  async getNotifications(clientId: string, limit: number = 20) {
    return this.prisma.portalNotification.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Okunmamış bildirim sayısı
   */
  async getUnreadCount(clientId: string) {
    const count = await this.prisma.portalNotification.count({
      where: { clientId, isRead: false },
    });
    return { count };
  }

  /**
   * Bildirimi okundu olarak işaretle
   */
  async markAsRead(notificationId: string, clientId: string) {
    const notification = await this.prisma.portalNotification.findFirst({
      where: { id: notificationId, clientId },
    });

    if (!notification) {
      throw new NotFoundException("Bildirim bulunamadı");
    }

    await this.prisma.portalNotification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Tüm bildirimleri okundu olarak işaretle
   */
  async markAllAsRead(clientId: string) {
    await this.prisma.portalNotification.updateMany({
      where: { clientId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { success: true };
  }

  /**
   * Portal bildirimi oluştur (internal - diğer servislerden çağrılır)
   */
  async createNotification(data: {
    clientId: string;
    caseId?: string;
    type: string;
    title: string;
    message: string;
    linkUrl?: string;
  }) {
    return this.prisma.portalNotification.create({
      data: {
        clientId: data.clientId,
        caseId: data.caseId,
        type: data.type,
        title: data.title,
        message: data.message,
        linkUrl: data.linkUrl,
      },
    });
  }

  // ==================== BELGELER ====================

  /**
   * Müvekkilin belgelerini getir
   */
  async getDocuments(clientId: string, tenantId: string) {
    return this.prisma.portalDocument.findMany({
      where: { clientId, tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Belge yükle
   */
  async uploadDocument(data: {
    clientId: string;
    tenantId: string;
    caseId?: string;
    type: string;
    title: string;
    description?: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
  }) {
    const doc = await this.prisma.portalDocument.create({
      data: {
        clientId: data.clientId,
        tenantId: data.tenantId,
        caseId: data.caseId,
        type: data.type,
        title: data.title,
        description: data.description,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
      },
    });

    this.logger.log(`Portal belgesi yüklendi: ${data.fileName} (Client: ${data.clientId})`);
    return doc;
  }

  /**
   * Belge sil
   */
  async deleteDocument(documentId: string, clientId: string) {
    const doc = await this.prisma.portalDocument.findFirst({
      where: { id: documentId, clientId },
    });

    if (!doc) {
      throw new NotFoundException("Belge bulunamadı");
    }

    // Sadece PENDING durumundaki belgeler silinebilir
    if (doc.status !== "PENDING") {
      throw new BadRequestException("Onaylanmış veya reddedilmiş belgeler silinemez");
    }

    await this.prisma.portalDocument.delete({
      where: { id: documentId },
    });

    return { success: true, filePath: doc.filePath };
  }

  /**
   * Belge detayı getir
   */
  async getDocument(documentId: string, clientId: string) {
    const doc = await this.prisma.portalDocument.findFirst({
      where: { id: documentId, clientId },
    });

    if (!doc) {
      throw new NotFoundException("Belge bulunamadı");
    }

    return doc;
  }

  // ==================== ADMIN - BELGE YÖNETİMİ ====================

  /**
   * Bekleyen belgeleri getir (büro için)
   */
  async getPendingDocuments(tenantId: string) {
    return this.prisma.portalDocument.findMany({
      where: { tenantId, status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Belgeyi onayla/reddet (büro için)
   */
  async reviewDocument(documentId: string, tenantId: string, userId: string, approved: boolean, note?: string) {
    const doc = await this.prisma.portalDocument.findFirst({
      where: { id: documentId, tenantId },
    });

    if (!doc) {
      throw new NotFoundException("Belge bulunamadı");
    }

    await this.prisma.portalDocument.update({
      where: { id: documentId },
      data: {
        status: approved ? "APPROVED" : "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: userId,
        reviewNote: note,
      },
    });

    // Müvekkile bildirim gönder
    await this.createNotification({
      clientId: doc.clientId,
      type: "BELGE",
      title: approved ? "Belgeniz Onaylandı" : "Belgeniz Reddedildi",
      message: approved 
        ? `"${doc.title}" başlıklı belgeniz onaylandı.`
        : `"${doc.title}" başlıklı belgeniz reddedildi. ${note ? `Sebep: ${note}` : ""}`,
    });

    return { success: true };
  }

  // ==================== MESAJLAŞMA ====================

  /**
   * Mesajları getir (müvekkil için)
   */
  async getMessages(clientId: string, tenantId: string, limit: number = 50) {
    return this.prisma.portalMessage.findMany({
      where: { clientId, tenantId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }

  /**
   * Mesaj gönder (müvekkil)
   */
  async sendMessageFromClient(clientId: string, tenantId: string, content: string, senderName: string, caseId?: string) {
    const message = await this.prisma.portalMessage.create({
      data: {
        clientId,
        tenantId,
        caseId,
        content,
        senderType: "CLIENT",
        senderId: clientId,
        senderName,
      },
    });

    this.logger.log(`Portal mesajı gönderildi (müvekkil): ${clientId}`);
    return message;
  }

  /**
   * Mesaj gönder (büro)
   */
  async sendMessageFromOffice(clientId: string, tenantId: string, content: string, userId: string, userName: string, caseId?: string) {
    // Müvekkil kontrolü
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

    const message = await this.prisma.portalMessage.create({
      data: {
        clientId,
        tenantId,
        caseId,
        content,
        senderType: "OFFICE",
        senderId: userId,
        senderName: userName,
      },
    });

    // Müvekkile bildirim gönder
    await this.createNotification({
      clientId,
      caseId,
      type: "MESAJ",
      title: "Yeni Mesaj",
      message: `${userName} size bir mesaj gönderdi.`,
      linkUrl: "/portal/messages",
    });

    this.logger.log(`Portal mesajı gönderildi (büro): ${clientId}`);
    return message;
  }

  /**
   * Okunmamış mesaj sayısı (müvekkil için)
   */
  async getUnreadMessageCount(clientId: string, tenantId: string) {
    const count = await this.prisma.portalMessage.count({
      where: { clientId, tenantId, senderType: "OFFICE", isRead: false },
    });
    return { count };
  }

  /**
   * Mesajları okundu işaretle (müvekkil için)
   */
  async markMessagesAsRead(clientId: string, tenantId: string) {
    await this.prisma.portalMessage.updateMany({
      where: { clientId, tenantId, senderType: "OFFICE", isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  /**
   * Müvekkil listesi (mesajlaşma için - büro)
   */
  async getClientsWithMessages(tenantId: string) {
    // Portal erişimi olan müvekkilleri getir
    const clients = await this.prisma.client.findMany({
      where: { tenantId, hasPortalAccess: true },
      select: {
        id: true,
        displayName: true,
        type: true,
      },
      orderBy: { displayName: "asc" },
    });

    // Her müvekkil için okunmamış mesaj sayısını hesapla
    const result = await Promise.all(
      clients.map(async (client) => {
        const unreadCount = await this.prisma.portalMessage.count({
          where: { clientId: client.id, tenantId, senderType: "CLIENT", isRead: false },
        });
        const lastMessage = await this.prisma.portalMessage.findFirst({
          where: { clientId: client.id, tenantId },
          orderBy: { createdAt: "desc" },
          select: { content: true, createdAt: true, senderType: true },
        });
        return { ...client, unreadCount, lastMessage };
      })
    );

    return result;
  }

  /**
   * Müvekkil mesajlarını getir (büro için)
   */
  async getClientMessages(clientId: string, tenantId: string, limit: number = 50) {
    // Müvekkil kontrolü
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!client) {
      throw new NotFoundException("Müvekkil bulunamadı");
    }

    // Mesajları getir
    const messages = await this.prisma.portalMessage.findMany({
      where: { clientId, tenantId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });

    // Müvekkil mesajlarını okundu işaretle
    await this.prisma.portalMessage.updateMany({
      where: { clientId, tenantId, senderType: "CLIENT", isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { client, messages };
  }
}
