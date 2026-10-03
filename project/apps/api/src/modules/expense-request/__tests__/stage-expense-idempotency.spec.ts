import {
  checkStageExpenseIdempotencyKey,
  decideStageExpenseIdempotency,
  IDEMPOTENCY_KEY_CANCELLED,
  IDEMPOTENCY_KEY_CONFLICT,
  IDEMPOTENCY_KEY_INVALID,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  stageExpenseRequestFingerprint,
} from '../stage-expense-idempotency';

describe('stage-expense-idempotency — saf istek anahtarı kararları', () => {
  describe('checkStageExpenseIdempotencyKey', () => {
    it('alan yoksa (undefined / null) anahtarsız çağrıdır: ok, key null', () => {
      expect(checkStageExpenseIdempotencyKey(undefined)).toEqual({ ok: true, key: null });
      expect(checkStageExpenseIdempotencyKey(null)).toEqual({ ok: true, key: null });
    });

    it('geçerli anahtar kırpılarak kabul edilir (harf, rakam, . _ : -)', () => {
      expect(checkStageExpenseIdempotencyKey('  abc-123_X.y:z  ')).toEqual({ ok: true, key: 'abc-123_X.y:z' });
      expect(checkStageExpenseIdempotencyKey('a'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH))).toEqual({
        ok: true,
        key: 'a'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH),
      });
    });

    it.each([
      ['boş metin', ''],
      ['yalnız boşluk', '   '],
      ['çok uzun', 'a'.repeat(IDEMPOTENCY_KEY_MAX_LENGTH + 1)],
      ['boşluk içeren', 'a b'],
      ['eğik çizgi', 'a/b'],
      ['satır sonu', 'a\nb'],
      ['Türkçe harf', 'şifre'],
      ['sayı', 12345],
      ['nesne', { key: 'x' }],
      ['dizi', ['x']],
      ['mantıksal', false],
    ])('geçersiz değer reddedilir, sessizce anahtarsız sayılmaz: %s', (_label, value) => {
      const result = checkStageExpenseIdempotencyKey(value);
      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ ok: false, code: IDEMPOTENCY_KEY_INVALID });
    });
  });

  describe('stageExpenseRequestFingerprint', () => {
    it('aynı girdi aynı özet; dosya ya da aşama değişince farklı özet; 64 karakter onaltılı', () => {
      const a = stageExpenseRequestFingerprint({ caseId: 'c1', stageCode: 'SEIZURE' });
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(stageExpenseRequestFingerprint({ caseId: 'c1', stageCode: 'SEIZURE' })).toBe(a);
      expect(stageExpenseRequestFingerprint({ caseId: 'c2', stageCode: 'SEIZURE' })).not.toBe(a);
      expect(stageExpenseRequestFingerprint({ caseId: 'c1', stageCode: 'SALE' })).not.toBe(a);
    });

    it('alanlar birbirine kayamaz: ("ab","c") ile ("a","bc") farklıdır', () => {
      expect(stageExpenseRequestFingerprint({ caseId: 'ab', stageCode: 'c' })).not.toBe(
        stageExpenseRequestFingerprint({ caseId: 'a', stageCode: 'bc' }),
      );
    });
  });

  describe('decideStageExpenseIdempotency', () => {
    const fingerprint = stageExpenseRequestFingerprint({ caseId: 'c1', stageCode: 'SEIZURE' });

    it('aynı içerik, iptal edilmemiş talep → REPLAY (yeni yazım yok)', () => {
      expect(decideStageExpenseIdempotency({ requestFingerprint: fingerprint, status: 'PENDING' }, fingerprint)).toEqual({ outcome: 'REPLAY' });
      expect(decideStageExpenseIdempotency({ requestFingerprint: fingerprint, status: 'SENT' }, fingerprint)).toEqual({ outcome: 'REPLAY' });
    });

    it('farklı içerik → CONFLICT; iptal olsa bile içerik karşılaştırması önce gelir', () => {
      const other = stageExpenseRequestFingerprint({ caseId: 'c1', stageCode: 'SALE' });
      expect(decideStageExpenseIdempotency({ requestFingerprint: other, status: 'PENDING' }, fingerprint)).toMatchObject({
        outcome: 'CONFLICT',
        code: IDEMPOTENCY_KEY_CONFLICT,
      });
      expect(decideStageExpenseIdempotency({ requestFingerprint: other, status: 'CANCELLED' }, fingerprint)).toMatchObject({
        outcome: 'CONFLICT',
        code: IDEMPOTENCY_KEY_CONFLICT,
      });
    });

    it('parmak izi kayıtlı değilse (NULL) tekrar sayılmaz → CONFLICT (güvenli taraf)', () => {
      expect(decideStageExpenseIdempotency({ requestFingerprint: null, status: 'PENDING' }, fingerprint)).toMatchObject({
        outcome: 'CONFLICT',
        code: IDEMPOTENCY_KEY_CONFLICT,
      });
    });

    it('aynı içerik ama iptal edilmiş talep → CANCELLED (anahtar yeniden kullanılmaz)', () => {
      expect(decideStageExpenseIdempotency({ requestFingerprint: fingerprint, status: 'CANCELLED' }, fingerprint)).toMatchObject({
        outcome: 'CANCELLED',
        code: IDEMPOTENCY_KEY_CANCELLED,
      });
    });
  });
});
