import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from './test-db-env';

/**
 * Test aktörünü bir dosyada MALİ YAZMA yetkili yapar (yalnız disposable test veritabanı).
 *
 * Due yazım uçları (POST / PATCH / DELETE /cases/:id/dues[/:dueId]) dosya düzeyi mali yazma yetkisi ister
 * (owner kararı 18.11.2026, K3): avukatta `CaseLawyer.casePermissions.canEditFinance`, personelde `canSeeFinance` +
 * `CaseStaff.canEdit`. Yalnız aynı büroda bulunmak ya da ADMIN rolü yetmez; kartsız hesap da yazamaz. Konusu yetki
 * OLMAYAN HTTP testleri, Due yazan aktörü bu yardımcıyla üretimdeki kuralın istediği duruma getirir: kartı yoksa
 * avukat kartı açılır, dosyaya atanır ve mali düzenleme izni verilir. Yetki kuralının kendisi
 * due-canonical-item-guard.http.db-gated.integration.spec.ts içinde sınanır.
 */
export async function ensureCaseFinanceWriter(db: PrismaClient, caseId: string, userId: string): Promise<void> {
  if (!resolveTestDatabaseUrl(process.env)) throw new Error('Finance writer fixture requires an explicit safe TEST_DATABASE_URL');
  const [user, parent] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, include: { lawyer: true, staffMember: true } }),
    db.case.findUniqueOrThrow({ where: { id: caseId }, select: { tenantId: true } }),
  ]);
  if (user.tenantId !== parent.tenantId) throw new Error('Finance writer fixture: actor and case must share one tenant');

  if (user.staffMember) {
    await db.staffMember.update({ where: { id: user.staffMember.id }, data: { canSeeFinance: true } });
    await db.caseStaff.upsert({
      where: { caseId_staffMemberId: { caseId, staffMemberId: user.staffMember.id } },
      update: { canEdit: true },
      create: { caseId, staffMemberId: user.staffMember.id, roleOnCase: 'MUHASEBE', canEdit: true },
    });
    return;
  }

  const lawyer =
    user.lawyer ??
    (await db.lawyer.create({ data: { tenantId: user.tenantId, userId, name: user.name, surname: user.surname ?? 'Test' } }));
  const assignment = await db.caseLawyer.findFirst({ where: { caseId, lawyerId: lawyer.id } });
  if (!assignment) {
    await db.caseLawyer.create({ data: { caseId, lawyerId: lawyer.id, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });
    return;
  }
  const current =
    assignment.casePermissions && typeof assignment.casePermissions === 'object' && !Array.isArray(assignment.casePermissions)
      ? (assignment.casePermissions as Record<string, unknown>)
      : {};
  if (current.canEditFinance !== true) {
    await db.caseLawyer.update({ where: { id: assignment.id }, data: { casePermissions: { ...current, canEditFinance: true } } });
  }
}
