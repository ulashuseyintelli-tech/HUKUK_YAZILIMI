import { describe, it, expect } from 'vitest';
import {
  REVIEW_ACTION_TEXT,
  REVIEW_DECISION_KINDS,
  canOfferReviewDecision,
  canOfferReviewRequirementRemoval,
  canOfferReviewRequirementSet,
  isAwaitingReview,
  lastReviewDecisionText,
  taskReviewBadge,
  type TaskReviewFields,
} from '../task-review';

/**
 * F03-C — görev içi bağımsız ilk kontrol: ekran yardımcıları (saf).
 * stable key: lib/task-review.ts
 */
const task = (over: Partial<TaskReviewFields> = {}): TaskReviewFields => ({
  status: 'IN_PROGRESS',
  createdById: 'creator',
  reviewRequired: true,
  reviewStatus: 'AWAITING',
  reviewSubmittedByUserId: 'doer',
  ...over,
});

describe('isAwaitingReview / taskReviewBadge', () => {
  it('"kontrolde" = devam ediyor + AWAITING; başka birleşim kontrolde değildir', () => {
    expect(isAwaitingReview(task())).toBe(true);
    expect(isAwaitingReview(task({ status: 'COMPLETED' }))).toBe(false);
    expect(isAwaitingReview(task({ reviewStatus: null }))).toBe(false);
  });

  it('rozet: kontrolde / kontrol edildi / revizyon istendi / reddedildi / kontrol gerekli; ilgisiz görevde rozet yok', () => {
    expect(taskReviewBadge(task())?.label).toBe('Kontrolde');
    expect(taskReviewBadge(task({ status: 'COMPLETED', reviewStatus: 'APPROVED' }))?.label).toBe('Kontrol edildi');
    expect(taskReviewBadge(task({ reviewStatus: 'REVISION_REQUESTED' }))?.label).toBe('Revizyon istendi');
    expect(taskReviewBadge(task({ status: 'PENDING', reviewStatus: 'REJECTED' }))?.label).toBe('Kontrolde reddedildi');
    expect(taskReviewBadge(task({ status: 'PENDING', reviewStatus: null }))?.label).toBe('Kontrol gerekli');
    expect(taskReviewBadge(task({ status: 'PENDING', reviewStatus: null, reviewRequired: false }))).toBeNull();
    // bayat işaret: tamamlanmış ama AWAITING kalmış görev "kontrolde" diye gösterilmez
    expect(taskReviewBadge(task({ status: 'COMPLETED', reviewStatus: 'AWAITING' }))).toBeNull();
    expect(taskReviewBadge(task({ status: 'CANCELLED', reviewStatus: 'REJECTED' }))).toBeNull();
  });
});

describe('canOfferReviewDecision — karar düğmesi sunumu (karar sunucuda verilir)', () => {
  it('büro yöneticisine ve görevi oluşturana sunulur', () => {
    expect(canOfferReviewDecision({ id: 'admin', role: 'ADMIN' }, task())).toBe(true);
    expect(canOfferReviewDecision({ id: 'creator', role: 'USER' }, task())).toBe(true);
  });

  it('işi yapan hesaba, ilgisiz kullanıcıya ve VIEWER\'a sunulmaz; kontrolde olmayan görevde kimseye sunulmaz', () => {
    expect(canOfferReviewDecision({ id: 'doer', role: 'ADMIN' }, task())).toBe(false);
    expect(canOfferReviewDecision({ id: 'creator', role: 'USER' }, task({ reviewSubmittedByUserId: 'creator' }))).toBe(false);
    expect(canOfferReviewDecision({ id: 'other', role: 'USER' }, task())).toBe(false);
    expect(canOfferReviewDecision({ id: 'creator', role: 'VIEWER' }, task())).toBe(false);
    expect(canOfferReviewDecision({ id: 'admin', role: 'ADMIN' }, task({ reviewStatus: 'REVISION_REQUESTED' }))).toBe(false);
    expect(canOfferReviewDecision(null, task())).toBe(false);
  });
});

describe('canOfferReviewRequirementRemoval — işaret kaldırma sunumu', () => {
  it('görevi oluşturana ve büro yöneticisine, açık ve işaretli görevde sunulur', () => {
    expect(canOfferReviewRequirementRemoval({ id: 'creator', role: 'USER' }, task())).toBe(true);
    expect(canOfferReviewRequirementRemoval({ id: 'admin', role: 'ADMIN' }, task({ status: 'PENDING', reviewStatus: null }))).toBe(true);
  });

  it('işaretsiz, kapalı görevde ya da ilgisiz kullanıcıya / VIEWER\'a sunulmaz', () => {
    expect(canOfferReviewRequirementRemoval({ id: 'admin', role: 'ADMIN' }, task({ reviewRequired: false }))).toBe(false);
    expect(canOfferReviewRequirementRemoval({ id: 'admin', role: 'ADMIN' }, task({ status: 'COMPLETED', reviewStatus: 'APPROVED' }))).toBe(false);
    expect(canOfferReviewRequirementRemoval({ id: 'other', role: 'USER' }, task())).toBe(false);
    expect(canOfferReviewRequirementRemoval({ id: 'creator', role: 'VIEWER' }, task())).toBe(false);
  });
});

describe('lastReviewDecisionText', () => {
  it('son karar gerekçesiyle özetlenir; karar yoksa metin yok', () => {
    expect(lastReviewDecisionText(task({ reviewStatus: 'REVISION_REQUESTED', reviewNote: ' Eksik belge ' }))).toBe('Revizyon istendi: Eksik belge');
    expect(lastReviewDecisionText(task({ reviewStatus: 'REJECTED', reviewNote: 'Yanlış dosya' }))).toBe('Kontrolde reddedildi: Yanlış dosya');
    expect(lastReviewDecisionText(task({ reviewStatus: 'APPROVED', reviewNote: null }))).toBe('Kontrol edildi');
    expect(lastReviewDecisionText(task({ reviewStatus: 'AWAITING' }))).toBeNull();
    expect(lastReviewDecisionText(task({ reviewStatus: null }))).toBeNull();
  });
});

describe('canOfferReviewRequirementSet — "kontrol gerekli yap" sunumu (K4-b)', () => {
  const unmarked = (over: Partial<TaskReviewFields> = {}) => task({ status: 'PENDING', reviewRequired: false, reviewStatus: null, reviewSubmittedByUserId: null, ...over });

  it('yalnız görevi oluşturana, kullanıcının açtığı açık ve işaretsiz görevde sunulur', () => {
    expect(canOfferReviewRequirementSet({ id: 'creator', role: 'USER' }, unmarked())).toBe(true);
    expect(canOfferReviewRequirementSet({ id: 'creator', role: 'ADMIN' }, unmarked({ status: 'IN_PROGRESS' }))).toBe(true);
  });

  it('yöneticiye (oluşturan değilse), VIEWER\'a, işaretli / kapalı görevde ve sistem görevinde sunulmaz', () => {
    expect(canOfferReviewRequirementSet({ id: 'admin', role: 'ADMIN' }, unmarked())).toBe(false);
    expect(canOfferReviewRequirementSet({ id: 'creator', role: 'VIEWER' }, unmarked())).toBe(false);
    expect(canOfferReviewRequirementSet({ id: 'creator', role: 'USER' }, unmarked({ reviewRequired: true }))).toBe(false);
    expect(canOfferReviewRequirementSet({ id: 'creator', role: 'USER' }, unmarked({ status: 'COMPLETED' }))).toBe(false);
    for (const systemTrace of [{ dedupeKey: 'uretici:1' }, { taskSubType: 'ALT' }, { clientId: 'c1' }, { debtorId: 'd1' }, { addressId: 'a1' }]) {
      expect(canOfferReviewRequirementSet({ id: 'creator', role: 'USER' }, unmarked(systemTrace))).toBe(false);
    }
    expect(canOfferReviewRequirementSet(null, unmarked())).toBe(false);
  });
});

describe('REVIEW_ACTION_TEXT — pencere metinleri', () => {
  it('ret, revizyon ve işaretin kaldırılması gerekçe ister; onayda not isteğe bağlıdır; işaret koymada metin alanı yoktur', () => {
    expect(REVIEW_DECISION_KINDS).toEqual(['APPROVE', 'REQUEST_REVISION', 'REJECT']);
    expect(Object.fromEntries(Object.entries(REVIEW_ACTION_TEXT).map(([kind, text]) => [kind, [text.textRequired, text.textLabel !== null]]))).toEqual({
      APPROVE: [false, true],
      REQUEST_REVISION: [true, true],
      REJECT: [true, true],
      REMOVE_REQUIREMENT: [true, true],
      SET_REQUIREMENT: [false, false],
    });
    for (const text of Object.values(REVIEW_ACTION_TEXT)) {
      expect(text.failure).toContain('DEĞİŞMEDİ');
      expect(text.stale).toContain('yenilenemedi');
    }
  });
});
