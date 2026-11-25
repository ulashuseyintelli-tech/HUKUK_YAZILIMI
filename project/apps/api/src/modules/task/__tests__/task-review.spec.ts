/**
 * F03-C (OFP-04 / WR01 B05) — görev içi bağımsız ilk kontrol: saf yardımcılar.
 * Gerçek HTTP + PostgreSQL karşılığı: task-review.http.db-gated.integration.spec.ts.
 */
import {
  TASK_REVIEW_DECISION,
  TASK_REVIEW_EVENT,
  TASK_REVIEW_STATUS,
  isAwaitingReview,
  isReviewApplicable,
  reviewEventForDecision,
  reviewStatusAfterDecision,
  statusAfterReviewDecision,
} from "../task-review";
import { TaskStatus } from "@prisma/client";

/**
 * Enum tuzagi (F03 R02): mevcut `TaskStatus` enum'una deger eklemek, geri donuste eski derlemenin o satiri okumasini bozar.
 * "Kontrolde" bu yuzden AYRI kolonlarla tutulur. Bu test enum'a deger eklenirse dusar: ekleyen, eski derlemeyle okumayi sinamak
 * ve gerekcesini yazmak zorundadir.
 */
describe("TaskStatus enum'u F03-C ile DEGISMEZ", () => {
  it("dort deger: PENDING, IN_PROGRESS, COMPLETED, CANCELLED", () => {
    expect(Object.values(TaskStatus).sort()).toEqual(["CANCELLED", "COMPLETED", "IN_PROGRESS", "PENDING"]);
  });
});

describe("isAwaitingReview — 'kontrolde' iki koşulun birlikte sağlanmasıdır", () => {
  it("devam ediyor + AWAITING → kontrolde", () => {
    expect(isAwaitingReview({ status: "IN_PROGRESS", reviewStatus: TASK_REVIEW_STATUS.AWAITING })).toBe(true);
  });

  it.each([
    ["COMPLETED", TASK_REVIEW_STATUS.AWAITING], // eski derleme / başka yol durumu değiştirdiyse bayat işaret kontrolde sayılmaz
    ["PENDING", TASK_REVIEW_STATUS.AWAITING],
    ["CANCELLED", TASK_REVIEW_STATUS.AWAITING],
    ["IN_PROGRESS", null],
    ["IN_PROGRESS", TASK_REVIEW_STATUS.REVISION_REQUESTED],
    ["IN_PROGRESS", TASK_REVIEW_STATUS.APPROVED],
  ])("%s + %s → kontrolde DEĞİL", (status, reviewStatus) => {
    expect(isAwaitingReview({ status, reviewStatus })).toBe(false);
  });
});

describe("isReviewApplicable — yalnız kullanıcının açtığı, açık görev kontrole tabi tutulabilir (K4-b)", () => {
  const manual = { status: "PENDING", createdById: "u1", dedupeKey: null, taskSubType: null, clientId: null, debtorId: null, addressId: null };

  it("kullanıcının açtığı açık görev (bekliyor / devam ediyor) uygundur", () => {
    expect(isReviewApplicable(manual)).toBe(true);
    expect(isReviewApplicable({ ...manual, status: "IN_PROGRESS" })).toBe(true);
  });

  it.each([
    ["oluşturanı yok (sistem üreticisi)", { createdById: null }],
    ["mükerrer anahtarı var (sistem görevi)", { dedupeKey: "OPCOMP:CONTACT:x" }],
    ["alt türü var (operasyonel üretici)", { taskSubType: "DEBTOR_INFO" }],
    ["müvekkile bağlı üretici görevi", { clientId: "c1" }],
    ["borçluya bağlı üretici görevi", { debtorId: "d1" }],
    ["adrese bağlı üretici görevi", { addressId: "a1" }],
    ["tamamlanmış görev", { status: "COMPLETED" }],
    ["iptal edilmiş görev", { status: "CANCELLED" }],
  ])("%s → uygun DEĞİL", (_label, over) => {
    expect(isReviewApplicable({ ...manual, ...over })).toBe(false);
  });
});

describe("karar sonrası durum (K9)", () => {
  it("onay → tamamlandı / APPROVED", () => {
    expect(statusAfterReviewDecision(TASK_REVIEW_DECISION.APPROVE)).toBe("COMPLETED");
    expect(reviewStatusAfterDecision(TASK_REVIEW_DECISION.APPROVE)).toBe(TASK_REVIEW_STATUS.APPROVED);
    expect(reviewEventForDecision(TASK_REVIEW_DECISION.APPROVE)).toBe(TASK_REVIEW_EVENT.APPROVED);
  });

  it("revizyon → işi yapanda devam ediyor / REVISION_REQUESTED", () => {
    expect(statusAfterReviewDecision(TASK_REVIEW_DECISION.REQUEST_REVISION)).toBe("IN_PROGRESS");
    expect(reviewStatusAfterDecision(TASK_REVIEW_DECISION.REQUEST_REVISION)).toBe(TASK_REVIEW_STATUS.REVISION_REQUESTED);
    expect(reviewEventForDecision(TASK_REVIEW_DECISION.REQUEST_REVISION)).toBe(TASK_REVIEW_EVENT.REVISION_REQUESTED);
  });

  it("ret → bekliyor (iş yapılmamış sayılır) / REJECTED", () => {
    expect(statusAfterReviewDecision(TASK_REVIEW_DECISION.REJECT)).toBe("PENDING");
    expect(reviewStatusAfterDecision(TASK_REVIEW_DECISION.REJECT)).toBe(TASK_REVIEW_STATUS.REJECTED);
    expect(reviewEventForDecision(TASK_REVIEW_DECISION.REJECT)).toBe(TASK_REVIEW_EVENT.REJECTED);
  });
});
