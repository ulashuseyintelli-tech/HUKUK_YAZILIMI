import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
  return {
    OR: [{ createdById: actorUserId }, { approvedById: actorUserId }, { case: expenseCaseLinkWhere(tenantId, actorUserId) }],
  };
}

/**
 * Varsayılan kapsamın DOSYA BAĞI dalı (yukarıdaki kuralın bir parçası; yeni kural değildir): aktörün CaseLawyer ya da
 * CaseStaff(canView) olduğu dosyalar. Bu dalda aktör dosyanın BÜTÜN masraf taleplerini görür.
 * F02 P3 tarama S2 (owner kararı 09.11.2026): dosyanın masraf ÖZETİ / kapı durumu gibi dosyanın bütün taleplerinden üretilen
 * okumalar bu dalı (ya da büro geneli izni) ister — aktörün yalnız kendi oluşturduğu / onayladığı talepleri görmesi dosyanın
 * bütününü görmesi demek değildir; eksik taleplerle özet üretilmez.
 */
export function expenseCaseLinkWhere(tenantId: string, actorUserId: string): Prisma.CaseWhereInput {
  const activeAccount = { id: actorUserId, tenantId, isActive: true };
  return {
    tenantId,
    OR: [
      { lawyers: { some: { lawyer: { tenantId, isActive: true, user: activeAccount } } } },
      { staff: { some: { canView: true, staffMember: { tenantId, isActive: true, user: activeAccount } } } },
    ],
  };
}

/** `WorkScopePermissionService.resolve` sözleşmesinin burada kullanılan kısmı (modül bağımlılığı doğurmamak için yapısal tip). */
export interface ExpenseViewScopeResolver {
  resolve(db: unknown, tenantId: string, userId: string, permissionKey: string): Promise<ExpenseViewResolution>;
}
type CaseLinkReader = { case: { findFirst(args: { where: Prisma.CaseWhereInput; select: { id: true } }): Promise<{ id: string } | null> } };

/**
 * F02 P3 tarama S2 (owner kararı 09.11.2026) — dosyanın BÜTÜN masraf taleplerinden üretilen okumaların kapısı (özet, ayrıntı,
 * üç görünüm, finans kalemleri, açılış durumu, masraf kapısı, engel nedenleri): aktör büro geneli izinli ya da dosyaya bağlı
 * (kapsamın dosya bağı dalı) olmalı. Yalnız kendi oluşturduğu / onayladığı talepleri gören aktör dosyanın bütününü görmez →
 * var olmayan dosyayla AYNI 404 (eksik taleplerle özet üretilmez). Bayrak kapalı → geçer (ek sorgu yok). Bayrak açık + aktör
 * ya da çözücü yok → 403 (fail-closed; liste kapsamıyla aynı gövde). Onaylama yetkisi büro geneli görüntüleme izni SAYILMAZ:
 * yalnız `office.expenses.view_all` ALLOW büro genelidir.
 */
export async function assertCaseExpensesVisible(
  db: CaseLinkReader,
  resolver: ExpenseViewScopeResolver | undefined,
  tenantId: string,
  caseId: unknown,
  actorUserId: string | undefined,
): Promise<void> {
  if (!isExpenseViewScopeEnabled()) return;
  if (!actorUserId || !resolver) {
    throw new ForbiddenException({ code: 'EXPENSE_VIEW_SCOPE_UNRESOLVED', message: 'Masraf görünüm kapsamı çözümlenemedi' });
  }
  if ((await resolver.resolve(db, tenantId, actorUserId, EXPENSE_VIEW_ALL_KEY)) === 'ALLOW') return;
  const linked =
    typeof caseId === 'string' && caseId
      ? await db.case.findFirst({ where: { id: caseId, AND: [expenseCaseLinkWhere(tenantId, actorUserId)] }, select: { id: true } })
      : null;
  if (!linked) throw new NotFoundException('Takip bulunamadı');
}

/** ALLOW (DENY yoksa) → büro geneli (kapsam YOK → null). DENY ya da NONE → varsayılan kapsam. */
export function expenseViewWhereFor(
  resolution: ExpenseViewResolution,
  tenantId: string,
  actorUserId: string,
): Prisma.ExpenseRequestWhereInput | null {
  return resolution === 'ALLOW' ? null : expenseViewScopeWhere(tenantId, actorUserId);
}
