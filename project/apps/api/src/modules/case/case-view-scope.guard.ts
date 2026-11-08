import { applyDecorators, CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException, Optional, SetMetadata, UseGuards } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isCaseViewScopeEnabled } from "./case-view-scope";
import { CaseScopedObjectKind, CaseViewScopeService } from "./case-view-scope.service";

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

/** P3-D3b-2: kendi kimlikli nesne kapısının okuduğu nesne türü + yol parametresi. */
export const CASE_VIEW_SCOPE_OBJECT = "f02:caseViewScopeObject";
export type CaseViewScopeObjectMeta = { kind: CaseScopedObjectKind; param: string };

/**
 * Kapsam dışı / uyuşmaz nesnenin alacağı 404 mesajı = nesnenin KENDİ servisinin "bulunamadı" mesajı (var olmayan nesneyle
 * aynı gövde; varlık sızmaz). Dosya–müvekkil bağı uçlarının servisi bulunamadı vermez (200 boş) → D3b-1 ile aynı "Dosya bulunamadı".
 */
export const CASE_OBJECT_NOT_FOUND: Readonly<Record<CaseScopedObjectKind, string>> = {
  caseCollateral: "Teminat bulunamadi",
  caseInstrument: "Kambiyo senedi bulunamadi",
  caseJudgment: "Ilam bulunamadi",
  caseLease: "Kira sozlesmesi bulunamadi",
  caseFeeAgreement: "Ücret sözleşmesi bulunamadı",
  caseClient: "Dosya bulunamadı",
};

/**
 * F02 P3-D3b-2 (owner kararı 08.11.2026; D2 artefakt emsali) — KENDİ kimliğiyle okunan dosya nesnelerinin kapısı.
 * Dosya kimliği yolda değildir: nesnenin sunucudaki satırından çözülür (CaseViewScopeService.isCaseObjectVisible; kural orada).
 * Sınıf düzeyindeki kimlik / VIEWER kapılarından SONRA, handler'dan ÖNCE çalışır. Bayrak kapalı → sorgu yok, geçer.
 * Bayrak açık + servis ya da nesne meta verisi yok → 403 (fail-closed). Görünmez → nesnenin kendi 404 gövdesi.
 */
@Injectable()
export class CaseObjectViewScopeGuard implements CanActivate {
  constructor(
    @Optional() private readonly scope?: CaseViewScopeService,
    @Optional() private readonly reflector?: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isCaseViewScopeEnabled()) return true;
    const meta = this.reflector?.get<CaseViewScopeObjectMeta>(CASE_VIEW_SCOPE_OBJECT, context.getHandler());
    if (!this.scope || !meta || !CASE_OBJECT_NOT_FOUND[meta.kind]) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const req = context.switchToHttp().getRequest();
    if (!(await this.scope.isCaseObjectVisible(req.user?.tenantId, req.user?.id, meta.kind, req.params?.[meta.param]))) {
      throw new NotFoundException(CASE_OBJECT_NOT_FOUND[meta.kind]);
    }
    return true;
  }
}

/** P3-D3b-2: ör. `@CaseViewScopedByObject("caseCollateral", "id")`. Yeni kural değildir; dosya nesneden çözülür. */
export function CaseViewScopedByObject(kind: CaseScopedObjectKind, param: string) {
  const meta: CaseViewScopeObjectMeta = { kind, param };
  return applyDecorators(SetMetadata(CASE_VIEW_SCOPE_OBJECT, meta), UseGuards(CaseObjectViewScopeGuard));
}
