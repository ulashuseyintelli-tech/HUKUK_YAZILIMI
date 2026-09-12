// REGRESYON (B-I11-3): public intake yolundaki HAM TOKEN hata kayıt hattının HİÇBİR alanına
// düz metin yazılmamalı; tanılama için rota ŞEKLİ korunmalı.
//
// KUSURUN ÖLÇÜLDÜĞÜ HÂL: `GET /api/public/intake/<ham token>` ucunun hız sınırı Redis'e bağlıdır ve
// Redis'e ulaşılamadığında FAIL-CLOSED 503 döner (`PublicIntakeRateLimitGuard`). 503 global filtreye
// düştüğünde `endpoint = req.url` olarak yazılıyor, yani token `ErrorLog` satırında düz metin
// kalıyordu. O token hedef tenant'ta ANONİM YAZMA yetkisi verir
// (`ClientIntakePublicService.validateActiveLink` yalnız status/expiresAt/useCount bakar).
//
// BU TEST GERÇEK YOLU SÜRER: gerçek `AllExceptionsFilter` → gerçek `buildServerLogEntry` → gerçek
// `redactPii` → gerçek `ErrorLogService.log` (yalnız Prisma taklit edilir). Sağlık kapısı
// (K-INTAKE) bu onarımın YERİNE GEÇMEZ: kapı yalnız kabul koşumunu korur, ürün kusurunu kapatmaz.
import { ServiceUnavailableException, NotFoundException } from "@nestjs/common";
import { AllExceptionsFilter } from "../filters/all-exceptions.filter";
import { ErrorFloodGuard } from "../internal/error-flood-guard";
import { ErrorLogService } from "../error-log.service";
import { redactPii, redactSecretPathSegments, sanitizeMetadata } from "../error-log.sanitize";
import { buildClientLogEntry } from "../error-log.sanitize";

/** SENTETİK token — gerçek bir bağlantıya ait DEĞİL; yalnız bu testte üretilir. */
const SYNTHETIC_TOKEN = "sYn7h3t1c_TEST_t0k3n_AAAAAAAAAAAAAAAA";
const OTHER_TOKEN = "sYn7h3t1c_TEST_t0k3n_BBBBBBBBBBBBBBBB";
const PATH = `/api/public/intake/${SYNTHETIC_TOKEN}`;
const REDACTED_PATH = "/api/public/intake/:token";

function mockRes() {
  const res: any = { headersSent: false };
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}
function host(req: any, res: any) {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as any;
}
/** Bir nesnenin TÜM string alanlarında (iç içe dahil) token aranır. */
function containsToken(value: unknown, token = SYNTHETIC_TOKEN): boolean {
  if (typeof value === "string") return value.includes(token);
  if (Array.isArray(value)) return value.some((v) => containsToken(v, token));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((v) => containsToken(v, token));
  }
  return false;
}

describe("B-I11-3 — public intake ham token'i hata kaydina YAZILMAZ", () => {
  describe("saf maskeleme", () => {
    it("rota SEKLI korunur, DEGER maskelenir", () => {
      expect(redactSecretPathSegments(PATH)).toBe(REDACTED_PATH);
      expect(redactPii(PATH)).toBe(REDACTED_PATH);
    });

    it("sorgu dizesi ve devam eden yol token'i bitirir", () => {
      expect(redactPii(`${PATH}?x=1`)).toBe(`${REDACTED_PATH}?x=1`);
      expect(redactPii(`GET ${PATH} 503`)).toBe(`GET ${REDACTED_PATH} 503`);
    });

    it("ilgisiz metin AYNEN kalir (asiri maskeleme yok)", () => {
      expect(redactPii("/api/cases/abc123")).toBe("/api/cases/abc123");
      expect(redactPii("/api/public/intake")).toBe("/api/public/intake");
      expect(redactSecretPathSegments(undefined)).toBeUndefined();
    });
  });

  describe("GERCEK filtre hatti (503 — olculen kusur senaryosu)", () => {
    it("hicbir kayit alaninda ham token YOK; endpoint rota sekli", () => {
      const svc = { log: jest.fn().mockResolvedValue({}) } as any;
      const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
      const res = mockRes();

      filter.catch(
        new ServiceUnavailableException("Form geçici olarak kullanılamıyor."),
        host({ url: PATH, method: "GET", requestId: "req-1" }, res),
      );

      expect(svc.log).toHaveBeenCalledTimes(1);
      const entry = svc.log.mock.calls[0][0];
      expect(entry.endpoint).toBe(REDACTED_PATH);
      expect(containsToken(entry)).toBe(false); // message · stack · metadata dahil TUM alanlar
      expect(res.status).toHaveBeenCalledWith(503); // yanit davranisi DEGISMEDI
    });

    it("stack icinde URL gecse bile maskelenir", () => {
      const svc = { log: jest.fn().mockResolvedValue({}) } as any;
      const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
      const err = new Error(`upstream failed for ${PATH}`);
      err.stack = `Error: upstream failed for ${PATH}\n    at handler (${PATH}:1:1)`;

      filter.catch(err, host({ url: PATH, method: "GET" }, mockRes()));

      const entry = svc.log.mock.calls[0][0];
      expect(containsToken(entry)).toBe(false);
      expect(entry.message).toContain(REDACTED_PATH);
      expect(entry.stack).toContain(REDACTED_PATH);
    });

    it("KONSOL satirinda da ham token YOK", () => {
      const svc = { log: jest.fn().mockResolvedValue({}) } as any;
      const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
      const spy = jest
        .spyOn((filter as any).fallback, "error")
        .mockImplementation(() => undefined);

      filter.catch(new ServiceUnavailableException("x"), host({ url: PATH, method: "GET" }, mockRes()));

      const printed = spy.mock.calls.map((c) => String(c[0])).join("\n");
      expect(printed).not.toContain(SYNTHETIC_TOKEN);
      expect(printed).toContain(REDACTED_PATH);
      spy.mockRestore();
    });

    it("404 (gecersiz/iptal edilmis token) zaten LOGLANMAZ", () => {
      const svc = { log: jest.fn().mockResolvedValue({}) } as any;
      const filter = new AllExceptionsFilter(svc, new ErrorFloodGuard());
      filter.catch(new NotFoundException("Bağlantı geçersiz."), host({ url: PATH, method: "GET" }, mockRes()));
      expect(svc.log).not.toHaveBeenCalled();
    });
  });

  describe("GERCEK ErrorLogService.log (Prisma taklit) — KALICI satir", () => {
    function serviceWithCapture() {
      const captured: any[] = [];
      const prisma: any = {
        errorLog: {
          upsert: jest.fn(async (args: any) => {
            captured.push(args);
            return { id: "e1" };
          }),
        },
      };
      return { svc: new ErrorLogService(prisma), captured };
    }

    it("DB'ye giden data.endpoint maskelidir ve satirda token YOK", async () => {
      const { svc, captured } = serviceWithCapture();
      const filter = new AllExceptionsFilter(svc as any, new ErrorFloodGuard());

      filter.catch(new ServiceUnavailableException("Form geçici olarak kullanılamıyor."), host({ url: PATH, method: "GET" }, mockRes()));
      await new Promise((r) => setImmediate(r)); // filter fire-and-forget

      expect(captured).toHaveLength(1);
      expect(captured[0].create.endpoint).toBe(REDACTED_PATH);
      expect(containsToken(captured[0])).toBe(false);
    });

    it("FARKLI token'lar AYNI dedupe anahtarini uretir (satir patlamasi kapandi)", async () => {
      const { svc, captured } = serviceWithCapture();
      const filter = new AllExceptionsFilter(svc as any, new ErrorFloodGuard());
      const ex = () => new ServiceUnavailableException("Form geçici olarak kullanılamıyor.");

      filter.catch(ex(), host({ url: `/api/public/intake/${SYNTHETIC_TOKEN}`, method: "GET" }, mockRes()));
      filter.catch(ex(), host({ url: `/api/public/intake/${OTHER_TOKEN}`, method: "GET" }, mockRes()));
      await new Promise((r) => setImmediate(r));

      expect(captured).toHaveLength(2);
      expect(captured[0].where.activeDedupeKey).toBe(captured[1].where.activeDedupeKey);
      expect(containsToken(captured[1], OTHER_TOKEN)).toBe(false);
    });
  });

  describe("ISTEMCI (FRONTEND) hatti da kapali", () => {
    it("buildClientLogEntry endpoint'i maskeler", () => {
      const entry = buildClientLogEntry({ message: `hata: ${PATH}`, endpoint: PATH, statusCode: 503 }, {});
      expect(entry.endpoint).toBe(REDACTED_PATH);
      expect(containsToken(entry)).toBe(false);
    });

    it("metadata.route (whitelist) maskelenir", () => {
      const meta = sanitizeMetadata({ route: PATH, method: "GET" });
      expect(meta?.route).toBe(REDACTED_PATH);
      expect(containsToken(meta)).toBe(false);
    });
  });
});
