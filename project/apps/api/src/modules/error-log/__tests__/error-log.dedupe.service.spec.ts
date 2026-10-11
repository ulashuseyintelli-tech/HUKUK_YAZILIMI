import { Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ErrorLogService } from "../error-log.service";
import {
  ERROR_LOG_WRITE_FAILED_EVENT,
  UNKNOWN_ERROR_LABEL,
  classifyErrorLogWriteFailure,
  describeErrorLogWriteFailure,
} from "../internal/error-log-write-failure";

function makePrisma() {
  return {
    errorLog: {
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue({}),
    },
  };
}

const baseEntry = {
  level: "ERROR" as const,
  source: "API",
  message: "boom",
  stack: "at f (/a.ts:1:2)",
  endpoint: "/api/cases/1",
  method: "POST",
  statusCode: 500,
  tenantId: "t1",
  errorName: "Error",
};

describe("ErrorLogService.log — kalıcı dedupe upsert (PR-2b)", () => {
  it("yeni olay → upsert; where.activeDedupeKey 64-hex; create fingerprint+occurrenceCount=1+firstSeenAt+lastSeenAt", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    expect(prisma.errorLog.upsert).toHaveBeenCalledTimes(1);
    const arg = prisma.errorLog.upsert.mock.calls[0][0];
    expect(arg.where.activeDedupeKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.create.occurrenceCount).toBe(1);
    expect(arg.create.firstSeenAt).toBeInstanceOf(Date);
    expect(arg.create.lastSeenAt).toBeInstanceOf(Date);
    expect(arg.create.activeDedupeKey).toBe(arg.where.activeDedupeKey);
    expect(arg.update.occurrenceCount).toEqual({ increment: 1 });
    expect(arg.update.lastSeenAt).toBeInstanceOf(Date);
  });

  it("aynı parametre iki kez → AYNI activeDedupeKey (determinizm)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    await svc.log({ ...baseEntry });
    const k1 = prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey;
    const k2 = prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey;
    expect(k1).toBe(k2);
  });

  it("farklı tenant → farklı activeDedupeKey (kabul #5)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry, tenantId: "t1" });
    await svc.log({ ...baseEntry, tenantId: "t2" });
    expect(prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey).not.toBe(
      prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey,
    );
  });

  it("/cases/123 ve /cases/456 → AYNI activeDedupeKey (kabul #7, endpoint normalize)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry, endpoint: "/api/cases/123" });
    await svc.log({ ...baseEntry, endpoint: "/api/cases/456" });
    expect(prisma.errorLog.upsert.mock.calls[0][0].where.activeDedupeKey).toBe(
      prisma.errorLog.upsert.mock.calls[1][0].where.activeDedupeKey,
    );
  });

  it("P2002 yarış → updateMany increment fallback (kabul #10)", async () => {
    const prisma = makePrisma();
    prisma.errorLog.upsert.mockRejectedValueOnce({ code: "P2002" });
    const svc = new ErrorLogService(prisma as any);
    await svc.log({ ...baseEntry });
    expect(prisma.errorLog.updateMany).toHaveBeenCalledTimes(1);
    const arg = prisma.errorLog.updateMany.mock.calls[0][0];
    expect(arg.where.activeDedupeKey).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.data.occurrenceCount).toEqual({ increment: 1 });
  });

  it("LOGGING ISOLATION: upsert generic hata atarsa log() ATMAZ (undefined döner)", async () => {
    const prisma = makePrisma();
    prisma.errorLog.upsert.mockRejectedValueOnce(new Error("db down"));
    const svc = new ErrorLogService(prisma as any);
    await expect(svc.log({ ...baseEntry })).resolves.toBeUndefined();
    expect(prisma.errorLog.updateMany).not.toHaveBeenCalled();
  });
});

describe("ErrorLogService.resolve — activeDedupeKey null (PR-2b)", () => {
  it("resolve → tenant-scoped updateMany, data.activeDedupeKey=null + isResolved + resolvedBy (kabul #9)", async () => {
    const prisma = makePrisma();
    const svc = new ErrorLogService(prisma as any);
    await svc.resolve("log1", "admin1", "t1", "fixed");
    const arg = prisma.errorLog.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "log1", tenantId: "t1" });
    expect(arg.data.activeDedupeKey).toBeNull();
    expect(arg.data.isResolved).toBe(true);
    expect(arg.data.resolvedBy).toBe("admin1");
    expect(arg.data.resolution).toBe("fixed");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// KR-19: hata kaydı YAZIMI başarısız olduğunda sunucu günlüğü
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Sentetik gizli değerler: bağlantı adresi (kullanıcı + parola), işaret ve sahte günlük satırı (satır sonu). */
const GIZLI_BAGLANTI = "postgresql://kr19_kullanici:Kr19-Parola-9f3a@kr19-db-sunucu:6543/kr19_veritabani?sslmode=require";
const GIZLI_ISARET = "Bearer KR19-GIZLI-ISARET-7c1e55d0";
const SAHTE_SATIR = "\n[Nest] 4242  - ERROR [Sahte] kr19-sahte-gunluk-satiri";
const GIZLI_METIN = `Can't reach database server at ${GIZLI_BAGLANTI} ${GIZLI_ISARET}${SAHTE_SATIR}`;
const GIZLI_KALIP = /kr19_kullanici|Kr19-Parola|kr19-db-sunucu|:6543|kr19_veritabani|postgresql:|KR19-GIZLI-ISARET|Bearer|kr19-sahte-gunluk-satiri|Sahte|Can't reach|sslmode/;

const prismaKnown = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(GIZLI_METIN, { code, clientVersion: "test", meta: { target: GIZLI_BAGLANTI, modelName: GIZLI_ISARET } });
const plainErrorWithEverything = () => {
  const e: any = new Error(GIZLI_METIN);
  e.cause = new Error(GIZLI_METIN);
  e.name = `AdHata ${GIZLI_ISARET}`;
  e.code = `P1001${SAHTE_SATIR}`;
  e.meta = { url: GIZLI_BAGLANTI };
  e.stack = `Error: ${GIZLI_METIN}\n    at baglan (${GIZLI_BAGLANTI})`;
  return e;
};
const throwingGetters = () =>
  Object.defineProperties({}, {
    code: { get() { throw new Error(GIZLI_METIN); } },
    name: { get() { throw new Error(GIZLI_METIN); } },
    message: { get() { throw new Error(GIZLI_METIN); } },
  });

/** Sınıflandırma SIRASINDA atan nesne: `instanceof` prototip zincirini okurken (gizli iletili) hata fırlatır. */
const throwingPrototypeProxy = () => new Proxy({}, { getPrototypeOf() { throw new Error(GIZLI_METIN); } });
/** Prisma sınıfından türemiş görünen, ama `code` erişimcisi (gizli iletili) hata fırlatan nesne. */
const prismaLikeWithThrowingCode = () =>
  Object.create(Prisma.PrismaClientKnownRequestError.prototype, { code: { get() { throw new Error(GIZLI_METIN); } } });

/** [ad, fırlatılan değer, günlüğe yazılması beklenen TAM satır] */
const WRITE_FAILURES: Array<[string, () => unknown, string]> = [
  ["Prisma bilinen istek hatası, listedeki kod (P1001)", () => prismaKnown("P1001"), "error-log write failed (kind=PrismaClientKnownRequestError code=P1001)"],
  ["Prisma bilinen istek hatası, listede OLMAYAN kod (P9999)", () => prismaKnown("P9999"), "error-log write failed (kind=PrismaClientKnownRequestError code=unknown)"],
  ["Prisma bilinen istek hatası, SERBEST METİN kod (gizli değer + satır sonu)", () => prismaKnown(`P1001 ${GIZLI_ISARET}${SAHTE_SATIR}`), "error-log write failed (kind=PrismaClientKnownRequestError code=unknown)"],
  ["Prisma başlatma hatası, listedeki kod", () => new Prisma.PrismaClientInitializationError(GIZLI_METIN, "test", "P1000"), "error-log write failed (kind=PrismaClientInitializationError code=P1000)"],
  ["Prisma başlatma hatası, kodsuz", () => new Prisma.PrismaClientInitializationError(GIZLI_METIN, "test"), "error-log write failed (kind=PrismaClientInitializationError code=unknown)"],
  ["Prisma bilinmeyen istek hatası", () => new Prisma.PrismaClientUnknownRequestError(GIZLI_METIN, { clientVersion: "test" }), "error-log write failed (kind=PrismaClientUnknownRequestError)"],
  ["Prisma motor çökmesi", () => new Prisma.PrismaClientRustPanicError(GIZLI_METIN, "test"), "error-log write failed (kind=PrismaClientRustPanicError)"],
  ["Prisma doğrulama hatası", () => new Prisma.PrismaClientValidationError(GIZLI_METIN, { clientVersion: "test" }), "error-log write failed (kind=PrismaClientValidationError)"],
  ["düz Error: gizli message + stack + cause + meta, serbest metin name ve code", plainErrorWithEverything, "error-log write failed (kind=Error)"],
  ["TypeError (gizli ileti)", () => new TypeError(GIZLI_METIN), "error-log write failed (kind=TypeError)"],
  ["Prisma sınıfı OLMAYAN nesne: name / code / message gizli değer taşır", () => ({ name: "PrismaClientKnownRequestError", code: "P1001", message: GIZLI_METIN, meta: GIZLI_BAGLANTI }), "error-log write failed (kind=unknown)"],
  ["fırlatılan düz metin (gizli değer)", () => GIZLI_METIN, "error-log write failed (kind=unknown)"],
  // servis P2002 denetimi için `code` alanını okur; erişimci orada GİZLİ iletili YENİ bir Error fırlatır → günlüğe o hatanın TÜRÜ yazılır
  ["erişimcileri (gizli iletili) hata fırlatan nesne", throwingGetters, "error-log write failed (kind=Error)"],
  ["sınıflandırma sırasında (prototip okunurken) hata fırlatan vekil nesne", throwingPrototypeProxy, "error-log write failed (kind=unknown)"],
  ["undefined", () => undefined, "error-log write failed (kind=unknown)"],
];

describe("ErrorLogService.log — yazım başarısızlığı günlüğü (KR-19): ham hata nesnesi / ileti / yığın günlüğe gitmez", () => {
  const failingService = (thrown: unknown) => {
    const prisma = makePrisma();
    prisma.errorLog.upsert.mockRejectedValueOnce(thrown);
    return new ErrorLogService(prisma as any);
  };

  it.each(WRITE_FAILURES)("günlük ÇAĞRISI — %s → tek argüman, sabit satır", async (_ad, make, expected) => {
    const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      await expect(failingService(make()).log({ ...baseEntry })).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledTimes(1);
      // TEK argüman: ikinci argüman (ham hata nesnesi / yığın) YOK
      expect(error.mock.calls[0]).toEqual([expected]);
      expect(JSON.stringify(error.mock.calls)).not.toMatch(GIZLI_KALIP);
    } finally {
      error.mockRestore();
    }
  });

  it.each(WRITE_FAILURES)("GERÇEK günlükçü ÇIKTISI — %s → çıktıda sabit satır var, gizli değer / ek satır yok", async (_ad, make, expected) => {
    const chunks: string[] = [];
    const capture = (chunk: unknown) => { chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk as Uint8Array).toString("utf8")); return true; };
    const stderr = jest.spyOn(process.stderr, "write").mockImplementation(capture as any);
    const stdout = jest.spyOn(process.stdout, "write").mockImplementation(capture as any);
    let output = "";
    try {
      await expect(failingService(make()).log({ ...baseEntry })).resolves.toBeUndefined();
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
      output = chunks.join("");
    }
    // pozitif kanıt: yakalama GERÇEKTEN çalıştı — sabit satır çıktıda
    expect(output).toContain(expected);
    expect(output).not.toMatch(GIZLI_KALIP);
    // günlükçü TEK satır üretti (ham nesne / yığın için ikinci satır yok)
    expect(output.split("\n").filter((line) => line.trim().length > 0)).toHaveLength(1);
  });

  it("sınıflandırma — listedeki HER kod kendisi olarak yazılır; liste dışı / biçimi bozuk değerler 'unknown' olur", () => {
    const loggable = ["P1000", "P1001", "P1002", "P1003", "P1008", "P1010", "P1011", "P1017", "P2002", "P2003", "P2021", "P2022", "P2024", "P2025", "P2028", "P2034", "P2037"];
    for (const code of loggable) {
      expect(classifyErrorLogWriteFailure(prismaKnown(code))).toEqual({ kind: "PrismaClientKnownRequestError", code });
    }
    for (const code of ["P9999", "p1001", " P1001", "P1001 ", "P1001\n", "P10011", "", GIZLI_ISARET]) {
      expect(classifyErrorLogWriteFailure(prismaKnown(code))).toEqual({ kind: "PrismaClientKnownRequestError", code: UNKNOWN_ERROR_LABEL });
    }
    // yardımcı, Prisma sınıfı olmayan nesnenin HİÇBİR alanını okumaz: erişimciler ÇAĞRILMAZ, sonuç "unknown"
    const codeGetter = jest.fn(() => GIZLI_METIN);
    const nameGetter = jest.fn(() => GIZLI_METIN);
    const messageGetter = jest.fn(() => GIZLI_METIN);
    const watched = Object.defineProperties({}, { code: { get: codeGetter }, name: { get: nameGetter }, message: { get: messageGetter } });
    expect(classifyErrorLogWriteFailure(watched)).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(codeGetter).not.toHaveBeenCalled();
    expect(nameGetter).not.toHaveBeenCalled();
    expect(messageGetter).not.toHaveBeenCalled();
    // yardımcı HİÇBİR koşulda atmaz: sınıflandırma sırasında fırlatılan hata yutulur, sonuç "unknown" (serbest metin yok)
    expect(classifyErrorLogWriteFailure(throwingPrototypeProxy())).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(classifyErrorLogWriteFailure(prismaLikeWithThrowingCode())).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(describeErrorLogWriteFailure(prismaLikeWithThrowingCode())).toBe("error-log write failed (kind=unknown)");
    expect(classifyErrorLogWriteFailure(throwingGetters())).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(classifyErrorLogWriteFailure({ name: "TypeError", code: "P1001" })).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(classifyErrorLogWriteFailure(null)).toEqual({ kind: UNKNOWN_ERROR_LABEL });
    expect(ERROR_LOG_WRITE_FAILED_EVENT).toBe("error-log write failed");
    expect(describeErrorLogWriteFailure(prismaKnown("P2024"))).toBe("error-log write failed (kind=PrismaClientKnownRequestError code=P2024)");
    // satır tek satırdır ve yalnız sabit karakterlerden oluşur
    for (const [, make] of WRITE_FAILURES) {
      expect(describeErrorLogWriteFailure(make())).toMatch(/^error-log write failed \(kind=[A-Za-z]+( code=(P\d{4}|unknown))?\)$/);
    }
  });

  it("P2002 yarış yolu DEĞİŞMEDİ: updateMany başarılıysa günlük satırı yok; updateMany de başarısızsa TEK güvenli satır", async () => {
    const error = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      const ok = makePrisma();
      ok.errorLog.upsert.mockRejectedValueOnce({ code: "P2002" });
      await new ErrorLogService(ok as any).log({ ...baseEntry });
      expect(ok.errorLog.updateMany).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();

      const bad = makePrisma();
      bad.errorLog.upsert.mockRejectedValueOnce({ code: "P2002" });
      bad.errorLog.updateMany.mockRejectedValueOnce(prismaKnown("P1017"));
      await expect(new ErrorLogService(bad as any).log({ ...baseEntry })).resolves.toBeUndefined();
      expect(error.mock.calls).toEqual([["error-log write failed (kind=PrismaClientKnownRequestError code=P1017)"]]);
    } finally {
      error.mockRestore();
    }
  });
});
