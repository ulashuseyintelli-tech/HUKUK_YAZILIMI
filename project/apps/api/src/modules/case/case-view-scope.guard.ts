import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { isCaseViewScopeEnabled } from "./case-view-scope";
import { CaseViewScopeService } from "./case-view-scope.service";

/**
 * F02 P3-D2 (owner kararı 08.11.2026) — dosya kimliği YOLDA (`:caseId`) olan belge okuma uçlarının kapısı.
 * Yöntem düzeyinde kullanılır; sınıf düzeyindeki JwtAuthGuard / ViewerWriteDenyGuard'dan SONRA çalışır (mevcut işlem
 * yetkileri ayrıca korunur) ve handler'dan — yani dosya içeriği, önizleme ya da indirme üretilmeden — ÖNCE.
 * Kiracı ve aktör yalnız kimliği doğrulanmış kullanıcıdan okunur (gövde / sorgu değil).
 *
 * Bayrak kapalı → kapı hiçbir sorgu yapmadan geçirir. Bayrak açık + servis yok → 403 (fail-closed).
 */
@Injectable()
export class CaseViewScopeGuard implements CanActivate {
  constructor(@Optional() private readonly scope?: CaseViewScopeService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    if (!this.scope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const req = context.switchToHttp().getRequest();
    await this.scope.assertCaseVisible(req.user?.tenantId, req.user?.id, req.params?.caseId);
    return true;
  }
}
