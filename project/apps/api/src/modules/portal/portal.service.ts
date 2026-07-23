import { Injectable, Logger, UnauthorizedException, BadRequestException, ForbiddenException, NotFoundException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { maskEmail } from "../../common/pii-mask.util";
import { AuditService } from "../audit/audit.service";
import { OfficeApprovalService } from "../office-approval/office-approval.service";
import { EmailProviderService } from "../notification/email-provider.service";
import { buildClientFieldDiff, PORTAL_ACCESS_FIELDS } from "../client/client-audit.util";
import type { AuditActor } from "../client/client.service";
import { generateRawInviteToken, hashInviteToken } from "../auth/invite/user-invite-token.util";
import * as bcrypt from "bcrypt";

/**
 * CLIENT-P2-U03-I01 + CLIENT-P2-U03-TRACK-A-I01: getCaseDetail() client-facing response
 * contract (POL-D §21/BP-06 §23; I06 ratified transparency policy §33.5). Yalnız bu select'in
 * kapsadığı alanlar client'a döner; CaseDebtor.id/debtorLawyerId, dahiliNot, staff/personel
 * referansları, otomasyon/OCR/risk alanları, lifecycleEvents ve description'lar KASITLI olarak
 * DIŞARIDA — bu sabit yalnız getCaseDetail() tarafından kullanılır, başka portal endpoint'ine
 * yayılmaz. `muvekkilNotu` `dahiliNot`'tan yapısal olarak bağımsız, ayrı bir alandır (I06
 * invariant) — birleştirilmez, aynı semantikte kullanılmaz.
 */
const CASE_DETAIL_SELECT = Prisma.validator<Prisma.CaseSelect>()({
  id: true,
  fileNumber: true,
  executionFileNumber: true,
  type: true,
  caseStatus: true,
  workflowStage: true,
  caseDate: true,
  principalAmount: true,
  muvekkilNotu: true,
  debtors: {
    select: {
      role: true,
      debtorLawyerName: true,
      debtorLawyerBarNo: true,
      debtor: { select: { name: true, type: true } },
    },
  },
  collections: {
    select: { id: true, date: true, type: true, amount: true },
    orderBy: { date: "desc" },
  },
  dues: {
    select: { id: true, type: true, amount: true, dueDate: true, currency: true },
  },
});

/**
 * CLIENT-P2-U03-I02: portal document client-facing response contract (POL-D §21/BP-06 §23).
 * getDocuments() ve uploadDocument() ORTAK kullanır. filePath (internal storage location),
 * reviewedBy/reviewedAt/reviewNote (internal review workflow), clientId/tenantId (authorization
 * context) ve updatedAt KASITLI olarak DIŞARIDA — getDocument()/deleteDocument() (internal
 * download/delete helper) ve admin document metodları bu sabiti kullanmaz, kendi raw doc
 * erişimlerini korur.
 */
const PORTAL_DOCUMENT_CLIENT_SELECT = Prisma.validator<Prisma.PortalDocumentSelect>()({
  id: true,
  type: true,
  title: true,
  description: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  status: true,
  createdAt: true,
});

/**
 * CLIENT-P2-U03-I03: portal message client-facing response contract (POL-D §21/BP-06 §23).
 * getMessages() ve sendMessageFromClient() ORTAK kullanır. senderId (internal technical actor
 * identifier — OFFICE mesajlarında staff User.id, CLIENT mesajlarında clientId), clientId/
 * tenantId (authorization context) ve readAt KASITLI olarak DIŞARIDA — sendMessageFromOffice()/
 * getClientMessages()/getClientsWithMessages()/getUnreadMessageCount()/markMessagesAsRead()
 * (staff-facing) bu sabiti kullanmaz, kendi raw erişimlerini korur.
 */
const PORTAL_MESSAGE_CLIENT_SELECT = Prisma.validator<Prisma.PortalMessageSelect>()({
  id: true,
  content: true,
  senderType: true,
  senderName: true,
  isRead: true,
  createdAt: true,
});

/**
 * CLIENT-P2-U03-I04: portal PoA client-facing response contract (POL-D §21/BP-06 §23).
 * getClientPoas() KULLANIR. Alanlar gerçek consumer'a (apps/web/.../portal/poas/page.tsx)
 * göre doğrulanmıştır — brief'in taslak varsayımından KASITLI olarak sapar: `isActive`
 * (şemada var ama sayfa hiç kullanmıyor, WHERE zaten isActive:true dayattığından response'ta
 * hep sabit true olur) ve `scope` (şemanın kendi yorumu: "@deprecated - scopeDescription
 * kullan") select'e DAHIL EDİLMEMİŞTİR; `status`/`isLimited`/`journalNo`/`notaryName`/
 * `notaryCity` ise brief'in taslağında yoktu ama sayfa bunlar OLMADAN render edilemez.
 * `clientId`, `filePath`, `fileSize`, `mimeType`, `scopeType`, `scopeDescription`,
 * `createdAt`, `updatedAt`, deprecated `poaDate` KASITLI olarak DIŞARIDA. Nested
 * `lawyers[].lawyer.barNumber` sayfa tarafından render edilmiyor ama mevcut kodda zaten
 * curated şekilde seçiliydi (I03'teki isRead emsaliyle aynı gerekçeyle korunmuştur).
 * poa.service.ts (staff/admin) bu sabiti kullanmaz.
 */
const PORTAL_POA_CLIENT_SELECT = Prisma.validator<Prisma.ClientPowerOfAttorneySelect>()({
  id: true,
  notaryName: true,
  notaryCity: true,
  journalNo: true,
  poaNumber: true,
  dateIssued: true,
  isLimited: true,
  validUntil: true,
  status: true,
  canCollect: true,
  canWaive: true,
  canSettle: true,
  canRelease: true,
  lawyers: {
    select: {
      lawyer: { select: { name: true, surname: true, barNumber: true } },
    },
  },
});

/**
 * CLIENT-P2-U03-I05: portal notification client-facing response contract (POL-D §21/BP-06 §23).
 * getNotifications() KULLANIR. Alanlar hem şemaya hem gerçek consumer'a (apps/web/.../
 * portal/layout.tsx'in kendi `interface Notification`'ı) göre doğrulanmıştır — bu birimde
 * brief'in taslağı gerçek koda birebir uyuyor, sapma YOK. `clientId`/`caseId` (authorization
 * context) ve `readAt` KASITLI olarak DIŞARIDA. `linkUrl` consumer tarafında yalnız Next.js
 * client-side `router.push()` ile tüketilir; producer tarafında (`createNotification()`)
 * TEK çağrı yeri (`sendMessageFromOffice()`) bu alanı set eder ve değeri her zaman hardcoded
 * literal `"/portal/messages"`dir — kullanıcı girdisinden türetilmez, güvenli. getUnreadCount()/
 * markAsRead()/markAllAsRead()/createNotification() bu sabiti kullanmaz, kendi raw erişimlerini
 * korur.
 */
const PORTAL_NOTIFICATION_CLIENT_SELECT = Prisma.validator<Prisma.PortalNotificationSelect>()({
  id: true,
  type: true,
  title: true,
  message: true,
  linkUrl: true,
  isRead: true,
  createdAt: true,
});

@Injectable()
export class PortalService {
  private readonly logger = new Logger(PortalService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
    private officeApproval: OfficeApprovalService,
    private config: ConfigService,
    private emailProvider: EmailProviderService
  ) {}

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
        // CLIENT-P2-U02: reaktivasyon öncesi (disable-öncesi) JWT'ler yeniden canlanmasın —
        // aynı update içinde tokenVersion artışı.
        await tx.clientPortalUser.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            email,
            passwordHash,
            resetToken: null,
            resetTokenExp: null,
            tokenVersion: { increment: 1 },
          },
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
      tokenVersion: portalUser.tokenVersion,
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
   *
   * CLIENT-P2-U03-I01 (POL-D §21/BP-06 §23): raw `include` yerine explicit `select`
   * (CASE_DETAIL_SELECT) — internal-only alanlar (dahiliNot, staff/personel referansları,
   * otomasyon/OCR/risk durumu) ve raw lifecycleEvents (internal audit trail) response'a
   * hiç girmez; description alanları (collection/due) mixed-purpose riskiyle dışarıda.
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
      select: CASE_DETAIL_SELECT,
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
      orderBy: { dateIssued: "desc" },
      select: PORTAL_POA_CLIENT_SELECT,
    });
  }

  /**
   * Şifre değiştir
   */
  async changePassword(portalUserId: string, oldPassword: string, newPassword: string) {
    const portalUser = await this.prisma.clientPortalUser.findUnique({
      where: { id: portalUserId },
      include: { client: { select: { tenantId: true } } },
    });

    if (!portalUser) {
      throw new NotFoundException("Kullanıcı bulunamadı");
    }

    const isValid = await bcrypt.compare(oldPassword, portalUser.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Mevcut şifre yanlış");
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // CLIENT-P2-U02: tokenVersion artışı AYNI atomic write içinde — başarılı şifre
    // değişimi öncesinde verilmiş tüm portal JWT'lerini geçersiz kılar.
    await this.prisma.clientPortalUser.update({
      where: { id: portalUserId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });

    await this.audit.log({
      tenantId: portalUser.client.tenantId,
      action: "PORTAL_PASSWORD_CHANGED",
      entityType: "CLIENT_PORTAL_USER",
      entityId: portalUserId,
    });

    return { success: true };
  }

  /**
   * Şifre sıfırlama token'ı oluştur + e-posta gönder
   *
   * CLIENT-P2-CREDENTIAL-RECOVERY-P01: ham token yalnız e-postadaki URL'de görünür;
   * DB'de yalnız sha256 hash saklanır (user-invite-token.util.ts deseniyle aynı).
   * Kullanıcı bulunamasa da AYNI {success:true} döner (enumeration-safe) — e-posta
   * gönderim sonucu bu dış cevabı ASLA değiştirmez.
   */
  async createResetToken(email: string) {
    const portalUser = await this.prisma.clientPortalUser.findFirst({
      where: { email, isActive: true },
    });

    if (!portalUser) {
      // Güvenlik için hata verme (enumeration-safe)
      return { success: true };
    }

    const rawToken = generateRawInviteToken();
    const resetToken = hashInviteToken(rawToken);
    const resetTokenExp = new Date(Date.now() + 3600000); // 1 saat

    await this.prisma.clientPortalUser.update({
      where: { id: portalUser.id },
      data: { resetToken, resetTokenExp },
    });

    await this.sendResetEmail(email, rawToken);

    this.logger.log(`Şifre sıfırlama token'ı oluşturuldu: ${maskEmail(email)}`);

    return { success: true };
  }

  private resetPasswordUrl(rawToken: string): string {
    const base = (this.config.get("WEB_BASE_URL") || this.config.get("APP_BASE_URL") || "")
      .toString()
      .replace(/\/+$/, "");
    return `${base}/portal/reset-password?token=${encodeURIComponent(rawToken)}`;
  }

  private async sendResetEmail(email: string, rawToken: string): Promise<void> {
    const url = this.resetPasswordUrl(rawToken);
    try {
      const result = await this.emailProvider.send({
        to: email,
        subject: "Şifre sıfırlama talebiniz",
        text: `Şifrenizi sıfırlamak için: ${url}\nBu bağlantı 1 saat geçerlidir ve tek kullanımlıktır.`,
        html:
          `<p>Şifrenizi sıfırlamak için aşağıdaki bağlantıya tıklayın:</p>` +
          `<p><a href="${url}">Şifremi sıfırla</a></p>` +
          `<p>Bu bağlantı 1 saat geçerlidir ve tek kullanımlıktır.</p>`,
      });
      // Token/URL log'a YAZILMAZ — yalnız maskeli e-posta + errorCode (teşhis için yeterli).
      if (!result.success) {
        this.logger.warn(`Şifre sıfırlama e-postası gönderilemedi: ${maskEmail(email)} (${result.errorCode})`);
      }
    } catch (err: any) {
      this.logger.warn(`Şifre sıfırlama e-postası gönderilirken hata: ${maskEmail(email)} (${err?.message || "unknown"})`);
    }
  }

  /**
   * Şifre sıfırla
   *
   * CLIENT-P2-CREDENTIAL-RECOVERY-P01: token tüketimi tek bir koşullu `updateMany` ile
   * atomik yapılır (findFirst+update AYRI adımlar DEĞİL) — aynı token'la eşzamanlı iki
   * istek gelirse WHERE koşulu (resetToken=hash) yalnız BİRİNİN update'i tarafından
   * karşılanabilir; ilk update resetToken'ı null'a çektiği an ikinci update'in WHERE'i
   * artık hiçbir satırla eşleşmez (0 satır → ret). user-invite.service.ts'teki
   * race-safe `updateMany(...userId:null)` deseniyle aynı ilke.
   */
  async resetPassword(token: string, newPassword: string) {
    const tokenHash = hashInviteToken(token);
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // CLIENT-P2-U02: tokenVersion artışı AYNI atomic updateMany içinde — başarılı sıfırlama
    // öncesinde verilmiş tüm portal JWT'lerini geçersiz kılar. Ayrı bir ön-okuma EKLENMEZ:
    // findFirst+updateMany iki adıma bölünseydi atomik token-tüketim garantisi bozulurdu
    // (bkz. yukarıdaki tek-updateMany rationale) — bu nedenle bu olay için ayrıca
    // entity-attributed audit satırı YAZILMAZ (mevcut atomic-only tasarım korunur).
    const result = await this.prisma.clientPortalUser.updateMany({
      where: {
        resetToken: tokenHash,
        resetTokenExp: { gt: new Date() },
      },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExp: null,
        tokenVersion: { increment: 1 },
      },
    });

    if (result.count === 0) {
      throw new BadRequestException("Geçersiz veya süresi dolmuş token");
    }

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
      // CLIENT-P2-U02: isActive:false ile AYNI update içinde tokenVersion artışı —
      // guard'ın stale-version kontrolü da devre dışı bırakmayı bağımsız olarak kapsar.
      await tx.clientPortalUser.updateMany({
        where: { clientId },
        data: { isActive: false, tokenVersion: { increment: 1 } },
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
      select: PORTAL_NOTIFICATION_CLIENT_SELECT,
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
      select: PORTAL_DOCUMENT_CLIENT_SELECT,
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
      select: PORTAL_DOCUMENT_CLIENT_SELECT,
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
      select: PORTAL_MESSAGE_CLIENT_SELECT,
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
      select: PORTAL_MESSAGE_CLIENT_SELECT,
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
