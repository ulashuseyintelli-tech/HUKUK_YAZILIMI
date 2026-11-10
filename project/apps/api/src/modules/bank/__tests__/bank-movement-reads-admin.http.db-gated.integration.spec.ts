// Belge modülleri grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { A_CASE_KEYS, ACaseKey, ScopeWorld, buildScopeApp, createScopeWorld, scopeFlag, scopeHttp } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CASE_VIEW_ALL_KEY } from "../../case/case-view-scope";
import { BankModule } from "../bank.module";

/**
 * F02 P3 K1 (owner kararı 11.11.2026) — banka HAREKET okumaları mevcut ADMIN rolüyle sınırlıdır:
 *   GET /bank/accounts/:id/transactions · GET /bank/transactions/unmatched · GET /bank/stats (hareket sayıları + gelen / giden toplamı).
 * Yeni muhasebe izni YOK. Kiracı sınırı (servis) ve P3 maskelemesi (hesap hareketleri: bayrak açıkken ham yük dönmez; eşleşen dosya /
 * tahsilat kimliği yalnız dosya görünüyorsa döner) aynen korunur. Hesap listesi ve bakiye okumaları DEĞİŞMEZ.
 * Rol her istekte DB'den okunan GÜNCEL roldür (kimlik kapısı DB kullanıcısını yükler; AdminGuard `req.user.role` okur).
 * Gerçek HTTP + tek kullanımlık PostgreSQL.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Bank movement reads ADMIN gate requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

const ADMIN_REQUIRED = { statusCode: 403, message: "Bu işlem için ADMIN yetkisi gerekir", error: "Forbidden" };
const ACCOUNT_NOT_FOUND = { statusCode: 404, message: "Hesap bulunamadı", error: "Not Found" };

describeDb("F02 P3 K1 — banka hareket okumaları yalnız ADMIN (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(600_000);
  const flag = scopeFlag();
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const http = scopeHttp(() => app);
  const mark = (kind: string, k: string) => `${kind}-${k}-${w.suffix}`;
  const text = (res: request.Response) => JSON.stringify(res.body ?? {});
  const tx = {} as Record<string, string>;
  const admin = { link: "", allow: "", b: "" };
  let accountA = "";
  let accountB = "";
  const past = new Date(Date.now() - 24 * 3600 * 1000);

  type Tx = { id: string; matchedCaseId: string | null; matchedCollectionId: string | null; rawData?: unknown; counterpartyName?: string };
  const rows = (res: request.Response) => res.body as Tx[];
  const MOVEMENT_READS = () => [
    ["GET bank/accounts/:id/transactions", `/bank/accounts/${accountA}/transactions`],
    ["GET bank/transactions/unmatched", `/bank/transactions/unmatched`],
    ["GET bank/stats", `/bank/stats`],
  ] as const;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [BankModule]);
    w = await createScopeWorld(db, "bank-admin");

    // Ek ADMIN aktörleri (yalnız bu spec): c4'e CaseLawyer ilişkili ADMIN · büro geneli izinli (ALLOW) ADMIN · büro B ADMIN'i.
    const mkAdmin = async (tenantId: string, key: string) =>
      (await db.user.create({ data: { tenantId, email: `k1-ek-admin-${key}-${w.suffix}@example.test`, name: key, surname: "K1", role: "ADMIN" } })).id;
    admin.link = await mkAdmin(w.tA, "link");
    admin.allow = await mkAdmin(w.tA, "allow");
    admin.b = await mkAdmin(w.tB, "b");
    const lawyer = await db.lawyer.create({ data: { tenantId: w.tA, userId: admin.link, name: "Av", surname: "K1", isActive: true } });
    await db.caseLawyer.create({ data: { caseId: w.c.c4, lawyerId: lawyer.id } });
    await db.permissionGrant.create({ data: { tenantId: w.tA, subjectUserId: admin.allow, permissionKey: CASE_VIEW_ALL_KEY, effect: "ALLOW", scope: "GLOBAL" } });

    accountA = (await db.bankAccount.create({ data: { tenantId: w.tA, bankCode: "0001", bankName: "Test Bankası", iban: `TRA${w.suffix}`, ownerType: "OFFICE", ownerName: "Büro A" } as never })).id;
    accountB = (await db.bankAccount.create({ data: { tenantId: w.tB, bankCode: "0001", bankName: "Test Bankası", iban: `TRB${w.suffix}`, ownerType: "OFFICE", ownerName: "Büro B" } as never })).id;
    for (const k of A_CASE_KEYS) {
      tx[k] = (
        await db.bankTransaction.create({
          data: { tenantId: w.tA, bankAccountId: accountA, transactionDate: past, amount: 100, currency: "TRY", transactionType: "INCOMING", isMatched: true, matchedCaseId: w.c[k], matchedCollectionId: mark("TAHSILAT", k), rawData: { ham: mark("HAM", k) }, counterpartyName: mark("KARSI", k) } as never,
        })
      ).id;
    }
    tx.unmatched = (await db.bankTransaction.create({ data: { tenantId: w.tA, bankAccountId: accountA, transactionDate: past, amount: 50, currency: "TRY", transactionType: "INCOMING", rawData: { ham: mark("HAM", "eslesmemis") }, counterpartyName: mark("KARSI", "eslesmemis") } as never })).id;
    tx.b = (await db.bankTransaction.create({ data: { tenantId: w.tB, bankAccountId: accountB, transactionDate: past, amount: 7, currency: "TRY", transactionType: "INCOMING", rawData: { ham: mark("HAM", "b") }, counterpartyName: mark("KARSI", "b") } as never })).id;
  });

  afterAll(async () => {
    flag.restore();
    await w.cleanup(async (tenantIds) => {
      for (const tenantId of tenantIds) {
        await db.bankTransaction.deleteMany({ where: { tenantId } }).catch(() => undefined);
        await db.bankAccount.deleteMany({ where: { tenantId } }).catch(() => undefined);
      }
    });
    await app?.close();
    await db.$disconnect();
  });

  it("ADMIN olmayan her rol (USER, VIEWER, büro geneli izinli USER, iki büro) üç hareket okumasında 403 alır; bayraktan bağımsız; veri sızmaz", async () => {
    const nonAdmins: Array<[string, string]> = [
      ...w.visibility.filter(([, actor]) => actor !== w.u.admin).map(([label, actor]) => [label, actor] as [string, string]),
      ["VIEWER", w.u.viewer],
      ["büro B ALLOW", w.v.allow],
      ["büro B ilişkisiz", w.v.nobody],
    ];
    for (const on of [false, true]) {
      on ? flag.on() : flag.off();
      for (const [label, actor] of nonAdmins) {
        for (const [route, path] of MOVEMENT_READS()) {
          const res = await http.get(actor, path);
          expect([on, label, route, res.status, res.body]).toEqual([on, label, route, 403, ADMIN_REQUIRED]);
          expect([on, label, route, text(res).includes("HAM-"), text(res).includes("KARSI-")]).toEqual([on, label, route, false, false]);
        }
      }
    }
  });

  it("kimliksiz istek 401", async () => {
    for (const [route, path] of MOVEMENT_READS()) expect([route, (await http.anonymous(path)).status]).toEqual([route, 401]);
  });

  it("hesap listesi ve bakiye okumaları DEĞİŞMEDİ: ADMIN olmayan kullanıcı rol kapısına takılmaz", async () => {
    flag.off();
    const list = await http.get(w.u.nobody, `/bank/accounts`);
    expect(list.status).toBe(200);
    expect((list.body as Array<{ id: string }>).map((a) => a.id)).toEqual([accountA]);
    const balance = await http.get(w.u.nobody, `/bank/accounts/${accountA}/balance`);
    expect(balance.status).toBe(503); // entegrasyonsuz hesap: bugünkü yanıt (rol reddi DEĞİL)
  });

  it("bayrak kapalı: ADMIN bugünkü yanıtları alır (ham yük, eşleşen dosya kimliği, eşleşmemiş hareket, istatistik)", async () => {
    flag.off();
    const res = await http.get(w.u.admin, `/bank/accounts/${accountA}/transactions`);
    expect([res.status, rows(res).length]).toEqual([200, A_CASE_KEYS.length + 1]);
    const c6 = rows(res).find((x) => x.id === tx.c6)!;
    expect([c6.matchedCaseId, c6.matchedCollectionId, JSON.stringify(c6.rawData)]).toEqual([w.c.c6, mark("TAHSILAT", "c6"), JSON.stringify({ ham: mark("HAM", "c6") })]);
    const unmatched = await http.get(w.u.admin, `/bank/transactions/unmatched`);
    expect([unmatched.status, (unmatched.body as Tx[]).map((x) => x.id)]).toEqual([200, [tx.unmatched]]);
    const stats = await http.get(w.u.admin, `/bank/stats`);
    expect([stats.status, stats.body]).toEqual([200, { totalAccounts: 1, integratedAccounts: 0, totalTransactions: A_CASE_KEYS.length + 1, unmatchedTransactions: 1, totalIncoming: 100 * A_CASE_KEYS.length + 50, totalOutgoing: 0 }]);
  });

  it("bayrak açık: ADMIN için P3 maskelemesi aynen — satırlar süzülmez, ham yük dönmez, dosya / tahsilat kimliği yalnız görünen dosyada", async () => {
    flag.on();
    const cases: Array<[string, string, ACaseKey[]]> = [
      ["ADMIN (ilişki / izin yok)", w.u.admin, []],
      ["ADMIN + c4 CaseLawyer", admin.link, ["c4"]],
      ["ADMIN + büro geneli ALLOW", admin.allow, [...A_CASE_KEYS]],
    ];
    for (const [label, actor, visible] of cases) {
      const res = await http.get(actor, `/bank/accounts/${accountA}/transactions`);
      expect([label, res.status, rows(res).length]).toEqual([label, 200, A_CASE_KEYS.length + 1]);
      expect([label, text(res).includes("HAM-"), rows(res).some((x) => "rawData" in x)]).toEqual([label, false, false]);
      for (const k of A_CASE_KEYS) {
        const row = rows(res).find((x) => x.id === tx[k])!;
        const sees = visible.includes(k);
        expect([label, k, row.matchedCaseId, row.matchedCollectionId]).toEqual([label, k, sees ? w.c[k] : null, sees ? mark("TAHSILAT", k) : null]);
        expect([label, k, row.counterpartyName]).toEqual([label, k, mark("KARSI", k)]); // muhasebe alanı korunur
        if (!sees) expect([label, k, text(res).includes(w.c[k])]).toEqual([label, k, false]);
      }
      // eşleşmemiş hareketler ve istatistik bugünkü gibi (P3 süzgeci bu uçlarda yok; yalnız ADMIN kapısı eklendi)
      expect([label, (await http.get(actor, `/bank/transactions/unmatched`)).status]).toEqual([label, 200]);
      expect([label, (await http.get(actor, `/bank/stats`)).status]).toEqual([label, 200]);
    }
  });

  it("kiracı sınırı bayraktan bağımsız: başka büronun ADMIN'i A hesabını göremez; eşleşmemiş ve istatistik yalnız kendi bürosu", async () => {
    for (const on of [false, true]) {
      on ? flag.on() : flag.off();
      expect([on, (await http.get(admin.b, `/bank/accounts/${accountA}/transactions`)).body]).toEqual([on, ACCOUNT_NOT_FOUND]);
      expect([on, (await http.get(w.u.admin, `/bank/accounts/${accountB}/transactions`)).body]).toEqual([on, ACCOUNT_NOT_FOUND]);
      expect([on, (await http.get(w.u.admin, `/bank/accounts/${w.missing}/transactions`)).body]).toEqual([on, ACCOUNT_NOT_FOUND]);
      const unmatchedB = await http.get(admin.b, `/bank/transactions/unmatched`);
      expect([on, unmatchedB.status, (unmatchedB.body as Tx[]).map((x) => x.id)]).toEqual([on, 200, [tx.b]]);
      expect([on, text(unmatchedB).includes(`HAM-eslesmemis-${w.suffix}`)]).toEqual([on, false]);
      const statsB = await http.get(admin.b, `/bank/stats`);
      expect([on, statsB.status, (statsB.body as { totalTransactions: number }).totalTransactions, (statsB.body as { totalIncoming: number }).totalIncoming]).toEqual([on, 200, 1, 7]);
    }
  });

  it("rol GÜNCEL DB rolüdür: ADMIN rolü düşürülen kullanıcı bir sonraki istekte 403 alır", async () => {
    flag.off();
    expect((await http.get(admin.link, `/bank/stats`)).status).toBe(200);
    await db.user.update({ where: { id: admin.link }, data: { role: "USER" } });
    try {
      expect((await http.get(admin.link, `/bank/stats`)).body).toEqual(ADMIN_REQUIRED);
    } finally {
      await db.user.update({ where: { id: admin.link }, data: { role: "ADMIN" } });
    }
  });
});
