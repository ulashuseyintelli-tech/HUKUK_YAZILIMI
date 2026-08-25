import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";

import { isTenantLifecycleState, isLoginableLifecycle } from "./tenant-lifecycle";

/**
 * C15-S1-MODIFIED · PR-2 — mutating istekler için lifecycle savunma katmanı.
 *
 * BİRİNCİL kontrol auth katmanındadır (`login()` / `validateUser()` → generic 401).
 * Bu bileşen DEFENSE-IN-DEPTH'tir: kimliği doğrulanmış bir isteğin, tenant'ı ACTIVE
 * olmaktan çıkmışken veri değiştirmesini ikinci kez engeller.
 *
 * NEDEN GUARD DEĞİL, INTERCEPTOR: NestJS'te global guard'lar (`APP_GUARD`) controller
 * seviyesindeki `@UseGuards(JwtAuthGuard)`'DAN ÖNCE çalışır; o anda `request.user` HENÜZ
 * SET EDİLMEMİŞTİR ve guard her yerde sessizce no-op olurdu — yani koruma görüntüsü verip
 * hiçbir şey korumazdı. Interceptor'lar TÜM guard'lardan SONRA çalışır, `request.user`
 * set olmuştur. Bu davranış varsayım değildir: gerçek full-app HTTP testiyle kanıtlanır
 * (`tenant-lifecycle-enforcement-http.spec.ts`).
 *
 * FAIL-CLOSED: `request.user` VARSA fakat `user.tenant.lifecycle` eksik/bozuksa istek
 * REDDEDİLİR. Yalnız gerçekten kimlik taşımayan (public) yollar no-op'tur.
 *
 * BYPASS YÜZEYİ YOKTUR: muafiyet dekoratörü BİLEREK eklenmemiştir. Lifecycle kontrol
 * düzlemi (PR-4) HTTP tenant-JWT yolundan DEĞİL, out-of-band operatör aracından (K1)
 * çalışacaktır; bu yüzden bu interceptor'ın delinmesine gerek yoktur.
 */

/** Veri değiştiren HTTP metotları. GET/HEAD/OPTIONS okuma sayılır ve bu katmanda ele alınmaz. */
export const TENANT_LIFECYCLE_MUTATING_METHODS: readonly string[] = [
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
];

/** Lifecycle değeri hiçbir zaman istemciye sızdırılmaz; mesaj SABİTTİR. */
export const TENANT_LIFECYCLE_FORBIDDEN_MESSAGE = "Bu işlem şu anda gerçekleştirilemez";

@Injectable()
export class TenantLifecycleInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // HTTP dışı bağlamlar (cron/microservice/graphql) bu katmanın konusu değildir.
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const method = String(request?.method ?? "").toUpperCase();

    if (!TENANT_LIFECYCLE_MUTATING_METHODS.includes(method)) {
      return next.handle();
    }

    const user = request?.user;

    // Kimlik YOK → public yol. Bu katman devreye girmez (birincil kontrol zaten auth'tadır).
    if (!user) {
      return next.handle();
    }

    // Kimlik VAR → lifecycle okunabilir ve ACTIVE olmak ZORUNDA. Eksik/bozuk değer
    // "bilinmiyor" demektir ve fail-closed reddedilir; sessizce geçirilmez.
    const lifecycle = user?.tenant?.lifecycle;
    if (!isTenantLifecycleState(lifecycle) || !isLoginableLifecycle(lifecycle)) {
      throw new ForbiddenException(TENANT_LIFECYCLE_FORBIDDEN_MESSAGE);
    }

    return next.handle();
  }
}
