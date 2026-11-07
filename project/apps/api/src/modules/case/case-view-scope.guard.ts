import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isCaseViewScopeEnabled } from "./case-view-scope";
import { CaseViewScopeService } from "./case-view-scope.service";

/** Dosya kimliğinin okunacağı yol parametresinin adı (varsayılan `caseId`; P3-D3: case.controller `:id`). */
export const CASE_VIEW_SCOPE_PARAM = "f02:caseViewScopeParam";

/**
 * F02 P3-D2 / P3-D3 (owner kararları 08.11.2026) — dosya kimliği YOLDA olan okuma uçlarının kapısı.
 * Yöntem düzeyinde kullanılır; sınıf düzeyindeki kimlik / VIEWER kapılarından SONRA çalışır (mevcut işlem yetkileri ayrıca
 * korunur) ve handler'dan — yani dosya içeriği, alt kaynak, önizleme ya da indirme üretilmeden — ÖNCE.
 * Kiracı ve aktör yalnız kimliği doğrulanmış kullanıcıdan okunur (gövde / sorgu değil). Kural CaseViewScopeService'tedir.
 *
 * Bayrak kapalı → kapı hiçbir sorgu yapmadan geçirir. Bayrak açık + servis yok → 403 (fail-closed).
 */
@Injectable()
export class CaseViewScopeGuard implements CanActivate {
  constructor(
    @Optional() private readonly scope?: CaseViewScopeService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    if (!this.scope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const param = this.reflector?.get<string>(CASE_VIEW_SCOPE_PARAM, context.getHandler()) ?? "caseId";
    const req = context.switchToHttp().getRequest();
    await this.scope.assertCaseVisible(req.user?.tenantId, req.user?.id, req.params?.[param]);
    return true;
  }
}

/**
 * P3-D3: kapıyı dosya kimliği parametresinin adıyla birlikte uygular (ör. `@CaseViewScoped("id")`).
 * Yeni kural değildir; `@UseGuards(CaseViewScopeGuard)` ile aynı kapıdır.
 */
export function CaseViewScoped(param = "caseId") {
  return applyDecorators(SetMetadata(CASE_VIEW_SCOPE_PARAM, param), UseGuards(CaseViewScopeGuard));
}
