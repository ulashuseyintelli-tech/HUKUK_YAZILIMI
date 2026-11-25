/**
 * F03-A2 (OFP-03a / OFF-INV-08) — görev geçmişi saf yardımcıları: izlenen alan farkı, yeniden açma, yetki kaynağı izi, satır kurucuları.
 * Gerçek HTTP + PostgreSQL karşılığı: task-history.http.db-gated.integration.spec.ts.
 */
import {
  TASK_HISTORY_ACTOR,
  TASK_HISTORY_AUTHORITY,
  TASK_HISTORY_EVENT,
  TASK_HISTORY_PRODUCER_CLIENT_CONTACT,
  createdTaskHistory,
  diffTaskHistory,
  systemTaskHistoryRow,
  taskHistoryUserAuthority,
  userTaskHistoryRows,
} from "../task-history";

const base = { status: "PENDING", priority: "MEDIUM", assigneeId: null, dueDate: null, caseId: null };

describe("diffTaskHistory — yalnız DEĞİŞEN izlenen alan olay üretir", () => {
  it("hiçbir izlenen alan değişmediyse olay yok (başlık / açıklama izlenmez)", () => {
    expect(diffTaskHistory(base, { ...base })).toEqual([]);
  });

  it("atama, öncelik, son tarih ve dosya bağı ayrı olaylardır; önceki → yeni değer taşır", () => {
    const due = new Date("2026-12-01T00:00:00.000Z");
    const changes = diffTaskHistory(base, { ...base, assigneeId: "u2", priority: "HIGH", dueDate: due, caseId: "c1" });
    expect(changes).toEqual([
      { eventType: TASK_HISTORY_EVENT.ASSIGNEE_CHANGED, fromValue: null, toValue: "u2" },
      { eventType: TASK_HISTORY_EVENT.PRIORITY_CHANGED, fromValue: "MEDIUM", toValue: "HIGH" },
      { eventType: TASK_HISTORY_EVENT.DUE_DATE_CHANGED, fromValue: null, toValue: "2026-12-01T00:00:00.000Z" },
      { eventType: TASK_HISTORY_EVENT.CASE_LINK_CHANGED, fromValue: null, toValue: "c1" },
    ]);
  });

  it("aynı ana işaret eden iki Date nesnesi son tarih değişikliği SAYILMAZ; tarihin kaldırılması sayılır", () => {
    const a = new Date("2026-12-01T00:00:00.000Z");
    const b = new Date("2026-12-01T00:00:00.000Z");
    expect(diffTaskHistory({ ...base, dueDate: a }, { ...base, dueDate: b })).toEqual([]);
    expect(diffTaskHistory({ ...base, dueDate: a }, { ...base, dueDate: null })).toEqual([
      { eventType: TASK_HISTORY_EVENT.DUE_DATE_CHANGED, fromValue: "2026-12-01T00:00:00.000Z", toValue: null },
    ]);
  });

  it("açık durumlar arası ve tamamlama geçişi STATUS_CHANGED'dir", () => {
    expect(diffTaskHistory(base, { ...base, status: "IN_PROGRESS" })).toEqual([
      { eventType: TASK_HISTORY_EVENT.STATUS_CHANGED, fromValue: "PENDING", toValue: "IN_PROGRESS" },
    ]);
    expect(diffTaskHistory({ ...base, status: "IN_PROGRESS" }, { ...base, status: "COMPLETED" })).toEqual([
      { eventType: TASK_HISTORY_EVENT.STATUS_CHANGED, fromValue: "IN_PROGRESS", toValue: "COMPLETED" },
    ]);
  });

  it.each(["COMPLETED", "CANCELLED"])("kapalı (%s) → açık geçiş REOPENED'dır ve önceki kapanış atfını saklar", (closed) => {
    const completedAt = new Date("2026-11-20T08:30:00.000Z");
    const before = { ...base, status: closed, completedAt, completedByUserId: "u1", resolutionType: "MANUAL" };
    expect(diffTaskHistory(before, { ...base, status: "PENDING" })).toEqual([
      {
        eventType: TASK_HISTORY_EVENT.REOPENED,
        fromValue: closed,
        toValue: "PENDING",
        details: { previousCompletedAt: "2026-11-20T08:30:00.000Z", previousCompletedByUserId: "u1", previousResolutionType: "MANUAL" },
      },
    ]);
  });
});

describe("createdTaskHistory", () => {
  it("başlangıç değerlerini details içinde taşır; önceki değer yoktur", () => {
    const due = new Date("2026-12-05T00:00:00.000Z");
    expect(createdTaskHistory({ status: "PENDING", priority: "HIGH", assigneeId: "u2", dueDate: due, caseId: "c1" })).toEqual({
      eventType: TASK_HISTORY_EVENT.CREATED,
      fromValue: null,
      toValue: "PENDING",
      details: { status: "PENDING", priority: "HIGH", assigneeId: "u2", dueDate: "2026-12-05T00:00:00.000Z", caseId: "c1" },
    });
  });
});

describe("taskHistoryUserAuthority — yetki kaynağı izi (yetki ÜRETMEZ)", () => {
  const task = { createdById: "creator", assigneeId: "assignee" };
  it("sıra: oluşturan > atanan > ADMIN > büro yazarı", () => {
    expect(taskHistoryUserAuthority({ id: "creator", role: "ADMIN" }, task)).toBe(TASK_HISTORY_AUTHORITY.CREATOR);
    expect(taskHistoryUserAuthority({ id: "assignee", role: "ADMIN" }, task)).toBe(TASK_HISTORY_AUTHORITY.ASSIGNEE);
    expect(taskHistoryUserAuthority({ id: "other", role: "ADMIN" }, task)).toBe(TASK_HISTORY_AUTHORITY.ADMIN);
    expect(taskHistoryUserAuthority({ id: "other", role: "USER" }, task)).toBe(TASK_HISTORY_AUTHORITY.TENANT_WRITER);
  });
  it("oluşturanı / atananı olmayan görevde boş kimlik eşleşmesi kaynak üretmez", () => {
    expect(taskHistoryUserAuthority({ id: "x", role: "USER" }, { createdById: null, assigneeId: null })).toBe(TASK_HISTORY_AUTHORITY.TENANT_WRITER);
  });
});

describe("satır kurucuları", () => {
  it("kullanıcı satırları: aynı istekten doğan satırlar tek korelasyon kimliği, aktör ve rol anlık görüntüsü taşır", () => {
    const rows = userTaskHistoryRows({
      tenantId: "t1",
      taskId: "tk",
      actor: { id: "u1", role: "USER" as never },
      authoritySource: TASK_HISTORY_AUTHORITY.CREATOR,
      correlationId: "corr-1",
      changes: diffTaskHistory(base, { ...base, status: "IN_PROGRESS", priority: "LOW" }),
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ tenantId: "t1", taskId: "tk", actorType: TASK_HISTORY_ACTOR.USER, actorUserId: "u1", actorRole: "USER", authoritySource: "CREATOR", correlationId: "corr-1" });
      expect(row).not.toHaveProperty("details");
    }
    expect(rows.map((r) => r.eventType)).toEqual([TASK_HISTORY_EVENT.STATUS_CHANGED, TASK_HISTORY_EVENT.PRIORITY_CHANGED]);
  });

  it("sistem satırı: kullanıcı aktör YOK; üretici adı details içinde; korelasyon kimliği üretilir", () => {
    const [change] = diffTaskHistory({ ...base, status: "CANCELLED" }, { ...base, status: "PENDING" });
    const row = systemTaskHistoryRow({ tenantId: "t1", taskId: "tk", producer: TASK_HISTORY_PRODUCER_CLIENT_CONTACT, change });
    expect(row).toMatchObject({
      tenantId: "t1",
      taskId: "tk",
      eventType: TASK_HISTORY_EVENT.REOPENED,
      actorType: TASK_HISTORY_ACTOR.SYSTEM,
      actorUserId: null,
      actorRole: null,
      authoritySource: TASK_HISTORY_AUTHORITY.SYSTEM_PRODUCER,
      fromValue: "CANCELLED",
      toValue: "PENDING",
    });
    expect(row.details).toMatchObject({ producer: TASK_HISTORY_PRODUCER_CLIENT_CONTACT, previousCompletedByUserId: null });
    expect(String(row.correlationId)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
