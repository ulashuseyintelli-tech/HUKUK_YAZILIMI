// C15-S1-MODIFIED · PR-2 — TenantLifecycleInterceptor'ın GERÇEK Nest HTTP pipeline'ında
// çalıştığının kanıtı.
//
// NEDEN BU BİÇİM: iddia "APP_INTERCEPTOR kaydı uygulama genelinde çalışır ve `request.user`
// SET EDİLDİKTEN SONRA görür"dür. Bu, birim testiyle kanıtlanamaz — gerçek guard→interceptor
// sırası gerekir. Fakat gerçek `AppModule` AÇILMAZ: scheduler (@Cron), SMTP/SMS ve production
// DB başlatılmaz. Yalnız `TenantModule` + test-only controller + test-only `request.user`
// yerleştirici guard + gerçek HTTP adapter kullanılır.
//
// PRODUCTION BYPASS YOKTUR: muafiyet dekoratörü, header veya flag mekanizması EKLENMEMİŞTİR.
// Buradaki guard YALNIZ bu spec dosyasında tanımlıdır ve production'a hiç girmez.
import {
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Global,
  Head,
  Injectable,
  Module,
  Options,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";

import { PrismaService } from "@/prisma/prisma.service";
import { TenantModule } from "../tenant.module";
import { TENANT_LIFECYCLE_FORBIDDEN_MESSAGE } from "../tenant-lifecycle.interceptor";
import { TENANT_LIFECYCLE_STATES } from "../tenant-lifecycle";

/** Test boyunca değiştirilen `request.user`; her testte açıkça set edilir. */
let currentUser: unknown = undefined;

/** TEST-ONLY: gerçek JwtAuthGuard yerine `request.user`'ı yerleştirir (DB/JWT yok). */
@Injectable()
class TestUserInjectorGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest().user = currentUser;
    return true;
  }
}

/** TEST-ONLY uç: her HTTP metodu için aynı gövde. */
@Controller("t")
@UseGuards(TestUserInjectorGuard)
class TestOnlyController {
  @Get() get() { return { ok: true }; }
  @Head() head() { return { ok: true }; }
  @Options() options() { return { ok: true }; }
  @Post() post() { return { ok: true }; }
  @Put() put() { return { ok: true }; }
  @Patch() patch() { return { ok: true }; }
  @Delete() delete() { return { ok: true }; }
}

/** PrismaService stub'ı — gerçek DB bağlantısı AÇILMAZ. */
@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class StubPrismaModule {}

const aktif = (over: Record<string, unknown> = {}) => ({
  id: "u1",
  tenantId: "t1",
  role: "ADMIN",
  isActive: true,
  tenant: { id: "t1", slug: "s", lifecycle: "ACTIVE" },
  ...over,
});

describe("C15-S1-MODIFIED PR-2 — TenantLifecycleInterceptor gerçek HTTP pipeline", () => {
  let app: any;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [StubPrismaModule, TenantModule],
      controllers: [TestOnlyController],
      providers: [TestUserInjectorGuard],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await moduleRef?.close();
  });

  beforeEach(() => {
    currentUser = undefined;
  });

  describe("no-op olması GEREKEN yollar", () => {
    it("public POST — request.user YOK → geçer (birincil kontrol auth katmanındadır)", async () => {
      currentUser = undefined;
      await request(app.getHttpServer()).post("/t").expect(201);
    });

    it("ACTIVE kullanıcı + mutation → geçer (mevcut davranış DEĞİŞMEZ)", async () => {
      currentUser = aktif();
      await request(app.getHttpServer()).post("/t").expect(201);
      await request(app.getHttpServer()).put("/t").expect(200);
      await request(app.getHttpServer()).patch("/t").expect(200);
      await request(app.getHttpServer()).delete("/t").expect(200);
    });

    it.each(["ACTIVE", ...TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE")])(
      "GET/HEAD/OPTIONS interceptor tarafından ENGELLENMEZ (lifecycle=%s)",
      async (state) => {
        currentUser = aktif({ tenant: { id: "t1", lifecycle: state } });
        await request(app.getHttpServer()).get("/t").expect(200);
        await request(app.getHttpServer()).head("/t").expect(200);
        await request(app.getHttpServer()).options("/t").expect(200);
      },
    );
  });

  describe("403 vermesi GEREKEN yollar", () => {
    it.each(TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE"))(
      "lifecycle=%s + mutation → 403",
      async (state) => {
        currentUser = aktif({ tenant: { id: "t1", lifecycle: state } });
        for (const m of ["post", "put", "patch", "delete"] as const) {
          const res = await request(app.getHttpServer())[m]("/t");
          expect(res.status).toBe(403);
        }
      },
    );

    it.each([
      ["lifecycle alanı YOK", { id: "t1", slug: "s" }],
      ["lifecycle null", { id: "t1", lifecycle: null }],
      ["lifecycle küçük harf", { id: "t1", lifecycle: "active" }],
      ["lifecycle bilinmeyen", { id: "t1", lifecycle: "ARCHIVED" }],
      ["lifecycle sayı", { id: "t1", lifecycle: 1 }],
      ["lifecycle nesne", { id: "t1", lifecycle: { v: "ACTIVE" } }],
      ["tenant null", null],
      ["tenant YOK", undefined],
    ])("FAIL-CLOSED: %s → 403 (500 DEĞİL)", async (_ad, tenant) => {
      currentUser = aktif({ tenant });
      const res = await request(app.getHttpServer()).post("/t");
      expect(res.status).toBe(403);
    });

    it.each([
      ["user boş nesne", {}],
      ["user string", "bozuk"],
      ["user sayı", 42],
      ["user dizi", []],
      ["user true", true],
    ])("MALFORMED request.user (%s) → 403, 500 ÜRETMEZ", async (_ad, user) => {
      currentUser = user;
      const res = await request(app.getHttpServer()).post("/t");
      expect(res.status).toBe(403);
      expect(res.status).not.toBe(500);
    });
  });

  describe("hata sözleşmesi", () => {
    it("mesaj SABİTTİR ve hiçbir lifecycle DEĞERİ/adı sızmaz", async () => {
      for (const state of TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE")) {
        currentUser = aktif({ tenant: { id: "t1", lifecycle: state } });
        const res = await request(app.getHttpServer()).post("/t");
        expect(res.status).toBe(403);
        expect(res.body.message).toBe(TENANT_LIFECYCLE_FORBIDDEN_MESSAGE);

        const govde = JSON.stringify(res.body).toLowerCase();
        for (const s of TENANT_LIFECYCLE_STATES) {
          expect(govde).not.toContain(s.toLowerCase());
        }
        expect(govde).not.toContain("lifecycle");
        expect(govde).not.toContain("tenant");
      }
    });
  });

  describe("pipeline kanıtı", () => {
    it("APP_INTERCEPTOR kaydı GLOBAL çalışır: controller'a hiçbir interceptor bağlanmadı", async () => {
      // Test controller'ında @UseInterceptors YOKTUR; buna rağmen 403 üretiliyorsa
      // interceptor uygulama genelinde kayıtlı demektir. @Global() gerekmediğinin kanıtı.
      currentUser = aktif({ tenant: { id: "t1", lifecycle: "SUSPENDED" } });
      await request(app.getHttpServer()).post("/t").expect(403);
    });

    it("interceptor guard'DAN SONRA çalışır: guard'ın koyduğu user görülür", async () => {
      // Guard user'ı ACTIVE koyarsa geçer, non-ACTIVE koyarsa 403 —
      // yani interceptor guard'ın YAZDIĞI değeri okuyor.
      currentUser = aktif();
      await request(app.getHttpServer()).post("/t").expect(201);
      currentUser = aktif({ tenant: { id: "t1", lifecycle: "RETIRED" } });
      await request(app.getHttpServer()).post("/t").expect(403);
    });
  });
});
