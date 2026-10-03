/**
 * A2 (owner kararı 2026-10-03, seçenek b) — dosya avukat çekmecesi "Bu dosya için kaydet" payload'ı YALNIZ çekmece
 * açıldığından beri değişen alanları taşır. Sunucu (K2, #2821) casePermissions / canSign alanının gövdede
 * BULUNMASINA bakar; eski çekmece bu alanları her kayıtta gönderdiği için yönetim yetkisi olmayan kullanıcının
 * yalnız bildirim ya da rol değişikliği de 403 alıyordu. Sunucu kuralı değişmez.
 */

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { buildApiHttpError } from '@/lib/api-error';
import {
  buildCaseLawyerPatch,
  caseAssignmentSaveErrorMessage,
  CASE_PERMISSION_GRANT_FORBIDDEN,
  type CaseLawyerEditState,
} from '@/lib/case-lawyer-edit';
import { caseLawyerPermissionsForDisplay } from '@/lib/case-lawyer-permissions';

const { permissions: STORED } = caseLawyerPermissionsForDisplay(
  { canEditCase: true, canGenerateDocs: true, canSyncUYAP: false, canViewFinance: true, canEditFinance: false, canChangeStatus: false, canEditParties: false },
  true,
);
const INITIAL: CaseLawyerEditState = { caseRole: 'ASSIGNED', canSign: false, permissions: STORED };
const edit = (over: Partial<CaseLawyerEditState>, perms: Partial<CaseLawyerEditState['permissions']> = {}): CaseLawyerEditState => ({
  ...INITIAL,
  ...over,
  permissions: { ...INITIAL.permissions, ...perms },
});

describe('buildCaseLawyerPatch — yalnız değişen alanlar', () => {
  it('değişiklik yoksa payload boş (çağıran istek atmaz)', () => {
    expect(buildCaseLawyerPatch(INITIAL, edit({}))).toEqual({});
  });

  it('yalnız bildirim değişince gövdede yalnız receiveNotifications var; casePermissions / canSign / role YOK', () => {
    expect(buildCaseLawyerPatch(INITIAL, edit({}, { receivesNotifications: false }))).toEqual({ receiveNotifications: false });
  });

  it('yalnız rol değişince (yetkiler aynı) gövdede yalnız role var', () => {
    expect(buildCaseLawyerPatch(INITIAL, edit({ caseRole: 'ASSISTANT' }))).toEqual({ role: 'ASSISTANT' });
  });

  it('rol varsayılanı yetkileri değiştirdiyse bu bir yetki değişikliğidir: casePermissions de gönderilir', () => {
    const p = buildCaseLawyerPatch(INITIAL, edit({ caseRole: 'INTERN' }, { canEditCase: false }));
    expect(p.role).toBe('INTERN');
    expect(p.casePermissions).toMatchObject({ canEditCase: false, canGenerateDocs: true });
  });

  it('gerçekten değiştirilen yetki alanı tam yetki nesnesiyle gönderilir; bildirim değişmediyse ayrı alan gönderilmez', () => {
    const p = buildCaseLawyerPatch(INITIAL, edit({}, { canEditFinance: true }));
    expect(Object.keys(p)).toEqual(['casePermissions']);
    expect(p.casePermissions).toEqual({ ...STORED, canEditFinance: true });
  });

  it('imza yetkisi yalnız değişince gönderilir; tanımsız ile false aynı sayılır', () => {
    expect(buildCaseLawyerPatch(INITIAL, edit({ canSign: true }))).toEqual({ canSign: true });
    expect(buildCaseLawyerPatch({ ...INITIAL, canSign: undefined }, edit({ canSign: false }))).toEqual({});
  });

  it('değiştirilip eski hâline döndürülen yetki gönderilmez', () => {
    expect(buildCaseLawyerPatch(INITIAL, edit({}, { canEditCase: true }))).toEqual({});
  });

  it('hukuki sorumlu (RESPONSIBLE) rolü bu yoldan hiçbir durumda gönderilmez', () => {
    const responsible: CaseLawyerEditState = { ...INITIAL, caseRole: 'RESPONSIBLE' };
    expect(buildCaseLawyerPatch(responsible, { ...responsible })).toEqual({});
    expect(buildCaseLawyerPatch(responsible, { ...responsible, caseRole: 'ASSIGNED' })).not.toHaveProperty('role');
    expect(buildCaseLawyerPatch(INITIAL, edit({ caseRole: 'RESPONSIBLE' }))).not.toHaveProperty('role');
    expect(buildCaseLawyerPatch(responsible, { ...responsible, permissions: { ...STORED, receivesNotifications: false } })).toEqual({
      receiveNotifications: false,
    });
  });
});

describe('caseAssignmentSaveErrorMessage', () => {
  it('yetki verme reddi (CASE_PERMISSION_GRANT_FORBIDDEN) nedeniyle gösterilir', () => {
    // Hata nesnesi istemcinin gerçek kurucusuyla (api.request / apiClient ikisi de bunu kullanır) kurulur.
    const denied = buildApiHttpError({ code: CASE_PERMISSION_GRANT_FORBIDDEN, message: 'sunucu metni' }, 403);
    const msg = caseAssignmentSaveErrorMessage(denied, 'genel');
    expect(msg).toContain('yalnız ofis yönetimi');
    expect(msg).toContain('rol ve bildirim');
  });

  it('diğer hatalarda mevcut genel metin korunur', () => {
    expect(caseAssignmentSaveErrorMessage(buildApiHttpError({ code: 'VIEWER_WRITE_DENIED' }, 403), 'genel')).toBe('genel');
    expect(caseAssignmentSaveErrorMessage(new Error('ağ'), 'genel')).toBe('genel');
    expect(caseAssignmentSaveErrorMessage(null, 'genel')).toBe('genel');
  });
});

describe('avukat çekmecesi kaydı — sayfa bağlantısı (statik)', () => {
  const src = readFileSync('src/app/(dashboard)/cases/[id]/page.tsx', 'utf8');

  it('açılış anındaki rol / imza / yetki / bildirim saklanır', () => {
    expect(src).toContain('setLawyerEditInitial({ caseRole, canSign: le.canSign, permissions })');
  });

  it('kayıt yalnız farkı gönderir; değişiklik yoksa istek atılmaz; eski koşulsuz gövde kalmadı', () => {
    expect(src).toMatch(/const patch = buildCaseLawyerPatch\(lawyerEditInitial, \{\s*caseRole: selectedLawyer\.caseRole,\s*canSign: selectedLawyer\.canSign,\s*permissions: lawyerPermissions,\s*\}\);/);
    expect(src).toMatch(/if \(Object\.keys\(patch\)\.length === 0\) \{\s*setLawyerDrawerOpen\(false\);\s*return;/);
    expect(src).toContain('await api.updateCaseLawyer(caseData.id, selectedLawyer.caseLawyerId, patch);');
    expect(src).not.toContain('casePermissions: lawyerPermissions,');
    expect(src).not.toContain('receiveNotifications: lawyerPermissions.receivesNotifications,');
  });

  it('yetki verme reddi kullanıcıya nedeniyle gösterilir', () => {
    expect(src).toContain("caseAssignmentSaveErrorMessage(error, 'Yetki kaydetme başarısız')");
  });
});
