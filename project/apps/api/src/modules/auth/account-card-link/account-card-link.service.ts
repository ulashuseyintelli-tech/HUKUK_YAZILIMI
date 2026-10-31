// F02 K-A1 — hesabı kişi kartına bağlama (owner kararı 31.10.2026; karar listesi R04 §B B-1 seçenek (b): dar ürün ucu).
// Paket A E-2 önkoşulu: geçiş öncesi KARTSIZ AKTİF hesaplar kimlik bayrağı açılınca duyarlı onaylarda 403 alır; bu uç
// mevcut OWN-01 bağ modelini (Lawyer.userId / StaffMember.userId @unique) kullanır — yeni kimlik mimarisi AÇILMAZ.
// Kurallar: ADMIN (controller: JwtAuthGuard + ViewerWriteDenyGuard + AdminGuard); aynı kiracı; hesap AKTİF ve BAĞSIZ; kart AKTİF ve
// BAĞSIZ; TAM BİR kart. Yarış: hesap satırı FOR UPDATE ile kilitlenir (aynı hesaba eşzamanlı iki bağlama serileşir), kart bağlama
// WHERE userId IS NULL koşullu updateMany (count 0 → 409, transaction geri alınır). Audit AYNI transaction'da; kişisel veri yazılmaz.
// Hesabın ad / soyad / rol / parola / isActive alanları DEĞİŞMEZ; e-posta GÖNDERİLMEZ; env bayrağına bağlı DEĞİL.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { isValidTckn } from "../../../common/identity-validation.util";
import { LinkAccountToCardDto } from "./dto/account-card-link.dto";

export type AccountCardType = "LAWYER" | "STAFF";

export interface AccountCardLinkResult {
  userId: string;
  cardType: AccountCardType;
  cardId: string;
  /** Kartta geçerli TCKN var mı → approval-identity yüklemi bu hesabı KANITLI sayar (K-A1 sınır bayrağı açılınca 403 almaz). */
  identityProofReady: boolean;
}

export interface UnlinkedUserRow {
  id: string;
  email: string;
  name: string;
  surname: string;
  role: string;
  /** passwordHash null = parola belirlenmemiş (bekleyen / süresi geçmiş davet) — ayrı işlenir, hash DÖNMEZ. */
  pendingInvite: boolean;
}

export const ACCOUNT_CARD_LINK_AUDIT_ACTION = "USER_CARD_LINKED";

@Injectable()
export class AccountCardLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Eşleme adayları: aynı kiracıda AKTİF ve hiçbir karta bağlı olmayan hesaplar (ADMIN). Parola hash'i dönmez. */
  async listUnlinkedUsers(actor: { tenantId: string }): Promise<UnlinkedUserRow[]> {
    const rows = await this.prisma.user.findMany({
      where: { tenantId: actor.tenantId, isActive: true, lawyer: { is: null }, staffMember: { is: null } },
      select: { id: true, email: true, name: true, surname: true, role: true, passwordHash: true },
      orderBy: [{ surname: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, surname: r.surname, role: String(r.role), pendingInvite: r.passwordHash === null }));
  }

  async link(actor: { id: string; tenantId: string }, dto: LinkAccountToCardDto): Promise<AccountCardLinkResult> {
    if (dto.lawyerId && dto.staffMemberId) throw new BadRequestException("lawyerId ve staffMemberId aynı anda verilemez");
    if (!dto.lawyerId && !dto.staffMemberId) throw new BadRequestException("Bağlanacak kişi kartı zorunludur: lawyerId ya da staffMemberId");
    if (!dto.userId) throw new BadRequestException("userId zorunludur");

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Hesap satırı kilidi: aynı hesaba eşzamanlı iki bağlama denemesi serileşir; ikincisi güncel bağı görür → 409.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${dto.userId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: dto.userId, tenantId: actor.tenantId },
        select: { id: true, isActive: true, lawyer: { select: { id: true } }, staffMember: { select: { id: true } } },
      });
      if (!user) throw new NotFoundException("Hesap bulunamadı ya da kiracı dışı");
      if (!user.isActive) throw new ConflictException("Pasif hesap kişi kartına bağlanmaz");
      if (user.lawyer || user.staffMember) throw new ConflictException("Hesap zaten bir kişi kartına bağlı");

      let cardType: AccountCardType;
      let cardId: string;
      let tckn: string | null;
      if (dto.lawyerId) {
        const card = await tx.lawyer.findFirst({
          where: { id: dto.lawyerId, tenantId: actor.tenantId, isActive: true },
          select: { id: true, userId: true, tckn: true },
        });
        if (!card) throw new NotFoundException("Avukat kartı bulunamadı, kiracı dışı ya da pasif");
        if (card.userId) throw new ConflictException("Bu avukat kartı zaten bir hesaba bağlı");
        // Yarış güvenliği: WHERE userId IS NULL — eşzamanlı iki bağlama denemesinden yalnız biri satırı günceller.
        const linked = await tx.lawyer.updateMany({ where: { id: card.id, tenantId: actor.tenantId, userId: null }, data: { userId: user.id } });
        if (linked.count !== 1) throw new ConflictException("Avukat kartı eşzamanlı olarak başka bir hesaba bağlandı");
        cardType = "LAWYER"; cardId = card.id; tckn = card.tckn;
      } else {
        const card = await tx.staffMember.findFirst({
          where: { id: dto.staffMemberId, tenantId: actor.tenantId, isActive: true },
          select: { id: true, userId: true, tckn: true },
        });
        if (!card) throw new NotFoundException("Personel kartı bulunamadı, kiracı dışı ya da pasif");
        if (card.userId) throw new ConflictException("Bu personel kartı zaten bir hesaba bağlı");
        const linked = await tx.staffMember.updateMany({ where: { id: card.id, tenantId: actor.tenantId, userId: null }, data: { userId: user.id } });
        if (linked.count !== 1) throw new ConflictException("Personel kartı eşzamanlı olarak başka bir hesaba bağlandı");
        cardType = "STAFF"; cardId = card.id; tckn = card.tckn;
      }
      const identityProofReady = isValidTckn(tckn);
      // Kişisel veri YOK: e-posta / ad / TCKN yazılmaz; yalnız kimlikler + boolean.
      await this.audit.logInTransaction(tx, {
        tenantId: actor.tenantId,
        action: ACCOUNT_CARD_LINK_AUDIT_ACTION,
        entityType: "USER",
        entityId: user.id,
        userId: actor.id,
        metadata: { targetUserId: user.id, cardType, cardId, identityProofReady, source: "ACCOUNT_CARD_LINK" },
      });
      return { userId: user.id, cardType, cardId, identityProofReady };
    });
  }
}
