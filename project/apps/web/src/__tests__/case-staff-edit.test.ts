/**
 * PR-ASSIGN-3b — case-staff-edit saf testleri (frontend-only, UI YOK).
 *
 * Drawer'ı CaseStaff modeline hizalar: canSign + permissions{5} KALDIRILDI, canEdit/canApprove/canView
 * KULLANILIYOR. PATCH payload yalnız CaseStaff alanlarını taşır (backend PR-ASSIGN-3a whitelist'iyle uyumlu).
 *
 * A2 (owner kararı 2026-10-03, seçenek b): payload YALNIZ çekmece açıldığından beri değişen alanları taşır.
 * Sunucu (K2) yetki alanının gövdede bulunmasına baktığı için değişmeyen yetki alanı gönderilmez.
 */

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { caseStaffEditFields, buildCaseStaffPatch } from '../lib/case-staff-edit';

const INITIAL = caseStaffEditFields({
  roleOnCase: 'SORUMLU',
  canEdit: false,
  canApprove: false,
  canView: true,
  receiveNotifications: true,
});

describe('PR-ASSIGN-3b case-staff-edit — drawer ↔ CaseStaff hizalama', () => {
  it('(a) CaseStaff row → düzenleme alanları (canEdit/canApprove/canView) maplenir', () => {
    expect(
      caseStaffEditFields({
        roleOnCase: 'SORUMLU',
        canEdit: true,
        canApprove: false,
        canView: true,
        receiveNotifications: false,
      }),
    ).toEqual({
      roleOnCase: 'SORUMLU',
      canEdit: true,
      canApprove: false,
      canView: true,
      receiveNotifications: false,
    });
  });

  it("(a) eksik alanlar CaseStaff default'larına düşer (canView=true, diğerleri false, receive=true)", () => {
    expect(caseStaffEditFields({})).toEqual({
      roleOnCase: '',
      canEdit: false,
      canApprove: false,
      canView: true,
      receiveNotifications: true,
    });
  });
});

describe('A2 buildCaseStaffPatch — yalnız değişen alanlar', () => {
  it('(b) değişiklik yoksa payload boş (çağıran istek atmaz)', () => {
    expect(buildCaseStaffPatch(INITIAL, { ...INITIAL })).toEqual({});
  });

  it('(c) yalnız rol değişince gövdede yalnız roleOnCase var; yetki alanı (canEdit/canApprove/canView) YOK', () => {
    const p = buildCaseStaffPatch(INITIAL, { ...INITIAL, roleOnCase: 'TAKIPCI' });
    expect(p).toEqual({ roleOnCase: 'TAKIPCI' });
  });

  it('(c) yalnız bildirim değişince gövdede yalnız receiveNotifications var', () => {
    const p = buildCaseStaffPatch(INITIAL, { ...INITIAL, receiveNotifications: false });
    expect(p).toEqual({ receiveNotifications: false });
  });

  it('(d) gerçekten değiştirilen yetki alanı gönderilir (sunucu yönetim yetkisi ister); değişmeyenler gönderilmez', () => {
    expect(buildCaseStaffPatch(INITIAL, { ...INITIAL, canEdit: true })).toEqual({ canEdit: true });
    expect(buildCaseStaffPatch(INITIAL, { ...INITIAL, canView: false, roleOnCase: 'YARDIMCI' })).toEqual({
      canView: false,
      roleOnCase: 'YARDIMCI',
    });
  });

  it('(e) değiştirilip eski hâline döndürülen alan gönderilmez', () => {
    const toggledTwice = { ...INITIAL, canApprove: !!INITIAL.canApprove };
    expect(buildCaseStaffPatch(INITIAL, toggledTwice)).toEqual({});
  });

  it('(f) rol "Belirtilmemiş"e çekilirse boş metin gönderilir; tanımsız güncel rol boş metin sayılır', () => {
    expect(buildCaseStaffPatch(INITIAL, { ...INITIAL, roleOnCase: '' })).toEqual({ roleOnCase: '' });
    const noRole = caseStaffEditFields({});
    expect(buildCaseStaffPatch(noRole, { ...noRole, roleOnCase: undefined })).toEqual({});
  });

  it("(g) payload'da canSign ve permissions hiçbir durumda YOK", () => {
    const p = buildCaseStaffPatch(INITIAL, {
      roleOnCase: 'X',
      canEdit: true,
      canApprove: true,
      canView: false,
      receiveNotifications: false,
      canSign: true,
      permissions: { canEditCase: true },
    } as any);
    expect(p).not.toHaveProperty('canSign');
    expect(p).not.toHaveProperty('permissions');
    expect(Object.keys(p).sort()).toEqual(['canApprove', 'canEdit', 'canView', 'receiveNotifications', 'roleOnCase']);
  });
});

describe('A2 personel çekmecesi kaydı — sayfa bağlantısı (statik)', () => {
  const src = readFileSync('src/app/(dashboard)/cases/[id]/page.tsx', 'utf8');

  it('açılış anındaki alanlar saklanır ve kayıtta yalnız farkı gönderilir; değişiklik yoksa istek atılmaz', () => {
    expect(src).toContain('setStaffEditInitial(staffEditFields)');
    expect(src).toContain('buildCaseStaffPatch(staffEditInitial, selectedStaff)');
    expect(src).not.toContain('buildCaseStaffPatch(selectedStaff)');
    expect(src).toMatch(/const patch = buildCaseStaffPatch\(staffEditInitial, selectedStaff\);\s*if \(Object\.keys\(patch\)\.length === 0\) \{\s*setStaffDrawerOpen\(false\);\s*return;/);
    expect(src).toContain('/staff/${selectedStaff.caseStaffId}`, patch)');
  });

  it('yetki verme reddi kullanıcıya nedeniyle gösterilir', () => {
    expect(src).toContain("caseAssignmentSaveErrorMessage(error, 'Personel bilgileri güncellenemedi')");
  });
});
