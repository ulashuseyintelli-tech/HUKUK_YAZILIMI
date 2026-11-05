import { describe, it, expect } from 'vitest';
import {
  accountReopenResultMessage,
  blockedReasonMessage,
  buildStaffAccountReopenPayload,
  classifyStaffAccountReopenFailure,
  readStaffAccountReopenReview,
  reopenConsequences,
} from '../staff-account-reopen';

/** O-5b (owner 05.11.2026, A politikası) — hesap açma incelemesi okuyucusu, gövde kurucu ve mesajlar (ağ çağrısı yok). */
const FP = 'd'.repeat(64);
const OK = {
  staffId: 's1', reopenable: true, reason: null,
  account: { role: 'ADMIN', isActive: false, hasPassword: true },
  allowGrants: [
    { id: 'g1', permissionKey: 'office.tasks.view_all', validFrom: '2026-10-01T00:00:00.000Z', validUntil: null, startsInFuture: false },
    { id: 'g2', permissionKey: 'office.expenses.view_all', validFrom: '2099-01-01T00:00:00.000Z', validUntil: null, startsInFuture: true },
  ],
  denyKeys: [],
  reviewFingerprint: FP,
};

describe('readStaffAccountReopenReview', () => {
  it('api.get yanıtı ({ data: { data } }), { data } ve çıplak gövde aynı sonucu verir', () => {
    const r = readStaffAccountReopenReview({ data: { data: OK } });
    expect(r).toEqual(OK);
    expect(readStaffAccountReopenReview({ data: OK })).toEqual(OK);
    expect(readStaffAccountReopenReview(OK)).toEqual(OK);
  });

  it.each([
    ['boş', {}],
    ['parmak izi yok', { ...OK, reviewFingerprint: null }],
    ['parmak izi biçimsiz', { ...OK, reviewFingerprint: 'X' }],
    ['açılabilir ama neden dolu', { ...OK, reason: 'STAFF_INACTIVE' }],
    ['açılabilir ama hesap yok', { ...OK, account: null }],
    ['açılamaz ama parmak izi var', { ...OK, reopenable: false, reason: 'ACCOUNT_ALREADY_ACTIVE' }],
    ['açılamaz ama neden yok', { ...OK, reopenable: false, reviewFingerprint: null }],
    ['bilinmeyen neden', { ...OK, reopenable: false, reason: 'BASKA', reviewFingerprint: null }],
    ['izin satırı eksik', { ...OK, allowGrants: [{ id: 'g1' }] }],
    ['DENY anahtarı metin değil', { ...OK, denyKeys: [1] }],
  ])('eksik / tutarsız şekil (%s) → null (eksik bilgiyle onay ekranı açılmaz)', (_ad, body) => {
    expect(readStaffAccountReopenReview({ data: { data: body } })).toBeNull();
  });
});

describe('buildStaffAccountReopenPayload', () => {
  const review = readStaffAccountReopenReview(OK)!;
  it('yalnız incelemede listelenen kimlikler, tekrarsız; boş seçim = hiçbiri korunmaz', () => {
    expect(buildStaffAccountReopenPayload(review, [])).toEqual({ reviewFingerprint: FP, keepGrantIds: [] });
    expect(buildStaffAccountReopenPayload(review, ['g2', 'g2', 'yabanci'])).toEqual({ reviewFingerprint: FP, keepGrantIds: ['g2'] });
  });
  it('açılamayan inceleme için gövde kurulmaz', () => {
    expect(() => buildStaffAccountReopenPayload({ ...review, reopenable: false, reviewFingerprint: null }, [])).toThrow();
  });
});

describe('mesajlar', () => {
  it('onay öncesi etki: parola ve rol değişmez, oturumlar kapanır, sıfırlama iptal; DENY yoksa DENY satırı yok', () => {
    const t = reopenConsequences(readStaffAccountReopenReview(OK)!);
    expect(t).toContain('Rol değişmez: Yönetici (ADMIN).');
    expect(t.join(' ')).toContain('Parola değiştirilmez.');
    expect(t.join(' ')).not.toContain('DENY');
    expect(reopenConsequences({ ...readStaffAccountReopenReview(OK)!, allowGrants: [] })).toContain('Sona erecek büro geneli görünüm izni yok.');
  });

  it('sonuç: yanıt okunamazsa hesap hakkında iddia kurulmaz', () => {
    expect(accountReopenResultMessage({ data: { data: { account: { isActive: true }, keptGrantCount: 0, expiredGrantCount: 3, sessionsInvalidated: true } } }))
      .toBe('Giriş hesabı açıldı. Eski oturumlar geçersiz; personel yeniden giriş yapmalı. 0 büro geneli izin korundu, 3 izin sona erdi. Rol ve parola değişmedi.');
    expect(accountReopenResultMessage({ data: {} })).toContain('sonuç okunamadı');
    expect(accountReopenResultMessage({ data: { data: { account: { isActive: false }, keptGrantCount: 0, expiredGrantCount: 0, sessionsInvalidated: true } } })).toContain('sonuç okunamadı');
  });

  it('hata sınıflandırması: bayat / uygulanamaz yeniden inceleme ister; yetki ve bilinmeyen hata yeniden denemeyi önermez', () => {
    expect(classifyStaffAccountReopenFailure({ status: 409, body: { code: 'STAFF_ACCOUNT_REVIEW_STALE' } }).refresh).toBe(true);
    expect(classifyStaffAccountReopenFailure({ status: 400, body: { code: 'STAFF_ACCOUNT_REOPEN_UNKNOWN_GRANT' } }).refresh).toBe(true);
    const na = classifyStaffAccountReopenFailure({ status: 409, body: { code: 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE', reason: 'ACCOUNT_PENDING_INVITE' } });
    expect(na).toEqual({ message: `${blockedReasonMessage('ACCOUNT_PENDING_INVITE')} Hiçbir şey yazılmadı.`, refresh: true });
    expect(classifyStaffAccountReopenFailure({ status: 403, body: { code: 'OFFICE_F01_AUTHORIZATION_REQUIRED' } })).toEqual({
      message: 'Bu işlem için güncel ADMIN yetkisi gerekir. Hiçbir değişiklik yapılmadı.', refresh: false,
    });
    expect(classifyStaffAccountReopenFailure(new Error('ağ')).refresh).toBe(false);
    expect(classifyStaffAccountReopenFailure(new Error('ağ')).message).toContain('doğrulanamadı');
  });
});
