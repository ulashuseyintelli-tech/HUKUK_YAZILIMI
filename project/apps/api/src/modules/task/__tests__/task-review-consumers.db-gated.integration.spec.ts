// TaskModule grafiği pdf-poppler'a uzanabilir; paket Linux'ta yükleme anında process.exit(1) verir (CI emsali).
jest.mock("pdf-poppler", () => ({
  convert: async () => {
    throw new Error("pdf-poppler is stubbed in unit tests");
  },
}));

import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import * as request from "supertest";
import { buildScopeApp, scopeFlag } from "../../../../test/p3-scope-world";
import { resolveTestDatabaseUrl } from "../../../../test/test-db-env";
import { CASE_VIEW_SCOPE_FLAG } from "../../case/case-view-scope";
import { CaseTaskEscalationService } from "../../escalation/case-task-escalation.service";
import { ReportService } from "../../report/report.service";
import { TaskModule } from "../task.module";
import { TASK_VIEW_SCOPE_FLAG } from "../task-view-scope";

/**
 * F03-C (OFP-04; F03 R02 §2 sıra 5 ve §6 kabul ölçütü) — "kontrolde" görevin TÜKETİCİLERİ, gerçek tüketici koduyla.
 *
 * "Kontrolde" ayrı bir `TaskStatus` değeri değildir (`IN_PROGRESS` + `reviewStatus = AWAITING`). Bu yüzden tüketicilerde kod
 * değişikliği yoktur; bu takım o iddiayı tüketicilerin KENDİ koduyla sınar (süzgeç metni kopyalanmaz):
 *  1. Dosya görevi eskalasyonu (`CaseTaskEscalationService`): kontrolde bekleyen görev AÇIK iş olarak taranır (süzgeçten
 *     düşmez); tamamlanmış görev taranmaz. Tarama kontrol durumunu bozmaz.
 *  2. Görev performans raporu (`ReportService.getTaskPerformanceReport`): kontrolde bekleyen görev "tamamlandı" sayılmaz;
 *     onaydan sonra İŞİ YAPANIN hanesine yazılır, kontrol edenin hanesine yazılmaz. Ret sonrası da sayılmaz.
 *  3. Operasyonel eskalasyon ve zamanlayıcı: bu iki tüketicinin okuduğu görevler kontrole GİREMEZ — kullanıcının açtığı görev
 *     her zaman `LEGAL_WORKFLOW` doğar (operasyonel motorun kümesi ayrıktır) ve oluşturanı olmayan zamanlayıcı görevi
 *     işaretlenemez (mükerrer denetiminin okuduğu durum değişmez).
 * Gerçek HTTP (TaskModule) + tek kullanımlık PostgreSQL; dış gönderim yok (bildirim taklidi hiç çağrılmaz).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) throw new Error("Task review consumer spec requires TEST_DATABASE_URL in CI.");
const describeDb = TEST_DB_URL ? describe : describe.skip;

describeDb("F03-C — 'kontrolde' görevin tüketicileri (gerçek tüketici kodu + tek kullanımlık PostgreSQL)", () => {
  jest.setTimeout(300_000);
  const taskFlag = scopeFlag(TASK_VIEW_SCOPE_FLAG);
  const caseFlag = scopeFlag(CASE_VIEW_SCOPE_FLAG);
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `test-f03c-tuk-${suffix}`;
  let db: PrismaClient;
  let app: INestApplication;
  let caseId = "";
  const u = { admin: "", creator: "", doer: "" };
  const http = () => request(app.getHttpServer());
  const post = (actor: string, path: string, body: object = {}) => http().post(path).set("x-test-user-id", actor).send(body);
  const put = (actor: string, id: string, body: object) => http().put(`/tasks/${id}`).set("x-test-user-id", actor).send(body);
  const row = (id: string) => db.task.findUniqueOrThrow({ where: { id } });
  const title = (k: string) => `F03C-TUK-${k}-${suffix}`;
  const notifier = { sendEmail: jest.fn().mockResolvedValue("SKIPPED"), sendSms: jest.fn().mockResolvedValue("SKIPPED") };

  const createTask = async (key: string, body: Record<string, unknown> = {}) => {
    const res = await post(u.creator, "/tasks", { title: title(key), caseId, assigneeId: u.doer, ...body });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const submit = async (id: string) => expect((await put(u.doer, id, { status: "COMPLETED" })).status).toBe(200);

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await db.$connect();
    app = await buildScopeApp(() => db, [TaskModule]);
    taskFlag.off();
    caseFlag.off();
    await db.tenant.create({ data: { id: tenantId, name: tenantId, slug: tenantId } });
    await db.office.create({ data: { tenantId, name: `F03C Sentetik Büro ${suffix}` } });
    const mkUser = async (key: string, role: "ADMIN" | "USER" = "USER") =>
      (await db.user.create({ data: { tenantId, email: `f03c-tuk-${key}-${suffix}@example.test`, name: key, surname: "F03C", role } })).id;
    u.admin = await mkUser("admin", "ADMIN");
    u.creator = await mkUser("creator");
    u.doer = await mkUser("doer");
    caseId = (await db.case.create({ data: { tenantId, fileNumber: `F03C-TUK-${suffix}`, type: "GENERAL_EXECUTION" } as never })).id;
  });

  afterAll(async () => {
    taskFlag.restore();
    caseFlag.restore();
    await app?.close();
    await db.escalationEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.taskHistoryEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.taskCancellationEvent.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.task.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.case.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.office.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.user.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await db.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await db.$disconnect();
  });

  it("dosya görevi eskalasyonu: kontrolde bekleyen görev AÇIK iş olarak taranır; tamamlanmış görev taranmaz; kontrol durumu bozulmaz", async () => {
    const awaitingId = await createTask("esk-kontrolde", { reviewRequired: true });
    await submit(awaitingId);
    const completedId = await createTask("esk-tamam");
    await submit(completedId); // işaretsiz görev doğrudan tamamlanır
    expect([(await row(awaitingId)).caseEscalationLevel, (await row(completedId)).caseEscalationLevel]).toEqual([null, null]);
    expect([(await row(awaitingId)).status, (await row(completedId)).status]).toEqual(["IN_PROGRESS", "COMPLETED"]);

    const service = new CaseTaskEscalationService(db as never, notifier as never, { report: jest.fn() } as never);
    await service.processCaseTaskEscalations(new Date());

    const awaiting = await row(awaitingId);
    // tarandı: motor görevi benimsedi (ilk kademe + takip tarihi yazıldı)
    expect(awaiting.caseEscalationLevel).toBe("RESPONSIBLE");
    expect(awaiting.caseNextFollowUpAt).toBeInstanceOf(Date);
    // tarama kontrol durumunu ve tamamlama atfını değiştirmez
    expect([awaiting.status, awaiting.reviewStatus, awaiting.reviewSubmittedByUserId, awaiting.completedAt]).toEqual(["IN_PROGRESS", "AWAITING", u.doer, null]);
    // tamamlanmış görev eskalasyon kümesinde değildir
    expect((await row(completedId)).caseEscalationLevel).toBeNull();
    expect(notifier.sendEmail).not.toHaveBeenCalled();
    expect(notifier.sendSms).not.toHaveBeenCalled();
  });

  it("performans raporu: kontrolde bekleyen görev sayılmaz; onayda işi yapana yazılır, kontrol edene yazılmaz; ret sayılmaz", async () => {
    const report = new ReportService(db as never, {} as never, {} as never);
    const countOf = async (userId: string) =>
      (await report.getTaskPerformanceReport(tenantId)).people.find((person) => person.personId === userId)?.completedManualCount ?? 0;
    const before = await countOf(u.doer); // önceki testte işaretsiz tamamlanan görev(ler)

    const approvedId = await createTask("rapor-onay", { reviewRequired: true });
    const rejectedId = await createTask("rapor-ret", { reviewRequired: true });
    await submit(approvedId);
    await submit(rejectedId);
    // kontrolde bekleyen iki görev "tamamlandı" sayımına girmez
    expect(await countOf(u.doer)).toBe(before);

    expect((await post(u.admin, `/tasks/${approvedId}/review`, { decision: "APPROVE" })).status).toBe(201);
    expect((await post(u.admin, `/tasks/${rejectedId}/review`, { decision: "REJECT", note: "Sentetik ret" })).status).toBe(201);

    const after = await report.getTaskPerformanceReport(tenantId);
    // yalnız onaylanan görev eklendi ve işi YAPANIN hanesine yazıldı
    expect(after.people.find((person) => person.personId === u.doer)?.completedManualCount).toBe(before + 1);
    expect(after.people.find((person) => person.personId === u.admin)).toBeUndefined();
    expect(after.unattributed.count).toBe(0);
    expect(after.system.autoSystemCount).toBe(0);
    // reddedilen görev havuzdadır: tamamlanmamış, atanmamış
    const rejected = await row(rejectedId);
    expect([rejected.status, rejected.assigneeId, rejected.completedByUserId]).toEqual(["PENDING", null, null]);
  });

  it("operasyonel eskalasyon ve zamanlayıcının okuduğu görevler kontrole giremez", async () => {
    // Kullanıcının açtığı görev her zaman LEGAL_WORKFLOW doğar → operasyonel motorun (OPERATIONAL_COMPLETENESS) kümesiyle ayrıktır.
    const userTask = await createTask("kategori", { reviewRequired: true });
    expect((await row(userTask)).taskCategory).toBe("LEGAL_WORKFLOW");
    expect((await post(u.creator, "/tasks", { title: title("kategori-secilemez"), taskCategory: "OPERATIONAL_COMPLETENESS" })).status).toBe(400);

    // Zamanlayıcı görevi: oluşturanı yok, PENDING doğar (mükerrer denetimi bu durumu okur). İşaretlenemez; durumu değişmez.
    const scheduled = (await db.task.create({ data: { tenantId, caseId, title: title("zamanlayici"), status: "PENDING", priority: "HIGH" } })).id;
    const mark = await post(u.admin, `/tasks/${scheduled}/review-requirement`, { required: true });
    expect([403, 409]).toContain(mark.status);
    const operational = (await db.task.create({ data: { tenantId, title: title("operasyonel"), taskCategory: "OPERATIONAL_COMPLETENESS", taskSubType: "DEBTOR_INFO", dedupeKey: `F03C-TUK:${suffix}`, createdById: u.creator } })).id;
    const markOperational = await post(u.creator, `/tasks/${operational}/review-requirement`, { required: true });
    expect([markOperational.status, markOperational.body.code]).toEqual([409, "TASK_REVIEW_NOT_APPLICABLE"]);
    for (const id of [scheduled, operational]) {
      const task = await row(id);
      expect([task.status, task.reviewRequired, task.reviewStatus]).toEqual(["PENDING", false, null]);
    }
  });
});
