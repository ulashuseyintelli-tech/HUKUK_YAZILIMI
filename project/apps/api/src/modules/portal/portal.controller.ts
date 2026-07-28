import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { PortalService } from "./portal.service";
import { ClientFinancialDisclosurePortalService } from "./client-financial-disclosure-portal.service";
import { PortalAuthGuard } from "./portal-auth.guard";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { LoginRateLimitGuard } from "../auth/guards/login-rate-limit.guard";
import { CredentialRecoveryRateLimitGuard } from "../auth/guards/credential-recovery-rate-limit.guard";

// Dosya yükleme ayarları
const portalDocStorage = diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = join(process.cwd(), "data", "portal-documents");
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `portal-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

// ==================== PUBLIC ENDPOINTS (Giriş) ====================

@Controller("portal")
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    // CLIENT-P2-U03-TRACK-B-I06: yalniz I05 projeksiyonunun adaptoru; portal katmani
    // kendi sorgusunu/alan secimini/yetki kararini URETMEZ.
    private readonly disclosurePortalService: ClientFinancialDisclosurePortalService,
  ) {}

  /**
   * Portal girişi
   * POST /api/portal/login
   */
  @Post("login")
  @UseGuards(LoginRateLimitGuard)
  async login(@Body() body: { email: string; password: string }) {
    return this.portalService.login(body.email, body.password);
  }

  /**
   * Şifre sıfırlama talebi
   * POST /api/portal/forgot-password
   */
  @Post("forgot-password")
  @UseGuards(CredentialRecoveryRateLimitGuard)
  async forgotPassword(@Body() body: { email: string }) {
    return this.portalService.createResetToken(body.email);
  }

  /**
   * Şifre sıfırla
   * POST /api/portal/reset-password
   */
  @Post("reset-password")
  @UseGuards(CredentialRecoveryRateLimitGuard)
  async resetPassword(@Body() body: { token: string; password: string }) {
    return this.portalService.resetPassword(body.token, body.password);
  }

  // ==================== PROTECTED ENDPOINTS (Portal Kullanıcısı) ====================

  /**
   * Müvekkilin dosyaları
   * GET /api/portal/cases
   */
  @Get("cases")
  @UseGuards(PortalAuthGuard)
  async getCases(@Request() req: any) {
    return this.portalService.getClientCases(req.portalUser.clientId, req.portalUser.tenantId);
  }

  /**
   * Dosya detayı
   * GET /api/portal/cases/:id
   */
  @Get("cases/:id")
  @UseGuards(PortalAuthGuard)
  async getCaseDetail(@Param("id") id: string, @Request() req: any) {
    return this.portalService.getCaseDetail(id, req.portalUser.clientId, req.portalUser.tenantId);
  }

  /**
   * CLIENT-P2-U03-TRACK-B-I06 — Müvekkil finansal bildirimleri, VARSAYILAN yüzey.
   * GET /api/portal/financial-disclosures
   *
   * §35.14 OWNER KARARI: bu yüzey YALNIZ current-effective disclosure'ları taşır. Düzeltme
   * ve reversal geçmişi AYRI `/history` yüzeyindedir — tek birleşik liste ÜRETİLMEZ.
   * §35.7: yalnız `PUBLISHED` client-görünürdür.
   *
   * Kapsam `req.portalUser.sub` (portal kullanıcı kimliği) üzerinden SERVER TARAFINDA
   * yeniden çözülür; token'daki `clientId` KULLANILMAZ.
   */
  @Get("financial-disclosures")
  @UseGuards(PortalAuthGuard)
  async getFinancialDisclosures(@Request() req: any, @Query("caseId") caseId?: string) {
    return this.disclosurePortalService.getCurrent(
      req.portalUser.sub,
      req.portalUser.tenantId,
      caseId,
    );
  }

  /**
   * CLIENT-P2-U03-TRACK-B-I06 — AYRI "Bildirim Geçmişi" yüzeyi (§35.14).
   * GET /api/portal/financial-disclosures/history
   */
  @Get("financial-disclosures/history")
  @UseGuards(PortalAuthGuard)
  async getFinancialDisclosureHistory(@Request() req: any, @Query("caseId") caseId?: string) {
    return this.disclosurePortalService.getHistory(
      req.portalUser.sub,
      req.portalUser.tenantId,
      caseId,
    );
  }

  /**
   * CLIENT-P2-U03-TRACK-B-I06 — Tek bildirim.
   * GET /api/portal/financial-disclosures/:id
   *
   * Kapsam dışı, yayınlanmamış ve var olmayan kayıt AYNI 404 gövdesini üretir —
   * bir kaydın VARLIĞI bile sızdırılmaz.
   */
  @Get("financial-disclosures/:id")
  @UseGuards(PortalAuthGuard)
  async getFinancialDisclosure(@Param("id") id: string, @Request() req: any) {
    return this.disclosurePortalService.getOne(req.portalUser.sub, req.portalUser.tenantId, id);
  }

  /**
   * Müvekkilin vekaletleri
   * GET /api/portal/poas
   */
  @Get("poas")
  @UseGuards(PortalAuthGuard)
  async getPoas(@Request() req: any) {
    return this.portalService.getClientPoas(req.portalUser.clientId);
  }

  /**
   * Şifre değiştir
   * POST /api/portal/change-password
   */
  @Post("change-password")
  @UseGuards(PortalAuthGuard)
  async changePassword(
    @Request() req: any,
    @Body() body: { oldPassword: string; newPassword: string }
  ) {
    return this.portalService.changePassword(req.portalUser.sub, body.oldPassword, body.newPassword);
  }

  // ==================== ADMIN ENDPOINTS (Büro Kullanıcısı) ====================

  /**
   * Portal kullanıcısı oluştur
   * POST /api/portal/admin/create-user
   */
  @Post("admin/create-user")
  @UseGuards(JwtAuthGuard)
  async createPortalUser(
    @Request() req: any,
    @Body() body: { clientId: string; email: string; password: string }
  ) {
    return this.portalService.createPortalUser(
      body.clientId,
      body.email,
      body.password,
      req.user.tenantId,
      { userId: req.user.id }
    );
  }

  /**
   * Portal kullanıcısını devre dışı bırak
   * POST /api/portal/admin/disable-user
   */
  @Post("admin/disable-user")
  @UseGuards(JwtAuthGuard)
  async disablePortalUser(
    @Request() req: any,
    @Body() body: { clientId: string }
  ) {
    return this.portalService.disablePortalUser(body.clientId, req.user.tenantId, { userId: req.user.id });
  }

  // ==================== BİLDİRİM ENDPOINTS ====================

  /**
   * Bildirimleri getir
   * GET /api/portal/notifications
   */
  @Get("notifications")
  @UseGuards(PortalAuthGuard)
  async getNotifications(@Request() req: any) {
    return this.portalService.getNotifications(req.portalUser.clientId);
  }

  /**
   * Okunmamış bildirim sayısı
   * GET /api/portal/notifications/unread-count
   */
  @Get("notifications/unread-count")
  @UseGuards(PortalAuthGuard)
  async getUnreadCount(@Request() req: any) {
    return this.portalService.getUnreadCount(req.portalUser.clientId);
  }

  /**
   * Bildirimi okundu işaretle
   * POST /api/portal/notifications/:id/read
   */
  @Post("notifications/:id/read")
  @UseGuards(PortalAuthGuard)
  async markAsRead(@Param("id") id: string, @Request() req: any) {
    return this.portalService.markAsRead(id, req.portalUser.clientId);
  }

  /**
   * Tüm bildirimleri okundu işaretle
   * POST /api/portal/notifications/read-all
   */
  @Post("notifications/read-all")
  @UseGuards(PortalAuthGuard)
  async markAllAsRead(@Request() req: any) {
    return this.portalService.markAllAsRead(req.portalUser.clientId);
  }

  // ==================== BELGE ENDPOINTS ====================

  /**
   * Belgelerimi getir
   * GET /api/portal/documents
   */
  @Get("documents")
  @UseGuards(PortalAuthGuard)
  async getDocuments(@Request() req: any) {
    return this.portalService.getDocuments(req.portalUser.clientId, req.portalUser.tenantId);
  }

  /**
   * Belge yükle
   * POST /api/portal/documents/upload
   */
  @Post("documents/upload")
  @UseGuards(PortalAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: portalDocStorage,
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      fileFilter: (req, file, cb) => {
        const allowed = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];
        const ext = extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException("Desteklenmeyen dosya formatı"), false);
        }
      },
    })
  )
  async uploadDocument(
    @Request() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { type: string; title: string; description?: string; caseId?: string }
  ) {
    if (!file) {
      throw new BadRequestException("Dosya yüklenmedi");
    }

    return this.portalService.uploadDocument({
      clientId: req.portalUser.clientId,
      tenantId: req.portalUser.tenantId,
      caseId: body.caseId,
      type: body.type || "DIGER",
      title: body.title || file.originalname,
      description: body.description,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
    });
  }

  /**
   * Belge indir
   * GET /api/portal/documents/:id/download
   */
  @Get("documents/:id/download")
  @UseGuards(PortalAuthGuard)
  async downloadDocument(@Param("id") id: string, @Request() req: any, @Res() res: Response) {
    const doc = await this.portalService.getDocument(id, req.portalUser.clientId);
    
    if (!existsSync(doc.filePath)) {
      throw new BadRequestException("Dosya bulunamadı");
    }

    res.download(doc.filePath, doc.fileName);
  }

  /**
   * Belge sil
   * DELETE /api/portal/documents/:id
   */
  @Delete("documents/:id")
  @UseGuards(PortalAuthGuard)
  async deleteDocument(@Param("id") id: string, @Request() req: any) {
    const result = await this.portalService.deleteDocument(id, req.portalUser.clientId);
    
    // Dosyayı diskten sil
    if (result.filePath && existsSync(result.filePath)) {
      unlinkSync(result.filePath);
    }

    return { success: true };
  }

  // ==================== ADMIN - BELGE YÖNETİMİ ====================

  /**
   * Bekleyen belgeleri getir (büro için)
   * GET /api/portal/admin/documents/pending
   */
  @Get("admin/documents/pending")
  @UseGuards(JwtAuthGuard)
  async getPendingDocuments(@Request() req: any) {
    return this.portalService.getPendingDocuments(req.user.tenantId);
  }

  /**
   * Belgeyi onayla
   * POST /api/portal/admin/documents/:id/approve
   */
  @Post("admin/documents/:id/approve")
  @UseGuards(JwtAuthGuard)
  async approveDocument(
    @Param("id") id: string,
    @Request() req: any,
    @Body() body: { note?: string }
  ) {
    return this.portalService.reviewDocument(id, req.user.tenantId, req.user.id, true, body.note);
  }

  /**
   * Belgeyi reddet
   * POST /api/portal/admin/documents/:id/reject
   */
  @Post("admin/documents/:id/reject")
  @UseGuards(JwtAuthGuard)
  async rejectDocument(
    @Param("id") id: string,
    @Request() req: any,
    @Body() body: { note?: string }
  ) {
    return this.portalService.reviewDocument(id, req.user.tenantId, req.user.id, false, body.note);
  }

  // ==================== MESAJLAŞMA ENDPOINTS ====================

  /**
   * Mesajlarımı getir (müvekkil)
   * GET /api/portal/messages
   */
  @Get("messages")
  @UseGuards(PortalAuthGuard)
  async getMessages(@Request() req: any) {
    return this.portalService.getMessages(req.portalUser.clientId, req.portalUser.tenantId);
  }

  /**
   * Mesaj gönder (müvekkil)
   * POST /api/portal/messages
   */
  @Post("messages")
  @UseGuards(PortalAuthGuard)
  async sendMessage(@Request() req: any, @Body() body: { content: string; caseId?: string }) {
    const userData = await this.portalService.getClientPoas(req.portalUser.clientId);
    const senderName = "Müvekkil"; // Basit tutuyoruz
    return this.portalService.sendMessageFromClient(
      req.portalUser.clientId,
      req.portalUser.tenantId,
      body.content,
      senderName,
      body.caseId
    );
  }

  /**
   * Okunmamış mesaj sayısı (müvekkil)
   * GET /api/portal/messages/unread-count
   */
  @Get("messages/unread-count")
  @UseGuards(PortalAuthGuard)
  async getUnreadMessageCount(@Request() req: any) {
    return this.portalService.getUnreadMessageCount(req.portalUser.clientId, req.portalUser.tenantId);
  }

  /**
   * Mesajları okundu işaretle (müvekkil)
   * POST /api/portal/messages/mark-read
   */
  @Post("messages/mark-read")
  @UseGuards(PortalAuthGuard)
  async markMessagesAsRead(@Request() req: any) {
    return this.portalService.markMessagesAsRead(req.portalUser.clientId, req.portalUser.tenantId);
  }

  // ==================== ADMIN - MESAJLAŞMA ====================

  /**
   * Mesajlaşma için müvekkil listesi (büro)
   * GET /api/portal/admin/messages/clients
   */
  @Get("admin/messages/clients")
  @UseGuards(JwtAuthGuard)
  async getClientsWithMessages(@Request() req: any) {
    return this.portalService.getClientsWithMessages(req.user.tenantId);
  }

  /**
   * Müvekkil mesajlarını getir (büro)
   * GET /api/portal/admin/messages/:clientId
   */
  @Get("admin/messages/:clientId")
  @UseGuards(JwtAuthGuard)
  async getClientMessages(@Param("clientId") clientId: string, @Request() req: any) {
    return this.portalService.getClientMessages(clientId, req.user.tenantId);
  }

  /**
   * Müvekkile mesaj gönder (büro)
   * POST /api/portal/admin/messages/:clientId
   */
  @Post("admin/messages/:clientId")
  @UseGuards(JwtAuthGuard)
  async sendMessageToClient(
    @Param("clientId") clientId: string,
    @Request() req: any,
    @Body() body: { content: string; caseId?: string }
  ) {
    return this.portalService.sendMessageFromOffice(
      clientId,
      req.user.tenantId,
      body.content,
      req.user.id,
      req.user.name || "Büro",
      body.caseId
    );
  }
}
