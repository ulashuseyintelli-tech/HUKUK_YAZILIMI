// F02 K-A1 — "hesabı karta bağla" dar ürün ucu (owner kararı 31.10.2026, R04 §B B-1 (b)). Yalnız ADMIN; VIEWER yazamaz
// (ViewerWriteDenyGuard AdminGuard'dan ÖNCE: VIEWER ret kodu VIEWER_WRITE_DENIED; USER → AdminGuard 403). GET de ADMIN'e özel.
import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { AdminGuard } from "../guards/admin.guard";
import { ViewerWriteDenyGuard } from "../guards/viewer-write-deny.guard";
import { CurrentUser } from "../decorators/current-user.decorator";
import { AccountCardLinkService } from "./account-card-link.service";
import { LinkAccountToCardDto } from "./dto/account-card-link.dto";

@Controller("auth/account-card-links")
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard, AdminGuard)
export class AccountCardLinkController {
  constructor(private readonly links: AccountCardLinkService) {}

  /** Eşleme adayları: aynı kiracıda aktif ve kartsız hesaplar (Paket A Q2 kümesi; kişi kartı ekranı açılır listesi). */
  @Get("unlinked-users")
  listUnlinkedUsers(@CurrentUser("tenantId") tenantId: string) {
    return this.links.listUnlinkedUsers({ tenantId });
  }

  /** Hesabı karta bağla: lawyerId XOR staffMemberId; aynı kiracı; hesap ve kart aktif + bağsız; audit; e-posta YOK. */
  @Post()
  link(
    @CurrentUser("id") actorUserId: string,
    @CurrentUser("tenantId") tenantId: string,
    @Body() dto: LinkAccountToCardDto,
  ) {
    return this.links.link({ id: actorUserId, tenantId }, dto);
  }
}
