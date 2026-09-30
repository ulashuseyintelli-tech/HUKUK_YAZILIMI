import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { caseLawyerPermissionsForDisplay } from '@/lib/case-lawyer-permissions';

/**
 * K3 kararı A — dosya avukat yetkisi gösterimi sunucunun gerçek kararıyla aynı: yalnız dosyadaki casePermissions,
 * anahtar `true` değilse izin yok. Önceki gösterim boş yetkiyi büro varsayılanına / "tümü açık"a düşürüyordu.
 */
describe('caseLawyerPermissionsForDisplay', () => {
  it('yetki tanımlı değilse (null / boş / bozuk) HİÇBİR izin açık gösterilmez ve defined=false', () => {
    for (const stored of [null, undefined, {}, [], 'x']) {
      const { permissions, defined } = caseLawyerPermissionsForDisplay(stored, undefined);
      expect(defined).toBe(false);
      expect(permissions).toEqual({
        canEditCase: false,
        canGenerateDocs: false,
        canSyncUYAP: false,
        canViewFinance: false,
        canEditFinance: false,
        canChangeStatus: false,
        canEditParties: false,
        receivesNotifications: true,
      });
    }
  });

  it('dosyadaki değerler aynen; eksik ya da boolean olmayan anahtar izin VERMEZ (sunucu `=== true`)', () => {
    const { permissions, defined } = caseLawyerPermissionsForDisplay(
      { canEditFinance: true, canViewFinance: 'true', canEditCase: false },
      false,
    );
    expect(defined).toBe(true);
    expect(permissions).toMatchObject({ canEditFinance: true, canViewFinance: false, canEditCase: false, canSyncUYAP: false });
    expect(permissions.receivesNotifications).toBe(false);
  });

  it('dosya detayı çekmecesi büro varsayılanına ya da "tümü açık"a DÜŞMEZ (statik)', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../app/(dashboard)/cases/[id]/page.tsx'), 'utf8');
    expect(src).toContain('caseLawyerPermissionsForDisplay(');
    expect(src).not.toMatch(/lawyerDefaultPermissions\?\.canEditFinance \?\? true/);
    expect(src).not.toContain('varsayılan olarak tümü açık');
  });
});
