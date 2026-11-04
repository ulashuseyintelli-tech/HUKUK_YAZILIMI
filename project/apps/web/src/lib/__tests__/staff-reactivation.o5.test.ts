import { describe, it, expect } from 'vitest';
import {
  buildStaffReactivationPayload,
  caseImpactNotice,
  classifyStaffReactivationFailure,
  linkedAccountNotice,
  reactivationResultMessage,
  readStaffReactivationReview,
  STAFF_REACTIVATION_FIELDS,
} from '../staff-reactivation';

/**
 * O-5 (owner 05.11.2026, C politikası) — pasif personel gözden geçirmesi: okuma, gövde ve metinler.
 * Metinler sunucunun gerçek davranışını söyler: create yazım yapmaz; yeniden etkinleştirme giriş hesabını açmaz.
 */
const REVIEW_BODY = {
  statusCode: 409,
  code: 'STAFF_REACTIVATION_REVIEW',
  message: 'Bu TCKN veya e-posta ile pasif bir personel kaydı var. …',
  staff: {
    id: 's-pasif', firstName: 'Ayşe', lastName: 'Personel', staffType: 'MUHASEBE',
    canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
    canSeeFinance: true, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
    isDefaultForNewCases: true,
    linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 2, responsibleCaseCount: 1,
  },
};

describe('O-5 readStaffReactivationReview', () => {
  it('sunucu gövdesini okur: kartın MEVCUT izinleri + gerçek etki', () => {
    const r = readStaffReactivationReview(REVIEW_BODY);
    expect(r).toEqual({
      staffId: 's-pasif', name: 'Ayşe Personel',
      values: {
        staffType: 'MUHASEBE', canCreateCase: true, canEditCase: false, canGenerateDocuments: false, canApproveDocuments: true,
        canSeeFinance: true, canApproveFinance: false, canPrepareCollectionDisposition: true, canSendNotifications: false,
        isDefaultForNewCases: true,
      },
      linkedAccount: { exists: true, isActive: false }, caseAssignmentCount: 2, responsibleCaseCount: 1,
    });
  });

  it.each([
    ['başka kod', { ...REVIEW_BODY, code: 'SIMILAR_NAME_REVIEW' }],
    ['staff yok', { ...REVIEW_BODY, staff: undefined }],
    ['izin alanı eksik', { ...REVIEW_BODY, staff: { ...REVIEW_BODY.staff, canSeeFinance: undefined } }],
    ['izin tipi bozuk', { ...REVIEW_BODY, staff: { ...REVIEW_BODY.staff, isDefaultForNewCases: 'true' } }],
    ['hesap durumu yok', { ...REVIEW_BODY, staff: { ...REVIEW_BODY.staff, linkedAccount: undefined } }],
    ['sayaç bozuk', { ...REVIEW_BODY, staff: { ...REVIEW_BODY.staff, caseAssignmentCount: -1 } }],
    ['gövde yok', null],
  ])('%s → null (eksik bilgiyle izin ekranı açılmaz)', (_ad, body) => {
    expect(readStaffReactivationReview(body)).toBeNull();
  });
});

describe('O-5 buildStaffReactivationPayload', () => {
  it('bütün alanları AÇIKÇA gönderir; fazladan anahtar gitmez', () => {
    const r = readStaffReactivationReview(REVIEW_BODY)!;
    const p = buildStaffReactivationPayload({ ...r.values, extra: 'x' } as any);
    expect(Object.keys(p).sort()).toEqual([...STAFF_REACTIVATION_FIELDS].sort());
    expect(p).toEqual(r.values);
  });
});

describe('O-5 metinler', () => {
  it('kapalı hesap: giriş erişimi açılmaz; hesap / rol / büro geneli izin değişmez', () => {
    expect(linkedAccountNotice({ exists: true, isActive: false })).toMatch(/KAPALI.*değiştirmez; personel giriş yapamaz/);
    expect(linkedAccountNotice({ exists: false, isActive: false })).toMatch(/bağlı giriş hesabı yok.*giriş hesabı açmaz/);
    expect(linkedAccountNotice({ exists: true, isActive: true })).toMatch(/açık.*değiştirmez/);
  });

  it('dosya atamaları ve sorumluluk yeniden etkili olur', () => {
    expect(caseImpactNotice({ caseAssignmentCount: 2, responsibleCaseCount: 1 })).toEqual([
      'Kartın 2 dosya ataması var; yeniden etkinleştirilirse bu atamalar yeniden etkili olur.',
      'Personel 1 dosyada dosya sorumlusu olarak kayıtlı; bu kayıtlar da yeniden etkili olur.',
    ]);
    expect(caseImpactNotice({ caseAssignmentCount: 0, responsibleCaseCount: 0 })).toEqual(['Kartın dosya ataması yok.']);
  });

  it('sonuç mesajı yanıttaki GERÇEK hesap durumunu söyler', () => {
    expect(reactivationResultMessage({ linkedAccount: { exists: true, isActive: false } })).toBe(
      'Personel yeniden etkinleştirildi. Bağlı giriş hesabı kapalı kaldı; giriş erişimi açılmadı.',
    );
    expect(reactivationResultMessage({ linkedAccount: { exists: false, isActive: false } })).toContain('giriş erişimi açılmadı');
    expect(reactivationResultMessage({ linkedAccount: { exists: true, isActive: true } })).toContain('zaten açıktı');
    expect(reactivationResultMessage({})).toContain('durumu okunamadı');
  });

  it('hata sınıfları: yarış, zaten etkin, kimlik çakışması, yetki, bilinmeyen', () => {
    expect(classifyStaffReactivationFailure({ status: 409, body: { code: 'STAFF_REACTIVATION_CONFLICT' } })).toMatch(/uygulanmadı/);
    expect(classifyStaffReactivationFailure({ status: 409, body: { code: 'STAFF_ALREADY_ACTIVE' } })).toBe('Personel zaten etkin; yeniden etkinleştirme yapılmadı.');
    expect(classifyStaffReactivationFailure({ status: 409, body: { code: 'DUPLICATE_IDENTITY', message: 'X ile çakışıyor' } })).toBe('X ile çakışıyor');
    expect(classifyStaffReactivationFailure({ status: 403, body: { message: 'OFFICE_F01_AUTHORIZATION_REQUIRED' } })).toMatch(/yetkisi gerekir/);
    expect(classifyStaffReactivationFailure(new Error('ağ'))).toMatch(/doğrulanamadı/);
  });
});
