import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TenantService } from "./tenant.service";
import { TenantLifecycleInterceptor } from "./tenant-lifecycle.interceptor";

/**
 * C15-S1-MODIFIED · PR-2 — `APP_INTERCEPTOR` uygulama GENELİNDE enhancer olarak kaydolur;
 * bunun için modülün `@Global()` olması GEREKMEZ ve modülün diğer provider'larının
 * görünürlüğü BİLEREK genişletilmemiştir (`TenantService` yalnız `exports` üzerinden erişilir).
 * Interceptor'ın gerçekten global çalıştığı, gerçek full-app HTTP testiyle kanıtlanır.
 */
@Module({
  providers: [
    TenantService,
    { provide: APP_INTERCEPTOR, useClass: TenantLifecycleInterceptor },
  ],
  exports: [TenantService],
})
export class TenantModule {}
