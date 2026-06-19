/**
 * PR-ASSIGN-3b — case-staff-edit saf testleri (frontend-only, UI YOK).
 *
 * Drawer'ı CaseStaff modeline hizalar: canSign + permissions{5} KALDIRILDI, canEdit/canApprove/canView
 * KULLANILIYOR. PATCH payload yalnız CaseStaff alanlarını taşır (backend PR-ASSIGN-3a whitelist'iyle uyumlu).
 */

import { describe, it, expect } from 'vitest';
import { caseStaffEditFields, buildCaseStaffPatch } from '../lib/case-staff-edit';

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

  it('(b) selectedStaff → PATCH payload (roleOnCase + canEdit/canApprove/canView + receiveNotifications)', () => {
    expect(
      buildCaseStaffPatch({
        roleOnCase: 'YARDIMCI',
        canEdit: true,
        canApprove: true,
        canView: false,
        receiveNotifications: true,
      }),
    ).toEqual({
      roleOnCase: 'YARDIMCI',
      canEdit: true,
      canApprove: true,
      canView: false,
      receiveNotifications: true,
    });
  });

  it("(c) payload'da canSign ve permissions YOK", () => {
    const p = buildCaseStaffPatch({
      roleOnCase: 'X',
      canEdit: true,
      canApprove: false,
      canView: true,
      receiveNotifications: true,
    } as any);
    expect(p).not.toHaveProperty('canSign');
    expect(p).not.toHaveProperty('permissions');
    expect(Object.keys(p).sort()).toEqual([
      'canApprove',
      'canEdit',
      'canView',
      'receiveNotifications',
      'roleOnCase',
    ]);
  });

  it('(d) roleOnCase + receiveNotifications korunur', () => {
    const p = buildCaseStaffPatch({ roleOnCase: 'TAKIPCI', receiveNotifications: false });
    expect(p.roleOnCase).toBe('TAKIPCI');
    expect(p.receiveNotifications).toBe(false);
  });
});
