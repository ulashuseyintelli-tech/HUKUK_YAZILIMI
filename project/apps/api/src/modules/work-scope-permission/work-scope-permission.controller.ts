import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { WorkScopePermissionService } from './work-scope-permission.service';

interface AuthRequest {
  user: { id: string; tenantId: string; role?: string };
}

/**
 * F02-B-1 (owner kararı 2026-10-29/30) — büro geneli görünüm izinleri ürün yolu (büro ayarları kişi kartı).
 * Yetki SERVİS girişinde (GÜNCEL DB rolü ADMIN, tx içinde); controller yalnız JWT aktörünü iletir. VIEWER yazamaz
 * (B4/B6 `ViewerWriteDenyGuard`). Bu uçlar hiçbir listeyi genişletmez; yalnız grant kaydını yönetir (kapsam etkinleştirmesi
 * ayrı dilim + ayrı yayın yetkisi — G3). Görev/masraf view_all izinleri MÜVEKKİL okuma ya da dosyaya bağlama yetkisi VERMEZ.
 */
@Controller('office/view-all-permissions')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class WorkScopePermissionController {
  constructor(private readonly permissions: WorkScopePermissionService) {}

  /** Caller: büro ayarları kişi kartı (ADMIN). GET /office/view-all-permissions?personType=lawyer|staff&personId=... */
  @Get()
  describe(@Req() req: AuthRequest, @Query('personType') personType: unknown, @Query('personId') personId: unknown) {
    return this.permissions.describe(req.user.tenantId, req.user.id, { personType, personId });
  }

  /** Caller: kişi kartı (ADMIN). Gövde: { personType, personId, key, effect: ALLOW|DENY, validUntil?, reason? } — durum atama. */
  @Post()
  grant(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.permissions.grant(req.user.tenantId, req.user.id, body);
  }

  /** Caller: kişi kartı (ADMIN). Gövde: { personType, personId, key, reason? } — varsayılan kapsama dönüş (ALLOW ve DENY süresi geçer). */
  @Post('revoke')
  revoke(@Req() req: AuthRequest, @Body() body: unknown) {
    return this.permissions.revoke(req.user.tenantId, req.user.id, body);
  }
}
