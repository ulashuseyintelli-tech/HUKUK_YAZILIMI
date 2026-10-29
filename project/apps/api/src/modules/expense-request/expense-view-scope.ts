import { Prisma } from '@prisma/client';

/**
 * F02-B dilim 2 (owner kararı 29–30.10.2026, geçiş G3 "önce masraf"): masraf talebi LİSTE ve İSTATİSTİK görünüm kapsamı.
 *
 * Etkinleştirme bayrağı — depodaki env-bayrak konvansiyonu (bkz. EXPENSE_REMAINING_GATE_ENABLED). Varsayılan KAPALI:
 * liste/istatistik bugünkü gibi büro genelidir. Owner kararı: "kapsam etkinleştirmesi ayrı yayın yetkisine bağlıdır;
 * geliştirme, test, PR/CI/merge mevcut yetkiyle sürsün" — bayrak bu ayrımı taşır; canlıda açılması ayrı yayın kararıdır
 * (önce büro geneli erişimi gerekenlere `office.expenses.view_all` izni ürün ekranından tanımlanır; ADMIN/PARTNER'a
 * otomatik toplu grant YOK).
 */
export const EXPENSE_VIEW_SCOPE_FLAG = 'OFFICE_EXPENSE_VIEW_SCOPE_ENABLED';

/** F02-B-1 (#3047) anahtarı — WorkScopePermissionService.resolve() ile çözülür (DENY > ALLOW > NONE). */
export const EXPENSE_VIEW_ALL_KEY = 'office.expenses.view_all' as const;

export type ExpenseViewResolution = 'ALLOW' | 'DENY' | 'NONE';

export function isExpenseViewScopeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[EXPENSE_VIEW_SCOPE_FLAG]?.toLowerCase() === 'true';
}

/**
 * Varsayılan kapsam (view_all ALLOW yokken): aktörün OLUŞTURDUĞU ya da ONAYLADIĞI talepler ∪ aktörün CaseLawyer ya da
 * CaseStaff(canView) olduğu dosyaların talepleri (K16 "dosya bağı" türetimiyle aynı: aktif kart + aktif hesap, aynı büro).
 * Masraf talebi her zaman dosyaya bağlıdır (ExpenseRequest.caseId zorunlu) → "dosyasız kayıt" kuralı burada uygulanmaz.
 * Rol (ADMIN/PARTNER), rütbe, ReportingLine ve müvekkil ilişkisi kapsam ÜRETMEZ. Kapsam yalnız DARALTIR; büro (tenant)
 * sınırı çağıranın `where.tenantId`'siyle ayrıca korunur.
 */
export function expenseViewScopeWhere(tenantId: string, actorUserId: string): Prisma.ExpenseRequestWhereInput {
  const activeAccount = { id: actorUserId, tenantId, isActive: true };
  return {
    OR: [
      { createdById: actorUserId },
      { approvedById: actorUserId },
      {
        case: {
          tenantId,
          OR: [
            { lawyers: { some: { lawyer: { tenantId, isActive: true, user: activeAccount } } } },
            { staff: { some: { canView: true, staffMember: { tenantId, isActive: true, user: activeAccount } } } },
          ],
        },
      },
    ],
  };
}

/** ALLOW (DENY yoksa) → büro geneli (kapsam YOK → null). DENY ya da NONE → varsayılan kapsam. */
export function expenseViewWhereFor(
  resolution: ExpenseViewResolution,
  tenantId: string,
  actorUserId: string,
): Prisma.ExpenseRequestWhereInput | null {
  return resolution === 'ALLOW' ? null : expenseViewScopeWhere(tenantId, actorUserId);
}
