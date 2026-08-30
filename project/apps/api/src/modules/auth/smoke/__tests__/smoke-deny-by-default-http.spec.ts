// C36 — SmokeAuthorizationGuard'ın GERÇEK Nest HTTP pipeline'ında, controller-level
// guard'lardan VE ValidationPipe'tan ÖNCE çalıştığının kanıtı.
//
// NEDEN BU BİÇİM: iddia "APP_GUARD kaydı uygulama genelinde çalışır, controller
// `@UseGuards`'DAN ÖNCEDİR ve pipe'lardan ÖNCE reddeder"dir. Bu birim testiyle
// kanıtlanamaz — gerçek guard→pipe→handler sırası gerekir. Gerçek `AppModule`
// AÇILMAZ: scheduler (@Cron), SMTP/SMS ve production DB başlatılmaz.
//
// PRODUCTION BYPASS YOKTUR: muafiyet header'ı veya flag mekanizması EKLENMEMİŞTİR.
// Buradaki test-only controller YALNIZ bu spec dosyasında tanımlıdır.
import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Global,
  Injectable,
  Module,
  Patch,
  Post,
  Put,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { IsInt } from "class-validator";
import * as request from "supertest";

import { SmokeAllowed } from "../smoke-allowed.decorator";
import { SmokeAuthorizationGuard } from "../smoke-authorization.guard";
import { SmokeTokenService } from "../smoke-token.service";
import { SMOKE_DENIED_MESSAGE } from "../smoke-principal.constants";

const SMOKE_SECRET = "c36-test-smoke-secret-not-a-production-value";
const NORMAL_SECRET = "c36-test-normal-secret-not-a-production-value";

/** Handler'ın GERÇEKTEN çalışıp çalışmadığını ölçer (deny sonrası 0 olmalı). */
let handlerInvocations = 0;

class StrictBodyDto {
  @IsInt()
  mustBeInt!: number;
}

/** TEST-ONLY: controller-level guard. SMOKE reddi BUNDAN ÖNCE olmalıdır. */
@Injectable()
class NeverReachedGuard implements CanActivate {
  static invocations = 0;
  canActivate(_context: ExecutionContext): boolean {
    NeverReachedGuard.invocations += 1;
    return true;
  }
}

/** Metadata TAŞIMAYAN route'lar — fail-closed DENY beklenir. */
@Controller("unlisted")
@UseGuards(NeverReachedGuard)
class UnlistedController {
  @Post() post(@Body() _b: StrictBodyDto) { handlerInvocations += 1; return { ok: true }; }
  @Put() put() { handlerInvocations += 1; return { ok: true }; }
  @Patch() patch() { handlerInvocations += 1; return { ok: true }; }
  @Delete() delete() { handlerInvocations += 1; return { ok: true }; }
  @Get() get() { handlerInvocations += 1; return { ok: true }; }
}

/** Guard'ı HİÇ olmayan route — controller guard'ına bağımlılık olmadığının kanıtı. */
@Controller("naked")
class NakedController {
  @Post() post() { handlerInvocations += 1; return { ok: true }; }
}

/** AÇIKÇA allowlisted route. */
@Controller("listed")
class ListedController {
  @Post()
  @SmokeAllowed()
  post() { handlerInvocations += 1; return { ok: true }; }
}

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        get: (k: string) =>
          k === "JWT_SMOKE_SECRET" ? SMOKE_SECRET : k === "JWT_SECRET" ? NORMAL_SECRET : undefined,
      },
    },
  ],
  exports: [ConfigService],
})
class StubConfigModule {}

describe("C36 — global deny-by-default (gerçek HTTP pipeline)", () => {
  let app: import("@nestjs/common").INestApplication;
  let smokeToken: string;
  let notSmokeToken: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [StubConfigModule],
      controllers: [UnlistedController, NakedController, ListedController],
      providers: [
        SmokeTokenService,
        { provide: APP_GUARD, useClass: SmokeAuthorizationGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Gerçek uygulamadaki gibi global ValidationPipe. SMOKE reddi BUNDAN ÖNCE olmalı.
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const tokens = moduleRef.get(SmokeTokenService);
    smokeToken = tokens.sign({ userId: "u1", smokePrincipalId: "sp1", authGeneration: 0 })!;
    expect(smokeToken).toBeTruthy();

    // Smoke OLMAYAN token: normal secret ile imzalı, smoke claim'i yok.
    const jwt = require("jsonwebtoken");
    notSmokeToken = jwt.sign({ sub: "u2", role: "ADMIN" }, NORMAL_SECRET, { expiresIn: 60 });
  });

  afterAll(async () => { await app?.close(); });

  beforeEach(() => { handlerInvocations = 0; NeverReachedGuard.invocations = 0; });

  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  describe("allowlist TAŞIMAYAN route'lar", () => {
    it.each(["post", "put", "patch", "delete"] as const)(
      "%s /unlisted → smoke token 403 ve handler HİÇ çalışmaz",
      async (method) => {
        const res = await (request(app.getHttpServer()) as any)
          [method]("/unlisted")
          .set(bearer(smokeToken))
          .send({ mustBeInt: 1 });
        expect(res.status).toBe(403);
        expect(res.body.message).toBe(SMOKE_DENIED_MESSAGE);
        expect(handlerInvocations).toBe(0);
      },
    );

    it("GET /unlisted → read yüzeyi de reddedilir", async () => {
      const res = await request(app.getHttpServer()).get("/unlisted").set(bearer(smokeToken));
      expect(res.status).toBe(403);
      expect(handlerInvocations).toBe(0);
    });

    it("controller-level guard SMOKE reddinden SONRA hiç çalışmaz", async () => {
      await request(app.getHttpServer()).post("/unlisted").set(bearer(smokeToken)).send({ mustBeInt: 1 });
      expect(NeverReachedGuard.invocations).toBe(0);
    });

    it("GUARD'I HİÇ OLMAYAN route da reddedilir (controller guard'ına bağımlı DEĞİL)", async () => {
      const res = await request(app.getHttpServer()).post("/naked").set(bearer(smokeToken)).send({});
      expect(res.status).toBe(403);
      expect(handlerInvocations).toBe(0);
    });

    it("GEÇERSİZ gövde ile bile 403 döner — ValidationPipe ÇALIŞMADAN reddedilir", async () => {
      // Kritik ayrım: 400 dönseydi, reddin sebebi SMOKE değil validation olurdu.
      const res = await request(app.getHttpServer())
        .post("/unlisted")
        .set(bearer(smokeToken))
        .send({ mustBeInt: "BU BIR SAYI DEGIL" });
      expect(res.status).toBe(403);
      expect(res.status).not.toBe(400);
      expect(handlerInvocations).toBe(0);
    });
  });

  describe("allowlisted route", () => {
    it("POST /listed → smoke token GEÇER", async () => {
      const res = await request(app.getHttpServer()).post("/listed").set(bearer(smokeToken)).send({});
      expect(res.status).toBe(201);
      expect(handlerInvocations).toBe(1);
    });
  });

  describe("normal trafiğe etki YOK", () => {
    it("token YOKKEN katman no-op'tur", async () => {
      const res = await request(app.getHttpServer()).post("/unlisted").send({ mustBeInt: 1 });
      expect(res.status).toBe(201);
      expect(handlerInvocations).toBe(1);
    });

    it("SMOKE OLMAYAN token katmanı tetiklemez", async () => {
      const res = await request(app.getHttpServer())
        .post("/unlisted")
        .set(bearer(notSmokeToken))
        .send({ mustBeInt: 1 });
      expect(res.status).toBe(201);
      expect(handlerInvocations).toBe(1);
    });

    it("bozuk/anlamsız bearer değeri katmanı tetiklemez", async () => {
      const res = await request(app.getHttpServer())
        .post("/unlisted")
        .set(bearer("bu-gecerli-bir-jwt-degil"))
        .send({ mustBeInt: 1 });
      expect(res.status).toBe(201);
    });
  });
});
