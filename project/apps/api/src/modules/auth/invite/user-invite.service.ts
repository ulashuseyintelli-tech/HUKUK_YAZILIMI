// K1-7: Güvenli login provisioning servisi (Option C: pending User + UserInvite).
// Gerçek kullanıcı yaratma/davet gönderme YALNIZ admin çağrısıyla + feature flag ON iken olur.
// Bu PR otomatik provisioning YAPMAZ. Ham token/parola asla DB/audit'e yazılmaz.
import {
  Injectable, Logger, BadRequestException, ConflictException,
  ForbiddenException, NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { CreateInviteDto } from "./dto/user-invite.dto";
import { generateRawInviteToken, hashInviteToken, redactEmail } from "./user-invite-token.util";

interface InviteActor {
  id: string;
  tenantId: string;
  role?: string;
}

@Injectable()
export class UserInviteService {
  private readonly logger = new Logger(UserInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailProviderService,
    private readonly config: ConfigService,
  ) {}

  /** Admin write akışı feature flag arkasında (default kapalı → canlı risk yok). */
  private enabled(): boolean {
    return String(this.config.get("LOGIN_INVITE_PROVISIONING_ENABLED") ?? "").toLowerCase() === "true";
  }

  private ttlHours(): number {
    const n = Number.parseInt(String(this.config.get("LOGIN_INVITE_TTL_HOURS") ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : 72;
  }

  private acceptUrl(rawToken: string): string {
    const base = (this.config.get("WEB_BASE_URL") || this.config.get("APP_BASE_URL") || "")
      .toString()
      .replace(/\/+$/, "");
    return `${base}/auth/accept-invite?token=${encodeURIComponent(rawToken)}`;
  }

  /** Admin: gerçek kişi için pending User + invite oluşturur, e-posta gönderir. */
  async issue(actor: InviteActor, dto: CreateInviteDto) {
    if (!this.enabled()) throw new ForbiddenException("Login invite provisioning devre dışı");
    const email = dto.email.trim().toLowerCase();
    const role = (dto.role ?? "USER") as UserRole;

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: actor.tenantId, email },
    });
    if (existing) throw new ConflictException("Bu e-posta için kullanıcı zaten var");

    const raw = generateRawInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);

    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId: actor.tenantId,
          email,
          passwordHash: null, // pending: parola kullanıcı tarafından accept'te belirlenir
          name: dto.name,
          surname: dto.surname ?? "",
          role,
          isActive: false, // pending: login() + validate() bunu reddeder
        },
      });
      const invite = await tx.userInvite.create({
        data: { tenantId: actor.tenantId, userId: user.id, email, tokenHash, expiresAt, invitedById: actor.id },
      });
      return { user, invite };
    });

    await this.sendInviteEmail(email, raw);
    await this.writeAudit("USER_INVITE_ISSUED", actor.tenantId, actor.id, {
      inviteId: created.invite.id, userId: created.user.id,
      emailRedacted: redactEmail(email), expiresAt: expiresAt.toISOString(), result: "ISSUED",
    });
    return { inviteId: created.invite.id, userId: created.user.id, email: redactEmail(email), expiresAt: expiresAt.toISOString() };
  }

  /** Admin: yeni token üret (eski token aynı kaydı güncelleyerek GEÇERSİZ olur), tekrar e-posta. */
  async resend(actor: InviteActor, inviteId: string) {
    if (!this.enabled()) throw new ForbiddenException("Login invite provisioning devre dışı");
    const invite = await this.prisma.userInvite.findFirst({
      where: { id: inviteId, tenantId: actor.tenantId },
      include: { user: true },
    });
    if (!invite) throw new NotFoundException("Davet bulunamadı");
    if (invite.consumedAt) throw new ConflictException("Davet zaten kabul edilmiş");
    if (invite.user?.isActive) throw new ConflictException("Kullanıcı zaten aktif");

    const raw = generateRawInviteToken();
    const tokenHash = hashInviteToken(raw);
    const expiresAt = new Date(Date.now() + this.ttlHours() * 3600_000);
    await this.prisma.userInvite.update({
      where: { id: invite.id },
      data: { tokenHash, expiresAt, revokedAt: null },
    });

    await this.sendInviteEmail(invite.email, raw);
    await this.writeAudit("USER_INVITE_RESENT", actor.tenantId, actor.id, {
      inviteId: invite.id, userId: invite.userId, emailRedacted: redactEmail(invite.email),
      expiresAt: expiresAt.toISOString(), result: "RESENT",
    });
    return { inviteId: invite.id, expiresAt: expiresAt.toISOString() };
  }

  /** Admin: daveti iptal et (token kullanılamaz olur). User pending kalır (silinmez). */
  async revoke(actor: InviteActor, inviteId: string) {
    if (!this.enabled()) throw new ForbiddenException("Login invite provisioning devre dışı");
    const invite = await this.prisma.userInvite.findFirst({
      where: { id: inviteId, tenantId: actor.tenantId },
    });
    if (!invite) throw new NotFoundException("Davet bulunamadı");
    await this.prisma.userInvite.update({ where: { id: invite.id }, data: { revokedAt: new Date() } });
    await this.writeAudit("USER_INVITE_REVOKED", actor.tenantId, actor.id, {
      inviteId: invite.id, userId: invite.userId, result: "REVOKED",
    });
    return { inviteId: invite.id, revoked: true };
  }

  /** Admin: bekleyen davetleri listele (maskeli e-posta). */
  async list(actor: InviteActor, status?: string) {
    const where: Record<string, unknown> = { tenantId: actor.tenantId };
    if (!status || status === "pending") {
      where.consumedAt = null;
      where.revokedAt = null;
      where.expiresAt = { gt: new Date() };
    }
    const invites = await this.prisma.userInvite.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
    return invites.map((i) => ({
      inviteId: i.id, userId: i.userId, email: redactEmail(i.email),
      expiresAt: i.expiresAt, createdAt: i.createdAt,
      consumed: !!i.consumedAt, revoked: !!i.revokedAt,
    }));
  }

  /** Public: ham token + kullanıcının belirlediği parola → User aktifleşir. */
  async accept(rawToken: string, password: string) {
    if (!rawToken || !password) throw new BadRequestException("Token ve parola zorunludur");
    const tokenHash = hashInviteToken(rawToken);
    const invite = await this.prisma.userInvite.findUnique({ where: { tokenHash }, include: { user: true } });

    if (!invite) {
      // Token bulunamadı (geçersiz/forged): tenant BİLİNMİYOR. AuditLog tenant-scoped olduğu için
      // sahte 'unknown' tenant'a kayıt YAZMAYIZ (tenant-isolation'ı bozar + enumeration gürültüsü).
      // Yalnız best-effort log (PII/token YOK).
      this.logger.warn("Geçersiz invite token denemesi (NOT_FOUND)");
      throw new BadRequestException("Geçersiz veya süresi dolmuş davet");
    }
    const fail = async (reasonCode: string) => {
      await this.writeAudit("USER_INVITE_FAILED", invite.tenantId, invite.userId ?? null, {
        inviteId: invite.id, result: "FAILED", reasonCode,
      });
      throw new BadRequestException("Geçersiz veya süresi dolmuş davet");
    };
    if (invite.revokedAt) return fail("REVOKED");
    if (invite.consumedAt) return fail("CONSUMED");
    if (invite.expiresAt.getTime() < Date.now()) return fail("EXPIRED");
    if (!invite.user) return fail("USER_MISSING");
    if (invite.user.isActive) return fail("ALREADY_ACTIVE");
    if (invite.email !== invite.user.email) return fail("EMAIL_MISMATCH");
    if (invite.tenantId !== invite.user.tenantId) return fail("TENANT_MISMATCH");

    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: invite.userId }, data: { passwordHash, isActive: true } });
      await tx.userInvite.update({ where: { id: invite.id }, data: { consumedAt: new Date() } });
    });
    await this.writeAudit("USER_INVITE_ACCEPTED", invite.tenantId, invite.userId, {
      inviteId: invite.id, userId: invite.userId, result: "ACCEPTED",
    });
    return { ok: true, userId: invite.userId };
  }

  private async sendInviteEmail(email: string, rawToken: string) {
    const url = this.acceptUrl(rawToken);
    const r = await this.email.send({
      to: email,
      subject: "Hesap davetiniz — parolanızı belirleyin",
      text: `Hesabınız oluşturuldu. Parolanızı belirlemek için: ${url}\nBu bağlantı tek kullanımlıktır ve kısa süre sonra geçersiz olur.`,
      html: `<p>Hesabınız oluşturuldu. Parolanızı belirlemek için aşağıdaki bağlantıya tıklayın:</p>` +
        `<p><a href="${url}">Parola belirle</a></p>` +
        `<p>Bu bağlantı tek kullanımlıktır ve kısa süre sonra geçersiz olur.</p>`,
    });
    // Log'a e-posta (maskeli bile olsa) yazma → CI-2 PII log gate. errorCode teşhis için yeterli.
    if (!r.success) this.logger.warn(`Invite e-postası gönderilemedi: ${r.errorCode}`);
  }

  private async writeAudit(action: string, tenantId: string, userId: string | null, metadata: Record<string, any>) {
    // Ham token / parola / passwordHash ASLA metadata'ya yazılmaz.
    await this.audit.log({
      tenantId, action, entityType: "USER_INVITE",
      entityId: typeof metadata.inviteId === "string" ? metadata.inviteId : undefined,
      userId: userId ?? undefined,
      metadata,
    });
  }
}
