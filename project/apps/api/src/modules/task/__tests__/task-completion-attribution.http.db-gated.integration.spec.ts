// TaskModule grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as request from "supertest";
import { ScopeWorld, buildScopeApp, createScopeWorld, scopeFlag } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { TaskModule } from "../task.module";
import { TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F03-A1 (K-7; OFP-04 ön koşulu) — tamamlama atfı yalnız GERÇEK geçişte yazılır.
 * Önce: zaten COMPLETED olan göreve `status: COMPLETED` yeniden gönderilince (ör. Görevler ekranında başlık düzenleme formu durumu
 * aynen geri gönderir) `completedAt` / `completedByUserId` / `resolutionType` yeniden yazılıyor, işi yapanın atfı EZİLİYORDU.
 * Sözleşme:
 *  - COMPLETED → COMPLETED gidiş-dönüşü atfı ve tamamlanma anını DEĞİŞTİRMEZ (diğer alanlar güncellenir).
 *  - Sistem kapanışı (AUTO_SYSTEM, kapatan yok) insan atfına DÖNÜŞMEZ.
 *  - Yeniden açma atfı temizler; ardından tamamlayan YENİ kişi atfı alır.
 * Gerçek HTTP (TaskModule + ValidationPipe) + tek kullanımlık PostgreSQL; JWT yerine DB kimliği.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task completion attribution spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F03-A1 — tamamlama atfı yalnız gerçek geçişte yazılır (gerçek HTTP + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  let db: PrismaClient;
  let app: INestApplication;
  let w: ScopeWorld;
  const put = (actor: string, id: string, body: object) => request(app.getHttpServer()).put(`/tasks/${id}`).set("x-test-user-id", actor).send(body);
  const row = (id: string) => db.task.findUniqueOrThrow({ where: { id } });
  const title = (k: string) => `F03A1-${k}-${w.suffix}`;
  const mk = async (key: string, data: Record<string, unknown> = {}) =>
    (await db.task.create({ data: { tenantId: w.tA, title: title(key), createdById: w.u.admin, ...data } as never })).id;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    w = await createScopeWorld(db, "f03a1");
    taskFlag.off();
    caseFlag.off();
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    await w?.cleanup(async (tenants) => {
      await db.taskHistoryEvent.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined); // F03-A2: geçmiş satırları göreve Restrict FK ile bağlı → görevden önce silinir
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } }).catch(() => undefined);
    });
    await db.$disconnect();
  });

  it("gerçek geçiş: tamamlayan kişi atfı alır", async () => {
    const id = await mk("gecis");
    const res = await put(w.u.link, id, { status: "COMPLETED" });
    expect(res.status).toBe(200);
    const done = await row(id);
    expect([done.status, done.completedByUserId, done.resolutionType]).toEqual(["COMPLETED", w.u.link, "MANUAL"]);
    expect(done.completedAt).toBeInstanceOf(Date);
  });

  it("COMPLETED → COMPLETED gidiş-dönüşü: başka kullanıcının düzenlemesi atfı ve tamamlanma anını ezmez; diğer alanlar güncellenir", async () => {
    const id = await mk("gidis-donus");
    await put(w.u.link, id, { status: "COMPLETED" });
    const first = await row(id);

    const res = await put(w.u.nobody, id, { status: "COMPLETED", title: title("gidis-donus-duzenlendi"), priority: "HIGH" });
    expect(res.status).toBe(200);
    const after = await row(id);
    expect([after.status, after.completedByUserId, after.resolutionType]).toEqual(["COMPLETED", w.u.link, "MANUAL"]);
    expect(after.completedAt?.toISOString()).toBe(first.completedAt?.toISOString());
    expect([after.title, after.priority]).toEqual([title("gidis-donus-duzenlendi"), "HIGH"]);
  });

  it("durum gönderilmeyen düzenleme atfa dokunmaz (mevcut davranış korunur)", async () => {
    const id = await mk("durumsuz");
    await put(w.u.link, id, { status: "COMPLETED" });
    const first = await row(id);
    expect((await put(w.u.nobody, id, { description: "sentetik not" })).status).toBe(200);
    const after = await row(id);
    expect([after.completedByUserId, after.completedAt?.toISOString(), after.description]).toEqual([w.u.link, first.completedAt?.toISOString(), "sentetik not"]);
  });

  it("sistem kapanışı (AUTO_SYSTEM, kapatan yok) aynı durumun yeniden gönderilmesiyle insan atfına dönüşmez", async () => {
    const closedAt = new Date("2026-01-15T09:00:00.000Z");
    const id = await mk("sistem", { status: "COMPLETED", completedAt: closedAt, completedByUserId: null, resolutionType: "AUTO_SYSTEM" });
    expect((await put(w.u.nobody, id, { status: "COMPLETED", title: title("sistem-duzenlendi") })).status).toBe(200);
    const after = await row(id);
    expect([after.completedByUserId, after.resolutionType, after.completedAt?.toISOString()]).toEqual([null, "AUTO_SYSTEM", closedAt.toISOString()]);
  });

  it("yeniden açma atfı temizler; ardından tamamlayan YENİ kişi atfı alır", async () => {
    const id = await mk("yeniden");
    await put(w.u.link, id, { status: "COMPLETED" });
    const first = await row(id);

    expect((await put(w.u.nobody, id, { status: "PENDING" })).status).toBe(200);
    const reopened = await row(id);
    expect([reopened.status, reopened.completedAt, reopened.completedByUserId, reopened.resolutionType]).toEqual(["PENDING", null, null, null]);

    await new Promise((resolve) => setTimeout(resolve, 15));
    expect((await put(w.u.nobody, id, { status: "COMPLETED" })).status).toBe(200);
    const again = await row(id);
    expect([again.status, again.completedByUserId, again.resolutionType]).toEqual(["COMPLETED", w.u.nobody, "MANUAL"]);
    expect(again.completedAt!.getTime()).toBeGreaterThan(first.completedAt!.getTime());
  });
});
