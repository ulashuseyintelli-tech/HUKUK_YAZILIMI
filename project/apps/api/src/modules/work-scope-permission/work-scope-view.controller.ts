import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkScopePermissionService } from './work-scope-permission.service';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * F02-B görünürlük (owner ek talimatı 30.10.2026, madde 4) — GET /office/view-scope: aktörün masraf ve görev listelerinde
 * ŞU AN UYGULANAN kapsam (mode OFF / TENANT / BOUND) + bayrak durumu + izin çözümü. Liste servislerinin kullandığı AYNI bayrak
 * okuyucuları ve AYNI `resolve()` ile türetilir (ayrı kaynak yok → ekran ile liste tutarlı). Salt okuma: her rol KENDİ kapsamını
 * okur (VIEWER dahil; GET yazma değildir). Hiçbir listeyi değiştirmez, grant yazmaz; müvekkil okuma ya da dosyaya bağlama
 * yetkisiyle ilgisi yoktur. Caller: web görev listesi / kanban / dosya masraf bölümü kapsam rozeti (ViewScopeBadge).
 */
@Controller('office/view-scope')
@UseGuards(JwtAuthGuard)
export class WorkScopeViewController {
  constructor(private readonly permissions: WorkScopePermissionService) {}

  @Get()
  describe(@Req() req: AuthRequest) {
    return this.permissions.viewScopeFor(req.user.tenantId, req.user.id);
  }
}
