// C15-S1-MODIFIED · PR-2 — tenant lifecycle yaptırımı (login + validateUser).
//
// Bu suite YALNIZ yaptırımı kilitler. Kontrol düzlemi, worker ve quiesce PR-2 kapsamı
// DIŞINDADIR. Owner düzeltmesi gereği SIRA da kanıtlanır: lifecycle kontrolü bcrypt
// karşılaştırmasından SONRA yapılmalıdır; önce yapılırsa mesaj aynı kalsa bile
// ACTIVE/non-ACTIVE ayrımı ZAMANLAMA üzerinden sızar.
import { UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { AuthService } from "../auth.service";
import { TENANT_LIFECYCLE_STATES } from "../../tenant/tenant-lifecycle";

const GENERIC = "Geçersiz e-posta veya şifre";
const PASSWORD = "correct-horse-battery";
const HASH = bcrypt.hashSync(PASSWORD, 10);

/** ACTIVE dışındaki dört durum — hepsi login'i ve JWT'yi reddetmeli. */
const NON_ACTIVE = TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE");

type TenantOverride = Record<string, unknown> | undefined;

function makeSvc(lifecycle: unknown, opts: { isActive?: boolean; tenant?: TenantOverride } = {}) {
  const tenant =
    opts.tenant !== undefined
      ? opts.tenant
      : { id: "t1", slug: "tenant-one", name: "Tenant One", lifecycle };

  const row = {
    id: "u1",
    tenantId: "t1",
    email: "a@x.com",
    passwordHash: HASH,
    name: "AD",
    surname: "SOYAD",
    role: "ADMIN",
    isActive: opts.isActive ?? true,
    tokenVersion: 0,
    tenant,
  };

  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(row),
      findUnique: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as any;
  const jwt = { sign: jest.fn().mockReturnValue("jwt-token") } as any;
  return { svc: new AuthService(prisma, jwt), jwt, prisma, row };
}

const LOGIN_DTO = { email: "a@x.com", password: PASSWORD, tenantSlug: "tenant-one" } as any;

/**
 * Sizinti denetimi: hata govdesi (a) TUM lifecycle degerlerinden hicbirini,
 * (b) "lifecycle"/"tenant" kelimelerini case-insensitive ICERMEZ ve (c) status TAM 401'dir.
 */
function assertNoLifecycleLeak(err: UnauthorizedException): void {
  expect(err).toBeInstanceOf(UnauthorizedException);
  expect(err.getStatus()).toBe(401);
  const govde = JSON.stringify(err.getResponse()) + "|" + String(err.message);
  const lower = govde.toLowerCase();
  for (const state of TENANT_LIFECYCLE_STATES) {
    expect(lower).not.toContain(state.toLowerCase());
  }
  expect(lower).not.toContain("lifecycle");
  expect(lower).not.toContain("tenant");
}

async function capture(fn: () => Promise<unknown>): Promise<UnauthorizedException> {
  try {
    await fn();
  } catch (e) {
    return e as UnauthorizedException;
  }
  throw new Error("beklenen UnauthorizedException fırlatılmadı");
}

afterEach(() => jest.restoreAllMocks());

describe("C15-S1-MODIFIED PR-2 — login() lifecycle yaptırımı", () => {
  it("[REGRESYON] ACTIVE tenant → login başarılı, davranış değişmedi", async () => {
    const { svc, jwt } = makeSvc("ACTIVE");
    const r: any = await svc.login(LOGIN_DTO);
    expect(r.token).toBe("jwt-token");
    expect(jwt.sign).toHaveBeenCalledTimes(1);
  });

  it.each(NON_ACTIVE)("%s → doğru parolayla bile generic 401", async (state) => {
    const { svc } = makeSvc(state);
    const err = await capture(() => svc.login(LOGIN_DTO));
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect(err.message).toBe(GENERIC);
  });

  it.each(NON_ACTIVE)("%s → JWT İMZALAMA ÇAĞRILMAZ", async (state) => {
    const { svc, jwt } = makeSvc(state);
    await capture(() => svc.login(LOGIN_DTO));
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it.each(NON_ACTIVE)(
    "%s → bcrypt.compare ÇAĞRILIR (lifecycle kontrolü paroladan SONRA; zamanlama sızıntısı yok)",
    async (state) => {
      const spy = jest.spyOn(bcrypt, "compare");
      const { svc } = makeSvc(state);
      await capture(() => svc.login(LOGIN_DTO));
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(PASSWORD, HASH);
    },
  );

  it("YANLIŞ parola → HER lifecycle durumunda AYNI generic 401 (ayırt edilemez)", async () => {
    const mesajlar: string[] = [];
    for (const state of TENANT_LIFECYCLE_STATES) {
      const { svc } = makeSvc(state);
      const err = await capture(() =>
        svc.login({ ...LOGIN_DTO, password: "yanlis-parola" } as any),
      );
      mesajlar.push(err.message);
    }
    expect(new Set(mesajlar).size).toBe(1);
    expect(mesajlar[0]).toBe(GENERIC);
  });

  it("ROL İSTİSNASI YOK — ADMIN/USER/VIEWER üçü de non-ACTIVE'de aynı 401", async () => {
    for (const role of ["ADMIN", "USER", "VIEWER"]) {
      for (const state of NON_ACTIVE) {
        const { svc, prisma, jwt } = makeSvc(state);
        const row = await prisma.user.findFirst();
        prisma.user.findFirst.mockResolvedValue({ ...row, role });
        const err = await capture(() => svc.login(LOGIN_DTO));
        expect(err.message).toBe(GENERIC);
        expect(jwt.sign).not.toHaveBeenCalled();
      }
    }
  });

  it("FAIL-CLOSED: lifecycle eksik / null / bilinmeyen değer → generic 401", async () => {
    for (const tenant of [
      { id: "t1", slug: "tenant-one" }, // lifecycle alanı YOK
      { id: "t1", slug: "tenant-one", lifecycle: null },
      { id: "t1", slug: "tenant-one", lifecycle: "active" }, // küçük harf
      { id: "t1", slug: "tenant-one", lifecycle: "ARCHIVED" }, // bilinmeyen
      null, // tenant ilişkisi hiç yok
    ] as TenantOverride[]) {
      const { svc, jwt } = makeSvc(undefined, { tenant });
      const err = await capture(() => svc.login(LOGIN_DTO));
      expect(err.message).toBe(GENERIC);
      expect(jwt.sign).not.toHaveBeenCalled();
    }
  });

  it("non-ACTIVE + pasif kullanıcı → 'devre dışı' mesajı DEĞİL, generic mesaj (dolaylı sızıntı yok)", async () => {
    const { svc } = makeSvc("SUSPENDED", { isActive: false });
    const err = await capture(() => svc.login(LOGIN_DTO));
    expect(err.message).toBe(GENERIC);
  });

  it("HATA GÖVDESİ: hiçbir lifecycle DEĞERİ sızmaz + status TAM 401 (login)", async () => {
    for (const state of TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE")) {
      const { svc } = makeSvc(state);
      assertNoLifecycleLeak(await capture(() => svc.login(LOGIN_DTO)));
    }
    // Fail-closed varyantlar da aynı sözleşmeye tabidir.
    for (const tenant of [undefined, null, { id: "t1", lifecycle: "ARCHIVED" }] as TenantOverride[]) {
      const { svc } = makeSvc(undefined, { tenant });
      assertNoLifecycleLeak(await capture(() => svc.login(LOGIN_DTO)));
    }
  });
});

describe("C15-S1-MODIFIED PR-2 — validateUser() lifecycle yaptırımı", () => {
  it("[REGRESYON] ACTIVE tenant → kullanıcı döner", async () => {
    const { svc } = makeSvc("ACTIVE");
    const u: any = await svc.validateUser("u1", 0);
    expect(u.id).toBe("u1");
  });

  it.each(NON_ACTIVE)("%s → mevcut geçerli JWT bir sonraki istekte 401", async (state) => {
    const { svc } = makeSvc(state);
    const err = await capture(() => svc.validateUser("u1", 0));
    expect(err).toBeInstanceOf(UnauthorizedException);
  });

  it("FAIL-CLOSED: lifecycle eksik / bozuk → 401", async () => {
    for (const tenant of [
      { id: "t1", slug: "tenant-one" },
      { id: "t1", slug: "tenant-one", lifecycle: null },
      { id: "t1", slug: "tenant-one", lifecycle: "ARCHIVED" },
      null,
    ] as TenantOverride[]) {
      const { svc } = makeSvc(undefined, { tenant });
      const err = await capture(() => svc.validateUser("u1", 0));
      expect(err).toBeInstanceOf(UnauthorizedException);
    }
  });

  it("HATA GÖVDESİ: hiçbir lifecycle DEĞERİ sızmaz + status TAM 401 (validateUser)", async () => {
    for (const state of TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE")) {
      const { svc } = makeSvc(state);
      assertNoLifecycleLeak(await capture(() => svc.validateUser("u1", 0)));
    }
    for (const tenant of [undefined, null, { id: "t1", lifecycle: "ARCHIVED" }] as TenantOverride[]) {
      const { svc } = makeSvc(undefined, { tenant });
      assertNoLifecycleLeak(await capture(() => svc.validateUser("u1", 0)));
    }
  });
});
